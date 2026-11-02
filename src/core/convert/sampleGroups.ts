// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RawCell, RawSheet, SheetMapping } from '../types';
import { parseNumber } from '../values/numbers';

/*
 * Samples of a LONG sheet, found from the data. In a long sheet one row is one taxon of a sample, so a code per row (ids.ts, the code of a wide sheet) would make every
 * taxon its own sample. The rows of one sample share the columns that define a sample: the station, the cruise, the date and time, the depth, the replicate, and in some files a
 * cast / haul / net number that no role names. The key is built from the MAPPED roles first. Then:
 *
 *   - a position is added when the key has no station and positions differ inside a group (rows of one sample that disagree on position block the conversion anyway);
 *   - a column is added by itself only when a taxon still repeats inside a group AND its name says cast, haul, tow, net, replicate or deployment (the whole name, or with a number or id marker) AND it at least halves
 *     the repeats without making every row its own group. Any other column (Sex, Size_class, Notes, Sorter, Mesh, Length_mm ...) splits samples that are one: the tool never picks
 *     one by itself. When repeats remain, it refuses and NAMES the columns that would remove them, and the user picks one (`extra`).
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

/** A column that was added to the key, and why: its name says cast / haul / ... ('name'), the user chose it ('chosen'), or positions differ inside a group ('position'). */
export interface AddedColumn {
  header: string;
  why: 'name' | 'chosen' | 'position';
}

export interface GroupCandidate {
  index: number;
  header: string;
  /** Rows in which a taxon still repeats inside a group with this column added. */
  repeats: number;
  groups: number;
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
      added: AddedColumn[];
      /** Rows whose taxon already stands in the same group: possible replicates that the key cannot tell apart. */
      repeats: number;
      /** Rows with an empty cell in a column of the key: they are grouped with the other rows that are empty there. */
      blanks: number;
      /** Almost every row became a sample of its own (a column of the key may hold a value per row). */
      nearlyRows: boolean;
    }
  | { ok: false; reason: 'no-columns' | 'taxon-repeats'; repeats?: number; rows: number; candidates?: GroupCandidate[] };

/** Above this share of the rows repeating a taxon inside their group the grouping would merge real replicates: refused. */
export const REPEAT_SHARE = 0.01;
/** An added column must leave fewer groups than this share of the rows, or it is an identifier of the row and not of the sample. */
const MAX_GROUP_SHARE = 0.8;
const MAX_ADDED = 2;
const MAX_CANDIDATES = 5;

/** Header words that name a sampling event inside a station and date: the one kind of extra column added without being asked. */
const EVENT_WORDS = new Set(['cast', 'haul', 'tow', 'net', 'replicate', 'rep', 'deployment']);
// what may follow the word without being another word: a number or an id marker ('Cast_no', 'Haul ID', 'TowNo', 'Net 2')
const ID_SUFFIX = new Set(['no', 'nr', 'num', 'number', 'id', 'n']);
function namesEvent(header: string): boolean {
  const words = header
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== '' && !/^\d+$/.test(w) && !ID_SUFFIX.has(w));
  return words.length === 1 && EVENT_WORDS.has(words[0]);
}

const blank = (c: RawCell | undefined): boolean => c === null || c === undefined || String(c).trim() === '';

const BASE_PARTS: { kinds: readonly string[]; part: GroupPart }[] = [
  { kinds: ['cruise'], part: 'cruise' },
  { kinds: ['station'], part: 'station' },
  { kinds: ['date', 'datetime'], part: 'date' },
  { kinds: ['time'], part: 'time' },
  { kinds: ['depth'], part: 'depth' },
  { kinds: ['replicate'], part: 'replicate' },
];
/** Roles that never define a sample: what is measured of a taxon, who the taxon is, or what the sample IS the identifier of. */
const NOT_A_KEY = new Set(['taxon', 'quantity', 'quantityType', 'lifeStage', 'qualifier', 'occurrenceId', 'taxonId', 'biomass', 'effort', 'sampleId', 'pressure', 'depthBelowSeafloor', 'depth', 'station', 'cruise', 'date', 'datetime', 'time', 'replicate']);

/**
 * Groups the data rows of a long sheet into samples. `extra` are columns the user chose to add to the key.
 */
export function groupLongSheet(sheet: RawSheet, mapping: SheetMapping, decimalComma = false, extra: readonly number[] = []): Grouping {
  const cols = mapping.columns;
  const taxon = cols.filter((c) => c.role.kind === 'taxon' && c.role.header !== true).map((c) => c.index);
  const identity = [...taxon, ...cols.filter((c) => c.role.kind === 'lifeStage' || c.role.kind === 'qualifier').map((c) => c.index)];
  const rows = sheet.rows;
  const filled = rows.map((r) => !r.cells.every((c) => blank(c)));
  const filledCount = filled.filter(Boolean).length;
  // 10 and 10.0 are one value; everything else is compared as the text of the cell
  const textOf = (c: RawCell | undefined): string => {
    if (blank(c)) return '';
    const t = String(c).trim();
    const p = parseNumber(c as RawCell, decimalComma);
    return p.status === 'ok' ? String(p.value) : t;
  };
  const base: GroupKeyColumn[] = [];
  for (const { kinds, part } of BASE_PARTS) for (const c of cols) if (kinds.includes(c.role.kind) && !base.some((b) => b.index === c.index)) base.push({ part, header: c.header, index: c.index });
  const position = cols.filter((c) => c.role.kind === 'latitude' || c.role.kind === 'longitude');
  // a position defines a sample only when nothing else does: with a station it is the station's
  if (base.length === 0) for (const c of position) base.push({ part: 'position', header: c.header, index: c.index });
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
      if (blank(rows[r].cells[taxon[0]])) continue;
      const t = `${g}\u0002${identityOf(r)}`;
      if (seen.has(t)) repeats++;
      else seen.add(t);
    }
    return { groups: ids.size, repeats };
  };

  let key: GroupKeyColumn[] = [...base];
  const added: AddedColumn[] = [];
  // a position when positions differ inside a group of the key: such rows would block the conversion as one sample
  // (only when the key has no station: a typed position in one row of a station and date would otherwise split the sample, and the station checks say it better)
  if (!key.some((k) => k.part === 'position' || k.part === 'station') && position.length > 0) {
    const first = new Map<string, string>();
    let differs = false;
    for (let r = 0; r < rows.length && !differs; r++) {
      if (!filled[r]) continue;
      const k = keyOf(r, key);
      const p = position.map((c) => textOf(rows[r].cells[c.index])).join('\u0001');
      const seen = first.get(k);
      if (seen === undefined) first.set(k, p);
      else if (seen !== p) differs = true;
    }
    if (differs) {
      for (const c of position) {
        key.push({ part: 'position', header: c.header, index: c.index });
        added.push({ header: c.header, why: 'position' });
      }
    }
  }
  // the columns the user chose
  const chosen = extra.map((i) => cols.find((c) => c.index === i)).filter((c): c is NonNullable<typeof c> => c !== undefined && !key.some((k) => k.index === c.index));
  for (const c of chosen) {
    key.push({ part: 'column', header: c.header, index: c.index });
    added.push({ header: c.header, why: 'chosen' });
  }

  const tolerance = Math.floor(filledCount * REPEAT_SHARE);
  let m = measure(key);
  const taken = (): Set<number> => new Set(key.map((k) => k.index));
  const usable = (): typeof cols => cols.filter((c) => !taken().has(c.index) && !NOT_A_KEY.has(c.role.kind) && c.role.kind !== 'latitude' && c.role.kind !== 'longitude');
  const trial = (c: (typeof cols)[number]): { col: GroupKeyColumn; groups: number; repeats: number } | undefined => {
    const distinct = new Set<string>();
    for (let r = 0; r < rows.length; r++) if (filled[r]) distinct.add(textOf(rows[r].cells[c.index]));
    if (distinct.size < 2 || distinct.size > filledCount * 0.5) return undefined;
    const col: GroupKeyColumn = { part: 'column', header: c.header, index: c.index };
    const res = measure([...key, col]);
    if (res.groups >= filledCount * MAX_GROUP_SHARE) return undefined;
    return { col, ...res };
  };
  // a column whose NAME says cast, haul, tow, net, replicate or deployment, while a taxon still repeats inside a group and the column at least halves the repeats
  for (let n = 0; n < MAX_ADDED && m.repeats > 0; n++) {
    let best: { col: GroupKeyColumn; groups: number; repeats: number } | undefined;
    for (const c of usable()) {
      if (!namesEvent(c.header)) continue;
      const t = trial(c);
      if (t !== undefined && (best === undefined || t.repeats < best.repeats || (t.repeats === best.repeats && t.groups < best.groups))) best = t;
    }
    if (best === undefined || best.repeats > m.repeats / 2) break;
    key = [...key, best.col];
    added.push({ header: best.col.header, why: 'name' });
    m = { groups: best.groups, repeats: best.repeats };
  }
  if (m.repeats > tolerance) {
    // refused: the columns that would remove the repeats are named, for the user to pick one
    const candidates: GroupCandidate[] = [];
    for (const c of usable()) {
      const t = trial(c);
      if (t !== undefined && t.repeats < m.repeats) candidates.push({ index: c.index, header: c.header, repeats: t.repeats, groups: t.groups });
    }
    candidates.sort((a, b) => a.repeats - b.repeats || a.groups - b.groups || a.index - b.index);
    return { ok: false, reason: 'taxon-repeats', repeats: m.repeats, rows: filledCount, ...(candidates.length === 0 ? {} : { candidates: candidates.slice(0, MAX_CANDIDATES) }) };
  }

  const ids = new Map<string, number>();
  const groupOf: number[] = [];
  const firstRow: number[] = [];
  let blanks = 0;
  for (let r = 0; r < rows.length; r++) {
    if (!filled[r]) {
      groupOf.push(-1);
      continue;
    }
    if (key.some((k) => blank(rows[r].cells[k.index]))) blanks++;
    const k = keyOf(r, key);
    let g = ids.get(k);
    if (g === undefined) {
      g = ids.size;
      ids.set(k, g);
      firstRow.push(r);
    }
    groupOf.push(g);
  }
  return { ok: true, groupOf, firstRow, groups: ids.size, rows: filledCount, by: key, added, repeats: m.repeats, blanks, nearlyRows: filledCount >= 30 && ids.size >= filledCount * 0.9 };
}
