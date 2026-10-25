// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ParsedDate } from '../types';
import type { EventRec, SourceRef, TreeSummary } from './model';

/*
 * The event tree: cruise -> station -> sample, built from the confirmed columns.
 *
 * Event core of the OBIS Manual (https://manual.obis.org/format_event.html): events form a hierarchy through parentEventID; the leaf events
 * carry the data. Parents of this tree are DERIVED from their children, never typed in:
 *   eventDate   an ISO 8601 interval from the earliest start to the latest end of the children
 *   position    the midpoint of the children's bounding box (the antimeridian is handled: the box is the shortest arc of longitudes that
 *               holds every child), with coordinateUncertaintyInMeters = the greatest great-circle distance from that point to a child
 *               (plus the child's own uncertainty when the child is itself a derived parent), rounded UP to whole metres, so the circle
 *               contains every child. Distances are haversine on a sphere of the mean Earth radius; the model error against the WGS84
 *               ellipsoid is below about 0.5 %, which the whole-metre round-up does not absorb; the value is an upper estimate of the
 *               spread, not a survey. A BioCheck run (docs/research/qc-sources.md, "Converter" spike, Item 6) accepted a derived cruise position.
 *   depth       the minimum of the children's minimum depths and the maximum of their maximum depths
 * eventType is written as the text "cruise" / "station" / "sample" (the OBIS Manual's example values; BioCheck reads it as text).
 *
 * Profile levels (stage 6): a row of a profile file is a leaf event of its station, eventType "profile level". Levels are children like samples, so the station's
 * derived date, position, uncertainty and depth range cover its levels as well as its samples (a station that has only levels is derived from the levels alone). A level
 * that has no position or date of its own leaves them empty and inherits them from the station in OBIS (the OBIS Manual, Event core: "child events will inherit
 * information from the parent event when the field is left empty"; BioCheck judges the leaves after inheritance, docs/research/qc-sources.md, stage 0, Item 2b). There is
 * no cast level between a station and its levels: the manual's hierarchy example has three levels (cruise, station, sample), and a cast level would need a cast column the
 * sheet mapping does not have; repeated casts are told apart by the level's own code.
 *
 * "Flatten a level": the station level is dropped and each sample's `locality` holds the station code; the cruise level is dropped and the
 * cruise code goes to the dataset text (`cruiseText`). The children are re-parented to the level above. eventIDs never change with
 * flattening (a flattened station still prefixes a sample's ID when the toggle is on), so a flattened and an unflattened archive agree on IDs.
 */

/** The decimals of a position worked out from the children (the midpoint of their box); the writer drops trailing zeros. */
export const DERIVED_DECIMALS = 6;

/** One sample as the sheet gave it. */
export interface SampleSite {
  /** The final eventID. */
  id: string;
  /** The user's sample code. */
  code: string;
  stationCode?: string;
  cruiseCode?: string;
  date?: ParsedDate;
  lat?: number;
  lon?: number;
  latDecimals?: number;
  lonDecimals?: number;
  /** The source text of a position or depth that came from one plain number cell (only a decimal comma turned into a point): written as it is. */
  latText?: string;
  lonText?: string;
  depthMinText?: string;
  depthMaxText?: string;
  depthMin?: number;
  depthMax?: number;
  depthDecimals?: number;
  sampleSizeValue?: string;
  sampleSizeUnit?: string;
  source?: SourceRef;
  /** What the event is: a sample of a biology sheet (default) or a level of a profile file. */
  eventType?: 'sample' | 'profile level';
}

export interface TreeOptions {
  /** Drop a level; its code moves to `locality` (station) or to the dataset text (cruise). */
  flatten?: { station?: boolean; cruise?: boolean };
}

export interface EventTree {
  events: EventRec[];
  summary: TreeSummary;
  /** The codes of a flattened cruise level, for the dataset title / abstract. */
  cruiseText: string[];
}

/** The eventID of a station: `cruise:station`, or the station code alone when there is no cruise. */
export const stationEventId = (cruise: string | undefined, station: string): string => (cruise === undefined ? station : `${cruise}:${station}`);

/* ---------- dates ---------- */

const ISO = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?(Z|[+-]\d{2}:?\d{2})?$/;

/** The instant a (possibly partial) ISO date starts or ends, in ms; a missing zone reads as UTC (only the ORDER of events is needed). NaN when unreadable. */
function boundMs(iso: string, edge: 'start' | 'end'): number {
  const m = ISO.exec(iso);
  if (!m) return NaN;
  const y = Number(m[1]);
  const mo = m[2] === undefined ? 0 : Number(m[2]) - 1;
  const d = m[3] === undefined ? 1 : Number(m[3]);
  const h = m[4] === undefined ? 0 : Number(m[4]);
  const mi = m[5] === undefined ? 0 : Number(m[5]);
  const s = m[6] === undefined ? 0 : Number(m[6]);
  const start = Date.UTC(y, mo, d, h, mi, s);
  let offset = 0;
  if (m[7] && m[7] !== 'Z') {
    const o = /^([+-])(\d{2}):?(\d{2})$/.exec(m[7]);
    if (o) offset = (o[1] === '-' ? -1 : 1) * (Number(o[2]) * 60 + Number(o[3])) * 60000;
  }
  const shifted = start - offset;
  if (edge === 'start') return shifted;
  // the end of the unit the text names: a year ends with its last millisecond, a minute with the end of that minute
  const next =
    m[6] !== undefined ? Date.UTC(y, mo, d, h, mi, s + 1) : m[4] !== undefined ? Date.UTC(y, mo, d, h, mi + 1, 0) : m[3] !== undefined ? Date.UTC(y, mo, d + 1) : m[2] !== undefined ? Date.UTC(y, mo + 1, 1) : Date.UTC(y + 1, 0, 1);
  return next - offset - 1;
}

/** ParsedDate -> the text written to eventDate (a UTC time carries its Z, as the clean CSV does). */
export function eventDateText(d: ParsedDate): string {
  const text = (p: ParsedDate): string => (p.tz === 'utc' && (p.precision === 'minute' || p.precision === 'second') && !p.iso.endsWith('Z') ? `${p.iso}Z` : p.iso);
  const start = text(d);
  if (!d.end) return start;
  const end = text(d.end);
  return end === start ? start : `${start}/${end}`;
}

interface Span {
  startIso: string;
  endIso: string;
  startMs: number;
  endMs: number;
}

function spanOf(d: ParsedDate): Span | undefined {
  const text = eventDateText(d);
  const [startIso, endIso = startIso] = text.split('/');
  const startMs = boundMs(startIso, 'start');
  const endMs = boundMs(endIso, 'end');
  return Number.isNaN(startMs) || Number.isNaN(endMs) ? undefined : { startIso, endIso, startMs, endMs };
}

function mergeSpans(spans: readonly Span[]): Span | undefined {
  if (spans.length === 0) return undefined;
  let first = spans[0];
  let last = spans[0];
  for (const s of spans) {
    if (s.startMs < first.startMs) first = s;
    if (s.endMs > last.endMs) last = s;
  }
  return { startIso: first.startIso, endIso: last.endIso, startMs: first.startMs, endMs: last.endMs };
}

const spanText = (s: Span): string => (s.startIso === s.endIso ? s.startIso : `${s.startIso}/${s.endIso}`);

/* ---------- positions ---------- */

const EARTH_RADIUS_M = 6371008.8;
const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in metres (haversine, mean Earth radius). */
export function greatCircleM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

const wrapLon = (lon: number): number => {
  let x = ((((lon + 180) % 360) + 360) % 360) - 180;
  if (x === -180) x = 180;
  return x;
};

/** The centre of the shortest arc of longitudes that holds all of them: the bounding box centre across the antimeridian. */
export function centreLongitude(lons: readonly number[]): number {
  const xs = [...new Set(lons.map((l) => wrapLon(l)))].sort((a, b) => a - b);
  if (xs.length === 1) return xs[0];
  // the largest empty gap between neighbours (the one that wraps round from the last to the first counts first, so a tie never crosses the antimeridian)
  let best = xs[0] + 360 - xs[xs.length - 1];
  let bestAfter = -1; // index of the point after which the gap lies; -1 = the wrapping gap
  for (let i = 0; i < xs.length - 1; i++) {
    const gap = xs[i + 1] - xs[i];
    if (gap > best) {
      best = gap;
      bestAfter = i;
    }
  }
  if (bestAfter === -1) return wrapLon((xs[0] + xs[xs.length - 1]) / 2);
  return wrapLon((xs[bestAfter + 1] + xs[bestAfter] + 360) / 2);
}

const round6 = (x: number): number => Number(x.toFixed(6));

interface Point {
  lat: number;
  lon: number;
  /** The point's own uncertainty (a derived parent), 0 for a measured position. */
  u: number;
}

function deriveCentre(points: readonly Point[]): { lat: number; lon: number; uncertainty?: number } | undefined {
  if (points.length === 0) return undefined;
  // loops, not Math.min(...array): a parent can have hundreds of thousands of children
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  const lat = round6((minLat + maxLat) / 2);
  const lon = round6(centreLongitude(points.map((p) => p.lon)));
  let far = 0;
  for (const p of points) far = Math.max(far, greatCircleM(lat, lon, p.lat, p.lon) + p.u);
  // whole metres, rounded UP; a single position (nothing to cover) has no uncertainty of its own
  const uncertainty = far > 0 ? Math.ceil(far) : undefined;
  return { lat, lon, ...(uncertainty === undefined ? {} : { uncertainty }) };
}

/* ---------- the tree ---------- */

interface Node {
  rec: EventRec;
  span?: Span;
  children: Node[];
}

function derive(node: Node): void {
  for (const c of node.children) derive(c);
  const kids = node.children;
  const rec = node.rec;
  const span = mergeSpans(kids.flatMap((k) => (k.span ? [k.span] : [])));
  if (span) {
    node.span = span;
    rec.eventDate = spanText(span);
    rec.derived.date = true;
  }
  const centre = deriveCentre(kids.flatMap((k) => (k.rec.lat !== undefined && k.rec.lon !== undefined ? [{ lat: k.rec.lat, lon: k.rec.lon, u: k.rec.coordinateUncertaintyInMeters ?? 0 }] : [])));
  if (centre) {
    rec.lat = centre.lat;
    rec.lon = centre.lon;
    rec.latDecimals = DERIVED_DECIMALS;
    rec.lonDecimals = DERIVED_DECIMALS;
    if (centre.uncertainty !== undefined) rec.coordinateUncertaintyInMeters = centre.uncertainty;
    rec.derived.position = true;
  }
  let minD: number | undefined;
  let maxD: number | undefined;
  let dec: number | undefined;
  for (const k of kids) {
    const lo = k.rec.depthMin;
    const hi = k.rec.depthMax;
    if (lo !== undefined && (minD === undefined || lo < minD)) minD = lo;
    if (hi !== undefined && (maxD === undefined || hi > maxD)) maxD = hi;
    const d = k.rec.depthDecimals;
    if (d !== undefined && (dec === undefined || d > dec)) dec = d;
  }
  if (minD !== undefined) rec.depthMin = minD;
  if (maxD !== undefined) rec.depthMax = maxD;
  if (minD !== undefined || maxD !== undefined) {
    rec.derived.depth = true;
    if (dec !== undefined) rec.depthDecimals = dec;
  }
}

/**
 * Builds the event records of a set of samples. Sample ids must be unique (the caller reports duplicates); a repeated id keeps its first sample.
 * Events come out parents first: cruises, then stations, then samples, each in first-seen order.
 */
export function buildEventTree(samples: readonly SampleSite[], opts: TreeOptions = {}): EventTree {
  const flattenStation = opts.flatten?.station === true;
  const flattenCruise = opts.flatten?.cruise === true;
  const cruises = new Map<string, Node>();
  const stations = new Map<string, Node>();
  const leaves = new Map<string, Node>();
  const cruiseText: string[] = [];
  const cruiseSeen = new Set<string>();

  const cruiseNode = (code: string): Node => {
    let n = cruises.get(code);
    if (!n) {
      n = { rec: { id: code, eventType: 'cruise', code, derived: { date: false, position: false, depth: false } }, children: [] };
      cruises.set(code, n);
    }
    return n;
  };
  const stationNode = (cruise: string | undefined, code: string): Node => {
    const id = stationEventId(cruise, code);
    let n = stations.get(id);
    if (!n) {
      n = { rec: { id, eventType: 'station', code, derived: { date: false, position: false, depth: false } }, children: [] };
      stations.set(id, n);
    }
    return n;
  };

  for (const s of samples) {
    if (leaves.has(s.id)) continue;
    const rec: EventRec = { id: s.id, eventType: s.eventType ?? 'sample', code: s.code, derived: { date: false, position: false, depth: false } };
    if (s.date) rec.eventDate = eventDateText(s.date);
    if (s.lat !== undefined && s.lon !== undefined) {
      rec.lat = s.lat;
      rec.lon = s.lon;
      if (s.latDecimals !== undefined) rec.latDecimals = s.latDecimals;
      if (s.lonDecimals !== undefined) rec.lonDecimals = s.lonDecimals;
      if (s.latText !== undefined) rec.latText = s.latText;
      if (s.lonText !== undefined) rec.lonText = s.lonText;
    }
    if (s.depthMinText !== undefined) rec.depthMinText = s.depthMinText;
    if (s.depthMaxText !== undefined) rec.depthMaxText = s.depthMaxText;
    if (s.depthMin !== undefined) rec.depthMin = s.depthMin;
    if (s.depthMax !== undefined) rec.depthMax = s.depthMax;
    if (s.depthDecimals !== undefined) rec.depthDecimals = s.depthDecimals;
    if (s.sampleSizeValue !== undefined) rec.sampleSizeValue = s.sampleSizeValue;
    if (s.sampleSizeUnit !== undefined) rec.sampleSizeUnit = s.sampleSizeUnit;
    if (s.source) rec.source = s.source;
    const node: Node = { rec, children: [] };
    if (s.date) {
      const span = spanOf(s.date);
      if (span) node.span = span;
    }
    leaves.set(s.id, node);

    // the parent chain: cruise -> station -> sample, minus the flattened levels
    const cruise = s.cruiseCode === undefined ? undefined : cruiseNode(s.cruiseCode);
    if (cruise && flattenCruise && !cruiseSeen.has(cruise.rec.code)) {
      cruiseSeen.add(cruise.rec.code);
      cruiseText.push(cruise.rec.code);
    }
    const station = s.stationCode === undefined ? undefined : stationNode(s.cruiseCode, s.stationCode);
    if (station) {
      if (cruise && !flattenCruise) station.rec.parentId = cruise.rec.id;
      if (flattenStation) {
        rec.locality = station.rec.code;
        if (cruise && !flattenCruise) {
          rec.parentId = cruise.rec.id;
          cruise.children.push(node); // each sample is visited once (a repeated id was skipped above)
        }
      } else {
        rec.parentId = station.rec.id;
        station.children.push(node);
      }
    } else if (cruise && !flattenCruise) {
      rec.parentId = cruise.rec.id;
      cruise.children.push(node);
    }
  }
  // stations hang under their cruise (when the station level stays)
  if (!flattenStation) for (const st of stations.values()) {
    if (st.rec.parentId !== undefined) cruises.get(st.rec.parentId)?.children.push(st);
  }

  for (const n of [...cruises.values(), ...stations.values()]) {
    if ((n.rec.eventType === 'cruise' && flattenCruise) || (n.rec.eventType === 'station' && flattenStation)) continue;
    derive(n);
  }

  const events: EventRec[] = [];
  if (!flattenCruise) for (const n of cruises.values()) events.push(n.rec);
  if (!flattenStation) for (const n of stations.values()) events.push(n.rec);
  for (const n of leaves.values()) events.push(n.rec);
  return { events, summary: summarizeTree(events, { station: flattenStation, cruise: flattenCruise }), cruiseText };
}

/** Counts for the preview: events per level, roots, what was derived, samples that have no position of their own. */
export function summarizeTree(events: readonly EventRec[], flattened: { station: boolean; cruise: boolean } = { station: false, cruise: false }): TreeSummary {
  const by = (t: EventRec['eventType']): number => events.filter((e) => e.eventType === t).length;
  let maxUncertainty: number | undefined;
  for (const e of events) {
    const u = e.derived.position ? e.coordinateUncertaintyInMeters : undefined;
    if (u !== undefined && (maxUncertainty === undefined || u > maxUncertainty)) maxUncertainty = u;
  }
  return {
    events: events.length,
    cruises: by('cruise'),
    stations: by('station'),
    samples: by('sample'),
    levels: by('profile level'),
    roots: events.filter((e) => e.parentId === undefined).length,
    flattened,
    derivedDates: events.filter((e) => e.derived.date).length,
    derivedPositions: events.filter((e) => e.derived.position).length,
    derivedDepths: events.filter((e) => e.derived.depth).length,
    samplesWithoutPosition: events.filter((e) => e.eventType === 'sample' && (e.lat === undefined || e.lon === undefined)).length,
    ...(maxUncertainty === undefined ? {} : { maxUncertaintyM: maxUncertainty }),
  };
}
