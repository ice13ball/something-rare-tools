// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// keepMillis: an Excel serial keeps a real fraction of a second to the millisecond; off, it is rounded to the second as /convert reads it. Every value is invented.
import { describe, expect, it } from 'vitest';
import { combineDateTime, excelSerialToDate, parseDate, parseTimeCell, parseTimeColumnCell, parseTimeOfDay } from '../../src/core/values/dates';

const DAY = 45000; // 2023-03-15
const at = (secs: number, base = DAY): number => base + secs / 86400;

describe('excelSerialToDate keepMillis', () => {
  it('a real .250 and .750 stay, in a column whose format shows the fraction and in one that does not; a real 12:00:01 stays different', () => {
    for (const keep of ['shown', true] as const) {
      expect(excelSerialToDate(at(43200.25), false, keep).iso).toBe('2023-03-15T12:00:00.250');
      expect(excelSerialToDate(at(43200.75), false, keep).iso).toBe('2023-03-15T12:00:00.750');
      expect(excelSerialToDate(at(43201), false, keep).iso).toBe('2023-03-15T12:00:01');
    }
    expect(excelSerialToDate(at(43200.25), false, true).precision).toBe('second');
  });

  it('off (the default) is exactly as before: the fraction is rounded to the second', () => {
    expect(excelSerialToDate(at(43200.75), false).iso).toBe('2023-03-15T12:00:01');
    expect(excelSerialToDate(at(43200.25), false).iso).toBe('2023-03-15T12:00');
    expect(excelSerialToDate(at(43200.75), false, false)).toEqual(excelSerialToDate(at(43200.75), false));
  });

  it('.002 stays where the format shows the fraction and rounds where it does not (under 5 ms from a whole second)', () => {
    expect(excelSerialToDate(at(43200.002), false, 'shown').iso).toBe('2023-03-15T12:00:00.002');
    expect(excelSerialToDate(at(43200.002), false, true).iso).toBe('2023-03-15T12:00');
    expect(excelSerialToDate(at(43200.004), false, true).iso).toBe('2023-03-15T12:00');
    expect(excelSerialToDate(at(43200.006), false, true).iso).toBe('2023-03-15T12:00:00.006');
  });

  it('a rounded or a thirds serial is a whole second, not a fraction', () => {
    expect(excelSerialToDate(43983.33333, false, true).iso).toBe('2020-06-01T08:00');
    expect(excelSerialToDate(43983.33333, false)).toEqual(excelSerialToDate(43983.33333, false, true));
    expect(excelSerialToDate(43983 + 1 / 3, false, true).iso).toBe('2020-06-01T08:00');
    expect(excelSerialToDate(43900.5000000001, false, true).iso).toBe('2020-03-10T12:00');
    expect(excelSerialToDate(43900 + 1e-11, false, true)).toEqual({ iso: '2020-03-10', year: 2020, precision: 'day', tz: 'unknown' });
  });

  it('a fill-down formula of 1 s, 1 min, 5 min, 15 min or 1 h over 6000 rows is byte-identical to the whole-second reading', () => {
    for (const step of [1 / 86400, 1 / 1440, 5 / 1440, 15 / 1440, 1 / 24]) {
      let v = 43983.25;
      for (let i = 0; i < 6000; i++) {
        v += step;
        expect(excelSerialToDate(v, false, true), `step ${step} row ${i}`).toEqual(excelSerialToDate(v, false));
      }
    }
  });

  it('a fraction with zero whole seconds is not a date-only value', () => {
    for (const keep of ['shown', true] as const) {
      const d = excelSerialToDate(at(0.25), false, keep);
      expect(d.iso).toBe('2023-03-15T00:00:00.250');
      expect(d.precision).toBe('second');
    }
    expect(excelSerialToDate(at(60.5), false, true).iso).toBe('2023-03-15T00:01:00.500');
  });

  it('a fraction finer than a millisecond rounds to the millisecond where it is kept', () => {
    expect(excelSerialToDate(at(43200.2504), false, 'shown').iso).toBe('2023-03-15T12:00:00.250');
    expect(excelSerialToDate(at(43200.2506), false, true).iso).toBe('2023-03-15T12:00:00.251');
    expect(excelSerialToDate(at(43200.0004), false, true).iso).toBe('2023-03-15T12:00');
  });

  it('23:59:59.9996 rolls over to the next day, also in a 1904 workbook; 23:59:59.999 keeps its day where the format shows it', () => {
    for (const keep of ['shown', true] as const) {
      expect(excelSerialToDate(at(86399.9996), false, keep)).toEqual({ iso: '2023-03-16', year: 2023, precision: 'day', tz: 'unknown' });
      expect(excelSerialToDate(at(86399.9996, DAY - 1462), true, keep).iso).toBe('2023-03-16');
    }
    expect(excelSerialToDate(at(86399.999), false, 'shown').iso).toBe('2023-03-15T23:59:59.999');
    expect(excelSerialToDate(at(43200.25, DAY - 1462), true, true).iso).toBe('2023-03-15T12:00:00.250');
  });
});

describe('parseDate and the time readers pass keepMillis on', () => {
  it('parseDate on a date-formatted number', () => {
    expect(parseDate(at(43200.25), { date1904: false, dateFormatted: true, keepMillis: true })).toMatchObject({ iso: '2023-03-15T12:00:00.250', precision: 'second' });
    expect(parseDate(at(43200.25), { date1904: false, dateFormatted: true })).toMatchObject({ iso: '2023-03-15T12:00' });
  });
  it('a text date keeps its fraction with or without the option', () => {
    for (const keepMillis of [true, false]) expect(parseDate('2021-06-01T12:00:00.250Z', { date1904: false, dateFormatted: false, keepMillis })).toMatchObject({ iso: '2021-06-01T12:00:00.250Z', precision: 'second', tz: 'utc' });
  });
  it('a time of day as a number, and combined with a date', () => {
    expect(parseTimeOfDay(0.5 + 0.75 / 86400, true)).toMatchObject({ text: '12:00:00.750', ss: 0 });
    expect(parseTimeOfDay(0.5 + 0.75 / 86400)).toMatchObject({ text: '12:00:01', ss: 1 });
    expect(parseTimeOfDay(0.5 + 1e-11, true)).toEqual({ hh: 12, mm: 0, tz: 'unknown', text: '12:00' });
    expect(parseTimeCell(0.25 / 86400, true)).toMatchObject({ text: '00:00:00.250' });
    expect(parseTimeColumnCell(0.5 + 0.25 / 86400, undefined, undefined, true)).toMatchObject({ text: '12:00:00.250' });
    const day = parseDate('2021-06-01', { date1904: false, dateFormatted: false });
    if ('error' in day) throw new Error('date');
    expect(combineDateTime(day, 0.5 + 0.25 / 86400, undefined, true)).toMatchObject({ iso: '2021-06-01T12:00:00.250', precision: 'second' });
    expect(combineDateTime(day, 0.5 + 0.25 / 86400)).toMatchObject({ iso: '2021-06-01T12:00', precision: 'minute' });
  });
});
