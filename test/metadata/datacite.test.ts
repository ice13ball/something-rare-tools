// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDataciteJson, parseDataciteXml } from '../../src/core/metadata/datacite';

const fx = (n: string) => readFileSync(join(__dirname, '..', 'fixtures', n), 'utf-8');
const json = (n: string) => JSON.parse(fx(n)) as { data: { attributes: Record<string, unknown> } };

describe('parseDataciteJson', () => {
  it('rightsList [] gives no licences, and reads the rest of the attributes', () => {
    const rec = parseDataciteJson(json('datacite-empty-rights.json'), 'dc-empty');
    expect(rec.source).toBe('datacite');
    expect(rec.label).toBe('dc-empty');
    expect(rec.licences).toHaveLength(0);
    expect(rec.title).toBe('Synthetic record without rights');
    expect(rec.abstract).toBe('Invented abstract.');
    expect(rec.version).toBe('1');
    expect(rec.doi).toBe('10.0000/synthetic-empty');
    expect(rec.landingUrl).toBe('https://repo.example.org/resources/records/00000000-0000-4000-8000-000000000001');
    expect(rec.resourceType).toBe('Dataset');
    expect(rec.temporalExtent).toBeUndefined();
  });

  it('parses a geoLocationBox given as strings', () => {
    const rec = parseDataciteJson(json('datacite-empty-rights.json'), 'x');
    expect(rec.bbox).toEqual({ west: 10.5, east: 12.25, south: -5.5, north: 7.75 });
  });

  it('rightsIdentifier cc-by-4.0 + rightsUri gives SPDX CC-BY-4.0', () => {
    const rec = parseDataciteJson(json('datacite-spdx.json'), 'dc-spdx');
    expect(rec.licences).toEqual([
      {
        source: 'datacite',
        field: 'rightsList[0]',
        text: 'Creative Commons Attribution 4.0 International',
        uri: 'https://creativecommons.org/licenses/by/4.0/legalcode',
        spdx: 'CC-BY-4.0',
      },
    ]);
    expect(rec.abstract).toBe('Invented abstract of synthetic CTD casts.');
  });

  it('takes the Collected interval as temporal extent and unions box with point', () => {
    const rec = parseDataciteJson(json('datacite-spdx.json'), 'x');
    expect(rec.temporalExtent).toEqual({ start: '2019-07-14T00:00:00', end: '2019-08-02T12:30:00' });
    expect(rec.bbox).toEqual({ west: 10.5, east: 13, south: -5.5, north: 8 });
  });

  it('free text "CC BY" stays unnormalised; empty rights objects are skipped but indexes are kept', () => {
    const rec = parseDataciteJson(json('datacite-freetext.json'), 'x');
    expect(rec.licences).toEqual([{ source: 'datacite', field: 'rightsList[0]', text: 'CC BY' }]);
    expect(rec.temporalExtent).toEqual({ start: '2020-03-01', end: undefined });
    expect(rec.bbox).toBeUndefined();
  });

  it('accepts bare attributes and an {attributes} wrapper as well as {data:{attributes}}', () => {
    const attrs = json('datacite-spdx.json').data.attributes;
    expect(parseDataciteJson(attrs, 'x').licences[0].spdx).toBe('CC-BY-4.0');
    expect(parseDataciteJson({ attributes: attrs }, 'x').licences[0].spdx).toBe('CC-BY-4.0');
  });

  it('uses a point alone as a degenerate box, never as 0 for missing values', () => {
    const rec = parseDataciteJson({ geoLocations: [{ geoLocationPoint: { pointLongitude: 5, pointLatitude: 6 } }] }, 'x');
    expect(rec.bbox).toEqual({ west: 5, east: 5, south: 6, north: 6 });
    const bad = parseDataciteJson({ geoLocations: [{ geoLocationBox: { westBoundLongitude: '', eastBoundLongitude: '2', southBoundLatitude: '1', northBoundLatitude: '3' } }, { geoLocationPoint: { pointLongitude: '7' } }] }, 'x');
    expect(bad.bbox).toBeUndefined();
  });

  it('tolerates non-record input without throwing', () => {
    expect(parseDataciteJson(null, 'x').licences).toEqual([]);
    expect(parseDataciteJson('nope', 'x').licences).toEqual([]);
    expect(parseDataciteJson({}, 'x').distributionLinks).toEqual([]);
  });
});

describe('parseDataciteXml (kernel-4)', () => {
  const rec = parseDataciteXml(fx('datacite-spdx.xml'), 'dc-xml');

  it('reads licences with identifier, uri and free text', () => {
    expect(rec.source).toBe('datacite');
    expect(rec.licences).toEqual([
      {
        source: 'datacite',
        field: 'rightsList[0]',
        text: 'Creative Commons Attribution 4.0 International',
        uri: 'https://creativecommons.org/licenses/by/4.0/legalcode',
        spdx: 'CC-BY-4.0',
      },
      { source: 'datacite', field: 'rightsList[1]', text: 'CC BY' },
    ]);
  });

  it('reads title, abstract, version, doi, resource type, extent and bbox', () => {
    expect(rec.title).toBe('Synthetic XML record');
    expect(rec.abstract).toBe('Invented abstract for the XML record.');
    expect(rec.version).toBe('3');
    expect(rec.doi).toBe('10.0000/synthetic-xml');
    expect(rec.resourceType).toBe('Dataset');
    expect(rec.temporalExtent).toEqual({ start: '2018-05-01', end: '2018-05-20' });
    expect(rec.bbox).toEqual({ west: 10.5, east: 12.25, south: -5.5, north: 7.75 });
  });

  it('matches by namespace, not by prefix, and rejects other roots', () => {
    const prefixed = fx('datacite-spdx.xml')
      .replace('<resource xmlns=', '<d:resource xmlns:d=')
      .replace('</resource>', '</d:resource>')
      .replace(/<(\/?)(identifier|titles|title|resourceType|version|rightsList|rights|descriptions|description|dates|date|geoLocations|geoLocation|geoLocationBox|westBoundLongitude|eastBoundLongitude|southBoundLongitude|southBoundLatitude|northBoundLatitude)([ >])/g, '<$1d:$2$3');
    expect(parseDataciteXml(prefixed, 'x').licences[0].spdx).toBe('CC-BY-4.0');
    expect(() => parseDataciteXml('<html/>', 'x')).toThrow(/DataCite/);
  });
});
