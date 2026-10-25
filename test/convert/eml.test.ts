// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// eml.xml: structure, the three licences with their ulink, escaping, coverage, and the metadata form model. The GBIF 1.3 schema is not in the repository and
// the tests make no network call, so: well-formedness, the element order the schema requires, a pinned structure; and, only when GBIF_EML_XSD is set to a
// local copy of eml.xsd and xmllint exists, a real schema validation.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LICENCE_ULINK, buildEml, coverageOf } from '../../src/core/convert/eml';
import { BASES_OF_RECORD, EMPTY_METADATA, LICENCES, applyPrefill, creatorLines, datasetNameOf, missingFields, splitPersonName } from '../../src/core/convert/metadata';
import { parseXml } from '../../src/core/metadata/xml';
import { META, GENERATED, exportSheet } from './exportHelpers';
import { W2_HEADER, W2_QUANTITY, W2_ROWS } from './helpers';

const children = (el: Element): string[] => [...el.childNodes].filter((n) => n.nodeType === 1).map((n) => (n as Element).localName);

describe('structure', () => {
  it('is well-formed EML 2.2.0 with the GBIF profile 1.3 schema location, and the dataset children come in the order the schema requires', async () => {
    const e = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, fullList: true, meta: { methods: 'Vertical hauls of an invented net.\n\nCounted by an invented person.' } });
    const doc = parseXml(e.eml, 'eml.xml');
    const root = doc.documentElement;
    expect(root.namespaceURI).toBe('https://eml.ecoinformatics.org/eml-2.2.0');
    expect(root.getAttribute('xsi:schemaLocation')).toBe('https://eml.ecoinformatics.org/eml-2.2.0 https://rs.gbif.org/schema/eml-gbif-profile/1.3/eml.xsd');
    expect(root.getAttribute('packageId')).toMatch(/^synthetic-zooplankton-counts[\w-]*\/v1\.0$/);
    const dataset = root.getElementsByTagName('dataset')[0];
    expect(children(dataset)).toEqual(['title', 'creator', 'creator', 'metadataProvider', 'pubDate', 'language', 'abstract', 'keywordSet', 'intellectualRights', 'coverage', 'contact', 'methods']);
    expect(children(root)).toEqual(['dataset', 'additionalMetadata']);
    expect(dataset.getElementsByTagName('pubDate')[0].textContent).toBe('2026-10-25');
    expect(dataset.getElementsByTagName('methods')[0].getElementsByTagName('para')).toHaveLength(2);
    const gbif = root.getElementsByTagName('gbif')[0];
    expect(children(gbif)).toEqual(['dateStamp', 'hierarchyLevel', 'citation']);
    expect(gbif.getElementsByTagName('dateStamp')[0].textContent).toBe(GENERATED);
    expect(gbif.getElementsByTagName('citation')[0].textContent).toBe('Example, Ada; Sample, Bob (2026). Synthetic zooplankton counts of an invented bay (invented values). Dataset.');
  });

  it('creators, contact and metadata provider are written from the form; the contact carries the e-mail', async () => {
    const e = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY });
    const doc = parseXml(e.eml, 'eml.xml');
    const names = [...doc.getElementsByTagName('creator')].map((c) => [c.getElementsByTagName('givenName')[0]?.textContent, c.getElementsByTagName('surName')[0].textContent]);
    expect(names).toEqual([['Ada', 'Example'], ['Bob', 'Sample']]);
    for (const tag of ['contact', 'metadataProvider']) expect(doc.getElementsByTagName(tag)[0].getElementsByTagName('electronicMailAddress')[0].textContent).toBe('ada@example.org');
  });

  it('coverage: the bounding box and the dates of the events, and the distinct scientific names', async () => {
    const e = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY });
    const c = coverageOf(e.dataset);
    expect(c.bbox).toEqual({ west: -3.2, east: -3, north: 60.4, south: 60.1 });
    expect(c.dates).toEqual({ begin: '2023-07-01', end: '2023-07-02' });
    expect(c.taxa).toEqual(['Augaptilus glacialis', 'Calanus finmarchicus', 'Calanus glacialis', 'Pseudocalanus']);
    const doc = parseXml(e.eml, 'eml.xml');
    expect(doc.getElementsByTagName('westBoundingCoordinate')[0].textContent).toBe('-3.2');
    expect(doc.getElementsByTagName('taxonRankValue')).toHaveLength(4);
  });

  it('the bounding box takes the short way across the antimeridian, and partial dates widen to whole days', () => {
    const ev = (lon: number, date: string) => ({ id: String(lon), type: 'sample' as const, date, position: { lat: 10, lon } });
    const c = coverageOf({ events: [ev(179, '2023-02'), ev(-179, '2023'), ev(178, '2023-06-14T07:50:00Z/2023-06-14T09:30:00Z')], occurrences: [] });
    expect(c.bbox).toMatchObject({ west: 178, east: -179 });
    expect(c.dates).toEqual({ begin: '2023-01-01', end: '2023-12-31' });
    expect(coverageOf({ events: [ev(1, '2024-02')], occurrences: [] }).dates).toEqual({ begin: '2024-02-01', end: '2024-02-29' });
  });

  it('escapes what is typed and drops what XML 1.0 forbids; refuses to write without a licence', async () => {
    const e = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, meta: { title: 'A & B <test> "q"', abstract: 'x\u0001y' } });
    const doc = parseXml(e.eml, 'eml.xml');
    expect(doc.getElementsByTagName('title')[0].textContent).toBe('A & B <test> "q"');
    expect(doc.getElementsByTagName('para')[0].textContent).toBe('xy');
    expect(() => buildEml({ ...e.dataset, metadata: { ...META, licence: '' } }, { generated: GENERATED })).toThrow(/licence/);
  });
});

describe('licences (sources: IPT 3.3.7 Constants.java 141-146 and licenses.properties 8-10 and 20-22; docs applying-license.adoc)', () => {
  const EXPECTED = {
    'CC0-1.0': ['http://creativecommons.org/publicdomain/zero/1.0/legalcode', 'Public Domain (CC0 1.0)'],
    'CC-BY-4.0': ['http://creativecommons.org/licenses/by/4.0/legalcode', 'Creative Commons Attribution (CC-BY 4.0) License'],
    'CC-BY-NC-4.0': ['http://creativecommons.org/licenses/by-nc/4.0/legalcode', 'Creative Commons Attribution Non Commercial (CC-BY-NC 4.0) License'],
  } as const;

  it('exactly three are offered, and each is written as a ulink with the URL the IPT supports', async () => {
    expect([...LICENCES]).toEqual(['CC0-1.0', 'CC-BY-4.0', 'CC-BY-NC-4.0']);
    for (const l of LICENCES) {
      expect(LICENCE_ULINK[l].url).toBe(EXPECTED[l][0]);
      const e = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, meta: { licence: l } });
      const doc = parseXml(e.eml, 'eml.xml');
      const rights = doc.getElementsByTagName('intellectualRights')[0];
      const link = rights.getElementsByTagName('ulink')[0];
      expect(link.getAttribute('url'), l).toBe(EXPECTED[l][0]);
      expect(link.getElementsByTagName('citetitle')[0].textContent, l).toBe(EXPECTED[l][1]);
      expect(children(rights)).toEqual(['para']);
    }
  });

  it('the CC0 text carries the IPT sentence about use without restriction; the others say "licensed under"', () => {
    expect(LICENCE_ULINK['CC0-1.0'].after).toContain('without restriction');
    expect(LICENCE_ULINK['CC-BY-4.0'].before).toBe('This work is licensed under a ');
  });
});

describe('the metadata form model', () => {
  it('starts empty with no licence and no basisOfRecord, and lists what is missing by code', () => {
    expect(EMPTY_METADATA.licence).toBe('');
    expect(EMPTY_METADATA.basisOfRecord).toBe('');
    expect(missingFields(EMPTY_METADATA)).toEqual(['title', 'abstract', 'creator', 'contact name', 'contact email', 'institution code', 'dataset name']);
    expect(missingFields(META)).toEqual([]);
    expect(missingFields({ ...META, contactEmail: 'a@b' })).toEqual(['contact email']);
    expect(missingFields({ ...META, institutionCode: 'A\tB' })).toEqual(['institution code']);
    expect(missingFields({ ...META, datasetName: 'x\ny' })).toEqual(['dataset name']);
  });

  it('the dataset name is the typed one or the title', () => {
    expect(datasetNameOf(META)).toBe(META.title);
    expect(datasetNameOf({ ...META, datasetName: ' Own name ' })).toBe('Own name');
  });

  it('a prefill (stage 3) fills only empty fields, accepts only allowed licences and bases, and never overwrites what was typed', () => {
    const typed = { ...EMPTY_METADATA, title: 'Mine' };
    const out = applyPrefill(typed, { title: 'Theirs', abstract: 'From a file', licence: 'CC0-1.0', basisOfRecord: 'HumanObservation', creators: '  ' });
    expect(out).toMatchObject({ title: 'Mine', abstract: 'From a file', licence: 'CC0-1.0', basisOfRecord: 'HumanObservation', creators: '' });
    expect(applyPrefill(EMPTY_METADATA, { licence: 'CC-BY-SA-4.0' as never, basisOfRecord: 'Bogus' as never })).toEqual(EMPTY_METADATA);
    expect(applyPrefill(typed, undefined)).toBe(typed);
  });

  it('names: "Given Family", "Family, Given", one word, and creators one per line or split by semicolons', () => {
    expect(splitPersonName('Ada Maria Example')).toEqual({ givenName: 'Ada Maria', surName: 'Example' });
    expect(splitPersonName('Example, Ada Maria')).toEqual({ givenName: 'Ada Maria', surName: 'Example' });
    expect(splitPersonName('Plankton Group')).toEqual({ givenName: 'Plankton', surName: 'Group' });
    expect(splitPersonName('Example')).toEqual({ surName: 'Example' });
    expect(creatorLines({ creators: 'A B\n\n C D ; E, F' })).toEqual(['A B', 'C D', 'E, F']);
  });

  it('offers the seven basisOfRecord values BioCheck accepts, the three plankton ones first', () => {
    expect([...BASES_OF_RECORD]).toEqual(['HumanObservation', 'PreservedSpecimen', 'MaterialSample', 'MachineObservation', 'LivingSpecimen', 'FossilSpecimen', 'Occurrence']);
  });
});

describe.skipIf(!process.env.GBIF_EML_XSD)('schema validation against a local GBIF profile 1.3 copy (GBIF_EML_XSD=/path/eml.xsd, needs xmllint)', () => {
  it('the exported eml.xml validates', async () => {
    const e = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, meta: { methods: 'Invented.' } });
    const f = join(mkdtempSync(join(tmpdir(), 'eml-')), 'eml.xml');
    writeFileSync(f, e.eml);
    const r = spawnSync('xmllint', ['--noout', '--schema', process.env.GBIF_EML_XSD as string, f], { encoding: 'utf8' });
    expect(r.stderr, r.stderr).toContain('validates');
  });
});
