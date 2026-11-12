// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A station is written in the text its samples use when all of them share the value (54.50 on both, not 54.5 on the station); where the samples differ nothing changes. Every value is invented.
import { describe, expect, it } from 'vitest';
import { exportSheet, objects, readBack } from './exportHelpers';
import type { Cell } from './helpers';

const Q = { kind: 'count' as const };
const HEADER = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Depth', 'Species', 'Count'];
const row = (station: string, sample: string, lat: Cell, lon: Cell, depth: Cell): Cell[] => [station, sample, '2023-06-14', lat, lon, depth, 'Calanus finmarchicus', 4];

async function events(rows: Cell[][]) {
  const e = await exportSheet(HEADER, rows, { quantity: Q });
  expect(e.files).not.toHaveLength(0);
  const b = await readBack(e.zip);
  return objects(b.tables['event.txt']);
}
const pick = (rows: Record<string, string>[], type: string) => rows.filter((r) => r.eventType === type).map((r) => [r.eventID, r.decimalLatitude, r.decimalLongitude, r.minimumDepthInMeters, r.maximumDepthInMeters]);

describe('a station written like its samples', () => {
  it('shares the file text of a position and a depth that all samples wrote the same way', async () => {
    const ev = await events([row('S1', 'a', '54.50', '3.20', '10.50'), row('S1', 'b', '54.50', '3.20', '10.50')]);
    expect(pick(ev, 'sample')).toEqual([
      ['a', '54.50', '3.20', '10.50', '10.50'],
      ['b', '54.50', '3.20', '10.50', '10.50'],
    ]);
    expect(pick(ev, 'station')).toEqual([['S1', '54.50', '3.20', '10.50', '10.50']]);
  });

  it('shares one coordinate when only that one agrees, and keeps today for a coordinate the samples disagree on', async () => {
    const ev = await events([row('S1', 'a', '54.50', '3.20', 5), row('S1', 'b', '54.50', '3.40', 5)]);
    const [station] = pick(ev, 'station');
    expect(station[1]).toBe('54.50');
    expect(station[2]).toBe('3.3');
  });

  it('keeps the derived text when the samples wrote the same number in different forms', async () => {
    const ev = await events([row('S1', 'a', '54.50', '3.2', 5), row('S1', 'b', '54.5', '3.2', 5)]);
    expect(pick(ev, 'station')[0].slice(1, 3)).toEqual(['54.5', '3.2']);
    expect(pick(ev, 'sample').map((r) => r[1])).toEqual(['54.50', '54.5']);
  });

  it('keeps depth ends in the text every sample writes (10.5 stays 10.5 when the other end has two decimals)', async () => {
    const e = await exportSheet(['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Depth_min', 'Depth_max', 'Species', 'Count'], [
      ['S1', 'a', '2023-06-14', 54.5, 3.2, '10.5', '20.25', 'Calanus finmarchicus', 4],
      ['S1', 'b', '2023-06-14', 54.5, 3.2, '10.5', '20.25', 'Calanus finmarchicus', 4],
    ], { quantity: Q });
    const rows = objects((await readBack(e.zip)).tables['event.txt']);
    expect(pick(rows, 'sample').map((r) => [r[3], r[4]])).toEqual([['10.5', '20.25'], ['10.5', '20.25']]);
    expect(pick(rows, 'station').map((r) => [r[3], r[4]])).toEqual([['10.5', '20.25']]);
  });
});

/** Forms in which the sample rows are written with something other than the raw cell: a hemisphere column, letters in the cell, degrees and minutes. */
describe('a station and a cruise written like samples whose text is not the raw cell', () => {
  const cases: [string, string[], (lat: string, lon: string, h: [string, string]) => Cell[], [string, string], [string, string]][] = [
    ['a hemisphere column', ['Cruise', 'Station', 'Sample', 'Date', 'Latitude', 'Lat_hemisphere', 'Longitude', 'Lon_hemisphere', 'Species', 'Count'], (la, lo, h) => [la, h[0], lo, h[1]], ['54.50', '3.20'], ['-54.50', '-3.20']],
    ['hemisphere letters in the cell', ['Cruise', 'Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'], (la, lo) => [`${la} S`, `${lo} W`], ['54.50', '3.20'], ['-54.50', '-3.20']],
    ['degrees and minutes', ['Cruise', 'Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'], () => ["54°30.0'N", "3°12.0'E"], ['', ''], ['54.500', '3.200']],
  ];
  for (const [name, header, coords, input, expected] of cases) {
    it(`${name}: station and cruise carry what the samples write`, async () => {
      const rows: Cell[][] = [];
      for (const [station, sample] of [['S1', 'a'], ['S1', 'b'], ['S2', 'c']]) rows.push(['C1', station, sample, '2023-06-14', ...coords(input[0], input[1], ['S', 'W']), 'Calanus finmarchicus', 4]);
      const e = await exportSheet(header, rows, { quantity: Q });
      expect(e.files, JSON.stringify(e.findings.map((f) => f.ruleId))).not.toHaveLength(0);
      const ev = objects((await readBack(e.zip)).tables['event.txt']);
      for (const type of ['sample', 'station', 'cruise']) {
        for (const r of pick(ev, type)) expect([r[1], r[2]], `${type} ${r[0]}`).toEqual(expected);
      }
    });
  }
});
