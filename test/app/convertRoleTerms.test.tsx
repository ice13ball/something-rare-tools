// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// The role dropdown and its tip name the Darwin Core term each role writes; the Darwin Core proposal says which sheet is read as which table.
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MappingEditor } from '../../src/app/components/MappingEditor';
import { initLang, setLang } from '../../src/app/i18n';
import { CONVERT_ROLE_CHOICES } from '../../src/app/mappingModel';
import { ROLE_TERMS, roleOptionText } from '../../src/app/roleTerms';
import { TIPS } from '../../src/app/tips';
import { termOf } from '../../src/core/convert/dwcTerms';
import { UI } from '../../src/core/i18n/ui';
import type { ColumnProposal, SheetMapping } from '../../src/core/types';
import type { Lang } from '../../src/core/types';

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const LANGS: Lang[] = ['en', 'pl', 'de', 'fr'];
const mapping: SheetMapping = { sheet: 'S', columns: [{ index: 0, header: 'X', role: { kind: 'date' } }] };
const proposals: ColumnProposal[] = [{ index: 0, header: 'X', cleanHeader: 'X', role: { kind: 'date' }, confidence: 'low', reason: 'x' }];
const optionText = (value: string): string => ([...(screen.getByLabelText('X: Meaning') as HTMLSelectElement).options].find((o) => o.value === value) as HTMLOptionElement).textContent ?? '';

describe('the terms of the roles', () => {
  it('has an entry for every converter role and only real Darwin Core / OBIS terms', () => {
    for (const c of CONVERT_ROLE_CHOICES) {
      expect(ROLE_TERMS[c], c).toBeDefined();
      for (const term of ROLE_TERMS[c].terms) expect(termOf(term)?.name, `${c}: ${term}`).toBe(term);
    }
  });
  it('shows the term beside the label in the dropdown (en)', () => {
    render(<MappingEditor sheet="S" proposals={proposals} samples={[['1']]} mapping={mapping} roleKinds={CONVERT_ROLE_CHOICES} rolesTip="convertRoles" onChange={() => {}} />);
    expect(optionText('date')).toBe('Date — eventDate');
    expect(optionText('latitude')).toBe('Latitude — decimalLatitude');
    expect(optionText('depth')).toBe('Depth — minimumDepthInMeters / maximumDepthInMeters');
    expect(optionText('quantity')).toBe('Quantity — individualCount / organismQuantity');
    expect(optionText('variable')).toBe('Measured variable — eMoF measurementType / measurementValue / measurementUnit');
    expect(optionText('measurementType')).toBe(UI.en['role.measurementType']);
    expect(optionText('ignore')).toBe('Ignore');
  });
  it('shows the term beside the label in Polish', () => {
    setLang('pl');
    render(<MappingEditor sheet="S" proposals={proposals} samples={[['1']]} mapping={mapping} roleKinds={CONVERT_ROLE_CHOICES} rolesTip="convertRoles" onChange={() => {}} />);
    const sel = screen.getByLabelText('X: Znaczenie') as HTMLSelectElement;
    const text = (v: string): string => [...sel.options].find((o) => o.value === v)?.textContent ?? '';
    expect(text('date')).toBe('Data — eventDate');
    expect(text('latitude')).toBe('Szerokość geograficzna — decimalLatitude');
    expect(text('variable')).toBe('Mierzona zmienna — eMoF measurementType / measurementValue / measurementUnit');
  });
  it('the tip of the roles list names the term of each role in every language', () => {
    for (const lang of LANGS) {
      setLang(lang);
      const { container, unmount } = render(<>{TIPS.convertRoles.values?.roles?.(lang)}</>);
      const items = [...container.querySelectorAll('.infotip-item strong')].map((s) => s.textContent);
      for (const c of CONVERT_ROLE_CHOICES) expect(items, `${lang} ${c}`).toContain(roleOptionText(c));
      expect(items.some((x) => x?.includes('decimalLatitude'))).toBe(true);
      unmount();
    }
  });
});

describe('texts', () => {
  it('has the table names and the "read as" line in four languages', () => {
    for (const lang of LANGS) for (const k of ['convert.dwc.table.event', 'convert.dwc.table.occurrence', 'convert.dwc.table.emof', 'convert.dwc.reads'] as const) expect((UI[lang] as Record<string, string>)[k], `${lang} ${k}`).toBeTruthy();
  });
});
