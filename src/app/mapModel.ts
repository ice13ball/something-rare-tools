// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Pure helpers for the map preview (no maplibre import: the index and privacy pages never load it).
// The display-longitude pattern is copied from the Abyssal Claims atlas (frontend/src/utils/coords.ts), not imported.
import type { RowDetail } from '../worker/protocol';

export const SEVERITY_COLORS = { error: '#ef4444', warning: '#f59e0b', info: '#38bdf8', none: '#22c55e' } as const;
export type MapSeverity = keyof typeof SEVERITY_COLORS;
export const SEVERITIES_ORDER: readonly MapSeverity[] = ['error', 'warning', 'info', 'none'];

export const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json';

/** Wraps 0-360 longitudes into -180..180. Exactly ±180 passes through, so a legitimate 180 is never flipped. */
export function displayLon(lon: number): number {
  if (!Number.isFinite(lon)) return lon;
  if (lon > 180) return lon - 360;
  if (lon < -180) return lon + 360;
  return lon;
}

export interface Bounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

/**
 * Bounding box of [lon, lat] points. Longitudes are already display longitudes; when the points straddle the
 * antimeridian (the short way round is across it) east is returned above 180, which MapLibre accepts.
 */
export function boundsOf(points: readonly (readonly [number, number])[]): Bounds | null {
  if (points.length === 0) return null;
  let south = Infinity;
  let north = -Infinity;
  let w = Infinity;
  let e = -Infinity;
  let w2 = Infinity;
  let e2 = -Infinity;
  for (const [lon, lat] of points) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    w = Math.min(w, lon);
    e = Math.max(e, lon);
    const shifted = lon < 0 ? lon + 360 : lon;
    w2 = Math.min(w2, shifted);
    e2 = Math.max(e2, shifted);
  }
  return e2 - w2 < e - w ? { west: w2, east: e2, south, north } : { west: w, east: e, south, north };
}

/** The few GeoJSON shapes used here (the global GeoJSON namespace is not in this project's type roots). */
export interface PointFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: Record<string, unknown>;
}
export interface PointCollection {
  type: 'FeatureCollection';
  features: PointFeature[];
}

export interface MapData {
  collection: PointCollection;
  bounds: Bounds | null;
  /** rows whose latitude cannot exist (beyond ±90°) or is not a number: not drawn */
  skipped: number;
}

/** Parses the GeoJSON text from the worker; wraps longitudes; leaves out positions that cannot exist. */
export function prepareMapData(geojson: string): MapData {
  const parsed = JSON.parse(geojson) as PointCollection;
  const features: PointFeature[] = [];
  const points: [number, number][] = [];
  let skipped = 0;
  for (const f of parsed.features) {
    const [lon, lat] = f.geometry.coordinates;
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90) {
      skipped++;
      continue;
    }
    const dl = displayLon(lon);
    features.push({ ...f, geometry: { type: 'Point', coordinates: [dl, lat] } });
    points.push([dl, lat]);
  }
  return { collection: { type: 'FeatureCollection', features }, bounds: boundsOf(points), skipped };
}

export interface PopupProps {
  file: string;
  line: number;
  station?: string;
  date?: string;
}

/**
 * The popup body: file, line, station, date, then the row's values once `detail` has arrived.
 * ⛔ Built with createElement + textContent only: file names, stations and cell texts are user data.
 */
export function popupContent(doc: Document, props: PopupProps, detail: RowDetail | null, label: (key: string) => string): HTMLElement {
  const root = doc.createElement('div');
  root.className = 'map-popup';
  const dl = doc.createElement('dl');
  const add = (k: string, v: string): void => {
    const dt = doc.createElement('dt');
    dt.textContent = label(k);
    const dd = doc.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
  };
  add('map.popup.file', props.file);
  add('map.popup.line', String(props.line));
  if (props.station !== undefined) add('map.popup.station', props.station);
  if (props.date !== undefined) add('map.popup.date', props.date);
  if (detail?.depth !== undefined) add('map.popup.depth', String(detail.depth));
  root.append(dl);
  if (detail === null) {
    const p = doc.createElement('p');
    p.className = 'muted';
    p.textContent = label('map.popup.loading');
    root.append(p);
  } else if (detail.values.length > 0) {
    const h = doc.createElement('h4');
    h.textContent = label('map.popup.values');
    const ul = doc.createElement('ul');
    for (const v of detail.values) {
      const li = doc.createElement('li');
      li.textContent = `${v.name}: ${v.raw}${v.unit ? ' ' + v.unit : ''}`;
      ul.append(li);
    }
    root.append(h, ul);
  }
  return root;
}
