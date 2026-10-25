// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Stage 5 on the /convert page, through the real page and a direct convert engine, with fetch mocked from hand-written NVS answers: the measured variables and their NERC
// choices, and the NVS opt-in under the conditions the owner approved it under. Nothing is sent before the user types a word for a column and presses "Search NVS"
// (fetch, XHR, sendBeacon and storage are spied: no call with the box off, none with it ticked, none after a companion file pre-ticked it, none while typing); only the typed
// word is sent; nothing is chosen for the user; a deprecated concept cannot be chosen; what was searched is forgotten on unticking and on a new upload; no identifier is
// written that was not confirmed; the privacy copy stands next to the opt-in in four languages.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { denyConsent, grantConsent } from '../../src/app/analytics';
import { initLang, setLang } from '../../src/app/i18n';
import { NVS_SPARQL_ENDPOINT } from '../../src/app/optins/nvs';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { nercUri } from '../../src/core/convert/vocab';
import { writeConvertSidecar } from '../../src/core/convert/settings';
import { TIP_TEXTS } from '../../src/core/i18n/tips-text';
import { UI } from '../../src/core/i18n/ui';
import { openZip } from '../../src/core/parse/zip';
import { LANGS } from '../../src/core/types';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { nodeInflate } from '../helpers/zipfile';
import { nvsMock, parseSparqlLiterals } from '../helpers/nvsFixtures';
import type { NvsMockOptions } from '../helpers/nvsFixtures';
import { L1_HEADER, type Cell } from '../convert/helpers';
import { chooseFiles, csvOf } from './convertHelpers';

vi.setConfig({ testTimeout: 30_000 });
const T = UI.en;
const win = window as unknown as { dataLayer: unknown[]; gtag?: unknown };

/** A long sheet with two measured variables. Within one event (sample) the variables repeat, as a long sheet does. All values invented. */
const HEADER = [...L1_HEADER, 'Temperature [°C]', 'Oxygen [µmol/L]'];
const ROWS: Cell[][] = [
  ['occ-001', 'E1', 'Calanus finmarchicus', 5, 54.1, 7.9, '2022-05-05', 0, 10, 7.1, 310],
  ['occ-002', 'E1', 'Oithona similis', 11, 54.1, 7.9, '2022-05-05', 0, 10, 7.1, 310],
  ['occ-003', 'E2', 'Calanus finmarchicus', 2, 54.3, 8.1, '2022-05-06', 0, 10, 6.5, 295],
];
const CSV = csvOf(HEADER, ROWS);
const SIDECAR_NVS = writeConvertSidecar({ nvs: true });
const uri = (c: 'P01' | 'P06', code: string): string => nercUri(c, code);

beforeEach(() => {
  localStorage.clear();
  document.cookie = 'ac_consent=; Path=/; Max-Age=0';
  win.dataLayer = [];
  delete win.gtag;
  document.head.querySelectorAll('script').forEach((s) => s.remove());
  initLang();
  setLang('en');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const summary = (): HTMLElement => screen.getByRole('region', { name: T['convert.summary.title'] });
const settled = async (text: string): Promise<void> => void (await waitFor(() => expect(summary().textContent).toContain(text)));
const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const box = (lang: (typeof LANGS)[number] = 'en'): HTMLInputElement => screen.getByRole('checkbox', { name: UI[lang]['convert.nvs.optin'] }) as HTMLInputElement;
const concept = (header: string, lang: (typeof LANGS)[number] = 'en'): HTMLSelectElement => screen.getByLabelText(UI[lang]['convert.nerc.type.aria'].replace('{header}', header)) as HTMLSelectElement;
const unit = (header: string): HTMLSelectElement => screen.getByLabelText(T['convert.nerc.unit.aria'].replace('{header}', header)) as HTMLSelectElement;
const wordBox = (header: string, kind: 'type' | 'unit' = 'type'): HTMLInputElement => screen.getByLabelText(T[`convert.nvs.word.${kind}.aria`].replace('{header}', header)) as HTMLInputElement;
const searchButton = (header: string, kind: 'type' | 'unit' = 'type'): HTMLButtonElement => screen.getByRole('button', { name: T[`convert.nvs.search.${kind}.aria`].replace('{header}', header) }) as HTMLButtonElement;
const type = (el: HTMLElement, value: string): void => void fireEvent.change(el, { target: { value } });
const optionValues = (sel: HTMLSelectElement): string[] => [...sel.options].map((o) => o.value);
const TEMP = 'Temperature [°C]';
const OXY = 'Oxygen [µmol/L]';

async function load(files: { name: string; text: string }[] = [{ name: 'l1.csv', text: CSV }], lang: (typeof LANGS)[number] = 'en', props: Partial<React.ComponentProps<typeof ConvertPage>> = {}) {
  const view = render(<ConvertPage engine={createDirectConvertEngine()} {...props} />);
  chooseFiles(view.container, files);
  fireEvent.click(screen.getByRole('button', { name: UI[lang]['convert.read'] }));
  await screen.findByRole('heading', { name: UI[lang]['convert.columns.title'] });
  fireEvent.change(screen.getByLabelText(UI[lang]['convert.quantity.kind']), { target: { value: 'count' } });
  await screen.findByRole('heading', { name: UI[lang]['convert.nerc.title'] });
  return view;
}

/** Every channel a page could send something through, spied; storage too. */
function spies(opts: NvsMockOptions = {}) {
  const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
  const beacon = vi.fn();
  const idb = vi.fn();
  const cookieSet = vi.fn();
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
  vi.stubGlobal('indexedDB', { open: idb });
  const cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  Object.defineProperty(document, 'cookie', { configurable: true, get: () => '', set: cookieSet });
  const ls = [vi.spyOn(Storage.prototype, 'setItem'), vi.spyOn(Storage.prototype, 'removeItem'), vi.spyOn(Storage.prototype, 'clear')];
  const mock = nvsMock(opts);
  vi.stubGlobal('fetch', mock.fetch);
  return {
    mock,
    expectSilent(): void {
      expect(mock.fetch).not.toHaveBeenCalled();
      expect(xhr).not.toHaveBeenCalled();
      expect(beacon).not.toHaveBeenCalled();
      expect(idb).not.toHaveBeenCalled();
      expect(cookieSet).not.toHaveBeenCalled();
      for (const s of ls) expect(s).not.toHaveBeenCalled();
      expect(sessionStorage.length).toBe(0);
    },
    restore(): void {
      if (cookieDesc) Object.defineProperty(document, 'cookie', cookieDesc);
      else delete (document as unknown as Record<string, unknown>).cookie;
    },
  };
}

describe('the measured variables are listed, and nothing is chosen for the user', () => {
  it('every variable column has a concept list and a unit list that start on "No ID"; a suggestion is an entry, never selected; a method-specific concept is offered, not suggested', async () => {
    await load();
    const section = document.querySelector('.convert-nerc') as HTMLElement;
    expect(section.querySelectorAll('.convert-nerc-col').length).toBe(2);
    expect(section.textContent).toContain('temperature, unit °C');
    expect(section.textContent).toContain('oxygen, unit µmol/L');
    for (const sel of [concept(TEMP), unit(TEMP), concept(OXY), unit(OXY)]) expect(sel.value, sel.getAttribute('aria-label') ?? '').toBe('');
    // temperature: the generic concept suggested; the two method-specific ones offered (never suggested)
    expect(optionValues(concept(TEMP))).toEqual(['', `s:${uri('P01', 'TEMPPR01')}`, `s:${uri('P01', 'TEMPP901')}`, `s:${uri('P01', 'TEMPST01')}`]);
    const groups = [...concept(TEMP).querySelectorAll('optgroup')].map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.value)]);
    expect(groups[0]).toEqual([T['convert.nerc.group.suggested'], [`s:${uri('P01', 'TEMPPR01')}`]]);
    expect(groups[1][0]).toBe(T['convert.nerc.group.offered']);
    // oxygen in µmol/L: the per-volume concept is suggested and the per-mass one would describe another quantity, so it is not listed
    expect(optionValues(concept(OXY))).toEqual(['', `s:${uri('P01', 'DOXYZZXX')}`]);
    expect(optionValues(unit(OXY))).toEqual(['', `s:${uri('P06', 'UPOX')}`]);
    expect(optionValues(unit(TEMP))).toEqual(['', `s:${uri('P06', 'UPAA')}`]);
    // without any choice: no ID is written, and the summary says which are left without
    await settled('There is no confirmed NERC concept for "temperature", "oxygen"');
    await settled('There is no confirmed NERC concept (P06) for the unit "°C"');
  });

  it('choosing the suggestion (or pressing the suggestions button) is what confirms it: the warnings go away for exactly those columns', async () => {
    await load();
    await settled('"temperature", "oxygen"');
    fireEvent.change(concept(TEMP), { target: { value: `s:${uri('P01', 'TEMPPR01')}` } });
    await settled('There is no confirmed NERC concept for "oxygen"');
    expect(summary().textContent).not.toContain('NERC concept for "temperature"');
    // the button confirms the suggestions of the columns that have none yet, and keeps what was chosen
    const button = screen.getByRole('button', { name: 'Use the suggestions for 2 columns' });
    fireEvent.click(button);
    await waitFor(() => expect(concept(OXY).value).toBe(`s:${uri('P01', 'DOXYZZXX')}`));
    expect(concept(TEMP).value).toBe(`s:${uri('P01', 'TEMPPR01')}`);
    expect(unit(TEMP).value).toBe(`s:${uri('P06', 'UPAA')}`);
    expect(unit(OXY).value).toBe(`s:${uri('P06', 'UPOX')}`);
    await waitFor(() => expect(summary().textContent).not.toContain('There is no confirmed NERC concept'));
    expect(screen.queryByRole('button', { name: /^Use the suggestions/ })).toBeNull();
    // withdrawing a choice puts the warning back
    fireEvent.change(concept(OXY), { target: { value: '' } });
    await settled('There is no confirmed NERC concept for "oxygen"');
  });

  it('a choice belongs to the column, its variable and its unit: changing the unit of the column drops it', async () => {
    await load();
    fireEvent.change(unit(OXY), { target: { value: `s:${uri('P06', 'UPOX')}` } });
    fireEvent.change(concept(OXY), { target: { value: `s:${uri('P01', 'DOXYZZXX')}` } });
    await idle();
    expect(unit(OXY).value).toBe(`s:${uri('P06', 'UPOX')}`);
    // the user changes the unit of the oxygen column in the column table to µmol/kg: the per-volume concept would now be wrong, so it is dropped
    const unitInput = screen.getAllByLabelText(T['mapping.unit']).find((el) => (el as HTMLInputElement).value === 'µmol/L') as HTMLInputElement;
    expect(unitInput).toBeTruthy();
    fireEvent.change(unitInput, { target: { value: 'µmol/kg' } });
    await waitFor(() => expect(concept(OXY).value).toBe(''));
    expect(unit(OXY).value).toBe(''); // the unit identifier was for the other unit text
    expect(optionValues(concept(OXY))).toEqual(['', `s:${uri('P01', 'DOXMZZXX')}`]);
    expect(optionValues(unit(OXY))).toEqual(['', `s:${uri('P06', 'KGUM')}`]);
    // and the conversion no longer carries the dropped identifiers
    await settled('There is no confirmed NERC concept for "temperature", "oxygen"');
    // the page says that the choice was dropped, instead of dropping it without a word
    expect(document.querySelector('.convert-nerc-dropped')?.textContent).toBe(T['convert.nerc.dropped']);
    expect(document.querySelectorAll('.convert-nerc-dropped').length).toBe(2); // the concept and the unit
  });
});

describe('nothing is sent before the user acts', () => {
  it('the box is off on every upload: 0 calls with the box off, 0 with it ticked, 0 while a word is typed, 0 after a companion file pre-ticked it; storage untouched', async () => {
    const s = spies();
    try {
      await load();
      await settled('There is no confirmed NERC concept');
      expect(box().checked).toBe(false);
      expect(document.querySelectorAll('.convert-nvs-search').length).toBe(0);
      s.expectSilent();
      fireEvent.click(box());
      expect(box().checked).toBe(true);
      expect(searchButton(TEMP).disabled).toBe(true); // nothing typed: nothing to search
      s.expectSilent();
      type(wordBox(TEMP), 'temperature');
      expect(searchButton(TEMP).disabled).toBe(false);
      await idle();
      s.expectSilent();
      // the Enter key is not the button
      fireEvent.keyDown(wordBox(TEMP), { key: 'Enter' });
      fireEvent.keyPress(wordBox(TEMP), { key: 'Enter', charCode: 13 });
      s.expectSilent();
      cleanup();
      // a companion file of the drop pre-ticks the box and still sends nothing
      await load([{ name: 'l1.csv', text: CSV }, { name: 'run.sidecar.csv', text: SIDECAR_NVS }]);
      await waitFor(() => expect(box().checked).toBe(true));
      type(wordBox(OXY), 'oxygen');
      await idle();
      s.expectSilent();
      expect(document.querySelector('.convert-nvs-results')).toBeNull();
    } finally {
      s.restore();
    }
  });

  it('a new upload resets the box, the typed words, the results and the choices made from them', async () => {
    const s = spies();
    try {
      const view = await load();
      fireEvent.click(box());
      type(wordBox(TEMP), 'invented current');
      fireEvent.click(searchButton(TEMP));
      await waitFor(() => expect(within(document.querySelector('.convert-nerc') as HTMLElement).getByText(/1 result for "invented current"/)).toBeTruthy());
      fireEvent.change(concept(TEMP), { target: { value: `n:${uri('P01', 'ZZTESTC1')}` } });
      await idle();
      expect(s.mock.calls.length).toBe(1);
      chooseFiles(view.container, [{ name: 'l1b.csv', text: CSV }]);
      fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
      await screen.findByText(T['convert.reading']);
      await waitFor(() => expect(screen.queryByText(T['convert.reading'])).toBeNull());
      await screen.findByRole('heading', { name: T['convert.nerc.title'] });
      expect(box().checked).toBe(false);
      // (the file input keeps the first file: the page now holds both, so every column is listed twice)
      for (const sel of screen.getAllByLabelText(T['convert.nerc.type.aria'].replace('{header}', TEMP))) expect((sel as HTMLSelectElement).value).toBe('');
      expect(document.querySelector('.convert-nvs-results')).toBeNull();
      expect(s.mock.calls.length).toBe(1); // nothing new was sent
      fireEvent.click(box());
      for (const w of screen.getAllByLabelText(T['convert.nvs.word.type.aria'].replace('{header}', TEMP))) expect((w as HTMLInputElement).value).toBe('');
    } finally {
      s.restore();
    }
  });

  it('the page, rendered, holds no link, preconnect or prefetch to the service', async () => {
    await load();
    fireEvent.click(box());
    expect(document.documentElement.outerHTML).not.toMatch(/(?:href|src|action|data|poster)=["']https?:\/\/vocab\.nerc/i);
    expect(document.documentElement.outerHTML).not.toMatch(/sparql\/sparql/);
    expect(document.querySelectorAll('link[rel="preconnect"], link[rel="dns-prefetch"], link[rel="prefetch"], link[rel="preload"], a[href*="vocab.nerc"]').length).toBe(0);
  });
});

describe('the search', () => {
  it('the button sends exactly one plain GET with the typed word and nothing else: no data, value, header, code, file name or other column', async () => {
    const s = spies();
    try {
      await load();
      fireEvent.click(box());
      type(wordBox(TEMP), 'invented current');
      fireEvent.click(searchButton(TEMP));
      await screen.findByText(/1 result for "invented current"/);
      expect(s.mock.calls.length).toBe(1);
      const call = s.mock.calls[0];
      expect(call.url.startsWith(`${NVS_SPARQL_ENDPOINT}?query=`)).toBe(true);
      const { literals } = parseSparqlLiterals(call.query as string);
      expect(literals.slice(1)).toEqual(['invented', 'current']);
      for (const secret of ['occ-', 'E1', 'E2', 'l1.csv', '54.1', '2022', 'Calanus', 'Oithona', 'Temperature', 'Oxygen', '°C', 'µmol', '310', '7.1']) expect(call.url + (call.query ?? ''), secret).not.toContain(secret);
      expect(call.init).toMatchObject({ method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
      expect(call.init?.body).toBeUndefined();
      expect(call.init?.headers).toEqual({ Accept: 'application/sparql-results+json' });
    } finally {
      s.restore();
    }
  });

  it('the search of a unit asks P06 only; the results are options of that column\'s own list, none chosen; a deprecated concept is shown and cannot be chosen', async () => {
    const s = spies();
    try {
      await load();
      fireEvent.click(box());
      type(wordBox(TEMP, 'unit'), 'invented');
      fireEvent.click(searchButton(TEMP, 'unit'));
      await screen.findByText(/1 result for "invented"/);
      expect(s.mock.calls[0].query).toContain('collection/P06/current/');
      expect(unit(TEMP).value).toBe('');
      const deprecatedOpt = [...unit(TEMP).options].find((o) => o.value === `n:${uri('P06', 'ZZZD')}`) as HTMLOptionElement;
      expect(deprecatedOpt.disabled).toBe(true);
      expect(deprecatedOpt.textContent).toContain(T['convert.nerc.deprecated']);
      // the concept search: a current and a deprecated and an unflagged one
      type(wordBox(TEMP), 'invented');
      fireEvent.click(searchButton(TEMP));
      await screen.findByText(/3 results for "invented"/);
      const opts = new Map([...concept(TEMP).options].map((o) => [o.value, o]));
      expect(opts.get(`n:${uri('P01', 'ZZTESTC1')}`)?.disabled).toBe(false);
      expect(opts.get(`n:${uri('P01', 'ZZTESTD1')}`)?.disabled).toBe(true);
      expect(opts.get(`n:${uri('P01', 'ZZTESTN1')}`)?.disabled).toBe(true); // not stated current: treated as deprecated
      const list = document.querySelector('.convert-nvs-list') as HTMLElement;
      expect(within(list).getByText('ZZTESTD1').closest('li')?.textContent).toContain(T['convert.nerc.deprecated']);
      // choosing a deprecated one (as a script could) writes nothing: it is no choice
      fireEvent.change(concept(TEMP), { target: { value: `n:${uri('P01', 'ZZTESTD1')}` } });
      await idle();
      expect(concept(TEMP).value).toBe('');
      fireEvent.change(concept(TEMP), { target: { value: `n:${uri('P01', 'ZZTESTC1')}` } });
      await waitFor(() => expect(concept(TEMP).value).toBe(`n:${uri('P01', 'ZZTESTC1')}`));
    } finally {
      s.restore();
    }
  });

  it('a text whose cut would split an emoji does not lock the search: the results come, and the buttons are usable again', async () => {
    const s = spies();
    try {
      await load();
      fireEvent.click(box());
      type(wordBox(TEMP), `${'a'.repeat(79)}😀`);
      fireEvent.click(searchButton(TEMP));
      await screen.findByText(/NVS has no concept for/);
      expect(s.mock.calls.length).toBe(1);
      expect(() => decodeURIComponent(s.mock.calls[0].url)).not.toThrow();
      expect(searchButton(TEMP).disabled).toBe(false);
      type(wordBox(OXY), 'invented current');
      expect(searchButton(OXY).disabled).toBe(false);
      fireEvent.click(searchButton(OXY));
      await screen.findByText(/1 result for "invented current"/);
    } finally {
      s.restore();
    }
  });

  it('a lone half of an emoji typed into the box is a space, and a thrown error would still release the lock', async () => {
    const s = spies();
    try {
      await load();
      fireEvent.click(box());
      type(wordBox(TEMP), 'x\ud83dy');
      fireEvent.click(searchButton(TEMP));
      await screen.findByText(/NVS has no concept for/);
      expect(searchButton(TEMP).disabled).toBe(false);
      // fetch itself throwing at once (not a rejected promise) is a failure of the run, not an exception: the page shows it and the buttons work
      vi.stubGlobal('fetch', () => {
        throw new Error('boom');
      });
      fireEvent.click(searchButton(TEMP));
      expect((await screen.findByRole('alert')).textContent).toContain('NVS could not be reached');
      expect(searchButton(TEMP).disabled).toBe(false);
      expect(searchButton(OXY).disabled).toBe(true); // nothing typed for oxygen yet, which is the only reason
    } finally {
      s.restore();
    }
  });

  it('hostile text is a word: the service, which parses the query as SPARQL does, answers it with an empty list and no error', async () => {
    const s = spies();
    try {
      await load();
      fireEvent.click(box());
      type(wordBox(TEMP), '"} UNION { ?s ?p ?o } # \\u0022\n\\');
      fireEvent.click(searchButton(TEMP));
      await screen.findByText(/NVS has no concept for/);
      expect(s.mock.calls.length).toBe(1);
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      s.restore();
    }
  });

  it('one search at a time, with a button that aborts it; an abort keeps nothing and the late answer is ignored', async () => {
    const s = spies({ onCall: () => new Promise<void>((resolve) => setTimeout(resolve, 60)) });
    try {
      await load();
      fireEvent.click(box());
      type(wordBox(TEMP), 'invented');
      type(wordBox(OXY), 'invented');
      fireEvent.click(searchButton(TEMP));
      await screen.findByText(T['convert.nvs.running']);
      // the other column's button is off while one runs
      expect(searchButton(OXY).disabled).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: T['convert.nvs.abort'] }));
      await screen.findByText(T['convert.nvs.stopped']);
      expect(document.querySelector('.convert-nvs-results')).toBeNull();
      expect(optionValues(concept(TEMP)).some((v) => v.startsWith('n:'))).toBe(false);
      expect(searchButton(OXY).disabled).toBe(false);
    } finally {
      s.restore();
    }
  });

  it('a failure changes nothing, says so, is not retried by itself, and the button tries again', async () => {
    const s = spies({ failFrom: 1 });
    try {
      await load();
      fireEvent.click(box());
      type(wordBox(TEMP), 'no such term');
      fireEvent.click(searchButton(TEMP));
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('NVS could not be reached');
      expect(s.mock.calls.length).toBe(1);
      await new Promise((r) => setTimeout(r, 80));
      expect(s.mock.calls.length).toBe(1); // no retry by itself
      expect(concept(TEMP).value).toBe('');
      expect(searchButton(TEMP).disabled).toBe(false);
    } finally {
      s.restore();
    }
  });

  it('an HTTP error and an unreadable answer have their own words', async () => {
    for (const [opts, text] of [[{ statusFrom: 1, status: 503 }, 'NVS answered with HTTP status 503'], [{ malformed: true }, 'NVS answered in a form this page cannot read']] as const) {
      const s = spies(opts);
      try {
        await load();
        fireEvent.click(box());
        type(wordBox(TEMP), 'no such term'); // not a code (a typed code would also be asked for by address)
        fireEvent.click(searchButton(TEMP));
        expect((await screen.findByRole('alert')).textContent).toContain(text);
      } finally {
        s.restore();
        cleanup();
        vi.unstubAllGlobals();
      }
    }
  });

  it('unticking withdraws: the results, the typed words and the choices made from a search are forgotten, a verified suggestion that was chosen stays', async () => {
    const s = spies();
    try {
      await load();
      fireEvent.click(box());
      type(wordBox(TEMP), 'invented current');
      fireEvent.click(searchButton(TEMP));
      await screen.findByText(/1 result for "invented current"/);
      fireEvent.change(concept(TEMP), { target: { value: `n:${uri('P01', 'ZZTESTC1')}` } });
      fireEvent.change(concept(OXY), { target: { value: `s:${uri('P01', 'DOXYZZXX')}` } });
      await idle();
      fireEvent.click(box());
      await waitFor(() => expect(document.querySelector('.convert-nvs-search')).toBeNull());
      expect(concept(TEMP).value).toBe('');
      expect(concept(OXY).value).toBe(`s:${uri('P01', 'DOXYZZXX')}`);
      fireEvent.click(box());
      expect((wordBox(TEMP) as HTMLInputElement).value).toBe('');
      expect(document.querySelector('.convert-nvs-results')).toBeNull();
    } finally {
      s.restore();
    }
  });
});

describe('the NVS box and the confirmed choices survive every re-run of the conversion (no remount, no reset)', () => {
  it('ticking, typing, searching and choosing, then changing the quantity, the options, the shape, the language and the description: box, words, results and picks are all still there; only a new upload or the restart link clears them', async () => {
    vi.stubGlobal('fetch', nvsMock().fetch);
    await load();
    fireEvent.click(box());
    type(wordBox(TEMP), 'invented current');
    fireEvent.click(searchButton(TEMP));
    await screen.findByText(/1 result for "invented current"/);
    fireEvent.change(concept(TEMP), { target: { value: `n:${uri('P01', 'ZZTESTC1')}` } });
    fireEvent.change(concept(OXY), { target: { value: `s:${uri('P01', 'DOXYZZXX')}` } });
    type(wordBox(OXY), 'typed, not searched');
    const before = concept(TEMP);
    const still = (): void => {
      expect(box().checked).toBe(true);
      expect(concept(TEMP).value).toBe(`n:${uri('P01', 'ZZTESTC1')}`);
      expect(concept(OXY).value).toBe(`s:${uri('P01', 'DOXYZZXX')}`);
      expect(wordBox(TEMP).value).toBe('invented current');
      expect(wordBox(OXY).value).toBe('typed, not searched');
      expect(document.querySelector('.convert-nvs-results')?.textContent).toContain('ZZTESTC1');
    };
    still();
    // decisions that re-run the conversion (the worker answers again each time)
    fireEvent.change(screen.getByLabelText(T['convert.quantity.kind']), { target: { value: 'density' } });
    await idle();
    still();
    fireEvent.change(screen.getByLabelText(T['convert.quantity.kind']), { target: { value: 'count' } });
    fireEvent.click(screen.getByLabelText(T['convert.fullList']));
    fireEvent.click(screen.getByLabelText(T['convert.flatten.station']));
    type(screen.getByLabelText(T['convert.meta.f.title']), 'A title');
    await idle();
    still();
    // the same DOM node is kept: the section is not remounted
    expect(concept(TEMP)).toBe(before);
    // the language changes the words, not the state
    setLang('pl');
    await waitFor(() => expect(screen.getByRole('checkbox', { name: UI.pl['convert.nvs.optin'] })).toBeTruthy());
    expect((screen.getByRole('checkbox', { name: UI.pl['convert.nvs.optin'] }) as HTMLInputElement).checked).toBe(true);
    setLang('en');
    await waitFor(() => expect(box().checked).toBe(true));
    // the restart link is the other way out (a new upload is the first)
    fireEvent.click(screen.getByRole('button', { name: T['convert.restart'] }));
    await waitFor(() => expect(document.querySelector('.convert-nerc')).toBeNull());
  });

  it('the explanations say what the code does: the unit is the one of the unit field, and only an exact capital-letter code starts the fallback', () => {
    for (const lang of LANGS) {
      const nerc = (TIP_TEXTS[lang] as Record<string, string>)['tip.convertNerc.logic'];
      expect(nerc, lang).not.toMatch(/tak, jak podaje ją kolumna|wie die Spalte sie angibt|telle que la colonne la donne|as the column gives it/);
    }
    expect(TIP_TEXTS.en['tip.convertNerc.logic']).toContain('the unit as shown in the unit field of the column in the table above (the tool proposes it from the header and you can edit it), not necessarily as typed in the header');
    expect(TIP_TEXTS.en['tip.convertNvsOptIn.logic']).toContain('exactly a code, in capital letters and nothing else (a word in lower case is never taken for a code)');
    expect(TIP_TEXTS.de['tip.convertNvsOptIn.logic']).toContain('in Großbuchstaben und sonst nichts');
  });
});

describe('what is written, and GA4', () => {
  const bytesOf = (b: Blob): Promise<Uint8Array> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(b);
    });

  async function exportRun(withNvs: boolean) {
    grantConsent();
    win.dataLayer = [];
    const downloadFile = vi.fn();
    vi.stubGlobal('fetch', nvsMock().fetch);
    await load([{ name: 'l1.csv', text: CSV }], 'en', { downloadFile });
    // the description, the sample size is not declared (a warning), the device is not chosen (a warning)
    const typeInto = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
    typeInto(T['convert.meta.f.title'], 'Synthetic counts (invented)');
    typeInto(T['convert.meta.f.abstract'], 'Invented values for a test.');
    typeInto(T['convert.meta.f.creators'], 'Ada Example');
    typeInto(T['convert.meta.f.contactName'], 'Ada Example');
    typeInto(T['convert.meta.f.contactEmail'], 'ada@example.org');
    typeInto(T['convert.meta.f.institution'], 'INVENTED');
    typeInto(T['convert.meta.f.licence'], 'CC-BY-4.0');
    typeInto(T['convert.meta.f.basis'], 'HumanObservation');
    // the user's choices: temperature by the suggestion, oxygen by a search result (the unit stays without an ID)
    fireEvent.change(concept(TEMP), { target: { value: `s:${uri('P01', 'TEMPPR01')}` } });
    fireEvent.change(unit(TEMP), { target: { value: `s:${uri('P06', 'UPAA')}` } });
    if (withNvs) {
      fireEvent.click(box());
      type(wordBox(OXY), 'invented current');
      fireEvent.click(searchButton(OXY));
      await screen.findByText(/1 result for "invented current"/);
      fireEvent.change(concept(OXY), { target: { value: `n:${uri('P01', 'ZZTESTC1')}` } });
    }
    await idle();
    await waitFor(() => expect(document.querySelector('.convert-accept')).toBeTruthy());
    for (const b of document.querySelectorAll<HTMLInputElement>('.convert-accept [data-rule-group] input[type="checkbox"]')) if (!b.checked) fireEvent.click(b);
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.export.button'] }));
    await waitFor(() => expect(downloadFile).toHaveBeenCalled());
    const blob = downloadFile.mock.calls[0][0] as Blob;
    const z = openZip(await bytesOf(blob));
    const entry = z.entries.find((e) => e.name === 'extendedmeasurementorfact.txt') as (typeof z.entries)[number];
    const text = new TextDecoder().decode(await z.read(entry, nodeInflate));
    const [head, ...rest] = text.split('\n').filter((l) => l !== '').map((l) => l.split('\t'));
    return { rows: rest.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))), ga: win.dataLayer };
  }

  it('the archive carries an identifier only for what was confirmed: the suggested temperature and its unit; the oxygen with its searched concept and no unit ID; and GA4 says nvs: used, never a word or a code', async () => {
    const { rows, ga } = await exportRun(true);
    const of = (type: string) => rows.filter((r) => r.measurementType === type);
    expect(of('temperature').length).toBe(2);
    for (const r of of('temperature')) expect([r.measurementTypeID, r.measurementUnitID, r.measurementUnit, r.occurrenceID]).toEqual([uri('P01', 'TEMPPR01'), uri('P06', 'UPAA'), '°C', '']);
    expect(of('oxygen').map((r) => [r.eventID, r.measurementValue, r.measurementTypeID, r.measurementUnitID, r.measurementUnit])).toEqual([
      ['E1', '310', uri('P01', 'ZZTESTC1'), '', 'µmol/L'],
      ['E2', '295', uri('P01', 'ZZTESTC1'), '', 'µmol/L'],
    ]);
    const exported = (ga as unknown[][]).map((e) => e[2] as { params?: Record<string, unknown> }).filter(Boolean);
    const params = exported.find((e) => e.params === undefined || true);
    void params;
    const dump = JSON.stringify(ga);
    expect(dump).toContain('"nvs":"used"');
    expect(dump).not.toMatch(/ZZTESTC1|invented current|vocab\.nerc|TEMPPR01|Temperature/);
    denyConsent();
  });

  it('without a search the identifiers are the suggestions the user confirmed and GA4 says nvs: none', async () => {
    const { rows, ga } = await exportRun(false);
    expect(rows.filter((r) => r.measurementType === 'oxygen').every((r) => r.measurementTypeID === '' && r.measurementUnitID === '')).toBe(true);
    expect(JSON.stringify(ga)).toContain('"nvs":"none"');
    denyConsent();
  });
});

describe('the privacy copy and the explanations', () => {
  for (const lang of LANGS) {
    it(`${lang}: the copy next to the opt-in says what is sent (only the typed word), to whom, that the IP address is seen, and that nothing is sent before the button; it has its own ⓘ`, async () => {
      setLang(lang);
      await load([{ name: 'l1.csv', text: CSV }], lang);
      const copy = document.querySelector('.convert-nvs-privacy') as HTMLElement;
      expect(copy).toBeTruthy();
      const keys = ['sent', 'to', 'ip', 'button'] as const;
      for (const k of keys) expect(copy.textContent).toContain(UI[lang][`convert.nvs.privacy.${k}` as keyof typeof UI.en]);
      expect(copy.textContent).toContain('vocab.nerc.ac.uk');
      expect(copy.textContent).toContain('BODC');
      expect(copy.textContent).toContain('NOC');
      // the copy stands in the opt-in's own block, with the tick, before any decision
      const block = copy.closest('.convert-nvs') as HTMLElement;
      expect(block.contains(box(lang))).toBe(true);
      if (lang !== 'en') {
        for (const k of keys) expect(UI[lang][`convert.nvs.privacy.${k}` as keyof typeof UI.en], k).not.toBe(UI.en[`convert.nvs.privacy.${k}` as keyof typeof UI.en]);
        // no English sentence inside the text (the names of the service and of its operator stay as they are)
        const rest = copy.textContent?.replace(/British Oceanographic Data Centre|National Oceanography Centre|NERC Vocabulary Server/g, '') ?? '';
        expect(rest).not.toMatch(/\b(the|and|only|nothing|sent|press|button|word|your)\b/i);
      }
      expect(copy.querySelector('[data-tip="convertNvsPrivacy"]')).toBeTruthy();
      expect(block.querySelector('[data-tip="convertNvsOptIn"]')).toBeTruthy();
      expect(document.querySelector('.convert-nerc [data-tip="convertNercChoice"]')).toBeTruthy();
      expect(document.querySelector('.convert-nerc [data-tip="convertNerc"]')).toBeTruthy();
    });
  }

  it('the ⓘ of the results stands beside them, after a search; none sits inside a heading or a label', async () => {
    vi.stubGlobal('fetch', nvsMock().fetch);
    await load();
    fireEvent.click(box());
    type(wordBox(TEMP), 'invented current');
    fireEvent.click(searchButton(TEMP));
    await screen.findByText(/1 result for "invented current"/);
    expect(document.querySelector('.convert-nvs-results [data-tip="convertNvsResults"]')).toBeTruthy();
    expect(document.querySelectorAll('.convert-nerc label .infotip, .convert-nerc h2 .infotip, .convert-nerc h3 .infotip, .convert-nerc h4 .infotip').length).toBe(0);
  });

  it('every text of the section exists in all four languages, with the same placeholders', () => {
    const keys = Object.keys(UI.en).filter((k) => k.startsWith('convert.nvs.') || k.startsWith('convert.nerc.'));
    expect(keys.length).toBeGreaterThan(40);
    for (const k of keys) {
      const ph = (s: string): string => [...new Set([...s.matchAll(/\{\+?(\w+)/g)].map((m) => m[1]))].sort().join(',');
      for (const lang of LANGS) {
        const text = (UI[lang] as Record<string, string>)[k];
        expect(text, `${lang} ${k}`).toBeTruthy();
        expect(ph(text), `${lang} ${k}`).toBe(ph(UI.en[k as keyof typeof UI.en]));
      }
    }
  });

  it('the results line takes the plural of its count in every language', () => {
    const f = (lang: (typeof LANGS)[number], n: number): string => UI[lang]['convert.nvs.found'].replace(/\{\+n:([^}]*)\}/, (_m, forms: string) => forms.split('|')[lang === 'pl' ? (n === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14) ? 1 : 2) : n === 1 ? 0 : 1]);
    expect(f('pl', 1)).toContain('wynik dla');
    expect(f('pl', 3)).toContain('wyniki dla');
    expect(f('pl', 5)).toContain('wyników dla');
    expect(f('de', 1)).toContain('Ergebnis für');
    expect(f('fr', 2)).toContain('résultats pour');
  });

  it('the phone layout: no fixed width, no absolute position in the new rules', () => {
    // (the page-wide check lives in convertGuards; this one is for the NERC rules)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'src', 'app', 'styles.css'), 'utf8') as string;
    const block = css.slice(css.indexOf('/* ---- /convert')).replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...block.matchAll(/([^{}]*convert-(?:nerc|nvs)[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(3);
    for (const [, sel, body] of rules) {
      expect(body, sel).not.toMatch(/position\s*:\s*(absolute|fixed)/);
      expect(body, sel).not.toMatch(/(?:^|[\s;])width\s*:\s*\d/);
    }
  });
});
