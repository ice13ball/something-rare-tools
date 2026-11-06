// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Task 8, fix round 1 (the review of 05.11): every saved answer carries the count it was given for; a covered reason is never asked beside its own rule; a spacer row of a wide sheet is listed, not asked;
// every reason a person reads has words in four languages; the list holds the cells lost from written rows, the dates as ISO dates, and a sheet left out whole as one line; the faults block.
// The inputs are those of the reviewer's probes. Every value is invented.
import { describe, expect, it } from 'vitest';
import { EMPTY_QUANTITY, initialChoices, requestOf } from '../../src/app/convertModel';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import type { SheetLedger } from '../../src/core/convert/ledger';
import { REASON_KIND, countNotWritten, decideRows, notWrittenCsv, notWrittenRows } from '../../src/core/convert/notWritten';
import { pivotConvertFile } from '../../src/core/convert/pivot';
import { judge } from '../../src/core/convert/policy';
import { readConvertFile } from '../../src/core/convert/read';
import { UI } from '../../src/core/i18n/ui';
import { tipDe, tipEn, tipFr, tipPl } from '../../src/core/i18n/tips-text';
import { renderConvertPlain, rowWhat } from '../../src/core/rules/convert';
import type { ColumnRole } from '../../src/core/types';
import { dateCell, textFile, xlsxFile } from '../helpers/files';
import { createConvertHandler } from '../../src/worker/convert.handler';
import { fileOf, sheetInput, W1_HEADER, W1_QUANTITY, W1_ROWS } from './helpers';
import type { Cell } from './helpers';

const blockers = (r: ReturnType<typeof convert>): string[] => judge(r.findings).blocking.map((f) => f.ruleId);
const ofRule = (r: ReturnType<typeof convert>, id: string) => r.findings.filter((f) => f.ruleId === id);
const csvOf = (r: ReturnType<typeof convert>, sheets: ConvertSheetInput[]): string => notWrittenCsv(r.ledger, sheets, r.leftOut).chunks.join('');
function listOf(csv: string): Record<string, string>[] {
  const s = readConvertFile(textFile('list.csv', csv)).sheets[0];
  return s.rows.map((r) => Object.fromEntries(s.header.map((h, i) => [h, String(r.cells[i] ?? '')])));
}

describe('M1 and M2: an answer holds for the number it was given for', () => {
  const HEADER = ['sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Size', 'Quantity', 'Weight'];
  const EDIT: Record<string, ColumnRole> = {
    sample: { kind: 'sampleId' },
    Species: { kind: 'taxon' },
    Quantity: { kind: 'quantity' },
    Weight: { kind: 'biomass', basis: 'wet' },
    Size: { kind: 'variable', variable: 'body length', unit: 'cm', unitSource: 'user', perOccurrence: true },
  };
  const TAXA = ['Solea solea', 'Merlangius merlangus'];
  const rows = (): Cell[][] => {
    const out: Cell[][] = [];
    for (let s = 1; s <= 10; s++) for (let t = 0; t < 2; t++) for (let c = 0; c < 3; c++) out.push([`s${s}`, '2020-06-01', 49.4 + s / 100, 0.2, TAXA[t], 8 + c, 20 + 7 * s + 3 * t, s <= 2 && t === 0 ? 50 + c : 100 + s * 3 + t]);
    return out;
  };
  const mk = (extra: Partial<ConvertSheetInput> = {}, data: Cell[][] = rows()): ConvertSheetInput[] => [sheetInput(fileOf(HEADER, data, 'S', { fileName: 'catch.csv' }), { shape: 'long', quantity: { kind: 'count' }, edit: EDIT, ...extra })];

  it('M1: the number the open question offers is the number the answer is saved with and compared with, also when a group is not collapsed', () => {
    const open = convert({ sheets: mk(), options: {} });
    const q = ofRule(open, 'CONV-QUANTITY-REPEATED')[0];
    // 20 groups repeat the total; 2 of them have a weight of their own per size class and are not collapsed
    expect(q.params).toMatchObject({ count: 20, collapsed: 18 });
    const once = convert({ sheets: mk({ totalOnce: true }), options: {} });
    expect(ofRule(once, 'CONV-QUANTITY-REPEATED-ONCE')[0].params.groups).toBe(18);
    // what the open question offers is what the saved answer holds for
    const again = convert({ sheets: mk({ totalOnceCount: Number(q.params.collapsed) }), options: {} });
    expect(ofRule(again, 'CONV-QUANTITY-REPEATED-ONCE')).toHaveLength(1);
    // a count that is not the one of today's analysis is not applied, and the question stays open
    const stale = convert({ sheets: mk({ totalOnceCount: 20 }), options: {} });
    expect(ofRule(stale, 'CONV-QUANTITY-REPEATED-ONCE')).toHaveLength(0);
    expect(ofRule(stale, 'CONV-QUANTITY-REPEATED')).toHaveLength(1);
  });

  it('M6: "real counts" holds for the rows the tick covered; for a sheet with more rows the checks run', () => {
    const q = ofRule(convert({ sheets: mk(), options: {} }), 'CONV-QUANTITY-REPEATED')[0];
    const covered = Number(q.params.covered);
    expect(covered).toBe(60);
    const tick = convert({ sheets: mk({ realCountsRows: covered }), options: {} });
    expect(ofRule(tick, 'CONV-QUANTITY-REPEATED')).toHaveLength(0);
    const more = [...rows(), ...[0, 1].flatMap((t) => [0, 1, 2].map((c): Cell[] => ['s11', '2020-06-01', 49.5, 0.2, TAXA[t], 8 + c, 400 + t, 200 + t]))];
    const run = convert({ sheets: mk({ realCountsRows: covered }, more), options: {} });
    expect(ofRule(run, 'CONV-QUANTITY-REPEATED')).toHaveLength(1);
    // and the exact copies of the rows it never saw are not hidden either
    const copies = convert({ sheets: mk({ realCountsRows: covered }, [...rows(), ...rows().slice(0, 3)]), options: {} });
    expect(ofRule(copies, 'CONV-QUANTITY-REPEATED').length + ofRule(copies, 'CONV-ROW-COPIES').length).toBeGreaterThan(0);
  });

  const HEADER_P4 = ['occurrenceID', 'eventID', 'scientificName', 'individualCount', 'decimalLatitude', 'decimalLongitude', 'eventDate', 'altName'];
  const ROWS_P4: Cell[][] = [
    ['o1', 'E1', 'Solea solea', 3, 54.1, 7.9, '2022-05-05', 'Solea'],
    ['o2', 'E1', null, 4, 54.1, 7.9, '2022-05-05', null],
    ['o3', 'E1', 'Gadus morhua', 2, 54.1, 7.9, '2022-05-05', null],
    ['o4', 'E1', 'Pleuronectes platessa', 5, 54.1, 7.9, '2022-05-05', null],
  ];
  const p4 = (extra: Partial<ConvertSheetInput> & { edit?: Record<string, ColumnRole> } = {}): ConvertSheetInput => sheetInput(fileOf(HEADER_P4, ROWS_P4), { shape: 'long', quantity: { kind: 'count' }, device: { kind: 'known', key: 'multinet' }, ...extra });

  it('M2: an answer given for 1 row does not hold for 3 after the taxon column is remapped; the question reopens with the new count', () => {
    const first = convert({ sheets: [p4()], options: {} });
    const q = ofRule(first, 'CONV-ROW-NOT-UNDERSTOOD');
    expect(q[0].params).toMatchObject({ reason: 'no-taxon', count: 1 });
    const answered = convert({ sheets: [p4({ leaveOut: [{ reason: 'no-taxon', count: 1 }] })], options: {} });
    expect(ofRule(answered, 'CONV-ROW-LEFT-OUT')).toHaveLength(1);
    expect(blockers(answered)).not.toContain('CONV-ROW-NOT-UNDERSTOOD');
    const remap = convert({ sheets: [p4({ leaveOut: [{ reason: 'no-taxon', count: 1 }], edit: { scientificName: { kind: 'ignore' }, altName: { kind: 'taxon' } } })], options: {} });
    expect(ofRule(remap, 'CONV-ROW-LEFT-OUT')).toHaveLength(0);
    expect(ofRule(remap, 'CONV-ROW-NOT-UNDERSTOOD')[0].params).toMatchObject({ reason: 'no-taxon', count: 3 });
    expect(blockers(remap)).toContain('CONV-ROW-NOT-UNDERSTOOD');
  });
});

describe('M3: a spacer or a comment row of a wide sheet, and the words of every reason', () => {
  const W = (rows: Cell[][], header = W1_HEADER): ConvertSheetInput[] => [sheetInput(fileOf(header, rows), { quantity: W1_QUANTITY, device: { kind: 'known', key: 'multinet' } })];
  const blank = (n: number): Cell[] => Array.from({ length: n }, () => null);

  it('a row with a station and nothing else, and a comment row, are understood and listed: no question, no sample-code finding', () => {
    const rows = [...W1_ROWS, ['CR1', 'S3', ...blank(10)], ['note: fixed in formalin', ...blank(11)]];
    const sheets = W(rows);
    const r = convert({ sheets, options: {} });
    expect(r.ledger[0].lines.filter((l) => l.line >= 5).map((l) => l.fate)).toEqual(['sample-no-taxon', 'sample-no-taxon']);
    expect(ofRule(r, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(0);
    expect(ofRule(r, 'CONV-SAMPLE-CODE-MISSING')).toHaveLength(0);
    const list = listOf(csvOf(r, sheets));
    expect(list.filter((x) => x.line === '5' || x.line === '6').map((x) => [x.reason, x.status])).toEqual([['sample-no-taxon', 'understood'], ['sample-no-taxon', 'understood']]);
  });

  it('a row that holds a value and has no sample code is no-code, decided by CONV-SAMPLE-CODE-MISSING alone; without a sample code column the spacer row is not a second question', () => {
    const header = W1_HEADER.filter((h) => h !== 'Sample');
    const rows = [...W1_ROWS.map((x) => x.filter((_, i) => i !== 2)), ['CR1', 'S3', ...blank(9)]];
    const r = convert({ sheets: W(rows, header), options: {} });
    expect(ofRule(r, 'CONV-SAMPLE-CODE-MISSING').length).toBeGreaterThan(0);
    expect(ofRule(r, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(0);
  });

  it('a covered reason raises no question while a blocking rule of its own stands for the sheet, in the ledger the converter makes', () => {
    const header = W1_HEADER.filter((h) => h !== 'Sample');
    const r = convert({ sheets: W(W1_ROWS.map((x) => x.filter((_, i) => i !== 2)), header), options: {} });
    expect(r.ledger[0].lines.some((l) => l.fate === 'no-code')).toBe(true);
    expect(blockers(r)).toEqual(expect.arrayContaining(['CONV-SAMPLE-CODE-MISSING']));
    expect(blockers(r)).not.toContain('CONV-ROW-NOT-UNDERSTOOD');
  });

  it('every reason that can be asked has words in all four languages, in the right number, and no code is shown', () => {
    const reasons = [...Object.keys(REASON_KIND).filter((k) => REASON_KIND[k as keyof typeof REASON_KIND] !== 'listed'), 'unexplained', 'a-reason-nobody-knows'];
    for (const reason of reasons) {
      for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
        for (const count of [1, 2, 5]) {
          const text = renderConvertPlain({ ruleId: 'CONV-ROW-NOT-UNDERSTOOD', severity: 'error', file: 'f.csv', sheet: 'S', lines: [3], params: { reason, count, rows: 9 } } as never, lang);
          if (reason.includes('-') || reason === 'unexplained') expect(text, `${reason} ${lang} ${count}`).not.toContain(reason);
          expect(text, `${reason} ${lang} ${count}`).not.toMatch(/reason:|powód:|Grund:|raison :/);
          expect(text, `${reason} ${lang} ${count}`).not.toMatch(/[{}]/);
        }
      }
    }
    // the number agrees: one row "repeats", two rows "repeat"; Polish has three forms
    expect(rowWhat('repeated-parameter', 'en', 1)).toMatch(/^that repeats /);
    expect(rowWhat('repeated-parameter', 'en', 2)).toMatch(/^that repeat /);
    expect(rowWhat('repeated-parameter', 'pl', 1)).toMatch(/^powtarzający /);
    expect(rowWhat('repeated-parameter', 'pl', 3)).toMatch(/^powtarzające /);
    expect(rowWhat('repeated-parameter', 'pl', 5)).toMatch(/^powtarzających /);
    expect(rowWhat('a-reason-nobody-knows', 'en', 1)).toBe('that was not written');
  });

  it('L6: the question about a repeated parameter says that the first value is written and the later ones are listed, and CONV-LONG-DUPLICATE does not say the opposite', () => {
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      const what = rowWhat('repeated-parameter', lang, 2);
      expect(what.length).toBeGreaterThan(40);
    }
    expect(rowWhat('repeated-parameter', 'en', 2)).toContain('the first value is written');
    const dup = renderConvertPlain({ ruleId: 'CONV-LONG-DUPLICATE', severity: 'error', file: 'f.csv', sheet: 'S', field: 'Temp', lines: [3, 4], params: {} } as never, 'en');
    expect(dup).not.toMatch(/does not choose/);
    expect(dup).toContain('the first value is written');
  });
});

describe('M4: the cells lost from rows that were written are in the list', () => {
  it('a wide row that wrote an event and a measurement and lost its NA taxon cells is listed with the cells exactly as in the file', () => {
    const header = ['Sample', 'Date', 'Latitude', 'Longitude', 'Temperature [°C]', 'Calanus finmarchicus', 'Oithona similis'];
    const rows: Cell[][] = [
      ['a', '2020-06-01', 49.4, 0.2, 10.5, 3, 4],
      ['b', '2020-06-02', 49.5, 0.3, 11.0, 'NA', 'NA'],
      ['c', '2020-06-03', 49.6, 0.4, 11.5, 'abc', 'n.d.'],
    ];
    const sheets = [sheetInput(fileOf(header, rows), { quantity: { kind: 'count' }, device: { kind: 'known', key: 'multinet' }, edit: { 'Temperature [°C]': { kind: 'variable', variable: 'temperature', unit: '°C', unitSource: 'user' } } })];
    const r = convert({ sheets, options: {} });
    const list = listOf(csvOf(r, sheets));
    const b = list.find((x) => x.line === '3')!;
    expect(b).toMatchObject({ sheet: 'S', reason: 'cells-not-written', status: 'understood', 'cell 1': 'b', 'cell 6': 'NA', 'cell 7': 'NA' });
    expect(b.detail).toContain('Calanus finmarchicus (na-cell)');
    expect(b.detail).toContain('Oithona similis (na-cell)');
    const c = list.find((x) => x.line === '4')!;
    expect(c.reason).toBe('cells-not-written');
    expect(c['cell 6']).toBe('abc');
    expect(countNotWritten(r.ledger).rows).toBe(2);
  });

  it('a long row that wrote its occurrence and lost a weight "abc" and a length "<5" is listed with those two cells', () => {
    const header = ['occurrenceID', 'eventID', 'scientificName', 'individualCount', 'decimalLatitude', 'decimalLongitude', 'eventDate', 'wet weight [g]', 'Length [mm]'];
    const rows: Cell[][] = [['o1', 'E1', 'Solea solea', 3, 54.1, 7.9, '2022-05-05', 1.2, 30], ['o2', 'E1', 'Gadus morhua', 2, 54.1, 7.9, '2022-05-05', 'abc', '<5']];
    const sheets = [sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' }, device: { kind: 'known', key: 'multinet' }, edit: { 'Length [mm]': { kind: 'variable', variable: 'length', unit: 'mm', unitSource: 'user', perOccurrence: true } } })];
    const r = convert({ sheets, options: {} });
    const list = listOf(csvOf(r, sheets));
    expect(list).toHaveLength(2);
    const row = list.find((x) => x.line === '3')!;
    expect(row).toMatchObject({ reason: 'cells-not-written', status: 'understood', 'cell 8': 'abc', 'cell 9': '<5' });
    expect(row.detail).toContain('wet weight [g] (text-cell)');
    expect(row.detail).toContain('Length [mm] (text-cell)');
    expect(list.find((x) => x.line === '2')).toBeUndefined();
    expect(blockers(r)).not.toContain('CONV-ROW-NOT-UNDERSTOOD');
  });
});

describe('L1: a date cell is listed as stored and as the date the converter reads', () => {
  const HEADER = ['occurrenceID', 'eventID', 'scientificName', 'individualCount', 'decimalLatitude', 'decimalLongitude', 'eventDate'];
  const build = (extra?: Parameters<typeof xlsxFile>[2]) => {
    const file = xlsxFile('catch.xlsx', { S: [HEADER, ['o1', 'E1', 'Solea solea', 3, 54.1, 7.9, dateCell(44700.25)], ['o2', 'E1', null, 4, 54.1, 7.9, dateCell(44700.25)]] as never }, extra);
    const sheets = [sheetInput(file, { shape: 'long', quantity: { kind: 'count' }, device: { kind: 'known', key: 'multinet' } })];
    return listOf(csvOf(convert({ sheets, options: {} }), sheets));
  };
  it('the raw serial stays in the cell and the ISO date is in the detail; a 1904 workbook reads the same serial four years and a day later', () => {
    const a = build().find((x) => x.line === '3')!;
    expect(a['cell 7']).toBe('44700.25');
    expect(a.detail).toContain('eventDate: 2022-05-19');
    const b = build({ Workbook: { WBProps: { date1904: true } } } as never).find((x) => x.line === '3')!;
    expect(b['cell 7']).toBe('44700.25');
    expect(b.detail).toContain('eventDate: 2026-05-20');
  });
});

describe('L2 and L4: a sheet left out whole is one line with its count', () => {
  const ledger = (kind: 'not-used' | 'not-read', reason: string, n: number): SheetLedger => ({ file: 'f.xlsx', sheet: 'Env', kind, unit: 'rows', rows: { source: n, written: 0, skipped: [{ reason: reason as never, count: n }], unexplained: 0 }, columns: [], lines: [], notUnderstood: 0, balanced: true });
  it('a sheet not used and a pivoted sheet not read (no lines kept) each give one sheet line with the number of rows and the reason', () => {
    const rows = [...notWrittenRows([ledger('not-used', 'sheet-not-used', 40), ledger('not-read', 'sheet-not-read', 7)], [])];
    expect(rows.map((r) => [r.kind, r.sheet, r.reason, r.status, r.cells])).toEqual([
      ['sheet', 'Env', 'sheet-not-used', 'left-out', [40]],
      ['sheet', 'Env', 'sheet-not-read', 'needs-decision', [7]],
    ]);
    expect(countNotWritten([ledger('not-used', 'sheet-not-used', 40), ledger('not-read', 'sheet-not-read', 7)])).toEqual({ rows: 0, sheets: 2 });
  });
});

describe('L3: the faults block', () => {
  it('a written line whose lost cell has no reason is asked as "unexplained" and blocks', () => {
    const r = convert({ sheets: [sheetInput(fileOf(W1_HEADER, W1_ROWS), { quantity: W1_QUANTITY, device: { kind: 'known', key: 'multinet' } })], options: {} });
    const fake: SheetLedger = { ...r.ledger[0], lines: [{ line: 2, fate: 'written', lostCells: [{ index: 9, reason: 'unexplained' }] }] };
    const sheets = [sheetInput(fileOf(W1_HEADER, W1_ROWS), { quantity: W1_QUANTITY, device: { kind: 'known', key: 'multinet' } })];
    const d = decideRows([fake], sheets, []);
    expect(d.findings.map((f) => [f.ruleId, f.params.reason, f.lines])).toEqual([['CONV-ROW-NOT-UNDERSTOOD', 'unexplained', [2]]]);
    const rows = [...notWrittenRows([fake], sheets)];
    expect(rows.find((x) => x.kind === 'lost-cells')?.status).toBe('needs-decision');
  });
});

describe('L7 and L8: one message for the same lines, and the tip of the companion file', () => {
  it('the warning about a number with no taxon gives way to the question before the answer, not only after it', () => {
    const header = ['occurrenceID', 'eventID', 'scientificName', 'individualCount', 'decimalLatitude', 'decimalLongitude', 'eventDate'];
    const rows: Cell[][] = [['o1', 'E1', 'Solea solea', 3, 54.1, 7.9, '2022-05-05'], ['o2', 'E1', null, 4, 54.1, 7.9, '2022-05-05']];
    const r = convert({ sheets: [sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' }, device: { kind: 'known', key: 'multinet' } })], options: {} });
    expect(ofRule(r, 'CONV-TAXON-EMPTY-ROW')).toHaveLength(0);
    expect(ofRule(r, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(1);
  });

  it('the tip says what starts ticked and that the answers about rows hold only for the same counts, in four languages', () => {
    const logic = (t: Record<string, string>): string => t['tip.convertCompanion.logic'];
    expect(logic(tipEn as never)).toMatch(/never start ticked/);
    expect(logic(tipEn as never)).toMatch(/same number of rows/);
    expect(logic(tipPl as never)).toMatch(/nie startują zaznaczone/);
    expect(logic(tipPl as never)).toMatch(/tyle samo wierszy/);
    expect(logic(tipDe as never)).toMatch(/nie vorab angehakt/);
    expect(logic(tipDe as never)).toMatch(/gleich viele Zeilen/);
    expect(logic(tipFr as never)).toMatch(/ne démarrent jamais cochées/);
    expect(logic(tipFr as never)).toMatch(/même nombre de lignes/);
    for (const t of [tipEn, tipPl, tipDe, tipFr]) expect(logic(t as never)).not.toMatch(/choices start ticked|wybory zaczną jako zaznaczone|Entscheidungen sind schon angehakt|choix démarrent cochés/);
  });
});

describe('L3b: a line of a pivoted sheet that no fate was given to is a line of its own, unexplained, and blocks', () => {
  it('a long-file line the pivot counted and never placed (the fault path, made by adding a line the pivot does not know)', () => {
    const HP = ['Station', 'Date', 'Depth [m]', 'Parameter', 'Value', 'Unit'];
    const data: Cell[][] = [['S1', '2020-06-01', null, 'Temperature', 11, 'C'], ['S1', '2020-06-01', null, 'Depth', 4, 'm'], ['S2', '2020-06-01', null, 'Temperature', 12, 'C'], ['S2', '2020-06-01', null, 'Depth', 5, 'm']];
    const file = pivotConvertFile(fileOf(HP, data, 'Long'), {});
    const pivot = file.sheets[0].pivot!;
    pivot.lines.sourceRows += 1;
    pivot.source.rows.push({ line: 99, cells: ['S9', '2020-06-01', null, 'Temperature', 13, 'C'], fieldCount: 6 });
    const sheets = [sheetInput(file, { shape: 'wide', quantity: { kind: 'count' }, edit: { Station: { kind: 'sampleId' }, 'Depth [m]': { kind: 'ignore' } } })];
    const r = convert({ sheets, options: {} });
    expect(r.ledger[0].lines.map((l) => [l.line, l.fate])).toEqual([[99, 'unexplained']]);
    expect(ofRule(r, 'CONV-ROW-NOT-UNDERSTOOD').map((f) => [f.params.reason, f.lines])).toEqual([['unexplained', [99]]]);
    expect(blockers(r)).toContain('CONV-ROW-NOT-UNDERSTOOD');
  });
});

describe('Fix round 2', () => {
  const HEADER = ['sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Size', 'Quantity', 'Weight'];
  const EDIT: Record<string, ColumnRole> = {
    sample: { kind: 'sampleId' },
    Species: { kind: 'taxon' },
    Quantity: { kind: 'quantity' },
    Weight: { kind: 'biomass', basis: 'wet' },
    Size: { kind: 'variable', variable: 'body length', unit: 'cm', unitSource: 'user', perOccurrence: true },
  };
  const TAXA = ['Solea solea', 'Merlangius merlangus'];
  const rows = (): Cell[][] => {
    const out: Cell[][] = [];
    for (let s = 1; s <= 10; s++) for (let t = 0; t < 2; t++) for (let c = 0; c < 3; c++) out.push([`s${s}`, '2020-06-01', 49.4 + s / 100, 0.2, TAXA[t], 8 + c, 20 + 7 * s + 3 * t, 100 + s * 3 + t]);
    return out;
  };
  const mk = (data: Cell[][], extra: Partial<ConvertSheetInput> = {}): ConvertSheetInput[] => [sheetInput(fileOf(HEADER, data, 'S', { fileName: 'catch.csv' }), { shape: 'long', quantity: { kind: 'count' }, edit: EDIT, ...extra })];

  it('N1: "real counts" is said with the sheet and the count, as from the page or from the file, and the copies check is back when the answer is taken back', () => {
    // plus a sample of its own whose one row is written twice, exactly: a copy that is not a size class
    const copy: Cell[] = ['s11', '2020-06-01', 49.5, 0.2, TAXA[0], 9, 33, 77];
    const data = [...rows(), copy, copy];
    const open = convert({ sheets: mk(data), options: {} });
    const covered = Number(ofRule(open, 'CONV-QUANTITY-REPEATED')[0].params.covered);
    const page = convert({ sheets: mk(data, { realCountsRows: covered }), options: {} });
    expect(ofRule(page, 'CONV-QUANTITY-REAL-COUNTS').map((f) => [f.sheet, f.params.count, f.params.fromFile])).toEqual([['S', covered, undefined]]);
    expect(ofRule(page, 'CONV-QUANTITY-REPEATED')).toHaveLength(0);
    expect(ofRule(page, 'CONV-ROW-COPIES')).toHaveLength(0);
    const file = convert({ sheets: mk(data, { realCountsRowsFile: covered }), options: {} });
    expect(ofRule(file, 'CONV-QUANTITY-REAL-COUNTS')[0].params).toMatchObject({ count: covered, fromFile: 'yes' });
    // taken back: both questions are back
    expect(ofRule(open, 'CONV-QUANTITY-REAL-COUNTS')).toHaveLength(0);
    expect(ofRule(open, 'CONV-QUANTITY-REPEATED')).toHaveLength(1);
    expect(ofRule(open, 'CONV-ROW-COPIES')).toHaveLength(1);
    // another number of rows: not applied, no message
    const stale = convert({ sheets: mk(data, { realCountsRowsFile: covered + 3 }), options: {} });
    expect(ofRule(stale, 'CONV-QUANTITY-REAL-COUNTS')).toHaveLength(0);
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      for (const count of [1, 2, 5]) {
        const t = renderConvertPlain({ ruleId: 'CONV-QUANTITY-REAL-COUNTS', severity: 'info', file: 'f.csv', sheet: 'S', params: { count, fromFile: 'yes' } } as never, lang);
        expect(t, `${lang} ${count}`).not.toMatch(/[{}]/);
      }
    }
  });

  it('N4: the label of a row with a station or a note and no taxon and no value says so, in four languages', () => {
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) expect(UI[lang]['convert.ledger.reason.sample-no-taxon' as never]).toBeTruthy();
    expect(UI.en['convert.ledger.reason.sample-no-taxon' as never]).toMatch(/station.*note.*no taxon and no value/);
    expect(UI.pl['convert.ledger.reason.sample-no-taxon' as never]).toMatch(/stacją.*uwagą/);
    expect(UI.de['convert.ledger.reason.sample-no-taxon' as never]).toMatch(/Station.*Notiz/);
    expect(UI.fr['convert.ledger.reason.sample-no-taxon' as never]).toMatch(/station.*note/);
  });

  it('N5: the text about an old companion file has the number in every language', () => {
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) for (const count of [1, 2, 5]) {
      const t = renderConvertPlain({ ruleId: 'CONV-COMPANION-OLD', severity: 'info', params: { count } } as never, lang);
      expect(t, `${lang} ${count}`).not.toMatch(/[{}]/);
      expect(t).toContain(String(count));
    }
  });
});

describe('R2-L1: a bare tick in a request changes nothing (only count-tied answers reach the converter)', () => {
  it('realCounts, totalOnce and dropCopies set to true in a request are not forwarded: the findings are those of the request without them', () => {
    const HEADER = ['sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Size', 'Quantity', 'Weight'];
    const TAXA = ['Solea solea', 'Merlangius merlangus'];
    const rows: Cell[][] = [];
    for (let s = 1; s <= 10; s++) for (let t = 0; t < 2; t++) for (let c = 0; c < 3; c++) rows.push([`s${s}`, '2020-06-01', 49.4 + s / 100, 0.2, TAXA[t], 8 + c, 20 + 7 * s + 3 * t, 100 + s * 3 + t]);
    const text = [HEADER, ...rows].map((r) => r.join(',')).join('\n') + '\n';
    const h = createConvertHandler();
    const parsed = h.handle({ type: 'parse', files: [{ name: 'catch.csv', bytes: new TextEncoder().encode(text), source: 'dropped' }] } as never) as never as Parameters<typeof initialChoices>[0] & { files: { fileId: string; mappings: { sheet: string; columns: { header: string; role: ColumnRole }[] }[] }[] };
    const roles: Record<string, ColumnRole> = { sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Quantity: { kind: 'quantity' }, Weight: { kind: 'biomass', basis: 'wet' } };
    const mappings = Object.fromEntries(parsed.files.map((f) => [f.fileId, f.mappings.map((m) => ({ ...m, columns: m.columns.map((c) => (roles[c.header] ? { ...c, role: roles[c.header] } : c)) }))]));
    const choices = initialChoices(parsed);
    for (const k of Object.keys(choices)) choices[k] = { ...choices[k], shape: 'long', quantity: { ...EMPTY_QUANTITY, kind: 'count' } };
    const body = requestOf({ parsed, mappings: mappings as never, choices, options: { fullList: false, prefixStation: false, flatten: { station: false, cruise: false } }, approved: {}, confirmed: {} } as never);
    const ticked = { ...body, sheets: body.sheets.map((s) => ({ ...s, realCounts: true, totalOnce: true, dropCopies: true })) };
    const ids = (b: typeof body): string[] => ((h.handle({ type: 'convert', body: b } as never) as { findings: { ruleId: string }[] }).findings).map((f) => f.ruleId);
    const plain = ids(body);
    expect(plain).toContain('CONV-QUANTITY-REPEATED');
    expect(ids(ticked)).toEqual(plain);
  });
});
