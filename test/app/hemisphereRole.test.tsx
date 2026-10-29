// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// The role select of the confirm step offers "Hemisphere (N/S/E/W)", proposes it for a letters column beside its coordinate, and lets the user
// switch it back to Ignore or change the axis it signs. Invented values.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MappingEditor } from '../../src/app/components/MappingEditor';
import { initLang, setLang } from '../../src/app/i18n';
import { CONVERT_ROLE_CHOICES } from '../../src/app/mappingModel';
import { CheckPage } from '../../src/app/pages/CheckPage';
import { UI } from '../../src/core/i18n/ui';
import { createDirectEngine } from '../../src/worker/handler';
import type { MapLib } from '../../src/app/components/MapPreview';

const CSV = ['Station,Begin Latitude,Beg Lat Dir,Begin Longitude,Lon Dir', 'A,32.7,N,117.3,W', 'B,33.5,S,18.25,E'].join('\n');

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const mapLib = (): (() => Promise<MapLib>) => () => Promise.reject(new Error('no map in this test'));

describe('the role select of /check', () => {
  it('proposes the hemisphere role for the letters column, offers it in four languages, and Ignore takes it back', async () => {
    const { container } = render(<CheckPage engine={createDirectEngine()} mapLib={mapLib()} />);
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File([CSV], 'sio.csv', { type: 'text/csv' })] } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    await screen.findByRole('heading', { name: 'Confirm how your files are read' });

    const select = screen.getByLabelText('Beg Lat Dir: Meaning') as HTMLSelectElement;
    expect(select.value).toBe('hemisphere');
    const labels = [...select.options].map((o) => o.textContent);
    expect(labels).toContain('Hemisphere (N/S/E/W)');
    expect(UI.pl['role.hemisphere']).toBe('Półkula (N/S/E/W)');
    expect(UI.de['role.hemisphere']).toContain('(N/S/E/W)');
    expect(UI.fr['role.hemisphere']).toContain('(N/S/E/W)');

    // it is a low-confidence proposal and says what it will do
    expect(screen.getAllByText(/hemisphere letter for Begin Latitude: S and W make the value negative/).length).toBeGreaterThan(0);
    // the axis it signs is shown, with its own ⓘ
    expect(document.querySelector('[data-tip="hemisphere"]')).toBeTruthy();

    fireEvent.change(select, { target: { value: 'ignore' } });
    expect((screen.getByLabelText('Beg Lat Dir: Meaning') as HTMLSelectElement).value).toBe('ignore');
  });
});

describe('the role select picks the axis', () => {
  const proposals = [{ index: 0, header: 'Hemisphere', cleanHeader: 'Hemisphere', role: { kind: 'ignore' as const }, confidence: 'high' as const, reason: 'x' }];
  const mapping = { sheet: 'S', columns: [{ index: 0, header: 'Hemisphere', role: { kind: 'ignore' as const } }] };

  it('chosen from the values when the header does not say: E and W are longitude', () => {
    const seen: unknown[] = [];
    render(<MappingEditor sheet="S" proposals={proposals} samples={[['E', 'W']]} mapping={mapping} onChange={(m) => seen.push(m.columns[0].role)} />);
    fireEvent.change(screen.getByLabelText('Hemisphere: Meaning'), { target: { value: 'hemisphere' } });
    expect(seen).toEqual([{ kind: 'hemisphere', axis: 'longitude' }]);
  });

  it('the user can change the axis', () => {
    const seen: unknown[] = [];
    const m = { sheet: 'S', columns: [{ index: 0, header: 'Hemisphere', role: { kind: 'hemisphere' as const, axis: 'latitude' as const } }] };
    render(<MappingEditor sheet="S" proposals={proposals} samples={[['N', 'S']]} mapping={m} onChange={(x) => seen.push(x.columns[0].role)} />);
    fireEvent.change(screen.getByRole('combobox', { name: /Signs/ }), { target: { value: 'longitude' } });
    expect(seen).toEqual([{ kind: 'hemisphere', axis: 'longitude' }]);
  });

  it('/convert offers the role too', () => {
    expect(CONVERT_ROLE_CHOICES).toContain('hemisphere');
  });
});
