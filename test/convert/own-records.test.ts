// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// "Each row is its own record": the person's tick on a long sheet. The occurrenceID is the sample's eventID and the line number in the SOURCE file; a row with no quantity column is one
// individual; identical rows may be kept as separate records. Invented data (the spec's sheet Fish).
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { ownRecordsEligible } from '../../src/core/convert/ownRecords';
import { joinInputs } from '../../src/core/convert/sampleJoin';
import type { SampleJoinRequestCore } from '../../src/core/convert/sampleJoin';
import type { ColumnRole, Finding } from '../../src/core/types';
import { xlsxFile } from '../helpers/files';
import { renderConvertPlain } from '../../src/core/rules/convert';
import { exportAllowed, judge } from '../../src/core/convert/policy';
import { descriptionInput, resultsInput, SAMPLES_HEADER } from './joinFixtures';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const rules = (fs: readonly Finding[], id: string): Finding[] => fs.filter((f) => f.ruleId === id);
const GM = 'Gadus morhua';
const PV = 'Pollachius virens';
const FISH_H = ['Sample', 'Date', 'Latitude', 'Longitude', 'Taxon', 'Length [mm]'];
const FISH_ROWS: Cell[][] = [
  ['T1', '2022-03-01', 60.1, 4.2, GM, 310],
  ['T1', '2022-03-01', 60.1, 4.2, GM, 295],
  ['T1', '2022-03-01', 60.1, 4.2, PV, 400],
];
const LENGTH: ColumnRole = { kind: 'variable', variable: 'Length', unit: 'mm', unitSource: 'user', perOccurrence: true };
const EDIT: Record<string, ColumnRole> = { Sample: { kind: 'sampleId' }, Taxon: { kind: 'taxon' }, 'Length [mm]': LENGTH };
const fish = (extra: Partial<ConvertSheetInput> = {}, header = FISH_H, rows = FISH_ROWS, edit: Record<string, ColumnRole> = EDIT) =>
  sheetInput(fileOf(header, rows, 'Fish'), { shape: 'long', edit, ...extra } as never);
const COUNT_H = [...FISH_H, 'Count'];
const withCount = (n: number | ((i: number) => number)): Cell[][] => FISH_ROWS.map((r, i) => [...r, typeof n === 'number' ? n : n(i)]);
const COUNT_EDIT = { ...EDIT, Count: { kind: 'quantity' } as ColumnRole };
const ids = (r: ReturnType<typeof convert>): string[] => r.occurrences.map((o) => o.id);

describe('ownRecordsEligible (F9)', () => {
  it('is true for the long sheet Fish', () => {
    const s = fish();
    expect(ownRecordsEligible(s, s.file.sheets[0])).toBe(true);
  });
  it('is false for a wide sheet, a profile sheet, a pivoted sheet, a sheet with no taxon column and a sheet with an occurrenceID column', () => {
    const wide = sheetInput(fileOf(['Sample', 'Date', 'Latitude', 'Longitude', 'Gadus morhua'], [['T1', '2022-03-01', 60, 4, 3]], 'Fish'), { shape: 'wide', edit: { 'Gadus morhua': { kind: 'taxon', header: true } } } as never);
    expect(ownRecordsEligible(wide, wide.file.sheets[0])).toBe(false);
    const f = fish();
    expect(ownRecordsEligible({ ...f, profile: {} as never }, f.file.sheets[0])).toBe(false);
    expect(ownRecordsEligible(f, { ...f.file.sheets[0], pivot: {} as never })).toBe(false);
    const noTaxon = fish({}, FISH_H, FISH_ROWS, { Sample: { kind: 'sampleId' }, Taxon: { kind: 'ignore' }, 'Length [mm]': LENGTH });
    expect(ownRecordsEligible(noTaxon, noTaxon.file.sheets[0])).toBe(false);
    const withId = fish({}, ['occ', ...FISH_H], FISH_ROWS.map((r, i) => [`o${i}`, ...r]), { ...EDIT, occ: { kind: 'occurrenceId' } });
    expect(ownRecordsEligible(withId, withId.file.sheets[0])).toBe(false);
  });
});

describe('each row is its own record', () => {
  it('without the tick, a long sheet with a taxon and no quantity column still blocks with CONV-TAXON-NO-QUANTITY', () => {
    const r = convert({ sheets: [fish()] });
    expect(rules(r.blocking, 'CONV-TAXON-NO-QUANTITY')).toHaveLength(1);
    expect(rules(r.findings, 'CONV-OWN-RECORDS')).toEqual([]);
  });

  it('with a Count column of 1s and no tick: the same taxon twice is a duplicate identifier (as today)', () => {
    const r = convert({ sheets: [fish({ quantity: { kind: 'count' } }, COUNT_H, withCount(1), COUNT_EDIT)] });
    expect(rules(r.blocking, 'CONV-ID-DUPLICATE')).toHaveLength(1);
    expect(rules(r.blocking, 'CONV-ID-DUPLICATE')[0].params.sameTaxon).toBe('yes');
  });

  it('with the tick: IDs from the source line, no duplicate, the cost said, one method paragraph, one Length row per occurrence', () => {
    const r = convert({ sheets: [fish({ quantity: { kind: 'count' }, ownRecords: true }, COUNT_H, withCount(1), COUNT_EDIT)] });
    expect(ids(r)).toEqual(['T1:L2', 'T1:L3', 'T1:L4']);
    expect(rules(r.findings, 'CONV-ID-DUPLICATE')).toEqual([]);
    const own = rules(r.findings, 'CONV-OWN-RECORDS');
    expect(own).toHaveLength(1);
    expect(own[0].params.rows).toBe(3);
    expect(own[0].severity).toBe('warning');
    expect(r.methodSteps).toContain(`Sheet Fish of sheet.csv: one occurrence per source row; occurrenceID = sample eventID + ':L' + line number in the source file`);
    const lengths = r.measurements.filter((m) => m.target.kind === 'occurrence' && m.measurementType === 'Length');
    expect(lengths.map((m) => m.measurementValue)).toEqual(['310', '295', '400']);
    // F15: the size-class case of spec section 2
    // nothing blocks; the person accepts these (the same-taxon warning included) and the archive exports
    expect(judge(r.findings).blocking.map((f) => f.ruleId)).toEqual([]);
    expect(judge(r.findings).acceptRules).toEqual(['CONV-NERC-UNKNOWN', 'CONV-UNIT-NO-P06', 'CONV-OWN-RECORDS', 'CONV-DEVICE-MISSING', 'CONV-TAXON-SAME-EVENT']);
    expect(exportAllowed(r.findings, judge(r.findings).acceptRules)).toBe(true);
    expect(exportAllowed(r.findings, [])).toBe(false);
  });

  it('with no Count column and the tick: one individual per row (OCOUNT01), no CONV-TAXON-NO-QUANTITY', () => {
    const r = convert({ sheets: [fish({ ownRecords: true })] });
    expect(rules(r.blocking, 'CONV-TAXON-NO-QUANTITY')).toEqual([]);
    expect(rules(r.findings, 'CONV-SPECIES-LIST-NO-COUNTS')).toEqual([]);
    expect(ids(r)).toEqual(['T1:L2', 'T1:L3', 'T1:L4']);
    for (const o of r.occurrences) {
      expect(o.individualCount).toBe(1);
      expect(o.organismQuantity).toBe(1);
      expect(o.organismQuantityType).toBe('individuals');
    }
    const counts = r.measurements.filter((m) => m.role === 'count');
    expect(counts).toHaveLength(3);
    expect(counts.every((m) => m.measurementTypeId?.includes('OCOUNT01'))).toBe(true);
    expect(r.measurements.filter((m) => m.measurementType === 'Length')).toHaveLength(3);
    expect(r.blocking).toEqual([]);
  });

  it('with presenceOnly too: presence, no count (the other tick wins), IDs still from the lines', () => {
    const r = convert({ sheets: [fish({ ownRecords: true, presenceOnly: true })] });
    expect(ids(r)).toEqual(['T1:L2', 'T1:L3', 'T1:L4']);
    for (const o of r.occurrences) {
      expect(o.individualCount).toBeUndefined();
      expect(o.organismQuantity).toBeUndefined();
    }
  });

  it('the tick is ignored on an ineligible sheet: a sheet with an occurrenceID column keeps its IDs', () => {
    const rows = FISH_ROWS.map((r, i) => [`occ-${i + 1}`, ...r, 1]);
    const r = convert({ sheets: [fish({ quantity: { kind: 'count' }, ownRecords: true }, ['occ', ...COUNT_H], rows, { ...COUNT_EDIT, occ: { kind: 'occurrenceId' } })] });
    expect(ids(r)).toEqual(['occ-1', 'occ-2', 'occ-3']);
    expect(rules(r.findings, 'CONV-OWN-RECORDS')).toEqual([]);
  });

  it('through a confirmed join the ID is the line of the results sheet, not the merged row position', () => {
    const file = xlsxFile('book.xlsx', {
      // line 3 holds no taxon and no count: it writes nothing, so the lines of the records (2, 4, 5) differ from their positions (2, 3, 4)
      Fish: [['Sample', 'Taxon', 'Count'], ['X01', GM, 1], ['X01', null, null], ['X01', PV, 1], ['X02', GM, 1]],
      Samples: [SAMPLES_HEADER, ['X01', 'ST-1', '2021-05-03', 61.1, 4.2, 10], ['X02', 'ST-2', '2021-05-04', 61.3, 4.6, 20]],
    });
    const join: SampleJoinRequestCore = { results: 0, description: 1, keys: [{ results: 0, description: 0 }], conflicts: [] };
    const out = joinInputs([resultsInput(file, 'Fish', { ownRecords: true }), descriptionInput(file, 'Samples')], [join], []);
    const r = convert({ sheets: out.sheets });
    expect(ids(r)).toEqual(['X01:L2', 'X01:L4', 'X02:L5']);
    expect(rules(r.findings, 'CONV-ID-DUPLICATE')).toEqual([]);
  });
});

describe('identical rows under own records (Q2)', () => {
  describe('with no quantity column', () => {
    const SAME: Cell[][] = [['T1', '2022-03-01', 60.1, 4.2, GM, 310], ['T1', '2022-03-01', 60.1, 4.2, GM, 310], ['T1', '2022-03-01', 60.1, 4.2, PV, 400]];
    const go = (extra: Partial<ConvertSheetInput>) => convert({ sheets: [fish({ ownRecords: true, ...extra }, FISH_H, SAME)] });
    it('two identical specimen rows ask CONV-ROW-COPIES (no sums) and block', () => {
      const r = go({});
      const f = rules(r.blocking, 'CONV-ROW-COPIES');
      expect(f).toHaveLength(1);
      expect(f[0].params.own).toBe('yes');
      expect(f[0].lines).toEqual([3]);
      expect(renderConvertPlain(f[0], 'en')).toContain('separate individuals');
    });
    it('after keep, T1:L2 and T1:L3 are written and CONV-ROW-COPIES-KEPT says so', () => {
      const r = go({ keepCopiesCount: 1 });
      expect(rules(r.findings, 'CONV-ROW-COPIES')).toEqual([]);
      expect(rules(r.findings, 'CONV-ROW-COPIES-KEPT')).toHaveLength(1);
      expect(ids(r)).toEqual(['T1:L2', 'T1:L3', 'T1:L4']);
    });
    it('after drop, one record is written and the copy is listed', () => {
      const r = go({ dropCopies: true });
      expect(ids(r)).toEqual(['T1:L2', 'T1:L4']);
      const d = rules(r.findings, 'CONV-ROW-COPIES-DROPPED');
      expect(d).toHaveLength(1);
      expect(d[0].lines).toEqual([3]);
    });
    it('rows that differ are not copies', () => {
      expect(rules(convert({ sheets: [fish({ ownRecords: true })] }).findings, 'CONV-ROW-COPIES')).toEqual([]);
    });
  });

  const rowsOf = (): Cell[][] => [
    ['T1', '2022-03-01', 60.1, 4.2, GM, 310, 2],
    ['T1', '2022-03-01', 60.1, 4.2, GM, 310, 2],
    ['T1', '2022-03-01', 60.1, 4.2, PV, 400, 3],
  ];
  const run = (extra: Partial<ConvertSheetInput>) => convert({ sheets: [fish({ quantity: { kind: 'count' }, ownRecords: true, ...extra }, COUNT_H, rowsOf(), COUNT_EDIT)] });

  it('asks CONV-ROW-COPIES while unanswered', () => {
    const r = run({});
    expect(rules(r.blocking, 'CONV-ROW-COPIES')).toHaveLength(1);
  });
  it('keepCopiesCount equal to the number of copies keeps both rows as separate records', () => {
    const r = run({ keepCopiesCount: 1 });
    expect(rules(r.findings, 'CONV-ROW-COPIES')).toEqual([]);
    expect(rules(r.findings, 'CONV-ROW-COPIES-KEPT')).toEqual([expect.objectContaining({ params: expect.objectContaining({ count: 1 }) })]);
    expect(ids(r)).toEqual(['T1:L2', 'T1:L3', 'T1:L4']);
  });
  it('keepCopiesCount of another number asks again', () => {
    const r = run({ keepCopiesCount: 2 });
    expect(rules(r.blocking, 'CONV-ROW-COPIES')).toHaveLength(1);
    expect(rules(r.findings, 'CONV-ROW-COPIES-KEPT')).toEqual([]);
  });
  it('a bare keepCopies does the same, and says fromFile only for a count from a companion file', () => {
    expect(rules(run({ keepCopies: true }).findings, 'CONV-ROW-COPIES-KEPT')).toHaveLength(1);
    expect(rules(run({ keepCopiesCount: 1, keepCopiesFromFile: true }).findings, 'CONV-ROW-COPIES-KEPT')[0].params.fromFile).toBe('yes');
  });
  it('without ownRecords the answer is ignored', () => {
    const r = convert({ sheets: [fish({ quantity: { kind: 'count' }, keepCopies: true, keepCopiesCount: 1 }, COUNT_H, rowsOf(), COUNT_EDIT)] });
    expect(rules(r.blocking, 'CONV-ROW-COPIES')).toHaveLength(1);
    expect(rules(r.findings, 'CONV-ROW-COPIES-KEPT')).toEqual([]);
  });
});
