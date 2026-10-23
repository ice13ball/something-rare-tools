// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// META-NO-EXTENT: /check compares the extent with a table; Collection review has none, so its text must not mention one.
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import { evaluateItem, fixListRow } from '../../src/core/collection/fixlist';
import { renderPlain } from '../../src/core/report';
import { getRule, makeFinding } from '../../src/core/rules/registry';
import type { Lang } from '../../src/core/types';
import type { Item } from '../../src/core/collection/types';
import { makeRecord } from '../helpers/build';

const LANGS: Lang[] = ['en', 'pl', 'de', 'fr'];
const TABLE = /table|tabel|tableau/i;

describe('META-NO-EXTENT wording', () => {
  it('/check keeps its text: no marker, the table wording, in four languages', () => {
    const f = checkLicence([makeRecord('datacite', {})], { label: 'x', inaccessible: false }).find((x) => x.ruleId === 'META-NO-EXTENT')!;
    expect(f.params).toEqual({});
    expect(renderPlain(f, 'en')).toBe('The metadata gives neither a time span nor an area for the data, so they could not be compared with the table. Add both.');
    expect(renderPlain(f, 'pl')).toBe('Metadane nie podają ani zakresu czasu, ani obszaru geograficznego danych, więc nie dało się ich porównać z tabelą. Uzupełnij oba.');
    for (const lang of LANGS) expect(renderPlain(f, lang), lang).toMatch(TABLE);
  });

  it('Collection review words it without a table, in four languages, with no placeholder left open', () => {
    const f = checkLicence([makeRecord('datacite', {})], { label: 'x', inaccessible: false, collection: true }).find((x) => x.ruleId === 'META-NO-EXTENT')!;
    expect(f.params).toEqual({ scope: 'collection' });
    for (const lang of LANGS) {
      const t = renderPlain(f, lang);
      expect(t, lang).not.toMatch(TABLE);
      expect(t, lang).not.toMatch(/[{}]/);
      expect(t.length, lang).toBeGreaterThan(40);
      expect(t, lang).not.toBe(renderPlain(makeFinding('META-NO-EXTENT', { file: 'x' }), lang));
      expect(getRule('META-NO-EXTENT').plainCollection![lang].length, lang).toBeLessThanOrEqual(330);
    }
    expect(renderPlain(f, 'en')).toBe('The metadata gives neither a time span nor an area for the data, so the record does not say what period and place the data cover. Add both.');
  });

  it('the fix list and the evaluated item of a collection use the collection wording; the technical line is the same', () => {
    const item = { ref: '10.5281/zenodo.1', state: 'checked', records: [makeRecord('datacite', {})] } as unknown as Item;
    const f = evaluateItem(item).find((x) => x.ruleId === 'META-NO-EXTENT')!;
    for (const lang of LANGS) expect(fixListRow('r', f, lang, 'doi-list'), lang).not.toMatch(TABLE);
    expect(getRule('META-NO-EXTENT').technical).not.toMatch(/\{scope\}/);
  });
});
