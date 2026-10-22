// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseIso19139 } from '../../src/core/metadata/iso19139';

const fx = (n: string) => readFileSync(join(__dirname, '..', 'fixtures', n), 'utf-8');

describe('parseIso19139 — copyright codes, free-text licence, empty link', () => {
  const rec = parseIso19139(fx('iso-copyright-empty-link.xml'), 'rec-a');

  it('reads identification basics', () => {
    expect(rec.source).toBe('iso19139');
    expect(rec.label).toBe('rec-a');
    expect(rec.title).toBe('Synthetic porewater survey');
    expect(rec.abstract).toMatch(/^Invented abstract/);
    expect(rec.version).toBe('2');
  });

  it('keeps both restriction codes with their kind', () => {
    expect(rec.restrictionCodes).toContainEqual({ kind: 'use', code: 'copyright' });
    expect(rec.restrictionCodes).toContainEqual({ kind: 'access', code: 'copyright' });
    expect(rec.restrictionCodes).toHaveLength(2);
  });

  it('records otherConstraints "CC-BY" as a licence without spdx (no version)', () => {
    expect(rec.licences).toHaveLength(1);
    expect(rec.licences[0]).toMatchObject({ source: 'iso19139', field: 'otherConstraints', text: 'CC-BY' });
    expect(rec.licences[0].spdx).toBeUndefined();
    expect(rec.licences[0].uri).toBeUndefined();
  });

  it('lists every gmd:onLine link, empty and whitespace linkage as "" and not the contact link', () => {
    expect(rec.distributionLinks).toHaveLength(3);
    expect(rec.distributionLinks[0]).toEqual({
      url: 'https://data.example.org/csv/synthetic-porewater.csv',
      name: 'Synthetic porewater table',
      protocol: 'WWW:DOWNLOAD:csv',
    });
    expect(rec.distributionLinks[1].url).toBe('');
    expect(rec.distributionLinks[1].name).toBe('Second table (link missing)');
    expect(rec.distributionLinks[1].protocol).toBe('WWW:LINK-1.0-http--link');
    expect(rec.distributionLinks[2].url).toBe('');
    expect(rec.distributionLinks.some((l) => l.url.includes('contact-page'))).toBe(false);
  });

  it('has no extent when none is given', () => {
    expect(rec.bbox).toBeUndefined();
    expect(rec.temporalExtent).toBeUndefined();
  });
});

describe('parseIso19139 — free text only', () => {
  it('gives a licence with text "CC BY", no uri, no spdx and treats otherRestrictions as a code', () => {
    const rec = parseIso19139(fx('iso-freetext-cc-by.xml'), 'rec-b');
    expect(rec.licences).toEqual([{ source: 'iso19139', field: 'otherConstraints', text: 'CC BY' }]);
    expect(rec.restrictionCodes).toEqual([{ kind: 'use', code: 'otherRestrictions' }]);
    expect(rec.distributionLinks).toEqual([]);
  });
});

describe('parseIso19139 — clean record (prefix-independent, GML 3.2, gmx:Anchor)', () => {
  const rec = parseIso19139(fx('iso-clean-anchor.xml'), 'rec-c');

  it('maps an Anchor href to uri and normalises it to SPDX', () => {
    expect(rec.licences).toEqual([
      {
        source: 'iso19139',
        field: 'otherConstraints',
        text: 'Creative Commons Attribution 4.0 International',
        uri: 'https://creativecommons.org/licenses/by/4.0/',
        textSpdx: 'CC-BY-4.0',
        uriSpdx: 'CC-BY-4.0',
        spdx: 'CC-BY-4.0',
      },
    ]);
    expect(rec.restrictionCodes).toContainEqual({ kind: 'use', code: 'license' });
    expect(rec.restrictionCodes).toContainEqual({ kind: 'access', code: 'otherRestrictions' });
    expect(rec.version).toBe('1.1');
  });

  it('parses the temporal extent as original strings and the bbox as numbers', () => {
    expect(rec.temporalExtent).toEqual({ start: '2025-05-19', end: '2025-05-31' });
    expect(rec.bbox).toEqual({ west: 10.5, east: 12.25, south: -5.5, north: 7.75 });
  });

  it('keeps a DOI link with its protocol and no name', () => {
    expect(rec.distributionLinks).toEqual([{ url: 'https://doi.org/10.0000/synthetic.1', protocol: 'DOI' }]);
  });
});

describe('parseIso19139 — metadata constraints, partial bbox, open-ended period', () => {
  const rec = parseIso19139(fx('iso-metadata-uselimitation.xml'), 'rec-d');

  it('records useLimitation under metadataConstraints with a distinct field name', () => {
    expect(rec.licences).toEqual([
      { source: 'iso19139', field: 'metadataConstraints/useLimitation', text: 'Metadata may be reused with attribution.' },
    ]);
    expect(rec.restrictionCodes).toEqual([{ kind: 'access', code: 'restricted' }]);
  });

  it('leaves bbox undefined when a side is missing (never 0)', () => {
    expect(rec.bbox).toBeUndefined();
  });

  it('keeps a datetime start and drops indeterminatePosition="now" as undefined end', () => {
    expect(rec.temporalExtent).toEqual({ start: '2024-01-01T10:30:00Z', end: undefined });
  });
});

describe('parseIso19139 — robustness', () => {
  it('throws a clear error for non-XML and for XML that is not ISO 19139', () => {
    expect(() => parseIso19139('<html><body>Sign in</body></html>', 'x')).toThrow(/ISO 19139/);
    expect(() => parseIso19139('not xml at all', 'x')).toThrow();
  });

  it('accepts the GML 2005 namespace as well as GML 3.2 (same code path, different URI)', () => {
    const xml = fx('iso-metadata-uselimitation.xml');
    const g32 = xml.replace('xmlns:gml="http://www.opengis.net/gml"', 'xmlns:gml="http://www.opengis.net/gml/3.2"');
    expect(parseIso19139(g32, 'x').temporalExtent?.start).toBe('2024-01-01T10:30:00Z');
    expect(parseIso19139(xml, 'x').temporalExtent?.start).toBe('2024-01-01T10:30:00Z');
  });

  it('ignores a TimePeriod in an unrelated namespace', () => {
    const xml = fx('iso-metadata-uselimitation.xml').replace('xmlns:gml="http://www.opengis.net/gml"', 'xmlns:gml="http://example.org/not-gml"');
    expect(parseIso19139(xml, 'x').temporalExtent).toBeUndefined();
  });
});
