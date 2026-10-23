// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The IPT archive route of the fetch proxy: only the static list, GET only, and limits raised for that route alone.
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IPT_HOSTS, IPT_MAX_BYTES, IPT_TIMEOUT_MS } from '../../config/ipt.js';
import { createApp } from '../../server/index.js';
import { ARCHIVE_MAX_BYTES, ARCHIVE_TIMEOUT_MS, MAX_BYTES, TIMEOUT_MS, proxyFetch, ProxyError, USER_AGENT, type Upstream, type UpstreamRequest, type UpstreamResponse } from '../../server/fetchProxy.js';

const DIST = join(__dirname, '..', 'fixtures', 'dist');
const PUBLIC = ['193.0.6.139'];

async function* chunks(...parts: string[]): AsyncGenerator<Uint8Array> {
  for (const p of parts) yield new TextEncoder().encode(p);
}
const resp = (status: number, body = '', headers: Record<string, string> = {}): UpstreamResponse => ({ status, headers, body: chunks(body), destroy() {} });
async function rejection(p: Promise<unknown>): Promise<ProxyError> {
  try {
    await p;
  } catch (e) {
    return e as ProxyError;
  }
  throw new Error('expected a rejection');
}
const never: Upstream = async () => {
  throw new Error('upstream must not be called');
};

afterEach(() => vi.useRealTimers());

describe('IPT route — the server fetches only what is on the static list', () => {
  const refused = [
    ['an IPT host that is not on the list', 'https://ipt.example.org/archive.do?r=x', 403],
    ['a look-alike with the listed host as a prefix', 'https://ipt.vliz.be.evil.com/eurobis/archive.do?r=x', 403],
    ['a look-alike with the listed host as a suffix', 'https://evilipt.vliz.be/eurobis/archive.do?r=x', 403],
    ['the listed host as a path of another host', 'https://evil.com/ipt.vliz.be/archive.do', 403],
    ['userinfo that makes another host look like a listed one', 'https://ipt.vliz.be@evil.com/archive.do', 403],
    ['credentials on a listed host', 'https://user:pw@ipt.vliz.be/archive.do', 403],
    ['plain http on a listed host', 'http://ipt.vliz.be/eurobis/archive.do?r=x', 400],
    ['a non-default port on a listed host', 'https://ipt.vliz.be:8443/archive.do', 403],
    ['a dropped host from the verification (no TLS, port 8082)', 'https://gp.sea.gov.ua:8082/ipt/archive.do?r=x', 403],
    ['a dropped host from the verification (www.dassh.ac.uk)', 'https://www.dassh.ac.uk/ipt/archive.do?r=x', 403],
  ] as const;

  it.each(refused)('proxyFetch refuses %s without resolving or connecting', async (_what, url, status) => {
    let resolved = false;
    const e = await rejection(proxyFetch(url, undefined, { upstream: never, resolver: async () => ((resolved = true), PUBLIC) }));
    expect(e.status).toBe(status);
    expect(resolved).toBe(false);
  });

  it('a listed host that resolves to a private address is refused like any other (the DNS protection is reused)', async () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '169.254.169.254', '::1']) {
      const e = await rejection(proxyFetch('https://ipt.vliz.be/eurobis/archive.do?r=x', undefined, { upstream: never, resolver: async () => [ip] }));
      expect(e.status, ip).toBe(422);
    }
  });

  it('a redirect from a listed IPT to a host off the list, to http or to a private address is refused', async () => {
    const to = (location: string): Upstream => async () => resp(302, '', { location });
    const deps = (location: string) => ({ upstream: to(location), resolver: async () => PUBLIC });
    expect((await rejection(proxyFetch('https://ipt.vliz.be/a', undefined, deps('https://evil.example/a')))).status).toBe(403);
    expect((await rejection(proxyFetch('https://ipt.vliz.be/a', undefined, deps('http://ipt.vliz.be/a')))).status).toBe(422);
    expect((await rejection(proxyFetch('https://ipt.vliz.be/a', undefined, deps('https://169.254.169.254/latest')))).status).toBe(422);
  });

  it('a listed IPT is fetched with GET, the fixed User-Agent, no credentials and pinned addresses', async () => {
    let seen: UpstreamRequest | undefined;
    const up: Upstream = async (req) => ((seen = req), resp(200, 'PK'));
    const r = await proxyFetch('https://ipt.vliz.be/eurobis/archive.do?r=x', undefined, { upstream: up, resolver: async () => PUBLIC });
    expect(r.status).toBe(200);
    expect(seen!.method).toBeUndefined(); // GET
    expect(seen!.body).toBeUndefined();
    expect(seen!.addresses).toEqual(PUBLIC);
    expect(seen!.headers['User-Agent']).toBe(USER_AGENT);
    expect(Object.keys(seen!.headers).map((k) => k.toLowerCase())).not.toContain('cookie');
    expect(Object.keys(seen!.headers).map((k) => k.toLowerCase())).not.toContain('authorization');
  });

  it('every host of the list is accepted, the two registries too', async () => {
    const up: Upstream = async () => resp(200, 'x');
    for (const h of [...IPT_HOSTS, 'api.gbif.org', 'api.obis.org']) {
      expect((await proxyFetch(`https://${h}/x`, undefined, { upstream: up, resolver: async () => PUBLIC })).status, h).toBe(200);
    }
  });
});

describe('IPT route — limits are raised for the archive route only', () => {
  it('constants: 30 MB / 20 s for everything else, the reader cap and a justified time for an IPT', () => {
    expect(MAX_BYTES).toBe(30 * 1024 * 1024);
    expect(TIMEOUT_MS).toBe(20_000);
    expect(ARCHIVE_MAX_BYTES).toBe(IPT_MAX_BYTES);
    expect(IPT_MAX_BYTES).toBe(100 * 1024 * 1024);
    expect(ARCHIVE_TIMEOUT_MS).toBe(IPT_TIMEOUT_MS);
    expect(IPT_TIMEOUT_MS).toBe(90_000);
  });

  it('50 MB declared by an IPT passes, by zenodo.org or a registry it is refused (413); above 100 MB the IPT is refused too', async () => {
    const big = (n: number): Upstream => async () => resp(200, '', { 'content-length': String(n) });
    const d = (n: number) => ({ upstream: big(n), resolver: async () => PUBLIC });
    const fifty = 50 * 1024 * 1024;
    expect((await proxyFetch('https://ipt.vliz.be/a', undefined, d(fifty))).status).toBe(200);
    expect((await rejection(proxyFetch('https://zenodo.org/a', undefined, d(fifty)))).status).toBe(413);
    expect((await rejection(proxyFetch('https://api.gbif.org/a', undefined, d(fifty)))).status).toBe(413);
    expect((await rejection(proxyFetch('https://ipt.vliz.be/a', undefined, d(100 * 1024 * 1024 + 1)))).status).toBe(413);
  });

  it('a redirect from zenodo.org to an IPT does not raise the limits (they follow the host the request started at)', async () => {
    let n = 0;
    const up: Upstream = async () => (n++ === 0 ? resp(302, '', { location: 'https://ipt.vliz.be/a' }) : resp(200, '', { 'content-length': String(50 * 1024 * 1024) }));
    expect((await rejection(proxyFetch('https://zenodo.org/a', undefined, { upstream: up, resolver: async () => PUBLIC }))).status).toBe(413);
  });

  it('an IPT that stalls is cut after 90 s (504), any other host after 20 s', async () => {
    vi.useFakeTimers();
    const stall: Upstream = (req) => new Promise(() => void req.signal);
    const settle = (url: string) => {
      const out: { e?: ProxyError } = {};
      void proxyFetch(url, undefined, { upstream: stall, resolver: async () => PUBLIC }).catch((e: ProxyError) => void (out.e = e));
      return out;
    };
    const ipt = settle('https://ipt.vliz.be/a');
    const other = settle('https://zenodo.org/a');
    await vi.advanceTimersByTimeAsync(20_100);
    expect(other.e?.status).toBe(504);
    expect(ipt.e).toBeUndefined();
    await vi.advanceTimersByTimeAsync(70_000);
    expect(ipt.e?.status).toBe(504);
    expect(ipt.e?.code).toBe('timeout');
  });
});

describe('IPT route through /api/fetch', () => {
  const app = (upstream: Upstream) => createApp({ distDir: DIST, resolver: async () => PUBLIC, upstream, log: () => {} });
  const post = (a: ReturnType<typeof createApp>, url: string, ip: string) => request(a).post('/api/fetch').set('X-Forwarded-For', ip).set('Content-Type', 'application/json').buffer(true).send(JSON.stringify({ url }));

  it('an off-list IPT and look-alikes are 403 host_not_allowed and never reach the upstream', async () => {
    const a = app(never);
    let i = 0;
    for (const url of ['https://ipt.example.org/archive.do?r=x', 'https://ipt.vliz.be.evil.com/archive.do?r=x', 'https://ipt.vliz.be@evil.com/archive.do', 'https://user@ipt.vliz.be/archive.do']) {
      const res = await post(a, url, `7.7.7.${++i}`);
      expect(res.status, url).toBe(403);
      expect(res.headers['x-fetch-proxy-error'], url).toBe('host_not_allowed');
    }
    expect((await post(a, 'http://ipt.vliz.be/archive.do?r=x', '7.7.7.9')).status).toBe(400);
  });

  it('a listed IPT is served as an opaque download; the endpoint takes POST only (GET and the like are 405)', async () => {
    const a = app(async () => resp(200, 'PKfake', { 'content-type': 'application/zip' }));
    const ok = await post(a, 'https://ipt.vliz.be/eurobis/archive.do?r=x', '8.8.8.1');
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toBe('application/octet-stream');
    expect(ok.headers['x-upstream-content-type']).toBe('application/zip');
    for (const m of ['get', 'put', 'delete'] as const) expect((await request(a)[m]('/api/fetch').set('X-Forwarded-For', '8.8.8.2')).status, m).toBe(405);
  });
});
