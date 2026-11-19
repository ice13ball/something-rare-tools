// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Round 4, Task 17: a text in a count column ("absent", "nie stwierdzono") is asked text by text (CONV-TEXT-IN-TAXON-CELL): absence, leave out, or present with the text in the remarks, none preselected;
// one answer can be given for a whole column; the answer travels with its count; the companion file keeps it by the HASH of the text, never the text. Every value is invented.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { applySavedCountTexts, countTextKeyOf, countTextSettingsOf, initialChoices, requestOf } from '../../src/app/convertModel';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { shortHash } from '../../src/core/convert/keySetting';
import { writeConvertSidecar } from '../../src/core/convert/settings';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import type { ConvertEngine, ConvertParseResult, ConvertRequestBody } from '../../src/worker/convert.protocol';
import { chooseFiles, csvOf } from './convertHelpers';

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const HEADER = ['Cruise', 'Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'Oithona similis', 'Calanus finmarchicus'];
const rowsOf = (oithona: (string | number)[], calanus: (string | number)[] = []): (string | number)[][] =>
  oithona.map((o, i) => ['CR', `S${i + 1}`, `s${i + 1}`, 50 + i / 10, 1.5, `2020-05-0${i + 1}`, o, calanus[i] ?? 3]);
const FILE = csvOf(HEADER, rowsOf([5, 'absent', 'nie stwierdzono', 8]));

let seen: ConvertRequestBody[] = [];
const requests = (): ConvertRequestBody[] => seen;
const lastSheet = (): ConvertRequestBody['sheets'][number] => seen[seen.length - 1].sheets[0];
async function load(files: { name: string; text: string }[]): Promise<{ download: ReturnType<typeof vi.fn> }> {
  const download = vi.fn();
  const base = createDirectConvertEngine();
  seen = [];
  const engine: ConvertEngine = { ...base, convert: (b) => (seen.push(b), base.convert(b)) };
  const view = render(<ConvertPage engine={engine} download={download} downloadFile={vi.fn()} />);
  chooseFiles(view.container, files);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  const confirm = screen.queryByRole('button', { name: /Confirm all shown/ });
  if (confirm !== null) fireEvent.click(confirm);
  for (const kind of screen.queryAllByLabelText(T['convert.quantity.kind'])) fireEvent.change(kind, { target: { value: 'count' } });
  await idle();
  return { download };
}
const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const items = (rule: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(`li[data-rule="${rule}"]`)];
const asked = (): HTMLElement[] => items('CONV-TEXT-IN-TAXON-CELL');
const decided = (): HTMLElement[] => items('CONV-COUNT-TEXT-DECIDED');
const itemOf = (rule: string, text: string): HTMLElement => {
  const li = items(rule).find((x) => x.textContent?.includes(`"${text}"`));
  if (li === undefined) throw new Error(`no ${rule} for ${text}`);
  return li;
};
const button = (root: HTMLElement, name: string): HTMLElement => within(root).getByRole('button', { name });
const parsed = (text: string, companion?: string): Promise<ConvertParseResult> =>
  createDirectConvertEngine().parse([{ name: 'hauls.csv', bytes: new TextEncoder().encode(text), source: 'dropped' }, ...(companion === undefined ? [] : [{ name: 'c.csv', bytes: new TextEncoder().encode(companion), source: 'dropped' as const }])]);

describe('the questions and the three answers', () => {
  it('asks one question per text with three buttons, none pressed; "Absence" decides that text only; "Ask again" asks it again', async () => {
    await load([{ name: 'hauls.csv', text: FILE }]);
    expect(asked().map((q) => q.getAttribute('data-rule'))).toHaveLength(2);
    expect(asked()[0].closest('.convert-findings')?.getAttribute('data-kind')).toBe('error');
    for (const q of asked()) {
      expect(within(q).getAllByRole('button').map((b) => b.textContent)).toEqual([T['convert.finding.countAbsence'], T['convert.finding.countLeaveOut'], T['convert.finding.countPresent']]);
      expect(within(q).getAllByRole('button').every((b) => !b.hasAttribute('aria-pressed'))).toBe(true);
    }
    // nothing is answered before a click
    expect(requests().every((b) => b.sheets.every((x) => x.countTexts === undefined && x.countTextColumns === undefined))).toBe(true);
    expect(decided()).toHaveLength(0);
    fireEvent.click(button(itemOf('CONV-TEXT-IN-TAXON-CELL', 'absent'), T['convert.finding.countAbsence']));
    await waitFor(() => expect(decided()).toHaveLength(1));
    await idle();
    expect(lastSheet().countTexts).toEqual({ '6\u001fabsent': { answer: 'absence', count: 1 } });
    expect(lastSheet().countTextColumns).toBeUndefined();
    // that finding is decided, the other text is still asked
    expect(itemOf('CONV-COUNT-TEXT-DECIDED', 'absent')).toBeTruthy();
    expect(asked()).toHaveLength(1);
    expect(asked()[0].textContent).toContain('nie stwierdzono');
    fireEvent.click(button(itemOf('CONV-COUNT-TEXT-DECIDED', 'absent'), T['convert.finding.askAgain']));
    await waitFor(() => expect(asked()).toHaveLength(2));
    expect(decided()).toHaveLength(0);
    await idle();
    expect(lastSheet().countTexts).toBeUndefined();
  });

  it('sends held (all the cells with that text), not the count of undecided cells', async () => {
    // "absent" in two cells: answer it, then the request carries 2
    await load([{ name: 'hauls.csv', text: csvOf(HEADER, rowsOf([5, 'absent', 'absent', 8])) }]);
    fireEvent.click(button(asked()[0], T['convert.finding.countLeaveOut']));
    await waitFor(() => expect(decided()).toHaveLength(1));
    await idle();
    expect(lastSheet().countTexts).toEqual({ '6\u001fabsent': { answer: 'leave-out', count: 2 } });
    expect(decided()[0].getAttribute('data-rule')).toBe('CONV-COUNT-TEXT-DECIDED');
  });

  it('"Present" and "Leave out" are answers of their own', async () => {
    await load([{ name: 'hauls.csv', text: FILE }]);
    fireEvent.click(button(itemOf('CONV-TEXT-IN-TAXON-CELL', 'absent'), T['convert.finding.countPresent']));
    await waitFor(() => expect(decided()).toHaveLength(1));
    fireEvent.click(button(itemOf('CONV-TEXT-IN-TAXON-CELL', 'nie stwierdzono'), T['convert.finding.countLeaveOut']));
    await waitFor(() => expect(decided()).toHaveLength(2));
    await idle();
    expect(lastSheet().countTexts).toEqual({ '6\u001fabsent': { answer: 'present', count: 1 }, '6\u001fnie stwierdzono': { answer: 'leave-out', count: 1 } });
    expect(asked()).toHaveLength(0);
  });

  it('the buttons read in four languages', () => {
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      for (const k of ['convert.finding.countAbsence', 'convert.finding.countLeaveOut', 'convert.finding.countPresent', 'convert.countText.column', 'convert.countText.group'] as const) expect(UI[lang][k].length).toBeGreaterThan(3);
    }
    expect(UI.pl['convert.finding.countAbsence']).not.toBe(UI.en['convert.finding.countAbsence']);
  });
});

describe('one answer for a whole column', () => {
  const WORDS = ['absent', 'none seen', 'not found', 'nie stwierdzono'];
  const COLUMN_FILE = csvOf(HEADER, rowsOf([5, 6, 7, 8, 9, 10, ...WORDS]));
  const columnControl = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-testid="count-text-column"]');

  it('is offered with nothing pressed, answers every open text with the column count, and each text says it came from the column', async () => {
    await load([{ name: 'hauls.csv', text: COLUMN_FILE }]);
    const control = columnControl()!;
    expect(within(control).getAllByRole('button').every((b) => !b.hasAttribute('aria-pressed'))).toBe(true);
    expect(requests().every((b) => b.sheets.every((x) => x.countTextColumns === undefined))).toBe(true);
    fireEvent.click(within(control).getByRole('button', { name: T['convert.finding.countAbsence'] }));
    await waitFor(() => expect(decided()).toHaveLength(4));
    await idle();
    expect(lastSheet().countTextColumns).toEqual({ 6: { answer: 'absence', count: 4 } });
    expect(lastSheet().countTexts).toBeUndefined();
    expect(asked()).toHaveLength(0);
    expect(columnControl()).toBeNull();
    expect(decided()[0].textContent).toContain('whole column');
  });

  it('does not override a text answered by itself', async () => {
    await load([{ name: 'hauls.csv', text: COLUMN_FILE }]);
    fireEvent.click(button(itemOf('CONV-TEXT-IN-TAXON-CELL', 'not found'), T['convert.finding.countPresent']));
    await waitFor(() => expect(decided()).toHaveLength(1));
    await idle();
    fireEvent.click(within(columnControl()!).getByRole('button', { name: T['convert.finding.countLeaveOut'] }));
    await waitFor(() => expect(decided()).toHaveLength(4));
    await idle();
    expect(lastSheet().countTexts).toEqual({ '6\u001fnot found': { answer: 'present', count: 1 } });
    // the column answer's count is every text cell of the column, the one answered by itself included
    expect(lastSheet().countTextColumns).toEqual({ 6: { answer: 'leave-out', count: 4 } });
    expect(itemOf('CONV-COUNT-TEXT-DECIDED', 'not found').textContent).not.toContain('whole column');
    expect(itemOf('CONV-COUNT-TEXT-DECIDED', 'not found').textContent).toContain('remarks');
  });

  it('"Ask again" on a text the column settled takes back the column answer and keeps the answers the person gave texts', async () => {
    await load([{ name: 'hauls.csv', text: COLUMN_FILE }]);
    fireEvent.click(button(itemOf('CONV-TEXT-IN-TAXON-CELL', 'not found'), T['convert.finding.countPresent']));
    await waitFor(() => expect(decided()).toHaveLength(1));
    await idle();
    fireEvent.click(within(columnControl()!).getByRole('button', { name: T['convert.finding.countAbsence'] }));
    await waitFor(() => expect(decided()).toHaveLength(4));
    await idle();
    fireEvent.click(button(itemOf('CONV-COUNT-TEXT-DECIDED', 'absent'), T['convert.finding.askAgain']));
    await waitFor(() => expect(asked()).toHaveLength(3));
    await idle();
    expect(lastSheet().countTextColumns).toBeUndefined();
    expect(lastSheet().countTexts).toEqual({ '6\u001fnot found': { answer: 'present', count: 1 } });
    expect(decided()).toHaveLength(1);
  });

  it('"Ask again" on a text answered by itself leaves the column answer and the other texts alone', async () => {
    await load([{ name: 'hauls.csv', text: COLUMN_FILE }]);
    fireEvent.click(button(itemOf('CONV-TEXT-IN-TAXON-CELL', 'not found'), T['convert.finding.countPresent']));
    await waitFor(() => expect(decided()).toHaveLength(1));
    fireEvent.click(button(itemOf('CONV-TEXT-IN-TAXON-CELL', 'absent'), T['convert.finding.countAbsence']));
    await waitFor(() => expect(decided()).toHaveLength(2));
    await idle();
    fireEvent.click(button(itemOf('CONV-COUNT-TEXT-DECIDED', 'absent'), T['convert.finding.askAgain']));
    await waitFor(() => expect(asked().map((x) => x.textContent?.includes('"absent"'))).toContain(true));
    await idle();
    expect(lastSheet().countTexts).toEqual({ '6\u001fnot found': { answer: 'present', count: 1 } });
  });

  it('"Ask again" on a text answered by itself also takes back the column answer: the text is asked, and the other texts that answer covered come back as questions', async () => {
    await load([{ name: 'hauls.csv', text: COLUMN_FILE }]);
    fireEvent.click(button(itemOf('CONV-TEXT-IN-TAXON-CELL', 'not found'), T['convert.finding.countPresent']));
    await waitFor(() => expect(decided()).toHaveLength(1));
    await idle();
    fireEvent.click(within(columnControl()!).getByRole('button', { name: T['convert.finding.countLeaveOut'] }));
    await waitFor(() => expect(decided()).toHaveLength(4));
    await idle();
    expect(itemOf('CONV-COUNT-TEXT-DECIDED', 'not found').textContent).not.toContain('whole column');
    fireEvent.click(button(itemOf('CONV-COUNT-TEXT-DECIDED', 'not found'), T['convert.finding.askAgain']));
    await waitFor(() => expect(asked()).toHaveLength(4));
    await idle();
    expect(asked().map((q) => q.textContent?.match(/"([^"]+)"/)?.[1]).sort()).toEqual(['absent', 'nie stwierdzono', 'none seen', 'not found']);
    expect(decided()).toHaveLength(0);
    expect(lastSheet().countTextColumns).toBeUndefined();
    expect(lastSheet().countTexts).toBeUndefined();
  });

  it('no column control for a column with one open text', async () => {
    await load([{ name: 'hauls.csv', text: FILE.replace('nie stwierdzono', '4') }]);
    expect(asked()).toHaveLength(1);
    expect(columnControl()).toBeNull();
  });
});

describe('many texts', () => {
  const MANY = Array.from({ length: 12 }, (_, i) => `word ${i}`);

  it('are listed in a collapsed group per column with their count, the column control stays visible above', async () => {
    await load([{ name: 'hauls.csv', text: csvOf(HEADER, rowsOf([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, ...MANY])) }]);
    const groups = [...document.querySelectorAll<HTMLDetailsElement>('details[data-testid="count-texts-group"]')];
    expect(groups).toHaveLength(1);
    expect(groups[0].open).toBe(false);
    expect(groups[0].querySelector('summary')?.textContent).toBe('Oithona similis: texts (12)');
    expect(groups[0].querySelectorAll('li[data-rule="CONV-TEXT-IN-TAXON-CELL"]')).toHaveLength(12);
    const control = document.querySelector<HTMLElement>('[data-testid="count-text-column"]')!;
    expect(control.closest('details')).toBeNull();
    fireEvent.click(within(control).getByRole('button', { name: T['convert.finding.countLeaveOut'] }));
    await waitFor(() => expect(decided()).toHaveLength(12));
    await idle();
    // the answered ones are grouped as well, per column
    expect(document.querySelectorAll('details[data-testid="count-texts-group"]')).toHaveLength(1);
    expect(document.querySelector('details[data-testid="count-texts-group"] summary')?.textContent).toBe('Oithona similis: texts (12)');
  });
});

describe('the collapse counts texts per column, and a mostly-text column is not silently ignored', () => {
  const groupsOpen = (): HTMLDetailsElement[] => [...document.querySelectorAll<HTMLDetailsElement>('details[data-testid="count-texts-group"]')];
  const ten = (oithona: (string | number)[], calanus: (string | number)[]): (string | number)[][] =>
    oithona.map((o, i) => ['CR', `S${i + 1}`, `s${i + 1}`, 50 + i / 10, 1.5, `2020-05-${String(i + 1).padStart(2, '0')}`, o, calanus[i] ?? 3]);

  it('six texts spread over two columns (three each) stay listed, none collapsed', async () => {
    await load([{ name: 'hauls.csv', text: csvOf(HEADER, ten([1, 2, 3, 4, 'absent', 'none seen', 'not found'], [1, 2, 3, 4, 'zero seen', 'nil seen', 'n found'])) }]);
    expect(asked()).toHaveLength(6);
    expect(groupsOpen()).toHaveLength(0);
  });

  it('a column with six texts is collapsed, the two texts of the other column stay listed', async () => {
    await load([{ name: 'hauls.csv', text: csvOf(HEADER, ten([1, 2, 3, 4, 5, 6, 7, 8, 'w a', 'w b', 'w c', 'w d', 'w e', 'w f'], [1, 2, 3, 4, 5, 6, 7, 8, 'zero seen', 'nil seen'])) }]);
    expect(groupsOpen()).toHaveLength(1);
    expect(groupsOpen()[0].querySelector('summary')?.textContent).toBe('Oithona similis: texts (6)');
    expect(groupsOpen()[0].querySelectorAll('li[data-rule="CONV-TEXT-IN-TAXON-CELL"]')).toHaveLength(6);
    const outside = asked().filter((q) => q.closest('details') === null);
    expect(outside.map((q) => q.textContent?.match(/"([^"]+)"/)?.[1]).sort()).toEqual(['nil seen', 'zero seen']);
  });

  it('a column of 8 text cells and 2 numbers is not asked per text: the converter says it proposed to ignore the column, visibly', async () => {
    await load([{ name: 'hauls.csv', text: csvOf(HEADER, ten([5, 6, 'a1 none', 'b1 none', 'c1 none', 'd1 none', 'e1 none', 'f1 none', 'g1 none', 'h1 none'], [])) }]);
    expect(asked()).toHaveLength(0);
    const ignored = items('CONV-COLUMN-IGNORED-PROPOSED');
    expect(ignored).toHaveLength(1);
    expect(ignored[0].textContent).toContain('Oithona similis');
  });
});

describe('the companion file', () => {
  const answered = async (): Promise<string> => {
    const run = await load([{ name: 'hauls.csv', text: FILE }]);
    fireEvent.click(button(itemOf('CONV-TEXT-IN-TAXON-CELL', 'absent'), T['convert.finding.countAbsence']));
    await waitFor(() => expect(decided()).toHaveLength(1));
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    return run.download.mock.calls[0][0] as string;
  };

  it('keeps the answer by sheet, counts and the hash of the text: the file holds neither text', async () => {
    const text = await answered();
    expect(text).toContain(`countTextAt=absence:1:4:hauls.csv:6:${shortHash('tabsent')}`);
    expect(text).not.toContain('absent');
    expect(text).not.toContain('nie stwierdzono');
    expect(text).not.toContain('countTextAt=leave-out');
  });

  it('is applied again from the file (fromFile) for the same sheet, rows, text and cells; the other text is still asked', async () => {
    const text = await answered();
    cleanup();
    await load([{ name: 'hauls.csv', text: FILE }, { name: 'c.csv', text }]);
    await waitFor(() => expect(decided()).toHaveLength(1));
    await idle();
    expect(lastSheet().countTexts).toEqual({ '6\u001fabsent': { answer: 'absence', count: 1, fromFile: true } });
    expect(itemOf('CONV-COUNT-TEXT-DECIDED', 'absent').textContent).toContain('companion file');
    expect(asked()).toHaveLength(1);
    expect(asked()[0].textContent).toContain('nie stwierdzono');
    // "Ask again" takes it back, and it is not applied a second time
    fireEvent.click(button(itemOf('CONV-COUNT-TEXT-DECIDED', 'absent'), T['convert.finding.askAgain']));
    await waitFor(() => expect(asked()).toHaveLength(2));
    await idle();
    expect(asked()).toHaveLength(2);
    expect(decided()).toHaveLength(0);
  });

  it('is not applied, and the question is visible, for one more cell with the text or one more row', async () => {
    // a saved answer for 7 rows and one "absent" cell; the converter has to see texts in a minority of the column to ask at all
    const text = writeConvertSidecar({ countText: [{ sheet: 'hauls.csv', index: 6, answer: 'absence', count: 1, rows: 7, hash: shortHash('tabsent') }] });
    await load([{ name: 'hauls.csv', text: csvOf(HEADER, rowsOf([5, 6, 7, 8, 9, 'absent', 'nie stwierdzono'])) }, { name: 'c.csv', text }]);
    await waitFor(() => expect(decided()).toHaveLength(1));
    cleanup();
    // another cell of the same sheet size holds the text: the cells it was given for changed
    await load([{ name: 'hauls.csv', text: csvOf(HEADER, rowsOf([5, 6, 7, 8, 'absent', 'absent', 'nie stwierdzono'])) }, { name: 'c.csv', text }]);
    expect(decided()).toHaveLength(0);
    expect(asked().map((q) => q.textContent?.includes('"absent"'))).toContain(true);
    cleanup();
    // one more row: another number of rows
    await load([{ name: 'hauls.csv', text: csvOf(HEADER, rowsOf([5, 6, 7, 8, 9, 10, 'absent', 'nie stwierdzono'])) }, { name: 'c.csv', text }]);
    expect(decided()).toHaveLength(0);
    expect(asked()).toHaveLength(2);
  });

  it('a whole-column answer is written as one countTextColumn line for its column, not one line per text', async () => {
    const run = await load([{ name: 'hauls.csv', text: csvOf(HEADER, rowsOf([5, 6, 7, 8, 'absent', 'none seen', 'not found'])) }]);
    fireEvent.click(within(document.querySelector<HTMLElement>('[data-testid="count-text-column"]')!).getByRole('button', { name: T['convert.finding.countAbsence'] }));
    await waitFor(() => expect(decided()).toHaveLength(3));
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const text = run.download.mock.calls[0][0] as string;
    expect(text).toContain('countTextColumn=absence:3:7:hauls.csv:6');
    expect(text).not.toMatch(/^countTextAt=/m);
    expect(text).not.toContain('none seen');
  });

  it('settings: only a decided text of a sheet is recorded; applySavedCountTexts matches by hash and count and uses a saved answer once', async () => {
    const saved = writeConvertSidecar({ countText: [{ sheet: 'hauls.csv', index: 6, answer: 'present', count: 1, rows: 4, hash: shortHash('tabsent') }, { sheet: 'hauls.csv', index: 6, answer: 'absence', count: 9, rows: 4, hash: shortHash('tnie stwierdzono') }] });
    const p = await parsed(FILE, saved);
    const choices = initialChoices(p);
    const key = Object.keys(choices)[0];
    expect(choices[key].countTextsSaved).toHaveLength(2);
    expect(choices[key].countTexts).toBeUndefined();
    const q = (value: string, held: number): never => ({ ruleId: 'CONV-TEXT-IN-TAXON-CELL', file: 'hauls.csv', sheet: 'hauls.csv', value, params: { held, count: held, indexes: '6' } }) as never;
    const out = applySavedCountTexts(p, choices, [q('absent', 1), q('nie stwierdzono', 1)]);
    expect(out[key].countTexts).toEqual({ '6\u001fabsent': { answer: 'present', count: 1, fromFile: true } });
    expect(out[key].countTextsSaved).toHaveLength(1);
    expect(applySavedCountTexts(p, out, [q('absent', 1)])).toBe(out);
    const said = [{ ruleId: 'CONV-COUNT-TEXT-DECIDED', file: 'hauls.csv', sheet: 'hauls.csv', value: 'absent', params: { held: 1, answer: 'present', indexes: '6' } }, { ruleId: 'CONV-COUNT-TEXT-DECIDED', file: 'other.csv', sheet: 'x', value: 'absent', params: { held: 1, answer: 'present', indexes: '6' } }] as never;
    expect(countTextSettingsOf(p, said)).toEqual([{ sheet: 'hauls.csv', index: 6, answer: 'present', count: 1, rows: 4, hash: shortHash('tabsent') }]);
    expect(countTextSettingsOf(p, [])).toEqual([]);
  });

  it('I1: the same text in two columns is ONE question; one click answers both columns, each stored and kept in the companion file on its own', async () => {
    const two = csvOf(HEADER, rowsOf([5, 6, 7, '+'], [3, 4, 5, '+']));
    const run = await load([{ name: 'hauls.csv', text: two }]);
    expect(asked()).toHaveLength(1);
    fireEvent.click(button(asked()[0], T['convert.finding.countPresent']));
    await waitFor(() => expect(decided()).toHaveLength(1));
    await idle();
    expect(asked()).toHaveLength(0);
    expect(lastSheet().countTexts).toEqual({ '6\u001f+': { answer: 'present', count: 1 }, '7\u001f+': { answer: 'present', count: 1 } });
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const text = run.download.mock.calls[0][0] as string;
    expect(text).toContain(`countTextAt=present:1:4:hauls.csv:6:${shortHash('t+')}`);
    expect(text).toContain(`countTextAt=present:1:4:hauls.csv:7:${shortHash('t+')}`);
    cleanup();
    await load([{ name: 'hauls.csv', text: two }, { name: 'c.csv', text }]);
    await waitFor(() => expect(decided()).toHaveLength(1));
    await idle();
    expect(lastSheet().countTexts).toEqual({ '6\u001f+': { answer: 'present', count: 1, fromFile: true }, '7\u001f+': { answer: 'present', count: 1, fromFile: true } });
    expect(asked()).toHaveLength(0);
  });

  it('I1: A answered present and B absence (the column control) is kept per column on reload; only a column with no answer is asked again', async () => {
    // two texts in each column, so each column has its control
    const two = csvOf(HEADER, rowsOf([5, 6, 7, '+', 'n/f'], [3, 4, 5, '+', 'n/f']));
    const run = await load([{ name: 'hauls.csv', text: two }]);
    expect(asked()).toHaveLength(2);
    const controls = [...document.querySelectorAll<HTMLElement>('[data-testid="count-text-column"]')];
    expect(controls).toHaveLength(2);
    fireEvent.click(within(controls[0]).getByRole('button', { name: T['convert.finding.countPresent'] }));
    await idle();
    // column A's answer settled both of its texts; column B still has both asked (one question per text, listing only B now)
    expect(asked()).toHaveLength(2);
    expect(asked().every((q) => /Calanus finmarchicus/.test(q.textContent ?? '') && !/Oithona/.test(q.textContent ?? ''))).toBe(true);
    fireEvent.click(within(document.querySelector<HTMLElement>('[data-testid="count-text-column"]')!).getByRole('button', { name: T['convert.finding.countAbsence'] }));
    await waitFor(() => expect(asked()).toHaveLength(0));
    await idle();
    expect(lastSheet().countTextColumns).toEqual({ 6: { answer: 'present', count: 2 }, 7: { answer: 'absence', count: 2 } });
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const text = run.download.mock.calls[0][0] as string;
    cleanup();
    await load([{ name: 'hauls.csv', text: two }, { name: 'c.csv', text }]);
    await waitFor(() => expect(asked()).toHaveLength(0));
    await idle();
    expect(lastSheet().countTextColumns).toEqual({ 6: { answer: 'present', count: 2, fromFile: true }, 7: { answer: 'absence', count: 2, fromFile: true } });
  });

  it('I1: a text of 13 columns is one question and one click answers all of them', async () => {
    const names = Array.from({ length: 13 }, (_, i) => `Taxon ${String.fromCharCode(65 + i)}`);
    const header = ['Cruise', 'Station', 'Sample', 'Latitude', 'Longitude', 'Date', ...names];
    const rows = [
      ['CR', 'S1', 's1', 50, 1.5, '2020-05-01', ...names.map(() => '+')],
      ['CR', 'S2', 's2', 50.1, 1.5, '2020-05-02', ...names.map(() => 4)],
    ];
    await load([{ name: 'hauls.csv', text: csvOf(header, rows) }]);
    expect(asked()).toHaveLength(1);
    fireEvent.click(button(asked()[0], T['convert.finding.countAbsence']));
    await waitFor(() => expect(asked()).toHaveLength(0));
    await idle();
    expect(Object.keys(lastSheet().countTexts ?? {})).toHaveLength(13);
    expect(Object.values(lastSheet().countTexts ?? {}).every((a) => a.answer === 'absence' && a.count === 1)).toBe(true);
  });

  it('I1: a line of the old format (no column) is not applied and the text is asked again, visibly', async () => {
    const text = (await answered()).replace(`countTextAt=absence:1:4:hauls.csv:6:${shortHash('tabsent')}`, `countText=absence:1:4:hauls.csv:${shortHash('tabsent')}`);
    expect(text).toContain(`countText=absence:1:4:hauls.csv:${shortHash('tabsent')}`);
    cleanup();
    await load([{ name: 'hauls.csv', text: FILE }, { name: 'c.csv', text }]);
    await idle();
    expect(decided()).toHaveLength(0);
    expect(asked()).toHaveLength(2);
    expect(lastSheet().countTexts).toBeUndefined();
  });

  it('M1: an answer the converter found stale leaves the page state, the question shows, and no further pass is requested', async () => {
    const download = vi.fn();
    const base = createDirectConvertEngine();
    seen = [];
    let spoil = true;
    const engine: ConvertEngine = {
      ...base,
      convert: (b) => {
        seen.push(b);
        // the converter sees today's cells differ from the count the answer was given for
        const sheets = spoil ? b.sheets.map((x) => (x.countTexts === undefined ? x : { ...x, countTexts: Object.fromEntries(Object.entries(x.countTexts).map(([k, a]) => [k, { ...a, count: a.count + 1 }])) })) : b.sheets;
        return base.convert({ ...b, sheets });
      },
    };
    const view = render(<ConvertPage engine={engine} download={download} downloadFile={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'hauls.csv', text: FILE }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    const confirm = screen.queryByRole('button', { name: /Confirm all shown/ });
    if (confirm !== null) fireEvent.click(confirm);
    for (const kind of screen.queryAllByLabelText(T['convert.quantity.kind'])) fireEvent.change(kind, { target: { value: 'count' } });
    await idle();
    const before = seen.length;
    fireEvent.click(button(itemOf('CONV-TEXT-IN-TAXON-CELL', 'absent'), T['convert.finding.countAbsence']));
    await waitFor(() => expect(seen.length).toBeGreaterThan(before));
    spoil = false;
    await waitFor(() => expect(lastSheet().countTexts).toBeUndefined());
    await idle();
    expect(asked()).toHaveLength(2);
    const settled = seen.length;
    await new Promise((r) => setTimeout(r, 400));
    await idle();
    expect(seen.length).toBe(settled);
    expect(seen.length - before).toBe(2);
  });

  it('the page key of a per-text answer is the converter key', async () => {
    const core = await import('../../src/core/convert/build');
    expect(countTextKeyOf(6, 'a b')).toBe(core.countTextKey(6, 'a b'));
  });

  it('the request holds both slots only when answered', async () => {
    const p = await parsed(FILE);
    const choices = initialChoices(p);
    const key = Object.keys(choices)[0];
    const body = (c: typeof choices): ReturnType<typeof requestOf> => requestOf({ parsed: p, mappings: {}, choices: c, options: { fullList: false, prefixStation: false, flatten: { station: false, cruise: false } }, approved: {}, confirmed: {}, joins: [] } as never);
    expect(body(choices).sheets[0].countTexts).toBeUndefined();
    const b = body({ ...choices, [key]: { ...choices[key], countTexts: { '6\u001fabsent': { answer: 'absence', count: 1 } }, countTextColumns: { 6: { answer: 'present', count: 2 } } } });
    expect(b.sheets[0].countTexts).toEqual({ '6\u001fabsent': { answer: 'absence', count: 1 } });
    expect(b.sheets[0].countTextColumns).toEqual({ 6: { answer: 'present', count: 2 } });
  });
});
