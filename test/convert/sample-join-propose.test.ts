// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// proposeSampleJoins: which sheet describes the samples of a results sheet, and by which key. A proposal only; invented data.
import { describe, expect, it } from 'vitest';
import { proposeSampleJoins } from '../../src/core/convert/sampleJoin';
import { dateCell, textFile, xlsxFile } from '../helpers/files';
import { sheetInput } from './helpers';
import { bookInputs, descriptionInput, resultsCsvFile, resultsInput, samplesCsvFile } from './joinFixtures';

const TAX: (string | number)[] = ['Calanus finmarchicus', 3];

describe('proposeSampleJoins', () => {
  it('book.xlsx: Counts is described by Samples on the sample code', () => {
    expect(proposeSampleJoins(bookInputs(), [])).toEqual([{ results: 0, description: 1, keys: [{ results: 0, description: 0 }], covered: 2, samples: 2, unique: true, long: false }]);
  });

  it('two files give the same proposal with the indexes of the inputs', () => {
    const inputs = [resultsInput(resultsCsvFile(), resultsCsvFile().sheets[0].name), descriptionInput(samplesCsvFile(), samplesCsvFile().sheets[0].name)];
    expect(proposeSampleJoins(inputs, [])).toEqual([{ results: 0, description: 1, keys: [{ results: 0, description: 0 }], covered: 2, samples: 2, unique: true, long: false }]);
  });

  it('one description serves two results sheets', () => {
    const file = xlsxFile('b.xlsx', {
      Phyto: [['Sample', 'Taxon', 'Count'], ['X01', ...TAX], ['X02', ...TAX]],
      Zoo: [['Sample', 'Taxon', 'Count'], ['X05', ...TAX], ['X06', ...TAX]],
      Samples: [['Sample', 'Station'], ...['X01', 'X02', 'X03', 'X04', 'X05', 'X06'].map((x, i) => [x, `ST-${i + 1}`])],
    });
    const got = proposeSampleJoins([resultsInput(file, 'Phyto'), resultsInput(file, 'Zoo'), descriptionInput(file, 'Samples')], []);
    expect(got.map((p) => [p.results, p.description])).toEqual([[0, 2], [1, 2]]);
  });

  it('the earlier column wins when Sample and Station are equally good keys', () => {
    const file = xlsxFile('b.xlsx', {
      Counts: [['Sample', 'Station', 'Taxon', 'Count'], ['X01', 'ST-1', ...TAX], ['X02', 'ST-2', ...TAX], ['X03', 'ST-3', ...TAX]],
      Samples: [['Sample', 'Station'], ['X01', 'ST-1'], ['X02', 'ST-2'], ['X03', 'ST-3']],
    });
    const got = proposeSampleJoins([resultsInput(file, 'Counts'), descriptionInput(file, 'Samples')], []);
    expect(got).toHaveLength(1);
    expect(got[0].keys).toEqual([{ results: 0, description: 0 }]);
  });

  it('Station repeats in two cruises: Cruise and Station together are the key', () => {
    const file = xlsxFile('b.xlsx', {
      Counts: [['Cruise', 'Station', 'Taxon', 'Count'], ['C1', 'ST-1', ...TAX], ['C2', 'ST-1', ...TAX], ['C2', 'ST-2', ...TAX]],
      Samples: [['Cruise', 'Station', 'Date'], ['C1', 'ST-1', '2021-05-03'], ['C2', 'ST-1', '2021-06-03'], ['C2', 'ST-2', '2021-06-04']],
    });
    const got = proposeSampleJoins([resultsInput(file, 'Counts'), descriptionInput(file, 'Samples')], []);
    expect(got).toHaveLength(1);
    expect(got[0].keys).toEqual([{ results: 0, description: 0 }, { results: 1, description: 1 }]);
    expect(got[0].unique).toBe(true);
  });

  it('a picked key (Station + Date) pairs both parts', () => {
    const file = xlsxFile('b.xlsx', {
      Counts: [['Station', 'Date', 'Taxon', 'Count'], ['ST-1', '2021-05-03', ...TAX], ['ST-1', '2021-05-04', ...TAX], ['ST-2', '2021-05-03', ...TAX]],
      Samples: [['Station', 'Date', 'Depth'], ['ST-1', '2021-05-03', 10], ['ST-1', '2021-05-04', 12], ['ST-2', '2021-05-03', 20]],
    });
    const got = proposeSampleJoins([resultsInput(file, 'Counts', { sampleKey: { columns: [0, 1] } }), descriptionInput(file, 'Samples')], []);
    expect(got).toHaveLength(1);
    expect(got[0].keys).toEqual([{ results: 0, description: 0 }, { results: 1, description: 1 }]);
  });

  const picked = (counts: (string | number)[][], samples: (string | number)[][]) => {
    const file = xlsxFile('b.xlsx', { Counts: [['Station', 'Date', 'Taxon', 'Count'], ...counts], Samples: [samples[0], ...samples.slice(1)] });
    return proposeSampleJoins([resultsInput(file, 'Counts', { sampleKey: { columns: [0, 1] } }), descriptionInput(file, 'Samples')], []);
  };
  const BOTH = [{ results: 0, description: 0 }, { results: 1, description: 1 }];

  it('a picked key, one station per day (Date is unique alone): both parts are measured together, 3 of 3', () => {
    const got = picked(
      [['ST-1', '2021-05-03', ...TAX], ['ST-2', '2021-05-04', ...TAX], ['ST-3', '2021-05-05', ...TAX]],
      [['Station', 'Date', 'Depth'], ['ST-1', '2021-05-03', 10], ['ST-2', '2021-05-04', 12], ['ST-3', '2021-05-05', 20]],
    );
    expect(got).toEqual([expect.objectContaining({ keys: BOTH, covered: 3, samples: 3, unique: true })]);
  });

  it('a picked key where Date alone would cover more: still Station + Date, 2 of 3, never Date alone', () => {
    const got = picked(
      [['ST-1', '2021-05-03', ...TAX], ['ST-1', '2021-05-04', ...TAX], ['ST-2', '2021-05-05', ...TAX]],
      [['Station', 'Date', 'Depth'], ['ST-1', '2021-05-03', 10], ['ST-1', '2021-05-04', 12], ['ST-1', '2021-05-05', 20]],
    );
    expect(got).toEqual([expect.objectContaining({ keys: BOTH, covered: 2, samples: 3 })]);
  });

  it('a picked key whose date column the description sheet lacks: no proposal', () => {
    const got = picked(
      [['ST-1', '2021-05-03', ...TAX], ['ST-2', '2021-05-04', ...TAX]],
      [['Station', 'Depth'], ['ST-1', 10], ['ST-2', 20]],
    );
    expect(got).toEqual([]);
  });

  it('a picked key whose own role is ignore is still a key column: paired by the same header, no role guessed from values', () => {
    const file = xlsxFile('b.xlsx', {
      Counts: [['Code', 'Taxon', 'Count'], ['X01', ...TAX], ['X02', ...TAX]],
      Samples: [['Code', 'Station'], ['X01', 'ST-1'], ['X02', 'ST-2'], ['X03', 'ST-3']],
    });
    const edit = { Code: { kind: 'ignore' }, Taxon: { kind: 'taxon' }, Count: { kind: 'quantity' } };
    const res = resultsInput(file, 'Counts', { sampleKey: { columns: [0] }, edit } as never);
    const desc = descriptionInput(file, 'Samples', { edit: { Code: { kind: 'ignore' } } } as never);
    expect(proposeSampleJoins([res, desc], [])).toEqual([expect.objectContaining({ keys: [{ results: 0, description: 0 }], covered: 2, samples: 2 })]);
  });

  it('a description read through its pivot is shown as long', () => {
    expect(proposeSampleJoins(bookInputs('long-samples'), [])).toEqual([expect.objectContaining({ results: 0, description: 1, long: true })]);
  });

  it('no results sheet, a skipped pair, or too few shared samples: no proposal', () => {
    const [counts, samples] = bookInputs();
    expect(proposeSampleJoins([samples], [])).toEqual([]);
    expect(proposeSampleJoins([counts, samples], [{ results: 0, description: 1 }])).toEqual([]);
    const file = xlsxFile('b.xlsx', {
      Counts: [['Sample', 'Taxon', 'Count'], ['X01', ...TAX], ['X02', ...TAX], ['X03', ...TAX], ['X04', ...TAX]],
      Samples: [['Sample', 'Station'], ['X01', 'ST-1'], ['Y02', 'ST-2'], ['Y03', 'ST-3'], ['Y04', 'ST-4']],
    });
    expect(proposeSampleJoins([resultsInput(file, 'Counts'), descriptionInput(file, 'Samples')], [])).toEqual([]);
  });

  it('proposes on the key as the converter reads it: a text date in the results and a date serial in the description are one key', () => {
    const results = textFile('counts.csv', `Station,Day,Taxon,Count\nST-1,2021-05-03,${TAX[0]},4\nST-2,2021-05-04,${TAX[0]},5\n`);
    const samples = xlsxFile('samples.xlsx', { Samples: [['Station', 'Day', 'Latitude'], ['ST-1', dateCell(44319), 61.1], ['ST-2', dateCell(44320), 61.3], ['ST-4', dateCell(44322), 61.9]] });
    const res = sheetInput(results, { shape: 'long', quantity: { kind: 'count' }, sampleKey: { columns: [0, 1] }, edit: { Taxon: { kind: 'taxon' }, Count: { kind: 'quantity' } } } as never);
    const got = proposeSampleJoins([res, sheetInput(samples)], []);
    expect(got).toEqual([expect.objectContaining({ results: 0, description: 1, keys: [{ results: 0, description: 0 }, { results: 1, description: 1 }], covered: 2, samples: 2 })]);
  });

  it('proposes when the codes are written as 1.0 in one sheet and 1 in the other', () => {
    const file = xlsxFile('b.xlsx', {
      Counts: [['Sample', 'Taxon', 'Count'], [1, ...TAX], [2, ...TAX]],
      Samples: [['Sample', 'Station'], ['1.0', 'ST-1'], ['2.0', 'ST-2'], ['3.0', 'ST-3']],
    });
    expect(proposeSampleJoins([resultsInput(file, 'Counts'), descriptionInput(file, 'Samples')], [])).toEqual([expect.objectContaining({ covered: 2, samples: 2 })]);
  });

  it('does not change the sheets it was handed', () => {
    const inputs = bookInputs();
    const before = JSON.stringify(inputs.map((i) => i.file.sheets));
    proposeSampleJoins(inputs, []);
    expect(JSON.stringify(inputs.map((i) => i.file.sheets))).toBe(before);
  });
});
