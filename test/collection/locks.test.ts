// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// One tab at a time runs a saved run (Web Locks), storage errors of the browser are the storage notice, and a deferred page that carried an
// overlap is not reported as missing records.
import { describe, expect, it } from 'vitest';
import { CollectionRunner, RUN_LOCK, RUN_OPEN_ELSEWHERE, type LockManagerLike } from '../../src/core/collection/runner';
import type { Net } from '../../src/core/collection/net';
import { memoryStore } from '../../src/core/collection/store';
import { UI } from '../../src/core/i18n/ui';
import { CAPABILITIES, catalogueAnswer, gmdRecord, runnerDeps, searchResults, virtualClock, type CatalogueRecord } from './helpers';

const spec = { spec: { kind: 'csw', catalogue: 'emodnet', schema: 'iso19139', crossSource: false }, lang: 'en', sample: false } as const;
const records = (n: number): CatalogueRecord[] => Array.from({ length: n }, (_, i) => ({ id: `u${i + 1}`, licence: 'CC BY 4.0' }));
const net = (rs: CatalogueRecord[], hook: (c: { startPosition?: number; maxRecords?: number }, n: number) => { status: number; text: string; proxyError?: string } | undefined = () => undefined, overlap?: number): Net => {
  const seen = new Map<number, number>();
  return {
    async get() {
      throw new Error('no');
    },
    async csw(c) {
      if (c.op === 'GetCapabilities') return { status: 200, text: CAPABILITIES };
      if (c.startPosition === 1 && c.maxRecords === 1) return { status: 200, text: searchResults(rs.length, 1, 2, [gmdRecord(rs[0])]) };
      const n = (seen.get(c.startPosition ?? 0) ?? 0) + 1;
      seen.set(c.startPosition ?? 0, n);
      return hook(c, n) ?? { status: 200, text: catalogueAnswer({ claimed: rs.length, records: rs, ...(overlap && c.startPosition === 1 ? { overlap } : {}) }, c.startPosition ?? 1, c.maxRecords ?? 25) };
    },
  };
};

/** A Web Locks stand-in: one holder per name; ifAvailable gives null while it is held. */
function fakeLocks() {
  const state = { held: false, requests: 0 };
  const locks: LockManagerLike = {
    async request(name, options, cb) {
      expect(name).toBe(RUN_LOCK);
      expect(options).toEqual({ mode: 'exclusive', ifAvailable: true });
      state.requests += 1;
      if (state.held) return cb(null);
      state.held = true;
      try {
        return await cb({ name });
      } finally {
        state.held = false;
      }
    },
  };
  return { locks, state };
}

describe('one tab at a time runs a saved run', () => {
  it('a lock held elsewhere refuses start() and resume() (nothing of the saved run is touched); once released they go ahead and the lock is let go at the end', async () => {
    const { locks, state } = fakeLocks();
    const store = memoryStore();
    const a = new CollectionRunner(runnerDeps(net(records(100)), virtualClock(), { locks, store }));
    await a.start(spec);
    expect(state.held).toBe(true); // held for the whole loop
    const other = new CollectionRunner(runnerDeps(net(records(100)), virtualClock(), { locks, store }));
    await expect(other.start(spec)).rejects.toThrow(RUN_OPEN_ELSEWHERE);
    await other.saved();
    await expect(other.resume()).rejects.toThrow(RUN_OPEN_ELSEWHERE);
    await a.whenIdle();
    expect(state.held).toBe(false);
    expect(a.progress().status).toBe('finished');
    expect(a.progress().counts.records).toBe(100); // the second tab did not clear or write
    await other.start(spec); // free now
    await other.whenIdle();
    expect(other.progress().status).toBe('finished');
    expect(state.held).toBe(false);
  });

  it('a start that fails lets the lock go; with no Web Locks API the run goes ahead as before', async () => {
    const { locks, state } = fakeLocks();
    const bad = new CollectionRunner(runnerDeps(net(records(100), (c) => (c.maxRecords === 1 ? { status: 404, text: '' } : undefined)), virtualClock(), { locks }));
    await bad.start(spec).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 0)); // the lock callback's promise settles
    expect(state.held).toBe(false);
    const none = new CollectionRunner(runnerDeps(net(records(30)), virtualClock(), { locks: null }));
    await none.start(spec);
    await none.whenIdle();
    expect(none.progress().status).toBe('finished');
  });

  it('the refusal exists in four languages', () => {
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) expect(UI[lang]['collection.error.otherTab' as never], lang).toBeTruthy();
  });
});

describe('a storage error of the browser other than a quota is the storage notice', () => {
  it.each(['VersionError', 'InvalidStateError'])('%s while saving the progress', async (name) => {
    const inner = memoryStore();
    let calls = 0;
    const store = { ...inner, load: inner.load, parts: inner.parts, clear: inner.clear, saveText: inner.saveText, loadText: inner.loadText, save: async (run: never, parts?: never) => { calls += 1; if (calls > 2) throw Object.assign(new Error('The requested version is less than the existing version'), { name }); return inner.save(run, parts); } };
    const r = new CollectionRunner(runnerDeps(net(records(100)), virtualClock(), { store }));
    await r.start(spec);
    await r.whenIdle();
    expect(r.progress().status).toBe('failed');
    expect(r.progress().notices).toContainEqual({ code: 'storage-failed' });
    expect(r.progress().stop).toMatchObject({ cause: 'storage' });
  });
});

describe('a deferred page that carried an overlap', () => {
  it('H2: page 23 is deferred after page 1 overlapped by 3; read again without overlap it reports nothing missing', async () => {
    const bad = { status: 504, text: '', proxyError: 'csw_slow' };
    const r = new CollectionRunner(runnerDeps(net(records(100), (c, n) => (c.startPosition === 23 && n <= 5 ? bad : undefined), 3), virtualClock()));
    await r.start(spec);
    await r.whenIdle();
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.states.checked).toBe(100);
    expect(p.notices.some((n) => n.code === 'records-missing')).toBe(false);
    expect(await (await r.csvBlob()).text()).not.toContain('RUN-INCOMPLETE');
  });
});
