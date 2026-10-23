// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A Zenodo community (/api/communities/{slug}/records: /api/records?communities= ignores an unknown slug and returns all 7.5 M records).
// Guests get 25 records a page, 30 requests a minute, and a window of size x page <= 10 000: a community above that is split by
// publication date (open-ended year slices, months inside a year above the window, days inside a month) and each slice is paged.
// The slices are counted AS THE RUN GOES (a work list in the cursor), so records appear at once and a closed tab resumes mid-planning.
import { parseZenodoRecord } from '../../metadata/zenodo';
import { request } from '../net';
import { SourceFailure, type Estimate, type Item, type PageData, type Pager } from '../types';
import { UNREADABLE_RECORD, type Deps } from './datacite';
import { addIds, decodeIds, encodeIds, hasId, idOf } from './idset';

export const ZENODO_HOST = 'zenodo.org';
export const ZENODO_PAGE = 25;
/** size x page <= 10 000; a slice at or below this is paged directly. */
export const ZENODO_WINDOW = 10_000;
export const ZENODO_SAMPLE_REQUESTS = 28;
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

/** Above this many records the estimate recommends the quick sample before a full run. */
export const ZENODO_SAMPLE_FIRST = 50_000;
/** Seconds per request used for the time: the 2.1 s pace plus the time an answer takes. */
const SECONDS_PER_REQUEST = 2.6;

export function estimateZenodo(total: number, sample: boolean): Estimate {
  if (sample) {
    const pages = Math.ceil(total / ZENODO_PAGE);
    const requests = Math.min(ZENODO_SAMPLE_REQUESTS, pages);
    return { records: Math.min(total, requests * ZENODO_PAGE), requests, extraRequests: 0, seconds: requests * SECONDS_PER_REQUEST, strategy: 'spread-pages', sample: true, empty: total === 0 };
  }
  const slices = Math.max(1, Math.ceil(total / ZENODO_WINDOW));
  const split = total > ZENODO_WINDOW;
  // The slices are counted as the run goes: one count per year (about 30), twelve per year above the window, up to 31 per month above it.
  // How the records fall over the dates is not known before: about five counts per window of records is the honest middle, and it is said to be rough.
  const planning = split ? 30 + 5 * slices : 0;
  const requests = Math.ceil(total / ZENODO_PAGE) + planning;
  return {
    records: total,
    requests,
    extraRequests: 0,
    seconds: requests * SECONDS_PER_REQUEST,
    strategy: split ? 'date-split' : 'cursor',
    slices,
    ...(split ? { approximate: true } : {}),
    ...(total > ZENODO_SAMPLE_FIRST ? { sampleFirst: true } : {}),
    sample: false,
    empty: total === 0,
  };
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
    // nothing older than the first year slice can be cut by year: it would come back as the same slice
    if (y1 === undefined && lo > hi) return [];
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

/** A slice in the work list: counted (`total` known) or not yet (one count request when the run reaches it). */
export type Pending = Omit<Slice, 'total'> & { total?: number };

/** More than this many slices waiting at once means the splitting is not converging: the run stops instead of growing without bound. */
const MAX_WORK = 500;

/**
 * What a run saves about a Zenodo community above the window: nothing is planned up front. `thisYear` fixes the open-ended slice after
 * the last year. A run saved before the slices were planned lazily carries `slices` (every slice counted, in order) and `sum`: it is
 * read to its end from that list (see `upgrade`).
 */
export interface ZenodoPlan {
  slug: string;
  total: number;
  thisYear?: number;
  /** Legacy (a run saved with the whole plan made up front). */
  slices?: Slice[];
  /** Legacy: records those slices add up to. */
  sum?: number;
}

export interface ZenodoCursor {
  /** Page of the slice being listed (1 outside listing). */
  page: number;
  /** The slice being listed (its count is known and fits the window, or it is capped). Absent while the run is planning. */
  cur?: Slice;
  /**
   * Slices still to be reached, in chronological order, the next one first: the open-ended slice before the first year, one per year, the
   * open-ended slice after. A slice that is above the window is replaced here by its finer slices (and a remainder) when the run reaches
   * it. Holds the years left plus one level of months and days: tens of entries, never the whole plan of a huge community.
   */
  work?: Pending[];
  /** A slice above the window whose month (or day) counts are being collected, one request per step; resolved into `work` when all are in. */
  split?: { parent: Slice; parts: Pending[] };
  /** Records the listed slices announced so far (capped slices count as the window): compared with the community's total when the run ends. */
  sum?: number;
  /** Sort order of this slice's pages (a sample alternates). */
  sort?: 'oldest' | 'mostrecent';
  /** Records listed (or skipped as a deferred page) in this slice before this page: the slice is compared with its own announced total when it ends. Absent in a run saved before this existed. */
  got?: number;
  /**
   * Record ids already read in the slices of year `yr` that were split below year level (see yearOfSplit), sorted, as base64 (idset.ts);
   * absent outside such slices. Saved with the cursor, so a resumed run drops the same repeats an uninterrupted one does.
   */
  ids?: string;
  yr?: string;
  /** Legacy: index into the plan's slices (a cursor saved by the up-front planner). */
  si?: number;
}

/**
 * The year whose split slices (a month or a day, not the whole year) this slice belongs to; undefined for any other slice. Only these can
 * overlap one another: Zenodo accepts partial publication dates ("2021", "2021-05"), and an index that stores those as ranges may list a
 * record in several month or day slices. Slices of different years are never compared, so the ids can be dropped at every year's end.
 */
export function yearOfSplit(s: Pending): string | undefined {
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
    try {
      const rec = parseZenodoRecord(h, `Zenodo ${id}`);
      return { item: { ref: (rec.doi ?? `zenodo.${id}`).toLowerCase(), state: 'checked' as const, records: [rec] }, id: idOf(h.id) };
    } catch {
      // One record that cannot be parsed is a record that was not read; the run goes on.
      return { item: { ref: (typeof h.doi === 'string' && h.doi ? h.doi : `zenodo.${id}`).toLowerCase(), state: 'unsupported-profile' as const, records: [], reason: UNREADABLE_RECORD }, id: idOf(h.id) };
    }
  });
}

const cursor = (c: Partial<ZenodoCursor>): ZenodoCursor => {
  const out: Record<string, unknown> = { page: 1 };
  for (const [k, v] of Object.entries(c)) if (v !== undefined) out[k] = v;
  return out as unknown as ZenodoCursor;
};

/** The first work list of a community above the window: before the first year, every year up to this one, after this one. */
export function initialWork(thisYear: number): Pending[] {
  const work: Pending[] = [{ to: `${FIRST_YEAR - 1}-12-31` }];
  for (let y = FIRST_YEAR; y <= thisYear; y++) work.push({ from: `${y}-01-01`, to: `${y}-12-31` });
  work.push({ from: `${thisYear + 1}-01-01` });
  return work;
}

/**
 * A saved cursor of the up-front planner (`si` = index into the plan's slices) in the shape of this one: the slice it was listing, and the
 * slices after it (all counted) as the work list. Cursors of this shape are left alone.
 */
function upgrade(c: ZenodoCursor, plan: ZenodoPlan): ZenodoCursor {
  if (typeof c.si !== 'number' || !plan.slices) return c;
  const cur = plan.slices[c.si];
  if (!cur) return cursor({ page: 1, work: [] });
  return cursor({ page: c.page, cur, work: plan.slices.slice(c.si + 1), ...(c.sort ? { sort: c.sort } : {}), ...(c.got !== undefined ? { got: c.got } : {}), ...(c.ids !== undefined ? { ids: c.ids, yr: yearOfSplit(cur) } : {}) });
}

/**
 * The Zenodo community above the window, planned AS THE RUN GOES. The cursor carries the work list, so every checkpoint saves the plan
 * and the position together. Each step is one request at most: counting a slice, counting one of the finer slices of a slice that is
 * above the window, or listing a page. A slice that fits is listed at once; a slice above the window is split when the run reaches it.
 * Where a year is cut into months (or a month into days) the children can add up to less than the parent, because a record dated only
 * "2010" or "2010-08" matches the parent's range but none of the children's: what is missing is read as a REMAINDER slice (the parent's
 * range minus the children's; the parent's count minus the children's counts).
 */
export function zenodoPager(deps: Deps, plan: ZenodoPlan): Pager<ZenodoCursor> {
  const { slug } = plan;
  const thisYear = plan.thisYear ?? new Date().getUTCFullYear();
  const sliceTotal = (s: Slice): number => Math.min(s.total, ZENODO_WINDOW);
  const initial = (): ZenodoCursor | null => {
    if (plan.total === 0) return null;
    if (plan.slices) return plan.slices.length > 0 ? cursor({ page: 1, si: 0 }) : null;
    if (plan.total <= ZENODO_WINDOW) return cursor({ page: 1, cur: { total: plan.total }, work: [], sum: plan.total });
    return cursor({ page: 1, work: initialWork(thisYear), sum: 0 });
  };
  const final = (c: ZenodoCursor): PageData<ZenodoCursor>['notices'] => (c.sum !== undefined && c.sum !== plan.total ? [{ code: 'slices-differ', params: { sum: c.sum, total: plan.total } }] : []);
  /** What follows a slice that ended: the next one to count, or the end of the run (with the check of what the slices added up to). */
  const after = (c: ZenodoCursor, ids: string | undefined): { next: ZenodoCursor | null; notices: NonNullable<PageData<ZenodoCursor>['notices']> } => {
    const work = c.work ?? [];
    if (work.length === 0) return { next: null, notices: final(c) ?? [] };
    const y = work[0].from?.slice(0, 4);
    const keep = ids !== undefined && y !== undefined && y === c.yr && work[0].to?.slice(0, 4) === y;
    return { next: cursor({ page: 1, work, sum: c.sum, ...(keep ? { ids, yr: c.yr } : {}) }), notices: [] };
  };
  const advance = (c: ZenodoCursor, ids: string | undefined = c.ids, got: number | undefined = c.got): { next: ZenodoCursor | null; notices: NonNullable<PageData<ZenodoCursor>['notices']> } => {
    const s = c.cur!;
    if (c.page * ZENODO_PAGE < sliceTotal(s)) return { next: cursor({ ...c, page: c.page + 1, got, ids, yr: ids !== undefined ? c.yr : undefined }), notices: [] };
    return after(c, ids);
  };
  /** Records of the slice before this page (0 on its first page); unknown (undefined) for a cursor saved without the count. */
  const before = (c: ZenodoCursor): number | undefined => (c.page === 1 ? 0 : c.got);
  const expectedOf = (c: ZenodoCursor): number => (c.cur ? Math.max(0, Math.min(ZENODO_PAGE, sliceTotal(c.cur) - (c.page - 1) * ZENODO_PAGE)) : 0);
  const listing = (c: ZenodoCursor, slice: Slice, rest: Pending[]): ZenodoCursor => {
    const y = yearOfSplit(slice);
    return cursor({ page: 1, cur: slice, work: rest, ...(c.sum !== undefined ? { sum: c.sum + sliceTotal(slice) } : {}), ...(y !== undefined && c.ids !== undefined && c.yr === y ? { ids: c.ids, yr: y } : {}) });
  };
  const step = (next: ZenodoCursor | null, notices: PageData<ZenodoCursor>['notices'] = []): PageData<ZenodoCursor> => ({ items: [], next, notices });
  const guard = (work: Pending[]): void => {
    if (work.length > MAX_WORK) throw new SourceFailure('protocol', 'too-many-slices');
  };

  /** The finer slices of a split slice are all counted: they go in front of the work list, followed by the remainder. */
  const resolve = (c: ZenodoCursor, parent: Slice, parts: Pending[]): PageData<ZenodoCursor> => {
    const childSum = parts.reduce((a, p) => a + (p.total ?? 0), 0);
    const out: Pending[] = parts.filter((p) => (p.total ?? 0) > 0);
    const rest = parent.total - childSum;
    if (rest > 0 && splitsWithinYear(parent)) {
      // Not splittable further (what is left has no date to cut by): above the window it is capped, and the run says so.
      const except = parts.map((p) => ({ from: p.from!, to: p.to! }));
      out.push({ from: parent.from, to: parent.to, except, total: rest, ...(rest > ZENODO_WINDOW ? { capped: true } : {}) });
    }
    const work = [...out, ...(c.work ?? [])];
    guard(work);
    return step(cursor({ page: 1, work, sum: c.sum, ids: c.ids, yr: c.yr }));
  };

  /** One planning step: count the next slice, decide what to do with it, or count the next finer slice of a split. */
  async function plan1(c: ZenodoCursor): Promise<PageData<ZenodoCursor>> {
    if (c.split) {
      const { parent, parts } = c.split;
      const i = parts.findIndex((p) => p.total === undefined);
      if (i < 0) return resolve({ ...c, split: undefined }, parent, parts);
      const n = await zenodoTotal(deps, slug, parts[i]);
      const counted = parts.map((p, k) => (k === i ? { ...p, total: n } : p));
      if (counted.some((p) => p.total === undefined)) return step(cursor({ ...c, split: { parent, parts: counted } }));
      return resolve({ ...c, split: undefined }, parent, counted);
    }
    const work = c.work ?? [];
    if (work.length === 0) return step(null, final(c));
    const [first, ...rest] = work;
    const n = first.total ?? (await zenodoTotal(deps, slug, first));
    if (n === 0) return step(cursor({ ...c, work: rest }));
    const w: Slice = { ...first, total: n };
    if (n <= ZENODO_WINDOW || w.capped) return step(listing(c, w, rest));
    const parts = finer(w, thisYear);
    if (parts.length === 0) return step(listing(c, { ...w, capped: true }, rest));
    if (splitsWithinYear(w)) return step(cursor({ ...c, work: rest, split: { parent: w, parts } }));
    // several years or an open end: one slice per year, each counted when the run reaches it (no remainder: the children cover the range)
    const next = [...parts, ...rest];
    guard(next);
    return step(cursor({ ...c, work: next }));
  }

  return {
    initial: initial(),
    expected: (c) => expectedOf(upgrade(c, plan)),
    // a page left for later is counted as expected, so it is not also reported as missing when the slice ends
    skip: (raw) => {
      const c = upgrade(raw, plan);
      if (!c.cur) return null; // a planning step: only its answer says where to go on
      return advance(c, c.ids, before(c) === undefined ? undefined : (before(c) ?? 0) + expectedOf(c)).next;
    },
    // a deferred page is read again on its own: the work list stays out of the saved entry (up to 200 of them)
    retryCursor: (raw) => {
      const c = upgrade(raw, plan);
      return c.cur ? cursor({ page: c.page, cur: c.cur, ...(c.got !== undefined ? { got: c.got } : {}), ...(c.ids !== undefined ? { ids: c.ids, yr: c.yr } : {}) }) : raw;
    },
    async fetch(raw): Promise<PageData<ZenodoCursor>> {
      const c = upgrade(raw, plan);
      if (!c.cur) return plan1(c);
      const s = c.cur;
      const json = await getJson(deps, zenodoUrl(slug, c.page, ZENODO_PAGE, 'oldest', s));
      const listed = itemsOf(json);
      const notices: NonNullable<PageData<ZenodoCursor>['notices']> = [];
      // A record already read in another slice of this year (a partial date listed in several months or days) is read once.
      let items = listed.map((l) => l.item);
      let ids: string | undefined;
      let repeats = 0;
      const y = yearOfSplit(s);
      if (y !== undefined) {
        const seen = decodeIds(c.yr === y ? c.ids : undefined);
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
      const b = before(c);
      const got = b === undefined ? undefined : b + listed.length;
      const withIds = { ...c, ...(ids !== undefined ? { yr: y } : {}) };
      let { next, notices: end } = advance(withIds, ids, got);
      // The slice ended earlier than its count said (records deleted meanwhile, or an empty page in the middle): go to the next slice.
      if (listed.length === 0 && next && next.cur === s) ({ next, notices: end } = after(withIds, ids));
      notices.push(...end);
      // ... and say so: the records it announced and did not deliver are not part of the run, and the run is not complete.
      let shortfall = 0;
      const ended = next === null || next.cur !== s;
      if (ended && got !== undefined && got < sliceTotal(s)) {
        shortfall = sliceTotal(s) - got;
        notices.push({ code: 'zenodo-slice-short', params: { from: s.from ?? '…', to: s.to ?? '…', total: sliceTotal(s), seen: got } });
      }
      if (s.capped && c.page * ZENODO_PAGE >= ZENODO_WINDOW) notices.push({ code: 'window-exceeded', params: { from: s.from ?? '', to: s.to ?? '', total: s.total } });
      return { items, next, notices, ...(shortfall > 0 ? { shortfall } : {}), ...(repeats > 0 ? { counters: { duplicatesInBatch: repeats } } : {}) };
    },
  };
}

/** The sample: pages spread evenly over the community; above the window, over its first 10 000 records (oldest first) and its last 10 000 (most recent first), alternating. */
/** The sample's cursor: the request index and the page it asks for. */
export interface SampleCursor {
  si: number;
  page: number;
}

export function zenodoSamplePager(deps: Deps, slug: string, total: number): Pager<SampleCursor> {
  const pages = Math.min(Math.ceil(total / ZENODO_PAGE), ZENODO_WINDOW / ZENODO_PAGE);
  const n = Math.min(ZENODO_SAMPLE_REQUESTS, Math.ceil(total / ZENODO_PAGE));
  const perSort = Math.ceil(n / 2);
  const step = Math.max(1, Math.floor(pages / perSort));
  // cursor.si = request index; the page number follows from it
  const big = total > ZENODO_WINDOW;
  const pageOf = (i: number): number => (big ? Math.min(pages, Math.floor(i / 2) * step + 1) : Math.floor((i * pages) / n) + 1);
  const sortOf = (i: number): 'oldest' | 'mostrecent' => (big && i % 2 === 1 ? 'mostrecent' : 'oldest');
  const after = (c: SampleCursor): SampleCursor | null => (c.si + 1 < n ? { si: c.si + 1, page: pageOf(c.si + 1) } : null);
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
