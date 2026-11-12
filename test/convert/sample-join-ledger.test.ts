// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The description sheet of a join has its own balanced ledger; the values not written are listed beside the archive. Invented data.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { combineDescriptionLedgers } from '../../src/core/convert/ledger';
import type { SheetLedger } from '../../src/core/convert/ledger';
import { leftOutKey, notWrittenCsv, notWrittenRows } from '../../src/core/convert/notWritten';
import { joinInputs } from '../../src/core/convert/sampleJoin';
import type { SampleJoinRequestCore } from '../../src/core/convert/sampleJoin';
import type { Finding } from '../../src/core/types';
import { xlsxFile } from '../helpers/files';
import type { Cell } from '../helpers/files';
import { BOOK, COUNTS_HEADER, COUNTS_ROWS, SAMPLES_HEADER, SAMPLES_ROWS, bookInputs, descriptionInput, resultsInput } from './joinFixtures';

const TAX = 'Calanus finmarchicus';
const JOIN: SampleJoinRequestCore = { results: 0, description: 1, keys: [{ results: 0, description: 0 }], conflicts: [] };
const converted = (inputs: ConvertSheetInput[], joins: SampleJoinRequestCore[] = [JOIN]) => {
  const out = joinInputs(inputs, joins, []);
  return { out, result: convert({ sheets: out.sheets }) };
};
const rules = (fs: readonly Finding[], id: string): Finding[] => fs.filter((f) => f.ruleId === id);
const bookOf = (counts: Cell[][], samples: Cell[][], countsHeader: Cell[] = COUNTS_HEADER): ConvertSheetInput[] => {
  const file = xlsxFile('book.xlsx', { Counts: [countsHeader, ...counts], Samples: [SAMPLES_HEADER, ...samples] });
  return [resultsInput(file, 'Counts'), descriptionInput(file, 'Samples')];
};
const named = (ledger: readonly SheetLedger[], sheet: string): SheetLedger => ledger.find((l) => l.sheet === sheet)!;
const DATE_HEADER: Cell[] = [...COUNTS_HEADER, 'Date'];
const dated = (x01: Cell): Cell[][] => [['X01', TAX, 5, x01], ['X02', TAX, 3, '2021-05-04']];

describe('the ledger of a joined workbook (spec test 13)', () => {
  it('has an entry for the results sheet and one for the description sheet, both balanced', () => {
    const { result } = converted(bookInputs());
    expect(result.ledger.map((l) => l.sheet)).toEqual(['Counts', 'Samples']);
    const counts = named(result.ledger, 'Counts');
    const samples = named(result.ledger, 'Samples');
    expect(counts).toMatchObject({ kind: 'long', balanced: true, rows: { source: 3, written: 3 } });
    expect(samples).toMatchObject({ kind: 'description', unit: 'rows', balanced: true, file: 'book.xlsx', rows: { source: 3, written: 3, unexplained: 0 }, lent: [{ sheet: 'Counts', lines: 2, samples: 2 }] });
    expect(samples.lines).toEqual([expect.objectContaining({ line: 4, fate: 'written', wrote: ['event'] })]);
    expect(samples.inputIndex).toBe(counts.inputIndex);
    // the columns of the description carry its own headers, the consumed key and the results' columns are in neither
    expect(samples.columns.map((c) => c.header)).toEqual(expect.arrayContaining(['Depth']));
    expect(samples.columns.some((c) => /\(2\)|^Sample$/.test(c.header))).toBe(false);
    expect(counts.columns.some((c) => c.header === 'Depth')).toBe(false);
  });

  it('is not changed for an input without a join', () => {
    const r = convert({ sheets: [resultsInput(BOOK, 'Counts')] });
    expect(r.ledger.map((l) => l.kind)).toEqual(['long']);
  });
});

describe('the value not chosen is listed with both lines (P7)', () => {
  const answer = (take: 'description' | 'results') => [{ ...JOIN, conflicts: [{ group: 'date', take, count: 1, exceptions: [] }] }];
  it('description chosen: the Counts line is listed, with its original cells', () => {
    const { out, result } = converted(bookOf(dated('2021-05-02'), SAMPLES_ROWS, DATE_HEADER), answer('description'));
    expect(result.ok).toBe(true);
    const rows = [...notWrittenRows(result.ledger, out.sheets, result.leftOut)].filter((r) => r.kind !== 'header');
    expect(rows).toEqual([
      expect.objectContaining({ sheet: 'Counts', line: 2, reason: 'cells-not-written', status: 'understood', detail: 'Date (join-not-chosen: 2021-05-03 taken from Samples line 2)', cells: ['X01', TAX, 5, '2021-05-02'], kind: 'lost-cells' }),
    ]);
    // never counted as a taxon cell or a row
    expect(named(result.ledger, 'Counts').rows.unexplained).toBe(0);
    expect(named(result.ledger, 'Counts').balanced).toBe(true);
    expect(named(result.ledger, 'Samples').balanced).toBe(true);
  });

  it('results chosen: the Samples line is listed instead', () => {
    const { out, result } = converted(bookOf(dated('2021-05-02'), SAMPLES_ROWS, DATE_HEADER), answer('results'));
    expect(result.ok).toBe(true);
    const rows = [...notWrittenRows(result.ledger, out.sheets, result.leftOut)].filter((r) => r.kind !== 'header');
    expect(rows).toEqual([
      expect.objectContaining({ sheet: 'Samples', line: 2, reason: 'cells-not-written', detail: 'Date (join-not-chosen: 2021-05-02 taken from Counts line 2)', cells: ['X01', 'ST-1', '2021-05-03', 61.1, 4.2, 10], kind: 'lost-cells' }),
    ]);
    const csv = notWrittenCsv(result.ledger, out.sheets, result.leftOut);
    expect(csv.count).toBe(1);
    expect(csv.chunks.join('')).toContain('Samples,2,cells-not-written,understood,Date (join-not-chosen: 2021-05-02 taken from Counts line 2)');
  });
});

describe('a description row with a blank key (Review Focus 2, F14)', () => {
  const samples = [...SAMPLES_ROWS, [null, 'ST-9', '2021-05-09', 62, 5, 30]];
  it('is asked about, and the question is not the results side', () => {
    const { out, result } = converted(bookOf(COUNTS_ROWS, samples));
    const samplesLedger = named(result.ledger, 'Samples');
    expect(samplesLedger.lines.filter((l) => l.fate !== 'written')).toEqual([expect.objectContaining({ line: 5, fate: 'join-no-key' })]);
    expect(samplesLedger.notUnderstood).toBe(1);
    expect(samplesLedger.balanced).toBe(true);
    expect(rules(result.findings, 'CONV-JOIN-KEY-BLANK')).toEqual([expect.objectContaining({ sheet: 'Samples', params: expect.objectContaining({ side: 'description' }) })]);
    expect(rules(result.findings, 'CONV-ROW-NOT-UNDERSTOOD')).toEqual([expect.objectContaining({ sheet: 'Samples', params: expect.objectContaining({ reason: 'join-no-key', count: 1 }) })]);
    expect(result.ok).toBe(false);
    const row = [...notWrittenRows(result.ledger, out.sheets, result.leftOut)].find((r) => r.kind === 'line')!;
    expect(row).toMatchObject({ sheet: 'Samples', line: 5, reason: 'join-no-key', status: 'needs-decision' });
  });

  const withAnswer = (count: number): ConvertSheetInput[] => {
    const file = xlsxFile('book.xlsx', { Counts: [COUNTS_HEADER, ...COUNTS_ROWS], Samples: [SAMPLES_HEADER, ...samples] });
    return [resultsInput(file, 'Counts'), descriptionInput(file, 'Samples', { leaveOut: [{ reason: 'join-no-key', count }] })];
  };

  it('answered "leave out and list": left out, listed in the not-written file, the key finding gone, ledger balanced', () => {
    const { out, result } = converted(withAnswer(1));
    expect(rules(result.findings, 'CONV-ROW-LEFT-OUT')).toEqual([expect.objectContaining({ sheet: 'Samples', params: expect.objectContaining({ reason: 'join-no-key', count: 1 }) })]);
    expect(rules(result.findings, 'CONV-JOIN-KEY-BLANK')).toEqual([]);
    expect(rules(result.findings, 'CONV-ROW-NOT-UNDERSTOOD')).toEqual([]);
    expect(result.ok).toBe(true);
    expect(named(result.ledger, 'Samples').balanced).toBe(true);
    const row = [...notWrittenRows(result.ledger, out.sheets, result.leftOut)].find((r) => r.kind === 'line')!;
    expect(row).toMatchObject({ sheet: 'Samples', line: 5, reason: 'join-no-key', status: 'left-out', cells: [null, 'ST-9', '2021-05-09', 62, 5, 30] });
    expect(notWrittenCsv(result.ledger, out.sheets, result.leftOut).chunks.join('')).toContain('Samples,5,join-no-key,left-out');
  });

  it('an answer given for another number keeps the question', () => {
    const { result } = converted(withAnswer(2));
    expect(rules(result.findings, 'CONV-ROW-NOT-UNDERSTOOD')).toHaveLength(1);
    expect(rules(result.findings, 'CONV-ROW-LEFT-OUT')).toEqual([]);
    expect(result.ok).toBe(false);
  });
});

describe('ambiguous description lines (P3)', () => {
  it('have the fate join-ambiguous and one question only', () => {
    const { result } = converted(bookOf(COUNTS_ROWS, [...SAMPLES_ROWS, ['X01', 'ST-9', '2021-05-09', 62, 5, 40]]));
    const samples = named(result.ledger, 'Samples');
    expect(samples.lines.filter((l) => l.fate === 'join-ambiguous').map((l) => l.line)).toEqual([2, 5]);
    expect(samples.balanced).toBe(true);
    expect(rules(result.findings, 'CONV-JOIN-AMBIGUOUS')).toHaveLength(1);
    expect(rules(result.findings, 'CONV-ROW-NOT-UNDERSTOOD')).toEqual([]);
    expect(result.ok).toBe(false);
  });

  it('are listed as needs-decision while the finding stands', () => {
    const { out, result } = converted(bookOf(COUNTS_ROWS, [...SAMPLES_ROWS, ['X01', 'ST-9', '2021-05-09', 62, 5, 40]]));
    const rows = [...notWrittenRows(result.ledger, out.sheets, result.leftOut)].filter((r) => r.kind === 'line');
    expect(rows.map((r) => [r.sheet, r.line, r.reason, r.status])).toEqual([
      ['Samples', 2, 'join-ambiguous', 'needs-decision'],
      ['Samples', 5, 'join-ambiguous', 'needs-decision'],
    ]);
  });
});

describe('a join that matches nothing (CONV-JOIN-NO-MATCH)', () => {
  const none = () => converted(bookOf([['S02', TAX, 3], ['S011', TAX, 4]], [['SO2', 'ST-1', '2021-05-03', 61.1, 4.2, 10], ['SO11', 'ST-2', '2021-05-04', 61.3, 4.6, 20]]));

  it('keeps the description ledger balanced: every line has the reason join-no-match', () => {
    const { result } = none();
    expect(rules(result.findings, 'CONV-JOIN-NO-MATCH')).toHaveLength(1);
    const samples = named(result.ledger, 'Samples');
    expect(samples.balanced).toBe(true);
    expect(samples.rows).toMatchObject({ source: 2, unexplained: 0 });
    expect(samples.lines.map((l) => [l.line, l.fate])).toEqual([[2, 'join-no-match'], [3, 'join-no-match']]);
    expect(result.ok).toBe(false);
  });

  it('lists the lines as needs-decision while the finding stands', () => {
    const { out, result } = none();
    const rows = [...notWrittenRows(result.ledger, out.sheets, result.leftOut)].filter((r) => r.kind === 'line');
    expect(rows.map((r) => [r.sheet, r.line, r.reason, r.status])).toEqual([
      ['Samples', 2, 'join-no-match', 'needs-decision'],
      ['Samples', 3, 'join-no-match', 'needs-decision'],
    ]);
  });
});

describe('duplicate identical description rows', () => {
  it('count as one sample and each line says what happened to it', () => {
    const { out, result } = converted(bookOf(COUNTS_ROWS, [...SAMPLES_ROWS, ['X01', 'ST-1', '2021-05-03', 61.1, 4.2, 10]]));
    const samples = named(result.ledger, 'Samples');
    expect(samples.rows).toMatchObject({ source: 4, written: 4, unexplained: 0 });
    expect(samples.balanced).toBe(true);
    expect(samples.lines).toContainEqual(expect.objectContaining({ line: 5, fate: 'written', sameAs: 2 }));
    expect(samples.lent).toEqual([{ sheet: 'Counts', lines: 3, samples: 2 }]);
    expect(rules(result.findings, 'CONV-JOIN-AMBIGUOUS')).toEqual([]);
    expect([...notWrittenRows(result.ledger, out.sheets, result.leftOut)].filter((r) => r.kind !== 'header')).toEqual([]);
  });
});

describe('a description text its own file rejects as a number, lent blank', () => {
  it('is listed in the not-written file with its original text', () => {
    const file = xlsxFile('book.xlsx', {
      Counts: [COUNTS_HEADER, ...COUNTS_ROWS],
      Samples: [SAMPLES_HEADER, ['X01', 'ST-1', '2021-05-03', '61,1', 4.2, 10], ['X02', 'ST-2', '2021-05-04', 61.3, 4.6, 20], ['X03', 'ST-3', '2021-05-05', 61.5, 4.9, 30]],
    });
    const des = { ...descriptionInput(file, 'Samples'), file: { ...file, decimalComma: false } };
    const res = { ...resultsInput(file, 'Counts'), file: { ...file, decimalComma: true } };
    const { out, result } = converted([res, des]);
    const rows = [...notWrittenRows(result.ledger, out.sheets, result.leftOut)].filter((r) => r.kind !== 'header');
    expect(rows).toEqual([expect.objectContaining({ sheet: 'Samples', line: 2, reason: 'cells-not-written', detail: expect.stringContaining('Latitude (text-cell)'), cells: ['X01', 'ST-1', '2021-05-03', '61,1', 4.2, 10] })]);
    expect(named(result.ledger, 'Samples').balanced).toBe(true);
  });
});

describe('one description for several results sheets (decision 6, F12)', () => {
  const file = xlsxFile('runs.xlsx', {
    Phyto: [COUNTS_HEADER, ['X01', TAX, 5], ['X02', TAX, 4]],
    Zoo: [COUNTS_HEADER, ['X05', 'Oithona similis', 2]],
    Samples: [SAMPLES_HEADER, ['X01', 'ST-1', '2021-05-03', 61.1, 4.2, 10], ['X02', 'ST-2', '2021-05-04', 61.3, 4.6, 20], ['X03', 'ST-3', '2021-05-05', 61.5, 4.9, 30], ['X05', 'ST-5', '2021-05-06', 61.7, 5.1, 50]],
  });
  const joins: SampleJoinRequestCore[] = [
    { results: 0, description: 2, keys: [{ results: 0, description: 0 }], conflicts: [] },
    { results: 1, description: 2, keys: [{ results: 0, description: 0 }], conflicts: [] },
  ];
  it('is one Samples ledger that says which sheet each line was lent to', () => {
    const { result } = converted([resultsInput(file, 'Phyto'), resultsInput(file, 'Zoo'), descriptionInput(file, 'Samples')], joins);
    expect(result.ledger.map((l) => l.sheet)).toEqual(['Phyto', 'Zoo', 'Samples']);
    const samples = named(result.ledger, 'Samples');
    expect(samples).toMatchObject({ kind: 'description', balanced: true, rows: { source: 4, written: 4, unexplained: 0 } });
    expect(samples.lent).toEqual([
      { sheet: 'Phyto', lines: 2, samples: 2 },
      { sheet: 'Zoo', lines: 1, samples: 1 },
    ]);
    expect(samples.lines.filter((l) => l.wrote !== undefined)).toEqual([expect.objectContaining({ line: 4, fate: 'written', wrote: ['event'] })]);
    expect(named(result.ledger, 'Phyto').balanced && named(result.ledger, 'Zoo').balanced).toBe(true);
    expect(result.ledger.filter((l) => l.kind === 'description')).toHaveLength(1);
  });

  it('combineDescriptionLedgers is the only combiner: one part is itself', () => {
    const { result } = converted(bookInputs());
    const samples = named(result.ledger, 'Samples');
    expect(combineDescriptionLedgers([samples])).toEqual(samples);
  });
});

describe('a description line is written only when a results row it was lent to wrote something', () => {
  it('lent to a results row that wrote nothing: listed whole, naming the results row', () => {
    const { out, result } = converted(bookOf([['X01', TAX, 12], ['X01', 'Oithona similis', 3], ['X02', TAX, null]], SAMPLES_ROWS));
    const samples = named(result.ledger, 'Samples');
    expect(samples.lines).toContainEqual(expect.objectContaining({ line: 3, fate: 'join-results-not-written', lentTo: [{ sheet: 'Counts', lines: [4] }] }));
    expect(samples.rows).toMatchObject({ source: 3, written: 2, unexplained: 0 });
    expect(samples.balanced).toBe(true);
    const row = [...notWrittenRows(result.ledger, out.sheets, result.leftOut)].find((r) => r.sheet === 'Samples' && r.kind === 'line')!;
    expect(row).toMatchObject({ line: 3, reason: 'join-results-not-written', status: 'understood', cells: ['X02', 'ST-2', '2021-05-04', 61.3, 4.6, 20] });
    expect(row.detail).toContain('lent to Counts line 4');
  });

  it('a zero count still writes the event, so the line is written', () => {
    const { result } = converted(bookOf([['X01', TAX, 12], ['X02', TAX, 0]], SAMPLES_ROWS));
    expect(named(result.ledger, 'Samples').lines.some((l) => l.fate === 'join-results-not-written')).toBe(false);
  });

  it('with several results sheets: written if any of them wrote it, listed if none did', () => {
    const file = xlsxFile('runs.xlsx', {
      Phyto: [COUNTS_HEADER, ['X01', TAX, 5], ['X02', TAX, null]],
      Zoo: [COUNTS_HEADER, ['X01', 'Oithona similis', 2], ['X05', 'Oithona similis', null]],
      Samples: [SAMPLES_HEADER, ['X01', 'ST-1', '2021-05-03', 61.1, 4.2, 10], ['X02', 'ST-2', '2021-05-04', 61.3, 4.6, 20], ['X05', 'ST-5', '2021-05-06', 61.7, 5.1, 50]],
    });
    const joins: SampleJoinRequestCore[] = [
      { results: 0, description: 2, keys: [{ results: 0, description: 0 }], conflicts: [] },
      { results: 1, description: 2, keys: [{ results: 0, description: 0 }], conflicts: [] },
    ];
    const { result } = converted([resultsInput(file, 'Phyto'), resultsInput(file, 'Zoo'), descriptionInput(file, 'Samples')], joins);
    const samples = named(result.ledger, 'Samples');
    expect(samples.lines.filter((l) => l.fate !== 'written').map((l) => [l.line, l.fate])).toEqual([[3, 'join-results-not-written'], [4, 'join-results-not-written']]);
    expect(samples.rows).toMatchObject({ source: 3, written: 1, unexplained: 0 });
    expect(samples.balanced).toBe(true);
  });
});

describe('the description columns are counted from the description sheet', () => {
  it('each cell once, however many results rows it was lent to', () => {
    const { result } = converted(bookInputs());
    const lat = named(result.ledger, 'Samples').columns.find((c) => c.header === 'Latitude')!;
    expect(lat).toMatchObject({ numbers: 3, sum: 183.9 });
    const depth = named(result.ledger, 'Samples').columns.find((c) => c.header === 'Depth')!;
    expect(depth).toMatchObject({ numbers: 3, sum: 60 });
  });

  it('an identical copy is counted too', () => {
    const { result } = converted(bookOf(COUNTS_ROWS, [...SAMPLES_ROWS, ['X01', 'ST-1', '2021-05-03', 61.1, 4.2, 10]]));
    expect(named(result.ledger, 'Samples').columns.find((c) => c.header === 'Depth')).toMatchObject({ numbers: 4, sum: 70 });
  });

  it('a copy of a description-only row does not claim its event', () => {
    const { result } = converted(bookOf(COUNTS_ROWS, [...SAMPLES_ROWS, ['X03', 'ST-3', '2021-05-05', 61.5, 4.9, 30]]));
    const lines = named(result.ledger, 'Samples').lines;
    expect(lines.find((l) => l.line === 4)).toMatchObject({ wrote: ['event'] });
    expect(lines.find((l) => l.line === 5)).toMatchObject({ fate: 'written', sameAs: 4 });
    expect(lines.find((l) => l.line === 5)!.wrote).toBeUndefined();
  });
});

describe('a reason left out on one side of a join is not left out on the other', () => {
  it('the results and the description ledger of one input have keys of their own, and the answer of a description line stays on its sheet', () => {
    const { out, result } = converted(bookInputs());
    const res = named(result.ledger, 'Counts');
    const des = named(result.ledger, 'Samples');
    expect(res.inputIndex).toBe(des.inputIndex);
    expect(leftOutKey(res, 'sample-no-taxon')).not.toBe(leftOutKey(des, 'sample-no-taxon'));
    // only the description's key is given: no line of the results ledger can show as left out for it
    const rows = [...notWrittenRows(result.ledger, out.sheets, [leftOutKey(des, 'no-code')])];
    expect(rows.filter((r) => r.sheet === 'Counts' && r.status === 'left-out')).toEqual([]);
  });
});
