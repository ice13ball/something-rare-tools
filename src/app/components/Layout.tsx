// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useEffect, useState } from 'react';
import { SITE } from '../../../config/site';
import type { UiKey } from '../../core/i18n/ui';
import { t, useLang } from '../i18n';
import { CookieBanner } from './CookieBanner';
import { LanguageSwitcher } from './LanguageSwitcher';

export interface LayoutProps {
  /** Key of the page title; shown in the tab as "<title> — Abyssal Claims Tools" (keep it in step with the page's static <title>). */
  titleKey?: UiKey;
  children: React.ReactNode;
}

/** All three tools, with the same names as the home tiles; the current page is marked. */
const NAV_TOOLS = [
  ['/check', 'index.card.title'],
  ['/licence', 'index.licence.title'],
  ['/collection', 'index.collection.title'],
] as const;

/** Brand header, main area, footer (privacy link, cookie settings, language switcher) and the cookie banner. */
export function Layout({ titleKey, children }: LayoutProps): React.ReactElement {
  const { lang } = useLang();
  const [cookieOpen, setCookieOpen] = useState(false);
  const here = typeof location === 'undefined' ? '' : location.pathname.replace(/\/+$/, '');

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
          {NAV_TOOLS.map(([href, key]) => (
            <a key={href} href={href} aria-current={here === href ? 'page' : undefined}>
              {t(key)}
            </a>
          ))}
          <a className="nav-external" href={SITE.atlasUrl}>
            {t('nav.atlasShort')}
          </a>
        </nav>
      </header>
      <main id="main" className="container" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <a href={SITE.atlasUrl}>{t('nav.atlas')}</a>
        <a href="/privacy">{t('nav.privacy')}</a>
        <a href={SITE.sourceUrl}>{t('footer.source')}</a>
        {/* the attribution notice is a licence condition: the same English words in every UI language */}
        <a href={SITE.attributionUrl} lang="en">
          {SITE.attribution}
        </a>
        <button type="button" className="link-button" onClick={() => setCookieOpen(true)}>
          {t('footer.cookies')}
        </button>
        <LanguageSwitcher />
      </footer>
      <CookieBanner key={cookieOpen ? 'forced' : 'initial'} forceOpen={cookieOpen} onClose={() => setCookieOpen(false)} />
    </>
  );
}
