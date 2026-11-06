// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The noun and the verb that go with a list of lines agree with how many lines there are (ROW-NON-NUMERIC, ROW-NA-VARIANT), and so does the pronoun of CONV-SUMMARY-ROW-KEPT.
import { describe, expect, it } from 'vitest';
import { renderPlain } from '../../src/core/report';
import { makeFinding } from '../../src/core/rules/registry';
import { makeConvertFinding, renderConvertPlain } from '../../src/core/rules/convert';

const lines = (n: number): number[] => Array.from({ length: n }, (_, i) => 7 + i * 2);
const row = (id: string, n: number, lang: 'pl' | 'en' | 'de' | 'fr'): string => renderPlain(makeFinding(id, { file: 'f.csv', sheet: 'S', field: 'Temp', value: 'x1', lines: lines(n) }), lang);

describe('ROW-NON-NUMERIC: noun and verb agree with the number of lines', () => {
  it('Polish: "w wierszu 7 jest tekst" for one line, "w wierszach" for 2, 5 and 22', () => {
    expect(row('ROW-NON-NUMERIC', 1, 'pl')).toContain('w wierszu 7 jest tekst');
    for (const n of [2, 5, 22]) {
      const t = row('ROW-NON-NUMERIC', n, 'pl');
      expect(t, String(n)).toContain('w wierszach');
      expect(t, String(n)).not.toContain('w wierszu');
      expect(t, String(n)).toContain('jest tekst');
    }
  });
  it('a range reads the same: lines 7, 8 and 9 as 7–9 are "wierszach 7–9"', () => {
    const t = renderPlain(makeFinding('ROW-NON-NUMERIC', { file: 'f.csv', field: 'Temp', value: 'x1', lines: [7, 8, 9] }), 'pl');
    expect(t).toContain('w wierszach 7–9 jest tekst');
  });
  it('English, German and French: singular noun and verb for one line, plural for several', () => {
    expect(row('ROW-NON-NUMERIC', 1, 'en')).toContain('line 7 contains text');
    expect(row('ROW-NON-NUMERIC', 2, 'en')).toContain('lines 7, 9 contain text');
    expect(row('ROW-NON-NUMERIC', 1, 'de')).toContain('die Zeile 7 enthält Text');
    expect(row('ROW-NON-NUMERIC', 5, 'de')).toMatch(/die Zeilen .* enthalten Text/);
    expect(row('ROW-NON-NUMERIC', 1, 'fr')).toContain('la ligne 7 contient du texte');
    expect(row('ROW-NON-NUMERIC', 22, 'fr')).toMatch(/les lignes .* contiennent du texte/);
  });
  it('ROW-NA-VARIANT has the same noun in all four languages', () => {
    expect(row('ROW-NA-VARIANT', 1, 'pl')).toContain('w wierszu 7');
    expect(row('ROW-NA-VARIANT', 5, 'pl')).toContain('w wierszach');
    expect(row('ROW-NA-VARIANT', 1, 'en')).toContain('in line 7');
    expect(row('ROW-NA-VARIANT', 1, 'de')).toContain('in der Zeile 7');
    expect(row('ROW-NA-VARIANT', 1, 'fr')).toContain('à la ligne 7');
    expect(row('ROW-NA-VARIANT', 3, 'fr')).toContain('aux lignes');
  });
});

describe('CONV-SUMMARY-ROW-KEPT: "it is not a real sample" for one row, "they are not real samples" for several, and no advice to delete', () => {
  const kept = (count: number, lang: 'pl' | 'en' | 'de' | 'fr'): string =>
    renderConvertPlain(makeConvertFinding('CONV-SUMMARY-ROW-KEPT', { file: 'f.csv', sheet: 'S', value: 'Max', lines: lines(count), params: { count } }), lang);
  it.each([1, 2, 5, 22])('%i row(s): the verb agrees in every language, and nothing says to delete', (n) => {
    const pl = kept(n, 'pl');
    expect(pl).toContain(n === 1 ? 'to nie próbka' : 'to nie próbki');
    expect(pl).not.toContain(n === 1 ? 'to nie próbki' : 'to nie próbka,');
    expect(kept(n, 'en')).toContain(n === 1 ? 'it is not a real sample' : 'they are not real samples');
    expect(kept(n, 'de')).toContain(n === 1 ? 'Ist es keine echte Probe' : 'Sind es keine echten Proben');
    expect(kept(n, 'fr')).toContain(n === 1 ? "Si ce n'est pas un échantillon" : 'Si ce ne sont pas des échantillons');
    for (const lang of ['pl', 'en', 'de', 'fr'] as const) {
      expect(kept(n, lang), lang).not.toMatch(/\{|\}/);
      expect(kept(n, lang), lang).not.toMatch(/delete|usuń|löschen|supprim/i);
    }
  });
});
