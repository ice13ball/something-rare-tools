// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { NA_TOKENS, parseNumber } from '../../src/core/values/numbers';

describe('NA_TOKENS', () => {
  it('is the documented list', () => {
    expect([...NA_TOKENS]).toEqual(['', 'NA', 'N/A', 'NaN', 'nan', 'nd', 'n.d.', 'ND', '-', '--', 'null', 'NULL']);
  });
});

describe('parseNumber', () => {
  it('keeps the value unrounded and counts decimals from the text', () => {
    expect(parseNumber('-5.2', false)).toEqual({ status: 'ok', value: -5.2, decimals: 1 });
    expect(parseNumber('-0.5', false)).toEqual({ status: 'ok', value: -0.5, decimals: 1 });
    expect(parseNumber('.5', false)).toEqual({ status: 'ok', value: 0.5, decimals: 1 });
    expect(parseNumber('+3', false)).toEqual({ status: 'ok', value: 3, decimals: 0 });
    expect(parseNumber('12.3400', false)).toEqual({ status: 'ok', value: 12.34, decimals: 4 });
    expect(parseNumber('7', false)).toEqual({ status: 'ok', value: 7, decimals: 0 });
  });

  it('trailing zeros are kept in decimals', () => {
    const r = parseNumber('0.100', false);
    expect(r).toMatchObject({ status: 'ok', value: 0.1, decimals: 3 });
  });

  it('exponent forms: decimals describe the written value', () => {
    expect(parseNumber('1e-3', false)).toEqual({ status: 'ok', value: 0.001, decimals: 3 });
    expect(parseNumber('1.5E-3', false)).toEqual({ status: 'ok', value: 0.0015, decimals: 4 });
    expect(parseNumber('2.5e2', false)).toEqual({ status: 'ok', value: 250, decimals: 0 });
  });

  it('whitespace around the number is ignored', () => {
    expect(parseNumber('  3.25 \t', false)).toEqual({ status: 'ok', value: 3.25, decimals: 2 });
  });

  it('decimal comma', () => {
    expect(parseNumber('3,14', true)).toEqual({ status: 'ok', value: 3.14, decimals: 2 });
    expect(parseNumber('-0,5', true)).toEqual({ status: 'ok', value: -0.5, decimals: 1 });
    expect(parseNumber(',5', true)).toEqual({ status: 'ok', value: 0.5, decimals: 1 });
  });

  it('comma is not a decimal separator when decimalComma is false, and vice versa', () => {
    expect(parseNumber('3,14', false)).toMatchObject({ status: 'non-numeric' });
    expect(parseNumber('3.14', true)).toMatchObject({ status: 'non-numeric' });
  });

  it('thousands separators are not accepted', () => {
    expect(parseNumber('1,234.5', false)).toEqual({ status: 'non-numeric', token: '1,234.5' });
    expect(parseNumber('1.234,5', true)).toEqual({ status: 'non-numeric', token: '1.234,5' });
    expect(parseNumber('1 234', false)).toMatchObject({ status: 'non-numeric' });
  });

  it('garbage is non-numeric and keeps the trimmed token', () => {
    expect(parseNumber('  /..4', false)).toEqual({ status: 'non-numeric', token: '/..4' });
    for (const t of ['abc', '1.2.3', '--5', '5-', '0x10', 'Infinity', '1e', '1e999', '.']) {
      expect(parseNumber(t, false).status).toBe('non-numeric');
    }
  });

  it('NA tokens are missing', () => {
    for (const t of NA_TOKENS) expect(parseNumber(t, false)).toEqual({ status: 'missing' });
    expect(parseNumber('  NA ', false)).toEqual({ status: 'missing' });
    expect(parseNumber('   ', false)).toEqual({ status: 'missing' });
    expect(parseNumber(null, false)).toEqual({ status: 'missing' });
  });

  it('NA variants', () => {
    expect(parseNumber('NANA', false)).toEqual({ status: 'na-variant', token: 'NANA' });
    expect(parseNumber('NA NA', false)).toEqual({ status: 'na-variant', token: 'NA NA' });
    expect(parseNumber('N.A.', false)).toEqual({ status: 'na-variant', token: 'N.A.' });
    expect(parseNumber('na', false).status).toBe('na-variant');
    expect(parseNumber('NANANA', false).status).toBe('na-variant');
  });

  it('a word that merely contains NA is not an NA variant', () => {
    expect(parseNumber('NAN1', false).status).toBe('non-numeric');
    expect(parseNumber('NAB', false).status).toBe('non-numeric');
    expect(parseNumber('NA1NA', false).status).toBe('non-numeric');
  });

  it('xlsx numbers: decimals from String(n)', () => {
    expect(parseNumber(2.5, false)).toEqual({ status: 'ok', value: 2.5, decimals: 1 });
    expect(parseNumber(42, false)).toEqual({ status: 'ok', value: 42, decimals: 0 });
    expect(parseNumber(-0.125, true)).toEqual({ status: 'ok', value: -0.125, decimals: 3 });
    expect(parseNumber(1e-7, false)).toEqual({ status: 'ok', value: 1e-7, decimals: 7 });
    expect(parseNumber(NaN, false).status).toBe('non-numeric');
    expect(parseNumber(Infinity, false).status).toBe('non-numeric');
  });
});
