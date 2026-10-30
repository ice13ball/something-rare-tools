// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import type { ParsedDate } from '../../src/core/types';
import { combineDateTime, detectDayMonthOrder, excelSerialToDate, parseDate, cellsAreYearRanges, parseTimeCell, parseTimeOfDay } from '../../src/core/values/dates';

const OPTS = { date1904: false, dateFormatted: false };
const ok = (raw: string | number | null, opts: { date1904?: boolean; dateFormatted?: boolean; currentYear?: number; order?: 'dmy' | 'mdy' | 'conflict' } = {}): ParsedDate => {
  const r = parseDate(raw, { ...OPTS, ...opts });
  if ('error' in r) throw new Error(`expected a date for ${String(raw)}`);
  return r;
};
const bad = (raw: string | number | null, opts: { date1904?: boolean; dateFormatted?: boolean; order?: 'dmy' | 'mdy' | 'conflict' } = {}) => {
  const r = parseDate(raw, { ...OPTS, ...opts });
  if (!('error' in r)) throw new Error(`expected error for ${String(raw)}, got ${r.iso}`);
  return r;
};

describe('excelSerialToDate', () => {
  it('1900 system', () => {
    expect(excelSerialToDate(45000, false)).toEqual({ iso: '2023-03-15', year: 2023, precision: 'day', tz: 'unknown' });
  });
  it('1904 system shifts by 1462 days', () => {
    expect(excelSerialToDate(45000 - 1462, true).iso).toBe('2023-03-15');
    expect(excelSerialToDate(0, true).iso).toBe('1904-01-01');
  });
  it('1900 system epoch is 1899-12-30', () => {
    expect(excelSerialToDate(1, false).iso).toBe('1899-12-31');
    expect(excelSerialToDate(61, false).iso).toBe('1900-03-01');
  });
  it('fraction gives minute precision when seconds are zero', () => {
    expect(excelSerialToDate(45000.4375, false)).toEqual({ iso: '2023-03-15T10:30', year: 2023, precision: 'minute', tz: 'unknown' });
  });
  it('fraction gives second precision otherwise', () => {
    // 10:30:15
    const r = excelSerialToDate(45000 + (10 * 3600 + 30 * 60 + 15) / 86400, false);
    expect(r.iso).toBe('2023-03-15T10:30:15');
    expect(r.precision).toBe('second');
  });
  it('float noise in the fraction does not produce phantom seconds', () => {
    expect(excelSerialToDate(45000.1, false).iso).toBe('2023-03-15T02:24');
  });
  it('a fraction that rounds up to midnight carries to the next day', () => {
    const r = excelSerialToDate(45000 + 86399.9999 / 86400, false);
    expect(r.iso).toBe('2023-03-16');
    expect(r.precision).toBe('day');
  });
  it('no local timezone drift: the result does not depend on process TZ', () => {
    const prev = process.env.TZ;
    try {
      for (const tz of ['Pacific/Kiritimati', 'America/Los_Angeles', 'UTC']) {
        process.env.TZ = tz;
        expect(excelSerialToDate(45000, false).iso).toBe('2023-03-15');
        expect(ok('2021-07-25').iso).toBe('2021-07-25');
      }
    } finally {
      if (prev === undefined) delete process.env.TZ;
      else process.env.TZ = prev;
    }
  });
  it('spring-forward day is intact', () => {
    // 2023-03-26 is a European DST date: serial 45011
    expect(excelSerialToDate(45011, false).iso).toBe('2023-03-26');
    expect(excelSerialToDate(45012, false).iso).toBe('2023-03-27');
  });
  it('throws on non-finite or absurd serials', () => {
    expect(() => excelSerialToDate(NaN, false)).toThrow(RangeError);
    expect(() => excelSerialToDate(1e12, false)).toThrow(RangeError);
  });
});

describe('parseDate: numbers', () => {
  it('number + dateFormatted:true -> serial', () => {
    expect(ok(45000, { dateFormatted: true }).iso).toBe('2023-03-15');
    expect(ok(45000 - 1462, { dateFormatted: true, date1904: true }).iso).toBe('2023-03-15');
    expect(ok(45000.5, { dateFormatted: true }).iso).toBe('2023-03-15T12:00');
  });
  it('number + dateFormatted:false is never guessed', () => {
    expect(bad(45000)).toEqual({ error: 'unparseable', raw: '45000' });
    expect(bad(2021).error).toBe('unparseable');
    expect(bad(20210725).error).toBe('unparseable');
  });
  it('absurd serials are unparseable, not thrown', () => {
    expect(bad(NaN, { dateFormatted: true }).error).toBe('unparseable');
    expect(bad(1e12, { dateFormatted: true }).error).toBe('unparseable');
    expect(bad(-5, { dateFormatted: true }).error).toBe('unparseable');
  });
  it('a numeric string is not a serial', () => {
    expect(bad('45000', { dateFormatted: true }).error).toBe('unparseable');
    expect(bad('45000').error).toBe('unparseable');
  });
  it('null and blank', () => {
    expect(bad(null)).toEqual({ error: 'unparseable', raw: '' });
    expect(bad('   ').error).toBe('unparseable');
  });
});

describe('parseDate: ISO 8601', () => {
  it('date only', () => {
    expect(ok('2021-07-25')).toEqual({ iso: '2021-07-25', year: 2021, precision: 'day', tz: 'unknown' });
    expect(ok('  2021-07-25  ').iso).toBe('2021-07-25');
  });
  it('month and year', () => {
    expect(ok('2021-07')).toEqual({ iso: '2021-07', year: 2021, precision: 'month', tz: 'unknown' });
    expect(ok('2021')).toEqual({ iso: '2021', year: 2021, precision: 'year', tz: 'unknown' });
  });
  it('datetime, minute and second precision', () => {
    expect(ok('2021-07-25T10:30')).toEqual({ iso: '2021-07-25T10:30', year: 2021, precision: 'minute', tz: 'unknown' });
    expect(ok('2021-07-25 10:30')).toMatchObject({ iso: '2021-07-25T10:30', precision: 'minute' });
    expect(ok('2021-07-25T10:30:15')).toMatchObject({ iso: '2021-07-25T10:30:15', precision: 'second', tz: 'unknown' });
  });
  it('Z means utc, offset means offset (kept, not converted)', () => {
    expect(ok('2021-07-25T10:00:00Z')).toMatchObject({ iso: '2021-07-25T10:00:00Z', tz: 'utc', precision: 'second' });
    expect(ok('2021-07-25T10:00Z')).toMatchObject({ iso: '2021-07-25T10:00Z', tz: 'utc', precision: 'minute' });
    expect(ok('2021-07-25T10:00:00+02:00')).toMatchObject({ iso: '2021-07-25T10:00:00+02:00', tz: 'offset' });
    expect(ok('2021-07-25T23:30:00-0500')).toMatchObject({ iso: '2021-07-25T23:30:00-05:00', tz: 'offset' });
    expect(ok('2021-07-25T10:00:00+02')).toMatchObject({ iso: '2021-07-25T10:00:00+02:00', tz: 'offset' });
  });
  it('fractional seconds are kept', () => {
    expect(ok('2021-07-25T10:00:00.250Z')).toMatchObject({ iso: '2021-07-25T10:00:00.250Z', precision: 'second' });
  });
  it('plain ISO date is unambiguous (no ambiguity key)', () => {
    expect('ambiguity' in ok('2021-07-25')).toBe(false);
  });
  it('calendar validation', () => {
    expect(bad('2021-02-30').error).toBe('unparseable');
    expect(bad('2021-02-29').error).toBe('unparseable');
    expect(ok('2020-02-29').iso).toBe('2020-02-29');
    expect(ok('2000-02-29').iso).toBe('2000-02-29');
    expect(bad('1900-02-29').error).toBe('unparseable');
    expect(bad('2021-13-01').error).toBe('unparseable');
    expect(bad('2021-00-10').error).toBe('unparseable');
    expect(bad('2021-04-31').error).toBe('unparseable');
    expect(bad('2021-07-25T25:00').error).toBe('unparseable');
    expect(bad('2021-07-25T10:60').error).toBe('unparseable');
    expect(bad('2021-07-25T10:00:60').error).toBe('unparseable');
    expect(bad('2021-07-25T24:00').error).toBe('unparseable');
  });
  it('garbage', () => {
    for (const t of ['yesterday', '2021-7-5', '2021-07-25T', '2021-07-25Z', '25 July 2021', '2021-07-25T10']) {
      expect(bad(t).error).toBe('unparseable');
    }
    expect(bad('yesterday').raw).toBe('yesterday');
  });
});

describe('parseDate: YY-MM-DD', () => {
  it('21-07-25 -> 2021 with the ambiguity flag', () => {
    expect(ok('21-07-25', { currentYear: 2026 })).toEqual({ iso: '2021-07-25', year: 2021, precision: 'day', tz: 'unknown', ambiguity: 'yy-mm-dd' });
  });
  it('pivot: YY <= current two-digit year + 1 -> 20YY, else 19YY', () => {
    expect(ok('27-01-01', { currentYear: 2026 }).year).toBe(2027);
    expect(ok('28-01-01', { currentYear: 2026 }).year).toBe(1928);
    expect(ok('99-12-31', { currentYear: 2026 }).year).toBe(1999);
    expect(ok('00-01-01', { currentYear: 2026 }).year).toBe(2000);
    expect(ok('00-01-01', { currentYear: 2099 }).year).toBe(2000);
  });
  it('defaults to the real current year', () => {
    const yy = new Date().getUTCFullYear() % 100;
    const r = ok(String(yy).padStart(2, '0') + '-01-01');
    expect(r.year).toBe(new Date().getUTCFullYear());
    expect(r.ambiguity).toBe('yy-mm-dd');
  });
  it('is calendar-validated', () => {
    expect(bad('21-02-30').error).toBe('unparseable');
    expect(ok('20-02-29', { currentYear: 2026 }).iso).toBe('2020-02-29');
    expect(bad('21-13-01').error).toBe('unparseable');
  });
  it('only the exact two-digit dash form', () => {
    expect(bad('21-7-25').error).toBe('unparseable');
    expect(bad('21/07/25').error).toBe('unparseable');
    expect(bad('21.07.25').error).toBe('unparseable');
  });
});

describe('parseDate: DD.MM.YYYY and slashes', () => {
  it('DD.MM.YYYY', () => {
    expect(ok('25.07.2021')).toEqual({ iso: '2021-07-25', year: 2021, precision: 'day', tz: 'unknown' });
    expect(ok('3.4.2021').iso).toBe('2021-04-03');
    expect(ok('03.04.2021').iso).toBe('2021-04-03'); // dotted is day-first, never ambiguous
  });
  it('DD.MM.YYYY HH:MM', () => {
    expect(ok('25.07.2021 10:30')).toMatchObject({ iso: '2021-07-25T10:30', precision: 'minute' });
  });
  it('calendar validation', () => {
    expect(bad('30.02.2021').error).toBe('unparseable');
    expect(bad('31.04.2021').error).toBe('unparseable');
  });
  it('slash: day > 12 disambiguates DD/MM/YYYY', () => {
    expect(ok('25/07/2021').iso).toBe('2021-07-25');
  });
  it('slash: month-first when the second part > 12', () => {
    expect(ok('07/25/2021').iso).toBe('2021-07-25');
  });
  it('slash: ambiguous D/M is an error', () => {
    expect(bad('03/04/2021')).toEqual({ error: 'unparseable', raw: '03/04/2021' });
  });
  it('slash: both parts > 12 is an error, and invalid calendar days too', () => {
    expect(bad('25/26/2021').error).toBe('unparseable');
    expect(bad('31/04/2021').error).toBe('unparseable');
    expect(bad('30/02/2021').error).toBe('unparseable');
  });
  it('slash with identical parts is unambiguous', () => {
    expect(ok('05/05/2021').iso).toBe('2021-05-05');
  });
  it('dashes behave like slashes for D-M-YYYY', () => {
    expect(ok('25-07-2021').iso).toBe('2021-07-25');
    expect(bad('03-04-2021').error).toBe('unparseable');
  });
});

describe('parseDate: day/month order decided per column', () => {
  const dmy = { order: 'dmy' as const };
  const mdy = { order: 'mdy' as const };
  it("order 'dmy' reads an ambiguous D/M/Y day-first, with slashes and dashes", () => {
    expect(ok('03/04/2021', dmy).iso).toBe('2021-04-03');
    expect(ok('03-04-2021 10:30', dmy).iso).toBe('2021-04-03T10:30');
  });
  it("order 'mdy' reads an ambiguous D/M/Y month-first", () => {
    expect(ok('03/04/2021', mdy).iso).toBe('2021-03-04');
  });
  it("order 'conflict' leaves every differing-part slash date unparseable, even an unambiguous one", () => {
    expect(bad('03/04/2021', { order: 'conflict' }).error).toBe('unparseable');
    expect(bad('25/07/2021', { order: 'conflict' }).error).toBe('unparseable');
    expect(bad('07/25/2021', { order: 'conflict' }).error).toBe('unparseable');
    expect(ok('05/05/2021', { order: 'conflict' }).iso).toBe('2021-05-05');
  });
  it('an order never changes DD.MM.YYYY, ISO or invalid calendar days', () => {
    expect(ok('03.04.2021', mdy).iso).toBe('2021-04-03');
    expect(ok('2021-03-04', mdy).iso).toBe('2021-03-04');
    expect(bad('31/04/2021', dmy).error).toBe('unparseable');
  });
});

describe('detectDayMonthOrder', () => {
  it("'dmy' when some cell is unambiguous day-first and none is month-first", () => {
    expect(detectDayMonthOrder(['25/07/2021', '03/04/2021', null, 'x'])).toBe('dmy');
  });
  it("'mdy' when some cell is unambiguous month-first and none is day-first", () => {
    expect(detectDayMonthOrder(['07/25/2021', '03-04-2021'])).toBe('mdy');
  });
  it("'conflict' when both kinds occur", () => {
    expect(detectDayMonthOrder(['25/07/2021', '07/25/2021', '03/04/2021'])).toBe('conflict');
  });
  it("'unknown' when no cell is unambiguous (also for identical parts, ISO, numbers and empty input)", () => {
    expect(detectDayMonthOrder(['03/04/2021', '05/05/2021', '2021-07-25', 12.5])).toBe('unknown');
    expect(detectDayMonthOrder([])).toBe('unknown');
  });
});

describe('parseDate: year only', () => {
  it('string of 4 digits with dateFormatted false is a year', () => {
    expect(ok('2021')).toEqual({ iso: '2021', year: 2021, precision: 'year', tz: 'unknown' });
  });
  it('not with dateFormatted true', () => {
    expect(bad('2021', { dateFormatted: true }).error).toBe('unparseable');
  });
  it('not a number', () => {
    expect(bad(2021).error).toBe('unparseable');
  });
  it('not 3 or 5 digits', () => {
    expect(bad('202').error).toBe('unparseable');
    expect(bad('20211').error).toBe('unparseable');
    expect(bad('0000').error).toBe('unparseable');
  });
});

describe('parseTimeOfDay / combineDateTime', () => {
  const day = (): ParsedDate => ok('2021-07-25');
  it('parseTimeOfDay strings and day fractions', () => {
    expect(parseTimeOfDay('10:30')).toEqual({ hh: 10, mm: 30, tz: 'unknown', text: '10:30' });
    expect(parseTimeOfDay('10:30:05')).toMatchObject({ hh: 10, mm: 30, ss: 5, text: '10:30:05' });
    expect(parseTimeOfDay('7:05')).toMatchObject({ hh: 7, text: '07:05' });
    expect(parseTimeOfDay('10:30Z')).toMatchObject({ tz: 'utc', text: '10:30Z' });
    expect(parseTimeOfDay(0.4375)).toMatchObject({ hh: 10, mm: 30, text: '10:30' });
    expect(parseTimeOfDay(0)).toMatchObject({ hh: 0, mm: 0, text: '00:00' });
  });
  it('parseTimeOfDay errors', () => {
    for (const t of ['25:00', '10:60', '10', 'noon', '', null, 1, 1.5, -0.1, NaN] as const) {
      expect(parseTimeOfDay(t as never)).toHaveProperty('error', 'unparseable');
    }
    expect(parseTimeOfDay('noon')).toEqual({ error: 'unparseable', raw: 'noon' });
  });
  it('adds minute precision', () => {
    expect(combineDateTime(day(), '10:30')).toEqual({ iso: '2021-07-25T10:30', year: 2021, precision: 'minute', tz: 'unknown' });
  });
  it('adds second precision and utc tz from the time', () => {
    expect(combineDateTime(day(), '10:30:15Z')).toEqual({ iso: '2021-07-25T10:30:15Z', year: 2021, precision: 'second', tz: 'utc' });
  });
  it('xlsx time-of-day fraction', () => {
    expect(combineDateTime(day(), 0.4375).iso).toBe('2021-07-25T10:30');
  });
  it('keeps the yy-mm-dd ambiguity flag', () => {
    const d = ok('21-07-25', { currentYear: 2026 });
    expect(combineDateTime(d, '10:30')).toMatchObject({ iso: '2021-07-25T10:30', ambiguity: 'yy-mm-dd' });
  });
  it('returns the date unchanged for a blank, missing or unparseable time', () => {
    expect(combineDateTime(day(), null)).toEqual(day());
    expect(combineDateTime(day(), '  ')).toEqual(day());
    expect(combineDateTime(day(), 'noon')).toEqual(day());
  });
  it('does not add a time to a date that already has one or is coarser than a day', () => {
    const dt = ok('2021-07-25T08:00');
    expect(combineDateTime(dt, '10:30')).toEqual(dt);
    const month = ok('2021-07');
    expect(combineDateTime(month, '10:30')).toEqual(month);
  });
});

describe('parseTimeCell: a dash between two times is a range, not a zone offset', () => {
  it('"10:00-11:30" is 10:00 with no offset; so are the other ends up to 14', () => {
    for (const raw of ['10:00-11:30', '08:00-09:00', '06:00-07:30', '0800-0900', '10:00-14:00', '10:00 – 11:30']) {
      const t = parseTimeCell(raw);
      expect('error' in t, raw).toBe(false);
      expect(t, raw).toMatchObject({ tz: 'unknown' });
    }
    expect(parseTimeCell('10:00-11:30')).toMatchObject({ hh: 10, mm: 0, text: '10:00' });
    expect(combineDateTime({ iso: '2021-07-21', year: 2021, precision: 'day', tz: 'unknown' }, '10:00-11:30')).toMatchObject({ iso: '2021-07-21T10:00', tz: 'unknown' });
  });

  it('a real offset is still an offset: with a plus sign, Z, seconds, or a bare hour', () => {
    expect(parseTimeCell('10:00+02:00')).toMatchObject({ tz: 'offset', text: '10:00+02:00' });
    expect(parseTimeCell('10:00Z')).toMatchObject({ tz: 'utc' });
    expect(parseTimeCell('10:00:00-05:00')).toMatchObject({ tz: 'offset', text: '10:00:00-05:00' });
    expect(parseTimeCell('10:00-11')).toMatchObject({ tz: 'offset' });
  });
});

describe('cellsAreYearRanges', () => {
  it('needs mostly year ranges and at least one impossible as a time', () => {
    expect(cellsAreYearRanges(['2001-2005', '1995-2000', '1990-1995'])).toBe(true);
    expect(cellsAreYearRanges(['1930-2000', '2005-2040', '1945-2015'])).toBe(false);
    expect(cellsAreYearRanges(['1995-2000', '10:00', '11:00', '12:00'])).toBe(false);
    expect(cellsAreYearRanges(['10:00-11:00', '12:00'])).toBe(false);
  });
});

describe('parseTimeRange / parseTimeCell', () => {
  it('reads HHMM-HHMM, HH:MM-HH:MM and several ranges as the start of the first range', () => {
    for (const [raw, text] of [['1600-1730', '16:00'], ['0530-0700', '05:30'], ['16:00-17:30', '16:00'], ['0530-0700, 1600-1730', '05:30'], ['930-1015', '09:30'], ['16:00 – 17:30', '16:00']] as const) {
      expect(parseTimeCell(raw), raw).toMatchObject({ text });
    }
  });

  it('rejects what is not a range of times, and a lone 4-figure number (it may be a year)', () => {
    for (const raw of ['1600', '2560-2600', '1600-', '1600-1730-1800', 'noon', '1999-2005x', '']) expect('error' in parseTimeCell(raw), raw).toBe(true);
  });

  it('combineDateTime takes the start of a range', () => {
    expect(combineDateTime({ iso: '2021-07-25', year: 2021, precision: 'day', tz: 'unknown' }, '1600-1730')).toMatchObject({ iso: '2021-07-25T16:00', precision: 'minute' });
  });
});
