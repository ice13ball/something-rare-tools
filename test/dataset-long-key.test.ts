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
import { getRule } from '../src/core/rules/registry';
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

  it('two acceptable columns that split the rows identically (t1: a Replicate and its label) are one choice: the first is taken', () => {
    const rows: string[][] = [];
    for (const st of ['S1', 'S2']) for (const r of [1, 2]) rows.push([st, String(r), `rep${r}`, 'Corg', String(1 + r)], [st, String(r), `rep${r}`, 'Ntot', String(5 + r)]);
    const r = build(csv('Replicate,Label,Parameter,Value', rows));
    expect(extended(r)[0].params.columns).toBe('Replicate');
    expect(read(r)).toBe(8);
    expect(skipped(r)).toEqual([]);
  });

  it('q1b and q2: a QC that splits the rows differently from a Replicate with the same count leaves the choice open: neither is taken', async () => {
    const qc = (bottles: Record<string, [string, string]>): string[][] =>
      ['S1', 'S2'].flatMap((st) => [[st, '0', bottles[st][0], DIC, '2300'], [st, '1', bottles[st][0], TA, '2400'], [st, '1', bottles[st][1], DIC, '2000'], [st, '0', bottles[st][1], TA, '2100']]);
    for (const bottles of [{ S1: ['A1', 'A2'], S2: ['B1', 'B2'] }, { S1: ['1', '2'], S2: ['1', '3'] }] as Record<string, [string, string]>[]) {
      const t = csv('QC,Replicate,Parameter,Value', qc(bottles));
      const r = build(t);
      expect(extended(r)).toEqual([]);
      expect(skipped(r)).toHaveLength(1);
      expect(await check(t)).not.toContain('CHEM-DIC-GT-TA');
    }
  });

  it('q2c: the Replicate alone, with labels 1,2 in one station and 1,3 in the other, is taken', () => {
    const rows = ['S1', 'S2'].flatMap((st) => (st === 'S1' ? ['1', '2'] : ['1', '3']).flatMap((rep) => [[st, rep, DIC, String(2300 + Number(rep))], [st, rep, TA, String(2400 + Number(rep))]]));
    const r = build(csv('Replicate,Parameter,Value', rows));
    expect(extended(r)[0].params.columns).toBe('Replicate');
    expect(read(r)).toBe(8);
  });

  it('q3: a balanced flag with nothing else to choose from joins the key (accepted limit): the finding names it', () => {
    const rows = ['S1', 'S2'].flatMap((st) => [[st, '0', DIC, '2300'], [st, '1', TA, '2400'], [st, '1', DIC, '2000'], [st, '0', TA, '2100']]);
    const r = build(csv('QC,Parameter,Value', rows));
    expect(extended(r)[0].params.columns).toBe('QC');
    expect(skipped(r)).toEqual([]);
  });

  it('mixed sheet: a parameter measured at one replicate only does not stop the Replicate (nested parameter sets)', () => {
    const r = build(csv('Replicate,Parameter,Value', [['S1', '1', 'Corg', '1'], ['S1', '2', 'Corg', '2'], ['S1', '1', 'Ntot', '5']]));
    expect(read(r)).toBe(3);
    expect(extended(r)).toHaveLength(1);
    expect(skipped(r)).toEqual([]);
  });

  /** samples x 3 replicates x [Temperature, Salinity, Nitrate, Chl-a]; `drop` removes rows. */
  const samples = (n: number, drop: (s: number, rep: number, p: string) => boolean): string => {
    const rows: string[][] = [];
    for (let s = 0; s < n; s++) for (const rep of [1, 2, 3]) for (const p of ['Temperature [degC]', 'Salinity [PSU]', 'Nitrate [umol/l]', 'Chl-a [ug/l]']) if (!drop(s, rep, p)) rows.push([`P${s}`, String(rep), p, String(10 + s * 0.01 + rep * 0.05 + p.length * 0.001)]);
    return csv('Replicate,Parameter,Value', rows);
  };

  it('r1, r3, r4: one parameter missing at a replicate (or never in some samples) does not make the sheet lose values', () => {
    const cases: [string, (s: number, rep: number, p: string) => boolean, number][] = [
      ['r1 Chl-a once in two samples', (s, rep, p) => p.startsWith('Chl') && (s === 1 || s === 4) && rep > 1, 6 * 12 - 4],
      ['r3 Chl-a never in two samples', (s, _rep, p) => p.startsWith('Chl') && (s === 1 || s === 4), 6 * 12 - 6],
      ['r4 one row missing', (s, rep, p) => s === 4 && rep === 3 && p.startsWith('Chl'), 6 * 12 - 1],
    ];
    for (const [name, drop, want] of cases) {
      const r = build(samples(6, drop));
      expect(read(r), name).toBe(want);
      expect(skipped(r), name).toEqual([]);
      expect(extended(r)[0].params.columns, name).toBe('Replicate');
    }
  });

  it('r5: one row missing of 6,000 still reads 5,999 values', () => {
    const r = build(samples(500, (s, rep, p) => s === 123 && rep === 3 && p.startsWith('Chl')));
    expect(read(r)).toBe(5999);
    expect(skipped(r)).toEqual([]);
  });

  it('r6: two different rows missing of 6,000 still read 5,998 values with no skipped warning', () => {
    const r = build(samples(500, (s, rep, p) => s === 123 && ((rep === 3 && p.startsWith('Chl')) || (rep === 2 && p.startsWith('Nitrate')))));
    expect(read(r)).toBe(5998);
    expect(r.dataset.rows).toHaveLength(1500);
    expect(skipped(r)).toEqual([]);
  });

  it('r7: two different rows missing in one sample of a small sheet: 18 rows, 70 values', () => {
    const r = build(samples(6, (s, rep, p) => s === 4 && ((rep === 3 && p.startsWith('Chl')) || (rep === 2 && p.startsWith('Nitrate')))));
    expect(r.dataset.rows).toHaveLength(18);
    expect(read(r)).toBe(70);
    expect(skipped(r)).toEqual([]);
  });

  it('w1: complementary blanks (or NA) in two replicates stay two rows: no merged row, no false DIC > TA', async () => {
    for (const miss of ['', 'NA']) {
      const t = csv('Replicate,Parameter,Value', [['S1', '1', DIC, miss], ['S1', '1', TA, '2300'], ['S1', '2', DIC, '2400'], ['S1', '2', TA, miss]]);
      const r = build(t);
      expect(r.dataset.rows, miss).toHaveLength(2);
      expect(extended(r), miss).toHaveLength(1);
      expect(await check(t), miss).not.toContain('CHEM-DIC-GT-TA');
    }
  });

  it('w2: a replicate whose first value is NA is not merged into the next one', () => {
    const r = build(csv('Replicate,Parameter,Value', [['S1', '1', 'Corg', 'NA'], ['S1', '1', 'Ntot', '3'], ['S1', '2', 'Corg', '5'], ['S1', '2', 'Ntot', '3']]));
    expect(r.dataset.rows).toHaveLength(2);
    expect(r.dataset.rows[1].values.Corg.value).toBe(5);
  });

  it('n1: blank, NA, a dash and null give way to the first value after them; n.d. and ND (not detected) do not, and the value after them is said', () => {
    for (const tok of ['NA', '-', 'null', '']) {
      const r = build(csv('Parameter,Value', [['S1', 'Corg', tok], ['S1', 'Corg', '5'], ['S1', 'Ntot', '6']]));
      expect(r.dataset.rows[0].values.Corg.value, tok).toBe(5);
      expect(skipped(r), tok).toEqual([]);
    }
    for (const tok of ['n.d.', 'ND', 'nd']) {
      const r = build(csv('Parameter,Value', [['S1', 'Corg', tok], ['S1', 'Corg', '5'], ['S1', 'Ntot', '6']]));
      expect(r.dataset.rows[0].values.Corg.value, tok).toBeUndefined();
      expect(skipped(r)[0].params.count, tok).toBe(1);
    }
  });

  it('n2: a value then ND: nothing is said; n3: NA, 5, 6 keeps the 5 and says the 6; n4: n.a. does not give way; n5: all missing says nothing', () => {
    const n2 = build(csv('Parameter,Value', [['S1', 'Corg', '5'], ['S1', 'Corg', 'ND'], ['S1', 'Ntot', '6']]));
    expect(n2.dataset.rows[0].values.Corg.value).toBe(5);
    expect(skipped(n2)).toEqual([]);
    const n3 = build(csv('Parameter,Value', [['S1', 'Corg', 'NA'], ['S1', 'Corg', '5'], ['S1', 'Corg', '6'], ['S1', 'Ntot', '6']]));
    expect(n3.dataset.rows[0].values.Corg.value).toBe(5);
    expect(skipped(n3)[0].params.count).toBe(1);
    const n4 = build(csv('Parameter,Value', [['S1', 'Corg', 'n.a.'], ['S1', 'Corg', '5'], ['S1', 'Ntot', '6']]));
    expect(n4.dataset.rows[0].values.Corg.value).toBeUndefined();
    expect(skipped(n4)[0].params.count).toBe(1);
    const n5 = build(csv('Parameter,Value', [['S1', 'Corg', 'NA'], ['S1', 'Corg', ''], ['S1', 'Ntot', '6']]));
    expect(skipped(n5)).toEqual([]);
  });

  it('the skipped texts say one value is kept and give the refusal reason as rows with no parameter in common', () => {
    const r = build(csv('Parameter,Value', [['S1', 'Corg', '5'], ['S1', 'Corg', '6']]));
    for (const lang of LANGS) expect(renderPlain(skipped(r)[0], lang)).not.toMatch(/only the first|nur der erste|seule la première|tylko pierwszą/i);
    expect(getRule('ROW-LONG-VALUE-SKIPPED').technical).toContain('no parameter in common');
    expect(getRule('ROW-LONG-VALUE-SKIPPED').technical).not.toContain('different parameters');
  });

  it('s1, s2, s3: the extension and the skipped warning read consistently side by side', () => {
    const s1 = build(csv('Replicate,Parameter,Value', [['S1', '1', 'Corg', '1'], ['S1', '2', 'Corg', '2'], ['S2', '1', 'Corg', '7'], ['S2', '1', 'Corg', '8']]));
    expect(extended(s1)).toHaveLength(1);
    expect(skipped(s1)[0].params.count).toBe(1);
    const s2 = build(csv('Method,Parameter,Value', [['S1', 'A', 'Corg', '1'], ['S1', 'A', 'Corg', '2'], ['S2', 'A', 'Corg', '4'], ['S2', 'B', 'Corg', '5']]));
    expect(extended(s2)[0].params.columns).toBe('Method');
    expect(skipped(s2)[0].params.count).toBe(1);
    const s3 = build(csv('Replicate,Parameter,Value', both([['1', 'Corg', '1.1'], ['1', 'Ntot', '2.1'], ['2', 'Corg', '1.2'], ['2', 'Ntot', '2.2']]).concat([['S3', '1', 'Corg', '5'], ['S3', '1', 'Corg', '6'], ['S3', '1', 'Ntot', '7']])));
    expect(extended(s3)).toHaveLength(1);
    expect(skipped(s3)[0].params.count).toBe(1);
    for (const r of [s1, s2, s3]) for (const lang of LANGS) {
      const e = renderPlain(extended(r)[0], lang);
      expect(e).not.toMatch(/[{}]/);
      expect(renderPlain(skipped(r)[0], lang)).not.toMatch(/[{}]/);
    }
  });

  it('the extended finding never claims completeness, in any language, and lists some of the rows it concerns', () => {
    const r = build(csv('Replicate,Parameter,Value', both([['1', 'Corg', '1'], ['2', 'Corg', '2']])));
    const f = extended(r)[0];
    expect(f.lines?.length).toBeGreaterThan(0);
    expect(f.lines!.length).toBeLessThanOrEqual(20);
    for (const lang of LANGS) {
      const text = renderPlain(f, lang);
      expect(text).not.toMatch(/[{}]/);
      expect(text).not.toMatch(/every value|alle Werte|toutes les valeurs|wszystkie/i);
      expect(text).toContain('Replicate');
    }
    expect(getRule('ROW-LONG-KEY-EXTENDED').technical).not.toMatch(/no value is dropped|every value/i);
  });

  it('u2: a blank kept value gives way to the first value after it: the 5 is read, nothing is said', () => {
    const r = build(csv('Parameter,Value', [['S1', 'Corg', ''], ['S1', 'Corg', '5'], ['S1', 'Ntot', '6']]));
    expect(r.dataset.rows[0].values.Corg.value).toBe(5);
    expect(skipped(r)).toEqual([]);
    expect(extended(r)).toEqual([]);
  });

  it('u1: a blank value in one replicate does not hide the 5 in the next', () => {
    const r = build(csv('Replicate,Parameter,Value', [['S1', '1', 'Corg', ''], ['S1', '1', 'Ntot', '3'], ['S1', '2', 'Corg', '5'], ['S1', '2', 'Ntot', '6']]));
    expect(skipped(r)).toEqual([]);
    expect(Object.values(r.dataset.rows.map((x) => x.values.Corg?.value)).filter((v) => v === 5)).toHaveLength(1);
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
