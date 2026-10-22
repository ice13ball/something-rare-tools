// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { LANGS } from '../../src/core/types';
import type { Severity } from '../../src/core/types';
import { RULES, RULE_PARAMS, GENERIC_PARAMS, getRule, makeFinding, threshold } from '../../src/core/rules/registry';
import { RULES as RULES_FROM_INDEX } from '../../src/core/rules';

const EXPECTED: Record<string, [Severity, string]> = {
  'IN-NO-DATA-FILE': ['error', 'input'],
  'IN-RECORD-INACCESSIBLE': ['error', 'input'],
  'IN-HOST-NOT-ALLOWED': ['warning', 'input'],
  'IN-FETCH-BLOCKED': ['warning', 'input'],
  'IN-LAYOUT-UNSUPPORTED': ['error', 'input'],
  'IN-ENCODING-FALLBACK': ['info', 'input'],
  'IN-DECIMAL-COMMA': ['info', 'input'],
  'IN-DATE1904': ['info', 'input'],
  'LIC-MISSING': ['error', 'A'],
  'LIC-FREE-TEXT': ['warning', 'A'],
  'LIC-RESTRICTION-CONFLICT': ['warning', 'A'],
  'LIC-DATACITE-EMPTY': ['warning', 'A'],
  'LIC-MISMATCH': ['warning', 'A'],
  'LIC-TEXT-URI-CONFLICT': ['warning', 'A'],
  'LIC-ADDED-CONDITIONS': ['warning', 'A'],
  'META-EMPTY-LINK': ['warning', 'A'],
  'META-NO-VERSION': ['info', 'A'],
  'META-NO-EXTENT': ['info', 'A'],
  'META-DATE-OUTSIDE-EXTENT': ['warning', 'A'],
  'META-POINT-OUTSIDE-BBOX': ['warning', 'A'],
  'META-VARIABLE-MISSING': ['warning', 'A'],
  'META-NO-DATES': ['error', 'A'],
  'ROW-LAT-RANGE': ['error', 'B'],
  'ROW-LON-RANGE': ['error', 'B'],
  'ROW-LON-360': ['info', 'B'],
  'ROW-LAT-EQ-LON': ['error', 'B'],
  'ROW-RAGGED': ['error', 'B'],
  'ROW-NON-NUMERIC': ['warning', 'B'],
  'ROW-NA-VARIANT': ['warning', 'B'],
  'ROW-STATION-MOVED': ['warning', 'B'],
  'ROW-DATE-UNPARSEABLE': ['warning', 'B'],
  'ROW-DATE-MISSING': ['info', 'B'],
  'ROW-YEAR-OUTLIER': ['warning', 'B'],
  'ROW-DATE-YYMMDD': ['info', 'B'],
  'ROW-TZ-UNKNOWN': ['info', 'B'],
  'ROW-UNIT-MISSING': ['warning', 'B'],
  'ROW-DEPTH-SIGN': ['info', 'B'],
  'ROW-DM-COORDS': ['info', 'B'],
  'XF-DUPLICATE-SAMPLES': ['info', 'C'],
  'XF-DATE-CONFLICT': ['warning', 'C'],
  'XF-STATION-ALIAS': ['info', 'C'],
  'XF-UNIT-CONFLICT': ['warning', 'C'],
  'XF-POSITION-SWAP': ['warning', 'C'],
  'XF-POSITION-CONFLICT': ['warning', 'C'],
  'CHEM-UNIT-PAIR': ['warning', 'C'],
  'CHEM-DIC-GT-TA': ['warning', 'C'],
  'CHEM-RANGE': ['warning', 'C'],
};

const placeholders = (s: string): Set<string> => new Set([...s.matchAll(/\{([A-Za-z_][\w.]*)\}/g)].map((m) => m[1]));

describe('rule table', () => {
  it('has exactly the 47 planned ids, each once, with the planned severity and category', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(47);
    expect([...ids].sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const r of RULES) {
      expect([r.severity, r.category], r.id).toEqual(EXPECTED[r.id]);
    }
  });

  it('index re-exports the same registry', () => {
    expect(RULES_FROM_INDEX).toBe(RULES);
  });

  it('keeps one rule file per category, LIC-* in licence and META-* in metadata', async () => {
    const lic = await import('../../src/core/rules/licence');
    const meta = await import('../../src/core/rules/metadata');
    const idsOf = (m: Record<string, unknown>): string[] =>
      (Object.values(m).flat() as { id?: string }[]).map((r) => r.id ?? '');
    expect(idsOf(lic).every((id) => id.startsWith('LIC-'))).toBe(true);
    expect(idsOf(meta).every((id) => id.startsWith('META-'))).toBe(true);
    expect(idsOf(lic).length).toBe(7);
    expect(idsOf(meta).length).toBe(7);
  });
});

describe('messages', () => {
  const GENERIC = new Set<string>(GENERIC_PARAMS);

  for (const r of RULES) {
    it(`${r.id}: four languages, placeholders consistent`, () => {
      const tech = placeholders(r.technical);
      for (const lang of LANGS) {
        expect(r.plain[lang], `${r.id} ${lang}`).toBeTruthy();
        expect(r.plain[lang].trim().length).toBeGreaterThan(20);
        expect(r.plain[lang].length, `${r.id} ${lang} too long`).toBeLessThanOrEqual(330);
        for (const p of placeholders(r.plain[lang])) {
          expect(tech.has(p), `${r.id} ${lang} uses {${p}} that technical lacks`).toBe(true);
        }
      }
      const declared = new Set(RULE_PARAMS[r.id]);
      for (const p of tech) {
        if (p.startsWith('threshold.')) {
          const name = p.slice('threshold.'.length);
          expect(() => threshold(r.id, name), `${r.id} {${p}}`).not.toThrow();
        } else {
          expect(GENERIC.has(p) || declared.has(p), `${r.id} technical uses undeclared {${p}}`).toBe(true);
        }
      }
      for (const p of declared) expect(tech.has(p), `${r.id} declares {${p}} but technical never uses it`).toBe(true);
    });

    it(`${r.id}: plain stays jargon-free and makes no readiness claim`, () => {
      for (const lang of LANGS) {
        const t = r.plain[lang];
        expect(t, `${r.id} ${lang}`).not.toMatch(/xpath|spdx|ready|gotow|bereit|\bprêt|\bpret\b/i);
        expect(t).not.toMatch(/\s{2,}/);
      }
    });
  }

  it('ROW-DATE-YYMMDD declares the interpreted date as a param', () => {
    expect(RULE_PARAMS['ROW-DATE-YYMMDD']).toEqual(['interpreted']);
  });

  it('Polish messages carry diacritics (no ASCII-fied text)', () => {
    const withDiacritics = RULES.filter((r) => /[ąćęłńóśźż]/i.test(r.plain.pl));
    expect(withDiacritics.length).toBeGreaterThanOrEqual(40);
    for (const r of RULES) expect(r.plain.pl, r.id).not.toMatch(/\b(sie|moze|musi sie|jest ze|zrodl|plik nie jest zapisany w UTF)\b/);
  });

  it('licence wording tells the user what to write', () => {
    expect(getRule('LIC-MISSING').plain.en).toContain('CC BY 4.0');
    // LIC-FREE-TEXT asks for the licence's OWN identifier ({hint}); a fixed "CC BY 4.0" would tell a publisher to switch (bug 22.10: 6).
    expect(getRule('LIC-FREE-TEXT').plain.en).toContain('{hint}');
    expect(getRule('LIC-FREE-TEXT').plain.en).not.toContain('CC BY 4.0');
  });
});

describe('thresholds and citations', () => {
  it('only the four rules named in the decisions carry numeric thresholds', () => {
    const withTh = RULES.filter((r) => (r.thresholds?.length ?? 0) > 0).map((r) => r.id).sort();
    expect(withTh).toEqual(['CHEM-RANGE', 'CHEM-UNIT-PAIR', 'ROW-LAT-RANGE', 'ROW-LON-RANGE']);
  });

  it('every threshold has a finite value, a unit and an https citation with label and locator', () => {
    for (const r of RULES) {
      for (const t of r.thresholds ?? []) {
        expect(Number.isFinite(t.value), `${r.id} ${t.name}`).toBe(true);
        expect(t.unit, `${r.id} ${t.name}`).toBeTruthy();
        expect(t.citation.url, `${r.id} ${t.name}`).toMatch(/^https:\/\//);
        expect(t.citation.label, `${r.id} ${t.name}`).toBeTruthy();
        expect(t.citation.locator, `${r.id} ${t.name}`).toBeTruthy();
      }
      for (const c of r.citations ?? []) {
        expect(c.url).toMatch(/^https:\/\//);
        expect(c.label).toBeTruthy();
        expect(c.locator).toBeTruthy();
      }
    }
  });

  it('threshold names are unique within a rule', () => {
    for (const r of RULES) {
      const names = (r.thresholds ?? []).map((t) => t.name);
      expect(new Set(names).size, r.id).toBe(names.length);
    }
  });

  it('CHEM-RANGE holds exactly the decided bounds, one threshold per bound', () => {
    const got = Object.fromEntries((getRule('CHEM-RANGE').thresholds ?? []).map((t) => [t.name, [t.value, t.unit]]));
    expect(got).toEqual({
      'temperature.min': [-2.5, '°C'],
      'temperature.max': [40, '°C'],
      'salinity.min': [2, 'psu'],
      'salinity.max': [41, 'psu'],
      'pressure.min': [-5, 'dbar'],
      'oxygen.min': [-5, 'µmol/kg'],
      'oxygen.max': [600, 'µmol/kg'],
      'pH.min': [6.5, 'pH units'],
      'pH.max': [9, 'pH units'],
    });
  });

  it('sources of the CHEM-RANGE bounds are the documents named in the decisions', () => {
    const urlOf = (n: string): string | undefined =>
      getRule('CHEM-RANGE').thresholds?.find((t) => t.name === n)?.citation.url;
    expect(urlOf('temperature.min')).toBe('https://archimer.ifremer.fr/doc/00228/33951/32470.pdf');
    expect(urlOf('salinity.max')).toBe('https://archimer.ifremer.fr/doc/00228/33951/32470.pdf');
    expect(urlOf('pressure.min')).toBe('https://archimer.ifremer.fr/doc/00228/33951/32470.pdf');
    expect(urlOf('oxygen.max')).toBe('https://archimer.ifremer.fr/doc/00354/46542/123086.pdf');
    expect(urlOf('pH.min')).toBe('https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf');
  });

  it('position ranges and molar masses match the decisions', () => {
    expect(threshold('ROW-LAT-RANGE', 'latitude.min')).toBe(-90);
    expect(threshold('ROW-LAT-RANGE', 'latitude.max')).toBe(90);
    expect(threshold('ROW-LON-RANGE', 'longitude.min')).toBe(-180);
    expect(threshold('ROW-LON-RANGE', 'longitude.max')).toBe(180);
    expect(threshold('CHEM-UNIT-PAIR', 'molarMass.C')).toBe(12.011);
    expect(threshold('CHEM-UNIT-PAIR', 'molarMass.N')).toBe(14.007);
    expect(threshold('CHEM-UNIT-PAIR', 'molarMass.P')).toBe(30.974);
    expect(threshold('CHEM-UNIT-PAIR', 'molarMass.Si')).toBe(28.085);
    for (const t of getRule('CHEM-UNIT-PAIR').thresholds ?? []) {
      expect(t.unit).toBe('g/mol');
      expect(t.citation.url).toBe('https://ciaaw.org/abridged-atomic-weights.htm');
    }
  });

  it('rules with a scientific basis but no number carry citations', () => {
    for (const id of ['CHEM-DIC-GT-TA', 'XF-UNIT-CONFLICT']) {
      expect(getRule(id).citations?.length, id).toBeGreaterThanOrEqual(2);
      expect(getRule(id).thresholds ?? [], id).toEqual([]);
    }
    expect(getRule('CHEM-DIC-GT-TA').citations?.map((c) => c.url)).toContain('https://www.teos-10.org/pubs/TEOS-10_Manual.pdf');
    expect(getRule('XF-UNIT-CONFLICT').citations?.map((c) => c.url)).toContain('https://essd.copernicus.org/articles/16/2047/2024/');
  });

  it('threshold() throws on unknown rule or name', () => {
    expect(() => threshold('CHEM-RANGE', 'nitrate.max')).toThrow(/nitrate\.max/);
    expect(() => threshold('NOPE', 'x')).toThrow();
    expect(() => threshold('ROW-RAGGED', 'x')).toThrow();
  });
});

describe('getRule and makeFinding', () => {
  it('getRule returns the rule and throws on unknown ids', () => {
    expect(getRule('ROW-RAGGED').severity).toBe('error');
    expect(() => getRule('NOPE')).toThrow(/NOPE/);
  });

  it('makeFinding copies the severity and defaults params', () => {
    const f = makeFinding('ROW-RAGGED', { lines: [3] });
    expect(f.severity).toBe('error');
    expect(f.ruleId).toBe('ROW-RAGGED');
    expect(f.params).toEqual({});
    expect(makeFinding('IN-DATE1904', { file: 'a.xlsx' }).severity).toBe('info');
  });

  it('makeFinding sorts and de-duplicates lines and keeps fields', () => {
    const f = makeFinding('ROW-RAGGED', { file: 'a.csv', lines: [9, 3, 3, 5], params: { expected: 4, found: 5 } });
    expect(f.lines).toEqual([3, 5, 9]);
    expect(f.params).toEqual({ expected: 4, found: 5 });
    expect(f.file).toBe('a.csv');
  });

  it('makeFinding throws on an unknown rule id', () => {
    expect(() => makeFinding('NOPE', {})).toThrow(/NOPE/);
  });
});
