// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

import { ON_LAND_MIN_KM, ON_LAND_NEAR_MIN_KM, type LandMask } from '../geo/land';
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

/**
 * Decimals as written, except for a single-precision artefact: "37.8499984741211" is 37.85 stored as a 32-bit float and
 * printed in full. Such a value counts with the decimals of the shortest number that is the same 32-bit float, so the
 * position compares and prints as 37.85. A genuinely precise value is not a float32 and keeps its decimals.
 */
export function writtenDecimals(v: number, dec: number): number {
  if (dec <= 6) return dec;
  const f = Math.fround(v);
  if (Math.abs(v - f) > 1e-12 * Math.max(1, Math.abs(v))) return dec;
  for (let d = 0; d < dec; d++) if (Math.fround(Number(v.toFixed(d))) === f) return d;
  return dec;
}

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

/* Great-circle distance in km (spherical Earth, mean radius 6371 km), correct across the antimeridian. */
export function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/*
 * Pattern (c): one coordinate has the other sign. With that sign flipped the two positions are within SIGN_FLIP_KM of each
 * other, and as written they are at least SIGN_FLIP_MIN_KM and SIGN_FLIP_RATIO times further apart. Not a published
 * tolerance: it only says that a sign explains the difference far better than anything else (Menez Gwen: 5 423 km as
 * written, 1.2 km flipped). The minimum keeps positions on both sides of 0 or of 180 degrees, which a flip barely moves,
 * out of it.
 */
const SIGN_FLIP_KM = 50;
const SIGN_FLIP_MIN_KM = 100;
const SIGN_FLIP_RATIO = 10;
function flippedAxis(p: Pos, q: Pos): 'lat' | 'lon' | undefined {
  if (p.lon * q.lon >= 0 && p.lat * q.lat >= 0) return undefined; // no opposite sign: skip the distance (pairs are many)
  const written = km(p.lat, p.lon, q.lat, q.lon);
  if (written < SIGN_FLIP_MIN_KM) return undefined;
  const near = (d: number) => d <= SIGN_FLIP_KM && written >= SIGN_FLIP_RATIO * Math.max(d, 0.001);
  if (p.lon * q.lon < 0 && near(km(p.lat, p.lon, q.lat, -q.lon))) return 'lon';
  if (p.lat * q.lat < 0 && near(km(p.lat, p.lon, -q.lat, q.lon))) return 'lat';
  return undefined;
}

/** More distinct positions than this under one name is a track, not a station: the pattern search (quadratic) is skipped. */
const MAX_STATION_POSITIONS = 500;

function positionsOf(rows: DataRow[]): Pos[] {
  const exact = new Map<string, Pos>();
  for (const r of rows) {
    if (r.lat === undefined || r.lon === undefined) continue;
    const key = `${r.lat}\u0000${r.lon}`;
    const hit = exact.get(key);
    const latDec = writtenDecimals(r.lat, r.latDecimals ?? decimalsOfNumber(r.lat));
    const lonDec = writtenDecimals(r.lon, r.lonDecimals ?? decimalsOfNumber(r.lon));
    if (hit) {
      hit.rows.push(r);
      hit.latDec = Math.max(hit.latDec, latDec);
      hit.lonDec = Math.max(hit.lonDec, lonDec);
    } else exact.set(key, { lat: r.lat, lon: r.lon, latDec, lonDec, rows: [r] });
  }
  if (exact.size > MAX_STATION_POSITIONS) return [...exact.values()];
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
/*
 * ROW-STATION-SPREAD: a station whose positions are more than SPREAD_KM apart. No published tolerance exists
 * (docs/research/qc-sources.md, item 6); 10 km is a stated choice, far above the position error of a ship on station
 * (satellite navigation, drift during a cast) and below the size at which a name usually stands for an area. A note,
 * not a warning: transects, cruises and named areas legitimately span more. Names that say they are general or unknown
 * are skipped, and so are positions with latitude = longitude (ROW-LAT-EQ-LON reports those). At most MAX_SPREAD_POSITIONS
 * positions are compared (an even sample plus the extremes), so a long track stays cheap; the distance may then be a little
 * short of the true widest, never longer. Beyond FAR_KM the text adds that one position is almost certainly wrong.
 */
const SPREAD_KM = 10;
const FAR_KM = 1000;
const MAX_SPREAD_POSITIONS = 200;
const GENERIC_STATION = /\((general|unknown|various)\)|^(general|unknown|n\/?a|none|various|multiple|several|misc(ellaneous)?|other|not recorded|-+|\?+)$/i;

function widest(positions: readonly Pos[]): number {
  const n = positions.length;
  let ps: readonly Pos[] = positions;
  if (n > MAX_SPREAD_POSITIONS) {
    // an even sample plus the four extreme positions, so a single far outlier is never sampled away
    const by = (f: (p: Pos) => number, max: boolean) => positions.reduce((a, b) => ((max ? f(b) > f(a) : f(b) < f(a)) ? b : a));
    const extremes = [by((p) => p.lat, false), by((p) => p.lat, true), by((p) => p.lon, false), by((p) => p.lon, true)];
    ps = [...new Set([...extremes, ...Array.from({ length: MAX_SPREAD_POSITIONS - 4 }, (_, i) => positions[Math.floor((i * (n - 1)) / (MAX_SPREAD_POSITIONS - 5))])])];
  }
  let best = 0;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) best = Math.max(best, km(ps[i].lat, ps[i].lon, ps[j].lat, ps[j].lon));
  return best;
}

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
    const track = positions.length > MAX_STATION_POSITIONS;
    const involved = new Set<Pos>();
    const minority = new Set<DataRow>();
    const flipped = new Set<'lat' | 'lon'>();
    for (let i = 0; i < (track ? 0 : positions.length); i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const p = positions[i];
        const q = positions[j];
        if (p.lat === p.lon || q.lat === q.lon) continue;
        const axis = flippedAxis(p, q);
        if (!typedDigit(p, q) && !exchanged(p, q) && axis === undefined) continue;
        if (axis) flipped.add(axis);
        involved.add(p).add(q);
        const small = q.rows.length < p.rows.length ? q : p.rows.length < q.rows.length ? p : firstLine(p) < firstLine(q) ? q : p;
        for (const r of small.rows) minority.add(r);
      }
    }
    if (involved.size === 0) {
      if (GENERIC_STATION.test(station.trim())) continue;
      const real = positions.filter((p) => p.lat !== p.lon);
      if (real.length < 2) continue;
      const spread = widest(real);
      if (spread <= SPREAD_KM) continue;
      const shown = real.slice(0, MAX_DATES + 2);
      const text = shown.map(positionText).join('; ') + (real.length > shown.length ? `; …+${real.length - shown.length}` : '');
      const params: Record<string, string | number> = { station, km: Math.round(spread), positions: text };
      if (spread > FAR_KM) params.far = 'yes';
      out.push(makeFinding('ROW-STATION-SPREAD', { file: ds.file, sheet, value: station, params }));
      continue;
    }
    const text = [...involved].sort((a, b) => firstLine(a) - firstLine(b)).map(positionText).join('; ');
    const params: Record<string, string> = { station, positions: text };
    if (flipped.has('lon')) params.signLon = 'yes';
    if (flipped.has('lat')) params.signLat = 'yes';
    out.push(makeFinding('ROW-STATION-MOVED', { file: ds.file, sheet, value: station, lines: [...minority].map((r) => r.line), params }));
  }
}

/* ---------- ROW-ON-LAND ---------- */

const MAX_PLACES = 5;

const coord = (v: number, dec: number, pos: string, neg: string): string => `${fmt(Math.abs(v), dec)} ${v < 0 ? neg : pos}`;
// longitude first, as positionText writes positions in the station findings of the same report
const place = (lat: number, lon: number, latDec: number, lonDec: number): string => `${coord(lon, lonDec, 'E', 'W')}, ${coord(lat, latDec, 'N', 'S')}`;

/*
 * A marine position on land or in an inland lake (src/core/geo/land.ts), on two levels:
 * - ROW-ON-LAND (warning): at least ON_LAND_MIN_KM inside. When the same position with a flipped sign or exchanged axes lies at
 *   sea (the mask's sea class), that is shown as a hint, never applied.
 * - ROW-ON-LAND-NEAR (note): ON_LAND_NEAR_MIN_KM to ON_LAND_MIN_KM inside. No hint: a flipped sign puts most of the globe at sea,
 *   and a row this close to the coast is far more likely a digit typo or a river, lake or lagoon sample.
 * A row is reported by one level only. Nearer the coast, out of range, or where the mask makes no claim gives nothing.
 */
interface LandHit { lat: number; lon: number; latDec: number; lonDec: number; km: number; n: number }

function landPlaces(hits: Map<string, LandHit>): { shown: LandHit[]; places: string } {
  const all = [...hits.values()].sort((a, b) => b.n - a.n);
  const shown = all.slice(0, MAX_PLACES);
  const places = shown.map((h) => `${place(h.lat, h.lon, h.latDec, h.lonDec)} (${h.n}; ≥${h.km} km)`).join('; ') + (all.length > shown.length ? `; …+${all.length - shown.length}` : '');
  return { shown, places };
}

function onLand(ds: Dataset, sheet: string, rows: DataRow[], land: LandMask, out: Finding[]): void {
  const far = { hits: new Map<string, LandHit>(), lines: [] as number[] };
  const near = { hits: new Map<string, LandHit>(), lines: [] as number[] };
  for (const r of rows) {
    if (r.lat === undefined || r.lon === undefined) continue;
    const at = land.place(r.lat, r.lon);
    if (at.kind !== 'land' || at.atLeastKm < ON_LAND_NEAR_MIN_KM) continue;
    const level = at.atLeastKm >= ON_LAND_MIN_KM ? far : near;
    level.lines.push(r.line);
    const key = `${r.lat}\u0000${r.lon}`;
    const h = level.hits.get(key);
    if (h) h.n++;
    else level.hits.set(key, { lat: r.lat, lon: r.lon, latDec: writtenDecimals(r.lat, r.latDecimals ?? decimalsOfNumber(r.lat)), lonDec: writtenDecimals(r.lon, r.lonDecimals ?? decimalsOfNumber(r.lon)), km: at.atLeastKm, n: 1 });
  }
  if (far.lines.length > 0) {
    const { shown, places } = landPlaces(far.hits);
    const flips: string[] = [];
    for (const h of shown) {
      const options: [number, number, number, number][] = [[h.lat, -h.lon, h.latDec, h.lonDec], [-h.lat, h.lon, h.latDec, h.lonDec]];
      if (Math.abs(h.lon) <= 90) options.push([h.lon, h.lat, h.lonDec, h.latDec]);
      const sea = options.find(([la, lo]) => land.place(la, lo).kind === 'sea');
      if (sea) flips.push(`${place(h.lat, h.lon, h.latDec, h.lonDec)} → ${place(sea[0], sea[1], sea[2], sea[3])}`);
    }
    const params: Record<string, string | number> = { count: far.lines.length, places };
    if (flips.length > 0) params.flips = flips.join('; ');
    out.push(makeFinding('ROW-ON-LAND', { file: ds.file, sheet, lines: far.lines, params }));
  }
  if (near.lines.length > 0) {
    out.push(makeFinding('ROW-ON-LAND-NEAR', { file: ds.file, sheet, lines: near.lines, params: { count: near.lines.length, places: landPlaces(near.hits).places } }));
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

// A year token is bounded by anything except a letter or digit: 'cruise_2021.csv' and '2021-data.csv' name 2021,
// 'ctd_2000m.csv' (a depth) and 'data2021.csv' (letters glued to the digits) name no year.
const YEAR_TOKEN = /(?<![\p{L}\p{N}])(19[0-9]{2}|20[0-9]{2}|2100)(?![\p{L}\p{N}])/gu;
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

export interface RowContext {
  /** The land/sea grid; without it ROW-ON-LAND does not run (the report then says so, see runChecks). */
  land?: LandMask;
}

/** Category B — row checks. */
export function checkRows(ds: Dataset, ctx: RowContext = {}): Finding[] {
  const out: Finding[] = [];
  const declared = declaredYears(ds);
  for (const [sheet, rows] of bySheet(ds.rows)) {
    positionRules(ds, sheet, rows, out);
    stationMoved(ds, sheet, rows, out);
    if (ctx.land) onLand(ds, sheet, rows, ctx.land, out);
    dateMissing(ds, sheet, rows, out);
    yearOutlier(ds, sheet, rows, declared, out);
  }
  unitMissing(ds, out);
  depthSign(ds, out);
  return out;
}
