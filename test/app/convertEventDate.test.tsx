// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Round 3, Task 9, on the page: a sample without a date blocks; "Leave these samples out and list them" sends the answer for the number of lines the finding named. Every value is invented.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import type { ConvertEngine, ConvertRequestBody } from '../../src/worker/convert.protocol';
import { chooseFiles, csvOf } from './convertHelpers';

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const HEADER = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'];
const ROWS = [
  ['S1', 'k1', '2023-04-05', 55, 3, 'Calanus finmarchicus', 4],
  ['S2', 'k2', '2023-04-06', 56, 3, 'Calanus finmarchicus', 5],
  ['S3', 'k3', '', 56, 3, 'Calanus finmarchicus', 5],
  ['S4', 'k4', '', 57, 3, 'Calanus finmarchicus', 5],
];

const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const item = (rule: string): HTMLElement | null => document.querySelector(`li[data-rule="${rule}"]`);

describe('a sample without a date', () => {
  it('blank date cells: the button sends the answer for two lines, and the finding gives way to the note', async () => {
    const base = createDirectConvertEngine();
    const bodies: ConvertRequestBody[] = [];
    const engine: ConvertEngine = { ...base, convert: (b) => (bodies.push(b), base.convert(b)) };
    const view = render(<ConvertPage engine={engine} download={vi.fn()} downloadFile={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'hauls.csv', text: csvOf(HEADER, ROWS) }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    const confirm = screen.queryByRole('button', { name: /Confirm all shown/ });
    if (confirm !== null) fireEvent.click(confirm);
    for (const kind of screen.queryAllByLabelText(T['convert.quantity.kind'])) fireEvent.change(kind, { target: { value: 'count' } });
    await idle();
    expect(bodies[bodies.length - 1].sheets[0].leaveOut).toBeUndefined();
    const found = item('CONV-EVENT-DATE-MISSING')!;
    expect(found).not.toBeNull();
    fireEvent.click(within(found).getByRole('button', { name: T['convert.finding.leaveOutSamples'] }));
    await waitFor(() => expect(bodies[bodies.length - 1].sheets[0].leaveOut).toEqual([{ reason: 'no-event-date', count: 2 }]));
    await idle();
    await waitFor(() => expect(item('CONV-EVENT-DATE-MISSING')).toBeNull());
    expect(item('CONV-ROW-LEFT-OUT')).not.toBeNull();
  });
});
