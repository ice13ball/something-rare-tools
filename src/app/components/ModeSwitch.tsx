// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useState } from 'react';
import type { UiKey } from '../../core/i18n/ui';
import { t, useLang } from '../i18n';
import { DEFAULT_MODE, type DownloadMode } from '../types';

export interface ModeSwitchProps {
  /** Controlled value. When omitted the component keeps its own state, starting at 'browser'. */
  value?: DownloadMode;
  onChange?: (mode: DownloadMode) => void;
  /** Texts by UI key. The defaults are the /check texts (download of linked files); other pages pass their own. */
  texts?: Partial<ModeTexts>;
}

export interface ModeTexts {
  legend: UiKey;
  browserLabel: UiKey;
  browserText: UiKey;
  serverLabel: UiKey;
  serverText: UiKey;
  note: UiKey;
}

const CHECK_TEXTS: ModeTexts = {
  legend: 'mode.legend',
  browserLabel: 'mode.browser.label',
  browserText: 'mode.browser.text',
  serverLabel: 'mode.server.label',
  serverText: 'mode.server.text',
  note: 'mode.local',
};

/** Chosen before any input. Both sentences are visible at all times, the chosen one is not hidden behind a click. */
export function ModeSwitch({ value, onChange, texts }: ModeSwitchProps): React.ReactElement {
  useLang();
  const [own, setOwn] = useState<DownloadMode>(DEFAULT_MODE);
  const mode = value ?? own;
  const k: ModeTexts = { ...CHECK_TEXTS, ...texts };
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
      <legend>{t(k.legend)}</legend>
      {option('browser', t(k.browserLabel), t(k.browserText))}
      {option('server', t(k.serverLabel), t(k.serverText))}
      <p className="muted">{t(k.note)}</p>
    </fieldset>
  );
}
