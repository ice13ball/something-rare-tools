// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The check worker's land-mask paths: loaded once, a failure is "not checked" and retried, a reset meanwhile is not overwritten.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { loadLandMask, type LandMask } from '../../src/core/geo/land';
import { createHandler, type LandLoader } from '../../src/worker/handler';
import type { CheckResult, Request } from '../../src/worker/protocol';

const GZ = readFileSync(join(__dirname, '..', '..', 'src', 'core', 'geo', 'land-mask.bin'));
const realLoader: LandLoader = () => loadLandMask(new Uint8Array(GZ), async (b) => new Uint8Array(gunzipSync(b)));
const CSV = 'station,lat,lon,date\nA,30.07,42.07,2021-07-25\nB,57.3,19.5,2021-07-25\n';

async function session(h: ReturnType<typeof createHandler>): Promise<void> {
  const call = async (req: Request) => h.handle(req) as never;
  const parsed = (await call({ type: 'parse', files: [{ name: 'a.csv', bytes: new TextEncoder().encode(CSV), source: 'dropped' }], records: [], extraFindings: [] })) as { files: { fileId: string; layout: never }[] };
  const f = parsed.files[0];
  const pr = (await call({ type: 'propose', fileId: f.fileId, layout: f.layout })) as { mappings: never };
  await call({ type: 'build', fileId: f.fileId, layout: f.layout, mappings: pr.mappings });
}
const check = async (h: ReturnType<typeof createHandler>) => (await h.handle({ type: 'check' })) as CheckResult;
const onLand = (r: CheckResult) => r.report.findings.filter((f) => f.ruleId === 'ROW-ON-LAND');

describe('check worker and the land mask', () => {
  it('starts the download at the proposal, loads it once, and finds the inland row', async () => {
    let loads = 0;
    const h = createHandler({ land: () => (loads++, realLoader()) });
    await session(h);
    expect(loads).toBe(1); // started by the proposal (lat and lon proposed)
    const [a, b] = await Promise.all([check(h), check(h)]);
    expect(loads).toBe(1);
    expect(onLand(a)).toHaveLength(1);
    expect(onLand(b)[0].lines).toEqual([2]);
  });

  it('a failed load is reported as not checked, and the next check tries again', async () => {
    let fail = true;
    let loads = 0;
    const h = createHandler({ land: async () => { loads++; if (fail) throw new Error('offline'); return realLoader(); } });
    await session(h);
    const first = await check(h);
    expect(first.report.notChecked).toContain('notChecked.landMask');
    expect(onLand(first)).toEqual([]);
    fail = false;
    const second = await check(h);
    expect(second.report.notChecked).not.toContain('notChecked.landMask');
    expect(onLand(second)).toHaveLength(1);
    expect(loads).toBeGreaterThanOrEqual(2);
  });

  it('a reset while a check waits for the mask does not let the old result through', async () => {
    let release: (m: LandMask) => void = () => undefined;
    const h = createHandler({ land: () => new Promise<LandMask>((r) => { release = r; }) });
    await session(h);
    const pending = check(h);
    h.handle({ type: 'reset' });
    release(await realLoader());
    await expect(pending).rejects.toThrow(/newer check/);
  });
});
