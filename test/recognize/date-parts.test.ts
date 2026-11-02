// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A date written in Year, Month and Day columns, on /check (shared proposer, dataset.ts) and /convert. Every row is invented.
import { describe, expect, it } from 'vitest';
import { checkMetadataVsData } from '../../src/core/checks/metadata';
import { buildDataset } from '../../src/core/dataset';
import { convert } from '../../src/core/convert/build';
import { judge } from '../../src/core/convert/policy';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { proposeColumns } from '../../src/core/recognize/columns';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import { roleChoiceOf, roleFromChoice } from '../../src/app/mappingModel';
import { renderPlain } from '../../src/core/report';
import { LANGS } from '../../src/core/types';
import { fileOf, sheetInput } from '../convert/helpers';
import type { Cell } from '../convert/helpers';
import { rawSheet, textFile } from '../helpers/files';

const CTX = { decimalComma: false, date1904: false };
const roles = (header: string[], rows: Cell[][]) => Object.fromEntries(proposeColumns(rawSheet(header, rows), CTX).map((p) => [p.header, p]));
const SET = ['Year', 'Month', 'Day', 'Station', 'Latitude', 'Longitude', 'Temperature [degC]'];
const rows = (parts: Cell[][]): Cell[][] => parts.map((p, i) => [...p, `S${i + 1}`, 49.4 + i / 10, 0.2, 10 + i]);

function dataset(csv: string) {
  const file = textFile('ymd.csv', csv);
  const layout = proposeLayout(file);
  return buildDataset(file, layout, proposeMappings(file, layout), [], 'ds1');
}

describe('Year, Month and Day columns are one date', () => {
  it('the proposer reads the set by names and values and marks the columns', () => {
    const r = roles(SET, rows([[1998, 9, 17], [1998, 10, 2], [1999, 1, 30]]));
    expect(r.Year.role).toEqual({ kind: 'datePart', part: 'year' });
    expect(r.Month.role).toEqual({ kind: 'datePart', part: 'month' });
    expect(r.Day.role).toEqual({ kind: 'datePart', part: 'day' });
    expect(r.Year.confidence).toBe('high');
    expect(r.Year.reasonCode).toBe('date-parts-year');
    expect(r.Station.role.kind).not.toBe('datePart');
  });

  it('names in German, French and Polish say so too', () => {
    for (const h of [['Jahr', 'Monat', 'Tag'], ['Année', 'Mois', 'Jour'], ['Rok', 'Miesiąc', 'Dzień']]) {
      const r = roles([...h, 'Station', 'Latitude', 'Longitude', 'Temperature [degC]'], rows([[1998, 9, 17], [1998, 10, 2], [1999, 1, 30]]));
      expect(r[h[0]].role, h[0]).toEqual({ kind: 'datePart', part: 'year' });
      expect(r[h[1]].role, h[1]).toEqual({ kind: 'datePart', part: 'month' });
      expect(r[h[2]].role, h[2]).toEqual({ kind: 'datePart', part: 'day' });
    }
  });

  it('never by position: numbers that fit are not a date (Year beside Quarter/Haul, Net/Tow, Transect/Quadrat, Season/Plot, two species, Temperature/Salinity)', () => {
    const body = (a: number[], b: number[]): Cell[][] => a.map((x, i) => [2001 + (i % 3), x, b[i], `S${i}`, 49.4, 0.2]);
    const q = [1, 2, 3, 4, 1, 2, 3, 4], h = [1, 3, 5, 7, 2, 4, 6, 8];
    for (const names of [['Year', 'Quarter', 'Haul'], ['Year', 'Net', 'Tow'], ['Year', 'Transect', 'Quadrat'], ['Year', 'Season', 'Plot'], ['Year', 'Calanus finmarchicus', 'Oithona similis'], ['Year', 'Temperature', 'Salinity'], ['A', 'B', 'C']]) {
      const r = roles([...names, 'Station', 'Latitude', 'Longitude'], body(q, h));
      for (const n of names) expect(r[n].role.kind, names.join('/') + ' ' + n).not.toBe('datePart');
    }
    // the dataset gets no invented date either
    const { dataset: ds } = dataset('Year,Quarter,Haul,Station,Latitude,Longitude\n2001,1,1,S1,49.4,0.2\n2002,2,3,S2,49.5,0.2\n2003,3,5,S3,49.6,0.2');
    expect(ds.rows.map((r) => r.datetime?.iso)).toEqual(['2001', '2002', '2003'].map(() => undefined));
  });

  it('mm and dd count only beside yyyy; a Year with a month column that does not say month is not a date', () => {
    const three = rows([[1998, 9, 17], [1998, 10, 2], [1999, 1, 30]]);
    expect(roles(['Year', 'mm', 'dd', 'Station', 'Latitude', 'Longitude', 'Temperature [degC]'], three).mm.role.kind).not.toBe('datePart');
    expect(roles(['yyyy', 'mm', 'dd', 'Station', 'Latitude', 'Longitude', 'Temperature [degC]'], three).mm.role).toEqual({ kind: 'datePart', part: 'month' });
  });

  it('a Tag column of text is not the day: the date is what Year and Month make; month names are read', () => {
    const r = roles(['Year', 'Month', 'Tag', 'Station', 'Latitude', 'Longitude'], [[1998, 'Sep', 'a', 'S1', 49.4, 0.2], [1998, 'Oct', 'b', 'S2', 49.5, 0.2], [1999, 'wrz', 'c', 'S3', 49.6, 0.2], [1999, 'Okt', 'd', 'S4', 49.6, 0.2]]);
    expect(r.Year.role).toEqual({ kind: 'datePart', part: 'year' });
    expect(r.Month.role).toEqual({ kind: 'datePart', part: 'month' });
    expect(r.Tag.role.kind).not.toBe('datePart');
    const { dataset: ds } = dataset('Year,Month,Station,Latitude,Longitude\n1998,Sep,S1,49.4,0.2\n1998,Sept.,S2,49.5,0.2\n1999,mars,S3,49.6,0.2');
    expect(ds.rows.map((x) => x.datetime?.iso)).toEqual(['1998-09', '1998-09', '1999-03']);
  });

  it('does not fire on a lone Year, on code columns or on a non-date triple', () => {
    const lone = roles(['Year', 'Station', 'Latitude', 'Longitude', 'Temperature [degC]'], [[1998, 'S1', 49.4, 0.2, 10], [1999, 'S2', 49.5, 0.2, 11], [2000, 'S3', 49.6, 0.2, 12]]);
    expect(lone.Year.role.kind).not.toBe('datePart');
    // three columns next to each other that fit the ranges but are not a calendar (a month 2 with days up to 31, constants)
    const codes = roles(['Code', 'Rep', 'Lot', 'Latitude', 'Longitude', 'Temperature [degC]'], [[2001, 5, 7, 49.4, 0.2, 10], [2001, 5, 7, 49.5, 0.2, 11], [2001, 5, 7, 49.6, 0.2, 12]]);
    expect(codes.Code.role.kind).not.toBe('datePart');
    const notDates = roles(['Year', 'Month', 'Day', 'Latitude', 'Longitude', 'Temperature [degC]'], [[1998, 2, 31, 49.4, 0.2, 10], [1998, 2, 30, 49.5, 0.2, 11], [1998, 2, 29, 49.6, 0.2, 12]]);
    // named columns whose combination is no date on any row are still offered, but only by their names; the rows are then reported one by one
    expect(notDates.Year.role.kind === 'datePart' || notDates.Year.role.kind === 'variable').toBe(true);
    const counts = roles(['Count', 'Size', 'Age', 'Latitude', 'Longitude'], [[1998, 40, 3, 49.4, 0.2], [1950, 12, 20, 49.5, 0.2], [1700, 7, 9, 49.6, 0.2]]);
    expect(counts.Count.role.kind).not.toBe('datePart');
  });

  it('an empty Date column beside the parts: the parts give the dates; a half-filled one: the parts fill the rows it leaves blank', () => {
    const empty = dataset('Date,Year,Month,Day,Station,Latitude,Longitude\n,1998,9,17,S1,49.4,0.2\n,1998,10,2,S2,49.5,0.2');
    expect(empty.dataset.rows.map((x) => x.datetime?.iso)).toEqual(['1998-09-17', '1998-10-02']);
    const half = dataset('Date,Year,Month,Day,Station,Latitude,Longitude\n2001-05-05,1998,9,17,S1,49.4,0.2\n,1998,10,2,S2,49.5,0.2');
    expect(half.dataset.rows.map((x) => x.datetime?.iso)).toEqual(['2001-05-05', '1998-10-02']);
  });

  it('bad Day cells do not drop the Day for the other rows; each bad cell is reported', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `1998,${(i % 12) + 1},${i % 3 === 0 ? 'x' : String(i + 1)},S${i},49.4,0.2`);
    const { dataset: ds, findings } = dataset(['Year,Month,Day,Station,Latitude,Longitude', ...lines].join('\n'));
    expect(ds.rows.filter((x) => x.datetime?.precision === 'day')).toHaveLength(6);
    expect(findings.find((f) => f.ruleId === 'ROW-DATE-UNPARSEABLE')!.lines).toHaveLength(4);
  });

  it('a real Date column beside them wins: nothing is marked', () => {
    const r = roles(['Date', ...SET], rows([[1998, 9, 17], [1998, 10, 2], [1999, 1, 30]]).map((row, i) => [`1998-09-${10 + i}`, ...row]));
    expect(r.Date.role.kind).toBe('date');
    expect(r.Year.role.kind).not.toBe('datePart');
  });

  it('the dropdown choice round-trips', () => {
    const role = { kind: 'datePart', part: 'month' } as const;
    expect(roleChoiceOf(role)).toBe('dateMonth');
    expect(roleFromChoice({ kind: 'ignore' }, { kind: 'ignore' }, 'dateDay', 'Day')).toEqual({ kind: 'datePart', part: 'day' });
  });
});

describe('/check: the date of the row', () => {
  const csv = (lines: string[]): string => ['Year,Month,Day,Station,Latitude,Longitude,Temperature [degC]', ...lines].join('\n');

  it('the rows get their dates, with the precision they have, and META-NO-DATES is silent', () => {
    const { dataset: ds, findings } = dataset(csv(['1998,9,17,S1,49.4,0.2,10', '1998,10,,S2,49.5,0.2,11', '1999,,,S3,49.6,0.2,12', '1999,1,30,S4,49.7,0.2,13']));
    expect(ds.rows.map((r) => r.datetime?.iso)).toEqual(['1998-09-17', '1998-10', '1999', '1999-01-30']);
    expect(ds.rows.map((r) => r.datetime?.precision)).toEqual(['day', 'month', 'year', 'day']);
    expect(findings.filter((f) => f.ruleId === 'ROW-DATE-UNPARSEABLE')).toEqual([]);
    expect(checkMetadataVsData(ds).filter((f) => f.ruleId === 'META-NO-DATES')).toEqual([]);
    // the columns are no measured variables: "No unit is given" does not name them
    expect(ds.variables.map((v) => v.header)).toEqual(['Temperature [degC]']);
  });

  it('an impossible date is reported on its line and not shifted', () => {
    const good = Array.from({ length: 30 }, (_, i) => `1998,${(i % 12) + 1},${(i % 28) + 1},S${i + 3},49.5,0.2,11`);
    const { dataset: ds, findings } = dataset(csv(['1998,2,30,S1,49.4,0.2,10', '1998,13,5,S2,49.6,0.2,12', ...good]));
    const bad = findings.filter((f) => f.ruleId === 'ROW-DATE-UNPARSEABLE');
    expect(bad).toHaveLength(1);
    expect(bad[0].lines).toEqual([2, 3]);
    expect(bad[0].field).toBe('Year');
    expect(bad[0].value).toContain('1998-2-30');
    expect(ds.rows.slice(0, 3).map((r) => r.datetime?.iso)).toEqual([undefined, undefined, '1998-01-01']);
    for (const lang of LANGS) expect(renderPlain(bad[0], lang)).toContain('1998');
  });

  it('without the columns the same sheet still has no date (META-NO-DATES stays)', () => {
    const { dataset: ds } = dataset('Station,Latitude,Longitude,Temperature [degC]\nS1,49.4,0.2,10\nS2,49.5,0.2,11\nS3,49.6,0.2,12');
    expect(checkMetadataVsData(ds).filter((f) => f.ruleId === 'META-NO-DATES')).toHaveLength(1);
  });
});

describe('/convert: the date of the event', () => {
  const header = ['Year', 'Month', 'Day', 'Station', 'Latitude', 'Longitude', 'Species', 'Count'];
  const body: Cell[][] = [
    [1998, 9, 17, 'S1', 49.4, 0.2, 'Solea solea', 4],
    [1998, 10, null, 'S2', 49.5, 0.2, 'Solea solea', 2],
    [1999, null, null, 'S3', 49.6, 0.2, 'Solea solea', 7],
    [1999, 1, 30, 'S4', 49.7, 0.2, 'Solea solea', 1],
  ];
  const input = () => sheetInput(fileOf(header, body), { shape: 'long', quantity: { kind: 'count' }, edit: { Station: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' } } });

  it('proposes the roles and neither writes the columns as measurements nor offers them as taxa', () => {
    const p = proposeConvertColumns(rawSheet(header, body), CTX);
    expect(p.find((x) => x.header === 'Month')!.role).toEqual({ kind: 'datePart', part: 'month' });
    expect(p.find((x) => x.header === 'Day')!.role).toEqual({ kind: 'datePart', part: 'day' });
  });

  it('the samples carry day, month and year precision, never an invented day', () => {
    const r = convert({ sheets: [input()] });
    const dates = r.events.filter((e) => e.eventType === 'sample').map((e) => e.eventDate);
    expect(dates).toEqual(['1998-09-17', '1998-10', '1999', '1999-01-30']);
    expect(r.findings.filter((f) => f.ruleId === 'ROW-DATE-UNPARSEABLE')).toEqual([]);
    expect(r.measurements.filter((m) => m.role === 'variable')).toEqual([]);
    expect(r.findings.filter((f) => f.ruleId === 'CONV-COLUMN-NOT-EXPORTED')).toEqual([]);
  });

  it('Year chosen as the date while Month and Day are date parts: the combination is read, the day is not lost', () => {
    const chosen = sheetInput(fileOf(header, body), { shape: 'long', quantity: { kind: 'count' }, edit: { Year: { kind: 'date' }, Station: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' } } });
    const r = convert({ sheets: [chosen] });
    expect(r.events.filter((e) => e.eventType === 'sample').map((e) => e.eventDate)).toEqual(['1998-09-17', '1998-10', '1999', '1999-01-30']);
  });

  it('an impossible date blocks on its line', () => {
    const bad: Cell[][] = [[1998, 2, 30, 'S1', 49.4, 0.2, 'Solea solea', 4], ...body.slice(1)];
    const r = convert({ sheets: [{ ...input(), file: fileOf(header, bad) }] });
    const f = r.findings.filter((x) => x.ruleId === 'ROW-DATE-UNPARSEABLE');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([2]);
    expect(judge(r.findings).blocking.map((x) => x.ruleId)).toContain('ROW-DATE-UNPARSEABLE');
  });
});
