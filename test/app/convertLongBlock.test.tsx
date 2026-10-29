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
// one parameter only: the converter does not read it as a long sheet (fewer than two parameters), so it still ends in the block
const LONG_ROWS: Cell[][] = [
  ['ZL1', '2020-05-01', 70.1, 20.2, 5, 'Temperature', 'degC', 4.1],
  ['ZL1', '2020-05-01', 70.1, 20.2, 10, 'Temperature', 'degC', 3.9],
  ['ZL2', '2020-05-02', 70.3, 20.4, 5, 'Temperature', 'degC', 4.4],
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
    expect(document.body.textContent).toContain('fewer than two different values');
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

/* ---- a long environmental sheet that CAN be read: one row per sample, its columns in the role table ---- */
const PIV_H = ['Station', 'Bottle', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Parameter', 'Unit', 'Value'];
const PIV_ROWS: Cell[][] = [
  ['ZL1', 'B1', '2020-05-01', 70.1, 20.2, 5, 'Temperature', 'degC', 4.1],
  ['ZL1', 'B1', '2020-05-01', 70.1, 20.2, 5, 'Salinity', 'PSU', 33.1],
  ['ZL1', 'B1', '2020-05-01', 70.1, 20.2, 5, 'Salinity_QC', '', 1],
  ['ZL1', 'B2', '2020-05-01', 70.1, 20.2, 10, 'Temperature', 'degC', 3.9],
  ['ZL1', 'B2', '2020-05-01', 70.1, 20.2, 10, 'Salinity', 'PSU', 33.4],
];

describe('a long environmental sheet on the /convert page', () => {
  it('is read as one row per sample when the file is read: the note, the pivoted columns in the role table, no block', async () => {
    await load('piv.csv', PIV_H, PIV_ROWS);
    expect(document.body.textContent).not.toContain(LONG_TEXT);
    expect(document.body.textContent).toContain('has one row per measurement');
    expect(document.body.textContent).toContain('It was read as 2 samples');
    expect(document.body.textContent).toContain('Salinity_QC');
    expect(document.body.textContent).toContain('no value is summed, averaged or rounded');
    // the pivoted columns are columns like any other
    expect(screen.getByLabelText('Temperature [degC]: Meaning')).toBeTruthy();
    expect(screen.getByLabelText('Salinity [PSU]: Meaning')).toBeTruthy();
    expect(document.querySelector('[data-tip="convertPivot"]')).toBeTruthy();
  });

  it('converts: marked as a profile file, its samples become levels with measurements and nothing says "long layout"', async () => {
    await load('piv2.csv', PIV_H, PIV_ROWS);
    fireEvent.click(screen.getByLabelText(T['convert.sheet.profile']));
    await idle();
    await waitFor(() => expect(document.body.textContent).toContain('2 profile level events'));
    expect(document.body.textContent).not.toContain(LONG_TEXT);
    expect(document.body.textContent).not.toContain('more than once');
  });

  it('can be read as a normal table instead (one tick), which gives back the columns of the file and the block of production; unticking pivots it again', async () => {
    await load('opt.csv', PIV_H, PIV_ROWS);
    expect(screen.getByLabelText('Temperature [degC]: Meaning')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(T['convert.pivot.off']));
    await waitFor(() => expect(screen.getByLabelText('Parameter: Meaning')).toBeTruthy());
    expect(screen.getByLabelText('Value: Meaning')).toBeTruthy();
    expect(screen.queryByLabelText('Temperature [degC]: Meaning')).toBeNull();
    expect(document.body.textContent).toContain(T['convert.pivot.offNote']);
    await idle();
    await waitFor(() => expect(document.body.textContent).toContain(LONG_TEXT));
    // the production way out still works: another meaning for the value column lifts the block
    fireEvent.change(screen.getByLabelText('Value: Meaning'), { target: { value: 'ignore' } });
    await idle();
    await waitFor(() => expect(document.body.textContent).not.toContain(LONG_TEXT));
    // and back
    fireEvent.click(screen.getByLabelText(T['convert.pivot.off']));
    await waitFor(() => expect(screen.getByLabelText('Temperature [degC]: Meaning')).toBeTruthy());
    expect(screen.queryByLabelText('Parameter: Meaning')).toBeNull();
    await idle();
    expect(document.body.textContent).not.toContain(LONG_TEXT);
  });

  it('a per-row column splits the samples; marking it as describing the measurement removes it from the key, and unmarking brings it back', async () => {
    const H = [...PIV_H, 'Comment'];
    const rows: Cell[][] = PIV_ROWS.filter((r) => r[6] !== 'Salinity_QC').map((r) => [...r, r[6] === 'Temperature' ? 'checked' : 'late sample']);
    await load('cmt.csv', H, rows);
    fireEvent.click(screen.getByLabelText(T['convert.sheet.profile']));
    await idle();
    expect(screen.getByLabelText('Comment: Meaning')).toBeTruthy();
    await waitFor(() => expect(document.body.textContent).toContain('differ in Comment'));
    const box = screen.getByLabelText('Comment: describes the measurement, not the sample') as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    await waitFor(() => expect(screen.queryByLabelText('Comment: Meaning')).toBeNull());
    expect((screen.getByLabelText('Comment: describes the measurement, not the sample') as HTMLInputElement).checked).toBe(true);
    expect(document.body.textContent).toContain('columns you marked as describing the measurement');
    expect(document.body.textContent).not.toContain('differ in Comment');
    fireEvent.click(screen.getByLabelText('Comment: describes the measurement, not the sample'));
    await waitFor(() => expect(screen.getByLabelText('Comment: Meaning')).toBeTruthy());
  });

  it('a re-read of the sheet clears what was typed for its columns in the NVS search (the columns have other indexes now)', async () => {
    const H = [...PIV_H, 'Comment'];
    const rows: Cell[][] = PIV_ROWS.filter((r) => r[6] !== 'Salinity_QC').map((r) => [...r, r[6] === 'Temperature' ? 'checked' : 'late sample']);
    await load('nvs.csv', H, rows);
    fireEvent.click(screen.getByLabelText(T['convert.sheet.profile']));
    await idle();
    fireEvent.click(await screen.findByRole('checkbox', { name: T['convert.nvs.optin'] }));
    const word = (col: string): HTMLInputElement => screen.getByLabelText(T['convert.nvs.word.type.aria'].replace('{header}', col)) as HTMLInputElement;
    fireEvent.change(word('Temperature [degC]'), { target: { value: 'temperature' } });
    expect(word('Temperature [degC]').value).toBe('temperature');
    fireEvent.click(screen.getByLabelText('Comment: describes the measurement, not the sample'));
    await waitFor(() => expect(screen.queryByLabelText('Comment: Meaning')).toBeNull());
    await idle();
    expect(word('Temperature [degC]').value).toBe('');
    expect(word('Salinity [PSU]').value).toBe('');
  });

  it('a sample with the same parameter and unit on two rows blocks, and the text names the original lines', async () => {
    const rows: Cell[][] = [...PIV_ROWS, ['ZL1', 'B2', '2020-05-01', 70.1, 20.2, 10, 'Temperature', 'degC', 3.95]];
    await load('dup.csv', PIV_H, rows);
    fireEvent.click(screen.getByLabelText(T['convert.sheet.profile']));
    await idle();
    await waitFor(() => expect(document.body.textContent).toContain('has the parameter "Temperature [degC]" more than once'));
    expect(document.body.textContent).toContain('lines 5, 7');
  });
});
