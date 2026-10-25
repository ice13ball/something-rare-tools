// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { buildEventTree, centreLongitude, greatCircleM, summarizeTree } from '../../src/core/convert/events';
import type { SampleSite } from '../../src/core/convert/events';
import type { EventRec } from '../../src/core/convert/model';
import { makeDate } from '../helpers/build';

const site = (p: Partial<SampleSite> & { id: string }): SampleSite => ({ code: p.id, ...p });
const byId = (events: EventRec[], id: string) => events.find((e) => e.id === id)!;

describe('event tree', () => {
  const samples: SampleSite[] = [
    site({ id: 'S1-a', cruiseCode: 'CR1', stationCode: 'S1', date: makeDate('2023-06-14'), lat: 55.5, lon: 2.5, depthMin: 0, depthMax: 25 }),
    site({ id: 'S1-b', cruiseCode: 'CR1', stationCode: 'S1', date: makeDate('2023-06-14'), lat: 55.5, lon: 2.5, depthMin: 25, depthMax: 50 }),
    site({ id: 'S2-a', cruiseCode: 'CR1', stationCode: 'S2', date: makeDate('2023-06-16'), lat: 55.9, lon: 3.1, depthMin: 0, depthMax: 50 }),
  ];

  it('builds cruise > station > sample, with eventType as text and station ids `cruise:station`', () => {
    const t = buildEventTree(samples);
    expect(t.events.map((e) => [e.id, e.eventType, e.parentId])).toEqual([
      ['CR1', 'cruise', undefined],
      ['CR1:S1', 'station', 'CR1'],
      ['CR1:S2', 'station', 'CR1'],
      ['S1-a', 'sample', 'CR1:S1'],
      ['S1-b', 'sample', 'CR1:S1'],
      ['S2-a', 'sample', 'CR1:S2'],
    ]);
    expect(t.summary).toMatchObject({ events: 6, cruises: 1, stations: 2, samples: 3, roots: 1, samplesWithoutPosition: 0 });
  });

  it('derives the date of a parent as an interval from the earliest start to the latest end', () => {
    const t = buildEventTree(samples);
    expect(byId(t.events, 'CR1:S1').eventDate).toBe('2023-06-14');
    expect(byId(t.events, 'CR1').eventDate).toBe('2023-06-14/2023-06-16');
    expect(byId(t.events, 'CR1').derived.date).toBe(true);
    expect(byId(t.events, 'S1-a').derived.date).toBe(false);
  });

  it('orders by the instant, not by the text, and ends a date-only day at its end', () => {
    const t = buildEventTree([
      site({ id: 'a', stationCode: 'X', date: makeDate('2023-06-14') }),
      site({ id: 'b', stationCode: 'X', date: { iso: '2023-06-14T10:30:00Z', year: 2023, precision: 'second', tz: 'utc' } }),
      site({ id: 'c', stationCode: 'X', date: { ...makeDate('2023-06-12'), end: makeDate('2023-06-13') } }),
    ]);
    // a covers the whole of 14 June, b lies inside it, c is the 12th to the 13th
    expect(byId(t.events, 'X').eventDate).toBe('2023-06-12/2023-06-14');
  });

  it('derives the depth of a parent: the minimum of the minimums and the maximum of the maximums', () => {
    const t = buildEventTree(samples);
    expect(byId(t.events, 'CR1:S1')).toMatchObject({ depthMin: 0, depthMax: 50 });
    expect(byId(t.events, 'CR1')).toMatchObject({ depthMin: 0, depthMax: 50 });
  });

  it('derives the position as the midpoint of the children bounding box, with an uncertainty that holds every child', () => {
    const t = buildEventTree(samples);
    const cruise = byId(t.events, 'CR1');
    expect(cruise.lat).toBeCloseTo(55.7, 6);
    expect(cruise.lon).toBeCloseTo(2.8, 6);
    // the two samples of S1 are at one position: the station has it, with no uncertainty
    const s1 = byId(t.events, 'CR1:S1');
    expect([s1.lat, s1.lon, s1.coordinateUncertaintyInMeters]).toEqual([55.5, 2.5, undefined]);
    const far = Math.max(greatCircleM(cruise.lat!, cruise.lon!, 55.5, 2.5), greatCircleM(cruise.lat!, cruise.lon!, 55.9, 3.1));
    expect(cruise.coordinateUncertaintyInMeters).toBe(Math.ceil(far));
    expect(Number.isInteger(cruise.coordinateUncertaintyInMeters)).toBe(true);
    expect(cruise.coordinateUncertaintyInMeters!).toBeGreaterThanOrEqual(far);
  });

  it('the uncertainty contains every child position, also for random scatter and nested parents', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const many: SampleSite[] = [];
    for (let i = 0; i < 40; i++) many.push(site({ id: `s${i}`, cruiseCode: 'C', stationCode: `st${i % 5}`, lat: 40 + rnd() * 20, lon: -10 + rnd() * 30 }));
    const t = buildEventTree(many);
    for (const parent of t.events.filter((e) => e.eventType !== 'sample')) {
      for (const child of t.events.filter((e) => e.parentId === parent.id)) {
        const d = greatCircleM(parent.lat!, parent.lon!, child.lat!, child.lon!) + (child.coordinateUncertaintyInMeters ?? 0);
        expect(d, `${parent.id} holds ${child.id}`).toBeLessThanOrEqual(parent.coordinateUncertaintyInMeters!);
      }
    }
  });

  it('handles the antimeridian: two stations either side of 180 degrees give a midpoint on it, not at 0', () => {
    const t = buildEventTree([
      site({ id: 'w', cruiseCode: 'P', stationCode: 'W', lat: 10, lon: 179.5 }),
      site({ id: 'e', cruiseCode: 'P', stationCode: 'E', lat: 12, lon: -179.5 }),
    ]);
    const c = byId(t.events, 'P');
    expect(c.lon).toBe(180);
    expect(c.lat).toBe(11);
    // about 1 degree of longitude at 11 N, half of it plus 1 degree of latitude: nowhere near the 20000 km a naive average would give
    expect(c.coordinateUncertaintyInMeters!).toBeLessThan(200_000);
    for (const id of ['P:W', 'P:E']) {
      const s = byId(t.events, id);
      expect(greatCircleM(c.lat!, c.lon!, s.lat!, s.lon!)).toBeLessThanOrEqual(c.coordinateUncertaintyInMeters!);
    }
  });

  it('centreLongitude picks the shortest arc', () => {
    expect(centreLongitude([2.5, 3.1])).toBeCloseTo(2.8, 9);
    expect(centreLongitude([170, -170, -175])).toBe(180);
    expect(centreLongitude([-179, 179])).toBe(180);
    expect(centreLongitude([-10, 10])).toBe(0);
    expect(centreLongitude([100])).toBe(100);
    // a spread over more than half the circle still takes the arc without the biggest gap
    expect(centreLongitude([0, 100, 200])).toBeCloseTo(100, 9);
  });

  it('a single positioned child gives its position and no uncertainty; children without a position give no position', () => {
    const one = buildEventTree([site({ id: 'a', stationCode: 'X', lat: 1, lon: 2 })]);
    expect(byId(one.events, 'X')).toMatchObject({ lat: 1, lon: 2 });
    expect(byId(one.events, 'X').coordinateUncertaintyInMeters).toBeUndefined();
    const none = buildEventTree([site({ id: 'a', stationCode: 'X' })]);
    expect(byId(none.events, 'X').lat).toBeUndefined();
    expect(none.summary).toMatchObject({ samplesWithoutPosition: 1, derivedPositions: 0 });
  });

  it('flattening the station level moves the code to locality and re-parents the samples to the cruise', () => {
    const t = buildEventTree(samples, { flatten: { station: true } });
    expect(t.events.map((e) => e.id)).toEqual(['CR1', 'S1-a', 'S1-b', 'S2-a']);
    expect(byId(t.events, 'S1-a')).toMatchObject({ parentId: 'CR1', locality: 'S1' });
    expect(byId(t.events, 'S2-a')).toMatchObject({ parentId: 'CR1', locality: 'S2' });
    // the cruise is derived from the samples now
    expect(byId(t.events, 'CR1').eventDate).toBe('2023-06-14/2023-06-16');
    expect(t.summary.flattened).toEqual({ station: true, cruise: false });
  });

  it('flattening the cruise level moves the code to the dataset text and re-parents the stations to nothing', () => {
    const t = buildEventTree(samples, { flatten: { cruise: true } });
    expect(t.cruiseText).toEqual(['CR1']);
    expect(t.events.map((e) => e.id)).toEqual(['CR1:S1', 'CR1:S2', 'S1-a', 'S1-b', 'S2-a']);
    expect(byId(t.events, 'CR1:S1').parentId).toBeUndefined();
    expect(t.summary).toMatchObject({ cruises: 0, stations: 2, roots: 2 });
  });

  it('flattening both leaves root samples, and eventIDs never change with flattening', () => {
    const full = buildEventTree(samples);
    const flat = buildEventTree(samples, { flatten: { station: true, cruise: true } });
    expect(flat.events.every((e) => e.parentId === undefined && e.eventType === 'sample')).toBe(true);
    expect(flat.events.map((e) => e.id)).toEqual(['S1-a', 'S1-b', 'S2-a']);
    expect(full.events.filter((e) => e.eventType === 'sample').map((e) => e.id)).toEqual(flat.events.map((e) => e.id));
    expect(byId(flat.events, 'S1-a').locality).toBe('S1');
  });

  it('a sample without a station hangs under its cruise; without a cruise it is a root', () => {
    const t = buildEventTree([site({ id: 'a', cruiseCode: 'C' }), site({ id: 'b' })]);
    expect(byId(t.events, 'a').parentId).toBe('C');
    expect(byId(t.events, 'b').parentId).toBeUndefined();
  });

  it('summarizeTree counts what the preview shows', () => {
    const t = buildEventTree(samples);
    expect(t.summary).toMatchObject({ derivedDates: 3, derivedPositions: 3, derivedDepths: 3 });
    expect(t.summary.maxUncertaintyM).toBe(byId(t.events, 'CR1').coordinateUncertaintyInMeters);
    expect(summarizeTree(t.events).events).toBe(6);
  });
});

describe('very large parents (L1)', () => {
  it('150 000 samples under one station and one cruise: no throw (no spread over the array), linear time, right derived values', () => {
    const n = 150_000;
    const many: SampleSite[] = [];
    for (let i = 0; i < n; i++) many.push(site({ id: `s${i}`, cruiseCode: 'C', stationCode: 'ST', date: makeDate('2023-06-14'), lat: 50 + (i % 1000) / 1000, lon: 5 + (i % 777) / 1000, depthMin: i % 50, depthMax: (i % 50) + 5 }));
    const t0 = Date.now();
    const t = buildEventTree(many);
    const ms = Date.now() - t0;
    expect(t.events).toHaveLength(n + 2);
    const st = byId(t.events, 'C:ST');
    expect([st.depthMin, st.depthMax]).toEqual([0, 54]);
    expect(st.coordinateUncertaintyInMeters).toBeGreaterThan(0);
    expect(t.summary.samples).toBe(n);
    expect(ms).toBeLessThan(5000);
    const flat = buildEventTree(many, { flatten: { station: true } });
    expect(flat.events).toHaveLength(n + 1);
  });
});
