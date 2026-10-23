// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A catalogue page larger than our server accepts (15 MB) is not "answered too slowly", and a page that was too slow or too large is asked
// again with a smaller page (down to 10) before it is given up.
import { describe, expect, it } from 'vitest';
import { CollectionRunner } from '../../src/core/collection/runner';
import { CSW_CUT_BYTES, makeNetContext, request, serverCsw, type CswCall, type Net, type NetResponse } from '../../src/core/collection/net';
import { describeStop } from '../../src/core/collection/stop';
import { LANGS } from '../../src/core/types';
import { CAPABILITIES, catalogueAnswer, gmdRecord, runnerDeps, searchResults, virtualClock, type CatalogueRecord } from './helpers';

const call = { catalogue: 'emodnet', op: 'GetRecords', startPosition: 1, maxRecords: 25, schema: 'iso19139' } as const;
const MB15 = 15 * 1024 * 1024;

/** A response whose body delivers `bytes` and then breaks, like our server stopping a catalogue answer at its size cap. */
const cutAfter = (bytes: number): Response => {
  let left = bytes;
  return new Response(
    new ReadableStream({
      pull(c) {
        if (left <= 0) return c.error(new TypeError('network error'));
        const n = Math.min(left, 1024 * 1024);
        left -= n;
        c.enqueue(new Uint8Array(n));
      },
    }),
    { status: 200 },
  );
};

describe('a catalogue answer cut at the size the server accepts', () => {
  it('is csw_too_large (413), not "too slowly"; a stream cut early is still csw_slow', async () => {
    expect(await serverCsw('/api/csw', async () => cutAfter(MB15))(call)).toMatchObject({ status: 413, proxyError: 'csw_too_large' });
    expect(await serverCsw('/api/csw', async () => cutAfter(CSW_CUT_BYTES))(call)).toMatchObject({ status: 413, proxyError: 'csw_too_large' });
    expect(await serverCsw('/api/csw', async () => cutAfter(2 * 1024 * 1024))(call)).toMatchObject({ status: 504, proxyError: 'csw_slow' });
  });

  it("the server's own 413 too_large is the same cause; it is asked once (the same page would be too large again)", async () => {
    const csw = serverCsw('/api/csw', async () => new Response('{"error":"too_large"}', { status: 413, headers: { 'X-Fetch-Proxy-Error': 'too_large' } }));
    expect(await csw(call)).toMatchObject({ status: 413, proxyError: 'csw_too_large' });
    const nctx = makeNetContext(virtualClock(), { requests: 0, retries: 0, throttleEvents: 0 }, undefined, {});
    await expect(request(nctx, 'csw', () => csw(call))).rejects.toMatchObject({ kind: 'unreachable', reason: 'csw_too_large', status: 413 });
    expect(nctx.stats.requests).toBe(1);
  });

  it('is said in four languages without the word "slowly" and without a raw code', () => {
    for (const lang of LANGS) {
      const text = describeStop({ cause: 'csw_too_large', source: 'csw:emodnet', page: 3, request: 9, kind: 'unreachable', at: Date.UTC(2026, 9, 22, 14, 5) }, lang);
      expect(text, lang).toMatch(/15/);
      expect(text, lang).not.toMatch(/csw_too_large|\{\w+\}/);
      expect(text, lang).not.toMatch(/45/);
    }
  });
});

const recs = (n: number): CatalogueRecord[] => Array.from({ length: n }, (_, i) => ({ id: `u${i + 1}`, licence: 'CC BY 4.0' }));

function net(records: CatalogueRecord[], fails: (c: CswCall) => NetResponse | undefined) {
  const asked: { start: number; max: number }[] = [];
  const n: Net = {
    async get() {
      throw new Error('no');
    },
    async csw(c) {
      if (c.op === 'GetCapabilities') return { status: 200, text: CAPABILITIES };
      if (c.startPosition === 1 && c.maxRecords === 1) return { status: 200, text: searchResults(records.length, 1, 2, [gmdRecord(records[0])]) };
      asked.push({ start: c.startPosition ?? 0, max: c.maxRecords ?? 0 });
      return fails(c) ?? { status: 200, text: catalogueAnswer({ claimed: records.length, records }, c.startPosition ?? 1, c.maxRecords ?? 25) };
    },
  };
  return { net: n, asked };
}
const spec = { spec: { kind: 'csw', catalogue: 'emodnet', schema: 'iso19139', crossSource: false }, lang: 'en', sample: false } as const;

describe.each([
  ['csw_too_large', 413],
  ['csw_slow', 504],
] as const)('a page that fails with %s is asked again with a smaller page before it is deferred', (proxyError, status) => {
  it('25 fails, 12 gets through: every record is read once, nothing is deferred, and later pages stay small', async () => {
    const w = net(recs(60), (c) => ((c.maxRecords ?? 0) > 12 ? { status, text: '', proxyError } : undefined));
    const r = new CollectionRunner(runnerDeps(w.net, virtualClock()));
    await r.start(spec);
    await r.whenIdle();
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.deferred).toBe(0);
    expect(p.counts.states.checked).toBe(60);
    expect(w.asked.slice(0, 2)).toEqual([{ start: 1, max: 25 }, { start: 1, max: 12 }]);
    // the page that had to be asked smaller keeps the next pages small: no second 25 after the first success at 12
    expect(w.asked.filter((a) => a.max === 25)).toHaveLength(1);
    expect(p.notices.some((n) => n.code === 'unread-pages')).toBe(false);
  });

  it('nothing gets through even at 10: the page is given up with that cause and a resume that finds the catalogue well reads it', async () => {
    let bad = true;
    const w = net(recs(60), () => (bad ? { status, text: '', proxyError } : undefined));
    const r = new CollectionRunner(runnerDeps(w.net, virtualClock()));
    await r.start(spec);
    await r.whenIdle();
    expect(w.asked.slice(0, 3).map((a) => a.max)).toEqual([25, 12, 10]);
    const p = r.progress();
    expect(p.status).toBe('interrupted');
    expect(p.stop).toMatchObject({ cause: proxyError, kind: 'unreachable' });
    bad = false;
    await r.resume();
    await r.whenIdle();
    expect(r.progress().status).toBe('finished');
    expect(r.progress().counts.states.checked).toBe(60);
  });
});

describe('the reduced page size steps back up after a stretch of good pages', () => {
  it('slow once at 25: 12 for the retry and five good pages, then 24 (and 25 five pages later), every record read once', async () => {
    let first = true;
    const w = net(recs(600), (c) => {
      if (first && (c.maxRecords ?? 0) > 12) {
        first = false;
        return { status: 504, text: '', proxyError: 'csw_slow' };
      }
      return undefined;
    });
    const r = new CollectionRunner(runnerDeps(w.net, virtualClock()));
    await r.start(spec);
    await r.whenIdle();
    const sizes = w.asked.map((a) => a.max);
    expect(sizes.slice(0, 8)).toEqual([25, 12, 12, 12, 12, 12, 12, 24]);
    expect(sizes.slice(0, 20)).toContain(24);
    expect(sizes).toContain(25);
    expect(r.progress().counts.states.checked).toBe(600);
    expect(r.progress().counts.records).toBe(600);
  });

  it('too large at 25: it steps up at most to 24 once, never back to a size that was too large', async () => {
    const w = net(recs(600), (c) => ((c.maxRecords ?? 0) > 20 ? { status: 413, text: '', proxyError: 'csw_too_large' } : undefined));
    const r = new CollectionRunner(runnerDeps(w.net, virtualClock()));
    await r.start(spec);
    await r.whenIdle();
    // 25 failed (too large) so nothing at or above 25 is asked again; 24 is tried once per stretch and also fails, after which 12 stays
    expect(w.asked.filter((a) => a.max === 25)).toHaveLength(1);
    expect(r.progress().counts.states.checked).toBe(600);
  });
});
