// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Dataverse (RepOD): resolve, load the latest PUBLISHED version, files (original vs .tab), held-back and oversized files, licence.
import { describe, expect, it } from 'vitest';
import { DATAVERSE_HOSTS, LINKED_FILE_MAX_BYTES } from '../../config/dataverse';
import { checkLicence } from '../../src/core/checks/licence';
import { analyseLicences } from '../../src/core/licence/analyse';
import { loadLicenceReferences } from '../../src/core/licence/load';
import { parseDataverseVersion } from '../../src/core/metadata/dataverse';
import { fetchFile, loadDataverse, loadRecord, resolveInput, routeFromDatacite, dataverseVersionUrl } from '../../src/core/sources';
import { browserFetcher, HostNotAllowedError } from '../../src/core/sources/fetcher';
import type { Finding, MetadataRecord } from '../../src/core/types';
import { renderPlain } from '../../src/core/report';
import { DC, dataciteJson } from '../helpers/licenceFixtures';
import { fixture, MapFetcher } from './mapFetcher';

const HOST = 'repod.icm.edu.pl';
const PID = 'doi:10.18150/ABC123';
const DOI = '10.18150/ABC123';
const VERSION = dataverseVersionUrl(HOST, PID);
const base = (): Record<string, any> => JSON.parse(fixture('dataverse-version-synthetic.json')); // eslint-disable-line @typescript-eslint/no-explicit-any
const reply = (v: unknown) => ({ body: JSON.stringify(v) });
const rules = (fs: Finding[]): string[] => fs.map((f) => f.ruleId);
const dc = (rights?: { rights?: string; rightsUri?: string; rightsIdentifier?: string }[]) =>
  dataciteJson({ doi: DOI, title: 'DC title', url: `https://${HOST}/citation?persistentId=${PID}`, publisher: 'RepOD' }, rights ?? []);

describe('resolving', () => {
  it('a dataset page of a listed installation is a Dataverse reference, the persistent id kept exactly', () => {
    expect(resolveInput(`https://${HOST}/dataset.xhtml?persistentId=doi:10.18150/repod.0451825`)).toEqual({ kind: 'dataverse', host: HOST, pid: 'doi:10.18150/repod.0451825' });
    expect(resolveInput(`https://${HOST}/citation?persistentId=${PID}&version=1.0`)).toEqual({ kind: 'dataverse', host: HOST, pid: PID });
  });
  it('a page of a Dataverse host that is not listed, or an http link, is unknown', () => {
    expect(resolveInput(`https://dataverse.example.org/dataset.xhtml?persistentId=${PID}`).kind).toBe('unknown');
    expect(resolveInput(`https://dataverse.no/dataset.xhtml?persistentId=doi:10.18710/CVQPYG`).kind).toBe('unknown');
    expect(resolveInput(`http://${HOST}/dataset.xhtml?persistentId=${PID}`).kind).toBe('unknown');
    expect(resolveInput(`https://${HOST}/dataset.xhtml`).kind).toBe('unknown');
    expect(resolveInput(`https://${HOST}.evil.com/dataset.xhtml?persistentId=${PID}`).kind).toBe('unknown');
  });
  it('a RepOD DOI stays a DOI; DataCite routes it by the landing page of a listed host', () => {
    expect(resolveInput(DOI)).toEqual({ kind: 'doi', doi: DOI });
    const rec = (url: string) => ({ source: 'datacite', label: 'x', licences: [], restrictionCodes: [], distributionLinks: [], landingUrl: url }) as MetadataRecord;
    expect(routeFromDatacite(rec(`https://${HOST}/citation?persistentId=${PID}`), DOI)).toEqual({ kind: 'dataverse', host: HOST, pid: PID });
    expect(routeFromDatacite(rec(`https://rds.icm.edu.pl/citation?persistentId=doi:10.60894/WJ2WZE`), '10.60894/WJ2WZE').kind).toBe('other');
    expect(routeFromDatacite(rec(`https://dataverse.example.org/citation?persistentId=${PID}`), DOI).kind).toBe('other');
  });
});

describe('loadDataverse', () => {
  it('reads ONLY the latest published version, names it, and maps the metadata', async () => {
    const f = new MapFetcher({ [VERSION]: reply(base()), [DC + DOI]: dc() });
    const out = await loadDataverse(HOST, PID, f);
    expect(out.kind).toBe('dataverse');
    expect(f.calls[0]).toBe(`https://${HOST}/api/datasets/:persistentId/versions/:latest-published?persistentId=doi:10.18150/ABC123`);
    expect(f.calls.filter((u) => u.includes('/api/'))).toHaveLength(1);
    expect(f.calls.some((u) => /DRAFT|versions\/:draft|:latest(?!-)/i.test(u))).toBe(false);
    const dv = out.metadata.find((m) => m.source === 'dataverse')!;
    expect(dv).toMatchObject({
      title: 'Synthetic fjord temperature series',
      version: '2.0',
      doi: DOI,
      publisher: 'RepOD',
      creators: ['Nowak, Anna'],
      bbox: { west: 14, east: 16.5, south: 76.5, north: 78.5 },
      temporalExtent: { start: '2021-06-01', end: '2021-08-31' },
    });
    expect(dv.abstract).toBe('Invented CTD casts in an invented fjord.');
    const info = out.findings.find((x) => x.ruleId === 'IN-DATAVERSE-FILES')!;
    expect(info.params.version).toBe('2.0');
    expect(info.params.host).toBe(HOST);
  });

  it('an ingested table is read as the ORIGINAL the author uploaded, and the finding says so; an original the tool cannot read falls back to the .tab, also said', async () => {
    const f = new MapFetcher({ [VERSION]: reply(base()), [DC + DOI]: dc() });
    const out = await loadDataverse(HOST, PID, f);
    const byName = Object.fromEntries(out.files.map((x) => [x.name, x.url]));
    expect(byName['ctd_stations.xlsx']).toBe(`https://${HOST}/api/access/datafile/9001?format=original`);
    expect(byName['bottle.csv']).toBe(`https://${HOST}/api/access/datafile/9002`);
    expect(byName['survey_spss.tab']).toBe(`https://${HOST}/api/access/datafile/9003`);
    expect(Object.keys(byName)).not.toContain('ctd_stations.tab');
    expect(Object.keys(byName)).not.toContain('report.pdf');
    const info = out.findings.find((x) => x.ruleId === 'IN-DATAVERSE-FILES')!;
    expect(info.params.original).toBe('ctd_stations.xlsx');
    expect(info.params.converted).toBe('survey_spss.tab');
    expect(renderPlain(info, 'en')).toMatch(/version 2\.0.*latest published.*uploaded them \(the original\): ctd_stations\.xlsx.*\.tab copy.*survey_spss\.tab/);
    expect(info.value).toBe('original read: ctd_stations.xlsx; .tab read: survey_spss.tab');
  });

  it('a restricted file is held back by the source: named, never downloaded, never an error in the data', async () => {
    const f = new MapFetcher({ [VERSION]: reply(base()), [DC + DOI]: dc() });
    const out = await loadDataverse(HOST, PID, f);
    const held = out.findings.filter((x) => x.ruleId === 'IN-FILE-HELD-BACK');
    expect(held.map((x) => x.file)).toEqual(['restricted_run.tab']);
    expect(held[0]!.severity).toBe('warning');
    expect(held[0]!.params.host).toBe(HOST);
    expect(out.files.map((x) => x.name)).not.toContain('restricted_run.tab');
    expect(rules(out.findings)).not.toContain('IN-NO-DATA-FILE');
  });

  it('an embargo that has not ended holds a file back; one that has ended does not', async () => {
    const doc = base();
    doc.data.files[1].embargo = { dateAvailable: '2999-01-01', reason: 'x' };
    doc.data.files[0].dataFile.embargo = { dateAvailable: '2001-01-01' };
    const out = await loadDataverse(HOST, PID, new MapFetcher({ [VERSION]: reply(doc), [DC + DOI]: dc() }));
    expect(out.findings.filter((x) => x.ruleId === 'IN-FILE-HELD-BACK').map((x) => x.file).sort()).toEqual(['bottle.csv', 'restricted_run.tab']);
    expect(out.files.map((x) => x.name)).toContain('ctd_stations.xlsx');
  });

  it('a file above the per-download limit is reported before anything is downloaded, not read partly', async () => {
    const f = new MapFetcher({ [VERSION]: reply(base()), [DC + DOI]: dc() });
    const out = await loadDataverse(HOST, PID, f);
    const big = out.findings.filter((x) => x.ruleId === 'IN-FILE-TOO-LARGE');
    expect(big.map((x) => x.file)).toEqual(['huge.csv']);
    expect(big[0]!.params.mb).toBe(30);
    expect(out.files.map((x) => x.name)).not.toContain('huge.csv');
    expect(LINKED_FILE_MAX_BYTES).toBe(30 * 1024 * 1024);
  });

  it('the size of what is downloaded counts: an original over the limit, a .tab under it', () => {
    const doc = base();
    doc.data.files[0].dataFile.originalFileSize = LINKED_FILE_MAX_BYTES + 1;
    const read = parseDataverseVersion(doc, 'x', { host: HOST, pid: PID })!;
    expect(read.files.find((x) => x.id === '9001')).toMatchObject({ form: 'original', size: LINKED_FILE_MAX_BYTES + 1 });
  });

  it('only restricted data files at all: held-back findings, no "no data file" error that blames the record', async () => {
    const doc = base();
    doc.data.files = [doc.data.files[3]];
    const out = await loadDataverse(HOST, PID, new MapFetcher({ [VERSION]: reply(doc), [DC + DOI]: dc() }));
    expect(out.files).toEqual([]);
    expect(rules(out.findings)).toContain('IN-FILE-HELD-BACK');
    expect(rules(out.findings)).not.toContain('IN-NO-DATA-FILE');
  });

  it('no data file at all is IN-NO-DATA-FILE', async () => {
    const doc = base();
    doc.data.files = [doc.data.files[5]];
    const out = await loadDataverse(HOST, PID, new MapFetcher({ [VERSION]: reply(doc), [DC + DOI]: dc() }));
    expect(rules(out.findings)).toContain('IN-NO-DATA-FILE');
  });

  it('files that may hold data in a format the tool does not read (zip, NetCDF) are named, documents are not; a held-back one is held back', async () => {
    const doc = base();
    const as = (name: string, id: string, restricted = false) => {
      const f = JSON.parse(JSON.stringify(doc.data.files[1]));
      f.label = name;
      f.dataFile.filename = name;
      f.dataFile.id = id;
      f.restricted = restricted;
      return f;
    };
    doc.data.files.push(as('data.zip', '9101'), as('model.nc', '9102'), as('secret.zip', '9103', true));
    const out = await loadDataverse(HOST, PID, new MapFetcher({ [VERSION]: reply(doc), [DC + DOI]: dc() }));
    const notRead = out.findings.filter((x) => x.ruleId === 'IN-FILES-NOT-READ');
    expect(notRead).toHaveLength(1);
    expect(notRead[0]!.severity).toBe('warning');
    expect(notRead[0]!.params.files).toBe('data.zip, model.nc');
    expect(out.findings.filter((x) => x.ruleId === 'IN-FILE-HELD-BACK').map((x) => x.file)).toContain('secret.zip');
    expect(renderPlain(notRead[0]!, 'pl')).toContain('data.zip, model.nc');
  });

  it('only a PDF beside the tables: nothing is listed as not read', async () => {
    const out = await loadDataverse(HOST, PID, new MapFetcher({ [VERSION]: reply(base()), [DC + DOI]: dc() }));
    expect(rules(out.findings)).not.toContain('IN-FILES-NOT-READ');
  });

  it('a lower-case id that the server does not know is asked once more in the case the registry writes it', async () => {
    const lower = 'doi:10.18150/abc123';
    const f = new MapFetcher({ [VERSION]: reply(base()), [DC + DOI]: dc() });
    const out = await loadDataverse(HOST, lower, f);
    expect(f.calls.slice(0, 2)).toEqual([dataverseVersionUrl(HOST, lower), VERSION]);
    expect(out.metadata[0]!.source).toBe('dataverse');
  });

  it('an unknown or unpublished dataset (404) is IN-RECORD-INACCESSIBLE with the host; a body that is not Dataverse is too', async () => {
    const f404 = new MapFetcher({});
    const a = await loadDataverse(HOST, PID, f404);
    expect(a.findings.map((x) => [x.ruleId, x.params.status, x.params.host])).toEqual([['IN-RECORD-INACCESSIBLE', 404, HOST]]);
    expect(a.metadata).toEqual([]);
    for (const body of ['<html>', '{"status":"ERROR","message":"no"}', '[]']) {
      const b = await loadDataverse(HOST, PID, new MapFetcher({ [VERSION]: { body } }));
      expect(rules(b.findings)).toEqual(['IN-RECORD-INACCESSIBLE']);
      expect(b.files).toEqual([]);
    }
  });

  it('a version that is not RELEASED is never read', async () => {
    const doc = base();
    doc.data.versionState = 'DRAFT';
    const out = await loadDataverse(HOST, PID, new MapFetcher({ [VERSION]: reply(doc), [DC + DOI]: dc() }));
    expect(out.metadata).toEqual([]);
    expect(out.files).toEqual([]);
    expect(rules(out.findings)).toEqual(['IN-RECORD-INACCESSIBLE']);
  });

  it('a Dataverse host that is not listed is refused before any request', async () => {
    const f = new MapFetcher({});
    const out = await loadDataverse('dataverse.example.org', PID, f);
    expect(rules(out.findings)).toEqual(['IN-HOST-NOT-ALLOWED']);
    expect(f.calls).toEqual([]);
  });
});

describe('through the DOI and the dataset link', () => {
  it('a RepOD DOI: DataCite first, then the Dataverse version at the id of the landing page, DataCite kept as a source', async () => {
    const f = new MapFetcher({ [DC + DOI]: dc(), [VERSION]: reply(base()) });
    const out = await loadRecord(resolveInput(DOI), f);
    expect(f.calls).toEqual([DC + DOI, VERSION]);
    expect(out.kind).toBe('dataverse');
    expect(out.metadata.map((m) => m.source)).toEqual(['dataverse', 'datacite']);
    expect(out.files.length).toBe(3);
  });
  it('a dataset link: the Dataverse version, then the DataCite record of its DOI for the cross-check', async () => {
    const f = new MapFetcher({ [DC + DOI]: dc(), [VERSION]: reply(base()) });
    const out = await loadRecord(resolveInput(`https://${HOST}/dataset.xhtml?persistentId=${PID}`), f);
    expect(f.calls).toEqual([VERSION, DC + DOI]);
    expect(out.metadata.map((m) => m.source)).toEqual(['dataverse', 'datacite']);
  });
  it('a file of the record is downloaded from the listed host; another host is refused', async () => {
    const f = new MapFetcher({ [`https://${HOST}/api/access/datafile/9002`]: { body: 'a,b\n1,2\n' } });
    expect(new TextDecoder().decode(await fetchFile({ name: 'bottle.csv', url: `https://${HOST}/api/access/datafile/9002` }, f))).toBe('a,b\n1,2\n');
    await expect(fetchFile({ name: 'x.csv', url: 'https://dataverse.example.org/api/access/datafile/1' }, f)).rejects.toBeInstanceOf(HostNotAllowedError);
  });
});

describe('metadata mapping', () => {
  const read = (patch: (d: Record<string, any>) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const doc = base();
    patch(doc);
    return parseDataverseVersion(doc, 'x', { host: HOST, pid: PID })!.record;
  };
  const stripLicences = (d: Record<string, any>) => d.data.files.forEach((f: Record<string, any>) => { delete f.licenseName; delete f.licenseUrl; }); // eslint-disable-line @typescript-eslint/no-explicit-any

  it('RepOD writes the box as a ring of "lon lat" lines; the standard four fields work too; a box that is not on the globe is dropped', () => {
    const ring = read((d) => {
      d.data.metadataBlocks.geospatial.fields = [{ typeName: 'geographicBoundingBox', value: [{ geographicCoordinates: { typeName: 'geographicCoordinates', value: '-59.5 12.3\n-59.5 14.1\n-57.5 14.1\n-57.5 12.3\n-59.5 12.3' } }] }];
    });
    expect(ring.bbox).toEqual({ west: -59.5, east: -57.5, south: 12.3, north: 14.1 });
    const bad = read((d) => {
      d.data.metadataBlocks.geospatial.fields = [{ typeName: 'geographicBoundingBox', value: [{ westLongitude: { value: '200' }, eastLongitude: { value: '210' }, northLatitude: { value: '10' }, southLatitude: { value: '5' } }, { westLongitude: { value: '10' }, eastLongitude: { value: '5' }, northLatitude: { value: '10' }, southLatitude: { value: '5' } }] }];
    });
    expect(bad.bbox).toBeUndefined();
  });

  it('time: the period the data cover wins over the date of collection; free text is no date', () => {
    expect(read(() => undefined).temporalExtent).toEqual({ start: '2021-06-01', end: '2021-08-31' });
    const collected = read((d) => { d.data.metadataBlocks.citation.fields = d.data.metadataBlocks.citation.fields.filter((f: { typeName: string }) => f.typeName !== 'timePeriodCovered'); });
    expect(collected.temporalExtent).toEqual({ start: '2020', end: '2022' });
    const text = read((d) => {
      d.data.metadataBlocks.citation.fields = d.data.metadataBlocks.citation.fields.filter((f: { typeName: string }) => f.typeName !== 'timePeriodCovered');
      d.data.metadataBlocks.citation.fields[d.data.metadataBlocks.citation.fields.length - 1].value[0].dateOfCollectionStart.value = 'summer of 1999';
    });
    expect(text.temporalExtent).toEqual({ end: '2022' });
  });

  it('a version-level licence ({ name, uri }) is one statement; a bare name too; "NONE" is not a licence', () => {
    const a = read((d) => { stripLicences(d); d.data.license = { name: 'CC0 1.0', uri: 'http://creativecommons.org/publicdomain/zero/1.0' }; });
    expect(a.licences).toHaveLength(1);
    expect(a.licences[0]).toMatchObject({ source: 'dataverse', field: 'license', spdx: 'CC0-1.0' });
    const b = read((d) => { stripLicences(d); d.data.license = 'CC BY 4.0'; });
    expect(b.licences[0]).toMatchObject({ field: 'license', spdx: 'CC-BY-4.0' });
    const none = read((d) => { stripLicences(d); d.data.license = 'NONE'; });
    expect(none.licences).toEqual([]);
  });

  it('RepOD states the licence per file: each distinct one is a statement, the names RepOD uses are recognised', () => {
    const r = read((d) => {
      d.data.files[1].licenseName = 'CC0 Creative Commons Zero 1.0 Waiver';
      d.data.files[1].licenseUrl = 'https://creativecommons.org/publicdomain/zero/1.0/legalcode';
    });
    expect(r.licences.map((l) => [l.field, l.spdx])).toEqual([['files.license[0]', 'CC-BY-4.0'], ['files.license[1]', 'CC0-1.0']]);
  });
});

describe('licence: one deposit with its DataCite record, custom terms stay unrecognised', () => {
  it('a Dataverse link and its DOI give a Dataverse record and ONE DataCite record, in ONE group', async () => {
    const f = new MapFetcher({ [DC + DOI]: dc([{ rightsIdentifier: 'cc-by-4.0', rightsUri: 'https://creativecommons.org/licenses/by/4.0/legalcode' }]), [VERSION]: reply(base()) });
    const load = await loadLicenceReferences([`https://${HOST}/dataset.xhtml?persistentId=${PID}`, DOI], f);
    expect(load.failures).toEqual([]);
    expect(load.records.map((r) => r.source).sort()).toEqual(['datacite', 'dataverse']);
    expect(new Set(f.calls).size).toBe(f.calls.length);
    expect(f.calls.some((u) => u.includes('/api/access/'))).toBe(false); // /licence never downloads a data file
    const a = analyseLicences(load.records);
    expect(a.groups).toHaveLength(1);
    expect(a.groups[0]!.sources.map((s) => s.source).sort()).toEqual(['datacite', 'dataverse']);
    expect(a.recognisedGroups).toBe(1);
    expect(a.contradictions).toEqual([]);
  });

  it('Dataverse against a different DataCite licence of the same deposit is a mismatch inside the group, not two deposits', async () => {
    const f = new MapFetcher({ [DC + DOI]: dc([{ rightsIdentifier: 'cc0-1.0' }]), [VERSION]: reply(base()) });
    const load = await loadLicenceReferences([DOI], f);
    const a = analyseLicences(load.records);
    expect(a.groups).toHaveLength(1);
    expect(a.contradictions.map((c) => c.kind)).toEqual(['mismatch']);
  });

  it('a DataCite record that says nothing while Dataverse states a licence is reported (RepOD DataCite records carry no rights)', async () => {
    const f = new MapFetcher({ [DC + DOI]: dc(), [VERSION]: reply(base()) });
    const load = await loadLicenceReferences([DOI], f);
    const findings = checkLicence(load.records, { label: 'L', inaccessible: false });
    expect(rules(findings)).toContain('LIC-DATACITE-EMPTY');
    expect(rules(findings)).not.toContain('LIC-MISSING');
  });

  it('files licensed differently (data CC BY, documents CC0) are dual licensing, not a contradiction inside Dataverse', async () => {
    const doc = base();
    doc.data.files[5].licenseName = 'CC0 Creative Commons Zero 1.0 Waiver';
    doc.data.files[5].licenseUrl = 'https://creativecommons.org/publicdomain/zero/1.0/legalcode';
    const f = new MapFetcher({ [DC + DOI]: dc([{ rightsIdentifier: 'cc-by-4.0' }]), [VERSION]: reply(doc) });
    const load = await loadLicenceReferences([DOI], f);
    const a = analyseLicences(load.records);
    expect(a.contradictions).toEqual([]);
  });

  it('restricted files: /licence says the verdict covers only the open files; none restricted, nothing said', () => {
    const read = parseDataverseVersion(base(), 'x', { host: HOST, pid: PID })!;
    expect(read.record.heldBackFiles).toEqual(['restricted_run.tab']);
    const held = checkLicence([read.record], { label: 'x', inaccessible: false }).filter((x) => x.ruleId === 'LIC-FILES-HELD-BACK');
    expect(held).toHaveLength(1);
    expect(held[0]!.params.files).toBe('restricted_run.tab');
    const open = base();
    open.data.files = open.data.files.filter((f: Record<string, any>) => !f.restricted); // eslint-disable-line @typescript-eslint/no-explicit-any
    const rec = parseDataverseVersion(open, 'x', { host: HOST, pid: PID })!.record;
    expect(rec.heldBackFiles).toBeUndefined();
    expect(rules(checkLicence([rec], { label: 'x', inaccessible: false }))).not.toContain('LIC-FILES-HELD-BACK');
  });

  it('CUSTOM terms are unrecognised (fail-closed): never read as a known licence', () => {
    for (const terms of ['Free for academic use, contact the author for anything else.', 'Data may be used with the permission of the owner. CC BY-NC for students.', '<p>All rights reserved.</p>']) {
      const doc = base();
      doc.data.files.forEach((x: Record<string, any>) => { delete x.licenseName; delete x.licenseUrl; }); // eslint-disable-line @typescript-eslint/no-explicit-any
      doc.data.license = 'NONE';
      doc.data.termsOfUse = terms;
      const rec = parseDataverseVersion(doc, 'x', { host: HOST, pid: PID })!.record;
      expect(rec.licences).toHaveLength(1);
      expect(rec.licences[0]).toMatchObject({ field: 'termsOfUse' });
      expect(rec.licences[0]!.spdx).toBeUndefined();
      const a = analyseLicences([rec]);
      expect(a.sources[0]!.statements[0]!.classification.kind).toBe('unrecognised');
      expect(a.statedGroups).toBe(1);
      expect(a.recognisedGroups).toBe(0);
      expect(a.missing).toBe(false);
      const findings = checkLicence([rec], { label: 'L', inaccessible: false });
      expect(findings.some((x) => x.ruleId.startsWith('LIC-') && x.ruleId !== 'LIC-MISSING')).toBe(true);
    }
  });

  it('a version with no licence statement anywhere is LIC-MISSING', () => {
    const doc = base();
    doc.data.files.forEach((x: Record<string, any>) => { delete x.licenseName; delete x.licenseUrl; }); // eslint-disable-line @typescript-eslint/no-explicit-any
    const rec = parseDataverseVersion(doc, 'x', { host: HOST, pid: PID })!.record;
    expect(rules(checkLicence([rec], { label: 'L', inaccessible: false }))).toContain('LIC-MISSING');
  });

  it('an unreadable Dataverse record says nothing about a licence (failure of source dataverse)', async () => {
    const f = new MapFetcher({ [DC + DOI]: dc() });
    const load = await loadLicenceReferences([`https://${HOST}/dataset.xhtml?persistentId=${PID}`], f);
    expect(load.failures[0]).toMatchObject({ source: 'dataverse' });
    expect(load.failures[0]!.finding?.ruleId).toBe('IN-RECORD-INACCESSIBLE');
  });
});

describe('hosts', () => {
  it('browser mode: the listed installations are fetched, an unlisted Dataverse is refused before any request', async () => {
    const calls: string[] = [];
    const fetcher = browserFetcher(async (u) => { calls.push(u); return new Response('{}', { status: 200 }); });
    await fetcher.get(VERSION, 'application/json');
    await expect(fetcher.get(`https://dataverse.no/api/datasets/:persistentId/versions/:latest-published?persistentId=doi:10.18710/X`)).rejects.toBeInstanceOf(HostNotAllowedError);
    await expect(fetcher.get(`https://repod.icm.edu.pl.evil.com/api/access/datafile/1`)).rejects.toBeInstanceOf(HostNotAllowedError);
    expect(calls).toEqual([VERSION]);
  });
  it('the installations listed are exactly those whose three calls were verified', () => {
    expect([...DATAVERSE_HOSTS]).toEqual(['repod.icm.edu.pl', 'danebadawcze.uw.edu.pl']);
  });
});
