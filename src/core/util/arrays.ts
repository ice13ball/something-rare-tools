// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * Loops instead of `Math.min(...x)`, `a.push(...x)` and the like. A spread into a call puts every element on the stack, and the
 * check engine runs in a browser worker whose stack is smaller than Node's: ~100k elements (a ragged row on every line of a big
 * file) end in "Maximum call stack size exceeded". Same results as the spread forms, including for empty input.
 */

/** `Math.min(...xs)`: Infinity for no elements, NaN when any element is NaN, -0 below 0. */
export function minOf(xs: readonly number[]): number {
  let m = Number.POSITIVE_INFINITY;
  for (let i = 0; i < xs.length; i++) m = Math.min(m, xs[i]);
  return m;
}

/** `Math.max(...xs)`: -Infinity for no elements, NaN when any element is NaN, 0 above -0. */
export function maxOf(xs: readonly number[]): number {
  let m = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < xs.length; i++) m = Math.max(m, xs[i]);
  return m;
}

/** `target.push(...items)`, in order. Returns the new length like push. */
export function pushAll<T>(target: T[], items: readonly T[]): number {
  for (let i = 0; i < items.length; i++) target.push(items[i]);
  return target.length;
}

/** `target.unshift(...items)`: the items go first, in their own order. Returns the new length like unshift. */
export function unshiftAll<T>(target: T[], items: readonly T[]): number {
  if (items.length === 0) return target.length;
  const old = target.slice();
  target.length = 0;
  pushAll(target, items);
  pushAll(target, old);
  return target.length;
}
