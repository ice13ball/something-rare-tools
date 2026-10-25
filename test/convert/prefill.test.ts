// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Stage 3, the core: what dropped metadata files say about the description of the dataset (core/convert/prefill.ts), through the SHARED readers
// (parseFile -> core/metadata/*) and the SHARED licence analysis (analyseLicences). The licence matrix: taken (x3), other, missing, contradictory, and
// two files that agree. Synthetic files only.
import { describe, expect, it } from 'vitest';
import { EMPTY_METADATA, refreshPrefill } from '../../src/core/convert/metadata';
import type { DatasetMetadata } from '../../src/core/convert/metadata';
import { buildPrefill, licenceCaseOf, prefillValues } from '../../src/core/convert/prefill';
import type { ConvertPrefill } from '../../src/core/convert/prefill';
import { parseFile } from '../../src/core/parse';
import type { MetadataRecord } from '../../src/core/types';
import { BASE, CONTRADICTING, dataciteJson, dataciteXml, isoXml, zenodoJson } from './metaFixtures';

const enc = new TextEncoder();
const recordOf = (name: string, text: string): MetadataRecord => {
  const parsed = parseFile(name, enc.encode(text));
  expect(parsed.kind, name).toBe('metadata');
  return parsed.embeddedMetadata as MetadataRecord;
};
const prefillOf = (...files: [string, string][]): ConvertPrefill => buildPrefill(files.map(([n, t]) => recordOf(n, t))) as ConvertPrefill;

describe('the licence matrix', () => {
  it('taken (CC0-1.0): one recognised id, no contradiction, accepted by OBIS; its source is the file and the field', () => {
    const p = prefillOf(['bay.datacite.xml', dataciteXml({ licence: 'CC0-1.0' })]);
    expect(p.licence).toEqual({ kind: 'taken', id: 'CC0-1.0', sources: [{ file: 'bay.datacite.xml', field: 'rightsList[0]' }] });
    expect(prefillValues(p).licence).toBe('CC0-1.0');
  });

  it('taken (CC-BY-4.0): DataCite JSON', () => {
    const p = prefillOf(['bay.datacite.json', dataciteJson({ licence: 'CC-BY-4.0' })]);
    expect(p.licence).toEqual({ kind: 'taken', id: 'CC-BY-4.0', sources: [{ file: 'bay.datacite.json', field: 'rightsList[0]' }] });
    expect(prefillValues(p).licence).toBe('CC-BY-4.0');
  });

  it('taken (CC-BY-NC-4.0): Zenodo JSON', () => {
    const p = prefillOf(['bay.zenodo.json', zenodoJson({ licence: 'CC-BY-NC-4.0' })]);
    expect(p.licence).toEqual({ kind: 'taken', id: 'CC-BY-NC-4.0', sources: [{ file: 'bay.zenodo.json', field: 'license.id' }] });
    expect(prefillValues(p).licence).toBe('CC-BY-NC-4.0');
  });

  it('two files that agree: taken, with BOTH files as the source', () => {
    const p = prefillOf(['a.datacite.xml', dataciteXml({ licence: 'CC-BY-4.0' })], ['b.zenodo.json', zenodoJson({ licence: 'CC-BY-4.0', doi: '10.0000/synthetic.convert.2' })]);
    expect(p.licence.kind).toBe('taken');
    if (p.licence.kind === 'taken') {
      expect(p.licence.id).toBe('CC-BY-4.0');
      expect(p.licence.sources).toEqual([
        { file: 'a.datacite.xml', field: 'rightsList[0]' },
        { file: 'b.zenodo.json', field: 'license.id' },
      ]);
    }
  });

  it('other: CC-BY-3.0 is NOT mapped to CC-BY-4.0, and nothing is prefilled', () => {
    const p = prefillOf(['old.datacite.xml', dataciteXml({ licence: 'CC-BY-3.0' })]);
    expect(p.licence.kind).toBe('other');
    if (p.licence.kind === 'other') {
      expect(p.licence.said).toBe('CC-BY-3.0');
      expect(p.licence.says).toEqual([{ file: 'old.datacite.xml', field: 'rightsList[0]', says: 'CC-BY-3.0' }]);
    }
    expect(prefillValues(p).licence).toBeUndefined();
  });

  it('other: a ShareAlike licence (Zenodo cc-by-sa-4.0) is not one of the three, so nothing is prefilled', () => {
    const p = prefillOf(['sa.zenodo.json', zenodoJson({ licence: 'CC-BY-SA-4.0' })]);
    expect(p.licence).toMatchObject({ kind: 'other', said: 'CC-BY-SA-4.0' });
    expect(prefillValues(p).licence).toBeUndefined();
  });

  it('other: ISO 19139 with a free-text licence: the text is shown, nothing is prefilled', () => {
    const text = 'Free to use for non-commercial research; please cite the authors.';
    const p = prefillOf(['free.iso.xml', isoXml({ freeText: text })]);
    expect(p.licence).toMatchObject({ kind: 'other', said: text });
    if (p.licence.kind === 'other') expect(p.licence.says).toEqual([{ file: 'free.iso.xml', field: 'useLimitation', says: text }]);
    expect(prefillValues(p).licence).toBeUndefined();
  });

  it('missing: a record that states no licence', () => {
    const p = prefillOf(['none.datacite.xml', dataciteXml()]);
    expect(p.licence).toEqual({ kind: 'missing' });
    expect(prefillValues(p).licence).toBeUndefined();
  });

  it('contradictory: a DataCite XML and a Zenodo JSON that disagree; what each says is listed with its file and field', () => {
    const p = prefillOf(['dc.xml', CONTRADICTING.datacite], ['zen.json', CONTRADICTING.zenodo]);
    expect(p.licence.kind).toBe('contradictory');
    if (p.licence.kind === 'contradictory') {
      expect(p.licence.says).toEqual([
        { file: 'dc.xml', field: 'rightsList[0]', says: 'CC-BY-4.0' },
        { file: 'zen.json', field: 'license.id', says: 'CC0-1.0' },
      ]);
    }
    expect(prefillValues(p).licence).toBeUndefined();
  });

  it('several different licences in one file are not one licence either', () => {
    const rec = recordOf('dc.xml', dataciteXml({ licence: 'CC-BY-4.0' }));
    const second = { ...rec.licences[0], field: 'rightsList[1]', spdx: 'CC0-1.0', text: 'CC0-1.0', uri: undefined, uriSpdx: undefined, textSpdx: 'CC0-1.0' };
    expect(licenceCaseOf([{ ...rec, licences: [...rec.licences, second] }]).kind).toBe('contradictory');
  });

  it('the matrix as the shared analysis sees it: the same function /check uses decides contradictions (no parser of its own)', async () => {
    const { analyseLicences } = await import('../../src/core/licence/analyse');
    const records = [recordOf('dc.xml', CONTRADICTING.datacite), recordOf('zen.json', CONTRADICTING.zenodo)];
    expect(analyseLicences(records).contradictions.length).toBeGreaterThan(0);
  });
});

describe('the other fields, each with its source', () => {
  it('a single DataCite XML fills title, abstract, creators (as in the file), contact and citation', () => {
    const p = prefillOf(['bay.datacite.xml', dataciteXml({ contacts: ['Example, Anna'], licence: 'CC-BY-4.0' })]);
    const v = prefillValues(p);
    expect(v.title).toBe(BASE.title);
    expect(v.abstract).toBe(BASE.abstract);
    expect(v.creators).toBe('Example, Anna\nSample, Boris');
    expect(v.contactName).toBe('Example, Anna');
    expect(v.contactEmail).toBeUndefined();
    expect(p.fields.title).toEqual([{ value: BASE.title, sources: [{ file: 'bay.datacite.xml', field: 'titles' }] }]);
    expect(p.fields.creators[0].sources).toEqual([{ file: 'bay.datacite.xml', field: 'creators' }]);
    expect(p.fields.contact[0].sources).toEqual([{ file: 'bay.datacite.xml', field: 'contributors (ContactPerson)' }]);
  });

  it('the citation is the shared attribution text WITHOUT its licence sentence', () => {
    const p = prefillOf(['bay.datacite.xml', dataciteXml({ licence: 'CC-BY-4.0' })]);
    expect(prefillValues(p).citation).toBe(`Example, Anna; Sample, Boris (2020). ${BASE.title}. Example Marine Laboratory. https://doi.org/10.0000/synthetic.convert.1`);
    expect(prefillValues(p).citation).not.toMatch(/Licence/i);
  });

  it('the ISO record gives a contact with an e-mail address, and the author as creator', () => {
    const p = prefillOf(['iso.xml', isoXml({ contactName: 'Anna Example', email: 'anna@example.org', author: 'Anna Example' })]);
    const v = prefillValues(p);
    expect(v.contactName).toBe('Anna Example');
    expect(v.contactEmail).toBe('anna@example.org');
    expect(v.creators).toBe('Anna Example');
    expect(p.fields.contact[0].sources).toEqual([{ file: 'iso.xml', field: 'pointOfContact' }]);
  });

  it('files that say the same (ignoring capitals and spacing) share one value with both files as its sources', () => {
    const p = prefillOf(['a.xml', dataciteXml()], ['b.json', zenodoJson({ title: BASE.title.toUpperCase() + '  ' })]);
    expect(p.fields.title).toHaveLength(1);
    expect(p.fields.title[0].sources.map((s) => s.file)).toEqual(['a.xml', 'b.json']);
    expect(prefillValues(p).title).toBe(BASE.title);
  });

  it('files that disagree give NO prefill for that field, only a candidate per value with its sources', () => {
    const p = prefillOf(['a.xml', dataciteXml()], ['b.json', zenodoJson({ title: 'A different title of the same invented dataset', creators: ['Sample, Boris'] })]);
    expect(p.fields.title).toHaveLength(2);
    expect(p.fields.creators).toHaveLength(2);
    expect(prefillValues(p).title).toBeUndefined();
    expect(prefillValues(p).creators).toBeUndefined();
    // what they agree on is still filled
    expect(prefillValues(p).abstract).toBe(BASE.abstract);
    expect(p.fields.creators[1]).toEqual({ value: 'Sample, Boris', sources: [{ file: 'b.json', field: 'metadata.creators' }] });
  });

  it('two contacts in one file are a choice, not a pick', () => {
    const p = prefillOf(['a.xml', dataciteXml({ contacts: ['Example, Anna', 'Sample, Boris'] })]);
    expect(p.fields.contact.map((c) => c.value)).toEqual(['Example, Anna', 'Sample, Boris']);
    expect(prefillValues(p).contactName).toBeUndefined();
  });

  it('a field no file has is an empty list ("missing")', () => {
    const p = prefillOf(['a.xml', dataciteXml()]);
    expect(p.fields.contact).toEqual([]);
  });

  it('the coverage the metadata state is kept per file, for information', () => {
    const p = prefillOf(['a.xml', dataciteXml({ collected: '2019-06-01/2019-06-30', box: { west: 3, east: 5, south: 54, north: 56 } })], ['b.json', zenodoJson()]);
    expect(p.coverage).toEqual([{ file: 'a.xml', start: '2019-06-01', end: '2019-06-30', bbox: { west: 3, east: 5, south: 54, north: 56 } }]);
  });

  it('organisations among the creators are flagged', () => {
    const xml = dataciteXml().replace('nameType="Personal">Sample, Boris', 'nameType="Organizational">Example Marine Laboratory');
    expect(prefillOf(['a.xml', xml]).organisationsInCreators).toBe(true);
    expect(prefillOf(['a.xml', dataciteXml()]).organisationsInCreators).toBe(false);
  });

  it('no record, no prefill', () => {
    expect(buildPrefill([])).toBeUndefined();
    expect(prefillValues(undefined)).toEqual({});
  });
});

describe('what the user typed is never overwritten (refreshPrefill)', () => {
  const typed: DatasetMetadata = { ...EMPTY_METADATA, title: 'My own title', contactName: 'Me' };
  const p = prefillOf(['a.xml', dataciteXml({ contacts: ['Example, Anna'], licence: 'CC-BY-4.0' })]);

  it('a touched field keeps its text; the other fields are filled', () => {
    const out = refreshPrefill(typed, new Set(['title', 'contactName']), prefillValues(p));
    expect(out.title).toBe('My own title');
    expect(out.contactName).toBe('Me');
    expect(out.abstract).toBe(BASE.abstract);
    expect(out.licence).toBe('CC-BY-4.0');
  });

  it('a touched field that was CLEARED stays empty', () => {
    const out = refreshPrefill({ ...typed, title: '' }, new Set(['title']), prefillValues(p));
    expect(out.title).toBe('');
  });

  it('a field filled by an earlier drop and never touched follows the new drop (and empties when the new drop lacks it)', () => {
    const first = refreshPrefill(EMPTY_METADATA, new Set(), prefillValues(p));
    expect(first.title).toBe(BASE.title);
    const second = refreshPrefill(first, new Set(), prefillValues(prefillOf(['z.json', zenodoJson({ title: 'Second drop title' })])));
    expect(second.title).toBe('Second drop title');
    const third = refreshPrefill(second, new Set(), {});
    expect(third.title).toBe('');
    expect(third.licence).toBe('');
  });

  it('a prefilled licence outside the three is never accepted', () => {
    const out = refreshPrefill(EMPTY_METADATA, new Set(), { licence: 'CC-BY-3.0' as never });
    expect(out.licence).toBe('');
  });
});
