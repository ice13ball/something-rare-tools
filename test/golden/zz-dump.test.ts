// TEMPORARY golden dump (not committed): findings and proposals per input, as JSON.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { runChecks } from '../../src/core/checks/run';
import { decodeLandMask } from '../../src/core/geo/land';
import { runInput, type GoldenInput } from './pipeline';

const dir = process.env.GOLDEN_DIR;
const out = process.env.DUMP_OUT;
const land = decodeLandMask(new Uint8Array(gunzipSync(readFileSync(join(__dirname, '..', '..', 'src', 'core', 'geo', 'land-mask.bin')))));

it.skipIf(!dir || !out)('dump', async () => {
  const exp = JSON.parse(readFileSync(join(dir!, 'expected.json'), 'utf-8')) as { inputs: GoldenInput[] };
  const res: Record<string, unknown> = {};
  for (const input of exp.inputs) {
    const r = await runInput(input, dir!);
    const f = runChecks({ datasets: r.datasets, records: r.records, parseFindings: r.parseFindings }, { land }).findings;
    res[input.id] = {
      findings: f.map((x) => `${x.severity} ${x.ruleId} ${x.file ?? '-'}${x.sheet ? '/' + x.sheet : ''} n=${x.lines?.length ?? 0} ${x.value !== undefined ? 'v=' + x.value : ''}`).sort(),
      datasets: r.datasets.map((d) => ({
        file: d.file, label: d.label, depthPositive: d.depthPositive,
        metaExtent: d.metadata.map((m) => ({ s: m.source, bbox: m.bbox, t: m.temporalExtent })),
        mappings: d.mappings.map((m) => ({ sheet: m.sheet, cols: m.columns.map((c) => `${c.index}:${c.header}=>${JSON.stringify(c.role)}`) })),
      })),
    };
  }
  writeFileSync(out!, JSON.stringify(res, null, 1));
  expect(true).toBe(true);
}, 300000);
