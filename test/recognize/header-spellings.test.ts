// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Misspelled coordinate names, prefix traps ("Long term mean" is no longitude), location columns and date-of-collection headers. Every header and value is synthetic.
import { describe, expect, it } from 'vitest';
import { proposeColumns } from '../../src/core/recognize/columns';
import { rawSheet } from '../helpers/files';

const CTX = { decimalComma: false, date1904: false };
type Cell = string | number | null;

/** Proposals for a sheet of the given columns (header -> values). */
function propose(cols: Record<string, Cell[]>) {
  const header = Object.keys(cols);
  const n = Math.max(...Object.values(cols).map((v) => v.length));
  const rows = Array.from({ length: n }, (_, i) => header.map((h) => cols[h][i] ?? null));
  return proposeColumns(rawSheet(header, rows), CTX);
}
const of = (cols: Record<string, Cell[]>, header: string) => propose(cols).find((p) => p.header === header)!;
const LAT = [54.5, 54.6, 54.7, 54.8];
const LON = [18.5, 18.6, 18.7, 18.8];
const OTHER = [1.5, 2.5, 3.5, 4.5];

describe('misspelled latitude and longitude', () => {
  it('the common misspellings of longitude are longitude', () => {
    for (const h of ['Longtitude', 'Longitute', 'Lontitude', 'Longditude', 'LONGTITUDE', 'Longtitude [deg]', 'longtitude_dd', 'Longtitude E']) {
      const p = of({ Lat: LAT, [h]: LON, X: OTHER }, h);
      expect(p.role.kind, h).toBe('longitude');
      expect(p.confidence, h).toBe('high');
    }
  });

  it('the common misspellings of latitude are latitude', () => {
    for (const h of ['Lattitude', 'Latitute', 'Latidude', 'Lattitude [deg]', 'Lattitude N']) {
      const p = of({ [h]: LAT, Lon: LON, X: OTHER }, h);
      expect(p.role.kind, h).toBe('latitude');
      expect(p.confidence, h).toBe('high');
    }
  });

  it('a misspelled pair makes the position of the sheet', () => {
    const p = propose({ Lattitude: LAT, Longtitude: LON, X: OTHER });
    expect(p.slice(0, 2).map((x) => x.role.kind)).toEqual(['latitude', 'longitude']);
  });
});

describe('prefix traps: a name that merely starts with Lat / Long / Depth', () => {
  const NOT_POSITION = [
    'Long term mean', 'Long-term mean', 'Long term average', 'Long_term_average', 'Longterm', 'Long-term trend [%]', 'Long-line catch', 'Long axis [mm]', 'Long distance',
    'Lat bound mean', 'Lateral line', 'Latency [ms]', 'Lat of station', 'Lon bar',
  ];
  it.each(NOT_POSITION)('%s is not a coordinate', (h) => {
    const p = of({ [h]: OTHER, Y: LAT }, h);
    expect(['latitude', 'longitude'], h).not.toContain(p.role.kind);
  });

  it('a long-term column does not take the longitude slot from the real one', () => {
    const p = propose({ 'Long term mean': OTHER, Longitude: LON, Latitude: LAT });
    expect(p.find((x) => x.header === 'Longitude')!.role.kind).toBe('longitude');
    expect(p.find((x) => x.header === 'Long term mean')!.role.kind).toBe('variable');
  });

  it('the abbreviations still count when only a unit, a datum, a hemisphere or a start / end word follows', () => {
    for (const [h, kind] of [
      ['Long', 'longitude'], ['Long.', 'longitude'], ['Long [deg]', 'longitude'], ['Long (E)', 'longitude'], ['Long E', 'longitude'], ['LONG_dd', 'longitude'], ['Lon decimal degrees', 'longitude'],
      ['Lng', 'longitude'], ['Lon WGS84', 'longitude'], ['Lat', 'latitude'], ['Lat deg N', 'latitude'], ['Lat. N', 'latitude'], ['Lat dd', 'latitude'], ['Lat start', 'latitude'],
      ['Lon East', 'longitude'], ['Latitude of start', 'latitude'], ['Longitude (E)', 'longitude'],
    ] as const) {
      const p = of({ [h]: kind === 'latitude' ? LAT : LON, X: OTHER }, h);
      expect(p.role.kind, h).toBe(kind);
    }
  });

  it('Depth-integrated and depth-averaged measurements are not the depth of the sample; Mean depth and Depth [m] are', () => {
    for (const h of ['Depth-integrated chlorophyll', 'Depth integrated chl a [mg/m2]', 'Depth-averaged temperature', 'Depth weighted mean salinity', 'Chlorophyll integrated over depth']) {
      const p = of({ [h]: OTHER, Depth: [5, 10, 15, 20] }, h);
      expect(p.role.kind, h).not.toBe('depth');
    }
    expect(of({ Depth: [5, 10, 15, 20], X: OTHER }, 'Depth').role.kind).toBe('depth');
    expect(of({ 'Mean depth [m]': [5, 10, 15, 20], X: OTHER }, 'Mean depth [m]').role.kind).toBe('depth');
    expect(of({ 'Depth-integrated chlorophyll': OTHER, Depth: [5, 10, 15, 20] }, 'Depth').role.kind).toBe('depth');
  });
});
