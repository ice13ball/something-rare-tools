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

  it('shows the first 5 ranges and "Show all 13 lines"; heading with its count, level badge and rule id stay out of the collapsible part', async () => {
    const container = await report();
    const item = container.querySelector('li.finding[data-severity="error"]') as HTMLElement;
    expect(item).toBeTruthy();
    const plain = within(item).getByTestId('plain');
    const more = plain.querySelector('.collapsible-more') as HTMLElement;
    expect(more.hasAttribute('hidden')).toBe(true);
    const button = within(plain).getByRole('button', { name: 'Show all 13 lines' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    // the first five lines are in the text that stays; the sixth is in the hidden part
    expect(visibleText(plain)).toContain('but lines 3, 5, 7, 9, 11, … are outside this range');
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
    // one toggle per finding: the technical line and the Lines row inside the details show in full
    expect(item.querySelectorAll('.collapsible')).toHaveLength(1);
    expect(item.querySelector('details dl')?.textContent).toContain('3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27');
    expect(item.querySelector('details .technical .collapsible')).toBeNull();
    // the button has its context: it describes itself by the sentence it stands in
    expect(button.getAttribute('aria-describedby')).toBe((plain.querySelector('.collapsible') as HTMLElement).id);
    // expanding shows all and "Collapse"; the sentence is whole
    fireEvent.click(button);
    expect(more.hasAttribute('hidden')).toBe(false);
    expect(plain.textContent).toContain('lines 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27');
    expect(within(plain).getByRole('button', { name: 'Collapse' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('what the page downloads is byte-for-byte the same with the list collapsed and with it open', async () => {
    const download = vi.fn();
    const { container } = render(<CheckPage engine={createDirectEngine()} download={download} />);
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File([CSV], 'lat.csv', { type: 'text/csv' })] } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and check' }));
    await screen.findByRole('heading', { name: 'Report' });
    const labels = ['Clean CSV', 'Sidecar CSV (column mapping)', 'ISO 19139 XML', 'DataCite XML', 'GeoJSON of all datasets'];
    const take = async (): Promise<unknown[][]> => {
      download.mockClear();
      for (const [i, label] of labels.entries()) {
        fireEvent.click(screen.getByRole('button', { name: label }));
        await waitFor(() => expect(download).toHaveBeenCalledTimes(i + 1));
      }
      return download.mock.calls.map((c) => [...c]);
    };
    const collapsed = await take();
    expect(screen.getAllByRole('button', { name: /^Show all \d+ lines$/ }).length).toBeGreaterThan(0);
    for (const b of screen.getAllByRole('button', { name: /^Show all \d+ lines$/ })) fireEvent.click(b);
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull();
    const open = await take();
    expect(open).toEqual(collapsed);
    expect(String(collapsed[0]![0]).split('\n').length).toBeGreaterThan(26);
  });

  it('11 blocks of 50 adjacent lines: the button says 550 lines, not 11', async () => {
    const r = ['Station_ID,Lat,Lon,Date,Depth_m,DIC_umol_kg'];
    for (let blk = 0; blk < 11; blk++) {
      for (let i = 0; i < 50; i++) r.push(`B${blk}-${i},95.5,15.1,2021-07-25,${i + 1},${2100 + i}`);
      r.push(`OK${blk},55.5,15.1,2021-07-25,1,2100`);
    }
    const { container } = render(<CheckPage engine={createDirectEngine()} />);
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File([r.join('\n') + '\n'], 'blocks.csv', { type: 'text/csv' })] } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and check' }));
    await screen.findByRole('heading', { name: 'Report' });
    const item = container.querySelector('li.finding[data-severity="error"]') as HTMLElement;
    const plain = within(item).getByTestId('plain');
    expect(within(plain).getByRole('button', { name: 'Show all 550 lines' })).toBeTruthy();
    expect(visibleText(plain)).toContain('lines 2\u201351, 53\u2013102, 104\u2013153, 155\u2013204, 206\u2013255, \u2026');
    expect(visibleText(plain)).toContain('Show all 550 lines');
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
    const toggle = within(q).getByRole('button', { name: 'Show all 13 lines' });
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
    // the tree examples are not collapsible: every level that exists is shown
    const nodes = document.querySelector('.convert-nodes') as HTMLElement;
    expect(nodes).toBeTruthy();
    expect(nodes.querySelector('[data-level="sample"]')).toBeTruthy();
    expect(nodes.querySelector('[hidden]')).toBeNull();
    expect(nodes.closest('.collapsible')).toBeNull();
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
    fireEvent.click(within(document.querySelector('li[data-rule="CONV-ROW-NOT-UNDERSTOOD"]') as HTMLElement).getByRole('button', { name: 'Show all 13 lines' }));
    fireEvent.click(screen.getAllByTestId('not-written-button')[0]!);
    await waitFor(() => expect(run.downloadFile).toHaveBeenCalledTimes(2));
    const second = await textOf((run.downloadFile.mock.calls[1] as [Blob, string])[0]);
    expect(second).toBe(first);
    expect(first.split('\n').filter((l) => l.startsWith('w1.csv,w1.csv,')).length).toBeGreaterThanOrEqual(13);
  });
});

describe('/convert: a group a button acts on stays open', () => {
  async function section(csv: string): Promise<HTMLElement> {
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'g.csv', text: csv }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    const confirm = screen.queryByRole('button', { name: /^Confirm all shown/ });
    if (confirm) fireEvent.click(confirm);
    fireEvent.change(screen.getByLabelText(T['convert.quantity.kind']), { target: { value: 'count' } });
    return (await screen.findByRole('heading', { name: T['convert.splits.title'] })).closest('section') as HTMLElement;
  }

  it('12 doubted names show all 12 beside their button, no toggle, and the button approves all 12', async () => {
    const names = Array.from({ length: 12 }, (_, i) => `Abc${String.fromCharCode(97 + i)} bbb ${i + 2}`);
    const sec = await section(`Sample,Station,Latitude,Longitude,Date,${names.join(',')}\na,S,55,3,2020-01-01,${Array(12).fill(1).join(',')}\n`);
    const digits = within(sec).getByRole('group', { name: /digit/ });
    expect(digits.querySelectorAll('li')).toHaveLength(12);
    expect(digits.querySelector('[hidden]')).toBeNull();
    expect(digits.querySelector('.collapsible')).toBeNull();
    expect(within(digits).queryByRole('button', { name: /Show all/ })).toBeNull();
    fireEvent.click(within(digits).getByRole('button', { name: 'Approve 12 names as written' }));
    await waitFor(() => expect(within(sec).queryByRole('group', { name: /digit/ })).toBeNull());
  });

  it('a group of 15 underscore names shows all 15 beside its button', async () => {
    const names = Array.from({ length: 15 }, (_, i) => `Gen${String.fromCharCode(97 + i)}_specx${String.fromCharCode(97 + i)}`);
    const sec = await section(`Sample,Station,Latitude,Longitude,Date,${names.join(',')}\na,S,55,3,2020-01-01,${Array(15).fill(1).join(',')}\n`);
    const groups = within(sec).getAllByRole('group');
    const group = groups.find((g) => within(g).queryByRole('button', { name: /^Approve 15 names as written$/ }) !== null || within(g).queryByRole('button', { name: /^Write 15 names with a space/ }) !== null) as HTMLElement;
    expect(group).toBeTruthy();
    expect(group.querySelectorAll('li')).toHaveLength(15);
    expect(group.querySelector('[hidden]')).toBeNull();
    expect(group.querySelector('.collapsible')).toBeNull();
    expect(within(group).queryByRole('button', { name: /Show all/ })).toBeNull();
  });
});

describe('the sex-letter group and the tree stay open', () => {
  it('12 names with a sex letter are all shown beside the group button', async () => {
    const names = Array.from({ length: 12 }, (_, i) => `${String.fromCharCode(65 + i)}. vanus ${i % 2 === 0 ? 'm' : 'f'}`);
    const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} />);
    chooseFiles(view.container, [{ name: 's.csv', text: `Sample,Station,Latitude,Longitude,Date,${names.map((n) => `"${n}"`).join(',')}\na,S,55,3,2020-01-01,${Array(12).fill(1).join(',')}\n` }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    const confirm = screen.queryByRole('button', { name: /^Confirm all shown/ });
    if (confirm) fireEvent.click(confirm);
    fireEvent.change(screen.getByLabelText(T['convert.quantity.kind']), { target: { value: 'count' } });
    const sec = (await screen.findByRole('heading', { name: T['convert.splits.title'] })).closest('section') as HTMLElement;
    const group = within(sec).getByRole('group', { name: T['convert.splits.sexGroup'] });
    expect(group.querySelectorAll('li')).toHaveLength(12);
    expect(group.querySelector('[hidden]')).toBeNull();
    expect(group.querySelector('.collapsible')).toBeNull();
    expect(within(group).queryByRole('button', { name: /Show all/ })).toBeNull();
  });
});
