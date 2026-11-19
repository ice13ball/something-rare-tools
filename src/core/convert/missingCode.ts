// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { makeConvertFinding } from '../rules/convert';
import { makeFinding } from '../rules/registryCheck';
import type { ColumnRole, Finding, RawRow, RawSheet } from '../types';
import { isMissingValueCode, parseNumber } from '../values/numbers';
import type { ConvertSheetInput } from './build';

/*
 * -99, -999 and -9999 in a column the converter writes as a depth or as a measurement ("possible missing-value code", ROW-MISSING-CODE). The converter never decides what such a value means:
 * the export is BLOCKED until the person answers, per column, "treat as missing". The answer leaves the cells of that column that hold exactly one of the three numbers (numeric equality: -999.0 and
 * -999,0 count) empty before anything is read, so no depth, value or quantity is made of them, no station range takes them in and no sum counts them. They are never written as a number and never
 * rewritten to anything else; the list of rows not written names each cell, as written, with the reason `missing-code`. A column the person did not answer is not touched.
 *
 * Which columns: the depth column and its bounds, a pressure, a measured variable, a biomass, an effort, a depth below the seafloor, a quantity, and the cells of a wide sheet's taxon columns. Not a
 * position, a date, a text, a key, a count of rows.
 */

/** Does the converter write the numbers of a column with this role? */
export function carriesNumbers(role: ColumnRole): boolean {
  switch (role.kind) {
    case 'depth':
    case 'pressure':
    case 'variable':
    case 'biomass':
    case 'effort':
    case 'depthBelowSeafloor':
    case 'quantity':
      return true;
    case 'taxon':
      return role.header === true;
    default:
      return false;
  }
}

/** What the person answered for a column: the cells are missing (left out and listed) or real values (written as they are). */
export type MissingCodeAnswer = 'missing' | 'real';

/** A cell of a numeric column that holds a missing-value code: its line, its column and the cell as written. */
export interface CodedCell {
  line: number;
  index: number;
  text: string;
}

export interface CodedColumn {
  index: number;
  header: string;
  /** The first code as written. */
  value: string;
  cells: CodedCell[];
}

const shown = (c: unknown): string => String(c).trim();

/** The columns of the sheet of the input that the converter writes as numbers and that hold a code, with the cells. Nothing is changed. */
export function codedColumns(sin: ConvertSheetInput): CodedColumn[] {
  const sheet = sin.file.sheets.find((x) => x.name === sin.sheet);
  if (sheet === undefined) return [];
  const out: CodedColumn[] = [];
  const seen = new Set<number>();
  for (const col of sin.mapping.columns) {
    if (seen.has(col.index) || !carriesNumbers(col.role)) continue;
    seen.add(col.index);
    const cells: CodedCell[] = [];
    for (const r of sheet.rows) {
      const cell = r.cells[col.index] ?? null;
      if (cell === null) continue;
      const p = parseNumber(cell, sin.file.decimalComma);
      if (p.status === 'ok' && isMissingValueCode(p.value)) cells.push({ line: r.line, index: col.index, text: shown(cell) });
    }
    if (cells.length > 0) out.push({ index: col.index, header: (sheet.header[col.index] ?? '').trim() || col.header, value: cells[0].text, cells });
  }
  return out;
}

export interface MissingCodeResult {
  sin: ConvertSheetInput;
  /** The question while the column is not answered (blocks), the note once it is. */
  findings: Finding[];
  /** The cells left empty, for the list of rows not written. */
  coded: CodedCell[];
}

/** Applies the person's answers (column indexes of the sheet as it stands) and raises the question for every column with a code that is not answered. */
export function applyMissingCodes(sin: ConvertSheetInput): MissingCodeResult {
  const columns = codedColumns(sin);
  if (columns.length === 0) return { sin, findings: [], coded: [] };
  const answers = sin.missingCodes ?? {};
  const findings: Finding[] = [];
  const coded: CodedCell[] = [];
  const blank = new Map<number, Set<number>>();
  for (const c of columns) {
    const params = { column: c.header, index: c.index, count: c.cells.length };
    const answer = answers[c.index];
    if (answer !== 'missing' && answer !== 'real') {
      findings.push(makeFinding('ROW-MISSING-CODE', { file: sin.file.fileName, sheet: sin.sheet, lines: c.cells.map((x) => x.line), field: c.header, value: c.value, params }));
      continue;
    }
    // (the field lets the pivot's and the turn's line remaps name the lines of the file, as for the question)
    findings.push(
      makeConvertFinding('CONV-MISSING-CODE-DECLARED', {
        file: sin.file.fileName,
        sheet: sin.sheet,
        lines: c.cells.map((x) => x.line),
        field: c.header,
        value: c.value,
        params: { ...params, answer, ...(answer === 'missing' ? { asMissing: 'yes' } : { asReal: 'yes' }), ...(sin.missingCodesFromFile?.includes(c.index) === true ? { fromFile: 'yes' } : {}) },
      }),
    );
    if (answer === 'real') continue;
    coded.push(...c.cells);
    for (const x of c.cells) {
      const set = blank.get(x.line) ?? new Set<number>();
      set.add(x.index);
      blank.set(x.line, set);
    }
  }
  if (coded.length === 0) return { sin, findings, coded };
  const sheets = sin.file.sheets.map((s): RawSheet => {
    if (s.name !== sin.sheet) return s;
    const rows: RawRow[] = s.rows.map((r) => {
      const cols = blank.get(r.line);
      if (cols === undefined) return r;
      const cells = [...r.cells];
      for (const i of cols) cells[i] = null;
      return { ...r, cells };
    });
    const missingCells: Record<number, number[]> = {};
    for (const [line, cols] of blank) missingCells[line] = [...cols].sort((a, b) => a - b);
    return { ...s, rows, missingSource: s.missingSource ?? s.decimalSource ?? s, missingCells };
  });
  return { sin: { ...sin, file: { ...sin.file, sheets } }, findings, coded };
}
