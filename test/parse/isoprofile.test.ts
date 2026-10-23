// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The profile of an ISO record is the profile of its FIRST MD_Metadata element (the root, or inside a wrapper), in /check (a dropped file), /licence (GeoNetwork) and the collection
// review alike: one function (parseIsoRecord). A string that merely mentions the 19115-3 namespace is not a 19115-3 record.
import { describe, expect, it } from 'vitest';
import { parseFile } from '../../src/core/parse';
import { parseIsoRecord } from '../../src/core/metadata/iso19115-3';
import { loadGeoNetwork } from '../../src/core/sources';
import { MapFetcher, fixture } from '../sources/mapFetcher';
import { gmdRecord } from '../collection/helpers';

const MDB = 'http://standards.iso.org/iso/19115/-3/mdb/2.0';
const declares = gmdRecord({ id: 'declares-mdb', licence: 'CC BY 4.0' }).replace('<gmd:MD_Metadata ', `<gmd:MD_Metadata xmlns:mdb="${MDB}" `);
const mentionsInText = gmdRecord({ id: 'mentions-mdb', licence: `CC BY 4.0, see ${MDB}` });
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('ISO profile = the root element', () => {
  it('a 19139 record declaring xmlns:mdb is 19139, from text and from a parsed document, and keeps its licence', () => {
    for (const rec of [declares, mentionsInText]) {
      const r = parseIsoRecord(rec, 'x');
      expect(r.isoProfile).toBe('19139');
      expect(r.licences.length).toBeGreaterThan(0);
    }
  });

  it('a real 19115-3 record is still 19115-3', () => {
    expect(parseIsoRecord(fixture('iso19115-3-synthetic.xml'), 'x').isoProfile).toBe('19115-3');
  });

  it('a text that is not well-formed XML still throws (the callers turn that into "unreadable")', () => {
    expect(() => parseIsoRecord('<gmd:MD_Metadata xmlns:gmd="http://www.isotc211.org/2005/gmd"><oops>', 'x')).toThrow();
  });

  it('/check: a dropped 19139 file that declares xmlns:mdb is metadata read as 19139, not an unreadable file', () => {
    const f = parseFile('declares.xml', enc(`<?xml version="1.0"?>\n${declares}`));
    expect(f.kind).toBe('metadata');
    expect(f.findings.map((x) => x.ruleId)).toEqual([]);
    expect(f.embeddedMetadata?.isoProfile).toBe('19139');
    expect(f.embeddedMetadata?.licences.length).toBeGreaterThan(0);
  });

  it('/licence: GeoNetwork answering such a record gives metadata with its licence and no inaccessible finding', async () => {
    const UUID = '00000000-0000-4000-8000-0000000000bb';
    const GN = `https://geonetwork.iopan.pl/geonetwork/srv/api/records/${UUID}/formatters/xml`;
    const rec = await loadGeoNetwork('geonetwork.iopan.pl', UUID, new MapFetcher({ [GN]: { body: declares } }));
    expect(rec.findings.map((x) => x.ruleId)).not.toContain('IN-RECORD-INACCESSIBLE');
    expect(rec.metadata[0]?.isoProfile).toBe('19139');
    expect(rec.metadata[0]?.licences.length).toBeGreaterThan(0);
  });
});

describe('ISO profile = the first MD_Metadata element (a wrapper around it does not change the profile)', () => {
  const strip = (x: string): string => x.replace(/^<\?xml[^>]*\?>\s*/, '');
  const wrap = (inner: string): string => `<?xml version="1.0" encoding="UTF-8"?>\n<csw:GetRecordByIdResponse xmlns:csw="http://www.opengis.net/cat/csw/2.0.2">${strip(inner)}</csw:GetRecordByIdResponse>`;

  it('/check: a csw:GetRecordByIdResponse wrapping a 19115-3 record is read as 19115-3', () => {
    const f = parseFile('wrapped3.xml', enc(wrap(fixture('iso19115-3-synthetic.xml'))));
    expect(f.kind).toBe('metadata');
    expect(f.embeddedMetadata?.isoProfile).toBe('19115-3');
    expect(f.embeddedMetadata?.licences.length).toBeGreaterThan(0);
  });

  it('a wrapped 19139 record is 19139, also when it declares xmlns:mdb', () => {
    for (const rec of [gmdRecord({ id: 'w', licence: 'CC BY 4.0' }), declares]) {
      expect(parseIsoRecord(wrap(rec), 'x').isoProfile).toBe('19139');
    }
  });

  it('a plain 19139 record declaring xmlns:mdb stays 19139; a plain 19115-3 record stays 19115-3', () => {
    expect(parseIsoRecord(declares, 'x').isoProfile).toBe('19139');
    expect(parseIsoRecord(fixture('iso19115-3-synthetic.xml'), 'x').isoProfile).toBe('19115-3');
  });
});
