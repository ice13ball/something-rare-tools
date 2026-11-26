// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// The data tables only (no description), on /convert in both paths: the mapping path and "already Darwin Core". Invented data throughout.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { denyConsent, grantConsent } from '../../src/app/analytics';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { openZip } from '../../src/core/parse/zip';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { nodeInflate } from '../helpers/zipfile';
import { W1_CSV, chooseFiles } from './convertHelpers';

const T = UI.en;
vi.setConfig({ testTimeout: 30_000 });
const win = window as unknown as { dataLayer: { 0?: string; 1?: string; 2?: Record<string, unknown> }[] | unknown[]; gtag?: unknown };

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

const pick = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const typeInto = pick;
const tablesButton = (): HTMLButtonElement => screen.getByTestId('tables-only-export') as HTMLButtonElement;
const fullButton = (): HTMLButtonElement => screen.getByRole('button', { name: T['convert.export.button'] }) as HTMLButtonElement;
const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const bytesOf = (b: Blob): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(b);
  });
const filesOf = async (blob: Blob): Promise<Record<string, string>> => {
  const z = openZip(await bytesOf(blob));
  const out: Record<string, string> = {};
  for (const e of z.entries) out[e.name] = new TextDecoder().decode(await z.read(e, nodeInflate));
  return out;
};
async function tickAll(): Promise<void> {
  await idle();
  await waitFor(() => expect(document.querySelector('.convert-accept')).toBeTruthy());
  for (const box of document.querySelectorAll<HTMLInputElement>('.convert-accept [data-rule-group] input[type="checkbox"]')) if (!box.checked) fireEvent.click(box);
}
function fillDescription(): void {
  typeInto(T['convert.meta.f.title'], 'Synthetic counts (invented)');
  typeInto(T['convert.meta.f.abstract'], 'Invented values for a test.');
  typeInto(T['convert.meta.f.creators'], 'Ada Example');
  typeInto(T['convert.meta.f.contactName'], 'Ada Example');
  typeInto(T['convert.meta.f.contactEmail'], 'ada@example.org');
  typeInto(T['convert.meta.f.institution'], 'INVENTED');
  pick(T['convert.meta.f.licence'], 'CC-BY-4.0');
}

async function loadW1() {
  const engine = createDirectConvertEngine();
  const downloadFile = vi.fn();
  const view = render(<ConvertPage engine={engine} download={vi.fn()} downloadFile={downloadFile} />);
  chooseFiles(view.container, [{ name: 'w1.csv', text: W1_CSV }]);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  fireEvent.click(screen.getByRole('button', { name: /Confirm all shown/ }));
  pick(T['convert.quantity.kind'], 'count');
  pick(T['convert.effort.title'], 'column');
  fireEvent.click(await screen.findByRole('button', { name: /^Approve \d+ shown/ }));
  fireEvent.click(screen.getByLabelText(T['convert.fullList']));
  await waitFor(() => expect(screen.getByRole('region', { name: T['convert.summary.title'] }).textContent).toContain('7 occurrences (6 present, 1 absent)'));
  return { downloadFile };
}

describe('the data tables only: the mapping path', () => {
  it('shows the plain sentence beside the button, in all four languages', async () => {
    await loadW1();
    expect(screen.getByTestId('tables-only-note').textContent).toBe(UI.en['convert.tables.note']);
    expect(screen.getByTestId('tables-only-note').textContent).toContain('no dataset description (eml.xml) and no meta.xml');
    for (const l of ['en', 'pl', 'de', 'fr'] as const) {
      expect(UI[l]['convert.tables.button'].length).toBeGreaterThan(10);
      expect(UI[l]['convert.tables.note']).toMatch(/eml\.xml/);
      expect(UI[l]['convert.tables.note']).toMatch(/meta\.xml/);
      expect(UI[l]['convert.tables.note']).toMatch(/GBIF/);
    }
    expect(UI.pl['convert.tables.button']).toBe('Pobierz same tabele danych (bez opisu)');
    expect(UI.en['convert.tables.button']).toBe('Download the data tables only (no description)');
  });

  it('is enabled with an empty description once the data are clear; a data finding keeps it off; the full archive stays off', async () => {
    const { downloadFile } = await loadW1();
    expect(tablesButton().disabled).toBe(true); // warnings not accepted yet, and basisOfRecord not chosen
    await tickAll();
    await waitFor(() => expect(fullButton().getAttribute('aria-disabled')).toBe('true'));
    expect(tablesButton().disabled).toBe(true); // basisOfRecord is a column of occurrence.txt: still asked
    pick(T['convert.meta.f.basis'], 'HumanObservation');
    await waitFor(() => expect(tablesButton().disabled).toBe(false));
    expect(fullButton().getAttribute('aria-disabled')).toBe('true');
    // a change that raises a data error switches it off again
    pick(T['convert.quantity.kind'], '');
    await waitFor(() => expect(tablesButton().disabled).toBe(true));
    pick(T['convert.quantity.kind'], 'count');
    await waitFor(() => expect(tablesButton().disabled).toBe(false));
    fireEvent.click(tablesButton());
    await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1));
    const [blob, name] = downloadFile.mock.calls[0] as [Blob, string];
    expect(name).toBe('dwca-tables.zip');
    const f = await filesOf(blob);
    expect(Object.keys(f)).toEqual(['event.txt', 'occurrence.txt', 'extendedmeasurementorfact.txt']);
    // the columns whose only source is the form are left out when nothing fills them
    const head = f['event.txt'].split('\n')[0].split('\t');
    expect(head).not.toContain('datasetName');
    expect(head).not.toContain('institutionCode');
  });

  it('writes the same tables as the full archive, byte for byte, when the form is filled; the name is the archive name plus -tables', async () => {
    const { downloadFile } = await loadW1();
    fillDescription();
    pick(T['convert.meta.f.basis'], 'HumanObservation');
    await tickAll();
    await waitFor(() => expect(fullButton().getAttribute('aria-disabled')).toBe('false'));
    fireEvent.click(fullButton());
    await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(tablesButton().disabled).toBe(false));
    fireEvent.click(tablesButton());
    await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(2));
    const [fullBlob, fullName] = downloadFile.mock.calls[0] as [Blob, string];
    const [tabBlob, tabName] = downloadFile.mock.calls[1] as [Blob, string];
    expect(fullName).toBe('synthetic-counts-invented.zip');
    expect(tabName).toBe('synthetic-counts-invented-tables.zip');
    const full = await filesOf(fullBlob);
    const tab = await filesOf(tabBlob);
    expect(Object.keys(tab)).toEqual(['event.txt', 'occurrence.txt', 'extendedmeasurementorfact.txt']);
    expect(tab['eml.xml']).toBeUndefined();
    expect(tab['meta.xml']).toBeUndefined();
    for (const n of Object.keys(tab)) expect(tab[n], n).toBe(full[n]);
    expect(tab['event.txt']).toContain('\tSynthetic counts (invented)\tINVENTED\n'); // the filled fields are written as in the full archive
  });

  it('sends the same GA4 event with export_kind tables, and the full archive does not carry the field', async () => {
    grantConsent();
    const { downloadFile } = await loadW1();
    pick(T['convert.meta.f.basis'], 'HumanObservation');
    await tickAll();
    await waitFor(() => expect(tablesButton().disabled).toBe(false));
    fireEvent.click(tablesButton());
    await waitFor(() => expect(downloadFile).toHaveBeenCalled());
    await waitFor(() => expect(JSON.stringify(win.dataLayer)).toContain('convert_exported'));
    const sent = (win.dataLayer as unknown[]).map((a) => Array.from(a as ArrayLike<unknown>)).filter((a) => a[1] === 'convert_exported');
    expect(sent).toHaveLength(1);
    expect(sent[0][2]).toMatchObject({ export_kind: 'tables', meta_source: 'none', n_events: 6, n_occurrences: 7, n_measurements: 9 });
    denyConsent();
  });
});

type Cell = string | number | null;
const book = (lat: number): Uint8Array => {
  const sheets: Record<string, Cell[][]> = {
    Event: [['eventID', 'eventDate', 'decimalLatitude', 'decimalLongitude', 'stationID'], ['E1', '2020-05-01', lat, 10.2, 'S1'], ['E2', '2020-05-02', 55.2, 10.3, 'S2']],
    Occurrence: [['occurrenceID', 'eventID', 'scientificName', 'basisOfRecord', 'occurrenceStatus'], ['o1', 'E1', 'Mytilus edulis', 'HumanObservation', 'present'], ['o2', 'E2', 'Arenicola marina', 'HumanObservation', 'present']],
    eMoF: [['occurrenceID', 'measurementType', 'measurementValue', 'measurementUnit'], ['o1', 'length', 12, 'mm'], ['o2', 'length', 9, 'mm']],
  };
  const wb = XLSX.utils.book_new();
  for (const [n, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n);
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};
async function dropDwc(lat: number) {
  const downloadFile = vi.fn();
  const view = render(<ConvertPage engine={createDirectConvertEngine()} download={vi.fn()} downloadFile={downloadFile} />);
  const file = new File([book(lat) as unknown as BlobPart], 'wb.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  fireEvent.change(view.container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByTestId('dwc-proposal');
  fireEvent.click(screen.getByTestId('dwc-as-is'));
  await waitFor(() => expect(screen.getByTestId('dwc-summary')).toBeTruthy());
  return { downloadFile };
}
const tick = (): void => {
  for (const box of document.querySelectorAll<HTMLInputElement>('.convert-accept input[type="checkbox"]')) if (!box.checked) fireEvent.click(box);
};

describe('the data tables only: Darwin Core as it is', () => {
  it('works with an empty description and gives the same tables as the full archive', async () => {
    const { downloadFile } = await dropDwc(55.1);
    expect(screen.getByTestId('tables-only-note').textContent).toBe(T['convert.tables.note']);
    tick();
    await waitFor(() => expect(tablesButton().disabled).toBe(false));
    expect((screen.getByTestId('dwc-export') as HTMLButtonElement).disabled).toBe(true); // the description is still required for the full archive
    fireEvent.click(tablesButton());
    await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1));
    const tab = await filesOf((downloadFile.mock.calls[0] as [Blob, string])[0]);
    expect((downloadFile.mock.calls[0] as [Blob, string])[1]).toBe('dwca-tables.zip');
    expect(Object.keys(tab)).toEqual(['event.txt', 'occurrence.txt', 'extendedmeasurementorfact.txt']);
    typeInto(T['convert.meta.f.title'], 'Invented set');
    typeInto(T['convert.meta.f.abstract'], 'An invented test set.');
    typeInto(T['convert.meta.f.creators'], 'Ada Example');
    typeInto(T['convert.meta.f.contactName'], 'Ada Example');
    typeInto(T['convert.meta.f.contactEmail'], 'ada@example.org');
    typeInto(T['convert.meta.f.institution'], 'TST');
    typeInto(T['convert.meta.f.licence'], 'CC-BY-4.0');
    await waitFor(() => expect((screen.getByTestId('dwc-export') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('dwc-export'));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(2));
    const full = await filesOf((downloadFile.mock.calls[1] as [Blob, string])[0]);
    expect(full['eml.xml']).toBeTruthy();
    expect(tab['eml.xml']).toBeUndefined();
    expect(tab['meta.xml']).toBeUndefined();
    for (const n of Object.keys(tab)) expect(tab[n], n).toBe(full[n]);
  });

  it('a data finding keeps it off (latitude out of range)', async () => {
    await dropDwc(955.1);
    tick();
    await waitFor(() => expect(document.querySelector('.convert-findings[data-kind="error"]')).toBeTruthy());
    expect(tablesButton().disabled).toBe(true);
  });
});
