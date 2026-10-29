// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Wall-clock: a big long environmental sheet (one row per parameter) is read as one row per sample and converted, in about a second. Run alone: `npx vitest run --config vitest.perf.config.ts test/perf/pivot.perf.ts`.
import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createConvertHandler } from '../../src/worker/convert.handler';
import type { ConvertParseResult, ConvertView } from '../../src/worker/convert.protocol';

function longCsv(rows: number, parameters: number): string {
  const lines = ['Station,Cast,Date,Latitude,Longitude,Depth_m,Parameter,Unit,Value'];
  const samples = Math.ceil(rows / parameters);
  let n = 0;
  for (let s = 0; s < samples && n < rows; s++) {
    for (let p = 0; p < parameters && n < rows; p++, n++) lines.push(`ZL${s % 400},${Math.floor(s / 400)},2023-06-14,${(55 + (s % 400) / 1000).toFixed(3)},2.5,${5 + (s % 7)},Param${p},u${p % 5},${(s * 31 + p) % 997}.5`);
  }
  return lines.join('\n') + '\n';
}

describe('a long environmental sheet, 30 parameters', () => {
  for (const rows of [50_000, 1_500_000]) {
    it(`${rows} rows: parse and convert`, () => {
      const bytes = new TextEncoder().encode(longCsv(rows, 30));
      const h = createConvertHandler();
      const t0 = performance.now();
      const parsed = h.handle({ type: 'parse', files: [{ name: 'big.csv', bytes, source: 'dropped' }] }) as ConvertParseResult;
      const t1 = performance.now();
      const f = parsed.files[0];
      const m = f.mappings[0];
      const view = h.handle({
        type: 'convert',
        body: { sheets: [{ fileId: f.fileId, sheet: m.sheet, mapping: m, shape: 'wide', profile: { depthIds: true } }], options: {}, approvedSplits: {} },
      }) as ConvertView;
      const t2 = performance.now();
      appendFileSync('/tmp/lr-perf.txt', `${rows} rows: parse ${(t1 - t0).toFixed(0)} ms, convert ${(t2 - t1).toFixed(0)} ms, total ${(t2 - t0).toFixed(0)} ms; samples ${f.sheets[0].rowCount}, columns ${f.sheets[0].header.length}, levels ${view.stats.levels}\n`);
      expect(f.pivots).toBeDefined();
      expect(f.sheets[0].header.length).toBe(6 + 30 + 0);
    }, 120_000);
  }
});
