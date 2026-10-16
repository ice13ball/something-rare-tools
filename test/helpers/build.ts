// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Builders for check tests: datasets, rows and metadata records made in memory from invented values.
import type { DataRow, Dataset, LicenceStatement, MetadataRecord, MetadataSource, ParsedDate, Variable } from '../../src/core/types';

/** A ParsedDate from an ISO string; precision follows its length. */
export function makeDate(iso: string): ParsedDate {
  const precision = iso.length <= 4 ? 'year' : iso.length <= 7 ? 'month' : iso.length <= 10 ? 'day' : iso.length <= 16 ? 'minute' : 'second';
  return { iso, year: Number(iso.slice(0, 4)), precision, tz: 'unknown' };
}

/** A row; `line` defaults to index + 2 (header on line 1). A string `datetime` is parsed into a ParsedDate. */
export function makeRow(p: Partial<Omit<DataRow, 'datetime'>> & { datetime?: string | ParsedDate } = {}, index = 0): DataRow {
  const { datetime, ...rest } = p;
  const row: DataRow = { file: 'data.csv', sheet: 'data', line: index + 2, values: {}, ...rest };
  if (datetime !== undefined) row.datetime = typeof datetime === 'string' ? makeDate(datetime) : datetime;
  return row;
}

/** A variable; `key` and `header` default to each other. */
export function makeVariable(p: Partial<Variable> = {}): Variable {
  const key = p.key ?? p.header ?? 'var';
  return { key, header: key, ...p };
}

export function makeDataset(
  rows: (Partial<Omit<DataRow, 'datetime'>> & { datetime?: string | ParsedDate })[] = [],
  vars: Partial<Variable>[] = [],
  extra: Partial<Dataset> = {},
): Dataset {
  return {
    id: 'ds1',
    label: 'data.csv',
    file: 'data.csv',
    rows: rows.map((r, i) => makeRow(r, i)),
    variables: vars.map((v) => makeVariable(v)),
    mappings: [],
    layout: { tables: [], joins: [] },
    metadata: [],
    depthPositive: 'unknown',
    ...extra,
  };
}

/** A metadata record with empty collections unless overridden. */
export function makeRecord(source: MetadataSource, p: Partial<MetadataRecord> = {}): MetadataRecord {
  return { source, label: `${source} record`, licences: [], restrictionCodes: [], distributionLinks: [], ...p };
}

/** A licence statement of the given source. */
export function makeLicence(source: MetadataSource, p: Partial<LicenceStatement> = {}): LicenceStatement {
  return { source, field: 'useLimitation', ...p };
}
