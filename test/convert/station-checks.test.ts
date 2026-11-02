// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// /convert runs the station checks of /check on the rows of its INPUT sheet (the output table has no station name to compare: the station is a parent event), so a station that
// spans hemispheres, or has a sign or a digit typed wrongly, is never written silently. Every value is invented.
import { describe, expect, it } from 'vitest';
import { checkStationRows } from '../../src/core/checks/rows';
import { judge, policyOf } from '../../src/core/convert/policy';
import { exportSheet, exportSheets } from './exportHelpers';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const H = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'];
const row = (sample: string, lat: number, lon: number, date = '2020-06-01'): Cell[] => ['S1', sample, date, lat, lon, 'Calanus finmarchicus', 3];
const q = { quantity: { kind: 'count' as const } };
const ids = (e: Awaited<ReturnType<typeof exportSheet>>) => e.findings.map((f) => f.ruleId);

describe('station checks in /convert', () => {
  it('a station whose longitude has both signs is reported, in the sheet lines, and has to be accepted', async () => {
    const e = await exportSheet(H, [row('a', 64.6012, 50.9623), row('b', 64.6013, 50.9621), row('c', 64.6011, -50.9625, '2020-06-02'), row('d', 64.6012, 50.9624, '2020-06-03')], q);
    const f = e.findings.filter((x) => x.ruleId === 'ROW-STATION-MOVED');
    expect(f).toHaveLength(1);
    expect(f[0].value).toBe('S1');
    expect(f[0].params.signLon).toBe('yes');
    expect(f[0].lines).toContain(4);
    expect(policyOf(f[0])).toBe('accept');
    expect(judge(e.findings).acceptRules).toContain('ROW-STATION-MOVED');
  });

  it('is the finding /check gives for the same rows: one function, not a second threshold', async () => {
    const rows = [row('a', 64.6012, 50.9623), row('c', 64.6011, -50.9625, '2020-06-02')];
    const e = await exportSheet(H, rows, q);
    const mine = e.findings.find((x) => x.ruleId === 'ROW-STATION-MOVED')!;
    const direct = checkStationRows('sheet.csv', 'S', [
      { file: 'sheet.csv', sheet: 'S', line: 2, station: 'S1', lat: 64.6012, lon: 50.9623, latDecimals: 4, lonDecimals: 4, values: {} },
      { file: 'sheet.csv', sheet: 'S', line: 3, station: 'S1', lat: 64.6011, lon: -50.9625, latDecimals: 4, lonDecimals: 4, values: {} },
    ]);
    expect(direct.map((x) => x.ruleId)).toEqual(['ROW-STATION-MOVED']);
    expect(mine.params.positions).toContain('50.9623 E');
  });

  it('is said once: the output table does not say it a second time', async () => {
    const e = await exportSheet(H, [row('a', 64.6012, 50.9623), row('c', 64.6011, -50.9625, '2020-06-02')], q);
    expect(ids(e).filter((id) => id.startsWith('ROW-STATION-'))).toEqual(['ROW-STATION-MOVED']);
  });

  it('a far spread is a warning to accept; a transect of tens of km is only a note', async () => {
    const far = await exportSheet(H, [row('a', 10, 20), row('b', 30, 20, '2020-06-02')], q);
    const f = far.findings.find((x) => x.ruleId === 'ROW-STATION-SPREAD-FAR')!;
    expect(f).toBeDefined();
    expect(policyOf(f)).toBe('accept');
    const transect = await exportSheet(H, [row('a', 55, 3), row('b', 55.3, 3.2, '2020-06-02'), row('c', 55.6, 3.4, '2020-06-03')], q);
    const note = transect.findings.find((x) => x.ruleId === 'ROW-STATION-SPREAD')!;
    expect(note).toBeDefined();
    expect(policyOf(note)).toBe('show');
    expect(transect.findings.some((x) => x.ruleId === 'ROW-STATION-SPREAD-FAR' || x.ruleId === 'ROW-STATION-MOVED')).toBe(false);
  });

  it('one position per station, however many rows: nothing', async () => {
    const e = await exportSheet(H, [row('a', 55, 3), row('b', 55, 3, '2020-06-02'), row('c', 55, 3, '2020-06-03')], q);
    expect(ids(e).some((id) => id.startsWith('ROW-STATION-'))).toBe(false);
  });

  it('the same station on two sheets with a flipped sign is found across the upload, in the lines of each sheet', async () => {
    const a = sheetInput(fileOf(H, [row('a', 64.6012, 50.9623), row('b', 64.6013, 50.9621, '2020-06-02')], 'A', { fileName: 'one.csv' }), { quantity: { kind: 'count' } });
    const b = sheetInput(fileOf(H, [row('c', 64.6011, -50.9625, '2020-06-03')], 'B', { fileName: 'two.csv' }), { quantity: { kind: 'count' } });
    const e = await exportSheets([a, b]);
    const f = e.findings.filter((x) => x.ruleId === 'ROW-STATION-MOVED');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ sheet: 'B', file: 'two.csv', lines: [2] });
    expect(f[0].params.signLon).toBe('yes');
  });
});
