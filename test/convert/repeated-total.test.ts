// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A per-taxon total repeated on the size-class rows of a sample (CONV-QUANTITY-REPEATED). Every row is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { readConvertSettings, writeConvertSidecar } from '../../src/core/convert/settings';
import { parseFile } from '../../src/core/parse';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { ColumnRole } from '../../src/core/types';
import type { Cell } from './helpers';
import { fileOf, sheetInput } from './helpers';

const HEADER = ['sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Size', 'Number_in_Haul', 'Weight_in_Haul'];
const EDIT: Record<string, ColumnRole> = {
  sample: { kind: 'sampleId' },
  Species: { kind: 'taxon' },
  Number_in_Haul: { kind: 'quantity' },
  Weight_in_Haul: { kind: 'biomass', basis: 'wet' },
  Size: { kind: 'variable', variable: 'body length', unit: 'cm', unitSource: 'user', perOccurrence: true },
};
const QUANTITY = { kind: 'count' as const };
const TAXA = ['Solea solea', 'Merlangius merlangus'];

/** `samples` hauls; each has two taxa on `classes` size classes; the total of a taxon is the same on all its rows. */
function totals(samples: number, classes: number, total: (s: number, t: number) => number, weight: (s: number, t: number) => number = (s, t) => 100 * total(s, t)): Cell[][] {
  const rows: Cell[][] = [];
  for (let s = 1; s <= samples; s++) {
    for (let t = 0; t < TAXA.length; t++) {
      for (let c = 0; c < classes; c++) rows.push([`s${s}`, '2020-06-01', 49.4 + s / 100, 0.2, TAXA[t], 8 + c, total(s, t), weight(s, t)]);
    }
  }
  return rows;
}

const run = (rows: Cell[][], extra: { totalOnce?: boolean; header?: string[]; edit?: Record<string, ColumnRole> } = {}) =>
  convert({ sheets: [sheetInput(fileOf(extra.header ?? HEADER, rows, 'S', { fileName: 'catch.csv' }), { shape: 'long', quantity: QUANTITY, edit: extra.edit ?? EDIT, ...(extra.totalOnce ? { totalOnce: true } : {}) })] });
const ids = (r: ReturnType<typeof run>, rule: string) => r.findings.filter((f) => f.ruleId === rule);
const total = (t: number, s: number) => 20 + 7 * s + 3 * t; // differs from group to group

describe('a total repeated on size-class rows', () => {
  const rows = totals(10, 3, (s, t) => total(t, s));
  const truth = rows.filter((_, i) => i % 3 === 0).reduce((n, r) => n + Number(r[6]), 0);

  it('blocks, names the columns and the differing column, and does not offer the occurrenceID advice', () => {
    const r = run(rows);
    expect(r.ok).toBe(false);
    const f = ids(r, 'CONV-QUANTITY-REPEATED');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ columns: 'Number_in_Haul, Weight_in_Haul', differs: 'Size', count: 20, of: 20 });
    expect(ids(r, 'CONV-ID-DUPLICATE')).toHaveLength(0);
    expect(ids(r, 'CONV-TAXON-SAME-EVENT')).toHaveLength(0);
    const text = renderConvertPlain(f[0], 'en');
    expect(text).toContain('Number_in_Haul');
    expect(text).toContain('Size');
    expect(text).toContain('total');
    expect(text).not.toMatch(/give the rows an occurrenceID/i);
    for (const lang of ['pl', 'de', 'fr'] as const) expect(renderConvertPlain(f[0], lang)).toContain('Number_in_Haul');
  });

  it('also fires when the user supplies an occurrenceID (it cannot switch the check off)', () => {
    const header = [...HEADER, 'occurrence_id'];
    const withIds = rows.map((r, i) => [...r, `a${i}`]);
    const r = run(withIds, { header, edit: { ...EDIT, occurrence_id: { kind: 'occurrenceId' } } });
    expect(r.ok).toBe(false);
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(1);
  });

  it('with the choice "once", one occurrence per sample and taxon carries the total once: the sums equal the source one-value-per-group sums', () => {
    const r = run(rows, { totalOnce: true });
    expect(r.ok).toBe(true);
    expect(r.occurrences).toHaveLength(20);
    expect(r.occurrences.reduce((n, o) => n + (o.individualCount ?? 0), 0)).toBe(truth);
    const weight = r.measurements.filter((m) => m.role === 'biomass').reduce((n, m) => n + Number(m.measurementValue), 0);
    expect(weight).toBe(truth * 100);
    const once = ids(r, 'CONV-QUANTITY-REPEATED-ONCE');
    expect(once).toHaveLength(1);
    expect(once[0].params).toMatchObject({ count: 40, groups: 20, differs: 'Size' });
    expect(once[0].params.lost).toBe('Size');
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(0);
    expect(ids(r, 'CONV-ID-DUPLICATE')).toHaveLength(0);
  });

  it('the choice is kept in the companion file by sheet name, and an old file has none', () => {
    const csv = writeConvertSidecar({ totalOnce: ['catch.csv'] });
    expect(csv).toContain('totalOnce=catch.csv');
    expect(readConvertSettings(parseFile('side.csv', new TextEncoder().encode(csv)))?.totalOnce).toEqual(['catch.csv']);
    expect(readConvertSettings(parseFile('side.csv', new TextEncoder().encode(writeConvertSidecar({ fullList: true }))))?.totalOnce).toBeUndefined();
  });

  it('rows of a group that disagree stay blocked, even with the choice "once"; the others are taken once', () => {
    const bent = rows.map((r) => [...r]);
    bent[1][6] = 99; // second size class of the first group holds another number
    const r = run(bent, { totalOnce: true });
    expect(r.ok).toBe(false);
    const f = ids(r, 'CONV-QUANTITY-REPEATED');
    expect(f).toHaveLength(1);
    expect(f[0].params.disagree).toBe('yes');
    expect(f[0].lines).toEqual([2, 3, 4]);
    expect(ids(r, 'CONV-QUANTITY-REPEATED-ONCE')[0].params.groups).toBe(19);
  });

  it('a count column with a number of its own on each row is named as the quantity to pick instead', () => {
    const header = [...HEADER, 'Number_Measured'];
    const withOwn = rows.map((r, i) => [...r, 1 + (i % 3) * 2 + (i % 7)]);
    const r = run(withOwn, { header, edit: { ...EDIT, Number_Measured: { kind: 'ignore' } } });
    const f = ids(r, 'CONV-QUANTITY-REPEATED');
    expect(f[0].params.alternative).toBe('Number_Measured');
    expect(renderConvertPlain(f[0], 'en')).toContain('Number_Measured');
    // and when that column is the quantity, nothing repeats
    const picked = run(withOwn, { header, edit: { ...EDIT, Number_in_Haul: { kind: 'ignore' }, Number_Measured: { kind: 'quantity' }, Weight_in_Haul: { kind: 'ignore' } } });
    expect(ids(picked, 'CONV-QUANTITY-REPEATED')).toHaveLength(0);
  });
});

describe('what is not a repeated total', () => {
  it('a genuine count per size class (the values differ) does not fire', () => {
    const rows = totals(10, 3, (s, t) => 5 + s + t, () => 1).map((r, i) => [r[0], r[1], r[2], r[3], r[4], r[5], Number(r[6]) + (i % 3) * 4 + (i % 5), r[7]]);
    const r = run(rows);
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(0);
  });

  it('a few groups that coincide (two size classes with 4 animals each) do not fire', () => {
    const rows = totals(12, 2, (s, t) => 3 + s + 2 * t).map((r, i) => [...r.slice(0, 6), Number(r[6]) + (i % 2) * 3, (i % 2) * 7 + i]);
    // two groups coincide by chance
    rows[1][6] = rows[0][6];
    rows[5][6] = rows[4][6];
    const r = run(rows);
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(0);
  });

  it('rows of single animals (a count of 1 on each size class) do not fire', () => {
    const rows = totals(10, 3, () => 1, (s, t) => 3 + s + t);
    const r = run(rows.map((r, i) => [...r.slice(0, 7), Number(r[7]) + (i % 3)]));
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(0);
  });

  it('the same value on every group is not a total (it varies from group to group)', () => {
    const r = run(totals(10, 3, () => 40, (s, t) => 1 + s + t).map((r, i) => [...r.slice(0, 7), Number(r[7]) + (i % 3)]));
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(0);
  });

  it('rows that differ only in a per-row identifier are not size classes (a record number is not a size)', () => {
    const header = ['sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Number_in_Haul', 'record'];
    const rows2: Cell[][] = [];
    let n = 0;
    for (let s = 1; s <= 14; s++) for (let c = 0; c < 2; c++) rows2.push([`s${s}`, '2020-06-01', 49.4 + s / 100, 0.2, 'Solea solea', 2 + s, `r${++n}`]);
    const r = run(rows2, { header, edit: { sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Number_in_Haul: { kind: 'quantity' }, record: { kind: 'ignore' } } });
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(0);
  });

  it('a single size class per taxon is an ordinary table', () => {
    const r = run(totals(10, 1, (s, t) => total(t, s)));
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(0);
    expect(r.ok).toBe(true);
  });
});
