// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// A presence-only species list on the /convert page: off by default, the blocking message offers the tick, the tick lifts it and hides the quantity questions, the companion file keeps it
// by sheet name and a new drop pre-ticks it. Synthetic data only.
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

const LIST = csvOf(['Station', 'Date', 'Latitude', 'Longitude', 'scientificName'], [
  ['ZL1', '2020-05-01', 70.1, 20.2, 'Calanus finmarchicus'],
  ['ZL1', '2020-05-01', 70.1, 20.2, 'Oithona similis'],
]);
const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const sheetBox = (name: string): HTMLElement => screen.getByRole('region', { name: T['convert.sheet.title'].replace('{sheet}', name).replace('{file}', name) });
const blocking = (): string => screen.queryAllByRole('heading', { name: /Must be fixed/ }).map((h) => h.parentElement?.textContent ?? '').join(' ');

async function load(files: { name: string; text: string }[]) {
  const download = vi.fn();
  const view = render(<ConvertPage engine={createDirectConvertEngine()} download={download} downloadFile={vi.fn()} />);
  chooseFiles(view.container, files);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  await idle();
  return { download };
}

describe('the presence-only tick', () => {
  it('is off by default; the message offers it; ticking lifts the block and hides the quantity questions', async () => {
    await load([{ name: 'list.csv', text: LIST }]);
    const box = within(sheetBox('list.csv'));
    const tick = box.getByLabelText(T['convert.sheet.presence']) as HTMLInputElement;
    expect(tick.checked).toBe(false);
    expect(blocking()).toMatch(/tick "This is a list of species found/);
    expect(box.getByLabelText(T['convert.quantity.kind'])).toBeTruthy();
    fireEvent.click(tick);
    await idle();
    await waitFor(() => expect(blocking()).not.toMatch(/lists species without counts/));
    expect(box.queryByLabelText(T['convert.quantity.kind'])).toBeNull();
  });

  it('a sheet with a count column is not offered the tick, and keeps its quantity questions', async () => {
    const counted = csvOf(['Station', 'Date', 'Latitude', 'Longitude', 'scientificName', 'individualCount'], [['ZL1', '2020-05-01', 70.1, 20.2, 'Calanus finmarchicus', 4]]);
    await load([{ name: 'counted.csv', text: counted }]);
    const box = within(sheetBox('counted.csv'));
    expect(box.queryByLabelText(T['convert.sheet.presence'])).toBeNull();
    expect(box.getByLabelText(T['convert.quantity.kind'])).toBeTruthy();
  });

  it('the companion file keeps the tick by sheet name, and a new drop with it pre-ticks the box', async () => {
    const { download } = await load([{ name: 'list.csv', text: LIST }]);
    fireEvent.click(within(sheetBox('list.csv')).getByLabelText(T['convert.sheet.presence']));
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const [text] = download.mock.calls[0] as [string];
    expect(text).toContain('(setting),presenceOnly=list.csv,,,\n');
    expect(text).not.toMatch(/Calanus|ZL1/);
    cleanup();
    await load([{ name: 'list.csv', text: LIST }, { name: 'run.companion.csv', text }]);
    expect((within(sheetBox('list.csv')).getByLabelText(T['convert.sheet.presence']) as HTMLInputElement).checked).toBe(true);
  });
});
