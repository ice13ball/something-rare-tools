// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { DATA_HOSTS, MAP_PRIVACY_URL } from '../../../config/hosts';
import { SITE } from '../../../config/site';
import { Layout } from '../components/Layout';
import { t, useLang } from '../i18n';

export function PrivacyPage(): React.ReactElement {
  useLang();
  return (
    <Layout titleKey="privacy.title">
      <h1>{t('privacy.title')}</h1>
      <section>
        <h2>{t('privacy.local.h')}</h2>
        <p>{t('privacy.local.p')}</p>
      </section>
      <section>
        <h2>{t('privacy.browser.h')}</h2>
        <p>{t('privacy.browser.p')}</p>
        <p>{t('privacy.browser.p2')}</p>
      </section>
      <section>
        <h2>{t('privacy.server.h')}</h2>
        <p>{t('privacy.server.p1')}</p>
        <ul className="host-list">
          {DATA_HOSTS.map((h) => (
            <li key={h}>
              <code>{h}</code>
            </li>
          ))}
        </ul>
        <p>{t('privacy.server.p2')}</p>
      </section>
      <section>
        <h2>{t('privacy.logs.h')}</h2>
        <p>{t('privacy.logs.p1')}</p>
        <p>{t('privacy.logs.p2')}</p>
      </section>
      <section>
        <h2>{t('privacy.map.h')}</h2>
        <p>{t('privacy.map.p')}</p>
        <p>
          {t('privacy.map.policy')}: <a href={MAP_PRIVACY_URL}>{MAP_PRIVACY_URL.replace('https://', '')}</a>
        </p>
      </section>
      <section>
        <h2>{t('privacy.analytics.h')}</h2>
        <p>{t('privacy.analytics.p1')}</p>
        <p>{t('privacy.analytics.p2')}</p>
      </section>
      <section>
        <h2>{t('privacy.legal.h')}</h2>
        <p>{t('privacy.legal.p')}</p>
      </section>
      <section>
        <h2>{t('privacy.contact.h')}</h2>
        <p>
          {t('privacy.contact.p')}: <a href={'mailto:' + SITE.contactEmail}>{SITE.contactEmail}</a>
        </p>
        <p>
          {t('privacy.contact.more')}: <a href={SITE.atlasUrl}>{SITE.atlasUrl.replace('https://', '')}</a>
        </p>
      </section>
    </Layout>
  );
}
