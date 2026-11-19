// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * Vitest setup file of the capture-and-replay gate (vitest.convert-record.config.ts only). It wraps convert() of src/core/convert/build.ts at MODULE level, so every caller that gets
 * convert() from that module or from its re-export in core/convert/index.ts is recorded, the worker handler and the page included, and production code is not touched. With CONVERT_RECORD
 * unset the factory returns the real module as it is: nothing is wrapped.
 */
import { afterAll, vi } from 'vitest';

const jobs = vi.hoisted(() => [] as (() => Promise<void>)[]);
afterAll(async () => {
  for (const job of jobs) await job();
});

vi.mock('../../src/core/convert/build', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/convert/build')>();
  const dir = process.env.CONVERT_RECORD;
  if (dir === undefined || dir === '') return actual;
  const { recording } = await import('./recorder');
  return { ...actual, convert: recording(actual, dir, (job) => void jobs.push(job)) };
});
