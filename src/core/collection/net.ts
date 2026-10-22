// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The engine's way to the network: one Net (direct GET for DataCite and Zenodo, POST /api/csw for catalogues), pacing per host, and
// ONE retry policy. 429 and 503 (DataCite's "queue full" is an HTML 503) back off; network failures and 5xx are retried a few times;
// whatever is left is a SourceFailure the run turns into a deferred page. Never into a licence or metadata finding.
import { FetchBlockedError, FetchTimeoutError, HostNotAllowedError, browserFetcher, type Fetcher } from '../sources/fetcher';
import { SourceFailure } from './types';

export interface NetResponse {
  status: number;
  text: string;
  /** Retry-After in ms where the page can read it (Zenodo, /api/csw; DataCite does not expose it). */
  retryAfterMs?: number;
  /** Zenodo: X-RateLimit-Remaining. */
  rateRemaining?: number;
  /** The proxy's own refusal code (X-Fetch-Proxy-Error), /api/csw only. */
  proxyError?: string;
}

export interface CswCall {
  catalogue: string;
  op: 'GetCapabilities' | 'GetRecords';
  startPosition?: number;
  maxRecords?: number;
  schema?: 'iso19139' | 'iso19115-3';
}

export interface Net {
  get(url: string, accept: string): Promise<NetResponse>;
  csw(call: CswCall): Promise<NetResponse>;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** Retry-After: whole seconds or an HTTP date; anything else is unreadable. */
export function parseRetryAfter(v: string | null | undefined, now: number = Date.now()): number | undefined {
  if (v === null || v === undefined) return undefined;
  const t = v.trim();
  if (/^\d{1,6}$/.test(t)) return Number(t) * 1000;
  const when = Date.parse(t);
  return Number.isNaN(when) ? undefined : Math.max(0, when - now);
}

const decode = (b: Uint8Array): string => new TextDecoder('utf-8').decode(b);

/** Direct download from the page (browser mode, CORS): the allowlisted hosts of config/hosts.ts only. */
export function browserNet(fetcher: Fetcher = browserFetcher(), cswNet: Net['csw'] = serverCsw()): Net {
  return {
    async get(url, accept) {
      const r = await fetcher.get(url, accept);
      const remaining = r.headers?.['x-ratelimit-remaining'];
      return {
        status: r.status,
        text: decode(r.bytes),
        retryAfterMs: parseRetryAfter(r.headers?.['retry-after']),
        ...(remaining !== undefined && /^\d+$/.test(remaining) ? { rateRemaining: Number(remaining) } : {}),
      };
    },
    csw: cswNet,
  };
}

/** POST /api/csw ({ catalogue, op, startPosition, maxRecords, schema } in the JSON body, never in the address). */
export function serverCsw(endpoint = '/api/csw', fetchImpl: FetchFn = (i, n) => globalThis.fetch(i, n)): Net['csw'] {
  return async (call) => {
    let res: Response;
    try {
      res = await fetchImpl(endpoint, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(call) });
    } catch (e) {
      if (e instanceof TypeError) throw new FetchBlockedError('this site');
      throw e;
    }
    const text = decode(new Uint8Array(await res.arrayBuffer()));
    return {
      status: res.status,
      text,
      retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
      ...(res.headers.get('x-fetch-proxy-error') ? { proxyError: res.headers.get('x-fetch-proxy-error')! } : {}),
    };
  };
}

export interface Clock {
  now(): number;
  /** Rejects with a StopSignal when `signal` aborts. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  random(): number;
}

/** The run was stopped. Not a failure of the source. */
export class StopSignal extends Error {
  constructor() {
    super('stopped');
    this.name = 'StopSignal';
  }
}

export const realClock: Clock = {
  now: () => Date.now(),
  random: () => Math.random(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(new StopSignal());
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = (): void => {
        clearTimeout(timer);
        reject(new StopSignal());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    }),
};

export const BACKOFF = {
  baseMs: 2000,
  maxMs: 60_000,
  /** Attempts (the first included) before a throttled / unreachable answer is given up. */
  attemptsThrottled: 5,
  attemptsUnreachable: 3,
  /** A Retry-After longer than this is not waited out inside a request: the page is deferred. */
  retryAfterCapMs: 120_000,
} as const;

/** Minimum gap between the STARTS of two requests to one host (ms). DataCite: one a second; Zenodo guests: 30 a minute with a margin. */
export const PACE_MS: Readonly<Record<string, number>> = {
  'api.datacite.org': 1000,
  'zenodo.org': 2100,
  csw: 0, // the server paces per catalogue host
};

export interface Stats {
  requests: number;
  retries: number;
  throttleEvents: number;
}

export interface NetContext extends Clock {
  signal?: AbortSignal;
  stats: Stats;
  paceMs: Readonly<Record<string, number>>;
  /** host -> earliest start of its next request (epoch ms), kept by this context. */
  next: Map<string, number>;
}

export function makeNetContext(clock: Clock, stats: Stats, signal?: AbortSignal, paceMs: Readonly<Record<string, number>> = PACE_MS): NetContext {
  return { ...clock, stats, signal, paceMs, next: new Map() };
}

type Verdict = 'ok' | 'throttled' | 'unreachable' | 'not-found' | 'protocol';

export function verdictOf(res: NetResponse): Verdict {
  const s = res.status;
  if (s >= 200 && s < 300) return 'ok';
  if (s === 429 || s === 503) return 'throttled';
  if (s === 404) return 'not-found';
  if (s === 413 && res.proxyError) return 'unreachable';
  if (s === 408 || s >= 500) return 'unreachable';
  return 'protocol';
}

/**
 * One request with pacing and bounded retries. Returns a 2xx answer or throws SourceFailure ('throttled' | 'unreachable' after the retries,
 * 'not-found' on 404, 'protocol' for any other refusal). `host` keys the pacing ('csw' for the proxy).
 */
export async function request(ctx: NetContext, host: string, call: () => Promise<NetResponse>): Promise<NetResponse> {
  const pace = ctx.paceMs[host] ?? 0;
  for (let attempt = 1; ; attempt++) {
    const start = Math.max(ctx.now(), ctx.next.get(host) ?? 0);
    ctx.next.set(host, start + pace);
    if (start > ctx.now()) await ctx.sleep(start - ctx.now(), ctx.signal);
    ctx.stats.requests += 1;

    let res: NetResponse | undefined;
    let failure: 'unreachable' | undefined;
    let reason = 'network';
    try {
      res = await call();
    } catch (e) {
      if (e instanceof StopSignal || e instanceof HostNotAllowedError) {
        if (e instanceof HostNotAllowedError) throw new SourceFailure('protocol', 'host-not-allowed', undefined, host);
        throw e;
      }
      if (e instanceof FetchTimeoutError) reason = 'timeout';
      else if (!(e instanceof FetchBlockedError) && !(e instanceof TypeError)) {
        // Any other failure of the call itself (an aborted body read, a proxy error): the page cannot be read now, which is not a bug of the run.
        reason = `error:${e instanceof Error && e.name ? e.name : 'Error'}`;
      }
      failure = 'unreachable';
    }

    let verdict: Verdict = failure ?? verdictOf(res!);
    if (verdict === 'ok') {
      // Zenodo says how many requests are left in the minute: at the limit the next one waits for the window.
      if (res!.rateRemaining !== undefined && res!.rateRemaining <= 1 && res!.retryAfterMs !== undefined) {
        ctx.next.set(host, Math.max(ctx.next.get(host) ?? 0, ctx.now() + Math.min(res!.retryAfterMs, BACKOFF.retryAfterCapMs)));
      }
      return res!;
    }
    if (verdict === 'not-found') throw new SourceFailure('not-found', 'http-404', 404, host);
    if (verdict === 'protocol') throw new SourceFailure('protocol', res!.proxyError ?? 'http', res!.status, host);
    if (res) reason = res.proxyError ?? `http-${res.status}`;

    if (verdict === 'throttled') ctx.stats.throttleEvents += 1;
    const limit = verdict === 'throttled' ? BACKOFF.attemptsThrottled : BACKOFF.attemptsUnreachable;
    const ra = verdict === 'throttled' ? res?.retryAfterMs : undefined;
    if (attempt >= limit || (ra !== undefined && ra > BACKOFF.retryAfterCapMs)) {
      throw new SourceFailure(verdict, ra !== undefined && ra > BACKOFF.retryAfterCapMs ? 'retry-after-long' : reason, res?.status, host);
    }
    const expo = Math.min(BACKOFF.maxMs, BACKOFF.baseMs * 2 ** (attempt - 1));
    const wait = ra !== undefined ? ra : expo * (0.75 + 0.5 * ctx.random());
    ctx.stats.retries += 1;
    await ctx.sleep(wait, ctx.signal);
    // the host's own pacing must also be honoured after the wait
    ctx.next.set(host, Math.max(ctx.next.get(host) ?? 0, ctx.now()));
    verdict = 'ok';
  }
}
