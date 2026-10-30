// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Replicate / sub-sample columns (Frame, Quadrat, Replicate, ...): proposed by the header, each value an event under its sample (eventID <sample>:<value>), the occurrences hang on the replicate;
// without the role the duplicate message names the column; a sheet without such a column is unchanged. Synthetic data only.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { renderConvertPlain, renderConvertTechnical } from '../../src/core/rules/convert';
import type { Finding } from '../../src/core/types';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const find = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id);
const HEADER = ['Sample ID', 'Station', 'Date', 'Depth [m]', 'Frame', 'Species', 'Abundance', 'Biomass [g]'];
const ROWS: Cell[][] = [
  ['A-2_5', 'A-2', '2015-03-04', 5, 'B', 'Asterias rubens', 4, 226],
  ['A-2_5', 'A-2', '2015-03-04', 5, 'A', 'Asterias rubens', 2, 124],
  ['A-2_5', 'A-2', '2015-03-04', 5, 'C', 'Ophiura ophiura', 1, 36],
];
const REP = { Frame: { kind: 'replicate' as const } };
const run = (header: string[], rows: Cell[][], edit: Record<string, { kind: 'ignore' } | { kind: 'replicate' }> = REP) => convert({ sheets: [sheetInput(fileOf(header, rows), { quantity: { kind: 'count' }, shape: 'long', edit })] });

describe('the role is never applied by the header alone', () => {
  const role = (header: string) => proposeConvertColumns(fileOf(['Station', header, 'Calanus finmarchicus'], [['S1', 'A', 4]]).sheets[0], { decimalComma: false, date1904: false }).find((p) => p.header === header)!;
  it.each(['Frame', 'Quadrat', 'Replicate', 'Rep.', 'Replica', 'Subsample', 'Powtórzenie', 'Ramka', 'Replikat', 'Réplicat', 'Core', 'Grab'])('%s starts as it did before: not a replicate level', (header) => {
    expect(role(header).role.kind).not.toBe('replicate');
  });
});

describe('a replicate column puts a level under the sample', () => {
  it('1 sample event, 3 replicate events, 3 occurrences with distinct IDs, no blocker', () => {
    const r = run(HEADER, ROWS);
    expect(r.blocking.filter((f) => ['CONV-ID-DUPLICATE', 'CONV-REPLICATE-MISSING', 'CONV-SAMPLE-CODE-MISSING'].includes(f.ruleId))).toEqual([]);
    const samples = r.events.filter((e) => e.eventType === 'sample');
    const reps = r.events.filter((e) => e.eventType === 'replicate');
    expect(samples.map((e) => [e.id, e.parentId])).toEqual([['A-2_5', 'A-2']]);
    expect(reps.map((e) => [e.id, e.parentId, e.code])).toEqual([['A-2_5:B', 'A-2_5', 'B'], ['A-2_5:A', 'A-2_5', 'A'], ['A-2_5:C', 'A-2_5', 'C']]);
    expect(r.events.map((e) => e.eventType)).toEqual(['station', 'sample', 'replicate', 'replicate', 'replicate']);
    expect(r.occurrences.map((o) => [o.id, o.eventId])).toEqual([
      ['A-2_5:B:Asterias rubens', 'A-2_5:B'],
      ['A-2_5:A:Asterias rubens', 'A-2_5:A'],
      ['A-2_5:C:Ophiura ophiura', 'A-2_5:C'],
    ]);
    expect(r.occurrences.map((o) => o.organismQuantity)).toEqual([4, 2, 1]);
  });

  it('the sample is derived from its replicates (date), the replicates keep their own data', () => {
    const r = run(HEADER, ROWS);
    const sample = r.events.find((e) => e.eventType === 'sample')!;
    expect(sample.eventDate).toBe('2015-03-04');
    expect(sample.derived.date).toBe(true);
    expect(r.events.filter((e) => e.eventType === 'replicate').every((e) => e.eventDate === '2015-03-04')).toBe(true);
    expect(r.stats.samples).toBeGreaterThan(0);
  });

  it('the tree summary counts the replicates, and is silent about them without a replicate column', () => {
    expect(run(HEADER, ROWS).tree.replicates).toBe(3);
    const none = run(HEADER.filter((h) => h !== 'Frame'), ROWS.map((r) => r.filter((_, i) => i !== 4)), {});
    expect(none.tree.replicates).toBeUndefined();
  });

  it('a blank replicate value blocks, naming the column and the rows', () => {
    const r = run(HEADER, [...ROWS, ['A-2_5', 'A-2', '2015-03-04', 5, null, 'Ophiura ophiura', 3, 5]]);
    const m = find(r.blocking, 'CONV-REPLICATE-MISSING');
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ field: 'Frame', lines: [5], params: { count: 1 } });
    expect(renderConvertPlain(m[0], 'en')).toMatch(/^1 row has no value in the replicate column "Frame" \(line 5\)/);
    expect(renderConvertPlain(m[0], 'pl')).toMatch(/^1 wiersz nie ma wartości w kolumnie powtórzeń „Frame” \(wiersz 5\)/);
    expect(renderConvertPlain(m[0], 'de')).toMatch(/^1 Zeile hat keinen Wert in der Replikatspalte „Frame“/);
    expect(renderConvertPlain(m[0], 'fr')).toMatch(/^1 ligne n'a pas de valeur dans la colonne des réplicats « Frame »/);
  });

  it('the same replicate twice in one sample is a real duplicate', () => {
    const r = run(HEADER, [...ROWS, ['A-2_5', 'A-2', '2015-03-04', 5, 'A', 'Asterias rubens', 9, 1]]);
    expect(find(r.blocking, 'CONV-ID-DUPLICATE').length).toBeGreaterThan(0);
  });

  it('a wide sheet: each row of a sample is a replicate, the species columns hang on it', () => {
    const f = fileOf(['Sample', 'Station', 'Date', 'Quadrat', 'Calanus finmarchicus', 'Oithona similis'], [['K1', 'S1', '2020-01-01', 1, 4, 5], ['K1', 'S1', '2020-01-01', 2, 6, 0]]);
    const r = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' }, edit: { Quadrat: { kind: 'replicate' } } })] });
    expect(r.events.filter((e) => e.eventType === 'replicate').map((e) => [e.id, e.parentId])).toEqual([['K1:1', 'K1'], ['K1:2', 'K1']]);
    expect(r.occurrences.map((o) => o.id)).toEqual(['K1:1:Calanus finmarchicus', 'K1:1:Oithona similis', 'K1:2:Calanus finmarchicus']);
  });
});

describe('without the role, the duplicate names the column', () => {
  const ignored = {};
  it('the occurrence IDs repeat and the message says which ignored column tells the rows apart', () => {
    const r = run(HEADER, ROWS, ignored);
    const d = find(r.blocking, 'CONV-ID-DUPLICATE');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ value: 'A-2_5:Asterias rubens', params: { kind: 'occurrence', column: 'Frame' } });
    expect(renderConvertPlain(d[0], 'en')).toMatch(/differ in the ignored column "Frame".*give it the role "Replicate \/ sub-sample"/);
    expect(renderConvertPlain(d[0], 'pl')).toMatch(/pominiętej kolumnie „Frame”.*„Powtórzenie \/ podpróbka”/);
    expect(renderConvertPlain(d[0], 'de')).toMatch(/ignorierten Spalte „Frame“.*„Replikat \/ Teilprobe“/);
    expect(renderConvertPlain(d[0], 'fr')).toMatch(/colonne ignorée « Frame ».*« Réplicat \/ sous-échantillon »/);
    expect(renderConvertPlain(d[0], 'en')).not.toMatch(/change the repeated code/);
    expect(renderConvertTechnical(d[0])).toContain('"Frame"');
  });

  it('a wide sheet: the repeated sample code names the ignored column too', () => {
    const f = fileOf(['Sample', 'Station', 'Date', 'Pot', 'Calanus finmarchicus'], [['K1', 'S1', '2020-01-01', 'a', 4], ['K1', 'S1', '2020-01-01', 'b', 6]]);
    const r = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' } })] });
    const d = find(r.blocking, 'CONV-ID-DUPLICATE');
    expect(d[0].params).toMatchObject({ kind: 'event', column: 'Pot' });
  });

  it('no column is named when two ignored columns tell the rows apart, or none does, or the rows are identical', () => {
    const two = fileOf(['Sample', 'Station', 'Date', 'Pot', 'Tray', 'Calanus finmarchicus'], [['K1', 'S1', '2020-01-01', 'a', 'x', 4], ['K1', 'S1', '2020-01-01', 'b', 'y', 6]]);
    expect(find(convert({ sheets: [sheetInput(two, { quantity: { kind: 'count' } })] }).blocking, 'CONV-ID-DUPLICATE')[0].params.column).toBeUndefined();
    const same = fileOf(['Sample', 'Station', 'Date', 'Pot', 'Calanus finmarchicus'], [['K1', 'S1', '2020-01-01', 'a', 4], ['K1', 'S1', '2020-01-01', 'a', 6]]);
    const d = find(convert({ sheets: [sheetInput(same, { quantity: { kind: 'count' } })] }).blocking, 'CONV-ID-DUPLICATE')[0];
    expect(d.params.column).toBeUndefined();
    expect(renderConvertPlain(d, 'en')).toMatch(/change the repeated code/);
  });
});

describe('unique codes keep their IDs: the column stays ignored until the user confirms it', () => {
  it('Station | Sample | Replicate with unique sample codes: IDs as before, no replicate level', () => {
    const f = fileOf(['Station', 'Sample', 'Replicate', 'Date', 'Species', 'Count'], [['S1', 'S1-A', 'A', '2020-01-01', 'Calanus finmarchicus', 3], ['S1', 'S1-B', 'B', '2020-01-01', 'Calanus finmarchicus', 4]]);
    const r = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' }, shape: 'long' })] });
    expect(r.events.map((e) => [e.eventType, e.id])).toEqual([['station', 'S1'], ['sample', 'S1-A'], ['sample', 'S1-B']]);
    expect(find(r.findings, 'CONV-COLUMN-NOT-EXPORTED')).toEqual([]);
  });
});

describe('a numeric Replicate column (a variable to the proposer) still gets the hint', () => {
  it('long: the occurrence duplicate names it', () => {
    const f = fileOf(['Sample ID', 'Station', 'Date', 'Replicate', 'Species', 'Count'], [['A-2_5', 'A-2', '2015-03-04', 1, 'Asterias rubens', 4], ['A-2_5', 'A-2', '2015-03-04', 2, 'Asterias rubens', 2]]);
    const r = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' }, shape: 'long' })] });
    expect(find(r.blocking, 'CONV-ID-DUPLICATE')[0].params.column).toBe('Replicate');
  });
});

describe('a sheet without a replicate column is unchanged', () => {
  it('IDs are pinned', () => {
    const f = fileOf(['Sample', 'Station', 'Date', 'Species', 'Count'], [['A1', 'S1', '2020-01-01', 'Calanus finmarchicus', 3], ['A1', 'S1', '2020-01-01', 'Oithona similis', 4], ['A2', 'S1', '2020-01-02', 'Calanus finmarchicus', 5]]);
    const r = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' }, shape: 'long' })] });
    expect(r.events.map((e) => [e.eventType, e.id, e.parentId])).toEqual([['station', 'S1', undefined], ['sample', 'A1', 'S1'], ['sample', 'A2', 'S1']]);
    expect(r.occurrences.map((o) => o.id)).toEqual(['A1:Calanus finmarchicus', 'A1:Oithona similis', 'A2:Calanus finmarchicus']);
  });
});

describe('a replicate column that tells MOST repeated IDs apart is offered, with the number that would remain', () => {
  // five samples with the same taxon on frames A, B, C (five groups the Frame column tells apart) and one sample that has the same taxon on the same frame twice (a real duplicate in the source)
  const shape = (): Cell[][] => {
    const rows: Cell[][] = [];
    for (let i = 1; i <= 5; i++) for (const frame of ['A', 'B', 'C']) rows.push([`S${i}`, 'Stn', '2015-03-04', 5, frame, 'Asterias rubens', 3, 10]);
    rows.push(['S6', 'Stn', '2015-03-04', 5, 'A', 'Ophiura ophiura', 2, 8], ['S6', 'Stn', '2015-03-04', 5, 'A', 'Ophiura ophiura', 4, 9]);
    return rows;
  };
  const noRole = (rows: Cell[][]) => convert({ sheets: [sheetInput(fileOf(HEADER, rows), { quantity: { kind: 'count' }, shape: 'long' })] });

  it('before the role: the button is there (Frame tells 5 of 6 groups apart), and the text says 1 group would remain', () => {
    const d = find(noRole(shape()).blocking, 'CONV-ID-DUPLICATE');
    expect(d).toHaveLength(1);
    expect(d[0].params).toMatchObject({ kind: 'occurrence', count: 6, column: 'Frame', remaining: 1, separated: 5 });
    const text = renderConvertPlain(d[0], 'en');
    expect(text).toMatch(/tells the rows apart in 5 of 6/);
    expect(text).toMatch(/1 group of rows with the same sample, replicate and taxon would remain/);
    expect(renderConvertPlain(d[0], 'pl')).toMatch(/Zostanie 1 grupa wierszy/);
  });

  it('after the role: exactly one duplicate finding, with the new advice and the lines of the two rows', () => {
    const r = run(HEADER, shape());
    const d = find(r.blocking, 'CONV-ID-DUPLICATE');
    expect(d).toHaveLength(1);
    expect(d[0].lines).toEqual([17, 18]);
    expect(d[0].params).toMatchObject({ kind: 'occurrence', sameTaxon: 'yes', replicate: 'yes', rows: 2, count: 1 });
    expect(d[0].params.column).toBeUndefined();
    const en = renderConvertPlain(d[0], 'en');
    expect(en).toMatch(/Same sample, same replicate and same taxon in 2 rows: merge them into one row, or tell them apart/);
    expect(en).not.toMatch(/change the repeated code|prefix/);
    for (const lang of ['pl', 'de', 'fr'] as const) expect(renderConvertPlain(d[0], lang)).not.toMatch(/\{|\}/);
    expect(renderConvertPlain(d[0], 'pl')).toMatch(/w 2 wierszach/);
  });

  it('a sheet without a replicate role says "same sample and same taxon"', () => {
    const f = fileOf(['Sample ID', 'Station', 'Date', 'Species', 'Abundance'], [['S1', 'Stn', '2015-03-04', 'Asterias rubens', 3], ['S1', 'Stn', '2015-03-04', 'Asterias rubens', 4]]);
    const d = find(convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' }, shape: 'long' })] }).blocking, 'CONV-ID-DUPLICATE')[0];
    expect(d.params).toMatchObject({ sameTaxon: 'yes', rows: 2 });
    expect(d.params.replicate).toBeUndefined();
    expect(renderConvertPlain(d, 'en')).toMatch(/Same sample and same taxon in 2 rows/);
  });

  it('a column that tells apart less than 80 % of the groups is not offered', () => {
    const rows: Cell[][] = [];
    for (let i = 1; i <= 2; i++) for (const frame of ['A', 'B']) rows.push([`S${i}`, 'Stn', '2015-03-04', 5, frame, 'Asterias rubens', 3, 10]);
    for (let i = 3; i <= 5; i++) rows.push([`S${i}`, 'Stn', '2015-03-04', 5, 'A', 'Asterias rubens', 3, 10], [`S${i}`, 'Stn', '2015-03-04', 5, 'A', 'Asterias rubens', 4, 11]);
    expect(find(noRole(rows).blocking, 'CONV-ID-DUPLICATE')[0].params.column).toBeUndefined();
  });
});
