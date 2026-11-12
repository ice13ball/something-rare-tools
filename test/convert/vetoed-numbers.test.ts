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
    expect(r.SampleNo).toMatchObject({ role: { kind: 'ignore' }, confidence: 'low', reasonCode: 'running-number-date' });
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
    expect(num).toMatchObject({ severity: 'warning', params: { count: 1, columns: 'SampleNo' } });
    expect(renderConvertPlain(year!, 'en')).toContain('Looks like a year beside the date');
    expect(renderConvertPlain(num!, 'en')).toContain('Whole numbers of six or more digits that rise (or fall) from row to row');
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
    expect(params.indexes).toBe('1\u001f2');
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

const LH = ['Sample', 'Date', 'Latitude', 'Longitude', 'Species'];
const longRows = (extra: (s: number, i: number) => Cell[]): Cell[][] => Array.from({ length: 12 }, (_, i) => {
  const s = Math.floor(i / 2);
  return [`s${s + 1}`, `${2002 + s}-06-0${s + 1}`, 54.1 + s / 10, 7.2 + s / 10, TAXA[i % 2], ...extra(s, i)];
});

describe('review round 1: the year must be the year of the date', () => {
  for (const name of ['YearClass', 'Age', 'PAR', 'Conductivity', 'N']) {
    it(`${name} with values in 1800-2100 that are not the year of its date keeps its role`, () => {
      const r = roles([...LH, 'Count', name], longRows((s, i) => [3 + i, 1900 + s * 17]));
      expect(r[name].role.kind).toBe('variable');
      expect(r[name].vetoed).toBeUndefined();
    });
  }
  it('a Year that differs from its date on one row keeps its role, one that agrees where both are filled is vetoed', () => {
    const agree = (bad: boolean) => longRows((s, i) => [3 + i, bad && i === 7 ? 1999 : i % 5 === 4 ? null : 2002 + s]);
    expect(roles([...LH, 'Count', 'Year'], agree(true)).Year.role.kind).toBe('variable');
    expect(roles([...LH, 'Count', 'Year'], agree(false)).Year).toMatchObject({ role: { kind: 'ignore' }, reasonCode: 'year-beside-date' });
  });
});

describe('review round 1: a running number runs', () => {
  for (const name of ['Flowmeter', 'Revolutions', 'Reads', 'Light']) {
    it(`${name}, a six-digit value per sample in arbitrary order, keeps its role`, () => {
      const order = [523411, 498770, 610233, 501002, 733210, 612345];
      const r = roles([...LH, 'Count', name], longRows((s, i) => [3 + i, order[s]]));
      expect(r[name].role.kind).toBe('variable');
    });
  }
  it('distinct six-digit values per row in arbitrary order keep their role; rising or falling ones are vetoed', () => {
    const order = [523411, 498770, 610233, 501002, 733210, 612345, 700001, 400002, 900003, 100004, 800005, 300006];
    expect(roles([...LH, 'Count', 'Tag'], longRows((s, i) => [3 + i, order[i]])).Tag.role.kind).toBe('variable');
    expect(roles([...LH, 'Count', 'Tag'], longRows((s, i) => [3 + i, 900000 - i * 13])).Tag.role.kind).toBe('ignore');
    expect(roles([...LH, 'Count', 'Tag'], longRows((s, i) => [3 + i, 900000 - s * 13])).Tag.role.kind).toBe('ignore');
  });
});

describe('review round 1: the counts column is never taken for a running number', () => {
  for (const name of ['Cells', 'N', 'Reads']) {
    it(`${name} alone on a long sheet with a taxon column stays a variable and the block is still CONV-TAXON-NO-QUANTITY`, async () => {
      const rows = longRows((s, i) => [123457 + i * 9173]);
      expect(roles([...LH, name], rows)[name].role.kind).toBe('variable');
      const e = await exportSheet([...LH, name], rows, { quantity: { kind: 'count' }, fullList: true });
      const ids = e.findings.map((f) => f.ruleId);
      expect(ids).toContain('CONV-TAXON-NO-QUANTITY');
      expect(ids).not.toContain('CONV-SPECIES-LIST-NO-COUNTS');
    });
  }
  it('beside a real quantity column the same rising column is vetoed', () => {
    expect(roles([...LH, 'Count', 'Cells'], longRows((s, i) => [3 + i, 123457 + i * 9173])).Cells.role.kind).toBe('ignore');
  });
});

describe('review round 1: the button restores its own column', () => {
  it('two columns with one header are told apart by their index', () => {
    const f = fileOf([...LH, 'Count', 'Code', 'Code'], longRows((s, i) => [3 + i, 20200101 + i * 7, 30200101 + i * 7]));
    const cols = vetoedColumns(f, f.sheets[0], mappingOf(f));
    expect(cols.map((c) => c.index)).toEqual([6, 7]);
    expect(vetoedParams(cols).indexes).toBe('6\u001f7');
  });
});

describe('review round 2: identifier terms, digit-written dates, both ways of firing', () => {
  it('namePublishedInYear is not vetoed (publication years are not the event years); year equal to its date is, other years are not', () => {
    const r = roles([...LH, 'Count', 'namePublishedInYear', 'year'], longRows((s, i) => [3 + i, 1850 + s * 3 + (i % 2), 2002 + s]));
    expect(r.namePublishedInYear.vetoed).toBeUndefined();
    expect(r.year.vetoed).toBeDefined();
    expect(roles([...LH, 'Count', 'year'], longRows((s, i) => [3 + i, 1990 + s])).year.vetoed).toBeUndefined();
  });
  it('organismID and materialSampleID with running eight-digit numbers are vetoed (they would be measurements)', () => {
    const r = roles([...LH, 'Count', 'organismID', 'materialSampleID'], longRows((s, i) => [3 + i, 31000000 + i * 7, 41000000 + i * 7]));
    expect(r.organismID).toMatchObject({ role: { kind: 'ignore' }, reasonCode: 'running-number' });
    expect(r.materialSampleID).toMatchObject({ role: { kind: 'ignore' }, reasonCode: 'running-number' });
  });
  it('date_start / date_mid / date_end written as YYYYMMDD per sample are vetoed with the date hint, assigned nothing, and not called a running number', async () => {
    const header = [...LH, 'Count', 'date_start', 'date_mid', 'date_end'];
    const rows = longRows((s) => [3 + s, 20020601 + s, 20020615 + s, 20020625 + s]);
    const r = roles(header, rows);
    for (const h of ['date_start', 'date_mid', 'date_end']) {
      expect(r[h]).toMatchObject({ role: { kind: 'ignore' }, reasonCode: 'running-number-date' });
      expect(r[h].reason).not.toMatch(/running number/);
      expect(r[h].reason).toContain('give the column the meaning date in the column table');
    }
    const e = await exportSheet(header, rows, { quantity: { kind: 'count' }, fullList: true });
    const f = e.findings.find((x) => x.ruleId === 'CONV-COLUMN-NUMBER-IGNORED')!;
    expect(f.params.dates).toBe('date_start, date_mid, date_end');
    for (const [lang, word] of [['en', 'meaning date'], ['pl', 'znaczenie „data”'], ['de', 'Bedeutung Datum'], ['fr', 'sens date']] as const) expect(renderConvertPlain(f, lang)).toContain(word);
    // numbers that are no valid dates get no hint
    const plain = await exportSheet([...LH, 'Count', 'Tag'], longRows((s) => [3 + s, 31000000 + s]), { quantity: { kind: 'count' }, fullList: true });
    const g = plain.findings.find((x) => x.ruleId === 'CONV-COLUMN-NUMBER-IGNORED')!;
    expect(g.params.dates).toBeUndefined();
    expect(renderConvertPlain(g, 'en')).not.toContain('meaning date');
  });
  it('the text covers both ways: values that rise from row to row, and values that stay the same within a sample', async () => {
    const perRow = await exportSheet([...LH, 'Count', 'Flow'], longRows((s, i) => [3 + i, 500000 + i]), { quantity: { kind: 'count' }, fullList: true });
    const f = perRow.findings.find((x) => x.ruleId === 'CONV-COLUMN-NUMBER-IGNORED')!;
    for (const [lang, word] of [['en', 'from row to row'], ['pl', 'z wiersza na wiersz'], ['de', 'von Zeile zu Zeile'], ['fr', 'de ligne en ligne']] as const) {
      expect(renderConvertPlain(f, lang)).toContain(word);
      expect(renderConvertPlain(f, lang)).toMatch(lang === 'en' ? /stay the same within a sample/ : lang === 'pl' ? /stałe w próbce/ : lang === 'de' ? /je Probe gleich/ : /identiques dans un échantillon/);
    }
  });
  it('the French plain texts agree in number', () => {
    const f = { ruleId: 'CONV-COLUMN-NUMBER-IGNORED', severity: 'warning', file: 'a.csv', sheet: 'S', lines: [], params: { count: 2, columns: 'A, B' } } as never;
    expect(renderConvertPlain(f, 'fr')).toContain('Non écrites comme mesure');
  });
});
