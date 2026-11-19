// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Runs scripts/convert-replay.ts (usage in its header). The default vitest.config.ts includes only test/**, so a normal run never reaches it.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/convert-replay.ts'],
    testTimeout: 1_800_000,
  },
});
