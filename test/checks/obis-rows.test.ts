// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// ROW-ZERO-COORD, ROW-DEPTH-RANGE (depth conventions), ROW-DATE-FUTURE (today handed in) on in-memory datasets.
import { describe, expect, it } from 'vitest';
import { checkRows } from '../../src/core/checks/rows';
import { parseDate, utcDayOf } from '../../src/core/values/dates';
import type { DataRow, Dataset, Finding, ParsedDate } from '../../src/core/types';
import { dataset, row } from './rows.helpers';

const only = (fs: Finding[], id: string): Finding[] => fs.filter((f) => f.ruleId === id);
const TODAY = '2026-10-24';
const parsed = (raw: string): ParsedDate => {
  const d = parseDate(raw, { date1904: false, dateFormatted: false });
  if ('error' in d) throw new Error(`test date ${raw} does not parse`);
  return d;
};
const dated = (line: number, raw: string): DataRow => ({ ...row({ line, lat: 60.5, lon: 5.25 }), datetime: parsed(raw), dateRaw: raw });
const futureLines = (raws: string[], today = TODAY): number[] => only(checkRows(dataset(raws.map((r, i) => dated(i + 2, r))), { today }), 'ROW-DATE-FUTURE').flatMap((f) => f.lines ?? []);

describe('ROW-ZERO-COORD', () => {
  it('flags (0, 0) as an error with its rows, and not as latitude = longitude', () => {
    const ds = dataset([row({ line: 2, lat: 60.5, lon: 5.25 }), row({ line: 3, lat: 0, lon: 0, latDecimals: 0, lonDecimals: 0 }), row({ line: 4, lat: 0, lon: 0 }), row({ line: 5, lat: 7.5, lon: 7.5 })]);
    const f = checkRows(ds);
    expect(only(f, 'ROW-ZERO-COORD')).toHaveLength(1);
    expect(only(f, 'ROW-ZERO-COORD')[0]).toMatchObject({ severity: 'error', lines: [3, 4] });
    expect(only(f, 'ROW-LAT-EQ-LON').flatMap((x) => x.lines ?? [])).toEqual([5]);
  });

  it('a zero in one coordinate only is not (0, 0)', () => {
    const f = checkRows(dataset([row({ line: 2, lat: 0, lon: 5.25 }), row({ line: 3, lat: 60.5, lon: 0 }), row({ line: 4, lat: 60.5, lon: 5.25 })]));
    expect(only(f, 'ROW-ZERO-COORD')).toEqual([]);
  });

  it('adds nothing to station checks: a (0, 0) row is not another position of its station', () => {
    const ds = dataset([row({ line: 2, lat: 60.5, lon: 5.25, station: 'A' }), row({ line: 3, lat: 0, lon: 0, station: 'A' }), row({ line: 4, lat: 60.5, lon: 5.25, station: 'A' })]);
    const f = checkRows(ds);
    expect(f.map((x) => x.ruleId)).toEqual(['ROW-ZERO-COORD']);
  });
});

describe('ROW-DEPTH-RANGE: the bounds of obis-qc, positive down, in metres', () => {
  const depths = (vs: number[], extra: Partial<Dataset> = {}): Dataset => dataset(vs.map((depth, i) => row({ line: i + 2, depth })), extra);

  it('-100000 and 11000 are inside, the next step out is not', () => {
    const f = only(checkRows(depths([-100000, 0, 5000, 11000, 11000.1, -100000.1])), 'ROW-DEPTH-RANGE');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', lines: [6, 7], value: '11000.1' });
  });

  it('a declared upward convention is judged after its sign is turned', () => {
    const up = { depthPositive: 'up' as const, mappings: [{ sheet: 'a.csv', columns: [{ index: 0, header: 'elevation', role: { kind: 'depth' as const, positive: 'up' as const, unit: 'm' } }] }] };
    // positive up: -5000 means 5000 m deep (fine), -12000 means 12000 m deep (out), +200 means 200 m above the surface (fine)
    const f = only(checkRows(depths([-5000, -12000, 200], up)), 'ROW-DEPTH-RANGE');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([3]);
    // a negative value of that convention is never an error by itself
    expect(only(checkRows(depths([-1, -10, -3000], up)), 'ROW-DEPTH-RANGE')).toEqual([]);
  });

  it('a column in another unit is not judged against metres', () => {
    const cm = { mappings: [{ sheet: 'a.csv', columns: [{ index: 0, header: 'depth', role: { kind: 'depth' as const, positive: 'down' as const, unit: 'cm' } }] }] };
    expect(only(checkRows(depths([500000], cm)), 'ROW-DEPTH-RANGE')).toEqual([]);
    const m = { mappings: [{ sheet: 'a.csv', columns: [{ index: 0, header: 'depth', role: { kind: 'depth' as const, positive: 'down' as const, unit: 'm' } }] }] };
    expect(only(checkRows(depths([500000], m)), 'ROW-DEPTH-RANGE')).toHaveLength(1);
  });

  it('Darwin Core bounds are judged each on its own and ROW-DEPTH-SIGN is not involved', () => {
    const r = (line: number, depthMin: number, depthMax: number): DataRow => ({ ...row({ line }), depthMin, depthMax });
    const f = only(checkRows(dataset([r(2, 1, 5), r(3, -1, 12000)])), 'ROW-DEPTH-RANGE');
    expect(f.map((x) => [x.field, x.lines])).toEqual([['maximumDepthInMeters', [3]]]);
  });
});

describe('ROW-DATE-FUTURE: a UTC calendar day against today, today handed in', () => {
  it('a date equal to today is not in the future, the next day is, the day before is not', () => {
    expect(futureLines(['2026-10-23', '2026-10-24', '2026-10-25'])).toEqual([4]);
  });

  it('an interval counts by its END, a start in the past does not save it', () => {
    expect(futureLines(['2026-10-01/2026-10-24', '2026-10-01/2026-10-25', '2027-01-01/2027-01-02'])).toEqual([3, 4]);
    expect(futureLines(['2026-10-20/25'])).toEqual([2]);
  });

  it('a year or month counts by its first day: the current year and month are not in the future', () => {
    expect(futureLines(['2026', '2026-10', '2026-11', '2027'])).toEqual([4, 5]);
    expect(futureLines(['2025-12/2026-10', '2025-12/2026-11'])).toEqual([3]);
  });

  it('a zone in the value is applied: late evening west of Greenwich is already tomorrow in UTC', () => {
    // 2026-10-24T22:00-05:00 is 2026-10-25T03:00Z; 2026-10-25T01:00+05:00 is 2026-10-24T20:00Z
    expect(futureLines(['2026-10-24T22:00-05:00', '2026-10-25T01:00+05:00', '2026-10-24T23:59:59Z'])).toEqual([2]);
  });

  it('a time without a zone is read as UTC, like the rest of the tool reads it', () => {
    expect(futureLines(['2026-10-24T23:59', '2026-10-25T00:00'])).toEqual([3]);
  });

  it('utcDayOf', () => {
    expect(utcDayOf(parsed('2026'))).toBe('2026-01-01');
    expect(utcDayOf(parsed('2026-10'))).toBe('2026-10-01');
    expect(utcDayOf(parsed('2026-10-24T22:00-05:00'))).toBe('2026-10-25');
    expect(utcDayOf(parsed('2026-10-24T22:00Z'))).toBe('2026-10-24');
  });

  it('without a today the rule does not run: the checks never read the clock themselves', () => {
    expect(only(checkRows(dataset([dated(2, '2099-01-01')])), 'ROW-DATE-FUTURE')).toEqual([]);
    expect(only(checkRows(dataset([dated(2, '2099-01-01')]), { today: TODAY }), 'ROW-DATE-FUTURE')).toHaveLength(1);
  });

  it('a YY-MM-DD date is left to ROW-DATE-YYMMDD, which names the century it chose', () => {
    const d: DataRow = { ...row({ line: 2, lat: 60.5, lon: 5.25 }), datetime: { iso: '2027-01-01', year: 2027, precision: 'day', tz: 'unknown', ambiguity: 'yy-mm-dd' }, dateRaw: '27-01-01' };
    expect(only(checkRows(dataset([d]), { today: TODAY }), 'ROW-DATE-FUTURE')).toEqual([]);
  });

  it('reports the first value as written, the lines, and the column', () => {
    const f = only(checkRows(dataset([dated(2, '2099-05-02'), dated(3, '2098-01-01')]), { today: TODAY }), 'ROW-DATE-FUTURE');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', lines: [2, 3], value: '2099-05-02' });
  });
});
