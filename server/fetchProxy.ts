// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/**
 * SSRF-safe fetch proxy for server mode.
 *
 * Every hop (the first URL and each redirect target) is: https only, exact allowlisted host, default
 * port, no credentials, resolved ONCE, every resolved address checked, and the connection is then
 * PINNED to those checked addresses (custom `lookup`), so a second DNS answer (rebinding) can never
 * be used. SNI and the Host header stay the host name.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { isAllowedHost } from '../config/hosts.js';
import { SITE } from '../config/site.js';

export const MAX_BYTES = 30 * 1024 * 1024;
export const TIMEOUT_MS = 20_000;
export const MAX_REDIRECTS = 5;
export const USER_AGENT = `AbyssalClaimsTools/1.0 (+${SITE.origin}; mailto:${SITE.contactEmail})`;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class ProxyError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'ProxyError';
  }
}

// ---------------------------------------------------------------------------------------------
// Forbidden addresses
// ---------------------------------------------------------------------------------------------

function parseIPv4(s: string): number[] | null {
  if (isIP(s) !== 4) return null;
  const octets = s.split('.').map(Number);
  return octets.length === 4 && octets.every((o) => Number.isInteger(o) && o >= 0 && o <= 255) ? octets : null;
}

function parseIPv6(s: string): number[] | null {
  if (isIP(s) !== 6) return null; // also rejects zone ids (fe80::1%eth0)
  let str = s.toLowerCase();
  if (str.includes('.')) {
    const cut = str.lastIndexOf(':');
    const v4 = parseIPv4(str.slice(cut + 1));
    if (!v4) return null;
    str = `${str.slice(0, cut + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = str.split('::');
  if (halves.length > 2) return null;
  const groups = (p: string): string[] => (p === '' ? [] : p.split(':'));
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const all = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (all.length !== 8 || !all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

function forbiddenV4([a, b, c]: number[]): boolean {
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // 192.0.0/24, documentation 192.0.2/24
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking 198.18/15
    (a === 198 && b === 51 && c === 100) || // documentation
    (a === 203 && b === 0 && c === 113) || // documentation
    a >= 224 // multicast 224/4, reserved 240/4, broadcast
  );
}

function embeddedV4(hi: number, lo: number): number[] {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
}

/** True for anything that is not a public unicast address. Unparsable input is forbidden (fail closed). */
export function isForbiddenAddress(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) return forbiddenV4(v4);
  const w = parseIPv6(ip);
  if (!w) return true;
  if (w.every((x) => x === 0)) return true; // ::
  const first5Zero = w.slice(0, 5).every((x) => x === 0);
  if (first5Zero && w[5] === 0xffff) return forbiddenV4(embeddedV4(w[6], w[7])); // ::ffff:a.b.c.d (both spellings)
  if (w[0] === 0x64 && w[1] === 0xff9b) {
    // 64:ff9b::/96 maps an IPv4 address; anything else in 64:ff9b::/32 is local-use space.
    return w.slice(2, 6).every((x) => x === 0) ? forbiddenV4(embeddedV4(w[6], w[7])) : true;
  }
  if (w[0] >> 8 === 0) return true; // 0000::/8 reserved: ::1, IPv4-compatible, ...
  if ((w[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((w[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((w[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 deprecated site-local
  if (w[0] >> 8 === 0xff) return true; // ff00::/8 multicast
  if (w[0] === 0x2002) return forbiddenV4(embeddedV4(w[1], w[2])); // 6to4
  if (w[0] === 0x2001 && w[1] === 0) return true; // Teredo
  if (w[0] === 0x2001 && w[1] === 0x0db8) return true; // documentation
  return false;
}

// ---------------------------------------------------------------------------------------------
// Upstream transport (pinned)
// ---------------------------------------------------------------------------------------------

export interface UpstreamRequest {
  url: URL;
  /** Already validated addresses: the ONLY addresses the connection may use. */
  addresses: string[];
  headers: Record<string, string>;
  signal: AbortSignal;
  /** Default GET. POST is used only by /api/csw, with a body the server built itself. */
  method?: 'GET' | 'POST';
  body?: string;
}

export interface UpstreamResponse {
  status: number;
  /** Lower-case names; only the ones the proxy reads are required to be present. */
  headers: Record<string, string | undefined>;
  body: AsyncIterable<Uint8Array>;
  destroy(): void;
}

export type Upstream = (req: UpstreamRequest) => Promise<UpstreamResponse>;

/** A `lookup` that never touches DNS: it answers with the pre-validated addresses. */
export function pinnedLookup(addresses: readonly string[]): LookupFunction {
  const entries = addresses.map((address) => ({ address, family: isIP(address) }));
  return (_hostname, options, callback) => {
    const wanted = typeof options === 'object' && options && 'family' in options ? Number(options.family) : 0;
    const usable = entries.filter((e) => e.family !== 0 && (wanted === 4 || wanted === 6 ? e.family === wanted : true));
    if (usable.length === 0) {
      callback(Object.assign(new Error('no pinned address'), { code: 'ENOTFOUND' }) as NodeJS.ErrnoException, '', 0);
      return;
    }
    if (typeof options === 'object' && options && options.all) {
      (callback as (err: null, addrs: typeof usable) => void)(null, usable);
    } else {
      callback(null, usable[0].address, usable[0].family);
    }
  };
}

type Transport = { request(options: https.RequestOptions, cb: (res: http.IncomingMessage) => void): http.ClientRequest };

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** node:https request pinned to `addresses`. `transport` is injectable so tests can use plain http on loopback. */
export function createPinnedUpstream(transport: Transport = https): Upstream {
  return (req) =>
    new Promise<UpstreamResponse>((resolve, reject) => {
      const { url } = req;
      const r = transport.request(
        {
          hostname: url.hostname,
          port: url.port || undefined,
          path: url.pathname + url.search,
          method: req.method ?? 'GET',
          headers: req.body === undefined ? req.headers : { ...req.headers, 'Content-Length': String(Buffer.byteLength(req.body)) },
          lookup: pinnedLookup(req.addresses),
          servername: url.hostname, // SNI + certificate check stay on the host name
          agent: false, // no shared connection pool: a pinned socket is never reused for another host
          signal: req.signal,
        },
        (res) => {
          resolve({
            status: res.statusCode ?? 0,
            headers: {
              'content-type': first(res.headers['content-type']),
              'content-length': first(res.headers['content-length']),
              location: first(res.headers.location),
              'retry-after': first(res.headers['retry-after']),
            },
            body: res,
            destroy: () => res.destroy(),
          });
        },
      );
      r.on('error', reject);
      r.end(req.body);
    });
}

let defaultUpstream: Upstream | undefined;

async function defaultResolver(host: string): Promise<string[]> {
  const found = await dnsLookup(host, { all: true, verbatim: true });
  return found.map((a) => a.address);
}

// ---------------------------------------------------------------------------------------------
// proxyFetch
// ---------------------------------------------------------------------------------------------

export interface ProxyDeps {
  resolver?: (host: string) => Promise<string[]>;
  upstream?: Upstream;
  maxBytes?: number;
  timeoutMs?: number;
  /** Aborts everything (the client went away). */
  signal?: AbortSignal;
  /** Which URLs may be contacted. Default: the DATA_HOSTS allowlist; /api/csw passes the catalogue list. */
  allowUrl?: (url: string) => boolean;
  /** POST with this body (/api/csw only). A POST is never redirected. */
  post?: { body: string; contentType: string };
  /** 0 = any redirect is an error (/api/csw). Default MAX_REDIRECTS. */
  maxRedirects?: number;
}

export interface ProxyResponse {
  status: number;
  contentType?: string;
  /** The origin's Retry-After as sent (seconds or a date), for the caller to interpret. */
  retryAfter?: string;
  /** Counts bytes and throws ProxyError(413) above the cap, ProxyError(504) after the deadline. */
  body: AsyncIterable<Uint8Array>;
  abort(): void;
}

function race<T>(p: Promise<T>, signal: AbortSignal, onAbort: () => Error): Promise<T> {
  if (signal.aborted) {
    p.catch(() => {});
    return Promise.reject(onAbort());
  }
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(onAbort());
    signal.addEventListener('abort', abort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', abort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(e);
      },
    );
  });
}

export async function proxyFetch(rawUrl: string, accept: string | undefined, deps: ProxyDeps = {}): Promise<ProxyResponse> {
  const resolver = deps.resolver ?? defaultResolver;
  const upstream = deps.upstream ?? (defaultUpstream ??= createPinnedUpstream(https));
  const maxBytes = deps.maxBytes ?? MAX_BYTES;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  const allowUrl = deps.allowUrl ?? isAllowedHost;
  const maxRedirects = deps.maxRedirects ?? MAX_REDIRECTS;

  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, timeoutMs);
  const onExternalAbort = (): void => ac.abort();
  if (deps.signal?.aborted) ac.abort();
  else deps.signal?.addEventListener('abort', onExternalAbort, { once: true });
  const cleanup = (): void => {
    clearTimeout(timer);
    deps.signal?.removeEventListener('abort', onExternalAbort);
  };
  const abortError = (): ProxyError => (timedOut ? new ProxyError(504, 'timeout') : new ProxyError(499, 'client_closed'));
  const mapError = (e: unknown): ProxyError => {
    if (e instanceof ProxyError) return e;
    if (ac.signal.aborted) return abortError();
    return new ProxyError(502, 'upstream_error'); // never echo e.message: it can carry addresses
  };

  let current: UpstreamResponse | undefined;
  try {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new ProxyError(400, 'bad_url');
    }

    for (let redirects = 0; ; redirects++) {
      const addresses = await validateTarget(url, redirects > 0, resolver, ac.signal, abortError, allowUrl);
      const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
        Accept: accept && accept !== '' ? accept : '*/*',
        'Accept-Encoding': 'identity', // raw bytes: Content-Length and the byte cap mean what they say
        ...(deps.post ? { 'Content-Type': deps.post.contentType } : {}),
      };
      const call: UpstreamRequest = { url, addresses, headers, signal: ac.signal, ...(deps.post ? { method: 'POST' as const, body: deps.post.body } : {}) };
      const res = await race(upstream(call), ac.signal, abortError).catch((e: unknown) => {
        throw mapError(e);
      });
      current = res;

      if (REDIRECT_STATUSES.has(res.status)) {
        res.destroy();
        if (deps.post || maxRedirects === 0) throw new ProxyError(502, 'redirect_refused');
        if (redirects >= maxRedirects) throw new ProxyError(422, 'too_many_redirects');
        const location = res.headers.location;
        if (!location) throw new ProxyError(502, 'redirect_without_location');
        try {
          url = new URL(location, url);
        } catch {
          throw new ProxyError(422, 'bad_redirect');
        }
        continue;
      }

      if (res.status < 200 || res.status > 599) {
        res.destroy();
        throw new ProxyError(502, 'bad_upstream_status');
      }
      const declared = res.headers['content-length'];
      if (declared !== undefined && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
        res.destroy();
        throw new ProxyError(413, 'too_large');
      }

      const live = res;
      const body = (async function* (): AsyncGenerator<Uint8Array> {
        const it = live.body[Symbol.asyncIterator]();
        let total = 0;
        try {
          for (;;) {
            const next = await race(it.next(), ac.signal, abortError).catch((e: unknown) => {
              throw mapError(e);
            });
            if (next.done) return;
            total += next.value.byteLength;
            if (total > maxBytes) throw new ProxyError(413, 'too_large');
            yield next.value;
          }
        } finally {
          live.destroy();
          cleanup();
        }
      })();

      return {
        status: res.status,
        contentType: res.headers['content-type'],
        retryAfter: res.headers['retry-after'],
        body,
        abort: () => {
          ac.abort();
          live.destroy();
          cleanup();
        },
      };
    }
  } catch (e) {
    current?.destroy();
    ac.abort();
    cleanup();
    throw mapError(e);
  }
}

/** Checks one hop and returns the validated addresses the connection must be pinned to. */
async function validateTarget(
  url: URL,
  isRedirect: boolean,
  resolver: (host: string) => Promise<string[]>,
  signal: AbortSignal,
  abortError: () => Error,
  allowUrl: (url: string) => boolean,
): Promise<string[]> {
  if (url.protocol !== 'https:') throw isRedirect ? new ProxyError(422, 'bad_redirect') : new ProxyError(400, 'bad_scheme');

  const bare = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(bare) !== 0) {
    // A literal IP is never allowlisted; a forbidden one is reported as such.
    throw isForbiddenAddress(bare) ? new ProxyError(422, 'forbidden_address') : new ProxyError(403, 'host_not_allowed');
  }
  // Default port only: the allow check looks at the host name, not at where we connect.
  if (url.port !== '' || !allowUrl(url.href)) throw new ProxyError(403, 'host_not_allowed');

  let addresses: string[];
  try {
    addresses = await race(resolver(bare), signal, abortError);
  } catch (e) {
    if (signal.aborted) throw abortError();
    if (e instanceof ProxyError) throw e;
    throw new ProxyError(502, 'dns_failed');
  }
  if (addresses.length === 0) throw new ProxyError(502, 'dns_failed');
  if (addresses.some(isForbiddenAddress)) throw new ProxyError(422, 'forbidden_address');
  return addresses;
}
