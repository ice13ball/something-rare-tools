// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * Before/after harness for the golden set: proves that a change did not move what /check proposes or reports.
 *
 *   npx tsx scripts/golden-diff.ts dump <out.json> [--repo <dir>] [--golden <dir>] [--allow-in-repo]
 *   npx tsx scripts/golden-diff.ts compare <before.json> <after.json> [--all]
 *
 * dump     For every folder under the golden directory writes, into <out.json>:
 *            - `input:<folder>/<id>`  for each input of the folder's expected.json (or inputs.json): the column mappings
 *                                     and the layout of every dataset the app builds from it, and every finding of runChecks;
 *            - `file:<folder>/<path>` for every data file found up to two levels down (not under metadata/): per sheet, the layout
 *                                     the app proposes and the column proposals (index, header, role, confidence, reason).
 *          --repo  is the checkout whose code is dumped (default: the repository this script is in). To compare a branch with
 *                  production run the dump twice, once per checkout, e.g. against a detached worktree of the base commit:
 *                    git worktree add --detach /tmp/base <commit>
 *                    npx tsx scripts/golden-diff.ts dump /tmp/before.json --repo /tmp/base   (needs node_modules there: link it)
 *                    npx tsx scripts/golden-diff.ts dump /tmp/after.json
 *                    npx tsx scripts/golden-diff.ts compare /tmp/before.json /tmp/after.json
 *          --golden is the golden directory (default: $GOLDEN_DIR, else /Users/ice13ball/data/sprawdzarka-golden).
 *          <out.json> is required and must lie OUTSIDE the repository (the golden data are private: a dump holds values from them);
 *          --allow-in-repo overrides the refusal, and then the file must still never be committed.
 * compare  Prints every difference between two dumps (key, path, before, after; the first 40 per key, all with --all) and a
 *          verdict. Exit code 0 = byte-identical, 1 = different, 2 = bad usage.
 *
 * ⛔ Never commit a dump or any content of the golden set (test/golden/ holds no data, only code).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const SELF_REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_GOLDEN = '/Users/ice13ball/data/sprawdzarka-golden';
const MAX_PER_KEY = 40;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function usage(msg?: string): never {
  if (msg) console.error(msg + '\n');
  console.error('usage: npx tsx scripts/golden-diff.ts dump <out.json> [--repo <dir>] [--golden <dir>] [--allow-in-repo]\n       npx tsx scripts/golden-diff.ts compare <before.json> <after.json> [--all]');
  process.exit(2);
}

function parseArgs(argv: string[]): { pos: string[]; opts: Map<string, string | true> } {
  const pos: string[] = [];
  const opts = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all' || a === '--allow-in-repo') opts.set(a, true);
    else if (a === '--repo' || a === '--golden') {
      const v = argv[++i];
      if (!v) usage(`${a} needs a value`);
      opts.set(a, v);
    } else if (a.startsWith('--')) usage(`unknown option ${a}`);
    else pos.push(a);
  }
  return { pos, opts };
}

/* ---------- dump ---------- */

async function dump(out: string, repo: string, goldenDir: string): Promise<void> {
  const load = <T>(rel: string): Promise<T> => import(pathToFileURL(join(repo, rel)).href) as Promise<T>;
  const { runChecks } = await load<typeof import('../src/core/checks/run')>('src/core/checks/run.ts');
  const { decodeLandMask } = await load<typeof import('../src/core/geo/land')>('src/core/geo/land.ts');
  const { parseFile } = await load<typeof import('../src/core/parse')>('src/core/parse/index.ts');
  const { proposeColumns } = await load<typeof import('../src/core/recognize/columns')>('src/core/recognize/columns.ts');
  const { proposeLayout } = await load<typeof import('../src/core/recognize/layout')>('src/core/recognize/layout.ts');
  const { runInput } = await load<typeof import('../test/golden/pipeline')>('test/golden/pipeline.ts');
  const land = decodeLandMask(new Uint8Array(gunzipSync(readFileSync(join(repo, 'src', 'core', 'geo', 'land-mask.bin')))));

  const result: Record<string, unknown> = {};
  for (const folder of readdirSync(goldenDir).sort()) {
    const dir = join(goldenDir, folder);
    if (!statSync(dir).isDirectory()) continue;

    // 1. the inputs of the golden pipeline: what the app builds from them, and what it finds
    let inputs: Parameters<typeof runInput>[0][] = [];
    for (const name of ['expected.json', 'inputs.json']) {
      const p = join(dir, name);
      if (inputs.length || !existsSync(p)) continue;
      try {
        inputs = (JSON.parse(readFileSync(p, 'utf-8')) as { inputs?: typeof inputs }).inputs ?? [];
      } catch {
        /* an unreadable description has no inputs */
      }
    }
    for (const input of inputs) {
      const key = `input:${folder}/${input.id}`;
      try {
        const r = await runInput(input, dir);
        const checked = runChecks({ datasets: r.datasets, records: r.records, parseFindings: r.parseFindings }, { land });
        result[key] = {
          datasets: r.datasets.map((d) => ({ id: d.id, mappings: d.mappings, layout: d.layout })),
          findings: checked.findings,
        };
      } catch (e) {
        result[key] = { error: String(e) };
      }
    }

    // 2. every data file directly: the layout and the proposals of every sheet
    const files: string[] = [];
    const walk = (d: string, depth: number): void => {
      for (const n of readdirSync(d).sort()) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) {
          if (depth < 2 && n !== 'metadata') walk(p, depth + 1);
        } else if (/\.(csv|tsv|tab|txt|xlsx|xls)$/i.test(n)) files.push(p);
      }
    };
    walk(dir, 0);
    for (const f of files) {
      const key = `file:${folder}/${f.slice(dir.length + 1)}`;
      try {
        const bytes = new Uint8Array(readFileSync(f));
        const file = parseFile(f.split('/').pop() as string, bytes);
        result[key] = {
          layout: proposeLayout(file),
          sheets: file.sheets.map((s) => ({
            sheet: s.name,
            proposals: proposeColumns(s, { decimalComma: file.decimalComma, date1904: file.date1904 }).map((p) => ({ i: p.index, h: p.header, role: p.role, c: p.confidence, why: p.reason })),
          })),
        };
      } catch (e) {
        result[key] = { error: String(e).slice(0, 80) };
      }
    }
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(result, null, 1));
  console.log(`dumped ${Object.keys(result).length} entries from ${goldenDir} (code of ${repo}) to ${out}`);
}

/* ---------- compare ---------- */

const short = (v: unknown): string => {
  const s = v === undefined ? '(absent)' : JSON.stringify(v);
  return s.length > 160 ? s.slice(0, 157) + '...' : s;
};

/** Differences as [path, before, after]; arrays and objects are walked, everything else is compared by value. */
function diffs(a: unknown, b: unknown, path: string, out: [string, unknown, unknown][]): void {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) diffs(a[i], b[i], `${path}[${i}]`, out);
  } else if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const A = a as Record<string, unknown>;
    const B = b as Record<string, unknown>;
    for (const k of [...new Set([...Object.keys(A), ...Object.keys(B)])].sort()) diffs(A[k], B[k], `${path}.${k}`, out);
  } else out.push([path, a, b]);
}

function compare(beforePath: string, afterPath: string, all: boolean): number {
  const rawA = readFileSync(beforePath);
  const rawB = readFileSync(afterPath);
  const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex').slice(0, 16);
  console.log(`before ${beforePath}  sha256 ${sha(rawA)}  ${rawA.length} bytes`);
  console.log(`after  ${afterPath}  sha256 ${sha(rawB)}  ${rawB.length} bytes`);
  if (rawA.equals(rawB)) {
    console.log('BYTE-IDENTICAL: no difference in any proposal, layout or finding.');
    return 0;
  }
  const A = JSON.parse(rawA.toString('utf8')) as Record<string, Json>;
  const B = JSON.parse(rawB.toString('utf8')) as Record<string, Json>;
  let total = 0;
  for (const key of [...new Set([...Object.keys(A), ...Object.keys(B)])].sort()) {
    if (!(key in A)) { console.log(`+ ${key}: only in after`); total++; continue; }
    if (!(key in B)) { console.log(`- ${key}: only in before`); total++; continue; }
    const out: [string, unknown, unknown][] = [];
    diffs(A[key], B[key], '', out);
    if (out.length === 0) continue;
    console.log(`~ ${key}: ${out.length} difference(s)`);
    for (const [p, x, y] of all ? out : out.slice(0, MAX_PER_KEY)) console.log(`    ${p}: ${short(x)}  ->  ${short(y)}`);
    if (!all && out.length > MAX_PER_KEY) console.log(`    ... ${out.length - MAX_PER_KEY} more (--all)`);
    total += out.length;
  }
  console.log(total === 0 ? 'The entries are equal; only the formatting of the files differs.' : `DIFFERENT: ${total} difference(s).`);
  return total === 0 ? 0 : 1;
}

/* ---------- main ---------- */

const { pos, opts } = parseArgs(process.argv.slice(2));
const mode = pos[0];
if (mode === 'dump') {
  if (pos.length !== 2) usage('dump takes exactly one output path');
  const repo = resolve(typeof opts.get('--repo') === 'string' ? (opts.get('--repo') as string) : SELF_REPO);
  const out = resolve(pos[1]);
  const golden = resolve(typeof opts.get('--golden') === 'string' ? (opts.get('--golden') as string) : (process.env.GOLDEN_DIR ?? DEFAULT_GOLDEN));
  for (const r of new Set([repo, SELF_REPO])) {
    if ((out + sep).startsWith(r + sep) && !opts.has('--allow-in-repo')) {
      usage(`refusing to write ${out} inside the repository ${r}: a dump holds values of the private golden set. Choose a path outside it (e.g. /tmp), or pass --allow-in-repo.`);
    }
  }
  if (!existsSync(golden) || !statSync(golden).isDirectory()) usage(`the golden directory ${golden} does not exist (set GOLDEN_DIR or --golden)`);
  await dump(out, repo, golden);
} else if (mode === 'compare') {
  if (pos.length !== 3) usage('compare takes two dump paths');
  process.exit(compare(resolve(pos[1]), resolve(pos[2]), opts.has('--all')));
} else usage(mode ? `unknown mode ${mode}` : undefined);
