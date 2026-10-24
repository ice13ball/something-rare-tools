// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { CSW_HOSTS } from '../config/catalogues';
import { IPT_HOSTS, REGISTRY_HOSTS } from '../config/ipt';
import { DATA_HOSTS, GA_HOSTS, MAP_HOSTS, MAP_PRIVACY_URL, buildCsp, isAllowedHost } from '../config/hosts';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE } from '../config/site';
import { robotsMeta } from '../vite.config';
import { UI } from '../src/core/i18n/ui';

describe('isAllowedHost', () => {
  it('accepts https on an allowlisted host', () => {
    expect(isAllowedHost('https://zenodo.org/api/records/1')).toBe(true);
  });
  it('refuses http', () => {
    expect(isAllowedHost('http://zenodo.org/x')).toBe(false);
  });
  it('refuses a look-alike suffix host', () => {
    expect(isAllowedHost('https://zenodo.org.evil.com/')).toBe(false);
  });
  it('refuses an allowlisted name that only appears in the query', () => {
    expect(isAllowedHost('https://evil.com/?zenodo.org')).toBe(false);
  });
  it('refuses userinfo tricks and unparseable input', () => {
    expect(isAllowedHost('https://zenodo.org@evil.com/')).toBe(false);
    expect(isAllowedHost('not a url')).toBe(false);
  });
  it('is case-insensitive on the host name', () => {
    expect(isAllowedHost('https://ZENODO.org/x')).toBe(true);
  });
});

describe('host lists', () => {
  it('contain no wildcards and no duplicates', () => {
    const all = [...DATA_HOSTS, ...GA_HOSTS, ...MAP_HOSTS];
    expect(all.length).toBeGreaterThan(10);
    for (const h of all) expect(h).not.toContain('*');
    expect(new Set(all).size).toBe(all.length);
  });
  it('DATA_HOSTS holds the hosts the plan names', () => {
    for (const h of ['opendap.iopan.pl', 'geo.iopan.pl', 'geonetwork.iopan.pl', 'zenodo.org', 'doi.pangaea.de', 'api.datacite.org']) {
      expect(DATA_HOSTS).toContain(h);
    }
  });
});

describe('hosts nothing fetches', () => {
  it('doi.org and data.crosscite.org are neither proxied nor in the CSP (least privilege; DOIs go through api.datacite.org)', () => {
    for (const h of ['doi.org', 'dx.doi.org', 'data.crosscite.org']) {
      expect(DATA_HOSTS).not.toContain(h);
      expect(buildCsp()).not.toContain(`https://${h}`);
    }
  });
});

describe('GBIF and OBIS hosts', () => {
  it('the registries and every IPT host on the static list are in DATA_HOSTS (proxy and CSP) and nothing else is', () => {
    expect(DATA_HOSTS).toEqual(expect.arrayContaining(['api.gbif.org', 'api.obis.org', ...IPT_HOSTS]));
    expect(IPT_HOSTS.length).toBeGreaterThanOrEqual(15);
    const csp = buildCsp();
    for (const h of [...REGISTRY_HOSTS, ...IPT_HOSTS]) expect(csp).toContain('https://' + h);
    expect(isAllowedHost('https://ipt.vliz.be/eurobis/archive.do?r=x')).toBe(true);
    expect(isAllowedHost('http://ipt.vliz.be/eurobis/archive.do?r=x')).toBe(false);
    expect(isAllowedHost('https://ipt.vliz.be.evil.com/x')).toBe(false);
    expect(isAllowedHost('https://ipt.vliz.be@evil.com/x')).toBe(false);
    expect(isAllowedHost('https://ipt.example.org/x')).toBe(false);
  });
});

describe('map and analytics hosts', () => {
  it('MAP_HOSTS are exactly the hosts the CARTO dark-matter-nolabels style, its tiles.json, glyphs and sprite use', () => {
    expect([...MAP_HOSTS].sort()).toEqual([
      'basemaps.cartocdn.com', // style.json
      'tiles-a.basemaps.cartocdn.com', // vector tiles (tiles.json)
      'tiles-b.basemaps.cartocdn.com',
      'tiles-c.basemaps.cartocdn.com',
      'tiles-d.basemaps.cartocdn.com',
      'tiles.basemaps.cartocdn.com', // tiles.json, glyphs, sprite
    ]);
  });
  it('GA_HOSTS include the GA4 EU collection host, as an explicit name', () => {
    expect(GA_HOSTS).toContain('region1.analytics.google.com');
    expect(GA_HOSTS).toContain('region1.google-analytics.com');
  });
});

describe('buildCsp', () => {
  const csp = buildCsp();
  const directive = (name: string) => csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + ' ')) ?? '';

  it('has connect-src with self and the data hosts, and no wildcard', () => {
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain('https://api.datacite.org');
    expect(csp).not.toContain('*');
  });
  it('lists every data, GA and map host in connect-src', () => {
    const c = directive('connect-src');
    for (const h of [...DATA_HOSTS, ...GA_HOSTS, ...MAP_HOSTS]) expect(c).toContain('https://' + h);
  });
  it('sets the fixed directives', () => {
    expect(directive('worker-src')).toBe("worker-src 'self' blob:");
    expect(directive('script-src')).toBe("script-src 'self' https://www.googletagmanager.com");
    expect(directive('style-src')).toBe("style-src 'self' 'unsafe-inline'");
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(directive('base-uri')).toBe("base-uri 'self'");
  });
  it('img-src allows data, blob, map and GA hosts', () => {
    const i = directive('img-src');
    expect(i).toContain("'self' data: blob:");
    expect(i).toContain('https://basemaps.cartocdn.com');
    expect(i).toContain('https://www.google-analytics.com');
  });
});

describe('SITE', () => {
  it('is indexable with the public GA id', () => {
    expect(SITE.noindex).toBe(false);
    expect(SITE.gaId).toBe('G-S5HR4WT0ZG');
    expect(SITE.origin).toBe('https://tools.something-rare.com');
  });
});

describe('robots meta in the build', () => {
  const inject = (noindex: boolean) => (robotsMeta(noindex).transformIndexHtml as () => unknown[])();

  it('the HTML sources carry none: the flag alone decides', () => {
    for (const f of ['index.html', 'check/index.html', 'licence/index.html', 'collection/index.html', 'privacy/index.html']) {
      expect(readFileSync(join(__dirname, '..', f), 'utf8'), f).not.toMatch(/name="robots"/);
    }
  });
  it('the hidden page carries its own, and the plugin does not add a second one', () => {
    const src = readFileSync(join(__dirname, '..', 'convert/index.html'), 'utf8');
    expect(src.match(/name="robots"/g)).toHaveLength(1);
    const withHtml = (noindex: boolean, html: string) => (robotsMeta(noindex).transformIndexHtml as (h: string) => unknown[])(html);
    expect(withHtml(true, src)).toEqual([]);
    expect(withHtml(true, '<head></head>')).toHaveLength(1);
  });
  it('the Vite plugin injects it only while noindex', () => {
    expect(inject(true)).toEqual([{ tag: 'meta', attrs: { name: 'robots', content: 'noindex,nofollow' }, injectTo: 'head-prepend' }]);
    expect(inject(false)).toEqual([]);
  });
});

describe('.gitignore', () => {
  it('keeps the private converter test data out of the repository', () => {
    const lines = readFileSync(join(__dirname, '..', '.gitignore'), 'utf8').split('\n').map((l) => l.trim());
    expect(lines).toContain('/test/convert-private/');
    // and git agrees: a file in that folder is ignored (check-ignore exits 0), one next to it is not (exit 1)
    const cwd = join(__dirname, '..');
    if (spawnSync('git', ['rev-parse', '--git-dir'], { cwd }).status !== 0) return; // not a checkout (a source tarball): the line above is the check
    const ignored = (path: string): number => spawnSync('git', ['check-ignore', '-q', path], { cwd }).status ?? -1;
    expect(ignored('test/convert-private/sheet.xlsx')).toBe(0);
    expect(ignored('test/convert-private/deep/dir/x.csv')).toBe(0);
    expect(ignored('test/convert/sheet.xlsx')).toBe(1);
  });
});

describe('static privacy page', () => {
  it('carries the same English text as the app for the third-party, hosting-log, legal-basis and contact paragraphs', () => {
    const html = readFileSync(join(__dirname, '..', 'privacy', 'index.html'), 'utf8');
    for (const key of [
      'privacy.browser.p2',
      'privacy.server.p2',
      'privacy.collection.h',
      'privacy.collection.p1',
      'privacy.collection.p2',
      'privacy.logs.h',
      'privacy.logs.p1',
      'privacy.logs.p2',
      'privacy.map.h',
      'privacy.map.p',
      'privacy.map.policy',
      'privacy.legal.h',
      'privacy.legal.p',
      'privacy.contact.p',
      'privacy.contact.more',
    ] as const) {
      expect(html, key).toContain(UI.en[key]);
    }
    expect(html).toContain(`href="mailto:${SITE.contactEmail}"`);
    expect(html).toContain(`href="${MAP_PRIVACY_URL}"`);
    for (const host of CSW_HOSTS) expect(html, host).toContain(`<li><code>${host}</code></li>`);
    expect(html).not.toMatch(/stores nothing/);
  });

  it('does not say the server "keeps nothing" about catalogue requests: it logs host, status and size, and keeps a counter for at most 24 hours (4 languages)', () => {
    const html = readFileSync(join(__dirname, '..', 'privacy', 'index.html'), 'utf8');
    expect(html).not.toMatch(/keeps nothing/);
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      const text = UI[lang]['privacy.collection.p1'];
      expect(text, lang).toMatch(/24/);
      expect(text, lang).not.toMatch(/keeps nothing|niczego nie przechowuje|nichts speichert|ne conserve rien/);
    }
    expect(UI.en['privacy.collection.p1']).toMatch(/logged \(catalogue host, status, size\).*request counter per IP address is kept for at most 24 hours/);
  });
});
