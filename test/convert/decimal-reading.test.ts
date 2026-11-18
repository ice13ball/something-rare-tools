// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// "Decimal comma" or "thousands separator", per column (core/convert/decimalReading.ts): the person's answer to IN-DECIMAL-AMBIGUOUS, applied to the file as read. Invented data.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { applyDecimalReading } from '../../src/core/convert/decimalReading';
import { parseCsvText } from '../../src/core/parse/csv';
import { getConvertRule, renderConvertPlain } from '../../src/core/rules/convert';
import type { ParsedFile } from '../../src/core/types';
import { sheetInput } from './helpers';

const FILE = 'Sample;Depth [m];Chlorophyll;Calanus finmarchicus;Date;Latitude;Longitude\nA;1,250;12,500;3;2023-06-14;55,5;2,5\nB;2,000;3,750;4;2023-06-14;55,5;2,5\n';
const read = (text = FILE): ParsedFile => parseCsvText(text, 'a.csv');
const asked = (f: ParsedFile) => f.findings.filter((x) => x.ruleId === 'IN-DECIMAL-AMBIGUOUS').map((x) => x.params.index);
const cells = (f: ParsedFile, c: number) => f.sheets[0].rows.map((r) => r.cells[c]);

describe('applyDecimalReading', () => {
  it('thousands: the column asked about is read as 1250 and 2000 (numbers), the question becomes CONV-DECIMAL-DECLARED, the other asked column stays asked', () => {
    const f = read();
    expect(asked(f)).toEqual([1, 2]);
    const g = applyDecimalReading(f, 'a.csv', { 1: 'thousands' });
    expect(cells(g, 1)).toEqual([1250, 2000]);
    expect(cells(g, 2)).toEqual(['12,500', '3,750']);
    expect(asked(g)).toEqual([2]);
    const d = g.findings.filter((x) => x.ruleId === 'CONV-DECIMAL-DECLARED');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ severity: 'info', file: 'a.csv', sheet: 'a.csv', params: { column: 'Depth [m]', index: 1, reading: 'thousands' } });
    expect(d[0].params.fromFile).toBeUndefined();
    expect(renderConvertPlain(d[0], 'en')).toContain('"Depth [m]"');
    // the input is not changed
    expect(cells(f, 1)).toEqual(['1,250', '2,000']);
    expect(asked(f)).toEqual([1, 2]);
  });

  it('decimal: the values are unchanged and the question is replaced by the declaration', () => {
    const g = applyDecimalReading(read(), 'a.csv', { 2: 'decimal' });
    expect(cells(g, 2)).toEqual(['12,500', '3,750']);
    expect(cells(g, 1)).toEqual(['1,250', '2,000']);
    expect(asked(g)).toEqual([1]);
    expect(g.findings.find((x) => x.ruleId === 'CONV-DECIMAL-DECLARED')?.params).toMatchObject({ index: 2, reading: 'decimal' });
  });

  it('under thousands a cell written 1,250,000 reads as 1250000 and a negative one keeps its sign', () => {
    const f = read('S;D;T\nA;1,250;1,5\nB;1,250,000;2,5\nC;-3,000;2,5\n');
    expect(asked(f)).toEqual([1]);
    const g = applyDecimalReading(f, 'a.csv', { 1: 'thousands' });
    expect(cells(g, 1)).toEqual([1250, 1250000, -3000]);
    // the column asked about only: T is not asked (its values have one decimal)
    expect(cells(g, 2)).toEqual(['1,5', '2,5', '2,5']);
  });

  it('a column the reader did not ask about is never touched, and neither is another sheet name', () => {
    const f = read('S;D;T\nA;1,25;1,5\nB;1,250;2,5\n');
    expect(asked(f)).toEqual([]);
    expect(applyDecimalReading(f, 'a.csv', { 1: 'thousands' })).toBe(f);
    const g = read();
    expect(applyDecimalReading(g, 'other.csv', { 1: 'thousands' })).toBe(g);
    expect(applyDecimalReading(g, 'a.csv', { 3: 'thousands' })).toBe(g);
  });

  it('fromFile marks the answers read from a companion file', () => {
    const g = applyDecimalReading(read(), 'a.csv', { 1: 'thousands', 2: 'decimal' }, [1]);
    const d = g.findings.filter((x) => x.ruleId === 'CONV-DECIMAL-DECLARED');
    expect(d.map((x) => [x.params.index, x.params.fromFile])).toEqual([[1, 'yes'], [2, undefined]]);
  });
});

describe('the converter with a declared reading', () => {
  const run = (reading: Record<number, 'decimal' | 'thousands'>) => {
    const file = applyDecimalReading(read(), 'a.csv', reading);
    const input = sheetInput(file, { shape: 'wide', quantity: { kind: 'count' }, device: { kind: 'known', key: 'multinet' } });
    return convert({ sheets: [input] });
  };
  it('asked: the question stands; answered thousands: the depth is 1250, and the question is gone', () => {
    const asking = convert({ sheets: [sheetInput(read(), { shape: 'wide', quantity: { kind: 'count' }, device: { kind: 'known', key: 'multinet' } })] });
    expect(asking.findings.filter((f) => f.ruleId === 'IN-DECIMAL-AMBIGUOUS')).toHaveLength(2);
    expect(getConvertRule('CONV-DECIMAL-DECLARED').exportPolicy).toBe('show');
    const r = run({ 1: 'thousands', 2: 'decimal' });
    expect(r.findings.filter((f) => f.ruleId === 'IN-DECIMAL-AMBIGUOUS')).toEqual([]);
    expect(r.findings.filter((f) => f.ruleId === 'CONV-DECIMAL-DECLARED')).toHaveLength(2);
    expect(r.events.map((e) => [e.depthMin, e.depthMinText])).toEqual(expect.arrayContaining([[1250, '1250'], [2000, '2000']]));
  });
  it('answered decimal: the depth stays 1.25', () => {
    const r = run({ 1: 'decimal', 2: 'decimal' });
    expect(r.events.map((e) => e.depthMin)).toEqual(expect.arrayContaining([1.25, 2]));
  });
});
