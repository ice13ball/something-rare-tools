// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ColumnProposal, RawCell, RawRow } from '../types';
import { foldDiacritics, headerKey } from './vocab';

/*
 * A date written in separate Year, Month and Day columns (`1998, 9, 17`).
 *
 * Found by NAME and by VALUES together, never by position: three columns that stand next to each other are not a date because their numbers fit (`Year, Quarter, Haul`, `Year, Net, Tow`, `Year`
 * beside two species columns all fit), so a set is only what the headers say, in English, Polish, German or French:
 *   year   Year, yyyy, Rok, Jahr, Année         whole numbers from 1700 to next year
 *   month  Month, mm, Miesiąc, Monat, Mois      whole numbers 1..12, or a month name (Sep, wrz, Sept., mars, Okt)
 *   day    Day, dd, Dzień, Tag, Jour            whole numbers 1..31
 * `mm` and `dd` (which can be millimetres) count only beside a year column named `yyyy`; a lone Year, and a Year with a month column that does not say month, are not a date.
 * A column that says month or day but holds other values (a `Tag` of text) does not count, and the date is then what the others make. A real, completely filled Date column wins: nothing is
 * marked (a contradiction between the two is another check's job); a Date column with blanks leaves the parts to the rows it does not fill. A missing day is a month, a missing month is a year,
 * and the date is never made up (dataset.ts composes it; an impossible date such as 1998-2-30 is reported on its line, not shifted). Hour and minute columns are not read here.
 */

export type DatePart = 'year' | 'month' | 'day';

const PREFIX = '(?:(?:sample|sampling|collection|start|event|obs|observation)\\s)?';
const SUFFIX = '(?:\\s(?:of\\s)?(?:sampling|sample|collection|start))?';
const YEAR_WORDS = 'year|annee|jahr|rok';
const MONTH_WORDS = 'month|mois|monat|miesiac';
const DAY_WORDS = 'day|jour|tag|dzien';
const YEAR_NAME = new RegExp(`^${PREFIX}(?:${YEAR_WORDS})${SUFFIX}$`);
const MONTH_NAME = new RegExp(`^${PREFIX}(?:${MONTH_WORDS})${SUFFIX}$`);
const DAY_NAME = new RegExp(`^${PREFIX}(?:${DAY_WORDS})(?:\\s(?:of\\s)?(?:sampling|sample|collection|start|month))?$`);

const isBlankCell = (c: RawCell): boolean => c === null || (typeof c === 'string' && c.trim() === '');
const whole = (c: RawCell): number | undefined => {
  if (isBlankCell(c)) return undefined;
  if (typeof c === 'number') return Number.isInteger(c) ? c : undefined;
  const t = String(c).trim();
  return /^\d{1,4}(\.0+)?$/.test(t) ? Number(t) : undefined;
};

/** Prefixes of month names (folded, lower case) in English, French, German and Polish: longer ones first. */
const MONTH_PREFIXES: readonly (readonly [string, number])[] = [
  ['juin', 6], ['juil', 7], ['jan', 1], ['sty', 1], ['feb', 2], ['fev', 2], ['lut', 2], ['mar', 3], ['apr', 4], ['avr', 4], ['kwi', 4], ['may', 5], ['mai', 5], ['maj', 5],
  ['jun', 6], ['cze', 6], ['jul', 7], ['lip', 7], ['aug', 8], ['aou', 8], ['sie', 8], ['sep', 9], ['wrz', 9], ['oct', 10], ['okt', 10], ['paz', 10], ['nov', 11], ['lis', 11],
  ['dec', 12], ['dez', 12], ['gru', 12],
];

/** The month a cell of a Month column says: a whole number 1..12, or the name of a month ("Sep", "Sept.", "wrz", "mars", "Okt"). */
export function monthOf(c: RawCell): number | undefined {
  if (isBlankCell(c)) return undefined;
  const n = whole(c);
  if (n !== undefined) return n >= 1 && n <= 12 ? n : undefined;
  if (typeof c !== 'string') return undefined;
  const t = foldDiacritics(c.trim().toLowerCase()).replace(/\.$/, '');
  if (!/^[a-z]{3,12}$/.test(t)) return undefined;
  return MONTH_PREFIXES.find(([p]) => t.startsWith(p))?.[1];
}

/** The whole number a cell of a Year or Day column says, or undefined. */
export const wholeOf = whole;

interface Col {
  index: number;
  key: string;
  values: (number | undefined)[];
  filled: number;
}

const daysIn = (y: number, m: number): number => new Date(Date.UTC(2000 + (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 0 : 1), m, 0)).getUTCDate();

export interface DatePartsFound {
  parts: Map<number, { part: DatePart }>;
}

/** The year / month / day columns of a sheet, or undefined. `proposals` are the sheet's proposals so far (a completely filled date column among them wins). */
export function findDateParts(proposals: readonly ColumnProposal[], rows: readonly RawRow[], today = new Date()): DatePartsFound | undefined {
  const sample = rows.slice(0, 5000);
  const nextYear = today.getUTCFullYear() + 1;
  const complete = (index: number): boolean => sample.length > 0 && sample.every((r) => !isBlankCell(r.cells[index] ?? null));
  if (proposals.some((p) => (p.role.kind === 'date' || p.role.kind === 'datetime') && complete(p.index))) return undefined;
  const free = (p: ColumnProposal): boolean => p.role.kind === 'variable' || p.role.kind === 'ignore';
  const cols = new Map<number, Col>();
  for (const p of proposals) {
    if (!free(p)) continue;
    const key = headerKey(p.cleanHeader);
    const monthLike = MONTH_NAME.test(key) || /^(?:mm|mon)$/.test(key);
    const values = sample.map((r) => {
      const c = r.cells[p.index] ?? null;
      return monthLike ? monthOf(c) : whole(c);
    });
    cols.set(p.index, { index: p.index, key, values, filled: sample.filter((r) => !isBlankCell(r.cells[p.index] ?? null)).length });
  }
  const share = (c: Col, lo: number, hi: number): number => (c.filled === 0 ? 0 : c.values.filter((v) => v !== undefined && v >= lo && v <= hi).length / c.filled);
  // the year must be there on nearly every row and in range; month and day only have to be mostly what they say (the cells that are not are reported row by row)
  const isYear = (c: Col): boolean => share(c, 1700, nextYear) >= 0.95 && c.filled >= sample.length * 0.9;
  const isMonth = (c: Col): boolean => share(c, 1, 12) >= 0.5;
  const isDay = (c: Col): boolean => share(c, 1, 31) >= 0.5;
  const find = (re: RegExp, ok: (c: Col) => boolean): Col | undefined => [...cols.values()].find((c) => re.test(c.key) && ok(c));

  const abbreviated = find(/^yyyy$/, isYear);
  const y = find(YEAR_NAME, isYear) ?? abbreviated;
  // mm and dd can be millimetres: only beside a year called yyyy
  const m = find(MONTH_NAME, isMonth) ?? (abbreviated !== undefined ? find(/^mm$/, isMonth) : undefined);
  const d = find(DAY_NAME, isDay) ?? (abbreviated !== undefined ? find(/^dd$/, isDay) : undefined);
  if (y === undefined || m === undefined) return undefined;
  // the combination has to be a real date on at least half of the rows that have a year
  let seen = 0;
  let good = 0;
  sample.forEach((_, i) => {
    const yy = y.values[i];
    if (yy === undefined) return;
    seen++;
    const mm = m.values[i];
    const dd = d?.values[i];
    if (mm === undefined) good += dd === undefined ? 1 : 0;
    else if (mm >= 1 && mm <= 12 && (dd === undefined || dd <= daysIn(yy, mm))) good++;
  });
  if (seen === 0 || good / seen < 0.5) return undefined;
  const parts = new Map<number, { part: DatePart }>();
  parts.set(y.index, { part: 'year' });
  parts.set(m.index, { part: 'month' });
  if (d !== undefined) parts.set(d.index, { part: 'day' });
  return { parts };
}
