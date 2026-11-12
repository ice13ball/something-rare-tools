// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { SITE } from '../../../config/site';
import { HeadingTip } from '../components/InfoTip';
import { Layout } from '../components/Layout';
import { atlasHref, t, useLang } from '../i18n';
import collectionImage from '../images/menu/collection-review.webp';
import convertImage from '../images/menu/convert.webp';
import dataImage from '../images/menu/data-check.webp';
import licenceImage from '../images/menu/licence-check.webp';

/** One tile per tool, from one file to a whole collection; the whole tile is the link target (see .tool-link in styles.css). */
const TOOLS = [
  ['/check', 'index.card', dataImage, 'indexCheck'],
  ['/licence', 'index.licence', licenceImage, 'indexLicence'],
  ['/collection', 'index.collection', collectionImage, 'indexCollection'],
  ['/convert', 'index.convert', convertImage, 'indexConvert'],
] as const;

const doiUrl = (doi: string): string => 'https://doi.org/' + doi;

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
      <section>
        <h2>{t('cite.h')}</h2>
        <p>
          {t('cite.article')} <a href={doiUrl(SITE.doiArticle)}>{doiUrl(SITE.doiArticle)}</a>
        </p>
        <p>
          {t('cite.code')} <a href={doiUrl(SITE.doiCode100)}>{doiUrl(SITE.doiCode100)}</a>. {t('cite.all')}{' '}
          <a href={doiUrl(SITE.doiCodeAll)}>{doiUrl(SITE.doiCodeAll)}</a>.
        </p>
      </section>
    </Layout>
  );
}
