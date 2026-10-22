// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { checkCrossFile, equalWithin, normaliseStation } from '../../src/core/checks/crossfile';
import { byRule, makeCDataset, type RowSpec } from './c.helpers';

const DIC_L = [{ key: 'DIC', canonical: 'DIC', unit: 'µmol/L' }];
const DIC_KG = [{ key: 'DIC', canonical: 'DIC', unit: 'µmol/kg' }];
const vals = (xs: number[], key = 'DIC'): RowSpec[] =>
  xs.map((x, i) => ({ station: 'ST1', date: '2021-07-25', depth: i, v: { [key]: x } }));

describe('precision-derived equality', () => {
  it('uses half a unit of the last reported decimal of each value, summed', () => {
    expect(equalWithin(4321.7, 1, 4321.69, 2)).toBe(true); // 0.01 <= 0.05 + 0.005
    expect(equalWithin(1.0, 1, 1.1, 1)).toBe(true); // exactly one unit apart at one decimal: 0.1 <= 0.1
    expect(equalWithin(1.0, 1, 1.2, 1)).toBe(false);
    expect(equalWithin(41.7, 1, 42, 0)).toBe(true); // 0.3 <= 0.05 + 0.5
    expect(equalWithin(41.7, 1, 42.3, 0)).toBe(false);
  });
});

describe('normaliseStation', () => {
  it('takes the last "/" segment, trims, upper-cases and drops spaces', () => {
    expect(normaliseStation('X/ST2')).toBe('ST2');
    expect(normaliseStation(' st 2 ')).toBe('ST2');
    expect(normaliseStation('X9/ST2')).toBe('ST2');
    expect(normaliseStation('ST2')).toBe('ST2');
  });
});

describe('XF-STATION-ALIAS', () => {
  it('reports X/ST2 vs ST2 once, however many rows use them, with both files named', () => {
    const a = makeCDataset({ id: 'a', file: 'a.csv' }, [{ station: 'ST2' }, { station: 'ST2' }, { station: 'ST3' }]);
    const b = makeCDataset({ id: 'b', file: 'b.csv' }, [{ station: 'X/ST2' }, { station: 'X/ST2' }, { station: 'ST3' }]);
    const f = byRule(checkCrossFile([a, b]), 'XF-STATION-ALIAS');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('info');
    expect([f[0].params.nameA, f[0].params.nameB].sort()).toEqual(['ST2', 'X/ST2']);
    expect(f[0].params.fileA).toBe('a.csv');
    expect(f[0].params.fileB).toBe('b.csv');
    expect(f[0].datasetIds?.sort()).toEqual(['a', 'b']);
  });
  it('is silent when names are identical', () => {
    const a = makeCDataset({ id: 'a' }, [{ station: 'ST2' }]);
    const b = makeCDataset({ id: 'b' }, [{ station: 'ST2' }]);
    expect(byRule(checkCrossFile([a, b]), 'XF-STATION-ALIAS')).toHaveLength(0);
  });
  it('lists every dataset that uses a spelling', () => {
    const mk = (id: string, name: string) => makeCDataset({ id, file: `${id}.csv` }, [{ station: name }]);
    const f = byRule(checkCrossFile([mk('a', 'ST2'), mk('b', 'ST2'), mk('c', 'X/ST2')]), 'XF-STATION-ALIAS');
    expect(f).toHaveLength(1);
    const files = [String(f[0].params.fileA), String(f[0].params.fileB)].join(' ');
    for (const n of ['a.csv', 'b.csv', 'c.csv']) expect(files).toContain(n);
  });
});

describe('XF-UNIT-CONFLICT', () => {
  const base = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((x) => x + 0.5);
  it('flags equal numbers under amount/volume vs amount/mass labels (9 of 10)', () => {
    const a = makeCDataset({ id: 'a', file: 'sea.xlsx', sheet: 'Seawater', vars: DIC_L }, vals(base.map((x) => x)));
    const bv = [...base];
    bv[9] = 105.5;
    const b = makeCDataset({ id: 'b', file: 'col.csv', vars: DIC_KG }, vals(bv));
    const f = byRule(checkCrossFile([a, b]), 'XF-UNIT-CONFLICT');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', params: { variable: 'DIC', unitA: 'µmol/L', unitB: 'µmol/kg', matched: 10, equal: 9, fileA: 'sea.xlsx (Seawater)', fileB: 'col.csv' } });
  });
  it('tolerates one file rounding to integers (precision-derived)', () => {
    const a = makeCDataset({ id: 'a', vars: DIC_L }, vals([10.4, 20.3, 30.2]));
    const b = makeCDataset({ id: 'b', vars: DIC_KG }, vals([10, 20, 30]));
    expect(byRule(checkCrossFile([a, b]), 'XF-UNIT-CONFLICT')).toHaveLength(1);
  });
  it('is silent when the values differ by the density factor (a genuine L-to-kg conversion)', () => {
    const a = makeCDataset({ id: 'a', vars: DIC_L }, vals([2000.0, 2100.0, 2200.0]));
    const b = makeCDataset({ id: 'b', vars: DIC_KG }, vals([1950.1, 2049.0, 2146.3]));
    expect(byRule(checkCrossFile([a, b]), 'XF-UNIT-CONFLICT')).toHaveLength(0);
  });
  it('is silent when both labels are in the same dimension', () => {
    const a = makeCDataset({ id: 'a', vars: DIC_L }, vals(base));
    const b = makeCDataset({ id: 'b', vars: DIC_L }, vals(base));
    expect(byRule(checkCrossFile([a, b]), 'XF-UNIT-CONFLICT')).toHaveLength(0);
  });
  it('does not match a depth in cm to a depth in m, or an unknown depth unit', () => {
    const a = makeCDataset({ id: 'a', vars: DIC_L, depthUnit: 'cm' }, vals(base));
    const bm = makeCDataset({ id: 'b', vars: DIC_KG, depthUnit: 'm' }, vals(base));
    const bu = makeCDataset({ id: 'c', vars: DIC_KG, depthUnit: null }, vals(base));
    expect(byRule(checkCrossFile([a, bm]), 'XF-UNIT-CONFLICT')).toHaveLength(0);
    expect(byRule(checkCrossFile([a, bu]), 'XF-UNIT-CONFLICT')).toHaveLength(0);
  });
  it('matches the same depth when one file counts positive up and the other positive down', () => {
    const a = makeCDataset({ id: 'a', vars: DIC_L, depthPositive: 'down' }, [{ station: 'ST1', date: '2021-07-25', depth: 2.5, v: { DIC: 1.5 } }]);
    const b = makeCDataset({ id: 'b', vars: DIC_KG, depthPositive: 'up' }, [{ station: 'x/st1', date: '2021-07-25T10:00', depth: -2.5, v: { DIC: 1.5 } }]);
    expect(byRule(checkCrossFile([a, b]), 'XF-UNIT-CONFLICT')).toHaveLength(1);
  });
  it('needs the same day', () => {
    const a = makeCDataset({ id: 'a', vars: DIC_L }, [{ station: 'ST1', date: '2021-07-25', depth: 1, v: { DIC: 1.5 } }]);
    const b = makeCDataset({ id: 'b', vars: DIC_KG }, [{ station: 'ST1', date: '2021-07-26', depth: 1, v: { DIC: 1.5 } }]);
    expect(byRule(checkCrossFile([a, b]), 'XF-UNIT-CONFLICT')).toHaveLength(0);
  });
  it('matches by position at the coarser precision when there is no station', () => {
    const a = makeCDataset({ id: 'a', vars: DIC_L }, [{ lat: 54.0031, lon: 12.5557, date: '2021-07-25', depth: 1, v: { DIC: 1.5 } }]);
    const b = makeCDataset({ id: 'b', vars: DIC_KG }, [{ lat: 54.003, lon: 12.556, date: '2021-07-25', depth: 1, v: { DIC: 1.5 } }]);
    expect(byRule(checkCrossFile([a, b]), 'XF-UNIT-CONFLICT')).toHaveLength(1);
  });
});

describe('XF-DUPLICATE-SAMPLES', () => {
  it('counts samples with the same station, depth and day that share a measured variable', () => {
    const a = makeCDataset({ id: 'a', file: 'a.csv', vars: DIC_L }, vals([1.5, 2.5, 3.5]));
    const b = makeCDataset({ id: 'b', file: 'b.csv', vars: DIC_L }, vals([1.5, 2.5, 3.5]));
    const f = byRule(checkCrossFile([a, b]), 'XF-DUPLICATE-SAMPLES');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'info', params: { count: 3, fileA: 'a.csv', fileB: 'b.csv' } });
  });
  it('is silent when the other file measures different things at the same place and time', () => {
    const a = makeCDataset({ id: 'a', vars: DIC_L }, vals([1.5, 2.5]));
    const b = makeCDataset({ id: 'b', vars: [{ key: 'S', canonical: 'salinity' }] }, vals([34.1, 34.2], 'S'));
    expect(byRule(checkCrossFile([a, b]), 'XF-DUPLICATE-SAMPLES')).toHaveLength(0);
  });
});

describe('XF-DATE-CONFLICT', () => {
  const vars = [{ key: 'Na', canonical: 'sodium', unit: 'mg/L' }, { key: 'Cl', canonical: 'chloride', unit: 'mg/L' }];
  const rows = (date: string, name = 'ST2'): RowSpec[] => [
    { station: name, date, depth: 2.5, v: { Na: 4321.7, Cl: 18000.5 }, line: 7 },
    { station: name, date, depth: 7.5, v: { Na: 9800.1, Cl: 17100.3 }, line: 8 },
  ];
  it('flags the same values at the same depth with different dates, once per pair and station', () => {
    const a = makeCDataset({ id: 'a', file: 'a.csv', vars }, rows('2023-07-30'));
    const b = makeCDataset({ id: 'b', file: 'b.csv', vars }, rows('2022-07-30', 'X/ST2'));
    const f = byRule(checkCrossFile([a, b]), 'XF-DATE-CONFLICT');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', params: { station: 'ST2', fileA: 'a.csv', fileB: 'b.csv', dateA: '2023-07-30', dateB: '2022-07-30', lineA: 7, lineB: 7 } });
    expect(f[0].lines).toEqual([7, 8]);
  });
  it('is silent with one shared variable only', () => {
    const one = [vars[0]];
    const a = makeCDataset({ id: 'a', vars: one }, rows('2023-07-30').map((r) => ({ ...r, v: { Na: r.v!.Na } })));
    const b = makeCDataset({ id: 'b', vars: one }, rows('2022-07-30').map((r) => ({ ...r, v: { Na: r.v!.Na } })));
    expect(byRule(checkCrossFile([a, b]), 'XF-DATE-CONFLICT')).toHaveLength(0);
  });
  it('is silent when a shared variable differs', () => {
    const a = makeCDataset({ id: 'a', vars }, rows('2023-07-30'));
    const b = makeCDataset({ id: 'b', vars }, rows('2022-07-30').map((r) => ({ ...r, v: { Na: r.v!.Na, Cl: 99999.9 } })));
    expect(byRule(checkCrossFile([a, b]), 'XF-DATE-CONFLICT')).toHaveLength(0);
  });
  it('is silent when the dates agree or the depths differ', () => {
    const a = makeCDataset({ id: 'a', vars }, rows('2023-07-30'));
    expect(byRule(checkCrossFile([a, makeCDataset({ id: 'b', vars }, rows('2023-07-30'))]), 'XF-DATE-CONFLICT')).toHaveLength(0);
    const deeper = rows('2022-07-30').map((r) => ({ ...r, depth: Number(r.depth) + 100 }));
    expect(byRule(checkCrossFile([a, makeCDataset({ id: 'c', vars }, deeper)]), 'XF-DATE-CONFLICT')).toHaveLength(0);
  });
});

describe('XF-POSITION-SWAP and XF-POSITION-CONFLICT', () => {
  const at = (station: string, lat: number | string, lon: number | string, n = 2): RowSpec[] => Array.from({ length: n }, () => ({ station, lat, lon }));
  it('detects two stations whose positions are exchanged, and not as a conflict', () => {
    const a = makeCDataset({ id: 'a', file: 'a.csv' }, [...at('ST1', 54.0, '12.111'), ...at('ST2', 54.0, '12.555'), ...at('ST3', 55.1, '12.5')]);
    const b = makeCDataset({ id: 'b', file: 'b.csv' }, [...at('ST1', 54.0, '12.555'), ...at('ST2', 54.0, '12.111'), ...at('ST3', 55.1, '12.5')]);
    const fs = checkCrossFile([a, b]);
    const sw = byRule(fs, 'XF-POSITION-SWAP');
    expect(sw).toHaveLength(1);
    expect(sw[0].severity).toBe('warning');
    expect([sw[0].params.stationA, sw[0].params.stationB].sort()).toEqual(['ST1', 'ST2']);
    expect(sw[0].params).toMatchObject({ fileA: 'a.csv', fileB: 'b.csv' });
    expect(byRule(fs, 'XF-POSITION-CONFLICT')).toHaveLength(0);
  });
  it('names the dataset that disagrees with two that agree', () => {
    const mk = (id: string, lon: string) => makeCDataset({ id, file: `${id}.csv` }, [...at('ST7', 54.9, lon), ...at('ST3', 55.1, '12.5')]);
    const f = byRule(checkCrossFile([mk('a', '10.98'), mk('b', '12.65'), mk('c', '12.65')]), 'XF-POSITION-CONFLICT');
    expect(f).toHaveLength(1);
    expect(f[0].value).toBe('ST7');
    expect(f[0].params.station).toBe('ST7');
    expect(f[0].params.files).toBe('a.csv');
    expect(String(f[0].params.positions)).toContain('10.98');
  });
  it('names both when only two datasets disagree', () => {
    const mk = (id: string, lon: string) => makeCDataset({ id, file: `${id}.csv` }, at('ST7', 54.9, lon));
    const f = byRule(checkCrossFile([mk('a', '10.98'), mk('b', '12.65')]), 'XF-POSITION-CONFLICT');
    expect(f).toHaveLength(1);
    expect(String(f[0].params.files)).toContain('a.csv');
    expect(String(f[0].params.files)).toContain('b.csv');
  });
  it('does not blame one file when the "majority" is only sheets of one workbook', () => {
    const sheet = (s: string) => makeCDataset({ id: s, file: 'book.xlsx', sheet: s }, at('ST7', 54.9, '12.65'));
    const lone = makeCDataset({ id: 'z', file: 'z.csv' }, at('ST7', 54.9, '10.98'));
    const f = byRule(checkCrossFile([lone, sheet('S1'), sheet('S2')]), 'XF-POSITION-CONFLICT');
    expect(f).toHaveLength(1);
    expect(String(f[0].params.files)).toContain('z.csv');
    expect(String(f[0].params.files)).toContain('book.xlsx');
  });
  it('accepts rounding differences, drift inside the station\'s own spread, and ignores lat === lon rows', () => {
    const a = makeCDataset({ id: 'a' }, at('ST1', 54.003, '12.556'));
    const rounded = makeCDataset({ id: 'b' }, at('ST1', 54.0031, '12.5557'));
    expect(byRule(checkCrossFile([a, rounded]), 'XF-POSITION-CONFLICT')).toHaveLength(0);
    const drift = makeCDataset({ id: 'c' }, [{ station: 'ST1', lat: 54.003, lon: 12.4 }, { station: 'ST1', lat: 54.003, lon: 12.4 }, { station: 'ST1', lat: 54.003, lon: 12.6 }]);
    expect(byRule(checkCrossFile([a, drift]), 'XF-POSITION-CONFLICT')).toHaveLength(0);
    const defect = makeCDataset({ id: 'd' }, [{ station: 'ST1', lat: 54.123, lon: 54.123 }, { station: 'ST1', lat: 54.123, lon: 54.123 }, { station: 'ST1', lat: 54.003, lon: 12.556 }]);
    expect(byRule(checkCrossFile([a, defect]), 'XF-POSITION-CONFLICT')).toHaveLength(0);
  });
});

describe('performance', () => {
  // retry: the threshold is a wall-clock one and the full suite (scripts/deploy.sh) runs 50+ files in parallel; under that load the
  // test took 2147/2181 ms and passed alone. A real regression stays slow on every attempt, so the threshold is NOT raised.
  it('six datasets of 7000 rows finish well inside 2 s', { retry: 2 }, () => {
    const vars = [{ key: 'DIC', canonical: 'DIC', unit: 'µmol/L' }, { key: 'S', canonical: 'salinity' }];
    const make = (id: string, unit: string) =>
      makeCDataset(
        { id, file: `${id}.csv`, vars: vars.map((v) => (v.key === 'DIC' ? { ...v, unit } : v)) },
        Array.from({ length: 7000 }, (_, i) => ({
          station: `ST${i % 40}`,
          lat: 70 + (i % 40) * 0.01,
          lon: 15 + (i % 40) * 0.01,
          date: `2021-07-${String(1 + (i % 28)).padStart(2, '0')}`,
          depth: i % 175,
          v: { DIC: 2000 + (i % 91), S: 34 + (i % 7) / 10 },
        })),
      );
    const ds = ['µmol/L', 'µmol/kg', 'µmol/L', 'µmol/kg', 'µmol/L', 'µmol/kg'].map((u, i) => make(`d${i}`, u));
    const t0 = Date.now();
    checkCrossFile(ds);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
