// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Long-sheet rows whose quantity is blank or NaN: a row with a weight stays as an occurrence with no count, a row with nothing is counted and listed, and the rows add up.
// Every value is invented.
import { describe, expect, it } from 'vitest';
import { policyOf } from '../../src/core/convert/policy';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { ColumnRole, Lang } from '../../src/core/types';
import { exportSheet } from './exportHelpers';
import type { Cell } from './helpers';

const H = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Abundance', 'Weight [g]'];
const row = (sample: string, sp: string, abundance: Cell, weight: Cell): Cell[] => ['S1', sample, '2023-06-14', 55.5, 2.5, sp, abundance, weight];
const EDIT: Record<string, ColumnRole> = { 'Weight [g]': { kind: 'biomass', basis: 'wet' } };
const run = (rows: Cell[][], extra: Partial<Parameters<typeof exportSheet>[2]> = {}) => exportSheet(H, rows, { quantity: { kind: 'count' }, edit: EDIT, ...extra });
const find = (e: Awaited<ReturnType<typeof run>>, id: string) => e.findings.filter((f) => f.ruleId === id);

const ROWS: Cell[][] = [
  row('s1', 'Calanus finmarchicus', 4, 1.5), // 2
  row('s1', 'Oithona similis', null, 2.5), // 3 blank quantity, a weight
  row('s1', 'Pseudocalanus sp.', 'NaN', null), // 4 NaN, nothing else
  row('s1', 'Temora longicornis', 0, null), // 5 a plain zero
  row('s2', 'Acartia longiremis', 'NA', 0), // 6 NA, a weight of zero: nothing
  row('s2', 'Metridia lucens', null, null), // 7 blank, nothing
  row('s2', 'Centropages typicus', 0, 3), // 8 a zero and a weight: contradictory
  row('s2', 'Paracalanus parvus', 'NaN', 0.75), // 9 NaN, a weight
];

describe('a long sheet with blank or NaN quantities', () => {
  it('keeps a row with a weight as present with no count, and writes its weight', async () => {
    const e = await run(ROWS);
    const occ = e.dataset.occurrences.filter((o) => ['Oithona similis', 'Paracalanus parvus'].includes(o.identification.verbatim));
    expect(occ.map((o) => [o.identification.verbatim, o.status, o.quantity])).toEqual([
      ['Oithona similis', 'present', undefined],
      ['Paracalanus parvus', 'present', undefined],
    ]);
    const weights = e.dataset.measurements.filter((m) => m.type.toLowerCase().includes('weight') || m.type.toLowerCase().includes('biomass'));
    expect(weights.map((m) => [m.occurrenceId, m.value, m.unit]).filter((w) => /Oithona|Paracalanus/.test(String(w[0])))).toEqual([
      [expect.stringContaining('Oithona'), '2.5', 'g'],
      [expect.stringContaining('Paracalanus'), '0.75', 'g'],
    ]);
    // no count is made up for them
    expect(e.dataset.measurements.filter((m) => /Oithona|Paracalanus/.test(m.occurrenceId ?? '') && m.type.startsWith('Count'))).toEqual([]);
    const f = find(e, 'CONV-QUANTITY-BLANK-KEPT');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([3, 9]);
    expect(f[0].params.count).toBe(2);
    expect(policyOf(f[0])).toBe('accept');
  });

  it('counts and lists a row with nothing but blank or NaN, and makes no presence record from it', async () => {
    const e = await run(ROWS);
    const f = find(e, 'CONV-NA-SKIPPED');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([4, 6, 7]);
    expect(f[0].params).toMatchObject({ count: 3, rows: 'yes' });
    expect(policyOf(f[0])).toBe('show');
    const names = e.dataset.occurrences.map((o) => o.identification.verbatim);
    for (const gone of ['Pseudocalanus sp.', 'Acartia longiremis', 'Metridia lucens']) expect(names).not.toContain(gone);
  });

  it('rows with a taxon = occurrences + zeros skipped + rows reported (a sum a test can assert)', async () => {
    const e = await run(ROWS);
    expect(e.result.stats.occurrences + e.result.stats.zerosSkipped + e.result.stats.naSkipped).toBe(ROWS.length);
    expect(e.result.stats).toMatchObject({ occurrences: 3, zerosSkipped: 2, naSkipped: 3, blankKept: 2 });
    // with the full species list the zeros become absences and the sum still holds
    const full = await run(ROWS, { fullList: true });
    expect(full.result.stats.occurrences + full.result.stats.zerosSkipped + full.result.stats.naSkipped).toBe(ROWS.length);
  });

  it('a quantity of 0 with a weight above zero is reported, not kept silently either way', async () => {
    const e = await run(ROWS);
    const f = find(e, 'CONV-ZERO-WITH-BIOMASS');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([8]);
    expect(policyOf(f[0])).toBe('accept');
    expect(e.dataset.occurrences.map((o) => o.identification.verbatim)).not.toContain('Centropages typicus');
    const full = await run(ROWS, { fullList: true });
    const absent = full.dataset.occurrences.find((o) => o.identification.verbatim === 'Centropages typicus')!;
    expect(absent.status).toBe('absent');
    expect(full.dataset.measurements.some((m) => m.occurrenceId === absent.id)).toBe(false);
  });

  it('a measured variable alone does not keep a row: it is written once per sample and says nothing about the taxon', async () => {
    const header = [...H, 'Temperature [C]'];
    const rows: Cell[][] = [
      [...row('s1', 'Calanus finmarchicus', 4, null), 12.5],
      [...row('s1', 'Oithona similis', null, null), 12.5],
    ];
    const e = await exportSheet(header, rows, { quantity: { kind: 'count' }, edit: EDIT });
    expect(e.dataset.occurrences.map((o) => o.identification.verbatim)).toEqual(['Calanus finmarchicus']);
    expect(find(e, 'CONV-NA-SKIPPED')[0].lines).toEqual([3]);
  });

  it('a long sheet without blank quantities is unchanged: no new finding', async () => {
    const e = await run([row('s1', 'Calanus finmarchicus', 4, 1.5), row('s1', 'Oithona similis', 2, 0.5)]);
    expect(find(e, 'CONV-NA-SKIPPED')).toEqual([]);
    expect(find(e, 'CONV-QUANTITY-BLANK-KEPT')).toEqual([]);
    expect(find(e, 'CONV-ZERO-WITH-BIOMASS')).toEqual([]);
    expect(e.result.stats).toMatchObject({ naSkipped: 0, blankKept: 0 });
  });

  it('a wide sheet keeps its sparse cells uncounted', async () => {
    const e = await exportSheet(['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Calanus finmarchicus', 'Oithona similis'], [['S1', 's1', '2023-06-14', 55.5, 2.5, 3, null]], { quantity: { kind: 'count' } });
    expect(find(e, 'CONV-NA-SKIPPED')).toEqual([]);
    expect(e.result.stats.naSkipped).toBe(0);
  });

  it('the findings are worded in four languages', async () => {
    const e = await run(ROWS);
    for (const id of ['CONV-NA-SKIPPED', 'CONV-QUANTITY-BLANK-KEPT', 'CONV-ZERO-WITH-BIOMASS']) {
      for (const lang of ['pl', 'en', 'de', 'fr'] as Lang[]) {
        const t = renderConvertPlain(find(e, id)[0], lang);
        expect(t, `${id} ${lang}`).not.toMatch(/\{[a-z+]/i);
        expect(t, `${id} ${lang}`).toMatch(/\d/);
      }
    }
    expect(renderConvertPlain(find(e, 'CONV-NA-SKIPPED')[0], 'pl')).toContain('3 wiersze z gatunkiem nie mają');
    expect(renderConvertPlain(find(e, 'CONV-QUANTITY-BLANK-KEPT')[0], 'pl')).toContain('2 wiersze mają');
  });
});
