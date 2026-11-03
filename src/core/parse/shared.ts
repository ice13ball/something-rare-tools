// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Finding, RawCell, RawRow } from '../types';
import { makeFinding } from '../rules/registryCheck';
import type { DecodedText } from '../values/encoding';
import { parseNumber } from '../values/numbers';
import { parseDate } from '../values/dates';
import { decodeUnitText, unitCellKind, unitKey } from './unitWords';
import { AMBIGUOUS_STATISTIC, STATISTIC_LABEL } from '../summaryLabels';

/**
 * Thrown by parseFile when a file cannot be read at all (corrupt workbook, malformed XML or JSON, JSON that is
 * neither a DataCite nor a Zenodo record). There is deliberately no rule for it: the message is already plain
 * English and names the file, so the caller shows it as-is. Anything merely odd (ragged rows, fallback encoding,
 * decimal commas) is a Finding on the returned ParsedFile instead and never throws.
 */
export class ParseError extends Error {
  readonly fileName: string;
  constructor(fileName: string, message: string) {
    super(`${fileName}: ${message}`);
    this.name = 'ParseError';
    this.fileName = fileName;
  }
}

/** Splits text into physical lines. CRLF is one break, a lone CR is one, a lone LF is one. A trailing break adds no line. */
export function splitPhysicalLines(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** One ROW-RAGGED finding listing every row whose field count differs from the header's; undefined when none. */
export function raggedFinding(fileName: string, sheet: string, headerLength: number, rows: readonly RawRow[]): Finding | undefined {
  const bad = rows.filter((r) => r.fieldCount !== headerLength);
  if (bad.length === 0) return undefined;
  return makeFinding('ROW-RAGGED', {
    file: fileName,
    sheet,
    lines: bad.map((r) => r.line),
    params: { expected: headerLength, found: bad[0].fieldCount },
  });
}

export function encodingFinding(fileName: string, d: Pick<DecodedText, 'encoding' | 'fallback'>): Finding | undefined {
  return d.fallback ? makeFinding('IN-ENCODING-FALLBACK', { file: fileName, params: { encoding: d.encoding } }) : undefined;
}

/** A header is short when at least this share of the non-empty data rows have one and the same field count that is larger than the header's. */
export const SHORT_HEADER_SHARE = 0.95;
/** Fewer data rows than this say nothing about the real width of the table. */
export const SHORT_HEADER_MIN_ROWS = 3;

/** Internal name of a column the header does not name: language-neutral, numbered by its 1-based position. The UI shows the reader's own word for it. */
export const unnamedColumn = (position: number): string => `Column ${position}`;

/**
 * "The header is missing names": the modal field count N of the data rows is above the header's count H and at least SHORT_HEADER_SHARE of the rows have exactly N fields.
 * Returns the header extended with N-H unnamed columns (`Column H+1` ... `Column N`), the index of the first of them, and the IN-HEADER-SHORT finding; undefined otherwise
 * (N <= H, a weaker mode, fewer than SHORT_HEADER_MIN_ROWS rows). Rows are not touched: those with N fields are regular afterwards, the others stay ragged, relative to N.
 * The tool cannot know WHERE names are missing, so the new columns are appended at the end; the user maps them (and the named columns after the gap) as they are.
 */
export function extendShortHeader(
  fileName: string,
  sheet: string,
  header: readonly string[],
  rows: readonly RawRow[],
  decimalComma = false,
): { kind: 'extend'; header: string[]; unnamedFrom: number; finding: Finding } | { kind: 'trim' } | undefined {
  // a one-name "header" is a title line, or the only column of a file whose decimal commas split its values: neither says the header lacks names
  if (header.length < 2 || rows.length < SHORT_HEADER_MIN_ROWS) return undefined;
  const freq = new Map<number, number>();
  for (const r of rows) freq.set(r.fieldCount, (freq.get(r.fieldCount) ?? 0) + 1);
  let width = 0;
  let count = 0;
  for (const [n, k] of freq) if (k > count || (k === count && n > width)) [width, count] = [n, k];
  if (width <= header.length || count < rows.length * SHORT_HEADER_SHARE) return undefined;
  // every field past the header is empty in every row (a trailing delimiter on the data rows): nothing is missing but the delimiter, no column and no finding
  if (!rows.some((r) => r.cells.some((c, i) => i >= header.length && !(c === null || String(c).trim() === '')))) return { kind: 'trim' };
  // the first data row reads as a header row (all text, while the later rows have numbers there): the real header is that row, and the lines above it are not a table
  if (firstRowLooksLikeHeader(rows, decimalComma)) return undefined;
  const extra = width - header.length;
  const first = header.length + 1;
  const extended = [...header];
  for (let p = first; p <= width; p++) extended.push(unnamedColumn(p));
  const finding = makeFinding('IN-HEADER-SHORT', {
    file: fileName,
    sheet,
    params: { header: header.length, count, rows: rows.length, width, extra, range: extra === 1 ? String(first) : `${first}…${width}` },
  });
  return { kind: 'extend', header: extended, unnamedFrom: header.length, finding };
}

/** The first data row has at least one filled cell, every filled cell is text, and in those columns the later rows (the first 50) hold mostly numbers. */
function firstRowLooksLikeHeader(rows: readonly RawRow[], decimalComma: boolean): boolean {
  const first = rows[0].cells;
  const cols: number[] = [];
  for (let i = 0; i < first.length; i++) {
    const c = first[i];
    if (c === null || String(c).trim() === '') continue;
    if (parseNumber(c, decimalComma).status === 'ok') return false;
    cols.push(i);
  }
  if (cols.length === 0) return false;
  let numeric = 0;
  let filled = 0;
  for (const r of rows.slice(1, 51)) {
    for (const i of cols) {
      const c = r.cells[i] ?? null;
      if (c === null || String(c).trim() === '') continue;
      filled++;
      if (parseNumber(c, decimalComma).status === 'ok') numeric++;
    }
  }
  return filled > 0 && numeric * 2 > filled;
}

/* ---------- a second header row of statistic labels ---------- */

const TRAILING_UNIT = /^(.*?)\s*([[(][^\])]*[\])])\s*$/;

export interface SubheaderFold {
  /** The combined header: "<name> <label> [unit]" for a column with a label, the header as it was for the others (at least as long as the labels reach). */
  header: string[];
  /** The rows without the sub-header row. */
  rows: RawRow[];
  /** The physical line of the sub-header row. */
  line: number;
}

/**
 * A row directly under the header whose filled cells are ALL statistic labels (mean, st.dev., sd, min, max ... STATISTIC_LABEL, at least two of them) is a second header row of the
 * table, not data: "OM (%)" over "mean" and "st.dev." names two columns, "OM mean (%)" and "OM st.dev. (%)" (the label goes before a trailing unit so that the unit is still read).
 * A header cell that is EMPTY above a label takes the text `fill(column)` gives (an xlsx merged range) or the header of the cell on its left (a title written across two columns); a header that is not empty is never replaced.
 * Returns undefined when the first row is not such a row, or when a label has no header above it to belong to (then nothing is changed).
 */
export function foldStatisticSubheader(header: readonly string[], rows: readonly RawRow[], fill?: (column: number) => string | undefined): SubheaderFold | undefined {
  const first = rows[0];
  if (first === undefined) return undefined;
  const labels = new Map<number, string>();
  for (let c = 0; c < first.cells.length; c++) {
    const v: RawCell = first.cells[c] ?? null;
    if (v === null || String(v).trim() === '') continue;
    if (typeof v !== 'string' || !STATISTIC_LABEL.test(v.trim())) return undefined;
    labels.set(c, v.trim());
  }
  // at least one label that is not also an ordinary code or a total (N, count, min, max, total, sum): a row of those alone is data, as the summary-row policy has it
  if (labels.size < 2 || ![...labels.values()].some((l) => !AMBIGUOUS_STATISTIC.test(l) && !/^(?:totals?|grand total|sub-?total|sum|suma|summe|somme)[:.]?$/i.test(l))) return undefined;
  const width = Math.max(header.length, Math.max(...labels.keys()) + 1);
  const out: string[] = [];
  const top: string[] = [];
  for (let c = 0; c < width; c++) {
    let t = (header[c] ?? '').trim();
    if (t === '' && labels.has(c)) t = (fill?.(c) ?? '').trim() || (c > 0 ? top[c - 1] : '');
    top.push(t);
  }
  for (let c = 0; c < width; c++) {
    const label = labels.get(c);
    if (label === undefined) {
      out.push(header[c] ?? '');
      continue;
    }
    if (top[c] === '') return undefined;
    const m = TRAILING_UNIT.exec(top[c]);
    out.push(m && m[1] !== '' ? `${m[1]} ${label} ${m[2]}` : `${top[c]} ${label}`);
  }
  return { header: out, rows: rows.slice(1), line: first.line };
}

/* ---------- a second header row of units ---------- */

/** What a units row folded into the header: the fold (header, rows without the units row, its physical line) and the number of columns that got a unit. */
export interface UnitsFold extends SubheaderFold {
  count: number;
}

export interface UnitsFoldOptions {
  /** xlsx: the columns whose cells are date-formatted (a time column under "UTC" holds serial numbers). */
  dateFormatted?: readonly boolean[];
  date1904?: boolean;
}

/**
 * A row directly under the header (and under a statistic sub-header, when that was folded first) in which EVERY filled cell is a unit (unitCellKind: the vocabulary, degrees_north / degrees_east,
 * "UTC", a phrase of unit words) is a second header row of the table, as ERDDAP and BCO-DMO write it: `latitude` over `degrees_north` is the column `latitude [degrees_north]`.
 * Nothing about the columns' roles is decided here; the unit goes into the name as the header's own `[unit]`. It is a units row only when
 *  - at least two of its cells are units that go into the header ("unitless", "text", "code" and number formats such as "ddd.d" are allowed in the row, add nothing, and do not count), and
 *  - in the first 50 rows below, no unit column holds more non-numbers than numbers (a first data row of codes `m`, `g`, `cm` over names is data), at least two have numbers, and a column empty below says nothing;
 *    a column under "UTC" needs dates it can read instead of numbers, and
 *  - every filled cell has a header above it, and a header that already declares a unit agrees with the cell (a disagreeing cell means no fold at all; an agreeing one leaves the header as it is).
 * The data rows keep their physical line numbers. `decimalComma` must be known before the call (a column of `1,5` is numbers). Returns undefined, and changes nothing, when the row is not such a row.
 */
export function foldUnitsRow(header: readonly string[], rows: readonly RawRow[], decimalComma: boolean, opts: UnitsFoldOptions = {}): UnitsFold | undefined {
  const scan = scanUnitsRow(header, rows, decimalComma, opts);
  if (scan === undefined || scan.failing > 0) return undefined;
  return { header: scan.header, rows: rows.slice(1), line: scan.line, count: scan.units };
}

/**
 * A first data row that IS a row of units by its cells (every filled cell a unit, two or more that go into a header, a header above each) but that foldUnitsRow did not fold because the cells under some
 * of its units are not numbers (a size class "0-1", a range ">250 um"): the line, when the numbers agree under at least half of the units. The converter names it instead of reading it as data. Never changes anything.
 */
export function unitsRowNotFolded(header: readonly string[], rows: readonly RawRow[], decimalComma: boolean, opts: UnitsFoldOptions = {}): { line: number } | undefined {
  const scan = scanUnitsRow(header, rows, decimalComma, opts);
  if (scan === undefined || scan.failing === 0 || scan.failing * 2 > scan.units) return undefined;
  return { line: scan.line };
}

function scanUnitsRow(header: readonly string[], rows: readonly RawRow[], decimalComma: boolean, opts: UnitsFoldOptions): { header: string[]; line: number; units: number; failing: number } | undefined {
  const first = rows[0];
  if (first === undefined || rows.length < 2) return undefined;
  const units = new Map<number, { kind: 'unit' | 'utc'; text: string }>();
  for (let c = 0; c < first.cells.length; c++) {
    const v: RawCell = first.cells[c] ?? null;
    if (v === null || String(v).trim() === '') continue;
    if (typeof v !== 'string') return undefined;
    const kind = unitCellKind(v);
    if (kind === undefined) return undefined;
    if ((header[c] ?? '').trim() === '') return undefined;
    if (kind !== 'neutral') units.set(c, { kind, text: decodeUnitText(v) });
  }
  if (units.size < 2) return undefined;
  const below = rows.slice(1, 51);
  let failing = 0;
  let passing = 0;
  for (const [c, u] of units) {
    let ok = 0;
    let bad = 0;
    for (const r of below) {
      const cell = r.cells[c] ?? null;
      if (cell === null || String(cell).trim() === '') continue;
      if (u.kind === 'utc') {
        if ('error' in parseDate(cell, { date1904: opts.date1904 ?? false, dateFormatted: opts.dateFormatted?.[c] ?? false })) bad++;
        else ok++;
      } else {
        const st = parseNumber(cell, decimalComma).status;
        if (st === 'ok') ok++;
        else if (st === 'non-numeric') bad++;
      }
    }
    // a column empty below says nothing either way; two columns must have numbers (dates) agreeing
    if (ok > bad) passing++;
    else if (bad > 0) failing++;
  }
  if (passing < 2) return undefined;
  const out: string[] = [...header];
  for (const [c, u] of units) {
    const h = (header[c] ?? '').trim();
    const declared = TRAILING_UNIT.exec(h);
    const declaredInner = declared ? declared[2].slice(1, -1).trim() : undefined;
    if (declared && declaredInner !== undefined && unitCellKind(declaredInner) !== undefined) {
      // the header names a unit already: it stays, unless the row says another one
      if (unitKey(declaredInner) !== unitKey(u.text)) return undefined;
      continue;
    }
    out[c] = `${h} [${u.text}]`;
  }
  return { header: out, line: first.line, units: units.size, failing };
}
