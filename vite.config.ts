// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { SITE } from './config/site';

/**
 * The robots meta tag goes into the built pages only while the site is noindex; the HTML sources carry none.
 */
export function robotsMeta(noindex: boolean): Plugin {
  return {
    name: 'robots-meta',
    transformIndexHtml: (html) =>
      noindex && !/<meta\s+name="robots"/i.test(html)
        ? [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex,nofollow' }, injectTo: 'head-prepend' }]
        : [],
  };
}

export default defineConfig({
  plugins: [react(), robotsMeta(SITE.noindex)],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        check: resolve(__dirname, 'check/index.html'),
        licence: resolve(__dirname, 'licence/index.html'),
        collection: resolve(__dirname, 'collection/index.html'),
        privacy: resolve(__dirname, 'privacy/index.html'),
        convert: resolve(__dirname, 'convert/index.html'),
      },
    },
  },
});
