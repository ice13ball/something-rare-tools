// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { buildDataset } from '../../src/core/dataset';
import { reasonsText, type LayoutReasonCode } from '../../src/core/recognize/layoutReasons';
import { proposeLayout } from '../../src/core/recognize/layout';
import { renderPlain } from '../../src/core/report';
import { LANGS } from '../../src/core/types';
import { parseFile } from '../../src/core/parse';

const csv = (name: string, text: string) => parseFile(name, new TextEncoder().encode(text));
const CODES: LayoutReasonCode[] = ['transposed', 'header-empty', 'header-units', 'header-footnote', 'no-table', 'no-rows', 'no-data-sheet'];

describe('IN-LAYOUT-UNSUPPORTED reasons are written in the reader language', () => {
  it('every code has a text in every language, and no language repeats the English one', () => {
    for (const code of CODES) {
      const en = reasonsText([{ code }], 'en');
      for (const lang of LANGS) {
        const text = reasonsText([{ code }], lang);
        expect(text.length, `${code}/${lang}`).toBeGreaterThan(10);
        if (lang !== 'en') expect(text, `${code}/${lang}`).not.toBe(en);
      }
    }
  });

  it('a transposed table: the Polish finding has no English reason in it', () => {
    const f = csv('t.csv', 'parameter,ST1,ST2,ST3\nLatitude,70.1,71.2,72.3\nLongitude,10.1,11.2,12.3\nDepth,5,5,5\nDIC,2100,2110,2120\n');
    const layout = proposeLayout(f);
    expect(layout.unsupported).toMatch(/transposed/);
    const finding = buildDataset(f, layout, [], [], 'x').findings[0];
    expect(renderPlain(finding, 'pl')).toContain('dane są obrócone');
    expect(renderPlain(finding, 'pl')).not.toMatch(/transposed|variables in rows/);
    expect(renderPlain(finding, 'de')).toContain('transponiert');
    expect(renderPlain(finding, 'fr')).toContain('transposées');
    expect(renderPlain(finding, 'en')).toContain('data is transposed');
  });

  it('several sheets name the sheet in the reader language', () => {
    expect(reasonsText([{ code: 'transposed', sheet: 'S1' }], 'pl')).toMatch(/^arkusz „S1”: /);
  });
});

describe('a row of footnote markers above the real header', () => {
  const markers = ['a', 'NA', 'b', 'a,c', 'NA', 'b', 'a'];
  const names = ['Calanus finmarchicus', 'Oithona similis', 'Acartia longiremis', 'Pseudocalanus acuspes', 'Metridia longa', 'Microcalanus pygmaeus', 'Oncaea borealis'];
  const text = (head: string[], first: string[]) => `${head.join(',')}\n${first.join(',')}\n${first.map((_, i) => String(i + 1)).join(',')}\n${first.map((_, i) => String(i + 2)).join(',')}\n`;

  it('is reported as an unsupported layout, from the structure of the two rows', () => {
    const layout = proposeLayout(csv('f.csv', text(markers, names)));
    expect(layout.unsupported).toMatch(/footnote/);
    expect(layout.unsupportedReasons?.map((r) => r.code)).toEqual(['header-footnote']);
    const finding = buildDataset(csv('f.csv', text(markers, names)), layout, [], [], 'x').findings[0];
    for (const lang of LANGS) expect(renderPlain(finding, lang)).not.toMatch(/[{}]/);
    expect(renderPlain(finding, 'pl')).toContain('znaczniki przypisów');
  });

  it('is not claimed for a short header of letters over numbers, or for real names over names', () => {
    expect(proposeLayout(csv('g.csv', text(['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['1', '2', '3', '4', '5', '6', '7']))).unsupported).toBeUndefined();
    expect(proposeLayout(csv('h.csv', text(names, ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7']))).unsupported).toBeUndefined();
  });
});
