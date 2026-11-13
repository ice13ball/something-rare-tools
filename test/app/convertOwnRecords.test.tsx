// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Round 3, Task 13, on the page: "each row is its own record" as a tick (only where core's ownRecordsEligible says so) and as a button on CONV-TAXON-NO-QUANTITY / CONV-ID-DUPLICATE; under it
// "keep identical rows as separate records" on CONV-ROW-COPIES; both answers in the companion file with the numbers they hold for. Every value is invented.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import type { ConvertEngine, ConvertRequestBody } from '../../src/worker/convert.protocol';
import { chooseFiles, csvOf } from './convertHelpers';

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const H = ['Sample', 'Date', 'Latitude', 'Longitude', 'Taxon', 'Length [mm]'];
const GM = 'Gadus morhua';
const PV = 'Pollachius virens';
const FISH = csvOf(H, [['T1', '2022-03-01', 60.1, 4.2, GM, 310], ['T1', '2022-03-01', 60.1, 4.2, GM, 295], ['T1', '2022-03-01', 60.1, 4.2, PV, 400]]);
const FISH4 = csvOf(H, [['T1', '2022-03-01', 60.1, 4.2, GM, 310], ['T1', '2022-03-01', 60.1, 4.2, GM, 295], ['T1', '2022-03-01', 60.1, 4.2, PV, 400], ['T2', '2022-03-02', 60.1, 4.2, PV, 380]]);
const COPIES = csvOf(H, [['T1', '2022-03-01', 60.1, 4.2, GM, 310], ['T1', '2022-03-01', 60.1, 4.2, GM, 310], ['T1', '2022-03-01', 60.1, 4.2, PV, 400]]);
const WITH_ID = csvOf(['occurrenceID', ...H], [['o1', 'T1', '2022-03-01', 60.1, 4.2, GM, 310], ['o2', 'T1', '2022-03-01', 60.1, 4.2, GM, 295]]);
const COUNTED = csvOf([...H, 'Count'], [['T1', '2022-03-01', 60.1, 4.2, GM, 310, 1], ['T1', '2022-03-01', 60.1, 4.2, GM, 295, 1]]);
const COUNTED_COPIES = csvOf([...H, 'Count'], [['T1', '2022-03-01', 60.1, 4.2, GM, 310, 5], ['T1', '2022-03-01', 60.1, 4.2, GM, 310, 5]]);
const WIDE = csvOf(['Sample', 'Date', 'Latitude', 'Longitude', GM], [['T1', '2022-03-01', 60.1, 4.2, 3], ['T1', '2022-03-01', 60.1, 4.2, 4]]);

interface Run {
  bodies: ConvertRequestBody[];
  download: ReturnType<typeof vi.fn>;
}

const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const item = (rule: string): HTMLElement | null => document.querySelector(`li[data-rule="${rule}"]`);
const last = (r: Run): ConvertRequestBody['sheets'][number] => r.bodies[r.bodies.length - 1].sheets[0];
const OWN = (): HTMLInputElement | null => screen.queryByLabelText(T['convert.sheet.ownRecords']) as HTMLInputElement | null;

async function load(files: { name: string; text: string }[], shape: 'long' | 'wide' = 'long'): Promise<Run> {
  const base = createDirectConvertEngine();
  const bodies: ConvertRequestBody[] = [];
  const engine: ConvertEngine = { ...base, convert: (b) => (bodies.push(b), base.convert(b)) };
  const download = vi.fn();
  const view = render(<ConvertPage engine={engine} download={download} downloadFile={vi.fn()} />);
  chooseFiles(view.container, files);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  const confirm = screen.queryByRole('button', { name: /Confirm all shown/ });
  if (confirm !== null) fireEvent.click(confirm);
  const radio = screen.queryAllByLabelText(T[`convert.shape.${shape}`]);
  if (radio.length > 0) fireEvent.click(radio[0]);
  await idle();
  return { bodies, download };
}

describe('the button and the tick', () => {
  it('CONV-TAXON-NO-QUANTITY offers the button; it sends ownRecords, CONV-OWN-RECORDS shows, the tick is ticked, and "Ask again" takes it back', async () => {
    const run = await load([{ name: 'Fish.csv', text: FISH }]);
    expect(last(run).ownRecords).toBeUndefined();
    expect(OWN()?.checked).toBe(false);
    const no = item('CONV-TAXON-NO-QUANTITY')!;
    fireEvent.click(within(no).getByRole('button', { name: T['convert.finding.ownRecords'] }));
    await waitFor(() => expect(last(run).ownRecords).toBe(true));
    expect(last(run).ownRecordsFromFile).toBeUndefined();
    await idle();
    await waitFor(() => expect(item('CONV-OWN-RECORDS')).not.toBeNull());
    expect(item('CONV-TAXON-NO-QUANTITY')).toBeNull();
    expect(OWN()?.checked).toBe(true);
    fireEvent.click(within(item('CONV-OWN-RECORDS')!).getByRole('button', { name: T['convert.finding.askAgain'] }));
    await waitFor(() => expect(last(run).ownRecords).toBeUndefined());
    await idle();
    expect(item('CONV-OWN-RECORDS')).toBeNull();
    expect(item('CONV-TAXON-NO-QUANTITY')).not.toBeNull();
    expect(OWN()?.checked).toBe(false);
  });

  it('the tick does the same, says what it costs, and unticking takes it back', async () => {
    const run = await load([{ name: 'Fish.csv', text: FISH }]);
    fireEvent.click(OWN()!);
    await waitFor(() => expect(last(run).ownRecords).toBe(true));
    expect(document.body.textContent).toContain(T['convert.sheet.ownRecords.help']);
    await waitFor(() => expect(item('CONV-OWN-RECORDS')).not.toBeNull());
    fireEvent.click(OWN()!);
    await waitFor(() => expect(last(run).ownRecords).toBeUndefined());
  });

  it('a sheet with an occurrenceID column has neither the tick nor the button', async () => {
    await load([{ name: 'Fish.csv', text: WITH_ID }]);
    expect(OWN()).toBeNull();
    const no = item('CONV-TAXON-NO-QUANTITY');
    expect(no).not.toBeNull();
    expect(within(no!).queryByRole('button', { name: T['convert.finding.ownRecords'] })).toBeNull();
  });

  it('a long sheet with a quantity column offers the button on its CONV-ID-DUPLICATE', async () => {
    await load([{ name: 'Fish.csv', text: COUNTED }]);
    for (const kind of screen.queryAllByLabelText(T['convert.quantity.kind'])) fireEvent.change(kind, { target: { value: 'count' } });
    await idle();
    const dup = item('CONV-ID-DUPLICATE');
    expect(dup).not.toBeNull();
    expect(within(dup!).getByRole('button', { name: T['convert.finding.ownRecords'] })).toBeDefined();
  });

  it('a wide sheet has no tick, and its CONV-ID-DUPLICATE has no button', async () => {
    await load([{ name: 'Fish.csv', text: WIDE }], 'wide');
    expect(OWN()).toBeNull();
    const dup = item('CONV-ID-DUPLICATE');
    expect(dup).not.toBeNull();
    expect(within(dup!).queryByRole('button', { name: T['convert.finding.ownRecords'] })).toBeNull();
  });
});

describe('identical rows under "each row is its own record"', () => {
  it('"Keep identical rows as separate records" sends keepCopiesCount and never a bare keepCopies; "Ask again" on the kept finding takes it back', async () => {
    const run = await load([{ name: 'Fish.csv', text: COPIES }]);
    fireEvent.click(OWN()!);
    await waitFor(() => expect(item('CONV-ROW-COPIES')).not.toBeNull());
    expect(last(run).keepCopiesCount).toBeUndefined();
    fireEvent.click(within(item('CONV-ROW-COPIES')!).getByRole('button', { name: T['convert.finding.keepCopies'] }));
    await waitFor(() => expect(last(run).keepCopiesCount).toBe(1));
    expect(last(run)).not.toHaveProperty('keepCopies');
    expect(last(run).keepCopiesFromFile).toBeUndefined();
    await idle();
    await waitFor(() => expect(item('CONV-ROW-COPIES-KEPT')).not.toBeNull());
    expect(item('CONV-ROW-COPIES')).toBeNull();
    fireEvent.click(within(item('CONV-ROW-COPIES-KEPT')!).getByRole('button', { name: T['convert.finding.askAgain'] }));
    await waitFor(() => expect(last(run).keepCopiesCount).toBeUndefined());
    await idle();
    expect(item('CONV-ROW-COPIES')).not.toBeNull();
    expect(last(run).ownRecords).toBe(true);
  });

  it('the button is absent while the sheet is not its own records', async () => {
    await load([{ name: 'Fish.csv', text: COUNTED_COPIES }]);
    for (const kind of screen.queryAllByLabelText(T['convert.quantity.kind'])) fireEvent.change(kind, { target: { value: 'count' } });
    await idle();
    const copies = item('CONV-ROW-COPIES');
    expect(copies).not.toBeNull();
    expect(within(copies!).queryByRole('button', { name: T['convert.finding.keepCopies'] })).toBeNull();
  });
});

describe('the companion file', () => {
  it('a saved copies answer is not applied to a sheet whose own-records answer no longer holds (another row count)', async () => {
    const run = await load([{ name: 'Fish.csv', text: COPIES }]);
    fireEvent.click(OWN()!);
    await waitFor(() => expect(item('CONV-ROW-COPIES')).not.toBeNull());
    fireEvent.click(within(item('CONV-ROW-COPIES')!).getByRole('button', { name: T['convert.finding.keepCopies'] }));
    await waitFor(() => expect(item('CONV-ROW-COPIES-KEPT')).not.toBeNull());
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const text = run.download.mock.calls[0][0] as string;
    cleanup();
    // one more row (a third copy of nothing: a new row), so the saved row count 3 no longer holds and the copies count 1 still would
    const more = COPIES + '"T2","2022-03-02",60.1,4.2,"Pollachius virens",380\n';
    const again = await load([{ name: 'Fish.csv', text: more }, { name: 'c.csv', text }]);
    expect(last(again).ownRecords).toBeUndefined();
    const tick = OWN();
    expect(tick?.checked).toBe(false);
    fireEvent.click(tick!);
    await waitFor(() => expect(last(again).ownRecords).toBe(true));
    expect(last(again).keepCopiesCount).toBeUndefined();
    await waitFor(() => expect(item('CONV-ROW-COPIES')).not.toBeNull());
    expect(item('CONV-ROW-COPIES-KEPT')).toBeNull();
  });

  it('keeps ownRecords=<rows>:<sheet>; a reload with it pre-ticks, said to come from the file; a 4-row sheet of the same name is not pre-ticked', async () => {
    const run = await load([{ name: 'Fish.csv', text: FISH }]);
    fireEvent.click(OWN()!);
    await waitFor(() => expect(item('CONV-OWN-RECORDS')).not.toBeNull());
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const text = run.download.mock.calls[0][0] as string;
    expect(text).toContain('ownRecords=3:Fish.csv');
    cleanup();
    const again = await load([{ name: 'Fish.csv', text: FISH }, { name: 'c.csv', text }]);
    expect(last(again).ownRecords).toBe(true);
    expect(last(again).ownRecordsFromFile).toBe(true);
    expect(OWN()?.checked).toBe(true);
    await waitFor(() => expect(item('CONV-OWN-RECORDS')?.textContent).toContain('companion file'));
    cleanup();
    const other = await load([{ name: 'Fish.csv', text: FISH4 }, { name: 'c.csv', text }]);
    expect(last(other).ownRecords).toBeUndefined();
    expect(OWN()?.checked).toBe(false);
  });

  it('keeps keepCopiesRows=<count>:<sheet>; a reload sends the count from the file and CONV-ROW-COPIES-KEPT says so', async () => {
    const run = await load([{ name: 'Fish.csv', text: COPIES }]);
    fireEvent.click(OWN()!);
    await waitFor(() => expect(item('CONV-ROW-COPIES')).not.toBeNull());
    fireEvent.click(within(item('CONV-ROW-COPIES')!).getByRole('button', { name: T['convert.finding.keepCopies'] }));
    await waitFor(() => expect(item('CONV-ROW-COPIES-KEPT')).not.toBeNull());
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const text = run.download.mock.calls[0][0] as string;
    expect(text).toContain('ownRecords=3:Fish.csv');
    expect(text).toContain('keepCopiesRows=1:Fish.csv');
    cleanup();
    const again = await load([{ name: 'Fish.csv', text: COPIES }, { name: 'c.csv', text }]);
    expect(last(again).keepCopiesCount).toBe(1);
    expect(last(again).keepCopiesFromFile).toBe(true);
    expect(last(again)).not.toHaveProperty('keepCopies');
    await waitFor(() => expect(item('CONV-ROW-COPIES-KEPT')?.textContent).toContain('companion file'));
  });
});
