// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The core of "data tables only (no description)": the judge, the name, the dropped form columns. Invented values.
import { describe, expect, it } from 'vitest';
import { DESCRIPTION_RULES, tablesOnlyJudge, tablesZipName, withoutDescription, withoutEmptyFormColumns } from '../../src/core/convert/tablesOnly';
import { EMPTY_METADATA } from '../../src/core/convert/metadata';
import type { Finding } from '../../src/core/types';

const f = (ruleId: string, severity: Finding['severity'] = 'error'): Finding => ({ ruleId, severity, message: ruleId } as unknown as Finding);

describe('tablesOnlyJudge', () => {
  it('ignores the description rules and keeps every data rule', () => {
    const view = [f('CONV-EML-MISSING'), f('CONV-LICENCE-UNSET'), f('CONV-LICENCE-DIFFERS'), f('CONV-SOME-DATA-ERROR')];
    expect(withoutDescription(view).map((x) => x.ruleId)).toEqual(['CONV-SOME-DATA-ERROR']);
    expect(DESCRIPTION_RULES.size).toBe(3);
    const j = tablesOnlyJudge(view, { ...EMPTY_METADATA, basisOfRecord: 'HumanObservation' });
    expect(j.blocking.map((x) => x.ruleId)).toEqual(['CONV-SOME-DATA-ERROR']);
  });
  it('an empty description blocks nothing; only basisOfRecord is still asked', () => {
    expect(tablesOnlyJudge([], { ...EMPTY_METADATA, basisOfRecord: 'HumanObservation' }).blocking).toEqual([]);
    expect(tablesOnlyJudge([], EMPTY_METADATA).blocking.map((x) => x.ruleId)).toContain('CONV-BASIS-UNSET');
  });
});

describe('names and columns', () => {
  it('names the zip after the archive', () => {
    expect(tablesZipName('x.zip')).toBe('x-tables.zip');
    expect(tablesZipName('dwca')).toBe('dwca-tables.zip');
  });
  it('drops datasetName and institutionCode only when every cell is empty', () => {
    const t = { name: 'event', columns: ['eventID', 'datasetName', 'institutionCode'].map((header) => ({ header })), rows: [['E1', '', ''], ['E2', '', '']] };
    expect(withoutEmptyFormColumns(t as never).columns.map((c) => c.header)).toEqual(['eventID']);
    const filled = { ...t, rows: [['E1', 'D', ''], ['E2', 'D', '']] };
    expect(withoutEmptyFormColumns(filled as never).columns.map((c) => c.header)).toEqual(['eventID', 'datasetName']);
  });
});
