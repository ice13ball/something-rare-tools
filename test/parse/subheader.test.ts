// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A second header row of statistic labels (mean, st.dev., ...) under a header whose cells are merged across the two columns of a variable: part of the header, not data. Synthetic data only.
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { convert } from '../../src/core/convert/build';
import { readConvertFile } from '../../src/core/convert/read';
import { proposeConvertMapping } from '../../src/core/convert/recognize';
import { proposeColumns } from '../../src/core/recognize/columns';
import { parseFile } from '../../src/core/parse';
import { foldStatisticSubheader } from '../../src/core/parse/shared';

/** A workbook whose header cells B1:C1 and D1:E1 are merged ranges (the second cell of each is empty) with mean / st.dev. in row 2. */
function mergedWorkbook(): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Sample', 'Temperature [°C]', null, 'OM (%)', null],
    [null, 'mean', 'st.dev.', 'mean', 'st.dev.'],
    ['S1', 4.5, 0.2, 12.5, 1.1],
    ['S2', 4.7, 0.3, 13.5, 1.4],
    ['S3', 5.1, 0.1, 11.5, 0.9],
  ]);
  ws['!merges'] = [XLSX.utils.decode_range('B1:C1'), XLSX.utils.decode_range('D1:E1')];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

describe('an xlsx with merged header cells and a row of statistic labels', () => {
  const file = parseFile('stats.xlsx', mergedWorkbook());
  const sheet = file.sheets[0];

  it('the labels join the header above them, the merged cell fills its right half, the unit stays at the end', () => {
    expect(sheet.header).toEqual(['Sample', 'Temperature mean [°C]', 'Temperature st.dev. [°C]', 'OM mean (%)', 'OM st.dev. (%)']);
    expect(sheet.subHeaderLine).toBe(2);
  });

  it('the label row is not data: three rows, with their own line numbers', () => {
    expect(sheet.rows.map((r) => r.line)).toEqual([3, 4, 5]);
    expect(sheet.rows[0].cells).toEqual(['S1', 4.5, 0.2, 12.5, 1.1]);
  });

  it('/check: every column is a named variable with its unit, no text-instead-of-number cell', () => {
    const p = proposeColumns(sheet, { decimalComma: false, date1904: false });
    expect(p.map((x) => x.role.kind)).toEqual(['sampleId', 'variable', 'variable', 'variable', 'variable']);
    expect(p[2].role).toMatchObject({ unit: '°C' });
    expect(p[4].role).toMatchObject({ unit: '%' });
  });

  it('/convert reads the same header: the st.dev. columns are variables named after their variable', () => {
    const cf = readConvertFile(file);
    const m = proposeConvertMapping(cf.sheets[0], { decimalComma: false, date1904: false });
    const names = m.columns.flatMap((c) => (c.role.kind === 'variable' ? [c.role.variable] : []));
    expect(names).toEqual(expect.arrayContaining(['Temperature st.dev.', 'OM st.dev.']));
    expect(convert({ sheets: [{ file: cf, sheet: cf.sheets[0].name, mapping: m, shape: 'wide' }] }).findings.some((f) => f.ruleId === 'ROW-NON-NUMERIC')).toBe(false);
  });
});

describe('the same layout as text', () => {
  it('a CSV with empty header cells above the st.dev. labels', () => {
    const csv = 'Sample,Temperature (°C),,OM [%],\n,mean,sd,mean,sd\nS1,4.5,0.2,12.5,1.1\nS2,4.7,0.3,13.5,1.4\n';
    const s = parseFile('stats.csv', new TextEncoder().encode(csv)).sheets[0];
    expect(s.header).toEqual(['Sample', 'Temperature mean (°C)', 'Temperature sd (°C)', 'OM mean [%]', 'OM sd [%]']);
    expect(s.rows.map((r) => r.line)).toEqual([3, 4]);
  });
});

describe('what is not a second header row', () => {
  const header = ['Sample', 'A', 'B'];
  const row = (line: number, cells: (string | number | null)[]) => ({ line, cells, fieldCount: cells.length });
  it('a single label, a label next to a number, or a word that is no statistic is data', () => {
    expect(foldStatisticSubheader(header, [row(2, [null, 'mean', null])])).toBeUndefined();
    expect(foldStatisticSubheader(header, [row(2, [null, 'mean', 4.5])])).toBeUndefined();
    expect(foldStatisticSubheader(header, [row(2, ['S1', 'mean', 'sd'])])).toBeUndefined();
    expect(foldStatisticSubheader(header, [row(2, [null, 'mean', 'comment'])])).toBeUndefined();
  });
  it('labels with no header above them to belong to are left alone', () => {
    expect(foldStatisticSubheader(['', '', ''], [row(2, [null, 'mean', 'sd'])])).toBeUndefined();
  });
  it('a table whose first data row is ordinary data is unchanged', () => {
    const s = parseFile('plain.csv', new TextEncoder().encode('Sample,Temp,Sal\nS1,4.5,35\nS2,4.6,35.1\n')).sheets[0];
    expect(s.header).toEqual(['Sample', 'Temp', 'Sal']);
    expect(s.subHeaderLine).toBeUndefined();
    expect(s.rows).toHaveLength(2);
  });
});

describe('a statistic of a variable is not the variable', () => {
  const p = (header: string) => proposeColumns(parseFile('t.csv', new TextEncoder().encode(`${header},Other\n1.5,2\n2.5,3\n`)).sheets[0], { decimalComma: false, date1904: false })[0];
  it('"T mean (°C)" is the temperature; "T st.dev. (°C)", "Salinity max", "Oxygen n" keep their own names', () => {
    expect(p('T mean (°C)').role).toMatchObject({ kind: 'variable', variable: 'temperature', unit: '°C' });
    expect(p('Salinity mean').role).toMatchObject({ kind: 'variable', variable: 'salinity' });
    expect(p('T st.dev. (°C)').role).toMatchObject({ kind: 'variable', variable: 'T st.dev.', unit: '°C' });
    expect(p('Salinity max').role).toMatchObject({ kind: 'variable', variable: 'Salinity max' });
    expect(p('Oxygen n').role).toMatchObject({ kind: 'variable', variable: 'Oxygen n' });
  });
});
