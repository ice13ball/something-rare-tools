// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Shared types of the collection review engine. Everything that is persisted or sent between worker and page is plain JSON.
import type { CswSchema } from '../../../config/catalogues';
import type { Finding, Lang, MetadataRecord, MetadataSource, Severity } from '../types';

/**
 * A record the run did not read is never a licence or metadata finding: only 'checked' records meet the rules.
 * 'not-in-datacite': a DOI of a pasted list that DataCite does not know (a Crossref DOI, a typo): nothing was unreachable, there is just no record.
 */
export type RecordState = 'checked' | 'unreachable' | 'throttled' | 'unsupported-profile' | 'not-in-datacite';
export const RECORD_STATES: readonly RecordState[] = ['checked', 'unreachable', 'throttled', 'unsupported-profile', 'not-in-datacite'];

export type SourceSpec =
  | { kind: 'dois'; text: string }
  | { kind: 'datacite'; by: 'client' | 'prefix'; id: string }
  | { kind: 'zenodo'; community: string }
  | { kind: 'csw'; catalogue: string; schema: CswSchema; /** also look the record's DOI up at DataCite and compare (default on) */ crossSource: boolean };

export interface RunSettings {
  spec: SourceSpec;
  /** Language of the "problem" column of the fix list. */
  lang: Lang;
  /** A quick sample (labelled so everywhere), not the whole collection. */
  sample: boolean;
}

/** A message for the visitor, as a code the page translates. */
export interface Notice {
  code: string;
  params?: Record<string, string | number>;
}

export interface Estimate {
  /** Records the run will read (the sample size for a sample). */
  records: number;
  requests: number;
  /** Requests on top of `requests` that only the DataCite cross-check needs (CSW). */
  extraRequests: number;
  seconds: number;
  /** How the source is walked: 'cursor' | 'date-split' | 'start-position' | 'batch' | 'random-sample' | 'spread-pages' | 'spread-positions'. */
  strategy: string;
  /** Zenodo: how many date slices (1 = the community fits one 10 000 window). */
  slices?: number;
  /** Zenodo: the number of requests to build the slices is a rough guess. */
  approximate?: boolean;
  /** Zenodo: so large that the quick sample is worth running first. */
  sampleFirst?: boolean;
  sample: boolean;
  /** No record found at all ("no records found for this client or prefix", an empty list). */
  empty?: boolean;
}

export interface Sample {
  ref: string;
  ruleId: string;
  severity: Severity;
  field?: string;
  value?: string;
  params: Record<string, string | number>;
}

export interface UnreadSample {
  ref: string;
  state: Exclude<RecordState, 'checked'>;
  reason: string;
}

export interface Counts {
  /** Records met: the sum of `states`. */
  records: number;
  states: Record<RecordState, number>;
  /** Findings per rule id (a rule can fire more than once for one record). */
  rules: Record<string, number>;
  /** Checked records with at least one finding. */
  withFindings: number;
  /** DOI list: repeats of a DOI met earlier ANYWHERE in the list (dropped; the name predates the whole-list dedupe) and tokens that are no DOI. */
  duplicatesInBatch: number;
  invalidTokens: number;
  /** CSW with the DataCite cross-check: lookups made, DOIs found, DOIs DataCite does not know, lookups that failed. */
  crossSource: { looked: number; found: number; absent: number; failed: number; /** records checked on their ISO record only because the lookup failed */ notCompared?: number; /** checked records that name no DOI of their own: nothing to compare */ noDoi?: number };
}

export const emptyCounts = (): Counts => ({
  records: 0,
  states: { checked: 0, unreachable: 0, throttled: 0, 'unsupported-profile': 0, 'not-in-datacite': 0 },
  rules: {},
  withFindings: 0,
  duplicatesInBatch: 0,
  invalidTokens: 0,
  crossSource: { looked: 0, found: 0, absent: 0, failed: 0 },
});

/**
 * Why a run is not going on: saved with the run (IndexedDB), shown on the page and written as the last row of an unfinished fix list.
 * `cause` is a code the page translates: 'user' | 'closed' | 'worker' | 'error' | a failure reason ('http', 'timeout', 'network',
 * 'not-xml', 'exception', 'no-search-results', 'repeating-page', 'cursor-*', ...).
 */
export interface StopReason {
  cause: string;
  /** csw:<catalogue id> | api.datacite.org | zenodo.org | doi-list (what the failing request went to; a user stop: the source kind). */
  source: string;
  /** The page being read (1 = first). */
  page?: number;
  /** The step that failed only counts or plans (a Zenodo slice count), it is no page: said as such. */
  counting?: boolean;
  /** The engine's request counter when it stopped. */
  request?: number;
  status?: number;
  /** throttled | unreachable | protocol | not-found | error */
  kind?: string;
  /** An unexpected error: its name and message, clipped. */
  detail?: string;
  at: number;
}

export type RunStatus = 'idle' | 'preparing' | 'running' | 'paused' | 'stopped' | 'interrupted' | 'finished' | 'failed';

/** A page that could not be read and is retried at the end of the run and on resume. */
export interface Deferred {
  cursor: unknown;
  kind: 'unreachable' | 'throttled';
  expected: number;
  reason: string;
  /** The page's number when it was deferred (for a stop reason). */
  page?: number;
  /** A counting step (no page of records): named so in a stop reason. */
  counting?: boolean;
  /** The run cannot go past this page without it (the next cursor is only known from its answer). */
  blocking?: boolean;
}

export interface RunStats {
  requests: number;
  retries: number;
  throttleEvents: number;
}

/** What the page shows. Small by construction. */
export interface Progress {
  status: RunStatus;
  settings?: RunSettings;
  counts: Counts;
  stats: RunStats;
  elapsedMs: number;
  estimate?: Estimate;
  notices: Notice[];
  deferred: number;
  /** A saved run can go on: stopped, interrupted, paused, or finished with unread pages to retry. */
  resumable: boolean;
  csv: { rows: number; bytes: number };
  startedAt?: number;
  updatedAt?: number;
  /** Why the run stopped (stopped, interrupted, failed). */
  stop?: StopReason;
  /** Rules with findings, worst first (severity, then count). */
  ruleOrder: { ruleId: string; severity: Severity; count: number }[];
}

/** The saved run (IndexedDB 'run' store). Bounded: counters, <= 50 samples per rule, <= 200 deferred pages, <= ~1 MB of CSV text. */
export interface RunRecord {
  id: string;
  version: 1;
  settings: RunSettings;
  status: RunStatus;
  startedAt: number;
  updatedAt: number;
  activeMs: number;
  /** null = the source is read to its end. */
  cursor: unknown;
  /** Source-specific plan made once (the totals; a Zenodo run saved with its slices up front has them here); never grows with the records read. */
  plan: unknown;
  deferred: Deferred[];
  counts: Counts;
  samples: Record<string, Sample[]>;
  unread: UnreadSample[];
  notices: Notice[];
  stats: RunStats;
  estimate?: Estimate;
  /** Why the run stopped (cleared when it goes on). */
  stop?: StopReason;
  /** Pages read or deferred so far (for "page N" in a stop reason). */
  pagesTried?: number;
  /** Records the source announced and did not deliver (a slice that ended before its own total): the run finishes, but not complete. */
  shortfall?: number;
  /** CSV rows not yet written as a part (< 1 MB). */
  csvBuffer: string;
  partCount: number;
  csvBytes: number;
  csvRows: number;
}

/** One record as an adapter hands it to the run. */
export interface Item {
  ref: string;
  state: RecordState;
  /** The metadata read (checked records). */
  records: MetadataRecord[];
  reason?: string;
  /** Sources of this record that could not be read (a failed DataCite cross-check): their silence is not "no licence". */
  unreadable?: MetadataSource[];
}

export interface PageData<C> {
  items: Item[];
  /** null = the source is read to its end. */
  next: C | null;
  notices?: Notice[];
  /** Records this page's slice announced and did not deliver (the slice ended early). */
  shortfall?: number;
  counters?: Partial<Pick<Counts, 'duplicatesInBatch' | 'invalidTokens'>> & { crossSource?: Partial<Counts['crossSource']> };
}

/** The failure of a page (after the bounded retries). 'protocol' and 'not-found' stop the run; the others defer the page. */
export class SourceFailure extends Error {
  constructor(
    readonly kind: 'throttled' | 'unreachable' | 'protocol' | 'not-found',
    readonly reason: string,
    readonly status?: number,
    /** The host the failing request went to ('csw' = our proxy), when known. */
    readonly host?: string,
  ) {
    super(`${kind}: ${reason}`);
    this.name = 'SourceFailure';
  }
}

/** A source walked page by page. The cursor is plain JSON and is saved after every page. */
export interface Pager<C = unknown> {
  /** null: nothing to read. */
  initial: C | null;
  fetch(cursor: C): Promise<PageData<C>>;
  /** The cursor after a page that could not be read, or null when only that page's answer says where to go on. */
  skip(cursor: C): C | null;
  /** How many records that page was expected to hold. */
  expected(cursor: C): number;
  /** What a deferred page keeps of its cursor (only what reading that page again needs); default: the whole cursor. */
  retryCursor?(cursor: C): C;
  /** false = this step only counts or plans (no page of records): it is not a "page N" in a stop reason. Default: true. */
  isPage?(cursor: C): boolean;
  /**
   * A page that was left for later and is now read again (a CSW page, possibly asked smaller): compares what its answer covered with its
   * ORIGINAL range of `owed` records. `next` = the cursor to read next and the records still owed when the answer covers only the first
   * positions; `missing` = records of the covered part that the answer did not hold (it came back short, or jumped past the rest).
   */
  rest?(cursor: C, data: PageData<C>, owed: number): { next: { cursor: C; expected: number } | null; missing: number };
}

export type { Finding, Lang };
