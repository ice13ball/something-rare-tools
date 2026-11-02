// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// 'Total length [mm]' is a measurement, not a total of individuals; 'Total depth' is the depth of the site. Every row is invented.
import { describe, expect, it } from 'vitest';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { rawSheet } from '../helpers/files';
import type { Cell } from './helpers';

const CTX = { decimalComma: false, date1904: false };
const rolesOf = (header: string[], rows: Cell[][]) => Object.fromEntries(proposeConvertColumns(rawSheet(header, rows.map((r) => [...r])), CTX).map((p) => [p.header, p]));
const N = (n: number, make: (i: number) => Cell[]): Cell[][] => Array.from({ length: n }, (_, i) => make(i));
const NAMES = ['Gadus morhua', 'Acartia sp.', 'Oithona similis', 'Calanus cf. glacialis'];

describe('Total length and Total depth', () => {
  const longHeader = ['Station', 'Depth', 'Scientific name', 'Count', 'Total length [mm]', 'Total depth [m]'];
  const longRows = N(4, (i) => ['S1', 10, NAMES[i], i + 1, 100, 55]);

  it('a size word with a unit that does not count organisms is a measured variable with its unit, on a long sheet and on a wide one', () => {
    const long = rolesOf(longHeader, longRows);
    expect(long['Total length [mm]'].role).toMatchObject({ kind: 'variable', variable: 'Total length', unit: 'mm' });
    expect(long['Total length [mm]'].reasonCode).toBe('size-variable');
    const wide = rolesOf(['Station', 'Calanus', 'Acartia', 'Total length [mm]'], N(4, (i) => ['S1', i, 2, 100 + i]));
    expect(wide['Total length [mm]'].role).toMatchObject({ kind: 'variable', unit: 'mm' });
    expect(wide.Calanus.role).toEqual({ kind: 'taxon', header: true });
  });

  it('a total with a count unit, a mass unit or no unit is still a total (ignored)', () => {
    for (const h of ['Total [ind/m3]', 'Total weight [g]', 'Total']) {
      const r = rolesOf(['Station', 'Scientific name', 'Count', h], N(4, (i) => ['S1', NAMES[i], i + 1, 10]));
      expect(r[h].reasonCode, h).not.toBe('size-variable');
    }
  });

  it('Total depth is the water depth of the site, not a size: with another depth column it is not written, alone it is the depth of the rows', () => {
    const r = rolesOf(longHeader, longRows);
    expect(r['Total depth [m]'].reasonCode).toBe('site-depth-ignored');
    expect(r.Depth.role.kind).toBe('depth');
    const alone = rolesOf(['Station', 'Scientific name', 'Count', 'Total depth [m]'], N(4, (i) => ['S1', NAMES[i], i + 1, 55]));
    expect(alone['Total depth [m]'].role).toMatchObject({ kind: 'depth' });
  });
});
