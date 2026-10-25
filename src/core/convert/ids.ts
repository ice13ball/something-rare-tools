// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { csvField, guardText } from '../output/csv';
import type { ParsedFile, RawCell, RawSheet, SheetMapping } from '../types';
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

/** One cell as CSV text, from its own text: numbers and missing tokens as they are, other text through the formula guard of the clean CSV (output/csv.ts). */
function cellText(raw: RawCell | undefined, decimalComma: boolean): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number') return String(raw);
  const p = parseNumber(raw, decimalComma);
  return p.status === 'ok' || p.status === 'missing' ? raw : guardText(raw);
}

/**
 * Q1: a sheet WITHOUT a sample code gets codes proposed ONCE, deterministically: `<station>-<n>`, n counting the rows of that station in sheet
 * order from 1 (`sample-<n>` for rows with no station), unique across the sheet. Returns the sheet as CSV with a new last column of codes; the
 * user checks it and uploads that file; the ID then comes from the user's own sheet. Returns undefined when the mapping already has a sample code
 * column: the converter does not overwrite or fill the user's codes.
 */
export function proposeSampleCodes(file: Pick<ParsedFile, 'decimalComma'>, sheet: RawSheet, mapping: SheetMapping): SampleCodeProposal | undefined {
  if (mapping.columns.some((c) => c.role.kind === 'sampleId')) return undefined;
  const stationCol = mapping.columns.find((c) => c.role.kind === 'station')?.index;
  const used = new Set<string>();
  const perStation = new Map<string, number>();
  const codes = sheet.rows.map((row) => {
    if (row.cells.every((c) => c === null || String(c).trim() === '')) return '';
    const station = stationCol === undefined ? '' : cleanCode(String(row.cells[stationCol] ?? ''));
    const stem = station === '' ? 'sample' : station;
    let n = (perStation.get(stem) ?? 0) + 1;
    let code = `${stem}-${n}`;
    while (used.has(code)) code = `${stem}-${++n}`;
    perStation.set(stem, n);
    used.add(code);
    return code;
  });
  const taken = new Set(sheet.header.map((h) => h.trim().toLowerCase()));
  let header = 'sample_code';
  for (let i = 2; taken.has(header.toLowerCase()); i++) header = `sample_code_${i}`;
  const width = sheet.header.length;
  const line = (fields: readonly string[]): string => fields.map(csvField).join(',');
  const lines = [
    line([...sheet.header.map((h) => guardText(h)), header]),
    ...sheet.rows.map((row, i) => line([...Array.from({ length: width }, (_, k) => cellText(row.cells[k], file.decimalComma)), guardText(codes[i])])),
  ];
  return { header, codes, csv: lines.join('\n') + '\n' };
}
