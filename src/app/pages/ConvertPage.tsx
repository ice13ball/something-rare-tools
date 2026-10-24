// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { InfoTip } from '../components/InfoTip';
import { Layout } from '../components/Layout';
import { t, useLang } from '../i18n';

/**
 * /convert, stage 0: a hidden shell. No drop zone and no processing yet; the page says so. It is in no menu, index card, footer link,
 * sitemap or robots.txt, and is served noindex (server/headers.ts HIDDEN_PATHS).
 */
export function ConvertPage(): React.ReactElement {
  useLang();
  return (
    <Layout titleKey="convert.title">
      <h1>{t('convert.title')}</h1>
      <div className="with-tip">
        <p className="lead">{t('convert.intro')}</p>
        <InfoTip id="convertIntro" />
      </div>
      <section className="notice" role="status">
        <h2>{t('convert.status.title')}</h2>
        <p>{t('convert.status.text')}</p>
      </section>
    </Layout>
  );
}
