// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The third review of the role rules: every input that was wrong is a test here. Every row is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { perOccurrenceOf, readConvertSettings, writeConvertSidecar } from '../../src/core/convert/settings';
import { buildDataset } from '../../src/core/dataset';
import { parseFile } from '../../src/core/parse';
import { proposeLayout } from '../../src/core/recognize/layout';
import { renderConvertPlain } from '../../src/core/rules/convert';
import { createConvertHandler } from '../../src/worker/convert.handler';
import { rawSheet } from '../helpers/files';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const CTX = { decimalComma: false, date1904: false };
const N = (n: number, make: (i: number) => Cell[]): Cell[][] => Array.from({ length: n }, (_, i) => make(i));
const rolesOf = (header: string[], rows: Cell[][]) => Object.fromEntries(proposeConvertColumns(rawSheet(header, rows.map((r) => [...r])), CTX).map((p) => [p.header, p]));
const NAMES = ['Gadus morhua Linnaeus, 1758', 'Pleuragramma antarctica Boulenger, 1902', 'Trematomus scotti (Boulenger, 1907)', 'Acartia longiremis', 'Oithona similis', 'Calanus finmarchicus'];

describe('HIGH 1: a declared quantity does not turn a wide sheet with species columns into a long one', () => {
  const species = ['Calanus finmarchicus', 'Oithona similis', 'Acartia tonsa'];
  const wideHead = (lead: string, quantity: string) => ['Sample', 'Date', 'Latitude', 'Longitude', 'Depth', lead, quantity, ...species];
  const wideRows = (): Cell[][] => N(6, (i) => [`s${i}`, '2023-06-14', 55 + i / 10, 2.5, 10, NAMES[i], 10 + i, 3 + i, 2, 1 + (i % 3)]);
  it.each([['Dominant species', 'Abundance'], ['Dominant species', 'Count'], ['Dominant species', 'Biomass [mg/m3]']])('%s + %s stays wide', (lead, q) => {
    const r = rolesOf(wideHead(lead, q), wideRows());
    expect(r[lead].role.kind).toBe('ignore');
    for (const h of species) expect(r[h].role, h).toEqual({ kind: 'taxon', header: true });
  });
  it('the wide sheet gives 18 occurrences', () => {
    const file = fileOf(wideHead('Dominant species', 'Abundance'), wideRows());
    const c = convert({ sheets: [sheetInput(file, { shape: 'wide', quantity: { kind: 'count' } })], options: {} });
    expect(c.occurrences.length).toBe(18);
  });
  it('Prey, Count and three single genera stay wide', () => {
    const r = rolesOf(['Sample', 'Prey', 'Count', 'Calanus', 'Oithona', 'Acartia'], N(6, (i) => [`s${i}`, NAMES[i], i + 1, 3, 2, 1 + (i % 3)]));
    expect(r.Prey.role.kind).toBe('ignore');
    expect(r.Calanus.role).toEqual({ kind: 'taxon', header: true });
  });
  it('a single species_code or Mesh does not veto the long reading (b10 SpName)', () => {
    for (const extra of [['species_code'], ['Mesh'], ['species_code', 'Mesh', 'Transect']]) {
      const r = rolesOf(['Station', 'SpName', ...extra, 'Count'], N(6, (i) => ['S1', NAMES[i], ...extra.map(() => 100 + i), i + 1]));
      expect(r.SpName.role, extra.join()).toEqual({ kind: 'taxon' });
    }
  });
});

describe('HIGH 2: only the size of an organism moves; gear and surroundings block as on base', () => {
  const HEAD = ['Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'];
  const taxa = ['Calanus finmarchicus', 'Oithona similis', 'Acartia longiremis', 'Pseudocalanus acuspes', 'Metridia longa', 'Microcalanus pygmaeus', 'Oncaea borealis', 'Temora longicornis'];
  const run = (h: string, v: (i: number) => Cell) => {
    const file = fileOf([...HEAD, h], N(8, (i) => ['S1', '2023-06-14', 55, 2.5, taxa[i], i + 1, v(i)]));
    const role = proposeConvertColumns(file.sheets[0], CTX).find((p) => p.header === h)!.role;
    const c = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })], options: {} });
    return { role, c };
  };
  it.each(['Height above bottom [m]', 'Mesh size [µm]', 'Net diameter [cm]', 'Core diameter [cm]', 'Secchi depth [cm]', 'Sediment thickness [mm]', 'Grain size [µm]', 'Tow length [m]', 'Trawl width [m]', 'Wire length [m]', 'Transect length [m]', 'Sea ice thickness [cm]', 'Wave height [m]', 'Precip [mm]', 'Mouth area [cm]'])('%s blocks', (h) => {
    const { role, c } = run(h, (i) => 100 + 7.3 * i);
    expect(role.kind === 'variable' && role.perOccurrence, h).toBeFalsy();
    expect(c.findings.filter((f) => f.ruleId === 'CONV-SAMPLE-CONFLICT'), h).toHaveLength(1);
  });
  it.each(['Mean Length (µm)', 'Total length [mm]', 'L1 (µm)', 'L10 (µm)'])('%s still moves', (h) => {
    const { role, c } = run(h, (i) => 100 + 7.3 * i);
    expect(role, h).toMatchObject({ kind: 'variable', perOccurrence: true });
    expect(c.findings.some((f) => f.ruleId === 'CONV-SAMPLE-CONFLICT')).toBe(false);
  });
  it('a length with values repeated inside the samples (under half distinct) blocks: the floor', () => {
    const { role } = run('Length [mm]', (i) => (i % 2 === 0 ? 10 : 12));
    expect(role.kind === 'variable' && role.perOccurrence).toBeFalsy();
  });
  it('two rows under one code (Secchi 7 and 3) block', () => {
    const file = fileOf([...HEAD, 'Secchi [m]'], [['S1', '2023-06-14', 55, 2.5, taxa[0], 1, 7], ['S1', '2023-06-14', 55, 2.5, taxa[1], 2, 3]]);
    const c = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })], options: {} });
    expect(c.findings.filter((f) => f.ruleId === 'CONV-SAMPLE-CONFLICT')).toHaveLength(1);
  });
  it.each(['Oxy sat [%]', 'Turb', 'Fluor', 'PAR', 'CTD temp [degC]', 'O2 [ml/l]'])('noisy decimals of %s do not move', (h) => {
    const { role } = run(h, (i) => 3.1 + 0.137 * i);
    expect(role.kind === 'variable' && role.perOccurrence, h).toBeFalsy();
  });
});

describe('MEDIUM 3: a column that is a function of the taxon is ignored with its reason', () => {
  const HEAD = ['Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'];
  const taxa = ['Calanus finmarchicus', 'Oithona similis', 'Acartia longiremis', 'Pseudocalanus acuspes'];
  const code = (t: string): number => 1000 + taxa.indexOf(t) * 37;
  it.each(['species_code', 'TSN', 'Trophic level'])('%s', (h) => {
    const rows = N(8, (i) => [`s${i < 4 ? 1 : 2}`, '2023-06-14', 55, 2.5, taxa[i % 4], i + 1, code(taxa[i % 4])]);
    const r = rolesOf([...HEAD, h], rows);
    expect(r[h].role.kind).toBe('ignore');
    expect(r[h].reasonCode).toBe('taxon-attribute');
    const file = fileOf([...HEAD, h], rows);
    const c = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })], options: {} });
    expect(c.measurements.filter((m) => m.role === 'variable')).toEqual([]);
  });
  it('a value of the sample that happens to follow the taxa (constant in each sample) is not an attribute of the taxon', () => {
    const rows = N(8, (i) => [`s${i < 4 ? 1 : 2}`, '2023-06-14', 55, 2.5, i < 4 ? taxa[i] : taxa[i - 4], i + 1, i < 4 ? 5 : 9]);
    const r = rolesOf([...HEAD, 'Secchi [m]'], rows);
    expect(r['Secchi [m]'].reasonCode).not.toBe('taxon-attribute');
  });
});

describe('MEDIUM 4: the tick persists in the companion file and is hidden where it has no effect', () => {
  it('the sidecar holds only what differs from the proposal and reads back', () => {
    const mappings = [{ sheet: 'S1', columns: [{ index: 0, header: 'Mean Length (µm)', role: { kind: 'variable', perOccurrence: true as const } }, { index: 1, header: 'Spine: count', role: { kind: 'variable', perOccurrence: true as const } }, { index: 2, header: 'Same', role: { kind: 'variable' } }, { index: 3, header: 'Taken back', role: { kind: 'variable' } }] }];
    const proposals = { S1: [{ index: 0, role: { kind: 'variable', perOccurrence: true as const } }, { index: 1, role: { kind: 'variable' } }, { index: 2, role: { kind: 'variable' } }, { index: 3, role: { kind: 'variable', perOccurrence: true as const } }] };
    const ticks = perOccurrenceOf(mappings, proposals);
    expect(ticks).toEqual([{ sheet: 'S1', header: 'Spine: count', on: true }, { sheet: 'S1', header: 'Taken back', on: false }]);
    const text = writeConvertSidecar({ perOccurrence: ticks });
    const parsed = readConvertSettings(parseFile('side.csv', new TextEncoder().encode(text)));
    expect(parsed?.perOccurrence).toEqual(ticks);
  });

  it('dropped again with its companion file, the sheet gets the tick and the untick back', () => {
    const csv = 'Station,Date,Latitude,Longitude,Species,Count,Spine count,Mean Length (µm)\n' + [0, 1, 2, 3].map((i) => `S1,2023-06-14,55,2.5,${['Calanus finmarchicus', 'Oithona similis', 'Acartia longiremis', 'Pseudocalanus acuspes'][i]},${i + 1},${20 + 3 * i},${100 + 7 * i}`).join('\n') + '\n';
    const side = writeConvertSidecar({ perOccurrence: [{ sheet: 'data.csv', header: 'Spine count', on: true }, { sheet: 'data.csv', header: 'Mean Length (µm)', on: false }] });
    const h = createConvertHandler();
    const res = h.handle({ type: 'parse', files: [{ name: 'data.csv', bytes: new TextEncoder().encode(csv), source: 'dropped' }, { name: 'data.sidecar.csv', bytes: new TextEncoder().encode(side), source: 'dropped' }] } as never) as { files: { mappings: { columns: { header: string; role: { kind: string; perOccurrence?: true } }[] }[] }[] };
    const cols = res.files[0].mappings[0].columns;
    expect(cols.find((c) => c.header === 'Spine count')!.role.perOccurrence).toBe(true);
    expect(cols.find((c) => c.header === 'Mean Length (µm)')!.role.perOccurrence).toBeUndefined();
  });
});

describe('LOW: a year-only date contradicted by a zone-stated time is reported', () => {
  it('2011 with a time in 2015', () => {
    const t = 'Station,Date,Time,Temp\nS1,2011,2015-10-06T20:00:00Z,4.1\nS1,2011,2011-03-06T20:00:00Z,4.2\n';
    const file = parseFile('t.csv', new TextEncoder().encode(t));
    const { dataset, findings } = buildDataset(file, proposeLayout(file), [], [], 'x');
    expect(findings.filter((f) => f.ruleId === 'ROW-TIME-OTHER-DAY').map((f) => f.value)).toEqual(['2015-10-06T20:00:00Z']);
    expect(dataset.rows[0].datetime?.iso).toBe('2011');
  });
});

describe('LOW: the offer of the tick is not made for a descriptor of the sample', () => {
  const HEAD = ['Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'];
  const taxa = ['Calanus finmarchicus', 'Oithona similis', 'Acartia longiremis', 'Pseudocalanus acuspes'];
  const conflictOf = (h: string) => {
    const file = fileOf([...HEAD, h], N(4, (i) => ['S1', '2023-06-14', 55, 2.5, taxa[i], i + 1, i < 2 ? 1 : 2]));
    return convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })], options: {} }).findings.find((f) => f.ruleId === 'CONV-SAMPLE-CONFLICT');
  };
  it('Tow: no offer; Secchi [m]: the offer names the column', () => {
    const tow = conflictOf('Tow [#]');
    if (tow !== undefined) {
      expect(tow.params.organism).toBeUndefined();
      expect(renderConvertPlain(tow, 'en')).not.toContain('of each organism');
    }
    const secchi = conflictOf('Secchi [m]')!;
    expect(secchi.params.organism).toBe('Secchi [m]');
    expect(renderConvertPlain(secchi, 'en')).toContain('of each organism');
    for (const l of ['pl', 'de', 'fr'] as const) expect(renderConvertPlain(secchi, l)).toContain('Secchi [m]');
  });
});
