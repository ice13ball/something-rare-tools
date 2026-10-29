// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// A replicate column on the /convert page: it starts ignored (nothing changes by itself), a colliding ID names it and offers a button, the button gives it the role, and only then the event
// tree has replicate events. Synthetic data only.
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
  ['A-2_5', 'A-2', '2015-03-04', -62.1, -58.3, 'B', 'Asterias rubens', 4],
  ['A-2_5', 'A-2', '2015-03-04', -62.1, -58.3, 'A', 'Asterias rubens', 2],
  ['A-2_5', 'A-2', '2015-03-04', -62.1, -58.3, 'C', 'Ophiura ophiura', 1],
]);
const UNIQUE = csvOf(['Sample ID', 'Station', 'Date', 'Latitude', 'Longitude', 'Replicate', 'Species', 'Abundance'], [
  ['A-2_5a', 'A-2', '2015-03-04', -62.1, -58.3, 'a', 'Asterias rubens', 4],
  ['A-2_5b', 'A-2', '2015-03-04', -62.1, -58.3, 'b', 'Asterias rubens', 2],
]);
const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const treeText = (): string => screen.getByRole('region', { name: T['convert.tree.title'] }).textContent ?? '';

async function load(text: string): Promise<void> {
  const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={vi.fn()} />);
  chooseFiles(view.container, [{ name: 'frames.csv', text }]);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  await idle();
}

describe('the replicate role on the page', () => {
  it('Frame starts ignored; the duplicate names it; the button gives it the role and the tree gets 3 replicate events', async () => {
    await load(CSV);
    const frame = screen.getByLabelText(/Frame/, { selector: 'select' }) as HTMLSelectElement;
    expect(frame.value).toBe('ignore');
    expect(within(frame).getByRole('option', { name: T['role.replicate'] })).toBeTruthy();
    await waitFor(() => expect(document.body.textContent).toMatch(/differ in the ignored column "Frame"/));
    expect(treeText()).not.toMatch(/replicate event/);
    fireEvent.click(screen.getByRole('button', { name: 'Use "Frame" as replicate / sub-sample' }));
    await idle();
    await waitFor(() => expect(treeText()).toMatch(/3 replicate events/));
    expect((screen.getByLabelText(/Frame/, { selector: 'select' }) as HTMLSelectElement).value).toBe('replicate');
    expect(document.body.textContent).not.toMatch(/same identifier is produced more than once/);
  });

  it('unique sample codes: the Replicate column changes nothing and nothing is asked', async () => {
    await load(UNIQUE);
    expect((screen.getByLabelText(/Replicate/, { selector: 'select' }) as HTMLSelectElement).value).not.toBe('replicate');
    expect(treeText()).not.toMatch(/replicate event/);
    expect(screen.queryByRole('button', { name: /as replicate/ })).toBeNull();
  });
});
