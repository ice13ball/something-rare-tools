// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Completeness of every finding text and every UI string, in all four languages. The existing loops (convert/rules.test.ts, app/ui.test.ts) cover `plain` and the plain
// `{name}` placeholders; they never render plainIf / plainByStatus / other variants / PROFILE_VARIANTS and cannot see plural tokens `{+n:a|b|c}` (i18n/plural.ts). This test
// collects EVERY text, then checks per language: present, non-empty, the same `{name}` set as English, the same plural-token names as English with the right number of
// forms (en, de, fr: 2; pl: 3), nothing stray left after those are removed, and (for finding texts) every placeholder is a param the rule declares.
// Known defects in today's texts are listed in KNOWN_DEFECTS with a reason; the test fails if a listed defect disappears (so the list cannot rot) or a new one appears.
import { describe, expect, it } from 'vitest';
import { UI } from '../../src/core/i18n/ui';
import { PROFILE_VARIANTS } from '../../src/core/rules/convert';
import { RULES, RULE_PARAMS } from '../../src/core/rules/registry';
import { GENERIC_PARAMS } from '../../src/core/rules/spec';
import { LANGS, type Lang, type RuleDef } from '../../src/core/types';

const PLACEHOLDER = /\{([A-Za-z_][\w.]*)\}/g;
const PLURAL = /\{\+(\w+):([^{}]*)\}/g;
const FORMS: Record<Lang, number> = { en: 2, de: 2, fr: 2, pl: 3 };
const DERIVED_COUNTS = new Set(['lines', 'lineCount']);
const GENERIC = new Set<string>(GENERIC_PARAMS);

/** Known real defects, "<where> <lang> <problem>" -> reason. Empty means none. Do not add an entry without a reason the owner can judge. */
const KNOWN: Record<string, string[]> = {
  // Polish with two forms [one, rest] works: pluralForm falls back to the last form, so 2-4 and 5+ print the same word. Correct while the few and many forms are the same word
  // (the locative "w wierszach", the list noun "wiersze"). English and German with a third, unused form: only indexes 0 and 1 are ever read. No wrong output today.
  'Plural token with a form count other than the language expects; the renderer falls back to the last form, so the text prints correctly (revisit if a text ever needs a distinct few form)': [
    "ROW-LAT-EQ-LON-ISOLATED plain pl plural token +lines has 2 forms, expected 3",
    "ROW-LAT-EQ-LON-COARSE plain pl plural token +lines has 2 forms, expected 3",
    "ROW-RAGGED plain pl plural token +lines has 2 forms, expected 3",
    "ROW-RAGGED plain en plural token +lines has 3 forms, expected 2",
    "ROW-RAGGED plain de plural token +lines has 3 forms, expected 2",
    "ROW-DATE-UNPARSEABLE plainTime pl plural token +lines has 2 forms, expected 3",
  ],
  // The English text names the readings {first} and {second}; pl, de and fr name {isoFirst} and {isoSecond}. All four are declared params that the converter sets, so every language renders.
  // Whether English should show the ISO form too is a wording decision, not a rendering fault.
  'Placeholder names differ from English but all are declared and set (a wording difference)': [
    "CONV-DATE-ORDER-UNDECLARED plain pl placeholders [count,field,isoFirst,isoSecond,value] differ from English [count,field,first,second,value]",
    "CONV-DATE-ORDER-UNDECLARED plain de placeholders [count,field,isoFirst,isoSecond,value] differ from English [count,field,first,second,value]",
    "CONV-DATE-ORDER-UNDECLARED plain fr placeholders [count,field,isoFirst,isoSecond,value] differ from English [count,field,first,second,value]",
  ],
  // A language that has no plural token where English has one has rephrased the sentence (uses a count-free noun, a colon list, or a form that does not inflect). Not a rendering fault;
  // listed so that a NEW asymmetry is noticed. Not reviewed sentence by sentence.
  'Language has no plural token where English has one (rephrased; not reviewed one by one)': [
    "ROW-LONG-VALUE-SKIPPED plain pl English has plural token +count, this language has none for it (asymmetry)",
    "ROW-LONG-VALUE-SKIPPED plain fr English has plural token +count, this language has none for it (asymmetry)",
    "CONV-JOIN-PROPOSED plain pl English has plural token +covered, this language has none for it (asymmetry)",
    "CONV-TAXON-SAME-EVENT plain de English has plural token +count, this language has none for it (asymmetry)",
    "CONV-TAXON-SAME-EVENT plain fr English has plural token +count, this language has none for it (asymmetry)",
    "CONV-SAMPLE-PER-ROW plain de English has plural token +occurrences, this language has none for it (asymmetry)",
    "CONV-LONG-KEY-VARIES plain pl English has plural token +count, this language has none for it (asymmetry)",
    "CONV-LONG-KEY-VARIES plain de English has plural token +count, this language has none for it (asymmetry)",
    "CONV-LONG-KEY-VARIES plain fr English has plural token +count, this language has none for it (asymmetry)",
    "CONV-SEAFLOOR-VALUE plain pl English has plural token +count, this language has none for it (asymmetry)",
    "CONV-SEAFLOOR-VALUE plain de English has plural token +count, this language has none for it (asymmetry)",
    "CONV-SEAFLOOR-VALUE plain fr English has plural token +count, this language has none for it (asymmetry)",
    "ui convert.taxa.title pl English has plural token +n, this language has none for it (asymmetry)",
    "ui convert.taxa.unconfirmed pl English has plural token +n, this language has none for it (asymmetry)",
    "ui convert.worms.stopped de English has plural token +total, this language has none for it (asymmetry)",
    "ui convert.worms.stopped fr English has plural token +total, this language has none for it (asymmetry)",
    "ui convert.splits.uses de English has plural token +n, this language has none for it (asymmetry)",
    "ui convert.splits.uses fr English has plural token +n, this language has none for it (asymmetry)",
    "ui convert.tree.counts pl English has plural token +cruises, this language has none for it (asymmetry)",
    "ui convert.tree.counts pl English has plural token +samples, this language has none for it (asymmetry)",
    "ui convert.tree.counts pl English has plural token +stations, this language has none for it (asymmetry)",
    "ui convert.tree.derived pl English has plural token +dates, this language has none for it (asymmetry)",
    "ui convert.tree.derived pl English has plural token +depths, this language has none for it (asymmetry)",
    "ui convert.tree.derived pl English has plural token +positions, this language has none for it (asymmetry)",
    "ui convert.tree.noPosition pl English has plural token +n, this language has none for it (asymmetry)",
    "ui convert.tree.levels pl English has plural token +levels, this language has none for it (asymmetry)",
    "ui convert.summary.counts pl English has plural token +events, this language has none for it (asymmetry)",
    "ui convert.summary.counts pl English has plural token +measurements, this language has none for it (asymmetry)",
    "ui convert.summary.counts pl English has plural token +occurrences, this language has none for it (asymmetry)",
    "ui collection.progress.requests de English has plural token +throttled, this language has none for it (asymmetry)",
  ],
};
const KNOWN_DEFECTS: Record<string, string> = Object.fromEntries(Object.entries(KNOWN).flatMap(([reason, keys]) => keys.map((k) => [k, reason])));

interface Text { where: string; texts: Record<Lang, string>; params?: ReadonlySet<string> }


const names = (s: string): string[] => [...new Set([...s.matchAll(PLACEHOLDER)].map((m) => m[1]))].sort();
const plurals = (s: string): { name: string; forms: number }[] => [...s.matchAll(PLURAL)].map((m) => ({ name: m[1], forms: m[2].split('|').length }));
const stray = (s: string): string => s.replace(PLURAL, '').replace(PLACEHOLDER, '');

function ruleTexts(r: RuleDef): Text[] {
  const declared = new Set([...(RULE_PARAMS[r.id] ?? []), ...GENERIC]);
  const out: Text[] = [{ where: `${r.id} plain`, texts: r.plain }];
  const add = (label: string, t: Record<Lang, string> | undefined): void => { if (t) out.push({ where: `${r.id} ${label}`, texts: t }); };
  add('plainByStatus.server', r.plainByStatus?.server);
  add('plainByStatus.other', r.plainByStatus?.other);
  add('plainDataciteNotCompared', r.plainDataciteNotCompared);
  add('plainCollection', r.plainCollection);
  add('plainNoMetadata', r.plainNoMetadata);
  add('plainOtherRest', r.plainOtherRest);
  add('plainTime', r.plainTime);
  add('plainConvert', r.plainConvert);
  Object.entries(r.plainVariants ?? {}).forEach(([k, v]) => add(`plainVariants[${k}]`, v));
  (r.plainIf ?? []).forEach((x, i) => add(`plainIf[${i}:${x.param}]`, x.plain));
  // optional params: the trigger of each plainIf, and the params named in the rule's own comment are not in `params`; the trigger names are allowed for its own sentence only
  return out.map((t) => {
    const trigger = /plainIf\[\d+:([^\]]+)\]/.exec(t.where)?.[1];
    const extra = t.where.endsWith(' plainOtherRest') ? ['otherRest'] : trigger ? [trigger, `${trigger}Count`] : [];
    return { ...t, params: new Set([...declared, ...extra]) };
  });
}

const ALL: Text[] = [
  ...RULES.flatMap(ruleTexts),
  ...Object.entries(PROFILE_VARIANTS).map(([key, v]) => ({ where: `PROFILE ${key}`, texts: v.plain, params: undefined })),
  ...(Object.keys(UI.en) as (keyof typeof UI.en)[]).map((k) => ({ where: `ui ${k}`, texts: Object.fromEntries(LANGS.map((l) => [l, UI[l][k]])) as Record<Lang, string> })),
];

/** Every problem of every text, as "<where> <lang> <problem>". */
function defects(): string[] {
  const found: string[] = [];
  for (const t of ALL) {
    const en = t.texts.en ?? '';
    const enNames = names(en);
    const enPlurals = [...new Set(plurals(en).map((p) => p.name))].sort();
    for (const lang of LANGS) {
      const s = t.texts[lang];
      const bad = (problem: string): void => { found.push(`${t.where} ${lang} ${problem}`); };
      if (typeof s !== 'string' || s.trim() === '') { bad('missing or blank'); continue; }
      if (names(s).join(',') !== enNames.join(',')) bad(`placeholders [${names(s)}] differ from English [${enNames}]`);
      const pl = plurals(s);
      // Languages inflect different nouns (Polish agrees more words with a number than English does), so a token set may legitimately differ. A token may only count
      // a number the English text also knows (a placeholder or token of it); a language lacking a token English has is listed as asymmetry, to be reviewed.
      for (const p of pl) if (!enPlurals.includes(p.name) && !enNames.includes(p.name) && !DERIVED_COUNTS.has(p.name)) bad(`plural token +${p.name} counts a number English does not name`);
      for (const n of enPlurals) if (!pl.some((p) => p.name === n)) bad(`English has plural token +${n}, this language has none for it (asymmetry)`);
      for (const p of pl) if (p.forms !== FORMS[lang]) bad(`plural token +${p.name} has ${p.forms} forms, expected ${FORMS[lang]}`);
      if (/[{}]/.test(stray(s))) bad('stray brace after removing placeholders and plural tokens');
      if (t.params) {
        for (const n of names(s)) if (!t.params.has(n) && !n.startsWith('threshold.')) bad(`uses {${n}} which the rule does not declare`);
        // a plural token counts a declared param, or one of the two the renderers derive from the finding's lines: `lines` (/check) and `lineCount` (/convert)
        for (const p of pl) if (!t.params.has(p.name) && !DERIVED_COUNTS.has(p.name)) bad(`plural token +${p.name} counts something the rule does not declare`);
      }
    }
  }
  return [...new Set(found)];
}

describe('texts completeness (rules, variants, UI)', () => {
  it('covers the expected number of texts, so a loop cannot pass by iterating nothing', () => {
    const rules = ALL.filter((t) => !t.where.startsWith('ui ') && !t.where.startsWith('PROFILE '));
    expect(RULES.length).toBeGreaterThanOrEqual(142);
    expect(rules.filter((t) => t.where.endsWith(' plain')).length).toBe(RULES.length);
    expect(rules.filter((t) => t.where.includes(' plainIf[')).length).toBeGreaterThanOrEqual(31);
    expect(ALL.filter((t) => t.where.startsWith('PROFILE ')).length).toBe(Object.keys(PROFILE_VARIANTS).length);
    expect(Object.keys(PROFILE_VARIANTS).length).toBeGreaterThanOrEqual(49);
    expect(ALL.filter((t) => t.where.startsWith('ui ')).length).toBe(Object.keys(UI.en).length);
    expect(Object.keys(UI.en).length).toBeGreaterThanOrEqual(1279);
    expect([...LANGS].sort()).toEqual(['de', 'en', 'fr', 'pl']);
  });

  it('every text is present in all four languages with the same placeholders and plural forms as English, and declares what it uses', () => {
    const found = defects();
    const unexpected = found.filter((d) => !(d in KNOWN_DEFECTS));
    expect(unexpected, 'new text defects').toEqual([]);
    const gone = Object.keys(KNOWN_DEFECTS).filter((d) => !found.includes(d));
    expect(gone, 'listed defects that no longer occur: remove them from KNOWN_DEFECTS').toEqual([]);
  });
});
