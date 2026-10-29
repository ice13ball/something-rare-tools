// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A sheet of environmental measurements only (measured variables, no taxon column, no quantity column) gets ONE blocking message, CONV-ENV-ONLY-SHEET, instead of "no taxon",
// "kind of number" and "no occurrences"; every mixed case keeps the message it had. Every value is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { nameKind } from '../../src/core/convert/measured';
import { renderConvertPlain, renderConvertTechnical } from '../../src/core/rules/convert';
import { LANGS } from '../../src/core/types';
import { fileOf, sheetInput } from './helpers';

const ids = (r: { findings: { ruleId: string }[] }): string[] => r.findings.map((f) => f.ruleId);
const STACKED = ['CONV-NO-TAXON', 'CONV-QUANTITY-UNDECLARED', 'CONV-NO-OCCURRENCES'];

const ENV_HEADER = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Temperature [degC]', 'Salinity'];
const ENV_ROWS = [['E1', '2099-01-01', 55, 3, 5, 4.5, 33.1], ['E1', '2099-01-01', 55, 3, 10, 4.2, 33.4]];

describe('CONV-ENV-ONLY-SHEET', () => {
  it('a wide environmental sheet: one message, and none of the three it replaces', () => {
    const r = convert({ sheets: [sheetInput(fileOf(ENV_HEADER, ENV_ROWS))] });
    expect(ids(r).filter((id) => id === 'CONV-ENV-ONLY-SHEET')).toHaveLength(1);
    for (const id of STACKED) expect(ids(r), id).not.toContain(id);
    expect(r.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId)).toEqual(['CONV-ENV-ONLY-SHEET']);
    expect(r.ok).toBe(false);
  });

  it('the same sheet read in the long layout (no taxon cell column, no quantity column): the same one message', () => {
    const r = convert({ sheets: [sheetInput(fileOf(ENV_HEADER, ENV_ROWS), { shape: 'long' })] });
    expect(ids(r).filter((id) => id === 'CONV-ENV-ONLY-SHEET')).toHaveLength(1);
    for (const id of STACKED) expect(ids(r), id).not.toContain(id);
  });

  it('a taxon column without counts keeps CONV-SPECIES-LIST-NO-COUNTS (a list) or CONV-TAXON-NO-QUANTITY (with measured variables)', () => {
    const list = fileOf(['Station', 'Date', 'Latitude', 'Longitude', 'scientificName'], [['A', '2099-01-01', 55, 3, 'Calanus finmarchicus'], ['A', '2099-01-01', 55, 3, 'Oithona similis']]);
    const r = convert({ sheets: [sheetInput(list)] });
    expect(ids(r)).toContain('CONV-SPECIES-LIST-NO-COUNTS');
    expect(ids(r)).not.toContain('CONV-ENV-ONLY-SHEET');
    const mixed = fileOf([...list.sheets[0].header, 'Temperature [degC]'], [['A', '2099-01-01', 55, 3, 'Calanus finmarchicus', 4.1], ['A', '2099-01-01', 55, 3, 'Oithona similis', 4.1]]);
    const m = convert({ sheets: [sheetInput(mixed)] });
    expect(ids(m)).toContain('CONV-TAXON-NO-QUANTITY');
    expect(ids(m)).not.toContain('CONV-ENV-ONLY-SHEET');
  });

  it('a taxon column with counts, long or wide, is normal: no environment-only message', () => {
    const long = fileOf(['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Taxon', 'Count', 'Temperature [degC]'], [['A', 'A1', '2099-01-01', 55, 3, 'Calanus finmarchicus', 4, 4.1]]);
    expect(ids(convert({ sheets: [sheetInput(long, { quantity: { kind: 'count' } })] }))).not.toContain('CONV-ENV-ONLY-SHEET');
    const wide = fileOf(['Sample', 'Station', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Temperature [degC]'], [['A', 'S', 55, 3, '2099-01-01', 4, 4.1]]);
    const w = convert({ sheets: [sheetInput(wide)] });
    expect(ids(w)).not.toContain('CONV-ENV-ONLY-SHEET');
    expect(ids(w)).toContain('CONV-QUANTITY-UNDECLARED');
  });

  it('an unconfirmed taxon candidate (the page sends it as "ignore" with unconfirmedTaxa) is not environmental-only: the user may still confirm it', () => {
    const r = convert({ sheets: [sheetInput(fileOf(ENV_HEADER, ENV_ROWS), { unconfirmedTaxa: [6] })] });
    expect(ids(r)).not.toContain('CONV-ENV-ONLY-SHEET');
    expect(ids(r)).toContain('CONV-NO-TAXON');
  });

  it('no measured variable at all: not environmental data, the old message stays', () => {
    const r = convert({ sheets: [sheetInput(fileOf(['Station', 'Date', 'Latitude', 'Longitude'], [['E1', '2099-01-01', 55, 3]]))] });
    expect(ids(r)).not.toContain('CONV-ENV-ONLY-SHEET');
    expect(ids(r)).toContain('CONV-NO-TAXON');
  });

  it('a sheet marked as a profile file is not read here: it keeps CONV-NO-OCCURRENCES', () => {
    const r = convert({ sheets: [sheetInput(fileOf(ENV_HEADER, ENV_ROWS), { profile: { positionStation: true } })] });
    expect(ids(r)).not.toContain('CONV-ENV-ONLY-SHEET');
    expect(ids(r)).toContain('CONV-NO-OCCURRENCES');
  });

  it('says what to do in four languages, and points to /check', () => {
    const f = convert({ sheets: [sheetInput(fileOf(ENV_HEADER, ENV_ROWS))] }).findings.find((x) => x.ruleId === 'CONV-ENV-ONLY-SHEET')!;
    const words: Record<string, RegExp> = { en: /No taxon or count column.*measured variables.*species records.*\/check/, pl: /nie zaznaczono kolumny z taksonami.*mierzone wielkości.*rekordów gatunków.*\/check/, de: /weder eine Taxon- noch eine Anzahlspalte.*Messgrößen.*Artnachweise.*\/check/, fr: /Aucune colonne de taxon ni d'effectifs.*variables mesurées.*enregistrements d'espèces.*\/check/ };
    for (const lang of LANGS) expect(renderConvertPlain(f, lang), lang).toMatch(words[lang]);
    expect(renderConvertTechnical(f)).toContain('CONV-NO-OCCURRENCES');
  });

  it.each(['Activity', 'Fluorescence', 'Turbidity', 'Irradiance', 'Transmission', 'Transmittance', 'Attenuation', 'Beam', 'Backscatter', 'Backscattering', 'Absorbance', 'Radiance', 'Conductivity', 'Light', 'Turbidity [FTU]'])(
    'a numeric column "%s" is a measured variable, not a taxon candidate: the sheet is environmental data only',
    (word) => {
      const header = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth [m]', 'Temperature [degC]', word];
      const r = convert({ sheets: [sheetInput(fileOf(header, [['E1', '2099-01-01', 55, 3, 5, 4.5, 9], ['E1', '2099-01-01', 55, 3, 10, 4.2, 8]]))] });
      expect(nameKind(word)).toBe('variable');
      expect(ids(r).filter((id) => id === 'CONV-ENV-ONLY-SHEET'), word).toHaveLength(1);
      for (const id of STACKED) expect(ids(r), `${word} ${id}`).not.toContain(id);
    },
  );

  it('a species sheet is unchanged: names that look like species stay taxon candidates, never environmental-only', () => {
    for (const w of ['Calanus finmarchicus', 'Oithona similis C1-C3', 'Pseudocalanus acuspes', 'Acartia/Centropages', 'Calanus sp.']) expect(nameKind(w), w).toBe('taxon');
    const wide = fileOf(['Sample', 'Station', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Oithona similis C1-C3'], [['A', 'S', 55, 3, '2099-01-01', 4, 2]]);
    const r = convert({ sheets: [sheetInput(wide)] });
    expect(ids(r)).not.toContain('CONV-ENV-ONLY-SHEET');
    expect(ids(r)).toContain('CONV-QUANTITY-UNDECLARED');
  });

  it('two sheets, species in one and measurements in the other (not marked as a profile file): the text says to mark THIS sheet, not to add species', () => {
    const bio = fileOf(['Sample', 'Station', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus'], [['A', 'S', 55, 3, '2099-01-01', 4]]);
    const env = fileOf(ENV_HEADER, ENV_ROWS, 'S', { fileName: 'env.csv' });
    const r = convert({ sheets: [sheetInput(bio, { quantity: { kind: 'count' } }), sheetInput(env)] });
    const f = r.findings.find((x) => x.ruleId === 'CONV-ENV-ONLY-SHEET')!;
    expect(f.params.other).toBe('taxa');
    for (const lang of LANGS) {
      expect(renderConvertPlain(f, lang), lang).not.toBe(renderConvertPlain({ ...f, params: {} }, lang));
      expect(renderConvertPlain(f, lang).length, lang).toBeLessThanOrEqual(330);
    }
    expect(renderConvertPlain(f, 'en')).toMatch(/another sheet holds the species.*profile or environment file/);
    expect(renderConvertPlain(f, 'pl')).toMatch(/gatunki są w innym arkuszu.*plik profilu/);
    expect(renderConvertPlain(f, 'de')).toMatch(/Arten stehen in einem anderen Blatt.*Profil/);
    expect(renderConvertPlain(f, 'fr')).toMatch(/autre feuille contient les espèces.*profil/);
    expect(renderConvertTechnical(f)).toContain('another sheet');
  });

  it('a sheet that is alone gets the plain text, which also tells to mark a column of species names as the taxon (an unrecognised species column)', () => {
    const f = convert({ sheets: [sheetInput(fileOf(ENV_HEADER, ENV_ROWS))] }).findings.find((x) => x.ruleId === 'CONV-ENV-ONLY-SHEET')!;
    expect(f.params.other).toBeUndefined();
    expect(renderConvertPlain(f, 'en')).toMatch(/If a column holds species names, mark it as the taxon/);
    expect(renderConvertPlain(f, 'pl')).toMatch(/zawiera nazwy gatunków, zaznacz ją jako takson/);
    expect(renderConvertPlain(f, 'de')).toMatch(/Artnamen, markieren Sie sie als Taxon/);
    expect(renderConvertPlain(f, 'fr')).toMatch(/noms d'espèces, marquez-la comme taxon/);
    expect(renderConvertPlain(f, 'en')).not.toMatch(/environmental measurements only/);
  });

  it('a species sheet of zeros next to an environmental sheet keeps its own CONV-NO-OCCURRENCES text (zeros), and the environmental sheet its own message', () => {
    const zeros = fileOf(['Sample', 'Station', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus'], [['A', 'S', 55, 3, '2099-01-01', 0]]);
    const env = fileOf(ENV_HEADER, ENV_ROWS, 'S', { fileName: 'env.csv' });
    const r = convert({ sheets: [sheetInput(zeros, { quantity: { kind: 'count' } }), sheetInput(env)] });
    expect(ids(r)).toContain('CONV-ENV-ONLY-SHEET');
    const none = r.findings.find((x) => x.ruleId === 'CONV-NO-OCCURRENCES');
    expect(none?.params.zeros).toBe('yes');
  });
});

