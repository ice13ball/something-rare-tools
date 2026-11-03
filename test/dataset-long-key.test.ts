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
import { createDirectEngine } from '../src/worker/handler';
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

describe('the review cases: a column joins the key only when it is safe', () => {
  const H = 'Station,Latitude,Longitude,Date';
  /** rows of [station index, ...cells]; two stations at different latitudes. */
  const csv = (extra: string, rows: string[][]): string => [`${H},${extra}`, ...rows.map(([st, ...c]) => `${st},${st === 'S1' ? '49.4' : '49.5'},0.2,2020-06-01,${c.join(',')}`)].join('\n');
  const both = (rows: string[][]): string[][] => ['S1', 'S2'].flatMap((st) => rows.map((r) => [st, ...r]));
  const skipped = (r: ReturnType<typeof build>) => ids(r, 'ROW-LONG-VALUE-SKIPPED');
  const extended = (r: ReturnType<typeof build>) => ids(r, 'ROW-LONG-KEY-EXTENDED');
  const DIC = 'DIC [umol/kg]';
  const TA = 'TA [umol/kg]';
  const enc = (t: string) => new TextEncoder().encode(t);
  const check = async (t: string): Promise<string[]> => {
    const e = createDirectEngine();
    const p = await e.parse([{ name: 'long.csv', bytes: enc(t), source: 'dropped' }], [], []);
    for (const f of p.files) {
      const pr = await e.propose(f.fileId, f.layout);
      await e.build(f.fileId, f.layout, pr.mappings);
    }
    return (await e.check()).report.findings.map((f) => f.ruleId);
  };

  it('a0: a Replicate that groups DIC and TA of one replicate joins the key; the true DIC > TA of replicate 2 is raised', async () => {
    const t = csv('Replicate,Parameter,Value', both([['1', DIC, '2000'], ['1', TA, '2300'], ['2', DIC, '2400'], ['2', TA, '2350']]));
    const r = build(t);
    expect(read(r)).toBe(8);
    expect(extended(r)).toHaveLength(1);
    expect(skipped(r)).toEqual([]);
    expect(await check(t)).toContain('CHEM-DIC-GT-TA');
  });

  it('a: QC beside Replicate, both separate every key with the same number of values: neither is taken, the first value stays, and no false DIC > TA appears', async () => {
    const t = csv('QC,Replicate,Parameter,Value', both([['0', '1', DIC, '2000'], ['1', '1', TA, '2300'], ['1', '2', DIC, '2400'], ['0', '2', TA, '2350']]));
    const r = build(t);
    expect(extended(r)).toEqual([]);
    expect(skipped(r)).toHaveLength(1);
    expect(read(r)).toBe(4);
    expect(await check(t)).not.toContain('CHEM-DIC-GT-TA');
  });

  it('m1: QC before Replicate on a sheet with no fault stays without a fault (neither taken)', async () => {
    const t = csv('QC,Replicate,Parameter,Value', both([['0', '1', DIC, '2300'], ['1', '1', TA, '2400'], ['1', '2', DIC, '2000'], ['0', '2', TA, '2100']]));
    expect(extended(build(t))).toEqual([]);
    expect(await check(t)).not.toContain('CHEM-DIC-GT-TA');
  });

  it('m0 and m3: the real Replicate alone is taken, with no fault and with the real fault', async () => {
    const ok = csv('Replicate,Parameter,Value', both([['1', DIC, '2300'], ['1', TA, '2400'], ['2', DIC, '2000'], ['2', TA, '2100']]));
    expect(extended(build(ok))).toHaveLength(1);
    expect(await check(ok)).not.toContain('CHEM-DIC-GT-TA');
    const bad = csv('Replicate,Parameter,Value', both([['1', DIC, '2400'], ['1', TA, '2350'], ['2', DIC, '2000'], ['2', TA, '2300']]));
    expect(extended(build(bad))).toHaveLength(1);
    expect(await check(bad)).toContain('CHEM-DIC-GT-TA');
  });

  it('b and m2: a running number per station (every key collides, each row one parameter) is refused, and the real DIC > TA stays visible', async () => {
    const t = csv('Seq,Parameter,Value', both([['1', DIC, '2400'], ['2', TA, '2350'], ['3', DIC, '2000'], ['4', TA, '2300']]));
    const r = build(t);
    expect(extended(r)).toEqual([]);
    expect(skipped(r)).toHaveLength(1);
    expect(read(r)).toBe(4);
    expect(await check(t)).toContain('CHEM-DIC-GT-TA');
  });

  it('c: a row number that repeats once is refused all the same', () => {
    const rows: string[][] = [];
    let n = 0;
    for (const st of ['S1', 'S2']) for (const [d, t] of [['2000', '2300'], ['2400', '2350']]) rows.push([st, String(++n), DIC, d], [st, String(++n), TA, t]);
    rows[rows.length - 1][1] = String(n - 1);
    const r = build(csv('RowNo,Parameter,Value', rows));
    expect(extended(r)).toEqual([]);
    expect(skipped(r)).toHaveLength(1);
    expect(read(r)).toBe(4);
  });

  it('d: a column that resolves one key and leaves a collision in another is not taken: one finding, not two contradictory ones', () => {
    const r = build(csv('Method,Parameter,Value', [['S1', 'A', 'Corg', '1'], ['S1', 'A', 'Corg', '2'], ['S1', 'B', 'Corg', '3'], ['S2', 'A', 'Corg', '4'], ['S2', 'B', 'Corg', '5']]));
    expect(extended(r)).toEqual([]);
    expect(skipped(r)).toHaveLength(1);
    expect(skipped(r)[0].params.count).toBe(3);
    expect(read(r)).toBe(2);
  });

  it('e: one station whose replicates agree does not stop the Replicate from joining the key', () => {
    const r = build(csv('Replicate,Parameter,Value', [['S1', '1', 'Corg', '1'], ['S1', '2', 'Corg', '2'], ['S1', '3', 'Corg', '3'], ['S2', '1', 'Corg', '7'], ['S2', '2', 'Corg', '7'], ['S2', '3', 'Corg', '7']]));
    expect(extended(r)).toHaveLength(1);
    expect(skipped(r)).toEqual([]);
    expect(read(r)).toBe(6);
  });

  it('f: a pressure at which the parameters of one station are not the same is refused (the rows would not hold one thing)', () => {
    const rows = [...[['5', 10], ['10', 9], ['20', 8]].map(([l, v]) => ['S1', String(l), 'Temperature', String(v)]), ...[['5', 35], ['10', 34], ['20', 33]].map(([l, v]) => ['S1', String(l), 'Salinity', String(v)]), ['S2', '5', 'Temperature', '11'], ['S2', '10', 'Salinity', '36']];
    const r = build(csv('Pressure [dbar],Parameter,Value', rows));
    expect(extended(r)).toEqual([]);
    expect(skipped(r)).toHaveLength(1);
  });

  it('g: a single cast of one parameter, where the pressure is unique on every row, is not a separator: the first value stays and the rest are said', () => {
    const r = build(csv('Pressure [dbar],Parameter,Value', [['S1', '5', 'Temperature', '10'], ['S1', '10', 'Temperature', '9'], ['S1', '20', 'Temperature', '8'], ['S1', '40', 'Temperature', '7']]));
    expect(extended(r)).toEqual([]);
    expect(skipped(r)[0].params.count).toBe(3);
    expect(read(r)).toBe(1);
  });

  it('h: every key collides and the only column is unique per row: nothing is taken', () => {
    const r = build(csv('RowNo,Parameter,Value', [['S1', '1', 'Corg', '1'], ['S1', '2', 'Corg', '2'], ['S2', '3', 'Corg', '1'], ['S2', '4', 'Corg', '2']]));
    expect(extended(r)).toEqual([]);
    expect(skipped(r)).toHaveLength(1);
    expect(read(r)).toBe(2);
  });

  it('i: a blank unit on one of two colliding rows is the same variable, so the collision is found and the Replicate joins the key', () => {
    const t = ['Station,Latitude,Longitude,Date,Replicate,Parameter,Unit,Value', 'S1,49.4,0.2,2020-06-01,1,Corg,mg/l,1', 'S1,49.4,0.2,2020-06-01,2,Corg,,2', 'S1,49.4,0.2,2020-06-01,1,Ntot,mg/l,3', 'S1,49.4,0.2,2020-06-01,2,Ntot,mg/l,4'].join('\n');
    const r = build(t);
    expect(extended(r)).toHaveLength(1);
    expect(skipped(r)).toEqual([]);
    expect(read(r)).toBe(4);
  });

  it('j: a Cruise already in the key stays; the Replicate beside it joins', () => {
    const rows: string[][] = [];
    for (const st of ['S1', 'S2']) for (const rep of [1, 2, 3]) rows.push([st, 'C1', String(rep), 'Temperature', String(10 + rep)], [st, 'C1', String(rep), 'Salinity', String(30 + rep)]);
    const r = build(csv('Cruise,Replicate,Parameter,Value', rows));
    expect(extended(r)[0].params.columns).toBe('Replicate');
    expect(read(r)).toBe(12);
  });

  it('k: a column without a header is never a separator', () => {
    const t = ['Station,Latitude,Longitude,Date,,Parameter,Value', 'S1,49.4,0.2,2020-06-01,0,Corg,1', 'S1,49.4,0.2,2020-06-01,1,Corg,2', 'S2,49.5,0.2,2020-06-01,0,Corg,1', 'S2,49.5,0.2,2020-06-01,1,Corg,2'].join('\n');
    const r = build(t);
    expect(extended(r)).toEqual([]);
    expect(skipped(r)).toHaveLength(1);
  });

  it('two acceptable columns that separate the same keys with the same number of values: neither is taken', () => {
    const r = build(csv('Replicate,Rep copy,Parameter,Value', both([['1', 'a', 'Corg', '1'], ['2', 'b', 'Corg', '2']])));
    expect(extended(r)).toEqual([]);
    expect(skipped(r)).toHaveLength(1);
  });

  it('the texts are singular for one column and plural for several, in four languages', () => {
    const r = build(csv('Replicate,Parameter,Value', both([['1', 'Corg', '1'], ['2', 'Corg', '2']])));
    const f = extended(r)[0];
    expect(f.params.count).toBe(1);
    expect(renderPlain(f, 'en')).toContain('The column that tells');
    expect(renderPlain({ ...f, params: { columns: 'A, B', count: 2 } }, 'en')).toContain('The columns that tell');
    for (const lang of LANGS) expect(renderPlain({ ...f, params: { columns: 'A, B', count: 2 } }, lang)).not.toMatch(/[{}]/);
  });

  it('the skipped text says no column could safely be used, never that none exists', () => {
    const r = build(csv('RowNo,Parameter,Value', [['S1', '1', 'Corg', '1'], ['S1', '2', 'Corg', '2']]));
    for (const lang of LANGS) {
      const text = renderPlain(skipped(r)[0], lang);
      expect(text).not.toMatch(/[{}]/);
    }
    expect(renderPlain(skipped(r)[0], 'en')).toContain('could safely be used');
  });
});

describe('a sheet with no collision costs one scan', () => {
  it('reads each cell of the key, parameter, unit and value once, whatever the number of other columns', () => {
    const run = (extraCols: number): number => {
      const head = ['Station', 'Latitude', 'Longitude', 'Date', 'Replicate', ...Array.from({ length: extraCols }, (_, i) => `X${i}`), 'Parameter', 'Value'];
      const lines = [head.join(',')];
      for (let i = 0; i < 20_000; i++) lines.push(['S' + Math.floor(i / 5), '49.4', '0.2', '2020-06-01', String(i % 5), ...Array.from({ length: extraCols }, () => 'x'), 'P' + (i % 5), String(i)].join(','));
      const file = textFile('big.csv', lines.join('\n'));
      const plan = proposeLayout(file).tables[0].long!;
      const sheet = file.sheets[0];
      let gets = 0;
      sheet.rows = sheet.rows.map((r) => {
        const cells = r.cells;
        return { ...r, get cells() { gets++; return cells; } } as typeof r;
      });
      expect(extendLongKey(sheet, plan, [0, 1, 2, 3], false)).toEqual([]);
      return gets;
    };
    const few = run(0);
    const many = run(30);
    expect(many).toBe(few);
    expect(few).toBeLessThanOrEqual(20_000 * 10);
  });
});
