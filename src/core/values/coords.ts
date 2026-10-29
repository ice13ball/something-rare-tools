// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RawCell } from '../types';
import { countDecimals } from './numbers';

export type CoordinateForm = 'decimal' | 'dm' | 'dms';
export type CoordinateResult =
  | { value: number; decimals: number; form: CoordinateForm; normalised360?: boolean }
  | { error: 'unparseable' | 'out-of-range'; raw: string };

// The ranges are parsing domains only; the QC citation for them lives in the rules layer.
const LAT_MAX = 90;
const LON_MIN = -180;
const LON_MAX = 360;
const DECIMALS_CAP = 6;

function normaliseMarks(s: string): string {
  return s
    .trim()
    .replace(/[′’‘`´]/g, "'")
    .replace(/[″”“]/g, '"')
    .replace(/[º˚]/g, '°')
    .replace(/''/g, '"');
}

function bad(raw: string, error: 'unparseable' | 'out-of-range' = 'unparseable'): CoordinateResult {
  return { error, raw };
}

/**
 * Range check and (180, 360] normalisation. For a plain decimal the subtraction is exact in decimal
 * arithmetic, so the result is re-expressed with the written number of decimals (350.123 -> -9.877,
 * not -9.877000000000010). DM/DMS values are not finite decimals, so they are left as computed.
 */
function finish(value: number, decimals: number, form: CoordinateForm, axis: 'lat' | 'lon', raw: string): CoordinateResult {
  if (value === 0) value = 0; // -0 -> 0
  if (axis === 'lat') {
    if (Math.abs(value) > LAT_MAX) return bad(raw, 'out-of-range');
    return { value, decimals, form };
  }
  if (value < LON_MIN || value > LON_MAX) return bad(raw, 'out-of-range');
  if (value > 180) {
    let v = value - 360;
    if (form === 'decimal' && decimals <= 100) v = Number(v.toFixed(decimals));
    if (v === 0) v = 0;
    return { value: v, decimals, form, normalised360: true };
  }
  return { value, decimals, form };
}

/**
 * Parses a latitude or longitude cell.
 *
 * Accepted: decimals ('16.5', '-0.5', '.5', '+3'), degrees + decimal minutes ("12° 34.567'", "54°21.500'",
 * '12°34.567°', '16 27.92 E'), degrees + minutes + seconds ('S 12° 3\' 4"', '12°03\'04.5"S', '12 3 4'),
 * hemisphere letters N/S/E/W before or after (W and S negate), unicode primes and typographic quotes.
 * The decimal separator is '.' (or ',' when decimalComma); the other one is rejected.
 *
 * Unparseable: minutes or seconds >= 60; a minus sign together with any hemisphere letter (a contradiction,
 * including '+' with S/W); a hemisphere letter on both ends; a letter that belongs to the other axis
 * (E/W on a latitude, N/S on a longitude); exponent forms.
 * Latitude must be in [-90, 90]; longitude in [-180, 360], with (180, 360] shifted by -360 and flagged
 * normalised360. Anything outside is 'out-of-range'.
 *
 * `decimals`: decimal form = digits after the separator; DM = ceil(minuteDecimals + log10(60)); DMS =
 * ceil(secondDecimals + log10(3600)); both capped at 6.
 */
export function parseCoordinate(raw: RawCell, axis: 'lat' | 'lon', decimalComma: boolean): CoordinateResult {
  if (raw === null) return bad('');
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return bad(String(raw));
    return finish(raw, countDecimals(String(raw)), 'decimal', axis, String(raw));
  }

  let s = normaliseMarks(raw);
  let hemi: string | undefined;
  const lead = /^([NSEW])\s*/i.exec(s);
  const trail = /\s*([NSEW])$/i.exec(s);
  if (lead && trail) return bad(raw);
  if (lead) {
    hemi = lead[1].toUpperCase();
    s = s.slice(lead[0].length);
  } else if (trail) {
    hemi = trail[1].toUpperCase();
    s = s.slice(0, s.length - trail[0].length);
  }
  if (hemi && (axis === 'lat' ? 'NS' : 'EW').indexOf(hemi) < 0) return bad(raw);

  let sign: '+' | '-' | undefined;
  const signMatch = /^([+-])\s*/.exec(s);
  if (signMatch) {
    sign = signMatch[1] as '+' | '-';
    s = s.slice(signMatch[0].length);
  }
  if (sign === '-' && hemi) return bad(raw);
  const negativeHemi = hemi === 'S' || hemi === 'W';
  if (sign === '+' && negativeHemi) return bad(raw);
  const negative = sign === '-' || negativeHemi;
  const apply = (mag: number) => (negative ? -mag : mag);

  const sep = decimalComma ? ',' : '\\.';
  const num = `\\d+(?:${sep}\\d*)?`;
  const toNumber = (t: string) => Number(t.replace(',', '.'));
  const fracDigits = (t: string) => {
    const i = t.search(decimalComma ? /,/ : /\./);
    return i < 0 ? 0 : t.length - i - 1;
  };

  // plain decimal, optionally followed by a degree sign
  const dec = new RegExp(`^(${num}|${sep}\\d+)°?$`).exec(s);
  if (dec) {
    const text = dec[1];
    const mag = toNumber(text);
    if (!Number.isFinite(mag)) return bad(raw);
    return finish(apply(mag), fracDigits(text), 'decimal', axis, raw);
  }

  // degrees, minutes[, seconds]; degrees must be separated from minutes by a degree sign or whitespace
  const dms = new RegExp(
    `^(\\d+)(?:\\s*°\\s*|\\s+)(${num})(?:\\s*['°]\\s*(?:(${num})\\s*"?)?|\\s+(${num})\\s*"?)?$`,
  ).exec(s);
  if (!dms) return bad(raw);
  const deg = Number(dms[1]);
  const minText = dms[2];
  const secText = dms[3] ?? dms[4];
  const min = toNumber(minText);
  if (min >= 60) return bad(raw);
  if (secText === undefined) {
    const decimals = Math.min(DECIMALS_CAP, Math.ceil(fracDigits(minText) + Math.log10(60)));
    return finish(apply(deg + min / 60), decimals, 'dm', axis, raw);
  }
  if (fracDigits(minText) > 0) return bad(raw); // fractional minutes AND seconds
  const sec = toNumber(secText);
  if (sec >= 60) return bad(raw);
  const decimals = Math.min(DECIMALS_CAP, Math.ceil(fracDigits(secText) + Math.log10(3600)));
  return finish(apply(deg + min / 60 + sec / 3600), decimals, 'dms', axis, raw);
}

/* ---------- hemisphere letters kept in a column of their own ---------- */

const HEMISPHERE_WORDS: Readonly<Record<string, 'N' | 'S' | 'E' | 'W'>> = { n: 'N', s: 'S', e: 'E', w: 'W', north: 'N', south: 'S', east: 'E', west: 'W' };

/** The hemisphere a cell names: N, S, E, W or the word North, South, East, West (any case, a trailing full stop allowed); undefined for anything else. */
export function hemisphereLetter(raw: RawCell): 'N' | 'S' | 'E' | 'W' | undefined {
  if (typeof raw !== 'string') return undefined;
  return HEMISPHERE_WORDS[raw.trim().replace(/\.$/, '').toLowerCase()];
}

export interface HemispherePairing {
  /** The cell to hand to parseCoordinate: the written value, made negative when the letter is S or W. */
  cell: RawCell;
  /** 'conflict': the value and the letter disagree (already negative, a letter of the other axis, or an own letter that says the opposite). 'missing': a filled value with no usable letter. The cell is then returned as written. */
  issue?: 'conflict' | 'missing';
}

/**
 * Combines an unsigned coordinate cell with the cell of its hemisphere column. S (latitude) and W (longitude) negate the value, N and E keep it;
 * the value may be a decimal or degrees and minutes. A value that already carries a sign or a letter of its own is never negated a second time:
 * a negative value (with any letter), a letter of the other axis or an own letter against the column's one is a 'conflict', and a blank or
 * unknown letter is 'missing'; in all three the value is kept as written. The caller passes a filled coordinate cell.
 */
export function pairHemisphere(cell: RawCell, hemi: RawCell, axis: 'lat' | 'lon'): HemispherePairing {
  const letter = hemisphereLetter(hemi);
  if (letter === undefined) return { cell, issue: 'missing' };
  if ((axis === 'lat' ? 'NS' : 'EW').indexOf(letter) < 0) return { cell, issue: 'conflict' };
  const negative = letter === 'S' || letter === 'W';
  if (typeof cell === 'number') {
    if (cell < 0) return { cell, issue: 'conflict' };
    return { cell: negative ? -cell : cell };
  }
  if (cell === null) return { cell };
  const text = normaliseMarks(cell);
  if (/^[-−–]/.test(text)) return { cell, issue: 'conflict' };
  const own = /^([NSEW])\s*\d|\d\s*([NSEW])$/i.exec(text);
  if (own) {
    const ownLetter = (own[1] ?? own[2]).toUpperCase();
    return ownLetter === letter ? { cell } : { cell, issue: 'conflict' };
  }
  const unsigned = text.replace(/^\+\s*/, '');
  return { cell: negative ? `-${unsigned}` : unsigned };
}
