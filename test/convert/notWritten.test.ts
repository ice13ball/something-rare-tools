// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Task 8, "nothing disappears": a row the converter cannot place blocks the export until someone decides, a row it understands and does not write is listed, and every row not written
// is in the list beside the archive with its physical line, its reason and all its cells. Every value is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { LEDGER_REASONS } from '../../src/core/convert/ledger';
import type { SheetLedger } from '../../src/core/convert/ledger';
import { COVERED_BY, REASON_KIND, canLeaveOut, cellField, countNotWritten, decideRows, kindOf, notWrittenCsv, notWrittenRows } from '../../src/core/convert/notWritten';
import { pivotConvertFile } from '../../src/core/convert/pivot';
import { judge } from '../../src/core/convert/policy';
import { readConvertFile } from '../../src/core/convert/read';
import { makeConvertFinding } from '../../src/core/rules/convert';
import type { ColumnRole } from '../../src/core/types';
import { csvOf } from '../app/convertHelpers';
import { textFile } from '../helpers/files';
import { L2_HEADER, L2_ROWS, W1_HEADER, W1_QUANTITY, W1_ROWS, W2_HEADER, W2_QUANTITY, W2_ROWS, fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const blockers = (r: ReturnType<typeof convert>): string[] => judge(r.findings).blocking.map((f) => f.ruleId);
const ofRule = (r: ReturnType<typeof convert>, id: string) => r.findings.filter((f) => f.ruleId === id);
const base = ['Sample', 'Date', 'Latitude', 'Longitude'];
const fr = (s: string): Cell[] => [s, '2020-06-01', 49.4, 0.2];
const W1 = (extra: Partial<ConvertSheetInput> = {}): ConvertSheetInput => sheetInput(fileOf(W1_HEADER, W1_ROWS), { quantity: W1_QUANTITY, device: { kind: 'known', key: 'multinet' }, ...extra });
/** The file as a user's CSV, read the way /convert reads it (a ragged row is the parser's finding). */
const csvSheet = (text: string, extra: Partial<ConvertSheetInput> & { edit?: Record<string, ColumnRole> } = {}): ConvertSheetInput => sheetInput(readConvertFile(textFile('user.csv', text)), extra);

/** A parsed list: the rows of the CSV of notWrittenCsv, read back by the converter's own reader. */
function listOf(csv: string): { header: string[]; rows: Record<string, string>[] } {
  const f = readConvertFile(textFile('list.csv', csv));
  const s = f.sheets[0];
  return { header: s.header, rows: s.rows.map((r) => Object.fromEntries(s.header.map((h, i) => [h, String(r.cells[i] ?? '')]))) };
}
const csvOfRun = (r: ReturnType<typeof convert>, sheets: ConvertSheetInput[]): string => notWrittenCsv(r.ledger, sheets, r.leftOut).chunks.join('');

describe('the kinds of reason', () => {
  it('every reason the ledger knows has a kind, and only blocks/covered/listed', () => {
    for (const r of LEDGER_REASONS) expect(['blocks', 'covered', 'listed'], r).toContain(REASON_KIND[r]);
    expect(Object.keys(REASON_KIND).sort()).toEqual([...LEDGER_REASONS].sort());
  });
  it('the reasons Michal named block: an empty parameter, a repeated parameter, a value with no taxon, a ragged row, a value an event did not take, and an unexplained row', () => {
    for (const r of ['empty-parameter', 'repeated-parameter', 'value-no-taxon', 'no-taxon', 'ragged', 'not-in-event', 'unexplained']) expect(kindOf(r), r).toBe('blocks');
  });
  it('zeros, statistic rows, copies, repeated totals and the other understood reasons are listed and do not block', () => {
    for (const r of ['zero', 'zero-with-biomass', 'summary-row', 'copy-dropped', 'repeat-total', 'position-no-taxon', 'sample-no-taxon', 'nothing-to-record', 'quality-flag', 'text-cell']) expect(kindOf(r), r).toBe('listed');
  });
  it('a reason this file does not know blocks (an unknown future reason lets no row go in silence)', () => {
    expect(kindOf('some-future-reason')).toBe('blocks');
    expect(kindOf('__proto__')).toBe('blocks');
    expect(kindOf('toString')).toBe('blocks');
    expect(canLeaveOut('some-future-reason')).toBe(true);
    expect(canLeaveOut('zero')).toBe(false);
  });
  it('a covered reason names the rule that blocks for it', () => {
    for (const r of LEDGER_REASONS) if (REASON_KIND[r] === 'covered') expect(COVERED_BY[r]?.length ?? 0, r).toBeGreaterThan(0);
  });
});

describe('a row of the wrong length', () => {
  const text = (): string => csvOf(W1_HEADER, W1_ROWS).replace('CR1,S1,S1-b,', 'CR1,S1,S1-b,EXTRA,');
  const sheet = (extra: Partial<ConvertSheetInput> = {}): ConvertSheetInput => csvSheet(text(), { quantity: W1_QUANTITY, device: { kind: 'known', key: 'multinet' }, ...extra });

  it('blocks once, with the line and the cells; the rest of the file is written', () => {
    const r = convert({ sheets: [sheet()], options: {} });
    const q = ofRule(r, 'CONV-ROW-NOT-UNDERSTOOD');
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ file: 'user.csv', lines: [3], params: { reason: 'ragged', count: 1 } });
    expect(String(q[0].params.examples)).toContain('3: CR1 | S1 | S1-b | EXTRA');
    expect(blockers(r)).toContain('CONV-ROW-NOT-UNDERSTOOD');
    expect(r.occurrences.length).toBeGreaterThan(0);
  });

  it('"leave these rows out and list them" lifts both blocks (the parser\'s ROW-RAGGED gives way to the answer) and the row is in the list', () => {
    const sheets = [sheet({ leaveOut: ['ragged'] })];
    const r = convert({ sheets, options: {} });
    expect(blockers(r)).not.toContain('CONV-ROW-NOT-UNDERSTOOD');
    expect(blockers(r)).not.toContain('ROW-RAGGED');
    expect(ofRule(r, 'CONV-ROW-LEFT-OUT')).toHaveLength(1);
    expect(r.leftOut).toEqual(['0\u0000ragged']);
    const list = listOf(csvOfRun(r, sheets));
    const row = list.rows.find((x) => x.line === '3')!;
    expect(row).toMatchObject({ reason: 'ragged', status: 'left-out', sheet: 'user.csv' });
    expect(row['cell 4']).toBe('EXTRA');
  });

  it('taking the answer back puts the block back (nothing is remembered by the converter)', () => {
    const answered = convert({ sheets: [sheet({ leaveOut: ['ragged'] })], options: {} });
    const again = convert({ sheets: [sheet()], options: {} });
    expect(blockers(answered)).not.toContain('CONV-ROW-NOT-UNDERSTOOD');
    expect(blockers(again)).toContain('CONV-ROW-NOT-UNDERSTOOD');
    expect(blockers(again)).toContain('ROW-RAGGED');
  });
});

describe('a long sheet: a number with no taxon name', () => {
  const header = [...base, 'Species', 'Count', 'Temperature [C]'];
  const edit: Record<string, ColumnRole> = { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' } };
  const rows: Cell[][] = [[...fr('a'), 'Solea solea', 3, 12], [...fr('b'), null, 4, 22], [...fr('c'), null, null, 23], [...fr('d'), 'Gadus morhua', 2, 11]];
  const sheet = (extra: Partial<ConvertSheetInput> = {}): ConvertSheetInput => sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' }, device: { kind: 'known', key: 'multinet' }, edit, ...extra });

  it('a count with no taxon blocks; so does a variable with no taxon (one question for each reason)', () => {
    const r = convert({ sheets: [sheet()], options: {} });
    const q = ofRule(r, 'CONV-ROW-NOT-UNDERSTOOD');
    expect(q.map((f) => f.params.reason).sort()).toEqual(['no-taxon', 'value-no-taxon']);
    expect(q.find((f) => f.params.reason === 'no-taxon')).toMatchObject({ lines: [3], params: { count: 1 } });
    expect(q.find((f) => f.params.reason === 'value-no-taxon')).toMatchObject({ lines: [4], params: { count: 1 } });
    expect(blockers(r)).toContain('CONV-ROW-NOT-UNDERSTOOD');
  });

  it('one answer does not answer the other reason', () => {
    const r = convert({ sheets: [sheet({ leaveOut: ['no-taxon'] })], options: {} });
    expect(ofRule(r, 'CONV-ROW-NOT-UNDERSTOOD').map((f) => f.params.reason)).toEqual(['value-no-taxon']);
    expect(ofRule(r, 'CONV-ROW-LEFT-OUT').map((f) => f.params.reason)).toEqual(['no-taxon']);
    // the older accept rule for the same rows gives way to the answer (one decision, not two)
    expect(ofRule(r, 'CONV-TAXON-EMPTY-ROW')).toHaveLength(0);
  });

  it('both answered: nothing of this blocks and both rows are in the list with their cells', () => {
    const sheets = [sheet({ leaveOut: ['no-taxon', 'value-no-taxon'] })];
    const r = convert({ sheets, options: {} });
    expect(blockers(r)).not.toContain('CONV-ROW-NOT-UNDERSTOOD');
    const list = listOf(csvOfRun(r, sheets));
    const mine = list.rows.filter((x) => x.reason === 'no-taxon' || x.reason === 'value-no-taxon');
    expect(mine.map((x) => [x.line, x.reason, x.status])).toEqual([['3', 'no-taxon', 'left-out'], ['4', 'value-no-taxon', 'left-out']]);
    expect(mine[0]['cell 6']).toBe('4');
    expect(mine[1]['cell 7']).toBe('23');
  });

  it('an answer for a reason that is not there changes nothing, and an answer for a reason that is only listed is not honoured', () => {
    const plain = convert({ sheets: [sheet()], options: {} });
    const odd = convert({ sheets: [sheet({ leaveOut: ['nonsense', 'zero', 'summary-row'] })], options: {} });
    expect(odd.findings.map((f) => f.ruleId)).toEqual(plain.findings.map((f) => f.ruleId));
    expect(odd.leftOut).toEqual([]);
  });
});

describe('a long environmental sheet read as one row per sample', () => {
  const H = [...base, 'Parameter', 'Value', 'Unit'];
  const rows: Cell[][] = [
    [...fr('A'), 'Temperature', 10, 'C'], // 2
    [...fr('A'), 'Salinity', 34, 'PSU'], // 3
    [...fr('A'), null, 777, null], // 4: a value, no parameter name
    [...fr('A'), 'Temperature', 555, 'C'], // 5: the parameter twice in one sample
    [...fr('A'), 'Temperature_QC', 1, null], // 6: a quality flag
    [...fr('B'), 'Temperature', 12, 'C'], // 7
    [...fr('B'), 'Salinity', 35, 'PSU'], // 8
  ];
  const sheet = (extra: Partial<ConvertSheetInput> = {}): ConvertSheetInput => {
    const piv = pivotConvertFile(fileOf(H, rows, 'Long'), {});
    expect(piv.sheets[0].pivot).toBeDefined();
    return sheetInput(piv, { shape: 'wide', quantity: { kind: 'count' }, edit: { Sample: { kind: 'sampleId' } }, ...extra });
  };

  it('an empty parameter and a repeated parameter each block once, by line of the LONG file, with that line\'s cells', () => {
    const r = convert({ sheets: [sheet()], options: {} });
    const q = ofRule(r, 'CONV-ROW-NOT-UNDERSTOOD');
    expect(q.map((f) => [f.params.reason, f.lines])).toEqual(expect.arrayContaining([['empty-parameter', [4]], ['repeated-parameter', [5]]]));
    expect(String(q.find((f) => f.params.reason === 'empty-parameter')!.params.examples)).toContain('4: A | 2020-06-01 | 49.4 | 0.2 |  | 777');
    expect(String(q.find((f) => f.params.reason === 'repeated-parameter')!.params.examples)).toContain('5: A | 2020-06-01 | 49.4 | 0.2 | Temperature | 555 | C');
  });

  it('the answers lift them and the older blocks of the same rows (CONV-LONG-NO-PARAMETER, CONV-LONG-DUPLICATE) give way; the quality flag row is listed, never a block', () => {
    const before = convert({ sheets: [sheet()], options: {} });
    expect(blockers(before)).toEqual(expect.arrayContaining(['CONV-LONG-NO-PARAMETER', 'CONV-LONG-DUPLICATE', 'CONV-ROW-NOT-UNDERSTOOD']));
    const sheets = [sheet({ leaveOut: ['empty-parameter', 'repeated-parameter'] })];
    const r = convert({ sheets, options: {} });
    expect(blockers(r)).not.toEqual(expect.arrayContaining(['CONV-ROW-NOT-UNDERSTOOD']));
    expect(blockers(r)).not.toContain('CONV-LONG-NO-PARAMETER');
    expect(blockers(r)).not.toContain('CONV-LONG-DUPLICATE');
    const list = listOf(csvOfRun(r, sheets));
    expect(list.rows.filter((x) => x.line !== '1').map((x) => [x.line, x.reason, x.status])).toEqual([['4', 'empty-parameter', 'left-out'], ['5', 'repeated-parameter', 'left-out'], ['6', 'quality-flag', 'understood']]);
    // the file's header row of the long sheet, so that the cells can be read
    expect(list.rows.find((x) => x.reason === 'header')!['cell 5']).toBe('Parameter');
  });

  it('a value the sample\'s event did not take blocks (not-in-event) and can be answered', () => {
    const HP = ['Station', 'Date', 'Depth [m]', 'Parameter', 'Value', 'Unit'];
    const deep: Cell[][] = [['S1', '2020-06-01', null, 'Temperature', 11, 'C'], ['S1', '2020-06-01', null, 'Depth', 'deep', 'm'], ['S2', '2020-06-01', null, 'Temperature', 12, 'C'], ['S2', '2020-06-01', null, 'Depth', 5, 'm']];
    const mk = (extra: Partial<ConvertSheetInput> = {}): ConvertSheetInput => sheetInput(pivotConvertFile(fileOf(HP, deep, 'Long'), {}), { shape: 'wide', quantity: { kind: 'count' }, edit: { Station: { kind: 'sampleId' }, 'Depth [m]': { kind: 'ignore' } }, ...extra });
    const r = convert({ sheets: [mk()], options: {} });
    expect(r.ledger[0].lines.map((l) => [l.line, l.fate])).toEqual([[3, 'not-in-event']]);
    const q = ofRule(r, 'CONV-ROW-NOT-UNDERSTOOD');
    expect(q.map((f) => [f.params.reason, f.lines])).toEqual([['not-in-event', [3]]]);
    expect(String(q[0].params.examples)).toContain('3: S1 | 2020-06-01 |  | Depth | deep | m');
    const sheets = [mk({ leaveOut: ['not-in-event'] })];
    const a = convert({ sheets, options: {} });
    expect(ofRule(a, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(0);
    expect(listOf(csvOfRun(a, sheets)).rows.filter((x) => x.reason !== 'header').map((x) => [x.line, x.reason, x.status])).toEqual([['3', 'not-in-event', 'left-out']]);
  });
});

describe('what is understood and not written is listed, and blocks nothing', () => {
  it('zeros of a wide sheet appear as a count in the ledger and not as lines in the list; an NA cell is named as a line of its own', () => {
    const sheets = [W1()];
    const r = convert({ sheets, options: {} });
    expect(ofRule(r, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(0);
    const list = listOf(csvOfRun(r, sheets));
    const lost = list.rows.filter((x) => x.reason === 'cells-not-written');
    // line 2 lost a zero (not named); line 4 lost an NA (named, with its column)
    expect(lost.map((x) => x.line)).toEqual(['4']);
    expect(lost[0].detail).toContain('Calanus finmarchicus (na-cell)');
    expect(lost[0]['cell 10']).toBe('NA');
    expect(r.ledger[0].lines.find((l) => l.line === 2)?.cells).toEqual({ written: 2, lost: 1 });
    expect(r.ledger[0].lines.find((l) => l.line === 2)?.lostCells).toBeUndefined();
    expect(countNotWritten(r.ledger)).toEqual({ rows: 1, sheets: 0 });
  });

  it('a statistics row in a summary block is listed with its cells and its reason', () => {
    const header = ['Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'];
    const rows: Cell[][] = [['a', '2020-06-01', 49.4, 0.2, 'Solea solea', 3], ['Total', '2020-06-01', 49.4, 0.2, 'Solea solea', 3], ['b', '2020-06-01', 49.4, 0.2, 'Gadus morhua', 2]];
    const sheets = [sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' }, edit: { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' } } })];
    const r = convert({ sheets, options: {} });
    expect(ofRule(r, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(0);
    const list = listOf(csvOfRun(r, sheets));
    const t = list.rows.find((x) => x.line === '3')!;
    expect(t).toMatchObject({ reason: 'summary-row', status: 'understood', 'cell 1': 'Total', 'cell 5': 'Solea solea', 'cell 6': '3' });
  });

  it('copies and repeated totals the user chose to leave out are listed, not blocking', () => {
    const header = ['Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count', 'Note'];
    const rows: Cell[][] = [['a', '2020-06-01', 49.4, 0.2, 'Solea solea', 3, 'x'], ['a', '2020-06-01', 49.4, 0.2, 'Solea solea', 3, 'x'], ['b', '2020-06-01', 49.4, 0.2, 'Gadus morhua', 2, 'y']];
    const mk = (extra: Partial<ConvertSheetInput> = {}): ConvertSheetInput => sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' }, device: { kind: 'known', key: 'multinet' }, edit: { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' }, Note: { kind: 'ignore' } }, ...extra });
    const open = convert({ sheets: [mk()], options: {} });
    expect(ofRule(open, 'CONV-ROW-COPIES')).toHaveLength(1);
    const sheets = [mk({ dropCopies: true })];
    const r = convert({ sheets, options: {} });
    expect(ofRule(r, 'CONV-ROW-COPIES-DROPPED')).toHaveLength(1);
    expect(ofRule(r, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(0);
    const list = listOf(csvOfRun(r, sheets));
    expect(list.rows.filter((x) => x.reason === 'copy-dropped').map((x) => [x.line, x.status, x['cell 5']])).toEqual([['3', 'understood', 'Solea solea']]);
  });
});

describe('a reason with a rule of its own is not asked twice, and is asked when nothing else holds the row', () => {
  it('a row with no sample code is blocked by CONV-SAMPLE-CODE-MISSING and raises no second question', () => {
    const header = W1_HEADER.filter((h) => h !== 'Sample');
    const rows = W1_ROWS.map((r) => r.filter((_, i) => i !== 2));
    const r = convert({ sheets: [sheetInput(fileOf(header, rows), { quantity: W1_QUANTITY, device: { kind: 'known', key: 'multinet' } })], options: {} });
    expect(r.ledger[0].lines.some((l) => l.fate === 'no-code')).toBe(true);
    expect(blockers(r)).toContain('CONV-SAMPLE-CODE-MISSING');
    expect(ofRule(r, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(0);
  });

  it('a covered reason is asked only when no blocking rule of its own stands for the sheet at all', () => {
    const r = convert({ sheets: [W1()], options: {} });
    const fake: SheetLedger = { ...r.ledger[0], lines: [{ line: 2, fate: 'no-code', chain: ['no-code'] }, { line: 3, fate: 'no-code', chain: ['no-code'] }] };
    const sheets = [W1()];
    const covered = decideRows([fake], sheets, [makeConvertFinding('CONV-SAMPLE-CODE-MISSING', { file: fake.file, sheet: fake.sheet, lines: [2] })]);
    // (the rule of its own is the decision, even for a line it does not name: our question is never raised beside it)
    expect(covered.findings).toEqual([]);
    const none = decideRows([fake], sheets, []);
    expect(none.findings.map((f) => [f.ruleId, f.lines])).toEqual([['CONV-ROW-NOT-UNDERSTOOD', [2, 3]]]);
    const named = decideRows([fake], sheets, [makeConvertFinding('CONV-SAMPLE-CODE-MISSING', { file: fake.file, sheet: fake.sheet })]);
    expect(named.findings).toEqual([]);
    // a rule on another sheet does not cover this one
    const other = decideRows([fake], sheets, [makeConvertFinding('CONV-SAMPLE-CODE-MISSING', { file: fake.file, sheet: 'other' })]);
    expect(other.findings).toHaveLength(1);
  });

  it('an unknown future reason, and a line with neither record nor reason (unexplained), block and can be answered', () => {
    const r = convert({ sheets: [W1()], options: {} });
    const fake: SheetLedger = { ...r.ledger[0], lines: [{ line: 2, fate: 'some-future-reason' as never }, { line: 3, fate: 'unexplained' }] };
    const d = decideRows([fake], [W1()], []);
    expect(d.findings.map((f) => f.params.reason).sort()).toEqual(['some-future-reason', 'unexplained']);
    const answered = decideRows([fake], [W1({ leaveOut: ['some-future-reason', 'unexplained'] })], []);
    expect(answered.findings.map((f) => f.ruleId)).toEqual(['CONV-ROW-LEFT-OUT', 'CONV-ROW-LEFT-OUT']);
  });
});

describe('a companion file answer holds only for the same numbers (the rule of 1eec1b9)', () => {
  const text = (): string => csvOf(W1_HEADER, W1_ROWS).replace('CR1,S1,S1-b,', 'CR1,S1,S1-b,EXTRA,');
  const mk = (extra: Partial<ConvertSheetInput> = {}): ConvertSheetInput => csvSheet(text(), { quantity: W1_QUANTITY, device: { kind: 'known', key: 'multinet' }, ...extra });

  it('the same count of rows of the reason and the same rows in the sheet: honoured, and said to come from the file', () => {
    const r = convert({ sheets: [mk({ leaveOutFile: [{ reason: 'ragged', count: 1, rows: 3 }] })], options: {} });
    expect(blockers(r)).not.toContain('CONV-ROW-NOT-UNDERSTOOD');
    expect(ofRule(r, 'CONV-ROW-LEFT-OUT')[0].params).toMatchObject({ reason: 'ragged', count: 1, rows: 3, fromFile: 'yes' });
  });

  it('another count of rows of the reason, or another number of rows in the sheet: the question is open again', () => {
    for (const g of [{ reason: 'ragged', count: 2, rows: 3 }, { reason: 'ragged', count: 1, rows: 4 }, { reason: 'empty-parameter', count: 1, rows: 3 }]) {
      const r = convert({ sheets: [mk({ leaveOutFile: [g] })], options: {} });
      expect(blockers(r), JSON.stringify(g)).toContain('CONV-ROW-NOT-UNDERSTOOD');
      expect(ofRule(r, 'CONV-ROW-LEFT-OUT')).toHaveLength(0);
    }
  });

  it('the page\'s own answer wins and is not said to come from the file', () => {
    const r = convert({ sheets: [mk({ leaveOut: ['ragged'], leaveOutFile: [{ reason: 'ragged', count: 1, rows: 3 }] })], options: {} });
    expect(ofRule(r, 'CONV-ROW-LEFT-OUT')[0].params.fromFile).toBeUndefined();
  });

  const header = ['Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count', 'Note'];
  const rows: Cell[][] = [['a', '2020-06-01', 49.4, 0.2, 'Solea solea', 3, 'x'], ['a', '2020-06-01', 49.4, 0.2, 'Solea solea', 3, 'x'], ['b', '2020-06-01', 49.4, 0.2, 'Gadus morhua', 2, 'y']];
  const copies = (extra: Partial<ConvertSheetInput>): ConvertSheetInput =>
    sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' }, device: { kind: 'known', key: 'multinet' }, edit: { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' }, Note: { kind: 'ignore' } }, ...extra });

  it('exact copies: a file count equal to today\'s switches the check off; a different one leaves CONV-ROW-COPIES blocking; no count (an old file) leaves it blocking', () => {
    expect(ofRule(convert({ sheets: [copies({ dropCopiesCount: 1 })], options: {} }), 'CONV-ROW-COPIES-DROPPED')).toHaveLength(1);
    for (const n of [0, 2, 5]) {
      const r = convert({ sheets: [copies({ dropCopiesCount: n })], options: {} });
      expect(ofRule(r, 'CONV-ROW-COPIES'), String(n)).toHaveLength(1);
      expect(ofRule(r, 'CONV-ROW-COPIES-DROPPED')).toHaveLength(0);
    }
    const none = convert({ sheets: [copies({})], options: {} });
    expect(ofRule(none, 'CONV-ROW-COPIES')).toHaveLength(1);
  });

  it('the companion file keeps leaveOut, copies and groups with their numbers, and reads them back', async () => {
    const { writeConvertSidecar, readConvertSettings } = await import('../../src/core/convert/settings');
    const csv = writeConvertSidecar({ leaveOut: [{ sheet: 'S: 1', reason: 'ragged', count: 3, rows: 40 }], dropCopiesRows: [{ sheet: 'S', count: 4 }], totalOnceGroups: [{ sheet: 'S', count: 2 }] });
    const s = readConvertSettings(readConvertFile(textFile('c.csv', csv)))!;
    expect(s.leaveOut).toEqual([{ sheet: 'S: 1', reason: 'ragged', count: 3, rows: 40 }]);
    expect(s.dropCopiesRows).toEqual([{ sheet: 'S', count: 4 }]);
    expect(s.totalOnceGroups).toEqual([{ sheet: 'S', count: 2 }]);
    // nothing but counts, a reason word and a sheet name is in the file
    expect(csv).not.toMatch(/\d\.\d/);
  });
});

describe('the list: every line of the file is written or in the list, each once', () => {
  /** The physical lines that have a record in the output (an occurrence, a measurement, a level, an event), for the sheet named. */
  function recorded(r: ReturnType<typeof convert>, sheet: string): Set<number> {
    const out = new Set<number>();
    for (const o of r.occurrences) if (o.source.sheet === sheet) out.add(o.source.line);
    for (const m of r.measurements) if (m.source.sheet === sheet) out.add(m.source.line);
    for (const e of r.events) if (e.source?.sheet === sheet) out.add(e.source.line);
    return out;
  }
  function check(r: ReturnType<typeof convert>, sheets: ConvertSheetInput[]): void {
    const list = listOf(csvOfRun(r, sheets));
    for (const [i, sin] of sheets.entries()) {
      const sheet = sin.file.sheets[0];
      const source = sheet.pivot?.source ?? sheet;
      const all = source.rows.map((x) => x.line);
      const inList = list.rows.filter((x) => x.sheet === sheet.name && x.reason !== 'header').map((x) => Number(x.line));
      expect(new Set(inList).size, `sheet ${i}: no line twice`).toBe(inList.length);
      const rec = recorded(r, sheet.name);
      const l = r.ledger[i];
      if (sheet.pivot === undefined) {
        // the lines with no record at all are all in the list
        for (const line of all) if (!rec.has(line)) expect(inList, `line ${line} has no record and must be listed`).toContain(line);
        // and a line is in the list only if it wrote no occurrence/measurement/level, or lost cells
        for (const line of inList) {
          const f = l.lines.find((x) => x.line === line)!;
          expect(f.fate !== 'written' || (f.lostCells?.length ?? 0) > 0, `line ${line}`).toBe(true);
        }
        // source lines = lines written + lines in the file, by line number (a written line that lost cells is both)
        const writtenPlain = all.filter((x) => !inList.includes(x));
        expect(writtenPlain.length + inList.length).toBe(all.length);
        for (const line of writtenPlain) expect(rec.has(line) || sheet.rows.find((x) => x.line === line)!.cells.every((c) => c === null || String(c).trim() === ''), `line ${line} is neither written nor listed`).toBe(true);
      } else {
        for (const line of inList) expect(all).toContain(line);
      }
      // the list is read from the ledger: the same lines
      expect([...inList].sort((a, b) => a - b)).toEqual(l.lines.filter((x) => x.fate !== 'written' || (x.lostCells?.length ?? 0) > 0).map((x) => x.line));
      // all the original cells of a listed line
      for (const row of list.rows.filter((x) => x.sheet === sheet.name && x.reason !== 'header' && x.reason !== 'cells-not-written')) {
        const src = source.rows.find((x) => x.line === Number(row.line))!;
        src.cells.forEach((c, k) => expect(row[`cell ${k + 1}`], `line ${row.line} cell ${k + 1}`).toBe(c === null ? '' : String(c)));
      }
    }
    expect(list.rows.filter((x) => x.reason !== 'header' && x.reason !== 'sheet-not-used').length).toBe(countNotWritten(r.ledger).rows);
  }

  it('W1 (wide, counts)', () => {
    const sheets = [W1()];
    check(convert({ sheets, options: {} }), sheets);
  });
  it('W2 (wide, density, sp./cf.)', () => {
    const sheets = [sheetInput(fileOf(W2_HEADER, W2_ROWS), { quantity: W2_QUANTITY, device: { kind: 'known', key: 'multinet' } })];
    check(convert({ sheets, options: {} }), sheets);
  });
  it('L2 (long, no occurrenceID) with a row that has no taxon and a statistics row', () => {
    const rows: Cell[][] = [...L2_ROWS, ['C', 'C1', null, null, 5, 70.9, 21.0, '2021-08-03', 5], ['Total', 'Total', 'Calanus finmarchicus', null, 20, 70.9, 21.0, '2021-08-03', 5]];
    const sheets = [sheetInput(fileOf(L2_HEADER, rows), { shape: 'long', quantity: { kind: 'count' }, device: { kind: 'known', key: 'multinet' } })];
    const r = convert({ sheets, options: {} });
    check(r, sheets);
    expect(r.ledger[0].lines.length).toBeGreaterThan(0);
  });
  it('L1 (long, with an occurrenceID) with the rows left out by the user', () => {
    const header = ['occurrenceID', 'eventID', 'scientificName', 'individualCount', 'decimalLatitude', 'decimalLongitude', 'eventDate'];
    const rows: Cell[][] = [['o1', 'E1', 'Solea solea', 3, 54.1, 7.9, '2022-05-05'], ['o2', 'E1', null, 4, 54.1, 7.9, '2022-05-05'], ['o3', 'E1', 'Gadus morhua', 0, 54.1, 7.9, '2022-05-05']];
    const sheets = [sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' }, device: { kind: 'known', key: 'multinet' }, leaveOut: ['no-taxon', 'value-no-taxon'] })];
    check(convert({ sheets, options: {} }), sheets);
  });
  it('a profile sheet', () => {
    const rows: Cell[][] = [['CR1', 'S1', 55.5, 2.5, '2023-06-14', 0, 11.2], ['CR1', 'S1', 'x', 2.5, '2023-06-14', 10, 10.9], ['CR1', 'Total', null, null, null, null, 22.1]];
    const sheets = [sheetInput(fileOf(['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]'], rows, 'CTD'), { profile: { depthIds: true } })];
    check(convert({ sheets, options: {} }), sheets);
  });
  it('a pivoted long sheet (the lines of the long file)', () => {
    const rows: Cell[][] = [[...fr('A'), 'Temperature', 10, 'C'], [...fr('A'), null, 777, null], [...fr('A'), 'Temperature', 555, 'C'], [...fr('B'), 'Temperature', 12, 'C']];
    const piv = pivotConvertFile(fileOf([...base, 'Parameter', 'Value', 'Unit'], rows, 'Long'), {});
    const sheets = [sheetInput(piv, { shape: 'wide', quantity: { kind: 'count' }, edit: { Sample: { kind: 'sampleId' } } })];
    check(convert({ sheets, options: {} }), sheets);
  });
  it('a sheet left out as a whole is one row of its own with its number of rows, and its rows are not written out', () => {
    const r = convert({ sheets: [W1()], options: {} });
    const unused: SheetLedger = { file: 'other.csv', sheet: 'Notes', kind: 'not-used', unit: 'rows', rows: { source: 12, written: 0, skipped: [{ reason: 'sheet-not-used', count: 12 }], unexplained: 0 }, columns: [], lines: [], notUnderstood: 0, balanced: true };
    const rowsOut = [...notWrittenRows([unused], [W1()])];
    expect(rowsOut).toHaveLength(1);
    expect(rowsOut[0]).toMatchObject({ kind: 'sheet', file: 'other.csv', sheet: 'Notes', reason: 'sheet-not-used', status: 'left-out', cells: [12] });
    expect(countNotWritten([...r.ledger, unused])).toEqual({ rows: 1, sheets: 1 });
    const empty: SheetLedger = { ...unused, rows: { source: 0, written: 0, skipped: [], unexplained: 0 } };
    expect(countNotWritten([empty])).toEqual({ rows: 0, sheets: 0 });
  });
  it('when nothing is unwritten, there is no row (and the file is only its header)', () => {
    const header = ['Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'];
    const sheets = [sheetInput(fileOf(header, [['a', '2020-06-01', 49.4, 0.2, 'Solea solea', 3]]), { shape: 'long', quantity: { kind: 'count' }, device: { kind: 'known', key: 'multinet' }, edit: { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' } } })];
    const r = convert({ sheets, options: {} });
    expect(countNotWritten(r.ledger)).toEqual({ rows: 0, sheets: 0 });
    expect(notWrittenCsv(r.ledger, sheets, r.leftOut).count).toBe(0);
  });
});

describe('the CSV of the list', () => {
  it('a cell that starts like a formula is written with a leading apostrophe (the form readConvertFile takes off), a plain number is not touched, quotes and line breaks are quoted', () => {
    expect(cellField('=1+1')).toBe("'=1+1");
    expect(cellField('+cmd|x')).toBe("'+cmd|x");
    expect(cellField('-2+3')).toBe("'-2+3");
    expect(cellField('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(cellField('  =x')).toBe("'  =x");
    expect(cellField('\t=x')).toBe("'\t=x");
    expect(cellField('＝x')).toBe("'＝x");
    expect(cellField('-5')).toBe('-5');
    expect(cellField('+5')).toBe('+5');
    expect(cellField('1,5')).toBe('"1,5"');
    expect(cellField(-5)).toBe('-5');
    expect(cellField('say "hi"')).toBe('"say ""hi"""');
    expect(cellField('a\nb')).toBe('"a\nb"');
    expect(cellField(null)).toBe('');
    expect(cellField("''=x")).toBe("'''=x");
  });

  it('a file full of such cells reads back to the original text, and nothing in it is a formula', () => {
    const nasty = ['=1+1', '+cmd|x', '-2+3', '@SUM(A1)', ' =x', '"quoted"', 'two\nlines', 'a,b', "'=x", 'ünï ß 日本 ☃', '-5', '0'];
    const header = ['Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count', 'Remark'];
    const rows: Cell[][] = nasty.map((n, i) => [`s${i}`, '2020-06-01', 49.4, 0.2, null, 4, n]);
    const sheets = [sheetInput(fileOf(header, rows, '=SHEET()', { fileName: '=file.csv' }), { shape: 'long', quantity: { kind: 'count' }, edit: { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' } } })];
    const r = convert({ sheets, options: {} });
    const csv = csvOfRun(r, sheets);
    // no field of the file starts with a formula character
    const back = readConvertFile(textFile('list.csv', csv));
    const raw = textFile('list.csv', csv);
    for (const row of raw.sheets[0].rows) for (const c of row.cells) if (typeof c === 'string' && c !== '' && !/^[+-]?\d+(?:[.,]\d+)?$/.test(c)) expect(c, c).not.toMatch(/^[ \t]*[=+@\-＝]/);
    const list = back.sheets[0];
    const remarkAt = list.header.indexOf('cell 7');
    expect(list.rows.filter((x) => x.cells[3] === 'no-taxon' || x.cells[3] === 'value-no-taxon').map((x) => x.cells[remarkAt])).toEqual(nasty.map((n) => (n === 'two\nlines' ? 'two\nlines' : n)));
    expect(list.rows[0].cells[0]).toBe('=file.csv');
    expect(list.rows[0].cells[1]).toBe('=SHEET()');
  });

  it('is UTF-8 text in chunks of a few thousand lines, with one header row of fixed columns and one column per cell', () => {
    const sheets = [W1()];
    const r = convert({ sheets, options: {} });
    const { chunks } = notWrittenCsv(r.ledger, sheets, r.leftOut);
    const text = chunks.join('');
    expect(text.split('\n')[0]).toBe(['file', 'sheet', 'line', 'reason', 'status', 'detail', ...Array.from({ length: W1_HEADER.length }, (_, i) => `cell ${i + 1}`)].join(','));
    expect(new Blob(chunks).size).toBe(new TextEncoder().encode(text).length);
  });

  it('a list of 100,000 rows is written in chunks, from the ledger, with no array of the rows', () => {
    const n = 100_000;
    const header = ['Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'];
    const rows: Cell[][] = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? [`s${i}`, '2020-06-01', 49.4, 0.2, null, i] : [`s${i}`, '2020-06-01', 49.4, 0.2, 'Solea solea', i]));
    const sheets = [sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' }, edit: { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' } } })];
    const r = convert({ sheets, options: {} });
    const half = n / 2;
    expect(countNotWritten(r.ledger).rows).toBe(half);
    const t0 = Date.now();
    const { chunks, count } = notWrittenCsv(r.ledger, sheets, r.leftOut);
    expect(count).toBe(half);
    expect(chunks.length).toBe(Math.ceil((half + 2) / 2000));
    expect(chunks.every((c) => c.split('\n').length <= 2002)).toBe(true);
    expect(Date.now() - t0).toBeLessThan(10_000);
    const lines = chunks.join('').split('\n');
    expect(lines.length).toBe(half + 3); // header, the sheet's header row, the rows, and the final newline
  }, 60_000);
});

describe('findings never rewrite data', () => {
  it('the same sheet gives the same records with and without the answers (leaving rows out is a statement, not an edit)', () => {
    const header = [...base, 'Species', 'Count'];
    const rows: Cell[][] = [[...fr('a'), 'Solea solea', 3], [...fr('b'), null, 4]];
    const mk = (extra: Partial<ConvertSheetInput> = {}): ConvertSheetInput => sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' }, edit: { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' } }, ...extra });
    const a = convert({ sheets: [mk()], options: {} });
    const b = convert({ sheets: [mk({ leaveOut: ['no-taxon'] })], options: {} });
    const strip = (r: ReturnType<typeof convert>): string => JSON.stringify({ o: r.occurrences, m: r.measurements, e: r.events, s: r.stats });
    expect(strip(b)).toBe(strip(a));
  });
});

