// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { proposeConvertColumns, suggestConvertShape } from '../../src/core/convert/recognize';
import { proposeColumns } from '../../src/core/recognize/columns';
import type { ColumnProposal } from '../../src/core/types';
import { rawSheet } from '../helpers/files';
import { CTX } from './helpers';
import type { Cell } from './helpers';

const props = (header: string[], rows: Cell[][]): ColumnProposal[] => proposeConvertColumns(rawSheet(header, rows), CTX);
const roleOf = (p: ColumnProposal[], h: string) => p.find((x) => x.header === h)!.role;

describe('Darwin Core terms', () => {
  const header = ['occurrenceID', 'eventID', 'scientificName', 'individualCount', 'organismQuantity', 'organismQuantityType', 'minimumDepthInMeters', 'maximumDepthInMeters', 'lifeStage', 'identificationQualifier', 'decimalLatitude', 'decimalLongitude'];
  const p = props(header, [['o1', 'e1', 'Calanus finmarchicus', 3, 3, 'individuals', 0, 10, 'C2', 'cf.', 55.1, 3.2]]);

  it('maps the converter terms to the converter roles', () => {
    expect(roleOf(p, 'occurrenceID')).toEqual({ kind: 'occurrenceId' });
    expect(roleOf(p, 'eventID')).toEqual({ kind: 'sampleId' });
    expect(roleOf(p, 'scientificName')).toEqual({ kind: 'taxon' });
    expect(roleOf(p, 'individualCount')).toEqual({ kind: 'quantity' });
    expect(roleOf(p, 'organismQuantityType')).toEqual({ kind: 'quantityType' });
    expect(roleOf(p, 'lifeStage')).toEqual({ kind: 'lifeStage' });
    expect(roleOf(p, 'identificationQualifier')).toEqual({ kind: 'qualifier' });
  });

  it('reads both depth bounds, each from its own column', () => {
    expect(roleOf(p, 'minimumDepthInMeters')).toEqual({ kind: 'depth', positive: 'down', unit: 'm', bound: 'min' });
    expect(roleOf(p, 'maximumDepthInMeters')).toEqual({ kind: 'depth', positive: 'down', unit: 'm', bound: 'max' });
  });

  it('reads one quantity column: a second one (organismQuantity next to individualCount) is left out, with its reason', () => {
    expect(roleOf(p, 'organismQuantity')).toEqual({ kind: 'ignore' });
    expect(p.find((x) => x.header === 'organismQuantity')!.reason).toMatch(/another quantity column/);
  });

  it('leaves coordinates to the shared proposer', () => {
    expect(roleOf(p, 'decimalLatitude')).toEqual({ kind: 'latitude' });
    expect(roleOf(p, 'decimalLongitude')).toEqual({ kind: 'longitude' });
  });

  it('eventID is the sample code even when another column would be proposed for it by /check', () => {
    const q = props(['Sample', 'eventID', 'Species', 'Count'], [['a', 'e', 'Calanus', 1]]);
    expect(roleOf(q, 'eventID')).toEqual({ kind: 'sampleId' });
    expect(roleOf(q, 'Sample')).toEqual({ kind: 'ignore' });
    // occurrenceID next to nothing else: /check would call it the sample, the converter calls it the occurrence
    expect(roleOf(props(['occurrenceID', 'Species', 'Count'], [['o', 'Calanus', 1]]), 'occurrenceID')).toEqual({ kind: 'occurrenceId' });
  });
});

describe('the converter own names in four languages', () => {
  it.each(['Species', 'Taxon', 'Gatunek', 'Takson', 'Art', 'Espèce'])('%s is a taxon column', (h) => {
    expect(roleOf(props([h, 'Count'], [['Calanus', 1]]), h)).toEqual({ kind: 'taxon' });
  });

  it.each(['Count', 'Abundance', 'Liczebność', 'Density', 'Zagęszczenie', 'Biomass', 'Biomasa', 'Anzahl', 'Abondance'])('%s is a quantity column', (h) => {
    expect(roleOf(props(['Species', h], [['Calanus', 1], ['Oithona', 4.5]]), h)).toEqual({ kind: 'quantity' });
  });

  it.each([
    ['Volume filtered [m3]', { kind: 'effort', unit: 'm3' }],
    ['Objętość [m3]', { kind: 'effort', unit: 'm3' }],
    ['Area [m2]', { kind: 'effort', unit: 'm2' }],
    ['Powierzchnia [m2]', { kind: 'effort', unit: 'm2' }],
    ['Volume', { kind: 'effort' }],
  ])('%s is the sampling effort', (h, role) => {
    expect(roleOf(props(['Sample', h, 'Calanus'], [['a', 5, 3], ['b', 6, 4]]), h)).toEqual(role);
  });

  it.each([
    ['Depth, top/min [m]', 'min'],
    ['Depth, bottom/max [m]', 'max'],
    ['Głębokość od [m]', 'min'],
    ['Głębokość do [m]', 'max'],
    ['Tiefe von [m]', 'min'],
    ['Tiefe bis [m]', 'max'],
    ['Profondeur de [m]', 'min'],
    ['Profondeur à [m]', 'max'],
  ] as const)('%s is the %s end of a depth range', (h, bound) => {
    const r = roleOf(props([h, 'Calanus'], [[5, 3], [10, 4]]), h);
    expect(r).toMatchObject({ kind: 'depth', bound });
  });

  it('both ends of a range are read (the shared proposer would keep one), and a lone depth column has no bound', () => {
    const p = props(['Depth top [m]', 'Depth bottom [m]', 'Calanus'], [[0, 10, 3]]);
    expect(p.map((x) => x.role.kind === 'depth' && x.role.bound)).toEqual(['min', 'max', false]);
    expect(roleOf(props(['Depth [m]', 'Calanus'], [[5, 3]]), 'Depth [m]')).toEqual({ kind: 'depth', positive: 'down', unit: 'm' });
  });
});

describe('the shared names are not copied', () => {
  it('Polish, German and French coordinates, date, depth, station, cruise and sample come from the shared proposer, unchanged', () => {
    const header = ['Szerokość geograficzna', 'Längengrad', 'Date', 'Stacja', 'Rejs', 'Probe', 'Profondeur [m]'];
    const rows: Cell[][] = [[55.1, 3.2, '2020-01-01', 'S1', 'R1', 'P1', 10]];
    const sheet = rawSheet(header, rows);
    const shared = proposeColumns(sheet, CTX);
    const mine = proposeConvertColumns(sheet, CTX);
    expect(mine.map((p) => p.role)).toEqual(shared.map((p) => p.role));
    expect(mine.map((p) => p.reason)).toEqual(shared.map((p) => p.reason));
  });

  it('recognize.ts has no coordinate, date, station or cruise names of its own', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'core', 'convert', 'recognize.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/szerokosc|dlugosc|breitengrad|laengengrad|latitude|longitude|stacja|stazione|rejs|campagne|cruise/i);
  });
});

describe('wide sheets: taxon candidates', () => {
  const header = ['Station', 'Latitude', 'Longitude', 'Date', 'Temperature [degC]', 'Salinity', 'Calanus finmarchicus', 'Oithona similis'];
  const p = props(header, [['S1', 55, 3, '2020-01-01', 7.5, 34.9, 10, 4], ['S2', 56, 3, '2020-01-02', 7.1, 35.0, 3, 0]]);

  it('a non-canonical numeric column is a LOW-confidence taxon with header:true, to be confirmed in bulk', () => {
    for (const h of ['Calanus finmarchicus', 'Oithona similis']) {
      const x = p.find((q) => q.header === h)!;
      expect(x.role).toEqual({ kind: 'taxon', header: true });
      expect(x.confidence).toBe('low');
    }
  });

  it('canonical variables stay variables (they become eMoF later)', () => {
    expect(roleOf(p, 'Temperature [degC]').kind).toBe('variable');
    expect(roleOf(p, 'Salinity').kind).toBe('variable');
  });

  it('a column of presence marks is a taxon candidate too; a text column of comments is not', () => {
    const q = props(['Sample', 'Calanus finmarchicus', 'Comments'], [['a', '+', 'rough sea'], ['b', 'x', 'calm'], ['c', 3, '']]);
    expect(roleOf(q, 'Calanus finmarchicus')).toEqual({ kind: 'taxon', header: true });
    expect(roleOf(q, 'Comments')).toEqual({ kind: 'ignore' });
  });

  it('with a taxon column of a long sheet, numeric columns stay variables (eMoF), not taxa', () => {
    const q = props(['Sample', 'Species', 'Count', 'Chl a'], [['a', 'Calanus', 3, 1.2], ['b', 'Oithona', 5, 1.4]]);
    expect(roleOf(q, 'Chl a').kind).toBe('variable');
  });

  it('suggests the shape from the roles', () => {
    expect(suggestConvertShape(p)).toBe('wide');
    expect(suggestConvertShape(props(['Sample', 'Species', 'Count'], [['a', 'Calanus', 3]]))).toBe('long');
    expect(suggestConvertShape(props(['Sample', 'Latitude'], [['a', 5]]))).toBeUndefined();
  });

  it('does not mutate the shared proposals', () => {
    const sheet = rawSheet(header, [['S1', 55, 3, '2020-01-01', 7.5, 34.9, 10, 4]]);
    const before = JSON.stringify(proposeColumns(sheet, CTX));
    proposeConvertColumns(sheet, CTX);
    expect(JSON.stringify(proposeColumns(sheet, CTX))).toBe(before);
  });
});

describe('candidates (M1, L4)', () => {
  const header = ['Station', 'Latitude', 'Longitude', 'Date'];
  const base: Cell[] = ['S1', 55, 3, '2020-01-01'];
  it.each(['Total', 'Suma', 'Razem', 'Summe', 'Gesamt', 'Somme', 'Sum', 'Σ', 'TOTAL', 'total [ind]'])('the header %s is never proposed as a taxon', (h) => {
    const p = props([...header, 'Calanus finmarchicus', h], [[...base, 4, 9], [...base, 5, 10]]);
    expect(roleOf(p, h).kind).not.toBe('taxon');
    expect(roleOf(p, 'Calanus finmarchicus')).toEqual({ kind: 'taxon', header: true });
  });
  it.each(['Total copepods', 'Total abundance [ind/m3]', 'Razem Copepoda', 'Abundance, total', 'Suma gatunków', 'Gesamt Copepoda', 'Σ copepods', 'Summe Calanus'])('"%s" is a summary header: never proposed as a taxon', (h) => {
    const p = props([...header, h], [[...base, 4], [...base, 5]]);
    expect(roleOf(p, h).kind).not.toBe('taxon');
  });
  it('a real-looking genus that only starts with the letters (Totalia sp., Summa) is still proposed, and the user can mark a summary column by hand', () => {
    for (const h of ['Totalia sp.', 'Sumatra copepod', 'Razemia']) expect(roleOf(props([...header, h], [[...base, 4], [...base, 5]]), h), h).toEqual({ kind: 'taxon', header: true });
  });
  it('a presence-mark column with NA cells is still a taxon candidate, a real text column is not', () => {
    const p = props([...header, 'Calanus finmarchicus'], [[...base, '+'], [...base, 'NA'], [...base, 'x'], [...base, null], [...base, 'NANA']]);
    expect(roleOf(p, 'Calanus finmarchicus')).toEqual({ kind: 'taxon', header: true });
    expect(roleOf(props([...header, 'Comments'], [[...base, '+'], [...base, 'rough sea']]), 'Comments')).toEqual({ kind: 'ignore' });
  });
  it.each(['Stage', 'Stadium', 'stadium', 'Stade', 'Life stage', 'Stadium rozwojowe'])('%s is the life stage', (h) => {
    expect(roleOf(props(['Sample', 'Species', 'Count', h], [['a', 'Calanus', 3, 'C2']]), h)).toEqual({ kind: 'lifeStage' });
  });
});
