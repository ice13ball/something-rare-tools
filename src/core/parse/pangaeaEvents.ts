// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { makeFinding } from '../rules/registryCheck';
import { proposeColumns } from '../recognize/columns';
import type { Finding, ParsedFile, RawRow, RawSheet } from '../types';

/*
 * The Event(s) block of a PANGAEA text file names the stations the table comes from, each with its position and time:
 *
 *   Event(s):  ST-01 (alias) * LATITUDE: 8.5749 * LONGITUDE: 97.6526 * DATE/TIME: 2007-10-22T17:46:00 * ELEVATION: -47.0 m * CAMPAIGN: X
 *
 * The table itself often has no position or date column (PANGAEA keeps them on the event). This module copies them into the table as the
 * columns `Latitude`, `Longitude` and `Date/Time` (the names PANGAEA uses for such columns itself), so /check and /convert read them like
 * any other column, and says so in a finding. Rules of the loan:
 *  - a column the table has of its own is never touched, and a value a row has is never overwritten (only the kinds the table lacks are added);
 *  - one event: it is the event of every row;
 *  - several events and an `Event` column: each row takes the event whose label it names, exactly; a row whose event is not listed (or has no
 *    point or date) borrows nothing and is reported;
 *  - several events and no Event column: nothing is borrowed (which row belongs to which event is not known) and the finding says why;
 *  - a position counts when it is a point: LATITUDE/LONGITUDE, or the START and END of an event that are equal. A track (START differs from
 *    END) is not a point; a date is the DATE/TIME, or the START when START and END are equal, or the interval START/END.
 *  - the ELEVATION is the level of the sea floor at the site, not the depth of the sample: it is not borrowed.
 */

export interface PangaeaEvent {
  /** The label as written, with its alias in brackets. */
  label: string;
  /** The label without a trailing alias in brackets: what the table's Event column holds. */
  name: string;
  /** Latitude and longitude exactly as written (the decimals are kept), when the event is a point. */
  lat?: string;
  lon?: string;
  /** DATE/TIME as written, or START/END as an interval. */
  date?: string;
  /** The event gives a start and an end position that differ: a track, not a point. */
  track?: boolean;
}

const COLUMNS = { lat: 'Latitude', lon: 'Longitude', date: 'Date/Time' } as const;

/** Reads one entry of the Event(s) block ("label * KEY: value * KEY: value"). */
function readEvent(line: string): PangaeaEvent | undefined {
  const segs = line.split(' * ').map((s) => s.trim());
  const label = segs[0];
  if (!label || /^[A-Z][A-Z0-9/ -]*:/.test(label)) return undefined;
  const kv = new Map<string, string>();
  for (const seg of segs.slice(1)) {
    const m = /^([A-Z][A-Z0-9/ -]*):\s*(.+)$/.exec(seg);
    if (m && !kv.has(m[1])) kv.set(m[1], m[2].trim());
  }
  const alias = /^(.*?)\s*\([^()]*\)$/.exec(label);
  const ev: PangaeaEvent = { label, name: (alias?.[1] ?? label).trim() };
  const num = (k: string): number | undefined => {
    const v = kv.get(k);
    return v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined;
  };
  const lat = kv.get('LATITUDE');
  const lon = kv.get('LONGITUDE');
  if (num('LATITUDE') !== undefined && num('LONGITUDE') !== undefined) {
    ev.lat = lat;
    ev.lon = lon;
  } else if (num('LATITUDE START') !== undefined && num('LONGITUDE START') !== undefined) {
    const sameEnd = (k: string) => num(`${k} END`) === undefined || num(`${k} END`) === num(`${k} START`);
    if (sameEnd('LATITUDE') && sameEnd('LONGITUDE')) {
      ev.lat = kv.get('LATITUDE START');
      ev.lon = kv.get('LONGITUDE START');
    } else ev.track = true;
  }
  const when = kv.get('DATE/TIME');
  const start = kv.get('DATE/TIME START');
  const end = kv.get('DATE/TIME END');
  if (when !== undefined) ev.date = when;
  else if (start !== undefined) ev.date = end !== undefined && end !== start ? `${start}/${end}` : start;
  return ev;
}

/** The events of the header block's `Event(s)` entry (first line and its continuation lines). */
export function readEvents(entry: readonly string[] | undefined): PangaeaEvent[] {
  const out: PangaeaEvent[] = [];
  for (const line of entry ?? []) {
    const ev = line.trim() === '' ? undefined : readEvent(line);
    if (ev) out.push(ev);
  }
  return out;
}

const blank = (c: unknown): boolean => c === null || c === undefined || String(c).trim() === '';

/**
 * Adds the columns the Event(s) block can fill to the sheet (in place, at the right of the table) and returns the findings that say what was done.
 * `file.eventColumns` records how many columns were added, so that the parameter list (matched to the columns by position) still stands for the table.
 */
export function lendEventColumns(file: ParsedFile, sheet: RawSheet, events: readonly PangaeaEvent[]): Finding[] {
  if (events.length === 0 || sheet.rows.length === 0) return [];
  const roles = proposeColumns(sheet, { decimalComma: false, date1904: false }).map((p) => p.role.kind);
  const needPos = !roles.some((k) => k === 'latitude' || k === 'longitude');
  const needDate = !roles.some((k) => k === 'datetime' || k === 'date');
  if (!needPos && !needDate) return [];

  const base = { file: file.fileName, sheet: sheet.name };
  const eventCol = sheet.header.findIndex((h) => /^event$/i.test(h.trim()));
  // which event belongs to which row
  let eventOf: (r: RawRow) => PangaeaEvent | undefined;
  if (events.length === 1) eventOf = () => events[0];
  else if (eventCol >= 0) {
    const byName = new Map<string, PangaeaEvent | null>();
    for (const e of events) {
      for (const key of new Set([e.name, e.label])) byName.set(key, byName.has(key) ? null : e);
    }
    eventOf = (r) => {
      const c = r.cells[eventCol];
      return blank(c) ? undefined : (byName.get(String(c).trim()) ?? undefined);
    };
  } else {
    const usable = events.filter((e) => (needPos && e.lat !== undefined) || (needDate && e.date !== undefined));
    if (usable.length === 0) return needPos && events.some((e) => e.track) ? [makeFinding('IN-PANGAEA-EVENT-NOT-USED', { ...base, params: { events: events.length, track: events.length } })] : [];
    return [makeFinding('IN-PANGAEA-EVENT-NOT-USED', { ...base, params: { events: events.length, several: events.length } })];
  }

  const single = events.length === 1 ? events[0] : undefined;
  const wantPos = needPos && events.some((e) => e.lat !== undefined);
  const wantDate = needDate && events.some((e) => e.date !== undefined);
  const findings: Finding[] = [];
  // tracks only (a trawl: start differs from end): no event has a point, and the finding says why, with one event or several
  if (needPos && !wantPos && events.some((e) => e.track)) {
    findings.push(makeFinding('IN-PANGAEA-EVENT-NOT-USED', { ...base, params: { events: events.length, track: events.length } }));
  }
  if (!wantPos && !wantDate) return findings;

  const added: string[] = [];
  if (wantPos) added.push(COLUMNS.lat, COLUMNS.lon);
  if (wantDate) added.push(COLUMNS.date);
  const unmatched: number[] = [];
  let filled = 0;
  const newRows: RawRow[] = sheet.rows.map((r) => {
    const ev = eventOf(r);
    // the new cells go right after the header's own columns; a ragged row's extra fields stay behind them
    const width = sheet.header.length;
    const cells = r.cells.slice(0, width);
    while (cells.length < width) cells.push(null);
    const has = ev !== undefined && ((wantPos && ev.lat !== undefined) || (wantDate && ev.date !== undefined));
    if (wantPos) cells.push(has ? (ev.lat ?? null) : null, has ? (ev.lon ?? null) : null);
    if (wantDate) cells.push(has ? (ev.date ?? null) : null);
    cells.push(...r.cells.slice(width));
    if (has) filled++;
    else unmatched.push(r.line);
    return { ...r, cells, fieldCount: cells.length };
  });
  sheet.header.push(...added);
  sheet.rows = newRows;
  file.eventColumns = (file.eventColumns ?? 0) + added.length;

  if (filled > 0) {
    findings.push(
      makeFinding('IN-PANGAEA-EVENT-USED', {
        ...base,
        field: added.join(', '),
        params: { columns: added.join(', '), events: events.length, count: filled },
      }),
    );
  }
  if (unmatched.length > 0) findings.push(makeFinding('IN-PANGAEA-EVENT-UNMATCHED', { ...base, lines: unmatched, params: { count: unmatched.length } }));
  return findings;
}
