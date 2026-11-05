// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Task 8, on the page: a row the converter cannot place blocks the export with its line and cells; every block has its answer on the page ("leave these rows out and list them", and "ask again");
// the list of rows not written is one download by one click, beside the export button and in the ledger; the export is one click and one download (the archive), and the list is never in it.
// Every value is invented.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI } from '../../src/core/i18n/ui';
import { openZip } from '../../src/core/parse/zip';
import { createConvertHandler, createDirectConvertEngine } from '../../src/worker/convert.handler';
import type { ConvertEngine, ExportBody } from '../../src/worker/convert.protocol';
import { W1_HEADER, W1_ROWS } from '../convert/helpers';
import { chooseFiles, csvOf } from './convertHelpers';

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

/** W1 with one row that has an extra field (a ragged line, line 5): the converter cannot place it. */
const RAGGED_CSV = csvOf(W1_HEADER, W1_ROWS) + 'CR1,S3,S3-a,2023-06-18,56.0,3.3,0,25,12.0,1,2,3,EXTRA-FIELD\n';

const summary = (): HTMLElement => screen.getByRole('region', { name: T['convert.summary.title'] });
const settled = async (text: string): Promise<void> => void (await waitFor(() => expect(summary().textContent).toContain(text)));
const pick = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const typeInto = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const exportButton = (): HTMLButtonElement => screen.getByRole('button', { name: T['convert.export.button'] }) as HTMLButtonElement;
const off = (): boolean => exportButton().getAttribute('aria-disabled') === 'true';
const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const textOf = (b: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });
const bytesOf = (b: Blob): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(b);
  });

function fillDescription(): void {
  typeInto(T['convert.meta.f.title'], 'Synthetic counts (invented)');
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

interface Run {
  download: ReturnType<typeof vi.fn>;
  downloadFile: ReturnType<typeof vi.fn>;
  engine: ConvertEngine;
}

async function load(text = RAGGED_CSV, extra: { name: string; text: string }[] = [], expectText = '7 occurrences', approve = true, engine: ConvertEngine = createDirectConvertEngine()): Promise<Run> {
  const download = vi.fn();
  const downloadFile = vi.fn();
  const view = render(<ConvertPage engine={engine} download={download} downloadFile={downloadFile} />);
  chooseFiles(view.container, [{ name: 'w1.csv', text }, ...extra]);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  fireEvent.click(screen.getByRole('button', { name: /Confirm all shown/ }));
  pick(T['convert.quantity.kind'], 'count');
  pick(T['convert.effort.title'], 'column');
  if (approve) fireEvent.click(await screen.findByRole('button', { name: /^Approve \d+ shown/ }));
  fireEvent.click(screen.getByLabelText(T['convert.fullList']));
  await settled(expectText);
  return { download, downloadFile, engine };
}

const item = (rule: string): HTMLElement | null => document.querySelector(`li[data-rule="${rule}"]`);
const leaveOutButton = (): HTMLElement | null => document.querySelector('[data-testid="leave-out"]');
const listButtons = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>('[data-testid="not-written-button"]')];

describe('a row the converter cannot place', () => {
  it('blocks the export, with its line and what the tool understood, and has its answer on the page', async () => {
    await load();
    fillDescription();
    await tickAll();
    await settled('7 occurrences');
    // everything else is in order, and the export is still off: the row waits for a decision
    const q = await waitFor(() => item('CONV-ROW-NOT-UNDERSTOOD')!);
    expect(q).toBeTruthy();
    expect(q.textContent).toContain('w1.csv');
    expect(q.textContent).toContain('1 row');
    expect(q.textContent).toContain('line 5');
    expect(q.textContent).toContain('more or fewer fields than the header');
    expect(q.textContent).toContain('nothing is deleted');
    expect(q.textContent).toContain('5: CR1 | S3 | S3-a | 2023-06-18 | 56.0 | 3.3 | 0 | 25 |');
    expect(leaveOutButton()).toBeTruthy();
    expect(off()).toBe(true);
    // the page never says to delete the row
    expect(q.textContent).not.toMatch(/delete (it|the row)|remove (it|the row)/i);
  });

  it('"leave these rows out and list them" lifts the block; "ask again" puts it back; the answers follow in the worker, which checks again', async () => {
    const run = await load();
    fillDescription();
    await tickAll();
    await waitFor(() => expect(leaveOutButton()).toBeTruthy());
    expect(off()).toBe(true);
    fireEvent.click(leaveOutButton()!);
    await waitFor(() => expect(item('CONV-ROW-LEFT-OUT')).toBeTruthy());
    expect(item('CONV-ROW-NOT-UNDERSTOOD')).toBeNull();
    expect(item('CONV-ROW-LEFT-OUT')!.textContent).toContain('As you chose');
    expect(item('CONV-ROW-LEFT-OUT')!.textContent).toContain('Nothing was deleted from your file');
    await tickAll();
    await waitFor(() => expect(off()).toBe(false));
    // take it back: the block, and the switched-off export, are back at once
    fireEvent.click(document.querySelector('[data-testid="ask-again"]')!);
    await waitFor(() => expect(item('CONV-ROW-NOT-UNDERSTOOD')).toBeTruthy());
    expect(item('CONV-ROW-LEFT-OUT')).toBeNull();
    await waitFor(() => expect(off()).toBe(true));
    // asking again downloads nothing by itself (the worker's own refusal is the next test)
    expect(run.downloadFile).not.toHaveBeenCalled();
    expect(run.download).not.toHaveBeenCalled();
  });

  it('the worker refuses the export while the question is open, whatever the page says, and writes it once answered', async () => {
    const real = createDirectConvertEngine();
    const bodies: ExportBody[] = [];
    const spy: ConvertEngine = { ...real, export: (b) => (bodies.push(b), real.export(b)) };
    const run = await load(RAGGED_CSV, [], '7 occurrences', true, spy);
    fillDescription();
    await tickAll();
    await waitFor(() => expect(leaveOutButton()).toBeTruthy());
    fireEvent.click(leaveOutButton()!);
    await waitFor(() => expect(item('CONV-ROW-LEFT-OUT')).toBeTruthy());
    await tickAll();
    await waitFor(() => expect(off()).toBe(false));
    fireEvent.click(exportButton());
    await waitFor(() => expect(run.downloadFile).toHaveBeenCalledTimes(1));
    expect(bodies).toHaveLength(1);
    const answered = bodies[0];
    expect(answered.body.sheets.some((s) => (s.leaveOut ?? []).length > 0)).toBe(true);
    // the same request with the answer taken out: the worker judges it again and writes nothing
    const unanswered: ExportBody = { ...answered, body: { ...answered.body, sheets: answered.body.sheets.map((s) => ({ ...s, leaveOut: [], leaveOutFile: [] })) } };
    await expect(real.export(unanswered)).rejects.toThrow(/Export refused.*CONV-ROW-NOT-UNDERSTOOD.*Nothing was written/);
    // with the answer it writes, and the archive holds no list of rows
    const ok = await real.export(answered);
    expect(ok.fileName).toMatch(/\.zip$/);
  });
});

describe('the list of rows not written', () => {
  it('is offered beside the export button and in the ledger with the same count, even while the export is blocked; one click is one download, never a second one by itself', async () => {
    const run = await load();
    await waitFor(() => expect(listButtons().length).toBe(2));
    for (const b of listButtons()) expect(b.textContent).toBe('Download the list: 2 rows not written (CSV)');
    // one beside the export button, one inside the ledger panel
    expect(listButtons().some((b) => b.closest('.convert-export') !== null)).toBe(true);
    expect(listButtons().some((b) => b.closest('.convert-ledger') !== null)).toBe(true);
    // loading and answering downloads nothing by itself
    expect(run.downloadFile).not.toHaveBeenCalled();
    expect(run.download).not.toHaveBeenCalled();
    fireEvent.click(listButtons()[0]);
    await waitFor(() => expect(run.downloadFile).toHaveBeenCalledTimes(1));
    const [blob, name] = run.downloadFile.mock.calls[0] as [Blob, string];
    expect(name).toBe('Synthetic_counts_invented_-not-written.csv'.replace('Synthetic_counts_invented_', name.replace(/-not-written\.csv$/, '')));
    expect(name).toMatch(/-not-written\.csv$/);
    expect(blob.type).toContain('text/csv');
    const text = await textOf(blob);
    expect(text.split('\n')[0]).toMatch(/^file,sheet,line,reason,status,detail,cell 1,/);
    const row = text.split('\n').find((l) => l.startsWith('w1.csv,w1.csv,5,'))!;
    expect(row).toContain('ragged,needs-decision');
    expect(row).toContain('EXTRA-FIELD');
    // the other line is the cell the converter understood and did not write (the NA), named with its whole row; the header line is in the list, and is not counted as a row
    expect(text.split('\n').find((l) => l.startsWith('w1.csv,w1.csv,4,'))).toContain('cells-not-written,understood,Calanus finmarchicus (na-cell)');
    // nothing else is downloaded behind the click
    await new Promise((r) => setTimeout(r, 200));
    expect(run.downloadFile).toHaveBeenCalledTimes(1);
    expect(run.download).not.toHaveBeenCalled();
  });

  it('the answer is in the list too (left-out), and the export, once allowed, is one click and one download: the archive, with no list inside it', async () => {
    const run = await load();
    fillDescription();
    await tickAll();
    await waitFor(() => expect(leaveOutButton()).toBeTruthy());
    fireEvent.click(leaveOutButton()!);
    await waitFor(() => expect(item('CONV-ROW-LEFT-OUT')).toBeTruthy());
    await tickAll();
    await waitFor(() => expect(off()).toBe(false));
    fireEvent.click(exportButton());
    await waitFor(() => expect(run.downloadFile).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 300));
    // one click on Export = one download, and it is the archive; the list did not follow it
    expect(run.downloadFile).toHaveBeenCalledTimes(1);
    const [zip, zipName] = run.downloadFile.mock.calls[0] as [Blob, string];
    expect(zipName).toMatch(/\.zip$/);
    const files = await openZip(await bytesOf(zip));
    expect(files.entries.length).toBeGreaterThan(0);
    expect(files.entries.map((e) => e.name).join(' ')).not.toMatch(/not-written/);
    // the list is a separate click, and says the row is left out
    fireEvent.click(listButtons()[0]);
    await waitFor(() => expect(run.downloadFile).toHaveBeenCalledTimes(2));
    const [csv, csvName] = run.downloadFile.mock.calls[1] as [Blob, string];
    expect(csvName).toMatch(/-not-written\.csv$/);
    expect(await textOf(csv)).toContain('ragged,left-out');
  });

  it('is not offered when every row is written', async () => {
    const clean = csvOf(['Sample', 'Date', 'Latitude', 'Longitude', 'Calanus finmarchicus'], [['a', '2020-06-01', 49.4, 0.2, 4]]);
    cleanup();
    await load(clean, [], '1 occurrence', false);
    expect(listButtons()).toHaveLength(0);
  });

  it('a failure to prepare the list is said, and the button works again', async () => {
    const run = await load();
    const broken: ConvertEngine = { ...run.engine, notWritten: () => Promise.reject(new Error('boom')) };
    cleanup();
    const view = render(<ConvertPage engine={broken} download={vi.fn()} downloadFile={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'w1.csv', text: RAGGED_CSV }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    fireEvent.click(screen.getByRole('button', { name: /Confirm all shown/ }));
    pick(T['convert.quantity.kind'], 'count');
    pick(T['convert.effort.title'], 'column');
    fireEvent.click(await screen.findByRole('button', { name: /^Approve \d+ shown/ }));
    await waitFor(() => expect(listButtons().length).toBe(2));
    fireEvent.click(listButtons()[0]);
    await waitFor(() => expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toContain('The list could not be prepared: boom'));
    expect(listButtons()[0].disabled).toBe(false);
  });
});

describe('the companion file keeps the answer with the numbers it holds for', () => {
  it('the file written after the answer holds only counts, and a file dropped with the same sheet gives the answer back (said so); another sheet reopens the question', async () => {
    const first = await load();
    fillDescription();
    await tickAll();
    await waitFor(() => expect(leaveOutButton()).toBeTruthy());
    fireEvent.click(leaveOutButton()!);
    await waitFor(() => expect(item('CONV-ROW-LEFT-OUT')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    await waitFor(() => expect(first.download).toHaveBeenCalledTimes(1));
    const companion = first.download.mock.calls[0][0] as string;
    expect(companion).toContain('(setting),leaveOut=ragged:1:4:w1.csv');
    expect(companion).not.toContain('EXTRA-FIELD');
    cleanup();
    // the same file again, with the companion file: the answer is read, said to come from the file, and the export is not blocked by the row
    await load(RAGGED_CSV, [{ name: 'convert-companion.csv', text: companion }]);
    await waitFor(() => expect(item('CONV-ROW-LEFT-OUT')).toBeTruthy());
    expect(item('CONV-ROW-LEFT-OUT')!.textContent).toContain('read from the companion file');
    expect(item('CONV-ROW-NOT-UNDERSTOOD')).toBeNull();
    cleanup();
    // another file with one more ragged row: the count is not the same, and the question is open again
    await load(RAGGED_CSV + 'CR1,S4,S4-a,2023-06-19,56.1,3.4,0,25,12.0,1,2,3,MORE\n', [{ name: 'convert-companion.csv', text: companion }]);
    await waitFor(() => expect(item('CONV-ROW-NOT-UNDERSTOOD')).toBeTruthy());
    expect(item('CONV-ROW-LEFT-OUT')).toBeNull();
    expect(within(item('CONV-ROW-NOT-UNDERSTOOD')!).getByRole('button').textContent).toContain('these rows');
  });
});
