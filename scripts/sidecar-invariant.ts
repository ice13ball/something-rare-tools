// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { rawRecords } from './csv-strip';

const unquote = (f: string): string => (f.startsWith('"') && f.endsWith('"') && f.length >= 2 ? f.slice(1, -1).replace(/""/g, '"') : f);
const NOT_IN_FILE = 'source columns that are not in this file';
const DIFFER = 'source columns that differ within a row, left empty there';

/** The sidecar as one string per record (raw fields joined), quote-aware. */
export function sidecarRecords(sidecar: string): string[] {
  return rawRecords(sidecar).map((r) => r.join(','));
}

/**
 * The only differences allowed between the sidecar before the descriptive columns existed and the one after:
 * (a) a mapping row for each new column (its output column is one of `written`),
 * (b) the "not in this file" note loses exactly the columns now written (`sources`, the source headers), a note left with none disappears,
 * (c) the new "differ within a row" notes.
 * Everything else must be the same line in the same place. Returns the problems found (empty: the invariant holds).
 */
export function sidecarProblems(before: readonly string[], after: readonly string[], written: readonly string[], sources: readonly string[]): string[] {
  const out: string[] = [];
  const writtenSet = new Set(written);
  const sourceSet = new Set(sources);
  // (a) and (c) leave the "after" side
  const rest = after.filter((line) => {
    const fields = rawRecords(line + '\n')[0] ?? [];
    if (fields[0] !== '(note)' && writtenSet.has(unquote(fields[1] ?? ''))) return false;
    if (fields[0] === '(note)' && unquote(fields[1] ?? '').startsWith(DIFFER)) return false;
    return true;
  });
  // (b) on the "before" side
  const expected: string[] = [];
  for (const line of before) {
    const fields = rawRecords(line + '\n')[0] ?? [];
    const note = fields[0] === '(note)' ? unquote(fields[1] ?? '') : '';
    if (note.startsWith(NOT_IN_FILE)) {
      const at = note.indexOf(': ');
      const names = note.slice(at + 2).split(' | ');
      const kept = names.filter((n) => !sourceSet.has(n));
      if (kept.length === 0) continue;
      if (kept.length === names.length) { expected.push(line); continue; }
      const text = `${note.slice(0, at + 2)}${kept.join(' | ')}`;
      expected.push(rawRecords(`(note),${/[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text},,,\n`)[0].join(','));
    } else expected.push(line);
  }
  if (rest.length !== expected.length) out.push(`${rest.length} lines after (minus the allowed ones), ${expected.length} expected`);
  for (let i = 0; i < Math.min(rest.length, expected.length); i++) if (rest[i] !== expected[i]) { out.push(`line ${i + 1}: ${expected[i].slice(0, 120)}  ->  ${rest[i].slice(0, 120)}`); if (out.length > 5) break; }
  return out;
}
