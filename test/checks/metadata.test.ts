// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { checkMetadataVsData } from '../../src/core/checks/metadata';
import type { Dataset, Finding, MetadataRecord } from '../../src/core/types';
import { makeDataset, makeRecord } from '../helpers/build';

const only = (f: Finding[], id: string) => f.filter((x) => x.ruleId === id);
const withMeta = (ds: Dataset, ...records: MetadataRecord[]): Dataset => ({ ...ds, metadata: records });
const extent = { start: '2019-06-21', end: '2021-08-16' };

describe('META-DATE-OUTSIDE-EXTENT', () => {
  const ds = makeDataset([{ datetime: '2020-01-01' }, { datetime: '2016-07-06', line: 82 }, { datetime: '2021-08-16T14:30' }, { datetime: '2022-01-01' }, {}]);

  it('reports rows outside the extent with their lines; end day is inclusive even for datetimes', () => {
    const f = only(checkMetadataVsData(withMeta(ds, makeRecord('iso19139', { temporalExtent: extent }))), 'META-DATE-OUTSIDE-EXTENT');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', file: 'data.csv', lines: [5, 82], value: '2016-07-06', params: { start: '2019-06-21', end: '2021-08-16', count: 2 } });
  });

  it('dates exactly on the extent end or start give no finding', () => {
    const d = makeDataset([{ datetime: '2019-06-21' }, { datetime: '2021-08-16' }]);
    expect(only(checkMetadataVsData(withMeta(d, makeRecord('iso19139', { temporalExtent: extent }))), 'META-DATE-OUTSIDE-EXTENT')).toEqual([]);
  });

  it('truncates a datetime extent to the day', () => {
    const d = makeDataset([{ datetime: '2021-08-16' }, { datetime: '2021-08-17' }]);
    const f = only(checkMetadataVsData(withMeta(d, makeRecord('iso19139', { temporalExtent: { start: '2019-06-21T00:00:00Z', end: '2021-08-16T23:59:59Z' } }))), 'META-DATE-OUTSIDE-EXTENT');
    expect(f).toHaveLength(1);
    expect(f[0].params.count).toBe(1);
  });

  it('compares at the precision of coarse dates (a month inside the extent is not outside)', () => {
    const d = makeDataset([{ datetime: '2020-07' }, { datetime: '2021' }, { datetime: '2022' }]);
    const f = only(checkMetadataVsData(withMeta(d, makeRecord('iso19139', { temporalExtent: extent }))), 'META-DATE-OUTSIDE-EXTENT');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([4]);
  });

  it('uses the ISO extent over DataCite, DataCite over PANGAEA, and never the union', () => {
    const d = makeDataset([{ datetime: '2020-01-01' }]);
    const iso = makeRecord('iso19139', { temporalExtent: { start: '2020-06-01', end: '2020-07-01' } });
    const dc = makeRecord('datacite', { temporalExtent: { start: '2019-01-01', end: '2021-01-01' } });
    const pg = makeRecord('pangaea', { temporalExtent: { start: '2019-01-01', end: '2021-01-01' } });
    expect(only(checkMetadataVsData(withMeta(d, dc, iso)), 'META-DATE-OUTSIDE-EXTENT')).toHaveLength(1);
    expect(only(checkMetadataVsData(withMeta(d, dc, pg)), 'META-DATE-OUTSIDE-EXTENT')).toEqual([]);
    const dc2 = makeRecord('datacite', { temporalExtent: { start: '2020-06-01', end: '2020-07-01' } });
    expect(only(checkMetadataVsData(withMeta(d, pg, dc2)), 'META-DATE-OUTSIDE-EXTENT')).toHaveLength(1);
  });

  it('no extent, no check; an open end only checks the start', () => {
    const d = makeDataset([{ datetime: '2030-01-01' }]);
    expect(only(checkMetadataVsData(withMeta(d, makeRecord('iso19139'))), 'META-DATE-OUTSIDE-EXTENT')).toEqual([]);
    expect(only(checkMetadataVsData(withMeta(d, makeRecord('iso19139', { temporalExtent: { start: '2020-01-01' } }))), 'META-DATE-OUTSIDE-EXTENT')).toEqual([]);
  });
});

describe('META-POINT-OUTSIDE-BBOX', () => {
  const bbox = { west: -16, east: -5, south: 70.7, north: 73.2 };
  const rec = makeRecord('iso19139', { bbox });

  it('reports rows outside, with lines and an example "lat, lon"', () => {
    const d = makeDataset([
      { lat: 71, lon: -10, latDecimals: 0, lonDecimals: 0 },
      { lat: 60.5, lon: -10, latDecimals: 1, lonDecimals: 0 },
      { lat: 72, lon: 20.25, latDecimals: 0, lonDecimals: 2 },
    ]);
    const f = only(checkMetadataVsData(withMeta(d, rec)), 'META-POINT-OUTSIDE-BBOX');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', lines: [3, 4], value: '60.5, -10', params: { west: -16, east: -5, south: 70.7, north: 73.2, count: 2 } });
  });

  it('is inclusive on the edge, and tolerates half a unit of the reported precision', () => {
    const d = makeDataset([
      { lat: 70.7, lon: -16, latDecimals: 1, lonDecimals: 0 },
      { lat: 73.24, lon: -5, latDecimals: 2, lonDecimals: 0 },      // 73.24 <= 73.2 + 0.005 + 0.05
      { lat: 73.26, lon: -5, latDecimals: 2, lonDecimals: 0 },      // 73.26 >  73.255
      { lat: 72, lon: -4.4, latDecimals: 0, lonDecimals: 1 },       // -4.4 > -5 + 0.5 (bbox, 0 decimals) + 0.05 (row, 1 decimal)
    ]);
    const f = only(checkMetadataVsData(withMeta(d, rec)), 'META-POINT-OUTSIDE-BBOX');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([4, 5]);
  });

  it('a degenerate single-point bbox still applies', () => {
    const point = makeRecord('datacite', { bbox: { west: 16.5, east: 16.5, south: 76.9, north: 76.9 } });
    const d = makeDataset([{ lat: 76.9, lon: 16.5, latDecimals: 1, lonDecimals: 1 }, { lat: 77.5, lon: 16.5, latDecimals: 1, lonDecimals: 1 }]);
    const f = only(checkMetadataVsData(withMeta(d, point)), 'META-POINT-OUTSIDE-BBOX');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([3]);
  });

  it('skips rows without a position and handles an antimeridian box', () => {
    const am = makeRecord('iso19139', { bbox: { west: 170, east: -170, south: -10, north: 10 } });
    const d = makeDataset([{ lat: 0, lon: 175, latDecimals: 0, lonDecimals: 0 }, { lat: 0, lon: -175, latDecimals: 0, lonDecimals: 0 }, { lat: 0, lon: 0, latDecimals: 0, lonDecimals: 0 }, {}]);
    const f = only(checkMetadataVsData(withMeta(d, am)), 'META-POINT-OUTSIDE-BBOX');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([4]);
  });
});

describe('META-VARIABLE-MISSING', () => {
  const abstract = 'Data include temperature, salinity, nutrients and dissolved silica measured in the fjord.';
  const rec = makeRecord('iso19139', { abstract });

  it('reports the matched term when no variable has that canonical (longest term wins)', () => {
    const d = makeDataset([{}], [{ key: 'T', header: 'T', canonical: 'temperature' }, { key: 'S', header: 'S', canonical: 'salinity' }]);
    const f = only(checkMetadataVsData(withMeta(d, rec)), 'META-VARIABLE-MISSING');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', value: 'dissolved silica', params: { term: 'dissolved silica' } });
  });

  it('a silicate canonical (e.g. an SiO4 column) satisfies the abstract', () => {
    const d = makeDataset([{}], [{ key: 'SiO4', header: 'SiO4', canonical: 'silicate' }, { canonical: 'temperature' }, { canonical: 'salinity' }]);
    expect(only(checkMetadataVsData(withMeta(d, rec)), 'META-VARIABLE-MISSING')).toEqual([]);
  });

  it('a header containing the term also satisfies it, case-insensitively', () => {
    const d = makeDataset([{}], [{ key: 'x', header: 'Dissolved Silica (umol/L)' }, { canonical: 'temperature' }, { canonical: 'salinity' }]);
    expect(only(checkMetadataVsData(withMeta(d, rec)), 'META-VARIABLE-MISSING')).toEqual([]);
  });

  it('nitrate+nitrite covers both nitrate and nitrite', () => {
    const r = makeRecord('iso19139', { abstract: 'Nitrate and nitrite were measured.' });
    const d = makeDataset([{}], [{ key: 'NOx', header: 'NOx', canonical: 'nitrate+nitrite' }]);
    expect(only(checkMetadataVsData(withMeta(d, r)), 'META-VARIABLE-MISSING')).toEqual([]);
    const d2 = makeDataset([{}], [{ key: 'q', header: 'q', canonical: 'salinity' }]);
    expect(only(checkMetadataVsData(withMeta(d2, r)), 'META-VARIABLE-MISSING').map((x) => x.value).sort()).toEqual(['nitrate', 'nitrite']);
  });

  it('uses word boundaries: "salinity" is not found inside another word, short acronyms need their case', () => {
    const r = makeRecord('iso19139', { abstract: 'Hypersalinity events; the Dr. Pocock cruise; a didactic note.' });
    const d = makeDataset([{}], [{ key: 'q', header: 'q', canonical: 'oxygen' }]);
    expect(only(checkMetadataVsData(withMeta(d, r)), 'META-VARIABLE-MISSING')).toEqual([]);
  });

  it('reports each canonical once even if several of its terms occur', () => {
    const r = makeRecord('iso19139', { abstract: 'Silica, silicate and dissolved silica.' });
    const d = makeDataset([{}], [{ key: 'q', header: 'q', canonical: 'salinity' }]);
    expect(only(checkMetadataVsData(withMeta(d, r)), 'META-VARIABLE-MISSING')).toHaveLength(1);
  });

  it('a term used as a modifier of an instrument, process or feature is not a promised column', () => {
    const r = makeRecord('iso19139', { abstract: 'Synthetic survey: samples were taken where chlorophyll-a fluorescence peaked (the chlorophyll-a maximum layer); an oxygen sensor logged oxygen evolution.' });
    const d = makeDataset([{}], [{ key: 'q', header: 'q', canonical: 'salinity' }]);
    expect(only(checkMetadataVsData(withMeta(d, r)), 'META-VARIABLE-MISSING')).toEqual([]);
    const r2 = makeRecord('iso19139', { abstract: 'Chlorophyll-a fluorescence was used; chlorophyll a was also reported.' });
    expect(only(checkMetadataVsData(withMeta(d, r2)), 'META-VARIABLE-MISSING').map((x) => x.value)).toEqual(['chlorophyll']);
  });

  it('is skipped for one sheet of a workbook and for a record with several data files', () => {
    const vars = [{ key: 'q', header: 'q', canonical: 'salinity' }];
    const sheet = makeDataset([{}], vars, { label: 'book.xlsx (Sheet2)', file: 'book.xlsx' });
    expect(only(checkMetadataVsData(withMeta(sheet, rec)), 'META-VARIABLE-MISSING')).toEqual([]);
    const multi = makeRecord('iso19139', {
      abstract,
      distributionLinks: [{ url: 'https://example.org/a_1.csv' }, { url: 'https://example.org/a_2.csv?x=1' }, { url: 'https://doi.org/10.1/x' }],
    });
    expect(only(checkMetadataVsData(withMeta(makeDataset([{}], vars), multi)), 'META-VARIABLE-MISSING')).toEqual([]);
    const single = makeRecord('iso19139', { abstract, distributionLinks: [{ url: 'https://example.org/a_1.csv' }, { url: 'https://doi.org/10.1/x' }] });
    expect(only(checkMetadataVsData(withMeta(makeDataset([{}], vars), single)), 'META-VARIABLE-MISSING').length).toBeGreaterThan(0);
  });

  it('does nothing without an abstract, without variables, or when no variable is recognised', () => {
    const d = makeDataset([{}], [{ canonical: 'temperature' }]);
    expect(only(checkMetadataVsData(withMeta(d, makeRecord('iso19139'))), 'META-VARIABLE-MISSING')).toEqual([]);
    expect(only(checkMetadataVsData(withMeta(makeDataset([{}], []), rec)), 'META-VARIABLE-MISSING')).toEqual([]);
    // columns the vocabulary does not recognise: nothing can be said about what is missing
    expect(only(checkMetadataVsData(withMeta(makeDataset([{}], [{ key: 'GPP', header: 'GPP' }]), rec)), 'META-VARIABLE-MISSING')).toEqual([]);
  });
});

describe('META-NO-DATES', () => {
  it('error when no row has a date and no record has an extent', () => {
    const f = only(checkMetadataVsData(withMeta(makeDataset([{}, {}]), makeRecord('zenodo'))), 'META-NO-DATES');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'error', file: 'data.csv' });
  });

  it('not when a row has a date, an unparseable date text, or a record has a temporal extent (e.g. DataCite Collected)', () => {
    expect(only(checkMetadataVsData(makeDataset([{}, { datetime: '2020-01-01' }])), 'META-NO-DATES')).toEqual([]);
    expect(only(checkMetadataVsData(makeDataset([{ dateRaw: 'sometime' }])), 'META-NO-DATES')).toEqual([]);
    expect(only(checkMetadataVsData(withMeta(makeDataset([{}]), makeRecord('datacite', { temporalExtent: { start: '2020-01-01', end: '2020-01-01' } }))), 'META-NO-DATES')).toEqual([]);
  });

  it('a dataset without rows is not reported', () => {
    expect(only(checkMetadataVsData(makeDataset([])), 'META-NO-DATES')).toEqual([]);
  });
});
