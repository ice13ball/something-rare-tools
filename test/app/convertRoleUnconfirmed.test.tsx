// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// CONV-ROLE-UNCONFIRMED on the page: a taxon, quantity, date, latitude or longitude the file does not state is ticked once; the tick is the person's acknowledgement and nothing more (no role, not in the
// archive, not in the companion file); a column answered by hand after the tick does not reopen it. Every value is invented.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI } from '../../src/core/i18n/ui';
import { openZip } from '../../src/core/parse/zip';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { nodeInflate } from '../helpers/zipfile';
import { chooseFiles, csvOf } from './convertHelpers';

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });
beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const RULE = 'CONV-ROLE-UNCONFIRMED';
const CSV = csvOf(['Station', 'Sample', 'Date of sampling', 'Latitude_dd', 'Longitude_dd', 'Species', 'Abundance (ind)'], [
  ['A', 'A1', '2020-05-01', 54.1, 7.2, 'Solea solea', 4],
  ['A', 'A1', '2020-05-01', 54.1, 7.2, 'Gadus morhua', 2],
  ['B', 'B1', '2020-05-02', 54.2, 7.3, 'Solea solea', 9],
]);

const summary = (): HTMLElement => screen.getByRole('region', { name: T['convert.summary.title'] });
const settled = async (text: string): Promise<void> => void (await waitFor(() => expect(summary().textContent).toContain(text)));
const pick = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const typeInto = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const exportButton = (): HTMLButtonElement => screen.getByRole('button', { name: T['convert.export.button'] }) as HTMLButtonElement;
const off = (): boolean => exportButton().getAttribute('aria-disabled') === 'true';
const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const group = (): HTMLElement | null => document.querySelector(`[data-rule-group="${RULE}"]`);
const boxOf = (rule: string): HTMLInputElement => group()!.querySelector('input[type="checkbox"]') as HTMLInputElement;

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
/** Ticks every accept group except the one named. */
async function tickOthers(except?: string): Promise<void> {
  await idle();
  for (const box of document.querySelectorAll<HTMLInputElement>('.convert-accept [data-rule-group] input[type="checkbox"]')) {
    if (box.closest('[data-rule-group]')?.getAttribute('data-rule-group') === except) continue;
    if (!box.checked) fireEvent.click(box);
  }
}
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

async function load() {
  const download = vi.fn();
  const downloadFile = vi.fn();
  const view = render(<ConvertPage engine={createDirectConvertEngine()} download={download} downloadFile={downloadFile} />);
  chooseFiles(view.container, [{ name: 'catch.csv', text: CSV }]);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  const confirmAll = screen.queryByRole('button', { name: /Confirm all shown/ });
  if (confirmAll !== null) fireEvent.click(confirmAll);
  pick(T['convert.quantity.kind'], 'count');
  await settled('occurrences');
  return { download, downloadFile };
}

describe('the page asks once', () => {
  it('lists the columns with their proposed role and cells, keeps the export off until it is ticked, and the tick changes no role and nothing else', async () => {
    const run = await load();
    fillDescription();
    await waitFor(() => expect(group()).toBeTruthy());
    const text = group()!.textContent!;
    expect(text).toContain('"Date of sampling" (Date: 2020-05-01 | 2020-05-02)');
    expect(text).toContain('"Latitude_dd" (Latitude: 54.1 | 54.2)');
    expect(text).toContain('"Abundance (ind)" (Quantity: 4 | 2 | 9)');
    expect(text).not.toContain('"Species"');
    expect(text).toContain('Nothing was changed');
    await tickOthers(RULE);
    await settled('occurrences');
    expect(off()).toBe(true);
    fireEvent.click(boxOf(RULE));
    await waitFor(() => expect(off()).toBe(false));
    // the roles in the column table are as they were proposed
    expect((screen.getByLabelText('Date of sampling: Meaning') as HTMLSelectElement).value).toBe('date');
    expect((screen.getByLabelText('Abundance (ind): Meaning') as HTMLSelectElement).value).toBe('quantity');
    // the companion file: no word of it, no header of a listed column
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    await waitFor(() => expect(run.download).toHaveBeenCalledTimes(1));
    const companion = run.download.mock.calls[0][0] as string;
    expect(companion).not.toMatch(/ROLE|unconfirmed|confirm|Date of sampling|Latitude_dd|Abundance|accept/i);
    // the archive: no word of it either, and the data are those of the proposed roles
    fireEvent.click(exportButton());
    await waitFor(() => expect(run.downloadFile).toHaveBeenCalledTimes(1));
    const [zip] = run.downloadFile.mock.calls[0] as [Blob, string];
    const archive = openZip(await bytesOf(zip));
    const all = (await Promise.all(archive.entries.map(async (e) => new TextDecoder().decode(await archive.read(e, nodeInflate))))).join('\n');
    expect(all).not.toMatch(/confirm|unconfirmed|acknowledg|ROLE-UNCONFIRMED/i);
    expect(all).toContain('Solea solea');
    expect(all).toContain('54.1');
    void textOf;
  });

  it('a column answered by hand after the tick leaves the list and the tick stays; given back its proposed role it is still the person\'s and is not listed again', async () => {
    await load();
    fillDescription();
    await waitFor(() => expect(group()).toBeTruthy());
    await tickOthers();
    await waitFor(() => expect(off()).toBe(false));
    expect(boxOf(RULE).checked).toBe(true);
    // the person sets "Date of sampling" to something else: it is theirs now, not listed, and the tick stands
    pick('Date of sampling: Meaning', 'ignore');
    await idle();
    await waitFor(() => expect(group()!.textContent).not.toContain('"Date of sampling"'));
    expect(group()!.textContent).toContain('"Latitude_dd"');
    expect(boxOf(RULE).checked).toBe(true);
    expect(off()).toBe(false);
    // and back to the proposed role: the person touched it, so it is theirs and stays out; the tick stands
    pick('Date of sampling: Meaning', 'date');
    await idle();
    expect((screen.getByLabelText('Date of sampling: Meaning') as HTMLSelectElement).value).toBe('date');
    expect(group()!.textContent).not.toContain('"Date of sampling"');
    expect(boxOf(RULE).checked).toBe(true);
    expect(off()).toBe(false);
  });

  it('every column answered by hand: nothing is asked and the group is gone', async () => {
    await load();
    fillDescription();
    await waitFor(() => expect(group()).toBeTruthy());
    pick('Date of sampling: Meaning', 'ignore');
    pick('Latitude_dd: Meaning', 'ignore');
    pick('Longitude_dd: Meaning', 'ignore');
    pick('Abundance (ind): Meaning', 'ignore');
    await idle();
    await waitFor(() => expect(group()).toBeNull());
  });
});

describe('the tick and the set of columns', () => {
  const OTHER = csvOf(['Station', 'Sample', 'Date of sampling', 'Latitude_dd', 'Longitude_dd', 'Species', 'Abundance (ind)'], [
    ['C', 'C1', '2021-05-01', 55.1, 8.2, 'Solea solea', 3],
    ['C', 'C1', '2021-05-01', 55.1, 8.2, 'Gadus morhua', 1],
    ['D', 'D1', '2021-05-02', 55.2, 8.3, 'Solea solea', 6],
  ]);

  it('a list that GROWS reopens the tick: a sheet switched on after the tick brings its columns', async () => {
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'catch.csv', text: CSV }, { name: 'other.csv', text: OTHER }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    await idle();
    await waitFor(() => expect(group()).toBeTruthy());
    const useBoxes = screen.getAllByLabelText(T['convert.sheet.use']) as HTMLInputElement[];
    expect(useBoxes).toHaveLength(2);
    // the second sheet is left out; the list holds the first sheet's columns; the person ticks it
    fireEvent.click(useBoxes[1]);
    await idle();
    await waitFor(() => expect(group()!.textContent).not.toContain('2021'));
    fireEvent.click(boxOf(RULE));
    expect(boxOf(RULE).checked).toBe(true);
    // the second sheet is switched on: four more columns on the list, which the tick was not given for
    fireEvent.click((screen.getAllByLabelText(T['convert.sheet.use']) as HTMLInputElement[])[1]);
    await idle();
    await waitFor(() => expect(group()!.textContent).toContain('2021-05-01'));
    expect(boxOf(RULE).checked).toBe(false);
    // and switched off again: the list is back to what was ticked, and the tick holds
    fireEvent.click((screen.getAllByLabelText(T['convert.sheet.use']) as HTMLInputElement[])[1]);
    await idle();
    await waitFor(() => expect(group()!.textContent).not.toContain('2021'));
    expect(boxOf(RULE).checked).toBe(true);
  });

  it('reading a sheet again (the long layout read as a table) clears the tick, whatever the new columns are', async () => {
    const H = ['Station', 'Bottle', 'Date of sampling', 'Latitude_dd', 'Longitude_dd', 'Depth_m', 'Parameter', 'Unit', 'Value'];
    const rows: (string | number)[][] = [
      ['ZL1', 'B1', '2020-05-01', 70.1, 20.2, 5, 'Temperature', 'degC', 4.1],
      ['ZL1', 'B1', '2020-05-01', 70.1, 20.2, 5, 'Salinity', 'PSU', 34.1],
      ['ZL2', 'B2', '2020-05-02', 70.3, 20.4, 5, 'Temperature', 'degC', 4.4],
      ['ZL2', 'B2', '2020-05-02', 70.3, 20.4, 5, 'Salinity', 'PSU', 34.2],
    ];
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'piv.csv', text: csvOf(H, rows) }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    await idle();
    await waitFor(() => expect(group()).toBeTruthy());
    fireEvent.click(boxOf(RULE));
    expect(boxOf(RULE).checked).toBe(true);
    fireEvent.click(screen.getByLabelText(T['convert.pivot.off']));
    await waitFor(() => expect(screen.getByLabelText('Parameter: Meaning')).toBeTruthy());
    await idle();
    // read as a table the sheet is the block of the long layout; read again as the pivot, the same list is back and nobody has ticked it
    fireEvent.click(screen.getByLabelText(T['convert.pivot.off']));
    await waitFor(() => expect(screen.getByLabelText('Temperature [degC]: Meaning')).toBeTruthy());
    await idle();
    await waitFor(() => expect(group()).toBeTruthy());
    expect(boxOf(RULE).checked).toBe(false);
  });
});
