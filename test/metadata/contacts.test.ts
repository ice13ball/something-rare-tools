// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Contact persons of a metadata record (MetadataRecord.contacts), read by the shared parsers for the /convert form (stage 3). An optional field: a record that
// names no contact has no such property, so what /check reads and reports is untouched (the golden diff proves it over the private golden set).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyseLicences } from '../../src/core/licence/analyse';
import { parseDataciteJson, parseDataciteXml } from '../../src/core/metadata/datacite';
import { parseIsoRecord } from '../../src/core/metadata/iso19115-3';
import { parseZenodoRecord } from '../../src/core/metadata/zenodo';
import { parseFile } from '../../src/core/parse';
import { dataciteJson, dataciteXml, isoXml, zenodoJson } from '../convert/metaFixtures';

describe('contacts', () => {
  it('ISO 19139: the pointOfContact person and the e-mail address of its contactInfo', () => {
    const r = parseIsoRecord(isoXml({ contactName: 'Anna Example', email: 'anna@example.org' }), 'iso.xml');
    expect(r.contacts).toEqual([{ name: 'Anna Example', email: 'anna@example.org' }]);
  });

  it('ISO 19139: an e-mail without a name, and a name without an e-mail, are each kept as they are', () => {
    expect(parseIsoRecord(isoXml({ email: 'office@example.org' }), 'iso.xml').contacts).toEqual([{ email: 'office@example.org' }]);
    expect(parseIsoRecord(isoXml({ contactName: 'Anna Example' }), 'iso.xml').contacts).toEqual([{ name: 'Anna Example' }]);
  });

  it('DataCite XML and JSON: contributors of type ContactPerson (DataCite has no e-mail address)', () => {
    expect(parseDataciteXml(dataciteXml({ contacts: ['Example, Anna'] }), 'a.xml').contacts).toEqual([{ name: 'Example, Anna' }]);
    expect(parseDataciteJson(JSON.parse(dataciteJson({ contacts: ['Example, Anna'] })), 'a.json').contacts).toEqual([{ name: 'Example, Anna' }]);
  });

  it('DataCite: a contributor of another type is not a contact', () => {
    const xml = dataciteXml().replace('</resourceType>', '</resourceType>\n  <contributors><contributor contributorType="Editor"><contributorName>Editor, Eve</contributorName></contributor></contributors>');
    expect(parseDataciteXml(xml, 'a.xml').contacts).toBeUndefined();
  });

  it('Zenodo: the legacy contributor type and the InvenioRDM role', () => {
    expect(parseZenodoRecord(JSON.parse(zenodoJson({ contacts: ['Example, Anna'] })), 'z.json').contacts).toEqual([{ name: 'Example, Anna' }]);
    const rdm = { id: 1, metadata: { title: 'T', contributors: [{ person_or_org: { name: 'Example, Anna' }, role: { id: 'contactperson' } }, { person_or_org: { name: 'Other, Eve' }, role: { id: 'editor' } }] }, files: [] };
    expect(parseZenodoRecord(rdm, 'z.json').contacts).toEqual([{ name: 'Example, Anna' }]);
  });
});

describe('records without a contact are exactly what they were', () => {
  const FIXTURES = join(__dirname, '..', 'fixtures');
  const files = readdirSync(FIXTURES).filter((f) => /\.(xml|json)$/.test(f));

  it('no fixture record gains a `contacts` property', () => {
    let n = 0;
    for (const f of files) {
      let parsed;
      try {
        parsed = parseFile(f, new Uint8Array(readFileSync(join(FIXTURES, f))));
      } catch {
        continue; // not a metadata record (a mapping, a test of refusal)
      }
      if (parsed.kind !== 'metadata' || !parsed.embeddedMetadata) continue;
      n++;
      expect('contacts' in parsed.embeddedMetadata, f).toBe(false);
    }
    expect(n).toBeGreaterThan(8);
  });

  it('the licence analysis does not look at contacts: a record with and without them is analysed the same', () => {
    const plain = parseDataciteXml(dataciteXml({ licence: 'CC-BY-4.0' }), 'a.xml');
    const withContact = parseDataciteXml(dataciteXml({ licence: 'CC-BY-4.0', contacts: ['Example, Anna'] }), 'a.xml');
    const strip = (a: ReturnType<typeof analyseLicences>): string => JSON.stringify(a, (k, v) => (k === 'record' ? undefined : v));
    expect(strip(analyseLicences([withContact]))).toBe(strip(analyseLicences([plain])));
  });
});
