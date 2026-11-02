// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { isBlankCell } from '../recognize/columns';
import type { RawRow, RawSheet, SheetMapping } from '../types';
import { parseNumber } from '../values/numbers';

/*
 * A quantity or a weight that is written again on rows that are not new animals: a per-taxon TOTAL repeated on size-class rows, the same quantity on rows of one sample and taxon that
 * differ in something, and rows that are exact copies of another row.
 *
 *   sample,Species,Size,Quantity
 *   s1,Solea solea,8,40
 *   s1,Solea solea,9,40
 *
 * Read as it stands, every row is an occurrence of 40 animals, and the sum is the total multiplied by the number of size classes. Telling the rows apart by an occurrenceID or a life stage
 * would write those numbers without a word. Everything here is read from the VALUES, never from a header.
 *
 *   group      the rows with the same sample (the columns that say which sample: sample code, station, cruise, replicate, date, time, position, depth), the same taxon, life stage, qualifier
 *              and taxon ID. (The looser group of the warning and of the copies leaves out replicate, life stage, qualifier and taxon ID: a user who marked the size as one of them
 *              has told the tool what the rows are, not what the number is.)
 *   total      a column REPEATS in a group of n rows that all carry the same value v. For a count the value must be a total that can be shared by n different size classes: v at least n
 *              (a group of 1,1,1 or 3,3,3,3 cannot be a total over its rows, and 1,2,2,1 repeats nothing). Such a group below that is not evidence at all: it is neither counted for nor against.
 *   blocks     (CONV-QUANTITY-REPEATED) for a column, when at least MIN_REPEAT_GROUPS groups repeat it, they are at least REPEAT_SHARE of the groups that are evidence (the repeating ones
 *              and those whose values differ), and the repeated values are not all one value. The column that tells the rows apart has a value on every row of the group and is no identifier
 *              of the row.
 *   warns      (CONV-QUANTITY-SAME-IN-SAMPLE) everywhere else: rows of one sample and taxon with the same quantity above 1 that differ in anything (a blank size, a stage, a sex, a
 *              size that is different on every row) are never silent, whatever their number: the text gives both sums.
 *   copies     (CONV-ROW-COPIES) rows identical in every column but a per-row identifier, with a quantity above 1: the same row twice.
 *
 * Why 50 %: a total repeated on size classes repeats in every group of its table (the share is near 100 %), while counts that coincide by chance coincide in a minority of the groups. Half is
 * the line between the two readings that is hardest to argue with; below it the tool does not block but warns, and says both sums, so that a table that is mostly genuine counts with some
 * repeated totals is not silently written and a table of genuine counts is not blocked. Four groups keep one or two coincidences from blocking.
 */

export const MIN_REPEAT_GROUPS = 4;
export const REPEAT_SHARE = 0.5;

export interface RepeatedTotal {
  /** The columns whose value is a total repeated on the rows (the quantity and/or the biomass columns), in the sheet's order. */
  columns: { index: number; header: string }[];
  /** True when the quantity column itself repeats (the rows of a group are one occurrence); false when only a weight does (the counts stay per row). */
  quantityRepeats: boolean;
  /** The column that tells the rows of a group apart most often (its header). */
  differs: string;
  /** Groups that repeat the first column / groups that are evidence. */
  groups: number;
  of: number;
  /** An example of the repeated value, as written. */
  example: string;
  /** A column of the same rows with its own number on every row (looks like a count per size class), when one is there: the quantity the user would pick instead. */
  alternative?: string;
  /** Every line of every group that has two or more rows and a differing column. */
  affected: Set<number>;
  /** With the user's choice "once" and a repeated QUANTITY: the lines whose rows are repeats of the first row of their group; they are not converted. */
  skip: Set<number>;
  /** With the choice "once": the first row of each group taken once (it carries the total; nothing per-row is written from it). */
  first: Set<number>;
  /** With the choice "once" and only a repeated WEIGHT: the later rows of a group, whose repeated weight is not written (their counts stay). */
  omitWeight: Set<number>;
  /** The groups that cannot be taken once: the quantity repeats but another weight or count column of the rows has numbers of its own. */
  disagree: number[][];
  /** The groups taken once. */
  collapsedGroups: number;
  /** The columns that differ within the groups taken once (a size, a stage, a variable): nothing of them is written on the single occurrence. */
  lostColumns: string[];
}

/** Rows of one sample and taxon with the same quantity above 1 that are not new animals for sure (the warning). */
export interface SameValue {
  /** Every line of those groups. */
  lines: number[];
  groups: number;
  /** The rows of those groups as they would be written (records) and the sum of their quantity. */
  records: number;
  written: number;
  /** The sum if the value of each group is the total of the species. */
  asTotal: number;
  /** The column. */
  column: string;
}

/** Rows that are exact copies of another row (all columns but a per-row identifier). */
export interface RowCopies {
  /** The copies: every row of an identical class but its first. */
  copyLines: number[];
  /** Every row of those classes (the original too). */
  lines: number[];
  /** The sum of the quantity of the whole sheet with the copies and without them. */
  withCopies: number;
  withoutCopies: number;
  column: string;
}

export interface RepeatAnalysis {
  total?: RepeatedTotal;
  same?: SameValue;
  copies?: RowCopies;
}

interface Candidate {
  index: number;
  header: string;
  kind: 'quantity' | 'biomass';
}

export function analyseRepeats(args: {
  sheet: RawSheet;
  mapping: SheetMapping;
  decimalComma: boolean;
  /** The lines to leave out (ragged rows, statistic rows). */
  skipLines: (row: RawRow) => boolean;
  /** 'count' for a declared count, or anything else. */
  quantityKind: string | undefined;
  /** The user said these are real counts: nothing is looked for. */
  realCounts?: boolean;
  /** The user chose to drop the copies: they are not part of the groups. */
  dropCopies?: boolean;
}): RepeatAnalysis {
  if (args.realCounts === true) return {};
  const { sheet, mapping, decimalComma: dc } = args;
  const roles = mapping.columns;
  const quantity = roles.find((c) => c.role.kind === 'quantity');
  const taxon = roles.find((c) => c.role.kind === 'taxon' && c.role.header !== true);
  if (taxon === undefined) return {};
  const candidates: Candidate[] = [
    ...(quantity === undefined ? [] : [{ index: quantity.index, header: quantity.header.trim(), kind: 'quantity' as const }]),
    ...roles.filter((c) => c.role.kind === 'biomass').map((c) => ({ index: c.index, header: c.header.trim(), kind: 'biomass' as const })),
  ];
  if (candidates.length === 0) return {};
  const STRICT_KEY = new Set(['sampleId', 'station', 'cruise', 'replicate', 'date', 'datetime', 'datePart', 'time', 'latitude', 'longitude', 'depth', 'pressure', 'hemisphere', 'taxon', 'lifeStage', 'qualifier', 'taxonId']);
  const LOOSE_KEY = new Set([...STRICT_KEY].filter((k) => !['replicate', 'lifeStage', 'qualifier', 'taxonId'].includes(k)));
  const keyOf = (set: Set<string>): number[] => roles.filter((c) => set.has(c.role.kind) && !(c.role.kind === 'taxon' && c.role.header === true)).map((c) => c.index);
  const strictCols = keyOf(STRICT_KEY);
  const looseCols = keyOf(LOOSE_KEY);
  const candidateIndexes = new Set(candidates.map((c) => c.index));
  const occurrenceId = roles.find((c) => c.role.kind === 'occurrenceId')?.index;
  const sample = sheet.rows;
  const cellText = (row: RawRow, i: number): string => {
    const c = row.cells[i] ?? null;
    return isBlankCell(c) ? '' : String(c).trim();
  };
  // A column that holds a different value on (nearly) every row of the sheet is an identifier of the row, not the size class that tells rows apart.
  const identifierLike = (index: number): boolean => {
    const vals = sample.map((r) => cellText(r, index).toLowerCase()).filter((v) => v !== '');
    return vals.length >= 20 && new Set(vals).size >= vals.length * 0.95;
  };
  // (only a column the tool does not read is an identifier of the row; a size or a variable that differs on every row is data, and tells the rows apart)
  const idLike = new Set<number>(roles.filter((c) => c.index === occurrenceId || (c.role.kind === 'ignore' && identifierLike(c.index))).map((c) => c.index));
  const rowsIn = sample.filter((r) => !args.skipLines(r) && cellText(r, taxon.index) !== '');
  const value = (row: RawRow, i: number): number | undefined => {
    const p = parseNumber(row.cells[i] ?? null, dc);
    return p.status === 'ok' ? p.value : undefined;
  };
  const countKind = args.quantityKind === undefined || args.quantityKind === 'count';
  const qIndex = quantity?.index;

  /* ---- exact copies: all columns but a per-row identifier are the same ---- */
  const classes = new Map<string, RawRow[]>();
  const compareCols = roles.map((c) => c.index).filter((i) => !idLike.has(i));
  for (const row of rowsIn) {
    const k = JSON.stringify(compareCols.map((i) => cellText(row, i)));
    const g = classes.get(k);
    if (g === undefined) classes.set(k, [row]);
    else g.push(row);
  }
  const hasValue = (row: RawRow): boolean => {
    const v = qIndex === undefined ? undefined : value(row, qIndex);
    if (v !== undefined) return countKind ? v > 1 : v > 0;
    return candidates.some((c) => c.kind === 'biomass' && (value(row, c.index) ?? 0) > 0);
  };
  const copyLines: number[] = [];
  const copyClassLines: number[] = [];
  for (const g of classes.values()) {
    if (g.length < 2 || !hasValue(g[0])) continue;
    for (const r of g) copyClassLines.push(r.line);
    for (const r of g.slice(1)) copyLines.push(r.line);
  }
  let copies: RowCopies | undefined;
  if (copyLines.length > 0) {
    const copySet = new Set(copyLines);
    let withCopies = 0;
    let withoutCopies = 0;
    for (const r of rowsIn) {
      const v = qIndex === undefined ? undefined : value(r, qIndex);
      if (v === undefined || v < 0) continue;
      withCopies += v;
      if (!copySet.has(r.line)) withoutCopies += v;
    }
    copies = { copyLines: copyLines.sort((a, b) => a - b), lines: copyClassLines.sort((a, b) => a - b), withCopies, withoutCopies, column: quantity?.header.trim() ?? candidates[0].header };
  }
  const dropped = new Set(args.dropCopies === true ? copyLines : []);

  /* ---- groups ---- */
  const groupBy = (cols: readonly number[]): RawRow[][] => {
    const m = new Map<string, RawRow[]>();
    for (const row of rowsIn) {
      if (dropped.has(row.line)) continue;
      const k = JSON.stringify(cols.map((i) => cellText(row, i).toLowerCase()));
      const g = m.get(k);
      if (g === undefined) m.set(k, [row]);
      else g.push(row);
    }
    return [...m.values()].filter((g) => g.length >= 2);
  };
  const strict = groupBy(strictCols);
  const loose = groupBy(looseCols);
  const others = roles.filter((c) => !strictCols.includes(c.index) && !candidateIndexes.has(c.index) && !idLike.has(c.index) && c.role.kind !== 'taxon').map((c) => c.index);
  // a column tells size classes apart only when EVERY row of the group has a value in it
  const differingFilled = (g: RawRow[]): number[] => others.filter((i) => g.every((r) => cellText(r, i) !== '') && new Set(g.map((r) => cellText(r, i).toLowerCase())).size > 1);
  // for the warning anything that is not the same on every row counts, a blank against a value too (and the columns of the looser key: a stage, a replicate)
  const othersLoose = roles.filter((c) => !looseCols.includes(c.index) && !candidateIndexes.has(c.index) && !idLike.has(c.index) && c.role.kind !== 'taxon').map((c) => c.index);
  const differingAny = (g: RawRow[]): number[] => othersLoose.filter((i) => new Set(g.map((r) => cellText(r, i).toLowerCase())).size > 1);

  /** The status of a group for a column: the value it repeats, 'differs' (the values are not all one), or 'below' / 'none' (not evidence). */
  const statusOf = (g: RawRow[], c: Candidate): { kind: 'repeat'; v: number; text: string } | { kind: 'differs' } | { kind: 'none' } => {
    const items = g.map((r) => ({ r, v: value(r, c.index) })).filter((x): x is { r: RawRow; v: number } => x.v !== undefined && x.v > 0);
    if (items.length < 2) return { kind: 'none' };
    const v = items[0].v;
    if (!items.every((x) => x.v === v)) return { kind: 'differs' };
    // a count that is one total shared by n different size classes is at least n; 1,1,1 is a table of specimens
    if (c.kind === 'quantity' && countKind && (v <= 1 || v < items.length)) return { kind: 'none' };
    return { kind: 'repeat', v, text: cellText(items[0].r, c.index) };
  };

  /* ---- the block ---- */
  const fired: Candidate[] = [];
  const stats = new Map<number, { repeat: number; of: number; values: Set<number>; example: string }>();
  for (const c of candidates) {
    const s = { repeat: 0, of: 0, values: new Set<number>(), example: '' };
    for (const g of strict) {
      if (differingFilled(g).length === 0) continue;
      const st = statusOf(g, c);
      if (st.kind === 'none') continue;
      s.of++;
      if (st.kind === 'repeat') {
        s.repeat++;
        s.values.add(st.v);
        if (s.example === '') s.example = st.text;
      }
    }
    stats.set(c.index, s);
    if (s.repeat >= MIN_REPEAT_GROUPS && s.repeat / s.of >= REPEAT_SHARE && s.values.size >= 2) fired.push(c);
  }

  let total: RepeatedTotal | undefined;
  const coveredLines = new Set<number>();
  if (fired.length > 0) {
    const tally = new Map<number, number>();
    for (const g of strict) for (const i of differingFilled(g)) tally.set(i, (tally.get(i) ?? 0) + 1);
    let differsIndex: number | undefined;
    let best = -1;
    for (const [i, n] of tally) {
      const bonus = roles.find((c) => c.index === i)?.role.kind === 'variable' ? 0.5 : 0;
      if (n + bonus > best) {
        best = n + bonus;
        differsIndex = i;
      }
    }
    const firedIndexes = new Set(fired.map((c) => c.index));
    const quantityRepeats = qIndex !== undefined && firedIndexes.has(qIndex);
    const affected = new Set<number>();
    const skip = new Set<number>();
    const first = new Set<number>();
    const omitWeight = new Set<number>();
    const disagree: number[][] = [];
    const lost = new Set<number>();
    let collapsedGroups = 0;
    for (const g of strict) {
      const diff = differingFilled(g);
      if (diff.length === 0) continue;
      for (const r of g) affected.add(r.line);
      // taken once only where EVERY fired column repeats in the group; a group below the threshold, or whose values differ, stays as separate rows with their own values
      const repeats = fired.every((c) => statusOf(g, c).kind === 'repeat');
      if (!repeats) continue;
      for (const r of g) coveredLines.add(r.line);
      // a weight or count column that is not a repeated total but has numbers of its own cannot be dropped with the rows
      const ownNumbers = quantityRepeats && candidates.some((c) => !firedIndexes.has(c.index) && new Set(g.map((r) => value(r, c.index) ?? -1)).size > 1 && g.some((r) => (value(r, c.index) ?? 0) > 0));
      if (ownNumbers) {
        disagree.push(g.map((r) => r.line));
        continue;
      }
      collapsedGroups++;
      first.add(g[0].line);
      for (const r of g.slice(1)) (quantityRepeats ? skip : omitWeight).add(r.line);
      if (quantityRepeats) for (const i of differingAny(g)) lost.add(i);
      if (quantityRepeats) for (const i of diff) lost.add(i);
    }
    // a column of the rows with its own number on each row, named like a count: the real per-size quantity, when the sheet has one
    let alternative: string | undefined;
    for (const c of roles) {
      if (candidateIndexes.has(c.index) || strictCols.includes(c.index) || c.index === occurrenceId || c.role.kind === 'variable') continue;
      if (!/(measured|count|number|nombre|anzahl|individ)/i.test(c.header)) continue;
      let own = 0;
      let rowsWith = 0;
      for (const g of strict) {
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
    const fs = stats.get(fired[0].index)!;
    total = {
      columns: fired.map((c) => ({ index: c.index, header: c.header })),
      quantityRepeats,
      differs: (roles.find((c) => c.index === differsIndex)?.header ?? '').trim(),
      groups: fs.repeat,
      of: fs.of,
      example: fs.example,
      ...(alternative === undefined ? {} : { alternative }),
      affected,
      skip,
      first,
      omitWeight,
      disagree,
      collapsedGroups,
      lostColumns: [...lost].sort((a, b) => a - b).map((i) => (roles.find((c) => c.index === i)?.header ?? '').trim()).filter((h) => h !== ''),
    };
  }

  /* ---- the warning: the same quantity above 1 on rows of one sample and taxon that differ in anything ---- */
  let same: SameValue | undefined;
  if (qIndex !== undefined) {
    const lines: number[] = [];
    let groups = 0;
    let records = 0;
    let written = 0;
    let asTotal = 0;
    const q = candidates[0];
    for (const g of loose) {
      if (differingAny(g).length === 0) continue; // identical rows are copies (above), not rows that differ
      const vs = g.map((r) => value(r, qIndex));
      const v = vs[0];
      // the same quantity above 1 on every row of the group that has one; a group the block already stands for is not said twice
      const items = g.filter((_, i) => vs[i] !== undefined && (vs[i] as number) > 0);
      if (items.length < 2 || v === undefined || v <= 1 || !items.every((r) => value(r, qIndex) === v)) continue;
      if (total?.quantityRepeats === true && items.every((r) => coveredLines.has(r.line))) continue;
      groups++;
      records += items.length;
      written += v * items.length;
      asTotal += v;
      for (const r of items) lines.push(r.line);
    }
    if (groups > 0) same = { lines: lines.sort((a, b) => a - b), groups, records, written, asTotal, column: q.kind === 'quantity' ? q.header : '' };
  }
  // copies the block's groups already take once are not said twice
  if (copies !== undefined && total !== undefined) {
    const rest = copies.copyLines.filter((l) => !total!.affected.has(l));
    if (rest.length === 0) copies = undefined;
    else copies = { ...copies, copyLines: rest, lines: copies.lines.filter((l) => !total!.affected.has(l) || rest.includes(l)) };
  }
  return { ...(total === undefined ? {} : { total }), ...(same === undefined ? {} : { same }), ...(copies === undefined ? {} : { copies }) };
}
