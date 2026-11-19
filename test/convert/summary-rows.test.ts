// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// V1: a row whose station or sample cell is a total word (Total, Suma, Razem, Summe, Gesamt, Somme), or a label of a statistics block (Mean, SD ...), is never skipped on the converter's own word.
// It is held back and the export waits (CONV-SUMMARY-ROW-UNDECIDED) until the person answers for the sheet: leave them out (summary rows) or keep them (a real station or sample). Every value is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { judge, policyOf } from '../../src/core/convert/policy';
import { decideRows, notWrittenRows } from '../../src/core/convert/notWritten';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { Finding } from '../../src/core/types';
import { pivotConvertFile } from '../../src/core/convert/pivot';
import { turnConvertFile } from '../../src/core/convert/turn';
import { xlsxFile } from '../helpers/files';
import type { ParsedFile } from '../../src/core/types';
import { joinInputs } from '../../src/core/convert/sampleJoin';
import type { SampleJoinRequestCore } from '../../src/core/convert/sampleJoin';
import { descriptionInput, resultsInput } from './joinFixtures';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const find = (fs: readonly Finding[], id: string) => fs.filter((f) => f.ruleId === id);
const HEADER = ['Cruise', 'Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Oithona similis'];
const wide = (rows: Cell[][], extra: Partial<ConvertSheetInput> = {}) => sheetInput(fileOf(HEADER, rows), { quantity: { kind: 'count' }, ...extra });
const sampleIds = (r: ReturnType<typeof convert>) => r.events.filter((e) => e.eventType === 'sample').map((e) => e.id);
const stationIds = (r: ReturnType<typeof convert>) => r.events.filter((e) => e.eventType !== 'sample').map((e) => e.id);
const notWritten = (sin: ConvertSheetInput, r: ReturnType<typeof convert>) => [...notWrittenRows(r.ledger, [sin])].filter((x) => x.kind === 'line');

// a bay called Somme, a river mouth, another
const BAY: Cell[][] = [
  ['CR', 'Somme', 'a', 50.2, 1.6, '2020-05-01', 4, 5],
  ['CR', 'Somme', 'b', 50.2, 1.6, '2020-05-02', 6, 7],
  ['CR', 'Authie', 'c', 50.3, 1.5, '2020-05-03', 1, 2],
  ['CR', 'Canche', 'd', 50.5, 1.6, '2020-05-04', 3, 4],
];

describe('a station named like a total word waits for the person', () => {
  it('with no answer the rows are held, listed as summary-undecided, and the export is blocked: nothing is left out on the word', () => {
    const sin = wide(BAY);
    const r = convert({ sheets: [sin], options: {} });
    const q = find(r.findings, 'CONV-SUMMARY-ROW-UNDECIDED');
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ severity: 'warning', lines: [2, 3], value: 'Somme', params: { count: 2 } });
    expect(policyOf(q[0])).toBe('block');
    expect(judge(r.findings).blocking.map((x) => x.ruleId)).toContain('CONV-SUMMARY-ROW-UNDECIDED');
    expect(find(r.findings, 'CONV-SUMMARY-ROW-SKIPPED')).toEqual([]);
    expect(sampleIds(r)).toEqual(['c', 'd']);
    expect(notWritten(sin, r).map((x) => [x.line, x.reason])).toEqual([[2, 'summary-undecided'], [3, 'summary-undecided']]);
    // the question is the one that covers the lines: no second question for the same rows
    expect(find(decideRows(r.ledger, [sin], r.findings).findings, 'CONV-ROW-NOT-UNDERSTOOD')).toEqual([]);
  });

  it('"leave them out" leaves the two rows out as summary rows, listed, and the export is not blocked or waiting for an acceptance', () => {
    const sin = wide(BAY, { summaryRows: { answer: 'leave-out', count: 2 } });
    const r = convert({ sheets: [sin], options: {} });
    expect(find(r.findings, 'CONV-SUMMARY-ROW-UNDECIDED')).toEqual([]);
    const s = find(r.findings, 'CONV-SUMMARY-ROW-SKIPPED');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ severity: 'info', lines: [2, 3], value: 'Somme', params: { count: 2, held: 2, answer: 'leave-out' } });
    expect(s[0].params.fromFile).toBeUndefined();
    expect(policyOf(s[0])).toBe('show');
    const j = judge(r.findings);
    expect(j.blocking.map((x) => x.ruleId)).not.toContain('CONV-SUMMARY-ROW-SKIPPED');
    expect(j.acceptRules).not.toContain('CONV-SUMMARY-ROW-SKIPPED');
    expect(j.showOnly.map((x) => x.ruleId)).toContain('CONV-SUMMARY-ROW-SKIPPED');
    expect(sampleIds(r)).toEqual(['c', 'd']);
    expect(notWritten(sin, r).map((x) => [x.line, x.reason, x.status])).toEqual([[2, 'summary-row', 'understood'], [3, 'summary-row', 'understood']]);
    expect(renderConvertPlain(s[0], 'en')).toMatch(/^As you chose, 2 rows \(Somme\) in lines 2–3 were left out as summary rows/);
  });

  it('"keep" converts them as ordinary rows: samples at station Somme, no left-out line, no KEPT note', () => {
    const sin = wide(BAY, { summaryRows: { answer: 'keep', count: 2 } });
    const r = convert({ sheets: [sin], options: {} });
    expect(sampleIds(r)).toEqual(['a', 'b', 'c', 'd']);
    expect(stationIds(r).some((id) => id.includes('Somme'))).toBe(true);
    const s = find(r.findings, 'CONV-SUMMARY-ROW-SKIPPED');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ lines: [2, 3], params: { count: 2, answer: 'keep' } });
    expect(renderConvertPlain(s[0], 'en')).toMatch(/^As you said, 2 rows \(Somme\) in lines 2–3 are real stations or samples and are converted/);
    expect(find(r.findings, 'CONV-SUMMARY-ROW-KEPT')).toEqual([]);
    expect(find(r.findings, 'CONV-SUMMARY-ROW-UNDECIDED')).toEqual([]);
    expect(notWritten(sin, r)).toEqual([]);
    expect(judge(r.findings).blocking.map((x) => x.ruleId)).not.toContain('CONV-SUMMARY-ROW-SKIPPED');
    expect(r.ledger[0].lines.filter((l) => l.fate !== 'written')).toEqual([]);
  });

  it('a "keep" answer leaves no special handling: the rows count in the visits and the stations like the same rows under another name', () => {
    // the same code twice at one station on two dates is a revisit: the rows of station "Somme" are read exactly like those of station "Seine"
    const rows = (st: string): Cell[][] => [['CR', st, 'v', 50.2, 1.6, '2020-05-01', 4, 5], ['CR', st, 'v', 50.2, 1.6, '2020-06-01', 6, 7], ['CR', 'Authie', 'c', 50.3, 1.5, '2020-05-03', 1, 2]];
    const kept = convert({ sheets: [wide(rows('Somme'), { summaryRows: { answer: 'keep', count: 2 } })], options: {} });
    const named = convert({ sheets: [wide(rows('Seine'))], options: {} });
    const norm = (r: ReturnType<typeof convert>, from: string, to: string) => sampleIds(r).map((id) => id.replace(from, to));
    expect(norm(kept, 'Somme', 'Seine')).toEqual(norm(named, 'Somme', 'Seine'));
    expect(kept.occurrences.length).toBe(named.occurrences.length);
    expect(find(kept.findings, 'CONV-ID-REVISIT').length).toBe(find(named.findings, 'CONV-ID-REVISIT').length);
  });

  it('an answer for another number of rows does not hold: the question is asked again', () => {
    for (const count of [3, 1, 0]) {
      const r = convert({ sheets: [wide(BAY, { summaryRows: { answer: 'leave-out', count } })], options: {} });
      expect(find(r.findings, 'CONV-SUMMARY-ROW-UNDECIDED'), `count ${count}`).toHaveLength(1);
      expect(find(r.findings, 'CONV-SUMMARY-ROW-SKIPPED'), `count ${count}`).toEqual([]);
      expect(sampleIds(r), `count ${count}`).toEqual(['c', 'd']);
    }
    // an answer on a sheet with no such rows is untouched and says nothing
    const none = convert({ sheets: [wide(BAY.slice(2), { summaryRows: { answer: 'leave-out', count: 2 } })], options: {} });
    expect(find(none.findings, 'CONV-SUMMARY-ROW-UNDECIDED')).toEqual([]);
    expect(find(none.findings, 'CONV-SUMMARY-ROW-SKIPPED')).toEqual([]);
  });

  it('an answer read from a companion file says so, and holds only for its count', () => {
    const s = find(convert({ sheets: [wide(BAY, { summaryRows: { answer: 'leave-out', count: 2, fromFile: true } })], options: {} }).findings, 'CONV-SUMMARY-ROW-SKIPPED');
    expect(s[0].params).toMatchObject({ count: 2, answer: 'leave-out', fromFile: 'yes' });
    expect(renderConvertPlain(s[0], 'en')).toContain('companion file');
    const k = find(convert({ sheets: [wide(BAY, { summaryRows: { answer: 'keep', count: 2, fromFile: true } })], options: {} }).findings, 'CONV-SUMMARY-ROW-SKIPPED');
    expect(renderConvertPlain(k[0], 'en')).toContain('companion file');
    const changed = convert({ sheets: [wide([...BAY, ['CR', 'Total', 'e', null, null, null, 1, 1]], { summaryRows: { answer: 'leave-out', count: 2, fromFile: true } })], options: {} });
    expect(find(changed.findings, 'CONV-SUMMARY-ROW-UNDECIDED')[0].params.count).toBe(3);
  });

  it('every total word in any case is held, and a station that only contains one ("Total Bay", "Summe-2") is not', () => {
    const rows: Cell[][] = [['CR', 'S1', 'a', 1, 2, '2020-01-01', 4, 5]];
    for (const w of ['Total', 'SUMA', 'razem', 'Summe', 'Gesamt', 'Somme']) rows.push(['CR', w, `x-${w}`, 1, 2, '2020-01-02', 1, 1]);
    rows.push(['CR', 'Total Bay', 'y', 1, 2, '2020-01-03', 1, 1]);
    const r = convert({ sheets: [wide(rows)], options: {} });
    const q = find(r.findings, 'CONV-SUMMARY-ROW-UNDECIDED');
    expect(q).toHaveLength(1);
    expect(q[0].lines).toEqual([3, 4, 5, 6, 7, 8]);
    expect(sampleIds(r)).toEqual(['a', 'y']);
  });
});

describe('statistics rows follow the same rule', () => {
  const stat = (w: string, ...v: Cell[]): Cell[] => ['', w, w, null, null, null, ...v];
  const BASE: Cell[][] = [['CR', 'S1', 'a', 1, 2, '2020-01-01', 4, 5], ['CR', 'S2', 'b', 1, 2, '2020-01-02', 6, 7]];

  it('a Mean / SD block is one question, and the answer decides', () => {
    const rows = [...BASE, stat('Mean', 5, 6), stat('SD', 1, 1)];
    const asked = convert({ sheets: [wide(rows)], options: {} });
    const q = find(asked.findings, 'CONV-SUMMARY-ROW-UNDECIDED');
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ lines: [4, 5], value: 'Mean, SD', params: { count: 2 } });
    expect(sampleIds(asked)).toEqual(['a', 'b']);
    expect(judge(asked.findings).blocking.map((x) => x.ruleId)).toContain('CONV-SUMMARY-ROW-UNDECIDED');
    const out = convert({ sheets: [wide(rows, { summaryRows: { answer: 'leave-out', count: 2 } })], options: {} });
    expect(find(out.findings, 'CONV-SUMMARY-ROW-SKIPPED')[0].params).toMatchObject({ count: 2, answer: 'leave-out' });
    expect(sampleIds(out)).toEqual(['a', 'b']);
    const kept = convert({ sheets: [wide(rows, { summaryRows: { answer: 'keep', count: 2 } })], options: {} });
    expect(sampleIds(kept)).toEqual(['a', 'b', 'Mean', 'SD']);
    expect(find(kept.findings, 'CONV-SUMMARY-ROW-KEPT')).toEqual([]);
  });

  it('a lone ambiguous label (Max) stays CONV-SUMMARY-ROW-KEPT, accepted as before, and is never asked', () => {
    const r = convert({ sheets: [wide([BASE[0], stat('Max', 9, 9), BASE[1]])], options: {} });
    expect(find(r.findings, 'CONV-SUMMARY-ROW-UNDECIDED')).toEqual([]);
    expect(find(r.findings, 'CONV-SUMMARY-ROW-SKIPPED')).toEqual([]);
    const k = find(r.findings, 'CONV-SUMMARY-ROW-KEPT');
    expect(k).toHaveLength(1);
    expect(policyOf(k[0])).toBe('accept');
    expect(sampleIds(r)).toEqual(['a', 'Max', 'b']);
  });

  it('a long sheet: Mean and SD at the foot are asked, then follow the answer', () => {
    const f = fileOf(['Sample', 'Species', 'Count', 'Date', 'Latitude', 'Longitude'], [
      ['a', 'Calanus finmarchicus', 3, '2020-01-01', 1, 2],
      ['b', 'Calanus finmarchicus', 5, '2020-01-02', 1, 2],
      ['Mean', 'Calanus finmarchicus', 4, null, null, null],
      ['SD', 'Calanus finmarchicus', 1.4, null, null, null],
    ]);
    const asked = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' }, shape: 'long' })], options: {} });
    expect(find(asked.findings, 'CONV-SUMMARY-ROW-UNDECIDED')[0]).toMatchObject({ lines: [4, 5], value: 'Mean, SD' });
    expect(asked.occurrences).toHaveLength(2);
    const out = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' }, shape: 'long', summaryRows: { answer: 'leave-out', count: 2 } })], options: {} });
    expect(out.occurrences).toHaveLength(2);
    expect(find(out.findings, 'CONV-SUMMARY-ROW-SKIPPED')).toHaveLength(1);
  });
});

describe('a profile sheet with a Total station', () => {
  const header = ['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]'];
  const rows: Cell[][] = [['CR1', 'S1', 55.5, 2.5, '2023-06-14', 0, 11.2], ['CR1', 'S1', 55.5, 2.5, '2023-06-14', 10, 10.9], ['CR1', 'Total', null, null, null, null, 22.1]];
  const sheet = (extra: Partial<ConvertSheetInput> = {}) => sheetInput(fileOf(header, rows, 'CTD'), { profile: { depthIds: true }, ...extra });

  it('is the same question; the answer leaves the line out as a summary row, or reads it as a station', () => {
    const sin = sheet();
    const asked = convert({ sheets: [sin], options: {} });
    expect(find(asked.findings, 'CONV-SUMMARY-ROW-UNDECIDED')[0]).toMatchObject({ lines: [4], value: 'Total', params: { count: 1 } });
    expect(judge(asked.findings).blocking.map((x) => x.ruleId)).toContain('CONV-SUMMARY-ROW-UNDECIDED');
    expect(notWritten(sin, asked).map((x) => [x.line, x.reason])).toEqual([[4, 'summary-undecided']]);
    const out = sheet({ summaryRows: { answer: 'leave-out', count: 1 } });
    const o = convert({ sheets: [out], options: {} });
    expect(find(o.findings, 'CONV-SUMMARY-ROW-SKIPPED')[0].params).toMatchObject({ answer: 'leave-out', count: 1 });
    expect(notWritten(out, o).map((x) => [x.line, x.reason])).toEqual([[4, 'summary-row']]);
    const levels = (r: ReturnType<typeof convert>) => r.events.filter((e) => e.eventType === 'profile level').length;
    expect(levels(o)).toBe(2);
    const kept = sheet({ summaryRows: { answer: 'keep', count: 1 } });
    const k = convert({ sheets: [kept], options: {} });
    expect(find(k.findings, 'CONV-SUMMARY-ROW-SKIPPED')[0].params).toMatchObject({ answer: 'keep', count: 1 });
    // an ordinary row now: no summary reason; what becomes of it is what becomes of any station row (here no sample code, said by its own rule)
    expect(notWritten(kept, k).map((x) => x.reason)).not.toContain('summary-row');
    expect(notWritten(kept, k).map((x) => x.reason)).not.toContain('summary-undecided');
  });
});

describe('a pivoted and a turned sheet name the lines of the file, and the ledger balances', () => {
  const balanced = (r: ReturnType<typeof convert>) => {
    for (const l of r.ledger) expect(l.rows.unexplained, l.sheet).toBe(0);
  };

  it('pivoted long sheet: the station Total is asked about with the lines of the long file, and the answers follow', () => {
    const H = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Parameter', 'Unit', 'Value'];
    const R: Cell[][] = [
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Temperature', 'degC', 8.1],
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Salinity', 'PSU', 33.2],
      ['Total', '2023-06-14', 55.5, 2.5, 5, 'Temperature', 'degC', 16.2],
      ['Total', '2023-06-14', 55.5, 2.5, 5, 'Salinity', 'PSU', 66.4],
    ];
    const file = pivotConvertFile(fileOf(H, R, 'S'));
    const base = { profile: { depthIds: true } };
    const asked = convert({ sheets: [sheetInput(file, base)], options: {} });
    const q = find(asked.findings, 'CONV-SUMMARY-ROW-UNDECIDED');
    expect(q).toHaveLength(1);
    expect(q[0].lines).toEqual([4, 5]);
    expect(judge(asked.findings).blocking.map((x) => x.ruleId)).toContain('CONV-SUMMARY-ROW-UNDECIDED');
    balanced(asked);
    const sin = sheetInput(file, { ...base, summaryRows: { answer: 'leave-out', count: Number(q[0].params.count) } });
    const r = convert({ sheets: [sin], options: {} });
    expect(find(r.findings, 'CONV-SUMMARY-ROW-UNDECIDED')).toEqual([]);
    expect(find(r.findings, 'CONV-SUMMARY-ROW-SKIPPED')[0].lines).toEqual([4, 5]);
    const list = notWritten(sin, r).filter((x) => x.reason === 'summary-row');
    expect(list.map((x) => x.line)).toEqual([4, 5]);
    expect(list.every((x) => x.status === 'understood')).toBe(true);
    balanced(r);
    expect(r.measurements.map((m) => String((m as { value?: unknown }).value ?? '')).join(' ')).not.toMatch(/16\.2|66\.4/);
  });

  it('turned sheet: a sample called Total is asked about, with the source line of its column and not a synthetic line', () => {
    const raw = xlsxFile('book.xlsx', { Taxa: [['Taxon', 'S1', 'S2', 'Total'], ['Calanus finmarchicus', 4, 5, 9], ['Oithona similis', 1, 2, 3]] });
    const file = turnConvertFile(raw, { Taxa: { nameColumn: 0, notSamples: [] } });
    const of: ParsedFile = { ...file, sheets: file.sheets.filter((s) => s.name === 'Taxa') };
    const base = { shape: 'wide' as const, quantity: { kind: 'count' as const } };
    const asked = convert({ sheets: [sheetInput(of, base)], options: {} });
    const q = find(asked.findings, 'CONV-SUMMARY-ROW-UNDECIDED');
    expect(q).toHaveLength(1);
    expect(q[0].value).toBe('Total');
    expect((q[0].lines ?? []).every((l) => l < 1000)).toBe(true);
    balanced(asked);
    const sin = sheetInput(of, { ...base, summaryRows: { answer: 'leave-out', count: Number(q[0].params.count) } });
    const r = convert({ sheets: [sin], options: {} });
    expect(find(r.findings, 'CONV-SUMMARY-ROW-UNDECIDED')).toEqual([]);
    expect(find(r.findings, 'CONV-SUMMARY-ROW-SKIPPED')).toHaveLength(1);
    expect(sampleIds(r).sort()).toEqual(['S1', 'S2']);
    balanced(r);
  });
});

describe('a joined workbook: summary rows of the description sheet', () => {
  const TAX = 'Calanus finmarchicus';
  const COUNTS = ['Sample', 'Taxon', 'Count'];
  const SAMPLES = ['Sample', 'Station', 'Date', 'Latitude', 'Longitude', 'Depth'];
  const JOIN: SampleJoinRequestCore = { results: 0, description: 1, keys: [{ results: 0, description: 0 }], conflicts: [] };
  const book = (counts: Cell[][], samples: Cell[][]): ConvertSheetInput[] => {
    const file = xlsxFile('book.xlsx', { Counts: [COUNTS, ...counts], Samples: [SAMPLES, ...samples] });
    return [resultsInput(file, 'Counts'), descriptionInput(file, 'Samples')];
  };
  const run = (inputs: ConvertSheetInput[]) => {
    const out = joinInputs(inputs, [JOIN], []);
    return { out, result: convert({ sheets: out.sheets, options: {} }) };
  };
  // the description lends the station name "Somme" to X02; X03 is described and not counted
  const counts: Cell[][] = [['X01', TAX, 12], ['X02', TAX, 7]];
  const samples: Cell[][] = [['X01', 'ST-1', '2021-05-03', 61.1, 4.2, 10], ['X02', 'Somme', '2021-05-04', 61.3, 4.6, 20], ['X03', 'ST-3', '2021-05-05', 61.5, 4.9, 30]];

  it('a station lent by the description that reads as a total word is asked about on the sheet it was lent to; the ledger of both sheets balances', () => {
    const { out, result } = run(book(counts, samples));
    const q = find(result.findings, 'CONV-SUMMARY-ROW-UNDECIDED');
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ sheet: 'Counts', lines: [3], value: 'Somme', params: { count: 1 } });
    expect(judge(result.findings).blocking.map((x) => x.ruleId)).toContain('CONV-SUMMARY-ROW-UNDECIDED');
    for (const l of result.ledger) expect(l.rows.unexplained, l.sheet).toBe(0);
    expect([...notWrittenRows(result.ledger, out.sheets)].filter((x) => x.reason === 'summary-undecided').map((x) => x.line)).toEqual([3]);
    const answered = book(counts, samples);
    answered[0] = { ...answered[0], summaryRows: { answer: 'leave-out', count: 1 } };
    const a = run(answered);
    expect(find(a.result.findings, 'CONV-SUMMARY-ROW-UNDECIDED')).toEqual([]);
    expect(find(a.result.findings, 'CONV-SUMMARY-ROW-SKIPPED')[0]).toMatchObject({ lines: [3], params: { answer: 'leave-out', count: 1 } });
    expect([...notWrittenRows(a.result.ledger, a.out.sheets)].filter((x) => x.reason === 'summary-row').map((x) => x.line)).toEqual([3]);
    for (const l of a.result.ledger) expect(l.rows.unexplained, l.sheet).toBe(0);
  });

  it('a sample called Total that only the description has (no counts) is held and asked about too', () => {
    const { out, result } = run(book(counts, [...samples.slice(0, 2), ['Total', 'ST-9', '2021-05-06', 61.9, 4.9, 30]]));
    const q = find(result.findings, 'CONV-SUMMARY-ROW-UNDECIDED');
    expect(q.length).toBeGreaterThan(0);
    expect(q.some((x) => x.value === 'Total' || String(x.value).includes('Total'))).toBe(true);
    for (const l of result.ledger) expect(l.rows.unexplained, l.sheet).toBe(0);
    const dbg = [...notWrittenRows(result.ledger, out.sheets)].map((x) => `${x.sheet}:${x.line}:${x.reason}:${x.status}`);
    // the same question under both sheet names (joinLines splits the lines, the count stays the question's), with the same number to answer for: the rows of the converted sheet
    expect(q.map((x) => [x.sheet, x.lines, x.params.count, x.params.held])).toEqual([['Counts', [3], 2, 2], ['Samples', [4], 2, 2]]);
    expect(dbg).toContain('Samples:4:summary-undecided:needs-decision');
    expect(result.events.some((e) => e.id === 'Total')).toBe(false);
    const answered = book(counts, [...samples.slice(0, 2), ['Total', 'ST-9', '2021-05-06', 61.9, 4.9, 30]]);
    answered[0] = { ...answered[0], summaryRows: { answer: 'leave-out', count: 2 } };
    const a = run(answered);
    expect(find(a.result.findings, 'CONV-SUMMARY-ROW-UNDECIDED')).toEqual([]);
    expect(find(a.result.findings, 'CONV-SUMMARY-ROW-SKIPPED').map((x) => x.sheet)).toEqual(['Counts', 'Samples']);
    expect(a.result.events.some((e) => e.id === 'Total')).toBe(false);
    for (const l of a.result.ledger) expect(l.rows.unexplained, l.sheet).toBe(0);
  });
});

describe('the sums of other findings are computed after the answer', () => {
  const F = ['Station', 'Sample', 'Species', 'Count', 'Date', 'Latitude', 'Longitude'];
  const rows: Cell[][] = [
    ['Somme', 'a', 'Calanus finmarchicus', 3, '2020-01-01', 50.2, 1.6],
    ['Somme', 'a', 'Calanus finmarchicus', 3, '2020-01-01', 50.2, 1.6],
    ['Authie', 'b', 'Calanus finmarchicus', 5, '2020-01-02', 50.3, 1.5],
  ];
  const long = (extra: Partial<ConvertSheetInput> = {}) => sheetInput(fileOf(F, rows), { shape: 'long', quantity: { kind: 'count' }, ...extra });
  const copies = (r: ReturnType<typeof convert>) => r.findings.filter((f) => /^CONV-ROW-COPIES|^CONV-QUANTITY-REPEATED/.test(f.ruleId));

  it('rows left out are not copies of anything; rows kept are read like any other rows', () => {
    const out = convert({ sheets: [long({ summaryRows: { answer: 'leave-out', count: 2 } })], options: {} });
    expect(copies(out)).toEqual([]);
    expect(out.occurrences).toHaveLength(1);
    const asked = convert({ sheets: [long()], options: {} });
    expect(copies(asked)).toEqual([]);
    expect(find(asked.findings, 'CONV-SUMMARY-ROW-UNDECIDED')[0].params).toMatchObject({ count: 2, held: 2 });
    const named = convert({ sheets: [sheetInput(fileOf(F, rows.map((r) => [r[0] === 'Somme' ? 'Seine' : r[0], ...r.slice(1)])), { shape: 'long', quantity: { kind: 'count' } })], options: {} });
    expect(copies(named).length).toBeGreaterThan(0);
    const kept = convert({ sheets: [long({ summaryRows: { answer: 'keep', count: 2 } })], options: {} });
    expect(copies(kept).map((f) => [f.ruleId, f.lines])).toEqual(copies(named).map((f) => [f.ruleId, f.lines]));
    expect(kept.occurrences.length).toBe(named.occurrences.length);
  });
});
