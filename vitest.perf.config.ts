// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Wall-clock tests only (test/perf/*.perf.ts): run alone, one file at a time, never inside the full suite. `npm run test:perf`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/perf/**/*.perf.ts'],
    fileParallelism: false,
  },
});
