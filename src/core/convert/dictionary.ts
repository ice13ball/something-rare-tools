// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { stripTypeSuffix } from '../recognize/columns';
import { headerKey } from '../recognize/vocab';
import type { ColumnProposal, RawSheet } from '../types';
import { parseNumber } from '../values/numbers';

/*
 * A sheet that is a DATA DICTIONARY (a glossary of the columns of the data sheets, or the notes of the workbook), not data. The converter would read its rows as samples and turn
 * its words into columns without meaning, so the page starts such a sheet UNTICKED ("Convert this sheet" off), with a short note; the user can tick it.
 *
 *   name     the sheet is named Metadata, README, Info, Description(s), Dictionary, Legend, Notes, Codebook or About, and the converter finds no position (latitude and longitude) in it
 *   columns  the header has a column that NAMES the described column (column_name, variable, parameter, field, ...) next to a column that EXPLAINS it (description, explanation, meaning,
 *            definition, comment, ...), and what is under the header is mostly text (a table of measurements has numbers)
 *
 * Both are deliberately narrow: a sheet that is wrongly left unticked costs one tick, a glossary read as data costs a confusing archive.
 */

export type DictionaryReason = 'name' | 'columns';

const SHEET_NAME = /^(metadata|meta data|readme|read me|info|information|description|descriptions|data description|dataset description|dictionary|data dictionary|legend|notes|codebook|about|opis|opis danych|slownik|metadane|legenda|erlauterungen|beschreibung|legende|description des donnees|dictionnaire|leggimi)$/;
const NAMES_A_COLUMN = /^(column|column name|columns|column names|variable|variable name|variables|parameter|parameter name|field|field name|header|name|short name|code|abbreviation|kolumna|nazwa kolumny|nazwa|zmienna|spalte|spaltenname|variable name|colonne|nom de colonne)$/;
const EXPLAINS = /^(description|descriptions|explanation|meaning|definition|comment|comments|notes|note|long name|details|what it is|opis|objasnienie|znaczenie|definicja|komentarz|uwagi|erklarung|beschreibung|bedeutung|definition|kommentar|signification|commentaire|explication)$/;

const key = (h: string): string => headerKey(stripTypeSuffix(h).replace(/[_.]+/g, ' '));

/** Share of the sampled filled cells (outside the column that names the described column) that are not numbers. */
function textShare(sheet: RawSheet, decimalComma: boolean): number {
  let filled = 0;
  let text = 0;
  for (const row of sheet.rows.slice(0, 200)) {
    for (const c of row.cells) {
      if (c === null || String(c).trim() === '') continue;
      filled++;
      if (parseNumber(c, decimalComma).status !== 'ok') text++;
    }
  }
  return filled === 0 ? 0 : text / filled;
}

/** Why the sheet looks like a data dictionary, or undefined when it does not. `proposals` are the converter's own for the sheet (a position makes it data, whatever its name). */
export function dictionaryReason(sheet: RawSheet, proposals: readonly ColumnProposal[], decimalComma = false): DictionaryReason | undefined {
  if (sheet.rows.length === 0) return undefined;
  const hasPosition = proposals.some((p) => p.role.kind === 'latitude') && proposals.some((p) => p.role.kind === 'longitude');
  if (hasPosition) return undefined;
  const cols = sheet.unnamedFrom === undefined ? sheet.header : sheet.header.slice(0, sheet.unnamedFrom);
  const keys = cols.map(key);
  // a CSV sheet is named after its file ("metadata.csv"): the extension is not part of the name
  if (SHEET_NAME.test(key(sheet.name.replace(/\.(csv|tsv|tab|txt|xlsx?|ods)$/i, '')))) return 'name';
  if (keys.some((k) => NAMES_A_COLUMN.test(k)) && keys.some((k) => EXPLAINS.test(k)) && cols.length <= 8 && textShare(sheet, decimalComma) >= 0.9) return 'columns';
  return undefined;
}
