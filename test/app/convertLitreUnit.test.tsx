// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// A density in units per litre is read per volume by the sheet form (round 3, Task 2): no "where it was sampled" field, and the request carries the unit as typed.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { UI } from '../../src/core/i18n/ui';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import type { ConvertRequestBody } from '../../src/worker/convert.protocol';
import { W2_CSV, chooseFiles } from './convertHelpers';

vi.setConfig({ testTimeout: 30_000 });
const T = UI.en;

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

describe('a density in ind/L on the page', () => {
  it('is read per volume: the per-area fields stay hidden and the request carries the unit', async () => {
    const engine = createDirectConvertEngine();
    const bodies: ConvertRequestBody[] = [];
    const convert = engine.convert.bind(engine);
    engine.convert = (body) => {
      bodies.push(body);
      return convert(body);
    };
    const view = render(<ConvertPage engine={engine} download={vi.fn()} />);
    chooseFiles(view.container, [{ name: 'w2.csv', text: W2_CSV }]);
    fireEvent.click(screen.getByRole('button', { name: T['convert.read'] }));
    await screen.findByRole('heading', { name: T['convert.columns.title'] });
    fireEvent.change(screen.getByLabelText(T['convert.quantity.kind']), { target: { value: 'density' } });
    fireEvent.change(screen.getByLabelText(T['convert.quantity.unit']), { target: { value: 'ind/L' } });
    expect(screen.queryByLabelText(T['convert.quantity.medium'])).toBeNull();
    await waitFor(() => expect(bodies.some((b) => b.sheets.some((s) => s.quantity?.unit === 'ind/L'))).toBe(true));
    const last = [...bodies].reverse().find((b) => b.sheets.some((s) => s.quantity?.unit === 'ind/L'))!;
    expect(last.sheets[0].quantity).toMatchObject({ kind: 'density', unit: 'ind/L' });
    // control: a per-area unit does show the field
    fireEvent.change(screen.getByLabelText(T['convert.quantity.unit']), { target: { value: 'ind/m2' } });
    expect(screen.getByLabelText(T['convert.quantity.medium'])).toBeTruthy();
  });
});
