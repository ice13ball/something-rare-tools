// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Stage 7: EVERY taxon name can be edited and approved on the page, not only the ones that need a decision. The names with a doubt stay in the table; the other names
// (a split that needs approval, and the plain names) are in the list under it, open when it is short and folded behind "show all names" when it is long.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { chooseFiles } from './convertHelpers';

vi.setConfig({ testTimeout: 30_000 });
const T = UI.en;

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

async function load(names: string[]): Promise<HTMLElement> {
  const csv = `Sample,Station,Latitude,Longitude,Date,${names.join(',')}\na,S,55,3,2020-01-01,${names.map(() => '3').join(',')}\n`;
  const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} />);
  chooseFiles(view.container, [{ name: 'b.csv', text: csv }]);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  const confirm = screen.queryByRole('button', { name: /^Confirm all shown/ });
  if (confirm) fireEvent.click(confirm);
  fireEvent.change(screen.getByLabelText(T['convert.quantity.kind']), { target: { value: 'count' } });
  return (await screen.findByRole('heading', { name: T['convert.splits.title'] })).closest('section') as HTMLElement;
}

describe('every name is editable', () => {
  it('a short list: the plain names are in an open list under the table, editable, and a name needs your button only once you changed it', async () => {
    const section = await load(['Calanus finmarchicus', 'Oithona similis', 'Pseudocalanus sp.']);
    const rest = section.querySelector('details.convert-splits-rest') as HTMLDetailsElement;
    expect(rest.open).toBe(true);
    expect(within(rest).getByLabelText('Scientific name: Oithona similis')).toBeTruthy();
    // an unchanged plain name has nothing to approve
    const button = within(rest).getByRole('button', { name: 'Approve: Oithona similis' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(rest.textContent).toContain(T['convert.splits.noDecision']);
    fireEvent.change(within(rest).getByLabelText('Scientific name: Oithona similis'), { target: { value: 'Oithona nana' } });
    expect((within(rest).getByRole('button', { name: 'Approve: Oithona similis' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(rest).getByRole('button', { name: 'Approve: Oithona similis' }));
    await waitFor(() => expect((within(rest).getByLabelText('Scientific name: Oithona similis') as HTMLInputElement).disabled).toBe(true));
    // the edit can be withdrawn
    fireEvent.click(within(rest).getByRole('button', { name: `${T['convert.splits.withdraw']}: Oithona similis` }));
    await waitFor(() => expect((within(rest).getByLabelText('Scientific name: Oithona similis') as HTMLInputElement).disabled).toBe(false));
    // the split that needs an approval ("Pseudocalanus sp.") is in the same list and has its own approve button
    expect(within(rest).getByRole('button', { name: 'Approve: Pseudocalanus sp.' })).toBeTruthy();
  });

  it('a long list is folded behind "show all names", and a name with a doubt stays in the table above', async () => {
    const plain = Array.from({ length: 18 }, (_, i) => `Genus${String.fromCharCode(97 + i)} species${String.fromCharCode(97 + i)}`);
    const section = await load([...plain, 'Oithona 2']);
    const rest = section.querySelector('details.convert-splits-rest') as HTMLDetailsElement;
    expect(rest.open).toBe(false);
    expect(within(rest).getByText(T['convert.splits.showAll'].replace('{n}', '18'))).toBeTruthy();
    // the doubted name is not in the folded list
    expect(within(rest).queryByLabelText('Scientific name: Oithona 2')).toBeNull();
    expect(within(section).getByLabelText('Scientific name: Oithona 2')).toBeTruthy();
    // the names are all there, for the one who opens the list
    expect(rest.querySelectorAll('tbody tr').length).toBe(18);
    fireEvent.click(within(rest).getByText(T['convert.splits.showAll'].replace('{n}', '18')));
  });
});
