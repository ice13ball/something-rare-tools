// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The hidden /convert page (stage 0): headers, the per-path CSP hook, and the guarantee that nothing else changed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildCsp, DATA_HOSTS, isAllowedHost } from '../../config/hosts.js';
import { createApp } from '../../server/index.js';
import { HIDDEN_PATHS, PAGE_CONNECT_HOSTS, prepareHtml } from '../../server/headers.js';

const DIST = join(__dirname, '..', 'fixtures', 'dist');
const make = (over: Partial<Parameters<typeof createApp>[0]> = {}) => createApp({ distDir: DIST, log: () => {}, ...over });

/**
 * The policy as served on 24.10.2026 (origin/main ed018b7), word for word. Every path but /convert must send exactly this.
 * When a host is added to config/hosts.ts on purpose, this literal is updated in the same change; nothing else may move it.
 */
const BASELINE_CSP =
  "default-src 'self'; connect-src 'self' https://opendap.iopan.pl https://geo.iopan.pl https://geonetwork.iopan.pl https://zenodo.org https://doi.pangaea.de https://api.datacite.org https://repod.icm.edu.pl https://danebadawcze.uw.edu.pl https://api.gbif.org https://api.obis.org https://ipt.vliz.be https://www.marine.csiro.au https://hosted-datasets.gbif.org https://ipt-obis.gbif.us https://ipt.iobis.org https://ipt.env.duke.edu https://ipt.obis.org https://members.oceantrack.org https://ipt.inbo.be https://nzobisipt.niwa.co.nz https://ipt.biodiversity.aq https://ipt.sibbr.gov.br https://ipt.biodiversidad.co https://ipt.medobis.eu https://geo.abds.is https://data.aad.gov.au https://datasets.obis.org https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://region1.analytics.google.com https://stats.g.doubleclick.net https://basemaps.cartocdn.com https://tiles.basemaps.cartocdn.com https://tiles-a.basemaps.cartocdn.com https://tiles-b.basemaps.cartocdn.com https://tiles-c.basemaps.cartocdn.com https://tiles-d.basemaps.cartocdn.com; worker-src 'self' blob:; img-src 'self' data: blob: https://basemaps.cartocdn.com https://tiles.basemaps.cartocdn.com https://tiles-a.basemaps.cartocdn.com https://tiles-b.basemaps.cartocdn.com https://tiles-c.basemaps.cartocdn.com https://tiles-d.basemaps.cartocdn.com https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://region1.analytics.google.com https://stats.g.doubleclick.net; script-src 'self' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'";

/**
 * The policy of /convert before any lookup host: the baseline with connect-src cut to 'self' and the analytics hosts (GA after consent). No data host
 * (the page takes no links, Q4) and no map host. Everything else is the baseline, word for word.
 */
const CONVERT_CSP_BARE = BASELINE_CSP.replace(/connect-src [^;]*;/, "connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://region1.analytics.google.com https://stats.g.doubleclick.net;");

/** The policy of /convert as served from stage 4 on: the bare one plus the WoRMS REST host (the opt-in lookup), and nothing else. */
const CONVERT_CSP = CONVERT_CSP_BARE.replace('https://stats.g.doubleclick.net;', 'https://stats.g.doubleclick.net https://www.marinespecies.org;');

describe('buildCsp', () => {
  it('a default call is byte-identical to the policy in production today', () => {
    expect(buildCsp()).toBe(BASELINE_CSP);
    expect(buildCsp([])).toBe(BASELINE_CSP);
  });

  it('extra connect hosts are added to connect-src only, after the existing ones', () => {
    const extra = buildCsp(['www.marinespecies.org', 'vocab.nerc.ac.uk']);
    expect(extra).toBe(BASELINE_CSP.replace('https://tiles-d.basemaps.cartocdn.com; worker-src', 'https://tiles-d.basemaps.cartocdn.com https://www.marinespecies.org https://vocab.nerc.ac.uk; worker-src'));
    const directives = (c: string) => c.split('; ').map((d) => d.split(' ')[0]);
    expect(directives(extra)).toEqual(directives(BASELINE_CSP));
  });

  it('{ data: false } cuts connect-src to self, analytics and the extras, and changes nothing else', () => {
    expect(buildCsp([], { data: false })).toBe(CONVERT_CSP_BARE);
    expect(buildCsp([], { data: true })).toBe(BASELINE_CSP);
    expect(buildCsp(['www.marinespecies.org'], { data: false })).toBe(CONVERT_CSP);
  });

  it('the extra hosts never reach DATA_HOSTS (which also feeds the proxy)', () => {
    buildCsp(['www.marinespecies.org']);
    expect(DATA_HOSTS).not.toContain('www.marinespecies.org');
    // the fetch proxy answers only for DATA_HOSTS: WoRMS is never routed through the server
    expect(isAllowedHost('https://www.marinespecies.org/rest/AphiaRecordsByMatchNames?scientificnames[]=Calanus')).toBe(false);
  });
});

describe('every page keeps its exact policy', () => {
  const app = make();
  for (const path of ['/', '/check', '/licence', '/collection', '/privacy', '/nope', '/check/', '/licence/', '/collection/', '/privacy/', '/robots.txt', '/sitemap.xml']) {
    it(`${path}: the CSP is the baseline, string for string`, async () => {
      const res = await request(app).get(path);
      expect(res.headers['content-security-policy']).toBe(BASELINE_CSP);
    });
  }
});

describe('/convert is hidden', () => {
  it('is registered as hidden, with WoRMS as its only extra connect host (stage 4)', () => {
    expect(HIDDEN_PATHS).toEqual(['/convert']);
    expect(PAGE_CONNECT_HOSTS).toEqual({ '/convert': ['www.marinespecies.org'] });
  });

  it('answers with noindex in the header and the robots meta in the HTML, with the site flag on or off', async () => {
    for (const noindex of [true, false]) {
      const res = await request(make({ noindex })).get('/convert');
      expect(res.status).toBe(200);
      expect(res.text).toContain('fixture-page-convert');
      expect(res.headers['x-robots-tag'], String(noindex)).toBe('noindex, nofollow');
      expect(res.text, String(noindex)).toMatch(/<meta name="robots" content="noindex, nofollow" \/>/);
      expect(res.headers['content-type']).toMatch(/^text\/html/);
    }
  });

  it('/convert/ answers 301 to /convert, with the same noindex header and policy', async () => {
    const res = await request(make({ noindex: false })).get('/convert/');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/convert');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('pins the exact policy of /convert (stage 4): the connect-src literal and the rest of the baseline', () => {
    expect(CONVERT_CSP).toBe(
      "default-src 'self'; connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://region1.analytics.google.com https://stats.g.doubleclick.net https://www.marinespecies.org; worker-src 'self' blob:; img-src 'self' data: blob: https://basemaps.cartocdn.com https://tiles.basemaps.cartocdn.com https://tiles-a.basemaps.cartocdn.com https://tiles-b.basemaps.cartocdn.com https://tiles-c.basemaps.cartocdn.com https://tiles-d.basemaps.cartocdn.com https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://region1.analytics.google.com https://stats.g.doubleclick.net; script-src 'self' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    );
  });

  it('gets its own exact policy: self, analytics and WoRMS only, no data host and no map host', async () => {
    for (const p of ['/convert', '/convert/']) {
      const res = await request(make()).get(p);
      expect(res.headers['content-security-policy'], p).toBe(CONVERT_CSP);
    }
    expect(CONVERT_CSP).toContain("connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://region1.analytics.google.com https://stats.g.doubleclick.net https://www.marinespecies.org;");
    const connect = /connect-src ([^;]*)/.exec(CONVERT_CSP)![1];
    for (const h of DATA_HOSTS) expect(connect, h).not.toContain(h);
    expect(connect).not.toContain('cartocdn');
    // what GA needs today is what the global policy gives it: every analytics host of the baseline is still there
    for (const h of ['www.googletagmanager.com', 'www.google-analytics.com', 'region1.google-analytics.com', 'analytics.google.com', 'region1.analytics.google.com', 'stats.g.doubleclick.net']) expect(connect).toContain(h);
    expect(CONVERT_CSP).toContain("script-src 'self' https://www.googletagmanager.com");
  });

  it('the other security headers are the same as on every page', async () => {
    const a = await request(make()).get('/convert');
    const b = await request(make()).get('/privacy');
    for (const h of ['x-content-type-options', 'referrer-policy', 'strict-transport-security', 'permissions-policy']) expect(a.headers[h], h).toBe(b.headers[h]);
  });

  it('is not in the sitemap and not in robots.txt (no Disallow line either)', async () => {
    const app = make({ noindex: false });
    const sitemap = await request(app).get('/sitemap.xml');
    expect(sitemap.text).not.toMatch(/convert/);
    const robots = await request(app).get('/robots.txt');
    expect(robots.text).not.toMatch(/convert/i);
    expect(robots.text).not.toMatch(/disallow/i);
  });

  it('every other path keeps its headers: no robots header with the site flag off (the API stays noindex)', async () => {
    const app = make({ noindex: false });
    for (const p of ['/', '/check', '/licence', '/collection', '/privacy', '/check/', '/nope', '/robots.txt', '/sitemap.xml', '/convertx', '/Convert', '/convert/x']) {
      const res = await request(app).get(p);
      expect(res.headers['x-robots-tag'], p).toBeUndefined();
      expect(res.headers['content-security-policy'], p).toBe(BASELINE_CSP);
    }
    expect((await request(app).get('/api/other')).headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('the extended policy applies to /convert only (and WoRMS is in no other path, in DATA_HOSTS or in the proxy allowlist)', async () => {
    const extended = buildCsp(['www.marinespecies.org'], { data: false });
    expect(extended).toBe(CONVERT_CSP);
    const app = createApp({ distDir: DIST, log: () => {}, pageConnect: { '/convert': ['www.marinespecies.org'] } });
    expect((await request(app).get('/convert')).headers['content-security-policy']).toBe(extended);
    expect((await request(app).get('/convert/')).headers['content-security-policy']).toBe(extended);
    for (const p of ['/', '/check', '/licence', '/collection', '/privacy', '/nope']) {
      expect((await request(app).get(p)).headers['content-security-policy'], p).toBe(BASELINE_CSP);
    }
  });
});

describe('prepareHtml', () => {
  const html = '<head>\n    <meta name="robots" content="noindex, nofollow" />\n</head>';
  it('strips the tag when the flag is off and keeps it when forced', () => {
    expect(prepareHtml(html, false)).not.toMatch(/robots/);
    expect(prepareHtml(html, true)).toBe(html);
  });
  it('the real source of the hidden page carries the tag, and the other sources carry none', () => {
    const root = join(__dirname, '..', '..');
    expect(readFileSync(join(root, 'convert', 'index.html'), 'utf8')).toMatch(/<meta name="robots" content="noindex, nofollow" \/>/);
    expect(prepareHtml(readFileSync(join(root, 'convert', 'index.html'), 'utf8'), true)).toMatch(/name="robots"/);
  });
});
