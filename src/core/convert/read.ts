// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { unguardText } from '../output/csv';
import type { ParsedFile, RawCell, RawRow, RawSheet } from '../types';

/*
 * The converter's reading path. A file is parsed as /check parses it, then every TEXT cell and every header goes through `unguardText`:
 * the code-proposal CSV that /convert hands back (ids.ts proposeSampleCodes) writes a text cell that starts like a formula as `'=x`, and a
 * leading apostrophe before a formula character is the spreadsheet's own text escape, so the converter reads `'=x` as `=x` and the file
 * round-trips. A number is never touched. /check does not call this: a file dropped on /check is read exactly as before.
 */
const un = (c: RawCell): RawCell => (typeof c === 'string' ? unguardText(c) : c);

function unguardSheet(s: RawSheet): RawSheet {
  return {
    ...s,
    header: s.header.map((h) => unguardText(h)),
    rows: s.rows.map((r): RawRow => ({ ...r, cells: r.cells.map(un) })),
  };
}

/** The file as the converter reads it: the formula guard of the proposal CSV taken off every text cell and header. Pure; the input is not changed. */
export function readConvertFile(file: ParsedFile): ParsedFile {
  return { ...file, sheets: file.sheets.map(unguardSheet) };
}
