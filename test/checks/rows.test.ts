// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { checkRows } from '../../src/core/checks/rows';
import { renderPlain } from '../../src/core/report';
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

  const eqIds = (fs: Finding[]) => fs.filter((f) => f.ruleId.startsWith('ROW-LAT-EQ-LON')).map((f) => [f.ruleId, f.severity, f.lines]);

  it('a one-row file at 10 / 10 is a note, not an error', () => {
    expect(eqIds(checkRows(dataset([row({ line: 2, lat: 10, lon: 10 })])))).toEqual([['ROW-LAT-EQ-LON-COARSE', 'info', [2]]]);
  });

  it('3 isolated -65 / -65 rows among 100 are a note (whole degrees), not an error', () => {
    const ds = dataset([...rows(2, 97, { lat: 54.1, lon: 10.2 }), row({ line: 99, lat: -65, lon: -65 }), row({ line: 100, lat: -65, lon: -65 }), row({ line: 101, lat: -65, lon: -65 })]);
    expect(eqIds(checkRows(ds))).toEqual([['ROW-LAT-EQ-LON-COARSE', 'info', [99, 100, 101]]]);
  });

  it('isolated rows with a finer value are a warning; whole and half degrees stay a note in the same file', () => {
    const ds = dataset([...rows(2, 20, { lat: 54.1, lon: 10.2 }), row({ line: 30, lat: 12.34, lon: 12.34 }), row({ line: 31, lat: -65.5, lon: -65.5 })]);
    expect(eqIds(checkRows(ds))).toEqual([['ROW-LAT-EQ-LON-ISOLATED', 'warning', [30]], ['ROW-LAT-EQ-LON-COARSE', 'info', [31]]]);
  });

  it('30 of 100 rows with lat == lon is the error, with all 30 lines', () => {
    const ds = dataset([...rows(2, 70, { lat: 54.1, lon: 10.2 }), ...rows(72, 30, { lat: -65, lon: -65 })]);
    const f = checkRows(ds).filter((x) => x.ruleId.startsWith('ROW-LAT-EQ-LON'));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ ruleId: 'ROW-LAT-EQ-LON', severity: 'error', lines: range(72, 101) });
  });

  it('4 of 4 rows is not the error (fewer than 5 rows); 5 of 5 is', () => {
    expect(eqIds(checkRows(dataset(rows(2, 4, { lat: 33.3, lon: 33.3 }))))).toEqual([['ROW-LAT-EQ-LON-ISOLATED', 'warning', [2, 3, 4, 5]]]);
    expect(eqIds(checkRows(dataset(rows(2, 5, { lat: 33.3, lon: 33.3 }))))[0]).toEqual(['ROW-LAT-EQ-LON', 'error', range(2, 6)]);
  });

  it('a copied column confined to one station (27 rows of 41.376 among 400) is the error, worded as a repeated value', () => {
    const ds = dataset([...rows(2, 373, { lat: 54.1, lon: 10.2 }), ...rows(400, 27, { lat: 41.376, lon: 41.376 })]);
    const f = checkRows(ds).filter((x) => x.ruleId.startsWith('ROW-LAT-EQ-LON'));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ ruleId: 'ROW-LAT-EQ-LON', severity: 'error', params: { repeated: 27 } });
    expect(renderPlain(f[0], 'en')).toContain('repeats in 27 rows');
    expect(renderPlain(f[0], 'en')).not.toContain('a fifth');
  });

  it('the repeated-value path needs two written decimals and a value that is not a quarter degree', () => {
    for (const [v, dec] of [[76.9, 1], [76.25, 2], [76.5, 1], [-65, 0]] as const) {
      const ds = dataset([...rows(2, 95, { lat: 54.1, lon: 10.2 }), ...rows(97, 6, { lat: v, lon: v, latDecimals: dec, lonDecimals: dec })]);
      expect(eqIds(checkRows(ds)).map((x) => x[1]), String(v)).not.toContain('error');
    }
  });

  it('the share path words the error with the fifth, in four languages', () => {
    const f = checkRows(dataset([...rows(2, 6, { lat: 54.1, lon: 10.2 }), ...rows(8, 6, { lat: 33.3, lon: 33.3 })])).find((x) => x.ruleId === 'ROW-LAT-EQ-LON')!;
    expect(f.params).toEqual({ share: 'yes' });
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) expect(renderPlain(f, lang).length).toBeGreaterThan(60);
  });

  it('5 equal rows among 100 are under a fifth: not the error', () => {
    const ds = dataset([...rows(2, 95, { lat: 54.1, lon: 10.2 }), ...rows(97, 5, { lat: 33.3, lon: 33.3 })]);
    expect(eqIds(checkRows(ds)).map((x) => x[0])).toEqual(['ROW-LAT-EQ-LON-ISOLATED']);
    // 5 rows of 33.3 repeat one value with two or more decimals only when they have them: 33.3 has one
  });

  it('3 isolated non-coarse rows among 100 are a warning', () => {
    const ds = dataset([...rows(2, 97, { lat: 54.1, lon: 10.2 }), ...rows(99, 3, { lat: 41.37, lon: 41.37 })]);
    expect(eqIds(checkRows(ds))).toEqual([['ROW-LAT-EQ-LON-ISOLATED', 'warning', [99, 100, 101]]]);
  });

  it('does not fire when only one coordinate is present or they differ', () => {
    const fs = checkRows(dataset([row({ line: 2, lat: 5 }), row({ line: 3, lon: 5 }), row({ line: 4, lat: 5, lon: 5.1 })]));
    expect(only(fs, 'ROW-LAT-EQ-LON')).toEqual([]);
  });
});

describe('ROW-STATION-MOVED', () => {
  const moved = () =>
    dataset([
      ...rows(2, 9, { lat: 77.0, latDecimals: 1, lon: 15.52, station: 'ST5', date: '2021-08-24' }),
      ...rows(11, 14, { lat: 77.0, latDecimals: 1, lon: 16.52, station: 'ST5', date: '2021-08-25' }),
    ]);

  it('flags a typed digit (lon 15.52 vs 16.52) with the minority rows and a positions text', () => {
    const f = only(checkRows(moved()), 'ROW-STATION-MOVED');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', value: 'ST5', lines: range(2, 10) });
    expect(f[0].params.station).toBe('ST5');
    expect(f[0].params.positions).toBe('15.52 E, 77.0 N (9 rows, 2021-08-24); 16.52 E, 77.0 N (14 rows, 2021-08-25)');
  });

  it('flags a typed digit even when the other axis was re-measured at different decimals (54.3215 vs 54.321111)', () => {
    const ds = dataset([
      ...rows(2, 9, { lat: 54.321111, lon: 12.345, date: '2021-05-01', station: 'ST5' }),
      ...rows(11, 14, { lat: 54.3215, lon: 13.345, date: '2021-05-01', station: 'ST5' }),
    ]);
    const f = only(checkRows(ds), 'ROW-STATION-MOVED');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual(range(2, 10));
  });

  it('flags latitude and longitude exchanged between two positions', () => {
    const ds = dataset([...rows(2, 3, { lat: 54.25, lon: 10.75, date: '2021-05-01', station: 'ST1' }), ...rows(5, 8, { lat: 10.75, lon: 54.25, date: '2021-05-01', station: 'ST1' })]);
    const f = only(checkRows(ds), 'ROW-STATION-MOVED');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual(range(2, 4));
  });

  it('is silent for a tiny shift that is neither a digit nor a swap (15.5000 vs 15.5003)', () => {
    const ds = dataset([...rows(2, 4, { lat: 77.0, lon: 15.5, latDecimals: 4, lonDecimals: 4, date: '2021-05-01', station: 'ST5' }), ...rows(6, 4, { lat: 77.0, lon: 15.5003, date: '2021-05-01', station: 'ST5' })]);
    expect(only(checkRows(ds), 'ROW-STATION-MOVED')).toEqual([]);
  });

  it('is silent for a distance that is not a whole number of degrees (no distance threshold exists)', () => {
    const ds = dataset([...rows(2, 4, { lat: 77.0, lon: 15.5, date: '2021-05-01', station: 'ST5' }), ...rows(6, 4, { lat: 77.0, lon: 16.0, date: '2021-05-01', station: 'ST5' })]);
    expect(only(checkRows(ds), 'ROW-STATION-MOVED')).toEqual([]);
  });

  it('compares at the coarser precision: 15.5 and 15.53 are one position', () => {
    const ds = dataset([...rows(2, 4, { lat: 77.0, lon: 15.5, date: '2021-05-01', station: 'ST5' }), ...rows(6, 4, { lat: 77.0, lon: 15.53, date: '2021-05-01', station: 'ST5' })]);
    expect(only(checkRows(ds), 'ROW-STATION-MOVED')).toEqual([]);
  });

  it('ignores rows without a station and positions that agree', () => {
    const ds = dataset([...rows(2, 4, { lat: 77.0, lon: 15.5 }), ...rows(6, 4, { lat: 77.0, lon: 16.5 }), ...rows(10, 3, { lat: 1, lon: 2, date: '2021-05-01', station: 'ST1' })]);
    expect(only(checkRows(ds), 'ROW-STATION-MOVED')).toEqual([]);
  });

  it('does not duplicate ROW-LAT-EQ-LON: a position with lat === lon is left to that rule', () => {
    const ds = dataset([...rows(2, 5, { lat: 54.987, lon: 54.987, date: '2021-05-01', station: 'ST4' }), ...rows(7, 6, { lat: 54.987, lon: 12.987, date: '2021-05-01', station: 'ST4' })]);
    const fs = checkRows(ds);
    expect(only(fs, 'ROW-STATION-MOVED')).toEqual([]);
    expect(only(fs, 'ROW-LAT-EQ-LON')).toHaveLength(1);
  });

  it('lists at most 3 dates per position', () => {
    const a = ['2021-01-01', '2021-01-02', '2021-01-03', '2021-01-04'].flatMap((d, i) => rows(2 + i, 1, { lat: 77.0, lon: 15.52, station: 'ST5', date: d }));
    const ds = dataset([...a, ...rows(10, 9, { lat: 77.0, lon: 16.52, station: 'ST5', date: '2021-01-02' })]);
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

describe('ROW-YEAR-OUTLIER: a year range names every year in it', () => {
  const inside = () => [...rows(2, 20, { lat: 1, lon: 2, date: '1995-07-01' }), ...rows(22, 20, { lat: 1, lon: 2, date: '2008-07-01' }), ...rows(42, 20, { lat: 1, lon: 2, date: '2019-07-01' })];
  const fires = (file: string, label = file, data = inside()) => only(checkRows(dataset(data, { file, label })), 'ROW-YEAR-OUTLIER');

  const files = [
    'Survey_in_the_period_1994-2019.xlsx',
    'data_1994-2019.csv',
    'data_1994\u20132019.csv',
    'data_1994\u20142019.csv',
    'data 1994 - 2019.csv',
    'data_1994_to_2019.csv',
    'from 1994 to 2019.csv',
    'data_1994/2019.csv',
    'in_the_period_1994_2019.csv',
    'between_1994_and_2019.csv',
  ];
  it.each(files)('file name %s covers 1995, 2008 and 2019', (file) => {
    expect(fires(file)).toEqual([]);
  });

  const titles = ['Survey in the period 1994-2019', 'Survey 1994\u20132019', 'Survey 1994\u20142019', 'Survey 1994 to 2019', 'Survey from 1994 to 2019', 'Survey 1994/2019'];
  it.each(titles)('title "%s" covers every year in between', (title) => {
    const ds = dataset(inside(), { file: 'data.csv', label: 'data.csv', metadata: [record({ title })] });
    expect(only(checkRows(ds), 'ROW-YEAR-OUTLIER')).toEqual([]);
  });

  it('rows outside the range still fire (2021 for 1994-2019), and the declared years are compacted', () => {
    const f = fires('Survey_1994-2019.xlsx', undefined, [...inside(), ...rows(62, 3, { lat: 1, lon: 2, date: '2021-07-01' })]);
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ years: '2021', declared: '1994\u20132019' });
    expect(f[0].lines).toEqual(range(62, 64));
  });

  it('one year in the title (2019) and rows in 2015 still fire', () => {
    const data = [...rows(2, 40, { lat: 1, lon: 2, date: '2019-07-01' }), ...rows(42, 5, { lat: 1, lon: 2, date: '2015-07-01' })];
    const ds = dataset(data, { file: 'data.csv', label: 'data.csv', metadata: [record({ title: 'Cruise 2019' })] });
    const f = only(checkRows(ds), 'ROW-YEAR-OUTLIER');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ years: '2015', declared: '2019' });
  });

  it('two years joined only by an underscore in a file name are two years, not a range', () => {
    const f = fires('cruise_2015_2019.csv', undefined, rows(2, 10, { lat: 1, lon: 2, date: '2017-07-01' }));
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ years: '2017', declared: '2015, 2019' });
  });

  it('a year-month (2019-08) names the year 2019 only, never a range', () => {
    const f = fires('data_2019-08.csv', undefined, rows(2, 10, { lat: 1, lon: 2, date: '2015-07-01' }));
    expect(f[0].params).toMatchObject({ years: '2015', declared: '2019' });
    expect(fires('data_2019-08-15.csv', undefined, rows(2, 10, { lat: 1, lon: 2, date: '2015-07-01' }))[0].params).toMatchObject({ declared: '2019' });
  });

  it('a two-digit end is a range only when it cannot be a month: 1994-95 spans two years, 2011-12 names 2011', () => {
    const r1995 = rows(2, 10, { lat: 1, lon: 2, date: '1995-03-01' });
    expect(fires('survey_1994-95.csv', undefined, r1995)).toEqual([]);
    const r2012 = rows(2, 10, { lat: 1, lon: 2, date: '2012-03-01' });
    expect(fires('survey_2011-12.csv', undefined, r2012)[0].params).toMatchObject({ years: '2012', declared: '2011' });
  });

  it('a cue word is a whole word: Station_code_, episode_, Method_ and Prod_ before two years are no cue (the rows of 2017 still fire)', () => {
    for (const file of ['Station_code_2015_2019.csv', 'episode_2015_2019.csv', 'Method_2015_2019.csv', 'Prod_2015_2019.csv', 'Fromage_2015_2019.csv', 'Period2_2015_2019.csv']) {
      const f = fires(file, undefined, rows(2, 10, { lat: 1, lon: 2, date: '2017-07-01' }));
      expect(f, file).toHaveLength(1);
      expect(f[0].params, file).toMatchObject({ years: '2017', declared: '2015, 2019' });
    }
  });

  it('two years joined by "and" after "years" or "lata" are two years, not a range; after "between" they are a range', () => {
    const data = rows(2, 10, { lat: 1, lon: 2, date: '2017-07-01' });
    expect(fires('in_the_years_2015_and_2019.csv', undefined, data)[0].params).toMatchObject({ declared: '2015, 2019' });
    expect(fires('w_latach_2015_i_2019.csv', undefined, data)[0].params).toMatchObject({ declared: '2015, 2019' });
    expect(fires('between_2015_and_2019.csv', undefined, data)).toEqual([]);
    expect(fires('zwischen_2015_und_2019.csv', undefined, data)).toEqual([]);
  });

  it('a number range followed by a unit is not a range of years (CTD casts 1950-2000 m)', () => {
    const data = rows(2, 10, { lat: 1, lon: 2, date: '1975-07-01' });
    for (const label of ['CTD casts 1950-2000 m', 'CTD casts 1950-2000 dbar', 'levels 1950-2000 m']) {
      const ds = dataset(data, { file: 'data.csv', label: 'data.csv', metadata: [record({ title: label })] });
      const f = only(checkRows(ds), 'ROW-YEAR-OUTLIER');
      expect(f, label).toHaveLength(1);
      expect(f[0].params, label).toMatchObject({ declared: '1950, 2000' });
    }
  });

  it('the unit after a range is tested case-sensitively, and "db" is not one: "M/V" and "db export" after a range of years leave it a range', () => {
    const data = rows(2, 10, { lat: 1, lon: 2, date: '2000-07-01' });
    for (const title of ['Survey from 1994 to 2019 M/V Polarstern', 'Samples 1994-2019 db export', 'Survey between 1994 and 2019 Mm', 'Survey 1994-2019 Km']) {
      const ds = dataset(data, { file: 'data.csv', label: 'data.csv', metadata: [record({ title })] });
      expect(only(checkRows(ds), 'ROW-YEAR-OUTLIER'), title).toEqual([]);
    }
    // a lower-case unit still makes it a number range
    for (const title of ['CTD casts from 1950 to 2000 m', 'levels between 1950 and 2000 dbar']) {
      const ds = dataset(rows(2, 10, { lat: 1, lon: 2, date: '1975-07-01' }), { file: 'data.csv', label: 'data.csv', metadata: [record({ title })] });
      expect(only(checkRows(ds), 'ROW-YEAR-OUTLIER'), title).toHaveLength(1);
    }
  });

  it('a season written 2019/20 is 2019 and 2020 (the same two-digit rule as 1994-95); 2019/08 is not', () => {
    expect(fires('season_2019_20.csv', undefined, rows(2, 10, { lat: 1, lon: 2, date: '2020-03-01' }))[0].params).toMatchObject({ declared: '2019' });
    expect(fires('season_2019-20.csv', undefined, rows(2, 10, { lat: 1, lon: 2, date: '2020-03-01' }))).toEqual([]);
    const ds = dataset(rows(2, 10, { lat: 1, lon: 2, date: '2020-03-01' }), { file: 'data.csv', label: 'data.csv', metadata: [record({ title: 'Winter 2019/20' })] });
    expect(only(checkRows(ds), 'ROW-YEAR-OUTLIER')).toEqual([]);
    const m = dataset(rows(2, 10, { lat: 1, lon: 2, date: '2015-03-01' }), { file: 'data.csv', label: 'data.csv', metadata: [record({ title: 'Cruise 2019/08' })] });
    expect(only(checkRows(m), 'ROW-YEAR-OUTLIER')[0].params).toMatchObject({ declared: '2019' });
  });

  it('a descending pair is not a range', () => {
    const f = fires('data_2019-1994.csv', undefined, rows(2, 10, { lat: 1, lon: 2, date: '2008-03-01' }));
    expect(f[0].params).toMatchObject({ declared: '1994, 2019' });
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

describe('ROW-UNIT-MISSING and the spread of a dimensionless variable', () => {
  it('"Salinity st.dev." asks for no unit (like Salinity); "Density st.dev." and "Foo sd" do', () => {
    const ds = dataset([], { variables: [variable('Salinity st.dev.'), variable('Salinity mean', { canonical: 'salinity' }), variable('Density st.dev.'), variable('Foo sd')] });
    expect(only(checkRows(ds), 'ROW-UNIT-MISSING')[0].params.headers).toBe('Density st.dev., Foo sd');
  });
});
