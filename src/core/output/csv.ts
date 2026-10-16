// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Clean CSV export + sidecar. Values are WRITTEN FROM THEIR ORIGINAL TEXT: nothing is parsed and re-formatted.
import { unitFromHeader } from '../recognize/columns';
import type { ColumnRole, DataRow, Dataset, NumericCell, ParsedDate, RawCell } from '../types';
import { parseNumber } from '../values/numbers';

export interface CleanCsv {
  csv: string;
  /** CSV: original_column,output_column,unit,unit_source,p01. Notes are rows with original_column '(note)' and the text in output_column. */
  sidecar: string;
}

/** RFC 4180 field quoting (lines are joined with '\n'). */
export function csvField(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csvLine = (fields: readonly string[]): string => fields.map(csvField).join(',');

/** OWASP CSV injection: a TEXT cell starting with = + @ - tab or CR gets a leading apostrophe. */
export function guardText(s: string): string {
  return /^[=+@\-\t\r]/.test(s) ? `'${s}` : s;
}

/**
 * Text of one value cell, from its original text. xlsx numbers: String(raw). A decimal-comma number keeps every
 * character except the separator ('3,14' -> '3.14'). Missing tokens ('NA', '', '-') are written as they are (a bare
 * '-' is not a formula). Everything else is text and goes through the formula guard.
 */
export function valueText(raw: RawCell | undefined): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number') return String(raw);
  const t = raw.trim();
  const dot = parseNumber(t, false);
  if (dot.status === 'ok') return t;
  const comma = parseNumber(t, true);
  if (comma.status === 'ok') return t.replace(',', '.');
  if (dot.status === 'missing') return t;
  return guardText(raw);
}

const cellText = (c: NumericCell | undefined): string => valueText(c?.raw);

/**
 * Decimal degrees for a parsed coordinate, rounded to the precision the parser counted (latDecimals/lonDecimals).
 * For a decimal source this reproduces the written digits; for degrees+minutes it is the only honest decimal form.
 */
export function coordinateText(value: number, decimals: number | undefined): string {
  if (decimals === undefined || decimals > 15) return String(value);
  const s = value.toFixed(decimals);
  return /^-0(?:\.0+)?$/.test(s) ? s.slice(1) : s;
}

function dateText(d: ParsedDate): string {
  const timed = d.precision === 'minute' || d.precision === 'second';
  return d.tz === 'utc' && timed && !d.iso.endsWith('Z') ? `${d.iso}Z` : d.iso;
}

type FixedRole = 'station' | 'cruise' | 'sampleId' | 'date' | 'latitude' | 'longitude' | 'depth';
const DATE_KINDS = new Set<ColumnRole['kind']>(['datetime', 'date', 'time']);

function originals(ds: Dataset, pick: (r: ColumnRole) => boolean): string {
  const out: string[] = [];
  for (const m of ds.mappings) for (const c of m.columns) if (pick(c.role) && !out.includes(c.header)) out.push(c.header);
  return out.join(' | ');
}
const originalOf = (ds: Dataset, role: FixedRole): string =>
  originals(ds, (r) => (role === 'date' ? DATE_KINDS.has(r.kind) : r.kind === role));

function depthUnit(ds: Dataset): string | undefined {
  for (const m of ds.mappings) for (const c of m.columns) if (c.role.kind === 'depth' && c.role.unit) return c.role.unit;
  return undefined;
}

class Namer {
  private readonly used = new Set<string>();
  /** `name [unit]` or `name`; a repeated full header gets `_2`, `_3`, ... on the name part. */
  take(name: string, unit?: string): string {
    const head = (n: string) => (unit ? `${n} [${unit}]` : n);
    let h = head(name);
    for (let i = 2; this.used.has(h); i++) h = head(`${name}_${i}`);
    this.used.add(h);
    return h;
  }
}

export function toCleanCsv(ds: Dataset): CleanCsv {
  const rows = ds.rows;
  const has = (f: (r: DataRow) => unknown) => rows.some((r) => f(r) !== undefined);
  const namer = new Namer();
  const notes: string[] = [];
  const side: string[][] = [];

  type Col = { header: string; get: (r: DataRow) => string };
  const cols: Col[] = [];
  const add = (name: string, unit: string | undefined, get: (r: DataRow) => string, sidecar: [string, string, string]) => {
    const header = namer.take(name, unit);
    cols.push({ header, get });
    side.push([sidecar[0], header, unit ?? '', sidecar[1], sidecar[2]]);
  };

  const text = (f: (r: DataRow) => string | undefined) => (r: DataRow) => {
    const v = f(r);
    return v === undefined ? '' : guardText(v);
  };
  if (has((r) => r.station)) add('station', undefined, text((r) => r.station), [originalOf(ds, 'station'), '', '']);
  if (has((r) => r.cruise)) add('cruise', undefined, text((r) => r.cruise), [originalOf(ds, 'cruise'), '', '']);
  if (has((r) => r.sampleId)) add('sample_id', undefined, text((r) => r.sampleId), [originalOf(ds, 'sampleId'), '', '']);

  add('date', 'ISO 8601', (r) => (r.datetime ? dateText(r.datetime) : ''), [originalOf(ds, 'date'), 'output-convention', '']);
  if (rows.some((r) => r.datetime && (r.datetime.precision === 'minute' || r.datetime.precision === 'second') && r.datetime.tz === 'unknown')) {
    notes.push('time zone unknown');
  }
  const undated = rows.filter((r) => r.datetime === undefined && r.dateRaw !== undefined && r.dateRaw !== null).length;
  if (undated > 0) notes.push(`${undated} row(s) have a date that could not be parsed; the date cell is empty`);

  let rounded = false;
  const coord = (value: number | undefined, decimals: number | undefined): string => {
    if (value === undefined) return '';
    const t = coordinateText(value, decimals);
    if (Number(t) !== value) rounded = true;
    return t;
  };
  add('latitude', 'degrees_north', (r) => coord(r.lat, r.latDecimals), [originalOf(ds, 'latitude'), 'output-convention', '']);
  add('longitude', 'degrees_east', (r) => coord(r.lon, r.lonDecimals), [originalOf(ds, 'longitude'), 'output-convention', '']);

  const srcDepth = depthUnit(ds);
  // Depth is written at its reported precision (2.50 stays 2.50) and without a unit when the source states none.
  add('depth', srcDepth, (r) => (r.depth === undefined ? '' : r.depthDecimals === undefined ? String(r.depth) : r.depth.toFixed(r.depthDecimals)), [originalOf(ds, 'depth'), srcDepth ? 'header' : '', '']);
  if (!srcDepth && has((r) => r.depth)) notes.push('depth unit not stated in the source; the column has no unit');
  if (ds.depthPositive === 'up') notes.push('depth is positive upwards in the source; values are not flipped');

  for (const v of ds.variables) {
    const name = unitFromHeader(v.header).name || v.header;
    add(name, v.unit, (r) => cellText(r.values[v.key]), [v.header, v.unitSource ?? '', v.p01 ?? '']);
  }

  const lines = [csvLine(cols.map((c) => guardText(c.header))), ...rows.map((r) => csvLine(cols.map((c) => c.get(r))))];

  if (rounded) notes.push('coordinates parsed from degrees and minutes/seconds are written as decimal degrees rounded to the precision of the source text');
  const sidecar = [
    csvLine(['original_column', 'output_column', 'unit', 'unit_source', 'p01']),
    ...side.map((s) => csvLine(s.map(guardText))),
    ...notes.map((n) => csvLine(['(note)', n, '', '', ''])),
  ];
  return { csv: lines.join('\n') + '\n', sidecar: sidecar.join('\n') + '\n' };
}
