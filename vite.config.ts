// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        check: resolve(__dirname, 'check/index.html'),
        privacy: resolve(__dirname, 'privacy/index.html'),
      },
    },
  },
});
