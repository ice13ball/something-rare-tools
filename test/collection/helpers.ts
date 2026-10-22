// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Synthetic sources for the collection review tests: a virtual clock, a mock DataCite / Zenodo, and a synthetic CSW catalogue.
import { StopSignal, type Clock, type CswCall, type Net, type NetResponse } from '../../src/core/collection/net';
import type { RunnerDeps } from '../../src/core/collection/runner';
import { memoryStore } from '../../src/core/collection/store';

/** Time that only moves when something sleeps: pacing and backoff are checked without waiting. */
export function virtualClock(start = Date.UTC(2026, 9, 22)): Clock & { t: number; sleeps: number[] } {
  const c = {
    t: start,
    sleeps: [] as number[],
    now: () => c.t,
    random: () => 0.5, // jitter factor 1.0
    async sleep(ms: number, signal?: AbortSignal) {
      if (signal?.aborted) throw new StopSignal();
      c.sleeps.push(ms);
      c.t += ms;
      await Promise.resolve();
      if (signal?.aborted) throw new StopSignal();
    },
  };
  return c;
}

export const res = (status: number, text: string, extra: Partial<NetResponse> = {}): NetResponse => ({ status, text, ...extra });
export const json = (body: unknown, extra: Partial<NetResponse> = {}): NetResponse => res(200, JSON.stringify(body), extra);

const b64 = (s: string): string => Buffer.from(s).toString('base64').replace(/=+$/, '');
const unb64 = (s: string): string => Buffer.from(s, 'base64').toString();
const EPOCH0 = 1444907512000;

/** DataCite resource number i: `rights` selects what the record states about its licence. */
export function dcResource(i: number, rights: 'ok' | 'none' | 'free' | 'conflict' | 'cycle' = 'cycle'): unknown {
  const kind = rights === 'cycle' ? (['ok', 'none', 'free', 'ok', 'conflict'] as const)[i % 5] : rights;
  const rightsList =
    kind === 'ok'
      ? [{ rights: 'Creative Commons Attribution 4.0 International', rightsUri: 'https://creativecommons.org/licenses/by/4.0/legalcode', rightsIdentifier: 'cc-by-4.0' }]
      : kind === 'free'
        ? [{ rights: 'Free for use in research with acknowledgement' }]
        : kind === 'conflict'
          ? [{ rights: 'CC BY 4.0', rightsUri: 'https://creativecommons.org/licenses/by-nc/4.0/' }]
          : [];
  const doi = `10.5555/r${i}`;
  return { id: doi, type: 'dois', attributes: { doi, url: `https://example.org/${i}`, titles: [{ title: `Record ${i}` }], rightsList, version: i % 2 === 0 ? '1.0' : undefined } };
}

export interface DataciteMock {
  net: Net;
  /** Every URL asked, in order. */
  urls: string[];
  /** Times (virtual) at which each request was made. */
  times: number[];
}

export interface DataciteOptions {
  total: number;
  pageSize?: number;
  /** Called per request (1-based): return a response to override the normal answer. */
  override?: (n: number, url: URL) => NetResponse | Error | undefined;
  clock?: { now(): number };
  resource?: (i: number) => unknown;
  /** Zenodo or CSW requests are routed here when given. */
  other?: Partial<Net>;
}

/** A DataCite that pages by cursor (links.next, base64 "<epoch>,<doi>"), answers ids= and random=true, and clamps page[size] to 1000. */
export function dataciteMock(o: DataciteOptions): DataciteMock {
  const urls: string[] = [];
  const times: number[] = [];
  let n = 0;
  const resource = o.resource ?? ((i: number) => dcResource(i));
  const net: Net = {
    async get(url, accept) {
      if (!url.startsWith('https://api.datacite.org/')) {
        if (o.other?.get) return o.other.get(url, accept);
        throw new Error(`unexpected url ${url}`);
      }
      urls.push(url);
      times.push(o.clock?.now() ?? 0);
      n += 1;
      const u = new URL(url);
      const forced = o.override?.(n, u);
      if (forced instanceof Error) throw forced;
      if (forced) return forced;
      const size = Math.min(1000, Number(u.searchParams.get('page[size]') ?? 25));
      const ids = u.searchParams.get('ids');
      if (ids) {
        const wanted = ids.split(',');
        const data = wanted.flatMap((d) => {
          const m = /^10\.5555\/r(\d+)$/.exec(d);
          return m && Number(m[1]) < o.total ? [resource(Number(m[1]))] : [];
        });
        return json({ data, meta: { total: data.length } });
      }
      if (u.searchParams.get('random') === 'true') {
        if (u.searchParams.has('page[cursor]')) return res(400, '{"errors":[{"title":"mutually exclusive"}]}');
        const start = Math.floor(((n * 7919) % Math.max(1, o.total - size)) + 0);
        return json({ data: Array.from({ length: Math.min(size, o.total) }, (_, k) => resource(start + k)), meta: { total: o.total } });
      }
      if (u.searchParams.get('client-id') === 'nosuch.client') return json({ data: [], meta: { total: 0 } });
      const cursor = u.searchParams.get('page[cursor]');
      if (cursor === null) return json({ data: [], meta: { total: o.total } }); // size=1 total probe
      let from = 0;
      if (cursor !== '1') {
        const raw = unb64(cursor);
        const m = /^\d+,10\.5555\/r(\d+)$/.exec(raw);
        from = m ? Number(m[1]) + 1 : 0; // a bogus cursor restarts at the first record, like DataCite
      }
      const to = Math.min(o.total, from + size);
      const data = Array.from({ length: to - from }, (_, k) => resource(from + k));
      const links: Record<string, string> = {};
      if (to < o.total) {
        links.next = `https://api.datacite.org/dois?${u.searchParams.has('client-id') ? 'client-id=' + u.searchParams.get('client-id') : 'prefix=' + u.searchParams.get('prefix')}&page%5Bcursor%5D=${b64(`${EPOCH0 + to - 1},10.5555/r${to - 1}`)}&page%5Bsize%5D=${size}`;
      }
      return json({ data, meta: { total: o.total }, links });
    },
    async csw(call) {
      if (o.other?.csw) return o.other.csw(call);
      throw new Error('unexpected csw call');
    },
  };
  return { net, urls, times };
}

export const HTML_503 = '<html><body><h2>This website is under heavy load (queue full)</h2></body></html>';

export function runnerDeps(net: Net, clock: Clock, over: Partial<RunnerDeps> = {}): RunnerDeps & { store: ReturnType<typeof memoryStore> } {
  const store = memoryStore();
  return { net, store, clock, newId: () => 'run-1', year: () => 2026, ...over } as RunnerDeps & { store: ReturnType<typeof memoryStore> };
}

// ---- synthetic CSW ----------------------------------------------------------------------------------------------------------

const GMD_NS = 'xmlns:gmd="http://www.isotc211.org/2005/gmd" xmlns:gco="http://www.isotc211.org/2005/gco" xmlns:gmx="http://www.isotc211.org/2005/gmx" xmlns:xlink="http://www.w3.org/1999/xlink"';

export interface CatalogueRecord {
  id: string;
  /** ISO 19139 constraint text, or null for none. */
  licence?: string | null;
  doi?: string;
  /** Replaces the whole element (profile tests). */
  raw?: string;
}

/** An ISO 19139 record the way GeoNetwork sends it inside SearchResults. */
export function gmdRecord(r: CatalogueRecord): string {
  if (r.raw) return r.raw;
  const doi = r.doi
    ? `<gmd:identifier><gmd:MD_Identifier><gmd:code><gco:CharacterString>https://doi.org/${r.doi}</gco:CharacterString></gmd:code></gmd:MD_Identifier></gmd:identifier>`
    : '';
  const cons =
    r.licence === null || r.licence === undefined
      ? ''
      : `<gmd:resourceConstraints><gmd:MD_LegalConstraints><gmd:useLimitation><gco:CharacterString>${r.licence}</gco:CharacterString></gmd:useLimitation></gmd:MD_LegalConstraints></gmd:resourceConstraints>`;
  return `<gmd:MD_Metadata ${GMD_NS}><gmd:fileIdentifier><gco:CharacterString>${r.id}</gco:CharacterString></gmd:fileIdentifier><gmd:identificationInfo><gmd:MD_DataIdentification><gmd:citation><gmd:CI_Citation><gmd:title><gco:CharacterString>Title ${r.id}</gco:CharacterString></gmd:title>${doi}</gmd:CI_Citation></gmd:citation>${cons}</gmd:MD_DataIdentification></gmd:identificationInfo></gmd:MD_Metadata>`;
}

export const CAPABILITIES = `<?xml version="1.0"?><csw:Capabilities xmlns:csw="http://www.opengis.net/cat/csw/2.0.2" xmlns:ows="http://www.opengis.net/ows"><ows:OperationsMetadata><ows:Operation name="GetRecords"><ows:Parameter name="outputSchema"><ows:Value>http://www.isotc211.org/2005/gmd</ows:Value><ows:Value>http://standards.iso.org/iso/19115/-3/mdb/2.0</ows:Value></ows:Parameter></ows:Operation></ows:OperationsMetadata></csw:Capabilities>`;

export function searchResults(matched: number, returned: number, nextRecord: number, records: string[]): string {
  return `<?xml version="1.0"?><csw:GetRecordsResponse xmlns:csw="http://www.opengis.net/cat/csw/2.0.2"><csw:SearchStatus timestamp="2026-10-22T10:00:00"/><csw:SearchResults numberOfRecordsMatched="${matched}" numberOfRecordsReturned="${returned}" elementSet="full" nextRecord="${nextRecord}">${records.join('')}</csw:SearchResults></csw:GetRecordsResponse>`;
}

export const exceptionReport = (start: number, matched: number): string =>
  `<?xml version="1.0"?><ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows" version="1.2.0"><ows:Exception exceptionCode="NoApplicableCode"><ows:ExceptionText>InvalidParameterValueEx: locator=startPosition, message=Start position (${start}) can't be greater than number of matching records (${matched} for current search).</ows:ExceptionText></ows:Exception></ows:ExceptionReport>`;

export interface CatalogueBehaviour {
  /** What the catalogue claims in numberOfRecordsMatched. */
  claimed: number;
  /** The records it really holds. */
  records: CatalogueRecord[];
  /** Past the real end: 'exception' (HTTP 200 ExceptionReport) or 'empty' (a page with no records). */
  pastEnd?: 'exception' | 'empty';
  /** nextRecord=0 on the last page (honest) or a value that points past the end. */
  lastNext?: 'zero' | 'past-end';
  /** Returns fewer records than asked (ICES). */
  cap?: number;
  /** Every page is the same page (a stalled catalogue). */
  stalled?: boolean;
  /** nextRecord never moves forward. */
  stuckNext?: boolean;
}

/** The catalogue's XML for one GetRecords request (what the real server would stream back). */
export function catalogueAnswer(b: CatalogueBehaviour, start: number, max: number): string {
  if (b.stalled) return searchResults(b.claimed, Math.min(max, 3), start + 3, b.records.slice(0, 3).map(gmdRecord));
  const total = b.records.length;
  if (start > total) {
    return b.pastEnd === 'empty' ? searchResults(b.claimed, 0, start + max, []) : exceptionReport(start, total);
  }
  const size = Math.min(max, b.cap ?? max);
  const slice = b.records.slice(start - 1, start - 1 + size);
  const end = start - 1 + slice.length;
  const next = end >= total ? (b.lastNext === 'past-end' ? end + 1 : 0) : b.stuckNext ? start : end + 1;
  return searchResults(b.claimed, slice.length, next, slice.map(gmdRecord));
}

/** What the upstream sees when /api/csw asks: GET KVP or POST XML, both reduced to (start, max, schema). */
export function parseUpstream(url: URL, method: string | undefined, body: string | undefined): { op: string; start: number; max: number; schema: string } {
  if (method === 'POST') {
    const start = Number(/startPosition="(\d+)"/.exec(body ?? '')?.[1] ?? 1);
    const max = Number(/maxRecords="(\d+)"/.exec(body ?? '')?.[1] ?? 10);
    return { op: 'GetRecords', start, max, schema: /outputSchema="([^"]+)"/.exec(body ?? '')?.[1] ?? '' };
  }
  const q = url.searchParams;
  return { op: q.get('request') ?? '', start: Number(q.get('startPosition') ?? 1), max: Number(q.get('maxRecords') ?? 10), schema: q.get('outputSchema') ?? '' };
}

export type { CswCall };
