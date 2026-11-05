// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { rawRecords } from './csv-strip';

/** One field of CSV text as the value it holds (quotes removed, doubled quotes undoubled). */
export const unquoteField = (f: string): string => (f.startsWith('"') && f.endsWith('"') && f.length >= 2 ? f.slice(1, -1).replace(/""/g, '"') : f);
const NOT_IN_FILE = 'source columns that are not in this file';
const DIFFER = 'source columns that differ within a row, left empty there';

/** The sidecar as one string per record (raw fields joined), quote-aware. */
export function sidecarRecords(sidecar: string): string[] {
  return rawRecords(sidecar).map((r) => r.join(','));
}

/** A source column, by its sheet and its place in the sheet, never by its header. */
export interface SourceColumn { sheet: string; index: number }
export interface InvariantContext {
  /** The dataset has more than one sheet (the notes then name the sheet). */
  manySheets: boolean;
  /** The columns the BEFORE build listed in "not in this file" (no cell used, not partly read), in order, with the header the note shows. */
  before: { sheet: string; index: number; header: string }[];
  /** The headers the new columns have in the CSV (parsed, not quoted). */
  written: string[];
  /** The source columns that may leave the note: those now written, and those named as "column not written" in a differ note. Nothing else. */
  removed: SourceColumn[];
}

const noteText = (line: string): string | undefined => {
  const f = rawRecords(line + '\n')[0] ?? [];
  return f[0] === '(note)' ? unquoteField(f[1] ?? '') : undefined;
};
const noteLine = (text: string): string => rawRecords(`(note),${/[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text},,,\n`)[0].join(',');

/**
 * The only differences allowed between the sidecar before the descriptive columns existed and the one after:
 * (a) a mapping row for each new column (its output column is one of `written`),
 * (b) the "not in this file" note of a sheet loses exactly the source columns (sheet and place, not name) that are now written or named in a differ note as not written; a note left with none disappears,
 * (c) the new "differ within a row" notes.
 * Everything else must be the same line in the same place. Returns the problems found (empty: the invariant holds).
 */
export function sidecarProblems(before: readonly string[], after: readonly string[], ctx: InvariantContext): string[] {
  const out: string[] = [];
  const writtenSet = new Set(ctx.written);
  const removed = new Set(ctx.removed.map((c) => `${c.sheet}\u0000${c.index}`));
  const rest = after.filter((line) => {
    const f = rawRecords(line + '\n')[0] ?? [];
    if (f[0] !== '(note)' && writtenSet.has(unquoteField(f[1] ?? ''))) return false;
    if (noteText(line)?.startsWith(DIFFER)) return false;
    return true;
  });
  // the notes of the before side, one per sheet in the order the columns are listed
  const sheets = [...new Set(ctx.before.map((c) => c.sheet))];
  const nameOf = (c: { header: string; index: number }): string => (c.header.trim() === '' ? `(column ${c.index + 1})` : c.header);
  const textOf = (sheet: string, cols: readonly { header: string; index: number }[]): string => `${NOT_IN_FILE}${ctx.manySheets ? ` (sheet ${sheet})` : ''}: ${cols.map(nameOf).join(' | ')}`;
  let at = 0;
  const expected: string[] = [];
  for (const line of before) {
    if (noteText(line)?.startsWith(NOT_IN_FILE)) {
      const sheet = sheets[at++];
      if (sheet === undefined) { out.push('a "not in this file" note the build did not list'); continue; }
      const all = ctx.before.filter((c) => c.sheet === sheet);
      if (noteText(line) !== textOf(sheet, all)) out.push(`the note of sheet ${sheet} is not the list of its columns`);
      const kept = all.filter((c) => !removed.has(`${c.sheet}\u0000${c.index}`));
      if (kept.length > 0) expected.push(noteLine(textOf(sheet, kept)));
    } else expected.push(line);
  }
  if (at !== sheets.length) out.push(`${sheets.length - at} listed sheet(s) have no note`);
  if (rest.length !== expected.length) out.push(`${rest.length} lines after (minus the allowed ones), ${expected.length} expected`);
  for (let i = 0; i < Math.min(rest.length, expected.length); i++) if (rest[i] !== expected[i]) { out.push(`line ${i + 1}: ${expected[i].slice(0, 120)}  ->  ${rest[i].slice(0, 120)}`); if (out.length > 5) break; }
  return out;
}
