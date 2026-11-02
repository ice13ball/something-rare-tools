// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

/**
 * Compact line ranges: [17,18,19,20,21,263,264] -> "17–21, 263–264". Sorted and de-duplicated.
 * Its own module so that the rule files can use it without importing report.ts (which imports the rule registry).
 */
export const MAX_LINE_RANGES = 30;
export function formatLines(lines: readonly number[] | undefined): string {
  if (!lines || lines.length === 0) return '';
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const parts: string[] = [];
  const sizes: number[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  const flush = (): void => {
    parts.push(start === prev ? String(start) : `${start}–${prev}`);
    sizes.push(prev - start + 1);
  };
  for (const n of sorted.slice(1)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    flush();
    start = prev = n;
  }
  flush();
  // a finding with thousands of lines is capped: the first ranges and the number of lines left out (the finding itself keeps all of them)
  if (parts.length > MAX_LINE_RANGES) {
    const rest = sizes.slice(MAX_LINE_RANGES).reduce((a, b) => a + b, 0);
    return `${parts.slice(0, MAX_LINE_RANGES).join(', ')}, … (+${rest})`;
  }
  return parts.join(', ');
}
