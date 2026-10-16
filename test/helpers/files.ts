// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ParsedFile, RawRow, RawSheet } from '../../src/core/types';
import { parseFile } from '../../src/core/parse';

/** A text/CSV/tab file parsed exactly as an upload would be. */
export const textFile = (name: string, text: string): ParsedFile => parseFile(name, new TextEncoder().encode(text));

/** A synthetic fixture from test/fixtures, parsed. */
export const fixtureFile = (name: string): ParsedFile => parseFile(name, new Uint8Array(readFileSync(join(__dirname, '..', 'fixtures', name))));

export type Cell = string | number | null | XLSX.CellObject;

/** An xlsx workbook built in memory (no binary fixtures): `sheets` maps sheet name -> rows of cells. */
export function xlsxFile(name: string, sheets: Record<string, Cell[][]>, extra?: Partial<XLSX.WorkBook>): ParsedFile {
  const wb = XLSX.utils.book_new();
  for (const [n, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.sheet_add_aoa(XLSX.utils.aoa_to_sheet([]), rows as never, { origin: 'A1' }), n);
  }
  Object.assign(wb, extra);
  return parseFile(name, new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
}

/** A date-formatted numeric cell (Excel serial + a date number format). */
export const dateCell = (serial: number): XLSX.CellObject => ({ t: 'n', v: serial, z: 'yyyy-mm-dd' });

/** A RawSheet straight from header + rows (line numbers start after `headerLine`). */
export function rawSheet(header: string[], rows: (string | number | null)[][], name = 'S', dateFormatted?: boolean[]): RawSheet {
  const raw: RawRow[] = rows.map((cells, i) => ({ line: i + 2, cells, fieldCount: cells.length }));
  return { name, header, headerLine: 1, rows: raw, ...(dateFormatted ? { dateFormatted } : {}) };
}
