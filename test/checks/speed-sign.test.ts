// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The sign hint of the ship-speed rules, on invented tracks: one coordinate that lost (or gained) its minus sign.
import { describe, expect, it } from 'vitest';
import { checkShipSpeed } from '../../src/core/checks/speed';
import { renderPlain } from '../../src/core/report';
import type { DataRow, Finding, ParsedDate } from '../../src/core/types';
import { makeDataset } from '../helpers/build';

type Spec = Partial<Omit<DataRow, 'datetime'>> & { datetime?: string | ParsedDate };

const T0 = Date.UTC(2021, 6, 1);
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 16);

/** Ten knots northward from (lat0, lon): one degree of latitude per 6 hours. `step` shortens or lengthens the time between events. */
function track(n: number, lat0: number, lon: number, stepHours = 6): Spec[] {
  return Array.from({ length: n }, (_, i) => ({
    lat: lat0 + (i * stepHours) / 6,
    lon,
    latDecimals: 2,
    lonDecimals: 2,
    datetime: iso(T0 + i * stepHours * 3_600_000),
  }));
}

const run = (rows: Spec[]): Finding[] => checkShipSpeed([makeDataset(rows)], { singleCruise: true }).findings;
const line = (i: number): number => i + 2;

describe('ship speed: sign hint', () => {
  it('a longitude that lost its minus sign: the hint names that row and the value', () => {
    const rows = track(12, 40, -20);
    rows[8] = { ...rows[8], lon: 20 };
    const fs = run(rows);
    expect(fs.map((f) => f.ruleId)).toEqual(['ROW-SHIP-SPEED']);
    expect(fs[0].lines).toEqual([line(8)]);
    expect(fs[0].params.signLon).toBe(`${line(8)} (20→−20)`);
    expect(fs[0].params.signLat).toBeUndefined();
    expect(renderPlain(fs[0], 'en')).toContain(`missing or extra minus sign in the longitude of row ${line(8)} (20→−20)`);
    expect(renderPlain(fs[0], 'pl')).toContain(`brak lub nadmiar minusa przy długości w wierszu ${line(8)}`);
    expect(renderPlain(fs[0], 'de')).toContain(`Längengrad in Zeile ${line(8)}`);
    expect(renderPlain(fs[0], 'fr')).toContain(`longitude de la ligne ${line(8)}`);
  });

  it('a latitude that gained a minus sign: the hint is about the latitude', () => {
    const rows = track(12, 20, 30);
    rows[6] = { ...rows[6], lat: -26 };
    const fs = run(rows);
    expect(fs.map((f) => f.ruleId)).toEqual(['ROW-SHIP-SPEED']);
    expect(fs[0].params.signLat).toBe(`${line(6)} (−26→26)`);
    expect(fs[0].params.signLon).toBeUndefined();
    expect(renderPlain(fs[0], 'en')).toContain('in the latitude of row');
  });

  it('a hemisphere flip that also needs the neighbour to change gets no hint', () => {
    // two adjacent rows at a flipped longitude: flipping one of them leaves the other far away
    const rows = track(14, 40, -20);
    rows[7] = { ...rows[7], lon: 20 };
    rows[8] = { ...rows[8], lon: 20 };
    const fs = run(rows);
    expect(fs.length).toBeGreaterThan(0);
    for (const f of fs) expect(f.params.signLon).toBeUndefined();
  });

  it('too fast without any sign that helps: no hint, same finding', () => {
    const rows = track(12, 70, 15.5);
    rows[8] = { ...rows[8], lat: 58 };
    const fs = run(rows);
    expect(fs.map((f) => f.ruleId)).toEqual(['ROW-SHIP-SPEED']);
    expect(fs[0].params.signLon).toBeUndefined();
    expect(fs[0].params.signLat).toBeUndefined();
    expect(renderPlain(fs[0], 'en')).not.toContain('minus');
  });

  it('both signs wrong: neither single flip fixes it, no hint', () => {
    const rows = track(12, 40, -20);
    rows[8] = { ...rows[8], lat: -rows[8].lat!, lon: 20 };
    const fs = run(rows);
    expect(fs.length).toBeGreaterThan(0);
    for (const f of fs) {
      expect(f.params.signLon).toBeUndefined();
      expect(f.params.signLat).toBeUndefined();
    }
  });

  it('near 0 degrees a sign moves the position by less than 100 km: no hint', () => {
    // 0.2 h steps (3.7 km): the row at -0.2 against 0.2 is 44 km away, which is far too fast, and the flip would fit, but it moves 44 km only
    const rows = track(12, 1, 0.2, 0.2);
    rows[8] = { ...rows[8], lon: -0.2 };
    const fs = run(rows);
    expect(fs.map((f) => f.ruleId)).toEqual(['ROW-SHIP-SPEED']);
    expect(fs[0].params.signLon).toBeUndefined();
  });

  it('near 180 degrees of longitude (the antimeridian): no hint', () => {
    const rows = track(12, 40, 175);
    rows[8] = { ...rows[8], lon: -175 };
    const fs = run(rows);
    expect(fs.map((f) => f.ruleId)).toEqual(['ROW-SHIP-SPEED']);
    expect(fs[0].params.signLon).toBeUndefined();
  });

  it('a pair (first event wrong): it is not known which of the two, so no hint, the finding is unchanged', () => {
    const rows = track(12, 40, -20);
    rows[0] = { ...rows[0], lon: 20 };
    const fs = run(rows);
    expect(fs.map((f) => f.ruleId)).toEqual(['ROW-SHIP-SPEED-PAIR']);
    expect(fs[0].params.signLon).toBeUndefined();
  });

  it('only added params: the finding set and severities are those without the hint', () => {
    const rows = track(12, 40, -20);
    rows[8] = { ...rows[8], lon: 20 };
    const [f] = run(rows);
    expect(f.severity).toBe('warning');
    expect(Object.keys(f.params).sort()).toEqual(['cases', 'count', 'declared', 'signLon']);
  });
});
