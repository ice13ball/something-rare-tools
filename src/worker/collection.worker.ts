// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Worker entry of the collection review: network, rules and IndexedDB all run here; the page only sends commands and shows progress.
// Its own worker, never the check worker's session (src/worker/handler.ts).
import { browserNet } from '../core/collection/net';
import { idbStore } from '../core/collection/store';
import type { Progress } from '../core/collection/types';
import { createCollectionHandler, errorMessage } from './collection.handler';
import type { CollectionWireRequest, CollectionWireResponse } from './collection.protocol';

const ctx = self as unknown as { onmessage: ((e: MessageEvent<CollectionWireRequest>) => void) | null; postMessage(msg: CollectionWireResponse): void };

/** At most four progress messages a second, except when the status changes. */
const PROGRESS_EVERY_MS = 250;
let lastPost = 0;
let lastStatus: string | undefined;

const { handle } = createCollectionHandler({
  net: browserNet(),
  store: idbStore(),
  onProgress: (progress: Progress) => {
    const now = Date.now();
    if (progress.status === lastStatus && now - lastPost < PROGRESS_EVERY_MS) return;
    lastPost = now;
    lastStatus = progress.status;
    ctx.postMessage({ event: 'progress', progress });
  },
});

ctx.onmessage = (e: MessageEvent<CollectionWireRequest>) => {
  const { id, req } = e.data;
  handle(req).then(
    (result) => ctx.postMessage({ id, ok: true, result }),
    (err: unknown) => ctx.postMessage({ id, ok: false, error: errorMessage(err) }),
  );
};

// An error nobody caught must not leave the page waiting for a run that is no longer going.
self.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  e.preventDefault();
  const r: unknown = e.reason;
  ctx.postMessage({ event: 'fatal', message: errorMessage(r) });
});
