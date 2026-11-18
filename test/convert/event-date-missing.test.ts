// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Round 3, Task 9: a sample without an eventDate blocks the archive (OBIS requires eventDate), in the sheet's terms, and blank date cells can be left out and listed. Invented data only.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { pivotConvertFile } from '../../src/core/convert/pivot';
import { toDataset } from '../../src/core/convert/model';
import { exportAllowed } from '../../src/core/convert/policy';
import { notWrittenRows } from '../../src/core/convert/notWritten';
import { validateTables } from '../../src/core/convert/validate';
import { makeConvertFinding, renderConvertPlain } from '../../src/core/rules/convert';
import type { ColumnRole } from '../../src/core/types';
import { META } from './exportHelpers';
import type { Cell } from './helpers';
import { fileOf, sheetInput } from './helpers';
import { joinInputs } from '../../src/core/convert/sampleJoin';
import { xlsxFile } from '../helpers/files';
import { descriptionInput, resultsInput } from './joinFixtures';

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

  it('renders in Polish and German with no template code left in the text', () => {
    for (const lang of ['pl', 'de', 'fr'] as const) {
      for (const params of [{ how: 'blank-cells' }, { how: 'no-date-role' }, { how: 'blank-cells', turned: 'yes' }, { how: 'blank-cells', pivoted: 'yes' }] as Record<string, string>[]) {
        const f = makeConvertFinding('CONV-EVENT-DATE-MISSING', { file: 'counts.csv', sheet: 'Counts', params: { count: 2, rows: 2, ...params } });
        const text = renderConvertPlain(f, lang);
        expect(text, `${lang} ${JSON.stringify(params)}`).not.toMatch(/[{}]/);
        if (params.how === 'blank-cells' && Object.keys(params).length === 1 && lang === 'pl') expect(text).toContain('2 próbki arkusza „Counts” nie mają daty');
      }
    }
  });

  it('lines left out do not feed the copies check', () => {
    const copy = row('X05', null);
    const rows = [row('X01', '2023-04-05'), row('X02', '2023-04-06'), copy, [...copy]];
    const before = run(rows);
    expect(before.findings.map((f) => f.ruleId)).toContain('CONV-ROW-COPIES');
    const left = run(rows, leave(2));
    expect(left.findings.map((f) => f.ruleId)).not.toContain('CONV-ROW-COPIES');
    expect(ids(left.findings, 'CONV-ROW-LEFT-OUT')).toHaveLength(1);
  });

  it('a pivoted sheet offers no leave-out: the finding says to fill in the dates, and an answer is not run', () => {
    const raw = fileOf(['Station', 'Date', 'Parameter', 'Value'], [['ZL1', '2023-06-14', 'Calanus finmarchicus', 3], ['ZL1', '2023-06-14', 'Oithona similis', 4], ['ZL2', null, 'Calanus finmarchicus', 5], ['ZL2', null, 'Oithona similis', 6]], 'S');
    const file = pivotConvertFile(raw);
    const input = sheetInput(file, { shape: 'wide', quantity: { kind: 'count' }, edit: { Station: { kind: 'sampleId' }, 'Calanus finmarchicus': { kind: 'taxon', header: true }, 'Oithona similis': { kind: 'taxon', header: true } } });
    const r = convert({ sheets: [input] });
    const f = ids(r.findings, 'CONV-EVENT-DATE-MISSING');
    expect(f).toHaveLength(1);
    expect(f[0].params.pivoted).toBe('yes');
    expect(renderConvertPlain(f[0], 'en')).toContain('Fill in the dates in the file');
    const answered = convert({ sheets: [{ ...input, leaveOut: [{ reason: 'no-event-date', count: f[0].params.rows as number }] }] });
    expect(ids(answered.findings, 'CONV-EVENT-DATE-MISSING')).toHaveLength(1);
    expect(ids(answered.findings, 'CONV-ROW-LEFT-OUT')).toEqual([]);
    expect(ids(answered.findings, 'CONV-ROW-NOT-UNDERSTOOD')).toEqual([]);
  });
});

describe('CONV-EVENT-DATE-MISSING when the date is lent by a joined description sheet (final review I1)', () => {
  const fishFile = xlsxFile('book.xlsx', {
    Fish: [['Sample', 'Taxon', 'Count'], ['T1', 'Gadus morhua', 2], ['T1', 'Clupea harengus', 1], ['T2', 'Gadus morhua', 4]],
    Samples: [['Sample', 'Date', 'Latitude', 'Longitude'], ['T1', '2021-05-03', 61.1, 4.2], ['T2', null, 61.3, 4.6]],
  });
  const joined = (extra: Partial<ConvertSheetInput> = {}) => {
    const out = joinInputs([resultsInput(fishFile, 'Fish', extra), descriptionInput(fishFile, 'Samples')], [{ results: 0, description: 1, keys: [{ results: 0, description: 0 }], conflicts: [] }], []);
    return convert({ sheets: out.sheets });
  };

  it('names the description sheet and its own line, not the results sheet and its lines', () => {
    const f = ids(joined().findings, 'CONV-EVENT-DATE-MISSING');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([3]);
    expect(f[0].params).toMatchObject({ count: 1, rows: 1, how: 'blank-cells', description: 'Samples', joined: 'yes', described: 'yes' });
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      const text = renderConvertPlain(f[0], lang);
      expect(text).toContain('Samples');
      expect(text).not.toMatch(/\{|\}/);
    }
    expect(renderConvertPlain(f[0], 'en')).toBe('1 sample of sheet "Fish" has no date: the date cells of sheet "Samples" are empty (line 3). Fill them in there, or leave these samples out and list them.');
  });

  it('names the description sheet\'s lines in four languages, with the Polish three forms (N2)', () => {
    const base = { count: 3, rows: 3, how: 'blank-cells', joined: 'yes', description: 'Samples', described: 'yes' } as const;
    const f = (lines: number[], extra: Record<string, string | number> = {}) => makeConvertFinding('CONV-EVENT-DATE-MISSING', { file: 'book.xlsx', sheet: 'Fish', lines, params: { ...base, ...extra } });
    expect(renderConvertPlain(f([3]), 'pl')).toContain('(wiersz 3)');
    expect(renderConvertPlain(f([3, 4]), 'pl')).toContain('(wiersze 3–4)');
    expect(renderConvertPlain(f([3, 5, 7, 9, 11]), 'pl')).toContain('wierszy');
    expect(renderConvertPlain(f([3, 4]), 'de')).toContain('Zeilen');
    expect(renderConvertPlain(f([3, 4]), 'fr')).toContain('lignes');
    expect(renderConvertPlain(f([3], { turned: 'yes' }), 'en')).toContain('(line 3)');
  });

  it('the leave-out still takes the results lines of those samples out (the answer is counted in results lines)', () => {
    const left = joined({ leaveOut: [{ reason: 'no-event-date', count: 1 }] });
    expect(ids(left.findings, 'CONV-EVENT-DATE-MISSING')).toEqual([]);
    expect(ids(left.findings, 'CONV-ROW-LEFT-OUT')[0].params).toMatchObject({ reason: 'no-event-date', count: 1 });
  });

  it('a joined sheet never advises to join: every variant, four languages, Polish plural tokens kept', () => {
    const base = { count: 3, rows: 3, how: 'blank-cells', joined: 'yes', description: 'Samples' } as const;
    const cases: Record<string, string | number>[] = [{ ...base, described: 'yes' }, { ...base, described: 'yes', turned: 'yes' }, { ...base, described: 'yes', pivoted: 'yes' }, { ...base, turned: 'yes' }, { ...base, pivoted: 'yes' }, { ...base, how: 'no-date-role' }];
    for (const params of cases) {
      const f = makeConvertFinding('CONV-EVENT-DATE-MISSING', { file: 'book.xlsx', sheet: 'Fish', params });
      for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
        const text = renderConvertPlain(f, lang);
        expect(text, `${JSON.stringify(params)} ${lang}`).toContain('Samples');
        expect(text).not.toMatch(/\{|\}/);
      }
      expect(renderConvertPlain(f, 'en')).not.toMatch(/join the sheet/i);
      if (params.turned === 'yes' || params.pivoted === 'yes') expect(renderConvertPlain(f, 'en')).not.toMatch(/leave these samples out/);
    }
    const pl = renderConvertPlain(makeConvertFinding('CONV-EVENT-DATE-MISSING', { file: 'book.xlsx', sheet: 'Fish', params: { ...base, count: 2 } }), 'pl');
    expect(pl).toContain('2 próbki');
    expect(renderConvertPlain(makeConvertFinding('CONV-EVENT-DATE-MISSING', { file: 'book.xlsx', sheet: 'Fish', params: { ...base, count: 5 } }), 'pl')).toContain('5 próbek');
  });

  describe('N1: undated samples with a description row and results-only samples are both named', () => {
    const mixedFile = (samplesRows: Cell[][]) =>
      xlsxFile('book.xlsx', {
        Fish: [['Sample', 'Taxon', 'Count'], ['T1', 'Gadus morhua', 2], ['T2', 'Gadus morhua', 4], ['T3', 'Gadus morhua', 1]],
        Samples: [['Sample', 'Date', 'Latitude', 'Longitude'], ...samplesRows],
      });
    const run = (file: ReturnType<typeof mixedFile>, extra: Partial<ConvertSheetInput> = {}) => {
      const out = joinInputs([resultsInput(file, 'Fish', extra), descriptionInput(file, 'Samples')], [{ results: 0, description: 1, keys: [{ results: 0, description: 0 }], conflicts: [], resultsOnly: 1 }], []);
      return convert({ sheets: out.sheets });
    };

    it('T2 blank in Samples and T3 with no Samples row: one finding names the description line and the results-only line, with no advice to fill in cells of Fish', () => {
      const r = run(mixedFile([['T1', '2021-05-03', 61.1, 4.2], ['T2', null, 61.3, 4.6]]));
      const f = ids(r.findings, 'CONV-EVENT-DATE-MISSING');
      expect(f).toHaveLength(1);
      expect(f[0].lines).toEqual([3]);
      expect(f[0].params).toMatchObject({ count: 2, rows: 2, described: 'yes', description: 'Samples', resultsOnly: 1, resultsLines: '4' });
      for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
        const text = renderConvertPlain(f[0], lang);
        expect(text, lang).toContain('Samples');
        expect(text, lang).toMatch(/3/);
        expect(text, lang).toMatch(/4/);
        expect(text, lang).not.toMatch(/\{|\}/);
      }
      const en = renderConvertPlain(f[0], 'en');
      expect(en).toContain('(line 3)');
      expect(en).toContain('1 sample has no row there at all (line 4 of "Fish")');
      expect(en).not.toMatch(/fill (them )?in\b.*cells/i);
      expect(en).not.toContain('The date cells are empty');
      expect(en).toMatch(/add the missing rows/);
      // the leave-out still takes both samples' results lines out
      const left = run(mixedFile([['T1', '2021-05-03', 61.1, 4.2], ['T2', null, 61.3, 4.6]]), { leaveOut: [{ reason: 'no-event-date', count: 2 }] });
      expect(ids(left.findings, 'CONV-EVENT-DATE-MISSING')).toEqual([]);
    });

    it('only results-only samples are undated: the finding says the description sheet has no row for them, not "fill in the date cells"', () => {
      const r = run(mixedFile([['T1', '2021-05-03', 61.1, 4.2], ['T2', '2021-05-04', 61.3, 4.6]]));
      const f = ids(r.findings, 'CONV-EVENT-DATE-MISSING');
      expect(f).toHaveLength(1);
      expect(f[0].lines).toEqual([4]);
      expect(f[0].params).toMatchObject({ count: 1, noRow: 'yes', description: 'Samples' });
      const en = renderConvertPlain(f[0], 'en');
      expect(en).toContain('has no row for it');
      expect(en).toContain('(line 4 of "Fish")');
      expect(en).not.toMatch(/fill them in|date cells are empty/i);
      for (const lang of ['pl', 'de', 'fr'] as const) expect(renderConvertPlain(f[0], lang), lang).not.toMatch(/\{|\}/);
    });

    it('the fixed variants (a turned or pivoted sheet) never offer a leave-out, and Polish keeps its three forms', () => {
      const p = (extra: Record<string, string | number>, lines: number[] = [3]) => makeConvertFinding('CONV-EVENT-DATE-MISSING', { file: 'book.xlsx', sheet: 'Fish', lines, params: { count: 2, rows: 2, how: 'blank-cells', joined: 'yes', description: 'Samples', ...extra } });
      const mixed = p({ described: 'yes', resultsOnly: 2, resultsLineCount: 2, resultsLines: '4, 6', turned: 'yes' });
      expect(renderConvertPlain(mixed, 'en')).not.toMatch(/leave these samples out/);
      expect(renderConvertPlain(mixed, 'pl')).toContain('2 próbki nie mają');
      expect(renderConvertPlain(mixed, 'pl')).toContain('(wiersze 4, 6');
      const none = p({ noRow: 'yes', pivoted: 'yes' }, [4]);
      expect(renderConvertPlain(none, 'en')).not.toMatch(/leave these samples out/);
      expect(renderConvertPlain(p({ noRow: 'yes', count: 5 }, [4, 5, 6, 8, 9]), 'pl')).toContain('5 próbek');
    });
  });
});
