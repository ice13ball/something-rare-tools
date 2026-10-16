// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useState } from 'react';
import { t, useLang } from '../i18n';
import { DEFAULT_MODE, type DownloadMode } from '../types';

export interface ModeSwitchProps {
  /** Controlled value. When omitted the component keeps its own state, starting at 'browser'. */
  value?: DownloadMode;
  onChange?: (mode: DownloadMode) => void;
}

/** Chosen before any input. Both sentences are visible at all times, the chosen one is not hidden behind a click. */
export function ModeSwitch({ value, onChange }: ModeSwitchProps): React.ReactElement {
  useLang();
  const [own, setOwn] = useState<DownloadMode>(DEFAULT_MODE);
  const mode = value ?? own;
  const choose = (m: DownloadMode): void => {
    setOwn(m);
    onChange?.(m);
  };
  const option = (m: DownloadMode, label: string, text: string): React.ReactElement => (
    <div className={mode === m ? 'mode-option selected' : 'mode-option'}>
      <label>
        <input type="radio" name="download-mode" value={m} checked={mode === m} onChange={() => choose(m)} aria-describedby={'mode-' + m + '-text'} />
        <span>{label}</span>
      </label>
      <p id={'mode-' + m + '-text'}>{text}</p>
    </div>
  );
  return (
    <fieldset className="mode-switch">
      <legend>{t('mode.legend')}</legend>
      {option('browser', t('mode.browser.label'), t('mode.browser.text'))}
      {option('server', t('mode.server.label'), t('mode.server.text'))}
      <p className="muted">{t('mode.local')}</p>
    </fieldset>
  );
}
