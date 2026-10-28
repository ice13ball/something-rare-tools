// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ColumnProposal, LayoutPlan, ParsedFile, RawRow, RawSheet, SheetMapping, TablePlan } from '../types';
import { parseNumber } from '../values/numbers';
import { isBlankCell, isKnownColumnName, proposeColumns, stripTypeSuffix, toMapping, unitFromHeader } from './columns';
import type { ProposeContext } from './columns';
import { reasonsText, type LayoutReason, type LayoutReasonCode } from './layoutReasons';
import { canonicalFromKey, headerKey, normaliseUnit } from './vocab';

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

function transposedReason(sheet: RawSheet, decimalComma: boolean): LayoutReasonCode | undefined {
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

function headerRowsReason(sheet: RawSheet, decimalComma: boolean): LayoutReasonCode | undefined {
  // the names the tool added (IN-HEADER-SHORT) are not the file's: only the file's own header says whether it is empty
  const cols = sheet.unnamedFrom ?? sheet.header.length;
  if (cols >= 3 && sheet.header.slice(0, cols).filter((h) => h.trim() === '').length * 2 > cols) {
    return 'header-empty';
  }
  if (sheet.rows.length >= 2) {
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
    if (unitCells >= 2) return 'header-units';
  }
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

function analyse(file: ParsedFile, sheet: RawSheet): SheetInfo {
  const ctx = ctxOf(file);
  const empty: SheetInfo = { sheet, proposals: [], hasPosition: false, nVars: 0, isData: false };
  if (sheet.rows.length === 0) return empty;

  let proposals = proposeColumns(sheet, ctx);
  const unsupported = transposedReason(sheet, file.decimalComma) ?? headerRowsReason(sheet, file.decimalComma);
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

interface JoinCandidate {
  right: SheetInfo;
  leftKey: number;
  rightKey: number;
  score: number;
}

function findJoin(meas: SheetInfo, coordSheets: readonly SheetInfo[]): JoinCandidate | undefined {
  const consumed = new Set<number>(meas.long ? [meas.long.parameterCol, meas.long.valueCol, ...(meas.long.unitCol === undefined ? [] : [meas.long.unitCol])] : []);
  let best: JoinCandidate | undefined;
  for (const coord of coordSheets) {
    if (coord === meas) continue;
    for (const mp of meas.proposals) {
      if (!KEY_KINDS.has(mp.role.kind) || consumed.has(mp.index)) continue;
      const m = keyValues(meas.sheet, mp.index);
      if (m.values.size === 0) continue;
      for (const cp of coord.proposals) {
        if (!KEY_KINDS.has(cp.role.kind)) continue;
        const c = keyValues(coord.sheet, cp.index);
        let subset = true;
        for (const v of m.values) {
          if (!c.values.has(v)) {
            subset = false;
            break;
          }
        }
        if (!subset) continue;
        const headerEq = cleanKey(mp.header) === cleanKey(cp.header);
        const strong = STRONG_KEY_KINDS.has(mp.role.kind);
        if (!headerEq && !(c.unique && strong)) continue;
        const score = (headerEq ? 2 : 0) + (strong ? 1 : 0);
        if (!best || score > best.score) best = { right: coord, leftKey: mp.index, rightKey: cp.index, score };
      }
    }
  }
  return best;
}

/* ---------- public ---------- */

/**
 * Proposes how the sheets of a file fit together (see the layout kinds above). Never throws; a layout the tool cannot
 * read is described in plain words in `unsupported` (and the tables it could still read, if any, stay in `tables`).
 */
export function proposeLayout(file: ParsedFile): LayoutPlan {
  if (file.sheets.length === 0) return { tables: [], joins: [], unsupported: reasonsText([{ code: 'no-table' }], 'en'), unsupportedReasons: [{ code: 'no-table' }] };
  const infos = file.sheets.map((s) => analyse(file, s));
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
    joins.push({ left: meas.sheet.name, right: j.right.sheet.name, leftKey: j.leftKey, rightKey: j.rightKey });
    lookups.add(j.right);
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
