// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Round 3, item 7: a biomass per sample, a percent cover and an abundance class. A class is an ordinal scale and is never written as individual counts.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { notWrittenRows } from '../../src/core/convert/notWritten';
import { resolveQuantity } from '../../src/core/convert/quantity';
import type { QuantityDeclaration } from '../../src/core/convert/quantity';
import { COVER_TYPE, P01_COVER, P06_PERCENT } from '../../src/core/convert/vocab';
import type { Finding } from '../../src/core/types';
import { exportSheet } from './exportHelpers';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const find = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id);
const HEADER = ['Plot', 'Date', 'Latitude', 'Longitude', 'Zostera marina', 'Ulva lactuca'];
const PLOT = { Plot: { kind: 'sampleId' as const } };
const rowsOf = (...values: Cell[][]): Cell[][] => values.map((v, i) => [`P${i + 1}`, '2023-07-01', 55.1, 3.2, ...v]);
const run = (rows: Cell[][], quantity: QuantityDeclaration, fullList = false) => {
  const sheets = [sheetInput(fileOf(HEADER, rows, 'Plots'), { quantity, edit: PLOT })];
  return { sheets, r: convert({ sheets, options: { fullList } }) };
};
const quantityRows = (r: ReturnType<typeof convert>) => r.measurements.filter((m) => m.target.kind === 'occurrence');

describe('biomass per sample', () => {
  const decl: QuantityDeclaration = { kind: 'biomass', basis: 'wet', unit: 'g', per: 'sample' };

  it('is the S06 wet weight biomass with the gram unit, asks for no medium and writes no individualCount', () => {
    const { r } = run(rowsOf([12.5, 3]), decl);
    expect(r.blocking).toEqual([]);
    const m = quantityRows(r);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ role: 'biomass', measurementType: 'Wet weight biomass', measurementTypeId: 'http://vocab.nerc.ac.uk/collection/S06/current/S0600088/', measurementValue: '12.5', measurementUnit: 'g', measurementUnitId: 'http://vocab.nerc.ac.uk/collection/P06/current/UGRM/' });
    expect(find(r.findings, 'CONV-QUANTITY-UNDECLARED')).toEqual([]);
    expect(r.occurrences.every((o) => o.individualCount === undefined && o.organismQuantity === undefined)).toBe(true);
  });

  it('a rate unit with per sample is missing "unit not per sample"; a missing basis or a non-mass unit is named too', () => {
    const missing = (d: QuantityDeclaration) => find(run(rowsOf([1, 2]), d).r.blocking, 'CONV-QUANTITY-UNDECLARED')[0]?.params.missing;
    expect(missing({ ...decl, unit: 'g/m2' })).toContain('unit not per sample');
    expect(missing({ ...decl, unit: 'g per litre' })).toContain('unit not per sample');
    expect(missing({ kind: 'biomass', unit: 'g', per: 'sample' })).toBe('basis');
    expect(missing({ ...decl, unit: 'ind' })).toBe('mass unit (g, mg or kg)');
    expect(missing({ ...decl, unit: '' })).toBe('unit');
  });

  it('a declared sample size is said in the remarks of the row', () => {
    const { r } = run(rowsOf([12.5, 3]), { ...decl, effort: { source: 'constant', value: '0.25', unit: 'm2' } });
    expect(quantityRows(r)[0].measurementRemarks).toBe('per sample of 0.25 m2');
  });

  it('zeros are as for a count: not written without a full list, an absent record with one', () => {
    expect(run(rowsOf([0, 3]), decl).r.occurrences.map((o) => o.scientificName)).toEqual(['Ulva lactuca']);
    const full = run(rowsOf([0, 3]), decl, true).r;
    expect(full.occurrences.map((o) => [o.scientificName, o.occurrenceStatus])).toEqual([['Zostera marina', 'absent'], ['Ulva lactuca', 'present']]);
    expect(quantityRows(full)).toHaveLength(1);
  });
});

describe('percent cover', () => {
  const decl: QuantityDeclaration = { kind: 'cover' };

  it('is an organismQuantity with the GBIF type and an eMoF row with the percent unit, never an individualCount', () => {
    const { r } = run(rowsOf([27.5, 100]), decl);
    expect(r.blocking).toEqual([]);
    expect(r.occurrences.map((o) => [o.organismQuantity, o.organismQuantityType, o.individualCount])).toEqual([[27.5, COVER_TYPE, undefined], [100, COVER_TYPE, undefined]]);
    const m = quantityRows(r)[0];
    expect(m).toMatchObject({ role: 'cover', measurementType: P01_COVER.coverage.label, measurementTypeId: P01_COVER.coverage.uri, measurementValue: '27.5', measurementUnit: '%', measurementUnitId: P06_PERCENT.uri });
    expect(find(r.findings, 'CONV-NERC-UNKNOWN')).toEqual([]);
  });

  it('uses the replacement concept PCOV7736 and never the deprecated SDBIOL10', () => {
    expect(P01_COVER.coverage.code).toBe('PCOV7736');
    expect(JSON.stringify(P01_COVER)).not.toContain('SDBIOL10');
    expect(COVER_TYPE).toBe('percentage coverage');
  });

  it('a value above 100 blocks with CONV-COVER-RANGE naming the cell, and the cell is in the not-written list', () => {
    const { r, sheets } = run(rowsOf([27.5, 120]), decl);
    const f = find(r.blocking, 'CONV-COVER-RANGE');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ field: 'Ulva lactuca', lines: [2], value: '120' });
    expect(r.occurrences.map((o) => o.scientificName)).toEqual(['Zostera marina']);
    const rows = [...notWrittenRows(r.ledger, sheets, r.leftOut)];
    expect(r.ledger[0].lines.find((l) => l.line === 2)?.lostCells).toEqual([expect.objectContaining({ reason: 'cover-range' })]);
    expect(rows.filter((x) => x.line === 2).map((x) => x.detail)).toEqual(['Ulva lactuca (cover-range)']);
  });

  it('a declared unit that is not percent is not turned into one', () => {
    expect(find(run(rowsOf([0.5, 1]), { kind: 'cover', unit: 'fraction' }).r.blocking, 'CONV-QUANTITY-UNDECLARED')[0].params.missing).toBe('unit not percent');
    expect(run(rowsOf([5, 1]), { kind: 'cover', unit: 'percent' }).r.blocking).toEqual([]);
  });
});

describe('abundance class', () => {
  const decl: QuantityDeclaration = { kind: 'class', scale: { name: '', min: '0', max: '5', meanings: { '3': 'common' } } };

  it('is an organismQuantity of the class type, never an individualCount; the eMoF row carries the typed meaning', () => {
    const { r } = run(rowsOf([3, 1]), decl);
    expect(r.occurrences.map((o) => [o.organismQuantity, o.organismQuantityType, o.individualCount])).toEqual([[3, 'abundance class 0–5', undefined], [1, 'abundance class 0–5', undefined]]);
    const m = quantityRows(r);
    expect(m[0]).toMatchObject({ role: 'class', measurementType: 'abundance class (0–5)', measurementValue: '3', measurementRemarks: 'common' });
    expect(m[0].measurementTypeId).toBeUndefined();
    expect(m[0].measurementUnit).toBeUndefined();
    expect(m[1].measurementRemarks).toBeUndefined();
    // no verified concept for a class: said, not invented
    expect(find(r.findings, 'CONV-NERC-UNKNOWN')[0].params.what).toBe('abundance class');
    expect(r.methodSteps).toEqual(['Sheet Plots of sheet.csv: abundance classes 0–5: 3 = common']);
  });

  it('a named scale is in the label', () => {
    const { r } = run(rowsOf([3, 1]), { kind: 'class', scale: { name: 'Braun-Blanquet', min: '1', max: '5' } });
    expect(r.occurrences[0].organismQuantityType).toBe('abundance class Braun-Blanquet 1–5');
    expect(r.methodSteps).toEqual(['Sheet Plots of sheet.csv: abundance classes Braun-Blanquet 1–5']);
  });

  it('a value above the scale or not whole blocks with CONV-CLASS-VALUE, and is not written', () => {
    const { r, sheets } = run(rowsOf([6, 2.5], [3, 0]), decl);
    const f = find(r.blocking, 'CONV-CLASS-VALUE');
    expect(f.map((x) => [x.field, x.lines, x.value])).toEqual([['Zostera marina', [2], '6'], ['Ulva lactuca', [2], '2.5']]);
    expect(f[0].params.scale).toBe('0–5');
    expect(r.occurrences.map((o) => o.scientificName)).toEqual(['Zostera marina']);
    expect(r.occurrences[0].organismQuantity).toBe(3);
    expect([...notWrittenRows(r.ledger, sheets, r.leftOut)].filter((x) => x.line === 2).map((x) => x.detail)).toEqual(['Zostera marina (class-value); Ulva lactuca (class-value)']);
  });

  it('a class below the scale blocks even for a zero', () => {
    expect(find(run(rowsOf([0, 2]), { kind: 'class', scale: { name: '', min: '1', max: '5' } }).r.blocking, 'CONV-CLASS-VALUE')).toHaveLength(1);
  });

  it('is described in the EML methods after the person\'s text, one methodStep per paragraph', async () => {
    const e = await exportSheet(HEADER, rowsOf([3, 1]), { quantity: decl, edit: PLOT, meta: { methods: 'Quadrats of an invented survey.' } });
    const steps = [...e.eml.matchAll(/<methodStep>[\s\S]*?<\/methodStep>/g)].map((m) => m[0]);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toContain('Quadrats of an invented survey.');
    expect(steps[1]).toContain('abundance classes 0–5');
    expect(steps[1]).toContain('3 = common');
  });

  it('a scale that is not usable is missing "scale", and so is a meaning for a class outside it', () => {
    const missing = (scale: QuantityDeclaration['scale']) => {
      const q = resolveQuantity({ kind: 'class', scale });
      return q.ok ? undefined : q.missing;
    };
    expect(missing(undefined)).toEqual(['scale']);
    expect(missing({ name: '', min: '5', max: '5' })).toEqual(['scale']);
    expect(missing({ name: '', min: '0', max: '2.5' })).toEqual(['scale']);
    expect(missing({ name: '', min: 'a', max: '5' })).toEqual(['scale']);
    expect(missing({ name: '', min: '0', max: '5', meanings: { '9': 'x' } })).toEqual(['scale']);
    expect(missing({ name: '', min: '0', max: '5', meanings: { '2': '  ' } })).toBeUndefined();
  });

  it('typed words with a tab are not written (CONV-TAB-IN-VALUE)', () => {
    const { r } = run(rowsOf([3, 1]), { kind: 'class', scale: { name: '', min: '0', max: '5', meanings: { '3': 'com\tmon' } } });
    expect(find(r.blocking, 'CONV-TAB-IN-VALUE')).toHaveLength(1);
  });
});

describe('the other declarations are unchanged', () => {
  it('a count has no methodSteps and the density and area biomass still resolve as before', () => {
    expect(run(rowsOf([3, 1]), { kind: 'count' }).r.methodSteps).toEqual([]);
    const q = resolveQuantity({ kind: 'biomass', basis: 'wet', unit: 'g/m2', medium: 'bed' });
    expect(q).toMatchObject({ ok: true, quantity: { kind: 'biomass', unit: 'g/m2', type: { code: 'SDBIOL05' }, unitId: { code: 'UGMS' } } });
  });
});
