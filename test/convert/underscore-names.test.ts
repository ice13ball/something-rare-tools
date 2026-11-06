// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { distinctSplits, doubtedGroups, nameDoubt, splitTaxon } from '../../src/core/convert/taxon';
import { UI } from '../../src/core/i18n/ui';

const entry = (t: string) => distinctSplits([t])[0];

describe('a name written with underscores is asked, never rewritten', () => {
  it.each(['Calanus_finmarchicus', 'Pseudocalanus_minutus_elongatus', 'C_finmarchicus', 'Calanus_finmarchicus Linnaeus', 'Calanus_sp'])('%s gets the doubt underscore and keeps its text', (t) => {
    const e = entry(t);
    expect(e.doubt).toBe('underscore');
    expect(e.needsDecision).toBe(true);
    expect(e.proposed.scientificName).toBe(splitTaxon(t).scientificName);
    expect(e.proposed.scientificName).toContain('_');
    expect(e.proposed.verbatimIdentification).toBe(t);
    expect(e.split.scientificName).toContain('_');
  });

  it('Genus_species with a trailing sp. keeps the underscore in the name', () => {
    expect(entry('Calanus_finmarchicus sp.').proposed.scientificName).toBe('Calanus_finmarchicus');
    expect(entry('Calanus_finmarchicus sp.').doubt).toBe('underscore');
  });

  it.each([
    ['SP_01', 'a code: a part with digits'],
    ['sp_1', 'a code: lower case, digits'],
    ['Calanus_sp.', 'a part that is not letters only'],
    ['genus_species', 'the first part is not capitalised'],
    ['Station_12', 'digits (the name has a digit, so the doubt is digits)'],
    ['_Calanus', 'an empty first part'],
    ['Calanus_', 'an empty last part'],
    ['Calanus__finmarchicus', 'an empty part between'],
    ['Calanus finmarchicus Smith_Jones', 'an underscore in an author part, not in the first word'],
    ['Calanus finmarchicus', 'no underscore'],
  ])('%s is not an underscore name (%s)', (t) => {
    expect(nameDoubt(t)).not.toBe('underscore');
    expect(entry(t).doubt).not.toBe('underscore');
  });

  it('a name with another doubt keeps that reason', () => {
    expect(entry('Calanus_finmarchicus 2').doubt).toBe('digits');
    expect(entry('Calanus_finmarchicus, planktic').doubt).toBe('remark');
    expect(entry('Calanus_finmarchicus/glacialis').doubt).toBe('slash');
    expect(entry('Calanus_finmarchicus x').doubt).toBe('single-letter');
    expect(entry('Calanus_finmarchicus alpha beta gamma').doubt).toBe('long');
    expect(entry('Calanus finmarchicus f').doubt).toBe('single-letter');
    expect(entry('Calanus finmarchicus CVI-CV').doubt).toBe('stage-range');
    expect(entry('Calanus glacialis?_x').doubt).not.toBe('underscore');
  });

  it('is one group of its own, last in the page order, and approving it leaves the name as written', () => {
    const groups = doubtedGroups(distinctSplits(['Calanus_finmarchicus', 'Metridia longa f', 'Oithona 2', 'Acartia_longiremis']));
    expect(groups.map((g) => g.reason)).toEqual(['digits', 'single-letter', 'underscore']);
    expect(groups[2].entries.map((e) => e.verbatim)).toEqual(['Calanus_finmarchicus', 'Acartia_longiremis']);
    const approved = { 'Calanus_finmarchicus': splitTaxon('Calanus_finmarchicus') };
    const after = distinctSplits(['Calanus_finmarchicus'], approved)[0];
    expect(after.approved).toBe(true);
    expect(after.split.scientificName).toBe('Calanus_finmarchicus');
  });

  it('has a label that says the name is kept, in four languages, and says nothing is removed', () => {
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      const text = UI[lang]['convert.doubt.underscore'];
      expect(text, lang).toContain('Genus species');
      expect(text, lang).not.toMatch(/remov|usun|usuń|entfern|supprim|delet|lösch/i);
    }
    expect(UI.en['convert.doubt.underscore']).toMatch(/kept exactly as written/);
  });
});
