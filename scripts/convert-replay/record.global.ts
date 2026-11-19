// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Global setup of the recording run: an empty recording directory, so a recording never mixes calls of two runs. It deletes only the *.json files this gate wrote, and refuses a directory that holds anything else.
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

export default function setup(): void {
  const given = process.env.CONVERT_RECORD;
  if (given === undefined || given === '') throw new Error('CONVERT_RECORD is not set: give the directory to record into (npm run convert:record sets convert-recordings/head).');
  const dir = resolve(given);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    return;
  }
  const names = readdirSync(dir);
  const foreign = names.filter((n) => !n.endsWith('.json'));
  if (foreign.length > 0) throw new Error(`${dir} holds files that are not recordings (${foreign.slice(0, 3).join(', ')}); give an empty or new directory.`);
  for (const n of names) rmSync(join(dir, n));
}
