// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ParsedFile, RawCell, RawSheet, SheetMapping } from '../types';
import { guardText } from '../output/csv';
import { excelSerialToDate, parseTimeOfDay } from '../values/dates';
import { parseNumber } from '../values/numbers';

/*
 * Identifiers of the converter.
 *
 *   sample eventID   the user's own sample code; when codes repeat between stations an input toggle prefixes the station eventID
 *   station eventID  `cruise:station` (the station code alone when there is no cruise)
 *   cruise eventID   the cruise code
 *   occurrenceID     wide: `<sample eventID>:<exact species header>`
 *                    long: the user's occurrenceID column, else `<sample eventID>:<exact taxon cell>[:<lifeStage from the lifeStage column>]`
 *
 * ⛔ An ID is NEVER derived from depth, from row order or from a WoRMS name. The only generated codes are the one-time proposal below,
 * which the user checks and uploads again; from then on the ID is the user's own code, and the converter never regenerates it silently.
 */

/** A tab or a line break inside a value would break a tab-separated file with one record per line. */
export const TAB_OR_NEWLINE = /[\t\r\n]/;
export const hasTabOrNewline = (s: string): boolean => TAB_OR_NEWLINE.test(s);
/** The text of such a value shown in a finding: the characters become a space. */
export const shownText = (s: string): string => s.replace(/[\t\r\n]+/g, ' ');

/** The whole sample or station cell is exactly one of these words (any case): the row is a summary line, not a sample. "Total Bay" is a station and does not match. */
export const SUMMARY_LABEL = /^(total|suma|razem|summe|gesamt|somme)$/i;

export const stationPrefixedId = (stationEventId: string, code: string): string => `${stationEventId}:${code}`;
export const occurrenceIdWide = (sampleEventId: string, header: string): string => `${sampleEventId}:${header}`;
export const occurrenceIdLong = (sampleEventId: string, taxonCell: string, lifeStageColumn?: string): string =>
  lifeStageColumn === undefined || lifeStageColumn === '' ? `${sampleEventId}:${taxonCell}` : `${sampleEventId}:${taxonCell}:${lifeStageColumn}`;

/* ---------- the one-time code proposal (Q1) ---------- */

export interface SampleCodeProposal {
  /** The header of the added column. */
  header: string;
  /** One code per data row of the sheet, in sheet order ('' for a row with no cell filled). */
  codes: string[];
  /** The user's sheet as CSV with the new code column LAST. The original cells are not touched. */
  csv: string;
}

const cleanCode = (s: string): string => s.trim().replace(/[\t\r\n]+/g, ' ');

/** A presence mark written alone: an ordinary value of a species column, never a formula. */
const PRESENCE_MARKS = new Set(['+', 'x', 'X', '-']);

/**
 * The spreadsheet formula guard of the proposal CSV: the repo's own guard (output/csv.ts guardText: a leading = + - @ or their full-width forms,
 * after spaces or tabs, and a leading tab or CR) on EVERY text cell, header and code, with three exemptions: a value that is a plain number (read with
 * the sheet's decimal setting: "-1,5", "+3"), a missing-data token (NA, -, n.d. ...) and a presence mark alone (+ x X -). The converter's reader does
 * not strip an apostrophe, so a guarded cell comes back with it.
 */
export function guardCell(text: string, decimalComma: boolean): string {
  // spaces around a mark do not matter (the cell is written as it was); a tab or CR in front still gets the guard
  if (PRESENCE_MARKS.has(text.replace(/^ +| +$/g, ''))) return text;
  const p = parseNumber(text, decimalComma);
  if (p.status === 'ok' || p.status === 'missing') return text;
  return guardText(text);
}

/**
 * One cell as text for the proposal CSV. A text cell is copied UNCHANGED (a decimal comma stays a comma: the file keeps its delimiter, so it is read
 * as it was) apart from the guard. An xlsx number is written with a dot. A date or date-time cell (a date-formatted column) is written as ISO 8601
 * text with the workbook's own date system; a TIME-ONLY cell (a time-only number format) is written as HH:MM or HH:MM:SS, as the converter reads
 * a time of day. A time-only value outside [0,1) (a duration such as 36:00 in [h]:mm) has no time of day: it is written as the number it is, which
 * the converter cannot read either way, so the finding on it is the same before and after. Never a serial number for a date or a time.
 */
function cellText(raw: RawCell | undefined, kind: 'plain' | 'date' | 'time', date1904: boolean, decimalComma: boolean): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number') {
    if (kind === 'time') {
      const t = parseTimeOfDay(raw);
      if (!('error' in t)) return t.text;
    } else if (kind === 'date') {
      try {
        return excelSerialToDate(raw, date1904).iso;
      } catch {
        /* an impossible serial is written as the number it is */
      }
    }
    return String(raw);
  }
  return guardCell(raw, decimalComma);
}

/**
 * Q1: a sheet WITHOUT a sample code gets codes proposed ONCE, deterministically: `<station>-<n>`, n counting the rows of that station in sheet
 * order from 1 (`sample-<n>` for rows with no station), unique across the sheet; a code that would start like a formula becomes `S<row number>`. Returns the sheet as CSV with a new last column of codes; the
 * user checks it and uploads that file; the ID then comes from the user's own code. The cells are copied as text (see cellText), the delimiter is
 * ';' for a decimal-comma source and ',' otherwise, so the file is read back exactly as the sheet was. Returns undefined when the mapping already has
 * a sample code column: the converter does not overwrite or fill the user's codes.
 */
export function proposeSampleCodes(file: Pick<ParsedFile, 'decimalComma'> & { date1904?: boolean }, sheet: RawSheet, mapping: SheetMapping): SampleCodeProposal | undefined {
  if (mapping.columns.some((c) => c.role.kind === 'sampleId')) return undefined;
  const stationCol = mapping.columns.find((c) => c.role.kind === 'station')?.index;
  const used = new Set<string>();
  const perStation = new Map<string, number>();
  const dc = file.decimalComma;
  const codes = sheet.rows.map((row, i) => {
    if (row.cells.every((c) => c === null || String(c).trim() === '')) return '';
    const station = stationCol === undefined ? '' : cleanCode(String(row.cells[stationCol] ?? ''));
    const stem = station === '' ? 'sample' : station;
    let n = (perStation.get(stem) ?? 0) + 1;
    let code = `${stem}-${n}`;
    while (used.has(code)) code = `${stem}-${++n}`;
    // a code that would start like a formula (a station "-5" or "=x") would need the apostrophe in the file and then differ from the code shown:
    // such a row gets S<row number> instead, which never needs it, so the codes the page shows are exactly the codes in the file
    if (guardCell(code, dc) !== code) {
      let k = 1;
      code = `S${i + 1}`;
      while (used.has(code)) code = `S${i + 1}-${++k}`;
    } else perStation.set(stem, n);
    used.add(code);
    return code;
  });
  const taken = new Set(sheet.header.map((h) => h.trim().toLowerCase()));
  let header = 'sample_code';
  for (let i = 2; taken.has(header.toLowerCase()); i++) header = `sample_code_${i}`;
  const width = sheet.header.length;
  const delimiter = dc ? ';' : ',';
  const field = (v: string): string => (v.includes(delimiter) || /["\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const line = (fields: readonly string[]): string => fields.map(field).join(delimiter);
  const date1904 = file.date1904 === true;
  const lines = [
    line([...sheet.header.map((h) => guardCell(h, dc)), header]),
    ...sheet.rows.map((row, i) => line([...Array.from({ length: width }, (_, k) => cellText(row.cells[k], sheet.timeFormatted?.[k] === true ? 'time' : sheet.dateFormatted?.[k] === true ? 'date' : 'plain', date1904, dc)), guardCell(codes[i], dc)])),
  ];
  return { header, codes, csv: lines.join('\n') + '\n' };
}
