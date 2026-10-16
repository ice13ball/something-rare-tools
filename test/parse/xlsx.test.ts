// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { parseXlsx } from '../../src/core/parse/xlsx';
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
