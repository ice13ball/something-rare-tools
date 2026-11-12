// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The spec's invented workbook for the sample-sheet join (book.xlsx) and its variants, as converter inputs and as CSV text.
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { pivotConvertFile } from '../../src/core/convert/pivot';
import type { ParsedFile } from '../../src/core/types';
import { textFile, xlsxFile } from '../helpers/files';
import type { Cell } from '../helpers/files';
import { sheetInput } from './helpers';

export const COUNTS_HEADER: Cell[] = ['Sample', 'Taxon', 'Count'];
export const COUNTS_ROWS: Cell[][] = [
  ['X01', 'Calanus finmarchicus', 12],
  ['X01', 'Oithona similis', 3],
  ['X02', 'Calanus finmarchicus', 7],
];
export const SAMPLES_HEADER: Cell[] = ['Sample', 'Station', 'Date', 'Latitude', 'Longitude', 'Depth'];
export const SAMPLES_ROWS: Cell[][] = [
  ['X01', 'ST-1', '2021-05-03', 61.1, 4.2, 10],
  ['X02', 'ST-2', '2021-05-04', 61.3, 4.6, 20],
  ['X03', 'ST-3', '2021-05-05', 61.5, 4.9, 30],
];

/** The spec's workbook: Counts (results) and Samples (description). */
export const BOOK = xlsxFile('book.xlsx', { Counts: [COUNTS_HEADER, ...COUNTS_ROWS], Samples: [SAMPLES_HEADER, ...SAMPLES_ROWS] });

/** Samples as a long sheet (Sample | Parameter | Value), the same facts. */
export const LONG_SAMPLES_ROWS: Cell[][] = SAMPLES_ROWS.flatMap((r) => [
  [r[0], 'Latitude', r[3]],
  [r[0], 'Longitude', r[4]],
  [r[0], 'Depth', r[5]],
]);

/** The converter input of one sheet of a file: long counts get the taxon and quantity roles. */
export function resultsInput(file: ParsedFile, sheet: string, extra: Partial<ConvertSheetInput> = {}): ConvertSheetInput {
  const one = { ...file, sheets: file.sheets.filter((s) => s.name === sheet) };
  return sheetInput(one, { shape: 'long', quantity: { kind: 'count' }, edit: { Taxon: { kind: 'taxon' }, Count: { kind: 'quantity' } }, ...extra } as never);
}
export function descriptionInput(file: ParsedFile, sheet: string, extra: Partial<ConvertSheetInput> = {}): ConvertSheetInput {
  const one = { ...file, sheets: file.sheets.filter((s) => s.name === sheet) };
  return sheetInput(one, extra as never);
}

/** book.xlsx as inputs [Counts, Samples]; 'long-samples': Samples is a long sheet read through its pivot. */
export function bookInputs(variant?: 'long-samples'): ConvertSheetInput[] {
  const file =
    variant === 'long-samples'
      ? pivotConvertFile(xlsxFile('book.xlsx', { Counts: [COUNTS_HEADER, ...COUNTS_ROWS], Samples: [['Sample', 'Parameter', 'Value'], ...LONG_SAMPLES_ROWS] }))
      : BOOK;
  return [resultsInput(file, 'Counts'), descriptionInput(file, 'Samples')];
}

const csv = (rows: Cell[][], sep = ',', fmt: (c: Cell) => string = (c) => String(c ?? '')): string => rows.map((r) => r.map(fmt).join(sep)).join('\n') + '\n';

/** The same two sheets as CSV text (one file each). */
export const RESULTS_CSV = csv([COUNTS_HEADER, ...COUNTS_ROWS]);
export const SAMPLES_CSV = csv([SAMPLES_HEADER, ...SAMPLES_ROWS]);
/** Samples with a decimal comma, `;`-separated. */
export const SAMPLES_CSV_COMMA = csv([SAMPLES_HEADER, ...SAMPLES_ROWS], ';', (c) => (typeof c === 'number' ? String(c).replace('.', ',') : String(c ?? '')));

export const resultsCsvFile = (): ParsedFile => textFile('results.csv', RESULTS_CSV);
export const samplesCsvFile = (): ParsedFile => textFile('samples.csv', SAMPLES_CSV);
