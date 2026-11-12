// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { EventRec, OccRec, MofIntent } from './model';
import type { PivotInfo, RawCell, RawSheet, SheetMapping } from '../types';
import { parseNumber } from '../values/numbers';
import type { SampleJoinInfo } from './sampleJoin';

/*
 * The ledger: for every sheet of an upload, where each source row (and, on a wide sheet, each cell of a taxon column) went, and where each numeric column went, with the sums in and out.
 * It is INFORMATIONAL: it blocks nothing and no rule reads it yet.
 *
 * It is read from what was written. The conversion hands over the records it produced (occurrences, measurements, the level events of a profile sheet) and the reasons it
 * recorded where it left a row or a cell out (FateLog, set at the very place that `continue`s); a row that has a record is "written", a row that has neither a record nor a reason is
 * counted as `unexplained` and makes the sheet unbalanced. Nothing here recomputes a rule (what a zero is, what a repeat is), so it cannot disagree with the writer about it. Where a column
 * goes is read the same way: a column that an occurrence or a measurement came from is that; a column the conversion reads for the events is "event" (the set CONV-COLUMN-NOT-EXPORTED is
 * computed from); every other column is "not written".
 *
 * Sums are added with compensated summation and compared with a tolerance that scales with the size of the numbers: a decimal that is not exact in binary (0.1 + 0.2) is no mismatch, a
 * value that was changed on the way is.
 */

/** Why a source row or a taxon cell has no record. */
export type LedgerReason =
  | 'ragged'
  | 'summary-row'
  | 'no-code'
  | 'no-replicate'
  | 'no-taxon'
  | 'value-no-taxon'
  | 'taxon-no-quantity'
  | 'quantity-blank'
  | 'nothing-to-record'
  | 'duplicate-event'
  | 'repeat-total'
  | 'copy-dropped'
  | 'zero'
  | 'zero-with-biomass'
  | 'negative'
  | 'not-integer'
  | 'na-cell'
  | 'absent-mark'
  | 'bad-mark'
  | 'no-station'
  | 'duplicate-level'
  | 'repeat-in-sample'
  | 'absent-record'
  | 'column-not-read'
  | 'sheet-not-read'
  | 'sheet-not-used'
  | 'empty-parameter'
  | 'repeated-parameter'
  | 'quality-flag'
  | 'text-cell'
  | 'position-no-taxon'
  | 'sample-no-taxon'
  | 'not-in-event'
  | 'taxon-only-in-total'
  | 'one-specimen-total'
  | 'join-not-chosen'
  | 'join-no-key'
  | 'join-ambiguous'
  | 'join-no-match'
  | 'join-results-not-written';

export const LEDGER_REASONS: readonly LedgerReason[] = [
  'ragged', 'summary-row', 'no-code', 'no-replicate', 'no-taxon', 'value-no-taxon', 'taxon-no-quantity', 'quantity-blank', 'nothing-to-record', 'duplicate-event', 'repeat-total', 'copy-dropped', 'zero', 'zero-with-biomass',
  'negative', 'not-integer', 'na-cell', 'absent-mark', 'bad-mark', 'no-station', 'duplicate-level', 'repeat-in-sample', 'absent-record', 'column-not-read', 'sheet-not-read', 'sheet-not-used',
  'empty-parameter', 'repeated-parameter', 'quality-flag', 'text-cell', 'position-no-taxon', 'sample-no-taxon', 'not-in-event',
  'taxon-only-in-total', 'one-specimen-total', 'join-not-chosen', 'join-no-key', 'join-ambiguous', 'join-results-not-written', 'join-no-match',
];
// (the reasons a CELL can have are all among the first 31: the chain of a wide row keeps them as bits of an Int32; the last ones belong to whole lines, or to a lost cell named beside its line, never to FateLog.cell)
const CODE_OF: Record<string, number> = Object.fromEntries(LEDGER_REASONS.map((r, i) => [r, i + 1]));
// (a reason set fits one bit of an Int32 per line: the chain of a wide row is kept that way)
const BIT_OF = (code: number): number => (code >= 1 && code <= 31 ? 1 << (code - 1) : 0);

/**
 * Rows the converter did not understand: they hold a value (or, for a row of the wrong length, cells) that it cannot place, so it does not write them. They are never "nothing to record": the
 * panel does not say all is accounted for while one of them is there. (Task 8 sorts the reasons the same way.)
 */
/** Of those, the rows that name a position, a depth, a sample or a date and no taxon or number: the panel says that plainly, not as "a value". */
export const UNPLACED: readonly LedgerReason[] = ['position-no-taxon', 'sample-no-taxon'];
export const NOT_UNDERSTOOD: readonly LedgerReason[] = ['ragged', 'no-code', 'no-taxon', 'value-no-taxon', 'taxon-no-quantity', 'position-no-taxon', 'sample-no-taxon', 'empty-parameter', 'repeated-parameter', 'join-no-key'];

/**
 * The reasons the conversion records while it reads a sheet. Created per sheet; the builder writes into it, the ledger reads it. A cell's reason is kept in one byte per cell and column
 * (position of the row in the sheet, column index), so a sheet of millions of cells costs a typed array, not a map entry per cell.
 */
export class FateLog {
  readonly rows = new Map<number, LedgerReason>();
  private readonly cols = new Map<number, Uint8Array>();
  /** The column a record was written from, by record. The record objects themselves are not touched. */
  readonly origin = new WeakMap<object, number>();
  /** The lines that opened an event (a sample): a line that wrote an event but no occurrence is still a line that wrote something. */
  readonly events = new Set<number>();
  private lastIndex = -1;
  private last: Uint8Array | undefined;
  constructor(private readonly rowCount: number) {}
  row(line: number, reason: LedgerReason): void {
    if (!this.rows.has(line)) this.rows.set(line, reason);
  }
  /** This line opened an event. */
  event(line: number): void {
    this.events.add(line);
  }
  /** The cell at row position `pos` (0-based, in the order of the sheet's rows) of column `index`. */
  cell(pos: number, index: number, reason: LedgerReason): void {
    let a: Uint8Array | undefined;
    if (index === this.lastIndex) a = this.last;
    else {
      a = this.cols.get(index);
      if (a === undefined) this.cols.set(index, (a = new Uint8Array(this.rowCount)));
      this.lastIndex = index;
      this.last = a;
    }
    if (pos >= 0 && pos < a!.length && a![pos] === 0) a![pos] = CODE_OF[reason] ?? 0;
  }
  /** The reason codes recorded for the cells of one column, by row position (0 = none), or undefined when none was recorded. */
  column(index: number): Uint8Array | undefined {
    return this.cols.get(index);
  }
  cellFate(pos: number, index: number): LedgerReason | undefined {
    const c = this.cols.get(index)?.[pos];
    return c === undefined || c === 0 ? undefined : LEDGER_REASONS[c - 1];
  }
  /** A record that came from the cells of column `index`. */
  from<T extends object>(record: T, index: number): T {
    this.origin.set(record, index);
    return record;
  }
}

export interface LedgerCount {
  reason: LedgerReason;
  count: number;
}

/** source = written + the counts of `skipped` + unexplained (always, by construction). */
export interface LedgerTally {
  source: number;
  written: number;
  /** Of `written`: the rows whose records carry no number (a taxon kept for its weight, a text cell). `written - writtenWithoutNumber` are the rows with a quantity. Rows tally of a sheet read for taxa only. */
  writtenWithoutNumber?: number;
  /** Of `written`: the lines that wrote an event or a measurement and no occurrence (a sample row whose taxon cells are all zero, a row that only carries the sample's variables). Rows tally of a sheet read for taxa only. */
  writtenNoOccurrence?: number;
  skipped: LedgerCount[];
  /** Neither a record nor a recorded reason: the conversion lost something nobody can name. Anything above 0 is a defect, shown on the page. */
  unexplained: number;
}

export interface LedgerColumn {
  index: number;
  /** The header as the sheet has it; empty for a sheet with no header row of its own. */
  header: string;
  /** The role kind the column had when it was converted. */
  role: string;
  /** Of a date part: which one. */
  part?: 'year' | 'month' | 'day';
  /** Where its numbers go: the quantity of an occurrence, a measurement, a field of an event (position, depth, date part ...), or nowhere. */
  to: 'occurrence' | 'measurement' | 'event' | 'not-written';
  /** The cells that read as numbers, and their sum. */
  numbers: number;
  sum: number;
  /** Cells with something in them that is not a number (a text, "5 g", an NA variant): not read as numbers, so in none of the sums. */
  nonNumbers: number;
  /** The cells that have a record in the output, the sum of those cells, and the sum of the values the records carry. */
  written: number;
  writtenSum: number;
  outSum: number;
  /** Of `written`: cells whose record carries no value of its own (a presence mark, only on a presence sheet); they are in no sum. */
  writtenWithoutValue: number;
  /** A record that should carry the value of its cell and carries none (not a presence sheet): a mismatch. */
  valueMissing: number;
  /** The numbers that went nowhere, by reason; the sums are those of the cells. */
  skipped: { reason: LedgerReason; count: number; sum: number }[];
  unexplained: number;
  /** The sum the records carry equals the sum of the cells they were written from (not asked of an event column, which carries a field and not a sum). */
  match: boolean;
}

/**
 * What became of one line of the file. Listed only for the lines that are not a plain "written": a line with no record (`fate` is the reason), a line that wrote no occurrence (`wrote` says what it
 * did write) and, on a wide sheet, a written line that lost cells (`cells`). Every other line of the sheet is written with nothing lost, so a big file costs a few entries, not one per line.
 * `chain` is every reason recorded for the line, the row's own first, then those of its cells in column order.
 */
export interface LineFate {
  line: number;
  /** 'unexplained': neither a record nor a reason (a fault of the converter, shown on the page). */
  fate: 'written' | 'unexplained' | LedgerReason;
  chain?: LedgerReason[];
  wrote?: ('occurrence' | 'measurement' | 'event' | 'level')[];
  /** Wide sheets: the non-blank taxon cells of the line with a record, and those without (`chain` says why). */
  cells?: { written: number; lost: number };
  /**
   * Wide sheets: the cells of the line that have no record, WHICH ones, except the zeros (a matrix of zeros is most of its cells and appears as a count only): the column index and the reason
   * (`unexplained`: no reason was recorded). Kept for the list of rows not written; the page's view does not carry `lines`.
   */
  lostCells?: {
    index: number;
    reason: LedgerReason | 'unexplained';
    /** 'join-not-chosen' only: the value that was written instead, and the line of the other sheet it came from (both lines are then known: this cell's own and that one) */
    taken?: string;
    other?: { sheet: string; line: number };
  }[];
  /** A description line that repeats, value for value, this earlier line of the same sheet and key: the two count as one row, and this line says so. */
  sameAs?: number;
  /** 'join-results-not-written': the lines of the results sheets this description line was lent to, none of which wrote anything (so nothing of this line reached the archive). */
  lentTo?: { sheet: string; lines: number[] }[];
}

export interface SheetLedger {
  file: string;
  sheet: string;
  kind: 'wide' | 'long' | 'profile' | 'not-read' | 'not-used' | 'description';
  /** The tally the sheet is judged by: its taxon cells for a wide sheet, its rows for every other. */
  unit: 'rows' | 'cells';
  /** In lines of the file (for a pivoted long sheet: the lines of the long sheet, not the samples made of them). */
  rows: LedgerTally;
  /** Wide sheets only: the non-blank cells of the taxon columns. */
  cells?: LedgerTally;
  /** A description sheet of a join only: the results sheets its lines were lent to, the lines lent (identical copies included) and the samples they make. A sample only the description has is written once and is in none of them. */
  lent?: { sheet: string; lines: number; samples: number }[];
  /** A sheet that was read as one row per sample out of a long one: the rows the long file had (= `rows.source`) and the samples made of them. */
  pivotRowsIn?: number;
  pivotSamples?: number;
  /** Position of this sheet in the list handed to convert(): the handler maps it to the file and the original rows (Task 8). Absent for a sheet the handler adds (not used). */
  inputIndex?: number;
  columns: LedgerColumn[];
  /** The lines that are not a plain "written" (see LineFate), in file order. Kept in the conversion result for the rows-not-written list; the page's view does not carry it. */
  lines: LineFate[];
  /** Lines the converter did not understand and does not write (NOT_UNDERSTOOD): a number is among them, so the sheet is never called accounted for. */
  notUnderstood: number;
  /** No unexplained row or cell and every sum agrees. */
  balanced: boolean;
}

/* ---------- sums ---------- */

/** Neumaier's compensated sum: the order of the numbers and the size of the biggest one do not leak into the result. */
export class Sum {
  private s = 0;
  private c = 0;
  abs = 0;
  add(x: number): void {
    const t = this.s + x;
    this.c += Math.abs(this.s) >= Math.abs(x) ? this.s - t + x : x - t + this.s;
    this.s = t;
    this.abs += Math.abs(x);
  }
  get value(): number {
    // (an overflow stays an overflow: the compensation of an infinite sum is not a number)
    return Number.isFinite(this.s) ? this.s + this.c : this.s;
  }
}

/**
 * Two sums are the same when they are the same number, or differ by no more than a rounding error: 1e-12 of the sum of their absolute values. What is compared is the same cells added
 * in the same order (the cells, and the numbers the records carry, which are the texts of those cells), so the difference of an honest conversion is zero or a few units in the last place;
 * a real change of a value, however small against a big sum, is above the tolerance. An overflow that both sides share (both Infinity) is no difference.
 */
export function sameSum(a: Sum, b: Sum): boolean {
  if (a.value === b.value) return true;
  return Math.abs(a.value - b.value) <= 1e-12 * Math.max(a.abs, b.abs) + 1e-15;
}

/** A sum for display: 12 significant digits, so the float noise of the last places never shows. */
export const shownSum = (n: number): number => Number(n.toPrecision(12));

/* ---------- the ledger of one sheet ---------- */

export interface SheetLedgerInput {
  file: string;
  sheet: RawSheet;
  kind: 'wide' | 'long' | 'profile';
  mapping: SheetMapping;
  decimalComma: boolean;
  fate: FateLog;
  /** Wide: the taxon columns. */
  taxonColumns: readonly number[];
  /** The columns the conversion reads as the quantity of an occurrence (wide: the taxon columns; long: the quantity column). */
  occurrenceColumns: readonly number[];
  /** The columns the conversion reads as measurements (variables, pressure, biomass and per-organism variables where they are written). */
  measurementColumns: readonly number[];
  /** Every column the conversion reads for anything (the set CONV-COLUMN-NOT-EXPORTED is computed from): those that are neither of the above are read for the events. */
  eventColumns: readonly number[];
  /** The sheet is read as a list of species found (presence only): its cells are marks, and a record may carry no value of its own. */
  presence?: boolean;
  /** The conversion read this sheet for taxa: a row counts as written when it has an occurrence. Otherwise (environment only, profile) a measurement or a level counts. */
  hasTaxa: boolean;
  /** What this sheet wrote. */
  occurrences: readonly OccRec[];
  measurements: readonly MofIntent[];
  /** Profile: the rows that became a level event. */
  levelLines?: ReadonlySet<number>;
  /** A confirmed join: the lines of samples only the description sheet has. They write an event and no occurrence, and that is all they are for: they count as written on a sheet read for taxa as well. */
  describedLines?: ReadonlySet<number>;
  /** The sheet is the pivot of a long sheet: its ledger is kept in the lines of that sheet. */
  pivot?: PivotInfo;
  /** Position of the sheet in the list handed to convert(). */
  inputIndex?: number;
}

const tally = (source: number, written: number, counts: Map<LedgerReason, number>, unexplained: number): LedgerTally => ({
  source,
  written,
  skipped: LEDGER_REASONS.filter((r) => counts.has(r)).map((reason) => ({ reason, count: counts.get(reason)! })),
  unexplained,
});

const bump = <K>(m: Map<K, number>, k: K, n = 1): void => void m.set(k, (m.get(k) ?? 0) + n);

const roleKindOf = (mapping: SheetMapping, index: number): string => mapping.columns.find((c) => c.index === index)?.role.kind ?? 'ignore';
const rolePart = (mapping: SheetMapping, index: number): { part?: 'year' | 'month' | 'day' } => {
  const r = mapping.columns.find((c) => c.index === index)?.role;
  return r?.kind === 'datePart' ? { part: r.part } : {};
};
const isBlank = (c: unknown): boolean => c === null || c === undefined || (typeof c === 'string' && c.trim() === '');
const reasonsOfBits = (bits: number): LedgerReason[] => LEDGER_REASONS.filter((_, i) => i < 31 && (bits & (1 << i)) !== 0);

export function buildSheetLedger(inp: SheetLedgerInput): SheetLedger {
  const { fate, sheet } = inp;
  const rows = sheet.rows;
  const stride = Math.max(sheet.header.length, ...inp.mapping.columns.map((c) => c.index + 1), 1);
  const posOf = new Map<number, number>();
  rows.forEach((r, i) => posOf.set(r.line, i));
  const key = (line: number, index: number): number => (posOf.get(line) ?? -1) * stride + index;

  const presentAt = new Set<number>();
  const absentAt = new Set<number>();
  const numberAt = new Set<number>();
  const occurrenceCellAt = new Map<number, OccRec[]>();
  for (const o of inp.occurrences) {
    const pos = posOf.get(o.source.line) ?? -1;
    (o.occurrenceStatus === 'absent' ? absentAt : presentAt).add(pos);
    if (o.quantityText !== undefined) numberAt.add(pos);
    const index = fate.origin.get(o);
    if (index === undefined) continue;
    const k = pos * stride + index;
    (occurrenceCellAt.get(k) ?? occurrenceCellAt.set(k, []).get(k)!).push(o);
  }
  const measurementAt = new Set<number>();
  const measurementCellAt = new Map<number, MofIntent[]>();
  for (const m of inp.measurements) {
    measurementAt.add(m.source.line);
    const index = fate.origin.get(m);
    if (index === undefined) continue;
    const k = key(m.source.line, index);
    (measurementCellAt.get(k) ?? measurementCellAt.set(k, []).get(k)!).push(m);
  }
  const hasOcc = (pos: number): boolean => presentAt.has(pos) || absentAt.has(pos);
  /** What the line wrote: an occurrence, a measurement, the event it opened, a profile level. */
  const wroteAt = (pos: number, line: number): ('occurrence' | 'measurement' | 'event' | 'level')[] => {
    const out: ('occurrence' | 'measurement' | 'event' | 'level')[] = [];
    if (hasOcc(pos)) out.push('occurrence');
    if (measurementAt.has(line)) out.push('measurement');
    if (fate.events.has(line)) out.push('event');
    if (inp.levelLines?.has(line)) out.push('level');
    return out;
  };
  // a line of a long sheet with a taxon is written when it wrote an occurrence: an event or a sample value it opened does not carry its taxon, count and weight
  const occurrenceOnly = inp.kind === 'long' && inp.hasTaxa;
  const isWrittenAt = (pos: number, line: number): boolean => (inp.kind === 'profile' ? (inp.levelLines?.has(line) ?? false) : occurrenceOnly ? hasOcc(pos) || (inp.describedLines?.has(line) === true && fate.events.has(line)) : hasOcc(pos) || measurementAt.has(line) || fate.events.has(line) || (inp.levelLines?.has(line) ?? false));

  /* the rows */
  const rowCounts = new Map<LedgerReason, number>();
  let rowsWritten = 0;
  let rowsWithoutNumber = 0;
  let rowsNoOccurrence = 0;
  let rowsUnexplained = 0;
  const cellFateOf = (cols: readonly number[], pos: number): LedgerReason | undefined => {
    for (const i of cols) {
      const r = fate.cellFate(pos, i);
      if (r !== undefined) return r;
    }
    return undefined;
  };
  const longCellFate = (pos: number): LedgerReason | undefined => cellFateOf(inp.occurrenceColumns, pos);
  const taxonCellFate = (pos: number): LedgerReason | undefined => cellFateOf(inp.taxonColumns, pos);
  const chainOf = (pos: number, line: number): LedgerReason[] => {
    const out: LedgerReason[] = [];
    const own = fate.rows.get(line);
    if (own !== undefined) out.push(own);
    for (const i of inp.kind === 'wide' ? inp.taxonColumns : inp.occurrenceColumns) {
      const r = fate.cellFate(pos, i);
      if (r !== undefined && !out.includes(r) && out.length < 6) out.push(r);
    }
    return out;
  };
  const lines: LineFate[] = [];
  const pivot = inp.pivot;
  let notUnderstood = 0;
  const rowReason: (LedgerReason | undefined)[] = new Array<LedgerReason | undefined>(rows.length);
  for (let pos = 0; pos < rows.length; pos++) {
    const row = rows[pos];
    if (isWrittenAt(pos, row.line)) {
      rowsWritten++;
      if (inp.kind !== 'profile' && inp.hasTaxa) {
        if (!hasOcc(pos)) {
          rowsNoOccurrence++;
          const chain = chainOf(pos, row.line);
          if (pivot === undefined) lines.push({ line: row.line, fate: 'written', wrote: wroteAt(pos, row.line), ...(chain.length > 0 ? { chain } : {}) });
        } else if (!numberAt.has(pos)) rowsWithoutNumber++;
      }
      continue;
    }
    const reason: LedgerReason | undefined =
      fate.rows.get(row.line) ??
      (inp.kind === 'wide' ? taxonCellFate(pos) : longCellFate(pos)) ??
      (row.cells.every((c) => isBlank(c)) ? 'nothing-to-record' : undefined) ??
      (inp.kind === 'wide' && !inp.taxonColumns.some((i) => !isBlank(row.cells[i])) ? 'nothing-to-record' : undefined);
    rowReason[pos] = reason;
    if (reason === undefined) rowsUnexplained++;
    else bump(rowCounts, reason);
    if (pivot === undefined) {
      if (reason !== undefined && (NOT_UNDERSTOOD as readonly string[]).includes(reason)) notUnderstood++;
      const chain = chainOf(pos, row.line);
      // (fate = the first reason of the chain; what the line did write is said beside it: a first row of a sample that opened its event)
      const wrote = wroteAt(pos, row.line);
      lines.push({ line: row.line, fate: reason ?? 'unexplained', ...(chain.length > 0 ? { chain } : {}), ...(wrote.length > 0 ? { wrote } : {}) });
    }
  }
  let rowTally = tally(rows.length, rowsWritten, rowCounts, rowsUnexplained);
  if (inp.kind !== 'profile' && inp.hasTaxa) {
    rowTally.writtenWithoutNumber = rowsWithoutNumber;
    if (!occurrenceOnly) rowTally.writtenNoOccurrence = rowsNoOccurrence;
  }

  // the reason recorded for the whole row, by position (0 = none), and the cells that have a record, by column: one byte each, so the loops below are plain array reads
  const rowCode = new Uint8Array(rows.length);
  for (let pos = 0; pos < rows.length; pos++) {
    const r = fate.rows.get(rows[pos].line);
    if (r !== undefined) rowCode[pos] = CODE_OF[r] ?? 0;
  }
  const flagsOf = (cellAt: Map<number, unknown>): Map<number, Uint8Array> => {
    const out = new Map<number, Uint8Array>();
    for (const k of cellAt.keys()) {
      if (k < 0) continue;
      const col = k % stride;
      const pos = (k - col) / stride;
      let a = out.get(col);
      if (a === undefined) out.set(col, (a = new Uint8Array(rows.length)));
      a[pos] = 1;
    }
    return out;
  };
  const occFlag = flagsOf(occurrenceCellAt);
  const meaFlag = flagsOf(measurementCellAt);
  const countsOf = (counts: Int32Array): Map<LedgerReason, number> => new Map(LEDGER_REASONS.flatMap((r, i): [LedgerReason, number][] => (counts[i + 1] > 0 ? [[r, counts[i + 1]]] : [])));

  /* the cells of a wide sheet's taxon columns */
  let cellTally: LedgerTally | undefined;
  if (inp.kind === 'wide') {
    const counts = new Int32Array(LEDGER_REASONS.length + 1);
    let source = 0;
    let written = 0;
    let unexplained = 0;
    const cellsWritten = new Int32Array(rows.length);
    const cellsLost = new Int32Array(rows.length);
    const lostBits = new Int32Array(rows.length);
    const lostAt = new Map<number, { index: number; reason: LedgerReason | 'unexplained' }[]>();
    const lostPush = (pos: number, index: number, reason: LedgerReason | 'unexplained'): void => {
      const list = lostAt.get(pos);
      if (list === undefined) lostAt.set(pos, [{ index, reason }]);
      else list.push({ index, reason });
    };
    for (const i of inp.taxonColumns) {
      const flag = occFlag.get(i);
      const cf = fate.column(i);
      for (let pos = 0; pos < rows.length; pos++) {
        if (isBlank(rows[pos].cells[i])) continue;
        source++;
        if (flag !== undefined && flag[pos] === 1) {
          written++;
          cellsWritten[pos]++;
          continue;
        }
        const code = rowCode[pos] || (cf === undefined ? 0 : cf[pos]);
        cellsLost[pos]++;
        if (code === 0) {
          unexplained++;
          lostPush(pos, i, 'unexplained');
        } else {
          counts[code]++;
          lostBits[pos] |= BIT_OF(code);
          // (a zero is counted and not named: a wide matrix of zeros would be most of its cells)
          if (LEDGER_REASONS[code - 1] !== 'zero') lostPush(pos, i, LEDGER_REASONS[code - 1]);
        }
      }
    }
    cellTally = tally(source, written, countsOf(counts), unexplained);
    // the written lines that lost cells, countable per line
    const byLine = new Map(lines.map((l) => [l.line, l] as const));
    // (a pivot's rows are samples: its lines are those of the long file, kept below, one cell each)
    for (let pos = 0; pos < rows.length && pivot === undefined; pos++) {
      if (cellsLost[pos] === 0) continue;
      const line = rows[pos].line;
      const cells = { written: cellsWritten[pos], lost: cellsLost[pos] };
      const entry = byLine.get(line);
      const lostCells = lostAt.get(pos);
      if (entry !== undefined) {
        entry.cells = cells;
        // (an unwritten line lists its cells whole; its lost cells are not a second thing to name; a written line that wrote no occurrence, only an event or measurements, names them)
        if (entry.fate === 'written' && lostCells !== undefined) entry.lostCells = lostCells;
      } else if (isWrittenAt(pos, line)) {
        const chain = reasonsOfBits(lostBits[pos]);
        const e: LineFate = { line, fate: 'written', cells, ...(chain.length > 0 ? { chain } : {}), ...(lostCells === undefined ? {} : { lostCells }) };
        lines.push(e);
      }
    }
    lines.sort((a, b) => a.line - b.line);
  }

  /* the columns that hold numbers */
  const occ = new Set(inp.occurrenceColumns);
  const mea = new Set(inp.measurementColumns);
  const evt = new Set(inp.eventColumns);
  const columns: LedgerColumn[] = [];
  const taxonSet = new Set(inp.taxonColumns);
  const extraLost = new Map<number, { index: number; reason: LedgerReason | 'unexplained' }[]>();
  for (const c of inp.mapping.columns) {
    const to: LedgerColumn['to'] = occ.has(c.index) ? 'occurrence' : mea.has(c.index) ? 'measurement' : evt.has(c.index) ? 'event' : 'not-written';
    const sumIn = new Sum();
    const sumWritten = new Sum();
    const sumOut = new Sum();
    let numbers = 0;
    let nonNumbers = 0;
    let written = 0;
    let writtenWithoutValue = 0;
    let valueMissing = 0;
    let unexplained = 0;
    const counts = new Int32Array(LEDGER_REASONS.length + 1);
    const sums: (Sum | undefined)[] = [];
    const index = c.index;
    const flag = to === 'occurrence' ? occFlag.get(index) : to === 'measurement' ? meaFlag.get(index) : undefined;
    const cf = fate.column(index);
    // a value of a column that is written, in a line that is written, which has no record of its own (a weight "abc", a length "<5", an NA): named in the list, whole row beside it
    const named = (to === 'occurrence' || to === 'measurement') && !(inp.kind === 'wide' && taxonSet.has(index)) && pivot === undefined;
    const lose = (pos: number, reason: LedgerReason): void => {
      if (!named || (flag !== undefined && flag[pos] === 1) || !isWrittenAt(pos, rows[pos].line)) return;
      const list = extraLost.get(pos);
      if (list === undefined) extraLost.set(pos, [{ index, reason }]);
      else if (!list.some((x) => x.index === index)) list.push({ index, reason });
    };
    for (let pos = 0; pos < rows.length; pos++) {
      const raw = rows[pos].cells[index];
      if (raw === null || raw === undefined) continue;
      let value: number | undefined;
      let text = false;
      let status = 'ok';
      if (typeof raw === 'number') {
        if (!Number.isFinite(raw)) text = true;
        else value = raw;
      } else {
        const p = parseNumber(raw, inp.decimalComma);
        status = p.status;
        if (p.status === 'ok') value = p.value;
        else if (p.status !== 'missing') text = true;
      }
      if (value === undefined) {
        // a mark on a presence sheet is read, and written as a mark with no value of its own: it is not "something that was not read"
        if (text && inp.presence === true && flag !== undefined && flag[pos] === 1) {
          written++;
          writtenWithoutValue++;
        } else if (text) nonNumbers++;
        if (text) lose(pos, status === 'na-variant' ? 'na-cell' : 'text-cell');
        else if (typeof raw === 'string' && raw.trim() !== '') lose(pos, 'na-cell');
        continue;
      }
      numbers++;
      // (a zero adds nothing to a sum: a wide matrix of zeros is most of its cells)
      if (value !== 0) sumIn.add(value);
      if (to === 'event') continue;
      if (flag !== undefined && flag[pos] === 1) {
        const k = pos * stride + index;
        const recs = to === 'occurrence' ? occurrenceCellAt.get(k) : measurementCellAt.get(k);
        written++;
        const texts = ((recs ?? []) as (OccRec | MofIntent)[]).flatMap((r): string[] => {
          const t = 'measurementValue' in r ? r.measurementValue : r.quantityText;
          return t === undefined ? [] : [t];
        });
        if (texts.length === 0) {
          if (inp.presence === true) writtenWithoutValue++;
          else valueMissing++;
        } else {
          sumWritten.add(value);
          for (const t of texts) sumOut.add(Number(t));
        }
        continue;
      }
      let code = to === 'not-written' ? (CODE_OF['column-not-read'] ?? 0) : (cf === undefined ? 0 : cf[pos]) || rowCode[pos];
      if (code === 0) {
        const line = rows[pos].line;
        const reason: LedgerReason | undefined =
          // a long row whose one record was left out (a zero, an NA, a negative): its other numbers (a weight) went with it
          (inp.kind === 'long' && !hasOcc(pos) ? longCellFate(pos) : undefined) ??
          // a per-organism value of a record that is an absence has nothing to hang on
          (inp.kind === 'long' && absentAt.has(pos) && !presentAt.has(pos) ? 'absent-record' : undefined) ??
          // a long row that was not written and has no reason of its own cell: the reason of its row
          (!isWrittenAt(pos, line) ? rowReason[pos] : undefined);
        code = reason === undefined ? 0 : (CODE_OF[reason] ?? 0);
      }
      if (code === 0) {
        unexplained++;
        continue;
      }
      counts[code]++;
      const sc = (sums[code] ??= new Sum());
      if (value !== 0) sc.add(value);
      // (a zero is counted and not named, as in a wide matrix; a number of a column that is not written is the column's, not the cell's)
      const why = LEDGER_REASONS[code - 1];
      if (why !== 'zero' && why !== 'column-not-read') lose(pos, why);
    }
    if (numbers === 0 && nonNumbers === 0 && writtenWithoutValue === 0) continue;
    columns.push({
      index,
      header: c.header,
      role: roleKindOf(inp.mapping, index),
      ...rolePart(inp.mapping, index),
      to,
      numbers,
      sum: shownSum(sumIn.value),
      nonNumbers,
      written,
      writtenSum: shownSum(sumWritten.value),
      outSum: shownSum(sumOut.value),
      writtenWithoutValue,
      valueMissing,
      skipped: LEDGER_REASONS.flatMap((reason, i) => (counts[i + 1] > 0 ? [{ reason, count: counts[i + 1], sum: shownSum(sums[i + 1]!.value) }] : [])),
      unexplained,
      match: to === 'event' || (valueMissing === 0 && sameSum(sumWritten, sumOut)),
    });
  }

  // the written lines that lost a cell of a value column: attached to the line they are on, or a line of their own (a long row that wrote its occurrence and lost its weight)
  if (extraLost.size > 0) {
    const byLine = new Map(lines.map((l) => [l.line, l] as const));
    for (const [pos, list] of extraLost) {
      const line = rows[pos].line;
      const entry = byLine.get(line);
      if (entry !== undefined) {
        if (entry.fate !== 'written') continue;
        const have = entry.lostCells ?? [];
        entry.lostCells = [...have, ...list.filter((x) => !have.some((h) => h.index === x.index))];
        for (const x of list) if (x.reason !== 'unexplained' && !(entry.chain ?? []).includes(x.reason)) entry.chain = [...(entry.chain ?? []), x.reason];
      } else {
        const chain = [...new Set(list.flatMap((x) => (x.reason === 'unexplained' ? [] : [x.reason])))];
        lines.push({ line, fate: 'written', ...(chain.length > 0 ? { chain } : {}), lostCells: list });
      }
    }
    lines.sort((a, b) => a.line - b.line);
  }

  const initialTo = (col: number): LedgerColumn['to'] => (occ.has(col) ? 'occurrence' : mea.has(col) ? 'measurement' : evt.has(col) ? 'event' : 'not-written');
  const out: SheetLedger = {
    file: inp.file,
    sheet: sheet.name,
    kind: inp.kind,
    unit: cellTally === undefined ? 'rows' : 'cells',
    rows: rowTally,
    ...(cellTally === undefined ? {} : { cells: cellTally }),
    ...(pivot === undefined ? {} : { pivotRowsIn: pivot.lines.sourceRows, pivotSamples: rows.length }),
    ...(inp.inputIndex === undefined ? {} : { inputIndex: inp.inputIndex }),
    columns,
    lines,
    notUnderstood,
    balanced: true,
  };
  const judge = (): void => {
    const headline = out.cells ?? out.rows;
    out.balanced = headline.unexplained === 0 && out.rows.unexplained === 0 && out.columns.every((c) => c.match && (c.to === 'event' || c.unexplained === 0));
  };

  /*
   * A pivoted long sheet: the ledger is kept in the lines of the long file, one fate for each line, whatever the column its value was pivoted into: a measurement (has a measurement), a taxon
   * (has an occurrence), a field of an event (the row opened its event), a column that is not written (column-not-read). It is run again once the event columns are settled
   * (settleEventColumns), because a column read for the events may turn out to be written nowhere.
   */
  const pivotPass = (settled?: { events: readonly EventRec[]; cruiseText: readonly string[] }): void => {
    if (pivot === undefined) return;
    const eventsAt = new Map<number, EventRec[]>();
    if (settled !== undefined) for (const e of settled.events) if (e.source?.file === inp.file && e.source.sheet === sheet.name) (eventsAt.get(e.source.line) ?? eventsAt.set(e.source.line, []).get(e.source.line)!).push(e);
    const eventKinds = new Set(out.columns.filter((c) => c.to === 'event').map((c) => c.role));
    if (out.columns.some((c) => c.to === 'event' && c.role === 'datePart' && c.part === 'year')) eventKinds.add('datePartYear');
    const toNow = new Map(out.columns.map((c) => [c.index, c.to] as const));
    const counts = new Map<LedgerReason, number>();
    const fates: LineFate[] = [];
    let writtenLines = 0;
    let unexplainedLines = 0;
    let seen = 0;
    let lostNumbers = 0;
    const seenLines = new Set<number>();
    const put = (line: number, fate_: 'written' | LedgerReason | undefined, chain: LedgerReason[] = []): void => {
      seen++;
      seenLines.add(line);
      if (fate_ === 'written') {
        writtenLines++;
        return;
      }
      if (fate_ === undefined) unexplainedLines++;
      else {
        bump(counts, fate_);
        if ((NOT_UNDERSTOOD as readonly string[]).includes(fate_)) lostNumbers++;
      }
      fates.push({ line, fate: fate_ ?? 'unexplained', ...(chain.length > 0 ? { chain } : {}) });
    };
    const L = pivot.lines;
    for (const l of L.ragged) put(l, 'ragged', ['ragged']);
    for (const l of L.flag) put(l, 'quality-flag', ['quality-flag']);
    for (const l of L.emptyParameter) put(l, 'empty-parameter', ['empty-parameter']);
    for (const l of L.blank) put(l, 'nothing-to-record');
    for (const l of L.repeated) put(l, 'repeated-parameter', ['repeated-parameter']);
    for (let pos = 0; pos < rows.length; pos++) {
      const row = rows[pos];
      const cl = pivot.cellLines[row.line];
      if (cl === undefined) continue;
      const absent = new Set(L.entryAbsent[row.line] ?? []);
      const opened = fate.events.has(row.line) || inp.levelLines?.has(row.line) === true;
      pivot.pivoted.forEach((pv, pi) => {
        if (absent.has(pi)) return;
        const line = cl[pi];
        const col = pv.index;
        const raw = row.cells[col];
        if (isBlank(raw)) return put(line, 'nothing-to-record');
        const to = toNow.get(col) ?? initialTo(col);
        if (to === 'not-written') return put(line, 'column-not-read', ['column-not-read']);
        const own = rowCode[pos] || fate.column(col)?.[pos] || 0;
        const ownReason = own === 0 ? undefined : LEDGER_REASONS[own - 1];
        if (to === 'event') {
          if (!opened) return ownReason !== undefined ? put(line, ownReason, [ownReason]) : put(line, rowReason[pos]);
          // the event of the row has to carry the value: a depth that says "deep", a latitude of 999, are in the file and in no event
          if (settled !== undefined) {
            const role = out.columns.find((c) => c.index === col)?.role ?? roleKindOf(inp.mapping, col);
            if (eventTrace(role, eventsAt.get(row.line) ?? [], eventKinds, { events: settled.events, cruiseText: settled.cruiseText }) === false) return put(line, 'not-in-event', ['not-in-event']);
          }
          return put(line, 'written');
        }
        const flag = to === 'occurrence' ? occFlag.get(col) : meaFlag.get(col);
        if (flag?.[pos] === 1) return put(line, 'written');
        if (ownReason !== undefined) return put(line, ownReason, [ownReason]);
        const p = typeof raw === 'number' ? ({ status: Number.isFinite(raw) ? 'ok' : 'non-numeric' } as const) : parseNumber(raw, inp.decimalComma);
        if (p.status === 'ok') return put(line, rowReason[pos]);
        return put(line, p.status === 'non-numeric' ? 'text-cell' : 'na-cell');
      });
    }
    // every line of the long file is one of the above; a line that is not is a fault, shown
    if (seen < L.sourceRows) {
      unexplainedLines += L.sourceRows - seen;
      // (which lines: the ones of the long file that no fate was given to; each is a line of its own, shown and blocking)
      for (const r of sheet.pivot?.source.rows ?? []) if (!seenLines.has(r.line)) fates.push({ line: r.line, fate: 'unexplained' });
    }
    fates.sort((a, b) => a.line - b.line);
    out.lines = fates;
    out.notUnderstood = lostNumbers;
    out.rows = { source: L.sourceRows, written: writtenLines, skipped: LEDGER_REASONS.filter((r) => counts.has(r)).map((reason) => ({ reason, count: counts.get(reason)! })), unexplained: unexplainedLines };
    judge();
  };
  judge();
  if (pivot !== undefined) {
    pivotPass();
    PENDING.set(out, pivotPass);
  }
  return out;
}

/** The work of a ledger that has to be done again when the event columns are settled (a pivoted sheet). */
const PENDING = new WeakMap<SheetLedger, (settled: { events: readonly EventRec[]; cruiseText: readonly string[] }) => void>();

/** A sheet that was not read at all (CONV-LONG-UNSUPPORTED, CONV-SHEET-TRANSPOSED): every row went nowhere, and the ledger says so. */
export function notReadLedger(file: string, sheet: RawSheet, inputIndex?: number): SheetLedger {
  return { ...skippedSheet(file, sheet, 'not-read', 'sheet-not-read'), ...(inputIndex === undefined ? {} : { inputIndex }) };
}

/** A sheet that is not used ("use" not ticked: the user left it out, or it is a dictionary sheet that is off by default): nothing of it is converted, and the ledger says so. */
export function notUsedLedger(file: string, sheet: RawSheet): SheetLedger {
  return skippedSheet(file, sheet, 'not-used', 'sheet-not-used');
}

function skippedSheet(file: string, sheet: RawSheet, kind: 'not-read' | 'not-used', reason: LedgerReason): SheetLedger {
  // (a long sheet read as its pivot: the rows the file had, not the samples made of them)
  const n = sheet.pivot?.lines.sourceRows ?? sheet.rows.length;
  const rows: LedgerTally = { source: n, written: 0, skipped: n === 0 ? [] : [{ reason, count: n }], unexplained: 0 };
  // a sheet not read lists its lines (a blocked sheet is the one a decision is made on); a sheet not used is one fate for all of it, said by `rows`
  const lines: LineFate[] = kind === 'not-read' && sheet.pivot === undefined ? sheet.rows.map((r) => ({ line: r.line, fate: reason })) : [];
  return { file, sheet: sheet.name, kind, unit: 'rows', rows, columns: [], lines, notUnderstood: 0, balanced: true };
}

/* ---------- the columns read for the events, settled by the events that were written ---------- */

/** Does this role kind have a written trace in the events of the sheet? undefined: the kind has no event field to look for (its column stays "event"). */
function eventTrace(kind: string, mine: readonly EventRec[], roleKinds: ReadonlySet<string>, all: { events: readonly EventRec[]; cruiseText: readonly string[] }): boolean | undefined {
  const any = (f: (e: EventRec) => boolean): boolean => mine.some(f);
  switch (kind) {
    case 'latitude':
    case 'longitude':
    case 'hemisphere':
      return any((e) => e.lat !== undefined && !e.derived.position);
    case 'date':
    case 'datetime':
      return any((e) => e.eventDate !== undefined && !e.derived.date);
    case 'datePart':
      // the parts make a date only with a year
      return roleKinds.has('datePartYear') && any((e) => e.eventDate !== undefined && !e.derived.date);
    case 'time':
      return any((e) => e.eventDate !== undefined && !e.derived.date && e.eventDate.includes('T'));
    case 'depth':
    case 'depthBelowSeafloor':
      return any((e) => (e.depthMin !== undefined || e.depthMax !== undefined || e.distanceText !== undefined) && !e.derived.depth);
    case 'effort':
      return any((e) => e.sampleSizeValue !== undefined);
    case 'station':
      return any((e) => e.parentId !== undefined || e.locality !== undefined);
    case 'cruise':
      return all.cruiseText.length > 0 || all.events.some((e) => e.eventType === 'cruise');
    case 'replicate':
      return any((e) => e.eventType === 'replicate');
    case 'sampleId':
      return mine.length > 0;
    default:
      return undefined;
  }
}

/**
 * A column the conversion READS for the events is "event" only if the events that were written carry what it gives: Month and Day with no Year, or a Time with no date, are read and write
 * nothing, and are then "not written" like any other column that goes nowhere. Called once the event tree is built, with the events of the whole upload.
 */
export function settleEventColumns(ledger: SheetLedger[], events: readonly EventRec[], cruiseText: readonly string[]): void {
  for (const l of ledger) {
    if (l.kind === 'not-read' || l.kind === 'not-used') continue;
    const mine = events.filter((e) => e.source?.file === l.file && e.source.sheet === l.sheet);
    const kinds = new Set(l.columns.filter((c) => c.to === 'event').map((c) => c.role));
    if (l.columns.some((c) => c.to === 'event' && c.role === 'datePart' && c.part === 'year')) kinds.add('datePartYear');
    for (const c of l.columns) {
      if (c.to !== 'event') continue;
      const trace = eventTrace(c.role, mine, kinds, { events, cruiseText });
      if (trace === false) c.to = 'not-written';
    }
    PENDING.get(l)?.({ events, cruiseText });
  }
}

/* ---------- a joined results sheet and its description sheet ---------- */

/** The description sheet a description ledger was made of (combineDescriptionLedgers tallies its columns from it again). */
const DESCRIPTION_SHEET = new WeakMap<SheetLedger, { sheet: RawSheet; decimalComma: boolean }>();

type LostCell = NonNullable<LineFate['lostCells']>[number];

/** `cells` joined to the ones a line has already, one per column. */
const addLost = (have: readonly LostCell[] | undefined, more: readonly LostCell[]): LostCell[] => {
  const out = [...(have ?? [])];
  for (const c of more) if (!out.some((x) => x.index === c.index)) out.push(c);
  return out;
};

/** The tally of a sheet read for its rows, from the fate of every row (the lines the ledger does not list are written). */
function rowTallyOf(source: number, fates: readonly (LedgerReason | 'unexplained' | 'written')[]): LedgerTally {
  const counts = new Map<LedgerReason, number>();
  let written = 0;
  let unexplained = 0;
  for (const f of fates) {
    if (f === 'written') written++;
    else if (f === 'unexplained') unexplained++;
    else bump(counts, f);
  }
  return tally(source, written, counts, unexplained);
}

/** The sum-and-count of the description's columns, read from the description sheet itself: each cell once, however many results rows it was lent to, each line by its own fate. */
function descriptionColumns(templates: readonly LedgerColumn[], sheet: RawSheet, decimalComma: boolean, lines: readonly LineFate[]): LedgerColumn[] {
  const at = new Map(lines.map((l) => [l.line, l] as const));
  const out: LedgerColumn[] = [];
  for (const t of templates) {
    const sumIn = new Sum();
    const sumWritten = new Sum();
    let numbers = 0;
    let nonNumbers = 0;
    let written = 0;
    let unexplained = 0;
    const counts = new Map<LedgerReason, number>();
    const sums = new Map<LedgerReason, Sum>();
    for (const r of sheet.rows) {
      const raw = r.cells[t.index];
      if (raw === null || raw === undefined) continue;
      let value: number | undefined;
      if (typeof raw === 'number') {
        if (Number.isFinite(raw)) value = raw;
        else nonNumbers++;
      } else {
        const p = parseNumber(raw, decimalComma);
        if (p.status === 'ok') value = p.value;
        else if (p.status !== 'missing') nonNumbers++;
      }
      if (value === undefined) continue;
      numbers++;
      if (value !== 0) sumIn.add(value);
      if (t.to === 'event') continue;
      const line = at.get(r.line);
      const lost = line?.lostCells?.find((c) => c.index === t.index);
      const reason: LedgerReason | 'unexplained' | undefined = t.to === 'not-written' ? 'column-not-read' : line === undefined || (line.fate === 'written' && lost === undefined) ? undefined : lost !== undefined && line.fate === 'written' ? lost.reason : line.fate === 'written' ? undefined : line.fate;
      if (reason === undefined) {
        written++;
        if (value !== 0) sumWritten.add(value);
      } else if (reason === 'unexplained') unexplained++;
      else {
        bump(counts, reason);
        if (value !== 0) (sums.get(reason) ?? sums.set(reason, new Sum()).get(reason)!).add(value);
      }
    }
    if (numbers === 0 && nonNumbers === 0) continue;
    out.push({
      ...t,
      numbers,
      sum: shownSum(sumIn.value),
      nonNumbers,
      written,
      writtenSum: shownSum(sumWritten.value),
      outSum: shownSum(sumWritten.value),
      writtenWithoutValue: 0,
      valueMissing: 0,
      skipped: LEDGER_REASONS.filter((x) => counts.has(x)).map((reason) => ({ reason, count: counts.get(reason)!, sum: shownSum(sums.get(reason)?.value ?? 0) })),
      unexplained,
    });
  }
  return out;
}

/**
 * The ledger of a merged results sheet (the one buildSheetLedger made of the merge) cut in two, from ONE merge: the results sheet as the person's own file has it, and the description sheet.
 *
 * - The lines the merge appended for samples only the description has move to the description ledger (with the fate the conversion gave them: written, with the event).
 * - A results line keeps its fate. A value of it that lost a conflict is a lost cell `join-not-chosen`, with the value taken and the line of the description it came from. A lost cell that is in a
 *   column the description lent moves to the description line it was lent from.
 * - A description line is written when it was lent (or appended), or repeats such a line value for value (`sameAs`); `join-no-key` and `join-ambiguous` when the merge could not use it; a line that
 *   is none of these is `unexplained` here (another results sheet of the same description may have used it: combineDescriptionLedgers settles that).
 * - The description's columns keep their own headers; a column the merge consumed (a key, the losing side of a shared quantity) is in neither ledger, a column the merge wrote is in the results'.
 */
export function joinLedgers(merged: SheetLedger, info: SampleJoinInfo): { results: SheetLedger; description: SheetLedger } {
  const rw = info.results.width;
  const desSheet = info.description.sheet;
  const dw = desSheet.header.length;
  const mergedAt = new Map(merged.lines.map((l) => [l.line, l] as const));
  const lentLines = new Set(info.lentFrom.values());
  const lentTo = new Map<number, number[]>();
  for (const [m, d] of info.lentFrom) (lentTo.get(d) ?? lentTo.set(d, []).get(d)!).push(m);
  const descriptionOf = (mergedLine: number): number | undefined => info.lentFrom.get(mergedLine) ?? info.descriptionOnly.get(mergedLine);
  const desIndexOf = (column: number): number | undefined => (column >= rw && column < rw + dw ? column - rw : undefined);

  /* the lost cells that belong to the description: by description line and column */
  const desLost = new Map<number, LostCell[]>();
  const loseOnDescription = (line: number | undefined, cell: LostCell): void => {
    if (line === undefined) return;
    desLost.set(line, addLost(desLost.get(line), [cell]));
  };
  const resLost = new Map<number, LostCell[]>();
  for (const n of info.notChosen) {
    if (n.side === 'results') resLost.set(n.line, addLost(resLost.get(n.line), [{ index: n.column, reason: 'join-not-chosen', taken: n.chosen, other: { sheet: desSheet.name, line: n.otherLine } }]));
    else {
      const k = desIndexOf(n.column);
      if (k !== undefined) loseOnDescription(n.line, { index: k, reason: 'join-not-chosen', taken: n.chosen, other: { sheet: info.results.sheet, line: n.otherLine } });
    }
  }
  // (a text its own file rejects as a number was lent blank: the text is not written)
  for (const key of info.lentBlank) {
    const [line, column] = key.split(':').map(Number);
    const k = desIndexOf(column);
    if (k !== undefined) loseOnDescription(descriptionOf(line), { index: k, reason: 'text-cell' });
  }

  /* the results ledger: the lines of the results file, with the cells of the description moved out */
  const resultsLines: LineFate[] = [];
  const moved: LineFate[] = [];
  for (const l of merged.lines) {
    if (info.descriptionOnly.has(l.line)) {
      moved.push(l);
      continue;
    }
    const mine = (l.lostCells ?? []).filter((c) => c.index < rw);
    for (const c of (l.lostCells ?? []).filter((x) => x.index >= rw)) {
      const k = desIndexOf(c.index);
      if (k !== undefined) loseOnDescription(descriptionOf(l.line), { ...c, index: k });
    }
    const lost = l.fate === 'written' ? addLost(mine, resLost.get(l.line) ?? []) : mine;
    const { lostCells: _drop, ...rest } = l;
    resultsLines.push({ ...rest, ...(lost.length > 0 ? { lostCells: lost } : {}) });
  }
  for (const [line, cells] of resLost) if (!mergedAt.has(line) && cells.length > 0) resultsLines.push({ line, fate: 'written', lostCells: cells });
  resultsLines.sort((a, b) => a.line - b.line);

  const movedFates = moved.map((l) => l.fate);
  const appended = info.descriptionOnly.size;
  const fateCount = (f: LedgerReason): number => movedFates.filter((x) => x === f).length;
  // (an appended line with no entry of its own is a plain written one)
  const movedWritten = appended - moved.filter((l) => l.fate !== 'written').length;
  const movedUnexplained = movedFates.filter((x) => x === 'unexplained').length;
  const rowsIn = merged.rows;
  const resultsRows: LedgerTally = {
    ...rowsIn,
    source: rowsIn.source - appended,
    written: rowsIn.written - movedWritten,
    ...(rowsIn.writtenNoOccurrence === undefined ? {} : { writtenNoOccurrence: rowsIn.writtenNoOccurrence - movedWritten }),
    skipped: rowsIn.skipped.map((s) => ({ reason: s.reason, count: s.count - fateCount(s.reason) })).filter((s) => s.count > 0),
    unexplained: rowsIn.unexplained - movedUnexplained,
  };
  const movedNotUnderstood = movedFates.filter((f) => (NOT_UNDERSTOOD as readonly string[]).includes(f)).length;
  const results: SheetLedger = {
    ...merged,
    rows: resultsRows,
    columns: merged.columns.filter((c) => !info.consumed.has(c.index) && (c.index < rw || c.index >= rw + dw)),
    lines: resultsLines,
    notUnderstood: merged.notUnderstood - movedNotUnderstood,
    balanced: true,
  };
  results.balanced = results.rows.unexplained === 0 && (results.cells?.unexplained ?? 0) === 0 && results.columns.every((c) => c.match && (c.to === 'event' || c.unexplained === 0));

  /* the description ledger: every line of the description sheet */
  const lines: LineFate[] = [];
  const fates: (LedgerReason | 'unexplained' | 'written')[] = [];
  const noKey = new Set(info.noKey);
  const ambiguous = new Set(info.ambiguous);
  const appendedFrom = new Map([...info.descriptionOnly].map(([m, d]) => [d, m] as const));
  const baseFate = (line: number, cells: readonly RawCell[]): { fate: LineFate['fate']; wrote?: LineFate['wrote']; chain?: LedgerReason[]; lentTo?: LineFate['lentTo'] } => {
    if (noKey.has(line)) return { fate: 'join-no-key' };
    if (ambiguous.has(line)) return { fate: 'join-ambiguous' };
    if (cells.every(isBlank)) return { fate: 'nothing-to-record' };
    const m = appendedFrom.get(line);
    if (m !== undefined) {
      const own = mergedAt.get(m);
      return { fate: own?.fate ?? 'written', wrote: own?.wrote ?? ['event'], ...(own?.chain === undefined ? {} : { chain: own.chain }) };
    }
    if (lentLines.has(line)) {
      // lent is not written: it reached the archive only if a results line it was lent to wrote something (a plain line, or a zero that still opened the event)
      const to = lentTo.get(line) ?? [];
      const reached = to.some((m) => {
        const own = mergedAt.get(m);
        return own === undefined || own.fate === 'written' || (own.wrote ?? []).includes('event');
      });
      if (reached) return { fate: 'written' };
      const chain = [...new Set(to.flatMap((m) => (mergedAt.get(m)?.chain ?? [mergedAt.get(m)?.fate]).filter((x): x is LedgerReason => x !== undefined && x !== 'written' && x !== 'unexplained')))];
      return { fate: 'join-results-not-written', ...(chain.length > 0 ? { chain } : {}), lentTo: [{ sheet: info.results.sheet, lines: to }] };
    }
    // no key matched: nothing was lent or appended, and CONV-JOIN-NO-MATCH blocks until the keys agree
    if (info.noMatch) return { fate: 'join-no-match' };
    return { fate: 'unexplained' };
  };
  const baseOf = new Map<number, ReturnType<typeof baseFate>>();
  for (const r of desSheet.rows) baseOf.set(r.line, baseFate(r.line, r.cells));
  for (const r of desSheet.rows) {
    const own = baseOf.get(r.line)!;
    const twin = info.sameAs.get(r.line);
    const b = twin !== undefined && own.fate === 'unexplained' ? baseOf.get(twin)! : own;
    const lost = b.fate === 'written' ? (desLost.get(r.line) ?? []) : [];
    // (a copy of an appended line does not claim the event its first line wrote)
    const wrote = twin === undefined ? b.wrote : undefined;
    fates.push(b.fate);
    if (b.fate === 'written' && wrote === undefined && lost.length === 0 && twin === undefined) continue;
    lines.push({ line: r.line, fate: b.fate, ...(b.chain === undefined || b.chain.length === 0 ? {} : { chain: b.chain }), ...(wrote === undefined ? {} : { wrote }), ...(lost.length > 0 ? { lostCells: lost } : {}), ...(b.lentTo === undefined ? {} : { lentTo: b.lentTo }), ...(twin === undefined ? {} : { sameAs: twin }) });
  }
  const twinsOf = new Map<number, number>();
  for (const first of info.sameAs.values()) if (lentLines.has(first)) twinsOf.set(first, (twinsOf.get(first) ?? 0) + 1);
  const templates: LedgerColumn[] = merged.columns.flatMap((c) => {
    const k = desIndexOf(c.index);
    return k === undefined || info.consumed.has(c.index) ? [] : [{ ...c, index: k, header: info.columns[c.index]?.header ?? c.header }];
  });
  const columns = descriptionColumns(templates, desSheet, info.description.file.decimalComma, lines);
  const description: SheetLedger = {
    file: info.description.file.fileName,
    sheet: desSheet.name,
    kind: 'description',
    unit: 'rows',
    rows: rowTallyOf(desSheet.rows.length, fates),
    ...(merged.inputIndex === undefined ? {} : { inputIndex: merged.inputIndex }),
    columns,
    lines,
    notUnderstood: fates.filter((f) => (NOT_UNDERSTOOD as readonly string[]).includes(f)).length,
    lent: [{ sheet: info.results.sheet, lines: lentLines.size + [...twinsOf.values()].reduce((n, x) => n + x, 0), samples: lentLines.size }],
    balanced: true,
  };
  DESCRIPTION_SHEET.set(description, { sheet: desSheet, decimalComma: info.description.file.decimalComma });
  description.balanced = description.rows.unexplained === 0 && description.columns.every((c) => c.match && (c.to === 'event' || c.unexplained === 0));
  return { results, description };
}

/**
 * The ONLY combiner of the description ledgers of one description sheet (decision 6): one per results sheet it served, as one. A line is written when any results sheet used it (a line lent to two
 * results sheets is one written line, and `lent` lists each); a line none of them used keeps the reason the merge gave it, or stays unexplained.
 */
export function combineDescriptionLedgers(parts: readonly SheetLedger[]): SheetLedger {
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lineNumbers = new Set(parts.flatMap((p) => p.lines.map((l) => l.line)));
  const lines: LineFate[] = [];
  const unusable: LineFate[] = [];
  for (const line of [...lineNumbers].sort((a, b) => a - b)) {
    const seen = parts.map((p) => p.lines.find((l) => l.line === line));
    // a part that does not list the line wrote it plainly
    const writtenSomewhere = seen.some((l) => l === undefined || l.fate === 'written');
    if (!writtenSomewhere) {
      const listedFates = seen as LineFate[];
      const chosen = listedFates.find((l) => l.fate !== 'unexplained') ?? listedFates[0];
      const lentTo = listedFates.filter((l) => l.fate === chosen.fate).flatMap((l) => l.lentTo ?? []);
      const pick: LineFate = { ...chosen, ...(lentTo.length > 0 ? { lentTo } : {}) };
      unusable.push(pick);
      lines.push(pick);
      continue;
    }
    const writes = seen.filter((l): l is LineFate => l !== undefined && l.fate === 'written');
    const wrote = [...new Set(writes.flatMap((l) => l.wrote ?? []))];
    const chain = [...new Set(writes.flatMap((l) => l.chain ?? []))];
    const lost = writes.reduce<LostCell[]>((acc, l) => addLost(acc, l.lostCells ?? []), []);
    const sameAs = writes.find((l) => l.sameAs !== undefined)?.sameAs;
    if (wrote.length === 0 && chain.length === 0 && lost.length === 0 && sameAs === undefined) continue;
    lines.push({ line, fate: 'written', ...(chain.length > 0 ? { chain } : {}), ...(wrote.length > 0 ? { wrote } : {}), ...(lost.length > 0 ? { lostCells: lost } : {}), ...(sameAs === undefined ? {} : { sameAs }) });
  }
  const counts = new Map<LedgerReason, number>();
  let unexplained = 0;
  for (const l of unusable) {
    if (l.fate === 'unexplained') unexplained++;
    else bump(counts, l.fate);
  }
  const source = first.rows.source;
  const byIndex = new Map<number, LedgerColumn>();
  for (const c of parts.flatMap((p) => p.columns)) {
    const have = byIndex.get(c.index);
    byIndex.set(c.index, have === undefined ? { ...c } : { ...have, to: have.to === 'not-written' ? c.to : have.to, match: have.match && c.match });
  }
  const own = DESCRIPTION_SHEET.get(first);
  const templates = [...byIndex.values()].sort((a, b) => a.index - b.index);
  // (the same sheet, once: the cells are counted from the sheet and each line by the fate it has in the end)
  const columns = own === undefined ? templates : descriptionColumns(templates, own.sheet, own.decimalComma, lines);
  const out: SheetLedger = {
    ...first,
    rows: tally(source, source - unusable.length, counts, unexplained),
    columns,
    lines,
    notUnderstood: unusable.filter((l) => (NOT_UNDERSTOOD as readonly string[]).includes(l.fate)).length,
    lent: parts.flatMap((p) => p.lent ?? []),
    balanced: true,
  };
  if (own !== undefined) DESCRIPTION_SHEET.set(out, own);
  out.balanced = unexplained === 0 && columns.every((c) => c.match && (c.to === 'event' || c.unexplained === 0));
  return out;
}
