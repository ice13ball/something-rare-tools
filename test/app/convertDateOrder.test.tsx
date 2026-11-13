// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Round 3, Task 8, on the page: a date column whose day/month order no cell decides is asked about ("Day first" / "Month first"), the answer is sent by column index and is the person's own;
// "Ask again" takes it back; the companion file keeps it as a header hash and the sheet's row count and pre-picks it only while both hold; a date on a description sheet is answered on that sheet.
// Every value is invented.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { initialChoices, dayMonthOrderSettingsOf } from '../../src/app/convertModel';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { keyHashes } from '../../src/core/convert/keySetting';
import { writeConvertSidecar } from '../../src/core/convert/settings';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import type { ConvertEngine, ConvertParseResult, ConvertRequestBody } from '../../src/worker/convert.protocol';
import { chooseFiles, csvOf } from './convertHelpers';

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const HEADER = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'];
const ROWS = [['S1', 'k1', '5/4/2023', 55, 3, 'Calanus finmarchicus', 4], ['S2', 'k2', '6/7/2023', 56, 3, 'Calanus finmarchicus', 5]];
const DATE = 2;
const HAULS = csvOf(HEADER, ROWS);

interface Run {
  bodies: ConvertRequestBody[];
  download: ReturnType<typeof vi.fn>;
}

async function load(files: { name: string; text: string }[]): Promise<Run> {
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
  for (const kind of screen.queryAllByLabelText(T['convert.quantity.kind'])) fireEvent.change(kind, { target: { value: 'count' } });
  await idle();
  return { bodies, download };
}

const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const item = (rule: string): HTMLElement | null => document.querySelector(`li[data-rule="${rule}"]`);
const button = (root: HTMLElement, name: string): HTMLElement => within(root).getByRole('button', { name });
const sheetOf = (b: ConvertRequestBody, name: string) => b.sheets.find((s) => s.sheet === name)!;
const settled = async (r: Run, check: (b: ConvertRequestBody) => boolean): Promise<void> => {
  await waitFor(() => expect(check(r.bodies[r.bodies.length - 1])).toBe(true));
  await idle();
};

describe('the buttons', () => {
  it('"Day first" sends the order by column; the finding becomes CONV-DATE-ORDER-DECLARED; "Ask again" takes it back', async () => {
    const run = await load([{ name: 'hauls.csv', text: HAULS }]);
    expect(run.bodies[run.bodies.length - 1].sheets[0].dayMonthOrder).toBeUndefined();
    expect(item('CONV-DATE-ORDER-DECLARED')).toBeNull();
    fireEvent.click(button(item('CONV-DATE-ORDER-UNDECLARED')!, T['convert.finding.dayFirst']));
    await settled(run, (b) => b.sheets[0].dayMonthOrder !== undefined);
    const sent = run.bodies[run.bodies.length - 1].sheets[0];
    expect(sent.dayMonthOrder).toEqual({ [DATE]: 'dmy' });
    expect(sent.dayMonthOrderFromFile).toBeUndefined();
    await waitFor(() => expect(item('CONV-DATE-ORDER-DECLARED')).not.toBeNull());
    expect(item('CONV-DATE-ORDER-UNDECLARED')).toBeNull();
    fireEvent.click(button(item('CONV-DATE-ORDER-DECLARED')!, T['convert.finding.askAgain']));
    await settled(run, (b) => b.sheets[0].dayMonthOrder === undefined);
    await waitFor(() => expect(item('CONV-DATE-ORDER-UNDECLARED')).not.toBeNull());
    expect(item('CONV-DATE-ORDER-DECLARED')).toBeNull();
  });

  it('"Month first" sends mdy', async () => {
    const run = await load([{ name: 'hauls.csv', text: HAULS }]);
    fireEvent.click(button(item('CONV-DATE-ORDER-UNDECLARED')!, T['convert.finding.monthFirst']));
    await settled(run, (b) => b.sheets[0].dayMonthOrder !== undefined);
    expect(run.bodies[run.bodies.length - 1].sheets[0].dayMonthOrder).toEqual({ [DATE]: 'mdy' });
  });
});

describe('the companion file', () => {
  async function parsed(text = HAULS, companion?: string): Promise<ConvertParseResult> {
    return createDirectConvertEngine().parse([{ name: 'hauls.csv', bytes: new TextEncoder().encode(text), source: 'dropped' }, ...(companion === undefined ? [] : [{ name: 'c.csv', bytes: new TextEncoder().encode(companion), source: 'dropped' as const }])]);
  }
  const line = (rows: number, order: 'dmy' | 'mdy' = 'dmy') => writeConvertSidecar({ dayMonthOrder: [{ sheet: 'hauls.csv', order, hash: keyHashes(HEADER, [DATE])!, rows }] });

  it('writes the order by header hash and row count, never the header text or a date', async () => {
    const run = await load([{ name: 'hauls.csv', text: HAULS }]);
    fireEvent.click(button(item('CONV-DATE-ORDER-UNDECLARED')!, T['convert.finding.dayFirst']));
    await settled(run, (b) => b.sheets[0].dayMonthOrder !== undefined);
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const text = run.download.mock.calls[0][0] as string;
    expect(text).toContain(`dayMonthOrder=dmy:hauls.csv:${keyHashes(HEADER, [DATE])}:2`);
    expect(text).not.toMatch(/2023|Date/);
  });

  it('pre-picks only when the column is found by its hash and the sheet has the same number of rows', async () => {
    const same = await parsed(HAULS, line(2));
    const pre = initialChoices(same)[`${same.files[0].fileId}\u0000hauls.csv`];
    expect(pre.dayMonthOrder).toEqual({ [DATE]: 'dmy' });
    expect(pre.dayMonthOrderFile).toEqual([DATE]);
    const more = await parsed(HAULS, line(3));
    expect(initialChoices(more)[`${more.files[0].fileId}\u0000hauls.csv`].dayMonthOrder).toBeUndefined();
    const renamed = await parsed(HAULS.replace('Date', 'Day'), line(2));
    expect(initialChoices(renamed)[`${renamed.files[0].fileId}\u0000hauls.csv`].dayMonthOrder).toBeUndefined();
  });

  it('dayMonthOrderSettingsOf writes the pre-pick and the page answer, and nothing for a sheet that is not used', async () => {
    const p = await parsed(HAULS, line(2, 'mdy'));
    const choices = initialChoices(p);
    expect(dayMonthOrderSettingsOf(p, choices)).toEqual([{ sheet: 'hauls.csv', order: 'mdy', hash: keyHashes(HEADER, [DATE])!, rows: 2 }]);
    const key = `${p.files[0].fileId}\u0000hauls.csv`;
    expect(dayMonthOrderSettingsOf(p, { ...choices, [key]: { ...choices[key], use: false } })).toEqual([]);
  });

  it('on the page the request carries the pre-picked order and says it came from the file; "Ask again" sends neither', async () => {
    const run = await load([{ name: 'hauls.csv', text: HAULS }, { name: 'c.csv', text: line(2) }]);
    const sent = run.bodies[run.bodies.length - 1].sheets[0];
    expect(sent.dayMonthOrder).toEqual({ [DATE]: 'dmy' });
    expect(sent.dayMonthOrderFromFile).toEqual([DATE]);
    await waitFor(() => expect(item('CONV-DATE-ORDER-DECLARED')?.textContent).toContain('companion file'));
    fireEvent.click(button(item('CONV-DATE-ORDER-DECLARED')!, T['convert.finding.askAgain']));
    await settled(run, (b) => b.sheets[0].dayMonthOrder === undefined);
    expect(run.bodies[run.bodies.length - 1].sheets[0].dayMonthOrderFromFile).toBeUndefined();
    await waitFor(() => expect(item('CONV-DATE-ORDER-UNDECLARED')).not.toBeNull());
  });

  it('a pre-picked order the person then changes is no longer said to come from the file', async () => {
    const run = await load([{ name: 'hauls.csv', text: HAULS }, { name: 'c.csv', text: line(2) }]);
    fireEvent.click(button(item('CONV-DATE-ORDER-DECLARED')!, T['convert.finding.askAgain']));
    await waitFor(() => expect(item('CONV-DATE-ORDER-UNDECLARED')).not.toBeNull());
    fireEvent.click(button(item('CONV-DATE-ORDER-UNDECLARED')!, T['convert.finding.monthFirst']));
    await settled(run, (b) => b.sheets[0].dayMonthOrder?.[DATE] === 'mdy');
    expect(run.bodies[run.bodies.length - 1].sheets[0].dayMonthOrderFromFile).toBeUndefined();
  });
});

describe('a date on a description sheet', () => {
  const RESULTS = csvOf(['Sample', 'Taxon', 'Count'], [['X01', 'Calanus finmarchicus', 12], ['X02', 'Calanus finmarchicus', 7]]);
  const SAMPLES = csvOf(['Sample', 'Station', 'Date', 'Latitude', 'Longitude', 'Depth'], [['X01', 'ST-1', '5/4/2023', 61.1, 4.2, 10], ['X02', 'ST-2', '6/7/2023', 61.3, 4.6, 20]]);

  it('"Day first" sets the answer on the description sheet\'s own choice (its own index) and the finding becomes DECLARED', async () => {
    const run = await load([{ name: 'results.csv', text: RESULTS }, { name: 'samples.csv', text: SAMPLES }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.join.confirm'] }));
    await settled(run, (b) => b.sampleJoin !== undefined);
    await waitFor(() => expect(item('CONV-DATE-ORDER-UNDECLARED')).not.toBeNull());
    expect(item('CONV-DATE-ORDER-UNDECLARED')!.textContent).toContain('samples.csv');
    fireEvent.click(button(item('CONV-DATE-ORDER-UNDECLARED')!, T['convert.finding.dayFirst']));
    await settled(run, (b) => sheetOf(b, 'samples.csv').dayMonthOrder !== undefined);
    const body = run.bodies[run.bodies.length - 1];
    expect(sheetOf(body, 'samples.csv').dayMonthOrder).toEqual({ 2: 'dmy' });
    expect(sheetOf(body, 'results.csv').dayMonthOrder).toBeUndefined();
    await waitFor(() => expect(item('CONV-DATE-ORDER-DECLARED')).not.toBeNull());
    expect(item('CONV-DATE-ORDER-UNDECLARED')).toBeNull();
  });
});
