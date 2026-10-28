// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

import { unitDimension } from '../recognize/vocab';
import { makeFinding } from '../rules/registry';
import type { DataRow, Dataset, Finding, NumericCell, Variable } from '../types';
import { minOf, maxOf } from '../util/arrays';

/*
 * Category C — checks across several loaded datasets. A dataset is one table (a CSV file, or ONE sheet of a
 * workbook), so a three-sheet workbook is three datasets and all comparisons are between dataset pairs.
 *
 * No number in this file is a QC threshold. "Equal" is derived from the precision the values were reported
 * with: |a - b| <= 1/2 * 10^-decimals(a) + 1/2 * 10^-decimals(b). The same rule serves positions and depths.
 */

/* ---------- precision-derived equality (also used by the chemistry checks) ---------- */

/** Number of decimals of a number as written by String(), exponent form included. */
export function decimalsOfNumber(n: number): number {
  const m = /^-?\d*\.?(\d*)(?:e([+-]?\d+))?$/i.exec(String(n));
  if (!m) return 0;
  return Math.max(0, m[1].length - (m[2] ? Number(m[2]) : 0));
}

/** Decimals a numeric cell was reported with. */
export function cellDecimals(c: NumericCell): number {
  return c.decimals ?? decimalsOfNumber(c.value ?? 0);
}

/**
 * |a - b| <= 1/2 * 10^-da + 1/2 * 10^-db, evaluated on an integer grid so that 1.0 vs 1.1 at one decimal
 * (exactly one unit apart) is not decided by floating-point noise.
 */
export function equalWithin(a: number, da: number, b: number, db: number): boolean {
  const m = Math.max(da, db);
  const scale = 10 ** (m + 1);
  return Math.round(Math.abs(a - b) * scale) <= 5 * 10 ** (m - da) + 5 * 10 ** (m - db);
}

/** Last "/" segment, trimmed, upper case, blanks removed: "X9/ST2" and " sgd 2" both become a station key. */
export function normaliseStation(s: string): string {
  const parts = s.split('/');
  const last = parts[parts.length - 1];
  return (last.trim() === '' ? s : last).trim().toUpperCase().replace(/\s+/g, '');
}

/* ---------- per-dataset preparation ---------- */

interface PRow {
  row: DataRow;
  station?: string;                               // normalised
  day?: string;                                   // YYYY-MM-DD when the date is known to the day
  depth?: { v: number; dec: number };             // positive down
}
interface Prep {
  ds: Dataset;
  rows: PRow[];
  depthUnit?: string;
  byStationDay: Map<string, PRow[]>;
  byPosDay: Map<string, PRow[]>;                  // rows WITHOUT a station, keyed by degree cell and day
  byStation: Map<string, PRow[]>;
  canon: Map<string, Variable[]>;                 // canonical variable -> variables that have it and a unit or not
}

const DAY_PRECISIONS: ReadonlySet<string> = new Set(['day', 'minute', 'second']);
const cellKey = (lat: number, lon: number, day: string): string => `${Math.floor(lat)}:${Math.floor(lon)}|${day}`;

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const l = m.get(k);
  if (l) l.push(v);
  else m.set(k, [v]);
}

function prepare(ds: Dataset): Prep {
  const sign = ds.depthPositive === 'up' ? -1 : 1;
  const depthRole = ds.mappings.flatMap((m) => m.columns).find((c) => c.role.kind === 'depth')?.role;
  const unit = depthRole && depthRole.kind === 'depth' ? depthRole.unit : undefined;
  const p: Prep = {
    ds,
    rows: [],
    depthUnit: unit === undefined ? undefined : unit.trim().toLowerCase(),
    byStationDay: new Map(),
    byPosDay: new Map(),
    byStation: new Map(),
    canon: new Map(),
  };
  for (const v of ds.variables) if (v.canonical) push(p.canon, v.canonical, v);
  for (const row of ds.rows) {
    const pr: PRow = { row };
    if (row.station !== undefined && row.station.trim() !== '') pr.station = normaliseStation(row.station);
    if (row.datetime && DAY_PRECISIONS.has(row.datetime.precision)) pr.day = row.datetime.iso.slice(0, 10);
    if (row.depth !== undefined) pr.depth = { v: sign * row.depth, dec: row.depthDecimals ?? decimalsOfNumber(row.depth) };
    p.rows.push(pr);
    if (pr.station !== undefined) {
      push(p.byStation, pr.station, pr);
      if (pr.day !== undefined) push(p.byStationDay, `${pr.station}|${pr.day}`, pr);
    } else if (pr.day !== undefined && row.lat !== undefined && row.lon !== undefined) {
      push(p.byPosDay, cellKey(row.lat, row.lon, pr.day), pr);
    }
  }
  return p;
}

const okCell = (row: DataRow, key: string): NumericCell | undefined => {
  const c = row.values[key];
  return c !== undefined && c.status === 'ok' && c.value !== undefined ? c : undefined;
};

/** Distance between two depths when they are the same depth, else undefined. Both missing counts as the same (0). */
function depthDistance(a: PRow, pa: Prep, b: PRow, pb: Prep): number | undefined {
  if (a.depth === undefined && b.depth === undefined) return 0;
  if (a.depth === undefined || b.depth === undefined) return undefined;
  // a depth in cm and one in m are different columns; an unstated unit cannot be compared with anything
  if (pa.depthUnit === undefined || pb.depthUnit === undefined || pa.depthUnit !== pb.depthUnit) return undefined;
  return equalWithin(a.depth.v, a.depth.dec, b.depth.v, b.depth.dec) ? Math.abs(a.depth.v - b.depth.v) : undefined;
}

/* ---------- sample matching ---------- */

interface Pair {
  a: PRow;
  b: PRow;
}

function candidates(ra: PRow, B: Prep): PRow[] {
  const day = ra.day;
  if (day === undefined) return [];
  if (ra.station !== undefined) return B.byStationDay.get(`${ra.station}|${day}`) ?? [];
  const { lat, lon } = ra.row;
  if (lat === undefined || lon === undefined) return [];
  const out: PRow[] = [];
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      for (const rb of B.byPosDay.get(cellKey(lat + di, lon + dj, day)) ?? []) {
        const { lat: lb, lon: ob } = rb.row;
        if (lb === undefined || ob === undefined) continue;
        const la = ra.row.latDecimals ?? decimalsOfNumber(lat);
        const oa = ra.row.lonDecimals ?? decimalsOfNumber(lon);
        if (equalWithin(lat, la, lb, rb.row.latDecimals ?? decimalsOfNumber(lb)) && equalWithin(lon, oa, ob, rb.row.lonDecimals ?? decimalsOfNumber(ob))) out.push(rb);
      }
    }
  }
  return out;
}

/** One-to-one matches: same station (or same position), same day, same depth (closest first). */
function matchSamples(A: Prep, B: Prep): Pair[] {
  const used = new Set<PRow>();
  const out: Pair[] = [];
  for (const ra of A.rows) {
    let best: PRow | undefined;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const rb of candidates(ra, B)) {
      if (used.has(rb)) continue;
      const d = depthDistance(ra, A, rb, B);
      if (d !== undefined && d < bestDist) {
        best = rb;
        bestDist = d;
      }
    }
    if (best) {
      used.add(best);
      out.push({ a: ra, b: best });
    }
  }
  return out;
}

/* ---------- per-pair checks ---------- */

function sharedCanonical(A: Prep, B: Prep): string[] {
  return [...A.canon.keys()].filter((c) => B.canon.has(c));
}

/** For one canonical variable: do the two rows carry values for it, and is any pair of them equal? */
function compareCanonical(ra: DataRow, va: readonly Variable[], rb: DataRow, vb: readonly Variable[]): 'none' | 'equal' | 'differ' {
  let seen = false;
  for (const x of va) {
    const ca = okCell(ra, x.key);
    if (!ca) continue;
    for (const y of vb) {
      const cb = okCell(rb, y.key);
      if (!cb) continue;
      seen = true;
      if (equalWithin(ca.value!, cellDecimals(ca), cb.value!, cellDecimals(cb))) return 'equal';
    }
  }
  return seen ? 'differ' : 'none';
}

function duplicateSamples(A: Prep, B: Prep, pairs: Pair[], out: Finding[]): void {
  const shared = sharedCanonical(A, B);
  if (shared.length === 0) return;
  const lines: number[] = [];
  for (const { a, b } of pairs) {
    // the same place and time measured for DIFFERENT variables is one sample, not a duplicate
    if (shared.some((c) => compareCanonical(a.row, A.canon.get(c)!, b.row, B.canon.get(c)!) !== 'none')) lines.push(a.row.line);
  }
  if (lines.length === 0) return;
  out.push(
    makeFinding('XF-DUPLICATE-SAMPLES', {
      file: A.ds.file,
      lines,
      value: `${A.ds.label} / ${B.ds.label}`,
      params: { fileA: A.ds.label, fileB: B.ds.label, count: lines.length },
      datasetIds: [A.ds.id, B.ds.id],
    }),
  );
}

const isAmountVolume = (u: string | undefined): boolean => unitDimension(u) === 'amount/volume';
const isAmountMass = (u: string | undefined): boolean => unitDimension(u) === 'amount/mass';

function unitConflicts(A: Prep, B: Prep, pairs: Pair[], out: Finding[]): void {
  for (const [canonical, varsA] of A.canon) {
    const varsB = B.canon.get(canonical);
    if (!varsB) continue;
    for (const va of varsA) {
      for (const vb of varsB) {
        const opposite = (isAmountVolume(va.unit) && isAmountMass(vb.unit)) || (isAmountMass(va.unit) && isAmountVolume(vb.unit));
        if (!opposite) continue;
        let matched = 0;
        const equalLines: number[] = [];
        for (const { a, b } of pairs) {
          const ca = okCell(a.row, va.key);
          const cb = okCell(b.row, vb.key);
          if (!ca || !cb) continue;
          matched += 1;
          if (equalWithin(ca.value!, cellDecimals(ca), cb.value!, cellDecimals(cb))) equalLines.push(ca.line);
        }
        if (matched === 0 || equalLines.length * 2 <= matched) continue;
        out.push(
          makeFinding('XF-UNIT-CONFLICT', {
            file: A.ds.file,
            field: va.header,
            value: `${canonical}: ${va.unit} (${A.ds.label}) vs ${vb.unit} (${B.ds.label})`,
            lines: equalLines,
            params: { variable: canonical, unitA: va.unit!, unitB: vb.unit!, matched, equal: equalLines.length, fileA: A.ds.label, fileB: B.ds.label },
            datasetIds: [A.ds.id, B.ds.id],
          }),
        );
      }
    }
  }
}

function dateConflicts(A: Prep, B: Prep, out: Finding[]): void {
  const shared = sharedCanonical(A, B);
  if (shared.length < 2) return;
  for (const [station, rowsA] of A.byStation) {
    const rowsB = B.byStation.get(station);
    if (!rowsB) continue;
    let example: { a: PRow; b: PRow } | undefined;
    const linesA: number[] = [];
    for (const ra of rowsA) {
      if (ra.day === undefined) continue;
      for (const rb of rowsB) {
        if (rb.day === undefined || rb.day === ra.day) continue;
        if (depthDistance(ra, A, rb, B) === undefined) continue;
        let equal = 0;
        let differ = false;
        for (const c of shared) {
          const r = compareCanonical(ra.row, A.canon.get(c)!, rb.row, B.canon.get(c)!);
          if (r === 'equal') equal += 1;
          else if (r === 'differ') {
            differ = true;
            break;
          }
        }
        if (differ || equal < 2) continue;
        example ??= { a: ra, b: rb };
        linesA.push(ra.row.line);
        break;
      }
    }
    if (!example) continue;
    out.push(
      makeFinding('XF-DATE-CONFLICT', {
        file: A.ds.file,
        lines: linesA,
        value: `${example.a.row.station ?? station}: ${A.ds.label} / ${B.ds.label}`,
        params: {
          station: example.a.row.station ?? station,
          fileA: A.ds.label,
          fileB: B.ds.label,
          dateA: example.a.day!,
          dateB: example.b.day!,
          lineA: example.a.row.line,
          lineB: example.b.row.line,
        },
        datasetIds: [A.ds.id, B.ds.id],
      }),
    );
  }
}

/* ---------- station aliases ---------- */

function stationAliases(preps: Prep[], out: Finding[]): void {
  interface Use {
    datasets: Set<number>;
    rows: number;
  }
  const byNorm = new Map<string, Map<string, Use>>();
  preps.forEach((p, i) => {
    for (const r of p.rows) {
      if (r.station === undefined) continue;
      const raw = r.row.station!;
      let names = byNorm.get(r.station);
      if (!names) byNorm.set(r.station, (names = new Map()));
      let use = names.get(raw);
      if (!use) names.set(raw, (use = { datasets: new Set(), rows: 0 }));
      use.datasets.add(i);
      use.rows += 1;
    }
  });
  for (const names of byNorm.values()) {
    if (names.size < 2) continue;
    const sorted = [...names].sort((x, y) => y[1].datasets.size - x[1].datasets.size || y[1].rows - x[1].rows || (x[0] < y[0] ? -1 : 1));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const [nameA, useA] = sorted[i];
        const [nameB, useB] = sorted[j];
        const label = (u: Use) => [...u.datasets].sort((a, b) => a - b).map((k) => preps[k].ds.label).join(', ');
        const firstB = preps[minOf([...useB.datasets])];
        out.push(
          makeFinding('XF-STATION-ALIAS', {
            file: firstB.ds.file,
            value: `${nameA} / ${nameB}`,
            params: { nameA, nameB, fileA: label(useA), fileB: label(useB) },
            datasetIds: [...new Set([...useA.datasets, ...useB.datasets])].sort((a, b) => a - b).map((k) => preps[k].ds.id),
          }),
        );
      }
    }
  }
}

/* ---------- positions: swaps and conflicts ---------- */

interface StPos {
  raw: string;
  lat: number;
  lon: number;
  dLat: number;
  dLon: number;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  lines: number[];
}

/** Longitude b moved by +-360 so that it lies within 180 degrees of a. */
function unwrap(a: number, b: number): number {
  const d = b - a;
  return d > 180 ? b - 360 : d < -180 ? b + 360 : b;
}

/** Dominant (most frequent rounded) position of each station, plus the full range it spans in the dataset. */
function stationPositions(p: Prep): Map<string, StPos> {
  const groups = new Map<string, PRow[]>();
  for (const r of p.rows) {
    const { lat, lon } = r.row;
    // lat === lon is a reported defect (ROW-LAT-EQ-LON); it says nothing about where the station is
    if (r.station === undefined || lat === undefined || lon === undefined || lat === lon) continue;
    push(groups, r.station, r);
  }
  const out = new Map<string, StPos>();
  for (const [station, rows] of groups) {
    const decs = rows.map((r) => ({ la: r.row.latDecimals ?? decimalsOfNumber(r.row.lat!), lo: r.row.lonDecimals ?? decimalsOfNumber(r.row.lon!) }));
    const dLat = minOf(decs.map((d) => d.la));
    const dLon = minOf(decs.map((d) => d.lo));
    const rl = (v: number, d: number): number => Math.round(v * 10 ** d) / 10 ** d;
    const counts = new Map<string, { n: number; lat: number; lon: number }>();
    for (const r of rows) {
      const lat = rl(r.row.lat!, dLat);
      const lon = rl(r.row.lon!, dLon);
      const k = `${lat}|${lon}`;
      const c = counts.get(k);
      if (c) c.n += 1;
      else counts.set(k, { n: 1, lat, lon });
    }
    let dom = { n: 0, lat: 0, lon: 0 };
    for (const c of counts.values()) if (c.n > dom.n) dom = c;
    const lats = rows.map((r) => r.row.lat!);
    const lons = rows.map((r) => unwrap(dom.lon, r.row.lon!));
    out.set(station, {
      raw: rows[0].row.station!,
      lat: dom.lat,
      lon: dom.lon,
      dLat,
      dLon,
      minLat: minOf(lats),
      maxLat: maxOf(lats),
      minLon: minOf(lons),
      maxLon: maxOf(lons),
      lines: rows.map((r) => r.row.line),
    });
  }
  return out;
}

const samePosition = (p: StPos, q: StPos): boolean => equalWithin(p.lat, p.dLat, q.lat, q.dLat) && equalWithin(p.lon, p.dLon, unwrap(p.lon, q.lon), q.dLon);

/** Is the dominant position of p inside the range of q (rounding of both included)? */
function insideRange(p: StPos, q: StPos): boolean {
  const lon = unwrap(q.lon, p.lon);
  const latOk = (p.lat >= q.minLat && p.lat <= q.maxLat) || equalWithin(p.lat, p.dLat, q.minLat, q.dLat) || equalWithin(p.lat, p.dLat, q.maxLat, q.dLat);
  const lonOk = (lon >= q.minLon && lon <= q.maxLon) || equalWithin(lon, p.dLon, q.minLon, q.dLon) || equalWithin(lon, p.dLon, q.maxLon, q.dLon);
  return latOk && lonOk;
}

/** Two datasets disagree about a station when neither one's position lies in the other's range. */
const disagree = (p: StPos, q: StPos): boolean => !insideRange(p, q) && !insideRange(q, p);

/** Distance between two dominant positions in degrees of arc (longitude scaled by the cosine of the latitude). */
function distance(p: StPos, q: StPos): number {
  const dLat = p.lat - q.lat;
  const dLon = (unwrap(p.lon, q.lon) - p.lon) * Math.cos(((p.lat + q.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLon);
}

/** Mean Earth radius (IUGG, 6371.0088 km) — converts degrees of arc to km for display only, never for a decision. */
const KM_PER_DEGREE = (6371.0088 * Math.PI) / 180;
const offsetKm = (p: StPos, others: StPos[]): string => {
  const km = maxOf(others.map((q) => distance(p, q))) * KM_PER_DEGREE;
  return km < 10 ? km.toFixed(1) : km.toFixed(0);
};

const fmtPos = (p: StPos): string => `${p.lat.toFixed(p.dLat)}, ${p.lon.toFixed(p.dLon)}`;

function positionChecks(preps: Prep[], out: Finding[]): void {
  const pos = preps.map(stationPositions);
  const swapped = new Set<string>();
  const swapEdges = new Map<string, { a: string; b: string; edges: [number, number][] }>();

  // swaps first: stations A and B exchange positions between two datasets. Both moved, the exchanged assignment
  // (A's position in one file belongs to B in the other, and vice versa) fits strictly better than the same-name
  // one, and each is the other's best partner. Positions of one station rarely repeat to the last digit between
  // sources, so "equal" is not required -- only that the swap explains the data better than the names do.
  for (let i = 0; i < preps.length; i++) {
    for (let j = i + 1; j < preps.length; j++) {
      const moved = [...pos[i]].filter(([s, p]) => {
        const q = pos[j].get(s);
        return q !== undefined && !samePosition(p, q);
      });
      // negative when the exchanged assignment is the better one: each exchanged pairing is closer than each same-name pairing
      const gain = (a: string, b: string): number => {
        const ai = pos[i].get(a)!;
        const bi = pos[i].get(b)!;
        const aj = pos[j].get(a)!;
        const bj = pos[j].get(b)!;
        if (samePosition(ai, bi) || samePosition(aj, bj)) return Number.POSITIVE_INFINITY; // the two stations must be distinct places
        const exchanged = Math.max(distance(ai, bj), distance(bi, aj));
        const named = Math.min(distance(ai, aj), distance(bi, bj));
        return exchanged < named ? exchanged - named : Number.POSITIVE_INFINITY;
      };
      const best = new Map<string, string>();
      for (const [a] of moved) {
        let bestB: string | undefined;
        let bestGain = 0;
        for (const [b] of moved) {
          if (b === a) continue;
          const g = gain(a, b);
          if (g < bestGain) {
            bestGain = g;
            bestB = b;
          }
        }
        if (bestB !== undefined) best.set(a, bestB);
      }
      for (const [a, b] of best) {
        if (best.get(b) !== a || a > b) continue;
        swapped.add(a).add(b);
        const key = JSON.stringify([a, b]);
        const entry = swapEdges.get(key);
        if (entry) entry.edges.push([i, j]);
        else swapEdges.set(key, { a, b, edges: [[i, j]] });
      }
    }
  }
  // One finding per station pair and "centre" dataset: the dataset that is swapped against the most others is named
  // fileA and its partners are listed in fileB, so a single odd file is not reported once per file it differs from.
  for (const { a, b, edges: edges0 } of swapEdges.values()) {
    let edges = edges0;
    while (edges.length > 0) {
      const degree = new Map<number, number>();
      for (const [x, y] of edges) {
        degree.set(x, (degree.get(x) ?? 0) + 1);
        degree.set(y, (degree.get(y) ?? 0) + 1);
      }
      const centre = [...degree].sort((p, q) => q[1] - p[1] || p[0] - q[0])[0][0];
      const partners = edges.filter(([x, y]) => x === centre || y === centre).map(([x, y]) => (x === centre ? y : x)).sort((p, q) => p - q);
      edges = edges.filter(([x, y]) => x !== centre && y !== centre);
      const ai = pos[centre].get(a)!;
      const bi = pos[centre].get(b)!;
      out.push(
        makeFinding('XF-POSITION-SWAP', {
          file: preps[centre].ds.file,
          lines: [...ai.lines, ...bi.lines],
          value: `${ai.raw} / ${bi.raw}`,
          params: { stationA: ai.raw, stationB: bi.raw, fileA: preps[centre].ds.label, fileB: partners.map((k) => preps[k].ds.label).join(', ') },
          datasetIds: [centre, ...partners].map((k) => preps[k].ds.id),
        }),
      );
    }
  }

  // conflicts: station by station, never for a station that is part of a swap
  const byStation = new Map<string, { k: number; p: StPos }[]>();
  pos.forEach((m, k) => m.forEach((p, s) => push(byStation, s, { k, p })));
  for (const [station, entries] of byStation) {
    if (entries.length < 2 || swapped.has(station)) continue;
    const n = entries.length;
    const dis = entries.map((x, xi) => entries.map((y, yi) => xi !== yi && disagree(x.p, y.p)));
    if (!dis.some((row) => row.some(Boolean))) continue;

    // Three or more datasets: only an outlier is reported -- one that disagrees with every other dataset (beyond
    // rounding and beyond the station's own spread) and lies farther from each of them than any two of the others lie
    // from one another. "The others agree with each other" is therefore relative: sources rarely repeat a position to
    // the last digit, so they only have to be closer to one another than to the outlier.
    // Two datasets: both are named, there is no majority to side with.
    // Datasets that are sheets of one workbook are not independent witnesses: a "majority" made of them alone
    // counts as one source, so the finding then names both sides instead of blaming the lone file.
    const all = entries.map((_, i) => i);
    const dist = (x: number, y: number): number => distance(entries[x].p, entries[y].p);
    let named: number[];
    if (n === 2) {
      named = all;
    } else {
      const outlier = all.find(
        (x) =>
          all.every((y) => y === x || dis[x][y]) &&
          minOf(all.filter((y) => y !== x).map((y) => dist(x, y))) > Math.max(0, maxOf(all.filter((y) => y !== x).flatMap((y) => all.filter((z) => z !== x && z > y).map((z) => dist(y, z))))),
      );
      if (outlier === undefined) continue;
      const independent = new Set(entries.filter((_, i) => i !== outlier).map((e) => preps[e.k].ds.file)).size;
      named = independent >= 2 ? [outlier] : all;
    }
    const first = entries[named[0]];
    const nameOf = (idx: number): string => {
      const ds = preps[entries[idx].k].ds;
      return named.filter((i) => preps[entries[i].k].ds.file === ds.file).length > 1 ? ds.file : ds.label;
    };
    const files = [...new Set(named.map(nameOf))].join(', ');
    out.push(
      makeFinding('XF-POSITION-CONFLICT', {
        file: preps[first.k].ds.file,
        lines: first.p.lines,
        value: first.p.raw,
        params: {
          station: first.p.raw,
          files,
          // The offset in km lets the reader tell a nominal-vs-cast offset from a different place at a glance; there
          // is no citable distance tolerance, so the tool states the distance instead of judging it.
          positions: `${entries.map((e) => `${preps[e.k].ds.label}: ${fmtPos(e.p)}`).join('; ')} (largest offset ≈ ${offsetKm(first.p, entries.map((e) => e.p))} km)`,
        },
        datasetIds: entries.map((e) => preps[e.k].ds.id),
      }),
    );
  }
}

/* ---------- entry point ---------- */

/** Category C checks that need two or more datasets. */
export function checkCrossFile(datasets: Dataset[]): Finding[] {
  if (datasets.length < 2) return [];
  const preps = datasets.map(prepare);
  const out: Finding[] = [];
  stationAliases(preps, out);
  for (let i = 0; i < preps.length; i++) {
    for (let j = i + 1; j < preps.length; j++) {
      const pairs = matchSamples(preps[i], preps[j]);
      duplicateSamples(preps[i], preps[j], pairs, out);
      unitConflicts(preps[i], preps[j], pairs, out);
      dateConflicts(preps[i], preps[j], out);
    }
  }
  positionChecks(preps, out);
  return out;
}
