// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { analyseLicences } from '../../src/core/licence/analyse';
import { buildAttribution } from '../../src/core/licence/attribution';
import { loadLicenceReferences, splitReferences } from '../../src/core/licence/load';
import { MapFetcher } from '../sources/mapFetcher';
import { DC, dataciteJson, zenodoJson, ZEN } from '../helpers/licenceFixtures';

describe('splitReferences', () => {
  it('trims, drops empty lines and repeated lines', () => {
    expect(splitReferences(' 10.1/a \r\n\n10.1/a\nhttps://zenodo.org/records/1\n')).toEqual(['10.1/a', 'https://zenodo.org/records/1']);
  });
});

describe('loadLicenceReferences', () => {
  it('a PANGAEA DOI yields the DataCite record only (the data file is not read) and it is one source group with PANGAEA', async () => {
    const c = { doi: '10.1594/PANGAEA.000001', title: 'P', url: 'https://doi.pangaea.de/10.1594/PANGAEA.000001' };
    const f = new MapFetcher({ [DC + c.doi]: dataciteJson(c, [{ rightsIdentifier: 'cc-by-4.0' }]) });
    const load = await loadLicenceReferences([c.doi], f);
    expect(load.records.map((r) => r.source)).toEqual(['datacite']);
    expect(load.failures).toEqual([]);
    expect(f.calls.every((u) => u.startsWith(DC))).toBe(true);
  });

  it('a Zenodo link and its DOI give two records, not four, and each URL is fetched once', async () => {
    const c = { doi: '10.5281/zenodo.9', title: 'Z' };
    const f = new MapFetcher({ [ZEN + '9']: zenodoJson('9', c, { id: 'cc0-1.0' }), [DC + c.doi]: dataciteJson(c, [{ rightsIdentifier: 'cc0-1.0' }]) });
    const load = await loadLicenceReferences(['https://zenodo.org/records/9', c.doi, '9'], f);
    expect(load.records.map((r) => r.source).sort()).toEqual(['datacite', 'zenodo']);
    expect(new Set(f.calls).size).toBe(f.calls.length);
  });

  it('a DOI unknown to DataCite is a failure of source datacite with its finding, not an empty record', async () => {
    const load = await loadLicenceReferences(['10.0000/nope'], new MapFetcher({}));
    expect(load.records).toEqual([]);
    expect(load.failures).toHaveLength(1);
    expect(load.failures[0]).toMatchObject({ ref: '10.0000/nope', source: 'datacite' });
    expect(load.failures[0].finding?.ruleId).toBe('IN-RECORD-INACCESSIBLE');
  });

  it('text that is no reference is a failure without a source', async () => {
    const load = await loadLicenceReferences(['not a reference'], new MapFetcher({}));
    expect(load.failures).toEqual([{ ref: 'not a reference', reason: 'unrecognised' }]);
  });
});

describe('buildAttribution', () => {
  it('leaves out what is missing and invents nothing', async () => {
    const f = new MapFetcher({ [DC + '10.0000/min']: dataciteJson({ doi: '10.0000/min' }, [{ rightsIdentifier: 'cc-by-4.0' }]) });
    const load = await loadLicenceReferences(['10.0000/min'], f);
    expect(buildAttribution(analyseLicences(load.records)).text).toBe(
      'https://doi.org/10.0000/min Licence: Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/legalcode).',
    );
  });

  it('is empty when nothing was read', () => {
    expect(buildAttribution(analyseLicences([]))).toEqual({ text: '', omitted: 'none' });
  });
});
