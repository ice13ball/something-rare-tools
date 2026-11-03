// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// The ledger on the /convert page: shown, informational, in all four languages with the right plural forms. Synthetic data only.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertLedger } from '../../src/app/components/ConvertLedger';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { LEDGER_REASONS } from '../../src/core/convert/ledger';
import type { SheetLedger } from '../../src/core/convert/ledger';
import { UI } from '../../src/core/i18n/ui';
import { LANGS } from '../../src/core/types';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { W1_CSV, chooseFiles } from './convertHelpers';

vi.setConfig({ testTimeout: 30_000 });
beforeEach(() => {
  localStorage.clear();
  initLang();
});
afterEach(cleanup);

const tally = (source: number, written: number, skipped: { reason: SheetLedger['rows']['skipped'][number]['reason']; count: number }[] = [], unexplained = 0) => ({ source, written, skipped, unexplained });
const sheet = (n: number): SheetLedger => ({
  file: 'f.csv',
  sheet: 'Data',
  kind: 'long',
  unit: 'rows',
  rows: tally(n, n - 1, [{ reason: 'zero', count: 1 }]),
  columns: [
    { index: 2, header: 'Count', role: 'quantity', to: 'occurrence', numbers: n, sum: 10.5, nonNumbers: 0, writtenWithoutValue: 0, valueMissing: 0, written: n - 1, writtenSum: 10.5, outSum: 10.5, skipped: [{ reason: 'zero', count: 1, sum: 0 }], unexplained: 0, match: true },
    { index: 3, header: 'Mesh', role: 'ignore', to: 'not-written', numbers: n, sum: 7, nonNumbers: 0, writtenWithoutValue: 0, valueMissing: 0, written: 0, writtenSum: 0, outSum: 0, skipped: [{ reason: 'column-not-read', count: n, sum: 7 }], unexplained: 0, match: true },
  ],
  balanced: true,
});

describe('the ledger panel', () => {
  it('every reason has a text in all four languages, none mentions a "grain", and no placeholder is left open', () => {
    for (const lang of LANGS) {
      for (const r of LEDGER_REASONS) expect(UI[lang][`convert.ledger.reason.${r}` as keyof typeof UI.en], `${lang} ${r}`).toBeTruthy();
      const keys = Object.keys(UI[lang]).filter((k) => k.startsWith('convert.ledger.'));
      expect(keys.length).toBeGreaterThan(30);
      for (const k of keys) expect((UI[lang] as Record<string, string>)[k].toLowerCase(), `${lang} ${k}`).not.toContain('grain');
    }
  });

  it('the plural forms follow the number, also those of "written": Polish 1 / 2 / 5, French 0 / 1 / 2', () => {
    const withWritten = (source: number, written: number): SheetLedger => ({ ...sheet(source), rows: tally(source, written, written === source ? [] : [{ reason: 'zero', count: source - written }]) });
    setLang('pl');
    const { container, rerender } = render(<ConvertLedger ledger={[withWritten(1, 1)]} />);
    expect(container.textContent).toContain('1 wiersz: 1 zapisany');
    rerender(<ConvertLedger ledger={[withWritten(2, 2)]} />);
    expect(container.textContent).toContain('2 wiersze: 2 zapisane');
    rerender(<ConvertLedger ledger={[withWritten(5, 5)]} />);
    expect(container.textContent).toContain('5 wierszy: 5 zapisanych');
    rerender(<ConvertLedger ledger={[withWritten(22, 0)]} />);
    expect(container.textContent).toContain('22 wiersze: 0 zapisanych');
    // while something blocks, nothing is written yet
    rerender(<ConvertLedger ledger={[withWritten(2, 1)]} blocked />);
    expect(container.textContent).toContain('2 wiersze: 1 zostałby zapisany');
    expect(container.textContent).not.toMatch(/\{[+\w]/);
    cleanup();
    setLang('fr');
    const fr = render(<ConvertLedger ledger={[withWritten(3, 0)]} />);
    expect(fr.container.textContent).toContain('3 lignes : 0 écrite');
    expect(fr.container.textContent).not.toContain('0 écrites');
    fr.rerender(<ConvertLedger ledger={[withWritten(3, 1)]} />);
    expect(fr.container.textContent).toContain('1 écrite');
    fr.rerender(<ConvertLedger ledger={[withWritten(3, 2)]} />);
    expect(fr.container.textContent).toContain('2 écrites');
    cleanup();
    setLang('en');
    const en = render(<ConvertLedger ledger={[withWritten(1, 1)]} blocked />);
    expect(en.container.textContent).toContain('1 row: 1 would be written');
  });

  it('says what is not settled: an unwritten numeric column, text where a number is expected, a column with no explanation', () => {
    setLang('en');
    const base = sheet(3);
    const unwritten = render(<ConvertLedger ledger={[base]} />);
    expect(unwritten.container.textContent).not.toContain(UI.en['convert.ledger.balanced']);
    expect(unwritten.container.textContent).toContain('1 numeric column is not written at all');
    cleanup();
    const text = { ...base, columns: [{ ...base.columns[0], nonNumbers: 2 }] };
    expect(render(<ConvertLedger ledger={[text]} />).container.textContent).toContain('2 cells hold something that is not a number');
    cleanup();
    const lost = { ...base, balanced: false, columns: [{ ...base.columns[0], unexplained: 2 }] };
    const c = render(<ConvertLedger ledger={[lost]} />).container.textContent ?? '';
    expect(c).toContain('2 numbers with no record and no reason');
    expect(c).toContain(UI.en['convert.ledger.unbalanced']);
    cleanup();
    // two sheets of one name: both are told apart, and the page does not warn about a repeated key
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const two = render(<ConvertLedger ledger={[{ ...base, file: 'a.csv' }, { ...base, file: 'b.csv' }, { ...base, file: 'b.csv' }]} />);
    expect(two.container.textContent).toContain('a.csv / Data');
    expect(two.container.textContent).toContain('b.csv / Data');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('renders in each language without a placeholder or an English fallback key left in the text', () => {
    for (const lang of LANGS) {
      setLang(lang);
      const { container } = render(<ConvertLedger ledger={[{ ...sheet(3), rows: tally(3, 1, [{ reason: 'summary-row', count: 1 }], 1), balanced: false }]} />);
      const text = container.textContent ?? '';
      expect(text, lang).not.toMatch(/\{[+\w]|convert\.ledger/);
      // the column that is not written comes with its sum, the one that is written with both sums
      expect(text, lang).toContain('Mesh');
      expect(text, lang).toContain('10.5');
      cleanup();
    }
  });

  it('is on the page after a conversion and blocks nothing', async () => {
    setLang('pl');
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'wide.csv', text: W1_CSV }]);
    fireEvent.click(screen.getByRole('button', { name: UI.pl['convert.read'] }));
    await screen.findByRole('heading', { name: UI.pl['convert.columns.title'] });
    const summary = (): HTMLElement => screen.getByRole('region', { name: UI.pl['convert.summary.title'] });
    await waitFor(() => expect(summary().getAttribute('aria-busy')).toBe('false'));
    await waitFor(() => expect(summary().querySelector('details.convert-ledger')).not.toBeNull());
    expect(summary().textContent).toContain(UI.pl['convert.ledger.title']);
    // no finding comes from the ledger
    expect([...summary().querySelectorAll('li[data-rule]')].map((li) => li.getAttribute('data-rule')).filter((r) => /LEDGER/.test(r ?? ''))).toEqual([]);
  });

  it('while the conversion is blocked the page says what WOULD be written, not what is', async () => {
    setLang('en');
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'wide.csv', text: W1_CSV }]);
    fireEvent.click(screen.getByRole('button', { name: UI.en['convert.read'] }));
    await screen.findByRole('heading', { name: UI.en['convert.columns.title'] });
    const summary = (): HTMLElement => screen.getByRole('region', { name: UI.en['convert.summary.title'] });
    await waitFor(() => expect(summary().querySelector('details.convert-ledger')).not.toBeNull());
    // the quantity kind is not declared: the export is blocked, so nothing is written yet
    expect(summary().querySelector('details.convert-ledger')!.textContent).toMatch(/would be written/);
    expect(summary().querySelector('details.convert-ledger')!.textContent).not.toMatch(/: \d+ written/);
  });
});
