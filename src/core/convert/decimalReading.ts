// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { makeConvertFinding } from '../rules/convert';
import type { Finding, ParsedFile, RawRow } from '../types';

/*
 * "Decimal comma" or "thousands separator", per column: the PERSON's answer to IN-DECIMAL-AMBIGUOUS (a column of a decimal-comma file whose every comma value has three digits after the comma).
 * Nothing here is a guess from values: a declaration names a column index, and it counts only for a column that IN-DECIMAL-AMBIGUOUS of that sheet named, so a column the reader did not ask about is
 * never touched. The sheet is read again BEFORE any pivot or turn: under `thousands` every cell of the column written n,nnn or n,nnn,nnn... becomes the number with its commas removed (1,250 is 1250,
 * 1,250,000 is 1250000), so the archive, the measurements, the counts, the sums and the findings all see the same number. Under `decimal` the cells stay as written. For every declared column the
 * question is replaced by CONV-DECIMAL-DECLARED (info). Other columns, other sheets and other files are not touched; the input file is not changed.
 */

export type DecimalReading = 'decimal' | 'thousands';

/** A cell written with comma groups of three digits after one to three leading digits: 1,250 or 1,250,000 (an optional sign). */
const COMMA_GROUPED = /^-?\d{1,3}(?:,\d{3})+$/;

/** The column indexes of a sheet that IN-DECIMAL-AMBIGUOUS names in the findings of the file. */
export function askedDecimalColumns(file: ParsedFile, sheet: string): number[] {
  const out: number[] = [];
  for (const f of file.findings) {
    if (f.ruleId !== 'IN-DECIMAL-AMBIGUOUS' || (f.sheet !== undefined && f.sheet !== sheet)) continue;
    const index = Number(f.params.index);
    if (Number.isInteger(index) && index >= 0 && !out.includes(index)) out.push(index);
  }
  return out;
}

/** The file with the declared readings applied to the named sheet: a new file object; undeclared columns, columns not asked about and other sheets are untouched. */
export function applyDecimalReading(file: ParsedFile, sheet: string, reading: Readonly<Record<number, DecimalReading>>, fromFile: readonly number[] = []): ParsedFile {
  const asked = new Set(askedDecimalColumns(file, sheet));
  const declared = Object.entries(reading)
    .map(([k, v]) => [Number(k), v] as const)
    .filter(([i, v]) => asked.has(i) && (v === 'decimal' || v === 'thousands'));
  if (declared.length === 0) return file;
  const thousands = new Set(declared.filter(([, v]) => v === 'thousands').map(([i]) => i));
  const byIndex = new Map(declared);
  const sheets = file.sheets.map((s) => {
    if (s.name !== sheet || thousands.size === 0) return s;
    const rows: RawRow[] = s.rows.map((r) => {
      let cells = r.cells;
      for (const c of thousands) {
        const cell = cells[c];
        if (typeof cell !== 'string') continue;
        const text = cell.trim();
        if (!COMMA_GROUPED.test(text)) continue;
        if (cells === r.cells) cells = [...r.cells];
        cells[c] = Number(text.replace(/,/g, ''));
      }
      return cells === r.cells ? r : { ...r, cells };
    });
    return { ...s, rows };
  });
  const findings: Finding[] = file.findings.map((f) => {
    if (f.ruleId !== 'IN-DECIMAL-AMBIGUOUS' || (f.sheet !== undefined && f.sheet !== sheet)) return f;
    const index = Number(f.params.index);
    const answer = byIndex.get(index);
    if (answer === undefined) return f;
    return makeConvertFinding('CONV-DECIMAL-DECLARED', {
      file: f.file,
      sheet: f.sheet ?? sheet,
      params: { column: f.params.column ?? '', index, reading: answer, ...(fromFile.includes(index) ? { fromFile: 'yes' } : {}) },
    });
  });
  return { ...file, sheets, findings };
}
