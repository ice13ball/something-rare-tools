// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// The export on the /convert page: the description form, the acceptance of warnings, the export button and the archive it downloads, the companion file,
// GA4 (after consent, enums and counts only), and that nothing reaches the network or any storage through the export.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { denyConsent, grantConsent } from '../../src/app/analytics';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { openZip } from '../../src/core/parse/zip';
import { UI } from '../../src/core/i18n/ui';
import { createConvertHandler, createDirectConvertEngine } from '../../src/worker/convert.handler';
import { nodeInflate } from '../helpers/zipfile';
import { SIDECAR_CSV, W1_CSV, chooseFiles } from './convertHelpers';

const T = UI.en;

// the whole flow runs in jsdom through a real worker handler: it is slow on a loaded machine
vi.setConfig({ testTimeout: 20_000 });
const win = window as unknown as { dataLayer: unknown[]; gtag?: unknown };

beforeEach(() => {
  localStorage.clear();
  document.cookie = 'ac_consent=; Path=/; Max-Age=0';
  win.dataLayer = [];
  delete win.gtag;
  document.head.querySelectorAll('script').forEach((s) => s.remove());
  initLang();
  setLang('en');
});
afterEach(cleanup);

const summary = (): HTMLElement => screen.getByRole('region', { name: T['convert.summary.title'] });
const settled = async (text: string): Promise<void> => void (await waitFor(() => expect(summary().textContent).toContain(text)));
const pick = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const typeInto = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const exportButton = (): HTMLButtonElement => screen.getByRole('button', { name: T['convert.export.button'] }) as HTMLButtonElement;
/** The conversion that follows the last decision has answered (the summary is not busy). */
const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
/** The button stays pressable (a press while blocked is what GA4 counts); it says it is off with aria-disabled. */
const off = (): boolean => exportButton().getAttribute('aria-disabled') === 'true';

/** Ticks every kind of warning that is waiting for an acceptance. */
async function tickAll(): Promise<void> {
  await idle();
  await waitFor(() => expect(document.querySelector('.convert-accept')).toBeTruthy());
  for (const box of document.querySelectorAll<HTMLInputElement>('.convert-accept [data-rule-group] input[type="checkbox"]')) if (!box.checked) fireEvent.click(box);
}

interface Run {
  download: ReturnType<typeof vi.fn>;
  downloadFile: ReturnType<typeof vi.fn>;
  engine: ReturnType<typeof createDirectConvertEngine>;
}

async function loadW1(files = [{ name: 'w1.csv', text: W1_CSV }]): Promise<Run> {
  const engine = createDirectConvertEngine();
  const download = vi.fn();
  const downloadFile = vi.fn();
  const view = render(<ConvertPage engine={engine} download={download} downloadFile={downloadFile} />);
  chooseFiles(view.container, files);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  fireEvent.click(screen.getByRole('button', { name: /Confirm all shown/ }));
  pick(T['convert.quantity.kind'], 'count');
  pick(T['convert.effort.title'], 'column');
  fireEvent.click(await screen.findByRole('button', { name: /^Approve \d+ shown/ }));
  fireEvent.click(screen.getByLabelText(T['convert.fullList']));
  await settled('7 occurrences (6 present, 1 absent)');
  return { download, downloadFile, engine };
}

function fillDescription(): void {
  typeInto(T['convert.meta.f.title'], 'Synthetic counts (invented)');
  typeInto(T['convert.meta.f.abstract'], 'Invented values for a test.');
  typeInto(T['convert.meta.f.creators'], 'Ada Example');
  typeInto(T['convert.meta.f.contactName'], 'Ada Example');
  typeInto(T['convert.meta.f.contactEmail'], 'ada@example.org');
  typeInto(T['convert.meta.f.institution'], 'INVENTED');
  pick(T['convert.meta.f.licence'], 'CC-BY-4.0');
  pick(T['convert.meta.f.basis'], 'HumanObservation');
}

/** A Blob's bytes (jsdom's Blob has no arrayBuffer in every version). */
const bytesOf = (b: Blob): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(b);
  });

describe('the export button', () => {
  it('is off until the description is complete, the choices are made and every warning is accepted; each step is a visible reason', async () => {
    await loadW1();
    expect(off()).toBe(true);
    expect(screen.getByText(T['convert.export.blocked'])).toBeTruthy();
    // the description: what is missing is said, in the page's words
    expect(document.querySelector('.convert-meta')?.textContent).toContain('title, abstract');
    expect(document.querySelector('.convert-meta')?.textContent).toContain('No licence is chosen');
    expect(document.querySelector('.convert-meta')?.textContent).toContain('The kind of record (basisOfRecord) is not chosen');
    fillDescription();
    // the datasetName field shows the title as its placeholder, and the title is what is used
    expect((screen.getByLabelText(T['convert.meta.f.datasetName']) as HTMLInputElement).placeholder).toBe('Synthetic counts (invented)');
    // still off: the warnings (no scientificNameID, no sampling device) have to be accepted, each kind on its own
    await waitFor(() => expect(document.querySelector('.convert-accept')).toBeTruthy());
    expect(off()).toBe(true);
    const groups = [...document.querySelectorAll('.convert-accept [data-rule-group]')].map((g) => g.getAttribute('data-rule-group'));
    expect(groups.sort()).toEqual(['CONV-DEVICE-MISSING', 'CONV-NAMEID-MISSING']);
    const box = within(document.querySelector('[data-rule-group="CONV-NAMEID-MISSING"]') as HTMLElement).getByRole('checkbox') as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(off()).toBe(true); // one kind is not enough
    await tickAll();
    await waitFor(() => expect(off()).toBe(false));
    // un-ticking one switches it off again
    fireEvent.click(box);
    await waitFor(() => expect(off()).toBe(true));
  });

  it('a blocking finding keeps it off even with everything ticked, and clearing the licence switches it off again', async () => {
    await loadW1();
    fillDescription();
    await tickAll();
    await waitFor(() => expect(off()).toBe(false));
    pick(T['convert.meta.f.licence'], '');
    await waitFor(() => expect(off()).toBe(true));
    pick(T['convert.meta.f.licence'], 'CC0-1.0');
    await waitFor(() => expect(off()).toBe(false));
    // a change that raises a data error (the quantity is undeclared again)
    pick(T['convert.quantity.kind'], '');
    await waitFor(() => expect(off()).toBe(true));
  });

  it('a tick survives as long as the findings of its rule stay the same: typing in the description unticks nothing; a decision that changes those findings does', async () => {
    await loadW1();
    fillDescription();
    await tickAll();
    await waitFor(() => expect(off()).toBe(false));
    expect(T['convert.accept.intro']).toContain('A tick stays while the findings of that kind stay the same');
    expect(T['convert.accept.intro']).not.toContain('clears all ticks');
    // typing in the title, the abstract and the licence changes no finding of any warning: every tick stays
    typeInto(T['convert.meta.f.title'], 'Another invented title');
    typeInto(T['convert.meta.f.abstract'], 'Another abstract.');
    await idle();
    expect(off()).toBe(false);
    const box = (rule: string): HTMLInputElement => within(document.querySelector(`[data-rule-group="${rule}"]`) as HTMLElement).getByRole('checkbox') as HTMLInputElement;
    expect(box('CONV-NAMEID-MISSING').checked).toBe(true);
    expect(box('CONV-DEVICE-MISSING').checked).toBe(true);
    // the full-species-list tick changes how many occurrences lack an ID (7 -> 6): that kind has to be ticked again; the device warning is unchanged and stays ticked
    fireEvent.click(screen.getByLabelText(T['convert.fullList']));
    await settled('6 occurrences (6 present, 0 absent)');
    await idle();
    expect(box('CONV-NAMEID-MISSING').checked).toBe(false);
    expect(box('CONV-DEVICE-MISSING').checked).toBe(true);
    expect(off()).toBe(true);
    fireEvent.click(box('CONV-NAMEID-MISSING'));
    await waitFor(() => expect(off()).toBe(false));
  });

  it('the reason the export is off is announced: the button points at a polite live note', async () => {
    await loadW1();
    await idle();
    const note = document.getElementById('convert-export-note') as HTMLElement;
    expect(note.getAttribute('aria-live')).toBe('polite');
    expect(exportButton().getAttribute('aria-describedby')).toBe('convert-export-note');
    expect(note.textContent).toBe(T['convert.export.blocked']);
    fillDescription();
    await tickAll();
    await waitFor(() => expect(off()).toBe(false));
    expect(note.textContent).toBe('');
    expect(document.getElementById('convert-export-note')).toBe(note);
  });

  it('the sampling device and the mesh size are decisions of the sheet: choosing a device clears the device warning, and a bad mesh size blocks', async () => {
    await loadW1();
    fillDescription();
    await waitFor(() => expect(document.querySelector('[data-rule-group="CONV-DEVICE-MISSING"]')).toBeTruthy());
    pick(T['convert.device.label'], 'bongo');
    await waitFor(() => expect(document.querySelector('[data-rule-group="CONV-DEVICE-MISSING"]')).toBeNull());
    typeInto(T['convert.mesh.label'], 'abc');
    await settled('The mesh size "abc" cannot be used');
    typeInto(T['convert.mesh.label'], '335');
    await settled(T['convert.summary.none']);
    pick(T['convert.device.label'], 'other');
    typeInto(T['convert.device.text'], 'Invented net');
    await waitFor(() => expect(document.querySelector('[data-rule-group="CONV-DEVICE-MISSING"]')).toBeNull());
  });

  it('the summary says that the land check does not run in the converter', async () => {
    await loadW1();
    expect(summary().textContent).toContain(T['convert.summary.noLand']);
    expect(T['convert.summary.noLand']).toContain('ROW-ON-LAND');
  });

  it('a taxon column that was proposed and not confirmed has to be accepted as left out, or confirmed', async () => {
    const engine = createDirectConvertEngine();
    const view = render(<ConvertPage engine={engine} downloadFile={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'w1.csv', text: W1_CSV }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    pick(T['convert.quantity.kind'], 'count');
    pick(T['convert.effort.title'], 'column');
    fillDescription();
    await screen.findByRole('heading', { name: T['convert.accept.title'] });
    expect(document.querySelector('[data-rule-group="unconfirmed-taxon-columns"]')).toBeTruthy();
    expect(off()).toBe(true);
  });
});

describe('the download', () => {
  it('builds the archive in the worker, offers <dataset name slug>.zip, and the zip is a valid archive of the five files with what was typed', async () => {
    const { downloadFile } = await loadW1();
    fillDescription();
    pick(T['convert.device.label'], 'bongo');
    typeInto(T['convert.mesh.label'], '335');
    await tickAll();
    await waitFor(() => expect(off()).toBe(false));
    fireEvent.click(exportButton());
    await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1));
    const [blob, name] = downloadFile.mock.calls[0] as [Blob, string];
    expect(name).toBe('synthetic-counts-invented.zip');
    expect(blob.type).toBe('application/zip');
    const z = openZip(await bytesOf(blob));
    expect(z.entries.map((e) => e.name)).toEqual(['meta.xml', 'eml.xml', 'event.txt', 'occurrence.txt', 'extendedmeasurementorfact.txt']);
    const text = async (n: string): Promise<string> => new TextDecoder().decode(await z.read(z.find(n)!, nodeInflate));
    expect(await text('event.txt')).toContain('\tSynthetic counts (invented)\tINVENTED\n');
    expect(await text('eml.xml')).toContain('<citetitle>Creative Commons Attribution (CC-BY 4.0) License</citetitle>');
    expect((await text('occurrence.txt')).split('\n').length).toBe(9);
    const emof = await text('extendedmeasurementorfact.txt');
    expect(emof.match(/NMSPINST\/\t\w*|NMSPINST/g)).toHaveLength(3);
    expect(emof).toContain('Bongo net\thttp://vocab.nerc.ac.uk/collection/L22/current/NETT0176/');
    expect(emof).toContain('MSHSIZE1/\t335\t\tum\thttp://vocab.nerc.ac.uk/collection/P06/current/UMIC/');
    await waitFor(() => expect(summary().textContent).toContain('Downloaded synthetic-counts-invented.zip: 6 events, 7 occurrences and 15 measurement rows.'));
  });

  it('the worker refuses a request the page should not have sent: a blocking finding, or a warning that was not accepted (nothing is written)', async () => {
    const h = createConvertHandler();
    const w1 = new TextEncoder().encode(W1_CSV);
    const parsed = h.handle({ type: 'parse', files: [{ name: 'w1.csv', bytes: w1, source: 'dropped' }] }) as Awaited<ReturnType<ReturnType<typeof createDirectConvertEngine>['parse']>>;
    const f = parsed.files[0];
    const sheet = f.sheets[0].name;
    const mapping = { ...f.mappings[0], columns: f.mappings[0].columns };
    const body = { sheets: [{ fileId: f.fileId, sheet, mapping, shape: 'wide' as const, quantity: { kind: 'count' as const, effort: { source: 'column' as const } } }], options: { fullList: true }, approvedSplits: { 'Pseudocalanus sp.': { verbatimIdentification: 'Pseudocalanus sp.', scientificName: 'Pseudocalanus', identificationQualifier: 'sp.' } } };
    const meta = { title: 'T', abstract: 'A', creators: 'A B', contactName: 'A B', contactEmail: 'a@b.org', institutionCode: 'X', datasetName: '', licence: 'CC0-1.0' as const, basisOfRecord: 'HumanObservation' as const, methods: '', citation: '' };
    const run = (m: typeof meta, accepted: string[], b = body) => Promise.resolve(h.handle({ type: 'export', export: { body: b, metadata: m, accepted, generated: '2026-10-25T12:00:00Z' } }));
    const ACCEPT = ['CONV-NAMEID-MISSING', 'CONV-DEVICE-MISSING'];
    await expect(run(meta, [])).rejects.toThrow(/CONV-DEVICE-MISSING, CONV-NAMEID-MISSING not accepted|CONV-NAMEID-MISSING, CONV-DEVICE-MISSING not accepted/);
    await expect(run(meta, ['CONV-NAMEID-MISSING'])).rejects.toThrow(/CONV-DEVICE-MISSING not accepted/);
    await expect(run({ ...meta, licence: '' as never }, ACCEPT)).rejects.toThrow(/CONV-LICENCE-UNSET/);
    await expect(run(meta, ACCEPT, { ...body, sheets: [{ ...body.sheets[0], quantity: undefined as never }] })).rejects.toThrow(/CONV-QUANTITY-UNDECLARED/);
    const ok = (await run(meta, ACCEPT)) as { fileName: string; bytes: Uint8Array; counts: { events: number } };
    expect(ok.fileName).toBe('t.zip');
    expect(ok.counts.events).toBe(6);
    expect(openZip(ok.bytes).entries).toHaveLength(5);
  });

  it('the companion file holds the two choices, in the sidecar format, and nothing of the data', async () => {
    const { download } = await loadW1([{ name: 'w1.csv', text: W1_CSV }, { name: 'run.sidecar.csv', text: SIDECAR_CSV }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    expect(download).toHaveBeenCalledTimes(1);
    const [text, name, mime] = download.mock.calls[0] as [string, string, string];
    expect(name).toBe('convert-companion.csv');
    expect(mime).toBe('text/csv');
    // the sidecar pre-ticked both choices; loadW1 clicked "full list" once more, so only the station prefix is ticked now
    expect(text).toBe('original_column,output_column,unit,unit_source,p01\n(setting),stationPrefix=yes,,,\n');
    fireEvent.click(screen.getByLabelText(T['convert.fullList']));
    fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
    expect(download.mock.calls[1][0]).toBe('original_column,output_column,unit,unit_source,p01\n(setting),fullList=yes,,,\n(setting),stationPrefix=yes,,,\n');
    expect(text).not.toMatch(/Calanus|CR1|S1-a/);
  });
});

describe('GA4: only after consent, only enums and counts', () => {
  const events = (): { name: string; params: Record<string, unknown> }[] =>
    win.dataLayer.map((e) => Array.from(e as ArrayLike<unknown>)).filter((e) => e[0] === 'event').map((e) => ({ name: e[1] as string, params: e[2] as Record<string, unknown> }));

  async function exportOnce(pressBlocked = false): Promise<void> {
    const { downloadFile } = await loadW1();
    fillDescription();
    await idle();
    await waitFor(() => expect(document.querySelector('.convert-accept')).toBeTruthy());
    // pressed while the warnings are not accepted: the export is blocked, nothing is built, and that press is what convert_blocked counts
    if (pressBlocked) {
      fireEvent.click(exportButton());
      expect(downloadFile).not.toHaveBeenCalled();
    }
    await tickAll();
    await waitFor(() => expect(off()).toBe(false));
    fireEvent.click(exportButton());
    await waitFor(() => expect(downloadFile).toHaveBeenCalled());
    await waitFor(() => expect(summary().textContent).toContain('Downloaded'));
  }

  it('without consent nothing is pushed', async () => {
    denyConsent();
    win.dataLayer = [];
    await exportOnce();
    expect(events()).toEqual([]);
  });

  it('a first view of a blocked sheet sends nothing about it: only convert_started', async () => {
    grantConsent();
    win.dataLayer = [];
    await loadW1();
    await idle();
    expect(events().map((x) => x.name)).toEqual(['convert_started']);
  });

  it('the whole run: started, blocked once for the press, exported', async () => {
    grantConsent();
    win.dataLayer = [];
    await exportOnce(true);
    const e = events();
    expect(e.map((x) => x.name)).toEqual(['convert_started', 'convert_blocked', 'convert_exported']);
    expect(e[0].params).toEqual({ input_type: 'file', mode: 'browser' });
    expect(Object.keys(e[1].params).sort()).toEqual(['input_type', 'mode', 'n_errors']);
    expect(e[1].params.n_errors).toBeGreaterThan(0);
    expect(e[2].params).toEqual({ input_type: 'file', mode: 'browser', shape: 'wide', profile: 'none', meta_source: 'none', n_events: 6, n_occurrences: 7, n_measurements: 9 });
    expect(JSON.stringify(win.dataLayer)).not.toMatch(/w1\.csv|Calanus|Synthetic counts|ada@|INVENTED|CR1|S1-a/);
  });

  it('without a press while blocked there is no convert_blocked at all', async () => {
    grantConsent();
    win.dataLayer = [];
    await exportOnce(false);
    expect(events().map((x) => x.name)).toEqual(['convert_started', 'convert_exported']);
  });
});

describe('no network and no storage, through the export', () => {
  it('a whole drop-to-download run makes no request and writes nowhere', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network is not allowed')));
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const beacon = vi.fn();
    const idbOpen = vi.fn();
    const cookieSet = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('indexedDB', { open: idbOpen });
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    const cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(document, 'cookie', { configurable: true, get: () => '', set: cookieSet });
    const lsSet = vi.spyOn(Storage.prototype, 'setItem');
    const lsRemove = vi.spyOn(Storage.prototype, 'removeItem');
    const lsClear = vi.spyOn(Storage.prototype, 'clear');
    try {
      const { downloadFile, download } = await loadW1([{ name: 'w1.csv', text: W1_CSV }, { name: 'run.sidecar.csv', text: SIDECAR_CSV }]);
      fillDescription();
      await tickAll();
      await waitFor(() => expect(off()).toBe(false));
      fireEvent.click(exportButton());
      await waitFor(() => expect(downloadFile).toHaveBeenCalled());
      fireEvent.click(screen.getByRole('button', { name: T['convert.companion.button'] }));
      expect(download).toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(xhrOpen).not.toHaveBeenCalled();
      expect(beacon).not.toHaveBeenCalled();
      expect(idbOpen).not.toHaveBeenCalled();
      expect(cookieSet).not.toHaveBeenCalled();
      expect(lsSet).not.toHaveBeenCalled();
      expect(lsRemove).not.toHaveBeenCalled();
      expect(lsClear).not.toHaveBeenCalled();
      expect(sessionStorage.length).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      if (cookieDesc) Object.defineProperty(document, 'cookie', cookieDesc);
      else delete (document as unknown as Record<string, unknown>).cookie;
    }
  });
});

describe('the four languages', () => {
  it('the description form, the acceptance and the export render in every language with no key or placeholder left over', async () => {
    for (const lang of ['pl', 'de', 'fr'] as const) {
      cleanup();
      setLang(lang);
      const engine = createDirectConvertEngine();
      const view = render(<ConvertPage engine={engine} downloadFile={vi.fn()} />);
      chooseFiles(view.container, [{ name: 'w1.csv', text: W1_CSV }]);
      fireEvent.click(screen.getByRole('button', { name: UI[lang]['convert.read'] }));
      await screen.findByRole('heading', { name: UI[lang]['convert.columns.title'] });
      fireEvent.change(screen.getByLabelText(UI[lang]['convert.quantity.kind']), { target: { value: 'count' } });
      await screen.findByRole('heading', { name: UI[lang]['convert.accept.title'] });
      expect(screen.getByRole('heading', { name: UI[lang]['convert.meta.title'] })).toBeTruthy();
      expect(screen.getByRole('heading', { name: UI[lang]['convert.export.title'] })).toBeTruthy();
      const text = document.body.textContent ?? '';
      expect(text, lang).not.toMatch(/\{[A-Za-z]+\}/);
      expect(text, lang).not.toMatch(/convert\.(meta|accept|export|companion)\.[a-zA-Z.-]+/);
    }
  });
});
