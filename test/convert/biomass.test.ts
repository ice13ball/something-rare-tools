// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A biomass / weight column next to a count column: an eMoF measurement of each occurrence, as given, never converted. The kind of mass (wet, dry, ash-free dry) decides the NERC S06
// concept; while it is open no measurementTypeID is written and CONV-BIOMASS-KIND-UNSET asks. Synthetic data only.
import { describe, expect, it } from 'vitest';
import { buildTables } from '../../src/core/convert/dwca';
import { convert } from '../../src/core/convert/build';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { EMPTY_METADATA } from '../../src/core/convert/metadata';
import { toDataset } from '../../src/core/convert/model';
import { biomassBasisOf, readConvertSettings, writeConvertSidecar } from '../../src/core/convert/settings';
import { judge } from '../../src/core/convert/policy';
import { parseFile } from '../../src/core/parse';
import type { ColumnRole, Finding } from '../../src/core/types';
import { renderConvertPlain } from '../../src/core/rules/convert';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const find = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id);
const HEADER = ['Sample ID', 'Station', 'Date', 'Depth [m]', 'Frame', 'Species', 'Abundance', 'Biomass [g]'];
const ROWS: Cell[][] = [
  ['A-2_5', 'A-2', '2015-03-04', 5, 'B', 'Asterias rubens', 4, 226.5],
  ['A-2_5', 'A-2', '2015-03-04', 5, 'A', 'Asterias rubens', 2, 124],
  ['A-2_5', 'A-2', '2015-03-04', 5, 'C', 'Ophiura ophiura', 1, 36],
];
const roleOf = (header: string[], rows: Cell[][], h: string) => proposeConvertColumns(fileOf(header, rows).sheets[0], { decimalComma: false, date1904: false }).find((p) => p.header === h)!;
const run = (header: string[], rows: Cell[][], edit: Record<string, ColumnRole> = {}) =>
  convert({ sheets: [sheetInput(fileOf(header, rows), { quantity: { kind: 'count' }, shape: 'long', edit: { Frame: { kind: 'replicate' }, ...edit } })] });

describe('recognition', () => {
  it('Biomass [g] next to Abundance is the biomass role, kind not chosen, low confidence', () => {
    const p = roleOf(HEADER, ROWS, 'Biomass [g]');
    expect(p.role).toEqual({ kind: 'biomass' });
    expect(p.confidence).toBe('low');
    expect(p.reasonCode).toBe('name-biomass');
  });

  it.each([
    ['Dry weight [mg]', 'dry'], ['Wet weight [g]', 'wet'], ['AFDW [mg]', 'afdw'], ['Ash-free dry weight', 'afdw'], ['Biomass (dry)', 'dry'], ['Wet mass', 'wet'], ['Masa sucha [g]', 'dry'],
    ['Biomasse', undefined], ['Biomasa', undefined], ['Weight [g]', undefined], ['Masa [g]', undefined],
  ] as const)('%s: biomass, kind %s', (h, basis) => {
    const header = ['Sample ID', 'Species', 'Abundance', h];
    const p = roleOf(header, [['S1', 'Asterias rubens', 3, 1.5]], h);
    expect(p.role).toEqual(basis === undefined ? { kind: 'biomass' } : { kind: 'biomass', basis });
    expect(p.confidence).toBe(basis === undefined ? 'low' : 'high');
  });

  it('without a count column the biomass word stays the quantity of the sheet, as before', () => {
    const p = roleOf(['Sample ID', 'Species', 'Biomass [g]'], [['S1', 'Asterias rubens', 1.5]], 'Biomass [g]');
    expect(p.role.kind).toBe('quantity');
  });

  it('a plain Weight column on a sheet without taxa and counts is not a biomass', () => {
    const p = roleOf(['Station', 'Temperature', 'Weight [kg]'], [['S1', 4.5, 3]], 'Weight [kg]');
    expect(p.role.kind).not.toBe('biomass');
  });

  it('weight loss and body mass index are not biomass names', () => {
    for (const h of ['Weight loss [g]', 'Body mass index']) expect(roleOf(['Sample ID', 'Species', 'Abundance', h], [['S1', 'Asterias rubens', 3, 1.5]], h).role.kind).not.toBe('biomass');
  });
});

describe('the measurement', () => {
  it('abundance stays organismQuantity and biomass is an eMoF row of each occurrence, value as given, unit from the header, no conversion', () => {
    const r = run(HEADER, ROWS, { 'Biomass [g]': { kind: 'biomass', basis: 'dry' } });
    expect(r.occurrences.map((o) => o.organismQuantity)).toEqual([4, 2, 1]);
    const m = r.measurements.filter((x) => x.role === 'biomass');
    expect(m).toHaveLength(3);
    expect(m.map((x) => x.target)).toEqual(r.occurrences.map((o) => ({ kind: 'occurrence', id: o.id })));
    expect(m.map((x) => x.measurementValue)).toEqual(['226.5', '124', '36']);
    expect(m.every((x) => x.measurementUnit === 'g')).toBe(true);
    expect(m.every((x) => x.measurementUnitId === 'http://vocab.nerc.ac.uk/collection/P06/current/UGRM/')).toBe(true);
  });

  it('kind unset: measurementType "biomass", no measurementTypeID, and one warning that asks (accept policy)', () => {
    const r = run(HEADER, ROWS, { 'Biomass [g]': { kind: 'biomass' } });
    const m = r.measurements.filter((x) => x.role === 'biomass');
    expect(m.every((x) => x.measurementType === 'biomass' && x.measurementTypeId === undefined)).toBe(true);
    const f = find(r.findings, 'CONV-BIOMASS-KIND-UNSET');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('warning');
    expect(f[0].params).toMatchObject({ count: 3, columns: 'Biomass [g]' });
    expect(judge(r.findings).acceptRules).toContain('CONV-BIOMASS-KIND-UNSET');
    expect(judge(r.findings).blocking.map((b) => b.ruleId)).not.toContain('CONV-BIOMASS-KIND-UNSET');
  });

  it.each([
    ['wet', 'S0600088', 'Wet weight biomass'],
    ['dry', 'S0600087', 'Dry weight biomass'],
    ['afdw', 'S0600086', 'Ash-free dry weight biomass'],
  ] as const)('kind %s: measurementTypeID is the NERC S06 concept %s and the warning is gone', (basis, code, label) => {
    const r = run(HEADER, ROWS, { 'Biomass [g]': { kind: 'biomass', basis } });
    const m = r.measurements.filter((x) => x.role === 'biomass');
    expect(m.every((x) => x.measurementTypeId === `http://vocab.nerc.ac.uk/collection/S06/current/${code}/` && x.measurementType === label)).toBe(true);
    expect(find(r.findings, 'CONV-BIOMASS-KIND-UNSET')).toEqual([]);
  });

  it('"Dry weight [mg]" pre-selects dry: converted with no edit, the concept is written and nothing is asked', () => {
    const header = ['Sample ID', 'Station', 'Date', 'Species', 'Abundance', 'Dry weight [mg]'];
    const rows: Cell[][] = [['S1', 'A', '2015-03-04', 'Asterias rubens', 3, 12.25]];
    const r = convert({ sheets: [sheetInput(fileOf(header, rows), { quantity: { kind: 'count' }, shape: 'long' })] });
    const m = r.measurements.filter((x) => x.role === 'biomass');
    expect(m).toHaveLength(1);
    expect(m[0].measurementTypeId).toContain('/S06/current/S0600087/');
    expect(m[0].measurementUnit).toBe('mg');
    expect(find(r.findings, 'CONV-BIOMASS-KIND-UNSET')).toEqual([]);
  });

  it('a column of the sheet that is not read as biomass is still said, and a biomass column is no longer said as "not written"', () => {
    const r = run(HEADER, ROWS, { 'Biomass [g]': { kind: 'biomass', basis: 'dry' } });
    expect(find(r.findings, 'CONV-COLUMN-NOT-EXPORTED')).toEqual([]);
    const ignored = run(HEADER, ROWS, { 'Biomass [g]': { kind: 'ignore' } });
    expect(find(ignored.findings, 'CONV-COLUMN-NOT-EXPORTED')).toHaveLength(1);
    expect(ignored.measurements.filter((x) => x.role === 'biomass')).toEqual([]);
  });

  it('empty and absent cells write nothing; a declared sample size is said only in measurementRemarks, nothing is converted', () => {
    const header = ['Sample ID', 'Station', 'Date', 'Species', 'Abundance', 'Area sampled [m2]', 'Wet weight [g]'];
    const rows: Cell[][] = [
      ['S1', 'A', '2015-03-04', 'Asterias rubens', 3, 0.0625, 7.5],
      ['S1', 'A', '2015-03-04', 'Ophiura ophiura', 2, 0.0625, null],
    ];
    const r = convert({ sheets: [sheetInput(fileOf(header, rows), { quantity: { kind: 'count', effort: { source: 'column' } }, shape: 'long' })] });
    const m = r.measurements.filter((x) => x.role === 'biomass');
    expect(m).toHaveLength(1);
    expect(m[0].measurementValue).toBe('7.5');
    expect(m[0].measurementRemarks).toBe('per sample of 0.0625 m2');
    const tables = buildTables(toDataset(r, EMPTY_METADATA, { fullList: false, prefixStation: false, worms: false, nvs: false }));
    expect(tables.emof?.columns.map((c) => c.header)).toContain('measurementRemarks');
  });
});

describe('the companion file remembers the kind', () => {
  it('biomassBasis=<kind>:<sheet> is written for a sheet whose biomass columns agree, and read back as a pre-pick', () => {
    const maps = [{ sheet: 'Data sheet', columns: [{ role: { kind: 'biomass', basis: 'dry' as const } }, { role: { kind: 'ignore' } }] }, { sheet: 'Other', columns: [{ role: { kind: 'biomass' as const } }] }];
    const entries = biomassBasisOf(maps);
    expect(entries).toEqual([{ sheet: 'Data sheet', basis: 'dry' }]);
    const csv = writeConvertSidecar({ biomassBasis: entries });
    expect(csv).toContain('biomassBasis=dry:Data sheet');
    const parsed = parseFile('companion.csv', new TextEncoder().encode(csv));
    expect(readConvertSettings(parsed)?.biomassBasis).toEqual([{ sheet: 'Data sheet', basis: 'dry' }]);
  });

  it('a sheet with a wet and a dry column keeps no sheet-wide kind, and an unknown kind in the file is ignored', () => {
    expect(biomassBasisOf([{ sheet: 'S', columns: [{ role: { kind: 'biomass', basis: 'wet' as const } }, { role: { kind: 'biomass', basis: 'dry' as const } }] }])).toEqual([]);
    const csv = writeConvertSidecar({}) + '"(setting)","biomassBasis=heavy:S","","",""\n';
    expect(readConvertSettings(parseFile('c.csv', new TextEncoder().encode(csv)))?.biomassBasis).toBeUndefined();
  });
});

describe('review fixes: units, clashes, per-area units, repeated user occurrenceID', () => {
  const header = ['Sample ID', 'Station', 'Date', 'Species', 'Abundance'];
  const one = (extraHeader: string[], extraRow: Cell[], quantity: object = { kind: 'count' }) =>
    convert({ sheets: [sheetInput(fileOf([...header, ...extraHeader], [['S1', 'A', '2015-03-04', 'Asterias rubens', 3, ...extraRow]]), { quantity: quantity as never, shape: 'long' })] });

  it('the unit gets its P06 id when the table knows it: g, mg, kg, g/m2; an unknown unit gets none', () => {
    const id = (unit: string) => one([`Dry weight [${unit}]`], [1.5]).measurements.find((x) => x.role === 'biomass')?.measurementUnitId?.split('/').slice(-2)[0];
    expect(id('g')).toBe('UGRM');
    expect(id('mg')).toBe('MGRM');
    expect(id('kg')).toBe('KGXX');
    expect(id('g/m2')).toBe('UGMS');
    expect(id('pounds')).toBeUndefined();
  });

  it('two biomass columns of one kind get distinct measurementType text; one column keeps the plain label', () => {
    const two = (basis?: 'dry') => {
      const role = basis === undefined ? { kind: 'biomass' as const } : { kind: 'biomass' as const, basis };
      const f = fileOf([...header, 'Mass A [g]', 'Mass B [mg]'], [['S1', 'A', '2015-03-04', 'Asterias rubens', 3, 1.5, 900]]);
      return convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' }, shape: 'long', edit: { 'Mass A [g]': role, 'Mass B [mg]': role } })] }).measurements.filter((x) => x.role === 'biomass').map((x) => x.measurementType);
    };
    expect(two('dry')).toEqual(['Dry weight biomass (Mass A)', 'Dry weight biomass (Mass B)']);
    expect(two()).toEqual(['biomass (Mass A)', 'biomass (Mass B)']);
    expect(one(['Dry weight [g]'], [1.5]).measurements.find((x) => x.role === 'biomass')?.measurementType).toBe('Dry weight biomass');
  });

  it('two columns that differ only by the unit are told apart by the whole header', () => {
    const f = fileOf([...header, 'Biomass [g m-2]', 'Biomass [kg]'], [['S1', 'A', '2015-03-04', 'Asterias rubens', 3, 1.5, 9]]);
    const r = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' }, shape: 'long', edit: { 'Biomass [g m-2]': { kind: 'biomass', basis: 'dry' }, 'Biomass [kg]': { kind: 'biomass', basis: 'dry' } } })] });
    expect(r.measurements.filter((x) => x.role === 'biomass').map((x) => x.measurementType)).toEqual(['Dry weight biomass (Biomass [g m-2])', 'Dry weight biomass (Biomass [kg])']);
  });

  it('no "per sample of" remark when the unit already says per area', () => {
    const h = ['Sample ID', 'Station', 'Date', 'Species', 'Abundance', 'Area sampled [m2]'];
    const run2 = (unit: string) => convert({ sheets: [sheetInput(fileOf([...h, `Wet weight [${unit}]`], [['S1', 'A', '2015-03-04', 'Asterias rubens', 3, 0.0625, 7.5]]), { quantity: { kind: 'count', effort: { source: 'column' } }, shape: 'long' })] });
    expect(run2('g').measurements.find((x) => x.role === 'biomass')?.measurementRemarks).toBe('per sample of 0.0625 m2');
    expect(run2('g/m2').measurements.find((x) => x.role === 'biomass')?.measurementRemarks).toBeUndefined();
  });

  it('a repeated value in the user\'s own occurrenceID column is said as that, not as "same sample, same taxon"', () => {
    const f = fileOf(['occurrenceID', 'Sample ID', 'Station', 'Date', 'Species', 'Abundance'], [['occ-1', 'S1', 'A', '2015-03-04', 'Asterias rubens', 3], ['occ-1', 'S2', 'A', '2015-03-05', 'Ophiura ophiura', 2]]);
    const d = find(convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' }, shape: 'long' })] }).blocking, 'CONV-ID-DUPLICATE');
    expect(d).toHaveLength(1);
    expect(d[0].params).toMatchObject({ userId: 'yes' });
    expect(d[0].params.sameTaxon).toBeUndefined();
    const en = renderConvertPlain(d[0], 'en');
    expect(en).toMatch(/occurrenceID column repeats a value/);
    expect(en).not.toMatch(/Same sample/);
    for (const lang of ['pl', 'de', 'fr'] as const) expect(renderConvertPlain(d[0], lang)).not.toMatch(/\{|\}/);
  });
});
