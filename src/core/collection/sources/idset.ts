// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A set of record ids that fits in a saved cursor: sorted unsigned integers, stored as deltas in LEB128 varints, as base64. Ids of one
// Zenodo community cluster, so most deltas take 1-2 bytes: about 2 bytes an id against 4 for a Uint32Array (a year of 122 754 records:
// about 250 KB saved, 490 KB in memory). Only ever holds the ids of ONE year's split slices.

const MAX_ID = 0xffffffff;

/** An id this set can hold (a non-negative integer below 2^32); anything else is never deduped, which is the safe side. */
export function idOf(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,10}$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= MAX_ID ? n : undefined;
}

export function encodeIds(ids: Uint32Array): string {
  const bytes: number[] = [];
  let prev = 0;
  for (const id of ids) {
    let d = id - prev;
    prev = id;
    while (d >= 0x80) {
      bytes.push((d & 0x7f) | 0x80);
      d = Math.floor(d / 128);
    }
    bytes.push(d);
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x2000) bin += String.fromCharCode(...bytes.slice(i, i + 0x2000));
  return btoa(bin);
}

export function decodeIds(s: string | undefined): Uint32Array {
  if (!s) return new Uint32Array(0);
  const bin = atob(s);
  const out: number[] = [];
  let prev = 0;
  let d = 0;
  let mul = 1;
  for (let i = 0; i < bin.length; i++) {
    const b = bin.charCodeAt(i);
    d += (b & 0x7f) * mul;
    if (b & 0x80) mul *= 128;
    else {
      prev += d;
      out.push(prev);
      d = 0;
      mul = 1;
    }
  }
  return Uint32Array.from(out);
}

/** Binary search in a sorted array. */
export function hasId(sorted: Uint32Array, id: number): boolean {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] === id) return true;
    if (sorted[mid] < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

/** The union of a sorted set and some new ids (any order, repeats allowed), sorted. */
export function addIds(sorted: Uint32Array, add: number[]): Uint32Array {
  if (add.length === 0) return sorted;
  const extra = Uint32Array.from(new Set(add)).sort();
  const out = new Uint32Array(sorted.length + extra.length);
  let i = 0;
  let j = 0;
  let k = 0;
  while (i < sorted.length || j < extra.length) {
    const a = i < sorted.length ? sorted[i] : Infinity;
    const b = j < extra.length ? extra[j] : Infinity;
    if (a === b) {
      out[k++] = a;
      i++;
      j++;
    } else if (a < b) out[k++] = sorted[i++];
    else out[k++] = extra[j++];
  }
  return out.subarray(0, k);
}
