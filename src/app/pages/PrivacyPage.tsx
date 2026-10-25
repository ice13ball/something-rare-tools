// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { CSW_HOSTS } from '../../../config/catalogues';
import { DATA_HOSTS, MAP_PRIVACY_URL } from '../../../config/hosts';
import { IPT_HOSTS } from '../../../config/ipt';
import { SITE } from '../../../config/site';
import { Layout } from '../components/Layout';
import { atlasHref, t, useLang } from '../i18n';

export function PrivacyPage(): React.ReactElement {
  const { lang } = useLang();
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
          {DATA_HOSTS.filter((h) => !IPT_HOSTS.includes(h)).map((h) => (
            <li key={h}>
              <code>{h}</code>
            </li>
          ))}
        </ul>
        <p>{t('privacy.server.p2')}</p>
      </section>
      <section>
        <h2>{t('privacy.gbif.h')}</h2>
        <p>{t('privacy.gbif.p1')}</p>
        <p>{t('privacy.gbif.p2')}</p>
        <ul className="host-list ipt-hosts">
          {IPT_HOSTS.map((h) => (
            <li key={h}>
              <code>{h}</code>
            </li>
          ))}
        </ul>
        <p>{t('privacy.gbif.p3')}</p>
      </section>
      <section>
        <h2>{t('privacy.collection.h')}</h2>
        <p>{t('privacy.collection.p1')}</p>
        <ul className="host-list">
          {CSW_HOSTS.map((h) => (
            <li key={h}>
              <code>{h}</code>
            </li>
          ))}
        </ul>
        <p>{t('privacy.collection.p2')}</p>
      </section>
      <section>
        <h2>{t('privacy.convert.h')}</h2>
        <p>{t('privacy.convert.p1')}</p>
        <p>{t('privacy.convert.p2')}</p>
        <p>{t('privacy.convert.worms')}</p>
        <p>{t('privacy.convert.nvs')}</p>
        <p>{t('privacy.convert.p3')}</p>
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
        <p>{t('privacy.analytics.p3')}</p>
        <p>{t('privacy.consent.p')}</p>
      </section>
      <section>
        <h2>{t('privacy.counter.h')}</h2>
        <p>{t('privacy.counter.p')}</p>
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
          {t('privacy.contact.more')}: <a href={atlasHref(SITE.atlasUrl, lang)}>{SITE.atlasUrl.replace('https://', '')}</a>
        </p>
        <p>
          {t('privacy.atlas.policy')}: <a href={atlasHref(SITE.atlasPrivacyUrl, lang)}>{SITE.atlasPrivacyUrl.replace('https://', '')}</a>
        </p>
      </section>
    </Layout>
  );
}
