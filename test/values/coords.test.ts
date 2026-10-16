// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { parseCoordinate } from '../../src/core/values/coords';

type Ok = { value: number; decimals: number; form: 'decimal' | 'dm' | 'dms'; normalised360?: boolean };
const ok = (raw: string | number | null, axis: 'lat' | 'lon', comma = false): Ok => {
  const r = parseCoordinate(raw, axis, comma);
  if ('error' in r) throw new Error(`expected ok for ${String(raw)}, got ${r.error}`);
  return r;
};
const err = (raw: string | number | null, axis: 'lat' | 'lon', comma = false) => {
  const r = parseCoordinate(raw, axis, comma);
  if (!('error' in r)) throw new Error(`expected error for ${String(raw)}, got ${r.value}`);
  return r;
};

describe('parseCoordinate: decimal', () => {
  it('plain decimals keep their written precision', () => {
    expect(ok('12.576117', 'lon')).toEqual({ value: 12.576117, decimals: 6, form: 'decimal' });
    expect(ok('-0.5', 'lat')).toEqual({ value: -0.5, decimals: 1, form: 'decimal' });
    expect(ok('.5', 'lat')).toEqual({ value: 0.5, decimals: 1, form: 'decimal' });
    expect(ok('+78', 'lat')).toEqual({ value: 78, decimals: 0, form: 'decimal' });
    expect(ok('  54.25  ', 'lat').decimals).toBe(2);
  });
  it('decimal comma', () => {
    expect(ok('16,5', 'lon', true)).toEqual({ value: 16.5, decimals: 1, form: 'decimal' });
    expect(err('16,5', 'lon', false).error).toBe('unparseable');
    expect(err('16.5', 'lon', true).error).toBe('unparseable');
  });
  it('hemisphere letter on a decimal is still form decimal', () => {
    expect(ok('16.5 E', 'lon')).toEqual({ value: 16.5, decimals: 1, form: 'decimal' });
    expect(ok('16.5 W', 'lon').value).toBe(-16.5);
    expect(ok('S 12.25', 'lat')).toEqual({ value: -12.25, decimals: 2, form: 'decimal' });
    expect(ok('12.25n', 'lat').value).toBe(12.25);
  });
  it('xlsx numeric cells', () => {
    expect(ok(16.25, 'lon')).toEqual({ value: 16.25, decimals: 2, form: 'decimal' });
    expect(ok(-70, 'lat').decimals).toBe(0);
  });
  it('null / blank / text are unparseable', () => {
    expect(err(null, 'lat')).toEqual({ error: 'unparseable', raw: '' });
    expect(err('  ', 'lat').error).toBe('unparseable');
    expect(err('north', 'lat')).toEqual({ error: 'unparseable', raw: 'north' });
    expect(err('1e1', 'lat').error).toBe('unparseable');
    expect(err('1.2.3', 'lat').error).toBe('unparseable');
  });
});

describe('parseCoordinate: degrees and minutes / seconds', () => {
  it('12° 34.567\'', () => {
    const r = ok("12° 34.567'", 'lon');
    expect(r.value).toBeCloseTo(12.576117, 6);
    expect(r.form).toBe('dm');
    expect(r.decimals).toBe(5); // ceil(3 + log10(60))
  });
  it('54°21.500\' lat', () => {
    const r = ok("54°21.500'", 'lat');
    expect(r.value).toBeCloseTo(54.358333, 6);
    expect(r.form).toBe('dm');
  });
  it('second ° used where \' was meant', () => {
    const r = ok('12°34.567°', 'lon');
    expect(r.value).toBeCloseTo(12.576117, 6);
    expect(r.form).toBe('dm');
  });
  it('no markers, hemisphere after', () => {
    const r = ok('12 34.567 E', 'lon');
    expect(r.value).toBeCloseTo(12.576117, 6);
    expect(r.decimals).toBe(5); // ceil(3 + 1.778)
    expect(ok('12 34.567 W', 'lon').value).toBeCloseTo(-12.576117, 6);
  });
  it('hemisphere before, DMS', () => {
    const r = ok('S 12° 3\' 4"', 'lat');
    expect(r.value).toBeCloseTo(-(12 + 3 / 60 + 4 / 3600), 9);
    expect(r.form).toBe('dms');
  });
  it('DMS with fractional seconds and hemisphere glued on', () => {
    const r = ok('12°03\'04.5"S', 'lat');
    expect(r.value).toBeCloseTo(-(12 + 3 / 60 + 4.5 / 3600), 9);
    expect(r.form).toBe('dms');
    expect(r.decimals).toBe(5); // ceil(1 + log10(3600))
  });
  it('N54 21.5 (letter glued to degrees)', () => {
    const r = ok('N54 21.5', 'lat');
    expect(r.value).toBeCloseTo(54.358333, 6);
    expect(r.form).toBe('dm');
  });
  it('whitespace-only DMS', () => {
    const r = ok('12 3 4', 'lat');
    expect(r.value).toBeCloseTo(12 + 3 / 60 + 4 / 3600, 9);
    expect(r.form).toBe('dms');
  });
  it('unicode primes and typographic quotes', () => {
    expect(ok('12° 34.567′', 'lon').value).toBeCloseTo(12.576117, 6);
    expect(ok('12° 34.567’', 'lon').value).toBeCloseTo(12.576117, 6);
    expect(ok('12°3′4″ N', 'lat').form).toBe('dms');
    expect(ok('12°3’4” N', 'lat').form).toBe('dms');
    expect(ok("12°3'4'' N", 'lat').form).toBe('dms');
    expect(ok('12º3.5′ N', 'lat').form).toBe('dm');
  });
  it('integer minutes: decimals reflect minute precision', () => {
    expect(ok("78°15'", 'lat').decimals).toBe(2); // ceil(0 + 1.778)
  });
  it('decimals are capped at 6', () => {
    expect(ok("16°27.123456789'", 'lon').decimals).toBe(6);
  });
  it('decimal comma in minutes', () => {
    expect(ok("12°34,567'", 'lon', true).value).toBeCloseTo(12.576117, 6);
    expect(err("12°34,567'", 'lon', false).error).toBe('unparseable');
  });
  it('minutes or seconds >= 60 are unparseable', () => {
    expect(err("16°60'", 'lon').error).toBe('unparseable');
    expect(err("16°75.5'", 'lon').error).toBe('unparseable');
    expect(err('12°3\'60"', 'lat').error).toBe('unparseable');
    expect(err('12 3 75', 'lat').error).toBe('unparseable');
    expect(ok("16°59.999'", 'lon').value).toBeCloseTo(16 + 59.999 / 60, 9);
  });
  it('fractional minutes together with seconds are unparseable', () => {
    expect(err('12 3.5 4', 'lat').error).toBe('unparseable');
  });
  it('digits run together are one decimal number, not split into degrees and minutes', () => {
    expect(err('1234.567', 'lon').error).toBe('out-of-range');
  });
});

describe('parseCoordinate: signs and hemispheres', () => {
  it('W and S negate', () => {
    expect(ok('16.5 W', 'lon').value).toBe(-16.5);
    expect(ok('W 16.5', 'lon').value).toBe(-16.5);
    expect(ok('78.5S', 'lat').value).toBe(-78.5);
    expect(ok("S 54°21.5'", 'lat').value).toBeCloseTo(-54.358333, 6);
  });
  it('negative DM', () => {
    expect(ok("-12°34.567'", 'lon').value).toBeCloseTo(-12.576117, 6);
  });
  it('a negative sign plus S/W (or any hemisphere) is a contradiction', () => {
    expect(err('-12 S', 'lat').error).toBe('unparseable');
    expect(err('-16.5 W', 'lon').error).toBe('unparseable');
    expect(err('S -12', 'lat').error).toBe('unparseable');
    expect(err('-16.5 E', 'lon').error).toBe('unparseable');
    expect(err('+16.5 W', 'lon').error).toBe('unparseable');
    expect(ok('+16.5 E', 'lon').value).toBe(16.5);
  });
  it('hemisphere on both ends is unparseable', () => {
    expect(err('N 12 N', 'lat').error).toBe('unparseable');
  });
  it('hemisphere letter of the wrong axis is unparseable', () => {
    expect(err('16.5 E', 'lat').error).toBe('unparseable');
    expect(err('16.5 N', 'lon').error).toBe('unparseable');
  });
});

describe('parseCoordinate: ranges', () => {
  it('latitude within [-90, 90]', () => {
    expect(ok('90', 'lat').value).toBe(90);
    expect(ok('-90', 'lat').value).toBe(-90);
    expect(err('95', 'lat')).toEqual({ error: 'out-of-range', raw: '95' });
    expect(err('-90.0001', 'lat').error).toBe('out-of-range');
    expect(err("91°0'", 'lat').error).toBe('out-of-range');
  });
  it('longitude (180, 360] is normalised by -360', () => {
    expect(ok('350.5', 'lon')).toEqual({ value: -9.5, decimals: 1, form: 'decimal', normalised360: true });
    expect(ok('180.5', 'lon').value).toBe(-179.5);
    expect(ok('360', 'lon')).toMatchObject({ value: 0, normalised360: true });
    expect(ok('200 E', 'lon').normalised360).toBe(true);
  });
  it('normalisation does not introduce floating-point noise', () => {
    expect(ok('350.123', 'lon').value).toBe(-9.877);
    expect(ok('359.999999', 'lon').value).toBe(-0.000001);
  });
  it('longitude [-180, 180] is untouched and has no normalised360 key', () => {
    const r = ok('180', 'lon');
    expect(r).toEqual({ value: 180, decimals: 0, form: 'decimal' });
    expect('normalised360' in r).toBe(false);
    expect(ok('-180', 'lon').value).toBe(-180);
  });
  it('longitude outside [-180, 360] is out-of-range', () => {
    expect(err('361', 'lon').error).toBe('out-of-range');
    expect(err('-180.5', 'lon').error).toBe('out-of-range');
    expect(err('200 W', 'lon').error).toBe('out-of-range');
  });
  it('negative zero is normalised to zero', () => {
    expect(Object.is(ok('-0', 'lat').value, 0)).toBe(true);
  });
});
