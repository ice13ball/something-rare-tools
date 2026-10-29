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
  ['S-1_6', 'S-1', '2010-12-06', 6, 'B', 'Sterechinus neumayeri', 4, 226],
  ['S-1_6', 'S-1', '2010-12-06', 6, 'A', 'Sterechinus neumayeri', 2, 124],
  ['S-1_6', 'S-1', '2010-12-06', 6, 'C', 'Psilaster charcoti', 1, 36],
];
const run = (header: string[], rows: Cell[][], edit: Record<string, { kind: 'ignore' } | { kind: 'replicate' }> = {}) => convert({ sheets: [sheetInput(fileOf(header, rows), { quantity: { kind: 'count' }, shape: 'long', edit })] });

describe('the role is proposed by the header', () => {
  const role = (header: string) => proposeConvertColumns(fileOf(['Station', header, 'Calanus finmarchicus'], [['S1', 'A', 4]]).sheets[0], { decimalComma: false, date1904: false }).find((p) => p.header === header)!;
  it.each(['Frame', 'Quadrat', 'Replicate', 'Rep.', 'Rep', 'Replica', 'Subsample', 'Sub-sample', 'Replicate no.', 'Replicate number', 'Frame 2', 'Powtórzenie', 'Ramka', 'Replikat', 'Réplicat', 'Wiederholung', 'Teilprobe'])('%s', (header) => {
    expect(role(header).role.kind).toBe('replicate');
    expect(role(header).reasonCode).toBe('name-replicate');
  });
  it('core and grab are proposed too, with low confidence', () => {
    expect(role('Core').role.kind).toBe('replicate');
    expect(role('Core').confidence).toBe('low');
    expect(role('Grab').confidence).toBe('low');
  });
  it.each(['Darwin Core', 'Core depth [m]', 'Grab sample volume', 'Frame rate', 'Replicates analysed', 'Repeat', 'Preparation'])('%s is not', (header) => {
    expect(role(header).role.kind).not.toBe('replicate');
  });
});

describe('a replicate column puts a level under the sample', () => {
  it('1 sample event, 3 replicate events, 3 occurrences with distinct IDs, no blocker', () => {
    const r = run(HEADER, ROWS);
    expect(r.blocking.filter((f) => ['CONV-ID-DUPLICATE', 'CONV-REPLICATE-MISSING', 'CONV-SAMPLE-CODE-MISSING'].includes(f.ruleId))).toEqual([]);
    const samples = r.events.filter((e) => e.eventType === 'sample');
    const reps = r.events.filter((e) => e.eventType === 'replicate');
    expect(samples.map((e) => [e.id, e.parentId])).toEqual([['S-1_6', 'S-1']]);
    expect(reps.map((e) => [e.id, e.parentId, e.code])).toEqual([['S-1_6:B', 'S-1_6', 'B'], ['S-1_6:A', 'S-1_6', 'A'], ['S-1_6:C', 'S-1_6', 'C']]);
    expect(r.events.map((e) => e.eventType)).toEqual(['station', 'sample', 'replicate', 'replicate', 'replicate']);
    expect(r.occurrences.map((o) => [o.id, o.eventId])).toEqual([
      ['S-1_6:B:Sterechinus neumayeri', 'S-1_6:B'],
      ['S-1_6:A:Sterechinus neumayeri', 'S-1_6:A'],
      ['S-1_6:C:Psilaster charcoti', 'S-1_6:C'],
    ]);
    expect(r.occurrences.map((o) => o.organismQuantity)).toEqual([4, 2, 1]);
  });

  it('the sample is derived from its replicates (date), the replicates keep their own data', () => {
    const r = run(HEADER, ROWS);
    const sample = r.events.find((e) => e.eventType === 'sample')!;
    expect(sample.eventDate).toBe('2010-12-06');
    expect(sample.derived.date).toBe(true);
    expect(r.events.filter((e) => e.eventType === 'replicate').every((e) => e.eventDate === '2010-12-06')).toBe(true);
    expect(r.stats.samples).toBeGreaterThan(0);
  });

  it('the tree summary counts the replicates, and is silent about them without a replicate column', () => {
    expect(run(HEADER, ROWS).tree.replicates).toBe(3);
    const none = run(HEADER.filter((h) => h !== 'Frame'), ROWS.map((r) => r.filter((_, i) => i !== 4)));
    expect(none.tree.replicates).toBeUndefined();
  });

  it('a blank replicate value blocks, naming the column and the rows', () => {
    const r = run(HEADER, [...ROWS, ['S-1_6', 'S-1', '2010-12-06', 6, null, 'Psilaster charcoti', 3, 5]]);
    const m = find(r.blocking, 'CONV-REPLICATE-MISSING');
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ field: 'Frame', lines: [5], params: { count: 1 } });
    expect(renderConvertPlain(m[0], 'en')).toMatch(/^1 row has no value in the replicate column "Frame" \(line 5\)/);
    expect(renderConvertPlain(m[0], 'pl')).toMatch(/^1 wiersz nie ma wartości w kolumnie powtórzeń „Frame” \(wiersz 5\)/);
    expect(renderConvertPlain(m[0], 'de')).toMatch(/^1 Zeile hat keinen Wert in der Replikatspalte „Frame“/);
    expect(renderConvertPlain(m[0], 'fr')).toMatch(/^1 ligne n'a pas de valeur dans la colonne des réplicats « Frame »/);
  });

  it('the same replicate twice in one sample is a real duplicate', () => {
    const r = run(HEADER, [...ROWS, ['S-1_6', 'S-1', '2010-12-06', 6, 'A', 'Sterechinus neumayeri', 9, 1]]);
    expect(find(r.blocking, 'CONV-ID-DUPLICATE').length).toBeGreaterThan(0);
  });

  it('a wide sheet: each row of a sample is a replicate, the species columns hang on it', () => {
    const f = fileOf(['Sample', 'Station', 'Date', 'Quadrat', 'Calanus finmarchicus', 'Oithona similis'], [['K1', 'S1', '2020-01-01', 1, 4, 5], ['K1', 'S1', '2020-01-01', 2, 6, 0]]);
    const r = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' } })] });
    expect(r.events.filter((e) => e.eventType === 'replicate').map((e) => [e.id, e.parentId])).toEqual([['K1:1', 'K1'], ['K1:2', 'K1']]);
    expect(r.occurrences.map((o) => o.id)).toEqual(['K1:1:Calanus finmarchicus', 'K1:1:Oithona similis', 'K1:2:Calanus finmarchicus']);
  });
});

describe('without the role, the duplicate names the column', () => {
  const ignored = { Frame: { kind: 'ignore' as const } };
  it('the occurrence IDs repeat and the message says which ignored column tells the rows apart', () => {
    const r = run(HEADER, ROWS, ignored);
    const d = find(r.blocking, 'CONV-ID-DUPLICATE');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ value: 'S-1_6:Sterechinus neumayeri', params: { kind: 'occurrence', column: 'Frame' } });
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

describe('a sheet without a replicate column is unchanged', () => {
  it('IDs are pinned', () => {
    const f = fileOf(['Sample', 'Station', 'Date', 'Species', 'Count'], [['A1', 'S1', '2020-01-01', 'Calanus finmarchicus', 3], ['A1', 'S1', '2020-01-01', 'Oithona similis', 4], ['A2', 'S1', '2020-01-02', 'Calanus finmarchicus', 5]]);
    const r = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' }, shape: 'long' })] });
    expect(r.events.map((e) => [e.eventType, e.id, e.parentId])).toEqual([['station', 'S1', undefined], ['sample', 'A1', 'S1'], ['sample', 'A2', 'S1']]);
    expect(r.occurrences.map((o) => o.id)).toEqual(['A1:Calanus finmarchicus', 'A1:Oithona similis', 'A2:Calanus finmarchicus']);
  });
});
