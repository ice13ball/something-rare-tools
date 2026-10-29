// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { isBlankCell } from '../recognize/columns';
import { headerKey } from '../recognize/vocab';
import { makeConvertFinding } from '../rules/convert';
import type { ColumnProposal, Finding, ParsedFile, PivotInfo, RawCell, RawRow, RawSheet } from '../types';
import { isQualityHeader, proposeConvertColumns } from './recognize';

/*
 * The converter's reader of a LONG ENVIRONMENTAL sheet: one row per measured parameter, with a parameter column, a value column and, optionally, a unit column.
 * It is the converter's own and explicit (never /check's LayoutPlan.long heuristic): a sheet is read as one only when
 *   (a) its headers name a parameter column and a value column (the same header lists CONV-LONG-UNSUPPORTED uses; a unit column is optional),
 *   (b) the converter's own proposal has no taxon cell, no quantity and no measured-variable column besides them (a taxon column the proposer is not sure of does not count: it is
 *       a candidate the page leaves out until the user confirms it, as everywhere),
 *   (c) the parameter column holds at least two distinct values, and
 *   (d) there are at most MAX_PAIRS distinct (parameter, unit) pairs.
 * When (a) and (b) hold and (c) or (d) fails, nothing is read: the sheet stays unread and CONV-LONG-UNSUPPORTED says why (longReasonOf).
 *
 * The result is a plain wide sheet that the rest of the converter reads like any other: one row per SAMPLE (the key of a row is EVERY column that is not the parameter, unit, value
 * or a quality flag), one column per distinct (parameter, unit) pair, headed "<parameter> [<unit>]". The cell is the original cell, untouched. Nothing is summed, averaged or chosen:
 * a second row for the same sample and the same pair is not merged, it is reported (`duplicates`) and the conversion blocks. `pivot` on the new sheet says where every cell came from.
 */

/** The strict header names (headerKey: diacritics folded) of a long environmental sheet. */
export const LONG_PARAMETER = new Set(['parameter', 'parameters', 'parametr', 'parametre', 'variable', 'determinand', 'analyte', 'measurement type', 'measurementtype']);
export const LONG_VALUE = new Set(['value', 'values', 'wartosc', 'wert', 'valeur', 'result', 'measurement value', 'measurementvalue']);
export const LONG_UNIT = new Set(['unit', 'units', 'jednostka', 'einheit', 'unite']);

/** The most distinct (parameter, unit) pairs one long sheet may have: each becomes a column. */
export const MAX_PAIRS = 200;

export interface LongColumns {
  parameterAt: number;
  valueAt: number;
  unitAt: number | undefined;
}

/** The parameter, value and unit columns a header names (the first of each), or undefined without a parameter AND a value column. */
export function longColumnsOf(header: readonly string[]): LongColumns | undefined {
  const parameterAt = header.findIndex((h) => LONG_PARAMETER.has(headerKey(h)));
  const valueAt = header.findIndex((h) => LONG_VALUE.has(headerKey(h)));
  if (parameterAt < 0 || valueAt < 0) return undefined;
  const u = header.findIndex((h, i) => i !== parameterAt && i !== valueAt && LONG_UNIT.has(headerKey(h)));
  return { parameterAt, valueAt, unitAt: u < 0 ? undefined : u };
}

const text = (c: RawCell | undefined): string | undefined => {
  if (c === null || c === undefined) return undefined;
  const t = String(c).trim();
  return t === '' ? undefined : t;
};

/** Why a long sheet is not read, when its columns say it is one: fewer than two parameters, or more pairs than a sheet may have. */
export type LongReason = 'one-parameter' | 'too-many';

/** The distinct non-empty parameter texts and the distinct (parameter, unit) pairs of a sheet; the scan stops counting pairs past the cap. */
function scan(sheet: RawSheet, c: LongColumns, skip: ReadonlySet<number>): { params: Set<string>; pairs: number } {
  const params = new Set<string>();
  const pairs = new Set<string>();
  for (const row of sheet.rows) {
    if (skip.has(row.line)) continue;
    const p = text(row.cells[c.parameterAt]);
    if (p === undefined) continue;
    params.add(p);
    if (pairs.size <= MAX_PAIRS) pairs.add(`${p}\u0001${c.unitAt === undefined ? '' : (text(row.cells[c.unitAt]) ?? '')}`);
  }
  return { params, pairs: pairs.size };
}

/** (c) and (d) for a sheet whose headers name the long columns: the reason it cannot be read, or undefined when it can. */
export function longReasonOf(sheet: RawSheet, c: LongColumns, ragged: ReadonlySet<number> = new Set()): { reason: LongReason; count: number } | undefined {
  const s = scan(sheet, c, ragged);
  if (s.params.size < 2) return { reason: 'one-parameter', count: s.params.size };
  if (s.pairs > MAX_PAIRS) return { reason: 'too-many', count: s.pairs };
  return undefined;
}

/**
 * (b), in the converter's own proposal: no taxon cell, no quantity, no measured variable outside the three long columns. Taxon columns that are only candidates (low confidence) are
 * left out, as the page does until the user confirms them; a taxon the proposer is sure of ("Taxon", "scientificName") makes it a biology sheet.
 */
function proposalAllowsPivot(proposals: readonly ColumnProposal[], own: ReadonlySet<number>): boolean {
  for (const p of proposals) {
    if (own.has(p.index)) continue;
    const r = p.role;
    if (r.kind === 'quantity' || r.kind === 'quantityType' || r.kind === 'occurrenceId' || r.kind === 'taxonId') return false;
    if (r.kind === 'taxon' && (r.header !== true || p.confidence !== 'low')) return false;
    if (r.kind === 'variable') return false;
  }
  return true;
}

export type LongVerdict = { kind: 'no' } | { kind: 'blocked'; reason: LongReason; count: number } | { kind: 'pivot'; sheet: RawSheet };

const raggedOf = (file: ParsedFile, sheet: string): ReadonlySet<number> => new Set(file.findings.filter((f) => f.ruleId === 'ROW-RAGGED' && f.sheet === sheet).flatMap((f) => f.lines ?? []));

/** Reads one sheet: pivoted, left alone (not a long sheet) or blocked (a long sheet that cannot be read safely). */
export function readLongSheet(file: ParsedFile, sheet: RawSheet): LongVerdict {
  if (sheet.pivot !== undefined) return { kind: 'no' };
  const c = longColumnsOf(sheet.header);
  if (c === undefined) return { kind: 'no' };
  const own = new Set([c.parameterAt, c.valueAt, ...(c.unitAt === undefined ? [] : [c.unitAt])]);
  const proposals = proposeConvertColumns(sheet, { decimalComma: file.decimalComma, date1904: file.date1904 });
  if (!proposalAllowsPivot(proposals, own)) return { kind: 'no' };
  const ragged = raggedOf(file, sheet.name);
  const why = longReasonOf(sheet, c, ragged);
  if (why !== undefined) return { kind: 'blocked', ...why };
  return { kind: 'pivot', sheet: pivotSheet(sheet, c, ragged) };
}

interface Group {
  /** the first row of the group: its cells are the key values of the pivoted row */
  first: RawRow;
  /** pair index -> the cell and the original line; a repeated pair keeps its first cell and lists every line */
  entries: Map<number, { cell: RawCell; line: number; lines: number[] }>;
}

function pivotSheet(sheet: RawSheet, c: LongColumns, ragged: ReadonlySet<number>): RawSheet {
  const header = sheet.header;
  const own = new Set([c.parameterAt, c.valueAt, ...(c.unitAt === undefined ? [] : [c.unitAt])]);
  // the key: every column but the parameter, the unit, the value and the quality flags (a flag column is dropped, and said)
  const keyAt: number[] = [];
  const flagColumns: string[] = [];
  for (let i = 0; i < header.length; i++) {
    if (own.has(i)) continue;
    if (isQualityHeader(header[i], header)) flagColumns.push(header[i].trim());
    else keyAt.push(i);
  }
  const keyHeaders = keyAt.map((i) => header[i]);

  // first pass: the parameters, to tell the flags from the measurements (a flag name needs the other names as siblings)
  const names = [...scan(sheet, c, ragged).params];
  const siblings = [...names, ...keyHeaders];
  const flagNames = new Set(names.filter((n) => isQualityHeader(n, siblings)));

  // second pass: groups by the whole key, pairs in the order they first appear
  const pairIndex = new Map<string, number>();
  const pairs: { parameter: string; unit?: string }[] = [];
  const groups: Group[] = [];
  const byKey = new Map<string, Group>();
  const duplicates = new Map<string, { header: string; lines: number[] }>();
  const unnamed: number[] = [];
  let rowsIn = 0;
  let flagRows = 0;
  for (const row of sheet.rows) {
    if (ragged.has(row.line)) continue;
    const parameter = text(row.cells[c.parameterAt]);
    const value = row.cells[c.valueAt] ?? null;
    if (parameter === undefined) {
      if (!isBlankCell(value)) unnamed.push(row.line);
      continue;
    }
    rowsIn++;
    if (flagNames.has(parameter)) {
      flagRows++;
      continue;
    }
    const unit = c.unitAt === undefined ? undefined : text(row.cells[c.unitAt]);
    const pk = `${parameter}\u0001${unit ?? ''}`;
    let pi = pairIndex.get(pk);
    if (pi === undefined) {
      pi = pairs.length;
      pairIndex.set(pk, pi);
      pairs.push(unit === undefined ? { parameter } : { parameter, unit });
    }
    let key = '';
    let empty = true;
    for (const i of keyAt) {
      const t = text(row.cells[i]);
      if (t !== undefined) empty = false;
      key += `${t ?? ''}\u0001`;
    }
    // a row whose key is entirely empty is its own group: nothing says it belongs with any other
    let g = empty ? undefined : byKey.get(key);
    if (g === undefined) {
      g = { first: row, entries: new Map() };
      groups.push(g);
      if (!empty) byKey.set(key, g);
    }
    const had = g.entries.get(pi);
    if (had === undefined) g.entries.set(pi, { cell: value, line: row.line, lines: [row.line] });
    else had.lines.push(row.line);
  }

  // the headers: "<parameter> [<unit>]", unique among all headers of the new sheet
  const used = new Set(keyHeaders.map((h) => h.trim().toLowerCase()));
  const renamed: string[] = [];
  const headers = pairs.map((p) => {
    const base = p.unit === undefined ? p.parameter : `${p.parameter} [${p.unit}]`;
    let h = base;
    for (let n = 2; used.has(h.toLowerCase()); n++) h = `${base} (${n})`;
    used.add(h.toLowerCase());
    if (h !== base) renamed.push(h);
    return h;
  });
  for (const g of groups) {
    for (const [pi, e] of g.entries) {
      if (e.lines.length > 1) duplicates.set(`${g.first.line}\u0001${pi}`, { header: headers[pi], lines: e.lines });
    }
  }

  const width = keyAt.length + pairs.length;
  const rows: RawRow[] = groups.map((g) => {
    const cells: RawCell[] = new Array<RawCell>(width).fill(null);
    keyAt.forEach((at, j) => (cells[j] = g.first.cells[at] ?? null));
    for (const [pi, e] of g.entries) cells[keyAt.length + pi] = e.cell;
    return { line: g.first.line, cells, fieldCount: width };
  });
  const cellLines: Record<number, number[]> = Object.create(null) as Record<number, number[]>;
  groups.forEach((g, gi) => {
    const lines = new Array<number>(pairs.length).fill(rows[gi].line);
    for (const [pi, e] of g.entries) lines[pi] = e.line;
    cellLines[rows[gi].line] = lines;
  });

  const pivot: PivotInfo = {
    parameterColumn: header[c.parameterAt].trim(),
    valueColumn: header[c.valueAt].trim(),
    ...(c.unitAt === undefined ? {} : { unitColumn: header[c.unitAt].trim() }),
    pivoted: pairs.map((p, i) => ({ index: keyAt.length + i, parameter: p.parameter, ...(p.unit === undefined ? {} : { unit: p.unit }) })),
    rowsIn,
    samples: rows.length,
    cellLines,
    renamed,
    flagColumns,
    flagParameters: names.filter((n) => flagNames.has(n)),
    flagRows,
    duplicates: [...duplicates.values()],
    unnamed,
  };
  return {
    name: sheet.name,
    header: [...keyHeaders, ...headers],
    headerLine: sheet.headerLine,
    rows,
    ...(sheet.dateFormatted === undefined ? {} : { dateFormatted: [...keyAt.map((i) => sheet.dateFormatted?.[i] === true), ...pairs.map(() => false)] }),
    ...(sheet.timeFormatted === undefined ? {} : { timeFormatted: [...keyAt.map((i) => sheet.timeFormatted?.[i] === true), ...pairs.map(() => false)] }),
    pivot,
  };
}

/**
 * The file as the converter reads it: every long environmental sheet that can be read safely replaced by its pivot (pivotSheet). Other sheets, and a sheet that cannot be read, are left
 * as they are (a long sheet that cannot be read is blocked later, by CONV-LONG-UNSUPPORTED). Pure; the input is not changed; the same file object comes back when nothing was pivoted.
 */
export function pivotConvertFile(file: ParsedFile): ParsedFile {
  let changed = false;
  const sheets = file.sheets.map((s) => {
    const v = readLongSheet(file, s);
    if (v.kind !== 'pivot') return s;
    changed = true;
    return v.sheet;
  });
  return changed ? { ...file, sheets } : file;
}

/** What the page needs of a pivot to say it when the file is READ (the lines of every cell stay in the worker). */
export type PivotNote = Omit<PivotInfo, 'cellLines'>;

/** The note of a pivot, as the findings that say it: how the sheet was read, the flag columns and flag parameters left out, the headers that were renamed. All information. */
export function pivotNoteFindings(file: string, sheet: string, p: PivotNote): Finding[] {
  const out: Finding[] = [makeConvertFinding('CONV-LONG-READ', { file, sheet, params: { parameterColumn: p.parameterColumn, valueColumn: p.valueColumn, rows: p.rowsIn, samples: p.samples, columns: p.pivoted.length } })];
  if (p.flagColumns.length > 0) out.push(makeConvertFinding('CONV-LONG-FLAG-COLUMNS', { file, sheet, params: { count: p.flagColumns.length, columns: p.flagColumns.join(', ') } }));
  if (p.flagParameters.length > 0) out.push(makeConvertFinding('CONV-LONG-FLAG-PARAMETERS', { file, sheet, params: { count: p.flagParameters.length, names: p.flagParameters.join(', '), rows: p.flagRows } }));
  if (p.renamed.length > 0) out.push(makeConvertFinding('CONV-LONG-RENAMED', { file, sheet, params: { count: p.renamed.length, names: p.renamed.join(', ') } }));
  return out;
}

/** What a pivot cannot read: a sample with the same parameter and unit twice (one finding per sample and column, its original lines) and rows with a value and no parameter name. Blocking. */
export function pivotBlockFindings(file: string, sheet: string, p: PivotNote): Finding[] {
  const out: Finding[] = p.duplicates.map((d) => makeConvertFinding('CONV-LONG-DUPLICATE', { file, sheet, field: d.header, lines: d.lines }));
  if (p.unnamed.length > 0) out.push(makeConvertFinding('CONV-LONG-NO-PARAMETER', { file, sheet, lines: p.unnamed, params: { count: p.unnamed.length } }));
  return out;
}

const OWN_LINES: ReadonlySet<string> = new Set(['CONV-LONG-DUPLICATE', 'CONV-LONG-NO-PARAMETER']);

/**
 * The findings of the pivot's cells name the line of the PIVOTED row (the first original line of its sample): a finding about a pivoted column is moved to the line the cell came from.
 * A finding about a key column keeps that line, which is a line of the sample.
 */
export function originalLines(findings: readonly Finding[], file: string, sheet: RawSheet): Finding[] {
  const p = sheet.pivot;
  if (p === undefined) return [...findings];
  const position = new Map(p.pivoted.map((c, i) => [sheet.header[c.index], i] as const));
  return findings.map((f) => {
    // the findings of the pivot itself already carry original lines
    if (f.file !== file || f.sheet !== sheet.name || f.field === undefined || f.lines === undefined || OWN_LINES.has(f.ruleId)) return f;
    const at = position.get(f.field);
    if (at === undefined) return f;
    return { ...f, lines: [...new Set(f.lines.map((l) => p.cellLines[l]?.[at] ?? l))].sort((a, b) => a - b) };
  });
}
