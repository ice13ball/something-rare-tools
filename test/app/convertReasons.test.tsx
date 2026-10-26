// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Every reason the converter overlay gives for a column is shown in the reader's language: a code (OVERLAY_REASONS) with a text per language, never English in pl, de or fr.
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MappingEditor } from '../../src/app/components/MappingEditor';
import { initLang, setLang } from '../../src/app/i18n';
import { CONVERT_ROLE_CHOICES } from '../../src/app/mappingModel';
import { OVERLAY_REASONS, proposeConvertColumns } from '../../src/core/convert/recognize';
import { UI, type UiKey } from '../../src/core/i18n/ui';
import type { ColumnProposal } from '../../src/core/types';
import { LANGS } from '../../src/core/types';
import { rawSheet } from '../helpers/files';
import { CTX, L1_HEADER, L1_ROWS, W1_HEADER, W1_ROWS, type Cell } from '../convert/helpers';

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const key = (code: string): UiKey => `convert.reason.${code}` as UiKey;
const CODES = Object.keys(OVERLAY_REASONS);

describe('the reason table', () => {
  it('every code has a text in all four languages; English is the technical wording, the other three differ from it', () => {
    for (const code of CODES) {
      for (const lang of LANGS) expect(UI[lang][key(code)]?.trim(), `${lang} ${code}`).toBeTruthy();
      expect(UI.en[key(code)], code).toBe(OVERLAY_REASONS[code as keyof typeof OVERLAY_REASONS]);
      for (const lang of ['pl', 'de', 'fr'] as const) expect(UI[lang][key(code)], `${lang} ${code}`).not.toBe(UI.en[key(code)]);
    }
  });

  it('no convert.reason key exists without its code, and none lacks a language', () => {
    for (const lang of LANGS) {
      const keys = Object.keys(UI[lang]).filter((k) => k.startsWith('convert.reason.'));
      expect(keys.sort(), lang).toEqual(CODES.map((c) => `convert.reason.${c}`).sort());
    }
  });

  it('the overlay writes a reason only through its code table: no free text in recognize.ts', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'core', 'convert', 'recognize.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const assigns = [...src.matchAll(/\.reason\s*=\s*([^;\n]*)/g)].map((m) => m[1].trim());
    expect(assigns).toEqual(['OVERLAY_REASONS[code]']);
    expect([...src.matchAll(/why\(p, ([^)]*)\)/g)].every((m) => /^'[a-z0-9-]+'$|^claim\.code$|^`depth-\$\{bound\}-\$\{dwcDepth \? 'dwc' : 'name'\}` as OverlayReason$/.test(m[1]))).toBe(true);
  });

  it('every proposal of the overlay that has a reason code has one from the table, and the English reason is the table text', () => {
    const sheets: [string[], Cell[][]][] = [
      [W1_HEADER, W1_ROWS],
      [L1_HEADER, L1_ROWS],
      [['Station', 'Calanus finmarchicus', 'Total copepods', 'Comments'], [['S', '+', 4, 'x'], ['T', 'NA', 5, 'y']]],
      [['Station', 'Calanus finmarchicus', 'Total copepods'], [['S', '+', '+'], ['T', 'NA', 'x']]],
      [['Sample', 'eventID', 'Species', 'Count', 'organismQuantity', 'Depth top', 'Depth bottom', 'Stage', 'Volume', 'Area'], [['a', 'e', 'Calanus', 3, 3, 0, 10, 'C2', 5, 1]]],
    ];
    const seen = new Set<string>();
    for (const [h, r] of sheets) {
      for (const p of proposeConvertColumns(rawSheet([...h], r.map((x) => [...x])), CTX)) {
        if (p.reasonCode === undefined || !(p.reasonCode in OVERLAY_REASONS)) continue; // a code of the shared proposer is tested in checkReasons.test.tsx
        expect(CODES, p.reasonCode).toContain(p.reasonCode);
        expect(p.reason).toBe(OVERLAY_REASONS[p.reasonCode as keyof typeof OVERLAY_REASONS]);
        seen.add(p.reasonCode);
      }
    }
    expect([...seen].sort()).toEqual(expect.arrayContaining(['taxon-numeric', 'taxon-marks', 'summary-header', 'summary-total', 'dwc-occurrenceid', 'name-taxon', 'depth-min-name', 'name-effort-volume']));
  });
});

describe('the mapping table shows the reason in the reader language', () => {
  /** Low-confidence proposals of a battery of sheets, one per overlay reason that is shown (a note is shown for low confidence only). */
  const lowProposals = (): { p: ColumnProposal; sheet: ReturnType<typeof rawSheet> }[] => {
    const sheets: [string[], Cell[][]][] = [
      [W1_HEADER, W1_ROWS],
      [['Station', 'Calanus finmarchicus', 'Total copepods'], [['S', '+', 4], ['T', 'NA', 5]]],
      [['Station', 'Calanus finmarchicus', 'Total copepods'], [['S', '+', '+'], ['T', 'NA', 'x']]],
      [['occurrenceID', 'eventID', 'scientificName', 'individualCount', 'organismQuantity'], [['o', 'e', 'Calanus', 3, 3]]],
      [['Sample', 'eventID', 'Species', 'Count'], [['a', 'e', 'Calanus', 3]]],
    ];
    const out: { p: ColumnProposal; sheet: ReturnType<typeof rawSheet> }[] = [];
    for (const [h, r] of sheets) {
      const sheet = rawSheet([...h], r.map((x) => [...x]));
      for (const p of proposeConvertColumns(sheet, CTX)) if (p.confidence === 'low' && p.reasonCode !== undefined && p.reasonCode in OVERLAY_REASONS) out.push({ p, sheet });
    }
    return out;
  };

  it('pl, de and fr show the translated reason of every low-confidence overlay proposal, never the English text', () => {
    const cases = lowProposals();
    expect(new Set(cases.map((c) => c.p.reasonCode))).toEqual(new Set(['taxon-numeric', 'taxon-marks', 'summary-header', 'summary-total', 'quantity-other', 'eventid-used']));
    for (const lang of ['pl', 'de', 'fr', 'en'] as const) {
      for (const { p } of cases) {
        cleanup();
        setLang(lang);
        render(<MappingEditor sheet="S" proposals={[p]} samples={[['1']]} mapping={{ sheet: 'S', columns: [{ index: p.index, header: p.header, role: p.role }] }} roleKinds={CONVERT_ROLE_CHOICES} rolesTip="convertRoles" onChange={() => {}} />);
        const note = document.querySelector('.low-note .muted')?.textContent;
        expect(note, `${lang} ${p.reasonCode}`).toBe(UI[lang][key(p.reasonCode as string)]);
        if (lang !== 'en') expect(note, `${lang} ${p.reasonCode}`).not.toBe(OVERLAY_REASONS[p.reasonCode as keyof typeof OVERLAY_REASONS]);
        expect(screen.getByText(UI[lang]['mapping.low'], { exact: false })).toBeTruthy();
      }
    }
  });

  it('/check proposals carry no reason code, so /check shows what it always showed', () => {
    const p = { index: 0, header: 'x', cleanHeader: 'x', role: { kind: 'variable' as const, variable: 'x' }, confidence: 'low' as const, reason: 'numeric column with an unrecognised name' };
    render(<MappingEditor sheet="S" proposals={[p]} samples={[['1']]} mapping={{ sheet: 'S', columns: [{ index: 0, header: 'x', role: p.role }] }} onChange={() => {}} />);
    expect(document.querySelector('.low-note .muted')?.textContent).toBe('numeric column with an unrecognised name');
  });
});
