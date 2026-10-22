// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { CollectionRunner } from '../../src/core/collection/runner';
import { PACE_MS, type Net, type NetResponse } from '../../src/core/collection/net';
import { zenodoUrl, ZENODO_WINDOW } from '../../src/core/collection/sources/zenodo';
import type { ZenodoPlan } from '../../src/core/collection/sources/zenodo';
import { json, res, runnerDeps, virtualClock } from './helpers';

interface Rec {
  id: number;
  date: string;
  licence?: string;
}

/** A guest-limited Zenodo: 25 a page, a 10 000 window (400 otherwise), 30 requests a minute (429 + Retry-After beyond), q=publication_date ranges. */
function zenodoMock(records: Rec[], clock: { now(): number }, opts: { unknown?: boolean } = {}) {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const log: { url: string; at: number; status: number }[] = [];
  const window: number[] = [];
  const get: Net['get'] = async (url) => {
    const u = new URL(url);
    const now = clock.now();
    while (window.length > 0 && now - window[0] >= 60_000) window.shift();
    let out: NetResponse;
    if (!u.pathname.startsWith('/api/communities/') || !u.pathname.endsWith('/records')) {
      // /api/records?communities= is the trap: an unknown slug returns EVERYTHING
      out = json({ hits: { total: 7_549_808, hits: [] } });
    } else if (opts.unknown) {
      out = res(404, '{"status":404,"message":"The persistent identifier does not exist."}');
    } else if (window.length >= 30) {
      out = res(429, '{"message":"30 per 1 minute","status":429}', { retryAfterMs: 60_000 - (now - window[0]), rateRemaining: 0 });
    } else {
      window.push(now);
      const size = Number(u.searchParams.get('size'));
      const page = Number(u.searchParams.get('page'));
      if (size > 25 || size * page > ZENODO_WINDOW) out = res(400, '{"status":400,"message":"Invalid querystring parameters."}');
      else {
        let pool = sorted;
        const q = u.searchParams.get('q');
        const m = q ? /publication_date:\[(\S+) TO (\S+)\]/.exec(q) : null;
        if (m) pool = pool.filter((r) => (m[1] === '*' || r.date >= m[1]) && (m[2] === '*' || r.date <= m[2]));
        if (u.searchParams.get('sort') === 'mostrecent') pool = [...pool].reverse();
        const hits = pool.slice((page - 1) * size, page * size).map((r) => ({
          id: r.id,
          doi: `10.5281/zenodo.${r.id}`,
          metadata: { publication_date: r.date, ...(r.licence === undefined ? {} : r.licence ? { license: { id: r.licence } } : {}), title: `T${r.id}` },
        }));
        out = json({ hits: { total: pool.length, hits } }, { rateRemaining: 30 - window.length, retryAfterMs: 60_000 - (now - window[0]) });
      }
    }
    log.push({ url, at: now, status: out.status });
    return out;
  };
  return { net: { get, csw: async () => res(500, '') } as Net, log };
}

const rec = (id: number, date: string, licence: string | null = 'cc-by-4.0'): Rec => ({ id, date, licence: licence ?? '' });
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
      expect(plan.slices.length).toBeGreaterThan(3);
      for (const s of plan.slices) expect(s.total).toBeLessThanOrEqual(ZENODO_WINDOW);
      expect(plan.sum).toBe(plan.total);
      expect(plan.total).toBe(big.length);
      expect(r.progress().estimate).toMatchObject({ strategy: 'date-split', approximate: true });
      expect(r.progress().notices.map((n) => n.code)).toContain('split-by-date');
      await r.whenIdle();
      const p = r.progress();
      expect(p.status).toBe('finished');
      expect(p.counts.records).toBe(big.length);
      expect(p.counts.rules['LIC-MISSING']).toBe(1040);
      expect(z.log.every((l) => l.status === 200)).toBe(true);
      expect(p.notices.map((n) => n.code)).not.toContain('slices-differ');
      // no page beyond the window was ever asked for
      for (const l of z.log) expect(Number(new URL(l.url).searchParams.get('page')) * Number(new URL(l.url).searchParams.get('size'))).toBeLessThanOrEqual(ZENODO_WINDOW);
    }, 60_000);

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
    expect(p.counts.states).toEqual({ checked: 100, unreachable: 0, throttled: 0, 'unsupported-profile': 0 });
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
