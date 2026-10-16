// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { FetchBlockedError, HostNotAllowedError, type Fetcher } from '../../src/core/sources/fetcher';
import { fetchFile, loadRecord } from '../../src/core/sources';
import { resolveInput } from '../../src/core/sources/resolve';
import { MapFetcher, fixture } from './mapFetcher';

const UUID = '00000000-0000-4000-8000-000000000001';
const DC = 'https://api.datacite.org/dois/';
const GN = `https://geonetwork.iopan.pl/geonetwork/srv/api/records/${UUID}/formatters/xml`;
const ids = (r: { findings: { ruleId: string }[] }) => r.findings.map((f) => f.ruleId);

describe('loadRecord — DOI routed to GeoNetwork', () => {
  const doi = '10.0000/invented-gn-1';

  it('GeoNetwork 403 -> IN-RECORD-INACCESSIBLE with status and host, DataCite metadata kept', async () => {
    const f = new MapFetcher({
      [DC + doi]: { body: fixture('sources-datacite-geonetwork.json') },
      [GN]: { status: 403, body: 'Forbidden' },
    });
    const rec = await loadRecord(resolveInput('doi:' + doi), f);
    expect(rec.kind).toBe('geonetwork');
    expect(rec.files).toEqual([]);
    expect(rec.metadata).toHaveLength(1);
    expect(rec.metadata[0]!.source).toBe('datacite');
    expect(rec.metadata[0]!.licences).toEqual([]);
    const fnd = rec.findings.find((x) => x.ruleId === 'IN-RECORD-INACCESSIBLE');
    expect(fnd).toBeDefined();
    expect(fnd!.params).toEqual({ status: 403, host: 'geonetwork.iopan.pl' });
    expect(fnd!.severity).toBe('error');
    expect(fnd!.file).toBe(rec.label);
    expect(ids(rec)).not.toContain('IN-NO-DATA-FILE');
    expect(f.calls).toEqual([DC + doi, GN]);
  });

  it.each([401, 404])('GeoNetwork %i is inaccessible too', async (status) => {
    const f = new MapFetcher({ [DC + doi]: { body: fixture('sources-datacite-geonetwork.json') }, [GN]: { status } });
    const rec = await loadRecord(resolveInput(doi), f);
    expect(rec.findings.find((x) => x.ruleId === 'IN-RECORD-INACCESSIBLE')!.params.status).toBe(status);
  });

  it('a 200 sign-in HTML page is inaccessible as well, with the reason in value', async () => {
    const f = new MapFetcher({
      [DC + doi]: { body: fixture('sources-datacite-geonetwork.json') },
      [GN]: { status: 200, body: '<!DOCTYPE html><html><body>Sign in</body></html>', contentType: 'text/html' },
    });
    const rec = await loadRecord(resolveInput(doi), f);
    const fnd = rec.findings.find((x) => x.ruleId === 'IN-RECORD-INACCESSIBLE')!;
    expect(fnd.params).toEqual({ status: 200, host: 'geonetwork.iopan.pl' });
    expect(fnd.value).toMatch(/ISO 19139/);
    expect(rec.metadata.map((m) => m.source)).toEqual(['datacite']);
  });

  it('GeoNetwork 200: ISO + DataCite metadata, data files from distribution links', async () => {
    const f = new MapFetcher({
      [DC + doi]: { body: fixture('sources-datacite-geonetwork.json') },
      [GN]: { body: fixture('sources-iso-links.xml') },
    });
    const rec = await loadRecord(resolveInput(doi), f);
    expect(rec.kind).toBe('geonetwork');
    expect(rec.metadata.map((m) => m.source)).toEqual(['iso19139', 'datacite']);
    expect(rec.files.map((x) => x.url)).toEqual([
      'https://opendap.iopan.pl/opendap/data/csv/ProjX/table_one.csv',
      'https://geo.iopan.pl/opendap/data/csv/table_two',
    ]);
    expect(rec.files.map((x) => x.name)).toEqual(['table_one.csv', 'table_two.csv']);
    expect(rec.files.every((x) => x.bytes === undefined)).toBe(true);
  });
});

describe('loadRecord — GeoNetwork data links', () => {
  const run = async () => {
    const f = new MapFetcher({ [GN]: { body: fixture('sources-iso-links.xml') } });
    return loadRecord({ kind: 'geonetwork', host: 'geonetwork.iopan.pl', uuid: UUID }, f);
  };

  it('a CSV link on opendap.iopan.pl becomes files[0].url; duplicates, empty, DOI, landing and .html links are skipped', async () => {
    const rec = await run();
    expect(rec.files[0]!.url).toBe('https://opendap.iopan.pl/opendap/data/csv/ProjX/table_one.csv');
    expect(rec.files).toHaveLength(2);
  });

  it('a data link on example.com -> IN-HOST-NOT-ALLOWED (host only), not a file; once per host', async () => {
    const rec = await run();
    const hostFindings = rec.findings.filter((x) => x.ruleId === 'IN-HOST-NOT-ALLOWED');
    expect(hostFindings).toHaveLength(1);
    expect(hostFindings[0]!.params).toEqual({ host: 'example.com' });
    expect(hostFindings[0]!.severity).toBe('warning');
    expect(JSON.stringify(rec.findings)).not.toContain('other%20table');
    expect(rec.files.some((x) => x.url?.includes('example.com'))).toBe(false);
  });

  it('records without direct link metadata (no DataCite) still load: only the ISO record', async () => {
    const rec = await run();
    expect(rec.kind).toBe('geonetwork');
    expect(rec.metadata.map((m) => m.source)).toEqual(['iso19139']);
    expect(ids(rec)).not.toContain('IN-RECORD-INACCESSIBLE');
  });

  it('a GeoNetwork host outside the allowlist is reported by host and nothing is fetched', async () => {
    const f = new MapFetcher({});
    const rec = await loadRecord({ kind: 'geonetwork', host: 'catalog.example.org', uuid: UUID }, f);
    expect(f.calls).toEqual([]);
    expect(rec.findings).toHaveLength(1);
    expect(rec.findings[0]!.ruleId).toBe('IN-HOST-NOT-ALLOWED');
    expect(rec.findings[0]!.params).toEqual({ host: 'catalog.example.org' });
  });

  it('a GeoNetwork data file with no data link at all -> IN-NO-DATA-FILE with —', async () => {
    const xml = fixture('sources-iso-links.xml').replace(/<gmd:distributionInfo>[\s\S]*<\/gmd:distributionInfo>/, '');
    const rec = await loadRecord({ kind: 'geonetwork', host: 'geonetwork.iopan.pl', uuid: UUID }, new MapFetcher({ [GN]: { body: xml } }));
    const fnd = rec.findings.find((x) => x.ruleId === 'IN-NO-DATA-FILE')!;
    expect(fnd.params).toEqual({ files: '—' });
  });
});

describe('loadRecord — Zenodo', () => {
  const Z = (id: string) => `https://zenodo.org/api/records/${id}`;

  it('a record with only a PDF (and a NetCDF) -> IN-NO-DATA-FILE listing the file names', async () => {
    const f = new MapFetcher({ [Z('2000002')]: { body: fixture('sources-zenodo-pdf.json') } });
    const rec = await loadRecord({ kind: 'zenodo', id: '2000002' }, f);
    expect(rec.kind).toBe('zenodo');
    expect(rec.files).toEqual([]);
    const fnd = rec.findings.find((x) => x.ruleId === 'IN-NO-DATA-FILE')!;
    expect(fnd.severity).toBe('error');
    expect(fnd.params).toEqual({ files: 'report.pdf, grid.nc' });
    expect(fnd.file).toBe(rec.label);
  });

  it('a record without files -> IN-NO-DATA-FILE with —', async () => {
    const f = new MapFetcher({ [Z('2000003')]: { body: fixture('sources-zenodo-nofiles.json') } });
    const rec = await loadRecord({ kind: 'zenodo', id: '2000003' }, f);
    expect(rec.findings.find((x) => x.ruleId === 'IN-NO-DATA-FILE')!.params).toEqual({ files: '—' });
  });

  it('data files are csv/tsv/txt/tab/xlsx/xls/ods keys; URLs use the CORS-safe API form; DataCite record is attached', async () => {
    const f = new MapFetcher({
      [Z('2000001')]: { body: fixture('sources-zenodo-csv.json') },
      [DC + '10.0000/zenodo.2000001']: { body: fixture('sources-datacite-zenodo.json') },
    });
    const rec = await loadRecord({ kind: 'zenodo', id: '2000001' }, f);
    expect(ids(rec)).toEqual([]);
    expect(rec.files).toEqual([
      { name: 'table A.csv', url: 'https://zenodo.org/api/records/2000001/files/table%20A.csv/content' },
      { name: 'table B.xlsx', url: 'https://zenodo.org/api/records/2000001/files/table%20B.xlsx/content' },
    ]);
    expect(rec.metadata.map((m) => m.source)).toEqual(['zenodo', 'datacite']);
    expect(rec.metadata[1]!.licences[0]!.spdx).toBe('CC-BY-4.0');
  });

  it('a failing DataCite lookup for the Zenodo DOI is not fatal and adds no finding', async () => {
    const f = new MapFetcher({ [Z('2000001')]: { body: fixture('sources-zenodo-csv.json') } }); // DataCite -> 404
    const rec = await loadRecord({ kind: 'zenodo', id: '2000001' }, f);
    expect(ids(rec)).toEqual([]);
    expect(rec.metadata.map((m) => m.source)).toEqual(['zenodo']);
    expect(rec.files).toHaveLength(2);
  });

  it('a DataCite lookup that throws (blocked) is not fatal either', async () => {
    const f = new MapFetcher({
      [Z('2000001')]: { body: fixture('sources-zenodo-csv.json') },
      [DC + '10.0000/zenodo.2000001']: new FetchBlockedError('api.datacite.org'),
    });
    const rec = await loadRecord({ kind: 'zenodo', id: '2000001' }, f);
    expect(ids(rec)).toEqual([]);
  });

  it('Zenodo 404 -> IN-RECORD-INACCESSIBLE {404, zenodo.org}', async () => {
    const rec = await loadRecord({ kind: 'zenodo', id: '999' }, new MapFetcher({}));
    expect(rec.findings).toHaveLength(1);
    expect(rec.findings[0]!.ruleId).toBe('IN-RECORD-INACCESSIBLE');
    expect(rec.findings[0]!.params).toEqual({ status: 404, host: 'zenodo.org' });
    expect(rec.metadata).toEqual([]);
  });

  it('DOI route: DataCite landing zenodo.org/doi/... -> the Zenodo id, DataCite fetched once and reused; never doi.org', async () => {
    const f = new MapFetcher({
      [DC + '10.0000/zenodo.2000001']: { body: fixture('sources-datacite-zenodo.json') },
      [Z('2000001')]: { body: fixture('sources-zenodo-csv.json') },
    });
    const rec = await loadRecord(resolveInput('https://doi.org/10.0000/zenodo.2000001'), f);
    expect(rec.kind).toBe('zenodo');
    expect(f.calls).toEqual([DC + '10.0000/zenodo.2000001', Z('2000001')]);
    expect(f.calls.some((u) => u.includes('doi.org'))).toBe(false);
    expect(rec.metadata.map((m) => m.source)).toEqual(['zenodo', 'datacite']);
    expect(rec.files).toHaveLength(2);
  });
});

describe('loadRecord — DataCite / DOI', () => {
  it('DataCite 404 -> IN-RECORD-INACCESSIBLE {404, api.datacite.org}', async () => {
    const rec = await loadRecord({ kind: 'doi', doi: '10.0000/nope' }, new MapFetcher({}));
    expect(rec.kind).toBe('datacite');
    expect(rec.findings).toHaveLength(1);
    expect(rec.findings[0]!.ruleId).toBe('IN-RECORD-INACCESSIBLE');
    expect(rec.findings[0]!.params).toEqual({ status: 404, host: 'api.datacite.org' });
  });

  it('keeps the case the user typed in the DataCite request', async () => {
    const f = new MapFetcher({});
    await loadRecord({ kind: 'doi', doi: '10.48457/EXAMPLE.2025.001' }, f);
    expect(f.calls).toEqual([DC + '10.48457/EXAMPLE.2025.001']);
  });

  it('routes a PANGAEA landing page to the textfile download, named PANGAEA.<id>.tab', async () => {
    const f = new MapFetcher({ [DC + '10.1594/PANGAEA.000000']: { body: fixture('sources-datacite-pangaea.json') } });
    const rec = await loadRecord(resolveInput('10.1594/PANGAEA.000000'), f);
    expect(rec.kind).toBe('pangaea');
    expect(rec.files).toEqual([{ name: 'PANGAEA.000000.tab', url: 'https://doi.pangaea.de/10.1594/PANGAEA.000000?format=textfile' }]);
    expect(rec.metadata.map((m) => m.source)).toEqual(['datacite']);
    expect(ids(rec)).toEqual([]);
  });

  it('direct PANGAEA input: DataCite record attached when available, silent when not', async () => {
    const f1 = new MapFetcher({ [DC + '10.1594/PANGAEA.000000']: { body: fixture('sources-datacite-pangaea.json') } });
    const r1 = await loadRecord({ kind: 'pangaea', id: '000000' }, f1);
    expect(r1.metadata.map((m) => m.source)).toEqual(['datacite']);
    const r2 = await loadRecord({ kind: 'pangaea', id: '000000' }, new MapFetcher({}));
    expect(r2.findings).toEqual([]);
    expect(r2.files).toHaveLength(1);
  });

  it('a landing page on a host outside the allowlist -> IN-HOST-NOT-ALLOWED, DataCite metadata kept', async () => {
    const f = new MapFetcher({ [DC + '10.0000/invented-else-1']: { body: fixture('sources-datacite-elsewhere.json') } });
    const rec = await loadRecord({ kind: 'doi', doi: '10.0000/invented-else-1' }, f);
    expect(rec.kind).toBe('datacite');
    expect(rec.findings).toHaveLength(1);
    expect(rec.findings[0]!.ruleId).toBe('IN-HOST-NOT-ALLOWED');
    expect(rec.findings[0]!.params).toEqual({ host: 'example.com' });
    expect(rec.metadata).toHaveLength(1);
  });

  it('a DataCite response that is not JSON counts as inaccessible', async () => {
    const f = new MapFetcher({ [DC + '10.0000/x']: { body: '<html>oops</html>' } });
    const rec = await loadRecord({ kind: 'doi', doi: '10.0000/x' }, f);
    expect(rec.findings[0]!.ruleId).toBe('IN-RECORD-INACCESSIBLE');
    expect(rec.findings[0]!.params.host).toBe('api.datacite.org');
  });
});

describe('loadRecord — fetch errors', () => {
  it('FetchBlockedError -> IN-FETCH-BLOCKED with the host only (the user is told to download and drop)', async () => {
    const f = new MapFetcher({ [`https://zenodo.org/api/records/5`]: new FetchBlockedError('zenodo.org') });
    const rec = await loadRecord({ kind: 'zenodo', id: '5' }, f);
    expect(rec.findings).toHaveLength(1);
    expect(rec.findings[0]!.ruleId).toBe('IN-FETCH-BLOCKED');
    expect(rec.findings[0]!.severity).toBe('warning');
    expect(rec.findings[0]!.params).toEqual({ host: 'zenodo.org' });
    expect(rec.files).toEqual([]);
  });

  it('HostNotAllowedError from the fetcher -> IN-HOST-NOT-ALLOWED', async () => {
    const f = new MapFetcher({ [DC + '10.0000/x']: new HostNotAllowedError('api.datacite.org') });
    const rec = await loadRecord({ kind: 'doi', doi: '10.0000/x' }, f);
    expect(rec.findings[0]!.ruleId).toBe('IN-HOST-NOT-ALLOWED');
    expect(rec.findings[0]!.params).toEqual({ host: 'api.datacite.org' });
  });

  it('findings never contain a full URL', async () => {
    const f = new MapFetcher({ [DC + '10.0000/invented-gn-1']: { body: fixture('sources-datacite-geonetwork.json') }, [GN]: { status: 403 } });
    const rec = await loadRecord({ kind: 'doi', doi: '10.0000/invented-gn-1' }, f);
    expect(JSON.stringify(rec.findings)).not.toMatch(/https?:\/\//);
  });

  it('unknown input is refused with an error, not a silent empty record', async () => {
    await expect(loadRecord({ kind: 'unknown' }, new MapFetcher({}))).rejects.toThrow(/unknown/i);
  });
});

describe('fetchFile', () => {
  it('returns the bytes of a 200', async () => {
    const url = 'https://zenodo.org/api/records/1/files/a.csv/content';
    const f = new MapFetcher({ [url]: { body: new Uint8Array([1, 2, 3]) } });
    expect(await fetchFile({ name: 'a.csv', url }, f)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('non-2xx throws a FileFetchError with status and host', async () => {
    const url = 'https://zenodo.org/api/records/1/files/a.csv/content';
    await expect(fetchFile({ name: 'a.csv', url }, new MapFetcher({}))).rejects.toMatchObject({ name: 'FileFetchError', status: 404, host: 'zenodo.org' });
  });

  it('propagates FetchBlockedError and refuses hosts outside the allowlist', async () => {
    const url = 'https://opendap.iopan.pl/opendap/data/csv/P/a.csv';
    const blocked: Fetcher = { get: async () => { throw new FetchBlockedError('opendap.iopan.pl'); } };
    await expect(fetchFile({ name: 'a.csv', url }, blocked)).rejects.toBeInstanceOf(FetchBlockedError);
    await expect(fetchFile({ name: 'a.csv', url: 'https://example.com/a.csv' }, new MapFetcher({}))).rejects.toBeInstanceOf(HostNotAllowedError);
  });

  it('a file without a url cannot be fetched', async () => {
    await expect(fetchFile({ name: 'x.csv' }, new MapFetcher({}))).rejects.toThrow(/no url/i);
  });
});

describe('fetchErrorFinding', () => {
  it('maps the three error types to input findings (host only) and ignores foreign errors', async () => {
    const { fetchErrorFinding, FileFetchError } = await import('../../src/core/sources');
    expect(fetchErrorFinding(new FetchBlockedError('a.example'), 'F')).toMatchObject({ ruleId: 'IN-FETCH-BLOCKED', file: 'F', params: { host: 'a.example' } });
    expect(fetchErrorFinding(new HostNotAllowedError('b.example'), 'F')).toMatchObject({ ruleId: 'IN-HOST-NOT-ALLOWED', params: { host: 'b.example' } });
    expect(fetchErrorFinding(new FileFetchError(500, 'zenodo.org'), 'F')).toMatchObject({ ruleId: 'IN-RECORD-INACCESSIBLE', params: { status: 500, host: 'zenodo.org' } });
    expect(fetchErrorFinding(new Error('boom'), 'F')).toBeUndefined();
  });
});
