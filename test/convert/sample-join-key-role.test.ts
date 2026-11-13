// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Round 3, Task 3: a confirmed join that is dropped because a results key column lost its key role is named (CONV-JOIN-KEY-ROLE-LOST); a join dropped for any other reason stays as silent as before. Invented data.
import { describe, expect, it } from 'vitest';
import { joinInputs } from '../../src/core/convert/sampleJoin';
import type { SampleJoinRequestCore } from '../../src/core/convert/sampleJoin';
import { xlsxFile } from '../helpers/files';
import { descriptionInput, resultsInput } from './joinFixtures';

const TAX = 'Calanus finmarchicus';
const JOIN: SampleJoinRequestCore = { results: 0, description: 1, keys: [{ results: 0, description: 0 }], conflicts: [] };
const file = xlsxFile('book.xlsx', {
  Counts: [['Station', 'Taxon', 'Count'], ['ST-1', TAX, 12], ['ST-2', TAX, 7]],
  Samples: [['Station', 'Date', 'Latitude', 'Longitude'], ['ST-1', '2021-05-03', 61.1, 4.2], ['ST-2', '2021-05-04', 61.3, 4.6]],
});
const inputs = (stationRole?: 'ignore') =>
  [
    resultsInput(file, 'Counts', stationRole === undefined ? {} : ({ edit: { Station: { kind: 'ignore' }, Taxon: { kind: 'taxon' }, Count: { kind: 'quantity' } } } as never)),
    descriptionInput(file, 'Samples'),
  ];

describe('a confirmed join whose results key column lost its key role', () => {
  it('is named by CONV-JOIN-KEY-ROLE-LOST and not applied', () => {
    const before = joinInputs(inputs(), [JOIN], []);
    expect(before.sheets).toHaveLength(1);
    expect(before.findings.filter((f) => f.ruleId === 'CONV-JOIN-KEY-ROLE-LOST')).toEqual([]);
    const ins = inputs('ignore');
    const out = joinInputs(ins, [JOIN], []);
    const lost = out.findings.filter((f) => f.ruleId === 'CONV-JOIN-KEY-ROLE-LOST');
    expect(lost).toHaveLength(1);
    expect(lost[0]).toMatchObject({ file: 'book.xlsx', sheet: 'Counts', params: { description: 'Samples', column: 'Station' } });
    expect(out.sheets).toBe(ins);
    expect(out.proposals.length).toBe(joinInputs(ins, [], []).proposals.length);
  });

  it('a key index out of range is still dropped without a finding', () => {
    const out = joinInputs(inputs(), [{ ...JOIN, keys: [{ results: 99, description: 0 }] }], []);
    expect(out.findings.filter((f) => f.ruleId === 'CONV-JOIN-KEY-ROLE-LOST')).toEqual([]);
    expect(out.sheets).toHaveLength(2);
  });
});
