// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A sheet of environmental measurements only (measured variables, no taxon column, no quantity column) gets ONE blocking message, CONV-ENV-ONLY-SHEET, instead of "no taxon",
// "kind of number" and "no occurrences"; every mixed case keeps the message it had. Every value is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
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
    const words: Record<string, RegExp> = { en: /environmental measurements only.*species.*eMoF.*\/check/, pl: /tylko pomiary środowiskowe.*gatunk.*eMoF.*\/check/, de: /nur Umweltmessungen.*Arten.*eMoF.*\/check/, fr: /que des mesures environnementales.*espèces.*eMoF.*\/check/ };
    for (const lang of LANGS) expect(renderConvertPlain(f, lang), lang).toMatch(words[lang]);
    expect(renderConvertTechnical(f)).toContain('CONV-NO-OCCURRENCES');
  });
});
