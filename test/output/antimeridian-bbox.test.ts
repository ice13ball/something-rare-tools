// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The metadata draft's bounding box across the antimeridian: the smallest interval of longitudes, west > east when it crosses 180. Synthetic points only.
import { describe, expect, it } from 'vitest';
import { parseDataciteXml } from '../../src/core/metadata/datacite';
import { parseIso19139 } from '../../src/core/metadata/iso19139';
import { draftToDataciteXml } from '../../src/core/output/datacite';
import { metadataDraft, smallestLonInterval } from '../../src/core/output/draft';
import { draftToIso19139 } from '../../src/core/output/iso19139';
import { dataset, row } from './ds';

const boxOf = (lons: number[], lat = 10) => metadataDraft([dataset(lons.map((lon, i) => row(i + 2, { lat: lat + i / 10, lon })))], []).bbox;

describe('smallestLonInterval', () => {
  it('points at 178, 179, -179, -178 give 178 to -178', () => {
    expect(smallestLonInterval([178, 179, -179, -178])).toEqual({ west: 178, east: -178 });
    expect(smallestLonInterval([-178, 178, -179, 179])).toEqual({ west: 178, east: -178 });
  });

  it('ordinary data keeps the plain minimum and maximum', () => {
    expect(smallestLonInterval([15.1, 16.25, 15.5])).toEqual({ west: 15.1, east: 16.25 });
    expect(smallestLonInterval([-60, -10, 5])).toEqual({ west: -60, east: 5 });
    expect(smallestLonInterval([20])).toEqual({ west: 20, east: 20 });
    expect(smallestLonInterval([-179, 179])).toEqual({ west: 179, east: -179 });
  });

  it('a global spread keeps the plain bounds', () => {
    expect(smallestLonInterval([-179, -90, 0, 90, 179])).toEqual({ west: -179, east: 179 });
    expect(smallestLonInterval([-170, -60, 60, 170])).toEqual({ west: -170, east: 170 });
    expect(smallestLonInterval([-180, -120, -60, 0, 60, 120, 180])).toEqual({ west: -180, east: 180 });
  });

  it('a regional spread that straddles 180 over many degrees is still the short way round', () => {
    expect(smallestLonInterval([150, 170, -170, -150])).toEqual({ west: 150, east: -150 });
  });
});

describe('the draft', () => {
  it('data across the antimeridian gives west > east; latitudes are unchanged', () => {
    expect(boxOf([178, 179, -179, -178])).toEqual({ west: 178, east: -178, south: 10, north: 10.3 });
  });
  it('ordinary data is unchanged, and out-of-range longitudes are still left out', () => {
    expect(boxOf([15.1, 16.25, 15.5, 400])).toEqual({ west: 15.1, east: 16.25, south: 10, north: 10.2 });
    expect(metadataDraft([dataset([row(2, { lat: 95, lon: 400 })])], []).bbox).toBeUndefined();
  });

  it('ISO 19139 and DataCite write west and east as they are and read back as the same box', () => {
    const draft = metadataDraft([dataset([178, 179, -179].map((lon, i) => row(i + 2, { lat: 5 + i, lon })))], []);
    const iso = draftToIso19139(draft);
    const fromIso = parseIso19139(iso, 'iso');
    expect(fromIso.bbox).toMatchObject({ west: 178, east: -179 });
    const dc = draftToDataciteXml(draft);
    expect(dc).toContain('<westBoundLongitude>178</westBoundLongitude>');
    expect(dc).toContain('<eastBoundLongitude>-179</eastBoundLongitude>');
    expect(parseDataciteXml(dc, 'dc').bbox).toMatchObject({ west: 178, east: -179 });
  });
});
