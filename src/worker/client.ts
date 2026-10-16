// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Page side of the worker protocol: request ids -> promises. The worker is created lazily on the first request.
// The page-facing API is the Engine interface (protocol.ts).
import { makeEngine } from './engine';
import type { Engine, Request, RequestType, ResultOf, WireRequest, WireResponse } from './protocol';

/** The subset of Worker the client uses (a fake in tests). */
export interface WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  onmessageerror: ((e: MessageEvent) => void) | null;
  postMessage(msg: WireRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

/** ArrayBuffers of the file bytes, so they move to the worker instead of being copied. A view onto part of a buffer is copied first. */
export function transferablesOf(req: Request): { req: Request; transfer: Transferable[] } {
  if (req.type !== 'parse') return { req, transfer: [] };
  const transfer: Transferable[] = [];
  const files = req.files.map((f) => {
    const whole = f.bytes.byteOffset === 0 && f.bytes.byteLength === f.bytes.buffer.byteLength && f.bytes.buffer instanceof ArrayBuffer;
    const bytes = whole ? f.bytes : new Uint8Array(f.bytes);
    transfer.push(bytes.buffer);
    return { ...f, bytes };
  });
  return { req: { ...req, files }, transfer };
}

const WORKER_FAILED = 'The checking worker failed. Reload the page and try again.';

export function createWorkerClient(create: () => WorkerLike): Engine {
  let worker: WorkerLike | undefined;
  let next = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  const failAll = (message: string): void => {
    const waiting = [...pending.values()];
    pending.clear();
    worker = undefined; // the next request starts a fresh worker
    for (const p of waiting) p.reject(new Error(message));
  };

  const ensure = (): WorkerLike => {
    if (worker) return worker;
    let w: WorkerLike;
    try {
      w = create();
    } catch {
      throw new Error('The checking worker could not be started in this browser.');
    }
    w.onmessage = (e) => {
      const msg = e.data as WireResponse;
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
      failAll(WORKER_FAILED);
    };
    w.onmessageerror = () => failAll(WORKER_FAILED);
    worker = w;
    return w;
  };

  const send = <K extends RequestType>(request: Extract<Request, { type: K }>): Promise<ResultOf<K>> =>
    new Promise((resolve, reject) => {
      let w: WorkerLike;
      try {
        w = ensure();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      const id = next++;
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      const { req, transfer } = transferablesOf(request);
      try {
        w.postMessage({ id, req }, transfer);
      } catch {
        pending.delete(id);
        reject(new Error(WORKER_FAILED));
      }
    });

  return makeEngine(send);
}

let shared: Engine | undefined;

/** The page's engine: one module worker, created on first use. Vite bundles the worker as its own file under /assets. */
export function getEngine(): Engine {
  shared ??= createWorkerClient(() => new Worker(new URL('./check.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike);
  return shared;
}
