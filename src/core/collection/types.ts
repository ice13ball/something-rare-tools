// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Shared types of the collection review engine. Everything that is persisted or sent between worker and page is plain JSON.
import type { CswSchema } from '../../../config/catalogues';
import type { Finding, Lang, MetadataRecord, MetadataSource, Severity } from '../types';

/** A record the run did not read is never a licence or metadata finding: only 'checked' records meet the rules. */
export type RecordState = 'checked' | 'unreachable' | 'throttled' | 'unsupported-profile';
export const RECORD_STATES: readonly RecordState[] = ['checked', 'unreachable', 'throttled', 'unsupported-profile'];

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
  /** DOI list: repeated DOIs inside one batch of 100 (dropped) and tokens that are no DOI. */
  duplicatesInBatch: number;
  invalidTokens: number;
  /** CSW with the DataCite cross-check: lookups made, DOIs found, DOIs DataCite does not know, lookups that failed. */
  crossSource: { looked: number; found: number; absent: number; failed: number };
}

export const emptyCounts = (): Counts => ({
  records: 0,
  states: { checked: 0, unreachable: 0, throttled: 0, 'unsupported-profile': 0 },
  rules: {},
  withFindings: 0,
  duplicatesInBatch: 0,
  invalidTokens: 0,
  crossSource: { looked: 0, found: 0, absent: 0, failed: 0 },
});

export type RunStatus = 'idle' | 'preparing' | 'running' | 'paused' | 'stopped' | 'interrupted' | 'finished' | 'failed';

/** A page that could not be read and is retried at the end of the run and on resume. */
export interface Deferred {
  cursor: unknown;
  kind: 'unreachable' | 'throttled';
  expected: number;
  reason: string;
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
  /** Rules with findings, worst first (severity, then count). */
  ruleOrder: { ruleId: string; severity: Severity; count: number }[];
}

/** The saved run (IndexedDB 'run' store). Bounded: counters, <= 50 samples per rule, <= 200 deferred pages, a plan of <= 2000 slices, <= ~1 MB of CSV text. */
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
  /** Source-specific plan made once (Zenodo date slices, CSW total); never grows with the records read. */
  plan: unknown;
  deferred: Deferred[];
  counts: Counts;
  samples: Record<string, Sample[]>;
  unread: UnreadSample[];
  notices: Notice[];
  stats: RunStats;
  estimate?: Estimate;
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
  counters?: Partial<Pick<Counts, 'duplicatesInBatch' | 'invalidTokens'>> & { crossSource?: Partial<Counts['crossSource']> };
}

/** The failure of a page (after the bounded retries). 'protocol' and 'not-found' stop the run; the others defer the page. */
export class SourceFailure extends Error {
  constructor(
    readonly kind: 'throttled' | 'unreachable' | 'protocol' | 'not-found',
    readonly reason: string,
    readonly status?: number,
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
}

export type { Finding, Lang };
