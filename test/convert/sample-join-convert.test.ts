// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// convert() reads a merged sheet: description-only events, findings put on the description sheet, several results sheets for one description, the join's own findings. Invented data.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { joinInputs, proposeSampleJoins } from '../../src/core/convert/sampleJoin';
import type { SampleJoinRequestCore } from '../../src/core/convert/sampleJoin';
import { keyPrefixOf } from '../../src/core/convert/sampleKey';
import type { Finding } from '../../src/core/types';
import { textFile, xlsxFile } from '../helpers/files';
import type { Cell } from '../helpers/files';
import { BOOK, COUNTS_HEADER, COUNTS_ROWS, SAMPLES_HEADER, SAMPLES_ROWS, bookInputs, descriptionInput, resultsInput } from './joinFixtures';
import { sheetInput } from './helpers';

const TAX = 'Calanus finmarchicus';
const JOIN: SampleJoinRequestCore = { results: 0, description: 1, keys: [{ results: 0, description: 0 }], conflicts: [] };
const converted = (inputs: ConvertSheetInput[], joins: SampleJoinRequestCore[] = [JOIN]) => {
  const out = joinInputs(inputs, joins, []);
  return { out, result: convert({ sheets: out.sheets }) };
};
const rules = (fs: readonly Finding[], id: string): Finding[] => fs.filter((f) => f.ruleId === id);
const ev = (r: { events: { id: string }[] }, id: string) => r.events.filter((e) => e.id === id);
const bookOf = (counts: Cell[][], samples: Cell[][], countsHeader: Cell[] = COUNTS_HEADER, samplesHeader: Cell[] = SAMPLES_HEADER): ConvertSheetInput[] => {
  const file = xlsxFile('book.xlsx', { Counts: [countsHeader, ...counts], Samples: [samplesHeader, ...samples] });
  return [resultsInput(file, 'Counts'), descriptionInput(file, 'Samples')];
};

describe('convert() reads the merged sheet', () => {
  it('writes the date, position, depth and station of the description to the events of the results (spec test 2)', () => {
    const { result, out } = converted(bookInputs());
    expect(out.sheets).toHaveLength(1);
    const x01 = ev(result, 'X01')[0] as never as { eventDate: string; lat: number; depthMin: number; parentId: string };
    const x02 = ev(result, 'X02')[0] as never as { eventDate: string; lat: number; depthMin: number; parentId: string };
    expect([x01.eventDate, x01.lat, x01.depthMin, x01.parentId]).toEqual(['2021-05-03', 61.1, 10, 'ST-1']);
    expect([x02.eventDate, x02.lat, x02.depthMin, x02.parentId]).toEqual(['2021-05-04', 61.3, 20, 'ST-2']);
    // the occurrences are the ones the results sheet gives alone
    const alone = convert({ sheets: [resultsInput(BOOK, 'Counts')] });
    expect(result.occurrences.filter((o) => o.eventId !== 'X03').map((o) => o.id)).toEqual(alone.occurrences.map((o) => o.id));
    expect(result.occurrences).toHaveLength(3);
    expect(rules(result.findings, 'CONV-ID-DUPLICATE')).toEqual([]);
  });

  it('a described sample with no results is an event with no occurrence, wide (spec test 3)', () => {
    const file = xlsxFile('book.xlsx', {
      Counts: [['Sample', TAX, 'Oithona similis'], ['X01', 12, 3], ['X02', 7, 0]],
      Samples: [SAMPLES_HEADER, ...SAMPLES_ROWS],
    });
    const { result } = converted([sheetInput({ ...file, sheets: [file.sheets[0]] }, { shape: 'wide', quantity: { kind: 'count' } }), descriptionInput(file, 'Samples')]);
    expect(ev(result, 'X03')).toHaveLength(1);
    expect(result.occurrences.filter((o) => o.eventId === 'X03')).toEqual([]);
    expect(rules(result.findings, 'CONV-JOIN-DESCRIPTION-ONLY')).toHaveLength(1);
    expect(rules(result.findings, 'CONV-SAMPLE-PER-ROW')).toEqual([]);
    expect(rules(result.findings, 'CONV-ROW-NOT-UNDERSTOOD')).toEqual([]);
  });

  it('a described sample with no results is an event with no occurrence, long (spec test 3)', () => {
    const { result } = converted(bookInputs());
    expect(ev(result, 'X03')).toHaveLength(1);
    expect(result.occurrences.filter((o) => o.eventId === 'X03')).toEqual([]);
    expect(rules(result.findings, 'CONV-JOIN-DESCRIPTION-ONLY')).toEqual([expect.objectContaining({ params: expect.objectContaining({ count: 1, samples: 'X03' }) })]);
    expect(rules(result.findings, 'CONV-SAMPLE-PER-ROW')).toEqual([]);
    expect(rules(result.findings, 'CONV-ROW-NOT-UNDERSTOOD')).toEqual([]);
  });

  it('events that only the description makes do not count as a sample split into rows', () => {
    // 30 samples with one taxon row each, every one at its own station and day, and two more samples that only the description has: 32 events against 30 occurrences must not read as one event per row
    const counts: Cell[][] = Array.from({ length: 30 }, (_, i) => [`S${String(i + 1).padStart(2, '0')}`, `Taxon ${i % 3}`, 1]);
    const samples: Cell[][] = Array.from({ length: 32 }, (_, i) => [`S${String(i + 1).padStart(2, '0')}`, `ST-${i + 1}`, `2021-05-${String(i + 1).padStart(2, '0')}`, 60 + i / 10, 4, 10]);
    const { result } = converted(bookOf(counts, samples));
    expect(result.occurrences).toHaveLength(30);
    expect(result.events.filter((e) => e.eventType === 'sample')).toHaveLength(32);
    expect(rules(result.findings, 'CONV-SAMPLE-PER-ROW')).toEqual([]);
  });

  it('a sample the results sheet has and the description does not, once "results only" is answered, is written from the results alone (spec test 4)', () => {
    const inputs = bookOf([...COUNTS_ROWS, ['X04', TAX, 2]], SAMPLES_ROWS);
    const { result } = converted(inputs, [{ ...JOIN, resultsOnly: 1 }]);
    const x04 = ev(result, 'X04') as { eventDate?: string }[];
    expect(x04).toHaveLength(1);
    expect(x04[0].eventDate).toBeUndefined();
    expect(result.occurrences.some((o) => o.eventId === 'X04')).toBe(true);
    expect(rules(result.findings, 'CONV-JOIN-RESULTS-ONLY')).toHaveLength(1);
    expect(rules(result.findings, 'CONV-JOIN-NO-DESCRIPTION')).toEqual([]);
  });

  it('a finding about a description cell names the description sheet, its header and its line, once (spec test 11)', () => {
    const samples = SAMPLES_ROWS.map((r) => (r[0] === 'X02' ? [r[0], r[1], '2021-13-45', r[3], r[4], r[5]] : r));
    const { result } = converted(bookOf(COUNTS_ROWS, samples));
    const dateFindings = result.findings.filter((f) => f.field === 'Date' && f.lines !== undefined);
    expect(dateFindings).toHaveLength(1);
    expect(dateFindings[0]).toMatchObject({ file: 'book.xlsx', sheet: 'Samples', field: 'Date', lines: [3] });
  });

  it('a bad cell lent to several results rows is one finding on one description line', () => {
    const samples = SAMPLES_ROWS.map((r) => (r[0] === 'X01' ? [r[0], r[1], '2021-13-45', r[3], r[4], r[5]] : r));
    const { result } = converted(bookOf(COUNTS_ROWS, samples));
    const dateFindings = result.findings.filter((f) => f.field === 'Date' && f.lines !== undefined);
    expect(dateFindings).toHaveLength(1);
    expect(dateFindings[0]).toMatchObject({ sheet: 'Samples', lines: [2] });
  });

  it('a finding about a results cell stays on the results sheet', () => {
    const counts = COUNTS_ROWS.map((r, i) => (i === 2 ? [r[0], r[1], 'many'] : r));
    const { result } = converted(bookOf(counts, SAMPLES_ROWS));
    const f = result.findings.find((x) => x.field === 'Count' && x.lines !== undefined);
    expect(f).toMatchObject({ sheet: 'Counts', lines: [4] });
  });
});

describe('a depth the merge wrote in metres (verbatimDepth)', () => {
  it('keeps the text its sheet wrote', () => {
    const file = xlsxFile('book.xlsx', {
      Counts: [['Sample', 'Taxon', 'Count', 'Depth [ft]'], ['X01', TAX, 1, 33], ['X02', TAX, 1, 33]],
      Samples: [['Sample', 'Depth [km]'], ['X01', 0.0100584], ['X02', 0.02]],
    });
    const answer = [{ group: 'depth', take: 'description' as const, count: 1, exceptions: [] }];
    const { result } = converted([resultsInput(file, 'Counts'), descriptionInput(file, 'Samples')], [{ ...JOIN, conflicts: answer }]);
    expect(result.findings.filter((f) => f.severity === 'error')).toEqual([]);
    const x01 = ev(result, 'X01')[0] as never as { depthMin: number; depthVerbatim: { min: string; max: string } };
    const x02 = ev(result, 'X02')[0] as never as { depthMin: number; depthVerbatim: { min: string; max: string } };
    expect([x01.depthMin, x01.depthVerbatim]).toEqual([10.0584, { min: '33 ft', max: '33 ft' }]);
    expect([x02.depthMin, x02.depthVerbatim]).toEqual([20, { min: '0.02 km', max: '0.02 km' }]);
  });
});

describe('the join\'s own findings are judged with the rest (F1)', () => {
  it('an unanswered conflict is in convert() findings and blocks (spec test 5)', () => {
    const inputs = bookOf([['X01', TAX, 5, '2021-05-02'], ['X02', TAX, 3, '2021-05-04']], SAMPLES_ROWS, [...COUNTS_HEADER, 'Date']);
    const { out, result } = converted(inputs);
    expect(rules(result.findings, 'CONV-JOIN-CONFLICT')).toHaveLength(1);
    expect(result.ok).toBe(false);
    expect(out.findings.every((f) => f.ruleId === 'CONV-JOIN-PROPOSED' || f.ruleId === 'CONV-JOIN-DESCRIPTION-LONG')).toBe(true);
    expect(out.conflicts).toEqual([expect.objectContaining({ group: 'date', results: 0 })]);
  });

  it('an ambiguous key is in convert() findings (spec test 9)', () => {
    const inputs = bookOf(COUNTS_ROWS, [...SAMPLES_ROWS, ['X01', 'ST-9', '2021-05-09', 62, 5, 40]]);
    const { out, result } = converted(inputs);
    expect(rules(result.findings, 'CONV-JOIN-AMBIGUOUS')).toHaveLength(1);
    expect(result.ok).toBe(false);
    expect(out.findings.every((f) => f.ruleId === 'CONV-JOIN-PROPOSED' || f.ruleId === 'CONV-JOIN-DESCRIPTION-LONG')).toBe(true);
  });
});

describe('one description for several results sheets (decision 6, F3)', () => {
  const file = xlsxFile('runs.xlsx', {
    Phyto: [COUNTS_HEADER, ['X01', TAX, 5], ['X02', TAX, 4]],
    Zoo: [COUNTS_HEADER, ['X05', 'Oithona similis', 2]],
    Samples: [SAMPLES_HEADER, ['X01', 'ST-1', '2021-05-03', 61.1, 4.2, 10], ['X02', 'ST-2', '2021-05-04', 61.3, 4.6, 20], ['X03', 'ST-3', '2021-05-05', 61.5, 4.9, 30], ['X05', 'ST-5', '2021-05-06', 61.7, 5.1, 50]],
  });
  const inputs = (): ConvertSheetInput[] => [resultsInput(file, 'Phyto'), resultsInput(file, 'Zoo'), descriptionInput(file, 'Samples')];
  const joins: SampleJoinRequestCore[] = [
    { results: 0, description: 2, keys: [{ results: 0, description: 0 }], conflicts: [] },
    { results: 1, description: 2, keys: [{ results: 0, description: 0 }], conflicts: [] },
  ];

  it('writes every sample once and does not convert the description on its own', () => {
    const { out, result } = converted(inputs(), joins);
    expect(out.sheets).toHaveLength(2);
    expect(out.origin).toEqual([0, 1]);
    expect(ev(result, 'X03')).toHaveLength(1);
    expect(ev(result, 'X05')).toHaveLength(1);
    expect(rules(result.findings, 'CONV-ID-DUPLICATE')).toEqual([]);
    const only = rules(result.findings, 'CONV-JOIN-DESCRIPTION-ONLY');
    expect(only).toHaveLength(1);
    expect(only[0].params).toMatchObject({ count: 1, samples: 'X03' });
    expect(result.events.filter((e) => e.eventType === 'sample').map((e) => e.id).sort()).toEqual(['X01', 'X02', 'X03', 'X05']);
  });

  it('a results sheet with a confirmed join gets no proposal for another sheet; a declined pair is skipped for that pair only', () => {
    const other = xlsxFile('runs.xlsx', { Counts: [COUNTS_HEADER, ...COUNTS_ROWS], Samples: [SAMPLES_HEADER, ...SAMPLES_ROWS], Notes: [['Sample', 'Remark'], ['X01', 'a'], ['X02', 'b']] });
    const three = (): ConvertSheetInput[] => [resultsInput(other, 'Counts'), descriptionInput(other, 'Samples'), descriptionInput(other, 'Notes')];
    expect(proposeSampleJoins(three(), []).map((p) => p.description)).toEqual([1]);
    const confirmed = joinInputs(three(), [JOIN], []);
    expect(confirmed.proposals).toEqual([]);
    expect(confirmed.findings).toEqual([]);
    const declined = joinInputs(three(), [], [{ results: 0, description: 1 }]);
    expect(declined.proposals.map((p) => [p.results, p.description])).toEqual([[0, 2]]);
    expect(declined.findings.map((f) => f.ruleId)).toEqual(['CONV-JOIN-PROPOSED']);
  });
});

describe('a key made of picked columns (Review Focus 4)', () => {
  it('a described sample gets the ID the key would make', () => {
    const file = xlsxFile('keyed.xlsx', {
      Counts: [['Station', 'Day', 'Taxon', 'Count'], ['ST-1', '2021-05-03', TAX, 4], ['ST-2', '2021-05-04', TAX, 6]],
      Samples: [['Station', 'Day', 'Latitude', 'Longitude'], ['ST-1', '2021-05-03', 61.1, 4.2], ['ST-2', '2021-05-04', 61.3, 4.6], ['ST-4', '2021-05-06', 61.9, 5.0]],
    });
    const key = { columns: [0, 1] };
    const res = { ...resultsInput(file, 'Counts', { sampleKey: key } as never) };
    const des = descriptionInput(file, 'Samples');
    const { result } = converted([res, des], [{ results: 0, description: 1, keys: [{ results: 0, description: 0 }, { results: 1, description: 1 }], conflicts: [] }]);
    const prefix = keyPrefixOf(key, 'xlsx', 'keyed.xlsx', 'Counts');
    const ids = result.events.filter((e) => e.eventType === 'sample').map((e) => e.id).sort();
    expect(ids).toEqual([`${prefix}|ST-1|2021-05-03`, `${prefix}|ST-2|2021-05-04`, `${prefix}|ST-4|2021-05-06`]);
    expect(rules(result.findings, 'CONV-ID-DUPLICATE')).toEqual([]);
  });
});

describe('joinInputs: the only validator (F8)', () => {
  const stays = (inputs: ConvertSheetInput[], join: SampleJoinRequestCore): ReturnType<typeof joinInputs> => {
    const out = joinInputs(inputs, [join], []);
    expect(out.sheets).toBe(inputs);
    expect(out.sheets.some((s) => s.sampleJoin !== undefined)).toBe(false);
    expect(out.origin).toEqual(inputs.map((_, i) => i));
    return out;
  };
  const proposedAgain = (out: ReturnType<typeof joinInputs>): void => {
    expect(out.proposals.map((p) => [p.results, p.description])).toEqual([[0, 1]]);
    expect(out.findings.map((f) => f.ruleId)).toEqual(['CONV-JOIN-PROPOSED']);
  };

  it('a key column re-roled to ignore after the person confirmed drops the join, and the proposal shows again', () => {
    const file = xlsxFile('book.xlsx', {
      Counts: [['Sample', 'Station', 'Taxon', 'Count'], ['X01', 'ST-1', TAX, 12], ['X02', 'ST-2', TAX, 7]],
      Samples: [['Sample', 'Station', 'Date'], ['X01', 'ST-1', '2021-05-03'], ['X02', 'ST-2', '2021-05-04']],
    });
    const inputs = [resultsInput(file, 'Counts', { edit: { Sample: { kind: 'ignore' }, Taxon: { kind: 'taxon' }, Count: { kind: 'quantity' } } } as never), descriptionInput(file, 'Samples')];
    proposedAgain(stays(inputs, JOIN));
  });
  it('a key index out of range, not a whole number, or a results sheet as the description drops the join', () => {
    for (const bad of [
      { ...JOIN, keys: [{ results: 99, description: 0 }] },
      { ...JOIN, keys: [{ results: 0, description: 99 }] },
      { ...JOIN, keys: [{ results: 1.5, description: 0 }] },
      { ...JOIN, keys: [{ results: 0, description: Number.NaN }] },
      { ...JOIN, keys: [] },
      { ...JOIN, description: 0 },
      { ...JOIN, description: 7 },
      { ...JOIN, results: -1 },
    ]) proposedAgain(stays(bookInputs(), bad));
  });
  it('a sheet used twice as results, a profile as results, a profile or pivoted description is not applied', () => {
    const inputs = bookInputs();
    const out = joinInputs(inputs, [JOIN, { ...JOIN, description: 1 }], []);
    expect(out.sheets).toHaveLength(1);
    expect(out.origin).toEqual([0]);
    const noTaxon = bookInputs();
    noTaxon[0] = { ...noTaxon[0], mapping: { ...noTaxon[0].mapping, columns: noTaxon[0].mapping.columns.map((c) => (c.role.kind === 'taxon' ? { ...c, role: { kind: 'ignore' } } : c)) as never } };
    expect(joinInputs(noTaxon, [JOIN], []).sheets).toBe(noTaxon);
  });
  it('a long description sheet is not applied and says so (F16)', () => {
    const inputs = bookInputs('long-samples');
    const confirmed = stays(inputs, JOIN);
    expect(confirmed.findings).toEqual([expect.objectContaining({ ruleId: 'CONV-JOIN-DESCRIPTION-LONG', file: 'book.xlsx', sheet: 'Counts', params: expect.objectContaining({ description: 'Samples' }) })]);
    expect(rules(confirmed.findings, 'CONV-JOIN-PROPOSED')).toEqual([]);
    const unconfirmed = joinInputs(inputs, [], []);
    expect(unconfirmed.proposals[0].long).toBe(true);
    expect(unconfirmed.findings.map((f) => f.ruleId)).toEqual(['CONV-JOIN-DESCRIPTION-LONG']);
    // converting what joinInputs handed back needs no join at all
    expect(convert({ sheets: confirmed.sheets }).findings.some((f) => f.ruleId.startsWith('CONV-JOIN'))).toBe(false);
  });
});

describe('inputs without a confirmed join convert as they did (C3)', () => {
  it('no join: the input array itself, one proposal finding, origin per sheet', () => {
    const inputs = bookInputs();
    const out = joinInputs(inputs, [], []);
    expect(out.sheets).toBe(inputs);
    expect(out.sheets.some((s) => s.sampleJoin !== undefined)).toBe(false);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({ ruleId: 'CONV-JOIN-PROPOSED', severity: 'info', file: 'book.xlsx', sheet: 'Counts', params: { description: 'Samples', covered: 2, samples: 2 } });
    expect(out.origin).toEqual([0, 1]);
    const alone = joinInputs([inputs[0]], [], []);
    expect(alone.sheets).toEqual([inputs[0]]);
    expect(alone.findings).toEqual([]);
    expect(alone.proposals).toEqual([]);
  });
  it('converts the sheets of an unconfirmed workbook exactly as before', () => {
    const inputs = bookInputs();
    const before = convert({ sheets: inputs });
    const after = convert({ sheets: joinInputs(inputs, [], []).sheets });
    expect(after.events).toEqual(before.events);
    expect(after.occurrences).toEqual(before.occurrences);
    expect(after.findings).toEqual(before.findings);
  });
});

describe('a results sheet whose header is shorter than its rows (unnamedFrom)', () => {
  it('keeps the roles of the columns appended after the unnamed ones', () => {
    const results = textFile('counts.csv', 'Sample,Taxon,Count\nX01,Calanus finmarchicus,12,4.5\nX01,Oithona similis,3,4.5\nX02,Calanus finmarchicus,7,5.5\nX02,Oithona similis,1,5.5\nX03,Calanus finmarchicus,2,6.5\n');
    const samples = textFile('samples.csv', 'Sample,Station,Date,Temp [C],Remark\nX01,ST-1,2021-05-03,8.5,calm\nX02,ST-2,2021-05-04,9.5,rough\nX03,ST-3,2021-05-05,9.9,calm\n');
    expect(results.sheets[0].unnamedFrom).toBe(3);
    const res = sheetInput(results, { shape: 'long', quantity: { kind: 'count' }, edit: { Taxon: { kind: 'taxon' }, Count: { kind: 'quantity' } } } as never);
    const { out, result } = converted([res, sheetInput(samples)]);
    expect(out.sheets).toHaveLength(1);
    expect((ev(result, 'X01')[0] as { eventDate?: string }).eventDate).toBe('2021-05-03');
    expect(result.events.some((e) => e.id === 'ST-1')).toBe(true);
    expect(result.measurements.some((m) => m.target.id === 'X01' && m.measurementType.toLowerCase().includes('temp'))).toBe(true);
    // a column of the description sheet that holds data and is not read is named like any other; it is not one of the columns the header failed to name
    expect(rules(result.findings, 'CONV-COLUMN-IGNORED').some((f) => String(f.params.columns).includes('Remark'))).toBe(true);
    // only the column the header does not name is said to be unnamed
    const unnamed = rules(result.findings, 'CONV-COLUMN-UNNAMED');
    expect(unnamed.every((f) => f.field === 'Column 4')).toBe(true);
  });
});
