// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RawCell } from '../types';
import { isRealFraction, secondOffsetMs } from './dates';

/**
 * What a date or time column of an Excel sheet says about fractions of a second, read once per column (on /check's path only; /convert never asks).
 * Among the numeric cells that are at least 0.5 ms from a whole second, if at least half meet the keep rule (isRealFraction: 5 ms or more from a whole second and more than 8 decimals),
 * the column holds real fractions and every cell is kept to the millisecond ('shown', as when its number format shows the fraction). A fill-down formula's float drift (under 5 ms) and rounded
 * serials (few decimals) have no such cells, so they stay whole seconds. `rounded` counts the cells at least 0.5 ms from a whole second that are read as the whole second in a column that is not 'shown',
 * `maxMs` is the largest such offset.
 */
export interface ColumnFractions {
  shown: boolean;
  rounded: number;
  maxMs: number;
}

const cache = new WeakMap<object, Map<number, ColumnFractions>>();

export function columnFractions(owner: { rows: readonly { cells: readonly RawCell[] }[] } & object, index: number, formatShown: boolean): ColumnFractions {
  let byColumn = cache.get(owner);
  if (byColumn === undefined) cache.set(owner, (byColumn = new Map()));
  const known = byColumn.get(index);
  if (known !== undefined) return known;
  let total = 0;
  let kept = 0;
  let maxMs = 0;
  for (const row of owner.rows) {
    const cell = row.cells[index];
    if (typeof cell !== 'number' || !Number.isFinite(cell)) continue;
    const off = secondOffsetMs(cell);
    if (off < 0.5) continue;
    total++;
    if (isRealFraction(cell)) kept++;
    else if (off > maxMs) maxMs = off;
  }
  const shown = formatShown || (total > 0 && kept * 2 >= total);
  const out: ColumnFractions = shown ? { shown: true, rounded: 0, maxMs: 0 } : { shown: false, rounded: total - kept, maxMs };
  byColumn.set(index, out);
  return out;
}
