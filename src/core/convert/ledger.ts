// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { EventRec, OccRec, MofIntent } from './model';
import type { RawSheet, SheetMapping } from '../types';
import { parseNumber } from '../values/numbers';

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
  | 'same-sample'
  | 'repeat-in-sample'
  | 'absent-record'
  | 'column-not-read'
  | 'sheet-not-read'
  | 'sheet-not-used'
  | 'empty';

export const LEDGER_REASONS: readonly LedgerReason[] = [
  'ragged', 'summary-row', 'no-code', 'no-replicate', 'no-taxon', 'quantity-blank', 'nothing-to-record', 'duplicate-event', 'repeat-total', 'copy-dropped', 'zero', 'zero-with-biomass', 'negative',
  'not-integer', 'na-cell', 'absent-mark', 'bad-mark', 'no-station', 'duplicate-level', 'same-sample', 'repeat-in-sample', 'absent-record', 'column-not-read', 'sheet-not-read', 'sheet-not-used', 'empty',
];
const REASON_CODE = new Map(LEDGER_REASONS.map((r, i) => [r, i + 1] as const));
const CODE_OF: Record<string, number> = Object.fromEntries(LEDGER_REASONS.map((r, i) => [r, i + 1]));

/**
 * The reasons the conversion records while it reads a sheet. Created per sheet; the builder writes into it, the ledger reads it. A cell's reason is kept in one byte per cell and column
 * (position of the row in the sheet, column index), so a sheet of millions of cells costs a typed array, not a map entry per cell.
 */
export class FateLog {
  readonly rows = new Map<number, LedgerReason>();
  private readonly cols = new Map<number, Uint8Array>();
  /** The column a record was written from, by record. The record objects themselves are not touched. */
  readonly origin = new WeakMap<object, number>();
  /** The rows (by line) that joined a sample an earlier row of the sheet had opened. */
  readonly merged = new Set<number>();
  private lastIndex = -1;
  private last: Uint8Array | undefined;
  constructor(private readonly rowCount: number) {}
  row(line: number, reason: LedgerReason): void {
    if (!this.rows.has(line)) this.rows.set(line, reason);
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

export interface SheetLedger {
  file: string;
  sheet: string;
  kind: 'wide' | 'long' | 'profile' | 'not-read' | 'not-used';
  /** The tally the sheet is judged by: its taxon cells for a wide sheet, its rows for every other. */
  unit: 'rows' | 'cells';
  rows: LedgerTally;
  /** Wide sheets only: the non-blank cells of the taxon columns. */
  cells?: LedgerTally;
  /** A sheet that was read as one row per sample out of a long one: the rows the file had, against `rows.source` (the rows made of them). */
  pivotRowsIn?: number;
  columns: LedgerColumn[];
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
  /** The sheet is the pivot of a long sheet of this many rows. */
  pivotRowsIn?: number;
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
  const isWrittenAt = (pos: number, line: number): boolean =>
    inp.kind === 'profile' ? (inp.levelLines?.has(line) ?? false) : inp.hasTaxa ? hasOcc(pos) : measurementAt.has(line) || (inp.levelLines?.has(line) ?? false);

  /* the rows */
  const rowCounts = new Map<LedgerReason, number>();
  let rowsWritten = 0;
  let rowsWithoutNumber = 0;
  let rowsUnexplained = 0;
  const longCellFate = (pos: number): LedgerReason | undefined => {
    for (const i of inp.occurrenceColumns) {
      const r = fate.cellFate(pos, i);
      if (r !== undefined) return r;
    }
    return undefined;
  };
  const taxonCellFate = (pos: number): LedgerReason | undefined => {
    for (const i of inp.taxonColumns) {
      const r = fate.cellFate(pos, i);
      if (r !== undefined) return r;
    }
    return undefined;
  };
  for (let pos = 0; pos < rows.length; pos++) {
    const row = rows[pos];
    if (isWrittenAt(pos, row.line)) {
      rowsWritten++;
      if (inp.kind !== 'profile' && inp.hasTaxa && !numberAt.has(pos)) rowsWithoutNumber++;
      continue;
    }
    const reason: LedgerReason | undefined =
      fate.rows.get(row.line) ??
      (inp.kind === 'wide' ? taxonCellFate(pos) : longCellFate(pos)) ??
      (fate.merged.has(row.line) ? 'same-sample' : undefined) ??
      (row.cells.every((c) => isBlank(c)) ? 'empty' : undefined) ??
      (inp.kind === 'wide' && !inp.taxonColumns.some((i) => !isBlank(row.cells[i])) ? 'nothing-to-record' : undefined);
    if (reason === undefined) rowsUnexplained++;
    else bump(rowCounts, reason);
  }
  const rowTally = tally(rows.length, rowsWritten, rowCounts, rowsUnexplained);
  if (inp.kind !== 'profile' && inp.hasTaxa) rowTally.writtenWithoutNumber = rowsWithoutNumber;

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
    for (const i of inp.taxonColumns) {
      const flag = occFlag.get(i);
      const cf = fate.column(i);
      for (let pos = 0; pos < rows.length; pos++) {
        if (isBlank(rows[pos].cells[i])) continue;
        source++;
        if (flag !== undefined && flag[pos] === 1) {
          written++;
          continue;
        }
        const code = rowCode[pos] || (cf === undefined ? 0 : cf[pos]);
        if (code === 0) unexplained++;
        else counts[code]++;
      }
    }
    cellTally = tally(source, written, countsOf(counts), unexplained);
  }

  /* the columns that hold numbers */
  const occ = new Set(inp.occurrenceColumns);
  const mea = new Set(inp.measurementColumns);
  const evt = new Set(inp.eventColumns);
  const columns: LedgerColumn[] = [];
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
    for (let pos = 0; pos < rows.length; pos++) {
      const raw = rows[pos].cells[index];
      if (raw === null || raw === undefined) continue;
      let value: number;
      if (typeof raw === 'number') {
        if (!Number.isFinite(raw)) {
          nonNumbers++;
          continue;
        }
        value = raw;
      } else {
        const p = parseNumber(raw, inp.decimalComma);
        if (p.status !== 'ok') {
          if (p.status !== 'missing') nonNumbers++;
          continue;
        }
        value = p.value;
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
          (inp.kind === 'long' && !isWrittenAt(pos, line) ? longCellFate(pos) : undefined) ??
          // a per-organism value of a record that is an absence has nothing to hang on
          (inp.kind === 'long' && absentAt.has(pos) && !presentAt.has(pos) ? 'absent-record' : undefined) ??
          (!isWrittenAt(pos, line) && fate.merged.has(line) ? 'same-sample' : undefined);
        code = reason === undefined ? 0 : (CODE_OF[reason] ?? 0);
      }
      if (code === 0) {
        unexplained++;
        continue;
      }
      counts[code]++;
      const sc = (sums[code] ??= new Sum());
      if (value !== 0) sc.add(value);
    }
    if (numbers === 0 && nonNumbers === 0) continue;
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

  const headline = cellTally ?? rowTally;
  const balanced = headline.unexplained === 0 && rowTally.unexplained === 0 && columns.every((c) => c.match && (c.to === 'event' || c.unexplained === 0));
  return {
    file: inp.file,
    sheet: sheet.name,
    kind: inp.kind,
    unit: cellTally === undefined ? 'rows' : 'cells',
    rows: rowTally,
    ...(cellTally === undefined ? {} : { cells: cellTally }),
    ...(inp.pivotRowsIn === undefined ? {} : { pivotRowsIn: inp.pivotRowsIn }),
    columns,
    balanced,
  };
}

/** A sheet that was not read at all (CONV-LONG-UNSUPPORTED, CONV-SHEET-TRANSPOSED): every row went nowhere, and the ledger says so. */
export function notReadLedger(file: string, sheet: RawSheet): SheetLedger {
  return skippedSheet(file, sheet, 'not-read', 'sheet-not-read');
}

/** A sheet the user left out ("use" unticked): nothing of it is converted, and the ledger says so. */
export function notUsedLedger(file: string, sheet: RawSheet): SheetLedger {
  return skippedSheet(file, sheet, 'not-used', 'sheet-not-used');
}

function skippedSheet(file: string, sheet: RawSheet, kind: 'not-read' | 'not-used', reason: LedgerReason): SheetLedger {
  // (a long sheet read as its pivot: the rows the file had, not the samples made of them)
  const n = sheet.pivot?.rowsIn ?? sheet.rows.length;
  const rows: LedgerTally = { source: n, written: 0, skipped: n === 0 ? [] : [{ reason, count: n }], unexplained: 0 };
  return { file, sheet: sheet.name, kind, unit: 'rows', rows, columns: [], balanced: true };
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
  }
}
