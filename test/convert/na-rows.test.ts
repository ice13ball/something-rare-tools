// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Long-sheet rows whose quantity is blank or NaN: a row with a weight stays as an occurrence with no count, a row with nothing is counted and listed, and the rows add up.
// Every value is invented.
import { describe, expect, it } from 'vitest';
import { policyOf } from '../../src/core/convert/policy';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { ColumnRole, Lang } from '../../src/core/types';
import * as XLSX from 'xlsx';
import { convert } from '../../src/core/convert/build';
import { parseXlsx } from '../../src/core/parse/xlsx';
import type { ParsedFile } from '../../src/core/types';
import { exportSheet } from './exportHelpers';
import { sheetInput } from './helpers';
import type { Cell } from './helpers';

const H = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Abundance', 'Weight [g]'];
const row = (sample: string, sp: string, abundance: Cell, weight: Cell): Cell[] => ['S1', sample, '2023-06-14', 55.5, 2.5, sp, abundance, weight];
const EDIT: Record<string, ColumnRole> = { 'Weight [g]': { kind: 'biomass', basis: 'wet' } };
const run = (rows: Cell[][], extra: Partial<Parameters<typeof exportSheet>[2]> = {}) => exportSheet(H, rows, { quantity: { kind: 'count' }, edit: EDIT, ...extra });
const find = (e: { findings: { ruleId: string; params: Record<string, unknown>; lines?: number[]; field?: string }[] }, id: string) => e.findings.filter((f) => f.ruleId === id) as import('../../src/core/types').Finding[];

const ROWS: Cell[][] = [
  row('s1', 'Calanus finmarchicus', 4, 1.5), // 2
  row('s1', 'Oithona similis', null, 2.5), // 3 blank quantity, a weight
  row('s1', 'Pseudocalanus sp.', 'NaN', null), // 4 NaN, nothing else
  row('s1', 'Temora longicornis', 0, null), // 5 a plain zero
  row('s2', 'Acartia longiremis', 'NA', 0), // 6 NA, a weight of zero: nothing
  row('s2', 'Metridia lucens', null, null), // 7 blank, nothing
  row('s2', 'Centropages typicus', 0, 3), // 8 a zero and a weight: contradictory
  row('s2', 'Paracalanus parvus', 'NaN', 0.75), // 9 NaN, a weight
];

describe('a long sheet with blank or NaN quantities', () => {
  it('keeps a row with a weight as present with no count, and writes its weight', async () => {
    const e = await run(ROWS);
    const occ = e.dataset.occurrences.filter((o) => ['Oithona similis', 'Paracalanus parvus'].includes(o.identification.verbatim));
    expect(occ.map((o) => [o.identification.verbatim, o.status, o.quantity])).toEqual([
      ['Oithona similis', 'present', undefined],
      ['Paracalanus parvus', 'present', undefined],
    ]);
    const weights = e.dataset.measurements.filter((m) => m.type.toLowerCase().includes('weight') || m.type.toLowerCase().includes('biomass'));
    expect(weights.map((m) => [m.occurrenceId, m.value, m.unit]).filter((w) => /Oithona|Paracalanus/.test(String(w[0])))).toEqual([
      [expect.stringContaining('Oithona'), '2.5', 'g'],
      [expect.stringContaining('Paracalanus'), '0.75', 'g'],
    ]);
    // no count is made up for them
    expect(e.dataset.measurements.filter((m) => /Oithona|Paracalanus/.test(m.occurrenceId ?? '') && m.type.startsWith('Count'))).toEqual([]);
    const f = find(e, 'CONV-QUANTITY-BLANK-KEPT');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([3, 9]);
    expect(f[0].params.count).toBe(2);
    expect(policyOf(f[0])).toBe('accept');
  });

  it('counts and lists a row with nothing but blank or NaN, and makes no presence record from it', async () => {
    const e = await run(ROWS);
    const f = find(e, 'CONV-NA-SKIPPED');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([4, 6, 7]);
    expect(f[0].params).toMatchObject({ count: 3, rows: 'yes' });
    expect(policyOf(f[0])).toBe('show');
    const names = e.dataset.occurrences.map((o) => o.identification.verbatim);
    for (const gone of ['Pseudocalanus sp.', 'Acartia longiremis', 'Metridia lucens']) expect(names).not.toContain(gone);
  });

  it('rows with a taxon = occurrences + zeros skipped + rows reported (a sum a test can assert)', async () => {
    const e = await run(ROWS);
    expect(e.result.stats.occurrences + e.result.stats.zerosSkipped + e.result.stats.naSkipped).toBe(ROWS.length);
    expect(e.result.stats).toMatchObject({ occurrences: 3, zerosSkipped: 2, naSkipped: 3, blankKept: 2 });
    // with the full species list the zeros become absences and the sum still holds
    const full = await run(ROWS, { fullList: true });
    expect(full.result.stats.occurrences + full.result.stats.zerosSkipped + full.result.stats.naSkipped).toBe(ROWS.length);
  });

  it('a quantity of 0 with a weight above zero is reported, not kept silently either way', async () => {
    const e = await run(ROWS);
    const f = find(e, 'CONV-ZERO-WITH-BIOMASS');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([8]);
    expect(policyOf(f[0])).toBe('accept');
    expect(e.dataset.occurrences.map((o) => o.identification.verbatim)).not.toContain('Centropages typicus');
    // with the full-list tick the contradicted zero is still NOT written as absent (a false absence): left out, listed, and counted
    const full = await run(ROWS, { fullList: true });
    expect(full.dataset.occurrences.some((o) => o.identification.verbatim === 'Centropages typicus')).toBe(false);
    expect(find(full, 'CONV-ZERO-WITH-BIOMASS')[0].lines).toEqual([8]);
    expect(full.dataset.occurrences.find((o) => o.identification.verbatim === 'Temora longicornis')!.status).toBe('absent');
    expect(full.result.stats.occurrences + full.result.stats.zerosSkipped + full.result.stats.naSkipped).toBe(ROWS.length);
  });

  it('a text quantity (trace, <1) keeps its weight', async () => {
    const e = await run([row('s1', 'Calanus finmarchicus', 'trace', 5), row('s1', 'Oithona similis', '<1', 2)]);
    expect(e.dataset.occurrences.map((o) => o.status)).toEqual(['present', 'present']);
    expect(e.dataset.measurements.filter((m) => m.type.toLowerCase().includes('weight')).map((m) => m.value)).toEqual(['5', '2']);
  });

  it('a row with a count or a weight and no taxon name is said, not dropped silently', async () => {
    const e = await run([row('s1', 'Calanus finmarchicus', 4, 1), ['S1', 's1', '2023-06-14', 55.5, 2.5, null, 3, null], ['S1', 's1', '2023-06-14', 55.5, 2.5, null, null, 2.5]]);
    // one message for the same lines: the question that blocks until the person decides (leave them out and list them, or correct the file) replaces the warning about them
    expect(find(e, 'CONV-TAXON-EMPTY-ROW')).toHaveLength(0);
    const f = find(e, 'CONV-ROW-NOT-UNDERSTOOD');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([3, 4]);
    expect(f[0].params).toMatchObject({ reason: 'no-taxon', count: 2 });
    expect(policyOf(f[0])).toBe('block');
  });

  it('names the other quantity-named column that is filled on the rows counted as NA, and says when the whole column is empty', async () => {
    const header = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count', 'Abundance'];
    const rows: Cell[][] = [['S1', 's1', '2023-06-14', 55.5, 2.5, 'Calanus finmarchicus', null, 4], ['S1', 's1', '2023-06-14', 55.5, 2.5, 'Oithona similis', null, 7]];
    const e = await exportSheet(header, rows, { quantity: { kind: 'count' }, edit: { Count: { kind: 'quantity' }, Abundance: { kind: 'ignore' } } });
    const f = find(e, 'CONV-NA-SKIPPED')[0];
    expect(f.params).toMatchObject({ columns: 'Abundance (2)', empty: 'yes' });
    expect(renderConvertPlain(f, 'en')).toContain('empty in all 2 rows');
  });

  it('a measured variable alone does not keep a row: it is written once per sample and says nothing about the taxon', async () => {
    const header = [...H, 'Temperature [C]'];
    const rows: Cell[][] = [
      [...row('s1', 'Calanus finmarchicus', 4, null), 12.5],
      [...row('s1', 'Oithona similis', null, null), 12.5],
    ];
    const e = await exportSheet(header, rows, { quantity: { kind: 'count' }, edit: EDIT });
    expect(e.dataset.occurrences.map((o) => o.identification.verbatim)).toEqual(['Calanus finmarchicus']);
    expect(find(e, 'CONV-NA-SKIPPED')[0].lines).toEqual([3]);
  });

  it('a long sheet without blank quantities is unchanged: no new finding', async () => {
    const e = await run([row('s1', 'Calanus finmarchicus', 4, 1.5), row('s1', 'Oithona similis', 2, 0.5)]);
    expect(find(e, 'CONV-NA-SKIPPED')).toEqual([]);
    expect(find(e, 'CONV-QUANTITY-BLANK-KEPT')).toEqual([]);
    expect(find(e, 'CONV-ZERO-WITH-BIOMASS')).toEqual([]);
    expect(e.result.stats).toMatchObject({ naSkipped: 0, blankKept: 0 });
  });

  it('a wide sheet keeps its sparse cells uncounted', async () => {
    const e = await exportSheet(['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Calanus finmarchicus', 'Oithona similis'], [['S1', 's1', '2023-06-14', 55.5, 2.5, 3, null]], { quantity: { kind: 'count' } });
    expect(find(e, 'CONV-NA-SKIPPED')).toEqual([]);
    expect(e.result.stats.naSkipped).toBe(0);
  });

  it('the findings are worded in four languages', async () => {
    const e = await run(ROWS);
    for (const id of ['CONV-NA-SKIPPED', 'CONV-QUANTITY-BLANK-KEPT', 'CONV-ZERO-WITH-BIOMASS']) {
      for (const lang of ['pl', 'en', 'de', 'fr'] as Lang[]) {
        const t = renderConvertPlain(find(e, id)[0], lang);
        expect(t, `${id} ${lang}`).not.toMatch(/\{[a-z+]/i);
        expect(t, `${id} ${lang}`).toMatch(/\d/);
      }
    }
    expect(renderConvertPlain(find(e, 'CONV-NA-SKIPPED')[0], 'pl')).toContain('3 wiersze z gatunkiem nie mają');
    expect(renderConvertPlain(find(e, 'CONV-QUANTITY-BLANK-KEPT')[0], 'pl')).toContain('2 wiersze mają');
  });

  it('a time column of full datetimes is read as date and time by itself; chosen as a time, with no date column, it blocks instead of losing the date', async () => {
    const header = ['Station', 'Sample', 'time', 'Latitude', 'Longitude', 'Species', 'Count'];
    const both = [['S1', 's1', '2003-01-17T00:00:00Z', 55.5, 2.5, 'Calanus finmarchicus', 4], ['S1', 's2', '2003-01-18T00:00:00Z', 55.5, 2.5, 'Oithona similis', 2]] as Cell[][];
    const byName = await exportSheet(header, both, { quantity: { kind: 'count' } });
    expect(find(byName, 'CONV-TIME-HOLDS-DATES')).toEqual([]);
    expect(byName.result.events.some((ev) => ev.eventDate?.startsWith('2003-01-17'))).toBe(true);
    const e = await exportSheet(header, both, { quantity: { kind: 'count' }, edit: { time: { kind: 'time' } } });
    const f = find(e, 'CONV-TIME-HOLDS-DATES');
    expect(f).toHaveLength(1);
    expect(f[0].params.count).toBe(2);
    expect(policyOf(f[0])).toBe('block');
    // read as a date and time, the finding is gone
    const ok = await exportSheet(header, [['S1', 's1', '2003-01-17T00:00:00Z', 55.5, 2.5, 'Calanus finmarchicus', 4]], { quantity: { kind: 'count' }, edit: { time: { kind: 'datetime' } } });
    expect(find(ok, 'CONV-TIME-HOLDS-DATES')).toEqual([]);
  });

  const timeCase = (cells: Cell[]) =>
    exportSheet(['Station', 'Sample', 'time', 'Latitude', 'Longitude', 'Species', 'Count'], cells.map((c, i) => ['S1', `s${i}`, c, 55.5, 2.5, 'Calanus finmarchicus', 4] as Cell[]), { quantity: { kind: 'count' }, edit: { time: { kind: 'time' } } });

  it.each([['17/01/2003 08:30'], ['17.01.2003'], ['2003-01-17T08:30:00Z'], ['2003-01-17 08:30']])('a time column of dates (%s) blocks', async (cell) => {
    const e = await timeCase([cell, cell]);
    expect(find(e, 'CONV-TIME-HOLDS-DATES')).toHaveLength(1);
  });

  it('epoch and spreadsheet placeholders are times, not dates (ISO and day-first)', async () => {
    const e = await timeCase(['1899-12-30 12:30:00', '1970-01-01 12:30:00', '1899-12-31 08:00:00', '30/12/1899 12:30', '30.12.1899 12:30', '12/30/1899 12:30']);
    expect(find(e, 'CONV-TIME-HOLDS-DATES')).toEqual([]);
    expect(find(e, 'CONV-TIME-SOME-DATES')).toEqual([]);
  });

  it('a few dates among times are listed by line (warning), not blocked', async () => {
    const e = await timeCase(['08:30', '09:30', '10:30', '2003-01-17T08:30:00Z', '11:30']);
    expect(find(e, 'CONV-TIME-HOLDS-DATES')).toEqual([]);
    const f = find(e, 'CONV-TIME-SOME-DATES');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([5]);
    expect(policyOf(f[0])).toBe('accept');
  });

  it('a time column of dates written in a form no reader reads is said, not lost in silence; 2003/01/17 is read as a date and time', async () => {
    for (const cell of ['20030117 0830', 'Jan 17 2003', '01/17/2003 8:30 AM']) expect(find(await timeCase([cell, cell]), 'CONV-TIME-HOLDS-DATES'), cell).toHaveLength(1);
    const read = await exportSheet(['Station', 'Sample', 'time', 'Latitude', 'Longitude', 'Species', 'Count'], ['2003/01/17 08:30', '2003/01/18 09:30'].map((c, i) => ['S1', `s${i}`, c, 55.5, 2.5, 'Calanus finmarchicus', 4] as Cell[]), { quantity: { kind: 'count' } });
    expect(find(read, 'CONV-TIME-HOLDS-DATES')).toEqual([]);
    expect(read.result.events.some((ev) => ev.eventDate?.startsWith('2003-01-17'))).toBe(true);
  });

  it('plain numbers are times (63000, 73000 as HHMMSS, 43200 as seconds of the day), not dates', async () => {
    const e = await timeCase([63000, 73000, 43200]);
    expect(find(e, 'CONV-TIME-HOLDS-DATES')).toEqual([]);
    expect(find(e, 'CONV-TIME-SOME-DATES')).toEqual([]);
  });

  it('a serial number counts as a date only in a column the workbook formats as a date (a generated xlsx, end to end)', async () => {
    const book = (z: string | undefined): ParsedFile => {
      const ws = XLSX.utils.aoa_to_sheet([['Station', 'Sample', 'time', 'Latitude', 'Longitude', 'Species', 'Count']]);
      [37638.35, 37639.35].forEach((v, i) => XLSX.utils.sheet_add_aoa(ws, [['S1', `s${i}`, { t: 'n', v, ...(z === undefined ? {} : { z }) }, 55.5, 2.5, 'Calanus finmarchicus', 4]] as never, { origin: `A${i + 2}` }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'S');
      return parseXlsx(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })), 'x.xlsx');
    };
    const run = async (file: ParsedFile, asTime = false) => {
      const input = sheetInput(file, { quantity: { kind: 'count' }, ...(asTime ? { edit: { time: { kind: 'time' as const } } } : {}) });
      return convert({ sheets: [input] });
    };
    // a column the workbook formats as a date and time is the date and time by itself; chosen as a time, with no date column, it blocks
    expect((await run(book('yyyy-mm-dd hh:mm'))).findings.some((f) => f.ruleId === 'CONV-TIME-HOLDS-DATES')).toBe(false);
    const formatted = await run(book('yyyy-mm-dd hh:mm'), true);
    expect(find({ findings: formatted.findings } as never, 'CONV-TIME-HOLDS-DATES')).toHaveLength(1);
    const plain = await run(book(undefined));
    expect(plain.findings.some((f) => f.ruleId === 'CONV-TIME-HOLDS-DATES')).toBe(false);
  });
});
