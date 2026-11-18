// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { earliestUtcDayOf } from '../values/dates';
import type { ParsedDate } from '../types';

/*
 * The one date or interval the PERSON types for a sheet on which no sample has a date (round 3, Task 17). ISO 8601 only: YYYY, YYYY-MM, YYYY-MM-DD, or an
 * interval A/B of those. Typed, never read from a file name, a sheet name, a header or a value. Pure: "today" is handed in by the caller (the worker), never read here.
 */

export type DeclaredDateReason = 'format' | 'order' | 'future';

export type DeclaredDateRead = { ok: true; text: string; date: ParsedDate; /** the interval spans more than one year */ long: boolean } | { ok: false; reason: DeclaredDateReason };

const PART = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
const DAY_MS = 86_400_000;

interface Part {
  date: ParsedDate;
  startMs: number;
  endMs: number;
}

function partOf(text: string): Part | undefined {
  const m = PART.exec(text);
  if (m === null) return undefined;
  const y = Number(m[1]);
  if (y < 1000) return undefined;
  const mo = m[2] === undefined ? undefined : Number(m[2]);
  const d = m[3] === undefined ? undefined : Number(m[3]);
  if (mo !== undefined && (mo < 1 || mo > 12)) return undefined;
  if (mo !== undefined && d !== undefined && (d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate())) return undefined;
  const precision = d !== undefined ? 'day' : mo !== undefined ? 'month' : 'year';
  const startMs = Date.UTC(y, (mo ?? 1) - 1, d ?? 1);
  const endMs = (d !== undefined ? Date.UTC(y, mo! - 1, d + 1) : mo !== undefined ? Date.UTC(y, mo, 1) : Date.UTC(y + 1, 0, 1)) - 1;
  return { date: { iso: text, year: y, precision, tz: 'unknown' }, startMs, endMs };
}

/** Reads what the person typed. `today` is a UTC calendar day (YYYY-MM-DD); without it nothing is judged to be in the future (the converter's caller always passes it). */
export function readDeclaredDate(typed: string, today?: string): DeclaredDateRead {
  const text = typed.trim();
  const pieces = text.split('/');
  if (pieces.length > 2) return { ok: false, reason: 'format' };
  const parts = pieces.map(partOf);
  if (parts.some((p) => p === undefined)) return { ok: false, reason: 'format' };
  const [a, b] = parts as Part[];
  if (b !== undefined && a.startMs > b.startMs) return { ok: false, reason: 'order' };
  const last = (b ?? a).date;
  if (today !== undefined && earliestUtcDayOf(last) > today) return { ok: false, reason: 'future' };
  const date: ParsedDate = b === undefined ? a.date : { ...a.date, end: b.date };
  const long = (b ?? a).endMs - a.startMs > 366 * DAY_MS;
  return { ok: true, text, date, long };
}
