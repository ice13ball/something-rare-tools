// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { SITE } from '../../../config/site';
import { HeadingTip } from '../components/InfoTip';
import { Layout } from '../components/Layout';
import { atlasHref, t, useLang } from '../i18n';
import collectionImage from '../images/menu/collection-review.webp';
import dataImage from '../images/menu/data-check.webp';
import licenceImage from '../images/menu/licence-check.webp';

/** One tile per tool, from one file to a whole collection; the whole tile is the link target (see .tool-link in styles.css). */
const TOOLS = [
  ['/check', 'index.card', dataImage, 'indexCheck'],
  ['/licence', 'index.licence', licenceImage, 'indexLicence'],
  ['/collection', 'index.collection', collectionImage, 'indexCollection'],
] as const;

export function IndexPage(): React.ReactElement {
  const { lang } = useLang();
  return (
    <Layout titleKey="index.docTitle">
      <h1>
        {t('brand')} — {t('nav.tools')}
      </h1>
      <p className="lead">{t('index.lead')}</p>
      <ul className="tools">
        {TOOLS.map(([href, key, image, tip]) => (
          <li key={href} className="tool">
            <img src={image} alt="" width={600} height={325} />
            <HeadingTip tip={tip}>
              <h2>{t(`${key}.title`)}</h2>
            </HeadingTip>
            <p>{t(`${key}.text`)}</p>
            <a className="tool-link" href={href} aria-label={t(`${key}.cta`)}>
              {t('index.open')}
            </a>
          </li>
        ))}
      </ul>
      <p className="atlas-link">
        {t('index.atlas.lead')} <a href={atlasHref(SITE.atlasUrl, lang)}>{t('nav.atlas')}</a>
      </p>
    </Layout>
  );
}
