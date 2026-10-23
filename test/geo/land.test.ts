// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The land/sea grid against known places. Coordinates are public facts (sea floor features, coasts, towns), not data.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodeLandMask, loadLandMask } from '../../src/core/geo/land';

const GZ = readFileSync(join(__dirname, '..', '..', 'src', 'core', 'geo', 'land-mask.bin'));
const mask = decodeLandMask(new Uint8Array(gunzipSync(GZ)));

describe('land mask file', () => {
  it('is small enough to ship (gzip) and covers the globe at 0.05 degree', () => {
    expect(GZ.length).toBeLessThan(400_000);
    expect([mask.width, mask.height]).toEqual([7200, 3600]);
  });

  it('decodes through the same path the worker uses', async () => {
    const m = await loadLandMask(new Uint8Array(GZ), async (b) => new Uint8Array(gunzipSync(b)));
    expect(m.place(30.07, 42.07)).toEqual(mask.place(30.07, 42.07));
  });

  it('rejects a damaged file instead of answering', () => {
    const raw = new Uint8Array(gunzipSync(GZ));
    expect(() => decodeLandMask(raw.slice(0, raw.length - 10))).toThrow(/land mask/);
    const bad = raw.slice();
    bad[0] = 0x58;
    expect(() => decodeLandMask(bad)).toThrow(/magic/);
  });
});

describe('places', () => {
  const land: [string, number, number, number][] = [
    // name, lat, lon, at least km from the sea
    ['inland Saudi Arabia', 30.07, 42.07, 200],
    ['southern Egypt', 24.42, 33.44, 100],
    ['Lake Beysehir, Turkey (an inland lake counts as not sea)', 37.85, 31.517, 100],
    ['Hongze Lake, China', 33.2, 118.5, 100],
    ['Warsaw', 52.23, 21.01, 200],
  ];
  for (const [name, lat, lon, km] of land) {
    it(`${name}: land, at least ${km} km from the sea`, () => {
      expect(mask.place(lat, lon)).toEqual({ kind: 'land', atLeastKm: km });
    });
  }

  const sea: [string, number, number][] = [
    ['Menez Gwen vent field, Mid-Atlantic Ridge', 37.8417, -31.525],
    ['Gotland Deep, Baltic', 57.3, 19.5],
    ['Caspian Sea (sea in Natural Earth)', 41.5, 51],
    ['open Pacific near the antimeridian', 16.9, 179.7],
  ];
  for (const [name, lat, lon] of sea) it(`${name}: sea`, () => expect(mask.place(lat, lon).kind).toBe('sea'));

  const noClaim: [string, number, number][] = [
    ['Sopot pier (coastal band)', 54.447, 18.573],
    ['Gulf of Gdansk near the Hel peninsula', 54.6, 18.9],
    ['Isfjorden, Svalbard', 78.25, 15.0],
    ['Hornsund, Svalbard', 77.0, 15.6],
    ['Kosterfjord, Sweden', 58.88, 11.1],
  ];
  for (const [name, lat, lon] of noClaim) it(`${name}: never called land`, () => expect(mask.place(lat, lon).kind).not.toBe('land'));

  it('wraps longitudes: 180 = -180, and a 0-360 value reads as its -180..180 twin', () => {
    expect(mask.place(-16.9, 180)).toEqual(mask.place(-16.9, -180));
    expect(mask.place(38.5, 360 - 98)).toEqual({ kind: 'land', atLeastKm: 200 }); // Kansas on a 0-360 scale
    expect(mask.place(37.8417, 360 - 31.525)).toEqual(mask.place(37.8417, -31.525));
  });

  it('makes no claim outside the valid range or for non-numbers', () => {
    for (const [lat, lon] of [[91, 0], [-91, 0], [0, -181], [0, 361], [Number.NaN, 0]]) expect(mask.place(lat, lon)).toEqual({ kind: 'unknown' });
  });

  it('never calls the poles land beyond what the grid holds (no crash at lat 90 / -90)', () => {
    expect(() => mask.place(90, 0)).not.toThrow();
    expect(() => mask.place(-90, 0)).not.toThrow();
  });
});
