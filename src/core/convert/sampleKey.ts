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
 * The eventID of a key made of columns is a NAME (the sheet's, or the file's for a table file; the person may change it; the companion file keeps it, so a renamed file keeps its IDs), then the values of those columns in the order the person picked them, joined with "|":
 *   - it depends on the sheet and the values and nothing else: the same file and the same answers give the same IDs whatever the order of the rows, and whatever other sheets are in the run;
 *   - no two different keys give the same ID: "|" and "\\" inside a value are written "\\|" and "\\\\", a tab, a line break and a carriage return "\\t", "\\n" and "\\r" (so the ID is safe in the
 *     tab-separated tables), a blank value is an empty part, and the number of parts is fixed for a sheet, so "a|b" + "c" and "a" + "b|c" stay two samples;
 *   - the keys of two sheets with different names never meet, and no ID is the ID of a station or a cruise (those carry no name). Two sheets with the SAME name and the same values are blocked by CONV-ID-DUPLICATE, whose advice says to give one of them another name. Whether two sheets hold the SAME samples is a question for the person and is not asked here;
 *   - a value is trimmed and in Unicode form NFC (a letter with its accent in one piece or in two is one value); case and inner spaces are kept ("A1" and "a1" are two samples);
 *   - a blank part is part of the key (rows with a blank and rows with a value are different samples) and is said (CONV-KEY-PART-BLANK, to accept); a row whose every part is blank has no
 *     sample (CONV-SAMPLE-CODE-MISSING);
 *   - an ID written to the archive (sample, replicate or occurrence) longer than MAX_EVENT_ID characters blocks (CONV-KEY-TOO-LONG, which names the longest).
 */

/** What the person picked: the indexes of the columns, in the order picked. */
export interface SampleKey {
  columns: number[];
  /** The name every ID of the key starts with (the person sees it and may change it). Absent: the default of defaultKeyPrefix. An empty one is no prefix. */
  prefix?: string;
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
  /** The name every ID starts with (see defaultKeyPrefix). */
  prefix: string;
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
 * A cell as a code is compared. A typed number (a spreadsheet cell) is its number. A text is its trimmed self, except an integer written with an all-zero fraction in the FILE's own decimal
 * separator ("1.0", "1.00" in a file with a decimal point; "1,0" in a file with a decimal comma), which is the integer; the other separator is no decimal mark there ("1,000" in a dot file is a
 * thousand, "1.000" in a comma file too), and thousands separators are never interpreted: "1" and "1.0" are one value, and so is a numeric cell 1 and the text "1.0". Nothing else is read as a number: "1.1" and "1.10", "1e1" and "10", "+5" and "5" stay
 * different, a code with a leading zero ("007") and a code of 16 digits or more stay the text they are.
 */
function codeText(cell: string | number | boolean | Date, decimalComma: boolean): string {
  if (typeof cell === 'number') return String(cell);
  const t = String(cell).trim();
  if (t === '') return '';
  if (/^[+-]?0\d/.test(t) || /\d{16}/.test(t)) return t;
  const m = (decimalComma ? /^(-?\d+),0+$/ : /^(-?\d+)\.0+$/).exec(t);
  return m === null ? t : m[1];
}

/**
 * The name every ID of a key starts with, as the page offers it: the sheet's name for a workbook sheet (the file's name is not in it, so a renamed file keeps its IDs), the file's name without its
 * extension for a table file (a CSV's sheet is called after the file). The person may change it, and the companion file keeps what they used.
 */
export function defaultKeyPrefix(kind: string, fileName: string, sheetName: string): string {
  const stem = fileName.replace(/\.[^./\\]+$/, '');
  const name = kind === 'xlsx' ? sheetName : stem;
  return name.trim() !== '' ? name : sheetName.trim() !== '' ? sheetName : 'sheet';
}

/** The prefix a key really uses: the person's, else the default. */
export function keyPrefixOf(key: SampleKey, kind: string, fileName: string, sheetName: string): string {
  return key.prefix !== undefined && key.prefix.trim() !== '' ? key.prefix : defaultKeyPrefix(kind, fileName, sheetName);
}

/**
 * Key columns that mix typed numbers (a spreadsheet cell) with number-like TEXT (a text that reads as a number in the file's own way): such cells are compared differently, so one sample may be split in
 * two ("1.5" typed and "1.50" written are two values). Date and time columns are not looked at (the date reader makes them one). Returns the column and a typed example and a text example.
 */
export function mixedKeyColumns(sheet: RawSheet, columns: readonly number[], decimalComma: boolean, roleOf: (index: number) => string): { index: number; examples: [string, string] }[] {
  const out: { index: number; examples: [string, string] }[] = [];
  const like = decimalComma ? /^[+-]?\d+(,\d+)?$/ : /^[+-]?\d+(\.\d+)?$/;
  for (const index of columns) {
    const role = roleOf(index);
    if (role === 'date' || role === 'datetime' || role === 'time' || sheet.dateFormatted?.[index] === true || sheet.timeFormatted?.[index] === true) continue;
    let typed: string | undefined;
    let text: string | undefined;
    for (const row of sheet.rows) {
      const cell = row.cells[index] ?? null;
      if (typeof cell === 'number') typed ??= String(cell);
      else if (typeof cell === 'string' && like.test(cell.trim())) text ??= cell.trim();
      if (typed !== undefined && text !== undefined) break;
    }
    if (typed !== undefined && text !== undefined) out.push({ index, examples: [typed, text] });
  }
  return out;
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
  const prefix = ctx.prefix;
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
