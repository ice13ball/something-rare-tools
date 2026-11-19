// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Round 4, Task 17: a text in a count column ("absent", "nie stwierdzono") is asked text by text (CONV-TEXT-IN-TAXON-CELL): absence, leave out, or present with the text in the remarks, none preselected;
// one answer can be given for a whole column; the answer travels with its count; the companion file keeps it by the HASH of the text, never the text. Every value is invented.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { applySavedCountTexts, countTextSettingsOf, initialChoices, requestOf } from '../../src/app/convertModel';
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
    expect(lastSheet().countTexts).toEqual({ absent: { answer: 'absence', count: 1 } });
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
    expect(lastSheet().countTexts).toEqual({ absent: { answer: 'leave-out', count: 2 } });
    expect(decided()[0].getAttribute('data-rule')).toBe('CONV-COUNT-TEXT-DECIDED');
  });

  it('"Present" and "Leave out" are answers of their own', async () => {
    await load([{ name: 'hauls.csv', text: FILE }]);
    fireEvent.click(button(itemOf('CONV-TEXT-IN-TAXON-CELL', 'absent'), T['convert.finding.countPresent']));
    await waitFor(() => expect(decided()).toHaveLength(1));
    fireEvent.click(button(itemOf('CONV-TEXT-IN-TAXON-CELL', 'nie stwierdzono'), T['convert.finding.countLeaveOut']));
    await waitFor(() => expect(decided()).toHaveLength(2));
    await idle();
    expect(lastSheet().countTexts).toEqual({ absent: { answer: 'present', count: 1 }, 'nie stwierdzono': { answer: 'leave-out', count: 1 } });
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
    expect(lastSheet().countTexts).toEqual({ 'not found': { answer: 'present', count: 1 } });
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
    expect(lastSheet().countTexts).toEqual({ 'not found': { answer: 'present', count: 1 } });
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
    expect(lastSheet().countTexts).toEqual({ 'not found': { answer: 'present', count: 1 } });
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
    expect(text).toContain(`countText=absence:1:4:hauls.csv:${shortHash('tabsent')}`);
    expect(text).not.toContain('absent');
    expect(text).not.toContain('nie stwierdzono');
    expect(text).not.toContain('countText=leave-out');
  });

  it('is applied again from the file (fromFile) for the same sheet, rows, text and cells; the other text is still asked', async () => {
    const text = await answered();
    cleanup();
    await load([{ name: 'hauls.csv', text: FILE }, { name: 'c.csv', text }]);
    await waitFor(() => expect(decided()).toHaveLength(1));
    await idle();
    expect(lastSheet().countTexts).toEqual({ absent: { answer: 'absence', count: 1, fromFile: true } });
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
    const text = writeConvertSidecar({ countText: [{ sheet: 'hauls.csv', answer: 'absence', count: 1, rows: 7, hash: shortHash('tabsent') }] });
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

  it('a whole-column answer is written as one line per text it settled', async () => {
    const run = await load([{ name: 'hauls.csv', text: csvOf(HEADER, rowsOf([5, 6, 7, 8, 'absent', 'none seen', 'not found'])) }]);
    fireEvent.click(within(document.querySelector<HTMLElement>('[data-testid="count-text-column"]')!).getByRole('button', { name: T['convert.finding.countAbsence'] }));
    await waitFor(() => expect(decided()).toHaveLength(3));
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const text = run.download.mock.calls[0][0] as string;
    for (const w of ['absent', 'none seen', 'not found']) expect(text).toContain(`countText=absence:1:7:hauls.csv:${shortHash('t' + w)}`);
    expect(text).not.toContain('none seen');
  });

  it('settings: only a decided text of a sheet is recorded; applySavedCountTexts matches by hash and count and uses a saved answer once', async () => {
    const saved = writeConvertSidecar({ countText: [{ sheet: 'hauls.csv', answer: 'present', count: 1, rows: 4, hash: shortHash('tabsent') }, { sheet: 'hauls.csv', answer: 'absence', count: 9, rows: 4, hash: shortHash('tnie stwierdzono') }] });
    const p = await parsed(FILE, saved);
    const choices = initialChoices(p);
    const key = Object.keys(choices)[0];
    expect(choices[key].countTextsSaved).toHaveLength(2);
    expect(choices[key].countTexts).toBeUndefined();
    const q = (value: string, held: number): never => ({ ruleId: 'CONV-TEXT-IN-TAXON-CELL', file: 'hauls.csv', sheet: 'hauls.csv', value, params: { held, count: held } }) as never;
    const out = applySavedCountTexts(p, choices, [q('absent', 1), q('nie stwierdzono', 1)]);
    expect(out[key].countTexts).toEqual({ absent: { answer: 'present', count: 1, fromFile: true } });
    expect(out[key].countTextsSaved).toHaveLength(1);
    expect(applySavedCountTexts(p, out, [q('absent', 1)])).toBe(out);
    const said = [{ ruleId: 'CONV-COUNT-TEXT-DECIDED', file: 'hauls.csv', sheet: 'hauls.csv', value: 'absent', params: { held: 1, answer: 'present' } }, { ruleId: 'CONV-COUNT-TEXT-DECIDED', file: 'other.csv', sheet: 'x', value: 'absent', params: { held: 1, answer: 'present' } }] as never;
    expect(countTextSettingsOf(p, said)).toEqual([{ sheet: 'hauls.csv', answer: 'present', count: 1, rows: 4, hash: shortHash('tabsent') }]);
    expect(countTextSettingsOf(p, [])).toEqual([]);
  });

  it('the request holds both slots only when answered', async () => {
    const p = await parsed(FILE);
    const choices = initialChoices(p);
    const key = Object.keys(choices)[0];
    const body = (c: typeof choices): ReturnType<typeof requestOf> => requestOf({ parsed: p, mappings: {}, choices: c, options: { fullList: false, prefixStation: false, flatten: { station: false, cruise: false } }, approved: {}, confirmed: {}, joins: [] } as never);
    expect(body(choices).sheets[0].countTexts).toBeUndefined();
    const b = body({ ...choices, [key]: { ...choices[key], countTexts: { absent: { answer: 'absence', count: 1 } }, countTextColumns: { 6: { answer: 'present', count: 2 } } } });
    expect(b.sheets[0].countTexts).toEqual({ absent: { answer: 'absence', count: 1 } });
    expect(b.sheets[0].countTextColumns).toEqual({ 6: { answer: 'present', count: 2 } });
  });
});
