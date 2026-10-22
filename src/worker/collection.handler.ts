// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The collection worker's brain without the worker: one runner, one request handler. Tests and jsdom use it directly.
import { CollectionRunner, type RunnerDeps } from '../core/collection/runner';
import { SourceFailure } from '../core/collection/types';
import type { CollectionRequest, CollectionResultOf, CollectionRequestType } from './collection.protocol';

export function createCollectionHandler(deps: RunnerDeps): {
  runner: CollectionRunner;
  handle(req: CollectionRequest): Promise<unknown>;
} {
  const runner = new CollectionRunner(deps);
  return {
    runner,
    async handle(req) {
      switch (req.type) {
        case 'estimate':
          return runner.estimate(req.spec, req.sample);
        case 'start':
          await runner.start(req.settings);
          return null;
        case 'resume':
          await runner.resume();
          return null;
        case 'pause':
          runner.pause();
          return null;
        case 'stop':
          await runner.stop();
          return null;
        case 'discard':
          await runner.discard();
          return null;
        case 'saved':
          return runner.saved();
        case 'progress':
          return runner.progress();
        case 'samples':
          return runner.samples(req.ruleId, req.offset, req.limit);
        case 'unread':
          return runner.unread();
        case 'download':
          return { blob: await runner.csvBlob(), fileName: runner.fileName() };
        case 'saveTo':
          await runner.saveTo(req.handle);
          return null;
      }
    },
  };
}

/** What the page gets when something fails: a short code-like message ("kind: reason" for a source failure), never a stack. */
export function errorMessage(e: unknown): string {
  if (e instanceof SourceFailure) return `${e.kind}: ${e.reason}`;
  return e instanceof Error ? e.message : String(e);
}

export type { CollectionResultOf, CollectionRequestType };
