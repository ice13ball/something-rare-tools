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
const mk = (rows: Cell[][], extra: Partial<ConvertSheetInput> & { edit?: Record<string, ColumnRole> } = {}): ConvertSheetInput => sheetInput(fileOf(HEADER, rows, 'S', { fileName: 'catch.csv' }), { shape: 'long', quantity: { kind: 'count' }, edit: EDIT, ...extra });
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
    expect(text).toContain('no size or other detail');
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
  const onesAt = (h: number, i: number, stage = 'old'): Cell[][] => [10, 11].map((size) => [`H${h}`, '2020-06-01', 49.4 + h / 100, 0.2, 'Pleuronectes platessa', size, stage, 2 + i, 1, 50]);
  const ones = (rows: Cell[][]): Cell[][] => [...rows, ...[1, 2, 3].flatMap((h, i) => onesAt(h, i))];
  const PLAICE = (r: ReturnType<typeof convert>) => r.occurrences.filter((o) => o.scientificName === 'Pleuronectes platessa');

  it('is not a repeat: the choice "once" does not collapse it, and the later rows are asked about once per sheet, with their count', () => {
    const r = convert({ sheets: [mk(ones(catchRows(0)), { totalOnce: true })] });
    const q = ids(r, 'CONV-ROW-NOT-UNDERSTOOD');
    expect(q).toHaveLength(1);
    expect(q[0].params).toMatchObject({ reason: 'one-specimen-total', count: 3 });
    // the first row of each group is written, the later one is not: no duplicate identifier to explain
    expect(PLAICE(r)).toHaveLength(3);
    expect(ids(r, 'CONV-ID-DUPLICATE')).toHaveLength(0);
    expect(judge(r.findings).blocking.map((f) => f.ruleId)).toEqual(['CONV-ROW-NOT-UNDERSTOOD']);
    // both readings are in the text: the answer, and the file to be corrected when they are separate specimens
    expect(renderConvertPlain(q[0], 'en')).toContain('correct your file');
    expect(renderConvertPlain(q[0], 'pl')).toContain('popraw plik');
    expect(renderConvertPlain(q[0], 'de')).toContain('korrigieren Sie Ihre Datei');
    expect(renderConvertPlain(q[0], 'fr')).toContain('corrigez votre fichier');
  });

  it('the answer carries its count and the sheet\'s rows: the later rows are listed with their cells under their own reason; another count asks again', () => {
    const rows = ones(catchRows(0));
    const sheets = [mk(rows, { totalOnce: true, leaveOut: [{ reason: 'one-specimen-total', count: 3 }] })];
    const r = convert({ sheets });
    expect(ids(r, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(0);
    expect(r.ok).toBe(true);
    expect(sumOf(r)).toBe(truth() + 3);
    const lines = notWrittenCsv(r.ledger, sheets, r.leftOut).chunks.join('').split('\n').filter((l) => l.includes('one-specimen-total'));
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.includes('left-out') && l.includes('Pleuronectes platessa') && l.includes('H'))).toBe(true);
    const other = convert({ sheets: [mk(rows, { totalOnce: true, leaveOut: [{ reason: 'one-specimen-total', count: 4 }] })] });
    expect(ids(other, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(1);
  });

  it('where the person\'s own occurrenceIDs differ on every row nothing new is asked: the rows are separate specimens already told apart (N1)', () => {
    let n = 0;
    const withIds = (rows: Cell[][]): Cell[][] => rows.map((x) => [...x, `o${++n}`]);
    const edit = { ...EDIT, occ: { kind: 'occurrenceId' } as ColumnRole };
    const run = (rows: Cell[][]) => convert({ sheets: [sheetInput(fileOf([...HEADER, 'occ'], rows, 'S', { fileName: 'catch.csv' }), { shape: 'long', quantity: { kind: 'count' }, edit, totalOnce: true })] });
    const r = run(withIds(ones(catchRows(0))));
    expect(ids(r, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(0);
    expect(r.ok).toBe(true);
    expect(PLAICE(r)).toHaveLength(6);
    expect(sumOf(r)).toBe(truth() + 6);
    // an occurrenceID column that is blank on those rows gives them no identifier of their own: asked, as without the column
    const blank = [...withIds(catchRows(0)), ...ones([]).map((x) => [...x, ''])];
    expect(ids(run(blank), 'CONV-ROW-NOT-UNDERSTOOD')[0]?.params).toMatchObject({ reason: 'one-specimen-total', count: 3 });
  });

  it('the row that is written is the first one with a size, not the first in the file (N3)', () => {
    const noSizeFirst: Cell[][] = [1, 2, 3].flatMap((h) => [[`H${h}`, '2020-06-01', 49.4 + h / 100, 0.2, 'Pleuronectes platessa', null, 'NA', null, 1, 50], [`H${h}`, '2020-06-01', 49.4 + h / 100, 0.2, 'Pleuronectes platessa', 10 + h, 'old', 2, 1, 50]] as Cell[][]);
    const rows = [...catchRows(0), ...noSizeFirst];
    const sheets = [mk(rows, { totalOnce: true, leaveOut: [{ reason: 'one-specimen-total', count: 3 }] })];
    const r = convert({ sheets });
    const written = PLAICE(r).map((o) => o.source.line);
    const sizeless = noSizeFirst.map((_, i) => 1 + 120 + 1 + i).filter((_, i) => i % 2 === 0);
    expect(written).toHaveLength(3);
    for (const l of sizeless) expect(written).not.toContain(l);
    // the sized row of each haul is the one with a measurement of its size
    expect(r.measurements.filter((m) => written.includes(m.source.line) && /body length/.test(m.measurementType)).length).toBe(3);
  });

  it('without the choice "once" the block stands and the total of 1 is not asked about yet', () => {
    const r = convert({ sheets: [mk(ones(catchRows(0)))] });
    expect(ids(r, 'CONV-QUANTITY-REPEATED')).toHaveLength(1);
    expect(ids(r, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(0);
  });

  it('a 1 and a 1 in two life stages of one sample is no total of 1 (the stage is part of the strict group)', () => {
    const edit = { ...EDIT, Age: { kind: 'lifeStage' } as ColumnRole };
    const rows = [...catchRows(0), ...[1, 2].flatMap((h) => [onesAt(h, 0, 'adult')[0], onesAt(h, 0, 'juvenile')[1]])];
    const r = convert({ sheets: [mk(rows, { totalOnce: true, edit })] });
    expect(ids(r, 'CONV-ROW-NOT-UNDERSTOOD').filter((f) => f.params.reason === 'one-specimen-total')).toHaveLength(0);
    // (what the sheet without the pairs says is not changed by them)
    const bare = convert({ sheets: [mk(catchRows(0), { totalOnce: true, edit })] });
    expect(ids(r, 'CONV-QUANTITY-SAME-IN-SAMPLE').map((f) => f.params.groups)).toEqual(ids(bare, 'CONV-QUANTITY-SAME-IN-SAMPLE').map((f) => f.params.groups));
  });

  it('a plain specimen table (no repeated total anywhere) stays silent, as before', () => {
    const specimens: Cell[][] = [];
    for (let h = 1; h <= 10; h++) for (let c = 0; c < 3; c++) specimens.push([`H${h}`, '2020-06-01', 49.4 + h / 100, 0.2, TAXA[0], 8 + c, 'old', 2 + c, 1, 100 + c]);
    const r = convert({ sheets: [mk(specimens, { totalOnce: true })] });
    expect(ids(r, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(0);
    expect(ids(r, 'CONV-QUANTITY-SAME-IN-SAMPLE').filter((x) => x.params.weight !== 'yes')).toHaveLength(0);
  });

  it('a pair that disagrees with itself (1 and 21) is not a total of 1 and stays blocked by the duplicate identifier', () => {
    const pair: Cell[][] = [['H1', '2020-06-01', 49.41, 0.2, 'Pleuronectes platessa', 10, 'old', 2, 1, 50], ['H1', '2020-06-01', 49.41, 0.2, 'Pleuronectes platessa', 11, 'old', 3, 21, 50]];
    const r = convert({ sheets: [mk([...catchRows(0), ...pair], { totalOnce: true })] });
    expect(ids(r, 'CONV-ROW-NOT-UNDERSTOOD').filter((f) => f.params.reason === 'one-specimen-total')).toHaveLength(0);
    expect(ids(r, 'CONV-ID-DUPLICATE').length).toBeGreaterThan(0);
  });
});

describe('a taxon-only row whose number is not the repeated total (M1)', () => {
  // hauls H1-H2: 3 size rows with the total repeated; hauls H3-H5: 2 size rows with the total repeated, plus a row with no size and a number of 7 of its own
  const mixed = (): Cell[][] => {
    const rows: Cell[][] = [];
    for (let h = 1; h <= 2; h++) for (let t = 0; t < 2; t++) for (let c = 0; c < 3; c++) rows.push([`H${h}`, '2020-06-01', 49.4 + h / 100, 0.2, TAXA[t], 8 + c, 'young', 2 + c, 30 + 5 * h + t, 100 + h]);
    for (let h = 3; h <= 5; h++) for (let t = 0; t < 2; t++) {
      for (let c = 0; c < 2; c++) rows.push([`H${h}`, '2020-06-01', 49.4 + h / 100, 0.2, TAXA[t], 8 + c, 'young', 2 + c, 30 + 5 * h + t, 100 + h]);
      rows.push([`H${h}`, '2020-06-01', 49.4 + h / 100, 0.2, TAXA[t], null, 'NA', null, 7, 100 + h]);
    }
    return rows;
  };

  it('the quantity still blocks as before (the group is judged on its core), and with "once" the 7s are asked about, not written', () => {
    const blocked = convert({ sheets: [mk(mixed())] });
    expect(ids(blocked, 'CONV-QUANTITY-REPEATED')).toHaveLength(1);
    expect(String(ids(blocked, 'CONV-QUANTITY-REPEATED')[0].params.columns)).toContain('Total');
    const once = convert({ sheets: [mk(mixed(), { totalOnce: true })] });
    expect(ids(once, 'CONV-ROW-NOT-UNDERSTOOD')[0]?.params).toMatchObject({ reason: 'taxon-only-in-total', count: 6 });
    expect(once.occurrences).toHaveLength(10);
    expect(sumOf(once)).toBe(2 * 2 * 0 + [1, 2].reduce((n, h) => n + 2 * (30 + 5 * h) + 1, 0) + [3, 4, 5].reduce((n, h) => n + 2 * (30 + 5 * h) + 1, 0));
    expect(ids(once, 'CONV-QUANTITY-SAME-IN-SAMPLE').filter((f) => f.params.weight !== 'yes')).toHaveLength(0);
  });
});
