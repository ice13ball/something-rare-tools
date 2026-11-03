// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// /check keeps a real fraction of a second of an Excel date or time cell, to the millisecond, in the clean CSV; /convert's reading is not touched. Every file here is invented.
import { describe, expect, it } from 'vitest';
import { buildDataset } from '../../src/core/dataset';
import { toCleanCsv } from '../../src/core/output/csv';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import type { ParsedFile } from '../../src/core/types';
import { textFile, xlsxFile } from '../helpers/files';

const FMT = 'yyyy-mm-dd hh:mm:ss.000';
const dt = (serial: number, z = FMT) => ({ t: 'n' as const, v: serial, z });
const tm = (v: number) => ({ t: 'n' as const, v, z: 'hh:mm:ss.000' });
const T = 43983; // 2020-06-01
const at = (secs: number, base = T) => base + secs / 86400;

function dateOf(file: ParsedFile, header = 'date [ISO 8601]'): string[] {
  const layout = proposeLayout(file);
  const ds = buildDataset(file, layout, proposeMappings(file, layout), [], 'd').dataset;
  const out = textFile('o.csv', toCleanCsv(ds).csv).sheets[0];
  const at = out.header.indexOf(header);
  expect(at).toBeGreaterThan(-1);
  return out.rows.map((r) => String(r.cells[at] ?? ''));
}
const wide = (cells: object[], extra?: object) => xlsxFile('w.xlsx', { S: [['Station', 'Latitude', 'Longitude', 'Date', 'Temp [°C]'], ...cells.map((c, i) => ['S1', 49.4, 0.2 + i / 100, c, 10 + i])] as never }, extra as never);
const long = (cells: object[], extra?: object) => xlsxFile('l.xlsx', { S: [['Station', 'Latitude', 'Longitude', 'Date', 'Parameter', 'Value'], ...cells.flatMap((c, i) => ['Corg', 'Ntot'].map((p) => ['S1', 49.4, 0.2 + i / 100, c, p, i + 1]))] as never }, extra as never);

describe.each([['wide', wide], ['long', long]] as const)('a %s sheet', (_name, make) => {
  it('keeps .250 and .750; a real 12:00:01 and a whole-second time stay as they were', () => {
    const got = dateOf(make([dt(at(43200.25)), dt(at(43200.75)), dt(at(43201)), dt(at(43200)), dt(at(43200) + 1e-10)]));
    expect(got).toEqual(['2020-06-01T12:00:00.250', '2020-06-01T12:00:00.750', '2020-06-01T12:00:01', '2020-06-01T12:00', '2020-06-01T12:00']);
  });
  it('00:00:00.250 is not a date-only value, midnight is; 23:59:59.9996 is the next day', () => {
    const got = dateOf(make([dt(at(0.25)), dt(T), dt(at(86399.9996))]));
    expect(got).toEqual(['2020-06-01T00:00:00.250', '2020-06-01', '2020-06-02']);
  });
  it('a 1904 workbook is read the same', () => {
    const got = dateOf(make([dt(at(43200.25, T - 1462))], { Workbook: { WBProps: { date1904: true } } }));
    expect(got[0]).toBe('2020-06-01T12:00:00.250');
  });
});

describe('a date column beside a time column', () => {
  it('a time cell with a fraction is joined to the date with it', () => {
    const file = xlsxFile('t.xlsx', { S: [['Station', 'Latitude', 'Longitude', 'Date', 'Time', 'Temp [°C]'], ['S1', 49.4, 0.2, { t: 'n', v: T, z: 'yyyy-mm-dd' }, tm(0.5 + 0.25 / 86400), 11], ['S1', 49.4, 0.3, { t: 'n', v: T, z: 'yyyy-mm-dd' }, tm(0.5), 12]] as never });
    expect(dateOf(file)).toEqual(['2020-06-01T12:00:00.250', '2020-06-01T12:00']);
  });
});

describe('a text date with a fraction and no zone is kept as before', () => {
  it('a CSV with 12:00:00.250 and 12:00:00.250Z', () => {
    const file = textFile('s.csv', ['Station,Latitude,Longitude,Date,Temp [°C]', 'S1,49.4,0.2,2021-06-01T12:00:00.250,11', 'S1,49.4,0.3,2021-06-01T12:00:00.250Z,12'].join('\n'));
    expect(dateOf(file)).toEqual(['2021-06-01T12:00:00.250', '2021-06-01T12:00:00.250Z']);
  });
});

describe('a column whose format does not show the fraction', () => {
  const PLAIN = 'yyyy-mm-dd hh:mm:ss';
  it('a real .250 and .750 stay; .002, a rounded serial and 1/3 are whole seconds', () => {
    const got = dateOf(wide([dt(at(43200.25), PLAIN), dt(at(43200.75), PLAIN), dt(at(43200.002), PLAIN), dt(43983.33333, PLAIN), dt(T + 1 / 3, PLAIN)]));
    expect(got).toEqual(['2020-06-01T12:00:00.250', '2020-06-01T12:00:00.750', '2020-06-01T12:00', '2020-06-01T08:00', '2020-06-01T08:00']);
  });
  it('a fill-down of =A+1/1440 over 6000 rows comes out as whole minutes, as before', () => {
    const cells: object[] = [];
    let v = 43983.25;
    for (let i = 0; i < 6000; i++) { v += 1 / 1440; cells.push(dt(v, 'yyyy-mm-dd hh:mm')); }
    expect(dateOf(wide(cells)).every((x) => /^20\d\d-\d\d-\d\d(T\d\d:\d\d)?$/.test(x))).toBe(true);
  });
  it('the sheet flag fractionShown is set by a format with ss.0 only', () => {
    expect(wide([dt(at(1), FMT)]).sheets[0].fractionShown).toEqual([false, false, false, true, false]);
    expect(wide([dt(at(1), PLAIN)]).sheets[0].fractionShown).toBeUndefined();
  });
});
