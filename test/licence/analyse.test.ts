// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { analyseLicences, groupOf } from '../../src/core/licence/analyse';
import { buildStatement } from '../../src/core/metadata/licence';
import type { MetadataRecord, MetadataSource } from '../../src/core/types';
import { makeRecord } from '../helpers/build';

const BY = 'https://creativecommons.org/licenses/by/4.0/';
const BYSA = 'https://creativecommons.org/licenses/by-sa/4.0/';
const rec = (source: MetadataSource, rights: [string, string?][], extra: Partial<MetadataRecord> = {}): MetadataRecord =>
  makeRecord(source, {
    licences: rights.map(([text, uri], i) => buildStatement({ source, field: `rightsList[${i}]`, text, uri })!),
    ...extra,
  });
const kinds = (r: ReturnType<typeof analyseLicences>) => r.contradictions.map((c) => c.kind);

describe('source groups', () => {
  it('Zenodo and the DataCite record of a Zenodo DOI are one group; PANGAEA likewise; others stand alone', () => {
    expect(groupOf(makeRecord('zenodo'))).toBe('zenodo');
    expect(groupOf(makeRecord('datacite', { doi: '10.5281/zenodo.1' }))).toBe('zenodo');
    expect(groupOf(makeRecord('datacite', { doi: '10.1594/PANGAEA.9' }))).toBe('pangaea');
    expect(groupOf(makeRecord('datacite', { doi: '10.9999/x', landingUrl: 'https://doi.pangaea.de/10.9999/x' }))).toBe('pangaea');
    expect(groupOf(makeRecord('pangaea'))).toBe('pangaea');
    expect(groupOf(makeRecord('datacite', { doi: '10.17882/1' }))).toBe('datacite');
    expect(groupOf(makeRecord('iso19139'))).toBe('iso19139');
  });

  it('their agreement confirms nothing: one group states a licence -> single source', () => {
    const a = analyseLicences([rec('zenodo', [['cc-by-4.0']], { doi: '10.5281/zenodo.1' }), rec('datacite', [['CC BY 4.0', BY]], { doi: '10.5281/zenodo.1' })]);
    expect(a.sources).toHaveLength(2);
    expect(a.groups).toHaveLength(1);
    expect(a.statedGroups).toBe(1);
    expect(a.comparison).toBe('single-source');
    expect(a.contradictions).toEqual([]);
  });

  it('independent sources that agree are "compared", N = number of groups', () => {
    const a = analyseLicences([
      rec('iso19139', [['CC BY 4.0', BY]]),
      rec('zenodo', [['cc-by-4.0']], { doi: '10.5281/zenodo.1' }),
      rec('datacite', [['CC BY 4.0', BY]], { doi: '10.5281/zenodo.1' }),
    ]);
    expect(a.statedGroups).toBe(2);
    expect(a.comparison).toBe('compared');
    expect(a.contradictions).toEqual([]);
  });

  it('a group that states nothing does not count', () => {
    const a = analyseLicences([rec('iso19139', [['CC BY 4.0', BY]]), rec('datacite', [])]);
    expect(a.statedGroups).toBe(1);
    expect(a.groups.find((g) => g.id === 'datacite')?.state).toBe('missing');
    expect(kinds(a)).toEqual(['datacite-empty']);
  });
});

describe('contradictions', () => {
  it('disjoint recognised sets are a mismatch, between groups', () => {
    const a = analyseLicences([rec('iso19139', [['CC BY 4.0', BY]]), rec('datacite', [['CC BY-SA 4.0', BYSA]])]);
    expect(a.contradictions).toMatchObject([{ kind: 'mismatch', licenceA: 'CC-BY-4.0', licenceB: 'CC-BY-SA-4.0', sameGroup: false }]);
  });
  it('Zenodo against its own DataCite record still disagrees (reported as same group)', () => {
    const a = analyseLicences([rec('zenodo', [['cc-by-4.0']], { doi: '10.5281/zenodo.1' }), rec('datacite', [['CC BY-SA 4.0', BYSA]], { doi: '10.5281/zenodo.1' })]);
    expect(a.contradictions).toMatchObject([{ kind: 'mismatch', sameGroup: true }]);
  });
  it('dual licensing inside one record, with or without a second source naming one of them, is no mismatch', () => {
    const dual = rec('datacite', [['CC BY 4.0', BY], ['CC BY-SA 4.0', BYSA]]);
    expect(kinds(analyseLicences([dual]))).toEqual([]);
    expect(kinds(analyseLicences([dual, rec('iso19139', [['CC BY-SA 4.0', BYSA]])]))).toEqual([]);
    expect(kinds(analyseLicences([dual, rec('iso19139', [['CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/']])]))).toEqual(['mismatch']);
  });
  it('unrecognised statements never mismatch', () => {
    expect(kinds(analyseLicences([rec('iso19139', [['CC BY 4.0', BY]]), rec('datacite', [['Open Access']])]))).toEqual([]);
  });
  it('a conflicted statement is reported where it is, with both readings', () => {
    const a = analyseLicences([rec('datacite', [['CC BY-NC 4.0', BY]])]);
    expect(a.contradictions).toHaveLength(1);
    const c = a.contradictions[0];
    expect(c.kind).toBe('text-uri');
    if (c.kind === 'text-uri') expect(c.statement.conflict).toMatchObject({ kind: 'text-uri', textLicence: 'CC-BY-NC-4.0', uriLicence: 'CC-BY-4.0' });
    expect(a.freeText).toBeUndefined();
    expect(a.statedGroups).toBe(1);
    expect(a.sources[0].statements[0].classification).toEqual({ kind: 'unrecognised' });
  });
  it('a restriction code contradicts a recognised OPEN licence only', () => {
    const copy = { restrictionCodes: [{ kind: 'use' as const, code: 'copyright' }] };
    expect(kinds(analyseLicences([rec('iso19139', [['CC BY 4.0', BY]], copy)]))).toEqual(['restriction-code']);
    expect(kinds(analyseLicences([rec('iso19139', [['CC BY-NC 4.0', 'https://creativecommons.org/licenses/by-nc/4.0/']], copy)]))).toEqual([]);
    expect(kinds(analyseLicences([rec('iso19139', [['Open Access']], copy)]))).toEqual([]);
  });
});

describe('what was and was not read', () => {
  it('nothing stated in a record that was read: missing', () => {
    const a = analyseLicences([makeRecord('datacite')]);
    expect(a.missing).toBe(true);
    expect(a.comparison).toBe('single-source');
  });
  it('a source that failed is "unreadable", never "missing"', () => {
    const a = analyseLicences([makeRecord('datacite')], { unreadable: ['iso19139'] });
    expect(a.missing).toBe(false);
    expect(a.hasUnreadable).toBe(true);
    expect(a.sources.map((s) => [s.source, s.state])).toEqual([['datacite', 'missing'], ['iso19139', 'unreadable']]);
    expect(analyseLicences([], { unreadable: ['zenodo'] }).sources).toHaveLength(1);
  });
  it('a failed source does not hide a record of the same source that was read', () => {
    const a = analyseLicences([rec('iso19139', [['CC BY 4.0', BY]])], { unreadable: ['iso19139'] });
    expect(a.sources).toHaveLength(1);
    expect(a.sources[0].state).toBe('stated');
  });
  it('metadataConstraints are not the licence of the data', () => {
    const r = makeRecord('iso19139', { licences: [buildStatement({ source: 'iso19139', field: 'metadataConstraints/useLimitation', text: 'CC BY 4.0' })!] });
    expect(analyseLicences([r]).missing).toBe(true);
  });
});

describe('free text and attribution data', () => {
  it('free text only: the hint is the publisher\'s own licence when recognised, an example when not', () => {
    const own = analyseLicences([rec('iso19139', [['Creative Commons CC-BY-SA 4.0']])]);
    expect(own.freeText).toMatchObject({ hint: 'CC-BY-SA-4.0', versionMissing: false });
    const none = analyseLicences([rec('iso19139', [['Open Access']])]);
    expect(none.freeText).toMatchObject({ hint: 'CC BY 4.0', versionMissing: true });
  });
  it('a machine-readable statement (URI naming the id, or the bare id) is not free text', () => {
    expect(analyseLicences([rec('iso19139', [['Creative Commons Attribution 4.0 International', BY]])]).freeText).toBeUndefined();
    expect(analyseLicences([rec('zenodo', [['cc-by-4.0']])]).freeText).toBeUndefined();
  });
  it('gives the page the official name and canonical URL of a recognised licence', () => {
    const a = analyseLicences([rec('datacite', [['Open Government Licence v3.0']])]);
    expect(a.sources[0].statements[0].info).toEqual({
      id: 'OGL-UK-3.0',
      name: 'Open Government Licence v3.0',
      url: 'http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    });
    expect(a.sources[0].statements[0].open).toBe(true);
  });
});
