// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// CONV-NO-OCCURRENCES names an empty quantity column as the cause (round 3, Task 2).
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { makeConvertFinding, renderConvertPlain, renderConvertTechnical } from '../../src/core/rules/convert';
import type { Finding } from '../../src/core/types';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const HEADER = ['Sample', 'Date', 'Latitude', 'Longitude', 'Taxon', 'Count', 'Abundance'];
const row = (sample: string, taxon: string, count: Cell): Cell[] => [sample, '2023-06-14', 55.1, 3.2, taxon, count, null];
const counts = (rows: Cell[][], name = 'Counts') => {
  const file = fileOf(HEADER, rows, name);
  return sheetInput(file, { shape: 'long', edit: { Abundance: { kind: 'ignore' } }, quantity: { kind: 'count' } });
};
const noOcc = (fs: Finding[]) => fs.filter((f) => f.ruleId === 'CONV-NO-OCCURRENCES');

describe('CONV-NO-OCCURRENCES with an empty quantity column', () => {
  it('names the column and the number of rows', () => {
    const r = convert({ sheets: [counts([row('S1', 'Calanus finmarchicus', null), row('S1', 'Oithona similis', null), row('S2', 'Calanus finmarchicus', null), row('S2', 'Oithona similis', null)])] });
    const f = noOcc(r.findings);
    expect(f).toHaveLength(1);
    expect(f[0].params).toEqual({ variant: 'empty-quantity', column: 'Count', rows: 4 });
    expect(f[0].sheet).toBe('Counts');
    const text = renderConvertPlain(f[0], 'en');
    expect(text).toContain('The quantity column "Count" of sheet "Counts" is empty in all 4 rows, so nothing was written.');
    expect(text).not.toContain('add a sheet with taxa');
  });

  it('a sheet with no taxon at all keeps today\'s params', () => {
    const file = fileOf(['Sample', 'Date', 'Latitude', 'Longitude', 'Temperature [°C]'], [['S1', '2023-06-14', 55.1, 3.2, 7.1]], 'Tanks');
    const r = convert({ sheets: [sheetInput(file, { profile: { positionStation: true } })] });
    for (const f of noOcc(r.findings)) expect(f.params).toEqual({});
  });

  it('zeros keep today\'s text when another sheet has a blank quantity column (F11)', () => {
    const zeros = counts([row('S1', 'Calanus finmarchicus', 0)], 'Fish');
    const blank = counts([row('S1', 'Calanus finmarchicus', null), row('S2', 'Oithona similis', null)], 'Counts');
    const r = convert({ sheets: [zeros, blank] });
    const f = noOcc(r.findings);
    expect(f).toHaveLength(1);
    expect(f[0].params).toEqual({ zeros: 'yes' });
    expect(f[0].sheet).toBe('Fish');
  });

  it('the generic finding renders with no placeholder left, in every language and in the technical text', () => {
    const f = makeConvertFinding('CONV-NO-OCCURRENCES', { file: 'f.csv', sheet: 'S', params: {} });
    expect(renderConvertTechnical(f)).not.toContain('{');
    for (const l of ['en', 'pl', 'de', 'fr'] as const) expect(renderConvertPlain(f, l)).not.toContain('{');
  });

  it('the variant reads in Polish, and for one row in the singular', () => {
    const f = makeConvertFinding('CONV-NO-OCCURRENCES', { file: 'f.csv', sheet: 'Counts', params: { variant: 'empty-quantity', column: 'Count', rows: 4 } });
    expect(renderConvertPlain(f, 'pl')).toContain('Kolumna ilości „Count” arkusza „Counts” jest pusta we wszystkich 4 wierszach');
    const one = makeConvertFinding('CONV-NO-OCCURRENCES', { file: 'f.csv', sheet: 'Counts', params: { variant: 'empty-quantity', column: 'Count', rows: 1 } });
    expect(renderConvertPlain(one, 'en')).toContain('in all 1 row,');
    for (const l of ['en', 'pl', 'de', 'fr'] as const) expect(renderConvertPlain(one, l)).not.toMatch(/[{}]/);
    expect(renderConvertTechnical(f)).not.toContain('{');
  });
});
