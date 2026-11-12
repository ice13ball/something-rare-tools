// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { guardTextReversible } from '../output/csv';
import { makeConvertFinding } from '../rules/convert';
import type { Finding, RawCell, RawRow, RawSheet } from '../types';
import type { ConvertSheetInput } from './build';
import type { LedgerReason, LineFate, SheetLedger } from './ledger';
import { parseDate } from '../values/dates';
import { policyOf } from './policy';

/*
 * Nothing disappears. The data are scientific: the converter may not understand a row, but it never deletes it and never advises deleting it.
 *
 * Every reason a row has no record (ledger.ts) is of one of three kinds:
 *   blocks    the row holds something the converter cannot place (a value with no parameter, a number with no taxon, a row of the wrong length ...). The export is blocked until someone
 *             decides: "leave these rows out and list them" (CONV-ROW-NOT-UNDERSTOOD, once per reason and sheet), or correct the file. Never prefilled, never a default.
 *   covered   the row is held back by a rule of its own that blocks the export already (a missing sample code, a negative count ...). A finding of this file is added only for the lines that rule does not name.
 *   listed    understood and not written (a zero, a statistic row in a summary block, a copy or a repeated total the user chose to leave out ...): no block, but the row is in the list.
 * A reason this file does not know blocks (an unknown future reason must not let a row go in silence).
 *
 * The list of rows not written (`notWrittenRows`, `notWrittenCsv`) is read from the same lines of the ledger as the findings, and from the same cells the conversion read: it cannot disagree with them.
 */

export type ReasonKind = 'blocks' | 'covered' | 'listed';

/** The reason of a line that has neither a record nor a reason: a fault of the converter, shown and blocking. */
export type LeaveOutReason = LedgerReason | 'unexplained';

/** The kind of every reason the ledger knows. Typed as a Record so that a new reason cannot be added without a decision here. */
export const REASON_KIND: Record<LedgerReason, ReasonKind> = {
  // blocks until a decision
  ragged: 'blocks',
  'no-taxon': 'blocks',
  'value-no-taxon': 'blocks',
  'taxon-no-quantity': 'covered',
  'empty-parameter': 'blocks',
  'repeated-parameter': 'blocks',
  'not-in-event': 'blocks',
  // a row with only the taxon inside a group whose total is taken once: it would be joined to the group silently or written as one more occurrence with the whole total again, so it is asked, once per sheet
  'taxon-only-in-total': 'blocks',
  // a total of 1 on several rows of a group whose total is taken once: one specimen listed on several rows, or separate specimens; the later rows are asked about, not collapsed by the choice
  'one-specimen-total': 'blocks',
  // a row of the description sheet of a join whose key has a blank part: its values can be lent to no sample, so it is asked about (like a ragged row), never dropped by itself
  'join-no-key': 'blocks',
  // held back by a rule of its own that blocks
  'no-code': 'covered',
  'no-replicate': 'covered',
  'duplicate-event': 'covered',
  'duplicate-level': 'covered',
  'no-station': 'covered',
  negative: 'covered',
  'not-integer': 'covered',
  'bad-mark': 'covered',
  'sheet-not-read': 'covered',
  // two description rows of one key that differ: CONV-JOIN-AMBIGUOUS is the one question, found because the merge's findings are convert's own
  'join-ambiguous': 'covered',
  // understood and not written: listed, no block
  'summary-row': 'listed',
  zero: 'listed',
  'zero-with-biomass': 'listed',
  'quantity-blank': 'listed',
  'nothing-to-record': 'listed',
  'copy-dropped': 'listed',
  'repeat-total': 'listed',
  'na-cell': 'listed',
  'absent-mark': 'listed',
  'repeat-in-sample': 'listed',
  'absent-record': 'listed',
  'column-not-read': 'listed',
  'sheet-not-used': 'listed',
  'quality-flag': 'listed',
  'text-cell': 'listed',
  'position-no-taxon': 'listed',
  'sample-no-taxon': 'listed',
  // a value of one sheet that lost a conflict to the other sheet's: the person chose, the value is listed with both lines
  'join-not-chosen': 'listed',
};

/** The rules that already block the export for a `covered` reason. */
export const COVERED_BY: Partial<Record<LedgerReason, readonly string[]>> = {
  // (a sheet of environmental measurements only has its own single message, CONV-ENV-ONLY-SHEET, instead of the stack)
  'no-code': ['CONV-SAMPLE-CODE-MISSING', 'CONV-ENV-ONLY-SHEET'],
  'taxon-no-quantity': ['CONV-TAXON-NO-QUANTITY', 'CONV-SPECIES-LIST-NO-COUNTS'],
  'no-replicate': ['CONV-REPLICATE-MISSING'],
  'duplicate-event': ['CONV-ID-DUPLICATE'],
  'duplicate-level': ['CONV-ID-DUPLICATE'],
  'no-station': ['CONV-PROFILE-NO-STATION'],
  negative: ['CONV-NEGATIVE-QUANTITY'],
  'not-integer': ['CONV-COUNT-NOT-INTEGER'],
  'bad-mark': ['CONV-PRESENCE-VALUE'],
  'sheet-not-read': ['CONV-LONG-UNSUPPORTED', 'CONV-SHEET-TRANSPOSED', 'CONV-SHEET-UNITS-ROW'],
  'join-ambiguous': ['CONV-JOIN-AMBIGUOUS'],
};

/** The rule that blocked on its own for a reason that can be left out, and goes when the user leaves the reason out (the new finding takes over its question). */
export const SUPERSEDES: Partial<Record<LeaveOutReason, string>> = {
  ragged: 'ROW-RAGGED',
  'empty-parameter': 'CONV-LONG-NO-PARAMETER',
  'repeated-parameter': 'CONV-LONG-DUPLICATE',
  'no-taxon': 'CONV-TAXON-EMPTY-ROW',
  'join-no-key': 'CONV-JOIN-KEY-BLANK',
};

/** The kind of a reason; a reason that is not known blocks. */
export function kindOf(reason: string): ReasonKind {
  return Object.prototype.hasOwnProperty.call(REASON_KIND, reason) ? REASON_KIND[reason as LedgerReason] : 'blocks';
}

/** Can a decision "leave these rows out" be given for the reason? (the ones that block, and the ones whose own rule does not name the line) */
export const canLeaveOut = (reason: string): boolean => kindOf(reason) !== 'listed';

/** The most lines one finding names (the count in its text is the true one; the list beside the archive has them all). */
export const MAX_FINDING_LINES = 2000;
const EXAMPLES = 3;
const EXAMPLE_CELLS = 8;
const EXAMPLE_CELL_LENGTH = 30;

export interface RowDecision {
  findings: Finding[];
  /** Findings of other rules that the answers take over: dropped by the caller. */
  suppress: { ruleId: string; file: string; sheet: string }[];
  /** The (sheet, reason) pairs that are left out: `${inputIndex}\u0000${reason}`. */
  leftOut: string[];
}

/** The source rows of a ledger entry: the sheet as the conversion read it, and for a pivot the long sheet its lines belong to. */
function sourceOf(l: SheetLedger, sheets: readonly ConvertSheetInput[]): RawSheet | undefined {
  if (l.inputIndex === undefined) return undefined;
  const sin = sheets[l.inputIndex];
  const join = sin?.sampleJoin;
  // a joined input: the description's lines are those of its own sheet, the results' those of the ORIGINAL results sheet (not the merged one)
  if (join !== undefined) {
    if (l.kind === 'description' || (l.kind === 'not-read' && l.sheet !== sin.sheet)) return join.description.sheet;
    if (l.sheet === sin.sheet) return join.results.raw;
  }
  const sheet = sin?.file.sheets.find((x) => x.name === l.sheet);
  return sheet?.pivot?.source ?? sheet;
}

const cellShown = (c: RawCell | undefined): string => {
  if (c === null || c === undefined) return '';
  const t = String(c).replace(/\s+/g, ' ').trim();
  return t.length > EXAMPLE_CELL_LENGTH ? `${t.slice(0, EXAMPLE_CELL_LENGTH)}…` : t;
};

/** "7: a | b | c" for the first few rows: the physical line and what the cells hold. */
function examplesOf(rows: Map<number, RawRow>, lines: readonly number[]): string {
  const out: string[] = [];
  for (const line of lines) {
    const row = rows.get(line);
    if (row === undefined) continue;
    const cells = row.cells.slice(0, EXAMPLE_CELLS).map(cellShown);
    out.push(`${line}: ${cells.join(' | ')}${row.cells.length > EXAMPLE_CELLS ? ' | …' : ''}`);
    if (out.length >= EXAMPLES) break;
  }
  return out.join('; ');
}

/** Only the rows of the given lines, read in one pass. */
function rowsAt(sheet: RawSheet | undefined, lines: Iterable<number>): Map<number, RawRow> {
  const out = new Map<number, RawRow>();
  if (sheet === undefined) return out;
  const want = new Set(lines);
  if (want.size === 0) return out;
  for (const r of sheet.rows) if (want.has(r.line)) out.set(r.line, r);
  return out;
}

const isUnwritten = (l: LineFate): boolean => l.fate !== 'written';

/**
 * The questions of a conversion: for every reason that blocks, one finding per sheet (CONV-ROW-NOT-UNDERSTOOD), or the note that the user left it out (CONV-ROW-LEFT-OUT).
 * `existing` are the findings so far: a `covered` reason raises a finding only for the lines no blocking rule of its own names.
 */
export function decideRows(ledger: readonly SheetLedger[], sheets: readonly ConvertSheetInput[], existing: readonly Finding[]): RowDecision {
  const out: RowDecision = { findings: [], suppress: [], leftOut: [] };
  for (const l of ledger) {
    if (l.kind === 'not-used' || l.inputIndex === undefined) continue;
    const sin = sheets[l.inputIndex] as ConvertSheetInput | undefined;
    if (sin === undefined) continue;
    const byReason = new Map<string, number[]>();
    for (const f of l.lines) {
      // a written line whose lost cell has no reason is a fault of the converter, like a row with none: it blocks too
      const fate: string | undefined = isUnwritten(f) ? f.fate : (f.lostCells ?? []).some((c) => c.reason === 'unexplained') ? 'unexplained' : undefined;
      if (fate === undefined) continue;
      const list = byReason.get(fate);
      if (list === undefined) byReason.set(fate, [f.line]);
      else list.push(f.line);
    }
    const source = sourceOf(l, sheets);
    for (const [reason, all] of byReason) {
      const kind = kindOf(reason);
      if (kind === 'listed') continue;
      let lines = all;
      if (kind === 'covered') {
        // a covered reason is decided by its own rule, which blocks: our question is never raised beside it. Only when no blocking rule of the kind stands for the sheet at all (a fault: the rows
        // would go in silence) the question is asked after all.
        // (the sheet of a joined input that was not read is judged on the results sheet it was merged into)
        const host = sin.sampleJoin !== undefined && l.kind === 'not-read' && l.sheet !== sin.sheet ? { file: sin.file.fileName, sheet: sin.sheet } : { file: l.file, sheet: l.sheet };
        const covering = existing.filter((f) => f.file === host.file && f.sheet === host.sheet && (COVERED_BY[reason as LedgerReason] ?? []).includes(f.ruleId) && policyOf(f) === 'block');
        if (covering.length > 0) continue;
      }
      const count = lines.length;
      // an answer given on the page holds for the number of rows it was given for (a bare reason, from a caller that is not the page, holds whatever the number); the same for a companion file, which
      // also holds only for a sheet of the same number of rows
      // (the description sheet of a join has no input of its own: the page stores its answers on the description input, which the merge copied)
      const answers = l.kind === 'description' && sin.sampleJoin !== undefined ? sin.sampleJoin.description : sin;
      const you = (answers.leaveOut ?? []).some((a) => (typeof a === 'string' ? a === reason : a.reason === reason && a.count === count));
      const file = !you && (answers.leaveOutFile ?? []).some((g) => g.reason === reason && g.count === count && g.rows === l.rows.source);
      const sorted = [...lines].sort((a, b) => a - b);
      const left = you || file;
      const examples = examplesOf(rowsAt(source, sorted.slice(0, EXAMPLES)), sorted);
      const base = { file: l.file, sheet: l.sheet, lines: sorted.slice(0, MAX_FINDING_LINES) };
      if (left) {
        out.leftOut.push(`${l.inputIndex}\u0000${reason}`);
        out.findings.push(makeConvertFinding('CONV-ROW-LEFT-OUT', { ...base, params: { reason, count, rows: l.rows.source, ...(file ? { fromFile: 'yes' } : {}), ...(examples === '' ? {} : { examples }) } }));
        const rule = SUPERSEDES[reason as LeaveOutReason];
        if (rule !== undefined) out.suppress.push({ ruleId: rule, file: l.file, sheet: l.sheet });
      } else {
        out.findings.push(makeConvertFinding('CONV-ROW-NOT-UNDERSTOOD', { ...base, params: { reason, count, rows: l.rows.source, ...(examples === '' ? {} : { examples }) } }));
        // one message for the same lines: a warning about a number with no taxon gives way to the question that covers the same rows, before the answer as well
        if (reason === 'no-taxon') out.suppress.push({ ruleId: 'CONV-TAXON-EMPTY-ROW', file: l.file, sheet: l.sheet });
      }
    }
  }
  return out;
}

/* ---------- the list of rows not written ---------- */

export type NotWrittenStatus = 'understood' | 'left-out' | 'needs-decision';

export interface NotWrittenRow {
  file: string;
  sheet: string;
  /** The physical line of the file as loaded (for a pivoted sheet, of the long file); undefined for a sheet that was left out as a whole. */
  line: number | undefined;
  reason: string;
  status: NotWrittenStatus;
  /** The other reasons recorded for the line; for a written line that lost cells, the cells. */
  detail: string;
  /** All the original cells of the line. */
  cells: readonly RawCell[];
  kind: 'header' | 'line' | 'lost-cells' | 'sheet';
}

/** A line of the ledger that is listed: a line with no record, or a written line that lost cells other than zeros. */
const listed = (f: LineFate): boolean => isUnwritten(f) || (f.lostCells !== undefined && f.lostCells.length > 0);

/** A sheet that is left out as a whole and has no line of its own: not used, or not read with no lines kept (a pivoted long sheet). It is one row of the list with its count of rows, not row by row. */
const leftWhole = (l: SheetLedger): boolean => l.kind === 'not-used' || (l.kind === 'not-read' && l.lines.length === 0);

/** How many lines the list holds for these ledger entries (a sheet left out as a whole is not a line: it is one row of its own and is counted apart). */
export function countNotWritten(ledger: readonly SheetLedger[]): { rows: number; sheets: number } {
  let rows = 0;
  let sheets = 0;
  for (const l of ledger) {
    if (leftWhole(l)) {
      if (l.rows.source > 0) sheets++;
      continue;
    }
    for (const f of l.lines) if (listed(f)) rows++;
  }
  return { rows, sheets };
}

const statusOf = (reason: string, l: SheetLedger, left: ReadonlySet<string>): NotWrittenStatus =>
  kindOf(reason) === 'listed' ? 'understood' : left.has(`${l.inputIndex}\u0000${reason}`) ? 'left-out' : 'needs-decision';

/**
 * Every row not written, one at a time (the list can be as long as the file: nothing here holds it whole). `leftOut` is `RowDecision.leftOut` of the same conversion.
 * Per sheet: a header row (kind 'header': the header of the sheet, so that the cells can be read), then its lines in file order.
 */
export function* notWrittenRows(ledger: readonly SheetLedger[], sheets: readonly ConvertSheetInput[], leftOut: readonly string[] = []): Generator<NotWrittenRow> {
  const left = new Set(leftOut);
  for (const l of ledger) {
    if (leftWhole(l)) {
      const reason = l.rows.skipped[0]?.reason ?? 'sheet-not-used';
      if (l.rows.source > 0) yield { file: l.file, sheet: l.sheet, line: undefined, reason, status: l.kind === 'not-used' ? 'left-out' : statusOf(reason, l, left), detail: 'rows', cells: [l.rows.source], kind: 'sheet' };
      continue;
    }
    const wanted = l.lines.filter(listed);
    if (wanted.length === 0) continue;
    const source = sourceOf(l, sheets);
    const rows = rowsAt(source, wanted.map((f) => f.line));
    const input = l.inputIndex === undefined ? undefined : sheets[l.inputIndex];
    const dated = (cells: readonly RawCell[]): string => {
      const flags = source?.dateFormatted;
      if (flags === undefined || input === undefined) return '';
      const out: string[] = [];
      cells.forEach((c, i) => {
        if (typeof c !== 'number' || flags[i] !== true) return;
        const d = parseDate(c, { date1904: (l.kind === 'description' ? input.sampleJoin?.description.file.date1904 : input.file.date1904) ?? input.file.date1904, dateFormatted: true });
        if (!('error' in d)) out.push(`${(source?.header[i] ?? '').trim() || `#${i + 1}`}: ${d.iso}`);
      });
      return out.length === 0 ? '' : `date: ${out.join('; ')}`;
    };
    const join = (a: string, b: string): string => (a === '' ? b : b === '' ? a : `${a} | ${b}`);
    if (source !== undefined) yield { file: l.file, sheet: l.sheet, line: source.headerLine, reason: 'header', status: 'understood', detail: '', cells: source.header, kind: 'header' };
    for (const f of wanted) {
      const cells = rows.get(f.line)?.cells ?? [];
      if (isUnwritten(f)) {
        const others = (f.chain ?? []).filter((c) => c !== f.fate);
        yield { file: l.file, sheet: l.sheet, line: f.line, reason: f.fate, status: statusOf(f.fate, l, left), detail: join(others.join(' '), dated(cells)), cells, kind: 'line' };
      } else {
        const header = source?.header ?? [];
        const named = (f.lostCells ?? []).map((c) => {
          const column = (header[c.index] ?? '').trim() || `#${c.index + 1}`;
          return c.reason === 'join-not-chosen' && c.taken !== undefined && c.other !== undefined ? `${column} (${c.reason}: ${c.taken} taken from ${c.other.sheet} line ${c.other.line})` : `${column} (${c.reason})`;
        });
        const status: NotWrittenStatus = (f.lostCells ?? []).some((c) => c.reason === 'unexplained') ? statusOf('unexplained', l, left) : 'understood';
        yield { file: l.file, sheet: l.sheet, line: f.line, reason: 'cells-not-written', status, detail: join(named.join('; '), dated(cells)), cells, kind: 'lost-cells' };
      }
    }
  }
}

/* ---------- the file ---------- */

const NUMBER_LIKE = /^[+-]?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?$/;
const quote = (s: string): string => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * One cell of the list. A text that starts like a formula (= + - @, also after spaces or a tab, also the full-width forms) gets a leading apostrophe, the form `readConvertFile` takes off
 * again, so the list can be read back by the converter and a spreadsheet never runs a cell. A plain number is left as it is.
 */
export function cellField(c: RawCell | undefined): string {
  if (c === null || c === undefined) return '';
  if (typeof c === 'number') return quote(String(c));
  return quote(NUMBER_LIKE.test(c) ? c : guardTextReversible(c));
}

const FIXED = ['file', 'sheet', 'line', 'reason', 'status', 'detail'];
const FLUSH_ROWS = 2000;

/**
 * The list as the text of a CSV in UTF-8, in chunks of a few thousand rows (the caller makes a Blob of them; no whole-file string is built). Columns: file, sheet, line (the physical line of
 * the file as loaded), reason, status (understood | left-out | needs-decision), detail, then every original cell. Rows of a sheet start with its header (reason `header`).
 */
export function notWrittenCsv(ledger: readonly SheetLedger[], sheets: readonly ConvertSheetInput[], leftOut: readonly string[] = []): { chunks: string[]; count: number } {
  let width = 0;
  for (const r of notWrittenRows(ledger, sheets, leftOut)) width = Math.max(width, r.cells.length);
  const header = [...FIXED, ...Array.from({ length: width }, (_, i) => `cell ${i + 1}`)].join(',');
  const chunks: string[] = [];
  let buf: string[] = [header];
  let count = 0;
  for (const r of notWrittenRows(ledger, sheets, leftOut)) {
    if (r.kind !== 'header' && r.kind !== 'sheet') count++;
    buf.push([cellField(r.file), cellField(r.sheet), r.line === undefined ? '' : String(r.line), r.reason, r.status, cellField(r.detail), ...r.cells.map(cellField)].join(','));
    if (buf.length >= FLUSH_ROWS) {
      chunks.push(`${buf.join('\n')}\n`);
      buf = [];
    }
  }
  if (buf.length > 0) chunks.push(`${buf.join('\n')}\n`);
  return { chunks, count };
}
