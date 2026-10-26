// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { Collector } from '../dataset';
import { isBlankCell, proposeColumns } from '../recognize/columns';
import { makeConvertFinding } from '../rules/convert';
import type { ColumnProposal, ColumnRole, Finding, ParsedFile, RawCell, RawRow, RawSheet, TablePlan } from '../types';
import { parseNumber } from '../values/numbers';
import { OVERLAY_REASONS } from './recognize';

/*
 * The long measurement sheet (/check's "long layout": one row per measurement, a parameter column, an optional unit column and a value column) turned into the shape the converter
 * already reads: ONE ROW PER SAMPLE OR LEVEL with ONE COLUMN PER PARAMETER, so that every parameter goes the normal way of a measured variable to an eMoF row on the sample event
 * (plan 2.6: "Long measurement sheets (/check long layout): eMoF on the sample event"). The plan of the layout is /check's own (recognize/layout.ts, `LayoutPlan.tables[].long`); nothing
 * of the detection is repeated here and /check is not changed.
 *
 *   key         the columns that say WHERE and WHEN a measurement was made (station, cruise, sample code, latitude, longitude, date, time, depth, pressure, depth below the seafloor, as
 *               /check reads them in this layout): rows with the same key texts are one sample or level, in first-seen order
 *   carried     every other column (a method, a remark, a replicate): its cell of the FIRST row of the group stays, with its role (the user sees it and decides), and is not part of the key
 *   parameters  one column per distinct (parameter, unit) pair, named `Parameter [unit]`; its cell is the value of the row, as the sheet wrote it
 *
 * Nothing is chosen for the user. A value that is text or NA is reported at ITS line (ROW-NON-NUMERIC, ROW-NA-VARIANT) and its cell is left empty; a parameter given twice for one sample with
 * different values blocks (CONV-LONG-DUPLICATE), the same value twice is one value; a row with a value and no parameter is not read and is said (CONV-LONG-ROWS-SKIPPED).
 */

const CONTEXT_KINDS: ReadonlySet<ColumnRole['kind']> = new Set(['station', 'cruise', 'sampleId', 'latitude', 'longitude', 'date', 'datetime', 'time', 'depth', 'pressure']);

export interface PivotColumn {
  /** Index in the pivoted sheet. */
  index: number;
  /** The parameter as the sheet wrote it, and its unit when the sheet has a unit column and the row gave one. */
  name: string;
  unit?: string;
}

export interface PivotResult {
  sheet: RawSheet;
  /** The columns that come from parameters. */
  columns: PivotColumn[];
  findings: Finding[];
}

const text = (c: RawCell | undefined): string => (c === null || c === undefined ? '' : String(c).trim());

/** The pivoted sheet of a long one, or undefined when the plan cannot be applied (no row has a parameter). */
export function pivotLongSheet(file: ParsedFile, sheet: RawSheet, plan: NonNullable<TablePlan['long']>): PivotResult | undefined {
  const proposals: ColumnProposal[] = proposeColumns(sheet, { decimalComma: file.decimalComma, date1904: file.date1904, long: plan });
  const plan3 = new Set<number>([plan.parameterCol, plan.valueCol, ...(plan.unitCol === undefined ? [] : [plan.unitCol])]);
  const keyCols = proposals.filter((p) => !plan3.has(p.index) && CONTEXT_KINDS.has(p.role.kind)).map((p) => p.index);
  const keySet = new Set(keyCols);
  const carried = sheet.header.map((_, i) => i).filter((i) => !plan3.has(i) && !keySet.has(i));
  const base = [...keyCols, ...carried].sort((a, b) => a - b);
  const collector = new Collector(file.fileName);
  const findings: Finding[] = [];

  interface Group {
    first: RawRow;
    values: Map<string, { cell: RawCell; line: number }>;
  }
  const groups = new Map<string, Group>();
  const columns = new Map<string, { name: string; unit?: string }>();
  const duplicates: { name: string; lines: number[] }[] = [];
  const skipped: number[] = [];
  const header = sheet.header;
  for (const row of sheet.rows) {
    const name = text(row.cells[plan.parameterCol]);
    const cell = row.cells[plan.valueCol] ?? null;
    if (name === '') {
      if (!isBlankCell(cell)) skipped.push(row.line);
      continue;
    }
    const unit = plan.unitCol === undefined ? '' : text(row.cells[plan.unitCol]);
    const colKey = `${name}\u0000${unit}`;
    if (!columns.has(colKey)) columns.set(colKey, { name, ...(unit === '' ? {} : { unit }) });
    const key = JSON.stringify(keyCols.map((i) => text(row.cells[i])));
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { first: row, values: new Map() }));
    // the value: text and NA are said at their own line and left empty; a number stays as the sheet wrote it
    let kept: RawCell = cell;
    const p = parseNumber(cell, file.decimalComma);
    if (p.status === 'non-numeric') {
      collector.add('ROW-NON-NUMERIC', sheet.name, name, row.line, p.token);
      kept = null;
    } else if (p.status === 'na-variant') {
      collector.add('ROW-NA-VARIANT', sheet.name, name, row.line, p.token);
      kept = null;
    } else if (p.status === 'missing') kept = null;
    const earlier = g.values.get(colKey);
    if (earlier === undefined) g.values.set(colKey, { cell: kept, line: row.line });
    else if (text(earlier.cell) !== text(kept) && !(earlier.cell === null || kept === null)) {
      const d = duplicates.find((x) => x.name === name);
      if (d) d.lines.push(row.line);
      else duplicates.push({ name, lines: [earlier.line, row.line] });
    } else if (earlier.cell === null && kept !== null) g.values.set(colKey, { cell: kept, line: row.line });
  }
  if (columns.size === 0) return undefined;

  const colList = [...columns.entries()];
  const outHeader = [...base.map((i) => header[i]), ...colList.map(([, c]) => (c.unit === undefined ? c.name : `${c.name} [${c.unit}]`))];
  const rows: RawRow[] = [...groups.values()].map((g) => {
    const cells: RawCell[] = [...base.map((i) => g.first.cells[i] ?? null), ...colList.map(([k]) => g.values.get(k)?.cell ?? null)];
    return { line: g.first.line, cells, fieldCount: cells.length };
  });
  const pickFlags = (flags: boolean[] | undefined): boolean[] | undefined => (flags === undefined ? undefined : [...base.map((i) => flags[i] === true), ...colList.map(() => false)]);
  const out: RawSheet = {
    name: sheet.name,
    header: outHeader,
    headerLine: sheet.headerLine,
    rows,
    ...(sheet.dateFormatted ? { dateFormatted: pickFlags(sheet.dateFormatted) as boolean[] } : {}),
    ...(sheet.timeFormatted ? { timeFormatted: pickFlags(sheet.timeFormatted) as boolean[] } : {}),
  };

  const where = { file: file.fileName, sheet: sheet.name };
  findings.push(makeConvertFinding('CONV-LONG-PIVOTED', { ...where, params: { rows: sheet.rows.length, samples: rows.length, variables: colList.length } }));
  if (skipped.length > 0) findings.push(makeConvertFinding('CONV-LONG-ROWS-SKIPPED', { ...where, lines: skipped, params: { count: skipped.length } }));
  for (const d of duplicates) findings.push(makeConvertFinding('CONV-LONG-DUPLICATE', { ...where, field: d.name, value: d.name, lines: d.lines, params: { count: new Set(d.lines).size } }));
  findings.push(...collector.findings());
  return { sheet: out, columns: colList.map(([, c], i) => ({ index: base.length + i, name: c.name, ...(c.unit === undefined ? {} : { unit: c.unit }) })), findings };
}

/**
 * The proposals of the pivoted sheet with its parameter columns read as what they are: a measured variable named by the parameter, with the unit of the unit column. A parameter the
 * converter knows by name keeps what the proposer made of it (canonical variables, concepts); one it does not know would otherwise be taken for a species column of a wide sheet, which
 * it is not.
 */
export function pivotProposals(proposals: ColumnProposal[], columns: readonly PivotColumn[]): ColumnProposal[] {
  const by = new Map(columns.map((c) => [c.index, c]));
  return proposals.map((p) => {
    const c = by.get(p.index);
    if (c === undefined || p.role.kind === 'variable') return p;
    const unit = c.unit;
    const { reasonParams: _a, reasonLead: _b, reasonNotes: _c, ...rest } = p;
    return {
      ...rest,
      role: { kind: 'variable', variable: c.name, ...(unit === undefined ? {} : { unit, unitSource: 'header' as const }) },
      confidence: 'high',
      reason: OVERLAY_REASONS['long-parameter'],
      reasonCode: 'long-parameter',
    };
  });
}
