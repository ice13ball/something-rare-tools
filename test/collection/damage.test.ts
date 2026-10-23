// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A tab must not take the saved run from under another one (discard, resume from a stale copy), and a fix list with parts missing from
// the store is never presented as complete.
import { describe, expect, it } from 'vitest';
import { CSV_DAMAGED, CollectionRunner, RUN_CHANGED, RUN_OPEN_ELSEWHERE, type LockManagerLike } from '../../src/core/collection/runner';
import type { Net } from '../../src/core/collection/net';
import { memoryStore, type RunStore } from '../../src/core/collection/store';
import { UI } from '../../src/core/i18n/ui';
import { CAPABILITIES, catalogueAnswer, gmdRecord, runnerDeps, searchResults, virtualClock, type CatalogueRecord } from './helpers';

const spec = { spec: { kind: 'csw', catalogue: 'emodnet', schema: 'iso19139', crossSource: false }, lang: 'en', sample: false } as const;
const tick = () => new Promise((r) => setTimeout(r, 5));

function fakeLocks() {
  const state = { held: false };
  const locks: LockManagerLike = {
    async request(_n, _o, cb) {
      if (state.held) return cb(null);
      state.held = true;
      try {
        return await cb({});
      } finally {
        state.held = false;
      }
    },
  };
  return { locks, state };
}

const mkNet = (N: number, idLen = 0): Net => {
  const records: CatalogueRecord[] = Array.from({ length: N }, (_, i) => ({ id: `u${i + 1}${'x'.repeat(idLen)}`, licence: null }));
  return {
    async get() {
      throw new Error('no');
    },
    async csw(c) {
      await new Promise((r) => setTimeout(r, 0));
      if (c.op === 'GetCapabilities') return { status: 200, text: CAPABILITIES };
      if (c.startPosition === 1 && c.maxRecords === 1) return { status: 200, text: searchResults(N, 1, 2, [gmdRecord(records[0])]) };
      return { status: 200, text: catalogueAnswer({ claimed: N, records }, c.startPosition ?? 1, c.maxRecords ?? 25) };
    },
  };
};

describe('discard() and the run lock', () => {
  it('a tab that only shows the run cannot discard it while another tab runs it; the run is whole at the end', async () => {
    const { locks } = fakeLocks();
    const store = memoryStore();
    const a = new CollectionRunner(runnerDeps(mkNet(600), virtualClock(), { locks, store }));
    await a.start(spec);
    const b = new CollectionRunner(runnerDeps(mkNet(600), virtualClock(), { locks, store }));
    await b.saved();
    await expect(b.discard()).rejects.toThrow(RUN_OPEN_ELSEWHERE);
    await a.whenIdle();
    expect(a.progress().status).toBe('finished');
    expect(a.progress().counts.records).toBe(600);
    const csv = (await (await a.csvBlob()).text()).trimEnd().split('\n');
    expect(csv.length - 1).toBe(a.progress().csv.rows);
    await tick();
    await b.discard(); // free now
    expect(b.progress().status).toBe('idle');
  });
});

describe('a fix list with parts missing is never silently shorter', () => {
  const N = 3000;
  async function bigRun() {
    const inner = memoryStore();
    const r = new CollectionRunner(runnerDeps(mkNet(N, 300), virtualClock(), { store: inner }));
    await r.start(spec);
    await r.whenIdle();
    expect(inner.partCount()).toBeGreaterThan(1);
    return { inner, r };
  }
  const withoutPart = (inner: RunStore, drop: number): RunStore => ({ ...inner, load: inner.load, save: inner.save, clear: inner.clear, saveText: inner.saveText, loadText: inner.loadText, parts: async (id, count) => (await inner.parts(id, count)).filter((_, i) => i !== drop) });

  it('csvBlob() and saveTo() fail with the storage-damage error and the progress says the list is damaged', async () => {
    const { inner, r } = await bigRun();
    const store = withoutPart(inner, 1);
    const damaged = new CollectionRunner(runnerDeps(mkNet(N, 300), virtualClock(), { store }));
    const p = await damaged.saved();
    expect(p?.notices).toContainEqual({ code: 'csv-damaged' }); // seen as soon as the saved run is loaded
    await expect(damaged.csvBlob()).rejects.toThrow(CSV_DAMAGED);
    await expect(damaged.saveTo({ createWritable: async () => ({ write: async () => undefined, close: async () => undefined }) })).rejects.toThrow(CSV_DAMAGED);
    // the intact run is unaffected
    expect((await (await r.csvBlob()).text()).length).toBeGreaterThan(1_000_000);
    expect(r.progress().notices.some((n) => n.code === 'csv-damaged')).toBe(false);
  });

  it('a run that finishes while its parts are being deleted ends marked damaged, not complete', async () => {
    const inner = memoryStore();
    let gone = false;
    const store: RunStore = { ...inner, load: inner.load, save: inner.save, clear: inner.clear, saveText: inner.saveText, loadText: inner.loadText, parts: async (id, count) => (gone ? (await inner.parts(id, count)).slice(1) : inner.parts(id, count)) };
    const r = new CollectionRunner(runnerDeps(mkNet(N, 300), virtualClock(), { store, onProgress: (p) => { if (p.csv.bytes > 2_200_000) gone = true; } }));
    await r.start(spec);
    await r.whenIdle();
    expect(r.progress().status).toBe('finished');
    expect(r.progress().notices).toContainEqual({ code: 'csv-damaged' });
    await expect(r.csvBlob()).rejects.toThrow(CSV_DAMAGED);
  });

  it('the notice exists in four languages', () => {
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) for (const k of ['collection.notice.csv-damaged', 'collection.error.runChanged'] as const) expect(UI[lang][k], `${lang} ${k}`).toBeTruthy();
  });
});

describe('resume() from a stale copy', () => {
  it('refuses when another tab has started a newer run since; the newer run is untouched', async () => {
    const store = memoryStore();
    const a = new CollectionRunner(runnerDeps(mkNet(1000), virtualClock(), { store, newId: () => 'run-a' }));
    await a.start(spec);
    await tick();
    await a.stop(); // stopped, resumable, still in tab A's memory
    const b = new CollectionRunner(runnerDeps(mkNet(100), virtualClock(), { store, newId: () => 'run-b' }));
    await b.start(spec); // another tab: a new run replaces the saved one
    await b.whenIdle();
    await expect(a.resume()).rejects.toThrow(RUN_CHANGED);
    expect((await store.load())?.id).toBe('run-b');
    expect((await store.load())?.status).toBe('finished');
  });

  it('refuses when the saved run was deleted in another tab', async () => {
    const store = memoryStore();
    const a = new CollectionRunner(runnerDeps(mkNet(1000), virtualClock(), { store }));
    await a.start(spec);
    await tick();
    await a.stop();
    await store.clear();
    await expect(a.resume()).rejects.toThrow(RUN_CHANGED);
  });
});
