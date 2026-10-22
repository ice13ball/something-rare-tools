// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// creators / publicationYear / publisher: the data the licence page needs for an attribution line.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDataciteJson, parseDataciteXml } from '../../src/core/metadata/datacite';
import { parseIso19139 } from '../../src/core/metadata/iso19139';
import { parseIso19115_3, parseIsoRecord } from '../../src/core/metadata/iso19115-3';
import { parseZenodoRecord } from '../../src/core/metadata/zenodo';
import { parsePangaeaText } from '../../src/core/parse/pangaea';

const fx = (n: string) => readFileSync(join(__dirname, '..', 'fixtures', n), 'utf-8');

describe('DataCite', () => {
  it('JSON: creators (name, or family+given), publisher string or object, publication year', () => {
    const a = parseDataciteJson({ doi: '10.0/x', titles: [], creators: [{ name: 'Doe, Jane' }, { familyName: 'Roe', givenName: 'Rick' }, {}], publisher: 'Invented Centre', publicationYear: 2024 }, 'x');
    expect(a).toMatchObject({ creators: ['Doe, Jane', 'Roe, Rick'], publisher: 'Invented Centre', publicationYear: 2024 });
    expect(parseDataciteJson({ doi: '10.0/x', titles: [], publisher: { name: 'Object Publisher' }, publicationYear: '2021' }, 'x')).toMatchObject({ publisher: 'Object Publisher', publicationYear: 2021 });
  });
  it('JSON without them leaves the fields out', () => {
    const r = parseDataciteJson({ doi: '10.0/x', titles: [] }, 'x');
    expect(r.creators).toBeUndefined();
    expect(r.publisher).toBeUndefined();
    expect(r.publicationYear).toBeUndefined();
  });
  it('XML kernel record', () => {
    const xml = fx('datacite-spdx.xml').replace(
      /<titles>/,
      '<creators><creator><creatorName>Doe, Jane</creatorName></creator><creator><creatorName>Roe, Rick</creatorName></creator></creators><publisher>Invented Centre</publisher><publicationYear>2023</publicationYear><titles>',
    );
    expect(parseDataciteXml(xml, 'x')).toMatchObject({ creators: ['Doe, Jane', 'Roe, Rick'], publisher: 'Invented Centre', publicationYear: 2023 });
  });
});

describe('Zenodo', () => {
  it('legacy and InvenioRDM creators, publication date year, publisher', () => {
    const legacy = parseZenodoRecord({ id: 1, metadata: { title: 't', creators: [{ name: 'Doe, Jane' }], publication_date: '2022-05-04' } }, 'z');
    expect(legacy).toMatchObject({ creators: ['Doe, Jane'], publicationYear: 2022 });
    const rdm = parseZenodoRecord({ id: 2, metadata: { creators: [{ person_or_org: { name: 'Roe, Rick' } }], publication_date: '2020', publisher: 'Zenodo' } }, 'z');
    expect(rdm).toMatchObject({ creators: ['Roe, Rick'], publicationYear: 2020, publisher: 'Zenodo' });
  });
});

describe('PANGAEA textfile header', () => {
  it('authors, year and publisher come from the citation line', () => {
    const md = parsePangaeaText(fx('pangaea-synthetic.tab'), 'p.tab').embeddedMetadata!;
    expect(md).toMatchObject({ creators: ['Invented, Ann', 'Test, Bob'], publicationYear: 2099, publisher: 'PANGAEA', title: 'Synthetic fjord CTD profiles' });
  });
});

describe('ISO 19139', () => {
  it('author, publisher and publication date of the citation', () => {
    const xml = `<gmd:MD_Metadata xmlns:gmd="http://www.isotc211.org/2005/gmd" xmlns:gco="http://www.isotc211.org/2005/gco"><gmd:identificationInfo><gmd:MD_DataIdentification><gmd:citation><gmd:CI_Citation>
      <gmd:title><gco:CharacterString>T</gco:CharacterString></gmd:title>
      <gmd:date><gmd:CI_Date><gmd:date><gco:Date>2024-02-01</gco:Date></gmd:date><gmd:dateType><gmd:CI_DateTypeCode codeListValue="publication"/></gmd:dateType></gmd:CI_Date></gmd:date>
      <gmd:citedResponsibleParty><gmd:CI_ResponsibleParty><gmd:individualName><gco:CharacterString>Doe, Jane</gco:CharacterString></gmd:individualName><gmd:role><gmd:CI_RoleCode codeListValue="author"/></gmd:role></gmd:CI_ResponsibleParty></gmd:citedResponsibleParty>
      <gmd:citedResponsibleParty><gmd:CI_ResponsibleParty><gmd:organisationName><gco:CharacterString>Invented Centre</gco:CharacterString></gmd:organisationName><gmd:role><gmd:CI_RoleCode codeListValue="publisher"/></gmd:role></gmd:CI_ResponsibleParty></gmd:citedResponsibleParty>
      </gmd:CI_Citation></gmd:citation></gmd:MD_DataIdentification></gmd:identificationInfo></gmd:MD_Metadata>`;
    expect(parseIso19139(xml, 'x')).toMatchObject({ creators: ['Doe, Jane'], publisher: 'Invented Centre', publicationYear: 2024, isoProfile: '19139' });
  });
});

describe('ISO 19115-3', () => {
  const rec = parseIso19115_3(fx('iso19115-3-synthetic.xml'), 'x');

  it('reads title, edition, abstract, DOI, extents, attribution data', () => {
    expect(rec).toMatchObject({
      source: 'iso19139',
      isoProfile: '19115-3',
      title: 'Synthetic ISO 19115-3 test record',
      version: '2.1',
      abstract: 'Invented abstract of a synthetic ISO 19115-3 record.',
      doi: '10.0000/invented-19115-3',
      creators: ['Doe, Jane', 'Invented Institute of Tests'],
      publisher: 'Invented Data Centre',
      publicationYear: 2025,
      bbox: { west: 10.5, east: 12.25, south: -5.5, north: 7.75 },
      temporalExtent: { start: '2025-05-19', end: '2025-05-31' },
    });
  });

  it('reads the licence from useLimitation, otherConstraints (Anchor href) and mco:reference, plus the codes', () => {
    expect(rec.licences.map((l) => [l.field, l.spdx])).toEqual([
      ['useLimitation', 'CC-BY-4.0'],
      ['otherConstraints', 'CC-BY-4.0'],
      ['reference', 'CC-BY-4.0'],
    ]);
    expect(rec.licences[1]).toMatchObject({ text: 'CC BY 4.0', uri: 'https://creativecommons.org/licenses/by/4.0/' });
    expect(rec.licences[2]).toMatchObject({ text: 'Creative Commons Attribution 4.0 International', uri: 'https://creativecommons.org/licenses/by/4.0/legalcode' });
    expect(rec.restrictionCodes).toEqual([{ kind: 'access', code: 'otherRestrictions' }, { kind: 'use', code: 'license' }]);
  });

  it('lists the distribution links', () => {
    expect(rec.distributionLinks).toEqual([{ url: 'https://geonetwork.iopan.pl/files/synthetic-profiles.csv', name: 'Synthetic profiles table', protocol: 'WWW:DOWNLOAD:csv' }]);
  });

  it('parseIsoRecord picks the profile; neither profile and non-XML are errors', () => {
    expect(parseIsoRecord(fx('iso19115-3-synthetic.xml'), 'x').isoProfile).toBe('19115-3');
    expect(parseIsoRecord(fx('iso-clean-anchor.xml'), 'x').isoProfile).toBe('19139');
    expect(() => parseIsoRecord('<html><body>Sign in</body></html>', 'x')).toThrow();
    expect(() => parseIso19115_3('<a xmlns="http://example.org/"/>', 'x')).toThrow(/not an ISO 19115-3/);
  });

  it('a legal constraint block without a licence leaves licences empty and keeps the codes', () => {
    const xml = fx('iso19115-3-synthetic.xml').replace(/<mco:reference>[\s\S]*?<\/mco:reference>/, '').replace(/<mco:useLimitation>[\s\S]*?<\/mco:useLimitation>/, '').replace(/<mco:otherConstraints>[\s\S]*?<\/mco:otherConstraints>/, '');
    const r = parseIso19115_3(xml, 'x');
    expect(r.licences).toEqual([]);
    expect(r.restrictionCodes).toHaveLength(2);
  });
});
