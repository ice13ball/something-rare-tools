// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A page of big records makes the next page smaller (peak memory), without losing or repeating a record.
import { describe, expect, it } from 'vitest';
import { CollectionRunner } from '../../src/core/collection/runner';
import type { CswCall, Net, NetResponse } from '../../src/core/collection/net';
import { CSW_MIN_PAGE, CSW_PAGE, nextPageSize } from '../../src/core/collection/sources/csw';
import { CAPABILITIES, catalogueAnswer, runnerDeps, searchResults, gmdRecord, virtualClock, type CatalogueRecord } from './helpers';

describe('nextPageSize', () => {
  it('ordinary records keep the full page; big ones shrink it down to a floor of 10', () => {
    expect(nextPageSize(1_300_000, 25)).toBe(CSW_PAGE); // 52 KB a record
    expect(nextPageSize(3_000_000, 25)).toBe(CSW_PAGE); // 120 KB a record: exactly at the target
    expect(nextPageSize(5_000_000, 25)).toBe(15);
    expect(nextPageSize(11_400_000, 25)).toBe(CSW_MIN_PAGE); // 456 KB a record
    expect(nextPageSize(0, 0)).toBe(CSW_PAGE);
  });
});

describe('the CSW walk with big records', () => {
  const big = (i: number): CatalogueRecord => ({ id: `big-${i}`, licence: 'CC BY 4.0 ' + 'x'.repeat(300_000) });
  const small = (i: number): CatalogueRecord => ({ id: `small-${i}`, licence: 'CC BY 4.0' });
  const records = [...Array.from({ length: 60 }, (_, i) => big(i)), ...Array.from({ length: 90 }, (_, i) => small(i))];

  it('asks for fewer records after a big page, goes back to 25 after small ones, reads every record exactly once', async () => {
    const asked: { start: number; max: number }[] = [];
    const net: Net = {
      get: async () => { throw new Error('no'); },
      async csw(call: CswCall): Promise<NetResponse> {
        if (call.op === 'GetCapabilities') return { status: 200, text: CAPABILITIES };
        if (call.maxRecords === 1) return { status: 200, text: searchResults(records.length, 1, 2, [gmdRecord(records[0])]) };
        asked.push({ start: call.startPosition!, max: call.maxRecords! });
        return { status: 200, text: catalogueAnswer({ claimed: records.length, records }, call.startPosition!, call.maxRecords!) };
      },
    };
    const r = new CollectionRunner(runnerDeps(net, virtualClock()));
    await r.start({ spec: { kind: 'csw', catalogue: 'emodnet', schema: 'iso19139', crossSource: false }, lang: 'en', sample: false });
    await r.whenIdle();
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.records).toBe(150);
    expect(p.counts.states.checked).toBe(150);
    expect(p.notices).toEqual([]);
    expect(asked[0]).toEqual({ start: 1, max: 25 });
    expect(asked[1].max).toBe(CSW_MIN_PAGE); // the first page weighed 7.5 MB
    expect(asked.some((a) => a.max === 25 && a.start > 60)).toBe(true); // small records: full pages again
    // positions follow nextRecord: no gap, no overlap
    let at = 1;
    for (const a of asked) {
      expect(a.start).toBe(at);
      at += Math.min(a.max, 150 - a.start + 1);
    }
  });

  it('a page lost while pages are small is retried at the same size (the deferred page keeps its own size)', async () => {
    let fail = true;
    const net: Net = {
      get: async () => { throw new Error('no'); },
      async csw(call: CswCall): Promise<NetResponse> {
        if (call.op === 'GetCapabilities') return { status: 200, text: CAPABILITIES };
        if (call.maxRecords === 1) return { status: 200, text: searchResults(records.length, 1, 2, [gmdRecord(records[0])]) };
        if (fail && call.startPosition === 26) { fail = false; return { status: 200, text: '<html>not xml' }; }
        return { status: 200, text: catalogueAnswer({ claimed: records.length, records }, call.startPosition!, call.maxRecords!) };
      },
    };
    const r = new CollectionRunner(runnerDeps(net, virtualClock()));
    await r.start({ spec: { kind: 'csw', catalogue: 'emodnet', schema: 'iso19139', crossSource: false }, lang: 'en', sample: false });
    await r.whenIdle();
    expect(r.progress().status).toBe('finished');
    expect(r.progress().counts.records).toBe(150);
    expect(r.progress().counts.states.checked).toBe(150);
  });
});
