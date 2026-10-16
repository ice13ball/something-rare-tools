// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The metadata draft as sections named like the GeoNetwork editor shows them, each field with the text to copy.
import { translate, type UiKey } from '../core/i18n/ui';
import { GN_FIELD_LABELS, variableLabel, type MetadataDraft } from '../core/output/draft';
import type { Lang } from '../core/types';

export interface DraftField {
  key: string;
  label: string;
  value: string;
  copy: string;
}
export interface DraftSection {
  id: 'temporalExtent' | 'bbox' | 'licence' | 'variables';
  heading: string;
  fields: DraftField[];
}

/** Only sections the data can fill: a draft with nothing in it gives an empty list. */
export function draftSections(draft: MetadataDraft, lang: Lang): DraftSection[] {
  const labels = GN_FIELD_LABELS[lang] ?? GN_FIELD_LABELS.en;
  const tr = (k: UiKey): string => translate(lang, k);
  const field = (key: string, label: string, value: string): DraftField => ({ key, label, value, copy: value });
  const out: DraftSection[] = [];
  if (draft.temporalExtent) {
    out.push({
      id: 'temporalExtent',
      heading: labels.temporalExtent,
      fields: [field('begin', tr('downloads.begin'), draft.temporalExtent.start), field('end', tr('downloads.end'), draft.temporalExtent.end)],
    });
  }
  if (draft.bbox) {
    const b = draft.bbox;
    out.push({
      id: 'bbox',
      heading: labels.bbox,
      fields: [
        field('west', tr('downloads.west'), String(b.west)),
        field('east', tr('downloads.east'), String(b.east)),
        field('south', tr('downloads.south'), String(b.south)),
        field('north', tr('downloads.north'), String(b.north)),
      ],
    });
  }
  if (draft.licence) {
    out.push({
      id: 'licence',
      heading: labels.licence,
      fields: [field('spdx', tr('downloads.licenceId'), draft.licence.spdx), field('uri', tr('downloads.licenceUri'), draft.licence.uri)],
    });
  }
  if (draft.variables.length > 0) {
    const lines = draft.variables.map(variableLabel);
    const text = lines.join('\n');
    out.push({ id: 'variables', heading: labels.variables, fields: [{ key: 'variables', label: tr('downloads.variables'), value: text, copy: text }] });
  }
  return out;
}
