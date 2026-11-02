// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The second review of the role rules: every input that was wrong is a test here. Every row is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { renderConvertPlain } from '../../src/core/rules/convert';
import { runChecks } from '../../src/core/checks/run';
import { renderPlain } from '../../src/core/report';
import { makeDataset } from '../helpers/build';
import { LANGS } from '../../src/core/types';
import type { ColumnRole } from '../../src/core/types';
import { rawSheet } from '../helpers/files';
import { buildDataset } from '../../src/core/dataset';
import { parseFile } from '../../src/core/parse';
import { proposeLayout } from '../../src/core/recognize/layout';
import { proposeColumns } from '../../src/core/recognize/columns';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const CTX = { decimalComma: false, date1904: false };
const TAXA = ['Calanus finmarchicus', 'Oithona similis', 'Acartia longiremis', 'Pseudocalanus acuspes', 'Metridia longa', 'Microcalanus pygmaeus', 'Oncaea borealis', 'Temora longicornis'];
const HEAD = ['Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'];
const row = (i: number, extra: Cell[]): Cell[] => ['S1', '2023-06-14', 55, 2.5, TAXA[i], i + 1, ...extra];
const run = (extraHead: string[], vals: (i: number) => Cell[], edit?: Record<string, ColumnRole>) => {
  const file = fileOf([...HEAD, ...extraHead], Array.from({ length: 8 }, (_, i) => row(i, vals(i))));
  const roles = proposeConvertColumns(file.sheets[0], CTX);
  const c = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' }, ...(edit ? { edit } : {}) })], options: {} });
  return { roles, c };
};
const conflict = (c: ReturnType<typeof run>['c']) => c.findings.filter((f) => f.ruleId === 'CONV-SAMPLE-CONFLICT');

describe('HIGH: a value that differs inside one sample keeps blocking, unless it is plainly a value of each organism', () => {
  const cases: [string, (i: number) => Cell][] = [
    ['Secchi [m]', (i) => (i < 4 ? 3 : 7)],
    ['Bottom temp [degC]', (i) => (i < 4 ? 10 : 12)],
    ['Secchi [m]', (i) => (i === 5 ? 33 : 3)],
    ['Oxy sat [%]', (i) => (i < 4 ? 90 : 95)],
    ['Flow rate', (i) => (i < 4 ? 1.5 : 2.5)],
    ['WTemp', (i) => (i < 4 ? 10 : 12)],
    ['Tow speed [kn]', (i) => (i < 4 ? 2.5 : 3)],
  ];
  it.each(cases)('%s (two readings under one sample code) blocks, names the column, and is not moved', (h, v) => {
    const { roles, c } = run([h], (i) => [v(i)]);
    const role = roles.find((r) => r.header === h)!.role;
    expect(role.kind === 'variable' && role.perOccurrence, h).toBeFalsy();
    expect(conflict(c), h).toHaveLength(1);
    expect(String(conflict(c)[0].params.what)).toContain(h);
    for (const lang of LANGS) expect(renderConvertPlain(conflict(c)[0], lang)).toContain(h);
    expect(c.measurements.filter((m) => m.role === 'variable' && m.target.kind === 'occurrence')).toEqual([]);
  });

  it('lengths of each organism still move, with a finding that lists the columns', () => {
    const { roles, c } = run(['Mean Length (µm)', 'L1 (µm)'], (i) => [150 + 7 * i, 100 + 11 * i]);
    for (const h of ['Mean Length (µm)', 'L1 (µm)']) expect(roles.find((r) => r.header === h)!.role).toMatchObject({ perOccurrence: true });
    expect(conflict(c)).toEqual([]);
    const f = c.findings.find((x) => x.ruleId === 'CONV-VALUE-PER-OCCURRENCE')!;
    expect(f.params.columns).toBe('Mean Length (µm), L1 (µm)');
    for (const lang of LANGS) expect(renderConvertPlain(f, lang), lang).toContain('L1 (µm)');
  });

  it('a column whose values are nearly all different inside the samples moves without a size word or a length unit', () => {
    const { roles, c } = run(['Spine count'], (i) => [20 + 3 * i]);
    expect(roles.find((r) => r.header === 'Spine count')!.role).toMatchObject({ perOccurrence: true });
    expect(conflict(c)).toEqual([]);
  });

  it('the tick "of each organism" can be taken back: the column blocks again', () => {
    const { c } = run(['Mean Length (µm)'], (i) => [150 + 7 * i], { 'Mean Length (µm)': { kind: 'variable', variable: 'Mean Length', unit: 'µm' } });
    expect(conflict(c)).toHaveLength(1);
  });
});

describe('MEDIUM: occurrence variables get the same NERC and P06 handling as event variables', () => {
  it('Length [mm] alone: the prompt (CONV-NERC-UNKNOWN, CONV-UNIT-NO-P06) is raised', () => {
    const { c } = run(['Length [mm]'], (i) => [100 + 9 * i]);
    expect(c.findings.find((f) => f.ruleId === 'CONV-NERC-UNKNOWN')?.params.what).toContain('Length');
    expect(c.findings.some((f) => f.ruleId === 'CONV-UNIT-NO-P06')).toBe(true);
  });

  it('a confirmed concept is applied to the occurrence rows', () => {
    const file = fileOf([...HEAD, 'Length [mm]'], Array.from({ length: 8 }, (_, i) => row(i, [100 + 9 * i])));
    const idx = HEAD.length;
    const type = { id: 'http://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01/', source: 'suggested' as const, deprecated: false };
    const c = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' }, nerc: { [String(idx)]: { type } } })], options: {} });
    const rows = c.measurements.filter((m) => m.role === 'variable' && m.target.kind === 'occurrence');
    expect(rows).toHaveLength(8);
    expect(rows.every((m) => m.measurementTypeId === type.id)).toBe(true);
    expect(c.findings.find((f) => f.ruleId === 'CONV-NERC-UNKNOWN')).toBeUndefined();
  });
});

describe('MEDIUM: a descriptor of the sample is never moved to the occurrences, and a tow total is not a biomass of each taxon', () => {
  it('Tow [#] and total_catch_kg over a sample with no repeated taxon: base behaviour, nothing on the occurrences', () => {
    const file = fileOf(['Sample', 'Date', 'Latitude', 'Longitude', 'Tow [#]', 'Species', 'Count', 'total_catch_kg'], Array.from({ length: 12 }, (_, i) => ['S1', '2023-06-14', 55, 2.5, 1 + Math.floor(i / 4), `${TAXA[i % 8]}`, i + 1, [30, 50, 80][Math.floor(i / 4)]]));
    const props = proposeConvertColumns(file.sheets[0], CTX);
    for (const p of props) expect(p.role.kind === 'variable' && p.role.perOccurrence, p.header).toBeFalsy();
    const c = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })], options: {} });
    expect(c.measurements.filter((m) => m.role === 'variable' && m.target.kind === 'occurrence')).toEqual([]);
    expect(c.measurements.filter((m) => m.role === 'biomass' && m.measurementUnit === 'kg')).toEqual([]);
  });
  it.each(['Haul', 'Cast', 'Tow'])('%s is never an occurrence value', (h) => {
    const { roles } = run([h], (i) => [i + 1]);
    const r = roles.find((x) => x.header === h)!.role;
    expect(r.kind === 'variable' && r.perOccurrence).toBeFalsy();
  });
});

describe('MEDIUM: a statistic in the comment is not written as the variable', () => {
  it('Temp [deg C] (std dev) is typed with its comment', () => {
    const file = fileOf(['Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Temp [deg C]', 'Temp [deg C] (std dev)'], [['s1', 55, 2, '2023-06-14', 3, 4.1, 0.2]]);
    const c = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })], options: {} });
    const types = c.measurements.filter((m) => m.role === 'variable').map((m) => m.measurementType);
    expect(types).toContain('temperature');
    expect(types.some((t) => /std dev/.test(t ?? ''))).toBe(true);
    expect(types).not.toContain('Temp');
  });
});

describe('docs of what stays a low-confidence proposal', () => {
  it('a column of Latin-looking words beside a named count is only ever offered, at low confidence', () => {
    const r = Object.fromEntries(proposeConvertColumns(rawSheet(['Station', 'Method', 'Count'], Array.from({ length: 6 }, (_, i) => ['S1', ['Visual census', 'Visual census A', 'Visual census B', 'Mare nostrum', 'Visual census C', 'Visual census D'][i], i + 1])), CTX).map((p) => [p.header, p]));
    if (r.Method.role.kind === 'taxon') expect(r.Method.confidence).toBe('low');
  });
});

describe('MEDIUM: a named quantity beside a Latin column means long, numeric codes notwithstanding', () => {
  const names = ['Gadus morhua Linnaeus, 1758', 'Pleuragramma antarctica Boulenger, 1902', 'Trematomus scotti (Boulenger, 1907)', 'Acartia longiremis', 'Oithona similis', 'Calanus finmarchicus'];
  it('SpName beside species_code, Mesh, Transect and a Count', () => {
    const r = Object.fromEntries(proposeConvertColumns(rawSheet(['Station', 'SpName', 'species_code', 'Mesh', 'Transect', 'Count'], names.map((n, i) => ['S1', n, 100 + i, 500, 1 + (i % 2), i + 1])), CTX).map((p) => [p.header, p]));
    expect(r.SpName.role).toEqual({ kind: 'taxon' });
    expect(r.SpName.confidence).toBe('low');
  });
  it('a wide sheet with a Dominant species column and no named quantity stays wide', () => {
    const r = Object.fromEntries(proposeConvertColumns(rawSheet(['Station', 'Dominant species', 'species_code', 'Calanus', 'Acartia'], names.map((n, i) => ['S1', n, 100 + i, i, 2])), CTX).map((p) => [p.header, p]));
    expect(r['Dominant species'].role.kind).toBe('ignore');
    expect(r.Calanus.role).toEqual({ kind: 'taxon', header: true });
  });
  it('several columns counted in [#] are species columns of a wide sheet, not the quantity of a long one', () => {
    const r = Object.fromEntries(proposeConvertColumns(rawSheet(['Station', 'Notes', 'Calanus [#]', 'Acartia [#]'], names.map((n, i) => ['S1', n, i, 2])), CTX).map((p) => [p.header, p]));
    expect(r.Notes.role.kind).toBe('ignore');
  });
});

describe('MEDIUM: a zone-stated time does not silently override a date it contradicts', () => {
  it('Date 2011-08-05 with Time 2011-10-06T20:00:00Z is reported and the date is kept; one day apart is the instant', () => {
    const t = 'Station,Date,Time,Temp\nS1,2011-08-05,2011-10-06T20:00:00Z,4.1\nS1,2011-08-05,2011-08-06T01:00:00Z,4.2\n';
    const file = parseFile('t.csv', new TextEncoder().encode(t));
    const { dataset, findings } = buildDataset(file, proposeLayout(file), [], [], 'x');
    expect(findings.filter((f) => f.ruleId === 'ROW-TIME-OTHER-DAY').map((f) => f.value)).toEqual(['2011-10-06T20:00:00Z']);
    expect(dataset.rows[0].datetime?.iso.startsWith('2011-08-05')).toBe(true);
    expect(dataset.rows[1].datetime?.iso).toBe('2011-08-06T01:00:00Z');
  });
});

describe('MEDIUM: NA among ions needs numbers and two different ions', () => {
  const roleOf = (header: string[], cell: (i: number) => Cell) => proposeColumns(rawSheet(header, Array.from({ length: 4 }, (_, i) => header.map((h) => (h === 'NA' ? cell(i) : i + 1)))), CTX).find((p) => p.header === 'NA')!.role;
  it('text cells beside ions are not sodium', () => {
    expect(roleOf(['Ca', 'Mg', 'NA'], () => 'flag')).not.toMatchObject({ variable: 'sodium' });
    expect(roleOf(['Ca', 'Mg', 'NA'], () => 'x')).not.toMatchObject({ variable: 'sodium' });
  });
  it('the same ion twice counts once', () => {
    expect(roleOf(['k', 'k', 'NA'], (i) => i)).not.toMatchObject({ variable: 'sodium' });
  });
  it('numbers beside two different ions are sodium', () => {
    expect(roleOf(['Ca', 'Mg', 'NA'], (i) => i + 5)).toMatchObject({ variable: 'sodium' });
  });
});

describe('LOW: a date-formatted Excel serial of 1.5 is a time, not 1899-12-31', () => {
  it('no date column: the column is not read as a date and time', () => {
    const r = Object.fromEntries(proposeColumns(rawSheet(['Station', 'Time', 'x'], [['S1', 1.5, 1], ['S1', 1.25, 2], ['S1', 2.5, 3]], 'S', [false, true, false]), CTX).map((p) => [p.header, p]));
    expect(r.Time.role).toEqual({ kind: 'time' });
  });
});

describe('LOW: the sheets of META-NO-POSITIONS are counted after ten, and one sheet is named as that', () => {
  const sheetsDs = (names: string[]) =>
    names.map((n) => {
      const cell = (v: number, line: number) => ({ raw: String(v), line, value: v, status: 'ok' as const });
      const ds = makeDataset(Array.from({ length: 3 }, (_, i) => ({ datetime: '2020-01-01', values: { C: cell(i + 1, i + 2) } })), [], { file: 'book.xlsx', label: `book.xlsx (${n})`, id: n });
      for (const r of ds.rows) r.sheet = n;
      return ds;
    });
  const finding = (names: string[]) => runChecks({ datasets: sheetsDs(names), records: [], parseFindings: [] }, { today: '2099-01-01' }).findings.filter((f) => f.ruleId === 'META-NO-POSITIONS');
  it('forty sheets: ten names and the rest counted', () => {
    const f = finding(Array.from({ length: 40 }, (_, i) => `Sheet${i + 1}`));
    expect(f).toHaveLength(1);
    expect(f[0].sheet).toBe('Sheet1, Sheet2, Sheet3, Sheet4, Sheet5, Sheet6, Sheet7, Sheet8, Sheet9, Sheet10 (+30)');
    expect(renderPlain(f[0], 'en')).not.toContain('Sheet11');
  });
  it('one sheet reads "the sheet: X" in four languages', () => {
    const f = finding(['Only']);
    expect(renderPlain(f[0], 'en')).toContain('the sheet: Only');
    for (const l of LANGS) expect(renderPlain(f[0], l), l).toContain('Only');
  });
});
