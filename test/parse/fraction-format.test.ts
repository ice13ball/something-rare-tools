// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Which number formats show a fraction of a second (the sheet flag fractionShown). Formats only; no data.
import { describe, expect, it } from 'vitest';
import { showsFractionOfSecond } from '../../src/core/parse/xlsx';

describe('showsFractionOfSecond', () => {
  it.each(['hh:mm:ss.000', 'yyyy-mm-dd hh:mm:ss.0', 'ss.00', 'mm:ss.0', '[ss].000', '[h]:mm:ss.000', 'yyyy-mm-dd\\ hh:mm:ss.000'])('%s shows it', (z) => {
    expect(showsFractionOfSecond(z)).toBe(true);
  });
  it.each(['hh:mm:ss', 'yyyy-mm-dd hh:mm', '[$s.0-409]yyyy-mm-dd', 'yyyy-mm-dd_s.0', 'yyyy-mm-dd*s.0', 'hh:mm:ss"s.0"', 'yyyy-mm-dd\\s.0', 'General'])('%s does not', (z) => {
    expect(showsFractionOfSecond(z)).toBe(false);
  });
});
