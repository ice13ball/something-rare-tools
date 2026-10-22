// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A pasted list of DOIs: read incrementally (a batch of at most 100 per DataCite request), nothing parsed ahead of the cursor.
// Repeated DOIs are dropped only INSIDE one batch (that keeps a resumed run identical to an uninterrupted one and needs no memory that
// grows with the list); a DOI repeated in a later batch is looked up and counted again.
import { resolveInput } from '../../sources/resolve';
import { DATACITE_BATCH, lookupMany, type Deps } from './datacite';
import type { Estimate, Item, PageData, Pager } from '../types';

/** The address of one request must stay short (DOIs can be long). */
const MAX_BATCH_CHARS = 5000;

export interface DoiCursor {
  /** Character offset in the pasted text. */
  offset: number;
}

interface Batch {
  dois: string[];
  next: number | null;
  invalid: number;
  duplicates: number;
}

/** The next batch starting at `offset`: lower-case DOIs (doi.org and doi: forms read), tokens that are no DOI counted. */
export function scanBatch(text: string, offset: number): Batch {
  const re = /\S+/g;
  re.lastIndex = offset;
  const dois: string[] = [];
  const have = new Set<string>();
  let chars = 0;
  let invalid = 0;
  let duplicates = 0;
  let end = offset;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const r = resolveInput(m[0]);
    if (r.kind !== 'doi') {
      invalid += 1;
      end = re.lastIndex;
      continue;
    }
    const doi = r.doi.toLowerCase();
    if (have.has(doi)) {
      duplicates += 1;
      end = re.lastIndex;
      continue;
    }
    if (dois.length >= DATACITE_BATCH || chars + doi.length > MAX_BATCH_CHARS) {
      // this one starts the next batch
      return { dois, next: m.index, invalid, duplicates };
    }
    have.add(doi);
    dois.push(doi);
    chars += doi.length + 3;
    end = re.lastIndex;
  }
  const rest = /\S/.test(text.slice(end));
  return { dois, next: rest ? end : null, invalid, duplicates };
}

/** Counts the list without keeping it. */
export function countDois(text: string): { dois: number; batches: number } {
  let dois = 0;
  let batches = 0;
  let offset: number | null = 0;
  while (offset !== null) {
    const b = scanBatch(text, offset);
    if (b.dois.length > 0) {
      dois += b.dois.length;
      batches += 1;
    }
    offset = b.next !== null && b.next > offset ? b.next : null;
  }
  return { dois, batches };
}

export function estimateDois(text: string): Estimate {
  const { dois, batches } = countDois(text);
  return { records: dois, requests: batches, extraRequests: 0, seconds: batches * 2.5, strategy: 'batch', sample: false, empty: dois === 0 };
}

export function doiListPager(deps: Deps, text: string): Pager<DoiCursor> {
  const first = scanBatch(text, 0);
  const afterOf = (c: DoiCursor): DoiCursor | null => {
    const b = scanBatch(text, c.offset);
    return b.next !== null && b.next > c.offset ? { offset: b.next } : null;
  };
  return {
    // a list with no DOI in it (or only invalid tokens) is read once so the invalid tokens are counted
    initial: first.dois.length > 0 || first.invalid > 0 ? { offset: 0 } : null,
    expected: (c) => scanBatch(text, c.offset).dois.length,
    skip: afterOf,
    async fetch(c): Promise<PageData<DoiCursor>> {
      const b = scanBatch(text, c.offset);
      const found = await lookupMany(deps, b.dois);
      const items: Item[] = b.dois.map((doi) => {
        const rec = found.get(doi);
        return rec ? { ref: doi, state: 'checked', records: [rec] } : { ref: doi, state: 'unreachable', records: [], reason: 'not-found-at-datacite' };
      });
      return { items, next: afterOf(c), counters: { invalidTokens: b.invalid, duplicatesInBatch: b.duplicates } };
    },
  };
}
