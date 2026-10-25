// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Creator names (stage-2 acceptance, fix 3): without a comma, lowercase particles before the last word belong to the family name; with a comma the
// name is taken as written. Both rules are stated in the creators tip, in four languages.
import { describe, expect, it } from 'vitest';
import { buildEml } from '../../src/core/convert/eml';
import { EMPTY_METADATA, NAME_PARTICLES, ORGANISATION_WORDS, isOrganisationName, partyOf, splitPersonName } from '../../src/core/convert/metadata';
import { UI } from '../../src/core/i18n/ui';
import { TIPS } from '../../src/app/tips';
import { TIP_TEXTS } from '../../src/core/i18n/tips-text';
import { LANGS } from '../../src/core/types';

describe('without a comma: lowercase particles go with the family name', () => {
  it.each([
    ['Maria de la Cruz', 'Maria', 'de la Cruz'],
    ['Ludwig van Beethoven', 'Ludwig', 'van Beethoven'],
    ['Johann Wolfgang von Goethe', 'Johann Wolfgang', 'von Goethe'],
    ['Anna della Rovere', 'Anna', 'della Rovere'],
    ['Pedro dos Santos', 'Pedro', 'dos Santos'],
    ['Jan van der Berg', 'Jan', 'van der Berg'],
    ['Claire du Pont', 'Claire', 'du Pont'],
    ['Ada Maria Example', 'Ada Maria', 'Example'],
    ['Jan Kowalski', 'Jan', 'Kowalski'],
  ])('%s -> given "%s", family "%s"', (line, given, sur) => {
    expect(splitPersonName(line)).toEqual({ givenName: given, surName: sur });
  });

  it('every listed particle works', () => {
    expect([...NAME_PARTICLES]).toEqual(['de', 'la', 'del', 'della', 'di', 'da', 'du', 'des', 'van', 'von', 'der', 'den', 'ten', 'ter', 'le', 'dos', 'das']);
    for (const p of NAME_PARTICLES) expect(splitPersonName(`Eva ${p} Mora`)).toEqual({ givenName: 'Eva', surName: `${p} Mora` });
  });

  it('only lowercase particles count, and the first word is always a given name', () => {
    expect(splitPersonName('Jan Van Berg')).toEqual({ givenName: 'Jan Van', surName: 'Berg' });
    expect(splitPersonName('de Cruz')).toEqual({ surName: 'de Cruz' });
    expect(splitPersonName('Cruz')).toEqual({ surName: 'Cruz' });
    expect(splitPersonName('  Maria   de la   Cruz ')).toEqual({ givenName: 'Maria', surName: 'de la Cruz' });
  });
});

describe('with a comma: taken as written', () => {
  it('the part before the comma is the family name, whatever the words are', () => {
    expect(splitPersonName('Cruz, Maria de la')).toEqual({ givenName: 'Maria de la', surName: 'Cruz' });
    expect(splitPersonName('de la Cruz, Maria')).toEqual({ givenName: 'Maria', surName: 'de la Cruz' });
    expect(splitPersonName('van Beethoven, Ludwig')).toEqual({ givenName: 'Ludwig', surName: 'van Beethoven' });
    expect(splitPersonName('Example, Ada Maria')).toEqual({ givenName: 'Ada Maria', surName: 'Example' });
    expect(splitPersonName('Example,')).toEqual({ surName: 'Example' });
  });
});

describe('the name parts reach the EML', () => {
  it('"Maria de la Cruz" is written with the surName "de la Cruz"', () => {
    const eml = buildEml(
      { events: [], occurrences: [], metadata: { ...EMPTY_METADATA, title: 'T', abstract: 'A', creators: 'Maria de la Cruz\nCruz, Pedro de', contactName: 'Maria de la Cruz', contactEmail: 'm@example.org', licence: 'CC0-1.0' } },
      { generated: '2026-10-25T12:00:00Z' },
    );
    expect(eml).toContain('<givenName>Maria</givenName><surName>de la Cruz</surName>');
    expect(eml).toContain('<givenName>Pedro de</givenName><surName>Cruz</surName>');
  });
});

describe('the creators tip says both rules, in four languages, with the particles from the code', () => {
  it('has the placeholder, filled from NAME_PARTICLES, and a sentence about the comma', () => {
    expect(TIPS.convertMetaCreators.values?.particles?.("en")).toBe(NAME_PARTICLES.join(', '));
    for (const lang of LANGS) {
      const logic = TIP_TEXTS[lang]["tip.convertMetaCreators.logic"];
      expect(logic, lang).toContain('{particles}');
      expect(logic, lang).toMatch(lang === 'en' ? /With a comma/ : lang === 'pl' ? /Z przecinkiem/ : lang === 'de' ? /Mit Komma/ : /Avec une virgule/);
    }
    expect(UI.en['convert.meta.f.creators']).toBeTruthy();
  });
});

describe('only particles and one word: the whole name is the family name', () => {
  it('"de Vries", "de la Cruz", "van der Berg" have no given name', () => {
    expect(splitPersonName('de Vries')).toEqual({ surName: 'de Vries' });
    expect(splitPersonName('de la Cruz')).toEqual({ surName: 'de la Cruz' });
    expect(splitPersonName('van der Berg')).toEqual({ surName: 'van der Berg' });
    expect(splitPersonName('Jan van der Berg')).toEqual({ givenName: 'Jan', surName: 'van der Berg' });
  });
});

describe('organisation lines are written as organisations, never split', () => {
  it.each([
    'Institute of Marine Research', 'Instytut Oceanologii PAN', 'IO PAN', 'Alfred-Wegener-Institut', 'Institut français de recherche', 'Universität Bremen', 'Uniwersytet Gdański', 'Université de Brest',
    'Plymouth Marine Laboratory', 'Laboratoire Arago', 'Zentrum für Marine Tropenforschung', 'Centre for Environment', 'Center for Coastal Studies', 'Natural History Museum', 'Environment Agency',
    'Geological Survey of Denmark', 'Royal Society', 'Polish Academy of Sciences', 'Akademia Morska',
  ])('%s', (line) => {
    expect(isOrganisationName(line)).toBe(true);
    expect(partyOf(line)).toEqual({ kind: 'organisation', name: line });
  });

  it('a person stays a person: no organisation word, and "pan" in lower case is not PAN', () => {
    expect(partyOf('Anna Example')).toEqual({ kind: 'person', givenName: 'Anna', surName: 'Example' });
    expect(partyOf('Example, Anna')).toEqual({ kind: 'person', givenName: 'Anna', surName: 'Example' });
    expect(isOrganisationName('Jan pan Kowalski')).toBe(false);
    expect(isOrganisationName('Anna Centrella')).toBe(false);
    expect(isOrganisationName('Surveyor, Sam')).toBe(false);
  });

  it('the EML writes an organizationName for an organisation creator and contact, and a person as before', () => {
    const eml = buildEml(
      { events: [], occurrences: [], metadata: { ...EMPTY_METADATA, title: 'T', abstract: 'A', creators: 'Anna Example\nExample Marine Laboratory\nInstytut Oceanologii PAN', contactName: 'Plymouth Marine Laboratory', contactEmail: 'm@example.org', licence: 'CC0-1.0' } },
      { generated: '2026-10-25T12:00:00Z' },
    );
    expect(eml).toContain('<givenName>Anna</givenName><surName>Example</surName>');
    expect(eml).toContain('<organizationName>Example Marine Laboratory</organizationName>');
    expect(eml).toContain('<organizationName>Instytut Oceanologii PAN</organizationName>');
    expect(eml).not.toContain('<givenName>Example Marine</givenName>');
    expect(eml).toMatch(/<contact>\s*<organizationName>Plymouth Marine Laboratory<\/organizationName>\s*<electronicMailAddress>m@example.org/);
    expect(eml).toMatch(/<citation[^>]*>Example, Anna; Example Marine Laboratory; Instytut Oceanologii PAN \(2026\)/);
  });

  it('the creators tip states the rule with the words from the code, in four languages', () => {
    expect(TIPS.convertMetaCreators.values?.organisationWords?.('en')).toBe(ORGANISATION_WORDS.join(', '));
    for (const lang of LANGS) expect(TIP_TEXTS[lang]['tip.convertMetaCreators.logic'], lang).toContain('{organisationWords}');
  });
});
