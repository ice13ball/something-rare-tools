// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Dataset builders for the category C tests (cross-file and chemistry). Invented values only.
import type { DataRow, Dataset, Finding, NumericCell, ParsedDate, Variable } from '../../src/core/types';

export interface VarSpec {
  key: string;
  canonical?: string;
  unit?: string;
  header?: string;
}
/** A cell is a number or the text as written (the text keeps its decimals: '41.70' has two). */
export type Cell = number | string;
export interface RowSpec {
  station?: string;
  cruise?: string;
  lat?: Cell;
  lon?: Cell;
  date?: string;
  depth?: Cell;
  line?: number;
  v?: Record<string, Cell>;
}
export interface DsOpts {
  id?: string;
  file?: string;
  /** Present for a sheet of a workbook: the label becomes `file (sheet)` like the real dataset builder's. */
  sheet?: string;
  label?: string;
  vars?: VarSpec[];
  /** Unit of the depth column; null = the column states none. Default 'm'. */
  depthUnit?: string | null;
  depthPositive?: Dataset['depthPositive'];
}

export const decimalsOf = (c: Cell): number => {
  const m = /\.(\d+)/.exec(String(c));
  return m ? m[1].length : 0;
};

export const parsedDate = (iso: string): ParsedDate => ({
  iso,
  year: Number(iso.slice(0, 4)),
  precision: iso.length <= 10 ? 'day' : 'minute',
  tz: 'unknown',
});

export const numCell = (c: Cell, line: number): NumericCell => ({ raw: String(c), line, value: Number(c), decimals: decimalsOf(c), status: 'ok' });

export function makeCDataset(opts: DsOpts, rows: RowSpec[]): Dataset {
  const file = opts.file ?? `${opts.id ?? 'a'}.csv`;
  const label = opts.label ?? (opts.sheet ? `${file} (${opts.sheet})` : file);
  const sheet = opts.sheet ?? file;
  const variables: Variable[] = (opts.vars ?? []).map((v) => ({ header: v.key, ...v }));
  const depthUnit = opts.depthUnit === undefined ? 'm' : opts.depthUnit;
  const positive = opts.depthPositive ?? 'down';
  const dataRows: DataRow[] = rows.map((r, i) => {
    const line = r.line ?? i + 2;
    const row: DataRow = { file, sheet, line, values: {} };
    if (r.station !== undefined) row.station = r.station;
    if (r.cruise !== undefined) row.cruise = r.cruise;
    if (r.lat !== undefined) Object.assign(row, { lat: Number(r.lat), latDecimals: decimalsOf(r.lat) });
    if (r.lon !== undefined) Object.assign(row, { lon: Number(r.lon), lonDecimals: decimalsOf(r.lon) });
    if (r.date !== undefined) row.datetime = parsedDate(r.date);
    if (r.depth !== undefined) Object.assign(row, { depth: Number(r.depth), depthDecimals: decimalsOf(r.depth) });
    for (const [k, c] of Object.entries(r.v ?? {})) row.values[k] = numCell(c, line);
    return row;
  });
  return {
    id: opts.id ?? 'a',
    label,
    file,
    rows: dataRows,
    variables,
    mappings: [
      {
        sheet,
        columns: [{ index: 0, header: 'Depth', role: depthUnit === null ? { kind: 'depth', positive } : { kind: 'depth', positive, unit: depthUnit } }],
      },
    ],
    layout: { tables: [{ sheet }], joins: [] },
    metadata: [],
    depthPositive: positive,
  };
}

export const byRule = (fs: Finding[], id: string): Finding[] => fs.filter((f) => f.ruleId === id);
