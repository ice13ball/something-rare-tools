// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// K2: the depth direction is decided only when every non-zero value shares a sign; -99, -999 and -9999 are reported as possible missing-value
// codes and kept out of the direction and the range checks, never rewritten. Every value is invented.
import { describe, expect, it } from 'vitest';
import { runChecks } from '../../src/core/checks/run';
import { buildDataset } from '../../src/core/dataset';
import { parseFile } from '../../src/core/parse';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import { depthSigns, proposeColumns } from '../../src/core/recognize/columns';
import { isMissingValueCode, MISSING_VALUE_CODES } from '../../src/core/values/numbers';
import { checkRows } from '../../src/core/checks/rows';
import { checkChemistry } from '../../src/core/checks/chemistry';
import { toCleanCsv } from '../../src/core/output/csv';
import type { Finding } from '../../src/core/types';
import { makeCDataset } from './c.helpers';

const csv = (header: string, rows: string[][]): string => `${header}\n${rows.map((r) => r.join(',')).join('\n')}\n`;
const depthCsv = (depths: string[], extra?: (i: number) => string): string =>
  csv('Station,Latitude,Longitude,Depth [m],Temp [°C]', depths.map((d, i) => ['S1', '70', '10', d, extra ? extra(i) : '5']));

const run = (text: string) => {
  const f = parseFile('d.csv', new TextEncoder().encode(text));
  const layout = proposeLayout(f);
  const { dataset } = buildDataset(f, layout, proposeMappings(f, layout), [], 'x');
  const findings = runChecks({ datasets: [dataset], records: [], parseFindings: [] }, { land: null }).findings;
  return { f, dataset, findings };
};
const ids = (fs: Finding[], id: string) => fs.filter((x) => x.ruleId === id);
const roleOf = (text: string) => {
  const f = parseFile('d.csv', new TextEncoder().encode(text));
  return proposeColumns(f.sheets[0], { decimalComma: false, date1904: false }).find((p) => p.role.kind === 'depth')!;
};

describe('the codes', () => {
  it('are exactly -99, -999 and -9999 by numeric equality', () => {
    expect(MISSING_VALUE_CODES).toEqual([-99, -999, -9999]);
    for (const v of [-99, -999, -9999, -999.0, Number('-999,0'.replace(',', '.'))]) expect(isMissingValueCode(v)).toBe(true);
    for (const v of [99, 999, -98, -99.5, -9998, 0, -1000]) expect(isMissingValueCode(v)).toBe(false);
  });
});

describe('depthSigns reads every row, skipping 0, text and the codes', () => {
  it('counts both signs over more rows than a sample holds', () => {
    const f = parseFile('d.csv', new TextEncoder().encode(depthCsv([...Array(1200).fill('5'), '-3', '0', 'x', '-999'])));
    expect(depthSigns(f.sheets[0].rows, 3, false)).toEqual({ negatives: 1, positives: 1200 });
  });
  it('reads a decimal comma', () => {
    const f = parseFile('d.csv', new TextEncoder().encode('a;b\n-1,5;x\n2,5;y\n'));
    expect(depthSigns(f.sheets[0].rows, 0, true)).toEqual({ negatives: 1, positives: 1 });
  });
});

describe('the direction of the column (proposal)', () => {
  it('mixed signs leave it unknown, name the note, and never take the majority', () => {
    const p = roleOf(depthCsv(['-0.3', '5', '10', '15000']));
    expect(p.role).toMatchObject({ kind: 'depth', positive: 'unknown' });
    expect(p.reasonNotes).toContain('note-depth-mixed-signs');
  });
  it('1200 positive rows then one negative: mixed (every row is read)', () => {
    expect(roleOf(depthCsv([...Array(1200).fill('5'), '-2'])).role).toMatchObject({ positive: 'unknown' });
  });
  it('only negatives are up, only positives down, no new note', () => {
    const up = roleOf(depthCsv(['-5', '-10', '-20']));
    expect(up.role).toMatchObject({ positive: 'up' });
    expect(up.reasonNotes ?? []).not.toContain('note-depth-mixed-signs');
    const down = roleOf(depthCsv(['5', '10']));
    expect(down.role).toMatchObject({ positive: 'down' });
    expect(down.reasonNotes ?? []).not.toContain('note-depth-mixed-signs');
  });
  it('a code and a zero do not make a column mixed or up', () => {
    expect(roleOf(depthCsv(['5', '-999', '10', '0'])).role).toMatchObject({ positive: 'down' });
    expect(roleOf(depthCsv(['-5', '-999', '0'])).role).toMatchObject({ positive: 'up' });
    expect(roleOf(depthCsv(['-999', '-99'])).role).toMatchObject({ positive: 'unknown' });
  });
  it('an elevation column stays up whatever its signs', () => {
    const f = parseFile('d.csv', new TextEncoder().encode(csv('Station,Latitude,Longitude,Elevation [m]', [['S1', '70', '10', '5'], ['S1', '70', '10', '-5']])));
    const p = proposeColumns(f.sheets[0], { decimalComma: false, date1904: false }).find((x) => x.role.kind === 'depth')!;
    expect(p.role).toMatchObject({ positive: 'up' });
  });
});

describe('ROW-DEPTH-MIXED-SIGN and ROW-DEPTH-RANGE on /check', () => {
  it('both signs: one finding with both counts, the range on absolute values, no ROW-DEPTH-SIGN', () => {
    const { findings } = run(depthCsv(['-0.3', '5', '10', '15000']));
    const m = ids(findings, 'ROW-DEPTH-MIXED-SIGN');
    expect(m).toHaveLength(1);
    expect(m[0].params).toMatchObject({ header: 'Depth [m]', negative: 1, positive: 3 });
    expect(ids(findings, 'ROW-DEPTH-RANGE')).toHaveLength(1);
    expect(ids(findings, 'ROW-DEPTH-RANGE')[0].lines).toEqual([5]);
    expect(ids(findings, 'ROW-DEPTH-SIGN')).toHaveLength(0);
  });
  it('a large negative value in a mixed column is judged by its size', () => {
    const { findings } = run(depthCsv(['5', '-15000']));
    expect(ids(findings, 'ROW-DEPTH-RANGE')[0].lines).toEqual([3]);
  });
  it('only negatives: up, no new finding, the range is judged turned', () => {
    const { findings } = run(depthCsv(['-5', '-10', '-20']));
    expect(ids(findings, 'ROW-DEPTH-MIXED-SIGN')).toHaveLength(0);
    expect(ids(findings, 'ROW-DEPTH-RANGE')).toHaveLength(0);
    expect(ids(findings, 'ROW-DEPTH-SIGN')).toHaveLength(0);
  });
  it('1200 positive rows then one negative: mixed', () => {
    const { findings } = run(depthCsv([...Array(1200).fill('5'), '-2']));
    expect(ids(findings, 'ROW-DEPTH-MIXED-SIGN')[0].params).toMatchObject({ negative: 1, positive: 1200 });
  });
  it('a code is left out of the counts', () => {
    expect(ids(run(depthCsv(['5', '-999', '10'])).findings, 'ROW-DEPTH-MIXED-SIGN')).toHaveLength(0);
  });
  it('the policy of ROW-DEPTH-MIXED-SIGN is accept; ROW-MISSING-CODE blocks the converter\'s export until its column is answered (it is a warning here)', async () => {
    const { policyOf } = await import('../../src/core/convert/policy');
    const { findings } = run(depthCsv(['-1', '5', '-999']));
    expect(policyOf(ids(findings, 'ROW-DEPTH-MIXED-SIGN')[0])).toBe('accept');
    expect(policyOf(ids(findings, 'ROW-MISSING-CODE')[0])).toBe('block');
    expect(ids(findings, 'ROW-MISSING-CODE')[0].severity).toBe('warning');
  });
});

describe('a declared direction combined with mixed signs', () => {
  const sheetRows = (depths: number[]) => depths.map((d, i) => ({ station: 'S1', date: '2022-05-01', depth: d, line: i + 2 }));
  for (const declared of ['down', 'up'] as const) {
    it(`a column declared ${declared} (by the person) still gets ROW-DEPTH-MIXED-SIGN with both counts, and the range is judged on absolute values`, () => {
      const ds = makeCDataset({ id: 'a', depthPositive: declared }, sheetRows([-0.3, 5, 10, 15000, -20000]));
      const f = checkRows(ds);
      const m = f.filter((x) => x.ruleId === 'ROW-DEPTH-MIXED-SIGN');
      expect(m).toHaveLength(1);
      expect(m[0].params).toMatchObject({ negative: 2, positive: 3 });
      expect(f.filter((x) => x.ruleId === 'ROW-DEPTH-SIGN')).toHaveLength(0);
      // |-20000| and 15000 are out whatever the declared direction
      expect(f.filter((x) => x.ruleId === 'ROW-DEPTH-RANGE')[0].lines).toEqual([5, 6]);
    });
  }
  it('a declared direction with one sign only is silent', () => {
    const ds = makeCDataset({ id: 'a', depthPositive: 'up' }, sheetRows([-1, -5, 0]));
    expect(checkRows(ds).filter((x) => x.ruleId === 'ROW-DEPTH-MIXED-SIGN')).toHaveLength(0);
  });
});

describe('ROW-MISSING-CODE', () => {
  it('depths 5, -999, 10, 20000: the code is named with its line, the range names 20000, the direction is down', () => {
    const text = depthCsv(['5', '-999', '10', '20000']);
    const { findings, dataset } = run(text);
    const c = ids(findings, 'ROW-MISSING-CODE').filter((x) => x.field === 'Depth [m]');
    expect(c).toHaveLength(1);
    expect(c[0].lines).toEqual([3]);
    expect(c[0].value).toBe('-999');
    expect(c[0].params).toMatchObject({ column: 'Depth [m]', count: 1 });
    const r = ids(findings, 'ROW-DEPTH-RANGE');
    expect(r).toHaveLength(1);
    expect(r[0].lines).toEqual([5]);
    expect(r[0].value).toBe('20000');
    expect(dataset.depthPositive).toBe('down');
    expect(roleOf(text).role).toMatchObject({ positive: 'down' });
    expect(ids(findings, 'ROW-DEPTH-MIXED-SIGN')).toHaveLength(0);
  });
  it('a code is never a depth outside the range, whatever the direction', () => {
    const { findings } = run(depthCsv(['-9999', '-999', '-99', '5']));
    expect(ids(findings, 'ROW-DEPTH-RANGE')).toHaveLength(0);
    expect(ids(findings, 'ROW-MISSING-CODE').find((x) => x.field === 'Depth [m]')!.params.count).toBe(3);
  });
  it('a measurement column is checked too, once per column', () => {
    const { findings } = run(depthCsv(['5', '6', '7'], (i) => (i === 1 ? '-99' : '4')));
    const c = ids(findings, 'ROW-MISSING-CODE').filter((x) => x.field === 'Temp [°C]');
    expect(c).toHaveLength(1);
    expect(c[0].lines).toEqual([3]);
    expect(c[0].value).toBe('-99');
  });
  it('-999.0 counts; -998 and -99.5 do not', () => {
    const { findings } = run(depthCsv(['5', '6', '7', '8'], (i) => ['-999.0', '-998', '-99.5', '3'][i]));
    expect(ids(findings, 'ROW-MISSING-CODE').filter((x) => x.field === 'Temp [°C]')[0].lines).toEqual([2]);
  });
  it('a column that has no code has no finding; latitude and longitude are not looked at', () => {
    const { findings } = run(csv('Station,Latitude,Longitude,Depth [m]', [['S1', '-99', '-99', '5']]));
    expect(ids(findings, 'ROW-MISSING-CODE')).toHaveLength(0);
  });
  it('CHEM-RANGE skips a code: oxygen -999 is reported by ROW-MISSING-CODE only', () => {
    const ds = makeCDataset({ id: 'a', vars: [{ key: 'ox', header: 'Oxygen', canonical: 'oxygen', unit: 'µmol/kg' }] }, [{ v: { ox: '300' } }, { v: { ox: '-999' } }, { v: { ox: '900' } }]);
    const r = checkChemistry(ds).filter((x) => x.ruleId === 'CHEM-RANGE');
    expect(r).toHaveLength(1);
    expect(r[0].lines).toHaveLength(1);
    expect(r[0].params.count).toBe(1);
    const only = checkChemistry(makeCDataset({ id: 'a', vars: [{ key: 'ox', header: 'Oxygen', canonical: 'oxygen', unit: 'µmol/kg' }] }, [{ v: { ox: '-999' } }]));
    expect(only.filter((x) => x.ruleId === 'CHEM-RANGE')).toHaveLength(0);
    const { findings } = run(csv('Station,Latitude,Longitude,Oxygen [µmol/kg]', [['S1', '70', '10', '-999'], ['S1', '70', '10', '300']]));
    expect(ids(findings, 'ROW-MISSING-CODE').map((x) => x.field)).toEqual(['Oxygen [µmol/kg]']);
    expect(ids(findings, 'CHEM-RANGE')).toHaveLength(0);
  });
  it('the clean CSV keeps -999 as written', () => {
    const { dataset } = run(depthCsv(['5', '-999', '10']));
    const lines = toCleanCsv(dataset).csv.split('\n');
    expect(lines.filter((l) => l.includes('-999'))).toHaveLength(1);
  });
});
