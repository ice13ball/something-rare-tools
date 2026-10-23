// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A pasted list of DOIs: read incrementally (a batch of at most 100 per DataCite request), nothing parsed ahead of the cursor.
// A DOI repeated ANYWHERE in the list counts once: it is a repeat when an earlier token of the pasted text is the same DOI. The set of
// DOIs before the cursor is never saved: it is recomputed from the pasted text and the cursor's offset (see DoiPrefix), so a resumed run,
// or a page retried later, sees exactly what an uninterrupted run saw. Memory: one set of the list's normalised DOIs; the text is
// already in memory (the user pasted it).
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

/**
 * The normalised DOIs of every token of `text` before `offset` (a token boundary: a cursor of this pager). Moves forward by reading only the
 * new stretch; asked for an earlier offset (a deferred page retried, a resumed run) it starts again from the beginning of the text.
 */
export class DoiPrefix {
  private pos = 0;
  private have = new Set<string>();

  get set(): ReadonlySet<string> {
    return this.have;
  }

  advanceTo(text: string, offset: number): ReadonlySet<string> {
    if (offset < this.pos) {
      this.pos = 0;
      this.have = new Set();
    }
    if (offset > this.pos) {
      const re = /\S+/g;
      re.lastIndex = this.pos;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null && m.index < offset) {
        const r = resolveInput(m[0]);
        if (r.kind === 'doi') this.have.add(r.doi.toLowerCase());
      }
      this.pos = offset;
    }
    return this.have;
  }
}

/** The next batch starting at `offset`: lower-case DOIs (doi.org and doi: forms read), tokens that are no DOI counted, repeats of `before` or of this batch dropped. */
export function scanBatch(text: string, offset: number, before: ReadonlySet<string> = new Set()): Batch {
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
    if (before.has(doi) || have.has(doi)) {
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
  const prefix = new DoiPrefix();
  while (offset !== null) {
    const b = scanBatch(text, offset, prefix.advanceTo(text, offset));
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
  const prefix = new DoiPrefix();
  const batchAt = (offset: number): Batch => scanBatch(text, offset, prefix.advanceTo(text, offset));
  const first = batchAt(0);
  const afterOf = (c: DoiCursor): DoiCursor | null => {
    const b = batchAt(c.offset);
    return b.next !== null && b.next > c.offset ? { offset: b.next } : null;
  };
  return {
    // a list with no DOI in it (or only invalid tokens) is read once so the invalid tokens are counted
    initial: first.dois.length > 0 || first.invalid > 0 ? { offset: 0 } : null,
    expected: (c) => batchAt(c.offset).dois.length,
    skip: afterOf,
    async fetch(c): Promise<PageData<DoiCursor>> {
      const b = batchAt(c.offset);
      const found = await lookupMany(deps, b.dois);
      const items: Item[] = b.dois.map((doi) => {
        const rec = found.get(doi);
        return rec ? { ref: doi, state: 'checked', records: [rec] } : { ref: doi, state: 'not-in-datacite', records: [], reason: 'not-found-at-datacite' };
      });
      return { items, next: afterOf(c), counters: { invalidTokens: b.invalid, duplicatesInBatch: b.duplicates } }; // (the counter keeps its saved name; it now counts repeats anywhere in the list)
    },
  };
}
