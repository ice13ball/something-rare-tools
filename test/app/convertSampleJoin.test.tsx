// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Task 9, on the page: a sheet that seems to describe the samples of another is PROPOSED (Confirm / Change / No) and nothing joins until the person confirms; the groups of differing values are decided for
// all samples, per sample or per pair of values; the answer about samples without a description is the join's, not the sheet's; the companion file keeps names, counts and hashes and never a sample code.
// The spec's invented data (Counts / Samples, X01-X04, ST-1 to ST-3).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { initialJoins, sampleJoinSettingsOf, type JoinChoice } from '../../src/app/convertModel';
import { ConvertSampleJoin, undecidedOf } from '../../src/app/components/ConvertSampleJoin';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { shortHash, keyHashes } from '../../src/core/convert/keySetting';
import { writeConvertSidecar } from '../../src/core/convert/settings';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import type { ConvertEngine, ConvertParseResult, ConvertRequestBody } from '../../src/worker/convert.protocol';
import { chooseFiles, csvOf } from './convertHelpers';
import { LONG_SAMPLES_ROWS } from '../convert/joinFixtures';

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });

const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('../../src/app/analytics', async (orig) => ({ ...(await orig<typeof import('../../src/app/analytics')>()), track: analytics.track }));

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
  analytics.track.mockClear();
});
afterEach(cleanup);

const TAX = 'Calanus finmarchicus';
const OITH = 'Oithona similis';
const RESULTS = csvOf(['Sample', 'Taxon', 'Count'], [['X01', TAX, 12], ['X01', OITH, 3], ['X02', TAX, 7]]);
const SAMPLES = csvOf(['Sample', 'Station', 'Date', 'Latitude', 'Longitude', 'Depth'], [['X01', 'ST-1', '2021-05-03', 61.1, 4.2, 10], ['X02', 'ST-2', '2021-05-04', 61.3, 4.6, 20], ['X03', 'ST-3', '2021-05-05', 61.5, 4.9, 30]]);
/** the same counts, with a date that differs from the description's for X01 (and, when `both`, for X02 with the same pair of values) */
const dated = (x01: string, x02 = '2021-05-04'): string => csvOf(['Sample', 'Taxon', 'Count', 'Date'], [['X01', TAX, 12, x01], ['X01', OITH, 3, x01], ['X02', TAX, 7, x02]]);

interface Run {
  bodies: ConvertRequestBody[];
  download: ReturnType<typeof vi.fn>;
  container: HTMLElement;
}

async function load(files: { name: string; text: string }[], lang: 'en' | 'pl' | 'de' | 'fr' = 'en'): Promise<Run> {
  const base = createDirectConvertEngine();
  const bodies: ConvertRequestBody[] = [];
  const engine: ConvertEngine = { ...base, convert: (b) => (bodies.push(b), base.convert(b)) };
  const download = vi.fn();
  const view = render(<ConvertPage engine={engine} download={download} downloadFile={vi.fn()} />);
  chooseFiles(view.container, files);
  fireEvent.click(screen.getByRole('button', { name: UI[lang]['convert.read'] }));
  await screen.findByRole('heading', { name: UI[lang]['convert.columns.title'] });
  await idle();
  return { bodies, download, container: view.container };
}

const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const summary = (): HTMLElement => screen.getByRole('region', { name: T['convert.summary.title'] });
const panel = (): HTMLElement | null => document.querySelector('[data-testid="sample-join"]');
const rule = (id: string): HTMLElement | null => document.querySelector(`li[data-rule="${id}"]`);
const button = (name: string, root: HTMLElement | Document = document.body): HTMLElement => within(root as HTMLElement).getByRole('button', { name });
const last = (r: Run): ConvertRequestBody => r.bodies[r.bodies.length - 1];
const settled = async (r: Run, check: (b: ConvertRequestBody) => boolean): Promise<void> => {
  await waitFor(() => expect(check(last(r))).toBe(true));
  await idle();
};
const confirm = async (r: Run): Promise<void> => {
  fireEvent.click(button(T['convert.join.confirm']));
  await settled(r, (b) => b.sampleJoin !== undefined);
};
const entryId = (key: string, resultsText: string): string => shortHash(`${key}\u0000${resultsText}`);
const row = (key: string): HTMLElement => [...document.querySelectorAll('[data-testid="join-group"] tr[data-entry]')].find((tr) => tr.firstElementChild?.textContent === key) as HTMLElement;
const side = (key: string, s: 'Description' | 'Results'): HTMLElement => screen.getByRole('button', { name: `${key}: take the ${s} value` });
const R = { fileId: 'c1', sheet: 'results.csv' };
const D = { fileId: 'c2', sheet: 'samples.csv' };

describe('the proposal: nothing is joined until the person confirms', () => {
  it('shows both sheets and the key, joins nothing, and says so', async () => {
    const run = await load([{ name: 'results.csv', text: RESULTS }, { name: 'samples.csv', text: SAMPLES }]);
    const text = panel()!.textContent!;
    expect(text).toContain('results.csv');
    expect(text).toContain('samples.csv');
    expect(text).toContain('Sample ↔ Sample');
    expect(text).toContain('2 of the 2 samples');
    expect(text).toContain(T['convert.join.intro']);
    // the request holds no join, and the duplicate identifiers are still there
    expect(last(run).sampleJoin).toBeUndefined();
    expect(last(run).sampleJoinNo).toBeUndefined();
    expect(rule('CONV-ID-DUPLICATE')).not.toBeNull();
  });

  it('Confirm sends the pair and the duplicates are gone; the panel then says it is joined and offers Undo', async () => {
    const run = await load([{ name: 'results.csv', text: RESULTS }, { name: 'samples.csv', text: SAMPLES }]);
    await confirm(run);
    expect(last(run).sampleJoin).toEqual([{ results: R, description: D, keys: [{ results: 0, description: 0 }], conflicts: [] }]);
    expect(rule('CONV-ID-DUPLICATE')).toBeNull();
    expect(panel()!.textContent).toContain('Joined, as you confirmed');
    expect(screen.queryByRole('button', { name: T['convert.join.confirm'] })).toBeNull();
    // Undo takes it back: the next request has no join and the duplicates are back
    fireEvent.click(button(T['convert.join.undo']));
    await settled(run, (b) => b.sampleJoin === undefined);
    expect(rule('CONV-ID-DUPLICATE')).not.toBeNull();
    expect(screen.getByRole('button', { name: T['convert.join.confirm'] })).toBeTruthy();
  });

  it('No sends sampleJoinNo and hides the panel proposal; "Ask again" brings it back', async () => {
    const run = await load([{ name: 'results.csv', text: RESULTS }, { name: 'samples.csv', text: SAMPLES }]);
    fireEvent.click(button(T['convert.join.no']));
    await settled(run, (b) => b.sampleJoinNo !== undefined);
    expect(last(run).sampleJoinNo).toEqual([{ results: R, description: D }]);
    expect(last(run).sampleJoin).toBeUndefined();
    expect(screen.queryByRole('button', { name: T['convert.join.confirm'] })).toBeNull();
    expect(panel()!.textContent).toContain('are not joined');
    fireEvent.click(within(panel()!).getByRole('button', { name: T['convert.finding.askAgain'] }));
    await settled(run, (b) => b.sampleJoinNo === undefined);
    expect(screen.getByRole('button', { name: T['convert.join.confirm'] })).toBeTruthy();
  });

  it('Change: the person picks the key columns; nothing joins until "Join with these columns"', async () => {
    const run = await load([{ name: 'results.csv', text: RESULTS }, { name: 'samples.csv', text: SAMPLES }]);
    fireEvent.click(button(T['convert.join.change']));
    expect(last(run).sampleJoin).toBeUndefined();
    // the description key is moved to the Station column (index 1) by the person
    fireEvent.change(screen.getByLabelText(/Key 1: column in the description sheet/), { target: { value: '1' } });
    expect(last(run).sampleJoin).toBeUndefined();
    fireEvent.click(button(T['convert.join.changeUse']));
    await settled(run, (b) => b.sampleJoin !== undefined);
    expect(last(run).sampleJoin?.[0].keys).toEqual([{ results: 0, description: 1 }]);
    expect(panel()!.textContent).toContain('Sample ↔ Station');
  });

  it('a long description sheet is shown with the not-supported sentence and no Confirm button', async () => {
    const bytes = (await import('xlsx')).write(await bookWorkbook(), { type: 'array', bookType: 'xlsx' });
    const base = createDirectConvertEngine();
    const view = render(<ConvertPage engine={base} download={vi.fn()} downloadFile={vi.fn()} />);
    fireEvent.change(view.container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File([bytes], 'book.xlsx')] } });
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    await idle();
    await waitFor(() => expect(panel()).not.toBeNull());
    expect(panel()!.textContent).toContain('Sheet book.xlsx / Samples is in the long layout (one row per parameter); joining it is not supported yet, both sheets are converted as without a join.');
    expect(screen.queryByRole('button', { name: T['convert.join.confirm'] })).toBeNull();
  });
});

async function bookWorkbook() {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const sheet = (rows: (string | number)[][]) => XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, sheet([['Sample', 'Taxon', 'Count'], ['X01', TAX, 12], ['X01', OITH, 3], ['X02', TAX, 7]]), 'Counts');
  XLSX.utils.book_append_sheet(wb, sheet([['Sample', 'Parameter', 'Value'], ...(LONG_SAMPLES_ROWS as (string | number)[][])]), 'Samples');
  return wb;
}

describe('groups of differing values', () => {
  it('spec test 5: "Date differs in 1 sample"; the choice for all, then one sample set the other way', async () => {
    const run = await load([{ name: 'results.csv', text: dated('2021-05-02') }, { name: 'samples.csv', text: SAMPLES }]);
    await confirm(run);
    const g = document.querySelector('[data-testid="join-group"]') as HTMLElement;
    expect(g.querySelector('h4')!.textContent).toBe('Date differs in 1 sample');
    // nothing is chosen for the person, and the export is blocked until they choose
    expect(rule('CONV-JOIN-CONFLICT')).not.toBeNull();
    expect(g.textContent).toContain('2021-05-03');
    expect(g.textContent).toContain('2021-05-02');
    fireEvent.click(within(g).getByRole('button', { name: T['convert.join.conflict.takeDescription'] }));
    await settled(run, (b) => (b.sampleJoin?.[0].conflicts.length ?? 0) > 0);
    expect(last(run).sampleJoin![0].conflicts).toEqual([{ group: 'date', take: 'description', count: 1, exceptions: [] }]);
    expect(rule('CONV-JOIN-CONFLICT')).toBeNull();
    // the override after the choice for all: X01 set to the results
    fireEvent.click(side('X01', 'Results'));
    await settled(run, (b) => (b.sampleJoin?.[0].conflicts[0]?.exceptions.length ?? 0) > 0);
    expect(last(run).sampleJoin![0].conflicts).toEqual([{ group: 'date', take: 'description', count: 1, exceptions: [{ entry: entryId('X01', '2021-05-02'), take: 'results' }] }]);
    // pressing the same side again takes the exception back
    fireEvent.click(side('X01', 'Results'));
    await settled(run, (b) => b.sampleJoin?.[0].conflicts[0]?.exceptions.length === 0);
  });

  it('per sample only (no bulk click): the answer has no take', async () => {
    const run = await load([{ name: 'results.csv', text: dated('2021-05-02') }, { name: 'samples.csv', text: SAMPLES }]);
    await confirm(run);
    fireEvent.click(side('X01', 'Description'));
    await settled(run, (b) => (b.sampleJoin?.[0].conflicts.length ?? 0) > 0);
    expect(last(run).sampleJoin![0].conflicts).toEqual([{ group: 'date', count: 1, exceptions: [{ entry: entryId('X01', '2021-05-02'), take: 'description' }] }]);
    expect(rule('CONV-JOIN-CONFLICT')).toBeNull();
  });

  it('the same pair of values: one pairs item covers both rows, neither is an exception, and it can be taken back', async () => {
    const run = await load([{ name: 'results.csv', text: dated('2021-05-02', '2021-05-02') }, { name: 'samples.csv', text: csvOf(['Sample', 'Station', 'Date'], [['X01', 'ST-1', '2021-05-03'], ['X02', 'ST-2', '2021-05-03']]) }]);
    await confirm(run);
    expect(document.querySelector('[data-testid="join-group"] h4')!.textContent).toBe('Date differs in 2 samples');
    // before a side is chosen for the row the pair button is off
    expect((screen.getByRole('button', { name: 'X01: apply to all with the same pair of values' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(side('X01', 'Description'));
    await settled(run, (b) => (b.sampleJoin?.[0].conflicts.length ?? 0) > 0);
    fireEvent.click(screen.getByRole('button', { name: 'X01: apply to all with the same pair of values' }));
    await settled(run, (b) => (b.sampleJoin?.[0].conflicts[0]?.pairs?.length ?? 0) > 0);
    expect(last(run).sampleJoin![0].conflicts).toEqual([{ group: 'date', count: 2, exceptions: [], pairs: [{ pair: ['2021-05-03', '2021-05-02'], take: 'description' }] }]);
    // the other row shows that the pair decides it
    expect(row('X02').textContent).toContain('chosen for this pair of values');
    expect(rule('CONV-JOIN-CONFLICT')).toBeNull();
    // a choice for one sample wins over its pair
    fireEvent.click(side('X02', 'Results'));
    await settled(run, (b) => (b.sampleJoin?.[0].conflicts[0]?.exceptions.length ?? 0) > 0);
    expect(last(run).sampleJoin![0].conflicts[0].exceptions).toEqual([{ entry: entryId('X02', '2021-05-02'), take: 'results' }]);
    // the pair is taken back
    fireEvent.click(screen.getByRole('button', { name: 'X01: apply to all with the same pair of values' }));
    await settled(run, (b) => b.sampleJoin?.[0].conflicts[0]?.pairs === undefined);
  });

  it('nothing from a conflict group goes to analytics', async () => {
    const run = await load([{ name: 'results.csv', text: dated('2021-05-02') }, { name: 'samples.csv', text: SAMPLES }]);
    await confirm(run);
    fireEvent.click(side('X01', 'Description'));
    await settled(run, (b) => (b.sampleJoin?.[0].conflicts.length ?? 0) > 0);
    const sent = JSON.stringify(analytics.track.mock.calls);
    expect(sent).not.toMatch(/X01|2021-05|ST-1/);
  });
});

describe('samples without a description (P1)', () => {
  const noDescription = csvOf(['Sample', 'Station', 'Date'], [['X01', 'ST-1', '2021-05-03'], ['X03', 'ST-3', '2021-05-05']]);

  it('the button sends resultsOnly; "Ask again" removes it; the per-sheet choices are untouched', async () => {
    const run = await load([{ name: 'results.csv', text: RESULTS }, { name: 'samples.csv', text: noDescription }]);
    await confirm(run);
    expect(rule('CONV-JOIN-NO-DESCRIPTION')).not.toBeNull();
    fireEvent.click(within(rule('CONV-JOIN-NO-DESCRIPTION')!).getByRole('button', { name: T['convert.finding.resultsOnly'] }));
    await settled(run, (b) => b.sampleJoin?.[0].resultsOnly !== undefined);
    expect(last(run).sampleJoin![0].resultsOnly).toBe(1);
    expect(last(run).sampleJoin![0].fromFile).toBeUndefined();
    expect(rule('CONV-JOIN-NO-DESCRIPTION')).toBeNull();
    expect(rule('CONV-JOIN-RESULTS-ONLY')).not.toBeNull();
    // the sheets' own choices are what they were: the requests differ only in the join
    const { sampleJoin: _a, ...withAnswer } = last(run);
    const before = run.bodies.find((b) => b.sampleJoin?.[0].resultsOnly === undefined && b.sampleJoin !== undefined)!;
    const { sampleJoin: _b, ...withoutAnswer } = before;
    expect(withAnswer.sheets).toEqual(withoutAnswer.sheets);
    fireEvent.click(within(rule('CONV-JOIN-RESULTS-ONLY')!).getByRole('button', { name: T['convert.finding.askAgain'] }));
    await settled(run, (b) => b.sampleJoin !== undefined && b.sampleJoin[0].resultsOnly === undefined);
    expect(rule('CONV-JOIN-NO-DESCRIPTION')).not.toBeNull();
    expect(last(run).sampleJoin).toEqual([{ results: R, description: D, keys: [{ results: 0, description: 0 }], conflicts: [] }]);
  });
});

/** a drop's parse result for the model functions */
async function parsedOf(files: { name: string; text: string }[], settings?: string): Promise<ConvertParseResult> {
  const all = settings === undefined ? files : [...files, { name: 'convert-companion.csv', text: settings }];
  return createDirectConvertEngine().parse(all.map((f) => ({ name: f.name, bytes: new TextEncoder().encode(f.text), source: 'dropped' as const })));
}

describe('the companion file (F11)', () => {
  const FILES = [{ name: 'results.csv', text: dated('2021-05-02') }, { name: 'samples.csv', text: SAMPLES }];
  async function saved(conflicts: { group: string; take: 'description' | 'results' | 'mixed'; count: number }[], over: { resultsRows?: number; descriptionRows?: number } = {}): Promise<{ parsed: ConvertParseResult; companion: string }> {
    const first = await parsedOf(FILES);
    const r = first.files.find((f) => f.fileName === 'results.csv')!;
    const d = first.files.find((f) => f.fileName === 'samples.csv')!;
    const companion = writeConvertSidecar({
      sampleJoin: [{ results: ['results.csv', 'results.csv'], description: ['samples.csv', 'samples.csv'], resultsRows: over.resultsRows ?? r.sheets[0].rowCount, descriptionRows: over.descriptionRows ?? d.sheets[0].rowCount, resultsHashes: keyHashes(r.sheets[0].header, [0])!, descriptionHashes: keyHashes(d.sheets[0].header, [0])!, conflicts }],
    });
    return { parsed: await parsedOf(FILES, companion), companion };
  }

  it('a companion that matches names, hashes and rows gives a confirmed join with the answer', async () => {
    const { parsed } = await saved([{ group: 'date', take: 'description', count: 1 }]);
    const joins = initialJoins(parsed);
    expect(joins).toEqual([
      expect.objectContaining({ state: 'confirmed', keys: [{ results: 0, description: 0 }], conflicts: [{ group: 'date', take: 'description', count: 1, exceptions: [] }], results: expect.objectContaining({ sheet: 'results.csv' }), description: expect.objectContaining({ sheet: 'samples.csv' }) }),
    ]);
  });

  it('the same companion against a sheet with another number of rows re-opens the join and the conflict choice', async () => {
    const { parsed } = await saved([{ group: 'date', take: 'description', count: 1 }], { resultsRows: 4 });
    expect(initialJoins(parsed)).toEqual([]);
    const other = await saved([{ group: 'date', take: 'description', count: 1 }], { descriptionRows: 4 });
    expect(initialJoins(other.parsed)).toEqual([]);
  });

  it('a group saved as mixed comes back with the join confirmed and that group unanswered', async () => {
    const { parsed } = await saved([{ group: 'date', take: 'mixed', count: 1 }]);
    const joins = initialJoins(parsed);
    expect(joins).toHaveLength(1);
    expect(joins[0].state).toBe('confirmed');
    expect(joins[0].conflicts).toEqual([]);
  });

  it('a declined pair comes back declined', async () => {
    const first = await parsedOf(FILES);
    const companion = writeConvertSidecar({ sampleJoinNo: [{ results: ['results.csv', 'results.csv'], description: ['samples.csv', 'samples.csv'] }] });
    const joins = initialJoins(await parsedOf(FILES, companion));
    expect(first.settings.sampleJoinNo).toBeUndefined();
    expect(joins).toEqual([expect.objectContaining({ state: 'declined', conflicts: [] })]);
  });

  it('on the page: the dropped companion starts the join confirmed (no request without it), and the panel says it was read from the file', async () => {
    const { companion } = await saved([{ group: 'date', take: 'description', count: 1 }]);
    const run = await load([...FILES, { name: 'convert-companion.csv', text: companion }]);
    await settled(run, (b) => b.sampleJoin !== undefined);
    expect(last(run).sampleJoin![0].conflicts).toEqual([{ group: 'date', take: 'description', count: 1, exceptions: [] }]);
    expect(panel()!.textContent).toContain(T['convert.join.fromFile']);
    expect(rule('CONV-JOIN-CONFLICT')).toBeNull();
  });

  it('the file written after Confirm has a sampleJoin= line and no sample code; after a per-row answer the conflict line says mixed', async () => {
    const run = await load(FILES);
    await confirm(run);
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const first = run.download.mock.calls[0][0] as string;
    expect(first).toMatch(/\(setting\),"?sampleJoin=\d+:\d+:[0-9a-f]{8}:[0-9a-f]{8}:/);
    expect(first).not.toMatch(/X0\d|ST-|2021/);
    fireEvent.click(side('X01', 'Description'));
    await settled(run, (b) => (b.sampleJoin?.[0].conflicts.length ?? 0) > 0);
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const second = run.download.mock.calls[1][0] as string;
    expect(second).toMatch(/sampleJoinConflict=mixed:1:date:/);
    expect(second).not.toMatch(/X0\d|ST-|2021/);
    // a choice for all is written as that side
    fireEvent.click(side('X01', 'Description'));
    await settled(run, (b) => b.sampleJoin?.[0].conflicts.length === 0);
    fireEvent.click(screen.getByRole('button', { name: T['convert.join.conflict.takeResults'] }));
    await settled(run, (b) => b.sampleJoin?.[0].conflicts[0]?.take === 'results');
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    expect(run.download.mock.calls[2][0] as string).toMatch(/sampleJoinConflict=results:1:date:/);
  });

  it('sampleJoinSettingsOf writes the numbers of the answers, names and hashes, never a value', async () => {
    const parsed = await parsedOf(FILES);
    const r = parsed.files[0].fileName === 'results.csv' ? parsed.files[0] : parsed.files[1];
    const d = parsed.files[0].fileName === 'results.csv' ? parsed.files[1] : parsed.files[0];
    const join: JoinChoice = {
      results: { fileId: r.fileId, sheet: 'results.csv' },
      description: { fileId: d.fileId, sheet: 'samples.csv' },
      keys: [{ results: 0, description: 0 }],
      state: 'confirmed',
      conflicts: [{ group: 'date', count: 1, exceptions: [{ entry: 'abc', take: 'results' }], pairs: [{ pair: ['2021-05-03', '2021-05-02'], take: 'results' }] }],
      resultsOnly: 2,
    };
    const out = sampleJoinSettingsOf(parsed, [join]);
    expect(out.sampleJoin).toEqual([expect.objectContaining({ results: ['results.csv', 'results.csv'], description: ['samples.csv', 'samples.csv'], resultsOnly: 2, conflicts: [{ group: 'date', take: 'mixed', count: 1 }] })]);
    expect(JSON.stringify(out)).not.toMatch(/X0\d|2021|abc/);
  });
});

describe('the ledger panel', () => {
  it('after Confirm the description sheet is listed as the description, with the sheet it was lent to', async () => {
    const run = await load([{ name: 'results.csv', text: RESULTS }, { name: 'samples.csv', text: SAMPLES }]);
    await confirm(run);
    const ledger = summary().querySelector('details.convert-ledger') as HTMLElement;
    await waitFor(() => expect(ledger.textContent).toContain(T['convert.ledger.description']));
    expect(ledger.textContent).toContain('lent to results.csv: 2 lines, 2 samples');
  });
});

describe('in the other languages', () => {
  it('each language renders the panel without a placeholder left in the text', async () => {
    for (const lang of ['pl', 'de', 'fr'] as const) {
      setLang(lang);
      const run = await load([{ name: 'results.csv', text: dated('2021-05-02') }, { name: 'samples.csv', text: SAMPLES }], lang);
      await waitFor(() => expect(panel()).not.toBeNull());
      fireEvent.click(button(UI[lang]['convert.join.confirm']));
      await settled(run, (b) => b.sampleJoin !== undefined);
      const text = panel()!.textContent!;
      expect(text, lang).toContain('results.csv');
      expect(text, lang).not.toMatch(/\{[+\w]|convert\.join/);
      cleanup();
    }
  });
});

describe('a description row with a blank key', () => {
  it('uses the existing "leave out and list" button of the description sheet; the join itself is unchanged', async () => {
    const run = await load([{ name: 'results.csv', text: RESULTS }, { name: 'samples.csv', text: csvOf(['Sample', 'Station', 'Date'], [['X01', 'ST-1', '2021-05-03'], ['X02', 'ST-2', '2021-05-04'], ['', 'ST-3', '2021-05-05']]) }]);
    await confirm(run);
    expect(rule('CONV-JOIN-KEY-BLANK')).not.toBeNull();
    fireEvent.click(screen.getByTestId('leave-out'));
    await settled(run, (b) => b.sheets.some((x) => x.leaveOut !== undefined));
    const sheet = last(run).sheets.find((x) => x.sheet === 'samples.csv')!;
    expect(sheet.leaveOut).toEqual([{ reason: 'join-no-key', count: 1 }]);
    expect(rule('CONV-JOIN-KEY-BLANK')).toBeNull();
    expect(rule('CONV-ROW-LEFT-OUT')).not.toBeNull();
    expect(last(run).sampleJoin).toEqual([{ results: R, description: D, keys: [{ results: 0, description: 0 }], conflicts: [] }]);
  });
});

describe('the panel on its own', () => {
  const files = [
    { fileId: 'c1', fileName: 'results.csv', sheets: [{ name: 'results.csv', header: ['Sample', 'Taxon', 'Count'], rowCount: 3 }] },
    { fileId: 'c2', fileName: 'samples.csv', sheets: [{ name: 'samples.csv', header: ['Sample', 'Date'], rowCount: 3 }] },
  ] as never;
  const join: JoinChoice = { results: R, description: D, keys: [{ results: 0, description: 0 }], state: 'confirmed', conflicts: [] };
  const entry = (n: number) => ({ id: `e${n}`, key: `Y${n}`, descriptionLine: n, descriptionText: '2021-05-03', resultsText: `2021-05-0${n}`, resultsLines: [n], samples: [`Y${n}`] });
  const view = (count: number) => ({ proposals: [], conflicts: [{ group: 'date', quantity: 'date', label: 'Date', count, entries: [entry(1), entry(2)], results: R }] }) as never;

  it('says when only some of the samples of a group are listed, and that a choice for all covers the rest', () => {
    const { container } = render(<ConvertSampleJoin view={view(600)} files={files} joins={[join]} onChange={vi.fn()} />);
    expect(container.textContent).toContain('Only the first 2 rows are listed. A choice for all, or for a pair of values, covers the samples not listed too.');
    expect(container.textContent).toContain('0 of 600 samples decided');
    cleanup();
    const all = render(<ConvertSampleJoin view={view(2)} files={files} joins={[join]} onChange={vi.fn()} />);
    expect(all.container.textContent).not.toContain('Only the first');
  });

  it('says a confirmed join was not applied when the settled ledger has no description sheet for it', () => {
    const ledger = [{ file: 'results.csv', sheet: 'results.csv', kind: 'wide' }] as never;
    const { container } = render(<ConvertSampleJoin view={{ proposals: [], conflicts: [], resultsSheets: [] }} files={files} joins={[join]} onChange={vi.fn()} ledger={ledger} />);
    expect(container.textContent).toContain(T['convert.join.notApplied']);
    cleanup();
    const applied = [{ file: 'samples.csv', sheet: 'samples.csv', kind: 'description' }] as never;
    const ok = render(<ConvertSampleJoin view={{ proposals: [], conflicts: [], resultsSheets: [] }} files={files} joins={[join]} onChange={vi.fn()} ledger={applied} />);
    expect(ok.container.textContent).not.toContain(T['convert.join.notApplied']);
    // while a conversion is running the page passes no ledger, and nothing is said
    cleanup();
    const busy = render(<ConvertSampleJoin view={{ proposals: [], conflicts: [], resultsSheets: [] }} files={files} joins={[join]} onChange={vi.fn()} />);
    expect(busy.container.textContent).not.toContain(T['convert.join.notApplied']);
  });

  it('shows nothing when there is no proposal and no decision', () => {
    const { container } = render(<ConvertSampleJoin view={{ proposals: [], conflicts: [], resultsSheets: [] }} files={files} joins={[]} onChange={vi.fn()} />);
    expect(container.textContent).toBe('');
  });
});

describe('review fixes', () => {
  const FILES = [{ name: 'results.csv', text: dated('2021-05-02') }, { name: 'samples.csv', text: SAMPLES }];

  it('an answer whose count no longer matches is no answer: shown as undecided with a note, and a later click does not carry its side', async () => {
    const first = await parsedOf(FILES);
    const r = first.files.find((f) => f.fileName === 'results.csv')!;
    const d = first.files.find((f) => f.fileName === 'samples.csv')!;
    const companion = writeConvertSidecar({
      sampleJoin: [{ results: ['results.csv', 'results.csv'], description: ['samples.csv', 'samples.csv'], resultsRows: r.sheets[0].rowCount, descriptionRows: d.sheets[0].rowCount, resultsHashes: keyHashes(r.sheets[0].header, [0])!, descriptionHashes: keyHashes(d.sheets[0].header, [0])!, conflicts: [{ group: 'date', take: 'description', count: 2 }] }],
    });
    const run = await load([...FILES, { name: 'convert-companion.csv', text: companion }]);
    await settled(run, (b) => b.sampleJoin !== undefined);
    const g = document.querySelector('[data-testid="join-group"]') as HTMLElement;
    expect(rule('CONV-JOIN-CONFLICT')).not.toBeNull();
    expect(g.textContent).toContain('0 of 1 sample decided');
    expect(g.textContent).toContain('An earlier choice was given for 2 samples; this group now has 1.');
    expect(within(g).getByRole('button', { name: T['convert.join.conflict.takeDescription'] }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(side('X01', 'Results'));
    await settled(run, (b) => b.sampleJoin?.[0].conflicts[0]?.exceptions.length === 1);
    expect(last(run).sampleJoin![0].conflicts).toEqual([{ group: 'date', count: 1, exceptions: [{ entry: entryId('X01', '2021-05-02'), take: 'results' }] }]);
    expect(g.textContent).not.toContain('An earlier choice');
  });

  it('a per-sample and a per-pair choice say which side was taken, in the row text', async () => {
    const run = await load([{ name: 'results.csv', text: dated('2021-05-02', '2021-05-02') }, { name: 'samples.csv', text: csvOf(['Sample', 'Station', 'Date'], [['X01', 'ST-1', '2021-05-03'], ['X02', 'ST-2', '2021-05-03']]) }]);
    await confirm(run);
    fireEvent.click(side('X01', 'Results'));
    await settled(run, (b) => (b.sampleJoin?.[0].conflicts.length ?? 0) > 0);
    expect(row('X01').textContent).toContain('from the results (chosen for this sample)');
    fireEvent.click(screen.getByRole('button', { name: 'X01: apply to all with the same pair of values' }));
    await settled(run, (b) => (b.sampleJoin?.[0].conflicts[0]?.pairs?.length ?? 0) > 0);
    expect(row('X02').textContent).toContain('from the results (chosen for this pair of values)');
    expect(rule('CONV-JOIN-CONFLICT')).toBeNull();
    expect(document.querySelector('[data-testid="join-group"]')!.textContent).toContain('2 of 2 samples decided');
  });

  it('Change to another description sheet: the first proposal is gone, and nothing can drop the confirmed join', async () => {
    const run = await load([{ name: 'results.csv', text: RESULTS }, { name: 'samples.csv', text: SAMPLES }, { name: 'other.csv', text: csvOf(['Sample', 'Station'], [['X01', 'ST-1'], ['X02', 'ST-2']]) }]);
    fireEvent.click(within(document.querySelector('[data-testid="join-proposal"]') as HTMLElement).getByRole('button', { name: T['convert.join.change'] }));
    fireEvent.change(screen.getByLabelText(T['convert.join.changeDescription']), { target: { value: 'c3\u0000other.csv' } });
    fireEvent.click(button(T['convert.join.changeUse']));
    await settled(run, (b) => b.sampleJoin !== undefined);
    expect(last(run).sampleJoin![0].description).toEqual({ fileId: 'c3', sheet: 'other.csv' });
    await waitFor(() => expect(panel()!.textContent).not.toContain('samples.csv has'));
    expect(screen.queryByRole('button', { name: T['convert.join.no'] })).toBeNull();
    expect(last(run).sampleJoinNo).toBeUndefined();
  });

  it('a proposal for a results sheet that already has a confirmed join is not shown, even from an older view', () => {
    const files = [
      { fileId: 'c1', fileName: 'results.csv', sheets: [{ name: 'results.csv', header: ['Sample'], rowCount: 1 }] },
      { fileId: 'c2', fileName: 'samples.csv', sheets: [{ name: 'samples.csv', header: ['Sample'], rowCount: 1 }] },
    ] as never;
    const joins: JoinChoice[] = [{ results: R, description: { fileId: 'c3', sheet: 'x' }, keys: [{ results: 0, description: 0 }], state: 'confirmed', conflicts: [] }];
    const v = { proposals: [{ results: R, description: D, keys: [{ results: 0, description: 0 }], covered: 1, samples: 1 }], conflicts: [] } as never;
    render(<ConvertSampleJoin view={v} files={files} joins={joins} onChange={vi.fn()} />);
    expect(screen.queryByTestId('join-proposal')).toBeNull();
  });
});

describe('final review fixes', () => {
  const files = [
    { fileId: 'c1', fileName: 'results.csv', sheets: [{ name: 'results.csv', header: ['Sample', 'Taxon', 'Count'], rowCount: 3 }] },
    { fileId: 'c2', fileName: 'samples.csv', sheets: [{ name: 'samples.csv', header: ['Ref', 'Date'], rowCount: 3 }] },
  ] as never;
  const join: JoinChoice = { results: R, description: D, keys: [{ results: 0, description: 0 }], state: 'confirmed', conflicts: [] };
  const entry = { id: 'e1', key: 'Y1', descriptionLine: 1, descriptionText: '2021-05-03', resultsText: '2021-05-02', resultsLines: [1], samples: ['Y1'] };
  const group = { group: 'date', quantity: 'date', label: 'Date', count: 3, entries: [entry], results: R };

  it('a group the converter did not report on is counted from the page, never as fully decided', () => {
    const { container } = render(<ConvertSampleJoin view={{ proposals: [], conflicts: [group], resultsSheets: [] } as never} files={files} joins={[join]} onChange={vi.fn()} ledger={[]} undecided={[]} />);
    expect(container.textContent).toContain('0 of 3 samples decided');
    expect(container.textContent).not.toContain('3 of 3 samples decided');
  });

  it('undecidedOf: the open count, 0 only when the converter says the group was chosen, nothing otherwise', () => {
    const f = (ruleId: string, params: Record<string, string | number>) => ({ ruleId, file: 'results.csv', sheet: 'results.csv', params });
    const view = (findings: unknown[]) => ({ findings, sampleJoin: { proposals: [], resultsSheets: [], conflicts: [group] } }) as never;
    expect(undecidedOf(view([f('CONV-JOIN-CONFLICT', { group: 'date', count: 2 })]), files)).toEqual([{ results: R, group: 'date', count: 2 }]);
    expect(undecidedOf(view([f('CONV-JOIN-CONFLICT-CHOSEN', { what: 'Date', count: 3 })]), files)).toEqual([{ results: R, group: 'date', count: 0 }]);
    expect(undecidedOf(view([]), files)).toEqual([]);
  });

  it('on the page the open group reads "0 of 1 sample decided" after Confirm and "1 of 1" once chosen', async () => {
    const run = await load([{ name: 'results.csv', text: dated('2021-05-02') }, { name: 'samples.csv', text: SAMPLES }]);
    await confirm(run);
    const g = document.querySelector('[data-testid="join-group"]') as HTMLElement;
    expect(g.textContent).toContain('0 of 1 sample decided');
    fireEvent.click(within(g).getByRole('button', { name: T['convert.join.conflict.takeDescription'] }));
    await settled(run, (b) => (b.sampleJoin?.[0].conflicts.length ?? 0) > 0);
    expect((document.querySelector('[data-testid="join-group"]') as HTMLElement).textContent).toContain('1 of 1 sample decided');
  });

  it('a results sheet with no proposal still offers the form; nothing joins until "Join with these columns"', async () => {
    // the description names its sample column "Ref": no role, no equal header, so no proposal
    const refs = csvOf(['Ref', 'Station', 'Date', 'Latitude', 'Longitude', 'Depth'], [['X01', 'ST-1', '2021-05-03', 61.1, 4.2, 10], ['X02', 'ST-2', '2021-05-04', 61.3, 4.6, 20], ['X03', 'ST-3', '2021-05-05', 61.5, 4.9, 30]]);
    const run = await load([{ name: 'results.csv', text: RESULTS }, { name: 'samples.csv', text: refs }]);
    expect(document.querySelector('[data-testid="join-proposal"]')).toBeNull();
    fireEvent.click(button(T['convert.join.declare'].replace('{results}', 'results.csv')));
    expect(last(run).sampleJoin).toBeUndefined();
    fireEvent.click(button(T['convert.join.changeUse']));
    await settled(run, (b) => b.sampleJoin !== undefined);
    expect(last(run).sampleJoin).toEqual([{ results: R, description: D, keys: [{ results: 0, description: 0 }], conflicts: [] }]);
    expect(rule('CONV-ID-DUPLICATE')).toBeNull();
    expect(panel()!.textContent).toContain('Sample ↔ Ref');
  });

  it('the entry is not offered for a sheet that has a proposal or a confirmed join, and Cancel closes the form', () => {
    const resultsSheets = [R];
    const withProposal = { proposals: [{ results: R, description: D, keys: [{ results: 0, description: 0 }], covered: 2, samples: 2 }], conflicts: [], resultsSheets } as never;
    const a = render(<ConvertSampleJoin view={withProposal} files={files} joins={[]} onChange={vi.fn()} />);
    expect(a.container.querySelector('[data-testid="join-declare"]')).toBeNull();
    cleanup();
    const b = render(<ConvertSampleJoin view={{ proposals: [], conflicts: [], resultsSheets } as never} files={files} joins={[join]} onChange={vi.fn()} />);
    expect(b.container.querySelector('[data-testid="join-declare"]')).toBeNull();
    cleanup();
    const c = render(<ConvertSampleJoin view={{ proposals: [], conflicts: [], resultsSheets } as never} files={files} joins={[]} onChange={vi.fn()} />);
    fireEvent.click(c.container.querySelector('[data-testid="join-declare"] button')!);
    expect(c.container.querySelector('.convert-join-change')).not.toBeNull();
    fireEvent.click(button(T['convert.join.changeCancel']));
    expect(c.container.querySelector('.convert-join-change')).toBeNull();
  });

  it('the entry reads in every language, with no placeholder left', () => {
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      setLang(lang);
      const { container } = render(<ConvertSampleJoin view={{ proposals: [], conflicts: [], resultsSheets: [R] } as never} files={files} joins={[]} onChange={vi.fn()} />);
      const text = container.querySelector('[data-testid="join-declare"]')!.textContent!;
      expect(text, lang).toContain('results.csv');
      expect(text, lang).toBe(UI[lang]['convert.join.declare'].replace('{results}', 'results.csv'));
      expect(text, lang).not.toMatch(/\{/);
      cleanup();
    }
  });

  it('Polish "first N rows" takes the plural form of N', () => {
    const cases: [number, string][] = [[1, 'pierwszy wiersz'], [2, 'pierwsze wiersze'], [5, 'pierwszych wierszy']];
    setLang('pl');
    for (const [n, form] of cases) {
      const g = { ...group, count: 600, entries: Array.from({ length: n }, (_, i) => ({ ...entry, id: `e${i}`, key: `Y${i}` })) };
      const { container } = render(<ConvertSampleJoin view={{ proposals: [], conflicts: [g], resultsSheets: [] } as never} files={files} joins={[join]} onChange={vi.fn()} />);
      expect(container.textContent, String(n)).toContain(`Wypisano tylko ${n} ${form}.`);
      cleanup();
    }
  });
});
