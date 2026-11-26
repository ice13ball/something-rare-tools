// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { t, useLang } from '../i18n';

export interface ConvertTablesOnlyProps {
  /** Nothing blocks the data and every warning is accepted; the description and the licence are not asked for. */
  enabled: boolean;
  /** An export is running (this one or the full archive). */
  busy: boolean;
  onPress: () => void;
  /** Said under the button while it is off (the page knows whether it is only busy). */
  showBlocked?: boolean;
}

/**
 * The second export, beside the full archive: the data tables only, for a person whose IPT or catalogue writes the description. The sentence that it is
 * not a complete archive is plain text beside the button, in every language, never a tooltip.
 */
export function ConvertTablesOnly({ enabled, busy, onPress, showBlocked = true }: ConvertTablesOnlyProps): React.ReactElement {
  useLang();
  return (
    <div className="convert-tables-only" data-testid="tables-only">
      <button type="button" className="button" data-testid="tables-only-export" disabled={!enabled || busy} aria-describedby="convert-tables-note" onClick={onPress}>
        {t('convert.tables.button')}
      </button>
      <p id="convert-tables-note" className="muted" data-testid="tables-only-note">
        {t('convert.tables.note')}
      </p>
      {!enabled && !busy && showBlocked && <p className="muted" role="note">{t('convert.tables.blocked')}</p>}
    </div>
  );
}
