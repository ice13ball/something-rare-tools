// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { maxOf, minOf, pushAll, unshiftAll } from '../../src/core/util/arrays';

const BIG = 300_000;
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

describe('minOf / maxOf', () => {
  it('give the results of Math.min / Math.max for no, one and a few elements', () => {
    expect(minOf([])).toBe(Number.POSITIVE_INFINITY);
    expect(maxOf([])).toBe(Number.NEGATIVE_INFINITY);
    expect(minOf([7])).toBe(7);
    expect(maxOf([7])).toBe(7);
    expect(minOf([3, -1, 2])).toBe(-1);
    expect(maxOf([3, -1, 2])).toBe(3);
    expect(minOf([1, Number.NaN, 2])).toBeNaN();
    expect(maxOf([1, Number.NaN, 2])).toBeNaN();
    expect(Object.is(minOf([0, -0]), -0)).toBe(true);
    expect(Object.is(maxOf([-0, 0]), 0)).toBe(true);
  });
  it('take 300,000 elements', () => {
    const xs = range(BIG);
    expect(minOf(xs)).toBe(0);
    expect(maxOf(xs)).toBe(BIG - 1);
  });
});

describe('pushAll / unshiftAll', () => {
  it('keep order and return the new length', () => {
    const a = [1, 2];
    expect(pushAll(a, [])).toBe(2);
    expect(pushAll(a, [3])).toBe(3);
    expect(pushAll(a, [4, 5])).toBe(5);
    expect(a).toEqual([1, 2, 3, 4, 5]);
    const b = [3, 4];
    expect(unshiftAll(b, [])).toBe(2);
    expect(unshiftAll(b, [2])).toBe(3);
    expect(unshiftAll(b, [0, 1])).toBe(5);
    expect(b).toEqual([0, 1, 2, 3, 4]);
    expect(pushAll([] as number[], [])).toBe(0);
  });
  it('take 300,000 elements', () => {
    const a = [-1];
    pushAll(a, range(BIG));
    expect(a).toHaveLength(BIG + 1);
    expect(a[BIG]).toBe(BIG - 1);
    const b = [BIG];
    unshiftAll(b, range(BIG));
    expect(b).toHaveLength(BIG + 1);
    expect(b[0]).toBe(0);
    expect(b[BIG]).toBe(BIG);
  });
});
