// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The CONV-* rules: registry conventions, and that they stay OUT of every public listing until the reveal.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONVERT_RULES, CONVERT_RULE_PARAMS, getConvertRule, isConvertRuleId, makeConvertFinding, renderConvertPlain, renderConvertTechnical } from '../../src/core/rules/convert';
import { RULES, getRule, makeFinding } from '../../src/core/rules/registry';
import { GENERIC_PARAMS } from '../../src/core/rules/spec';
import { LANGS } from '../../src/core/types';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]): string => readFileSync(join(ROOT, ...p), 'utf8');
const placeholders = (s: string): Set<string> => new Set([...s.matchAll(/\{([A-Za-z_][\w.]*)\}/g)].map((m) => m[1]));
const GENERIC = new Set<string>(GENERIC_PARAMS);

describe('registry conventions', () => {
  it('has unique CONV-* ids, category B, and a severity of the three allowed', () => {
    const ids = CONVERT_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(17);
    for (const r of CONVERT_RULES) {
      expect(r.id).toMatch(/^CONV-[A-Z]+(-[A-Z0-9]+)*$/);
      expect(r.category).toBe('B');
      expect(['error', 'warning', 'info']).toContain(r.severity);
    }
  });

  it('has the severities the plan fixes: blocking ones are errors, the accepted ones warnings, the counts information', () => {
    const sev = (id: string) => getConvertRule(id).severity;
    for (const id of ['CONV-SPLIT-UNDECIDED', 'CONV-QUANTITY-UNDECLARED', 'CONV-COUNT-NOT-INTEGER', 'CONV-NEGATIVE-QUANTITY', 'CONV-SAMPLE-CODE-MISSING', 'CONV-ID-DUPLICATE', 'CONV-TAB-IN-VALUE']) expect(sev(id), id).toBe('error');
    for (const id of ['CONV-TEXT-IN-TAXON-CELL', 'CONV-TAXON-SAME-EVENT', 'CONV-NERC-UNKNOWN', 'CONV-UNIT-NO-P06']) expect(sev(id), id).toBe('warning');
    expect(sev('CONV-ZERO-SKIPPED')).toBe('info');
  });

  for (const r of CONVERT_RULES) {
    it(`${r.id}: four languages, plain at most 330 characters, placeholders declared, jargon-free`, () => {
      const tech = placeholders(r.technical);
      for (const lang of LANGS) {
        expect(r.plain[lang].trim().length, `${r.id} ${lang}`).toBeGreaterThan(20);
        expect(r.plain[lang].length, `${r.id} ${lang} too long`).toBeLessThanOrEqual(330);
        expect(r.plain[lang]).not.toMatch(/xpath|spdx|ready|gotow|bereit|\bprêt|\bpret\b/i);
        expect(r.plain[lang]).not.toMatch(/\s{2,}/);
        for (const p of placeholders(r.plain[lang])) expect(tech.has(p), `${r.id} ${lang} uses {${p}} that technical lacks`).toBe(true);
      }
      const declared = new Set(CONVERT_RULE_PARAMS[r.id]);
      for (const p of tech) expect(GENERIC.has(p) || declared.has(p), `${r.id} technical uses undeclared {${p}}`).toBe(true);
      for (const p of declared) expect(tech.has(p), `${r.id} declares {${p}} but technical never uses it`).toBe(true);
      for (const extra of r.plainIf ?? []) for (const lang of LANGS) expect(extra.plain[lang].length).toBeLessThanOrEqual(200);
    });
  }

  it('Polish texts keep their diacritics', () => {
    for (const r of CONVERT_RULES) expect(r.plain.pl, r.id).not.toMatch(/\b(sie|moze|musi sie|jest ze|zrodl)\b/);
    expect(CONVERT_RULES.filter((r) => /[ąćęłńóśźż]/i.test(r.plain.pl)).length).toBe(CONVERT_RULES.length);
  });

  it('renders every rule in every language with no placeholder left over, from a finding that carries its declared params', () => {
    for (const r of CONVERT_RULES) {
      const params = Object.fromEntries(CONVERT_RULE_PARAMS[r.id].map((p) => [p, 'x']));
      const f = makeConvertFinding(r.id, { file: 'f.csv', sheet: 'S', field: 'col', value: 'v', lines: [3, 4, 5, 9], params });
      expect(f.severity).toBe(r.severity);
      for (const lang of LANGS) expect(renderConvertPlain(f, lang), `${r.id} ${lang}`).not.toMatch(/\{[A-Za-z_]/);
      expect(renderConvertTechnical(f)).not.toMatch(/\{[A-Za-z_]/);
    }
    const f = makeConvertFinding('CONV-SAMPLE-CODE-MISSING', { sheet: 'S', lines: [9, 3, 4, 5], params: { count: 4, column: 'none' } });
    expect(f.lines).toEqual([3, 4, 5, 9]);
    expect(renderConvertPlain(f, 'en')).toContain('lines 3–5, 9');
  });

  it('every CONV id in src/core/convert is registered, and every registered rule is raised somewhere', () => {
    const dir = join(ROOT, 'src', 'core', 'convert');
    const used = new Set<string>();
    for (const f of readdirSync(dir)) for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/CONV-[A-Z0-9]+(?:-[A-Z0-9]+)*/g)) used.add(m[0]);
    for (const id of used) expect(isConvertRuleId(id), id).toBe(true);
    for (const r of CONVERT_RULES) expect(used.has(r.id), `${r.id} is never raised`).toBe(true);
  });
});

describe('not in any public listing before the reveal', () => {
  it('the public registry does not know them: RULES still has its 90 rules and getRule / makeFinding throw on a CONV id', () => {
    expect(RULES.length).toBe(90);
    expect(RULES.some((r) => r.id.startsWith('CONV-'))).toBe(false);
    expect(() => getRule('CONV-ID-DUPLICATE')).toThrow(/Unknown rule id/);
    expect(() => makeFinding('CONV-ID-DUPLICATE', {})).toThrow();
    expect(isConvertRuleId('ROW-LAT-RANGE')).toBe(false);
  });

  it('docs/rules.md (generated from RULES) lists no CONV-* rule', () => {
    expect(read('docs', 'rules.md')).not.toContain('CONV-');
  });

  it('no /check source names a CONV rule: rules registry, checks, column proposals, the app (tips, rule links, role lists), the worker and the report', () => {
    const files = [
      ['src', 'core', 'rules', 'registry.ts'],
      ['src', 'core', 'rules', 'index.ts'],
      ['src', 'core', 'report.ts'],
      ['src', 'core', 'recognize', 'columns.ts'],
      ['src', 'core', 'recognize', 'layout.ts'],
      ['src', 'core', 'recognize', 'vocab.ts'],
      ['src', 'core', 'dataset.ts'],
      ['src', 'app', 'tips.tsx'],
      ['src', 'app', 'tipRules.tsx'],
      ['src', 'app', 'mappingModel.ts'],
      ['src', 'worker', 'handler.ts'],
      ['scripts', 'rules-doc.ts'],
    ];
    for (const f of files) expect(read(...f), f.join('/')).not.toContain('CONV-');
    for (const d of [['src', 'core', 'checks'], ['src', 'core', 'output'], ['src', 'core', 'parse']]) {
      for (const f of readdirSync(join(ROOT, ...d))) expect(readFileSync(join(ROOT, ...d, f), 'utf8'), [...d, f].join('/')).not.toContain('CONV-');
    }
  });

  it('only src/core/convert and the converter rule file import the converter registry', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && /rules\/convert['"]/.test(readFileSync(p, 'utf8')) && !p.includes(join('src', 'core', 'convert'))) offenders.push(p.replace(ROOT, ''));
      }
    };
    walk(join(ROOT, 'src'));
    expect(offenders).toEqual([]);
  });
});
