// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Guards of /convert stage 1b: no host of a lookup service anywhere it could be called, the phone layout, and that /check's worker is untouched.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UI } from '../../src/core/i18n/ui';

const ROOT = join(__dirname, '..', '..');
const walk = (dir: string, accept: (f: string) => boolean): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p, accept) : accept(p) ? [p] : [];
  });
const rel = (p: string): string => p.replace(ROOT + '/', '');

describe('the only lookup hosts are WoRMS and NVS, each called from its own module, from a button', () => {
  const srcFiles = walk(join(ROOT, 'src'), (f) => /\.(ts|tsx|css|html)$/.test(f));

  // the identifier prefix of a WoRMS taxon (urn:lsid:marinespecies.org:taxname:<AphiaID>) is written into the archive: it is a name, never an address
  const withoutLsid = (text: string): string => text.replace(/urn:lsid:marinespecies\.org:taxname:/g, 'urn:lsid:WORMS:taxname:');
  it('src/ names marinespecies.org as an address in exactly one module (the opt-in); the privacy copy names the host as text; the urn:lsid prefix is only a name', () => {
    const named = srcFiles.filter((f) => /marinespecies\.org/i.test(withoutLsid(readFileSync(f, 'utf8')))).map(rel);
    // the module that calls it, and the two files of ⓘ / privacy copy that tell the reader which host it is (bare host name, no scheme)
    expect(named).toEqual(['src/app/optins/worms.ts', 'src/core/i18n/tips-text.ts', 'src/core/i18n/ui.ts']);
    // an address (with its scheme) stands in the network module and nowhere else
    expect(srcFiles.filter((f) => /https?:\/\/(www\.)?marinespecies\.org/i.test(withoutLsid(readFileSync(f, 'utf8')))).map(rel)).toEqual(['src/app/optins/worms.ts']);
    expect(srcFiles.filter((f) => readFileSync(f, 'utf8').includes('urn:lsid:marinespecies.org:taxname:')).map(rel)).toEqual(['src/core/convert/build.ts', 'src/core/convert/worms.ts', 'src/core/rules/convert.ts']);
  });

  const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('src/ names vocab.nerc.ac.uk as an address to call in exactly one module of the converter (the NVS opt-in); everywhere else only as the base of identifier URIs, or as text', () => {
    const hits = srcFiles.filter((f) => /vocab\.nerc\.ac\.uk/i.test(readFileSync(f, 'utf8'))).map(rel);
    // the opt-in module and the pure half that mentions it in a comment; the identifier bases of the converter, /check and the draft writers; the privacy copy and the tips name the host as text; the citation of the code shapes (NVS_CODE_SHAPE) names the vocabulary pages it was read on, as text
    expect([...hits].sort()).toEqual(['src/app/optins/nvs.ts', 'src/core/convert/nvs.ts', 'src/core/convert/vocab.ts', 'src/core/output/datacite.ts', 'src/core/output/draft.ts', 'src/core/recognize/vocab.ts', 'src/core/i18n/tips-text.ts', 'src/core/i18n/ui.ts', 'src/core/rules/citations.ts'].sort());
    // an https address in CODE (a comment aside) among the files of the converter, its page, components and worker: the opt-in module only
    const converter = srcFiles.filter((f) => /^src\/(app|worker)\//.test(rel(f)) || /^src\/core\/convert\//.test(rel(f)) || /^src\/core\/rules\/convert/.test(rel(f)));
    expect(converter.filter((f) => /https:\/\/vocab\.nerc\.ac\.uk/i.test(stripComments(readFileSync(f, 'utf8')))).map(rel)).toEqual(['src/app/optins/nvs.ts']);
    const vocab = readFileSync(join(ROOT, 'src/core/convert/vocab.ts'), 'utf8');
    // every mention in the converter's vocabulary is the identifier base `http://vocab.nerc.ac.uk/collection/`: plain http, so a fetch of it would also be refused by the page's CSP
    for (const m of vocab.matchAll(/.{0,12}vocab\.nerc\.ac\.uk.{0,12}/g)) expect(m[0], m[0]).toMatch(/http:\/\/vocab\.nerc\.ac\.uk\/collection\//);
    // and nothing in the vocabulary, the pure halves or the rules calls a network API
    for (const f of ['src/core/convert/vocab.ts', 'src/core/convert/nerc.ts', 'src/core/convert/nvs.ts']) expect(stripComments(readFileSync(join(ROOT, f), 'utf8')), f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  });

  it('the converter page, its components and its worker call no network or storage API at all (the WoRMS module is the one exception, and it uses no storage either)', () => {
    const files = [
      ...walk(join(ROOT, 'src/core/convert'), (f) => f.endsWith('.ts')),
      ...['src/app/pages/ConvertPage.tsx', 'src/app/components/ConvertSheetForm.tsx', 'src/app/components/ConvertMetadataForm.tsx', 'src/app/components/ConvertWorms.tsx', 'src/app/components/ConvertNerc.tsx', 'src/app/convertModel.ts', 'src/worker/convert.worker.ts', 'src/worker/convert.handler.ts', 'src/worker/convert.client.ts', 'src/worker/convert.engine.ts', 'src/worker/convert.protocol.ts'].map((f) => join(ROOT, f)),
    ];
    for (const f of files) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, rel(f)).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.storage/);
    }
    for (const mod of ['worms', 'nvs']) {
      const code = readFileSync(join(ROOT, `src/app/optins/${mod}.ts`), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, mod).not.toMatch(/XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.storage/);
      // no cookie, no Referer, no redirect followed, no cache: the request says so
      expect(code, mod).toContain("credentials: 'omit'");
      expect(code, mod).toContain("referrerPolicy: 'no-referrer'");
      expect(code, mod).toContain("redirect: 'error'");
      expect(code, mod).toContain("cache: 'no-store'");
    }
  });

  it('no page of the site, and no source of /convert, carries a preconnect, dns-prefetch, prefetch, preload or prerender link to WoRMS (a link tag is a request on page load)', () => {
    const pages = ['index.html', 'convert/index.html', 'check/index.html', 'collection/index.html', 'licence/index.html', 'privacy/index.html'].filter((f) => existsSync(join(ROOT, f)));
    expect(pages).toContain('convert/index.html');
    // the privacy page names the two hosts as bare text (what is sent, and to whom); no page holds an address of them, a link or a tag that would load one
    for (const f of pages) expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toMatch(f === 'privacy/index.html' ? /(https?:)?\/\/(www\.)?(marinespecies|vocab\.nerc)/i : /marinespecies|vocab\.nerc/i);
    for (const f of srcFiles.filter((x) => /\.(tsx|html)$/.test(x))) expect(readFileSync(f, 'utf8'), rel(f)).not.toMatch(/rel=["'](preconnect|dns-prefetch|prefetch|preload|prerender)["']/i);
  });

  it('the built /convert page and its assets (when dist/ exists): the page HTML names no host of WoRMS, the worker bundle holds no address of it, and the address stands in the page bundle only', () => {
    const html = join(ROOT, 'dist/convert/index.html');
    if (!existsSync(html)) return; // dist/ is made by `npm run build`, which the gate runs after the tests
    const assets = walk(join(ROOT, 'dist/assets'), (f) => /\.(js|css)$/.test(f));
    const names = [html, ...[...readFileSync(html, 'utf8').matchAll(/\/assets\/([\w.-]+\.(?:js|css))/g)].map((m) => join(ROOT, 'dist/assets', m[1]))].filter(existsSync);
    // the worker is its own asset, referenced from the page's script
    const worker = assets.filter((f) => /convert\.worker/i.test(f));
    expect(worker.length).toBeGreaterThan(0);
    expect(readFileSync(html, 'utf8')).not.toMatch(/marinespecies/i);
    for (const f of worker) expect(withoutLsid(readFileSync(f, 'utf8')), rel(f)).not.toMatch(/https?:\/\/(www\.)?marinespecies\.org/i);
    const withAddress = names.filter((f) => f !== html && /https?:\/\/www\.marinespecies\.org\/rest\/AphiaRecordsByMatchNames/.test(readFileSync(f, 'utf8')));
    expect(withAddress.length).toBe(1);
    // NVS (stage 5): the worker bundle holds identifier bases only (the converter writes http addresses, /check's recogniser holds an https one: names, never an address it calls); in the page bundle every https address of it is the SPARQL
    // endpoint or a concept page of the opt-in module (the privacy copy names the host as bare text), and the SPARQL address stands in one asset of the page
    for (const f of worker) for (const m of readFileSync(f, 'utf8').matchAll(/.{0,12}vocab\.nerc\.ac\.uk.{0,12}/g)) expect(m[0], `${rel(f)}: ${m[0]}`).toMatch(/https?:\/\/vocab\.nerc\.ac\.uk\/collection\//);
    for (const f of names.filter((x) => x !== html)) for (const m of readFileSync(f, 'utf8').matchAll(/https:\/\/vocab\.nerc\.ac\.uk.{0,20}/g)) expect(m[0], `${rel(f)}: ${m[0]}`).toMatch(/^https:\/\/vocab\.nerc\.ac\.uk\/(sparql\/sparql|collection\/)/);
    expect(readFileSync(html, 'utf8')).not.toMatch(/vocab\.nerc/i);
    expect(names.filter((f) => f !== html && /https:\/\/vocab\.nerc\.ac\.uk\/sparql\/sparql/.test(readFileSync(f, 'utf8'))).length).toBe(1);
    for (const f of worker) expect(readFileSync(f, 'utf8'), rel(f)).not.toMatch(/sparql\/sparql/);
    // no other page of the site carries the address of a lookup (the rule text of the registry, which every page bundle holds, only names the method)
    for (const other of ['dist/index.html', 'dist/check/index.html', 'dist/collection/index.html', 'dist/licence/index.html', 'dist/privacy/index.html'].filter((f) => existsSync(join(ROOT, f)))) {
      const h = readFileSync(join(ROOT, other), 'utf8');
      for (const m of h.matchAll(/\/assets\/([\w.-]+\.js)/g)) {
        const f = join(ROOT, 'dist/assets', m[1]);
        if (existsSync(f)) expect(readFileSync(f, 'utf8'), `${other} -> ${m[1]}`).not.toMatch(/marinespecies\.org\/rest|vocab\.nerc\.ac\.uk\/sparql|\/rest\/AphiaRecordsByMatchNames|sparql\/sparql/);
      }
    }
  });
});

describe('phone layout', () => {
  const css = readFileSync(join(ROOT, 'src/app/styles.css'), 'utf8');
  const block = css.slice(css.indexOf('/* ---- /convert')).replace(/\/\*[\s\S]*?\*\//g, '');

  it('the converter styles set no fixed width wider than a 375 px screen leaves (23 rem), and every field can shrink', () => {
    expect(block.length).toBeGreaterThan(500);
    for (const m of block.matchAll(/(?:^|[\s{;])(min-width|width)\s*:\s*([^;}]+)/g)) {
      const value = m[2].trim();
      const px = /^([\d.]+)px$/.exec(value);
      const rem = /^([\d.]+)rem$/.exec(value);
      if (px) expect(Number(px[1]), `${m[1]}: ${value}`).toBeLessThanOrEqual(300);
      else if (rem) expect(Number(rem[1]), `${m[1]}: ${value}`).toBeLessThanOrEqual(12);
      else expect(['100%', '0', 'auto'], `${m[1]}: ${value}`).toContain(value);
    }
    expect(block).toMatch(/\.convert-fields[^{]*\{[^}]*flex-wrap:\s*wrap/);
    expect(block).toMatch(/min-width:\s*0/);
  });

  it('.mapping-table keeps its own behaviour: inside the sideways-scrolling wrapper, not squeezed', () => {
    expect(css).toMatch(/\.table-scroll\s*\{[^}]*overflow-x:\s*auto/);
    expect(css).toMatch(/\.mapping-table \.role-cell select\s*\{[^}]*min-width:\s*10rem/);
    expect(css).not.toMatch(/\.mapping-table[^{]*\{[^}]*(?:table-layout|display:\s*block)/);
  });

  it('every table of the converter page sits in .table-scroll', () => {
    const page = readFileSync(join(ROOT, 'src/app/pages/ConvertPage.tsx'), 'utf8');
    expect((page.match(/<table/g) ?? []).length).toBe((page.match(/<div className="table-scroll">/g) ?? []).length);
  });
});

describe('/check is untouched by stage 1b', () => {
  // sha256 of the files at fb314bb (production): the /check worker, its protocol, client and engine, and the page of /check
  // handler.ts re-pinned when its two push(...x) became pushAll (a worker's stack overflowed on 100k findings; no behaviour changed)
  // handler.ts and protocol.ts re-pinned for IN-HEADER-SHORT: SheetSummary carries `unnamedFrom` (an optional field; nothing else changed)
  const PINNED: Record<string, string> = {
    'src/worker/handler.ts': '5e004a37190ee70d22ffe460ab54a68748ef0d364e2ef759cef54f201121aa68',
    'src/worker/protocol.ts': '8a9f354e667cf8911883b08923ec6b5cad24918e1f488d0086e21acbba7264bd',
    'src/worker/check.worker.ts': '939f9dffbf820c049b07b86a0797939d3e39c0d02237d1ca7c724eb17e10832e',
    'src/worker/client.ts': '29deb911bb375ebcceb27d8fce132b4fdc8c0d37ed27b247fa8e3f3f9c0f1acf',
    'src/worker/engine.ts': '29c552d7b0127b3033f76f1532a9639bd5843c537ac9d64e0c3001a1d3696a8b',
    'src/app/pages/CheckPage.tsx': '572a818885a2b6381eb7878335a25f2d0872d37761ab24c4f78941ba43c4e227',
  };
  it('the /check worker, protocol, client, engine and page are byte-for-byte the ones of production', () => {
    for (const [f, sha] of Object.entries(PINNED)) expect(createHash('sha256').update(readFileSync(join(ROOT, f))).digest('hex'), f).toBe(sha);
  });
});

describe('what the tips say is what the code does', () => {
  const UIT = UI;
  it('the code proposal tip says exactly which cells get an apostrophe, headers and codes included, and that "not touched" is gone', () => {
    const en = UIT.en['tip.convertCodes.logic'];
    expect(en).toContain('Cells are copied as text');
    expect(en).toContain('A cell or a header that starts with = + - or @');
    expect(en).toContain('the code is S and the number of the row instead');
    expect(en).toContain('full-width');
    expect(en).toContain('apostrophe');
    expect(en).toContain('plain numbers, missing-data marks such as NA and the marks + x - on their own, spaces around them included, are left as they are');
    expect(en).toContain('ISO dates');
    expect(en).toContain('times of day as hours and minutes');
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      const text = UIT[lang]['tip.convertCodes.logic'];
      expect(text, lang).not.toMatch(/not touched|nie są zmieniane|unberührt|ne sont pas modifiées/);
      expect(text, lang).toContain('= + - ');
      expect(text, lang).toContain('NA');
      expect(text, lang).toContain('ISO');
    }
  });
  it('the candidates tip states the summary-header rule exactly as the code has it', () => {
    const en = UIT.en['tip.convertTaxa.logic'];
    expect(en).toContain('starts with total, sum, suma, razem, summe, gesamt, somme or Σ');
    expect(en).toContain('holds total, suma, razem or gesamt as a separate word');
    expect(UIT.pl['tip.convertTaxa.logic']).toContain('total, sum, suma, razem, summe, gesamt, somme lub od znaku Σ');
  });
  it('the typed sample size tip says both marks are accepted and a thousands separator is refused', () => {
    expect(UIT.en['tip.convertEffortValue.logic']).toContain('a point or a comma as the decimal mark; both are accepted whatever your sheet uses');
    expect(UIT.en['tip.convertEffortValue.logic']).toContain('more than one point or comma');
    expect(UIT.en['tip.convertEffortValue.logic']).toContain('one to three digits, one separator and exactly three digits after it');
    expect(UIT.en['tip.convertEffortValue.logic']).toContain('starts with a zero cannot be one and is accepted');
  });
  it('the medium tip says there is no default; the shape tip names the exceptions; the candidates tip says confirmation is needed', () => {
    expect(UIT.en['tip.convertQuantityMedium.logic']).toContain('no default');
    expect(UIT.en['tip.convertQuantityMedium.logic']).toContain('no concept and a warning');
    expect(UIT.en['tip.convertShape.logic']).toContain('zeros that are skipped and NA cells');
    expect(UIT.en['tip.convertTaxa.logic']).toContain('only after you confirm it');
  });
  it('Polish does not call a locality a town, and the options heading is the agreed one', () => {
    for (const k of Object.keys(UIT.pl)) expect(UIT.pl[k as keyof (typeof UIT)['pl']], k).not.toMatch(/miejscowo/i);
    expect(UIT.pl['convert.options.title']).toBe('Ustawienia dla wszystkich plików');
    expect(UIT.pl['convert.flatten.station']).toContain('miejsce (locality)');
  });
});

describe('the page never scrolls sideways (root cause of the split table overflow)', () => {
  const css = readFileSync(join(ROOT, 'src/app/styles.css'), 'utf8');
  const page = readFileSync(join(ROOT, 'src/app/pages/ConvertPage.tsx'), 'utf8');

  it('a table of the converter page that holds a position: absolute element (.visually-hidden) sits in a wrapper that is a containing block', () => {
    // .visually-hidden is position: absolute; without a positioned ancestor it escapes overflow-x: auto and its place in a wide table widens the whole page
    expect(css).toMatch(/\.visually-hidden\s*\{[^}]*position:\s*absolute/);
    const tables = [...page.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) => m[0]);
    expect(tables.length).toBeGreaterThan(0);
    // the row of the split tables (splitRow) holds the hidden span; both split tables (the names with a doubt, and the folded list of the others) are in
    // section.convert-splits > .table-scroll, and that wrapper is positioned
    expect(page).toMatch(/const splitRow[\s\S]*?visually-hidden/);
    const section = page.slice(page.indexOf('className="convert-splits"'));
    expect([...section.slice(0, section.indexOf('</section>')).matchAll(/<div className="table-scroll">/g)].length).toBe(2);
    expect(section).toMatch(/doubted\.map\(splitRow\)/);
    expect(section).toMatch(/rest\.map\(splitRow\)/);
    expect(css).toMatch(/\.convert-splits \.table-scroll\s*\{[^}]*position:\s*relative/);
  });

  it('nothing else in the converter styles is absolutely or fixed positioned outside a positioned parent', () => {
    const block = css.slice(css.indexOf('/* ---- /convert')).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(block).not.toMatch(/position:\s*(absolute|fixed)/);
  });
});
