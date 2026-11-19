// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// An Excel percentage reaches /convert as the number the person sees, with the note. Every value is invented.
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { parseXlsx } from '../../src/core/parse/xlsx';
import { sheetInput } from './helpers';

describe('IN-PERCENT-READ in /convert', () => {
  it('the note is among the findings and the measurements hold the displayed numbers', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Oxygen saturation [%]'],
      ['E1', '2099-01-01', 55, 3, 5, { t: 'n', v: 0.95, z: '0%' }],
      ['E1', '2099-01-01', 55, 3, 10, { t: 'n', v: 0.07, z: '0%' }],
    ] as never);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'S');
    const file = parseXlsx(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })), 'p.xlsx');
    const r = convert({ sheets: [sheetInput(file, { profile: { depthIds: true } })] });
    expect(r.findings.filter((f) => f.ruleId === 'IN-PERCENT-READ')).toHaveLength(1);
    const vals = r.measurements.filter((m) => m.source.column === 'Oxygen saturation [%]').map((m) => m.measurementValue);
    expect(vals).toEqual(['95', '7']);
  });
});
