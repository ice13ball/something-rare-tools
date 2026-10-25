// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The four acceptance shapes of the converter core: W1 wide counts (full list), W2 wide density with stages and sp./cf., L1 long with
// the user's occurrenceID, L2 long without one but with a lifeStage column. Synthetic sheets only.
import { describe, expect, it } from 'vitest';
import { convert, listSplits } from '../../src/core/convert/build';
import type { ConvertInput } from '../../src/core/convert/build';
import { P01, P06 } from '../../src/core/convert/vocab';
import type { ApprovedSplits } from '../../src/core/convert/taxon';
import type { Finding } from '../../src/core/types';
import { L1_HEADER, L1_ROWS, L2_HEADER, L2_ROWS, W1_HEADER, W1_QUANTITY, W1_ROWS, W2_HEADER, W2_QUANTITY, W2_ROWS, fileOf, sheetInput } from './helpers';

const copy = (rows: (string | number | null)[][]) => rows.map((r) => [...r]);
const ids = (fs: Finding[]) => fs.map((f) => f.ruleId);
const find = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id);

/** The proposals of every changed split, approved as they are (what the page does when the user ticks them all). */
const approveAll = (input: Pick<ConvertInput, 'sheets'>): ApprovedSplits => Object.fromEntries(listSplits({ sheets: input.sheets }).filter((s) => s.needsDecision).map((s) => [s.verbatim, s.proposed]));

describe('W1: wide counts, full species list', () => {
  const file = fileOf(W1_HEADER, copy(W1_ROWS));
  const sheets = [sheetInput(file, { quantity: W1_QUANTITY })];

  it('is blocked until the split of "Pseudocalanus sp." is approved', () => {
    const r = convert({ sheets, options: { fullList: true } });
    expect(r.ok).toBe(false);
    const f = find(r.blocking, 'CONV-SPLIT-UNDECIDED');
    expect(f).toHaveLength(1);
    expect(f[0].value).toBe('Pseudocalanus sp.');
    expect(f[0].params.count).toBe(1);
    expect(r.splits.map((s) => [s.verbatim, s.needsDecision, s.approved])).toEqual([
      ['Calanus finmarchicus', false, false],
      ['Oithona similis', false, false],
      ['Pseudocalanus sp.', true, false],
    ]);
  });

  const r = convert({ sheets, options: { fullList: true }, approvedSplits: approveAll({ sheets }) });

  it('converts without a blocking finding once approved', () => {
    expect(r.blocking).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('builds the tree cruise > station > sample from the confirmed columns', () => {
    expect(r.events.map((e) => [e.id, e.eventType, e.parentId])).toEqual([
      ['CR1', 'cruise', undefined],
      ['CR1:S1', 'station', 'CR1'],
      ['CR1:S2', 'station', 'CR1'],
      ['S1-a', 'sample', 'CR1:S1'],
      ['S1-b', 'sample', 'CR1:S1'],
      ['S2-a', 'sample', 'CR1:S2'],
    ]);
    expect(r.events.find((e) => e.id === 'CR1')!.eventDate).toBe('2023-06-14/2023-06-16');
    expect(r.tree).toMatchObject({ cruises: 1, stations: 2, samples: 3 });
  });

  it('reads both depths of a sample from its raw cells', () => {
    const a = r.events.find((e) => e.id === 'S1-a')!;
    const b = r.events.find((e) => e.id === 'S1-b')!;
    expect([a.depthMin, a.depthMax, b.depthMin, b.depthMax]).toEqual([0, 25, 25, 50]);
    expect(r.events.find((e) => e.id === 'CR1:S1')).toMatchObject({ depthMin: 0, depthMax: 50 });
  });

  it('makes one occurrence per (sample row x taxon column x non-empty cell); empty and NA make none', () => {
    expect(r.occurrences.map((o) => o.id)).toEqual([
      'S1-a:Calanus finmarchicus',
      'S1-a:Oithona similis',
      'S1-a:Pseudocalanus sp.',
      'S1-b:Calanus finmarchicus',
      'S1-b:Pseudocalanus sp.',
      'S2-a:Oithona similis',
      'S2-a:Pseudocalanus sp.',
    ]);
    expect(r.stats).toMatchObject({ occurrences: 7, present: 6, absent: 1 });
  });

  it('writes counts as individualCount, organismQuantity and organismQuantityType "individuals"', () => {
    const o = r.occurrences.find((x) => x.id === 'S1-a:Calanus finmarchicus')!;
    expect(o).toMatchObject({ occurrenceStatus: 'present', individualCount: 10, organismQuantity: 10, organismQuantityType: 'individuals', scientificName: 'Calanus finmarchicus' });
  });

  it('the species header is the exact verbatimIdentification and "sp." goes to the qualifier', () => {
    const o = r.occurrences.find((x) => x.id === 'S1-b:Pseudocalanus sp.')!;
    expect(o).toMatchObject({ verbatimIdentification: 'Pseudocalanus sp.', scientificName: 'Pseudocalanus', identificationQualifier: 'sp.', individualCount: 3 });
  });

  it('a 0 on a full list is an absence: individualCount 0, no organismQuantity, no quantity eMoF', () => {
    const o = r.occurrences.find((x) => x.id === 'S1-a:Pseudocalanus sp.')!;
    expect(o).toMatchObject({ occurrenceStatus: 'absent', individualCount: 0 });
    expect(o.organismQuantity).toBeUndefined();
    expect(r.measurements.filter((m) => m.target.id === o.id)).toEqual([]);
  });

  it('writes a count eMoF (OCOUNT01, no unit id) on each present occurrence', () => {
    const counts = r.measurements.filter((m) => m.role === 'count');
    expect(counts).toHaveLength(6);
    expect(counts[0]).toMatchObject({ target: { kind: 'occurrence', id: 'S1-a:Calanus finmarchicus' }, measurementTypeId: P01.count.uri, measurementValue: '10' });
    expect(counts.every((m) => m.measurementUnitId === undefined)).toBe(true);
  });

  it('writes the effort on the sample event: sampleSizeValue / sampleSizeUnit and an effort eMoF (VOLWBSMP, m3)', () => {
    const e = r.events.find((x) => x.id === 'S1-a')!;
    expect([e.sampleSizeValue, e.sampleSizeUnit]).toEqual(['12.3', 'm3']);
    const eff = r.measurements.filter((m) => m.role === 'effort');
    expect(eff).toHaveLength(3);
    expect(eff[0]).toMatchObject({ target: { kind: 'event', id: 'S1-a' }, measurementTypeId: P01.volumeSampled.uri, measurementValue: '12.3', measurementUnit: 'm3', measurementUnitId: P06.m3.uri });
  });

  it('is deterministic: the same input gives the same output', () => {
    expect(JSON.stringify(convert({ sheets, options: { fullList: true }, approvedSplits: approveAll({ sheets }) }))).toBe(JSON.stringify(r));
  });
});

describe('W2: wide density with life stages and sp. / cf.', () => {
  const file = fileOf(W2_HEADER, copy(W2_ROWS));
  const sheets = [sheetInput(file, { quantity: W2_QUANTITY })];
  const approvedSplits = approveAll({ sheets });

  it('proposes four changed splits; each is one decision', () => {
    const l = listSplits({ sheets });
    expect(l.filter((s) => s.needsDecision).map((s) => s.verbatim)).toEqual(['Calanus finmarchicus c2', 'Calanus cf. glacialis', 'Augaptilus glacialis, c2', 'Pseudocalanus sp.']);
    expect(l.find((s) => s.verbatim === 'Augaptilus glacialis, c2')!.proposed).toEqual({ verbatimIdentification: 'Augaptilus glacialis, c2', scientificName: 'Augaptilus glacialis', lifeStage: 'C2' });
  });

  const r = convert({ sheets, approvedSplits });

  it('converts, with the zero skipped (not a full list) and counted as information', () => {
    expect(r.blocking).toEqual([]);
    const z = find(r.findings, 'CONV-ZERO-SKIPPED');
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ severity: 'info', params: { count: 1 } });
    expect(r.stats.zerosSkipped).toBe(1);
    expect(r.occurrences).toHaveLength(7);
  });

  it('writes stage and qualifier from the approved splits', () => {
    const o = (id: string) => r.occurrences.find((x) => x.id === id)!;
    expect(o('T1-1:Calanus finmarchicus c2')).toMatchObject({ scientificName: 'Calanus finmarchicus', lifeStage: 'C2' });
    expect(o('T1-1:Calanus cf. glacialis')).toMatchObject({ scientificName: 'Calanus glacialis', identificationQualifier: 'cf.', verbatimIdentification: 'Calanus cf. glacialis' });
    expect(o('T1-1:Augaptilus glacialis, c2')).toMatchObject({ scientificName: 'Augaptilus glacialis', lifeStage: 'C2' });
  });

  it('a density has no individualCount; its eMoF is SDBIOL01 with UPMM and the value as written', () => {
    const o = r.occurrences.find((x) => x.id === 'T1-1:Pseudocalanus sp.')!;
    expect(o.individualCount).toBeUndefined();
    expect(o.organismQuantity).toBeUndefined();
    expect(o.quantityText).toBe('40');
    const m = r.measurements.filter((x) => x.target.id === o.id);
    expect(m).toEqual([expect.objectContaining({ role: 'density', measurementTypeId: P01.densityVolume.uri, measurementValue: '40', measurementUnit: '#/m3', measurementUnitId: P06.perM3.uri })]);
    expect(r.measurements.find((x) => x.target.id === 'T1-1:Calanus finmarchicus c2')!.measurementValue).toBe('12.5');
  });

  it('on a full list the same zero is an absence with no individualCount (not a count) and no eMoF', () => {
    const full = convert({ sheets, approvedSplits, options: { fullList: true } });
    const a = full.occurrences.find((x) => x.id === 'T2-1:Calanus cf. glacialis')!;
    expect(a.occurrenceStatus).toBe('absent');
    expect(a.individualCount).toBeUndefined();
    expect(a.quantityText).toBe('0');
    expect(full.measurements.filter((m) => m.target.id === a.id)).toEqual([]);
    expect(find(full.findings, 'CONV-ZERO-SKIPPED')).toEqual([]);
  });

  it('an undecided split blocks, an edited approval is used', () => {
    expect(ids(convert({ sheets }).blocking)).toContain('CONV-SPLIT-UNDECIDED');
    const edited = { ...approvedSplits, 'Pseudocalanus sp.': { verbatimIdentification: 'Pseudocalanus sp.', scientificName: 'Pseudocalanus', identificationQualifier: 'spp.' } };
    const e = convert({ sheets, approvedSplits: edited });
    expect(e.occurrences.find((x) => x.id === 'T1-1:Pseudocalanus sp.')!.identificationQualifier).toBe('spp.');
  });

  it('two columns that give the same taxon in one sample are kept apart with the accepted warning, never summed', () => {
    const f = fileOf(['Sample', 'Station', 'Calanus finmarchicus c2', 'Calanus finmarchicus, c2'], [['X1', 'S', 3, 4]]);
    const s = [sheetInput(f, { quantity: { kind: 'count' } })];
    const res = convert({ sheets: s, approvedSplits: approveAll({ sheets: s }) });
    expect(res.occurrences.map((o) => [o.id, o.individualCount])).toEqual([['X1:Calanus finmarchicus c2', 3], ['X1:Calanus finmarchicus, c2', 4]]);
    const w = find(res.findings, 'CONV-TAXON-SAME-EVENT');
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ severity: 'warning', value: 'Calanus finmarchicus', params: { count: 2 } });
    expect(w[0].params.columns).toBe('Calanus finmarchicus c2, Calanus finmarchicus, c2');
    expect(res.blocking).toEqual([]);
  });
});

describe('L1: long with the user occurrenceID', () => {
  const file = fileOf(L1_HEADER, copy(L1_ROWS));
  const sheets = [sheetInput(file, { quantity: { kind: 'count' } })];
  const r = convert({ sheets });

  it('recognises DwC terms: shape long, occurrenceID kept as given, eventID is the sample', () => {
    expect(sheets[0].shape).toBe('long');
    expect(r.blocking).toEqual([]);
    expect(r.occurrences.map((o) => o.id)).toEqual(['occ-001', 'occ-002', 'occ-003']);
    expect(r.events.map((e) => [e.id, e.eventType, e.parentId])).toEqual([['E1', 'sample', undefined], ['E2', 'sample', undefined]]);
  });

  it('groups the rows of one eventID into one sample with its position, date and depth range', () => {
    const e1 = r.events.find((e) => e.id === 'E1')!;
    expect([e1.lat, e1.lon, e1.eventDate, e1.depthMin, e1.depthMax]).toEqual([54.1, 7.9, '2022-05-05', 0, 10]);
    expect(r.occurrences.filter((o) => o.eventId === 'E1')).toHaveLength(2);
  });

  it('long: one occurrence per row with a taxon and a value; a row with no value makes none', () => {
    const rows = copy(L1_ROWS);
    rows[1][3] = null;
    const f = fileOf(L1_HEADER, rows);
    const res = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' } })] });
    expect(res.occurrences.map((o) => o.id)).toEqual(['occ-001', 'occ-003']);
  });

  it('a repeated user occurrenceID blocks, naming the rows', () => {
    const rows = copy(L1_ROWS);
    rows[2][0] = 'occ-001';
    const f = fileOf(L1_HEADER, rows);
    const res = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' } })] });
    const d = find(res.blocking, 'CONV-ID-DUPLICATE');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ value: 'occ-001', lines: [2, 4], params: { kind: 'occurrence', count: 1 } });
  });

  it('a row whose eventID differs in position from another row of the same event blocks as a conflict', () => {
    const rows = copy(L1_ROWS);
    rows[1][4] = 54.2;
    const res = convert({ sheets: [sheetInput(fileOf(L1_HEADER, rows), { quantity: { kind: 'count' } })] });
    const c = find(res.blocking, 'CONV-SAMPLE-CONFLICT');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ value: 'E1', lines: [2, 3] });
  });
});

describe('L2: long without an occurrenceID, with a lifeStage column', () => {
  const file = fileOf(L2_HEADER, copy(L2_ROWS));
  const sheets = [sheetInput(file, { quantity: { kind: 'count' }, edit: { Stage: { kind: 'lifeStage' } } })];
  const r = convert({ sheets });

  it('builds the occurrenceID from the sample, the exact taxon cell and the lifeStage of the column', () => {
    expect(r.blocking).toEqual([]);
    expect(r.occurrences.map((o) => o.id)).toEqual([
      'A1:Calanus finmarchicus:C2',
      'A1:Calanus finmarchicus:C3',
      'A1:Oithona similis',
      'B1:Calanus finmarchicus:C2',
    ]);
    expect(r.occurrences[0]).toMatchObject({ lifeStage: 'C2', scientificName: 'Calanus finmarchicus', individualCount: 4 });
  });

  it('puts the station above the sample and the samples of one station together', () => {
    expect(r.events.map((e) => [e.id, e.parentId])).toEqual([['A', undefined], ['B', undefined], ['A1', 'A'], ['B1', 'B']]);
    expect(r.events.find((e) => e.id === 'A1')).toMatchObject({ lat: 70.1, lon: 20.2, depthMin: 5, depthMax: 5 });
  });

  it('one depth column gives min = max', () => {
    const b1 = r.events.find((e) => e.id === 'B1')!;
    expect([b1.depthMin, b1.depthMax]).toEqual([10, 10]);
  });

  it('the same sample and taxon twice with no life stage to tell them apart is an ID duplicate, not a sum', () => {
    const rows = copy(L2_ROWS);
    rows.push(['A', 'A1', 'Oithona similis', null, 2, 70.1, 20.2, '2021-08-01', 5]);
    const res = convert({ sheets: [sheetInput(fileOf(L2_HEADER, rows), { quantity: { kind: 'count' }, edit: { Stage: { kind: 'lifeStage' } } })] });
    const d = find(res.blocking, 'CONV-ID-DUPLICATE');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ value: 'A1:Oithona similis', lines: [4, 6] });
    expect(find(res.findings, 'CONV-TAXON-SAME-EVENT')).toEqual([]);
  });

  it('a qualifier or stage read from the taxon cell is a split to approve; a lifeStage column wins over it', () => {
    const f = fileOf(L2_HEADER, [['A', 'A1', 'Calanus finmarchicus c2', 'C3', 4, 70.1, 20.2, '2021-08-01', 5]]);
    const s = [sheetInput(f, { quantity: { kind: 'count' }, edit: { Stage: { kind: 'lifeStage' } } })];
    expect(ids(convert({ sheets: s }).blocking)).toEqual(['CONV-SPLIT-UNDECIDED']);
    const res = convert({ sheets: s, approvedSplits: approveAll({ sheets: s }) });
    expect(res.occurrences[0]).toMatchObject({ id: 'A1:Calanus finmarchicus c2:C3', scientificName: 'Calanus finmarchicus', lifeStage: 'C3' });
  });
});
