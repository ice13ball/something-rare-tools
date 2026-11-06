// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Task 9, on the pages: a finding that lists more than 10 line ranges is collapsed to the first 5 behind "Show all (N)", while its heading with the count, its level, its rule id and every decision
// button stay outside the collapsible part; and the collapse is view state only: what the pages download is the same whether the list is open or not. Every value is invented.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { CheckPage } from '../../src/app/pages/CheckPage';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { createDirectEngine } from '../../src/worker/handler';
import { W1_HEADER, W1_ROWS } from '../convert/helpers';
import { chooseFiles, csvOf } from './convertHelpers';

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

/** The text a reader sees: everything but what sits inside a `hidden` element. */
function visibleText(el: Node): string {
  if (el.nodeType === 3) return el.textContent ?? '';
  if (el instanceof Element && el.hasAttribute('hidden')) return '';
  return [...el.childNodes].map(visibleText).join('');
}
const inCollapsible = (el: Element | null): boolean => el !== null && el.closest('.collapsible') !== null;

describe('/check: a finding with more than 10 line ranges', () => {
  // 13 rows with a latitude of 95 (lines 3, 5, ... 27), every other row in order: 13 ranges, none of them next to another
  const rows = ['Station_ID,Lat,Lon,Date,Depth_m,DIC_umol_kg'];
  for (let i = 0; i < 26; i++) rows.push(`ST${i},${i % 2 === 1 ? 95 : 55.5},15.1,2021-07-25,${i + 1},${2100 + i}`);
  const CSV = rows.join('\n') + '\n';

  async function report(): Promise<HTMLElement> {
    const { container } = render(<CheckPage engine={createDirectEngine()} />);
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File([CSV], 'lat.csv', { type: 'text/csv' })] } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and check' }));
    await screen.findByRole('heading', { name: 'Report' });
    return container;
  }

  it('shows the first 5 ranges and "Show all (13)"; heading with its count, level badge and rule id stay out of the collapsible part', async () => {
    const container = await report();
    const item = container.querySelector('li.finding[data-severity="error"]') as HTMLElement;
    expect(item).toBeTruthy();
    const plain = within(item).getByTestId('plain');
    const more = plain.querySelector('.collapsible-more') as HTMLElement;
    expect(more.hasAttribute('hidden')).toBe(true);
    const button = within(plain).getByRole('button', { name: 'Show all (13)' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    // the first five lines are in the text that stays; the sixth is in the hidden part
    expect(visibleText(plain)).toContain('but lines 3, 5, 7, 9, 11, … Show all (13) are outside');
    expect(visibleText(plain)).not.toContain('13, 15');
    expect(more.textContent).toBe(', 13, 15, 17, 19, 21, 23, 25, 27');
    // what always stays: the group heading with its count, the level, the rule id, the summary counts
    expect(within(container).getByRole('heading', { name: /Errors \(1\)/ })).toBeTruthy();
    expect(inCollapsible(container.querySelector('.finding-group h3'))).toBe(false);
    expect(inCollapsible(item.querySelector('.badge'))).toBe(false);
    expect(item.querySelector('.badge')?.textContent).toBe(T['severity.error']);
    const ruleId = within(item).getByText('ROW-LAT-RANGE');
    expect(inCollapsible(ruleId)).toBe(false);
    expect(screen.getByTestId('summary').textContent).toMatch(/Errors: 1/);
    // the lines row of the details is its own list, collapsed the same way
    expect(item.querySelectorAll('.collapsible')).toHaveLength(3);
    // expanding shows all and "Collapse"; the sentence is whole
    fireEvent.click(button);
    expect(more.hasAttribute('hidden')).toBe(false);
    expect(plain.textContent).toContain('lines 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27');
    expect(within(plain).getByRole('button', { name: 'Collapse' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('what is downloaded does not depend on the collapse: the exported text is the same before and after opening a list', async () => {
    const engine = createDirectEngine();
    const { container } = render(<CheckPage engine={engine} />);
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File([CSV], 'lat.csv', { type: 'text/csv' })] } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and check' }));
    await screen.findByRole('heading', { name: 'Report' });
    const kinds = ['cleanCsv', 'sidecar', 'iso19139', 'datacite', 'geojson'] as const;
    const take = async (): Promise<string[]> => Promise.all(kinds.map((k) => engine.export(k, [])));
    const before = await take();
    for (const b of screen.getAllByRole('button', { name: /^Show all \(\d+\)$/ })) fireEvent.click(b);
    const after = await take();
    expect(after).toEqual(before);
    expect(before.every((x) => typeof x === 'string')).toBe(true);
    expect(before[0]!.split('\n').length).toBeGreaterThan(26);
  });
});

describe('/convert: a question with more than 10 line ranges', () => {
  // 13 ragged rows (an extra field), each between two good rows: 13 ranges the converter cannot place
  const rows = W1_ROWS.map((r) => [...r]);
  const lines: (string | number | null)[][] = [];
  for (let i = 0; i < 13; i++) {
    lines.push([...rows[i % 3]!.slice(0, 2), `K${i}-a`, ...rows[i % 3]!.slice(3)]);
    lines.push([...rows[i % 3]!.slice(0, 2), `K${i}-b`, ...rows[i % 3]!.slice(3), 'EXTRA-FIELD']);
  }
  const CSV = csvOf(W1_HEADER, lines);

  const summary = (): HTMLElement => screen.getByRole('region', { name: T['convert.summary.title'] });
  const pick = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });

  async function load(): Promise<{ container: HTMLElement; download: ReturnType<typeof vi.fn>; downloadFile: ReturnType<typeof vi.fn> }> {
    const download = vi.fn();
    const downloadFile = vi.fn();
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={download} downloadFile={downloadFile} />);
    chooseFiles(view.container, [{ name: 'w1.csv', text: CSV }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    fireEvent.click(screen.getByRole('button', { name: /Confirm all shown/ }));
    pick(T['convert.quantity.kind'], 'count');
    pick(T['convert.effort.title'], 'column');
    fireEvent.click(await screen.findByRole('button', { name: /^Approve \d+ shown/ }));
    fireEvent.click(screen.getByLabelText(T['convert.fullList']));
    await waitFor(() => expect(document.querySelector('li[data-rule="CONV-ROW-NOT-UNDERSTOOD"]')).toBeTruthy());
    return { container: view.container, download, downloadFile };
  }

  it('keeps the heading with its count, the rule, the level and the decision buttons outside the collapsible part', async () => {
    await load();
    const q = document.querySelector('li[data-rule="CONV-ROW-NOT-UNDERSTOOD"]') as HTMLElement;
    const group = q.closest('.convert-findings') as HTMLElement;
    expect(group.getAttribute('data-kind')).toBe('error');
    const heading = group.querySelector('h3') as HTMLElement;
    expect(heading.textContent).toBe(T['convert.summary.blocking'].replace('{n}', String(group.querySelectorAll('li[data-rule]').length)));
    expect(inCollapsible(heading)).toBe(false);
    // the question itself: first five ranges, then the button; the count of rows stays in the sentence
    expect(q.textContent).toContain('13 rows');
    const more = q.querySelector('.collapsible-more') as HTMLElement;
    expect(more.hasAttribute('hidden')).toBe(true);
    const toggle = within(q).getByRole('button', { name: 'Show all (13)' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    // the decision button is visible, and is not inside the collapsible text
    const leave = q.querySelector('[data-testid="leave-out"]') as HTMLElement;
    expect(leave).toBeTruthy();
    expect(inCollapsible(leave)).toBe(false);
    expect(leave.closest('[hidden]')).toBeNull();
    expect(leave.textContent).toBe('Leave these rows out and list them in a file beside the archive');
    // the not-written list and the export block are not collapsible
    expect(inCollapsible(screen.getAllByTestId('not-written-button')[0]!)).toBe(false);
    expect(inCollapsible(screen.getByRole('button', { name: T['convert.export.button'] }))).toBe(false);
    fireEvent.click(toggle);
    expect(more.hasAttribute('hidden')).toBe(false);
    expect(within(q).getByRole('button', { name: 'Collapse' })).toBeTruthy();
    expect(summary()).toBeTruthy();
  });

  it('the downloads are the same with the list collapsed and with it open', async () => {
    const textOf = (b: Blob): Promise<string> =>
      new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsText(b);
      });
    const run = await load();
    fireEvent.click(screen.getAllByTestId('not-written-button')[0]!);
    await waitFor(() => expect(run.downloadFile).toHaveBeenCalledTimes(1));
    const first = await textOf((run.downloadFile.mock.calls[0] as [Blob, string])[0]);
    fireEvent.click(within(document.querySelector('li[data-rule="CONV-ROW-NOT-UNDERSTOOD"]') as HTMLElement).getByRole('button', { name: 'Show all (13)' }));
    fireEvent.click(screen.getAllByTestId('not-written-button')[0]!);
    await waitFor(() => expect(run.downloadFile).toHaveBeenCalledTimes(2));
    const second = await textOf((run.downloadFile.mock.calls[1] as [Blob, string])[0]);
    expect(second).toBe(first);
    expect(first.split('\n').filter((l) => l.startsWith('w1.csv,w1.csv,')).length).toBeGreaterThanOrEqual(13);
  });
});

describe('/convert: a group of doubted names with more than 10 names', () => {
  it('shows 5 names and "Show all (12)", keeps the group button with its count visible, and the button still approves all 12', async () => {
    const names = Array.from({ length: 12 }, (_, i) => `Abc${String.fromCharCode(97 + i)} bbb ${i + 2}`);
    const csv = `Sample,Station,Latitude,Longitude,Date,${names.join(',')}\na,S,55,3,2020-01-01,${Array(12).fill(1).join(',')}\n`;
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'g.csv', text: csv }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    const confirm = screen.queryByRole('button', { name: /^Confirm all shown/ });
    if (confirm) fireEvent.click(confirm);
    fireEvent.change(screen.getByLabelText(T['convert.quantity.kind']), { target: { value: 'count' } });
    const section = (await screen.findByRole('heading', { name: T['convert.splits.title'] })).closest('section') as HTMLElement;
    const digits = within(section).getByRole('group', { name: /digit/ });
    const items = [...digits.querySelectorAll('li')];
    expect(items).toHaveLength(12);
    expect(items.filter((li) => !li.hasAttribute('hidden'))).toHaveLength(5);
    const toggle = within(digits).getByRole('button', { name: 'Show all (12)' });
    const approve = within(digits).getByRole('button', { name: 'Approve 12 names as written' });
    expect(approve.closest('.collapsible')).toBeNull();
    expect(approve.closest('[hidden]')).toBeNull();
    expect(toggle.getAttribute('aria-controls')).toBe(digits.querySelector('ul')!.id);
    fireEvent.click(toggle);
    expect([...digits.querySelectorAll('li')].filter((li) => !li.hasAttribute('hidden'))).toHaveLength(12);
    // the decision is the same open or closed: it approves all twelve
    fireEvent.click(approve);
    await waitFor(() => expect(within(section).queryByRole('group', { name: /digit/ })).toBeNull());
    for (const n of names) expect((within(section).getByLabelText(`Scientific name: ${n}`) as HTMLInputElement).disabled).toBe(true);
  });
});
