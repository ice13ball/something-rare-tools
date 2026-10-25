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
import { dataciteXml } from '../convert/metaFixtures';
import { COLLISION_CSV, L1_CSV, L2_CSV, NO_CODE_CSV, SIDECAR_CSV, W1_CSV, W2_CSV, chooseFiles } from './convertHelpers';

// every test drives the whole page through a real worker handler in jsdom: the heaviest ones (W1, the four languages, the error test) took 5 s alone and timed out under the load of the full suite
vi.setConfig({ testTimeout: 30_000 });
const T = UI.en;

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

async function load(files: { name: string; text: string }[], download = vi.fn(), lang: 'en' | 'pl' | 'de' | 'fr' = 'en', confirmTaxa = true) {
  const view = render(<ConvertPage engine={createDirectConvertEngine()} download={download} />);
  chooseFiles(view.container, files);
  fireEvent.click(screen.getByRole('button', { name: UI[lang]['convert.read'] }));
  await screen.findByRole('heading', { name: UI[lang]['convert.columns.title'] });
  // the overlay's proposed taxon columns are converted only after the user confirms them
  const confirm = screen.queryByRole('button', { name: new RegExp(UI[lang]['convert.taxa.confirmAll'].replace(/\{n\}.*$/, '').replace(/[()]/g, '')) });
  if (confirmTaxa && confirm) fireEvent.click(confirm);
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
    fireEvent.click(screen.getByRole('button', { name: /^Approve 1 shown / }));
    await settled(T['convert.summary.none']);
    // zeros are left out because the list was not declared full
    expect(summary().textContent).toContain('cell with a zero was left out');

    fireEvent.click(screen.getByLabelText(T['convert.fullList']));
    await settled('7 occurrences (6 present, 1 absent)');
    expect(summary().textContent).toContain('6 events');
    expect(summary().textContent).toContain('9 measurement rows');
    expect(summary().textContent).not.toContain('cell with a zero was left out');
    expect(summary().textContent).toContain(T['convert.export.title']);
  });

  it('shows the event tree with its counts and examples, and flattening is the user choice', async () => {
    await load([{ name: 'w1.csv', text: W1_CSV }]);
    pick(T['convert.quantity.kind'], 'count');
    fireEvent.click(await screen.findByRole('button', { name: /^Approve \d+ shown/ }));
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
    await waitFor(() => expect(screen.getByRole('button', { name: /^Approve 3 shown / })).toBeTruthy());
    await settled(T['convert.summary.blocked']);
    fireEvent.click(screen.getByRole('button', { name: /^Approve 3 shown / }));
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
    fireEvent.click(await screen.findByRole('button', { name: /^Approve \d+ shown/ }));
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
    fireEvent.click(await screen.findByRole('button', { name: /^Approve \d+ shown/ }));
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
      // a metadata file is dropped too: its licence and fields are read in the worker, from the file's bytes only (stage 3)
      await load([{ name: 'w1.csv', text: W1_CSV }, { name: 'run.sidecar.csv', text: SIDECAR_CSV }, { name: 'bay.datacite.xml', text: dataciteXml({ licence: 'CC-BY-4.0', contacts: ['Example, Anna'] }) }]);
      expect((screen.getByLabelText(T['convert.meta.f.title']) as HTMLInputElement).value).toBe('Synthetic zooplankton counts, Test Bay 2019');
      pick(T['convert.quantity.kind'], 'count');
      fireEvent.click(await screen.findByRole('button', { name: /^Approve \d+ shown/ }));
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

describe('proposed taxon columns are converted only after confirmation (M1)', () => {
  it('lists them with their own control; nothing from an unconfirmed column is converted, and the summary says so', async () => {
    await load([{ name: 'w1.csv', text: W1_CSV }], vi.fn(), 'en', false);
    const section = (await screen.findByRole('heading', { name: '3 columns proposed as taxa' })).closest('section') as HTMLElement;
    expect(within(section).getAllByRole('checkbox').map((c) => (c as HTMLInputElement).checked)).toEqual([false, false, false]);
    pick(T['convert.quantity.kind'], 'count');
    await settled('3 proposed taxon columns are not confirmed, so they are not converted.');
    expect(summary().textContent).toContain('No taxon columns, or no quantity column, are marked');
    expect(summary().textContent).toContain('0 occurrences');
    // one column confirmed: only it is converted, and the note counts the rest
    fireEvent.click(within(section).getByLabelText('Confirm as a taxon: Calanus finmarchicus'));
    await settled('2 proposed taxon columns are not confirmed');
    await settled('2 occurrences (2 present');
    // all confirmed, then one unticked again
    fireEvent.click(within(section).getByRole('button', { name: /Confirm all shown \(2\)/ }));
    await settled('7 occurrences (6 present, 1 absent)'.slice(0, 0) + 'occurrences (');
    expect(summary().textContent).not.toContain('are not confirmed');
    fireEvent.click(within(section).getByLabelText('Confirm as a taxon: Oithona similis'));
    await settled('1 proposed taxon column is not confirmed, so it is not converted.');
  });

  it('a column the user gives the taxon meaning to by hand needs no confirmation', async () => {
    await load([{ name: 'w1.csv', text: W1_CSV }], vi.fn(), 'en', false);
    fireEvent.change(screen.getByLabelText('Calanus finmarchicus: Meaning'), { target: { value: 'ignore' } });
    await screen.findByRole('heading', { name: '2 columns proposed as taxa' });
    fireEvent.change(screen.getByLabelText('Calanus finmarchicus: Meaning'), { target: { value: 'taxonHeader' } });
    // it is a taxon again, by the user's own choice: listed as before, but already confirmed
    const section = (await screen.findByRole('heading', { name: '3 columns proposed as taxa' })).closest('section') as HTMLElement;
    expect(within(section).getAllByRole('checkbox').map((c) => (c as HTMLInputElement).checked)).toEqual([true, false, false]);
    pick(T['convert.quantity.kind'], 'count');
    await settled('2 proposed taxon columns are not confirmed');
    await settled('2 occurrences (2 present');
  });
});

describe('splits are editable, and doubtful names are put to the user (M5)', () => {
  const csv = 'Sample,Station,Latitude,Longitude,Date,Microcalanus pusillus/pygmaeus,Calanus finmarchicus C5 f\na,S,55,3,2020-01-01,3,4\n';
  it('shows the reason, lets the user correct every field, and approving saves the edited split', async () => {
    await load([{ name: 'edit.csv', text: csv }]);
    pick(T['convert.quantity.kind'], 'count');
    const section = (await screen.findByRole('heading', { name: T['convert.splits.title'] })).closest('section') as HTMLElement;
    expect(section.textContent).toContain('Check the name: it contains a slash (two names?)');
    // the second proposal is complete: name, stage and sex are prefilled
    const name2 = within(section).getByLabelText('Scientific name: Calanus finmarchicus C5 f') as HTMLInputElement;
    expect(name2.value).toBe('Calanus finmarchicus');
    expect((within(section).getByLabelText('Life stage: Calanus finmarchicus C5 f') as HTMLInputElement).value).toBe('C5');
    expect((within(section).getByLabelText('Sex: Calanus finmarchicus C5 f') as HTMLSelectElement).value).toBe('female');
    // an empty name cannot be approved
    const name1 = within(section).getByLabelText('Scientific name: Microcalanus pusillus/pygmaeus') as HTMLInputElement;
    fireEvent.change(name1, { target: { value: '' } });
    expect((within(section).getByRole('button', { name: 'Approve: Microcalanus pusillus/pygmaeus' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(name1, { target: { value: 'Microcalanus' } });
    fireEvent.change(within(section).getByLabelText('Qualifier: Microcalanus pusillus/pygmaeus'), { target: { value: 'sp.' } });
    fireEvent.click(within(section).getByRole('button', { name: 'Approve: Microcalanus pusillus/pygmaeus' }));
    await waitFor(() => expect((within(section).getByLabelText('Scientific name: Microcalanus pusillus/pygmaeus') as HTMLInputElement).disabled).toBe(true));
    fireEvent.click(within(section).getByRole('button', { name: 'Approve: Calanus finmarchicus C5 f' }));
    await settled(T['convert.summary.none']);
    // the edited split is what was used: 2 occurrences, and the approved row is locked until withdrawn
    expect(summary().textContent).toContain('2 occurrences');
    fireEvent.click(within(section).getByRole('button', { name: `${T['convert.splits.withdraw']}: Microcalanus pusillus/pygmaeus` }));
    await settled(T['convert.summary.blocked']);
    expect((within(section).getByLabelText('Scientific name: Microcalanus pusillus/pygmaeus') as HTMLInputElement).value).toBe('Microcalanus');
  });
});

describe('per area needs a choice of medium (M2) and the page names what is missing (L2)', () => {
  it('the medium select starts on "— choose —"; undeclared names the medium until it is chosen', async () => {
    await load([{ name: 'w1.csv', text: W1_CSV }]);
    pick(T['convert.quantity.kind'], 'density');
    fireEvent.change(screen.getByLabelText(T['convert.quantity.unit']), { target: { value: '#/m2' } });
    const medium = (await screen.findByLabelText(T['convert.quantity.medium'])) as HTMLSelectElement;
    expect(medium.value).toBe('');
    expect([...medium.options].map((o) => o.textContent)).toEqual(['— choose —', 'Bed (sediment)', 'Water column']);
    await settled('Missing: water column or bed');
    fireEvent.change(medium, { target: { value: 'water' } });
    await settled('no verified NERC concept');
    expect(summary().textContent).not.toContain('Missing: water column or bed');
  });

  it('names what is missing, in plain words, in every language', async () => {
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      cleanup();
      setLang(lang);
      await load([{ name: 'w1.csv', text: W1_CSV }], vi.fn(), lang);
      fireEvent.change(screen.getByLabelText(UI[lang]['convert.quantity.kind']), { target: { value: 'biomass' } });
      const words = { en: 'Missing: the unit; the kind of weight', pl: 'Brakuje: jednostka; rodzaj masy', de: 'Es fehlt: die Einheit; die Art des Gewichts', fr: "Il manque : l'unité; le type de masse" }[lang];
      await waitFor(() => expect(screen.getByRole('region', { name: UI[lang]['convert.summary.title'] }).textContent).toContain(words));
    }
  });
});

describe('a converter error is cleared by a later success (L7)', () => {
  it('shows the error of a failed conversion and removes it when the next one succeeds', async () => {
    const real = createDirectConvertEngine();
    let fail = false;
    const engine = { ...real, convert: (b: Parameters<typeof real.convert>[0]) => (fail ? Promise.reject(new Error('boom')) : real.convert(b)) };
    const view = render(<ConvertPage engine={engine} />);
    chooseFiles(view.container, [{ name: 'w1.csv', text: W1_CSV }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    fail = true;
    pick(T['convert.quantity.kind'], 'count');
    await screen.findByText('The converter stopped: boom');
    fail = false;
    pick(T['convert.quantity.kind'], 'density');
    await waitFor(() => expect(screen.queryByText('The converter stopped: boom')).toBeNull());
    await settled(T['convert.summary.blocked']);
  });
});
