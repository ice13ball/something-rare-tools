// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Place columns (Location, Locality, Ort, Lieu, Miejsce) read as a weak station. Every header and value is synthetic.
import { describe, expect, it } from 'vitest';
import { proposeColumns } from '../../src/core/recognize/columns';
import { rawSheet } from '../helpers/files';

const CTX = { decimalComma: false, date1904: false };
type Cell = string | number | null;

function propose(cols: Record<string, Cell[]>) {
  const header = Object.keys(cols);
  const n = Math.max(...Object.values(cols).map((v) => v.length));
  const rows = Array.from({ length: n }, (_, i) => header.map((h) => cols[h][i] ?? null));
  return proposeColumns(rawSheet(header, rows), CTX);
}
const of = (cols: Record<string, Cell[]>, header: string) => propose(cols).find((p) => p.header === header)!;
const PLACES = ['North bay', 'North bay', 'Rocky point', 'Rocky point', 'North bay', 'Deep channel'];
const NUM = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5];

describe('a place column is a weak station', () => {
  it.each(['Location', 'Location name', 'Locality', 'Locality name', 'Sampling location', 'Ort', 'Lieu', 'Miejsce', 'Miejsce poboru', 'Lokalizacja', 'Probenahmeort', 'Lieu de prélèvement'])(
    '%s with short repeated names is the station, with low confidence',
    (h) => {
      const p = of({ [h]: PLACES, X: NUM }, h);
      expect(p.role.kind, h).toBe('station');
      expect(p.confidence, h).toBe('low');
      expect(p.reasonCode, h).toBe('name-station-place');
    },
  );

  it('Station, Site and Stanowisko stay what they were: station, high confidence', () => {
    for (const h of ['Station', 'Site', 'Stanowisko']) {
      const p = of({ [h]: PLACES, X: NUM }, h);
      expect(p.role.kind, h).toBe('station');
      expect(p.confidence, h).toBe('high');
    }
  });

  it('an explicit Station column wins; the location column stays ignored with a reason', () => {
    const cols = { Location: PLACES, Station: ['S1', 'S1', 'S2', 'S2', 'S1', 'S3'], X: NUM };
    expect(of(cols, 'Station').role.kind).toBe('station');
    const loc = of(cols, 'Location');
    expect(loc.role.kind).toBe('ignore');
    expect(loc.reasonCode).toBe('other-station');
    // the order of the columns does not matter
    const rev = { Station: cols.Station, Location: PLACES, X: NUM };
    expect(of(rev, 'Station').role.kind).toBe('station');
    expect(of(rev, 'Location').role.kind).toBe('ignore');
  });

  it('a Site column also beats Location', () => {
    const cols = { Location: PLACES, Site: ['A', 'A', 'B', 'B', 'A', 'C'], X: NUM };
    expect(of(cols, 'Site').role.kind).toBe('station');
    expect(of(cols, 'Location').role.kind).toBe('ignore');
  });

  it('coordinates, sentences, numbers and values that are all different are not a station', () => {
    const coords = ['54.5, 18.5', '54.5, 18.5', '54.6, 18.7', '54.6, 18.7', '54.5, 18.5', '54.8, 18.9'];
    const degrees = ['54°30′N', '54°30′N', '54°36′N', '54°36′N', '54°30′N', '54°48′N'];
    const sentences = Array.from({ length: 6 }, () => 'Taken in the sheltered bay next to the old pier, about two hundred metres from the shore');
    const unique = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
    for (const [name, values] of [['coordinates', coords], ['degrees', degrees], ['sentences', sentences], ['numbers', [1, 1, 2, 2, 1, 3]], ['all different', unique]] as const) {
      const p = of({ Location: [...values], X: NUM }, 'Location');
      expect(p.role.kind, name).not.toBe('station');
    }
  });

  it('a place column without values is not a station', () => {
    expect(of({ Location: [null, null, null], X: [1, 2, 3] }, 'Location').role.kind).toBe('ignore');
  });
});
