// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// 'name [unit] (comment)', PANGAEA's own header syntax: the unit and the name are read, the comment is not a second unit. Every value is invented.
import { describe, expect, it } from 'vitest';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { proposeColumns, unitFromHeader } from '../../src/core/recognize/columns';
import { rawSheet } from '../helpers/files';

const CTX = { decimalComma: false, date1904: false };

describe('unitFromHeader: a comment after a square-bracket unit', () => {
  it.each([
    ['Calanoida [#/m**3] (size fraction > 300 µm)', 'Calanoida', '#/m**3'],
    ['Temp [deg C] (CTD)', 'Temp', 'deg C'],
    ['Chl a [µg/l] (HPLC)', 'Chl a', 'µg/l'],
    ['Ind [#] (>3 = shoal)', 'Ind', '#'],
    ['Depth [m] (top of the net (approx.))', 'Depth', 'm'],
    ['Copepoda [#/m**3]', 'Copepoda', '#/m**3'],
  ])('%s', (header, name, unit) => {
    const hu = unitFromHeader(header);
    expect(hu.name).toBe(name);
    expect(hu.unitText).toBe(unit);
  });

  it('a round bracket alone keeps its old reading: a unit only when the text is one', () => {
    expect(unitFromHeader('Salinity (psu)').unitText).toBe('psu');
    expect(unitFromHeader('Station (north)').unit).toBeUndefined();
    expect(unitFromHeader('Sample volume [m**3] (Sampling volume was estimated...)').unitText).toBe('m**3');
  });
});

describe('the roles of such headers', () => {
  const header = ['Temp [deg C] (CTD)', 'Chl a [µg/l] (HPLC)', 'Calanoida [#/m**3] (size fraction > 300 µm)', 'Calanus [#/m**3] (size fraction > 300 µm)'];
  const rows = [[4.1, 0.5, 3, 5], [4.2, 0.6, 2, 0], [4.3, 0.7, 1, 4]];
  const byHeader = (ps: ReturnType<typeof proposeColumns>) => Object.fromEntries(ps.map((p) => [p.header, p]));

  it('/check: temperature and chlorophyll with their units, the species columns with a unit', () => {
    const r = byHeader(proposeColumns(rawSheet(header, rows), CTX));
    expect(r['Temp [deg C] (CTD)'].role).toMatchObject({ kind: 'variable', variable: 'temperature', unit: '°C' });
    expect(r['Chl a [µg/l] (HPLC)'].role).toMatchObject({ kind: 'variable', variable: 'chlorophyll', unit: 'µg/L' });
    expect(r['Calanoida [#/m**3] (size fraction > 300 µm)'].role).toMatchObject({ kind: 'variable', unit: '#/m**3' });
  });

  it('/convert: temperature stays a variable, the species columns stay taxon candidates', () => {
    const r = byHeader(proposeConvertColumns(rawSheet(header, rows), CTX));
    expect(r['Temp [deg C] (CTD)'].role).toMatchObject({ kind: 'variable', variable: 'temperature' });
    expect(r['Chl a [µg/l] (HPLC)'].role).toMatchObject({ kind: 'variable', variable: 'chlorophyll' });
    expect(r['Calanoida [#/m**3] (size fraction > 300 µm)'].role).toEqual({ kind: 'taxon', header: true });
    expect(r['Calanus [#/m**3] (size fraction > 300 µm)'].role).toEqual({ kind: 'taxon', header: true });
  });

  it('a plain count unit with a comment, next to the taxon names of a long sheet, is the quantity of each row', () => {
    const long = proposeConvertColumns(
      rawSheet(['Station', 'Scientific name', 'Ind [#] (>3 = shoal)'], [['S1', 'Gadus morhua', 2], ['S1', 'Acartia sp.', 1], ['S2', 'Oithona similis', 4], ['S2', 'Calanus cf. glacialis', 3]]),
      CTX,
    );
    expect(long[2].role).toEqual({ kind: 'quantity' });
    expect(long[2].reasonCode).toBe('count-unit-quantity');
  });
});
