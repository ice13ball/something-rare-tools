// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Round 3, Task 17: one date or interval declared by the person for a sheet on which no sample has a date. Invented data only.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { joinInputs } from '../../src/core/convert/sampleJoin';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { ColumnRole } from '../../src/core/types';
import { exportSheets, objects, readBack } from './exportHelpers';
import type { Cell } from './helpers';
import { fileOf, sheetInput } from './helpers';
import { xlsxFile } from '../helpers/files';
import { descriptionInput, resultsInput } from './joinFixtures';

const LONG: Record<string, ColumnRole> = { Tank: { kind: 'sampleId' }, Taxon: { kind: 'taxon' }, Count: { kind: 'quantity' } };
const H = ['Tank', 'Taxon', 'Count', 'Latitude', 'Longitude'];
const R: Cell[][] = [
  ['T1', 'Calanus finmarchicus', 3, 55.1, 3.2],
  ['T2', 'Oithona similis', 1, 55.2, 3.3],
  ['T3', 'Calanus finmarchicus', 2, 55.3, 3.4],
];
const TODAY = '2026-11-18';
const OPTIONS = { today: TODAY };
const tanks = (declared?: string, extra: { header?: string[]; rows?: Cell[][]; input?: Partial<ConvertSheetInput> } = {}): ConvertSheetInput =>
  sheetInput(fileOf(extra.header ?? H, extra.rows ?? R, 'Tanks', { fileName: 'tanks.csv' }), {
    shape: 'long',
    quantity: { kind: 'count' },
    edit: LONG,
    ...(declared === undefined ? {} : { declaredDate: declared }),
    ...(extra.input ?? {}),
  });
const ids = <T extends { ruleId: string }>(fs: readonly T[], id: string): T[] => fs.filter((f) => f.ruleId === id);
const remark = (n: number, sheet = 'Tanks'): string => `eventDate declared by the person for all ${n} samples of sheet ${sheet}; not in the source file`;
const samples = (r: ReturnType<typeof convert>) => r.events.filter((e) => e.eventType === 'sample');

describe('a declared date', () => {
  it('is written on every sample of a sheet with no date, with the eventRemarks that says so, and replaces CONV-EVENT-DATE-MISSING', () => {
    const r = convert({ sheets: [tanks('2021-05')], options: OPTIONS });
    expect(samples(r)).toHaveLength(3);
    for (const e of samples(r)) {
      expect(e.eventDate).toBe('2021-05');
      expect(e.eventRemarks).toBe(remark(3));
    }
    const d = ids(r.findings, 'CONV-DATE-DECLARED');
    expect(d).toHaveLength(1);
    expect(d[0].params).toMatchObject({ value: '2021-05', count: 3 });
    expect(d[0].params.long).toBeUndefined();
    expect(renderConvertPlain(d[0], 'en')).toContain('2021-05');
    expect(ids(r.findings, 'CONV-EVENT-DATE-MISSING')).toEqual([]);
    expect(ids(r.findings, 'CONV-DATE-DECLARED-INVALID')).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('puts the same note in the methods text', () => {
    const r = convert({ sheets: [tanks('2021-05')], options: OPTIONS });
    expect(r.methodSteps.some((s) => s.includes('Sheet Tanks of tanks.csv') && s.includes('2021-05') && s.includes('declared by the person'))).toBe(true);
  });

  it('reaches event.txt as eventDate and eventRemarks', async () => {
    const e = await exportSheets([tanks('2021-05-17')]);
    const b = await readBack(e.zip);
    const rows = objects(b.tables['event.txt']).filter((x) => x.eventType === 'sample');
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.eventDate).toBe('2021-05-17');
      expect(row.eventRemarks).toBe(remark(3));
    }
  });

  it('accepts a year, a day and an interval; a long interval is accepted and says so', () => {
    for (const v of ['2021', '2021-05-17', '2021-05-01/2021-05-30']) {
      const r = convert({ sheets: [tanks(v)], options: OPTIONS });
      expect(samples(r).every((e) => e.eventDate === v), v).toBe(true);
      expect(ids(r.findings, 'CONV-DATE-DECLARED')[0].params.long, v).toBeUndefined();
    }
    const r = convert({ sheets: [tanks('2020-01-01/2021-12-31')], options: OPTIONS });
    expect(samples(r).every((e) => e.eventDate === '2020-01-01/2021-12-31')).toBe(true);
    const d = ids(r.findings, 'CONV-DATE-DECLARED');
    expect(d).toHaveLength(1);
    expect(d[0].params.long).toBe('yes');
    expect(renderConvertPlain(d[0], 'en')).toContain('longer than a year');
    expect(r.ok).toBe(true);
  });

  it('is refused with the reason and the typed text when it is not ISO, out of order or in the future, and nothing is applied', () => {
    const cases: [string, string][] = [['2021-13', 'format'], ['21/5/2021', 'format'], ['2022/2021', 'order'], ['2030', 'future'], ['2026-12-01', 'future']];
    for (const [typed, reason] of cases) {
      const r = convert({ sheets: [tanks(typed)], options: OPTIONS });
      const f = ids(r.findings, 'CONV-DATE-DECLARED-INVALID');
      expect(f, typed).toHaveLength(1);
      expect(f[0].params.reason, typed).toBe(reason);
      expect(f[0].value, typed).toBe(typed);
      expect(renderConvertPlain(f[0], 'en')).toContain(typed);
      expect(ids(r.findings, 'CONV-DATE-DECLARED')).toEqual([]);
      expect(samples(r).every((e) => e.eventDate === undefined && e.eventRemarks === undefined)).toBe(true);
      expect(r.ok, typed).toBe(false);
    }
  });

  it('is applied when the sheet has a date column that is blank in every row', () => {
    const rows: Cell[][] = R.map((x) => [...x, null]);
    const r = convert({ sheets: [tanks('2021', { header: [...H, 'Date'], rows })], options: OPTIONS });
    expect(samples(r).every((e) => e.eventDate === '2021')).toBe(true);
    expect(ids(r.findings, 'CONV-DATE-DECLARED')).toHaveLength(1);
  });

  it('is refused on a sheet where some samples have a date, and the leave-out answer stays offered', () => {
    const rows: Cell[][] = R.map((x, i) => [...x, i === 0 ? '2023-04-05' : null]);
    const r = convert({ sheets: [tanks('2021-05', { header: [...H, 'Date'], rows })], options: OPTIONS });
    const f = ids(r.findings, 'CONV-DATE-DECLARED-INVALID');
    expect(f).toHaveLength(1);
    expect(f[0].params.reason).toBe('some-dated');
    expect(renderConvertPlain(f[0], 'en')).toContain('some samples');
    expect(ids(r.findings, 'CONV-DATE-DECLARED')).toEqual([]);
    const missing = ids(r.findings, 'CONV-EVENT-DATE-MISSING');
    expect(missing).toHaveLength(1);
    expect(missing[0].params).toMatchObject({ count: 2, how: 'blank-cells' });
    expect(samples(r).map((e) => e.eventDate)).toEqual(['2023-04-05', undefined, undefined]);
    expect(r.events.every((e) => e.eventRemarks === undefined)).toBe(true);
    const left = convert({ sheets: [tanks('2021-05', { header: [...H, 'Date'], rows, input: { leaveOut: [{ reason: 'no-event-date', count: 2 }] } })], options: OPTIONS });
    expect(ids(left.findings, 'CONV-ROW-LEFT-OUT')[0].params).toMatchObject({ reason: 'no-event-date', count: 2 });
  });

  it('is refused on a sheet where a date cell holds something unreadable', () => {
    const rows: Cell[][] = R.map((x, i) => [...x, i === 0 ? 'sometime' : null]);
    const r = convert({ sheets: [tanks('2021-05', { header: [...H, 'Date'], rows })], options: OPTIONS });
    expect(ids(r.findings, 'CONV-DATE-DECLARED-INVALID').map((f) => f.params.reason)).toEqual(['some-dated']);
    expect(samples(r).every((e) => e.eventDate === undefined)).toBe(true);
  });

  it('is refused on a sheet whose date comes from a joined description sheet', () => {
    const file = xlsxFile('book.xlsx', {
      Fish: [['Sample', 'Taxon', 'Count'], ['T1', 'Gadus morhua', 2], ['T2', 'Gadus morhua', 4]],
      Samples: [['Sample', 'Date', 'Latitude', 'Longitude'], ['T1', null, 61.1, 4.2], ['T2', null, 61.3, 4.6]],
    });
    const out = joinInputs([resultsInput(file, 'Fish', { declaredDate: '2021-05' }), descriptionInput(file, 'Samples')], [{ results: 0, description: 1, keys: [{ results: 0, description: 0 }], conflicts: [] }], []);
    const r = convert({ sheets: out.sheets, options: OPTIONS });
    const f = ids(r.findings, 'CONV-DATE-DECLARED-INVALID');
    expect(f.map((x) => x.params.reason)).toEqual(['date-joined']);
    expect(renderConvertPlain(f[0], 'en')).toContain('Samples');
    expect(ids(r.findings, 'CONV-DATE-DECLARED')).toEqual([]);
    expect(ids(r.findings, 'CONV-EVENT-DATE-MISSING')).toHaveLength(1);
    expect(samples(r).every((e) => e.eventDate === undefined)).toBe(true);
  });

  it('is applied on a joined sheet when no sheet of the pair has a date column', () => {
    const file = xlsxFile('book.xlsx', {
      Fish: [['Sample', 'Taxon', 'Count'], ['T1', 'Gadus morhua', 2], ['T2', 'Gadus morhua', 4]],
      Samples: [['Sample', 'Latitude', 'Longitude'], ['T1', 61.1, 4.2], ['T2', 61.3, 4.6]],
    });
    const out = joinInputs([resultsInput(file, 'Fish', { declaredDate: '2021-05' }), descriptionInput(file, 'Samples')], [{ results: 0, description: 1, keys: [{ results: 0, description: 0 }], conflicts: [] }], []);
    const r = convert({ sheets: out.sheets, options: OPTIONS });
    expect(ids(r.findings, 'CONV-DATE-DECLARED')).toHaveLength(1);
    expect(samples(r).every((e) => e.eventDate === '2021-05')).toBe(true);
  });

  it('is refused on a profile sheet', () => {
    const sin = sheetInput(fileOf(['Cast', 'Date', 'Depth [m]'], [['C1', null, 5]], 'CTD', { fileName: 'ctd.csv' }), { profile: { depthIds: true }, declaredDate: '2021-05' });
    const r = convert({ sheets: [sin], options: OPTIONS });
    expect(ids(r.findings, 'CONV-DATE-DECLARED-INVALID').map((f) => f.params.reason)).toEqual(['profile']);
  });

  it('is said as coming from the companion file', () => {
    const r = convert({ sheets: [tanks('2021-05', { input: { declaredDateFromFile: true } })], options: OPTIONS });
    const d = ids(r.findings, 'CONV-DATE-DECLARED')[0];
    expect(d.params.fromFile).toBe('yes');
    expect(renderConvertPlain(d, 'en')).toContain('companion file');
  });

  it('makes a station date derived from declared dates carry a remark of its own', () => {
    const rows: Cell[][] = R.map((x) => [...x, 'S1']);
    const r = convert({ sheets: [tanks('2021-05', { header: [...H, 'Station'], rows, input: { edit: { ...LONG, Station: { kind: 'station' } } } as never })], options: OPTIONS });
    const st = r.events.find((x) => x.eventType === 'station');
    expect(st?.eventDate).toBe('2021-05');
    expect(st?.eventRemarks).toContain('declared');
    expect(st?.eventRemarks).not.toBe(remark(3));
  });

  it('changes nothing for a sheet without a declaration: the Event table has no eventRemarks column', async () => {
    const e = await exportSheets([tanks(undefined, { header: [...H, 'Date'], rows: R.map((x) => [...x, '2023-04-05']) })]);
    const b = await readBack(e.zip);
    expect(b.tables['event.txt'].header).not.toContain('eventRemarks');
  });

  it('CONV-EVENT-DATE-MISSING says "whole" only when no sample has a date and none could come from elsewhere', () => {
    const whole = (r: ReturnType<typeof convert>) => ids(r.findings, 'CONV-EVENT-DATE-MISSING').map((f) => f.params.whole);
    expect(whole(convert({ sheets: [tanks()], options: OPTIONS }))).toEqual(['yes']);
    expect(whole(convert({ sheets: [tanks(undefined, { header: [...H, 'Date'], rows: R.map((x) => [...x, null]) })], options: OPTIONS }))).toEqual(['yes']);
    expect(whole(convert({ sheets: [tanks(undefined, { header: [...H, 'Date'], rows: R.map((x, i) => [...x, i === 0 ? '2023-04-05' : null]) })], options: OPTIONS }))).toEqual([undefined]);
    expect(whole(convert({ sheets: [tanks(undefined, { header: [...H, 'Date'], rows: R.map((x, i) => [...x, i === 0 ? 'sometime' : null]) })], options: OPTIONS }))).toEqual([undefined]);
    const file = xlsxFile('book.xlsx', {
      Fish: [['Sample', 'Taxon', 'Count'], ['T1', 'Gadus morhua', 2]],
      Samples: [['Sample', 'Date', 'Latitude', 'Longitude'], ['T1', null, 61.1, 4.2]],
    });
    const out = joinInputs([resultsInput(file, 'Fish'), descriptionInput(file, 'Samples')], [{ results: 0, description: 1, keys: [{ results: 0, description: 0 }], conflicts: [] }], []);
    expect(whole(convert({ sheets: out.sheets, options: OPTIONS }))).toEqual([undefined]);
  });
});
