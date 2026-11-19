// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// K2 in the converter: a depth of -999 stays -999 in the archive (never rewritten, never dropped) and the row checks the converter runs raise
// ROW-MISSING-CODE (accept). The converter's own depth handling is unchanged. Every value is invented.
import { describe, expect, it } from 'vitest';
import { judge, policyOf } from '../../src/core/convert/policy';
import { exportSheet } from './exportHelpers';
import type { Cell } from './helpers';

const header = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Depth', 'Species', 'Count'];
const rows = (depths: Cell[]): Cell[][] => depths.map((d, i) => ['S1', `s${i + 1}`, '2023-06-14', 55.5, 2.5, d, 'Calanus finmarchicus', 4 + i]);

describe('a depth of -999 through the converter', () => {
  it('is reported with its line, accepted, and written as it was', async () => {
    const e = await exportSheet(header, rows([5, -999, 10]), { quantity: { kind: 'count' } });
    const f = e.findings.filter((x) => x.ruleId === 'ROW-MISSING-CODE');
    // the Darwin Core range has two columns, so two findings; the station's event row takes the minimum of its samples, -999 included (the converter's own aggregation, unchanged)
    expect(f.map((x) => x.field).sort()).toEqual(['maximumDepthInMeters', 'minimumDepthInMeters']);
    for (const x of f) {
      expect(x.value).toBe('-999');
      expect(policyOf(x)).toBe('accept');
    }
    expect(f.find((x) => x.field === 'maximumDepthInMeters')!.lines).toEqual([4]);
    expect(judge(e.findings).blocking.map((x) => x.ruleId)).not.toContain('ROW-MISSING-CODE');
    const ev = e.dataset.events.filter((x) => x.type === 'sample');
    expect(ev.map((x) => x.depth?.minText)).toContain('-999');
    expect(e.findings.some((x) => x.ruleId === 'ROW-DEPTH-RANGE')).toBe(false);
  });
});
