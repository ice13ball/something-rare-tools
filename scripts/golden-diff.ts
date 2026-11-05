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
 * invariant  GOLDEN_DIFF_BEFORE and GOLDEN_DIFF_AFTER as for compare: the AFTER clean CSV without its trailing descriptive columns must equal the BEFORE clean CSV for every dataset (the sidecar and the
 *          trailing columns are allowed to differ); prints the names of the trailing columns per dataset. Fails on any mismatch.
 * compare  Prints every difference between two dumps (key, path, before, after; the first 40 per key, all with GOLDEN_DIFF_ALL=1)
 *          and a verdict. The test passes when the dumps are byte-identical and fails otherwise (exit code 1 of vitest).
 *
 * Without GOLDEN_DIFF_MODE nothing runs. ⛔ Never commit a dump or any content of the golden set (test/golden/ holds no data).
 */
import { createHash } from 'node:crypto';
import { rawRecords, stripTrailingColumns } from './csv-strip';
import { sidecarProblems, sidecarRecords } from './sidecar-invariant';
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
// A different test from the rule's grammar: a cell is called non-ISO here only when it has a RECOGNISABLE non-ISO form (day-first or month-first with dots, slashes or dashes, a month word with digits, a space
// where ISO has a T, a one-digit month or day, a five-digit serial). A cell the rule fires on that none of these confirms is counted apart (`unconfirmed`), and so is one these call non-ISO that the rule leaves.
const MONTH_WORD = /(?:^|[^a-z])(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|sty|lut|kwi|maj|cze|lip|sie|wrz|pa[zź]|lis|gru|mai|jui|ao[uû]|d[eé]c|okt|dez|janv|f[eé]vr|avr)[a-z]*\.?(?:[^a-z]|$)/i;
function recognisablyNotIso(t: string): boolean {
  return (
    /^\d{1,2}[./]\d{1,2}[./]\d{2,4}(?:$|[T ,])/.test(t) ||
    /^\d{1,2}-\d{1,2}-\d{2,4}(?:$|[T ,])/.test(t) ||
    /^\d{4}[./]\d{1,2}[./]\d{1,2}/.test(t) ||
    /^\d{4}-\d{2}-\d{2} \d/.test(t) ||
    /^\d{4}-(?:\d-|\d{2}-\d(?!\d))/.test(t) ||
    (/\d/.test(t) && MONTH_WORD.test(t)) ||
    /^\d{5}$/.test(t)
  );
}
function independentCounts(file: { sheets: { name: string; header: string[]; headerLine: number; rows: { line: number; cells: (string | number | null)[] }[]; dateFormatted?: boolean[] }[] }): Record<string, { mojibake: number; eventDateNotIso: number; eventDateLines: number[]; yearMismatch: number }> {
  const out: Record<string, { mojibake: number; eventDateNotIso: number; eventDateLines: number[]; yearMismatch: number }> = {};
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
    const eventDateLines: number[] = [];
    sh.header.forEach((h, i) => {
      if (h.trim().replace(/^dwc:/i, '') !== 'eventDate') return;
      for (const r of sh.rows) {
        const c = r.cells[i];
        if (c === null || c === undefined || (typeof c === 'number' && sh.dateFormatted?.[i] === true)) continue;
        const t = String(c).trim();
        if (t !== '' && recognisablyNotIso(t)) {
          eventDateNotIso++;
          eventDateLines.push(r.line);
        }
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
    out[sh.name] = { mojibake, eventDateNotIso, eventDateLines, yearMismatch };
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
  // `core` is the hash of the CSV without the trailing descriptive columns (their number is `Dataset.descriptiveColumns`, absent before they existed: then core = csv); `descriptive` names them
  // `sidecarLines` and `sources` (the source headers of the trailing columns) feed the sidecar side of the invariant; they hold column names, notes and counts, never a cell value
  const cleanOf = (d: Parameters<typeof toCleanCsv>[0]): { header: string; csv: string; core: string; descriptive: string[]; sources: string[]; sidecarLines: string[]; sidecar: string } => {
    const out = toCleanCsv(d);
    const desc = (d as { descriptiveColumns?: { header: string }[] }).descriptiveColumns ?? [];
    const k = desc.length;
    const head = rawRecords(out.csv)[0] ?? [];
    return { header: out.csv.slice(0, out.csv.indexOf('\n')), csv: sha(out.csv), core: sha(stripTrailingColumns(out.csv, k)), descriptive: head.slice(head.length - k), sources: desc.map((x) => x.header), sidecarLines: sidecarRecords(out.sidecar), sidecar: sha(out.sidecar) };
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
        let built: { label: string; rows: number; values: number; clean: { header: string; csv: string; core: string; descriptive: string[]; sources: string[]; sidecarLines: string[]; sidecar: string } }[] | undefined;
        try {
          const layout0 = proposeLayout(file);
          built = buildDatasets(file, layout0, proposeMappings(file, layout0), [], 'x').datasets.map((d) => ({ label: d.label, rows: d.rows.length, values: d.rows.reduce((n, row) => n + Object.keys(row.values).length, 0), clean: cleanOf(d) }));
        } catch {
          built = undefined;
        }
        // what the three rules found on this file (cells for the mojibake and eventDate rules, rows for the year rule), by sheet, beside the independent count
        let rules: Record<string, Record<string, number>> | undefined;
        const isoLines: Record<string, number[]> = {};
        try {
          const layout1 = proposeLayout(file);
          const b1 = buildDatasets(file, layout1, proposeMappings(file, layout1), [], 'x');
          const checked1 = runChecks({ datasets: b1.datasets, records: [], parseFindings: [...file.findings, ...b1.findings] }, { land, today: '2026-10-24' });
          rules = {};
          for (const f of checked1.findings) {
            if (f.ruleId === 'DWC-EVENTDATE-NOT-ISO') isoLines[f.sheet ?? ''] = [...(isoLines[f.sheet ?? ''] ?? []), ...(f.lines ?? [])];
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
          independent: Object.fromEntries(Object.entries(independentCounts(file as never)).map(([sh, v]) => {
            // eventDate: the lines the rule fired on against the lines the independent test calls non-ISO, as counts
            const rule = new Set(isoLines[sh] ?? []);
            const ind = new Set(v.eventDateLines);
            return [sh, { mojibake: v.mojibake, eventDateNotIso: v.eventDateNotIso, yearMismatch: v.yearMismatch, eventDate: { rule: rule.size, independent: ind.size, confirmed: [...rule].filter((l) => ind.has(l)).length, unconfirmed: [...rule].filter((l) => !ind.has(l)).length, missed: [...ind].filter((l) => !rule.has(l)).length } }];
          })),
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

/**
 * The invariant of the descriptive columns: for every dataset of every entry, the clean CSV of the BEFORE dump equals the AFTER dump's clean CSV with its trailing descriptive columns removed (`core`).
 * Only trailing columns may differ. Prints, per dataset that has them, the number and the names of the trailing columns (header names, never values). Returns the number of mismatches.
 */
function invariant(beforePath: string, afterPath: string): number {
  type Clean = { csv: string; core: string; descriptive?: string[]; sources?: string[]; sidecarLines?: string[]; header: string };
  type Built = { label: string; rows: number; clean: Clean }[];
  const A = JSON.parse(readFileSync(beforePath, 'utf8')) as Record<string, { built?: Built }>;
  const B = JSON.parse(readFileSync(afterPath, 'utf8')) as Record<string, { built?: Built }>;
  let checked = 0;
  let bad = 0;
  let withColumns = 0;
  let sidecarChecked = 0;
  let columns = 0;
  for (const key of Object.keys(A).sort()) {
    const a = A[key]?.built;
    const b = B[key]?.built;
    if (a === undefined && b === undefined) continue;
    if (a === undefined || b === undefined || a.length !== b.length) { process.stdout.write(`MISMATCH ${key}: the datasets differ in number` + '\n'); bad++; continue; }
    a.forEach((da, i) => {
      const db = b[i];
      checked++;
      const names = db.clean.descriptive ?? [];
      if (names.length > 0) { withColumns++; columns += names.length; process.stdout.write(`  ${key} [${db.label}]: ${names.length} descriptive column(s): ${names.join(' | ')}` + '\n'); }
      if (da.clean.csv !== db.clean.core || da.rows !== db.rows) { bad++; process.stdout.write(`MISMATCH ${key} [${db.label}]: the CSV without its trailing columns is not the before CSV` + '\n'); }
      if (da.clean.sidecarLines !== undefined && db.clean.sidecarLines !== undefined) {
        const problems = sidecarProblems(da.clean.sidecarLines, db.clean.sidecarLines, names, db.clean.sources ?? []);
        sidecarChecked++;
        if (problems.length > 0) { bad++; process.stdout.write(`MISMATCH ${key} [${db.label}]: the sidecar moved beyond the allowed changes: ${problems.length} problem(s), e.g. ${problems[0].slice(0, 160)}` + '\n'); }
      }
    });
  }
  process.stdout.write(`invariant: ${checked} datasets checked (${sidecarChecked} sidecars), ${withColumns} with descriptive columns (${columns} columns), ${bad} mismatch(es).` + '\n');
  return bad;
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

it.runIf(MODE === 'invariant')('invariant', () => {
  const bad = invariant(resolve(need('GOLDEN_DIFF_BEFORE')), resolve(need('GOLDEN_DIFF_AFTER')));
  expect(bad, 'the clean CSV changed beyond trailing columns').toBe(0);
});

it.runIf(MODE !== 'dump' && MODE !== 'compare' && MODE !== 'invariant')('needs GOLDEN_DIFF_MODE=dump or compare', () => {
  console.log('golden-diff: set GOLDEN_DIFF_MODE=dump|compare (see the header of scripts/golden-diff.ts); nothing was read or written.');
});
