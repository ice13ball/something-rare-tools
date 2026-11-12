// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { Collector, metaParser, specsOf } from '../dataset';
import { isBlankCell, stripTypeSuffix } from '../recognize/columns';
import { depthUnitFactor, depthUnitOfHeader, isMetreUnit } from '../recognize/depthUnit';
import { rankJoinKeys } from '../recognize/layout';
import type { KeySide } from '../recognize/layout';
import { makeConvertFinding } from '../rules/convert';
import { makeFinding } from '../rules/registry';
import type { ColumnRole, Finding, ParsedFile, RawCell, RawRow, RawSheet, SheetMapping } from '../types';
import { detectDayMonthOrder, excelSerialToDate } from '../values/dates';
import { parseNumber } from '../values/numbers';
import { colsOf, depthReader, isUtcBySource } from './build';
import type { ConvertSheetInput } from './build';
import { eventDateText } from './events';
import { shortHash } from './keySetting';
import { keyPart } from './sampleKey';

/*
 * The sample-sheet join: a results sheet (counts per taxon) names its samples by a code, and another sheet of the same run describes them (station, date, position, depth). This file PROPOSES
 * which sheet describes which and by which key; it never applies anything. Nothing joins until the person confirms (declare-first). The proposal reads only roles already on screen (sample code,
 * station, cruise, the picked key parts, taxon) and header equality, and how many of the results sheet's keys the other sheet has: a measurement, not a guess of a role from values.
 * Sheets are addressed by their index in the inputs handed in, so two files with one sheet name never mix.
 *
 * `mergeSampleSheets` (below) is what runs AFTER the person confirmed a join: it attaches the description row to every results row and keeps where every merged cell came from. Scientific data is
 * never removed or altered silently there: every description value either reaches the merged sheet (in its own column, or in the results column it fills) or is named by a finding.
 */

export type JoinSide = 'description' | 'results';
/** One key column on each side, by column index. */
export interface JoinKeyPair { results: number; description: number }

export interface SampleJoinProposal {
  /** Index of the results sheet in the inputs. */
  results: number;
  /** Index of the describing sheet in the inputs. */
  description: number;
  /** The key: one pair, or several that together identify a sample (a picked key: all its parts). */
  keys: JoinKeyPair[];
  /** How many of the results sheet's samples (distinct keys) the description sheet has. */
  covered: number;
  /** How many samples (distinct, non-blank keys) the results sheet has. */
  samples: number;
  /** The key identifies one row of the description sheet. */
  unique: boolean;
  /** The description sheet is a long sheet read through its pivot (`RawSheet.pivot !== undefined`): shown, never joinable for now. */
  long: boolean;
}

const cleanHeader = (h: string): string => stripTypeSuffix(h).toLowerCase();
const hasTaxon = (s: ConvertSheetInput): boolean => s.mapping.columns.some((c) => c.role.kind === 'taxon');
const sheetOf = (s: ConvertSheetInput): RawSheet | undefined => s.file.sheets.find((x) => x.name === s.sheet);
const RIGHT_KINDS = new Set(['sampleId', 'station', 'cruise']);

/**
 * A copy of the sheet whose cells in `columns` hold the key part the converter reads from them (keyPart, in THIS sheet's own context, the reader the merge uses), blank where keyPart reads blank: the
 * proposal then ranks the keys the way the merge will join them, so a serial date and the same date written as text are one key. The sheet itself is not touched.
 */
function keyNormalised(input: ConvertSheetInput, sheet: RawSheet, columns: readonly number[]): RawSheet {
  const read = keyReaderOf(input, sheet);
  const rows = sheet.rows.map((row) => {
    const cells = row.cells.slice();
    for (const c of columns) {
      const part = read(row, [c]).parts[0];
      cells[c] = part === '' ? null : part;
    }
    return { ...row, cells };
  });
  return { ...sheet, rows };
}

/**
 * For each results sheet (a taxon column or taxon headers, not a profile sheet), the sheet that describes its samples best and the key, when the description has at least half of the results
 * sheet's samples. `skip` = pairs already confirmed or declined. A results sheet gets at most one proposal; one description may serve several results sheets.
 */
export function proposeSampleJoins(sheets: readonly ConvertSheetInput[], skip: readonly { results: number; description: number }[]): SampleJoinProposal[] {
  const out: SampleJoinProposal[] = [];
  sheets.forEach((res, ri) => {
    if (res.profile !== undefined || !hasTaxon(res)) return;
    const resSheet = sheetOf(res);
    if (resSheet === undefined) return;
    const picked = res.sampleKey?.columns ?? [];
    const pickedSet = new Set(picked);
    // the left key columns, in the column order of the results sheet (a tie goes to the earlier column)
    const leftCols = res.mapping.columns.filter((c) => (picked.length > 0 ? pickedSet.has(c.index) : c.role.kind === 'sampleId') || c.role.kind === 'station' || c.role.kind === 'cruise');
    if (leftCols.length === 0) return;
    const leftHeaders = new Set(leftCols.map((c) => cleanHeader(c.header)));
    const candidates: { index: number; side: KeySide }[] = [];
    sheets.forEach((d, di) => {
      if (di === ri || d.profile !== undefined || hasTaxon(d) || skip.some((p) => p.results === ri && p.description === di)) return;
      const dSheet = sheetOf(d);
      if (dSheet === undefined) return;
      const columns = d.mapping.columns.filter((c) => RIGHT_KINDS.has(c.role.kind) || leftHeaders.has(cleanHeader(c.header)));
      if (columns.length > 0) candidates.push({ index: di, side: { sheet: keyNormalised(d, dSheet, columns.map((c) => c.index)), columns } });
    });
    if (candidates.length === 0) return;
    const j = rankJoinKeys({ sheet: keyNormalised(res, resSheet, leftCols.map((c) => c.index)), columns: leftCols }, candidates.map((c) => c.side), { coverage: 'measure', ...(picked.length > 0 ? { kinds: 'any' as const, together: picked } : {}) });
    if (j === undefined || j.covered * 2 < j.total) return;
    const keys: JoinKeyPair[] = [{ results: j.leftKey, description: j.rightKey }, ...(j.extraKeys ?? []).map((k) => ({ results: k.leftKey, description: k.rightKey }))];
    const di = candidates[j.right].index;
    out.push({ results: ri, description: di, keys, covered: j.covered, samples: j.total, unique: j.unique, long: sheetOf(sheets[di])?.pivot !== undefined });
  });
  return out;
}

/* ---------- the merge ---------- */

/** The person's answer for one group of differing values (Task 5 applies it; this step only carries it). */
export interface ConflictAnswer {
  group: string;
  /** bulk side; absent = only the exceptions and pairs are decided (F5) */
  take?: JoinSide;
  count: number;
  exceptions: { entry: string; take: JoinSide }[];
  /** "apply to all with the same pair of values": request only, never the companion (F5) */
  pairs?: { pair: [descriptionText: string, resultsText: string]; take: JoinSide }[];
}

export interface SampleJoinDecl {
  results: ConvertSheetInput;
  description: ConvertSheetInput;
  keys: JoinKeyPair[];
  conflicts: readonly ConflictAnswer[];
  /** P1 answer: the number of results samples without a description it was given for */
  resultsOnly?: number;
  resultsOnlyFromFile?: boolean;
  /** join-key values that the OTHER results sheets joined to the same description hold (decision 6, F3) */
  heldElsewhere?: ReadonlySet<string>;
  /** append the description-only rows here (true for the first results sheet of a description only) */
  appendDescriptionOnly: boolean;
}

export interface SampleJoinInfo {
  /** `raw` = the original results sheet, for the not-written list (F10) */
  results: { file: string; sheet: string; raw: RawSheet; width: number; lines: ReadonlySet<number> };
  /** `leaveOut`/`leaveOutFile` copied from the description input: the answers to its blank-key question (F14, read by decideRows in Task 7) */
  description: { file: ParsedFile; sheet: RawSheet; mapping: SheetMapping; leaveOut?: ConvertSheetInput['leaveOut']; leaveOutFile?: ConvertSheetInput['leaveOutFile'] };
  /** per merged column: where it came from ('resolved' = written by the merge, Task 5) and its own header */
  columns: readonly { side: JoinSide | 'resolved'; index: number; header: string; /** 'resolved': the description columns the written cell is made of (convert() names them when it moves a finding) */ from?: readonly number[] }[];
  /** results column → the description column it shares a quantity or the join key with (a cell of it may come from the description: takenFromDescription, a description-only row) */
  pairs: ReadonlyMap<number, number>;
  /** merged line → the description line lent to it */
  lentFrom: ReadonlyMap<number, number>;
  /** merged lines appended for description-only samples (P2) → description line; numbered after the last results line */
  descriptionOnly: ReadonlyMap<number, number>;
  /** `${mergedLine}:${mergedColumn}` → description line, for results-column cells whose value came from the description (P4 fill, a 'description' choice) */
  takenFromDescription: ReadonlyMap<string, number>;
  /** `${mergedLine}:${mergedColumn}` → the description cell as its own file held it, for a lent cell rewritten into the results file's convention (F2) */
  rewritten: ReadonlyMap<string, RawCell>;
  /** merged columns the merge consumed (keys, the losing side of a shared quantity): never listed as ignored or not exported */
  consumed: ReadonlySet<number>;
  /** P7: values not chosen, with both lines */
  notChosen: readonly { side: JoinSide; line: number; column: number; otherLine: number; group: string; chosen: string }[];
  /** `${mergedLine}:${mergedColumn}` of the description cells lent blank because their own file did not read the text as a number (the text is in `rewritten`): not written, listed beside the archive (Task 7) */
  lentBlank: ReadonlySet<string>;
  /** a description line that repeats, value for value, an earlier line of the same key → that earlier line: the two count as one row, and the later one says so in the ledger (Task 7) */
  sameAs: ReadonlyMap<number, number>;
  /** description lines with a blank key part, ambiguous lines */
  noKey: readonly number[];
  ambiguous: readonly number[];
  /** the merge's own findings (P1, P2, P3, P4, P6, conflicts); convert() pushes them before decideRows (F1, Task 6) */
  findings: readonly Finding[];
}

/** one entry per (join-key value, results value) (F6); `id` = shortHash(key + '\u0000' + resultsText), what an exception addresses */
export interface ConflictEntry {
  id: string;
  key: string;
  descriptionLine: number;
  descriptionText: string;
  resultsText: string;
  resultsLines: number[];
  samples: string[];
  take?: JoinSide;
}
/** `count` = results samples over all entries (the label says samples) */
export interface ConflictGroup {
  group: string;
  quantity: 'date' | 'position' | 'depth' | 'station' | 'cruise' | 'variable' | 'other';
  label: string;
  /** the headers of the results columns and of the description columns the group compares: the person sees which columns differ, not only what they are called together */
  resultsColumns: string[];
  descriptionColumns: string[];
  count: number;
  entries: ConflictEntry[];
  answer?: ConflictAnswer;
}

export interface MergeResult {
  /** the results input with file/sheet replaced by the merged ones and sampleJoin set */
  input: ConvertSheetInput;
  info: SampleJoinInfo;
  /** grouped conflicts: none yet, a both-sides difference is an ungrouped CONV-JOIN-CONFLICT in `info.findings` until the grouping step */
  conflicts: ConflictGroup[];
  /** the join-key values of the description sheet (blank-key rows have none) */
  descriptionKeys: ReadonlySet<string>;
}

export interface QuantityColumns {
  file: ParsedFile;
  sheet: RawSheet;
  mapping: SheetMapping;
  columns: readonly number[];
}

type QuantityKind = 'date' | 'position' | 'depth' | 'station' | 'cruise' | 'sampleId';
/** The roles of which a sheet has one value per row and the converter reads only the first column (colsOf, specsOf): two such columns in one merged sheet would silently drop the second. */
const QUANTITY_OF: Partial<Record<ColumnRole['kind'], QuantityKind>> = {
  datetime: 'date',
  date: 'date',
  time: 'date',
  datePart: 'date',
  latitude: 'position',
  longitude: 'position',
  hemisphere: 'position',
  depth: 'depth',
  station: 'station',
  cruise: 'cruise',
  sampleId: 'sampleId',
};
const MAX_LISTED = 10;
const MAX_EXAMPLES = 3;
/** Keys of the other sheet named beside a list of samples, and the example keys of a join that matches nothing. */
const MAX_KEY_EXAMPLES = 5;

const emptyCell = (c: RawCell | undefined): boolean => c === null || c === undefined || (typeof c === 'string' && c.trim() === '');
const cellText = (c: RawCell | undefined): string => (c === null || c === undefined ? '' : String(c).trim());
/** A results line named in a list of samples: language-neutral here, turned into "(line N)" in the reader's language by the rule text (rules/convert.ts). */
const LINE_TOKEN_OPEN = '\u27e6line:';
const LINE_TOKEN_CLOSE = '\u27e7';
const listed = (names: readonly string[]): string => (names.length > MAX_LISTED ? `${names.slice(0, MAX_LISTED).join(', ')}, …` : names.join(', '));
const keyText = (parts: readonly string[]): string => (parts.length === 1 ? parts[0] : JSON.stringify(parts));
const keyShown = (parts: readonly string[]): string => parts.join(' / ');

interface ReadKey {
  text: string;
  parts: string[];
  /** positions (in the key) of the parts that are blank */
  blank: number[];
}
type KeyReadFn = (row: RawRow, columns: readonly number[]) => ReadKey;
/**
 * The reader of the key of a row of one sheet, the way the converter builds a sample ID from a key (keyPart, in THIS sheet's own context: its date1904, date formatting, decimal mark and the roles of
 * its columns): a serial and the same date written as text are one value, so are `1` and `1.0`. A part is blank when keyPart reads it as blank (an empty cell, NA ...). The parts are the normalised
 * values, which is also how they are shown.
 */
function keyReaderOf(input: ConvertSheetInput, sheet: RawSheet): KeyReadFn {
  const picked = new Set(input.sampleKey?.columns ?? []);
  const roleOf = (i: number): string => {
    const kind = input.mapping.columns.find((c) => c.index === i)?.role.kind ?? 'ignore';
    return kind === 'ignore' && picked.has(i) ? 'keyPart' : kind; // (convert() reads a picked ignored column as a key part)
  };
  const ctx = { prefix: '', sheet, decimalComma: input.file.decimalComma, date1904: input.file.date1904, roleOf };
  const order = new Map<number, ReturnType<typeof detectDayMonthOrder>>();
  return (row, columns) => {
    const parts = columns.map((c) => keyPart(ctx, row, c, order));
    const blank = parts.flatMap((p, i) => (p === '' ? [i] : []));
    return { text: keyText(parts), parts, blank };
  };
}

/** The join-key values of a results sheet (decision 6: joinInputs computes them first, F3). Rows with a blank key part have none. */
export function resultsKeys(results: ConvertSheetInput, keys: readonly JoinKeyPair[]): ReadonlySet<string> {
  const sheet = sheetOf(results);
  const out = new Set<string>();
  if (sheet === undefined) return out;
  const cols = keys.map((k) => k.results);
  const read = keyReaderOf(results, sheet);
  for (const row of sheet.rows) {
    const k = read(row, cols);
    if (k.blank.length === 0) out.add(k.text);
  }
  return out;
}

const isTimeOnly = (sheet: RawSheet, column: number): boolean => sheet.timeFormatted?.[column] === true || sheet.timeAll?.[column] === true;

/**
 * F2: a description cell in the results file's convention. Only a cell the two files read differently is changed: a text that reads as a number in its own file gets the results file's decimal
 * separator (the digits as written), and a date serial of a 1900/1904 workbook that differs from the results file's becomes the date it means. Anything else is lent verbatim (a time of day, and a text its own file did not read as a number: mergeSampleSheets lends that one blank and reports it when the results file would read it as one).
 */
export function lendCell(cell: RawCell, from: { file: ParsedFile; sheet: RawSheet; column: number }, to: ParsedFile): { cell: RawCell; rewritten: boolean } {
  const verbatim = { cell, rewritten: false };
  if (cell === null) return verbatim;
  if (typeof cell === 'number') {
    // a time of day (a fraction of a day) does not depend on the epoch: it is lent as it is
    if (from.file.date1904 !== to.date1904 && from.sheet.dateFormatted?.[from.column] === true && !isTimeOnly(from.sheet, from.column)) {
      try {
        return { cell: eventDateText(excelSerialToDate(cell, from.file.date1904, from.sheet.fractionShown?.[from.column] === true ? 'shown' : false)), rewritten: true };
      } catch {
        return verbatim; // a serial outside the calendar is lent as it is; the converter reports it where it reads the date
      }
    }
    return verbatim;
  }
  if (from.file.decimalComma !== to.decimalComma) {
    const token = cell.trim();
    if (parseNumber(token, from.file.decimalComma).status === 'ok') {
      const text = from.file.decimalComma ? token.replace(',', '.') : token.replace('.', ',');
      if (text !== cell) return { cell: text, rewritten: true };
    }
  }
  return verbatim;
}

/** What makes a column "the same quantity" in two sheets: its role and bounds, date part, hemisphere axis, depth direction and unit, and whether the cells are date-formatted. */
function descriptorOf(q: QuantityColumns, index: number): string {
  const col = q.mapping.columns.find((m) => m.index === index);
  const role = col?.role;
  const parts: (string | boolean)[] = [role?.kind ?? '?'];
  if (role?.kind === 'depth') parts.push(role.bound ?? '', role.positive, depthUnitOfHeader(col?.header ?? '', role.unit) ?? '');
  else if (role?.kind === 'datePart') parts.push(role.part);
  else if (role?.kind === 'hemisphere') parts.push(role.axis);
  parts.push(q.sheet.dateFormatted?.[index] === true);
  return JSON.stringify(parts);
}
const orderedByDescriptor = (q: QuantityColumns): { index: number; descriptor: string }[] =>
  q.columns.map((index) => ({ index, descriptor: descriptorOf(q, index) })).sort((a, b) => (a.descriptor < b.descriptor ? -1 : a.descriptor > b.descriptor ? 1 : a.index - b.index));

/** F4/F9: the two sides of one quantity use the same column structure. */
export function sameStructure(results: QuantityColumns, description: QuantityColumns): boolean {
  const a = orderedByDescriptor(results);
  const b = orderedByDescriptor(description);
  return a.length === b.length && a.every((x, i) => x.descriptor === b[i].descriptor);
}

/** The columns of the two sides that stand for each other, in the order of their descriptors (only meaningful when `sameStructure`). */
function pairColumns(results: QuantityColumns, description: QuantityColumns): [number, number][] {
  const b = orderedByDescriptor(description);
  return orderedByDescriptor(results).map((x, i): [number, number] => [x.index, b[i].index]);
}

/** One value of a cell for comparing two sides: the date a serial means, the number a text reads as, otherwise the trimmed text. */
function comparable(cell: RawCell, file: ParsedFile, sheet: RawSheet, column: number): string {
  if (typeof cell === 'number') {
    if (sheet.dateFormatted?.[column] === true && !isTimeOnly(sheet, column)) {
      try {
        return eventDateText(excelSerialToDate(cell, file.date1904, sheet.fractionShown?.[column] === true ? 'shown' : false));
      } catch {
        return String(cell);
      }
    }
    return String(cell);
  }
  const t = (cell ?? '').trim();
  const n = parseNumber(t, file.decimalComma);
  return n.status === 'ok' ? String(n.value) : t;
}
/** The same cell as the person sees it in the file, for the examples of a finding. */
const shown = (cell: RawCell, file: ParsedFile, sheet: RawSheet, column: number): string => (typeof cell === 'number' ? comparable(cell, file, sheet, column) : cellText(cell));

interface DescriptionGroup {
  parts: string[];
  rows: RawRow[];
  /** the distinct contents of its rows */
  distinct: number;
}

/** Appends " (2)", " (3)" … to a header that an earlier merged column already has. */
function uniqueHeaders(own: readonly string[], taken: string[]): string[] {
  const used = new Set(taken);
  const out: string[] = [];
  for (const h of own) {
    let name = h;
    for (let n = 2; used.has(name); n++) name = `${h} (${n})`;
    used.add(name);
    out.push(name);
  }
  return out;
}

/** A per-column flag array of the merged sheet: the results sheet's (false when absent) followed by the description sheet's, only when either sheet has one. */
function joinFlags(a: boolean[] | undefined, aw: number, b: boolean[] | undefined, bw: number): boolean[] | undefined {
  if (a === undefined && b === undefined) return undefined;
  const pad = (x: boolean[] | undefined, w: number): boolean[] => Array.from({ length: w }, (_, i) => x?.[i] === true);
  return [...pad(a, aw), ...pad(b, bw)];
}

/**
 * One value of a quantity as one side reads it, part by part (a date and its time, a latitude and its longitude, the top and the bottom of a depth). `parts` are what is compared ('' = this side gives
 * nothing for the part; '?text' = it gives a text that could not be read, which is never equal to anything); `text` is what the person sees; `cells` are what a resolved column holds for each part,
 * `originals` the cell as the side wrote it (the text the archive must keep when the resolved cell differs from it). A trailing part with no cell (the shape of a depth) is compared only.
 */
interface Reading {
  parts: string[];
  text: string;
  cells: RawCell[];
  originals: RawCell[];
  /** the columns of the sheet each part comes from (what is not written when the part is not taken) */
  partCols: number[][];
}
/** `read` = the row whose cells are read (the description row as lent, in the results file's conventions); `show` = the row as its own file holds it. */
type Reader = (read: RawRow, show: RawRow) => Reading;
type ReaderKind = 'date' | 'position' | 'depth' | 'trim' | 'number';

interface Slot {
  part: string;
  cell: RawCell;
  original: RawCell;
}
/** A part: the value the converter read (its `text` is what a resolved cell holds), or else the cell as written, marked unreadable so that it never passes for an equal or a blank one. */
function slot(read: number | string | undefined, raw: RawCell | undefined, text?: string, original?: RawCell): Slot {
  const t = cellText(raw);
  if (read !== undefined) return { part: String(read), cell: text ?? read, original: original ?? (t === '' ? null : raw ?? null) };
  return t === '' ? { part: '', cell: null, original: null } : { part: `?${t}`, cell: t, original: raw ?? null };
}
const reading = (slots: readonly Slot[], text: string, partCols: number[][], extra: string[] = []): Reading => ({ parts: [...slots.map((x) => x.part), ...extra], text, cells: slots.map((x) => x.cell), originals: slots.map((x) => x.original), partCols });
/** Does this side give anything for the quantity? */
const holds = (r: Reading): boolean => r.parts.some((x) => x !== '');
/** Two sides contradict each other when a part that both give differs; a part only one gives contradicts nothing. */
const contradicts = (a: Reading, b: Reading): boolean => a.parts.some((x, i) => x !== '' && (b.parts[i] ?? '') !== '' && x !== b.parts[i]);

/**
 * How one side of a quantity is read: with the converter's own readers (the date as `metaParser` reads it, the signed position, the depth in metres as `build.ts` reads it), a variable as a number,
 * the rest as trimmed text. The description is read as it is LENT (in the results file's conventions), so that a pair that only differs by a convention is no conflict.
 */
function makeReader(kind: ReaderKind, columns: readonly number[], mapping: SheetMapping, sheet: RawSheet, readFile: ParsedFile, showFile: ParsedFile, utcFile: ParsedFile): Reader {
  const own: SheetMapping = { sheet: mapping.sheet, columns: mapping.columns.filter((c) => columns.includes(c.index)) };
  const textOf = (row: RawRow): string => columns.map((c) => shown(row.cells[c] ?? null, showFile, sheet, c)).filter((t) => t !== '').join(' ');
  const rawOf = (row: RawRow): string => columns.map((c) => cellText(row.cells[c])).filter((t) => t !== '').join(' ');
  const collector = new Collector(readFile.fileName);
  // a number written into a resolved cell as the source wrote its digits, in the results file's decimal separator
  const local = (t: string | undefined): string | undefined => (t === undefined ? undefined : readFile.decimalComma ? t.replace('.', ',') : t);
  if (kind === 'date' || kind === 'position') {
    const specs = specsOf(own);
    const parse = metaParser(readFile, sheet, specs, collector, { whenUtc: isUtcBySource(utcFile, specs.when?.header) });
    const colOf = (k: string, axis?: string): number | undefined => own.columns.find((c) => c.role.kind === k && (axis === undefined || (c.role.kind === 'hemisphere' && c.role.axis === axis)))?.index;
    const lat = colOf('latitude');
    const lon = colOf('longitude');
    const latHemi = colOf('hemisphere', 'latitude');
    const lonHemi = colOf('hemisphere', 'longitude');
    const written = (rd: RawRow, c: number | undefined, hemi: number | undefined): RawCell => {
      if (c === undefined) return null;
      const v = cellText(rd.cells[c]);
      const h = hemi === undefined ? '' : cellText(rd.cells[hemi]);
      return v === '' ? null : h === '' ? (rd.cells[c] ?? null) : `${v} ${h}`;
    };
    return (rd, sh) => {
      const meta = parse(rd);
      if (kind === 'date') {
        const full = meta.datetime === undefined ? undefined : eventDateText(meta.datetime);
        // a date and its time of day are two parts; a range is one
        const at = full === undefined || full.includes('/') ? -1 : full.indexOf('T');
        const day = full === undefined ? undefined : at < 0 ? full : full.slice(0, at);
        const time = full !== undefined && at >= 0 ? full.slice(at + 1) : undefined;
        const first = slot(day, rawOf(rd));
        const second: Slot = time === undefined ? { part: '', cell: null, original: null } : { part: time, cell: time, original: null };
        return reading([first, second], textOf(sh), [own.columns.filter((c) => c.role.kind !== 'time').map((c) => c.index), own.columns.filter((c) => c.role.kind === 'time').map((c) => c.index)]);
      }
      const fixed = (v: number | undefined, d: number | undefined): string | undefined => (v === undefined ? undefined : local(d === undefined ? String(v) : v.toFixed(d)));
      const slotOf = (v: number | undefined, d: number | undefined, c: number | undefined, hemi: number | undefined): Slot => {
        const raw = written(rd, c, hemi);
        return { ...slot(v, raw === null ? undefined : raw, fixed(v, d)), ...(v !== undefined && raw !== null ? { original: raw } : {}) };
      };
      const defined = (...cs: (number | undefined)[]): number[] => cs.filter((c): c is number => c !== undefined);
      return reading([slotOf(meta.lat, meta.latDecimals, lat, latHemi), slotOf(meta.lon, meta.lonDecimals, lon, lonHemi)], textOf(sh), [defined(lat, latHemi), defined(lon, lonHemi)]);
    };
  }
  if (kind === 'depth') {
    const depths = own.columns.filter((c) => c.role.kind === 'depth');
    const byBound = (b: 'min' | 'max' | undefined): number | undefined => depths.find((c) => c.role.kind === 'depth' && c.role.bound === b)?.index;
    const plain = byBound(undefined);
    const minCol = byBound('min') ?? plain;
    const maxCol = byBound('max') ?? plain;
    const defined = (...cs: (number | undefined)[]): number[] => cs.filter((c): c is number => c !== undefined);
    const read = depthReader(colsOf(own, sheet.header), readFile.decimalComma, collector, sheet.name);
    return (rd, sh) => {
      const d = read(rd);
      const slots = [
        slot(d.min, minCol === undefined ? undefined : rd.cells[minCol], local(d.minText), d.verbatim?.min),
        slot(d.max, maxCol === undefined ? undefined : rd.cells[maxCol], local(d.maxText), d.verbatim?.max),
      ];
      // a single depth and a top and bottom are different things: they are never filled from each other
      return reading(slots, textOf(sh), [defined(minCol), defined(maxCol)], slots.some((x) => x.part !== '') ? [plain !== undefined ? 'point' : 'range'] : []);
    };
  }
  if (kind === 'number') {
    const c = columns[0];
    return (rd, sh) => {
      const cell = rd.cells[c] ?? null;
      return { parts: [isBlankCell(cell) ? '' : comparable(cell, readFile, sheet, c)], text: textOf(sh), cells: [cell], originals: [cell], partCols: [[c]] };
    };
  }
  return (rd, sh) => {
    const t = rawOf(rd);
    return { parts: [t], text: textOf(sh), cells: columns.map((c) => rd.cells[c] ?? null), originals: columns.map((c) => rd.cells[c] ?? null), partCols: columns.map((c) => [c]) };
  };
}

/** What a quantity both sheets have is compared on: its two sides' columns, how each side is read, and (when the structures differ) the columns the merge writes for it. */
interface Quantity {
  group: string;
  kind: ConflictGroup['quantity'];
  label: string;
  resCols: readonly number[];
  desCols: readonly number[];
  /** the columns that stand for each other (same structure only) */
  pairs: [number, number][];
  /** other structures: the merge writes these columns (F4) when any row takes the description */
  resolved?: { headers: string[]; roles: ColumnRole[]; slots: number[]; /** a date and its time of day make one cell */ pack?: boolean };
  readRes: Reader;
  readDes: Reader;
  entries: Map<string, ConflictEntry>;
  /** the rows that matter to it: every row for a resolved one, the rows with a difference otherwise */
  rows: QuantityRow[];
}
interface QuantityRow {
  cells: RawCell[];
  line: number;
  rr: Reading;
  dr?: Reading;
  lent?: RawRow;
  lentCells?: RawCell[];
  entry?: ConflictEntry;
}

const roleUnit = (r: ColumnRole): string => ((r as { unit?: string }).unit ?? '').trim();
const EMPTY: Reading = { parts: [], text: '', cells: [], originals: [], partCols: [] };

/**
 * The merge after the person confirmed the join: the description row of each results row is attached to it by key. The merged sheet keeps the results sheet's NAME (so event IDs and the key prefix
 * do not change) and its row lines; the description columns follow the results columns. Nothing is lent for a key that has several different description rows, for a row with a blank key part or
 * for a sample the description lacks; each of these is a finding. A quantity both sheets have stays ONE column (the results one) when the two sides use the same column structure: a blank results cell
 * is filled from the description (said), a value that differs (after both are read the converter's way) forms one group per quantity that blocks until it is decided, for all, per sample or per pair of
 * values. In another structure (a Date against Year/Month/Day, one depth against top and bottom, another depth unit, a signed latitude against latitude and hemisphere) the merge writes resolved columns
 * for it when any row takes the description. Each lent cell remembers its description line, and the original of a cell rewritten into the results file's convention. The value not chosen is listed
 * in `info.notChosen` with both lines.
 */
export function mergeSampleSheets(decl: SampleJoinDecl): MergeResult {
  const { results, description, keys } = decl;
  const resSheet = sheetOf(results);
  const desSheet = sheetOf(description);
  if (resSheet === undefined || desSheet === undefined) throw new Error('mergeSampleSheets: a sheet of the join is not in its file');
  const resKeyCols = keys.map((k) => k.results);
  const desKeyCols = keys.map((k) => k.description);
  const rw = resSheet.header.length;
  const dw = desSheet.header.length;
  const resFile = results.file.fileName;
  const desFile = description.file.fileName;
  const header = (sheet: RawSheet, i: number): string => sheet.header[i] ?? '';

  const readDescriptionKey = keyReaderOf(description, desSheet);
  const readResultsKey = keyReaderOf(results, resSheet);

  /* --- the description: its rows by key --- */
  const groups = new Map<string, DescriptionGroup>();
  const noKeyRows: RawRow[] = [];
  const noKeyColumns = new Set<number>();
  for (const row of desSheet.rows) {
    if (row.cells.every(emptyCell)) continue; // nothing in it to lend or to lose
    const k = readDescriptionKey(row, desKeyCols);
    if (k.blank.length > 0) {
      noKeyRows.push(row);
      for (const i of k.blank) noKeyColumns.add(desKeyCols[i]);
      continue;
    }
    const g = groups.get(k.text) ?? { parts: k.parts, rows: [], distinct: 0 };
    g.rows.push(row);
    groups.set(k.text, g);
  }
  const contents = (row: RawRow): string => JSON.stringify(Array.from({ length: dw }, (_, i) => cellText(row.cells[i])));
  for (const g of groups.values()) g.distinct = new Set(g.rows.map(contents)).size;
  const ambiguousKeys = new Set([...groups].filter(([, g]) => g.distinct > 1).map(([text]) => text));
  const sameAs = new Map<number, number>();
  for (const [text, g] of groups) if (!ambiguousKeys.has(text)) for (const r of g.rows.slice(1)) sameAs.set(r.line, g.rows[0].line);

  /* --- the shared quantities --- */
  const resKeySet = new Set(resKeyCols);
  const desKeySet = new Set(desKeyCols);
  const columnsOf = (mapping: SheetMapping, skip: Set<number>, pick: (r: ColumnRole) => boolean): number[] => mapping.columns.filter((c) => !skip.has(c.index) && pick(c.role)).map((c) => c.index);
  const sideOf = (input: ConvertSheetInput, sheet: RawSheet, columns: number[]): QuantityColumns => ({ file: input.file, sheet, mapping: input.mapping, columns });
  const readerOf = (kind: ReaderKind, side: JoinSide, columns: number[]): Reader =>
    side === 'results'
      ? makeReader(kind, columns, results.mapping, resSheet, results.file, results.file, results.file)
      : makeReader(kind, columns, description.mapping, desSheet, results.file, description.file, description.file);
  const labelOf = (rc: readonly number[], dc: readonly number[]): string => [...new Set([...rc.map((c) => header(resSheet, c)), ...dc.map((c) => header(desSheet, c))])].join(', ');
  const quantities: Quantity[] = [];
  const unmerged: { kind: string; description: readonly number[]; results: readonly number[]; /** the two units that cannot be compared (a quantity in two units) */ units?: { results: string; description: string } }[] = [];
  const unitOf = (mapping: SheetMapping, sheet: RawSheet, cols: readonly number[]): string => {
    const units = cols.map((c) => {
      const role = mapping.columns.find((m) => m.index === c)?.role;
      const stated = role === undefined ? '' : roleUnit(role);
      return stated !== '' ? stated : role?.kind === 'depth' ? (depthUnitOfHeader(header(sheet, c)) ?? '') : '';
    });
    return [...new Set(units.filter((u) => u !== ''))].join('/') || '–';
  };
  const addQuantity = (group: string, kind: Quantity['kind'], rk: ReaderKind, rc: number[], dc: number[], pairs: [number, number][], resolved?: Quantity['resolved']): void => {
    quantities.push({ group, kind, label: labelOf(rc, dc), resCols: rc, desCols: dc, pairs, ...(resolved === undefined ? {} : { resolved }), readRes: readerOf(rk, 'results', rc), readDes: readerOf(rk, 'description', dc), entries: new Map(), rows: [] });
  };
  const hasRole = (cols: number[], mapping: SheetMapping, kinds: string[]): boolean => cols.some((c) => kinds.includes(mapping.columns.find((m) => m.index === c)?.role.kind ?? ''));
  for (const kind of ['date', 'position', 'depth'] as const) {
    const rc = columnsOf(results.mapping, resKeySet, (r) => QUANTITY_OF[r.kind] === kind);
    const dc = columnsOf(description.mapping, desKeySet, (r) => QUANTITY_OF[r.kind] === kind);
    if (rc.length === 0 || dc.length === 0) continue;
    const res = sideOf(results, resSheet, rc);
    const des = sideOf(description, desSheet, dc);
    if (sameStructure(res, des)) {
      addQuantity(kind, kind, kind, rc, dc, pairColumns(res, des));
      continue;
    }
    // a depth in a unit the converter does not convert (cm, mm, yards …) blocks there on its own (CONV-DEPTH-UNIT): it is no value in metres to compare or to write, so it stays an undecidable difference until the unit is stated
    const unconvertible = (mapping: SheetMapping, sheet: RawSheet, cols: number[]): boolean =>
      kind === 'depth' &&
      cols.some((c) => {
        const m = mapping.columns.find((x) => x.index === c);
        const unit = m?.role.kind === 'depth' && m.role.unit !== undefined && m.role.unit.trim() !== '' ? m.role.unit : depthUnitOfHeader(header(sheet, c));
        return unit !== undefined && !isMetreUnit(unit) && depthUnitFactor(unit) === undefined;
      });
    if (unconvertible(results.mapping, resSheet, rc) || unconvertible(description.mapping, desSheet, dc)) {
      unmerged.push({ kind, description: dc, results: rc, units: { results: unitOf(results.mapping, resSheet, rc), description: unitOf(description.mapping, desSheet, dc) } });
      continue;
    }
    const either = (kinds: string[]): boolean => hasRole(rc, results.mapping, kinds) || hasRole(dc, description.mapping, kinds);
    const resolved: Quantity['resolved'] =
      kind === 'date'
        ? { headers: ['Date (merged)'], roles: [{ kind: 'datetime' }], slots: [0], pack: true }
        : kind === 'depth'
          ? { headers: ['Depth min (merged)', 'Depth max (merged)'], roles: [{ kind: 'depth', positive: 'down', bound: 'min', unit: 'm' }, { kind: 'depth', positive: 'down', bound: 'max', unit: 'm' }], slots: [0, 1] }
          : {
              headers: ['Latitude (merged)', 'Longitude (merged)'].filter((_, i) => either(i === 0 ? ['latitude'] : ['longitude'])),
              roles: ([{ kind: 'latitude' }, { kind: 'longitude' }] as ColumnRole[]).filter((_, i) => either(i === 0 ? ['latitude'] : ['longitude'])),
              slots: [0, 1].filter((i) => either(i === 0 ? ['latitude'] : ['longitude'])),
            };
    addQuantity(kind, kind, kind, rc, dc, [], resolved);
  }
  const textQuantity = (group: string, kind: Quantity['kind'], pick: (r: ColumnRole) => boolean, what: string): void => {
    const rc = columnsOf(results.mapping, resKeySet, pick);
    const dc = columnsOf(description.mapping, desKeySet, pick);
    if (rc.length === 0 || dc.length === 0) return;
    if (rc.length === 1 && dc.length === 1) addQuantity(group, kind, 'trim', rc, dc, [[rc[0], dc[0]]]);
    else if (sameStructure(sideOf(results, resSheet, rc), sideOf(description, desSheet, dc))) addQuantity(group, kind, 'trim', rc, dc, pairColumns(sideOf(results, resSheet, rc), sideOf(description, desSheet, dc)));
    else unmerged.push({ kind: what, description: dc, results: rc });
  };
  textQuantity('station', 'station', (r) => r.kind === 'station', 'station');
  textQuantity('cruise', 'cruise', (r) => r.kind === 'cruise', 'cruise');
  textQuantity('r.sampleId', 'other', (r) => r.kind === 'sampleId', 'sampleId');
  // every other role the two sheets share is one quantity too (never ignore or keyPart, which say nothing); a unit-carrying role in two units cannot be exchanged as text, so it blocks instead of becoming two columns of one role
  const taken = new Set<string>(['ignore', 'keyPart', 'variable', ...Object.keys(QUANTITY_OF)]);
  const otherKinds = new Set(results.mapping.columns.filter((c) => !resKeySet.has(c.index) && !taken.has(c.role.kind)).map((c) => c.role.kind));
  for (const kind of otherKinds) {
    const pick = (r: ColumnRole): boolean => r.kind === kind;
    const rc = columnsOf(results.mapping, resKeySet, pick);
    const dc = columnsOf(description.mapping, desKeySet, pick);
    if (dc.length === 0) continue;
    const units = (m: SheetMapping, cols: number[]): string => [...new Set(cols.map((c) => roleUnit(m.columns.find((x) => x.index === c)!.role)))].sort().join('|');
    if (rc.length > 0 && units(results.mapping, rc) !== units(description.mapping, dc)) unmerged.push({ kind, description: dc, results: rc, units: { results: unitOf(results.mapping, resSheet, rc), description: unitOf(description.mapping, desSheet, dc) } });
    else textQuantity(`r.${kind}`, 'other', pick, kind);
  }
  // a measured variable of the same name and unit is the same quantity; a header alone is not
  const variablesOf = (mapping: SheetMapping, skip: Set<number>): Map<string, number[]> => {
    const out = new Map<string, number[]>();
    for (const c of mapping.columns) {
      if (skip.has(c.index) || c.role.kind !== 'variable') continue;
      const id = `${c.role.variable}\u0000${(c.role.unit ?? '').trim()}`;
      out.set(id, [...(out.get(id) ?? []), c.index]);
    }
    return out;
  };
  const desVariables = variablesOf(description.mapping, desKeySet);
  for (const [id, rc] of variablesOf(results.mapping, resKeySet)) {
    const dc = desVariables.get(id);
    if (rc.length === 1 && dc?.length === 1) addQuantity(`v.${shortHash(id)}`, 'variable', 'number', rc, dc, [[rc[0], dc[0]]]);
  }
  const consumed = new Set<number>(desKeyCols.map((c) => rw + c));
  for (const q of quantities) for (const [, d] of q.pairs) consumed.add(rw + d);
  const resolvedQuantities = quantities.filter((q) => q.resolved !== undefined);

  /* --- the rows --- */
  const lentFrom = new Map<number, number>();
  const descriptionOnly = new Map<number, number>();
  const takenFromDescription = new Map<string, number>();
  const rewritten = new Map<string, RawCell>();
  const resultsLines = new Set<number>();
  const resultsKeySeen = new Set<string>();
  const unmatched = new Map<string, { parts: string[]; lines: number[] }>();
  const blankKeyRows: number[] = [];
  const blankKeyColumns = new Set<number>();
  const ambiguousUsed = new Set<string>();
  const filled = new Map<string, { order: number; name: string; count: number; lines: number[] }>();
  /** `space` keeps the columns of the results sheet and the quantities written by the merge apart */
  const fillKey = (space: 'c' | 'q', order: number): string => `${space}:${order}`;
  const unitClashLines = new Map<string, Set<number>>();
  let lastLine = resSheet.headerLine;
  /** A description-only line is counted but not listed: it is a line of neither file (the sample is named by CONV-JOIN-DESCRIPTION-ONLY). */
  const countFilled = (space: 'c' | 'q', order: number, name: string, line: number, onlyDescribed = false): void => {
    const f = filled.get(fillKey(space, order)) ?? { order: (space === 'c' ? 0 : 1e9) + order, name, count: 0, lines: [] };
    f.count++;
    // (no membership test on a list that grows with every filled row: the finding builder de-duplicates and sorts the lines)
    if (!onlyDescribed) f.lines.push(line);
    filled.set(fillKey(space, order), f);
  };

  const entrySamples = new Map<object, Set<string>>();
  const turnsNumeric = new Map<number, { lines: Set<number>; value: string }>();
  const lentBlank = new Set<string>();
  const lend = (descRow: RawRow, line: number): RawCell[] =>
    Array.from({ length: dw }, (_, k) => {
      const descLine = descRow.line;
      const original = descRow.cells[k] ?? null;
      const got = lendCell(original, { file: description.file, sheet: desSheet, column: k }, results.file);
      if (got.rewritten) rewritten.set(`${line}:${rw + k}`, original);
      else if (typeof original === 'string' && description.file.decimalComma !== results.file.decimalComma && parseNumber(original, description.file.decimalComma).status !== 'ok' && parseNumber(original, results.file.decimalComma).status === 'ok') {
        // its own file did not read this text as a number, the results file would: it would be written as a number here, so it is not lent (below) and the person hears of it (the finding their own file would have given)
        const n = turnsNumeric.get(k) ?? { lines: new Set<number>(), value: original.trim() };
        n.lines.add(descLine);
        turnsNumeric.set(k, n);
        // the own-file outcome: nothing is written for it. The cell is lent blank and the text stays in `rewritten`, where the not-written list reads it.
        rewritten.set(`${line}:${rw + k}`, original);
        lentBlank.add(`${line}:${rw + k}`);
        return null;
      }
      return got.cell;
    });

  /** The sample a results row is of, for the entries of a conflict: the code of its sample column, else its key. */
  const sampleCol = results.mapping.columns.find((c) => c.role.kind === 'sampleId')?.index;
  const sampleOf = (row: RawRow, key: ReadKey): string => (sampleCol !== undefined && cellText(row.cells[sampleCol]) !== '' ? cellText(row.cells[sampleCol]) : keyShown(key.parts));

  const markUnmerged = (line: number, lent: RawRow): void => {
    for (const u of unmerged) {
      if (!u.description.some((c) => !emptyCell(lent.cells[c]))) continue;
      const lines = unitClashLines.get(u.kind) ?? new Set<number>();
      lines.add(line);
      unitClashLines.set(u.kind, lines);
    }
  };

  const rows: RawRow[] = resSheet.rows.map((row) => {
    resultsLines.add(row.line);
    if (row.line > lastLine) lastLine = row.line;
    const cells: RawCell[] = Array.from({ length: rw }, (_, i) => row.cells[i] ?? null);
    const k = readResultsKey(row, resKeyCols);
    let lent: RawRow | undefined;
    if (k.blank.length > 0) {
      blankKeyRows.push(row.line);
      for (const i of k.blank) blankKeyColumns.add(resKeyCols[i]);
    } else {
      resultsKeySeen.add(k.text);
      const g = groups.get(k.text);
      if (g === undefined) {
        const u = unmatched.get(k.text) ?? { parts: k.parts, lines: [] };
        u.lines.push(row.line);
        unmatched.set(k.text, u);
      } else if (ambiguousKeys.has(k.text)) ambiguousUsed.add(k.text);
      else lent = g.rows[0];
    }
    if (lent === undefined) {
      cells.push(...Array.from({ length: dw }, () => null));
      for (const q of resolvedQuantities) q.rows.push({ cells, line: row.line, rr: q.readRes(row, row) });
      return { line: row.line, cells, fieldCount: cells.length };
    }
    lentFrom.set(row.line, lent.line);
    const lentCells = lend(lent, row.line);
    cells.push(...lentCells);
    const lentRow: RawRow = { line: lent.line, cells: lentCells, fieldCount: dw };
    for (const q of quantities) {
      const rr = q.readRes(row, row);
      const dr = q.readDes(lentRow, lent);
      const at: QuantityRow = { cells, line: row.line, rr, dr, lent, lentCells };
      if (contradicts(rr, dr)) {
        // F6: one entry per (join-key value, results value)
        const id = shortHash(`${k.text}\u0000${rr.text}`);
        const entry = q.entries.get(id) ?? { id, key: k.text, descriptionLine: lent.line, descriptionText: dr.text, resultsText: rr.text, resultsLines: [], samples: [] };
        // (a results row is read once per quantity, so its line is new to the entry; the samples are de-duplicated through a Set, not a scan of the growing list)
        entry.resultsLines.push(row.line);
        const sample = sampleOf(row, k);
        const seen = entrySamples.get(entry) ?? entrySamples.set(entry, new Set<string>()).get(entry)!;
        if (!seen.has(sample)) {
          seen.add(sample);
          entry.samples.push(sample);
        }
        q.entries.set(id, entry);
        at.entry = entry;
      } else if (q.resolved !== undefined) {
        // a part only the description gives (a time beside a date, a longitude beside a latitude) is filled, as a blank cell is
        if (dr.parts.some((x, i) => i < dr.cells.length && x !== '' && (rr.parts[i] ?? '') === '')) countFilled('q', quantities.indexOf(q), q.label, row.line);
      } else {
        for (const [rc, dc] of q.pairs) {
          const have = cells[rc];
          const offered = lent.cells[dc] ?? null;
          if (emptyCell(offered) || lentCells[dc] === null || !emptyCell(have)) continue; // nothing offered, or not lent (reported above), or the results sheet has its own
          cells[rc] = lentCells[dc];
          takenFromDescription.set(`${row.line}:${rc}`, lent.line);
          const original = rewritten.get(`${row.line}:${rw + dc}`);
          if (original !== undefined) rewritten.set(`${row.line}:${rc}`, original);
          countFilled('c', rc, header(resSheet, rc), row.line);
        }
      }
      if (q.resolved !== undefined || at.entry !== undefined) q.rows.push(at);
    }
    // a quantity both sheets have in a column structure that cannot be compared: what the description holds in it cannot reach the archive until the columns agree
    markUnmerged(row.line, lent);
    return { line: row.line, cells, fieldCount: cells.length };
  });

  /* --- description-only samples --- */
  const held = decl.heldElsewhere ?? new Set<string>();
  const addedKeys: string[] = [];
  const ambiguousAdded = new Set<string>();
  // no key of the results sheet is in the description sheet: the key columns or the codes do not agree (a letter O for a zero ...). Every sample would be results-only and every description row description-only, which would look valid.
  const noMatch = resultsKeySeen.size > 0 && ![...resultsKeySeen].some((text) => groups.has(text));
  if (decl.appendDescriptionOnly && !noMatch) {
    for (const [text, g] of groups) {
      if (resultsKeySeen.has(text) || held.has(text)) continue;
      if (ambiguousKeys.has(text)) {
        ambiguousAdded.add(text);
        continue;
      }
      const line = ++lastLine;
      const row = g.rows[0];
      const cells: RawCell[] = Array.from({ length: rw }, () => null);
      const lentCells = lend(row, line);
      keys.forEach((pair, i) => {
        // the key cell is written as the key reads it (an ISO date for a serial or a date text), so that the ID of this sample is the one a results row of the same sample would get
        const lentCell = lentCells[pair.description];
        const normal = g.parts[i];
        if (normal !== cellText(lentCell)) {
          cells[pair.results] = normal;
          rewritten.set(`${line}:${pair.results}`, rewritten.get(`${line}:${rw + pair.description}`) ?? lentCell);
          return;
        }
        cells[pair.results] = lentCell;
        const original = rewritten.get(`${line}:${rw + pair.description}`);
        if (original !== undefined) rewritten.set(`${line}:${pair.results}`, original);
      });
      markUnmerged(line, row);
      const lentRow: RawRow = { line: row.line, cells: lentCells, fieldCount: dw };
      const full: RawCell[] = [];
      for (const q of quantities) {
        if (q.resolved !== undefined) {
          const dr = q.readDes(lentRow, row);
          const at: QuantityRow = { cells: full, line, rr: EMPTY, dr, lent: row, lentCells };
          if (holds(dr)) countFilled('q', quantities.indexOf(q), q.label, line, true);
          q.rows.push(at);
          continue;
        }
        for (const [rc, dc] of q.pairs) {
          if (!emptyCell(cells[rc])) continue;
          cells[rc] = lentCells[dc];
          if (!emptyCell(row.cells[dc]) && lentCells[dc] !== null) countFilled('c', rc, header(resSheet, rc), line, true);
        }
      }
      full.push(...cells, ...lentCells);
      rows.push({ line, cells: full, fieldCount: full.length });
      descriptionOnly.set(line, row.line);
      addedKeys.push(keyShown(g.parts));
    }
  }

  /* --- the groups, and the person's answers to them --- */
  const conflicts: ConflictGroup[] = [];
  for (const q of quantities) {
    if (q.entries.size === 0) continue;
    const entries = [...q.entries.values()];
    const count = entries.reduce((n, e) => n + e.samples.length, 0);
    const g: ConflictGroup = { group: q.group, quantity: q.kind, label: q.label, resultsColumns: q.resCols.map((c) => header(resSheet, c)), descriptionColumns: q.desCols.map((c) => header(desSheet, c)), count, entries };
    const answer = decl.conflicts.find((a) => a.group === q.group);
    // F5: an answer holds only for the group it was given for
    if (answer !== undefined && answer.count === count) {
      g.answer = answer;
      for (const e of entries) {
        const take = answer.exceptions.find((x) => x.entry === e.id)?.take ?? answer.pairs?.find((p) => p.pair[0] === e.descriptionText && p.pair[1] === e.resultsText)?.take ?? answer.take;
        if (take !== undefined) e.take = take;
      }
    }
    conflicts.push(g);
  }

  /* --- the value not chosen is kept, with both lines (P7): exactly the values that are not written --- */
  const notChosen: SampleJoinInfo['notChosen'][number][] = [];

  /* --- the chosen side is written into the results columns (same structure) --- */
  // only what is contradicted is replaced: a cell the chosen side leaves blank keeps what the other side gave (a date and its time are one thing: the chosen date takes its own time of day, or none)
  for (const q of quantities) {
    if (q.resolved !== undefined) continue;
    for (const at of q.rows) {
      if (at.entry === undefined || at.entry.take === undefined || at.lent === undefined || at.lentCells === undefined) continue;
      for (const [rc, dc] of q.pairs) {
        const offered = at.lentCells[dc];
        const description = at.entry.take === 'description';
        const writes = description ? !(emptyCell(offered) && q.kind !== 'date') : q.kind !== 'date' && emptyCell(at.cells[rc]) && !emptyCell(at.lent.cells[dc]) && offered !== null;
        if (writes) {
          if (description && !emptyCell(at.cells[rc])) notChosen.push({ side: 'results', line: at.line, column: rc, otherLine: at.lent.line, group: q.group, chosen: at.dr?.text ?? '' });
          at.cells[rc] = offered;
          takenFromDescription.set(`${at.line}:${rc}`, at.lent.line);
          const original = rewritten.get(`${at.line}:${rw + dc}`);
          if (original !== undefined) rewritten.set(`${at.line}:${rc}`, original);
          else rewritten.delete(`${at.line}:${rc}`);
          if (!description) countFilled('c', rc, header(resSheet, rc), at.line);
        } else if (!description && !emptyCell(at.lent.cells[dc])) {
          notChosen.push({ side: 'description', line: at.lent.line, column: rw + dc, otherLine: at.line, group: q.group, chosen: at.rr.text });
        }
      }
    }
  }

  /* --- the merged header, and the columns written for a quantity of another structure (F4) --- */
  const ownHeaders = Array.from({ length: dw }, (_, i) => header(desSheet, i));
  const mergedHeader = [...resSheet.header, ...uniqueHeaders(ownHeaders, resSheet.header)];
  const columns: { side: JoinSide | 'resolved'; index: number; header: string; from?: readonly number[] }[] = [
    ...resSheet.header.map((h, i) => ({ side: 'results' as const, index: i, header: h })),
    ...ownHeaders.map((h, i) => ({ side: 'description' as const, index: i, header: h })),
  ];
  const resolvedColumns: { index: number; header: string; role: ColumnRole }[] = [];
  const ignoredResults = new Set<number>();
  for (const q of resolvedQuantities) {
    for (const d of q.desCols) consumed.add(rw + d);
    const spec = q.resolved!;
    // per row and part: the chosen side's, or the other side's where the chosen side gives nothing (nothing contradicted it); a date and its time of day go together when the dates were contradicted
    const plans = q.rows.map((at) => {
      const take = at.entry?.take;
      const primaryDescription = take === 'description';
      const n = at.rr.cells.length > 0 ? at.rr.cells.length : (at.dr?.cells.length ?? 0);
      // a date and its time go together when the dates were contradicted; a single depth and a top and bottom are different things, so the chosen side is written as it is, nothing from the other
      const shapes = [at.rr.parts[n] ?? '', at.dr?.parts[n] ?? ''];
      const coupled = take !== undefined && (q.kind === 'date' || (shapes[0] !== '' && shapes[1] !== '' && shapes[0] !== shapes[1]));
      const cells: RawCell[] = [];
      const originals: RawCell[] = [];
      const fromDescription: boolean[] = [];
      const usedDescription: boolean[] = [];
      for (let i = 0; i < n; i++) {
        const rp = at.rr.parts[i] ?? '';
        const dp = at.dr?.parts[i] ?? '';
        const useDescription = at.dr === undefined ? false : coupled ? primaryDescription : primaryDescription ? dp !== '' || rp === '' : rp === '' && dp !== '';
        const side = useDescription ? at.dr! : at.rr;
        cells.push(side.cells[i] ?? null);
        originals.push(side.originals[i] ?? null);
        fromDescription.push(useDescription && dp !== '');
        usedDescription.push(useDescription);
      }
      // exactly what is not written: the other side's columns whose parts were not taken, unless a part of the same column was
      if (take !== undefined && at.dr !== undefined && at.lent !== undefined) {
        const loserIsResults = primaryDescription;
        const loser = loserIsResults ? at.rr : at.dr;
        const lost = new Set<number>();
        const kept = new Set<number>();
        for (let i = 0; i < n; i++) {
          if ((loser.parts[i] ?? '') === '') continue;
          for (const c of loser.partCols[i] ?? []) ((loserIsResults ? !usedDescription[i] : usedDescription[i]) ? kept : lost).add(c);
        }
        for (const c of lost) {
          if (kept.has(c)) continue;
          if (loserIsResults ? !emptyCell(at.cells[c]) : !emptyCell(at.lent.cells[c])) {
            notChosen.push(loserIsResults ? { side: 'results', line: at.line, column: c, otherLine: at.lent.line, group: q.group, chosen: at.dr.text } : { side: 'description', line: at.lent.line, column: rw + c, otherLine: at.line, group: q.group, chosen: at.rr.text });
          }
        }
      }
      if (spec.pack === true) {
        const day = cells[0];
        const joined = day === null || day === undefined ? (cells[1] ?? null) : cells[1] === null || cells[1] === undefined ? day : `${day}T${cells[1]}`;
        return { at, cells: [joined], originals: [originals[0] ?? originals[1] ?? null], fromDescription: [fromDescription.some(Boolean)], filledByChoice: take === 'results' && fromDescription.some(Boolean) };
      }
      return { at, cells, originals, fromDescription, filledByChoice: take === 'results' && fromDescription.some(Boolean) };
    });
    if (!plans.some((x) => x.fromDescription.some(Boolean))) continue; // the results columns keep carrying the quantity: every value of the description is equal to theirs, blank, or kept in notChosen
    const names = uniqueHeaders(spec.headers, mergedHeader);
    const base = mergedHeader.length;
    mergedHeader.push(...names);
    names.forEach((name, i) => {
      columns.push({ side: 'resolved', index: base + i, header: name, from: q.desCols });
      resolvedColumns.push({ index: base + i, header: name, role: spec.roles[i] });
    });
    for (const c of q.resCols) {
      consumed.add(c);
      ignoredResults.add(c);
    }
    for (const plan of plans) {
      const { at } = plan;
      if (plan.filledByChoice) countFilled('q', quantities.indexOf(q), q.label, at.line);
      spec.slots.forEach((slotIndex, i) => {
        const cell = plan.cells[slotIndex] ?? null;
        at.cells[base + i] = cell;
        if (plan.fromDescription[slotIndex] === true && cell !== null && at.lent !== undefined) takenFromDescription.set(`${at.line}:${base + i}`, at.lent.line);
        // the text the side wrote, when the cell written is not it ("33 ft", "03.05.2021", "61.1" beside an "S")
        const original = plan.originals[slotIndex] ?? null;
        if (cell !== null && original !== null && String(original) !== String(cell)) rewritten.set(`${at.line}:${base + i}`, original);
      });
    }
  }
  for (const r of rows) {
    while (r.cells.length < mergedHeader.length) r.cells.push(null);
    r.fieldCount = r.cells.length;
  }
  const mapping: SheetMapping = {
    sheet: results.mapping.sheet,
    columns: [
      ...results.mapping.columns.map((c) => (ignoredResults.has(c.index) ? { ...c, role: { kind: 'ignore' } as ColumnRole } : c)),
      ...description.mapping.columns.map((c) => ({ index: rw + c.index, header: mergedHeader[rw + c.index] ?? c.header, role: consumed.has(rw + c.index) ? ({ kind: 'ignore' } as ColumnRole) : c.role })),
      ...resolvedColumns,
    ],
  };

  /* --- the findings --- */
  const findings: Finding[] = [];
  const ambiguousAll = [...groups].filter(([text]) => ambiguousUsed.has(text) || ambiguousAdded.has(text));
  const ambiguousLines = ambiguousAll.flatMap(([, g]) => g.rows.map((r) => r.line)).sort((a, b) => a - b);
  if (ambiguousAll.length > 0) {
    findings.push(
      makeConvertFinding('CONV-JOIN-AMBIGUOUS', {
        file: desFile,
        sheet: desSheet.name,
        lines: ambiguousLines,
        params: { count: ambiguousAll.length, keys: listed(ambiguousAll.map(([, g]) => keyShown(g.parts))), description: desSheet.name },
      }),
    );
  }
  const noKey = noKeyRows.map((r) => r.line).sort((a, b) => a - b);
  if (noKey.length > 0) {
    findings.push(
      makeConvertFinding('CONV-JOIN-KEY-BLANK', {
        file: desFile,
        sheet: desSheet.name,
        lines: noKey,
        params: { count: noKey.length, columns: [...noKeyColumns].sort((a, b) => a - b).map((c) => header(desSheet, c)).join(', '), side: 'description' },
      }),
    );
  }
  // results samples without a description, and results rows whose key has a blank part (they cannot be looked up, so they are in the same set: the answer "only what the results sheet says" covers both)
  const withoutDescription = unmatched.size + blankKeyRows.length;
  const answered = !noMatch && withoutDescription > 0 && decl.resultsOnly === withoutDescription;
  if (blankKeyRows.length > 0 && !answered) {
    findings.push(
      makeConvertFinding('CONV-JOIN-KEY-BLANK', {
        file: resFile,
        sheet: results.sheet,
        lines: blankKeyRows,
        params: { count: blankKeyRows.length, columns: [...blankKeyColumns].sort((a, b) => a - b).map((c) => header(resSheet, c)).join(', '), side: 'results' },
      }),
    );
  }
  if (noMatch) {
    const resultsExamples = [...unmatched.values()].slice(0, MAX_KEY_EXAMPLES).map((u) => keyShown(u.parts));
    const descriptionExamples = [...groups.values()].slice(0, MAX_KEY_EXAMPLES).map((g) => keyShown(g.parts));
    findings.push(
      makeConvertFinding('CONV-JOIN-NO-MATCH', {
        file: resFile,
        sheet: results.sheet,
        lines: [...unmatched.values()].flatMap((u) => u.lines).sort((a, b) => a - b),
        params: {
          description: desSheet.name,
          descriptionFile: desFile,
          resultsColumns: resKeyCols.map((c) => header(resSheet, c)).join(' + '),
          descriptionColumns: desKeyCols.map((c) => header(desSheet, c)).join(' + '),
          resultsExamples: resultsExamples.join(', '),
          descriptionExamples: descriptionExamples.join(', '),
        },
      }),
    );
  } else if (withoutDescription > 0) {
    const names = [...[...unmatched.values()].map((u) => keyShown(u.parts)), ...blankKeyRows.map((l) => `${LINE_TOKEN_OPEN}${l}${LINE_TOKEN_CLOSE}`)];
    const lines = [...[...unmatched.values()].flatMap((u) => u.lines), ...blankKeyRows];
    findings.push(
      answered
        ? makeConvertFinding('CONV-JOIN-RESULTS-ONLY', {
            file: resFile,
            sheet: results.sheet,
            lines,
            params: { count: withoutDescription, samples: listed(names), ...(decl.resultsOnlyFromFile === true ? { fromFile: 'yes' } : {}) },
          })
        : makeConvertFinding('CONV-JOIN-NO-DESCRIPTION', {
            file: resFile,
            sheet: results.sheet,
            lines,
            // beside the samples with no description: some keys of the samples with no results, when there are any (X02 here and XO2 there is a typing error, not two samples)
            params: { count: withoutDescription, samples: listed(names), description: desSheet.name, ...(addedKeys.length > 0 ? { descriptionOnly: addedKeys.slice(0, MAX_KEY_EXAMPLES).join(', ') } : {}) },
          }),
    );
  }
  if (addedKeys.length > 0) {
    const unmatchedNames = [...unmatched.values()].slice(0, MAX_KEY_EXAMPLES).map((u) => keyShown(u.parts));
    findings.push(
      makeConvertFinding('CONV-JOIN-DESCRIPTION-ONLY', {
        file: resFile,
        sheet: results.sheet,
        params: { count: addedKeys.length, samples: listed(addedKeys), description: desSheet.name, ...(unmatchedNames.length > 0 ? { resultsWithout: unmatchedNames.join(', ') } : {}) },
      }),
    );
  }
  for (const f of [...filled.values()].sort((a, b) => a.order - b.order)) {
    findings.push(makeConvertFinding('CONV-JOIN-FILLED', { file: resFile, sheet: results.sheet, lines: f.lines, params: { count: f.count, column: f.name, from: desSheet.name } }));
  }
  for (const [k, n] of [...turnsNumeric].sort((a, b) => a[0] - b[0])) {
    findings.push(makeFinding('ROW-NON-NUMERIC', { file: desFile, sheet: desSheet.name, field: header(desSheet, k), lines: [...n.lines], value: n.value }));
  }
  for (const u of unmerged) {
    const lines = unitClashLines.get(u.kind);
    if (lines === undefined) continue;
    const columns = { resultsColumn: u.results.map((c) => header(resSheet, c)).join(', '), descriptionColumn: u.description.map((c) => header(desSheet, c)).join(', ') };
    if (u.units === undefined) {
      findings.push(makeConvertFinding('CONV-JOIN-COLUMNS-DIFFER', { file: resFile, sheet: results.sheet, lines: [...lines], params: { what: labelOf(u.results, u.description), ...columns } }));
      continue;
    }
    findings.push(
      makeConvertFinding('CONV-JOIN-UNIT-DIFFERS', {
        file: resFile,
        sheet: results.sheet,
        lines: [...lines],
        params: { what: labelOf(u.results, u.description), resultsColumn: u.results.map((c) => header(resSheet, c)).join(', '), resultsUnit: u.units.results, descriptionColumn: u.description.map((c) => header(desSheet, c)).join(', '), descriptionUnit: u.units.description },
      }),
    );
  }
  for (const g of conflicts) {
    const undecided = g.entries.filter((e) => e.take === undefined);
    if (undecided.length > 0) {
      const examples = undecided.slice(0, MAX_EXAMPLES).map((e) => `${e.samples[0]}: ${e.descriptionText} / ${e.resultsText}`).join('; ');
      const lines = undecided.flatMap((e) => e.resultsLines).sort((a, b) => a - b);
      findings.push(
        makeConvertFinding('CONV-JOIN-CONFLICT', { file: resFile, sheet: results.sheet, lines, params: { what: g.label, group: g.group, count: undecided.reduce((n, e) => n + e.samples.length, 0), total: g.count, examples, resultsColumns: g.resultsColumns.join(', '), descriptionColumns: g.descriptionColumns.join(', ') } }),
      );
    } else {
      const tally = (side: JoinSide): number => g.entries.filter((e) => e.take === side).reduce((n, e) => n + e.samples.length, 0);
      findings.push(
        makeConvertFinding('CONV-JOIN-CONFLICT-CHOSEN', { file: resFile, sheet: results.sheet, lines: g.entries.flatMap((e) => e.resultsLines).sort((a, b) => a - b), params: { what: g.label, count: g.count, fromDescription: tally('description'), fromResults: tally('results') } }),
      );
    }
  }

  /* --- the merged sheet --- */
  const flag = (pick: (s: RawSheet) => boolean[] | undefined): boolean[] | undefined => joinFlags(pick(resSheet), rw, pick(desSheet), dw);
  const merged: RawSheet = { ...resSheet, header: mergedHeader, rows };
  for (const name of ['dateFormatted', 'dateAll', 'timeAll', 'fractionShown', 'timeFormatted'] as const) {
    const joined = flag((s) => s[name]);
    if (joined === undefined) delete merged[name];
    else merged[name] = joined;
  }
  const file: ParsedFile = { ...results.file, sheets: results.file.sheets.map((s) => (s === resSheet ? merged : s)) };
  const info: SampleJoinInfo = {
    results: { file: resFile, sheet: results.sheet, raw: resSheet, width: rw, lines: resultsLines },
    description: {
      file: description.file,
      sheet: desSheet,
      mapping: description.mapping,
      ...(description.leaveOut === undefined ? {} : { leaveOut: description.leaveOut }),
      ...(description.leaveOutFile === undefined ? {} : { leaveOutFile: description.leaveOutFile }),
    },
    columns,
    pairs: new Map([...quantities.flatMap((q) => q.pairs), ...keys.map((k) => [k.results, k.description] as [number, number])]),
    lentFrom,
    descriptionOnly,
    takenFromDescription,
    rewritten,
    consumed,
    notChosen,
    lentBlank,
    sameAs,
    noKey,
    ambiguous: ambiguousLines,
    findings,
  };
  return { input: { ...results, file, mapping, sampleJoin: info }, info, conflicts, descriptionKeys: new Set(groups.keys()) };
}

/* ---------- joinInputs: what convert() is handed, from the person's confirmed joins ---------- */

/** One confirmed join as the request carries it, by the index of the sheets in the request. */
export interface SampleJoinRequestCore {
  results: number;
  description: number;
  keys: JoinKeyPair[];
  conflicts: ConflictAnswer[];
  resultsOnly?: number;
  resultsOnlyFromFile?: boolean;
}

export interface JoinOutcome {
  sheets: ConvertSheetInput[];
  /** CONV-JOIN-PROPOSED and CONV-JOIN-DESCRIPTION-LONG only; a merge's own findings travel on SampleJoinInfo.findings (F1) */
  findings: Finding[];
  proposals: SampleJoinProposal[];
  /** the REQUEST indexes of the sheets that can be the results sheet of a join (a taxon column or taxon headers, not a profile sheet) and have none confirmed yet: the person may declare a join for them with no proposal (declare-first) */
  resultsSheets: number[];
  /** `results` = the REQUEST index of the results sheet */
  conflicts: (ConflictGroup & { results: number })[];
  /** for each output sheet, the index of the request sheet it came from */
  origin: number[];
}

const isIndex = (n: unknown, below: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < below;

/**
 * The ONLY validator of a join (F8). A join that is not valid any more (a column re-roled after the person confirmed, an index out of range, the sheets no longer what the join needs) is dropped
 * without a finding of its own and is not passed as `skip`, so its proposal shows again.
 */
export function joinInputs(sheets: readonly ConvertSheetInput[], joins: readonly SampleJoinRequestCore[], declined: readonly { results: number; description: number }[]): JoinOutcome {
  const valid: SampleJoinRequestCore[] = [];
  const usedAsResults = new Set<number>();
  for (const j of joins) {
    if (!isIndex(j.results, sheets.length) || !isIndex(j.description, sheets.length) || j.results === j.description || usedAsResults.has(j.results)) continue;
    if (!Array.isArray(j.keys) || j.keys.length === 0) continue;
    const res = sheets[j.results];
    const des = sheets[j.description];
    const resSheet = sheetOf(res);
    const desSheet = sheetOf(des);
    if (resSheet === undefined || desSheet === undefined) continue;
    if (res.profile !== undefined || !hasTaxon(res) || des.profile !== undefined || hasTaxon(des) || desSheet.pivot !== undefined) continue;
    const picked = new Set(res.sampleKey?.columns ?? []);
    const keysOk = j.keys.every(
      (k) => k !== null && typeof k === 'object' && isIndex(k.results, resSheet.header.length) && isIndex(k.description, desSheet.header.length) && res.mapping.columns.some((c) => c.index === k.results && (RIGHT_KINDS.has(c.role.kind) || picked.has(c.index))),
    );
    if (!keysOk) continue;
    usedAsResults.add(j.results);
    valid.push(j);
  }
  const proposalFindings = (proposals: readonly SampleJoinProposal[]): Finding[] =>
    proposals.map((p) => {
      const res = sheets[p.results];
      const des = sheets[p.description];
      const keys = p.keys.map((k) => `${sheetOf(res)?.header[k.results] ?? ''} = ${sheetOf(des)?.header[k.description] ?? ''}`).join(' + ');
      const base = { file: res.file.fileName, sheet: res.sheet };
      return p.long
        ? makeConvertFinding('CONV-JOIN-DESCRIPTION-LONG', { ...base, params: { description: des.sheet, descriptionFile: des.file.fileName, keys } })
        : makeConvertFinding('CONV-JOIN-PROPOSED', { ...base, params: { description: des.sheet, descriptionFile: des.file.fileName, keys, covered: p.covered, samples: p.samples } });
    });
  const proposed = (): SampleJoinProposal[] =>
    // a results sheet whose join was confirmed gets no proposal for another sheet; a declined pair is skipped for that pair only
    proposeSampleJoins(sheets, [...valid, ...declined]).filter((p) => !usedAsResults.has(p.results));
  const openResultsSheets = (): number[] => sheets.flatMap((s, i) => (s.profile === undefined && hasTaxon(s) && !usedAsResults.has(i) ? [i] : []));
  if (valid.length === 0) {
    const proposals = proposed();
    return { sheets: sheets as ConvertSheetInput[], findings: proposalFindings(proposals), proposals, resultsSheets: openResultsSheets(), conflicts: [], origin: sheets.map((_, i) => i) };
  }
  // decision 6: one description for several results sheets writes each sample once
  const keysOf = new Map(valid.map((j) => [j, resultsKeys(sheets[j.results], j.keys)] as const));
  const firstOfDescription = new Map<number, SampleJoinRequestCore>();
  for (const j of valid) if (!firstOfDescription.has(j.description)) firstOfDescription.set(j.description, j);
  const mergedAt = new Map<number, ConvertSheetInput>();
  const conflicts: JoinOutcome['conflicts'] = [];
  for (const j of valid) {
    const held = new Set<string>();
    for (const other of valid) if (other !== j && other.description === j.description) for (const k of keysOf.get(other)!) held.add(k);
    const merged = mergeSampleSheets({
      results: sheets[j.results],
      description: sheets[j.description],
      keys: j.keys,
      conflicts: j.conflicts,
      ...(j.resultsOnly === undefined ? {} : { resultsOnly: j.resultsOnly }),
      ...(j.resultsOnlyFromFile === undefined ? {} : { resultsOnlyFromFile: j.resultsOnlyFromFile }),
      heldElsewhere: held,
      appendDescriptionOnly: firstOfDescription.get(j.description) === j,
    });
    mergedAt.set(j.results, merged.input);
    for (const g of merged.conflicts) conflicts.push({ ...g, results: j.results });
  }
  const removed = new Set(valid.map((j) => j.description));
  const out: ConvertSheetInput[] = [];
  const origin: number[] = [];
  sheets.forEach((sin, i) => {
    if (removed.has(i)) return;
    out.push(mergedAt.get(i) ?? sin);
    origin.push(i);
  });
  const proposals = proposed();
  return { sheets: out, findings: proposalFindings(proposals), proposals, resultsSheets: openResultsSheets(), conflicts, origin };
}

/**
 * A finding convert() raised about the merged sheet, put where the cell is: a description column, a resolved column or a results cell that holds a description value (takenFromDescription), and
 * every line that is a description-only line, belong to the description sheet, on the line of its own file and under its own header, once (not once per results row that was lent it).
 * The merge's own findings already name the right sheet and are not passed through here.
 */
export function joinLines(findings: readonly Finding[], sin: ConvertSheetInput): Finding[] {
  const info = sin.sampleJoin;
  const merged = sheetOf(sin);
  if (info === undefined || merged === undefined) return [...findings];
  const rw = info.results.width;
  const desHeader = info.description.sheet.header;
  const descriptionLineOf = (line: number): number | undefined => info.lentFrom.get(line) ?? info.descriptionOnly.get(line);
  const out: Finding[] = [];
  for (const f of findings) {
    if (f.file !== info.results.file || f.sheet !== sin.sheet) {
      out.push(f);
      continue;
    }
    const column = f.field === undefined ? -1 : merged.header.indexOf(f.field);
    const entry = column >= 0 ? info.columns[column] : undefined;
    const descriptionField = (): string | undefined => {
      if (entry === undefined) return f.field;
      if (entry.side === 'description') return entry.header;
      if (entry.side === 'resolved') return entry.from !== undefined && entry.from.length > 0 ? [...new Set(entry.from.map((c) => desHeader[c] ?? ''))].join(', ') : f.field;
      const paired = info.pairs.get(column);
      return paired === undefined ? f.field : (desHeader[paired] ?? f.field);
    };
    const whole = (): Finding => ({ ...f, file: info.description.file.fileName, sheet: info.description.sheet.name, ...(f.field === undefined ? {} : { field: descriptionField() }) });
    if (f.lines === undefined) {
      if (entry?.side === 'description') out.push(whole());
      else out.push(f);
      continue;
    }
    if (f.lines.length > 0 && f.lines.every((l) => info.descriptionOnly.has(l))) {
      out.push({ ...whole(), lines: [...new Set(f.lines.map((l) => info.descriptionOnly.get(l)!))].sort((a, b) => a - b) });
      continue;
    }
    const staysHere: number[] = [];
    const goes = new Set<number>();
    for (const l of f.lines) {
      const d = descriptionLineOf(l);
      // a description-only line exists in no results file: whatever the field, it belongs to the description sheet
      const fromDescription = d !== undefined && (info.descriptionOnly.has(l) || (entry !== undefined && (entry.side === 'description' || info.takenFromDescription.has(`${l}:${column}`))));
      if (fromDescription) goes.add(d);
      else staysHere.push(l);
    }
    if (goes.size === 0) {
      out.push(f);
      continue;
    }
    if (staysHere.length > 0) out.push({ ...f, lines: staysHere });
    out.push({ ...whole(), lines: [...goes].sort((a, b) => a - b) });
  }
  return out;
}
