// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Named cases for the capture-and-replay gate (docs/superpowers/specs/2026-11-19-convert-restructuring-design.md section 2): paths through convert() that carry a person's answers or a second pass,
// which the older tests reach only in part. Each is recorded by `npm run convert:record`, so a later restructuring is compared on it. Every value is invented. Each case states what it must
// show (the pass count, a finding id, the rows written), so it cannot pass by "does not throw".
import { describe, expect, it } from 'vitest';
import { convert, countTextKey, listSplits, passCounter } from '../../src/core/convert/build';
import type { ConvertInput, ConvertSheetInput } from '../../src/core/convert/build';
import { pivotConvertFile } from '../../src/core/convert/pivot';
import { joinInputs } from '../../src/core/convert/sampleJoin';
import { turnConvertFile } from '../../src/core/convert/turn';
import type { Finding } from '../../src/core/types';
import { xlsxFile } from '../helpers/files';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';
import { descriptionInput, resultsInput } from './joinFixtures';

const find = (fs: readonly Finding[], id: string): Finding[] => fs.filter((f) => f.ruleId === id);
/** convert() and the number of passes it ran (the count of passCounter before and after). */
function counted(input: ConvertInput): { result: ReturnType<typeof convert>; passes: number } {
  const before = passCounter.count;
  const result = convert(input);
  return { result, passes: passCounter.count - before };
}

const WIDE_HEADER = ['Cruise', 'Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'Oithona similis', 'Calanus finmarchicus'];
const WIDE_ROWS = (): Cell[][] => [
  ['CR', 'S1', 'a', 50.2, 1.6, '2020-05-01', 5, 3],
  ['CR', 'S2', 'b', 50.3, 1.5, '2020-05-02', 'absent', 4],
  ['CR', 'S3', 'c', 50.4, 1.4, '2020-05-03', 'nie stwierdzono', 'absent'],
  ['CR', 'S4', 'd', 50.5, 1.3, '2020-05-04', 8, 2],
];
const wide = (extra: Partial<ConvertSheetInput> = {}): ConvertSheetInput => sheetInput(fileOf(WIDE_HEADER, WIDE_ROWS()), { quantity: { kind: 'count' }, ...extra });

describe('replay case: a stale count answer asks again', () => {
  it('a per-text answer whose count no longer holds adds a pass and the text is asked again', () => {
    const key = countTextKey(6, 'nie stwierdzono');
    const fresh = counted({ sheets: [wide({ countTexts: { [key]: { answer: 'absence', count: 1 } } })], options: {} });
    expect(fresh.passes).toBe(1);
    expect(find(fresh.result.findings, 'CONV-COUNT-TEXT-DECIDED').map((f) => f.value)).toContain('nie stwierdzono');
    const stale = counted({ sheets: [wide({ countTexts: { [key]: { answer: 'absence', count: 7 } } })], options: {} });
    expect(stale.passes).toBe(2);
    expect(find(stale.result.findings, 'CONV-TEXT-IN-TAXON-CELL').map((f) => f.value)).toContain('nie stwierdzono');
    expect(find(stale.result.findings, 'CONV-COUNT-TEXT-DECIDED').map((f) => f.value)).not.toContain('nie stwierdzono');
    expect(find(stale.result.findings, 'CONV-TEXT-IN-TAXON-CELL').every((f) => f.severity === 'warning')).toBe(true);
  });

  it('a column answer whose count no longer holds adds a pass and asks the column again', () => {
    const ok = counted({ sheets: [wide({ countTextColumns: { 6: { answer: 'absence', count: 2 } } })], options: {} });
    expect(ok.passes).toBe(1);
    expect(find(ok.result.findings, 'CONV-COUNT-TEXT-DECIDED').some((f) => f.params.via === 'column')).toBe(true);
    const stale = counted({ sheets: [wide({ countTextColumns: { 6: { answer: 'absence', count: 9 } } })], options: {} });
    expect(stale.passes).toBe(2);
    expect(find(stale.result.findings, 'CONV-COUNT-TEXT-DECIDED').some((f) => f.params.via === 'column')).toBe(false);
    expect(find(stale.result.findings, 'CONV-TEXT-IN-TAXON-CELL').length).toBeGreaterThan(0);
  });
});

describe('replay case: a leave-out and a stale count answer together', () => {
  const rows = (): Cell[][] => [
    ['CR', 'S1', 'a', 50.2, 1.6, '2020-05-01', 5, 3],
    ['CR', 'S2', 'b', 50.3, 1.5, '2020-05-02', 'absent', 4],
    ['CR', 'S3', 'c', 50.4, 1.4, null, 'absent', 2],
    ['CR', 'S4', 'd', 50.5, 1.3, '2020-05-04', 8, 2],
  ];
  const input = (count: number): ConvertInput => ({
    sheets: [sheetInput(fileOf(WIDE_HEADER, rows()), { quantity: { kind: 'count' }, leaveOut: [{ reason: 'no-event-date', count: 1 }], countTexts: { [countTextKey(6, 'absent')]: { answer: 'absence', count } } })],
  });

  it('the answer counted after the undated sample is gone holds in two passes; the one counted before it is stale and takes a third', () => {
    const holds = counted(input(1));
    expect(holds.passes).toBe(2);
    expect(find(holds.result.findings, 'CONV-COUNT-TEXT-DECIDED').map((f) => f.value)).toEqual(['absent']);
    const stale = counted(input(2));
    expect(stale.passes).toBe(3);
    expect(find(stale.result.findings, 'CONV-TEXT-IN-TAXON-CELL').map((f) => f.value)).toEqual(['absent']);
    expect(find(stale.result.findings, 'CONV-ROW-LEFT-OUT')[0].params).toMatchObject({ reason: 'no-event-date', count: 1 });
  });
});

describe('replay case: leave-outs and repeated identifiers', () => {
  const H = ['Sample', 'Station', 'Taxon', 'Count', 'Latitude', 'Longitude', 'Date'];
  const part = (rows: Cell[][], extra: Partial<ConvertSheetInput> = {}, name = 'Counts'): ConvertSheetInput =>
    sheetInput(fileOf(H, rows, name, { fileName: `${name}.csv` }), { shape: 'long', quantity: { kind: 'count' }, ...extra });

  it('a no-event-date leave-out where two sheets share an eventID runs a second pass and keeps the dated rows of both', () => {
    const a = part([['a1', 'ST1', 'Calanus finmarchicus', 3, 55.1, 3.2, '2023-04-05'], ['a2', 'ST1', 'Oithona similis', 2, 55.1, 3.2, '2023-04-05']], {}, 'North');
    const b = part([['b1', 'ST1', 'Calanus finmarchicus', 4, 55.2, 3.3, '2023-04-06'], ['b2', 'ST2', 'Oithona similis', 1, 55.3, 3.4, null]], { leaveOut: [{ reason: 'no-event-date', count: 1 }] }, 'South');
    const asked = counted({ sheets: [a, part([['b1', 'ST1', 'Calanus finmarchicus', 4, 55.2, 3.3, '2023-04-06'], ['b2', 'ST2', 'Oithona similis', 1, 55.3, 3.4, null]], {}, 'South')] });
    expect(find(asked.result.findings, 'CONV-EVENT-DATE-MISSING')).toHaveLength(1);
    const left = counted({ sheets: [a, b] });
    expect(left.passes).toBeGreaterThanOrEqual(2);
    expect(find(left.result.findings, 'CONV-EVENT-DATE-MISSING')).toEqual([]);
    expect(find(left.result.findings, 'CONV-ROW-LEFT-OUT')[0].params).toMatchObject({ reason: 'no-event-date', count: 1 });
    expect(left.result.occurrences.map((o) => o.id)).not.toContain('b2:Oithona similis');
    expect(left.result.occurrences.length).toBe(asked.result.occurrences.length - 1);
  });

  it('the same occurrenceID in two sheets is named, not merged', () => {
    const header = ['occurrenceID', 'eventID', 'scientificName', 'individualCount', 'decimalLatitude', 'decimalLongitude', 'eventDate'];
    const one = sheetInput(fileOf(header, [['occ-1', 'E1', 'Calanus finmarchicus', 5, 54.1, 7.9, '2022-05-05']], 'One', { fileName: 'one.csv' }), { shape: 'long', quantity: { kind: 'count' } });
    const two = sheetInput(fileOf(header, [['occ-1', 'E2', 'Oithona similis', 7, 54.2, 8.0, '2022-05-06']], 'Two', { fileName: 'two.csv' }), { shape: 'long', quantity: { kind: 'count' } });
    const r = convert({ sheets: [one, two] });
    expect(find(r.findings, 'CONV-ID-DUPLICATE').length).toBeGreaterThan(0);
    expect(r.ok).toBe(false);
    expect(r.occurrences.filter((o) => o.id === 'occ-1').length).toBeGreaterThan(0);
  });
});

describe('replay case: the same taxon twice in a wide sheet', () => {
  it('two columns that name one taxon are kept apart with a warning, never summed', () => {
    const f = fileOf(['Sample', 'Station', 'Calanus finmarchicus c2', 'Calanus finmarchicus, c2', 'Latitude', 'Longitude', 'Date'], [['X1', 'S', 3, 4, 55.1, 3.2, '2023-04-05']]);
    const sheets = [sheetInput(f, { quantity: { kind: 'count' } })];
    const approvedSplits = Object.fromEntries(listSplits({ sheets }).filter((s) => s.needsDecision).map((s) => [s.verbatim, s.proposed]));
    const r = convert({ sheets, approvedSplits });
    expect(r.occurrences.map((o) => [o.id, o.individualCount])).toEqual([['X1:Calanus finmarchicus c2', 3], ['X1:Calanus finmarchicus, c2', 4]]);
    const w = find(r.findings, 'CONV-TAXON-SAME-EVENT');
    expect(w).toHaveLength(1);
    expect(w[0].params.count).toBe(2);
  });
});

describe('replay case: several sheets of one book', () => {
  it('a profile sheet and a biology sheet: the profile gives measurements, the biology gives occurrences', () => {
    const bio = sheetInput(fileOf(['Sample', 'Station', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus'], [['A', 'S', 55, 3, '2023-04-05', 4]], 'Bio', { fileName: 'bio.csv' }), { quantity: { kind: 'count' } });
    const profile = sheetInput(fileOf(['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Temperature [degC]', 'Salinity'], [['C1', '2023-04-05', 55, 3, 5, 8.1, 34.2], ['C1', '2023-04-05', 55, 3, 10, 7.9, 34.4]], 'CTD', { fileName: 'ctd.csv' }), { profile: { depthIds: true } });
    const r = convert({ sheets: [bio, profile] });
    expect(r.occurrences.map((o) => o.id)).toEqual(['A:Calanus finmarchicus']);
    expect(r.measurements.length).toBeGreaterThanOrEqual(4);
    expect(r.findings.map((f) => f.ruleId)).not.toContain('CONV-ENV-ONLY-SHEET');
  });

  it('a sample join: results and descriptions are read as one sheet, the answer is carried through', () => {
    const file = xlsxFile('book.xlsx', {
      Counts: [['Sample', 'Taxon', 'Count'], ['T1', 'Calanus finmarchicus', 4], ['T2', 'Oithona similis', 2]],
      Samples: [['Sample', 'Date', 'Latitude', 'Longitude'], ['T1', '2021-05-03', 61.1, 4.2], ['T2', null, 61.3, 4.6]],
    });
    const inputs = [resultsInput(file, 'Counts'), descriptionInput(file, 'Samples')];
    const request = { results: 0, description: 1, keys: [{ results: 0, description: 0 }], conflicts: [] };
    const asked = counted({ sheets: joinInputs(inputs, [request], []).sheets });
    expect(find(asked.result.findings, 'CONV-EVENT-DATE-MISSING')[0].params).toMatchObject({ joined: 'yes', description: 'Samples' });
    const left = counted({ sheets: joinInputs([resultsInput(file, 'Counts', { leaveOut: [{ reason: 'no-event-date', count: 1 }] }), inputs[1]], [request], []).sheets });
    expect(left.passes).toBeGreaterThanOrEqual(2);
    expect(find(left.result.findings, 'CONV-ROW-LEFT-OUT')[0].params).toMatchObject({ reason: 'no-event-date', count: 1 });
    expect(left.result.occurrences.map((o) => o.id)).toEqual(['T1:Calanus finmarchicus']);
    expect(left.result.ok).toBe(true);
  });
});

describe('replay case: a turned sheet and a pivoted sheet', () => {
  it('a sheet whose samples are the columns is turned, read, and every finding points back at the source', () => {
    const raw = xlsxFile('taxa.xlsx', { Taxa: [['Taxon', 'S1', 'S2', 'Total'], ['Calanus finmarchicus', 4, 0, 4], ['Oithona similis', 1, 2, 3]], Samples: [['Sample', 'Date', 'Latitude', 'Longitude'], ['S1', '2023-04-05', 55.1, 2.1], ['S2', '2023-04-06', 55.2, 2.2]] });
    const file = turnConvertFile(raw, { Taxa: { nameColumn: 0, notSamples: [3] } });
    const of = (name: string) => ({ ...file, sheets: file.sheets.filter((s) => s.name === name) });
    const inputs = [sheetInput(of('Taxa'), { shape: 'wide', quantity: { kind: 'count' } }), sheetInput(of('Samples'))];
    expect(file.sheets.find((s) => s.name === 'Taxa')?.turn).toBeDefined();
    const out = joinInputs(inputs, [{ results: 0, description: 1, keys: [{ results: 0, description: 0 }], conflicts: [] }], []);
    const r = convert({ sheets: out.sheets });
    expect(r.occurrences.map((o) => o.id)).toEqual(expect.arrayContaining(['S1:Calanus finmarchicus', 'S2:Oithona similis']));
    expect(r.events.filter((e) => e.eventType === 'sample').map((e) => e.id)).toEqual(['S1', 'S2']);
  });

  it('a long environmental sheet is pivoted, the cells keep their source lines, and it converts as a profile', () => {
    const header = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Parameter', 'Unit', 'Value'];
    const rows: Cell[][] = [
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Temperature', 'degC', '8.10'],
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Salinity', 'PSU', 34.2],
      ['ZL1', '2023-06-14', 55.5, 2.5, 10, 'Temperature', 'degC', 7.9],
      ['ZL1', '2023-06-14', 55.5, 2.5, 10, 'Salinity', 'PSU', 34.4],
    ];
    const file = pivotConvertFile(fileOf(header, rows));
    expect(file.sheets[0].pivot).toMatchObject({ rowsIn: 4, samples: 2 });
    const r = convert({ sheets: [sheetInput(file, { profile: { depthIds: true } })] });
    expect(r.findings.map((f) => f.ruleId)).toContain('CONV-LONG-READ');
    expect(r.measurements.length).toBeGreaterThanOrEqual(4);
  });
});
