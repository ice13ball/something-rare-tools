// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { FetchBlockedError } from '../../src/core/sources/fetcher';
import { CollectionRunner } from '../../src/core/collection/runner';
import { BACKOFF, PACE_MS, makeNetContext, request, parseRetryAfter, type NetResponse } from '../../src/core/collection/net';
import { cursorEpoch, dataciteListUrl, DATACITE_FIELDS } from '../../src/core/collection/sources/datacite';
import { scanBatch, countDois, doiListPager } from '../../src/core/collection/sources/dois';
import type { RunSettings } from '../../src/core/collection/types';
import { HTML_503, dataciteMock, dcResource, json, res, runnerDeps, virtualClock } from './helpers';

const client = (id = 'test.client', sample = false): RunSettings => ({ spec: { kind: 'datacite', by: 'client', id }, lang: 'en', sample });

async function run(settings: RunSettings, mock: ReturnType<typeof dataciteMock>, clock = virtualClock()) {
  const deps = runnerDeps(mock.net, clock);
  const r = new CollectionRunner(deps);
  await r.start(settings);
  await r.whenIdle();
  return r;
}

describe('DataCite client / prefix', () => {
  it('walks the cursor with links.next verbatim, 1000 a page, with trimmed fields', async () => {
    const clock = virtualClock();
    const mock = dataciteMock({ total: 2500, clock });
    const r = await run(client(), mock, clock);
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.records).toBe(2500);
    expect(p.counts.states.checked).toBe(2500);
    // probe + 3 pages
    expect(mock.urls).toHaveLength(4);
    expect(mock.urls[1]).toBe(dataciteListUrl('client', 'test.client'));
    expect(mock.urls[1]).toContain('page%5Bsize%5D=1000');
    expect(mock.urls[1]).toContain('page%5Bcursor%5D=1');
    expect(decodeURIComponent(mock.urls[1])).toContain(`fields[dois]=${DATACITE_FIELDS}`);
    expect(mock.urls[2]).toContain('page%5Bcursor%5D=');
    expect(mock.urls[2]).not.toContain('page%5Bnumber%5D');
    expect(p.notices).toEqual([]);
  });

  it('works for a prefix, and paces listing requests at least 1 s apart', async () => {
    const clock = virtualClock();
    const mock = dataciteMock({ total: 3000, clock });
    const r = await new CollectionRunner(runnerDeps(mock.net, clock));
    await r.start({ spec: { kind: 'datacite', by: 'prefix', id: '10.5555' }, lang: 'en', sample: false });
    await r.whenIdle();
    expect(mock.urls[1]).toContain('prefix=10.5555');
    for (let i = 1; i < mock.times.length; i++) expect(mock.times[i] - mock.times[i - 1]).toBeGreaterThanOrEqual(PACE_MS['api.datacite.org']);
  });

  it('an unknown client is "no records found", not an error', async () => {
    const mock = dataciteMock({ total: 0 });
    const r = await run(client('nosuch.client'), mock);
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.records).toBe(0);
    expect(p.notices).toEqual([{ code: 'no-records' }]);
    expect(p.estimate?.empty).toBe(true);
  });

  it('refuses an id that is no client id or prefix before any request', async () => {
    const mock = dataciteMock({ total: 10 });
    const r = new CollectionRunner(runnerDeps(mock.net, virtualClock()));
    await expect(r.start(client('x&page[number]=3'))).rejects.toMatchObject({ reason: 'bad-id' });
    await expect(r.start({ spec: { kind: 'datacite', by: 'prefix', id: '10.5555/x' }, lang: 'en', sample: false })).rejects.toMatchObject({ reason: 'bad-id' });
    expect(mock.urls).toHaveLength(0);
  });

  it('a cursor that silently restarts at page 1 stops the run instead of looping', async () => {
    const clock = virtualClock();
    // from page 3 on DataCite answers with page 1 again
    let bogus = false;
    const base = dataciteMock({ total: 5000, clock });
    const net = {
      ...base.net,
      async get(url: string, accept: string) {
        const u = new URL(url);
        if (bogus && u.searchParams.get('page[cursor]') !== '1' && u.searchParams.get('page[cursor]') !== null) {
          const first = await base.net.get(dataciteListUrl('client', 'test.client'), accept);
          return first;
        }
        const out = await base.net.get(url, accept);
        if (url.includes('page%5Bcursor%5D=') && !url.includes('cursor%5D=1&')) bogus = true;
        return out;
      },
    };
    const r = new CollectionRunner(runnerDeps(net, clock));
    await r.start(client());
    await r.whenIdle();
    const p = r.progress();
    expect(p.status).toBe('failed');
    expect(p.notices.map((n) => n.code)).toContain('cursor-restarted');
    expect(p.counts.records).toBeLessThanOrEqual(2000);
  });

  it('a links.next that equals the current URL, or leaves api.datacite.org, is refused', async () => {
    for (const next of ['SAME', 'https://evil.example/dois?page%5Bcursor%5D=abc']) {
      const clock = virtualClock();
      let seen = '';
      const net = dataciteMock({
        total: 3000,
        clock,
        override: (n, u) => {
          if (n === 1) return undefined;
          seen = u.toString();
          const data = Array.from({ length: 1000 }, (_, i) => dcResource(i));
          return json({ data, meta: { total: 3000 }, links: { next: next === 'SAME' ? seen : next } });
        },
      });
      const r = new CollectionRunner(runnerDeps(net.net, clock));
      await r.start(client());
      await r.whenIdle();
      expect(r.progress().status, next).toBe('failed');
      expect(r.progress().notices.map((n) => n.code)).toContain('cursor-stuck');
      expect(net.urls.every((u) => u.startsWith('https://api.datacite.org/'))).toBe(true);
    }
  });

  it('an end before the announced total is said, not hidden', async () => {
    const clock = virtualClock();
    const mock = dataciteMock({
      total: 2000,
      clock,
      override: (n) => (n === 2 ? json({ data: Array.from({ length: 1000 }, (_, i) => dcResource(i)), meta: { total: 2000 }, links: {} }) : undefined),
    });
    const r = await run(client(), mock, clock);
    expect(r.progress().status).toBe('finished');
    expect(r.progress().notices).toContainEqual({ code: 'ended-before-total', params: { seen: 1000, total: 2000 } });
  });

  it('decodes the epoch of a cursor token and ignores tokens that are not of that shape', () => {
    const token = Buffer.from('1444907512000,10.5555/r1').toString('base64').replace(/=+$/, '');
    expect(cursorEpoch(`https://api.datacite.org/dois?page%5Bcursor%5D=${token}`)).toBe(1444907512000);
    expect(cursorEpoch('https://api.datacite.org/dois?page%5Bcursor%5D=bogus')).toBeUndefined();
    expect(cursorEpoch('https://api.datacite.org/dois')).toBeUndefined();
  });
});

describe('DataCite quick sample', () => {
  it('uses random=true, never a cursor, and is labelled a sample in the file name', async () => {
    const clock = virtualClock();
    const mock = dataciteMock({ total: 440_035, clock });
    const r = await run(client('pangaea.repository', true), mock, clock);
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.settings?.sample).toBe(true);
    expect(p.estimate).toMatchObject({ sample: true, strategy: 'random-sample', requests: 30, records: 3000 });
    const list = mock.urls.slice(1);
    expect(list).toHaveLength(30);
    for (const u of list) {
      expect(u).toContain('random=true');
      expect(u).not.toContain('cursor');
    }
    expect(p.counts.records).toBeGreaterThan(0);
    expect(p.counts.records).toBeLessThanOrEqual(3000);
    expect(r.fileName()).toBe('fix-list-sample-2026-10-22.csv');
  });
});

describe('DOI list', () => {
  const list = (n: number, extra = ''): string => Array.from({ length: n }, (_, i) => `10.5555/r${i}`).join('\n') + extra;

  it('reads doi.org and doi: forms, drops repeats inside a batch (and, given the DOIs before it, repeats of those), counts tokens that are no DOI', () => {
    const b = scanBatch('https://doi.org/10.5555/R1 doi:10.5555/r1 10.5555/r2,\nhello 12345 http://dx.doi.org/10.5555/r3', 0);
    expect(b.dois).toEqual(['10.5555/r1', '10.5555/r2', '10.5555/r3']);
    expect(b.duplicates).toBe(1);
    expect(b.invalid).toBe(2);
    expect(b.next).toBeNull();
  });

  it('cuts batches at 100 DOIs; the cursor is an offset into the text', () => {
    const text = list(250);
    expect(countDois(text)).toEqual({ dois: 250, batches: 3 });
    const a = scanBatch(text, 0);
    expect(a.dois).toHaveLength(100);
    const b = scanBatch(text, a.next!);
    expect(b.dois[0]).toBe('10.5555/r100');
  });

  it('looks DOIs up in batches of 100 (ids=), a DOI DataCite does not know is unread, never a licence finding', async () => {
    const clock = virtualClock();
    const mock = dataciteMock({ total: 1000, clock });
    const deps = runnerDeps(mock.net, clock);
    const r = new CollectionRunner(deps);
    await r.start({ spec: { kind: 'dois', text: list(150, '\n10.9999/unknown.1 not-a-doi') }, lang: 'en', sample: false });
    await r.whenIdle();
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(mock.urls).toHaveLength(2); // 101 + 50 DOIs: two ids= requests, no total probe
    expect(mock.urls[0]).toContain('ids=');
    expect(p.counts.records).toBe(151);
    expect(p.counts.states.checked).toBe(150);
    expect(p.counts.states.unreachable).toBe(1);
    expect(p.counts.invalidTokens).toBe(1);
    expect(r.unread()).toEqual([{ ref: '10.9999/unknown.1', state: 'unreachable', reason: 'not-found-at-datacite' }]);
    // the unknown DOI added no licence finding: LIC-MISSING counts only the 30 records that really state none
    expect(p.counts.rules['LIC-MISSING']).toBe(30);
  });

  it('a DOI repeated anywhere in the list counts once (also across batches, any case or form); a resumed run equals an uninterrupted one', async () => {
    // 250 distinct DOIs; r5 again in batch 2, r120 again in batch 3 (as doi.org form, upper case), r249 twice at the very end
    const text = list(250) + '\nhttps://doi.org/10.5555/R5 10.5555/r120 not-a-doi doi:10.5555/R120 10.5555/r249 10.5555/r249';
    expect(countDois(text)).toEqual({ dois: 250, batches: 3 });

    const clock = virtualClock();
    const mock = dataciteMock({ total: 1000, clock });
    const deps = runnerDeps(mock.net, clock);
    const r = new CollectionRunner(deps);
    await r.start({ spec: { kind: 'dois', text }, lang: 'en', sample: false });
    await r.whenIdle();
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.records).toBe(250);
    expect(p.counts.states.checked).toBe(250);
    expect(p.counts.duplicatesInBatch).toBe(5);
    expect(p.counts.invalidTokens).toBe(1);
    const asked = mock.urls.flatMap((u) => new URL(u).searchParams.get('ids')?.split(',') ?? []);
    expect(asked).toHaveLength(250);
    expect(new Set(asked).size).toBe(250);

    // pager level: walking from the start, and starting afresh (a resumed run: a NEW pager, no memory) at every cursor, give the same batches
    const nctx = makeNetContext(clock, { requests: 0, retries: 0, throttleEvents: 0 }, undefined, {});
    const walk = async (pager: ReturnType<typeof doiListPager>, from: { offset: number } | null) => {
      const out: string[][] = [];
      let c = from;
      while (c) {
        const d = await pager.fetch(c);
        out.push(d.items.map((i) => i.ref));
        c = d.next;
      }
      return out;
    };
    const whole = await walk(doiListPager({ net: mock.net, nctx }, text), { offset: 0 });
    expect(whole.flat()).toHaveLength(250);
    expect(new Set(whole.flat()).size).toBe(250);
    const cursors: { offset: number }[] = [{ offset: 0 }];
    for (let c = doiListPager({ net: mock.net, nctx }, text).skip(cursors[0]); c; c = doiListPager({ net: mock.net, nctx }, text).skip(c)) cursors.push(c);
    expect(cursors).toHaveLength(3);
    for (let i = 1; i < cursors.length; i++) {
      const resumed = await walk(doiListPager({ net: mock.net, nctx }, text), cursors[i]);
      expect(resumed).toEqual(whole.slice(i));
    }
    // a page retried later (an earlier cursor after a later one) sees the same thing
    const pager = doiListPager({ net: mock.net, nctx }, text);
    await walk(pager, cursors[2]);
    expect(await walk(pager, cursors[1])).toEqual(whole.slice(1));
  });

  it('has no sample mode', async () => {
    const r = new CollectionRunner(runnerDeps(dataciteMock({ total: 1 }).net, virtualClock()));
    await expect(r.start({ spec: { kind: 'dois', text: '10.5555/r1' }, lang: 'en', sample: true })).rejects.toMatchObject({ reason: 'no-sample-for-list' });
  });
});

describe('backoff and unread pages', () => {
  const ctx = (clock = virtualClock()) => makeNetContext(clock, { requests: 0, retries: 0, throttleEvents: 0 });

  it("DataCite's HTML 503 (queue full) is retried with exponential, capped backoff; Retry-After is not needed", async () => {
    const clock = virtualClock();
    const c = ctx(clock);
    const answers = [res(503, HTML_503), res(503, HTML_503), res(200, '{}')];
    const out = await request(c, 'api.datacite.org', async () => answers.shift()!);
    expect(out.status).toBe(200);
    expect(c.stats).toMatchObject({ requests: 3, retries: 2, throttleEvents: 2 });
    // 2 s, 4 s (jitter factor 1 in the test clock), plus the 1 s pacing of the host
    expect(clock.sleeps).toContain(2000);
    expect(clock.sleeps).toContain(4000);
  });

  it('honours Retry-After where it is readable (429), and does not wait out an absurd one', async () => {
    const clock = virtualClock();
    const c = ctx(clock);
    const answers: NetResponse[] = [res(429, '{}', { retryAfterMs: 35_000 }), res(200, '{}')];
    await request(c, 'zenodo.org', async () => answers.shift()!);
    expect(clock.sleeps).toContain(35_000);
    const c2 = ctx(clock);
    await expect(request(c2, 'zenodo.org', async () => res(429, '{}', { retryAfterMs: 3_600_000 }))).rejects.toMatchObject({ kind: 'throttled', reason: 'retry-after-long' });
    expect(c2.stats.requests).toBe(1);
  });

  it('parses Retry-After seconds and dates, nothing else', () => {
    expect(parseRetryAfter('35')).toBe(35_000);
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT', Date.parse('Wed, 21 Oct 2026 07:27:00 GMT'))).toBe(60_000);
    expect(parseRetryAfter('soon')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it('gives up after the bounded attempts: throttled after 5, unreachable after 3', async () => {
    const c = ctx();
    await expect(request(c, 'x', async () => res(503, HTML_503))).rejects.toMatchObject({ kind: 'throttled' });
    expect(c.stats.requests).toBe(BACKOFF.attemptsThrottled);
    const c2 = ctx();
    await expect(request(c2, 'x', async () => Promise.reject(new FetchBlockedError('api.datacite.org')))).rejects.toMatchObject({ kind: 'unreachable', reason: 'network' });
    expect(c2.stats.requests).toBe(BACKOFF.attemptsUnreachable);
  });

  it('a 400 or a 404 is not retried', async () => {
    const c = ctx();
    await expect(request(c, 'x', async () => res(400, 'bad'))).rejects.toMatchObject({ kind: 'protocol' });
    await expect(request(c, 'x', async () => res(404, 'no'))).rejects.toMatchObject({ kind: 'not-found' });
    expect(c.stats.requests).toBe(2);
  });

  it('a page that stays throttled is marked "throttled", gets NO finding, the cursor moves on, and resume reads it', async () => {
    const clock = virtualClock();
    let refuse = true;
    const mock = dataciteMock({
      total: 3000,
      clock,
      // the second listing page (request 3: probe, page 1, page 2) is refused until `refuse` is switched off
      override: (n) => (refuse && n >= 3 && n <= 3 + BACKOFF.attemptsThrottled - 1 ? res(503, HTML_503) : undefined),
    });
    const r = new CollectionRunner(runnerDeps(mock.net, clock));
    // a blocking page (DataCite's next cursor is only in its answer) interrupts the run
    await r.start(client());
    await r.whenIdle();
    let p = r.progress();
    expect(p.status).toBe('interrupted');
    expect(p.counts.states.checked).toBe(1000);
    expect(p.counts.states.throttled).toBe(1000);
    expect(p.deferred).toBe(1);
    expect(p.resumable).toBe(true);
    expect(p.counts.rules['LIC-MISSING']).toBe(200); // only the 1000 records that were read; the 1000 unread ones have none
    refuse = false;
    await r.resume();
    await r.whenIdle();
    p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.states).toEqual({ checked: 3000, unreachable: 0, throttled: 0, 'unsupported-profile': 0 });
    expect(p.counts.records).toBe(3000);
    expect(p.counts.rules['LIC-MISSING']).toBe(600);
    expect(p.deferred).toBe(0);
  });

  it('network failure is "unreachable", never a finding; three failed pages in a row stop the run', async () => {
    const clock = virtualClock();
    const mock = dataciteMock({ total: 100, clock, override: () => undefined });
    const net = { ...mock.net, get: async () => Promise.reject(new FetchBlockedError('api.datacite.org')) };
    const r = new CollectionRunner(runnerDeps(net, clock));
    await expect(r.start(client())).rejects.toMatchObject({ kind: 'unreachable' });
    expect(r.progress().status).toBe('failed');
    expect(Object.keys(r.progress().counts.rules)).toEqual([]);
  });
});
