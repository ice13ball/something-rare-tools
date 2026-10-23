// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { addIds, decodeIds, encodeIds, hasId, idOf } from '../../src/core/collection/sources/idset';

describe('idset: the saved set of record ids', () => {
  it('round-trips sorted ids, including 0, large ids and big gaps', () => {
    const ids = Uint32Array.from([0, 1, 127, 128, 16_383, 16_384, 17_000_000, 4_294_967_295]);
    expect([...decodeIds(encodeIds(ids))]).toEqual([...ids]);
    expect(decodeIds(undefined)).toHaveLength(0);
    expect(decodeIds(encodeIds(new Uint32Array(0)))).toHaveLength(0);
  });

  it('merges any-order, repeating ids into the sorted set; hasId finds exactly the members', () => {
    const a = addIds(Uint32Array.from([5, 10, 20]), [30, 10, 1, 30, 20, 7]);
    expect([...a]).toEqual([1, 5, 7, 10, 20, 30]);
    for (const id of a) expect(hasId(a, id)).toBe(true);
    for (const id of [0, 2, 6, 11, 31]) expect(hasId(a, id)).toBe(false);
    expect(addIds(a, [])).toBe(a);
  });

  it('is compact: 122 754 clustered ids (a Zenodo community year) take about 2 bytes an id', () => {
    const ids = new Uint32Array(122_754);
    let id = 5_000_000;
    for (let i = 0; i < ids.length; i++) ids[i] = id += 1 + ((i * 7919) % 31);
    const s = encodeIds(ids);
    expect([...decodeIds(s).subarray(0, 50)]).toEqual([...ids.subarray(0, 50)]);
    expect(decodeIds(s)).toHaveLength(ids.length);
    expect(s.length).toBeLessThan(ids.length * 1.5); // base64 of about one byte a delta here
    expect(s.length).toBeLessThan(ids.length * 4);
  });

  it('only plain unsigned 32-bit integers are ids; anything else is never deduped', () => {
    expect(idOf(17_000_000)).toBe(17_000_000);
    expect(idOf('17000000')).toBe(17_000_000);
    for (const v of [-1, 1.5, 2 ** 32, 'abc', '1e3', null, undefined, '12345678901']) expect(idOf(v)).toBeUndefined();
  });
});
