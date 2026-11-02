// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The proposed sample codes of a LONG sheet are one per sample (the rows of one sample share the columns that define it), a sheet that cannot be grouped gets none, a wide sheet keeps one code
// per row byte for byte, and the OUTPUT of a long sheet is checked for one event per taxon row whoever wrote the codes. Every value is invented.
import { describe, expect, it } from 'vitest';
import { proposeSampleCodes } from '../../src/core/convert/ids';
import { sampleSplitOf } from '../../src/core/convert/build';
import { policyOf } from '../../src/core/convert/policy';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { Lang } from '../../src/core/types';
import { exportSheet } from './exportHelpers';
import { fileOf, mappingOf, W1_HEADER, W1_ROWS } from './helpers';
import type { Cell } from './helpers';

const TAXA = ['Calanus finmarchicus', 'Oithona similis', 'Pseudocalanus sp.', 'Temora longicornis', 'Acartia longiremis'];
const H = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Species', 'Count'];
const longRows = (stations: string[], depths: number[], taxa = TAXA): Cell[][] => {
  const rows: Cell[][] = [];
  stations.forEach((st, i) => depths.forEach((d) => taxa.forEach((sp, k) => rows.push([st, `2023-06-${10 + i}`, 55 + i, 2.5, d, sp, 1 + k]))));
  return rows;
};
const propose = (header: string[], rows: Cell[][], shape: 'wide' | 'long', edit: Parameters<typeof mappingOf>[1] = {}) => {
  const file = fileOf(header, rows);
  return proposeSampleCodes(file, file.sheets[0], mappingOf(file, edit), shape)!;
};

describe('codes of a long sheet', () => {
  it('one code per sample: the rows of a station, date and depth share it', () => {
    const rows = longRows(['A', 'B', 'C'], [0, 25]);
    const p = propose(H, rows, 'long');
    expect(p.grouping).toMatchObject({ samples: 6, rows: 30, repeats: 0 });
    expect(p.grouping!.by.map((b) => b.part)).toEqual(['station', 'date', 'depth']);
    expect(new Set(p.codes).size).toBe(6);
    expect(p.codes.slice(0, 5)).toEqual(Array(5).fill('A-1'));
    expect(p.codes.slice(5, 10)).toEqual(Array(5).fill('A-2'));
    expect(p.codes.slice(10, 15)).toEqual(Array(5).fill('B-1'));
    // the sheet is returned with the column last, as before
    expect(p.csv.split('\n')[0]).toBe(`${H.join(',')},sample_code`);
    expect(p.csv.split('\n')[1].endsWith(',A-1')).toBe(true);
  });

  it('an unmapped cast / haul column is found from the data: a taxon cannot be caught twice in one sample', () => {
    const rows: Cell[][] = [];
    for (const cast of [1, 2, 3]) TAXA.forEach((sp, k) => rows.push(['A', '2023-06-10', 55, 2.5, 10, cast, sp, 1 + k]));
    const header = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Cast', 'Species', 'Count'];
    const p = propose(header, rows, 'long', { Cast: { kind: 'ignore' } });
    expect(p.grouping).toMatchObject({ samples: 3, rows: 15, repeats: 0 });
    expect(p.grouping!.by.map((b) => [b.part, b.header])).toEqual([['station', 'Station'], ['date', 'Date'], ['depth', 'Depth_m'], ['column', 'Cast']]);
  });

  it('a column that is an identifier of the row is not used to split samples, and the proposal is refused when a taxon repeats', () => {
    // replicates of a station, date and depth with nothing to tell them apart except a per-row id
    const rows: Cell[][] = [];
    let id = 0;
    for (let rep = 0; rep < 3; rep++) TAXA.forEach((sp, k) => rows.push(['A', '2023-06-10', 55, 2.5, 10, ++id, sp, 1 + k]));
    const header = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Rowid', 'Species', 'Count'];
    const p = propose(header, rows, 'long', { Rowid: { kind: 'ignore' } });
    expect(p.refusal).toEqual({ reason: 'taxon-repeats', rows: 15, repeats: 10 });
    expect(p.csv).toBe('');
    expect(p.codes).toEqual([]);
  });

  it('refuses when nothing defines a sample', () => {
    const p = propose(['Species', 'Count'], [['Calanus finmarchicus', 3], ['Oithona similis', 2]], 'long');
    expect(p.refusal).toEqual({ reason: 'no-columns', rows: 2 });
  });

  it('a genuine one-taxon-per-sample sheet still gets a code per row', () => {
    const rows: Cell[][] = TAXA.map((sp, i) => ['S' + i, `2023-06-${10 + i}`, 55, 2.5, 10, sp, 3]);
    const p = propose(H, rows, 'long');
    expect(p.grouping).toMatchObject({ samples: 5, rows: 5 });
  });

  it('a few repeats are allowed and said: possible replicates', () => {
    const rows = longRows(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], [0, 25, 50, 75]);
    rows.push(['A', '2023-06-10', 55, 2.5, 0, 'Calanus finmarchicus', 9]);
    const p = propose(H, rows, 'long');
    expect(p.grouping).toMatchObject({ samples: 40, rows: 201, repeats: 1 });
  });

  it('a wide sheet keeps one code per row, byte for byte', () => {
    const wide = propose(W1_HEADER.filter((h) => h !== 'Sample'), W1_ROWS.map((r) => r.filter((_, i) => i !== 2)), 'wide');
    expect(wide.codes).toEqual(['S1-1', 'S1-2', 'S2-1']);
    expect(wide.grouping).toBeUndefined();
    expect(wide.refusal).toBeUndefined();
    // the same sheet asked as the default (no shape) gives the same file
    const file = fileOf(W1_HEADER.filter((h) => h !== 'Sample'), W1_ROWS.map((r) => r.filter((_, i) => i !== 2)));
    expect(proposeSampleCodes(file, file.sheets[0], mappingOf(file))!.csv).toBe(wide.csv);
  });
});

describe('CONV-SAMPLE-PER-ROW: one sample split into an event per taxon row', () => {
  const headerWithCode = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Species', 'Count'];
  const withRowCodes = (stations: string[], depths: number[]): Cell[][] => longRows(stations, depths).map((r, i) => [r[0], `code-${i + 1}`, ...r.slice(1)]);
  const q = { quantity: { kind: 'count' as const } };

  it('fires on a long sheet whose codes name rows, and names the ratio', async () => {
    const e = await exportSheet(headerWithCode, withRowCodes(['A', 'B', 'C'], [0, 25]), q);
    const f = e.findings.filter((x) => x.ruleId === 'CONV-SAMPLE-PER-ROW');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ events: 30, occurrences: 30, ratio: '100%', shared: 30 });
    expect(policyOf(f[0])).toBe('accept');
    for (const lang of ['pl', 'en', 'de', 'fr'] as Lang[]) expect(renderConvertPlain(f[0], lang), lang).toContain('100%');
  });

  it('does not fire when the codes name the samples', async () => {
    const rows = longRows(['A', 'B', 'C'], [0, 25]).map((r, i) => [r[0], `${r[0]}-${r[4]}`, ...r.slice(1)]);
    const e = await exportSheet(headerWithCode, rows, q);
    expect(e.findings.some((x) => x.ruleId === 'CONV-SAMPLE-PER-ROW')).toBe(false);
  });

  it('does not fire on a genuine one-taxon-per-sample sheet: every event has its own station, date or depth', async () => {
    const rows: Cell[][] = Array.from({ length: 40 }, (_, i) => [`S${i}`, `s${i}`, `2023-06-${String((i % 28) + 1).padStart(2, '0')}`, 55 + i / 100, 2.5, i * 5, TAXA[i % 5], 3]);
    const e = await exportSheet(headerWithCode, rows, q);
    expect(e.result.stats.samples).toBe(40);
    expect(e.findings.some((x) => x.ruleId === 'CONV-SAMPLE-PER-ROW')).toBe(false);
  });

  it('does not fire on a small sheet, a wide sheet, or replicates of a sample', async () => {
    const small = await exportSheet(headerWithCode, withRowCodes(['A'], [0]), q);
    expect(small.findings.some((x) => x.ruleId === 'CONV-SAMPLE-PER-ROW')).toBe(false);
    const wide = await exportSheet(W1_HEADER, W1_ROWS, { quantity: { kind: 'count', effort: { source: 'column' } } });
    expect(wide.findings.some((x) => x.ruleId === 'CONV-SAMPLE-PER-ROW')).toBe(false);
    expect(sampleSplitOf([], 0)).toBeUndefined();
  });
});
