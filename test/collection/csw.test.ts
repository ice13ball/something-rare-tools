// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The CSW adapter against a synthetic catalogue, THROUGH the real /api/csw (GET and POST): engine -> our server -> catalogue.
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../server/index.js';
import type { Upstream, UpstreamResponse } from '../../server/fetchProxy.js';
import { CollectionRunner } from '../../src/core/collection/runner';
import type { CswCall, Net, NetResponse } from '../../src/core/collection/net';
import type { RunSettings } from '../../src/core/collection/types';
import {
  CAPABILITIES,
  catalogueAnswer,
  dataciteMock,
  dcResource,
  parseUpstream,
  runnerDeps,
  searchResults,
  virtualClock,
  type CatalogueBehaviour,
  type CatalogueRecord,
} from './helpers';

const DIST = join(__dirname, '..', 'fixtures', 'dist');
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
async function* one(s: string): AsyncGenerator<Uint8Array> {
  yield enc(s);
}

/** Engine-side Net whose csw() goes through the real Express app; the app's upstream is the synthetic catalogue. */
function wire(behaviour: CatalogueBehaviour, over: { caps?: string; dc?: Parameters<typeof dataciteMock>[0]; answer?: (start: number, max: number, schema: string) => string | undefined } = {}) {
  const upstreamCalls: { method: string; url: string; op: string; start: number; max: number; schema: string }[] = [];
  const upstream: Upstream = async (r) => {
    const q = parseUpstream(r.url, r.method, r.body);
    upstreamCalls.push({ method: r.method ?? 'GET', url: r.url.toString(), op: q.op, start: q.start, max: q.max, schema: q.schema });
    const body = q.op === 'GetCapabilities' ? (over.caps ?? CAPABILITIES) : (over.answer?.(q.start, q.max, q.schema) ?? catalogueAnswer(behaviour, q.start, q.max));
    const resp: UpstreamResponse = { status: 200, headers: { 'content-type': 'application/xml' }, body: one(body), destroy() {} };
    return resp;
  };
  const app = createApp({ distDir: DIST, resolver: async () => ['193.0.6.139'], upstream, log: () => undefined, cswPacing: { minIntervalMs: 0 }, cswRateLimit: { limit: 100_000 } });
  const dc = dataciteMock(over.dc ?? { total: 0 });
  const net: Net = {
    get: dc.net.get,
    async csw(call: CswCall): Promise<NetResponse> {
      const r = await request(app).post('/api/csw').set('X-Forwarded-For', '1.2.3.4').set('Content-Type', 'application/json').buffer(true).send(JSON.stringify(call));
      return { status: r.status, text: Buffer.isBuffer(r.body) ? r.body.toString('utf8') : r.text, ...(r.headers['x-fetch-proxy-error'] ? { proxyError: String(r.headers['x-fetch-proxy-error']) } : {}) };
    },
  };
  return { net, upstreamCalls, dc };
}

const records = (n: number, licence: (i: number) => string | null = () => 'CC BY 4.0'): CatalogueRecord[] =>
  Array.from({ length: n }, (_, i) => ({ id: `uuid-${i + 1}`, licence: licence(i) }));

const settings = (catalogue: string, over: Partial<Extract<RunSettings['spec'], { kind: 'csw' }>> = {}, sample = false): RunSettings => ({
  spec: { kind: 'csw', catalogue, schema: 'iso19139', crossSource: false, ...over },
  lang: 'en',
  sample,
});

async function runCsw(net: Net, s: RunSettings) {
  const clock = virtualClock();
  const r = new CollectionRunner(runnerDeps(net, clock));
  await r.start(s);
  await r.whenIdle();
  return r;
}

describe.each([
  ['emodnet', 'GET'],
  ['marine-ie', 'POST'],
])('CSW over %s (%s)', (catalogue, method) => {
  it('reads capabilities, pages by nextRecord 25 at a time, and applies the shared licence rules to every record', async () => {
    const w = wire({ claimed: 120, records: records(120, (i) => (i % 4 === 0 ? null : 'CC BY 4.0')) });
    const r = await runCsw(w.net, settings(catalogue));
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.records).toBe(120);
    expect(p.counts.states.checked).toBe(120);
    expect(p.counts.rules['LIC-MISSING']).toBe(30);
    expect(p.notices).toEqual([]);
    const gets = w.upstreamCalls.filter((c) => c.op === 'GetRecords' && c.max === 25);
    expect(gets.map((c) => c.start)).toEqual([1, 26, 51, 76, 101]);
    expect(w.upstreamCalls.every((c) => c.method === method || c.url.includes('GetCapabilities'))).toBe(true);
    expect(w.upstreamCalls.every((c) => new URL(c.url).hostname === (catalogue === 'emodnet' ? 'emodnet.ec.europa.eu' : 'data.marine.ie'))).toBe(true);
    expect(p.estimate).toMatchObject({ records: 120, requests: 5, strategy: 'start-position' });
  });

  it('a catalogue that claims MORE than it holds: stops at nextRecord=0 and says "ended before matched"', async () => {
    const w = wire({ claimed: 200, records: records(60) });
    const r = await runCsw(w.net, settings(catalogue));
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.records).toBe(60);
    expect(p.notices).toContainEqual({ code: 'ended-before-matched', params: { seen: 60, matched: 200 } });
  });

  it('a catalogue that claims LESS than it holds: goes on while records come and says "more than matched"', async () => {
    const w = wire({ claimed: 50, records: records(130) });
    const r = await runCsw(w.net, settings(catalogue));
    const p = r.progress();
    expect(p.counts.records).toBe(130);
    expect(p.notices).toContainEqual({ code: 'more-than-matched', params: { seen: 130, matched: 50 } });
  });

  it('an exception report past the end (HTTP 200) is the end, not a failure; a total too high is reported', async () => {
    const w = wire({ claimed: 100, records: records(75), lastNext: 'past-end', pastEnd: 'exception' });
    const r = await runCsw(w.net, settings(catalogue));
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.records).toBe(75);
    const codes = p.notices.map((n) => n.code);
    expect(codes).toContain('ended-by-exception');
    expect(codes).toContain('ended-before-matched');
    expect(p.counts.states.unreachable).toBe(0);
  });

  it('an empty page with a nextRecord ends the walk and says so', async () => {
    const w = wire({ claimed: 80, records: records(50), lastNext: 'past-end', pastEnd: 'empty' });
    const r = await runCsw(w.net, settings(catalogue));
    const p = r.progress();
    expect(p.counts.records).toBe(50);
    expect(p.notices.map((n) => n.code)).toContain('empty-page');
  });

  it('a catalogue that returns fewer records than asked (ICES) is followed by nextRecord, no record lost or repeated', async () => {
    const w = wire({ claimed: 61, records: records(61), cap: 8 });
    const r = await runCsw(w.net, settings(catalogue));
    expect(r.progress().counts.records).toBe(61);
    expect(r.progress().notices).toEqual([]);
  });

  it('overlapping pages (nextRecord points back into the page just read): a notice, every position counted once, no second DataCite lookup', async () => {
    const recs = records(100).map((r, i) => ({ ...r, licence: i % 10 === 0 ? null : 'CC BY 4.0', doi: `10.5555/r${i}` }));
    const w = wire({ claimed: 100, records: recs, overlap: 5 });
    const r = await runCsw(w.net, settings(catalogue));
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.records).toBe(100);
    expect(p.counts.states.checked).toBe(100);
    expect(p.counts.rules['LIC-MISSING']).toBe(10); // not 12 or so: the records of the overlap were not judged twice
    expect(p.notices).toContainEqual({ code: 'overlapping-pages' });
    expect(p.notices.map((n) => n.code)).not.toContain('more-than-matched');
    const reads = w.upstreamCalls.filter((c) => c.op === 'GetRecords' && c.max === 25).map((c) => c.start);
    expect(reads.slice(0, 3)).toEqual([1, 21, 41]);
    // the same walk without an overlap gives the same counts
    const plain = await runCsw(wire({ claimed: 100, records: recs }).net, settings(catalogue));
    expect(p.counts.rules).toEqual(plain.progress().counts.rules);
    expect(plain.progress().notices.map((n) => n.code)).not.toContain('overlapping-pages');
    // with the DataCite comparison on, each DOI is looked up once
    const dcw = wire({ claimed: 100, records: recs, overlap: 5 }, { dc: { total: 100 } });
    const withDc = await runCsw(dcw.net, settings(catalogue, { crossSource: true }));
    expect(withDc.progress().counts.crossSource.looked).toBe(100);
    expect(withDc.progress().counts.records).toBe(100);
  });

  it('a stalled catalogue (the same page for ever) stops the run instead of looping', async () => {
    const w = wire({ claimed: 1000, records: records(10), stalled: true });
    const r = await runCsw(w.net, settings(catalogue));
    const p = r.progress();
    expect(p.status).toBe('failed');
    expect(p.notices.map((n) => n.code)).toContain('repeating-page');
    expect(w.upstreamCalls.length).toBeLessThan(10);
  });

  it('a nextRecord that never advances stops the run', async () => {
    const w = wire({ claimed: 100, records: records(100), stuckNext: true });
    const r = await runCsw(w.net, settings(catalogue));
    expect(r.progress().status).toBe('failed');
    expect(r.progress().notices.map((n) => n.code)).toContain('next-record-not-advancing');
  });

  it('a catalogue that delivers far more than it claimed is cut off, and the run says it was cut', async () => {
    const w = wire({ claimed: 10, records: records(900) });
    const r = await runCsw(w.net, settings(catalogue));
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.notices.map((n) => n.code)).toContain('overrun-stopped');
    expect(p.counts.records).toBeLessThan(900);
  });

  it('asks for ISO 19115-3 and reads it', async () => {
    const mdb = (id: string): string =>
      `<mdb:MD_Metadata xmlns:mdb="http://standards.iso.org/iso/19115/-3/mdb/2.0" xmlns:mri="http://standards.iso.org/iso/19115/-3/mri/1.0" xmlns:mco="http://standards.iso.org/iso/19115/-3/mco/1.0" xmlns:gco="http://standards.iso.org/iso/19115/-3/gco/1.0"><mdb:metadataIdentifier><mcc:MD_Identifier xmlns:mcc="http://standards.iso.org/iso/19115/-3/mcc/1.0"><mcc:code><gco:CharacterString>${id}</gco:CharacterString></mcc:code></mcc:MD_Identifier></mdb:metadataIdentifier><mdb:identificationInfo><mri:MD_DataIdentification><mri:resourceConstraints><mco:MD_LegalConstraints><mco:useLimitation><gco:CharacterString>CC BY 4.0</gco:CharacterString></mco:useLimitation></mco:MD_LegalConstraints></mri:resourceConstraints></mri:MD_DataIdentification></mdb:identificationInfo></mdb:MD_Metadata>`;
    const w = wire({ claimed: 3, records: [] }, { answer: (start) => searchResults(3, 3, 0, ['a', 'b', 'c'].map(mdb)) });
    const r = await runCsw(w.net, settings(catalogue, { schema: 'iso19115-3' }));
    expect(r.progress().counts.states.checked).toBe(3);
    expect(w.upstreamCalls.every((c) => c.schema.includes('19115/-3') || c.url.includes('GetCapabilities'))).toBe(true);
    expect(r.samples('META-NO-VERSION', 0, 10).map((s) => s.ref)).toEqual(['a', 'b', 'c']);
  });

  it('other profiles and placeholders are "unsupported profile": counted, never a licence finding', async () => {
    const recs: CatalogueRecord[] = [
      { id: 'ok-1', licence: 'CC BY 4.0' },
      { id: 'noaa', raw: '<gmd:MD_Metadata xmlns:gmd="http://www.isotc211.org/2005/gmd">Cannot disseminate schema to "http://www.isotc211.org/2005/gmd" for item \'x\'. This catalog contains mixed data.</gmd:MD_Metadata>' },
      { id: 'dc', raw: '<csw:Record xmlns:csw="http://www.opengis.net/cat/csw/2.0.2" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier>dc-1</dc:identifier></csw:Record>' },
      { id: 'ok-2', licence: null },
    ];
    const w = wire({ claimed: 4, records: recs });
    const r = await runCsw(w.net, settings(catalogue));
    const p = r.progress();
    expect(p.counts.states).toEqual({ checked: 2, unreachable: 0, throttled: 0, 'unsupported-profile': 2, 'not-in-datacite': 0 });
    expect(p.counts.rules['LIC-MISSING']).toBe(1);
    expect(r.unread().map((u) => [u.state, u.reason])).toEqual([
      ['unsupported-profile', 'not-disseminated'],
      ['unsupported-profile', 'profile:Record'],
    ]);
  });

  it('refuses a schema the catalogue does not advertise before reading any record', async () => {
    const w = wire({ claimed: 1, records: records(1) }, { caps: CAPABILITIES.replace('http://standards.iso.org/iso/19115/-3/mdb/2.0', 'http://example.org/other') });
    const r = new CollectionRunner(runnerDeps(w.net, virtualClock()));
    await expect(r.start(settings(catalogue, { schema: 'iso19115-3' }))).rejects.toMatchObject({ reason: 'schema-not-offered' });
    expect(w.upstreamCalls.filter((c) => !c.url.includes('GetCapabilities') && c.max !== 1)).toHaveLength(0);
  });

  it('the quick sample reads 20 pages of 10 spread over the whole catalogue', async () => {
    const w = wire({ claimed: 800, records: records(800) });
    const r = await runCsw(w.net, settings(catalogue, {}, true));
    const p = r.progress();
    expect(p.estimate).toMatchObject({ sample: true, strategy: 'spread-positions', requests: 20 });
    const reads = w.upstreamCalls.filter((c) => c.op === 'GetRecords' && c.max === 10).map((c) => c.start);
    expect(reads).toHaveLength(20);
    expect(reads[0]).toBe(1);
    expect(reads[19]).toBeGreaterThan(700);
    expect(p.counts.records).toBe(200);
    expect(r.fileName()).toContain('-sample-');
  });
});

describe('CSW with the DataCite cross-check (on by default in the page)', () => {
  const doiRecords = (n: number): CatalogueRecord[] => Array.from({ length: n }, (_, i) => ({ id: `u${i}`, licence: 'CC BY 4.0', doi: `10.5555/r${i}` }));

  it('compares the catalogue with DataCite: the same DOI with another licence is a mismatch only this tool sees', async () => {
    // DataCite resource 3 states CC BY-NC (the catalogue says CC BY)
    const w = wire({ claimed: 5, records: doiRecords(5) }, { dc: { total: 5, resource: (i) => ({ id: `10.5555/r${i}`, type: 'dois', attributes: { doi: `10.5555/r${i}`, rightsList: i === 3 ? [{ rights: 'CC BY-NC 4.0', rightsUri: 'https://creativecommons.org/licenses/by-nc/4.0/legalcode' }] : [{ rights: 'CC BY 4.0', rightsUri: 'https://creativecommons.org/licenses/by/4.0/legalcode' }] } }) } });
    const r = await runCsw(w.net, settings('emodnet', { crossSource: true }));
    const p = r.progress();
    expect(p.counts.crossSource).toEqual({ looked: 5, found: 5, absent: 0, failed: 0 });
    expect(p.counts.rules['LIC-MISMATCH']).toBe(1);
    expect(r.samples('LIC-MISMATCH', 0, 5)[0].ref).toBe('u3');
    expect(w.dc.urls.filter((u) => u.includes('ids=')).length).toBe(1); // one DataCite request for the page
    expect(p.estimate?.extraRequests).toBe(1);
  });

  it('DataCite empty while the catalogue states a licence is LIC-DATACITE-EMPTY; a DOI DataCite does not know is just not compared', async () => {
    const w = wire({ claimed: 2, records: doiRecords(2) }, { dc: { total: 1 } }); // knows r0 only; its record states no licence?
    const r = await runCsw(w.net, settings('emodnet', { crossSource: true }));
    const c = r.progress().counts;
    expect(c.crossSource).toMatchObject({ looked: 2, found: 1, absent: 1 });
    expect(c.rules['LIC-DATACITE-EMPTY'] ?? 0).toBeLessThanOrEqual(1);
  });

  it('a failed DataCite lookup is not a licence finding of its own, and does not hide a record that was read in full: no licence in the ISO record is LIC-MISSING, with a note', async () => {
    const recs: CatalogueRecord[] = [{ id: 'a', licence: null, doi: '10.5555/r1' }];
    const clock = virtualClock();
    const w = wire({ claimed: 1, records: recs }, { dc: { total: 1, clock, override: () => res503() } });
    const r = new CollectionRunner(runnerDeps(w.net, clock));
    await r.start(settings('emodnet', { crossSource: true }));
    await r.whenIdle();
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.crossSource.failed).toBe(1);
    expect(p.counts.states.checked).toBe(1);
    expect(p.counts.rules['LIC-MISSING']).toBe(1);
    expect(p.counts.rules['LIC-DATACITE-EMPTY']).toBeUndefined();
    const sample = r.samples('LIC-MISSING', 0, 5)[0];
    expect(sample.params).toEqual({ dataciteCompared: 'no' });
    const csv = await (await r.csvBlob()).text();
    expect(csv).toMatch(/LIC-MISSING,error,"?No licence was found[^\n]*DataCite could not be compared/);
    // the same record without the comparison: LIC-MISSING without the note
    const without = wire({ claimed: 1, records: recs });
    const r2 = await runCsw(without.net, settings('emodnet', { crossSource: false }));
    expect(r2.progress().counts.rules['LIC-MISSING']).toBe(1);
    expect(r2.samples('LIC-MISSING', 0, 5)[0].params).toEqual({});
    expect(await (await r2.csvBlob()).text()).not.toContain('DataCite');
  });

  it('a failed DataCite lookup and an ISO record WITH a licence: no LIC-MISSING; the outcome equals a successful lookup that finds an empty DataCite record only in its own rule', async () => {
    const recs: CatalogueRecord[] = [{ id: 'a', licence: 'CC BY 4.0', doi: '10.5555/r1' }];
    const clock = virtualClock();
    const failed = wire({ claimed: 1, records: recs }, { dc: { total: 1, clock, override: () => res503() } });
    const r = new CollectionRunner(runnerDeps(failed.net, clock));
    await r.start(settings('emodnet', { crossSource: true }));
    await r.whenIdle();
    expect(r.progress().counts.crossSource.failed).toBe(1);
    expect(r.progress().counts.rules['LIC-MISSING']).toBeUndefined();
    expect(r.progress().counts.rules['LIC-DATACITE-EMPTY']).toBeUndefined();
    // DataCite answers, the record exists and states no licence: DATACITE-EMPTY rules, as before; LIC-MISSING only from a missing ISO licence
    const clock2 = virtualClock();
    const ok = wire({ claimed: 1, records: recs }, { dc: { total: 5, clock: clock2, resource: (i) => dcResource(i, 'none') } });
    const r3 = new CollectionRunner(runnerDeps(ok.net, clock2));
    await r3.start(settings('emodnet', { crossSource: true }));
    await r3.whenIdle();
    expect(r3.progress().counts.rules['LIC-DATACITE-EMPTY']).toBe(1);
    expect(r3.progress().counts.rules['LIC-MISSING']).toBeUndefined();
  });

  it('the note exists in four languages', async () => {
    const { renderPlain } = await import('../../src/core/report');
    const { makeFinding } = await import('../../src/core/rules/registry');
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      const plain = renderPlain(makeFinding('LIC-MISSING', { file: 'x' }), lang);
      const noted = renderPlain(makeFinding('LIC-MISSING', { file: 'x', params: { dataciteCompared: 'no' } }), lang);
      expect(noted.startsWith(plain), lang).toBe(true);
      expect(noted.length, lang).toBeGreaterThan(plain.length + 40);
      expect(noted).toMatch(/DataCite/);
    }
  });
});

function res503(): NetResponse {
  return { status: 503, text: '<html>queue full</html>' };
}

describe('M1: the engine paces its own /api/csw calls under the server limit', () => {
  it('at least 3.1 s between two catalogue requests (under 20 a minute), capabilities and estimate included', async () => {
    const { CSW_PACE_MS } = await import('../../src/core/collection/net');
    expect(CSW_PACE_MS).toBeGreaterThanOrEqual(3100);
    expect(60_000 / CSW_PACE_MS).toBeLessThan(20);
    const w = wire({ claimed: 100, records: records(100) });
    const clock = virtualClock();
    const times: number[] = [];
    const net: Net = { get: w.net.get, csw: async (c) => (times.push(clock.now()), w.net.csw(c)) };
    const r = new CollectionRunner(runnerDeps(net, clock));
    await r.start(settings('emodnet'));
    await r.whenIdle();
    expect(r.progress().status).toBe('finished');
    expect(times.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(3100);
    // the estimate says what that costs: 4 pages of 25 take about 13 s, not 14 s of "3.5 s a request" guesses
    expect(r.progress().estimate?.seconds).toBeCloseTo((4 * CSW_PACE_MS) / 1000, 5);
  });
});
