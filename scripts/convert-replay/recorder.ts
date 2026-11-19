// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * The recorder of the capture-and-replay gate. `recording(actual)` wraps convert() of src/core/convert/build.ts for ONE test file: every call writes its input and its result to
 * `<dir>/<test file>__<test name>__<call index>.json`. The wrapper changes nothing it passes through: the same input object goes to the real convert(), its result (or its exception) is
 * handed back untouched. It is installed only by scripts/convert-replay/recorder.setup.ts, which the default vitest config never loads, and only when CONVERT_RECORD is set.
 *
 * File format (version 1): { version, id, testFile, testName, index, passes, input, result | threw, notes }, `input` and `result` in the form of codec.ts.
 * The archive of a few results is written in `<id>.archive.json` after the test file is done (archive.ts), from a FRESH run of convert() on the decoded input, the same path the replay takes.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { expect } from 'vitest';
import type { ConvertInput } from '../../src/core/convert/build';
import type { ConvertResult } from '../../src/core/convert/model';
import { archiveOf } from './archive';
import { decode, encode } from './codec';
import type { Enc, EncodeNotes } from './codec';

export const RECORD_VERSION = 1;
/** At most this many calls of one test file are tried for an archive (the first ones that converted without a blocking finding and have records). */
export const ARCHIVE_TRIES_PER_FILE = 4;

interface Actual {
  convert: (input: ConvertInput) => ConvertResult;
  passCounter: { count: number };
}

const slug = (s: string): string => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function callId(testFile: string, testName: string, index: number): string {
  const h = createHash('sha1').update(testName).digest('hex').slice(0, 8);
  return `${slug(testFile.replace(/\.test\.tsx?$/, ''))}__${slug(testName).slice(0, 90)}-${h}__${String(index).padStart(3, '0')}`;
}

export function recording(actual: Actual, dirGiven: string, afterFile: (job: () => Promise<void>) => void): (input: ConvertInput) => ConvertResult {
  const dir = resolve(dirGiven);
  mkdirSync(dir, { recursive: true });
  const indexes = new Map<string, number>();
  const toArchive: { id: string; input: Enc }[] = [];
  let tries = 0;
  let scheduled = false;

  return function convert(input: ConvertInput): ConvertResult {
    const state = expect.getState();
    const testFile = state.testPath === undefined ? '(unknown file)' : relative(process.cwd(), state.testPath);
    const testName = state.currentTestName ?? '(outside a test)';
    const key = `${testFile}\u0000${testName}`;
    const index = indexes.get(key) ?? 0;
    indexes.set(key, index + 1);
    const id = callId(testFile, testName, index);

    const notes: EncodeNotes = { functions: 0, classInstances: [], symbolKeys: 0 };
    const encodedInput = encode(input, {}, notes);
    const before = actual.passCounter.count;
    let result: ConvertResult | undefined;
    let threw: unknown;
    let didThrow = false;
    try {
      result = actual.convert(input);
    } catch (e) {
      didThrow = true;
      threw = e;
    }
    const passes = actual.passCounter.count - before;
    const resultNotes: EncodeNotes = { functions: 0, classInstances: [], symbolKeys: 0 };
    const record = {
      version: RECORD_VERSION,
      id,
      testFile,
      testName,
      index,
      passes,
      input: encodedInput,
      ...(didThrow ? { threw: encode(threw, {}, resultNotes) } : { result: encode(result, {}, resultNotes) }),
      notes: { inputFunctions: notes.functions, inputClassInstances: notes.classInstances, resultFunctions: resultNotes.functions, resultClassInstances: resultNotes.classInstances },
    };
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(record));

    if (!didThrow && result !== undefined && result.ok && result.events.length > 0 && result.occurrences.length > 0 && tries < ARCHIVE_TRIES_PER_FILE) {
      tries++;
      toArchive.push({ id, input: encodedInput });
      if (!scheduled) {
        scheduled = true;
        afterFile(async () => {
          for (const job of toArchive) {
            const decoded = decode(job.input) as ConvertInput;
            const fresh = actual.convert(decoded);
            const archive = await archiveOf(decoded, fresh);
            writeFileSync(join(dir, `${job.id}.archive.json`), JSON.stringify({ version: RECORD_VERSION, id: job.id, archive }));
          }
        });
      }
    }
    if (didThrow) throw threw;
    return result as ConvertResult;
  };
}
