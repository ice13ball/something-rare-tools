// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Synthetic sheets for the converter tests. Every value is invented; the taxon names are real, as the task allows.
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { proposeConvertMapping, suggestConvertShape } from '../../src/core/convert/recognize';
import type { ColumnRole, ParsedFile, SheetMapping } from '../../src/core/types';
import { rawSheet } from '../helpers/files';

export const CTX = { decimalComma: false, date1904: false };
export type Cell = string | number | null;

export function fileOf(header: string[], rows: Cell[][], name = 'S', opts: { decimalComma?: boolean; fileName?: string } = {}): ParsedFile {
  return {
    fileName: opts.fileName ?? 'sheet.csv',
    kind: 'csv',
    sheets: [rawSheet(header, rows, name)],
    date1904: false,
    decimalComma: opts.decimalComma === true,
    encoding: 'utf-8',
    findings: [],
  };
}

/** The recognised mapping of the first sheet, with `edit` roles replaced by header. */
export function mappingOf(file: ParsedFile, edit: Record<string, ColumnRole> = {}): SheetMapping {
  const m = proposeConvertMapping(file.sheets[0], { decimalComma: file.decimalComma, date1904: file.date1904 });
  return { ...m, columns: m.columns.map((c) => (edit[c.header] ? { ...c, role: edit[c.header] } : c)) };
}

export function sheetInput(file: ParsedFile, extra: Partial<ConvertSheetInput> & { edit?: Record<string, ColumnRole> } = {}): ConvertSheetInput {
  const { edit, ...rest } = extra;
  const mapping = mappingOf(file, edit);
  const shape = rest.shape ?? suggestConvertShape(mapping.columns) ?? 'wide';
  return { file, sheet: file.sheets[0].name, mapping, shape, ...rest };
}

/* ---- the four shapes of the acceptance list ---- */

export const W1_HEADER = ['Cruise', 'Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Depth top [m]', 'Depth bottom [m]', 'Volume filtered [m3]', 'Calanus finmarchicus', 'Oithona similis', 'Pseudocalanus sp.'];
/** W1: wide counts, a full species list. One zero (an absence), one empty cell, one NA. */
export const W1_ROWS: Cell[][] = [
  ['CR1', 'S1', 'S1-a', '2023-06-14', 55.5, 2.5, 0, 25, 12.3, 10, 5, 0],
  ['CR1', 'S1', 'S1-b', '2023-06-14', 55.5, 2.5, 25, 50, 12.1, 7, null, 3],
  ['CR1', 'S2', 'S2-a', '2023-06-16', 55.9, 3.1, 0, 50, 13.0, 'NA', 4, 1],
];
export const W1_QUANTITY = { kind: 'count' as const, effort: { source: 'column' as const } };

export const W2_HEADER = ['Cruise', 'Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Depth, top/min [m]', 'Depth, bottom/max [m]', 'Volume filtered [m3]', 'Calanus finmarchicus c2', 'Calanus cf. glacialis', 'Augaptilus glacialis, c2', 'Pseudocalanus sp.'];
/** W2: wide density with life stages and sp. / cf. */
export const W2_ROWS: Cell[][] = [
  ['CR2', 'T1', 'T1-1', '2023-07-01', 60.1, -3.2, 0, 100, 25, 12.5, 3.2, 1.1, 40.0],
  ['CR2', 'T2', 'T2-1', '2023-07-02', 60.4, -3.0, 0, 100, 24, 9.5, 0, 2.2, 38.5],
];
export const W2_QUANTITY = { kind: 'density' as const, unit: '#/m3', effort: { source: 'column' as const } };

export const L1_HEADER = ['occurrenceID', 'eventID', 'scientificName', 'individualCount', 'decimalLatitude', 'decimalLongitude', 'eventDate', 'minimumDepthInMeters', 'maximumDepthInMeters'];
/** L1: long, with the user's occurrenceID. */
export const L1_ROWS: Cell[][] = [
  ['occ-001', 'E1', 'Calanus finmarchicus', 5, 54.1, 7.9, '2022-05-05', 0, 10],
  ['occ-002', 'E1', 'Oithona similis', 11, 54.1, 7.9, '2022-05-05', 0, 10],
  ['occ-003', 'E2', 'Calanus finmarchicus', 2, 54.3, 8.1, '2022-05-06', 0, 10],
];

export const L2_HEADER = ['Station', 'Sample', 'Species', 'Stage', 'Count', 'Latitude', 'Longitude', 'Date', 'Depth'];
/** L2: long without an occurrenceID, with a lifeStage column. */
export const L2_ROWS: Cell[][] = [
  ['A', 'A1', 'Calanus finmarchicus', 'C2', 4, 70.1, 20.2, '2021-08-01', 5],
  ['A', 'A1', 'Calanus finmarchicus', 'C3', 6, 70.1, 20.2, '2021-08-01', 5],
  ['A', 'A1', 'Oithona similis', null, 9, 70.1, 20.2, '2021-08-01', 5],
  ['B', 'B1', 'Calanus finmarchicus', 'C2', 1, 70.5, 20.9, '2021-08-02', 10],
];
