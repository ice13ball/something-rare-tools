// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RawCell } from '../types';
import { decimalsOf, secondOffsetMs } from './dates';

/**
 * What a date or time column of an Excel sheet says about fractions of a second, read once per column (on /check's path only; /convert never asks).
 * Among the numeric cells that are at least 0.5 ms from a whole second, if at least half are plainly real (at least 50 ms from a whole second, with more than 8 decimals) the column holds real
 * fractions and every cell is kept to the millisecond ('shown', as when its number format shows the fraction). The 50 ms keeps float drift (a fill-down formula) from turning a column on: its error
 * stays under 50 ms for hundreds of thousands of rows. The cell-by-cell rule of `keepMillis: true` (5 ms) is unchanged. The whole column is read, not only the rows that reach the output (reading less
 * would need the builders' row selection, which is not cheap).
 */
export interface ColumnFractions {
  shown: boolean;
}

const cache = new WeakMap<object, Map<number, ColumnFractions>>();

export function columnFractions(owner: { rows: readonly { cells: readonly RawCell[] }[] } & object, index: number, formatShown: boolean): ColumnFractions {
  let byColumn = cache.get(owner);
  if (byColumn === undefined) cache.set(owner, (byColumn = new Map()));
  const known = byColumn.get(index);
  if (known !== undefined) return known;
  let total = 0;
  let real = 0;
  for (const row of owner.rows) {
    const cell = row.cells[index];
    if (typeof cell !== 'number' || !Number.isFinite(cell)) continue;
    const off = secondOffsetMs(cell);
    if (off < 0.5) continue;
    total++;
    if (off >= 50 && decimalsOf(cell) > 8) real++;
  }
  const out: ColumnFractions = { shown: formatShown || (total > 0 && real * 2 >= total) };
  byColumn.set(index, out);
  return out;
}
