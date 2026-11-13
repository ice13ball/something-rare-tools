// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Round 3, Task 1: CONV-POSITION-NONE, a sheet with sample events and no position anywhere, said in the sheet's terms instead of an empty decimalLatitude column of event.txt. Invented data only.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { joinInputs } from '../../src/core/convert/sampleJoin';
import type { SampleJoinRequestCore } from '../../src/core/convert/sampleJoin';
import { toDataset } from '../../src/core/convert/model';
import { validateTables } from '../../src/core/convert/validate';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { ColumnRole } from '../../src/core/types';
import { BOOK, bookInputs, resultsInput, descriptionInput } from './joinFixtures';
import { META, exportSheets } from './exportHelpers';
import type { Cell } from './helpers';
import { fileOf, sheetInput } from './helpers';

const LONG: Record<string, ColumnRole> = { Sample: { kind: 'sampleId' }, Taxon: { kind: 'taxon' }, Count: { kind: 'quantity' } };
const sheet = (header: string[], rows: Cell[][], name: string, fileName: string): ConvertSheetInput =>
  sheetInput(fileOf(header, rows, name, { fileName }), { shape: 'long', quantity: { kind: 'count' }, edit: LONG });
const ids = <T extends { ruleId: string }>(fs: readonly T[], id: string): T[] => fs.filter((f) => f.ruleId === id);

const COUNTS_H = ['Sample', 'Date', 'Taxon', 'Count'];
const COUNTS_R: Cell[][] = [
  ['X01', '2023-04-05', 'Calanus finmarchicus', 3],
  ['X02', '2023-04-06', 'Oithona similis', 1],
];

describe('CONV-POSITION-NONE', () => {
  it('names a sheet with no position column, and the output table does not repeat it', async () => {
    const r = convert({ sheets: [sheet(COUNTS_H, COUNTS_R, 'Counts', 'counts.csv')] });
    const f = ids(r.findings, 'CONV-POSITION-NONE');
    expect(f).toHaveLength(1);
    expect(f[0].sheet).toBe('Counts');
    expect(f[0].params.count).toBe(2);
    expect(f[0].params.column).toBeUndefined();
    expect(renderConvertPlain(f[0], 'en')).toContain('No column of sheet "Counts" is marked as latitude / longitude');
    const tables = validateTables(toDataset(r, META, { fullList: false, prefixStation: false, worms: false, nvs: false }), r.findings);
    expect(tables.filter((x) => x.ruleId === 'DWC-TERM-EMPTY' && (x.field === 'decimalLatitude' || x.field === 'decimalLongitude'))).toEqual([]);
    const ex = await exportSheets([sheet(COUNTS_H, COUNTS_R, 'Counts', 'counts.csv')]);
    expect(ex.findings.filter((x) => x.ruleId === 'DWC-TERM-EMPTY' && (x.field === 'decimalLatitude' || x.field === 'decimalLongitude'))).toEqual([]);
    expect(ids(ex.findings, 'CONV-POSITION-NONE')).toHaveLength(1);
  });

  it('says the variant when a position column is blank in every row', () => {
    const rows: Cell[][] = COUNTS_R.map((x) => [...x, null, null]);
    const r = convert({ sheets: [sheet([...COUNTS_H, 'Latitude', 'Longitude'], rows, 'Counts', 'counts.csv')] });
    const f = ids(r.findings, 'CONV-POSITION-NONE');
    expect(f).toHaveLength(1);
    expect(f[0].params.column).toBe('Latitude');
    expect(renderConvertPlain(f[0], 'en')).toContain('set column "Latitude" to ignore');
  });

  it('is not raised when a second sheet gives the stations their position (Review Focus 2)', () => {
    const A = sheet(
      ['Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'Taxon', 'Count'],
      [
        ['ST-1', 'A1', 55.1, 3.2, '2023-04-05', 'Calanus finmarchicus', 3],
        ['ST-2', 'A2', 55.4, 3.5, '2023-04-06', 'Oithona similis', 1],
      ],
      'A',
      'a.csv',
    );
    const B = sheet(
      ['Station', 'Sample', 'Date', 'Taxon', 'Count'],
      [
        ['ST-1', 'B1', '2023-04-05', 'Calanus finmarchicus', 2],
        ['ST-2', 'B2', '2023-04-06', 'Oithona similis', 4],
      ],
      'B',
      'b.csv',
    );
    const r = convert({ sheets: [A, B] });
    expect(ids(r.findings, 'CONV-POSITION-NONE')).toEqual([]);
    // the rule ids of this run taken once at e69d037 (before this rule existed): no new id may appear
    expect([...new Set(r.findings.map((x) => x.ruleId))].sort()).toEqual(['CONV-DEVICE-MISSING']);
  });

  it('stands beside ROW-NO-COORD when another sheet has positions and this one has stations of its own', async () => {
    const A = sheet(
      ['Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'Taxon', 'Count'],
      [['ST-1', 'A1', 55.1, 3.2, '2023-04-05', 'Calanus finmarchicus', 3]],
      'A',
      'a.csv',
    );
    const B = sheet(
      ['Station', 'Sample', 'Date', 'Taxon', 'Count'],
      [
        ['ST-8', 'B1', '2023-04-05', 'Calanus finmarchicus', 2],
        ['ST-9', 'B2', '2023-04-06', 'Oithona similis', 4],
      ],
      'B',
      'b.csv',
    );
    const ex = await exportSheets([A, B]);
    const f = ids(ex.findings, 'CONV-POSITION-NONE');
    expect(f.map((x) => x.sheet)).toEqual(['B']);
    expect(ids(ex.findings, 'ROW-NO-COORD').length).toBeGreaterThan(0);
  });

  it('is not raised when a confirmed join lends Latitude / Longitude from Samples', () => {
    const join: SampleJoinRequestCore = { results: 0, description: 1, keys: [{ results: 0, description: 0 }], conflicts: [] };
    const r = convert({ sheets: joinInputs(bookInputs(), [join], []).sheets });
    expect(ids(r.findings, 'CONV-POSITION-NONE')).toEqual([]);
    // the same book read WITHOUT the join: the results sheet has none
    const alone = convert({ sheets: [resultsInput(BOOK, 'Counts')] });
    expect(ids(alone.findings, 'CONV-POSITION-NONE')).toHaveLength(1);
    expect(descriptionInput(BOOK, 'Samples')).toBeDefined();
  });

  it('does not judge a profile sheet; its own CONV-PROFILE-LEVEL-INCOMPLETE stays', () => {
    const bio = sheet(['Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'Taxon', 'Count'], [['S1', 'S1-a', 55.5, 2.5, '2023-06-14', 'Calanus finmarchicus', 3]], 'Bio', 'bio.csv');
    const ctd = sheetInput(fileOf(['Station', 'Depth [m]', 'Temperature [°C]'], [['S9', 0, 11.2], ['S9', 10, 10.9]], 'CTD', { fileName: 'ctd.csv' }), { profile: { depthIds: true } });
    const only = convert({ sheets: [ctd] });
    expect(ids(only.findings, 'CONV-POSITION-NONE')).toEqual([]);
    const both = convert({ sheets: [bio, ctd] });
    expect(ids(both.findings, 'CONV-POSITION-NONE')).toEqual([]);
    expect(ids(both.findings, 'CONV-PROFILE-LEVEL-INCOMPLETE').length).toBeGreaterThan(0);
  });
});
