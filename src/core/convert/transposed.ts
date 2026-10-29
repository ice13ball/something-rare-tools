// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { isBlankCell, isKnownColumnName } from '../recognize/columns';
import type { LayoutReasonCode } from '../recognize/layoutReasons';
import { transposedReason } from '../recognize/layout';
import type { ParsedFile, RawSheet } from '../types';
import { parseNumber } from '../values/numbers';

/*
 * A transposed sheet in the converter: the table is turned (a row per variable or per species, a column per sample), so row 1 is NOT the header the converter reads.
 *
 *   transposed        variables in rows, samples in columns: the very detection /check runs (recognize/layout.ts transposedReason), unchanged
 *   transposed-taxa   species in rows, samples in columns: the first column holds Latin names, the other headers are sample codes, the cells are numbers or presence marks
 *
 * /check only reports a transposed sheet (IN-LAYOUT-UNSUPPORTED) and has no way to read it, so the converter does the same: it does not read the sheet, blocks (CONV-SHEET-TRANSPOSED), and the
 * user either turns the sheet in the spreadsheet or says "read it as a normal table". Nothing is turned here, because a guessed turn would write a species where a sample belongs.
 *
 * Never run on a sheet that is already a pivot of a long sheet, on a profile sheet, or on a sheet the user said to read as it stands. A normal wide species sheet (species are the HEADERS) is the
 * standard input and is never flagged: the species rule needs the Latin names in the first COLUMN and none (at most one in five) in the header.
 */

/** Genus + epithet (or sp. / spp. / indet., with an optional cf. / aff.), nothing else: "Calanus finmarchicus", "Pseudocalanus sp.", "Calanus cf. glacialis". */
const LATIN_NAME = /^[A-Z][a-z]{2,}(?:\s+(?:cf|aff)\.)?\s+(?:[a-z]{3,}|sp\.|spp\.|indet\.)(?:\s+[a-z]{3,})?$/;
/** A header over the first column that says it holds names (or says nothing): a column of species, not a column of stations or samples. */
const NAME_HEADER = /^(species|species name|taxon|taxa|taxon name|scientific ?name|scientific name|name|gatunek|gatunki|takson|nazwa|art|arten|espece|especes)$/i;
const SUM_HEADER = /^(total|sum|suma|razem|summe|gesamt|somme|n)$/i;
const PRESENCE_MARK = /^(\+|x|\*)$/i;

const MIN_NAMES = 3;

function taxaInRows(sheet: RawSheet, decimalComma: boolean): boolean {
  const cols = sheet.unnamedFrom ?? sheet.header.length;
  if (cols < 3 || sheet.rows.length < MIN_NAMES) return false;
  const first = sheet.header[0]?.trim() ?? '';
  if (first !== '' && !NAME_HEADER.test(first) && isKnownColumnName(first)) return false;
  let filled = 0;
  let latin = 0;
  for (const r of sheet.rows) {
    const c = r.cells[0] ?? null;
    if (isBlankCell(c)) continue;
    filled++;
    if (typeof c === 'string' && LATIN_NAME.test(c.trim())) latin++;
  }
  if (latin < MIN_NAMES || latin * 10 < filled * 6) return false;
  // the other headers are sample codes: none is a column name the tool knows (a total column apart), and at most one in five reads as a species
  const others = sheet.header.slice(1, cols).filter((h) => h.trim() !== '' && !SUM_HEADER.test(h.trim()));
  if (others.length < 2 || others.some((h) => isKnownColumnName(h))) return false;
  if (others.filter((h) => LATIN_NAME.test(h.trim())).length * 5 > others.length) return false;
  let cells = 0;
  let numeric = 0;
  for (const r of sheet.rows.slice(0, 200)) {
    for (let i = 1; i < cols; i++) {
      const c = r.cells[i] ?? null;
      if (isBlankCell(c)) continue;
      cells++;
      if ((typeof c === 'string' && PRESENCE_MARK.test(c.trim())) || parseNumber(c, decimalComma).status === 'ok') numeric++;
    }
  }
  return cells > 0 && numeric * 10 >= cells * 8;
}

/** Why the sheet looks transposed, or undefined when it does not (the usual case). */
export function transposedSheetReason(sheet: RawSheet, file: Pick<ParsedFile, 'decimalComma'>): LayoutReasonCode | undefined {
  if (sheet.pivot !== undefined) return undefined;
  const a = transposedReason(sheet, file.decimalComma);
  if (a !== undefined) return a;
  return taxaInRows(sheet, file.decimalComma) ? 'transposed-taxa' : undefined;
}
