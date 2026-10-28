// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Shared by the Zenodo and DataCite readers: shapes -> one bbox, collected dates -> one temporal extent.
import type { MetadataRecord } from '../types';
import { minOf, maxOf } from '../util/arrays';

export type Bbox = NonNullable<MetadataRecord['bbox']>;
export type Extent = NonNullable<MetadataRecord['temporalExtent']>;

/**
 * A box on the globe. west > east is allowed (a box across the antimeridian); a latitude or longitude off
 * the globe, or south > north, is not turned into a box.
 */
export function validBox(b: Bbox): boolean {
  return [b.west, b.east, b.south, b.north].every(Number.isFinite)
    && b.west >= -180 && b.west <= 180 && b.east >= -180 && b.east <= 180
    && b.south >= -90 && b.north <= 90 && b.south <= b.north;
}

/**
 * Union of boxes. One valid box is returned as is. Several: plain min/max, but when any of them crosses the
 * antimeridian, or the longitudes spread over more than half the globe (the short way round is unknowable),
 * the union spans all longitudes. That is a superset: it never lets a real point fall outside, and it is never
 * a narrower box than the record describes. Invalid boxes are ignored.
 */
export function unionBoxes(boxes: Bbox[]): Bbox | undefined {
  const ok = boxes.filter(validBox);
  if (ok.length === 0) return undefined;
  if (ok.length === 1) return ok[0];
  const south = minOf(ok.map((b) => b.south));
  const north = maxOf(ok.map((b) => b.north));
  const west = minOf(ok.map((b) => b.west));
  const east = maxOf(ok.map((b) => b.east));
  if (ok.some((b) => b.west > b.east) || east - west > 180) return { west: -180, east: 180, south, north };
  return { west, east, south, north };
}

/** The box that holds a set of points (a polygon's vertices, a list of stations). One point is a degenerate box. */
export function boxOfPoints(points: { lon?: number; lat?: number }[]): Bbox | undefined {
  const p = points.filter((x): x is { lon: number; lat: number } => x.lon !== undefined && x.lat !== undefined);
  // One incomplete or off-the-globe vertex makes the whole shape untrustworthy.
  if (p.length === 0 || p.length !== points.length || p.some((x) => Math.abs(x.lon) > 180 || Math.abs(x.lat) > 90)) return undefined;
  const lons = p.map((x) => x.lon);
  const lats = p.map((x) => x.lat);
  const west = minOf(lons);
  const east = maxOf(lons);
  const south = minOf(lats);
  const north = maxOf(lats);
  // Vertices 179 and -179 are a small shape across the antimeridian, not a huge one; the vertex order does not tell which.
  if (east - west > 180) return { west: -180, east: 180, south, north };
  return { west, east, south, north };
}

/**
 * DataCite dateType values that mean the period the DATA cover. "Collected" is the coverage type of schema 4.0 to 4.5 (dateType: Accepted,
 * Available, Copyrighted, Collected, Created, Issued, Submitted, Updated, Valid, Withdrawn, Other). "Coverage" was added in schema 4.6 and is
 * accepted too. Created, Issued, Available, Submitted, Updated, Accepted, Copyrighted and Withdrawn describe the record, and Valid its
 * validity, not the data: never used.
 */
export const COVERAGE_DATE_TYPES = /^(?:collected|coverage)$/i;

const OPEN = /^(?:\.\.|open|unknown)$/i;
/** YYYY, YYYY-MM, YYYY-MM-DD, optionally with a time. Free text ("2023-04 to 2023-05") and EDTF qualifiers ("2020?", "2020~") are not. */
const ISO_LIKE = /^\d{4}(?:-\d{2}(?:-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)?)?$/;

/** One end of an interval: undefined for open, null when it is not an ISO-like date (the whole date is then unusable), else the text. */
function endOf(s: string | undefined): string | undefined | null {
  const t = s?.trim();
  if (!t || OPEN.test(t)) return undefined;
  return ISO_LIKE.test(t) ? t : null;
}

function interval(a: string | undefined, b: string | undefined): Extent | undefined {
  const start = endOf(a);
  const end = endOf(b);
  // never a wrong extent: one end that is not a date means no extent from this date at all
  if (start === null || end === null || (start === undefined && end === undefined)) return undefined;
  return { start, end };
}

/** One coverage date: "a/b" interval (either side may be open), a single date, or start and end given apart. Only ISO-like dates count. */
export function extentOfDate(d: { date?: string; start?: string; end?: string }): Extent | undefined {
  if (d.start !== undefined || d.end !== undefined) return interval(d.start, d.end);
  const raw = d.date?.trim();
  if (!raw) return undefined;
  if (raw.includes('/')) {
    const parts = raw.split('/');
    return parts.length === 2 ? interval(parts[0], parts[1]) : undefined;
  }
  const one = endOf(raw);
  return one ? { start: one, end: one } : undefined;
}

/** Last / first day a (possibly partial) ISO date covers; the time of day is ignored, as compareIso does. */
function lastDay(s: string): string {
  const d = s.slice(0, 10);
  if (d.length === 4) return `${d}-12-31`;
  if (d.length === 7) return `${d}-31`;
  return d;
}
function firstDayOf(s: string): string {
  const d = s.slice(0, 10);
  if (d.length === 4) return `${d}-01-01`;
  if (d.length === 7) return `${d}-01`;
  return d;
}

/**
 * Several coverage dates (campaigns): the earliest start to the latest end, compared by the days each end covers (a bare "2020" ends on
 * 2020-12-31, so it is wider than "2020-06"); the winner is kept as written. An open end stays open.
 */
export function unionExtents(list: (Extent | undefined)[]): Extent | undefined {
  // A coverage date that could not be read ("summer 2020") may lie outside the readable ones: the union of the rest would be too
  // narrow and put correct rows outside it, so no temporal extent at all (absence is reported as such, never a wrong period).
  if (list.some((e) => e === undefined)) return undefined;
  const ex = list.filter((e): e is Extent => !!e);
  if (ex.length === 0) return undefined;
  if (ex.length === 1) return ex[0];
  const starts = ex.map((e) => e.start);
  const ends = ex.map((e) => e.end);
  const start = starts.some((x) => x === undefined) ? undefined : (starts as string[]).reduce((a, b) => (firstDayOf(b) < firstDayOf(a) ? b : a));
  const end = ends.some((x) => x === undefined) ? undefined : (ends as string[]).reduce((a, b) => (lastDay(b) > lastDay(a) ? b : a));
  return start || end ? { start, end } : undefined;
}
