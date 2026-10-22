// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CATALOGUES, CSW_HOSTS, catalogueById, isCatalogueUrl } from '../../config/catalogues.js';
import { DATA_HOSTS } from '../../config/hosts.js';
import { SITE } from '../../config/site.js';
import { buildCswUpstream, createHostPacer, parseCswBody } from '../../server/csw.js';
import { USER_AGENT, type Upstream, type UpstreamRequest, type UpstreamResponse } from '../../server/fetchProxy.js';
import { createApp } from '../../server/index.js';
import { join } from 'node:path';

const DIST = join(__dirname, '..', 'fixtures', 'dist');
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
async function* chunks(...parts: string[]): AsyncGenerator<Uint8Array> {
  for (const p of parts) yield enc(p);
}
function resp(status: number, body = '', headers: Record<string, string | undefined> = {}): UpstreamResponse {
  return { status, headers, body: chunks(body), destroy() {} };
}

function make(over: Partial<Parameters<typeof createApp>[0]> = {}, answer: (r: UpstreamRequest) => UpstreamResponse = () => resp(200, '<csw/>', { 'content-type': 'application/xml' })) {
  const calls: UpstreamRequest[] = [];
  const resolved: string[] = [];
  const upstream: Upstream = async (r) => {
    calls.push(r);
    return answer(r);
  };
  const app = createApp({
    distDir: DIST,
    resolver: async (h) => {
      resolved.push(h);
      return ['193.0.6.139'];
    },
    upstream,
    log: () => undefined,
    ...over,
  });
  return { app, calls, resolved };
}

const post = (app: ReturnType<typeof createApp>, body: unknown, ip = '9.9.9.9') =>
  request(app).post('/api/csw').set('X-Forwarded-For', ip).set('Content-Type', 'application/json').buffer(true).send(JSON.stringify(body));

describe('catalogue list', () => {
  it('has https endpoints on exactly the listed host, no wildcards, no duplicates', () => {
    expect(CATALOGUES.length).toBeGreaterThanOrEqual(2);
    for (const c of CATALOGUES) {
      const u = new URL(c.cswUrl);
      expect(u.protocol).toBe('https:');
      expect(u.hostname).toBe(c.host);
      expect(c.host).not.toContain('*');
      expect(isCatalogueUrl(c.cswUrl)).toBe(true);
    }
    expect(new Set(CATALOGUES.map((c) => c.id)).size).toBe(CATALOGUES.length);
    expect(CATALOGUES.map((c) => c.method).sort()).toEqual(['GET', 'POST']);
  });
  it('has no partnership wording: a label is an address', () => {
    for (const c of CATALOGUES) expect(c.label).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}(\/[a-z]+)?$/);
  });
  it('contains no IO PAN host and does not widen the fetch allowlist', () => {
    for (const h of CSW_HOSTS) expect(h).not.toMatch(/iopan/);
    for (const h of CSW_HOSTS) expect(DATA_HOSTS).not.toContain(h);
  });
  it('isCatalogueUrl refuses look-alikes, http and userinfo', () => {
    const h = CSW_HOSTS[0];
    expect(isCatalogueUrl(`https://${h}.evil.com/`)).toBe(false);
    expect(isCatalogueUrl(`http://${h}/`)).toBe(false);
    expect(isCatalogueUrl(`https://${h}@evil.com/`)).toBe(false);
    expect(isCatalogueUrl(`https://evil.com/?${h}`)).toBe(false);
  });
});

describe('parseCswBody', () => {
  it('accepts the plain forms and fills the defaults', () => {
    expect(parseCswBody({ catalogue: 'emodnet', op: 'GetCapabilities' }).op).toBe('GetCapabilities');
    const r = parseCswBody({ catalogue: 'emodnet', op: 'GetRecords' });
    expect([r.startPosition, r.maxRecords, r.schema]).toEqual([1, 10, 'iso19139']);
    const s = parseCswBody({ catalogue: 'marine-ie', op: 'GetRecords', startPosition: 41, maxRecords: 50, schema: 'iso19115-3' });
    expect([s.startPosition, s.maxRecords, s.schema]).toEqual([41, 50, 'iso19115-3']);
  });
  const reject: [string, unknown][] = [
    ['not an object', 'emodnet'],
    ['an array', [{ catalogue: 'emodnet' }]],
    ['null', null],
    ['an extra field', { catalogue: 'emodnet', op: 'GetRecords', url: 'https://evil.example/' }],
    ['a field that only looks harmless', { catalogue: 'emodnet', op: 'GetRecords', typeNames: 'csw:Record' }],
    ['a URL as the catalogue', { catalogue: 'https://evil.example/csw', op: 'GetRecords' }],
    ['a host as the catalogue', { catalogue: 'emodnet.ec.europa.eu', op: 'GetRecords' }],
    ['an unknown catalogue', { catalogue: 'nosuch', op: 'GetRecords' }],
    ['a prototype key as the catalogue', { catalogue: '__proto__', op: 'GetRecords' }],
    ['no catalogue', { op: 'GetRecords' }],
    ['an unknown op', { catalogue: 'emodnet', op: 'Transaction' }],
    ['a URL as the schema', { catalogue: 'emodnet', op: 'GetRecords', schema: 'http://evil.example/x.xsd' }],
    ['XML as the schema', { catalogue: 'emodnet', op: 'GetRecords', schema: '<x/>' }],
    ['startPosition 0', { catalogue: 'emodnet', op: 'GetRecords', startPosition: 0 }],
    ['startPosition negative', { catalogue: 'emodnet', op: 'GetRecords', startPosition: -5 }],
    ['startPosition fractional', { catalogue: 'emodnet', op: 'GetRecords', startPosition: 1.5 }],
    ['startPosition a string', { catalogue: 'emodnet', op: 'GetRecords', startPosition: '1' }],
    ['startPosition 10^12', { catalogue: 'emodnet', op: 'GetRecords', startPosition: 1e12 }],
    ['startPosition infinite-looking', { catalogue: 'emodnet', op: 'GetRecords', startPosition: 1e309 }],
    ['maxRecords 51', { catalogue: 'emodnet', op: 'GetRecords', maxRecords: 51 }],
    ['maxRecords 500', { catalogue: 'emodnet', op: 'GetRecords', maxRecords: 500 }],
    ['maxRecords 0', { catalogue: 'emodnet', op: 'GetRecords', maxRecords: 0 }],
    ['GetCapabilities with a record window', { catalogue: 'emodnet', op: 'GetCapabilities', maxRecords: 5 }],
    ['GetCapabilities with a schema', { catalogue: 'emodnet', op: 'GetCapabilities', schema: 'iso19139' }],
  ];
  for (const [name, body] of reject) {
    it(`rejects ${name} with 400`, () => {
      expect(() => parseCswBody(body)).toThrowError(expect.objectContaining({ status: 400 }));
    });
  }
});

describe('buildCswUpstream', () => {
  it('GET catalogue: a KVP query on the configured address, numbers from the validated request', () => {
    const t = buildCswUpstream(parseCswBody({ catalogue: 'emodnet', op: 'GetRecords', startPosition: 21, maxRecords: 10 }));
    const u = new URL(t.url);
    expect(`${u.origin}${u.pathname}`).toBe(catalogueById('emodnet')!.cswUrl);
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      service: 'CSW', version: '2.0.2', request: 'GetRecords', resultType: 'results', typeNames: 'gmd:MD_Metadata', elementSetName: 'full',
      startPosition: '21', maxRecords: '10', outputSchema: 'http://www.isotc211.org/2005/gmd',
    });
    expect(t.post).toBeUndefined();
  });
  it('POST catalogue: an XML body with constants and the two numbers, 19115-3 included', () => {
    const t = buildCswUpstream(parseCswBody({ catalogue: 'marine-ie', op: 'GetRecords', startPosition: 4, maxRecords: 3, schema: 'iso19115-3' }));
    expect(t.url).toBe(catalogueById('marine-ie')!.cswUrl);
    expect(t.post!.contentType).toBe('application/xml');
    expect(t.post!.body).toContain('startPosition="4" maxRecords="3"');
    expect(t.post!.body).toContain('outputSchema="http://standards.iso.org/iso/19115/-3/mdb/2.0"');
    expect(t.post!.body).toContain('typeNames="mdb:MD_Metadata"');
  });
  it('GetCapabilities is a GET on both kinds of catalogue', () => {
    for (const id of ['emodnet', 'marine-ie']) {
      const t = buildCswUpstream(parseCswBody({ catalogue: id, op: 'GetCapabilities' }));
      expect(new URL(t.url).searchParams.get('request')).toBe('GetCapabilities');
      expect(t.post).toBeUndefined();
    }
  });
});

describe('POST /api/csw', () => {
  it('asks the catalogue (GET) with the stage-0 User-Agent and answers an opaque, uncached, no-sniff download', async () => {
    const { app, calls, resolved } = make();
    const res = await post(app, { catalogue: 'emodnet', op: 'GetRecords', startPosition: 11, maxRecords: 20 });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['content-disposition']).toBe('attachment');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(Buffer.from(res.body).toString('utf8')).toBe('<csw/>');
    expect(calls).toHaveLength(1);
    expect(calls[0].method ?? 'GET').toBe('GET');
    expect(calls[0].url.hostname).toBe('emodnet.ec.europa.eu');
    expect(calls[0].url.searchParams.get('startPosition')).toBe('11');
    expect(calls[0].headers['User-Agent']).toBe(USER_AGENT);
    expect(calls[0].headers['User-Agent']).toContain(`mailto:${SITE.contactEmail}`);
    expect(resolved).toEqual(['emodnet.ec.europa.eu']);
  });

  it('asks a POST catalogue with the XML the server built', async () => {
    const { app, calls } = make();
    const res = await post(app, { catalogue: 'marine-ie', op: 'GetRecords', startPosition: 5, maxRecords: 7 });
    expect(res.status).toBe(200);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url.hostname).toBe('data.marine.ie');
    expect(calls[0].headers['Content-Type']).toBe('application/xml');
    expect(calls[0].body).toContain('startPosition="5" maxRecords="7"');
  });

  it('passes an upstream refusal on with its status and a plain-seconds Retry-After only', async () => {
    const a = make({}, () => resp(503, '<html>queue</html>', { 'retry-after': '7' }));
    const r1 = await post(a.app, { catalogue: 'emodnet', op: 'GetCapabilities' });
    expect(r1.status).toBe(503);
    expect(r1.headers['retry-after']).toBe('7');
    const b = make({}, () => resp(429, 'x', { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' }));
    const r2 = await post(b.app, { catalogue: 'emodnet', op: 'GetCapabilities' });
    expect(r2.status).toBe(429);
    expect(r2.headers['retry-after']).toBeUndefined();
  });

  describe('never reaches anything but the listed catalogues', () => {
    const attacks: [string, unknown][] = [
      ['an extra url field', { catalogue: 'emodnet', op: 'GetRecords', url: 'https://evil.example/' }],
      ['a URL as the catalogue', { catalogue: 'https://evil.example/csw', op: 'GetRecords' }],
      ['an internal address as the catalogue', { catalogue: 'http://169.254.169.254/', op: 'GetCapabilities' }],
      ['an unknown catalogue', { catalogue: 'nosuch', op: 'GetCapabilities' }],
      ['a URL in the schema field', { catalogue: 'emodnet', op: 'GetRecords', schema: 'https://evil.example/' }],
      ['an oversized startPosition', { catalogue: 'emodnet', op: 'GetRecords', startPosition: 99999999999 }],
      ['an oversized maxRecords', { catalogue: 'emodnet', op: 'GetRecords', maxRecords: 500 }],
      ['user XML', { catalogue: 'marine-ie', op: 'GetRecords', xml: '<csw:GetRecords/>' }],
      ['an array', []],
    ];
    for (const [name, body] of attacks) {
      it(`${name}: 400, nothing resolved, nothing sent`, async () => {
        const { app, calls, resolved } = make();
        const res = await post(app, body);
        expect(res.status).toBe(400);
        expect(res.headers['x-fetch-proxy-error']).toBeTruthy();
        expect(calls).toHaveLength(0);
        expect(resolved).toHaveLength(0);
      });
    }

    it('a query string or header of the visitor changes nothing upstream', async () => {
      const { app, calls } = make();
      const res = await request(app)
        .post('/api/csw?url=https://evil.example/&catalogue=nosuch')
        .set('X-Forwarded-For', '9.9.9.9')
        .set('Host', 'evil.example')
        .set('Accept', 'text/html')
        .set('Cookie', 'a=b')
        .set('Content-Type', 'application/json')
        .buffer(true)
        .send(JSON.stringify({ catalogue: 'emodnet', op: 'GetCapabilities' }));
      expect(res.status).toBe(200);
      expect(calls[0].url.hostname).toBe('emodnet.ec.europa.eu');
      expect(JSON.stringify(calls[0].headers)).not.toMatch(/evil|Cookie|text\/html/i);
    });

    it('a redirect from a catalogue is not followed, for GET and for POST', async () => {
      for (const catalogue of ['emodnet', 'marine-ie']) {
        const { app, calls } = make({}, () => resp(302, '', { location: 'https://evil.example/x' }));
        const res = await post(app, { catalogue, op: 'GetRecords' });
        expect(res.status, catalogue).toBe(502);
        expect(res.headers['x-fetch-proxy-error']).toBe('redirect_refused');
        expect(calls, catalogue).toHaveLength(1);
      }
    });

    it('a catalogue name that resolves to a private address is refused', async () => {
      const { app, calls } = make({ resolver: async () => ['10.0.0.5'] });
      const res = await post(app, { catalogue: 'emodnet', op: 'GetCapabilities' });
      expect(res.status).toBe(422);
      expect(calls).toHaveLength(0);
    });

    it('/api/fetch still refuses a catalogue host that is not on its own allowlist', async () => {
      const { app, calls } = make();
      const res = await request(app).post('/api/fetch').set('Content-Type', 'application/json').send({ url: catalogueById('emodnet')!.cswUrl });
      expect(res.status).toBe(403);
      expect(calls).toHaveLength(0);
    });
  });

  it('cuts a body over the size cap (declared) with 413', async () => {
    const { app } = make({ cswMaxBytes: 10 }, () => resp(200, 'x'.repeat(100), { 'content-length': '100' }));
    const res = await post(app, { catalogue: 'emodnet', op: 'GetCapabilities' });
    expect(res.status).toBe(413);
  });

  it('answers 504 when the catalogue does not answer within the timeout', async () => {
    const { app } = make({ cswTimeoutMs: 30 }, () => ({ status: 200, headers: {}, body: (async function* () { await new Promise((r) => setTimeout(r, 300)); yield enc('late'); })(), destroy() {} }));
    const res = await post(app, { catalogue: 'emodnet', op: 'GetCapabilities' });
    expect(res.status).toBe(504);
  });

  it('only POST is allowed', async () => {
    const { app } = make();
    const res = await request(app).get('/api/csw');
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('POST');
  });

  it('paces one catalogue host whoever asks: the queue is full, the next request is 429 with Retry-After; another host is not held up', async () => {
    const { app, calls } = make({ cswPacing: { minIntervalMs: 60_000, maxQueue: 0 }, cswRateLimit: { limit: 1000 } });
    const first = await post(app, { catalogue: 'emodnet', op: 'GetCapabilities' }, '1.1.1.1');
    expect(first.status).toBe(200);
    const second = await post(app, { catalogue: 'emodnet', op: 'GetCapabilities' }, '2.2.2.2');
    expect(second.status).toBe(429);
    expect(Number(second.headers['retry-after'])).toBeGreaterThan(0);
    expect(second.headers['x-fetch-proxy-error']).toBe('csw_queue_full');
    const other = await post(app, { catalogue: 'marine-ie', op: 'GetCapabilities' }, '3.3.3.3');
    expect(other.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it('has its own per-IP limit, separate from /api/fetch', async () => {
    const { app } = make({ cswRateLimit: { limit: 2 }, cswPacing: { minIntervalMs: 0 } });
    for (let i = 0; i < 2; i++) expect((await post(app, { catalogue: 'emodnet', op: 'GetCapabilities' }, '5.5.5.5')).status).toBe(200);
    const third = await post(app, { catalogue: 'emodnet', op: 'GetCapabilities' }, '5.5.5.5');
    expect(third.status).toBe(429);
    const fetchRes = await request(app).post('/api/fetch').set('X-Forwarded-For', '5.5.5.5').set('Content-Type', 'application/json').send({ url: 'https://zenodo.org/api/records/1' });
    expect(fetchRes.status).not.toBe(429);
  });
});

describe('createHostPacer', () => {
  it('starts requests to one host at least minIntervalMs apart and does not mix hosts', async () => {
    let t = 0;
    const slept: number[] = [];
    const pacer = createHostPacer({ minIntervalMs: 1000, maxQueue: 10, now: () => t, sleep: async (ms) => void slept.push(ms) });
    await pacer.acquire('a'); // immediate
    await pacer.acquire('a'); // 1000 later
    await pacer.acquire('a'); // 2000 later
    await pacer.acquire('b'); // another host: immediate
    expect(slept).toEqual([1000, 2000]);
    t = 5000; // idle for a while: no wait
    await pacer.acquire('a');
    expect(slept).toEqual([1000, 2000]);
  });
  it('refuses when maxQueue requests already wait, saying how long the wait would be', async () => {
    const pacer = createHostPacer({ minIntervalMs: 1000, maxQueue: 2, now: () => 0, sleep: () => new Promise<void>(() => undefined) });
    await pacer.acquire('a');
    void pacer.acquire('a');
    void pacer.acquire('a');
    expect(pacer.waiting('a')).toBe(2);
    await expect(pacer.acquire('a')).rejects.toMatchObject({ status: 429, retryAfterSec: 3 });
  });
});

describe('createHostPacer: one client cannot starve the others, a dead client frees its slot', () => {
  it('(a) one client is limited to its share of the queue; another client is still served at the pace', async () => {
    let t = 0;
    const slept: number[] = [];
    const pacer = createHostPacer({ minIntervalMs: 1000, maxQueue: 20, maxPerClient: 2, now: () => t, sleep: (ms) => { slept.push(ms); return new Promise<void>(() => undefined); } });
    await pacer.acquire('h', 'flood'); // immediate
    void pacer.acquire('h', 'flood');
    void pacer.acquire('h', 'flood');
    for (let i = 0; i < 10; i++) await expect(pacer.acquire('h', 'flood')).rejects.toMatchObject({ status: 429, retryAfterSec: 3 });
    expect(pacer.waiting('h')).toBe(2);
    // the second client queues behind the two reservations: slot 3000 ms away, not pushed further by the refused flood
    void pacer.acquire('h', 'other');
    expect(slept).toEqual([1000, 2000, 3000]);
    expect(pacer.waiting('h')).toBe(3);
  });

  it('(b) an aborted waiter leaves the queue and gives its slot back', async () => {
    let t = 0;
    const slept: number[] = [];
    const pacer = createHostPacer({ minIntervalMs: 1000, now: () => t, sleep: (ms) => { slept.push(ms); return new Promise<void>(() => undefined); } });
    await pacer.acquire('h', 'a');
    const ctl = new AbortController();
    const dead = pacer.acquire('h', 'a', ctl.signal);
    expect(pacer.waiting('h')).toBe(1);
    ctl.abort();
    await expect(dead).rejects.toMatchObject({ status: 499 });
    expect(pacer.waiting('h')).toBe(0);
    void pacer.acquire('h', 'b');
    expect(slept).toEqual([1000, 1000]); // not 2000: the dead request's slot was returned
  });

  it('refuses at once for a request that is already aborted', async () => {
    const pacer = createHostPacer({ minIntervalMs: 1000, now: () => 0 });
    const ctl = new AbortController();
    ctl.abort();
    await expect(pacer.acquire('h', 'a', ctl.signal)).rejects.toMatchObject({ status: 499 });
    await pacer.acquire('h', 'a'); // nothing was reserved
    expect(pacer.waiting('h')).toBe(0);
  });
});

describe('POST /api/csw under flood and disconnects', () => {
  it('(a) one IP flooding a host gets 429s while a second IP is served', async () => {
    const { app, calls } = make({ cswPacing: { minIntervalMs: 150, maxPerClient: 2, maxQueue: 20 }, cswRateLimit: { limit: 1000 } });
    const flood = await Promise.all(Array.from({ length: 8 }, () => post(app, { catalogue: 'emodnet', op: 'GetCapabilities' }, '7.7.7.7')));
    const codes = flood.map((r) => r.status);
    expect(codes.filter((c) => c === 200).length).toBe(3); // one immediate, two waiting
    expect(codes.filter((c) => c === 429).length).toBe(5);
    const other = await post(app, { catalogue: 'emodnet', op: 'GetCapabilities' }, '8.8.8.8');
    expect(other.status).toBe(200);
    expect(calls).toHaveLength(4);
  });

  it('(b) a client that disconnects while waiting makes no upstream call and does not delay the next request', async () => {
    const { app, calls } = make({ cswPacing: { minIntervalMs: 400 }, cswRateLimit: { limit: 1000 } });
    const server = app.listen(0);
    try {
      const port = (server.address() as import('node:net').AddressInfo).port;
      const first = await fetch(`http://127.0.0.1:${port}/api/csw`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '1.1.1.1' }, body: JSON.stringify({ catalogue: 'emodnet', op: 'GetCapabilities' }) });
      await first.arrayBuffer();
      expect(calls).toHaveLength(1);
      const ctl = new AbortController();
      const dead = fetch(`http://127.0.0.1:${port}/api/csw`, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '2.2.2.2' }, body: JSON.stringify({ catalogue: 'emodnet', op: 'GetCapabilities' }) }).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 60));
      ctl.abort();
      await dead;
      await new Promise((r) => setTimeout(r, 40)); // the server notices the closed connection
      const t0 = Date.now();
      const live = await fetch(`http://127.0.0.1:${port}/api/csw`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '3.3.3.3' }, body: JSON.stringify({ catalogue: 'emodnet', op: 'GetCapabilities' }) });
      await live.arrayBuffer();
      expect(live.status).toBe(200);
      expect(Date.now() - t0).toBeLessThan(700); // a dead slot would have made it ~800 ms
      expect(calls).toHaveLength(2); // the first and the live one; none for the dead one
    } finally {
      server.close();
    }
  });
});
