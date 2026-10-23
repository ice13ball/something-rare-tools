// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { SITE } from '../../../config/site';
import { Layout } from '../components/Layout';
import { t, useLang } from '../i18n';
import collectionImage from '../images/menu/collection-review.webp';
import dataImage from '../images/menu/data-check.webp';
import licenceImage from '../images/menu/licence-check.webp';

/** One tile per tool, from one file to a whole collection; the whole tile is the link target (see .tool-link in styles.css). */
const TOOLS = [
  ['/check', 'index.card', dataImage],
  ['/licence', 'index.licence', licenceImage],
  ['/collection', 'index.collection', collectionImage],
] as const;

export function IndexPage(): React.ReactElement {
  useLang();
  return (
    <Layout titleKey="index.docTitle">
      <h1>{t('brand')}</h1>
      <p className="lead">{t('index.lead')}</p>
      <ul className="tools">
        {TOOLS.map(([href, key, image]) => (
          <li key={href} className="tool">
            <img src={image} alt="" width={600} height={325} />
            <h2>{t(`${key}.title`)}</h2>
            <p>{t(`${key}.text`)}</p>
            <a className="tool-link" href={href} aria-label={t(`${key}.cta`)}>
              {t('index.open')}
            </a>
          </li>
        ))}
      </ul>
      <p className="atlas-link">
        {t('index.atlas.lead')} <a href={SITE.atlasUrl}>{t('nav.atlas')}</a>
      </p>
    </Layout>
  );
}
