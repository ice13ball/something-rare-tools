// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { checkRows } from '../../src/core/checks/rows';
import type { Finding } from '../../src/core/types';
import { dataset, record, row, rows, variable } from './rows.helpers';

const only = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id);
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe('ROW-LAT-RANGE / ROW-LON-RANGE', () => {
  it('flags latitude 91 and longitude -181 with all lines and the first value', () => {
    const ds = dataset([
      row({ line: 2, lat: 54.1, lon: 10.2 }),
      row({ line: 3, lat: 91, lon: 10.2 }),
      row({ line: 4, lat: -90.5, lon: -181 }),
      row({ line: 5, lat: 90, lon: -180 }),
    ]);
    const fs = checkRows(ds);
    const lat = only(fs, 'ROW-LAT-RANGE');
    expect(lat).toHaveLength(1);
    expect(lat[0]).toMatchObject({ severity: 'error', lines: [3, 4], value: '91', file: 'a.csv' });
    const lon = only(fs, 'ROW-LON-RANGE');
    expect(lon).toHaveLength(1);
    expect(lon[0]).toMatchObject({ lines: [4], value: '-181' });
  });

  it('accepts the bounds themselves and rows without a position', () => {
    const fs = checkRows(dataset([row({ line: 2, lat: 90, lon: 180 }), row({ line: 3, lat: -90, lon: -180 }), row({ line: 4 })]));
    expect(only(fs, 'ROW-LAT-RANGE')).toEqual([]);
    expect(only(fs, 'ROW-LON-RANGE')).toEqual([]);
  });

  it('names the mapped column in field', () => {
    const ds = dataset([row({ line: 2, lat: 95, lon: 1 })], {
      mappings: [{ sheet: 'a.csv', columns: [{ index: 0, header: 'Latitude [deg]', role: { kind: 'latitude' } }] }],
    });
    expect(only(checkRows(ds), 'ROW-LAT-RANGE')[0].field).toBe('Latitude [deg]');
  });
});

describe('ROW-LAT-EQ-LON', () => {
  it('gives one finding with all 27 lines', () => {
    const ds = dataset([row({ line: 2, lat: 76.1, lon: 15.2 }), ...rows(57, 27, { lat: 76.9, lon: 76.9, station: 'ST4' })]);
    const f = only(checkRows(ds), 'ROW-LAT-EQ-LON');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'error', lines: range(57, 83), value: '76.9' });
  });

  it('does not fire when only one coordinate is present or they differ', () => {
    const fs = checkRows(dataset([row({ line: 2, lat: 5 }), row({ line: 3, lon: 5 }), row({ line: 4, lat: 5, lon: 5.1 })]));
    expect(only(fs, 'ROW-LAT-EQ-LON')).toEqual([]);
  });
});

describe('ROW-STATION-MOVED', () => {
  const moved = () =>
    dataset([
      ...rows(2, 9, { lat: 77.0, latDecimals: 1, lon: 15.5, station: 'ST5', date: '2021-08-24' }),
      ...rows(11, 14, { lat: 77.0, latDecimals: 1, lon: 16.5, station: 'ST5', date: '2021-07-25' }),
    ]);

  it('flags a typed digit (lon 15.5 vs 16.5) with the minority rows and a positions text', () => {
    const f = only(checkRows(moved()), 'ROW-STATION-MOVED');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', value: 'ST5', lines: range(2, 10) });
    expect(f[0].params.station).toBe('ST5');
    expect(f[0].params.positions).toBe('15.5 E, 77.0 N (9 rows, 2021-08-24); 16.5 E, 77.0 N (14 rows, 2021-07-25)');
  });

  it('flags a typed digit even when the other axis was re-measured at different decimals (54.3215 vs 54.321111)', () => {
    const ds = dataset([
      ...rows(2, 9, { lat: 54.321111, lon: 12.345, station: 'ST5' }),
      ...rows(11, 14, { lat: 54.3215, lon: 13.345, station: 'ST5' }),
    ]);
    const f = only(checkRows(ds), 'ROW-STATION-MOVED');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual(range(2, 10));
  });

  it('flags latitude and longitude exchanged between two positions', () => {
    const ds = dataset([...rows(2, 3, { lat: 54.25, lon: 10.75, station: 'ST1' }), ...rows(5, 8, { lat: 10.75, lon: 54.25, station: 'ST1' })]);
    const f = only(checkRows(ds), 'ROW-STATION-MOVED');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual(range(2, 4));
  });

  it('is silent for a tiny shift that is neither a digit nor a swap (15.5000 vs 15.5003)', () => {
    const ds = dataset([...rows(2, 4, { lat: 77.0, lon: 15.5, latDecimals: 4, lonDecimals: 4, station: 'ST5' }), ...rows(6, 4, { lat: 77.0, lon: 15.5003, station: 'ST5' })]);
    expect(only(checkRows(ds), 'ROW-STATION-MOVED')).toEqual([]);
  });

  it('is silent for a distance that is not a whole number of degrees (no distance threshold exists)', () => {
    const ds = dataset([...rows(2, 4, { lat: 77.0, lon: 15.5, station: 'ST5' }), ...rows(6, 4, { lat: 77.0, lon: 16.0, station: 'ST5' })]);
    expect(only(checkRows(ds), 'ROW-STATION-MOVED')).toEqual([]);
  });

  it('compares at the coarser precision: 15.5 and 15.53 are one position', () => {
    const ds = dataset([...rows(2, 4, { lat: 77.0, lon: 15.5, station: 'ST5' }), ...rows(6, 4, { lat: 77.0, lon: 15.53, station: 'ST5' })]);
    expect(only(checkRows(ds), 'ROW-STATION-MOVED')).toEqual([]);
  });

  it('ignores rows without a station and positions that agree', () => {
    const ds = dataset([...rows(2, 4, { lat: 77.0, lon: 15.5 }), ...rows(6, 4, { lat: 77.0, lon: 16.5 }), ...rows(10, 3, { lat: 1, lon: 2, station: 'ST1' })]);
    expect(only(checkRows(ds), 'ROW-STATION-MOVED')).toEqual([]);
  });

  it('does not duplicate ROW-LAT-EQ-LON: a position with lat === lon is left to that rule', () => {
    const ds = dataset([...rows(2, 5, { lat: 54.987, lon: 54.987, station: 'ST4' }), ...rows(7, 6, { lat: 54.987, lon: 12.987, station: 'ST4' })]);
    const fs = checkRows(ds);
    expect(only(fs, 'ROW-STATION-MOVED')).toEqual([]);
    expect(only(fs, 'ROW-LAT-EQ-LON')).toHaveLength(1);
  });

  it('lists at most 3 dates per position', () => {
    const a = ['2021-01-01', '2021-01-02', '2021-01-03', '2021-01-04'].flatMap((d, i) => rows(2 + i, 1, { lat: 77.0, lon: 15.5, station: 'ST5', date: d }));
    const ds = dataset([...a, ...rows(10, 9, { lat: 77.0, lon: 16.5, station: 'ST5', date: '2021-02-01' })]);
    const f = only(checkRows(ds), 'ROW-STATION-MOVED')[0];
    expect(String(f.params.positions)).toContain('(4 rows, 2021-01-01, 2021-01-02, 2021-01-03, …)');
  });
});

describe('ROW-DATE-MISSING', () => {
  it('reports 2 of 100 rows without a date as info with percent 2', () => {
    const rs = [...rows(2, 98, { lat: 1, lon: 2, date: '2021-01-01' }), row({ line: 100, lat: 1, lon: 2 }), row({ line: 101, lat: 1, lon: 2 })];
    const f = only(checkRows(dataset(rs)), 'ROW-DATE-MISSING');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'info', lines: [100, 101], params: { count: 2, percent: 2 } });
  });

  it('keeps one decimal in the percentage', () => {
    const rs = [...rows(2, 6, { date: '2021-01-01' }), row({ line: 8 })];
    expect(only(checkRows(dataset(rs)), 'ROW-DATE-MISSING')[0].params.percent).toBe(14.3);
  });

  it('does nothing when no row has a date (META-NO-DATES covers that)', () => {
    expect(only(checkRows(dataset(rows(2, 5, { lat: 1, lon: 2 }))), 'ROW-DATE-MISSING')).toEqual([]);
  });

  it('does not count a date that exists but could not be read (reported by the dataset builder)', () => {
    const bad = { ...row({ line: 9 }), dateRaw: '32/13/99' };
    expect(only(checkRows(dataset([...rows(2, 5, { date: '2021-01-01' }), bad])), 'ROW-DATE-MISSING')).toEqual([]);
  });
});

describe('ROW-YEAR-OUTLIER', () => {
  const mixed = () => [...rows(2, 71, { lat: 1, lon: 2, date: '2021-07-01' }), ...rows(73, 6, { lat: 1, lon: 2, date: '2017-07-01' })];

  it('flags the 6 rows of 2017 when the file name says 2021 (underscores separate)', () => {
    const f = only(checkRows(dataset(mixed(), { file: 'x_survey_2021_v2.csv', label: 'x_survey_2021_v2.csv' })), 'ROW-YEAR-OUTLIER');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', lines: range(73, 78), params: { years: '2017', declared: '2021' } });
  });

  it('emits nothing when no year is declared anywhere', () => {
    expect(only(checkRows(dataset(mixed())), 'ROW-YEAR-OUTLIER')).toEqual([]);
  });

  it('treats the temporal extent as declaring every year it spans', () => {
    const ds = dataset(mixed(), { metadata: [record({ temporalExtent: { start: '2016-05-01', end: '2021-08-16' } })] });
    expect(only(checkRows(ds), 'ROW-YEAR-OUTLIER')).toEqual([]);
  });

  it('reads years from a metadata title and compacts the declared range', () => {
    const ds = dataset(mixed(), { label: 'data.csv', file: 'data.csv', metadata: [record({ title: 'Cruise 2019 to 2021', temporalExtent: { start: '2019-06-21', end: '2021-08-16' } })] });
    const f = only(checkRows(ds), 'ROW-YEAR-OUTLIER');
    expect(f[0].params).toMatchObject({ years: '2017', declared: '2019–2021' });
  });

  it('ignores digit runs that are not standalone four-digit years', () => {
    const ds = dataset(mixed(), { file: 'id120210.csv', label: 'id120210.csv' });
    expect(only(checkRows(ds), 'ROW-YEAR-OUTLIER')).toEqual([]);
  });

  it('a year token is not followed or preceded by a letter or digit: ctd_2000m.csv and data2021.csv declare nothing', () => {
    for (const file of ['ctd_2000m.csv', 'data2021.csv', 'v2021b.csv']) {
      expect(only(checkRows(dataset(mixed(), { file, label: file })), 'ROW-YEAR-OUTLIER'), file).toEqual([]);
    }
  });

  it('a year between punctuation still counts: cruise_2021.csv, 2021-data.csv, run (2021).csv', () => {
    for (const file of ['cruise_2021.csv', '2021-data.csv', 'run (2021).csv']) {
      const f = only(checkRows(dataset(mixed(), { file, label: file })), 'ROW-YEAR-OUTLIER');
      expect(f, file).toHaveLength(1);
      expect(f[0].params, file).toMatchObject({ years: '2017', declared: '2021' });
    }
  });
});

describe('ROW-UNIT-MISSING', () => {
  it('lists variables without a unit but exempts practical salinity and pH', () => {
    const ds = dataset([], {
      variables: [
        variable('Sal', { canonical: 'salinity' }),
        variable('pH', { canonical: 'pH' }),
        variable('Temp', { canonical: 'temperature' }),
        variable('Foo', { unit: 'mg/L' }),
        variable('X1'),
      ],
    });
    const f = only(checkRows(ds), 'ROW-UNIT-MISSING');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', params: { headers: 'Temp, X1' } });
    expect(f[0].field).toBeUndefined();
  });

  it('counts a unit that was only inferred from a P01 code as not stated, and strips the OPeNDAP type suffix', () => {
    const ds = dataset([], {
      variables: [
        variable('TCO2KG02<Float32>', { canonical: 'DIC', unit: 'µmol/kg', unitSource: 'p01' }),
        variable('PSALMV01<Float32>', { canonical: 'salinity', unit: 'dimensionless', unitSource: 'p01' }),
        variable('A', { unit: 'm', unitSource: 'header' }),
        variable('B', { unit: 'm', unitSource: 'metadata' }),
      ],
    });
    expect(only(checkRows(ds), 'ROW-UNIT-MISSING')[0].params.headers).toBe('TCO2KG02');
  });

  it('does not ask for a unit on a column declared as text', () => {
    const ds = dataset([], { variables: [variable('Activity<String>'), variable('Depth_m<Float32>')] });
    expect(only(checkRows(ds), 'ROW-UNIT-MISSING')[0].params.headers).toBe('Depth_m');
  });

  it('caps the list at 10 headers', () => {
    const ds = dataset([], { variables: Array.from({ length: 13 }, (_, i) => variable(`V${i + 1}`)) });
    expect(only(checkRows(ds), 'ROW-UNIT-MISSING')[0].params.headers).toBe('V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, …+3');
  });

  it('is silent when every variable has a unit or is exempt', () => {
    expect(only(checkRows(dataset([], { variables: [variable('Sal', { canonical: 'salinity' }), variable('A', { unit: 'm' })] })), 'ROW-UNIT-MISSING')).toEqual([]);
  });
});

describe('ROW-DEPTH-SIGN', () => {
  const mapping = [{ sheet: 'a.csv', columns: [{ index: 3, header: 'Depth', role: { kind: 'depth', positive: 'unknown' } as const }] }];

  it('emits info when the sign convention is unknown and depth values exist', () => {
    const ds = dataset([row({ line: 2, depth: 5 })], { depthPositive: 'unknown', mappings: mapping });
    const f = only(checkRows(ds), 'ROW-DEPTH-SIGN');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'info', params: { header: 'Depth' } });
  });

  it('is silent when the convention is stated or there are no depth values', () => {
    expect(only(checkRows(dataset([row({ line: 2, depth: 5 })], { depthPositive: 'down' })), 'ROW-DEPTH-SIGN')).toEqual([]);
    expect(only(checkRows(dataset([row({ line: 2 })], { depthPositive: 'unknown' })), 'ROW-DEPTH-SIGN')).toEqual([]);
  });
});

describe('rules owned by the dataset builder', () => {
  it('checkRows never emits them', () => {
    const own = ['ROW-DM-COORDS', 'ROW-LON-360', 'ROW-DATE-UNPARSEABLE', 'ROW-DATE-YYMMDD', 'ROW-TZ-UNKNOWN', 'ROW-NON-NUMERIC', 'ROW-NA-VARIANT', 'ROW-RAGGED'];
    const fs = checkRows(dataset([row({ line: 2, lat: 95, lon: 95, station: 'S', date: '2021-01-01' })]));
    expect(fs.filter((f) => own.includes(f.ruleId))).toEqual([]);
  });
});
