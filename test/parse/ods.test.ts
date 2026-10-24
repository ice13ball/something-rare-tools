// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { parseFile } from '../../src/core/parse';
import { ACCEPTED_EXTENSIONS } from '../../src/app/types';
import { DATA_EXTENSIONS } from '../../src/core/sources/common';

describe('.ods: drop and link agree', () => {
  it('SheetJS-written OpenDocument spreadsheet is read like a workbook, rows keep their numbers', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['latitude', 'longitude', 'depth'], [54.5, 18.5, 10], [54.6, 18.6, 20]]), 'Data');
    const bytes = new Uint8Array(XLSX.write(wb, { bookType: 'ods', type: 'array' }) as ArrayBuffer);
    const parsed = parseFile('stations.ods', bytes);
    expect(parsed.kind).toBe('xlsx');
    expect(parsed.sheets).toHaveLength(1);
    expect(parsed.sheets[0].header).toEqual(['latitude', 'longitude', 'depth']);
    expect(parsed.sheets[0].rows).toHaveLength(2);
  });

  it('every extension a record link may deliver is accepted on drop too', () => {
    for (const ext of DATA_EXTENSIONS) expect(ACCEPTED_EXTENSIONS, ext).toContain(`.${ext}`);
  });
});
