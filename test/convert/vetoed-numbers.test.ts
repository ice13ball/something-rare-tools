// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A Year beside a date and a running number (eight digits, all different) are not read as measurements: the overlay ignores them (removal only, never another role), CONV-COLUMN-IGNORED and their own
// finding name them with the reason, and giving the role back is one click on the page. A real count with repeats, a year with no date column and a wide sheet are as before. Every value is invented.
import { describe, expect, it } from 'vitest';
import { buildTables } from '../../src/core/convert/dwca';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { vetoedColumns, vetoedParams } from '../../src/core/convert/vetoedNumbers';
import { renderConvertPlain, renderConvertTechnical } from '../../src/core/rules/convert';
import { LANGS } from '../../src/core/types';
import { rawSheet } from '../helpers/files';
import { CTX, fileOf, mappingOf } from './helpers';
import type { Cell } from './helpers';
import { exportSheet } from './exportHelpers';

const HEADER = ['Sample', 'Year', 'Date', 'SampleNo', 'Station', 'Latitude', 'Longitude', 'Species', 'Count'];
const TAXA = ['Abra alba', 'Nucula nitidosa'];
// 6 samples x 2 taxa
const ROWS: Cell[][] = Array.from({ length: 12 }, (_, i) => {
  const s = Math.floor(i / 2);
  return [`s${s + 1}`, 2002 + s, `${2002 + s}-06-0${s + 1}`, 20200101 + s * 101, `ST${s + 1}`, 54.1 + s / 10, 7.2 + s / 10, TAXA[i % 2], 3 + i];
});
const roles = (header: string[], rows: Cell[][]) => Object.fromEntries(proposeConvertColumns(rawSheet(header, rows), CTX).map((p) => [p.header, p]));
const tablesOf = (e: Awaited<ReturnType<typeof exportSheet>>): string => JSON.stringify(buildTables(e.dataset));

describe('a Year beside a date and an eight-digit SampleNo on a long sheet', () => {
  it('are both ignored with their reason, low confidence, and nothing else is assigned', () => {
    const r = roles(HEADER, ROWS);
    expect(r.Year).toMatchObject({ role: { kind: 'ignore' }, confidence: 'low', reasonCode: 'year-beside-date' });
    expect(r.SampleNo).toMatchObject({ role: { kind: 'ignore' }, confidence: 'low', reasonCode: 'running-number' });
    expect(r.Year.vetoed).toMatchObject({ kind: 'variable' });
    expect(r.Date.role.kind).toBe('date');
    expect(r.Count.role.kind).toBe('quantity');
  });

  it('are not in the archive, are named by CONV-COLUMN-IGNORED and by their own finding, and one click gives the measurement back', async () => {
    const e = await exportSheet(HEADER, ROWS, { quantity: { kind: 'count' }, fullList: true });
    expect(tablesOf(e)).not.toContain('SampleNo');
    expect(tablesOf(e)).not.toContain('20200101');
    const ignored = e.findings.find((f) => f.ruleId === 'CONV-COLUMN-IGNORED');
    expect(String(ignored?.params.columns).split(', ').sort()).toEqual(['SampleNo', 'Year']);
    const year = e.findings.find((f) => f.ruleId === 'CONV-COLUMN-YEAR-IGNORED');
    const num = e.findings.find((f) => f.ruleId === 'CONV-COLUMN-NUMBER-IGNORED');
    expect(year).toMatchObject({ severity: 'info', params: { count: 1, columns: 'Year' } });
    expect(num).toMatchObject({ severity: 'info', params: { count: 1, columns: 'SampleNo' } });
    expect(renderConvertPlain(year!, 'en')).toContain('Looks like a year beside the date');
    expect(renderConvertPlain(num!, 'en')).toContain('Looks like a running number: whole numbers only, all different');
    // the click: the page sets the role carried in `roles`; here the same role through the mapping
    const back = JSON.parse(String(num!.params.roles)) as { kind: string; variable: string };
    expect(back).toMatchObject({ kind: 'variable', variable: 'SampleNo' });
    const again = await exportSheet(HEADER, ROWS, { quantity: { kind: 'count' }, fullList: true, edit: { SampleNo: back as never, Year: JSON.parse(String(year!.params.roles)) } });
    expect(tablesOf(again)).toContain('SampleNo');
    expect(again.findings.some((f) => f.ruleId === 'CONV-COLUMN-NUMBER-IGNORED' || f.ruleId === 'CONV-COLUMN-YEAR-IGNORED')).toBe(false);
  });

  it('the texts exist in four languages with count forms, and name the column', () => {
    const both = ROWS.map((r) => [...r]);
    const f = fileOf(['Sample', 'Year', 'Yr2', 'Date', 'Species', 'Count'], both.map((r) => [r[0], r[1], r[1], r[2], r[7], r[8]]));
    const cols = vetoedColumns(f, f.sheets[0], mappingOf(f));
    expect(cols.map((c) => c.header)).toEqual(['Year', 'Yr2']);
    const params = vetoedParams(cols);
    for (const lang of LANGS) {
      const one = renderConvertPlain({ ruleId: 'CONV-COLUMN-YEAR-IGNORED', severity: 'info', file: 'a.csv', sheet: 'S', lines: [], params: { ...params, count: 1, columns: 'Year' } } as never, lang);
      const two = renderConvertPlain({ ruleId: 'CONV-COLUMN-YEAR-IGNORED', severity: 'info', file: 'a.csv', sheet: 'S', lines: [], params } as never, lang);
      expect(one).toContain('Year');
      expect(two).toContain('Year, Yr2');
      expect(one).not.toBe(two);
      expect(renderConvertTechnical({ ruleId: 'CONV-COLUMN-NUMBER-IGNORED', severity: 'info', file: 'a.csv', sheet: 'S', lines: [], params } as never)).toContain('Year, Yr2');
    }
  });

  it('a column the person set by hand is not listed again', () => {
    const f = fileOf(HEADER, ROWS);
    expect(vetoedColumns(f, f.sheets[0], mappingOf(f)).map((c) => c.header)).toEqual(['Year', 'SampleNo']);
    expect(vetoedColumns(f, f.sheets[0], mappingOf(f), [1, 3])).toEqual([]);
    expect(vetoedColumns(f, f.sheets[0], mappingOf(f, { Year: { kind: 'variable', variable: 'Year' } })).map((c) => c.header)).toEqual(['SampleNo']);
  });
});

describe('what keeps its role', () => {
  it('a count of five digits with repeats stays a variable, so does a distinct number of five digits', () => {
    const rows = ROWS.map((r, i) => [r[0], r[2], r[4], r[5], r[6], r[7], r[8], i % 3 === 0 ? 12345 : 67890, 10000 + i]);
    const r = roles(['Sample', 'Date', 'Station', 'Latitude', 'Longitude', 'Species', 'Count', 'Count 12345', 'Tag'], rows);
    expect(r['Count 12345'].role.kind).toBe('variable');
    expect(r['Count 12345'].vetoed).toBeUndefined();
    expect(r.Tag.role.kind).toBe('variable');
  });

  it('a six-digit column with a repeated value stays a variable', () => {
    const rows = ROWS.map((r, i) => [r[0], r[2], r[7], r[8], 500000 + (i % 4)]);
    expect(roles(['Sample', 'Date', 'Species', 'Count', 'Cells'], rows).Cells.role.kind).toBe('variable');
  });

  it('a six-digit value shared by two different samples is no sample number; all different values are', () => {
    const shared = ROWS.map((r, i) => [r[0], r[2], r[7], r[8], 500000 + Math.floor(i / 4)]);
    expect(roles(['Sample', 'Date', 'Species', 'Count', 'Batch'], shared).Batch.role.kind).toBe('variable');
    const two = ROWS.map((r, i) => [r[0], r[2], r[7], r[8], 500000 + Math.floor(i / 2) * 10 + (i % 2)]);
    expect(roles(['Sample', 'Date', 'Species', 'Count', 'Batch'], two).Batch.role.kind).toBe('ignore');
  });

  it('a column with a unit or a known name is not vetoed', () => {
    const rows = ROWS.map((r, i) => [r[0], r[2], r[7], r[8], 500000 + i * 7, 2000 + i]);
    const r = roles(['Sample', 'Date', 'Species', 'Count', 'Cells [ug/L]', 'Salinity'], rows);
    expect(r['Cells [ug/L]'].role.kind).toBe('variable');
    expect(r.Salinity.role.kind).toBe('variable');
  });

  it('a year column with no date column keeps its current role', () => {
    const noDate = ROWS.map((r) => [r[0], r[1], r[4], r[5], r[6], r[7], r[8]]);
    const r = roles(['Sample', 'Year', 'Station', 'Latitude', 'Longitude', 'Species', 'Count'], noDate);
    expect(r.Year.role.kind).toBe('variable');
    expect(r.Year.vetoed).toBeUndefined();
  });

  it('a wide sheet behaves as before: a Year is ignored by its own rule, an eight-digit column stays a taxon candidate', () => {
    const header = ['Station', 'Date', 'Year', 'SampleNo', 'Calanus finmarchicus', 'Oithona similis'];
    const rows = Array.from({ length: 6 }, (_, i) => [`S${i}`, `${2002 + i}-06-01`, 2002 + i, 20200101 + i * 101, 4 + i, 2 + i]);
    const r = roles(header, rows);
    expect(r.Year).toMatchObject({ role: { kind: 'ignore' }, reasonCode: 'year-values' });
    expect(r.SampleNo.role).toEqual({ kind: 'taxon', header: true });
    expect(r.SampleNo.vetoed).toBeUndefined();
  });
});
