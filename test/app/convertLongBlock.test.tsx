// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// CONV-LONG-UNSUPPORTED through the PAGE: the mapping the page sends is not the raw proposal (an unconfirmed taxon candidate goes out as "ignore"), so the block must still
// fire with no edit, and must go away when the user gives the parameter or the value column another meaning. Synthetic data only.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { chooseFiles, csvOf } from './convertHelpers';
import { UI } from '../../src/core/i18n/ui';
import type { Cell } from '../convert/helpers';

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const LONG_H = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Parameter', 'Unit', 'Value'];
const LONG_ROWS: Cell[][] = [
  ['ZL1', '2020-05-01', 70.1, 20.2, 5, 'Temperature', 'degC', 4.1],
  ['ZL1', '2020-05-01', 70.1, 20.2, 5, 'Salinity', 'PSU', 33.1],
  ['ZL1', '2020-05-01', 70.1, 20.2, 10, 'Temperature', 'degC', 3.9],
  ['ZL1', '2020-05-01', 70.1, 20.2, 10, 'Salinity', 'PSU', 33.4],
];
const WIDE_H = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Variable', 'Temperature', 'Result'];
const WIDE_ROWS: Cell[][] = [
  ['ZL1', '2020-05-01', 70.1, 20.2, 5, 'CR1', 4.1, 'ok'],
  ['ZL1', '2020-05-01', 70.1, 20.2, 10, 'CR1', 3.9, 'ok'],
];
const LONG_TEXT = 'is in the long layout';
const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));

async function load(name: string, header: string[], rows: Cell[][]): Promise<void> {
  const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={vi.fn()} />);
  chooseFiles(view.container, [{ name, text: csvOf(header, rows) }]);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  await idle();
}

describe('CONV-LONG-UNSUPPORTED on the /convert page', () => {
  it('fires with no edit, and goes away when the user sets the Value column to ignore', async () => {
    await load('long.csv', LONG_H, LONG_ROWS);
    await waitFor(() => expect(document.body.textContent).toContain(LONG_TEXT));
    expect(document.body.textContent).toContain('"Parameter" and "Value"');
    // the value column is only an unconfirmed taxon candidate; the user gives it another meaning
    fireEvent.change(screen.getByLabelText('Value: Meaning'), { target: { value: 'ignore' } });
    await idle();
    await waitFor(() => expect(document.body.textContent).not.toContain(LONG_TEXT));
  });

  it('goes away when the user changes the Parameter column instead', async () => {
    await load('long2.csv', LONG_H, LONG_ROWS);
    await waitFor(() => expect(document.body.textContent).toContain(LONG_TEXT));
    fireEvent.change(screen.getByLabelText('Parameter: Meaning'), { target: { value: 'sampleId' } });
    await idle();
    await waitFor(() => expect(document.body.textContent).not.toContain(LONG_TEXT));
  });

  it('never fires on a wide sheet with a Variable and a Result column next to a measured variable', async () => {
    await load('wide.csv', WIDE_H, WIDE_ROWS);
    expect(document.body.textContent).not.toContain(LONG_TEXT);
  });
});
