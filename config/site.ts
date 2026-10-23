// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/** One flag controls noindex on every page (meta robots and X-Robots-Tag); /api is noindex either way. */
export const SITE = {
  brand: 'Abyssal Claims Tools',
  noindex: false,
  gaId: 'G-S5HR4WT0ZG',
  atlasUrl: 'https://something-rare.com',
  /** The public repository; the licence label next to it is package.json's SPDX id. */
  sourceUrl: 'https://github.com/ice13ball/something-rare-tools',
  /** Same public address as the atlas's privacy text; also in the proxy's User-Agent. */
  contactEmail: 'm.mazurowski@ai-wall.com',
  origin: 'https://tools.something-rare.com',
} as const;
