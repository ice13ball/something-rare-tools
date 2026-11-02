// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ColumnProposal, RawCell, RawRow } from '../types';
import { headerKey } from './vocab';

/*
 * A date written in separate Year, Month and Day columns (`1998, 9, 17`).
 *
 * Read from the VALUES and the position together, never from a header alone:
 *   year   whole numbers from 1700 to next year (a column of years cannot be told from a column of counts by its numbers alone, so the name or the neighbours must back it)
 *   month  whole numbers 1..12
 *   day    whole numbers 1..31
 * A set is the year column with a month column (a lone Year is a year, not a date), and a day column when there is one. It is found
 *   by name   the three headers say so, in English, Polish, German or French (year / rok / Jahr / année, month / miesiąc / Monat / mois, day / dzień / Tag / jour), or
 *   by place  the three columns stand next to each other in the order year, month, day (the day column is required: a year beside one small-number column is a count of something
 *             else far too often), with no unit in their headers, their values fit and spread (the month and the day take at least two values: a set of constants is a code, not a date),
 *             and the combination is a real calendar date on at least 90 % of the rows.
 * A real Date column beside the set wins: nothing is marked then (a contradiction between the two is another check's job). A missing day is a month, a missing month is a year, and
 * the date is never made up (dataset.ts composes it; an impossible date such as 1998-2-30 is reported on its line, not shifted).
 * Hour and minute columns are not read here.
 */

export type DatePart = 'year' | 'month' | 'day';

const YEAR_NAME = /^(?:(?:sample|sampling|collection|start|event|obs|observation)\s)?(?:year|yr|yyyy|annee|jahr|rok|anno)(?:\s(?:of\s)?(?:sampling|sample|collection|start))?$/;
const MONTH_NAME = /^(?:(?:sample|sampling|collection|start|event|obs|observation)\s)?(?:month|mon|mm|mois|monat|miesiac|mes)(?:\s(?:of\s)?(?:sampling|sample|collection|start))?$/;
const DAY_NAME = /^(?:(?:sample|sampling|collection|start|event|obs|observation)\s)?(?:day|dd|jour|tag|dzien)(?:\s(?:of\s)?(?:sampling|sample|collection|start|month))?$/;
const ID_NAME = /(?:^|\s)(?:id|code|no|nr|num|number|count|n|rep|replicate)$/;

const isBlankCell = (c: RawCell): boolean => c === null || (typeof c === 'string' && c.trim() === '');
const whole = (c: RawCell): number | undefined => {
  if (isBlankCell(c)) return undefined;
  if (typeof c === 'number') return Number.isInteger(c) ? c : undefined;
  const t = String(c).trim();
  return /^\d{1,4}(\.0+)?$/.test(t) ? Number(t) : undefined;
};

interface Col {
  index: number;
  key: string;
  values: (number | undefined)[];
  /** every filled cell is a whole number */
  clean: boolean;
  filled: number;
}

const daysIn = (y: number, m: number): number => new Date(Date.UTC(2000 + (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 0 : 1), m, 0)).getUTCDate();

export interface DatePartsFound {
  parts: Map<number, { part: DatePart; byName: boolean }>;
}

/** The year / month / day columns of a sheet, or undefined. `proposals` are the sheet's proposals so far (a real date column among them wins). */
export function findDateParts(proposals: readonly ColumnProposal[], rows: readonly RawRow[], today = new Date()): DatePartsFound | undefined {
  if (proposals.some((p) => p.role.kind === 'date' || p.role.kind === 'datetime')) return undefined;
  const nextYear = today.getUTCFullYear() + 1;
  const free = (p: ColumnProposal): boolean => p.role.kind === 'variable' || p.role.kind === 'ignore';
  const sample = rows.slice(0, 5000);
  const cols = new Map<number, Col>();
  const headerOf = new Map(proposals.map((p) => [p.index, p.header]));
  for (const p of proposals) {
    if (!free(p)) continue;
    const values = sample.map((r) => whole(r.cells[p.index] ?? null));
    const filled = sample.filter((r) => !isBlankCell(r.cells[p.index] ?? null)).length;
    const clean = filled > 0 && values.filter((v) => v !== undefined).length === filled;
    cols.set(p.index, { index: p.index, key: headerKey(p.cleanHeader), values, clean, filled });
  }
  // `strict` (a set found by place alone): every filled cell is a whole number in range. Otherwise (the names say so) 95 % of the filled cells are, and the rest are reported row by row (ROW-DATE-UNPARSEABLE)
  const fits = (c: Col | undefined, lo: number, hi: number, strict: boolean): c is Col => {
    if (c === undefined || c.filled === 0) return false;
    if (strict) return c.clean && c.values.every((v) => v === undefined || (v >= lo && v <= hi));
    return c.values.filter((v) => v !== undefined && v >= lo && v <= hi).length >= c.filled * 0.95;
  };
  const isYear = (c: Col | undefined, strict = false): c is Col => fits(c, 1700, nextYear, strict) && c.filled >= sample.length * 0.9;
  const isMonth = (c: Col | undefined, strict = false): c is Col => fits(c, 1, 12, strict);
  const isDay = (c: Col | undefined, strict = false): c is Col => fits(c, 1, 31, strict);
  const distinct = (c: Col): number => new Set(c.values.filter((v) => v !== undefined)).size;
  // the share of rows (those with a year) whose combination is a real calendar date, a missing month or day being a coarser date
  const calendarShare = (y: Col, m: Col, d: Col | undefined): number => {
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
    return seen === 0 ? 0 : good / seen;
  };
  const byName = (re: RegExp, ok: (c: Col | undefined) => c is Col): Col | undefined => [...cols.values()].find((c) => re.test(c.key) && ok(c));
  const make = (y: Col, m: Col, d: Col | undefined, named: boolean): DatePartsFound => {
    const parts = new Map<number, { part: DatePart; byName: boolean }>();
    parts.set(y.index, { part: 'year', byName: named });
    parts.set(m.index, { part: 'month', byName: named });
    if (d !== undefined) parts.set(d.index, { part: 'day', byName: named });
    return { parts };
  };

  // by name: all the names say so and the values fit
  const y1 = byName(YEAR_NAME, isYear);
  const m1 = byName(MONTH_NAME, isMonth);
  const d1 = byName(DAY_NAME, isDay);
  if (y1 !== undefined && m1 !== undefined && calendarShare(y1, m1, d1) >= 0.5) return make(y1, m1, d1, true);

  // by place: next to each other in the order year, month, day
  for (const p of proposals) {
    const y = cols.get(p.index);
    if (!isYear(y, true) || ID_NAME.test(y.key)) continue;
    const m = cols.get(p.index + 1);
    if (!isMonth(m, true) || ID_NAME.test(m.key) || distinct(m) < 2) continue;
    // by place alone the day column is required (a year next to one small-number column is far too common), and none of the three has a unit in its header (a species count [ind/m3] is not a year)
    const d = cols.get(p.index + 2);
    if (!isDay(d, true) || ID_NAME.test(d.key) || distinct(d) < 2) continue;
    if ([y, m, d].some((c) => /[[(]/.test(headerOf.get(c.index) ?? ''))) continue;
    if (calendarShare(y, m, d) < 0.9) continue;
    return make(y, m, d, false);
  }
  return undefined;
}
