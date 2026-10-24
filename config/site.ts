// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/** One flag controls noindex on every page (meta robots and X-Robots-Tag); /api is noindex either way. */
export const SITE = {
  /** The brand; the two parts are "Atlas" and "Tools" (ui.ts: nav.atlas, nav.tools). Page titles end with "— Abyssal Claims". */
  brand: 'Abyssal Claims',
  noindex: false,
  gaId: 'G-S5HR4WT0ZG',
  atlasUrl: 'https://something-rare.com',
  atlasPrivacyUrl: 'https://something-rare.com/privacy',
  /** The shared consent cookie (atlas and tools): set for this domain so both read it. */
  consentCookie: { name: 'ac_consent', domain: 'something-rare.com', maxAge: 15552000 },
  /** The public repository; the licence label next to it is package.json's SPDX id. */
  sourceUrl: 'https://github.com/ice13ball/something-rare-tools',
  /** The AGPL section 7(b) attribution notice (LICENSE-ADDITIONAL-TERMS.md), word for word in every language, and where it links. */
  attribution: 'Based on Abyssal Claims — © 2026 Michal Mazurowski',
  attributionUrl: 'https://doi.org/10.5281/zenodo.19745884',
  /** Same public address as the atlas's privacy text; also in the proxy's User-Agent. */
  contactEmail: 'm.mazurowski@ai-wall.com',
  origin: 'https://tools.something-rare.com',
} as const;
