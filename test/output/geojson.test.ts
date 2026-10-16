// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { toGeoJson, worstSeverityByRow } from '../../src/core/output/geojson';
import { buildReport } from '../../src/core/report';
import type { Finding } from '../../src/core/types';
import { dataset, day, ok, row } from './ds';

const f = (ruleId: string, severity: Finding['severity'], extra: Partial<Finding> = {}): Finding => ({ ruleId, severity, params: {}, ...extra });

const ds = dataset([
  row(2, { station: 'ST1', lat: 76.5, lon: 15.1, datetime: day('2021-07-25') }),
  row(3, { station: 'ST2', lat: -10.25, lon: -170.5 }),
  row(4, { lat: 5 }), // no longitude: not a point
  row(5, { station: 'ST3', lat: 1, lon: 2 }),
]);

describe('toGeoJson', () => {
  const report = buildReport([
    f('ROW-A', 'info', { file: 'a.csv', lines: [2] }),
    f('ROW-B', 'warning', { file: 'a.csv', lines: [2, 3] }),
    f('ROW-C', 'error', { file: 'other.csv', lines: [5] }),
    f('DS-D', 'error', { file: 'a.csv', datasetIds: ['ds1'] }), // dataset-level: does not count
  ]);
  const fc = JSON.parse(toGeoJson([ds], report));

  it('is a FeatureCollection of points, [lon, lat] exactly, rows without both coordinates skipped', () => {
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(3);
    expect(fc.features.map((x: { geometry: unknown }) => x.geometry)).toEqual([
      { type: 'Point', coordinates: [15.1, 76.5] },
      { type: 'Point', coordinates: [-170.5, -10.25] },
      { type: 'Point', coordinates: [2, 1] },
    ]);
  });

  it('properties: file, line, optional station and date, worst row-level severity', () => {
    expect(fc.features[0].properties).toEqual({ file: 'a.csv', line: 2, station: 'ST1', date: '2021-07-25', worstSeverity: 'warning' });
    expect(fc.features[1].properties).toEqual({ file: 'a.csv', line: 3, station: 'ST2', worstSeverity: 'warning' });
    expect(fc.features[2].properties).toEqual({ file: 'a.csv', line: 5, station: 'ST3', worstSeverity: 'none' });
  });
});

describe('worstSeverityByRow', () => {
  it('keys are file#line, every row is present, error beats warning beats info', () => {
    const m = worstSeverityByRow(
      [ds],
      buildReport([f('X', 'info', { file: 'a.csv', lines: [4] }), f('Y', 'error', { file: 'a.csv', lines: [4, 5] }), f('Z', 'warning', { file: 'a.csv', lines: [5] })]),
    );
    expect([...m.entries()]).toEqual([['a.csv#2', 'none'], ['a.csv#3', 'none'], ['a.csv#4', 'error'], ['a.csv#5', 'error']]);
  });

  it('a finding on the line of a value cell counts for its (long-layout) row; another sheet does not', () => {
    const long = dataset([row(2, { sheet: 'S1', values: { a: ok('1', 2, 1), b: ok('2', 7, 2) } })]);
    const hit = worstSeverityByRow([long], buildReport([f('X', 'warning', { file: 'a.csv', sheet: 'S1', lines: [7] })]));
    expect(hit.get('a.csv#2')).toBe('warning');
    const miss = worstSeverityByRow([long], buildReport([f('X', 'warning', { file: 'a.csv', sheet: 'S2', lines: [2] })]));
    expect(miss.get('a.csv#2')).toBe('none');
  });
});
