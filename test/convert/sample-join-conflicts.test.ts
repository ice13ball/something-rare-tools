// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// mergeSampleSheets: values both sheets give are compared after the converter's own reading; differences form one group per quantity that blocks until answered. Invented data.
import { describe, expect, it } from 'vitest';
import { shortHash } from '../../src/core/convert/keySetting';
import { mergeSampleSheets } from '../../src/core/convert/sampleJoin';
import type { ConflictAnswer, ConflictGroup, MergeResult, SampleJoinDecl } from '../../src/core/convert/sampleJoin';
import type { ColumnRole, Finding } from '../../src/core/types';
import { xlsxFile } from '../helpers/files';
import type { Cell } from '../helpers/files';
import { COUNTS_HEADER, SAMPLES_HEADER, SAMPLES_ROWS, descriptionInput, resultsInput } from './joinFixtures';

const TAX = 'Calanus finmarchicus';
type Edit = Record<string, ColumnRole>;

interface Book {
  countsHeader?: Cell[];
  counts: Cell[][];
  samplesHeader?: Cell[];
  samples?: Cell[][];
  resultsEdit?: Edit;
  descriptionEdit?: Edit;
  keys?: { results: number; description: number }[];
  extra?: Partial<SampleJoinDecl>;
}
const merge = (b: Book): MergeResult => {
  const file = xlsxFile('book.xlsx', { Counts: [b.countsHeader ?? COUNTS_HEADER, ...b.counts], Samples: [b.samplesHeader ?? SAMPLES_HEADER, ...(b.samples ?? SAMPLES_ROWS)] });
  const res = resultsInput(file, 'Counts', { edit: { Taxon: { kind: 'taxon' }, Count: { kind: 'quantity' }, ...(b.resultsEdit ?? {}) } } as never);
  const des = descriptionInput(file, 'Samples', b.descriptionEdit === undefined ? {} : ({ edit: b.descriptionEdit } as never));
  return mergeSampleSheets({ results: res, description: des, keys: b.keys ?? [{ results: 0, description: 0 }], conflicts: [], appendDescriptionOnly: false, ...b.extra });
};
const found = (r: MergeResult, id: string): Finding[] => r.info.findings.filter((f) => f.ruleId === id);
const sheetOf = (r: MergeResult) => r.input.file.sheets.find((s) => s.name === r.input.sheet)!;
const rowAt = (r: MergeResult, line: number) => sheetOf(r).rows.find((x) => x.line === line)!;
const colOf = (r: MergeResult, header: string): number => sheetOf(r).header.indexOf(header);
const group = (r: MergeResult, id: string): ConflictGroup => r.conflicts.find((g) => g.group === id)!;
const roles = (r: MergeResult, kinds: string[]) => r.input.mapping.columns.filter((c) => kinds.includes(c.role.kind));
const answer = (g: string, take: 'description' | 'results' | undefined, count: number, exceptions: ConflictAnswer['exceptions'] = [], pairs?: ConflictAnswer['pairs']): ConflictAnswer => ({
  group: g,
  ...(take === undefined ? {} : { take }),
  count,
  exceptions,
  ...(pairs === undefined ? {} : { pairs }),
});
const entryId = (key: string, resultsText: string): string => shortHash(`${key}\u0000${resultsText}`);

const DATE_HEADER: Cell[] = [...COUNTS_HEADER, 'Date'];
const dated = (x01: Cell): Cell[][] => [['X01', TAX, 5, x01], ['X02', TAX, 3, '2021-05-04']];

describe('conflicts: a date that differs', () => {
  it('forms one group with one entry and blocks (spec test 5)', () => {
    const r = merge({ countsHeader: DATE_HEADER, counts: dated('2021-05-02') });
    expect(r.conflicts).toHaveLength(1);
    const g = group(r, 'date');
    expect(g).toMatchObject({ group: 'date', quantity: 'date', count: 1 });
    expect(g.entries).toEqual([expect.objectContaining({ key: 'X01', samples: ['X01'], descriptionText: '2021-05-03', resultsText: '2021-05-02', resultsLines: [2], descriptionLine: 2 })]);
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([expect.objectContaining({ severity: 'error', params: expect.objectContaining({ group: 'date', count: 1, total: 1, examples: 'X01: 2021-05-03 / 2021-05-02' }) })]);
    expect(rowAt(r, 2).cells[colOf(r, 'Date')]).toBe('2021-05-02');
    expect(r.info.notChosen).toEqual([]);
  });

  it('take description: the description cell is written, the results one is kept in notChosen', () => {
    const open = merge({ countsHeader: DATE_HEADER, counts: dated('2021-05-02') });
    const id = group(open, 'date').entries[0].id;
    expect(id).toBe(entryId('X01', '2021-05-02'));
    const r = merge({ countsHeader: DATE_HEADER, counts: dated('2021-05-02'), extra: { conflicts: [answer('date', 'description', 1)] } });
    expect(rowAt(r, 2).cells[colOf(r, 'Date')]).toBe('2021-05-03');
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([]);
    expect(found(r, 'CONV-JOIN-CONFLICT-CHOSEN')).toEqual([expect.objectContaining({ severity: 'info', params: expect.objectContaining({ count: 1, fromDescription: 1, fromResults: 0, what: 'Date' }) })]);
    expect(r.info.notChosen).toEqual([expect.objectContaining({ side: 'results', line: 2, otherLine: 2, group: 'date', column: colOf(r, 'Date'), chosen: '2021-05-03' })]);
    expect(r.info.takenFromDescription.get(`2:${colOf(r, 'Date')}`)).toBe(2);
    expect(group(r, 'date').entries[0].take).toBe('description');
  });

  it('an exception beats the bulk side', () => {
    const open = merge({ countsHeader: DATE_HEADER, counts: dated('2021-05-02') });
    const id = group(open, 'date').entries[0].id;
    const r = merge({ countsHeader: DATE_HEADER, counts: dated('2021-05-02'), extra: { conflicts: [answer('date', 'description', 1, [{ entry: id, take: 'results' }])] } });
    expect(rowAt(r, 2).cells[colOf(r, 'Date')]).toBe('2021-05-02');
    expect(found(r, 'CONV-JOIN-CONFLICT-CHOSEN')).toEqual([expect.objectContaining({ params: expect.objectContaining({ fromDescription: 0, fromResults: 1 }) })]);
    expect(r.info.notChosen).toEqual([expect.objectContaining({ side: 'description', line: 2, otherLine: 2, group: 'date', chosen: '2021-05-02' })]);
    expect(r.info.takenFromDescription.has(`2:${colOf(r, 'Date')}`)).toBe(false);
  });

  const four = (): { counts: Cell[][]; samples: Cell[][] } => ({
    counts: [['X01', TAX, 1, '2021-05-02'], ['X02', TAX, 1, '2021-05-03'], ['X03', TAX, 1, '2021-05-04'], ['X04', TAX, 1, '2021-05-10']],
    samples: [['X01', 'ST-1', '2021-05-03', 61.1, 4.2, 10], ['X02', 'ST-1', '2021-05-04', 61.1, 4.2, 10], ['X03', 'ST-1', '2021-05-05', 61.1, 4.2, 10], ['X04', 'ST-1', '2021-05-09', 61.1, 4.2, 10]],
  });

  it('later and earlier descriptions fall in ONE group of 4 (spec test 6, grouping half)', () => {
    const r = merge({ countsHeader: DATE_HEADER, ...four() });
    expect(r.conflicts.map((g) => g.group)).toEqual(['date']);
    expect(group(r, 'date').count).toBe(4);
    expect(group(r, 'date').entries).toHaveLength(4);
  });

  it('an answer with no bulk side decides only its exceptions; the rest keeps blocking', () => {
    const open = merge({ countsHeader: DATE_HEADER, ...four() });
    const first = group(open, 'date').entries[0].id;
    const r = merge({ countsHeader: DATE_HEADER, ...four(), extra: { conflicts: [answer('date', undefined, 4, [{ entry: first, take: 'description' }])] } });
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([expect.objectContaining({ params: expect.objectContaining({ count: 3, total: 4 }) })]);
    expect(found(r, 'CONV-JOIN-CONFLICT-CHOSEN')).toEqual([]);
    expect(rowAt(r, 2).cells[colOf(r, 'Date')]).toBe('2021-05-03');
    expect(rowAt(r, 3).cells[colOf(r, 'Date')]).toBe('2021-05-03');
  });

  it('pairs apply to every entry with the same pair of values; an exception beats the pair', () => {
    const many = 600;
    const counts: Cell[][] = Array.from({ length: many }, (_, i) => [`S${i}`, TAX, 1, '2021-05-02']);
    const samples: Cell[][] = Array.from({ length: many }, (_, i) => [`S${i}`, 'ST-1', '2021-05-03', 61.1, 4.2, 10]);
    const pairs = [{ pair: ['2021-05-03', '2021-05-02'] as [string, string], take: 'description' as const }];
    const r = merge({ countsHeader: DATE_HEADER, counts, samples, extra: { conflicts: [answer('date', undefined, many, [], pairs)] } });
    expect(group(r, 'date').entries).toHaveLength(many);
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([]);
    expect(found(r, 'CONV-JOIN-CONFLICT-CHOSEN')).toEqual([expect.objectContaining({ params: expect.objectContaining({ count: many, fromDescription: many, fromResults: 0 }) })]);
    expect(rowAt(r, 2).cells[colOf(r, 'Date')]).toBe('2021-05-03');
    expect(rowAt(r, many + 1).cells[colOf(r, 'Date')]).toBe('2021-05-03');
    const one = entryId('S7', '2021-05-02');
    const r2 = merge({ countsHeader: DATE_HEADER, counts, samples, extra: { conflicts: [answer('date', undefined, many, [{ entry: one, take: 'results' }], pairs)] } });
    expect(rowAt(r2, 9).cells[colOf(r2, 'Date')]).toBe('2021-05-02');
    expect(rowAt(r2, 10).cells[colOf(r2, 'Date')]).toBe('2021-05-03');
    expect(found(r2, 'CONV-JOIN-CONFLICT-CHOSEN')).toEqual([expect.objectContaining({ params: expect.objectContaining({ fromDescription: many - 1, fromResults: 1 }) })]);
  });

  it('the same date written differently is no conflict and the results cell stays verbatim (spec test 7)', () => {
    const r = merge({ countsHeader: DATE_HEADER, counts: dated('03.05.2021') });
    expect(r.conflicts).toEqual([]);
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([]);
    expect(rowAt(r, 2).cells[colOf(r, 'Date')]).toBe('03.05.2021');
  });

  it('an answer given for another count is not applied: the group is open again', () => {
    const r = merge({ countsHeader: DATE_HEADER, ...four(), extra: { conflicts: [answer('date', 'description', 3)] } });
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([expect.objectContaining({ params: expect.objectContaining({ count: 4, total: 4 }) })]);
    expect(rowAt(r, 2).cells[colOf(r, 'Date')]).toBe('2021-05-02');
    expect(r.info.notChosen).toEqual([]);
    expect(group(r, 'date').answer).toBeUndefined();
  });
});

describe('conflicts: a quantity in another column structure (C1)', () => {
  const ymd = (day: number): Merge => ({ countsHeader: [...COUNTS_HEADER, 'Year', 'Month', 'Day'], counts: [['X01', TAX, 5, 2021, 5, day]] });
  type Merge = Pick<Book, 'countsHeader' | 'counts'>;

  it('Year/Month/Day equal to a Date column is no conflict', () => {
    const r = merge(ymd(3));
    expect(r.conflicts).toEqual([]);
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([]);
    expect(roles(r, ['date', 'datetime']).length + roles(r, ['datePart']).length).toBeGreaterThan(0);
    expect(roles(r, ['date', 'datetime', 'time']).length).toBeLessThanOrEqual(1);
  });

  it('a different day is a conflict in group date; the description answer resolves to one datetime column', () => {
    const open = merge(ymd(2));
    expect(group(open, 'date')).toMatchObject({ count: 1 });
    expect(group(open, 'date').entries[0]).toMatchObject({ descriptionText: '2021-05-03' });
    const r = merge({ ...ymd(2), extra: { conflicts: [answer('date', 'description', 1)] } });
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([]);
    const dateLike = roles(r, ['date', 'datetime', 'time', 'datePart']);
    expect(dateLike).toHaveLength(1);
    expect(dateLike[0].role.kind).toBe('datetime');
    const at = dateLike[0].index;
    expect(rowAt(r, 2).cells[at]).toBe('2021-05-03');
    expect(r.info.columns[at]).toMatchObject({ side: 'resolved' });
    for (const h of ['Year', 'Month', 'Day']) expect(r.input.mapping.columns.find((c) => c.index === colOf(r, h))!.role.kind).toBe('ignore');
    expect(r.info.consumed.has(colOf(r, 'Year'))).toBe(true);
    expect(r.info.consumed.has(sheetOf(r).header.indexOf('Date'))).toBe(true);
    expect(r.info.takenFromDescription.get(`2:${at}`)).toBe(2);
    expect(r.info.notChosen.length).toBeGreaterThan(0);
  });

  it('the results answer leaves the results own Year/Month/Day carrying the date and sets the description Date aside', () => {
    const r = merge({ ...ymd(2), extra: { conflicts: [answer('date', 'results', 1)] } });
    // nothing is taken from the description: the results' own Year/Month/Day keep carrying the date, the description's Date is set aside
    expect(roles(r, ['date', 'datetime', 'time'])).toEqual([]);
    expect(roles(r, ['datePart'])).toHaveLength(3);
    expect(rowAt(r, 2).cells.slice(3, 6)).toEqual([2021, 5, 2]);
    expect(r.info.notChosen).toEqual([expect.objectContaining({ side: 'description', line: 2, otherLine: 2, group: 'date', chosen: '2021 5 2' })]);
  });
});

describe('conflicts: depth', () => {
  const stationSamples: Cell[][] = [['ST-1', 'ST-1', '2021-05-03', 61.1, 4.2, 10]];
  const stationCounts: Cell[][] = [['X01', 'ST-1', TAX, 5, 10], ['X01b', 'ST-1', TAX, 5, 12], ['X01c', 'ST-1', TAX, 5, 12], ['X01d', 'ST-1', TAX, 5, 14]];
  const book = (extra: Partial<SampleJoinDecl> = {}): MergeResult =>
    merge({
      countsHeader: ['Sample', 'Station', 'Taxon', 'Count', 'Depth'],
      counts: stationCounts,
      samples: stationSamples,
      keys: [{ results: 1, description: 1 }],
      resultsEdit: { Sample: { kind: 'sampleId' }, Station: { kind: 'station' } },
      descriptionEdit: { Sample: { kind: 'ignore' } },
      extra,
    });

  it('one entry per (key, results value) with the samples that share it (C2)', () => {
    const r = book();
    const g = group(r, 'depth');
    expect(g.count).toBe(3);
    expect(g.entries.map((e) => ({ r: e.resultsText, s: e.samples }))).toEqual([{ r: '12', s: ['X01b', 'X01c'] }, { r: '14', s: ['X01d'] }]);
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([expect.objectContaining({ params: expect.objectContaining({ count: 3, total: 3 }) })]);
  });

  it('bulk results keeps every results depth; an exception changes one entry only', () => {
    const keep = book({ conflicts: [answer('depth', 'results', 3)] });
    const depth = colOf(keep, 'Depth');
    expect([2, 3, 4, 5].map((l) => rowAt(keep, l).cells[depth])).toEqual([10, 12, 12, 14]);
    const e14 = entryId('ST-1', '14');
    const r = book({ conflicts: [answer('depth', 'results', 3, [{ entry: e14, take: 'description' }])] });
    expect([2, 3, 4, 5].map((l) => rowAt(r, l).cells[depth])).toEqual([10, 12, 12, 10]);
    expect(found(r, 'CONV-JOIN-CONFLICT-CHOSEN')).toEqual([expect.objectContaining({ params: expect.objectContaining({ fromDescription: 1, fromResults: 2 }) })]);
  });

  it('a depth in another unit is compared in metres and resolved to min and max in metres', () => {
    const file = xlsxFile('book.xlsx', {
      Counts: [['Sample', 'Taxon', 'Count', 'Depth [m]'], ['X01', TAX, 1, 10], ['X02', TAX, 1, 12]],
      Samples: [['Sample', 'Depth [km]'], ['X01', 0.01], ['X02', 0.02]],
    });
    const mk = (conflicts: ConflictAnswer[]) =>
      mergeSampleSheets({
        results: resultsInput(file, 'Counts'),
        description: descriptionInput(file, 'Samples'),
        keys: [{ results: 0, description: 0 }],
        conflicts,
        appendDescriptionOnly: false,
      });
    const open = mk([]);
    expect(group(open, 'depth').entries.map((e) => e.key)).toEqual(['X02']);
    const r = mk([answer('depth', 'description', 1)]);
    const depthCols = roles(r, ['depth']);
    expect(depthCols.map((c) => (c.role as { bound?: string }).bound).sort()).toEqual(['max', 'min']);
    const min = depthCols.find((c) => (c.role as { bound?: string }).bound === 'min')!;
    const max = depthCols.find((c) => (c.role as { bound?: string }).bound === 'max')!;
    expect(rowAt(r, 2).cells[min.index]).toBe('10');
    expect(rowAt(r, 2).cells[max.index]).toBe('10');
    expect(rowAt(r, 3).cells[min.index]).toBe('20');
    expect(rowAt(r, 3).cells[max.index]).toBe('20');
    expect(r.info.consumed.has(colOf(r, 'Depth [m]'))).toBe(true);
    expect(r.input.mapping.columns.find((c) => c.index === colOf(r, 'Depth [m]'))!.role.kind).toBe('ignore');
    expect(r.input.mapping.columns.find((c) => c.header === 'Depth [km]')!.role.kind).toBe('ignore');
    // no cell 2000 sits under a role in metres
    for (const c of depthCols) expect(rowAt(r, 3).cells[c.index]).not.toBe(0.02);
  });
});

describe('conflicts: a depth in a unit the converter does not convert', () => {
  it('Depth [cm] against Depth [m] is not turned into metres: it stays an ungrouped blocking difference', () => {
    const file = xlsxFile('book.xlsx', {
      Counts: [['Sample', 'Taxon', 'Count', 'Depth [m]'], ['X01', TAX, 1, 10]],
      Samples: [['Sample', 'Depth [cm]'], ['X01', 1000]],
    });
    const r = mergeSampleSheets({ results: resultsInput(file, 'Counts'), description: descriptionInput(file, 'Samples'), keys: [{ results: 0, description: 0 }], conflicts: [], appendDescriptionOnly: false });
    expect(r.conflicts).toEqual([]);
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([]);
    expect(found(r, 'CONV-JOIN-UNIT-DIFFERS')).toEqual([
      expect.objectContaining({ severity: 'error', lines: [2], params: expect.objectContaining({ resultsColumn: 'Depth [m]', resultsUnit: 'm', descriptionColumn: 'Depth [cm]', descriptionUnit: 'cm' }) }),
    ]);
    expect(rowAt(r, 2).cells[colOf(r, 'Depth [m]')]).toBe(10);
  });
});

describe('conflicts: position', () => {
  const run = (resultsLat: Cell, hemi: Cell, conflicts: ConflictAnswer[] = []): MergeResult => {
    const file = xlsxFile('book.xlsx', {
      Counts: [['Sample', 'Taxon', 'Count', 'Latitude', 'Hemisphere'], ['X01', TAX, 1, resultsLat, hemi]],
      Samples: [['Sample', 'Latitude'], ['X01', -61.1]],
    });
    return mergeSampleSheets({
      results: resultsInput(file, 'Counts', { edit: { Taxon: { kind: 'taxon' }, Count: { kind: 'quantity' }, Latitude: { kind: 'latitude' }, Hemisphere: { kind: 'hemisphere', axis: 'latitude' } } } as never),
      description: descriptionInput(file, 'Samples', { edit: { Latitude: { kind: 'latitude' } } } as never),
      keys: [{ results: 0, description: 0 }],
      conflicts,
      appendDescriptionOnly: false,
    });
  };

  it('61.1 with S is the same as -61.1: no conflict', () => {
    const r = run(61.1, 'S');
    expect(r.conflicts).toEqual([]);
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([]);
  });

  it('61.2 with S differs; the description answer gives the signed latitude and consumes every position column', () => {
    const open = run(61.2, 'S');
    expect(group(open, 'position')).toMatchObject({ count: 1, quantity: 'position' });
    const r = run(61.2, 'S', [answer('position', 'description', 1)]);
    const lat = roles(r, ['latitude']);
    expect(lat).toHaveLength(1);
    expect(rowAt(r, 2).cells[lat[0].index]).toBe('-61.1');
    expect(roles(r, ['hemisphere'])).toEqual([]);
    for (const h of ['Hemisphere']) expect(r.info.consumed.has(colOf(r, h))).toBe(true);
    expect(r.info.columns[lat[0].index]).toMatchObject({ side: 'resolved' });
    expect(r.input.mapping.columns.filter((c) => c.header.startsWith('Latitude')).filter((c) => c.role.kind !== 'ignore').map((c) => c.index)).toEqual([lat[0].index]);
  });
});

describe('conflicts: what is not a shared quantity (F18)', () => {
  it('an ignore column and a key part with different texts form no group', () => {
    const file = xlsxFile('book.xlsx', {
      Counts: [[...COUNTS_HEADER, 'Notes', 'Part'], ['X01', TAX, 1, 'one', 'a']],
      Samples: [[...SAMPLES_HEADER, 'Notes', 'Part'], ['X01', 'ST-1', '2021-05-03', 61.1, 4.2, 10, 'two', 'b']],
    });
    const r = mergeSampleSheets({
      results: resultsInput(file, 'Counts', { edit: { Taxon: { kind: 'taxon' }, Count: { kind: 'quantity' }, Notes: { kind: 'ignore' }, Part: { kind: 'keyPart' } } } as never),
      description: descriptionInput(file, 'Samples', { edit: { Notes: { kind: 'ignore' }, Part: { kind: 'keyPart' } } } as never),
      keys: [{ results: 0, description: 0 }],
      conflicts: [],
      appendDescriptionOnly: false,
    });
    expect(r.conflicts).toEqual([]);
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([]);
  });
});

describe('conflicts: a measured variable', () => {
  const temp = (unitRes: string, unitDes: string, des: number, conflicts: ConflictAnswer[] = []): MergeResult => {
    const file = xlsxFile('book.xlsx', {
      Counts: [['Sample', 'Taxon', 'Count', `Temperature [${unitRes}]`], ['X01', TAX, 1, 4.5]],
      Samples: [['Sample', `Temperature [${unitDes}]`], ['X01', des]],
    });
    const role = (u: string): ColumnRole => ({ kind: 'variable', variable: 'Temperature', unit: u });
    return mergeSampleSheets({
      results: resultsInput(file, 'Counts', { edit: { Taxon: { kind: 'taxon' }, Count: { kind: 'quantity' }, [`Temperature [${unitRes}]`]: role(unitRes) } } as never),
      description: descriptionInput(file, 'Samples', { edit: { [`Temperature [${unitDes}]`]: role(unitDes) } } as never),
      keys: [{ results: 0, description: 0 }],
      conflicts,
      appendDescriptionOnly: false,
    });
  };

  it('the same name and unit is one quantity; the group id carries the hash and the label the header', () => {
    const r = temp('degC', 'degC', 4.7);
    const id = `v.${shortHash('Temperature\u0000degC')}`;
    expect(r.conflicts.map((g) => g.group)).toEqual([id]);
    expect(group(r, id)).toMatchObject({ quantity: 'variable', label: 'Temperature [degC]', count: 1 });
    const taken = temp('degC', 'degC', 4.7, [answer(id, 'description', 1)]);
    expect(rowAt(taken, 2).cells[colOf(taken, 'Temperature [degC]')]).toBe(4.7);
    expect(taken.info.notChosen).toEqual([expect.objectContaining({ side: 'results', group: id })]);
  });

  it('another unit is not the same quantity: no group, both columns kept', () => {
    const r = temp('degC', 'degF', 40.5);
    expect(r.conflicts).toEqual([]);
    expect(roles(r, ['variable'])).toHaveLength(2);
  });
});

describe('the open items of the merge', () => {
  it('a description-only row is counted as filled, in the results columns it fills', () => {
    const file = xlsxFile('book.xlsx', { Counts: [[...COUNTS_HEADER, 'Depth'], ['X01', TAX, 1, 10]], Samples: [SAMPLES_HEADER, ...SAMPLES_ROWS] });
    const r = mergeSampleSheets({ results: resultsInput(file, 'Counts'), description: descriptionInput(file, 'Samples'), keys: [{ results: 0, description: 0 }], conflicts: [], appendDescriptionOnly: true });
    const filled = found(r, 'CONV-JOIN-FILLED').find((f) => f.params?.column === 'Depth')!;
    expect(filled.params).toMatchObject({ count: 2, from: 'Samples' });
  });

  it('a description-only row with a depth of another structure gets the resolved columns', () => {
    const file = xlsxFile('book.xlsx', {
      Counts: [['Sample', 'Taxon', 'Count', 'Depth [m]'], ['X01', TAX, 1, 10]],
      Samples: [['Sample', 'Depth [km]'], ['X01', 0.01], ['X02', 0.02]],
    });
    const r = mergeSampleSheets({ results: resultsInput(file, 'Counts'), description: descriptionInput(file, 'Samples'), keys: [{ results: 0, description: 0 }], conflicts: [], appendDescriptionOnly: true });
    const min = roles(r, ['depth']).find((c) => (c.role as { bound?: string }).bound === 'min')!;
    const added = sheetOf(r).rows[1];
    expect(added.cells[0]).toBe('X02');
    expect(added.cells[min.index]).toBe('20');
    expect(rowAt(r, 2).cells[min.index]).toBe('10');
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([]);
  });
});


describe('every other shared role is a quantity (review 1)', () => {
  const build = (extraRes: Cell[], extraDes: Cell[], resHeader: string, desHeader: string, roleRes: ColumnRole, roleDes: ColumnRole, conflicts: ConflictAnswer[] = []): MergeResult => {
    const file = xlsxFile('book.xlsx', {
      Counts: [['Sample', 'Taxon', 'Count', resHeader], ['X01', TAX, 1, ...extraRes]],
      Samples: [['Sample', desHeader], ['X01', ...extraDes]],
    });
    return mergeSampleSheets({
      results: resultsInput(file, 'Counts', { edit: { Taxon: { kind: 'taxon' }, Count: { kind: 'quantity' }, [resHeader]: roleRes } } as never),
      description: descriptionInput(file, 'Samples', { edit: { [desHeader]: roleDes } } as never),
      keys: [{ results: 0, description: 0 }],
      conflicts,
      appendDescriptionOnly: false,
    });
  };

  it('a non-numeric role (replicate) forms r.replicate and the description value can be taken', () => {
    const r = build(['A'], ['B'], 'Rep', 'Rep', { kind: 'replicate' }, { kind: 'replicate' });
    expect(r.conflicts.map((g) => g.group)).toEqual(['r.replicate']);
    expect(group(r, 'r.replicate').entries[0]).toMatchObject({ resultsText: 'A', descriptionText: 'B' });
    const taken = build(['A'], ['B'], 'Rep', 'Rep', { kind: 'replicate' }, { kind: 'replicate' }, [answer('r.replicate', 'description', 1)]);
    expect(rowAt(taken, 2).cells[colOf(taken, 'Rep')]).toBe('B');
    expect(roles(taken, ['replicate'])).toHaveLength(1);
  });

  it('a numeric role in two units blocks instead of becoming two columns of one role', () => {
    const r = build([5], [500], 'Press', 'Press2', { kind: 'pressure', unit: 'dbar' }, { kind: 'pressure', unit: 'bar' });
    expect(r.conflicts).toEqual([]);
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([]);
    expect(found(r, 'CONV-JOIN-UNIT-DIFFERS')).toEqual([
      expect.objectContaining({ severity: 'error', params: expect.objectContaining({ resultsColumn: 'Press', resultsUnit: 'dbar', descriptionColumn: 'Press2', descriptionUnit: 'bar' }) }),
    ]);
  });
});

describe('a resolved depth keeps the digits and the original text (review 2)', () => {
  const run = (resRows: Cell[][], desRows: Cell[][], resHeader: string, desHeader: string, conflicts: ConflictAnswer[] = []): MergeResult => {
    const file = xlsxFile('book.xlsx', { Counts: [['Sample', 'Taxon', 'Count', resHeader], ...resRows], Samples: [['Sample', desHeader], ...desRows] });
    return mergeSampleSheets({ results: resultsInput(file, 'Counts'), description: descriptionInput(file, 'Samples'), keys: [{ results: 0, description: 0 }], conflicts, appendDescriptionOnly: false });
  };

  it('"33 ft" of the results is kept as the original of the resolved cell, also on a row that keeps the results value', () => {
    const r = run([['X01', TAX, 1, 33], ['X02', TAX, 1, 33]], [['X01', 0.0100584], ['X02', 0.02]], 'Depth [ft]', 'Depth [km]', [answer('depth', 'description', 1)]);
    const min = roles(r, ['depth']).find((c) => (c.role as { bound?: string }).bound === 'min')!;
    expect(rowAt(r, 2).cells[min.index]).toBe('10.0584');
    expect(r.info.rewritten.get(`2:${min.index}`)).toBe("33 ft");
    expect(rowAt(r, 3).cells[min.index]).toBe('20');
    expect(r.info.rewritten.get(`3:${min.index}`)).toBe("0.02 km");
  });

  it('"10.50" keeps its trailing zero in the resolved cell', () => {
    const r = run([['X01', TAX, 1, '10.50'], ['X02', TAX, 1, '12']], [['X01', 0.0105], ['X02', 0.02]], 'Depth [m]', 'Depth [km]', [answer('depth', 'description', 1)]);
    const min = roles(r, ['depth']).find((c) => (c.role as { bound?: string }).bound === 'min')!;
    expect(rowAt(r, 2).cells[min.index]).toBe('10.50');
    expect(rowAt(r, 3).cells[min.index]).toBe('20');
  });
});

describe('a part only one side gives is a fill, not a conflict (review 3)', () => {
  const dates = (resDate: Cell, desDate: Cell, desTime: Cell | undefined, resTime?: Cell, conflicts: ConflictAnswer[] = []): MergeResult => {
    const file = xlsxFile('book.xlsx', {
      Counts: [['Sample', 'Taxon', 'Count', 'Date', ...(resTime === undefined ? [] : ['Time'])], ['X01', TAX, 1, resDate, ...(resTime === undefined ? [] : [resTime])]],
      Samples: [['Sample', 'Date', ...(desTime === undefined ? [] : ['Time'])], ['X01', desDate, ...(desTime === undefined ? [] : [desTime])]],
    });
    return mergeSampleSheets({ results: resultsInput(file, 'Counts'), description: descriptionInput(file, 'Samples'), keys: [{ results: 0, description: 0 }], conflicts, appendDescriptionOnly: false });
  };

  it('Date against Date + Time with the same date: no conflict, the time is filled and counted', () => {
    const r = dates('2021-05-03', '2021-05-03', '10:00');
    expect(r.conflicts).toEqual([]);
    const merged = roles(r, ['datetime'])[0];
    expect(rowAt(r, 2).cells[merged.index]).toBe('2021-05-03T10:00');
    expect(found(r, 'CONV-JOIN-FILLED')).toEqual([expect.objectContaining({ params: expect.objectContaining({ count: 1 }) })]);
  });

  it('Date + Time against Date with the same date: no conflict, the results keep their time', () => {
    const r = dates('2021-05-03', '2021-05-03', undefined, '10:00');
    expect(r.conflicts).toEqual([]);
    expect(found(r, 'CONV-JOIN-CONFLICT')).toEqual([]);
    expect(rowAt(r, 2).cells[colOf(r, 'Time')]).toBe('10:00');
  });

  it('different dates conflict as the date with its time; the chosen date takes its own time of day (none here)', () => {
    const r = dates('2021-05-02', '2021-05-03', undefined, '10:00');
    expect(group(r, 'date').count).toBe(1);
    const taken = dates('2021-05-02', '2021-05-03', undefined, '10:00', [answer('date', 'description', 1)]);
    const merged = roles(taken, ['datetime'])[0];
    expect(rowAt(taken, 2).cells[merged.index]).toBe('2021-05-03');
    expect(taken.info.notChosen.length).toBeGreaterThan(0);
  });

  it('a latitude only the description gives against latitude + longitude: no conflict; a longitude only the results give stays after the description latitude is taken', () => {
    const file = xlsxFile('book.xlsx', { Counts: [['Sample', 'Taxon', 'Count', 'Latitude', 'Longitude'], ['X01', TAX, 1, 61.2, 4.2]], Samples: [['Sample', 'Latitude'], ['X01', 61.1]] });
    const mk = (conflicts: ConflictAnswer[]) => mergeSampleSheets({ results: resultsInput(file, 'Counts'), description: descriptionInput(file, 'Samples'), keys: [{ results: 0, description: 0 }], conflicts, appendDescriptionOnly: false });
    expect(group(mk([]), 'position').count).toBe(1);
    const r = mk([answer('position', 'description', 1)]);
    const lat = roles(r, ['latitude'])[0];
    const lon = roles(r, ['longitude'])[0];
    expect(rowAt(r, 2).cells[lat.index]).toBe('61.1');
    expect(rowAt(r, 2).cells[lon.index]).toBe('4.2');
    const same = mergeSampleSheets({ results: resultsInput(file, 'Counts'), description: descriptionInput(xlsxFile('b.xlsx', { Samples: [['Sample', 'Latitude'], ['X01', 61.2]] }), 'Samples'), keys: [{ results: 0, description: 0 }], conflicts: [], appendDescriptionOnly: false });
    expect(same.conflicts).toEqual([]);
  });

  it('a single depth against a top and bottom stays a conflict (different meaning)', () => {
    const file = xlsxFile('book.xlsx', { Counts: [['Sample', 'Taxon', 'Count', 'Depth top [m]'], ['X01', TAX, 1, 10]], Samples: [['Sample', 'Depth'], ['X01', 10]] });
    const r = mergeSampleSheets({ results: resultsInput(file, 'Counts'), description: descriptionInput(file, 'Samples'), keys: [{ results: 0, description: 0 }], conflicts: [], appendDescriptionOnly: false });
    expect(group(r, 'depth').count).toBe(1);
  });
});

describe('choosing never invents or lists wrongly (re-review)', () => {
  const run = (resHeader: string, resVal: Cell, desHeader: string, desVal: Cell, conflicts: ConflictAnswer[]): MergeResult => {
    const file = xlsxFile('book.xlsx', { Counts: [['Sample', 'Taxon', 'Count', resHeader], ['X01', TAX, 1, resVal]], Samples: [['Sample', desHeader], ['X01', desVal]] });
    return mergeSampleSheets({ results: resultsInput(file, 'Counts'), description: descriptionInput(file, 'Samples'), keys: [{ results: 0, description: 0 }], conflicts, appendDescriptionOnly: false });
  };
  const minmax = (r: MergeResult) => {
    const d = roles(r, ['depth']);
    const cell = (b: string) => rowAt(r, 2).cells[d.find((c) => (c.role as { bound?: string }).bound === b)!.index];
    return [cell('min'), cell('max')];
  };

  it('a single depth against a top: the chosen side is written as it is, no range is made up', () => {
    const a = run('Depth [m]', 50, 'Depth top [m]', 10, [answer('depth', 'description', 1)]);
    expect(minmax(a)).toEqual(['10', null]);
    const b = run('Depth top [m]', 10, 'Depth [m]', 50, [answer('depth', 'results', 1)]);
    expect(roles(b, ['depth']).map((c) => (c.role as { bound?: string }).bound)).toEqual(['min']);
    expect(rowAt(b, 2).cells[colOf(b, 'Depth top [m]')]).toBe(10);
    expect(found(b, 'CONV-JOIN-FILLED')).toEqual([]);
  });

  it('notChosen lists only the values not written: a kept longitude is not listed', () => {
    const file = xlsxFile('book.xlsx', { Counts: [['Sample', 'Taxon', 'Count', 'Latitude', 'Longitude'], ['X01', TAX, 1, 61.2, 4.2]], Samples: [['Sample', 'Latitude'], ['X01', 61.1]] });
    const r = mergeSampleSheets({ results: resultsInput(file, 'Counts'), description: descriptionInput(file, 'Samples'), keys: [{ results: 0, description: 0 }], conflicts: [answer('position', 'description', 1)], appendDescriptionOnly: false });
    expect(r.info.notChosen.map((n) => n.column)).toEqual([colOf(r, 'Latitude')]);
  });

  it('a blank results cell filled from the description under "take results" is not listed as not chosen', () => {
    const file = xlsxFile('book.xlsx', {
      Counts: [['Sample', 'Taxon', 'Count', 'Date', 'Time'], ['X01', TAX, 1, '2021-05-02', null]],
      Samples: [['Sample', 'Date', 'Time'], ['X01', '2021-05-03', '10:00']],
    });
    const r = mergeSampleSheets({ results: resultsInput(file, 'Counts'), description: descriptionInput(file, 'Samples'), keys: [{ results: 0, description: 0 }], conflicts: [answer('date', 'results', 1)], appendDescriptionOnly: false });
    expect(rowAt(r, 2).cells[colOf(r, 'Date')]).toBe('2021-05-02');
    // the description Date (column 6) is not written; its Time (column 7) filled the blank results cell and is not listed
    expect(r.info.notChosen.map((n) => [n.side, n.column])).toEqual([['description', 6]]);
  });
});
