// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { t, useLang } from '../i18n';

export interface SingleCruiseProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Files in which a column is mapped as the cruise: for those the column is used and this tick is not. */
  columnFiles: string[];
}

/**
 * The declaration "all measurements in these files come from one cruise of one ship" at the confirm step. It covers every file
 * together (one track), switches the ship-speed rule on, and is a controlled value of the page: it starts unticked for each upload
 * (or from a mapping file dropped with the files) and is stored nowhere but in the companion mapping file the user downloads.
 */
export function SingleCruise({ checked, onChange, columnFiles }: SingleCruiseProps): React.ReactElement {
  useLang();
  return (
    <div className="single-cruise">
      <label className="inline-choice">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby="single-cruise-help" />
        <span>{t('confirm.singleCruise')}</span>
      </label>
      <p id="single-cruise-help" className="muted">
        {t('confirm.singleCruise.help')}
      </p>
      {columnFiles.length > 0 && (
        <p className="muted" role="note">
          {t('confirm.singleCruise.byColumn', { names: columnFiles.join(', ') })}
        </p>
      )}
    </div>
  );
}
