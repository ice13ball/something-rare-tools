// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// DWC-EVENTDATE-NOT-ISO: a column headed exactly eventDate whose values are not ISO 8601. Every value is invented.
import { describe, expect, it } from 'vitest';
import { isIsoEventDate } from '../../src/core/checks/dwc';
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
const notIso = (fs: Finding[]): Finding[] => fs.filter((f) => f.ruleId === 'DWC-EVENTDATE-NOT-ISO');
const table = (head: string, values: string[]): Finding[] =>
  check(textFile('d.csv', [`occurrenceID,${head},decimalLatitude,decimalLongitude,scientificName,occurrenceStatus,basisOfRecord`, ...values.map((v, i) => `o${i},${v},49.4,0.2,Abra alba,present,HumanObservation`)].join('\n')));

describe('isIsoEventDate', () => {
  it('accepts the Darwin Core forms', () => {
    for (const ok of ['2011', '2011-06', '2011-06-14', '2011-06-14T10:00', '2011-06-14T10:00:30', '2011-06-14T10:00:30.5', '2011-06-14T10:00Z', '2011-06-14T10:00+02:00', '2011-06-14T10:00-0600', '2011-06-14T10Z', '2011-06-14/2011-06-20', '2011-06/2011-08', '2011/2013', '2011-06-14T10:00Z/2011-06-14T11:00Z', '2011-06-14/20', '2011-06-14/07-02', '2011-06-14T10:00/11:30Z', ' 2011-06-14 ', '2012-02-29']) {
      expect(isIsoEventDate(ok), ok).toBe(true);
    }
  });

  it('refuses the rest', () => {
    for (const bad of ['14.06.2011', '14/06/2011', '06/14/2011', '2011-6-14', '2011-13-01', '2011-02-30', '2011-02-29', '2011-06-14 10:00', '2011-06T10:00', '20110614', '40708', '14 June 2011', '2011-06-14/', '/2011-06-14', '2011-06-14/31', '2011-06-14/2011-06-20/2011-06-21', '2011-06-14T25:00', '2011-06-14/11:30', 'June 2011', 'spring 2011']) {
      expect(isIsoEventDate(bad), bad).toBe(false);
    }
  });
});

describe('DWC-EVENTDATE-NOT-ISO', () => {
  it('14.06.2011 under eventDate fires once, with the column, the example and every line', () => {
    const f = notIso(table('eventDate', ['2011-06-14', '14.06.2011', '15.06.2011', '2011-06']));
    expect(f).toHaveLength(1);
    expect(f[0].field).toBe('eventDate');
    expect(f[0].value).toBe('14.06.2011');
    expect(f[0].lines).toEqual([3, 4]);
    expect(f[0].params).toEqual({ count: 2 });
    expect(f[0].severity).toBe('warning');
  });

  it('ISO values never fire, blanks are skipped (the empty-column rules own them)', () => {
    expect(notIso(table('eventDate', ['2011-06-14', '2011-06', '2011', '2011-06-14T10:00Z', '2011-06-14/2011-06-20', '2011-06-14/20', '']))).toEqual([]);
  });

  it('under Date, and under a header that is not exactly eventDate, it never fires', () => {
    expect(notIso(table('Date', ['14.06.2011', '15.06.2011']))).toEqual([]);
    expect(notIso(table('eventdate', ['14.06.2011']))).toEqual([]);
    expect(notIso(table('verbatimEventDate', ['14.06.2011']))).toEqual([]);
  });

  it('the dwc: prefix is the same term', () => {
    expect(notIso(table('dwc:eventDate', ['14.06.2011']))).toHaveLength(1);
  });

  it('an xlsx plain number is not ISO, a date-formatted cell is not judged, a year number is a year', () => {
    const head = ['occurrenceID', 'eventDate', 'decimalLatitude', 'decimalLongitude', 'scientificName', 'occurrenceStatus', 'basisOfRecord'];
    const tail = [49.4, 0.2, 'Abra alba', 'present', 'HumanObservation'];
    const book = (cell: string | number | ReturnType<typeof dateCell>): Finding[] => notIso(check(xlsxFile('b.xlsx', { S: [head, ['o1', cell, ...tail], ['o2', '2011-06-14', ...tail]] })));
    expect(book(40708)).toHaveLength(1);
    expect(book(dateCell(40708))).toEqual([]);
    expect(book(2011)).toEqual([]);
  });

  it('has a text in four languages, changes nothing and advises no deletion', () => {
    const f = notIso(table('eventDate', ['14.06.2011']))[0];
    for (const lang of LANGS) {
      const t = renderPlain(f, lang);
      expect(t, lang).not.toMatch(/[{}]/);
      expect(t, lang).toContain('14.06.2011');
      expect(t, lang).toContain('2011-06-14T10:00Z');
      expect(t, lang).not.toMatch(/delete|remove|usuń|lösch|entfern|supprim/i);
    }
  });
});
