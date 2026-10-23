// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Download seam: one Fetcher interface, a browser implementation (direct, CORS) and a server implementation
// (POST /api/fetch). Core code only ever talks to the interface, so tests use an in-memory fetcher.
import { isAllowedHost } from '../../../config/hosts';
import { IPT_MAX_BYTES, isArchiveUrl, isIptHost } from '../../../config/ipt';
import type { Finding } from '../types';
import { makeFinding } from '../rules/registry';

export interface FetchResult {
  status: number;
  bytes: Uint8Array;
  contentType?: string;
  finalUrl: string;
  /** Pacing headers the host lets the page read (lower-case names: retry-after, x-ratelimit-remaining, x-ratelimit-reset), when present. */
  headers?: Record<string, string>;
}
export interface Fetcher {
  get(url: string, accept?: string): Promise<FetchResult>;
}

/** CORS, CSP or network failure in the browser (or an unreachable proxy). Carries the host only. */
export class FetchBlockedError extends Error {
  readonly host: string;
  constructor(host: string) {
    super(`Download from ${host} was blocked`);
    this.name = 'FetchBlockedError';
    this.host = host;
  }
}

/** The host did not answer within the time the browser mode waits. Carries the host only. */
export class FetchTimeoutError extends Error {
  readonly host: string;
  constructor(host: string) {
    super(`Download from ${host} timed out`);
    this.name = 'FetchTimeoutError';
    this.host = host;
  }
}

/**
 * A download from a listed IPT server that started but did not finish: the server mode proxy gave up after its archive
 * time limit, or the connection was cut while the body was arriving. Never a "blocked" (CORS fails before the body).
 */
export class FetchInterruptedError extends Error {
  readonly host: string;
  constructor(host: string) {
    super(`Download from ${host} was interrupted`);
    this.name = 'FetchInterruptedError';
    this.host = host;
  }
}

/** The proxy refused an archive above its size limit. Carries the host only. */
export class ArchiveTooLargeError extends Error {
  readonly host: string;
  constructor(host: string) {
    super(`Archive from ${host} is too large`);
    this.name = 'ArchiveTooLargeError';
    this.host = host;
  }
}

/** The proxy's X-Fetch-Proxy-Error for a spent daily archive budget (server/rateLimit.ts ARCHIVE_BUDGET_CODE). */
export const ARCHIVE_BUDGET_ERROR = 'archive_daily_budget';

/** This IP address has used up the proxy's daily budget for archive downloads. Carries the host only. */
export class ArchiveBudgetError extends Error {
  readonly host: string;
  constructor(host: string) {
    super(`Daily archive budget used up (${host})`);
    this.name = 'ArchiveBudgetError';
    this.host = host;
  }
}

/** How long browser mode waits for a host to start answering (server mode: the proxy's own 20 s upstream limit plus the hop). */
export const BROWSER_TIMEOUT_MS = 30_000;

/** The host is not on the allowlist (config/hosts.ts). Carries the host only. */
export class HostNotAllowedError extends Error {
  readonly host: string;
  constructor(host: string) {
    super(`Host ${host} is not allowed`);
    this.name = 'HostNotAllowedError';
    this.host = host;
  }
}

/** The fetch proxy itself refused or failed (rate limit, timeout, size limit, …); upstream statuses are NOT errors. */
export class ProxyFetchError extends Error {
  readonly code: string;
  readonly status: number;
  readonly host: string;
  constructor(code: string, status: number, host: string) {
    super(`Fetch proxy error ${code} (HTTP ${status}) for ${host}`);
    this.name = 'ProxyFetchError';
    this.code = code;
    this.status = status;
    this.host = host;
  }
}

/** A data file answered with a non-2xx status. */
export class FileFetchError extends Error {
  readonly status: number;
  readonly host: string;
  constructor(status: number, host: string) {
    super(`Download from ${host} failed with HTTP ${status}`);
    this.name = 'FileFetchError';
    this.status = status;
    this.host = host;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
const globalFetch: FetchFn = (input, init) => globalThis.fetch(input, init);

/**
 * `capBytes`: the size at which the server mode proxy cuts a body that had no Content-Length. It cannot say so (the headers are
 * out), so a body that breaks off within CAP_SLACK_BYTES below that size (the proxy forwards whole network chunks, a few tens of
 * KB each) is "too large", not "interrupted, try again".
 */
const CAP_SLACK_BYTES = 1024 * 1024;

async function readBody(res: Response, host: string, capBytes?: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    if (!res.body) return new Uint8Array(await res.arrayBuffer());
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
    }
  } catch (e) {
    if (capBytes !== undefined && received >= capBytes - CAP_SLACK_BYTES) throw new ArchiveTooLargeError(host);
    // A body that breaks off half way is an interruption; at an IPT it is said so (the headers, hence CORS, were fine).
    if (e instanceof TypeError) throw isIptHost(host) ? new FetchInterruptedError(host) : new FetchBlockedError(host);
    throw e;
  }
  const out = new Uint8Array(received);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * Direct download from the page. `fetchImpl` exists for tests; the default is the global fetch. A host that has not started to
 * answer after `timeoutMs` is a FetchTimeoutError (the wait ends with the response headers: a large body that keeps arriving is not cut).
 */
export function browserFetcher(fetchImpl: FetchFn = globalFetch, timeoutMs: number = BROWSER_TIMEOUT_MS): Fetcher {
  return {
    async get(url, accept) {
      const host = hostOf(url);
      if (!isAllowedHost(url)) throw new HostNotAllowedError(host);
      let res: Response;
      const ctl = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expired = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctl.abort();
          reject(new FetchTimeoutError(host));
        }, timeoutMs);
      });
      try {
        const answer = fetchImpl(url, {
          credentials: 'omit',
          redirect: 'follow',
          mode: 'cors',
          signal: ctl.signal,
          ...(accept ? { headers: { Accept: accept } } : {}),
        });
        answer.catch(() => undefined); // after a timeout the abandoned request may still fail: that is not news
        res = await Promise.race([answer, expired]);
      } catch (e) {
        if (e instanceof FetchTimeoutError) throw e;
        if (e instanceof TypeError) throw new FetchBlockedError(host);
        throw e;
      } finally {
        clearTimeout(timer);
      }
      // CSP would stop a hop to a foreign host anyway; be explicit about it.
      const finalUrl = res.url || url;
      if (!isAllowedHost(finalUrl)) throw new HostNotAllowedError(hostOf(finalUrl));
      const bytes = await readBody(res, host);
      const headers: Record<string, string> = {};
      for (const name of ['retry-after', 'x-ratelimit-remaining', 'x-ratelimit-reset']) {
        const v = res.headers.get(name);
        if (v !== null) headers[name] = v;
      }
      return { status: res.status, bytes, contentType: res.headers.get('content-type') ?? undefined, finalUrl, ...(Object.keys(headers).length > 0 ? { headers } : {}) };
    },
  };
}

/**
 * Download through POST /api/fetch ({ url, accept } in a JSON body, never in the query string).
 * The proxy hides redirect hops, so finalUrl is the requested URL.
 */
export function serverFetcher(endpoint = '/api/fetch', fetchImpl: FetchFn = globalFetch): Fetcher {
  return {
    async get(url, accept) {
      const host = hostOf(url);
      if (!isAllowedHost(url)) throw new HostNotAllowedError(host);
      let res: Response;
      try {
        res = await fetchImpl(endpoint, {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(accept ? { url, accept } : { url }),
        });
      } catch (e) {
        if (e instanceof TypeError) throw new FetchBlockedError(host);
        throw e;
      }
      const proxyError = res.headers.get('x-fetch-proxy-error');
      if (proxyError) {
        if (proxyError === 'host_not_allowed') throw new HostNotAllowedError(host);
        if (isArchiveUrl(url) && proxyError === 'timeout') throw new FetchInterruptedError(host);
        if (isArchiveUrl(url) && proxyError === 'too_large') throw new ArchiveTooLargeError(host);
        if (proxyError === ARCHIVE_BUDGET_ERROR) throw new ArchiveBudgetError(host);
        throw new ProxyFetchError(proxyError, res.status, host);
      }
      const bytes = await readBody(res, host, isArchiveUrl(url) ? IPT_MAX_BYTES : undefined);
      // The proxy always answers application/octet-stream; the origin's own type is in X-Upstream-Content-Type.
      return { status: res.status, bytes, contentType: res.headers.get('x-upstream-content-type') ?? undefined, finalUrl: url };
    },
  };
}

/**
 * Turns a download error into the input finding the user should see (host only, never a URL).
 * Returns undefined for errors that are not download failures, so callers can rethrow them.
 */
export function fetchErrorFinding(err: unknown, file: string): Finding | undefined {
  if (err instanceof FetchBlockedError) return makeFinding('IN-FETCH-BLOCKED', { file, params: { host: err.host } });
  if (err instanceof FetchTimeoutError) return makeFinding('IN-FETCH-TIMEOUT', { file, params: { host: err.host } });
  if (err instanceof FetchInterruptedError) return makeFinding('IN-FETCH-INTERRUPTED', { file, params: { host: err.host } });
  if (err instanceof ArchiveTooLargeError) return makeFinding('IN-ARCHIVE-TOO-LARGE', { file, params: { host: err.host, mb: Math.round(IPT_MAX_BYTES / 1024 / 1024) } });
  if (err instanceof ArchiveBudgetError) return makeFinding('IN-ARCHIVE-DAILY-BUDGET', { file, params: { host: err.host } });
  if (err instanceof HostNotAllowedError) return makeFinding('IN-HOST-NOT-ALLOWED', { file, params: { host: err.host } });
  if (err instanceof ProxyFetchError || err instanceof FileFetchError) {
    return makeFinding('IN-RECORD-INACCESSIBLE', { file, params: { status: err.status, host: err.host } });
  }
  return undefined;
}
