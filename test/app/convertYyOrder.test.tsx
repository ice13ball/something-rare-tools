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
import { makeConvertFinding, renderConvertPlain, renderConvertTechnical } from '../../src/core/rules/convert';
import type { Lang } from '../../src/core/types';
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

const declaredLines = (): { yy: HTMLElement; slash: HTMLElement } => {
  const all = items('CONV-DATE-ORDER-DECLARED');
  expect(all).toHaveLength(2);
  const yy = all.filter((li) => /two-digit year \(NN-NN-NN\)/.test(li.textContent ?? ''));
  expect(yy).toHaveLength(1);
  return { yy: yy[0], slash: all.find((li) => li !== yy[0])! };
};

describe('a mixed column with both answers dmy (round 4, Task 8 fix round 1)', () => {
  it('shows two distinguishable lines, and each "Ask again" clears its own slot', async () => {
    const run = await load([{ name: 'hauls.csv', text: csvOf(HEADER, MIXED) }]);
    const slashQ = items('CONV-DATE-ORDER-UNDECLARED').find((li) => li.querySelector('[data-testid="day-first"]') !== null)!;
    fireEvent.click(within(slashQ).getByRole('button', { name: T['convert.finding.dayFirst'] }));
    await settled(run, (b) => b.sheets[0].dayMonthOrder?.[DATE] === 'dmy');
    const yyQ = items('CONV-DATE-ORDER-UNDECLARED').find((li) => li.querySelector('[data-testid="yy-dmy"]') !== null)!;
    fireEvent.click(within(yyQ).getByRole('button', { name: T['convert.finding.yyDmy'] }));
    await settled(run, (b) => b.sheets[0].yyOrder?.[DATE] === 'dmy');
    await waitFor(() => expect(items('CONV-DATE-ORDER-DECLARED')).toHaveLength(2));
    expect(declaredLines().slash.textContent).not.toMatch(/two-digit/);
    fireEvent.click(within(declaredLines().yy).getByRole('button', { name: T['convert.finding.askAgain'] }));
    await settled(run, (b) => b.sheets[0].yyOrder === undefined);
    expect(last(run).dayMonthOrder).toEqual({ [DATE]: 'dmy' });
    const yyQ2 = items('CONV-DATE-ORDER-UNDECLARED').find((li) => li.querySelector('[data-testid="yy-dmy"]') !== null)!;
    fireEvent.click(within(yyQ2).getByRole('button', { name: T['convert.finding.yyDmy'] }));
    await settled(run, (b) => b.sheets[0].yyOrder?.[DATE] === 'dmy');
    await waitFor(() => expect(items('CONV-DATE-ORDER-DECLARED')).toHaveLength(2));
    fireEvent.click(within(declaredLines().slash).getByRole('button', { name: T['convert.finding.askAgain'] }));
    await settled(run, (b) => b.sheets[0].dayMonthOrder === undefined);
    expect(last(run).yyOrder).toEqual({ [DATE]: 'dmy' });
  });

  it('the two-digit CONTRADICTED and DECLARED texts name the dates and keep the companion-file sentence, in every language', () => {
    for (const lang of ['en', 'pl', 'de', 'fr'] as Lang[]) {
      const base = { file: 'a.csv', sheet: 's', field: 'Date' };
      const d = makeConvertFinding('CONV-DATE-ORDER-DECLARED', { ...base, params: { variant: 'two-digit-year', order: 'ymd', fromFile: 'yes', index: 2 } });
      const plain = renderConvertPlain(d, lang);
      expect(plain).toContain('NN-NN-NN');
      const without = renderConvertPlain({ ...d, params: { variant: 'two-digit-year', order: 'ymd', index: 2 } }, lang);
      expect(plain.startsWith(without)).toBe(true);
      expect(plain.length).toBeGreaterThan(without.length);
      expect(renderConvertTechnical(d)).toContain('NN-NN-NN');
      const c = makeConvertFinding('CONV-DATE-ORDER-CONTRADICTED', { ...base, params: { variant: 'two-digit-year', declared: 'mdy', detected: 'ymd', index: 2 } });
      expect(renderConvertPlain(c, lang)).toContain('NN-NN-NN');
      expect(renderConvertTechnical(c)).toContain('NN-NN-NN');
    }
  });
});

const SEMI = (rows: string[][]): string => [HEADER.concat('Chlorophyll').join(';'), ...rows.map((r) => r.join(';'))].join('\n') + '\n';
const DECIMAL_ROWS = [['S1', 'k1', '05-06-21', '55,5', '3,5', 'Calanus finmarchicus', '4', '1,250'], ['S2', 'k2', '25-06-21', '56,5', '3,5', 'Calanus finmarchicus', '5', '2,000']];

describe('the answer survives the other re-reads, a profile sheet and a joined description column (fix round 1)', () => {
  it('a decimal answer after the two-digit answer keeps yyOrder', async () => {
    const run = await load([{ name: 'hauls.csv', text: SEMI(DECIMAL_ROWS) }]);
    fireEvent.click(within(item('CONV-DATE-ORDER-UNDECLARED')!).getByRole('button', { name: T['convert.finding.yyYmd'] }));
    await settled(run, (b) => b.sheets[0].yyOrder?.[DATE] === 'ymd');
    fireEvent.click(within(item('IN-DECIMAL-AMBIGUOUS')!).getByRole('button', { name: T['convert.finding.thousandsSeparator'] }));
    await waitFor(() => expect(item('CONV-DECIMAL-DECLARED')).not.toBeNull());
    await idle();
    expect(last(run).yyOrder).toEqual({ [DATE]: 'ymd' });
    expect(item('CONV-DATE-ORDER-DECLARED')).not.toBeNull();
  });

  it('an encoding pick after the two-digit answer keeps yyOrder', async () => {
    const bytes = Uint8Array.from('Station;Sample;Date;Latitude;Longitude;Species;Count;Kr\xf8yer\nS1;k1;05-06-21;55,5;3,5;Calanus finmarchicus;4;S\xe8vre\nS2;k2;25-06-21;56,5;3,5;Calanus finmarchicus;5;S\xe8vre\n', (c) => c.charCodeAt(0));
    const base = createDirectConvertEngine();
    const bodies: ConvertRequestBody[] = [];
    const engine: ConvertEngine = { ...base, convert: (b) => (bodies.push(b), base.convert(b)) };
    const view = render(<ConvertPage engine={engine} download={vi.fn()} downloadFile={vi.fn()} />);
    fireEvent.change(view.container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File([bytes as BlobPart], 'hauls.csv', { type: 'text/csv' })] } });
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    const confirm = screen.queryByRole('button', { name: /Confirm all shown/ });
    if (confirm !== null) fireEvent.click(confirm);
    for (const kind of screen.queryAllByLabelText(T['convert.quantity.kind'])) fireEvent.change(kind, { target: { value: 'count' } });
    await idle();
    const run: Run = { bodies, download: vi.fn() };
    fireEvent.click(within(item('CONV-DATE-ORDER-UNDECLARED')!).getByRole('button', { name: T['convert.finding.yyYmd'] }));
    await settled(run, (b) => b.sheets[0].yyOrder?.[DATE] === 'ymd');
    fireEvent.click(within(item('IN-ENCODING-AMBIGUOUS')!).getAllByTestId('encoding-reading')[1]);
    await waitFor(() => expect(item('CONV-ENCODING-DECLARED')).not.toBeNull());
    await idle();
    expect(last(run).yyOrder).toEqual({ [DATE]: 'ymd' });
    expect(item('CONV-DATE-ORDER-DECLARED')).not.toBeNull();
  });

  it('a profile sheet carries yyOrder', async () => {
    const run = await load([{ name: 'hauls.csv', text: HAULS }]);
    fireEvent.click(screen.getByLabelText(T['convert.sheet.profile']));
    await waitFor(() => expect(last(run).profile).toBeDefined());
    await idle();
    fireEvent.click(within(item('CONV-DATE-ORDER-UNDECLARED')!).getByRole('button', { name: T['convert.finding.yyYmd'] }));
    await settled(run, (b) => b.sheets[0].yyOrder !== undefined);
    expect(last(run).yyOrder).toEqual({ [DATE]: 'ymd' });
    expect(last(run).profile).toBeDefined();
  });

  it('a joined description column carries yyOrder on the description sheet only', async () => {
    const results = csvOf(['Sample', 'Taxon', 'Count'], [['X01', 'Calanus finmarchicus', 12], ['X02', 'Calanus finmarchicus', 7]]);
    const samples = csvOf(['Sample', 'Station', 'Date', 'Latitude', 'Longitude', 'Depth'], [['X01', 'ST-1', '05-06-21', 61.1, 4.2, 10], ['X02', 'ST-2', '25-06-21', 61.3, 4.6, 20]]);
    const run = await load([{ name: 'results.csv', text: results }, { name: 'samples.csv', text: samples }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.join.confirm'] }));
    await settled(run, (b) => b.sampleJoin !== undefined);
    await waitFor(() => expect(item('CONV-DATE-ORDER-UNDECLARED')).not.toBeNull());
    fireEvent.click(within(item('CONV-DATE-ORDER-UNDECLARED')!).getByRole('button', { name: T['convert.finding.yyYmd'] }));
    await settled(run, (b) => b.sheets.find((x) => x.sheet === 'samples.csv')?.yyOrder !== undefined);
    const body = run.bodies[run.bodies.length - 1];
    expect(body.sheets.find((x) => x.sheet === 'samples.csv')!.yyOrder).toEqual({ 2: 'ymd' });
    expect(body.sheets.find((x) => x.sheet === 'results.csv')!.yyOrder).toBeUndefined();
  });
});

describe('the companion file keeps only what core reported as declared (fix round 1)', () => {
  it('a pre-picked yyOrder for a column that no longer has NN-NN-NN cells is not written back', async () => {
    const plain = csvOf(HEADER, [['S1', 'k1', '2023-06-14', 55, 3, 'Calanus finmarchicus', 4], ['S2', 'k2', '2023-06-15', 56, 3, 'Calanus finmarchicus', 5]]);
    const companion = writeConvertSidecar({ yyOrder: [{ sheet: 'hauls.csv', order: 'ymd', hash: keyHashes(HEADER, [DATE])!, rows: 2 }] });
    const run = await load([{ name: 'hauls.csv', text: plain }, { name: 'c.csv', text: companion }]);
    expect(item('CONV-DATE-ORDER-DECLARED')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    expect(run.download.mock.calls[0][0] as string).not.toContain('yyOrder=');
  });

  it('yyOrderSettingsOf with the reported findings writes only the declared column', async () => {
    const p = await createDirectConvertEngine().parse([{ name: 'hauls.csv', bytes: new TextEncoder().encode(HAULS), source: 'dropped' }]);
    const key = `${p.files[0].fileId}\u0000hauls.csv`;
    const choices = { ...initialChoices(p), [key]: { ...initialChoices(p)[key], yyOrder: { [DATE]: 'ymd' as const } } };
    const said = makeConvertFinding('CONV-DATE-ORDER-DECLARED', { file: 'hauls.csv', sheet: 'hauls.csv', field: 'Date', params: { variant: 'two-digit-year', order: 'ymd', index: DATE } });
    expect(yyOrderSettingsOf(p, choices, [said])).toHaveLength(1);
    expect(yyOrderSettingsOf(p, choices, [])).toEqual([]);
    const slashLine = makeConvertFinding('CONV-DATE-ORDER-DECLARED', { file: 'hauls.csv', sheet: 'hauls.csv', field: 'Date', params: { order: 'dmy', index: DATE } });
    expect(yyOrderSettingsOf(p, choices, [slashLine])).toEqual([]);
  });
});
