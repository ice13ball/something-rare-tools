// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { checkChemistry, unitPairsWithoutMolarMass } from '../../src/core/checks/chemistry';
import { renderPlain } from '../../src/core/report';
import { LANGS } from '../../src/core/types';
import { byRule, makeCDataset, type RowSpec, type VarSpec } from './c.helpers';

const DOC: VarSpec[] = [
  { key: 'DOC_mg', canonical: 'DOC', unit: 'mg/L' },
  { key: 'DOC_umol', canonical: 'DOC', unit: 'µmol/L' },
];
const docRows = (pairs: [string, string][]): RowSpec[] => pairs.map(([m, u], i) => ({ station: 'ST1', line: 10 + i, v: { DOC_mg: m, DOC_umol: u } }));

describe('CHEM-UNIT-PAIR', () => {
  it('flags DOC 1.47 mg/L with 41.7 µmol/L and keeps an example', () => {
    const ds = makeCDataset({ id: 'a', file: 'w.csv', vars: DOC }, docRows([['1.00', '83.3'], ['1.47', '41.7'], ['2.00', '166.5']]));
    const f = byRule(checkChemistry(ds), 'CHEM-UNIT-PAIR');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', lines: [11], value: '1.47 mg/L vs 41.7 µmol/L', params: { variable: 'DOC', unitA: 'mg/L', unitB: 'µmol/L' } });
  });
  it('is silent for DOC 1.00 mg/L with 83.3 µmol/L (agree within the rounding of both)', () => {
    const ds = makeCDataset({ id: 'a', vars: DOC }, docRows([['1.00', '83.3'], ['2.00', '166.5'], ['0.03', '2.5']]));
    expect(byRule(checkChemistry(ds), 'CHEM-UNIT-PAIR')).toHaveLength(0);
  });
  it('one finding per variable with every offending line', () => {
    const ds = makeCDataset({ id: 'a', vars: DOC }, docRows([['1.47', '41.7'], ['1.00', '83.3'], ['1.75', '68.7']]));
    expect(byRule(checkChemistry(ds), 'CHEM-UNIT-PAIR')[0].lines).toEqual([10, 12]);
  });
  it('converts mmol/L and µg/L by their prefixes', () => {
    const vars: VarSpec[] = [{ key: 'm', canonical: 'DOC', unit: 'µg/L' }, { key: 'a', canonical: 'DOC', unit: 'mmol/L' }];
    const ok = makeCDataset({ id: 'a', vars }, [{ v: { m: '12011', a: '1.000' } }]);
    expect(byRule(checkChemistry(ok), 'CHEM-UNIT-PAIR')).toHaveLength(0);
    const bad = makeCDataset({ id: 'a', vars }, [{ v: { m: '12011', a: '2.000' } }]);
    expect(byRule(checkChemistry(bad), 'CHEM-UNIT-PAIR')).toHaveLength(1);
  });
  it('uses the nitrogen, phosphorus and silicon molar masses of the rule', () => {
    const mk = (canonical: string, mass: string, amount: string) =>
      makeCDataset({ id: 'a', vars: [{ key: 'm', canonical, unit: 'mg/L' }, { key: 'a', canonical, unit: 'µmol/L' }] }, [{ v: { m: mass, a: amount } }]);
    expect(byRule(checkChemistry(mk('ammonium', '1.4007', '100.0')), 'CHEM-UNIT-PAIR')).toHaveLength(0);
    expect(byRule(checkChemistry(mk('phosphate', '3.0974', '100.0')), 'CHEM-UNIT-PAIR')).toHaveLength(0);
    expect(byRule(checkChemistry(mk('silicate', '2.8085', '100.0')), 'CHEM-UNIT-PAIR')).toHaveLength(0);
    expect(byRule(checkChemistry(mk('silicate', '2.8085', '300.0')), 'CHEM-UNIT-PAIR')).toHaveLength(1);
  });
  it('skips ions with no cited molar mass and lists them', () => {
    const vars: VarSpec[] = [{ key: 'm', canonical: 'sodium', unit: 'mg/L' }, { key: 'a', canonical: 'sodium', unit: 'mmol/L' }];
    const ds = makeCDataset({ id: 'a', vars }, [{ v: { m: '4321.7', a: '1.0' } }]);
    expect(byRule(checkChemistry(ds), 'CHEM-UNIT-PAIR')).toHaveLength(0);
    expect(unitPairsWithoutMolarMass(ds)).toEqual([{ variable: 'sodium', unitA: 'mg/L', unitB: 'mmol/L' }]);
  });
  it('ignores rows where either value is missing', () => {
    const ds = makeCDataset({ id: 'a', vars: DOC }, [{ v: { DOC_mg: '1.47' } }]);
    expect(byRule(checkChemistry(ds), 'CHEM-UNIT-PAIR')).toHaveLength(0);
  });
});

describe('CHEM-DIC-GT-TA', () => {
  const vars: VarSpec[] = [{ key: 'DIC', canonical: 'DIC', unit: 'µmol/kg' }, { key: 'TA', canonical: 'TA', unit: 'µmol/kg' }];
  it('groups by cruise and reports count, total and the integer median of TA - DIC', () => {
    const rows: RowSpec[] = [
      { cruise: 'C19', line: 2, v: { DIC: '2300', TA: '2100' } },
      { cruise: 'C19', line: 3, v: { DIC: '2400', TA: '2150' } },
      { cruise: 'C19', line: 4, v: { DIC: '2350', TA: '2100' } },
      { cruise: 'C20', line: 5, v: { DIC: '2100', TA: '2300' } },
      { cruise: 'C20', line: 6, v: { DIC: '2000', TA: '2250' } },
    ];
    const f = byRule(checkChemistry(makeCDataset({ id: 'a', file: 'ta.csv', vars }, rows)), 'CHEM-DIC-GT-TA');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', file: 'ta.csv', lines: [2, 3, 4], params: { group: 'C19', count: 3, total: 3, medianDiff: -250 } });
  });
  it('groups by dataset when there is no cruise', () => {
    const f = byRule(checkChemistry(makeCDataset({ id: 'a', file: 'ta.csv', vars }, [{ v: { DIC: '2300', TA: '2100' } }, { v: { DIC: '2000', TA: '2300' } }])), 'CHEM-DIC-GT-TA');
    expect(f[0].params).toMatchObject({ group: 'ta.csv', count: 1, total: 2 });
  });
  it('does not count DIC equal to TA within their rounding, nor different units', () => {
    const eq = makeCDataset({ id: 'a', vars }, [{ v: { DIC: '2300', TA: '2300' } }, { v: { DIC: '2300.2', TA: '2300.1' } }]);
    expect(byRule(checkChemistry(eq), 'CHEM-DIC-GT-TA')).toHaveLength(0);
    const units: VarSpec[] = [{ key: 'DIC', canonical: 'DIC', unit: 'µmol/L' }, { key: 'TA', canonical: 'TA', unit: 'µmol/kg' }];
    expect(byRule(checkChemistry(makeCDataset({ id: 'a', vars: units }, [{ v: { DIC: '2400', TA: '2100' } }])), 'CHEM-DIC-GT-TA')).toHaveLength(0);
  });
});

describe('CHEM-RANGE', () => {
  const v = (canonical: string, unit?: string): VarSpec[] => [{ key: 'x', header: 'x', canonical, ...(unit ? { unit } : {}) }];
  const run = (vars: VarSpec[], xs: string[]) => byRule(checkChemistry(makeCDataset({ id: 'a', vars }, xs.map((x) => ({ v: { x } })))), 'CHEM-RANGE');
  it('salinity 50 is outside the cited 2..41, 41 and 2 are not', () => {
    const f = run(v('salinity'), ['35.1', '50.0', '41', '2', '1.2']);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', field: 'x', lines: [3, 6], value: '50.0', params: { variable: 'salinity', min: 2, max: 41, count: 2 } });
  });
  it('accepts PSU, dimensionless and no unit for salinity, but not other units', () => {
    expect(run(v('salinity', 'PSU'), ['50'])).toHaveLength(1);
    expect(run(v('salinity', 'dimensionless'), ['50'])).toHaveLength(1);
    expect(run(v('salinity', '‰'), ['50'])).toHaveLength(0);
  });
  it('temperature only with °C; oxygen only with µmol/kg; pH with no unit', () => {
    expect(run(v('temperature', '°C'), ['45', '5'])).toHaveLength(1);
    expect(run(v('temperature'), ['45'])).toHaveLength(0);
    expect(run(v('oxygen', 'µmol/L'), ['900'])).toHaveLength(0);
    expect(run(v('oxygen', 'µmol/kg'), ['900', '-6', '300'])[0].params).toMatchObject({ min: -5, max: 600, count: 2 });
    expect(run(v('pH'), ['9.5', '6.4', '8.1'])[0].params).toMatchObject({ min: 6.5, max: 9, count: 2 });
  });
  it('a one-sided bound shows the open side as ∞', () => {
    const f = run([{ key: 'x', header: 'x', unit: 'dbar' }], ['-6', '100']);
    expect(f[0].params).toMatchObject({ min: -5, max: '∞', count: 1 });
  });
  it('the plain message says it is the open-ocean range and asks to confirm fresh or brackish water', () => {
    const f = run(v('salinity'), ['1.2'])[0];
    for (const lang of LANGS) expect(renderPlain(f, lang).length).toBeGreaterThan(40);
    expect(renderPlain(f, 'en')).toMatch(/open-ocean/i);
    expect(renderPlain(f, 'en')).toMatch(/fresh or brackish/i);
  });
});
