// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useState } from 'react';
import { denyConsent, getStoredConsent, grantConsent } from '../analytics';
import { t, useLang } from '../i18n';

export interface CookieBannerProps {
  /** Open even when a decision is stored (the footer's "Cookie settings" button). */
  forceOpen?: boolean;
  /** Called after Accept or Decline. */
  onClose?: () => void;
}

/** Asks once; no decision means analytics stays off. Decline is as prominent as Accept. */
export function CookieBanner({ forceOpen, onClose }: CookieBannerProps): React.ReactElement | null {
  useLang();
  const [dismissed, setDismissed] = useState(false);
  const [undecided] = useState(() => getStoredConsent() === null);
  if (dismissed || !(forceOpen || undecided)) return null;

  const decide = (granted: boolean): void => {
    if (granted) grantConsent();
    else denyConsent();
    setDismissed(true);
    onClose?.();
  };

  return (
    <section className="cookie-banner" role="region" aria-label={t('cookie.label')}>
      <p>
        {t('cookie.text')} <a href="/privacy">{t('nav.privacy')}</a>
      </p>
      <div className="cookie-actions">
        <button type="button" className="button secondary" onClick={() => decide(false)}>
          {t('cookie.decline')}
        </button>
        <button type="button" className="button" onClick={() => decide(true)}>
          {t('cookie.accept')}
        </button>
      </div>
    </section>
  );
}
