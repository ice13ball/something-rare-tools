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
    expect(p.grouping!.added).toEqual([{ header: 'Cast', why: 'name' }]);
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

describe('extra grouping columns are never picked by themselves', () => {
  const header = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Sex', 'Species', 'Count'];
  // two samples, each with the same taxa seen as females and males
  const sexRows = (): Cell[][] => ['A', 'B'].flatMap((st) => TAXA.slice(0, 3).flatMap((sp) => ['F', 'M'].map((sx) => [st, '2023-06-10', 55, 2.5, 10, sx, sp, 2] as Cell[])));

  it.each(['Sex', 'Size_class', 'Notes', 'Comment', 'Sorter', 'Mesh'])('%s is not added: the tool refuses and names it, and the user picks it', (name) => {
    const h = header.map((x) => (x === 'Sex' ? name : x));
    const p = propose(h, sexRows(), 'long', { [name]: { kind: 'ignore' } });
    expect(p.refusal?.reason).toBe('taxon-repeats');
    expect(p.refusal!.candidates!.map((c) => c.header)).toContain(name);
    expect(p.csv).toBe('');
    // picked in the preview: the proposal is made and says the column was added because it was chosen
    const file = fileOf(h, sexRows());
    const idx = h.indexOf(name);
    const chosen = proposeSampleCodes(file, file.sheets[0], mappingOf(file, { [name]: { kind: 'ignore' } }), 'long', [idx])!;
    expect(chosen.grouping).toMatchObject({ samples: 4, repeats: 0 });
    expect(chosen.grouping!.added).toEqual([{ header: name, why: 'chosen' }]);
  });

  it('one repeat in many rows does not pull in a Notes column', () => {
    const rows = longRows(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], [0, 25, 50, 75]).map((r) => [...r, 'x'] as Cell[]);
    rows.push(['A', '2023-06-10', 55, 2.5, 0, 'Calanus finmarchicus', 9, 'y']);
    const p = propose([...H, 'Notes'], rows, 'long', { Notes: { kind: 'ignore' } });
    expect(p.grouping).toMatchObject({ samples: 40, repeats: 1 });
    expect(p.grouping!.added).toEqual([]);
  });

  it('positions that differ inside a date-only key are part of the key, and said', () => {
    const rows: Cell[][] = [];
    [55, 56, 57].forEach((lat, i) => TAXA.slice(0, 3).forEach((sp) => rows.push(['2023-06-10', lat, 2.5 + i, sp, 3])));
    const p = propose(['Date', 'Latitude', 'Longitude', 'Species', 'Count'], rows, 'long');
    expect(p.grouping).toMatchObject({ samples: 3 });
    expect(p.grouping!.added.map((a) => a.why)).toEqual(['position', 'position']);
  });

  it('10 and 10.0 are one depth; empty cells are counted; a near one-row-per-sample key is flagged', () => {
    const rows: Cell[][] = [['A', '2023-06-10', 55, 2.5, 10, 'Calanus finmarchicus', 2], ['A', '2023-06-10', 55, 2.5, '10.0', 'Oithona similis', 2], ['B', '2023-06-10', 55, 2.5, null, 'Calanus finmarchicus', 1]];
    const p = propose(H, rows, 'long');
    expect(p.grouping).toMatchObject({ samples: 2, blanks: 1, nearlyRows: false });
    const many: Cell[][] = Array.from({ length: 40 }, (_, i) => ['A', `2023-06-10T10:${String(i).padStart(2, '0')}:00`, 55, 2.5, 10, TAXA[i % 5], 1]);
    expect(propose(H, many, 'long').grouping!.nearlyRows).toBe(true);
  });
});

describe('event words in a column name', () => {
  const header = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Cast', 'Species', 'Count'];
  const rows = (): Cell[][] => [1, 2].flatMap((c) => TAXA.slice(0, 3).map((sp) => ['A', '2023-06-10', 55, 2.5, 10, c, sp, 2] as Cell[]));
  it.each(['Cast', 'Cast_no', 'Haul_ID', 'TowNo', 'Net 2', 'deployment'])('%s is added by name', (name) => {
    const h = header.map((x) => (x === 'Cast' ? name : x));
    const p = propose(h, rows(), 'long', { [name]: { kind: 'ignore' } });
    expect(p.grouping?.added).toEqual([{ header: name, why: 'name' }]);
  });
  it.each(['Tow_notes', 'Net_comment', 'Haul_flag'])('%s is not an event column: the proposal is refused and names it', (name) => {
    const h = header.map((x) => (x === 'Cast' ? name : x));
    const p = propose(h, rows(), 'long', { [name]: { kind: 'ignore' } });
    expect(p.refusal?.reason).toBe('taxon-repeats');
    expect(p.refusal!.candidates!.map((c) => c.header)).toContain(name);
  });
  it('a typed position in one row of a station and date does not split the sample', () => {
    const r = rows().map((x, i) => (i === 1 ? [...x.slice(0, 2), 55.5, ...x.slice(3)] : x));
    const p = propose(header, r, 'long', { Cast: { kind: 'ignore' } });
    expect(p.grouping!.by.some((b) => b.part === 'position')).toBe(false);
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

  it('does not fire when the taxon repeats at the same place, or the events differ in time or position', async () => {
    const one = (i: number, extra: Partial<Record<'time' | 'lat', string | number>>): Cell[] => ['S1', `k${i}`, extra.time === undefined ? '2023-06-10' : `2023-06-10T${extra.time}`, extra.lat ?? 55, 2.5, 10, 'Calanus finmarchicus', 1];
    const times = await exportSheet(headerWithCode, Array.from({ length: 40 }, (_, i) => one(i, { time: `10:${String(i).padStart(2, '0')}:00` })), q);
    expect(times.findings.some((x) => x.ruleId === 'CONV-SAMPLE-PER-ROW')).toBe(false);
    const positions = await exportSheet(['Sample', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Species', 'Count'], Array.from({ length: 40 }, (_, i) => [`k${i}`, '2023-06-10', 55 + i / 100, 2.5, 10, 'Calanus finmarchicus', 1] as Cell[]), q);
    expect(positions.findings.some((x) => x.ruleId === 'CONV-SAMPLE-PER-ROW')).toBe(false);
    const sameDive = await exportSheet(headerWithCode, Array.from({ length: 40 }, (_, i) => one(i, {})), q);
    expect(sameDive.findings.some((x) => x.ruleId === 'CONV-SAMPLE-PER-ROW')).toBe(false);
  });

  const named = (i: number): string => `Taxon number ${i}`;
  const b08Header = ['Station', 'time', 'Depth_m', 'Latitude', 'Longitude', 'Volume filtered [m3]', 'Species', 'Abundance', 'Sample'];
  const density = { quantity: { kind: 'density' as const, unit: '#/m3', effort: { source: 'column' as const } } };

  it('fires on the natural path: a time column that gives no date, an effort column, a density, a code on every row, most rows zero', async () => {
    const rows: Cell[][] = [];
    let n = 0;
    for (const st of ['A', 'B', 'C']) for (const t of ['2003-01-17T00:00:00Z', '2003-01-18T00:00:00Z']) for (let i = 0; i < 25; i++) rows.push([st, t, 10, 55, 2.5, 30.5, named(i), i < 6 ? 4 + i : 0, `r${++n}`]);
    const e = await exportSheet(b08Header, rows, density);
    const f = e.findings.filter((x) => x.ruleId === 'CONV-SAMPLE-PER-ROW');
    expect(f).toHaveLength(1);
    expect(e.result.stats.samples).toBe(150);
    expect(Number(f[0].params.events)).toBeGreaterThan(Number(f[0].params.occurrences));
  });

  it('fires when one taxon is listed twice per sample in two stages', async () => {
    const stageHeader = ['Station', 'time', 'Depth_m', 'Latitude', 'Longitude', 'Volume filtered [m3]', 'Species', 'Stage', 'Abundance', 'Sample'];
    const stages: Cell[][] = [];
    let n = 0;
    for (const [k, st] of Array.from({ length: 20 }, (_, i) => `S${i}`).entries()) for (const stage of ['c1', 'c2']) stages.push([st, `2003-01-1${(k % 5) + 1}`, 10, 55, 2.5, 30.5, 'Calanus finmarchicus', stage, 3, `r${++n}`]);
    const e = await exportSheet(stageHeader, stages, density);
    expect(e.findings.some((x) => x.ruleId === 'CONV-SAMPLE-PER-ROW')).toBe(true);
    // (accepted limit, docs/APPS.md section 14: a true split whose revisits have no date stays silent)
  });

  it('stays silent on correct codes: many visits of few taxa with most values zero; one target species with half zeros; paired tows', async () => {
    // 8 taxa x 60 visits, most values zero: more events than occurrences, but a sample is 8 rows
    const visits: Cell[][] = [];
    for (let v = 0; v < 60; v++) for (let i = 0; i < 8; i++) visits.push(['A', `2003-01-${String((v % 28) + 1).padStart(2, '0')}`, 10, 55, 2.5, 30.5, named(i), (v + i) % 5 === 0 ? 3 : 0, `v${v}`]);
    expect((await exportSheet(b08Header, visits, density)).findings.some((x) => x.ruleId === 'CONV-SAMPLE-PER-ROW')).toBe(false);
    // one target species over 100 tows, half zero
    const tows: Cell[][] = Array.from({ length: 100 }, (_, i) => [`T${i}`, `2003-01-${String((i % 28) + 1).padStart(2, '0')}`, 10, 55 + i / 100, 2.5, 30.5, 'Calanus finmarchicus', i % 2 === 0 ? 3 : 0, `t${i}`]);
    expect((await exportSheet(b08Header, tows, density)).findings.some((x) => x.ruleId === 'CONV-SAMPLE-PER-ROW')).toBe(false);
    // paired tows of one species at one station and date, one code each
    const paired: Cell[][] = Array.from({ length: 60 }, (_, i) => [`S${Math.floor(i / 2)}`, `2003-01-${String((Math.floor(i / 2) % 28) + 1).padStart(2, '0')}`, 10, 55, 2.5, 30.5, 'Calanus finmarchicus', 3, `p${i}`]);
    expect((await exportSheet(b08Header, paired, density)).findings.some((x) => x.ruleId === 'CONV-SAMPLE-PER-ROW')).toBe(false);
  });

  it('a replicate column does not make one species fire', async () => {
    const header = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Replicate', 'Species', 'Count'];
    const rows: Cell[][] = Array.from({ length: 40 }, (_, i) => [`S${Math.floor(i / 2)}`, `2023-06-${String((Math.floor(i / 2) % 28) + 1).padStart(2, '0')}`, 55, 2.5, 10, (i % 2) + 1, 'Calanus finmarchicus', 3]);
    const e = await exportSheet(header, rows, { quantity: { kind: 'count' }, edit: { Station: { kind: 'station' } } });
    expect(e.findings.some((x) => x.ruleId === 'CONV-SAMPLE-PER-ROW')).toBe(false);
  });
});
