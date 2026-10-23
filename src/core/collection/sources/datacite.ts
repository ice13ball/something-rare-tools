// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// DataCite adapters: a client or prefix walked by cursor, a random quick sample, and the batch lookup (ids=) that the DOI list and the
// CSW cross-check share. Verified 22.10.2026: page[size] <= 1000, links.next is followed verbatim, a bogus cursor silently restarts at
// page 1, page[number] stops at page 10 (never used), random=true excludes page[cursor], ids= takes up to 100 DOIs in one request.
import { parseDataciteJson } from '../../metadata/datacite';
import type { MetadataRecord } from '../../types';
import { request, type NetContext, type Net } from '../net';
import { SourceFailure, type Estimate, type Item, type PageData, type Pager } from '../types';

export const DATACITE_HOST = 'api.datacite.org';
export const DATACITE_PAGE = 1000;
export const DATACITE_SAMPLE_PAGE = 100;
export const DATACITE_SAMPLE_REQUESTS = 30;
export const DATACITE_BATCH = 100;
/** Fields the rules need and nothing else: a 1000-record page is 4 MB instead of 6. */
export const DATACITE_FIELDS = 'doi,url,titles,creators,publisher,publicationYear,rightsList,dates,geoLocations,version,relatedIdentifiers,types';

export interface Deps {
  net: Net;
  nctx: NetContext;
}

const enc = encodeURIComponent;
const BASE = `https://${DATACITE_HOST}/dois`;
const QUERY_FIELDS = `fields%5Bdois%5D=${DATACITE_FIELDS}`;

const CLIENT_ID = /^[a-z0-9][a-z0-9._-]{0,60}$/i;
const PREFIX = /^10\.\d{4,9}$/;

export function dataciteListUrl(by: 'client' | 'prefix', id: string, size = DATACITE_PAGE): string {
  return `${BASE}?${by === 'client' ? 'client-id' : 'prefix'}=${enc(id)}&page%5Bsize%5D=${size}&page%5Bcursor%5D=1&${QUERY_FIELDS}`;
}

export function dataciteSampleUrl(by: 'client' | 'prefix', id: string): string {
  return `${BASE}?${by === 'client' ? 'client-id' : 'prefix'}=${enc(id)}&random=true&page%5Bsize%5D=${DATACITE_SAMPLE_PAGE}&${QUERY_FIELDS}`;
}

export function dataciteIdsUrl(dois: readonly string[]): string {
  return `${BASE}?ids=${dois.map(enc).join(',')}&page%5Bsize%5D=${DATACITE_BATCH}&${QUERY_FIELDS}`;
}

export function validateSourceId(by: 'client' | 'prefix', id: string): void {
  if (!(by === 'client' ? CLIENT_ID : PREFIX).test(id)) throw new SourceFailure('protocol', 'bad-id');
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

async function getJson(deps: Deps, url: string): Promise<Obj> {
  const res = await request(deps.nctx, DATACITE_HOST, () => deps.net.get(url, 'application/json'));
  try {
    const json: unknown = JSON.parse(res.text);
    if (isObj(json)) return json;
  } catch {
    // an HTML page with status 200 is as good as an unreadable one
  }
  throw new SourceFailure('unreachable', 'not-json', res.status);
}

/** DataCite resources of a response, as items (state checked). */
function itemsOf(json: Obj): Item[] {
  const data = Array.isArray(json.data) ? json.data.filter(isObj) : [];
  return data.map((d) => {
    const attrs = isObj(d.attributes) ? d.attributes : {};
    const doi = (typeof attrs.doi === 'string' && attrs.doi) || (typeof d.id === 'string' ? d.id : '');
    try {
      return { ref: doi.toLowerCase(), state: 'checked' as const, records: [parseDataciteJson(d, `DataCite ${doi}`)] };
    } catch {
      // One record that cannot be parsed is a record that was not read, not the end of a run of thousands (only a page that is no JSON at all is a page failure).
      return { ref: doi.toLowerCase(), state: 'unsupported-profile' as const, records: [], reason: UNREADABLE_RECORD };
    }
  });
}

/** Reason of a record the source delivered but this tool could not parse. */
export const UNREADABLE_RECORD = 'unreadable-record';

/** DataCite records of up to 100 DOIs; a DOI DataCite does not know is simply absent from the map (keys lower-case). */
export async function lookupMany(deps: Deps, dois: readonly string[]): Promise<Map<string, MetadataRecord>> {
  return (await lookupManyRead(deps, dois)).found;
}

/** Like lookupMany, and also says which DOIs DataCite DID answer with a record this tool could not parse (not the same as "DataCite does not know it"). */
export async function lookupManyRead(deps: Deps, dois: readonly string[]): Promise<{ found: Map<string, MetadataRecord>; unreadable: Set<string> }> {
  const found = new Map<string, MetadataRecord>();
  const unreadable = new Set<string>();
  if (dois.length === 0) return { found, unreadable };
  const json = await getJson(deps, dataciteIdsUrl(dois));
  for (const it of itemsOf(json)) {
    if (it.state === 'checked') found.set(it.ref, it.records[0]);
    else unreadable.add(it.ref);
  }
  return { found, unreadable };
}

export async function dataciteTotal(deps: Deps, by: 'client' | 'prefix', id: string): Promise<number> {
  validateSourceId(by, id);
  const url = `${BASE}?${by === 'client' ? 'client-id' : 'prefix'}=${enc(id)}&page%5Bsize%5D=1&fields%5Bdois%5D=doi`;
  const json = await getJson(deps, url);
  const total = isObj(json.meta) && typeof json.meta.total === 'number' ? json.meta.total : 0;
  return total;
}

export function estimateDatacite(total: number, sample: boolean): Estimate {
  if (sample) {
    const requests = Math.min(DATACITE_SAMPLE_REQUESTS, Math.ceil(total / DATACITE_SAMPLE_PAGE));
    return { records: Math.min(total, requests * DATACITE_SAMPLE_PAGE), requests, extraRequests: 0, seconds: requests * 2.5, strategy: 'random-sample', sample: true, empty: total === 0 };
  }
  const requests = Math.ceil(total / DATACITE_PAGE);
  return { records: total, requests, extraRequests: 0, seconds: requests * 4, strategy: 'cursor', sample: false, empty: total === 0 };
}

/** The cursor URL must be DataCite's own listing: https, api.datacite.org, /dois, no credentials. We never follow anything else. */
export function isDataciteListUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && url.hostname === DATACITE_HOST && url.pathname === '/dois' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

/** base64 "<epoch ms>,<doi>" of a page[cursor] value: the epoch, or undefined when the token is not of that shape. */
export function cursorEpoch(listUrl: string): number | undefined {
  try {
    const token = new URL(listUrl).searchParams.get('page[cursor]');
    if (!token) return undefined;
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const m = /^(\d{10,14}),/.exec(raw);
    return m ? Number(m[1]) : undefined;
  } catch {
    return undefined;
  }
}

export interface DataciteCursor {
  /** Exactly DataCite's links.next of the previous page (page[cursor]=1 for the first). */
  url: string;
  /** Records of the pages before this one. */
  n: number;
  /** First DOI of page 1: a later page that starts with it is a silent restart. */
  anchor?: string;
  /** Epoch of the previous cursor token. */
  epoch?: number;
}

export function dataciteListPager(deps: Deps, by: 'client' | 'prefix', id: string, total: number): Pager<DataciteCursor> {
  return {
    initial: total > 0 ? { url: dataciteListUrl(by, id), n: 0 } : null,
    expected: (c) => Math.max(0, Math.min(DATACITE_PAGE, total - c.n)),
    skip: () => null,
    async fetch(c): Promise<PageData<DataciteCursor>> {
      if (!isDataciteListUrl(c.url)) throw new SourceFailure('protocol', 'bad-cursor-url');
      const json = await getJson(deps, c.url);
      const items = itemsOf(json);
      const notices: PageData<DataciteCursor>['notices'] = [];
      const links = isObj(json.links) ? json.links : {};
      const nextUrl = typeof links.next === 'string' ? links.next : undefined;

      // Progress must be monotonic: DataCite answers a bogus cursor with page 1 again, which would loop for ever.
      if (c.n > 0 && c.anchor !== undefined && items.length > 0 && items[0].ref === c.anchor) throw new SourceFailure('protocol', 'cursor-restarted');
      if (c.n + items.length > total + DATACITE_PAGE) throw new SourceFailure('protocol', 'cursor-overrun');
      let next: DataciteCursor | null = null;
      let shortfall = 0;
      if (nextUrl !== undefined && items.length > 0) {
        if (nextUrl === c.url || !isDataciteListUrl(nextUrl)) throw new SourceFailure('protocol', 'cursor-stuck');
        const epoch = cursorEpoch(nextUrl);
        if (epoch !== undefined && c.epoch !== undefined && epoch < c.epoch) throw new SourceFailure('protocol', 'cursor-not-monotonic');
        next = { url: nextUrl, n: c.n + items.length, anchor: c.anchor ?? items[0].ref, ...(epoch !== undefined ? { epoch } : {}) };
      } else if (c.n + items.length < total) {
        notices.push({ code: 'ended-before-total', params: { seen: c.n + items.length, total } });
        shortfall = total - (c.n + items.length);
      }
      return { items, next, notices, ...(shortfall > 0 ? { shortfall } : {}) };
    },
  };
}

export interface SampleCursor {
  i: number;
  /** DOIs already drawn (<= the sample size): the same DOI is not counted twice. */
  seen: string[];
}

/** `random=true`: DataCite draws a random page of the client; cursor paging and random sampling exclude each other (400). */
export function dataciteSamplePager(deps: Deps, by: 'client' | 'prefix', id: string, total: number): Pager<SampleCursor> {
  const n = Math.min(DATACITE_SAMPLE_REQUESTS, Math.ceil(total / DATACITE_SAMPLE_PAGE));
  const after = (c: SampleCursor, seen: string[]): SampleCursor | null => (c.i + 1 < n ? { i: c.i + 1, seen } : null);
  return {
    initial: n > 0 ? { i: 0, seen: [] } : null,
    expected: () => DATACITE_SAMPLE_PAGE,
    skip: (c) => after(c, c.seen),
    async fetch(c) {
      const json = await getJson(deps, dataciteSampleUrl(by, id));
      const had = new Set(c.seen);
      const items = itemsOf(json).filter((it) => !had.has(it.ref));
      return { items, next: after(c, [...c.seen, ...items.map((it) => it.ref)]) };
    },
  };
}
