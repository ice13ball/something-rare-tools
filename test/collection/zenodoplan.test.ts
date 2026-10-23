// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A Zenodo community above the window is cut into slices AS THE RUN GOES: records appear after the first counts, the work list is saved in
// every checkpoint (a closed tab resumes in the middle of its planning), it stays small, and a run saved by the up-front planner still resumes.
import { describe, expect, it } from 'vitest';
import { CollectionRunner } from '../../src/core/collection/runner';
import { makeNetContext, type Net } from '../../src/core/collection/net';
import { estimateZenodo, zenodoPager, type ZenodoCursor, type ZenodoPlan } from '../../src/core/collection/sources/zenodo';
import { memoryStore } from '../../src/core/collection/store';
import type { RunRecord } from '../../src/core/collection/types';
import { json, rec, runnerDeps, virtualClock, zenodoMock, type Rec } from './helpers';
import { mixedCommunity, runCommunity, shortened, summarize, touchingCommunity, type Summary } from './zenodoScenario';

/** What the up-front planner (d453b59) gave on exactly these communities (its own run, same mock): the incremental planner must give the same. */
const REF_MIXED: Summary = {
  status: 'finished',
  records: 12457,
  states: { checked: 12457, unreachable: 0, throttled: 0, 'unsupported-profile': 0, 'not-in-datacite': 0 },
  rules: { 'META-NO-VERSION': 12457, 'META-NO-EXTENT': 12457, 'LIC-MISSING': 1040 },
  withFindings: 12457,
  duplicates: 0,
  notices: ['records-missing', 'zenodo-slice-short'],
  csvRows: 25954,
  csvSha: 'ed318081bf9ce07f',
};
const REF_TOUCHING: Summary = {
  status: 'finished',
  records: 10450,
  states: { checked: 10450, unreachable: 0, throttled: 0, 'unsupported-profile': 0, 'not-in-datacite': 0 },
  rules: { 'META-NO-VERSION': 10450, 'META-NO-EXTENT': 10450 },
  withFindings: 10450,
  duplicates: 330,
  notices: ['slices-differ'],
  csvRows: 20900,
  csvSha: '94f7e05d4d3b3cca',
};
/** The old planner made 70 requests before the first page of records (mixed) and 573 in all; the planning is the same work, now spread over the run. */
const OLD_FIRST_PAGE = 70;
const REQUESTS_MIXED = 573;

const q = (url: string): string => new URL(url).searchParams.get('q') ?? '';
const param = (url: string, name: string): string | null => new URL(url).searchParams.get(name);
const isPage = (url: string): boolean => param(url, 'size') === '25';

describe('the same results as the up-front planner', () => {
  it('a year and a month above the window, partial dates (remainders), a short slice: identical counts, notices and fix list', async () => {
    const out = await runCommunity(mixedCommunity(), { within: true, short: true });
    expect(out.summary).toEqual(REF_MIXED);
    expect(out.requests).toBe(REQUESTS_MIXED);
  }, 120_000);

  it('records are asked for after the first counts, not after the whole plan', async () => {
    const out = await runCommunity(mixedCommunity(), { within: true, short: true });
    expect(out.firstPage).toBeLessThanOrEqual(3); // the total, the count before the first year, the first page
    expect(OLD_FIRST_PAGE).toBeGreaterThan(out.firstPage * 10);
  }, 120_000);

  it('partial dates listed in several slices: repeats counted and dropped, the same fix list', async () => {
    const out = await runCommunity(touchingCommunity(), { within: false, short: false });
    expect(out.summary).toEqual(REF_TOUCHING);
  }, 120_000);
});

describe('a run closed or stopped in the middle of its planning goes on with identical results', () => {
  interface Cut {
    name: string;
    when: (url: string) => boolean;
    /** `done` = the request that cut the run was answered and its step saved (a stop) or lost (a closed tab). */
    saved: (c: ZenodoCursor, done: boolean) => void;
  }
  const cuts: Cut[] = [
    {
      name: 'while the days of March 2019 (a month above the window) are being counted',
      when: (u) => param(u, 'size') === '1' && q(u).startsWith('publication_date:[2019-03-05 TO 2019-03-05]'),
      saved: (c) => {
        expect(c.split?.parent).toMatchObject({ from: '2019-03-01', to: '2019-03-31' });
        const counted = c.split!.parts.filter((p) => p.total !== undefined).length;
        expect(counted).toBeGreaterThan(0);
        expect(counted).toBeLessThan(c.split!.parts.length);
      },
    },
    {
      name: 'in the middle of a slice (page 3 of 2020)',
      when: (u) => isPage(u) && param(u, 'page') === '3' && q(u).startsWith('publication_date:[2020-01-01 TO 2020-12-31]'),
      saved: (c, done) => {
        expect(c.cur).toMatchObject({ from: '2020-01-01', total: 1700 });
        expect(c.page).toBe(done ? 4 : 3);
        expect(c.got).toBe(done ? 75 : 50);
      },
    },
    {
      name: 'inside a remainder slice (the year 2019 minus its months)',
      when: (u) => isPage(u) && param(u, 'page') === '1' && q(u).startsWith('publication_date:[2019-01-01 TO 2019-12-31] AND NOT'),
      saved: (c, done) => {
        expect(c.cur?.except).toHaveLength(12);
        expect(c.cur?.total).toBe(40);
        expect(c.page).toBe(done ? 2 : 1);
      },
    },
  ];

  for (const cut of cuts) {
    for (const mode of ['stop', 'closed tab'] as const) {
      it(`${cut.name} (${mode})`, async () => {
        const clock = virtualClock();
        const z = zenodoMock(mixedCommunity(), clock, { within: true });
        const inner = shortened(z.net);
        const deps = runnerDeps(inner, clock, { year: () => 2022 });
        let first: CollectionRunner | undefined;
        let requests = 0;
        let snapshot: { run: RunRecord; parts: Blob[] } | undefined;
        let fired = false;
        const net: Net = {
          ...inner,
          get: async (url, a) => {
            const out = await inner.get(url, a);
            requests += 1;
            if (!fired && cut.when(url)) {
              fired = true;
              if (mode === 'stop') void first!.stop(); // the request in flight completes, the run is saved and ends
              else {
                // a closed tab: only what the last checkpoint wrote survives (the request in flight is lost)
                const run = (await deps.store.load())!;
                snapshot = { run, parts: await deps.store.parts(run.id, run.partCount) };
                requests -= 1;
                void first!.stop();
              }
            }
            return out;
          },
        };
        first = new CollectionRunner({ ...deps, net });
        await first.start({ spec: { kind: 'zenodo', community: 'mixed' }, lang: 'en', sample: false });
        await first.whenIdle();
        expect(fired).toBe(true);
        let store = deps.store;
        if (snapshot) {
          store = memoryStore();
          await store.save(snapshot.run, snapshot.parts.map((blob, index) => ({ index, blob })));
        }
        const saved = (await store.load())!;
        cut.saved(saved.cursor as ZenodoCursor, mode === 'stop');
        expect(['stopped', 'running']).toContain(saved.status);
        const second = new CollectionRunner({ ...deps, store, net: { ...inner, get: async (url, a) => ((requests += 1), inner.get(url, a)) } });
        await second.saved();
        await second.resume();
        await second.whenIdle();
        expect(await summarize(second)).toEqual(REF_MIXED);
        // nothing was planned twice: the request that was in flight when the tab closed is the only one that may repeat
        expect(requests).toBeLessThanOrEqual(REQUESTS_MIXED + 1);
        expect(requests).toBeGreaterThanOrEqual(REQUESTS_MIXED);
      }, 120_000);
    }
  }
});

describe('a count that fails while the run is planning', () => {
  it('interrupts the run (resumable) and resumes at the same step; a page that fails is deferred with a small saved entry', async () => {
    const clock = virtualClock();
    const recs: Rec[] = [];
    for (let i = 0; i < 6000; i++) recs.push(rec(i + 1, `2020-0${(i % 9) + 1}-10`));
    for (let i = 0; i < 5200; i++) recs.push(rec(6001 + i, `2021-0${(i % 9) + 1}-10`));
    const z = zenodoMock(recs, clock);
    let open = false;
    const net: Net = {
      ...z.net,
      get: async (url, a) => {
        if (!open && param(url, 'size') === '1' && q(url).startsWith('publication_date:[2021-01-01 TO 2021-12-31]')) return json({ message: 'queue full' }, { status: 503 });
        if (!open && isPage(url) && param(url, 'page') === '4' && q(url).startsWith('publication_date:[2020')) return json({ message: 'queue full' }, { status: 503 });
        return z.net.get(url, a);
      },
    };
    const deps = runnerDeps(net, clock, { year: () => 2022 });
    const r = new CollectionRunner(deps);
    await r.start({ spec: { kind: 'zenodo', community: 'x' }, lang: 'en', sample: false });
    await r.whenIdle();
    let p = r.progress();
    expect(p.status).toBe('interrupted');
    expect(p.resumable).toBe(true);
    const saved = (await deps.store.load())!;
    const deferred = saved.deferred.map((d) => d.cursor as ZenodoCursor);
    expect(deferred.some((c) => c.cur && c.work === undefined)).toBe(true); // a deferred page keeps its slice and page, not the work list
    expect(saved.deferred.some((d) => d.blocking)).toBe(true); // the failed count: only its own answer says where to go on
    open = true;
    await r.resume();
    await r.whenIdle();
    p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.records).toBe(11_200);
    expect(p.counts.states.checked).toBe(11_200);
    expect(p.deferred).toBe(0);
    expect(p.notices.map((n) => n.code)).not.toContain('slices-differ');
  }, 120_000);
});

describe('a run saved by the up-front planner (whole plan in the record)', () => {
  it('goes on from its saved slice and position to the end: same results, no slice counted again', async () => {
    const recs: Rec[] = [];
    for (let i = 0; i < 100; i++) recs.push(rec(i + 1, '2019-02-02'));
    for (let i = 0; i < 6000; i++) recs.push(rec(101 + i, `2020-0${(i % 9) + 1}-10`));
    for (let i = 0; i < 5000; i++) recs.push(rec(6101 + i, `2021-0${(i % 9) + 1}-10`, i % 7 === 0 ? null : 'cc-by-4.0'));
    const spec = { kind: 'zenodo', community: 'old-run' } as const;

    const clock0 = virtualClock();
    const z0 = zenodoMock(recs, clock0);
    const whole = new CollectionRunner(runnerDeps(z0.net, clock0, { year: () => 2022 }));
    await whole.start({ spec, lang: 'en', sample: false });
    await whole.whenIdle();
    const expected = await summarize(whole);
    expect(expected.records).toBe(11_100);

    // the same run, stopped in the middle of 2021 ...
    const clock = virtualClock();
    const z = zenodoMock(recs, clock);
    const deps = runnerDeps(z.net, clock, { year: () => 2022 });
    let r: CollectionRunner | undefined;
    const net: Net = { ...z.net, get: async (url, a) => (isPage(url) && param(url, 'page') === '3' && q(url).startsWith('publication_date:[2021') ? (void r!.stop(), z.net.get(url, a)) : z.net.get(url, a)) };
    r = new CollectionRunner({ ...deps, net });
    await r.start({ spec, lang: 'en', sample: false });
    await r.whenIdle();
    const run = (await deps.store.load())!;
    const c = run.cursor as ZenodoCursor;
    expect(c.cur).toMatchObject({ from: '2021-01-01', total: 5000 });
    // ... and its record rewritten in the shape of a run saved before the planning became incremental: the whole plan, the cursor an index into it
    const slices = [
      { from: '2019-01-01', to: '2019-12-31', total: 100 },
      { from: '2020-01-01', to: '2020-12-31', total: 6000 },
      { from: '2021-01-01', to: '2021-12-31', total: 5000 },
    ];
    const old: RunRecord = { ...run, plan: { slug: 'old-run', total: 11_100, slices, sum: 11_100 }, cursor: { si: 2, page: c.page, got: c.got } };
    await deps.store.save(old);

    z.log.length = 0;
    const resumed = new CollectionRunner({ ...deps, net: z.net });
    const saved = await resumed.saved();
    expect(saved?.status).toBe('stopped');
    await resumed.resume();
    await resumed.whenIdle();
    expect(await summarize(resumed)).toEqual(expected);
    expect(z.log.filter((l) => param(l.url, 'size') === '1')).toHaveLength(0); // the old plan is read, not made again
    expect(z.log.every((l) => /publication_date%3A%5B2021/.test(l.url))).toBe(true); // and no earlier slice is read again
    expect(resumed.progress().notices.map((n) => n.code)).not.toContain('slices-differ');
  }, 120_000);

  it('a cursor of the old shape that waits in the deferred list is read again with its saved plan', async () => {
    const clock = virtualClock();
    const recs: Rec[] = Array.from({ length: 60 }, (_, i) => rec(i + 1, '2020-05-05'));
    const z = zenodoMock(recs, clock);
    const plan: ZenodoPlan = { slug: 'x', total: 60, slices: [{ from: '2020-01-01', to: '2020-12-31', total: 60 }], sum: 60 };
    const nctx = makeNetContext(clock, { requests: 0, retries: 0, throttleEvents: 0 });
    const pager = zenodoPager({ net: z.net, nctx }, plan);
    expect(pager.expected({ si: 0, page: 3 })).toBe(10);
    expect(pager.skip({ si: 0, page: 2, got: 25 })).toMatchObject({ page: 3, got: 50 });
    const d = await pager.fetch({ si: 0, page: 3, got: 50 });
    expect(d.items).toHaveLength(10);
    expect(d.next).toBeNull(); // the plan has nothing after this slice, and its sum was checked when the old run began
    expect(d.notices ?? []).toEqual([]);
  });
});

describe('the work list stays small however large the community is', () => {
  /**
   * A community of 2 090 000 records (as biosyslit): 2008 to 2025, every day of those years holds 400 records. Counts are computed, pages
   * are synthetic: nothing here is proportional to the size of the community.
   */
  const DAY = 400;
  const dayCount = (d: Date): number => (d.getUTCFullYear() >= 2008 && d.getUTCFullYear() <= 2025 ? DAY : 0);
  const inRange = (from: string, to: string): number => {
    const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
    const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
    let n = 0;
    for (let t = Math.max(a, Date.UTC(2008, 0, 1)); t <= Math.min(b, Date.UTC(2025, 11, 31)); t += 86_400_000) n += dayCount(new Date(t));
    return n;
  };
  const huge: Net = {
    csw: async () => json({}),
    get: async (url) => {
      const m = /publication_date:\[(\S+) TO (\S+)\]/.exec(q(url));
      const from = m && m[1] !== '*' ? m[1] : '1900-01-01';
      const to = m && m[2] !== '*' ? m[2] : '2100-12-31';
      const total = inRange(from, to);
      const size = Number(param(url, 'size'));
      const page = Number(param(url, 'page'));
      const hits = Array.from({ length: Math.max(0, Math.min(size, total - (page - 1) * size)) }, (_, i) => ({
        id: Number(from.replace(/-/g, '')) * 1000 + (page - 1) * 25 + i,
        doi: `10.5281/zenodo.${Number(from.replace(/-/g, '')) * 1000 + (page - 1) * 25 + i}`,
        metadata: { publication_date: from, title: 'T', license: { id: 'cc-by-4.0' } },
      }));
      return json({ hits: { total, hits } });
    },
  };

  it('holds the years left, one level of months and days: tens of entries, a cursor of a few kilobytes, whatever the total', async () => {
    const clock = virtualClock();
    const plan: ZenodoPlan = { slug: 'huge', total: 2_090_000, thisYear: 2026 };
    const nctx = makeNetContext(clock, { requests: 0, retries: 0, throttleEvents: 0 });
    let c: ZenodoCursor | null = zenodoPager({ net: huge, nctx }, plan).initial;
    expect(c?.work).toHaveLength(29); // before 2000, 2000..2026, after 2026
    let maxWork = 0;
    let maxBytes = 0;
    let steps = 0;
    let records = 0;
    let firstRecords = 0;
    let pagesAsked = 0;
    while (c && steps < 4000) {
      const d = await zenodoPager({ net: huge, nctx }, plan).fetch(JSON.parse(JSON.stringify(c)));
      steps += 1;
      records += d.items.length;
      if (d.items.length > 0) pagesAsked += 1;
      if (records > 0 && firstRecords === 0) firstRecords = steps;
      c = d.next;
      if (c) {
        maxWork = Math.max(maxWork, (c.work?.length ?? 0) + (c.split?.parts.length ?? 0));
        maxBytes = Math.max(maxBytes, JSON.stringify(c).length - (c.ids ?? '').length);
      }
    }
    expect(steps).toBe(4000); // 2008-01 is read, and the walk goes on into 2008-02 and further: far from done
    expect(records).toBeGreaterThan(60_000);
    expect(firstRecords).toBeLessThan(60); // the empty years, the twelve months of 2008, the 31 days of January, then the first records (the worst case: every month is above the window)
    expect(pagesAsked).toBeGreaterThan(2000);
    expect(maxWork).toBeLessThanOrEqual(80); // 27 years + 12 months + 31 days + 3 remainders and open ends
    expect(maxBytes).toBeLessThan(12_000);
  }, 180_000);
});

describe('the estimate', () => {
  it('a small community: no planning, no sample advice', () => {
    const e = estimateZenodo(686, false);
    expect(e).toMatchObject({ records: 686, requests: 28, strategy: 'cursor', slices: 1 });
    expect(e.sampleFirst).toBeUndefined();
    expect(e.approximate).toBeUndefined();
  });

  it('a community of 2 million: requests = pages + a rough planning estimate, the time in days, the quick sample advised', () => {
    const e = estimateZenodo(2_090_000, false);
    expect(e.records).toBe(2_090_000);
    expect(e.requests).toBeGreaterThan(Math.ceil(2_090_000 / 25));
    expect(e.requests).toBeLessThan(Math.ceil(2_090_000 / 25) + 3000);
    expect(e.approximate).toBe(true);
    expect(e.sampleFirst).toBe(true);
    expect(e.seconds / 86_400).toBeGreaterThan(2);
    expect(estimateZenodo(50_000, false).sampleFirst).toBeUndefined();
    expect(estimateZenodo(50_001, false).sampleFirst).toBe(true);
  });
});
