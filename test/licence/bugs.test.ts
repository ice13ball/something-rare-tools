// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Regression tests for the nine licence bugs found in the 22.10 review. Each was written against the unfixed code
// and failed there (the failing output is kept in /tmp/stage1/bug-tests-before.txt by the author of the fix).
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import { runChecks } from '../../src/core/checks/run';
import { isOpenLicence, toSpdx } from '../../src/core/metadata/licence';
import { parseDataciteJson } from '../../src/core/metadata/datacite';
import { parseZenodoRecord } from '../../src/core/metadata/zenodo';
import { renderPlain } from '../../src/core/report';
import { LANGS } from '../../src/core/types';
import type { Finding, MetadataRecord } from '../../src/core/types';
import { loadGeoNetwork, loadRecord } from '../../src/core/sources';
import { MapFetcher, fixture } from '../sources/mapFetcher';
import { makeLicence, makeRecord } from '../helpers/build';

const run = (records: MetadataRecord[], inaccessible = false): Finding[] => checkLicence(records, { label: 'rec', inaccessible });
const lic = (f: Finding[]) => f.filter((x) => x.ruleId.startsWith('LIC-'));
const ids = (f: Finding[]) => lic(f).map((x) => x.ruleId);
const dc = (rightsList: unknown[]) => parseDataciteJson({ data: { attributes: { doi: '10.0000/x', rightsList } } }, 'DataCite x');

describe('bug 22.10: 1 — a licence URI must not silently beat the text', () => {
  it('DataCite "CC BY-NC 4.0" with a by/4.0 URI is not CC-BY-4.0 and raises LIC-TEXT-URI-CONFLICT', () => {
    const rec = dc([{ rights: 'CC BY-NC 4.0', rightsUri: 'https://creativecommons.org/licenses/by/4.0/' }]);
    expect(rec.licences[0]!.spdx).toBeUndefined();
    expect(ids(run([rec]))).toContain('LIC-TEXT-URI-CONFLICT');
  });
  it('DataCite identifier cc-by-nc-4.0 with a by/4.0 URI is not CC-BY-4.0', () => {
    const rec = dc([{ rightsIdentifier: 'cc-by-nc-4.0', rightsUri: 'https://creativecommons.org/licenses/by/4.0/legalcode' }]);
    expect(rec.licences[0]!.spdx).toBeUndefined();
  });
  it('Zenodo licence id cc-by-nc-4.0 with a by/4.0 link is not CC-BY-4.0', () => {
    const rec = parseZenodoRecord({ id: 1, metadata: { license: { id: 'cc-by-nc-4.0', link: 'https://creativecommons.org/licenses/by/4.0/' } } }, 'Zenodo 1');
    expect(rec.licences[0]!.spdx).toBeUndefined();
    expect(ids(run([rec]))).toContain('LIC-TEXT-URI-CONFLICT');
  });
  it('text and URI that agree stay recognised and quiet', () => {
    const rec = dc([{ rights: 'CC BY 4.0', rightsUri: 'https://creativecommons.org/licenses/by/4.0/' }]);
    expect(rec.licences[0]!.spdx).toBe('CC-BY-4.0');
    expect(ids(run([rec]))).toEqual([]);
  });
});

describe('bug 22.10: 2 — negation and added restrictions are not CC BY 4.0', () => {
  it.each([
    'CC BY 4.0, but not for commercial use',
    'CC BY 4.0 except for the figures',
    'CC BY 4.0 — for research purposes only',
    'CC BY 4.0, ale nie do użytku komercyjnego',
    'CC BY 4.0, aber nicht für kommerzielle Nutzung',
    'CC BY 4.0, sauf usage commercial',
  ])('"%s" is not recognised', (text) => {
    expect(toSpdx(text)).toBeUndefined();
  });
  it.each(['CC BY 4.0', 'Creative Commons Attribution 4.0 International (CC BY 4.0)', 'Use under CC-BY 4.0'])('"%s" still is', (text) => {
    expect(toSpdx(text)).toBe('CC-BY-4.0');
  });
  it('a restricted text in a record raises LIC-ADDED-CONDITIONS (and not LIC-TEXT-URI-CONFLICT: there is no link)', () => {
    const rec = dc([{ rights: 'CC BY 4.0, but not for commercial use' }]);
    expect(rec.licences[0]!.spdx).toBeUndefined();
    expect(ids(run([rec]))).toEqual(['LIC-ADDED-CONDITIONS']);
  });
});

describe('bug 22.10: 3 — ported Creative Commons URIs do not collapse to the generic id', () => {
  it.each([
    ['https://creativecommons.org/licenses/by/3.0/de/', 'CC-BY-3.0-DE'],
    ['https://creativecommons.org/licenses/by-sa/3.0/at/legalcode', 'CC-BY-SA-3.0-AT'],
    ['https://creativecommons.org/licenses/by/3.0/igo/', 'CC-BY-3.0-IGO'],
    ['https://creativecommons.org/licenses/by-nc-sa/2.0/uk/', 'CC-BY-NC-SA-2.0-UK'],
  ])('%s -> %s', (uri, id) => {
    expect(toSpdx(undefined, uri)).toBe(id);
  });
  it('a port SPDX has no id for is unrecognised, not generic', () => {
    expect(toSpdx(undefined, 'https://creativecommons.org/licenses/by/3.0/pl/')).toBeUndefined();
  });
  it('4.0 has no ports: a segment after 4.0 is not a recognised link (round 6a; was read as a deed language)', () => {
    expect(toSpdx(undefined, 'https://creativecommons.org/licenses/by/4.0/pl/')).toBeUndefined();
  });
  it.each([
    ['https://creativecommons.org/licenses/by/3.0/deed.pl', 'CC-BY-3.0'],
    ['https://creativecommons.org/licenses/by/3.0/legalcode.de', 'CC-BY-3.0'],
    ['https://creativecommons.org/licenses/by/4.0/deed.de', 'CC-BY-4.0'],
  ])('%s is a deed language, not a port -> %s', (uri, id) => {
    expect(toSpdx(undefined, uri)).toBe(id);
  });
});

describe('bug 22.10: 4 — one definition of open: NC and ND are not open', () => {
  it('isOpenLicence', () => {
    expect(isOpenLicence('CC-BY-NC-4.0')).toBe(false);
    expect(isOpenLicence('CC-BY-ND-4.0')).toBe(false);
    expect(isOpenLicence('CC-BY-4.0')).toBe(true);
  });
  it('copyright code next to CC BY-NC does not raise LIC-RESTRICTION-CONFLICT', () => {
    const rec = makeRecord('iso19139', {
      licences: [makeLicence('iso19139', { field: 'otherConstraints', text: 'CC BY-NC 4.0', spdx: 'CC-BY-NC-4.0' })],
      restrictionCodes: [{ kind: 'use', code: 'copyright' }],
    });
    expect(ids(run([rec]))).not.toContain('LIC-RESTRICTION-CONFLICT');
  });
});

describe('bug 22.10: 5 — dual licensing is not a mismatch', () => {
  const two = [
    { rights: 'CC BY 4.0', rightsUri: 'https://creativecommons.org/licenses/by/4.0/' },
    { rights: 'CC BY-SA 4.0', rightsUri: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  ];
  it('two rightsList entries in one record', () => {
    expect(ids(run([dc(two)]))).not.toContain('LIC-MISMATCH');
  });
  it('another source naming one of them agrees', () => {
    const iso = makeRecord('iso19139', { licences: [makeLicence('iso19139', { text: 'CC BY 4.0', uri: 'https://creativecommons.org/licenses/by/4.0/', spdx: 'CC-BY-4.0' })] });
    expect(ids(run([iso, dc(two)]))).not.toContain('LIC-MISMATCH');
  });
});

describe('bug 22.10: 6 — LIC-FREE-TEXT must not tell a publisher to switch to CC BY 4.0', () => {
  it('a recognised CC-BY-SA text gets advice that does not name CC BY 4.0, in every language', () => {
    const rec = makeRecord('iso19139', { licences: [makeLicence('iso19139', { field: 'otherConstraints', text: 'Creative Commons CC-BY-SA 4.0', spdx: 'CC-BY-SA-4.0' })] });
    const f = lic(run([rec])).find((x) => x.ruleId === 'LIC-FREE-TEXT')!;
    expect(f).toBeDefined();
    for (const lang of LANGS) expect(renderPlain(f, lang), lang).not.toMatch(/CC BY 4\.0/);
  });
  it('nothing recognised: an example is still offered', () => {
    const rec = makeRecord('iso19139', { licences: [makeLicence('iso19139', { field: 'otherConstraints', text: 'Open Access' })] });
    const f = lic(run([rec])).find((x) => x.ruleId === 'LIC-FREE-TEXT')!;
    expect(renderPlain(f, 'en')).toContain('CC BY 4.0');
  });
});

describe('bug 22.10: 7 — ISO 19115-3 records are read, not "inaccessible"', () => {
  const UUID = '00000000-0000-4000-8000-0000000000aa';
  const GN = `https://geonetwork.iopan.pl/geonetwork/srv/api/records/${UUID}/formatters/xml`;
  it('GeoNetwork answering 19115-3 XML gives metadata with the licence and no inaccessible finding', async () => {
    const f = new MapFetcher({ [GN]: { body: fixture('iso19115-3-synthetic.xml') } });
    const rec = await loadGeoNetwork('geonetwork.iopan.pl', UUID, f);
    expect(rec.findings.map((x) => x.ruleId)).not.toContain('IN-RECORD-INACCESSIBLE');
    const iso = rec.metadata[0]!;
    expect(iso.title).toBe('Synthetic ISO 19115-3 test record');
    expect(iso.version).toBe('2.1');
    expect(iso.licences.some((l) => l.spdx === 'CC-BY-4.0')).toBe(true);
    expect(rec.files.map((x) => x.name)).toEqual(['synthetic-profiles.csv']);
  });
  it('an HTML page is still inaccessible', async () => {
    const f = new MapFetcher({ [GN]: { body: '<html><body>Sign in</body></html>' } });
    const rec = await loadGeoNetwork('geonetwork.iopan.pl', UUID, f);
    expect(rec.findings.map((x) => x.ruleId)).toContain('IN-RECORD-INACCESSIBLE');
  });
});

describe('bug 22.10: 8 — SEANOE (DOI prefix 10.17882)', () => {
  it('is reported as a host the tool may not open, never as "no data file"', async () => {
    const f = new MapFetcher({ 'https://api.datacite.org/dois/10.17882/000000': { body: fixture('sources-datacite-seanoe.json') } });
    const rec = await loadRecord({ kind: 'doi', doi: '10.17882/000000' }, f);
    expect(rec.findings.map((x) => x.ruleId)).toEqual(['IN-HOST-NOT-ALLOWED']);
    expect(rec.findings[0]!.params).toEqual({ host: 'www.seanoe.org' });
    expect(rec.metadata[0]!.licences[0]!.spdx).toBe('CC-BY-4.0');
  });
});

describe('bug 22.10: 9 — a record that could not be read is not "no licence"', () => {
  it('checkLicence emits no LIC-MISSING for an inaccessible record', () => {
    expect(ids(run([makeRecord('datacite')], true))).toEqual([]);
    expect(ids(run([], true))).toEqual([]);
  });
  it('runChecks on a refused GeoNetwork record keeps IN-RECORD-INACCESSIBLE and adds no LIC-MISSING', () => {
    const inaccessible: Finding = { ruleId: 'IN-RECORD-INACCESSIBLE', severity: 'error', file: 'GeoNetwork x', params: { status: 403, host: 'h' } };
    const report = runChecks({
      datasets: [],
      parseFindings: [],
      records: [{ label: 'GeoNetwork x', kind: 'geonetwork', metadata: [makeRecord('datacite')], files: [], findings: [inaccessible] }],
    });
    const rules = report.findings.map((x) => x.ruleId);
    expect(rules).toContain('IN-RECORD-INACCESSIBLE');
    expect(rules).not.toContain('LIC-MISSING');
  });
  it('a readable record with no licence still gets LIC-MISSING', () => {
    expect(ids(run([makeRecord('datacite')]))).toEqual(['LIC-MISSING']);
  });
});
