// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { CollectionRunner, CSV_PART_CHARS, SAMPLES_PER_RULE } from '../../src/core/collection/runner';
import { fixListHeader, fixListRow } from '../../src/core/collection/fixlist';
import { idbStore, memoryStore } from '../../src/core/collection/store';
import type { RunRecord, RunSettings } from '../../src/core/collection/types';
import { makeFinding } from '../../src/core/rules/registry';
import { createCollectionClient, createDirectCollectionEngine, type CollectionWorkerLike } from '../../src/worker/collection.client';
import { createCollectionHandler } from '../../src/worker/collection.handler';
import { dataciteMock, runnerDeps, virtualClock } from './helpers';

const client = (sample = false): RunSettings => ({ spec: { kind: 'datacite', by: 'client', id: 'test.client' }, lang: 'en', sample });
const text = (b: Blob): Promise<string> => b.text();

describe('the fix list', () => {
  it('has the columns record, field, rule_id, severity, problem, suggested_fix, source and the formula guard on every text field', () => {
    expect(fixListHeader()).toBe('record,field,rule_id,severity,problem,suggested_fix,source\n');
    const f = makeFinding('LIC-FREE-TEXT', { file: 'x', field: '=1+1', params: { text: 'see "site"', versionMissing: 'yes', hint: 'CC-BY-4.0' } });
    const row = fixListRow('=cmd|calc', f, 'en', 'csw:emodnet');
    expect(row.startsWith("'=cmd|calc,'=1+1,LIC-FREE-TEXT,warning,")).toBe(true);
    expect(row).toContain(',CC-BY-4.0,csw:emodnet\n');
    expect(row).toContain('""site""'); // RFC 4180 quoting of the plain text
  });

  it('the problem column is in the language of the page', () => {
    const f = makeFinding('LIC-MISSING', { file: 'x' });
    expect(fixListRow('r', f, 'pl', 'datacite')).toContain('nie znaleziono licencji');
    expect(fixListRow('r', f, 'fr', 'datacite')).toMatch(/licence/i);
  });

  it('a run writes rows only for checked records and download() returns header + parts + buffer', async () => {
    const clock = virtualClock();
    const mock = dataciteMock({ total: 10, clock });
    const r = new CollectionRunner(runnerDeps(mock.net, clock));
    await r.start(client());
    await r.whenIdle();
    const csv = await text(await r.csvBlob());
    const lines = csv.trimEnd().split('\n');
    expect(lines[0]).toBe('record,field,rule_id,severity,problem,suggested_fix,source');
    expect(lines.length - 1).toBe(r.progress().csv.rows);
    expect(lines.some((l) => l.startsWith('10.5555/r1,') && l.includes(',LIC-MISSING,error,'))).toBe(true);
    expect(lines.every((l, i) => i === 0 || l.endsWith(',datacite'))).toBe(true);
    expect(r.fileName()).toBe('fix-list-2026-10-22.csv');
  });
});

describe('IndexedDB store', () => {
  it('saves the run and its parts together, loads them back, and clear() deletes both', async () => {
    const store = idbStore(new IDBFactory());
    expect(await store.load()).toBeNull();
    const run = { id: 'a', version: 1 } as unknown as RunRecord;
    await store.save(run, [{ index: 0, blob: new Blob(['one,']) }, { index: 1, blob: new Blob(['two']) }]);
    expect(((await store.load()) as unknown as { id: string }).id).toBe('a');
    const parts = await store.parts('a', 2);
    expect((await Promise.all(parts.map(text))).join('')).toBe('one,two');
    await store.clear();
    expect(await store.load()).toBeNull();
    expect(await store.parts('a', 2)).toEqual([]);
  });

  it('flushes the CSV to ~1 MB Blob parts and a run restored from IndexedDB downloads the identical file', async () => {
    const clock = virtualClock();
    const factory = new IDBFactory();
    const mock = dataciteMock({ total: 12_000, clock });
    const a = new CollectionRunner(runnerDeps(mock.net, clock, { store: idbStore(factory) }));
    await a.start(client());
    await a.whenIdle();
    const pa = a.progress();
    expect(pa.csv.rows).toBeGreaterThan(10_000);
    const csvA = await text(await a.csvBlob());
    // a new page load: a fresh runner over the same database
    const b = new CollectionRunner(runnerDeps(mock.net, clock, { store: idbStore(factory) }));
    const saved = await b.saved();
    expect(saved?.counts).toEqual(pa.counts);
    expect(await text(await b.csvBlob())).toBe(csvA);
    const st = await idbStore(factory).load();
    expect(st!.partCount).toBeGreaterThanOrEqual(2);
    expect(st!.csvBuffer.length).toBeLessThan(CSV_PART_CHARS + 2000);
    await b.discard();
    expect(await idbStore(factory).load()).toBeNull();
    expect((await b.saved())).toBeNull();
  });
});

describe('pause, stop, resume, discard', () => {
  it('pause holds at a page boundary and resume goes on in the same run', async () => {
    const clock = virtualClock();
    let runner!: CollectionRunner;
    let paused = false;
    const mock = dataciteMock({
      total: 5000,
      clock,
      override: (n) => {
        if (n === 3 && !paused) {
          paused = true;
          runner.pause();
        }
        return undefined;
      },
    });
    runner = new CollectionRunner(runnerDeps(mock.net, clock));
    await runner.start(client());
    await new Promise((r) => setTimeout(r, 30));
    expect(runner.progress().status).toBe('paused');
    const at = runner.progress().counts.records;
    expect(at).toBeLessThan(5000);
    await new Promise((r) => setTimeout(r, 30));
    expect(runner.progress().counts.records).toBe(at); // nothing moves while paused
    await runner.resume();
    await runner.whenIdle();
    expect(runner.progress().status).toBe('finished');
    expect(runner.progress().counts.records).toBe(5000);
  });

  it('stop ends the run, saves it, and resume() of a NEW runner (a reloaded page) finishes it', async () => {
    const clock = virtualClock();
    const store = memoryStore();
    let runner!: CollectionRunner;
    const mock = dataciteMock({ total: 4000, clock, override: (n) => (n === 3 ? void runner.stop() : undefined) });
    runner = new CollectionRunner(runnerDeps(mock.net, clock, { store }));
    await runner.start(client());
    await runner.whenIdle();
    expect(runner.progress().status).toBe('stopped');
    expect(runner.progress().resumable).toBe(true);
    const mid = runner.progress().counts.records;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(4000);

    const again = new CollectionRunner(runnerDeps(dataciteMock({ total: 4000, clock }).net, clock, { store }));
    const saved = await again.saved();
    expect(saved?.status).toBe('stopped');
    await again.resume();
    await again.whenIdle();
    expect(again.progress().status).toBe('finished');
    expect(again.progress().counts.records).toBe(4000);
    expect(again.progress().resumable).toBe(false);
  });

  it('a run that was "running" when the tab closed is offered as interrupted', async () => {
    const store = memoryStore();
    const run = { id: 'x', version: 1, status: 'running', counts: { records: 5, states: {}, rules: {}, crossSource: {} }, deferred: [], notices: [], stats: {}, settings: client(), csvRows: 0, csvBytes: 0 } as unknown as RunRecord;
    await store.save(run);
    const r = new CollectionRunner(runnerDeps(dataciteMock({ total: 1 }).net, virtualClock(), { store }));
    const p = await r.saved();
    expect(p?.status).toBe('interrupted');
    expect(p?.resumable).toBe(true);
  });

  it('discard deletes the saved progress and the parts', async () => {
    const clock = virtualClock();
    const store = memoryStore();
    const r = new CollectionRunner(runnerDeps(dataciteMock({ total: 3000, clock }).net, clock, { store }));
    await r.start(client());
    await r.whenIdle();
    expect(await store.load()).not.toBeNull();
    await r.discard();
    expect(await store.load()).toBeNull();
    expect(store.partCount()).toBe(0);
    expect(r.progress().status).toBe('idle');
  });

  it('start() replaces a saved run; a second start while one is going is refused', async () => {
    const clock = virtualClock();
    const store = memoryStore();
    const a = new CollectionRunner(runnerDeps(dataciteMock({ total: 1000, clock }).net, clock, { store }));
    await a.start(client());
    await expect(a.start(client())).rejects.toThrow(/already/);
    await a.whenIdle();
    const b = new CollectionRunner(runnerDeps(dataciteMock({ total: 10, clock }).net, clock, { store }));
    await b.start(client());
    await b.whenIdle();
    expect((await store.load())!.counts.records).toBe(10);
  });

  it('saveTo streams the parts into a file handle', async () => {
    const clock = virtualClock();
    const r = new CollectionRunner(runnerDeps(dataciteMock({ total: 20, clock }).net, clock));
    await r.start(client());
    await r.whenIdle();
    const written: BlobPart[] = [];
    let closed = false;
    await r.saveTo({ createWritable: async () => ({ write: async (d) => void written.push(d), close: async () => void (closed = true) }) });
    expect(closed).toBe(true);
    expect(written[0]).toBe(fixListHeader());
    expect(await text(new Blob(written))).toBe(await text(await r.csvBlob()));
  });
});

describe('estimate', () => {
  it('turns the total into records, requests and seconds before anything is read', async () => {
    const clock = virtualClock();
    const mock = dataciteMock({ total: 2124, clock });
    const r = new CollectionRunner(runnerDeps(mock.net, clock));
    const e = await r.estimate({ kind: 'datacite', by: 'client', id: 'euvi.seanoe' }, false);
    expect(e).toMatchObject({ records: 2124, requests: 3, strategy: 'cursor', sample: false });
    expect(e.seconds).toBeGreaterThan(0);
    expect(mock.urls).toHaveLength(1); // one request for the total
    const s = await r.estimate({ kind: 'datacite', by: 'client', id: 'euvi.seanoe' }, true);
    expect(s).toMatchObject({ sample: true, requests: 22, records: 2124 });
    const small = await new CollectionRunner(runnerDeps(dataciteMock({ total: 440_035, clock }).net, clock)).estimate({ kind: 'datacite', by: 'client', id: 'pangaea.repository' }, true);
    expect(small).toMatchObject({ sample: true, requests: 30, records: 3000 });
  });
});

describe('bounded state and resume, 100 000 records', () => {
  const big = async (interruptAfter?: number) => {
    const clock = virtualClock();
    const factory = new IDBFactory();
    let runner!: CollectionRunner;
    const mk = (): { mock: ReturnType<typeof dataciteMock> } => ({
      mock: dataciteMock({
        total: 100_000,
        clock,
        override: (n) => (interruptAfter !== undefined && n === interruptAfter ? void runner.stop() : undefined),
      }),
    });
    runner = new CollectionRunner(runnerDeps(mk().mock.net, clock, { store: idbStore(factory) }));
    await runner.start(client());
    await runner.whenIdle();
    if (interruptAfter !== undefined) {
      expect(runner.progress().status).toBe('stopped');
      // the tab is closed and reopened: a new runner, the same database
      runner = new CollectionRunner(runnerDeps(dataciteMock({ total: 100_000, clock }).net, clock, { store: idbStore(factory) }));
      await runner.saved();
      await runner.resume();
      await runner.whenIdle();
    }
    return { runner, factory };
  };

  it('keeps counters, <= 50 samples a rule and ~1 MB of buffer, and an interrupted+resumed run ends with the identical counts, samples and file', async () => {
    const whole = await big();
    const resumed = await big(41);
    for (const { runner } of [whole, resumed]) {
      const p = runner.progress();
      expect(p.status).toBe('finished');
      expect(p.counts.records).toBe(100_000);
      expect(p.counts.states.checked).toBe(100_000);
      expect(p.counts.rules['LIC-MISSING']).toBe(20_000);
    }
    const a = whole.runner.progress();
    const b = resumed.runner.progress();
    expect(b.counts).toEqual(a.counts);
    expect(b.csv.rows).toBe(a.csv.rows);
    expect(b.ruleOrder).toEqual(a.ruleOrder);
    for (const rule of Object.keys(a.counts.rules)) expect(resumed.runner.samples(rule, 0, 100)).toEqual(whole.runner.samples(rule, 0, 100));

    // bounded: what is held and what is saved does not depend on the number of records
    const saved = (await idbStore(whole.factory).load())!;
    for (const list of Object.values(saved.samples)) expect(list.length).toBeLessThanOrEqual(SAMPLES_PER_RULE);
    expect(saved.csvBuffer.length).toBeLessThan(CSV_PART_CHARS + 2000);
    expect(saved.deferred).toHaveLength(0);
    expect(JSON.stringify(saved).length - saved.csvBuffer.length).toBeLessThan(250_000);
    expect(JSON.stringify(whole.runner.progress()).length).toBeLessThan(10_000);
    expect(Object.keys(saved.counts.rules).length).toBeLessThan(20);
    expect(saved.partCount).toBeGreaterThan(5); // the rows went to disk-backed parts, not to memory

    // the file is the same, byte for byte
    const fa = await text(await whole.runner.csvBlob());
    const fb = await text(await resumed.runner.csvBlob());
    expect(fb.length).toBe(fa.length);
    expect(fb === fa).toBe(true);
    expect(fa.split('\n').length - 2).toBe(a.csv.rows);
  }, 300_000);
});

describe('worker client and handler', () => {
  it('the client talks to a handler over the wire format: requests get answers, progress arrives as events, failures as "kind: reason"', async () => {
    const clock = virtualClock();
    const mock = dataciteMock({ total: 2000, clock });
    const { handle } = createCollectionHandler(runnerDeps(mock.net, clock));
    let w!: CollectionWorkerLike;
    const fake: CollectionWorkerLike = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage(msg) {
        handle(msg.req).then(
          (result) => w.onmessage?.({ data: { id: msg.id, ok: true, result } } as MessageEvent),
          (err: Error & { kind?: string; reason?: string }) => w.onmessage?.({ data: { id: msg.id, ok: false, error: err.kind ? `${err.kind}: ${err.reason}` : err.message } } as MessageEvent),
        );
      },
      terminate() {},
    };
    w = fake;
    const engine = createCollectionClient(() => fake);
    expect(await engine.saved()).toBeNull();
    const est = await engine.estimate({ kind: 'datacite', by: 'client', id: 'euvi.seanoe' }, false);
    expect(est.records).toBe(2000);
    await expect(engine.start({ spec: { kind: 'datacite', by: 'client', id: 'bad id' }, lang: 'en', sample: false })).rejects.toThrow('protocol: bad-id');
    await engine.start(client());
    for (let i = 0; i < 50 && (await engine.progress()).status !== 'finished'; i++) await new Promise((r) => setTimeout(r, 10));
    const p = await engine.progress();
    expect(p.status).toBe('finished');
    expect((await engine.samples('LIC-MISSING', 0, 5)).length).toBe(5);
    expect((await engine.samples('LIC-MISSING', 5, 1000)).length).toBe(SAMPLES_PER_RULE - 5);
    const dl = await engine.download();
    expect(dl.fileName).toBe('fix-list-2026-10-22.csv');
    expect((await dl.blob.text()).startsWith('record,field,rule_id')).toBe(true);
    await engine.discard();
    expect(await engine.saved()).toBeNull();
  });

  it('the direct engine pushes progress to subscribers', async () => {
    const clock = virtualClock();
    const direct = createDirectCollectionEngine(runnerDeps(dataciteMock({ total: 3000, clock }).net, clock));
    const seen: string[] = [];
    const off = direct.onProgress((p) => seen.push(p.status));
    await direct.start(client());
    await direct.runner.whenIdle();
    off();
    expect(seen).toContain('running');
    expect(seen[seen.length - 1]).toBe('finished');
  });
});
