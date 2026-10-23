// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The pasted DOI list is stored ONCE (its own entry); checkpoints keep only the position and progress messages never carry the list.
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { CollectionRunner } from '../../src/core/collection/runner';
import { idbStore, memoryStore } from '../../src/core/collection/store';
import type { Progress } from '../../src/core/collection/types';
import { dataciteMock, res, runnerDeps, virtualClock } from './helpers';

const text = Array.from({ length: 250 }, (_, i) => `10.5555/r${i}`).join('\n');
/** two neighbours of the pasted list: found anywhere, the list was copied */
const PAIR = '10.5555/r1\\n10.5555/r2';
const settings = { spec: { kind: 'dois', text }, lang: 'en', sample: false } as const;

async function interruptedRun() {
  const clock = virtualClock();
  let broken = true;
  const mock = dataciteMock({ total: 250, clock, override: (_n, u) => (broken && (u.searchParams.get('ids') ?? '').split(',').includes('10.5555/r120') ? res(503, '<html>busy</html>') : undefined) });
  const store = memoryStore();
  const saves: string[] = [];
  const saveText = store.saveText;
  store.saveText = async (id, t) => {
    saves.push(t);
    return saveText(id, t);
  };
  const progress: Progress[] = [];
  const r = new CollectionRunner(runnerDeps(mock.net, clock, { store, onProgress: (p) => progress.push(p) }));
  await r.start(settings);
  await r.whenIdle();
  return { r, store, saves, progress, fix: () => (broken = false), clock, mock };
}

describe('the pasted DOI list is kept once', () => {
  it('is saved once at the start; the run record and every progress message carry no list', async () => {
    const { r, store, saves, progress } = await interruptedRun();
    expect(saves).toEqual([text]);
    const saved = await store.load();
    expect(JSON.stringify(saved)).not.toContain(PAIR);
    expect(saved?.settings.spec).toEqual({ kind: 'dois', text: '' });
    expect(progress.length).toBeGreaterThan(2);
    for (const p of progress) expect(JSON.stringify(p)).not.toContain(PAIR);
    expect(JSON.stringify(r.progress())).not.toContain(PAIR);
    expect(r.progress().settings?.spec.kind).toBe('dois');
  });

  it('a resume (also in a fresh runner, from the store) reads the same list: identical results to an uninterrupted run', async () => {
    const clock = virtualClock();
    const whole = new CollectionRunner(runnerDeps(dataciteMock({ total: 250, clock }).net, clock));
    await whole.start(settings);
    await whole.whenIdle();

    const first = await interruptedRun();
    expect(first.r.progress().status).toBe('finished');
    expect(first.r.progress().deferred).toBe(1);
    first.fix();
    const again = new CollectionRunner(runnerDeps(first.mock.net, first.clock, { store: first.store }));
    await again.saved();
    await again.resume();
    await again.whenIdle();
    const a = again.progress();
    const b = whole.progress();
    expect(a.status).toBe('finished');
    expect(a.counts).toEqual(b.counts);
    // the page that failed is read last on a resume, so the rows come in another order; the same rows
    const rows = async (r: CollectionRunner): Promise<string[]> => (await (await r.csvBlob()).text()).trimEnd().split('\n').sort();
    expect(await rows(again)).toEqual(await rows(whole));
  });

  it('a run saved before the list had its own entry (text inside the record) still resumes', async () => {
    const { store, fix, clock, mock } = await interruptedRun();
    const old = (await store.load())!;
    old.settings = { ...old.settings, spec: { kind: 'dois', text } };
    await store.save(old);
    await store.clear().then(() => store.save(old));
    fix();
    const r = new CollectionRunner(runnerDeps(mock.net, clock, { store }));
    await r.saved();
    await r.resume();
    await r.whenIdle();
    expect(r.progress().status).toBe('finished');
    expect(r.progress().counts.records).toBe(250);
  });
});

describe('IndexedDB store: the pasted list has its own entry', () => {
  it('saves, loads and is deleted by clear()', async () => {
    const store = idbStore(new IDBFactory());
    expect(await store.loadText('a')).toBeNull();
    await store.saveText('a', 'hello list');
    expect(await store.loadText('a')).toBe('hello list');
    await store.clear();
    expect(await store.loadText('a')).toBeNull();
  });

  it('a database created by the earlier version (no texts store) is upgraded and keeps its run', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const req = factory.open('collection-review', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('run').put({ id: 'old', version: 1 }, 'current');
        req.result.createObjectStore('parts');
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    const store = idbStore(factory);
    expect(((await store.load()) as unknown as { id: string }).id).toBe('old');
    await store.saveText('old', 'x');
    expect(await store.loadText('old')).toBe('x');
  });
});
