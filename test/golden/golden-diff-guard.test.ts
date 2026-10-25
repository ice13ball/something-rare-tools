// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The safety checks of scripts/golden-diff.ts: no private dump inside the repository, no "equal" result from an empty golden set.
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { assertEntries, DEFAULT_GOLDEN_ROOT, goldenRoot, isInsideRepo } from '../../scripts/golden-diff-guard';

const REPO = join(__dirname, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'golden-guard-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('isInsideRepo', () => {
  it('refuses a path inside the repository, existing folder or not', () => {
    expect(isInsideRepo(join(REPO, 'x.json'), [REPO])).toBe(true);
    expect(isInsideRepo(join(REPO, 'new-folder', 'deeper', 'x.json'), [REPO])).toBe(true);
  });
  it('allows a path outside it', () => {
    expect(isInsideRepo(join(tmp, 'x.json'), [REPO])).toBe(false);
  });
  it('sees through a symlink that points into the repository', () => {
    const link = join(tmp, 'link');
    symlinkSync(REPO, link);
    expect(isInsideRepo(join(link, 'x.json'), [REPO])).toBe(true);
  });
  it.runIf(process.platform === 'darwin' || process.platform === 'win32')('sees through a case-variant spelling of the repository path', () => {
    expect(isInsideRepo(join(REPO.toUpperCase(), 'x.json'), [REPO])).toBe(true);
    expect(isInsideRepo(join(REPO.toLowerCase(), 'x.json'), [REPO])).toBe(true);
  });
  it('a sibling folder whose name starts like the repository is not inside it', () => {
    mkdirSync(join(tmp, 'repo'));
    mkdirSync(join(tmp, 'repo-two'));
    expect(isInsideRepo(join(tmp, 'repo-two', 'x.json'), [join(tmp, 'repo')])).toBe(false);
    expect(isInsideRepo(join(tmp, 'repo', 'x.json'), [join(tmp, 'repo')])).toBe(true);
  });
});

describe('goldenRoot', () => {
  it('fails, with a message that says what to set, when GOLDEN_DIR is set and GOLDEN_ROOT is not', () => {
    expect(() => goldenRoot({ GOLDEN_DIR: '/x/2026-10-16' })).toThrow(/GOLDEN_ROOT/);
  });
  it('takes GOLDEN_ROOT, and refuses a folder that does not exist', () => {
    expect(goldenRoot({ GOLDEN_ROOT: tmp, GOLDEN_DIR: '/x/2026-10-16' })).toBe(tmp);
    expect(() => goldenRoot({ GOLDEN_ROOT: join(tmp, 'missing') })).toThrow(/does not exist/);
  });
  it('the default is the parent folder of the dated ones', () => {
    expect(DEFAULT_GOLDEN_ROOT).toBe('/Users/ice13ball/data/sprawdzarka-golden');
  });
});

describe('assertEntries', () => {
  it('an empty dump is an error, a dump with entries is not', () => {
    expect(() => assertEntries(0, 'the dump')).toThrow(/0 entries/);
    expect(() => assertEntries(45, 'the dump')).not.toThrow();
  });
});
