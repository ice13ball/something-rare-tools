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
 * ONE reader of the values: `1` and `1.0` are one sample (codeText); a date cell (the role date or datetime, or
 * a column the workbook formats as a date) goes through the date reader that writes the dates, so an Excel serial and the same date as text are one sample and one ID, and 1904 workbooks are
 * read right; a time column goes through the time reader; an empty cell and the missing tokens of the converter (NA, nan, a dash ...) are blank.
 *
 * The eventID of a key made of columns is the SHEET, then the values of those columns in the order the person picked them, joined with "|":
 *   - it depends on the sheet and the values and nothing else: the same file and the same answers give the same IDs whatever the order of the rows, and whatever other sheets are in the run;
 *   - no two different keys give the same ID: "|" and "\\" inside a value are written "\\|" and "\\\\", a tab, a line break and a carriage return "\\t", "\\n" and "\\r" (so the ID is safe in the
 *     tab-separated tables), a blank value is an empty part, and the number of parts is fixed for a sheet, so "a|b" + "c" and "a" + "b|c" stay two samples;
 *   - the keys of two sheets never meet, and no ID is the ID of a station or a cruise (those carry no sheet). Whether two sheets hold the SAME samples is a question for the person and is not asked here;
 *   - a value is trimmed and in Unicode form NFC (a letter with its accent in one piece or in two is one value); case and inner spaces are kept ("A1" and "a1" are two samples);
 *   - a blank part is part of the key (rows with a blank and rows with a value are different samples) and is said (CONV-KEY-PART-BLANK, to accept); a row whose every part is blank has no
 *     sample (CONV-SAMPLE-CODE-MISSING);
 *   - an ID written to the archive (sample, replicate or occurrence) longer than MAX_EVENT_ID characters blocks (CONV-KEY-TOO-LONG, which names the longest).
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
  /** The file the sheet is in: the ID of a sample carries the sheet, so keys of two sheets never meet. */
  fileName: string;
  sheet: RawSheet;
  decimalComma: boolean;
  date1904: boolean;
  /** The kind of the role of a column ('date', 'time', 'station' ...). */
  roleOf: (index: number) => string;
}

export interface KeyRead {
  /** The code of the row, or undefined when every part is blank. */
  id: string | undefined;
  /** Some part is blank (and, if id is defined, not all). */
  blankPart: boolean;
  /** The values of the parts, as they are compared (for the checks that read a label in a key column: a Total row). */
  parts: string[];
}

/**
 * A cell as a code is compared. A typed number (a spreadsheet cell) is its number. A text is its trimmed self, except an integer written with an all-zero fraction ("1.0", "1.00", "1,0" with a
 * decimal comma), which is the integer: "1" and "1.0" are one value, and so is a numeric cell 1 and the text "1.0". Nothing else is read as a number: "1.1" and "1.10", "1e1" and "10", "+5" and "5" stay
 * different, a code with a leading zero ("007") and a code of 16 digits or more stay the text they are.
 */
function codeText(cell: string | number | boolean | Date): string {
  if (typeof cell === 'number') return String(cell);
  const t = String(cell).trim();
  if (t === '') return '';
  if (/^[+-]?0\d/.test(t) || /\d{16}/.test(t)) return t;
  const m = /^(-?\d+)[.,]0+$/.exec(t);
  return m === null ? t : m[1];
}

/** The part of every ID that tells the sheet: the sheet's name, with the file's when the two differ (a workbook's "Sheet 1" exists in many files). */
export function keyPrefix(fileName: string, sheetName: string): string {
  return sheetName === fileName ? sheetName : `${fileName} / ${sheetName}`;
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
  return codeText(cell as string | number).normalize('NFC');
}

/** The reader of a sheet's sample code under a picked key. */
export function keyReader(key: SampleKey, ctx: KeyContext): (row: RawRow) => KeyRead {
  const order = new Map<number, ReturnType<typeof detectDayMonthOrder>>();
  const cols = key.columns;
  const prefix = keyPrefix(ctx.fileName, ctx.sheet.name);
  return (row) => {
    const parts = cols.map((i) => keyPart(ctx, row, i, order));
    const blanks = parts.filter((p) => p === '').length;
    if (blanks === parts.length) return { id: undefined, blankPart: false, parts };
    // (the sheet is the first part: a key never meets another sheet's, and never the ID of a station or a cruise)
    return { id: derivedEventId([prefix, ...parts]), blankPart: blanks > 0, parts };
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
  /** Rows with an ID written to the archive (sample, replicate or occurrence) longer than MAX_EVENT_ID (blocking). */
  tooLong: number;
  /** The columns the key was made of, in the order picked (the page shows numbers only for the key they belong to). */
  columns: number[];
}
