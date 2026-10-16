// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import * as XLSX from 'xlsx';
import type { Finding, ParsedFile, RawCell, RawRow, RawSheet } from '../types';
import { makeFinding } from '../rules/registry';
import { ParseError } from './shared';

type Grid = Map<number, Map<number, XLSX.CellObject>>;

/** Cell value as the checker sees it: numbers stay numbers, everything else is trimmed text, empty is null. */
function cellValue(cell: XLSX.CellObject | undefined): RawCell {
  if (!cell || cell.t === 'z') return null;
  switch (cell.t) {
    case 'n':
      return typeof cell.v === 'number' ? cell.v : null;
    case 'b':
      return cell.v ? 'TRUE' : 'FALSE';
    case 'e':
      return cell.w ?? '#ERROR';
    default: {
      // 's' and anything the library may add; a formula cell has its cached value in v and is never evaluated
      if (cell.v === undefined || cell.v === null) return null;
      const t = String(cell.v).trim();
      return t === '' ? null : t;
    }
  }
}

function toGrid(ws: XLSX.WorkSheet): Grid {
  const grid: Grid = new Map();
  for (const addr of Object.keys(ws)) {
    if (addr.charCodeAt(0) === 33) continue; // '!' keys: !ref, !merges, …
    const { r, c } = XLSX.utils.decode_cell(addr);
    let row = grid.get(r);
    if (!row) grid.set(r, (row = new Map()));
    row.set(c, ws[addr] as XLSX.CellObject);
  }
  return grid;
}

const lastCol = (row: Map<number, XLSX.CellObject>, nonEmpty: boolean): number => {
  let max = -1;
  for (const [c, cell] of row) if (c > max && (!nonEmpty || cellValue(cell) !== null)) max = c;
  return max;
};

/** First row with >= 2 non-empty text cells; else the first with >= 2 non-empty cells; else the first non-empty row. */
function findHeaderRow(grid: Grid, rowsAsc: number[]): number | undefined {
  const count = (row: Map<number, XLSX.CellObject>, textOnly: boolean) => {
    let n = 0;
    for (const cell of row.values()) {
      const v = cellValue(cell);
      if (v !== null && (!textOnly || typeof v === 'string')) n++;
    }
    return n;
  };
  const live = rowsAsc.filter((r) => count(grid.get(r)!, false) > 0);
  return live.find((r) => count(grid.get(r)!, true) >= 2) ?? live.find((r) => count(grid.get(r)!, false) >= 2) ?? live[0];
}

function parseSheet(name: string, ws: XLSX.WorkSheet): RawSheet | undefined {
  const grid = toGrid(ws);
  const rowsAsc = [...grid.keys()].sort((a, b) => a - b);
  const headerRow = findHeaderRow(grid, rowsAsc);
  if (headerRow === undefined) return undefined;

  const hCells = grid.get(headerRow)!;
  const width = lastCol(hCells, true) + 1;
  const header: string[] = [];
  for (let c = 0; c < width; c++) {
    const v = cellValue(hCells.get(c));
    header.push(v === null ? '' : String(v));
  }

  const rows: RawRow[] = [];
  const numeric = new Array<number>(width).fill(0);
  const dated = new Array<number>(width).fill(0);
  for (const r of rowsAsc) {
    if (r <= headerRow) continue;
    const cells = grid.get(r)!;
    const last = lastCol(cells, true);
    if (last < 0) continue; // fully empty row (formatting only)
    const out: RawCell[] = new Array<RawCell>(Math.max(width, last + 1)).fill(null);
    for (const [c, cell] of cells) {
      const v = cellValue(cell);
      if (v === null) continue;
      out[c] = v;
      if (typeof v === 'number' && c < width) {
        numeric[c]++;
        if (typeof cell.z === 'string' && XLSX.SSF.is_date(cell.z)) dated[c]++;
      }
    }
    rows.push({ line: r + 1, cells: out, fieldCount: out.length });
  }
  const dateFormatted = header.map((_, c) => numeric[c] > 0 && dated[c] * 2 > numeric[c]);
  return { name, header, headerLine: headerRow + 1, rows, dateFormatted };
}

/**
 * Reads .xlsx and legacy .xls. Row numbers are Excel row numbers (taken from the cell address), columns stay
 * aligned to column A, a row may be longer than the header when cells sit to its right (never trimmed or
 * realigned; no finding is raised for that). Throws ParseError when the workbook cannot be read.
 */
export function parseXlsx(bytes: Uint8Array, fileName: string): ParsedFile {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, { type: 'array', cellDates: false, cellNF: true, dense: false });
  } catch (e) {
    throw new ParseError(fileName, `not a readable Excel workbook (${e instanceof Error ? e.message : 'unknown error'})`);
  }
  const sheets: RawSheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const s = parseSheet(name, ws);
    if (s) sheets.push(s);
  }
  const date1904 = Boolean(wb.Workbook?.WBProps?.date1904);
  const findings: Finding[] = date1904 ? [makeFinding('IN-DATE1904', { file: fileName })] : [];
  return { fileName, kind: 'xlsx', sheets, date1904, decimalComma: false, encoding: 'utf-8', findings };
}
