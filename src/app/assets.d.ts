// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Vite's `?worker&url` import: the URL of a bundled worker file.
declare module '*?worker&url' {
  const url: string;
  export default url;
}

// Images imported by a page: Vite bundles them into /assets with a hashed name.
declare module '*.webp' {
  const url: string;
  export default url;
}
