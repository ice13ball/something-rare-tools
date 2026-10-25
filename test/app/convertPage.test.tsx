// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// /convert: a hidden page in four languages (stage 1b: files are read and previewed, no export), and nothing that announces it (menu, index, footer, imports of its graphic).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { IndexPage } from '../../src/app/pages/IndexPage';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
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
  it('shows the title, the intro and the preview-stage notice in every language, all from the i18n tables', () => {
    for (const lang of LANGS) {
      cleanup();
      setLang(lang);
      render(<ConvertPage />);
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(TITLES[lang]);
      expect(UI[lang]['convert.title']).toBe(TITLES[lang]);
      expect(document.title).toBe(`${TITLES[lang]} — Abyssal Claims`);
      expect(screen.getByText(UI[lang]['convert.intro'])).toBeTruthy();
      expect(screen.getByRole('status').textContent).toContain(UI[lang]['convert.status.title']);
      expect(screen.getByRole('status').textContent).toContain(UI[lang]['convert.status.text']);
    }
  });

  it('the four languages differ and every key is written with its diacritics', () => {
    expect(UI.pl['convert.intro']).toContain('węzła');
    expect(UI.pl['convert.status.text']).toMatch(/ukryta/);
    expect(UI.de['convert.status.text']).toContain('verborgen');
    expect(UI.fr['convert.status.title']).toBe('Version de test');
    for (const k of ['convert.title', 'convert.intro', 'convert.status.title', 'convert.status.text'] as const) {
      expect(new Set(LANGS.map((l) => UI[l][k])).size, k).toBe(LANGS.length);
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
    expect(text).toMatch(/hidden/);
    expect(text).toMatch(/read and previewed in your browser; nothing is sent anywhere/);
    expect(text).toMatch(/built in your browser and downloaded from it/);
    expect(text).not.toMatch(/no export yet/);
    expect(text).toMatch(/WoRMS/);
    expect(text).toMatch(/NERC/);
    expect(text).toMatch(/off by default/);
    expect(text).toMatch(/until you press its button/);
  });

  it('is announced nowhere: the header menu and the footer do not link it, nor does the index', () => {
    render(<ConvertPage />);
    for (const a of document.querySelectorAll('header a, footer a')) expect(a.getAttribute('href')).not.toMatch(/convert/);
    cleanup();
    const { container } = render(<IndexPage />);
    expect(container.innerHTML).not.toMatch(/convert/i);
    expect(container.querySelectorAll('.tool').length).toBe(3);
  });
});

describe('the converter stays hidden in the sources', () => {
  const root = join(__dirname, '..', '..');
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });

  it('the menu graphic is committed but imported nowhere (the index tile comes with the reveal)', () => {
    expect(statSync(join(root, 'src/app/images/menu/convert.webp')).size).toBeGreaterThan(10000);
    const importers = walk(join(root, 'src')).filter((f) => /\.(tsx?|css)$/.test(f) && /convert\.webp/.test(readFileSync(f, 'utf8')));
    expect(importers).toEqual([]);
  });

  it('no page, menu, footer, sitemap or robots source names /convert, apart from the page itself and the server', () => {
    for (const f of ['index.html', 'check/index.html', 'licence/index.html', 'collection/index.html', 'privacy/index.html']) {
      expect(readFileSync(join(root, f), 'utf8'), f).not.toMatch(/convert/i);
    }
    const layout = readFileSync(join(root, 'src/app/components/Layout.tsx'), 'utf8');
    expect(layout).not.toMatch(/convert/i);
    const indexPage = readFileSync(join(root, 'src/app/pages/IndexPage.tsx'), 'utf8');
    expect(indexPage).not.toMatch(/convert/i);
    const server = readFileSync(join(root, 'server/index.ts'), 'utf8');
    expect(server.match(/convert/gi)?.length ?? 0).toBeGreaterThan(0);
    expect(server).not.toMatch(/<loc>[^\n]*convert/);
    expect(/const urls = \[([^\]]*)\]/.exec(server)?.[1]).not.toMatch(/convert/);
  });

  it('the JSON-LD blocks of the public pages do not mention it', () => {
    for (const f of ['index.html', 'check/index.html', 'licence/index.html', 'collection/index.html']) {
      for (const block of readFileSync(join(root, f), 'utf8').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        expect(block[1], f).not.toMatch(/convert/i);
      }
    }
  });
});
