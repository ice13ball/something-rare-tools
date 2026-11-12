// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { distinctSplits, doubtedGroups, nameDoubt, splitTaxon, underscoreSpaceSplit } from '../../src/core/convert/taxon';
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

  it.each(['Calanus_sp.', 'Oithona_spp.', 'Calanus_cf._glacialis', 'Pseudo-nitzschia_seriata', 'Calanus finmarchicus_CV', 'Calanus_finmarchicus(CV)', 'Calanus finmarchicus_cv', 'Calanus finmarchicus_civ', 'Calanus finmarchicus_f', 'Calanus finmarchicus_juv', 'Calanus finmarchicus_adult', 'Calanus finmarchicus_sp.', 'Calanus cf._glacialis'])(
    '%s is asked, every word being judged, and keeps its text',
    (t) => {
      const e = entry(t);
      expect(e.doubt).toBe('underscore');
      expect(e.needsDecision).toBe(true);
      expect(e.proposed.scientificName).toContain('_');
      expect(e.proposed.verbatimIdentification).toBe(t);
    },
  );

  it.each(['SP_01', 'sp_1', 'genus_species', 'Calanus finmarchicus Smith_Jones', 'Calanus__sp.', 'Calanus_', 'Calanus sp._'])('%s is still not asked', (t) => {
    expect(entry(t).doubt).not.toBe('underscore');
  });

  it('the space reading is offered for a name plus a qualifier, not where a stage would be set', () => {
    expect(underscoreSpaceSplit(entry('Oithona_spp.'))).toMatchObject({ scientificName: 'Oithona', identificationQualifier: 'spp.' });
    expect(underscoreSpaceSplit(entry('Calanus finmarchicus_CV'))).toBeUndefined();
    expect(underscoreSpaceSplit(entry('Calanus_finmarchicus(CV)'))).toBeUndefined();
    for (const t of ['Pseudo-nitzschia spp._Group', 'Calanus finmarchicus_CopV', 'Calanus_finmarchicus.']) {
      expect(entry(t).doubt, t).toBe('underscore');
      expect(underscoreSpaceSplit(entry(t)), t).toBeUndefined();
    }
  });

  it('an earlier doubt keeps its reason when a qualifier is glued on too, and underscore stays last', () => {
    expect(entry('Calanus_sp. 2').doubt).toBe('digits');
    expect(entry('Calanus_sp., planktic').doubt).toBe('remark');
    expect(entry('Calanus_sp./Oithona').doubt).toBe('slash');
    expect(entry('Calanus_sp. x').doubt).toBe('single-letter');
    const groups = doubtedGroups(distinctSplits(['Calanus_sp.', 'Metridia longa f', 'Oithona 2']));
    expect(groups.map((g) => g.reason)).toEqual(['digits', 'single-letter', 'underscore']);
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

  it('the space reading is offered only where the spaced text is a plain name, keeps the exact text, and is never applied by itself', () => {
    const split = underscoreSpaceSplit(entry('Calanus_finmarchicus'))!;
    expect(split).toEqual({ verbatimIdentification: 'Calanus_finmarchicus', scientificName: 'Calanus finmarchicus' });
    expect(entry('Calanus_finmarchicus').split.scientificName).toBe('Calanus_finmarchicus');
    expect(underscoreSpaceSplit(entry('Calanus_sp'))).toMatchObject({ scientificName: 'Calanus', identificationQualifier: 'sp.', verbatimIdentification: 'Calanus_sp' });
    // a stage or a sex would be set that the list does not show: those names are not in the group (their own row, or "as written")
    for (const t of ['Calanus_finmarchicus_CV', 'Calanus_finmarchicus_CV_f', 'Calanus_finmarchicus_juv', 'Sagitta_elegans_juvenile']) {
      expect(entry(t).doubt, t).toBe('underscore');
      expect(underscoreSpaceSplit(entry(t)), t).toBeUndefined();
    }
    expect(underscoreSpaceSplit(entry('Calanus_finmarchicus'))).toBeDefined();
    // a single letter would be left: its own row decides
    expect(underscoreSpaceSplit(entry('Acartia_hudsonica_C'))).toBeUndefined();
    // not an underscore name, or already approved
    expect(underscoreSpaceSplit(entry('Calanus finmarchicus f'))).toBeUndefined();
    const approved = distinctSplits(['Calanus_finmarchicus'], { Calanus_finmarchicus: splitTaxon('Calanus_finmarchicus') })[0];
    expect(underscoreSpaceSplit(approved)).toBeUndefined();
  });

  it('the label is two sentences: it names what is asked, then says the name is kept (no run-on colon)', () => {
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      const text = UI[lang]['convert.doubt.underscore'];
      expect(text, lang).toMatch(/\)\. /);
      expect(text, lang).not.toMatch(/: /);
    }
  });
});
