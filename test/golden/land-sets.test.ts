// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The land rules on two local regression sets (not in the repo): 4 703 OBIS sea positions from 41 fjord, Arctic and lagoon
// regions (test_fiordy.csv in GOLDEN_DIR) and the ChEssBase occurrence core next to it. Run with GOLDEN_DIR set.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { loadLandMask } from '../../src/core/geo/land';
import type { Finding } from '../../src/core/types';
import { createDirectEngine } from '../../src/worker/handler';
import { makeZip, nodeInflate } from '../helpers/zipfile';

const GOLDEN_DIR = process.env.GOLDEN_DIR;
const FJORDS = GOLDEN_DIR ? join(GOLDEN_DIR, 'test_fiordy.csv') : '';
const CHESSBASE = GOLDEN_DIR ? join(GOLDEN_DIR, '..', 'chessbase-2025-09-17', 'occurrence.txt') : '';
const land = () => loadLandMask(new Uint8Array(readFileSync(join(__dirname, '..', '..', 'src', 'core', 'geo', 'land-mask.bin'))), async (b) => new Uint8Array(gunzipSync(b)));

async function check(name: string, path: string | Uint8Array): Promise<Finding[]> {
  const e = createDirectEngine({ land, inflate: nodeInflate });
  const p = await e.parse([{ name, bytes: typeof path === 'string' ? new Uint8Array(readFileSync(path)) : path, source: 'dropped' }], [], []);
  const f = p.files[0];
  const pr = await e.propose(f.fileId, f.layout);
  await e.build(f.fileId, f.layout, pr.mappings);
  return (await e.check()).report.findings;
}
const lines = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id).flatMap((f) => f.lines ?? []);

describe.skipIf(!GOLDEN_DIR || !existsSync(FJORDS))('land rules: fjord, Arctic and lagoon sea positions', () => {
  it('4 703 sea positions give no finding from either land rule', async () => {
    const fs = await check('test_fiordy.csv', FJORDS);
    expect(lines(fs, 'ROW-ON-LAND')).toEqual([]);
    expect(lines(fs, 'ROW-ON-LAND-NEAR')).toEqual([]);
  }, 120_000);
});

describe.skipIf(!GOLDEN_DIR || !existsSync(CHESSBASE))('land rules: ChEssBase', () => {
  it('ROW-ON-LAND covers 98 rows; the note gives exactly Loihi Seamount, line 3480', async () => {
    const fs = await check('occurrence.txt', CHESSBASE);
    expect(lines(fs, 'ROW-ON-LAND')).toHaveLength(98);
    expect(lines(fs, 'ROW-ON-LAND-NEAR')).toEqual([3480]);
  }, 120_000);
});

describe.skipIf(!GOLDEN_DIR || !existsSync(CHESSBASE))('ChEssBase: the OBIS and Darwin Core checks', () => {
  // The archive as OBIS gets it: meta.xml, eml.xml and the core, zipped here (the folder is not committed).
  const archive = (): Uint8Array => {
    const dir = join(CHESSBASE, '..');
    return makeZip(['meta.xml', 'eml.xml', 'occurrence.txt'].map((n) => ({ name: n, data: new Uint8Array(readFileSync(join(dir, n))) })));
  };
  const axial = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id && f.value === 'Axial Seamount');

  it('Axial Seamount, positions 9 669 km apart, is a warning (it was a note), as a table and as an archive', async () => {
    for (const fs of [await check('occurrence.txt', CHESSBASE), await check('chessbase.zip', archive())]) {
      expect(axial(fs, 'ROW-STATION-SPREAD-FAR').map((f) => [f.severity, f.params.km])).toEqual([['warning', 9669]]);
      expect(axial(fs, 'ROW-STATION-SPREAD')).toEqual([]);
    }
  }, 120_000);

  it('a complete Occurrence core: no Darwin Core, vocabulary, identifier, depth, zero-position or hidden-character finding', async () => {
    const fs = await check('chessbase.zip', archive());
    const mine = fs.filter((f) => /^(DWC-|ROW-ZERO-COORD|ROW-NO-COORD|ROW-DEPTH-|ROW-DATE-FUTURE|ROW-INVISIBLE-CHAR)/.test(f.ruleId));
    expect(mine.map((f) => f.ruleId)).toEqual([]);
    // the empty eventDate column (all 3 715 rows) is said by META-NO-DATES, not a second time by a Darwin Core rule
    expect(fs.filter((f) => f.ruleId === 'META-NO-DATES')).toHaveLength(1);
    expect(fs.filter((f) => f.ruleId === 'IN-DWCA-VERSION')).toHaveLength(1);
  }, 120_000);
});
