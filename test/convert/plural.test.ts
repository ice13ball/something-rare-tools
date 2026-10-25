// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Plural forms of the converter texts: the mechanism (core/i18n/plural.ts), and every counted noun of the CONV rules and the converter page.
import { describe, expect, it } from 'vitest';
import { applyPlurals, pluralCategory, pluralForm } from '../../src/core/i18n/plural';
import { UI, translate } from '../../src/core/i18n/ui';
import { CONVERT_RULES, CONVERT_RULE_PARAMS, makeConvertFinding, renderConvertPlain } from '../../src/core/rules/convert';
import { LANGS } from '../../src/core/types';

const NUMBERS = [1, 2, 5, 12, 22] as const;

describe('the forms of each language', () => {
  it('Polish has three: 1 komórkę, 2-4 komórki, 5+ komórek, and 12-14 are komórek like 5', () => {
    const w = (n: number) => pluralForm('pl', n, ['komórkę', 'komórki', 'komórek']);
    expect(NUMBERS.map(w)).toEqual(['komórkę', 'komórki', 'komórek', 'komórek', 'komórki']);
    expect([0, 3, 4, 11, 13, 14, 21, 24, 25, 100, 101, 102, 112, 114].map(w)).toEqual(['komórek', 'komórki', 'komórki', 'komórek', 'komórek', 'komórek', 'komórek', 'komórki', 'komórek', 'komórek', 'komórek', 'komórki', 'komórek', 'komórek']);
    expect(pluralCategory('pl', 1)).toBe('one');
  });

  it('English and German have two: one for 1, the other for everything else, 0 included', () => {
    for (const lang of ['en', 'de'] as const) {
      expect(NUMBERS.map((n) => pluralForm(lang, n, ['a', 'b']))).toEqual(['a', 'b', 'b', 'b', 'b']);
      expect(pluralForm(lang, 0, ['a', 'b'])).toBe('b');
    }
  });

  it('French has two: one for 0 and 1', () => {
    expect(NUMBERS.map((n) => pluralForm('fr', n, ['a', 'b']))).toEqual(['a', 'b', 'b', 'b', 'b']);
    expect(pluralForm('fr', 0, ['a', 'b'])).toBe('a');
  });

  it('a token takes the number it names, and keeps its last form when there is none', () => {
    const t = '{n} {+n:x|y|z} and {m} {+m:p|q|r}';
    expect(applyPlurals('pl', t, (name) => (name === 'n' ? 2 : 5))).toBe('{n} y and {m} r');
    expect(applyPlurals('en', '{+n:cell|cells}', () => undefined)).toBe('cells');
  });
});

describe('every rule and page text that counts something', () => {
  const COUNT_RULES = ['CONV-SPLIT-UNDECIDED', 'CONV-ZERO-SKIPPED', 'CONV-SUMMARY-ROW-SKIPPED', 'CONV-TAXON-SAME-EVENT'] as const;
  const render = (id: string, lang: (typeof LANGS)[number], n: number): string => {
    const params = Object.fromEntries(CONVERT_RULE_PARAMS[id].map((p) => [p, p === 'count' ? n : 'x']));
    return renderConvertPlain(makeConvertFinding(id, { file: 'f.csv', sheet: 'S', field: 'c', value: 'v', lines: [3], params }), lang);
  };

  it('CONV-ZERO-SKIPPED says "cell" / "komórkę" / "komórki" / "komórek" / "Zelle" / "cellule" as the number needs', () => {
    expect(NUMBERS.map((n) => render('CONV-ZERO-SKIPPED', 'en', n).split(' left out')[0])).toEqual([
      '1 cell with a zero was',
      '2 cells with a zero were',
      '5 cells with a zero were',
      '12 cells with a zero were',
      '22 cells with a zero were',
    ]);
    expect(NUMBERS.map((n) => /^Pominięto \d+ (\S+) z zerem/.exec(render('CONV-ZERO-SKIPPED', 'pl', n))![1])).toEqual(['komórkę', 'komórki', 'komórek', 'komórek', 'komórki']);
    expect(NUMBERS.map((n) => /^\d+ (.+?) ausgelassen/.exec(render('CONV-ZERO-SKIPPED', 'de', n))![1])).toEqual(['Zelle mit einer Null wurde', ...Array(4).fill('Zellen mit einer Null wurden')]);
    expect(NUMBERS.map((n) => /^\d+ (.+?), car/.exec(render('CONV-ZERO-SKIPPED', 'fr', n))![1])).toEqual(['cellule à zéro a été ignorée', ...Array(4).fill('cellules à zéro ont été ignorées')]);
  });

  it('the other counted rules agree in number in every language (one row / name: singular; several: plural)', () => {
    expect(render('CONV-SUMMARY-ROW-SKIPPED', 'en', 1)).toMatch(/^1 summary row \(v\) in line 3 was left out\. It is not a sample/);
    expect(render('CONV-SUMMARY-ROW-SKIPPED', 'en', 5)).toMatch(/^5 summary rows \(v\) in lines 3 were left out\. They are not samples/);
    expect(render('CONV-SUMMARY-ROW-SKIPPED', 'pl', 1)).toMatch(/^Pominięto 1 wiersz podsumowania \(v\) w wierszu 3\. To nie jest próbka/);
    expect(render('CONV-SUMMARY-ROW-SKIPPED', 'pl', 2)).toMatch(/^Pominięto 2 wiersze podsumowania/);
    expect(render('CONV-SUMMARY-ROW-SKIPPED', 'pl', 12)).toMatch(/^Pominięto 12 wierszy podsumowania/);
    expect(render('CONV-SUMMARY-ROW-SKIPPED', 'pl', 22)).toMatch(/^Pominięto 22 wiersze podsumowania/);
    expect(render('CONV-SPLIT-UNDECIDED', 'pl', 1)).toMatch(/^1 nazwa taksonu ma /);
    expect(render('CONV-SPLIT-UNDECIDED', 'pl', 3)).toMatch(/^3 nazwy taksonów mają /);
    expect(render('CONV-SPLIT-UNDECIDED', 'pl', 12)).toMatch(/^12 nazw taksonów ma /);
    expect(render('CONV-SPLIT-UNDECIDED', 'en', 1)).toMatch(/^1 taxon name carries /);
    expect(render('CONV-SPLIT-UNDECIDED', 'de', 2)).toMatch(/^2 Taxonnamen enthalten /);
    expect(render('CONV-SPLIT-UNDECIDED', 'fr', 1)).toMatch(/^1 nom de taxon porte /);
    expect(render('CONV-TAXON-SAME-EVENT', 'pl', 2)).toContain('występuje 2 razy');
    expect(render('CONV-TAXON-SAME-EVENT', 'en', 3)).toContain('appears 3 times');
  });

  it('every plural token has the number of forms its language uses, and a numeric param to read', () => {
    const tokens = (s: string): string[][] => [...s.matchAll(/\{\+(\w+):([^{}]*)\}/g)].map((m) => m[2].split('|'));
    for (const lang of LANGS) {
      const forms = lang === 'pl' ? 3 : 2;
      const texts = [...CONVERT_RULES.map((r) => r.plain[lang]), ...Object.entries(UI[lang]).filter(([k]) => k.startsWith('convert.')).map(([, v]) => v)];
      for (const text of texts) for (const f of tokens(text)) expect(f.length, `${lang}: ${text}`).toBeLessThanOrEqual(forms);
    }
    for (const id of COUNT_RULES) expect(CONVERT_RULE_PARAMS[id]).toContain('count');
  });

  it('with every number set to 1, no English sentence of the converter says "1 cells", "1 events", "1 rows" and the like', () => {
    const bad = /\b1 (?:[a-z-]+ )?(?:cells|events|occurrences|rows|samples|dates|positions|ranges|times|names|stations|cruises)\b/;
    for (const r of CONVERT_RULES) expect(render(r.id, 'en', 1), r.id).not.toMatch(bad);
    for (const [key, template] of Object.entries(UI.en)) {
      if (!key.startsWith('convert.')) continue;
      const params = Object.fromEntries([...template.matchAll(/\{(\w+)\}/g)].map((m) => [m[1], /^(n|count|cruises|stations|samples|dates|positions|depths|events|occurrences|present|absent|measurements)$/.test(m[1]) ? 1 : 'x']));
      expect(translate('en', key, params), key).not.toMatch(bad);
    }
  });

  it('the page counts render with the right noun: 1 event / 2 events, and Polish stays neutral and correct', () => {
    expect(translate('en', 'convert.summary.counts', { events: 1, occurrences: 1, present: 1, absent: 0, measurements: 1 })).toBe('1 event, 1 occurrence (1 present, 0 absent) and 1 measurement row would be written.');
    expect(translate('en', 'convert.tree.counts', { cruises: 1, stations: 2, samples: 3 })).toBe('1 cruise event, 2 station events, 3 sample events.');
    expect(translate('en', 'convert.tree.noPosition', { n: 1 })).toBe('1 sample has no position of their own.');
    expect(translate('en', 'convert.tree.noPosition', { n: 4 })).toBe('4 samples have no position of their own.');
    expect(translate('de', 'convert.summary.counts', { events: 1, occurrences: 2, present: 2, absent: 0, measurements: 1 })).toContain('1 Ereignis, 2 Vorkommen');
    expect(translate('fr', 'convert.tree.counts', { cruises: 0, stations: 1, samples: 2 })).toBe("0 événement de campagne, 1 événement de station, 2 événements d'échantillon.");
    expect(NUMBERS.map((n) => translate('pl', 'convert.splits.uses', { n }))).toEqual(['Użyta 1 raz', 'Użyta 2 razy', 'Użyta 5 razy', 'Użyta 12 razy', 'Użyta 22 razy']);
    expect(NUMBERS.map((n) => translate('en', 'convert.splits.uses', { n }))).toEqual(['Used 1 time', 'Used 2 times', 'Used 5 times', 'Used 12 times', 'Used 22 times']);
  });
});
