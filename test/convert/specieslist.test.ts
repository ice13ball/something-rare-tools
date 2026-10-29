// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A plain species list (a taxon column, no numbers) gets ONE blocking message. Every value is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { renderConvertPlain, renderConvertTechnical } from '../../src/core/rules/convert';
import { LANGS } from '../../src/core/types';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { candidatesOf, initialChoices, requestOf, type ConvertState } from '../../src/app/convertModel';
import type { ConvertParseResult } from '../../src/worker/convert.protocol';
import { csvOf } from '../app/convertHelpers';
import { fileOf, sheetInput } from './helpers';

const ids = (r: { blocking: { ruleId: string }[] }): string[] => r.blocking.map((f) => f.ruleId);

async function run(name: string, text: string, quantity: { kind: 'count' } | undefined) {
  const engine = createDirectConvertEngine();
  const parsed: ConvertParseResult = await engine.parse([{ name, bytes: new TextEncoder().encode(text), source: 'dropped' }]);
  const state: ConvertState = { parsed, mappings: {}, choices: initialChoices(parsed), options: {}, approved: {}, confirmed: {} };
  for (const c of candidatesOf(parsed, state.mappings, state.choices)) state.confirmed[c.key] = true;
  const req = requestOf(state);
  return engine.convert({ ...req, sheets: req.sheets.map((s) => ({ ...s, ...(quantity ? { quantity } : {}) })) });
}

describe('a species list with no counts', () => {
  const list = csvOf(['Station', 'Date', 'Latitude', 'Longitude', 'scientificName'], [['ZL1', '2099-01-01', 55, 3, 'Calanus finmarchicus'], ['ZL2', '2099-01-02', 56, 4, 'Oithona similis']]);

  it('gets exactly one blocking message, whether or not the user declared a kind', async () => {
    for (const q of [undefined, { kind: 'count' as const }]) {
      const v = await run('list.csv', list, q);
      const all = v.findings.map((f) => f.ruleId);
      expect(all.filter((id) => id === 'CONV-SPECIES-LIST-NO-COUNTS')).toHaveLength(1);
      for (const id of ['CONV-NO-TAXON', 'CONV-QUANTITY-UNDECLARED', 'CONV-NO-OCCURRENCES']) expect(all, id).not.toContain(id);
      expect(v.findings.filter((f) => f.severity === 'error')).toHaveLength(1);
    }
  });

  it('says what is missing in four languages, and not "environmental data"', async () => {
    const v = await run('list.csv', list, undefined);
    const f = v.findings.find((x) => x.ruleId === 'CONV-SPECIES-LIST-NO-COUNTS')!;
    const words: Record<string, RegExp> = { en: /lists species without counts.*tick "This is a list of species found.*counts, density or biomass/, pl: /wymienia gatunki bez liczebności.*To jest lista znalezionych gatunków.*liczebnością/, de: /Arten ohne Anzahlen.*Dies ist eine Liste gefundener Arten/, fr: /espèces sans effectifs.*C'est une liste d'espèces trouvées/ };
    for (const lang of LANGS) {
      expect(renderConvertPlain(f, lang), lang).toMatch(words[lang]);
      expect(renderConvertPlain(f, lang), lang).not.toMatch(/environment|środowisk|Umwelt|environnement/i);
    }
    expect(renderConvertTechnical(f)).toContain('presence-only');
  });

  it('CONV-NO-TAXON no longer speaks of presence-only lists', () => {
    const f = convert({ sheets: [sheetInput(fileOf(['Sample', 'Station'], [['A', 'S']]), { quantity: { kind: 'count' } })] }).blocking.find((x) => x.ruleId === 'CONV-NO-TAXON')!;
    for (const lang of LANGS) expect(renderConvertPlain(f, lang), lang).not.toMatch(/presence|obecności|Anwesenheit|présence/);
  });
});

describe('a taxon column and measured variables, but no quantity column', () => {
  const sheet = csvOf(['Station', 'Date', 'Latitude', 'Longitude', 'scientificName', 'Temperature [degC]'], [['ZL1', '2099-01-01', 55, 3, 'Calanus finmarchicus', 4.5], ['ZL1', '2099-01-01', 55, 3, 'Oithona similis', 4.5]]);

  it('gets one CONV-TAXON-NO-QUANTITY and never "no taxon column is marked", quantity-undeclared or no-occurrences', async () => {
    for (const q of [undefined, { kind: 'count' as const }]) {
      const v = await run('taxon-temp.csv', sheet, q);
      const all = v.findings.map((f) => f.ruleId);
      expect(all.filter((id) => id === 'CONV-TAXON-NO-QUANTITY')).toHaveLength(1);
      for (const id of ['CONV-NO-TAXON', 'CONV-QUANTITY-UNDECLARED', 'CONV-NO-OCCURRENCES', 'CONV-SPECIES-LIST-NO-COUNTS']) expect(all, id).not.toContain(id);
      expect(v.findings.filter((f) => f.severity === 'error')).toHaveLength(1);
    }
  });

  it('says the taxon column is marked and the quantity column is missing, in four languages', async () => {
    const f = (await run('taxon-temp.csv', sheet, undefined)).findings.find((x) => x.ruleId === 'CONV-TAXON-NO-QUANTITY')!;
    const words: Record<string, RegExp> = { en: /taxon column is marked.*no quantity column.*counts, density or biomass.*presence-only lists yet/, pl: /zaznaczono kolumnę z taksonami, ale nie ma kolumny z ilością.*list samej obecności/, de: /Taxon-Spalte markiert.*keine Mengenspalte.*reine Anwesenheitslisten/, fr: /colonne de taxon est marquée.*pas de colonne de quantité.*listes de présence seule/ };
    for (const lang of LANGS) expect(renderConvertPlain(f, lang), lang).toMatch(words[lang]);
    expect(renderConvertTechnical(f)).toContain('Presence-only');
  });
});

describe('the other two cases keep their messages', () => {
  it('an environmental-only upload (marked as a profile file) still gets CONV-NO-OCCURRENCES', () => {
    const env = fileOf(['Station', 'Date', 'Latitude', 'Longitude', 'Temperature [degC]'], [['E1', '2099-01-01', 55, 3, 4.5]]);
    const r = convert({ sheets: [sheetInput(env, { profile: { positionStation: true } })] });
    expect(ids(r)).toContain('CONV-NO-OCCURRENCES');
    expect(ids(r)).not.toContain('CONV-SPECIES-LIST-NO-COUNTS');
    expect(ids(r)).not.toContain('CONV-ENV-ONLY-SHEET');
  });

  it('a sheet with counts and no declared kind keeps the quantity-kind block, and no species-list message', () => {
    const bio = fileOf(['Sample', 'Station', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus'], [['A', 'S', 55, 3, '2099-01-01', 4]]);
    const r = convert({ sheets: [sheetInput(bio)] });
    expect(ids(r)).toContain('CONV-QUANTITY-UNDECLARED');
    expect(ids(r)).not.toContain('CONV-SPECIES-LIST-NO-COUNTS');
    expect(ids(r)).not.toContain('CONV-NO-OCCURRENCES');
  });
});
