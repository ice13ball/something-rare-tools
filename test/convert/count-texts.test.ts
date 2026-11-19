// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// V3: every distinct text in a count column (a quantity column of a long sheet, a taxon column of a wide one) is listed, grouped by text, and answered per text: absence, leave out, or present with the
// text in the remarks. Nothing is preselected and no word is read as an absence by the tool. Every value is invented.
import { describe, expect, it } from 'vitest';
import { convert, countTextKey } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { judge, policyOf } from '../../src/core/convert/policy';
import { notWrittenRows } from '../../src/core/convert/notWritten';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { Finding } from '../../src/core/types';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const find = (fs: readonly Finding[], id: string) => fs.filter((f) => f.ruleId === id);
const HEADER = ['Cruise', 'Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'Oithona similis', 'Calanus finmarchicus'];
const ROWS: Cell[][] = [
  ['CR', 'S1', 'a', 50.2, 1.6, '2020-05-01', 5, 3],
  ['CR', 'S2', 'b', 50.3, 1.5, '2020-05-02', 'absent', 4],
  ['CR', 'S3', 'c', 50.4, 1.4, '2020-05-03', 'nie stwierdzono', 'absent'],
  ['CR', 'S4', 'd', 50.5, 1.3, '2020-05-04', 8, 2],
  ['CR', 'S5', 'e', 50.6, 1.2, '2020-05-05', 2, 'Absent'],
  ['CR', 'S6', 'f', 50.7, 1.1, '2020-05-06', 'NA', 'nd'],
];
const wide = (extra: Partial<ConvertSheetInput> & { edit?: Record<string, import('../../src/core/types').ColumnRole> } = {}, rows: Cell[][] = ROWS) => sheetInput(fileOf(HEADER, rows), { quantity: { kind: 'count' }, ...extra });
const run = (sin: ConvertSheetInput, fullList = false) => convert({ sheets: [sin], options: { fullList } });
// the cells the ledger names as not written, by reason (a wide sheet: the taxon cells; a long one: the rows)
const lost = (_sin: ConvertSheetInput, r: ReturnType<typeof convert>) => r.ledger.flatMap((l) => [...(l.cells?.skipped ?? l.rows.skipped)]).map((s) => ({ reason: s.reason as string, count: s.count }));
const countOf = (xs: { reason: string; count: number }[], reason: string) => xs.filter((x) => x.reason === reason).reduce((a, x) => a + x.count, 0);

// a per-text answer is for one column: `answer` is for column 6 (Oithona similis) unless another index is given; `both` answers a text of both columns, each for its own cells
type Ans = 'absence' | 'leave-out' | 'present';
const answer = (text: string, a: Ans, count: number, col = 6) => ({ [countTextKey(col, text)]: { answer: a, count } });
const both = (text: string, a: Ans) => ({ ...answer(text, a, 1, 6), ...answer(text, a, 1, 7) });

describe('a text in a count column is asked, text by text', () => {
  it('with no answer: one question per text, the export blocked, nothing written for the cells, each in the not-written list', () => {
    const sin = wide();
    const r = run(sin);
    const q = find(r.findings, 'CONV-TEXT-IN-TAXON-CELL');
    // the same text in two columns (absent) is two questions, one per column; Absent is another text; NA and nd are NA cells, not asked
    expect(q.map((f) => [f.value, f.field, f.params.count, f.params.held])).toEqual([['absent', 'Oithona similis', 1, 1], ['nie stwierdzono', 'Oithona similis', 1, 1], ['absent', 'Calanus finmarchicus', 1, 1], ['Absent', 'Calanus finmarchicus', 1, 1]]);
    expect(q[0]).toMatchObject({ severity: 'warning', field: 'Oithona similis', lines: [3] });
    expect(q[0].params.columns).toBe('Oithona similis');
    expect(policyOf(q[0])).toBe('block');
    expect(judge(r.findings).blocking.map((f) => f.ruleId)).toContain('CONV-TEXT-IN-TAXON-CELL');
    expect(find(r.findings, 'CONV-COUNT-TEXT-DECIDED')).toEqual([]);
    expect(r.occurrences.filter((o) => ['absent', 'nie stwierdzono', 'Absent'].includes(o.occurrenceRemarks ?? ''))).toEqual([]);
    // the cells are in the list of what was not written, each with its reason; the ledger balances (nothing unexplained)
    const reasons = lost(sin, r);
    expect(countOf(reasons, 'count-text')).toBe(4);
    expect(r.ledger.every((l) => (l.cells?.unexplained ?? 0) === 0 && l.rows.unexplained === 0)).toBe(true);
  });

  it('NA and nd stay NA cells: no question', () => {
    const r = run(wide({}, [['CR', 'S6', 'f', 50.7, 1.1, '2020-05-06', 'NA', 'nd'], ['CR', 'S7', 'g', 50.7, 1.1, '2020-05-07', 4, 5]]));
    expect(find(r.findings, 'CONV-TEXT-IN-TAXON-CELL')).toEqual([]);
  });

  it('the question says what it asks, in four languages, and no answer is preselected', () => {
    const q = find(run(wide()).findings, 'CONV-TEXT-IN-TAXON-CELL')[0];
    expect(renderConvertPlain(q, 'en')).toContain('1 cell of Oithona similis holds the text "absent" where a number is expected. Say what it means: absence, leave it out, or present with the text in the remarks.');
    for (const lang of ['pl', 'de', 'fr'] as const) expect(renderConvertPlain(q, lang)).toContain('absent');
  });
});

describe('the answers', () => {

  it('absence without the full-list tick: read as 0, not written, reason zero', () => {
    const sin = wide({ countTexts: answer('nie stwierdzono', 'absence', 1) });
    const r = run(sin);
    const d = find(r.findings, 'CONV-COUNT-TEXT-DECIDED');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ severity: 'info', value: 'nie stwierdzono', params: { count: 1, held: 1, answer: 'absence' } });
    expect(policyOf(d[0])).toBe('show');
    expect(r.occurrences.filter((o) => o.verbatimIdentification === 'Oithona similis' && o.eventId.includes('c'))).toEqual([]);
    expect(countOf(lost(sin, r), 'zero')).toBe(1);
    expect(find(r.findings, 'CONV-TEXT-IN-TAXON-CELL').map((f) => f.value)).toEqual(['absent', 'absent', 'Absent']);
  });

  it('absence with the full-list tick: an absent occurrence with a count of 0', () => {
    const r = run(wide({ countTexts: answer('nie stwierdzono', 'absence', 1) }), true);
    const o = r.occurrences.find((x) => x.verbatimIdentification === 'Oithona similis' && x.eventId.includes('c'))!;
    expect(o).toMatchObject({ occurrenceStatus: 'absent', individualCount: 0 });
    expect(o.organismQuantity).toBeUndefined();
    expect(r.measurements.filter((m) => m.target.id === o.id)).toEqual([]);
  });

  it('leave out: the cells are not written, listed with the reason text-left-out, and the ledger balances', () => {
    const sin = wide({ countTexts: both('absent', 'leave-out') });
    const r = run(sin);
    expect(find(r.findings, 'CONV-COUNT-TEXT-DECIDED')[0].params).toMatchObject({ answer: 'leave-out', count: 1, held: 1 });
    expect(countOf(lost(sin, r), 'text-left-out')).toBe(2);
    expect(r.occurrences.filter((o) => o.occurrenceRemarks === 'absent')).toEqual([]);
    expect(r.ledger.every((l) => (l.cells?.unexplained ?? 0) === 0 && l.rows.unexplained === 0)).toBe(true);
  });

  it('present: an occurrence present with the text in the remarks, no quantity', () => {
    const r = run(wide({ countTexts: both('absent', 'present') }));
    const o = r.occurrences.filter((x) => x.occurrenceRemarks === 'absent');
    expect(o).toHaveLength(2);
    for (const x of o) {
      expect(x.occurrenceStatus).toBe('present');
      expect(x.individualCount).toBeUndefined();
    }
    expect(find(r.findings, 'CONV-COUNT-TEXT-DECIDED')[0].params.answer).toBe('present');
  });

  it('an answer for another number of cells holds nothing: the text is asked again', () => {
    const r = run(wide({ countTexts: answer('absent', 'present', 2) }));
    expect(find(r.findings, 'CONV-COUNT-TEXT-DECIDED')).toEqual([]);
    expect(find(r.findings, 'CONV-TEXT-IN-TAXON-CELL').map((f) => f.value)).toContain('absent');
  });

  it('absent and Absent are two texts: an answer for one does not answer the other', () => {
    const r = run(wide({ countTexts: both('absent', 'leave-out') }));
    expect(find(r.findings, 'CONV-TEXT-IN-TAXON-CELL').map((f) => f.value)).toEqual(['nie stwierdzono', 'Absent']);
  });

  it('a text named like an object property is an ordinary text', () => {
    const rows: Cell[][] = [['CR', 'S1', 'a', 50.2, 1.6, '2020-05-01', 'constructor', 3], ['CR', 'S2', 'b', 50.3, 1.5, '2020-05-02', 4, 5]];
    const r = run(wide({}, rows));
    expect(find(r.findings, 'CONV-TEXT-IN-TAXON-CELL').map((f) => f.value)).toEqual(['constructor']);
  });

  it('the answers come from a companion file: said so', () => {
    const r = run(wide({ countTexts: { [countTextKey(6, 'absent')]: { answer: 'leave-out', count: 1, fromFile: true } } }));
    expect(find(r.findings, 'CONV-COUNT-TEXT-DECIDED')[0].params.fromFile).toBe('yes');
  });

  it('a sum in another finding is taken after the answers: an absence is a zero, a leave-out adds nothing', () => {
    const none = run(wide());
    const answered = run(wide({ countTexts: { ...both('absent', 'absence'), ...answer('nie stwierdzono', 'leave-out', 1), ...answer('Absent', 'present', 1, 7) } }));
    expect(find(answered.findings, 'CONV-TEXT-IN-TAXON-CELL')).toEqual([]);
    expect(judge(answered.findings).blocking.map((f) => f.ruleId)).not.toContain('CONV-TEXT-IN-TAXON-CELL');
    expect(none.occurrences.length).toBeLessThan(answered.occurrences.length);
  });
});

describe('the same answer for every text of a column', () => {
  it('applies to every text of the column the person did not answer one by one, and holds for the column\'s count of text cells', () => {
    const sin = wide({ countTextColumns: { 6: { answer: 'leave-out', count: 2 } }, countTexts: answer('nie stwierdzono', 'present', 1) });
    const r = run(sin);
    // column 6 (Oithona similis) holds 'absent' and 'nie stwierdzono': the first follows the column, the second its own answer; column 7 still asks
    const d = find(r.findings, 'CONV-COUNT-TEXT-DECIDED');
    expect(d.map((f) => [f.value, f.params.answer, f.params.via])).toEqual([['absent', 'leave-out', 'column'], ['nie stwierdzono', 'present', undefined]]);
    const q = find(r.findings, 'CONV-TEXT-IN-TAXON-CELL');
    expect(q.map((f) => [f.value, f.params.count, f.params.held])).toEqual([['absent', 1, 1], ['Absent', 1, 1]]);
    expect(q[0].params.columnTexts).toBe('7:2');
  });

  it('the page can read the number a column answer is given for from the findings, and a changed number asks again', () => {
    const asked = find(run(wide()).findings, 'CONV-TEXT-IN-TAXON-CELL');
    expect(asked.map((f) => f.params.columnTexts)).toEqual(['6:2', '6:2', '7:2', '7:2']);
    const stale = run(wide({ countTextColumns: { 6: { answer: 'present', count: 3 } } }));
    expect(find(stale.findings, 'CONV-COUNT-TEXT-DECIDED')).toEqual([]);
  });
});

describe('a long sheet\'s quantity column', () => {
  const LONG = ['Sample ID', 'Station', 'Date', 'Latitude', 'Longitude', 'Species', 'Abundance'];
  const rows: Cell[][] = [
    ['s1', 'S1', '2020-05-01', 50.2, 1.6, 'Oithona similis', 5],
    ['s1', 'S1', '2020-05-01', 50.2, 1.6, 'Calanus finmarchicus', 'absent'],
    ['s2', 'S2', '2020-05-02', 50.3, 1.5, 'Oithona similis', 'absent'],
    ['s2', 'S2', '2020-05-02', 50.3, 1.5, 'Calanus finmarchicus', '<0.5'],
  ];
  const long = (extra: Partial<ConvertSheetInput> = {}) => sheetInput(fileOf(LONG, rows), { shape: 'long', quantity: { kind: 'count' }, ...extra });

  it('asks per text, qualifiers and units included, and writes nothing for the held cells', () => {
    const sin = long();
    const r = run(sin);
    expect(find(r.findings, 'CONV-TEXT-IN-TAXON-CELL').map((f) => [f.value, f.field, f.params.count])).toEqual([['absent', 'Abundance', 2], ['<0.5', 'Abundance', 1]]);
    expect(r.occurrences).toHaveLength(1);
    expect(countOf(lost(sin, r), 'count-text')).toBe(3);
  });

  it('the answers work the same way: absence with the full list, leave out, present', () => {
    const r = run(long({ countTexts: { ...answer('absent', 'absence', 2), ...answer('<0.5', 'present', 1) } }), true);
    expect(find(r.findings, 'CONV-TEXT-IN-TAXON-CELL')).toEqual([]);
    expect(r.occurrences.filter((o) => o.occurrenceStatus === 'absent').map((o) => o.individualCount)).toEqual([0, 0]);
    expect(r.occurrences.find((o) => o.occurrenceRemarks === '<0.5')?.occurrenceStatus).toBe('present');
    const gone = long({ countTexts: answer('absent', 'leave-out', 2) });
    const g = run(gone);
    expect(countOf(lost(gone, g), 'text-left-out')).toBe(2);
  });
});

describe('presence-only is unchanged', () => {
  it('a word that is no mark is CONV-PRESENCE-VALUE, not a count-text question', () => {
    const sin = wide({ presenceOnly: true, quantity: undefined, shape: 'wide', edit: { 'Oithona similis': { kind: 'taxon', header: true }, 'Calanus finmarchicus': { kind: 'taxon', header: true } } }, [['CR', 'S1', 'a', 50.2, 1.6, '2020-05-01', 'x', 'maybe'], ['CR', 'S2', 'b', 50.3, 1.5, '2020-05-02', 'x', 'x']]);
    const r = run(sin);
    expect(find(r.findings, 'CONV-PRESENCE-VALUE')).toHaveLength(1);
    expect(find(r.findings, 'CONV-TEXT-IN-TAXON-CELL')).toEqual([]);
  });
});

const balanced = (r: ReturnType<typeof convert>): boolean => r.ledger.every((l) => (l.cells?.unexplained ?? 0) === 0 && l.rows.unexplained === 0);

describe('fix round 1', () => {
  it('I1: an absence is not judged by the class scale: under 1-5 it unblocks, with no CONV-CLASS-VALUE', () => {
    const rows: Cell[][] = [['CR', 'S1', 'a', 50.2, 1.6, '2020-05-01', 'absent', 3], ['CR', 'S2', 'b', 50.3, 1.5, '2020-05-02', 2, 4]];
    for (const fullList of [false, true]) {
      const sin = wide({ countTexts: answer('absent', 'absence', 1), quantity: { kind: 'class', scale: { name: '', min: '1', max: '5' } } }, rows);
      const r = run(sin, fullList);
      expect(find(r.findings, 'CONV-CLASS-VALUE'), String(fullList)).toEqual([]);
      expect(find(r.findings, 'CONV-COUNT-TEXT-DECIDED')).toHaveLength(1);
      expect(judge(r.findings).blocking).toEqual([]);
    }
  });

  it('M2: a file with answers that all hold is read once; a stale one adds a pass', async () => {
    const mod = await import('../../src/core/convert/build');
    mod.passCounter.count = 0;
    mod.convert({ sheets: [wide({ countTexts: answer('nie stwierdzono', 'absence', 1) })], options: {} });
    expect(mod.passCounter.count).toBe(1);
    mod.passCounter.count = 0;
    mod.convert({ sheets: [wide({ countTexts: answer('nie stwierdzono', 'absence', 5) })], options: {} });
    expect(mod.passCounter.count).toBe(2);
  });

  it('M3: a per-text answer gone stale asks the text again; the column answer does not take it over', () => {
    const r = run(wide({ countTexts: answer('absent', 'present', 2), countTextColumns: { 6: { answer: 'leave-out', count: 2 } } }));
    expect(find(r.findings, 'CONV-TEXT-IN-TAXON-CELL').map((f) => f.value)).toContain('absent');
    expect(find(r.findings, 'CONV-COUNT-TEXT-DECIDED').filter((f) => f.value === 'absent')).toEqual([]);
  });

  it('M3: the plain text says when the answer was the one for the whole column, in four languages', () => {
    const r = run(wide({ countTextColumns: { 6: { answer: 'leave-out', count: 2 } } }));
    const d = find(r.findings, 'CONV-COUNT-TEXT-DECIDED').find((f) => f.params.via === 'column')!;
    const words = { en: 'whole column', pl: 'całej kolumny', de: 'ganze Spalte', fr: 'toute la colonne' };
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) expect(renderConvertPlain(d, lang), lang).toContain(words[lang]);
  });

  it('M5: the ledger balances for absence (both ticks) and present', () => {
    for (const fullList of [false, true]) expect(balanced(run(wide({ countTexts: { ...both('absent', 'absence'), ...answer('nie stwierdzono', 'absence', 1), ...answer('Absent', 'absence', 1, 7) } }), fullList))).toBe(true);
    expect(balanced(run(wide({ countTexts: { ...both('absent', 'present'), ...answer('nie stwierdzono', 'present', 1), ...answer('Absent', 'present', 1, 7) } })))).toBe(true);
  });

  it('M7: the Polish leave-out text agrees in number', () => {
    const twice: Cell[][] = [['CR', 'S1', 'a', 50.2, 1.6, '2020-05-01', 'absent', 3], ['CR', 'S2', 'b', 50.3, 1.5, '2020-05-02', 'absent', 4], ['CR', 'S3', 'c', 50.4, 1.4, '2020-05-03', 6, 2], ['CR', 'S4', 'd', 50.5, 1.3, '2020-05-04', 7, 1], ['CR', 'S5', 'e', 50.6, 1.2, '2020-05-05', 8, 1]];
    const r = run(wide({ countTexts: answer('absent', 'leave-out', 2) }, twice));
    const d = find(r.findings, 'CONV-COUNT-TEXT-DECIDED')[0];
    expect(renderConvertPlain(d, 'pl')).toContain('są pominięte');
    const one = run(wide({ countTexts: answer('nie stwierdzono', 'leave-out', 1) }));
    expect(renderConvertPlain(find(one.findings, 'CONV-COUNT-TEXT-DECIDED')[0], 'pl')).toContain('jest pominięta');
  });

  it('M4: the ledger names the texts the person left out in words of their own, in four languages', async () => {
    const { UI } = await import('../../src/core/i18n/ui');
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      const left = UI[lang]['convert.ledger.reason.text-left-out' as never] as string | undefined;
      expect(left, lang).toBeTruthy();
      expect(left).not.toBe(UI[lang]['convert.ledger.reason.text-cell' as never]);
    }
  });
});

describe('an answer applies only to its own column', () => {
  const plus: Cell[][] = [
    ['CR', 'S1', 'a', 50.2, 1.6, '2020-05-01', '+', '+'],
    ['CR', 'S2', 'b', 50.3, 1.5, '2020-05-02', 4, 3],
  ];
  const key = (index: number, text: string) => `${index}\u001f${text}`;

  it('the same text in two columns is two questions, each with the cells of its own column', () => {
    const q = find(run(wide({}, plus)).findings, 'CONV-TEXT-IN-TAXON-CELL');
    expect(q.map((f) => [f.value, f.field, f.params.indexes, f.params.held])).toEqual([['+', 'Oithona similis', '6', 1], ['+', 'Calanus finmarchicus', '7', 1]]);
  });

  it('"+" answered present in column A and absence in column B: each column keeps its own answer', () => {
    const r = run(wide({ countTexts: { [key(6, '+')]: { answer: 'present', count: 1 }, [key(7, '+')]: { answer: 'absence', count: 1 } } }, plus), true);
    expect(find(r.findings, 'CONV-TEXT-IN-TAXON-CELL')).toEqual([]);
    expect(find(r.findings, 'CONV-COUNT-TEXT-DECIDED').map((f) => [f.field, f.params.answer])).toEqual([['Oithona similis', 'present'], ['Calanus finmarchicus', 'absence']]);
    const first = r.occurrences.filter((o) => o.occurrenceRemarks === '+');
    expect(first).toHaveLength(1);
    expect(r.occurrences.some((o) => o.scientificName === 'Calanus finmarchicus' && o.occurrenceStatus === 'absent')).toBe(true);
  });

  it('an answer given for one column does not answer the same text of the other column', () => {
    const r = run(wide({ countTexts: { [key(6, '+')]: { answer: 'present', count: 1 } } }, plus));
    expect(find(r.findings, 'CONV-TEXT-IN-TAXON-CELL').map((f) => f.field)).toEqual(['Calanus finmarchicus']);
  });

  it('a text answer that went stale in one column asks that column again and leaves the other', () => {
    const r = run(wide({ countTexts: { [key(6, '+')]: { answer: 'present', count: 5 }, [key(7, '+')]: { answer: 'absence', count: 1 } } }, plus));
    expect(find(r.findings, 'CONV-TEXT-IN-TAXON-CELL').map((f) => f.field)).toEqual(['Oithona similis']);
    expect(find(r.findings, 'CONV-COUNT-TEXT-DECIDED').map((f) => f.field)).toEqual(['Calanus finmarchicus']);
  });
});
