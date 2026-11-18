// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Round 4, Task 4, on the page: a number column of a decimal-comma file whose comma may be a thousands separator is asked about ("Decimal comma" / "Thousands separator"), the answer is the person's own and
// is sent to the worker by column, "Ask again" takes it back, and the companion file keeps it as a header hash and the sheet's row count. Every value is invented.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { decimalReadingSettingsOf, initialChoices } from '../../src/app/convertModel';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { keyHashes } from '../../src/core/convert/keySetting';
import { writeConvertSidecar } from '../../src/core/convert/settings';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import type { ConvertEngine, ConvertParseResult } from '../../src/worker/convert.protocol';
import { chooseFiles } from './convertHelpers';

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const HEADER = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count', 'Chlorophyll'];
const CHL = 7;
const ROWS = ['S1;k1;2023-06-14;55,5;3,5;Calanus finmarchicus;4;1,250', 'S2;k2;2023-06-14;56,5;3,5;Calanus finmarchicus;5;2,000'];
const HAULS = [HEADER.join(';'), ...ROWS].join('\n') + '\n';

interface Run {
  calls: { sheet: string; index: number; reading: string | null }[];
  download: ReturnType<typeof vi.fn>;
}

async function load(files: { name: string; text: string }[]): Promise<Run> {
  const base = createDirectConvertEngine();
  const calls: Run['calls'] = [];
  const engine: ConvertEngine = { ...base, decimalChoice: (fileId, sheet, index, reading) => (calls.push({ sheet, index, reading }), base.decimalChoice(fileId, sheet, index, reading)) };
  const download = vi.fn();
  const view = render(<ConvertPage engine={engine} download={download} downloadFile={vi.fn()} />);
  chooseFiles(view.container, files);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  const confirm = screen.queryByRole('button', { name: /Confirm all shown/ });
  if (confirm !== null) fireEvent.click(confirm);
  for (const kind of screen.queryAllByLabelText(T['convert.quantity.kind'])) fireEvent.change(kind, { target: { value: 'count' } });
  await idle();
  return { calls, download };
}

const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const item = (rule: string): HTMLElement | null => document.querySelector(`li[data-rule="${rule}"]`);
const button = (root: HTMLElement, name: string): HTMLElement => within(root).getByRole('button', { name });

describe('the buttons', () => {
  it('"Thousands separator" sends the answer by column; the question becomes CONV-DECIMAL-DECLARED; "Ask again" takes it back', async () => {
    const run = await load([{ name: 'hauls.csv', text: HAULS }]);
    expect(item('IN-DECIMAL-AMBIGUOUS')).not.toBeNull();
    expect(item('CONV-DECIMAL-DECLARED')).toBeNull();
    fireEvent.click(button(item('IN-DECIMAL-AMBIGUOUS')!, T['convert.finding.thousandsSeparator']));
    await waitFor(() => expect(item('CONV-DECIMAL-DECLARED')).not.toBeNull());
    await idle();
    expect(run.calls).toEqual([{ sheet: 'hauls.csv', index: CHL, reading: 'thousands' }]);
    expect(item('IN-DECIMAL-AMBIGUOUS')).toBeNull();
    fireEvent.click(button(item('CONV-DECIMAL-DECLARED')!, T['convert.finding.askAgain']));
    await waitFor(() => expect(item('IN-DECIMAL-AMBIGUOUS')).not.toBeNull());
    await idle();
    expect(run.calls[1]).toEqual({ sheet: 'hauls.csv', index: CHL, reading: null });
    expect(item('CONV-DECIMAL-DECLARED')).toBeNull();
  });

  it('"Decimal comma" sends decimal', async () => {
    const run = await load([{ name: 'hauls.csv', text: HAULS }]);
    fireEvent.click(button(item('IN-DECIMAL-AMBIGUOUS')!, T['convert.finding.decimalComma']));
    await waitFor(() => expect(item('CONV-DECIMAL-DECLARED')).not.toBeNull());
    expect(run.calls).toEqual([{ sheet: 'hauls.csv', index: CHL, reading: 'decimal' }]);
  });

  it('the question blocks the export until it is answered', async () => {
    await load([{ name: 'hauls.csv', text: HAULS }]);
    expect(item('IN-DECIMAL-AMBIGUOUS')?.closest('.convert-findings')?.getAttribute('data-kind')).toBe('error');
    expect(item('CONV-DECIMAL-DECLARED')).toBeNull();
    fireEvent.click(button(item('IN-DECIMAL-AMBIGUOUS')!, T['convert.finding.thousandsSeparator']));
    await waitFor(() => expect(item('CONV-DECIMAL-DECLARED')?.closest('.convert-findings')?.getAttribute('data-kind')).toBe('info'));
  });
});

describe('answering does not reset the sheet', () => {
  it('a role the person changed, the export gate and the confirmations survive the answer', async () => {
    await load([{ name: 'hauls.csv', text: HAULS }]);
    const exportButton = () => screen.getByRole('button', { name: T['convert.export.button'] });
    expect(exportButton().getAttribute('aria-disabled')).toBe('true');
    const role = screen.getByLabelText('Station: Meaning') as HTMLSelectElement;
    fireEvent.change(role, { target: { value: 'ignore' } });
    await idle();
    expect((screen.getByLabelText('Station: Meaning') as HTMLSelectElement).value).toBe('ignore');
    fireEvent.click(button(item('IN-DECIMAL-AMBIGUOUS')!, T['convert.finding.thousandsSeparator']));
    await waitFor(() => expect(item('CONV-DECIMAL-DECLARED')).not.toBeNull());
    await idle();
    expect((screen.getByLabelText('Station: Meaning') as HTMLSelectElement).value).toBe('ignore');
    expect(item('IN-DECIMAL-AMBIGUOUS')).toBeNull();
    // the decimal question no longer blocks (other findings may still, so this is the one finding's own list)
    expect(item('CONV-DECIMAL-DECLARED')?.closest('.convert-findings')?.getAttribute('data-kind')).toBe('info');
    // taking the answer back keeps it too
    fireEvent.click(button(item('CONV-DECIMAL-DECLARED')!, T['convert.finding.askAgain']));
    await waitFor(() => expect(item('IN-DECIMAL-AMBIGUOUS')).not.toBeNull());
    await idle();
    expect((screen.getByLabelText('Station: Meaning') as HTMLSelectElement).value).toBe('ignore');
    expect(exportButton().getAttribute('aria-disabled')).toBe('true');
  });
});

describe('the companion file', () => {
  const line = (rows: number, reading: 'decimal' | 'thousands' = 'thousands', header = HEADER) => writeConvertSidecar({ decimalReading: [{ sheet: 'hauls.csv', reading, hash: keyHashes(header, [CHL])!, rows }] });
  const parsed = (text: string, companion?: string): Promise<ConvertParseResult> =>
    createDirectConvertEngine().parse([{ name: 'hauls.csv', bytes: new TextEncoder().encode(text), source: 'dropped' }, ...(companion === undefined ? [] : [{ name: 'c.csv', bytes: new TextEncoder().encode(companion), source: 'dropped' as const }])]);

  it('writes the answer by header hash and row count, never the header text or a number', async () => {
    const run = await load([{ name: 'hauls.csv', text: HAULS }]);
    fireEvent.click(button(item('IN-DECIMAL-AMBIGUOUS')!, T['convert.finding.thousandsSeparator']));
    await waitFor(() => expect(item('CONV-DECIMAL-DECLARED')).not.toBeNull());
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const text = run.download.mock.calls[0][0] as string;
    expect(text).toContain(`decimalReading=thousands:hauls.csv:${keyHashes(HEADER, [CHL])}:2`);
    expect(text).not.toMatch(/Chlorophyll|1,250/);
  });

  it('is applied for the same column and rows ("from the file", with "Ask again") and the page writes it back', async () => {
    const run = await load([{ name: 'hauls.csv', text: HAULS }, { name: 'c.csv', text: line(2) }]);
    await waitFor(() => expect(item('CONV-DECIMAL-DECLARED')?.textContent).toContain('companion file'));
    expect(item('IN-DECIMAL-AMBIGUOUS')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    expect(run.download.mock.calls[0][0]).toContain(`decimalReading=thousands:hauls.csv:${keyHashes(HEADER, [CHL])}:2`);
    fireEvent.click(button(item('CONV-DECIMAL-DECLARED')!, T['convert.finding.askAgain']));
    await waitFor(() => expect(item('IN-DECIMAL-AMBIGUOUS')).not.toBeNull());
  });

  it('is not applied, and the question stays open, when a row is added or the header is renamed', async () => {
    const more = HAULS + 'S3;k3;2023-06-14;57,5;3,5;Calanus finmarchicus;6;3,000\n';
    const a = await parsed(more, line(2));
    expect(a.files[0].decimal).toBeUndefined();
    const renamed = HAULS.replace('Chlorophyll', 'Chl');
    const b = await parsed(renamed, line(2));
    expect(b.files[0].decimal).toBeUndefined();
    const run = await load([{ name: 'hauls.csv', text: renamed }, { name: 'c.csv', text: line(2) }]);
    expect(item('IN-DECIMAL-AMBIGUOUS')).not.toBeNull();
    expect(item('CONV-DECIMAL-DECLARED')).toBeNull();
    expect(run.calls).toEqual([]);
  });

  it('decimalReadingSettingsOf keeps the answer for a sheet in use only', async () => {
    const p = await parsed(HAULS, line(2, 'decimal'));
    const choices = initialChoices(p);
    expect(decimalReadingSettingsOf(p, choices)).toEqual([{ sheet: 'hauls.csv', reading: 'decimal', hash: keyHashes(HEADER, [CHL])!, rows: 2 }]);
    const key = `${p.files[0].fileId}\u0000hauls.csv`;
    expect(decimalReadingSettingsOf(p, { ...choices, [key]: { ...choices[key], use: false } })).toEqual([]);
  });
});
