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
  it('a real .250 and .750 stay; a rounded serial and 1/3 are whole seconds (in a column of their own)', () => {
    expect(dateOf(wide([dt(at(43200.25), PLAIN), dt(at(43200.75), PLAIN)]))).toEqual(['2020-06-01T12:00:00.250', '2020-06-01T12:00:00.750']);
    expect(dateOf(wide([dt(43983.33333, PLAIN), dt(T + 1 / 3, PLAIN)]))).toEqual(['2020-06-01T08:00', '2020-06-01T08:00']);
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

describe('one column, consistently: the evidence of the whole column decides', () => {
  const PLAIN = 'yyyy-mm-dd hh:mm:ss';
  /** A serial as Excel stores it: 15 significant digits. */
  const xl = (secs: number, base = T) => Number((base + secs / 86400).toPrecision(15));
  const HM = (h: number, m: number, sec: number) => h * 3600 + m * 60 + sec;
  function notesOf(file: ParsedFile): string[] {
    const layout = proposeLayout(file);
    const ds = buildDataset(file, layout, proposeMappings(file, layout), [], 'd').dataset;
    return textFile('o.csv', toCleanCsv(ds).sidecar).sheets[0].rows.map((r) => r.cells.map((c) => String(c ?? ''))).filter((r) => r[0] === '(note)').map((r) => r[1]);
  }
  const ROUNDED = /^date cells rounded to the second/;

  it('.864, .972 and a .108 among other real milliseconds in one plain-format column are all kept (those three are 108 ms multiples or not; the column decides), no cell counted as rounded', () => {
    const secs = [HM(12, 8, 0.864), HM(12, 9, 0.972), HM(12, 0, 0.108), HM(12, 20, 0.731), HM(12, 21, 0.417)];
    const file = wide(secs.map((x) => dt(xl(x), PLAIN)));
    expect(dateOf(file)).toEqual(['2020-06-01T12:08:00.864', '2020-06-01T12:09:00.972', '2020-06-01T12:00:00.108', '2020-06-01T12:20:00.731', '2020-06-01T12:21:00.417']);
    expect(notesOf(file).filter((n) => ROUNDED.test(n))).toEqual([]);
  });

  it('the same cells in a column where most are 108 ms multiples are not evidence: the column is not shown', () => {
    const file = wide([HM(12, 8, 0.864), HM(12, 9, 0.972), HM(12, 0, 0.108)].map((x) => dt(xl(x), PLAIN)));
    expect(dateOf(file)).toEqual(['2020-06-01T12:08:00.864', '2020-06-01T12:09:01', '2020-06-01T12:00']);
  });

  it('.108, .216, .002 and .250 in one column: only .250 qualifies, the column is not shown, three cells are counted up to 216 ms', () => {
    const file = wide([dt(xl(HM(12, 0, 0.108)), PLAIN), dt(xl(HM(12, 0, 0.216)), PLAIN), dt(xl(HM(12, 0, 0.002)), PLAIN), dt(xl(HM(12, 0, 0.25)), PLAIN)]);
    expect(dateOf(file)).toEqual(['2020-06-01T12:00', '2020-06-01T12:00', '2020-06-01T12:00', '2020-06-01T12:00:00.250']);
    expect(notesOf(file).filter((n) => ROUNDED.test(n))).toEqual(['date cells rounded to the second: Date (3 cells, up to 216 ms)']);
  });

  it('a file of whole seconds gets no note; a rounded serial and a long fill-down get one and keep their CSV', () => {
    expect(notesOf(wide([dt(xl(43200), PLAIN), dt(xl(43260), PLAIN)])).filter((n) => ROUNDED.test(n))).toEqual([]);
    const rounded = wide([dt(43983.33333, PLAIN), dt(43983.5, PLAIN)]);
    expect(dateOf(rounded)).toEqual(['2020-06-01T08:00', '2020-06-01T12:00']);
    expect(notesOf(rounded).filter((n) => ROUNDED.test(n))).toEqual(['date cells rounded to the second: Date (1 cell, up to 288 ms)']);
    const cells: object[] = [];
    let v = 43983.25;
    for (let i = 0; i < 6000; i++) { v += 1 / 1440; cells.push(dt(v, 'yyyy-mm-dd hh:mm')); }
    const drift = wide(cells);
    const notes = notesOf(drift).filter((n) => ROUNDED.test(n));
    expect(dateOf(drift).every((x) => /^20\d\d-\d\d-\d\d(T\d\d:\d\d)?$/.test(x))).toBe(true);
    expect(notes.length === 0 || /up to [0-4] ms\)$/.test(notes[0])).toBe(true);
  });

  it('a 1904 workbook, a time column beside a date, and a long sheet read the same way', () => {
    const S5 = [HM(12, 8, 0.864), HM(12, 9, 0.972), HM(12, 0, 0.108), HM(12, 20, 0.731), HM(12, 21, 0.417)];
    const E5 = ['2020-06-01T12:08:00.864', '2020-06-01T12:09:00.972', '2020-06-01T12:00:00.108', '2020-06-01T12:20:00.731', '2020-06-01T12:21:00.417'];
    const f1904 = wide(S5.map((x) => dt(xl(x, T - 1462), PLAIN)), { Workbook: { WBProps: { date1904: true } } });
    expect(dateOf(f1904)).toEqual(E5);
    const timed = xlsxFile('t.xlsx', { S: [['Station', 'Latitude', 'Longitude', 'Date', 'Time', 'Temp [°C]'], ...S5.map((secs, i) => ['S1', 49.4, 0.2 + i / 100, { t: 'n', v: T, z: 'yyyy-mm-dd' }, { t: 'n', v: Number((secs / 86400).toPrecision(15)), z: 'hh:mm:ss' }, 11 + i])] as never });
    expect(dateOf(timed)).toEqual(E5);
    expect(dateOf(long(S5.map((x) => dt(xl(x), PLAIN))))).toEqual(E5);
  });
});
