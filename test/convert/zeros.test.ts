// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Zeros and non-numbers in taxon cells (plan 2.7).
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { Finding } from '../../src/core/types';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const HEADER = ['Sample', 'Station', 'Calanus finmarchicus', 'Oithona similis'];
const run = (rows: Cell[][], fullList: boolean, kind: 'count' | 'density' = 'count') =>
  convert({ sheets: [sheetInput(fileOf(HEADER, rows), { quantity: kind === 'count' ? { kind: 'count' } : { kind: 'density', unit: 'ind/m3' } })], options: { fullList } });
const find = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id);

describe('zeros', () => {
  const rows: Cell[][] = [['A1', 'S', 0, 5]];

  it('full list ticked: 0 is occurrenceStatus absent, individualCount 0 for a count, no quantity eMoF', () => {
    const r = run(rows, true);
    const a = r.occurrences.find((o) => o.scientificName === 'Calanus finmarchicus')!;
    expect(a).toMatchObject({ occurrenceStatus: 'absent', individualCount: 0 });
    expect(a.organismQuantity).toBeUndefined();
    expect(r.measurements.filter((m) => m.target.id === a.id)).toEqual([]);
    expect(r.occurrences.find((o) => o.scientificName === 'Oithona similis')).toMatchObject({ occurrenceStatus: 'present', individualCount: 5 });
    expect(find(r.findings, 'CONV-ZERO-SKIPPED')).toEqual([]);
  });

  it('full list ticked, a density: the absence has no individualCount (only counts carry 0)', () => {
    const a = run(rows, true, 'density').occurrences.find((o) => o.scientificName === 'Calanus finmarchicus')!;
    expect(a.occurrenceStatus).toBe('absent');
    expect(a.individualCount).toBeUndefined();
  });

  it('not ticked: the zero is skipped and reported as an info count', () => {
    const r = run(rows, false);
    expect(r.occurrences.map((o) => o.scientificName)).toEqual(['Oithona similis']);
    const z = find(r.findings, 'CONV-ZERO-SKIPPED');
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ severity: 'info', params: { count: 1 } });
    expect(r.ok).toBe(true);
  });

  it('empty and NA are never a record, ticked or not', () => {
    for (const full of [true, false]) {
      const r = run([['A1', 'S', null, 'NA'], ['A2', 'S', '', 'n.d.']], full);
      expect(r.occurrences).toEqual([]);
      expect(find(r.findings, 'CONV-ZERO-SKIPPED')).toEqual([]);
    }
  });

  it('a mixed sheet counts every skipped zero', () => {
    const r = run([['A1', 'S', 0, 0], ['A2', 'S', 0, 3]], false);
    expect(find(r.findings, 'CONV-ZERO-SKIPPED')[0].params.count).toBe(3);
    expect(r.stats.zerosSkipped).toBe(3);
  });
});

describe('text in a taxon cell ("+", "x")', () => {
  it('is an accepted warning; the taxon is present without a quantity and the text is kept', () => {
    const r = run([['A1', 'S', '+', 5], ['A2', 'S', 'x', 'x']], true);
    const w = find(r.findings, 'CONV-TEXT-IN-TAXON-CELL');
    expect(w.map((f) => [f.severity, f.field, f.value, f.lines])).toEqual([
      ['warning', 'Calanus finmarchicus', '+, x', [2, 3]],
      ['warning', 'Oithona similis', 'x', [3]],
    ]);
    const plus = r.occurrences.find((o) => o.occurrenceRemarks === '+')!;
    expect(plus).toMatchObject({ occurrenceStatus: 'present', scientificName: 'Calanus finmarchicus' });
    expect(plus.individualCount).toBeUndefined();
    expect(plus.quantityText).toBeUndefined();
    expect(r.measurements.filter((m) => m.target.id === plus.id)).toEqual([]);
    expect(r.blocking).toEqual([]);
    expect(r.stats.textCells).toBe(3);
  });
});
