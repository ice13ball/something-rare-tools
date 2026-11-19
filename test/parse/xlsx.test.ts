// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { isPercentFormat, parseXlsx, percentValue } from '../../src/core/parse/xlsx';
import { parseFile, ParseError } from '../../src/core/parse';

type Cell = XLSX.CellObject;
const wbOf = (sheets: Record<string, XLSX.WorkSheet>, extra?: Partial<XLSX.WorkBook>): Uint8Array => {
  const wb = XLSX.utils.book_new();
  for (const [n, ws] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, ws, n);
  Object.assign(wb, extra);
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};
const aoa = (rows: unknown[][], origin = 'A1') => XLSX.utils.sheet_add_aoa(XLSX.utils.aoa_to_sheet([]), rows as never, { origin });
const dateCell = (v: number): Cell => ({ t: 'n', v, z: 'yyyy-mm-dd' });

describe('parseXlsx', () => {
  it('keeps plain numbers as numbers, including negatives', () => {
    const f = parseXlsx(wbOf({ S: aoa([['name', 'val'], ['ST1', -5.2], ['ST2', 3]]) }), 'x.xlsx');
    expect(f.kind).toBe('xlsx');
    expect(f.sheets[0].header).toEqual(['name', 'val']);
    expect(f.sheets[0].rows[0].cells).toEqual(['ST1', -5.2]);
    expect(f.sheets[0].rows[1].cells[1]).toBe(3);
  });

  it('flags date-formatted columns by majority and leaves plain numbers alone', () => {
    const ws = aoa([['id', 'when', 'n', 'mixed'], [1, dateCell(45000), 7, dateCell(45001)], [2, dateCell(45001), 8, 5], [3, dateCell(45002), 9, 6]]);
    const f = parseXlsx(wbOf({ S: ws }), 'd.xlsx');
    expect(f.sheets[0].dateFormatted).toEqual([false, true, false, false]);
    expect(f.sheets[0].rows[0].cells[1]).toBe(45000); // serial kept, conversion is the date parser's job
    expect(f.date1904).toBe(false);
  });

  it('reads a 1904 workbook and emits IN-DATE1904', () => {
    const f = parseXlsx(
      wbOf({ S: aoa([['a', 'when'], [1, dateCell(43538)]]) }, { Workbook: { WBProps: { date1904: true } } } as never),
      'd1904.xlsx',
    );
    expect(f.date1904).toBe(true);
    expect(f.findings.map((x) => x.ruleId)).toEqual(['IN-DATE1904']);
  });

  it('returns one RawSheet per non-empty sheet, hidden sheets included', () => {
    const f = parseXlsx(
      wbOf(
        { A: aoa([['a', 'b'], [1, 2]]), Empty: XLSX.utils.aoa_to_sheet([]), Hid: aoa([['c', 'd'], [3, 4]]) },
        { Workbook: { Sheets: [{ Hidden: 0 }, { Hidden: 0 }, { Hidden: 1 }] } } as never,
      ),
      'm.xlsx',
    );
    expect(f.sheets.map((s) => s.name)).toEqual(['A', 'Hid']);
  });

  it('uses Excel row numbers, skips title rows and keeps columns aligned to column A', () => {
    // title in row 2 (one text cell), header in row 4 starting at column B, data from row 5; row 6 empty
    const ws = aoa([['Some title']], 'A2');
    XLSX.utils.sheet_add_aoa(ws, [['st', 'val', 2020], ['ST1', 1.5, 'x'], [], ['ST2', 2.5, 'y']] as never, { origin: 'B4' });
    const s = parseXlsx(wbOf({ S: ws }), 'r.xlsx').sheets[0];
    expect(s.headerLine).toBe(4);
    expect(s.header).toEqual(['', 'st', 'val', '2020']);
    expect(s.rows.map((r) => r.line)).toEqual([5, 7]);
    expect(s.rows[0].cells).toEqual([null, 'ST1', 1.5, 'x']);
    expect(s.rows[0].fieldCount).toBe(4);
  });

  it('keeps empty cells as null and aligned, and trims text', () => {
    const ws = aoa([['a', 'b', 'c'], ['  x  ', null, 3]]);
    const s = parseXlsx(wbOf({ S: ws }), 'e.xlsx').sheets[0];
    expect(s.rows[0].cells).toEqual(['x', null, 3]);
  });

  it('uses the cached value of a formula cell and never evaluates', () => {
    const ws = aoa([['a', 'b'], [2, null]]);
    ws['B2'] = { t: 'n', f: 'A2*100', v: 7 } as Cell;
    ws['!ref'] = 'A1:B2';
    const s = parseXlsx(wbOf({ S: ws }), 'f.xlsx').sheets[0];
    expect(s.rows[0].cells).toEqual([2, 7]);
  });

  it('does not align merged cells: the value stays in the top-left cell', () => {
    const ws = aoa([['a', 'b', 'c'], ['m', null, 'z']]);
    ws['!merges'] = [XLSX.utils.decode_range('A2:B2')];
    const s = parseXlsx(wbOf({ S: ws }), 'mg.xlsx').sheets[0];
    expect(s.rows[0].cells).toEqual(['m', null, 'z']);
  });

  it('parses a legacy .xls (BIFF8) through parseFile', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, aoa([['a', 'b'], [1, 2]]), 'S');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'biff8' }));
    expect(Array.from(bytes.slice(0, 4))).toEqual([0xd0, 0xcf, 0x11, 0xe0]);
    const f = parseFile('old.xls', bytes);
    expect(f.kind).toBe('xlsx');
    expect(f.sheets[0].rows[0].cells).toEqual([1, 2]);
  });

  it('throws ParseError, not a raw library error, on a corrupt workbook', () => {
    const bad = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]);
    expect(() => parseFile('bad.xlsx', bad)).toThrow(ParseError);
  });
});

describe('a percent number format is read as displayed', () => {
  it('percentValue moves the decimal point exactly', () => {
    const cases: [number, number][] = [[0.95, 95], [0.123, 12.3], [1.005, 100.5], [0.07, 7], [-0.5, -50], [1e-7, 0.00001], [0, 0], [0.955, 95.5], [1, 100], [1.5e-10, 1.5e-8], [12345678.9, 1234567890], [-1e-7, -0.00001]];
    for (const [v, want] of cases) expect(percentValue(v), String(v)).toBe(want);
  });
  it('isPercentFormat ignores quoted and escaped percent signs', () => {
    for (const z of ['0%', '0.00%', '[Red]0.0%']) expect(isPercentFormat(z), z).toBe(true);
    for (const z of ['0"%"', '0\\%', 'General', '0.00', '@']) expect(isPercentFormat(z), z).toBe(false);
  });
  it('reads percent cells as shown, notes the column once, leaves plain and date cells alone', () => {
    const ws = aoa([['O2 sat [%]', 'plain', 'when'], [{ t: 'n', v: 0.95, z: '0%' }, 0.95, dateCell(45000)], [{ t: 'n', v: 0.955, z: '0%' }, 0.07, dateCell(45001)]]);
    const f = parseXlsx(wbOf({ S: ws }), 'p.xlsx');
    expect(f.sheets[0].rows.map((r) => r.cells[0])).toEqual([95, 95.5]);
    expect(f.sheets[0].rows.map((r) => r.cells[1])).toEqual([0.95, 0.07]);
    expect(f.sheets[0].rows[0].cells[2]).toBe(45000);
    const n = f.findings.filter((x) => x.ruleId === 'IN-PERCENT-READ');
    expect(n).toHaveLength(1);
    expect(n[0].params).toMatchObject({ column: 'O2 sat [%]', count: 2, stored: '0.95', shown: '95' });
  });
  it('a spacing _% and a quoted or escaped % are not percent; a date-and-percent format is not scaled', () => {
    expect(isPercentFormat('0_%')).toBe(false);
    expect(isPercentFormat('0_%;0%')).toBe(true);
    const ws = aoa([['a', 'b'], [{ t: 'n', v: 0.5, z: 'yy%' }, { t: 'n', v: 0.5, z: '0_%' }]]);
    const f = parseXlsx(wbOf({ S: ws }), 'q.xlsx');
    expect(f.sheets[0].rows[0].cells[1]).toBe(0.5);
    expect(f.findings.map((x) => x.ruleId)).not.toContain('IN-PERCENT-READ');
  });
  it('in a multi-section format the section of the value sign decides', () => {
    expect(isPercentFormat('0;-0%', 0.5)).toBe(false);
    expect(isPercentFormat('0;-0%', -0.5)).toBe(true);
    expect(isPercentFormat('0%;0;"-"', 0)).toBe(false);
    expect(isPercentFormat('0%;0;"-"', 0.5)).toBe(true);
    const ws = aoa([['x'], [{ t: 'n', v: 0.5, z: '0;-0%' }], [{ t: 'n', v: -0.5, z: '0;-0%' }]]);
    const f = parseXlsx(wbOf({ S: ws }), 'm.xlsx');
    expect(f.sheets[0].rows.map((r) => r.cells[0])).toEqual([0.5, -50]);
  });
  it('no note when every percent cell is 0; the note shows the first cell that changed', () => {
    const zero = parseXlsx(wbOf({ S: aoa([['x'], [{ t: 'n', v: 0, z: '0%' }], [{ t: 'n', v: 0, z: '0%' }]]) }), 'z.xlsx');
    expect(zero.findings.map((x) => x.ruleId)).not.toContain('IN-PERCENT-READ');
    const mixed = parseXlsx(wbOf({ S: aoa([['x'], [{ t: 'n', v: 0, z: '0%' }], [{ t: 'n', v: 0.25, z: '0%' }]]) }), 'z2.xlsx');
    expect(mixed.findings.find((x) => x.ruleId === 'IN-PERCENT-READ')?.params).toMatchObject({ stored: '0.25', shown: '25' });
  });
});
