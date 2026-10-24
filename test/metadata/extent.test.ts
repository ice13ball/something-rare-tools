// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { parseDataciteJson, parseDataciteXml } from '../../src/core/metadata/datacite';
import { parseZenodoRecord } from '../../src/core/metadata/zenodo';

const zen = (md: Record<string, unknown>) => parseZenodoRecord({ id: '1', metadata: md }, 'z');

describe('Zenodo extent', () => {
  it('legacy locations [{lat, lon}] and collected dates [{start, end, type}]', () => {
    const r = zen({
      locations: [{ lat: 54.5, lon: 18.5, place: 'Gdansk Bay' }, { lat: '55.5', lon: '19.5' }],
      dates: [{ start: '2019-05-01', end: '2019-05-30', type: 'collected' }, { start: '2020-01-01', type: 'issued' }],
    });
    expect(r.bbox).toEqual({ west: 18.5, east: 19.5, south: 54.5, north: 55.5 });
    expect(r.temporalExtent).toEqual({ start: '2019-05-01', end: '2019-05-30' });
  });

  it('InvenioRDM features with GeoJSON geometry and EDTF dates', () => {
    const r = zen({
      locations: { features: [{ geometry: { type: 'Point', coordinates: [10, 20] }, place: 'A' }, { geometry: { type: 'Polygon', coordinates: [[[11, 21], [12, 21], [12, 22], [11, 21]]] } }, { place: 'name only' }] },
      dates: [{ date: '2018-03/2018-09', type: { id: 'collected', title: { en: 'Collected' } } }, { date: '2021-01-01', type: { id: 'created' } }],
    });
    expect(r.bbox).toEqual({ west: 10, east: 12, south: 20, north: 22 });
    expect(r.temporalExtent).toEqual({ start: '2018-03', end: '2018-09' });
  });

  it('publication, creation, issued and valid dates are never coverage; a place name or no geometry is no location', () => {
    const r = zen({
      publication_date: '2020-01-01',
      dates: [{ start: '2020-01-01', type: 'created' }, { date: '2020-02-02', type: { id: 'issued' } }, { date: '2020-03-03', type: { id: 'valid' } }, { date: '2020-04-04', type: { id: 'available' } }],
      locations: [{ place: 'Baltic Sea' }],
    });
    expect(r.bbox).toBeUndefined();
    expect(r.temporalExtent).toBeUndefined();
  });

  it('invalid coordinates are not turned into a box; an antimeridian spread becomes all longitudes', () => {
    expect(zen({ locations: [{ lat: 95, lon: 10 }] }).bbox).toBeUndefined();
    expect(zen({ locations: [{ lat: 10, lon: 200 }] }).bbox).toBeUndefined();
    expect(zen({ locations: [{ lat: 1, lon: 179 }, { lat: 3, lon: -179 }] }).bbox).toEqual({ west: -180, east: 180, south: 1, north: 3 });
  });

  it('an open-ended collected interval keeps its open end', () => {
    expect(zen({ dates: [{ date: '2015/..', type: { id: 'collected' } }] }).temporalExtent).toEqual({ start: '2015', end: undefined });
  });
});

describe('DataCite extent', () => {
  const dc = (a: Record<string, unknown>) => parseDataciteJson({ data: { attributes: a } }, 'd');

  it('reads a polygon as the box of its vertices (inPolygonPoint ignored)', () => {
    const r = dc({
      geoLocations: [{ geoLocationPolygon: [{ polygonPoint: { pointLongitude: 5, pointLatitude: 50 } }, { polygonPoint: { pointLongitude: 7, pointLatitude: 51 } }, { polygonPoint: { pointLongitude: 6, pointLatitude: 52 } }, { inPolygonPoint: { pointLongitude: 100, pointLatitude: 0 } }] }],
    });
    expect(r.bbox).toEqual({ west: 5, east: 7, south: 50, north: 52 });
  });

  it('only Collected / Coverage dates; several merge; Issued/Created/Valid never', () => {
    const r = dc({
      dates: [{ date: '2017-06-01/2017-06-30', dateType: 'Collected' }, { date: '2018-02-01/2018-02-10', dateType: 'Collected' }, { date: '2024-01-01', dateType: 'Issued' }, { date: '2024-02-01', dateType: 'Created' }, { date: '2025', dateType: 'Valid' }],
    });
    expect(r.temporalExtent).toEqual({ start: '2017-06-01', end: '2018-02-10' });
    expect(dc({ dates: [{ date: '2024-01-01', dateType: 'Issued' }] }).temporalExtent).toBeUndefined();
  });

  it('a box off the globe is dropped; a single antimeridian box is kept; a crossing box in a union widens to all longitudes', () => {
    const box = (w: number, e: number, s: number, n: number) => ({ geoLocationBox: { westBoundLongitude: w, eastBoundLongitude: e, southBoundLatitude: s, northBoundLatitude: n } });
    expect(dc({ geoLocations: [box(0, 10, 0, 95)] }).bbox).toBeUndefined();
    expect(dc({ geoLocations: [box(170, -170, -5, 5)] }).bbox).toEqual({ west: 170, east: -170, south: -5, north: 5 });
    expect(dc({ geoLocations: [box(170, -170, -5, 5), box(0, 10, 0, 8)] }).bbox).toEqual({ west: -180, east: 180, south: -5, north: 8 });
  });

  it('XML: polygon and Collected', () => {
    const xml = `<resource xmlns="http://datacite.org/schema/kernel-4"><identifier identifierType="DOI">10.1/x</identifier><dates><date dateType="Collected">2001/2002</date><date dateType="Issued">2010</date></dates><geoLocations><geoLocation><geoLocationPolygon><polygonPoint><pointLongitude>1</pointLongitude><pointLatitude>2</pointLatitude></polygonPoint><polygonPoint><pointLongitude>3</pointLongitude><pointLatitude>4</pointLatitude></polygonPoint></geoLocationPolygon></geoLocation></geoLocations></resource>`;
    const r = parseDataciteXml(xml, 'x');
    expect(r.bbox).toEqual({ west: 1, east: 3, south: 2, north: 4 });
    expect(r.temporalExtent).toEqual({ start: '2001', end: '2002' });
  });
});
