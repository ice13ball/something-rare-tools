// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The pick list of the role "Darwin Core term…" on /convert: the open terms grouped by table, each with its GBIF / OBIS status. Term names are never translated; the status words are.
import type { UiKey } from '../core/i18n/ui';
import { isOpenTerm, openTermOf } from '../core/convert/dwcTermColumns';
import { DWC_TERM_LIST, type ListedTerm, type TermStatus } from '../core/convert/dwcTermList';
import { t } from './i18n';

export type TermGroup = 'event' | 'occurrence' | 'record';
export const TERM_GROUPS: readonly TermGroup[] = ['event', 'occurrence', 'record'];

const STATUS_KEY: Readonly<Record<TermStatus, UiKey>> = {
  required: 'dwcTerm.status.required',
  'required if exists': 'dwcTerm.status.requiredIfExists',
  'conditionally required': 'dwcTerm.status.conditionallyRequired',
  'strongly recommended': 'dwcTerm.status.stronglyRecommended',
  recommended: 'dwcTerm.status.recommended',
};

/** "habitat (OBIS: recommended)", "x (GBIF: recommended; OBIS: required)"; the bare name for a term that is not on the list. */
export function termOptionText(name: string): string {
  const listed = DWC_TERM_LIST.find((x) => x.name === name);
  if (listed === undefined) return name;
  const parts = (['gbif', 'obis'] as const).flatMap((k) => (listed.statuses[k] === undefined ? [] : [`${k.toUpperCase()}: ${t(STATUS_KEY[listed.statuses[k]])}`]));
  return parts.length === 0 ? name : `${name} (${parts.join('; ')})`;
}

/** The open listed terms by table, in list order. */
export function termsByGroup(): Record<TermGroup, ListedTerm[]> {
  const out: Record<TermGroup, ListedTerm[]> = { event: [], occurrence: [], record: [] };
  for (const x of DWC_TERM_LIST) if (isOpenTerm(x.name)) out[x.level].push(x);
  return out;
}

/** The term the current role holds when it is not on the pick list (an optional term proposed from an exact header): it is always an option. */
export const extraTerm = (current: string): string | undefined => {
  if (current === '' || openTermOf(current) === undefined) return undefined;
  return DWC_TERM_LIST.some((x) => x.name === current) ? undefined : current;
};
