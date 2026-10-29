// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Finding, RawRow } from '../types';
import { makeFinding } from '../rules/registryCheck';
import type { DecodedText } from '../values/encoding';
import { parseNumber } from '../values/numbers';

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
