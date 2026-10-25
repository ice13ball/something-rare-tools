// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Stage 6 on the /convert page and in its worker: a sheet is marked as a profile / environment file by the user (the tool only suggests it), the level IDs of a sheet without a
// code column need the user's approval, the stations are matched exactly, the tree preview shows counts and a few examples, the companion file keeps the mark as a pre-tick,
// and GA4 says only that a profile was used. Synthetic data only.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { grantConsent } from '../../src/app/analytics';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI } from '../../src/core/i18n/ui';
import { openZip } from '../../src/core/parse/zip';
import { createConvertHandler, createDirectConvertEngine } from '../../src/worker/convert.handler';
import type { ConvertParseResult, ConvertView } from '../../src/worker/convert.protocol';
import { nodeInflate } from '../helpers/zipfile';
import { W1_CSV, chooseFiles, csvOf } from './convertHelpers';
import type { Cell } from '../convert/helpers';

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });
const win = window as unknown as { dataLayer: unknown[]; gtag?: unknown };

beforeEach(() => {
  localStorage.clear();
  document.cookie = 'ac_consent=; Path=/; Max-Age=0';
  win.dataLayer = [];
  delete win.gtag;
  document.head.querySelectorAll('script').forEach((s) => s.remove());
  initLang();
  setLang('en');
});
afterEach(cleanup);

const CTD_H = ['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]', 'Salinity [PSU]', 'Pressure [dbar]'];
const CTD_ROWS: Cell[][] = [
  ['CR1', 'S1', 55.51, 2.51, '2023-06-14', 0, 11.2, 34.1, 0.5],
  ['CR1', 'S1', 55.51, 2.51, '2023-06-14', 10, 10.9, 34.2, 10.4],
  ['CR1', 'S1', 55.51, 2.51, '2023-06-14', 25, 10.1, 34.4, 25.2],
  ['CR1', 'S9', 56.2, 3.4, '2023-06-17', 0, 12, 34, 0.6],
  ['CR1', 'S9', 56.2, 3.4, '2023-06-17', 10, 11.5, 34.1, 10.3],
];
const CTD_CSV = csvOf(CTD_H, CTD_ROWS);
const CTD_CODE_CSV = csvOf(['Cruise', 'Station', 'Bottle', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]'], [['CR1', 'S1', 'B1', 55.5, 2.5, '2023-06-14', 0, 11.2], ['CR1', 'S1', 'B2', 55.5, 2.5, '2023-06-14', 10, 10.9]]);

const sheetBox = (name: string): HTMLElement => screen.getByRole('region', { name: T['convert.sheet.title'].replace('{sheet}', name).replace('{file}', name) });
const treeText = (): string => screen.getByRole('region', { name: T['convert.tree.title'] }).textContent ?? '';
const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const typeInto = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const pick = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const bytesOf = (b: Blob): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(b);
  });

interface Loaded {
  download: ReturnType<typeof vi.fn>;
  downloadFile: ReturnType<typeof vi.fn>;
}

async function load(files: { name: string; text: string }[]): Promise<Loaded> {
  const download = vi.fn();
  const downloadFile = vi.fn();
  const view = render(<ConvertPage engine={createDirectConvertEngine()} download={download} downloadFile={downloadFile} />);
  chooseFiles(view.container, files);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  return { download, downloadFile };
}

/** The biology sheet's own decisions: confirm its taxa, count, the effort column, its splits. */
async function decideBiology(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /Confirm all shown/ }));
  const box = within(sheetBox('w1.csv'));
  fireEvent.change(box.getByLabelText(T['convert.quantity.kind']), { target: { value: 'count' } });
  fireEvent.change(box.getByLabelText(T['convert.effort.title']), { target: { value: 'column' } });
  fireEvent.click(await screen.findByRole('button', { name: /^Approve \d+ shown/ }));
}

describe('the mark is the user\'s, and the tool only suggests it', () => {
  it('a sheet that looks like a profile file gets a note with a button; nothing changes until the button is pressed', async () => {
    await load([{ name: 'w1.csv', text: W1_CSV }, { name: 'ctd.csv', text: CTD_CSV }]);
    const ctd = within(sheetBox('ctd.csv'));
    expect(ctd.getByText(T['convert.sheet.profile.suggest'])).toBeTruthy();
    const mark = ctd.getByLabelText(T['convert.sheet.profile']) as HTMLInputElement;
    expect(mark.checked).toBe(false);
    // the biology sheet is not suggested
    expect(within(sheetBox('w1.csv')).queryByText(T['convert.sheet.profile.suggest'])).toBeNull();
    // while unmarked the sheet is read as a biology sheet: it has the quantity and shape questions
    expect(ctd.getByLabelText(T['convert.quantity.kind'])).toBeTruthy();
    await idle();
    expect(treeText()).not.toMatch(/profile level events?/);
    expect(document.querySelector('.convert-nodes [data-level="level"]')).toBeNull();
    fireEvent.click(ctd.getByRole('button', { name: T['convert.sheet.profile.mark'] }));
    expect((ctd.getByLabelText(T['convert.sheet.profile']) as HTMLInputElement).checked).toBe(true);
    expect(ctd.queryByLabelText(T['convert.quantity.kind'])).toBeNull();
    expect(ctd.queryByText(T['convert.sheet.profile.suggest'])).toBeNull();
  });

  it('a pressure-only or any other sheet starts unmarked, and no sheet is marked by a companion file that does not name it', async () => {
    await load([{ name: 'w1.csv', text: W1_CSV }, { name: 'ctd.csv', text: CTD_CSV }]);
    for (const n of ['w1.csv', 'ctd.csv']) expect((within(sheetBox(n)).getByLabelText(T['convert.sheet.profile']) as HTMLInputElement).checked).toBe(false);
  });
});

describe('level IDs and the station match on the page', () => {
  it('without the approval the rows block in the profile text; with it the levels appear, the tree shows counts and examples, and the unmatched station is named', async () => {
    await load([{ name: 'w1.csv', text: W1_CSV }, { name: 'ctd.csv', text: CTD_CSV }]);
    await decideBiology();
    const ctd = within(sheetBox('ctd.csv'));
    fireEvent.click(ctd.getByRole('button', { name: T['convert.sheet.profile.mark'] }));
    // the approval box is offered (no code column), unticked, and the rows are blocked in the profile wording
    const approve = ctd.getByLabelText(T['convert.sheet.profile.depthIds']) as HTMLInputElement;
    expect(approve.checked).toBe(false);
    await waitFor(() => expect(document.body.textContent).toContain('no level code'));
    expect(document.body.textContent).not.toMatch(/ctd\.csv[^]{0,80}proposed codes/);
    fireEvent.click(approve);
    await waitFor(() => expect(treeText()).toContain('5 profile level events'));
    await idle();
    const tree = treeText();
    expect(tree).toContain('matching a station of the biology sheets: 1; matching none, so stations of their own: 1');
    expect(tree).toContain('No match for: CR1:S9');
    // a few examples only, labelled with the level type
    const levelLines = [...document.querySelectorAll('.convert-nodes [data-level="level"]')];
    expect(levelLines.length).toBeGreaterThan(0);
    expect(levelLines.length).toBeLessThanOrEqual(4);
    expect(levelLines[0].textContent).toContain('profile level');
    expect(levelLines[0].textContent).toContain('CR1:S1:0');
    // the warning for the unmatched station is among the ones to accept
    await waitFor(() => expect(document.querySelector('[data-rule-group="CONV-PROFILE-STATION-UNMATCHED"]')).toBeTruthy());
    expect(document.querySelector('[data-rule-group="CONV-PROFILE-STATION-UNMATCHED"]')!.textContent).toContain('CR1:S9');
  });

  it('with a code column mapped as the sample code the approval is not offered', async () => {
    await load([{ name: 'w1.csv', text: W1_CSV }, { name: 'ctd2.csv', text: CTD_CODE_CSV }]);
    const box = within(sheetBox('ctd2.csv'));
    fireEvent.change(screen.getByLabelText('Bottle: Meaning'), { target: { value: 'sampleId' } });
    fireEvent.click(box.getByLabelText(T['convert.sheet.profile']));
    expect(box.queryByLabelText(T['convert.sheet.profile.depthIds'])).toBeNull();
  });

  it('every new decision has its ⓘ, and none stands inside a label or a heading', async () => {
    await load([{ name: 'w1.csv', text: W1_CSV }, { name: 'ctd.csv', text: CTD_CSV }]);
    const ctd = within(sheetBox('ctd.csv'));
    expect(sheetBox('ctd.csv').querySelector('[data-tip="convertProfile"]')).toBeTruthy();
    fireEvent.click(ctd.getByRole('button', { name: T['convert.sheet.profile.mark'] }));
    for (const id of ['convertProfileDepthIds', 'convertProfileStations', 'convertProfilePressure']) expect(sheetBox('ctd.csv').querySelector(`[data-tip="${id}"]`), id).toBeTruthy();
    expect(document.querySelectorAll('h1 .infotip, h2 .infotip, h3 .infotip, h4 .infotip, label .infotip').length).toBe(0);
  });
});

describe('export, GA4 and the companion file', () => {
  async function exportProfile(files = [{ name: 'w1.csv', text: W1_CSV }, { name: 'ctd.csv', text: CTD_CSV }]): Promise<Loaded> {
    const l = await load(files);
    await decideBiology();
    const ctd = within(sheetBox('ctd.csv'));
    fireEvent.click(ctd.getByRole('button', { name: T['convert.sheet.profile.mark'] }));
    fireEvent.click(ctd.getByLabelText(T['convert.sheet.profile.depthIds']));
    pick(T['convert.device.label'], 'bongo');
    typeInto(T['convert.meta.f.title'], 'Synthetic counts (invented)');
    typeInto(T['convert.meta.f.abstract'], 'Invented values for a test.');
    typeInto(T['convert.meta.f.creators'], 'Ada Example');
    typeInto(T['convert.meta.f.contactName'], 'Ada Example');
    typeInto(T['convert.meta.f.contactEmail'], 'ada@example.org');
    typeInto(T['convert.meta.f.institution'], 'INVENTED');
    pick(T['convert.meta.f.licence'], 'CC-BY-4.0');
    pick(T['convert.meta.f.basis'], 'HumanObservation');
    await waitFor(() => expect(treeText()).toMatch(/profile level events?/));
    await idle();
    await waitFor(() => expect(document.querySelector('.convert-accept')).toBeTruthy());
    for (const box of document.querySelectorAll<HTMLInputElement>('.convert-accept [data-rule-group] input[type="checkbox"]')) if (!box.checked) fireEvent.click(box);
    const button = screen.getByRole('button', { name: T['convert.export.button'] }) as HTMLButtonElement;
    await waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('false'));
    fireEvent.click(button);
    await waitFor(() => expect(l.downloadFile).toHaveBeenCalledTimes(1));
    return l;
  }

  it('the archive holds the level events and their eMoF rows, and GA4 reports profile: used (a flag, nothing else about it)', async () => {
    grantConsent();
    win.dataLayer = [];
    const { downloadFile } = await exportProfile();
    const [blob] = downloadFile.mock.calls[0] as [Blob];
    const z = openZip(await bytesOf(blob));
    const text = async (n: string): Promise<string> => new TextDecoder().decode(await z.read(z.find(n)!, nodeInflate));
    const event = await text('event.txt');
    expect(event).toContain('CR1:S1:10\tCR1:S1\tprofile level\t');
    expect(event).toContain('CR1:S9:0\tCR1:S9\tprofile level\t');
    expect(event).toContain('CR1:S9\tCR1\tstation\t');
    const emof = await text('extendedmeasurementorfact.txt');
    expect(emof).toContain('CR1:S1:10\t\tPressure (spatial coordinate) exerted by the water body by profiling pressure sensor and correction to read zero at sea level\thttp://vocab.nerc.ac.uk/collection/P01/current/PRESPR01/\t10.4\t\tdbar\thttp://vocab.nerc.ac.uk/collection/P06/current/UPDB/');
    expect(emof).toContain('CR1:S1:10\t\ttemperature\t\t10.9\t\t°C\t');
    const sent = win.dataLayer.map((e) => Array.from(e as ArrayLike<unknown>)).filter((e) => e[0] === 'event' && e[1] === 'convert_exported');
    expect(sent).toHaveLength(1);
    expect((sent[0][2] as Record<string, unknown>).profile).toBe('used');
    expect((sent[0][2] as Record<string, unknown>).shape).toBe('wide');
    expect(JSON.stringify(win.dataLayer)).not.toMatch(/ctd\.csv|S9|CR1|temperature|Pressure/);
  });

  it('without a profile sheet GA4 still says profile: none', async () => {
    grantConsent();
    win.dataLayer = [];
    await load([{ name: 'w1.csv', text: W1_CSV }]);
    await decideBiology();
    pick(T['convert.device.label'], 'bongo');
    typeInto(T['convert.meta.f.title'], 'Synthetic counts (invented)');
    typeInto(T['convert.meta.f.abstract'], 'Invented values for a test.');
    typeInto(T['convert.meta.f.creators'], 'Ada Example');
    typeInto(T['convert.meta.f.contactName'], 'Ada Example');
    typeInto(T['convert.meta.f.contactEmail'], 'ada@example.org');
    typeInto(T['convert.meta.f.institution'], 'INVENTED');
    pick(T['convert.meta.f.licence'], 'CC-BY-4.0');
    pick(T['convert.meta.f.basis'], 'HumanObservation');
    await idle();
    await waitFor(() => expect(document.querySelector('.convert-accept')).toBeTruthy());
    for (const box of document.querySelectorAll<HTMLInputElement>('.convert-accept [data-rule-group] input[type="checkbox"]')) if (!box.checked) fireEvent.click(box);
    const button = screen.getByRole('button', { name: T['convert.export.button'] }) as HTMLButtonElement;
    await waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('false'));
    fireEvent.click(button);
    await waitFor(() => expect(win.dataLayer.some((e) => Array.from(e as ArrayLike<unknown>)[1] === 'convert_exported')).toBe(true));
    const sent = win.dataLayer.map((e) => Array.from(e as ArrayLike<unknown>)).filter((e) => e[1] === 'convert_exported');
    expect((sent[0][2] as Record<string, unknown>).profile).toBe('none');
  });

  it('the companion file keeps the mark and the approval by sheet name, and a new drop with it pre-ticks both and nothing is sent', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { download } = await load([{ name: 'w1.csv', text: W1_CSV }, { name: 'ctd.csv', text: CTD_CSV }]);
    await decideBiology();
    const ctd = within(sheetBox('ctd.csv'));
    fireEvent.click(ctd.getByRole('button', { name: T['convert.sheet.profile.mark'] }));
    fireEvent.click(ctd.getByLabelText(T['convert.sheet.profile.depthIds']));
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const [text] = download.mock.calls[0] as [string];
    expect(text).toContain('(setting),profile=ctd.csv,,,\n');
    expect(text).toContain('(setting),profileDepthIds=ctd.csv,,,\n');
    expect(text).not.toMatch(/CR1|S1|S9|Calanus|temperature/);
    cleanup();
    // a new drop with the companion: both boxes are ticked, and the conversion has its levels at once (the approval was the user's, for this sheet)
    await load([{ name: 'w1.csv', text: W1_CSV }, { name: 'ctd.csv', text: CTD_CSV }, { name: 'run.companion.csv', text }]);
    const again = within(sheetBox('ctd.csv'));
    expect((again.getByLabelText(T['convert.sheet.profile']) as HTMLInputElement).checked).toBe(true);
    expect((again.getByLabelText(T['convert.sheet.profile.depthIds']) as HTMLInputElement).checked).toBe(true);
    expect((within(sheetBox('w1.csv')).getByLabelText(T['convert.sheet.profile']) as HTMLInputElement).checked).toBe(false);
    await waitFor(() => expect(treeText()).toContain('5 profile level events'));
    // untick: the user may take the pre-tick back
    fireEvent.click(again.getByLabelText(T['convert.sheet.profile']));
    expect(again.queryByLabelText(T['convert.sheet.profile.depthIds'])).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('a companion file that names another sheet pre-ticks nothing', async () => {
    const text = 'original_column,output_column,unit,unit_source,p01\n(setting),profile=another.csv,,,\n(setting),profileDepthIds=another.csv,,,\n';
    await load([{ name: 'w1.csv', text: W1_CSV }, { name: 'ctd.csv', text: CTD_CSV }, { name: 'x.companion.csv', text }]);
    expect((within(sheetBox('ctd.csv')).getByLabelText(T['convert.sheet.profile']) as HTMLInputElement).checked).toBe(false);
  });
});

describe('the worker keeps the records: the page gets summaries', () => {
  const textOf = (s: string): Uint8Array => new TextEncoder().encode(s);

  it('a profile sheet of 50 000 rows answers with counts, a few example events and the stations that did not match, in a small message', async () => {
    const rows: Cell[][] = [];
    const bio: Cell[][] = [];
    for (let s = 1; s <= 50; s++) {
      bio.push(['CR1', `S${s}`, `S${s}-a`, '2023-06-14', 55 + s / 100, 2 + s / 100, 0, 50, 12, s]);
      for (let d = 1; d <= 1000; d++) rows.push(['CR1', `S${s}`, 55 + s / 100, 2 + s / 100, '2023-06-14', d, 10 + d / 1000, 34 + d / 5000]);
    }
    rows.push(['CR1', 'X1', 56, 3, '2023-06-15', 5, 10, 34]);
    const bioCsv = csvOf(['Cruise', 'Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Depth top [m]', 'Depth bottom [m]', 'Volume filtered [m3]', 'Calanus finmarchicus'], bio);
    const ctdCsv = csvOf(['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]', 'Salinity [PSU]'], rows);
    const h = createConvertHandler();
    const parsed = h.handle({ type: 'parse', files: [{ name: 'bio.csv', bytes: textOf(bioCsv), source: 'dropped' }, { name: 'ctd.csv', bytes: textOf(ctdCsv), source: 'dropped' }] }) as ConvertParseResult;
    expect(parsed.files.map((f) => f.suggestedProfiles[f.sheets[0].name])).toEqual([false, true]);
    expect(JSON.stringify(parsed).length).toBeLessThan(60_000); // the sheets' rows are not in the message: only the header, the counts and a few samples
    const [b, c] = parsed.files;
    const sheets = [
      { fileId: b.fileId, sheet: b.sheets[0].name, mapping: b.mappings[0], shape: 'wide' as const, quantity: { kind: 'count' as const, effort: { source: 'column' as const } } },
      { fileId: c.fileId, sheet: c.sheets[0].name, mapping: c.mappings[0], shape: 'wide' as const, profile: { depthIds: true } },
    ];
    const t0 = Date.now();
    const view = h.handle({ type: 'convert', body: { sheets, options: {}, approvedSplits: {} } }) as ConvertView;
    expect(Date.now() - t0).toBeLessThan(20_000);
    expect(view.tree.levels).toBe(50_001);
    expect(view.profile).toMatchObject({ sheets: 1, levels: 50_001, stationsMatched: 50, stationsUnmatched: 1, unmatched: ['CR1:X1'] });
    expect(view.examples.level.length).toBeLessThanOrEqual(4);
    expect(view.examples.station.length).toBeLessThanOrEqual(4);
    expect(JSON.stringify(view).length).toBeLessThan(30_000);
    // the request body is checked, not believed: anything but a boolean approval is no approval
    const noApproval = h.handle({ type: 'convert', body: { sheets: [sheets[0], { ...sheets[1], profile: { depthIds: 'yes' as never } }], options: {}, approvedSplits: {} } }) as ConvertView;
    expect(noApproval.tree.levels).toBe(0);
    expect(noApproval.findings.some((f) => f.ruleId === 'CONV-SAMPLE-CODE-MISSING' && f.params.profile === 'yes')).toBe(true);
    // and the one-time code proposal is not offered for a profile sheet's missing codes
    expect(noApproval.codesMissing).toEqual([]);
  });
});
