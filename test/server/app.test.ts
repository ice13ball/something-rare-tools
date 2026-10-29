// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildCsp } from '../../config/hosts.js';
import { SITE } from '../../config/site.js';
import { createApp } from '../../server/index.js';
import type { Upstream, UpstreamResponse } from '../../server/fetchProxy.js';

const DIST = join(__dirname, '..', 'fixtures', 'dist');

async function* chunks(...parts: string[]): AsyncGenerator<Uint8Array> {
  for (const p of parts) yield new TextEncoder().encode(p);
}

function resp(status: number, body: AsyncIterable<Uint8Array> | string = '', headers: Record<string, string> = {}): UpstreamResponse {
  return { status, headers, body: typeof body === 'string' ? chunks(body) : body, destroy() {} };
}

function make(over: Partial<Parameters<typeof createApp>[0]> = {}) {
  const logs: string[] = [];
  const app = createApp({
    distDir: DIST,
    resolver: async () => ['193.0.6.139'],
    upstream: async () => resp(200, 'upstream-body', { 'content-type': 'text/csv', 'set-cookie': 'JSESSIONID=1' }),
    log: (l) => logs.push(l),
    ...over,
  });
  return { app, logs };
}

const post = (app: ReturnType<typeof createApp>, body: unknown, ip = '9.9.9.9') =>
  request(app).post('/api/fetch').set('X-Forwarded-For', ip).set('Content-Type', 'application/json').buffer(true).send(JSON.stringify(body));

/** Text of a proxied body: it is served as application/octet-stream, so supertest hands it over as a Buffer. */
const bodyText = (res: request.Response): string => (Buffer.isBuffer(res.body) ? res.body.toString('utf8') : res.text);

/** `noindex` defaults to the site flag; /api responses pass true (they are noindex either way). */
function expectCommonHeaders(res: request.Response, noindex: boolean = SITE.noindex) {
  expect(res.headers['content-security-policy']).toBe(buildCsp());
  expect(res.headers['x-content-type-options']).toBe('nosniff');
  expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(res.headers['strict-transport-security']).toBe('max-age=31536000');
  expect(res.headers['permissions-policy']).toBe('geolocation=(), camera=(), microphone=()');
  expect(res.headers['x-powered-by']).toBeUndefined();
  if (noindex) expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  else expect(res.headers['x-robots-tag']).toBeUndefined();
}

describe('static routes', () => {
  const { app } = make();

  for (const [path, marker] of [
    ['/', 'fixture-page-index'],
    ['/check', 'fixture-page-check'],
    ['/licence', 'fixture-page-licence'],
    ['/collection', 'fixture-page-collection'],
    ['/privacy', 'fixture-page-privacy'],
  ] as const) {
    it(`GET ${path} serves its page with every header`, async () => {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^text\/html/);
      expect(res.text).toContain(marker);
      if (SITE.noindex) expect(res.text).toContain('<meta name="robots" content="noindex,nofollow" />');
      else expect(res.text).not.toMatch(/name="robots"/);
      expectCommonHeaders(res);
    });
  }

  it('/licence/ and /collection/ answer 301 to the slash-less page, like the other pages; the target is fixed', async () => {
    for (const path of ['/check', '/licence', '/collection', '/privacy']) {
      const res = await request(app).get(path + '/');
      expect(res.status, path).toBe(301);
      expect(res.headers.location, path).toBe(path);
      expectCommonHeaders(res);
    }
  });

  it('/sitemap.xml lists the six pages, /licence, /collection and /convert among them', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect([...res.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])).toEqual([
      'https://tools.something-rare.com/',
      'https://tools.something-rare.com/check',
      'https://tools.something-rare.com/licence',
      'https://tools.something-rare.com/collection',
      'https://tools.something-rare.com/convert',
      'https://tools.something-rare.com/privacy',
    ]);
  });

  it('HEAD /check works', async () => {
    const res = await request(app).head('/check');
    expect(res.status).toBe(200);
    expectCommonHeaders(res);
  });

  it('GET /nope is a real 404 with the four-language page, a link home and every header', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    for (const phrase of ['Page not found', 'Nie znaleziono strony', 'Seite nicht gefunden', 'Page introuvable']) {
      expect(res.text).toContain(phrase);
    }
    expect(res.text).toContain('href="/"');
    // the AGPL source link and the section 7(b) attribution notice are reachable from every page, the 404 included
    expect(res.text).toContain('href="https://github.com/ice13ball/something-rare-tools"');
    expect(res.text).toContain('<a href="https://doi.org/10.5281/zenodo.19745884">Based on Abyssal Claims — © 2026 Michal Mazurowski</a>');
    // no inline script (the CSP forbids it): the only script is the static same-origin file
    expect(res.text).not.toMatch(/<script(?![^>]*\ssrc="\/not-found\.js")/);
    expect(res.text).toContain('<script src="/not-found.js" defer></script>');
    expectCommonHeaders(res);
  });

  describe('the 404 page: dark site layout, four languages, links to the tools home and the Atlas', () => {
    const visible = (html: string): string[] => [...html.matchAll(/<div class="nf" lang="(\w+)"([^>]*)>/g)].filter((m) => !m[2]!.includes('hidden')).map((m) => m[1]!);

    it('status 404, no-store, Vary: Accept-Language, dark base style, favicon, brand and the two part names', async () => {
      const res = await request(app).get('/nope');
      expect(res.status).toBe(404);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['vary']).toBe('Accept-Language');
      expect(res.text).toContain('background:#0a0e14');
      expect(res.text).toContain('href="/favicon.svg"');
      expect(res.text).toContain('Abyssal Claims <span class="brand-part">Tools</span>');
      expect(res.text).toContain('<title>Page not found — Abyssal Claims</title>');
      expect(res.text).not.toContain('target=');
    });

    it('the language: ?lang= first, then Accept-Language by quality, else English; an unknown value is ignored', async () => {
      expect(visible((await request(app).get('/nope')).text)).toEqual(['en']);
      expect(visible((await request(app).get('/nope').set('Accept-Language', 'de-DE,de;q=0.9,en;q=0.5')).text)).toEqual(['de']);
      expect(visible((await request(app).get('/nope').set('Accept-Language', 'xx,en;q=0.4,fr;q=0.8')).text)).toEqual(['fr']);
      expect(visible((await request(app).get('/nope?lang=pl').set('Accept-Language', 'de')).text)).toEqual(['pl']);
      expect(visible((await request(app).get('/nope?lang=xx').set('Accept-Language', 'de')).text)).toEqual(['de']);
      expect(visible((await request(app).get('/nope?lang=FR')).text)).toEqual(['fr']);
      const pl = (await request(app).get('/nope?lang=pl')).text;
      expect(pl).toContain('<html lang="pl">');
      expect(pl).toContain('<title>Nie znaleziono strony — Abyssal Claims</title>');
    });

    it('links to the tools home and to the Atlas with the language of its block, in the same tab', async () => {
      const html = (await request(app).get('/nope')).text;
      for (const [lang, tools] of [['pl', 'Narzędzia'], ['en', 'Tools'], ['de', 'Werkzeuge'], ['fr', 'Outils']] as const) {
        const block = html.slice(html.indexOf(`<div class="nf" lang="${lang}"`), html.indexOf('</div>', html.indexOf(`<div class="nf" lang="${lang}"`)));
        expect(block, lang).toContain(`<a href="/">${tools}</a>`);
        expect(block, lang).toContain(`<a href="https://something-rare.com/?lang=${lang}">Atlas</a>`);
        expect(block, lang).toContain('href="https://github.com/ice13ball/something-rare-tools"');
      }
    });

    it('wears the built stylesheet when the home page names one, and only a same-origin /assets one', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'dist-css-'));
      cpSync(DIST, dir, { recursive: true });
      writeFileSync(
        join(dir, 'index.html'),
        '<html><head><link rel="stylesheet" crossorigin href="/assets/index-abc123.css"><link rel="stylesheet" href="https://evil.example/x.css"></head><body>fixture-page-index</body></html>',
      );
      const html = (await request(make({ distDir: dir }).app).get('/nope')).text;
      expect(html).toContain('<link rel="stylesheet" crossorigin href="/assets/index-abc123.css" />');
      expect(html).not.toContain('evil.example');
    });

    it('serves /not-found.js and /fonts/* from dist when present, never directory listings or traversal', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'dist-fonts-'));
      cpSync(DIST, dir, { recursive: true });
      mkdirSync(join(dir, 'fonts'));
      writeFileSync(join(dir, 'fonts', 'barlow-latin-400-normal.woff2'), 'wOF2');
      writeFileSync(join(dir, 'not-found.js'), '/* x */');
      const a = make({ distDir: dir }).app;
      const font = await request(a).get('/fonts/barlow-latin-400-normal.woff2');
      expect(font.status).toBe(200);
      expect(font.headers['content-type']).toMatch(/font\/woff2/);
      expectCommonHeaders(font);
      expect((await request(a).get('/not-found.js')).status).toBe(200);
      expect((await request(a).get('/fonts/')).status).toBe(404);
      expect((await request(a).get('/fonts/%2e%2e/secret.txt')).status).toBe(404);
      expect((await request(app).get('/fonts/barlow-latin-400-normal.woff2')).status).toBe(404);
    });
  });

  it('404 for anything not listed: /check/anything, /index.html, /Check, /privacy/x, unlisted files in dist, /check//', async () => {
    for (const p of ['/check/anything', '/licence/x', '/licence/index.html', '/Licence', '/collection/x', '/collection/index.html', '/Collection', '/check/index.html', '/index.html', '/Check', '/PRIVACY', '/privacy/x', '/secret.txt', '/check//', '/assets', '/assets/', '/assets/missing.js', '/favicon.ico']) {
      const res = await request(app).get(p);
      expect(res.status, p).toBe(404);
      expect(res.text, p).not.toContain('fixture-page');
      expectCommonHeaders(res);
    }
  });

  it('path traversal out of /assets is refused', async () => {
    for (const p of ['/assets/../secret.txt', '/assets/%2e%2e/secret.txt', '/assets/..%2fsecret.txt', '/assets/%2e%2e%2fsecret.txt', '/assets/x.js/../../secret.txt']) {
      const res = await request(app).get(p);
      expect(res.status, p).not.toBe(200);
      expect(res.text, p).not.toContain('secret');
    }
  });

  it('non-GET methods on page routes are 404', async () => {
    expect((await request(app).post('/check')).status).toBe(404);
    expect((await request(app).put('/')).status).toBe(404);
  });

  it('/assets/* is served with an immutable cache and the headers', async () => {
    const res = await request(app).get('/assets/x.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.headers['cache-control']).toMatch(/immutable/);
    expect(res.headers['cache-control']).toMatch(/max-age=31536000/);
    expectCommonHeaders(res);
  });

  it('/consent-default.js and /robots.txt', async () => {
    const js = await request(app).get('/consent-default.js');
    expect(js.status).toBe(200);
    expect(js.headers['content-type']).toMatch(/javascript/);
    const robots = await request(app).get('/robots.txt');
    expect(robots.status).toBe(200);
    expect(robots.headers['content-type']).toMatch(/^text\/plain/);
    expect(robots.text).toBe('User-agent: *\nAllow: /\nSitemap: https://tools.something-rare.com/sitemap.xml\n');
    expect(robots.text).not.toMatch(/disallow/i);
    expectCommonHeaders(robots);
  });

  it('/favicon.svg is 404 when absent and served when present', async () => {
    expect((await request(app).get('/favicon.svg')).status).toBe(404);
    const dir = mkdtempSync(join(tmpdir(), 'dist-fav-'));
    cpSync(DIST, dir, { recursive: true });
    writeFileSync(join(dir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const res = await request(make({ distDir: dir }).app).get('/favicon.svg');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/svg/);
  });

  it('/og.jpg and /og.webp are served when present with their image types; /og.png is gone', async () => {
    expect((await request(app).get('/og.jpg')).status).toBe(404);
    const dir = mkdtempSync(join(tmpdir(), 'dist-og-'));
    cpSync(DIST, dir, { recursive: true });
    writeFileSync(join(dir, 'og.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    writeFileSync(join(dir, 'og.webp'), Buffer.from('RIFF0000WEBP'));
    writeFileSync(join(dir, 'og.png'), Buffer.from([0x89, 0x50]));
    const a = make({ distDir: dir }).app;
    const jpg = await request(a).get('/og.jpg');
    expect(jpg.status).toBe(200);
    expect(jpg.headers['content-type']).toBe('image/jpeg');
    const webp = await request(a).get('/og.webp');
    expect(webp.status).toBe(200);
    expect(webp.headers['content-type']).toBe('image/webp');
    expect((await request(a).get('/og.png')).status).toBe(404);
  });

  it('/og-convert.jpg and /og-convert.webp (the /convert preview) are served when present with their image types', async () => {
    expect((await request(app).get('/og-convert.jpg')).status).toBe(404);
    const dir = mkdtempSync(join(tmpdir(), 'dist-ogc-'));
    cpSync(DIST, dir, { recursive: true });
    writeFileSync(join(dir, 'og-convert.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    writeFileSync(join(dir, 'og-convert.webp'), Buffer.from('RIFF0000WEBP'));
    const a = make({ distDir: dir }).app;
    const jpg = await request(a).get('/og-convert.jpg');
    expect(jpg.status).toBe(200);
    expect(jpg.headers['content-type']).toBe('image/jpeg');
    const webp = await request(a).get('/og-convert.webp');
    expect(webp.status).toBe(200);
    expect(webp.headers['content-type']).toBe('image/webp');
  });

  it('refuses to start without the HTML pages', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dist-empty-'));
    expect(() => make({ distDir: dir })).toThrow(/index\.html/);
  });
});

describe('noindex flag', () => {
  it('defaults to SITE.noindex (false: pages are indexable)', async () => {
    const res = await request(make().app).get('/check');
    expect(res.headers['x-robots-tag']).toBeUndefined();
    expect(res.text).not.toMatch(/name="robots"/);
  });
  it('noindex:true sends X-Robots-Tag and keeps the robots meta on every page', async () => {
    const { app } = make({ noindex: true });
    for (const p of ['/', '/check', '/licence', '/collection', '/privacy']) {
      const res = await request(app).get(p);
      expectCommonHeaders(res, true);
      expect(res.text, p).toContain('<meta name="robots" content="noindex,nofollow" />');
    }
  });
  it('noindex:false drops X-Robots-Tag everywhere and strips the robots meta from served HTML', async () => {
    const { app } = make({ noindex: false });
    for (const p of ['/', '/check', '/check/', '/licence', '/licence/', '/collection', '/collection/', '/privacy', '/nope', '/robots.txt', '/sitemap.xml']) {
      const res = await request(app).get(p);
      expectCommonHeaders(res, false);
      expect(res.text, p).not.toMatch(/name="robots"/);
    }
    const res = await request(app).get('/check');
    expect(res.text).toContain('fixture-page-check');
    expect(res.text).toContain('<meta charset="UTF-8" />');
  });
  it('noindex:true keeps the tag on /api responses too', async () => {
    const res = await post(make({ noindex: true }).app, { url: 'http://zenodo.org/' });
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  });
  it('noindex:false still keeps every /api response out of the index', async () => {
    const { app } = make({ noindex: false });
    const ok = await post(app, { url: 'https://zenodo.org/' });
    expect(ok.status).toBe(200);
    const refused = await post(app, { url: 'http://zenodo.org/' });
    const wrongMethod = await request(app).get('/api/fetch');
    const unknown = await request(app).get('/api/other');
    for (const res of [ok, refused, wrongMethod, unknown]) expectCommonHeaders(res, true);
  });
});

describe('POST /api/fetch — input validation', () => {
  const { app } = make();

  it('GET /api/fetch is 405 and other /api paths are 404', async () => {
    const g = await request(app).get('/api/fetch');
    expect(g.status).toBe(405);
    expect(g.headers.allow).toBe('POST');
    expect((await request(app).post('/api/other')).status).toBe(404);
  });

  it('400 for a missing, non-string or oversized url', async () => {
    for (const body of [{}, { url: 5 }, { url: null }, { url: ['https://zenodo.org/'] }, { url: '' }, [], 'str', null]) {
      const res = await post(app, body);
      expect(res.status, JSON.stringify(body)?.slice(0, 40)).toBe(400);
    }
  });
  it('an oversized url is refused (the 2 kB body limit bites first: 413; the 2048-character check is the second line)', async () => {
    const res = await post(app, { url: 'https://zenodo.org/' + 'a'.repeat(2048) });
    expect([400, 413]).toContain(res.status);
    // the largest URL that fits the 2 kB body (JSON overhead included) is accepted
    const url = 'https://zenodo.org/' + 'a'.repeat(2000);
    expect((await post(app, { url })).status).toBe(200);
  });
  it('400 for a non-string, oversized or non-printable accept', async () => {
    for (const accept of [5, {}, 'a'.repeat(201), 'text/csv\r\nX-Evil: 1', 'tëxt']) {
      expect((await post(app, { url: 'https://zenodo.org/', accept })).status, String(accept).slice(0, 20)).toBe(400);
    }
    expect((await post(app, { url: 'https://zenodo.org/', accept: 'a'.repeat(200) })).status).toBe(200);
  });
  it('400 for malformed JSON and for a non-JSON content type', async () => {
    const bad = await request(app).post('/api/fetch').set('Content-Type', 'application/json').send('{bad');
    expect(bad.status).toBe(400);
    const text = await request(app).post('/api/fetch').set('Content-Type', 'text/plain').send('{"url":"https://zenodo.org/"}');
    expect(text.status).toBe(400);
    expectCommonHeaders(bad, true);
  });
  it('413 for a body above 2 kB', async () => {
    const res = await post(app, { url: 'https://zenodo.org/', accept: 'x', pad: 'p'.repeat(2100) });
    expect(res.status).toBe(413);
    expectCommonHeaders(res, true);
  });
  it('refuses http, a non-allowlisted host, a private resolution and a redirect to the metadata address', async () => {
    expect((await post(app, { url: 'http://zenodo.org/' })).status).toBe(400);
    expect((await post(app, { url: 'https://evil.example/' })).status).toBe(403);
    expect((await post(app, { url: 'https://169.254.169.254/' })).status).toBe(422);
    const priv = make({ resolver: async () => ['127.0.0.1'] }).app;
    expect((await post(priv, { url: 'https://zenodo.org/' })).status).toBe(422);
    const redir = make({ upstream: async () => resp(302, '', { location: 'https://169.254.169.254/latest' }) }).app;
    const r = await post(redir, { url: 'https://zenodo.org/' });
    expect(r.status).toBe(422);
    expect(r.headers['x-fetch-proxy-error']).toBeTruthy();
    const redir2 = make({ upstream: async () => resp(302, '', { location: 'https://evil.example/' }) }).app;
    expect((await post(redir2, { url: 'https://zenodo.org/' })).status).toBe(403);
  });
});

describe('POST /api/fetch — proxying', () => {
  it('streams the body, forwards only content-type, never a cookie, and sets the app headers', async () => {
    const { app } = make();
    const res = await post(app, { url: 'https://opendap.iopan.pl/x.csv', accept: 'text/csv' });
    expect(res.status).toBe(200);
    expect(bodyText(res)).toBe('upstream-body');
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['content-disposition']).toBe('attachment');
    expect(res.headers['x-upstream-content-type']).toBe('text/csv');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
    expectCommonHeaders(res, true);
  });
  it('never serves upstream HTML as HTML: octet-stream + attachment + nosniff, the upstream type only in a side header', async () => {
    const { app } = make({ upstream: async () => resp(200, '<html><script>alert(1)</script></html>', { 'content-type': 'text/html; charset=utf-8' }) });
    const res = await post(app, { url: 'https://geonetwork.iopan.pl/x' });
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['content-disposition']).toBe('attachment');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-upstream-content-type']).toBe('text/html; charset=utf-8');
  });
  it('without an upstream content-type: still octet-stream, no side header', async () => {
    const { app } = make({ upstream: async () => resp(200, 'x') });
    const res = await post(app, { url: 'https://zenodo.org/x' });
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['x-upstream-content-type']).toBeUndefined();
  });
  it('sanitises the upstream type for the side header: printable ASCII only, at most 100 characters', async () => {
    const dirty = 'text/csv; name=caf\u00e9\u0001\u007f' + 'x'.repeat(200);
    const { app } = make({ upstream: async () => resp(200, 'x', { 'content-type': dirty }) });
    const res = await post(app, { url: 'https://zenodo.org/x' });
    const v = res.headers['x-upstream-content-type'];
    expect(v).toMatch(/^[\x20-\x7e]+$/);
    expect(v.length).toBeLessThanOrEqual(100);
    expect(v.startsWith('text/csv; name=caf')).toBe(true);
  });
  it('passes an upstream 404 through with its body', async () => {
    const { app } = make({ upstream: async () => resp(404, 'gone', { 'content-type': 'text/plain' }) });
    const res = await post(app, { url: 'https://zenodo.org/api/records/0' });
    expect(res.status).toBe(404);
    expect(bodyText(res)).toBe('gone');
  });
  it('413 when Content-Length is above the cap — no 200 header is ever sent', async () => {
    const { app } = make({ maxBytes: 10, upstream: async () => resp(200, 'x'.repeat(11), { 'content-length': '11' }) });
    const res = await post(app, { url: 'https://zenodo.org/' });
    expect(res.status).toBe(413);
  });
  it('413 when the first streamed chunk already exceeds the cap', async () => {
    const { app } = make({ maxBytes: 10, upstream: async () => resp(200, 'x'.repeat(11)) });
    expect((await post(app, { url: 'https://zenodo.org/' })).status).toBe(413);
  });
  it('504 when upstream never answers', async () => {
    const { app } = make({ timeoutMs: 40, upstream: () => new Promise(() => {}) });
    expect((await post(app, { url: 'https://zenodo.org/' })).status).toBe(504);
  });
  it('502 when upstream is unreachable', async () => {
    const { app } = make({
      upstream: async () => {
        throw new Error('ECONNREFUSED 10.0.0.1:443');
      },
    });
    const res = await post(app, { url: 'https://zenodo.org/' });
    expect(res.status).toBe(502);
    expect(res.text).not.toMatch(/10\.0\.0\.1|ECONNREFUSED/);
  });

  it('a body that exceeds the cap mid-stream destroys the response (no clean end) and logs the bytes actually sent', async () => {
    const { app, logs } = make({ maxBytes: 100, upstream: async () => resp(200, chunks('a'.repeat(60), 'b'.repeat(60)), { 'content-type': 'text/csv' }) });
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    try {
      const outcome = await new Promise<string>((resolve) => {
        const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/fetch', headers: { 'content-type': 'application/json' } }, (res) => {
          res.on('data', () => {});
          res.on('end', () => resolve(res.complete ? 'clean-end' : 'aborted'));
          res.on('aborted', () => resolve('aborted'));
          res.on('error', () => resolve('aborted'));
          res.on('close', () => resolve(res.complete ? 'clean-end' : 'aborted'));
        });
        req.on('error', () => resolve('aborted'));
        req.end(JSON.stringify({ url: 'https://zenodo.org/big' }));
      });
      expect(outcome).toBe('aborted');
      await new Promise((r) => setTimeout(r, 50));
      expect(logs).toHaveLength(1);
      expect(JSON.parse(logs[0])).toEqual({ host: 'zenodo.org', status: 200, bytes: 60 });
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});

describe('logging', () => {
  it('writes one {host,status,bytes} JSON line per proxied request and never a path, query or body', async () => {
    const { app, logs } = make();
    const url = 'https://zenodo.org/api/records/123456?access_token=SECRETTOKEN&q=needle';
    await post(app, { url });
    expect(logs).toHaveLength(1);
    expect(Object.keys(JSON.parse(logs[0])).sort()).toEqual(['bytes', 'host', 'status']);
    expect(JSON.parse(logs[0])).toEqual({ host: 'zenodo.org', status: 200, bytes: 'upstream-body'.length });
    for (const leak of ['api/records', '123456', 'SECRETTOKEN', 'needle', 'access_token', 'https://']) expect(logs[0]).not.toContain(leak);
    expect(logs[0]).not.toContain('\n');
  });
  it('a refused request is logged with its status, 0 bytes, and no host unless it is an allowlisted one', async () => {
    const { app, logs } = make();
    await post(app, { url: 'https://evil.example/secret-path?token=1' });
    await post(app, { url: 'https://opendap.iopan.pl/x', accept: 5 });
    expect(logs.map((l) => JSON.parse(l))).toEqual([
      { host: null, status: 403, bytes: 0 },
      { host: 'opendap.iopan.pl', status: 400, bytes: 0 },
    ]);
    expect(logs.join('')).not.toMatch(/evil|secret|token/);
  });
});

describe('rate limit', () => {
  it('allows 30 requests per minute per client and answers the 31st with 429 + Retry-After', async () => {
    const { app } = make();
    for (let i = 0; i < 30; i++) expect((await post(app, { url: 'https://zenodo.org/' }, '7.7.7.7')).status, `request ${i + 1}`).toBe(200);
    const res = await post(app, { url: 'https://zenodo.org/' }, '7.7.7.7');
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(60);
    expectCommonHeaders(res, true);
    // another client is unaffected
    expect((await post(app, { url: 'https://zenodo.org/' }, '8.8.8.8')).status).toBe(200);
  });
  it('keys on the LAST X-Forwarded-For entry (trimmed); client-supplied earlier entries do not change the bucket', async () => {
    const { app } = make();
    for (let i = 0; i < 30; i++) {
      const res = await request(app)
        .post('/api/fetch')
        .set('X-Forwarded-For', ` 10.0.0.${i} , 5.5.5.5 `)
        .set('Content-Type', 'application/json')
        .send('{"url":"https://zenodo.org/"}');
      expect(res.status).toBe(200);
    }
    const res = await request(app).post('/api/fetch').set('X-Forwarded-For', '5.5.5.5').set('Content-Type', 'application/json').send('{"url":"https://zenodo.org/"}');
    expect(res.status).toBe(429);
  });
  it('without X-Forwarded-For it keys on the socket address', async () => {
    const { app } = make();
    for (let i = 0; i < 30; i++) {
      expect((await request(app).post('/api/fetch').set('Content-Type', 'application/json').send('{"url":"https://zenodo.org/"}')).status).toBe(200);
    }
    expect((await request(app).post('/api/fetch').set('Content-Type', 'application/json').send('{"url":"https://zenodo.org/"}')).status).toBe(429);
  });
  it('bad requests count against the limit too', async () => {
    const { app } = make();
    for (let i = 0; i < 30; i++) await post(app, {}, '6.6.6.6');
    expect((await post(app, { url: 'https://zenodo.org/' }, '6.6.6.6')).status).toBe(429);
  });
  it('does not trust the proxy for anything else: req.ip stays the socket address', async () => {
    const { app } = make();
    // X-Forwarded-Proto / -Host must not alter anything the app produces
    const res = await request(app).get('/check').set('X-Forwarded-Proto', 'http').set('X-Forwarded-Host', 'evil.example');
    expect(res.status).toBe(200);
  });
});
