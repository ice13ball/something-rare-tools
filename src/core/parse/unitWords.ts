// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { cleanUnitText, normaliseUnit } from '../recognize/vocab';

/*
 * Is a cell of a row under the header a UNIT? Used only by foldUnitsRow (parse/shared.ts): a row where EVERY filled cell is a unit is a second header row of the table.
 * It never sets a role. The answer is one of
 *   'unit'    a unit that goes into the header as `name [unit]`
 *   'utc'     the time zone label of a time column ("UTC")
 *   'neutral' says nothing about a unit and adds none: "unitless", "text", "code", "integer" (BCO-DMO types) and a number format ("ddd.d")
 *   undefined not a unit
 * A unit is one of the vocabulary (normaliseUnit), the ERDDAP angle units, degF, or a phrase made of unit words ("cubic metres", "nanomoles per liter (nmol/L)", "number/net", "m s-1", "cm").
 * The list has to refuse what a first data row is made of, because it is the first line of defence (the value check in foldUnitsRow is the second): symbols are matched by CASE (cm is a
 * unit, CM, M, H, L, NS, PM, G1, S1 are codes), missing-value tokens (nm, ns, nd, n/d, n/m, n.a., na, nan, null, none, -) are never units, a cell that starts with a digit or ends in a number
 * outside a unit exponent ("0 m", "10 cm", "Core 1", "S1", "Day 3") is a label, calendar words (day, month, year) are not listed, and the words that name a thing counted or a place
 * (sample, core, tow, area, volume, cell ...) are units only in a division ("number/haul", "fish per tow"), never alone ("Core sample", "Volume").
 */
export type UnitCellKind = 'unit' | 'utc' | 'neutral';

const ERDDAP_ANGLES = new Set(['degrees_north', 'degree_north', 'degrees_east', 'degree_east']);
const EXTRA_UNITS = new Set(['degF', 'degree_F', 'degrees_F', '°F', 'degC', 'degree_C', 'degrees_C', '°C']);
const NEUTRAL = /^(?:unitless|dimensionless|text|string|code|integer)$/i;
// a number format describing a column ("ddd.d" for a decimal day of the year), not a unit
const FORMAT = /^(?:d{2,3}(?:\.d+)?|d\.d+|hh:mm(?::ss)?|yyyy-mm-dd|yyyymmdd)$/i;
// the tokens that say "no value here": never a unit, whatever letters they are made of
const MISSING = /^(?:n[/.]?[adms][.]?|na|nd|nm|ns|nan|null|none|nil|-+|\?+)$/i;

const PREFIX = ['femto', 'pico', 'nano', 'micro', 'milli', 'centi', 'deci', 'deca', 'hecto', 'kilo', 'mega'];
const BASE = ['meter', 'metre', 'gram', 'liter', 'litre', 'mole', 'second', 'volt', 'watt', 'pascal', 'bar', 'hertz'];
const PLAIN = [
  'foot', 'feet', 'inch', 'inches', 'mile', 'micron', 'minute', 'hour', 'degree', 'celsius', 'fahrenheit', 'kelvin', 'percent', 'percentage', 'count', 'individual', 'number', 'organism', 'specimen', 'ind',
  'ppt', 'ppm', 'psu', 'knot', 'hectare', 'decibar', 'dbar',
];
// adjectives of a unit: never alone
const MODIFIERS = new Set(['cubic', 'square', 'decimal', 'nautical', 'thousand', 'million', 'part', 'parts']);
// things counted or places: a unit only in a division ("number/haul", "fish per tow")
const DENOMINATORS = new Set(['sample', 'core', 'tow', 'area', 'volume', 'cell', 'unit', 'fraction', 'net', 'station', 'haul', 'trap']);
const WORDS = new Set<string>(PLAIN);
for (const b of BASE) {
  WORDS.add(b);
  for (const p of PREFIX) WORDS.add(p + b);
}
const stem = (w: string): string => (WORDS.has(w) || MODIFIERS.has(w) || DENOMINATORS.has(w) ? w : w.replace(/(?:es|s)$/, '')) ;
const isWord = (w: string): boolean => WORDS.has(w) || WORDS.has(w.replace(/es$/, '')) || WORDS.has(w.replace(/s$/, ''));
// SI symbols, matched by CASE: lower-case prefix and m, g, l, s, mol ("cm", "mg", "ul", "kg", "ms"), mL / uL for litres, a few whole symbols. Not nm and ns (missing-value tokens).
const SYMBOL = /^(?:(?:[fpnuµmcdk]|da)(?:m|g|l|s|mol)|m|g|l|s|mol|h|min|yr|ft|ind|ppt|ppm|psu|PSU|hz|Hz|pa|Pa|dbar)$|^(?:[fpnuµmcdk]|da)L$/;
// only in a division ("n/m²"): "n" is a count, a lone one is a letter
const FILLERS = new Set(['n', 'no']);

function tokenOk(tok: string, div: boolean): boolean {
  if (div && (FILLERS.has(tok) || /^\d+$/.test(tok))) return true;
  const m = /^([A-Za-zµ°%]+?)(\^[-+]?\d+|[²³¹⁻]+|[-+]?\d+)?$/.exec(tok);
  if (!m) return false;
  const [, w, exp] = m;
  if (w === '%' || w === '°') return true;
  // a trailing number is an exponent of a symbol (m2, s-1, cm3), or of a word only after ^ or a superscript digit (centimeters^2); "core1" is a label
  const symbolExp = exp === undefined || SYMBOL.test(w);
  const wordExp = exp === undefined || exp.startsWith('^') || /^[²³¹⁻]/.test(exp);
  const lw = w.toLowerCase();
  // litre written L is a unit after a slash or per (mol/L, mg/L); alone it is a code (L = large)
  if (div && w === 'L' && exp === undefined) return true;
  if (SYMBOL.test(w) && symbolExp) return true;
  if (DENOMINATORS.has(stem(lw))) return div && wordExp;
  return (isWord(lw) || MODIFIERS.has(lw)) && wordExp;
}

const NOUN = /^[a-z][a-z-]*(?: [a-z][a-z-]*)?$/i;

function phrase(t: string): boolean {
  if (/^parts?\s+per\s+(?:thousand|million|billion|trillion)$/i.test(t)) return true;
  // "larvae per milliliter", "spores per milliliter", "number per cubic metres": a thing counted, then a unit
  const per = /^(.+?)\s+per\s+(.+)$/i.exec(t);
  if (per && (phrase(per[1]) || NOUN.test(per[1])) && phraseIn(per[2], true)) return true;
  // "nanomoles per liter (nmol/L)": the words, and the abbreviation after them is a unit too
  const paren = /^(.*\S)\s*\(([^()]+)\)$/.exec(t);
  if (paren) return phrase(paren[1]) && (phrase(paren[2]) || normaliseUnit(paren[2]) !== undefined);
  return phraseIn(t, false);
}

function phraseIn(t: string, perDiv: boolean): boolean {
  const toks = t.split(/\s+per\s+|[\s/·*]+/).filter((x) => x !== '');
  if (toks.length === 0) return false;
  const div = perDiv || /[/^]|\sper\s/i.test(t);
  if (!toks.every((tk) => tokenOk(tk, div))) return false;
  // at least one real unit word or symbol: a modifier ("cubic"), a filler ("n"), a number or a thing counted ("core") alone is not a unit
  return toks.some((tk) => {
    if (perDiv && DENOMINATORS.has(stem(tk.toLowerCase()))) return true;
    if (FILLERS.has(tk) || /^\d+$/.test(tk)) return false;
    const w = /^[A-Za-zµ°%]+/.exec(tk)?.[0] ?? '';
    const lw = w.toLowerCase();
    return w === '%' || w === '°' || SYMBOL.test(w) || (isWord(lw) && !MODIFIERS.has(lw) && !DENOMINATORS.has(stem(lw)));
  });
}

/** Escapes such as ² that an export wrote as text are the character they stand for. */
export const decodeUnitText = (t: string): string => t.replace(/\\u([0-9a-fA-F]{4})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16))).replace(/\s+/g, ' ').trim();

export function unitCellKind(raw: string): UnitCellKind | undefined {
  // a unit is a few words: a longer cell is refused before any pattern runs on it
  if (raw.length > 200) return undefined;
  const t = decodeUnitText(raw);
  if (t === '' || /[[\]]/.test(t) || t.length > 60) return undefined;
  if (t === 'UTC') return 'utc';
  if (NEUTRAL.test(t) || FORMAT.test(t)) return 'neutral';
  if (MISSING.test(t) || /^\d/.test(t) || /^[A-Z]{1,2}$/.test(t)) return undefined;
  if (ERDDAP_ANGLES.has(t) || EXTRA_UNITS.has(t)) return 'unit';
  // a label that ends in a number ("S1", "Core 1", "Day 3") is a label; the exponent of a symbol or a word after ^ is handled by the phrase test
  if (/^[A-Za-z]+\s*\d+$/.test(t) && !SYMBOL.test(t.replace(/\s*\d+$/, ''))) return undefined;
  if (normaliseUnit(t) !== undefined) return 'unit';
  return phrase(t) ? 'unit' : undefined;
}

const SYNONYMS: Record<string, string> = {
  feet: 'ft', foot: 'ft', ft: 'ft',
  meters: 'm', metres: 'm', meter: 'm', metre: 'm', m: 'm',
  centimeters: 'cm', centimetres: 'cm', centimeter: 'cm', centimetre: 'cm', cm: 'cm',
  millimeters: 'mm', millimetres: 'mm', mm: 'mm',
  kilometers: 'km', kilometres: 'km', km: 'km',
  degc: '°c', 'deg c': '°c', 'degree c': '°c', 'degrees c': '°c', celsius: '°c', '°c': '°c', 'degrees celsius': '°c',
  degf: '°f', 'deg f': '°f', 'degree f': '°f', 'degrees f': '°f', fahrenheit: '°f', '°f': '°f',
};

/** Two spellings of one unit ("degC" and "degree_C", "feet" and "ft", "µg/L" and "ug/l") have the same key. */
export const unitKey = (raw: string): string => {
  const t = decodeUnitText(raw);
  const c = cleanUnitText(t);
  return SYNONYMS[c] ?? normaliseUnit(t) ?? c;
};

// the last token of a name such as depth_m or temp_c says its unit when the header has no bracket: only these
const NAME_TAIL: Record<string, string> = { m: 'm', ft: 'ft', cm: 'cm', mm: 'mm', km: 'km', c: '°c', f: '°f' };
export const nameTailUnit = (name: string): string | undefined => {
  const m = /[_\s]([A-Za-z]{1,2})$/.exec(name.trim().slice(-4));
  return m ? NAME_TAIL[m[1].toLowerCase()] : undefined;
};
