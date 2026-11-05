// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Task 5, on the page: a sheet with no sample codes gets a picker for the columns that make a sample, with the converter's own count next to it; nothing is ticked or changed for the person;
// "Use this key" is the only thing that reaches the conversion; the key is said as an information line with "Ask again"; the companion file keeps it as hashes (no header text) and applies it only to
// the same columns and the same number of rows; the preview is the export. The code file stays as the second way. Every value is invented.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI } from '../../src/core/i18n/ui';
import { createConvertHandler, createDirectConvertEngine } from '../../src/worker/convert.handler';
import type { ConvertEngine, ExportBody } from '../../src/worker/convert.protocol';
import { objects, readBack } from '../convert/exportHelpers';
import { chooseFiles, csvOf } from './convertHelpers';

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const HEADER = ['Station', 'Cast', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'];
const TAXA = ['Calanus finmarchicus', 'Oithona similis', 'Pseudocalanus acuspes'];
/** Two stations, two casts each, three species in every cast: 12 rows, 4 samples. No sample code anywhere. */
function rows(extra: (string | number)[][] = []): (string | number)[][] {
  const out: (string | number)[][] = [];
  for (const [st, lat] of [['A', 70.1], ['B', 70.4]] as const) for (const cast of [1, 2]) TAXA.forEach((sp, i) => out.push([st, cast, st === 'A' ? '2021-08-01' : '2021-08-02', lat, 20.2, sp, 3 + i + cast]));
  return [...out, ...extra];
}

const summary = (): HTMLElement => screen.getByRole('region', { name: T['convert.summary.title'] });
const settled = async (text: string): Promise<void> => void (await waitFor(() => expect(summary().textContent).toContain(text)));
const pick = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const typeInto = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const item = (rule: string): HTMLElement | null => document.querySelector(`li[data-rule="${rule}"]`);
const picker = (): HTMLElement => screen.getByTestId('key-picker');
const tick = (name: string): void => void fireEvent.click(within(picker()).getByRole('checkbox', { name: new RegExp(`^${name}(\\(|$)`) }));
const ticked = (): string[] => within(picker()).queryAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked).map((c) => (c.closest('label')?.textContent ?? '').replace(/\(e\.g\..*$/, '').trim());
const useButton = (): HTMLButtonElement => within(picker()).getByRole('button', { name: T['convert.key.use'] }) as HTMLButtonElement;
const previewText = (): string => screen.queryByTestId('key-preview')?.textContent ?? '';
const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const bytesOf = (b: Blob): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(b);
  });

interface Run {
  download: ReturnType<typeof vi.fn>;
  downloadFile: ReturnType<typeof vi.fn>;
  engine: ConvertEngine;
}

async function load(text = csvOf(HEADER, rows()), extra: { name: string; text: string }[] = [], engine: ConvertEngine = createDirectConvertEngine(), fileName = 'hauls.csv'): Promise<Run> {
  const download = vi.fn();
  const downloadFile = vi.fn();
  const view = render(<ConvertPage engine={engine} download={download} downloadFile={downloadFile} />);
  chooseFiles(view.container, [{ name: fileName, text }, ...extra]);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  const confirm = screen.queryByRole('button', { name: /Confirm all shown/ });
  if (confirm !== null) fireEvent.click(confirm);
  pick(T['convert.quantity.kind'], 'count');
  await idle();
  return { download, downloadFile, engine };
}

function fillDescription(): void {
  typeInto(T['convert.meta.f.title'], 'Synthetic hauls (invented)');
  typeInto(T['convert.meta.f.abstract'], 'Invented values for a test.');
  typeInto(T['convert.meta.f.creators'], 'Ada Example');
  typeInto(T['convert.meta.f.contactName'], 'Ada Example');
  typeInto(T['convert.meta.f.contactEmail'], 'ada@example.org');
  typeInto(T['convert.meta.f.institution'], 'INVENTED');
  pick(T['convert.meta.f.licence'], 'CC-BY-4.0');
  pick(T['convert.meta.f.basis'], 'HumanObservation');
}
async function tickAll(): Promise<void> {
  await idle();
  await waitFor(() => expect(document.querySelector('.convert-accept')).toBeTruthy());
  for (const box of document.querySelectorAll<HTMLInputElement>('.convert-accept [data-rule-group] input[type="checkbox"]')) if (!box.checked) fireEvent.click(box);
}

describe('the picker of the sample key', () => {
  it('is offered first for a sheet with no sample code; nothing is ticked, proposed or changed for the person; the code file stays below as the second way', async () => {
    await load();
    await settled('The sample code is missing');
    const section = (await screen.findByRole('heading', { name: T['convert.codes.title'] })).closest('section') as HTMLElement;
    expect(within(section).getAllByRole('checkbox').length).toBeGreaterThanOrEqual(HEADER.length);
    expect(ticked()).toEqual([]);
    expect(useButton().disabled).toBe(true);
    expect(previewText()).toBe('');
    // the code file is below the picker, with its own button
    const propose = within(section).getByRole('button', { name: T['convert.codes.propose'] });
    expect(picker().compareDocumentPosition(propose) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.textContent).toContain(T['convert.codes.second']);
    // the role of the Cast column is the one it had, and it is still blocked
    expect((screen.getByLabelText('Cast: Meaning') as HTMLSelectElement).value).toBe('ignore');
    expect(item('CONV-KEY-PICKED')).toBeNull();
  });

  it('shows the converter\'s own count while the columns are ticked, and changes nothing until "Use this key"', async () => {
    await load();
    await settled('The sample code is missing');
    tick('Station');
    tick('Cast');
    await waitFor(() => expect(previewText()).toContain('4 samples of 12 rows'));
    expect(previewText()).toContain('3 to 3 rows in each (median 3)');
    expect(within(picker()).getByText(/Order in the code: Station \+ Cast/)).toBeTruthy();
    // the request still has no key: blocked, no information line, the role of the column unchanged
    expect(summary().textContent).toContain('The sample code is missing');
    expect(item('CONV-KEY-PICKED')).toBeNull();
    expect((screen.getByLabelText('Cast: Meaning') as HTMLSelectElement).value).toBe('ignore');
    // a different pick, a different count (the preview follows every change)
    tick('Cast');
    await waitFor(() => expect(previewText()).toContain('2 samples of 12 rows'));
    expect(previewText()).toContain('6 to 6 rows in each');
    tick('Cast');
    await waitFor(() => expect(previewText()).toContain('4 samples of 12 rows'));
    // use it
    fireEvent.click(useButton());
    await waitFor(() => expect(item('CONV-KEY-PICKED')).toBeTruthy());
    expect(summary().textContent).not.toContain('The sample code is missing');
    const said = item('CONV-KEY-PICKED')!;
    expect(said.textContent).toContain('a sample is identified by the columns: Station, Cast');
    expect(said.textContent).toContain('Samples: 4, rows in them: 12');
    expect(said.textContent).not.toContain('companion file');
    // the picker stays, with the key in use ticked, and the numbers are the ones of the request
    expect(ticked()).toEqual(['Station', 'Cast']);
    expect(previewText()).toContain('4 samples of 12 rows');
    // the table of roles is the person's and shows what they set: the key reads the column, it does not change its role there
    expect((screen.getByLabelText('Cast: Meaning') as HTMLSelectElement).value).toBe('ignore');
  });

  it('"Ask again" and "Clear the key" take it back at once; the block is back', async () => {
    await load();
    await settled('The sample code is missing');
    tick('Station');
    tick('Cast');
    await waitFor(() => expect(previewText()).toContain('4 samples'));
    fireEvent.click(useButton());
    await waitFor(() => expect(item('CONV-KEY-PICKED')).toBeTruthy());
    fireEvent.click(within(item('CONV-KEY-PICKED')!).getByRole('button', { name: T['convert.finding.askAgain'] }));
    await waitFor(() => expect(item('CONV-KEY-PICKED')).toBeNull());
    await settled('The sample code is missing');
    expect(ticked()).toEqual([]);
    // again, and now the button of the picker
    tick('Station');
    tick('Cast');
    await waitFor(() => expect(previewText()).toContain('4 samples'));
    fireEvent.click(useButton());
    await waitFor(() => expect(item('CONV-KEY-PICKED')).toBeTruthy());
    fireEvent.click(within(picker()).getByRole('button', { name: T['convert.key.clear'] }));
    await waitFor(() => expect(item('CONV-KEY-PICKED')).toBeNull());
    await settled('The sample code is missing');
  });

  it('says what an empty part and a key of every row make, before the key is used', async () => {
    const withBlank = rows([['A', '', '2021-08-01', 70.1, 20.2, TAXA[0], 9], ['', '', '', 70.1, 20.2, TAXA[1], 9]]);
    await load(csvOf(HEADER, withBlank));
    tick('Station');
    tick('Cast');
    await waitFor(() => expect(previewText()).toContain('5 samples'));
    expect(previewText()).toContain('1 row has an empty cell in one of these columns');
    expect(previewText()).toContain('1 row has nothing in any of these columns');
    tick('Species');
    await waitFor(() => expect(previewText()).toContain('Every row would be a sample of its own'));
  });

  it('the preview is the export: the numbers of the picker are the events and occurrences of the archive, and the IDs are the values joined', async () => {
    const real = createDirectConvertEngine();
    const bodies: ExportBody[] = [];
    const spy: ConvertEngine = { ...real, export: (b) => (bodies.push(b), real.export(b)) };
    const run = await load(csvOf(HEADER, rows()), [], spy);
    await settled('The sample code is missing');
    tick('Station');
    tick('Cast');
    await waitFor(() => expect(previewText()).toContain('4 samples of 12 rows'));
    fireEvent.click(useButton());
    await waitFor(() => expect(item('CONV-KEY-PICKED')).toBeTruthy());
    fillDescription();
    await tickAll();
    const exportButton = screen.getByRole('button', { name: T['convert.export.button'] });
    await waitFor(() => expect(exportButton.getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(exportButton);
    await waitFor(() => expect(run.downloadFile).toHaveBeenCalledTimes(1));
    expect(bodies[0].body.sheets[0].sampleKey).toEqual({ columns: [0, 1], prefix: 'hauls' });
    const [zip] = run.downloadFile.mock.calls[0] as [Blob];
    const back = await readBack(await bytesOf(zip));
    const events = objects(back.tables['event.txt']);
    const samples = events.filter((e) => e.eventType === 'sample');
    expect(samples.map((e) => e.eventID).sort()).toEqual(['hauls|A|1', 'hauls|A|2', 'hauls|B|1', 'hauls|B|2']);
    expect(back.tables['occurrence.txt'].rows).toHaveLength(12);
    expect(samples).toHaveLength(4);
  });

  it('no request carries a key until one is used', async () => {
    const real = createDirectConvertEngine();
    const bodies: ExportBody[] = [];
    const seen: ConvertEngine = { ...real, convert: (b) => (bodies.push({ body: b } as ExportBody), real.convert(b)) };
    await load(csvOf(HEADER, rows()), [], seen);
    await settled('The sample code is missing');
    expect(bodies.every((b) => b.body.sheets.every((s) => s.sampleKey === undefined))).toBe(true);
  });
});

describe('the preview while the page waits, and when it fails', () => {
  /** An engine whose previewKey answers when the test says so (and counts its questions). */
  function slow(real: ConvertEngine) {
    const calls: { columns: number[]; settle: (how: 'ok' | 'fail') => void }[] = [];
    const engine: ConvertEngine = {
      ...real,
      previewKey: (body, fileId, sheet, columns) =>
        new Promise((resolve, reject) => {
          calls.push({
            columns,
            settle: (how) => {
              if (how === 'fail') reject(new Error('worker went away'));
              else void real.previewKey(body, fileId, sheet, columns).then(resolve, reject);
            },
          });
        }),
    };
    return { engine, calls };
  }
  const asked = async (calls: unknown[], n: number): Promise<void> => void (await waitFor(() => expect(calls.length).toBe(n)));

  it('shows no numbers while a new count is pending, drops an older answer that comes late, and asks once for each change of the ticks', async () => {
    const { engine, calls } = slow(createDirectConvertEngine());
    await load(csvOf(HEADER, rows()), [], engine);
    await settled('The sample code is missing');
    tick('Station');
    await asked(calls, 1);
    expect(previewText()).toContain(T['convert.key.working']);
    tick('Cast');
    await asked(calls, 2);
    // the answer of the first question comes after the second was asked: it is dropped, the picker still waits
    calls[0].settle('ok');
    await new Promise((r) => setTimeout(r, 100));
    expect(previewText()).toContain(T['convert.key.working']);
    expect(previewText()).not.toContain('samples of');
    calls[1].settle('ok');
    await waitFor(() => expect(previewText()).toContain('4 samples of 12 rows'));
    // nothing else was asked meanwhile
    expect(calls).toHaveLength(2);
  });

  it('a failed count is said at the picker, with a button that counts again', async () => {
    const { engine, calls } = slow(createDirectConvertEngine());
    await load(csvOf(HEADER, rows()), [], engine);
    await settled('The sample code is missing');
    tick('Station');
    tick('Cast');
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const n = calls.length;
    calls[n - 1].settle('fail');
    await waitFor(() => expect(previewText()).toContain('The samples could not be counted: worker went away'));
    expect(previewText()).not.toContain(T['convert.key.working']);
    // the page itself is not in an error state
    expect(document.querySelector('.convert-error')).toBeNull();
    fireEvent.click(within(picker()).getByRole('button', { name: T['convert.key.retry'] }));
    await asked(calls, n + 1);
    calls[n].settle('ok');
    await waitFor(() => expect(previewText()).toContain('4 samples of 12 rows'));
  });

  it('after "Use this key" the numbers of the OLD key are not shown under the new one while the page counts', async () => {
    const real = createDirectConvertEngine();
    let hold: (() => void) | undefined;
    let holding = false;
    const engine: ConvertEngine = { ...real, convert: (b) => (holding ? new Promise((resolve, reject) => (hold = () => void real.convert(b).then(resolve, reject))) : real.convert(b)) };
    await load(csvOf(HEADER, rows()), [], engine);
    await settled('The sample code is missing');
    tick('Station');
    tick('Cast');
    await waitFor(() => expect(previewText()).toContain('4 samples of 12 rows'));
    fireEvent.click(useButton());
    await waitFor(() => expect(item('CONV-KEY-PICKED')).toBeTruthy());
    // another key: untick Cast, use it, with the main conversion held back
    tick('Cast');
    await waitFor(() => expect(previewText()).toContain('2 samples of 12 rows'));
    holding = true;
    fireEvent.click(useButton());
    await waitFor(() => expect(hold).toBeDefined());
    expect(previewText()).not.toContain('4 samples of 12 rows');
    expect(previewText()).toContain(T['convert.key.working']);
    hold!();
    await waitFor(() => expect(previewText()).toContain('2 samples of 12 rows'));
  });
});

describe('the companion file', () => {
  async function usedKey(): Promise<{ run: Run; companion: string }> {
    const run = await load();
    await settled('The sample code is missing');
    tick('Station');
    tick('Cast');
    await waitFor(() => expect(previewText()).toContain('4 samples'));
    fireEvent.click(useButton());
    await waitFor(() => expect(item('CONV-KEY-PICKED')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    await waitFor(() => expect(run.download).toHaveBeenCalledTimes(1));
    return { run, companion: run.download.mock.calls[0][0] as string };
  }

  it('keeps the key as hashes and the number of rows, never a header, and holds only for the same columns and the same number of rows', async () => {
    const { companion } = await usedKey();
    expect(companion).toMatch(/\(setting\),sampleKey=hauls\.csv:[0-9a-f]{8}\+[0-9a-f]{8}:12,/);
    expect(companion).not.toMatch(/Station|Cast|station|cast/);
    cleanup();
    // the same sheet with the file: the key holds, said as read from the companion file, with "Ask again"
    await load(csvOf(HEADER, rows()), [{ name: 'convert-companion.csv', text: companion }]);
    await waitFor(() => expect(item('CONV-KEY-PICKED')).toBeTruthy());
    expect(item('CONV-KEY-PICKED')!.textContent).toContain('read from the companion file');
    expect(ticked()).toEqual(['Station', 'Cast']);
    expect(summary().textContent).not.toContain('The sample code is missing');
    fireEvent.click(within(item('CONV-KEY-PICKED')!).getByRole('button', { name: T['convert.finding.askAgain'] }));
    await waitFor(() => expect(item('CONV-KEY-PICKED')).toBeNull());
    await settled('The sample code is missing');
    cleanup();
    // another file with a row more: the count it was given for is not the same, the question is open and nothing is ticked
    await load(csvOf(HEADER, rows([['B', 2, '2021-08-02', 70.4, 20.2, 'Metridia longa', 4]])), [{ name: 'convert-companion.csv', text: companion }]);
    await settled('The sample code is missing');
    expect(item('CONV-KEY-PICKED')).toBeNull();
    expect(ticked()).toEqual([]);
    cleanup();
    // a key column renamed: the question is open again
    await load(csvOf(HEADER.map((h) => (h === 'Cast' ? 'Haul' : h)), rows()), [{ name: 'convert-companion.csv', text: companion }]);
    await settled('The sample code is missing');
    expect(item('CONV-KEY-PICKED')).toBeNull();
    expect(ticked()).toEqual([]);
    cleanup();
    // case and spacing of a header do not matter, and an added column loses nothing
    await load(csvOf(['Note', 'STATION', 'cast', ...HEADER.slice(2)], rows().map((r) => ['x', ...r])), [{ name: 'convert-companion.csv', text: companion }]);
    await waitFor(() => expect(item('CONV-KEY-PICKED')).toBeTruthy());
    expect(ticked()).toEqual(['STATION', 'cast']);
  });

  it('the name in front of the IDs is shown, can be changed, is said in the key line, is kept in the companion file, and a RENAMED file with that file keeps the same IDs', async () => {
    const real = createDirectConvertEngine();
    const bodies: ExportBody[] = [];
    const spy: ConvertEngine = { ...real, export: (b) => (bodies.push(b), real.export(b)) };
    const run = await load(csvOf(HEADER, rows()), [], spy);
    await settled('The sample code is missing');
    const prefixBox = (): HTMLInputElement => within(picker()).getByLabelText(T['convert.key.prefix']) as HTMLInputElement;
    // the default is the file's name without its extension
    expect(prefixBox().value).toBe('hauls');
    tick('Station');
    tick('Cast');
    await waitFor(() => expect(previewText()).toContain('4 samples'));
    // an empty name cannot be used
    fireEvent.change(prefixBox(), { target: { value: '  ' } });
    expect(useButton().disabled).toBe(true);
    fireEvent.change(prefixBox(), { target: { value: 'Survey one' } });
    fireEvent.click(useButton());
    await waitFor(() => expect(item('CONV-KEY-PICKED')).toBeTruthy());
    expect(item('CONV-KEY-PICKED')!.textContent).toContain('starts with "Survey one"');
    expect(prefixBox().value).toBe('Survey one');
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    await waitFor(() => expect(run.download).toHaveBeenCalledTimes(1));
    const companion = run.download.mock.calls[0][0] as string;
    expect(companion).toMatch(/\(setting\),sampleKeyPrefix=hauls\.csv:[0-9a-f]{8}\+[0-9a-f]{8}:12:Survey one,/);
    expect(companion).not.toMatch(/Station|Cast/i);
    // the IDs of the archive
    fillDescription();
    await tickAll();
    const exportButton = screen.getByRole('button', { name: T['convert.export.button'] });
    await waitFor(() => expect(exportButton.getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(exportButton);
    await waitFor(() => expect(run.downloadFile).toHaveBeenCalledTimes(1));
    const ids = objects((await readBack(await bytesOf((run.downloadFile.mock.calls[0] as [Blob])[0]))).tables['event.txt']).filter((e) => e.eventType === 'sample').map((e) => e.eventID).sort();
    expect(ids).toEqual(['Survey one|A|1', 'Survey one|A|2', 'Survey one|B|1', 'Survey one|B|2']);
    cleanup();
    // the same rows in a file with another name, and the companion file: the key and the name come back, so the IDs are the same
    const real2 = createDirectConvertEngine();
    const bodies2: ExportBody[] = [];
    const spy2: ConvertEngine = { ...real2, export: (b) => (bodies2.push(b), real2.export(b)) };
    const run2 = await load(csvOf(HEADER, rows()), [{ name: 'convert-companion.csv', text: companion }], spy2, 'hauls_final_v2.csv');
    await waitFor(() => expect(item('CONV-KEY-PICKED')).toBeTruthy());
    expect(item('CONV-KEY-PICKED')!.textContent).toContain('read from the companion file');
    expect(item('CONV-KEY-PICKED')!.textContent).toContain('starts with "Survey one"');
    expect((within(picker()).getByLabelText(T['convert.key.prefix']) as HTMLInputElement).value).toBe('Survey one');
    fillDescription();
    await tickAll();
    const exportButton2 = screen.getByRole('button', { name: T['convert.export.button'] });
    await waitFor(() => expect(exportButton2.getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(exportButton2);
    await waitFor(() => expect(run2.downloadFile).toHaveBeenCalledTimes(1));
    const ids2 = objects((await readBack(await bytesOf((run2.downloadFile.mock.calls[0] as [Blob])[0]))).tables['event.txt']).filter((e) => e.eventType === 'sample').map((e) => e.eventID).sort();
    expect(ids2).toEqual(ids);
    expect(bodies.length + bodies2.length).toBe(2);
  });

  it('an old companion file (no key line) and a hostile key line change nothing', async () => {
    const old = 'original_column,output_column,unit,unit_source,p01\n(setting),fullList=yes,,,\n';
    await load(csvOf(HEADER, rows()), [{ name: 'convert-companion.csv', text: old }]);
    await settled('The sample code is missing');
    expect(ticked()).toEqual([]);
    cleanup();
    const hostile = 'original_column,output_column,unit,unit_source,p01\n(setting),sampleKey=hauls.csv:zzzz:12,,,\n(setting),sampleKey=hauls.csv:abcdef01+abcdef02:12,,,\n';
    await load(csvOf(HEADER, rows()), [{ name: 'convert-companion.csv', text: hostile }]);
    await settled('The sample code is missing');
    expect(ticked()).toEqual([]);
    expect(item('CONV-KEY-PICKED')).toBeNull();
  });

  it('a key that was taken back is not kept', async () => {
    const run = await load();
    await settled('The sample code is missing');
    tick('Station');
    tick('Cast');
    await waitFor(() => expect(previewText()).toContain('4 samples'));
    fireEvent.click(useButton());
    await waitFor(() => expect(item('CONV-KEY-PICKED')).toBeTruthy());
    fireEvent.click(within(item('CONV-KEY-PICKED')!).getByRole('button', { name: T['convert.finding.askAgain'] }));
    await waitFor(() => expect(item('CONV-KEY-PICKED')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    await waitFor(() => expect(run.download).toHaveBeenCalledTimes(1));
    expect(run.download.mock.calls[0][0] as string).not.toContain('sampleKey=');
  });
});

describe('the worker', () => {
  it('previewKey is the converter\'s own report: it equals the key report of the real run for the same request, and a key with no column of the sheet is null', async () => {
    const h = createConvertHandler();
    const parsed = h.handle({ type: 'parse', files: [{ name: 'hauls.csv', bytes: new TextEncoder().encode(csvOf(HEADER, rows())), source: 'dropped' }] } as never) as { files: { fileId: string; mappings: unknown[]; sheets: { name: string }[] }[] };
    const f = parsed.files[0];
    const mapping = f.mappings[0] as { columns: { index: number; role: { kind: string } }[] };
    const sheet = { fileId: f.fileId, sheet: f.sheets[0].name, mapping, shape: 'long', quantity: { kind: 'count' } };
    const body = { sheets: [sheet], options: {}, approvedSplits: {} } as never;
    const p = h.handle({ type: 'previewKey', body, fileId: f.fileId, sheet: sheet.sheet, columns: [0, 1] } as never);
    const run = h.handle({ type: 'convert', body: { sheets: [{ ...sheet, sampleKey: { columns: [0, 1] } }], options: {}, approvedSplits: {} } } as never) as { keys: unknown[] };
    expect(p).toEqual(run.keys[0]);
    expect(p).toMatchObject({ samples: 4, rows: 12 });
    // a column that is not one of the sheet: no key
    expect(h.handle({ type: 'previewKey', body, fileId: f.fileId, sheet: sheet.sheet, columns: [99] } as never)).toBeNull();
    expect(h.handle({ type: 'previewKey', body, fileId: f.fileId, sheet: 'nope', columns: [0] } as never)).toBeNull();
    // the page's word is checked: a key with non-numbers and duplicates is read as what is left of it
    const dirty = h.handle({ type: 'convert', body: { sheets: [{ ...sheet, sampleKey: { columns: [1.5, 'x', 0, 0, -1, 1, 99] } }], options: {}, approvedSplits: {} } } as never) as { keys: { samples: number }[] };
    expect(dirty.keys[0].samples).toBe(4);
    // a request with no key has no key report
    const none = h.handle({ type: 'convert', body: { sheets: [sheet], options: {}, approvedSplits: {} } } as never) as { keys: unknown[] };
    expect(none.keys).toEqual([]);
  });
});
