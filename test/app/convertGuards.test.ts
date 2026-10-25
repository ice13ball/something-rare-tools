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

describe('no lookup host yet', () => {
  const srcFiles = walk(join(ROOT, 'src'), (f) => /\.(ts|tsx|css|html)$/.test(f));

  // the identifier prefix of a WoRMS taxon (urn:lsid:marinespecies.org:taxname:<AphiaID>) is written for a user's AphiaID column: it is a name, never an address
  const withoutLsid = (text: string): string => text.replace(/urn:lsid:marinespecies\.org:taxname:/g, 'urn:lsid:WORMS:taxname:');
  it('src/ never names marinespecies.org as an address (the WoRMS lookup comes in a later stage, off by default); only the urn:lsid identifier prefix is written', () => {
    expect(srcFiles.filter((f) => /marinespecies\.org/i.test(withoutLsid(readFileSync(f, 'utf8')))).map(rel)).toEqual([]);
    expect(srcFiles.filter((f) => readFileSync(f, 'utf8').includes('urn:lsid:marinespecies.org:taxname:')).map(rel)).toEqual(['src/core/convert/build.ts', 'src/core/rules/convert.ts']);
  });

  it('src/ names vocab.nerc.ac.uk only as the base of identifier URIs (the converter writes them, /check reads them from headers), never as an address to call', () => {
    const hits = srcFiles.filter((f) => /vocab\.nerc\.ac\.uk/i.test(readFileSync(f, 'utf8'))).map(rel);
    expect(hits).toEqual(['src/core/convert/vocab.ts', 'src/core/output/datacite.ts', 'src/core/output/draft.ts', 'src/core/recognize/vocab.ts']);
    const vocab = readFileSync(join(ROOT, 'src/core/convert/vocab.ts'), 'utf8');
    // every mention is the identifier base `http://vocab.nerc.ac.uk/collection/`: plain http, so a fetch of it would also be refused by the page's CSP
    for (const m of vocab.matchAll(/.{0,12}vocab\.nerc\.ac\.uk.{0,12}/g)) expect(m[0], m[0]).toMatch(/http:\/\/vocab\.nerc\.ac\.uk\/collection\//);
    // and nothing in src/ calls a network API near it
    expect(vocab).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  });

  it('the converter page and its worker call no network or storage API at all', () => {
    const files = [
      ...walk(join(ROOT, 'src/core/convert'), (f) => f.endsWith('.ts')),
      ...['src/app/pages/ConvertPage.tsx', 'src/app/components/ConvertSheetForm.tsx', 'src/app/components/ConvertMetadataForm.tsx', 'src/app/convertModel.ts', 'src/worker/convert.worker.ts', 'src/worker/convert.handler.ts', 'src/worker/convert.client.ts', 'src/worker/convert.engine.ts', 'src/worker/convert.protocol.ts'].map((f) => join(ROOT, f)),
    ];
    for (const f of files) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, rel(f)).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.storage/);
    }
  });

  it('the built /convert page and its assets (when dist/ exists) name neither service as an address (an identifier URI prefix of /check or of the converter is not one)', () => {
    const html = join(ROOT, 'dist/convert/index.html');
    if (!existsSync(html)) return; // dist/ is made by `npm run build`, which the gate runs after the tests
    const assets = walk(join(ROOT, 'dist/assets'), (f) => /\.(js|css)$/.test(f));
    const names = [html, ...[...readFileSync(html, 'utf8').matchAll(/\/assets\/([\w.-]+\.(?:js|css))/g)].map((m) => join(ROOT, 'dist/assets', m[1]))].filter(existsSync);
    // the worker is its own asset, referenced from the page's script
    const worker = assets.filter((f) => /convert\.worker/i.test(f));
    expect(worker.length).toBeGreaterThan(0);
    for (const f of [...names, ...worker]) {
      const text = readFileSync(f, 'utf8');
      expect(withoutLsid(text), rel(f)).not.toMatch(/marinespecies\.org/i);
      for (const m of text.matchAll(/.{0,12}vocab\.nerc\.ac\.uk.{0,12}/g)) expect(m[0], `${rel(f)}: ${m[0]}`).toMatch(/https?:\/\/vocab\.nerc\.ac\.uk\/collection\//);
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
  const PINNED: Record<string, string> = {
    'src/worker/handler.ts': '10839da51a3d71c9d053a59f80950c483d63688a63618a0f6c852fb4e7bb5bb3',
    'src/worker/protocol.ts': '33b07c4a6efefd107ec50c606b398b2e272d822d4ab55226486a898029b2cc8c',
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
    const withHidden = tables.filter((t) => t.includes('visually-hidden'));
    expect(withHidden.length).toBeGreaterThan(0);
    // the split table is in section.convert-splits > .table-scroll, and that wrapper is positioned
    expect(page).toMatch(/className="convert-splits"[\s\S]*?<div className="table-scroll">[\s\S]*?visually-hidden/);
    expect(css).toMatch(/\.convert-splits \.table-scroll\s*\{[^}]*position:\s*relative/);
  });

  it('nothing else in the converter styles is absolutely or fixed positioned outside a positioned parent', () => {
    const block = css.slice(css.indexOf('/* ---- /convert')).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(block).not.toMatch(/position:\s*(absolute|fixed)/);
  });
});
