// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { isBlankCell } from '../recognize/columns';
import type { RawRow, RawSheet, SheetMapping } from '../types';
import { parseNumber } from '../values/numbers';

/*
 * A per-taxon TOTAL repeated on size-class rows.
 *
 * Some long sheets give a catch per species and haul and then one row per size class of that species, with the catch of the species written on every one of them:
 *
 *   sample,Species,Size,Number_in_Haul
 *   s1,Solea solea,8,40
 *   s1,Solea solea,9,40
 *
 * Read as it stands, every row is an occurrence of 40 animals, and the sheet's sum is the total multiplied by the number of size classes. Telling the rows apart by an
 * occurrenceID or a life stage (the advice for rows of one sample and taxon) would write the inflated numbers without a word. The pattern is read from the VALUES, never from a
 * header:
 *
 *   group      the rows with the same sample (the columns that say which sample: sample code, station, cruise, replicate, date, time, position, depth), the same taxon, life stage,
 *              qualifier and taxon ID
 *   evidence   a group of two or more rows that differ in some other column (the column that tells the size classes apart) and that have a value above zero in a quantity or
 *              biomass column. The group REPEATS the column when every such value is the same. Values of 1 do not count in a count column (single animals, one row each, are
 *              legitimate: two fish of one animal each is a table of specimens, not a repeated total).
 *   fires      for a column, when at least MIN_GROUPS groups repeat it, at least SHARE of the groups that have evidence repeat it, and the repeated values are not all one value
 *              (a catch of 40 on 40 groups is a table of the same number, a total differs from group to group).
 *
 * The column that tells the rows apart is never an identifier of the row (a column that holds a different value on nearly every row of the sheet) and has a value on every row of the group.
 *
 * The thresholds: a genuine table of counts per size class has equal values in some groups by chance (two size classes each holding 4 animals), but not in four of them with the
 * same value missing from the rest; 4 groups keeps a single coincidence, or two, from firing, and 80 % keeps a sheet where only a few groups coincide from firing at all, while a
 * repeated total repeats in (nearly) every group (a source that repeats it in all but one group is still read: the group that disagrees stays blocked).
 */

export const MIN_REPEAT_GROUPS = 4;
export const REPEAT_SHARE = 0.8;

export interface RepeatedTotal {
  /** The columns whose value is a total repeated on the rows (the quantity and/or the biomass columns), in the sheet's order. */
  columns: { index: number; header: string }[];
  /** The column that tells the rows of a group apart most often (its header). */
  differs: string;
  /** Groups that repeat the totals / groups with evidence, for the first column. */
  groups: number;
  of: number;
  /** An example of the repeated value, as written. */
  example: string;
  /** A column of the same rows with its own number on every row (looks like a count per size class), when one is there: the quantity the user would pick instead. */
  alternative?: string;
  /** Every line of every group that has two or more rows and a differing column: what the ordinary duplicate advice must not talk about. */
  affected: Set<number>;
  /** With the user's choice "once": the lines whose rows are repeats of the first row of their group; they are not converted. */
  skip: Set<number>;
  /** The groups that cannot be taken once: their rows disagree on a repeated column (or hold another weight or count of their own). */
  disagree: number[][];
  /** The groups taken once. */
  collapsedGroups: number;
  /** The per-organism columns (a size of each fish) whose value belongs to the rows that are not written. */
  lostColumns: string[];
}

interface Candidate {
  index: number;
  header: string;
  kind: 'quantity' | 'biomass';
}

export function detectRepeatedTotals(args: {
  sheet: RawSheet;
  mapping: SheetMapping;
  decimalComma: boolean;
  /** The lines to leave out (ragged rows, statistic rows). */
  skipLines: (row: RawRow) => boolean;
  /** 'count' for a declared count (a value of 1 is no evidence), or anything else. */
  quantityKind: string | undefined;
}): RepeatedTotal | undefined {
  const { sheet, mapping, decimalComma: dc } = args;
  const roles = mapping.columns;
  const sample = sheet.rows;
  const quantity = roles.find((c) => c.role.kind === 'quantity');
  const taxon = roles.find((c) => c.role.kind === 'taxon' && c.role.header !== true);
  if (taxon === undefined) return undefined;
  const candidates: Candidate[] = [
    ...(quantity === undefined ? [] : [{ index: quantity.index, header: quantity.header, kind: 'quantity' as const }]),
    ...roles.filter((c) => c.role.kind === 'biomass').map((c) => ({ index: c.index, header: c.header, kind: 'biomass' as const })),
  ];
  if (candidates.length === 0) return undefined;
  const KEY_KINDS = new Set(['sampleId', 'station', 'cruise', 'replicate', 'date', 'datetime', 'time', 'latitude', 'longitude', 'depth', 'pressure', 'hemisphere', 'taxon', 'lifeStage', 'qualifier', 'taxonId']);
  const keyColumns = roles.filter((c) => KEY_KINDS.has(c.role.kind) && !(c.role.kind === 'taxon' && c.role.header === true)).map((c) => c.index);
  const candidateIndexes = new Set(candidates.map((c) => c.index));
  const occurrenceId = roles.find((c) => c.role.kind === 'occurrenceId')?.index;
  const cellText = (row: RawRow, i: number): string => {
    const c = row.cells[i] ?? null;
    return isBlankCell(c) ? '' : String(c).trim();
  };
  // the groups
  const groups = new Map<string, RawRow[]>();
  for (const row of sheet.rows) {
    if (args.skipLines(row)) continue;
    if (cellText(row, taxon.index) === '') continue;
    const key = JSON.stringify(keyColumns.map((i) => cellText(row, i).toLowerCase()));
    const g = groups.get(key);
    if (g === undefined) groups.set(key, [row]);
    else g.push(row);
  }
  const multi = [...groups.values()].filter((g) => g.length >= 2);
  if (multi.length === 0) return undefined;
  // the columns that can tell the rows of a group apart: not the columns of the key, the quantity or biomass columns, and not the occurrenceID (it differs on every row by design)
  // A column that holds a DIFFERENT value on (nearly) every row of the sheet is an identifier of the row (an id, a record number, a remark of its own), not the size class that tells rows apart:
  // size classes repeat from group to group.
  const identifierLike = (index: number): boolean => {
    const vals = sample.map((r) => cellText(r, index).toLowerCase()).filter((v) => v !== '');
    return vals.length >= 20 && new Set(vals).size >= vals.length * 0.95;
  };
  const others = roles.filter((c) => !keyColumns.includes(c.index) && !candidateIndexes.has(c.index) && c.index !== occurrenceId && !identifierLike(c.index)).map((c) => c.index);
  // a column tells size classes apart only when EVERY row of the group has a value in it (a record copied twice, one copy with the rank filled and one with it blank, is not two size classes)
  const differing = (g: RawRow[]): number[] => others.filter((i) => g.every((r) => cellText(r, i) !== '') && new Set(g.map((r) => cellText(r, i).toLowerCase())).size > 1);
  const value = (row: RawRow, i: number): number | undefined => {
    const p = parseNumber(row.cells[i] ?? null, dc);
    return p.status === 'ok' ? p.value : undefined;
  };
  const countKind = args.quantityKind === undefined || args.quantityKind === 'count';

  const fired: Candidate[] = [];
  const stats = new Map<number, { repeat: number; of: number; values: Set<number>; example: string }>();
  for (const c of candidates) {
    const s = { repeat: 0, of: 0, values: new Set<number>(), example: '' };
    for (const g of multi) {
      const d = differing(g);
      if (d.length === 0) continue;
      const evidence = g
        .map((r) => ({ r, v: value(r, c.index) }))
        .filter((x): x is { r: RawRow; v: number } => x.v !== undefined && x.v > 0 && !(c.kind === 'quantity' && countKind && x.v === 1));
      if (evidence.length < 2) continue;
      s.of++;
      if (evidence.every((x) => x.v === evidence[0].v)) {
        s.repeat++;
        s.values.add(evidence[0].v);
        if (s.example === '') s.example = cellText(evidence[0].r, c.index);
      }
    }
    stats.set(c.index, s);
    if (s.repeat >= MIN_REPEAT_GROUPS && s.repeat / s.of >= REPEAT_SHARE && s.values.size >= 2) fired.push(c);
  }
  if (fired.length === 0) return undefined;

  // the column that tells the groups apart: the per-organism variable first, else the one that differs most often
  let differsIndex: number | undefined;
  let best = -1;
  const tally = new Map<number, number>();
  for (const g of multi) for (const i of differing(g)) tally.set(i, (tally.get(i) ?? 0) + 1);
  for (const [i, n] of tally) {
    const perOrganism = roles.find((c) => c.index === i)?.role.kind === 'variable' ? 0.5 : 0;
    if (n + perOrganism > best) {
      best = n + perOrganism;
      differsIndex = i;
    }
  }
  const differsHeader = roles.find((c) => c.index === differsIndex)?.header ?? '';

  const first = fired[0];
  const fs = stats.get(first.index)!;
  const affected = new Set<number>();
  const skip = new Set<number>();
  const disagree: number[][] = [];
  let collapsedGroups = 0;
  const firedIndexes = new Set(fired.map((c) => c.index));
  for (const g of multi) {
    // a group whose rows are identical but for the totals is the same total written again (a row copied twice in a sheet that repeats its totals): taken with the others
    for (const r of g) affected.add(r.line);
    // taken once only when every repeated column agrees on every row, and no other quantity or weight column of the rows has a number of its own
    let ok = true;
    for (const c of candidates) {
      const texts = g.map((r) => value(r, c.index));
      if (firedIndexes.has(c.index)) {
        if (texts.some((v) => v === undefined || v !== texts[0])) ok = false;
      } else if (texts.some((v) => v !== undefined && v !== 0) && new Set(texts.map((v) => v ?? -1)).size > 1) ok = false;
    }
    if (ok) {
      collapsedGroups++;
      for (const r of g.slice(1)) skip.add(r.line);
    } else disagree.push(g.map((r) => r.line));
  }
  // a column of the rows with its own number on each row, named like a count: the real per-size quantity, when the sheet has one
  let alternative: string | undefined;
  for (const c of roles) {
    if (candidateIndexes.has(c.index) || keyColumns.includes(c.index) || c.index === occurrenceId || c.role.kind === 'variable') continue;
    if (!/(measured|count|number|nombre|anzahl|individ)/i.test(c.header)) continue;
    let own = 0;
    let rowsWith = 0;
    for (const g of multi) {
      const vs = g.map((r) => value(r, c.index));
      if (vs.every((v) => v === undefined)) continue;
      rowsWith++;
      if (new Set(vs).size > 1) own++;
    }
    if (rowsWith > 0 && own / rowsWith >= REPEAT_SHARE) {
      alternative = c.header.trim();
      break;
    }
  }
  const lostColumns = roles.filter((c) => c.role.kind === 'variable' && c.role.perOccurrence === true && tally.has(c.index)).map((c) => c.header.trim());
  return {
    columns: fired.map((c) => ({ index: c.index, header: c.header.trim() })),
    differs: differsHeader.trim(),
    groups: fs.repeat,
    of: fs.of,
    example: fs.example,
    ...(alternative === undefined ? {} : { alternative }),
    affected,
    skip,
    disagree,
    collapsedGroups,
    lostColumns,
  };
}
