// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Wall-clock: ROW-TEXT-MOJIBAKE reads every text cell of a sheet once. A wide sheet (300,000 rows of 40 columns, no hit) and the same sheet with a hit in every row. Invented cells. Run alone: `npm run test:perf`.
import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkRawTable } from '../../src/core/checks/dwc';
import type { ParsedFile, RawSheet } from '../../src/core/types';

const A_TILDE = String.fromCharCode(0xc3);
const wide = (hit: boolean): ParsedFile => {
  const cols = 40;
  const header = Array.from({ length: cols }, (_, i) => `C${i}`);
  const rows = Array.from({ length: 300_000 }, (_, r) => ({
    line: r + 2,
    fieldCount: cols,
    cells: Array.from({ length: cols }, (_, c) => (c === 5 && hit ? `Lim${A_TILDE}${String.fromCharCode(0xa9)}` : c % 3 === 0 ? `${r}.${c}` : c % 3 === 1 ? 'São Paulo' : `${A_TILDE}x`)),
  }));
  const sheet = { name: 's', header, headerLine: 1, rows } as unknown as RawSheet;
  return { fileName: 'big.csv', kind: 'csv', sheets: [sheet], date1904: false, decimalComma: false, encoding: 'utf-8', findings: [] } as unknown as ParsedFile;
};

describe('ROW-TEXT-MOJIBAKE on a wide sheet', () => {
  for (const hit of [false, true]) {
    it(`300,000 x 40 cells, ${hit ? 'a hit in every row' : 'no hit'}`, () => {
      const file = wide(hit);
      const t0 = performance.now();
      const out = checkRawTable(file, file.sheets[0], []);
      const ms = performance.now() - t0;
      appendFileSync('/tmp/lr-perf.txt', `mojibake ${hit ? 'hit in every row' : 'no hit'}: 300000 rows x 40 columns, ${ms.toFixed(0)} ms\n`);
      expect(out.some((f) => f.ruleId === 'ROW-TEXT-MOJIBAKE')).toBe(hit);
      expect(ms).toBeLessThan(10_000);
    }, 120_000);
  }
});
