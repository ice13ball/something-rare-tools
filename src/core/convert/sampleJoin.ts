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
import { excelSerialToDate } from '../values/dates';
import { parseNumber } from '../values/numbers';
import { colsOf, depthReader, isUtcBySource } from './build';
import type { ConvertSheetInput } from './build';
import { eventDateText } from './events';
import { shortHash } from './keySetting';

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
      if (columns.length > 0) candidates.push({ index: di, side: { sheet: dSheet, columns } });
    });
    if (candidates.length === 0) return;
    const j = rankJoinKeys({ sheet: resSheet, columns: leftCols }, candidates.map((c) => c.side), { coverage: 'measure', ...(picked.length > 0 ? { kinds: 'any' as const, together: picked } : {}) });
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
  columns: readonly { side: JoinSide | 'resolved'; index: number; header: string }[];
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

const emptyCell = (c: RawCell | undefined): boolean => c === null || c === undefined || (typeof c === 'string' && c.trim() === '');
const cellText = (c: RawCell | undefined): string => (c === null || c === undefined ? '' : String(c).trim());
const listed = (names: readonly string[]): string => (names.length > MAX_LISTED ? `${names.slice(0, MAX_LISTED).join(', ')}, …` : names.join(', '));
const keyText = (parts: readonly string[]): string => (parts.length === 1 ? parts[0] : JSON.stringify(parts));
const keyShown = (parts: readonly string[]): string => parts.join(' / ');

interface ReadKey {
  text: string;
  parts: string[];
  /** positions (in the key) of the parts that are blank */
  blank: number[];
}
/** The key of a row: each part is `String(cell).trim()` (as the ranking of the keys reads it); a part is blank as the ranking counts a blank. */
function readKey(row: RawRow, columns: readonly number[]): ReadKey {
  const cells = columns.map((c) => row.cells[c] ?? null);
  const parts = cells.map(cellText);
  const blank = cells.flatMap((c, i) => (isBlankCell(c) ? [i] : []));
  return { text: keyText(parts), parts, blank };
}

/** The join-key values of a results sheet (decision 6: joinInputs computes them first, F3). Rows with a blank key part have none. */
export function resultsKeys(results: ConvertSheetInput, keys: readonly JoinKeyPair[]): ReadonlySet<string> {
  const sheet = sheetOf(results);
  const out = new Set<string>();
  if (sheet === undefined) return out;
  const cols = keys.map((k) => k.results);
  for (const row of sheet.rows) {
    const k = readKey(row, cols);
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

/** One value of a quantity as one side reads it. `value` is what is compared (absent = nothing there); `text` is what the person sees; `cells` are the cells a resolved column holds. */
interface Reading {
  value?: string;
  text: string;
  cells: RawCell[];
}
/** `read` = the row whose cells are read (the description row as lent, in the results file's conventions); `show` = the row as its own file holds it. */
type Reader = (read: RawRow, show: RawRow) => Reading;
type ReaderKind = 'date' | 'position' | 'depth' | 'trim' | 'number';

/** A slot of a resolved quantity: the value the converter read, or else the cell as written, marked unreadable so that it never passes for an equal or a blank one. */
function slot(read: number | string | undefined, raw: RawCell | undefined): { part: string; cell: RawCell } {
  if (read !== undefined) return { part: String(read), cell: read };
  const t = cellText(raw);
  return t === '' ? { part: '', cell: null } : { part: `?${t}`, cell: t };
}
const reading = (slots: readonly { part: string; cell: RawCell }[], text: string): Reading => ({ ...(slots.some((s) => s.part !== '') ? { value: slots.map((s) => s.part).join('/') } : {}), text, cells: slots.map((s) => s.cell) });

/**
 * How one side of a quantity is read: with the converter's own readers (the date as `metaParser` reads it, the signed position, the depth in metres as `build.ts` reads it), a variable as a number,
 * the rest as trimmed text. The description is read as it is LENT (in the results file's conventions), so that a pair that only differs by a convention is no conflict.
 */
function makeReader(kind: ReaderKind, columns: readonly number[], mapping: SheetMapping, sheet: RawSheet, readFile: ParsedFile, showFile: ParsedFile, utcFile: ParsedFile): Reader {
  const own: SheetMapping = { sheet: mapping.sheet, columns: mapping.columns.filter((c) => columns.includes(c.index)) };
  const textOf = (row: RawRow): string => columns.map((c) => shown(row.cells[c] ?? null, showFile, sheet, c)).filter((t) => t !== '').join(' ');
  const rawOf = (row: RawRow): string => columns.map((c) => cellText(row.cells[c])).filter((t) => t !== '').join(' ');
  const collector = new Collector(readFile.fileName);
  if (kind === 'date' || kind === 'position') {
    const specs = specsOf(own);
    const parse = metaParser(readFile, sheet, specs, collector, { whenUtc: isUtcBySource(utcFile, specs.when?.header) });
    const lat = own.columns.find((c) => c.role.kind === 'latitude')?.index;
    const lon = own.columns.find((c) => c.role.kind === 'longitude')?.index;
    return (rd, sh) => {
      const meta = parse(rd);
      if (kind === 'date') return reading([slot(meta.datetime === undefined ? undefined : eventDateText(meta.datetime), rawOf(rd))], textOf(sh));
      return reading([slot(meta.lat, lat === undefined ? undefined : rd.cells[lat]), slot(meta.lon, lon === undefined ? undefined : rd.cells[lon])], textOf(sh));
    };
  }
  if (kind === 'depth') {
    const depths = own.columns.filter((c) => c.role.kind === 'depth');
    const byBound = (b: 'min' | 'max' | undefined): number | undefined => depths.find((c) => c.role.kind === 'depth' && c.role.bound === b)?.index;
    const plain = byBound(undefined);
    const minCol = byBound('min') ?? plain;
    const maxCol = byBound('max') ?? plain;
    const read = depthReader(colsOf(own, sheet.header), readFile.decimalComma, collector, sheet.name);
    return (rd, sh) => {
      const d = read(rd);
      return reading([slot(d.min, minCol === undefined ? undefined : rd.cells[minCol]), slot(d.max, maxCol === undefined ? undefined : rd.cells[maxCol])], textOf(sh));
    };
  }
  if (kind === 'number') {
    const c = columns[0];
    return (rd, sh) => {
      const cell = rd.cells[c] ?? null;
      return { ...(isBlankCell(cell) ? {} : { value: comparable(cell, readFile, sheet, c) }), text: textOf(sh), cells: [cell] };
    };
  }
  return (rd, sh) => {
    const t = rawOf(rd);
    return { ...(t === '' ? {} : { value: t }), text: textOf(sh), cells: columns.map((c) => rd.cells[c] ?? null) };
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
  resolved?: { headers: string[]; roles: ColumnRole[]; slots: number[] };
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
  fill?: boolean;
}

interface Differences {
  what: string;
  lines: Set<number>;
  /** per join-key value: description text / results text */
  samples: Map<string, { description: string; results: string }>;
}
const note = (map: Map<string, Differences>, kind: string, what: string, line: number, key: string, description: string, results: string): void => {
  const d = map.get(kind) ?? { what, lines: new Set<number>(), samples: new Map() };
  d.lines.add(line);
  if (!d.samples.has(key)) d.samples.set(key, { description, results });
  map.set(kind, d);
};

/** Roles of one value per sample that a description can state beside the quantities above; they are compared as text when both sheets have exactly one, in the same unit. */
const OTHER_SHARED = new Set<string>(['pressure', 'effort', 'depthBelowSeafloor']);
const roleUnit = (r: ColumnRole): string => ((r as { unit?: string }).unit ?? '').trim();
const EMPTY: Reading = { text: '', cells: [] };

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

  /* --- the description: its rows by key --- */
  const groups = new Map<string, DescriptionGroup>();
  const noKeyRows: RawRow[] = [];
  const noKeyColumns = new Set<number>();
  for (const row of desSheet.rows) {
    if (row.cells.every(emptyCell)) continue; // nothing in it to lend or to lose
    const k = readKey(row, desKeyCols);
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
  const unmerged: { kind: string; description: readonly number[]; results: readonly number[] }[] = [];
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
      unmerged.push({ kind, description: dc, results: rc });
      continue;
    }
    const either = (kinds: string[]): boolean => hasRole(rc, results.mapping, kinds) || hasRole(dc, description.mapping, kinds);
    const resolved: Quantity['resolved'] =
      kind === 'date'
        ? { headers: ['Date (merged)'], roles: [{ kind: 'datetime' }], slots: [0] }
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
  for (const kind of OTHER_SHARED) {
    const rc = columnsOf(results.mapping, resKeySet, (r) => r.kind === kind);
    const dc = columnsOf(description.mapping, desKeySet, (r) => r.kind === kind);
    const unit = (m: SheetMapping, c: number): string => roleUnit(m.columns.find((x) => x.index === c)!.role);
    if (rc.length === 1 && dc.length === 1 && unit(results.mapping, rc[0]) === unit(description.mapping, dc[0])) addQuantity(`r.${kind}`, 'other', 'trim', rc, dc, [[rc[0], dc[0]]]);
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
  const unmergedDiffers = new Map<string, Differences>();
  let lastLine = resSheet.headerLine;
  const countFilled = (order: number, name: string, line: number): void => {
    const f = filled.get(`${order}`) ?? { order, name, count: 0, lines: [] };
    f.count++;
    f.lines.push(line);
    filled.set(`${order}`, f);
  };

  const turnsNumeric = new Map<number, { lines: Set<number>; value: string }>();
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
        return null;
      }
      return got.cell;
    });

  /** The sample a results row is of, for the entries of a conflict: the code of its sample column, else its key. */
  const sampleCol = results.mapping.columns.find((c) => c.role.kind === 'sampleId')?.index;
  const sampleOf = (row: RawRow, key: ReadKey): string => (sampleCol !== undefined && cellText(row.cells[sampleCol]) !== '' ? cellText(row.cells[sampleCol]) : keyShown(key.parts));

  const rows: RawRow[] = resSheet.rows.map((row) => {
    resultsLines.add(row.line);
    if (row.line > lastLine) lastLine = row.line;
    const cells: RawCell[] = Array.from({ length: rw }, (_, i) => row.cells[i] ?? null);
    const k = readKey(row, resKeyCols);
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
      if (rr.value !== undefined && dr.value !== undefined && rr.value !== dr.value) {
        // F6: one entry per (join-key value, results value)
        const id = shortHash(`${k.text}\u0000${rr.text}`);
        const entry = q.entries.get(id) ?? { id, key: k.text, descriptionLine: lent.line, descriptionText: dr.text, resultsText: rr.text, resultsLines: [], samples: [] };
        if (!entry.resultsLines.includes(row.line)) entry.resultsLines.push(row.line);
        const sample = sampleOf(row, k);
        if (!entry.samples.includes(sample)) entry.samples.push(sample);
        q.entries.set(id, entry);
        at.entry = entry;
      } else if (q.resolved !== undefined) {
        if (rr.value === undefined && dr.value !== undefined) {
          at.fill = true;
          countFilled(1000 + quantities.indexOf(q), q.label, row.line);
        }
      } else {
        for (const [rc, dc] of q.pairs) {
          const have = cells[rc];
          const offered = lent.cells[dc] ?? null;
          if (emptyCell(offered) || lentCells[dc] === null || !emptyCell(have)) continue; // nothing offered, or not lent (reported above), or the results sheet has its own
          cells[rc] = lentCells[dc];
          takenFromDescription.set(`${row.line}:${rc}`, lent.line);
          const original = rewritten.get(`${row.line}:${rw + dc}`);
          if (original !== undefined) rewritten.set(`${row.line}:${rc}`, original);
          countFilled(rc, header(resSheet, rc), row.line);
        }
      }
      if (q.resolved !== undefined || at.entry !== undefined) q.rows.push(at);
    }
    // a quantity both sheets have in a column structure that cannot be compared (more columns on one side than the other): what the description holds in it cannot reach the archive until it is decided
    for (const u of unmerged) {
      const dc = u.description.find((c) => !emptyCell(lent.cells[c]));
      if (dc === undefined) continue;
      const rc = u.results.find((c) => !emptyCell(cells[c]));
      note(unmergedDiffers, u.kind, u.description.map((c) => header(desSheet, c)).join(', '), row.line, k.text, shown(lent.cells[dc] ?? null, description.file, desSheet, dc), rc === undefined ? '–' : shown(cells[rc], results.file, resSheet, rc));
    }
    return { line: row.line, cells, fieldCount: cells.length };
  });

  /* --- description-only samples --- */
  const held = decl.heldElsewhere ?? new Set<string>();
  const addedKeys: string[] = [];
  const ambiguousAdded = new Set<string>();
  if (decl.appendDescriptionOnly) {
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
      for (const pair of keys) {
        cells[pair.results] = lentCells[pair.description];
        const original = rewritten.get(`${line}:${rw + pair.description}`);
        if (original !== undefined) rewritten.set(`${line}:${pair.results}`, original);
      }
      const lentRow: RawRow = { line: row.line, cells: lentCells, fieldCount: dw };
      const full: RawCell[] = [];
      for (const q of quantities) {
        if (q.resolved !== undefined) {
          const dr = q.readDes(lentRow, row);
          const at: QuantityRow = { cells: full, line, rr: EMPTY, dr, lent: row, lentCells };
          if (dr.value !== undefined) {
            at.fill = true;
            countFilled(1000 + quantities.indexOf(q), q.label, line);
          }
          q.rows.push(at);
          continue;
        }
        for (const [rc, dc] of q.pairs) {
          if (!emptyCell(cells[rc])) continue;
          cells[rc] = lentCells[dc];
          if (!emptyCell(row.cells[dc]) && lentCells[dc] !== null) countFilled(rc, header(resSheet, rc), line);
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
    const g: ConflictGroup = { group: q.group, quantity: q.kind, label: q.label, count, entries };
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

  /* --- the value not chosen is kept, with both lines (P7) --- */
  const notChosen: SampleJoinInfo['notChosen'][number][] = [];
  for (const q of quantities) {
    for (const at of q.rows) {
      if (at.entry?.take === undefined || at.dr === undefined || at.lent === undefined) continue;
      if (at.entry.take === 'description') {
        for (const c of q.resCols) if (!emptyCell(at.cells[c])) notChosen.push({ side: 'results', line: at.line, column: c, otherLine: at.lent.line, group: q.group, chosen: at.dr.text });
      } else {
        for (const c of q.desCols) if (!emptyCell(at.lent.cells[c])) notChosen.push({ side: 'description', line: at.lent.line, column: rw + c, otherLine: at.line, group: q.group, chosen: at.rr.text });
      }
    }
  }

  /* --- the chosen description side is written into the results columns (same structure) --- */
  for (const q of quantities) {
    if (q.resolved !== undefined) continue;
    for (const at of q.rows) {
      if (at.entry?.take !== 'description' || at.lent === undefined || at.lentCells === undefined) continue;
      for (const [rc, dc] of q.pairs) {
        at.cells[rc] = at.lentCells[dc];
        takenFromDescription.set(`${at.line}:${rc}`, at.lent.line);
        const original = rewritten.get(`${at.line}:${rw + dc}`);
        if (original !== undefined) rewritten.set(`${at.line}:${rc}`, original);
        else rewritten.delete(`${at.line}:${rc}`);
      }
    }
  }

  /* --- the merged header, and the columns written for a quantity of another structure (F4) --- */
  const ownHeaders = Array.from({ length: dw }, (_, i) => header(desSheet, i));
  const mergedHeader = [...resSheet.header, ...uniqueHeaders(ownHeaders, resSheet.header)];
  const columns: { side: JoinSide | 'resolved'; index: number; header: string }[] = [
    ...resSheet.header.map((h, i) => ({ side: 'results' as const, index: i, header: h })),
    ...ownHeaders.map((h, i) => ({ side: 'description' as const, index: i, header: h })),
  ];
  const resolvedColumns: { index: number; header: string; role: ColumnRole }[] = [];
  const ignoredResults = new Set<number>();
  for (const q of resolvedQuantities) {
    for (const d of q.desCols) consumed.add(rw + d);
    const spec = q.resolved!;
    const takesDescription = q.rows.some((at) => at.fill === true || at.entry?.take === 'description');
    if (!takesDescription) continue; // the results columns keep carrying the quantity: every value of the description is equal to theirs, blank, or kept in notChosen
    const names = uniqueHeaders(spec.headers, mergedHeader);
    const base = mergedHeader.length;
    mergedHeader.push(...names);
    names.forEach((name, i) => {
      columns.push({ side: 'resolved', index: base + i, header: name });
      resolvedColumns.push({ index: base + i, header: name, role: spec.roles[i] });
    });
    for (const c of q.resCols) {
      consumed.add(c);
      ignoredResults.add(c);
    }
    for (const at of q.rows) {
      const fromDescription = at.fill === true || at.entry?.take === 'description';
      const chosen = fromDescription ? at.dr! : at.rr;
      spec.slots.forEach((slotIndex, i) => {
        const cell = chosen.cells[slotIndex] ?? null;
        at.cells[base + i] = cell;
        if (fromDescription && cell !== null && at.lent !== undefined) takenFromDescription.set(`${at.line}:${base + i}`, at.lent.line);
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
  const answered = withoutDescription > 0 && decl.resultsOnly === withoutDescription;
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
  if (withoutDescription > 0) {
    const names = [...[...unmatched.values()].map((u) => keyShown(u.parts)), ...blankKeyRows.map((l) => `(line ${l})`)];
    const lines = [...[...unmatched.values()].flatMap((u) => u.lines), ...blankKeyRows];
    findings.push(
      answered
        ? makeConvertFinding('CONV-JOIN-RESULTS-ONLY', {
            file: resFile,
            sheet: results.sheet,
            lines,
            params: { count: withoutDescription, samples: listed(names), ...(decl.resultsOnlyFromFile === true ? { fromFile: 'yes' } : {}) },
          })
        : makeConvertFinding('CONV-JOIN-NO-DESCRIPTION', { file: resFile, sheet: results.sheet, lines, params: { count: withoutDescription, samples: listed(names), description: desSheet.name } }),
    );
  }
  if (addedKeys.length > 0) {
    findings.push(makeConvertFinding('CONV-JOIN-DESCRIPTION-ONLY', { file: resFile, sheet: results.sheet, params: { count: addedKeys.length, samples: listed(addedKeys), description: desSheet.name } }));
  }
  for (const f of [...filled.values()].sort((a, b) => a.order - b.order)) {
    findings.push(makeConvertFinding('CONV-JOIN-FILLED', { file: resFile, sheet: results.sheet, lines: f.lines, params: { count: f.count, column: f.name, from: desSheet.name } }));
  }
  for (const [k, n] of [...turnsNumeric].sort((a, b) => a[0] - b[0])) {
    findings.push(makeFinding('ROW-NON-NUMERIC', { file: desFile, sheet: desSheet.name, field: header(desSheet, k), lines: [...n.lines], value: n.value }));
  }
  for (const d of unmergedDiffers.values()) {
    const examples = [...new Set([...d.samples.values()].map((s) => `${s.description} / ${s.results}`))].slice(0, MAX_EXAMPLES).join('; ');
    findings.push(makeConvertFinding('CONV-JOIN-CONFLICT', { file: resFile, sheet: results.sheet, lines: [...d.lines], params: { what: d.what, group: '', count: d.samples.size, total: d.samples.size, examples } }));
  }
  for (const g of conflicts) {
    const undecided = g.entries.filter((e) => e.take === undefined);
    if (undecided.length > 0) {
      const examples = undecided.slice(0, MAX_EXAMPLES).map((e) => `${e.samples[0]}: ${e.descriptionText} / ${e.resultsText}`).join('; ');
      const lines = undecided.flatMap((e) => e.resultsLines).sort((a, b) => a - b);
      findings.push(
        makeConvertFinding('CONV-JOIN-CONFLICT', { file: resFile, sheet: results.sheet, lines, params: { what: g.label, group: g.group, count: undecided.reduce((n, e) => n + e.samples.length, 0), total: g.count, examples } }),
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
    lentFrom,
    descriptionOnly,
    takenFromDescription,
    rewritten,
    consumed,
    notChosen,
    noKey,
    ambiguous: ambiguousLines,
    findings,
  };
  return { input: { ...results, file, mapping, sampleJoin: info }, info, conflicts, descriptionKeys: new Set(groups.keys()) };
}
