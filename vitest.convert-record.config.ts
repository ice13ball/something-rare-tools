// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The whole suite with the capture-and-replay recorder in front of convert() (scripts/convert-replay/recorder.setup.ts). Same tests as vitest.config.ts; the default config never loads the recorder.
// Do not run this config directly: it leaves the recording unmarked and replay refuses it. Use `CONVERT_RECORD=convert-recordings/head npm run convert:record` (records, then marks).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    setupFiles: ['scripts/convert-replay/recorder.setup.ts'],
    globalSetup: ['scripts/convert-replay/record.global.ts'],
  },
});
