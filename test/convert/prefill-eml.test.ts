// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The eml.xml of an archive whose description was prefilled from dropped metadata files: it carries the prefilled values and the citation of the file, its
// structure is pinned, and (only when GBIF_EML_XSD points at a local copy of the GBIF profile eml.xsd and xmllint exists) it validates against the schema.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMPTY_METADATA, refreshPrefill } from '../../src/core/convert/metadata';
import type { DatasetMetadata } from '../../src/core/convert/metadata';
import { buildPrefill, prefillValues } from '../../src/core/convert/prefill';
import { parseFile } from '../../src/core/parse';
import { parseXml } from '../../src/core/metadata/xml';
import type { MetadataRecord } from '../../src/core/types';
import { exportSheet } from './exportHelpers';
import { W2_HEADER, W2_QUANTITY, W2_ROWS } from './helpers';
import { BASE, dataciteXml, isoXml } from './metaFixtures';

const enc = new TextEncoder();
const recordOf = (name: string, text: string): MetadataRecord => parseFile(name, enc.encode(text)).embeddedMetadata as MetadataRecord;

/** The form as the page leaves it after the drop: what the files gave, plus what was missing, typed by the user. */
function formFrom(...files: [string, string][]): DatasetMetadata {
  const prefilled = refreshPrefill(EMPTY_METADATA, new Set(), prefillValues(buildPrefill(files.map(([n, t]) => recordOf(n, t)))));
  return { ...prefilled, contactEmail: 'anna@example.org', institutionCode: 'INVENTED', basisOfRecord: 'HumanObservation' };
}

const children = (el: Element): string[] => [...el.childNodes].filter((n) => n.nodeType === 1).map((n) => (n as Element).localName);
const BAY: [string, string] = ['bay.datacite.xml', dataciteXml({ contacts: ['Example, Anna'], licence: 'CC-BY-4.0', collected: '2019-06-01/2019-06-30', box: { west: 3, east: 5, south: 54, north: 56 } })];

describe('eml.xml with a prefilled description', () => {
  it('carries the title, abstract, creators, contact, licence and the citation the file gave', async () => {
    const meta = formFrom(BAY);
    const e = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, fullList: true, meta });
    const doc = parseXml(e.eml, 'eml.xml');
    expect(doc.getElementsByTagName('title')[0].textContent).toBe(BASE.title);
    expect(doc.getElementsByTagName('abstract')[0].textContent?.trim()).toBe(BASE.abstract);
    const names = [...doc.getElementsByTagName('creator')].map((c) => [c.getElementsByTagName('givenName')[0]?.textContent, c.getElementsByTagName('surName')[0].textContent]);
    expect(names).toEqual([['Anna', 'Example'], ['Boris', 'Sample']]);
    expect(doc.getElementsByTagName('contact')[0].getElementsByTagName('surName')[0].textContent).toBe('Example');
    expect(doc.getElementsByTagName('ulink')[0].getAttribute('url')).toBe('http://creativecommons.org/licenses/by/4.0/legalcode');
    expect(doc.getElementsByTagName('citation')[0].textContent).toBe(`Example, Anna; Sample, Boris (2020). ${BASE.title}. Example Marine Laboratory. https://doi.org/10.0000/synthetic.convert.1`);
  });

  it('the structure is the one of stage 2 (the citation is still the last child of gbif); the coverage stays the one computed from the data, not the one the file states', async () => {
    const e = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, fullList: true, meta: formFrom(BAY) });
    const doc = parseXml(e.eml, 'eml.xml');
    const dataset = doc.getElementsByTagName('dataset')[0];
    expect(children(dataset)).toEqual(['title', 'creator', 'creator', 'metadataProvider', 'pubDate', 'language', 'abstract', 'keywordSet', 'intellectualRights', 'coverage', 'contact']);
    expect(children(doc.getElementsByTagName('gbif')[0])).toEqual(['dateStamp', 'hierarchyLevel', 'citation']);
    expect(doc.getElementsByTagName('language')[0].textContent).toBe('en');
    expect(doc.documentElement.getAttribute('xml:lang')).toBe('en');
    // the box and dates of the data (W2), not the metadata file's 3..5 / 54..56 and June 2019
    expect(doc.getElementsByTagName('westBoundingCoordinate')[0].textContent).toBe('-3.2');
    expect(doc.getElementsByTagName('beginDate')[0].textContent?.trim()).toBe('2023-07-01');
    expect(e.eml).not.toContain('2019-06');
  });

  it('a citation with line breaks is written on one line; an empty one is built as before', async () => {
    const withBreaks = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, meta: { ...formFrom(BAY), citation: 'Example, A.\n  (2020). A title.\n' } });
    expect(parseXml(withBreaks.eml, 'eml.xml').getElementsByTagName('citation')[0].textContent).toBe('Example, A. (2020). A title.');
    const empty = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, meta: { ...formFrom(BAY), citation: '' } });
    expect(parseXml(empty.eml, 'eml.xml').getElementsByTagName('citation')[0].textContent).toMatch(/^Example, Anna; Sample, Boris \(\d{4}\)\. Synthetic zooplankton counts, Test Bay 2019\. Dataset\.$/);
  });

  it("an ISO record's free-text licence leaves the licence unchosen, so the licence rule blocks the export until the user chooses", async () => {
    const meta = formFrom(['free.iso.xml', isoXml({ freeText: 'Free to use for non-commercial research; please cite the authors.', author: 'Anna Example', contactName: 'Anna Example', email: 'anna@example.org' })]);
    expect(meta.licence).toBe('');
    const e = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, meta });
    expect(e.findings.map((f) => f.ruleId)).toContain('CONV-LICENCE-UNSET');
    expect(e.eml).toBe('');
    expect(e.files).toEqual([]);
  });
});

describe.skipIf(!process.env.GBIF_EML_XSD)('schema validation against a local GBIF profile copy (GBIF_EML_XSD=/path/eml.xsd, needs xmllint)', () => {
  it('the eml.xml of a prefilled description validates', async () => {
    const e = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, fullList: true, meta: formFrom(BAY) });
    const f = join(mkdtempSync(join(tmpdir(), 'eml3-')), 'eml.xml');
    writeFileSync(f, e.eml);
    const r = spawnSync('xmllint', ['--noout', '--schema', process.env.GBIF_EML_XSD as string, f], { encoding: 'utf8' });
    expect(r.stderr, r.stderr).toContain('validates');
  });
});
