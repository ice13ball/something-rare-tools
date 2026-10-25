// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * THE SECOND AND LAST MODULE OF /convert THAT TALKS TO THE NETWORK (the first is worms.ts; plan section 1: network modules live on the main thread, in src/app/optins/;
 * the worker never fetches). Stage 5: the NVS opt-in. test/convert/no-network.test.ts allows exactly these two files to call fetch and fails on any other module.
 *
 * The conditions it is built under, and where each is kept:
 *   - nothing is sent before the user types a search word for a column and presses "Search NVS": this module has no side effect at import time and nothing calls it but
 *     that button (a preconnect, prefetch or link tag would be a request too: there is none, and test/app/convertNvs.test.tsx watches fetch, XHR, sendBeacon and storage);
 *   - only the typed word goes out: the argument is the text the user typed and a collection (P01 or P06); the URL is built from the escaped word and fixed text, nothing else
 *     (src/core/convert/nvs.ts nvsQuery); no data, value, column header or file name reaches this module at all;
 *   - one request at a time, no automatic retry, with an AbortController that really aborts. A failed SPARQL search falls back to ONE more request, and only when the typed
 *     text is exactly a concept code, in capital letters as typed (TEMPPR01, UPAA): the concept page of that code. It is the user's own search, repeated by address; it is never repeated for any other text;
 *   - no cookie, no storage: `credentials: 'omit'`, `cache: 'no-store'`, `redirect: 'error'` (a redirect would send the word elsewhere), and nothing here touches
 *     localStorage, sessionStorage, IndexedDB or document.cookie;
 *   - the request carries no Referer (`referrerPolicy: 'no-referrer'`): the service learns the word and the IP address, not which page it came from.
 *
 * GET https://vocab.nerc.ac.uk/sparql/sparql?query=...  (CORS: access-control-allow-origin *; the only header is Accept, which is safelisted, so there is no preflight)
 * GET https://vocab.nerc.ac.uk/collection/<P01|P06>/current/<CODE>/?_profile=nvs&_mediatype=application/ld+json  (CORS *, a preflight gets 405: no header at all)
 */
import { nvsQuery, readConceptJsonLd, readSparqlAnswer, typedCode } from '../../core/convert/nvs';
import type { NvsCollection, NvsConcept } from '../../core/convert/nvs';
import { conceptUri } from '../../core/convert/nerc';

export const NVS_SPARQL_ENDPOINT = 'https://vocab.nerc.ac.uk/sparql/sparql';

/** The request for a typed search: the endpoint and the query, percent-encoded. Undefined when there is nothing to search. */
export function nvsSearchUrl(typed: string, collection: NvsCollection): string | undefined {
  const q = nvsQuery(typed, collection);
  return q === undefined ? undefined : `${NVS_SPARQL_ENDPOINT}?query=${encodeURIComponent(q)}`;
}

/** The concept page of a code, as JSON-LD (the fallback). Undefined when the code is not of the expected form. */
export function nvsConceptUrl(code: string, collection: NvsCollection): string | undefined {
  const uri = conceptUri(collection, code);
  return uri === undefined ? undefined : `https://vocab.nerc.ac.uk/collection/${collection}/current/${code}/?_profile=nvs&_mediatype=application/ld+json`;
}

/** Why a search stopped before an answer. `network` covers a refused connection, an offline browser and a CORS failure: the page cannot tell them apart. */
export type NvsFailure = { kind: 'network' } | { kind: 'http'; status: number } | { kind: 'format' };

export interface NvsRun {
  /** The concepts found (empty = the service answered with none). */
  concepts: NvsConcept[];
  /** How they were found: the SPARQL search, or the concept page of a typed code after the search failed. */
  via: 'search' | 'code';
  /** Set when no answer was got (and, for a typed code, the concept page failed as well). */
  failure?: NvsFailure;
  /** The user pressed Abort (or the signal was aborted). */
  aborted: boolean;
}

export interface NvsSearchOptions {
  signal: AbortSignal;
}

const isAbort = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';

type Got = { ok: true; body: unknown } | { ok: false; aborted: boolean; failure: NvsFailure };

async function get(url: string, headers: Record<string, string> | undefined, signal: AbortSignal): Promise<Got> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal, ...(headers ? { headers } : {}) });
  } catch (e) {
    return isAbort(e) || signal.aborted ? { ok: false, aborted: true, failure: { kind: 'network' } } : { ok: false, aborted: false, failure: { kind: 'network' } };
  }
  if (!res.ok) return { ok: false, aborted: false, failure: { kind: 'http', status: res.status } };
  try {
    const body: unknown = await res.json();
    return signal.aborted ? { ok: false, aborted: true, failure: { kind: 'network' } } : { ok: true, body };
  } catch (e) {
    return isAbort(e) || signal.aborted ? { ok: false, aborted: true, failure: { kind: 'network' } } : { ok: false, aborted: false, failure: { kind: 'format' } };
  }
}

/**
 * Searches one collection for the typed text. Resolves (never throws). The typed text is the only thing that goes out. No retry by itself: when the SPARQL search fails
 * AND the text is exactly a concept code, the concept page of that code is asked for once; any other failure is reported and the user may press the button again.
 */
export async function searchNvs(typed: string, collection: NvsCollection, opts: NvsSearchOptions): Promise<NvsRun> {
  // it always resolves: whatever goes wrong (a text that cannot be encoded, a fetch that throws at once) is a failure of the run, never an exception for the page
  try {
    return await search(typed, collection, opts);
  } catch (e) {
    return opts.signal.aborted || isAbort(e) ? { concepts: [], via: 'search', aborted: true } : { concepts: [], via: 'search', failure: { kind: 'format' }, aborted: false };
  }
}

async function search(typed: string, collection: NvsCollection, opts: NvsSearchOptions): Promise<NvsRun> {
  const url = nvsSearchUrl(typed, collection);
  if (url === undefined || opts.signal.aborted) return { concepts: [], via: 'search', aborted: opts.signal.aborted };
  const first = await get(url, { Accept: 'application/sparql-results+json' }, opts.signal);
  if (first.ok) {
    const concepts = readSparqlAnswer(first.body, collection);
    if (concepts) return { concepts, via: 'search', aborted: false };
  } else if (first.aborted) return { concepts: [], via: 'search', aborted: true };
  const failure: NvsFailure = first.ok ? { kind: 'format' } : first.failure;
  // the fallback: only for a text that is exactly a code
  const code = typedCode(typed, collection);
  const codeUrl = code === undefined ? undefined : nvsConceptUrl(code, collection);
  const uri = code === undefined ? undefined : conceptUri(collection, code);
  if (codeUrl === undefined || uri === undefined) return { concepts: [], via: 'search', failure, aborted: false };
  const second = await get(codeUrl, undefined, opts.signal);
  if (!second.ok) return second.aborted ? { concepts: [], via: 'code', aborted: true } : { concepts: [], via: 'code', failure: second.failure, aborted: false };
  const concept = readConceptJsonLd(second.body, uri, collection);
  return concept ? { concepts: [concept], via: 'code', aborted: false } : { concepts: [], via: 'code', failure: { kind: 'format' }, aborted: false };
}
