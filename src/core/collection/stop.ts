// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Why a run is not going on, in words: used by the page (notice, "unfinished run" prompt) and by the last row of an unfinished fix list.
import { catalogueById } from '../../../config/catalogues';
import { translate } from '../i18n/ui';
import type { Lang } from '../types';
import { SourceFailure, type Notice, type StopReason } from './types';

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
  'schema-not-offered', 'retry-after-long', 'repeating-page', 'next-record-not-advancing', 'host-not-allowed', 'csw_queue_full', 'csw_daily_budget', 'csw_slow', 'csw_too_large',
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

/** A failure reason code of a page (`http-503`, `csw_slow`, `timeout`, ...) in words. */
export function reasonText(reason: string, lang: Lang): string {
  const http = /^http-(\d{3})$/.exec(reason);
  return causeText({ cause: http ? 'http' : reason, source: '', ...(http ? { status: Number(http[1]) } : {}), at: 0 }, lang);
}

/** One sentence: what happened, at which source, page and request, and when (UTC). */
export function describeStop(s: StopReason, lang: Lang): string {
  const cause = causeText(s, lang);
  const time = new Date(s.at).toISOString().slice(0, 16).replace('T', ' ');
  if (s.cause === 'user') return translate(lang, 'collection.stop.user', { time });
  const where = s.page !== undefined ? translate(lang, 'collection.stop.where', { page: s.page, request: s.request ?? 0 }) : '';
  return translate(lang, 'collection.stop.line', { cause, source: sourceName(s.source), where, time });
}

/** Notices that say the run FINISHED without having read everything: always kept (never dropped by the notice cap), rebuilt when the run ends. */
export const GAP_NOTICES: readonly string[] = ['unread-pages', 'records-missing'];

/** A notice in words (the two gap notices; the page has its own renderer for all the others). */
export function gapText(n: Notice, lang: Lang): string {
  const p = { ...(n.params ?? {}) };
  if (n.code === 'unread-pages' && typeof p.reason === 'string') p.reason = reasonText(p.reason, lang);
  return translate(lang, `collection.notice.${n.code}` as never, p);
}
