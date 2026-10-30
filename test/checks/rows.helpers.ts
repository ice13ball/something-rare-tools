// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Synthetic datasets for the row-check tests (invented stations and values only).
import type { DataRow, Dataset, MetadataRecord, ParsedDate, Variable } from '../../src/core/types';

export const day = (iso: string): ParsedDate => ({ iso, year: Number(iso.slice(0, 4)), precision: 'day', tz: 'unknown' });

/** Decimals of a coordinate as typed: 12.345 -> 3. */
const decimalsOf = (v: number): number => (String(v).split('.')[1] ?? '').length;

export interface RowSpec {
  line: number;
  lat?: number;
  lon?: number;
  /** Overrides the decimals taken from the number itself (e.g. 77.0 reported with one decimal). */
  latDecimals?: number;
  lonDecimals?: number;
  date?: string;
  station?: string;
  cruise?: string;
  depth?: number;
  sheet?: string;
}

export function row(s: RowSpec): DataRow {
  const r: DataRow = { file: 'a.csv', sheet: s.sheet ?? 'a.csv', line: s.line, values: {} };
  if (s.lat !== undefined) {
    r.lat = s.lat;
    r.latDecimals = s.latDecimals ?? decimalsOf(s.lat);
  }
  if (s.lon !== undefined) {
    r.lon = s.lon;
    r.lonDecimals = s.lonDecimals ?? decimalsOf(s.lon);
  }
  if (s.date !== undefined) {
    r.datetime = day(s.date);
    r.dateRaw = s.date;
  }
  if (s.station !== undefined) r.station = s.station;
  if (s.cruise !== undefined) r.cruise = s.cruise;
  if (s.depth !== undefined) r.depth = s.depth;
  return r;
}

/** `n` rows with consecutive lines starting at `from`, all built from the same spec. */
export const rows = (from: number, n: number, s: Omit<RowSpec, 'line'>): DataRow[] =>
  Array.from({ length: n }, (_, i) => row({ ...s, line: from + i }));

export function dataset(rs: DataRow[], extra: Partial<Dataset> = {}): Dataset {
  return {
    id: 'ds1', label: 'a.csv', file: 'a.csv', rows: rs, variables: [],
    mappings: [], layout: { tables: [], joins: [] }, metadata: [], depthPositive: 'down',
    ...extra,
  };
}

export const variable = (header: string, extra: Partial<Variable> = {}): Variable => ({ key: header, header, ...extra });

export const record = (extra: Partial<MetadataRecord> = {}): MetadataRecord => ({
  source: 'iso19139', label: 'rec', licences: [], restrictionCodes: [], distributionLinks: [], ...extra,
});
