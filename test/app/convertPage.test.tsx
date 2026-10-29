// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// /convert, revealed: a public page in four languages (its title, notice and ⓘ say nothing about being hidden), in the menu, on the index and in the sitemap.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { IndexPage } from '../../src/app/pages/IndexPage';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { PrivacyPage } from '../../src/app/pages/PrivacyPage';
import { TIP_TEXTS } from '../../src/core/i18n/tips-text';
import { UI } from '../../src/core/i18n/ui';
import { LANGS } from '../../src/core/types';

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const TITLES = { pl: 'Konwerter do Darwin Core', en: 'Darwin Core converter', de: 'Darwin-Core-Konverter', fr: 'Convertisseur Darwin Core' } as const;

describe('ConvertPage', () => {
  it('shows the title, the intro and the new-tool notice in every language, all from the i18n tables', () => {
    for (const lang of LANGS) {
      cleanup();
      setLang(lang);
      render(<ConvertPage />);
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(TITLES[lang]);
      expect(UI[lang]['convert.title']).toBe(TITLES[lang]);
      expect(document.title).toBe(`${UI[lang]['convert.docTitle']} — Abyssal Claims`);
      expect(screen.getByText(UI[lang]['convert.intro'])).toBeTruthy();
      expect(screen.getByRole('status').textContent).toContain(UI[lang]['convert.status.title']);
      expect(screen.getByRole('status').textContent).toContain(UI[lang]['convert.status.text']);
    }
  });

  it('the four languages differ and every key is written with its diacritics', () => {
    expect(UI.pl['convert.intro']).toContain('węzła');
    expect(UI.pl['convert.status.text']).toMatch(/jest nowy/);
    expect(UI.de['convert.status.text']).toContain('ist neu');
    expect(UI.fr['convert.status.title']).toBe('Nouvel outil');
    for (const k of ['convert.title', 'convert.docTitle', 'convert.intro', 'convert.status.title', 'convert.status.text'] as const) {
      expect(new Set(LANGS.map((l) => UI[l][k])).size, k).toBe(LANGS.length);
    }
  });

  it('no text of the page, its notice or its ⓘ says the page is hidden or a hidden test version, in any language', () => {
    const keys = ['convert.status.title', 'convert.status.text', 'tip.convertIntro.does', 'tip.convertIntro.logic'] as const;
    for (const lang of LANGS) {
      for (const k of keys) {
        const text = k.startsWith('tip.') ? TIP_TEXTS[lang][k as 'tip.convertIntro.does'] : UI[lang][k as 'convert.status.text'];
        expect(text, `${lang} ${k}`).not.toMatch(/hidden|ukryt|verborgen|masqu|noindex|Test version|Wersja testowa|Testversion|Version de test/i);
      }
    }
  });

  it('has a drop zone and a file input for files read in the browser, and no link field and no download mode', () => {
    render(<ConvertPage />);
    expect(document.querySelector('[data-tip="dropZone"]')).toBeTruthy();
    expect(document.querySelector('input[type="file"]')).toBeTruthy();
    expect(document.querySelector('input[type="text"], [data-tip="linkField"], [data-tip="downloadMode"]')).toBeNull();
    // nothing else is on the page before files are read
    expect(document.querySelectorAll('.convert-sheet, .convert-summary, .convert-options').length).toBe(0);
  });

  it('the ⓘ opens with "What it does" and "The logic", and states the facts that hold today', async () => {
    render(<ConvertPage />);
    fireEvent.click(document.querySelector('[data-tip="convertIntro"] button') as HTMLElement);
    await waitFor(() => expect(screen.getByText(UI.en['tip.does'])).toBeTruthy());
    expect(screen.getByText(UI.en['tip.logic'])).toBeTruthy();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/hidden/);
    expect(text).toMatch(/The converter is new and may still change/);
    expect(text).toMatch(/read and previewed in your browser and stay there\. The only things that can leave it are the list of taxon names of the WoRMS lookup below and the search words you type for the NVS search, each only when you press its own button/);
    expect(text).not.toMatch(/nothing of them is sent anywhere/);
    expect(text).toMatch(/built in your browser and downloaded from it/);
    expect(text).not.toMatch(/no export yet/);
    // both lookups are here: WoRMS (stage 4) and NVS (stage 5), each after its own button and off by default
    expect(text).toMatch(/Two optional lookups are here, both off by default: the taxon names you choose to look up go to WoRMS, and only after you press its button; and a word you type for a measured variable or a unit goes to NVS, the NERC vocabulary server, and only after you press its button/);
    expect(text).not.toMatch(/still planned|Two optional lookups are planned/);
  });

  it('is announced: the header menu links it and marks it, the footer has no tool links, the index has its tile with its ⓘ', () => {
    window.history.pushState({}, '', '/convert');
    render(<ConvertPage />);
    const links = [...document.querySelectorAll('header nav a')].map((a) => [a.getAttribute('href'), a.getAttribute('aria-current')]);
    expect(links).toEqual([['/check', null], ['/licence', null], ['/collection', null], ['/convert', 'page'], ['https://something-rare.com/?lang=en', null]]);
    expect(document.querySelector('header nav a[href="/convert"]')?.textContent).toBe(UI.en['index.convert.title']);
    for (const a of document.querySelectorAll('footer a')) expect(a.getAttribute('href')).not.toMatch(/convert/);
    cleanup();
    window.history.pushState({}, '', '/');
    const { container } = render(<IndexPage />);
    expect(container.querySelectorAll('.tool').length).toBe(4);
    const tile = [...container.querySelectorAll('.tool')].find((li) => li.querySelector('a.tool-link')?.getAttribute('href') === '/convert') as HTMLElement;
    expect(tile.querySelector('h2')?.textContent).toBe(UI.en['index.convert.title']);
    expect(tile.querySelector('p')?.textContent).toBe(UI.en['index.convert.text']);
    expect(tile.querySelector('a.tool-link')?.getAttribute('aria-label')).toBe(UI.en['index.convert.cta']);
    expect(tile.querySelector('[data-tip="indexConvert"]')).toBeTruthy();
    expect(tile.querySelector('img')?.getAttribute('width')).toBe('600');
  });
});

describe('the converter is announced in the sources', () => {
  const root = join(__dirname, '..', '..');
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });

  it('the menu graphic is imported by the index tile and by nothing else', () => {
    expect(statSync(join(root, 'src/app/images/menu/convert.webp')).size).toBeGreaterThan(10000);
    const importers = walk(join(root, 'src')).filter((f) => /\.(tsx?|css)$/.test(f) && /convert\.webp/.test(readFileSync(f, 'utf8')));
    expect(importers.map((f) => f.replace(root, ''))).toEqual(['/src/app/pages/IndexPage.tsx']);
  });

  it('every page source links it in its header menu, the home page has its card, and the 404 page links it in four languages', () => {
    for (const f of ['index.html', 'check/index.html', 'licence/index.html', 'collection/index.html', 'privacy/index.html', 'convert/index.html']) {
      expect(readFileSync(join(root, f), 'utf8'), f).toMatch(/<a href="\/convert"[^>]*>Darwin Core converter<\/a> <a class="nav-external"/);
    }
    expect(readFileSync(join(root, 'convert/index.html'), 'utf8')).toContain('<a href="/convert" aria-current="page">Darwin Core converter</a>');
    const home = readFileSync(join(root, 'index.html'), 'utf8');
    expect(home).toContain(UI.en['index.convert.text']);
    expect(home).toContain('<a class="tool-link" href="/convert" aria-label="Open Darwin Core converter">Open</a>');
    expect(UI.en['index.convert.cta']).toBe('Open Darwin Core converter');
    const notFound = readFileSync(join(root, 'server/notFound.ts'), 'utf8');
    expect(notFound).toContain('<a href="/convert">');
    for (const name of LANGS.map((l) => UI[l]['index.convert.title'])) expect(notFound, name).toContain(`'${name}'`);
  });

  it('the page source has its own title, description, canonical, Open Graph and JSON-LD, ending "— Abyssal Claims", and no robots tag', () => {
    const html = readFileSync(join(root, 'convert/index.html'), 'utf8');
    expect(html).toContain(`<title>${UI.en['convert.docTitle']} — Abyssal Claims</title>`);
    expect(html).toContain(`<meta property="og:title" content="${UI.en['convert.docTitle']} — Abyssal Claims" />`);
    expect(html).toContain('<link rel="canonical" href="https://tools.something-rare.com/convert" />');
    expect(html).toContain('<meta property="og:url" content="https://tools.something-rare.com/convert" />');
    expect(html).toContain('<meta property="og:image" content="https://tools.something-rare.com/og-convert.jpg" />');
    expect(html).toContain('<meta name="twitter:image" content="https://tools.something-rare.com/og-convert.jpg" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('"@type": "WebApplication"');
    expect(html).toContain(UI.en['convert.intro']);
    expect(html).not.toMatch(/name="robots"|noindex|In preparation/i);
    // /convert has its own preview image, so its own alt (the other pages share the site-wide one), the same in og and twitter
    const alt = (f: string) => /property="og:image:alt" content="([^"]*)"/.exec(readFileSync(join(root, f), 'utf8'))?.[1];
    expect(alt('convert/index.html')).toContain('Spreadsheet to Darwin Core Archive for OBIS');
    expect(alt('convert/index.html')).not.toBe(alt('collection/index.html'));
    expect(html).toContain(`<meta name="twitter:image:alt" content="${alt('convert/index.html')}" />`);
    const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(description.length).toBeGreaterThan(80);
    expect(description.length).toBeLessThanOrEqual(320);
    expect(html).toContain(`<meta property="og:description" content="${description}" />`);
  });

  it('the home page card, the title and the page source agree with the i18n tables (so that a language switch changes nothing but the language)', () => {
    for (const lang of LANGS) {
      expect(UI[lang]['convert.docTitle']).toMatch(/\S/);
      expect(UI[lang]['index.convert.title']).toBe(UI[lang]['convert.title']);
    }
  });

  it('the sitemap source lists it', () => {
    const server = readFileSync(join(root, 'server/index.ts'), 'utf8');
    expect(/const urls = \[([^\]]*)\]/.exec(server)?.[1]).toContain("'/convert'");
  });
});

describe('the privacy page describes the converter, in four languages and in the static fallback', () => {
  const root = join(__dirname, '..', '..');
  const KEYS = ['privacy.convert.p1', 'privacy.convert.p2', 'privacy.convert.worms', 'privacy.convert.nvs', 'privacy.convert.p3', 'privacy.analytics.p3'] as const;

  for (const lang of LANGS) {
    it(`${lang}: the section and the analytics paragraph are on the page, from the i18n tables`, () => {
      setLang(lang);
      render(<PrivacyPage />);
      expect(screen.getByRole('heading', { level: 2, name: UI[lang]['privacy.convert.h'] })).toBeTruthy();
      for (const k of KEYS) expect(screen.getByText(UI[lang][k]), `${lang} ${k}`).toBeTruthy();
    });

    it(`${lang}: it says what is sent and to whom, that the service sees the IP address, that names can reveal findings, and that nothing is sent before the button`, () => {
      const w = UI[lang]['privacy.convert.worms'];
      const n = UI[lang]['privacy.convert.nvs'];
      expect(w).toContain('www.marinespecies.org');
      expect(w).toMatch(/VLIZ/);
      expect(n).toContain('vocab.nerc.ac.uk');
      expect(n).toMatch(/British Oceanographic Data Centre/);
      expect(UI[lang]['privacy.convert.p3']).toMatch(/IP/);
      expect(UI[lang]['privacy.convert.p3']).toMatch(/WoRMS|Taxon|taksonów|taxons/);
      expect(UI[lang]['privacy.convert.p2']).toMatch(/WoRMS/);
      expect(UI[lang]['privacy.convert.p2']).toMatch(/NVS/);
      // the same words as the notes next to each opt-in on the page
      expect(UI[lang]['convert.worms.privacy.to']).toContain('www.marinespecies.org');
      expect(UI[lang]['convert.nvs.privacy.to']).toContain('vocab.nerc.ac.uk');
      // no English inside the sentences of another language, apart from the names of the services, tables and the terms of the standard
      if (lang !== 'en') for (const k of KEYS) expect(UI[lang][k], `${lang} ${k}`).not.toMatch(/\b(the|and|only|never|sent|your|browser)\b/);
    });
  }

  it('the analytics paragraph lists exactly the events and enum fields that analytics.ts sends for the converter, and no name, file or value', () => {
    const src = readFileSync(join(root, 'src/app/analytics.ts'), 'utf8');
    const events = [...(/const EVENTS: readonly string\[\] = \[([^\]]*)\]/.exec(src)?.[1] ?? '').matchAll(/'(convert_[a-z]+)'/g)].map((m) => m[1]);
    expect(events).toEqual(['convert_started', 'convert_blocked', 'convert_exported']);
    // the fields of the export event: the shape, four flags and three counts; every other field of TrackParams belongs to the checks
    for (const f of ['shape', 'profile', 'meta_source', 'worms', 'nvs', 'n_events', 'n_occurrences', 'n_measurements']) expect(src, f).toMatch(new RegExp(`\\b${f}\\?:`));
    expect(UI.en['privacy.analytics.p3']).toMatch(/started/);
    expect(UI.en['privacy.analytics.p3']).toMatch(/blocked, with the number of errors/);
    expect(UI.en['privacy.analytics.p3']).toMatch(/wide, long or mixed/);
    expect(UI.en['privacy.analytics.p3']).toMatch(/never contain taxon names, file names, search words, identifiers or values/);
  });

  it('the static privacy page carries the same English text as the app', () => {
    const html = readFileSync(join(root, 'privacy/index.html'), 'utf8');
    expect(html).toContain(`<h2>${UI.en['privacy.convert.h']}</h2>`);
    for (const k of KEYS) expect(html, k).toContain(UI.en[k]);
  });
});

