// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// MappingEditor with the converter's role list (the new optional prop), and that its default is still /check's list.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MappingEditor } from '../../src/app/components/MappingEditor';
import { initLang, setLang } from '../../src/app/i18n';
import { CONVERT_ROLE_CHOICES, ROLE_KINDS, roleChoiceOf, roleFromChoice, setBound, setUnit } from '../../src/app/mappingModel';
import { UI } from '../../src/core/i18n/ui';
import type { ColumnProposal, SheetMapping } from '../../src/core/types';

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const mapping: SheetMapping = {
  sheet: 'S',
  columns: [
    { index: 0, header: 'Calanus', role: { kind: 'taxon', header: true } },
    { index: 1, header: 'Depth top', role: { kind: 'depth', positive: 'down', bound: 'min' } },
    { index: 2, header: 'Vol', role: { kind: 'effort', unit: 'm3' } },
  ],
};
const proposals: ColumnProposal[] = mapping.columns.map((c) => ({ index: c.index, header: c.header, cleanHeader: c.header, role: c.role, confidence: 'low', reason: 'x' }));
const samples = [['3'], ['5'], ['12']];

const optionsOf = (label: string): string[] => [...(screen.getByLabelText(label) as HTMLSelectElement).options].map((o) => o.value);

describe('the role list', () => {
  it('is /check\'s list by default, with no converter role in it', () => {
    render(<MappingEditor sheet="S" proposals={proposals} samples={samples} mapping={mapping} onChange={() => {}} />);
    expect(optionsOf('Calanus: Meaning')).toEqual([...ROLE_KINDS]);
    expect(document.querySelector('[data-tip="roles"]')).toBeTruthy();
    expect(document.querySelector('[data-tip="convertRoles"]')).toBeNull();
    // no depth-bound control on /check
    expect(screen.queryByText(UI.en['mapping.bound'])).toBeNull();
  });

  it('is the converter list when passed, with its own tip, the depth bound and the unit of the sample size', () => {
    render(<MappingEditor sheet="S" proposals={proposals} samples={samples} mapping={mapping} roleKinds={CONVERT_ROLE_CHOICES} rolesTip="convertRoles" onChange={() => {}} />);
    expect(optionsOf('Calanus: Meaning')).toEqual([...CONVERT_ROLE_CHOICES]);
    expect((screen.getByLabelText('Calanus: Meaning') as HTMLSelectElement).value).toBe('taxonHeader');
    expect(document.querySelector('[data-tip="convertRoles"]')).toBeTruthy();
    expect(document.querySelector('[data-tip="roles"]')).toBeNull();
    expect((screen.getByLabelText(UI.en['mapping.bound']) as HTMLSelectElement).value).toBe('min');
    expect((screen.getByDisplayValue('m3') as HTMLInputElement).type).toBe('text');
  });

  it('changing a role reports the converter role it stands for', () => {
    const onChange = vi.fn();
    render(<MappingEditor sheet="S" proposals={proposals} samples={samples} mapping={mapping} roleKinds={CONVERT_ROLE_CHOICES} rolesTip="convertRoles" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Calanus: Meaning'), { target: { value: 'quantity' } });
    expect(onChange.mock.calls[0][0].columns[0].role).toEqual({ kind: 'quantity' });
    fireEvent.change(screen.getByLabelText('Calanus: Meaning'), { target: { value: 'taxon' } });
    expect(onChange.mock.calls[1][0].columns[0].role).toEqual({ kind: 'taxon' });
    fireEvent.change(screen.getByLabelText(UI.en['mapping.bound']), { target: { value: 'max' } });
    expect(onChange.mock.calls[2][0].columns[1].role).toEqual({ kind: 'depth', positive: 'down', bound: 'max' });
  });
});

describe('role choices', () => {
  it('taxonHeader is a taxon role with header: true, and back', () => {
    expect(roleChoiceOf({ kind: 'taxon', header: true })).toBe('taxonHeader');
    expect(roleChoiceOf({ kind: 'taxon' })).toBe('taxon');
    expect(roleFromChoice({ kind: 'ignore' }, { kind: 'ignore' }, 'taxonHeader', 'x')).toEqual({ kind: 'taxon', header: true });
    expect(roleFromChoice({ kind: 'ignore' }, { kind: 'ignore' }, 'taxon', 'x')).toEqual({ kind: 'taxon' });
    expect(roleFromChoice({ kind: 'ignore' }, { kind: 'ignore' }, 'variable', 'Chl a')).toEqual({ kind: 'variable', variable: 'Chl a' });
    expect(roleFromChoice({ kind: 'ignore' }, { kind: 'ignore' }, 'lifeStage', 'x')).toEqual({ kind: 'lifeStage' });
  });

  it('the bound and the sample-size unit are set and removed without touching other roles', () => {
    expect(setBound({ kind: 'depth', positive: 'down', bound: 'min' }, undefined)).toEqual({ kind: 'depth', positive: 'down' });
    expect(setBound({ kind: 'latitude' }, 'max')).toEqual({ kind: 'latitude' });
    expect(setUnit({ kind: 'effort' }, ' m2 ')).toEqual({ kind: 'effort', unit: 'm2' });
    expect(setUnit({ kind: 'effort', unit: 'm2' }, '')).toEqual({ kind: 'effort' });
  });

  it('every converter role has a label and a tip sentence in all four languages', () => {
    for (const lang of ['pl', 'en', 'de', 'fr'] as const) {
      for (const c of CONVERT_ROLE_CHOICES) {
        expect(UI[lang][`role.${c}` as keyof (typeof UI)['en']], `${lang} role.${c}`).toBeTruthy();
        expect(UI[lang][`tip.role.${c}` as keyof (typeof UI)['en']], `${lang} tip.role.${c}`).toBeTruthy();
      }
    }
  });
});
