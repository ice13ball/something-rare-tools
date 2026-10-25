// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Page side of the convert worker: request ids -> promises. The worker is created lazily on the first request.
import { makeConvertEngine } from './convert.engine';
import type { ConvertEngine, ConvertRequest, ConvertRequestType, ConvertResultOf, ConvertWireRequest } from './convert.protocol';
import type { WireResponse } from './protocol';

export interface ConvertWorkerLike {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  onmessageerror: ((e: MessageEvent) => void) | null;
  postMessage(msg: ConvertWireRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

const WORKER_FAILED = 'The converter worker failed. Reload the page and try again.';

export function createConvertWorkerClient(create: () => ConvertWorkerLike): ConvertEngine {
  let worker: ConvertWorkerLike | undefined;
  let next = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const failAll = (message: string): void => {
    const waiting = [...pending.values()];
    pending.clear();
    worker = undefined;
    for (const p of waiting) p.reject(new Error(message));
  };
  const ensure = (): ConvertWorkerLike => {
    if (worker) return worker;
    const w = create();
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
  const send = <K extends ConvertRequestType>(request: Extract<ConvertRequest, { type: K }>): Promise<ConvertResultOf<K>> =>
    new Promise((resolve, reject) => {
      try {
        const w = ensure();
        const id = next++;
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
        // the file bytes move to the worker instead of being copied (a view onto part of a buffer is copied first)
        const transfer: Transferable[] = [];
        let req: ConvertRequest = request;
        const asParse = request as ConvertRequest;
        if (asParse.type === 'parse') {
          const files = asParse.files.map((f) => {
            const whole = f.bytes.byteOffset === 0 && f.bytes.byteLength === f.bytes.buffer.byteLength && f.bytes.buffer instanceof ArrayBuffer;
            const bytes = whole ? f.bytes : new Uint8Array(f.bytes);
            transfer.push(bytes.buffer);
            return { ...f, bytes };
          });
          req = { ...asParse, files };
        }
        try {
          w.postMessage({ id, req }, transfer);
        } catch {
          pending.delete(id);
          reject(new Error(WORKER_FAILED));
        }
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  return makeConvertEngine(send);
}

let shared: ConvertEngine | undefined;

/** The page's engine: one module worker, created on first use. Vite bundles the worker as its own file under /assets. */
export function getConvertEngine(): ConvertEngine {
  shared ??= createConvertWorkerClient(() => new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module' }) as unknown as ConvertWorkerLike);
  return shared;
}
