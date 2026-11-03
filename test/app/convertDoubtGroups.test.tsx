// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Task 4: doubted names are approved by reason, with the list open beside the button.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI, translate } from '../../src/core/i18n/ui';
import { LANGS } from '../../src/core/types';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { chooseFiles } from './convertHelpers';

vi.setConfig({ testTimeout: 20_000 });
const T = UI.en;

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const HEAD = ['Aaa bbb 2', 'Ccc ddd 3', 'Eee fff 4', 'Ggg hhh/iii', 'Jjj kkk/lll', 'Mmm nnn'];
const CSV = `Sample,Station,Latitude,Longitude,Date,${HEAD.join(',')}\na,S,55,3,2020-01-01,1,2,3,4,5,6\n`;
const summary = (): HTMLElement => screen.getByRole('region', { name: T['convert.summary.title'] });

async function load(): Promise<HTMLElement> {
  const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} />);
  chooseFiles(view.container, [{ name: 'g.csv', text: CSV }]);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  const confirm = screen.queryByRole('button', { name: /^Confirm all shown/ });
  if (confirm) fireEvent.click(confirm);
  fireEvent.change(screen.getByLabelText(T['convert.quantity.kind']), { target: { value: 'count' } });
  return (await screen.findByRole('heading', { name: T['convert.splits.title'] })).closest('section') as HTMLElement;
}
const input = (section: HTMLElement, name: string): HTMLInputElement => within(section).getByLabelText(`Scientific name: ${name}`) as HTMLInputElement;

describe('doubted names by reason', () => {
  it('one group per reason, each with its button and its names listed open', async () => {
    const section = await load();
    const digits = within(section).getByRole('group', { name: /digit/ });
    const slash = within(section).getByRole('group', { name: /slash/ });
    expect(within(digits).getByRole('button', { name: 'Approve 3 names as written' })).toBeTruthy();
    expect(within(digits).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Aaa bbb 2', 'Ccc ddd 3', 'Eee fff 4']);
    expect(within(slash).getByRole('button', { name: 'Approve 2 names as written' })).toBeTruthy();
    expect(within(slash).getAllByRole('listitem')).toHaveLength(2);
    // the list is not under a closed fold
    expect(within(slash).getByRole('list').closest('details')).toBeNull();
  });

  it('approves only its own group, nothing is rewritten, and focus moves on', async () => {
    const section = await load();
    fireEvent.click(within(within(section).getByRole('group', { name: /digit/ })).getByRole('button', { name: /as written/ }));
    await waitFor(() => expect(input(section, 'Aaa bbb 2').disabled).toBe(true));
    expect(input(section, 'Ccc ddd 3').disabled).toBe(true);
    expect(input(section, 'Ggg hhh/iii').disabled).toBe(false);
    expect(input(section, 'Aaa bbb 2').value).toBe('Aaa bbb 2');
    // the digits group is gone; focus is on the slash button
    expect(within(section).queryByRole('group', { name: /digit/ })).toBeNull();
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Approve 2 names as written'));
    fireEvent.click(within(section).getByRole('button', { name: 'Approve 2 names as written' }));
    await waitFor(() => expect(input(section, 'Jjj kkk/lll').disabled).toBe(true));
    // no group left: focus falls back to the heading
    await waitFor(() => expect(document.activeElement?.id).toBe('convert-splits-title'));
    expect(summary().textContent).not.toContain(T['convert.summary.blocked']);
  });

  it('a name the user edited is left out of the group and keeps its edit', async () => {
    const section = await load();
    fireEvent.change(input(section, 'Ccc ddd 3'), { target: { value: 'Ccc ddd' } });
    const digits = within(section).getByRole('group', { name: /digit/ });
    expect(within(digits).getByRole('button', { name: 'Approve 2 names as written' })).toBeTruthy();
    expect(within(digits).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Aaa bbb 2', 'Eee fff 4']);
    fireEvent.click(within(digits).getByRole('button', { name: /as written/ }));
    await waitFor(() => expect(input(section, 'Aaa bbb 2').disabled).toBe(true));
    expect(input(section, 'Ccc ddd 3').disabled).toBe(false);
    expect(input(section, 'Ccc ddd 3').value).toBe('Ccc ddd');
  });

  it('a name approved on its own row before is not touched by the group', async () => {
    const section = await load();
    fireEvent.change(input(section, 'Aaa bbb 2'), { target: { value: 'Aaa bbb' } });
    fireEvent.click(within(section).getByRole('button', { name: 'Approve: Aaa bbb 2' }));
    await waitFor(() => expect(input(section, 'Aaa bbb 2').disabled).toBe(true));
    fireEvent.click(within(within(section).getByRole('group', { name: /digit/ })).getByRole('button', { name: /as written/ }));
    await waitFor(() => expect(input(section, 'Ccc ddd 3').disabled).toBe(true));
    expect(input(section, 'Aaa bbb 2').value).toBe('Aaa bbb');
  });

  it('the group works while the plain-names list is folded, and a long list stays beside its button', async () => {
    const many = Array.from({ length: 20 }, (_, i) => `Plain${String.fromCharCode(97 + i)} sp.`);
    const csv = `Sample,Station,Latitude,Longitude,Date,${[...HEAD.slice(0, 3), ...many].join(',')}\na,S,55,3,2020-01-01,${Array(23).fill(1).join(',')}\n`;
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'h.csv', text: csv }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    const confirm = screen.queryByRole('button', { name: /^Confirm all shown/ });
    if (confirm) fireEvent.click(confirm);
    fireEvent.change(screen.getByLabelText(T['convert.quantity.kind']), { target: { value: 'count' } });
    const section = (await screen.findByRole('heading', { name: T['convert.splits.title'] })).closest('section') as HTMLElement;
    const rest = section.querySelector('details.convert-splits-rest') as HTMLDetailsElement | null;
    if (rest) expect(rest.open).toBe(false);
    const digits = within(section).getByRole('group', { name: /digit/ });
    expect(within(digits).getAllByRole('listitem')).toHaveLength(3);
    fireEvent.click(within(digits).getByRole('button', { name: /as written/ }));
    await waitFor(() => expect(within(section).queryByRole('group', { name: /digit/ })).toBeNull());
  });
});

describe('the group label in four languages', () => {
  it('has no placeholder left and Polish plurals are right', () => {
    for (const lang of LANGS) for (const n of [1, 2, 5, 22]) expect(translate(lang, 'convert.splits.approveGroup', { n }), `${lang} ${n}`).not.toMatch(/[{}]/);
    expect(translate('pl', 'convert.splits.approveGroup', { n: 1 })).toBe('Zatwierdź 1 nazwę tak, jak zapisano');
    expect(translate('pl', 'convert.splits.approveGroup', { n: 3 })).toBe('Zatwierdź 3 nazwy tak, jak zapisano');
    expect(translate('pl', 'convert.splits.approveGroup', { n: 5 })).toBe('Zatwierdź 5 nazw tak, jak zapisano');
    expect(translate('en', 'convert.splits.approveGroup', { n: 1 })).toBe('Approve 1 name as written');
  });
});
