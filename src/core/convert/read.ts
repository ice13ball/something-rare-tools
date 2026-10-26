// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { unguardText } from '../output/csv';
import type { ParsedFile, RawCell, RawRow, RawSheet } from '../types';
import { readPangaeaParameters } from './pangaeaHeader';

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
export function readConvertFile(file: ParsedFile, text?: string): ParsedFile {
  const read = { ...file, sheets: file.sheets.map(unguardSheet) };
  // a PANGAEA file: the long names, abbreviations and comments of its Parameter(s) block (the shared parser keeps less, for /check)
  const parameters = file.kind === 'pangaea' && text !== undefined ? readPangaeaParameters(text) : undefined;
  return parameters === undefined ? read : { ...read, pangaeaParameters: parameters };
}

/**
 * The description files of a Darwin Core archive, recognised by CONTENT: an EML document (root element `eml`) and the archive's meta.xml (root element
 * `archive` in the DwC text namespace). Dropped on /convert they are not a data sheet and not a metadata record the page reads; the page lists them as such.
 * Only the first element after the XML declaration, comments and doctype is looked at, in the first 4 KB. /check does not call this.
 */
export function archiveDescriptorKind(bytes: Uint8Array): 'eml' | 'meta' | undefined {
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 4096)).replace(/^﻿/, '');
  const m = /^\s*(?:<\?xml[^>]*\?>\s*|<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<\s*(?:([\w.-]+):)?([\w.-]+)([^>]*)>/.exec(head);
  if (!m) return undefined;
  const local = m[2];
  const attrs = m[3];
  if (local === 'eml' && /ecoinformatics\.org/.test(attrs)) return 'eml';
  if (local === 'archive' && /rs\.tdwg\.org\/dwc\/text/.test(attrs)) return 'meta';
  return undefined;
}
