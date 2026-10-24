// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { extentOfDate, unionExtents } from '../../src/core/metadata/extent';
import { normaliseUnit } from '../../src/core/recognize/vocab';

describe('extentOfDate: only ISO-like ends, never a wrong extent', () => {
  it('free text and EDTF qualifiers give no extent', () => {
    for (const d of ['2023-04 to 2023-05', '1972 to 2026', '2020?', '2020~', '2020-03/2020-0x', 'spring 2020', '2020/2021/2022', '2020?/2021']) {
      expect(extentOfDate({ date: d }), d).toBeUndefined();
    }
    expect(extentOfDate({ start: '2020?', end: '2021' })).toBeUndefined();
  });
  it('ISO-like dates, intervals and open ends are read', () => {
    expect(extentOfDate({ date: '2020' })).toEqual({ start: '2020', end: '2020' });
    expect(extentOfDate({ date: '2020-03/2020-06' })).toEqual({ start: '2020-03', end: '2020-06' });
    expect(extentOfDate({ date: '2020-03-01T10:00:00Z/..' })).toEqual({ start: '2020-03-01T10:00:00Z', end: undefined });
    expect(extentOfDate({ date: '/2020-06-30' })).toEqual({ start: undefined, end: '2020-06-30' });
  });
});

describe('unionExtents compares by the days an end covers', () => {
  it('a bare year is wider than a month of that year', () => {
    expect(unionExtents([{ start: '2020', end: '2020' }, { start: '2020-03', end: '2020-06' }])).toEqual({ start: '2020', end: '2020' });
    expect(unionExtents([{ start: '2020-03', end: '2020-06' }, { start: '2020', end: '2020' }])).toEqual({ start: '2020', end: '2020' });
  });
  it('plain cases and open ends', () => {
    expect(unionExtents([{ start: '2017-06-01', end: '2017-06-30' }, { start: '2018-02-01', end: '2018-02-10' }])).toEqual({ start: '2017-06-01', end: '2018-02-10' });
    expect(unionExtents([{ start: '2015', end: undefined }, { start: '2016', end: '2017' }])).toEqual({ start: '2015', end: undefined });
  });
});

describe('unit notation with a middle dot and superscripts', () => {
  it('µmol·kg⁻¹, µmol·L⁻¹ and mmol·kg−1 are read like µmol/kg', () => {
    expect(normaliseUnit('µmol·kg⁻¹')).toBe('µmol/kg');
    expect(normaliseUnit('µmol·L⁻¹')).toBe('µmol/L');
    expect(normaliseUnit('mmol·kg−1')).toBe('mmol/kg');
  });
});
