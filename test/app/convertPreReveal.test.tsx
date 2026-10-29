// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// The /convert page after the pre-reveal fixes: a data-dictionary sheet starts unticked, with its note; the data sheet next to it stays ticked. Invented sheets only.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { W1_CSV, chooseFiles, csvOf } from './convertHelpers';

vi.setConfig({ testTimeout: 30_000 });
beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

describe('a data-dictionary sheet', () => {
  it('starts with "Convert this sheet" off and says why; the data sheet is ticked', async () => {
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} />);
    chooseFiles(view.container, [
      { name: 'glossary.csv', text: csvOf(['column_name', 'description'], [['Depth_m', 'depth in metres'], ['TEMP_C', 'temperature']]) },
      { name: 'w1.csv', text: W1_CSV },
    ]);
    fireEvent.click(screen.getByRole('button', { name: UI.en['convert.read'] }));
    await screen.findByRole('heading', { name: UI.en['convert.columns.title'] });
    const boxes = screen.getAllByRole('checkbox', { name: UI.en['convert.sheet.use'] }) as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([false, true]);
    expect(screen.getAllByText(UI.en['convert.sheet.dictionary'])).toHaveLength(1);
  });
});
