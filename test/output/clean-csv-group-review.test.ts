// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Group review of the clean CSV: a column some cells of which gave a value is "only partly in this file", not "not in this file"; one bad cell does not add a raw column to an ordinary long sheet; header
// names are unique whatever their case; the Excel date and time cells of a key column are written as the date and the time. Every file here is invented.
import { describe, expect, it } from 'vitest';
import { buildDataset } from '../../src/core/dataset';
import { toCleanCsv } from '../../src/core/output/csv';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import type { ColumnRole, ParsedFile, SheetMapping } from '../../src/core/types';
import { dateCell, textFile, xlsxFile } from '../helpers/files';

function build(file: ParsedFile, edit?: (m: SheetMapping[]) => void) {
  const layout = proposeLayout(file);
  const mappings = proposeMappings(file, layout);
  edit?.(mappings);
  return buildDataset(file, layout, mappings, [], 'd').dataset;
}
const csv = (text: string, edit?: (m: SheetMapping[]) => void) => toCleanCsv(build(textFile('s.csv', text), edit));
function parse(text: string): { header: string[]; rows: string[][] } {
  const sheet = textFile('out.csv', text).sheets[0];
  return { header: sheet.header, rows: sheet.rows.map((r) => r.cells.map((c) => String(c ?? ''))) };
}
const notes = (sidecar: string): string[] => parse(sidecar).rows.filter((r) => r[0] === '(note)').map((r) => r[1]);

describe('partly in the file is not "not in the file"', () => {
  const wide = ['Station,Latitude,Longitude,Date,Depth [m],Temp [°C]', 'S1,49.4,0.2,2020-06-01,5,11.2', 'S2,abc,0.3,spring,~7,10.4', 'S3,49.6,0.4,2020-06-03,9,10.1', 'S4,49.7,0.5,2020-06-04,10,10.0'].join('\n');

  it('a wide sheet with one bad date, one bad latitude and one bad depth: the CSV is as before, the note says partly with counts and never "not in this file"', () => {
    const out = csv(wide);
    const { header, rows } = parse(out.csv);
    expect(header).toEqual(['station', 'date [ISO 8601]', 'latitude [degrees_north]', 'longitude [degrees_east]', 'depth [m]', 'Temp [°C]']);
    expect(rows[1]).toEqual(['S2', '', '', '0.3', '', '10.4']);
    const n = notes(out.sidecar);
    expect(n.filter((x) => x.includes('not in this file'))).toEqual([]);
    expect(n).toContain('source columns only partly in this file: Latitude (3 of 4 cells) | Date (3 of 4 cells) | Depth [m] (3 of 4 cells)');
    // the sidecar's own rows still map these columns
    const mapped = parse(out.sidecar).rows.filter((r) => r[0] !== '(note)').map((r) => r[0]);
    expect(mapped).toEqual(expect.arrayContaining(['Date', 'Latitude', 'Depth [m]']));
  });

  it('a column no cell of which was used is still "not in this file"', () => {
    const t = ['Station,Latitude,Longitude,Date,Temp [°C],Comment', 'S1,49.4,0.2,2020-06-01,11.2,ok'].join('\n');
    expect(notes(csv(t).sidecar)).toEqual(['source columns that are not in this file: Comment']);
  });
});

describe('one bad cell does not change the shape of an ordinary long sheet', () => {
  const longText = (date: (s: number) => string, lat: (s: number) => string, depth: (s: number) => string): string => {
    const lines = ['Station,Latitude,Longitude,Date,Depth [m],Parameter,Value'];
    for (let s = 1; s <= 4; s++) for (const p of ['Corg', 'Ntot', 'Ptot']) lines.push(`S${s},${lat(s)},0.2,${date(s)},${depth(s)},${p},${s}.${p.length}`);
    return lines.join('\n');
  };

  it('a date that reads spring once, a bad latitude and a bad depth add no column; the sheet is written as before', () => {
    const good = parse(csv(longText((s) => `2020-06-0${s}`, () => '49.4', (s) => String(s * 5))).csv);
    const bad = csv(longText((s) => (s === 2 ? 'spring' : `2020-06-0${s}`), (s) => (s === 3 ? 'abc' : '49.4'), (s) => (s === 4 ? '~7' : String(s * 5))));
    const out = parse(bad.csv);
    expect(out.header).toEqual(good.header);
    expect(out.header.filter((h) => /^(date|latitude|depth)/i.test(h))).toEqual(['date [ISO 8601]', 'latitude [degrees_north]', 'depth [m]']);
    expect(out.rows).toHaveLength(good.rows.length);
    const n = notes(bad.sidecar).join('|');
    expect(n).toMatch(/only partly in this file: .*Date \(3 of 4 cells\)/);
    expect(n).toMatch(/Latitude \(3 of 4 cells\)/);
    expect(n).not.toContain('not in this file');
  });

  it('but when the unread cells leave two output rows otherwise identical, the column is written', () => {
    const lines = ['Station,Latitude,Longitude,Date,Parameter,Value'];
    for (const d of ['2020-06-01', 'spring', 'summer']) for (const p of ['Corg', 'Ntot']) lines.push(`S1,49.4,0.2,${d},${p},${d.length}.${p.length}`);
    const { header, rows } = parse(csv(lines.join('\n')).csv);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r[header.indexOf('Date')])).toEqual(['2020-06-01', 'spring', 'summer']);
  });
});

describe('header names are unique whatever their case', () => {
  it('a variable called DEPTH beside the depth column is Depth_2, never a second Depth', () => {
    const t = ['Station,Latitude,Longitude,Date,Depth,DEPTH,Temp [°C]', 'S1,49.4,0.2,2020-06-01,5,6,11.2', 'S2,49.5,0.3,2020-06-02,7,8,10.4'].join('\n');
    const out = csv(t, (m) => {
      for (const c of m[0].columns) if (c.header === 'DEPTH') c.role = { kind: 'variable', variable: 'DEPTH' } as ColumnRole;
    });
    const { header } = parse(out.csv);
    expect(header.map((h) => h.toLowerCase()).length).toBe(new Set(header.map((h) => h.toLowerCase())).size);
    expect(header).toContain('DEPTH_2');
  });
});

describe('Excel date and time cells of a key column are written as the date and the time', () => {
  const timeCell = (v: number) => ({ t: 'n' as const, v, z: 'hh:mm' });
  const longTime = (): ParsedFile => {
    const rows: (string | number | object)[][] = [['Station', 'Latitude', 'Longitude', 'Time', 'Parameter', 'Value']];
    for (const s of ['S1', 'S2']) for (const t of [0.5, 0.75]) for (const p of ['Corg', 'Ntot', 'Ptot']) rows.push([s, 49.4, 0.2, timeCell(t), p, t * 10 + p.length]);
    return xlsxFile('b.xlsx', { S: rows as never });
  };

  it('hh:mm Time on a long sheet with no date is 12:00 and 18:00, not 0.5 and 0.75', () => {
    const { header, rows } = parse(toCleanCsv(build(longTime())).csv);
    expect(rows.map((r) => r[header.indexOf('Time')])).toEqual(['12:00', '18:00', '12:00', '18:00']);
  });

  const longDate = (date1904: boolean, serial: (n: number) => number): ParsedFile => {
    const rows: (string | number | object)[][] = [['Station', 'Latitude', 'Longitude', 'Date', 'Sampling date 2', 'Parameter', 'Value']];
    for (const s of ['S1', 'S2']) for (const k of [0, 1]) for (const p of ['Corg', 'Ntot', 'Ptot']) rows.push([s, 49.4, 0.2, dateCell(serial(0)), dateCell(serial(k * 6)), p, k + p.length / 10]);
    return xlsxFile('b.xlsx', { S: rows as never }, date1904 ? ({ Workbook: { WBProps: { date1904: true } } } as never) : undefined);
  };

  it('yyyy-mm-dd Sampling date 2 that extends the key is the date, not 43900', () => {
    const { header, rows } = parse(toCleanCsv(build(longDate(false, (n) => 43894 + n))).csv);
    const at = header.findIndex((h) => /sampling date 2/i.test(h));
    expect(at).toBeGreaterThan(-1);
    expect(rows.map((r) => r[at])).toEqual(['2020-03-04', '2020-03-10', '2020-03-04', '2020-03-10']);
  });

  it('in a 1904 workbook the same dates come out the same', () => {
    const { header, rows } = parse(toCleanCsv(build(longDate(true, (n) => 42432 + n))).csv);
    const at = header.findIndex((h) => /sampling date 2/i.test(h));
    expect(rows.map((r) => r[at])).toEqual(['2020-03-04', '2020-03-10', '2020-03-04', '2020-03-10']);
  });
});
