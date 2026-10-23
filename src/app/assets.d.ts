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

// A file bundled as-is, imported for its URL (the land mask the check worker loads on demand).
declare module '*.bin?url' {
  const url: string;
  export default url;
}
