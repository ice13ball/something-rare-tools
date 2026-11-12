// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// A Year beside the date and a running number are not read as measurements; the page names them with the reason and "Read it as a measurement" gives the role back with one click. Every value is invented.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const TAXA = ['Solea solea', 'Gadus morhua'];
const CSV = csvOf(
  ['Sample', 'Year', 'Date', 'SampleNo', 'Station', 'Latitude', 'Longitude', 'Species', 'Count'],
  Array.from({ length: 8 }, (_, i) => {
    const s = Math.floor(i / 2);
    return [`s${s + 1}`, 2002 + s, `${2002 + s}-06-0${s + 1}`, 20200101 + s * 101, `ST${s + 1}`, 54.1 + s / 10, 7.2 + s / 10, TAXA[i % 2], 3 + i];
  }),
);
const select = (name: string): HTMLSelectElement => screen.getByLabelText(`${name}: Meaning`) as HTMLSelectElement;

describe('Read it as a measurement', () => {
  it('names both columns with the reason, and one click gives each the measurement role back', async () => {
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'catch.csv', text: CSV }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    const confirmAll = screen.queryByRole('button', { name: /Confirm all shown/ });
    if (confirmAll !== null) fireEvent.click(confirmAll);
    await waitFor(() => expect(select('Year').value).toBe('ignore'));
    expect(select('SampleNo').value).toBe('ignore');
    const button = (column: string): Promise<HTMLElement> => screen.findByRole('button', { name: `Read "${column}" as a measurement` });
    await waitFor(() => expect(document.querySelector('[data-rule="CONV-COLUMN-YEAR-IGNORED"]')?.textContent).toContain('Looks like a year beside the date'));
    expect(document.querySelector('[data-rule="CONV-COLUMN-NUMBER-IGNORED"]')?.textContent).toContain('Looks like a running number: whole numbers only, all different');
    expect(document.querySelector('[data-rule="CONV-COLUMN-IGNORED"]')?.textContent).toContain('Year');
    fireEvent.click(await button('SampleNo'));
    await waitFor(() => expect(select('SampleNo').value).toBe('variable'));
    expect(select('Year').value).toBe('ignore');
    await waitFor(() => expect(document.querySelector('[data-rule="CONV-COLUMN-NUMBER-IGNORED"]')).toBeNull());
    fireEvent.click(await button('Year'));
    await waitFor(() => expect(select('Year').value).toBe('variable'));
  });
});
