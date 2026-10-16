// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { SITE } from '../../../config/site';
import { Layout } from '../components/Layout';
import { t, useLang } from '../i18n';

export function IndexPage(): React.ReactElement {
  useLang();
  return (
    <Layout>
      <h1>{t('brand')}</h1>
      <p className="lead">{t('index.lead')}</p>
      <article className="card">
        <h2>{t('index.card.title')}</h2>
        <p>{t('index.card.text')}</p>
        <a className="button" href="/check">
          {t('index.card.cta')}
        </a>
      </article>
      <p className="atlas-link">
        {t('index.atlas.lead')} <a href={SITE.atlasUrl}>{t('nav.atlas')}</a>
      </p>
    </Layout>
  );
}
