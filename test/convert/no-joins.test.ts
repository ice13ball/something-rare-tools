// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// /convert reads no join that the person has not confirmed: without a confirmed join (sampleJoin, docs/APPS.md 8.11) every sheet is read on its own, so a position in one sheet is never lent to another
// (the layout of /check, recognize/layout.ts, is not used). Every row is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { proposeConvertMapping } from '../../src/core/convert/recognize';
import { xlsxFile } from '../helpers/files';

describe('/convert reads no join that the person has not confirmed', () => {
  it('a Data sheet without positions gets none from a Station sheet of the same workbook: the sheets stand alone', () => {
    const file = xlsxFile('book.xlsx', {
      Station: [['Cruise', 'Station', 'Date', 'Latitude', 'Longitude'], ['C1', 'S1', '2020-06-01', 70.1, 15.2], ['C1', 'S2', '2020-06-02', 60.2, 5.4], ['C1', 'S3', '2020-06-03', 50.3, -5.6]],
      Data: [['Cruise', 'Station', 'Temperature [degC]', 'Salinity'], ['C1', 'S1', 4.5, 35.1], ['C1', 'S2', 5.5, 35.2], ['C1', 'S3', 6.5, 35.3]],
    });
    const sheets = file.sheets.map((s) => ({ file, sheet: s.name, mapping: proposeConvertMapping(s, { decimalComma: false, date1904: false }), shape: 'wide' as const }));
    const r = convert({ sheets });
    // the Data sheet is environmental data with no position of its own: said as such, nothing is borrowed
    const data = r.findings.filter((f) => f.sheet === 'Data').map((f) => f.ruleId);
    expect(data).toContain('CONV-ENV-ONLY-SHEET');
    for (const e of r.events) {
      if (e.source?.sheet === 'Data') expect(e.lat).toBeUndefined();
    }
    expect(r.ok).toBe(false);
  });
});
