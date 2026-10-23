// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { analyseLicences } from '../../src/core/licence/analyse';
import { buildAttribution } from '../../src/core/licence/attribution';
import { loadLicenceReferences, splitReferences } from '../../src/core/licence/load';
import { MapFetcher } from '../sources/mapFetcher';
import { DC, dataciteJson, zenodoJson, ZEN } from '../helpers/licenceFixtures';
import { fixture } from '../sources/mapFetcher';

const PANGAEA_META = 'https://doi.pangaea.de/10.1594/PANGAEA.000000?format=metainfo_xml';

describe('splitReferences', () => {
  it('trims, drops empty lines and repeated lines', () => {
    expect(splitReferences(' 10.1/a \r\n\n10.1/a\nhttps://zenodo.org/records/1\n')).toEqual(['10.1/a', 'https://zenodo.org/records/1']);
  });
});

describe('loadLicenceReferences', () => {
  it('a PANGAEA DOI yields PANGAEA\'s own metadata record and its DataCite record, in ONE group; the data file is never requested', async () => {
    const c = { doi: '10.1594/PANGAEA.000000', title: 'P', url: 'https://doi.pangaea.de/10.1594/PANGAEA.000000' };
    const f = new MapFetcher({
      [DC + c.doi]: dataciteJson(c, [{ rightsIdentifier: 'cc-by-3.0', rightsUri: 'https://creativecommons.org/licenses/by/3.0/legalcode' }]),
      [PANGAEA_META]: { body: fixture('pangaea-metainfo-synthetic.xml') },
    });
    const load = await loadLicenceReferences([c.doi], f);
    expect(load.records.map((r) => r.source).sort()).toEqual(['datacite', 'pangaea']);
    expect(load.failures).toEqual([]);
    expect(f.calls.some((u) => u.includes('format=textfile'))).toBe(false);
    const a = analyseLicences(load.records);
    expect(a.groups.map((g) => g.id)).toEqual(['pangaea:000000']);
    expect(a.statedGroups).toBe(1);
    expect(a.contradictions).toEqual([]);
  });

  it('PANGAEA metadata that cannot be read is a failure of source pangaea; the DataCite record is kept', async () => {
    const c = { doi: '10.1594/PANGAEA.000000', title: 'P', url: 'https://doi.pangaea.de/10.1594/PANGAEA.000000' };
    for (const meta of [{ status: 403 }, { body: '<html>sign in</html>' }]) {
      const f = new MapFetcher({ [DC + c.doi]: dataciteJson(c, [{ rightsIdentifier: 'cc-by-3.0' }]), [PANGAEA_META]: meta });
      const load = await loadLicenceReferences([c.doi], f);
      expect(load.failures).toHaveLength(1);
      expect(load.failures[0]).toMatchObject({ source: 'pangaea' });
      expect(load.records.map((r) => r.source)).toEqual(['datacite']);
      const a = analyseLicences(load.records, { unreadable: ['pangaea'] });
      expect(a.sources.find((x) => x.source === 'pangaea')?.state).toBe('unreadable');
      expect(a.missing).toBe(false);
    }
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

  it('DataCite saying nothing is not a contradiction for the attribution: the licence the repository record states stays in it', async () => {
    const c = { doi: '10.5281/zenodo.9', title: 'Z' };
    const f = new MapFetcher({ [ZEN + '9']: zenodoJson('9', c, { id: 'cc-by-4.0' }), [DC + c.doi]: dataciteJson(c, []) });
    const a = analyseLicences((await loadLicenceReferences(['https://zenodo.org/records/9'], f)).records);
    expect(a.contradictions.map((x) => x.kind)).toEqual(['datacite-empty']);
    const attr = buildAttribution(a);
    expect(attr.omitted).toBeUndefined();
    expect(attr.text).toContain('Licence: Creative Commons Attribution 4.0 International');
  });

  it('a DOI whose repository is not supported and whose landing host is not allowed: listed as a failure without a source, never "no licence anywhere"', async () => {
    const c = { doi: '10.60894/ABC', title: 'R', url: 'https://rds.icm.edu.pl/citation?persistentId=doi:10.60894/ABC' };
    const load = await loadLicenceReferences([c.doi], new MapFetcher({ [DC + c.doi]: dataciteJson(c, []) }));
    expect(load.records.map((r) => r.source)).toEqual(['datacite']);
    expect(load.failures.map((x) => [x.source, x.finding?.ruleId])).toEqual([[undefined, 'IN-HOST-NOT-ALLOWED']]);
    const a = analyseLicences(load.records, { failures: [], inaccessible: true });
    expect(a.missing).toBe(false);
    expect(a.contradictions).toEqual([{ kind: 'datacite-empty', licence: '—' }]);
  });

  it('is empty when nothing was read', () => {
    expect(buildAttribution(analyseLicences([]))).toEqual({ text: '', omitted: 'none' });
  });
});

describe('one deposit, two DOIs', () => {
  it('a concept DOI that leads to a Zenodo record with another DOI does not produce a second DataCite source', async () => {
    const concept = { doi: '10.5281/zenodo.100', title: 'Z', url: 'https://zenodo.org/records/101' };
    const version = { doi: '10.5281/zenodo.101', title: 'Z' };
    const f = new MapFetcher({
      [DC + concept.doi]: dataciteJson(concept, [{ rightsIdentifier: 'cc-by-4.0' }]),
      [ZEN + '101']: zenodoJson('101', version, { id: 'cc-by-4.0' }),
      [DC + version.doi]: dataciteJson(version, [{ rightsIdentifier: 'cc-by-4.0' }]),
    });
    const load = await loadLicenceReferences([concept.doi], f);
    expect(load.records.map((r) => r.source).sort()).toEqual(['datacite', 'zenodo']);
    expect(f.calls).not.toContain(DC + version.doi);
  });
});
