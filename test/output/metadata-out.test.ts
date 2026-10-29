// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { parseXml } from '../../src/core/metadata/xml';
import { parseDataciteXml } from '../../src/core/metadata/datacite';
import { parseIso19139 } from '../../src/core/metadata/iso19139';
import { toSpdx } from '../../src/core/metadata/licence';
import { draftToDataciteXml } from '../../src/core/output/datacite';
import { GN_FIELD_LABELS, metadataDraft, spdxToUri, type MetadataDraft } from '../../src/core/output/draft';
import { draftToIso19139 } from '../../src/core/output/iso19139';
import { LANGS, type MetadataRecord, type ParsedDate } from '../../src/core/types';
import { dataset, day, row } from './ds';

const rec = (extra: Partial<MetadataRecord> = {}): MetadataRecord => ({ source: 'iso19139', label: 'm', licences: [], restrictionCodes: [], distributionLinks: [], ...extra });
const full: MetadataDraft = {
  title: 'Synthetic <study> & "friends"',
  abstract: 'Invented abstract with an ampersand & a <tag>.',
  temporalExtent: { start: '2021-07-25', end: '2021-08-02' },
  bbox: { west: 15.1, east: 16.25, south: -10.5, north: 76.75 },
  licence: { spdx: 'CC-BY-4.0', uri: 'https://creativecommons.org/licenses/by/4.0/' },
  variables: [{ name: 'DIC', unit: 'µmol/kg', p01: 'TCO2KG02' }, { name: 'Mystery' }],
};

describe('metadataDraft', () => {
  const rows = [
    row(2, { lat: 76.5, lon: 15.1, datetime: day('2021-07-25') }),
    row(3, { lat: -10.5, lon: 16.25, datetime: { iso: '2021-08-02T10:30:00Z', year: 2021, precision: 'second', tz: 'utc' } }),
    row(4, { lat: 76.75, lon: 15.5, datetime: { iso: '2021-07-30T08:00', year: 2021, precision: 'minute', tz: 'unknown' } }),
    row(5, { lat: 95, lon: 400 }), // out of range: reported elsewhere, must not blow up the box
  ];
  const ds = dataset(rows, [
    { key: 'DIC_umol_kg', header: 'DIC_umol_kg', unit: 'µmol/kg', unitSource: 'header', p01: 'TCO2KG02' },
    { key: 'Mystery', header: 'Mystery' },
  ]);

  it('temporal extent is min/max of the row dates at day precision, bbox min/max of the points', () => {
    const d = metadataDraft([ds], []);
    expect(d.temporalExtent).toEqual({ start: '2021-07-25', end: '2021-08-02' });
    expect(d.bbox).toEqual({ west: 15.1, east: 16.25, south: -10.5, north: 76.75 });
  });

  it('coarse dates widen the extent to the period they cover', () => {
    const coarse = dataset([
      row(2, { datetime: { iso: '2021', year: 2021, precision: 'year', tz: 'unknown' } }),
      row(3, { datetime: { iso: '2022-02', year: 2022, precision: 'month', tz: 'unknown' } as ParsedDate }),
    ]);
    expect(metadataDraft([coarse], []).temporalExtent).toEqual({ start: '2021-01-01', end: '2022-02-28' });
  });

  it('antimeridian crossers get the short way round: west > east (details in antimeridian-bbox.test.ts)', () => {
    const d = metadataDraft([dataset([row(2, { lat: 0, lon: 179 }), row(3, { lat: 1, lon: -179 })])], []);
    expect(d.bbox).toEqual({ west: 179, east: -179, south: 0, north: 1 });
  });

  it('no dates and no points: no extent, no bbox', () => {
    const d = metadataDraft([dataset([row(2)])], []);
    expect(d.temporalExtent).toBeUndefined();
    expect(d.bbox).toBeUndefined();
  });

  it('variables: name without unit, unit, p01; no invented unit', () => {
    expect(metadataDraft([ds], []).variables).toEqual([{ name: 'DIC', unit: 'µmol/kg', p01: 'TCO2KG02' }, { name: 'Mystery' }]);
  });

  it('licence: the first spdx in the metadata, with its canonical URI; metadata-record constraints do not count', () => {
    const d = metadataDraft([ds], [
      rec({ licences: [{ source: 'iso19139', field: 'metadataConstraints/otherConstraints', spdx: 'CC0-1.0' }, { source: 'iso19139', field: 'useLimitation', text: 'see paper' }] }),
      rec({ licences: [{ source: 'iso19139', field: 'otherConstraints', spdx: 'CC-BY-NC-4.0' }, { source: 'iso19139', field: 'x', spdx: 'CC-BY-4.0' }] }),
    ]);
    expect(d.licence).toEqual({ spdx: 'CC-BY-NC-4.0', uri: 'https://creativecommons.org/licenses/by-nc/4.0/' });
    expect(metadataDraft([ds], [rec({ licences: [{ source: 'iso19139', field: 'f', text: 'free text' }] })]).licence).toBeUndefined();
  });

  it('title and abstract come from the metadata when present', () => {
    const d = metadataDraft([ds], [rec(), rec({ title: 'T', abstract: 'A' })]);
    expect([d.title, d.abstract]).toEqual(['T', 'A']);
    expect('title' in metadataDraft([ds], [])).toBe(false);
  });
});

describe('spdxToUri', () => {
  it('maps every id toSpdx can return to a URI that toSpdx maps back to the same id', () => {
    const ids = new Set<string>();
    for (const v of ['by', 'by-sa', 'by-nc', 'by-nc-sa', 'by-nd', 'by-nc-nd'])
      for (const ver of ['1.0', '2.0', '2.5', '3.0', '4.0']) ids.add(toSpdx(undefined, `https://creativecommons.org/licenses/${v}/${ver}/`)!);
    for (const t of ['CC0 1.0', 'ODbL', 'https://opendatacommons.org/licenses/pddl/1-0/', 'https://opendatacommons.org/licenses/by/1-0/']) {
      ids.add(toSpdx(t, t.startsWith('http') ? t : undefined)!);
    }
    expect(ids.size).toBe(34);
    for (const id of ids) {
      const uri = spdxToUri(id);
      expect(uri, id).toBeDefined();
      expect(toSpdx(undefined, uri), id).toBe(id);
    }
    expect(spdxToUri('CC-BY-4.0')).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(spdxToUri('GPL-3.0')).toBeUndefined();
  });
});

describe('ISO 19139 output', () => {
  const xml = draftToIso19139(full, { now: new Date('2026-10-16T12:00:00Z') });

  it('is well-formed with the gmd/gco/gml 3.2/gmx namespaces', () => {
    const root = parseXml(xml, 'out').documentElement;
    expect(root.namespaceURI).toBe('http://www.isotc211.org/2005/gmd');
    expect(root.localName).toBe('MD_Metadata');
    expect(xml).toContain('xmlns:gml="http://www.opengis.net/gml/3.2"');
    expect(xml).toContain('xmlns:gmx="http://www.isotc211.org/2005/gmx"');
    expect(xml).toContain('<gco:Date>2026-10-16</gco:Date>');
  });

  it('parses back to the same extent, bbox, licence uri and spdx, title and abstract; no empty linkage', () => {
    const r = parseIso19139(xml, 'out');
    expect(r.temporalExtent).toEqual({ start: '2021-07-25', end: '2021-08-02' });
    expect(r.bbox).toEqual(full.bbox);
    expect(r.licences.filter((l) => !l.field.startsWith('metadataConstraints/'))).toEqual([
      { source: 'iso19139', field: 'otherConstraints', text: 'Creative Commons Attribution 4.0 International', uri: 'https://creativecommons.org/licenses/by/4.0/', textSpdx: 'CC-BY-4.0', uriSpdx: 'CC-BY-4.0', spdx: 'CC-BY-4.0' },
    ]);
    expect(r.restrictionCodes).toEqual([{ kind: 'use', code: 'otherRestrictions' }]);
    expect(r.title).toBe(full.title);
    expect(r.abstract).toBe(full.abstract);
    expect(r.distributionLinks).toEqual([]);
  });

  it('lists the variables as theme keywords with units in the text', () => {
    expect(xml).toContain('<gco:CharacterString>DIC [µmol/kg] (SDN:P01::TCO2KG02)</gco:CharacterString>');
    expect(xml).toContain('<gco:CharacterString>Mystery</gco:CharacterString>');
    expect(xml).toContain('codeListValue="theme"');
  });

  it('escapes text and survives an empty draft (missing title/abstract are nil, not empty strings)', () => {
    expect(xml).toContain('Synthetic &lt;study&gt; &amp; &quot;friends&quot;');
    const bare = parseIso19139(draftToIso19139({ variables: [] }), 'bare');
    expect(bare.title).toBeUndefined();
    expect(bare.bbox).toBeUndefined();
    expect(bare.temporalExtent).toBeUndefined();
    expect(bare.licences).toEqual([]);
  });

  it('every licence the draft can carry round-trips to the same spdx', () => {
    for (const spdx of ['CC0-1.0', 'ODbL-1.0', 'CC-BY-NC-SA-3.0', 'CC-BY-ND-4.0']) {
      const r = parseIso19139(draftToIso19139({ variables: [], licence: { spdx, uri: spdxToUri(spdx)! } }), 'x');
      expect(r.licences[0].spdx).toBe(spdx);
    }
  });

  it('never writes an exponent into a Decimal and drops characters XML forbids', () => {
    const x = draftToIso19139({ variables: [{ name: 'a\u0001b' }], bbox: { west: 1e-7, east: 1, south: 0, north: 1 } });
    expect(x).toContain('<gco:Decimal>0.0000001</gco:Decimal>');
    expect(x).toContain('<gco:CharacterString>ab</gco:CharacterString>');
    expect(parseIso19139(x, 'x').bbox?.west).toBe(1e-7);
  });
});

describe('DataCite output', () => {
  const xml = draftToDataciteXml(full, { year: 2026 });

  it('parses back with the same licence spdx and bbox, extent, title', () => {
    const r = parseDataciteXml(xml, 'out');
    expect(r.licences).toEqual([
      { source: 'datacite', field: 'rightsList[0]', text: 'Creative Commons Attribution 4.0 International', uri: 'https://creativecommons.org/licenses/by/4.0/', textSpdx: 'CC-BY-4.0', uriSpdx: 'CC-BY-4.0', spdx: 'CC-BY-4.0' },
    ]);
    expect(r.bbox).toEqual(full.bbox);
    expect(r.temporalExtent).toEqual({ start: '2021-07-25', end: '2021-08-02' });
    expect(r.title).toBe(full.title);
    expect(r.abstract).toBe(full.abstract);
    expect(r.resourceType).toBe('Dataset');
    expect(r.doi).toBeUndefined();
  });

  it('kernel-4.5 shape: lowercase SPDX rightsIdentifier, Collected interval, P01 subject, year, placeholders as comments', () => {
    expect(xml).toContain('schemaLocation="http://datacite.org/schema/kernel-4 http://schema.datacite.org/meta/kernel-4.5/metadata.xsd"');
    expect(xml).toContain('rightsIdentifier="cc-by-4.0" rightsIdentifierScheme="SPDX"');
    expect(xml).toContain('<date dateType="Collected">2021-07-25/2021-08-02</date>');
    expect(xml).toContain('valueURI="https://vocab.nerc.ac.uk/collection/P01/current/TCO2KG02/">DIC</subject>');
    expect(xml).toContain('<subject>Mystery</subject>');
    expect(xml).toContain('<publicationYear>2026</publicationYear>');
    expect(xml).toMatch(/<!-- identifier: the DOI is assigned at publication/);
    expect(xml).toMatch(/<!-- publisher:/);
    expect(xml).not.toContain('identifierType="DOI"/>');
  });

  it('writes an identifier only when a DOI is given; a bare draft still parses', () => {
    const withDoi = parseDataciteXml(draftToDataciteXml({ variables: [] }, { doi: '10.0000/x' }), 'x');
    expect(withDoi.doi).toBe('10.0000/x');
    const bare = parseDataciteXml(draftToDataciteXml({ variables: [] }), 'bare');
    expect([bare.title, bare.bbox, bare.temporalExtent, bare.licences]).toEqual([undefined, undefined, undefined, []]);
  });
});

describe('GN_FIELD_LABELS', () => {
  it('all four languages carry the four labels; en is what GeoNetwork shows', () => {
    for (const l of LANGS) expect(Object.keys(GN_FIELD_LABELS[l]).sort()).toEqual(['bbox', 'licence', 'temporalExtent', 'variables']);
    expect(GN_FIELD_LABELS.en).toEqual({
      temporalExtent: 'Temporal extent',
      bbox: 'Geographic bounding box',
      licence: 'Constraints — licence',
      variables: 'Keywords / variables',
    });
    expect(new Set(LANGS.map((l) => GN_FIELD_LABELS[l].bbox)).size).toBe(4);
  });
});
