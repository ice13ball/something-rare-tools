// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Round 4, Task 8, on the page: the order of a column's NN-NN-NN dates (two-digit year) is its own answer, apart from the day/month order of its slash dates; the buttons are exactly the orders the finding
// names, none preselected; the answer is sent by column index, kept in the companion file as a header hash and a row count, and a stale line is not applied. Every value is invented.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { initialChoices, yyOrderSettingsOf, dayMonthOrderSettingsOf } from '../../src/app/convertModel';
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
const ROWS = [['S1', 'k1', '05-06-21', 55, 3, 'Calanus finmarchicus', 4], ['S2', 'k2', '25-06-21', 56, 3, 'Calanus finmarchicus', 5]];
const MIXED = [...ROWS, ['S3', 'k3', '5/4/2023', 56, 3, 'Calanus finmarchicus', 6]];
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
const items = (rule: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(`li[data-rule="${rule}"]`)];
const item = (rule: string): HTMLElement | null => items(rule)[0] ?? null;
const last = (r: Run) => r.bodies[r.bodies.length - 1].sheets[0];
const settled = async (r: Run, check: (b: ConvertRequestBody) => boolean): Promise<void> => {
  await waitFor(() => expect(check(r.bodies[r.bodies.length - 1])).toBe(true));
  await idle();
};

describe('the buttons', () => {
  it('offer exactly the orders the finding names, none chosen; "Year first" sends yyOrder (not dayMonthOrder); DECLARED; "Ask again" takes it back', async () => {
    const run = await load([{ name: 'hauls.csv', text: HAULS }]);
    const q = item('CONV-DATE-ORDER-UNDECLARED')!;
    expect(q.querySelector('[data-testid="yy-ymd"]')).not.toBeNull();
    expect(q.querySelector('[data-testid="yy-dmy"]')).not.toBeNull();
    expect(q.querySelector('[data-testid="yy-mdy"]')).toBeNull();
    expect(q.querySelector('[data-testid="day-first"]')).toBeNull();
    expect(last(run).yyOrder).toBeUndefined();
    fireEvent.click(within(q).getByRole('button', { name: T['convert.finding.yyYmd'] }));
    await settled(run, (b) => b.sheets[0].yyOrder?.[DATE] === 'ymd');
    expect(last(run).dayMonthOrder).toBeUndefined();
    await waitFor(() => expect(item('CONV-DATE-ORDER-DECLARED')).not.toBeNull());
    expect(item('CONV-DATE-ORDER-UNDECLARED')).toBeNull();
    fireEvent.click(within(item('CONV-DATE-ORDER-DECLARED')!).getByRole('button', { name: T['convert.finding.askAgain'] }));
    await settled(run, (b) => b.sheets[0].yyOrder === undefined);
    await waitFor(() => expect(item('CONV-DATE-ORDER-UNDECLARED')).not.toBeNull());
  });

  it('"Day first (DD-MM-YY)" sends dmy as the two-digit answer', async () => {
    const run = await load([{ name: 'hauls.csv', text: HAULS }]);
    fireEvent.click(within(item('CONV-DATE-ORDER-UNDECLARED')!).getByRole('button', { name: T['convert.finding.yyDmy'] }));
    await settled(run, (b) => b.sheets[0].yyOrder?.[DATE] === 'dmy');
    expect(last(run).dayMonthOrder).toBeUndefined();
  });

  it('a column with slash and NN-NN-NN dates shows both questions; answering one neither answers nor clears the other', async () => {
    const run = await load([{ name: 'hauls.csv', text: csvOf(HEADER, MIXED) }]);
    const both = (): HTMLElement[] => items('CONV-DATE-ORDER-UNDECLARED');
    expect(both()).toHaveLength(2);
    const slash = both().find((li) => li.querySelector('[data-testid="day-first"]') !== null)!;
    fireEvent.click(within(slash).getByRole('button', { name: T['convert.finding.dayFirst'] }));
    await settled(run, (b) => b.sheets[0].dayMonthOrder?.[DATE] === 'dmy');
    expect(last(run).yyOrder).toBeUndefined();
    const yy = both().find((li) => li.querySelector('[data-testid="yy-ymd"]') !== null)!;
    fireEvent.click(within(yy).getByRole('button', { name: T['convert.finding.yyYmd'] }));
    await settled(run, (b) => b.sheets[0].yyOrder?.[DATE] === 'ymd');
    expect(last(run).dayMonthOrder).toEqual({ [DATE]: 'dmy' });
    expect(both()).toHaveLength(0);
    // taking the two-digit answer back leaves the slash answer
    const yyDeclared = items('CONV-DATE-ORDER-DECLARED').find((li) => li.querySelector('button[data-testid="ask-again"]') !== null && /order ymd /.test(li.textContent ?? ''))!;
    fireEvent.click(within(yyDeclared).getAllByRole('button', { name: T['convert.finding.askAgain'] })[0]);
    await settled(run, (b) => b.sheets[0].yyOrder === undefined);
    expect(last(run).dayMonthOrder).toEqual({ [DATE]: 'dmy' });
  });
});

describe('the companion file', () => {
  async function parsed(text = HAULS, companion?: string): Promise<ConvertParseResult> {
    return createDirectConvertEngine().parse([{ name: 'hauls.csv', bytes: new TextEncoder().encode(text), source: 'dropped' }, ...(companion === undefined ? [] : [{ name: 'c.csv', bytes: new TextEncoder().encode(companion), source: 'dropped' as const }])]);
  }
  const line = (rows: number, order: 'ymd' | 'dmy' | 'mdy' = 'ymd') => writeConvertSidecar({ yyOrder: [{ sheet: 'hauls.csv', order, hash: keyHashes(HEADER, [DATE])!, rows }] });

  it('writes yyOrder by header hash and row count, apart from dayMonthOrder, and no header text or date', async () => {
    const run = await load([{ name: 'hauls.csv', text: HAULS }]);
    fireEvent.click(within(item('CONV-DATE-ORDER-UNDECLARED')!).getByRole('button', { name: T['convert.finding.yyYmd'] }));
    await settled(run, (b) => b.sheets[0].yyOrder !== undefined);
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const text = run.download.mock.calls[0][0] as string;
    expect(text).toContain(`yyOrder=ymd:hauls.csv:${keyHashes(HEADER, [DATE])}:2`);
    expect(text).not.toContain('dayMonthOrder=');
    expect(text).not.toMatch(/21|Date/);
  });

  it('pre-picks only when the column is found by its hash and the sheet has the same number of rows; the slash answer is untouched', async () => {
    const same = await parsed(HAULS, line(2));
    const pre = initialChoices(same)[`${same.files[0].fileId}\u0000hauls.csv`];
    expect(pre.yyOrder).toEqual({ [DATE]: 'ymd' });
    expect(pre.yyOrderFile).toEqual([DATE]);
    expect(pre.dayMonthOrder).toBeUndefined();
    const more = await parsed(csvOf(HEADER, [...ROWS, ['S3', 'k3', '07-06-21', 56, 3, 'Calanus finmarchicus', 6]]), line(2));
    expect(initialChoices(more)[`${more.files[0].fileId}\u0000hauls.csv`].yyOrder).toBeUndefined();
    const renamed = await parsed(HAULS.replace('Date', 'Day'), line(2));
    expect(initialChoices(renamed)[`${renamed.files[0].fileId}\u0000hauls.csv`].yyOrder).toBeUndefined();
  });

  it('yyOrderSettingsOf writes the pre-pick and nothing for a sheet that is not used; dayMonthOrderSettingsOf stays empty', async () => {
    const p = await parsed(HAULS, line(2, 'dmy'));
    const choices = initialChoices(p);
    expect(yyOrderSettingsOf(p, choices)).toEqual([{ sheet: 'hauls.csv', order: 'dmy', hash: keyHashes(HEADER, [DATE])!, rows: 2 }]);
    expect(dayMonthOrderSettingsOf(p, choices)).toEqual([]);
    const key = `${p.files[0].fileId}\u0000hauls.csv`;
    expect(yyOrderSettingsOf(p, { ...choices, [key]: { ...choices[key], use: false } })).toEqual([]);
  });

  it('on the page the request carries the pre-picked order, says it came from the file, and "Ask again" sends neither', async () => {
    const run = await load([{ name: 'hauls.csv', text: HAULS }, { name: 'c.csv', text: line(2) }]);
    expect(last(run).yyOrder).toEqual({ [DATE]: 'ymd' });
    expect(last(run).yyOrderFromFile).toEqual([DATE]);
    await waitFor(() => expect(item('CONV-DATE-ORDER-DECLARED')?.textContent).toContain('companion file'));
    fireEvent.click(within(item('CONV-DATE-ORDER-DECLARED')!).getByRole('button', { name: T['convert.finding.askAgain'] }));
    await settled(run, (b) => b.sheets[0].yyOrder === undefined);
    expect(last(run).yyOrderFromFile).toBeUndefined();
    await waitFor(() => expect(item('CONV-DATE-ORDER-UNDECLARED')).not.toBeNull());
  });

  it('a stale companion line (one more row) is not applied: the question stays open', async () => {
    const more = csvOf(HEADER, [...ROWS, ['S3', 'k3', '07-06-21', 56, 3, 'Calanus finmarchicus', 6]]);
    const run = await load([{ name: 'hauls.csv', text: more }, { name: 'c.csv', text: line(2) }]);
    expect(last(run).yyOrder).toBeUndefined();
    expect(item('CONV-DATE-ORDER-UNDECLARED')).not.toBeNull();
    expect(item('CONV-DATE-ORDER-DECLARED')).toBeNull();
  });

  it('a pre-picked order the person then changes is no longer said to come from the file', async () => {
    const run = await load([{ name: 'hauls.csv', text: HAULS }, { name: 'c.csv', text: line(2) }]);
    fireEvent.click(within(item('CONV-DATE-ORDER-DECLARED')!).getByRole('button', { name: T['convert.finding.askAgain'] }));
    await waitFor(() => expect(item('CONV-DATE-ORDER-UNDECLARED')).not.toBeNull());
    fireEvent.click(within(item('CONV-DATE-ORDER-UNDECLARED')!).getByRole('button', { name: T['convert.finding.yyDmy'] }));
    await settled(run, (b) => b.sheets[0].yyOrder?.[DATE] === 'dmy');
    expect(last(run).yyOrderFromFile).toBeUndefined();
  });
});
