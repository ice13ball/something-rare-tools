// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A long sheet keeps every value: a column that tells colliding rows apart joins the row key (ROW-LONG-KEY-EXTENDED); when nothing does, the first value is kept and ROW-LONG-VALUE-SKIPPED
// says so. Every row is invented.
import { describe, expect, it } from 'vitest';
import { buildDataset, extendLongKey } from '../src/core/dataset';
import { pivotConvertFile } from '../src/core/convert/pivot';
import { proposeLayout, proposeMappings } from '../src/core/recognize/layout';
import { renderPlain } from '../src/core/report';
import { LANGS } from '../src/core/types';
import { fileOf } from './convert/helpers';
import { textFile } from './helpers/files';

const PARAMS = ['Corg', 'Ntot', 'Ptot'];
/** 2 stations x 3 parameters x 3 levels of the column `level` = 18 source values; `extra` adds a column that differs on every row. */
const sheet = (level: string, extra?: string): string => {
  const lines = [`Station,Latitude,Longitude,Date,${level},${extra ? `${extra},` : ''}Parameter,Value`];
  let n = 0;
  for (const s of ['S1', 'S2']) for (const p of PARAMS) for (const l of [1, 2, 3]) lines.push(`${s},49.4,0.2,2020-06-01,${l},${extra ? `note ${n++},` : ''}${p},${l + s.length + p.length + n}`);
  return lines.join('\n');
};
const build = (text: string) => {
  const file = textFile('long.csv', text);
  const layout = proposeLayout(file);
  return buildDataset(file, layout, proposeMappings(file, layout), [], 'd');
};
const read = (r: ReturnType<typeof build>) => r.dataset.rows.flatMap((x) => Object.values(x.values)).length;
const ids = (r: ReturnType<typeof build>, id: string) => r.findings.filter((f) => f.ruleId === id);

describe('a column that tells the rows apart joins the key', () => {
  for (const level of ['Pressure [dbar]', 'Replicate', 'Cast', 'Layer', 'Size class', 'Time point']) {
    it(`${level}: 18 source values, 18 read, one info naming the column`, () => {
      const r = build(sheet(level));
      expect(read(r)).toBe(18);
      expect(ids(r, 'ROW-LONG-VALUE-SKIPPED')).toEqual([]);
      const f = ids(r, 'ROW-LONG-KEY-EXTENDED');
      expect(f).toHaveLength(1);
      expect(f[0].params.columns).toBe(level);
      for (const lang of LANGS) {
        const text = renderPlain(f[0], lang);
        expect(text).toContain(level);
        expect(text).not.toMatch(/[{}]/);
      }
    });
  }

  it('Notes differing on every row beside Pressure: only Pressure joins the key', () => {
    const r = build(sheet('Pressure [dbar]', 'Notes'));
    expect(read(r)).toBe(18);
    expect(ids(r, 'ROW-LONG-KEY-EXTENDED')[0].params.columns).toBe('Pressure [dbar]');
  });

  it('with nothing telling the rows apart the first value is kept and ROW-LONG-VALUE-SKIPPED fires as before, even with a Row label and a QC column', () => {
    const lines = ['Row label,Station,Latitude,Longitude,Date,QC,Parameter,Value'];
    let n = 0;
    for (const s of ['S1', 'S2']) for (const p of PARAMS) for (const v of [1, 2, 3]) lines.push(`R${n++},${s},49.4,0.2,2020-06-01,${n % 4},${p},${v}`);
    // a station with one value per parameter whose QC differs per parameter: QC varies per value, so it is no separator
    for (const p of PARAMS) lines.push(`R${n++},S3,49.4,0.2,2020-06-01,${n % 4},${p},9`);
    const r = build(lines.join('\n'));
    expect(read(r)).toBe(9);
    expect(r.dataset.rows).toHaveLength(3);
    expect(ids(r, 'ROW-LONG-KEY-EXTENDED')).toEqual([]);
    const f = ids(r, 'ROW-LONG-VALUE-SKIPPED');
    expect(f).toHaveLength(1);
    expect(f[0].params.count).toBe(12);
    for (const lang of LANGS) expect(renderPlain(f[0], lang)).not.toMatch(/[{}]/);
  });

  it('Row label unique per row is no separator: no collision-free key is split', () => {
    const lines = ['Row label,Station,Latitude,Longitude,Date,Parameter,Value'];
    let n = 0;
    for (const s of ['S1', 'S2']) for (const p of PARAMS) for (const v of [1, 2]) lines.push(`R${n++},${s},49.4,0.2,2020-06-01,${p},${v}`);
    for (const p of PARAMS) lines.push(`R${n++},S3,49.4,0.2,2020-06-01,${p},9`);
    const r = build(lines.join('\n'));
    expect(r.dataset.rows).toHaveLength(3);
    expect(ids(r, 'ROW-LONG-KEY-EXTENDED')).toEqual([]);
    expect(ids(r, 'ROW-LONG-VALUE-SKIPPED')).toHaveLength(1);
  });

  it('a QC column (earlier in the sheet, as able to separate the collisions) that differs on non-colliding keys is not taken; the real Replicate is', () => {
    const lines = ['Station,Latitude,Longitude,Date,QC,Replicate,Parameter,Value'];
    let n = 0;
    for (const l of [1, 2, 3]) for (const p of PARAMS.slice(0, 2)) lines.push(`S1,49.4,0.2,2020-06-01,${n++ % 3},${l},${p},${l * 3 + p.length}`);
    // a station whose parameters have one value each, with a QC that differs per parameter
    for (const [i, p] of PARAMS.entries()) lines.push(`S2,49.4,0.2,2020-06-01,${i % 2},1,${p},5`);
    const r = build(lines.join('\n'));
    expect(ids(r, 'ROW-LONG-KEY-EXTENDED')[0].params.columns).toBe('Replicate');
    expect(read(r)).toBe(9);
    expect(r.dataset.rows).toHaveLength(4);
    expect(ids(r, 'ROW-LONG-VALUE-SKIPPED')).toEqual([]);
  });

  it('exact duplicates: no finding, the row count is unchanged', () => {
    const lines = ['Station,Latitude,Longitude,Date,Replicate,Parameter,Value'];
    for (const s of ['S1', 'S2']) for (const p of PARAMS) for (const l of [1, 2, 3]) lines.push(`${s},49.4,0.2,2020-06-01,${l},${p},7`);
    const r = build(lines.join('\n'));
    expect(r.dataset.rows).toHaveLength(2);
    expect(read(r)).toBe(6);
    expect(ids(r, 'ROW-LONG-KEY-EXTENDED')).toEqual([]);
    expect(ids(r, 'ROW-LONG-VALUE-SKIPPED')).toEqual([]);
  });

  it('a sheet without a collision gets no extra column and no finding', () => {
    const lines = ['Station,Latitude,Longitude,Date,Replicate,Parameter,Value'];
    for (const s of ['S1', 'S2']) for (const p of PARAMS) lines.push(`${s},49.4,0.2,2020-06-01,${s.length},${p},3`);
    const r = build(lines.join('\n'));
    expect(r.dataset.rows).toHaveLength(2);
    expect(ids(r, 'ROW-LONG-KEY-EXTENDED')).toEqual([]);
  });

  it('extendLongKey returns the added column indexes', () => {
    const file = textFile('long.csv', sheet('Replicate'));
    const layout = proposeLayout(file);
    const plan = layout.tables[0].long!;
    expect(plan).toBeDefined();
    const s = file.sheets[0];
    expect(extendLongKey(s, plan, [0, 1, 2, 3], false)).toEqual([4]);
  });

  it('a mixed sheet: the column joins the key for all rows, a non-colliding parameter is read once per level', () => {
    const lines = ['Station,Latitude,Longitude,Date,Replicate,Parameter,Value'];
    for (const l of [1, 2]) lines.push(`S1,49.4,0.2,2020-06-01,${l},Corg,${l}`);
    lines.push('S1,49.4,0.2,2020-06-01,1,Ntot,5');
    const r = build(lines.join('\n'));
    expect(read(r)).toBe(3);
    expect(ids(r, 'ROW-LONG-VALUE-SKIPPED')).toEqual([]);
  });
});

describe('/convert reads a long sheet by its own pivot, not by the grouping above', () => {
  it('a Replicate column with different values stays in the key: both values survive', () => {
    const header = ['Station', 'Date', 'Latitude', 'Longitude', 'Replicate', 'Parameter', 'Unit', 'Value'];
    const rows = [
      ['ZL1', '2023-06-14', 55.5, 2.5, 1, 'Temperature', 'degC', 8.1],
      ['ZL1', '2023-06-14', 55.5, 2.5, 2, 'Temperature', 'degC', 8.4],
    ];
    const file = pivotConvertFile(fileOf(header, rows, 'S', {}));
    expect(file.sheets[0].rows).toHaveLength(2);
    expect(file.sheets[0].rows.map((r) => r.cells.at(-1))).toEqual([8.1, 8.4]);
  });
});

describe('speed', () => {
  it('100 000 rows with no collision are grouped in well under a second more than the reader needs', () => {
    const lines = ['Station,Latitude,Longitude,Date,Replicate,Parameter,Value'];
    for (let i = 0; i < 100_000; i++) lines.push(`S${Math.floor(i / 5)},49.4,0.2,2020-06-01,${i % 5},P${i % 5},${i}`);
    const file = textFile('big.csv', lines.join('\n'));
    const layout = proposeLayout(file);
    const plan = layout.tables[0].long!;
    const t0 = performance.now();
    const added = extendLongKey(file.sheets[0], plan, [0, 1, 2, 3], false);
    const ms = performance.now() - t0;
    expect(added).toEqual([]);
    expect(ms).toBeLessThan(1500);
  });
});
