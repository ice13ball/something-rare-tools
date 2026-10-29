// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Quantity headers of the converter overlay (stage-2 acceptance, fix 2): a long sheet's "Liczba osobników" is proposed as the quantity, not as a measured
// variable. Whole headers only, with and without diacritics, with an optional unit in brackets; "Liczba prób" and the like are never a quantity.
import { describe, expect, it } from 'vitest';
import { proposeColumns } from '../../src/core/recognize/columns';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { rawSheet } from '../helpers/files';
import { CTX } from './helpers';

const LONG_ROWS = [
  ['S1', 55, 3, '2020-01-01', 'Calanus finmarchicus', 12],
  ['S1', 55, 3, '2020-01-01', 'Oithona similis', 7],
  ['S2', 56, 3, '2020-01-02', 'Calanus finmarchicus', 3],
];
const roleOf = (header: string) => {
  const sheet = rawSheet(['Station', 'Latitude', 'Longitude', 'Date', 'Species', header], LONG_ROWS);
  return proposeConvertColumns(sheet, CTX).find((p) => p.header === header)!;
};
const isQuantity = (header: string): boolean => roleOf(header).role.kind === 'quantity';

const ACCEPTED = [
  // PL
  'Liczba osobników', 'Liczba osobnikow', 'Liczba os.', 'Liczebność', 'Liczebnosc', 'Zagęszczenie', 'Zageszczenie', 'Biomasa',
  // DE
  'Anzahl', 'Anzahl Individuen', 'Abundanz', 'Individuendichte', 'Biomasse',
  // FR
  "Nombre d'individus", "Nombre d’individus", 'Nombre d individus', 'Abondance', 'Densité', 'Densite', 'Biomasse',
  // EN, already known
  'Count', 'Abundance', 'Density', 'Biomass',
];

describe('quantity headers, with and without diacritics', () => {
  for (const h of ACCEPTED) {
    it(`"${h}" is the quantity of a long sheet`, () => {
      expect(isQuantity(h)).toBe(true);
    });
  }
  it('Liczba osobników was a measured variable before, and the shared proposer still says so (the overlay, not /check, changed)', () => {
    const sheet = rawSheet(['Station', 'Latitude', 'Longitude', 'Date', 'Species', 'Liczba osobników'], LONG_ROWS);
    expect(proposeColumns(sheet, CTX).find((p) => p.header === 'Liczba osobników')!.role.kind).not.toBe('quantity');
  });
});

describe('an optional unit in brackets', () => {
  for (const h of ['Liczba osobników [ind.]', 'Liczba osobników (ind.)', 'Liczba os. [szt.]', 'Anzahl Individuen [Ind.]', "Nombre d'individus [ind]", 'Individuendichte [Ind./m3]', 'Zagęszczenie [ind/m3]', 'Biomasa (g/m2)', 'Densité [ind/m3]']) {
    it(`"${h}" is the quantity`, () => {
      expect(isQuantity(h)).toBe(true);
    });
  }
});

describe('whole headers only: what counts something else is never a quantity', () => {
  for (const h of ['Liczba prób', 'Liczba prob', 'Anzahl Proben', "Nombre d'échantillons", 'Nombre d echantillons', 'Liczba gatunków', 'Anzahl Arten', 'Liczba stacji', 'Nombre de stations', 'Liczba osobników gatunków', 'Anzahl Individuen pro Probe']) {
    it(`"${h}" is not`, () => {
      expect(isQuantity(h)).toBe(false);
    });
  }
});

describe('the stage-1 rules stay', () => {
  it('a canonical variable stays a variable (temperature, salinity next to a quantity)', () => {
    const sheet = rawSheet(['Station', 'Latitude', 'Longitude', 'Date', 'Species', 'Liczba osobników', 'Temperature [°C]', 'Salinity'], LONG_ROWS.map((r) => [...r, 7.1, 33.2]));
    const p = proposeConvertColumns(sheet, CTX);
    expect(p.find((x) => x.header === 'Temperature [°C]')!.role.kind).toBe('variable');
    expect(p.find((x) => x.header === 'Salinity')!.role.kind).toBe('variable');
    expect(p.find((x) => x.header === 'Liczba osobników')!.role.kind).toBe('quantity');
  });
  it('a summary header stays ignored, also when it carries a quantity word', () => {
    const header = ['Station', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Oithona similis', 'Suma', 'Anzahl Individuen gesamt'];
    const sheet = rawSheet(header, [['S1', 55, 3, '2020-01-01', 4, 6, 10, 10], ['S2', 56, 3, '2020-01-02', 2, 1, 3, 3]]);
    const p = proposeConvertColumns(sheet, CTX);
    expect(p.find((x) => x.header === 'Suma')!.role).toEqual({ kind: 'ignore' });
    expect(p.find((x) => x.header === 'Anzahl Individuen gesamt')!.role.kind).not.toBe('quantity');
    expect(p.find((x) => x.header === 'Anzahl Individuen gesamt')!.role.kind).not.toBe('taxon');
  });
  it('only one quantity column is read; a second is left out', () => {
    const sheet = rawSheet(['Station', 'Latitude', 'Longitude', 'Date', 'Species', 'Liczba osobników', 'Biomasa'], LONG_ROWS.map((r) => [...r, 0.5]));
    const p = proposeConvertColumns(sheet, CTX);
    expect(p.filter((x) => x.role.kind === 'quantity').map((x) => x.header)).toEqual(['Liczba osobników']);
    // a biomass next to a count is not a second quantity: it is a measurement of the occurrence, its kind still open
    expect(p.find((x) => x.header === 'Biomasa')!.role).toEqual({ kind: 'biomass' });
  });
  it('only one quantity column is read; a second COUNT-like one is left out', () => {
    const sheet = rawSheet(['Station', 'Latitude', 'Longitude', 'Date', 'Species', 'Liczba osobników', 'Abundance'], LONG_ROWS.map((r) => [...r, 5]));
    const p = proposeConvertColumns(sheet, CTX);
    expect(p.filter((x) => x.role.kind === 'quantity').map((x) => x.header)).toEqual(['Liczba osobników']);
    expect(p.find((x) => x.header === 'Abundance')!.role).toEqual({ kind: 'ignore' });
  });
});
