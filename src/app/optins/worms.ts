// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * THE ONLY MODULE OF /convert THAT TALKS TO THE NETWORK (plan section 1: network modules live on the main thread, in src/app/optins/; the worker never
 * fetches). Stage 4: the WoRMS opt-in. test/convert/no-network.test.ts allows exactly this file to call fetch and fails on any other module that does.
 *
 * The conditions the owner approved it under, and where each is kept:
 *   - nothing is sent before the user presses "Look up N names in WoRMS": this module has no side effect at import time and nothing calls it but that button
 *     (a preconnect, prefetch or link tag would be a request too: there is none, and test/app/convertWorms.test.tsx watches fetch, XHR, sendBeacon and storage);
 *   - only taxon names are sent: the argument is a list of names and the URL below is built from nothing else;
 *   - at most WORMS_BATCH_MAX names per call, one call after the other, with progress and an AbortController that really aborts;
 *   - no cookie, no storage: `credentials: 'omit'`, `cache: 'no-store'`, and nothing here touches localStorage, sessionStorage, IndexedDB or document.cookie;
 *   - the request carries no Referer (`referrerPolicy: 'no-referrer'`): the service learns the names and the IP address, not which page they came from.
 *
 * GET https://www.marinespecies.org/rest/AphiaRecordsByMatchNames?scientificnames[]=…&marine_only=false  (CORS: access-control-allow-origin *, docs/research/qc-sources.md Item 4).
 * No rate limit is documented; the calls are sequential.
 */
import { readWormsAnswer, wormsBatches } from '../../core/convert/worms';
import type { WormsRecord } from '../../core/convert/worms';

export const WORMS_ENDPOINT = 'https://www.marinespecies.org/rest/AphiaRecordsByMatchNames';

/** The request for one batch: the names, percent-encoded, and `marine_only=false` (freshwater names are answered too, and flagged by the page). */
export function wormsRequestUrl(names: readonly string[]): string {
  return `${WORMS_ENDPOINT}?${names.map((n) => `scientificnames[]=${encodeURIComponent(n)}`).join('&')}&marine_only=false`;
}

/** Why a lookup stopped before its end. `network` covers a refused connection, an offline browser and a CORS failure: the page cannot tell them apart. */
export type WormsFailure = { kind: 'network' } | { kind: 'http'; status: number } | { kind: 'format' };

export interface WormsRun {
  /** The records of every name of a COMPLETED batch (an empty list = no match). A name of a batch that did not complete is not here. */
  results: Record<string, WormsRecord[]>;
  /** Set when a call failed; the batches before it are in `results`. */
  failure?: WormsFailure;
  /** The user pressed Abort (or the signal was aborted): the batches before it are in `results`. */
  aborted: boolean;
}

export interface WormsLookupOptions {
  signal: AbortSignal;
  /** Called after each completed batch with the number of names answered so far and the total. */
  onProgress?: (done: number, total: number) => void;
}

const isAbort = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';

/**
 * Looks the names up, batch by batch, in order. Resolves (never throws) with what completed. Only the names go out; nothing is retried by itself.
 */
export async function lookupWormsNames(names: readonly string[], opts: WormsLookupOptions): Promise<WormsRun> {
  const results: Record<string, WormsRecord[]> = Object.create(null) as Record<string, WormsRecord[]>;
  const run = (partial: Pick<WormsRun, 'failure' | 'aborted'>): WormsRun => ({ results, ...partial });
  let done = 0;
  for (const batch of wormsBatches(names)) {
    if (opts.signal.aborted) return run({ aborted: true });
    let res: Response;
    try {
      res = await fetch(wormsRequestUrl(batch), { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: opts.signal });
    } catch (e) {
      return isAbort(e) || opts.signal.aborted ? run({ aborted: true }) : run({ aborted: false, failure: { kind: 'network' } });
    }
    if (!res.ok) return run({ aborted: false, failure: { kind: 'http', status: res.status } });
    let body: unknown;
    if (res.status !== 204) {
      try {
        body = await res.json();
      } catch (e) {
        return isAbort(e) || opts.signal.aborted ? run({ aborted: true }) : run({ aborted: false, failure: { kind: 'format' } });
      }
    }
    if (opts.signal.aborted) return run({ aborted: true });
    const answer = readWormsAnswer(body, batch.length, res.status === 204);
    if (!answer) return run({ aborted: false, failure: { kind: 'format' } });
    batch.forEach((name, i) => {
      results[name] = answer[i];
    });
    done += batch.length;
    opts.onProgress?.(done, names.length);
  }
  return run({ aborted: false });
}
