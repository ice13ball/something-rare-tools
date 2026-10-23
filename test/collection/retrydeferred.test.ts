// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// No record of a deferred page may be lost: a page retried at a smaller size owes the rest of its range; and a run that ends before the
// total its source announced is not complete (end-of-run notice + RUN-INCOMPLETE row).
import { describe, expect, it } from 'vitest';
import { CollectionRunner } from '../../src/core/collection/runner';
import type { CswCall, Net, NetResponse } from '../../src/core/collection/net';
import { CAPABILITIES, catalogueAnswer, dataciteMock, dcResource, gmdRecord, json, runnerDeps, searchResults, virtualClock, type CatalogueRecord } from './helpers';

const recs = (n: number): CatalogueRecord[] => Array.from({ length: n }, (_, i) => ({ id: `u${i + 1}`, licence: 'CC BY 4.0' }));
const spec = { spec: { kind: 'csw', catalogue: 'emodnet', schema: 'iso19139', crossSource: false }, lang: 'en', sample: false } as const;

function cswNet(records: CatalogueRecord[], fail: (c: CswCall) => NetResponse | undefined): Net {
  return {
    async get() {
      throw new Error('no');
    },
    async csw(c) {
      if (c.op === 'GetCapabilities') return { status: 200, text: CAPABILITIES };
      if (c.startPosition === 1 && c.maxRecords === 1) return { status: 200, text: searchResults(records.length, 1, 2, [gmdRecord(records[0])]) };
      return fail(c) ?? { status: 200, text: catalogueAnswer({ claimed: records.length, records }, c.startPosition ?? 1, c.maxRecords ?? 25) };
    },
  };
}

describe.each([
  ['csw_too_large', 413],
  ['csw_slow', 504],
] as const)('a deferred CSW page retried at a smaller size (%s) loses no record', (proxyError, status) => {
  const bad = { status, text: '', proxyError };
  /** page 26 fails at every size in the first pass (25/12/10), then 25 fails and 12 works in the retry pass */
  const flaky = (extra?: (c: CswCall) => boolean) => {
    let calls26 = 0;
    const firstPass = proxyError === 'csw_too_large' ? 3 : 5;
    return (c: CswCall): NetResponse | undefined => {
      if (extra?.(c)) return bad;
      if (c.startPosition !== 26) return undefined;
      calls26 += 1;
      return calls26 <= firstPass || (c.maxRecords ?? 0) > 12 ? bad : undefined;
    };
  };

  it('the rest of the range (positions 38 to 50) is read too: 100 of 100, nothing unread', async () => {
    const r = new CollectionRunner(runnerDeps(cswNet(recs(100), flaky()), virtualClock()));
    await r.start(spec);
    await r.whenIdle();
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.records).toBe(100);
    expect(p.counts.states.checked).toBe(100);
    expect(p.deferred).toBe(0);
    expect(p.notices.some((n) => n.code === 'unread-pages' || n.code === 'records-missing')).toBe(false);
  });

  it('a rest that cannot be read is owed: unread-pages names it and RUN-INCOMPLETE ends the list; a resume reads it', async () => {
    let broken = true;
    const base = flaky();
    const r = new CollectionRunner(runnerDeps(cswNet(recs(100), (c) => (broken && (c.startPosition ?? 0) >= 38 && (c.startPosition ?? 0) < 51 ? bad : base(c))), virtualClock()));
    await r.start(spec);
    await r.whenIdle();
    let p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.deferred).toBe(1);
    expect(p.counts.states.checked).toBe(100 - 13);
    expect(p.notices.find((n) => n.code === 'unread-pages')).toMatchObject({ params: { pages: 1, records: 13 } });
    expect(await (await r.csvBlob()).text()).toContain('RUN-INCOMPLETE');
    broken = false;
    await r.resume();
    await r.whenIdle();
    p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.states.checked).toBe(100);
    expect(p.counts.records).toBe(100);
    expect(p.notices.some((n) => n.code === 'unread-pages')).toBe(false);
  });
});

describe('a run that ends before the total its source announced is not complete', () => {
  it('CSW claims 100, delivers 50: the shortfall is in the end-of-run notice and the RUN-INCOMPLETE row', async () => {
    const records = recs(100);
    const net = cswNet(records, (c) => ((c.startPosition ?? 0) >= 51 ? { status: 200, text: searchResults(100, 0, 0, []) } : undefined));
    const r = new CollectionRunner(runnerDeps(net, virtualClock()));
    await r.start(spec);
    await r.whenIdle();
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.records).toBe(50);
    expect(p.notices).toContainEqual({ code: 'records-missing', params: { missing: 50 } });
    expect(await (await r.csvBlob()).text()).toContain('RUN-INCOMPLETE');
  });

  it('DataCite announces 2000, lists 1000: same', async () => {
    const clock = virtualClock();
    const mock = dataciteMock({
      total: 2000,
      clock,
      override: (n) => (n === 2 ? json({ data: Array.from({ length: 1000 }, (_, i) => dcResource(i)), meta: { total: 2000 }, links: {} }) : undefined),
    });
    const r = new CollectionRunner(runnerDeps(mock.net, clock));
    await r.start({ spec: { kind: 'datacite', by: 'client', id: 'test.client' }, lang: 'en', sample: false });
    await r.whenIdle();
    expect(r.progress().notices).toContainEqual({ code: 'records-missing', params: { missing: 1000 } });
    expect(await (await r.csvBlob()).text()).toContain('RUN-INCOMPLETE');
  });
});

describe('a deferred page judged in the retry pass is judged against its own range', () => {
  const bad = { status: 504, text: '', proxyError: 'csw_slow' };
  const records = recs(100);
  async function go(answer26: (n: number) => NetResponse | undefined) {
    const calls = new Map<number, number>();
    const net = cswNet(records, (c) => {
      const pos = c.startPosition ?? 0;
      calls.set(pos, (calls.get(pos) ?? 0) + 1);
      return pos === 26 ? answer26(calls.get(26)!) : undefined;
    });
    const r = new CollectionRunner(runnerDeps(net, virtualClock()));
    await r.start(spec);
    await r.whenIdle();
    return { r, p: r.progress() };
  }

  it('A: a retried page that comes back empty owes its 25 records, not 75', async () => {
    const { r, p } = await go((n) => (n <= 5 ? bad : { status: 200, text: searchResults(100, 0, 51, []) }));
    expect(p.status).toBe('finished');
    expect(p.counts.states.checked).toBe(75);
    expect(p.notices).toContainEqual({ code: 'records-missing', params: { missing: 25 } });
    expect(await (await r.csvBlob()).text()).toContain('RUN-INCOMPLETE');
  });

  it('B: a retried page that returns 12 of 25 and jumps to 51 owes 13 records', async () => {
    const { r, p } = await go((n) => (n <= 5 ? bad : { status: 200, text: searchResults(100, 12, 51, records.slice(25, 37).map(gmdRecord)) }));
    expect(p.counts.states.checked).toBe(87);
    expect(p.notices).toContainEqual({ code: 'records-missing', params: { missing: 13 } });
    expect(await (await r.csvBlob()).text()).toContain('RUN-INCOMPLETE');
  });

  it('control: the same short answer in the normal pass is still 13', async () => {
    const { p } = await go(() => ({ status: 200, text: searchResults(100, 12, 51, records.slice(25, 37).map(gmdRecord)) }));
    expect(p.counts.states.checked).toBe(87);
    expect(p.notices).toContainEqual({ code: 'records-missing', params: { missing: 13 } });
  });
});
