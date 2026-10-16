// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RawCell } from '../types';

export const NA_TOKENS: readonly string[] = ['', 'NA', 'N/A', 'NaN', 'nan', 'nd', 'n.d.', 'ND', '-', '--', 'null', 'NULL'];

export type NumberResult =
  | { status: 'ok'; value: number; decimals: number }
  | { status: 'missing' }
  | { status: 'na-variant'; token: string }
  | { status: 'non-numeric'; token: string };

const DOT_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const COMMA_NUMBER = /^[+-]?(?:\d+,?\d*|,\d+)(?:e[+-]?\d+)?$/i;

/**
 * Number of decimals the TEXT shows: digits after the separator, shifted by the exponent
 * ('1e-3' -> 3, '1.5e-3' -> 4, '2.5e2' -> 0). Never derived from the parsed value.
 */
export function countDecimals(text: string): number {
  const m = /^[+-]?\d*(?:[.,](\d*))?(?:e([+-]?\d+))?$/i.exec(text.trim());
  if (!m) return 0;
  const frac = m[1] ? m[1].length : 0;
  const exp = m[2] ? parseInt(m[2], 10) : 0;
  return Math.max(0, frac - exp);
}

function isNaVariant(token: string): boolean {
  // separators only (spaces, dots, slashes, ...): a digit in the token makes it something else
  const letters = token.toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
  return /^(?:NA)+$/.test(letters);
}

/**
 * Parses one cell. Never rounds or reformats: `value` is the number as written, `decimals` counts the
 * digits the text shows (xlsx numeric cells: from String(n)).
 * Thousands separators are NOT accepted ('1,234.5' is non-numeric when decimalComma is false), and with
 * decimalComma true a '.' is not accepted either (a mixed file is reported, not guessed).
 */
export function parseNumber(raw: RawCell, decimalComma: boolean): NumberResult {
  if (raw === null) return { status: 'missing' };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { status: 'non-numeric', token: String(raw) };
    return { status: 'ok', value: raw, decimals: countDecimals(String(raw)) };
  }
  const token = raw.trim();
  if (NA_TOKENS.includes(token)) return { status: 'missing' };
  if (isNaVariant(token)) return { status: 'na-variant', token };
  if (!(decimalComma ? COMMA_NUMBER : DOT_NUMBER).test(token)) return { status: 'non-numeric', token };
  const value = Number(decimalComma ? token.replace(',', '.') : token);
  if (!Number.isFinite(value)) return { status: 'non-numeric', token };
  return { status: 'ok', value, decimals: countDecimals(token) };
}
