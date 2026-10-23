// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// The confirm-step checkbox "one cruise of one ship": per upload, restored only from a dropped mapping file, never from storage.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { CheckPage } from '../../src/app/pages/CheckPage';
import { createDirectEngine } from '../../src/worker/handler';

const LABEL = 'All measurements in these files come from one cruise of one ship';

function trackCsv(extraHeader = '', extraCell = ''): string {
  const lines = [`Station,Latitude,Longitude,Date,Temperature [degC]${extraHeader}`];
  for (let i = 0; i < 12; i++) {
    const t = new Date(Date.UTC(2021, 6, 1) + i * 6 * 3_600_000).toISOString().slice(0, 16);
    lines.push(`S${i},${i === 8 ? '58.00' : (70 + i).toFixed(2)},15.50,${t},4.2${extraCell}`);
  }
  return lines.join('\n') + '\n';
}

const file = (name: string, text: string): File => new File([text], name, { type: 'text/csv' });
const drop = (container: HTMLElement, files: File[]): void => void fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files } });
const submit = (container: HTMLElement): void => void fireEvent.submit(container.querySelector('form') as HTMLFormElement);
const box = (): HTMLInputElement => screen.getByLabelText(LABEL) as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

describe('the "one cruise of one ship" checkbox', () => {
  it('starts unticked; unticked, the report says the speed was not checked and how to switch it on', async () => {
    const { container } = render(<CheckPage engine={createDirectEngine()} />);
    drop(container, [file('cruise.csv', trackCsv())]);
    submit(container);
    await screen.findByRole('heading', { name: 'Confirm how your files are read' });
    expect(box().checked).toBe(false);
    expect(screen.getByText(/Tick if so: the tool then checks whether the ship could have sailed/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and check' }));
    await screen.findByRole('heading', { name: 'Report' });
    expect(container.textContent).toContain('Whether the ship could have sailed between the stations');
    expect(container.textContent).not.toContain('Line numbers:');
  });

  it('ticked, the finding appears; the tick is not stored anywhere, and the next upload starts unticked', async () => {
    const { container } = render(<CheckPage engine={createDirectEngine()} />);
    drop(container, [file('cruise.csv', trackCsv())]);
    submit(container);
    await screen.findByRole('heading', { name: 'Confirm how your files are read' });
    fireEvent.click(box());
    expect(box().checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and check' }));
    await screen.findByRole('heading', { name: 'Report' });
    expect(container.textContent).toContain('Line numbers: 10');
    expect(container.textContent).not.toContain('Whether the ship could have sailed between the stations');
    expect(JSON.stringify({ ...localStorage })).not.toMatch(/cruise|singleCruise/i);
    expect(JSON.stringify({ ...sessionStorage })).not.toMatch(/cruise|singleCruise/i);

    // a different set of files, same page: unticked again
    drop(container, [file('other.csv', trackCsv())]);
    submit(container);
    await screen.findByRole('heading', { name: 'Confirm how your files are read' });
    expect(box().checked).toBe(false);
  });

  it('a mapping file dropped with the files restores the tick; without it the tick is off', async () => {
    const e = createDirectEngine();
    // the sidecar of a declared run
    const p = await e.parse([{ name: 'cruise.csv', bytes: new TextEncoder().encode(trackCsv()), source: 'dropped' }], [], []);
    const pr = await e.propose(p.files[0].fileId, p.files[0].layout);
    await e.build(p.files[0].fileId, p.files[0].layout, pr.mappings);
    const res = await e.check({ singleCruise: true });
    const sidecar = await e.export('sidecar', [res.datasets[0].id]);

    const { container } = render(<CheckPage engine={createDirectEngine()} />);
    drop(container, [file('cruise.csv', trackCsv()), file('cruise.sidecar.csv', sidecar)]);
    submit(container);
    await screen.findByRole('heading', { name: 'Confirm how your files are read' });
    expect(box().checked).toBe(true);
    expect(container.textContent).toContain('cruise.sidecar.csv');
    // the mapping file is not offered as a data table
    expect(container.textContent).not.toContain('File: cruise.sidecar.csv');

    // starting again keeps the file list the visitor sees; taking the mapping file out of it is what switches the restored tick off
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove cruise.sidecar.csv' }));
    submit(container);
    await screen.findByRole('heading', { name: 'Confirm how your files are read' });
    expect(box().checked).toBe(false);
  });

  it('a mapped cruise column takes precedence and the page says so', async () => {
    const { container } = render(<CheckPage engine={createDirectEngine()} />);
    drop(container, [file('cruise.csv', trackCsv(',Cruise', ',AMT99'))]);
    submit(container);
    await screen.findByRole('heading', { name: 'Confirm how your files are read' });
    expect(container.textContent).toContain('takes precedence over this tick in: cruise.csv');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and check' }));
    await screen.findByRole('heading', { name: 'Report' });
    // the column formed the group: the finding appears without any tick, and no sentence about mixed ships
    expect(container.textContent).toContain('Line numbers: 10');
    expect(container.textContent).not.toContain('untick');
  });
});
