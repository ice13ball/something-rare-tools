// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * Page side of the collection review worker. The page (part B) uses ONLY this API; getCollectionEngine() is the shared instance.
 *
 *   estimate(spec, sample)      Estimate    totals -> records, requests (+ extraRequests of the DataCite cross-check), seconds; 1-2 requests
 *   start(settings)             void        replaces the saved run; resolves once the source answered its first questions (totals, Zenodo slices);
 *                                           the run then goes on in the worker and reports through onProgress. Rejects with "kind: reason"
 *                                           (e.g. "not-found: http-404" for an unknown Zenodo community, "protocol: schema-not-offered")
 *   pause() / resume()          void        hold at the next page / go on; resume() also continues a saved run (stopped, interrupted, or
 *                                           finished with unread pages, which are then retried)
 *   stop()                      void        end after the request in flight; progress stays saved
 *   discard()                   void        delete ALL saved progress and fix-list parts (the control the privacy text promises)
 *   saved()                     Progress|null  the unfinished run of an earlier visit, to offer "resume / discard" on page load
 *   progress()                  Progress    the current snapshot (also pushed by onProgress, <= 4 a second)
 *   samples(ruleId, off, limit) Sample[]    bounded examples (<= 50 per rule) for the paginated list; no renderer needs every row
 *   unread()                    UnreadSample[]  <= 50 examples of records that were not read, with the reason
 *   download()                  {blob, fileName}  the fix list as one Blob (stored parts, disk-backed); the name says "sample" for a sample
 *   saveTo(fileHandle)          void        streams the fix list into a file chosen with showSaveFilePicker (bounded memory)
 *   onProgress(cb)              unsubscribe
 *   dispose()                   terminate the worker (a saved run stays in IndexedDB)
 *
 * Progress.notices are codes the page translates: no-records, split-by-date, slices-differ, window-exceeded, ended-before-total,
 * ended-before-matched, more-than-matched, ended-by-exception, empty-page, overrun-stopped, interrupted, storage-failed, unexpected, or a
 * failure reason of start()/the run (cursor-restarted, cursor-stuck, cursor-not-monotonic, cursor-overrun, repeating-page, ...).
 */
import { createCollectionHandler, errorMessage } from './collection.handler';
import type { RunnerDeps } from '../core/collection/runner';
import type { Estimate, Progress, RunSettings, Sample, SourceSpec, UnreadSample } from '../core/collection/types';
import type { CollectionRequest, CollectionRequestType, CollectionResultOf, CollectionWireRequest, CollectionWireResponse, FileHandleLike } from './collection.protocol';

export interface CollectionEngine {
  estimate(spec: SourceSpec, sample: boolean): Promise<Estimate>;
  start(settings: RunSettings): Promise<void>;
  resume(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  discard(): Promise<void>;
  saved(): Promise<Progress | null>;
  progress(): Promise<Progress>;
  samples(ruleId: string, offset: number, limit: number): Promise<Sample[]>;
  unread(): Promise<UnreadSample[]>;
  download(): Promise<{ blob: Blob; fileName: string }>;
  saveTo(handle: FileHandleLike): Promise<void>;
  onProgress(cb: (p: Progress) => void): () => void;
  dispose(): void;
}

type Send = <K extends CollectionRequestType>(req: Extract<CollectionRequest, { type: K }>) => Promise<CollectionResultOf<K>>;

function makeEngine(send: Send, onProgress: (cb: (p: Progress) => void) => () => void, dispose: () => void): CollectionEngine {
  return {
    estimate: (spec, sample) => send({ type: 'estimate', spec, sample }),
    start: (settings) => send({ type: 'start', settings }).then(() => undefined),
    resume: () => send({ type: 'resume' }).then(() => undefined),
    pause: () => send({ type: 'pause' }).then(() => undefined),
    stop: () => send({ type: 'stop' }).then(() => undefined),
    discard: () => send({ type: 'discard' }).then(() => undefined),
    saved: () => send({ type: 'saved' }),
    progress: () => send({ type: 'progress' }),
    samples: (ruleId, offset, limit) => send({ type: 'samples', ruleId, offset, limit }),
    unread: () => send({ type: 'unread' }),
    download: () => send({ type: 'download' }),
    saveTo: (handle) => send({ type: 'saveTo', handle }).then(() => undefined),
    onProgress,
    dispose,
  };
}

/** The subset of Worker the client uses (a fake in tests). */
export interface CollectionWorkerLike {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  onmessageerror: ((e: MessageEvent) => void) | null;
  postMessage(msg: CollectionWireRequest): void;
  terminate(): void;
}

const WORKER_FAILED = 'The collection worker failed. Reload the page and try again.';

export function createCollectionClient(create: () => CollectionWorkerLike): CollectionEngine {
  let worker: CollectionWorkerLike | undefined;
  let next = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const listeners = new Set<(p: Progress) => void>();

  let last: Progress | undefined;

  /**
   * The worker is gone (a script error, a crash, a message it could not send): every waiting request fails, and a run that was going
   * is shown as interrupted with the reason. Its progress up to the last checkpoint is in IndexedDB; resume() starts a new worker.
   */
  const failAll = (message: string, detail?: string): void => {
    const waiting = [...pending.values()];
    pending.clear();
    const dead = worker;
    worker = undefined;
    try {
      dead?.terminate();
    } catch {
      /* already gone */
    }
    for (const p of waiting) p.reject(new Error(message));
    const p = last;
    if (p && p.settings && (p.status === 'running' || p.status === 'preparing' || p.status === 'paused')) {
      const spec = p.settings.spec;
      const source = spec.kind === 'csw' ? `csw:${spec.catalogue}` : spec.kind === 'dois' ? 'doi-list' : spec.kind;
      const stop = { cause: 'worker', source, request: p.stats.requests, kind: 'error', detail: (detail ?? message).slice(0, 200), at: Date.now() };
      last = { ...p, status: 'interrupted', resumable: true, stop };
      for (const cb of listeners) cb(last);
    }
  };

  const ensure = (): CollectionWorkerLike => {
    if (worker) return worker;
    let w: CollectionWorkerLike;
    try {
      w = create();
    } catch {
      throw new Error('The collection worker could not be started in this browser.');
    }
    w.onmessage = (e) => {
      const msg = e.data as CollectionWireResponse;
      if ('event' in msg) {
        if (msg.event === 'fatal') return failAll(WORKER_FAILED, msg.message);
        last = msg.progress;
        for (const cb of listeners) cb(msg.progress);
        return;
      }
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error));
    };
    w.onerror = (e) => {
      try {
        e.preventDefault?.();
      } catch {
        /* nothing to prevent */
      }
      failAll(WORKER_FAILED, e.message || undefined);
    };
    w.onmessageerror = () => failAll(WORKER_FAILED);
    worker = w;
    return w;
  };

  const send: Send = (request) =>
    new Promise((resolve, reject) => {
      let w: CollectionWorkerLike;
      try {
        w = ensure();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      const id = next++;
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      try {
        w.postMessage({ id, req: request });
      } catch {
        pending.delete(id);
        reject(new Error(WORKER_FAILED));
      }
    });

  return makeEngine(
    send,
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => {
      worker?.terminate();
      worker = undefined;
    },
  );
}

let shared: CollectionEngine | undefined;

/** The page's collection engine: one module worker, created on first use (its own file under /assets). */
export function getCollectionEngine(): CollectionEngine {
  shared ??= createCollectionClient(() => new Worker(new URL('./collection.worker.ts', import.meta.url), { type: 'module' }) as unknown as CollectionWorkerLike);
  return shared;
}

/** The same API without a Worker (tests, jsdom): the handler runs in this thread. */
export function createDirectCollectionEngine(deps: RunnerDeps): CollectionEngine & { runner: ReturnType<typeof createCollectionHandler>['runner'] } {
  const listeners = new Set<(p: Progress) => void>();
  const { handle, runner } = createCollectionHandler({
    ...deps,
    onProgress: (p) => {
      deps.onProgress?.(p);
      for (const cb of listeners) cb(p);
    },
  });
  const send: Send = async (req) => {
    try {
      return (await handle(req)) as never;
    } catch (e) {
      throw new Error(errorMessage(e));
    }
  };
  return {
    ...makeEngine(
      send,
      (cb) => {
        listeners.add(cb);
        return () => void listeners.delete(cb);
      },
      () => undefined,
    ),
    runner,
  };
}
