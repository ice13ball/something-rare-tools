// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * The capture-and-replay gate for /convert (docs/superpowers/specs/2026-11-19-convert-restructuring-design.md section 2). It runs on the vitest that is installed, through its own config
 * (vitest.convert-replay.config.ts), so the default `npx vitest run` never picks it up. Three modes, chosen by the variables:
 *
 *   record   CONVERT_RECORD=<dir> npx vitest run --config vitest.convert-record.config.ts      (npm run convert:record; on the BASE commit)
 *   replay   CONVERT_REPLAY_BASE=<dir recorded on the base commit> npx vitest run --config vitest.convert-replay.config.ts
 *            Runs convert() of THIS checkout on every recorded input and fails, naming the call and the first differing field, when a result, a pass count, an exception or an archive differs.
 *   compare  CONVERT_REPLAY_BASE=<dir A> CONVERT_REPLAY_OTHER=<dir B>        two recordings against each other (the determinism check: the same commit recorded twice)
 *   mark     CONVERT_REPLAY_MARK=<dir>                                      replays a recording on the commit it was made on and lists the calls that depend on their test's own mocks (run by convert:record)
 *   coverage CONVERT_REPLAY_COVERAGE=<dir>                                  what the recording exercised
 *
 * CONVERT_REPLAY_REPORT=<file> also writes the coverage report to a file.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareDirs, coverageOf, formatCoverage, formatMismatches, markAmbient, replayDir } from './convert-replay/replay';

const base = process.env.CONVERT_REPLAY_BASE ?? '';
const other = process.env.CONVERT_REPLAY_OTHER ?? '';
const cover = process.env.CONVERT_REPLAY_COVERAGE ?? '';
const mark = process.env.CONVERT_REPLAY_MARK ?? '';

describe('convert capture-and-replay', () => {
  it('has a mode: a base recording, two recordings, a recording to report on, or one to mark', () => {
    expect(base !== '' || cover !== '' || mark !== '', 'set CONVERT_REPLAY_BASE=<recorded dir> (replay), CONVERT_REPLAY_MARK=<dir> (npm run convert:record does it), with CONVERT_REPLAY_OTHER=<dir> (compare two recordings), or CONVERT_REPLAY_COVERAGE=<dir>').toBe(true);
  });

  it.runIf(base !== '' && other === '' && mark === '')(
    'every recorded input gives the recorded result on this checkout',
    async () => {
      const r = await replayDir(base);
      console.log(`convert-replay: ${r.calls} recorded calls, ${r.replayed} replayed, ${r.archivesChecked} archives checked, ${r.ambient.length} skipped (depend on their test's own mocks), ${r.unreplayable.length} unreplayable, ${r.mismatches.length} differences`);
      expect(r.calls, `${base} holds no recorded call`).toBeGreaterThan(0);
      expect(r.mismatches.length, `${r.mismatches.length} of ${r.calls} calls differ from the recording:\n${formatMismatches(r.mismatches)}`).toBe(0);
    },
    1_800_000,
  );

  it.runIf(mark !== '')(
    'marks the calls that depend on their test environment, on the commit the recording was made on',
    async () => {
      const r = await markAmbient(mark);
      console.log(`convert-replay: ${r.calls} calls, ${r.ambient.length} depend on their test's own mocks and are skipped by replay${r.ambient.length === 0 ? '' : `:\n${formatMismatches(r.ambient, 12)}`}`);
      expect(r.calls).toBeGreaterThan(0);
      // a recording where much more than a few calls differ from itself is not a recording of convert() alone: stop rather than skip it silently
      expect(r.ambient.length, 'too many calls differ from their own recording').toBeLessThan(Math.max(10, r.calls * 0.02));
    },
    1_800_000,
  );

  it.runIf(base !== '' && other !== '')('two recordings are identical', () => {
    const r = compareDirs(base, other);
    console.log(`convert-replay: ${r.calls} calls compared, ${r.mismatches.length} differences`);
    expect(r.calls).toBeGreaterThan(0);
    expect(r.mismatches.length, `${r.mismatches.length} differences between the recordings:\n${formatMismatches(r.mismatches)}`).toBe(0);
  });

  it.runIf(cover !== '')('coverage of the recording', () => {
    const text = formatCoverage(coverageOf(cover));
    console.log(`convert-replay coverage of ${cover}\n${text}`);
    if (process.env.CONVERT_REPLAY_REPORT) writeFileSync(process.env.CONVERT_REPLAY_REPORT, `${text}\n`);
  });
});
