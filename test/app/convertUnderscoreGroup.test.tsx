// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Final review M1: names written with underscores (a wide sheet of Genus_species headers) have two group actions, "as written" and "with a space", both pressed by hand; an edited name is left to its row.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI, translate } from '../../src/core/i18n/ui';
import { LANGS } from '../../src/core/types';
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

const HEAD = ['Calanus_finmarchicus', 'Oithona_similis', 'Pseudocalanus_acuspes', 'Acartia_hudsonica_C', 'Metridia longa'];
const CSV = `Sample,Station,Latitude,Longitude,Date,${HEAD.map((h) => `"${h}"`).join(',')}\na,S,55,3,2020-01-01,1,2,3,4,5\n`;

async function load(): Promise<HTMLElement> {
  const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={vi.fn()} />);
  chooseFiles(view.container, [{ name: 's.csv', text: CSV }]);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  const confirm = screen.queryByRole('button', { name: /^Confirm all shown/ });
  if (confirm) fireEvent.click(confirm);
  fireEvent.change(screen.getByLabelText(T['convert.quantity.kind']), { target: { value: 'count' } });
  return (await screen.findByRole('heading', { name: T['convert.splits.title'] })).closest('section') as HTMLElement;
}
const input = (section: HTMLElement, name: string): HTMLInputElement => within(section).getByLabelText(`Scientific name: ${name}`) as HTMLInputElement;
const asWritten = /^Approve \d+ names? as written$/;
const spaceBtn = /^Write \d+ names? with a space instead of the underscore$/;

describe('underscore names on a wide sheet', () => {
  it('lists the names beside two buttons, and nothing is approved or changed before a click', async () => {
    const section = await load();
    const groups = within(section).getAllByRole('group');
    const space = groups.find((g) => within(g).queryByRole('button', { name: spaceBtn }));
    expect(space).toBeTruthy();
    // before -> after for each name the space makes plausible; the one that would still have a doubt (a single letter) is not in it
    expect(within(space as HTMLElement).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Calanus_finmarchicus → Calanus finmarchicus',
      'Oithona_similis → Oithona similis',
      'Pseudocalanus_acuspes → Pseudocalanus acuspes',
    ]);
    const asIs = groups.find((g) => within(g).queryByRole('button', { name: asWritten }));
    expect(within(asIs as HTMLElement).getAllByRole('listitem')).toHaveLength(4);
    for (const n of ['Calanus_finmarchicus', 'Oithona_similis', 'Pseudocalanus_acuspes', 'Acartia_hudsonica_C']) {
      expect(input(section, n).disabled).toBe(false);
      expect(input(section, n).value).toBe(n);
    }
  });

  it('one click on "as written" approves every underscore name with the name unchanged', async () => {
    const section = await load();
    fireEvent.click(within(section).getByRole('button', { name: asWritten }));
    await waitFor(() => expect(input(section, 'Calanus_finmarchicus').disabled).toBe(true));
    for (const n of ['Calanus_finmarchicus', 'Oithona_similis', 'Pseudocalanus_acuspes', 'Acartia_hudsonica_C']) {
      expect(input(section, n).value).toBe(n);
      expect(input(section, n).disabled).toBe(true);
    }
  });

  it('one click on "with a space" rewrites and approves the names the space makes plausible; the other stays for its row', async () => {
    const section = await load();
    fireEvent.click(within(section).getByRole('button', { name: spaceBtn }));
    await waitFor(() => expect(input(section, 'Calanus_finmarchicus').disabled).toBe(true));
    expect(input(section, 'Calanus_finmarchicus').value).toBe('Calanus finmarchicus');
    expect(input(section, 'Oithona_similis').value).toBe('Oithona similis');
    expect(input(section, 'Pseudocalanus_acuspes').value).toBe('Pseudocalanus acuspes');
    expect(input(section, 'Acartia_hudsonica_C').disabled).toBe(false);
    expect(input(section, 'Acartia_hudsonica_C').value).toBe('Acartia_hudsonica_C');
  });

  it('an edited name is left alone by both buttons', async () => {
    const section = await load();
    fireEvent.change(input(section, 'Oithona_similis'), { target: { value: 'Oithona similis (edited)' } });
    const groups = within(section).getAllByRole('group');
    const space = groups.find((g) => within(g).queryByRole('button', { name: spaceBtn }))!;
    expect(within(space).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(within(space).getByRole('button', { name: /^Write 2 names with a space/ }));
    await waitFor(() => expect(input(section, 'Calanus_finmarchicus').disabled).toBe(true));
    expect(input(section, 'Oithona_similis').value).toBe('Oithona similis (edited)');
    expect(input(section, 'Oithona_similis').disabled).toBe(false);
  });
});

describe('the labels in four languages', () => {
  it('have no placeholder left and the label says the name is kept as written', () => {
    for (const lang of LANGS) {
      for (const n of [1, 2, 5, 22]) expect(translate(lang, 'convert.splits.approveUnderscoreSpace', { n }), `${lang} ${n}`).not.toMatch(/[{}]/);
      expect(translate(lang, 'convert.splits.underscoreGroupNote'), lang).not.toMatch(/[{}]/);
      expect(translate(lang, 'convert.doubt.underscore'), lang).toMatch(/Genus_species/);
    }
    expect(translate('pl', 'convert.splits.approveUnderscoreSpace', { n: 1 })).toBe('Zapisz 1 nazwę ze spacją zamiast podkreślnika');
    expect(translate('pl', 'convert.splits.approveUnderscoreSpace', { n: 3 })).toBe('Zapisz 3 nazwy ze spacją zamiast podkreślnika');
    expect(translate('en', 'convert.splits.approveUnderscoreSpace', { n: 1 })).toBe('Write 1 name with a space instead of the underscore');
  });
});
