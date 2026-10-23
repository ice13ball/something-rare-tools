// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// ROW-ON-LAND, the sign pattern of ROW-STATION-MOVED and ROW-STATION-SPREAD. Station names are invented; coordinates are
// public facts about places (a vent field, deserts, coasts), not anybody's data.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { checkRows } from '../../src/core/checks/rows';
import { runChecks } from '../../src/core/checks/run';
import { decodeLandMask, type LandMask } from '../../src/core/geo/land';
import { renderPlain } from '../../src/core/report';
import type { Finding } from '../../src/core/types';
import { dataset, rows } from './rows.helpers';

const land: LandMask = decodeLandMask(new Uint8Array(gunzipSync(readFileSync(join(__dirname, '..', '..', 'src', 'core', 'geo', 'land-mask.bin')))));
const only = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id);

describe('ROW-ON-LAND', () => {
  it('flags rows far inland, counts them, shows the places, and hints a sign flip that puts them at sea', () => {
    const ds = dataset([
      ...rows(2, 3, { lat: 37.8417, lon: -31.525, station: 'V1' }), // at sea
      ...rows(5, 4, { lat: 37.85, lon: 31.517, station: 'V2' }), // the same with the longitude sign flipped: Lake Beysehir
      ...rows(9, 2, { lat: 30.07, lon: 42.07, station: 'V3' }), // inland Saudi Arabia
    ]);
    const f = only(checkRows(ds, { land }), 'ROW-ON-LAND');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', lines: [5, 6, 7, 8, 9, 10] });
    expect(f[0].params.count).toBe(6);
    expect(f[0].params.places).toBe('31.517 E, 37.85 N (4; ≥100 km); 42.07 E, 30.07 N (2; ≥200 km)');
    // both flips are true at sea: Menez Gwen is at 31.5 W, the Lost City field at 42.1 W
    expect(f[0].params.flips).toBe('31.517 E, 37.85 N → 31.517 W, 37.85 N; 42.07 E, 30.07 N → 42.07 W, 30.07 N');
    const pl = renderPlain(f[0], 'pl');
    expect(pl).toContain('W wierszach 5–10 (razem: 6)');
    expect(pl).toContain('To tylko wskazówka, nie poprawka.');
  });

  it('prints a single-precision artefact as the number that was meant (37.8499984741211 -> 37.85)', () => {
    const ds = dataset(rows(2, 1, { lat: 37.8499984741211, lon: 31.5170001983643 }));
    expect(only(checkRows(ds, { land }), 'ROW-ON-LAND')[0].params.places).toBe('31.517 E, 37.85 N (1; ≥100 km)');
  });

  it('says nothing about coastal, fjord and open-sea positions', () => {
    const ds = dataset([
      ...rows(2, 3, { lat: 54.447, lon: 18.573 }), // Sopot pier
      ...rows(6, 3, { lat: 78.25, lon: 15.0 }), // Isfjorden
      ...rows(10, 3, { lat: 58.88, lon: 11.1 }), // Kosterfjord
      ...rows(14, 3, { lat: 57.3, lon: 19.5 }), // Gotland Deep
      ...rows(18, 1, { lat: 0, lon: 0 }),
    ]);
    expect(only(checkRows(ds, { land }), 'ROW-ON-LAND')).toEqual([]);
  });

  it('gives a hint only for an alternative the mask calls sea, and judges only from 50 km inland (controlled mask)', () => {
    const fake = (answers: Record<string, ReturnType<LandMask['place']>>): LandMask => ({ width: 0, height: 0, place: (la, lo) => answers[`${la},${lo}`] ?? { kind: 'unknown' } });
    const ds = dataset([...rows(2, 1, { lat: 10, lon: 20 }), ...rows(3, 1, { lat: 11, lon: 21 }), ...rows(4, 1, { lat: 12, lon: 22 })]);
    const noSea = fake({ '10,20': { kind: 'land', atLeastKm: 100 }, '10,-20': { kind: 'land', atLeastKm: 100 }, '-10,20': { kind: 'unknown' }, '20,10': { kind: 'land', atLeastKm: 5 }, '11,21': { kind: 'land', atLeastKm: 20 } });
    const f = only(checkRows(ds, { land: noSea }), 'ROW-ON-LAND');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([2]); // 11,21 is only 20 km inland: not judged
    expect(f[0].params.flips).toBeUndefined();
    const swapAtSea = fake({ '10,20': { kind: 'land', atLeastKm: 100 }, '20,10': { kind: 'sea' } });
    expect(only(checkRows(ds, { land: swapAtSea }), 'ROW-ON-LAND')[0].params.flips).toBe('20 E, 10 N → 10 E, 20 N');
  });

  it('does not run without the mask', () => {
    const ds = dataset(rows(2, 1, { lat: 30.07, lon: 42.07 }));
    expect(only(checkRows(ds), 'ROW-ON-LAND')).toEqual([]);
  });

  it('a mask that was needed but failed to load is reported as not checked, never as a pass', () => {
    const ds = dataset(rows(2, 1, { lat: 30.07, lon: 42.07 }));
    const failed = runChecks({ datasets: [ds], records: [], parseFindings: [] }, { land: null });
    expect(failed.notChecked[0]).toBe('notChecked.landMask');
    const ok = runChecks({ datasets: [ds], records: [], parseFindings: [] }, { land });
    expect(ok.notChecked).not.toContain('notChecked.landMask');
    expect(only(ok.findings, 'ROW-ON-LAND')).toHaveLength(1);
  });
});

describe('ROW-ON-LAND-NEAR (10-50 km inland, note)', () => {
  // (33.35, -117.3) of the acceptance table lies exactly on a cell edge: 90 - 33.35 = 56.649999… puts it in the bucket-5 cell, like
  // the stored float position of Grey Whale Carcass; (33.36, -117.29), inside the neighbouring cell, is the bucket-10 case
  it('acceptance table: Loihi >= 20 km and a position >= 10 km inland are notes; the float position of Grey Whale Carcass is bucket 5 and silent', () => {
    const ds = dataset([
      ...rows(2, 1, { lat: 19.5333, lon: -155.45 }),
      ...rows(3, 1, { lat: 33.36, lon: -117.29 }),
      ...rows(4, 1, { lat: 33.3499984741211, lon: -117.300003051758 }),
    ]);
    const f = checkRows(ds, { land });
    const near = only(f, 'ROW-ON-LAND-NEAR');
    expect(near).toHaveLength(1);
    expect(near[0]).toMatchObject({ severity: 'info', lines: [2, 3] });
    expect(near[0].params.places).toContain('155.45 W, 19.5333 N (1; ≥20 km)');
    expect(near[0].params.places).toContain('117.29 W, 33.36 N (1; ≥10 km)');
    expect(near[0].params.flips).toBeUndefined();
    expect(only(f, 'ROW-ON-LAND')).toEqual([]);
    expect(land.place(33.35, -117.3)).toEqual({ kind: 'land', atLeastKm: 5 }); // the cell-edge case, documented
  });

  it('a position far inland is ROW-ON-LAND only, never both', () => {
    const ds = dataset([...rows(2, 1, { lat: 54.0, lon: 18.0 }), ...rows(3, 1, { lat: 40.42, lon: -3.7 })]);
    const f = checkRows(ds, { land });
    expect(only(f, 'ROW-ON-LAND')[0].lines).toEqual([2, 3]);
    expect(only(f, 'ROW-ON-LAND-NEAR')).toEqual([]);
  });

  it('one row is never reported by both levels, and the note carries no sign hint (controlled mask)', () => {
    const fake: LandMask = { width: 0, height: 0, place: (la) => (la === 1 ? { kind: 'land', atLeastKm: 100 } : la === 2 ? { kind: 'land', atLeastKm: 10 } : la === 3 ? { kind: 'land', atLeastKm: 5 } : { kind: 'sea' }) };
    const ds = dataset([...rows(2, 1, { lat: 1, lon: 5 }), ...rows(3, 1, { lat: 2, lon: 5 }), ...rows(4, 1, { lat: 3, lon: 5 })]);
    const f = checkRows(ds, { land: fake });
    expect(only(f, 'ROW-ON-LAND')[0].lines).toEqual([2]);
    expect(only(f, 'ROW-ON-LAND-NEAR')[0].lines).toEqual([3]);
    expect(Object.keys(only(f, 'ROW-ON-LAND-NEAR')[0].params).sort()).toEqual(['count', 'places']);
    expect(renderPlain(only(f, 'ROW-ON-LAND-NEAR')[0], 'pl')).toContain('Jeśli to próbka z rzeki, jeziora albo laguny przy brzegu, pomiń tę uwagę.');
  });
});

describe('ROW-STATION-MOVED: sign pattern', () => {
  it('reports one station at two positions that differ (almost) only by the longitude sign, with single-precision values', () => {
    const ds = dataset([
      ...rows(2, 72, { lat: 37.8417015075684, lon: -31.5249996185303, station: 'VENT A' }),
      ...rows(80, 26, { lat: 37.8499984741211, lon: 31.5170001983643, station: 'VENT A' }),
    ]);
    const f = only(checkRows(ds), 'ROW-STATION-MOVED');
    expect(f).toHaveLength(1);
    expect(f[0].params.signLon).toBe('yes');
    expect(f[0].params.signLat).toBeUndefined();
    expect(f[0].lines).toHaveLength(26);
    expect(f[0].params.positions).toBe('31.525 W, 37.8417 N (72 rows); 31.517 E, 37.85 N (26 rows)');
    expect(renderPlain(f[0], 'en')).toContain('differ (almost) only in the sign of the longitude');
    expect(only(checkRows(ds), 'ROW-STATION-SPREAD')).toEqual([]);
  });

  it('the sign sentence is a hypothesis, not a verdict: it says "possibly" and sends the user to the other columns, in four languages', () => {
    const lon = only(checkRows(dataset([...rows(2, 5, { lat: 37.84, lon: -31.52, station: 'VENT A' }), ...rows(8, 3, { lat: 37.85, lon: 31.52, station: 'VENT A' })])), 'ROW-STATION-MOVED')[0];
    const lat = only(checkRows(dataset([...rows(2, 5, { lat: -34.03, lon: 179.198, station: 'CALDERA' }), ...rows(8, 3, { lat: 34.03, lon: 179.198, station: 'CALDERA' })])), 'ROW-STATION-MOVED')[0];
    expect(renderPlain(lon, 'en')).toContain('possibly a missing or extra minus (W/E). Check the other columns too — the sign need not be the whole cause.');
    expect(renderPlain(lat, 'en')).toContain('possibly a missing or extra minus (S/N). Check the other columns too');
    expect(renderPlain(lon, 'pl')).toMatch(/możliwe, że brakuje minusa albo jest zbędny \(W\/E\)\. Sprawdź też inne kolumny/);
    expect(renderPlain(lon, 'de')).toMatch(/vielleicht fehlt ein Minus oder eines ist zu viel \(W\/O\)\. Prüfen Sie auch andere Spalten/);
    expect(renderPlain(lat, 'fr')).toMatch(/peut-être un moins manquant ou en trop \(S\/N\)\. Vérifiez aussi les autres colonnes/);
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      expect(renderPlain(lon, lang)).not.toMatch(/one of them is missing|przy jednej z nich brakuje|bei einer fehlt|il manque un signe moins à l'une/);
    }
  });

  it('reports a latitude sign flip', () => {
    const ds = dataset([...rows(2, 5, { lat: -34.03, lon: 179.198, station: 'CALDERA' }), ...rows(8, 3, { lat: 34.03, lon: 179.198, station: 'CALDERA' })]);
    const f = only(checkRows(ds), 'ROW-STATION-MOVED');
    expect(f[0].params.signLat).toBe('yes');
  });

  it('accepts a flipped sign up to 50 km off, not further', () => {
    const near = dataset([...rows(2, 1, { lat: 32.9535, lon: -118.4135, station: 'BASIN' }), ...rows(4, 2, { lat: 33.2, lon: 118.5, station: 'BASIN' })]); // 29 km once flipped
    expect(only(checkRows(near), 'ROW-STATION-MOVED')[0]?.params.signLon).toBe('yes');
    const far = dataset([...rows(2, 1, { lat: 32.0, lon: -118.4, station: 'BASIN' }), ...rows(4, 2, { lat: 33.2, lon: 118.5, station: 'BASIN' })]); // ~134 km
    expect(only(checkRows(far), 'ROW-STATION-MOVED')).toEqual([]);
    expect(only(checkRows(far), 'ROW-STATION-SPREAD')).toHaveLength(1);
  });

  it('is silent for two nearby positions on both sides of the prime meridian (a sign, but no distance to explain)', () => {
    const ds = dataset([...rows(2, 2, { lat: 51.47, lon: -0.01, station: 'GREENWICH' }), ...rows(5, 2, { lat: 51.47, lon: 0.01, station: 'GREENWICH' })]);
    expect(only(checkRows(ds), 'ROW-STATION-MOVED')).toEqual([]);
    expect(only(checkRows(ds), 'ROW-STATION-SPREAD')).toEqual([]);
  });
});

describe('ROW-STATION-SPREAD', () => {
  it('notes a station whose positions are more than 10 km apart, with the distance', () => {
    const ds = dataset([...rows(2, 3, { lat: 46.455, lon: -128.6167, station: 'RIDGE 1' }), ...rows(6, 3, { lat: 47.955, lon: -129.095, station: 'RIDGE 1' })]);
    const f = only(checkRows(ds), 'ROW-STATION-SPREAD');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'info', value: 'RIDGE 1' });
    expect(f[0].params.km).toBe(171);
    expect(renderPlain(f[0], 'pl')).toContain('nawet o 171 km');
  });

  it('adds that one position is almost certainly wrong beyond 1000 km, and leaves lat = lon positions to ROW-LAT-EQ-LON', () => {
    const far = dataset([...rows(2, 3, { lat: -41.025, lon: -129.56, station: 'SEAMOUNT' }), ...rows(6, 2, { lat: 45.93, lon: -129.98, station: 'SEAMOUNT' })]);
    const f = only(checkRows(far), 'ROW-STATION-SPREAD')[0];
    expect(f.params.far).toBe('yes');
    expect(renderPlain(f, 'en')).toContain('almost certainly a wrong position');
    const eq = dataset([...rows(2, 3, { lat: 76.9975, lon: 16.5047, station: 'SGD5' }), ...rows(6, 1, { lat: 76.989444, lon: 76.989444, station: 'SGD5' })]);
    expect(only(checkRows(eq), 'ROW-STATION-SPREAD')).toEqual([]);
  });

  it('never samples away a single far outlier on a long track', () => {
    const at = (v: number) => Number(v.toFixed(5));
    const track = Array.from({ length: 900 }, (_, i) => rows(2 + i, 1, { lat: at(54.00001 + i * 0.00002), lon: at(18.00001 + i * 0.00002), latDecimals: 5, lonDecimals: 5, station: 'T' })).flat();
    const ds = dataset([...track.slice(0, 450), ...rows(5000, 1, { lat: 58.5, lon: 18.0, station: 'T' }), ...track.slice(450)]);
    expect(only(checkRows(ds), 'ROW-STATION-SPREAD')[0]?.params.km).toBeGreaterThan(400);
  });

  it('is silent within 10 km (repeated casts drift)', () => {
    const ds = dataset([...rows(2, 3, { lat: 54.5, lon: 18.6, station: 'P1' }), ...rows(6, 3, { lat: 54.55, lon: 18.65, station: 'P1' })]); // ~6.6 km
    expect(only(checkRows(ds), 'ROW-STATION-SPREAD')).toEqual([]);
  });

  it('skips names that say they are general or unknown, and rows without a station', () => {
    const ds = dataset([
      ...rows(2, 2, { lat: 44.0, lon: -130.0, station: 'Juan de Fuca (General)' }),
      ...rows(5, 2, { lat: 44.66, lon: -130.36, station: 'Juan de Fuca (General)' }),
      ...rows(8, 2, { lat: 10, lon: 10, station: 'unknown' }),
      ...rows(11, 2, { lat: 20, lon: 20, station: 'unknown' }),
      ...rows(14, 2, { lat: 10, lon: 10 }),
      ...rows(17, 2, { lat: 20, lon: 20 }),
    ]);
    expect(only(checkRows(ds), 'ROW-STATION-SPREAD')).toEqual([]);
  });

  it('measures across the antimeridian (179.9 E and 179.9 W are 22 km apart, not 40 000) and does not call it a sign error', () => {
    const ds = dataset([...rows(2, 2, { lat: 0, lon: 179.9, station: 'DATELINE' }), ...rows(5, 2, { lat: 0, lon: -179.9, station: 'DATELINE' })]);
    expect(only(checkRows(ds), 'ROW-STATION-SPREAD')[0].params.km).toBe(22);
    expect(only(checkRows(ds), 'ROW-STATION-MOVED')).toEqual([]);
  });

  it('stays cheap on a long track under one name (70 000 positions: pattern search skipped, spread still noted)', () => {
    const at = (v: number) => Number(v.toFixed(5));
    const track = Array.from({ length: 70_000 }, (_, i) => rows(2 + i, 1, { lat: at(50.00001 + i * 0.00001), lon: at(10.00001 + i * 0.00001), latDecimals: 5, lonDecimals: 5, station: 'UNDERWAY' })).flat();
    const t0 = performance.now();
    const f = checkRows(dataset(track));
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(only(f, 'ROW-STATION-SPREAD')).toHaveLength(1);
  });

  it('stays cheap on a long transect under one name', () => {
    const at = (v: number) => Number(v.toFixed(4));
    const transect = Array.from({ length: 5000 }, (_, i) => rows(2 + i, 1, { lat: at(50.0001 + i * 0.001), lon: at(10.0001 + i * 0.001), latDecimals: 4, lonDecimals: 4, station: 'TRANSECT' })).flat();
    const t0 = performance.now();
    const f = only(checkRows(dataset(transect)), 'ROW-STATION-SPREAD');
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(f).toHaveLength(1);
  });
});
