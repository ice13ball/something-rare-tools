// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// mergeSampleSheets: the confirmed description row is attached to every results row; matching, lending, shared columns, provenance. Invented data.
import { describe, expect, it } from 'vitest';
import { Collector, metaParser, specsOf } from '../../src/core/dataset';
import { lendCell, mergeSampleSheets, resultsKeys, sameStructure } from '../../src/core/convert/sampleJoin';
import type { MergeResult, SampleJoinDecl } from '../../src/core/convert/sampleJoin';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import type { Finding } from '../../src/core/types';
import { parseNumber } from '../../src/core/values/numbers';
import { dateCell, textFile, xlsxFile } from '../helpers/files';
import type { Cell } from '../helpers/files';
import { BOOK, COUNTS_HEADER, COUNTS_ROWS, SAMPLES_CSV_COMMA, SAMPLES_HEADER, SAMPLES_ROWS, descriptionInput, resultsCsvFile, resultsInput } from './joinFixtures';

const KEY = [{ results: 0, description: 0 }];
const decl = (results: ConvertSheetInput, description: ConvertSheetInput, extra: Partial<SampleJoinDecl> = {}): SampleJoinDecl => ({ results, description, keys: KEY, conflicts: [], appendDescriptionOnly: true, ...extra });
const book = (extra: Partial<SampleJoinDecl> = {}, counts: Cell[][] = COUNTS_ROWS, samples: Cell[][] = SAMPLES_ROWS): MergeResult => {
  const file = counts === COUNTS_ROWS && samples === SAMPLES_ROWS ? BOOK : xlsxFile('book.xlsx', { Counts: [COUNTS_HEADER, ...counts], Samples: [SAMPLES_HEADER, ...samples] });
  return mergeSampleSheets(decl(resultsInput(file, 'Counts'), descriptionInput(file, 'Samples'), extra));
};
const found = (r: MergeResult, id: string): Finding[] => r.info.findings.filter((f) => f.ruleId === id);
const sheetOf = (r: MergeResult) => r.input.file.sheets.find((s) => s.name === r.input.sheet)!;
const rowAt = (r: MergeResult, line: number) => sheetOf(r).rows.find((x) => x.line === line)!;
const roleCols = (r: MergeResult, kind: string) => r.input.mapping.columns.filter((c) => c.role.kind === kind);
const TAX: Cell[] = ['Calanus finmarchicus', 3];

describe('mergeSampleSheets: book.xlsx', () => {
  it('attaches the description row to every results row (spec test 2)', () => {
    const r = book({ appendDescriptionOnly: false });
    const sheet = sheetOf(r);
    expect(r.input.sheet).toBe('Counts');
    expect(sheet.name).toBe('Counts');
    expect(sheet.rows).toHaveLength(3);
    expect(sheet.header.slice(0, 3)).toEqual(COUNTS_HEADER);
    expect(sheet.header.slice(3)).toEqual(['Sample (2)', 'Station', 'Date', 'Latitude', 'Longitude', 'Depth']);
    expect(rowAt(r, 2).cells.slice(4)).toEqual(['ST-1', '2021-05-03', 61.1, 4.2, 10]);
    expect(r.info.lentFrom.get(2)).toBe(2);
    expect(r.info.lentFrom.get(4)).toBe(3);
    expect(r.input.sampleJoin).toBe(r.info);
    const key = r.input.mapping.columns.find((c) => c.index === 3)!;
    expect(key.role.kind).toBe('ignore');
    expect(r.info.consumed.has(3)).toBe(true);
    expect(r.info.results.width).toBe(3);
    expect(r.info.columns.slice(0, 4)).toEqual([
      { side: 'results', index: 0, header: 'Sample' },
      { side: 'results', index: 1, header: 'Taxon' },
      { side: 'results', index: 2, header: 'Count' },
      { side: 'description', index: 0, header: 'Sample' },
    ]);
    expect(found(r, 'CONV-JOIN-NO-DESCRIPTION')).toEqual([]);
  });

  it('a description sample with no results is appended once, only when asked and not held elsewhere (spec test 3)', () => {
    const r = book();
    const sheet = sheetOf(r);
    expect(sheet.rows).toHaveLength(4);
    const added = sheet.rows[3];
    expect(added.line).toBeGreaterThan(4);
    expect(r.info.descriptionOnly.get(added.line)).toBe(4);
    expect(added.cells.slice(0, 3)).toEqual(['X03', null, null]);
    expect(added.cells.slice(4)).toEqual(['ST-3', '2021-05-05', 61.5, 4.9, 30]);
    expect(found(r, 'CONV-JOIN-DESCRIPTION-ONLY')).toEqual([expect.objectContaining({ severity: 'warning', params: expect.objectContaining({ count: 1, samples: 'X03' }) })]);
    expect(r.descriptionKeys).toEqual(new Set(['X01', 'X02', 'X03']));

    const held = book({ heldElsewhere: new Set(['X03']) });
    expect(sheetOf(held).rows).toHaveLength(3);
    expect(found(held, 'CONV-JOIN-DESCRIPTION-ONLY')).toEqual([]);
    const notFirst = book({ appendDescriptionOnly: false });
    expect(sheetOf(notFirst).rows).toHaveLength(3);
    expect(found(notFirst, 'CONV-JOIN-DESCRIPTION-ONLY')).toEqual([]);
  });

  it('a results sample with no description blocks until the person answered for that number (spec test 4)', () => {
    const counts: Cell[][] = [...COUNTS_ROWS, ['X04', 'Oithona similis', 1]];
    const bare = book({ appendDescriptionOnly: false }, counts);
    expect(found(bare, 'CONV-JOIN-NO-DESCRIPTION')).toEqual([
      expect.objectContaining({ severity: 'error', file: 'book.xlsx', sheet: 'Counts', lines: [5], params: expect.objectContaining({ count: 1, samples: 'X04', description: 'Samples' }) }),
    ]);
    expect(rowAt(bare, 5).cells.slice(3)).toEqual([null, null, null, null, null, null]);

    const answered = book({ appendDescriptionOnly: false, resultsOnly: 1 }, counts);
    expect(found(answered, 'CONV-JOIN-NO-DESCRIPTION')).toEqual([]);
    expect(found(answered, 'CONV-JOIN-RESULTS-ONLY')).toEqual([expect.objectContaining({ severity: 'info', params: expect.objectContaining({ count: 1, samples: 'X04' }) })]);
    expect(found(answered, 'CONV-JOIN-RESULTS-ONLY')[0].params.fromFile).toBeUndefined();
    expect(found(book({ appendDescriptionOnly: false, resultsOnly: 1, resultsOnlyFromFile: true }, counts), 'CONV-JOIN-RESULTS-ONLY')[0].params.fromFile).toBe('yes');

    const stale = book({ appendDescriptionOnly: false, resultsOnly: 2 }, counts);
    expect(found(stale, 'CONV-JOIN-NO-DESCRIPTION')).toHaveLength(1);
    expect(found(stale, 'CONV-JOIN-RESULTS-ONLY')).toEqual([]);
  });

  it('a key that is on several different description rows lends nothing and is listed with its lines (spec test 9)', () => {
    const samples: Cell[][] = [...SAMPLES_ROWS, ['X01', 'ST-1', '2021-05-03', 61.1, 4.2, 15]];
    const r = book({ appendDescriptionOnly: false }, COUNTS_ROWS, samples);
    expect(found(r, 'CONV-JOIN-AMBIGUOUS')).toEqual([
      expect.objectContaining({ severity: 'error', file: 'book.xlsx', sheet: 'Samples', lines: [2, 5], params: expect.objectContaining({ count: 1, keys: 'X01', description: 'Samples' }) }),
    ]);
    expect(r.info.ambiguous).toEqual([2, 5]);
    expect(r.info.lentFrom.has(2)).toBe(false);
    expect(rowAt(r, 2).cells.slice(3)).toEqual([null, null, null, null, null, null]);
    expect(found(r, 'CONV-JOIN-NO-DESCRIPTION')).toEqual([]);
  });

  it('a key repeated on identical rows is one row', () => {
    const samples: Cell[][] = [...SAMPLES_ROWS, ['X01', 'ST-1', '2021-05-03', 61.1, 4.2, 10]];
    const r = book({ appendDescriptionOnly: false }, COUNTS_ROWS, samples);
    expect(found(r, 'CONV-JOIN-AMBIGUOUS')).toEqual([]);
    expect(rowAt(r, 2).cells.slice(4)).toEqual(['ST-1', '2021-05-03', 61.1, 4.2, 10]);
    expect(r.info.lentFrom.get(2)).toBe(2);
  });

  it('a results row with a blank key is lent nothing, named, and counted with the samples that have no description', () => {
    const counts: Cell[][] = [...COUNTS_ROWS, [null, 'Oithona similis', 1]];
    const r = book({ appendDescriptionOnly: false }, counts);
    expect(found(r, 'CONV-JOIN-KEY-BLANK')).toEqual([
      expect.objectContaining({ severity: 'error', file: 'book.xlsx', sheet: 'Counts', lines: [5], params: expect.objectContaining({ side: 'results', count: 1, columns: 'Sample' }) }),
    ]);
    expect(rowAt(r, 5).cells.slice(3)).toEqual([null, null, null, null, null, null]);
    expect(found(r, 'CONV-JOIN-NO-DESCRIPTION')).toEqual([expect.objectContaining({ lines: [5], params: expect.objectContaining({ count: 1 }) })]);
    // the person's answer covers it: the same number, no blocking finding left for the row
    const answered = book({ appendDescriptionOnly: false, resultsOnly: 1 }, counts);
    expect(found(answered, 'CONV-JOIN-KEY-BLANK')).toEqual([]);
    expect(found(answered, 'CONV-JOIN-NO-DESCRIPTION')).toEqual([]);
    expect(found(answered, 'CONV-JOIN-RESULTS-ONLY')).toEqual([expect.objectContaining({ params: expect.objectContaining({ count: 1 }) })]);
  });

  it('a description row with a blank key is left out and listed; nothing of it reaches a merged row (F14)', () => {
    const samples: Cell[][] = [...SAMPLES_ROWS, [null, 'ST-9', '2021-05-09', 61.9, 4.9, 33]];
    const r = book({ appendDescriptionOnly: false }, COUNTS_ROWS, samples);
    expect(found(r, 'CONV-JOIN-KEY-BLANK')).toEqual([
      expect.objectContaining({ severity: 'error', file: 'book.xlsx', sheet: 'Samples', lines: [5], params: expect.objectContaining({ side: 'description', count: 1 }) }),
    ]);
    expect(r.info.noKey).toEqual([5]);
    for (const row of sheetOf(r).rows) expect(row.cells).not.toContain(33);
    expect(r.info.description.sheet.name).toBe('Samples');
  });

  it('the description answers of the blank-key question travel with the info', () => {
    const file = BOOK;
    const r = mergeSampleSheets(decl(resultsInput(file, 'Counts'), descriptionInput(file, 'Samples', { leaveOut: ['x'], leaveOutFile: [{ reason: 'y', count: 1, rows: 3 }] })));
    expect(r.info.description.leaveOut).toEqual(['x']);
    expect(r.info.description.leaveOutFile).toEqual([{ reason: 'y', count: 1, rows: 3 }]);
  });
});

describe('mergeSampleSheets: keys', () => {
  it('Cruise + Station: each row gets the row of its own cruise (spec test 10)', () => {
    const file = xlsxFile('b.xlsx', {
      Counts: [['Cruise', 'Station', 'Taxon', 'Count'], ['C1', 'ST-1', ...TAX], ['C2', 'ST-1', ...TAX]],
      Samples: [['Cruise', 'Station', 'Date'], ['C1', 'ST-1', '2021-05-03'], ['C2', 'ST-1', '2021-06-03']],
    });
    const r = mergeSampleSheets(decl(resultsInput(file, 'Counts'), descriptionInput(file, 'Samples'), { keys: [{ results: 0, description: 0 }, { results: 1, description: 1 }] }));
    expect(rowAt(r, 2).cells[6]).toBe('2021-05-03');
    expect(rowAt(r, 3).cells[6]).toBe('2021-06-03');
    expect(found(r, 'CONV-JOIN-AMBIGUOUS')).toEqual([]);
    expect(r.info.consumed.has(4)).toBe(true);
    expect(r.info.consumed.has(5)).toBe(true);
  });

  it('two samples of one station both get the station row (C2)', () => {
    const file = xlsxFile('b.xlsx', {
      Counts: [['Sample', 'Station', 'Taxon', 'Count'], ['X01', 'ST-1', ...TAX], ['X01b', 'ST-1', ...TAX]],
      Samples: [['Station', 'Date'], ['ST-1', '2021-05-03']],
    });
    const r = mergeSampleSheets(decl(resultsInput(file, 'Counts'), descriptionInput(file, 'Samples'), { keys: [{ results: 1, description: 0 }] }));
    expect(r.info.lentFrom.get(2)).toBe(2);
    expect(r.info.lentFrom.get(3)).toBe(2);
    expect(r.info.notChosen).toEqual([]);
    expect(rowAt(r, 3).cells.slice(5)).toEqual(['2021-05-03']);
  });

  it('a typed 1 and the text "1" are the same key; the text "1.0" is not the typed 1', () => {
    const typed = xlsxFile('t.xlsx', { Counts: [COUNTS_HEADER, [1, 'Calanus finmarchicus', 4]] });
    const text = textFile('s.csv', 'Sample,Station\n1,ST-1\n');
    const a = mergeSampleSheets(decl(resultsInput(typed, 'Counts'), descriptionInput(text, text.sheets[0].name), { appendDescriptionOnly: false }));
    expect(a.info.lentFrom.get(2)).toBe(2);
    expect(found(a, 'CONV-JOIN-NO-DESCRIPTION')).toEqual([]);

    const dotted = textFile('r.csv', 'Sample,Taxon,Count\n1.0,Calanus finmarchicus,4\n');
    const num = xlsxFile('n.xlsx', { Samples: [['Sample', 'Station'], [1, 'ST-1']] });
    const b = mergeSampleSheets(decl(resultsInput(dotted, dotted.sheets[0].name), descriptionInput(num, 'Samples'), { appendDescriptionOnly: false }));
    expect(found(b, 'CONV-JOIN-NO-DESCRIPTION')).toEqual([expect.objectContaining({ params: expect.objectContaining({ samples: '1.0' }) })]);
  });

  it('resultsKeys is the set of the non-blank key values of the results sheet', () => {
    const file = xlsxFile('b.xlsx', { Counts: [COUNTS_HEADER, ['X01', ...TAX], ['X02', ...TAX], [null, ...TAX], ['X01', ...TAX]] });
    expect(resultsKeys(resultsInput(file, 'Counts'), KEY)).toEqual(new Set(['X01', 'X02']));
  });
});

describe('mergeSampleSheets: columns', () => {
  const depthBook = (countsDepth: [string, Cell][]): MergeResult => {
    const file = xlsxFile('book.xlsx', { Counts: [[...COUNTS_HEADER, 'Depth'], ...countsDepth.map(([s, d]): Cell[] => [s, 'Calanus finmarchicus', 5, d])], Samples: [SAMPLES_HEADER, ...SAMPLES_ROWS] });
    return mergeSampleSheets(decl(resultsInput(file, 'Counts'), descriptionInput(file, 'Samples'), { appendDescriptionOnly: false }));
  };

  it('a quantity on both sides is one column: a blank results cell is filled and said (spec test 8)', () => {
    const r = depthBook([['X01', null], ['X02', 20]]);
    expect(rowAt(r, 2).cells[3]).toBe(10);
    expect(rowAt(r, 3).cells[3]).toBe(20);
    expect(found(r, 'CONV-JOIN-FILLED')).toEqual([expect.objectContaining({ severity: 'info', params: expect.objectContaining({ count: 1, column: 'Depth', from: 'Samples' }) })]);
    expect(r.info.takenFromDescription.get('2:3')).toBe(2);
    expect(r.info.takenFromDescription.has('3:3')).toBe(false);
    expect(roleCols(r, 'depth').map((c) => c.index)).toEqual([3]);
    const lent = r.input.mapping.columns.find((c) => c.index === 4 + 5)!;
    expect(lent.header).toBe('Depth (2)');
    expect(lent.role.kind).toBe('ignore');
    expect(r.info.consumed.has(9)).toBe(true);
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([]);
    // the description's own value stays visible in the consumed column
    expect(rowAt(r, 2).cells[9]).toBe(10);
  });

  it('a value that differs on both sides blocks, ungrouped, and neither side is overwritten', () => {
    const r = depthBook([['X01', 10], ['X02', 25]]);
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([
      expect.objectContaining({ severity: 'error', file: 'book.xlsx', sheet: 'Counts', lines: [3], params: expect.objectContaining({ group: '', count: 1, total: 1, what: 'Depth', examples: '20 / 25' }) }),
    ]);
    expect(rowAt(r, 3).cells[3]).toBe(25);
    expect(rowAt(r, 3).cells[9]).toBe(20);
    expect(found(r, 'CONV-JOIN-FILLED')).toEqual([]);
  });

  it('a quantity whose structure differs between the sides is not merged into one: its description value cannot be written, so it blocks', () => {
    const file = xlsxFile('book.xlsx', { Counts: [[...COUNTS_HEADER, 'Depth [ft]'], ['X01', 'Calanus finmarchicus', 5, 33]], Samples: [SAMPLES_HEADER, ...SAMPLES_ROWS] });
    const r = mergeSampleSheets(decl(resultsInput(file, 'Counts'), descriptionInput(file, 'Samples'), { appendDescriptionOnly: false }));
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([expect.objectContaining({ params: expect.objectContaining({ group: '', count: 1 }) })]);
    expect(r.info.consumed.has(9)).toBe(false);
  });

  it('sameStructure compares role kinds, bounds, units and date formats', () => {
    const file = xlsxFile('b.xlsx', { A: [['Depth [m]', 'Depth'], [1, 2]], B: [['Depth [m]'], [1]], C: [['Depth [ft]'], [1]], D: [['Depth'], [1]] });
    const side = (name: string, columns: number[]) => {
      const input = descriptionInput(file, name);
      return { file: input.file, sheet: input.file.sheets[0], mapping: input.mapping, columns };
    };
    expect(sameStructure(side('A', [0]), side('B', [0]))).toBe(true);
    expect(sameStructure(side('A', [0]), side('C', [0]))).toBe(false);
    expect(sameStructure(side('A', [0]), side('D', [0]))).toBe(false);
    expect(sameStructure(side('A', [0, 1]), side('B', [0]))).toBe(false);
  });

  it('a description header equal to a variable of the results sheet is told apart, and keeps its own header in the provenance', () => {
    const file = xlsxFile('book.xlsx', { Counts: [[...COUNTS_HEADER, 'Depth'], ['X01', 'Calanus finmarchicus', 5, 7]], Samples: [SAMPLES_HEADER, ...SAMPLES_ROWS] });
    const r = mergeSampleSheets(
      decl(resultsInput(file, 'Counts'), descriptionInput(file, 'Samples', { edit: { Depth: { kind: 'variable', variable: 'Depth', unit: 'm' } } } as never), { appendDescriptionOnly: false }),
    );
    const w = 4;
    expect(sheetOf(r).header.filter((h) => h.startsWith('Depth'))).toEqual(['Depth', 'Depth (2)']);
    expect(r.info.columns[w + 5]).toEqual({ side: 'description', index: 5, header: 'Depth' });
    expect(roleCols(r, 'depth').map((c) => c.index)).toEqual([3]);
    expect(roleCols(r, 'variable').map((c) => c.index)).toEqual([w + 5]);
    expect(r.info.consumed.has(w + 5)).toBe(false);
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([]);
  });
});

describe('mergeSampleSheets: the results file conventions (F2)', () => {
  it('a decimal comma is lent in the results file point, and the original is kept', () => {
    const res = resultsCsvFile();
    const des = textFile('samples.csv', SAMPLES_CSV_COMMA);
    const r = mergeSampleSheets(decl(resultsInput(res, res.sheets[0].name), descriptionInput(des, des.sheets[0].name), { appendDescriptionOnly: false }));
    const lat = 3 + 3;
    const cell = rowAt(r, 2).cells[lat];
    expect(cell).toBe('61.1');
    expect(parseNumber(cell, false)).toMatchObject({ status: 'ok', value: 61.1 });
    expect(r.info.rewritten.get(`2:${lat}`)).toBe('61,1');
    expect(r.info.rewritten.has('2:3')).toBe(false);
  });

  const sheetWithDate = (serial: number, date1904: boolean) => {
    const rows: Cell[][] = SAMPLES_ROWS.map((row, i) => (i === 0 ? [row[0], row[1], dateCell(serial), ...row.slice(3)] : row));
    return xlsxFile('s.xlsx', { Samples: [SAMPLES_HEADER, ...rows] }, date1904 ? ({ Workbook: { WBProps: { date1904: true } } } as never) : undefined);
  };

  it('a date serial of a 1904 workbook is lent as the date it means in a file that is not 1904', () => {
    const res = resultsCsvFile();
    const des = sheetWithDate(42857, true);
    const r = mergeSampleSheets(decl(resultsInput(res, res.sheets[0].name), descriptionInput(des, 'Samples'), { appendDescriptionOnly: false }));
    expect(rowAt(r, 2).cells[3 + 2]).toBe('2021-05-03');
    expect(r.info.rewritten.get('2:5')).toBe(42857);
  });

  it('the same serial of a 1900 workbook is lent as it is, and still reads as that date', () => {
    const res = resultsCsvFile();
    const des = sheetWithDate(44319, false);
    const r = mergeSampleSheets(decl(resultsInput(res, res.sheets[0].name), descriptionInput(des, 'Samples'), { appendDescriptionOnly: false }));
    expect(rowAt(r, 2).cells[5]).toBe(44319);
    expect(r.info.rewritten.size).toBe(0);
    const sheet = sheetOf(r);
    expect(sheet.dateFormatted?.[5]).toBe(true);
    expect(sheet.dateFormatted?.[0]).toBe(false);
    const meta = metaParser(r.input.file, sheet, specsOf(r.input.mapping), new Collector('x'))(rowAt(r, 2));
    expect(meta.datetime?.iso).toBe('2021-05-03');
  });

  it('lendCell: same convention verbatim; a comma number, a date serial and plain text', () => {
    const csvPoint = textFile('a.csv', 'a,b\n1,2\n');
    const csvComma = textFile('b.csv', 'a;b\n1,5;2\n');
    const from = (file: typeof csvPoint, column = 0) => ({ file, sheet: file.sheets[0], column });
    expect(lendCell('61,1', from(csvPoint), csvPoint)).toEqual({ cell: '61,1', rewritten: false });
    expect(lendCell('61,1', from(csvComma), csvPoint)).toEqual({ cell: '61.1', rewritten: true });
    expect(lendCell('61.10', from(csvPoint), csvComma)).toEqual({ cell: '61,10', rewritten: true });
    expect(lendCell('ST-1', from(csvComma), csvPoint)).toEqual({ cell: 'ST-1', rewritten: false });
    expect(lendCell('10', from(csvComma), csvPoint)).toEqual({ cell: '10', rewritten: false });
    expect(lendCell(null, from(csvComma), csvPoint)).toEqual({ cell: null, rewritten: false });
    expect(lendCell(7, from(csvComma), csvPoint)).toEqual({ cell: 7, rewritten: false });
  });

  it('a time of day is lent as it is, not as a date of the other epoch', () => {
    const res = resultsCsvFile();
    const rows: Cell[][] = [['X01', 'ST-1', { t: 'n', v: 0.5, z: 'hh:mm' }], ['X02', 'ST-2', { t: 'n', v: 0.25, z: 'hh:mm' }]];
    const des = xlsxFile('s.xlsx', { Samples: [['Sample', 'Station', 'Time'], ...rows] }, { Workbook: { WBProps: { date1904: true } } } as never);
    const r = mergeSampleSheets(decl(resultsInput(res, res.sheets[0].name), descriptionInput(des, 'Samples'), { appendDescriptionOnly: false }));
    expect(rowAt(r, 2).cells[3 + 2]).toBe(0.5);
    expect(r.info.rewritten.size).toBe(0);
  });

  it('a column that shows milliseconds keeps them when a date serial is rewritten', () => {
    const csv = textFile('a.csv', 'a\n1\n');
    const sheet = { name: 'S', header: ['d'], headerLine: 1, rows: [], dateFormatted: [true], fractionShown: [true] };
    const from = { file: { ...csv, date1904: true }, sheet, column: 0 };
    expect(lendCell(42857.5000116, from, csv)).toEqual({ cell: '2021-05-03T12:00:01.002', rewritten: true });
    expect(lendCell(42857.5000116, { ...from, sheet: { ...sheet, fractionShown: [false] } }, csv).cell).toBe('2021-05-03T12:00:01');
    expect(lendCell(42857.5, { ...from, sheet: { ...sheet, fractionShown: [false] } }, csv)).toEqual({ cell: '2021-05-03T12:00', rewritten: true });
  });

  it('a text its own file does not read as a number is not lent as a number: blank, kept in the provenance and reported when the results file would read it as one', () => {
    const res = textFile('r.csv', 'Sample;Taxon;Count\nX01;Calanus finmarchicus;4\n'); // decimal point, ';' separated
    const resComma = textFile('rc.csv', 'Sample;Taxon;Count\nX01;Calanus finmarchicus;4,5\n');
    expect(resComma.decimalComma).toBe(true);
    const des = textFile('s.csv', 'Sample,Station,Depth\nX01,ST-1,"1,5"\n'); // a point file with the text 1,5
    expect(des.decimalComma).toBe(false);
    const r = mergeSampleSheets(decl(resultsInput(resComma, resComma.sheets[0].name), descriptionInput(des, des.sheets[0].name), { appendDescriptionOnly: false }));
    const cell = rowAt(r, 2).cells[3 + 2];
    expect(cell).toBeNull();
    expect(parseNumber(cell, resComma.decimalComma).status).not.toBe('ok');
    expect(r.info.rewritten.get('2:5')).toBe('1,5');
    expect(found(r, 'ROW-NON-NUMERIC')).toEqual([expect.objectContaining({ file: 's.csv', field: 'Depth', lines: [2], value: '1,5' })]);
    // a number the file reads as one is rewritten, not reported
    const ok = mergeSampleSheets(decl(resultsInput(res, res.sheets[0].name), descriptionInput(textFile('s2.csv', 'Sample;Station;Depth\nX01;ST-1;1,5\n'), 's2.csv'), { appendDescriptionOnly: false }));
    expect(found(ok, 'ROW-NON-NUMERIC')).toEqual([]);
    expect(rowAt(ok, 2).cells[3 + 2]).toBe('1.5');
  });
});
