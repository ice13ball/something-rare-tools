// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

import { ON_LAND_MIN_KM, ON_LAND_NEAR_MIN_KM, type LandMask } from '../geo/land';
import { unitFromHeader } from '../recognize/columns';
import { badHeaderCodes } from '../recognize/headerCodes';
import { statisticOfName } from '../recognize/headerWords';
import { canonicalFromKey, headerKey } from '../recognize/vocab';
import { makeFinding, threshold } from '../rules/registryCheck';
import { earliestUtcDayOf, utcDayOf } from '../values/dates';
import type { ColumnRole, DataRow, Dataset, Finding, Variable } from '../types';
import { minOf, pushAll } from '../util/arrays';

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

  // (0, 0) is also latitude = longitude; it is reported once, as ROW-ZERO-COORD, the more specific finding
  const zero = rows.filter((r) => r.lat === 0 && r.lon === 0);
  if (zero.length > 0) out.push(makeFinding('ROW-ZERO-COORD', { file: ds.file, sheet, lines: zero.map((r) => r.line) }));
  const same = rows.filter((r) => r.lat !== undefined && r.lon !== undefined && r.lat === r.lon && r.lat !== 0);
  if (same.length === 0) return;
  const positioned = rows.filter((r) => r.lat !== undefined && r.lon !== undefined).length;
  if (same.length >= LAT_EQ_LON_MIN_ROWS) {
    const share = same.length >= LAT_EQ_LON_MIN_SHARE * positioned;
    const repeated = repeatedEqualValue(same);
    if (share || repeated > 0) {
      const params: Record<string, string | number> = share ? { share: 'yes' } : { repeated };
      out.push(makeFinding('ROW-LAT-EQ-LON', { file: ds.file, sheet, lines: same.map((r) => r.line), value: fmt(same[0].lat!, same[0].latDecimals), params }));
      return;
    }
  }
  // too few, or too small a share, to be a duplicated column: each row alone is a coincidence to look at (round value: a note)
  for (const [id, group] of [['ROW-LAT-EQ-LON-ISOLATED', same.filter((r) => !isCoarse(r.lat!))], ['ROW-LAT-EQ-LON-COARSE', same.filter((r) => isCoarse(r.lat!))]] as const) {
    if (group.length > 0) out.push(makeFinding(id, { file: ds.file, sheet, lines: group.map((r) => r.line), value: fmt(group[0].lat!, group[0].latDecimals) }));
  }
}

/*
 * ROW-LAT-EQ-LON: a duplicated column puts latitude = longitude on MANY rows; one legitimate coarse position can do it on one
 * (-65, -65 is on the Antarctic Peninsula). The error needs at least LAT_EQ_LON_MIN_ROWS such rows AND a LAT_EQ_LON_MIN_SHARE
 * share of the rows that have a position (a fifth: far above chance, far below a whole copied column). Both numbers are the tool's
 * own choice, agreed with a data specialist, not published thresholds (the share can also be replaced by a repeated value, see repeatedEqualValue). Below that, ROW-LAT-EQ-LON-ISOLATED (warning), or
 * ROW-LAT-EQ-LON-COARSE (note) when the value is a whole or half degree: positions that coarse are common in historical and
 * museum data and equal values are then no surprise, while a value with a finer decimal being equal by chance is unlikely.
 */
export const LAT_EQ_LON_MIN_ROWS = 5;
export const LAT_EQ_LON_MIN_SHARE = 0.2;
/**
 * A copied column confined to ONE station (a depth profile of 27 rows, among 400) is under a fifth of the rows yet is no coincidence: the same value, with at
 * least two written decimals and not a multiple of 0.25 (a quarter degree is a grid value, where equal values are natural), repeated in at least
 * LAT_EQ_LON_MIN_ROWS rows. Returns the size of the largest such group, or 0.
 */
function repeatedEqualValue(same: readonly DataRow[]): number {
  const counts = new Map<number, number>();
  for (const r of same) {
    const v = r.lat!;
    if (Number.isInteger(v * 4)) continue;
    if (writtenDecimals(v, r.latDecimals ?? decimalsOfNumber(v)) < 2) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const best = Math.max(0, ...counts.values());
  return best >= LAT_EQ_LON_MIN_ROWS ? best : 0;
}
const isCoarse = (v: number): boolean => Number.isInteger(v * 2);

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
function typedDigit(p: Pos, q: Pos, inCruise = false): boolean {
  const sameWholeDegree = (a: number, b: number) => Math.trunc(a) === Math.trunc(b);
  // The shifted coordinate must be written with at least TYPED_DIGIT_MIN_DECIMALS decimals in both positions: whole-degree positions ("Sta. 1" at 44 / -63 and
  // 44 / -60) differ by whole degrees by coincidence, while a value such as 16.505 against 15.505 has the digits of a measurement, and a wrong digit in it is a typo.
  // Two decimals is the tool's own choice (about 1 km), not a published value.
  // Inside one cruise the same name is much more likely one place, so one decimal is enough there (15.3 against 16.3), unless it is .0 or .5, a whole or half degree.
  const digits = (v: number, dec: number): boolean => dec >= TYPED_DIGIT_MIN_DECIMALS || (inCruise && dec >= 1 && !Number.isInteger(v * 2));
  if (digits(p.lon, p.lonDec) && digits(q.lon, q.lonDec) && integerShift(p.lon, p.lonDec, q.lon, q.lonDec) && sameWholeDegree(p.lat, q.lat)) return true;
  return digits(p.lat, p.latDec) && digits(q.lat, q.latDec) && integerShift(p.lat, p.latDec, q.lat, q.latDec) && sameWholeDegree(p.lon, q.lon);
}
export const TYPED_DIGIT_MIN_DECIMALS = 2;

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
export const SIGN_FLIP_KM = 50;
export const SIGN_FLIP_MIN_KM = 100;
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
    if (into) pushAll(into.rows, p.rows);
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

const firstLine = (p: Pos): number => minOf(p.rows.map((r) => r.line));

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
 * short of the true widest, never longer. Beyond FAR_KM (1000 km, also a stated choice) one position is almost certainly wrong: that is the
 * warning ROW-STATION-SPREAD-FAR instead of the note.
 */
const SPREAD_KM = 10;
const FAR_KM = 1000;
const MAX_SPREAD_POSITIONS = 200;
/*
 * Generic names ("Sta. 1", "Dive 9", "Site 2", "Float") repeat across unrelated cruises and decades in a collection export, so one name is not one
 * place. Rows of one name are compared only within one CRUISE (a row with a cruise value), otherwise within one CALENDAR YEAR (UTC; a year- or
 * month-precision date joins its year). A station worked in one year (a series of visits, a digit typed wrongly in one of them) stays together; the
 * same name in 1980 and 1986 does not. Rows with no cruise and no date form one group that nothing anchors (see stationGroup). The calendar year is
 * the tool's own choice, not a published value.
 */

/**
 * Station "names" that say there is no station: skipped by ROW-STATION-MOVED and ROW-STATION-SPREAD, never grouped. English,
 * Polish, German and French; "-" and "?" alone. A name such as "Sta. 1", "Dive 9" or "Float" is NOT here: it is a real, reused
 * name, handled by grouping (see stationGroups).
 */
const GENERIC_STATION = new RegExp(
  '\\((general|unknown|various)\\)|^(' +
    [
      'general|unknown|unspecified|not specified|unnamed|unassigned|undefined|null|none|no station|no data|nodata|not given|not recorded|not applicable|not available|various|multiple|several|misc(ellaneous)?|other|tbd|n\\/?a|n\\.a\\.?|nan',
      'nieokreślon[aey]|nieznan[aey]|brak|brak danych|brak stacji|bez nazwy|nie dotyczy|nie podano|nieustalon[aey]',
      'unbekannt|keine angabe|nicht angegeben|nicht bekannt|keine station|ohne|k\\.? ?a\\.?|nicht zutreffend',
      'inconnu(e)?|non spécifié(e)?|non précisé(e)?|non renseigné(e)?|non indiqué(e)?|sans nom|aucun(e)?|pas de station|n\\/d|non applicable',
      '-+|\\?+|_+',
    ].join('|') +
    ')$',
  'i',
);

/**
 * An expedition / cruise LABEL used as the station ("Java-South Africa Exped.", "Expedition 12", "Wyprawa 2", "Expedición", "Expédition"): it names a route, not a place, so a
 * far spread is expected and is only the note, like a generic label.
 */
const EXPEDITION_LABEL = /(?:^|[\s._-])(?:exped(?:ition|ición|icion)?|expédition|cruise|wyprawa|wyprawy|wyprawie)(?:$|[\s._0-9-])/i;

/**
 * A generic station LABEL: a station-like word with an optional number or letter ("Sta. 1", "Site 2", "Dive 9", "Float", "Stacja 3", "Stelle A"). Such a name
 * repeats across unrelated places, so with nothing to anchor it (no cruise, no date) a far spread is only the note; a proper name ("Axial Seamount") is one place
 * and keeps the warning.
 */
const GENERIC_LABEL = new RegExp(
  '^(?:' +
    [
      'station|sta|stn|st|site|dive|cast|haul|tow|trawl|grab|core|sample|float|buoy|point|plot|transect',
      'stacja|stanowisko|próba|próbka|punkt|nurkowanie|połów|rdzeń|boja|transekt',
      'stelle|probe|tauchgang|fang|kern|boje|punkt|messpunkt',
      'poste|plongée|trait|carotte|échantillon|bouée|point|transect',
    ].join('|') +
    ')\\.?(?:[\\s._-]*(?:\\d+[a-z]?|[a-z]))?$',
  'i',
);

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

/**
 * The rows of one station name split into the groups that may be compared with each other, each with whether something anchors it (a cruise or a
 * year). A row with a cruise value goes to its cruise (a blank cruise cell is not a cruise: such a row falls back to the year, so a sheet with a
 * cruise column is not pooled across decades by its blanks); else to its UTC calendar year; a row with neither is in one group of its own, unanchored.
 */
function stationGroups(srows: DataRow[]): { rows: DataRow[]; anchored: boolean; cruise: boolean }[] {
  const by = new Map<string, { rows: DataRow[]; anchored: boolean; cruise: boolean }>();
  for (const r of srows) {
    const key = r.cruise !== undefined && r.cruise !== '' ? `c:${r.cruise}` : r.datetime ? `y:${utcDayOf(r.datetime).slice(0, 4)}` : 'u';
    const g = by.get(key);
    if (g) g.rows.push(r);
    else by.set(key, { rows: [r], anchored: key !== 'u', cruise: key.startsWith('c:') });
  }
  return [...by.values()];
}

function stationMoved(ds: Dataset, sheet: string, rows: DataRow[], out: Finding[]): void {
  const byName = new Map<string, DataRow[]>();
  for (const r of rows) {
    if (r.station === undefined || r.station === '' || GENERIC_STATION.test(r.station.trim())) continue;
    const list = byName.get(r.station);
    if (list) list.push(r);
    else byName.set(r.station, [r]);
  }
  for (const [station, nameRows] of byName) {
    for (const g of stationGroups(nameRows)) stationGroup(ds, sheet, station, g.rows, g.anchored, g.cruise, out);
  }
}

function stationGroup(ds: Dataset, sheet: string, station: string, srows: DataRow[], anchored: boolean, inCruise: boolean, out: Finding[]): void {
  const positions = positionsOf(srows);
  if (positions.length < 2) return;
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
      // no cruise and no date: nothing tells two occupations of the name apart, and a whole-degree shift then proves nothing; exchanged axes and a sign still do
      if (!(anchored && typedDigit(p, q, inCruise)) && !exchanged(p, q) && axis === undefined) continue;
      if (axis) flipped.add(axis);
      involved.add(p).add(q);
      const small = q.rows.length < p.rows.length ? q : p.rows.length < q.rows.length ? p : firstLine(p) < firstLine(q) ? q : p;
      for (const r of small.rows) minority.add(r);
    }
  }
  if (involved.size === 0) {
    const real = positions.filter((p) => p.lat !== p.lon);
    if (real.length < 2) return;
    const spread = widest(real);
    if (spread <= SPREAD_KM) return;
    const shown = real.slice(0, MAX_DATES + 2);
    const text = shown.map(positionText).join('; ') + (real.length > shown.length ? `; …+${real.length - shown.length}` : '');
    const params: Record<string, string | number> = { station, km: Math.round(spread), positions: text };
    // an expedition label names a route, dated or not; a generic label only says nothing when nothing anchors it
    const far = spread > FAR_KM && !EXPEDITION_LABEL.test(station.trim()) && (anchored || !GENERIC_LABEL.test(station.trim()));
    out.push(makeFinding(far ? 'ROW-STATION-SPREAD-FAR' : 'ROW-STATION-SPREAD', { file: ds.file, sheet, value: station, params }));
    return;
  }
  const text = [...involved].sort((a, b) => firstLine(a) - firstLine(b)).map(positionText).join('; ');
  const params: Record<string, string> = { station, positions: text };
  if (flipped.has('lon')) params.signLon = 'yes';
  if (flipped.has('lat')) params.signLat = 'yes';
  out.push(makeFinding('ROW-STATION-MOVED', { file: ds.file, sheet, value: station, lines: [...minority].map((r) => r.line), params }));
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

/*
 * A year RANGE names every year in it: "1994-2019", "1994–2019" (en dash), "1994—2019", "1994 to 2019", "from 1994 until 2019", "1994/2019" (an ISO 8601 interval),
 * "between 1994 and 2019" and "in the period 1994_2019" (an underscore in a file name separates words, so two years joined only by one count as a range after a word that says so:
 * period, years, from, during and their German, French and Polish forms; the cue is a whole word, never the end of one: "Station_code_2015_2019" has none). Two years in a file name
 * that are only joined by an underscore ("cruise_2015_2019") are two years, as before, and so are two years joined by "and" after "years" ("the years 1994 and 2019").
 * The end of a range is a four-digit year at or after the start. A two-digit end ("1994-95", "2019/20") is a range only when it cannot be a month (13 to 99, after the century of the
 * start): "2019-08" is a year and a month, and "2011-12" stays the year 2011 alone. A date ("2019-08-15", "1994-95-03") is never a range, and neither is a number range that
 * is followed by a unit ("CTD casts 1950-2000 m"). Where a range is not clear, the years stay single years: a range only ever widens what is accepted.
 */
const YEAR = '(?<![\\p{L}\\p{N}])(19[0-9]{2}|20[0-9]{2}|2100)';
const YEAR_END = '(19[0-9]{2}|20[0-9]{2}|2100)';
const DASH = '[-\\u2010-\\u2015\\u2212]';
const NOT_MORE = '(?![\\p{L}\\p{N}]|[-/.:]\\d)';
// a unit right after the end of a range makes it a range of numbers, not of years ("1950-2000 m"). Tested on the text after the match, CASE-SENSITIVELY (the word patterns above are
// case-insensitive: "M/V Polarstern" is no metre), and "db" is left out ("db export" is a word, the unit of pressure is dbar).
const UNIT_AFTER = /^\s*(?:km|mm|cm|m|dbar|hPa|hpa|mbar|ft)(?![\p{L}\p{N}])/u;
const RANGE_DASH = new RegExp(`${YEAR}\\s*${DASH}\\s*${YEAR_END}${NOT_MORE}`, 'gu');
const RANGE_SLASH = new RegExp(`${YEAR}/${YEAR_END}${NOT_MORE}`, 'gu');
const RANGE_WORD = new RegExp(`${YEAR}[\\s_]+(?:to|until|till|through|bis|do|au|\\u00e0)[\\s_]+${YEAR_END}${NOT_MORE}`, 'giu');
const CUE_LEFT = '(?<![\\p{L}\\p{N}])';
const RANGE_CUE = new RegExp(
  `${CUE_LEFT}(?:period|periode|p\\u00e9riode|okres|years|jahre|ann\\u00e9es|lata|from|during|von|od)[\\s_]+${YEAR}[\\s_]+${YEAR_END}${NOT_MORE}`,
  'giu',
);
const RANGE_BETWEEN = new RegExp(`${CUE_LEFT}(?:between|zwischen|entre)[\\s_]+${YEAR}[\\s_]+(?:and|und|et)[\\s_]+${YEAR_END}${NOT_MORE}`, 'giu');
const RANGE_SHORT = new RegExp(`${YEAR}\\s*(?:${DASH}|/)\\s*([0-9]{2})${NOT_MORE}`, 'gu');
const MAX_RANGE_SPAN = 150;

function rangeYears(text: string): number[] {
  const out: number[] = [];
  const add = (a: number, b: number): void => {
    if (b > a && b - a <= MAX_RANGE_SPAN) for (let y = a; y <= b; y++) out.push(y);
  };
  const unitFollows = (m: RegExpMatchArray): boolean => UNIT_AFTER.test(text.slice((m.index ?? 0) + m[0].length));
  for (const re of [RANGE_DASH, RANGE_SLASH, RANGE_WORD, RANGE_CUE, RANGE_BETWEEN]) for (const m of text.matchAll(re)) if (!unitFollows(m)) add(Number(m[1]), Number(m[2]));
  for (const m of text.matchAll(RANGE_SHORT)) {
    const start = Number(m[1]);
    const end2 = Number(m[2]);
    if (end2 >= 13 && !unitFollows(m)) add(start, start - (start % 100) + end2);
  }
  return out;
}

function yearsIn(text: string | undefined): number[] {
  return text === undefined ? [] : [...rangeYears(text), ...[...text.matchAll(YEAR_TOKEN)].map((m) => Number(m[1]))];
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
/** 'Salinity st.dev.' is the spread of a dimensionless variable: it states no unit either, and asking for one would be the same false alarm. */
const unitlessSpread = (v: Variable): boolean => {
  const key = headerKey(unitFromHeader(v.header).name);
  const stat = statisticOfName(key);
  const base = stat === undefined ? undefined : canonicalFromKey(stat.base);
  return base !== undefined && UNITLESS_CANONICAL.has(base);
};

const declaredText = (v: Variable): boolean => /<String>$/.test(v.header);

/** OPeNDAP type suffix removed for display: "TCO2KG02<Float32>" -> "TCO2KG02". */
const displayHeader = (h: string): string => h.replace(/<[A-Za-z0-9]+>$/, '');

function unitMissing(ds: Dataset, out: Finding[]): void {
  const headers = ds.variables.filter((v) => !unitStated(v) && !declaredText(v) && !unitlessSpread(v) && !(v.canonical !== undefined && UNITLESS_CANONICAL.has(v.canonical))).map((v) => displayHeader(v.header));
  if (headers.length === 0) return;
  const shown = headers.slice(0, MAX_HEADERS).join(', ') + (headers.length > MAX_HEADERS ? `, …+${headers.length - MAX_HEADERS}` : '');
  out.push(makeFinding('ROW-UNIT-MISSING', { file: ds.file, params: { headers: shown } }));
}

/** A code after an explicit `SDN:P01::` or `SDN:P06::` prefix that is not of the shape of that collection: one finding per column and code. Bare header words are never read. */
function headerCodeShape(ds: Dataset, out: Finding[]): void {
  for (const v of ds.variables) {
    for (const bad of badHeaderCodes(v.header)) {
      out.push(makeFinding('ROW-HEADER-CODE-SHAPE', { file: ds.file, field: displayHeader(v.header).trim(), params: { column: displayHeader(v.header).trim(), code: bad.code, collection: bad.collection, length: bad.length } }));
    }
  }
}

function depthSign(ds: Dataset, out: Finding[]): void {
  if (ds.depthPositive !== 'unknown' || !ds.rows.some((r) => r.depth !== undefined)) return;
  const firstSheet = ds.rows.find((r) => r.depth !== undefined)!.sheet;
  const header = headerOf(ds, firstSheet, 'depth') ?? 'depth';
  out.push(makeFinding('ROW-DEPTH-SIGN', { file: ds.file, params: { header } }));
}

/* ---------- ROW-NO-COORD ---------- */

const hasPosition = (r: DataRow): boolean => r.lat !== undefined && r.lon !== undefined;
const dateBlank = (r: DataRow): boolean => r.datetime === undefined && (r.dateRaw === undefined || r.dateRaw === null || String(r.dateRaw).trim() === '');

/*
 * A row with a blank latitude or longitude cell, in a sheet where other rows have both (obis-qc NO_COORD). The dataset builder sets
 * `posBlank` only on a row that holds something besides the position (so blank trailing rows are not rows here), that is not a summary
 * row ("Total", "Mean"), and, in a Darwin Core event hierarchy, that neither is the parent of another event nor has an ancestor with a
 * position (OBIS gives a child event the position of its parent). Text in a coordinate cell is ROW-NON-NUMERIC and never counts as blank.
 * A sheet in which no row has a position says nothing.
 *
 * Station blocks: a sheet that writes the position once per station (or once per date, with no station column) and leaves it blank
 * on the continuation rows is not missing positions. A row with BOTH cells blank is therefore not reported when (a) its station (without a
 * station column: its date; with a cruise column the cruise is part of the key) has a position on some other row of the sheet, or (b) its
 * station (without a station column: its date) is blank and it follows, within the block, a positioned row (or another such continuation),
 * whatever its date or time cell holds (a CTD file stamps every row). A row with only one coordinate blank is always reported: that is a gap, not a block.
 */
function noCoord(ds: Dataset, sheet: string, rows: DataRow[], out: Finding[]): void {
  if (!rows.some(hasPosition)) return;
  const byStation = rows.some((r) => r.station !== undefined);
  const byCruise = rows.some((r) => r.cruise !== undefined);
  const base = (r: DataRow): string | undefined => (byStation ? r.station : r.datetime?.iso.slice(0, 10) ?? (dateBlank(r) ? undefined : String(r.dateRaw).trim()));
  // the same station name in another cruise is another station
  const keyOf = (r: DataRow): string | undefined => {
    const k = base(r);
    return k === undefined || !byCruise ? k : `${r.cruise ?? ''}|${k}`;
  };
  const positioned = new Set<string>();
  for (const r of rows) {
    const k = hasPosition(r) ? keyOf(r) : undefined;
    if (k !== undefined) positioned.add(k);
  }
  const bad: DataRow[] = [];
  let follows = false; // the previous row of the block is positioned, or a continuation of a positioned one
  for (const r of rows) {
    if (hasPosition(r)) {
      follows = true;
      continue;
    }
    if (r.posBlank === undefined) continue;
    if (r.posBlank === 'both') {
      const k = keyOf(r);
      if (k !== undefined && positioned.has(k)) continue;
      // a continuation row leaves its key blank (the station; without a station column the date) and follows a positioned row: whatever the other cells hold
      if ((byStation ? r.station === undefined : dateBlank(r)) && follows) continue;
      follows = false;
    }
    bad.push(r);
  }
  if (bad.length === 0) return;
  out.push(makeFinding('ROW-NO-COORD', { file: ds.file, sheet, lines: bad.map((r) => r.line), params: { count: bad.length } }));
}

/* ---------- ROW-DEPTH-MIN-MAX, ROW-DEPTH-RANGE ---------- */

const METRE = /^(m|meters?|metres?)$/i;
const NON_METRE_HEADER = /(^|[^a-z])(ft|feet|foot|fathoms?|cm|mm|km)([^a-z]|$)/i;

/** The depth role of a sheet's mapping (convention and unit), when the dataset carries one. */
function depthRole(ds: Dataset, sheet: string): { positive: 'down' | 'up' | 'unknown'; unit?: string } {
  const m = ds.mappings.find((x) => x.sheet === sheet) ?? (ds.mappings.length === 1 ? ds.mappings[0] : undefined);
  for (const c of m?.columns ?? []) if (c.role.kind === 'depth') return { positive: c.role.positive, ...(c.role.unit === undefined ? {} : { unit: c.role.unit }) };
  return { positive: ds.depthPositive };
}

function depthRules(ds: Dataset, sheet: string, rows: DataRow[], out: Finding[]): void {
  const lo = threshold('ROW-DEPTH-RANGE', 'depth.min');
  const hi = threshold('ROW-DEPTH-RANGE', 'depth.max');
  const outside = (v: number): boolean => v < lo || v > hi;

  // minimum greater than maximum: only where the row has both Darwin Core depth columns
  const swapped = rows.filter((r) => r.depthMin !== undefined && r.depthMax !== undefined && r.depthMin > r.depthMax);
  if (swapped.length > 0) {
    const f = swapped[0];
    out.push(makeFinding('ROW-DEPTH-MIN-MAX', { file: ds.file, sheet, lines: swapped.map((r) => r.line), value: `${f.depthMin} > ${f.depthMax}` }));
  }

  // out of range: the bounds are metres, positive down. A column with an upward convention (elevation, negative values) is judged
  // after its sign is turned, so a negative value of a declared upward convention is never an error; a column in another unit is not judged
  const range = (field: string, pick: (r: DataRow) => number | undefined): void => {
    const bad = rows.filter((r) => {
      const v = pick(r);
      return v !== undefined && outside(v);
    });
    if (bad.length > 0) out.push(makeFinding('ROW-DEPTH-RANGE', { file: ds.file, sheet, lines: bad.map((r) => r.line), field, value: String(pick(bad[0])) }));
  };
  const hasDwc = rows.some((r) => r.depthMin !== undefined || r.depthMax !== undefined);
  if (hasDwc) {
    range('minimumDepthInMeters', (r) => r.depthMin);
    range('maximumDepthInMeters', (r) => r.depthMax);
    return;
  }
  const role = depthRole(ds, sheet);
  if (role.unit !== undefined && !METRE.test(role.unit)) return;
  // a depth in feet, fathoms, cm, mm or km written in the header only ("Depth (ft)", "depth_ft") is not metres: the bounds do not apply
  if (NON_METRE_HEADER.test(headerOf(ds, sheet, 'depth') ?? '')) return;
  const sign = role.positive === 'up' ? -1 : 1;
  const bad = rows.filter((r) => r.depth !== undefined && outside(sign * r.depth));
  if (bad.length > 0) out.push(makeFinding('ROW-DEPTH-RANGE', { file: ds.file, sheet, lines: bad.map((r) => r.line), field: headerOf(ds, sheet, 'depth') ?? 'depth', value: String(bad[0].depth) }));
}

/* ---------- ROW-DATE-FUTURE ---------- */

/** Header of the date column of the sheet (a date, or a date and time). */
const dateHeader = (ds: Dataset, sheet: string): string | undefined => headerOf(ds, sheet, 'datetime') ?? headerOf(ds, sheet, 'date');

/*
 * A date, or the END of an interval, later than today (obis-qc DATE_IN_FUTURE compares the calendar day of the end with today's date).
 * `today` is a UTC calendar day (YYYY-MM-DD) handed in by the caller, so the result never depends on the clock of the test. A value is in
 * the future only when it can have begun nowhere yet: earliestUtcDayOf takes a date-only value (a year or month by its first day) to its
 * start in the latest zone, UTC+14, a time without a zone as possibly that zone's wall clock, and a time with a zone as the instant it is.
 * So a user east of UTC is never told that his own today is in the future; a date a day after today in UTC is not reported, two days are.
 * A YY-MM-DD date is left to ROW-DATE-YYMMDD, which already names the century it guessed.
 */
function futureRows(rows: DataRow[], today: string): DataRow[] {
  return rows.filter((r) => r.datetime !== undefined && r.datetime.ambiguity === undefined && earliestUtcDayOf(r.datetime.end ?? r.datetime) > today);
}

function dateFuture(ds: Dataset, sheet: string, future: DataRow[], out: Finding[]): void {
  if (future.length === 0) return;
  const field = dateHeader(ds, sheet);
  const f = future[0];
  out.push(
    makeFinding('ROW-DATE-FUTURE', {
      file: ds.file, sheet, lines: future.map((r) => r.line),
      ...(field !== undefined ? { field } : {}),
      value: String(f.dateRaw ?? f.datetime!.iso).trim(),
    }),
  );
}

/* ---------- public ---------- */

export interface RowContext {
  /** The land/sea grid; without it ROW-ON-LAND does not run (the report then says so, see runChecks). */
  land?: LandMask;
  /** Today as a UTC calendar day, YYYY-MM-DD. Without it ROW-DATE-FUTURE does not run: the checks never read the clock themselves. */
  today?: string;
}

/** Category B — row checks. */
export function checkRows(ds: Dataset, ctx: RowContext = {}): Finding[] {
  const out: Finding[] = [];
  const declared = declaredYears(ds);
  for (const [sheet, rows] of bySheet(ds.rows)) {
    positionRules(ds, sheet, rows, out);
    noCoord(ds, sheet, rows, out);
    stationMoved(ds, sheet, rows, out);
    if (ctx.land) onLand(ds, sheet, rows, ctx.land, out);
    depthRules(ds, sheet, rows, out);
    dateMissing(ds, sheet, rows, out);
    // a date in the future is also outside the declared years; one finding for it, the more specific one
    const future = ctx.today === undefined ? [] : futureRows(rows, ctx.today);
    dateFuture(ds, sheet, future, out);
    const futureSet = new Set(future);
    yearOutlier(ds, sheet, futureSet.size === 0 ? rows : rows.filter((r) => !futureSet.has(r)), declared, out);
  }
  unitMissing(ds, out);
  headerCodeShape(ds, out);
  depthSign(ds, out);
  return out;
}
