// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// One declared day/month order for every reader of a date (core/values/dates.ts columnOrder): an ambiguous date (5/4/2023) is never guessed; until the order of the column is declared it blocks with a
// clear choice, once declared the date written, the date inside an ID and the date compared in a join agree. Invented data.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { joinInputs } from '../../src/core/convert/sampleJoin';
import type { SampleJoinRequestCore } from '../../src/core/convert/sampleJoin';
import { Collector, metaParser, specsOf } from '../../src/core/dataset';
import { renderConvertPlain } from '../../src/core/rules/convert';
import { columnOrder, declaredOrderStatus, isAmbiguousDayMonth } from '../../src/core/values/dates';
import type { ColumnRole } from '../../src/core/types';
import { xlsxFile } from '../helpers/files';
import { descriptionInput, resultsInput } from './joinFixtures';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const TAX = 'Calanus finmarchicus';
const HEADER = ['Sample', 'Date', 'Latitude', 'Longitude', TAX];
const rowsOf = (dates: Cell[]): Cell[][] => dates.map((d, i) => [`S${i + 1}`, d, 61.1, 4.2, 3 + i]);
const input = (dates: Cell[], extra: Partial<ConvertSheetInput> = {}): ConvertSheetInput =>
  sheetInput(fileOf(HEADER, rowsOf(dates)), { shape: 'wide', quantity: { kind: 'count' }, device: { kind: 'known', key: 'multinet' }, ...extra });
const rule = (r: ReturnType<typeof convert>, id: string) => r.findings.filter((f) => f.ruleId === id);
const dateOf = (r: ReturnType<typeof convert>, id: string) => r.events.find((e) => e.id === id)?.eventDate;
const AMBIGUOUS = ['5/4/2023', '5/5/2023', '6/7/2023'];

describe('the helpers', () => {
  const sheet = (cells: Cell[]) => fileOf(['D'], cells.map((c) => [c])).sheets[0];
  it('an ambiguous cell has two parts of 1-12 that differ', () => {
    expect(['5/4/2023', '12-1-2023', '6/7/2023 10:00'].map(isAmbiguousDayMonth)).toEqual([true, true, true]);
    expect(['5/5/2023', '13/4/2023', '2023-04-05', 5, null, '0/5/2023'].map((c) => isAmbiguousDayMonth(c as never))).toEqual([false, false, false, false, false, false]);
  });
  it('columnOrder: the cells decide first, the declaration only where they decide nothing', () => {
    expect(columnOrder(sheet(['5/4/2023']), 0)).toBe('unknown');
    expect(columnOrder(sheet(['5/4/2023']), 0, 'mdy')).toBe('mdy');
    expect(columnOrder(sheet(['13/4/2023', '5/4/2023']), 0, 'mdy')).toBe('dmy');
  });
  it('declaredOrderStatus: applied, contradicted, redundant', () => {
    expect(declaredOrderStatus(sheet(['5/4/2023']), 0, 'dmy')).toBe('applied');
    expect(declaredOrderStatus(sheet(['13/4/2023']), 0, 'mdy')).toBe('contradicted');
    expect(declaredOrderStatus(sheet(['13/4/2023']), 0, 'dmy')).toBe('redundant');
    expect(declaredOrderStatus(sheet(['2023-04-05']), 0, 'dmy')).toBe('redundant');
  });
});

describe('an undeclared order blocks, and says which cells', () => {
  it('names the cells that no date decides, and does not call them unreadable', () => {
    const r = convert({ sheets: [input(AMBIGUOUS)] });
    const f = rule(r, 'CONV-DATE-ORDER-UNDECLARED');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ field: 'Date', value: '5/4/2023', severity: 'error', params: { count: 2, examples: '5/4/2023, 6/7/2023', index: 1 } });
    expect(rule(r, 'ROW-DATE-UNPARSEABLE')).toEqual([]);
    expect(r.ok).toBe(false);
    // 5/5/2023 is the same day either way, written as today
    expect(dateOf(r, 'S2')).toBe('2023-05-05');
    expect(renderConvertPlain(f[0], 'en')).toContain('Dates such as "5/4/2023" can be read as 5 April or as 4 May, and no date in column "Date" decides it (2 cells). Say which order the column uses.');
  });

  it('one that is decided by another cell is not asked about', () => {
    const r = convert({ sheets: [input(['5/4/2023', '13/4/2023'])] });
    expect(rule(r, 'CONV-DATE-ORDER-UNDECLARED')).toEqual([]);
    expect(dateOf(r, 'S1')).toBe('2023-04-05');
  });
});

describe('a declared order is used', () => {
  it('writes the date in that order and says so', () => {
    const r = convert({ sheets: [input(AMBIGUOUS, { dayMonthOrder: { 1: 'dmy' } })] });
    expect([dateOf(r, 'S1'), dateOf(r, 'S2'), dateOf(r, 'S3')]).toEqual(['2023-04-05', '2023-05-05', '2023-07-06']);
    const f = rule(r, 'CONV-DATE-ORDER-DECLARED');
    expect(f).toHaveLength(1);
    expect(f[0].params).toEqual({ order: 'dmy', index: 1 });
    expect(rule(r, 'CONV-DATE-ORDER-UNDECLARED')).toEqual([]);
    expect(rule(r, 'ROW-DATE-UNPARSEABLE')).toEqual([]);
    const mdy = convert({ sheets: [input(AMBIGUOUS, { dayMonthOrder: { 1: 'mdy' } })] });
    expect([dateOf(mdy, 'S1'), dateOf(mdy, 'S3')]).toEqual(['2023-05-04', '2023-06-07']);
  });

  it('a declaration that came from the companion file says so', () => {
    const r = convert({ sheets: [input(AMBIGUOUS, { dayMonthOrder: { 1: 'dmy' }, dayMonthOrderFromFile: [1] })] });
    expect(rule(r, 'CONV-DATE-ORDER-DECLARED')[0].params).toEqual({ order: 'dmy', index: 1, fromFile: 'yes' });
  });

  it('the date inside an ID of a picked key is the date that is written', () => {
    const file = fileOf(['Station', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'], AMBIGUOUS.map((d, i) => ['P1', d, 61.1, 4.2, TAX, 3 + i]));
    const edit: Record<string, ColumnRole> = { Station: { kind: 'station' }, Date: { kind: 'date' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' } };
    const make = (extra: Partial<ConvertSheetInput>) => sheetInput(file, { shape: 'long', quantity: { kind: 'count' }, edit, sampleKey: { columns: [0, 1] }, device: { kind: 'known', key: 'multinet' }, ...extra });
    const undeclared = convert({ sheets: [make({})] });
    // asked once, though the column is both the date and a key part (F10)
    expect(rule(undeclared, 'CONV-DATE-ORDER-UNDECLARED')).toHaveLength(1);
    const r = convert({ sheets: [make({ dayMonthOrder: { 1: 'dmy' } })] });
    const sampleIds = r.events.filter((e) => e.eventType === 'sample').map((e) => e.id);
    expect(sampleIds.some((id) => id.includes('2023-04-05'))).toBe(true);
    expect(sampleIds.some((id) => id.includes('2023-07-06'))).toBe(true);
    expect(sampleIds.some((id) => id.includes('2023-05-04'))).toBe(false);
    expect(r.events.filter((e) => e.eventType === 'sample').map((e) => e.eventDate).sort()).toEqual(['2023-04-05', '2023-05-05', '2023-07-06']);
  });

  it('a declaration against a column whose own dates say otherwise is said and not used', () => {
    const r = convert({ sheets: [input(['13/4/2023', '5/4/2023'], { dayMonthOrder: { 1: 'mdy' } })] });
    const f = rule(r, 'CONV-DATE-ORDER-CONTRADICTED');
    expect(f).toHaveLength(1);
    expect(f[0].params).toEqual({ declared: 'mdy', detected: 'dmy', index: 1 });
    expect(r.ok).toBe(false);
    expect([dateOf(r, 'S1'), dateOf(r, 'S2')]).toEqual(['2023-04-13', '2023-04-05']);
    expect(rule(r, 'CONV-DATE-ORDER-DECLARED')).toEqual([]);
  });

  it('a declaration that changes nothing is not said', () => {
    const r = convert({ sheets: [input(['13/4/2023', '5/4/2023'], { dayMonthOrder: { 1: 'dmy' } })] });
    expect(r.findings.filter((f) => f.ruleId.startsWith('CONV-DATE-ORDER-'))).toEqual([]);
  });
});

describe('only the cells no date decides lose their unparseable line', () => {
  it('13/13/2023 stays unreadable, with its own count and value', () => {
    const r = convert({ sheets: [input(['5/4/2023', '13/13/2023', '6/7/2023'])] });
    expect(rule(r, 'CONV-DATE-ORDER-UNDECLARED')[0].params).toMatchObject({ count: 2, examples: '5/4/2023, 6/7/2023' });
    const u = rule(r, 'ROW-DATE-UNPARSEABLE');
    expect(u).toHaveLength(1);
    expect(u[0]).toMatchObject({ field: 'Date', value: '13/13/2023', lines: [3], params: { count: 1 } });
  });
});

describe('the join', () => {
  const JOIN: SampleJoinRequestCore = { results: 0, description: 1, keys: [{ results: 0, description: 0 }], conflicts: [] };
  const run = (counts: Cell[][], samples: Cell[][], resultsExtra: Partial<ConvertSheetInput> = {}, descExtra: Partial<ConvertSheetInput> = {}, samplesHeader: Cell[] = ['Sample', 'Date', 'Latitude', 'Longitude'], countsHeader: Cell[] = ['Sample', 'Taxon', 'Count']) => {
    const file = xlsxFile('book.xlsx', { Counts: [countsHeader, ...counts], Samples: [samplesHeader, ...samples] });
    const out = joinInputs([resultsInput(file, 'Counts', resultsExtra), descriptionInput(file, 'Samples', descExtra)], [JOIN], []);
    return convert({ sheets: out.sheets });
  };

  it('a date written one way in the results and another in the description is no conflict once the order is declared', () => {
    const r = run([['X01', TAX, 3, '5/4/2023']], [['X01', '2023-04-05', 61.1, 4.2]], { dayMonthOrder: { 3: 'dmy' } }, {}, undefined, ['Sample', 'Taxon', 'Count', 'Date']);
    expect(rule(r, 'CONV-JOIN-CONFLICT')).toEqual([]);
    expect(dateOf(r, 'X01')).toBe('2023-04-05');
  });

  it('a date lent by the description is asked about on the description, with its own column index', () => {
    const counts: Cell[][] = [['X01', TAX, 3], ['X02', TAX, 4]];
    const samples: Cell[][] = [['X01', '5/4/2023', 61.1, 4.2], ['X02', '6/7/2023', 61.3, 4.6]];
    const r = run(counts, samples);
    const f = rule(r, 'CONV-DATE-ORDER-UNDECLARED');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ file: 'book.xlsx', sheet: 'Samples', field: 'Date', params: { count: 2, index: 1 } });
    expect(rule(r, 'ROW-DATE-UNPARSEABLE')).toEqual([]);

    const declared = run(counts, samples, {}, { dayMonthOrder: { 1: 'dmy' } });
    expect([dateOf(declared, 'X01'), dateOf(declared, 'X02')]).toEqual(['2023-04-05', '2023-07-06']);
    const d = rule(declared, 'CONV-DATE-ORDER-DECLARED');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ sheet: 'Samples', params: { order: 'dmy', index: 1 } });
    expect(rule(declared, 'CONV-DATE-ORDER-UNDECLARED')).toEqual([]);

    const fromFile = run(counts, samples, {}, { dayMonthOrder: { 1: 'dmy' }, dayMonthOrderFromFile: [1] });
    expect(rule(fromFile, 'CONV-DATE-ORDER-DECLARED')[0].params.fromFile).toBe('yes');
  });

  it('a description date that is compared with the results sheet\'s own date is asked about on the description (count: its own cells)', () => {
    const counts: Cell[][] = [['X01', TAX, 3, '2023-04-05'], ['X01', TAX, 4, '2023-04-05'], ['X02', TAX, 5, '2023-07-06']];
    const samples: Cell[][] = [['X01', '5/4/2023', 61.1, 4.2], ['X02', '6/7/2023', 61.3, 4.6]];
    const header: Cell[] = ['Sample', 'Taxon', 'Count', 'Date'];
    const r = run(counts, samples, {}, {}, undefined, header);
    const f = rule(r, 'CONV-DATE-ORDER-UNDECLARED');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ file: 'book.xlsx', sheet: 'Samples', field: 'Date', params: { count: 2, index: 1 } });
    const declared = run(counts, samples, {}, { dayMonthOrder: { 1: 'dmy' } }, undefined, header);
    expect(rule(declared, 'CONV-JOIN-CONFLICT')).toEqual([]);
    expect(rule(declared, 'CONV-DATE-ORDER-UNDECLARED')).toEqual([]);
    const d = rule(declared, 'CONV-DATE-ORDER-DECLARED');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ sheet: 'Samples', params: { order: 'dmy', index: 1 } });
  });

  it('a description date that is part of the join key is asked about on the description', () => {
    const counts: Cell[][] = [['X01', TAX, 3, '2023-04-05'], ['X02', TAX, 5, '2023-07-06']];
    const samples: Cell[][] = [['X01', '5/4/2023', 61.1, 4.2], ['X02', '6/7/2023', 61.3, 4.6]];
    const header: Cell[] = ['Sample', 'Taxon', 'Count', 'Date'];
    const keyed = (descExtra: Partial<ConvertSheetInput>) => {
      const file = xlsxFile('book.xlsx', { Counts: [header, ...counts], Samples: [['Sample', 'Date', 'Latitude', 'Longitude'], ...samples] });
      const join: SampleJoinRequestCore = { results: 0, description: 1, keys: [{ results: 0, description: 0 }, { results: 3, description: 1 }], conflicts: [] };
      return convert({ sheets: joinInputs([resultsInput(file, 'Counts'), descriptionInput(file, 'Samples', descExtra)], [join], []).sheets });
    };
    const f = rule(keyed({}), 'CONV-DATE-ORDER-UNDECLARED');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ sheet: 'Samples', params: { count: 2, index: 1 } });
    const declared = keyed({ dayMonthOrder: { 1: 'dmy' } });
    expect(rule(declared, 'CONV-JOIN-NO-MATCH')).toEqual([]);
    expect(rule(declared, 'CONV-DATE-ORDER-DECLARED')).toHaveLength(1);
  });

  it('the results sheet and the description have each their own order', () => {
    const r = run([['X01', TAX, 3, '5/4/2023']], [['X01', '4/5/2023', 61.1, 4.2]], { dayMonthOrder: { 3: 'dmy' } }, { dayMonthOrder: { 1: 'mdy' } }, undefined, ['Sample', 'Taxon', 'Count', 'Date']);
    expect(rule(r, 'CONV-JOIN-CONFLICT')).toEqual([]);
    expect(dateOf(r, 'X01')).toBe('2023-04-05');
  });
});

describe('/check and the readers without a declaration are unchanged', () => {
  it('metaParser without the option reads an ambiguous date as unreadable, as at the base', () => {
    const file = fileOf(HEADER, rowsOf(AMBIGUOUS));
    const sheet = file.sheets[0];
    const specs = specsOf(input(AMBIGUOUS).mapping);
    const c = new Collector(file.fileName);
    const parse = metaParser(file, sheet, specs, c);
    const metas = sheet.rows.map((r) => parse(r));
    expect(metas.map((m) => m.datetime?.iso)).toEqual([undefined, '2023-05-05', undefined]);
    const f = c.findings();
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ ruleId: 'ROW-DATE-UNPARSEABLE', lines: [2, 4], value: '5/4/2023, 6/7/2023' });
    const declared = metaParser(file, sheet, specs, new Collector(file.fileName), { dayMonthOrder: { 1: 'dmy' } });
    expect(sheet.rows.map((r) => declared(r).datetime?.iso)).toEqual(['2023-04-05', '2023-05-05', '2023-07-06']);
  });
});
