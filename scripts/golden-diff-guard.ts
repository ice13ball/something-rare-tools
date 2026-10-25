// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The safety checks of scripts/golden-diff.ts, kept apart so that a normal test can cover them (test/golden/golden-diff-guard.test.ts).
import { existsSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';

export const DEFAULT_GOLDEN_ROOT = '/Users/ice13ball/data/sprawdzarka-golden';

/**
 * The PARENT folder of the dated golden folders. The test suite and deploy.sh call a DATED folder GOLDEN_DIR; reading that as the parent
 * gives an empty dump that "compares equal", so the old name is refused instead of being guessed at.
 */
export function goldenRoot(env: Record<string, string | undefined>): string {
  if (env.GOLDEN_DIR && !env.GOLDEN_ROOT) {
    throw new Error(
      `GOLDEN_DIR is set (${env.GOLDEN_DIR}) but GOLDEN_ROOT is not. GOLDEN_DIR names ONE dated folder (the test suite); golden-diff needs GOLDEN_ROOT, the folder that holds them all ` +
        `(default ${DEFAULT_GOLDEN_ROOT}). Set GOLDEN_ROOT, or unset GOLDEN_DIR to take the default.`,
    );
  }
  const root = resolve(env.GOLDEN_ROOT || DEFAULT_GOLDEN_ROOT);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`the golden root ${root} does not exist (set GOLDEN_ROOT)`);
  return root;
}

/** The real path of a path that may not exist yet: the nearest existing ancestor is resolved, the rest is appended. */
function realPathOfFuture(p: string): string {
  const rest: string[] = [];
  let cur = resolve(p);
  while (!existsSync(cur)) {
    rest.unshift(basename(cur));
    const up = dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return join(realpathSync.native(cur), ...rest);
}

/** macOS and Windows volumes are case-insensitive by default: `.../REPO/x.json` is the same place as `.../repo/x.json`. */
const fold = (p: string): string => (process.platform === 'darwin' || process.platform === 'win32' ? p.toLowerCase() : p);

/** True when `out` would be written inside one of the repositories (symlinks resolved, case-insensitive where the platform is). */
export function isInsideRepo(out: string, repos: Iterable<string>): boolean {
  const target = fold(realPathOfFuture(dirname(resolve(out)))) + sep;
  for (const r of repos) {
    const root = fold(realpathSync.native(resolve(r))) + sep;
    if (target.startsWith(root)) return true;
  }
  return false;
}

/** A dump of an empty golden set would compare equal to every other empty dump: it is an error. */
export function assertEntries(count: number, what: string): void {
  if (count === 0) throw new Error(`${what} has 0 entries: nothing was read from the golden set (is GOLDEN_ROOT the folder that holds the dated folders?)`);
}
