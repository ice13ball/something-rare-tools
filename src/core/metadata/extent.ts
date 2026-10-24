// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Shared by the Zenodo and DataCite readers: shapes -> one bbox, collected dates -> one temporal extent.
import type { MetadataRecord } from '../types';

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
  const south = Math.min(...ok.map((b) => b.south));
  const north = Math.max(...ok.map((b) => b.north));
  const west = Math.min(...ok.map((b) => b.west));
  const east = Math.max(...ok.map((b) => b.east));
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
  const west = Math.min(...lons);
  const east = Math.max(...lons);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  // Vertices 179 and -179 are a small shape across the antimeridian, not a huge one; the vertex order does not tell which.
  if (east - west > 180) return { west: -180, east: 180, south, north };
  return { west, east, south, north };
}

/**
 * DataCite dateType values that mean the period the DATA cover. "Collected" is the schema's coverage type
 * (DataCite 4.x dateType: Accepted, Available, Copyrighted, Collected, Created, Issued, Submitted, Updated,
 * Valid, Withdrawn, Other). "Coverage" is accepted too in case a record or a newer schema version uses it (not
 * certain it exists in the schema; accepting it is harmless). Created, Issued, Available, Submitted, Updated,
 * Accepted, Copyrighted and Withdrawn describe the record, and Valid its validity, not the data: never used.
 */
export const COVERAGE_DATE_TYPES = /^(?:collected|coverage)$/i;

const OPEN = /^(?:\.\.|open|unknown)$/i;
const clean = (s: string | undefined): string | undefined => {
  const t = s?.trim();
  return t && !OPEN.test(t) ? t : undefined;
};

/** One coverage date: "a/b" interval (either side may be open), a single date, or start and end given apart. */
export function extentOfDate(d: { date?: string; start?: string; end?: string }): Extent | undefined {
  if (d.start !== undefined || d.end !== undefined) {
    const start = clean(d.start);
    const end = clean(d.end);
    return start || end ? { start, end } : undefined;
  }
  const raw = d.date?.trim();
  if (!raw) return undefined;
  if (raw.includes('/')) {
    const [a, b] = raw.split('/');
    const start = clean(a);
    const end = clean(b);
    return start || end ? { start, end } : undefined;
  }
  const one = clean(raw);
  return one ? { start: one, end: one } : undefined;
}

/** Several coverage dates (campaigns): earliest start to latest end; an open end stays open. Strings are kept as written. */
export function unionExtents(list: (Extent | undefined)[]): Extent | undefined {
  const ex = list.filter((e): e is Extent => !!e);
  if (ex.length === 0) return undefined;
  if (ex.length === 1) return ex[0];
  const starts = ex.map((e) => e.start);
  const ends = ex.map((e) => e.end);
  const start = starts.some((s) => s === undefined) ? undefined : (starts as string[]).reduce((a, b) => (b < a ? b : a));
  const end = ends.some((e) => e === undefined) ? undefined : (ends as string[]).reduce((a, b) => (b > a ? b : a));
  return start || end ? { start, end } : undefined;
}
