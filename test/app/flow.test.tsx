// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Downloads } from '../../src/app/components/Downloads';
import { LayoutConfirm } from '../../src/app/components/LayoutConfirm';
import { LoadProblems } from '../../src/app/components/LoadProblems';
import { MappingEditor } from '../../src/app/components/MappingEditor';
import { MapPreview, type MapLib } from '../../src/app/components/MapPreview';
import { initLang, setLang } from '../../src/app/i18n';
import { CheckPage } from '../../src/app/pages/CheckPage';
import { makeFinding } from '../../src/core/rules/registry';
import { FetchBlockedError, type Fetcher } from '../../src/core/sources/fetcher';
import type { ColumnProposal, LayoutPlan, SheetMapping } from '../../src/core/types';
import { createDirectEngine } from '../../src/worker/handler';
import type { DatasetSummary, Engine } from '../../src/worker/protocol';
import { fixture } from '../sources/mapFetcher';

const wideCsv = readFileSync(join(__dirname, '..', 'fixtures', 'layout-wide.csv'), 'utf-8');
const dataLayer = (): unknown[] => (window as unknown as { dataLayer: unknown[] }).dataLayer;

beforeEach(() => {
  localStorage.clear();
  (window as unknown as { dataLayer: unknown[] }).dataLayer = [];
  initLang();
  setLang('en');
});
afterEach(cleanup);

/** A stand-in for maplibre-gl: records what the preview asks of it. */
function fakeLib() {
  const maps: FakeMap[] = [];
  const popups: FakePopup[] = [];
  class FakeMap {
    handlers: { type: string; layer?: string; fn: (e: unknown) => void }[] = [];
    sources: Record<string, unknown> = {};
    layers: { paint: Record<string, unknown> }[] = [];
    fitted: unknown;
    removed = false;
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
      maps.push(this);
    }
    on(type: string, a: unknown, b?: unknown) {
      this.handlers.push(typeof a === 'string' ? { type, layer: a, fn: b as (e: unknown) => void } : { type, fn: a as (e: unknown) => void });
    }
    fire(type: string, layer?: string, e: unknown = {}) {
      for (const h of this.handlers) if (h.type === type && h.layer === layer) h.fn(e);
    }
    addSource(id: string, s: unknown) {
      this.sources[id] = s;
    }
    addLayer(l: { paint: Record<string, unknown> }) {
      this.layers.push(l);
    }
    fitBounds(b: unknown) {
      this.fitted = b;
    }
    getCanvas() {
      return { style: { cursor: '' } };
    }
    remove() {
      this.removed = true;
    }
  }
  class FakePopup {
    content?: Node;
    constructor() {
      popups.push(this);
    }
    setLngLat() {
      return this;
    }
    setDOMContent(n: Node) {
      this.content = n;
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  }
  const lib = { Map: FakeMap, Popup: FakePopup } as unknown as MapLib;
  return { lib, maps, popups, load: () => Promise.resolve(lib) };
}

function dropInto(container: HTMLElement, files: File[]): void {
  fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files } });
}
const submit = (container: HTMLElement): void => void fireEvent.submit(container.querySelector('form') as HTMLFormElement);

describe('CheckPage flow', () => {
  it('drop -> confirm layout and columns -> report with map and downloads, and analytics carries enums only', async () => {
    localStorage.setItem('consent', 'granted');
    const map = fakeLib();
    const { container } = render(<CheckPage engine={createDirectEngine()} mapLib={map.load} />);
    dropInto(container, [new File([wideCsv], 'layout-wide.csv', { type: 'text/csv' })]);
    submit(container);

    expect(await screen.findByRole('heading', { name: 'Confirm how your files are read' })).toBeTruthy();
    // plain-words layout and the column table
    expect(container.querySelector('.layout-line')?.textContent).toMatch(/one table/);
    const latSelect = screen.getByLabelText('Lat: Meaning') as HTMLSelectElement;
    expect(latSelect.value).toBe('latitude');
    // a unit from the header is prefilled, a column without a unit starts empty
    const dic = screen.getByLabelText('DIC_umol_kg: Meaning').closest('.role-cell') as HTMLElement;
    expect((within(dic).getByLabelText('Unit') as HTMLInputElement).value).toBe('µmol/kg');
    const comment = screen.getByLabelText('Comment: Meaning') as HTMLSelectElement;
    expect(comment.value).toBe('ignore');

    fireEvent.click(screen.getByRole('button', { name: 'Confirm and check' }));
    expect(await screen.findByRole('heading', { name: 'Report' })).toBeTruthy();
    expect(screen.getByTestId('summary').textContent).toMatch(/Errors: \d+ · Warnings: \d+ · Notes: \d+/);
    expect(screen.getByRole('heading', { name: 'Downloads' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clean CSV' })).toBeTruthy();

    // map: lazy lib, points coloured by severity, attribution kept (compact)
    await waitFor(() => expect(map.maps).toHaveLength(1));
    const m = map.maps[0];
    expect(m.options.attributionControl).toEqual({ compact: true });
    m.fire('load');
    expect(Object.keys(m.sources)).toEqual(['rows']);
    expect((m.sources.rows as { data: { features: unknown[] } }).data.features.length).toBeGreaterThan(0);
    expect(JSON.stringify(m.layers[0].paint['circle-color'])).toContain('#ef4444');
    expect(m.layers[0].paint['circle-stroke-width']).toBeGreaterThan(0);
    expect(m.fitted).toBeTruthy();

    // analytics: two events, enums and counts, no file name
    const events = dataLayer().map((a) => Array.from(a as ArrayLike<unknown>)).filter((a) => a[0] === 'event');
    expect(events.map((e) => e[1])).toEqual(['check_started', 'check_finished']);
    expect(events[0][2]).toEqual({ input_type: 'file', mode: 'browser' });
    expect(Object.keys(events[1][2] as object).sort()).toEqual(['input_type', 'mode', 'n_errors', 'n_info', 'n_warnings']);
    expect(JSON.stringify(dataLayer())).not.toContain('layout-wide');
  });

  it('a role edited in the table reaches the build: no latitude, no points on the map', async () => {
    const map = fakeLib();
    const { container } = render(<CheckPage engine={createDirectEngine()} mapLib={map.load} />);
    dropInto(container, [new File([wideCsv], 'layout-wide.csv')]);
    submit(container);
    const lat = (await screen.findByLabelText('Lat: Meaning')) as HTMLSelectElement;
    fireEvent.change(lat, { target: { value: 'ignore' } });
    expect((screen.getByLabelText('Lat: Meaning') as HTMLSelectElement).value).toBe('ignore');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and check' }));
    await screen.findByRole('heading', { name: 'Map' });
    expect(screen.getByText('No row has a position that can be shown on the map.')).toBeTruthy();
    expect(map.maps).toHaveLength(0);
  });

  it('puts the drop zone first and the download mode right after the link field it applies to, still before the Check button', () => {
    const { container } = render(<CheckPage engine={createDirectEngine()} mapLib={fakeLib().load} />);
    const order = [...container.querySelectorAll('.dropzone, input[type="text"], fieldset.mode-switch, button[type="submit"]')].map((e) => e.className || e.tagName);
    expect(order).toEqual(['dropzone', 'INPUT', 'mode-switch', 'button']);
  });

  it('Enter on a download-mode radio does not submit the form the switch now sits in', () => {
    const { container } = render(<CheckPage engine={createDirectEngine()} mapLib={fakeLib().load} />);
    const radio = container.querySelector('input[name="download-mode"]') as HTMLInputElement;
    const enter = createEvent.keyDown(radio, { key: 'Enter' });
    fireEvent(radio, enter);
    expect(enter.defaultPrevented).toBe(true);
    const other = createEvent.keyDown(radio, { key: 'ArrowRight' });
    fireEvent(radio, other);
    expect(other.defaultPrevented).toBe(false);
  });

  it('shows at most 5 sample values per column even for a 70k-row file', async () => {
    const lines = ['Station,Lat,Lon,Date,DIC_umol_kg'];
    for (let i = 0; i < 70000; i++) lines.push(`ST${i % 50},76.5,15.1,2021-07-25,${2100 + (i % 7)}`);
    const { container } = render(<CheckPage engine={createDirectEngine()} mapLib={fakeLib().load} />);
    dropInto(container, [new File([lines.join('\n')], 'big.csv')]);
    submit(container);
    await screen.findByRole('heading', { name: 'Confirm how your files are read' });
    for (const td of container.querySelectorAll('td.samples')) expect(td.querySelectorAll('.sample').length).toBeLessThanOrEqual(5);
    expect(container.querySelectorAll('tbody tr').length).toBe(5);
  });

  it('an unknown link says to download the file and drop it here, in all four languages', async () => {
    const texts: Record<string, RegExp> = {
      en: /not a Zenodo, GeoNetwork, PANGAEA record or DOI\. Download the file and drop it here\./,
      pl: /Ten link nie jest rekordem Zenodo/,
      de: /Dieser Link ist kein Zenodo/,
      fr: /Ce lien n'est ni une fiche Zenodo/,
    };
    for (const [lang, re] of Object.entries(texts)) {
      setLang(lang as 'en');
      const { container, unmount } = render(<CheckPage engine={createDirectEngine()} fetcherFor={() => ({ get: () => Promise.reject(new Error('must not fetch')) })} />);
      fireEvent.change(container.querySelector('input[type="text"]') as HTMLInputElement, { target: { value: 'https://example.com/data.csv' } });
      submit(container);
      expect((await screen.findByRole('alert')).textContent).toMatch(re);
      unmount();
    }
  });

  it('a blocked browser download shows the host and both ways out; switching mode does not retry by itself', async () => {
    const calls: string[] = [];
    const fetcher: Fetcher = {
      async get(url) {
        calls.push(url);
        throw new FetchBlockedError('zenodo.org');
      },
    };
    const modes: string[] = [];
    const { container } = render(
      <CheckPage
        engine={createDirectEngine()}
        fetcherFor={(m) => {
          modes.push(m);
          return fetcher;
        }}
      />,
    );
    fireEvent.change(container.querySelector('input[type="text"]') as HTMLInputElement, { target: { value: 'https://zenodo.org/records/2000001' } });
    submit(container);
    const panel = await screen.findByRole('alert', { name: 'A file could not be downloaded' });
    expect(panel.textContent).toContain('zenodo.org');
    expect(panel.textContent).toContain('Download the file yourself and drop it here');
    expect(within(panel).getByText('Or download the file yourself and drop it here.')).toBeTruthy();
    const callsBefore = calls.length;
    fireEvent.click(within(panel).getByRole('button', { name: 'Switch to server mode' }));
    expect((screen.getByRole('radio', { name: /Via the Abyssal Claims server/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Server mode is selected. Click Check again to retry.')).toBeTruthy();
    expect(calls.length).toBe(callsBefore);
    expect(modes).toEqual(['browser']);
    // the user clicks Check again: now the server fetcher is used
    submit(container);
    await waitFor(() => expect(modes).toEqual(['browser', 'server']));
  });

  it('loads a Zenodo record, shows per-file status lines and checks the downloaded file', async () => {
    const fetcher: Fetcher = {
      async get(url) {
        if (url === 'https://zenodo.org/api/records/2000001') return { status: 200, bytes: new TextEncoder().encode(fixture('sources-zenodo-csv.json')), finalUrl: url };
        return { status: 200, bytes: new TextEncoder().encode(wideCsv), finalUrl: url };
      },
    };
    const { container } = render(<CheckPage engine={createDirectEngine()} fetcherFor={() => fetcher} mapLib={fakeLib().load} />);
    fireEvent.change(container.querySelector('input[type="text"]') as HTMLInputElement, { target: { value: '2000001' } });
    submit(container);
    expect(await screen.findByRole('heading', { name: 'Confirm how your files are read' })).toBeTruthy();
    expect(screen.getAllByText(/^File: /).length).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and check' }));
    await screen.findByRole('heading', { name: 'Report' });
    expect(screen.getAllByText(/^Dataset: /).length).toBe(2);
  });
});

describe('MappingEditor', () => {
  const proposals: ColumnProposal[] = [
    { index: 0, header: 'Lat', cleanHeader: 'Lat', role: { kind: 'latitude' }, confidence: 'high', reason: 'name says latitude' },
    { index: 1, header: 'X1', cleanHeader: 'X1', role: { kind: 'variable', variable: 'X1' }, confidence: 'low', reason: 'numeric column, name not recognised' },
    { index: 2, header: 'Temp', cleanHeader: 'Temp', role: { kind: 'variable', variable: 'temperature', unit: '°C', unitSource: 'header' }, confidence: 'high', reason: 'header' },
  ];
  const mapping: SheetMapping = { sheet: 's', columns: proposals.map((p) => ({ index: p.index, header: p.header, role: p.role })) };
  const samples = [['1', '2', '3', '4', '5', '6', '7'], ['9'], ['1.5']];

  it('highlights low-confidence proposals, shows at most 5 samples and no invented unit', () => {
    const { container } = render(<MappingEditor sheet="s" proposals={proposals} samples={samples} mapping={mapping} onChange={() => {}} />);
    const rows = container.querySelectorAll('tbody tr');
    expect(rows[0].getAttribute('data-low')).toBe('false');
    expect(rows[1].getAttribute('data-low')).toBe('true');
    expect(rows[1].textContent).toContain('Not sure, please check');
    expect(rows[0].querySelectorAll('.sample').length).toBe(5);
    expect((within(rows[1] as HTMLElement).getByLabelText('Unit') as HTMLInputElement).value).toBe('');
    expect((within(rows[2] as HTMLElement).getByLabelText('Unit') as HTMLInputElement).value).toBe('°C');
  });

  it('reports a changed role and a typed unit (marked as the user\'s)', () => {
    const onChange = vi.fn();
    render(<MappingEditor sheet="s" proposals={proposals} samples={samples} mapping={mapping} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Lat: Meaning'), { target: { value: 'longitude' } });
    expect(onChange.mock.calls[0][0].columns[0].role).toEqual({ kind: 'longitude' });
    const unit = within(screen.getByLabelText('X1: Meaning').closest('.role-cell') as HTMLElement).getByLabelText('Unit');
    fireEvent.change(unit, { target: { value: 'mg/L' } });
    expect(onChange.mock.calls[1][0].columns[1].role).toEqual({ kind: 'variable', variable: 'X1', unit: 'mg/L', unitSource: 'user' });
  });

  it('does not let the user edit columns the layout reads itself', () => {
    render(<MappingEditor sheet="s" proposals={proposals} samples={samples} mapping={mapping} layoutColumns={new Set([0])} onChange={() => {}} />);
    expect(screen.queryByLabelText('Lat: Meaning')).toBeNull();
    expect(screen.getByText('Read through the table layout')).toBeTruthy();
  });
});

describe('LayoutConfirm', () => {
  const sheets = [
    { name: 'cores', header: ['id', 'lat', 'lon'], rowCount: 3 },
    { name: 'meas', header: ['id', 'depth', 'Na'], rowCount: 9 },
  ];
  const join: LayoutPlan = { tables: [{ sheet: 'meas' }], joins: [{ left: 'meas', right: 'cores', leftKey: 0, rightKey: 0 }] };

  it('says in words that two sheets are joined on a key and lets the user pick another key', () => {
    const onChange = vi.fn();
    const { container } = render(<LayoutConfirm plan={join} sheets={sheets} onChange={onChange} />);
    expect(container.textContent).toContain('joined to sheet “cores”');
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.change(screen.getByLabelText('Key column in “meas”'), { target: { value: '1' } });
    expect(onChange.mock.calls[0][0].joins[0].leftKey).toBe(1);
  });

  it('states an unsupported layout and its reason plainly', () => {
    render(<LayoutConfirm plan={{ tables: [], joins: [], unsupported: 'data is transposed (variables in rows, samples in columns)' }} sheets={sheets} onChange={() => {}} />);
    expect(screen.getByRole('note').textContent).toContain('data is transposed');
  });

  it('lets a long table change its unit column to none', () => {
    const onChange = vi.fn();
    const long: LayoutPlan = { tables: [{ sheet: 'meas', long: { parameterCol: 1, valueCol: 2, unitCol: 0 } }], joins: [] };
    render(<LayoutConfirm plan={long} sheets={sheets} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.change(screen.getByLabelText('Column with units'), { target: { value: '' } });
    expect(onChange.mock.calls[0][0].tables[0].long).toEqual({ parameterCol: 1, valueCol: 2 });
  });
});

describe('LoadProblems', () => {
  const blocked = makeFinding('IN-FETCH-BLOCKED', { file: 'data.csv', params: { host: 'opendap.iopan.pl' } });

  it('browser mode: host, the plain sentence, a switch button and the drop hint', () => {
    const onSwitch = vi.fn();
    render(<LoadProblems findings={[blocked]} mode="browser" onSwitchToServer={onSwitch} />);
    expect(screen.getByText(/Data server: opendap\.iopan\.pl/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to server mode' }));
    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Or download the file yourself and drop it here.')).toBeTruthy();
  });

  it('server mode: no switch button, the drop hint stays', () => {
    render(<LoadProblems findings={[blocked]} mode="server" onSwitchToServer={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Switch to server mode' })).toBeNull();
    expect(screen.getByText('Or download the file yourself and drop it here.')).toBeTruthy();
  });

  it('renders nothing for findings that are not download problems', () => {
    const { container } = render(<LoadProblems findings={[makeFinding('META-NO-VERSION', {})]} mode="browser" onSwitchToServer={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('Downloads', () => {
  const ds: DatasetSummary[] = [{ id: 'f1', label: 'book.xlsx (Sheet 1)', file: 'book.xlsx', rowCount: 4, pointCount: 4, variableCount: 2 }];
  const engine: Pick<Engine, 'export' | 'draft'> = {
    export: vi.fn(async (kind) => `content of ${kind}`),
    draft: vi.fn(async () => ({
      temporalExtent: { start: '2021-07-25', end: '2021-07-26' },
      bbox: { west: 15.1, east: 16.2, south: 76.5, north: 76.9 },
      variables: [{ name: 'DIC', unit: 'µmol/kg' }],
    })),
  };

  it('offers every file with a sanitised name and passes the exported text to the download function', async () => {
    const download = vi.fn();
    render(<Downloads datasets={ds} engine={engine} download={download} />);
    for (const [label, kind, name] of [
      ['Clean CSV', 'cleanCsv', 'book_Sheet_1.clean.csv'],
      ['Sidecar CSV (column mapping)', 'sidecar', 'book_Sheet_1.sidecar.csv'],
      ['ISO 19139 XML', 'iso19139', 'book_Sheet_1.iso19139.xml'],
      ['DataCite XML', 'datacite', 'book_Sheet_1.datacite.xml'],
      ['GeoJSON of all datasets', 'geojson', 'book_Sheet_1.geojson'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() => expect(download).toHaveBeenCalledWith(`content of ${kind}`, name, expect.any(String)));
    }
    expect(engine.export).toHaveBeenCalledWith('cleanCsv', ['f1']);
  });

  it('shows the draft under the GeoNetwork field names of the UI language, with copy buttons', async () => {
    const write = vi.fn(async () => {});
    setLang('de');
    render(<Downloads datasets={ds} engine={engine} writeClipboard={write} />);
    expect(await screen.findByText('Zeitliche Ausdehnung')).toBeTruthy();
    expect(screen.getByText('Geographisches Begrenzungsrechteck')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Zeitliche Ausdehnung — Beginn/ }));
    await waitFor(() => expect(write).toHaveBeenCalledWith('2021-07-25'));
    expect(await screen.findByText('Kopiert')).toBeTruthy();
  });

  it('a failing export is a plain message', async () => {
    const bad = { ...engine, export: vi.fn().mockRejectedValue(new Error('Unknown dataset')) };
    render(<Downloads datasets={ds} engine={bad} download={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clean CSV' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Unknown dataset');
  });

  it('a refused clipboard says to copy by hand', async () => {
    render(<Downloads datasets={ds} engine={engine} writeClipboard={() => Promise.reject(new Error('denied'))} />);
    fireEvent.click(await screen.findByRole('button', { name: /Temporal extent — Begin/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('copy it by hand');
  });
});

describe('MapPreview', () => {
  const ds: DatasetSummary[] = [{ id: 'f1', label: 'a.csv', file: 'a.csv', rowCount: 2, pointCount: 2, variableCount: 1 }];
  const geo = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [15.1, 76.5] }, properties: { file: 'a.csv', line: 2, station: 'ST1', date: '2021-07-25', worstSeverity: 'error' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [16.2, 76.9] }, properties: { file: 'a.csv', line: 3, worstSeverity: 'none' } },
    ],
  });

  it('click opens a popup built from the row looked up by file and line', async () => {
    const map = fakeLib();
    const engine = {
      export: vi.fn(async () => geo),
      row: vi.fn(async () => ({ file: 'a.csv', line: 2, station: 'ST1', values: [{ name: '<b>DIC</b>', unit: 'µmol/kg', raw: '2110.5' }] })),
    };
    render(<MapPreview datasets={ds} engine={engine} loadLib={map.load} />);
    await waitFor(() => expect(map.maps).toHaveLength(1));
    const m = map.maps[0];
    m.fire('load');
    m.fire('click', 'rows', { features: [{ properties: { file: 'a.csv', line: 2, station: 'ST1', date: '2021-07-25' }, geometry: { coordinates: [15.1, 76.5] } }] });
    expect(engine.row).toHaveBeenCalledWith('a.csv', 2);
    await waitFor(() => expect(map.popups[0].content?.textContent).toContain('2110.5 µmol/kg'));
    const content = map.popups[0].content as HTMLElement;
    expect(content.querySelector('b')).toBeNull();
    expect(content.textContent).toContain('<b>DIC</b>');
    expect(content.textContent).toContain('ST1');
    expect(content.textContent).toContain('2021-07-25');
  });

  it('shows the four-colour legend and removes the map on unmount', async () => {
    const map = fakeLib();
    const engine = { export: vi.fn(async () => geo), row: vi.fn() };
    const { unmount } = render(<MapPreview datasets={ds} engine={engine} loadLib={map.load} />);
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(legend.querySelectorAll('li').length).toBe(4);
    await waitFor(() => expect(map.maps).toHaveLength(1));
    unmount();
    expect(map.maps[0].removed).toBe(true);
  });

  it('says so when the map library cannot be loaded; the rest keeps working', async () => {
    const engine = { export: vi.fn(async () => geo), row: vi.fn() };
    render(<MapPreview datasets={ds} engine={engine} loadLib={() => Promise.reject(new Error('blocked'))} />);
    expect((await screen.findByRole('status')).textContent).toContain('The map could not be loaded');
  });

  it('does not load the library when no row has a position', () => {
    const load = vi.fn();
    render(<MapPreview datasets={[{ ...ds[0], pointCount: 0 }]} engine={{ export: vi.fn(), row: vi.fn() }} loadLib={load} />);
    expect(load).not.toHaveBeenCalled();
    expect(screen.getByText('No row has a position that can be shown on the map.')).toBeTruthy();
  });
});

// keep React in scope for the JSX runtime in older configs
void React;
