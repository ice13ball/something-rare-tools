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
import { pivotConvertFile } from '../../src/core/convert/pivot';
import { turnConvertFile } from '../../src/core/convert/turn';
import { renderConvertPlain } from '../../src/core/rules/convert';
import { renderPlain } from '../../src/core/report';
import { validateTables } from '../../src/core/convert/validate';
import { toDataset } from '../../src/core/convert/model';
import { EMPTY_METADATA } from '../../src/core/convert/metadata';
import { xlsxFile } from '../helpers/files';
import type { ParsedFile } from '../../src/core/types';
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
    const sin = sheetInput(file, { quantity: Q, missingCodes: { [DEPTH]: 'missing', [TEMP]: 'missing' } });
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

describe('"these are real values": the second answer', () => {
  it('writes the values as they are, says which answer was given, and raises no question', async () => {
    const e = await exportSheet(header, rows([-98, -99, -100]), { quantity: Q, realCodes: [DEPTH] });
    expect(e.findings.some((x) => x.ruleId === 'ROW-MISSING-CODE')).toBe(false);
    const said = e.findings.filter((x) => x.ruleId === 'CONV-MISSING-CODE-DECLARED');
    expect(said).toHaveLength(1);
    expect(said[0].params).toMatchObject({ column: 'Depth', answer: 'real', count: 1 });
    expect(renderConvertPlain(said[0], 'en')).toMatch(/real values/);
    expect(judge(e.findings).blocking).toEqual([]);
    const b = await readBack(e.zip);
    const samples = objects(b.tables['event.txt']).filter((r) => r.eventType === 'sample');
    expect(samples.map((r) => r.minimumDepthInMeters)).toContain('99');
  });

  it('neither answer is preselected: with no answer the column blocks, whatever its values', async () => {
    const e = await exportSheet(header, rows([-98, -99, -100]), { quantity: Q });
    expect(judge(e.findings).blocking.map((x) => x.ruleId)).toContain('ROW-MISSING-CODE');
  });

  it('"missing" says missing in the note', async () => {
    const e = await exportSheet(header, rows([5, -999, 10]), { quantity: Q, missingCodes: [DEPTH] });
    const said = e.findings.find((x) => x.ruleId === 'CONV-MISSING-CODE-DECLARED')!;
    expect(said.params.answer).toBe('missing');
    expect(renderConvertPlain(said, 'en')).toMatch(/treated as missing/);
  });
});

describe('the preview and the wording', () => {
  it('validateTables (the page preview) raises no output-table copy of ROW-MISSING-CODE', () => {
    const file = fileOf(header, rows([5, -999, 10], [7.5, -99, 7.7]), 'S');
    const r = convert({ sheets: [sheetInput(file, { quantity: Q })], options: { today: '2026-10-25' }, approvedSplits: {} });
    const ds = toDataset(r, EMPTY_METADATA, {} as never);
    const all = [...r.findings, ...validateTables(ds, r.findings, { today: '2026-10-25' })].filter((f) => f.ruleId === 'ROW-MISSING-CODE');
    expect(all.map((f) => f.field).sort()).toEqual(['Depth', 'Temp [°C]']);
  });

  it('on /convert (the finding has an index) the text says the export waits for the answer; on /check it does not', () => {
    const file = fileOf(header, rows([5, -999, 10]), 'S');
    const f = convert({ sheets: [sheetInput(file, { quantity: Q })], options: { today: '2026-10-25' }, approvedSplits: {} }).findings.find((x) => x.ruleId === 'ROW-MISSING-CODE')!;
    expect(renderPlain(f, 'en')).toMatch(/waits for your answer/);
    expect(renderPlain(f, 'en')).not.toMatch(/kept as written/);
    expect(renderPlain({ ...f, params: { column: f.params.column, count: 1 } }, 'en')).toMatch(/kept as written/);
  });
});

describe('a -999 count is one finding', () => {
  it('a wide sheet: ROW-MISSING-CODE only while unanswered (the negative count is not said again); answered "real" the negative count blocks', async () => {
    const H = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Calanus finmarchicus', 'Oithona similis'];
    const R: Cell[][] = [['S1', 's1', '2023-06-14', 55.5, 2.5, -999, 3], ['S1', 's2', '2023-06-14', 55.5, 2.5, 4, 2]];
    const e = await exportSheet(H, R, { quantity: Q });
    expect(e.findings.filter((x) => x.ruleId === 'ROW-MISSING-CODE')).toHaveLength(1);
    expect(e.findings.some((x) => x.ruleId === 'CONV-NEGATIVE-QUANTITY')).toBe(false);
    const real = await exportSheet(H, R, { quantity: Q, realCodes: [5] });
    expect(real.findings.some((x) => x.ruleId === 'CONV-NEGATIVE-QUANTITY')).toBe(true);
  });
});

describe('a pivoted and a turned sheet name the lines of the file', () => {
  it('pivoted long sheet: the note and the list name the long file\'s lines, the column and the reason', () => {
    const H = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Parameter', 'Unit', 'Value'];
    const R: Cell[][] = [
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Temperature', 'degC', 8.1],
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Salinity', 'PSU', -999],
      ['ZL1', '2023-06-14', 55.5, 2.5, 10, 'Temperature', 'degC', -99],
      ['ZL1', '2023-06-14', 55.5, 2.5, 10, 'Salinity', 'PSU', 34.4],
    ];
    const file = pivotConvertFile(fileOf(H, R, 'S'));
    const base = { profile: { depthIds: true } };
    const asked = convert({ sheets: [sheetInput(file, base)] }).findings.filter((f) => f.ruleId === 'ROW-MISSING-CODE');
    const idx = Object.fromEntries(asked.map((f) => [String(f.field), Number(f.params.index)]));
    expect(asked.map((f) => f.lines).sort()).toEqual([[3], [4]]);
    const sin = sheetInput(file, { ...base, missingCodes: Object.fromEntries(Object.values(idx).map((i) => [i, 'missing' as const])) });
    const r = convert({ sheets: [sin] });
    const said = r.findings.filter((f) => f.ruleId === 'CONV-MISSING-CODE-DECLARED');
    expect(said.map((f) => f.lines).sort()).toEqual([[3], [4]]);
    expect(r.measurements.map((m) => String((m as { value?: unknown }).value ?? '')).join(' ')).not.toMatch(/-999|-99\b/);
    const list = [...notWrittenRows(r.ledger, [sin])].filter((x) => x.kind === 'line' && x.reason === 'missing-code');
    expect(list.map((x) => x.line)).toEqual([3, 4]);
    expect(list.every((x) => x.status === 'understood')).toBe(true);
    expect(list.map((x) => x.detail).join(' ')).toMatch(/Salinity.*missing-code/);
    expect([...notWrittenRows(r.ledger, [sin])].some((x) => x.reason === 'nothing-to-record' || x.detail.includes('Unit'))).toBe(false);
    expect(countNotWritten(r.ledger).rows).toBe(2);
  });

  it('turned sheet: the note and the list name the source line and the sample column, not a synthetic line', () => {
    const raw = xlsxFile('book.xlsx', { Taxa: [['Taxon', 'S1', 'S2', 'Total'], ['Calanus finmarchicus', 4, -999, 4], ['Oithona similis', 1, 2, 3]] });
    const file = turnConvertFile(raw, { Taxa: { nameColumn: 0, notSamples: [3] } });
    const of: ParsedFile = { ...file, sheets: file.sheets.filter((s) => s.name === 'Taxa') };
    const base = { shape: 'wide' as const, quantity: { kind: 'count' as const } };
    const asked = convert({ sheets: [sheetInput(of, base)] }).findings.filter((f) => f.ruleId === 'ROW-MISSING-CODE');
    expect(asked).toHaveLength(1);
    expect(asked[0].lines).toEqual([2]);
    const sin = sheetInput(of, { ...base, missingCodes: { [Number(asked[0].params.index)]: 'missing' } });
    const r = convert({ sheets: [sin] });
    expect(r.findings.find((f) => f.ruleId === 'CONV-MISSING-CODE-DECLARED')!.lines).toEqual([2]);
    const all = [...notWrittenRows(r.ledger, [sin])];
    const list = all.filter((x) => x.detail.includes('missing-code'));
    expect(list.map((x) => x.line)).toEqual([2]);
    expect(list[0].detail).toContain('S2 (missing-code)');
    expect(list.every((x) => (x.line ?? 0) < 1000)).toBe(true);
  });
});
