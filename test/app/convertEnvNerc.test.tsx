// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// The NERC lists of /convert after the environmental fixes: a P01 code declared in a header comes first when it is verified and is listed as "declared by the file" when it is not
// (never chosen for the user), a column with no unit is offered "Dimensionless" only once its practical salinity or pH is chosen, and the role "Depth below seafloor" is in the
// dropdown of the roles with its unit field. Synthetic data only.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { nercUri } from '../../src/core/convert/vocab';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { L1_HEADER, type Cell } from '../convert/helpers';
import { chooseFiles, csvOf } from './convertHelpers';

vi.setConfig({ testTimeout: 30_000 });
const T = UI.en;

const HEADER = [...L1_HEADER, 'TEMPP901<Float32>', 'SDN:P01::ABCD1234<Float32>', 'Salinity'];
const ROWS: Cell[][] = [
  ['occ-001', 'E1', 'Calanus finmarchicus', 5, 54.1, 7.9, '2022-05-05', 0, 10, 7.1, 0.7, 33.1],
  ['occ-002', 'E2', 'Oithona similis', 11, 54.3, 8.1, '2022-05-06', 0, 10, 6.5, 0.6, 33.4],
];

beforeEach(() => {
  localStorage.clear();
  document.cookie = 'ac_consent=; Path=/; Max-Age=0';
  initLang();
  setLang('en');
});
afterEach(cleanup);

const concept = (header: string): HTMLSelectElement => screen.getByLabelText(T['convert.nerc.type.aria'].replace('{header}', header)) as HTMLSelectElement;
const unitSelect = (header: string): HTMLSelectElement | null => screen.queryByLabelText(T['convert.nerc.unit.aria'].replace('{header}', header)) as HTMLSelectElement | null;
const idle = (): Promise<void> => waitFor(() => expect(document.querySelector('.convert-summary')?.getAttribute('aria-busy')).toBe('false'));
const uri = (code: string): string => nercUri('P01', code);

async function load(): Promise<void> {
  const view = render(<ConvertPage engine={createDirectConvertEngine()} />);
  chooseFiles(view.container, [{ name: 'l1.csv', text: csvOf(HEADER, ROWS) }]);
  fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
  await screen.findByRole('heading', { name: T['convert.columns.title'] });
  fireEvent.change(screen.getByLabelText(T['convert.quantity.kind']), { target: { value: 'count' } });
  await screen.findByRole('heading', { name: T['convert.nerc.title'] });
}

describe('a P01 code declared in the header', () => {
  it('a verified code is proposed first, in the suggested group, and chosen only by the user', async () => {
    await load();
    const sel = concept('TEMPP901<Float32>');
    expect(sel.value).toBe('');
    const groups = [...sel.querySelectorAll('optgroup')];
    expect(groups[0].label).toBe(T['convert.nerc.group.suggested']);
    expect([...groups[0].querySelectorAll('option')].map((o) => o.value)).toEqual([`s:${uri('TEMPP901')}`]);
    // what would have been proposed for a temperature is only offered now
    expect([...groups[1].querySelectorAll('option')].map((o) => o.value)).toEqual([`s:${uri('TEMPPR01')}`, `s:${uri('TEMPST01')}`]);
  });

  it('an unverified well-formed code is listed as declared by the file, never chosen for the user, and a choice of it is kept', async () => {
    await load();
    const sel = concept('SDN:P01::ABCD1234<Float32>');
    expect(sel.value).toBe('');
    const declared = [...sel.querySelectorAll('optgroup')].find((g) => g.label === T['convert.nerc.group.declared'])!;
    expect(declared).toBeTruthy();
    const opts = [...declared.querySelectorAll('option')];
    expect(opts.map((o) => o.value)).toEqual([`d:${uri('ABCD1234')}`]);
    expect(opts[0].textContent).toBe(`ABCD1234: ${T['convert.nerc.declared.label']}`);
    // nothing of it is in a suggested group, so the bulk button cannot confirm it
    expect([...sel.querySelectorAll('optgroup')].find((g) => g.label === T['convert.nerc.group.suggested'])).toBeUndefined();
    fireEvent.change(sel, { target: { value: `d:${uri('ABCD1234')}` } });
    await idle();
    expect(concept('SDN:P01::ABCD1234<Float32>').value).toBe(`d:${uri('ABCD1234')}`);
  });
});

describe('"Dimensionless" for a column with no unit', () => {
  it('is offered only once a practical salinity is chosen for it, as the suggested unit', async () => {
    await load();
    expect(unitSelect('Salinity')).toBeNull();
    fireEvent.change(concept('Salinity'), { target: { value: `s:${uri('PSLTZZ01')}` } });
    await idle();
    const u = unitSelect('Salinity')!;
    expect(u).toBeTruthy();
    expect(u.value).toBe('');
    expect([...u.querySelectorAll('optgroup')][0].label).toBe(T['convert.nerc.group.suggestedUnit']);
    expect([...u.querySelectorAll('option')].map((o) => o.value)).toContain(`s:${nercUri('P06', 'UUUU')}`);
    // another concept for the same column: no unit list
    fireEvent.change(concept('Salinity'), { target: { value: '' } });
    await idle();
    expect(unitSelect('Salinity')).toBeNull();
  });
});

describe('the role "Depth below seafloor"', () => {
  it('is in the dropdown of the roles, in every language, with a text for its ⓘ', () => {
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      expect(UI[lang]['role.depthBelowSeafloor']).toBeTruthy();
      expect(UI[lang]['tip.role.depthBelowSeafloor' as keyof (typeof UI)['en']]).toBeTruthy();
    }
    expect(UI.en['role.depthBelowSeafloor']).toBe('Depth below seafloor');
  });

  it('a porewater sheet shows it as the meaning of the depth column, with the unit the sheet states', async () => {
    const text = csvOf(['Site_ID', 'Date', 'Latitude', 'Longitude', 'Site_depth_m', 'Type_of_water', 'Depth_cm', 'Cl_mg_l'], [['ZP1', '2020-05-01', 70.1, 20.2, 45, 'porewater', 0.5, 10100], ['ZP1', '2020-05-01', 70.1, 20.2, 45, 'porewater', 1.5, 10200]]);
    const view = render(<ConvertPage engine={createDirectConvertEngine()} />);
    chooseFiles(view.container, [{ name: 'pw.csv', text }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    const role = screen.getByLabelText('Depth_cm: Meaning') as HTMLSelectElement;
    expect(role.value).toBe('depthBelowSeafloor');
    expect([...role.options].find((o) => o.value === 'depthBelowSeafloor')!.textContent).toBe(T['role.depthBelowSeafloor']);
    // the unit the sheet states is in the unit field of the row (it is the user's to change)
    const unit = screen.getAllByDisplayValue('cm');
    expect(unit.length).toBeGreaterThan(0);
  });
});
