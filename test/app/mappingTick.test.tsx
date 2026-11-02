// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// The tick "of each organism" of a measured variable: offered on a long sheet of /convert only, and it moves the column on and off. Invented values.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MappingEditor } from '../../src/app/components/MappingEditor';
import { initLang, setLang } from '../../src/app/i18n';
import { CONVERT_ROLE_CHOICES } from '../../src/app/mappingModel';
import { UI } from '../../src/core/i18n/ui';
import type { SheetMapping } from '../../src/core/types';

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const mapping = (perOccurrence?: true): SheetMapping => ({ sheet: 'S', columns: [{ index: 0, header: 'Mean Length (µm)', role: { kind: 'variable', variable: 'Mean Length', unit: 'µm', ...(perOccurrence ? { perOccurrence } : {}) } }] });
const show = (longSheet: boolean, onChange = vi.fn(), m = mapping()) =>
  render(<MappingEditor sheet="S" proposals={[]} samples={[['1', '2']]} mapping={m} roleKinds={CONVERT_ROLE_CHOICES} longSheet={longSheet} onChange={onChange} />);

describe('the tick "of each organism"', () => {
  it('is offered on a long sheet and moves the column on, then off', () => {
    const onChange = vi.fn();
    const { rerender } = show(true, onChange);
    const box = screen.getByLabelText(UI.en['mapping.perOccurrence']) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(onChange.mock.calls[0][0].columns[0].role).toMatchObject({ kind: 'variable', perOccurrence: true });
    rerender(<MappingEditor sheet="S" proposals={[]} samples={[['1']]} mapping={mapping(true)} roleKinds={CONVERT_ROLE_CHOICES} longSheet onChange={onChange} />);
    const on = screen.getByLabelText(UI.en['mapping.perOccurrence']) as HTMLInputElement;
    expect(on.checked).toBe(true);
    fireEvent.click(on);
    expect(onChange.mock.calls[1][0].columns[0].role.perOccurrence).toBeUndefined();
  });

  it('is not offered on a wide sheet (the column would not be written)', () => {
    show(false);
    expect(screen.queryByLabelText(UI.en['mapping.perOccurrence'])).toBeNull();
  });

  it('is said in all four languages', () => {
    for (const l of ['pl', 'de', 'fr'] as const) expect(UI[l]['mapping.perOccurrence']).not.toBe(UI.en['mapping.perOccurrence']);
  });
});
