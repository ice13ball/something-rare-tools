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
import { keyHashes } from '../../src/core/convert/keySetting';
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
    expect(text).toContain(`declaredPosition=54.1:10.9:500:2:${SHEET}`);
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
    const companion = writeConvertSidecar({ declaredPosition: [{ sheet: SHEET, lat: '54.1', lon: '10.9', uncertaintyM: '500', rows: 2 }] });
    const run = await load([{ name: 'tanks.csv', text: BLANK_COLUMNS }, { name: 'c.csv', text: companion }]);
    expect(last(run).declaredPosition).toBeUndefined();
    expect(item('CONV-POSITION-DECLARED-INVALID')).toBeNull();
    expect(screen.getByTestId('position-held-back').textContent).toContain(T['convert.position.heldBack.column']);
    expect((screen.getByLabelText(T['convert.position.lat']) as HTMLInputElement).value).toBe('54.1');
  });

  it('a declaration kept in the form is not hidden when the sheet becomes a profile; it can be cleared', async () => {
    const run = await load([{ name: 'tanks.csv', text: TANKS }]);
    type(T['convert.position.lat'], '54.1');
    type(T['convert.position.lon'], '10.9');
    type(T['convert.position.uncertainty'], '500');
    await waitFor(() => expect(last(run).declaredPosition).toBeDefined());
    fireEvent.click(screen.getByLabelText(T['convert.sheet.profile']));
    await waitFor(() => expect(screen.getByTestId('position-held-back').textContent).toContain(T['convert.position.heldBack.profile']));
    await idle();
    fireEvent.click(within(screen.getByTestId('position-held-back')).getByRole('button', { name: T['convert.position.clear'] }));
    await waitFor(() => expect(screen.queryByTestId('position-held-back')).toBeNull());
    await waitFor(() => expect(last(run).declaredPosition).toBeUndefined());
    await idle();
    expect(item('CONV-POSITION-DECLARED-INVALID')).toBeNull();
  });
});

describe('a saved position is tied to the sheet it was typed for (final review M2)', () => {
  it('a companion file of a sheet of the same name with another number of rows is not applied, and the form says so', async () => {
    const stale = writeConvertSidecar({ declaredPosition: [{ sheet: SHEET, lat: '54.1', lon: '10.9', uncertaintyM: '500', rows: 5 }] });
    const run = await load([{ name: 'tanks.csv', text: TANKS }, { name: 'c.csv', text: stale }]);
    expect(last(run).declaredPosition).toBeUndefined();
    expect((screen.getByLabelText(T['convert.position.lat']) as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('position-stale').textContent).toBe(T['convert.position.staleFile']);
    expect(item('CONV-POSITION-DECLARED')).toBeNull();
    // typing the person's own position takes the note away
    type(T['convert.position.lat'], '54.1');
    await waitFor(() => expect(screen.queryByTestId('position-stale')).toBeNull());
  });

  it('the same companion for the same number of rows still pre-fills', async () => {
    const same = writeConvertSidecar({ declaredPosition: [{ sheet: SHEET, lat: '54.1', lon: '10.9', uncertaintyM: '500', rows: 2 }] });
    const run = await load([{ name: 'tanks.csv', text: TANKS }, { name: 'c.csv', text: same }]);
    expect(last(run).declaredPosition).toEqual({ lat: '54.1', lon: '10.9', uncertaintyM: '500' });
    expect(screen.queryByTestId('position-stale')).toBeNull();
  });
});

describe('a sheet whose positions come from a joined sheet (final review M1)', () => {
  const RESULTS = csvOf(['Sample', 'Taxon', 'Count'], [['X01', 'Calanus finmarchicus', 12], ['X01', 'Oithona similis', 3], ['X02', 'Calanus finmarchicus', 7]]);
  const SAMPLES = csvOf(['Sample', 'Date', 'Latitude', 'Longitude'], [['X01', '2021-05-03', 61.1, 4.2], ['X02', '2021-05-04', 61.3, 4.6]]);
  const FILES = [{ name: 'results.csv', text: RESULTS }, { name: 'samples.csv', text: SAMPLES }];
  async function companionOf(position: boolean): Promise<string> {
    const parsed = await createDirectConvertEngine().parse(FILES.map((f) => ({ name: f.name, bytes: new TextEncoder().encode(f.text), source: 'dropped' as const })));
    const r = parsed.files.find((f) => f.fileName === 'results.csv')!;
    const d = parsed.files.find((f) => f.fileName === 'samples.csv')!;
    return writeConvertSidecar({
      sampleJoin: [{ results: ['results.csv', 'results.csv'], description: ['samples.csv', 'samples.csv'], resultsRows: r.sheets[0].rowCount, descriptionRows: d.sheets[0].rowCount, resultsHashes: keyHashes(r.sheets[0].header, [0])!, descriptionHashes: keyHashes(d.sheets[0].header, [0])!, conflicts: [] }],
      ...(position ? { declaredPosition: [{ sheet: 'results.csv', lat: '54.1', lon: '10.9', uncertaintyM: '500', rows: r.sheets[0].rowCount }] } : {}),
    });
  }
  const resultsBody = (r: Run): ConvertRequestBody['sheets'][number] => r.bodies[r.bodies.length - 1].sheets.find((s) => s.sheet === 'results.csv')!;

  it('a position restored from the companion file is not sent, is shown as not applied with the joined sheet named, and does not block', async () => {
    const companion = await companionOf(true);
    const run = await load([...FILES, { name: 'c.csv', text: companion }]);
    await waitFor(() => expect(run.bodies[run.bodies.length - 1].sampleJoin).toBeDefined());
    await idle();
    expect(resultsBody(run).declaredPosition).toBeUndefined();
    expect(item('CONV-POSITION-DECLARED-INVALID')).toBeNull();
    expect(item('CONV-POSITION-NONE')).toBeNull();
    const note = screen.getByTestId('position-held-back').textContent!;
    expect(note).toContain('samples.csv');
    expect(note).not.toContain(T['convert.position.heldBack.column']);
  });

  it('a position the person typed before the join is sent, and the refusal says the position comes from the joined sheet', async () => {
    const run = await load(FILES);
    type(T['convert.position.lat'], '54.1');
    type(T['convert.position.lon'], '10.9');
    type(T['convert.position.uncertainty'], '500');
    await waitFor(() => expect(resultsBody(run).declaredPosition).toBeDefined());
    await idle();
    fireEvent.click(screen.getByRole('button', { name: T['convert.join.confirm'] }));
    await waitFor(() => expect(run.bodies[run.bodies.length - 1].sampleJoin).toBeDefined());
    await idle();
    expect(resultsBody(run).declaredPosition).toEqual({ lat: '54.1', lon: '10.9', uncertaintyM: '500' });
    const refused = item('CONV-POSITION-DECLARED-INVALID')!;
    expect(refused.textContent).toContain('joined sheet "samples.csv"');
    expect(refused.textContent).not.toContain('already has a latitude or longitude column');
  });
});

describe('the companion line', () => {
  it('round-trips a negative decimal-comma latitude (the field is quoted)', () => {
    const text = writeConvertSidecar({ declaredPosition: [{ sheet: 'Tanks', lat: '-54,125', lon: '10.9', uncertaintyM: '500', rows: 4 }] });
    const read = readConvertSettings(textFile('c.csv', text))!;
    expect(read.declaredPosition).toEqual([{ sheet: 'Tanks', lat: '-54,125', lon: '10.9', uncertaintyM: '500', rows: 4 }]);
  });

  it('pre-fills a sheet of that name whatever its proposed roles', async () => {
    const companion = writeConvertSidecar({ declaredPosition: [{ sheet: SHEET, lat: '54.1', lon: '10.9', uncertaintyM: '500', rows: 2 }] });
    const engine = createDirectConvertEngine();
    const enc = (s: string) => new TextEncoder().encode(s);
    const plain = await engine.parse([{ name: 'tanks.csv', bytes: enc(TANKS), source: 'dropped' }, { name: 'c.csv', bytes: enc(companion), source: 'dropped' }]);
    const c = initialChoices(plain)[`${plain.files[0].fileId}\u0000${SHEET}`];
    expect([c.positionLat, c.positionLon, c.positionUncertainty, c.positionFromFile]).toEqual(['54.1', '10.9', '500', true]);
    const withColumn = await engine.parse([{ name: 'tanks.csv', bytes: enc(BLANK_COLUMNS), source: 'dropped' }, { name: 'c.csv', bytes: enc(companion), source: 'dropped' }]);
    // filled whatever the roles (they are not in the file): the request holds it back and the form says so
    expect(initialChoices(withColumn)[`${withColumn.files[0].fileId}\u0000${SHEET}`].positionLat).toBe('54.1');
  });
});
