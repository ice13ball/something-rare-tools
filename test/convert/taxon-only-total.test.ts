// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Round 2, Task 2: inside a group whose total is taken once, a row that has only the taxon (every column that tells the rows apart is blank) is its own case with one decision per sheet,
// and a total of 1 on 2 or more rows is not a repeat but is said. The sheets have the shape of a trawl catch table (a haul total repeated on each size-class row). Every value is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { notWrittenCsv } from '../../src/core/convert/notWritten';
import { judge } from '../../src/core/convert/policy';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { ColumnRole } from '../../src/core/types';
import type { Cell } from './helpers';
import { fileOf, sheetInput } from './helpers';

const HEADER = ['Haul', 'Date', 'Latitude', 'Longitude', 'Species', 'Size', 'Age', 'Measured', 'Total', 'Mass'];
const EDIT: Record<string, ColumnRole> = {
  Haul: { kind: 'sampleId' },
  Species: { kind: 'taxon' },
  Total: { kind: 'quantity' },
  Mass: { kind: 'biomass', basis: 'wet' },
  Size: { kind: 'variable', variable: 'body length', unit: 'cm', unitSource: 'user', perOccurrence: true },
  Age: { kind: 'variable', variable: 'age group', unitSource: 'user', perOccurrence: true },
  Measured: { kind: 'variable', variable: 'number measured', unitSource: 'user', perOccurrence: true },
};
const TAXA = ['Solea solea', 'Merlangius merlangus'];
const total = (h: number, t: number): number => 20 + 7 * h + 3 * t;
const mk = (rows: Cell[][], extra: Partial<ConvertSheetInput> = {}): ConvertSheetInput => sheetInput(fileOf(HEADER, rows, 'S', { fileName: 'catch.csv' }), { shape: 'long', quantity: { kind: 'count' }, edit: EDIT, ...extra });
const ids = (r: ReturnType<typeof convert>, rule: string) => r.findings.filter((f) => f.ruleId === rule);

/** 10 hauls x 2 taxa x 3 sized rows; the first `withOnly` hauls also have a row with only the taxon (its total repeated, no size, no age, no number measured). */
function catchRows(withOnly: number, sizedRows = 3): Cell[][] {
  const rows: Cell[][] = [];
  for (let h = 1; h <= 10; h++) {
    for (let t = 0; t < TAXA.length; t++) {
      for (let c = 0; c < sizedRows; c++) rows.push([`H${h}`, '2020-06-01', 49.4 + h / 100, 0.2, TAXA[t], 8 + c, c % 2 === 0 ? 'young' : 'old', 2 + c, total(h, t), 100 + h]);
      if (h <= withOnly) rows.push([`H${h}`, '2020-06-01', 49.4 + h / 100, 0.2, TAXA[t], null, 'NA', null, total(h, t), 100 + h]);
    }
  }
  return rows;
}
const ONLY = 8; // taxon-only rows: 4 hauls x 2 taxa
const truth = (): number => {
  let n = 0;
  for (let h = 1; h <= 10; h++) for (let t = 0; t < TAXA.length; t++) n += total(h, t);
  return n;
};
const sumOf = (r: ReturnType<typeof convert>): number => r.occurrences.reduce((n, o) => n + (o.individualCount ?? 0), 0);

describe('rows with only the taxon inside a group taken once', () => {
  const rows = catchRows(4);

  it('are not joined to the group: with the total taken once the export asks one question for them, with their count', () => {
    const r = convert({ sheets: [mk(rows, { totalOnce: true })] });
    const q = ids(r, 'CONV-ROW-NOT-UNDERSTOOD');
    expect(q).toHaveLength(1);
    expect(q[0].params).toMatchObject({ reason: 'taxon-only-in-total', count: ONLY });
    expect(judge(r.findings).blocking.map((f) => f.ruleId)).toContain('CONV-ROW-NOT-UNDERSTOOD');
    expect(ids(r, 'CONV-ID-DUPLICATE')).toHaveLength(0);
    // the group is written once under one occurrence; the taxon-only row is not an occurrence of its own
    expect(r.occurrences).toHaveLength(20);
    expect(sumOf(r)).toBe(truth());
    const text = renderConvertPlain(q[0], 'en');
    expect(text).toContain('only a taxon name');
    for (const lang of ['pl', 'de', 'fr'] as const) expect(renderConvertPlain(q[0], lang)).not.toBe(text);
  });

  it('the answer carries its count: left out and listed, the export goes on with the same occurrences and the same sum; another count asks again', () => {
    const sheets = [mk(rows, { totalOnce: true, leaveOut: [{ reason: 'taxon-only-in-total', count: ONLY }] })];
    const r = convert({ sheets });
    expect(ids(r, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(0);
    expect(ids(r, 'CONV-ROW-LEFT-OUT').map((f) => f.params.reason)).toEqual(['taxon-only-in-total']);
    expect(judge(r.findings).blocking).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.occurrences).toHaveLength(20);
    expect(sumOf(r)).toBe(truth());
    const csv = notWrittenCsv(r.ledger, sheets, r.leftOut).chunks.join('');
    expect(csv.split('\n').filter((l) => l.includes('taxon-only-in-total') && l.includes('left-out'))).toHaveLength(ONLY);
    const other = convert({ sheets: [mk(rows, { totalOnce: true, leaveOut: [{ reason: 'taxon-only-in-total', count: ONLY + 1 }] })] });
    expect(ids(other, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(1);
  });

  it('one sized row beside a taxon-only row is no size-class group: nothing is taken once or asked', () => {
    const r = convert({ sheets: [mk(catchRows(4, 1), { totalOnce: true })] });
    expect(ids(r, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(0);
  });

  it('without the choice "once" nothing is taken once and the block asks for it as before', () => {
    const r = convert({ sheets: [mk(rows)] });
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(1);
    expect(ids(r, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(0);
  });

  it('a sheet without such rows raises nothing new', () => {
    const r = convert({ sheets: [mk(catchRows(0), { totalOnce: true })] });
    expect(ids(r, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(0);
    expect(r.ok).toBe(true);
    expect(sumOf(r)).toBe(truth());
  });

  it('a row with a size but no number measured is not a taxon-only row', () => {
    const half = catchRows(0).map((x, i) => (i % 3 === 2 ? [...x.slice(0, 7), null, ...x.slice(8)] : x));
    const r = convert({ sheets: [mk(half, { totalOnce: true })] });
    expect(ids(r, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(0);
    expect(sumOf(r)).toBe(truth());
  });
});

describe('a total of 1 on 2 or more rows', () => {
  const ones = (rows: Cell[][]): Cell[][] => [
    ...rows,
    ...['H1', 'H2', 'H3'].flatMap((h, i) => [[h, '2020-06-01', 49.4 + (i + 1) / 100, 0.2, 'Pleuronectes platessa', 10, 'old', 2, 1, 50], [h, '2020-06-01', 49.4 + (i + 1) / 100, 0.2, 'Pleuronectes platessa', 11, 'old', 3, 1, 50]] as Cell[][]),
  ];

  it('is not a repeat, and on a sheet whose quantity is a repeated total it is said once with both sums (accept level)', () => {
    const r = convert({ sheets: [mk(ones(catchRows(0)), { totalOnce: true })] });
    const f = ids(r, 'CONV-QUANTITY-SAME-IN-SAMPLE').filter((x) => x.params.weight !== 'yes');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ groups: 3, records: 6, written: 6, asTotal: 3 });
    expect(judge(r.findings).acceptRules).toContain('CONV-QUANTITY-SAME-IN-SAMPLE');
    // not taken once: the 1s are not collapsed
    expect(r.occurrences.filter((o) => o.scientificName === 'Pleuronectes platessa')).toHaveLength(6);
  });

  it('a plain specimen table (no repeated total anywhere) stays silent, as before', () => {
    const specimens: Cell[][] = [];
    for (let h = 1; h <= 10; h++) for (let c = 0; c < 3; c++) specimens.push([`H${h}`, '2020-06-01', 49.4 + h / 100, 0.2, TAXA[0], 8 + c, 'old', 2 + c, 1, 100 + c]);
    const r = convert({ sheets: [mk(specimens)] });
    expect(ids(r, 'CONV-QUANTITY-SAME-IN-SAMPLE').filter((x) => x.params.weight !== 'yes')).toHaveLength(0);
  });
});
