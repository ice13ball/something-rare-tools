// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// An ODV / OPeNDAP-style environmental sheet (headers with a type suffix) through the PAGE: one blocking message, as for the same sheet without the suffixes. Synthetic data only.
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
const ODV = csvOf(['Station', 'Date', 'Latitude', 'Longitude', 'SDN:P01::PRESPR01<Float32>', 'Sample_ID<String>', 'Salinity<Float32>', 'Temperature_[deg._C]<Float32>', 'Activity<String>'], [
  ['E1', '2020-05-01', 70.1, 20.2, 5, 'a1', 33.1, 4.1, 9],
  ['E1', '2020-05-01', 70.1, 20.2, 10, 'a2', 33.4, 3.9, 8],
  ['E1', '2020-05-01', 70.1, 20.2, 15, 'a3', 33.5, 3.8, 9],
]);
const FORM_RULES = ['CONV-EML-MISSING', 'CONV-LICENCE-UNSET', 'CONV-BASIS-UNSET'];

describe('/convert page: type-suffixed headers', () => {
  it('an environmental-only sheet with suffixed headers shows one blocker, not three', async () => {
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'environment.csv', text: ODV }]);
    fireEvent.click(screen.getByRole('button', { name: PL['convert.read'] }));
    await screen.findByRole('heading', { name: PL['convert.columns.title'] });
    const summary = (): HTMLElement => screen.getByRole('region', { name: PL['convert.summary.title'] });
    await waitFor(() => expect(summary().getAttribute('aria-busy')).toBe('false'));
    const rules = (): string[] => [...summary().querySelectorAll('li[data-rule]')].map((li) => li.getAttribute('data-rule')!);
    await waitFor(() => expect(rules()).toContain('CONV-ENV-ONLY-SHEET'));
    expect(rules().filter((r) => r.startsWith('CONV-') && !FORM_RULES.includes(r) && getConvertRule(r).severity === 'error')).toEqual(['CONV-ENV-ONLY-SHEET']);
    for (const id of ['CONV-NO-TAXON', 'CONV-QUANTITY-UNDECLARED', 'CONV-NO-OCCURRENCES']) expect(rules(), id).not.toContain(id);
  });
});
