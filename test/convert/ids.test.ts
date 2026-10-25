// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// IDs (plan 2.8, Q1): the user's codes, duplicates, the station prefix, tabs, a missing code and the one-time code proposal.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { proposeSampleCodes } from '../../src/core/convert/ids';
import { guardText } from '../../src/core/output/csv';
import type { Finding } from '../../src/core/types';
import { textFile } from '../helpers/files';
import { fileOf, mappingOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const find = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id);
const HEADER = ['Cruise', 'Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Oithona similis'];
const wide = (rows: Cell[][], extra: Parameters<typeof sheetInput>[1] = {}, header = HEADER) => sheetInput(fileOf(header, rows), { quantity: { kind: 'count' }, ...extra });

describe('IDs are the user codes', () => {
  it('a sample eventID is the code, a station is cruise:station, a cruise is the cruise code, an occurrence is sample:header', () => {
    const r = convert({ sheets: [wide([['CR', 'S1', 'x-1', 1, 2, '2020-01-01', 4, 5]])] });
    expect(r.events.map((e) => e.id)).toEqual(['CR', 'CR:S1', 'x-1']);
    expect(r.occurrences.map((o) => o.id)).toEqual(['x-1:Calanus finmarchicus', 'x-1:Oithona similis']);
  });

  it('never from depth or row order: reordering the rows or changing the depth leaves every ID', () => {
    const header = [...HEADER, 'Depth'];
    const a = convert({ sheets: [wide([['CR', 'S1', 'p', 1, 2, '2020-01-01', 4, 5, 10], ['CR', 'S1', 'q', 1, 2, '2020-01-01', 1, 2, 20]], {}, header)] });
    const b = convert({ sheets: [wide([['CR', 'S1', 'q', 1, 2, '2020-01-01', 1, 2, 99], ['CR', 'S1', 'p', 1, 2, '2020-01-01', 4, 5, 98]], {}, header)] });
    expect([...a.occurrences.map((o) => o.id)].sort()).toEqual([...b.occurrences.map((o) => o.id)].sort());
    expect([...a.events.map((e) => e.id)].sort()).toEqual([...b.events.map((e) => e.id)].sort());
  });

  it('the cruise comes from a declaration field when the sheet has no cruise column', () => {
    const header = HEADER.filter((h) => h !== 'Cruise');
    const r = convert({ sheets: [wide([['S1', 'x-1', 1, 2, '2020-01-01', 4, 5]], { cruise: 'DECL1' }, header)] });
    expect(r.events.map((e) => [e.id, e.parentId])).toEqual([['DECL1', undefined], ['DECL1:S1', 'DECL1'], ['x-1', 'DECL1:S1']]);
  });
});

describe('duplicates', () => {
  it('two rows with the same sample code of a wide sheet block, naming both rows; the second row is not converted', () => {
    const r = convert({ sheets: [wide([['CR', 'S1', 'dup', 1, 2, '2020-01-01', 4, 5], ['CR', 'S2', 'dup', 1, 2, '2020-01-01', 6, 7]])] });
    const d = find(r.blocking, 'CONV-ID-DUPLICATE');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ severity: 'error', value: 'dup', lines: [2, 3], sheet: 'S', file: 'sheet.csv', params: { kind: 'event' } });
    expect(r.ok).toBe(false);
    expect(r.occurrences).toHaveLength(2);
  });

  it('two columns with the same header give the same occurrenceID and block, naming the column and the rows', () => {
    const r = convert({ sheets: [wide([['CR', 'S1', 'a', 1, 2, '2020-01-01', 4, 5, 6]], {}, [...HEADER, 'Oithona similis'])] });
    const d = find(r.blocking, 'CONV-ID-DUPLICATE');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ value: 'a:Oithona similis', params: { kind: 'occurrence', count: 1 } });
    // the same ID twice is not also reported as "the same taxon in two columns"
    expect(find(r.findings, 'CONV-TAXON-SAME-EVENT')).toEqual([]);
  });

  it('the same sample code at two stations blocks; the station prefix toggle makes them unique', () => {
    const rows: Cell[][] = [['CR', 'S1', 'k1', 1, 2, '2020-01-01', 4, 5], ['CR', 'S2', 'k1', 1, 2, '2020-01-01', 6, 7]];
    const off = convert({ sheets: [wide(rows)] });
    expect(find(off.blocking, 'CONV-ID-DUPLICATE')).toHaveLength(1);
    const on = convert({ sheets: [wide(rows)], options: { prefixStation: true } });
    expect(on.blocking).toEqual([]);
    expect(on.events.filter((e) => e.eventType === 'sample').map((e) => e.id)).toEqual(['CR:S1:k1', 'CR:S2:k1']);
    expect(on.occurrences.map((o) => o.id)).toEqual(['CR:S1:k1:Calanus finmarchicus', 'CR:S1:k1:Oithona similis', 'CR:S2:k1:Calanus finmarchicus', 'CR:S2:k1:Oithona similis']);
    expect(on.events.find((e) => e.id === 'CR:S1:k1')!.code).toBe('k1');
  });

  it('the prefix without a station leaves the code alone', () => {
    const header = ['Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Oithona similis'];
    const r = convert({ sheets: [wide([['solo', 1, 2, '2020-01-01', 4, 5]], {}, header)], options: { prefixStation: true } });
    expect(r.events.map((e) => e.id)).toEqual(['solo']);
  });

  it('a sample code equal to a station eventID is the same eventID twice and blocks', () => {
    const r = convert({ sheets: [wide([['', 'S1', 'S1', 1, 2, '2020-01-01', 4, 5]])] });
    expect(find(r.blocking, 'CONV-ID-DUPLICATE').map((f) => f.value)).toEqual(['S1']);
  });

  it('the same eventID in two sheets of the archive blocks', () => {
    const a = wide([['CR', 'S1', 'same', 1, 2, '2020-01-01', 4, 5]]);
    const b = wide([['CR', 'S1', 'same', 1, 2, '2020-01-01', 6, 7]], {}, HEADER);
    expect(find(convert({ sheets: [a, b] }).blocking, 'CONV-ID-DUPLICATE')).toHaveLength(1);
  });
});

describe('tab or newline in a value', () => {
  it('blocks, naming the column and the rows, in a sample code, a station and a taxon header', () => {
    const header = ['Cruise', 'Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'Calanus\tfinmarchicus', 'Oithona similis'];
    const r = convert({ sheets: [wide([['CR', 'S\n1', 'a\tb', 1, 2, '2020-01-01', 4, 5]], {}, header)] });
    const t = find(r.blocking, 'CONV-TAB-IN-VALUE');
    expect(t.map((f) => [f.field, f.lines, f.value]).sort()).toEqual([
      ['Calanus\tfinmarchicus', [1], 'Calanus finmarchicus'],
      ['Sample', [2], 'a b'],
      ['Station', [2], 'S 1'],
    ]);
    expect(r.ok).toBe(false);
  });

  it('a tab in a long sheet taxon cell blocks too, and a clean sheet raises none', () => {
    const f = fileOf(['Sample', 'Species', 'Count'], [['a', 'Calanus\nfinmarchicus', 3]]);
    expect(find(convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' } })] }).blocking, 'CONV-TAB-IN-VALUE')).toHaveLength(1);
    const ok = fileOf(['Sample', 'Species', 'Count'], [['a', 'Calanus finmarchicus', 3]]);
    expect(find(convert({ sheets: [sheetInput(ok, { quantity: { kind: 'count' } })] }).findings, 'CONV-TAB-IN-VALUE')).toEqual([]);
  });
});

describe('a missing sample code', () => {
  it('blocks, naming the rows without one; those rows are not converted', () => {
    const r = convert({ sheets: [wide([['CR', 'S1', 'ok-1', 1, 2, '2020-01-01', 4, 5], ['CR', 'S1', '', 1, 2, '2020-01-01', 6, 7], ['CR', 'S1', null, 1, 2, '2020-01-01', 8, 9]])] });
    const m = find(r.blocking, 'CONV-SAMPLE-CODE-MISSING');
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ lines: [3, 4], params: { count: 2, column: 'Sample' } });
    expect(r.events.filter((e) => e.eventType === 'sample').map((e) => e.id)).toEqual(['ok-1']);
  });

  it('a sheet with no sample code column at all blocks every row, and names the missing column', () => {
    const header = HEADER.filter((h) => h !== 'Sample');
    const r = convert({ sheets: [wide([['CR', 'S1', 1, 2, '2020-01-01', 4, 5], ['CR', 'S1', 1, 2, '2020-01-01', 6, 7]], {}, header)] });
    const m = find(r.blocking, 'CONV-SAMPLE-CODE-MISSING');
    expect(m[0]).toMatchObject({ lines: [2, 3], params: { count: 2, column: 'none' } });
  });

  it('a Total row is a summary, not a sample', () => {
    const r = convert({ sheets: [wide([['CR', 'S1', 'a', 1, 2, '2020-01-01', 4, 5], ['', '', 'Total', null, null, null, 4, 5]])] });
    expect(r.events.filter((e) => e.eventType === 'sample').map((e) => e.id)).toEqual(['a']);
    const s = find(r.findings, 'CONV-SUMMARY-ROW-SKIPPED');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ severity: 'info', lines: [3], value: 'Total' });
  });
});

describe('summary rows are matched conservatively', () => {
  it('a station really named "Total Bay" (or a sample "Total-1") is NOT skipped', () => {
    const r = convert({ sheets: [wide([['CR', 'Total Bay', 'a', 1, 2, '2020-01-01', 4, 5], ['CR', 'Total Bay', 'Total-1', 1, 2, '2020-01-01', 6, 7]])] });
    expect(r.events.filter((e) => e.eventType === 'sample').map((e) => e.id)).toEqual(['a', 'Total-1']);
    expect(find(r.findings, 'CONV-SUMMARY-ROW-SKIPPED')).toEqual([]);
  });

  it('only the exact words, as the whole sample or station cell, in any case; every skipped row is reported', () => {
    const rows: Cell[][] = [['CR', 'S1', 'a', 1, 2, '2020-01-01', 4, 5]];
    for (const w of ['Total', 'SUMA', 'razem', 'Summe', 'Gesamt', 'Somme']) rows.push(['CR', '', w, null, null, null, 1, 1]);
    rows.push(['CR', 'Summe', 'x', null, null, null, 1, 1]);
    rows.push(['CR', 'Mean', 'mean', null, null, null, 1, 1]);
    const r = convert({ sheets: [wide(rows)] });
    const s = find(r.findings, 'CONV-SUMMARY-ROW-SKIPPED');
    expect(s).toHaveLength(1);
    expect(s[0].lines).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(s[0].params.count).toBe(7);
    // "Mean" / "mean" are no longer treated as summaries: they stay samples
    expect(r.events.filter((e) => e.eventType === 'sample').map((e) => e.id)).toEqual(['a', 'mean']);
  });
});

describe('Q1: the one-time sample code proposal', () => {
  const header = ['Station', 'Latitude', 'Longitude', 'Calanus finmarchicus'];
  const rows: Cell[][] = [['S1', 1, 2, 4], ['S1', 1, 2, 5], ['S2', 3, 4, 6], [' S1 ', 1, 2, 7], [null, null, null, null]];
  const file = fileOf(header, rows);
  const mapping = mappingOf(file);

  it('proposes <station>-<n> in sheet order, per station, unique, and leaves an empty row empty', () => {
    const p = proposeSampleCodes(file, file.sheets[0], mapping)!;
    expect(p.codes).toEqual(['S1-1', 'S1-2', 'S2-1', 'S1-3', '']);
    expect(new Set(p.codes.filter(Boolean)).size).toBe(4);
    expect(p.header).toBe('sample_code');
  });

  it('is deterministic', () => {
    expect(proposeSampleCodes(file, file.sheets[0], mapping)).toEqual(proposeSampleCodes(file, file.sheets[0], mapping));
  });

  it('returns the user sheet as CSV with the code column LAST and the original cells untouched', () => {
    const p = proposeSampleCodes(file, file.sheets[0], mapping)!;
    const lines = p.csv.split('\n');
    expect(lines[0]).toBe('Station,Latitude,Longitude,Calanus finmarchicus,sample_code');
    expect(lines[1]).toBe('S1,1,2,4,S1-1');
    expect(lines[4]).toBe(' S1 ,1,2,7,S1-3'); // the cell keeps its spaces; only the code is cleaned
    expect(lines[5]).toBe(',,,,');
    expect(p.csv.endsWith('\n')).toBe(true);
  });

  it('guards only a cell that starts with = or @ (or a tab / CR); a plus, a minus and a presence mark are ordinary values', () => {
    const f = fileOf(['=Station', 'Lat'], [['=cmd|x', 1], ['@sum', 2], ['+', 3], ['-5', 4], ['\tx', 5]]);
    const m = { sheet: 'S', columns: [{ index: 0, header: '=Station', role: { kind: 'station' as const } }] };
    const p = proposeSampleCodes(f, f.sheets[0], m)!;
    expect(p.csv.split('\n')).toEqual(["'=Station,Lat,sample_code", "'=cmd|x,1,'=cmd|x-1", "'@sum,2,'@sum-1", '+,3,+-1', '-5,4,-5-1', "'\tx,5,x-1", '']);
    expect(guardText('=cmd|x')).toBe("'=cmd|x");
    expect(p.codes).toEqual(['=cmd|x-1', '@sum-1', '+-1', '-5-1', 'x-1']);
  });

  it('names the new column so it cannot clash with an existing header', () => {
    const f = fileOf(['sample_code', 'Station'], [['x', 'A']]);
    const p = proposeSampleCodes(f, f.sheets[0], { sheet: 'S', columns: [{ index: 1, header: 'Station', role: { kind: 'station' } }] })!;
    expect(p.header).toBe('sample_code_2');
  });

  it('does not touch a sheet that already has a sample code column', () => {
    const f = fileOf(['Sample', 'Station'], [['x', 'A']]);
    expect(proposeSampleCodes(f, f.sheets[0], mappingOf(f))).toBeUndefined();
  });

  it('a sheet without a station column gets sample-<n>', () => {
    const f = fileOf(['Latitude', 'Longitude'], [[1, 2], [3, 4]]);
    expect(proposeSampleCodes(f, f.sheets[0], mappingOf(f))!.codes).toEqual(['sample-1', 'sample-2']);
  });

  it('the proposed sheet, uploaded again, gives IDs from the user code (nothing is regenerated)', () => {
    const p = proposeSampleCodes(file, file.sheets[0], mapping)!;
    const again = textFile('with-codes.csv', p.csv);
    const input = sheetInput(again, { quantity: { kind: 'count' }, edit: { sample_code: { kind: 'sampleId' }, 'Calanus finmarchicus': { kind: 'taxon', header: true } } });
    const r = convert({ sheets: [input] });
    expect(r.events.filter((e) => e.eventType === 'sample').map((e) => e.id)).toEqual(['S1-1', 'S1-2', 'S2-1', 'S1-3']);
    expect(r.occurrences.map((o) => o.id)).toEqual(['S1-1:Calanus finmarchicus', 'S1-2:Calanus finmarchicus', 'S2-1:Calanus finmarchicus', 'S1-3:Calanus finmarchicus']);
  });
});

describe('duplicates across files are reported at every place (M4)', () => {
  it('an eventID repeated in two files: one finding per file, each with its own sheet and lines', () => {
    const a = wide([['CR', 'S1', 'same', 1, 2, '2020-01-01', 4, 5], ['CR', 'S1', 'ok-a', 1, 2, '2020-01-01', 4, 5]], {}, HEADER);
    const b = wide([['CR', 'S1', 'ok-b', 1, 2, '2020-01-01', 6, 7], ['CR', 'S1', 'x', 1, 2, '2020-01-01', 6, 7], ['CR', 'S1', 'same', 1, 2, '2020-01-01', 6, 7]], {}, HEADER);
    a.file = { ...a.file, fileName: 'first.csv' };
    b.file = { ...b.file, fileName: 'second.csv' };
    const d = find(convert({ sheets: [a, b] }).blocking, 'CONV-ID-DUPLICATE').filter((f) => f.params.kind === 'event');
    expect(d.map((f) => [f.file, f.sheet, f.value, f.lines])).toEqual([
      ['first.csv', 'S', 'same', [2]],
      ['second.csv', 'S', 'same', [4]],
    ]);
  });

  it('an occurrenceID repeated in two files is reported in both, with the lines of each', () => {
    const header = ['occurrenceID', 'eventID', 'scientificName', 'individualCount'];
    const mk = (name: string, rows: Cell[][]) => sheetInput(fileOf(header, rows, 'S', { fileName: name }), { quantity: { kind: 'count' } });
    const r = convert({ sheets: [mk('one.csv', [['o1', 'e1', 'Calanus finmarchicus', 1], ['o2', 'e1', 'Oithona similis', 2]]), mk('two.csv', [['o3', 'e2', 'Calanus finmarchicus', 3], ['o2', 'e2', 'Oithona similis', 4]])] });
    const d = find(r.blocking, 'CONV-ID-DUPLICATE').filter((f) => f.params.kind === 'occurrence');
    expect(d.map((f) => [f.file, f.value, f.lines])).toEqual([
      ['one.csv', 'o2', [3]],
      ['two.csv', 'o2', [3]],
    ]);
  });

  it('with several repeated IDs in one sheet, one finding lists the count and every line', () => {
    const header = ['occurrenceID', 'eventID', 'scientificName', 'individualCount'];
    const s = sheetInput(fileOf(header, [['o1', 'e1', 'Calanus finmarchicus', 1], ['o1', 'e1', 'Oithona similis', 2], ['o2', 'e1', 'Acartia longiremis', 3], ['o2', 'e1', 'Metridia longa', 4]]), { quantity: { kind: 'count' } });
    const d = find(convert({ sheets: [s] }).blocking, 'CONV-ID-DUPLICATE');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ lines: [2, 3, 4, 5], params: { count: 2 } });
  });
});
