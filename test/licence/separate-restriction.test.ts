// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// L1 of the 18.11 audit: a restriction written in a field of its own next to a recognised licence (ISO otherConstraints / useLimitation,
// Dataverse termsOfUse) is compared with the licence. Invented records only.
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import { analyseLicences } from '../../src/core/licence/analyse';
import { parseDataciteJson } from '../../src/core/metadata/datacite';
import { parseIso19139 } from '../../src/core/metadata/iso19139';
import { parseIso19115_3 } from '../../src/core/metadata/iso19115-3';
import { renderPlain } from '../../src/core/report';
import type { Finding } from '../../src/core/types';

const RULE = 'LIC-SEPARATE-RESTRICTION';
const BY = 'https://creativecommons.org/licenses/by/4.0/';
const BY_NAME = 'Creative Commons Attribution 4.0 International';
const NC_NAME = 'Creative Commons Attribution-NonCommercial 4.0 International';
const NC = 'https://creativecommons.org/licenses/by-nc/4.0/';
const ND_NAME = 'Creative Commons Attribution-NoDerivatives 4.0 International';
const ND = 'https://creativecommons.org/licenses/by-nd/4.0/';

type Constraint = { tag: 'otherConstraints' | 'useLimitation'; text: string; link?: string };
const licenceConstraint = (name = BY_NAME, link = BY): Constraint => ({ tag: 'otherConstraints', text: name, link });

/** An ISO 19139 record with the given resource constraints (in this order) and optional extra XML inside the constraints / the metadata. */
function iso(constraints: Constraint[], opts: { codes?: string[]; metadataLevel?: Constraint[] } = {}): ReturnType<typeof parseIso19139> {
  const one = (c: Constraint) =>
    `<md:${c.tag}>${c.link ? `<x:Anchor l:href="${c.link}">${c.text}</x:Anchor>` : `<c:CharacterString>${c.text}</c:CharacterString>`}</md:${c.tag}>`;
  const codes = (opts.codes ?? []).map((v) => `<md:accessConstraints><md:MD_RestrictionCode codeList="x" codeListValue="${v}"/></md:accessConstraints>`).join('');
  const meta = (opts.metadataLevel ?? []).length > 0 ? `<md:metadataConstraints><md:MD_LegalConstraints>${opts.metadataLevel!.map(one).join('')}</md:MD_LegalConstraints></md:metadataConstraints>` : '';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<md:MD_Metadata xmlns:md="http://www.isotc211.org/2005/gmd" xmlns:c="http://www.isotc211.org/2005/gco" xmlns:x="http://www.isotc211.org/2005/gmx" xmlns:l="http://www.w3.org/1999/xlink">
  <md:identificationInfo><md:MD_DataIdentification>
    <md:citation><md:CI_Citation><md:title><c:CharacterString>Invented survey</c:CharacterString></md:title><md:edition><c:CharacterString>1</c:CharacterString></md:edition></md:CI_Citation></md:citation>
    <md:resourceConstraints><md:MD_LegalConstraints>${codes}${constraints.map(one).join('')}</md:MD_LegalConstraints></md:resourceConstraints>
  </md:MD_DataIdentification></md:identificationInfo>${meta}
</md:MD_Metadata>`;
  return parseIso19139(xml, 'iso-rec');
}

const run = (rec: ReturnType<typeof iso>): Finding[] => checkLicence([rec], { label: 'iso-rec', inaccessible: false });
const lic = (rec: ReturnType<typeof iso>): string[] => run(rec).filter((f) => f.ruleId.startsWith('LIC-')).map((f) => f.ruleId);
const withBy = (c: Constraint, ...more: Constraint[]) => iso([licenceConstraint(), c, ...more]);

describe('L1: the audit scenarios', () => {
  it('a second otherConstraints "restricted to project partners" next to CC BY 4.0 is one warning naming both fields and quoting the text', () => {
    const rec = withBy({ tag: 'otherConstraints', text: 'Data access restricted to project partners' });
    const f = run(rec).filter((x) => x.ruleId === RULE);
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('warning');
    expect(f[0].field).toBe('otherConstraints');
    expect(f[0].params).toMatchObject({ licenceField: 'otherConstraints', text: 'Data access restricted to project partners' });
    expect(String(f[0].params.licence)).toContain('CC-BY-4.0');
    const plain = renderPlain(f[0], 'en');
    expect(plain).toContain('Data access restricted to project partners');
    expect(plain).toContain('otherConstraints');
    expect(lic(rec)).toEqual([RULE]);
  });

  it('useLimitation "Not to be used for commercial purposes" next to CC BY 4.0 names useLimitation as the restriction and otherConstraints as the licence', () => {
    const rec = iso([licenceConstraint(), { tag: 'useLimitation', text: 'Not to be used for commercial purposes' }]);
    const f = run(rec).filter((x) => x.ruleId === RULE);
    expect(f).toHaveLength(1);
    expect(f[0].field).toBe('useLimitation');
    expect(f[0].params).toMatchObject({ licenceField: 'otherConstraints', text: 'Not to be used for commercial purposes' });
  });

  it('the restriction comes first and the licence second: still found, the licence field is the licence element', () => {
    const rec = iso([{ tag: 'useLimitation', text: 'No derivatives may be made from these data' }, licenceConstraint()]);
    const f = run(rec).filter((x) => x.ruleId === RULE);
    expect(f).toHaveLength(1);
    expect(f[0].field).toBe('useLimitation');
  });

  it('the restriction is the THIRD otherConstraints element, after a harmless one', () => {
    const rec = iso([licenceConstraint(), { tag: 'otherConstraints', text: 'Contact: data@example.org' }, { tag: 'otherConstraints', text: 'Access limited to consortium members' }]);
    const f = run(rec).filter((x) => x.ruleId === RULE);
    expect(f).toHaveLength(1);
    expect(f[0].params.text).toBe('Access limited to consortium members');
  });

  it('two restrictions are two findings, each quoting its own text', () => {
    const rec = withBy({ tag: 'otherConstraints', text: 'Access limited to consortium members' }, { tag: 'useLimitation', text: 'No commercial use' });
    const f = run(rec).filter((x) => x.ruleId === RULE);
    expect(f.map((x) => x.params.text).sort()).toEqual(['Access limited to consortium members', 'No commercial use']);
  });

  it('works for the ISO 19115-3 profile as well', () => {
    const xml = `<mdb:MD_Metadata xmlns:mdb="http://standards.iso.org/iso/19115/-3/mdb/1.0" xmlns:mri="http://standards.iso.org/iso/19115/-3/mri/1.0" xmlns:mco="http://standards.iso.org/iso/19115/-3/mco/1.0" xmlns:gco="http://standards.iso.org/iso/19115/-3/gco/1.0">
  <mdb:identificationInfo><mri:MD_DataIdentification><mri:resourceConstraints><mco:MD_LegalConstraints>
    <mco:otherConstraints><gco:CharacterString>CC BY 4.0 https://creativecommons.org/licenses/by/4.0/</gco:CharacterString></mco:otherConstraints>
    <mco:otherConstraints><gco:CharacterString>Available to project members only</gco:CharacterString></mco:otherConstraints>
  </mco:MD_LegalConstraints></mri:resourceConstraints></mri:MD_DataIdentification></mdb:identificationInfo>
</mdb:MD_Metadata>`;
    const rec = parseIso19115_3(xml, 'iso3');
    const f = checkLicence([rec], { label: 'iso3', inaccessible: false }).filter((x) => x.ruleId === RULE);
    expect(f).toHaveLength(1);
    expect(f[0].params.text).toBe('Available to project members only');
  });
});

describe('L1: wordings that narrow the licence', () => {
  it.each([
    // access limited to a group
    'Access restricted to project partners',
    'Restricted access',
    'Access is limited to members of the consortium',
    'For internal use only',
    'Available to registered users only',
    'Data are confidential',
    'Not publicly available',
    'Not openly accessible',
    'Under embargo until 2030-01-01',
    'Closed access',
    // non-commercial
    'Not to be used for commercial purposes',
    'Non-commercial use only',
    'Noncommercial reuse',
    'No commercial use',
    'For research purposes only',
    'Academic use only',
    'Commercial use requires permission',
    'Commercial use is prohibited',
    // no derivatives / no redistribution
    'No derivatives',
    'No derivative works',
    'May not be modified',
    'Data must not be altered',
    'Do not redistribute',
    'Redistribution is not permitted',
    'Not for redistribution',
    // on request
    'Data available on request',
    'Dataset available upon request from the PI',
    'Access to the files by request only',
    // contact before use
    'Please contact the data owner before using the data',
    'Contact the PI prior to use',
    'Prior written permission is required',
    'Permission must be obtained from the author',
    'Requires the permission of the institute',
    'Ask for permission before reuse',
    'Not to be reproduced without permission of the owner',
    // other languages
    'Nur für nicht-kommerzielle Nutzung',
    'Zugang nur für Projektpartner',
    'Zugriff beschränkt auf Projektmitglieder',
    'Daten auf Anfrage erhältlich',
    'Utilisation non commerciale uniquement',
    'Accès réservé aux partenaires du projet',
    'Données disponibles sur demande',
    'Tylko do użytku niekomercyjnego',
    'Dostęp ograniczony do partnerów projektu',
    'Dane dostępne na życzenie',
    'Dane dostępne na prośbę',
  ])('"%s" next to CC BY 4.0 warns', (text) => {
    for (const tag of ['otherConstraints', 'useLimitation'] as const) {
      const rec = iso([licenceConstraint(), { tag, text }]);
      expect(lic(rec), `${tag}: ${text}`).toEqual([RULE]);
    }
  });
});

describe('L1: wordings that do NOT narrow the licence', () => {
  it.each([
    // attribution and citation
    'Please cite as: Example, K. (2026). Invented survey. https://doi.org/10.0000/invented.1',
    'Cite as Example, K. (2026)',
    'Please cite the dataset when using the data',
    'Attribution required',
    'Attribution is required: Institute of Examples',
    'Please acknowledge the data provider in publications',
    'You must give appropriate credit to the Institute of Examples',
    'Credit: Institute of Examples',
    'Citation: Example, K. (2026). Invented survey, Institute of Examples, doi:10.0000/invented.1',
    'Users are asked to acknowledge the Institute of Examples and to send a copy of publications',
    '© 2026 Institute of Examples',
    'Copyright Institute of Examples',
    // disclaimers
    'Provided as is',
    'The data are provided "as is" without warranty of any kind',
    'No warranty is given',
    'Provided without warranty; the authors accept no liability for any use',
    'The Institute accepts no responsibility for errors in the data',
    'Use at your own risk',
    // the licence repeated
    'Creative Commons Attribution 4.0 International',
    'Creative Commons Attribution 4.0 International (CC BY 4.0)',
    'Licensed under CC BY 4.0',
    'This work is licensed under a Creative Commons Attribution 4.0 International License.',
    'CC BY 4.0',
    'Open licence',
    'Use under the licence stated above',
    'Use constraints: see licence',
    'Terms of use: see the licence',
    // permissive and neutral
    'Commercial use permitted',
    'Commercial use is allowed',
    'Free for commercial and non-commercial use',
    'No restrictions on use',
    'No restrictions apply',
    'Use is not restricted',
    'Unrestricted access',
    'Open access',
    'Publicly available',
    'No limitations',
    'None',
    'Permission is not required',
    'No permission is required',
    'The data may be used without permission',
    'Can be used without prior permission',
    'Redistribution is permitted',
    'Derivative works are allowed',
    'May be modified and redistributed',
    // contact / information
    'Contact: data@example.org',
    'Please contact us if you have questions',
    'For questions contact the data manager',
    'Further information is available on request',
    'Metadata available on request',
    'More details on the instrument are available upon request',
    'Data collected under a research programme of the Institute',
    'The study was financed by a research grant',
    // other languages
    'Bitte zitieren Sie den Datensatz',
    'Keine Einschränkungen',
    'Veuillez citer le jeu de données',
    'Aucune restriction',
    'Proszę cytować zbiór danych',
    'Bez ograniczeń',
  ])('"%s" next to CC BY 4.0 is silent', (text) => {
    for (const tag of ['otherConstraints', 'useLimitation'] as const) {
      const rec = iso([licenceConstraint(), { tag, text }]);
      expect(lic(rec).filter((id) => id === RULE), `${tag}: ${text}`).toEqual([]);
    }
  });
});

describe('L1: no duplicate, no change where there is nothing to say', () => {
  it('a restriction inside the licence string is reported by the existing rule only', () => {
    const rec = iso([{ tag: 'otherConstraints', text: 'CC BY 4.0, restricted to project partners', link: BY }, licenceConstraint()]);
    const ids = lic(rec);
    expect(ids).not.toContain(RULE);
    expect(ids).toContain('LIC-ADDED-CONDITIONS');
  });

  it('a restriction string that is itself read as a conflict is left to its own rule', () => {
    const rec = iso([licenceConstraint(), { tag: 'otherConstraints', text: 'CC BY 4.0 for project partners only' }]);
    expect(lic(rec)).not.toContain(RULE);
  });

  it('a record with a restriction and no recognised licence gets no new finding', () => {
    const rec = iso([{ tag: 'otherConstraints', text: 'Access restricted to project partners' }]);
    expect(lic(rec)).not.toContain(RULE);
  });

  it('a clean record is unchanged', () => {
    expect(lic(iso([licenceConstraint()]))).toEqual([]);
    expect(lic(iso([licenceConstraint(), { tag: 'useLimitation', text: 'Please cite the dataset' }]))).toEqual([]);
  });

  it('a restriction of the METADATA (metadataConstraints) is not a restriction of the data', () => {
    const rec = iso([licenceConstraint()], { metadataLevel: [{ tag: 'useLimitation', text: 'Access restricted to project partners' }] });
    expect(lic(rec)).toEqual([]);
  });

  it('a restriction code is still the business of LIC-RESTRICTION-CONFLICT alone', () => {
    const rec = iso([licenceConstraint()], { codes: ['restricted'] });
    expect(lic(rec)).toEqual(['LIC-RESTRICTION-CONFLICT']);
  });

  it('a DataCite rights entry that is no licence is still LIC-OTHER-RIGHTS-ENTRY alone', () => {
    const rec = parseDataciteJson(
      { data: { attributes: { doi: '10.0000/invented.2', rightsList: [{ rights: BY_NAME, rightsUri: BY, rightsIdentifier: 'cc-by-4.0' }, { rights: 'Access restricted to project partners' }] } } },
      'dc',
    );
    const ids = checkLicence([rec], { label: 'dc', inaccessible: false }).map((f) => f.ruleId);
    expect(ids).toContain('LIC-OTHER-RIGHTS-ENTRY');
    expect(ids).not.toContain(RULE);
  });

  it('is part of the analysis: a contradiction of kind separate-restriction', () => {
    const a = analyseLicences([withBy({ tag: 'otherConstraints', text: 'Data access restricted to project partners' })]);
    expect(a.contradictions.map((c) => c.kind)).toEqual(['separate-restriction']);
  });
});

describe('L1: the restriction is compared with what the licence already says', () => {
  it('non-commercial text next to a NonCommercial licence only repeats it', () => {
    const rec = iso([licenceConstraint(NC_NAME, NC), { tag: 'useLimitation', text: 'Non-commercial use only' }]);
    expect(lic(rec)).toEqual([]);
  });
  it('no-derivatives text next to a NoDerivatives licence only repeats it', () => {
    const rec = iso([licenceConstraint(ND_NAME, ND), { tag: 'useLimitation', text: 'No derivative works' }]);
    expect(lic(rec)).toEqual([]);
  });
  it('access limited to partners narrows even a NonCommercial licence', () => {
    const rec = iso([licenceConstraint(NC_NAME, NC), { tag: 'useLimitation', text: 'Access limited to project partners' }]);
    expect(lic(rec)).toEqual([RULE]);
  });
  it('non-commercial text narrows a NoDerivatives licence', () => {
    const rec = iso([licenceConstraint(ND_NAME, ND), { tag: 'useLimitation', text: 'Non-commercial use only' }]);
    expect(lic(rec)).toEqual([RULE]);
  });
});

describe('L1: texts', () => {
  it('the plain text exists in en, pl, de and fr and quotes the restriction and both fields', () => {
    const f = run(withBy({ tag: 'otherConstraints', text: 'Data access restricted to project partners' })).find((x) => x.ruleId === RULE)!;
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      const plain = renderPlain(f, lang);
      expect(plain, lang).toContain('Data access restricted to project partners');
      expect(plain, lang).toContain('otherConstraints');
      expect(plain, lang).not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });
});

// Fix round after review of T1: false warnings on text that restricts nothing, missed restrictions, one warning per fact.
describe('L1 fix: sentences that restrict nothing stay silent (negation, scale or area limits, attribution conditions)', () => {
  it.each([
    // negated access words
    'No embargo',
    'Embargo period: none',
    'Embargo: n/a',
    'The embargo ended in 2019',
    'The embargo has been lifted',
    'The data contain no confidential information',
    'Data are not confidential',
    'Not confidential',
    // limits of the data, not of the rights
    'Use limited to scales of 1:50 000 or smaller',
    'Data are restricted to depths above 200 m',
    'The dataset is limited to the Baltic Sea',
    'Data are open to all users, not only project members',
    'Open to everyone, not just project partners',
    // attribution conditions, in any language
    'Users must not redistribute the data without acknowledging the source',
    'Data must not be altered without indicating the changes',
    'Data may be used if the source is cited',
    'Available to all users with attribution',
    'Nutzung nur mit Quellenangabe',
    'Nutzung nur unter Angabe der Quelle',
    'Weitergabe nicht ohne Quellenangabe',
    'Accès libre sous réserve de citer la source',
    'Utilisation uniquement avec mention de la source',
    'Dostęp tylko z podaniem źródła',
    'Wykorzystanie danych tylko z podaniem źródła',
    'Redystrybucja bez podania źródła jest zabroniona',
    // negated access words in de / fr / pl
    'Der Zugang ist nicht beschränkt',
    'Zugang ohne Beschränkung',
    'Accès non restreint',
    "L'accès n'est pas restreint",
    'Dostęp nieograniczony',
    'Dostęp nie jest ograniczony',
    // registration and agreements that are NOT required
    'No registration required',
    'Registration is not required',
    'No data use agreement is needed',
    // data of another period, not this dataset
    'Data are available on request from the PI for the period before 2010',
    // commercial use is free, nothing to contact about
    'For commercial use no contact is needed',
    'Commercial use is permitted, contact us if you have questions',
  ])('"%s" next to CC BY 4.0 is silent', (text) => {
    for (const tag of ['otherConstraints', 'useLimitation'] as const) {
      const rec = iso([licenceConstraint(), { tag, text }]);
      expect(lic(rec).filter((id) => id === RULE), `${tag}: ${text}`).toEqual([]);
    }
  });
});

describe('L1 fix: restrictions the first matcher missed are found', () => {
  it.each([
    'Restricted to project members',
    'Restricted to registered users',
    'Use restricted to the project team',
    'Data cannot be used without permission of the owner',
    'Only for scientific use',
    'Only for research purposes',
    'May only be used for research',
    'May only be used for educational purposes',
    'For commercial use contact data@example.org',
    'For commercial use please contact the data owner',
    'Commercial use: please contact the data owner',
    'Access requires registration',
    'Registration is required to download the data',
    'Users must register before downloading',
    'Users must sign a data use agreement',
    'A data use agreement must be signed',
    'Public access limited according to Article 13(1)(e) of the INSPIRE Directive',
    'Limitations on public access: Art. 13(1)(a) of the INSPIRE Directive',
    'Kommerzielle Nutzung untersagt',
    'Die kommerzielle Nutzung ist nicht gestattet',
    'Nur für wissenschaftliche Zwecke',
    'Usage commercial interdit',
    'Utilisation commerciale interdite',
    'Réservé à la recherche scientifique',
    'Wykorzystanie komercyjne zabronione',
    'Zakaz wykorzystania komercyjnego',
    'Dane udostępnione wyłącznie do celów naukowych',
    'Dane tylko do celów badawczych',
  ])('"%s" next to CC BY 4.0 warns', (text) => {
    for (const tag of ['otherConstraints', 'useLimitation'] as const) {
      const rec = iso([licenceConstraint(), { tag, text }]);
      expect(lic(rec), `${tag}: ${text}`).toEqual([RULE]);
    }
  });
});

describe('L1 fix: one warning per fact', () => {
  it('the same sentence in useLimitation and otherConstraints is one warning that names both fields', () => {
    const t = 'Access limited to consortium members';
    const rec = iso([licenceConstraint(), { tag: 'useLimitation', text: t }, { tag: 'otherConstraints', text: t.toLowerCase() + '.' }]);
    const f = run(rec).filter((x) => x.ruleId === RULE);
    expect(f).toHaveLength(1);
    expect(f[0].field).toContain('useLimitation');
    expect(f[0].field).toContain('otherConstraints');
    expect(renderPlain(f[0], 'en')).toContain('useLimitation, otherConstraints');
  });

  it('an access restriction next to a restriction code that already conflicts is reported once, by the code rule', () => {
    const rec = iso([licenceConstraint(), { tag: 'otherConstraints', text: 'Access restricted to project partners' }], { codes: ['restricted'] });
    expect(lic(rec)).toEqual(['LIC-RESTRICTION-CONFLICT']);
  });

  it('a different fact next to the same code (non-commercial) is still reported', () => {
    const rec = iso([licenceConstraint(), { tag: 'otherConstraints', text: 'Non-commercial use only' }], { codes: ['restricted'] });
    expect(lic(rec).sort()).toEqual(['LIC-RESTRICTION-CONFLICT', RULE]);
  });
});

describe('L1 fix: the text says "the licence", never "open licence"', () => {
  it('en, pl, de and fr do not call the licence open and keep the restriction and the fields', () => {
    const f = run(withBy({ tag: 'otherConstraints', text: 'Data access restricted to project partners' })).find((x) => x.ruleId === RULE)!;
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      const plain = renderPlain(f, lang);
      expect(plain, lang).not.toMatch(/open licen|licencja otwarta|offene lizenz|licence ouverte/i);
      expect(plain, lang).not.toMatch(/exclude|wykluczaj|schlie(?:ß|ss)en sich aus|s'excluent/i);
    }
  });
  it('a NonCommercial licence with an access restriction is not called open either', () => {
    const f = run(iso([licenceConstraint(NC_NAME, NC), { tag: 'useLimitation', text: 'Access limited to project partners' }])).find((x) => x.ruleId === RULE)!;
    expect(renderPlain(f, 'en')).not.toMatch(/open/i);
  });
});
