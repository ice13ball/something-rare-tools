// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Lang } from '../types';

/*
 * Plural forms in a message. Until the converter, counts were written in a neutral way ("(12 in all)"); a sentence with a counted noun needs the
 * right form of the noun, so a template can hold a plural token next to the number:
 *
 *   "{count} {+count:cell|cells} left out"                         en, de, fr: two forms, one | other
 *   "Pominięto {count} {+count:komórkę|komórki|komórek}"           pl: three forms, one | few | many
 *
 * `{+name:forms}` prints only the noun, chosen by the number `name` (the number itself is the plain `{name}`). Rules (CLDR):
 *   en, de   one for 1, otherwise the other
 *   fr       one for 0 and 1, otherwise the other
 *   pl       one for 1; few when the number ends in 2-4 but not in 12-14; many for everything else (0, 5-21, 25-31 ... and 12-14)
 */
export type PluralCategory = 'one' | 'few' | 'many' | 'other';

export function pluralCategory(lang: Lang, n: number): PluralCategory {
  const i = Math.abs(Math.trunc(n));
  if (lang === 'pl') {
    if (i === 1 && Number.isInteger(n)) return 'one';
    const last = i % 10;
    const last2 = i % 100;
    return last >= 2 && last <= 4 && !(last2 >= 12 && last2 <= 14) ? 'few' : 'many';
  }
  if (lang === 'fr') return i === 0 || i === 1 ? 'one' : 'other';
  return i === 1 && Number.isInteger(n) ? 'one' : 'other';
}

/** The form for `n` from the forms of the language: [one, other] (en, de, fr) or [one, few, many] (pl). A missing form falls back to the last one. */
export function pluralForm(lang: Lang, n: number, forms: readonly string[]): string {
  const c = pluralCategory(lang, n);
  const index = lang === 'pl' ? (c === 'one' ? 0 : c === 'few' ? 1 : 2) : c === 'one' ? 0 : 1;
  return forms[Math.min(index, forms.length - 1)] ?? '';
}

const TOKEN = /\{\+(\w+):([^{}]*)\}/g;

/** Replaces every plural token of a template; `count(name)` gives the number a token depends on (a token with no number keeps its last form). */
export function applyPlurals(lang: Lang, template: string, count: (name: string) => number | undefined): string {
  return template.replace(TOKEN, (_whole, name: string, forms: string) => {
    const n = count(name);
    const list = forms.split('|');
    return n === undefined || !Number.isFinite(n) ? (list[list.length - 1] ?? '') : pluralForm(lang, n, list);
  });
}
