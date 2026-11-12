// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { isBlankCell, stripTypeSuffix } from '../recognize/columns';
import { depthUnitOfHeader } from '../recognize/depthUnit';
import { rankJoinKeys } from '../recognize/layout';
import type { KeySide } from '../recognize/layout';
import { makeConvertFinding } from '../rules/convert';
import type { ColumnRole, Finding, ParsedFile, RawCell, RawRow, RawSheet, SheetMapping } from '../types';
import { excelSerialToDate } from '../values/dates';
import { parseNumber } from '../values/numbers';
import type { ConvertSheetInput } from './build';
import { eventDateText } from './events';

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

/**
 * F2: a description cell in the results file's convention. Only a cell the two files read differently is changed: a text that reads as a number in its own file gets the results file's decimal
 * separator (the digits as written), and a date serial of a 1900/1904 workbook that differs from the results file's becomes the date it means. Anything else is lent verbatim.
 */
export function lendCell(cell: RawCell, from: { file: ParsedFile; sheet: RawSheet; column: number }, to: ParsedFile): { cell: RawCell; rewritten: boolean } {
  const verbatim = { cell, rewritten: false };
  if (cell === null) return verbatim;
  if (typeof cell === 'number') {
    if (from.file.date1904 !== to.date1904 && from.sheet.dateFormatted?.[from.column] === true) {
      try {
        return { cell: eventDateText(excelSerialToDate(cell, from.file.date1904)), rewritten: true };
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
function comparable(cell: RawCell, file: ParsedFile, dateFormatted: boolean): string {
  if (typeof cell === 'number') {
    if (dateFormatted) {
      try {
        return eventDateText(excelSerialToDate(cell, file.date1904));
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
const shown = (cell: RawCell, file: ParsedFile, dateFormatted: boolean): string => (typeof cell === 'number' && dateFormatted ? comparable(cell, file, true) : cellText(cell));

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

/**
 * The merge after the person confirmed the join: the description row of each results row is attached to it by key. The merged sheet keeps the results sheet's NAME (so event IDs and the key prefix
 * do not change) and its row lines; the description columns follow the results columns. Nothing is lent for a key that has several different description rows, for a row with a blank key part or
 * for a sample the description lacks; each of these is a finding. A quantity both sheets have, in the same column structure, stays ONE column (the results one): a blank results cell is filled
 * from the description (said), a value that differs blocks until it is decided. Each lent cell remembers its description line, and the original of a cell rewritten into the results file's
 * convention.
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
  const keyColSet = (cols: readonly number[]): Set<number> => new Set(cols);
  const resKeySet = keyColSet(resKeyCols);
  const desKeySet = keyColSet(desKeyCols);
  const quantityColumns = (mapping: SheetMapping, kind: QuantityKind, skip: Set<number>): number[] => mapping.columns.filter((c) => !skip.has(c.index) && QUANTITY_OF[c.role.kind] === kind).map((c) => c.index);
  const shared: { kind: QuantityKind; pairs: [number, number][] }[] = [];
  const unmerged: { kind: QuantityKind; description: readonly number[]; results: readonly number[] }[] = [];
  for (const kind of new Set(Object.values(QUANTITY_OF))) {
    const res: QuantityColumns = { file: results.file, sheet: resSheet, mapping: results.mapping, columns: quantityColumns(results.mapping, kind, resKeySet) };
    const des: QuantityColumns = { file: description.file, sheet: desSheet, mapping: description.mapping, columns: quantityColumns(description.mapping, kind, desKeySet) };
    if (res.columns.length === 0 || des.columns.length === 0) continue;
    if (sameStructure(res, des)) shared.push({ kind, pairs: pairColumns(res, des) });
    else unmerged.push({ kind, description: des.columns, results: res.columns });
  }
  const consumed = new Set<number>(desKeyCols.map((c) => rw + c));
  for (const s of shared) for (const [, d] of s.pairs) consumed.add(rw + d);

  /* --- the merged header and mapping --- */
  const ownHeaders = Array.from({ length: dw }, (_, i) => header(desSheet, i));
  const mergedHeader = [...resSheet.header, ...uniqueHeaders(ownHeaders, resSheet.header)];
  const mapping: SheetMapping = {
    sheet: results.mapping.sheet,
    columns: [
      ...results.mapping.columns,
      ...description.mapping.columns.map((c) => ({ index: rw + c.index, header: mergedHeader[rw + c.index] ?? c.header, role: consumed.has(rw + c.index) ? ({ kind: 'ignore' } as ColumnRole) : c.role })),
    ],
  };
  const columns: SampleJoinInfo['columns'] = [
    ...resSheet.header.map((h, i) => ({ side: 'results' as const, index: i, header: h })),
    ...ownHeaders.map((h, i) => ({ side: 'description' as const, index: i, header: h })),
  ];

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
  const filled = new Map<number, { count: number; lines: number[] }>();
  const differs = new Map<string, Differences>();
  const unmergedDiffers = new Map<string, Differences>();
  let lastLine = resSheet.headerLine;

  const lend = (descRow: RawRow, line: number): RawCell[] =>
    Array.from({ length: dw }, (_, k) => {
      const original = descRow.cells[k] ?? null;
      const got = lendCell(original, { file: description.file, sheet: desSheet, column: k }, results.file);
      if (got.rewritten) rewritten.set(`${line}:${rw + k}`, original);
      return got.cell;
    });
  const isDate = (sheet: RawSheet, c: number): boolean => sheet.dateFormatted?.[c] === true;

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
      return { line: row.line, cells, fieldCount: cells.length };
    }
    lentFrom.set(row.line, lent.line);
    const lentCells = lend(lent, row.line);
    cells.push(...lentCells);
    for (const s of shared) {
      for (const [rc, dc] of s.pairs) {
        const have = cells[rc];
        const offered = lent.cells[dc] ?? null;
        if (emptyCell(offered)) continue;
        if (emptyCell(have)) {
          cells[rc] = lentCells[dc];
          takenFromDescription.set(`${row.line}:${rc}`, lent.line);
          const original = rewritten.get(`${row.line}:${rw + dc}`);
          if (original !== undefined) rewritten.set(`${row.line}:${rc}`, original);
          const f = filled.get(rc) ?? { count: 0, lines: [] };
          f.count++;
          f.lines.push(row.line);
          filled.set(rc, f);
        } else if (comparable(have, results.file, isDate(resSheet, rc)) !== comparable(offered, description.file, isDate(desSheet, dc))) {
          note(differs, s.kind, header(resSheet, rc), row.line, k.text, shown(offered, description.file, isDate(desSheet, dc)), shown(have, results.file, isDate(resSheet, rc)));
        }
      }
    }
    // a quantity both sheets have in different column structures cannot be written as one: what the description holds in it cannot reach the archive until it is decided
    for (const u of unmerged) {
      const dc = u.description.find((c) => !emptyCell(lent.cells[c]));
      if (dc === undefined) continue;
      const rc = u.results.find((c) => !emptyCell(cells[c]));
      note(unmergedDiffers, u.kind, u.description.map((c) => header(desSheet, c)).join(', '), row.line, k.text, shown(lent.cells[dc] ?? null, description.file, isDate(desSheet, dc)), rc === undefined ? '–' : shown(cells[rc], results.file, isDate(resSheet, rc)));
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
      for (const s of shared) for (const [rc, dc] of s.pairs) if (emptyCell(cells[rc])) cells[rc] = lentCells[dc];
      rows.push({ line, cells: [...cells, ...lentCells], fieldCount: rw + dw });
      descriptionOnly.set(line, row.line);
      addedKeys.push(keyShown(g.parts));
    }
  }

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
  for (const [rc, f] of [...filled].sort((a, b) => a[0] - b[0])) {
    findings.push(makeConvertFinding('CONV-JOIN-FILLED', { file: resFile, sheet: results.sheet, lines: f.lines, params: { count: f.count, column: header(resSheet, rc), from: desSheet.name } }));
  }
  for (const map of [differs, unmergedDiffers]) {
    for (const d of map.values()) {
      const examples = [...new Set([...d.samples.values()].map((s) => `${s.description} / ${s.results}`))].slice(0, MAX_EXAMPLES).join('; ');
      findings.push(
        makeConvertFinding('CONV-JOIN-CONFLICT', { file: resFile, sheet: results.sheet, lines: [...d.lines], params: { what: d.what, group: '', count: d.samples.size, total: d.samples.size, examples } }),
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
    notChosen: [],
    noKey,
    ambiguous: ambiguousLines,
    findings,
  };
  return { input: { ...results, file, mapping, sampleJoin: info }, info, conflicts: [], descriptionKeys: new Set(groups.keys()) };
}
