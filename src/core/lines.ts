// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

/**
 * Compact line ranges: [17,18,19,20,21,263,264] -> "17–21, 263–264". Sorted and de-duplicated.
 * Its own module so that the rule files can use it without importing report.ts (which imports the rule registry).
 */
export function formatLines(lines: readonly number[] | undefined): string {
  if (!lines || lines.length === 0) return '';
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  const flush = (): void => {
    parts.push(start === prev ? String(start) : `${start}–${prev}`);
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
  return parts.join(', ');
}
