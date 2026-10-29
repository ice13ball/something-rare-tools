// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// A replicate column on the /convert page: the role is proposed from the header and offered in the role list, the event tree counts the replicates, and without the role the duplicate
// message names the column. Synthetic data only.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { chooseFiles, csvOf } from './convertHelpers';

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const CSV = csvOf(['Sample ID', 'Station', 'Date', 'Latitude', 'Longitude', 'Frame', 'Species', 'Abundance'], [
  ['S-1_6', 'S-1', '2010-12-06', -62.1, -58.3, 'B', 'Sterechinus neumayeri', 4],
  ['S-1_6', 'S-1', '2010-12-06', -62.1, -58.3, 'A', 'Sterechinus neumayeri', 2],
  ['S-1_6', 'S-1', '2010-12-06', -62.1, -58.3, 'C', 'Psilaster charcoti', 1],
]);
const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));

async function load(): Promise<void> {
  const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={vi.fn()} />);
  chooseFiles(view.container, [{ name: 'frames.csv', text: CSV }]);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  await idle();
}

describe('the replicate role on the page', () => {
  it('Frame starts as Replicate / sub-sample, the tree counts 3 replicate events, and nothing is said about a duplicate', async () => {
    await load();
    const frame = screen.getByLabelText(/Frame/, { selector: 'select' }) as HTMLSelectElement;
    expect(frame.value).toBe('replicate');
    expect(within(frame).getByRole('option', { name: T['role.replicate'] })).toBeTruthy();
    const tree = screen.getByRole('region', { name: T['convert.tree.title'] }).textContent ?? '';
    expect(tree).toMatch(/3 replicate events/);
    expect(document.body.textContent).not.toMatch(/same identifier is produced more than once/);
  });

  it('taking the role away gives the duplicate message that names the column', async () => {
    await load();
    fireEvent.change(screen.getByLabelText(/Frame/, { selector: 'select' }), { target: { value: 'ignore' } });
    await idle();
    await waitFor(() => expect(document.body.textContent).toMatch(/differ in the ignored column "Frame"/));
    expect(document.body.textContent).toMatch(/Replicate \/ sub-sample/);
  });
});
