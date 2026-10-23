// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Wall-clock test, kept OUT of `npx vitest run` (it is not named *.test.ts): under the load of the full suite (50+ files in parallel) a
// 2 s threshold measures the machine, not the code. `npm run test:perf` runs it alone (vitest.perf.config.ts); scripts/deploy.sh runs
// it as its own step after the full suite and refuses the deploy when it fails. The threshold is the original one.
import { describe, expect, it } from 'vitest';
import { checkCrossFile } from '../../src/core/checks/crossfile';
import { makeCDataset } from '../checks/c.helpers';

describe('performance', () => {
  // retry: a real regression stays slow on every attempt; the threshold is NOT raised.
  it('six datasets of 7000 rows finish well inside 2 s', { retry: 2 }, () => {
    const vars = [{ key: 'DIC', canonical: 'DIC', unit: 'µmol/L' }, { key: 'S', canonical: 'salinity' }];
    const make = (id: string, unit: string) =>
      makeCDataset(
        { id, file: `${id}.csv`, vars: vars.map((v) => (v.key === 'DIC' ? { ...v, unit } : v)) },
        Array.from({ length: 7000 }, (_, i) => ({
          station: `ST${i % 40}`,
          lat: 70 + (i % 40) * 0.01,
          lon: 15 + (i % 40) * 0.01,
          date: `2021-07-${String(1 + (i % 28)).padStart(2, '0')}`,
          depth: i % 175,
          v: { DIC: 2000 + (i % 91), S: 34 + (i % 7) / 10 },
        })),
      );
    const ds = ['µmol/L', 'µmol/kg', 'µmol/L', 'µmol/kg', 'µmol/L', 'µmol/kg'].map((u, i) => make(`d${i}`, u));
    const t0 = Date.now();
    checkCrossFile(ds);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
