// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Task 4 (decision 03.11): the group button "as written" exists only for digits and long; a trailing single m / f has its own group that reads it as the sex.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI, translate } from '../../src/core/i18n/ui';
import { LANGS } from '../../src/core/types';
import { openZip } from '../../src/core/parse/zip';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { nodeInflate } from '../helpers/zipfile';
import { chooseFiles } from './convertHelpers';

vi.setConfig({ testTimeout: 30_000 });
const T = UI.en;
beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const HEAD = ['C. vanus m', 'C. vanus f', 'C. vanus x', 'Ddd eee/fff', 'Foram, benthic', 'Mmm nnn'];
const CSV = `Sample,Station,Latitude,Longitude,Date,${HEAD.map((h) => `"${h}"`).join(',')}\na,S,55,3,2020-01-01,1,2,3,4,5,6\n`;
const sexBtn = /^Treat the last letter as sex \(m\/f\) in \d+ names?$/;

async function load(): Promise<{ section: HTMLElement; downloadFile: ReturnType<typeof vi.fn> }> {
  const downloadFile = vi.fn();
  const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={downloadFile} />);
  chooseFiles(view.container, [{ name: 's.csv', text: CSV }]);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  const confirm = screen.queryByRole('button', { name: /^Confirm all shown/ });
  if (confirm) fireEvent.click(confirm);
  fireEvent.change(screen.getByLabelText(T['convert.quantity.kind']), { target: { value: 'count' } });
  const section = (await screen.findByRole('heading', { name: T['convert.splits.title'] })).closest('section') as HTMLElement;
  return { section, downloadFile };
}
const input = (section: HTMLElement, name: string): HTMLInputElement => within(section).getByLabelText(`Scientific name: ${name}`) as HTMLInputElement;
const sexSelect = (section: HTMLElement, name: string): HTMLSelectElement => within(section).getByLabelText(`Sex: ${name}`) as HTMLSelectElement;

describe('group buttons by reason', () => {
  it('slash, remark and single-letter have no "as written" button; the sex group lists name and sex per name', async () => {
    const { section } = await load();
    expect(within(section).queryByRole('button', { name: /as written/ })).toBeNull();
    expect(within(section).queryByRole('group', { name: /slash/ })).toBeNull();
    expect(within(section).queryByRole('group', { name: /remark|comma/ })).toBeNull();
    const group = within(section).getByRole('group', { name: T['convert.splits.sexGroup'] });
    expect(within(group).getByRole('button', { name: 'Treat the last letter as sex (m/f) in 2 names' })).toBeTruthy();
    expect(within(group).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['C. vanus m → C. vanus, male', 'C. vanus f → C. vanus, female']);
    // C. vanus x is not in it and is still one by one
    expect(group.textContent).not.toContain('C. vanus x');
    expect(within(section).getByRole('button', { name: 'Approve as it is: C. vanus x' })).toBeTruthy();
  });

  it('fills the name and the sex fields, approves, and can be undone per name', async () => {
    const { section } = await load();
    fireEvent.click(within(section).getByRole('button', { name: sexBtn }));
    await waitFor(() => expect(input(section, 'C. vanus m').disabled).toBe(true));
    expect(input(section, 'C. vanus m').value).toBe('C. vanus');
    expect(sexSelect(section, 'C. vanus m').value).toBe('male');
    expect(input(section, 'C. vanus f').value).toBe('C. vanus');
    expect(sexSelect(section, 'C. vanus f').value).toBe('female');
    expect(input(section, 'C. vanus x').disabled).toBe(false);
    expect(input(section, 'C. vanus x').value).toBe('C. vanus x');
    fireEvent.click(within(section).getByRole('button', { name: 'Withdraw approval: C. vanus m' }));
    await waitFor(() => expect(input(section, 'C. vanus m').disabled).toBe(false));
  });

  it('an edited name is left alone', async () => {
    const { section } = await load();
    fireEvent.change(input(section, 'C. vanus m'), { target: { value: 'C. vanus mine' } });
    const group = within(section).getByRole('group', { name: T['convert.splits.sexGroup'] });
    expect(within(group).getAllByRole('listitem')).toHaveLength(1);
    fireEvent.click(within(group).getByRole('button', { name: 'Treat the last letter as sex (m/f) in 1 name' }));
    await waitFor(() => expect(input(section, 'C. vanus f').disabled).toBe(true));
    expect(input(section, 'C. vanus m').value).toBe('C. vanus mine');
    expect(input(section, 'C. vanus m').disabled).toBe(false);
    expect(sexSelect(section, 'C. vanus m').value).toBe('');
  });
});

describe('the written archive', () => {
  it('has scientificName without the letter and sex in the occurrence', async () => {
    const { section, downloadFile } = await load();
    fireEvent.click(within(section).getByRole('button', { name: sexBtn }));
    await waitFor(() => expect(input(section, 'C. vanus m').disabled).toBe(true));
    fireEvent.click(within(section).getByRole('button', { name: 'Approve as it is: C. vanus x' }));
    fireEvent.click(within(section).getByRole('button', { name: 'Approve as it is: Ddd eee/fff' }));
    fireEvent.click(within(section).getByRole('button', { name: 'Approve as it is: Foram, benthic' }));
    const t = (l: string, v: string): void => void fireEvent.change(screen.getByLabelText(l), { target: { value: v } });
    t(T['convert.meta.f.title'], 'Invented counts');
    t(T['convert.meta.f.abstract'], 'Invented values for a test.');
    t(T['convert.meta.f.creators'], 'Ada Example');
    t(T['convert.meta.f.contactName'], 'Ada Example');
    t(T['convert.meta.f.contactEmail'], 'ada@example.org');
    t(T['convert.meta.f.institution'], 'INVENTED');
    t(T['convert.meta.f.licence'], 'CC-BY-4.0');
    t(T['convert.meta.f.basis'], 'HumanObservation');
    t(T['convert.device.label'], 'bongo');
    t(T['convert.mesh.label'], '335');
    await waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
    await waitFor(() => expect(document.querySelector('.convert-accept')).toBeTruthy());
    for (const box of document.querySelectorAll<HTMLInputElement>('.convert-accept [data-rule-group] input[type="checkbox"]')) if (!box.checked) fireEvent.click(box);
    const btn = (): HTMLButtonElement => screen.getByRole('button', { name: T['convert.export.button'] }) as HTMLButtonElement;
    await waitFor(() => expect(btn().getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(btn());
    await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1));
    const blob = (downloadFile.mock.calls[0] as [Blob])[0];
    const bytes = await new Promise<Uint8Array>((res) => {
      const r = new FileReader();
      r.onload = () => res(new Uint8Array(r.result as ArrayBuffer));
      r.readAsArrayBuffer(blob);
    });
    const z = openZip(bytes);
    const occ = new TextDecoder().decode(await z.read(z.find('occurrence.txt')!, nodeInflate)).split('\n');
    const head = occ[0].split('\t');
    const col = (name: string): number => head.indexOf(name);
    const rows = occ.slice(1).filter((l) => l !== '').map((l) => l.split('\t'));
    const byVerbatim = (v: string): string[] => rows.find((r) => r[col('verbatimIdentification')] === v)!;
    for (const [v, sex] of [['C. vanus m', 'male'], ['C. vanus f', 'female']] as const) {
      expect(byVerbatim(v)[col('scientificName')]).toBe('C. vanus');
      expect(byVerbatim(v)[col('sex')]).toBe(sex);
    }
    expect(byVerbatim('C. vanus x')[col('scientificName')]).toBe('C. vanus x');
    expect(byVerbatim('C. vanus x')[col('sex')] ?? '').toBe('');
  });
});

describe('the labels in four languages', () => {
  it('have no placeholder left; Polish plural forms', () => {
    for (const lang of LANGS) for (const n of [1, 2, 5, 22]) expect(translate(lang, 'convert.splits.approveSex', { n }), `${lang} ${n}`).not.toMatch(/[{}]/);
    expect(translate('pl', 'convert.splits.approveSex', { n: 1 })).toBe('Potraktuj ostatnią literę jako płeć (m/f) w 1 nazwie');
    expect(translate('pl', 'convert.splits.approveSex', { n: 3 })).toBe('Potraktuj ostatnią literę jako płeć (m/f) w 3 nazwach');
    expect(translate('en', 'convert.splits.approveSex', { n: 1 })).toBe('Treat the last letter as sex (m/f) in 1 name');
  });
});
