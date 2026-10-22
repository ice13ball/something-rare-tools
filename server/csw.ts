// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/**
 * POST /api/csw: the collection review's way to a CSW catalogue (browsers cannot always reach one: Sextant sends no CORS headers).
 * The body carries a catalogue id and three small values. The server builds the GET query or the XML body ITSELF from config/catalogues.ts;
 * it never forwards a visitor's URL, XML, header or query, and it contacts only the hosts of that list. Pacing per catalogue host.
 */
import { catalogueById, type Catalogue, type CswSchema } from '../config/catalogues.js';
import { ProxyError } from './fetchProxy.js';

export const MAX_RECORDS_PER_PAGE = 50;
/** Far beyond any catalogue (NOAA has 99 254 records); keeps the number a plain small integer. */
export const MAX_START_POSITION = 10_000_000;
/** One page of 50 full ISO records is 1.5-3 MB; 500 records were 17-34 MB. */
export const CSW_MAX_BYTES = 15 * 1024 * 1024;
export const CSW_TIMEOUT_MS = 45_000;
/** At least this long between two requests to one catalogue host. */
export const CSW_MIN_INTERVAL_MS = 1000;
/** Requests that may wait for their turn at one host; the next one is refused with 429 and Retry-After. */
export const CSW_MAX_QUEUE = 20;

export type CswOp = 'GetCapabilities' | 'GetRecords';
export interface CswRequest {
  catalogue: Catalogue;
  op: CswOp;
  startPosition: number;
  maxRecords: number;
  schema: CswSchema;
}

const FIELDS = ['catalogue', 'op', 'startPosition', 'maxRecords', 'schema'] as const;
const SCHEMAS: readonly CswSchema[] = ['iso19139', 'iso19115-3'];

const bad = (code: string): ProxyError => new ProxyError(400, code);

function int(v: unknown, min: number, max: number, code: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw bad(code);
  return v;
}

/** Strict: exactly the known fields, each of the right type and range. Anything else is a 400, never ignored. */
export function parseCswBody(body: unknown): CswRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw bad('bad_body');
  const o = body as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!(FIELDS as readonly string[]).includes(k)) throw bad('unknown_field');
  if (typeof o.catalogue !== 'string') throw bad('bad_catalogue');
  const catalogue = catalogueById(o.catalogue);
  if (!catalogue) throw bad('unknown_catalogue');
  if (o.op !== 'GetCapabilities' && o.op !== 'GetRecords') throw bad('bad_op');
  if (o.op === 'GetCapabilities') {
    if (o.startPosition !== undefined || o.maxRecords !== undefined || o.schema !== undefined) throw bad('unknown_field');
    return { catalogue, op: 'GetCapabilities', startPosition: 1, maxRecords: 1, schema: 'iso19139' };
  }
  const startPosition = o.startPosition === undefined ? 1 : int(o.startPosition, 1, MAX_START_POSITION, 'bad_start_position');
  const maxRecords = o.maxRecords === undefined ? 10 : int(o.maxRecords, 1, MAX_RECORDS_PER_PAGE, 'bad_max_records');
  let schema: CswSchema = 'iso19139';
  if (o.schema !== undefined) {
    if (typeof o.schema !== 'string' || !(SCHEMAS as readonly string[]).includes(o.schema)) throw bad('bad_schema');
    schema = o.schema as CswSchema;
  }
  if (!catalogue.schemas.includes(schema)) throw bad('bad_schema');
  return { catalogue, op: 'GetRecords', startPosition, maxRecords, schema };
}

const SCHEMA_PARTS: Record<CswSchema, { outputSchema: string; typeName: string; xmlns: string }> = {
  iso19139: { outputSchema: 'http://www.isotc211.org/2005/gmd', typeName: 'gmd:MD_Metadata', xmlns: 'xmlns:gmd="http://www.isotc211.org/2005/gmd"' },
  'iso19115-3': { outputSchema: 'http://standards.iso.org/iso/19115/-3/mdb/2.0', typeName: 'mdb:MD_Metadata', xmlns: 'xmlns:mdb="http://standards.iso.org/iso/19115/-3/mdb/2.0"' },
};

export interface CswUpstream {
  url: string;
  post?: { body: string; contentType: string };
}

/** The request to the catalogue: from config and validated numbers only. */
export function buildCswUpstream(r: CswRequest): CswUpstream {
  const { catalogue: c } = r;
  if (r.op === 'GetCapabilities') {
    const q = new URLSearchParams({ service: 'CSW', version: '2.0.2', request: 'GetCapabilities' });
    return { url: `${c.cswUrl}?${q.toString()}` };
  }
  const s = SCHEMA_PARTS[r.schema];
  if (c.method === 'GET') {
    const q = new URLSearchParams({
      service: 'CSW',
      version: '2.0.2',
      request: 'GetRecords',
      resultType: 'results',
      typeNames: s.typeName,
      elementSetName: 'full',
      startPosition: String(r.startPosition),
      maxRecords: String(r.maxRecords),
      outputSchema: s.outputSchema,
    });
    return { url: `${c.cswUrl}?${q.toString()}` };
  }
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<csw:GetRecords xmlns:csw="http://www.opengis.net/cat/csw/2.0.2" ${s.xmlns} service="CSW" version="2.0.2" resultType="results" ` +
    `startPosition="${r.startPosition}" maxRecords="${r.maxRecords}" outputSchema="${s.outputSchema}">` +
    `<csw:Query typeNames="${s.typeName}"><csw:ElementSetName>full</csw:ElementSetName></csw:Query></csw:GetRecords>`;
  return { url: c.cswUrl, post: { body, contentType: 'application/xml' } };
}

export interface HostPacerOptions {
  minIntervalMs?: number;
  /** Requests that may wait at one host, all clients together. */
  maxQueue?: number;
  /** Requests that may wait at one host for one client key (an IP): one client cannot fill the queue. */
  maxPerClient?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export const CSW_MAX_PER_CLIENT = 2;

interface HostState {
  next: number;
  waiting: number;
  perClient: Map<string, number>;
}

/**
 * Turns at one catalogue host: upstream requests start at least `minIntervalMs` apart, whatever the number of visitors.
 * Up to `maxQueue` requests wait (at most `maxPerClient` of them per client key); one more is refused with ProxyError 429
 * (Retry-After = the wait it would have had, in seconds). A waiter whose `signal` aborts leaves the queue at once and, when it
 * held the last reservation, gives its time slot back. Independent of the per-IP limiter, which also applies.
 */
export function createHostPacer(opts: HostPacerOptions = {}): {
  acquire(host: string, client?: string, signal?: AbortSignal): Promise<void>;
  waiting(host: string): number;
} {
  const interval = opts.minIntervalMs ?? CSW_MIN_INTERVAL_MS;
  const maxQueue = opts.maxQueue ?? CSW_MAX_QUEUE;
  const maxPerClient = opts.maxPerClient ?? CSW_MAX_PER_CLIENT;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const state = new Map<string, HostState>();
  const full = (wait: number): ProxyError => Object.assign(new ProxyError(429, 'csw_queue_full'), { retryAfterSec: Math.max(1, Math.ceil(wait / 1000)) });

  return {
    waiting: (host) => state.get(host)?.waiting ?? 0,
    async acquire(host, client = '', signal) {
      if (signal?.aborted) throw new ProxyError(499, 'client_closed');
      let h = state.get(host);
      if (!h) state.set(host, (h = { next: 0, waiting: 0, perClient: new Map() }));
      const t = now();
      const start = Math.max(t, h.next);
      const wait = start - t;
      if (wait <= 0) {
        h.next = start + interval;
        return;
      }
      if (h.waiting >= maxQueue || (h.perClient.get(client) ?? 0) >= maxPerClient) throw full(wait);
      h.next = start + interval;
      h.waiting += 1;
      h.perClient.set(client, (h.perClient.get(client) ?? 0) + 1);
      const leave = (): void => {
        h.waiting -= 1;
        const n = (h.perClient.get(client) ?? 1) - 1;
        if (n <= 0) h.perClient.delete(client);
        else h.perClient.set(client, n);
      };
      let onAbort: (() => void) | undefined;
      try {
        await new Promise<void>((resolve, reject) => {
          if (signal) {
            onAbort = () => reject(new ProxyError(499, 'client_closed'));
            signal.addEventListener('abort', onAbort, { once: true });
          }
          sleep(wait).then(resolve, reject);
        });
      } catch (e) {
        // Aborted (or the timer failed): the slot goes back when nobody reserved after it.
        if (h.next === start + interval) h.next = start;
        throw e;
      } finally {
        if (signal && onAbort) signal.removeEventListener('abort', onAbort);
        leave();
      }
    },
  };
}
