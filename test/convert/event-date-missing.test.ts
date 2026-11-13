// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Round 3, Task 9: a sample without an eventDate blocks the archive (OBIS requires eventDate), in the sheet's terms, and blank date cells can be left out and listed. Invented data only.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { toDataset } from '../../src/core/convert/model';
import { exportAllowed } from '../../src/core/convert/policy';
import { notWrittenRows } from '../../src/core/convert/notWritten';
import { validateTables } from '../../src/core/convert/validate';
import { makeConvertFinding, renderConvertPlain } from '../../src/core/rules/convert';
import type { ColumnRole } from '../../src/core/types';
import { META } from './exportHelpers';
import type { Cell } from './helpers';
import { fileOf, sheetInput } from './helpers';

const BASE: Record<string, ColumnRole> = { Sample: { kind: 'sampleId' }, Taxon: { kind: 'taxon' }, Count: { kind: 'quantity' } };
const sheet = (header: string[], rows: Cell[][], extra: Partial<ConvertSheetInput> = {}, edit: Record<string, ColumnRole> = {}): ConvertSheetInput =>
  sheetInput(fileOf(header, rows, 'Counts', { fileName: 'counts.csv' }), { shape: 'long', quantity: { kind: 'count' }, edit: { ...BASE, ...edit }, ...extra });
const ids = <T extends { ruleId: string }>(fs: readonly T[], id: string): T[] => fs.filter((f) => f.ruleId === id);
const DECISIONS = { fullList: false, prefixStation: false, worms: false, nvs: false };

const H = ['Sample', 'Taxon', 'Count', 'Latitude', 'Longitude', 'Date'];
const row = (sample: string, date: Cell, taxon = 'Calanus finmarchicus'): Cell[] => [sample, taxon, 3, 55.1, 3.2, date];
const SIX: Cell[][] = [row('X01', '2023-04-05'), row('X02', '2023-04-06'), row('X03', '2023-04-07'), row('X04', '2023-04-08'), row('X05', null), row('X06', null)];
const leave = (count: number) => ({ leaveOut: [{ reason: 'no-event-date', count }] });
const run = (rows: Cell[][], extra: Partial<ConvertSheetInput> = {}) => convert({ sheets: [sheet(H, rows, extra)] });

describe('CONV-EVENT-DATE-MISSING', () => {
  it('a sheet with no date role blocks, and the Event table does not repeat it', () => {
    const r = convert({ sheets: [sheet(['Sample', 'Taxon', 'Count', 'Latitude', 'Longitude'], [['X01', 'Calanus finmarchicus', 3, 55.1, 3.2], ['X02', 'Oithona similis', 1, 55.2, 3.3]])] });
    const f = ids(r.findings, 'CONV-EVENT-DATE-MISSING');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ count: 2, how: 'no-date-role' });
    expect(f[0].sheet).toBe('Counts');
    expect(renderConvertPlain(f[0], 'en')).toContain('No column of sheet "Counts" is marked as the date (2 samples).');
    expect(r.ok).toBe(false);
    const tables = validateTables(toDataset(r, META, DECISIONS), r.findings);
    expect(tables.map((x) => x.ruleId)).not.toContain('META-NO-DATES');
    expect(tables.map((x) => x.ruleId)).not.toContain('ROW-DATE-MISSING');
    expect(exportAllowed(r.findings, [])).toBe(false);
  });

  it('blank date cells name their lines; the answer leaves exactly those samples out, and lists them', () => {
    const r = run(SIX);
    const f = ids(r.findings, 'CONV-EVENT-DATE-MISSING');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([6, 7]);
    expect(f[0].params).toMatchObject({ count: 2, rows: 2, how: 'blank-cells' });
    expect(renderConvertPlain(f[0], 'en')).toContain('have no date: the date cells are empty');
    const left = run(SIX, leave(2));
    expect(ids(left.findings, 'CONV-EVENT-DATE-MISSING')).toEqual([]);
    expect(ids(left.findings, 'CONV-ROW-LEFT-OUT')[0].params).toMatchObject({ reason: 'no-event-date', count: 2 });
    expect([...notWrittenRows(left.ledger, [sheet(H, SIX, leave(2))], left.leftOut)].filter((x) => x.kind === 'line').map((x) => [x.line, x.reason, x.status])).toEqual([[6, 'no-event-date', 'left-out'], [7, 'no-event-date', 'left-out']]);
    expect(left.events.filter((e) => e.eventType === 'sample')).toHaveLength(4);
    expect(left.ledger[0].balanced).toBe(true);
    expect(left.ok).toBe(true);
    expect('undated' in left).toBe(false);
  });

  it('an answer for another number does not hold', () => {
    const r = run(SIX, leave(3));
    expect(ids(r.findings, 'CONV-EVENT-DATE-MISSING')).toHaveLength(1);
    expect(r.ok).toBe(false);
  });

  it('Year / Month / Day columns are a date', () => {
    const rows: Cell[][] = [['X01', 'Calanus finmarchicus', 3, 55.1, 3.2, 2023, 4, 5], ['X02', 'Oithona similis', 1, 55.2, 3.3, 2023, 4, 6]];
    const r = convert({ sheets: [sheet(['Sample', 'Taxon', 'Count', 'Latitude', 'Longitude', 'Year', 'Month', 'Day'], rows, {}, { Year: { kind: 'datePart', part: 'year' }, Month: { kind: 'datePart', part: 'month' }, Day: { kind: 'datePart', part: 'day' } })] });
    expect(ids(r.findings, 'CONV-EVENT-DATE-MISSING')).toEqual([]);
  });

  describe('replicates', () => {
    const RH = ['Sample', 'Frame', 'Taxon', 'Count', 'Latitude', 'Longitude', 'Date'];
    const rep = (sample: string, frame: string, date: Cell): Cell[] => [sample, frame, 'Calanus finmarchicus', 3, 55.1, 3.2, date];
    const go = (rows: Cell[][]) => convert({ sheets: [sheet(RH, rows, {}, { Frame: { kind: 'replicate' } })] });
    it('a replicate takes the date of its sample, derived from a dated sibling', () => {
      const r = go([rep('X01', 'a', '2023-04-05'), rep('X01', 'b', null)]);
      expect(ids(r.findings, 'CONV-EVENT-DATE-MISSING')).toEqual([]);
    });
    it('a sample whose replicates are all blank is one finding naming every line', () => {
      const r = go([rep('X01', 'a', null), rep('X01', 'b', null), rep('X02', 'a', '2023-04-05')]);
      const f = ids(r.findings, 'CONV-EVENT-DATE-MISSING');
      expect(f).toHaveLength(1);
      expect(f[0].params).toMatchObject({ count: 1, rows: 2 });
      expect(f[0].lines).toEqual([2, 3]);
    });
  });

  describe('cells that are filled but unreadable are not "no date" (F8)', () => {
    const rows = (a: Cell[], b: Cell[]): Cell[][] => [row('X01', '2023-04-05'), row('X02', '2023-04-06'), a, b, row('X04', '2023-04-08')];
    it('the same sample: a blank line beside an unreadable one', () => {
      const r = run(rows(row('X03', '31/02/2023'), row('X03', null, 'Oithona similis')));
      const f = ids(r.findings, 'CONV-EVENT-DATE-MISSING');
      expect(f).toHaveLength(1);
      expect(f[0].lines).toEqual([5]);
      expect(f[0].params).toMatchObject({ count: 1, rows: 1 });
      expect(ids(r.findings, 'ROW-DATE-UNPARSEABLE')[0].lines).toContain(4);
      const left = run(rows(row('X03', '31/02/2023'), row('X03', null, 'Oithona similis')), leave(1));
      expect(ids(left.findings, 'CONV-EVENT-DATE-MISSING')).toEqual([]);
      expect(ids(left.findings, 'CONV-ROW-LEFT-OUT')[0].lines).toEqual([5]);
      expect(ids(left.findings, 'ROW-DATE-UNPARSEABLE')[0].lines).toContain(4);
      expect(exportAllowed(left.findings, [])).toBe(false);
    });
    it('two samples: only the one with a blank line is counted', () => {
      const r = run(rows(row('X03', '31/02/2023'), row('X05', null)));
      const f = ids(r.findings, 'CONV-EVENT-DATE-MISSING');
      expect(f).toHaveLength(1);
      expect(f[0].lines).toEqual([5]);
      expect(f[0].params).toMatchObject({ count: 1, rows: 1 });
      expect(ids(r.findings, 'ROW-DATE-UNPARSEABLE')[0].lines).toContain(4);
      const left = run(rows(row('X03', '31/02/2023'), row('X05', null)), leave(1));
      expect(ids(left.findings, 'CONV-EVENT-DATE-MISSING')).toEqual([]);
      expect(ids(left.findings, 'CONV-ROW-LEFT-OUT')[0].lines).toEqual([5]);
      expect(ids(left.findings, 'ROW-DATE-UNPARSEABLE')[0].lines).toContain(4);
    });
    it('only unreadable cells and no blank: no finding of this rule at all', () => {
      const r = run(rows(row('X03', '31/02/2023'), row('X05', '30/02/2023')));
      expect(ids(r.findings, 'CONV-EVENT-DATE-MISSING')).toEqual([]);
      expect(ids(r.findings, 'ROW-DATE-UNPARSEABLE').length).toBeGreaterThan(0);
    });
  });

  it('a sample never takes the date of a sibling at its station', () => {
    const H2 = ['Station', 'Sample', 'Taxon', 'Count', 'Latitude', 'Longitude', 'Date'];
    const r = convert({ sheets: [sheet(H2, [['ST-1', 'X01', 'Calanus finmarchicus', 3, 55.1, 3.2, '2023-04-05'], ['ST-1', 'X02', 'Calanus finmarchicus', 3, 55.1, 3.2, null]])] });
    const f = ids(r.findings, 'CONV-EVENT-DATE-MISSING');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ count: 1 });
    expect(f[0].lines).toEqual([3]);
  });

  it('a turned sheet is told to fill in the date row or column, with no leave-out offered (variant text; Task 14 selects it)', () => {
    const f = makeConvertFinding('CONV-EVENT-DATE-MISSING', { file: 'counts.csv', sheet: 'Counts', params: { count: 3, rows: 3, how: 'blank-cells', turned: 'yes' } });
    expect(renderConvertPlain(f, 'en')).toBe('3 samples of sheet "Counts" have no date. Fill in the date row or column, or join the sheet that describes the samples.');
  });

  it('a sample whose only dates are ambiguous and undeclared is asked about by the date-order rule and is not also called undated', () => {
    const rows: Cell[][] = [row('X01', '5/4/2023'), row('X02', '6/7/2023')];
    const r = run(rows);
    expect(ids(r.findings, 'CONV-DATE-ORDER-UNDECLARED').length).toBeGreaterThan(0);
    expect(ids(r.findings, 'CONV-EVENT-DATE-MISSING')).toEqual([]);
  });
});
