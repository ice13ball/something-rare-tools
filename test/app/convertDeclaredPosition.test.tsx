// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Round 3, Task 11, on the page: a sheet with no position at all offers "Declare one position for the sheet" (latitude, longitude, uncertainty in metres) on CONV-POSITION-NONE only;
// the request carries the three typed strings only when all are filled; the companion file keeps the declaration (the person's own) and pre-fills it, said to come from the file until a field is edited.
// Every value is invented.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { initialChoices } from '../../src/app/convertModel';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { readConvertSettings, writeConvertSidecar } from '../../src/core/convert/settings';
import { textFile } from '../helpers/files';
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

const TANKS = csvOf(['Sample', 'Date', 'Species', 'Count'], [['T1', '2023-04-05', 'Calanus finmarchicus', 4], ['T2', '2023-04-06', 'Calanus finmarchicus', 5]]);
const BLANK_COLUMNS = csvOf(['Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'], [['T1', '2023-04-05', '', '', 'Calanus finmarchicus', 4], ['T2', '2023-04-06', '', '', 'Calanus finmarchicus', 5]]);
const SHEET = 'tanks.csv';

interface Run {
  bodies: ConvertRequestBody[];
  download: ReturnType<typeof vi.fn>;
}

async function load(files: { name: string; text: string }[]): Promise<Run> {
  const base = createDirectConvertEngine();
  const bodies: ConvertRequestBody[] = [];
  const engine: ConvertEngine = { ...base, convert: (b) => (bodies.push(b), base.convert(b)) };
  const download = vi.fn();
  const view = render(<ConvertPage engine={engine} download={download} downloadFile={vi.fn()} />);
  chooseFiles(view.container, files);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  const confirm = screen.queryByRole('button', { name: /Confirm all shown/ });
  if (confirm !== null) fireEvent.click(confirm);
  for (const kind of screen.queryAllByLabelText(T['convert.quantity.kind'])) fireEvent.change(kind, { target: { value: 'count' } });
  await idle();
  return { bodies, download };
}

const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const item = (rule: string): HTMLElement | null => document.querySelector(`li[data-rule="${rule}"]`);
const last = (r: Run): ConvertRequestBody['sheets'][number] => r.bodies[r.bodies.length - 1].sheets[0];
const type = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

describe('the declaration on the page', () => {
  it('the button opens the form and focuses latitude; the three typed values are sent and the finding becomes CONV-POSITION-DECLARED', async () => {
    const run = await load([{ name: 'tanks.csv', text: TANKS }]);
    expect(last(run).declaredPosition).toBeUndefined();
    const none = item('CONV-POSITION-NONE')!;
    fireEvent.click(within(none).getByRole('button', { name: T['convert.finding.declarePosition'] }));
    expect(document.activeElement).toBe(screen.getByLabelText(T['convert.position.lat']));
    type(T['convert.position.lat'], '54.1');
    type(T['convert.position.lon'], '10.9');
    // only two of three: nothing is sent
    await idle();
    expect(last(run).declaredPosition).toBeUndefined();
    type(T['convert.position.uncertainty'], '500');
    await waitFor(() => expect(last(run).declaredPosition).toEqual({ lat: '54.1', lon: '10.9', uncertaintyM: '500' }));
    expect(last(run).declaredPositionFromFile).toBeUndefined();
    await idle();
    await waitFor(() => expect(item('CONV-POSITION-DECLARED')).not.toBeNull());
    expect(item('CONV-POSITION-NONE')).toBeNull();
  });

  it('a decimal-comma negative latitude is sent as typed', async () => {
    const run = await load([{ name: 'tanks.csv', text: TANKS }]);
    type(T['convert.position.lat'], '-54,125');
    type(T['convert.position.lon'], '10.9');
    type(T['convert.position.uncertainty'], '500');
    await waitFor(() => expect(last(run).declaredPosition?.lat).toBe('-54,125'));
  });

  it('the companion file keeps the declaration and a reloaded page fills the fields and says it came from the file', async () => {
    const run = await load([{ name: 'tanks.csv', text: TANKS }]);
    type(T['convert.position.lat'], '54.1');
    type(T['convert.position.lon'], '10.9');
    type(T['convert.position.uncertainty'], '500');
    await waitFor(() => expect(last(run).declaredPosition).toBeDefined());
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    const text = run.download.mock.calls[0][0] as string;
    expect(text).toContain(`declaredPosition=54.1:10.9:500:${SHEET}`);
    cleanup();
    const again = await load([{ name: 'tanks.csv', text: TANKS }, { name: 'c.csv', text }]);
    expect(last(again).declaredPosition).toEqual({ lat: '54.1', lon: '10.9', uncertaintyM: '500' });
    expect(last(again).declaredPositionFromFile).toBe(true);
    expect((screen.getByLabelText(T['convert.position.lat']) as HTMLInputElement).value).toBe('54.1');
    await waitFor(() => expect(item('CONV-POSITION-DECLARED')?.textContent).toContain('companion file'));
    type(T['convert.position.uncertainty'], '600');
    await waitFor(() => expect(last(again).declaredPosition?.uncertaintyM).toBe('600'));
    expect(last(again).declaredPositionFromFile).toBeUndefined();
  });

  it('the empty-column variant offers no declare button, and a sheet with a position column has no form section', async () => {
    await load([{ name: 'tanks.csv', text: BLANK_COLUMNS }]);
    const none = item('CONV-POSITION-NONE');
    expect(none).not.toBeNull();
    expect(within(none!).queryByRole('button', { name: T['convert.finding.declarePosition'] })).toBeNull();
    expect(screen.queryByLabelText(T['convert.position.lat'])).toBeNull();
  });

  it('a declaration read from a file is not sent for a sheet that has a position column', async () => {
    const companion = writeConvertSidecar({ declaredPosition: [{ sheet: SHEET, lat: '54.1', lon: '10.9', uncertaintyM: '500' }] });
    const run = await load([{ name: 'tanks.csv', text: BLANK_COLUMNS }, { name: 'c.csv', text: companion }]);
    expect(last(run).declaredPosition).toBeUndefined();
    expect(item('CONV-POSITION-DECLARED-INVALID')).toBeNull();
  });
});

describe('the companion line', () => {
  it('round-trips a negative decimal-comma latitude (the field is quoted)', () => {
    const text = writeConvertSidecar({ declaredPosition: [{ sheet: 'Tanks', lat: '-54,125', lon: '10.9', uncertaintyM: '500' }] });
    const read = readConvertSettings(textFile('c.csv', text))!;
    expect(read.declaredPosition).toEqual([{ sheet: 'Tanks', lat: '-54,125', lon: '10.9', uncertaintyM: '500' }]);
  });

  it('pre-fills only a sheet of that name with no position role', async () => {
    const companion = writeConvertSidecar({ declaredPosition: [{ sheet: SHEET, lat: '54.1', lon: '10.9', uncertaintyM: '500' }] });
    const engine = createDirectConvertEngine();
    const enc = (s: string) => new TextEncoder().encode(s);
    const plain = await engine.parse([{ name: 'tanks.csv', bytes: enc(TANKS), source: 'dropped' }, { name: 'c.csv', bytes: enc(companion), source: 'dropped' }]);
    const c = initialChoices(plain)[`${plain.files[0].fileId}\u0000${SHEET}`];
    expect([c.positionLat, c.positionLon, c.positionUncertainty, c.positionFromFile]).toEqual(['54.1', '10.9', '500', true]);
    const withColumn = await engine.parse([{ name: 'tanks.csv', bytes: enc(BLANK_COLUMNS), source: 'dropped' }, { name: 'c.csv', bytes: enc(companion), source: 'dropped' }]);
    expect(initialChoices(withColumn)[`${withColumn.files[0].fileId}\u0000${SHEET}`].positionLat).toBe('');
  });
});
