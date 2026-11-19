// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Round 4, Task 15: rows named like a total (a station called Somme) are held and the export waits (CONV-SUMMARY-ROW-UNDECIDED) until the person answers "Leave them out (summary rows)" or "Keep them (a real
// station)", neither preselected; the answer travels with its count, "Ask again" takes it back, and the companion file keeps it by sheet name and row counts. Every value is invented.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { initialChoices, requestOf, summaryOwnerOf, summaryRowsSettingsOf } from '../../src/app/convertModel';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
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

const HEADER = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Depth [m]', 'Species', 'Count'];
const ROWS = ['Seine,k1,2023-06-14,49.5,0.2,5,Calanus finmarchicus,4', 'Somme,k2,2023-06-15,50.2,1.6,5,Calanus finmarchicus,5', 'Somme,k3,2023-06-16,50.2,1.6,6,Calanus finmarchicus,6'];
const TEXT = [HEADER.join(','), ...ROWS].join('\n') + '\n';

let seen: ConvertRequestBody[] = [];
const requests = (): ConvertRequestBody[] => seen;
async function load(files: { name: string; text: string }[], change?: (base: ConvertEngine) => Partial<ConvertEngine>): Promise<{ download: ReturnType<typeof vi.fn> }> {
  const download = vi.fn();
  const base = createDirectConvertEngine();
  seen = [];
  const engine: ConvertEngine = { ...base, ...(change === undefined ? {} : change(base)), convert: (b) => (seen.push(b), base.convert(b)) };
  const view = render(<ConvertPage engine={engine} download={download} downloadFile={vi.fn()} />);
  chooseFiles(view.container, files);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  const confirm = screen.queryByRole('button', { name: /Confirm all shown/ });
  if (confirm !== null) fireEvent.click(confirm);
  for (const kind of screen.queryAllByLabelText(T['convert.quantity.kind'])) fireEvent.change(kind, { target: { value: 'count' } });
  await idle();
  return { download };
}
const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const item = (rule: string): HTMLElement | null => document.querySelector(`li[data-rule="${rule}"]`);
const button = (root: HTMLElement, name: string): HTMLElement => within(root).getByRole('button', { name });
const parsed = (text: string, companion?: string): Promise<ConvertParseResult> =>
  createDirectConvertEngine().parse([{ name: 'hauls.csv', bytes: new TextEncoder().encode(text), source: 'dropped' }, ...(companion === undefined ? [] : [{ name: 'c.csv', bytes: new TextEncoder().encode(companion), source: 'dropped' as const }])]);

describe('the question and the two answers', () => {
  it('offers both answers, neither pressed; "Leave them out" gives the SKIPPED note and "Ask again" asks again', async () => {
    await load([{ name: 'hauls.csv', text: TEXT }]);
    const q = item('CONV-SUMMARY-ROW-UNDECIDED')!;
    expect(q.closest('.convert-findings')?.getAttribute('data-kind')).toBe('error');
    expect(within(q).getAllByRole('button').map((b) => b.textContent)).toEqual([T['convert.finding.summaryLeaveOut'], T['convert.finding.summaryKeep']]);
    // nothing is answered before a click: the request that produced this question carried no answer
    expect(requests().every((b) => b.sheets.every((x) => x.summaryRows === undefined))).toBe(true);
    expect(item('CONV-SUMMARY-ROW-SKIPPED')).toBeNull();
    fireEvent.click(button(q, T['convert.finding.summaryLeaveOut']));
    await waitFor(() => expect(item('CONV-SUMMARY-ROW-SKIPPED')).not.toBeNull());
    await idle();
    expect(item('CONV-SUMMARY-ROW-UNDECIDED')).toBeNull();
    expect(item('CONV-SUMMARY-ROW-SKIPPED')?.textContent).toContain('left out as summary rows');
    fireEvent.click(button(item('CONV-SUMMARY-ROW-SKIPPED')!, T['convert.finding.askAgain']));
    await waitFor(() => expect(item('CONV-SUMMARY-ROW-UNDECIDED')).not.toBeNull());
    expect(item('CONV-SUMMARY-ROW-SKIPPED')).toBeNull();
  });

  it('"Keep them" gives the SKIPPED note with the keep wording', async () => {
    await load([{ name: 'hauls.csv', text: TEXT }]);
    fireEvent.click(button(item('CONV-SUMMARY-ROW-UNDECIDED')!, T['convert.finding.summaryKeep']));
    await waitFor(() => expect(item('CONV-SUMMARY-ROW-SKIPPED')).not.toBeNull());
    await idle();
    expect(item('CONV-SUMMARY-ROW-SKIPPED')?.textContent).toContain('real stations or samples');
  });

  it('the request carries the answer with the count the question named, and nothing before it', async () => {
    const p = await parsed(TEXT);
    const choices = initialChoices(p);
    const key = Object.keys(choices)[0];
    const body = (c: typeof choices): ReturnType<typeof requestOf> => requestOf({ parsed: p, mappings: {}, choices: c, options: { fullList: false, prefixStation: false, flatten: { station: false, cruise: false } }, approved: {}, confirmed: {}, joins: [] } as never);
    expect(body(choices).sheets.every((s) => s.summaryRows === undefined)).toBe(true);
    const asked = body({ ...choices, [key]: { ...choices[key], summaryRows: { answer: 'leave-out', count: 2 } } });
    expect(asked.sheets[0].summaryRows).toEqual({ answer: 'leave-out', count: 2 });
  });
});

describe('the companion file', () => {
  it('writes the answer by sheet name and counts, never a row label', async () => {
    const run = await load([{ name: 'hauls.csv', text: TEXT }]);
    fireEvent.click(button(item('CONV-SUMMARY-ROW-UNDECIDED')!, T['convert.finding.summaryKeep']));
    await waitFor(() => expect(item('CONV-SUMMARY-ROW-SKIPPED')).not.toBeNull());
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const text = run.download.mock.calls[0][0] as string;
    expect(text).toContain('summaryRows=keep:2:3:hauls.csv');
    expect(text).not.toContain('Somme');
  });

  it('is applied for the same sheet, rows and count ("from the file", with "Ask again")', async () => {
    await load([{ name: 'hauls.csv', text: TEXT }, { name: 'c.csv', text: writeConvertSidecar({ summaryRows: [{ sheet: 'hauls.csv', answer: 'leave-out', count: 2, rows: 3 }] }) }]);
    await waitFor(() => expect(item('CONV-SUMMARY-ROW-SKIPPED')?.textContent).toContain('companion file'));
    expect(item('CONV-SUMMARY-ROW-UNDECIDED')).toBeNull();
    fireEvent.click(button(item('CONV-SUMMARY-ROW-SKIPPED')!, T['convert.finding.askAgain']));
    await waitFor(() => expect(item('CONV-SUMMARY-ROW-UNDECIDED')).not.toBeNull());
  });

  it('is not applied, and the question stays visible, when a row is added or the count changed', async () => {
    const more = TEXT + 'Seine,k4,2023-06-17,49.5,0.2,7,Calanus finmarchicus,7\n';
    await load([{ name: 'hauls.csv', text: more }, { name: 'c.csv', text: writeConvertSidecar({ summaryRows: [{ sheet: 'hauls.csv', answer: 'leave-out', count: 2, rows: 3 }] }) }]);
    expect(item('CONV-SUMMARY-ROW-UNDECIDED')).not.toBeNull();
    expect(item('CONV-SUMMARY-ROW-SKIPPED')).toBeNull();
    cleanup();
    // same number of rows but another number of held rows: the converter does not honour it
    const other = TEXT.replace('Seine,k1', 'Somme,k1');
    await load([{ name: 'hauls.csv', text: other }, { name: 'c.csv', text: writeConvertSidecar({ summaryRows: [{ sheet: 'hauls.csv', answer: 'leave-out', count: 2, rows: 3 }] }) }]);
    expect(item('CONV-SUMMARY-ROW-UNDECIDED')).not.toBeNull();
    expect(item('CONV-SUMMARY-ROW-SKIPPED')).toBeNull();
  });

  it('summaryRowsSettingsOf keeps only an answer the converter said for a sheet in use', async () => {
    const p = await parsed(TEXT, writeConvertSidecar({ summaryRows: [{ sheet: 'hauls.csv', answer: 'keep', count: 2, rows: 3 }] }));
    const choices = initialChoices(p);
    const key = Object.keys(choices)[0];
    expect(choices[key].summaryRows).toEqual({ answer: 'keep', count: 2, fromFile: true });
    const said = [{ ruleId: 'CONV-SUMMARY-ROW-SKIPPED', file: 'hauls.csv', sheet: 'hauls.csv', params: { held: 2, count: 2, answer: 'keep' } }] as never;
    expect(summaryRowsSettingsOf(p, choices, said)).toEqual([{ sheet: 'hauls.csv', answer: 'keep', count: 2, rows: 3 }]);
    expect(summaryRowsSettingsOf(p, choices, [])).toEqual([]);
    expect(summaryRowsSettingsOf(p, { ...choices, [key]: { ...choices[key], use: false } }, said)).toEqual([]);
  });
});

describe('a joined workbook: the answer is stored on the results sheet whichever half asked', () => {
  const TAX = 'Calanus finmarchicus';
  const RESULTS = csvOf(['Sample', 'Taxon', 'Count'], [['X01', TAX, 12], ['X02', TAX, 7]]);
  // the description holds a sample called Total that the results sheet does not count: the question is on the description sheet
  const SAMPLES = csvOf(['Sample', 'Station', 'Date', 'Latitude', 'Longitude', 'Depth'], [['X01', 'ST-1', '2021-05-03', 61.1, 4.2, 10], ['X02', 'ST-2', '2021-05-04', 61.3, 4.6, 20], ['Total', 'ST-3', '2021-05-05', 61.5, 4.9, 30]]);

  it('"Leave them out" on the description half is sent on the results sheet, both halves read the answer, and "Ask again" clears it', async () => {
    const base = createDirectConvertEngine();
    const bodies: ConvertRequestBody[] = [];
    const engine: ConvertEngine = { ...base, convert: (b) => (bodies.push(b), base.convert(b)) };
    const download = vi.fn();
    const view = render(<ConvertPage engine={engine} download={download} downloadFile={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'results.csv', text: RESULTS }, { name: 'samples.csv', text: SAMPLES }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    const confirmAll = screen.queryByRole('button', { name: /Confirm all shown/ });
    if (confirmAll !== null) fireEvent.click(confirmAll);
    for (const kind of screen.queryAllByLabelText(T['convert.quantity.kind'])) fireEvent.change(kind, { target: { value: 'count' } });
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.join.confirm'] }));
    await waitFor(() => expect(item('CONV-SUMMARY-ROW-UNDECIDED')?.textContent).toContain('samples.csv'));
    await idle();
    const last = (): ConvertRequestBody => bodies[bodies.length - 1];
    expect(last().sheets.every((x) => x.summaryRows === undefined)).toBe(true);
    fireEvent.click(button(item('CONV-SUMMARY-ROW-UNDECIDED')!, T['convert.finding.summaryLeaveOut']));
    await waitFor(() => expect(item('CONV-SUMMARY-ROW-SKIPPED')).not.toBeNull());
    await idle();
    expect(last().sheets.filter((x) => x.summaryRows !== undefined).map((x) => [x.sheet, x.summaryRows])).toEqual([['results.csv', { answer: 'leave-out', count: 1 }]]);
    expect(item('CONV-SUMMARY-ROW-UNDECIDED')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    expect(download.mock.calls[0][0]).toContain('summaryRows=leave-out:1:2:results.csv');
    fireEvent.click(button(item('CONV-SUMMARY-ROW-SKIPPED')!, T['convert.finding.askAgain']));
    await waitFor(() => expect(item('CONV-SUMMARY-ROW-UNDECIDED')).not.toBeNull());
    await idle();
    expect(last().sheets.every((x) => x.summaryRows === undefined)).toBe(true);
  });
});

describe('the two labels in four languages', () => {
  it('are written in en, pl, de and fr, and the two answers differ', () => {
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      const a = UI[lang]['convert.finding.summaryLeaveOut'];
      const b = UI[lang]['convert.finding.summaryKeep'];
      expect(a.length).toBeGreaterThan(5);
      expect(b.length).toBeGreaterThan(5);
      expect(a).not.toBe(b);
      if (lang !== 'en') expect([a, b]).not.toEqual([UI.en['convert.finding.summaryLeaveOut'], UI.en['convert.finding.summaryKeep']]);
    }
  });
});

describe('the answer after a re-read of the file (decimal and encoding picks)', () => {
  const HDR = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count', 'Chlorophyll'];
  const SEMI = [HDR.join(';'), 'Seine;k1;2023-06-14;55,5;3,5;Calanus finmarchicus;4;1,250', 'Somme;k2;2023-06-15;56,5;3,5;Calanus finmarchicus;5;2,000', 'Somme;k3;2023-06-16;56,5;3,5;Calanus finmarchicus;6;1,500'].join('\n') + '\n';
  const lastBody = (): ConvertRequestBody => seen[seen.length - 1];

  it('survives a decimal answer (the file is read again): the request still carries it and the note stays', async () => {
    await load([{ name: 'hauls.csv', text: SEMI }]);
    fireEvent.click(button(item('CONV-SUMMARY-ROW-UNDECIDED')!, T['convert.finding.summaryLeaveOut']));
    await waitFor(() => expect(item('CONV-SUMMARY-ROW-SKIPPED')).not.toBeNull());
    await idle();
    fireEvent.click(button(item('IN-DECIMAL-AMBIGUOUS')!, T['convert.finding.thousandsSeparator']));
    await waitFor(() => expect(item('CONV-DECIMAL-DECLARED')).not.toBeNull());
    await idle();
    expect(lastBody().sheets[0].summaryRows).toEqual({ answer: 'leave-out', count: 2 });
    expect(item('CONV-SUMMARY-ROW-SKIPPED')).not.toBeNull();
    expect(item('CONV-SUMMARY-ROW-UNDECIDED')).toBeNull();
  });

  it('a sheet whose number of columns changed under a pick starts again: the answer is gone, the question is visible and the request carries none', async () => {
    await load([{ name: 'hauls.csv', text: SEMI }], (base) => ({
      decimalChoice: async (fileId, sheet, index, reading) => {
        const f = await base.decimalChoice(fileId, sheet, index, reading);
        const name = f.sheets[0].name;
        const at = f.sheets[0].header.length;
        return {
          ...f,
          sheets: [{ ...f.sheets[0], header: [...f.sheets[0].header, 'Extra'] }],
          mappings: [{ sheet: name, columns: [...f.mappings[0].columns, { index: at, header: 'Extra', role: { kind: 'ignore' } }] }],
          proposals: { [name]: [...f.proposals[name], { index: at, header: 'Extra', cleanHeader: 'Extra', role: { kind: 'ignore' }, confidence: 'high', reason: 'x', reasonCode: 'text-column' } as never] },
          samples: { [name]: [...f.samples[name], []] },
        };
      },
    }));
    fireEvent.click(button(item('CONV-SUMMARY-ROW-UNDECIDED')!, T['convert.finding.summaryKeep']));
    await waitFor(() => expect(item('CONV-SUMMARY-ROW-SKIPPED')).not.toBeNull());
    await idle();
    expect(lastBody().sheets[0].summaryRows).toEqual({ answer: 'keep', count: 2 });
    fireEvent.click(button(item('IN-DECIMAL-AMBIGUOUS')!, T['convert.finding.thousandsSeparator']));
    await waitFor(() => expect(lastBody().sheets[0].summaryRows).toBeUndefined());
    await idle();
    await waitFor(() => expect(item('CONV-SUMMARY-ROW-UNDECIDED')).not.toBeNull());
    expect(item('CONV-SUMMARY-ROW-SKIPPED')).toBeNull();
    expect(lastBody().sheets[0].summaryRows).toBeUndefined();
  });
});

describe('one description joined to two results sheets', () => {
  const TAX = 'Calanus finmarchicus';
  const R1 = csvOf(['Sample', 'Taxon', 'Count'], [['X01', TAX, 12], ['Total', TAX, 7]]);
  const R2 = csvOf(['Sample', 'Taxon', 'Count'], [['X02', TAX, 3], ['Total', TAX, 4], ['Somme', TAX, 5]]);
  const D = csvOf(['Sample', 'Station', 'Date', 'Latitude', 'Longitude', 'Depth'], [['X01', 'ST-1', '2021-05-03', 61.1, 4.2, 10], ['X02', 'ST-2', '2021-05-04', 61.3, 4.6, 20], ['Total', 'ST-3', '2021-05-05', 61.5, 4.9, 30], ['Somme', 'ST-4', '2021-05-06', 61.7, 4.9, 30]]);

  it('each question is answered on the results sheet whose run raised it, and both close', async () => {
    await load([{ name: 'r1.csv', text: R1 }, { name: 'r2.csv', text: R2 }, { name: 'samples.csv', text: D }]);
    for (const b of screen.queryAllByRole('button', { name: T['convert.join.confirm'] })) fireEvent.click(b);
    await waitFor(() => expect(seen[seen.length - 1].sampleJoin?.length).toBe(2));
    await idle();
    const open = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('li[data-rule="CONV-SUMMARY-ROW-UNDECIDED"]')];
    for (let guard = 0; guard < 6 && open().length > 0; guard++) {
      fireEvent.click(button(open()[0], T['convert.finding.summaryLeaveOut']));
      await idle();
    }
    expect(open()).toHaveLength(0);
    const answered = seen[seen.length - 1].sheets.filter((x) => x.summaryRows !== undefined).map((x) => [x.sheet, x.summaryRows!.count]).sort();
    expect(answered).toEqual([['r1.csv', 1], ['r2.csv', 2]]);
  });
});

describe('which sheet carries the answer', () => {
  const p = { files: [{ fileId: 'c1', fileName: 'r1.csv' }, { fileId: 'c2', fileName: 'r2.csv' }, { fileId: 'c3', fileName: 'samples.csv' }] } as never;
  const finding = (params: Record<string, unknown>, file: string, sheet: string) => ({ ruleId: 'CONV-SUMMARY-ROW-UNDECIDED', file, sheet, params }) as never;
  it('a description-half finding names the results sheet of the run that raised it, never the first join', () => {
    expect(summaryOwnerOf(p, finding({ held: 1, resultsFile: 'r2.csv', resultsSheet: 'r2.csv' }, 'samples.csv', 'samples.csv'))).toEqual({ fileId: 'c2', sheet: 'r2.csv' });
    expect(summaryOwnerOf(p, finding({ held: 1, resultsFile: 'r1.csv', resultsSheet: 'r1.csv' }, 'samples.csv', 'samples.csv'))).toEqual({ fileId: 'c1', sheet: 'r1.csv' });
  });
  it('an unjoined finding is answered on its own sheet', () => {
    expect(summaryOwnerOf(p, finding({ held: 2 }, 'r1.csv', 'r1.csv'))).toEqual({ fileId: 'c1', sheet: 'r1.csv' });
  });
});
