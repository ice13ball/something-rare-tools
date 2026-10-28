// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Runs scripts/audit-file.ts (usage in its header). The default vitest.config.ts includes only test/**, so a normal run never reaches it.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/audit-file.ts'],
    testTimeout: 600_000,
  },
});
