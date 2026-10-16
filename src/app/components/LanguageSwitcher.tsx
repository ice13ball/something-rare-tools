// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { LANGS, type Lang } from '../../core/types';
import { t, useLang } from '../i18n';

/** Endonyms: each language is named in itself. */
const NAMES: Record<Lang, string> = { pl: 'Polski', en: 'English', de: 'Deutsch', fr: 'Français' };

/** Stores the choice in localStorage and updates <html lang>; the URL is never touched. */
export function LanguageSwitcher(): React.ReactElement {
  const { lang, setLang } = useLang();
  return (
    <label className="lang-switch">
      <span>{t('nav.language')}</span>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
        {LANGS.map((l) => (
          <option key={l} value={l} lang={l}>
            {NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
