// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// META-NO-DATES / META-NO-POSITIONS beside a lookup sheet: decided by which sheets hold measurements. Invented rows only.
import { describe, expect, it } from 'vitest';
import { checkMetadataVsData } from '../../src/core/checks/metadata';
import type { Dataset } from '../../src/core/types';
import { makeDataset } from '../helpers/build';

type Rows = Parameters<typeof makeDataset>[0];
const cell = (n: number, line: number) => ({ raw: String(n), line, value: n, status: 'ok' as const });
const sheetDs = (sheet: string, rows: Rows): Dataset => {
  const ds = makeDataset(rows, [], { file: 'book.xlsx', label: `book.xlsx (${sheet})`, id: sheet });
  for (const r of ds.rows) r.sheet = sheet;
  return ds;
};
const measured = (sheet: string, n: number, extra: Rows[number] = {}) =>
  sheetDs(sheet, Array.from({ length: n }, (_, i) => ({ ...extra, values: { Count: cell(i + 1, i + 2) } })));
const lookup = (sheet: string) => sheetDs(sheet, [{ values: { Area: cell(0.1, 2) } }]);
const ids = (ds: Dataset, all: Dataset[]) => checkMetadataVsData(ds, all).map((f) => f.ruleId);

describe('META-NO-DATES / META-NO-POSITIONS beside a lookup sheet', () => {
  it('a one-row lookup sheet raises neither while another sheet holds measurements', () => {
    const data = measured('Counts', 5, { lat: 80, lon: 22, datetime: '2003-07-01' });
    const gear = lookup('Gear');
    expect(ids(gear, [data, gear])).toEqual([]);
    expect(ids(data, [data, gear])).toEqual([]);
  });

  it('a sheet with measurements and no position still raises it, even when a lookup sheet elsewhere has one; the finding names the sheet', () => {
    const bare = measured('Counts', 5, { datetime: '2003-07-01' });
    const station = sheetDs('Station', [{ lat: 80, lon: 22, datetime: '2003-07-01' }]);
    const f = checkMetadataVsData(bare, [bare, station]).filter((x) => x.ruleId === 'META-NO-POSITIONS');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ file: 'book.xlsx', sheet: 'Counts' });
    const undated = measured('Counts', 5, { lat: 80, lon: 22 });
    const g = checkMetadataVsData(undated, [undated, station]).filter((x) => x.ruleId === 'META-NO-DATES');
    expect(g).toHaveLength(1);
    expect(g[0].sheet).toBe('Counts');
  });

  it('when no sheet holds measurements every sheet is judged as before (a file of lookups only)', () => {
    const a = lookup('Gear');
    const b = lookup('CRS');
    expect(ids(a, [a, b]).sort()).toEqual(['META-NO-DATES', 'META-NO-POSITIONS']);
    expect(ids(a, [a])).toEqual(['META-NO-DATES', 'META-NO-POSITIONS']);
  });

  it('a one-sheet CSV names no sheet', () => {
    const f = checkMetadataVsData(makeDataset([{}, {}]));
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.sheet === undefined)).toBe(true);
  });
});
