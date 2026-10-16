// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Download seam: one Fetcher interface, a browser implementation (direct, CORS) and a server implementation
// (POST /api/fetch). Core code only ever talks to the interface, so tests use an in-memory fetcher.
import { isAllowedHost } from '../../../config/hosts';
import type { Finding } from '../types';
import { makeFinding } from '../rules/registry';

export interface FetchResult {
  status: number;
  bytes: Uint8Array;
  contentType?: string;
  finalUrl: string;
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

async function readBody(res: Response, host: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    if (e instanceof TypeError) throw new FetchBlockedError(host);
    throw e;
  }
}

/** Direct download from the page. `fetchImpl` exists for tests; the default is the global fetch. */
export function browserFetcher(fetchImpl: FetchFn = globalFetch): Fetcher {
  return {
    async get(url, accept) {
      const host = hostOf(url);
      if (!isAllowedHost(url)) throw new HostNotAllowedError(host);
      let res: Response;
      try {
        res = await fetchImpl(url, {
          credentials: 'omit',
          redirect: 'follow',
          mode: 'cors',
          ...(accept ? { headers: { Accept: accept } } : {}),
        });
      } catch (e) {
        if (e instanceof TypeError) throw new FetchBlockedError(host);
        throw e;
      }
      // CSP would stop a hop to a foreign host anyway; be explicit about it.
      const finalUrl = res.url || url;
      if (!isAllowedHost(finalUrl)) throw new HostNotAllowedError(hostOf(finalUrl));
      const bytes = await readBody(res, host);
      return { status: res.status, bytes, contentType: res.headers.get('content-type') ?? undefined, finalUrl };
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
        throw new ProxyFetchError(proxyError, res.status, host);
      }
      const bytes = await readBody(res, host);
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
  if (err instanceof HostNotAllowedError) return makeFinding('IN-HOST-NOT-ALLOWED', { file, params: { host: err.host } });
  if (err instanceof ProxyFetchError || err instanceof FileFetchError) {
    return makeFinding('IN-RECORD-INACCESSIBLE', { file, params: { status: err.status, host: err.host } });
  }
  return undefined;
}
