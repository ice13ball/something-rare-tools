// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The ship-speed rules on real, third-party data kept OUTSIDE the repository: three public OBIS cruises
// (ship-speed-2026-10-24/, next to GOLDEN_DIR; README.md and expected.json there) and the files of GOLDEN_DIR.
// Run with GOLDEN_DIR set; without it, or without the folder, every test here is skipped (as land-sets.test.ts).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderPlain } from '../../src/core/report';
import type { Finding } from '../../src/core/types';
import { createDirectEngine } from '../../src/worker/handler';

const GOLDEN_DIR = process.env.GOLDEN_DIR;
const SHIP_DIR = GOLDEN_DIR ? join(GOLDEN_DIR, '..', 'ship-speed-2026-10-24') : '';
const CHESSBASE = GOLDEN_DIR ? join(GOLDEN_DIR, '..', 'chessbase-2025-09-17', 'occurrence.txt') : '';
const haveShip = !!GOLDEN_DIR && existsSync(join(SHIP_DIR, 'expected.json'));

type Summary = [rule: string, events: number, rows: number][];
interface Expected {
  obis: Record<string, Summary>;
  iopan: Record<string, Summary>;
}
const expected: Expected = haveShip ? JSON.parse(readFileSync(join(SHIP_DIR, 'expected.json'), 'utf8')) : { obis: {}, iopan: {} };

async function run(path: string, singleCruise: boolean) {
  const e = createDirectEngine();
  const name = path.split('/').pop() as string;
  const p = await e.parse([{ name, bytes: new Uint8Array(readFileSync(path)), source: 'dropped' }], [], []);
  for (const f of p.files) {
    const pr = await e.propose(f.fileId, f.layout);
    await e.build(f.fileId, f.layout, pr.mappings);
  }
  return (await e.check({ singleCruise })).report;
}
const speed = (fs: Finding[]): Finding[] => fs.filter((f) => f.ruleId.startsWith('ROW-SHIP-SPEED'));
const summary = (fs: Finding[]): Summary => speed(fs).map((f): [string, number, number] => [f.ruleId, Number(f.params.count), f.lines?.length ?? 0]).sort((a, b) => a[0].localeCompare(b[0]));

describe.skipIf(!haveShip)('ship speed: public OBIS cruises (AMT12, AMT13, JERICO / Simon Stevin)', () => {
  it('AMT12, AMT13 and the AMT13 net hauls (James Clark Ross) with the declaration: 0 findings, and the rule really ran', async () => {
    for (const name of ['amt12.csv', 'amt13.csv', 'amt13-nets.csv']) {
      const report = await run(join(SHIP_DIR, name), true);
      expect(speed(report.findings), name).toEqual([]);
      expect(report.notChecked, name).not.toContain('notChecked.shipSpeedFew');
    }
  }, 120_000);

  it('the same files without the declaration: the rule does not run and the report says how to switch it on', async () => {
    for (const name of ['amt13-nets.csv', 'jerico.csv']) {
      const report = await run(join(SHIP_DIR, name), false);
      expect(speed(report.findings), name).toEqual([]);
      expect(report.notChecked, name).toContain('notChecked.shipSpeed');
    }
  }, 120_000);

  it('JERICO / Simon Stevin: the 126 knot pair of the day-and-month swap is reported, and the wording says date or position', async () => {
    const report = await run(join(SHIP_DIR, 'jerico.csv'), true);
    const found = speed(report.findings);
    expect(summary(report.findings)).toEqual(expected.obis['jerico.csv']);
    const pair = found.find((f) => f.ruleId === 'ROW-SHIP-SPEED-PAIR');
    expect(pair?.params.cases).toMatch(/117 km, 0\.5 h, ≥126 kn/);
    // the label names the events the numbers come from (line 85 at 01:31, line 100 at 02:01), not the lowest line of the place
    expect(pair?.params.cases).toBe('85→100: 117 km, 0.5 h, ≥126 kn [85: 85, 164, 332, 347, 426; 100: 100, 156, 309, 431, 446 + 20, 130, 159, 228, 243]');
    expect(pair?.params.places).toBe('yes');
    expect(renderPlain(pair as Finding, 'pl')).not.toContain('dwoma zdarzeniami');
    expect(renderPlain(pair as Finding, 'en')).toContain('The position or the time at one of them is wrong');
    expect(renderPlain(pair as Finding, 'pl')).toContain('Pozycja albo data lub godzina w jednym z nich jest błędna');
  }, 120_000);
});

describe.skipIf(!haveShip)('ship speed: the files of GOLDEN_DIR with the declaration (classified in the session report)', () => {
  for (const [name, want] of Object.entries(expected.iopan)) {
    it(`${name}: the findings are the recorded ones; without the declaration there are none`, async () => {
      const path = join(GOLDEN_DIR as string, name);
      if (!existsSync(path)) return;
      const on = await run(path, true);
      expect(summary(on.findings)).toEqual(want);
      for (const f of speed(on.findings)) {
        expect(renderPlain(f, 'pl')).toContain('Numery wierszy:');
        expect(String(f.params.cases)).toContain('→');
      }
      expect(speed((await run(path, false)).findings)).toEqual([]);
    }, 120_000);
  }
});

describe.skipIf(!GOLDEN_DIR || !existsSync(CHESSBASE))('ship speed: ChEssBase (a DwC-A occurrence core without any eventDate) without the declaration', () => {
  it('the rule does not run and the report says it was not checked', async () => {
    const report = await run(CHESSBASE, false);
    expect(speed(report.findings)).toEqual([]);
    expect(report.notChecked).toContain('notChecked.shipSpeedFew');
  }, 120_000);
});
