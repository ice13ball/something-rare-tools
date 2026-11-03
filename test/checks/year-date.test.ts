// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// ROW-YEAR-DATE-MISMATCH: a Year column beside a date column whose year is not the year of the date. Every value is invented.
import { describe, expect, it } from 'vitest';
import { runChecks } from '../../src/core/checks/run';
import { buildDatasets } from '../../src/core/dataset';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import { renderPlain } from '../../src/core/report';
import { LANGS } from '../../src/core/types';
import type { Finding, ParsedFile } from '../../src/core/types';
import { dateCell, textFile, xlsxFile } from '../helpers/files';

const check = (file: ParsedFile): Finding[] => {
  const layout = proposeLayout(file);
  const built = buildDatasets(file, layout, proposeMappings(file, layout), [], 'ds');
  return runChecks({ datasets: built.datasets, records: [], parseFindings: [...file.findings, ...built.findings] }, { today: '2026-10-24' }).findings;
};
const mismatch = (fs: Finding[]): Finding[] => fs.filter((f) => f.ruleId === 'ROW-YEAR-DATE-MISMATCH');
const sheet = (rows: string[], head = 'Station,Latitude,Longitude,Date,Year,Temp [°C]'): Finding[] => check(textFile('s.csv', [head, ...rows].join('\n')));

describe('ROW-YEAR-DATE-MISMATCH', () => {
  it('a date of 2019 beside the year 2020 fires once, naming the Year column, the date column and the lines', () => {
    const f = mismatch(sheet(['S1,49.4,0.2,2019-03-04,2020,11.2', 'S2,49.5,0.3,2020-03-05,2020,10.4']));
    expect(f).toHaveLength(1);
    expect(f[0].field).toBe('Year');
    expect(f[0].lines).toEqual([2]);
    expect(f[0].params).toEqual({ count: 1, date: 'Date', year: '2020' });
    expect(f[0].value).toBe('2019-03-04');
  });

  it('a mismatch on many rows is ONE finding with a count and every line', () => {
    const rows = Array.from({ length: 12 }, (_, i) => `S${i},49.4,0.2,2019-03-${String(i + 1).padStart(2, '0')},2020,11.2`);
    const f = mismatch(sheet(rows));
    expect(f).toHaveLength(1);
    expect(f[0].params.count).toBe(12);
    expect(f[0].lines).toHaveLength(12);
  });

  it('matching years never fire, 2020.0 in a text or a number cell is 2020', () => {
    expect(mismatch(sheet(['S1,49.4,0.2,2020-03-04,2020.0,11.2', 'S2,49.5,0.3,2020-03-05, 2020 ,10.4']))).toEqual([]);
    expect(mismatch(sheet(['S1,49.4,0.2,2019-03-04,2020.0,11.2']))).toHaveLength(1);
  });

  it('a text year, a blank year and a year of another shape say nothing', () => {
    expect(mismatch(sheet(['S1,49.4,0.2,2019-03-04,n/a,11.2', 'S2,49.5,0.3,2019-03-05,,10.4', 'S3,49.5,0.3,2019-03-06,20,10.1', 'S4,49.5,0.3,2019-03-07,spring,9.9']))).toEqual([]);
  });

  it('a date built from the Year column itself (year, month, day) never fires', () => {
    expect(mismatch(check(textFile('s.csv', ['Station,Latitude,Longitude,Year,Month,Day,Temp [°C]', 'S1,49.4,0.2,2019,3,4,11.2', 'S2,49.5,0.3,2020,3,5,10.4'].join('\n'))))).toEqual([]);
  });

  it('a date column that holds only years is its own year', () => {
    expect(mismatch(check(textFile('s.csv', ['Station,Latitude,Longitude,Year,Temp [°C]', 'S1,49.4,0.2,2019,11.2', 'S2,49.5,0.3,2020,10.4'].join('\n'))))).toEqual([]);
  });

  it('a year-only date is never compared', () => {
    expect(mismatch(sheet(['S1,49.4,0.2,2019,2020,11.2', 'S2,49.5,0.3,2018,2020,10.4']))).toEqual([]);
  });

  it('a date range is right for any year it covers, and wrong outside it', () => {
    const crossing = (year: number): Finding[] => mismatch(sheet([`S1,49.4,0.2,2019-12-30/2020-01-02,${year},11.2`, `S2,49.5,0.3,2019-12-30/2020-01-02,${year},10.4`]));
    expect(crossing(2019)).toEqual([]);
    expect(crossing(2020)).toEqual([]);
    expect(crossing(2021)).toHaveLength(1);
  });

  it('an xlsx date cell beside a number cell: 2020-03-04 with 2020 is fine, with 2019 it fires', () => {
    const head = ['Station', 'Latitude', 'Longitude', 'Date', 'Year', 'Temp [°C]'];
    const book = (year: number): Finding[] => mismatch(check(xlsxFile('b.xlsx', { S: [head, ['S1', 49.4, 0.2, dateCell(43894), year, 11.2], ['S2', 49.5, 0.3, dateCell(43895), year, 10.4]] })));
    expect(book(2020)).toEqual([]);
    const f = book(2019);
    expect(f).toHaveLength(1);
    expect(f[0].params.count).toBe(2);
  });

  it('Darwin Core: a year column beside an eventDate', () => {
    const t = ['occurrenceID,eventDate,year,decimalLatitude,decimalLongitude,scientificName,occurrenceStatus,basisOfRecord', 'o1,2019-03-04,2020,49.4,0.2,Abra alba,present,HumanObservation', 'o2,2020-03-05,2020,49.4,0.2,Abra alba,present,HumanObservation'].join('\n');
    const f = mismatch(check(textFile('d.csv', t)));
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([2]);
  });

  it('a long sheet: the year of the row is read, the rows merge as before', () => {
    const lines = ['Station,Latitude,Longitude,Date,Year,Parameter,Value'];
    for (const s of ['S1', 'S2', 'S3']) for (const p of ['Corg', 'Ntot', 'Ptot']) lines.push(`${s},49.4,0.2,2019-03-04,${s === 'S2' ? 2020 : 2019},${p},${p.length}.${s.length}`);
    const f = mismatch(check(textFile('l.csv', lines.join('\n'))));
    expect(f).toHaveLength(1);
    expect(f[0].params.count).toBe(1);
  });

  it('a date read with a guess about its order (14-06-11, 25-03-04) says nothing about its year', () => {
    expect(mismatch(sheet(['S1,49.4,0.2,14-06-11,2011,11.2']))).toEqual([]);
    expect(mismatch(sheet(['S1,49.4,0.2,25-03-04,1925,11.2']))).toEqual([]);
    // the same date written in full is compared
    expect(mismatch(sheet(['S1,49.4,0.2,2014-06-11,2011,11.2']))).toHaveLength(1);
  });

  it.each(['Year', 'Jahr', 'Rok', 'Année', 'yyyy', 'Sampling year'])('a column called %s beside a full Date column is a Year column', (name) => {
    const f = mismatch(sheet(['S1,49.4,0.2,2019-03-04,2020,11.2', 'S2,49.5,0.3,2020-03-05,2020,10.4'], `Station,Latitude,Longitude,Date,${name},Temp [°C]`));
    expect(f).toHaveLength(1);
    expect(f[0].field).toBe(name);
  });

  it('Publication year is not the year of the sampling: silent', () => {
    expect(mismatch(sheet(['S1,49.4,0.2,2019-03-04,2020,11.2'], 'Station,Latitude,Longitude,Date,Publication year,Temp [°C]'))).toEqual([]);
  });

  it('a Year of 9999 or 0000 is a code, not a year: silent; 1700 and next year are years', () => {
    expect(mismatch(sheet(['S1,49.4,0.2,2019-03-04,9999,11.2', 'S2,49.5,0.3,2019-03-05,0000,10.4', 'S3,49.5,0.3,2019-03-06,1699,10.4']))).toEqual([]);
    expect(mismatch(sheet(['S1,49.4,0.2,2019-03-04,1700,11.2']))).toHaveLength(1);
  });

  it('a range that overlaps the year is silent; a range wholly outside it fires', () => {
    expect(mismatch(sheet(['S1,49.4,0.2,2019-03-04/2020-03-05,2020,11.2', 'S2,49.5,0.3,2019-03-04/2020-03-05,2019,10.4']))).toEqual([]);
    const f = mismatch(sheet(['S1,49.4,0.2,2019-03-04/2019-03-09,2021,11.2']));
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([2]);
  });

  it('next year is a year and the year after is a code, with today in 2026: 2027 fires, 2028 is silent', () => {
    expect(mismatch(sheet(['S1,49.4,0.2,2019-03-04,2027,11.2']))).toHaveLength(1);
    expect(mismatch(sheet(['S1,49.4,0.2,2019-03-04,2028,11.2']))).toEqual([]);
  });

  it('says that the column may mean something else, such as a cruise or a season, in four languages', () => {
    const f = mismatch(sheet(['S1,49.4,0.2,2019-03-04,2020,11.2']))[0];
    const said: Record<string, RegExp> = { en: /cruise or a season/, pl: /rejs lub sezon/, de: /Fahrt oder eine Saison/, fr: /campagne ou une saison/ };
    for (const lang of LANGS) expect(renderPlain(f, lang), lang).toMatch(said[lang]);
  });

  it('is a warning with a text in four languages that changes nothing and advises no deletion', () => {
    const f = mismatch(sheet(['S1,49.4,0.2,2019-03-04,2020,11.2']))[0];
    expect(f.severity).toBe('warning');
    for (const lang of LANGS) {
      const t = renderPlain(f, lang);
      expect(t, lang).not.toMatch(/[{}]/);
      expect(t, lang).toContain('2019-03-04');
      expect(t, lang).toContain('2020');
      expect(t, lang).not.toMatch(/delete|remove|usuń|lösch|entfern|supprim/i);
    }
  });
});
