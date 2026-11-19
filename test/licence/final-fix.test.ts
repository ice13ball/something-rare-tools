// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Final review of the /licence round: F1 (OBIS line only for machine-readable licences), F2 (All rights reserved in a separate field). Invented records only.
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import { analyseLicences } from '../../src/core/licence/analyse';
import { obisLicenceFinding } from '../../src/core/licence/obis';
import { parseIso19139 } from '../../src/core/metadata/iso19139';
import { licenceCaseOf } from '../../src/core/convert/prefill';

const BY = 'https://creativecommons.org/licenses/by/4.0/';
const BY_NAME = 'Creative Commons Attribution 4.0 International';
function iso(constraints: { tag: string; text: string; link?: string }[]) {
  const one = (c: { tag: string; text: string; link?: string }) =>
    `<md:${c.tag}>${c.link ? `<x:Anchor l:href="${c.link}">${c.text}</x:Anchor>` : `<c:CharacterString>${c.text}</c:CharacterString>`}</md:${c.tag}>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<md:MD_Metadata xmlns:md="http://www.isotc211.org/2005/gmd" xmlns:c="http://www.isotc211.org/2005/gco" xmlns:x="http://www.isotc211.org/2005/gmx" xmlns:l="http://www.w3.org/1999/xlink">
  <md:identificationInfo><md:MD_DataIdentification>
    <md:citation><md:CI_Citation><md:title><c:CharacterString>Invented survey</c:CharacterString></md:title><md:edition><c:CharacterString>1</c:CharacterString></md:edition></md:CI_Citation></md:citation>
    <md:resourceConstraints><md:MD_LegalConstraints>${constraints.map(one).join('')}</md:MD_LegalConstraints></md:resourceConstraints>
  </md:MD_DataIdentification></md:identificationInfo>
</md:MD_Metadata>`;
  return parseIso19139(xml, 'iso-rec');
}
const ids = (r: ReturnType<typeof iso>) => checkLicence([r], { label: 'iso-rec', inaccessible: false }).map((f) => f.ruleId);

describe('F1: no OBIS line for a licence stated only as free text', () => {
  it.each(['CC BY-NC-ND 4.0', 'CC BY 4.0'])('otherConstraints "%s" without a link: LIC-FREE-TEXT, no OBIS line', (text) => {
    const r = iso([{ tag: 'otherConstraints', text }]);
    expect(ids(r)).toContain('LIC-FREE-TEXT');
    expect(obisLicenceFinding(analyseLicences([r]), 'x')).toBeUndefined();
  });
  it('a linked licence still gets the line', () => {
    const r = iso([{ tag: 'otherConstraints', text: BY_NAME, link: BY }]);
    expect(obisLicenceFinding(analyseLicences([r]), 'x')?.params.kind).toBe('accepted');
  });
});

describe('F2: All rights reserved in a separate field next to an open licence', () => {
  it.each([
    'All rights reserved',
    '© 2024 Invented Institute. All rights reserved.',
    'Alle Rechte vorbehalten',
    'Tous droits réservés',
    'Wszelkie prawa zastrzeżone',
  ])('useLimitation "%s" next to linked CC BY 4.0 fires LIC-SEPARATE-RESTRICTION and the OBIS line goes', (text) => {
    const r = iso([{ tag: 'otherConstraints', text: BY_NAME, link: BY }, { tag: 'useLimitation', text }]);
    expect(ids(r)).toContain('LIC-SEPARATE-RESTRICTION');
    const a = analyseLicences([r]);
    expect(obisLicenceFinding(a, 'x')).toBeUndefined();
    expect(licenceCaseOf([r]).kind).toBe('contradictory');
  });
  it('a non-restricting second entry stays silent', () => {
    const r = iso([{ tag: 'otherConstraints', text: BY_NAME, link: BY }, { tag: 'useLimitation', text: 'Please cite the data' }]);
    expect(ids(r)).not.toContain('LIC-SEPARATE-RESTRICTION');
  });
});
