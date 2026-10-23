// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ParsedDate, RawCell } from '../types';

export interface TimeOfDay {
  hh: number;
  mm: number;
  /** present exactly when the time is written to the second */
  ss?: number;
  tz: 'utc' | 'offset' | 'unknown';
  /** canonical text appended after 'T' in an ISO string, e.g. '10:30', '10:30:15.5Z', '10:00+02:00' */
  text: string;
}
export type DateError = { error: 'unparseable'; raw: string };
/** Day/month order of a column of D/M/YYYY dates, as decided from all its cells by detectDayMonthOrder. */
export type DayMonthOrder = 'dmy' | 'mdy' | 'conflict' | 'unknown';
export interface ParseDateOptions {
  date1904: boolean;
  dateFormatted: boolean;
  /**
   * Column-level order for slash / dash D?M/YYYY dates whose two parts are both <= 12. 'dmy' / 'mdy' read them in
   * that order; 'conflict' (the column mixes unambiguous DD/MM and MM/DD cells) leaves EVERY such date with differing
   * parts unparseable, ambiguous or not. Absent: an ambiguous cell is unparseable.
   */
  order?: Exclude<DayMonthOrder, 'unknown'>;
  /** full year used for the YY-MM-DD pivot; defaults to the current UTC year (tests pin it) */
  currentYear?: number;
}

const MS_DAY = 86_400_000;
// All arithmetic is on UTC milliseconds / integer days; no local-time Date method is ever used,
// so the process time zone and DST cannot move a date.
const EPOCH_1900 = Date.UTC(1899, 11, 30);
const EPOCH_1904 = Date.UTC(1904, 0, 1);

const pad2 = (n: number) => String(n).padStart(2, '0');
const pad4 = (n: number) => String(n).padStart(4, '0');
const fail = (raw: string): DateError => ({ error: 'unparseable', raw });

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
function daysInMonth(y: number, m: number): number {
  return m === 2 ? (isLeap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
}
function validYmd(y: number, m: number, d: number): boolean {
  return y >= 1 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

function timeText(hh: number, mm: number, ss: number | undefined, frac: string, tzText: string): string {
  return `${pad2(hh)}:${pad2(mm)}${ss === undefined ? '' : ':' + pad2(ss) + frac}${tzText}`;
}

/**
 * Excel serial -> date. 1900 system: day 0 = 1899-12-30 (correct from 1900-03-01 on; Excel's fictitious
 * 1900-02-29 is not modelled). 1904 system: day 0 = 1904-01-01. The fraction becomes a time of day, rounded
 * to the nearest second (kills float noise); a time of exactly 00:00:00 is indistinguishable from a plain date and gets day precision; zero seconds -> minute
 * precision. tz is 'unknown'.
 * Throws RangeError for a non-finite serial or one outside years 1..9999.
 */
export function excelSerialToDate(serial: number, date1904: boolean): ParsedDate {
  if (!Number.isFinite(serial)) throw new RangeError(`invalid Excel serial: ${serial}`);
  let days = Math.floor(serial);
  let secs = Math.round((serial - days) * 86400);
  if (secs >= 86400) {
    days += 1;
    secs = 0;
  }
  const ms = (date1904 ? EPOCH_1904 : EPOCH_1900) + days * MS_DAY;
  const dt = new Date(ms);
  const year = dt.getUTCFullYear();
  if (!Number.isFinite(year) || year < 1 || year > 9999) throw new RangeError(`Excel serial out of range: ${serial}`);
  const date = `${pad4(year)}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
  if (secs === 0) return { iso: date, year, precision: 'day', tz: 'unknown' };
  const hh = Math.floor(secs / 3600);
  const mm = Math.floor((secs % 3600) / 60);
  const ss = secs % 60;
  return {
    iso: `${date}T${timeText(hh, mm, ss === 0 ? undefined : ss, '', '')}`,
    year,
    precision: ss === 0 ? 'minute' : 'second',
    tz: 'unknown',
  };
}

const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2})(\.\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/**
 * Time of day from text ('10:30', '10:30:15', '10:30Z', '10:00:00+02:00', fractional seconds kept in `text`)
 * or from an xlsx day fraction (number in [0, 1)).
 */
export function parseTimeOfDay(raw: RawCell): TimeOfDay | DateError {
  if (raw === null) return fail('');
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0 || raw >= 1) return fail(String(raw));
    const secs = Math.round(raw * 86400);
    if (secs >= 86400) return fail(String(raw));
    const hh = Math.floor(secs / 3600);
    const mm = Math.floor((secs % 3600) / 60);
    const ss = secs % 60;
    if (ss === 0) return { hh, mm, tz: 'unknown', text: timeText(hh, mm, undefined, '', '') };
    return { hh, mm, ss, tz: 'unknown', text: timeText(hh, mm, ss, '', '') };
  }
  const m = TIME_RE.exec(raw.trim());
  if (!m) return fail(raw);
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = m[3] === undefined ? undefined : Number(m[3]);
  if (hh > 23 || mm > 59 || (ss !== undefined && ss > 59)) return fail(raw);
  let tz: TimeOfDay['tz'] = 'unknown';
  let tzText = '';
  if (m[5]) {
    if (m[5].toUpperCase() === 'Z') {
      tz = 'utc';
      tzText = 'Z';
    } else {
      const digits = m[5].slice(1).replace(':', '');
      const oh = Number(digits.slice(0, 2));
      const om = digits.length > 2 ? Number(digits.slice(2)) : 0;
      if (oh > 14 || om > 59) return fail(raw);
      tz = 'offset';
      tzText = `${m[5][0]}${pad2(oh)}:${pad2(om)}`;
    }
  }
  const t: TimeOfDay = { hh, mm, tz, text: timeText(hh, mm, ss, m[4] ?? '', tzText) };
  if (ss !== undefined) t.ss = ss;
  return t;
}

function build(y: number, mo: number, d: number, time?: TimeOfDay, ambiguity?: 'yy-mm-dd'): ParsedDate {
  const out: ParsedDate = {
    iso: `${pad4(y)}-${pad2(mo)}-${pad2(d)}${time ? 'T' + time.text : ''}`,
    year: y,
    precision: time ? (time.ss === undefined ? 'minute' : 'second') : 'day',
    tz: time ? time.tz : 'unknown',
  };
  if (ambiguity) out.ambiguity = ambiguity;
  return out;
}

/** Parses the optional trailing time of a date string; undefined text means "no time part". */
function withTime(y: number, mo: number, d: number, timePart: string | undefined, raw: string): ParsedDate | DateError {
  if (!validYmd(y, mo, d)) return fail(raw);
  if (timePart === undefined) return build(y, mo, d);
  const t = parseTimeOfDay(timePart);
  if ('error' in t) return fail(raw);
  return build(y, mo, d, t);
}

const ISO_RE = /^(\d{4})-(\d{2})(?:-(\d{2})(?:[Tt ](.+))?)?$/;
const YY_RE = /^(\d{2})-(\d{2})-(\d{2})$/;
const DOT_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(.+))?$/;
const SLASH_RE = /^(\d{1,2})([/-])(\d{1,2})\2(\d{4})(?:\s+(.+))?$/;
const YEAR_RE = /^\d{4}$/;

/**
 * Parses a date cell.
 * - number: an Excel serial ONLY when dateFormatted is true; otherwise unparseable (serials are never guessed).
 * - ISO 8601: 'YYYY-MM-DD', 'YYYY-MM', 'YYYY-MM-DD[T ]HH:MM[:SS[.f]][Z|+HH[:MM]]' (an offset is kept, not converted).
 * - 'YY-MM-DD' (exactly two digits each, dashes): year = 2000+YY when YY <= (current two-digit year + 1), else
 *   1900+YY; always flagged ambiguity 'yy-mm-dd'.
 * - 'DD.MM.YYYY' (day first by convention), 'DD/MM/YYYY' or 'MM/DD/YYYY' (also with '-') ONLY when one part > 12
 *   decides the order (identical parts are also unambiguous), or when the caller passes the column's `order`
 *   (see detectDayMonthOrder); otherwise unparseable. A trailing ' HH:MM[:SS]' is allowed.
 * - ISO 8601 interval 'start/end' ('2008-05-01/2008-05-14'): the start, when both halves parse.
 * - year only: a 4-digit STRING with dateFormatted false -> precision 'year'.
 * All calendar dates are validated (2021-02-30 is unparseable).
 */
/** The end of an ISO 8601 interval written in full: a reduced end takes the leading parts it leaves out from the start. */
function completeIntervalEnd(start: string, end: string): string | undefined {
  if (/^\d{4}/.test(end)) return end;
  if (/^\d{2}$/.test(end) && /^\d{4}-\d{2}/.test(start)) return `${start.slice(0, 7)}-${end}`;
  if (/^\d{2}-\d{2}$/.test(end)) return `${start.slice(0, 4)}-${end}`;
  if (/^\d{2}:\d{2}/.test(end) && /^\d{4}-\d{2}-\d{2}/.test(start)) return `${start.slice(0, 10)}T${end}`;
  return undefined;
}

export function parseDate(raw: RawCell, opts: ParseDateOptions): ParsedDate | DateError {
  if (raw === null) return fail('');
  if (typeof raw === 'number') {
    if (!opts.dateFormatted || !Number.isFinite(raw) || raw < 0) return fail(String(raw));
    try {
      return excelSerialToDate(raw, opts.date1904);
    } catch {
      return fail(String(raw));
    }
  }
  const s = raw.trim();
  if (s === '') return fail(raw);

  if (YEAR_RE.test(s)) {
    const y = Number(s);
    if (opts.dateFormatted || y < 1) return fail(raw);
    return { iso: pad4(y), year: y, precision: 'year', tz: 'unknown' };
  }

  // ISO 8601 interval 'start/end' (Darwin Core eventDate): the START is the date, with the start's precision. The end may be
  // reduced as ISO 8601 allows ('2007-11-13/15', '2007-11-13/12-02', '2008-05-01T10:00Z/11:00Z'); it must parse and not precede the start.
  const iv = /^(\d{4}(?:-[^/]*)?)\/([^/]+)$/.exec(s);
  if (iv) {
    const start = parseDate(iv[1], opts);
    const endText = completeIntervalEnd(iv[1], iv[2]);
    const end = endText === undefined ? undefined : parseDate(endText, opts);
    if (!('error' in start) && end !== undefined && !('error' in end)) {
      const n = Math.min(start.iso.length, end.iso.length);
      if (end.iso.slice(0, n) >= start.iso.slice(0, n)) return start;
    }
  }

  let m = ISO_RE.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (m[3] === undefined) {
      if (y < 1 || mo < 1 || mo > 12) return fail(raw);
      return { iso: `${pad4(y)}-${pad2(mo)}`, year: y, precision: 'month', tz: 'unknown' };
    }
    return withTime(y, mo, Number(m[3]), m[4], raw);
  }

  m = YY_RE.exec(s);
  if (m) {
    const yy = Number(m[1]);
    const cur = opts.currentYear ?? new Date().getUTCFullYear();
    const y = yy <= (cur % 100) + 1 ? 2000 + yy : 1900 + yy;
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!validYmd(y, mo, d)) return fail(raw);
    return build(y, mo, d, undefined, 'yy-mm-dd');
  }

  m = DOT_RE.exec(s);
  if (m) return withTime(Number(m[3]), Number(m[2]), Number(m[1]), m[4], raw);

  m = SLASH_RE.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[3]);
    const y = Number(m[4]);
    if (a === b) return withTime(y, b, a, m[5], raw);
    if (opts.order === 'conflict') return fail(raw);
    if (a > 12 && b <= 12) return withTime(y, b, a, m[5], raw); // DD/MM
    if (b > 12 && a <= 12) return withTime(y, a, b, m[5], raw); // MM/DD
    if (a <= 12 && b <= 12 && opts.order === 'dmy') return withTime(y, b, a, m[5], raw);
    if (a <= 12 && b <= 12 && opts.order === 'mdy') return withTime(y, a, b, m[5], raw);
    return fail(raw); // ambiguous (both <= 12, no column order) or impossible (both > 12)
  }

  return fail(raw);
}

/**
 * Day/month order of one date column, from ALL its cells. Only slash / dash D?M/YYYY text counts, and only cells that
 * decide it by themselves (first part > 12 -> DD/MM; second part > 12 -> MM/DD). 'dmy' or 'mdy' when only one kind
 * occurs, 'conflict' when both do, 'unknown' when no cell is unambiguous. Pass the result to parseDate as `order`
 * ('unknown' -> leave `order` out).
 */
export function detectDayMonthOrder(cells: readonly RawCell[]): DayMonthOrder {
  let dmy = false;
  let mdy = false;
  for (const c of cells) {
    if (typeof c !== 'string') continue;
    const m = SLASH_RE.exec(c.trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[3]);
    if (a > 12 && b <= 12) dmy = true;
    else if (b > 12 && a <= 12) mdy = true;
  }
  return dmy && mdy ? 'conflict' : dmy ? 'dmy' : mdy ? 'mdy' : 'unknown';
}

/**
 * Adds a time cell to a DAY-precision date. Returns `d` unchanged when the time is null/blank, when it cannot
 * be parsed (use parseTimeOfDay if the caller must report that), or when `d` is not day-precision.
 * The time's own tz ('utc' / 'offset') wins; the date's ambiguity flag is kept.
 */
export function combineDateTime(d: ParsedDate, time: RawCell): ParsedDate {
  if (d.precision !== 'day') return d;
  if (time === null || (typeof time === 'string' && time.trim() === '')) return d;
  const t = parseTimeOfDay(time);
  if ('error' in t) return d;
  return { ...d, iso: `${d.iso}T${t.text}`, precision: t.ss === undefined ? 'minute' : 'second', tz: t.tz };
}
