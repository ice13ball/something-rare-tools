// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Stage 5 follow-up: header names of the measured variables in Polish, German and French reach the same concepts as the English ones (converter only), and a confirmed
// concept whose label contradicts the unit of its column is said (CONV-NERC-UNIT-MISMATCH). Synthetic sheets only.
import { describe, expect, it } from 'vitest';
import { policyOf } from '../../src/core/convert/policy';
import { pickLabel, suggestType, unitContradictsConcept } from '../../src/core/convert/nerc';
import type { NercDecisions } from '../../src/core/convert/nerc';
import { VARIABLE_CONCEPTS, VARIABLE_SYNONYMS, conceptVariable, labelDimension, nercUri, unitDimension } from '../../src/core/convert/vocab';
import { renderConvertPlain } from '../../src/core/rules/convert';
import { LANGS } from '../../src/core/types';
import { exportSheet, objects, readBack } from './exportHelpers';
import { W1_HEADER, W1_ROWS, fileOf, mappingOf } from './helpers';
import type { Cell } from './helpers';

const codes = (ts: { code: string }[]): string[] => ts.map((t) => t.code);

/** [header or variable name, unit text, the code proposed (undefined: none), the codes only offered] */
type Case = [string, string | undefined, string | undefined, string[]];

describe('header names in PL / DE / FR reach the concepts of the English variables', () => {
  const cases: Case[] = [
    // the eight headers that failed
    ['Temperatura [°C]', '°C', 'TEMPPR01', ['TEMPP901', 'TEMPST01']],
    ['Zasolenie [PSU]', 'PSU', 'PSLTZZ01', ['PSALST01', 'PSALMV01']],
    ['Tlen [µmol/kg]', 'µmol/kg', 'DOXMZZXX', []],
    ['Chlorofil a [mg/m3]', 'mg/m3', undefined, ['CPHLZZXX']],
    ['temperatura wody', undefined, 'TEMPPR01', ['TEMPP901', 'TEMPST01']],
    ['zasolenie', undefined, 'PSLTZZ01', ['PSALST01', 'PSALMV01']],
    ['tlen rozpuszczony', undefined, undefined, ['DOXYZZXX', 'DOXMZZXX']],
    ['chlorofil a', undefined, undefined, ['CPHLZZXX']],
    // oxygen is chosen by the unit's dimension
    ['tlen rozpuszczony [µmol/kg]', 'µmol/kg', 'DOXMZZXX', []],
    ['Tlen [mg/L]', 'mg/L', 'DOXYZZXX', []],
    ['Sauerstoff [µmol/l]', 'µmol/l', 'DOXYZZXX', []],
    ['gelöster Sauerstoff [µmol/kg]', 'µmol/kg', 'DOXMZZXX', []],
    ['oxygène dissous [µmol/L]', 'µmol/L', 'DOXYZZXX', []],
    ['Oxygène [µmol/kg]', 'µmol/kg', 'DOXMZZXX', []],
    // PL
    ['temp. wody [°C]', '°C', 'TEMPPR01', ['TEMPP901', 'TEMPST01']],
    ['Temperatura', undefined, 'TEMPPR01', ['TEMPP901', 'TEMPST01']],
    ['chlorofil-a [µg/L]', 'µg/L', undefined, ['CPHLZZXX']],
    ['Chlorofil', 'mg/m3', undefined, ['CPHLZZXX']],
    ['Azotany [µmol/L]', 'µmol/L', 'NTRAZZXX', []],
    ['azotan', 'µmol/L', 'NTRAZZXX', []],
    ['NO3 [µmol/L]', 'µmol/L', 'NTRAZZXX', []],
    ['Azotyny [µmol/L]', 'µmol/L', 'NTRIZZXX', []],
    ['azotyn', 'µmol/L', 'NTRIZZXX', []],
    ['NO2', 'µmol/L', 'NTRIZZXX', []],
    ['azotany+azotyny [µmol/L]', 'µmol/L', 'NTRZZZXX', []],
    ['Suma azotanów i azotynów [µmol/L]', 'µmol/L', 'NTRZZZXX', []],
    ['Amoniak [µmol/L]', 'µmol/L', 'AMONZZXX', []],
    ['jon amonowy', 'µmol/L', 'AMONZZXX', []],
    ['Amon', 'µmol/L', 'AMONZZXX', []],
    ['NH4 [µmol/L]', 'µmol/L', 'AMONZZXX', []],
    ['Fosforany [µmol/L]', 'µmol/L', 'PHOSZZXX', []],
    ['fosforan', 'µmol/L', 'PHOSZZXX', []],
    ['PO4', 'µmol/L', 'PHOSZZXX', []],
    ['Krzemiany [µmol/L]', 'µmol/L', 'SLCAZZXX', []],
    ['krzemian', 'µmol/L', 'SLCAZZXX', []],
    ['Krzemionka', 'µmol/L', 'SLCAZZXX', []],
    ['SiO4', 'µmol/L', 'SLCAZZXX', []],
    ['pH', undefined, 'PHXXZZXX', ['PHXXSP02']],
    ['Alkaliczność [µmol/kg]', 'µmol/kg', undefined, ['ALKYPOTK']],
    ['Alkaliczność (całkowita) [µmol/L]', 'µmol/L', undefined, ['ALKYZZXX']],
    ['Węgiel nieorganiczny rozpuszczony [µmol/kg]', 'µmol/kg', undefined, ['TCO2KG02']],
    ['DIC [µmol/L]', 'µmol/L', undefined, ['TCO2ZZXX']],
    // DE
    ['Temperatur [°C]', '°C', 'TEMPPR01', ['TEMPP901', 'TEMPST01']],
    ['Wassertemperatur', undefined, 'TEMPPR01', ['TEMPP901', 'TEMPST01']],
    ['Salzgehalt [PSU]', 'PSU', 'PSLTZZ01', ['PSALST01', 'PSALMV01']],
    ['Salinität', undefined, 'PSLTZZ01', ['PSALST01', 'PSALMV01']],
    ['Sauerstoff', undefined, undefined, ['DOXYZZXX', 'DOXMZZXX']],
    ['Chlorophyll a [µg/L]', 'µg/L', undefined, ['CPHLZZXX']],
    ['Chlorophyll-a', undefined, undefined, ['CPHLZZXX']],
    ['Nitrat [µmol/L]', 'µmol/L', 'NTRAZZXX', []],
    ['Nitrit [µmol/L]', 'µmol/L', 'NTRIZZXX', []],
    ['Ammonium [µmol/L]', 'µmol/L', 'AMONZZXX', []],
    ['Phosphat [µmol/L]', 'µmol/L', 'PHOSZZXX', []],
    ['Silikat [µmol/L]', 'µmol/L', 'SLCAZZXX', []],
    ['Alkalinität [µmol/kg]', 'µmol/kg', undefined, ['ALKYPOTK']],
    ['gelöster anorganischer Kohlenstoff [µmol/kg]', 'µmol/kg', undefined, ['TCO2KG02']],
    // FR
    ['Température [°C]', '°C', 'TEMPPR01', ['TEMPP901', 'TEMPST01']],
    ["température de l'eau", undefined, 'TEMPPR01', ['TEMPP901', 'TEMPST01']],
    ['Salinité [PSU]', 'PSU', 'PSLTZZ01', ['PSALST01', 'PSALMV01']],
    ['Chlorophylle a [µg/L]', 'µg/L', undefined, ['CPHLZZXX']],
    ['chlorophylle-a', undefined, undefined, ['CPHLZZXX']],
    ['Nitrates [µmol/L]', 'µmol/L', 'NTRAZZXX', []],
    ['nitrite', 'µmol/L', 'NTRIZZXX', []],
    ['Phosphates [µmol/L]', 'µmol/L', 'PHOSZZXX', []],
    ['Silicates [µmol/L]', 'µmol/L', 'SLCAZZXX', []],
    ['Ammonium', 'µmol/L', 'AMONZZXX', []],
    ['Alcalinité totale [µmol/kg]', 'µmol/kg', undefined, ['ALKYPOTK']],
    ['Alcalinité', undefined, undefined, ['ALKYZZXX', 'ALKYPOTK']],
    ['carbone inorganique dissous [µmol/kg]', 'µmol/kg', undefined, ['TCO2KG02']],
  ];

  for (const [name, unit, proposed, offered] of cases) {
    it(`"${name}" with unit ${unit ?? 'none'}: ${proposed ? `proposes ${proposed}` : 'proposes nothing'}${offered.length ? `, offers ${offered.join(' ')}` : ''}`, () => {
      const s = suggestType(name, unit);
      expect(s.proposed?.code).toBe(proposed);
      expect(codes(s.offered)).toEqual(offered);
    });
  }

  it('with and without the bracketed unit, with and without diacritics, any case: the same variable', () => {
    for (const [a, b] of [
      ['zasolenie', 'Zasolenie [PSU]'],
      ['Zasolenie', 'ZASOLENIE [psu]'],
      ['alkalinitat', 'Alkalinität'],
      ['salinitat', 'SALINITÄT [PSU]'],
      ['temperature de l eau', "Température de l'eau [°C]"],
      ['temperature de l eau', 'température de l’eau'],
      ['oxygene dissous', 'Oxygène dissous [µmol/L]'],
      ['wegiel nieorganiczny rozpuszczony', 'Węgiel nieorganiczny rozpuszczony'],
      ['alkalicznosc calkowita', 'Alkaliczność całkowita'],
      ['gelost anorganischer kohlenstoff', 'gelöster anorganischer Kohlenstoff'],
    ]) {
      // the folded form of a word with its diacritics lost ("geloster" / "gelost") is not a name of its own: only the folded spelling of the name itself matches
      const ka = conceptVariable(a);
      const kb = conceptVariable(b);
      expect(kb, b).toBeDefined();
      if (ka !== undefined) expect(ka, a).toBe(kb);
    }
    for (const [a, b] of [
      ['zasolenie', 'Zasolenie [PSU]'],
      ['tlen', 'Tlen (µmol/kg)'],
      ['temperature', 'Temperatura'],
      ['alkalinitat', 'Alkalinität [µmol/kg]'],
      ['oxygene', 'Oxygène'],
      ['geloster sauerstoff', 'gelöster Sauerstoff'],
    ]) {
      expect(conceptVariable(a), a).toBeDefined();
      expect(conceptVariable(a), `${a} / ${b}`).toBe(conceptVariable(b));
    }
  });

  it('the table: every name of the brief, and only variables the vocabulary has', () => {
    const expected: Record<string, string[]> = {
      temperature: ['temperatura', 'temperatura wody', 'temp. wody', 'Temperatur', 'Wassertemperatur', 'température', "température de l'eau"],
      salinity: ['zasolenie', 'Salzgehalt', 'Salinität', 'salinité'],
      oxygen: ['tlen', 'tlen rozpuszczony', 'Sauerstoff', 'gelöster Sauerstoff', 'oxygène', 'oxygène dissous'],
      chlorophyll: ['chlorofil a', 'chlorofil-a', 'chlorofil', 'Chlorophyll a', 'Chlorophyll-a', 'chlorophylle a', 'chlorophylle-a'],
      nitrate: ['azotany', 'azotan', 'NO3', 'Nitrat', 'nitrate', 'nitrates'],
      nitrite: ['azotyny', 'azotyn', 'NO2', 'Nitrit', 'nitrite', 'nitrites'],
      'nitrate+nitrite': ['azotany+azotyny', 'suma azotanów i azotynów'],
      ammonium: ['amoniak', 'jon amonowy', 'amon', 'NH4', 'Ammonium', 'ammonium'],
      phosphate: ['fosforany', 'fosforan', 'PO4', 'Phosphat', 'phosphate', 'phosphates'],
      silicate: ['krzemiany', 'krzemian', 'krzemionka', 'SiO4', 'Silikat', 'silicate', 'silicates'],
      pH: ['pH'],
      TA: ['alkaliczność', 'alkaliczność całkowita', 'Alkalinität', 'alcalinité', 'alcalinité totale'],
      DIC: ['węgiel nieorganiczny rozpuszczony', 'DIC', 'gelöster anorganischer Kohlenstoff', 'carbone inorganique dissous'],
    };
    for (const [variable, names] of Object.entries(expected)) {
      expect(Object.prototype.hasOwnProperty.call(VARIABLE_CONCEPTS, variable), variable).toBe(true);
      for (const n of names) expect(conceptVariable(n), n).toBe(variable);
    }
    for (const v of new Set(VARIABLE_SYNONYMS.values())) expect(Object.prototype.hasOwnProperty.call(VARIABLE_CONCEPTS, v), v).toBe(true);
    // one folded name stands for one variable: the table was built without a name given to two
    const count = Object.values(expected).reduce((n, l) => n + l.length, 0);
    expect(VARIABLE_SYNONYMS.size).toBeLessThanOrEqual(count + 1); // 'ammonium', 'nitrate', ... repeat across languages and fold to one key
  });

  it('keeps the status the vocabulary gives: chlorophyll, DIC and alkalinity are only offered, never proposed, whatever the language', () => {
    for (const [name, unit] of [['Chlorofil a', 'µg/L'], ['Chlorophyll a', 'µg/L'], ['chlorophylle a', 'µg/L'], ['DIC', 'µmol/L'], ['Alkalinität', 'µmol/L'], ['alcalinité', 'µmol/kg']] as const) {
      const s = suggestType(name, unit);
      expect(s.proposed, name).toBeUndefined();
      expect(s.offered.length, name).toBeGreaterThan(0);
    }
  });

  it('English names and the canonical names of /check keep working, and an odd name stays unknown', () => {
    expect(suggestType('temperature', '°C').proposed?.code).toBe('TEMPPR01');
    expect(suggestType('pH', undefined).proposed?.code).toBe('PHXXZZXX');
    expect(suggestType('chlorophyll fluorescence', 'µg/L')).toEqual({ offered: [] });
    expect(suggestType('constructor', undefined)).toEqual({ offered: [] });
    expect(suggestType('__proto__', undefined)).toEqual({ offered: [] });
    expect(conceptVariable('toString')).toBeUndefined();
  });
});

describe('what must NOT get the water-body concept', () => {
  const none = (name: string, unit?: string): void => expect(suggestType(name, unit), `${name} [${unit ?? ''}]`).toEqual({ offered: [] });

  it('air temperature in three languages', () => {
    for (const n of ['temperatura powietrza', 'Temperatura powietrza [°C]', 'Lufttemperatur', 'Lufttemperatur [°C]', "température de l'air", 'Température de l’air [°C]']) {
      expect(conceptVariable(n), n).toBeUndefined();
      none(n, '°C');
    }
  });

  it('a laboratory temperature: no proposal', () => {
    for (const n of ['temperatura próbki', 'Temperatura próbki [°C]', 'temperatura inkubacji', 'Temperatura inkubacji [°C]']) {
      expect(conceptVariable(n), n).toBeUndefined();
      none(n, '°C');
    }
  });

  it('a saturation: nothing is proposed (no saturation concept is verified), and "nasycenie tlenem" is not oxygen at all', () => {
    expect(conceptVariable('nasycenie tlenem')).toBeUndefined();
    none('nasycenie tlenem', '%');
    none('Nasycenie tlenem [%]', '%');
    expect(suggestType('tlen', '%').proposed).toBeUndefined();
    expect(suggestType('Tlen [%]', '%').proposed).toBeUndefined();
  });

  it('chlorophyll (and a nutrient) per unit mass of a sediment: no water-body concept, whether it is offered or proposed', () => {
    expect(suggestType('chlorofil', 'µg/g')).toEqual({ offered: [] });
    expect(suggestType('Chlorofil [µg/g]', 'µg/g')).toEqual({ offered: [] });
    expect(suggestType('Chlorophyll a', 'mg/kg')).toEqual({ offered: [] });
    expect(suggestType('chlorophyll', 'ug g-1')).toEqual({ offered: [] });
    expect(suggestType('azotany', 'µmol/g').proposed).toBeUndefined();
    expect(suggestType('azotany', 'µmol/g').offered).toEqual([]);
  });

  it('names that only CONTAIN a known name are never matched (whole headers, never substrings)', () => {
    for (const n of ['temperatura dna', 'zasolenie wody powierzchniowej', 'tlen w osadzie', 'amoniak calkowity', 'chlorofil a w osadzie', 'sea temperatura', 'azotanowy', 'pH metr', 'Nitratgehalt', 'Sauerstoffsättigung', 'salinité de surface', 'oxygène dissous saturation']) {
      expect(conceptVariable(n), n).toBeUndefined();
      none(n, 'µmol/L');
    }
  });
});

describe('units: the dimension a unit states', () => {
  it('per volume, per mass, or neither', () => {
    for (const u of ['µmol/L', 'mg/l', 'mg/m3', 'µg/m³', 'g/m3', 'ml/L', 'µg l-1', 'umol/dm3', 'nmol/L', 'mg/ml']) expect(unitDimension(u), u).toBe('volume');
    for (const u of ['µmol/kg', 'µmol kg-1', 'mg/kg', 'µg/g', 'ug g-1', 'g/kg', 'mg/g']) expect(unitDimension(u), u).toBe('mass');
    for (const u of ['°C', 'PSU', '%', '‰', 'µatm', 'm', '', 'ind./m2', 'mg/m2']) expect(unitDimension(u), u).toBeUndefined();
  });

  it('what a label states', () => {
    expect(labelDimension('Concentration of oxygen per unit mass of the water body')).toBe('mass');
    expect(labelDimension('Concentration of x per unit dry weight of sediment [particulate phase]')).toBe('mass');
    expect(labelDimension('Concentration of x per unit wet weight of sediment')).toBe('mass');
    expect(labelDimension('Concentration of nitrate per unit volume of the water body')).toBe('volume');
    expect(labelDimension('Temperature of the water body')).toBeUndefined();
    expect(labelDimension('Abundance per unit area of the bed')).toBeUndefined();
    expect(unitContradictsConcept('x per unit volume', undefined)).toBe(false);
    expect(unitContradictsConcept(undefined, 'mg/L')).toBe(false);
  });
});

/* ---------- through the whole conversion ---------- */

const SCLAFLT3 = 'Concentration of chlorophyll-a per unit dry weight of sediment by filtration and fluorometry'; // invented wording of a "per unit dry weight of sediment" label
const HEADER = [...W1_HEADER, 'Temperatura [°C]', 'Zasolenie [PSU]', 'Tlen [µmol/kg]', 'Chlorofil a [mg/m3]', 'Azotany [µmol/L]'];
const ROWS: Cell[][] = [
  [...W1_ROWS[0], 7.25, 34.8, 310, 1.2, 4.1],
  [...W1_ROWS[1], 6.9, 35.0, 300, 1.4, 3.9],
  [...W1_ROWS[2], 7.1, 35.1, 295.5, 0.9, 4.4],
];
const ix = (name: string): number => HEADER.indexOf(name);
const uri = (c: 'P01' | 'P06', code: string): string => nercUri(c, code);
const pick = (c: 'P01' | 'P06', code: string, source: 'suggested' | 'nvs' = 'suggested', label?: string) => ({ id: uri(c, code), source, deprecated: false as const, ...(label === undefined ? {} : { label }) });
const run = (nerc?: NercDecisions) => exportSheet(HEADER, ROWS, { quantity: { kind: 'count' }, fullList: true, device: { kind: 'known', key: 'bongo' }, ...(nerc ? { nerc } : {}) });
const mismatches = (e: Awaited<ReturnType<typeof run>>) => e.findings.filter((f) => f.ruleId === 'CONV-NERC-UNIT-MISMATCH');

describe('Polish headers of a wide sheet are variables, and the concept the user confirms is written', () => {
  it('the recogniser keeps the Polish measured-variable headers as variables (not taxon candidates), and still takes an unknown numeric header for a taxon', () => {
    const file = fileOf([...W1_HEADER, 'Temperatura [°C]', 'Suma azotanów i azotynów [µmol/L]', 'temperatura powietrza [°C]', 'Zasolenie [PSU]'], [[...W1_ROWS[0], 7.2, 8.1, 9.5, 34.8]]);
    const roles = Object.fromEntries(mappingOf(file).columns.map((c) => [c.header, c.role]));
    expect(roles['Temperatura [°C]']).toMatchObject({ kind: 'variable', variable: 'Temperatura', unit: '°C' });
    expect(roles['Zasolenie [PSU]']).toMatchObject({ kind: 'variable', variable: 'Zasolenie' });
    expect(roles['Suma azotanów i azotynów [µmol/L]']).toMatchObject({ kind: 'variable' }); // a "sum" header, but a measured variable: not ignored as a total
    expect(roles['temperatura powietrza [°C]']).toMatchObject({ kind: 'taxon', header: true });
  });

  it('a confirmed concept for a Polish column is written for that column; nothing is written for the others', async () => {
    const t = ix('Temperatura [°C]');
    const e = await run({ [String(t)]: { type: pick('P01', 'TEMPPR01'), unit: pick('P06', 'UPAA') } });
    const rows = objects((await readBack(e.zip)).tables['extendedmeasurementorfact.txt']).filter((m) => m.measurementType === 'Temperatura' || m.measurementType === 'Zasolenie');
    for (const m of rows) {
      if (m.measurementType === 'Temperatura') expect([m.measurementTypeID, m.measurementUnitID]).toEqual([uri('P01', 'TEMPPR01'), uri('P06', 'UPAA')]);
      else expect([m.measurementTypeID, m.measurementUnitID]).toEqual(['', '']);
    }
    expect(e.findings.find((f) => f.ruleId === 'CONV-NERC-UNKNOWN')?.params.what).toContain('Zasolenie');
    expect(mismatches(e)).toEqual([]);
  });
});

describe('CONV-NERC-UNIT-MISMATCH: a confirmed concept whose label contradicts the unit', () => {
  it('"per unit dry weight of sediment" (an NVS result) on a per-volume column (mg/m3): said once, with the column, the code and the unit; an accept warning', async () => {
    const col = ix('Chlorofil a [mg/m3]');
    const e = await run({ [String(col)]: { type: pick('P01', 'SCLAFLT3', 'nvs', SCLAFLT3) } });
    const f = mismatches(e);
    expect(f.length).toBe(1);
    expect(f[0].params).toEqual({ column: 'Chlorofil a [mg/m3]', code: 'SCLAFLT3', unit: 'mg/m3' });
    expect(f[0].severity).toBe('warning');
    expect(policyOf(f[0])).toBe('accept');
    for (const lang of LANGS) {
      const text = renderConvertPlain(f[0], lang);
      expect(text, lang).toContain('Chlorofil a [mg/m3]');
      expect(text, lang).toContain('SCLAFLT3');
      expect(text, lang).toContain('mg/m3');
    }
  });

  it('"per unit volume" (a verified concept) on a per-mass column: said; the other direction', async () => {
    const col = ix('Tlen [µmol/kg]');
    const e = await run({ [String(col)]: { type: pick('P01', 'DOXYZZXX') } });
    expect(mismatches(e).map((f) => f.params)).toEqual([{ column: 'Tlen [µmol/kg]', code: 'DOXYZZXX', unit: 'µmol/kg' }]);
    // an NVS result per unit volume on a per-mass unit
    const e2 = await run({ [String(col)]: { type: pick('P01', 'NTRAZZXX', 'nvs', 'Concentration of nitrate per unit volume of the water body [unknown phase]') } });
    expect(mismatches(e2).length).toBe(1);
    // a per-mass NVS result on a per-volume unit
    const e3 = await run({ [String(ix('Azotany [µmol/L]'))]: { type: pick('P01', 'XXXXMASS', 'nvs', 'Concentration of nitrate per unit mass of the water body') } });
    expect(mismatches(e3).map((f) => f.params.code)).toEqual(['XXXXMASS']);
  });

  it('no warning when the dimensions agree, when the label or the unit states none, or when nothing is confirmed', async () => {
    const e = await run({
      [String(ix('Tlen [µmol/kg]'))]: { type: pick('P01', 'DOXMZZXX') }, // per mass on per mass
      [String(ix('Azotany [µmol/L]'))]: { type: pick('P01', 'NTRAZZXX') }, // per volume on per volume
      [String(ix('Temperatura [°C]'))]: { type: pick('P01', 'TEMPPR01') }, // states neither
      [String(ix('Chlorofil a [mg/m3]'))]: { type: pick('P01', 'CPHLZZXX', 'nvs') }, // an NVS pick without a label: nothing to compare
    });
    expect(mismatches(e)).toEqual([]);
    expect(mismatches(await run())).toEqual([]);
    // a label of an NVS result per unit mass on a unit that states no dimension: no warning
    const e2 = await run({ [String(ix('Zasolenie [PSU]'))]: { type: pick('P01', 'XXXXMASS', 'nvs', 'Something per unit mass') } });
    expect(mismatches(e2)).toEqual([]);
  });

  it('a page cannot make a verified pick say something else: the label of a "suggested" pick is the verified list\'s, not the page\'s', async () => {
    const col = ix('Tlen [µmol/kg]');
    const e = await run({ [String(col)]: { type: pick('P01', 'DOXYZZXX', 'suggested', 'Something per unit mass') } });
    expect(mismatches(e).length).toBe(1); // DOXYZZXX is per volume on a per-mass unit, whatever the page wrote
    expect(pickLabel({ id: uri('P01', 'DOXYZZXX'), source: 'suggested', deprecated: false, label: 'x' })).toMatch(/per unit volume/);
  });

  it('the rule is registered in four languages, without placeholders left over', () => {
    for (const lang of LANGS) {
      const text = renderConvertPlain({ ruleId: 'CONV-NERC-UNIT-MISMATCH', severity: 'warning', params: { column: 'C', code: 'ABCD1234', unit: 'mg/L' } }, lang);
      expect(text, lang).not.toMatch(/\{/);
      expect(text.length, lang).toBeLessThanOrEqual(330);
    }
  });
});

describe('CONV-NERC-UNKNOWN says the NVS search works with English words', () => {
  it('in all four languages, with the example words, within the character limit', () => {
    for (const lang of LANGS) {
      const text = renderConvertPlain({ ruleId: 'CONV-NERC-UNKNOWN', severity: 'warning', params: { what: 'x' } }, lang);
      for (const w of ['temperature', 'salinity', 'chlorophyll']) expect(text, `${lang} ${w}`).toContain(w);
      expect(text.length, lang).toBeLessThanOrEqual(340); // the rendered text holds the quotation marks of the name; the registry text itself is limited to 330 by rules.test.ts
    }
  });
});
