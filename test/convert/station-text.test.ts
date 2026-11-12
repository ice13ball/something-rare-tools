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
});
