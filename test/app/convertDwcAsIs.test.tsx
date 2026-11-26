// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// The Darwin Core as-is panel of the /convert page. Invented workbook.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';

const T = UI.en;
vi.setConfig({ testTimeout: 20_000 });
type Cell = string | number | null;
const book = (): Uint8Array => {
  const sheets: Record<string, Cell[][]> = {
    Event: [['eventID', 'eventDate', 'decimalLatitude', 'decimalLongitude', 'stationID'], ['E1', '2020-05-01', 55.1, 10.2, 'S1'], ['E2', '2020-05-02', 55.2, 10.3, 'S2']],
    Occurrence: [['occurrenceID', 'eventID', 'scientificName', 'basisOfRecord', 'occurrenceStatus'], ['o1', 'E1', 'Mytilus edulis', 'HumanObservation', 'present'], ['o2', 'E2', 'Arenicola marina', 'HumanObservation', 'present']],
    eMoF: [['occurrenceID', 'measurementType', 'measurementValue', 'measurementUnit'], ['o1', 'length', 12, 'mm'], ['o2', 'length', 9, 'mm']],
  };
  const wb = XLSX.utils.book_new();
  for (const [n, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n);
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

async function drop() {
  const engine = createDirectConvertEngine();
  const downloadFile = vi.fn();
  const view = render(<ConvertPage engine={engine} download={vi.fn()} downloadFile={downloadFile} />);
  const file = new File([book() as unknown as BlobPart], 'wb.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  fireEvent.change(view.container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByTestId('dwc-proposal');
  return { downloadFile, view };
}
const type = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('the Darwin Core as-is panel', () => {
  it('shows the proposal with one choice and no mapping questions yet', async () => {
    await drop();
    const p = screen.getByTestId('dwc-proposal');
    expect(p.textContent).toContain('wb.xlsx: Event');
    expect(screen.getByRole('button', { name: T['convert.dwc.asIs'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: T['convert.dwc.map'] })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: T['convert.columns.title'] })).toBeNull();
  });
  it('says which sheet was read as which table', async () => {
    await drop();
    const p = screen.getByTestId('dwc-proposal');
    expect(p.textContent).toContain('Event → Event');
    expect(p.textContent).toContain('Occurrence → Occurrence');
    expect(p.textContent).toContain('eMoF → measurements (eMoF)');
  });
  it('after one confirmation: no role dropdowns, no kind of number, EML form stays, the download works', async () => {
    const { downloadFile } = await drop();
    fireEvent.click(screen.getByTestId('dwc-as-is'));
    expect(screen.queryByRole('heading', { name: T['convert.columns.title'] })).toBeNull();
    expect(document.querySelectorAll('select.role, [data-testid="role-select"]').length).toBe(0);
    expect(screen.queryByLabelText(T['convert.quantity.kind'])).toBeNull();
    type(T['convert.meta.f.title'], 'Invented set');
    type(T['convert.meta.f.abstract'], 'An invented test set.');
    type(T['convert.meta.f.creators'], 'Ada Example');
    type(T['convert.meta.f.contactName'], 'Ada Example');
    type(T['convert.meta.f.contactEmail'], 'ada@example.org');
    type(T['convert.meta.f.institution'], 'TST');
    type(T['convert.meta.f.licence'], 'CC-BY-4.0');
    await waitFor(() => expect(screen.getByTestId('dwc-summary').textContent).toContain('Rows lost: 0'));
    expect(screen.getByTestId('dwc-summary').textContent).toContain('2 Event rows, 2 Occurrence rows, 2 measurement rows');
    // the warnings are accepted one by one
    for (const box of document.querySelectorAll<HTMLInputElement>('.convert-accept input[type="checkbox"]')) if (!box.checked) fireEvent.click(box);
    const btn = screen.getByTestId('dwc-export') as HTMLButtonElement;
    await waitFor(() => expect(btn.disabled).toBe(false));
    fireEvent.click(btn);
    await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1));
    expect(downloadFile.mock.calls[0][1]).toMatch(/\.zip$/);
    await waitFor(() => expect(screen.getAllByRole('status').map((e) => e.textContent).join(' ')).toContain('2 occurrences'));
  });
  it('"Map the columns myself" returns to the normal flow', async () => {
    await drop();
    fireEvent.click(screen.getByTestId('dwc-map'));
    expect(screen.queryByTestId('dwc-proposal')).toBeNull();
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
  });
  it('can go back from the as-is mode to the normal flow', async () => {
    await drop();
    fireEvent.click(screen.getByTestId('dwc-as-is'));
    fireEvent.click(screen.getByTestId('dwc-back'));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
  });
});
