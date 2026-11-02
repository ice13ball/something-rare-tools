// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Dates of a column that IS the date (YYYYMMDD, a numeric year), times cut out of full datetimes, and the forms nobody reads. Every value is invented.
import { describe, expect, it } from 'vitest';
import { buildDataset } from '../../src/core/dataset';
import { proposeColumns, unitFromHeader } from '../../src/core/recognize/columns';
import { proposeLayout } from '../../src/core/recognize/layout';
import { parseFile } from '../../src/core/parse';
import { looksLikeUnreadDate, parseDate, parseTimeColumnCell } from '../../src/core/values/dates';
import { rawSheet } from '../helpers/files';

const base = { date1904: false, dateFormatted: false };
const column = { ...base, datumColumn: true };
const iso = (r: ReturnType<typeof parseDate>) => ('error' in r ? 'error' : r.iso);

describe('YYYYMMDD in a column that is the date', () => {
  it('text and whole numbers are read and validated', () => {
    expect(iso(parseDate('20160426', column))).toBe('2016-04-26');
    expect(iso(parseDate(20160426, column))).toBe('2016-04-26');
    expect(iso(parseDate('20160229', column))).toBe('2016-02-29');
    for (const bad of ['20161345', '20160230', '20150229', '20160400', '2016042', '201604260']) expect(iso(parseDate(bad, column)), bad).toBe('error');
  });

  it('under no date role, eight digits are an ID or a measurement and stay unread', () => {
    expect(iso(parseDate('20160426', base))).toBe('error');
    expect(iso(parseDate(20160426, base))).toBe('error');
  });

  it('the header "Date (YYYYMMDD)" is the date, from the format in its name; the column is read, a bad day is reported', () => {
    expect(unitFromHeader('Date (YYYYMMDD)').name).toBe('Date');
    expect(unitFromHeader('Date [DD/MM/YYYY]').name).toBe('Date');
    const text = 'Station,Date (YYYYMMDD),Temp\nS1,20160426,4.1\nS1,20160427,4.2\nS2,20161345,4.3\n';
    const file = parseFile('d.csv', new TextEncoder().encode(text));
    const roles = proposeColumns(file.sheets[0], { decimalComma: false, date1904: false }).map((p) => p.role.kind);
    expect(roles[1]).toBe('date');
    const { dataset, findings } = buildDataset(file, proposeLayout(file), [], [], 'x');
    expect(dataset.rows.map((r) => r.datetime?.iso)).toEqual(['2016-04-26', '2016-04-27', undefined]);
    expect(findings.filter((f) => f.ruleId === 'ROW-DATE-UNPARSEABLE').map((f) => f.value)).toEqual(['20161345']);
  });

  it('an eight-digit ID column keeps its role and is never read as a date', () => {
    const text = 'Station,SampleCode,Temp\nS1,20160426,4.1\nS1,20160427,4.2\nS2,20160428,4.3\n';
    const file = parseFile('i.csv', new TextEncoder().encode(text));
    const { dataset } = buildDataset(file, proposeLayout(file), [], [], 'x');
    expect(dataset.rows.every((r) => r.datetime === undefined)).toBe(true);
  });
});

describe('a numeric year under the date role is a year, as the text 2000 is', () => {
  it('1986 and "1986" are the same year-only date', () => {
    expect(parseDate(1986, column)).toEqual(parseDate('1986', column));
    expect(parseDate(1986, column)).toMatchObject({ iso: '1986', precision: 'year' });
  });
  it('without the date role a number is not a date, and a serial of a date-formatted column is a serial', () => {
    expect(iso(parseDate(1986, base))).toBe('error');
    expect(iso(parseDate(44000, { ...base, dateFormatted: true }))).toBe('2020-06-18');
    expect(iso(parseDate(1986.5, column))).toBe('error');
  });
  it('a dataset whose date column holds numbers 1986 is read without an unparseable date', () => {
    const file = parseFile('y.csv', new TextEncoder().encode('Station,Date,Temp\nS1,1986,4.1\nS2,1987,4.2\nS3,1988,4.3\n'));
    const { dataset, findings } = buildDataset(file, proposeLayout(file), [], [], 'x');
    expect(findings.some((f) => f.ruleId === 'ROW-DATE-UNPARSEABLE')).toBe(false);
    expect(dataset.rows.map((r) => r.datetime?.iso)).toEqual(['1986', '1987', '1988']);
  });
});

describe('year first with slashes or dots is certain', () => {
  it('2003/01/17, 2003.1.7 08:30; an impossible month is not', () => {
    expect(iso(parseDate('2003/01/17', base))).toBe('2003-01-17');
    expect(iso(parseDate('2003/01/17 08:30', base))).toBe('2003-01-17T08:30');
    expect(iso(parseDate('2003.1.7', base))).toBe('2003-01-07');
    expect(iso(parseDate('2003/13/01', base))).toBe('error');
  });
});

describe('the time of day of a time column', () => {
  it('a full datetime gives its time part when the day is the row\'s day', () => {
    const t = parseTimeColumnCell('2011-10-05T20:00:00Z', '2011-10-05');
    expect('error' in t ? 'error' : t.text).toBe('20:00:00Z');
    expect('error' in parseTimeColumnCell('2011-10-06T20:00:00Z', '2011-10-05')).toBe(true);
    expect('error' in parseTimeColumnCell('2011-10-05', '2011-10-05')).toBe(true);
  });
  it('a placeholder date of a spreadsheet or an epoch is a time, whatever the row\'s day', () => {
    for (const cell of ['1899-12-30 12:30', '1970-01-01 12:30:00', '30.12.1899 12:30']) {
      const t = parseTimeColumnCell(cell, '2011-10-05');
      expect('error' in t ? 'error' : t.text.slice(0, 5), cell).toBe('12:30');
    }
  });
  it('plain times are untouched', () => {
    const t = parseTimeColumnCell('08:30', '2011-10-05');
    expect('error' in t ? 'error' : t.text).toBe('08:30');
  });

  it('/check: a Time column of ISO datetimes beside a real Date column is read as the time part, with no unparseable date', () => {
    const text = 'Station,Date,Time,Temp\nS1,2011-10-05,2011-10-05T20:00:00Z,4.1\nS1,2011-10-06,2011-10-06T21:15:00Z,4.2\nS2,2011-10-07,1899-12-30 08:30,4.3\n';
    const file = parseFile('t.csv', new TextEncoder().encode(text));
    const roles = proposeColumns(file.sheets[0], { decimalComma: false, date1904: false }).map((p) => p.role.kind);
    expect(roles.slice(1, 3)).toEqual(['date', 'time']);
    const { dataset, findings } = buildDataset(file, proposeLayout(file), [], [], 'x');
    expect(findings.filter((f) => f.ruleId === 'ROW-DATE-UNPARSEABLE')).toEqual([]);
    expect(dataset.rows.map((r) => r.datetime?.iso)).toEqual(['2011-10-05T20:00:00Z', '2011-10-06T21:15:00Z', '2011-10-07T08:30']);
  });
  it('/check: a time cell of another day than its row is reported as that (no zone), never silently cut; with a zone it is the instant of the event', () => {
    const text = 'Station,Date,Time,Temp\nS1,2011-10-05,2011-10-09T20:00,4.1\nS1,2011-10-06,21:15,4.2\nS2,2011-10-05,2011-10-06T00:30:00Z,4.3\n';
    const file = parseFile('t2.csv', new TextEncoder().encode(text));
    const { dataset, findings } = buildDataset(file, proposeLayout(file), [], [], 'x');
    expect(findings.filter((f) => f.ruleId === 'ROW-TIME-OTHER-DAY').map((f) => f.value)).toEqual(['2011-10-09T20:00']);
    expect(findings.some((f) => f.ruleId === 'ROW-DATE-UNPARSEABLE')).toBe(false);
    // the UTC instant is the datetime of the third row, although the local date column says the day before
    expect(dataset.rows[2].datetime?.iso).toBe('2011-10-06T00:30:00Z');
  });
});

describe('dates written out that no reader reads', () => {
  it.each(['20030117 0830', 'Jan 17 2003', '01/17/2003 8:30 AM', '17 January 2003', '20030117'])('%s looks like a date', (cell) => {
    expect(looksLikeUnreadDate(cell)).toBe(true);
  });
  it.each(['08:30', 'Calanus finmarchicus', '1630', 'Station 7', '12'])('%s does not', (cell) => {
    expect(looksLikeUnreadDate(cell)).toBe(false);
  });
  it('the proposer reads the unambiguous 2003/01/17 as a date by its cells', () => {
    const cells = [['2003/01/17 08:30', 1], ['2003/01/18 09:30', 2], ['2003/01/19 10:30', 3]] as const;
    const roles = proposeColumns(rawSheet(['recorded', 'x'], cells.map((c) => [...c])), { decimalComma: false, date1904: false }).map((p) => p.role.kind);
    expect(roles[0]).toBe('datetime');
  });
});
