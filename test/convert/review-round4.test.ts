// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The fourth review of the role rules: every input that was wrong is a test here. Every row is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { getConvertRule, renderConvertPlain } from '../../src/core/rules/convert';
import { LANGS } from '../../src/core/types';
import type { ColumnRole } from '../../src/core/types';
import { rawSheet } from '../helpers/files';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const CTX = { decimalComma: false, date1904: false };
const N = (n: number, make: (i: number) => Cell[]): Cell[][] => Array.from({ length: n }, (_, i) => make(i));
const rolesOf = (header: string[], rows: Cell[][]) => Object.fromEntries(proposeConvertColumns(rawSheet(header, rows.map((r) => [...r])), CTX).map((p) => [p.header, p]));
const TAXA = ['Calanus finmarchicus', 'Oithona similis', 'Acartia longiremis', 'Pseudocalanus acuspes', 'Metridia longa', 'Microcalanus pygmaeus', 'Oncaea borealis', 'Temora longicornis', 'Centropages typicus', 'Paracalanus parvus'];
const HEAD = ['Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'];
const conflicts = (c: ReturnType<typeof convert>) => c.findings.filter((f) => f.ruleId === 'CONV-SAMPLE-CONFLICT');

describe('HIGH: a taxon attribute is never a column with a unit or a size word', () => {
  // two samples, each taxon in both, one value per taxon in the column
  const twoSamples = (h: string, per: (t: number) => Cell) => {
    const rows = N(8, (i) => [`s${i < 4 ? 1 : 2}`, '2023-06-14', 55, 2.5, TAXA[i % 4], i + 1, per(i % 4)]);
    const file = fileOf([...HEAD, h], rows);
    const role = proposeConvertColumns(file.sheets[0], CTX).find((p) => p.header === h)!;
    return { role, c: convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })], options: {} }) };
  };
  it.each(['Mean length [mm]', 'Length [mm]', 'Fork length [cm]', 'Cover [%]', 'C content [µg/ind]'])('%s is not ignored as an attribute', (h) => {
    const { role } = twoSamples(h, (t) => 10 + 7 * t);
    expect(role.reasonCode, h).not.toBe('taxon-attribute');
    expect(role.role.kind, h).not.toBe('ignore');
  });
  it.each(['Cover [%]', 'Oxy sat [%]', 'Flow rate', 'Mean length [mm]', 'Secchi [m]'])('%s with nine taxa once and one repeated is not an attribute; a reading that differs inside a sample still blocks', (h) => {
    const rows = N(10, (i) => ['S1', '2023-06-14', 55, 2.5, i === 9 ? TAXA[0] : TAXA[i], i + 1, i === 9 ? 3 : i < 5 ? 3 : 7]);
    const file = fileOf([...HEAD, h], rows);
    const role = proposeConvertColumns(file.sheets[0], CTX).find((p) => p.header === h)!;
    expect(role.reasonCode, h).not.toBe('taxon-attribute');
    const c = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })], options: {} });
    const moved = role.role.kind === 'variable' && role.role.perOccurrence === true;
    if (!moved) expect(conflicts(c), h).toHaveLength(1);
  });
  it.each(['species_code', 'TSN', 'Trophic level', 'species_key', 'Serial'])('%s (named so, no unit) is an attribute and the ignored columns are listed', (h) => {
    const { role, c } = twoSamples(h, (t) => 1000 + 37 * t);
    expect(role.reasonCode).toBe('taxon-attribute');
    const f = c.findings.find((x) => x.ruleId === 'CONV-TAXON-ATTRIBUTE-IGNORED')!;
    expect(f.params.columns).toBe(h);
    for (const l of LANGS) expect(renderConvertPlain(f, l), l).toContain(h);
  });
  it('an unnamed column without a unit that follows the taxa on most of them (at least three repeated, half of the taxa) is one too', () => {
    const { role } = twoSamples('Guild', (t) => [1, 2, 1, 3][t]);
    expect(role.reasonCode).toBe('taxon-attribute');
  });
});

describe('MEDIUM: Replicate, Tow, Haul and Cast on a long sheet', () => {
  const sheet = (h: string, v: (i: number) => Cell) => {
    const rows = N(4, (i) => ['K1', '2023-06-14', 55, 2.5, TAXA[i % 2], i + 1, v(i)]);
    const file = fileOf([...HEAD, h], rows);
    return { file, role: proposeConvertColumns(file.sheets[0], CTX).find((p) => p.header === h)! };
  };
  it.each(['replicate', 'Rep', 'Replicate no'])('%s over a code that does not tell the rows apart is the replicate role, low confidence: 2 replicate events, no conflict, no eMoF row', (h) => {
    const { file, role } = sheet(h, (i) => 1 + Math.floor(i / 2));
    expect(role.role).toEqual({ kind: 'replicate' });
    expect(role.confidence).toBe('low');
    const c = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })], options: {} });
    expect(c.events.filter((e) => e.eventType === 'replicate')).toHaveLength(2);
    expect(conflicts(c)).toEqual([]);
    expect(c.measurements.filter((m) => m.role === 'variable')).toEqual([]);
  });
  it.each(['Tow', 'Haul', 'Cast'])('%s is a sample descriptor, ignored with its reason, also on a long sheet', (h) => {
    const { role } = sheet(h, (i) => 1 + Math.floor(i / 2));
    expect(role.role.kind).toBe('ignore');
    expect(role.reasonCode).toBe('sample-descriptor');
  });
  it('where the codes are unique a Replicate column is not proposed as a role and not as a variable: the IDs are those of the sheet without it', () => {
    const rows = N(2, (i) => [`S1-${'AB'[i]}`, '2020-01-01', 55, 2.5, 'Calanus finmarchicus', 3 + i, 'AB'[i]]);
    const withRep = fileOf([...HEAD, 'Replicate'], rows);
    const without = fileOf(HEAD, rows.map((r) => r.slice(0, 6)));
    const p = proposeConvertColumns(withRep.sheets[0], CTX).find((x) => x.header === 'Replicate')!;
    expect(p.role.kind).toBe('ignore');
    const ids = (f: ReturnType<typeof fileOf>) => convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' } })], options: {} }).events.map((e) => [e.eventType, e.id]);
    expect(ids(withRep)).toEqual(ids(without));
  });
});

describe('MEDIUM: one binomial column or two species-like columns keep a wide sheet wide', () => {
  const rows = (extra: Cell[]): Cell[][] => N(6, (i) => [`s${i}`, TAXA[i], 10 + i, ...extra.map((_, k) => 1 + ((i + k) % 3))]);
  it.each([
    [['Calanus', 'Oithona']],
    [['Calanus sp.', 'Oithona sp.']],
    [['Copepoda', 'Cladocera']],
    [['Calanus finmarchicus']],
  ])('Dominant species + Abundance + %j', (cols) => {
    const r = rolesOf(['Sample', 'Dominant species', 'Abundance', ...(cols as string[])], rows(cols as string[]));
    expect(r['Dominant species'].role.kind).toBe('ignore');
    for (const h of cols as string[]) expect(r[h].role, h).toEqual({ kind: 'taxon', header: true });
  });
  it('b10 SpName beside species_code, Mesh and Transect is still a taxon', () => {
    const r = rolesOf(['Station', 'SpName', 'species_code', 'Mesh', 'Transect', 'Count'], N(6, (i) => ['S1', TAXA[i], 100 + i, 500, 1 + (i % 2), i + 1]));
    expect(r.SpName.role).toEqual({ kind: 'taxon' });
  });
});

describe('MEDIUM: the move rule is a positive list', () => {
  const run = (h: string) => {
    const file = fileOf([...HEAD, h], N(8, (i) => ['S1', '2023-06-14', 55, 2.5, TAXA[i], i + 1, 100 + 7.3 * i]));
    const role = proposeConvertColumns(file.sheets[0], CTX).find((p) => p.header === h)!.role;
    return { role, c: convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })], options: {} }) };
  };
  it.each(['Sieve size [mm]', 'Filter pore size [µm]', 'Beam width [m]', 'Layer thickness [cm]', 'Particle size [µm]', 'Rainfall [mm]', 'Transparency [cm]', 'Bag length [m]', 'Frame size [cm]'])('%s does not move: it blocks', (h) => {
    const { role, c } = run(h);
    expect(role.kind === 'variable' && role.perOccurrence, h).toBeFalsy();
    expect(conflicts(c), h).toHaveLength(1);
  });
  it.each(['L1 (µm)', 'L10 (µm)', 'Mean Length (µm)', 'TL', 'FL [mm]', 'Prosome length', 'Total length [mm]', 'Length [mm]', 'Carapace width [mm]'])('%s moves', (h) => {
    const { role, c } = run(h);
    expect(role, h).toMatchObject({ kind: 'variable', perOccurrence: true });
    expect(conflicts(c), h).toEqual([]);
  });
});

describe('MEDIUM: CONV-SAMPLE-CONFLICT speaks one language', () => {
  it('the attributes are translated', () => {
    const file = fileOf([...HEAD, 'Secchi [m]'], N(4, (i) => ['S1', i < 2 ? '2023-06-14' : '2023-06-15', 55, 2.5, TAXA[i], i + 1, i < 2 ? 3 : 7]));
    const f = conflicts(convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })], options: {} }))[0];
    expect(String(f.params.what)).toContain('date');
    expect(renderConvertPlain(f, 'pl')).toContain('data, wartość zmierzona (Secchi [m])');
    expect(renderConvertPlain(f, 'de')).toContain('Datum, Messwert (Secchi [m])');
    expect(renderConvertPlain(f, 'fr')).toContain('date, valeur mesurée (Secchi [m])');
    for (const l of ['pl', 'de', 'fr'] as const) expect(renderConvertPlain(f, l)).not.toContain('measured value');
  });
});

describe('LOW: the sentences end, and a tick on a wide sheet does not drop the column', () => {
  it('every language of CONV-SAMPLE-CONFLICT has its full stop and no double space', () => {
    for (const l of LANGS) {
      const t = getConvertRule('CONV-SAMPLE-CONFLICT').plain[l];
      expect(t.trimEnd().endsWith('.'), l).toBe(true);
      expect(t, l).not.toMatch(/ {2}|\s\.$/);
    }
    const file = fileOf([...HEAD, 'Secchi [m]'], N(2, (i) => ['S1', '2023-06-14', 55, 2.5, TAXA[i], i + 1, 3 + i]));
    const f = conflicts(convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })], options: {} }))[0];
    for (const l of LANGS) expect(renderConvertPlain(f, l), l).toMatch(/\.( |$)/);
  });
  it('a proposed or sidecar tick on a WIDE sheet writes the column as a variable of the sample', () => {
    const file = fileOf(['Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Mean Length (µm)'], [['s1', 55, 2, '2023-06-14', 3, 150]]);
    const edit: Record<string, ColumnRole> = { 'Mean Length (µm)': { kind: 'variable', variable: 'Mean Length', unit: 'µm', perOccurrence: true } };
    const c = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' }, shape: 'wide', edit })], options: {} });
    expect(c.findings.some((f) => f.ruleId === 'CONV-COLUMN-NOT-EXPORTED')).toBe(false);
    const rows = c.measurements.filter((m) => m.role === 'variable');
    expect(rows).toHaveLength(1);
    expect(rows[0].target.kind).toBe('event');
  });
});
