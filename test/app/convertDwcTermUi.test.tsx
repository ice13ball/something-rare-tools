// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// The role "Darwin Core term…" of /convert: the model helpers, the second select with the pick list, and the chosen term reaching event.txt through the convert entry.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MappingEditor } from '../../src/app/components/MappingEditor';
import { initLang, setLang } from '../../src/app/i18n';
import { CONVERT_ROLE_CHOICES, mappingWith, roleChoiceOf, roleFromChoice } from '../../src/app/mappingModel';
import { termOptionText, termsByGroup } from '../../src/app/dwcTermModel';
import { roleOptionText } from '../../src/app/roleTerms';
import { openPickList } from '../../src/core/convert/dwcTermColumns';
import { UI } from '../../src/core/i18n/ui';
import { TIPS } from '../../src/app/tips';
import type { ColumnProposal, ColumnRole, Lang, SheetMapping } from '../../src/core/types';
import { exportSheet, objects, readBack } from '../convert/exportHelpers';
import { W1_HEADER, W1_QUANTITY, W1_ROWS } from '../convert/helpers';
import type { Cell } from '../convert/helpers';

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const ign: ColumnRole = { kind: 'ignore' };

describe('model helpers', () => {
  it('choosing the role gives an empty term for a header that is no term, and the header term for one that is', () => {
    expect(roleFromChoice(ign, ign, 'dwcTerm', 'Notes')).toEqual({ kind: 'dwcTerm', term: '' });
    expect(roleFromChoice(ign, ign, 'dwcTerm', 'dwc:habitat')).toEqual({ kind: 'dwcTerm', term: 'habitat' });
    expect(roleChoiceOf({ kind: 'dwcTerm', term: 'habitat' })).toBe('dwcTerm');
  });
  it('keeps the term when the choice is made again, and restores the proposal on switching back', () => {
    const cur: ColumnRole = { kind: 'dwcTerm', term: 'samplingProtocol' };
    expect(roleFromChoice(cur, ign, 'dwcTerm', 'Notes')).toBe(cur);
    expect(roleFromChoice(cur, ign, 'ignore', 'Notes')).toEqual(ign);
    const proposed: ColumnRole = { kind: 'dwcTerm', term: 'habitat' };
    expect(roleFromChoice(ign, proposed, 'dwcTerm', 'Notes')).toBe(proposed);
  });
  it('lists the role in the dropdown, with its term in the text', () => {
    expect(CONVERT_ROLE_CHOICES).toContain('dwcTerm');
    expect(roleOptionText('dwcTerm')).toBe('Darwin Core term…');
    expect(roleOptionText('dwcTerm', 'habitat')).toBe('Darwin Core term… — habitat');
  });
  it('writes status text for listed terms and groups the pick list', () => {
    expect(termOptionText('habitat')).toMatch(/^habitat \(.*(GBIF|OBIS): [a-z ]+/);
    expect(termOptionText('notATerm')).toBe('notATerm');
    const g = termsByGroup();
    expect([...g.event, ...g.occurrence, ...g.record].map((x) => x.name).sort()).toEqual([...openPickList()].sort());
  });
});

const mapping: SheetMapping = { sheet: 'S', columns: [{ index: 0, header: 'Notes', role: ign }] };
const proposals: ColumnProposal[] = [{ index: 0, header: 'Notes', cleanHeader: 'Notes', role: ign, confidence: 'low', reason: 'x' }];

describe('the term select', () => {
  const show = (m: SheetMapping, onChange: (m: SheetMapping) => void = () => {}) =>
    render(<MappingEditor sheet="S" proposals={proposals} samples={[['1']]} mapping={m} roleKinds={CONVERT_ROLE_CHOICES} rolesTip="convertRoles" onChange={onChange} />);
  it('appears only with the role, offers the pick list by table, and reports the choice', () => {
    let current = mapping;
    const { rerender } = show(current, (m) => (current = m));
    expect(screen.queryByLabelText('Notes: Darwin Core term')).toBeNull();
    fireEvent.change(screen.getByLabelText('Notes: Meaning'), { target: { value: 'dwcTerm' } });
    expect(current.columns[0].role).toEqual({ kind: 'dwcTerm', term: '' });
    rerender(<MappingEditor sheet="S" proposals={proposals} samples={[['1']]} mapping={current} roleKinds={CONVERT_ROLE_CHOICES} rolesTip="convertRoles" onChange={(m) => (current = m)} />);
    const sel = screen.getByLabelText('Notes: Darwin Core term') as HTMLSelectElement;
    expect([...sel.querySelectorAll('optgroup')].map((o) => o.label)).toEqual(['Event', 'Occurrence', 'Record']);
    const habitat = [...sel.options].find((o) => o.value === 'habitat');
    expect(habitat?.textContent).toMatch(/^habitat \(/);
    fireEvent.change(sel, { target: { value: 'habitat' } });
    expect(current.columns[0].role).toEqual({ kind: 'dwcTerm', term: 'habitat' });
  });
  it('shows the term of a proposed column selected, even an optional one that is not on the list', () => {
    show(mappingWith(mapping, 0, { kind: 'dwcTerm', term: 'habitat' }));
    expect((screen.getByLabelText('Notes: Darwin Core term') as HTMLSelectElement).value).toBe('habitat');
    cleanup();
    const optional = openPickList().includes('verbatimLocality') ? 'georeferenceVerificationStatus' : 'verbatimLocality';
    show(mappingWith(mapping, 0, { kind: 'dwcTerm', term: optional }));
    expect((screen.getByLabelText('Notes: Darwin Core term') as HTMLSelectElement).value).toBe(optional);
  });
});

describe('four languages', () => {
  const keys = ['role.dwcTerm', 'mapping.dwcTerm', 'dwcTerm.choose', 'dwcTerm.group.event', 'dwcTerm.group.occurrence', 'dwcTerm.group.record', 'dwcTerm.status.required', 'dwcTerm.status.recommended'] as const;
  it('has every new key, translated, in en pl de fr', () => {
    for (const l of ['pl', 'de', 'fr'] as Lang[]) for (const k of keys) expect(UI[l][k], `${l} ${k}`).not.toBe(UI.en[k]);
    expect(UI.pl['role.dwcTerm']).toBe('Termin Darwin Core…');
    expect(Object.keys(TIPS).length).toBeGreaterThan(0);
  });
});

describe('end to end', () => {
  it('a column set to dwcTerm habitat through the model helper lands in event.txt', async () => {
    const header = [...W1_HEADER, 'Notes'];
    const rows: Cell[][] = W1_ROWS.map((r, i) => [...r, ['sand', 'sand', 'mud'][i]]);
    const role = roleFromChoice(ign, ign, 'dwcTerm', 'Notes');
    const chosen = { ...role, term: 'habitat' } as ColumnRole;
    const e = await exportSheet(header, rows, { quantity: W1_QUANTITY, edit: { Notes: chosen } });
    const rb = await readBack(e.zip);
    expect(objects(rb.tables['event.txt']).map((x) => x.habitat).sort()).toEqual(expect.arrayContaining(['mud', 'sand']));
  });
  it('a column left at "choose a term" is named, not dropped silently', async () => {
    const header = [...W1_HEADER, 'Notes'];
    const rows: Cell[][] = W1_ROWS.map((r) => [...r, 'x']);
    const e = await exportSheet(header, rows, { quantity: W1_QUANTITY, edit: { Notes: roleFromChoice(ign, ign, 'dwcTerm', 'Notes') } });
    expect(e.findings.some((f) => f.ruleId === 'CONV-COLUMN-NOT-EXPORTED' && JSON.stringify(f).includes('Notes'))).toBe(true);
  });
});
