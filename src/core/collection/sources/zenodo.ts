// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A Zenodo community (/api/communities/{slug}/records: /api/records?communities= ignores an unknown slug and returns all 7.5 M records).
// Guests get 25 records a page, 30 requests a minute, and a window of size x page <= 10 000: a community above that is split by
// publication date (open-ended year slices, months inside a year above the window, days inside a month) and each slice is paged.
import { parseZenodoRecord } from '../../metadata/zenodo';
import { request } from '../net';
import { SourceFailure, type Estimate, type Item, type PageData, type Pager } from '../types';
import type { Deps } from './datacite';
import { addIds, decodeIds, encodeIds, hasId, idOf } from './idset';

export const ZENODO_HOST = 'zenodo.org';
export const ZENODO_PAGE = 25;
/** size x page <= 10 000; a slice at or below this is paged directly. */
export const ZENODO_WINDOW = 10_000;
export const ZENODO_SAMPLE_REQUESTS = 28;
const MAX_SLICES = 2000;
/** Slices first split at this year; anything older is one open-ended slice (split by year when it is too big). */
const FIRST_YEAR = 2000;

const SLUG = /^[a-z0-9][a-z0-9_-]{0,100}$/i;
const enc = encodeURIComponent;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** An inclusive publication-date range; a missing end is open. */
export interface Slice {
  from?: string;
  to?: string;
  total: number;
  /** One day alone holds more than the window: the records beyond it cannot be listed. */
  capped?: boolean;
  /**
   * A REMAINDER slice: the records inside from..to that none of these finer ranges holds. The index matches a range query only for records
   * whose date lies inside it, so a record dated only "2010" or "2010-08" is in the year's slice but in none of its month or day slices.
   * Its total is (parent count - sum of the children's counts).
   */
  except?: { from: string; to: string }[];
}

export function validateSlug(slug: string): void {
  if (!SLUG.test(slug)) throw new SourceFailure('protocol', 'bad-id');
}

export function zenodoUrl(slug: string, page: number, size: number, sort: 'oldest' | 'mostrecent', slice?: Pick<Slice, 'from' | 'to' | 'except'>): string {
  const not = (slice?.except ?? []).map((e) => ` AND NOT publication_date:[${e.from} TO ${e.to}]`).join('');
  const q = slice && (slice.from || slice.to) ? `&q=${enc(`publication_date:[${slice.from ?? '*'} TO ${slice.to ?? '*'}]${not}`)}` : '';
  return `https://${ZENODO_HOST}/api/communities/${enc(slug)}/records?size=${size}&page=${page}&sort=${sort}${q}`;
}

async function getJson(deps: Deps, url: string): Promise<Obj> {
  const res = await request(deps.nctx, ZENODO_HOST, () => deps.net.get(url, 'application/json'));
  try {
    const json: unknown = JSON.parse(res.text);
    if (isObj(json)) return json;
  } catch {
    // fall through
  }
  throw new SourceFailure('unreachable', 'not-json', res.status);
}

function totalOf(json: Obj): number {
  const hits = isObj(json.hits) ? json.hits : {};
  return typeof hits.total === 'number' ? hits.total : 0;
}

/** hits.total of a community (one request with size=1); an unknown community is SourceFailure 'not-found'. */
export async function zenodoTotal(deps: Deps, slug: string, slice?: Pick<Slice, 'from' | 'to' | 'except'>): Promise<number> {
  validateSlug(slug);
  return totalOf(await getJson(deps, zenodoUrl(slug, 1, 1, 'oldest', slice)));
}

export function estimateZenodo(total: number, sample: boolean): Estimate {
  if (sample) {
    const pages = Math.ceil(total / ZENODO_PAGE);
    const requests = Math.min(ZENODO_SAMPLE_REQUESTS, pages);
    return { records: Math.min(total, requests * ZENODO_PAGE), requests, extraRequests: 0, seconds: requests * 2.6, strategy: 'spread-pages', sample: true, empty: total === 0 };
  }
  const slices = Math.max(1, Math.ceil(total / ZENODO_WINDOW));
  const split = total > ZENODO_WINDOW;
  // building the slices costs about one count per year plus the months of the big years: a rough number, said to be rough
  const planning = split ? 30 + 2 * slices : 0;
  const requests = Math.ceil(total / ZENODO_PAGE) + planning;
  return { records: total, requests, extraRequests: 0, seconds: requests * 2.6, strategy: split ? 'date-split' : 'cursor', slices, ...(split ? { approximate: true } : {}), sample: false, empty: total === 0 };
}

const pad = (n: number): string => String(n).padStart(2, '0');
const lastDay = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The slices that replace `s` when it is above the window, or none when it cannot be split further. */
function finer(s: Slice, thisYear: number): Pick<Slice, 'from' | 'to'>[] {
  const y1 = s.from ? Number(s.from.slice(0, 4)) : undefined;
  const y2 = s.to ? Number(s.to.slice(0, 4)) : undefined;
  if (y1 === undefined || y2 === undefined || y1 !== y2) {
    // several years (or an open end): one slice per year; the open ends keep what lies beyond
    const lo = y1 ?? (y2 !== undefined ? Math.max(1900, y2 - 99) : FIRST_YEAR);
    const hi = y2 ?? thisYear + 1;
    if (y1 === undefined && y2 === undefined) return [];
    const out: Pick<Slice, 'from' | 'to'>[] = [];
    if (y1 === undefined) out.push({ to: `${lo - 1}-12-31` });
    for (let y = lo; y <= hi; y++) out.push({ from: `${y}-01-01`, to: `${y}-12-31` });
    if (y2 === undefined) out.push({ from: `${hi + 1}-01-01` });
    return out;
  }
  const m1 = Number(s.from!.slice(5, 7));
  const m2 = Number(s.to!.slice(5, 7));
  if (m1 !== m2) {
    const out: Pick<Slice, 'from' | 'to'>[] = [];
    for (let m = m1; m <= m2; m++) out.push({ from: `${y1}-${pad(m)}-01`, to: `${y1}-${pad(m)}-${pad(lastDay(y1, m))}` });
    return out;
  }
  const d1 = Number(s.from!.slice(8, 10));
  const d2 = Number(s.to!.slice(8, 10));
  if (d1 === d2) return [];
  const out: Pick<Slice, 'from' | 'to'>[] = [];
  for (let d = d1; d <= d2; d++) out.push({ from: `${y1}-${pad(m1)}-${pad(d)}`, to: `${y1}-${pad(m1)}-${pad(d)}` });
  return out;
}

/** Both ends inside one calendar year and a month at most: the parents whose finer slices can miss partial dates (a year, a month). */
const splitsWithinYear = (w: Pick<Slice, 'from' | 'to'>): boolean => !!w.from && !!w.to && w.from.slice(0, 4) === w.to.slice(0, 4) && (w.from.slice(5, 7) !== w.to.slice(5, 7) || w.from.slice(8, 10) !== w.to.slice(8, 10));

/**
 * Builds the slice list for a community above the window: counts every candidate (one request each) and refines the big ones. Where a year
 * is cut into months (or a month into days) the children can add up to less than the parent, because a record dated only "2010" or "2010-08"
 * matches the parent's range but none of the children's: what is missing is read as a REMAINDER slice (the parent's range minus the children's).
 */
export async function planSlices(deps: Deps, slug: string, total: number, thisYear: number): Promise<{ slices: Slice[]; sum: number }> {
  const slices: Slice[] = [];
  const expand = async (w: Pick<Slice, 'from' | 'to'>, n: number): Promise<void> => {
    if (n === 0) return;
    if (n <= ZENODO_WINDOW) {
      slices.push({ ...w, total: n });
      return;
    }
    const parts = finer({ ...w, total: n }, thisYear);
    if (parts.length === 0) {
      slices.push({ ...w, total: n, capped: true });
      return;
    }
    let childSum = 0;
    for (const p of parts) {
      const c = await zenodoTotal(deps, slug, p);
      childSum += c;
      await expand(p, c);
      if (slices.length > MAX_SLICES) throw new SourceFailure('protocol', 'too-many-slices');
    }
    const rest = n - childSum;
    if (rest > 0 && splitsWithinYear(w)) {
      // Not splittable further (what is left has no date to cut by): above the window it is capped, and the run says so.
      const except = parts.map((p) => ({ from: p.from!, to: p.to! }));
      slices.push({ ...w, except, total: rest, ...(rest > ZENODO_WINDOW ? { capped: true } : {}) });
    }
  };
  const work: Pick<Slice, 'from' | 'to'>[] = [{ to: `${FIRST_YEAR - 1}-12-31` }];
  for (let y = FIRST_YEAR; y <= thisYear; y++) work.push({ from: `${y}-01-01`, to: `${y}-12-31` });
  work.push({ from: `${thisYear + 1}-01-01` });
  for (const w of work) {
    const n = await zenodoTotal(deps, slug, w);
    await expand(w, n);
  }
  const sum = slices.reduce((a, s) => a + Math.min(s.total, ZENODO_WINDOW), 0);
  return { slices, sum: total === 0 ? 0 : sum };
}

export interface ZenodoPlan {
  slug: string;
  total: number;
  slices: Slice[];
  /** Records the slices add up to (not the capped ones); a difference from `total` is reported. */
  sum: number;
}

export interface ZenodoCursor {
  /** Slice index. */
  si: number;
  page: number;
  /** Sort order of this slice's pages (a sample alternates). */
  sort?: 'oldest' | 'mostrecent';
  /**
   * Record ids already read in the slices of this slice's year that were split below year level (see yearOfSplit), sorted, as base64
   * (idset.ts); absent outside such slices. Saved with the cursor, so a resumed run drops the same repeats an uninterrupted one does.
   */
  ids?: string;
}

/**
 * The year whose split slices (a month or a day, not the whole year) this slice belongs to; undefined for any other slice. Only these can
 * overlap one another: Zenodo accepts partial publication dates ("2021", "2021-05"), and an index that stores those as ranges may list a
 * record in several month or day slices. Slices of different years are never compared, so the ids can be dropped at every year's end.
 */
export function yearOfSplit(s: Slice): string | undefined {
  if (!s.from || !s.to) return undefined;
  const y = s.from.slice(0, 4);
  if (s.to.slice(0, 4) !== y) return undefined;
  // a remainder of a whole year belongs to that year's group: it can overlap the months it was cut from only through a repeated id
  return s.from === `${y}-01-01` && s.to === `${y}-12-31` && !s.except ? undefined : y;
}

/** The records of a page, each with its numeric Zenodo id (undefined when the id is not a plain integer: such a record is never dropped as a repeat). */
function itemsOf(json: Obj): { item: Item; id?: number }[] {
  const hits = isObj(json.hits) && Array.isArray(json.hits.hits) ? json.hits.hits.filter(isObj) : [];
  return hits.map((h) => {
    const id = typeof h.id === 'number' || typeof h.id === 'string' ? String(h.id) : '';
    const rec = parseZenodoRecord(h, `Zenodo ${id}`);
    return { item: { ref: (rec.doi ?? `zenodo.${id}`).toLowerCase(), state: 'checked' as const, records: [rec] }, id: idOf(h.id) };
  });
}

export function zenodoPager(deps: Deps, plan: ZenodoPlan): Pager<ZenodoCursor> {
  const { slug, slices } = plan;
  const sliceTotal = (s: Slice): number => Math.min(s.total, ZENODO_WINDOW);
  /** The ids travel to the next cursor while it stays inside the same year's split slices, and are dropped when the year ends. */
  const carry = (next: ZenodoCursor | null, c: ZenodoCursor, ids: string | undefined): ZenodoCursor | null => {
    if (!next || ids === undefined) return next;
    const y = yearOfSplit(slices[next.si]);
    return y !== undefined && y === yearOfSplit(slices[c.si]) ? { ...next, ids } : next;
  };
  const advance = (c: ZenodoCursor, ids: string | undefined = c.ids): ZenodoCursor | null => {
    const s = slices[c.si];
    if (c.page * ZENODO_PAGE < sliceTotal(s)) return carry({ si: c.si, page: c.page + 1 }, c, ids);
    return c.si + 1 < slices.length ? carry({ si: c.si + 1, page: 1 }, c, ids) : null;
  };
  return {
    initial: slices.length > 0 ? { si: 0, page: 1 } : null,
    expected: (c) => Math.max(0, Math.min(ZENODO_PAGE, sliceTotal(slices[c.si]) - (c.page - 1) * ZENODO_PAGE)),
    skip: advance,
    async fetch(c): Promise<PageData<ZenodoCursor>> {
      const s = slices[c.si];
      const json = await getJson(deps, zenodoUrl(slug, c.page, ZENODO_PAGE, 'oldest', s));
      const listed = itemsOf(json);
      const notices: PageData<ZenodoCursor>['notices'] = [];
      // A record already read in another slice of this year (a partial date listed in several months or days) is read once.
      let items = listed.map((l) => l.item);
      let ids: string | undefined;
      let repeats = 0;
      if (yearOfSplit(s) !== undefined) {
        const seen = decodeIds(c.ids);
        const fresh: number[] = [];
        items = [];
        for (const l of listed) {
          if (l.id !== undefined && (hasId(seen, l.id) || fresh.includes(l.id))) repeats += 1;
          else {
            items.push(l.item);
            if (l.id !== undefined) fresh.push(l.id);
          }
        }
        ids = encodeIds(addIds(seen, fresh));
      }
      let next = advance(c, ids);
      // The slice ended earlier than its count said (records deleted meanwhile): go to the next slice.
      if (listed.length === 0 && next && next.si === c.si) next = carry(c.si + 1 < slices.length ? { si: c.si + 1, page: 1 } : null, c, ids);
      if (s.capped && c.page * ZENODO_PAGE >= ZENODO_WINDOW) notices.push({ code: 'window-exceeded', params: { from: s.from ?? '', to: s.to ?? '', total: s.total } });
      return { items, next, notices, ...(repeats > 0 ? { counters: { duplicatesInBatch: repeats } } : {}) };
    },
  };
}

/** The sample: pages spread evenly over the community; above the window, over its first 10 000 records (oldest first) and its last 10 000 (most recent first), alternating. */
export function zenodoSamplePager(deps: Deps, slug: string, total: number): Pager<ZenodoCursor> {
  const pages = Math.min(Math.ceil(total / ZENODO_PAGE), ZENODO_WINDOW / ZENODO_PAGE);
  const n = Math.min(ZENODO_SAMPLE_REQUESTS, Math.ceil(total / ZENODO_PAGE));
  const perSort = Math.ceil(n / 2);
  const step = Math.max(1, Math.floor(pages / perSort));
  // cursor.si = request index; the page number follows from it
  const big = total > ZENODO_WINDOW;
  const pageOf = (i: number): number => (big ? Math.min(pages, Math.floor(i / 2) * step + 1) : Math.floor((i * pages) / n) + 1);
  const sortOf = (i: number): 'oldest' | 'mostrecent' => (big && i % 2 === 1 ? 'mostrecent' : 'oldest');
  const after = (c: ZenodoCursor): ZenodoCursor | null => (c.si + 1 < n ? { si: c.si + 1, page: pageOf(c.si + 1) } : null);
  return {
    initial: n > 0 ? { si: 0, page: pageOf(0) } : null,
    expected: () => ZENODO_PAGE,
    skip: after,
    async fetch(c) {
      const json = await getJson(deps, zenodoUrl(slug, c.page, ZENODO_PAGE, sortOf(c.si)));
      return { items: itemsOf(json).map((l) => l.item), next: after(c) };
    },
  };
}
