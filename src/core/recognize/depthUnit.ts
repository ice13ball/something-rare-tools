// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

/**
 * The unit of a depth column. Darwin Core minimumDepthInMeters / maximumDepthInMeters are metres, so a depth in another unit must never reach them
 * unconverted. Only units with an EXACT definition in metres are converted (international fathom 1.8288 m, international foot 0.3048 m, kilometre,
 * centimetre); any other unit stays a block (CONV-DEPTH-UNIT). The recogniser keeps the unit on the role, /check and /convert read it from there.
 */

export interface DepthUnitFactor {
  /** The name the findings print. */
  name: 'fathom' | 'foot' | 'kilometre' | 'centimetre';
  /** The factor to metres as the exact decimal text. */
  factor: string;
  /** numerator / 10^denominatorDigits is the factor. */
  numerator: bigint;
  denominatorDigits: number;
}

const FATHOM: DepthUnitFactor = { name: 'fathom', factor: '1.8288', numerator: 18288n, denominatorDigits: 4 };
const FOOT: DepthUnitFactor = { name: 'foot', factor: '0.3048', numerator: 3048n, denominatorDigits: 4 };
const KILOMETRE: DepthUnitFactor = { name: 'kilometre', factor: '1000', numerator: 1000n, denominatorDigits: 0 };
const CENTIMETRE: DepthUnitFactor = { name: 'centimetre', factor: '0.01', numerator: 1n, denominatorDigits: 2 };

const FACTORS = new Map<string, DepthUnitFactor>([
  ['fm', FATHOM],
  ['fms', FATHOM],
  ['fth', FATHOM],
  ['fthm', FATHOM],
  ['fthms', FATHOM],
  ['ftm', FATHOM],
  ['fathom', FATHOM],
  ['fathoms', FATHOM],
  ['ft', FOOT],
  ['feet', FOOT],
  ['foot', FOOT],
  ['km', KILOMETRE],
  ['kilometre', KILOMETRE],
  ['kilometres', KILOMETRE],
  ['kilometer', KILOMETRE],
  ['kilometers', KILOMETRE],
  ['cm', CENTIMETRE],
  ['centimetre', CENTIMETRE],
  ['centimetres', CENTIMETRE],
  ['centimeter', CENTIMETRE],
  ['centimeters', CENTIMETRE],
]);

const METRES = new Set(['m', 'metre', 'metres', 'meter', 'meters']);

/**
 * Abbreviations of a LENGTH unit a depth column may carry in its name that are NOT converted: they are ambiguous or rare ('f' is feet or fathoms, 'dm' / 'mm' /
 * 'yd' / 'mi' / 'nm' are decimetre, millimetre, yard, mile, nautical mile or nanometre). On a depth header they are a unit, never metres, so the column blocks until its unit is said.
 */
const AMBIGUOUS = new Set(['f', 'fa', 'fat', 'dm', 'mm', 'yd', 'yds', 'mi', 'nm', 'nmi']);

const clean = (unit: string): string => unit.trim().toLowerCase().replace(/\./g, '');

/** Is this unit text metres? */
export const isMetreUnit = (unit: string): boolean => METRES.has(clean(unit));

/** The exact factor of a unit that is converted to metres, or undefined (metres, or a unit that is not converted). */
export function depthUnitFactor(unit: string | undefined): DepthUnitFactor | undefined {
  return unit === undefined ? undefined : FACTORS.get(clean(unit));
}

/**
 * The unit a depth header states in its NAME, without brackets: 'Depth_fm', 'depth_ft_max', 'Depth feet', 'min_depth_km'. Only the tokens AFTER the depth word are read, and a
 * token is a unit only when it is a unit abbreviation ('depth_mean', 'Depth_flag', 'depth_from', 'Depth_min' are not). Returns the token as written, or undefined.
 */
export function depthSuffixUnit(header: string): string | undefined {
  const tokens = header
    .trim()
    .split(/[\s_]+/)
    .filter((t) => t !== '');
  const at = tokens.findIndex((t) => /^(depth|tiefe|glebokosc|głębokość|profondeur|profundidad)$/i.test(t) || /depth$/i.test(t));
  if (at < 0) return undefined;
  for (const t of tokens.slice(at + 1)) {
    const k = clean(t);
    if (FACTORS.has(k) || AMBIGUOUS.has(k)) return t;
  }
  return undefined;
}

/**
 * The value text times the factor, exact (decimal arithmetic on the digits, no floating point): '31.5' fathoms is '57.6072'. The text must be a plain decimal
 * (sourceNumberText gives that); anything else returns undefined. Trailing zeros are dropped, a result of zero is '0'.
 */
export function convertDepthText(plain: string, f: DepthUnitFactor): string | undefined {
  const m = /^([+-]?)(\d*)\.?(\d*)$/.exec(plain.trim());
  if (!m || (m[2] === '' && m[3] === '')) return undefined;
  const digits = `${m[2]}${m[3]}` || '0';
  const scale = m[3].length + f.denominatorDigits;
  const product = (BigInt(digits) * f.numerator).toString().padStart(scale + 1, '0');
  const whole = product.slice(0, product.length - scale);
  const fraction = product.slice(product.length - scale).replace(/0+$/, '');
  const body = fraction === '' ? whole : `${whole}.${fraction}`;
  return m[1] === '-' && /[1-9]/.test(body) ? `-${body}` : body;
}
