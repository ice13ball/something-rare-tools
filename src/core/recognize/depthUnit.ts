// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

/**
 * The unit of a depth column. Darwin Core minimumDepthInMeters / maximumDepthInMeters are metres, so a depth in another unit must never reach them
 * unconverted. Only units with an EXACT definition in metres are converted (international fathom 1.8288 m, international foot 0.3048 m, kilometre); any other
 * non-metre unit blocks (CONV-DEPTH-UNIT). A centimetre depth is NOT converted: on a plain depth column it is far more likely a depth in a sediment core, which has its own
 * role and its own advice. The unit is read from the header whatever role chose the column (build.ts colsOf), so a page path cannot skip it.
 */

export interface DepthUnitFactor {
  /** The symbol the findings print ("1 fm = 1.8288 m"). */
  symbol: 'fm' | 'ft' | 'km';
  /** The factor to metres as the exact decimal text. */
  factor: string;
  /** numerator / 10^denominatorDigits is the factor. */
  numerator: bigint;
  denominatorDigits: number;
}

const FATHOM: DepthUnitFactor = { symbol: 'fm', factor: '1.8288', numerator: 18288n, denominatorDigits: 4 };
const FOOT: DepthUnitFactor = { symbol: 'ft', factor: '0.3048', numerator: 3048n, denominatorDigits: 4 };
const KILOMETRE: DepthUnitFactor = { symbol: 'km', factor: '1000', numerator: 1000n, denominatorDigits: 0 };

const FACTORS = new Map<string, DepthUnitFactor>([
  ...['fm', 'fms', 'fth', 'fths', 'fthm', 'fthms', 'ftm', 'ftms', 'fathom', 'fathoms', 'faden', 'brasse', 'brasses'].map((k) => [k, FATHOM] as const),
  ...['ft', 'fts', 'feet', 'foot'].map((k) => [k, FOOT] as const),
  ...['km', 'kilometre', 'kilometres', 'kilometer', 'kilometers'].map((k) => [k, KILOMETRE] as const),
]);

const METRES = new Set(['m', 'metre', 'metres', 'meter', 'meters']);

/**
 * Length units a depth column may carry that are NOT converted: ambiguous ('f' is feet or fathoms) or without a use here. A depth header that states one of them is a depth in that unit,
 * never metres, so the column blocks until its unit is said. (cm and mm stay here: a centimetre depth is usually a sediment depth.)
 */
const BLOCKING = new Set(['f', 'fa', 'fat', 'cm', 'mm', 'dm', 'centimetre', 'centimetres', 'centimeter', 'centimeters', 'millimetre', 'millimetres', 'decimetre', 'yd', 'yds', 'yard', 'yards', 'in', 'inch', 'inches', 'mi', 'mile', 'miles', 'nm', 'nmi']);
/** Words that follow the unit in a name without being part of it ('Depth_ft_max'). */
const BOUND_WORDS = new Set(['min', 'max', 'minimum', 'maximum', 'top', 'bottom', 'upper', 'lower', 'start', 'end', 'from', 'to', 'begin', 'beg', 'mean', 'avg', 'average', 'median', 'range']);
const DEPTH_WORD = /^(?:.*depth|tiefe|glebokosc|głębokość|profondeur|profundidad|sounding)$/i;

const clean = (unit: string): string => unit.trim().toLowerCase().replace(/[.\s]/g, '');

/** Is this unit text metres? */
export const isMetreUnit = (unit: string): boolean => METRES.has(clean(unit));

/** The exact factor of a unit that is converted to metres, or undefined (metres, or a unit that is not converted). */
export function depthUnitFactor(unit: string | undefined): DepthUnitFactor | undefined {
  return unit === undefined ? undefined : FACTORS.get(clean(unit));
}

const isUnit = (k: string): boolean => METRES.has(k) || FACTORS.has(k) || BLOCKING.has(k);

/**
 * The unit a header states for its depth, in whatever form: in brackets ('Depth (fth)', 'Depth [km]'), after any separator ('Depth_ft', 'Depth, ft', 'Depth-ft', 'Depth/ft', 'Depth.ft',
 * 'Depth feet', 'depthFt'), before the depth word ('ft_depth'), or a header that is the unit word ('Fathoms'). A unit token is not one when a number stands before it ('Depth at 10 km',
 * 'Depth_km_offshore' has other words after it, see below).
 *
 * Converting is for the exact forms only: the unit ends the name, or only a bound or statistic word follows it ('Depth_ft_max', 'Depth_fm_mean'). A unit with any other word after it
 * ('Depth_ft_corrected', 'Depth ft sonar', 'Depth (ft) sonar', 'depth_cm_bsf', 'Depth_ft_1') is returned together with those words ('ft sonar'): no exact factor, so the column BLOCKS and
 * the message shows what the header said. Two different units in one name ('depth_m_ft', 'Depth (m or ft)') are returned joined ('m/ft'): blocked too. A name that states no unit returns
 * undefined ('depth_mean', 'Depth_flag', 'depth_from').
 */
export function depthSuffixUnit(header: string): string | undefined {
  // the ODV / OPeNDAP type suffix ('Depth_cm<Float32>') and quotes are not part of the name
  const name = header.trim().replace(/^"(.*)"$/, '$1').replace(/<[A-Za-z][A-Za-z0-9]*>\s*$/, '').trim();
  // a bracket group at the end that is a unit; a remark ('(CTD)') there is cut off
  const group = /[[(]([^[\]()]*)[\])]\s*$/.exec(name);
  if (group) {
    const k = clean(group[1]);
    if (isUnit(k)) return group[1].trim().replace(/\.$/, '');
  }
  const tokens = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^\p{L}\p{N}µ]+/u)
    .filter((t) => t !== '');
  const afterNumber = (i: number): boolean => i > 0 && /^\d+$/.test(tokens[i - 1]);
  // 'in' and 'f' are also ordinary words / letters: a unit only as the last word of the name
  const weak = (t: string): boolean => ['in', 'f', 'fa', 'fat'].includes(clean(t));
  const units = tokens.map((t, i) => isUnit(clean(t)) && !afterNumber(i) && !(weak(t) && i !== tokens.length - 1));
  let u = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (units[i]) {
      u = i;
      break;
    }
  }
  if (u < 0) {
    // the unit before the depth word ('ft_depth')
    if (tokens.length >= 2 && isUnit(clean(tokens[0])) && tokens.slice(1).some((t) => DEPTH_WORD.test(t))) return tokens[0].replace(/\.$/, '');
    return undefined;
  }
  // the unit before the depth word ('ft_depth', 'fm_depth_max')
  if (u === 0 && tokens.length >= 2 && tokens.slice(1).some((t) => DEPTH_WORD.test(t)) && tokens.slice(1).every((t) => DEPTH_WORD.test(t) || BOUND_WORDS.has(t.toLowerCase()))) return tokens[0];
  const tail = tokens.slice(u + 1);
  const others = tokens.slice(0, u).filter((t, i) => units[i] && !weak(t) && clean(t) !== clean(tokens[u]));
  if (others.length > 0) return [...others, tokens[u]].join('/');
  if (METRES.has(clean(tokens[u])) || tail.every((t) => BOUND_WORDS.has(t.toLowerCase()))) return tokens[u];
  return [tokens[u], ...tail].join(' ');
}

/**
 * The unit of a depth header: a non-metre unit the NAME states wins (it blocks or converts); otherwise the unit another reader found (a bracket such as 'm a.s.l.') and, last, a metre
 * the name states.
 */
export function depthUnitOfHeader(header: string, other?: string): string | undefined {
  const named = depthSuffixUnit(header);
  return named !== undefined && !isMetreUnit(named) ? named : (other ?? named);
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
