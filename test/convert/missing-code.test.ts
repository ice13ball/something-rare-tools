// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// K2 in the converter: -99, -999 and -9999 in a depth or measurement column BLOCK the export (ROW-MISSING-CODE) until the person answers "treat as missing" for that column. The answer leaves the
// cells out of the archive (never written as a value, never rewritten to anything else) and lists them in the list of rows not written with the reason `missing-code`.
// A depth of -999 in the archive is the failure this file guards. Every value is invented.
import { describe, expect, it } from 'vitest';
import { judge, policyOf } from '../../src/core/convert/policy';
import { convert } from '../../src/core/convert/build';
import { countNotWritten, notWrittenRows } from '../../src/core/convert/notWritten';
import { exportSheet, objects, readBack } from './exportHelpers';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const header = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Depth', 'Temp [°C]', 'Species', 'Count'];
const rows = (depths: Cell[], temps: Cell[] = depths.map(() => 7.5)): Cell[][] => depths.map((d, i) => ['S1', `s${i + 1}`, '2023-06-14', 55.5, 2.5, d, temps[i], 'Calanus finmarchicus', 4 + i]);
const Q = { kind: 'count' as const };
const DEPTH = 5;
const TEMP = 6;

describe('a depth or a measurement of -999 through the converter', () => {
  it('blocks the export before the answer: ROW-MISSING-CODE is a block, once per column, with the source column and lines', async () => {
    const e = await exportSheet(header, rows([5, -999, 10], [7.5, -99, 7.7]), { quantity: Q });
    const f = e.findings.filter((x) => x.ruleId === 'ROW-MISSING-CODE');
    expect(f.map((x) => x.field).sort()).toEqual(['Depth', 'Temp [°C]']);
    for (const x of f) expect(policyOf(x)).toBe('block');
    expect(judge(e.findings).blocking.map((x) => x.ruleId)).toContain('ROW-MISSING-CODE');
    expect(e.files).toEqual([]);
    const d = f.find((x) => x.field === 'Depth')!;
    expect(d.lines).toEqual([3]);
    expect(d.value).toBe('-999');
    expect(d.params).toMatchObject({ column: 'Depth', index: DEPTH, count: 1 });
    // one finding per column: the dataset-level copy (minimumDepthInMeters ...) is not raised on top
    expect(e.findings.filter((x) => x.ruleId === 'ROW-MISSING-CODE')).toHaveLength(2);
  });

  it('after the answer for the depth and the measurement column no -999 or -99 is in the archive, and the station depth is no longer -999', async () => {
    const e = await exportSheet(header, rows([5, -999, 10], [7.5, -99, 7.7]), { quantity: Q, missingCodes: [DEPTH, TEMP] });
    expect(e.findings.some((x) => x.ruleId === 'ROW-MISSING-CODE')).toBe(false);
    expect(judge(e.findings).blocking).toEqual([]);
    const said = e.findings.filter((x) => x.ruleId === 'CONV-MISSING-CODE-DECLARED');
    expect(said.map((x) => x.params.column).sort()).toEqual(['Depth', 'Temp [°C]']);
    expect(said.find((x) => x.params.column === 'Depth')!.params).toMatchObject({ count: 1, index: DEPTH });
    for (const x of said) expect(policyOf(x)).toBe('show');
    const b = await readBack(e.zip);
    for (const [name, t] of Object.entries(b.text)) if (name.endsWith('.txt')) expect(t, name).not.toMatch(/(^|\t)-(99|999)(\t|$|\r|\n)/);
    const events = objects(b.tables['event.txt']);
    const station = events.find((r) => r.eventType === 'station' || r.parentEventID === '')!;
    void station;
    for (const r of events) {
      expect(r.minimumDepthInMeters).not.toBe('-999');
      expect(r.maximumDepthInMeters).not.toBe('-999');
    }
    const samples = events.filter((r) => r.eventType === 'sample');
    expect(samples.map((r) => r.minimumDepthInMeters)).toEqual(['5', '', '10']);
    // the station takes its range from the depths that were written
    const parents = events.filter((r) => r.eventType !== 'sample');
    for (const p of parents) expect(p.minimumDepthInMeters === '' || p.minimumDepthInMeters === '5').toBe(true);
  });

  it('lists the cells not written with the reason missing-code (understood, no decision needed), with the original line and the cells as written', () => {
    const file = fileOf(header, rows([5, -999, 10], [7.5, -99, 7.7]), 'S');
    const sin = sheetInput(file, { quantity: Q, missingCodes: [DEPTH, TEMP] });
    const result = convert({ sheets: [sin], options: { today: '2026-10-25' }, approvedSplits: {} });
    const list = [...notWrittenRows(result.ledger, [sin])].filter((r) => r.kind === 'lost-cells');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ line: 3, reason: 'cells-not-written', status: 'understood' });
    expect(list[0].detail).toContain('Depth (missing-code)');
    expect(list[0].detail).toContain('Temp [°C] (missing-code)');
    expect(list[0].cells).toContain(-999);
    expect(list[0].cells).toContain(-99);
    expect(countNotWritten(result.ledger).rows).toBe(1);
  });

  it('reads a decimal comma too: -999,0 is the code', () => {
    const file = fileOf(header, rows(['5,0', '-999,0', '10,0'], ['7,5', '7,6', '7,7']), 'S', { decimalComma: true });
    const sin = sheetInput(file, { quantity: Q });
    const f = convert({ sheets: [sin], options: { today: '2026-10-25' }, approvedSplits: {} }).findings.filter((x) => x.ruleId === 'ROW-MISSING-CODE');
    expect(f.map((x) => x.field)).toEqual(['Depth']);
  });

  it('a column answered that holds no code is untouched, and a code in a column that was not answered still blocks', async () => {
    const e = await exportSheet(header, rows([5, -999, 10], [7.5, -99, 7.7]), { quantity: Q, missingCodes: [DEPTH] });
    expect(e.findings.filter((x) => x.ruleId === 'ROW-MISSING-CODE').map((x) => x.field)).toEqual(['Temp [°C]']);
    const none = await exportSheet(header, rows([5, 6, 10]), { quantity: Q, missingCodes: [DEPTH, TEMP] });
    expect(none.findings.some((x) => x.ruleId === 'CONV-MISSING-CODE-DECLARED' || x.ruleId === 'ROW-MISSING-CODE')).toBe(false);
  });

  it('-998 and -99.5 are values, not codes', async () => {
    const e = await exportSheet(header, rows([5, 6, 10], [-998, -99.5, 7.7]), { quantity: Q });
    expect(e.findings.some((x) => x.ruleId === 'ROW-MISSING-CODE')).toBe(false);
  });
});
