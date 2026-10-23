// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Engine, Request, RequestType, ResultOf } from './protocol';

/** The typed Engine over any transport that can send one Request and resolve its result. */
export function makeEngine(send: <K extends RequestType>(req: Extract<Request, { type: K }>) => Promise<ResultOf<K>>): Engine {
  return {
    reset: () => send({ type: 'reset' }).then(() => undefined),
    parse: (files, records, extraFindings) => send({ type: 'parse', files, records, extraFindings }),
    propose: (fileId, layout) => send({ type: 'propose', fileId, layout }),
    build: (fileId, layout, mappings) => send({ type: 'build', fileId, layout, mappings }),
    check: (opts) => send({ type: 'check', ...(opts?.singleCruise ? { singleCruise: true } : {}) }),
    export: (kind, datasetIds) => send({ type: 'export', kind, datasetIds }),
    draft: (datasetIds) => send({ type: 'draft', datasetIds }),
    row: (file, line) => send({ type: 'row', file, line }),
  };
}
