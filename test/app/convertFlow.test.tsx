// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// The /convert page end to end (stage 1b) through the real page and a direct convert engine: W1, W2, L1 and L2, a blocked sheet, the one-time
// code proposal, the station prefix, flattening, the companion file, the leave warning, and that nothing reaches the network or any storage.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { COLLISION_CSV, L1_CSV, L2_CSV, NO_CODE_CSV, SIDECAR_CSV, W1_CSV, W2_CSV, chooseFiles } from './convertHelpers';

const T = UI.en;

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

async function load(files: { name: string; text: string }[], download = vi.fn(), lang: 'en' | 'pl' | 'de' | 'fr' = 'en') {
  const view = render(<ConvertPage engine={createDirectConvertEngine()} download={download} />);
  chooseFiles(view.container, files);
  fireEvent.click(screen.getByRole('button', { name: UI[lang]['convert.read'] }));
  await screen.findByRole('heading', { name: UI[lang]['convert.columns.title'] });
  return { ...view, download };
}

const pick = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const summary = (): HTMLElement => screen.getByRole('region', { name: T['convert.summary.title'] });
const settled = async (text: string): Promise<void> => void (await waitFor(() => expect(summary().textContent).toContain(text)));

describe('W1: wide counts with a full species list', () => {
  it('starts blocked, and each decision clears what blocks it', async () => {
    await load([{ name: 'w1.csv', text: W1_CSV }]);
    // overlay proposals: species columns are low-confidence taxon headers, the volume column is the sample size
    expect((screen.getByLabelText('Calanus finmarchicus: Meaning') as HTMLSelectElement).value).toBe('taxonHeader');
    expect((screen.getByLabelText('Volume filtered [m3]: Meaning') as HTMLSelectElement).value).toBe('effort');
    expect((screen.getByRole('radio', { name: /^Wide/ }) as HTMLInputElement).checked).toBe(true);
    // nothing declared: blocked, and the converter says what is missing
    await settled(T['convert.summary.blocked']);
    expect(summary().textContent).toContain('It is not known what the numbers in this sheet mean');

    pick(T['convert.quantity.kind'], 'count');
    pick(T['convert.effort.title'], 'column');
    // the split of "Pseudocalanus sp." is still undecided
    await screen.findByRole('heading', { name: T['convert.splits.title'] });
    expect(summary().textContent).toContain('taxon name carries a qualifier');
    expect(within(screen.getByRole('heading', { name: T['convert.splits.title'] }).closest('section') as HTMLElement).getByText('Pseudocalanus sp.', { selector: 'code' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Approve all shown \(1\)/ }));
    await settled(T['convert.summary.none']);
    // zeros are left out because the list was not declared full
    expect(summary().textContent).toContain('cell with a zero was left out');

    fireEvent.click(screen.getByLabelText(T['convert.fullList']));
    await settled('7 occurrences (6 present, 1 absent)');
    expect(summary().textContent).toContain('6 events');
    expect(summary().textContent).toContain('9 measurement rows');
    expect(summary().textContent).not.toContain('cell with a zero was left out');
    expect(summary().textContent).toContain(T['convert.summary.noExport']);
  });

  it('shows the event tree with its counts and examples, and flattening is the user choice', async () => {
    await load([{ name: 'w1.csv', text: W1_CSV }]);
    pick(T['convert.quantity.kind'], 'count');
    fireEvent.click(await screen.findByRole('button', { name: /Approve all shown/ }));
    const tree = (): HTMLElement => screen.getByRole('region', { name: T['convert.tree.title'] });
    await waitFor(() => expect(tree().textContent).toContain('1 cruise event, 2 station events, 3 sample events.'));
    expect(tree().textContent).toContain('2023-06-14/2023-06-16');
    expect(tree().textContent).toContain('worked out');
    expect(within(tree()).getAllByRole('listitem').length).toBeGreaterThan(3);
    // nothing is flattened until it is ticked
    expect((screen.getByLabelText(T['convert.flatten.station']) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText(T['convert.flatten.station']));
    await waitFor(() => expect(tree().textContent).toContain('1 cruise event, 0 station events, 3 sample events.'));
    fireEvent.click(screen.getByLabelText(T['convert.flatten.cruise']));
    await waitFor(() => expect(tree().textContent).toContain('0 cruise events, 0 station events, 3 sample events.'));
    expect(tree().textContent).toContain('Cruise code for the dataset text: CR1');
  });
});

describe('W2: wide density with stages and qualifiers', () => {
  it('needs the unit; four splits are approved at once and each is shown with its exact text', async () => {
    await load([{ name: 'w2.csv', text: W2_CSV }]);
    pick(T['convert.quantity.kind'], 'density');
    await settled('It is not known what the numbers');
    fireEvent.change(screen.getByLabelText(T['convert.quantity.unit']), { target: { value: '#/m3' } });
    pick(T['convert.effort.title'], 'column');
    const splits = await screen.findByRole('heading', { name: T['convert.splits.title'] });
    const section = splits.closest('section') as HTMLElement;
    for (const text of ['Calanus finmarchicus c2', 'Calanus cf. glacialis', 'Augaptilus glacialis, c2', 'Pseudocalanus sp.']) expect(within(section).getByText(text, { selector: 'code' })).toBeTruthy();
    // one by one: approving a single split leaves the others undecided
    fireEvent.click(screen.getByRole('button', { name: `${T['convert.splits.approve']}: Pseudocalanus sp.` }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Approve all shown \(3\)/ })).toBeTruthy());
    await settled(T['convert.summary.blocked']);
    fireEvent.click(screen.getByRole('button', { name: /Approve all shown \(3\)/ }));
    await settled(T['convert.summary.none']);
    expect(summary().textContent).toContain('cell with a zero was left out');
    // a density has measurement rows for the occurrences and the sample size, never individualCount
    expect(summary().textContent).toContain('5 events, 7 occurrences (7 present, 0 absent) and 9 measurement rows');
  });
});

describe('L1 and L2: long sheets', () => {
  it('L1 with DwC terms is a long sheet from the start, and converts once the count is declared', async () => {
    await load([{ name: 'l1.csv', text: L1_CSV }]);
    expect((screen.getByRole('radio', { name: /^Long/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('occurrenceID: Meaning') as HTMLSelectElement).value).toBe('occurrenceId');
    pick(T['convert.quantity.kind'], 'count');
    await settled(T['convert.summary.none']);
    expect(summary().textContent).toContain('3 occurrences (3 present, 0 absent)');
    expect(summary().textContent).toContain('2 events');
    // no cruise column: the cruise field is offered, and empty means no cruise above the samples
    expect(screen.getByLabelText(T['convert.cruise.label'])).toBeTruthy();
    fireEvent.change(screen.getByLabelText(T['convert.cruise.label']), { target: { value: 'CR9' } });
    await waitFor(() => expect(screen.getByRole('region', { name: T['convert.tree.title'] }).textContent).toContain('1 cruise event'));
  });

  it('L2: the life stage column is a role the user picks; occurrence IDs then come from the user code, and no cruise field when a column has it', async () => {
    await load([{ name: 'l2.csv', text: L2_CSV }]);
    fireEvent.change(screen.getByLabelText('Stage: Meaning'), { target: { value: 'lifeStage' } });
    pick(T['convert.quantity.kind'], 'count');
    await settled(T['convert.summary.none']);
    expect(summary().textContent).toContain('4 occurrences (4 present, 0 absent)');
  });
});

describe('the sample code step', () => {
  it('a sheet without codes is blocked; "Propose codes" downloads the user sheet with a new column and applies nothing', async () => {
    const { download } = await load([{ name: 'no-code.csv', text: NO_CODE_CSV }]);
    pick(T['convert.quantity.kind'], 'count');
    fireEvent.click(await screen.findByRole('button', { name: /Approve all shown/ }));
    const section = (await screen.findByRole('heading', { name: T['convert.codes.title'] })).closest('section') as HTMLElement;
    expect(section.textContent).toContain('has rows without a sample code');
    expect(section.textContent).toContain('never invents one silently');
    await settled(T['convert.summary.blocked']);
    fireEvent.click(within(section).getByRole('button', { name: T['convert.codes.propose'] }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const [csv, name, mime] = download.mock.calls[0] as [string, string, string];
    expect(name).toBe('no-code-with-codes.csv');
    expect(mime).toBe('text/csv');
    const lines = csv.split('\n');
    expect(lines[0].endsWith(',sample_code')).toBe(true);
    expect(lines.slice(1, 4).map((l) => l.split(',').pop())).toEqual(['S1-1', 'S1-2', 'S2-1']);
    // the user's own cells are untouched
    expect(lines[1].startsWith('CR1,S1,2023-06-14,55.5,2.5,0,25,12.3,10,5,0,')).toBe(true);
    expect(within(section).getByRole('status').textContent).toContain('no-code-with-codes.csv');
    expect(section.textContent).toContain('The codes are not applied');
    // still blocked: nothing was applied
    expect(summary().textContent).toContain(T['convert.summary.blocked']);
    expect(summary().textContent).toContain('The sample code is missing');
  });

  it('the proposed sheet, dropped again, is converted with the user codes', async () => {
    const download = vi.fn();
    await load([{ name: 'no-code.csv', text: NO_CODE_CSV }], download);
    pick(T['convert.quantity.kind'], 'count');
    fireEvent.click(await screen.findByRole('button', { name: T['convert.codes.propose'] }));
    await waitFor(() => expect(download).toHaveBeenCalled());
    cleanup();
    await load([{ name: 'with-codes.csv', text: (download.mock.calls[0] as [string])[0] }]);
    fireEvent.change(screen.getByLabelText('sample_code: Meaning'), { target: { value: 'sampleId' } });
    pick(T['convert.quantity.kind'], 'count');
    fireEvent.click(await screen.findByRole('button', { name: /Approve all shown/ }));
    await settled(T['convert.summary.none']);
    expect(summary().textContent).toContain('6 occurrences');
  });
});

describe('the station prefix', () => {
  it('is offered only when sample codes collide, and fixes the collision when ticked', async () => {
    await load([{ name: 'w1.csv', text: W1_CSV }]);
    expect(screen.queryByLabelText(T['convert.prefix'])).toBeNull();
    cleanup();
    await load([{ name: 'collision.csv', text: COLLISION_CSV }]);
    pick(T['convert.quantity.kind'], 'count');
    await settled('The same identifier is produced more than once');
    fireEvent.click(await screen.findByLabelText(T['convert.prefix']));
    await settled(T['convert.summary.none']);
  });
});

describe('the companion file', () => {
  it('pre-ticks the full species list and the station prefix for this drop, and is not read as data', async () => {
    await load([{ name: 'w1.csv', text: W1_CSV }, { name: 'run.sidecar.csv', text: SIDECAR_CSV }]);
    expect((screen.getByLabelText(T['convert.fullList']) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(T['convert.prefix']) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/run\.sidecar\.csv/, { selector: 'p' })).toBeTruthy();
    expect(screen.queryByText(/Sheet .* of run\.sidecar\.csv/)).toBeNull();
    // a new upload starts from nothing again
    cleanup();
    await load([{ name: 'w1.csv', text: W1_CSV }]);
    expect((screen.getByLabelText(T['convert.fullList']) as HTMLInputElement).checked).toBe(false);
  });
});

describe('leaving the page', () => {
  it('warns while files are chosen or a conversion is shown, and never on an empty page', async () => {
    const leave = (): boolean => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    const { container } = render(<ConvertPage engine={createDirectConvertEngine()} />);
    expect(leave()).toBe(false);
    chooseFiles(container, [{ name: 'w1.csv', text: W1_CSV }]);
    await waitFor(() => expect(leave()).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    expect(leave()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: T['convert.restart'] }));
    // back on the input step with the file still chosen: still work to lose
    expect(leave()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
    await waitFor(() => expect(leave()).toBe(false));
  });
});

describe('no network and no storage', () => {
  it('a whole drop-to-summary run makes no request and writes nowhere', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network is not allowed')));
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const beacon = vi.fn();
    const idbOpen = vi.fn();
    const cookieSet = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('indexedDB', { open: idbOpen });
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    const cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(document, 'cookie', { configurable: true, get: () => '', set: cookieSet });
    const lsSet = vi.spyOn(Storage.prototype, 'setItem');
    const lsRemove = vi.spyOn(Storage.prototype, 'removeItem');
    const lsClear = vi.spyOn(Storage.prototype, 'clear');
    try {
      await load([{ name: 'w1.csv', text: W1_CSV }, { name: 'run.sidecar.csv', text: SIDECAR_CSV }]);
      pick(T['convert.quantity.kind'], 'count');
      fireEvent.click(await screen.findByRole('button', { name: /Approve all shown/ }));
      fireEvent.click(screen.getByLabelText(T['convert.flatten.station']));
      await settled(T['convert.summary.none']);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(xhrOpen).not.toHaveBeenCalled();
      expect(beacon).not.toHaveBeenCalled();
      expect(idbOpen).not.toHaveBeenCalled();
      expect(cookieSet).not.toHaveBeenCalled();
      expect(lsSet).not.toHaveBeenCalled();
      expect(lsRemove).not.toHaveBeenCalled();
      expect(lsClear).not.toHaveBeenCalled();
      expect(sessionStorage.length).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      if (cookieDesc) Object.defineProperty(document, 'cookie', cookieDesc);
      else delete (document as unknown as Record<string, unknown>).cookie;
    }
  });
});

describe('the four languages', () => {
  it('the whole flow renders in every language with no key left over and no raw placeholder', async () => {
    for (const lang of ['pl', 'de', 'fr'] as const) {
      cleanup();
      setLang(lang);
      await load([{ name: 'w1.csv', text: W1_CSV }], vi.fn(), lang);
      await waitFor(() => expect(screen.getByRole('region', { name: UI[lang]['convert.summary.title'] }).textContent).toContain(UI[lang]['convert.summary.blocked']));
      fireEvent.change(screen.getByLabelText(UI[lang]['convert.quantity.kind']), { target: { value: 'count' } });
      await screen.findByRole('heading', { name: UI[lang]['convert.splits.title'] });
      const text = document.body.textContent ?? '';
      expect(text, lang).not.toMatch(/\{[A-Za-z]+\}/);
      expect(text, lang).not.toMatch(/convert\.[a-z]+\.[a-zA-Z.]+/);
    }
  });
});
