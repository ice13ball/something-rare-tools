// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// The sheet form offers biomass per sample, percent cover and an abundance class scale (round 3, Task 6): each is the person's explicit choice and the request carries exactly it.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertPage } from '../../src/app/pages/ConvertPage';
import { TIP_TEXTS as TIPS } from '../../src/core/i18n/tips-text';
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

async function open(): Promise<ConvertRequestBody[]> {
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
  return bodies;
}
const kind = (): HTMLSelectElement => screen.getByLabelText(T['convert.quantity.kind']) as HTMLSelectElement;
const lastQuantity = (bodies: ConvertRequestBody[], pred: (q: NonNullable<ConvertRequestBody['sheets'][0]['quantity']>) => boolean) => {
  const hit = [...bodies].reverse().find((b) => b.sheets.some((s) => s.quantity !== undefined && pred(s.quantity)));
  return hit?.sheets[0].quantity;
};

describe('the new quantity kinds on the page', () => {
  it('an abundance class sends its scale with the typed meanings only', async () => {
    const bodies = await open();
    fireEvent.change(kind(), { target: { value: 'class' } });
    fireEvent.change(screen.getByLabelText(T['convert.scale.min']), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(T['convert.scale.max']), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(T['convert.scale.meaning'].replace('{n}', '3')), { target: { value: 'common' } });
    await waitFor(() => expect(lastQuantity(bodies, (q) => q.kind === 'class' && q.scale?.max === '5' && q.scale.meanings?.['3'] === 'common')).toBeDefined());
    expect(lastQuantity(bodies, (q) => q.kind === 'class' && q.scale?.max === '5' && q.scale.meanings?.['3'] === 'common')).toEqual({ kind: 'class', scale: { name: '', min: '0', max: '5', meanings: { '3': 'common' } } });
  });

  it('a biomass per sample sends per sample and shows no medium', async () => {
    const bodies = await open();
    fireEvent.change(kind(), { target: { value: 'biomass' } });
    fireEvent.change(screen.getByLabelText(T['convert.quantity.unit']), { target: { value: 'g' } });
    fireEvent.change(screen.getByLabelText(T['convert.quantity.basis']), { target: { value: 'wet' } });
    fireEvent.change(screen.getByLabelText(T['convert.quantity.per']), { target: { value: 'sample' } });
    expect(screen.queryByLabelText(T['convert.quantity.medium'])).toBeNull();
    await waitFor(() => expect(lastQuantity(bodies, (q) => q.per === 'sample')).toBeDefined());
    expect(lastQuantity(bodies, (q) => q.per === 'sample')).toEqual({ kind: 'biomass', unit: 'g', basis: 'wet', per: 'sample' });
  });

  it('a percent cover sends only its kind', async () => {
    const bodies = await open();
    fireEvent.change(kind(), { target: { value: 'cover' } });
    await waitFor(() => expect(lastQuantity(bodies, (q) => q.kind === 'cover')).toBeDefined());
    expect(lastQuantity(bodies, (q) => q.kind === 'cover')).toEqual({ kind: 'cover' });
  });

  it('per sample is offered for a biomass only', async () => {
    await open();
    fireEvent.change(kind(), { target: { value: 'density' } });
    const per = screen.getByLabelText(T['convert.quantity.per']) as HTMLSelectElement;
    expect([...per.options].map((o) => o.value)).not.toContain('sample');
    fireEvent.change(kind(), { target: { value: 'biomass' } });
    expect([...(screen.getByLabelText(T['convert.quantity.per']) as HTMLSelectElement).options].map((o) => o.value)).toContain('sample');
  });

  it('the count option says it is a number of individuals, in English and Polish', async () => {
    await open();
    const label = UI.en['convert.kind.count'];
    expect(label).toContain('number of individuals'.replace(/^n/, 'N'));
    expect(label).toContain('abundance class');
    expect([...kind().options].map((o) => o.textContent)).toContain(label);
    expect(UI.pl['convert.kind.count']).toContain('klasę liczebności');
    expect(UI.pl['convert.kind.cover']).toBe('Pokrycie w procentach');
  });

  it('stale unit and per never leak into a class or a cover after a density', async () => {
    const bodies = await open();
    fireEvent.change(kind(), { target: { value: 'density' } });
    fireEvent.change(screen.getByLabelText(T['convert.quantity.unit']), { target: { value: 'ind/L' } });
    await waitFor(() => expect(lastQuantity(bodies, (q) => q.unit === 'ind/L')).toBeDefined());
    const before = bodies.length;
    fireEvent.change(kind(), { target: { value: 'class' } });
    await waitFor(() => expect(bodies.slice(before).some((b) => b.sheets[0].quantity?.kind === 'class')).toBe(true));
    for (const b of bodies.slice(before)) {
      const q = b.sheets[0].quantity;
      if (q?.kind === 'class') {
        expect(q.unit).toBeUndefined();
        expect(q.per).toBeUndefined();
        expect(q.medium).toBeUndefined();
      }
    }
  });

  it('the ⓘ of the kind select names cover and abundance class in every language', () => {
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      const logic = TIPS[lang]['tip.convertQuantityKind.logic'];
      expect(logic).toMatch(/%/);
      expect(logic.split('\n').length).toBeGreaterThanOrEqual(6);
    }
    expect(TIPS.en['tip.convertQuantityKind.logic']).toContain('abundance class');
    expect(TIPS.en['tip.convertQuantityKind.logic']).toContain('percent cover');
  });
});
