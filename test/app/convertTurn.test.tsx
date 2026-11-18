// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// "The samples are the columns" on the /convert page: the third answer on the transposed message and the action of the sheet form, the declaration (name column, columns that are not samples),
// the turned sheet's roles, "(column C)" on a finding about a turned cell, the companion file and a sheet of another shape. Every value is invented.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { ownRecordsAllowed } from '../../src/app/convertModel';
import { RESULTS_CSV, SAMPLES_CSV } from '../convert/joinFixtures';
import type { ConvertEngine } from '../../src/worker/convert.protocol';
import { chooseFiles, csvOf } from './convertHelpers';

const item = (rule: string): HTMLElement | null => document.querySelector(`li[data-rule="${rule}"]`);

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const HEADER = ['Taxon', 'S1', 'S2', 'Total'];
const TAXA = csvOf(HEADER, [['Calanus finmarchicus', 10, 4, 14], ['Oithona similis', 5, 8, 13], ['Pseudocalanus sp.', 3, 0, 3]]);
const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const sheetBox = (name: string): HTMLElement => screen.getByRole('region', { name: T['convert.sheet.title'].replace('{sheet}', name).replace('{file}', name) });

async function load(files: { name: string; text: string }[], U: Record<string, string> = T) {
  const download = vi.fn();
  const view = render(<ConvertPage engine={createDirectConvertEngine()} download={download} downloadFile={vi.fn()} />);
  chooseFiles(view.container, files);
  fireEvent.click(screen.getByRole('button', { name: U['convert.read'] }));
  await screen.findByRole('heading', { name: U['convert.columns.title'] });
  await idle();
  return { download };
}

/** Declares the turn in the sheet's form: the name column by its header, the not-samples by theirs. */
async function turn(sheet: string, name: string, notSamples: string[] = [], headerDates = false) {
  const box = sheetBox(sheet);
  const select = box.querySelector('select[data-turn-name]') as HTMLSelectElement;
  const option = [...select.options].find((o) => o.textContent?.startsWith(`${name} `));
  fireEvent.change(select, { target: { value: option?.value } });
  for (const n of notSamples) fireEvent.click(within(box).getByLabelText(new RegExp(`^${n} \\(column`)));
  if (headerDates) fireEvent.click(within(box).getByLabelText(T['convert.turn.headerDates']));
  fireEvent.click(within(box).getByTestId('turn-apply'));
  await within(sheetBox(sheet)).findByTestId('turn-done');
  await idle();
}

describe('the declaration', () => {
  it('starts with no column chosen: the apply button waits for the person', async () => {
    await load([{ name: 'Taxa.csv', text: TAXA }]);
    const box = sheetBox('Taxa.csv');
    expect((box.querySelector('select[data-turn-name]') as HTMLSelectElement).value).toBe('');
    expect((within(box).getByTestId('turn-apply') as HTMLButtonElement).disabled).toBe(true);
    expect(within(box).queryByLabelText(T['convert.turn.notSamples'])).toBeNull();
  });

  it('is the third answer on the transposed message: it opens the sheet declaration; the turned roles are shown and the message goes', async () => {
    await load([{ name: 'Taxa.csv', text: TAXA }]);
    expect(screen.getAllByText(/species in rows, samples in columns/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('turn-open'));
    const select = sheetBox('Taxa.csv').querySelector('select[data-turn-name]') as HTMLSelectElement;
    expect(select.closest('details')?.open).toBe(true);
    await turn('Taxa.csv', 'Taxon', ['Total']);
    expect(screen.getByLabelText('Sample: Meaning')).toBeTruthy();
    expect(screen.getByLabelText('Calanus finmarchicus: Meaning')).toBeTruthy();
    expect(screen.queryByLabelText('Total: Meaning')).toBeNull();
    expect(screen.queryAllByText(/species in rows, samples in columns/)).toHaveLength(0);
    expect(within(sheetBox('Taxa.csv')).getByTestId('turn-done').textContent).toContain('Total (column D)');
  });

  it('undo gives back the columns of the file', async () => {
    await load([{ name: 'Taxa.csv', text: TAXA }]);
    await turn('Taxa.csv', 'Taxon', ['Total']);
    fireEvent.click(within(sheetBox('Taxa.csv')).getByTestId('turn-undo'));
    await waitFor(() => expect(screen.queryByLabelText('Total: Meaning')).not.toBeNull());
    expect(screen.queryByLabelText('Sample: Meaning')).toBeNull();
  });

  it('is offered on a sheet nothing flagged as transposed (the first column header is Family): the form action turns it', async () => {
    const csv = csvOf(['Family', 'S1', 'S2'], [['Calanidae', 3, 1], ['Oithonidae', 2, 6]]);
    await load([{ name: 'Fam.csv', text: csv }]);
    expect(screen.queryByTestId('turn-open')).toBeNull();
    await turn('Fam.csv', 'Family');
    expect(screen.getByLabelText('Calanidae: Meaning')).toBeTruthy();
  });
});

const SUFFIX = (): string => [...document.querySelectorAll('.convert-findings li')].map((l) => `${l.getAttribute('data-rule')}: ${l.textContent}`).join('\n');

describe('a finding about a turned cell', () => {
  it('names the source column of the sample: "(column C)" for one, "(columns B, C)" for several', async () => {
    const one = csvOf(['Taxon', '2023-04-05', 'not a date', 'Total'], [['Calanus finmarchicus', 10, 4, 14], ['Oithona similis', 5, 8, 13], ['Pseudocalanus sp.', 3, 0, 3]]);
    await load([{ name: 'Taxa.csv', text: one }]);
    await turn('Taxa.csv', 'Taxon', ['Total'], true);
    expect(item('ROW-DATE-UNPARSEABLE')?.textContent).toMatch(/\(column C\)$/);
    cleanup();
    // no date in the header: both samples have none
    await load([{ name: 'Taxa.csv', text: TAXA }]);
    await turn('Taxa.csv', 'Taxon', ['Total']);
    expect(item('CONV-EVENT-DATE-MISSING')?.textContent).toMatch(/\(columns B, C\)$/);
    expect(SUFFIX()).not.toContain('(column D)');
  });
});

describe('the companion file', () => {
  it('keeps the turn as hashes and a row count (no header text); a reload turns the same sheet again, said to come from the file; a third taxon row does not', async () => {
    const run = await load([{ name: 'Taxa.csv', text: TAXA }]);
    await turn('Taxa.csv', 'Taxon', ['Total'], true);
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const text = run.download.mock.calls[0][0] as string;
    expect(text).toMatch(/turned=Taxa\.csv:[0-9a-f]{8}:3:[0-9a-f]{8}:dates/);
    expect(text).not.toContain('Taxon');
    cleanup();
    await load([{ name: 'Taxa.csv', text: TAXA }, { name: 'c.csv', text }]);
    expect(screen.getByLabelText('Calanus finmarchicus: Meaning')).toBeTruthy();
    expect(within(sheetBox('Taxa.csv')).getByTestId('turn-done').textContent).toContain(T['convert.turn.fromFile'].trim());
    expect(screen.getByLabelText('Date: Meaning')).toBeTruthy();
    // the person undoes it: nothing of the file is left on the sheet
    fireEvent.click(within(sheetBox('Taxa.csv')).getByTestId('turn-undo'));
    await waitFor(() => expect(screen.queryByLabelText('Total: Meaning')).not.toBeNull());
    cleanup();
    // another sheet of the same name (a fourth taxon): the answer was given for another sheet
    const more = TAXA + 'Acartia sp.,1,2,3\n';
    await load([{ name: 'Taxa.csv', text: more }, { name: 'c.csv', text }]);
    expect(screen.queryByTestId('turn-done')).toBeNull();
    expect(screen.queryByLabelText('Total: Meaning')).not.toBeNull();
  });
});

describe('own records', () => {
  it('the tick is never offered on a turned sheet', () => {
    const m = { sheet: 's', columns: [{ index: 0, header: 'Taxon', role: { kind: 'taxon' } }] } as never;
    expect(ownRecordsAllowed({}, m, { shape: 'long', profile: false })).toBe(true);
    expect(ownRecordsAllowed({ turned: { s: { nameColumn: 0, notSamples: [] } } }, m, { shape: 'long', profile: false })).toBe(false);
  });
});

describe('turned rows that cannot become columns', () => {
  const REPEATED = csvOf(HEADER, [['Calanus finmarchicus', 10, 4, 14], ['Oithona similis', 5, 8, 13], ['calanus finmarchicus', 1, 1, 2]]);
  const BLANK = csvOf(HEADER, [['Calanus finmarchicus', 10, 4, 14], ['', 5, 8, 13], ['Oithona similis', 1, 1, 2]]);

  it('a repeated row name is asked about in words that say so, and leaving the rows out is listed with their lines', async () => {
    await load([{ name: 'Taxa.csv', text: REPEATED }]);
    await turn('Taxa.csv', 'Taxon', ['Total']);
    await waitFor(() => expect(item('CONV-ROW-NOT-UNDERSTOOD')).not.toBeNull());
    const ask = item('CONV-ROW-NOT-UNDERSTOOD')!.textContent ?? '';
    expect(ask).toMatch(/name another row has/);
    expect(ask).not.toMatch(/not written/);
    fireEvent.click(within(item('CONV-ROW-NOT-UNDERSTOOD')!).getByTestId('leave-out'));
    await idle();
    await waitFor(() => expect(item('CONV-ROW-LEFT-OUT')).not.toBeNull());
    const left = item('CONV-ROW-LEFT-OUT')!.textContent ?? '';
    expect(left).toMatch(/name another row has/);
    expect(left).toMatch(/lines? 1, 3|lines? 1.3|lines? 2, 4/);
    expect(item('CONV-TURN-NAME-REPEATED')).toBeNull();
  });

  it('a row with values and no name is asked about in words that say so', async () => {
    await load([{ name: 'Taxa.csv', text: BLANK }]);
    await turn('Taxa.csv', 'Taxon', ['Total']);
    await waitFor(() => expect(item('CONV-ROW-NOT-UNDERSTOOD')).not.toBeNull());
    expect(item('CONV-ROW-NOT-UNDERSTOOD')!.textContent).toMatch(/no name/);
    expect(item('CONV-ROW-NOT-UNDERSTOOD')!.textContent).not.toMatch(/not written/);
  });
});

describe('the joins of a sheet whose declaration did not change it', () => {
  it('a declaration the engine refuses leaves a confirmed join in place', async () => {
    const base = createDirectConvertEngine();
    const engine: ConvertEngine = { ...base, turnChoice: () => Promise.reject(new Error('refused')) };
    const view = render(<ConvertPage engine={engine} download={vi.fn()} downloadFile={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'results.csv', text: RESULTS_CSV }, { name: 'samples.csv', text: SAMPLES_CSV }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    await idle();
    const proposal = await screen.findByTestId('join-proposal');
    fireEvent.click(within(proposal).getByRole('button', { name: T['convert.join.confirm'] }));
    await screen.findByTestId('join-confirmed');
    await idle();
    const box = sheetBox('samples.csv');
    const select = box.querySelector('select[data-turn-name]') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '0' } });
    fireEvent.click(within(box).getByTestId('turn-apply'));
    await screen.findByText(/refused/);
    await idle();
    expect(screen.queryByTestId('join-confirmed')).not.toBeNull();
    expect(screen.queryByTestId('join-proposal')).toBeNull();
  });
});

describe('own records and other languages', () => {
  const FIELDS = (rows: (string | number)[][]) => csvOf(['Field', 'S1', 'S2'], rows);
  it('the own-records tick is not on the page for a turned sheet, and is for the same columns unturned', async () => {
    const OWN = (): HTMLElement | null => screen.queryByLabelText(T['convert.sheet.ownRecords']);
    await load([{ name: 'Same.csv', text: csvOf(['Sample', 'Species', 'Count'], [['S1', 'Calanus finmarchicus', 4], ['S2', 'Oithona similis', 1]]) }]);
    fireEvent.click(screen.getAllByLabelText(T['convert.shape.long'])[0]);
    await idle();
    expect(OWN()).not.toBeNull();
    cleanup();
    await load([{ name: 'Turned.csv', text: FIELDS([['Species', 'Calanus finmarchicus', 'Oithona similis'], ['Count', 4, 1]]) }]);
    await turn('Turned.csv', 'Field');
    fireEvent.click(screen.getAllByLabelText(T['convert.shape.long'])[0]);
    await idle();
    expect(OWN()).toBeNull();
  });

  it('the declaration is in the reader\'s language', async () => {
    setLang('pl');
    const P = UI.pl;
    await load([{ name: 'Taxa.csv', text: TAXA }], P);
    const box = screen.getByRole('region', { name: P['convert.sheet.title'].replace('{sheet}', 'Taxa.csv').replace('{file}', 'Taxa.csv') });
    expect(within(box).getByText(P['convert.turn.open'])).toBeTruthy();
    expect(within(box).getByText(P['convert.turn.help'])).toBeTruthy();
    const select = box.querySelector('select[data-turn-name]') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '0' } });
    fireEvent.click(within(box).getByTestId('turn-apply'));
    await within(box).findByTestId('turn-done');
    expect(within(box).getByTestId('turn-done').textContent).toContain('Taxon (kolumna A)');
    expect(within(box).getByTestId('turn-undo').textContent).toBe(P['convert.turn.undo']);
  });
});
