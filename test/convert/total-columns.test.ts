// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A column NAMED like a total on a long sheet is decided by its values (an all-taxa total repeats on every row of a sample), and a mass unit written in the name of a biomass column
// (weight_kg_total, wt_mg) survives to measurementUnit with its P06 id. Every value is invented.
import { describe, expect, it } from 'vitest';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { massUnitInName, valuesRepeatWithinSample } from '../../src/core/convert/totalColumns';
import { P06_MASS } from '../../src/core/convert/vocab';
import { rawSheet } from '../helpers/files';
import { exportSheet } from './exportHelpers';
import type { Cell } from './helpers';

const ctx = { decimalComma: false, date1904: false };
const proposals = (header: string[], rows: Cell[][]) => proposeConvertColumns(rawSheet(header, rows), ctx);

// two tows, two taxa each: a weight of each taxon
const PER_TAXON: Cell[][] = [
  ['T1', 'Gadus morhua', 1.5, 1],
  ['T1', 'Merluccius merluccius', 2.5, 2],
  ['T2', 'Gadus morhua', 3.5, 3],
  ['T2', 'Clupea harengus', 0.5, 7],
];
// the same value on every row of a tow: the sum of the tow
const ALL_TAXA: Cell[][] = [
  ['T1', 'Gadus morhua', 4, 1],
  ['T1', 'Merluccius merluccius', 4, 2],
  ['T2', 'Gadus morhua', 4.5, 3],
  ['T2', 'Clupea harengus', 4.5, 7],
];

describe('a total-named column of a long sheet', () => {
  it('whose values differ between the rows of a tow gets a visible low-confidence proposal, not a silent ignore', () => {
    const p = proposals(['towid', 'taxa', 'weight_kg_total', 'num_caught'], PER_TAXON).find((x) => x.header === 'weight_kg_total')!;
    expect(p.role).toEqual({ kind: 'biomass' });
    expect(p.confidence).toBe('low');
    expect(p.reasonCode).toBe('summary-total-biomass');
  });

  it('a column without a mass unit is proposed as the quantity of each row when the sheet has none', () => {
    const p = proposals(['towid', 'taxa', 'Total', 'num_caught'], PER_TAXON).find((x) => x.header === 'Total')!;
    expect(p.role).toEqual({ kind: 'quantity' });
    expect(p.confidence).toBe('low');
    expect(p.reasonCode).toBe('summary-total-quantity');
  });

  it('and stays ignored, with its own visible reason, when the sheet already has a quantity column', () => {
    const p = proposals(['towid', 'taxa', 'Abundance', 'Total'], [['T1', 'Gadus morhua', 3, 1], ['T1', 'Merluccius merluccius', 2, 2], ['T2', 'Gadus morhua', 5, 3], ['T2', 'Clupea harengus', 1, 7]]).find((x) => x.header === 'Total')!;
    expect(p.role).toEqual({ kind: 'ignore' });
    expect(p.confidence).toBe('low');
    expect(p.reasonCode).toBe('summary-total-varies');
  });

  it('whose value repeats on every row of a sample is a real total and stays ignored', () => {
    const p = proposals(['towid', 'taxa', 'weight_kg_total', 'num_caught'], ALL_TAXA).find((x) => x.header === 'weight_kg_total')!;
    expect(p.role).toEqual({ kind: 'ignore' });
    expect(p.reasonCode).toBe('summary-total');
  });

  it('is decided by the values and not by the word: the same header, two verdicts', () => {
    const a = proposals(['towid', 'taxa', 'Total', 'n'], PER_TAXON).find((x) => x.header === 'Total')!;
    const b = proposals(['towid', 'taxa', 'Total', 'n'], ALL_TAXA).find((x) => x.header === 'Total')!;
    expect(a.reasonCode).not.toBe('summary-total');
    expect(b.reasonCode).toBe('summary-total');
  });

  it('with nothing to tell the samples apart, or one row per sample, it stays ignored as before', () => {
    expect(proposals(['taxa', 'weight_kg_total', 'n'], [['Gadus morhua', 1.5, 1], ['Clupea harengus', 2.5, 2]]).find((x) => x.header === 'weight_kg_total')!.reasonCode).toBe('summary-total');
    expect(proposals(['towid', 'taxa', 'weight_kg_total', 'n'], [['T1', 'Gadus morhua', 1.5, 1], ['T2', 'Clupea harengus', 2.5, 2]]).find((x) => x.header === 'weight_kg_total')!.reasonCode).toBe('summary-total');
  });

  it('a wide sheet is untouched: a total column stays ignored', () => {
    const p = proposals(['Sample', 'Station', 'Calanus finmarchicus', 'Oithona similis', 'Total copepods'], [['a', 'S1', 3, 4, 7], ['b', 'S2', 1, 2, 3]]).find((x) => x.header === 'Total copepods')!;
    expect(p.reasonCode).toBe('summary-total');
  });

  it('values: constant / varies / unknown', () => {
    const base = proposals(['towid', 'taxa', 'w', 'n'], PER_TAXON);
    expect(valuesRepeatWithinSample(rawSheet(['towid', 'taxa', 'w', 'n'], PER_TAXON), base.map((q) => (q.header === 'towid' ? { ...q, role: { kind: 'sampleId' as const } } : q)), 2, false)).toBe('varies');
    expect(valuesRepeatWithinSample(rawSheet(['towid', 'taxa', 'w', 'n'], ALL_TAXA), base.map((q) => (q.header === 'towid' ? { ...q, role: { kind: 'sampleId' as const } } : q)), 2, false)).toBe('constant');
    // a text column that no role names still separates the samples when it is not a function of the taxon
    expect(valuesRepeatWithinSample(rawSheet(['towid', 'taxa', 'w', 'n'], PER_TAXON), base, 2, false)).toBe('varies');
    // nothing separates them
    const bare = rawSheet(['taxa', 'w', 'n'], PER_TAXON.map((r) => r.slice(1)));
    expect(valuesRepeatWithinSample(bare, proposeConvertColumns(bare, ctx), 1, false)).toBe('unknown');
  });
});

describe('the unit of a biomass column written in its name', () => {
  it('reads a mass unit among the words of the name, and only one', () => {
    expect(massUnitInName('weight_kg_total')).toBe('kg');
    expect(massUnitInName('wt_mg')).toBe('mg');
    expect(massUnitInName('Weight_g')).toBe('g');
    expect(massUnitInName('biomass g')).toBe('g');
    expect(massUnitInName('weight_total')).toBeUndefined();
    expect(massUnitInName('weight_kg_g')).toBeUndefined();
    expect(massUnitInName('kgs')).toBeUndefined();
  });

  const H = ['Station', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'];
  it.each([
    ['weight_kg_total', 'kg', P06_MASS.kilogram],
    ['wt_mg', 'mg', P06_MASS.milligram],
    ['Weight_g', 'g', P06_MASS.gram],
  ])('%s: measurementUnit %s with its P06 id', async (name, unit, term) => {
    const header = [...H, name];
    const rows: Cell[][] = [['S1', '2023-06-14', 55.5, 2.5, 'Gadus morhua', 3, 1.5], ['S1', '2023-06-14', 55.5, 2.5, 'Clupea harengus', 2, 0.5]];
    const e = await exportSheet(header, rows, { quantity: { kind: 'count' }, shape: 'long', edit: { Station: { kind: 'sampleId' }, [name]: { kind: 'biomass', basis: 'wet' } } });
    const m = e.dataset.measurements.filter((x) => x.type.toLowerCase().includes('weight'));
    expect(m).toHaveLength(2);
    expect(m.map((x) => x.unit)).toEqual([unit, unit]);
    expect(m.every((x) => x.unitId === term.uri)).toBe(true);
  });
});
