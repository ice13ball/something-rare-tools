// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Why a run is not going on, in words: used by the page (notice, "unfinished run" prompt) and by the last row of an unfinished fix list.
import { catalogueById } from '../../../config/catalogues';
import { translate } from '../i18n/ui';
import type { Lang } from '../types';
import { SourceFailure, type StopReason } from './types';

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The stop reason of a failure. `source` is what the run reads; a failure that names its own host (DataCite, Zenodo) wins. */
export function stopFromFailure(e: SourceFailure, source: string, page: number, request: number, at: number): StopReason {
  const host = e.host && e.host !== 'csw' ? e.host : source;
  const cause = /^http-\d{3}$/.test(e.reason) ? 'http' : e.reason;
  return { cause, source: host, page, request, kind: e.kind, ...(e.status ? { status: e.status } : {}), at };
}

export function stopFromError(e: unknown, source: string, page: number, request: number, at: number): StopReason {
  const name = e instanceof Error && e.name ? e.name : 'Error';
  const message = e instanceof Error ? e.message : String(e);
  return { cause: 'error', source, page, request, kind: 'error', detail: clip(`${name}: ${message}`, 200), at };
}

function sourceName(source: string): string {
  if (source.startsWith('csw:')) return catalogueById(source.slice(4))?.label ?? source.slice(4);
  if (source === 'api.datacite.org') return 'DataCite';
  if (source === 'zenodo.org') return 'Zenodo';
  return source;
}

const CAUSES = new Set([
  'user', 'closed', 'worker', 'error', 'timeout', 'network', 'not-xml', 'exception', 'no-search-results', 'not-json', 'not-capabilities',
  'schema-not-offered', 'retry-after-long', 'repeating-page', 'next-record-not-advancing', 'host-not-allowed', 'csw_queue_full', 'csw_daily_budget',
]);

function causeText(s: StopReason, lang: Lang): string {
  if (s.cause === 'http') {
    const st = s.status;
    if (st === undefined) return translate(lang, 'collection.cause.http');
    const key = st === 429 || st === 503 ? 'collection.cause.httpBusy' : st >= 500 ? 'collection.cause.http5xx' : 'collection.cause.http4xx';
    return translate(lang, key, { status: st });
  }
  if (s.cause.startsWith('error:')) return translate(lang, 'collection.cause.errorKind', { name: s.cause.slice(6) });
  if (s.cause === 'error') return translate(lang, 'collection.cause.error', { detail: s.detail ?? '' });
  if (s.cause.startsWith('cursor-')) return translate(lang, 'collection.cause.cursor', { code: s.cause });
  if (CAUSES.has(s.cause)) return translate(lang, `collection.cause.${s.cause}`, { detail: s.detail ?? '' });
  return translate(lang, 'collection.cause.other', { code: s.cause });
}

/** One sentence: what happened, at which source, page and request, and when (UTC). */
export function describeStop(s: StopReason, lang: Lang): string {
  const cause = causeText(s, lang);
  const time = new Date(s.at).toISOString().slice(0, 16).replace('T', ' ');
  if (s.cause === 'user') return translate(lang, 'collection.stop.user', { time });
  const where = s.page !== undefined ? translate(lang, 'collection.stop.where', { page: s.page, request: s.request ?? 0 }) : '';
  return translate(lang, 'collection.stop.line', { cause, source: sourceName(s.source), where, time });
}
