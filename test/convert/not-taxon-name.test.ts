// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A header that says it is not a taxon is not proposed as one (round 3, Task 4); header-based only, never from values.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { nameKind, notTaxonWord } from '../../src/core/convert/measured';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { rawSheet } from '../helpers/files';
import { CTX, fileOf, sheetInput } from './helpers';

const HEADER = ['Station', 'Coords N', 'Coords E', 'w_PH', 'Calanus finmarchicus', 'Oithona'];
const ROWS = [
  ['S1', 55.5, 2.5, 7.9, 10, 5],
  ['S2', 55.9, 3.1, 8.1, 7, 4],
];

describe('nameKind with a not-taxon word', () => {
  it('keeps taxon shapes', () => {
    for (const h of ['Macoma_balthica', 'Pseudo-nitzschia', 'Acartia/Centropages', 'Calanus [ind/m3]']) expect(nameKind(h), h).toBe('taxon');
    expect(nameKind('Shannon index [ind]', true)).toBe('taxon');
  });
  it('reads camel case and underscores as words', () => {
    expect(nameKind('CurrentVelocity')).toBe('not-taxon');
    expect(notTaxonWord('CurrentVelocity')).toBe('velocity');
    expect(notTaxonWord('w_PH')).toBe('ph');
    expect(notTaxonWord('Coords N')).toBe('coords');
    expect(notTaxonWord('Macoma_balthica')).toBeUndefined();
    expect(notTaxonWord('Pseudo-nitzschia')).toBeUndefined();
    expect(notTaxonWord('PH')).toBeUndefined(); // a single variable token is a variable, not a not-taxon word
  });
});

describe('wide sheet proposals', () => {
  const props = proposeConvertColumns(rawSheet([...HEADER], ROWS.map((r) => [...r])), CTX);
  it('ignores the three headers with a note that names the word', () => {
    for (const [h, w] of [['Coords N', 'coords'], ['Coords E', 'coords'], ['w_PH', 'ph']]) {
      const p = props.find((x) => x.header === h)!;
      expect(p.role.kind, h).toBe('ignore');
      expect(p.reasonCode, h).toBe('not-taxon-name');
      expect(p.reasonParams, h).toEqual({ word: w });
    }
  });
  it('the species stay taxon candidates', () => {
    for (const h of ['Calanus finmarchicus', 'Oithona']) expect(props.find((x) => x.header === h)!.role.kind).toBe('taxon');
  });
  it('a header with a measurement unit keeps the unit rule', () => {
    const p = proposeConvertColumns(rawSheet(['Station', 'Current velocity [m/s]', 'Calanus finmarchicus'], [['S1', 0.4, 3], ['S2', 0.5, 4]]), CTX).find((x) => x.header === 'Current velocity [m/s]')!;
    expect(p.role.kind).toBe('variable');
  });
  it('values never propose it: a column of years or one fractional value stays ignored with the name reason', () => {
    const p = proposeConvertColumns(rawSheet(['Station', 'Position', 'Calanus finmarchicus'], [['S1', 2020, 3], ['S2', 2021, 4]]), CTX).find((x) => x.header === 'Position')!;
    expect(p.reasonCode).toBe('not-taxon-name');
  });
});

describe('convert of the confirmed sheet', () => {
  it('lists w_PH in CONV-COLUMN-IGNORED-PROPOSED', () => {
    const file = fileOf(['Station', 'Date', 'Latitude', 'Longitude', 'w_PH', 'Calanus finmarchicus', 'Oithona'], [['S1', '2023-06-14', 55.5, 2.5, 7.9, 10, 5], ['S2', '2023-06-14', 55.9, 3.1, 8.1, 7, 4]]);
    const r = convert({ sheets: [sheetInput(file, { shape: 'wide', quantity: { kind: 'count' } })] });
    const f = r.findings.filter((x) => x.ruleId === 'CONV-COLUMN-IGNORED-PROPOSED');
    expect(JSON.stringify(f.map((x) => x.params))).toContain('w_PH');
  });
});
