// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { detectDayMonthOrder, parseDate, parseTimeCell } from '../values/dates';
import { parseNumber } from '../values/numbers';
import type { RawRow, RawSheet } from '../types';

/*
 * The sample key: the columns a PERSON picked on the page to say what identifies one sample of a sheet that has no sample codes (a station and a date and a cast), and the eventID that is made
 * of them. It is read ONLY when the request carries a key for the sheet; without one nothing here is called and the converter takes the sample code from the sample-code column as before.
 * The key is never guessed: no column is proposed, no role is changed, nothing is pre-ticked. (The other way to get codes, the file with proposed codes, stays.)
 *
 * ONE reader of the values: a cell is read the way groupLongSheet (sampleGroups.ts) reads the key of a long sheet, so `1` and `1.0` are one sample; a date cell (the role date or datetime, or
 * a column the workbook formats as a date) goes through the date reader that writes the dates, so an Excel serial and the same date as text are one sample and one ID, and 1904 workbooks are
 * read right; a time column goes through the time reader; an empty cell and the missing tokens of the converter (NA, nan, a dash ...) are blank. A text with a leading zero ("007") stays
 * a text: a code is not a number.
 *
 * The eventID of a key made of columns is the values of those columns, in the order the person picked them, joined with "|":
 *   - it depends on the values and nothing else: the same file and the same answers give the same IDs whatever the order of the rows;
 *   - no two different keys give the same ID: "|" and "\\" inside a value are written "\\|" and "\\\\", a tab, a line break and a carriage return "\\t", "\\n" and "\\r" (so the ID is safe in the
 *     tab-separated tables), a blank value is an empty part, and the number of parts is fixed for a sheet, so "a|b" + "c" and "a" + "b|c" stay two samples;
 *   - a value is trimmed and in Unicode form NFC (a letter with its accent in one piece or in two is one value); case and inner spaces are kept ("A1" and "a1" are two samples);
 *   - a blank part is part of the key (rows with a blank and rows with a value are different samples) and is said (CONV-KEY-PART-BLANK, to accept); a row whose every part is blank has no
 *     sample (CONV-SAMPLE-CODE-MISSING);
 *   - an ID longer than MAX_EVENT_ID characters blocks (CONV-KEY-TOO-LONG).
 * A key of one column that is the station column (or the cruise column) would give the sample the ID of its own station, which CONV-ID-DUPLICATE always blocks: the sample gets "<value>|sample"
 * instead (a one-part ID never holds an unescaped "|", so this form is no other key's ID of the same sheet).
 * Two sheets that make the same ID are NOT merged and NOT renamed: the converter's own CONV-ID-DUPLICATE names both and blocks (the same rule as for any code the person wrote).
 */

/** What the person picked: the indexes of the columns, in the order picked. */
export interface SampleKey {
  columns: number[];
}

/** The longest eventID a Darwin Core archive takes (GBIF and OBIS read identifiers up to 255 characters). */
export const MAX_EVENT_ID = 255;

const ESCAPES: Record<string, string> = { '\\': '\\\\', '|': '\\|', '\t': '\\t', '\n': '\\n', '\r': '\\r' };
const escapePart = (s: string): string => s.replace(/[\\|\t\n\r]/g, (c) => ESCAPES[c]);

/** The eventID made of the values of a key. The parts are escaped, so different parts never give the same ID. */
export function derivedEventId(parts: readonly string[]): string {
  return parts.map(escapePart).join('|');
}

/** The columns a key reads (for the "this column is used" bookkeeping of the converter). */
export function keyColumns(key: SampleKey | undefined): number[] {
  return key === undefined ? [] : [...key.columns];
}

export interface KeyContext {
  sheet: RawSheet;
  decimalComma: boolean;
  date1904: boolean;
  /** The kind of the role of a column ('date', 'time', 'station' ...). */
  roleOf: (index: number) => string;
  /** The column of the station role, if the sheet has one. */
  stationColumn?: number;
  /** The column of the cruise role, if the sheet has one. */
  cruiseColumn?: number;
}

export interface KeyRead {
  /** The code of the row, or undefined when every part is blank. */
  id: string | undefined;
  /** Some part is blank (and, if id is defined, not all). */
  blankPart: boolean;
  /** The values of the parts, as they are compared (for the checks that read a label in a key column: a Total row). */
  parts: string[];
}

/** A text cell as a code is compared: "1" and "1.0" are one value, "007" is not "7". */
function codeText(cell: string | number | boolean | Date, decimalComma: boolean): string {
  const t = String(cell).trim();
  if (t === '') return '';
  // a code with a leading zero, or with more digits than a number holds exactly, stays the text it is (two long codes must not become one rounded number)
  if (typeof cell === 'string' && (/^[+-]?0\d/.test(t) || /\d{16}/.test(t))) return t;
  const p = parseNumber(cell as never, decimalComma);
  return p.status === 'ok' ? String(p.value) : t;
}

/** One cell of a key column, as the key compares it. '' is blank. */
export function keyPart(ctx: KeyContext, row: RawRow, index: number, dayOrder: Map<number, ReturnType<typeof detectDayMonthOrder>>): string {
  const cell = row.cells[index] ?? null;
  if (cell === null) return '';
  const p = typeof cell === 'string' ? parseNumber(cell, ctx.decimalComma) : undefined;
  // an empty cell and a missing token (NA, nan, a dash ...) are blank, and so are the other spellings of NA
  if (typeof cell === 'string' && (cell.trim() === '' || p?.status === 'missing' || p?.status === 'na-variant')) return '';
  const role = ctx.roleOf(index);
  const formatted = ctx.sheet.dateFormatted?.[index] === true;
  if (role === 'date' || role === 'datetime' || (formatted && ctx.sheet.timeFormatted?.[index] !== true)) {
    let order = dayOrder.get(index);
    if (order === undefined) dayOrder.set(index, (order = detectDayMonthOrder(ctx.sheet.rows.map((r) => r.cells[index] ?? null))));
    const d = parseDate(cell, { date1904: ctx.date1904, dateFormatted: formatted, datumColumn: true, ...(order === 'unknown' ? {} : { order }) });
    if (!('error' in d)) return (d.end ? `${d.iso}/${d.end.iso}` : d.iso).normalize('NFC');
  } else if (role === 'time') {
    const t = parseTimeCell(cell);
    if (!('error' in t)) return t.text.normalize('NFC');
  }
  return codeText(cell as string | number, ctx.decimalComma).normalize('NFC');
}

/** The reader of a sheet's sample code under a picked key. */
export function keyReader(key: SampleKey, ctx: KeyContext): (row: RawRow) => KeyRead {
  const order = new Map<number, ReturnType<typeof detectDayMonthOrder>>();
  const cols = key.columns;
  // (a key of one column that is the station or the cruise would make the sample's ID the ID of its own station or cruise event)
  const soleEvent = cols.length === 1 && (ctx.stationColumn === cols[0] || ctx.cruiseColumn === cols[0]);
  return (row) => {
    const parts = cols.map((i) => keyPart(ctx, row, i, order));
    const blanks = parts.filter((p) => p === '').length;
    if (blanks === parts.length) return { id: undefined, blankPart: false, parts };
    const id = derivedEventId(parts);
    return { id: soleEvent ? `${id}|sample` : id, blankPart: blanks > 0, parts };
  };
}

/** What the key made of the sheet, as the export will have it (convert() fills it; core/convert/keyPreview.ts asks for it). */
export interface SheetKeyReport {
  file: string;
  sheet: string;
  /** Samples of this sheet (a sample with replicates is one sample). */
  samples: number;
  /** Rows that belong to a sample (rows with no key, summary rows and the like are not among them). */
  rows: number;
  /** Rows per sample. */
  rowsPerSample: { min: number; max: number; median: number };
  /** Rows with no key at all. */
  blank: number;
  /** Rows with a blank part in the key (said, to accept). */
  blankParts: number;
  /** Rows whose key-derived ID is longer than MAX_EVENT_ID (blocking). */
  tooLong: number;
}
