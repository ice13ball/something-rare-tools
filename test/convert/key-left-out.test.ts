// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Round 2, Task 7: a total repeated across a column that separates the rows of one sample (the leave-one-out pass of repeatedTotal.ts). A size class declared as the cruise is asked about
// (CONV-QUANTITY-SAME-IN-SAMPLE naming the column and both sums); a size class carried in the sample code is NOT asked about, by Michał's decision of 2026-11-06. Every value is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { judge } from '../../src/core/convert/policy';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { ColumnRole } from '../../src/core/types';
import type { Cell } from './helpers';
import { fileOf, sheetInput } from './helpers';

const TAXA = ['Solea solea', 'Merlangius merlangus'];
const total = (s: number, t: number): number => 20 + 7 * s + 3 * t;
const mass = (s: number, t: number): number => 100 + s * 3 + t;
const BASE: Record<string, ColumnRole> = { sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Quantity: { kind: 'quantity' }, Weight: { kind: 'biomass', basis: 'wet' } };
const run = (header: string[], rows: Cell[][], edit: Record<string, ColumnRole>) => convert({ sheets: [sheetInput(fileOf(header, rows, 'S', { fileName: 'catch.csv' }), { shape: 'long', quantity: { kind: 'count' }, edit })] });
const same = (r: ReturnType<typeof run>) => r.findings.filter((f) => f.ruleId === 'CONV-QUANTITY-SAME-IN-SAMPLE');
const SUM = (() => {
  let n = 0;
  for (let s = 1; s <= 10; s++) for (let t = 0; t < 2; t++) n += total(s, t);
  return n;
})();

/** 10 samples x 2 taxa x 3 size classes; the total of the taxon repeats on its 3 rows. */
function classRows(variant: 'column' | 'code', totalOf: (s: number, t: number, c: number) => number = total): { header: string[]; rows: Cell[][] } {
  const rows: Cell[][] = [];
  for (let s = 1; s <= 10; s++) for (let t = 0; t < 2; t++) for (let c = 0; c < 3; c++) {
    const size = 8 + c;
    rows.push(variant === 'code'
      ? [`s${s}-${size}`, '2020-06-01', 49.4 + s / 100, 0.2, TAXA[t], totalOf(s, t, c), mass(s, t)]
      : [`s${s}`, '2020-06-01', 49.4 + s / 100, 0.2, TAXA[t], size, totalOf(s, t, c), mass(s, t), `a${rows.length}`]);
  }
  return { header: variant === 'code' ? ['sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Quantity', 'Weight'] : ['sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Size', 'Quantity', 'Weight', 'occurrence_id'], rows };
}

describe('the size class declared as the cruise (variant a)', () => {
  const edit = { ...BASE, Size: { kind: 'cruise' } as ColumnRole, occurrence_id: { kind: 'occurrenceId' } as ColumnRole };

  it('is asked about: CONV-QUANTITY-SAME-IN-SAMPLE at accept level names the column and both sums', () => {
    const { header, rows } = classRows('column');
    const r = run(header, rows, edit);
    // the quantity and the weight that repeat across the same column are one finding
    const f = same(r).filter((x) => x.params.by === 'Size');
    expect(f).toHaveLength(1);
    const q = f[0];
    expect(q.params).toMatchObject({ groups: 20, records: 60, written: 3 * SUM, asTotal: SUM, by: 'Size', column: 'Quantity', alsoColumn: 'Weight' });
    expect(judge(r.findings).acceptRules).toContain('CONV-QUANTITY-SAME-IN-SAMPLE');
    // nothing is blocked, collapsed or re-roled by it
    expect(judge(r.findings).blocking).toEqual([]);
    expect(r.occurrences).toHaveLength(60);
    const text = renderConvertPlain(q, 'en');
    expect(text).toContain('"Size"');
    expect(text).toContain(String(3 * SUM));
    expect(text).toContain(String(SUM));
    for (const lang of ['pl', 'de', 'fr'] as const) {
      const t = renderConvertPlain(q, lang);
      expect(t).toContain('Size');
      expect(t).toContain(String(SUM));
      expect(t).toContain('Weight');
    }
  });

  it('does not say that the rows differ ONLY in the column: a per-class number beside it is common (M2)', () => {
    const { header, rows } = classRows('column');
    const r = run(header, rows, edit);
    const q = same(r).find((x) => x.params.by === 'Size')!;
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) expect(renderConvertPlain(q, lang)).not.toMatch(/differ only|różni się tylko|unterscheiden sich nur|ne diffèrent que/i);
    expect(renderConvertPlain(q, 'en')).toContain('across different values of "Size"');
  });

  it('Polish: the plural of the rows and the lines is right for any number (L1)', () => {
    const base = { ruleId: 'CONV-QUANTITY-SAME-IN-SAMPLE', severity: 'warning', file: 'f.csv', sheet: 'S', lines: [2, 3], params: { groups: 22, records: 22, written: 66, asTotal: 22, column: 'Q', by: 'Size' } } as const;
    const make = (records: number) => renderConvertPlain({ ...base, params: { ...base.params, records } } as never, 'pl');
    expect(make(22)).toContain('W 22 wierszach');
    expect(make(1)).toContain('W 1 wierszu');
    expect(make(22)).not.toMatch(/różni się/);
  });

  it('works without an occurrenceID column too (the duplicate ID still blocks, the question is there beside it)', () => {
    const { header, rows } = classRows('column');
    const r = run(header.slice(0, 8), rows.map((x) => x.slice(0, 8)), { ...BASE, Size: { kind: 'cruise' } });
    expect(same(r).some((x) => x.params.by === 'Size')).toBe(true);
    // the advice to make a column a replicate would split every sample: it is not given beside this finding (L9)
    const dup = r.findings.filter((f) => f.ruleId === 'CONV-ID-DUPLICATE');
    expect(dup.length).toBeGreaterThan(0);
    expect(dup.every((f) => f.params.column === undefined)).toBe(true);
  });

  it('a clean sheet, where the totals differ per class, raises nothing', () => {
    const { header, rows: same0 } = classRows('column', (s, t, c) => total(s, t) + 11 * c);
    const rows = same0.map((x, i) => x.map((v, j) => (j === 7 ? Number(v) + 5 * (i % 3) : v)));
    const r = run(header, rows, edit);
    expect(same(r).filter((x) => typeof x.params.by === 'string')).toEqual([]);
  });

  it('a sheet with one row per sample and taxon raises nothing', () => {
    const rows: Cell[][] = [];
    for (let s = 1; s <= 10; s++) for (let t = 0; t < 2; t++) rows.push([`s${s}`, '2020-06-01', 49.4 + s / 100, 0.2, TAXA[t], 8, total(s, t), mass(s, t), `a${rows.length}`]);
    const { header } = classRows('column');
    expect(same(run(header, rows, edit)).filter((x) => typeof x.params.by === 'string')).toEqual([]);
  });
});

describe('the size class carried in the sample code (variant b)', () => {
  it('raises no CONV-QUANTITY-SAME-IN-SAMPLE: Michał\'s decision of 2026-11-06 (no question for the sample code), not an oversight', () => {
    const { header, rows } = classRows('code');
    const r = run(header, rows, BASE);
    expect(same(r)).toEqual([]);
    expect(r.findings.filter((f) => f.ruleId === 'CONV-QUANTITY-REPEATED')).toEqual([]);
  });
});
