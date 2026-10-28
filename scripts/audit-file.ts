// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * Audits one data file the way /check would, without a browser: parse, propose, build, check, through the same engine the Web Worker runs
 * (createDirectEngine, the land mask loaded as in the worker). For looking at a file a user reports as failing, or at a golden file.
 * It runs on the installed vitest through its own config, like scripts/golden-diff.ts, so the default `npx vitest run` never picks it up.
 *
 *   AUDIT_FILE=/path/to/file.csv AUDIT_OUT=/tmp/audit.txt npx vitest run --config vitest.audit.config.ts
 *   AUDIT_FILE=/path/to/file.csv AUDIT_ROLES='{"Begin Latitude":{"kind":"latitude"}}' AUDIT_OUT=/tmp/audit.txt \
 *     npx vitest run --config vitest.audit.config.ts
 *
 *   AUDIT_FILE   required: the file to audit (CSV, TSV, spreadsheet, ... whatever /check accepts as a dropped file).
 *   AUDIT_ROLES  optional JSON, header text -> ColumnRole, replacing the proposed role of every column with that header (all sheets)
 *                before the build, like a user's correction in the mapping table. The overrides used are listed in the output; a header
 *                that matches no column is reported as unused.
 *   AUDIT_OUT    optional: the report goes to this file and its path is printed (vitest would bury a console print in its own output).
 *                Without it the report is written to stdout. ⛔ The path must lie OUTSIDE the repository: the report holds values from the
 *                file (finding values, headers), which must never end up in a commit. There is no override.
 *
 * Output: encoding, sheets, layout plan; per column index, header, proposed role, confidence, reason; timings of parse / propose / build /
 * check; the findings (ruleId, severity, number of lines, first 5 lines, field); counts and notChecked.
 * ⛔ Never copy the output, or any value from the audited file, into the repository.
 */
import { readFileSync, writeFileSync, writeSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { loadLandMask } from '../src/core/geo/land';
import type { ColumnRole } from '../src/core/types';
import { createDirectEngine } from '../src/worker/handler';
import { isInsideRepo } from './golden-diff-guard';

const SELF_REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIRST_LINES = 5;

const ms = (t0: number): string => `${(performance.now() - t0).toFixed(0)} ms`;

it('audit', async () => {
  const file = process.env.AUDIT_FILE;
  if (!file) throw new Error('AUDIT_FILE is not set (the path of the file to audit)');
  const out = process.env.AUDIT_OUT;
  if (out && isInsideRepo(out, [SELF_REPO])) throw new Error(`AUDIT_OUT ${out} lies inside the repository: the report holds values from the file. Write it elsewhere (e.g. /tmp).`);
  const overrides: Record<string, ColumnRole> = process.env.AUDIT_ROLES ? (JSON.parse(process.env.AUDIT_ROLES) as Record<string, ColumnRole>) : {};

  const lines: string[] = [];
  const say = (s = ''): void => void lines.push(s);

  const bytes = new Uint8Array(readFileSync(file));
  const gz = readFileSync(resolve(SELF_REPO, 'src', 'core', 'geo', 'land-mask.bin'));
  const engine = createDirectEngine({ land: () => loadLandMask(new Uint8Array(gz), async (b) => new Uint8Array(gunzipSync(b))) });

  say(`file: ${basename(file)} (${bytes.length} bytes)`);

  let t0 = performance.now();
  const parsed = await engine.parse([{ name: basename(file), bytes, source: 'dropped' }], [], []);
  const tParse = ms(t0);
  for (const p of parsed.problems) say(`problem: ${p.fileName}: ${p.message}`);
  for (const n of parsed.notRead) say(`not read: ${n.fileName} (${n.kind})`);

  const used = new Set<string>();
  const timings: [string, string][] = [['parse', tParse]];
  let tPropose = 0;
  let tBuild = 0;
  for (const f of parsed.files) {
    say();
    say(`== ${f.fileName}  kind=${f.kind}  encoding=${f.encoding}`);
    for (const s of f.sheets) say(`sheet "${s.name}": ${s.rowCount} rows, ${s.header.length} header cells`);
    say(`layout: ${JSON.stringify(f.layout)}`);

    t0 = performance.now();
    const proposed = await engine.propose(f.fileId, f.layout);
    tPropose += performance.now() - t0;
    for (const [sheet, props] of Object.entries(proposed.proposals)) {
      say();
      say(`columns of "${sheet}" (${props.length}):`);
      for (const c of props) say(`  [${c.index}] ${JSON.stringify(c.header)}  role=${JSON.stringify(c.role)}  confidence=${c.confidence}  reason=${c.reason}`);
    }

    const mappings = proposed.mappings.map((m) => ({
      ...m,
      columns: m.columns.map((c) => {
        const o = overrides[c.header];
        if (o === undefined) return c;
        used.add(c.header);
        return { ...c, role: o };
      }),
    }));
    t0 = performance.now();
    await engine.build(f.fileId, f.layout, mappings);
    tBuild += performance.now() - t0;
  }
  timings.push(['propose', `${tPropose.toFixed(0)} ms`], ['build', `${tBuild.toFixed(0)} ms`]);

  t0 = performance.now();
  const { report, datasets } = await engine.check();
  timings.push(['check', ms(t0)]);

  say();
  if (Object.keys(overrides).length > 0) {
    say('role overrides (AUDIT_ROLES):');
    for (const [h, r] of Object.entries(overrides)) say(`  ${used.has(h) ? 'used  ' : 'UNUSED'} ${JSON.stringify(h)} -> ${JSON.stringify(r)}`);
    say();
  }
  say(`datasets: ${datasets.map((d) => `${d.label} (${d.rowCount} rows, ${d.pointCount} points, ${d.variableCount} variables)`).join('; ') || 'none'}`);
  say('timings: ' + timings.map(([k, v]) => `${k} ${v}`).join(', '));
  say();
  say(`findings (${report.findings.length}):`);
  for (const f of report.findings) {
    const ls = f.lines ?? [];
    say(`  ${f.ruleId}  ${f.severity}  lines=${ls.length}  first=[${ls.slice(0, FIRST_LINES).join(', ')}]  field=${f.field ?? '-'}`);
  }
  say();
  say(`counts: ${JSON.stringify(report.counts)}`);
  say(`notChecked: ${JSON.stringify(report.notChecked)}`);

  const text = lines.join('\n') + '\n';
  if (out) {
    writeFileSync(out, text);
    writeSync(1, `audit written to ${resolve(out)}\n`);
  } else {
    writeSync(1, text);
  }
  expect(report).toBeDefined();
}, 600_000);
