// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The whole suite with the capture-and-replay recorder in front of convert() (scripts/convert-replay/recorder.setup.ts). Same tests as vitest.config.ts; the default config never loads the recorder.
//   CONVERT_RECORD=convert-recordings/head nice -n 15 npx vitest run --config vitest.convert-record.config.ts --maxWorkers=2
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    setupFiles: ['scripts/convert-replay/recorder.setup.ts'],
    globalSetup: ['scripts/convert-replay/record.global.ts'],
  },
});
