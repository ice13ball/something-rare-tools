// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

import { makeFinding, threshold } from '../rules/registry';
import type { DataRow, Dataset, Finding, ParsedDate } from '../types';
import { decimalsOfNumber } from './crossfile';
import { km, writtenDecimals } from './rows';

/*
 * ROW-SHIP-SPEED, ROW-SHIP-SPEED-UNUSUAL, ROW-SHIP-SPEED-PAIR — can one vessel have sailed between consecutive events?
 *
 * The test is only meaningful for ONE vessel, so it never runs on a whole file by itself (mixed ships, boats and a mothership
 * give false alarms; see docs/research/qc-sources.md, "Ship speed"). It runs on a group of events that the user vouches for:
 * - rows of a dataset that has a column mapped as 'cruise' are grouped by that column's values (the column wins over the tick);
 * - rows of a dataset without such a column form ONE group, but only when the user ticked "one cruise of one ship"
 *   (`singleCruise`), and then ALL such files form that one group together (CTD + nutrients + biology of one cruise = one track).
 * With neither, nothing is tested and the report says how to switch it on (notChecked.shipSpeed).
 *
 * Pipeline, O(n log n): rows -> events (one station cast = one event) -> sort once -> runs of events at one place -> two-sided test.
 */

/** Groups with fewer events than this are not judged (a track needs a before and an after). */
const MIN_EVENTS = 3;

/**
 * Minimum separation, km: two consecutive events closer than this are one place (parallel casts, a mothership and its boats,
 * two casts on one station, the same station written in two files with slightly different positions), not a hop to be timed.
 * A stated choice, not a published threshold (docs/research/qc-sources.md): 10 km is the tool's own "same station" size
 * (ROW-STATION-SPREAD uses the same number, far above a ship's drift during a cast), so the two rules agree on what one
 * place is. IOOS QARTOD's 20 km is a displacement limit (RANGEMAX), not a separation, and a larger value would hide pairs
 * with short gaps (below about 16 minutes at 40 knots) for no gain on the pairs that matter. Rounding of the written
 * coordinates is NOT absorbed here but deducted from each distance (see allowance).
 */
export const SHIP_SPEED_MIN_SEPARATION_KM = 10;

const MAX_CASES = 5;
const KM_PER_NM = 1.852;
const KM_PER_DEGREE = 111.195;
const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

/** The one group of all rows without a cruise column, formed only by the declaration. */
const DECLARED = '\u0000declared';

/* ---------- time: what the written date and time allow ---------- */

/**
 * A time as written is not a point: '2021-05-02' is any instant of that day, '2021-05-02T10:30' any second of that minute.
 * The window [lo, hi] is what the written precision allows. The LONGEST possible gap between two events is then
 * (start window of the later).hi - (end window of the earlier).lo: same date = 24 h, adjacent dates = 48 h, and so on, and
 * a time to the minute adds its own minute. A date is never read as 00:00. Times without a zone are read as UTC, one zone
 * for the whole file (the tool cannot know another). Month and year precision are too coarse to time anything: not used.
 */
interface Win {
  lo: number;
  hi: number;
}

const ZONE = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

function instant(iso: string): number {
  const timed = iso.includes('T');
  return Date.parse(timed && !ZONE.test(iso) ? `${iso}Z` : iso); // a bare date is UTC in ECMAScript
}

function windowOf(d: ParsedDate): Win | undefined {
  const lo = instant(d.iso);
  if (Number.isNaN(lo)) return undefined;
  if (d.precision === 'second') return { lo, hi: lo + 1000 };
  if (d.precision === 'minute') return { lo, hi: lo + 60_000 };
  if (d.precision === 'day') return { lo, hi: lo + MS_DAY };
  return undefined;
}

/* ---------- events and runs ---------- */

/**
 * An event is a unique (time, position): the rows of one station cast (all depths, all variables, all files) are one event.
 * Key = start text + end text + position rounded to 1e-4 degrees (about 11 m). Station names are deliberately NOT part of the
 * key: a row of a cast with a mistyped latitude must stand out as its own event, and the same station in two files has the same
 * time and position anyway. Casts of one station whose files differ a little in time or position are joined later, as one run.
 */
interface Ev {
  seq: number;                 // order of first appearance: datasets in session order, rows in file order
  start: Win;
  end: Win;                    // = start for a point event
  lat: number;
  lon: number;
  allowKm: number;             // what the written precision of lat/lon leaves open
  rows: DataRow[];
}

/** Half a unit of the last written decimal, in km, along both axes (the rounding of a coordinate as written). */
function allowance(lat: number, lon: number, latDec: number, lonDec: number): number {
  const dLat = 0.5 * 10 ** -latDec * KM_PER_DEGREE;
  const dLon = 0.5 * 10 ** -lonDec * KM_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

/**
 * Consecutive events within SHIP_SPEED_MIN_SEPARATION_KM of the first one of the run are one place. The run arrives at its first
 * event's start and leaves at the latest end of its members; the hop to the next run is measured from the last member's position
 * to the next run's first. Linear in the number of events, so a vessel on one station for 200 000 rows costs nothing extra.
 */
interface Run {
  first: Ev;
  last: Ev;
  end: Win;
  events: Ev[];
}

interface Hop {
  km: number;
  hours: number;
  kn: number;                  // the speed AT LEAST (distance less the coordinate rounding, over the longest gap)
}

function hop(a: Run, b: Run): Hop | undefined {
  const gap = b.first.start.hi - a.end.lo;
  if (!(gap > 0)) return undefined;   // intervals that overlap in time: nothing can be said (a mooring spans other stations)
  const d = km(a.last.lat, a.last.lon, b.first.lat, b.first.lon);
  if (d < SHIP_SPEED_MIN_SEPARATION_KM) return undefined;
  const effective = Math.max(0, d - a.last.allowKm - b.first.allowKm);
  const hours = gap / MS_HOUR;
  return { km: d, hours, kn: effective / KM_PER_NM / hours };
}

/* ---------- the test ---------- */

interface Item {
  rule: 'ROW-SHIP-SPEED' | 'ROW-SHIP-SPEED-UNUSUAL' | 'ROW-SHIP-SPEED-PAIR';
  group: string;
  /** the runs the finding is about: [this] or [first, second] */
  runs: Run[];
  /** every run named in the case text, in order: previous, this, next | first, second */
  chain: Run[];
  hops: Hop[];
}

function runsOf(events: Ev[]): Run[] {
  const runs: Run[] = [];
  for (const e of events) {
    const run = runs[runs.length - 1];
    if (run && km(run.first.lat, run.first.lon, e.lat, e.lon) < SHIP_SPEED_MIN_SEPARATION_KM) {
      run.events.push(e);
      run.last = e;
      if (e.end.lo > run.end.lo) run.end = e.end;
    } else runs.push({ first: e, last: e, end: e.end, events: [e] });
  }
  return runs;
}

function testGroup(group: string, events: Ev[], out: Item[]): void {
  const extreme = threshold('ROW-SHIP-SPEED', 'speed.extreme');
  const unusual = threshold('ROW-SHIP-SPEED-UNUSUAL', 'speed.unusual');
  events.sort((a, b) => a.start.lo - b.start.lo || a.seq - b.seq);
  const runs = runsOf(events);
  const flagged = new Set<Run>();
  for (let i = 1; i < runs.length - 1; i++) {
    const [p, c, n] = [runs[i - 1], runs[i], runs[i + 1]];
    const h1 = hop(p, c);
    const h2 = hop(c, n);
    if (!h1 || !h2 || h1.kn <= unusual || h2.kn <= unusual) continue;
    const across = hop(p, n);
    // two-sided: both hops exceed the limit while the way from the previous to the next event does not (that one is then
    // explained by the middle event). A skipped across-hop (the vessel is back at one place) counts as "does not exceed".
    const bad = (limit: number): boolean => h1.kn > limit && h2.kn > limit && !(across && across.kn > limit);
    const rule = bad(extreme) ? 'ROW-SHIP-SPEED' : bad(unusual) ? 'ROW-SHIP-SPEED-UNUSUAL' : undefined;
    if (!rule) continue;
    flagged.add(c);
    out.push({ rule, group, runs: [c], chain: [p, c, n], hops: [h1, h2] });
  }
  // A single impossible pair (first or last event, or two bad events in a row) says only that one of its two events is wrong.
  // Not reported when either event already has a two-sided finding: one event, one finding. Only the extreme limit applies:
  // a pair alone cannot say which event is wrong, so the lower limit is left to the two-sided test.
  for (let i = 0; i + 1 < runs.length; i++) {
    if (flagged.has(runs[i]) || flagged.has(runs[i + 1])) continue;
    const h = hop(runs[i], runs[i + 1]);
    if (h && h.kn > extreme) out.push({ rule: 'ROW-SHIP-SPEED-PAIR', group, runs: [runs[i], runs[i + 1]], chain: [runs[i], runs[i + 1]], hops: [h] });
  }
}

/* ---------- findings ---------- */

const bucketOf = (r: DataRow): string => `${r.file}\u0000${r.sheet}`;

const runRows = (run: Run): DataRow[] => run.events.flatMap((e) => e.rows);

/** Line number of a run within one file and sheet; a run that has no row there is named with the file it is in. */
function lineRef(run: Run, bucket: string): string {
  const rows = runRows(run);
  const here = rows.filter((r) => bucketOf(r) === bucket);
  if (here.length > 0) return String(Math.min(...here.map((r) => r.line)));
  const r = rows[0];
  return `${r.file}:${r.line}`;
}

const num = (v: number): string => String(v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
const hopText = (h: Hop): string => `${num(h.km)} km, ${num(h.hours)} h, ≥${Math.floor(h.kn)} kn`;

function caseText(item: Item, bucket: string): string {
  return `${item.chain.map((r) => lineRef(r, bucket)).join('→')}: ${item.hops.map(hopText).join('; ')}`;
}

function findingsOf(items: Item[], declaredGroup: boolean): Finding[] {
  const out: Finding[] = [];
  for (const rule of ['ROW-SHIP-SPEED', 'ROW-SHIP-SPEED-UNUSUAL', 'ROW-SHIP-SPEED-PAIR'] as const) {
    const buckets = new Map<string, { file: string; sheet: string; lines: number[]; items: Item[] }>();
    for (const item of items.filter((x) => x.rule === rule)) {
      const touched = new Set<string>();
      for (const run of item.runs) {
        for (const r of runRows(run)) {
          const k = bucketOf(r);
          let b = buckets.get(k);
          if (!b) buckets.set(k, (b = { file: r.file, sheet: r.sheet, lines: [], items: [] }));
          b.lines.push(r.line);
          if (!touched.has(k)) {
            touched.add(k);
            b.items.push(item);
          }
        }
      }
    }
    for (const [k, b] of buckets) {
      const shown = b.items.slice(0, MAX_CASES).map((i) => caseText(i, k));
      const cases = shown.join(' | ') + (b.items.length > shown.length ? ` | …+${b.items.length - shown.length}` : '');
      const params: Record<string, string | number> = { count: b.items.length, cases };
      if (declaredGroup && b.items.some((i) => i.group === DECLARED)) params.declared = 'yes';
      out.push(makeFinding(rule, { file: b.file, sheet: b.sheet, lines: b.lines, params }));
    }
  }
  return out;
}

/* ---------- public ---------- */

export interface SpeedOptions {
  /** "All measurements in these files come from one cruise of one ship": a dataset-level flag, never stored anywhere but the companion mapping file. */
  singleCruise: boolean;
}

export interface SpeedResult {
  findings: Finding[];
  /** UI message keys for what was not checked (shown with the report). */
  notChecked: string[];
}

export function checkShipSpeed(datasets: readonly Dataset[], opts: SpeedOptions): SpeedResult {
  const groups = new Map<string, Map<string, Ev>>();
  let anyCruiseColumn = false;
  let seq = 0;
  for (const ds of datasets) {
    const cruiseColumn = ds.mappings.some((m) => m.columns.some((c) => c.role.kind === 'cruise'));
    anyCruiseColumn ||= cruiseColumn;
    for (const r of ds.rows) {
      if (r.lat === undefined || r.lon === undefined || !r.datetime) continue;
      const start = windowOf(r.datetime);
      if (!start) continue;
      let group = DECLARED;
      if (cruiseColumn) {
        const cruise = r.cruise?.trim();
        if (!cruise) continue; // a row of a cruise column without a cruise belongs to no track
        group = `cruise:${cruise}`;
      }
      const end = (r.datetime.end && windowOf(r.datetime.end)) || start;
      const key = `${r.datetime.iso}|${r.datetime.end?.iso ?? ''}|${r.lat.toFixed(4)}|${r.lon.toFixed(4)}`;
      let events = groups.get(group);
      if (!events) groups.set(group, (events = new Map()));
      const hit = events.get(key);
      if (hit) {
        hit.rows.push(r);
        continue;
      }
      const latDec = writtenDecimals(r.lat, r.latDecimals ?? decimalsOfNumber(r.lat));
      const lonDec = writtenDecimals(r.lon, r.lonDecimals ?? decimalsOfNumber(r.lon));
      events.set(key, { seq: seq++, start, end, lat: r.lat, lon: r.lon, allowKm: allowance(r.lat, r.lon, latDec, lonDec), rows: [r] });
    }
  }

  const items: Item[] = [];
  let tested = 0;
  for (const [group, events] of groups) {
    if (group === DECLARED && !opts.singleCruise) continue;
    if (events.size < MIN_EVENTS) continue;
    tested++;
    testGroup(group, [...events.values()], items);
  }

  const notChecked: string[] = [];
  if (!opts.singleCruise && (groups.get(DECLARED)?.size ?? 0) >= MIN_EVENTS) notChecked.push('notChecked.shipSpeed');
  else if ((opts.singleCruise || anyCruiseColumn) && tested === 0) notChecked.push('notChecked.shipSpeedFew');
  return { findings: findingsOf(items, opts.singleCruise), notChecked };
}
