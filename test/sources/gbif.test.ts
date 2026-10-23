// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// GBIF and OBIS datasets with a mocked network and synthetic data: no real third-party data.
import { describe, expect, it, vi } from 'vitest';
import { IPT_HOSTS, iptArchiveUrl } from '../../config/ipt';
import { loadInputs } from '../../src/app/loadInput';
import { fetchErrorFinding, FetchInterruptedError, FetchTimeoutError, browserFetcher, serverFetcher, type Fetcher } from '../../src/core/sources/fetcher';
import { fetchFile, loadGbif, loadRecord, resolveInput } from '../../src/core/sources';
import { createDirectEngine } from '../../src/worker/handler';
import { emlXml, makeZip, metaXml, nodeInflate } from '../helpers/zipfile';
import { MapFetcher } from './mapFetcher';

const KEY = 'dc5abc9f-84d5-4046-a3ef-9ab24ae53756';
const OBIS = '5422689c-d83d-44e8-87f4-a4b0a5117181';
const DOI = '10.15468/abc123';
const G = 'https://api.gbif.org/v1/dataset';
const ARCHIVE = 'https://ipt.vliz.be/eurobis/archive.do?r=synthetic';
const json = (v: unknown) => ({ body: JSON.stringify(v) });
const endpoints = (...e: { type: string; url: string }[]) => json(e);
const ids = (r: { findings: { ruleId: string }[] }) => r.findings.map((f) => f.ruleId);

describe('resolveInput — GBIF and OBIS', () => {
  it.each([
    [`https://www.gbif.org/dataset/${KEY}`, { key: KEY }],
    [`https://www.gbif.org/dataset/${KEY.toUpperCase()}/metrics`, { key: KEY }],
    [`https://gbif.org/de/dataset/${KEY}`, { key: KEY }],
    [`https://www.gbif.org/zh-tw/dataset/${KEY}`, { key: KEY }],
    [`https://www.gbif.org/pt-br/dataset/${KEY}/`, { key: KEY }],
  ])('%s -> gbif', (input, ref) => {
    expect(resolveInput(input)).toEqual({ kind: 'gbif', ref });
  });
  it('a GBIF DOI stays a DOI (DataCite routes it), in every written form', () => {
    for (const input of [DOI, `doi:${DOI}`, `https://doi.org/${DOI}`, `https://dx.doi.org/${DOI}.`]) {
      expect(resolveInput(input), input).toEqual({ kind: 'doi', doi: DOI });
    }
  });
  it('an obis.org dataset link -> obis; other pages of those sites and other prefixes are not', () => {
    expect(resolveInput(`https://obis.org/dataset/${OBIS}`)).toEqual({ kind: 'obis', uuid: OBIS });
    expect(resolveInput(`https://www.obis.org/dataset/${OBIS}/`)).toEqual({ kind: 'obis', uuid: OBIS });
    expect(resolveInput('https://obis.org/taxon/123')).toEqual({ kind: 'unknown' });
    expect(resolveInput('https://www.gbif.org/species/123')).toEqual({ kind: 'unknown' });
    expect(resolveInput('https://evil.example/dataset/' + KEY)).toEqual({ kind: 'unknown' });
    expect(resolveInput('10.1594/PANGAEA.1')).toEqual({ kind: 'doi', doi: '10.1594/PANGAEA.1' });
  });
});

describe('iptArchiveUrl — the static list', () => {
  it('keeps a listed https URL, upgrades http to https, drops everything else', () => {
    expect(iptArchiveUrl(ARCHIVE)).toBe(ARCHIVE);
    expect(iptArchiveUrl('http://ipt.obis.org/nonode/archive.do?r=x')).toBe('https://ipt.obis.org/nonode/archive.do?r=x');
    expect(iptArchiveUrl('HTTPS://IPT.VLIZ.BE/a.zip')).toBe('https://ipt.vliz.be/a.zip');
    for (const bad of [
      'https://ipt.example.org/archive.do?r=x',
      'https://ipt.vliz.be.evil.com/archive.do?r=x',
      'https://evil.com/ipt.vliz.be/archive.do',
      'https://ipt.vliz.be@evil.com/archive.do',
      'https://user:pw@ipt.vliz.be/archive.do',
      'https://ipt.vliz.be:8443/archive.do',
      'http://ipt.vliz.be:8082/archive.do',
      'ftp://ipt.vliz.be/archive.do',
      'not a url',
    ]) expect(iptArchiveUrl(bad), bad).toBeUndefined();
  });
  it('lists exact lower-case host names only', () => {
    for (const h of IPT_HOSTS) expect(h).toMatch(/^[a-z0-9.-]+$/);
    expect(new Set(IPT_HOSTS).size).toBe(IPT_HOSTS.length);
  });
});

describe('loadRecord — GBIF', () => {
  const dcOf = (doi: string) => ({ data: { id: doi, type: 'dois', attributes: { doi, url: `https://www.gbif.org/dataset/${KEY}`, titles: [{ title: 'T' }], rightsList: [{ rightsIdentifier: 'cc-by-4.0' }] } } });

  it('DOI 10.15468/…: DataCite (landing page gbif.org/dataset/{key}) -> endpoint -> archive, and the DataCite record stays a metadata source', async () => {
    const f = new MapFetcher({
      [`https://api.datacite.org/dois/${DOI}`]: json(dcOf(DOI)),
      [`${G}/${KEY}/endpoint`]: endpoints({ type: 'EML', url: 'https://ipt.vliz.be/eurobis/eml.do?r=synthetic' }, { type: 'DWC_ARCHIVE', url: ARCHIVE }),
    });
    const rec = await loadRecord(resolveInput(DOI), f);
    expect(rec.kind).toBe('gbif');
    expect(rec.findings).toEqual([]);
    expect(rec.files).toEqual([{ name: `${KEY}.zip`, url: ARCHIVE }]);
    expect(rec.metadata.map((m) => m.source)).toEqual(['datacite']);
    expect(rec.metadata[0]!.doi).toBe(DOI);
    expect(f.calls).toEqual([`https://api.datacite.org/dois/${DOI}`, `${G}/${KEY}/endpoint`]);
  });

  it('the registry lookup by DOI (loadGbif with a doi ref) still works: dataset/doi -> key -> endpoint', async () => {
    const f = new MapFetcher({
      [`${G}/doi/${DOI}`]: json({ count: 1, results: [{ key: KEY, title: 'T' }] }),
      [`${G}/${KEY}/endpoint`]: endpoints({ type: 'DWC_ARCHIVE', url: ARCHIVE }),
    });
    const rec = await loadGbif({ doi: DOI }, f);
    expect(rec.files).toEqual([{ name: `${KEY}.zip`, url: ARCHIVE }]);
  });

  it('gbif.org link: dataset/{key} -> endpoint -> archive', async () => {
    const f = new MapFetcher({
      [`${G}/${KEY}`]: json({ key: KEY }),
      [`${G}/${KEY}/endpoint`]: endpoints({ type: 'DWC_ARCHIVE', url: ARCHIVE }),
    });
    const rec = await loadRecord(resolveInput(`https://www.gbif.org/dataset/${KEY}`), f);
    expect(rec.files).toEqual([{ name: `${KEY}.zip`, url: ARCHIVE }]);
    expect(f.calls).toEqual([`${G}/${KEY}`, `${G}/${KEY}/endpoint`]);
  });

  it('a registry URL given as http:// on a listed host is upgraded to https://', async () => {
    const f = new MapFetcher({
      [`${G}/${KEY}`]: json({ key: KEY }),
      [`${G}/${KEY}/endpoint`]: endpoints({ type: 'DWC_ARCHIVE', url: 'http://ipt.obis.org/nonode/archive.do?r=synthetic' }),
    });
    const rec = await loadRecord(resolveInput(`https://www.gbif.org/dataset/${KEY}`), f);
    expect(rec.files[0]!.url).toBe('https://ipt.obis.org/nonode/archive.do?r=synthetic');
    expect(rec.findings).toEqual([]);
  });

  it('endpoints without a DWC_ARCHIVE -> IN-NO-DWC-ARCHIVE, nothing to download', async () => {
    const f = new MapFetcher({ [`${G}/${KEY}`]: json({ key: KEY }), [`${G}/${KEY}/endpoint`]: endpoints({ type: 'EML', url: ARCHIVE }) });
    const rec = await loadRecord(resolveInput(`https://www.gbif.org/dataset/${KEY}`), f);
    expect(rec.files).toEqual([]);
    expect(ids(rec)).toEqual(['IN-NO-DWC-ARCHIVE']);
    expect(rec.findings[0]!.params).toEqual({ registry: 'GBIF' });
  });

  it('an archive on a host that is not on the list -> a finding that names the host (never a download, never silent)', async () => {
    for (const url of ['https://ipt.example.org/archive.do?r=x', 'https://ipt.vliz.be.evil.com/archive.do?r=x', 'http://gp.sea.gov.ua:8082/ipt/archive.do?r=x']) {
      const f = new MapFetcher({ [`${G}/${KEY}`]: json({ key: KEY }), [`${G}/${KEY}/endpoint`]: endpoints({ type: 'DWC_ARCHIVE', url }) });
      const rec = await loadRecord(resolveInput(`https://www.gbif.org/dataset/${KEY}`), f);
      expect(rec.files, url).toEqual([]);
      expect(ids(rec), url).toEqual(['IN-IPT-HOST-NOT-LISTED']);
      expect(rec.findings[0]!.params.host).toBe(new URL(url).hostname);
    }
  });

  it('API 404 (unknown key) and an empty DOI lookup are IN-RECORD-INACCESSIBLE with the registry host', async () => {
    const a = await loadRecord(resolveInput(`https://www.gbif.org/dataset/${KEY}`), new MapFetcher({}));
    expect(a.findings[0]!.ruleId).toBe('IN-RECORD-INACCESSIBLE');
    expect(a.findings[0]!.params).toEqual({ status: 404, host: 'api.gbif.org' });
    const b = await loadGbif({ doi: DOI }, new MapFetcher({ [`${G}/doi/${DOI}`]: json({ count: 0, results: [] }) }));
    expect(b.findings[0]!.params).toEqual({ status: 404, host: 'api.gbif.org' });
    expect(b.files).toEqual([]);
  });

  it('a DOI of another prefix whose DataCite landing page is gbif.org/dataset/{key} is routed to GBIF too', async () => {
    const dc = { data: { id: '10.99999/x', type: 'dois', attributes: { doi: '10.99999/x', url: `https://www.gbif.org/dataset/${KEY}`, titles: [{ title: 'T' }] } } };
    const f = new MapFetcher({
      'https://api.datacite.org/dois/10.99999/x': json(dc),
      [`${G}/${KEY}`]: json({ key: KEY }),
      [`${G}/${KEY}/endpoint`]: endpoints({ type: 'DWC_ARCHIVE', url: ARCHIVE }),
    });
    const rec = await loadRecord(resolveInput('10.99999/x'), f);
    expect(rec.kind).toBe('gbif');
    expect(rec.files[0]!.url).toBe(ARCHIVE);
  });
});

describe('loadRecord — OBIS', () => {
  const O = 'https://api.obis.org/v3/dataset/';
  it('obis.org link: dataset/{uuid}.archive is the archive, .url (the resource page) is not used', async () => {
    const f = new MapFetcher({ [O + OBIS]: json({ total: 1, results: [{ id: OBIS, url: 'https://ipt.vliz.be/eurobis/resource?r=synthetic', archive: ARCHIVE }] }) });
    const rec = await loadRecord(resolveInput(`https://obis.org/dataset/${OBIS}`), f);
    expect(rec.kind).toBe('obis');
    expect(rec.files).toEqual([{ name: `${OBIS}.zip`, url: ARCHIVE }]);
    expect(f.calls).toEqual([O + OBIS]);
  });
  it('http on a listed host upgraded; off-list named; no archive field; empty result and 404 inaccessible', async () => {
    const one = (archive: unknown) => new MapFetcher({ [O + OBIS]: json({ total: 1, results: [{ id: OBIS, archive }] }) });
    const input = resolveInput(`https://obis.org/dataset/${OBIS}`);
    expect((await loadRecord(input, one('http://ipt.obis.org/nonode/archive.do?r=x'))).files[0]!.url).toBe('https://ipt.obis.org/nonode/archive.do?r=x');
    const off = await loadRecord(input, one('https://ipt.nowhere.example/archive.do?r=x'));
    expect(ids(off)).toEqual(['IN-IPT-HOST-NOT-LISTED']);
    expect(off.findings[0]!.params.host).toBe('ipt.nowhere.example');
    expect(ids(await loadRecord(input, one(null)))).toEqual(['IN-NO-DWC-ARCHIVE']);
    const empty = await loadRecord(input, new MapFetcher({ [O + OBIS]: json({ total: 0, results: [] }) }));
    expect(empty.findings[0]!.params).toEqual({ status: 404, host: 'api.obis.org' });
    const nf = await loadRecord(input, new MapFetcher({}));
    expect(nf.findings[0]!.params).toEqual({ status: 404, host: 'api.obis.org' });
  });
});

describe('archive download problems are said, never a silent pass', () => {
  const gbif = (archiveGet: () => Promise<never> | { status: number; bytes: Uint8Array; finalUrl: string }): Fetcher => ({
    async get(url) {
      if (url === `${G}/${KEY}`) return { status: 200, bytes: new TextEncoder().encode('{}'), finalUrl: url };
      if (url === `${G}/${KEY}/endpoint`) return { status: 200, bytes: new TextEncoder().encode(JSON.stringify([{ type: 'DWC_ARCHIVE', url: ARCHIVE }])), finalUrl: url };
      return archiveGet();
    },
  });
  const link = `https://www.gbif.org/dataset/${KEY}`;

  it('an archive that times out: IN-FETCH-INTERRUPTED naming the host, no file, no OK', async () => {
    const out = await loadInputs({ files: [], link, mode: 'server' }, { fetcher: () => gbif(() => Promise.reject(new FetchInterruptedError('ipt.vliz.be'))), onProgress: () => {} });
    expect(out.files).toEqual([]);
    expect(out.findings.map((f) => f.ruleId)).toEqual(['IN-FETCH-INTERRUPTED']);
    expect(out.findings[0]!.params).toEqual({ host: 'ipt.vliz.be' });
    expect(out.findings[0]!.severity).toBe('error');
  });

  it('server mode: the proxy answering timeout for an IPT is an interruption, for any other host it stays an inaccessible record', async () => {
    const proxy = (code: string): typeof fetch => (async () => new Response('', { status: 504, headers: { 'x-fetch-proxy-error': code } })) as unknown as typeof fetch;
    const f = serverFetcher('/api/fetch', proxy('timeout'));
    const e = await f.get(ARCHIVE).catch((x: unknown) => x);
    expect(fetchErrorFinding(e, 'a.zip')!.ruleId).toBe('IN-FETCH-INTERRUPTED');
    const z = await serverFetcher('/api/fetch', proxy('timeout')).get('https://zenodo.org/api/records/1').catch((x: unknown) => x);
    expect(fetchErrorFinding(z, 'r')!.ruleId).toBe('IN-RECORD-INACCESSIBLE');
    const big = await serverFetcher('/api/fetch', proxy('too_large')).get(ARCHIVE).catch((x: unknown) => x);
    const finding = fetchErrorFinding(big, 'a.zip')!;
    expect(finding.ruleId).toBe('IN-ARCHIVE-TOO-LARGE');
    expect(finding.params).toEqual({ host: 'ipt.vliz.be', mb: 100 });
  });

  it('a body that breaks off half way from an IPT is an interruption, not "blocked"', async () => {
    const broken = (async () => {
      const body = new ReadableStream({ pull: () => { throw new TypeError('network error'); } });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const e = await serverFetcher('/api/fetch', broken).get(ARCHIVE).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(FetchInterruptedError);
  });

  it('browser mode: a server without CORS headers fails the fetch itself, which is the existing "blocked, switch to server mode" finding', async () => {
    const noCors = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const f = browserFetcher(noCors as unknown as typeof fetch);
    const out = await loadInputs({ files: [], link, mode: 'browser' }, { fetcher: () => ({ get: (url: string) => (url.startsWith('https://api.gbif.org') ? gbifApi(url) : f.get(url)) }), onProgress: () => {} });
    expect(out.findings.map((x) => x.ruleId)).toEqual(['IN-FETCH-BLOCKED']);
    expect(out.findings[0]!.params).toEqual({ host: 'ipt.vliz.be' });
  });

  it('the browser fetcher times out at an IPT that does not start to answer (IN-FETCH-TIMEOUT)', async () => {
    const never = (() => new Promise(() => {})) as unknown as typeof fetch;
    const e = await browserFetcher(never, 20).get(ARCHIVE).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(FetchTimeoutError);
    expect(fetchErrorFinding(e, 'a.zip')!.ruleId).toBe('IN-FETCH-TIMEOUT');
  });

  it('fetchFile refuses an off-list host before any call', async () => {
    const fn = vi.fn();
    await expect(fetchFile({ name: 'a.zip', url: 'https://ipt.vliz.be.evil.com/a.zip' }, { get: fn })).rejects.toMatchObject({ name: 'HostNotAllowedError' });
    expect(fn).not.toHaveBeenCalled();
  });
});

function gbifApi(url: string): Promise<{ status: number; bytes: Uint8Array; finalUrl: string }> {
  const body = url.endsWith('/endpoint') ? JSON.stringify([{ type: 'DWC_ARCHIVE', url: ARCHIVE }]) : '{}';
  return Promise.resolve({ status: 200, bytes: new TextEncoder().encode(body), finalUrl: url });
}

describe('end to end with a synthetic archive', () => {
  it('GBIF link -> download -> DwC-A reader: the archive version is reported, the rows are checked', async () => {
    const FIELDS = { 1: 'occurrenceID', 2: 'locality', 3: 'decimalLatitude', 4: 'decimalLongitude', 5: 'eventDate' };
    const core = ['id\toccurrenceID\tlocality\tdecimalLatitude\tdecimalLongitude\teventDate', '1\to1\tBay A\t61.25\t4.5\t2008-05-01', '2\to2\tBay A\t95.5\t4.51\t2008-05-02'].join('\n') + '\n';
    const zip = makeZip([
      { name: 'meta.xml', data: metaXml({ fields: FIELDS }) },
      { name: 'eml.xml', data: emlXml('Synthetic Bay Survey', 'abc-123/v1.4', '2025-09-17') },
      { name: 'occurrence.txt', data: core },
    ]);
    const fetcher: Fetcher = { get: async (url) => (url === ARCHIVE ? { status: 200, bytes: zip, finalUrl: url } : gbifApi(url)) };
    const loaded = await loadInputs({ files: [], link: `https://www.gbif.org/dataset/${KEY}`, mode: 'server' }, { fetcher: () => fetcher, onProgress: () => {} });
    expect(loaded.findings).toEqual([]);
    expect(loaded.files.map((f) => f.name)).toEqual([`${KEY}.zip`]);
    const engine = createDirectEngine({ inflate: nodeInflate });
    const parsed = await engine.parse(loaded.files, loaded.records, []);
    expect(parsed.problems).toEqual([]);
    expect(parsed.files).toHaveLength(1);
    const f = parsed.files[0]!;
    await engine.build(f.fileId, f.layout, f.mappings);
    const { report } = await engine.check();
    const rules = report.findings.map((x) => x.ruleId);
    expect(rules).toContain('IN-DWCA-VERSION');
    expect(rules).toContain('ROW-LAT-RANGE');
    expect(report.findings.find((x) => x.ruleId === 'IN-DWCA-VERSION')!.params.version).toMatch(/abc-123\/v1\.4|v1\.4/);
  });
});
