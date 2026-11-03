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
/**
 * How /check reads the fraction of a second of an Excel serial. Absent / false: rounded to the whole second, exactly as /convert (whose event IDs depend on it) has always read it.
 * 'shown': the cell's column has a number format that shows a fraction of a second (ss.000), so the fraction is a real one: kept to the millisecond. true: the format does not show one (hh:mm:ss);
 * the fraction is kept to the millisecond only when the cell is at least 5 ms from a whole second AND its shortest decimal form has more than 8 decimals (an instrument's .250 is such a number; a
 * rounded 43983.33333, 1/3 or a fill-down `=A2+1/1440` whose float error is a fraction of a millisecond is not); otherwise rounded to the second.
 */
export type KeepMillis = boolean | 'shown';
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
  /**
   * The cell is in a column that IS the date (the role, never the guess of a header): eight digits are a date written YYYYMMDD (ISO 8601 basic form, validated: month and day must exist), as text or
   * as a whole number, and a whole number of four digits is a year, as the text '2000' is. Absent: both stay unparseable (an eight-digit ID or a measurement is not a date).
   */
  datumColumn?: boolean;
  /**
   * An Excel serial keeps a real fraction of a second, to the millisecond ('2021-06-01T12:00:00.250'). Off (the default): the time is rounded to the whole second, as /convert has always read it
   * (its event IDs depend on that). /check turns it on where it reads the values that go to the clean CSV. Text dates are not affected: their fraction is always kept.
   */
  keepMillis?: KeepMillis;
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

/** Number of decimals of the shortest decimal form of a number (exponent forms counted). */
export function decimalsOf(n: number): number {
  const s = String(Math.abs(n));
  const mantissa = s.replace(/e.*$/, '');
  const d = (mantissa.split('.')[1] ?? '').length;
  const e = /e-(\d+)$/.exec(s);
  return e ? d + Number(e[1]) : d;
}

/** How far, in milliseconds, the fraction of a serial (a time of day below 1 as well) is from the nearest whole second. */
export function secondOffsetMs(serial: number): number {
  const frac = serial - Math.floor(serial);
  return Math.abs(frac * 86_400_000 - Math.round(frac * 86400) * 1000);
}

/** The keep rule of `keepMillis: true`: at least 5 ms from a whole second and more than 8 decimals. */
export function isRealFraction(serial: number): boolean {
  return secondOffsetMs(serial) >= 5 && decimalsOf(serial) > 8;
}

/** Milliseconds of the day (86 400 000 = the next day) of a serial's fraction, read as `keep` says (see KeepMillis). */
function dayMillis(serial: number, frac: number, keep: KeepMillis | undefined): number {
  const wholeSecond = Math.round(frac * 86400) * 1000;
  if (!keep) return wholeSecond;
  const exact = frac * 86_400_000;
  if (keep === 'shown') return Math.round(exact);
  return Math.abs(exact - wholeSecond) >= 5 && decimalsOf(serial) > 8 ? Math.round(exact) : wholeSecond;
}

/**
 * Excel serial -> date. 1900 system: day 0 = 1899-12-30 (correct from 1900-03-01 on; Excel's fictitious
 * 1900-02-29 is not modelled). 1904 system: day 0 = 1904-01-01. The fraction becomes a time of day, rounded
 * to the nearest second (kills float noise); a time of exactly 00:00:00 is indistinguishable from a plain date and gets day precision; zero seconds -> minute
 * precision. tz is 'unknown'.
 * `keepMillis` (see KeepMillis; absent = the rounding above, unchanged): a fraction the column's format shows, or a number that is plainly not float noise, is rounded to the nearest MILLISECOND instead
 * and written '.250' (precision 'second' then, also at 00:00:00.250). Anything finer than a millisecond is rounded to it. Float noise in a time that is not shown to the millisecond is rounded to the second as before; where the format shows milliseconds a drift past
 * half a millisecond (a fill-down formula after some thousand rows) is shown as the fraction the cell holds.
 * Throws RangeError for a non-finite serial or one outside years 1..9999.
 */
export function excelSerialToDate(serial: number, date1904: boolean, keepMillis: KeepMillis = false): ParsedDate {
  if (!Number.isFinite(serial)) throw new RangeError(`invalid Excel serial: ${serial}`);
  let days = Math.floor(serial);
  let slots = dayMillis(serial, serial - days, keepMillis);
  if (slots >= 86_400_000) {
    days += 1;
    slots = 0;
  }
  const secs = Math.floor(slots / 1000);
  const millis = slots % 1000;
  const ms = (date1904 ? EPOCH_1904 : EPOCH_1900) + days * MS_DAY;
  const dt = new Date(ms);
  const year = dt.getUTCFullYear();
  if (!Number.isFinite(year) || year < 1 || year > 9999) throw new RangeError(`Excel serial out of range: ${serial}`);
  const date = `${pad4(year)}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
  if (slots === 0) return { iso: date, year, precision: 'day', tz: 'unknown' };
  const hh = Math.floor(secs / 3600);
  const mm = Math.floor((secs % 3600) / 60);
  const ss = secs % 60;
  const whole = ss === 0 && millis === 0;
  return {
    iso: `${date}T${timeText(hh, mm, whole ? undefined : ss, millis === 0 ? '' : `.${String(millis).padStart(3, '0')}`, '')}`,
    year,
    precision: whole ? 'minute' : 'second',
    tz: 'unknown',
  };
}

const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2})(\.\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/**
 * Time of day from text ('10:30', '10:30:15', '10:30Z', '10:00:00+02:00', fractional seconds kept in `text`)
 * or from an xlsx day fraction (number in [0, 1)).
 */
export function parseTimeOfDay(raw: RawCell, keepMillis: KeepMillis = false): TimeOfDay | DateError {
  if (raw === null) return fail('');
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0 || raw >= 1) return fail(String(raw));
    const slots = dayMillis(raw, raw, keepMillis);
    if (slots >= 86_400_000) return fail(String(raw));
    const secs = Math.floor(slots / 1000);
    const millis = slots % 1000;
    const hh = Math.floor(secs / 3600);
    const mm = Math.floor((secs % 3600) / 60);
    const ss = secs % 60;
    if (ss === 0 && millis === 0) return { hh, mm, tz: 'unknown', text: timeText(hh, mm, undefined, '', '') };
    return { hh, mm, ss, tz: 'unknown', text: timeText(hh, mm, ss, millis === 0 ? '' : `.${String(millis).padStart(3, '0')}`, '') };
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

/** One end of a time range: "1600", "930", "16:00" (hours 0-23, minutes 0-59). */
const RANGE_END_RE = /^(\d{1,2}):?(\d{2})$/;
const RANGE_SPLIT_RE = /\s*[-\u2013\u2014]\s*|\s+to\s+/i;
/** A range end cut short when the text was typed or copied: "11:3" (minutes cut), "11:" (minutes gone), or, after a start written without a colon, "17" (hours only). */
const CUT_END_COLON_RE = /^\d{1,2}:\d?$/;
const CUT_END_HOURS_RE = /^\d{2}$/;
/** One trailing period, with the spaces around it, is typing noise ("1800.", "0530-0700.", "16:00 ."): removed once. */
function stripTrailingPeriod(text: string): string {
  const t = text.replace(/\s*\.\s*$/, '');
  return t === '' ? text : t;
}

/**
 * A time column often holds the time a sampling took, as a range: "1600-1730", "0530-0700", "16:00-17:30", or several ranges of one
 * event, "0530-0700, 1600-1730". The time of the EVENT is the START of the first range (here 16:00 for "1600-1730"); the end of a
 * range, and any further range, is read to check the cell but then IGNORED: the Dataset has one time per row, and the end is not
 * carried into the date (no eventDate interval is written from a time column). A bare "1600" is read by parseTimeCell (time columns
 * only), not here. A range end cut short ("10:00-11:3", "1600-17") is ignored; one trailing period per range ("0530-0700.") is dropped. Anything else is an error, so a malformed range is still reported as unreadable TIME.
 */
export function parseTimeRange(raw: RawCell): TimeOfDay | DateError {
  if (typeof raw !== 'string') return fail(raw === null ? '' : String(raw));
  const segments = raw.trim().split(/\s*[,;]\s*/).map(stripTrailingPeriod);
  let start: TimeOfDay | undefined;
  for (const seg of segments) {
    const parts = seg.split(RANGE_SPLIT_RE);
    if (parts.length !== 2) return fail(raw);
    const times: TimeOfDay[] = [];
    for (const [i, part] of parts.entries()) {
      const text = part.trim();
      const m = RANGE_END_RE.exec(text);
      if (!m) {
        // a CUT end is ignored (only the start is used): "10:00-11:3", "1600-17"; the start itself must be a whole time
        const cut = i === 1 && (CUT_END_COLON_RE.test(text) || (CUT_END_HOURS_RE.test(text) && !parts[0].includes(':')));
        if (cut && times.length === 1) continue;
        return fail(raw);
      }
      const t = parseTimeOfDay(`${m[1]}:${m[2]}`);
      if ('error' in t) return fail(raw);
      times.push(t);
    }
    start ??= times[0];
  }
  return start ?? fail(raw);
}

/**
 * Time of day of a TIME COLUMN cell: a time range first (parseTimeRange), else parseTimeOfDay. The range comes FIRST because "10:00-11:30" also fits
 * "10:00" with the zone offset -11:30 (11.5 hours off); in a time column a dash between two times is a range. An offset is still read when it has a "+",
 * a "Z" or seconds ("10:00:00-05:00"), or is not a time itself ("10:00-11").
 */
export function parseTimeCell(raw: RawCell, keepMillis: KeepMillis = false): TimeOfDay | DateError {
  const range = parseTimeRange(raw);
  if (!('error' in range)) return range;
  const text = typeof raw === 'string' ? stripTrailingPeriod(raw.trim()) : raw;
  // plain HHMM ("1800", "0530"): a time in a time column, never read in a date column (this function is only called for the time role)
  const hhmm = typeof text === 'string' ? /^(\d{2})(\d{2})$/.exec(text) : null;
  if (hhmm) {
    const t = parseTimeOfDay(`${hhmm[1]}:${hhmm[2]}`);
    return 'error' in t ? fail(String(raw)) : t;
  }
  const one = parseTimeOfDay(text, keepMillis);
  return 'error' in one && typeof raw === 'string' ? fail(raw) : one;
}

/** A cell that is two years joined by a dash ("2001-2005"); it may also be two valid times ("2005-2040" is 20:05 to 20:40). */
export function isYearRange(raw: RawCell): boolean {
  return typeof raw === 'string' && /^(?:19|20)\d{2}\s*[-\u2013\u2014]\s*(?:19|20)\d{2}$/.test(raw.trim());
}

/**
 * Do the (non-blank) cells of a column that is called a time hold year ranges, not times? Mostly year-range cells AND at least one of them impossible as a
 * time ("1995-2000": minute 95). A column in which every such cell is a valid range of times ("1930-2000", "1945-2015": tows from 19:30 to 20:00) stays a time
 * column, because its header says time and the evening hours look like years only by chance.
 */
export function cellsAreYearRanges(cells: readonly RawCell[]): boolean {
  const years = cells.filter(isYearRange);
  return years.length > 0 && years.length * 2 > cells.length && years.some((c) => 'error' in parseTimeRange(c));
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
const COMPACT_RE = /^\d{8}$/;
/** year first, then month and day with slashes or dots: the order is certain whatever the column holds ('2003/01/17', '2003.1.17 08:30') */
const YMD_RE = /^(\d{4})([/.])(\d{1,2})\2(\d{1,2})(?:\s+(.+))?$/;

/**
 * Parses a date cell.
 * - number: an Excel serial ONLY when dateFormatted is true; otherwise unparseable (serials are never guessed).
 * - ISO 8601: 'YYYY-MM-DD', 'YYYY-MM', 'YYYY-MM-DD[T ]HH:MM[:SS[.f]][Z|+HH[:MM]]' (an offset is kept, not converted).
 * - 'YY-MM-DD' (exactly two digits each, dashes): year = 2000+YY when YY <= (current two-digit year + 1), else
 *   1900+YY; always flagged ambiguity 'yy-mm-dd'.
 * - 'YYYY/MM/DD' and 'YYYY.MM.DD' (year first: the order is certain), with an optional time.
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
    if (opts.datumColumn && !opts.dateFormatted && Number.isInteger(raw)) return parseDate(String(raw), opts);
    if (!opts.dateFormatted || !Number.isFinite(raw) || raw < 0) return fail(String(raw));
    try {
      return excelSerialToDate(raw, opts.date1904, opts.keepMillis ?? false);
    } catch {
      return fail(String(raw));
    }
  }
  const s = raw.trim();
  if (s === '') return fail(raw);

  if (opts.datumColumn && COMPACT_RE.test(s)) {
    const y = Number(s.slice(0, 4));
    const mo = Number(s.slice(4, 6));
    const d = Number(s.slice(6, 8));
    return validYmd(y, mo, d) ? build(y, mo, d) : fail(raw);
  }

  if (YEAR_RE.test(s)) {
    const y = Number(s);
    if (opts.dateFormatted || y < 1) return fail(raw);
    // in a column that is the date a year is a year of observation: 1215 or 3004 is a mistyped cell, reported, never written into eventDate
    if (opts.datumColumn && (y < 1700 || y > (opts.currentYear ?? new Date().getUTCFullYear()) + 1)) return fail(raw);
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
      // with a zone on both ends compare instants ('…T10:00+02:00/…T09:30Z' is 08:00Z to 09:30Z), otherwise the common prefix
      const zoned = start.tz !== 'unknown' && end.tz !== 'unknown';
      const n = Math.min(start.iso.length, end.iso.length);
      if (zoned ? Date.parse(end.iso) >= Date.parse(start.iso) : end.iso.slice(0, n) >= start.iso.slice(0, n)) return { ...start, end };
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

  m = YMD_RE.exec(s);
  if (m) return withTime(Number(m[1]), Number(m[3]), Number(m[4]), m[5], raw);

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
export function combineDateTime(d: ParsedDate, time: RawCell, order?: Exclude<DayMonthOrder, 'unknown'>, keepMillis: KeepMillis = false): ParsedDate {
  if (d.precision !== 'day') return d;
  if (time === null || (typeof time === 'string' && time.trim() === '')) return d;
  const t = parseTimeColumnCell(time, d.iso.slice(0, 10), order, keepMillis);
  if ('error' in t) return d;
  return { ...d, iso: `${d.iso}T${t.text}`, precision: t.ss === undefined ? 'minute' : 'second', tz: t.tz };
}

/**
 * The UTC calendar day ('YYYY-MM-DD') a parsed date falls on, for comparing days. A value with a zone is moved to UTC; a time without a
 * zone is read as UTC (as everywhere else a file's times are compared); a year or a month stands for its FIRST day, so '2026' is 2026-01-01.
 */
export function utcDayOf(d: ParsedDate): string {
  if (d.precision === 'year') return `${d.iso.slice(0, 4)}-01-01`;
  if (d.precision === 'month') return `${d.iso.slice(0, 7)}-01`;
  if (d.tz === 'offset') {
    const t = Date.parse(d.iso);
    if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
  }
  return d.iso.slice(0, 10);
}

const LATEST_ZONE_MS = 14 * 3_600_000; // UTC+14, the furthest-ahead zone in use (Line Islands)

/**
 * The UTC calendar day on which a parsed date can FIRST have begun anywhere on Earth. A date-only value (a day, a month, a year: its first
 * day) begins at 00:00 in the latest zone, UTC+14, which is 10:00 UTC of the day before; a time without a zone may be that zone's wall clock,
 * so 14 hours are taken off it; a time with a zone (or Z) is an instant and is only moved to UTC. Comparing this day with today's UTC day
 * tells a value that is in the future for everybody from one that is merely today's date somewhere east of Greenwich.
 */
export function earliestUtcDayOf(d: ParsedDate): string {
  const dateOnly = d.precision === 'year' || d.precision === 'month' || d.precision === 'day';
  if (!dateOnly && d.tz !== 'unknown') return utcDayOf(d);
  const wall = dateOnly ? Date.parse(`${utcDayOf(d)}T00:00:00Z`) : Date.parse(`${d.iso}Z`);
  if (!Number.isFinite(wall)) return utcDayOf(d);
  return new Date(wall - LATEST_ZONE_MS).toISOString().slice(0, 10);
}

/**
 * A date that is a placeholder for "no date" in a spreadsheet or an epoch ("1899-12-30 12:30:00" is the time 12:30): such a cell is a time, not a date.
 * The day-first and month-first spellings of the same days are listed too.
 */
const EPOCH_PLACEHOLDER = /^\s*(?:(?:1899-12-3[01]|1900-01-0[01]|1904-01-01|1970-01-01)|(?:3[01][./-]12[./-]1899|0?[01][./-]0?[01][./-]1900|0?1[./-]0?1[./-](?:1904|1970))|(?:12[./-]3[01][./-]1899))(?:[T\s]|$)/;
export const isEpochPlaceholder = (raw: RawCell): boolean => typeof raw === 'string' && EPOCH_PLACEHOLDER.test(raw);

/**
 * The time of day of a cell of a TIME column (parseTimeCell), and, when the cell is not a time, the time part of a full date with a time of day: '2011-10-05T20:00:00Z', '2003/01/17 08:30', '1899-12-30 12:30'
 * (a spreadsheet's placeholder date is a time). The date part of such a cell is not read as a date, so it must be the day of the row (`rowDay`, YYYY-MM-DD) or a placeholder: a cell that
 * names another day than its row is unreadable, never silently cut. `order` is the column's day/month order, when its cells decide one. A cell that holds no time of day is an error.
 */
export function parseTimeColumnCell(raw: RawCell, rowDay?: string, order?: Exclude<DayMonthOrder, 'unknown'>, keepMillis: KeepMillis = false): TimeOfDay | DateError {
  const t = parseTimeCell(raw, keepMillis);
  if (!('error' in t) || typeof raw !== 'string') return t;
  const d = parseDate(raw, { date1904: false, dateFormatted: false, ...(order === undefined ? {} : { order }) });
  if ('error' in d || (d.precision !== 'minute' && d.precision !== 'second')) return t;
  if (!isEpochPlaceholder(raw) && rowDay !== undefined && d.iso.slice(0, 10) !== rowDay) return t;
  const part = parseTimeOfDay(d.iso.slice(11));
  return 'error' in part ? t : part;
}

const MONTH_NAME = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_LOOKING = new RegExp(`^(?:\\d{8}(?:\\s+\\d{3,4})?|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}\\b.*|${MONTH_NAME}\\.?\\s+\\d{1,2}\\b.*|\\d{1,2}\\s+${MONTH_NAME}\\b.*)$`, 'i');
/**
 * Does a cell that no reader reads (not a time, not a date) look like a date written out: eight digits and an optional time ('20030117 0830'), day, month and year with a 12-hour clock or an
 * ambiguous order ('01/17/2003 8:30 AM'), or a month name ('Jan 17 2003')? Used to say that such a cell is not lost silently; the cell is not read.
 */
export function looksLikeUnreadDate(raw: RawCell): boolean {
  return typeof raw === 'string' && DATE_LOOKING.test(raw.trim());
}

/**
 * The full date and time of a cell of a TIME column: a text datetime, or the serial of a column the workbook formats as a date, when it holds a time of day (a plain time, a date alone and a
 * spreadsheet placeholder are not this: undefined). The caller decides what to do with the zone.
 */
/** A spreadsheet serial that stands for a date between 1954 and 2118 (the range a sampling date can have): 1.5 or 12 are times and durations, not dates. */
export const isPlausibleSerial = (n: number): boolean => n >= 20000 && n <= 80000;

export function fullDatetimeOfTimeCell(raw: RawCell, o: { date1904: boolean; dateFormatted: boolean; order?: Exclude<DayMonthOrder, 'unknown'>; keepMillis?: KeepMillis }): ParsedDate | undefined {
  if (raw === null || isEpochPlaceholder(raw)) return undefined;
  if (typeof raw === 'number' && !(o.dateFormatted && isPlausibleSerial(raw))) return undefined;
  const d = parseDate(raw, { date1904: o.date1904, dateFormatted: o.dateFormatted, ...(o.order === undefined ? {} : { order: o.order }), ...(o.keepMillis ? { keepMillis: o.keepMillis } : {}) });
  return 'error' in d || (d.precision !== 'minute' && d.precision !== 'second') ? undefined : d;
}
