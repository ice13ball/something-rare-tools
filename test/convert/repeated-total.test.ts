// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A quantity or a weight written again on rows that are not new animals (repeatedTotal.ts): CONV-QUANTITY-REPEATED, CONV-QUANTITY-SAME-IN-SAMPLE, CONV-ROW-COPIES. Every row is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { judge } from '../../src/core/convert/policy';
import { readConvertSettings, writeConvertSidecar } from '../../src/core/convert/settings';
import { parseFile } from '../../src/core/parse';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { ColumnRole } from '../../src/core/types';
import type { Cell } from './helpers';
import { fileOf, sheetInput } from './helpers';

const HEADER = ['sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Size', 'Quantity', 'Weight'];
const EDIT: Record<string, ColumnRole> = {
  sample: { kind: 'sampleId' },
  Species: { kind: 'taxon' },
  Quantity: { kind: 'quantity' },
  Weight: { kind: 'biomass', basis: 'wet' },
  Size: { kind: 'variable', variable: 'body length', unit: 'cm', unitSource: 'user', perOccurrence: true },
};
const QUANTITY = { kind: 'count' as const };
const TAXA = ['Solea solea', 'Merlangius merlangus'];

type Flags = { totalOnce?: boolean; realCounts?: boolean; dropCopies?: boolean };
const run = (rows: Cell[][], extra: Flags & { header?: string[]; edit?: Record<string, ColumnRole> } = {}) => {
  const { header, edit, ...flags } = extra;
  return convert({ sheets: [sheetInput(fileOf(header ?? HEADER, rows, 'S', { fileName: 'catch.csv' }), { shape: 'long', quantity: QUANTITY, edit: edit ?? EDIT, ...flags })] });
};
const ids = (r: ReturnType<typeof run>, rule: string) => r.findings.filter((f) => f.ruleId === rule);

/** `samples` hauls, each with two taxa on `classes` size classes. */
function table(samples: number, classes: number, qty: (s: number, t: number, c: number) => number, weight: (s: number, t: number, c: number) => number = (s, t) => 100 + s * 3 + t, size: (c: number) => Cell = (c) => 8 + c): Cell[][] {
  const rows: Cell[][] = [];
  for (let s = 1; s <= samples; s++) for (let t = 0; t < TAXA.length; t++) for (let c = 0; c < classes; c++) rows.push([`s${s}`, '2020-06-01', 49.4 + s / 100, 0.2, TAXA[t], size(c), qty(s, t, c), weight(s, t, c)]);
  return rows;
}
const total = (s: number, t: number): number => 20 + 7 * s + 3 * t;

describe('a total repeated on size-class rows', () => {
  const rows = table(10, 3, (s, t) => total(s, t));
  const truth = rows.filter((_, i) => i % 3 === 0).reduce((n, r) => n + Number(r[6]), 0);

  it('blocks, names the columns and the differing column, and does not offer the occurrenceID advice', () => {
    const r = run(rows);
    expect(r.ok).toBe(false);
    const f = ids(r, 'CONV-QUANTITY-REPEATED');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ columns: 'Quantity, Weight', differs: 'Size', count: 20, of: 20 });
    expect(ids(r, 'CONV-ID-DUPLICATE')).toHaveLength(0);
    expect(ids(r, 'CONV-TAXON-SAME-EVENT')).toHaveLength(0);
    expect(ids(r, 'CONV-QUANTITY-SAME-IN-SAMPLE')).toHaveLength(0);
    const text = renderConvertPlain(f[0], 'en');
    expect(text).toContain('Quantity');
    expect(text).not.toMatch(/give the rows an occurrenceID/i);
    for (const lang of ['pl', 'de', 'fr'] as const) expect(renderConvertPlain(f[0], lang)).toContain('Quantity');
  });

  it('an occurrenceID column does not switch the check off', () => {
    const r = run(rows.map((x, i) => [...x, `a${i}`]), { header: [...HEADER, 'occurrence_id'], edit: { ...EDIT, occurrence_id: { kind: 'occurrenceId' } } });
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(1);
  });

  it('with "once": one occurrence per sample and taxon, the sums are those of one value per group, and nothing per row is written from the first row (H2)', () => {
    const r = run(rows, { totalOnce: true });
    expect(r.occurrences).toHaveLength(20);
    expect(r.occurrences.reduce((n, o) => n + (o.individualCount ?? 0), 0)).toBe(truth);
    const weight = r.measurements.filter((m) => m.role === 'biomass').reduce((n, m) => n + Number(m.measurementValue), 0);
    expect(weight).toBe(rows.filter((_, i) => i % 3 === 0).reduce((n, x) => n + Number(x[7]), 0));
    // no body length of the first size class on an occurrence that stands for all of them
    expect(r.measurements.filter((m) => m.measurementType.toLowerCase().includes('body length'))).toEqual([]);
    const once = ids(r, 'CONV-QUANTITY-REPEATED-ONCE');
    expect(once).toHaveLength(1);
    expect(once[0].params).toMatchObject({ count: 40, groups: 20, lost: 'Size' });
    expect(judge(r.findings).acceptRules).toContain('CONV-QUANTITY-REPEATED-ONCE');
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(0);
    expect(renderConvertPlain(once[0], 'en')).toContain('Size');
  });

  it('a variable of the SAMPLE that differs between the rows of a group still gives CONV-SAMPLE-CONFLICT', () => {
    const header = [...HEADER, 'Temperature [degC]'];
    const withTemp = rows.map((x, i) => [...x, i === 1 ? 9.9 : 5.5]);
    const r = run(withTemp, { header, edit: { ...EDIT, 'Temperature [degC]': { kind: 'variable', variable: 'temperature', unit: 'degC', unitSource: 'header' } }, totalOnce: true });
    expect(ids(r, 'CONV-SAMPLE-CONFLICT').length).toBeGreaterThan(0);
  });

  it('the choice is kept in the companion file by sheet name, with the other two choices', () => {
    const csv = writeConvertSidecar({ totalOnce: ['catch.csv'], realCounts: ['catch.csv'], dropCopies: ['catch.csv'] });
    const s = readConvertSettings(parseFile('side.csv', new TextEncoder().encode(csv)));
    expect(s?.totalOnce).toEqual(['catch.csv']);
    expect(s?.realCounts).toEqual(['catch.csv']);
    expect(s?.dropCopies).toEqual(['catch.csv']);
    expect(readConvertSettings(parseFile('side.csv', new TextEncoder().encode(writeConvertSidecar({ fullList: true }))))?.totalOnce).toBeUndefined();
  });

  it('"these are real counts" switches the block and the warning off', () => {
    const r = run(rows, { realCounts: true });
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(0);
    expect(ids(r, 'CONV-QUANTITY-SAME-IN-SAMPLE')).toHaveLength(0);
  });

  it('a column with a number of its own on each row is named as the quantity to pick instead', () => {
    const header = [...HEADER, 'Number_Measured'];
    const own = rows.map((x, i) => [...x, 1 + (i % 3) * 2 + (i % 7)]);
    const f = ids(run(own, { header, edit: { ...EDIT, Number_Measured: { kind: 'ignore' } } }), 'CONV-QUANTITY-REPEATED');
    expect(f[0].params.alternative).toBe('Number_Measured');
  });

  it('70 % of the groups repeat: it blocks (the line is at half)', () => {
    const mixed = table(10, 2, (s, t, c) => (s <= 7 ? total(s, t) : 20 + s * 3 + t * 5 + c * 11));
    expect(ids(run(mixed), 'CONV-QUANTITY-REPEATED')).toHaveLength(1);
  });
});

describe('what is not a repeated total (H2-H4: a total must be at least the number of rows it is shared by)', () => {
  it('1,1,1 on every group is a table of specimens, not a total', () => {
    const r = run(table(12, 3, () => 1, (s, t, c) => 3 + s + t + c));
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(0);
    expect(ids(r, 'CONV-QUANTITY-SAME-IN-SAMPLE')).toHaveLength(0);
  });

  it('1,2,2,1 repeats nothing', () => {
    const r = run(table(10, 4, (s, t, c) => [1, 2, 2, 1][c], (s, t, c) => 10 + s + c));
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(0);
  });

  it('a genuine table of counts of mostly 1 with a few equal pairs does not block; the pairs are said', () => {
    const rows2 = table(12, 2, (s, t, c) => (s <= 2 && t === 0 ? 4 : 1 + ((s + t + c) % 2)), (s, t, c) => 3 + s + c);
    const r = run(rows2);
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(0);
  });

  it('a genuine count per size class (the values differ) does not fire', () => {
    const r = run(table(10, 3, (s, t, c) => 5 + s + t + c * 4 + (s % 5), (s, t, c) => 100 + s * 3 + t + c * 9));
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(0);
    expect(ids(r, 'CONV-QUANTITY-SAME-IN-SAMPLE')).toHaveLength(0);
  });

  it('under "once" a group below the threshold stays as separate rows with their own values', () => {
    // 10 groups of 3 with a real total, one group of 3 whose value (2) is below its 3 rows
    const rows3 = table(10, 3, (s, t) => (s === 1 && t === 0 ? 2 : total(s, t)));
    const r = run(rows3, { totalOnce: true });
    const first = r.occurrences.filter((o) => o.eventId === 's1' && o.scientificName === 'Solea solea');
    expect(first).toHaveLength(3);
    expect(first.map((o) => o.individualCount)).toEqual([2, 2, 2]);
  });
});

describe('the specimen table and the per-size counts with a repeated weight (H3: the counts are never reduced)', () => {
  const specimens = table(20, 3, () => 1, (s, t) => 50 + s * 2 + t).filter((r) => r[4] === TAXA[0]).map((r, i) => [...r, `o${i}`]);
  const header = [...HEADER, 'occurrence_id'];
  const edit = { ...EDIT, occurrence_id: { kind: 'occurrenceId' } as ColumnRole };

  it('N=1 on each row, the weight repeated: the block is on the WEIGHT, and "once" keeps the 60 animals and writes the weight once per group', () => {
    const blocked = run(specimens, { header, edit });
    const f = ids(blocked, 'CONV-QUANTITY-REPEATED');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ columns: 'Weight', weight: 'yes' });
    expect(renderConvertPlain(f[0], 'en')).toMatch(/ignore the weight/i);
    const r = run(specimens, { header, edit, totalOnce: true });
    expect(r.occurrences).toHaveLength(60);
    expect(r.occurrences.reduce((n, o) => n + (o.individualCount ?? 0), 0)).toBe(60);
    const w = r.measurements.filter((m) => m.role === 'biomass');
    expect(w).toHaveLength(20);
    expect(w.every((m) => (m.measurementRemarks ?? '').includes('total for the taxon'))).toBe(true);
    const once = ids(r, 'CONV-QUANTITY-REPEATED-ONCE');
    expect(once[0].params).toMatchObject({ columns: 'Weight', weight: 'yes', count: 40, groups: 20 });
  });

  it('per-size counts with a repeated weight: the counts stay per row (102 stays 102), only the weight is reduced', () => {
    const counts = [5, 8, 2];
    const rows4 = table(20, 3, (s, t, c) => counts[c] + (s % 3), (s, t) => 50 + s * 2 + t).filter((r) => r[4] === TAXA[0]).map((r, i) => [...r, `o${i}`]);
    const sum = rows4.reduce((n, r) => n + Number(r[6]), 0);
    const r = run(rows4, { header, edit, totalOnce: true });
    expect(r.occurrences.reduce((n, o) => n + (o.individualCount ?? 0), 0)).toBe(sum);
    expect(ids(r, 'CONV-QUANTITY-REPEATED-ONCE')[0].params.weight).toBe('yes');
  });
});

describe('below the block there is never silence and never the old advice (H4d)', () => {
  const warns = (r: ReturnType<typeof run>) => ids(r, 'CONV-QUANTITY-SAME-IN-SAMPLE');

  it('fewer than 4 groups: a must-accept warning with both sums, and not the occurrenceID advice', () => {
    const r = run(table(1, 3, (s, t) => total(s, t)));
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(0);
    const f = warns(r);
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ groups: 2, records: 6 });
    expect(Number(f[0].params.written)).toBeGreaterThan(Number(f[0].params.asTotal));
    expect(judge(r.findings).acceptRules).toContain('CONV-QUANTITY-SAME-IN-SAMPLE');
    for (const x of ids(r, 'CONV-ID-DUPLICATE')) expect(renderConvertPlain(x, 'en')).not.toMatch(/occurrenceID or a life stage|occurrenceID or life stage/i);
    expect(ids(r, 'CONV-TAXON-SAME-EVENT')).toHaveLength(0);
    expect(renderConvertPlain(f[0], 'en')).toContain(String(f[0].params.asTotal));
  });

  it('one value everywhere (40 on every group)', () => {
    const r = run(table(10, 3, () => 40, (s, t, c) => 100 + s * 3 + t + c * 9));
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(0);
    expect(warns(r)).toHaveLength(1);
  });

  it('a blank size in a group', () => {
    const r = run(table(2, 3, (s, t) => total(s, t), undefined, (c) => (c === 1 ? null : 8 + c)));
    expect(warns(r)).toHaveLength(1);
  });

  it('lengths that are 95 % distinct (a size of each fish)', () => {
    let n = 0;
    const r = run(table(10, 3, (s, t) => total(s, t), undefined, () => 10 + ++n * 0.37));
    // never silent: the repeat is the rule here, so it blocks (or, below the line, it warns)
    expect(ids(r, 'CONV-QUANTITY-REPEATED').length + warns(r).length).toBeGreaterThan(0);
    expect(ids(r, 'CONV-ID-DUPLICATE')).toHaveLength(0);
  });

  it('a stage as the differing column, and the size given as the life stage or a replicate by the user', () => {
    const header = [...HEADER];
    for (const kind of ['lifeStage', 'replicate'] as const) {
      const r = run(table(10, 3, (s, t) => total(s, t)), { header, edit: { ...EDIT, Size: { kind } } });
      expect(ids(r, 'CONV-QUANTITY-REPEATED').length + warns(r).length, kind).toBeGreaterThan(0);
    }
  });

  it('a code per size class does not clear it', () => {
    const header = [...HEADER, 'occurrence_id'];
    const r = run(table(1, 3, (s, t) => total(s, t)).map((x, i) => [...x, `code${i}`]), { header, edit: { ...EDIT, occurrence_id: { kind: 'occurrenceId' } } });
    expect(warns(r)).toHaveLength(1);
  });
});

describe('rows that are exact copies (H5)', () => {
  const copies = (): Cell[][] => {
    const out: Cell[][] = [];
    for (let s = 1; s <= 12; s++) for (const c of [0, 1]) out.push([`s${s}`, '2020-06-01', 49.4 + s / 100, 0.2, TAXA[s % 2], 'L', 38 + s, 100 + s, `row${out.length}`]);
    return out;
  };
  const header = [...HEADER, 'record'];
  const edit = (id: boolean): Record<string, ColumnRole> => ({ ...EDIT, record: id ? { kind: 'occurrenceId' } : { kind: 'ignore' } });
  const truthWith = Array.from({ length: 12 }, (_, i) => 38 + i + 1).reduce((n, v) => n + 2 * v, 0);

  it('blocks, says the sum with and without them, and does not advise telling the rows apart', () => {
    const r = run(copies(), { header, edit: edit(false) });
    expect(r.ok).toBe(false);
    const f = ids(r, 'CONV-ROW-COPIES');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ count: 12, withCopies: truthWith, withoutCopies: truthWith / 2 });
    expect(ids(r, 'CONV-ID-DUPLICATE')).toHaveLength(0);
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) expect(renderConvertPlain(f[0], lang)).toContain(String(truthWith / 2));
  });

  it('a row-number occurrenceID on identical rows does not clear it', () => {
    const r = run(copies(), { header, edit: edit(true) });
    expect(ids(r, 'CONV-ROW-COPIES')).toHaveLength(1);
  });

  it('"drop the copies" converts one row of each and says so', () => {
    const r = run(copies(), { header, edit: edit(true), dropCopies: true });
    expect(ids(r, 'CONV-ROW-COPIES')).toHaveLength(0);
    expect(ids(r, 'CONV-ROW-COPIES-DROPPED')).toHaveLength(1);
    expect(r.occurrences).toHaveLength(12);
    expect(r.occurrences.reduce((n, o) => n + (o.individualCount ?? 0), 0)).toBe(truthWith / 2);
  });

  it('identical specimen rows (a count of 1) are not copies', () => {
    const r = run(copies().map((x) => [...x.slice(0, 6), 1, x[7], x[8]]), { header, edit: edit(true) });
    expect(ids(r, 'CONV-ROW-COPIES')).toHaveLength(0);
  });
});
