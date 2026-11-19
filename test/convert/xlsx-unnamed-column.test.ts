// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Round 4 R6: cells right of a workbook's last named header cell are an unnamed column ("column G, no header"), reported with their lines and
// handled on /convert like any column it does not export; no row is lost. Every value is invented.
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { judge } from '../../src/core/convert/policy';
import { parseXlsx } from '../../src/core/parse/xlsx';
import { renderPlain } from '../../src/core/report';
import { sheetInput } from './helpers';

const HEADER = ['Sample', 'Date', 'Latitude', 'Longitude', 'Taxon', 'Count'];
const bookOf = (rows: unknown[][]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows as never), 'S');
  return parseXlsx(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })), 'u.xlsx');
};
// header on row 1, ten data rows (lines 2-11); extra[i] is the cell(s) right of F on line i + 2
const sheetRows = (extra: Record<number, unknown[]>): unknown[][] => [
  HEADER,
  ...Array.from({ length: 10 }, (_, i) => [`E${i}`, '2099-01-01', 55 + i * 0.1, 3, 'Calanus finmarchicus', i + 1, ...(extra[i + 2] ?? [])]),
];
const named = <F extends { ruleId: string }>(f: { findings: readonly F[] }, id: string): F[] => f.findings.filter((x) => x.ruleId === id);

describe('xlsx: cells right of the header', () => {
  it('values in G on two rows: Column 7, unnamedFrom 6, one finding with its lines, no ragged row', () => {
    const f = bookOf(sheetRows({ 3: [1.5], 5: [2.5] }));
    const s = f.sheets[0];
    expect(s.header).toEqual([...HEADER, 'Column 7']);
    expect(s.unnamedFrom).toBe(6);
    const found = named(f, 'IN-COLUMN-NO-HEADER');
    expect(found).toHaveLength(1);
    expect(found[0].params).toEqual({ column: 'G', count: 2 });
    expect(found[0].lines).toEqual([3, 5]);
    expect(found[0].sheet).toBe('S');
    expect(named(f, 'ROW-RAGGED')).toEqual([]);
    expect(named(f, 'IN-HEADER-SHORT')).toEqual([]);
    expect(s.rows.find((r) => r.line === 3)!.cells[6]).toBe(1.5); // nothing shifts
    expect(renderPlain(found[0] as never, 'en')).toBe('Column G has values in 2 rows but no name in the header (lines 3, 5). It is read as a column without a name; give it a name in the file, or say on /convert what it holds.');
  });

  it('values only in H: G and H are added, one finding for H', () => {
    const f = bookOf(sheetRows({ 4: [null, 'x'] }));
    expect(f.sheets[0].header).toEqual([...HEADER, 'Column 7', 'Column 8']);
    expect(f.sheets[0].unnamedFrom).toBe(6);
    const found = named(f, 'IN-COLUMN-NO-HEADER');
    expect(found).toHaveLength(1);
    expect(found[0].params).toMatchObject({ column: 'H', count: 1 });
  });

  it('nothing right of F: the header is unchanged and there is no finding', () => {
    const f = bookOf(sheetRows({}));
    expect(f.sheets[0].header).toEqual(HEADER);
    expect(f.sheets[0].unnamedFrom).toBeUndefined();
    expect(named(f, 'IN-COLUMN-NO-HEADER')).toEqual([]);
  });

  it('a formatting-only or empty-text cell right of the header makes no column', () => {
    const ws = XLSX.utils.aoa_to_sheet(sheetRows({}) as never);
    ws.G3 = { t: 's', v: '   ' };
    ws.H4 = { t: 'z' } as never;
    ws['!ref'] = 'A1:H11';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'S');
    const f = parseXlsx(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })), 'u.xlsx');
    expect(f.sheets[0].header).toEqual(HEADER);
    expect(named(f, 'IN-COLUMN-NO-HEADER')).toEqual([]);
  });

  it('a blank in the MIDDLE of the header is not this case: no unnamed column, no finding', () => {
    const rows = sheetRows({});
    rows[0] = ['Station', '', 'Latitude', 'Longitude', 'Taxon', 'Count'];
    const f = bookOf(rows);
    expect(f.sheets[0].header).toEqual(rows[0]);
    expect(f.sheets[0].unnamedFrom).toBeUndefined();
    expect(named(f, 'IN-COLUMN-NO-HEADER')).toEqual([]);
  });

  it('a percentage and a General number among date cells in the unnamed column are read as in a named one', () => {
    const f = bookOf(sheetRows({ 2: [{ t: 'n', v: 0.95, z: '0%' }], 3: [{ t: 'n', v: 0.5, z: '0%' }] }));
    expect(f.sheets[0].rows[0].cells[6]).toBe(95);
    expect(named(f, 'IN-PERCENT-READ')).toHaveLength(1);
    const g = bookOf(sheetRows({ 2: [{ t: 'n', v: 45000, z: 'yyyy-mm-dd' }], 3: [{ t: 'n', v: 45001, z: 'yyyy-mm-dd' }], 4: [2021] }));
    expect(g.sheets[0].dateFormatted?.[6]).toBe(true);
    expect(g.sheets[0].rows.find((r) => r.line === 4)!.plainNumbers).toEqual([6]);
  });
});

describe('xlsx: the unnamed column on /convert', () => {
  const file = () => bookOf(sheetRows({ 3: [1.5], 5: [2.5] }));
  const go = (extra: Parameters<typeof sheetInput>[1] = {}) => {
    const sin = sheetInput(file(), { quantity: { kind: 'count' }, ...extra });
    return { sin, r: convert({ sheets: [sin], approvedSplits: {} }) };
  };

  it('is not exported until the person decides: CONV-COLUMN-NOT-EXPORTED names it and the not-written list holds its two cells', () => {
    const { r } = go();
    const f = named(r, 'CONV-COLUMN-NOT-EXPORTED');
    expect(f).toHaveLength(1);
    expect(String(f[0].params.columns)).toBe('[G]');
    expect(judge(r.findings).acceptRules).toContain('CONV-COLUMN-NOT-EXPORTED');
    const c = r.ledger[0].columns.find((x) => x.header === 'Column 7')!;
    expect(c.to).toBe('not-written');
    expect(c.skipped).toEqual([{ reason: 'column-not-read', count: 2, sum: 4 }]);
    expect(r.occurrences.length).toBe(10); // every row of A-F is written
  });

  it('with the role variable it is written as measurements of those samples', () => {
    const { r } = go({ edit: { 'Column 7': { kind: 'variable', variable: 'Notes' } as never } });
    expect(named(r, 'CONV-COLUMN-NOT-EXPORTED')).toEqual([]);
    const vals = r.measurements.filter((m) => m.source.column === 'Column 7').map((m) => m.measurementValue);
    expect(vals.sort()).toEqual(['1.5', '2.5']);
  });

  it('the person setting it to ignore is CONV-COLUMN-IGNORED and needs no acceptance', () => {
    const { r } = go({ edit: { 'Column 7': { kind: 'ignore' } }, ignoreChosen: [6] });
    expect(named(r, 'CONV-COLUMN-NOT-EXPORTED')).toEqual([]);
    expect(named(r, 'CONV-COLUMN-IGNORED')).toHaveLength(1);
    expect(judge(r.findings).acceptRules).not.toContain('CONV-COLUMN-NOT-EXPORTED');
  });
});
