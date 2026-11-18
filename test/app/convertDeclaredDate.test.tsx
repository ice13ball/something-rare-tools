// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Round 3, Task 17, on the page: a sheet on which no sample has a date offers one date or period (CONV-EVENT-DATE-MISSING, whole sheet only); never prefilled from a name or a value;
// the companion file keeps it for the same sheet name and row count and says so, and a stale one is shown as not applied. Every value is invented.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import type { ConvertEngine, ConvertRequestBody } from '../../src/worker/convert.protocol';
import { chooseFiles, csvOf } from './convertHelpers';

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });
beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const H = ['Sample', 'Latitude', 'Longitude', 'Species', 'Count'];
const NO_DATE = csvOf(H, [['T1', 55.1, 3.2, 'Calanus finmarchicus', 4], ['T2', 55.2, 3.3, 'Calanus finmarchicus', 5]]);
const MORE = csvOf(H, [['T1', 55.1, 3.2, 'Calanus finmarchicus', 4], ['T2', 55.2, 3.3, 'Calanus finmarchicus', 5], ['T3', 55.3, 3.4, 'Calanus finmarchicus', 6]]);
const MIXED = csvOf([...H, 'Date'], [['T1', 55.1, 3.2, 'Calanus finmarchicus', 4, '2023-04-05'], ['T2', 55.2, 3.3, 'Calanus finmarchicus', 5, '']]);
const SHEET = 'tanks-2021-05.csv';

interface Run {
  bodies: ConvertRequestBody[];
  download: ReturnType<typeof vi.fn>;
}
const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
async function load(files: { name: string; text: string }[]): Promise<Run> {
  const base = createDirectConvertEngine();
  const bodies: ConvertRequestBody[] = [];
  const engine: ConvertEngine = { ...base, convert: (b) => (bodies.push(b), base.convert(b)) };
  const download = vi.fn();
  const view = render(<ConvertPage engine={engine} download={download} downloadFile={vi.fn()} />);
  chooseFiles(view.container, files);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  const confirm = screen.queryByRole('button', { name: /Confirm all shown/ });
  if (confirm !== null) fireEvent.click(confirm);
  for (const kind of screen.queryAllByLabelText(T['convert.quantity.kind'])) fireEvent.change(kind, { target: { value: 'count' } });
  await idle();
  return { bodies, download };
}
const item = (rule: string): HTMLElement | null => document.querySelector(`li[data-rule="${rule}"]`);
const last = (r: Run): ConvertRequestBody['sheets'][number] => r.bodies[r.bodies.length - 1].sheets[0];
const typeDate = (value: string): void => void fireEvent.change(screen.getByLabelText(T['convert.date.label']), { target: { value } });

describe('the declared date on the page', () => {
  it('the button opens the field, which starts empty even with a date in the file name; the typed text is sent and CONV-DATE-DECLARED replaces the missing-date finding', async () => {
    const run = await load([{ name: SHEET, text: NO_DATE }]);
    expect(last(run).declaredDate).toBeUndefined();
    fireEvent.click(within(item('CONV-EVENT-DATE-MISSING')!).getByRole('button', { name: T['convert.finding.declareDate'] }));
    const input = screen.getByLabelText(T['convert.date.label']) as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('');
    typeDate('2021-05');
    await waitFor(() => expect(last(run).declaredDate).toBe('2021-05'));
    expect(last(run).declaredDateFromFile).toBeUndefined();
    await idle();
    await waitFor(() => expect(item('CONV-DATE-DECLARED')).not.toBeNull());
    expect(item('CONV-EVENT-DATE-MISSING')).toBeNull();
    // the field stays once the finding is gone
    expect((screen.getByLabelText(T['convert.date.label']) as HTMLInputElement).value).toBe('2021-05');
  });

  it('a value that is not a date blocks with its reason and the typed text', async () => {
    const run = await load([{ name: SHEET, text: NO_DATE }]);
    fireEvent.click(within(item('CONV-EVENT-DATE-MISSING')!).getByRole('button', { name: T['convert.finding.declareDate'] }));
    typeDate('2021-13');
    await waitFor(() => expect(item('CONV-DATE-DECLARED-INVALID')).not.toBeNull());
    await idle();
    expect(item('CONV-DATE-DECLARED-INVALID')!.textContent).toContain('2021-13');
    expect(item('CONV-DATE-DECLARED-INVALID')!.textContent).toContain('write it as YYYY, YYYY-MM or YYYY-MM-DD');
    expect((screen.getByLabelText(T['convert.date.label']) as HTMLInputElement).placeholder).toBe(T['convert.date.placeholder']);
    expect(last(run).declaredDate).toBe('2021-13');
  });

  it('a sheet where some samples have a date offers no field', async () => {
    await load([{ name: SHEET, text: MIXED }]);
    expect(item('CONV-EVENT-DATE-MISSING')).not.toBeNull();
    expect(within(item('CONV-EVENT-DATE-MISSING')!).queryByRole('button', { name: T['convert.finding.declareDate'] })).toBeNull();
    expect(screen.queryByLabelText(T['convert.date.label'])).toBeNull();
  });

  it('the companion file keeps the date; a reload fills it, says it is from the file, and Undo empties it', async () => {
    const run = await load([{ name: SHEET, text: NO_DATE }]);
    fireEvent.click(within(item('CONV-EVENT-DATE-MISSING')!).getByRole('button', { name: T['convert.finding.declareDate'] }));
    typeDate('2020-01-01/2021-12-31');
    await waitFor(() => expect(last(run).declaredDate).toBeDefined());
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const text = run.download.mock.calls[0][0] as string;
    expect(text).toContain(`declaredDate=2020-01-01/2021-12-31:2:${SHEET}`);
    cleanup();
    const again = await load([{ name: SHEET, text: NO_DATE }, { name: 'c.csv', text }]);
    expect(last(again).declaredDate).toBe('2020-01-01/2021-12-31');
    expect(last(again).declaredDateFromFile).toBe(true);
    expect(screen.getByTestId('date-from-file')).toBeTruthy();
    await waitFor(() => expect(item('CONV-DATE-DECLARED')?.textContent).toContain('companion file'));
    fireEvent.click(within(screen.getByTestId('date-from-file')).getByRole('button', { name: T['convert.date.undo'] }));
    await waitFor(() => expect(last(again).declaredDate).toBeUndefined());
    expect(item('CONV-EVENT-DATE-MISSING')).not.toBeNull();
  });

  it('a stale companion date (another row count) is not applied, and the page says so', async () => {
    const run = await load([{ name: SHEET, text: NO_DATE }]);
    fireEvent.click(within(item('CONV-EVENT-DATE-MISSING')!).getByRole('button', { name: T['convert.finding.declareDate'] }));
    typeDate('2021-05');
    await waitFor(() => expect(last(run).declaredDate).toBe('2021-05'));
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const text = run.download.mock.calls[0][0] as string;
    cleanup();
    const again = await load([{ name: SHEET, text: MORE }, { name: 'c.csv', text }]);
    expect(last(again).declaredDate).toBeUndefined();
    expect(screen.getByTestId('date-stale')).toBeTruthy();
    expect((screen.getByLabelText(T['convert.date.label']) as HTMLInputElement).value).toBe('');
    expect(item('CONV-EVENT-DATE-MISSING')).not.toBeNull();
  });

  it('declared, then the real dates filled in, then reloaded with the companion file: the date is held back and said, nothing blocks', async () => {
    const run = await load([{ name: SHEET, text: NO_DATE }]);
    fireEvent.click(within(item('CONV-EVENT-DATE-MISSING')!).getByRole('button', { name: T['convert.finding.declareDate'] }));
    typeDate('2021-05');
    await waitFor(() => expect(last(run).declaredDate).toBe('2021-05'));
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const text = run.download.mock.calls[0][0] as string;
    cleanup();
    const FILLED = csvOf([...H, 'Date'], [['T1', 55.1, 3.2, 'Calanus finmarchicus', 4, '2023-04-05'], ['T2', 55.2, 3.3, 'Calanus finmarchicus', 5, '2023-04-06']]);
    const again = await load([{ name: SHEET, text: FILLED }, { name: 'c.csv', text }]);
    expect(last(again).declaredDateFromFile).toBe(true);
    await waitFor(() => expect(item('CONV-DATE-DECLARED-HELD')).not.toBeNull());
    expect(item('CONV-DATE-DECLARED-INVALID')).toBeNull();
    expect(item('CONV-DATE-DECLARED-HELD')!.textContent).toContain('companion file');
    expect(screen.getByTestId('date-from-file')).toBeTruthy();
    fireEvent.click(within(screen.getByTestId('date-from-file')).getByRole('button', { name: T['convert.date.undo'] }));
    await waitFor(() => expect(item('CONV-DATE-DECLARED-HELD')).toBeNull());
  });
});
