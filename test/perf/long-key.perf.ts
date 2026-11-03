// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Wall-clock: finding the column that joins the key of a long sheet does not grow with the pairs of rows or of parameter sets. Every row is invented. Run alone: `npx vitest run --config vitest.perf.config.ts test/perf/long-key.perf.ts`.
import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extendLongKey } from '../../src/core/dataset';
import { proposeLayout } from '../../src/core/recognize/layout';
import { textFile } from '../helpers/files';

const HEAD = 'Station,Latitude,Longitude,Date,Level,Parameter,Value';
const timed = (name: string, lines: string[]): void => {
  const file = textFile('big.csv', lines.join('\n'));
  const plan = proposeLayout(file).tables[0].long!;
  const t0 = performance.now();
  const added = extendLongKey(file.sheets[0], plan, [0, 1, 2, 3], false);
  const ms = performance.now() - t0;
  appendFileSync('/tmp/lr-perf.txt', `${name}: ${lines.length - 1} rows, ${ms.toFixed(0)} ms\n`);
  expect(added).toEqual([4]);
  expect(ms).toBeLessThan(10_000);
};

describe('extendLongKey on the sheets that are hardest for it', () => {
  it('40 casts of 1,999 levels: the rows of a cast make one parameter set', () => {
    const lines = [HEAD];
    for (let c = 0; c < 40; c++) for (let l = 1; l <= 1999; l++) lines.push(`S${c},40,0.2,2020-06-01,${l},Temperature,${10 + l * 0.001}`, `S${c},40,0.2,2020-06-01,${l},Salinity,${35 + l * 0.001}`);
    timed('40 casts', lines);
  }, 120_000);

  for (const [name, anchors] of [['one parameter in every set', [['Shared']]], ['two of three parameters in every set, none in all', [['X', 'Y'], ['Y', 'Z'], ['X', 'Z']]]] as [string, string[][]][]) {
    it(`40,000 different parameter sets in one key, ${name}`, () => {
      const lines = [HEAD];
      let d = 0;
      for (let a = 0; a < 80 && d < 40_000; a++) for (let b = a + 1; b < 80 && d < 40_000; b++) for (let e = b + 1; e < 80 && d < 40_000; e++, d++) {
        for (const p of [`P${a}`, `P${b}`, `P${e}`, ...anchors[d % anchors.length]]) lines.push(`S1,40,0.2,2020-06-01,K${d},${p},${d + 0.5}`);
      }
      timed(`40,000 sets, ${name}`, lines);
    }, 120_000);
  }
});
