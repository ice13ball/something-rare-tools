// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Hand-built synthetic datasets for the output tests (invented stations and values).
import type { DataRow, Dataset, NumericCell, ParsedDate, RawCell, Variable } from '../../src/core/types';

export const ok = (raw: RawCell, line: number, value: number, decimals = 0): NumericCell => ({ raw, line, value, decimals, status: 'ok' });
export const text = (raw: string, line: number): NumericCell => ({ raw, line, status: 'non-numeric' });

export const day = (iso: string): ParsedDate => ({ iso, year: Number(iso.slice(0, 4)), precision: 'day', tz: 'unknown' });

export function row(line: number, extra: Partial<DataRow> = {}): DataRow {
  return { file: 'a.csv', sheet: 'a.csv', line, values: {}, ...extra };
}

export function dataset(rows: DataRow[], variables: Variable[] = [], extra: Partial<Dataset> = {}): Dataset {
  return {
    id: 'ds1', label: 'a.csv', file: 'a.csv', rows, variables,
    mappings: [], layout: { tables: [], joins: [] }, metadata: [], depthPositive: 'down',
    ...extra,
  };
}
