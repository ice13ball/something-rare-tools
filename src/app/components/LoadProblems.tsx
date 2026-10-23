// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { renderPlain } from '../../core/report';
import type { Finding } from '../../core/types';
import { t, useLang } from '../i18n';
import type { DownloadMode } from '../types';

export interface LoadProblemsProps {
  findings: Finding[];
  mode: DownloadMode;
  /** Sets the download mode to server. Does NOT retry: the user clicks Check again. */
  onSwitchToServer: () => void;
}

export const LOAD_RULES: readonly string[] = ['IN-FETCH-BLOCKED', 'IN-FETCH-TIMEOUT', 'IN-FETCH-INTERRUPTED', 'IN-ARCHIVE-TOO-LARGE', 'IN-ARCHIVE-DAILY-BUDGET', 'IN-ARCHIVE-BUSY', 'IN-IPT-HOST-NOT-LISTED', 'IN-NO-DWC-ARCHIVE', 'IN-HOST-NOT-ALLOWED', 'IN-RECORD-INACCESSIBLE'];

/**
 * Downloads that failed, in plain words with the host. A browser download blocked by the data server (CORS/CSP) gets the
 * two ways out: switch to server mode (a click here, then Check again) or download the file and drop it here.
 */
export function LoadProblems({ findings, mode, onSwitchToServer }: LoadProblemsProps): React.ReactElement | null {
  const { lang } = useLang();
  const list = findings.filter((f) => LOAD_RULES.includes(f.ruleId));
  if (list.length === 0) return null;
  const blockedInBrowser = mode === 'browser' && list.some((f) => f.ruleId === 'IN-FETCH-BLOCKED' || f.ruleId === 'IN-FETCH-TIMEOUT');
  const blockedInServerMode = mode === 'server' && list.some((f) => f.ruleId === 'IN-FETCH-BLOCKED');
  return (
    <section className="load-problems" role="alert" aria-label={t('blocked.title')}>
      <h2>{t('blocked.title')}</h2>
      <ul>
        {list.map((f, i) => (
          <li key={i + f.ruleId + (f.file ?? '')}>
            <p>{renderPlain(f, lang)}</p>
            {f.ruleId === 'IN-FETCH-BLOCKED' && typeof f.params.host === 'string' && (
              <p className="muted">
                {t('blocked.host', { host: f.params.host })}
                {f.file ? ' — ' + f.file : ''}
              </p>
            )}
          </li>
        ))}
      </ul>
      {blockedInBrowser && (
        <div className="blocked-actions">
          <button type="button" className="button secondary" onClick={onSwitchToServer}>
            {t('blocked.switch')}
          </button>
          <p>{t('blocked.drop')}</p>
        </div>
      )}
      {blockedInServerMode && <p>{t('blocked.drop')}</p>}
    </section>
  );
}

/** Shown once the user has switched to server mode after a blocked download. */
export function SwitchedNotice(): React.ReactElement {
  useLang();
  return (
    <p className="notice" role="status">
      {t('blocked.switched')}
    </p>
  );
}
