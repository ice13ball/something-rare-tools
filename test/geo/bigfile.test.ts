// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A file of 200,000 ragged rows on land: one finding cites every line. A spread of that list into Math.min or push overflows the stack of a
// browser worker (Chrome's is smaller than Node's, which survives ~120k), so the check ended in "Maximum call stack size exceeded".
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { formatLines, renderPlain, renderTechnical } from '../../src/core/report';
import { loadLandMask } from '../../src/core/geo/land';
import { createDirectEngine } from '../../src/worker/handler';

const GZ = readFileSync(join(__dirname, '..', '..', 'src', 'core', 'geo', 'land-mask.bin'));
const ROWS = 200_000;

function bigCsv(): Uint8Array {
  const parts = ['Station,Date,Latitude,Longitude,Depth,Temp'];
  for (let i = 0; i < ROWS; i++) parts.push(`ZB${(i % 50) + 1},2021-07-${String((i % 28) + 1).padStart(2, '0')},52.2,21.0,${(i % 40) + 1},${(4 + (i % 100) / 10).toFixed(1)},x,y`);
  return new TextEncoder().encode(parts.join('\n') + '\n');
}

describe('a file with 200,000 ragged rows on land', () => {
  it('is checked to the end, and every report path copes with the long line lists', async () => {
    const engine = createDirectEngine({ land: () => loadLandMask(new Uint8Array(GZ), async (b) => new Uint8Array(gunzipSync(b))) });
    const parsed = await engine.parse([{ name: 'big.csv', bytes: bigCsv(), source: 'dropped' }], [], []);
    const f = parsed.files[0];
    const proposed = await engine.propose(f.fileId, f.layout);
    await engine.build(f.fileId, f.layout, proposed.mappings);
    const { report, datasets } = await engine.check();

    const ragged = report.findings.find((x) => x.ruleId === 'ROW-RAGGED');
    expect(ragged?.lines).toHaveLength(ROWS);
    const land = report.findings.find((x) => x.ruleId === 'ROW-ON-LAND');
    expect(land).toBeDefined();

    for (const x of report.findings) {
      expect(typeof formatLines(x.lines)).toBe('string');
      expect(renderPlain(x, 'en').length).toBeGreaterThan(0);
      expect(renderTechnical(x).length).toBeGreaterThan(0);
    }
    expect(formatLines(ragged?.lines)).toContain('–');

    const ids = datasets.map((d) => d.id);
    for (const kind of ['cleanCsv', 'sidecar', 'geojson'] as const) expect((await engine.export(kind, ids)).length).toBeGreaterThan(0);
    expect(await engine.row('big.csv', 2)).not.toBeNull();
  }, 60_000);
});
