// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { cleanUnitText, normaliseUnit } from '../recognize/vocab';

/*
 * Is a cell of a row under the header a UNIT? Used only by foldUnitsRow (parse/shared.ts): a row where EVERY filled cell is a unit is a second header row of the table.
 * It never sets a role. The answer is one of
 *   'unit'    a unit that goes into the header as `name [unit]`
 *   'utc'     the time zone label of a time column ("UTC")
 *   'neutral' says nothing about a unit and adds none: "unitless", "text", "code" (BCO-DMO types) and a number format ("ddd.d")
 *   undefined not a unit
 * A unit is one of the vocabulary (normaliseUnit), the ERDDAP angle units, or a phrase made of unit words ("cubic metres", "nanomoles per liter (nmol/L)", "number/net", "m s-1", "cm").
 * The foldUnitsRow numeric check, not this list, is what keeps a first data row of codes (m, g, cm) data.
 */
export type UnitCellKind = 'unit' | 'utc' | 'neutral';

const ERDDAP_ANGLES = new Set(['degrees_north', 'degree_north', 'degrees_east', 'degree_east']);
const NEUTRAL = /^(?:unitless|dimensionless|text|string|code|integer)$/i;
// a number format describing a column ("ddd.d" for a decimal day of the year), not a unit
const FORMAT = /^(?:d{2,3}(?:\.d+)?|d\.d+|hh:mm(?::ss)?|yyyy-mm-dd|yyyymmdd)$/i;

const PREFIX = ['femto', 'pico', 'nano', 'micro', 'milli', 'centi', 'deci', 'deca', 'hecto', 'kilo', 'mega'];
const BASE = ['meter', 'metre', 'gram', 'liter', 'litre', 'mole', 'second', 'volt', 'watt', 'pascal', 'bar', 'hertz'];
const PLAIN = [
  'foot', 'feet', 'inch', 'inches', 'mile', 'nautical', 'micron', 'microns', 'minute', 'hour', 'day', 'week', 'month', 'year', 'degree', 'celsius', 'fahrenheit', 'kelvin', 'percent', 'percentage',
  'count', 'individual', 'number', 'cubic', 'square', 'core', 'sample', 'tow', 'cell', 'organism', 'specimen', 'fraction', 'ind', 'ppt', 'ppm', 'psu', 'decimal', 'parts', 'part', 'thousand',
  'million', 'knot', 'hectare', 'decibar', 'dbar', 'volume', 'area', 'unit', 'litres', 'liters',
];
const WORDS = new Set<string>(PLAIN);
for (const b of BASE) {
  WORDS.add(b);
  for (const p of PREFIX) WORDS.add(p + b);
}
// plural of a word ("meters", "individuals", "femtomoles", "feet" is its own entry)
const isWord = (w: string): boolean => WORDS.has(w) || WORDS.has(w.replace(/(?:es|s)$/, '')) || WORDS.has(w.replace(/s$/, ''));
// SI symbols: an optional prefix and m, g, l, s, h, min, mol, yr, ft ("cm", "mg", "ul", "kg", "ms")
const SYMBOL = /^(?:[fpnuµmcdk]|da|h)?(?:m|g|l|s|mol|hz|pa)$|^(?:min|h|d|yr|ft|ind|ppt|ppm)$/;
// only in a compound ("n/m²"): "n" is a count, a lone one is a letter
const COMPOUND_ONLY = new Set(['n', 'no', '1']);

function tokenOk(tok: string, compound: boolean): boolean {
  if (compound && (COMPOUND_ONLY.has(tok) || /^\d+$/.test(tok))) return true;
  const m = /^([a-zµ°%]+?)(?:\^?[-+]?\d+|[²³¹⁻]+)?$/.exec(tok);
  if (!m) return false;
  const w = m[1];
  if (w === '%' || w === '°') return true;
  return isWord(w) || SYMBOL.test(w);
}

const NOUN = /^[a-z][a-z-]*(?: [a-z][a-z-]*)?$/;

function phrase(t: string): boolean {
  const s = t.toLowerCase();
  // "larvae per milliliter", "spores per milliliter", "number per cubic metres": a thing counted, then a unit
  const per = /^(.+?)\s+per\s+(.+)$/.exec(s);
  if (per && (phrase(per[1]) || NOUN.test(per[1])) && phrase(per[2])) return true;
  // "nanomoles per liter (nmol/L)": the words, and the abbreviation after them is a unit too
  const paren = /^(.*\S)\s*\(([^()]+)\)$/.exec(s);
  if (paren) return phrase(paren[1]) && (phrase(paren[2]) || normaliseUnit(paren[2]) !== undefined);
  const toks = s.split(/\s+per\s+|[\s/·*]+/).filter((x) => x !== '');
  if (toks.length === 0) return false;
  const compound = toks.length > 1;
  // at least one real unit word or symbol (a lone "1", "1000" or "n" is not a unit)
  return toks.every((tk) => tokenOk(tk, compound)) && toks.some((tk) => !COMPOUND_ONLY.has(tk) && !/^\d+$/.test(tk));
}

/** Escapes such as ² that an export wrote as text are the character they stand for. */
export const decodeUnitText = (t: string): string => t.replace(/\\u([0-9a-fA-F]{4})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16))).replace(/\s+/g, ' ').trim();

export function unitCellKind(raw: string): UnitCellKind | undefined {
  const t = decodeUnitText(raw);
  if (t === '' || /[[\]]/.test(t) || t.length > 60) return undefined;
  if (t === 'UTC') return 'utc';
  if (NEUTRAL.test(t) || FORMAT.test(t)) return 'neutral';
  if (ERDDAP_ANGLES.has(t)) return 'unit';
  if (normaliseUnit(t) !== undefined) return 'unit';
  return phrase(t) ? 'unit' : undefined;
}

/** Two spellings of one unit ("degC" and "degree_C", "µg/L" and "ug/l") have the same key. */
export const unitKey = (raw: string): string => {
  const t = decodeUnitText(raw);
  return normaliseUnit(t) ?? cleanUnitText(t);
};
