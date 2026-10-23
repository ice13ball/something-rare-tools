// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Golden test: a private set of real records and files, read ONLY through GOLDEN_DIR at runtime. Everything specific
// (inputs, expectations, file names, lines) comes from $GOLDEN_DIR/expected.json; nothing from it is stored in the repo.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { runChecks } from '../../src/core/checks/run';
import { decodeLandMask } from '../../src/core/geo/land';
import { formatLines, renderPlain } from '../../src/core/report';
import type { Finding } from '../../src/core/types';
import { runInput, runSession, type GoldenInput } from './pipeline';

interface Expectation {
  input?: string;
  session?: string;
  rule: string;
  severity: Finding['severity'];
  file?: string;
  files?: string[];
  lines?: number[];
  valueIncludes?: string;
}
interface Expected {
  inputs: GoldenInput[];
  sessions: { id: string; inputs: string[] }[];
  expected: Expectation[];
  forbid: { input: string; rulePrefix: string }[];
  knownGood: string[];
}

const GOLDEN_DIR = process.env.GOLDEN_DIR;
const exp: Expected = GOLDEN_DIR
  ? JSON.parse(readFileSync(join(GOLDEN_DIR, 'expected.json'), 'utf-8'))
  : { inputs: [], sessions: [], expected: [], forbid: [], knownGood: [] };

const TIMEOUT = 60_000;
const lc = (s: string) => s.toLowerCase();
const texts = (f: Finding): string[] => [f.file ?? '', ...Object.values(f.params).map(String)];
const mentions = (f: Finding, needle: string) => texts(f).some((t) => t.includes(needle));
const valueMentions = (f: Finding, needle: string) => [f.value ?? '', ...Object.values(f.params).map(String)].some((t) => lc(t).includes(lc(needle)));

/** Rule, severity, file(s) and value match; `lines` is checked separately over the union of the candidates. */
function candidate(f: Finding, e: Expectation): boolean {
  if (f.ruleId !== e.rule || f.severity !== e.severity) return false;
  if (e.file !== undefined && !mentions(f, e.file)) return false;
  if (e.files && !e.files.every((n) => mentions(f, n))) return false;
  if (e.valueIncludes !== undefined && !valueMentions(f, e.valueIncludes)) return false;
  return true;
}
function missingLines(cands: Finding[], e: Expectation): number[] {
  const have = new Set(cands.flatMap((f) => f.lines ?? []));
  return (e.lines ?? []).filter((l) => !have.has(l));
}

const label = (e: Expectation) =>
  `${e.input ?? e.session}: ${e.rule} (${e.severity})${e.file ? ` @ ${e.file}` : ''}${e.files ? ` @ ${e.files.join(' + ')}` : ''}${e.valueIncludes ? ` ~ "${e.valueIncludes}"` : ''}${e.lines ? ` lines ${formatLines(e.lines)}` : ''}`;

// the land mask the worker uses, so ROW-ON-LAND runs on real coastal and fjord data
const land = decodeLandMask(new Uint8Array(gunzipSync(readFileSync(join(__dirname, '..', '..', 'src', 'core', 'geo', 'land-mask.bin')))));

describe.skipIf(!GOLDEN_DIR)('golden set', () => {
  const dir = GOLDEN_DIR ?? '';
  const byId = new Map(exp.inputs.map((i) => [i.id, i]));
  const findings = new Map<string, Finding[]>();   // input id or session id -> findings considered
  const skippedAll: string[] = [];

  beforeAll(async () => {
    for (const input of exp.inputs) {
      const r = await runInput(input, dir);
      findings.set(input.id, runChecks({ datasets: r.datasets, records: r.records, parseFindings: r.parseFindings }, { land }).findings);
      for (const s of r.skipped) skippedAll.push(`${input.id}: ${s.file} (${s.reason})`);
    }
    for (const s of exp.sessions) {
      const ins = s.inputs.map((id) => {
        const i = byId.get(id);
        if (!i) throw new Error(`session ${s.id}: unknown input ${id}`);
        return i;
      });
      findings.set(s.id, runChecks(await runSession(ins, dir)).findings.filter((f) => f.ruleId.startsWith('XF-')));
    }
  }, 5 * TIMEOUT);

  const got = (id: string) => {
    const f = findings.get(id);
    if (!f) throw new Error(`no result for ${id}`);
    return f;
  };

  describe('expected findings', () => {
    for (const e of exp.expected) {
      it(label(e), () => {
        const all = got((e.input ?? e.session)!);
        const cands = all.filter((f) => candidate(f, e));
        const sameRule = all.filter((f) => f.ruleId === e.rule);
        expect(
          cands.length > 0,
          `no ${e.rule}/${e.severity} finding matches; findings with this rule: ${sameRule.map((f) => `${f.severity} ${f.file ?? '-'} [${formatLines(f.lines)}]`).join(' | ') || 'none'}`,
        ).toBe(true);
        const miss = missingLines(cands, e);
        expect(miss.length, `lines not reported: ${formatLines(miss)} (reported: ${formatLines(cands.flatMap((f) => f.lines ?? []).sort((a, b) => a - b))})`).toBe(0);
      }, TIMEOUT);
    }
  });

  describe('forbidden rules', () => {
    for (const fb of exp.forbid) {
      it(`${fb.input}: no ${fb.rulePrefix}*`, () => {
        const hit = got(fb.input).filter((f) => f.ruleId.startsWith(fb.rulePrefix));
        expect(hit.map((f) => `${f.ruleId} ${f.severity} ${f.file ?? '-'}`), 'forbidden findings present').toEqual([]);
      }, TIMEOUT);
    }
  });

  describe('positions on land', () => {
    // Coastal and fjord controls (Svalbard fjords, porewater at the coast, the Baltic, CoastDOM's estuaries and river ports):
    // no correct position may be called land. gn-6fe405e2 line 275 has latitude 58 for 78 (Siberia). CoastDOM (pangaea-964012)
    // has two "Baltic Sea" samples with sea salinity placed some 50 km inland in Kashubia (18.0 E, 54.0 N; 17.335 E, 54.083 N).
    const expectedPlaces: Record<string, string[]> = { 'pangaea-964012': ['18.000000 E, 54.000000 N', '17.335000 E, 54.083000 N'] };
    const expectedLines: Record<string, number[]> = { 'gn-6fe405e2': [275] };
    it('pangaea-964012 (CoastDOM): only the two Baltic samples placed inland', () => {
      const hits = got('pangaea-964012').filter((f) => f.ruleId === 'ROW-ON-LAND');
      expect(hits).toHaveLength(1);
      expect(hits[0].params.count).toBe(2);
      for (const p of expectedPlaces['pangaea-964012']) expect(String(hits[0].params.places)).toContain(p);
    }, TIMEOUT);
    for (const input of exp.inputs.filter((i) => i.id !== 'pangaea-964012')) {
      it(`${input.id}: ROW-ON-LAND only where the position is really wrong`, () => {
        const lines = got(input.id).filter((f) => f.ruleId === 'ROW-ON-LAND').flatMap((f) => f.lines ?? []);
        expect(lines).toEqual(expectedLines[input.id] ?? []);
      }, TIMEOUT);
    }
  });

  describe('known good', () => {
    for (const id of exp.knownGood) {
      it(`${id}: no error-level finding`, () => {
        const errs = got(id).filter((f) => f.severity === 'error');
        expect(errs.map((f) => `${f.ruleId} ${f.file ?? '-'} [${formatLines(f.lines)}]`), 'error findings on a known-good input').toEqual([]);
      }, TIMEOUT);
    }
  });

  afterAll(() => {
    const out: string[] = ['', '=== golden: files skipped (not in the golden set / unreadable) ==='];
    out.push(...(skippedAll.length > 0 ? skippedAll : ['(none)']));

    out.push('', '=== golden: warnings and info on known-good inputs ===');
    for (const id of exp.knownGood) {
      for (const f of got(id).filter((x) => x.severity !== 'error')) {
        out.push(`${id} | ${f.ruleId} ${f.severity} | ${f.file ?? '-'} | ${formatLines(f.lines) || '-'} | ${renderPlain(f, 'en')}`);
      }
    }

    out.push('', '=== golden: findings not covered by any expectation ===');
    for (const [id, all] of findings) {
      const mine = exp.expected.filter((e) => (e.input ?? e.session) === id);
      for (const f of all) {
        if (mine.some((e) => candidate(f, e))) continue;
        out.push(`${id} | ${f.ruleId} ${f.severity} | ${f.file ?? '-'} | ${f.lines ? `${f.lines.length} line(s)` : '-'}`);
      }
    }
    console.log(out.join('\n'));
  });
});
