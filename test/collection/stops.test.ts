// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Why a run stops (and that it always says so): a failed DataCite comparison inside a CSW run, an unreadable page, an exception inside the
// run, a dying worker; the stop reason is saved, shown in four languages and written as the last row of an unfinished fix list.
import { describe, expect, it } from 'vitest';
import { CollectionRunner } from '../../src/core/collection/runner';
import type { CswCall, Net, NetResponse } from '../../src/core/collection/net';
import { describeStop } from '../../src/core/collection/stop';
import { memoryStore, type RunStore } from '../../src/core/collection/store';
import type { Progress, RunSettings, StopReason } from '../../src/core/collection/types';
import { UI } from '../../src/core/i18n/ui';
import { LANGS, type Lang } from '../../src/core/types';
import { createCollectionClient, type CollectionWorkerLike } from '../../src/worker/collection.client';
import { CAPABILITIES, HTML_503, catalogueAnswer, dataciteMock, gmdRecord, runnerDeps, searchResults, virtualClock, type CatalogueRecord } from './helpers';

const settings = (crossSource: boolean, lang: Lang = 'en'): RunSettings => ({ spec: { kind: 'csw', catalogue: 'emodnet', schema: 'iso19139', crossSource }, lang, sample: false });
const recs = (n: number, doi = false): CatalogueRecord[] => Array.from({ length: n }, (_, i) => ({ id: `u${i + 1}`, licence: 'CC BY 4.0', ...(doi ? { doi: `10.5555/r${i}` } : {}) }));

interface Wire {
  net: Net;
  /** GetRecords calls so far (start positions). */
  starts: number[];
}

/** A catalogue straight to the engine; `page` may replace the answer of one request (1-based count of GetRecords calls). */
function catalogue(records: CatalogueRecord[], opts: { page?: (n: number, start: number) => string | Error | undefined; dc?: Parameters<typeof dataciteMock>[0] } = {}): Wire {
  const starts: number[] = [];
  const dc = dataciteMock(opts.dc ?? { total: 0 });
  let n = 0;
  const net: Net = {
    get: dc.net.get,
    async csw(call: CswCall): Promise<NetResponse> {
      if (call.op === 'GetCapabilities') return { status: 200, text: CAPABILITIES };
      if (call.startPosition === 1 && call.maxRecords === 1) return { status: 200, text: searchResults(records.length, 1, 2, [gmdRecord(records[0])]) };
      n += 1;
      starts.push(call.startPosition ?? 0);
      const forced = opts.page?.(n, call.startPosition ?? 0);
      if (forced instanceof Error) throw forced;
      if (forced !== undefined) return { status: 200, text: forced };
      return { status: 200, text: catalogueAnswer({ claimed: records.length, records }, call.startPosition ?? 1, call.maxRecords ?? 25) };
    },
  };
  return { net, starts };
}

async function run(net: Net, s: RunSettings, store?: RunStore) {
  const clock = virtualClock();
  const r = new CollectionRunner(runnerDeps(net, clock, store ? { store } : {}));
  await r.start(s);
  await r.whenIdle();
  return r;
}

const csvLines = async (r: CollectionRunner): Promise<string[]> => (await r.csvBlob().then((b) => b.text())).trimEnd().split('\n');

describe('the DataCite comparison is optional: its failure never stops a CSW run', () => {
  const dcRecords = recs(60, true);

  it('DataCite answering 503 HTML ("queue full") for every batch: the run finishes, the records are checked on their ISO record, the comparison is counted as not done', async () => {
    const w = catalogue(dcRecords, { dc: { total: 60, override: () => ({ status: 503, text: HTML_503 }) } });
    const r = await run(w.net, settings(true));
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.stop).toBeUndefined();
    expect(p.counts.states.checked).toBe(60);
    expect(p.counts.crossSource.notCompared).toBe(60);
    expect(p.counts.crossSource.failed).toBe(60);
    expect(p.counts.crossSource.found).toBe(0);
    // the missing comparison is no licence finding: nothing in the findings comes from DataCite
    expect(Object.keys(p.counts.rules).filter((id) => /DATACITE|MISMATCH|CONFLICT/.test(id))).toEqual([]);
  });

  it('DataCite answering 200 with HTML, or a call that throws something that is no network error: the same', async () => {
    for (const override of [() => ({ status: 200, text: HTML_503 }), () => new Error('boom inside the fetch layer')]) {
      const w = catalogue(dcRecords, { dc: { total: 60, override } });
      const p = (await run(w.net, settings(true))).progress();
      expect(p.status).toBe('finished');
      expect(p.counts.crossSource.notCompared).toBe(60);
      expect(p.counts.states.checked).toBe(60);
    }
  });

  it('a DataCite answer the parser cannot take (a bug on our side) does not stop the run either', async () => {
    const w = catalogue(dcRecords, {
      dc: {
        total: 60,
        resource: () => ({ id: '10.5555/r0', type: 'dois', get attributes(): never { throw new Error('parser blew up'); } }),
      },
    });
    const p = (await run(w.net, settings(true))).progress();
    expect(p.status).toBe('finished');
    expect(p.counts.crossSource.notCompared).toBeGreaterThan(0);
  });

  it('the page text says how many comparisons were not done', () => {
    for (const lang of LANGS) expect(UI[lang]['collection.cross.notDone']).toContain('{n}');
  });
});

describe('an unreadable page is a deferred page; three in a row stop the run with the reason, and resume goes on without losing a count', () => {
  const records = recs(200);

  it('one page of garbage: deferred, retried at the end, the run finishes with every record', async () => {
    let garbage = true;
    const w = catalogue(records, { page: (_n, start) => (start === 51 && garbage ? ((garbage = false), '<csw:GetRecordsResponse <<< not xml') : undefined) });
    const r = await run(w.net, settings(false));
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.records).toBe(200);
    expect(p.counts.states.checked).toBe(200);
    expect(p.deferred).toBe(0);
  });

  it('three unreadable pages in a row: "interrupted" with source, page, request and cause; resumable; resume finishes with all 200', async () => {
    let broken = true;
    const w = catalogue(records, { page: (_n, start) => (broken && start >= 51 ? '<html>Bad gateway, not xml' : undefined) });
    const store = memoryStore();
    const r = await run(w.net, settings(false), store);
    const p = r.progress();
    expect(p.status).toBe('interrupted');
    expect(p.resumable).toBe(true);
    expect(p.stop).toMatchObject({ cause: 'not-xml', source: 'csw:emodnet', page: 5, kind: 'unreachable' });
    expect(p.stop?.request).toBeGreaterThan(3);
    expect(p.counts.records).toBe(125); // 50 read + the three deferred pages counted as expected-but-unread: nothing is lost
    expect(p.counts.states.checked).toBe(50);
    expect(p.counts.states.unreachable).toBe(75);
    // a reloaded page sees the same reason
    const again = await new CollectionRunner(runnerDeps(w.net, virtualClock(), { store })).saved();
    expect(again?.stop).toMatchObject({ cause: 'not-xml', source: 'csw:emodnet', page: 5 });
    broken = false;
    await r.resume();
    await r.whenIdle();
    const q = r.progress();
    expect(q.status).toBe('finished');
    expect(q.stop).toBeUndefined();
    expect(q.counts.records).toBe(200);
    expect(q.counts.states.checked).toBe(200);
  });

  it('a call that fails in some unexpected way (an aborted body read) is an unreachable page, not a crashed run', async () => {
    let failing = true;
    const w = catalogue(records, { page: (_n, start) => (failing && start === 76 ? new DOMException('The operation was aborted.', 'AbortError') : undefined) });
    const r = await run(w.net, settings(false));
    // retried inside the request (3 attempts), then deferred, then retried again at the end where it works
    failing = false;
    expect(['finished', 'interrupted']).toContain(r.progress().status);
    expect(r.progress().status === 'finished' || r.progress().resumable).toBe(true);
  });

  it('an HTTP 4xx refusal stops with the status code in the reason', async () => {
    const w = catalogue(records);
    const net: Net = { ...w.net, csw: async (c) => (c.startPosition === 26 ? { status: 403, text: 'forbidden' } : w.net.csw(c)) };
    const p = (await run(net, settings(false))).progress();
    expect(p.status).toBe('failed');
    expect(p.resumable).toBe(true);
    expect(p.stop).toMatchObject({ cause: 'http', status: 403, kind: 'protocol', source: 'csw:emodnet', page: 2 });
    expect(describeStop(p.stop!, 'en')).toContain('HTTP 403');
  });
});

describe('an exception inside the run is a stop with a reason, not a silent hang', () => {
  it('a store that fails twice in a row: status failed, the cause names the error, the run is resumable and finishes when the store works again', async () => {
    const inner = memoryStore();
    let breaking = false;
    const store: RunStore = { ...inner, load: inner.load, parts: inner.parts, clear: inner.clear, save: async (run, parts) => { if (breaking) throw new Error('something broke'); return inner.save(run, parts); } };
    const w = catalogue(recs(100));
    const clock = virtualClock();
    const r = new CollectionRunner(runnerDeps(w.net, clock, { store, onProgress: (p) => { if (p.counts.records === 25) breaking = true; } }));
    await r.start(settings(false));
    await r.whenIdle();
    const p = r.progress();
    expect(p.status).toBe('failed');
    expect(p.stop).toMatchObject({ cause: 'error', source: 'csw:emodnet' });
    expect(p.stop?.detail).toContain('something broke');
    expect(p.resumable).toBe(true);
    expect(describeStop(p.stop!, 'en')).toContain('something broke');
    breaking = false;
    await r.resume();
    await r.whenIdle();
    expect(r.progress().status).toBe('finished');
    expect(r.progress().counts.records).toBe(100);
  });

  it('a single transient store error is retried and the run does not notice', async () => {
    const inner = memoryStore();
    let calls = 0;
    const store: RunStore = { ...inner, load: inner.load, parts: inner.parts, clear: inner.clear, save: async (run, parts) => { calls += 1; if (calls === 3) throw new Error('transient'); return inner.save(run, parts); } };
    const r = await run(catalogue(recs(100)).net, settings(false), store);
    expect(r.progress().status).toBe('finished');
  });
});

describe('a worker that dies mid-run', () => {
  function fakeWorker() {
    const w: CollectionWorkerLike & { sent: unknown[] } = { onmessage: null, onerror: null, onmessageerror: null, sent: [], postMessage(m) { w.sent.push(m); }, terminate() {} };
    return w;
  }
  const running = (): Progress => ({
    status: 'running',
    settings: settings(true),
    counts: { records: 75, states: { checked: 75, unreachable: 0, throttled: 0, 'unsupported-profile': 0 }, rules: {}, withFindings: 0, duplicatesInBatch: 0, invalidTokens: 0, crossSource: { looked: 0, found: 0, absent: 0, failed: 0 } },
    stats: { requests: 10, retries: 0, throttleEvents: 0 },
    elapsedMs: 1000, notices: [], deferred: 0, resumable: false, csv: { rows: 0, bytes: 0 }, ruleOrder: [],
  });

  it('a script error in the worker: waiting requests fail, the page gets "interrupted" with the worker as cause, resumable, counts kept', async () => {
    const w = fakeWorker();
    const engine = createCollectionClient(() => w);
    const seen: Progress[] = [];
    engine.onProgress((p) => seen.push(p));
    const pending = engine.progress();
    w.onmessage?.({ data: { event: 'progress', progress: running() } } as MessageEvent);
    w.onerror?.({ message: 'Uncaught TypeError: x is not a function', preventDefault() {} } as unknown as ErrorEvent);
    await expect(pending).rejects.toThrow(/worker failed/);
    const last = seen[seen.length - 1];
    expect(last.status).toBe('interrupted');
    expect(last.resumable).toBe(true);
    expect(last.counts.records).toBe(75);
    expect(last.stop).toMatchObject({ cause: 'worker', source: 'csw:emodnet', request: 10 });
    expect(last.stop?.detail).toContain('x is not a function');
    expect(describeStop(last.stop!, 'en')).toContain('x is not a function');
  });

  it('an unhandled rejection reported by the worker is the same stop; the next request starts a new worker', async () => {
    let created = 0;
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const engine = createCollectionClient(() => { created += 1; const w = fakeWorker(); workers.push(w); return w; });
    const seen: Progress[] = [];
    engine.onProgress((p) => seen.push(p));
    void engine.progress().catch(() => undefined);
    workers[0].onmessage?.({ data: { event: 'progress', progress: running() } } as MessageEvent);
    workers[0].onmessage?.({ data: { event: 'fatal', message: 'Error: out of nowhere' } } as MessageEvent);
    expect(seen[seen.length - 1].stop?.cause).toBe('worker');
    void engine.resume().catch(() => undefined);
    expect(created).toBe(2);
  });
});

describe('the stop reason in all four languages', () => {
  const at = Date.UTC(2026, 9, 22, 14, 5);
  const reasons: StopReason[] = [
    { cause: 'http', status: 503, source: 'api.datacite.org', page: 4, request: 10, kind: 'throttled', at },
    { cause: 'http', status: 500, source: 'csw:emodnet', page: 4, request: 10, kind: 'unreachable', at },
    { cause: 'http', status: 403, source: 'zenodo.org', page: 2, request: 5, kind: 'protocol', at },
    { cause: 'http', source: 'csw:emodnet', page: 2, request: 5, at },
    { cause: 'timeout', source: 'csw:emodnet', page: 9, request: 30, kind: 'unreachable', at },
    { cause: 'network', source: 'csw:emodnet', page: 9, request: 30, at },
    { cause: 'not-xml', source: 'csw:emodnet', page: 9, request: 30, at },
    { cause: 'exception', source: 'csw:emodnet', page: 9, request: 30, at },
    { cause: 'repeating-page', source: 'csw:emodnet', page: 9, request: 30, at },
    { cause: 'cursor-restarted', source: 'api.datacite.org', page: 9, request: 30, at },
    { cause: 'error', source: 'csw:emodnet', page: 9, request: 30, detail: 'Error: boom', at },
    { cause: 'error:AbortError', source: 'csw:emodnet', page: 9, request: 30, at },
    { cause: 'worker', source: 'csw:emodnet', request: 30, detail: 'Error: dead', at },
    { cause: 'closed', source: 'csw:emodnet', page: 3, request: 8, at },
    { cause: 'user', source: 'csw:emodnet', page: 3, request: 8, at },
  ];
  it('every cause gets a sentence with source, page and request where they are known, no raw key, no unfilled placeholder', () => {
    for (const lang of LANGS) {
      for (const s of reasons) {
        const text = describeStop(s, lang);
        expect(text, `${lang} ${s.cause}`).not.toMatch(/collection\.|\{\w+\}/);
        expect(text).toContain('2026-10-22 14:05');
        if (s.cause !== 'user' && s.page !== undefined) {
          expect(text).toContain(String(s.page));
          expect(text).toContain(String(s.request));
        }
        if (s.status) expect(text).toContain(String(s.status));
        if (s.cause !== 'user') expect(text).toMatch(s.source.startsWith('csw:') ? /emodnet/i : s.source === 'api.datacite.org' ? /DataCite/ : /Zenodo/);
      }
    }
  });
  it('differs between languages (nothing is left in English)', () => {
    const s = reasons[0];
    const texts = new Set(LANGS.map((l) => describeStop(s, l)));
    expect(texts.size).toBe(4);
  });
});

describe('the unfinished fix list ends with one RUN-INCOMPLETE row', () => {
  const lastRow = (lines: string[]): string[] => lines[lines.length - 1].split(',');

  it('stopped by a problem: the row names the cause; the CSV formula guard applies; a finished run has no such row', async () => {
    let broken = true;
    const w = catalogue(recs(200, false).map((r, i) => ({ ...r, licence: i % 2 ? null : 'CC BY 4.0' })), { page: (_n, start) => (broken && start >= 76 ? '<html>nope' : undefined) });
    const r = await run(w.net, settings(false));
    expect(r.progress().status).toBe('interrupted');
    const lines = await csvLines(r);
    const last = lines[lines.length - 1];
    expect(last.startsWith('(run),,RUN-INCOMPLETE,info,')).toBe(true);
    expect(last).toContain('not readable XML');
    expect(last).toContain('Resume the run.');
    expect(last.endsWith('csw:emodnet')).toBe(true);
    expect(lines.filter((l) => l.includes('RUN-INCOMPLETE'))).toHaveLength(1);
    expect(r.progress().csv.rows).toBe(lines.length - 2); // header and the status row are not findings
    broken = false;
    await r.resume();
    await r.whenIdle();
    expect(r.progress().status).toBe('finished');
    expect((await csvLines(r)).some((l) => l.includes('RUN-INCOMPLETE'))).toBe(false);
  });

  it('stopped by the user: the row says so', async () => {
    const clock = virtualClock();
    let r!: CollectionRunner;
    const w = catalogue(recs(200).map((x) => ({ ...x, licence: null })), { page: (n) => { if (n === 2) void r.stop(); return undefined; } });
    r = new CollectionRunner(runnerDeps(w.net, clock));
    await r.start(settings(false, 'pl'));
    await r.whenIdle();
    expect(r.progress().status).toBe('stopped');
    expect(r.progress().stop?.cause).toBe('user');
    const last = (await csvLines(r)).pop()!;
    expect(last).toContain('RUN-INCOMPLETE');
    expect(last).toContain('Zatrzymane przez użytkownika');
    expect(last).toContain('Wznów przebieg.');
  });

  it('paused: the row says paused', async () => {
    const clock = virtualClock();
    let r!: CollectionRunner;
    const w = catalogue(recs(100).map((x) => ({ ...x, licence: null })), { page: (n) => { if (n === 1) r.pause(); return undefined; } });
    r = new CollectionRunner(runnerDeps(w.net, clock));
    await r.start(settings(false));
    await new Promise((res) => setTimeout(res, 20));
    expect(r.progress().status).toBe('paused');
    const last = (await csvLines(r)).pop()!;
    expect(last).toContain('RUN-INCOMPLETE');
    expect(last).toContain('paused');
    await r.stop();
  });

  it('a stop reason that starts like a formula cannot become one: the row passes the same guard as every row', async () => {
    const w = catalogue(recs(100).map((x) => ({ ...x, licence: null })));
    const r = new CollectionRunner(runnerDeps(w.net, virtualClock()));
    await r.start(settings(false));
    await r.whenIdle();
    // finished -> no row; then force an unfinished state whose detail starts with "="
    const st = (r as unknown as { st: { status: string; stop: StopReason } }).st;
    st.status = 'failed';
    st.stop = { cause: 'error', source: 'csw:emodnet', page: 1, request: 1, detail: '=HYPERLINK("http://x","y")', at: 0 };
    const text = await r.csvBlob().then((b) => b.text());
    const row = text.trimEnd().split('\n').pop()!;
    expect(row).toContain('RUN-INCOMPLETE');
    expect(row).not.toMatch(/,"?=/); // no field starts with =
    expect(lastRow([row])[0]).toBe('(run)');
  });
});

describe('M1: the daily catalogue budget of this connection', () => {
  const records = recs(200);

  it('a refusal "csw_daily_budget" is not retried and not deferred: the run is interrupted at that page, saved, and resume reads every record exactly once', async () => {
    let spent = true;
    const calls: number[] = [];
    const inner = catalogue(records);
    const net: Net = {
      get: inner.net.get,
      async csw(call: CswCall): Promise<NetResponse> {
        if (call.op === 'GetRecords' && call.maxRecords === 25) {
          calls.push(call.startPosition ?? 0);
          if (spent && (call.startPosition ?? 0) >= 76) return { status: 429, text: '{"error":"csw_daily_budget"}', retryAfterMs: 80_000_000, proxyError: 'csw_daily_budget' };
        }
        return inner.net.csw(call);
      },
    };
    const store = memoryStore();
    const r = await run(net, settings(false), store);
    const p = r.progress();
    expect(p.status).toBe('interrupted');
    expect(p.resumable).toBe(true);
    expect(p.deferred).toBe(0);
    expect(p.stop).toMatchObject({ cause: 'csw_daily_budget', source: 'csw:emodnet', kind: 'throttled', status: 429 });
    expect(calls.filter((c) => c === 76)).toHaveLength(1); // no backoff loop on a budget that is gone for hours
    expect(p.counts.records).toBe(75);
    for (const lang of LANGS) {
      const text = describeStop(p.stop!, lang);
      expect(text, lang).not.toContain('csw_daily_budget');
      expect(text, lang).not.toMatch(/\{\w+\}/);
    }
    spent = false;
    await r.resume();
    await r.whenIdle();
    const q = r.progress();
    expect(q.status).toBe('finished');
    expect(q.counts.records).toBe(200);
    expect(q.counts.states.checked).toBe(200);
  });

  it('the page notice exists in four languages', () => {
    for (const lang of LANGS) {
      for (const k of ['collection.cause.csw_daily_budget', 'collection.error.dailyBudget'] as const) expect(UI[lang][k], `${lang} ${k}`).toMatch(/24/);
    }
  });
});
