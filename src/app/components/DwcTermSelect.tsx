// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { TERM_GROUPS, extraTerm, termOptionText, termsByGroup } from '../dwcTermModel';
import { t } from '../i18n';
import type { UiKey } from '../../core/i18n/ui';

interface Props {
  label: string;
  term: string;
  onTerm: (term: string) => void;
}

/** The second select of the role "Darwin Core term…": the open terms by table, with their GBIF / OBIS status. */
export function DwcTermSelect({ label, term, onTerm }: Props): React.ReactElement {
  const groups = termsByGroup();
  const extra = extraTerm(term);
  return (
    <select aria-label={`${label}: ${t('mapping.dwcTerm')}`} value={term} onChange={(e) => onTerm(e.target.value)}>
      {term === '' && <option value="">{t('dwcTerm.choose')}</option>}
      {extra !== undefined && <option value={extra}>{extra}</option>}
      {TERM_GROUPS.map((g) => (
        <optgroup key={g} label={t(`dwcTerm.group.${g}` as UiKey)}>
          {groups[g].map((x) => (
            <option key={x.name} value={x.name}>
              {termOptionText(x.name)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
