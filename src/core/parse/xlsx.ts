// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import * as XLSX from 'xlsx';
import type { Finding, ParsedFile, RawCell, RawRow, RawSheet } from '../types';
import { makeFinding } from '../rules/registryCheck';
import { ParseError, foldStatisticSubheader, foldUnitsRow, unnamedColumn } from './shared';
import { columnLetters } from '../convert/columnLetters';

type Grid = Map<number, Map<number, XLSX.CellObject>>;

/**
 * A number format that shows a percent sign: `%` outside "quoted text", `\x` escapes, `_x` spacing and `[...]` brackets. `0%`, `0.00%`, `[Red]0.0%` are; `0"%"`, `0\%`, `0_%` and `General` are not.
 * With a value, a multi-section format is judged by the section its sign selects (positive; negative; zero; a missing section falls back to the first): `0;-0%` scales negatives only.
 */
export function isPercentFormat(z: string, v?: number): boolean {
  const f = z.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/_./g, '').replace(/\[[^\]]*\]/g, '');
  if (v === undefined) return f.includes('%');
  const sections = f.split(';');
  const section = v < 0 ? (sections[1] ?? sections[0]) : v === 0 ? (sections[2] ?? sections[0]) : sections[0];
  return section.includes('%');
}

/** The cell is a number whose own format shows a percent (and is not also a date format, as `yy%`). */
function isPercentCell(cell: XLSX.CellObject): cell is XLSX.CellObject & { v: number; z: string } {
  return cell.t === 'n' && typeof cell.v === 'number' && typeof cell.z === 'string' && !XLSX.SSF.is_date(cell.z) && isPercentFormat(cell.z, cell.v);
}

/** The number a percent format shows: the decimal point of String(v) moved two places right, exactly (never v * 100: 0.07 * 100 is 7.000000000000001; never the cell's rounded `.w`). */
export function percentValue(v: number): number {
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(v));
  if (!m) return v; // NaN / Infinity: nothing to move
  const [, sign, int, frac = '', exp = '0'] = m;
  const digits = int + frac;
  const point = int.length + Number(exp) + 2; // digits before the decimal point after the move
  let out: string;
  if (point <= 0) out = `0.${'0'.repeat(-point)}${digits}`;
  else if (point >= digits.length) out = digits + '0'.repeat(point - digits.length);
  else out = `${digits.slice(0, point)}.${digits.slice(point)}`;
  const n = Number(sign + out);
  return n === 0 ? 0 : n;
}

/** Cell value as the checker sees it: numbers stay numbers, everything else is trimmed text, empty is null. */
function cellValue(cell: XLSX.CellObject | undefined): RawCell {
  if (!cell || cell.t === 'z') return null;
  switch (cell.t) {
    case 'n':
      if (typeof cell.v !== 'number') return null;
      return isPercentCell(cell) ? percentValue(cell.v) : cell.v;
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

function parseSheet(name: string, ws: XLSX.WorkSheet, date1904: boolean, findings: Finding[], fileName: string): RawSheet | undefined {
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
  // the widest row below the header (only cells with a value count): cells right of the header are read too, as an unnamed column
  let reach = width;
  for (const r of rowsAsc) if (r > headerRow) reach = Math.max(reach, lastCol(grid.get(r)!, true) + 1);
  const numeric = new Array<number>(reach).fill(0);
  const dated = new Array<number>(reach).fill(0);
  const timed = new Array<number>(reach).fill(0);
  const fractional = new Array<boolean>(reach).fill(false);
  // per row, the columns of its numeric cells that have no date format (kept only for the columns that end up date-formatted)
  const plainOf = new Map<RawRow, number[]>();
  const percent = new Map<number, { count: number; line: number; stored: string; shown: string }>();
  for (const r of rowsAsc) {
    if (r <= headerRow) continue;
    const cells = grid.get(r)!;
    const last = lastCol(cells, true);
    if (last < 0) continue; // fully empty row (formatting only)
    const out: RawCell[] = new Array<RawCell>(Math.max(width, last + 1)).fill(null);
    const plain: number[] = [];
    for (const [c, cell] of cells) {
      const v = cellValue(cell);
      if (v === null) continue;
      out[c] = v;
      if (typeof v === 'number') {
        numeric[c]++;
        if (isPercentCell(cell)) {
          // the note names the first cell the reading changed; a column of zeros changes nothing and gets none
          const p = percent.get(c) ?? { count: 0, line: 0, stored: '', shown: '' };
          p.count++;
          if (p.line === 0 && percentValue(cell.v) !== cell.v) Object.assign(p, { line: r + 1, stored: String(cell.v), shown: String(v) });
          percent.set(c, p);
        }
        if (!(typeof cell.z === 'string' && XLSX.SSF.is_date(cell.z))) plain.push(c);
        if (typeof cell.z === 'string' && XLSX.SSF.is_date(cell.z)) {
          dated[c]++;
          if (isTimeOnlyFormat(cell.z)) timed[c]++;
          if (showsFractionOfSecond(cell.z)) fractional[c] = true;
        }
      }
    }
    const row: RawRow = { line: r + 1, cells: out, fieldCount: out.length };
    if (plain.length > 0) plainOf.set(row, plain);
    rows.push(row);
  }
  // a second header row of statistic labels (mean, st.dev.) is part of the header; a header cell that is merged with the one to its left reads as that cell's text
  const merges = ws['!merges'] ?? [];
  const mergedText = (c: number): string | undefined => {
    const m = merges.find((x) => x.s.r <= headerRow && headerRow <= x.e.r && x.s.c < c && c <= x.e.c);
    const v = m === undefined ? null : cellValue(hCells.get(m.s.c));
    return v === null ? undefined : String(v);
  };
  const fold = foldStatisticSubheader(header, rows, mergedText);
  if (fold) {
    header.splice(0, header.length, ...fold.header);
    rows.splice(0, 1);
    while (numeric.length < header.length) {
      numeric.push(0);
      dated.push(0);
      timed.push(0);
      fractional.push(false);
    }
  }
  // so is a row of units (ERDDAP, BCO-DMO), judged by the cells below it; a time column under "UTC" holds date-formatted serials
  const unitsFold = foldUnitsRow(header, rows, false, { dateFormatted: header.map((_, c) => numeric[c] > 0 && dated[c] * 2 > numeric[c]), date1904 });
  if (unitsFold) {
    header.splice(0, header.length, ...unitsFold.header);
    rows.splice(0, 1);
    // a name got a unit: said with the first one as the example; every name had its unit already: the row is still not data, and that is said too (never "0 columns")
    if (unitsFold.example !== undefined) findings.push(makeFinding('IN-HEADER-UNITS-READ', { file: fileName, sheet: name, lines: [unitsFold.line], params: { count: unitsFold.count, example: unitsFold.example } }));
    else findings.push(makeFinding('IN-HEADER-UNITS-NAMED', { file: fileName, sheet: name, lines: [unitsFold.line] }));
  }
  // statistic labels written UNDER the units are the same second header, in the other order
  const fold2 = unitsFold && !fold ? foldStatisticSubheader(header, rows, mergedText) : undefined;
  if (fold2) {
    header.splice(0, header.length, ...fold2.header);
    rows.splice(0, 1);
    while (numeric.length < header.length) {
      numeric.push(0);
      dated.push(0);
      timed.push(0);
      fractional.push(false);
    }
  }
  // a cell merged down a column holds its value in the top cell only; where it starts below the header it is recorded (a merge that starts on or above the header is the header's business)
  const mergedDown = merges.filter((m) => m.s.r > headerRow && m.e.r > m.s.r).map((m) => ({ index: m.s.c, from: m.s.r + 1, to: m.e.r + 1 }));
  // cells right of the last named header cell are a column without a name, never dropped: the header grows to the last one that holds a value in a row kept (a blank in the MIDDLE of the header is left as it is)
  let unnamedFrom: number | undefined;
  let widest = header.length;
  for (const row of rows) for (let c = row.cells.length - 1; c >= widest; c--) if (row.cells[c] !== null) widest = c + 1;
  if (widest > header.length) {
    unnamedFrom = header.length;
    for (let c = header.length; c < widest; c++) header.push(unnamedColumn(c + 1));
    while (numeric.length < header.length) {
      numeric.push(0);
      dated.push(0);
      timed.push(0);
      fractional.push(false);
    }
    for (let c = unnamedFrom; c < header.length; c++) {
      const lines = rows.filter((row) => row.cells[c] !== undefined && row.cells[c] !== null).map((row) => row.line);
      if (lines.length > 0) findings.push(makeFinding('IN-COLUMN-NO-HEADER', { file: fileName, sheet: name, lines, params: { column: columnLetters(c), count: lines.length } }));
    }
  }
  for (const [c, p] of [...percent].sort((a, b) => a[0] - b[0])) {
    if (c < header.length && p.line > 0) findings.push(makeFinding('IN-PERCENT-READ', { file: fileName, sheet: name, lines: [p.line], params: { column: header[c], count: p.count, stored: p.stored, shown: p.shown } }));
  }
  const dateFormatted = header.map((_, c) => numeric[c] > 0 && dated[c] * 2 > numeric[c]);
  // a number without a date format in a column that is date-formatted is no serial date: its row says so (a row has the list only when it has one)
  for (const [row, plain] of plainOf) {
    const own = plain.filter((c) => dateFormatted[c] === true);
    if (own.length > 0) row.plainNumbers = own;
  }
  // columns whose date formats are TIME-ONLY (hh:mm, [h]:mm, h:mm:ss) in the majority of their date cells; set only when there is one
  const timeFormatted = header.map((_, c) => dateFormatted[c] && timed[c] * 2 > dated[c]);
  // the same, for EVERY numeric cell of the column (not the majority): a conversion that could lose a cell that is not date-formatted (a General 5 among dates) may only be made when all of them are. Set only when there is one.
  const dateAll = header.map((_, c) => numeric[c] > 0 && dated[c] === numeric[c]);
  const timeAll = header.map((_, c) => dateAll[c] && timed[c] === numeric[c]);
  // some numeric cell of the column has a date format that shows a fraction of a second (ss.0, ss.000): a fraction in the column is a real one. Set only when there is one.
  const fractionShown = header.map((_, c) => fractional[c] === true);
  return { name, header, headerLine: headerRow + 1, rows, ...(unnamedFrom === undefined ? {} : { unnamedFrom }), ...(fold || unitsFold ? { subHeaderLine: (fold2 ?? unitsFold ?? fold)!.line } : {}), ...(unitsFold ? { unitsRowLine: unitsFold.line } : {}), dateFormatted, ...(timeFormatted.some(Boolean) ? { timeFormatted } : {}), ...(dateAll.some(Boolean) ? { dateAll } : {}), ...(timeAll.some(Boolean) ? { timeAll } : {}), ...(fractionShown.some(Boolean) ? { fractionShown } : {}), ...(mergedDown.length > 0 ? { mergedDown } : {}) };
}

/** A date format that shows a fraction of a second: "hh:mm:ss.000", "ss.0", "[ss].000", "mm:ss.00". Quoted text, escaped characters, `[$locale]` brackets, `_x` (a space) and `*x` (a fill) are ignored. */
export function showsFractionOfSecond(z: string): boolean {
  const f = z.replace(/"[^"]*"/g, '').replace(/\[\$[^\]]*\]/g, '').replace(/\\./g, '').replace(/[_*]./g, '');
  return /s\]?\.0/i.test(f);
}

/** A date format that shows a time of day and no date part: "hh:mm", "[h]:mm", "h:mm:ss AM/PM", "mm:ss.0". Quoted text and colour/condition brackets are ignored. */
export function isTimeOnlyFormat(z: string): boolean {
  const f = z
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[([^\]]*)\]/g, (_m, inner: string) => (/^(h+|m+|s+)$/i.test(inner) ? inner : ''));
  // date tokens: d (day, ddd/dddd weekday), y, m three or more (month names), aaa (weekday), gg and e (era / year): the format is then a date-time
  return /[hs]/i.test(f) && !/[dy]/i.test(f) && !/m{3,}/i.test(f) && !/aaa/i.test(f) && !/gg/i.test(f) && !/e/i.test(f);
}

/**
 * Reads .xlsx, legacy .xls and OpenDocument .ods (all through SheetJS). Row numbers are Excel row numbers (taken from the cell address), columns stay
 * aligned to column A; cells right of the last named header cell become an unnamed column (`Column N`, `unnamedFrom`, IN-COLUMN-NO-HEADER with its lines), nothing is trimmed or realigned. Throws ParseError when the workbook cannot be read.
 */
export function parseXlsx(bytes: Uint8Array, fileName: string): ParsedFile {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, { type: 'array', cellDates: false, cellNF: true, dense: false });
  } catch (e) {
    throw new ParseError(fileName, `not a readable Excel workbook (${e instanceof Error ? e.message : 'unknown error'})`);
  }
  const date1904 = Boolean(wb.Workbook?.WBProps?.date1904);
  const sheetFindings: Finding[] = [];
  const sheets: RawSheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const s = parseSheet(name, ws, date1904, sheetFindings, fileName);
    if (s) sheets.push(s);
  }
  const findings: Finding[] = [...(date1904 ? [makeFinding('IN-DATE1904', { file: fileName })] : []), ...sheetFindings];
  return { fileName, kind: 'xlsx', sheets, date1904, decimalComma: false, encoding: 'utf-8', findings };
}
