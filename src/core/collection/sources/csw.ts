// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A GeoNetwork catalogue over CSW 2.0.2, through our server (POST /api/csw). The catalogue's own answer is not trusted: the total can be
// too high or too low, a page past the end can be HTTP 200 with an ows:ExceptionReport, nextRecord can skip (ICES) or stall. The walk
// follows nextRecord, stops on nextRecord=0 / an empty page / an exception past the end, never goes backwards, and SAYS when what it got
// differs from what the catalogue claimed. maxRecords stays small: 500 returned 17-34 MB.
import { XMLSerializer } from '@xmldom/xmldom';
import { parseIsoRecord } from '../../metadata/iso19115-3';
import { NS, NS3, child, descendants, elementChildren, parseXml, text } from '../../metadata/xml';
import type { MetadataRecord, MetadataSource } from '../../types';
import type { CswSchema } from '../../../../config/catalogues';
import { request } from '../net';
import { SourceFailure, type Estimate, type Item, type Notice, type PageData, type Pager } from '../types';
import { lookupMany, type Deps } from './datacite';

export const CSW_PAGE = 25;
export const CSW_SAMPLE_PAGE = 10;
export const CSW_SAMPLE_REQUESTS = 20;
const CSW_NS = 'http://www.opengis.net/cat/csw/2.0.2';
const SCHEMA_URI: Record<CswSchema, string> = { iso19139: 'http://www.isotc211.org/2005/gmd', 'iso19115-3': 'http://standards.iso.org/iso/19115/-3/mdb/' };

export interface CswSource {
  catalogue: string;
  schema: CswSchema;
  crossSource: boolean;
}

export interface CswPlan {
  matched: number;
}

export interface CswCursor {
  /** startPosition of the page. */
  pos: number;
  /** Records of the pages before. */
  seen: number;
  /** Identifier of the first record of the previous page: a page that repeats it is a stalled catalogue. */
  last?: string;
  /** Sample: index of the request. */
  i?: number;
}

const isException = (root: Element): boolean => root.localName === 'ExceptionReport';

/** `descendants` matches a namespace; the ExceptionText element lives in ows (1.0 or 1.1): look it up by walking. */
function allByLocalName(el: Element, local: string): Element[] {
  const out: Element[] = [];
  const walk = (e: Element): void => {
    for (const c of elementChildren(e)) {
      if (c.localName === local) out.push(c);
      walk(c);
    }
  };
  walk(el);
  return out;
}

const exceptionMessage = (root: Element): string => allByLocalName(root, 'ExceptionText').map((e) => text(e) ?? '').join(' ').slice(0, 300);

function parseResponse(body: string): Element {
  try {
    return parseXml(body, 'catalogue response').documentElement;
  } catch {
    throw new SourceFailure('unreachable', 'not-xml');
  }
}

/** GetCapabilities: the catalogue answers and offers the output schema asked for. */
export async function readCapabilities(deps: Deps, src: CswSource): Promise<void> {
  const res = await request(deps.nctx, 'csw', () => deps.net.csw({ catalogue: src.catalogue, op: 'GetCapabilities' }));
  const root = parseResponse(res.text);
  if (isException(root) || root.localName !== 'Capabilities') throw new SourceFailure('protocol', 'not-capabilities');
  if (!res.text.includes(SCHEMA_URI[src.schema])) throw new SourceFailure('protocol', 'schema-not-offered');
}

function searchResults(root: Element): Element | undefined {
  return root.localName === 'GetRecordsResponse' ? descendants(root, CSW_NS, 'SearchResults')[0] : undefined;
}

const intAttr = (el: Element, name: string): number | undefined => {
  const v = el.getAttribute(name);
  return v !== null && /^\d{1,10}$/.test(v.trim()) ? Number(v.trim()) : undefined;
};

/** The catalogue's claimed number of records (GetRecords with one record). */
export async function cswMatched(deps: Deps, src: CswSource): Promise<number> {
  await readCapabilities(deps, src);
  const res = await request(deps.nctx, 'csw', () => deps.net.csw({ catalogue: src.catalogue, op: 'GetRecords', startPosition: 1, maxRecords: 1, schema: src.schema }));
  const root = parseResponse(res.text);
  if (isException(root)) throw new SourceFailure('unreachable', 'exception');
  const sr = searchResults(root);
  const matched = sr ? intAttr(sr, 'numberOfRecordsMatched') : undefined;
  if (matched === undefined) throw new SourceFailure('unreachable', 'no-search-results');
  return matched;
}

export function estimateCsw(matched: number, sample: boolean, crossSource: boolean): Estimate {
  if (sample) {
    const requests = Math.min(CSW_SAMPLE_REQUESTS, Math.ceil(matched / CSW_SAMPLE_PAGE));
    const extra = crossSource ? requests : 0;
    return { records: Math.min(matched, requests * CSW_SAMPLE_PAGE), requests, extraRequests: extra, seconds: (requests + extra) * 3.5, strategy: 'spread-positions', sample: true, empty: matched === 0 };
  }
  const requests = Math.ceil(matched / CSW_PAGE);
  const extra = crossSource ? requests : 0;
  return { records: matched, requests, extraRequests: extra, seconds: (requests + extra) * 3.5, strategy: 'start-position', sample: false, empty: matched === 0 };
}

const identifierOf = (md: Element): string | undefined => {
  const g = child(md, NS.gmd, 'fileIdentifier');
  if (g) return text(g);
  const m = child(md, NS3.mdb, 'metadataIdentifier');
  const code = m ? descendants(m, NS3.mcc, 'code')[0] : undefined;
  return code ? text(code) : undefined;
};

const serializer = new XMLSerializer();

const DOI_IN = /\b(10\.\d{4,9}\/[^\s"<>]+)/;

/**
 * The DOI of an ISO record: the 19115-3 parser reads it, the 19139 parser does not, so it is looked up here (citation identifiers, then
 * a doi.org link among the online resources). Needed only to ask DataCite about the same deposit.
 */
function doiOf(rec: MetadataRecord, el: Element): string | undefined {
  if (rec.doi) return rec.doi;
  for (const id of allByLocalName(el, 'identifier')) {
    const m = DOI_IN.exec(text(id) ?? '');
    if (m) return m[1].replace(/[.,;)]+$/, '');
  }
  for (const l of rec.distributionLinks) {
    const m = /^https?:\/\/(?:dx\.)?doi\.org\/(10\.\d{4,9}\/\S+)$/i.exec(l.url.trim());
    if (m) return m[1];
  }
  return undefined;
}

/** One element of SearchResults as an item. Another profile, or a placeholder where the record should be, is 'unsupported-profile'. */
function itemOf(el: Element, fallbackRef: string): Item {
  const ref = (identifierOf(el) ?? fallbackRef).trim();
  const iso = (el.localName === 'MD_Metadata') && (el.namespaceURI === NS.gmd || (NS3.mdb as readonly string[]).includes(el.namespaceURI ?? ''));
  if (!iso) return { ref, state: 'unsupported-profile', records: [], reason: `profile:${el.localName}` };
  // NOAA answers numberOfRecordsReturned=10 with text where the record should be ("Cannot disseminate schema ...").
  if (elementChildren(el).length === 0) return { ref, state: 'unsupported-profile', records: [], reason: 'not-disseminated' };
  try {
    const rec = parseIsoRecord(serializer.serializeToString(el as never), ref);
    const doi = doiOf(rec, el);
    if (doi) rec.doi = doi;
    return { ref, state: 'checked', records: [rec] };
  } catch {
    return { ref, state: 'unsupported-profile', records: [], reason: 'unreadable-xml' };
  }
}

const DOI = /^10\.\d{4,9}\/\S+$/;

/** Looks the records' DOIs up at DataCite (one request per page); a failed lookup leaves those records with `unreadable: ['datacite']`. */
async function crossCheck(deps: Deps, items: Item[]): Promise<NonNullable<PageData<unknown>['counters']>['crossSource']> {
  const byDoi = new Map<string, Item[]>();
  for (const it of items) {
    const doi = it.state === 'checked' ? it.records[0]?.doi?.trim().toLowerCase() : undefined;
    if (doi && DOI.test(doi)) byDoi.set(doi, [...(byDoi.get(doi) ?? []), it]);
  }
  if (byDoi.size === 0) return {};
  let found: Map<string, MetadataRecord>;
  try {
    found = await lookupMany(deps, [...byDoi.keys()]);
  } catch (e) {
    if (!(e instanceof SourceFailure)) throw e; // a stop is not a failed lookup
    for (const list of byDoi.values()) for (const it of list) it.unreadable = ['datacite' as MetadataSource];
    return { looked: byDoi.size, failed: byDoi.size };
  }
  let hit = 0;
  for (const [doi, list] of byDoi) {
    const rec = found.get(doi);
    if (!rec) continue;
    hit += 1;
    for (const it of list) it.records.push(rec);
  }
  return { looked: byDoi.size, found: hit, absent: byDoi.size - hit };
}

/** One GetRecords page → items, nextRecord, notices. Shared by the full walk and the sample. */
async function readPage(deps: Deps, src: CswSource, pos: number, size: number, matched: number): Promise<{ items: Item[]; nextRecord: number; end?: Notice; first?: string; crossSource?: PageData<unknown>['counters'] }> {
  const res = await request(deps.nctx, 'csw', () => deps.net.csw({ catalogue: src.catalogue, op: 'GetRecords', startPosition: pos, maxRecords: size, schema: src.schema }));
  const root = parseResponse(res.text);
  if (isException(root)) {
    const msg = exceptionMessage(root);
    // HTTP 200 + exception past the end: GeoNetwork "Start position (N) can't be greater than number of matching records".
    if (pos > matched || /greater than number of matching/i.test(msg)) return { items: [], nextRecord: 0, end: { code: 'ended-by-exception', params: { position: pos, matched } } };
    throw new SourceFailure('unreachable', 'exception');
  }
  const sr = searchResults(root);
  if (!sr) throw new SourceFailure('unreachable', 'no-search-results');
  const els = elementChildren(sr);
  const items = els.map((el, i) => itemOf(el, `#${pos + i}`));
  const crossSource = src.crossSource ? { crossSource: await crossCheck(deps, items) } : undefined;
  return { items, nextRecord: intAttr(sr, 'nextRecord') ?? 0, first: items[0]?.ref, crossSource };
}

export function cswPager(deps: Deps, src: CswSource, plan: CswPlan): Pager<CswCursor> {
  const { matched } = plan;
  return {
    initial: matched > 0 ? { pos: 1, seen: 0 } : null,
    expected: (c) => Math.max(1, Math.min(CSW_PAGE, matched - c.pos + 1)),
    skip: (c) => (c.pos + CSW_PAGE <= matched ? { pos: c.pos + CSW_PAGE, seen: c.seen + CSW_PAGE } : null),
    async fetch(c): Promise<PageData<CswCursor>> {
      const page = await readPage(deps, src, c.pos, CSW_PAGE, matched);
      const notices: Notice[] = [];
      const seen = c.seen + page.items.length;
      const counters = page.crossSource;
      if (page.end) notices.push(page.end);

      let next: CswCursor | null = null;
      if (!page.end && page.items.length > 0) {
        if (page.first !== undefined && page.first === c.last) throw new SourceFailure('protocol', 'repeating-page');
        if (page.nextRecord > 0) {
          if (page.nextRecord <= c.pos) throw new SourceFailure('protocol', 'next-record-not-advancing');
          // The catalogue's own total is only a claim: a run that delivers far more than it must not go on for ever.
          if (seen > matched * 1.5 + 500) notices.push({ code: 'overrun-stopped', params: { seen, matched } });
          else next = { pos: page.nextRecord, seen, last: page.first };
        }
      } else if (!page.end && page.nextRecord > 0) {
        notices.push({ code: 'empty-page', params: { position: c.pos, matched } });
      }
      if (next === null) {
        if (seen < matched) notices.push({ code: 'ended-before-matched', params: { seen, matched } });
        else if (seen > matched) notices.push({ code: 'more-than-matched', params: { seen, matched } });
      }
      return { items: page.items, next, notices, ...(counters ? { counters } : {}) };
    },
  };
}

/** The sample: CSW_SAMPLE_REQUESTS pages of 10 at start positions spread over the whole catalogue. */
export function cswSamplePager(deps: Deps, src: CswSource, plan: CswPlan): Pager<CswCursor> {
  const { matched } = plan;
  const n = Math.min(CSW_SAMPLE_REQUESTS, Math.ceil(matched / CSW_SAMPLE_PAGE));
  const posOf = (i: number): number => Math.min(matched, Math.floor((i * matched) / n) + 1);
  const after = (c: CswCursor): CswCursor | null => ((c.i ?? 0) + 1 < n ? { pos: posOf((c.i ?? 0) + 1), seen: 0, i: (c.i ?? 0) + 1 } : null);
  return {
    initial: n > 0 ? { pos: 1, seen: 0, i: 0 } : null,
    expected: () => CSW_SAMPLE_PAGE,
    skip: after,
    async fetch(c) {
      const page = await readPage(deps, src, c.pos, CSW_SAMPLE_PAGE, matched);
      return { items: page.items, next: after(c), ...(page.crossSource ? { counters: page.crossSource } : {}) };
    },
  };
}
