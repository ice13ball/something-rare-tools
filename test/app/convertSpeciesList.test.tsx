// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// A plain species list (a taxon column, no numbers) through the PAGE: one clear blocking message, in the language of the page. Synthetic data only.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { getConvertRule } from '../../src/core/rules/convert';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { UI } from '../../src/core/i18n/ui';
import { chooseFiles, csvOf } from './convertHelpers';

vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('pl');
});
afterEach(cleanup);

const PL = UI.pl;
const LIST = csvOf(['Station', 'Date', 'Latitude', 'Longitude', 'scientificName'], [
  ['ZL1', '2020-05-01', 70.1, 20.2, 'Calanus finmarchicus'],
  ['ZL1', '2020-05-01', 70.1, 20.2, 'Oithona similis'],
  ['ZL1', '2020-05-01', 70.1, 20.2, 'Pseudocalanus acuspes'],
]);
const WITH_TEMPERATURE = csvOf(['Station', 'Date', 'Latitude', 'Longitude', 'scientificName', 'Temperature [degC]'], [
  ['ZL1', '2020-05-01', 70.1, 20.2, 'Calanus finmarchicus', 4.1],
  ['ZL1', '2020-05-01', 70.1, 20.2, 'Oithona similis', 4.1],
  ['ZL1', '2020-05-01', 70.1, 20.2, 'Pseudocalanus acuspes', 4.1],
]);
const ENV_ONLY = csvOf(['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Temperature [degC]', 'Salinity'], [
  ['E1', '2020-05-01', 70.1, 20.2, 5, 4.1, 33.1],
  ['E1', '2020-05-01', 70.1, 20.2, 10, 3.9, 33.4],
]);
// the form's own blocks (dataset description, licence, basis of record) are not about the sheet
const FORM_RULES = ['CONV-EML-MISSING', 'CONV-LICENCE-UNSET', 'CONV-BASIS-UNSET'];

describe('a plain species list on the /convert page', () => {
  it('a plain species list gets one clear message on the page', async () => {
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'species-list.csv', text: LIST }]);
    fireEvent.click(screen.getByRole('button', { name: PL['convert.read'] }));
    await screen.findByRole('heading', { name: PL['convert.columns.title'] });
    const summary = (): HTMLElement => screen.getByRole('region', { name: PL['convert.summary.title'] });
    await waitFor(() => expect(summary().getAttribute('aria-busy')).toBe('false'));

    const rules = (): string[] => [...summary().querySelectorAll('li[data-rule]')].map((li) => li.getAttribute('data-rule')!);
    await waitFor(() => expect(rules()).toContain('CONV-SPECIES-LIST-NO-COUNTS'));
    // exactly one blocking item about the sheet
    expect(rules().filter((r) => r.startsWith('CONV-') && !FORM_RULES.includes(r))).toEqual(['CONV-SPECIES-LIST-NO-COUNTS']);

    const text = summary().textContent ?? '';
    expect(text).toContain(getConvertRule('CONV-SPECIES-LIST-NO-COUNTS').plain.pl);
    expect(text).toContain('Ten arkusz wymienia gatunki bez liczebności.');
    for (const id of ['CONV-NO-TAXON', 'CONV-QUANTITY-UNDECLARED', 'CONV-NO-OCCURRENCES']) {
      const start = getConvertRule(id).plain.pl.slice(0, 40);
      expect(start.length, id).toBe(40);
      expect(text, id).not.toContain(start);
      expect(rules(), id).not.toContain(id);
    }
  });

  it('a taxon column with a measured variable and no quantity column gets one message that says the quantity column is missing, not that no taxon column is marked', async () => {
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'taxon-temperature.csv', text: WITH_TEMPERATURE }]);
    fireEvent.click(screen.getByRole('button', { name: PL['convert.read'] }));
    await screen.findByRole('heading', { name: PL['convert.columns.title'] });
    const summary = (): HTMLElement => screen.getByRole('region', { name: PL['convert.summary.title'] });
    await waitFor(() => expect(summary().getAttribute('aria-busy')).toBe('false'));
    const rules = (): string[] => [...summary().querySelectorAll('li[data-rule]')].map((li) => li.getAttribute('data-rule')!);
    await waitFor(() => expect(rules()).toContain('CONV-TAXON-NO-QUANTITY'));
    expect(rules().filter((r) => r.startsWith('CONV-') && !FORM_RULES.includes(r))).toEqual(['CONV-TAXON-NO-QUANTITY']);
    const text = summary().textContent ?? '';
    expect(text).toContain('zaznaczono kolumnę z taksonami, ale nie ma kolumny z ilością');
    for (const id of ['CONV-NO-TAXON', 'CONV-QUANTITY-UNDECLARED', 'CONV-NO-OCCURRENCES']) expect(text, id).not.toContain(getConvertRule(id).plain.pl.slice(0, 40));
  });

  it('an environmental-only sheet gets one message, with a link to /check, and the three stacked blockers are not shown', async () => {
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'environment.csv', text: ENV_ONLY }]);
    fireEvent.click(screen.getByRole('button', { name: PL['convert.read'] }));
    await screen.findByRole('heading', { name: PL['convert.columns.title'] });
    const summary = (): HTMLElement => screen.getByRole('region', { name: PL['convert.summary.title'] });
    await waitFor(() => expect(summary().getAttribute('aria-busy')).toBe('false'));
    const rules = (): string[] => [...summary().querySelectorAll('li[data-rule]')].map((li) => li.getAttribute('data-rule')!);
    await waitFor(() => expect(rules()).toContain('CONV-ENV-ONLY-SHEET'));
    expect(rules().filter((r) => r.startsWith('CONV-') && !FORM_RULES.includes(r) && getConvertRule(r).severity === 'error')).toEqual(['CONV-ENV-ONLY-SHEET']);
    const text = summary().textContent ?? '';
    expect(text).toContain('Ten arkusz zawiera tylko pomiary środowiskowe');
    for (const id of ['CONV-NO-TAXON', 'CONV-QUANTITY-UNDECLARED', 'CONV-NO-OCCURRENCES']) {
      expect(rules(), id).not.toContain(id);
      expect(text, id).not.toContain(getConvertRule(id).plain.pl.slice(0, 40));
    }
    const link = summary().querySelector('li[data-rule="CONV-ENV-ONLY-SHEET"] a');
    expect(link?.getAttribute('href')).toBe('/check');
    expect(link?.textContent).toBe(PL['convert.finding.envOnly.checkLink']);
  });
});

