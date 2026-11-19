// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A number without a date format in a workbook date column is no Excel serial: it is an unreadable date on its line. Every value is invented.
import { describe, expect, it } from 'vitest';
import { buildDataset } from '../../src/core/dataset';
import { convert } from '../../src/core/convert/build';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import type { ParsedFile } from '../../src/core/types';
import { dateCell, textFile, xlsxFile } from '../helpers/files';
import type { Cell } from '../helpers/files';
import { sheetInput } from './helpers';
import { pivotConvertFile } from '../../src/core/convert/pivot';

const HEADER: Cell[] = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Oxygen [ml/l]'];
const SERIALS = [44200, 44201, 44202, 44203, 44204];
/** five date-formatted rows and a General 2021 on line 6 (the sixth data row is line 6; the header is line 1) */
const rows = (plain: Cell): Cell[][] => [...SERIALS.slice(0, 4).map((s, i) => ['E' + i, dateCell(s), 55, 3, 5, 4.5] as Cell[]), ['E9', plain, 55, 3, 5, 4.5], ['E5', dateCell(SERIALS[4]), 55, 3, 5, 4.5]];

describe('a plain number in a workbook date column', () => {
  const file = xlsxFile('d.xlsx', { S: [HEADER, ...rows(2021)] });

  it('marks the row, and only that row', () => {
    const s = file.sheets[0];
    expect(s.dateFormatted?.[1]).toBe(true);
    expect(s.rows.map((r) => r.plainNumbers)).toEqual([undefined, undefined, undefined, undefined, [1], undefined]);
  });

  it('/check: the number is an unreadable date on its line; the dates read as before', () => {
    const layout = proposeLayout(file);
    const d = buildDataset(file, layout, proposeMappings(file, layout), [], 'd');
    const f = d.findings.filter((x) => x.ruleId === 'ROW-DATE-UNPARSEABLE');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([6]);
    expect(f[0].value).toBe('2021');
    expect(d.dataset.rows.filter((r) => r.datetime !== undefined)).toHaveLength(5);
  });

  it('/convert: the same finding with its line (it blocks); the other dates are unchanged', () => {
    const r = convert({ sheets: [sheetInput(file)] });
    const f = r.findings.filter((x) => x.ruleId === 'ROW-DATE-UNPARSEABLE');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([6]);
    const clean = convert({ sheets: [sheetInput(xlsxFile('d.xlsx', { S: [HEADER, ...rows(dateCell(44205))] }))] });
    expect(clean.findings.filter((x) => x.ruleId === 'ROW-DATE-UNPARSEABLE')).toHaveLength(0);
  });

  it('a CSV with the same text is not affected (a year is a year)', () => {
    const csv = textFile('d.csv', ['Station,Date,Latitude,Longitude,Depth_m,Oxygen', 'E1,2021-01-02,55,3,5,4.5', 'E2,2021,55,3,5,4.5', 'E3,2021-01-03,55,3,5,4.5'].join('\n'));
    const layout = proposeLayout(csv);
    const d = buildDataset(csv, layout, proposeMappings(csv, layout), [], 'd');
    expect(d.findings.filter((x) => x.ruleId === 'ROW-DATE-UNPARSEABLE')).toHaveLength(0);
  });

  it('a year column (no cell has a date format) is still a year column', () => {
    const y = xlsxFile('y.xlsx', { S: [HEADER, ...[2019, 2020, 2021].map((v, i) => ['E' + i, v, 55, 3, 5, 4.5] as Cell[])] });
    expect(y.sheets[0].rows.some((r) => r.plainNumbers !== undefined)).toBe(false);
  });

  it('a join: the description sheet\'s plain number is the same unreadable date on the line the results row has', () => {
    const book = xlsxFile('b.xlsx', {
      Counts: [['Sample', 'Taxon', 'Count'], ['X01', 'Calanus finmarchicus', 12], ['X02', 'Calanus finmarchicus', 7]],
      Samples: [['Sample', 'Station', 'Date', 'Latitude', 'Longitude', 'Depth'], ['X01', 'ST-1', dateCell(44200), 61.1, 4.2, 10], ['X02', 'ST-2', 2021, 61.3, 4.6, 20], ['X03', 'ST-3', dateCell(44202), 61.5, 4.9, 30]],
    });
    const one = (name: string): ParsedFile => ({ ...book, sheets: book.sheets.filter((s) => s.name === name) });
    const res = sheetInput(one('Counts'), { shape: 'long', quantity: { kind: 'count' }, edit: { Taxon: { kind: 'taxon' }, Count: { kind: 'quantity' } } } as never);
    const des = sheetInput(one('Samples'));
    const r = convert({ sheets: [res, des] });
    const f = r.findings.filter((x) => x.ruleId === 'ROW-DATE-UNPARSEABLE');
    expect(f.length).toBeGreaterThan(0);
    expect(f.flatMap((x) => x.lines ?? [])).toContain(3);
  });

  it('a pivoted long sheet: the key date keeps the cell as a plain number', () => {
    const long = xlsxFile('l.xlsx', {
      S: [['Station', 'Date', 'Parameter', 'Value'], ['E1', dateCell(44200), 'Temp', 5], ['E2', 2021, 'Temp', 6], ['E3', dateCell(44202), 'Temp', 7]],
    });
    const piv = pivotConvertFile(long);
    const s = piv.sheets[0];
    expect(s.dateFormatted?.[1]).toBe(true);
    expect(s.rows.map((r) => r.plainNumbers)).toEqual([undefined, [1], undefined]);
  });
});
