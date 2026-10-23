// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Where a run is kept between page loads: the browser's IndexedDB, on this device only. One saved run at a time ('run' store, key
// 'current') and its fix-list parts ('parts' store, one Blob each, ~1 MB). A checkpoint writes the run and a new part in ONE
// transaction, so the cursor, the counts and the CSV text on disk always belong together. Nothing is sent anywhere.
import type { RunRecord } from './types';

export interface NewPart {
  index: number;
  blob: Blob;
}

export interface RunStore {
  load(): Promise<RunRecord | null>;
  /** Atomic: the run record and the parts written since the last save. */
  save(run: RunRecord, parts?: readonly NewPart[]): Promise<void>;
  /** The saved parts of a run in order (0 .. count-1). */
  parts(runId: string, count: number): Promise<Blob[]>;
  /** The pasted DOI list of a run, stored ONCE (not in every checkpoint of the run record). */
  saveText(runId: string, text: string): Promise<void>;
  loadText(runId: string): Promise<string | null>;
  /** Deletes the saved run, its parts and its pasted text. */
  clear(): Promise<void>;
}

export function memoryStore(): RunStore & { partCount(): number } {
  let run: RunRecord | null = null;
  const parts = new Map<string, Blob>();
  const texts = new Map<string, string>();
  return {
    load: async () => (run ? structuredClone(run) : null),
    async save(r, add = []) {
      run = structuredClone(r);
      for (const p of add) parts.set(`${r.id}:${p.index}`, p.blob);
    },
    parts: async (id, count) => Array.from({ length: count }, (_, i) => parts.get(`${id}:${i}`)).filter((b): b is Blob => b !== undefined),
    saveText: async (id, text) => void texts.set(id, text),
    loadText: async (id) => texts.get(id) ?? null,
    async clear() {
      run = null;
      parts.clear();
      texts.clear();
    },
    partCount: () => parts.size,
  };
}

const DB_NAME = 'collection-review';
const DB_VERSION = 2;

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** IndexedDB behind RunStore. `factory` exists for tests (fake-indexeddb); the default is the global one (window or worker). */
export function idbStore(factory: IDBFactory = indexedDB): RunStore {
  let opened: Promise<IDBDatabase> | undefined;
  const db = (): Promise<IDBDatabase> => {
    if (opened) return opened;
    const mine: Promise<IDBDatabase> = new Promise<IDBDatabase>((resolve, reject) => {
      // a rejected open is not kept: the next call asks again (another tab may have let go since); a late failure of an EARLIER open must not clear a newer one
      const fail = (e: Error): void => {
        if (opened === mine) opened = undefined;
        reject(e);
      };
      const req = factory.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        // version 1: run + parts; version 2 adds the pasted DOI list
        for (const name of ['run', 'parts', 'texts']) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      };
      req.onsuccess = () => {
        const d = req.result;
        // another tab that wants a newer version of the database must not be blocked by this one: let go, open again on the next call
        d.onversionchange = () => {
          d.close();
          if (opened === mine) opened = undefined;
        };
        resolve(d);
      };
      req.onerror = () => fail(req.error ?? new Error('IndexedDB could not be opened'));
      req.onblocked = () => fail(new Error('IndexedDB is blocked by another tab that uses the saved progress'));
    });
    opened = mine;
    return mine;
  };

  return {
    async load() {
      const d = await db();
      const v = await wrap<RunRecord | undefined>(d.transaction('run', 'readonly').objectStore('run').get('current'));
      return v ?? null;
    },
    async save(run, parts = []) {
      const d = await db();
      const tx = d.transaction(['run', 'parts'], 'readwrite');
      tx.objectStore('run').put(run, 'current');
      for (const p of parts) tx.objectStore('parts').put(p.blob, `${run.id}:${p.index}`);
      await done(tx);
    },
    async parts(runId, count) {
      const d = await db();
      const store = d.transaction('parts', 'readonly').objectStore('parts');
      const out: Blob[] = [];
      for (let i = 0; i < count; i++) {
        const b = await wrap<Blob | undefined>(store.get(`${runId}:${i}`));
        if (b) out.push(b);
      }
      return out;
    },
    async saveText(runId, text) {
      const d = await db();
      const tx = d.transaction('texts', 'readwrite');
      tx.objectStore('texts').put(text, runId);
      await done(tx);
    },
    async loadText(runId) {
      const d = await db();
      const v = await wrap<string | undefined>(d.transaction('texts', 'readonly').objectStore('texts').get(runId));
      return v ?? null;
    },
    async clear() {
      const d = await db();
      const tx = d.transaction(['run', 'parts', 'texts'], 'readwrite');
      tx.objectStore('run').clear();
      tx.objectStore('parts').clear();
      tx.objectStore('texts').clear();
      await done(tx);
    },
  };
}
