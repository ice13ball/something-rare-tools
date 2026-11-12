// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ColumnProposal, LayoutPlan, ParsedFile, RawRow, RawSheet, SheetMapping, TablePlan } from '../types';
import { parseNumber } from '../values/numbers';
import { isBlankCell, isKnownColumnName, proposeColumns, stripTypeSuffix, toMapping, unitFromHeader } from './columns';
import type { ProposeContext } from './columns';
import { reasonsText, type LayoutReason, type LayoutReasonCode } from './layoutReasons';
import { canonicalFromKey, headerKey, normaliseUnit } from './vocab';
import { unitsRowNotFolded } from '../parse/shared';

/*
 * Layout kinds, as TablePlan / LayoutPlan describe them:
 *  - wide: one row per sample, one column per variable. TablePlan without `long`.
 *  - long: one row per measurement (sample key, parameter name, [unit], value). TablePlan with `long`.
 *  - join: the measurement sheet carries no position; another sheet does, and they share a key column.
 *    LayoutPlan.joins entry: left = the measurement sheet (it produces the rows and is listed in `tables`),
 *    right = the lookup sheet (position, station, date). A lookup sheet with no measurements of its own is NOT in `tables`.
 *  - sheets that carry neither coordinates nor measurements (legends, notes) are left out of the plan.
 */

const PARAMETER_NAME = /^(parameter|param|parameter name|variable|variable name|analyte|determinand|measurand|quantity|property|observed property|analysis|test)$/;
const VALUE_NAME = /^(value|values|result|results|val|concentration|reading|measurement value)$/;
const UNIT_NAME = /^(unit|units|uom|unit of measure|unit of measurement)$/;

interface SheetInfo {
  sheet: RawSheet;
  proposals: ColumnProposal[];
  long?: TablePlan['long'];
  unsupported?: LayoutReasonCode;
  hasPosition: boolean;
  nVars: number;
  isData: boolean;
}

const ctxOf = (file: ParsedFile): ProposeContext => ({ decimalComma: file.decimalComma, date1904: file.date1904 });

function sampleOf(rows: readonly RawRow[], max: number): RawRow[] {
  if (rows.length <= max) return rows.slice();
  const out: RawRow[] = [];
  for (let i = 0; i < max; i++) out.push(rows[Math.floor((i * rows.length) / max)]);
  return out;
}

/* ---------- layouts the tool cannot read ---------- */

export function transposedReason(sheet: RawSheet, decimalComma: boolean): LayoutReasonCode | undefined {
  if (sheet.header.length < 3 || sheet.rows.length < 2) return undefined;
  const labels = new Set<string>();
  for (const r of sheet.rows) {
    const c = r.cells[0] ?? null;
    if (typeof c === 'string' && isKnownColumnName(c)) labels.add(c.trim().toLowerCase());
  }
  if (labels.size < 2) return undefined;
  if (sheet.header.slice(1).some((h) => h !== '' && isKnownColumnName(h))) return undefined;
  let numeric = 0;
  let filled = 0;
  for (const r of sampleOf(sheet.rows, 200)) {
    for (let i = 1; i < r.cells.length; i++) {
      const c = r.cells[i] ?? null;
      if (isBlankCell(c)) continue;
      filled++;
      if (parseNumber(c, decimalComma).status === 'ok') numeric++;
    }
  }
  if (filled === 0 || numeric * 2 < filled) return undefined;
  return 'transposed';
}

/**
 * A row of footnote markers where the header should be: most of its cells are a single letter, a short list of letters ("a,c") or NA, and the row below holds words (the real column names).
 * The names above them would be read as the columns' names and the words below as data (false ROW-NON-NUMERIC on every column). Decided from the structure, not from any name.
 */
const FOOTNOTE_MARKER = /^(?:[a-z](?:\s*,\s*[a-z])*|NA|n\/a)$/i;
function footnoteMarkerRow(sheet: RawSheet, cols: number): boolean {
  if (cols < 6 || sheet.rows.length < 2) return false;
  const named = sheet.header.slice(0, cols).map((h) => h.trim()).filter((h) => h !== '');
  if (named.length < 5 || named.filter((h) => FOOTNOTE_MARKER.test(h)).length * 5 < named.length * 4) return false;
  const first = sheet.rows[0];
  let filled = 0;
  let words = 0;
  for (let i = 0; i < cols; i++) {
    const c = first.cells[i] ?? null;
    if (isBlankCell(c)) continue;
    filled++;
    if (typeof c === 'string' && /[A-Za-z]{4,}/.test(c)) words++;
  }
  return filled >= 3 && words * 2 > filled;
}

/**
 * The first data row is a row of units that the parser did not fold into the header (a row it folded is no longer there): either every filled cell is a unit and the numbers agree under most of them but
 * text stands under some (unitsRowNotFolded), or two or more cells are units of the vocabulary with numbers under them. The line of that row; the converter says the same row in its own words.
 */
export function firstRowIsUnits(sheet: RawSheet, decimalComma: boolean, cols = sheet.unnamedFrom ?? sheet.header.length): { line: number } | undefined {
  const named = unitsRowNotFolded(sheet.header, sheet.rows, decimalComma, { dateFormatted: sheet.dateFormatted });
  if (named) return named;
  if (sheet.rows.length < 2) return undefined;
  const first = sheet.rows[0];
  let unitCells = 0;
  for (let i = 0; i < cols; i++) {
    const c = first.cells[i] ?? null;
    if (typeof c !== 'string' || normaliseUnit(c) === undefined) continue;
    let ok = 0;
    let bad = 0;
    for (const r of sheet.rows.slice(1, 51)) {
      const p = parseNumber(r.cells[i] ?? null, decimalComma);
      if (p.status === 'ok') ok++;
      else if (p.status === 'non-numeric') bad++;
    }
    if (ok > 0 && ok >= bad) unitCells++;
  }
  return unitCells >= 2 ? { line: first.line } : undefined;
}

function headerRowsReason(sheet: RawSheet, decimalComma: boolean): LayoutReasonCode | undefined {
  // the names the tool added (IN-HEADER-SHORT) are not the file's: only the file's own header says whether it is empty
  const cols = sheet.unnamedFrom ?? sheet.header.length;
  if (cols >= 3 && sheet.header.slice(0, cols).filter((h) => h.trim() === '').length * 2 > cols) {
    return 'header-empty';
  }
  if (firstRowIsUnits(sheet, decimalComma, cols) !== undefined) return 'header-units';
  // (units first: 'z, T, S, O, N, P' over a row of units is a header of short names, not footnote marks)
  if (footnoteMarkerRow(sheet, cols)) return 'header-footnote';
  return undefined;
}

/* ---------- long tables ---------- */

function detectLong(sheet: RawSheet, proposals: readonly ColumnProposal[], decimalComma: boolean): TablePlan['long'] | undefined {
  const keyOf = (p: ColumnProposal) => headerKey(unitFromHeader(p.header).name);
  // a column the short-header detection added (IN-HEADER-SHORT) says nothing about the layout: never a parameter, unit or value column
  const named = proposals.filter((p) => sheet.unnamedFrom === undefined || p.index < sheet.unnamedFrom);
  const textCols = named.filter((p) => p.role.kind === 'ignore');
  const varCols = named.filter((p) => p.role.kind === 'variable');

  const repeats = (col: number): { distinct: Set<string>; n: number } => {
    const distinct = new Set<string>();
    let n = 0;
    for (const r of sheet.rows) {
      const c = r.cells[col] ?? null;
      if (isBlankCell(c)) continue;
      n++;
      distinct.add(String(c).trim());
    }
    return { distinct, n };
  };

  let param = textCols.find((p) => PARAMETER_NAME.test(keyOf(p)));
  if (param) {
    const { distinct, n } = repeats(param.index);
    if (distinct.size === 0 || distinct.size >= n) param = undefined;
  }
  if (!param && varCols.length === 1) {
    // no name hint: a repeating text column whose values are themselves variable names
    for (const p of textCols) {
      const { distinct, n } = repeats(p.index);
      if (distinct.size < 2 || distinct.size >= n) continue;
      let known = 0;
      for (const v of distinct) if (canonicalFromKey(headerKey(unitFromHeader(v).name)) !== undefined) known++;
      if (known * 2 >= distinct.size) {
        param = p;
        break;
      }
    }
  }
  if (!param) return undefined;

  const value = varCols.find((p) => VALUE_NAME.test(keyOf(p))) ?? (varCols.length === 1 ? varCols[0] : undefined);
  if (!value) return undefined;
  // the value column must really be numeric
  let ok = 0;
  for (const r of sampleOf(sheet.rows, 200)) if (parseNumber(r.cells[value.index] ?? null, decimalComma).status === 'ok') ok++;
  if (ok === 0) return undefined;

  const unit = textCols.find((p) => p.index !== param!.index && UNIT_NAME.test(keyOf(p)));
  return unit ? { parameterCol: param.index, unitCol: unit.index, valueCol: value.index } : { parameterCol: param.index, valueCol: value.index };
}

/* ---------- per sheet ---------- */

function analyse(file: ParsedFile, sheet: RawSheet, skipTransposed = false): SheetInfo {
  const ctx = ctxOf(file);
  const empty: SheetInfo = { sheet, proposals: [], hasPosition: false, nVars: 0, isData: false };
  if (sheet.rows.length === 0) return empty;

  let proposals = proposeColumns(sheet, ctx);
  const unsupported = (skipTransposed ? undefined : transposedReason(sheet, file.decimalComma)) ?? headerRowsReason(sheet, file.decimalComma);
  if (unsupported) return { ...empty, proposals, unsupported };

  const long = detectLong(sheet, proposals, file.decimalComma);
  if (long) proposals = proposeColumns(sheet, { ...ctx, long });
  const hasPosition = proposals.some((p) => p.role.kind === 'latitude') && proposals.some((p) => p.role.kind === 'longitude');
  const nVars = proposals.filter((p) => p.role.kind === 'variable').length;
  return { sheet, proposals, long, hasPosition, nVars, isData: hasPosition || nVars > 0 || long !== undefined };
}

/* ---------- joins ---------- */

const KEY_KINDS = new Set(['station', 'sampleId', 'cruise', 'ignore']);
const STRONG_KEY_KINDS = new Set(['station', 'sampleId', 'cruise']);
const cleanKey = (h: string): string => stripTypeSuffix(h).toLowerCase();

function keyValues(sheet: RawSheet, col: number): { values: Set<string>; unique: boolean } {
  const values = new Set<string>();
  let n = 0;
  for (const r of sheet.rows) {
    const c = r.cells[col] ?? null;
    if (isBlankCell(c)) continue;
    n++;
    values.add(String(c).trim());
  }
  return { values, unique: values.size === n };
}

export interface KeySide {
  sheet: RawSheet;
  columns: readonly { index: number; header: string; role: { kind: string } }[];
  consumed?: ReadonlySet<number>;
}

export interface RankedJoin {
  /** Index into the `rights` that were offered. */
  right: number;
  leftKey: number;
  rightKey: number;
  score: number;
  /** The right key column holds each value once: it identifies one row of the right sheet. */
  unique: boolean;
  /** How many different key values the right column has: of two keys that are both unique, the finer one (stations, not cruises). */
  fine: number;
  extraKeys?: { leftKey: number; rightKey: number }[];
  /** Distinct left key values (tuples, for a composite) found on the right. */
  covered: number;
  /** All distinct left key values (tuples) that are not blank. */
  total: number;
}

const tupleOf = (row: RawRow, cols: readonly number[]): string | undefined => {
  const parts: string[] = [];
  for (const c of cols) {
    const v = row.cells[c] ?? null;
    if (isBlankCell(v)) return undefined;
    parts.push(String(v).trim());
  }
  return JSON.stringify(parts);
};

/**
 * Ranks the ways to join a left sheet to one of the right sheets. A key must identify ONE row of the right sheet: among candidates of the same score the one whose right column is unique wins
 * (the order of the columns decides nothing), and when no single column is unique the columns the two sheets share by name (Cruise + Station) are tried together as a composite key (taken when it is
 * unique, or, under coverage 'all', when fewer right rows share their key than with the single column). A non-unique key that remains is returned as it is, and the rows it cannot place are said by dataset.ts
 * (ROW-JOIN-AMBIGUOUS), never silently given the first row's position.
 *
 * coverage 'all': a candidate is dropped unless every left value is on the right (/check). 'measure': a candidate stays when at least one is, and the share covered ranks first.
 * kinds: by default both columns must be in KEY_KINDS. 'any': the caller has chosen the left columns (of any kind); a right column qualifies by the same header or the same strong kind.
 */
export function rankJoinKeys(left: KeySide, rights: readonly KeySide[], opts: { coverage: 'all' | 'measure'; kinds?: ReadonlySet<string> | 'any'; together?: readonly number[] }): RankedJoin | undefined {
  if (opts.together !== undefined) return rankTogether(left, rights, opts.together, opts.coverage === 'all');
  const consumed = left.consumed ?? new Set<number>();
  const all = opts.coverage === 'all';
  const kinds = opts.kinds ?? KEY_KINDS;
  const anyKind = kinds === 'any';
  const inKinds = (k: string): boolean => kinds !== 'any' && kinds.has(k);
  let best: RankedJoin | undefined;
  /** Per right sheet: the key pairs the two sheets share by name or by strong kind, each of which has a left value on the right (every one, under 'all'). */
  const shared = new Map<number, { leftKey: number; rightKey: number; named: boolean }[]>();
  /** Coverage first (under 'measure'), then uniqueness on the right, then the score (a header the two sheets share, a strong kind), then the finer key. */
  const better = (a: RankedJoin, b: RankedJoin): boolean => {
    const ca = a.covered * b.total;
    const cb = b.covered * a.total;
    return ca !== cb ? ca > cb : a.unique !== b.unique ? a.unique : a.score !== b.score ? a.score > b.score : a.fine > b.fine;
  };
  rights.forEach((coord, ri) => {
    for (const mp of left.columns) {
      if (consumed.has(mp.index) || (!anyKind && !inKinds(mp.role.kind))) continue;
      const m = keyValues(left.sheet, mp.index);
      if (m.values.size === 0) continue;
      for (const cp of coord.columns) {
        const headerEq = cleanKey(mp.header) === cleanKey(cp.header);
        const strong = STRONG_KEY_KINDS.has(mp.role.kind);
        const sameStrong = strong && mp.role.kind === cp.role.kind;
        if (anyKind ? !(headerEq || sameStrong) : !inKinds(cp.role.kind)) continue;
        const c = keyValues(coord.sheet, cp.index);
        let covered = 0;
        for (const v of m.values) if (c.values.has(v)) covered++;
        if (all ? covered < m.values.size : covered === 0) continue;
        // the columns the two sheets share by name, or by meaning (Stn and Station are both the station), are the parts of a composite key
        if (headerEq || sameStrong) (shared.get(ri) ?? shared.set(ri, []).get(ri)!).push({ leftKey: mp.index, rightKey: cp.index, named: headerEq });
        if (!headerEq && !(c.unique && strong)) continue;
        const score = (headerEq ? 2 : 0) + (strong ? 1 : 0);
        const cand: RankedJoin = { right: ri, leftKey: mp.index, rightKey: cp.index, score, unique: c.unique, fine: c.values.size, covered, total: m.values.size };
        if (!best || better(cand, best)) best = cand;
      }
    }
  });
  if (best === undefined || best.unique) return best;
  // no single column identifies a row of the right sheet: the shared key columns together may
  // one partner for each left column (the one with the same header first)
  const pairs: { leftKey: number; rightKey: number; named: boolean }[] = [];
  for (const q of shared.get(best.right) ?? []) {
    const at = pairs.findIndex((x) => x.leftKey === q.leftKey);
    if (at < 0) pairs.push(q);
    else if (q.named && !pairs[at].named) pairs[at] = q;
  }
  if (pairs.length < 2) return best;
  const leftCols = pairs.map((q) => q.leftKey);
  const rightCols = pairs.map((q) => q.rightKey);
  const rightSheet = rights[best.right].sheet;
  const rightTuples = new Map<string, number>();
  for (const r of rightSheet.rows) {
    const t = tupleOf(r, rightCols);
    if (t !== undefined) rightTuples.set(t, (rightTuples.get(t) ?? 0) + 1);
  }
  const leftTuples = new Set<string>();
  for (const r of left.sheet.rows) {
    const t = tupleOf(r, leftCols);
    if (t !== undefined) leftTuples.add(t);
  }
  let coveredTuples = 0;
  for (const t of leftTuples) if (rightTuples.has(t)) coveredTuples++;
  if (all ? coveredTuples < leftTuples.size : coveredTuples === 0) return best;
  // rows of the right sheet that share their key with another row: the composite is taken when it leaves none (it is a key), or (under 'all') fewer than the single column does (a station listed twice
  // must not make every row of the cruise ambiguous: dataset.ts then says only the keys that really repeat)
  const dupRows = (counts: Iterable<number>): number => [...counts].reduce((n, c) => n + (c > 1 ? c : 0), 0);
  const single = new Map<string, number>();
  for (const r of rightSheet.rows) {
    const t = tupleOf(r, [best.rightKey]);
    if (t !== undefined) single.set(t, (single.get(t) ?? 0) + 1);
  }
  const composite = dupRows(rightTuples.values());
  if (composite !== 0 && (!all || composite >= dupRows(single.values()))) return best;
  return {
    ...best,
    leftKey: pairs[0].leftKey,
    rightKey: pairs[0].rightKey,
    unique: composite === 0,
    extraKeys: pairs.slice(1).map((q) => ({ leftKey: q.leftKey, rightKey: q.rightKey })),
    covered: coveredTuples,
    total: leftTuples.size,
  };
}

/**
 * The key the caller picked: ALL the given left columns together, each paired with the column of the right sheet that has the same header (else the same strong kind). A right sheet that lacks a partner
 * for any part is no candidate: a part is never dropped because another one is unique alone. Ranked as rankJoinKeys ranks (coverage of the tuples, uniqueness, score, fineness).
 */
function rankTogether(left: KeySide, rights: readonly KeySide[], parts: readonly number[], all: boolean): RankedJoin | undefined {
  const lcols = parts.map((i) => left.columns.find((c) => c.index === i));
  if (lcols.length === 0 || lcols.some((c) => c === undefined)) return undefined;
  const leftCols = lcols as KeySide['columns'][number][];
  const leftTuples = new Set<string>();
  for (const r of left.sheet.rows) {
    const t = tupleOf(r, parts);
    if (t !== undefined) leftTuples.add(t);
  }
  if (leftTuples.size === 0) return undefined;
  let best: RankedJoin | undefined;
  rights.forEach((coord, ri) => {
    const pairs: { rightKey: number; score: number }[] = [];
    for (const lc of leftCols) {
      const named = coord.columns.find((c) => cleanKey(c.header) === cleanKey(lc.header));
      const strong = STRONG_KEY_KINDS.has(lc.role.kind) ? coord.columns.find((c) => c.role.kind === lc.role.kind) : undefined;
      const hit = named ?? strong;
      if (hit === undefined) return;
      pairs.push({ rightKey: hit.index, score: (named ? 2 : 0) + (STRONG_KEY_KINDS.has(lc.role.kind) ? 1 : 0) });
    }
    const rightCols = pairs.map((q) => q.rightKey);
    const rightTuples = new Map<string, number>();
    for (const r of coord.sheet.rows) {
      const t = tupleOf(r, rightCols);
      if (t !== undefined) rightTuples.set(t, (rightTuples.get(t) ?? 0) + 1);
    }
    let covered = 0;
    for (const t of leftTuples) if (rightTuples.has(t)) covered++;
    if (all ? covered < leftTuples.size : covered === 0) return;
    const cand: RankedJoin = {
      right: ri,
      leftKey: parts[0],
      rightKey: pairs[0].rightKey,
      score: pairs.reduce((n, q) => n + q.score, 0),
      unique: [...rightTuples.values()].every((c) => c === 1),
      fine: rightTuples.size,
      extraKeys: pairs.slice(1).map((q, i) => ({ leftKey: parts[i + 1], rightKey: q.rightKey })),
      covered,
      total: leftTuples.size,
    };
    const cmp = (a: RankedJoin, b: RankedJoin): boolean => {
      const ca = a.covered * b.total;
      const cb = b.covered * a.total;
      return ca !== cb ? ca > cb : a.unique !== b.unique ? a.unique : a.score !== b.score ? a.score > b.score : a.fine > b.fine;
    };
    if (!best || cmp(cand, best)) best = cand;
  });
  return best;
}

/** Which sheet carries the position of a measurement sheet, and by which key (the ranking is rankJoinKeys, with every left value required on the right). */
function findJoin(meas: SheetInfo, coordSheets: readonly SheetInfo[]): (RankedJoin & { rightInfo: SheetInfo }) | undefined {
  const consumed = new Set<number>(meas.long ? [meas.long.parameterCol, meas.long.valueCol, ...(meas.long.unitCol === undefined ? [] : [meas.long.unitCol])] : []);
  const others = coordSheets.filter((c) => c !== meas);
  const j = rankJoinKeys({ sheet: meas.sheet, columns: meas.proposals, consumed }, others.map((c) => ({ sheet: c.sheet, columns: c.proposals })), { coverage: 'all' });
  return j && { ...j, rightInfo: others[j.right] };
}

/* ---------- public ---------- */

/**
 * Proposes how the sheets of a file fit together (see the layout kinds above). Never throws; a layout the tool cannot
 * read is described in plain words in `unsupported` (and the tables it could still read, if any, stay in `tables`).
 */
export function proposeLayout(file: ParsedFile, opts: { skipTransposed?: boolean } = {}): LayoutPlan {
  if (file.sheets.length === 0) return { tables: [], joins: [], unsupported: reasonsText([{ code: 'no-table' }], 'en'), unsupportedReasons: [{ code: 'no-table' }] };
  const infos = file.sheets.map((s) => analyse(file, s, opts.skipTransposed === true));
  const several = file.sheets.length > 1;
  const reasons: LayoutReason[] = infos.filter((i) => i.unsupported).map((i) => (several ? { code: i.unsupported!, sheet: i.sheet.name } : { code: i.unsupported! }));

  const data = infos.filter((i) => i.isData);
  const coordSheets = data.filter((i) => i.hasPosition);
  const joins: LayoutPlan['joins'] = [];
  const lookups = new Set<SheetInfo>();
  for (const meas of data) {
    if (meas.hasPosition || (meas.nVars === 0 && !meas.long)) continue;
    const j = findJoin(meas, coordSheets);
    if (!j) continue;
    joins.push({ left: meas.sheet.name, right: j.rightInfo.sheet.name, leftKey: j.leftKey, rightKey: j.rightKey, ...(j.extraKeys === undefined ? {} : { extraKeys: j.extraKeys }) });
    lookups.add(j.rightInfo);
  }

  const tables: TablePlan[] = data
    .filter((i) => !(lookups.has(i) && i.nVars === 0 && !i.long))
    .map((i) => (i.long ? { sheet: i.sheet.name, long: i.long } : { sheet: i.sheet.name }));

  const plan: LayoutPlan = { tables, joins };
  if (reasons.length === 0 && tables.length === 0) {
    reasons.push({ code: infos.every((i) => i.sheet.rows.length === 0) ? 'no-rows' : 'no-data-sheet' });
  }
  if (reasons.length > 0) {
    // `unsupported` is the English phrase (technical line, tests); `unsupportedReasons` is what every language renders from.
    plan.unsupported = reasonsText(reasons, 'en');
    plan.unsupportedReasons = reasons;
  }
  return plan;
}

/**
 * One SheetMapping per sheet the plan reads (tables and join lookups), exactly the proposals; long tables get their
 * parameter / unit / value columns marked as consumed by the layout.
 */
export function proposeMappings(file: ParsedFile, layout: LayoutPlan): SheetMapping[] {
  const names: string[] = [];
  for (const t of layout.tables) if (!names.includes(t.sheet)) names.push(t.sheet);
  for (const j of layout.joins) for (const n of [j.left, j.right]) if (!names.includes(n)) names.push(n);
  const out: SheetMapping[] = [];
  for (const name of names) {
    const sheet = file.sheets.find((s) => s.name === name);
    if (!sheet) continue;
    const long = layout.tables.find((t) => t.sheet === name)?.long;
    out.push(toMapping(sheet, proposeColumns(sheet, { ...ctxOf(file), ...(long ? { long } : {}) })));
  }
  return out;
}

/**
 * Splits a plan into independent groups: each row-producing table with the joins that feed it. Tables that do not
 * depend on each other (the sheets of a wide workbook) become separate datasets, so their depth units, dates and
 * variables are never mixed.
 */
export function splitLayout(layout: LayoutPlan): LayoutPlan[] {
  return layout.tables.map((t) => ({ tables: [t], joins: layout.joins.filter((j) => j.left === t.sheet) }));
}
