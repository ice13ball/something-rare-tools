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
    expect(text).toContain('"Date of sampling" (date: 2020-05-01 | 2020-05-02)');
    expect(text).toContain('"Latitude_dd" (latitude: 54.1 | 54.2)');
    expect(text).toContain('"Abundance (ind)" (quantity: 4 | 2 | 9)');
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

  it('a column answered by hand after the tick leaves the list and the tick stays; ticked columns that return to their proposal do not reopen it', async () => {
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
    // and back to the proposed role: listed again, the set is not larger than the one ticked
    pick('Date of sampling: Meaning', 'date');
    await idle();
    await waitFor(() => expect(group()!.textContent).toContain('"Date of sampling"'));
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
