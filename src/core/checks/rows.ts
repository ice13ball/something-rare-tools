// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

import { makeFinding, threshold } from '../rules/registry';
import type { ColumnRole, DataRow, Dataset, Finding, Variable } from '../types';

/*
 * Category B — row checks.
 *
 * The dataset builder already raises ROW-DM-COORDS, ROW-LON-360, ROW-DATE-UNPARSEABLE, ROW-DATE-YYMMDD, ROW-TZ-UNKNOWN,
 * ROW-NON-NUMERIC and ROW-NA-VARIANT (and the parser ROW-RAGGED); this file never repeats them.
 * Row-level findings are produced per sheet, because physical line numbers only mean something within one sheet.
 */

const MAX_HEADERS = 10;
const MAX_DATES = 3;

/* ---------- small helpers ---------- */

const decimalsOfNumber = (v: number): number => (String(v).split('.')[1] ?? '').length;

function fmt(v: number, decimals: number | undefined): string {
  return decimals !== undefined && decimals >= 0 && decimals <= 20 ? v.toFixed(decimals) : String(v);
}

function bySheet(rows: readonly DataRow[]): Map<string, DataRow[]> {
  const out = new Map<string, DataRow[]>();
  for (const r of rows) {
    const list = out.get(r.sheet);
    if (list) list.push(r);
    else out.set(r.sheet, [r]);
  }
  return out;
}

/** Header of the first column of the sheet whose role has the given kind (used for `field` / `header`). */
function headerOf(ds: Dataset, sheet: string, kind: ColumnRole['kind']): string | undefined {
  const m = ds.mappings.find((x) => x.sheet === sheet) ?? ds.mappings[0];
  return m?.columns.find((c) => c.role.kind === kind)?.header;
}

const dayOf = (r: DataRow): string | undefined => r.datetime?.iso.slice(0, 10);

/* ---------- ROW-LAT-RANGE, ROW-LON-RANGE, ROW-LAT-EQ-LON ---------- */

function positionRules(ds: Dataset, sheet: string, rows: DataRow[], out: Finding[]): void {
  const latMin = threshold('ROW-LAT-RANGE', 'latitude.min');
  const latMax = threshold('ROW-LAT-RANGE', 'latitude.max');
  const lonMin = threshold('ROW-LON-RANGE', 'longitude.min');
  const lonMax = threshold('ROW-LON-RANGE', 'longitude.max');

  const badLat = rows.filter((r) => r.lat !== undefined && (r.lat < latMin || r.lat > latMax));
  if (badLat.length > 0) {
    const field = headerOf(ds, sheet, 'latitude');
    out.push(
      makeFinding('ROW-LAT-RANGE', {
        file: ds.file, sheet, lines: badLat.map((r) => r.line),
        ...(field !== undefined ? { field } : {}),
        value: fmt(badLat[0].lat!, badLat[0].latDecimals),
      }),
    );
  }
  const badLon = rows.filter((r) => r.lon !== undefined && (r.lon < lonMin || r.lon > lonMax));
  if (badLon.length > 0) {
    const field = headerOf(ds, sheet, 'longitude');
    out.push(
      makeFinding('ROW-LON-RANGE', {
        file: ds.file, sheet, lines: badLon.map((r) => r.line),
        ...(field !== undefined ? { field } : {}),
        value: fmt(badLon[0].lon!, badLon[0].lonDecimals),
      }),
    );
  }

  const same = rows.filter((r) => r.lat !== undefined && r.lon !== undefined && r.lat === r.lon);
  if (same.length > 0) {
    out.push(makeFinding('ROW-LAT-EQ-LON', { file: ds.file, sheet, lines: same.map((r) => r.line), value: fmt(same[0].lat!, same[0].latDecimals) }));
  }
}

/* ---------- ROW-STATION-MOVED ---------- */

interface Pos {
  lat: number;
  lon: number;
  latDec: number;
  lonDec: number;
  rows: DataRow[];
}

/** Both values rounded to the coarser of their two reported precisions are the same number. */
function sameAtCoarser(a: number, da: number, b: number, db: number): boolean {
  const d = Math.min(da, db);
  const k = 10 ** d;
  return Math.round(a * k) === Math.round(b * k);
}

/** |a - b| is a whole, non-zero number of degrees, within half a unit of the coarser reported decimal. */
function integerShift(a: number, da: number, b: number, db: number): boolean {
  const delta = Math.abs(a - b);
  const n = Math.round(delta);
  return n >= 1 && Math.abs(delta - n) <= 0.5 * 10 ** -Math.min(da, db) + 1e-9;
}

const sameLat = (p: Pos, q: Pos) => sameAtCoarser(p.lat, p.latDec, q.lat, q.latDec);
const sameLon = (p: Pos, q: Pos) => sameAtCoarser(p.lon, p.lonDec, q.lon, q.lonDec);
const samePosition = (p: Pos, q: Pos) => sameLat(p, q) && sameLon(p, q);

/*
 * Pattern (a): one coordinate differs by a whole, non-zero number of degrees (the degrees digit was mistyped; the decimals
 * agree), and the other coordinate keeps the same whole-degree part. Comparing whole-degree parts instead of decimals is
 * deliberate and is not a distance tolerance: repeated occupations of one station rarely repeat the same decimals on the
 * other axis, so equality there would miss exactly the case this pattern exists for.
 */
function typedDigit(p: Pos, q: Pos): boolean {
  const sameWholeDegree = (a: number, b: number) => Math.trunc(a) === Math.trunc(b);
  if (integerShift(p.lon, p.lonDec, q.lon, q.lonDec) && sameWholeDegree(p.lat, q.lat)) return true;
  return integerShift(p.lat, p.latDec, q.lat, q.latDec) && sameWholeDegree(p.lon, q.lon);
}

/** Pattern (b): the two positions are each other with latitude and longitude exchanged. */
function exchanged(p: Pos, q: Pos): boolean {
  return sameAtCoarser(p.lat, p.latDec, q.lon, q.lonDec) && sameAtCoarser(p.lon, p.lonDec, q.lat, q.latDec);
}

function positionsOf(rows: DataRow[]): Pos[] {
  const exact = new Map<string, Pos>();
  for (const r of rows) {
    if (r.lat === undefined || r.lon === undefined) continue;
    const key = `${r.lat}\u0000${r.lon}`;
    const hit = exact.get(key);
    const latDec = r.latDecimals ?? decimalsOfNumber(r.lat);
    const lonDec = r.lonDecimals ?? decimalsOfNumber(r.lon);
    if (hit) {
      hit.rows.push(r);
      hit.latDec = Math.max(hit.latDec, latDec);
      hit.lonDec = Math.max(hit.lonDec, lonDec);
    } else exact.set(key, { lat: r.lat, lon: r.lon, latDec, lonDec, rows: [r] });
  }
  // positions that agree at the coarser reported precision are one position (15.5 and 15.53)
  const merged: Pos[] = [];
  for (const p of exact.values()) {
    const into = merged.find((m) => samePosition(m, p));
    if (into) into.rows.push(...p.rows);
    else merged.push(p);
  }
  return merged;
}

function positionText(p: Pos): string {
  const dates = [...new Set(p.rows.map(dayOf).filter((d): d is string => d !== undefined))].sort();
  const shown = dates.slice(0, MAX_DATES).join(', ') + (dates.length > MAX_DATES ? ', …' : '');
  const n = `${p.rows.length} ${p.rows.length === 1 ? 'row' : 'rows'}`;
  const lon = `${fmt(Math.abs(p.lon), p.lonDec)} ${p.lon < 0 ? 'W' : 'E'}`;
  const lat = `${fmt(Math.abs(p.lat), p.latDec)} ${p.lat < 0 ? 'S' : 'N'}`;
  return `${lon}, ${lat} (${n}${shown ? `, ${shown}` : ''})`;
}

const firstLine = (p: Pos): number => Math.min(...p.rows.map((r) => r.line));

/*
 * No citable distance tolerance for "the same station at another position" exists (docs/research/qc-sources.md, item 6),
 * and no ship speed either (item 5): this check is pattern-only. A station is reported when two of its positions differ by a
 * typed digit or by exchanged axes. A position with latitude === longitude is left to ROW-LAT-EQ-LON.
 */
function stationMoved(ds: Dataset, sheet: string, rows: DataRow[], out: Finding[]): void {
  const byStation = new Map<string, DataRow[]>();
  for (const r of rows) {
    if (r.station === undefined || r.station === '') continue;
    const list = byStation.get(r.station);
    if (list) list.push(r);
    else byStation.set(r.station, [r]);
  }
  for (const [station, srows] of byStation) {
    const positions = positionsOf(srows);
    if (positions.length < 2) continue;
    const involved = new Set<Pos>();
    const minority = new Set<DataRow>();
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const p = positions[i];
        const q = positions[j];
        if (p.lat === p.lon || q.lat === q.lon) continue;
        if (!typedDigit(p, q) && !exchanged(p, q)) continue;
        involved.add(p).add(q);
        const small = q.rows.length < p.rows.length ? q : p.rows.length < q.rows.length ? p : firstLine(p) < firstLine(q) ? q : p;
        for (const r of small.rows) minority.add(r);
      }
    }
    if (involved.size === 0) continue;
    const text = [...involved].sort((a, b) => firstLine(a) - firstLine(b)).map(positionText).join('; ');
    out.push(makeFinding('ROW-STATION-MOVED', { file: ds.file, sheet, value: station, lines: [...minority].map((r) => r.line), params: { station, positions: text } }));
  }
}

/* ---------- ROW-DATE-MISSING, ROW-YEAR-OUTLIER ---------- */

function dateMissing(ds: Dataset, sheet: string, rows: DataRow[], out: Finding[]): void {
  if (!rows.some((r) => r.datetime !== undefined)) return; // no date at all: META-NO-DATES
  // a date that is present but unreadable is already ROW-DATE-UNPARSEABLE; only blank cells count here
  const blank = rows.filter((r) => r.datetime === undefined && r.dateRaw === undefined);
  if (blank.length === 0) return;
  const percent = Math.round((blank.length / rows.length) * 1000) / 10;
  out.push(makeFinding('ROW-DATE-MISSING', { file: ds.file, sheet, lines: blank.map((r) => r.line), params: { count: blank.length, percent } }));
}

const YEAR_TOKEN = /(?<![0-9])(19[0-9]{2}|20[0-9]{2}|2100)(?![0-9])/g;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function yearsIn(text: string | undefined): number[] {
  return text === undefined ? [] : [...text.matchAll(YEAR_TOKEN)].map((m) => Number(m[1]));
}

/** Years named in the dataset label / file name, in record titles, and every year the temporal extents span. */
function declaredYears(ds: Dataset): number[] {
  const years = new Set<number>([...yearsIn(ds.label), ...yearsIn(ds.file)]);
  for (const m of ds.metadata) {
    for (const y of yearsIn(m.title)) years.add(y);
    const ext = m.temporalExtent;
    if (!ext) continue;
    const a = /^(\d{4})/.exec(ext.start ?? '')?.[1];
    const b = /^(\d{4})/.exec(ext.end ?? '')?.[1];
    if (a === undefined && b === undefined) continue;
    const x = Number(a ?? b);
    const y2 = Number(b ?? a);
    const from = Math.max(MIN_YEAR, Math.min(x, y2));
    const to = Math.min(MAX_YEAR, Math.max(x, y2));
    for (let y = from; y <= to; y++) years.add(y);
  }
  return [...years].sort((x, y) => x - y);
}

/** [2017, 2019, 2020, 2021] -> "2017, 2019–2021" */
function compactYears(years: readonly number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < years.length; ) {
    let j = i;
    while (j + 1 < years.length && years[j + 1] === years[j] + 1) j++;
    parts.push(j === i ? String(years[i]) : `${years[i]}–${years[j]}`);
    i = j + 1;
  }
  return parts.join(', ');
}

function yearOutlier(ds: Dataset, sheet: string, rows: DataRow[], declared: readonly number[], out: Finding[]): void {
  if (declared.length === 0) return;
  const known = new Set(declared);
  const odd = rows.filter((r) => r.datetime !== undefined && !known.has(r.datetime.year));
  if (odd.length === 0) return;
  const years = [...new Set(odd.map((r) => r.datetime!.year))].sort((a, b) => a - b);
  out.push(
    makeFinding('ROW-YEAR-OUTLIER', {
      file: ds.file, sheet, lines: odd.map((r) => r.line),
      params: { years: years.join(', '), declared: compactYears(declared) },
    }),
  );
}

/* ---------- ROW-UNIT-MISSING, ROW-DEPTH-SIGN ---------- */

/*
 * Exempt from ROW-UNIT-MISSING: practical salinity is dimensionless by definition (PSS-78) and pH is a logarithmic
 * scale; neither has a unit to state, so asking for one would be a false alarm.
 */
const UNITLESS_CANONICAL = new Set(['salinity', 'pH']);

/*
 * A unit that recognition only inferred from a NERC P01 code in the header (unitSource 'p01') is not a unit the data owner
 * wrote down: the file still states none, so it counts as missing. Header and metadata units (and the user's own) count as given.
 */
const unitStated = (v: Variable): boolean => v.unit !== undefined && v.unitSource !== 'p01';

/** A column that OPeNDAP itself declares as text ("Activity<String>") is a label or code, not a measurement: no unit is expected. */
const declaredText = (v: Variable): boolean => /<String>$/.test(v.header);

/** OPeNDAP type suffix removed for display: "TCO2KG02<Float32>" -> "TCO2KG02". */
const displayHeader = (h: string): string => h.replace(/<[A-Za-z0-9]+>$/, '');

function unitMissing(ds: Dataset, out: Finding[]): void {
  const headers = ds.variables.filter((v) => !unitStated(v) && !declaredText(v) && !(v.canonical !== undefined && UNITLESS_CANONICAL.has(v.canonical))).map((v) => displayHeader(v.header));
  if (headers.length === 0) return;
  const shown = headers.slice(0, MAX_HEADERS).join(', ') + (headers.length > MAX_HEADERS ? `, …+${headers.length - MAX_HEADERS}` : '');
  out.push(makeFinding('ROW-UNIT-MISSING', { file: ds.file, params: { headers: shown } }));
}

function depthSign(ds: Dataset, out: Finding[]): void {
  if (ds.depthPositive !== 'unknown' || !ds.rows.some((r) => r.depth !== undefined)) return;
  const firstSheet = ds.rows.find((r) => r.depth !== undefined)!.sheet;
  const header = headerOf(ds, firstSheet, 'depth') ?? 'depth';
  out.push(makeFinding('ROW-DEPTH-SIGN', { file: ds.file, params: { header } }));
}

/* ---------- public ---------- */

/** Category B — row checks. */
export function checkRows(ds: Dataset): Finding[] {
  const out: Finding[] = [];
  const declared = declaredYears(ds);
  for (const [sheet, rows] of bySheet(ds.rows)) {
    positionRules(ds, sheet, rows, out);
    stationMoved(ds, sheet, rows, out);
    dateMissing(ds, sheet, rows, out);
    yearOutlier(ds, sheet, rows, declared, out);
  }
  unitMissing(ds, out);
  depthSign(ds, out);
  return out;
}
