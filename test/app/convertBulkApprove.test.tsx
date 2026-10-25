// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Stage-2 acceptance fix: "approve all shown" approves only the splits WITHOUT a doubt. A doubted split ("Acartia longiremis f": a single letter is left)
// needs its own action on its row, and while it is undecided it still blocks the conversion.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI, translate } from '../../src/core/i18n/ui';
import { distinctSplits, bulkApprovable } from '../../src/core/convert/taxon';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { LANGS } from '../../src/core/types';
import { chooseFiles } from './convertHelpers';

vi.setConfig({ testTimeout: 20_000 });
const T = UI.en;

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const CSV = 'Sample,Station,Latitude,Longitude,Date,Calanus cf. glacialis,Pseudocalanus sp.,Acartia longiremis f,Oithona 2\na,S,55,3,2020-01-01,3,4,5,6\n';
const summary = (): HTMLElement => screen.getByRole('region', { name: T['convert.summary.title'] });
const settled = async (text: string): Promise<void> => void (await waitFor(() => expect(summary().textContent).toContain(text)));

async function load(): Promise<HTMLElement> {
  const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} />);
  chooseFiles(view.container, [{ name: 'b.csv', text: CSV }]);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  const confirm = screen.queryByRole('button', { name: /^Confirm all shown/ });
  if (confirm) fireEvent.click(confirm);
  fireEvent.change(screen.getByLabelText(T['convert.quantity.kind']), { target: { value: 'count' } });
  return (await screen.findByRole('heading', { name: T['convert.splits.title'] })).closest('section') as HTMLElement;
}

describe('bulk approval skips doubted names', () => {
  it('the core: a split with a doubt is never in the bulk set', () => {
    const entries = distinctSplits(['Calanus cf. glacialis', 'Acartia longiremis f', 'Oithona 2', 'Calanus finmarchicus']);
    const { approve, skipped } = bulkApprovable(entries);
    expect(approve.map((s) => s.verbatim)).toEqual(['Calanus cf. glacialis']);
    expect(skipped.map((s) => s.verbatim).sort()).toEqual(['Acartia longiremis f', 'Oithona 2']);
    expect(skipped.every((s) => s.doubt !== undefined)).toBe(true);
  });

  it('the button says how many it approves and how many it skips, and an undecided doubted split still blocks afterwards', async () => {
    const section = await load();
    const approveAll = await within(section).findByRole('button', { name: /^Approve 2 shown names \(2 with a doubt skipped\)$/ });
    fireEvent.click(approveAll);
    // the two plain ones are approved, the two doubted ones are not
    await waitFor(() => expect((within(section).getByLabelText('Scientific name: Pseudocalanus sp.') as HTMLInputElement).disabled).toBe(true));
    expect((within(section).getByLabelText('Scientific name: Acartia longiremis f') as HTMLInputElement).disabled).toBe(false);
    expect((within(section).getByLabelText('Scientific name: Oithona 2') as HTMLInputElement).disabled).toBe(false);
    await settled(T['convert.summary.blocked']);
    expect(summary().textContent).toMatch(/2 names? .*not approved|undecided|split/i);
    // the bulk button now offers nothing (both left have a doubt) and says so
    expect(within(section).queryByRole('button', { name: /^Approve \d+ shown/ })).toBeNull();
    expect(section.textContent).toContain(T['convert.splits.allDoubted']);
    // a doubted row has its own "Approve as it is"
    fireEvent.click(within(section).getByRole('button', { name: 'Approve as it is: Acartia longiremis f' }));
    fireEvent.click(within(section).getByRole('button', { name: 'Approve as it is: Oithona 2' }));
    await settled(T['convert.summary.none']);
  });

  it('an edited doubted split is approved with its own button, and the corrected name is what is used', async () => {
    const section = await load();
    fireEvent.change(within(section).getByLabelText('Scientific name: Acartia longiremis f'), { target: { value: 'Acartia longiremis' } });
    fireEvent.click(within(section).getByRole('button', { name: 'Approve: Acartia longiremis f' }));
    await waitFor(() => expect((within(section).getByLabelText('Scientific name: Acartia longiremis f') as HTMLInputElement).disabled).toBe(true));
    await settled(T['convert.summary.blocked']);
  });

  it('with nothing doubted the label has no skip part', async () => {
    const csv = 'Sample,Station,Latitude,Longitude,Date,Calanus cf. glacialis,Pseudocalanus sp.\na,S,55,3,2020-01-01,3,4\n';
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'c.csv', text: csv }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    const confirm = screen.queryByRole('button', { name: /^Confirm all shown/ });
    if (confirm) fireEvent.click(confirm);
    expect(await screen.findByRole('button', { name: 'Approve 2 shown names' })).toBeTruthy();
  });
});

describe('the label in four languages, with plurals', () => {
  const NS = [1, 2, 5, 22] as const;
  it('never leaves a placeholder or an English word in a PL / DE / FR sentence', () => {
    for (const lang of LANGS) {
      for (const n of NS) {
        for (const skipped of NS) {
          const text = translate(lang, 'convert.splits.approveAllSkip', { n, skipped });
          expect(text, `${lang} ${n}/${skipped}`).not.toMatch(/[{}]/);
          expect(text).toContain(String(n));
          expect(text).toContain(`(${skipped} `);
          if (lang !== 'en') expect(text).not.toMatch(/\b(approve|names?|skipped|doubt)\b/i);
        }
      }
    }
  });
  it('Polish: "Zatwierdź 3 pokazane nazwy (2 z wątpliwością pominięte)"', () => {
    expect(translate('pl', 'convert.splits.approveAllSkip', { n: 3, skipped: 2 })).toBe('Zatwierdź 3 pokazane nazwy (2 z wątpliwością pominięte)');
    expect(translate('pl', 'convert.splits.approveAllSkip', { n: 1, skipped: 5 })).toBe('Zatwierdź 1 pokazaną nazwę (5 z wątpliwością pominiętych)');
    expect(translate('pl', 'convert.splits.approveAll', { n: 5 })).toBe('Zatwierdź 5 pokazanych nazw');
  });
});
