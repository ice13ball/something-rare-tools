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
