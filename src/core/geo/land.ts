// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

/*
 * Land/sea grid for ROW-ON-LAND, built by scripts/land-mask.py from Natural Earth 1:10m land, minor islands and lakes
 * (public domain). 0.05-degree cells; a cell makes a claim only when all of it is far from the coast:
 *   0      no claim (the coastal band, uncertain)
 *   1      sea, at least COAST_BUFFER_KM km from land or a lake
 *   2 + i  land or an inland lake, at least bucketKm[i] km from the sea (a marine record in a lake is as misplaced as one on land)
 * The grid ships gzip-compressed (about 0.26 MB) and is loaded only when a dataset has positions.
 */

export const LAND_SOURCE = 'Natural Earth 1:10m (public domain)';
/** The coastal band, km, in which the grid calls nothing land or sea (scripts/land-mask.py BUFFER_KM). */
export const COAST_BUFFER_KM = 5;
/**
 * ROW-ON-LAND only speaks about positions at least this far inside. Measured on real data: with 5 km, inner Svalbard fjords
 * (glaciers retreated since the coastline was drawn) and estuaries that Natural Earth draws as land (CoastDOM v1, PANGAEA
 * 964012: 1 249 rows) were flagged; at 20 km those are gone, and gross errors (a wrong sign, swapped axes) lie far beyond.
 */
export const ON_LAND_MIN_KM = 20;

export type Place = { kind: 'land'; atLeastKm: number } | { kind: 'sea' } | { kind: 'unknown' };

export interface LandMask {
  readonly width: number;
  readonly height: number;
  place(lat: number, lon: number): Place;
}

class Reader {
  pos = 0;
  constructor(readonly b: Uint8Array) {}
  u8(): number {
    if (this.pos >= this.b.length) throw new Error('land mask: truncated');
    return this.b[this.pos++];
  }
  u16(): number {
    return this.u8() | (this.u8() << 8);
  }
  varint(): number {
    let n = 0;
    let shift = 0;
    for (;;) {
      const x = this.u8();
      n += (x & 0x7f) * 2 ** shift;
      if ((x & 0x80) === 0) return n;
      shift += 7;
      if (shift > 28) throw new Error('land mask: bad run length');
    }
  }
}

/** Decodes the uncompressed mask (header + RLE rows) into one byte per cell. Throws on anything malformed. */
export function decodeLandMask(raw: Uint8Array): LandMask {
  const r = new Reader(raw);
  if (String.fromCharCode(r.u8(), r.u8(), r.u8(), r.u8()) !== 'ACLM') throw new Error('land mask: bad magic');
  if (r.u8() !== 1) throw new Error('land mask: unknown version');
  const width = r.u16();
  const height = r.u16();
  const cellCenti = r.u8();
  const nb = r.u8();
  const buckets: number[] = [];
  for (let i = 0; i < nb; i++) buckets.push(r.u16());
  if (width * cellCenti !== 36000 || height * cellCenti !== 18000) throw new Error('land mask: grid does not cover the globe');
  const cells = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      const v = r.u8();
      const n = r.varint();
      if (n === 0 || x + n > width || v > 1 + nb) throw new Error('land mask: bad run');
      cells.fill(v, y * width + x, y * width + x + n);
      x += n;
    }
  }
  if (r.pos !== raw.length) throw new Error('land mask: trailing bytes');
  const perDegree = 100 / cellCenti;
  return {
    width,
    height,
    place(lat: number, lon: number): Place {
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 360) return { kind: 'unknown' };
      // longitudes on a 0-360 scale and exactly 180 wrap to -180..180
      const l = ((((lon + 180) % 360) + 360) % 360) - 180;
      const x = Math.min(width - 1, Math.floor((l + 180) * perDegree));
      const y = Math.min(height - 1, Math.floor((90 - lat) * perDegree));
      const v = cells[y * width + x];
      if (v === 1) return { kind: 'sea' };
      if (v >= 2) return { kind: 'land', atLeastKm: buckets[v - 2] };
      return { kind: 'unknown' };
    },
  };
}

/** Gunzips and decodes; `gunzip` is DecompressionStream in the browser and zlib in tests. */
export async function loadLandMask(gz: Uint8Array, gunzip: (b: Uint8Array) => Promise<Uint8Array>): Promise<LandMask> {
  return decodeLandMask(await gunzip(gz));
}

/** Browser gunzip through DecompressionStream (no library). */
export async function gunzipInBrowser(b: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([b as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
