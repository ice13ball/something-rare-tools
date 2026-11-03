// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Wall-clock: one convert() of a wide sheet of 2000 rows and 1000 taxon columns (2 million cells, 2 % of them counts). The page runs convert() again on every interaction, so what the
// ledger (core/convert/ledger.ts) adds to it has to stay small: on the machine this was written on the conversion takes about 0.72 s without the ledger and 0.92 s with it (about +28 %); the
// ledger first cost 2.7 s more (string keys per cell). The limit below leaves room for a slower machine and still fails for a ledger that costs several times the conversion.
// Run alone: `npx vitest run --config vitest.perf.config.ts test/perf/wide.perf.ts`.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { fileOf } from '../convert/helpers';
import type { Cell } from '../convert/helpers';

describe('a wide sheet, 2000 rows x 1000 taxon columns', () => {
  it('converts, ledger included, in about a second', () => {
    const nr = 2000;
    const nc = 1000;
    const header = ['Sample', 'Date', 'Latitude', 'Longitude', ...Array.from({ length: nc }, (_, i) => `Taxon genus${i}`)];
    let seed = 7;
    const rnd = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const rows: Cell[][] = Array.from({ length: nr }, (_, r) => [`s${r}`, '2020-06-01', 49.4, 0.2, ...Array.from({ length: nc }, () => (rnd() < 0.02 ? Math.floor(rnd() * 50) + 1 : 0))]);
    const f = fileOf(header, rows);
    const mapping = {
      sheet: f.sheets[0].name,
      columns: header.map((h, i) => ({ index: i, header: h, role: i === 0 ? { kind: 'sampleId' as const } : i === 1 ? { kind: 'date' as const } : i === 2 ? { kind: 'latitude' as const } : i === 3 ? { kind: 'longitude' as const } : { kind: 'taxon' as const, header: true as const } })),
    };
    const input = { file: f, sheet: f.sheets[0].name, mapping, shape: 'wide' as const, quantity: { kind: 'count' as const } };
    const times: number[] = [];
    let ledgerCells = 0;
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      const r = convert({ sheets: [input], options: {} });
      times.push(performance.now() - t0);
      ledgerCells = r.ledger[0].cells?.source ?? 0;
      expect(r.ledger[0].balanced).toBe(true);
    }
    times.sort((a, b) => a - b);
    console.log(`wide 2000x1000: convert median ${times[1].toFixed(0)} ms (runs ${times.map((t) => t.toFixed(0)).join(', ')}); taxon cells in the ledger ${ledgerCells}`);
    expect(ledgerCells).toBe(nr * nc);
    expect(times[1]).toBeLessThan(1300);
  }, 120_000);
});
