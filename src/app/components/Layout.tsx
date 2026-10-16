// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useEffect, useState } from 'react';
import { SITE } from '../../../config/site';
import type { UiKey } from '../../core/i18n/ui';
import { t, useLang } from '../i18n';
import { CookieBanner } from './CookieBanner';
import { LanguageSwitcher } from './LanguageSwitcher';

export interface LayoutProps {
  /** Key of the page title; shown in the tab as "<title> — Abyssal Claims Tools". Omit for the home page. */
  titleKey?: UiKey;
  children: React.ReactNode;
}

/** Brand header, main area, footer (privacy link, cookie settings, language switcher) and the cookie banner. */
export function Layout({ titleKey, children }: LayoutProps): React.ReactElement {
  const { lang } = useLang();
  const [cookieOpen, setCookieOpen] = useState(false);

  useEffect(() => {
    document.title = titleKey ? t(titleKey) + ' — ' + SITE.brand : SITE.brand;
  }, [titleKey, lang]);

  return (
    <>
      <a className="skip-link" href="#main">
        {t('nav.skip')}
      </a>
      <header className="site-header">
        <a className="brand" href="/">
          {t('brand')}
        </a>
        <nav aria-label="Main">
          <a href="/check">{t('nav.check')}</a>
        </nav>
      </header>
      <main id="main" className="container" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <a href="/privacy">{t('nav.privacy')}</a>
        <button type="button" className="link-button" onClick={() => setCookieOpen(true)}>
          {t('footer.cookies')}
        </button>
        <LanguageSwitcher />
      </footer>
      <CookieBanner key={cookieOpen ? 'forced' : 'initial'} forceOpen={cookieOpen} onClose={() => setCookieOpen(false)} />
    </>
  );
}
