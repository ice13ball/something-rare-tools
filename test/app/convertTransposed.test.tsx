// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// A transposed sheet on the /convert page: one blocking message that says what is wrong and how to fix it, one tick "read as a normal table" next to the sheet, the companion file keeps
// the tick, and a normal wide sheet is not offered it. Synthetic data only.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { W1_CSV, chooseFiles, csvOf } from './convertHelpers';

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const TAXA_CSV = csvOf(['Species', 'A1', 'A2', 'A3', 'B1'], [['Calanus finmarchicus', 10, 4, 0, 7], ['Oithona similis', 5, 8, 2, 1], ['Pseudocalanus sp.', 3, 0, 9, 4]]);
const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const sheetBox = (name: string): HTMLElement => screen.getByRole('region', { name: T['convert.sheet.title'].replace('{sheet}', name).replace('{file}', name) });

async function load(files: { name: string; text: string }[]) {
  const download = vi.fn();
  const view = render(<ConvertPage engine={createDirectConvertEngine()} download={download} downloadFile={vi.fn()} />);
  chooseFiles(view.container, files);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  await idle();
  return { download };
}

describe('a transposed sheet on the page', () => {
  it('is one blocking message with the reason and the way out, and the tick lifts it', async () => {
    await load([{ name: 't.csv', text: TAXA_CSV }]);
    const messages = await screen.findAllByText(/species in rows, samples in columns/);
    expect(messages).toHaveLength(1);
    expect(messages[0].textContent).toMatch(/Transpose the table/);
    const tick = within(sheetBox('t.csv')).getByLabelText(T['convert.sheet.asTable']) as HTMLInputElement;
    expect(tick.checked).toBe(false);
    fireEvent.click(tick);
    await idle();
    await waitFor(() => expect(screen.queryAllByText(/species in rows, samples in columns/)).toHaveLength(0));
  });

  it('a normal wide species sheet has no tick and no message', async () => {
    await load([{ name: 'w1.csv', text: W1_CSV }]);
    expect(within(sheetBox('w1.csv')).queryByLabelText(T['convert.sheet.asTable'])).toBeNull();
    expect(screen.queryAllByText(/in rows, samples in columns/)).toHaveLength(0);
  });
});
