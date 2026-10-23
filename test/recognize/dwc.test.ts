// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { buildDataset } from '../../src/core/dataset';
import { checkRows } from '../../src/core/checks/rows';
import { proposeColumns } from '../../src/core/recognize/columns';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import { parseDate } from '../../src/core/values/dates';
import type { ColumnProposal, ParsedFile } from '../../src/core/types';
import { fixtureFile, rawSheet, textFile } from '../helpers/files';

const CTX = { decimalComma: false, date1904: false };
const props = (header: string[], rows: (string | null)[][]): ColumnProposal[] => proposeColumns(rawSheet(header, rows), CTX);
const of = (p: ColumnProposal[], h: string) => p.find((x) => x.header === h)!;
const build = (file: ParsedFile) => {
  const layout = proposeLayout(file);
  return buildDataset(file, layout, proposeMappings(file, layout), [], 'ds');
};

describe('Darwin Core columns', () => {
  const f = fixtureFile('dwc-occurrence-synthetic.txt');
  const p = proposeColumns(f.sheets[0], CTX);

  it('reads the DwC terms', () => {
    expect(of(p, 'decimalLatitude').role).toEqual({ kind: 'latitude' });
    expect(of(p, 'decimalLongitude').role).toEqual({ kind: 'longitude' });
    expect(of(p, 'eventDate').role).toEqual({ kind: 'datetime' }); // one row carries a time
    expect(of(p, 'eventDate').reason).toMatch(/year\/month\/day/);
    expect(of(p, 'minimumDepthInMeters').role).toEqual({ kind: 'depth', positive: 'down', unit: 'm' });
    expect(of(p, 'minimumDepthInMeters').reason).toBe('Darwin Core: depth below the surface in metres (positive down)');
    expect(of(p, 'maximumDepthInMeters').role).toEqual({ kind: 'ignore' });
    expect(of(p, 'maximumDepthInMeters').reason).toMatch(/another column \("minimumDepthInMeters"\) is used for depth/);
    expect(of(p, 'occurrenceID').role).toEqual({ kind: 'sampleId' });
    expect(of(p, 'id').role).toEqual({ kind: 'ignore' });
    expect(of(p, 'eventID').role).toEqual({ kind: 'ignore' });
  });

  it('an empty locationID loses to a filled locality', () => {
    expect(of(p, 'locality').role).toEqual({ kind: 'station' });
    expect(of(p, 'locationID').role).toEqual({ kind: 'ignore' });
    expect(of(p, 'locationID').reason).toMatch(/column is empty/);
  });

  it('identifiers, counts and date parts are ignored with a reason naming the term', () => {
    for (const h of ['catalogNumber', 'individualCount', 'year', 'month', 'day']) {
      expect(of(p, h).role).toEqual({ kind: 'ignore' });
      expect(of(p, h).reason).toContain(`Darwin Core ${h}`);
    }
  });

  it('a filled locationID wins over locality', () => {
    const q = props(['locationID', 'locality', 'decimalLatitude'], [['L1', 'Bay', '1']]);
    expect(of(q, 'locationID').role).toEqual({ kind: 'station' });
    expect(of(q, 'locality').role).toEqual({ kind: 'ignore' });
  });

  it('is case-insensitive and accepts the dwc: prefix and the term URI', () => {
    const q = props(['DWC:DecimalLatitude', 'decimallongitude', 'http://rs.tdwg.org/dwc/terms/eventDate', 'dwc:year', 'dwc:minimumDepthInMeters'], [['1', '2', '2008-01-01', '2008', '5']]);
    expect(q.map((x) => x.role.kind)).toEqual(['latitude', 'longitude', 'date', 'ignore', 'depth']);
  });

  it('verbatim coordinates lose to decimal ones', () => {
    const q = props(['verbatimLatitude', 'decimalLatitude', 'decimalLongitude'], [['61 N', '61.2', '4.5']]);
    expect(q.map((x) => x.role.kind)).toEqual(['ignore', 'latitude', 'longitude']);
  });

  it('DwC depth is positive down whatever the values, so ROW-DEPTH-SIGN stays silent', () => {
    const file = textFile('d.txt', 'decimalLatitude\tdecimalLongitude\teventDate\tminimumDepthInMeters\n61\t4\t2008-05-01\t-5\n61\t4\t2008-05-02\t-6\n');
    const { dataset } = build(file);
    expect(dataset.depthPositive).toBe('down');
    expect(checkRows(dataset).map((x) => x.ruleId)).not.toContain('ROW-DEPTH-SIGN');
  });

  it('builds the date from year/month/day where eventDate is empty', () => {
    const { dataset } = build(f);
    const dates = dataset.rows.map((r) => [r.datetime?.iso, r.datetime?.precision]);
    expect(dates[0]).toEqual(['2008-05-01', 'day']);
    expect(dates[1]).toEqual(['2008-05-01T10:00Z', 'minute']);
    expect(dates[2]).toEqual(['2009-07-21', 'day']);
    expect(dates[3]).toEqual(['2009-07', 'month']);
    expect(dates[4]).toEqual(['2010', 'year']);
    expect(dataset.rows[0].station).toBe('Test Bay A');
    expect(dataset.rows[0].sampleId).toBe('occ-1');
  });

  it('no fallback when the date header is not DwC eventDate', () => {
    const { dataset } = build(textFile('n.csv', 'lat,lon,date,year\n61,4,,2008\n61,4,2008-01-01,2009\n'));
    expect(dataset.rows[0].datetime).toBeUndefined();
  });

  it('when everything is empty the date stays missing', () => {
    const { dataset } = build(textFile('e.txt', 'decimalLatitude\tdecimalLongitude\teventDate\tyear\tmonth\tday\n61\t4\t\t\t\t\n61\t4\t2008-01-01\t\t\t\n'));
    expect(dataset.rows[0].datetime).toBeUndefined();
    expect(dataset.rows[1].datetime?.iso).toBe('2008-01-01');
  });
});

describe('ordinary headers are not read as Darwin Core', () => {
  it('Latitude, lat, Depth [m], Station, date map as before', () => {
    const p = props(['Latitude', 'lat', 'Depth [m]', 'Station', 'date'], [['1', '1', '5', 'S1', '2008-01-01']]);
    expect(p.map((x) => x.role.kind)).toEqual(['latitude', 'ignore', 'depth', 'station', 'date']);
    expect(of(p, 'Depth [m]').role).toEqual({ kind: 'depth', positive: 'down', unit: 'm' });
  });
  it('year, month, day, id, locality in a non-DwC sheet keep their old handling', () => {
    const p = props(['year', 'month', 'day', 'id', 'locality', 'temp'], [['2008', '5', '1', 'a', 'Bay', '4.5']]);
    expect(p.map((x) => x.role.kind)).toEqual(['variable', 'variable', 'variable', 'sampleId', 'ignore', 'variable']);
    expect(p[0].reason).not.toMatch(/Darwin/);
  });
});

describe('ISO 8601 interval dates', () => {
  const opts = { date1904: false, dateFormatted: false };
  it('reads the start with its precision', () => {
    expect(parseDate('2008-05-01/2008-05-14', opts)).toMatchObject({ iso: '2008-05-01', precision: 'day' });
    expect(parseDate('2008-05/2008-06', opts)).toMatchObject({ iso: '2008-05', precision: 'month' });
    expect(parseDate('2008/2009', opts)).toMatchObject({ iso: '2008', precision: 'year' });
    expect(parseDate('2008-05-01T10:00Z/2008-05-01T11:00Z', opts)).toMatchObject({ iso: '2008-05-01T10:00Z', precision: 'minute', tz: 'utc' });
  });
  it('reads the reduced end forms of ISO 8601 (the Darwin Core examples)', () => {
    expect(parseDate('2007-11-13/15', opts)).toMatchObject({ iso: '2007-11-13', precision: 'day' });
    expect(parseDate('2007-11-13/12-02', opts)).toMatchObject({ iso: '2007-11-13', precision: 'day' });
    expect(parseDate('2008-05-01T10:00Z/11:00Z', opts)).toMatchObject({ iso: '2008-05-01T10:00Z', precision: 'minute' });
    expect(parseDate('2008-05-01T10:00+02:00/2008-05-01T09:30Z', opts)).toMatchObject({ precision: 'minute' }); // 08:00Z to 09:30Z
  });
  it('is unparseable when the end comes before the start, or a reduced end does not fit', () => {
    expect('error' in parseDate('2009/2008', opts)).toBe(true);
    expect('error' in parseDate('2008-05-14/2008-05-01', opts)).toBe(true);
    expect('error' in parseDate('2007-11-13/10', opts)).toBe(true);
    expect('error' in parseDate('2007-11-13/32', opts)).toBe(true);
    expect('error' in parseDate('2008/15', opts)).toBe(true);
  });
  it('is unparseable when a half does not parse', () => {
    expect('error' in parseDate('2008-05-01/garbage', opts)).toBe(true);
    expect('error' in parseDate('2008-13-01/2008-14-01', opts)).toBe(true);
    expect('error' in parseDate('2008-05-01/', opts)).toBe(true);
  });
});
