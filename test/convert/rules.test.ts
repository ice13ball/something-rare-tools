// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The CONV-* rules: registry conventions, and that they stay OUT of every public listing until the reveal.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LATER_STAGE_RULES } from '../../src/core/convert/policy';
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
    expect(ids.length).toBe(52);
    for (const r of CONVERT_RULES) {
      expect(r.id).toMatch(/^CONV-[A-Z]+(-[A-Z0-9]+)*$/);
      expect(r.category).toBe('B');
      expect(['error', 'warning', 'info']).toContain(r.severity);
    }
  });

  it('has the severities the plan fixes: blocking ones are errors, the accepted ones warnings, the counts information', () => {
    const sev = (id: string) => getConvertRule(id).severity;
    for (const id of ['CONV-SPLIT-UNDECIDED', 'CONV-QUANTITY-UNDECLARED', 'CONV-COUNT-NOT-INTEGER', 'CONV-NEGATIVE-QUANTITY', 'CONV-SAMPLE-CODE-MISSING', 'CONV-ID-DUPLICATE', 'CONV-TAB-IN-VALUE']) expect(sev(id), id).toBe('error');
    for (const id of ['CONV-TEXT-IN-TAXON-CELL', 'CONV-TAXON-SAME-EVENT', 'CONV-NERC-UNKNOWN', 'CONV-NERC-UNIT-MISMATCH', 'CONV-UNIT-NO-P06', 'CONV-COLUMN-NOT-EXPORTED', 'CONV-NAMEID-MISSING', 'CONV-DEVICE-MISSING', 'CONV-LICENCE-DIFFERS']) expect(sev(id), id).toBe('warning');
    expect(sev('CONV-MESH-INVALID')).toBe('error');
    expect(sev('CONV-ZERO-SKIPPED')).toBe('info');
    for (const id of ['CONV-EML-MISSING', 'CONV-LICENCE-UNSET', 'CONV-BASIS-UNSET', 'CONV-EMOF-ORPHAN', 'CONV-EMOF-EVENT-MISMATCH', 'CONV-EMOF-VALUE-EMPTY', 'CONV-EMOF-TYPE-EMPTY']) expect(sev(id), id).toBe('error');
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
    // the policy lists the rules of later stages (WoRMS, profiles) before they exist; every other id must be registered
    for (const id of used) if (!LATER_STAGE_RULES.includes(id)) expect(isConvertRuleId(id), id).toBe(true);
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

describe('the word before a line range agrees with the number of lines', () => {
  const withLines = CONVERT_RULES.filter((r) => LANGS.some((l) => r.plain[l].includes('{lines}')));
  const render = (id: string, lang: (typeof LANGS)[number], lines: number[]): string => {
    const params: Record<string, string | number> = {};
    for (const p of CONVERT_RULE_PARAMS[id] ?? []) params[p] = p === 'count' ? lines.length : 'X';
    return renderConvertPlain(makeConvertFinding(id, { file: 'f.csv', sheet: 'S', field: 'F', value: 'V', lines, params }), lang);
  };
  const ONE = { en: /\bline 7\b/, pl: /\bwiersz(u)? 7\b/, de: /\bZeile 7\b/, fr: /\bligne 7\b/ } as const;
  const MANY = { en: /\blines 7–9\b/, pl: /\bwiersz(e|ach|y) 7–9\b/, de: /\bZeilen 7–9\b/, fr: /\blignes 7–9\b/ } as const;
  const FIVE = { pl: /\b(wierszy|wierszach) 7–11\b/ } as const;

  it('covers every rule that names lines', () => {
    expect(withLines.length).toBeGreaterThanOrEqual(10);
  });

  for (const r of withLines) {
    for (const lang of LANGS) {
      if (!r.plain[lang].includes('{lines}')) continue;
      it(`${r.id} ${lang}: singular for one line, plural for several`, () => {
        expect(render(r.id, lang, [7]), 'one line').toMatch(ONE[lang]);
        expect(render(r.id, lang, [7, 8, 9]), 'three lines').toMatch(MANY[lang]);
        if (lang === 'pl') expect(render(r.id, lang, [7, 8, 9, 10, 11]), 'five lines').toMatch(FIVE.pl);
        for (const lines of [[7], [7, 8, 9]]) expect(render(r.id, lang, lines)).not.toMatch(/\{|\}/);
      });
    }
  }

  it('Polish: wiersz / wiersze / wierszy by the number, never "wiersze 7"', () => {
    const text = (lines: number[]) => render('CONV-SAMPLE-CONFLICT', 'pl', lines);
    expect(text([7])).toContain('(wiersz 7)');
    expect(text([7, 8])).toContain('(wiersze 7–8)');
    expect(text([7, 9, 12, 14, 16])).toContain('(wierszy 7, 9, 12, 14, 16)');
    expect(text([7])).not.toContain('wiersze 7');
  });

  it('the profile-sheet label says "rzuty sondy CTD", in every text that names the casts', () => {
    for (const f of ['src/core/i18n/ui.ts', 'src/core/i18n/tips-text.ts', 'src/core/rules/convert.ts']) expect(read(f), f).not.toContain('zarzut');
    expect(read('src/core/i18n/ui.ts')).toContain('(rzuty sondy CTD, dane z butelek');
  });
});
