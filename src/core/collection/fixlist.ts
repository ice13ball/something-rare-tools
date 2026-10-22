// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// What a finding becomes: a bounded on-screen sample and one line of the fix-list CSV. The rules are the shared ones
// (checkLicence: licence statements, META-EMPTY-LINK, META-NO-VERSION, META-NO-EXTENT); records the run did not read meet none.
import { checkLicence } from '../checks/licence';
import { csvField, guardText } from '../output/csv';
import { renderPlain } from '../report';
import type { Finding, Lang } from '../types';
import { translate } from '../i18n/ui';
import { describeStop } from './stop';
import type { Item, RunStatus, Sample, SourceSpec, StopReason } from './types';

export const FIX_LIST_COLUMNS = ['record', 'field', 'rule_id', 'severity', 'problem', 'suggested_fix', 'source'] as const;

/** Findings of one record. Only a 'checked' record is looked at; an unread one has no finding, whatever it lacks. */
export function evaluateItem(item: Item): Finding[] {
  if (item.state !== 'checked' || item.records.length === 0) return [];
  return checkLicence(item.records, { label: item.ref, inaccessible: false, unreadable: item.unreadable });
}

const clip = (s: string, n = 300): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function toSample(ref: string, f: Finding): Sample {
  const params: Sample['params'] = {};
  for (const [k, v] of Object.entries(f.params)) params[k] = typeof v === 'string' ? clip(v) : v;
  return { ref, ruleId: f.ruleId, severity: f.severity, ...(f.field ? { field: f.field } : {}), ...(f.value ? { value: clip(f.value) } : {}), params };
}

/** A concrete value to write instead of the problem, where the rule has one (language-neutral): the licence to state. */
function suggestedFix(f: Finding): string {
  if (f.ruleId === 'LIC-FREE-TEXT') return String(f.params.hint ?? '');
  if (f.ruleId === 'LIC-DATACITE-EMPTY') return String(f.params.licence ?? '');
  return '';
}

export function sourceLabel(spec: SourceSpec): string {
  return spec.kind === 'csw' ? `csw:${spec.catalogue}` : spec.kind === 'dois' ? 'doi-list' : spec.kind;
}

const line = (fields: readonly string[]): string => fields.map((s) => csvField(guardText(s))).join(',');

export function fixListHeader(): string {
  return `${FIX_LIST_COLUMNS.join(',')}\n`;
}

/** One CSV line (with its newline). The formula guard of the clean-CSV export applies to every text field. */
export function fixListRow(ref: string, f: Finding, lang: Lang, source: string): string {
  return `${line([ref, f.field ?? '', f.ruleId, f.severity, renderPlain(f, lang), suggestedFix(f), source])}\n`;
}

export const RUN_INCOMPLETE = 'RUN-INCOMPLETE';

/** Statuses of a run that has not reached its end: its fix list says so on a last row. */
export const UNFINISHED: readonly RunStatus[] = ['stopped', 'interrupted', 'paused', 'failed'];

/** The status row at the end of an unfinished fix list: why the list stops where it does, and what to do. Same guard as every row. */
export function incompleteRow(status: RunStatus, stop: StopReason | undefined, lang: Lang, source: string): string {
  const problem = stop ? describeStop(stop, lang) : status === 'paused' ? translate(lang, 'collection.stop.paused') : translate(lang, 'collection.stop.userShort');
  return `${line(['(run)', '', RUN_INCOMPLETE, 'info', problem, translate(lang, 'collection.stop.fix'), source])}\n`;
}
