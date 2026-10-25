// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// The WoRMS opt-in on the /convert page (stage 4), through the real page and a direct convert engine, with fetch mocked from recorded answers:
// the conditions the owner approved it under. Nothing is sent before the user presses the button (fetch, XHR, sendBeacon and storage are spied: no call with
// the box off, none with it ticked, none after a companion file pre-ticked it); a new upload resets the box; only names are sent, in batches; the matching is
// visible and only a single exact match is automatic; errors leave the IDs alone; the privacy copy stands next to the opt-in in four languages.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { denyConsent, grantConsent } from '../../src/app/analytics';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { WORMS_ENDPOINT } from '../../src/app/optins/worms';
import { UI } from '../../src/core/i18n/ui';
import { writeConvertSidecar } from '../../src/core/convert/settings';
import { openZip } from '../../src/core/parse/zip';
import { LANGS } from '../../src/core/types';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { nodeInflate } from '../helpers/zipfile';
import { wormsMock } from '../helpers/wormsFixtures';
import { L1_HEADER, type Cell } from '../convert/helpers';
import { chooseFiles, csvOf } from './convertHelpers';

vi.setConfig({ testTimeout: 20_000 });
const T = UI.en;
const win = window as unknown as { dataLayer: unknown[]; gtag?: unknown };

/** A long sheet whose names are those of the fixtures: an exact one, a near one, an unaccepted one, a homonym, a nonsense one, a terrestrial one. All values invented. */
const NAMES = ['Calanus finmarchicus', 'Calanus finmarchicu', 'Sagitta elegans', 'Oithona', 'Xyzzyqq nonsensus', 'Homo sapiens'];
const ROWS: Cell[][] = NAMES.map((n, i) => [`occ-${i + 1}`, `E${Math.floor(i / 2) + 1}`, n, i + 2, 54.1 + Math.floor(i / 2), 7.9, '2022-05-05', 0, 10]);
const CSV = csvOf(L1_HEADER, ROWS);
const SIDECAR_WORMS = writeConvertSidecar({ worms: true });

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
const box = (lang: (typeof LANGS)[number] = 'en'): HTMLInputElement => screen.getByRole('checkbox', { name: UI[lang]['convert.worms.optin'] }) as HTMLInputElement;
const lookupButton = (n: number): HTMLElement => screen.getByRole('button', { name: `Look up ${n} names in WoRMS` });
/** The result table of the lookup (the page has other tables: the column mapping). */
const wormsTable = (): Promise<HTMLElement> => waitFor(() => { const t = document.querySelector('.convert-worms-table'); expect(t).toBeTruthy(); return t as HTMLElement; });
const decision = (name: string): HTMLSelectElement => screen.getByLabelText(`ID for ${name}`) as HTMLSelectElement;

async function load(files: { name: string; text: string }[], lang: (typeof LANGS)[number] = 'en', props: Partial<React.ComponentProps<typeof ConvertPage>> = {}) {
  const view = render(<ConvertPage engine={createDirectConvertEngine()} {...props} />);
  chooseFiles(view.container, files);
  fireEvent.click(screen.getByRole('button', { name: UI[lang]['convert.read'] }));
  await screen.findByRole('heading', { name: UI[lang]['convert.columns.title'] });
  fireEvent.change(screen.getByLabelText(UI[lang]['convert.quantity.kind']), { target: { value: 'count' } });
  await screen.findByRole('heading', { name: UI[lang]['convert.worms.title'] });
  return view;
}

/** Every channel a page could send something through, spied; storage too. */
function spies() {
  const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
  const beacon = vi.fn();
  const idb = vi.fn();
  const cookieSet = vi.fn();
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
  vi.stubGlobal('indexedDB', { open: idb });
  const cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  Object.defineProperty(document, 'cookie', { configurable: true, get: () => '', set: cookieSet });
  const ls = [vi.spyOn(Storage.prototype, 'setItem'), vi.spyOn(Storage.prototype, 'removeItem'), vi.spyOn(Storage.prototype, 'clear')];
  const mock = wormsMock();
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

describe('nothing is sent before the user acts', () => {
  it('the box is off on every upload: 0 calls with the box off, 0 with it ticked but not pressed, 0 after a companion file pre-ticked it; storage untouched', async () => {
    const s = spies();
    try {
      await load([{ name: 'l1.csv', text: CSV }]);
      await settled(T['convert.summary.none']);
      expect(box().checked).toBe(false);
      s.expectSilent();
      // ticking sends nothing: the names are listed, the button is offered, nobody called anything
      fireEvent.click(box());
      expect(box().checked).toBe(true);
      await screen.findByText(`Names that would be sent (${NAMES.length})`);
      expect(lookupButton(NAMES.length)).toBeTruthy();
      await idle();
      s.expectSilent();
      cleanup();
      // a companion file of the drop pre-ticks the box and still sends nothing
      await load([{ name: 'l1.csv', text: CSV }, { name: 'run.sidecar.csv', text: SIDECAR_WORMS }]);
      await waitFor(() => expect(box().checked).toBe(true));
      await screen.findByText(`Names that would be sent (${NAMES.length})`);
      await idle();
      s.expectSilent();
      expect(document.querySelector('.convert-worms-table')).toBeNull();
    } finally {
      s.restore();
    }
  });

  it('a new upload resets the box (and a lookup): ticked and looked up, then another upload starts unticked with nothing found', async () => {
    const s = spies();
    try {
      const view = await load([{ name: 'l1.csv', text: CSV }]);
      fireEvent.click(box());
      fireEvent.click(await screen.findByRole('button', { name: `Look up ${NAMES.length} names in WoRMS` }));
      await wormsTable();
      expect(s.mock.calls.length).toBe(1);
      // another upload
      chooseFiles(view.container, [{ name: 'l1b.csv', text: CSV }]);
      fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
      await screen.findByText(T['convert.reading']);
      await waitFor(() => expect(screen.queryByText(T['convert.reading'])).toBeNull());
      await screen.findByRole('heading', { name: T['convert.worms.title'] });
      expect(box().checked).toBe(false);
      expect(document.querySelector('.convert-worms-table')).toBeNull();
      expect(s.mock.calls.length).toBe(1); // nothing new was sent
    } finally {
      s.restore();
    }
  });

  it('the page, rendered, holds no link, preconnect or prefetch to the service', async () => {
    await load([{ name: 'l1.csv', text: CSV }]);
    expect(document.documentElement.outerHTML).not.toMatch(/marinespecies\.org\//);
    expect(document.querySelectorAll('link[rel="preconnect"], link[rel="dns-prefetch"], link[rel="prefetch"], link[rel="preload"], a[href*="marinespecies"]').length).toBe(0);
  });
});

describe('the lookup', () => {
  it('sends exactly the distinct names, once the button is pressed, and shows each result with its match type, status, rank and habitat', async () => {
    const s = spies();
    try {
      await load([{ name: 'l1.csv', text: CSV }]);
      fireEvent.click(box());
      fireEvent.click(await screen.findByRole('button', { name: `Look up ${NAMES.length} names in WoRMS` }));
      await wormsTable();
      expect(s.mock.calls.length).toBe(1);
      expect(s.mock.calls[0].url).toBe(`${WORMS_ENDPOINT}?${NAMES.map((n) => `scientificnames[]=${encodeURIComponent(n)}`).join('&')}&marine_only=false`);
      expect(s.mock.calls[0].names).toEqual(NAMES);
      // nothing but names: no event code, depth, count, file name or station in the URL
      expect(s.mock.calls[0].url).not.toMatch(/occ-|E1|l1\.csv|54\.1|2022/);
      const table = document.querySelector('.convert-worms-table') as HTMLElement;
      // the table scrolls inside its own container
      expect(table.closest('.table-scroll')).toBeTruthy();
      const body = (name: string): HTMLElement => within(table).getByRole('rowheader', { name }).closest('tbody') as HTMLElement;
      // exact, single: automatic
      expect(body('Calanus finmarchicus').getAttribute('data-match')).toBe('auto');
      expect(decision('Calanus finmarchicus').value).toBe('auto');
      expect(body('Calanus finmarchicus').textContent).toContain('104464');
      expect(body('Calanus finmarchicus').textContent).toContain('exact');
      // near: the user chooses, nothing is pre-selected
      expect(body('Calanus finmarchicu').getAttribute('data-match')).toBe('choose');
      expect(body('Calanus finmarchicu').textContent).toContain('near_1');
      expect(decision('Calanus finmarchicu').value).toBe('');
      // homonym: two results, the user chooses
      expect(body('Oithona').querySelectorAll('tr').length).toBe(2);
      expect(decision('Oithona').value).toBe('');
      // unaccepted: shown with its valid name
      expect(body('Sagitta elegans').textContent).toContain('unaccepted → valid name Parasagitta elegans');
      // not marine: the habitat says so
      expect(body('Homo sapiens').textContent).toContain('terrestrial');
      // an unaccepted record with no habitat flag says the habitat is unknown, and an exact match is not shown as "exact (exact)"
      expect(body('Oithona').textContent).toContain('unknown (WoRMS states no habitat for this record)');
      expect(body('Calanus finmarchicus').textContent).not.toContain('exact (exact)');
      // no match
      expect(body('Xyzzyqq nonsensus').getAttribute('data-match')).toBe('none');
      expect(body('Xyzzyqq nonsensus').textContent).toContain(T['convert.worms.nomatch']);
      expect(screen.getByText('Results: 3 exact and taken automatically, 2 for you to choose, 1 with no match.')).toBeTruthy();
    } finally {
      s.restore();
    }
  });

  it('an undecided name blocks the export; choosing (or "no ID") clears it; no match and not-marine need an acceptance; scientificName is never replaced', async () => {
    const s = spies();
    try {
      await load([{ name: 'l1.csv', text: CSV }]);
      await settled(T['convert.summary.none']);
      fireEvent.click(box());
      fireEvent.click(await screen.findByRole('button', { name: `Look up ${NAMES.length} names in WoRMS` }));
      await wormsTable();
      await settled('waiting for your choice');
      expect(summary().textContent).toContain('Calanus finmarchicu, Oithona');
      expect(summary().textContent).toContain(T['convert.summary.blocked']);
      fireEvent.change(decision('Calanus finmarchicu'), { target: { value: '104464' } });
      await settled('waiting for your choice'); // Oithona is still open
      fireEvent.change(decision('Oithona'), { target: { value: 'none' } });
      await waitFor(() => expect(summary().textContent).not.toContain('waiting for your choice'));
      await idle();
      // the accept warnings of the lookup
      const groups = [...document.querySelectorAll('.convert-accept [data-rule-group]')].map((g) => g.getAttribute('data-rule-group'));
      expect(groups).toContain('CONV-WORMS-NO-MATCH');
      expect(groups).toContain('CONV-WORMS-NOT-MARINE');
      expect(summary().textContent).toContain('WoRMS has no result for 1 name: Xyzzyqq nonsensus');
      expect(summary().textContent).toContain('WoRMS marks 1 confirmed name as freshwater or terrestrial only');
      // the names with an ID are no longer counted as missing: 3 occurrences of 6 (Oithona: user chose none, Xyzzyqq: no match) are still without
      expect(summary().textContent).toMatch(/2 occurrences have no scientificNameID/);
      // an automatic name can be given no ID by the user
      fireEvent.change(decision('Calanus finmarchicus'), { target: { value: 'none' } });
      await waitFor(() => expect(summary().textContent).toMatch(/3 occurrences have no scientificNameID/));
      fireEvent.change(decision('Calanus finmarchicus'), { target: { value: 'auto' } });
      await waitFor(() => expect(summary().textContent).toMatch(/2 occurrences have no scientificNameID/));
    } finally {
      s.restore();
    }
  });

  it('120 names go in sequential batches of 50 with progress, and the Abort button aborts: later batches are never sent, completed ones are kept, and a retry sends the rest', async () => {
    const letters = (i: number): string => String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
    const many = Array.from({ length: 120 }, (_, i) => `Inventus ux${letters(i)}`);
    const csv = csvOf(L1_HEADER, many.map((n, i) => [`o${i}`, `E${i}`, n, 1, 54, 7, '2022-05-05', 0, 10] as Cell[]));
    let release: (() => void) | undefined;
    const mock = wormsMock({
      onCall: (_c, n) => (n === 2 ? new Promise<void>((r) => (release = r)) : undefined),
    });
    vi.stubGlobal('fetch', mock.fetch);
    await load([{ name: 'many.csv', text: csv }]);
    fireEvent.click(box());
    await waitFor(() => expect([...document.querySelectorAll('button')].map((b) => b.textContent).filter((x) => /Look up/.test(x ?? ''))).toEqual(['Look up 120 names in WoRMS']));
    fireEvent.click(screen.getByRole('button', { name: 'Look up 120 names in WoRMS' }));
    await waitFor(() => expect(mock.calls.length).toBe(2));
    // call 2 is open: progress shows the first batch done, and Abort is offered instead of the lookup button
    await screen.findByText('Looking up names… 50 of 120 done.');
    expect(screen.queryByRole('button', { name: /^Look up/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: T['convert.worms.abort'] }));
    expect((mock.calls[1].init?.signal as AbortSignal).aborted).toBe(true);
    release?.();
    await screen.findByText('Lookup stopped: 50 of 120 names answered. The other names have no ID yet; press the button again to look them up, or continue without IDs.');
    expect(mock.calls.length).toBe(2); // the third batch was never sent
    expect(mock.calls[0].names.length).toBe(50);
    // retry: only the 70 names without a result are sent, in batches of 50 and 20
    fireEvent.click(screen.getByRole('button', { name: 'Look up 70 names in WoRMS' }));
    await screen.findByText('Lookup finished: 70 names answered.');
    expect(mock.calls.slice(2).map((c) => c.names.length)).toEqual([50, 20]);
    expect(mock.calls.slice(2).flatMap((c) => c.names)).toEqual(many.slice(50));
  });

  it('a network or CORS failure shows a clear message and changes no ID; the user can try again, or continue without IDs', async () => {
    const mock = wormsMock({ failFrom: 1 });
    vi.stubGlobal('fetch', mock.fetch);
    await load([{ name: 'l1.csv', text: CSV }]);
    await settled(T['convert.summary.none']);
    fireEvent.click(box());
    fireEvent.click(await screen.findByRole('button', { name: `Look up ${NAMES.length} names in WoRMS` }));
    const alert = await screen.findByText(/could not reach WoRMS/);
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toContain('The failed call changed nothing');
    expect(document.querySelector('.convert-worms-table')).toBeNull();
    // no ID was written, nothing new blocks, and the same button tries again
    await idle();
    expect(summary().textContent).toContain(T['convert.summary.none']);
    expect(summary().textContent).toContain(`${NAMES.length} occurrences have no scientificNameID`);
    expect(lookupButton(NAMES.length)).toBeTruthy();
    // continuing without IDs: unticking removes everything, and the export of the sheet is as it was
    fireEvent.click(box());
    expect(screen.queryByText(/could not reach WoRMS/)).toBeNull();
  });

  it('an HTTP error (4xx, 5xx) says so with the status, and a late answer after unticking is ignored', async () => {
    vi.stubGlobal('fetch', wormsMock({ statusFrom: 1, status: 503 }).fetch);
    await load([{ name: 'l1.csv', text: CSV }]);
    fireEvent.click(box());
    fireEvent.click(await screen.findByRole('button', { name: `Look up ${NAMES.length} names in WoRMS` }));
    expect((await screen.findByRole('alert', {}, { timeout: 5000 })).textContent).toContain('HTTP 503');
    cleanup();
    // a slow answer that arrives after the user unticked changes nothing
    let release: (() => void) | undefined;
    const slow = wormsMock({ onCall: () => new Promise<void>((r) => (release = r)) });
    vi.stubGlobal('fetch', slow.fetch);
    await load([{ name: 'l1.csv', text: CSV }]);
    fireEvent.click(box());
    fireEvent.click(await screen.findByRole('button', { name: `Look up ${NAMES.length} names in WoRMS` }));
    await waitFor(() => expect(slow.calls.length).toBe(1));
    fireEvent.click(box()); // unticked while the call is open
    release?.();
    await idle();
    expect(document.querySelector('.convert-worms-table')).toBeNull();
    expect(box().checked).toBe(false);
  });

  it('names that already have an ID from a column of the sheet are not sent, and the page says so', async () => {
    const header = ['occurrenceID', 'eventID', 'scientificName', 'AphiaID', 'individualCount', 'decimalLatitude', 'decimalLongitude', 'eventDate'];
    const csv = csvOf(header, [['o1', 'E1', 'Calanus finmarchicus', 104464, 5, 54.1, 7.9, '2022-05-05'], ['o2', 'E1', 'Oithona', null, 3, 54.1, 7.9, '2022-05-05']]);
    const s = spies();
    try {
      await load([{ name: 'ids.csv', text: csv }]);
      fireEvent.click(box());
      await screen.findByText('Names that would be sent (1)');
      expect(screen.getByText('Names that have an ID from a column of your sheet on at least one row are not sent, and none of their rows gets a WoRMS ID (count: 1).')).toBeTruthy();
      fireEvent.click(await screen.findByRole('button', { name: 'Look up 1 name in WoRMS' }));
      await wormsTable();
      expect(s.mock.calls[0].names).toEqual(['Oithona']);
    } finally {
      s.restore();
    }
  });
});

describe('the archive and GA4', () => {
  const bytesOf = (b: Blob): Promise<Uint8Array> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(b);
    });
  const type = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const events = (): { name: string; params: Record<string, unknown> }[] =>
    win.dataLayer.map((e) => Array.from(e as ArrayLike<unknown>)).filter((e) => e[0] === 'event').map((e) => ({ name: e[1] as string, params: e[2] as Record<string, unknown> }));

  async function exportAfterLookup(): Promise<{ occurrence: string; download: ReturnType<typeof vi.fn> }> {
    const download = vi.fn();
    const downloadFile = vi.fn();
    vi.stubGlobal('fetch', wormsMock().fetch);
    await load([{ name: 'l1.csv', text: CSV }], 'en', { download, downloadFile });
    fireEvent.click(box());
    fireEvent.click(await screen.findByRole('button', { name: `Look up ${NAMES.length} names in WoRMS` }));
    await wormsTable();
    fireEvent.change(decision('Calanus finmarchicu'), { target: { value: '104464' } });
    fireEvent.change(decision('Oithona'), { target: { value: '106485' } });
    type(T['convert.meta.f.title'], 'Synthetic names (invented)');
    type(T['convert.meta.f.abstract'], 'Invented values for a test.');
    type(T['convert.meta.f.creators'], 'Ada Example');
    type(T['convert.meta.f.contactName'], 'Ada Example');
    type(T['convert.meta.f.contactEmail'], 'ada@example.org');
    type(T['convert.meta.f.institution'], 'INVENTED');
    type(T['convert.meta.f.licence'], 'CC-BY-4.0');
    type(T['convert.meta.f.basis'], 'HumanObservation');
    await idle();
    await waitFor(() => expect(document.querySelector('.convert-accept')).toBeTruthy());
    for (const b of document.querySelectorAll<HTMLInputElement>('.convert-accept [data-rule-group] input[type="checkbox"]')) if (!b.checked) fireEvent.click(b);
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.export.button'] }));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1));
    const z = openZip(await bytesOf((downloadFile.mock.calls[0] as [Blob])[0]));
    const occurrence = new TextDecoder().decode(await z.read(z.find('occurrence.txt')!, nodeInflate));
    return { occurrence, download };
  }

  it('the archive carries the confirmed IDs (an unaccepted name with its own AphiaID), scientificName as written, and GA4 says worms: used, with no name in it', async () => {
    grantConsent();
    win.dataLayer = [];
    const { occurrence, download } = await exportAfterLookup();
    const row = (name: string): string[] => occurrence.split('\n').map((l) => l.split('\t')).find((c) => c.includes(name)) ?? [];
    expect(row('Sagitta elegans').join('\t')).toContain('urn:lsid:marinespecies.org:taxname:105450');
    expect(occurrence).not.toContain('105440'); // the valid name's ID is never written
    expect(row('Sagitta elegans')).toContain('Sagitta elegans'); // scientificName not replaced by Parasagitta elegans
    expect(occurrence).not.toContain('Parasagitta');
    expect(row('Calanus finmarchicu').join('\t')).toContain('urn:lsid:marinespecies.org:taxname:104464'); // the user's choice for the near match
    expect(row('Oithona').join('\t')).toContain('urn:lsid:marinespecies.org:taxname:106485');
    const exported = events().find((e) => e.name === 'convert_exported');
    expect(exported?.params.worms).toBe('used');
    expect(JSON.stringify(win.dataLayer)).not.toMatch(/Calanus|Sagitta|Oithona|Homo|marinespecies|urn:lsid|104464|105450/);
    // the companion file remembers that the box was ticked, and nothing of the names
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    expect(download.mock.calls[0][0]).toBe('original_column,output_column,unit,unit_source,p01\n(setting),worms=yes,,,\n');
  });

  it('GA4 says worms: none when the box was used but no ID went into the archive (every name set to "no ID")', async () => {
    grantConsent();
    win.dataLayer = [];
    const downloadFile = vi.fn();
    vi.stubGlobal('fetch', wormsMock().fetch);
    await load([{ name: 'l1.csv', text: CSV }], 'en', { downloadFile });
    fireEvent.click(box());
    fireEvent.click(await screen.findByRole('button', { name: `Look up ${NAMES.length} names in WoRMS` }));
    await wormsTable();
    for (const n of NAMES.filter((x) => x !== 'Xyzzyqq nonsensus')) fireEvent.change(decision(n), { target: { value: 'none' } });
    type(T['convert.meta.f.title'], 'Synthetic names (invented)');
    type(T['convert.meta.f.abstract'], 'Invented values.');
    type(T['convert.meta.f.creators'], 'Ada Example');
    type(T['convert.meta.f.contactName'], 'Ada Example');
    type(T['convert.meta.f.contactEmail'], 'ada@example.org');
    type(T['convert.meta.f.institution'], 'INVENTED');
    type(T['convert.meta.f.licence'], 'CC-BY-4.0');
    type(T['convert.meta.f.basis'], 'HumanObservation');
    await idle();
    await waitFor(() => expect(document.querySelector('.convert-accept')).toBeTruthy());
    for (const b of document.querySelectorAll<HTMLInputElement>('.convert-accept [data-rule-group] input[type="checkbox"]')) if (!b.checked) fireEvent.click(b);
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.export.button'] }));
    await waitFor(() => expect(downloadFile).toHaveBeenCalled());
    expect(events().find((e) => e.name === 'convert_exported')?.params.worms).toBe('none');
    denyConsent();
  });

  it('without a lookup GA4 says worms: none; without consent nothing is pushed', async () => {
    grantConsent();
    win.dataLayer = [];
    const downloadFile = vi.fn();
    vi.stubGlobal('fetch', wormsMock().fetch);
    await load([{ name: 'l1.csv', text: CSV }], 'en', { downloadFile });
    type(T['convert.meta.f.title'], 'Synthetic names (invented)');
    type(T['convert.meta.f.abstract'], 'Invented values.');
    type(T['convert.meta.f.creators'], 'Ada Example');
    type(T['convert.meta.f.contactName'], 'Ada Example');
    type(T['convert.meta.f.contactEmail'], 'ada@example.org');
    type(T['convert.meta.f.institution'], 'INVENTED');
    type(T['convert.meta.f.licence'], 'CC-BY-4.0');
    type(T['convert.meta.f.basis'], 'HumanObservation');
    await idle();
    await waitFor(() => expect(document.querySelector('.convert-accept')).toBeTruthy());
    for (const b of document.querySelectorAll<HTMLInputElement>('.convert-accept [data-rule-group] input[type="checkbox"]')) if (!b.checked) fireEvent.click(b);
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.export.button'] }));
    await waitFor(() => expect(downloadFile).toHaveBeenCalled());
    expect(events().find((e) => e.name === 'convert_exported')?.params.worms).toBe('none');
    denyConsent();
  });
});

describe('the privacy copy and the explanations', () => {
  for (const lang of LANGS) {
    it(`${lang}: the copy next to the opt-in says what is sent, to whom, that the IP address is seen, that names can reveal unpublished findings, and that nothing is sent before the button`, async () => {
      setLang(lang);
      await load([{ name: 'l1.csv', text: CSV }], lang);
      const copy = document.querySelector('.convert-worms-privacy') as HTMLElement;
      expect(copy).toBeTruthy();
      const keys = ['sent', 'to', 'ip', 'unpublished', 'button'] as const;
      for (const k of keys) expect(copy.textContent).toContain(UI[lang][`convert.worms.privacy.${k}` as keyof typeof UI.en]);
      expect(copy.textContent).toContain('www.marinespecies.org');
      expect(copy.textContent).toContain('VLIZ');
      // the copy stands in the opt-in's own section, before any decision
      const section = copy.closest('section') as HTMLElement;
      expect(section.contains(box(lang))).toBe(true);
      if (lang !== 'en') {
        expect(copy.textContent).not.toBe(UI.en['convert.worms.privacy.sent']);
        for (const k of keys) expect(UI[lang][`convert.worms.privacy.${k}` as keyof typeof UI.en], k).not.toBe(UI.en[`convert.worms.privacy.${k}` as keyof typeof UI.en]);
        // no English sentence inside the text
        expect(copy.textContent).not.toMatch(/\b(the|and|only|nothing|sent|press|button|names|your)\b/i);
      }
      // its own ⓘ, and one for the opt-in
      expect(copy.querySelector('[data-tip="convertWormsPrivacy"]')).toBeTruthy();
      expect(section.querySelector('[data-tip="convertWormsOptIn"]')).toBeTruthy();
    });
  }

  it('the result table and the decision have their own ⓘ, after a lookup, and none sits inside a heading or a label', async () => {
    vi.stubGlobal('fetch', wormsMock().fetch);
    await load([{ name: 'l1.csv', text: CSV }]);
    fireEvent.click(box());
    fireEvent.click(await screen.findByRole('button', { name: `Look up ${NAMES.length} names in WoRMS` }));
    await wormsTable();
    const section = document.querySelector('.convert-worms') as HTMLElement;
    for (const id of ['convertWormsOptIn', 'convertWormsPrivacy', 'convertWormsTable', 'convertWormsChoice']) expect(section.querySelector(`[data-tip="${id}"]`), id).toBeTruthy();
    expect(section.querySelectorAll('label .infotip').length).toBe(0);
  });

  it('every text of the section exists in all four languages, with the same placeholders', () => {
    const keys = Object.keys(UI.en).filter((k) => k.startsWith('convert.worms.'));
    expect(keys.length).toBeGreaterThan(60);
    for (const k of keys) {
      const ph = (s: string): string => [...new Set([...s.matchAll(/\{\+?(\w+)/g)].map((m) => m[1]))].sort().join(',');
      for (const lang of LANGS) {
        const text = (UI[lang] as Record<string, string>)[k];
        expect(text, `${lang} ${k}`).toBeTruthy();
        expect(ph(text), `${lang} ${k}`).toBe(ph(UI.en[k as keyof typeof UI.en]));
      }
    }
  });

  it('the result table scrolls inside its own container on a phone: no position:absolute, no fixed width wider than the screen', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'src', 'app', 'styles.css'), 'utf8');
    const block = css.slice(css.indexOf('/* ---- /convert')).replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...block.matchAll(/([^{}]*convert-worms[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, sel, body] of rules) expect(body, sel).not.toMatch(/position\s*:\s*(absolute|fixed)/);
  });
});
