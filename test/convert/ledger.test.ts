// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The ledger (core/convert/ledger.ts): where every source row, taxon cell and numeric column went. Each test reads the ledger and then reads the WRITTEN records on its own, never a number taken
// from the rule. Every row is invented.
import { describe, expect, it, vi } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import type { SheetLedger } from '../../src/core/convert/ledger';
import { Sum, buildSheetLedger, FateLog, notUsedLedger, sameSum, shownSum } from '../../src/core/convert/ledger';
import { pivotConvertFile } from '../../src/core/convert/pivot';
import { readConvertFile } from '../../src/core/convert/read';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { csvOf, W1_CSV } from '../app/convertHelpers';
import { textFile } from '../helpers/files';
import type { ColumnRole } from '../../src/core/types';
import { L1_HEADER, L1_ROWS, L2_HEADER, L2_ROWS, W1_HEADER, W1_QUANTITY, W1_ROWS, W2_HEADER, W2_QUANTITY, W2_ROWS, fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const skippedOf = (t: { skipped: { reason: string; count: number }[] }, reason: string): number => t.skipped.find((s) => s.reason === reason)?.count ?? 0;
const total = (t: SheetLedger['rows']): number => t.written + t.skipped.reduce((n, s) => n + s.count, 0) + t.unexplained;

/** Everything the ledger says about rows must add up, and must agree with the records. */
function expectRowsAgree(l: SheetLedger, result: ReturnType<typeof convert>, rowCount: number): void {
  expect(l.rows.source).toBe(rowCount);
  expect(total(l.rows)).toBe(l.rows.source);
  expect(l.rows.unexplained).toBe(0);
  expect(l.balanced).toBe(true);
  // the rows written are the distinct source lines of the written occurrences, read from the records
  expect(l.rows.written).toBe(new Set(result.occurrences.map((o) => o.source.line)).size);
}

describe('ledger: wide sheets', () => {
  const sheet = (): ConvertSheetInput => sheetInput(fileOf(W1_HEADER, W1_ROWS), { quantity: W1_QUANTITY, device: { kind: 'known', key: 'multinet' } });

  it('W1: every taxon cell is an occurrence or has a reason; the sums match the written quantities', () => {
    const r = convert({ sheets: [sheet()], options: { fullList: false } });
    const [l] = r.ledger;
    expect(l.kind).toBe('wide');
    expect(l.unit).toBe('cells');
    expectRowsAgree(l, r, W1_ROWS.length);
    // 9 taxon cells: 7 written, one zero, one empty (not a cell), one NA
    const cells = l.cells!;
    expect(cells.written).toBe(r.occurrences.length);
    expect(cells.source).toBe(cells.written + skippedOf(cells, 'zero') + skippedOf(cells, 'na-cell'));
    expect(skippedOf(cells, 'zero')).toBe(r.stats.zerosSkipped);
    expect(cells.unexplained).toBe(0);
    // the sum in a taxon column against the sum the occurrences carry, computed here from the records
    const taxa = l.columns.filter((c) => c.to === 'occurrence');
    expect(taxa).toHaveLength(3);
    const carried = r.occurrences.reduce((n, o) => n + Number(o.quantityText), 0);
    expect(taxa.reduce((n, c) => n + c.outSum, 0)).toBeCloseTo(carried, 9);
    expect(taxa.every((c) => c.match)).toBe(true);
    // the zero is in the sum "in" and in the skipped, not lost
    for (const c of taxa) expect(c.sum).toBeCloseTo(c.writtenSum + c.skipped.reduce((n, s) => n + s.sum, 0), 9);
  });

  it('W1 with the full list ticked: the zero is an absence, written, and carried as 0', () => {
    const r = convert({ sheets: [sheet()], options: { fullList: true } });
    const l = r.ledger[0];
    expect(l.cells!.written).toBe(r.occurrences.length);
    expect(skippedOf(l.cells!, 'zero')).toBe(0);
    expect(l.balanced).toBe(true);
  });

  it('W2: a density with life stages, sums in and out agree', () => {
    const r = convert({ sheets: [sheetInput(fileOf(W2_HEADER, W2_ROWS), { quantity: W2_QUANTITY, device: { kind: 'known', key: 'multinet' } })], options: {} });
    const l = r.ledger[0];
    expectRowsAgree(l, r, W2_ROWS.length);
    const out = r.occurrences.reduce((n, o) => n + Number(o.quantityText ?? 0), 0);
    const taxa = l.columns.filter((c) => c.to === 'occurrence');
    expect(taxa.reduce((n, c) => n + c.outSum, 0)).toBeCloseTo(out, 9);
    expect(taxa.reduce((n, c) => n + c.writtenSum, 0)).toBeCloseTo(out, 9);
  });

  it('a numeric column that is ignored is listed as not written, with its sum', () => {
    const header = ['Sample', 'Station', 'Calanus finmarchicus', 'Mesh code'];
    const f = fileOf(header, [['A1', 'S', 4, 7], ['A2', 'S', 6, 8.5]]);
    const r = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' }, edit: { 'Mesh code': { kind: 'ignore' } } })], options: {} });
    const c = r.ledger[0].columns.find((x) => x.header === 'Mesh code')!;
    expect(c.to).toBe('not-written');
    expect(c.sum).toBe(15.5);
    expect(c.written).toBe(0);
    expect(c.skipped).toEqual([{ reason: 'column-not-read', count: 2, sum: 15.5 }]);
  });
});

describe('ledger: long sheets', () => {
  it('L1: one occurrence per row', () => {
    const r = convert({ sheets: [sheetInput(fileOf(L1_HEADER, L1_ROWS), { quantity: { kind: 'count' }, device: { kind: 'known', key: 'multinet' } })], options: {} });
    const l = r.ledger[0];
    expect(l.kind).toBe('long');
    expect(l.unit).toBe('rows');
    expectRowsAgree(l, r, L1_ROWS.length);
    expect(l.rows.written).toBe(r.occurrences.length);
    const q = l.columns.find((c) => c.to === 'occurrence')!;
    expect(q.header).toBe('individualCount');
    expect(q.outSum).toBe(r.occurrences.reduce((n, o) => n + (o.individualCount ?? 0), 0));
  });

  it('L2: zeros, NA, a summary row and a row with no taxon each have their own reason; the totals add up', () => {
    const rows: Cell[][] = [...L2_ROWS, ['B', 'B1', 'Oithona similis', null, 0, 70.5, 20.9, '2021-08-02', 10], ['B', 'B1', 'Calanus finmarchicus', 'C3', 'NA', 70.5, 20.9, '2021-08-02', 10], ['B', 'B2', null, null, 5, 70.5, 20.9, '2021-08-02', 10], ['Total', 'Total', 'Calanus finmarchicus', null, 99, null, null, null, null]];
    const r = convert({ sheets: [sheetInput(fileOf(L2_HEADER, rows), { quantity: { kind: 'count' }, device: { kind: 'known', key: 'multinet' } })], options: {} });
    const l = r.ledger[0];
    expectRowsAgree(l, r, rows.length);
    expect(skippedOf(l.rows, 'zero')).toBe(1);
    expect(skippedOf(l.rows, 'quantity-blank')).toBe(1);
    expect(skippedOf(l.rows, 'no-taxon')).toBe(1);
    expect(skippedOf(l.rows, 'summary-row')).toBe(1);
    // the count column: 4+6+9+1 written, 0 and the 99 of the summary row are not
    const q = l.columns.find((c) => c.header === 'Count')!;
    expect(q.writtenSum).toBe(20);
    expect(q.outSum).toBe(r.occurrences.reduce((n, o) => n + Number(o.quantityText), 0));
    expect(q.sum).toBe(20 + 0 + 5 + 99);
    expect(q.skipped.find((s) => s.reason === 'summary-row')).toMatchObject({ count: 1, sum: 99 });
  });

  it('a taxon kept for its weight (no count) is written, and counted apart from the rows with a number', () => {
    const header = ['sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count', 'Weight [g]'];
    const edit: Record<string, ColumnRole> = { sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' }, 'Weight [g]': { kind: 'biomass', basis: 'wet' } };
    const rows: Cell[][] = [['a', '2020-06-01', 49.4, 0.2, 'Solea solea', 3, 1.5], ['a', '2020-06-01', 49.4, 0.2, 'Gadus morhua', null, 2.5], ['b', '2020-06-01', 49.4, 0.2, 'Gadus morhua', 0, 4.5]];
    const r = convert({ sheets: [sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' }, edit })], options: {} });
    const l = r.ledger[0];
    expectRowsAgree(l, r, 3);
    expect(l.rows.written).toBe(2);
    expect(l.rows.writtenWithoutNumber).toBe(1);
    expect(skippedOf(l.rows, 'zero-with-biomass')).toBe(1);
    expect(l.rows.written - l.rows.writtenWithoutNumber!).toBe(r.occurrences.filter((o) => o.quantityText !== undefined).length);
  });

  it('a total taken once: the repeats are in the ledger as repeat-total, and the sum written is the collapsed one', () => {
    const header = ['sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Size', 'Quantity'];
    const edit: Record<string, ColumnRole> = { sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Quantity: { kind: 'quantity' } };
    const rows: Cell[][] = [];
    for (let s = 1; s <= 8; s++) for (const t of ['Solea solea', 'Merlangius merlangus']) for (let c = 0; c < 3; c++) rows.push([`s${s}`, '2020-06-01', 49.4 + s / 100, 0.2, t, 8 + c, 20 + 7 * s]);
    const r = convert({ sheets: [sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' }, edit, totalOnce: true })], options: {} });
    const l = r.ledger[0];
    expectRowsAgree(l, r, rows.length);
    expect(skippedOf(l.rows, 'repeat-total')).toBe(rows.length - r.occurrences.length);
    const q = l.columns.find((c) => c.header === 'Quantity')!;
    expect(q.written + q.skipped.reduce((n, s) => n + s.count, 0)).toBe(q.numbers);
    // the sum in is three times the sum written, and the ledger does not hide the difference
    expect(q.sum).toBe(q.writtenSum * 3);
    expect(q.outSum).toBe(q.writtenSum);
    expect(q.match).toBe(true);
  });

  it('copies that are dropped: the dropped rows are counted with their sum', () => {
    const header = ['sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Quantity'];
    const edit: Record<string, ColumnRole> = { sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Quantity: { kind: 'quantity' } };
    const rows: Cell[][] = [];
    for (let s = 1; s <= 12; s++) rows.push([`s${s}`, '2020-06-01', 49.4, 0.2, 'Solea solea', 3 + s]);
    rows.push(rows[0].slice(), rows[1].slice());
    const r = convert({ sheets: [sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' }, edit, dropCopies: true })], options: {} });
    const l = r.ledger[0];
    expectRowsAgree(l, r, rows.length);
    expect(skippedOf(l.rows, 'copy-dropped')).toBe(r.occurrences.length === 12 ? 2 : -1);
    const q = l.columns.find((c) => c.header === 'Quantity')!;
    expect(q.skipped.find((s) => s.reason === 'copy-dropped')!.sum).toBe(4 + 5);
  });

  it('a sample variable repeated on the rows of a long sheet is written once and the repeats are named', () => {
    const header = ['sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count', 'Temperature [°C]'];
    const rows: Cell[][] = [['a', '2020-06-01', 49.4, 0.2, 'Solea solea', 2, 11.5], ['a', '2020-06-01', 49.4, 0.2, 'Merlangius merlangus', 3, 11.5]];
    const r = convert({ sheets: [sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' } })], options: {} });
    const t = r.ledger[0].columns.find((c) => c.header.startsWith('Temperature'))!;
    expect(t.to).toBe('measurement');
    expect(t.written).toBe(1);
    expect(t.skipped).toEqual([{ reason: 'repeat-in-sample', count: 1, sum: 11.5 }]);
    expect(t.outSum).toBe(r.measurements.filter((m) => m.role === 'variable').reduce((n, m) => n + Number(m.measurementValue), 0));
  });
});

describe('ledger: profile sheets and sheets not read', () => {
  it('a profile sheet: rows become levels, the unmatched summary row and the empty row have reasons', () => {
    const header = ['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]'];
    const rows: Cell[][] = [['CR1', 'S1', 55.5, 2.5, '2023-06-14', 0, 11.2], ['CR1', 'S1', 55.5, 2.5, '2023-06-14', 10, 10.9], ['CR1', 'Total', null, null, null, null, 22.1], [null, null, null, null, null, null, null]];
    const r = convert({ sheets: [sheetInput(fileOf(header, rows, 'CTD'), { profile: { depthIds: true } })], options: {} });
    const l = r.ledger[0];
    expect(l.kind).toBe('profile');
    expect(l.rows.written).toBe(r.events.filter((e) => e.eventType === 'profile level').length);
    expect(total(l.rows)).toBe(rows.length);
    expect(l.rows.unexplained).toBe(0);
    const t = l.columns.find((c) => c.header.startsWith('Temperature'))!;
    expect(t.outSum).toBe(r.measurements.filter((m) => m.role === 'variable').reduce((n, m) => n + Number(m.measurementValue), 0));
    expect(t.skipped).toEqual([{ reason: 'summary-row', count: 1, sum: 22.1 }]);
  });

  it('a sheet that is not read (transposed or a long environmental one) is in the ledger with every row unread', () => {
    const header = ['Station', 'Parameter', 'Value', 'Unit'];
    const rows: Cell[][] = [['S1', 'Temperature', 11, 'C'], ['S1', 'Salinity', 34, 'PSU'], ['S2', 'Temperature', 12, 'C']];
    const r = convert({ sheets: [sheetInput(fileOf(header, rows, 'Long'), { shape: 'long', quantity: { kind: 'count' } })], options: {} });
    expect(r.findings.some((f) => f.ruleId === 'CONV-LONG-UNSUPPORTED' || f.ruleId === 'CONV-SHEET-TRANSPOSED')).toBe(true);
    expect(r.ledger).toHaveLength(1);
    expect(r.ledger[0].kind).toBe('not-read');
    expect(skippedOf(r.ledger[0].rows, 'sheet-not-read')).toBe(3);
  });
});

describe('ledger: the columns are read from what was written', () => {
  const base = ['Sample', 'Date', 'Latitude', 'Longitude'];
  const fr = (s: string): Cell[] => [s, '2020-06-01', 49.4, 0.2];
  const colOf = (l: SheetLedger, h: string) => l.columns.find((c) => c.header === h)!;

  it('a volume column the conversion does not read (no sample size declared) is "not written", CONV-COLUMN-NOT-EXPORTED says so, and the sheet does not claim to be settled', () => {
    const edit: Record<string, ColumnRole> = { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' } };
    const r = convert({ sheets: [sheetInput(fileOf([...base, 'Volume filtered [m3]', 'Species', 'Count'], [[...fr('a'), 10, 'Solea solea', 3], [...fr('b'), 20, 'Gadus morhua', 4]]), { shape: 'long', quantity: { kind: 'count' }, edit })], options: {} });
    const c = colOf(r.ledger[0], 'Volume filtered [m3]');
    expect(r.findings.some((f) => f.ruleId === 'CONV-COLUMN-NOT-EXPORTED' && String(f.params.columns).includes('Volume filtered'))).toBe(true);
    expect(c.to).toBe('not-written');
    expect(c.sum).toBe(30);
    // and the event columns the conversion does read are events, not "not written"
    expect(colOf(r.ledger[0], 'Latitude').to).toBe('event');
  });

  it('with the sample size declared as a column, the same column is read for the events', () => {
    const edit: Record<string, ColumnRole> = { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' }, 'Volume filtered [m3]': { kind: 'effort', unit: 'm3' } };
    const r = convert({ sheets: [sheetInput(fileOf([...base, 'Volume filtered [m3]', 'Species', 'Count'], [[...fr('a'), 10, 'Solea solea', 3], [...fr('b'), 20, 'Gadus morhua', 4]]), { shape: 'long', quantity: { kind: 'count', effort: { source: 'column' } }, edit })], options: {} });
    expect(colOf(r.ledger[0], 'Volume filtered [m3]').to).toBe('event');
  });

  it('a numeric occurrenceID on a wide sheet is not written, and is said', () => {
    const r = convert({ sheets: [sheetInput(fileOf([...base, 'occurrenceID', 'Calanus finmarchicus'], [[...fr('a'), 101, 4], [...fr('b'), 102, 5]]), { shape: 'wide', quantity: { kind: 'count' } })], options: {} });
    expect(colOf(r.ledger[0], 'occurrenceID').to).toBe('not-written');
  });

  it('presence only with numeric marks: the cells are written as marks, with no value of their own, and nothing is unexplained', () => {
    const r = convert({ sheets: [sheetInput(fileOf([...base, 'Calanus finmarchicus', 'Oithona similis'], [[...fr('a'), 1, 0], [...fr('b'), 1, 1]]), { shape: 'wide', presenceOnly: true })], options: {} });
    const l = r.ledger[0];
    expect(l.balanced).toBe(true);
    expect(l.cells!.unexplained).toBe(0);
    const c = colOf(l, 'Calanus finmarchicus');
    expect(c.written).toBe(2);
    expect(c.writtenWithoutValue).toBe(2);
    expect(c.unexplained).toBe(0);
    expect(c.match).toBe(true);
  });

  it('presence only with a full list: a present mark is not an absence', () => {
    const r = convert({ sheets: [sheetInput(fileOf([...base, 'Calanus finmarchicus', 'Oithona similis'], [[...fr('a'), 1, 0], [...fr('b'), 'x', 1]]), { shape: 'wide', presenceOnly: true })], options: { fullList: true } });
    const l = r.ledger[0];
    expect(l.balanced).toBe(true);
    for (const c of l.columns) expect(c.skipped.map((x) => x.reason)).not.toContain('absent-record');
    expect(r.occurrences.filter((o) => o.occurrenceStatus === 'absent')).toHaveLength(1);
  });

  it('a total taken once next to a per-organism column: nothing is unexplained', () => {
    const header = [...base, 'Species', 'Size', 'Quantity', 'Weight [g]', 'Length [cm]'];
    const rows: Cell[][] = [];
    for (let s = 1; s <= 8; s++) for (const t of ['Solea solea', 'Merlangius merlangus']) for (let c = 0; c < 3; c++) rows.push([`s${s}`, '2020-06-01', 49.4 + s / 100, 0.2, t, 8 + c, 20 + 7 * s, 100 + s, 8 + c + 0.5]);
    const edit: Record<string, ColumnRole> = { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Quantity: { kind: 'quantity' }, 'Weight [g]': { kind: 'biomass', basis: 'wet' }, 'Length [cm]': { kind: 'variable', variable: 'Length', unit: 'cm', perOccurrence: true }, Size: { kind: 'ignore' } };
    const r = convert({ sheets: [sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' }, totalOnce: true, edit })], options: {} });
    const l = r.ledger[0];
    expect(l.columns.map((c) => [c.header, c.unexplained]).filter(([, u]) => u !== 0)).toEqual([]);
    expect(l.balanced).toBe(true);
    // what the records carry is what the ledger says it carries
    const out = r.measurements.filter((m) => m.role === 'variable').reduce((n, m) => n + Number(m.measurementValue), 0);
    expect(colOf(l, 'Length [cm]').outSum).toBeCloseTo(out, 9);
  });

  it('text where a number is expected is shown, with its count: "5 g" is not read', () => {
    const edit: Record<string, ColumnRole> = { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' }, 'Weight [g]': { kind: 'biomass', basis: 'wet' } };
    const r = convert({ sheets: [sheetInput(fileOf([...base, 'Species', 'Count', 'Weight [g]'], [[...fr('a'), 'Solea solea', 3, '5 g'], [...fr('b'), 'Gadus morhua', 4, '2 g'], [...fr('c'), 'Gadus morhua', 5, 2.5]]), { shape: 'long', quantity: { kind: 'count' }, edit })], options: {} });
    const c = colOf(r.ledger[0], 'Weight [g]');
    expect(c.numbers).toBe(1);
    expect(c.nonNumbers).toBe(2);
    // and a column of nothing but such text is still listed
    const r2 = convert({ sheets: [sheetInput(fileOf([...base, 'Species', 'Count', 'Weight [g]'], [[...fr('a'), 'Solea solea', 3, '5 g'], [...fr('b'), 'Gadus morhua', 4, '2 g']]), { shape: 'long', quantity: { kind: 'count' }, edit })], options: {} });
    expect(colOf(r2.ledger[0], 'Weight [g]')).toMatchObject({ numbers: 0, nonNumbers: 2 });
  });

  it('a sheet read as one row per sample reports the rows of the long sheet it was made of', () => {
    const longH = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth [m]', 'Parameter', 'Value', 'Unit'];
    const longR: Cell[][] = [];
    for (const st of ['S1', 'S2']) for (const d of [5, 10]) for (const [p, v, u] of [['Temperature', 11 + d, 'C'], ['Salinity', 34, 'PSU'], ['Oxygen', 6, 'mg/L']] as [string, number, string][]) longR.push([st, '2020-06-01', 49.4, 0.2, d, p, v, u]);
    const piv = pivotConvertFile(fileOf(longH, longR, 'Long'), {});
    const r = convert({ sheets: [sheetInput(piv, { shape: 'wide' })], options: {} });
    expect(r.ledger[0].pivotRowsIn).toBe(12);
    expect(r.ledger[0].rows.source).toBe(4);
  });

  it('a sheet the user left out is in the ledger as not used', () => {
    const f = fileOf(['Sample', 'Calanus finmarchicus'], [['a', 1], ['b', 2]], 'Skipped');
    const l = notUsedLedger('f.csv', f.sheets[0]);
    expect(l).toMatchObject({ kind: 'not-used', rows: { source: 2, written: 0, skipped: [{ reason: 'sheet-not-used', count: 2 }] } });
  });
});

describe('ledger: "event" is what the written events carry, not what was read', () => {
  const sheetOf = (header: string[], rows: Cell[][], edit: Record<string, ColumnRole>) =>
    convert({ sheets: [sheetInput(fileOf(header, rows), { shape: 'wide', quantity: { kind: 'count' }, edit, device: { kind: 'known', key: 'multinet' } })], options: {} });
  const colOf = (l: SheetLedger, h: string) => l.columns.find((c) => c.header === h)!;

  it('Month and Day with no Year are read and write nothing: not written (a Year makes them a date)', () => {
    const edit: Record<string, ColumnRole> = { Sample: { kind: 'sampleId' }, Month: { kind: 'datePart', part: 'month' }, Day: { kind: 'datePart', part: 'day' }, Latitude: { kind: 'latitude' }, Longitude: { kind: 'longitude' } };
    const r = sheetOf(['Sample', 'Month', 'Day', 'Latitude', 'Longitude', 'Calanus finmarchicus'], [['a', 5, 12, 49.4, 0.2, 3], ['b', 6, 3, 49.5, 0.3, 4]], edit);
    expect(r.events.some((e) => e.eventDate !== undefined && !e.derived.date)).toBe(false);
    expect(colOf(r.ledger[0], 'Month').to).toBe('not-written');
    expect(colOf(r.ledger[0], 'Day').to).toBe('not-written');
    // the position was written
    expect(colOf(r.ledger[0], 'Latitude').to).toBe('event');
    const withYear = sheetOf(['Sample', 'Year', 'Month', 'Day', 'Latitude', 'Longitude', 'Calanus finmarchicus'], [['a', 2020, 5, 12, 49.4, 0.2, 3], ['b', 2020, 6, 3, 49.5, 0.3, 4]], { ...edit, Year: { kind: 'datePart', part: 'year' } });
    expect(withYear.events.some((e) => e.eventDate === '2020-05-12')).toBe(true);
    for (const h of ['Year', 'Month', 'Day']) expect(colOf(withYear.ledger[0], h).to, h).toBe('event');
  });

  it('a Time with no date is read and writes nothing: not written; with a date it is written', () => {
    const edit: Record<string, ColumnRole> = { Sample: { kind: 'sampleId' }, Time: { kind: 'time' }, Latitude: { kind: 'latitude' }, Longitude: { kind: 'longitude' } };
    const r = sheetOf(['Sample', 'Time', 'Latitude', 'Longitude', 'Calanus finmarchicus'], [['a', '03:17', 49.4, 0.2, 3], ['b', '04:02', 49.5, 0.3, 4]], edit);
    expect(colOf(r.ledger[0], 'Time').to).toBe('not-written');
    const withDate = sheetOf(['Sample', 'Date', 'Time', 'Latitude', 'Longitude', 'Calanus finmarchicus'], [['a', '2020-06-01', '03:17', 49.4, 0.2, 3], ['b', '2020-06-01', '04:02', 49.5, 0.3, 4]], { ...edit, Date: { kind: 'date' } });
    expect(colOf(withDate.ledger[0], 'Time').to).toBe('event');
    expect(colOf(withDate.ledger[0], 'Date').to).toBe('event');
  });

  it('a record that should carry the value of its cell and carries none is a mismatch outside a presence sheet, and is counted apart on a presence sheet', () => {
    const fate = new FateLog(1);
    const sheet = fileOf(['Sample', 'Calanus finmarchicus'], [['A', 10]]).sheets[0];
    const occ = fate.from({ id: 'o', eventId: 'e', verbatimIdentification: 'x', scientificName: 'x', occurrenceStatus: 'present' as const, source: { file: 'f', sheet: 's', line: sheet.rows[0].line, column: 'x' } }, 1);
    const base = { file: 'f', sheet, kind: 'wide' as const, mapping: { sheet: 'S', columns: [{ index: 0, header: 'Sample', role: { kind: 'sampleId' } as ColumnRole }, { index: 1, header: 'Calanus finmarchicus', role: { kind: 'taxon', header: true } as ColumnRole }] }, decimalComma: false, fate, taxonColumns: [1], occurrenceColumns: [1], measurementColumns: [], eventColumns: [0], hasTaxa: true, occurrences: [occ], measurements: [] };
    const plain = buildSheetLedger(base);
    expect(plain.columns.find((c) => c.header === 'Calanus finmarchicus')).toMatchObject({ valueMissing: 1, writtenWithoutValue: 0, match: false });
    expect(plain.balanced).toBe(false);
    const presence = buildSheetLedger({ ...base, presence: true });
    expect(presence.columns.find((c) => c.header === 'Calanus finmarchicus')).toMatchObject({ valueMissing: 0, writtenWithoutValue: 1, match: true });
  });
});

describe('ledger: sums are honest', () => {
  it('floating-point noise is no mismatch: 0.1 + 0.2 + 0.3 in any order', () => {
    const a = new Sum();
    const b = new Sum();
    for (const x of [0.1, 0.2, 0.3]) a.add(x);
    for (const x of [0.3, 0.2, 0.1]) b.add(x);
    expect(0.1 + 0.2 + 0.3).not.toBe(0.3 + 0.2 + 0.1);
    expect(sameSum(a, b)).toBe(true);
    expect(shownSum(a.value)).toBe(0.6);
  });

  it('the tolerance is tight: 9 on a sum of 10 000 000 000 is a difference, an overflow both sides share is none', () => {
    const a = new Sum();
    const b = new Sum();
    for (let i = 0; i < 1000; i++) {
      a.add(1e7);
      b.add(1e7);
    }
    a.add(0.5);
    b.add(9.5);
    expect(sameSum(a, b)).toBe(false);
    const c = new Sum();
    const d = new Sum();
    c.add(1e308);
    c.add(1e308);
    d.add(1e308);
    d.add(1e308);
    expect(sameSum(c, d)).toBe(true);
    // decimals that are not exact in binary, added in two orders
    const e = new Sum();
    const f = new Sum();
    for (const x of [0.1, 0.7, 0.2, 1.3, 0.3, 2.9]) e.add(x);
    for (const x of [2.9, 0.3, 1.3, 0.2, 0.7, 0.1]) f.add(x);
    expect(sameSum(e, f)).toBe(true);
  });

  it('a value that was really changed is a mismatch, and a lost cell is unexplained: neither is rounded away', () => {
    const sheet = fileOf(['Sample', 'Calanus finmarchicus'], [['A', 10], ['B', 20]]).sheets[0];
    const fate = new FateLog(2);
    const occ = (line: number, qty: string) => fate.from({ id: `o${line}`, eventId: 'e', verbatimIdentification: 'x', scientificName: 'x', occurrenceStatus: 'present' as const, quantityText: qty, source: { file: 'f', sheet: 's', line, column: 'x' } }, 1);
    const base = { file: 'f', sheet, kind: 'wide' as const, mapping: { sheet: 'S', columns: [{ index: 0, header: 'Sample', role: { kind: 'sampleId' } as ColumnRole }, { index: 1, header: 'Calanus finmarchicus', role: { kind: 'taxon', header: true } as ColumnRole }] }, decimalComma: false, fate, taxonColumns: [1], occurrenceColumns: [1], measurementColumns: [], eventColumns: [0], hasTaxa: true, measurements: [] };
    const changed = buildSheetLedger({ ...base, occurrences: [occ(sheet.rows[0].line, '10'), occ(sheet.rows[1].line, '2')] });
    expect(changed.columns.find((c) => c.header === 'Calanus finmarchicus')!.match).toBe(false);
    expect(changed.balanced).toBe(false);
    const lost = buildSheetLedger({ ...base, occurrences: [occ(sheet.rows[0].line, '10')] });
    expect(lost.cells!.unexplained).toBe(1);
    expect(lost.rows.unexplained).toBe(1);
    expect(lost.balanced).toBe(false);
  });
});

describe('ledger: sheets that give no row, sheets left out, and the ledger as an observer', () => {
  it('an empty sheet (a header and no rows) is in the ledger with nothing to account for', () => {
    const r = convert({ sheets: [sheetInput(fileOf(W1_HEADER, [], 'Empty'), { quantity: W1_QUANTITY })], options: {} });
    expect(r.ledger).toHaveLength(1);
    expect(r.ledger[0].rows).toMatchObject({ source: 0, written: 0, skipped: [], unexplained: 0 });
    expect(r.ledger[0].columns).toEqual([]);
    expect(r.ledger[0].balanced).toBe(true);
  });

  it('a units row that is not folded: the sheet is not read, and every row of it is in the ledger as not read', () => {
    const csv = ['station,temp,sal,oxy,depth', 'unitless,degC,PSU,umol/kg,m', 'S1,4.5,high,210,5.0', 'S2,5.5,low,220,6.0', 'S3,6.5,mid,230,7.0'].join('\n');
    const r = convert({ sheets: [sheetInput(readConvertFile(textFile('s.csv', csv)))], options: {} } as never);
    expect(r.findings.map((f) => f.ruleId)).toContain('CONV-SHEET-UNITS-ROW');
    expect(r.ledger).toHaveLength(1);
    expect(r.ledger[0].kind).toBe('not-read');
    expect(skippedOf(r.ledger[0].rows, 'sheet-not-read')).toBe(4);
  });

  it('a sheet left out that was a pivot of a long one counts the rows of the file, not the samples made of them', () => {
    const longH = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth [m]', 'Parameter', 'Value', 'Unit'];
    const longR: Cell[][] = [];
    for (const st of ['S1', 'S2']) for (const d of [5, 10]) for (const [p, v, u] of [['Temperature', 11 + d, 'C'], ['Salinity', 34, 'PSU']] as [string, number, string][]) longR.push([st, '2020-06-01', 49.4, 0.2, d, p, v, u]);
    const piv = pivotConvertFile(fileOf(longH, longR, 'Long'), {});
    expect(piv.sheets[0].rows.length).toBe(4);
    expect(notUsedLedger('f.csv', piv.sheets[0]).rows).toMatchObject({ source: 8, written: 0, skipped: [{ reason: 'sheet-not-used', count: 8 }] });
  });

  it('the worker view: a sheet with use unticked (absent from the request) is "not used", one entry per file, and the converted one keeps its own ledger', async () => {
    const e = createDirectConvertEngine();
    const same = csvOf(['Sample', 'Date', 'Latitude', 'Longitude', 'Calanus finmarchicus'], [['a', '2020-06-01', 49.4, 0.2, 3]]);
    const p = await e.parse([{ name: 'a.csv', bytes: new TextEncoder().encode(W1_CSV), source: 'dropped' }, { name: 'b.csv', bytes: new TextEncoder().encode(same), source: 'dropped' }, { name: 'c.csv', bytes: new TextEncoder().encode(same), source: 'dropped' }]);
    const [a, b, c] = p.files;
    const v = await e.convert({ sheets: [{ fileId: a.fileId, sheet: a.sheets[0].name, mapping: a.mappings[0], shape: 'wide', quantity: { kind: 'count', effort: { source: 'column' } } }], options: {}, approvedSplits: {} });
    expect(v.ledger.map((l) => [l.file, l.kind])).toEqual([['a.csv', 'wide'], ['b.csv', 'not-used'], ['c.csv', 'not-used']]);
    expect(v.ledger[1].rows).toMatchObject({ source: 1, written: 0 });
    expect(b.fileId).not.toBe(c.fileId);
  });

  it('the ledger only observes: with every FateLog call turned into a no-op the records, the findings and the stats are the same', () => {
    const noop = [vi.spyOn(FateLog.prototype, 'row').mockImplementation(() => undefined), vi.spyOn(FateLog.prototype, 'cell').mockImplementation(() => undefined)];
    const from = vi.spyOn(FateLog.prototype, 'from').mockImplementation(<T extends object>(record: T) => record);
    try {
      const inputs = (): ConvertSheetInput[][] => [
        [sheetInput(fileOf(W1_HEADER, W1_ROWS), { quantity: W1_QUANTITY, device: { kind: 'known', key: 'multinet' } })],
        [sheetInput(fileOf(L2_HEADER, L2_ROWS), { shape: 'long', quantity: { kind: 'count' } })],
        [sheetInput(fileOf(['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]'], [['CR1', 'S1', 55.5, 2.5, '2023-06-14', 0, 11.2], ['CR1', 'S1', 'x', 2.5, '2023-06-14', 10, 10.9], ['CR1', 'Total', null, null, null, null, 22.1]], 'CTD'), { profile: { depthIds: true } })],
      ];
      const plain = inputs().map((s) => convert({ sheets: s, options: {} }));
      for (const m of [...noop, from]) m.mockRestore();
      const real = inputs().map((s) => convert({ sheets: s, options: {} }));
      plain.forEach((x, i) => {
        const strip = (r: ReturnType<typeof convert>) => JSON.stringify({ o: r.occurrences, m: r.measurements, e: r.events, f: r.findings, s: r.stats });
        expect(strip(x), `input ${i}`).toBe(strip(real[i]));
      });
    } finally {
      vi.restoreAllMocks();
    }
  });
});
