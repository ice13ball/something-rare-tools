// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RawCell, RawSheet, SheetMapping } from '../types';

/*
 * Samples of a LONG sheet, found from the data. In a long sheet one row is one taxon of a sample, so a code per row (ids.ts, the code of a wide sheet) would make every
 * taxon its own sample. The rows of one sample share the columns that define a sample: the station, the cruise, the date and time, the depth, the replicate, and in some files a
 * cast / haul / net number that no role names. The key is built from the MAPPED roles first; only when a taxon still repeats inside a group is another column added, and then only
 * a column whose addition at least halves the repeats (a taxon cannot be caught twice in one sample) without making every row its own group (a row id would do that trivially).
 *
 * Nothing is merged silently: the number of rows in which a taxon still repeats inside a group is returned, and above REPEAT_SHARE of the rows the proposal is refused.
 */

export type GroupPart = 'cruise' | 'station' | 'date' | 'time' | 'depth' | 'replicate' | 'position' | 'column';

export interface GroupKeyColumn {
  part: GroupPart;
  /** The header of the column (the page names it in the preview). */
  header: string;
  index: number;
}

export type Grouping =
  | {
      ok: true;
      /** The group of each data row (an index into the groups, in order of first appearance); -1 for a row with no cell filled. */
      groupOf: number[];
      /** The first data row (index) of each group. */
      firstRow: number[];
      groups: number;
      /** Rows that belong to a group (not empty). */
      rows: number;
      by: GroupKeyColumn[];
      /** Rows whose taxon already stands in the same group: possible replicates that the key cannot tell apart. */
      repeats: number;
    }
  | { ok: false; reason: 'no-columns' | 'taxon-repeats'; repeats?: number; rows: number };

/** Above this share of the rows repeating a taxon inside their group the grouping would merge real replicates: refused. */
export const REPEAT_SHARE = 0.01;
/** An added column must leave fewer groups than this share of the rows, or it is an identifier of the row and not of the sample. */
const MAX_GROUP_SHARE = 0.8;
const MAX_ADDED = 2;

const textOf = (c: RawCell | undefined): string => (c === null || c === undefined ? '' : String(c).trim());
const blank = (c: RawCell | undefined): boolean => textOf(c) === '';

const BASE_PARTS: { kinds: readonly string[]; part: GroupPart }[] = [
  { kinds: ['cruise'], part: 'cruise' },
  { kinds: ['station'], part: 'station' },
  { kinds: ['date', 'datetime'], part: 'date' },
  { kinds: ['time'], part: 'time' },
  { kinds: ['depth'], part: 'depth' },
  { kinds: ['replicate'], part: 'replicate' },
];
/** Roles that never define a sample: what is measured of a taxon, who the taxon is, or what the sample IS the identifier of. */
const NOT_A_KEY = new Set(['taxon', 'quantity', 'quantityType', 'lifeStage', 'qualifier', 'occurrenceId', 'taxonId', 'biomass', 'effort', 'sampleId', 'pressure', 'depthBelowSeafloor']);

/**
 * Groups the data rows of a long sheet into samples. `taxonCols` are the columns that identify a taxon (the taxon cell, with the life stage and qualifier columns when mapped).
 */
export function groupLongSheet(sheet: RawSheet, mapping: SheetMapping): Grouping {
  const cols = mapping.columns;
  const taxon = cols.filter((c) => c.role.kind === 'taxon' && c.role.header !== true).map((c) => c.index);
  const identity = [...taxon, ...cols.filter((c) => c.role.kind === 'lifeStage' || c.role.kind === 'qualifier').map((c) => c.index)];
  const rows = sheet.rows;
  const filled = rows.map((r) => !r.cells.every((c) => blank(c)));
  const filledCount = filled.filter(Boolean).length;
  const base: GroupKeyColumn[] = [];
  for (const { kinds, part } of BASE_PARTS) for (const c of cols) if (kinds.includes(c.role.kind) && !base.some((b) => b.index === c.index)) base.push({ part, header: c.header, index: c.index });
  // a position defines a sample only when nothing else does: with a station it is the station's
  if (base.length === 0) for (const c of cols) if (c.role.kind === 'latitude' || c.role.kind === 'longitude') base.push({ part: 'position', header: c.header, index: c.index });
  if (base.length === 0 || identity.length === 0) return { ok: false, reason: 'no-columns', rows: filledCount };

  const keyOf = (r: number, key: readonly GroupKeyColumn[]): string => key.map((k) => textOf(rows[r].cells[k.index])).join('\u0001');
  const identityOf = (r: number): string => identity.map((i) => textOf(rows[r].cells[i]).toLowerCase()).join('\u0001');
  const measure = (key: readonly GroupKeyColumn[]): { groups: number; repeats: number } => {
    const ids = new Map<string, number>();
    const seen = new Set<string>();
    let repeats = 0;
    for (let r = 0; r < rows.length; r++) {
      if (!filled[r]) continue;
      const k = keyOf(r, key);
      let g = ids.get(k);
      if (g === undefined) ids.set(k, (g = ids.size));
      if (textOf(rows[r].cells[taxon[0]]) === '') continue;
      const t = `${g}\u0002${identityOf(r)}`;
      if (seen.has(t)) repeats++;
      else seen.add(t);
    }
    return { groups: ids.size, repeats };
  };

  const tolerance = Math.floor(filledCount * REPEAT_SHARE);
  let key: GroupKeyColumn[] = base;
  let m = measure(key);
  // another column, while a taxon still repeats inside a group and a column halves the repeats at least
  const taken = new Set(base.map((b) => b.index));
  const candidates = cols.filter((c) => !taken.has(c.index) && !NOT_A_KEY.has(c.role.kind) && c.role.kind !== 'depth' && c.role.kind !== 'station' && c.role.kind !== 'cruise' && c.role.kind !== 'date' && c.role.kind !== 'datetime' && c.role.kind !== 'time' && c.role.kind !== 'replicate');
  for (let added = 0; added < MAX_ADDED && m.repeats > 0; added++) {
    let best: { col: GroupKeyColumn; groups: number; repeats: number } | undefined;
    for (const c of candidates) {
      if (key.some((k) => k.index === c.index)) continue;
      const distinct = new Set<string>();
      for (let r = 0; r < rows.length; r++) if (filled[r]) distinct.add(textOf(rows[r].cells[c.index]));
      if (distinct.size < 2 || distinct.size > filledCount * 0.5) continue;
      const part: GroupPart = c.role.kind === 'latitude' || c.role.kind === 'longitude' ? 'position' : 'column';
      const col: GroupKeyColumn = { part, header: c.header, index: c.index };
      const res = measure([...key, col]);
      if (res.groups >= filledCount * MAX_GROUP_SHARE) continue;
      // fewest repeats first, then fewest groups, then the leftmost column
      if (best === undefined || res.repeats < best.repeats || (res.repeats === best.repeats && res.groups < best.groups)) best = { col, groups: res.groups, repeats: res.repeats };
    }
    // a column that removes only a few of the repeats is not the one that tells samples apart
    if (best === undefined || best.repeats > m.repeats / 2) break;
    key = [...key, best.col];
    m = { groups: best.groups, repeats: best.repeats };
  }
  if (m.repeats > tolerance) return { ok: false, reason: 'taxon-repeats', repeats: m.repeats, rows: filledCount };

  const ids = new Map<string, number>();
  const groupOf: number[] = [];
  const firstRow: number[] = [];
  for (let r = 0; r < rows.length; r++) {
    if (!filled[r]) {
      groupOf.push(-1);
      continue;
    }
    const k = keyOf(r, key);
    let g = ids.get(k);
    if (g === undefined) {
      g = ids.size;
      ids.set(k, g);
      firstRow.push(r);
    }
    groupOf.push(g);
  }
  return { ok: true, groupOf, firstRow, groups: ids.size, rows: filledCount, by: key, repeats: m.repeats };
}
