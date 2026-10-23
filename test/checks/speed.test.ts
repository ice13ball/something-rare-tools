// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// ROW-SHIP-SPEED, ROW-SHIP-SPEED-UNUSUAL, ROW-SHIP-SPEED-PAIR on invented tracks (no third-party data in this file).
import { describe, expect, it } from 'vitest';
import { runChecks } from '../../src/core/checks/run';
import { checkShipSpeed } from '../../src/core/checks/speed';
import { renderPlain, renderTechnical } from '../../src/core/report';
import type { DataRow, Dataset, Finding, ParsedDate } from '../../src/core/types';
import { makeDataset, makeDate } from '../helpers/build';

type Spec = Partial<Omit<DataRow, 'datetime'>> & { datetime?: string | ParsedDate };

const T0 = Date.UTC(2021, 6, 1);
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM

/**
 * A ship track: one event every `stepHours`, one degree of latitude (111 km) per 6 hours = 10 knots by default.
 * `dayOnly` writes dates without a time of day (the longest possible gap then applies).
 */
function track(n: number, o: { stepHours?: number; dayOnly?: boolean; lat0?: number; lon?: number; offsetHours?: number; cruise?: string } = {}): Spec[] {
  const step = o.stepHours ?? 6;
  return Array.from({ length: n }, (_, i) => {
    const t = iso(T0 + ((o.offsetHours ?? 0) + i * step) * 3_600_000);
    return {
      lat: (o.lat0 ?? 70) + (i * step) / 6,
      lon: o.lon ?? 15.5,
      latDecimals: 2,
      lonDecimals: 2,
      datetime: o.dayOnly ? t.slice(0, 10) : t,
      ...(o.cruise !== undefined ? { cruise: o.cruise } : {}),
    };
  });
}

const withCruiseColumn = (): Partial<Dataset> => ({ mappings: [{ sheet: 'data', columns: [{ index: 0, header: 'Rejs', role: { kind: 'cruise' } }] }] });
const ofRule = (fs: Finding[], id: string): Finding[] => fs.filter((f) => f.ruleId === id);
const lineOf = (i: number): number => i + 2; // makeDataset: line = index + 2

describe('ship speed: the six cases of the spec', () => {
  it('1. a 10 kn track with one row at latitude 58 instead of 78, with times: a warning on that row only', () => {
    const rows = track(12);
    rows[8] = { ...rows[8], lat: 58 };
    const { findings, notChecked } = checkShipSpeed([makeDataset(rows)], { singleCruise: true });
    expect(notChecked).toEqual([]);
    expect(findings.map((f) => f.ruleId)).toEqual(['ROW-SHIP-SPEED']);
    expect(findings[0].lines).toEqual([lineOf(8)]);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].params.declared).toBe('yes');
    // the neighbours are named, the distance and the implied speed too: 77 -> 58 is 19 degrees in 6 hours
    expect(findings[0].params.cases).toMatch(/^9→10→11: /);
    expect(findings[0].params.cases).toContain('2113 km, 6 h');
  });

  it('2. the same track with dates only and the bad row on the same date as its neighbours: a warning', () => {
    // four events a day: events 8..11 share a date; the bad one is the second of them, so both neighbours are on its date
    const rows = track(12, { dayOnly: true });
    rows[9] = { ...rows[9], lat: 58 }; // true latitude 79 here, written 58
    const { findings } = checkShipSpeed([makeDataset(rows)], { singleCruise: true });
    expect(findings.map((f) => f.ruleId)).toEqual(['ROW-SHIP-SPEED']);
    expect(findings[0].lines).toEqual([lineOf(9)]);
    // 58 from 78 and 80 on the same date: 20 degrees = 2224 km in AT MOST 24 h = at least 50 knots
    expect(findings[0].params.cases).toContain('24 h');
  });

  it('3. the bad row on an adjacent date: the 48 h rule gives an info (unusual), not a warning; documented, not forced', () => {
    // event 8 is the first of its date, so its previous neighbour (event 7) is on the date before: the gap there is 48 h.
    // 77 -> 58 = 2113 km in at most 48 h = 24 kn: above 15 kn, below 40 kn. Event 9 shares its date: 58 -> 79 = 2335 km in 24 h = 52 kn.
    // Both sides exceed 15 knots and 77 -> 79 does not, so the rule says "unusual" (info), and honestly no more than that.
    const rows = track(12, { dayOnly: true });
    rows[8] = { ...rows[8], lat: 58 };
    const { findings } = checkShipSpeed([makeDataset(rows)], { singleCruise: true });
    expect(findings.map((f) => f.ruleId)).toEqual(['ROW-SHIP-SPEED-UNUSUAL']);
    expect(findings[0].lines).toEqual([lineOf(8)]);
    expect(findings[0].severity).toBe('info');
  });

  it('4. two interleaved vessels without a declaration or a cruise column: the rule does not run, and the report says how to switch it on', () => {
    const a = track(10, { lat0: 70 });
    const b = track(10, { lat0: 40, offsetHours: 3, lon: -20 });
    const rows = a.flatMap((x, i) => [x, b[i]]); // A and B alternate in the file
    const ds = makeDataset(rows);
    const { findings, notChecked } = checkShipSpeed([ds], { singleCruise: false });
    expect(findings).toEqual([]);
    expect(notChecked).toEqual(['notChecked.shipSpeed']);
    // ... and it reaches the report like the land-map note
    const report = runChecks({ datasets: [ds], records: [], parseFindings: [] });
    expect(report.findings.filter((f) => f.ruleId.startsWith('ROW-SHIP-SPEED'))).toEqual([]);
    expect(report.notChecked).toContain('notChecked.shipSpeed');
    // with the declaration the same file is judged, and the mix shows (that is why the tick has a warning next to it)
    expect(checkShipSpeed([ds], { singleCruise: true }).findings.length).toBeGreaterThan(0);
  });

  it('5. a cruise column with two cruises: each one is checked on its own, whatever the tick says', () => {
    const a = track(10, { lat0: 70, cruise: 'A' });
    const b = track(10, { lat0: 40, offsetHours: 3, lon: -20, cruise: 'B' });
    b[5] = { ...b[5], lat: 10 }; // an error in cruise B only
    const rows = a.flatMap((x, i) => [x, b[i]]);
    for (const singleCruise of [false, true]) {
      const { findings, notChecked } = checkShipSpeed([makeDataset(rows, [], withCruiseColumn())], { singleCruise });
      expect(notChecked).toEqual([]);
      expect(findings.map((f) => f.ruleId)).toEqual(['ROW-SHIP-SPEED']);
      expect(findings[0].lines).toEqual([lineOf(2 * 5 + 1)]); // B's sixth event, in the interleaved file
      expect(findings[0].params.declared).toBeUndefined(); // the column formed the group, not the tick
    }
  });

  it('6. a parallel cast 2 km away at the same time: skipped by the minimum separation', () => {
    const rows = track(10);
    const parallel = { ...rows[4], lat: (rows[4].lat as number) + 0.018 }; // 2.0 km north, same instant
    const { findings } = checkShipSpeed([makeDataset([...rows.slice(0, 5), parallel, ...rows.slice(5)])], { singleCruise: true });
    expect(findings).toEqual([]);
    // the same cast written 5 minutes later and 3 km away (a boat) is no different
    const boat = { ...rows[4], lat: (rows[4].lat as number) + 0.027, datetime: iso(T0 + (4 * 6 * 60 + 5) * 60_000) };
    expect(checkShipSpeed([makeDataset([...rows.slice(0, 5), boat, ...rows.slice(5)])], { singleCruise: true }).findings).toEqual([]);
  });
});

describe('ship speed: how events, time and neighbours are treated', () => {
  it('a date is never read as 00:00: three casts 400 km apart on one date are fine (9 knots over the longest gap of 24 h)', () => {
    const rows: Spec[] = [
      { lat: 60, lon: 10, latDecimals: 2, lonDecimals: 2, datetime: '2021-07-01' },
      { lat: 63.6, lon: 10, latDecimals: 2, lonDecimals: 2, datetime: '2021-07-01' },
      { lat: 67.2, lon: 10, latDecimals: 2, lonDecimals: 2, datetime: '2021-07-01' },
    ];
    expect(checkShipSpeed([makeDataset(rows)], { singleCruise: true }).findings).toEqual([]);
  });

  it('every row of one station cast is one event, in one file or in two (the same station is not counted twice)', () => {
    const rows = track(12);
    rows[8] = { ...rows[8], lat: 58 };
    const castRows = rows.flatMap((r) => [r, { ...r, depth: 10 }, { ...r, depth: 20 }]); // three depths per cast
    const one = makeDataset(castRows);
    const f1 = checkShipSpeed([one], { singleCruise: true }).findings;
    expect(f1).toHaveLength(1);
    expect(f1[0].params.count).toBe(1);
    expect(f1[0].lines).toHaveLength(3);
    // the same casts again in a second file: still one event, and both files are named
    const two = makeDataset(rows.map((r) => ({ ...r, file: 'nutrients.csv', sheet: 'nutrients' })), [], { id: 'ds2', file: 'nutrients.csv' });
    const f2 = checkShipSpeed([makeDataset(rows), two], { singleCruise: true }).findings;
    expect(f2.map((f) => [f.file, f.params.count])).toEqual([['data.csv', 1], ['nutrients.csv', 1]]);
  });

  it('a mistyped latitude on ONE row of a cast stands out (its time equals the cast, its place does not)', () => {
    const rows = track(12);
    rows.splice(7, 0, { ...rows[6], lat: 58 }); // the second row of cast 6 with latitude 58
    const { findings } = checkShipSpeed([makeDataset(rows)], { singleCruise: true });
    expect(findings.map((f) => f.ruleId)).toEqual(['ROW-SHIP-SPEED']);
    expect(findings[0].lines).toEqual([lineOf(7)]);
  });

  it('first or last event wrong: one pair, reported as info for both events (never only the later one)', () => {
    const rows = track(10);
    rows[9] = { ...rows[9], lat: 20 };
    const { findings } = checkShipSpeed([makeDataset(rows)], { singleCruise: true });
    expect(findings.map((f) => f.ruleId)).toEqual(['ROW-SHIP-SPEED-PAIR']);
    expect(findings[0].lines).toEqual([lineOf(8), lineOf(9)]);
    expect(findings[0].severity).toBe('info');
    const plain = renderPlain(findings[0], 'en');
    expect(plain).toContain('The position or the time of one of these two events is wrong');
    expect(plain).toContain('day and month swapped');
  });

  it('a pair is not reported on top of a two-sided finding, and one event gets one finding (warning, not warning and info)', () => {
    const rows = track(12);
    rows[8] = { ...rows[8], lat: 58 };
    const ids = checkShipSpeed([makeDataset(rows)], { singleCruise: true }).findings.map((f) => f.ruleId);
    expect(ids).toEqual(['ROW-SHIP-SPEED']);
  });

  it('a hop of 15 to 40 knots on both sides is an info ("unusual"), a hop above 40 on both sides a warning', () => {
    // 3 degrees per 6 h = 30 knots out and back
    const rows = track(10);
    rows[5] = { ...rows[5], lat: (rows[5].lat as number) + 3 };
    const { findings } = checkShipSpeed([makeDataset(rows)], { singleCruise: true });
    expect(findings.map((f) => f.ruleId)).toEqual(['ROW-SHIP-SPEED-UNUSUAL']);
    expect(findings[0].lines).toEqual([lineOf(5)]);
  });

  it('a normal research cruise at 12 knots gives nothing', () => {
    expect(checkShipSpeed([makeDataset(track(40, { stepHours: 5 }))], { singleCruise: true }).findings).toEqual([]);
  });

  it('groups of fewer than 3 events are skipped, and the report says so when nothing could be judged', () => {
    const r = checkShipSpeed([makeDataset(track(2))], { singleCruise: true });
    expect(r.findings).toEqual([]);
    expect(r.notChecked).toEqual(['notChecked.shipSpeedFew']);
    // nothing declared and nothing to judge: nothing to say either
    expect(checkShipSpeed([makeDataset(track(2))], { singleCruise: false }).notChecked).toEqual([]);
  });

  it('a file without dates or positions cannot be judged: the tick says so instead of passing silently', () => {
    const rows: Spec[] = Array.from({ length: 10 }, (_, i) => ({ lat: 70 + i, lon: 15 }));
    expect(checkShipSpeed([makeDataset(rows)], { singleCruise: true }).notChecked).toEqual(['notChecked.shipSpeedFew']);
  });

  it('data without dates (a vent database): no declaration, nothing judged, and the report says the rule could not run', () => {
    const rows: Spec[] = Array.from({ length: 10 }, (_, i) => ({ lat: 40 + i * 0.5, lon: -127, latDecimals: 2, lonDecimals: 2 }));
    expect(checkShipSpeed([makeDataset(rows)], { singleCruise: false })).toEqual({ findings: [], notChecked: ['notChecked.shipSpeedFew'] });
  });

  it('when most places are named the finding says the premise (one ship) is the likelier culprit; a single bad cast does not', () => {
    const a = track(10, { lat0: 70 });
    const b = track(10, { lat0: 40, offsetHours: 3, lon: -20 });
    const mixed = checkShipSpeed([makeDataset(a.flatMap((x, i) => [x, b[i]]))], { singleCruise: true }).findings;
    expect(mixed.length).toBeGreaterThan(0);
    expect(mixed.every((f) => f.params.mixed === 'yes')).toBe(true);
    expect(renderPlain(mixed[0], 'pl')).toContain('więcej niż jednego statku lub rejsu');
    const rows = track(12);
    rows[8] = { ...rows[8], lat: 58 };
    expect(checkShipSpeed([makeDataset(rows)], { singleCruise: true }).findings[0].params.mixed).toBeUndefined();
  });

  it('events with an interval use the END of the previous and the START of the next', () => {
    const interval = (a: string, b: string): ParsedDate => ({ ...makeDate(a), end: makeDate(b) });
    // A is a tow 06:00 to 18:00; B starts at 20:00, 400 km away. Start to start: 14 h = 15.4 knots (not above the 40 of a pair);
    // end to start: 2 h = 108 knots, impossible.
    const rows: Spec[] = [
      { lat: 60, lon: 10, latDecimals: 2, lonDecimals: 2, datetime: '2021-07-01T00:00' },
      { lat: 60, lon: 10.2, latDecimals: 2, lonDecimals: 2, datetime: interval('2021-07-01T06:00', '2021-07-01T18:00') },
      { lat: 63.6, lon: 10, latDecimals: 2, lonDecimals: 2, datetime: '2021-07-01T20:00' },
      { lat: 63.6, lon: 10.2, latDecimals: 2, lonDecimals: 2, datetime: '2021-07-02T20:00' },
    ];
    const { findings } = checkShipSpeed([makeDataset(rows)], { singleCruise: true });
    expect(findings.map((f) => f.ruleId)).toEqual(['ROW-SHIP-SPEED-PAIR']);
    expect(findings[0].params.cases).toMatch(/400 km, 2 h, ≥10\d kn/);
  });

  it('overlapping intervals (a mooring spanning the cruise) are not timed at all', () => {
    const interval = (a: string, b: string): ParsedDate => ({ ...makeDate(a), end: makeDate(b) });
    const rows = track(10);
    rows.splice(3, 0, { lat: 40, lon: -10, latDecimals: 2, lonDecimals: 2, datetime: interval('2021-07-01T00:00', '2021-07-20T00:00') });
    const { findings } = checkShipSpeed([makeDataset(rows)], { singleCruise: true });
    expect(findings.every((f) => !(f.lines ?? []).includes(lineOf(3)) || f.ruleId === 'ROW-SHIP-SPEED-PAIR')).toBe(true);
  });

  it('rounding of the written coordinates is deducted: stations 1 degree apart written to whole degrees, 15 minutes apart, are not impossible', () => {
    // 60 N and 61 N written as "60" and "61": the true distance may be as little as 111 - 2 x 55.6 = 0 km
    const rows: Spec[] = ['2021-07-01T10:00', '2021-07-01T10:15', '2021-07-01T10:30', '2021-07-01T10:45'].map((t, i) => ({ lat: 60 + (i % 2), lon: 15, latDecimals: 0, lonDecimals: 0, datetime: t }));
    expect(checkShipSpeed([makeDataset(rows)], { singleCruise: true }).findings).toEqual([]);
  });

  it('times with a zone are compared as instants, times without as one zone', () => {
    const rows = track(10);
    rows[4] = { ...rows[4], datetime: { ...makeDate(`${iso(T0 + 4 * 6 * 3_600_000)}`), iso: `${iso(T0 + 4 * 6 * 3_600_000)}+00:00`, tz: 'offset' } };
    expect(checkShipSpeed([makeDataset(rows)], { singleCruise: true }).findings).toEqual([]);
  });

  it('a long track: the listing is capped and counted, and the lines are all there', () => {
    // 40 events 6 h apart, every fourth one 30 degrees off the track: nine isolated, two-sided outliers
    const rows = track(40);
    for (let i = 2; i < 38; i += 4) rows[i] = { ...rows[i], lat: (rows[i].lat as number) + 30 };
    const { findings } = checkShipSpeed([makeDataset(rows)], { singleCruise: true });
    const warn = findings.filter((f) => f.ruleId === 'ROW-SHIP-SPEED');
    expect(findings).toHaveLength(1);
    expect(warn[0].params.count).toBe(9);
    expect(warn[0].lines).toHaveLength(9);
    expect(String(warn[0].params.cases).split(' | ')).toHaveLength(6); // 5 cases and "…+4"
    expect(String(warn[0].params.cases)).toContain('…+4');
  });

  it('when the events alternate between two places every one of them is two-sided, and still it is one capped finding', () => {
    const rows = track(40);
    for (let i = 1; i < 39; i += 2) rows[i] = { ...rows[i], lat: (rows[i].lat as number) + 30 };
    const { findings } = checkShipSpeed([makeDataset(rows)], { singleCruise: true });
    expect(findings.filter((f) => f.ruleId === 'ROW-SHIP-SPEED')).toHaveLength(1);
    expect(findings.length).toBeLessThanOrEqual(3);
  });

  it('200 000 rows: sorted once, no quadratic step', () => {
    // a ship zig-zagging between 40 N and 60 N at 4 knots: 200 000 distinct events, every one a run of its own
    const rows: Spec[] = Array.from({ length: 200_000 }, (_, i) => {
      const x = (i * 0.2) % 40;
      return { lat: 40 + (x <= 20 ? x : 40 - x), lon: 10, latDecimals: 4, lonDecimals: 4, datetime: iso(T0 + i * 3 * 3_600_000) };
    });
    const ds = makeDataset(rows);
    const t0 = Date.now();
    const r = checkShipSpeed([ds], { singleCruise: true });
    expect(r.findings).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(4000);
  });
});

describe('ship speed: wording', () => {
  const sample = (): Finding => {
    const rows = track(12);
    rows[8] = { ...rows[8], lat: 58 };
    return checkShipSpeed([makeDataset(rows)], { singleCruise: true }).findings[0];
  };

  it('Polish: row numbers as a label (no "W wierszach 3"), the limit with its source in the technical text, all four languages', () => {
    const f = sample();
    const pl = renderPlain(f, 'pl');
    expect(pl).toContain('Numery wierszy: 10.');
    expect(pl).not.toMatch(/W wierszach|\(razem/);
    expect(pl).toContain('40 węzłów');
    expect(pl).toContain('pozycji albo w dacie lub godzinie');
    expect(pl).toContain('odznacz pole'); // the tick was the source of the group
    for (const lang of ['en', 'de', 'fr'] as const) expect(renderPlain(f, lang)).toContain('40');
    const tech = renderTechnical(f);
    expect(tech).toContain('marine-qc');
    expect(tech).toContain('MEDATLAS');
    expect(tech).toContain('LONGEST');
  });

  it('no sentence about mixed ships when a cruise column formed the group', () => {
    const rows = track(12, { cruise: 'A' });
    rows[8] = { ...rows[8], lat: 58 };
    const f = checkShipSpeed([makeDataset(rows, [], withCruiseColumn())], { singleCruise: false }).findings[0];
    expect(renderPlain(f, 'pl')).not.toContain('odznacz');
    expect(renderPlain(f, 'en')).not.toContain('untick');
  });
});
