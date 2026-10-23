// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { CollectionRunner } from '../../src/core/collection/runner';
import { PACE_MS, type Net, type NetResponse } from '../../src/core/collection/net';
import { yearOfSplit, zenodoPager, zenodoUrl, ZENODO_WINDOW } from '../../src/core/collection/sources/zenodo';
import type { ZenodoPlan } from '../../src/core/collection/sources/zenodo';
import { makeNetContext } from '../../src/core/collection/net';
import { rec, res, runnerDeps, virtualClock, zenodoMock, type Rec } from './helpers';

const small = (n: number): Rec[] => Array.from({ length: n }, (_, i) => rec(i + 1, `2021-0${(i % 9) + 1}-15`, i % 4 === 0 ? null : 'cc-by-4.0'));

describe('Zenodo community', () => {
  it('uses the community endpoint (never /api/records?communities=), 25 a page, and stays under 30 requests a minute', async () => {
    const clock = virtualClock();
    const z = zenodoMock(small(240), clock);
    const r = new CollectionRunner(runnerDeps(z.net, clock));
    await r.start({ spec: { kind: 'zenodo', community: 'fisheries' }, lang: 'en', sample: false });
    await r.whenIdle();
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.records).toBe(240);
    expect(p.counts.rules['LIC-MISSING']).toBe(60);
    expect(z.log.every((l) => l.url.startsWith('https://zenodo.org/api/communities/fisheries/records?'))).toBe(true);
    expect(z.log.some((l) => l.url.includes('communities='))).toBe(false);
    expect(z.log.every((l) => l.status === 200)).toBe(true); // paced: the 429 was never provoked
    for (let i = 1; i < z.log.length; i++) expect(z.log[i].at - z.log[i - 1].at).toBeGreaterThanOrEqual(PACE_MS['zenodo.org']);
    expect(p.estimate).toMatchObject({ records: 240, strategy: 'cursor' });
  });

  it('an unknown community is not-found (404), not "7.5 million records"', async () => {
    const clock = virtualClock();
    const z = zenodoMock([], clock, { unknown: true });
    const r = new CollectionRunner(runnerDeps(z.net, clock));
    await expect(r.start({ spec: { kind: 'zenodo', community: 'nosuch-community' } as never, lang: 'en', sample: false })).rejects.toMatchObject({ kind: 'not-found' });
    expect(r.progress().status).toBe('failed');
  });

  it('a slug with odd characters never reaches the network', async () => {
    const clock = virtualClock();
    const z = zenodoMock([], clock);
    const r = new CollectionRunner(runnerDeps(z.net, clock));
    await expect(r.start({ spec: { kind: 'zenodo', community: '../records?communities=x' }, lang: 'en', sample: false })).rejects.toMatchObject({ reason: 'bad-id' });
    expect(z.log).toHaveLength(0);
  });

  it('a 429 is waited out with the Retry-After it exposes, and the run goes on', async () => {
    const clock = virtualClock();
    const z = zenodoMock(small(100), clock);
    // another client used up the minute: the first answer is a 429
    let first = true;
    const net: Net = {
      ...z.net,
      get: async (url, a) => {
        if (first && url.includes('size=25')) {
          first = false;
          return res(429, '{"message":"30 per 1 minute"}', { retryAfterMs: 35_000, rateRemaining: 0 });
        }
        return z.net.get(url, a);
      },
    };
    const r = new CollectionRunner(runnerDeps(net, clock));
    await r.start({ spec: { kind: 'zenodo', community: 'fisheries' }, lang: 'en', sample: false });
    await r.whenIdle();
    expect(r.progress().status).toBe('finished');
    expect(r.progress().counts.records).toBe(100);
    expect(clock.sleeps).toContain(35_000);
    expect(r.progress().stats.throttleEvents).toBe(1);
  });

  describe('above the 10 000 window', () => {
    // 2019: 10 400 records on March days 1-20 (a year AND a month above the window), 2020: 1 700, 2021: 300, 1995: 5
    const big: Rec[] = [];
    let id = 1;
    for (let i = 0; i < 10_400; i++) big.push(rec(id++, `2019-03-${String((i % 20) + 1).padStart(2, '0')}`, i % 10 === 0 ? null : 'cc-by-4.0'));
    for (let i = 0; i < 1700; i++) big.push(rec(id++, `2020-0${(i % 9) + 1}-10`));
    for (let i = 0; i < 300; i++) big.push(rec(id++, `2021-06-0${(i % 9) + 1}`));
    for (let i = 0; i < 5; i++) big.push(rec(id++, '1995-01-01'));

    it('splits by publication date until every slice fits, pages each, and reads every record once', async () => {
      const clock = virtualClock();
      const z = zenodoMock(big, clock);
      const r = new CollectionRunner(runnerDeps(z.net, clock));
      await r.start({ spec: { kind: 'zenodo', community: 'big-one' }, lang: 'en', sample: false });
      const plan = (r as unknown as { st: { plan: ZenodoPlan } }).st.plan;
      expect(plan).toEqual({ slug: 'big-one', total: big.length, thisYear: 2026 }); // nothing is planned at the start
      expect(r.progress().estimate).toMatchObject({ strategy: 'date-split', approximate: true });
      expect(r.progress().notices.map((n) => n.code)).toContain('split-by-date');
      await r.whenIdle();
      const p = r.progress();
      expect(p.status).toBe('finished');
      expect(p.counts.records).toBe(big.length);
      expect(p.counts.rules['LIC-MISSING']).toBe(1040);
      expect(z.log.every((l) => l.status === 200)).toBe(true);
      expect(p.notices.map((n) => n.code)).not.toContain('slices-differ');
      expect(z.log.filter((l) => new URL(l.url).searchParams.get('size') === '1').length).toBeGreaterThan(3); // the slices were counted on the way
      // no page beyond the window was ever asked for
      for (const l of z.log) expect(Number(new URL(l.url).searchParams.get('page')) * Number(new URL(l.url).searchParams.get('size'))).toBeLessThanOrEqual(ZENODO_WINDOW);
    }, 60_000);

    it('partial dates indexed as ranges fall into several slices of their year: each record is read once, repeats are counted, and a pager restarted at EVERY page (a resumed run) gives the same result', async () => {
      // 2021: 10 300 dated records over twelve months (a year above the window), plus 30 dated "2021" (a range over the whole year)
      // and 20 dated "2021-03" (a range over March); 2020: 100 ordinary records
      const recs: Rec[] = [];
      let n = 1;
      for (let i = 0; i < 10_300; i++) recs.push(rec(n++, `2021-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`));
      const wholeYear = Array.from({ length: 30 }, () => ({ ...rec(n++, '2021'), span: ['2021-01-01', '2021-12-31'] as [string, string] }));
      const marchOnly = Array.from({ length: 20 }, () => ({ ...rec(n++, '2021-03'), span: ['2021-03-01', '2021-03-31'] as [string, string] }));
      for (let i = 0; i < 100; i++) recs.push(rec(n++, '2020-02-02'));
      const all = [...recs, ...wholeYear, ...marchOnly];

      const clock = virtualClock();
      const z = zenodoMock(all, clock);
      const r = new CollectionRunner(runnerDeps(z.net, clock));
      await r.start({ spec: { kind: 'zenodo', community: 'partial-dates' }, lang: 'en', sample: false });
      await r.whenIdle();
      const p = r.progress();
      expect(p.status).toBe('finished');
      expect(p.counts.records).toBe(all.length); // every record once
      expect(p.counts.states.checked).toBe(all.length);
      expect(p.counts.duplicatesInBatch).toBe(30 * 11 + 0); // "2021": listed in twelve months, kept once; "2021-03" lies in one month only
      const plan = (r as unknown as { st: { plan: ZenodoPlan } }).st.plan;

      // the same community walked by a NEW pager for every page, the cursor going through JSON each time
      const nctx = makeNetContext(clock, { requests: 0, retries: 0, throttleEvents: 0 });
      let c: unknown = zenodoPager({ net: z.net, nctx }, plan).initial;
      const refs: string[] = [];
      let dups = 0;
      let maxIds = 0;
      while (c) {
        const pager = zenodoPager({ net: z.net, nctx }, plan);
        const d = await pager.fetch(JSON.parse(JSON.stringify(c)));
        refs.push(...d.items.map((i) => i.ref));
        dups += d.counters?.duplicatesInBatch ?? 0;
        c = d.next;
        maxIds = Math.max(maxIds, ((c as { ids?: string } | null)?.ids ?? '').length);
        if (c) expect(JSON.stringify(c).length - ((c as { ids?: string }).ids ?? '').length).toBeLessThan(6000); // the work list stays small
      }
      expect(refs).toHaveLength(all.length);
      expect(new Set(refs).size).toBe(all.length);
      expect(dups).toBe(30 * 11);
      expect(maxIds).toBeGreaterThan(0);
    }, 120_000);

    it('a plan saved by the up-front planner is read to its end; the ids live only inside one year\'s split slices: kept from one month to the next, dropped when the year ends, absent in a whole-year slice', async () => {
      const clock = virtualClock();
      const recs = [rec(1, '2021-01-10'), rec(2, '2021-01-11'), { ...rec(3, '2021'), span: ['2021-01-01', '2021-02-28'] as [string, string] }, rec(4, '2021-02-02'), rec(5, '2022-06-06')];
      const z = zenodoMock(recs, clock);
      const plan: ZenodoPlan = {
        slug: 'x',
        total: 5,
        sum: 6,
        slices: [
          { from: '2021-01-01', to: '2021-01-31', total: 3 },
          { from: '2021-02-01', to: '2021-02-28', total: 2 },
          { from: '2022-01-01', to: '2022-12-31', total: 1 },
        ],
      };
      const nctx = makeNetContext(clock, { requests: 0, retries: 0, throttleEvents: 0 });
      const pager = zenodoPager({ net: z.net, nctx }, plan);
      const jan = await pager.fetch({ si: 0, page: 1 }); // a cursor of the old shape (index into the plan)
      expect(jan.items).toHaveLength(3);
      // the slice ended: the next step (nothing asked of Zenodo: February is already counted) starts February, the ids travelling with it
      expect(jan.next).toMatchObject({ page: 1, yr: '2021', work: [{ from: '2021-02-01', total: 2 }, { from: '2022-01-01', total: 1 }] });
      expect(jan.next?.ids).toBeTruthy();
      const startFeb = await pager.fetch(jan.next!);
      expect(startFeb.items).toHaveLength(0);
      expect(startFeb.next).toMatchObject({ page: 1, cur: { from: '2021-02-01', to: '2021-02-28', total: 2 }, yr: '2021' });
      const feb = await pager.fetch(startFeb.next!);
      expect(feb.items).toHaveLength(1); // id 3 was read in January
      expect(feb.counters).toEqual({ duplicatesInBatch: 1 });
      expect(feb.next).toEqual({ page: 1, work: [{ from: '2022-01-01', to: '2022-12-31', total: 1 }] }); // no ids into 2022
      const startY22 = await pager.fetch(feb.next!);
      expect(startY22.next).toMatchObject({ cur: { from: '2022-01-01' } });
      expect(startY22.next?.ids).toBeUndefined();
      const y22 = await pager.fetch(startY22.next!);
      expect(y22.items).toHaveLength(1);
      expect(y22.next).toBeNull();
    });

    describe('partial dates the month and day slices miss (the live index matches a range only for records inside it)', () => {
      const partial = (id: number, date: string, span: [string, string]): Rec => ({ ...rec(id, date), span });
      const build = () => {
        const recs: Rec[] = [];
        let n = 1;
        // 2019: 10 300 dated records over twelve months, plus 40 dated "2019" (in the year's range, in no month's) and 15 dated "2019-03" (inside March: found there)
        for (let i = 0; i < 10_300; i++) recs.push(rec(n++, `2019-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`));
        for (let i = 0; i < 40; i++) recs.push(partial(n++, '2019', ['2019-01-01', '2019-12-31']));
        for (let i = 0; i < 15; i++) recs.push(partial(n++, '2019-03', ['2019-03-01', '2019-03-31']));
        // 2022: May alone holds 10 100 dated records (a month above the window, cut into days), plus 12 dated "2022-05"
        for (let i = 0; i < 10_100; i++) recs.push(rec(n++, `2022-05-${String((i % 27) + 1).padStart(2, '0')}`));
        for (let i = 0; i < 12; i++) recs.push(partial(n++, '2022-05', ['2022-05-01', '2022-05-31']));
        for (let i = 0; i < 50; i++) recs.push(rec(n++, '2020-02-02'));
        return recs;
      };

      it('a remainder slice per split year or month reads exactly those records: the slices add up to the total, nothing is lost or read twice', async () => {
        const all = build();
        const clock = virtualClock();
        const z = zenodoMock(all, clock, { within: true });
        const r = new CollectionRunner(runnerDeps(z.net, clock));
        await r.start({ spec: { kind: 'zenodo', community: 'partial-lost' }, lang: 'en', sample: false });
        const plan = (r as unknown as { st: { plan: ZenodoPlan } }).st.plan;
        expect(plan.total).toBe(all.length);
        await r.whenIdle();
        expect(r.progress().notices.map((n) => n.code)).not.toContain('slices-differ');
        const p = r.progress();
        expect(p.status).toBe('finished');
        expect(p.counts.records).toBe(all.length);
        expect(p.counts.states.checked).toBe(all.length);
        expect(p.counts.duplicatesInBatch ?? 0).toBe(0);
        expect(z.log.every((l) => l.status === 200)).toBe(true);

        // resumed in the middle of a remainder slice: a NEW pager for every page, the cursor through JSON each time
        const nctx = makeNetContext(clock, { requests: 0, retries: 0, throttleEvents: 0 });
        let c: unknown = zenodoPager({ net: z.net, nctx }, plan).initial;
        const refs: string[] = [];
        let inRemainder = 0;
        const rests: { from?: string; to?: string; total: number; except?: unknown[] }[] = [];
        while (c) {
          const cur = JSON.parse(JSON.stringify(c)) as { cur?: { from?: string; to?: string; total: number; except?: unknown[] }; page: number };
          if (cur.cur?.except) {
            inRemainder += 1;
            if (cur.page === 1) rests.push(cur.cur);
          }
          const d = await zenodoPager({ net: z.net, nctx }, plan).fetch(cur as never);
          refs.push(...d.items.map((i) => i.ref));
          c = d.next;
        }
        expect(inRemainder).toBeGreaterThan(1); // 40 records = two pages, each started by a fresh pager
        expect(rests.map((x) => [x.from, x.to, x.total])).toEqual([
          ['2019-01-01', '2019-12-31', 40],
          ['2022-05-01', '2022-05-31', 12],
        ]);
        expect(rests[0].except).toHaveLength(12);
        expect(rests[1].except).toHaveLength(31);
        expect(refs).toHaveLength(all.length);
        expect(new Set(refs).size).toBe(all.length);
      }, 120_000);

      it('a remainder above the window cannot be cut by date: it is capped and the run says so', async () => {
        const clock = virtualClock();
        const recs: Rec[] = [];
        let n = 1;
        for (let i = 0; i < 10_050; i++) recs.push(rec(n++, `2018-${String((i % 12) + 1).padStart(2, '0')}-10`));
        for (let i = 0; i < 10_030; i++) recs.push({ ...rec(n++, '2018'), span: ['2018-01-01', '2018-12-31'] });
        const z = zenodoMock(recs, clock, { within: true });
        const r = new CollectionRunner(runnerDeps(z.net, clock));
        await r.start({ spec: { kind: 'zenodo', community: 'all-partial' }, lang: 'en', sample: false });
        await r.whenIdle();
        const p = r.progress();
        expect(p.counts.records).toBe(10_050 + ZENODO_WINDOW);
        expect(p.notices.map((x) => x.code)).toContain('window-exceeded');
        expect(p.notices).toContainEqual({ code: 'slices-differ', params: { sum: 10_050 + ZENODO_WINDOW, total: 20_080 } });
      }, 120_000);
    });

    it('yearOfSplit: only a month or a day of one year is a split slice', () => {
      expect(yearOfSplit({ from: '2021-03-01', to: '2021-03-31', total: 1 })).toBe('2021');
      expect(yearOfSplit({ from: '2021-03-05', to: '2021-03-05', total: 1 })).toBe('2021');
      expect(yearOfSplit({ from: '2021-01-01', to: '2021-12-31', total: 1 })).toBeUndefined();
      expect(yearOfSplit({ from: '2020-01-01', to: '2021-12-31', total: 1 })).toBeUndefined();
      expect(yearOfSplit({ to: '1999-12-31', total: 1 })).toBeUndefined();
      expect(yearOfSplit({ total: 1 })).toBeUndefined();
    });

    it('one day above the window cannot be listed: it is capped and the run says so', async () => {
      const clock = virtualClock();
      const one: Rec[] = Array.from({ length: 10_100 }, (_, i) => rec(i + 1, '2022-05-05'));
      const z = zenodoMock(one, clock);
      const r = new CollectionRunner(runnerDeps(z.net, clock));
      await r.start({ spec: { kind: 'zenodo', community: 'busy-day' }, lang: 'en', sample: false });
      await r.whenIdle();
      const p = r.progress();
      expect(p.counts.records).toBe(10_000);
      expect(p.notices.map((n) => n.code)).toContain('window-exceeded');
      expect(p.notices).toContainEqual({ code: 'slices-differ', params: { sum: 10_000, total: 10_100 } });
    }, 60_000);
  });

  it('the quick sample spreads pages over the community and is labelled a sample', async () => {
    const clock = virtualClock();
    const z = zenodoMock(small(686), clock);
    const r = new CollectionRunner(runnerDeps(z.net, clock));
    await r.start({ spec: { kind: 'zenodo', community: 'fisheries' }, lang: 'en', sample: true });
    await r.whenIdle();
    const p = r.progress();
    expect(p.estimate).toMatchObject({ sample: true, strategy: 'spread-pages', requests: 28 });
    const pages = z.log.slice(1).map((l) => Number(new URL(l.url).searchParams.get('page')));
    expect(pages).toHaveLength(28);
    expect(new Set(pages).size).toBe(28);
    expect(Math.max(...pages)).toBeGreaterThan(20);
    expect(p.counts.records).toBeGreaterThan(0);
    expect(p.counts.records).toBeLessThanOrEqual(700);
    expect(r.fileName()).toContain('-sample-');
  });

  it('zenodoUrl keeps q as one encoded parameter', () => {
    expect(zenodoUrl('c', 2, 25, 'oldest', { from: '2020-01-01', to: '2020-12-31' })).toBe(
      'https://zenodo.org/api/communities/c/records?size=25&page=2&sort=oldest&q=publication_date%3A%5B2020-01-01%20TO%202020-12-31%5D',
    );
  });
});

describe('a page that cannot be read (Zenodo: the next page is known, so the run goes on)', () => {
  const failing = (z: ReturnType<typeof zenodoMock>, page: number, until: () => boolean): Net => ({
    ...z.net,
    get: async (url, a) => (new URL(url).searchParams.get('page') === String(page) && new URL(url).searchParams.get('size') === '25' && !until() ? res(503, '<html>queue full</html>') : z.net.get(url, a)),
  });

  it('is retried after the pass; when it then answers, the counts are exact and nothing was ever "throttled" in the end', async () => {
    const clock = virtualClock();
    const z = zenodoMock(small(100), clock);
    let hits = 0;
    const net = failing(z, 3, () => ++hits > 5); // 5 refusals = the whole retry budget of the first attempt
    const r = new CollectionRunner(runnerDeps(net, clock));
    await r.start({ spec: { kind: 'zenodo', community: 'fisheries' }, lang: 'en', sample: false });
    await r.whenIdle();
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.states).toEqual({ checked: 100, unreachable: 0, throttled: 0, 'unsupported-profile': 0, 'not-in-datacite': 0 });
    expect(p.counts.records).toBe(100);
    expect(p.deferred).toBe(0);
  });

  it('a page that stays refused is counted as throttled, produces no finding, and "resume" retries it', async () => {
    const clock = virtualClock();
    const z = zenodoMock(small(100), clock);
    let open = false;
    const net = failing(z, 3, () => open);
    const r = new CollectionRunner(runnerDeps(net, clock));
    await r.start({ spec: { kind: 'zenodo', community: 'fisheries' }, lang: 'en', sample: false });
    await r.whenIdle();
    let p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.deferred).toBe(1);
    expect(p.resumable).toBe(true);
    expect(p.counts.states).toMatchObject({ checked: 75, throttled: 25 });
    expect(p.counts.records).toBe(100);
    // 100 records, a quarter without licence (small()): the 25 unread ones add nothing to LIC-MISSING
    const missingBefore = p.counts.rules['LIC-MISSING'];
    open = true;
    await r.resume();
    await r.whenIdle();
    p = r.progress();
    expect(p.counts.states).toMatchObject({ checked: 100, throttled: 0 });
    expect(p.counts.rules['LIC-MISSING']).toBeGreaterThanOrEqual(missingBefore);
    expect(p.counts.rules['LIC-MISSING']).toBe(25);
    expect(p.deferred).toBe(0);
    expect(p.status).toBe('finished');
    expect(p.resumable).toBe(false);
  });

  it('three failed pages in a row stop the run (interrupted) instead of burning through the community', async () => {
    const clock = virtualClock();
    const z = zenodoMock(small(500), clock);
    const net: Net = { ...z.net, get: async (url, a) => (new URL(url).searchParams.get('size') === '25' ? res(503, '<html>x</html>') : z.net.get(url, a)) };
    const r = new CollectionRunner(runnerDeps(net, clock));
    await r.start({ spec: { kind: 'zenodo', community: 'fisheries' }, lang: 'en', sample: false });
    await r.whenIdle();
    const p = r.progress();
    expect(p.status).toBe('interrupted');
    expect(p.deferred).toBe(3);
    expect(p.counts.states.checked).toBe(0);
    expect(p.counts.rules).toEqual({});
    expect(p.resumable).toBe(true);
  });
});
