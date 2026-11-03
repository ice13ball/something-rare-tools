// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * Before/after harness for the golden set: proves that a change did not move what /check proposes or reports.
 * It runs on the vitest that is installed (no download, no new dependency), through its own config, so that the default
 * `npx vitest run` never picks it up: no golden access and no output file in a normal run.
 *
 *   GOLDEN_DIFF_MODE=dump GOLDEN_DIFF_OUT=/tmp/after.json \
 *     npx vitest run --config vitest.golden-diff.config.ts
 *   GOLDEN_DIFF_MODE=compare GOLDEN_DIFF_BEFORE=/tmp/before.json GOLDEN_DIFF_AFTER=/tmp/after.json \
 *     npx vitest run --config vitest.golden-diff.config.ts
 *
 * dump     (every dataset also carries what its clean CSV and sidecar come to: the header line, a hash of the CSV and of the sidecar, so a change of the output shows as a changed hash and, if it added
 *          or lost a column, a changed header; no cell value is kept in the dump beyond what the headers say),
 * dump     (every dataset also carries its row and value counts, `rows` and `values`: a change that loses measurements shows as a count that falls)
 * dump     For every folder under the golden directory writes, into GOLDEN_DIFF_OUT:
 *            - `input:<folder>/<id>`  for each input of the folder's expected.json (or inputs.json): the column mappings
 *                                     and the layout of every dataset the app builds from it, and every finding of runChecks;
 *            - `file:<folder>/<path>` for every data file found up to two levels down (not under metadata/): per sheet, the layout
 *                                     the app proposes and the column proposals (index, header, role, confidence, reason).
 *          GOLDEN_DIFF_REPO   the checkout whose code is dumped (default: the repository this script is in). To compare a branch
 *                             with production, dump twice, once per checkout, e.g. a detached worktree of the base commit next to
 *                             this one (it finds node_modules by walking up; a worktree elsewhere needs a node_modules link):
 *                               git worktree add --detach ../base-<commit> <commit>
 *                               GOLDEN_DIFF_MODE=dump GOLDEN_DIFF_OUT=/tmp/before.json GOLDEN_DIFF_REPO=../base-<commit> \
 *                                 npx vitest run --config vitest.golden-diff.config.ts
 *          GOLDEN_ROOT        the folder that HOLDS the dated golden folders (default /Users/ice13ball/data/sprawdzarka-golden).
 *                             Not GOLDEN_DIR: the test suite and deploy.sh give that name to ONE dated folder, which would dump
 *                             nothing. With GOLDEN_DIR set and GOLDEN_ROOT not, the run fails and says so. A dump or a compare
 *                             with 0 entries fails; a passing run prints "golden-diff: N entries" (add --reporter=verbose to be sure).
 *          GOLDEN_DIFF_OUT    required, and must lie OUTSIDE the repository (the golden data are private: a dump holds values from
 *                             them); GOLDEN_DIFF_ALLOW_IN_REPO=1 overrides the refusal, and the file must still never be committed.
 * compare  Prints every difference between two dumps (key, path, before, after; the first 40 per key, all with GOLDEN_DIFF_ALL=1)
 *          and a verdict. The test passes when the dumps are byte-identical and fails otherwise (exit code 1 of vitest).
 *
 * Without GOLDEN_DIFF_MODE nothing runs. ⛔ Never commit a dump or any content of the golden set (test/golden/ holds no data).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { assertEntries, goldenRoot, isInsideRepo } from './golden-diff-guard';

const SELF_REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PER_KEY = 40;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/* ---------- an independent count of the cells three rules judge ---------- */

/*
 * For ROW-TEXT-MOJIBAKE, DWC-EVENTDATE-NOT-ISO and ROW-YEAR-DATE-MISMATCH the dump holds, per sheet of every data file, how many cells an INDEPENDENT test of the raw cell calls a hit: written here with plain
 * character codes and one regular expression per shape, sharing no code with the rules. The dump compares them with what the rules found (`rules`), as counts only; no cell value is written.
 */
const ISO_PART = /^\d{4}(?:-\d{2}(?:-\d{2}(?:T\d{2}(?::\d{2}(?::\d{2}(?:[.,]\d+)?)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?)?)?$/;
const isoEnd = (end: string, start: string): boolean => ISO_PART.test(end) || (/^\d{2}$/.test(end) && /^\d{4}-\d{2}-\d{2}/.test(start)) || (/^\d{2}-\d{2}$/.test(end) && /^\d{4}-\d{2}/.test(start)) || (/^\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/.test(end) && /T\d{2}/.test(start));
function independentIso(t: string): boolean {
  const parts = t.trim().split('/');
  if (parts.length === 1) return ISO_PART.test(parts[0]);
  return parts.length === 2 && ISO_PART.test(parts[0]) && isoEnd(parts[1], parts[0]);
}
function independentCounts(file: { sheets: { name: string; header: string[]; headerLine: number; rows: { cells: (string | number | null)[] }[]; dateFormatted?: boolean[] }[] }): Record<string, { mojibake: number; eventDateNotIso: number; yearMismatch: number }> {
  const out: Record<string, { mojibake: number; eventDateNotIso: number; yearMismatch: number }> = {};
  for (const sh of file.sheets) {
    let mojibake = 0;
    const pair = (c: string | number | null): boolean => {
      if (typeof c !== 'string') return false;
      for (let i = 0; i + 1 < c.length; i++) {
        const a = c.charCodeAt(i);
        if (a !== 0xc3 && a !== 0xc2) continue;
        const b = c.charCodeAt(i + 1);
        if (b >= 0x80 && b <= 0xbf) return true;
      }
      return false;
    };
    for (const h of sh.header) if (pair(h)) mojibake++;
    for (const r of sh.rows) for (const c of r.cells) if (pair(c)) mojibake++;
    let eventDateNotIso = 0;
    sh.header.forEach((h, i) => {
      if (h.trim().replace(/^dwc:/i, '') !== 'eventDate') return;
      for (const r of sh.rows) {
        const c = r.cells[i];
        if (c === null || c === undefined || (typeof c === 'number' && sh.dateFormatted?.[i] === true)) continue;
        const t = String(c).trim();
        if (t !== '' && !independentIso(t)) eventDateNotIso++;
      }
    });
    let yearMismatch = 0;
    const yi = sh.header.findIndex((h) => h.trim().toLowerCase() === 'year');
    const di = sh.header.findIndex((h) => /^(date|eventDate)$/i.test(h.trim()));
    if (yi >= 0 && di >= 0 && yi !== di) {
      for (const r of sh.rows) {
        const y = String(r.cells[yi] ?? '').trim();
        const text = String(r.cells[di] ?? '').trim();
        // the year of the date as written: first in ISO, last in day.month.year or day/month/year
        const d = /^(\d{4})-\d{2}(?:-\d{2})?(?:$|[T ])/.exec(text) ?? /^\d{1,2}[./]\d{1,2}[./](\d{4})(?:$|[T ])/.exec(text);
        if (d && /^\d{4}(?:\.0+)?$/.test(y) && Number(y) !== Number(d[1])) yearMismatch++;
      }
    }
    out[sh.name] = { mojibake, eventDateNotIso, yearMismatch };
  }
  return out;
}

/* ---------- dump ---------- */

async function dump(out: string, repo: string, goldenDir: string): Promise<number> {
  const load = <T>(rel: string): Promise<T> => import(pathToFileURL(join(repo, rel)).href) as Promise<T>;
  const { runChecks } = await load<typeof import('../src/core/checks/run')>('src/core/checks/run.ts');
  const { decodeLandMask } = await load<typeof import('../src/core/geo/land')>('src/core/geo/land.ts');
  const { parseFile } = await load<typeof import('../src/core/parse')>('src/core/parse/index.ts');
  const { proposeColumns } = await load<typeof import('../src/core/recognize/columns')>('src/core/recognize/columns.ts');
  const { proposeLayout, proposeMappings } = await load<typeof import('../src/core/recognize/layout')>('src/core/recognize/layout.ts');
  const { buildDatasets } = await load<typeof import('../src/core/dataset')>('src/core/dataset.ts');
  const { toCleanCsv } = await load<typeof import('../src/core/output/csv')>('src/core/output/csv.ts');
  const sha = (t: string): string => createHash('sha1').update(t).digest('hex').slice(0, 12);
  // what the clean CSV and its sidecar come to (a hash each, and the header line): a changed output shows even when no finding moved
  const cleanOf = (d: Parameters<typeof toCleanCsv>[0]): { header: string; csv: string; sidecar: string } => {
    const out = toCleanCsv(d);
    return { header: out.csv.slice(0, out.csv.indexOf('\n')), csv: sha(out.csv), sidecar: sha(out.sidecar) };
  };
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
          datasets: r.datasets.map((d) => ({ id: d.id, mappings: d.mappings, layout: d.layout, rows: d.rows.length, values: d.rows.reduce((n, row) => n + Object.keys(row.values).length, 0), clean: cleanOf(d) })),
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
        // what the app builds from the file as it proposes it: the rows and the values of every dataset (a change that drops measurements shows here)
        let built: { label: string; rows: number; values: number; clean: { header: string; csv: string; sidecar: string } }[] | undefined;
        try {
          const layout0 = proposeLayout(file);
          built = buildDatasets(file, layout0, proposeMappings(file, layout0), [], 'x').datasets.map((d) => ({ label: d.label, rows: d.rows.length, values: d.rows.reduce((n, row) => n + Object.keys(row.values).length, 0), clean: cleanOf(d) }));
        } catch {
          built = undefined;
        }
        // what the three rules found on this file (cells for the mojibake and eventDate rules, rows for the year rule), by sheet, beside the independent count
        let rules: Record<string, Record<string, number>> | undefined;
        try {
          const layout1 = proposeLayout(file);
          const b1 = buildDatasets(file, layout1, proposeMappings(file, layout1), [], 'x');
          const checked1 = runChecks({ datasets: b1.datasets, records: [], parseFindings: [...file.findings, ...b1.findings] }, { land, today: '2026-10-24' });
          rules = {};
          for (const f of checked1.findings) {
            if (f.ruleId !== 'ROW-TEXT-MOJIBAKE' && f.ruleId !== 'DWC-EVENTDATE-NOT-ISO' && f.ruleId !== 'ROW-YEAR-DATE-MISMATCH') continue;
            const per = (rules[f.sheet ?? ''] ??= {});
            per[f.ruleId] = (per[f.ruleId] ?? 0) + (typeof f.params.count === 'number' ? f.params.count : (f.lines ?? []).length);
          }
        } catch {
          rules = undefined;
        }
        result[key] = {
          ...(built === undefined ? {} : { built }),
          ...(rules === undefined ? {} : { rules }),
          independent: independentCounts(file as never),
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
  const count = Object.keys(result).length;
  assertEntries(count, `the dump of ${goldenDir}`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(result, null, 1));
  process.stdout.write(`golden-diff: ${count} entries dumped from ${goldenDir} (code of ${repo}) to ${out}\n`);
  return count;
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
  const A = JSON.parse(rawA.toString('utf8')) as Record<string, Json>;
  const B = JSON.parse(rawB.toString('utf8')) as Record<string, Json>;
  process.stdout.write(`golden-diff: ${Object.keys(A).length} entries before, ${Object.keys(B).length} entries after\n`);
  assertEntries(Object.keys(A).length, `the before dump ${beforePath}`);
  assertEntries(Object.keys(B).length, `the after dump ${afterPath}`);
  if (rawA.equals(rawB)) {
    console.log('BYTE-IDENTICAL: no difference in any proposal, layout or finding.');
    return 0;
  }
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

/* ---------- entry ---------- */

const env = process.env;
const MODE = env.GOLDEN_DIFF_MODE;
const need = (name: string): string => {
  const v = env[name];
  if (!v) throw new Error(`${name} is required (see the header of scripts/golden-diff.ts)`);
  return v;
};

it.runIf(MODE === 'dump')('dump', async () => {
  const repo = resolve(env.GOLDEN_DIFF_REPO || SELF_REPO);
  const out = resolve(need('GOLDEN_DIFF_OUT'));
  const golden = goldenRoot(env);
  if (isInsideRepo(out, [repo, SELF_REPO]) && env.GOLDEN_DIFF_ALLOW_IN_REPO !== '1') {
    throw new Error(`refusing to write ${out} inside a repository (${repo}): a dump holds values of the private golden set. Choose a path outside it (e.g. /tmp), or set GOLDEN_DIFF_ALLOW_IN_REPO=1.`);
  }
  const count = await dump(out, repo, golden);
  expect(count, `golden-diff: ${count} entries dumped`).toBeGreaterThan(0);
}, 600_000);

it.runIf(MODE === 'compare')('compare', () => {
  const verdict = compare(resolve(need('GOLDEN_DIFF_BEFORE')), resolve(need('GOLDEN_DIFF_AFTER')), env.GOLDEN_DIFF_ALL === '1');
  expect(verdict, 'the dumps differ (see the listing above)').toBe(0);
});

it.runIf(MODE !== 'dump' && MODE !== 'compare')('needs GOLDEN_DIFF_MODE=dump or compare', () => {
  console.log('golden-diff: set GOLDEN_DIFF_MODE=dump|compare (see the header of scripts/golden-diff.ts); nothing was read or written.');
});
