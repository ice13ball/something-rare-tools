// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
  createPinnedUpstream,
  isForbiddenAddress,
  pinnedLookup,
  proxyFetch,
  ProxyError,
  type ProxyDeps,
  type Upstream,
  type UpstreamRequest,
  type UpstreamResponse,
} from '../../server/fetchProxy.js';

async function* chunks(...parts: Array<Uint8Array | string>): AsyncGenerator<Uint8Array> {
  for (const p of parts) yield typeof p === 'string' ? new TextEncoder().encode(p) : p;
}

function resp(
  status: number,
  body: AsyncIterable<Uint8Array> | string = '',
  headers: Record<string, string> = {},
): UpstreamResponse {
  return {
    status,
    headers,
    body: typeof body === 'string' ? chunks(body) : body,
    destroy() {},
  };
}

const PUBLIC = ['193.0.6.139'];

function deps(upstream: Upstream, over: Partial<ProxyDeps> = {}): ProxyDeps {
  return { resolver: async () => PUBLIC, upstream, ...over };
}

async function drain(it: AsyncIterable<Uint8Array>): Promise<string> {
  let s = '';
  for await (const c of it) s += Buffer.from(c).toString('utf8');
  return s;
}

async function rejection(p: Promise<unknown>): Promise<ProxyError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ProxyError);
    return e as ProxyError;
  }
  throw new Error('expected a ProxyError, got a result');
}

describe('isForbiddenAddress', () => {
  const forbidden = [
    '0.0.0.0', '0.1.2.3', '10.1.2.3', '100.64.0.1', '100.127.255.255', '127.0.0.1', '127.255.255.254',
    '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.0.0.8', '192.168.1.1', '198.18.0.1', '198.19.255.255',
    '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255',
    '::', '::1', 'fc00::1', 'fd00::1', 'fe80::1', 'febf::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::FFFF:7F00:1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe',
    '0:0:0:0:0:ffff:169.254.169.254', '::127.0.0.1',
    '64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe', '64:ff9b::10.0.0.1',
    '2002:7f00:1::', '2002:a9fe:a9fe::1',
    'not-an-ip', '', '1.2.3', '1.2.3.4.5', '256.1.1.1', 'fe80::1%eth0',
  ];
  const allowed = [
    '193.0.6.139', '8.8.8.8', '172.15.255.255', '172.32.0.1', '100.63.255.255', '100.128.0.1', '169.253.0.1',
    '198.17.255.255', '198.20.0.1', '223.255.255.255',
    '2606:4700:4700::1111', '2a00:1450:4001:81b::200e', '::ffff:193.0.6.139', '::ffff:c100:68b',
    '64:ff9b::c100:68b', '2002:c100:68b::1',
  ];
  for (const ip of forbidden) it(`forbids ${JSON.stringify(ip)}`, () => expect(isForbiddenAddress(ip)).toBe(true));
  for (const ip of allowed) it(`allows ${ip}`, () => expect(isForbiddenAddress(ip)).toBe(false));
});

describe('proxyFetch — request validation', () => {
  const never: Upstream = async () => {
    throw new Error('upstream must not be called');
  };

  it('refuses http:// with 400', async () => {
    expect((await rejection(proxyFetch('http://zenodo.org/', undefined, deps(never)))).status).toBe(400);
  });
  it('refuses a malformed URL with 400', async () => {
    expect((await rejection(proxyFetch('not a url', undefined, deps(never)))).status).toBe(400);
  });
  it('refuses a non-allowlisted host with 403 and never resolves it', async () => {
    let resolved = false;
    const e = await rejection(
      proxyFetch('https://evil.example/', undefined, deps(never, { resolver: async () => ((resolved = true), PUBLIC) })),
    );
    expect(e.status).toBe(403);
    expect(resolved).toBe(false);
  });
  it('refuses credentials in the URL with 403', async () => {
    expect((await rejection(proxyFetch('https://user:pw@zenodo.org/', undefined, deps(never)))).status).toBe(403);
  });
  it('refuses a non-443 port on an allowlisted host with 403', async () => {
    expect((await rejection(proxyFetch('https://zenodo.org:8443/x', undefined, deps(never)))).status).toBe(403);
    expect((await rejection(proxyFetch('https://zenodo.org:22/x', undefined, deps(never)))).status).toBe(403);
  });
  it('refuses literal IP hosts (forbidden: 422, public: 403 — never on the allowlist)', async () => {
    expect((await rejection(proxyFetch('https://169.254.169.254/latest', undefined, deps(never)))).status).toBe(422);
    expect((await rejection(proxyFetch('https://[::1]/', undefined, deps(never)))).status).toBe(422);
    expect((await rejection(proxyFetch('https://0x7f.1/', undefined, deps(never)))).status).toBe(422);
    expect((await rejection(proxyFetch('https://2130706433/', undefined, deps(never)))).status).toBe(422);
    expect((await rejection(proxyFetch('https://193.0.6.139/', undefined, deps(never)))).status).toBe(403);
  });
  it('refuses an allowlisted host resolving to a loopback address with 422', async () => {
    const e = await rejection(proxyFetch('https://zenodo.org/', undefined, deps(never, { resolver: async () => ['127.0.0.1'] })));
    expect(e.status).toBe(422);
  });
  it('refuses when ANY resolved address is forbidden (mixed answer)', async () => {
    const e = await rejection(
      proxyFetch('https://zenodo.org/', undefined, deps(never, { resolver: async () => ['193.0.6.139', '::ffff:7f00:1'] })),
    );
    expect(e.status).toBe(422);
  });
  it('refuses an empty or failing resolution with 502', async () => {
    expect((await rejection(proxyFetch('https://zenodo.org/', undefined, deps(never, { resolver: async () => [] })))).status).toBe(502);
    const failing = async (): Promise<string[]> => {
      throw new Error('ENOTFOUND');
    };
    expect((await rejection(proxyFetch('https://zenodo.org/', undefined, deps(never, { resolver: failing })))).status).toBe(502);
  });
});

describe('proxyFetch — what is sent and returned', () => {
  it('pins the checked addresses, sends the fixed User-Agent and no credentials, forwards only content-type', async () => {
    let seen: UpstreamRequest | undefined;
    const up: Upstream = async (req) => {
      seen = req;
      return resp(200, 'hello', {
        'content-type': 'text/csv',
        'set-cookie': 'JSESSIONID=abc',
        'content-length': '5',
        'x-secret': '1',
      });
    };
    const r = await proxyFetch('https://zenodo.org/api/records/1?x=1', 'text/csv', deps(up));
    expect(r.status).toBe(200);
    expect(r.contentType).toBe('text/csv');
    expect(await drain(r.body)).toBe('hello');
    expect(seen!.addresses).toEqual(PUBLIC);
    expect(seen!.url.href).toBe('https://zenodo.org/api/records/1?x=1');
    const h = Object.fromEntries(Object.entries(seen!.headers).map(([k, v]) => [k.toLowerCase(), v]));
    expect(h['user-agent']).toBe('AbyssalClaimsTools/1.0 (+https://tools.something-rare.com)');
    expect(h['accept']).toBe('text/csv');
    expect(h['accept-encoding']).toBe('identity');
    expect(h['cookie']).toBeUndefined();
    expect(h['authorization']).toBeUndefined();
    expect(Object.keys(r).join()).not.toMatch(/cookie/i);
  });

  it('passes an upstream error status through', async () => {
    const r = await proxyFetch('https://zenodo.org/x', undefined, deps(async () => resp(404, 'nope', { 'content-type': 'text/plain' })));
    expect(r.status).toBe(404);
    expect(await drain(r.body)).toBe('nope');
  });
});

describe('proxyFetch — redirects', () => {
  function redirecting(chain: Record<string, string>, final = 'done'): { up: Upstream; hops: string[] } {
    const hops: string[] = [];
    const up: Upstream = async (req) => {
      hops.push(req.url.href);
      const next = chain[req.url.href];
      return next ? resp(302, '', { location: next }) : resp(200, final, { 'content-type': 'text/plain' });
    };
    return { up, hops };
  }

  it('follows an allowlisted redirect (relative Location resolved against the current URL)', async () => {
    const { up, hops } = redirecting({ 'https://doi.org/10.1/x': 'https://zenodo.org/records/1', 'https://zenodo.org/records/1': '/api/records/1' });
    const r = await proxyFetch('https://doi.org/10.1/x', undefined, deps(up));
    expect(await drain(r.body)).toBe('done');
    expect(hops).toEqual(['https://doi.org/10.1/x', 'https://zenodo.org/records/1', 'https://zenodo.org/api/records/1']);
  });

  for (const code of [301, 302, 303, 307, 308]) {
    it(`treats ${code} as a redirect`, async () => {
      let n = 0;
      const up: Upstream = async () => (n++ === 0 ? resp(code, '', { location: 'https://zenodo.org/b' }) : resp(200, 'ok'));
      expect(await drain((await proxyFetch('https://zenodo.org/a', undefined, deps(up))).body)).toBe('ok');
    });
  }

  it('refuses a redirect to the cloud metadata address with 422', async () => {
    const e = await rejection(
      proxyFetch('https://zenodo.org/a', undefined, deps(async () => resp(302, '', { location: 'https://169.254.169.254/latest/meta-data/' }))),
    );
    expect(e.status).toBe(422);
  });
  it('refuses a redirect to localhost / a private IP literal with 422', async () => {
    for (const loc of ['https://127.0.0.1/', 'https://[::1]/', 'https://10.0.0.5/x', 'https://[::ffff:7f00:1]/']) {
      const e = await rejection(proxyFetch('https://zenodo.org/a', undefined, deps(async () => resp(302, '', { location: loc }))));
      expect(e.status, loc).toBe(422);
    }
  });
  it('refuses a redirect to a non-allowlisted host with 403', async () => {
    const e = await rejection(
      proxyFetch('https://zenodo.org/a', undefined, deps(async () => resp(302, '', { location: 'https://evil.example/' }))),
    );
    expect(e.status).toBe(403);
  });
  it('refuses a redirect to http:// with 422', async () => {
    const e = await rejection(proxyFetch('https://zenodo.org/a', undefined, deps(async () => resp(302, '', { location: 'http://zenodo.org/b' }))));
    expect(e.status).toBe(422);
  });
  it('refuses a redirect to a non-http scheme (file:, javascript:) with 422', async () => {
    for (const loc of ['file:///etc/passwd', 'ftp://zenodo.org/x']) {
      const e = await rejection(proxyFetch('https://zenodo.org/a', undefined, deps(async () => resp(302, '', { location: loc }))));
      expect(e.status, loc).toBe(422);
    }
  });
  it('re-resolves and re-checks every hop: an allowlisted redirect target resolving privately is refused', async () => {
    const resolver = async (host: string): Promise<string[]> => (host === 'doi.org' ? ['127.0.0.1'] : PUBLIC);
    const up: Upstream = async () => resp(302, '', { location: 'https://doi.org/x' });
    const e = await rejection(proxyFetch('https://zenodo.org/a', undefined, deps(up, { resolver })));
    expect(e.status).toBe(422);
  });
  it('refuses a redirect without Location with 502', async () => {
    const e = await rejection(proxyFetch('https://zenodo.org/a', undefined, deps(async () => resp(302))));
    expect(e.status).toBe(502);
  });
  it('allows 5 redirects and refuses the 6th with 422', async () => {
    const chain = (n: number): Upstream => {
      let i = 0;
      return async () => (i++ < n ? resp(302, '', { location: 'https://zenodo.org/next' }) : resp(200, 'end'));
    };
    expect(await drain((await proxyFetch('https://zenodo.org/a', undefined, deps(chain(5)))).body)).toBe('end');
    expect((await rejection(proxyFetch('https://zenodo.org/a', undefined, deps(chain(6))))).status).toBe(422);
  });
  it('destroys the body of a redirect response', async () => {
    let destroyed = false;
    let n = 0;
    const up: Upstream = async () =>
      n++ === 0 ? { ...resp(302, 'x', { location: 'https://zenodo.org/b' }), destroy: () => void (destroyed = true) } : resp(200, 'ok');
    await proxyFetch('https://zenodo.org/a', undefined, deps(up));
    expect(destroyed).toBe(true);
  });
});

describe('proxyFetch — size cap and timeout', () => {
  it('has a 30 MB default cap', async () => {
    const big = async () => resp(200, '', { 'content-length': String(30 * 1024 * 1024 + 1) });
    expect((await rejection(proxyFetch('https://zenodo.org/a', undefined, deps(big)))).status).toBe(413);
  });
  it('refuses a Content-Length above the cap before returning anything (413) and destroys the upstream', async () => {
    let destroyed = false;
    const up: Upstream = async () => ({ ...resp(200, 'x', { 'content-length': '101' }), destroy: () => void (destroyed = true) });
    const e = await rejection(proxyFetch('https://zenodo.org/a', undefined, deps(up, { maxBytes: 100 })));
    expect(e.status).toBe(413);
    expect(destroyed).toBe(true);
  });
  it('accepts a body exactly at the cap', async () => {
    const r = await proxyFetch('https://zenodo.org/a', undefined, deps(async () => resp(200, 'x'.repeat(100), { 'content-length': '100' }), { maxBytes: 100 }));
    expect((await drain(r.body)).length).toBe(100);
  });
  it('counts streamed bytes when there is no Content-Length (also a lying one) and aborts above the cap', async () => {
    for (const headers of [{}, { 'content-length': '10' }] as Array<Record<string, string>>) {
      let destroyed = false;
      const up: Upstream = async () => ({
        ...resp(200, chunks('x'.repeat(60), 'x'.repeat(60)), headers),
        destroy: () => void (destroyed = true),
      });
      const r = await proxyFetch('https://zenodo.org/a', undefined, deps(up, { maxBytes: 100 }));
      const it = r.body[Symbol.asyncIterator]();
      expect((await it.next()).done).toBe(false);
      const e = await it.next().then(
        () => null,
        (x: unknown) => x,
      );
      expect(e).toBeInstanceOf(ProxyError);
      expect((e as ProxyError).status).toBe(413);
      expect(destroyed).toBe(true);
    }
  });
  it('a first chunk above the cap is also a 413 when asked for', async () => {
    const r = await proxyFetch('https://zenodo.org/a', undefined, deps(async () => resp(200, 'x'.repeat(101)), { maxBytes: 100 }));
    const e = await r.body[Symbol.asyncIterator]().next().then(() => null, (x: unknown) => x);
    expect((e as ProxyError).status).toBe(413);
  });
  it('times out with 504 when upstream never answers, and aborts the upstream request', async () => {
    let aborted = false;
    const up: Upstream = (req) =>
      new Promise(() => {
        req.signal.addEventListener('abort', () => (aborted = true));
      });
    const e = await rejection(proxyFetch('https://zenodo.org/a', undefined, deps(up, { timeoutMs: 40 })));
    expect(e.status).toBe(504);
    expect(aborted).toBe(true);
  });
  it('the timeout covers the whole chain, including a slow body', async () => {
    async function* slow(): AsyncGenerator<Uint8Array> {
      yield new TextEncoder().encode('a');
      await new Promise(() => {});
    }
    const r = await proxyFetch('https://zenodo.org/a', undefined, deps(async () => resp(200, slow()), { timeoutMs: 60 }));
    const it = r.body[Symbol.asyncIterator]();
    expect((await it.next()).done).toBe(false);
    const e = await it.next().then(() => null, (x: unknown) => x);
    expect((e as ProxyError).status).toBe(504);
  });
  it('a caller-supplied signal (client went away) aborts the upstream', async () => {
    const ac = new AbortController();
    let aborted = false;
    const up: Upstream = (req) =>
      new Promise(() => {
        req.signal.addEventListener('abort', () => (aborted = true));
      });
    const p = proxyFetch('https://zenodo.org/a', undefined, deps(up, { signal: ac.signal }));
    setTimeout(() => ac.abort(), 10);
    await rejection(p);
    expect(aborted).toBe(true);
  });
});

describe('pinned upstream (real sockets)', () => {
  it('pinnedLookup answers every lookup (single and all:true) with the pre-validated addresses only', async () => {
    const lookup = pinnedLookup(['93.184.216.34', '2606:2800:220:1::1']);
    const one = await new Promise<[string, number]>((res, rej) =>
      lookup('zenodo.org', {}, (err, a, f) => (err ? rej(err) : res([a as string, f as number]))),
    );
    expect(one).toEqual(['93.184.216.34', 4]);
    const all = await new Promise<unknown>((res, rej) =>
      lookup('zenodo.org', { all: true }, (err, a) => (err ? rej(err) : res(a))),
    );
    expect(all).toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1::1', family: 6 },
    ]);
  });

  it('connects to the pinned address even though the hostname does not resolve (no second DNS lookup), keeps the Host header, sends no cookie', async () => {
    let seenHost: string | undefined;
    let seenHeaders: http.IncomingHttpHeaders = {};
    const server = http.createServer((req, res) => {
      seenHost = req.headers.host;
      seenHeaders = req.headers;
      res.setHeader('Set-Cookie', 'JSESSIONID=1');
      res.setHeader('Content-Type', 'text/plain');
      res.end('pinned-ok');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    try {
      // "zenodo.org.invalid" can only ever be reached through the pinned lookup.
      const url = new URL(`http://zenodo.org.invalid:${port}/p?q=1`);
      const up = createPinnedUpstream(http);
      const r = await up({ url, addresses: ['127.0.0.1'], headers: { 'User-Agent': 'UA-test', Accept: 'text/plain' }, signal: new AbortController().signal });
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toBe('text/plain');
      expect(await drain(r.body)).toBe('pinned-ok');
      expect(seenHost).toBe(`zenodo.org.invalid:${port}`);
      expect(seenHeaders['user-agent']).toBe('UA-test');
      expect(seenHeaders.cookie).toBeUndefined();
    } finally {
      server.close();
    }
  });

  it('aborting the signal rejects the request', async () => {
    const server = http.createServer(() => {
      /* never answers */
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    try {
      const ac = new AbortController();
      const up = createPinnedUpstream(http);
      const p = up({ url: new URL(`http://zenodo.org.invalid:${port}/`), addresses: ['127.0.0.1'], headers: {}, signal: ac.signal });
      setTimeout(() => ac.abort(), 20);
      await expect(p).rejects.toThrow();
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});
