// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Round 4, Task 13 fix round 1, on the page: -99, -999 and -9999 in a depth or measurement column BLOCK the export (ROW-MISSING-CODE) until the person answers "Treat as missing" for the column; "Ask again" takes the
// answer back, and the companion file keeps it as a header hash and the sheet's row count. Every value is invented.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { initialChoices, missingCodeSettingsOf } from '../../src/app/convertModel';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { keyHashes } from '../../src/core/convert/keySetting';
import { writeConvertSidecar } from '../../src/core/convert/settings';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import type { ConvertParseResult } from '../../src/worker/convert.protocol';
import { chooseFiles } from './convertHelpers';

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const HEADER = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Depth [m]', 'Species', 'Count'];
const DEPTH = 5;
const ROWS = ['S1,k1,2023-06-14,55.5,3.5,5,Calanus finmarchicus,4', 'S1,k2,2023-06-14,55.5,3.5,-999,Calanus finmarchicus,5', 'S1,k3,2023-06-14,55.5,3.5,10,Calanus finmarchicus,6'];
const TEXT = [HEADER.join(','), ...ROWS].join('\n') + '\n';

async function load(files: { name: string; text: string }[]): Promise<{ download: ReturnType<typeof vi.fn> }> {
  const download = vi.fn();
  const view = render(<ConvertPage engine={createDirectConvertEngine()} download={download} downloadFile={vi.fn()} />);
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
const item = (rule: string): HTMLElement | null => document.querySelector(`li[data-rule="${rule}"]`);
const button = (root: HTMLElement, name: string): HTMLElement => within(root).getByRole('button', { name });

describe('the question and the answer', () => {
  it('blocks until "Treat as missing"; the answer becomes CONV-MISSING-CODE-DECLARED; "Ask again" opens the question again', async () => {
    await load([{ name: 'hauls.csv', text: TEXT }]);
    expect(item('ROW-MISSING-CODE')?.closest('.convert-findings')?.getAttribute('data-kind')).toBe('error');
    expect(item('CONV-MISSING-CODE-DECLARED')).toBeNull();
    fireEvent.click(button(item('ROW-MISSING-CODE')!, T['convert.finding.missingCode']));
    await waitFor(() => expect(item('CONV-MISSING-CODE-DECLARED')).not.toBeNull());
    await idle();
    expect(item('ROW-MISSING-CODE')).toBeNull();
    expect(item('CONV-MISSING-CODE-DECLARED')?.closest('.convert-findings')?.getAttribute('data-kind')).toBe('info');
    fireEvent.click(button(item('CONV-MISSING-CODE-DECLARED')!, T['convert.finding.askAgain']));
    await waitFor(() => expect(item('ROW-MISSING-CODE')).not.toBeNull());
    expect(item('CONV-MISSING-CODE-DECLARED')).toBeNull();
  });
});

describe('the second answer: these are real values', () => {
  it('"These are real values" is its own answer: the note says so, "Ask again" opens the question, and the companion file keeps real', async () => {
    const run = await load([{ name: 'hauls.csv', text: TEXT }]);
    // neither answer is selected: both buttons are offered
    expect(button(item('ROW-MISSING-CODE')!, T['convert.finding.realCode'])).not.toBeNull();
    expect(item('ROW-MISSING-CODE')?.textContent).toContain('waits for your answer');
    fireEvent.click(button(item('ROW-MISSING-CODE')!, T['convert.finding.realCode']));
    await waitFor(() => expect(item('CONV-MISSING-CODE-DECLARED')).not.toBeNull());
    await idle();
    expect(item('ROW-MISSING-CODE')).toBeNull();
    expect(item('CONV-MISSING-CODE-DECLARED')?.textContent).toContain('real values');
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    expect(run.download.mock.calls[0][0]).toContain(`missingCode=real:hauls.csv:${keyHashes(HEADER, [DEPTH])}:3`);
    fireEvent.click(button(item('CONV-MISSING-CODE-DECLARED')!, T['convert.finding.askAgain']));
    await waitFor(() => expect(item('ROW-MISSING-CODE')).not.toBeNull());
  });

  it('a companion file with real is applied for the same column and rows, and says so', async () => {
    await load([{ name: 'hauls.csv', text: TEXT }, { name: 'c.csv', text: writeConvertSidecar({ missingCode: [{ sheet: 'hauls.csv', answer: 'real', hash: keyHashes(HEADER, [DEPTH])!, rows: 3 }] }) }]);
    await waitFor(() => expect(item('CONV-MISSING-CODE-DECLARED')?.textContent).toContain('real values'));
    expect(item('CONV-MISSING-CODE-DECLARED')?.textContent).toContain('companion file');
  });

  it('the preview shows one question for the column, not a copy per output column', async () => {
    await load([{ name: 'hauls.csv', text: TEXT }]);
    expect(document.querySelectorAll('li[data-rule="ROW-MISSING-CODE"]').length).toBe(1);
  });
});

describe('the companion file', () => {
  const line = (rows: number, header = HEADER, answer: 'missing' | 'real' = 'missing') => writeConvertSidecar({ missingCode: [{ sheet: 'hauls.csv', answer, hash: keyHashes(header, [DEPTH])!, rows }] });
  const parsed = (text: string, companion?: string): Promise<ConvertParseResult> =>
    createDirectConvertEngine().parse([{ name: 'hauls.csv', bytes: new TextEncoder().encode(text), source: 'dropped' }, ...(companion === undefined ? [] : [{ name: 'c.csv', bytes: new TextEncoder().encode(companion), source: 'dropped' as const }])]);

  it('writes the answer by header hash and row count, never the header text or a value', async () => {
    const run = await load([{ name: 'hauls.csv', text: TEXT }]);
    fireEvent.click(button(item('ROW-MISSING-CODE')!, T['convert.finding.missingCode']));
    await waitFor(() => expect(item('CONV-MISSING-CODE-DECLARED')).not.toBeNull());
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const text = run.download.mock.calls[0][0] as string;
    expect(text).toContain(`missingCode=missing:hauls.csv:${keyHashes(HEADER, [DEPTH])}:3`);
    expect(text).not.toMatch(/Depth|-999/);
  });

  it('is applied for the same column and rows ("from the file", with "Ask again")', async () => {
    await load([{ name: 'hauls.csv', text: TEXT }, { name: 'c.csv', text: line(3) }]);
    await waitFor(() => expect(item('CONV-MISSING-CODE-DECLARED')?.textContent).toContain('companion file'));
    expect(item('ROW-MISSING-CODE')).toBeNull();
  });

  it('is not applied, and the question stays open, when a row is added or the header is renamed', async () => {
    const more = TEXT + 'S1,k4,2023-06-14,55.5,3.5,12,Calanus finmarchicus,7\n';
    const run = await load([{ name: 'hauls.csv', text: more }, { name: 'c.csv', text: line(3) }]);
    expect(item('ROW-MISSING-CODE')).not.toBeNull();
    expect(item('CONV-MISSING-CODE-DECLARED')).toBeNull();
    void run;
    const p = await parsed(TEXT.replace('Depth [m]', 'Depth'), line(3));
    const choices = initialChoices(p);
    expect(Object.values(choices).every((c) => c.missingCodes === undefined)).toBe(true);
  });

  it('missingCodeSettingsOf keeps the answer for a sheet in use only', async () => {
    const p = await parsed(TEXT, line(3));
    const choices = initialChoices(p);
    expect(missingCodeSettingsOf(p, choices)).toEqual([{ sheet: 'hauls.csv', answer: 'missing', hash: keyHashes(HEADER, [DEPTH])!, rows: 3 }]);
    const key = `${p.files[0].fileId}\u0000hauls.csv`;
    expect(missingCodeSettingsOf(p, { ...choices, [key]: { ...choices[key], use: false } })).toEqual([]);
  });
});
