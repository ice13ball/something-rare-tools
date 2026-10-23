// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Review of licence-exact-names: (1) a string that names no licence cannot sit next to an exact identifier, with or without a link, in both
// directions; (2) a Zenodo title without the version of its id is no exact name; (3) a restriction in words next to a recognised licence
// (LIC-RESTRICTION-TEXT); (4) the leftover of another string is translated, not labelled in English.
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import { analyseLicences } from '../../src/core/licence/analyse';
import { parseDataciteJson } from '../../src/core/metadata/datacite';
import { classifyStatement, exactLicenceName, versionless } from '../../src/core/metadata/licence';
import { parseZenodoRecord } from '../../src/core/metadata/zenodo';
import { ZENODO_LICENCES } from '../../src/core/metadata/zenodo-licences';
import { renderPlain } from '../../src/core/report';
import type { Finding, Lang } from '../../src/core/types';

type Rights = { rights?: string; rightsUri?: string; rightsIdentifier?: string; rightsIdentifierScheme?: string };
const dc = (...rights: Rights[]) => parseDataciteJson({ data: { attributes: { doi: '10.5281/zenodo.1', rightsList: rights } } }, 'dc');
const lic = (f: Finding[]) => f.filter((x) => x.ruleId.startsWith('LIC-'));
const rulesOf = (rec: ReturnType<typeof dc>) => lic(checkLicence([rec], { label: 'x', inaccessible: false })).map((f) => f.ruleId);
const rules = (...rights: Rights[]) => rulesOf(dc(...rights));
const LANGS: Lang[] = ['en', 'pl', 'de', 'fr'];

const UNNAMED = ['All rights reserved', 'Restricted access', 'In Copyright', 'Embargoed until 2027', 'Please contact the PI before use', 'Free for scientific use', 'Copyright 2024 ACME Corp.'];
const IDS = ['cc-by-4.0', 'mit'];
const CCBY = 'https://creativecommons.org/licenses/by/4.0/legalcode';

describe('HIGH: a text that names no licence cannot vouch for an identifier', () => {
  const combos = UNNAMED.flatMap((t) => IDS.map((id) => [t, id] as const));
  it.each(combos)('"%s" + identifier %s (no link): ambiguous, not classified, not machine-readable', (t, id) => {
    const rec = dc({ rights: t, rightsIdentifier: id, rightsIdentifierScheme: 'SPDX' });
    expect(classifyStatement(rec.licences[0])).toEqual({ kind: 'unrecognised' });
    expect(rulesOf(rec)).toContain('LIC-AMBIGUOUS');
    expect(analyseLicences([rec]).sources[0].statements[0].machineReadable).toBe(false);
  });
  it.each(combos)('"%s" + identifier %s + the licence link: a conflict, not clean', (t, id) => {
    const r = rules({ rights: t, rightsIdentifier: id, rightsUri: id === 'mit' ? 'https://opensource.org/licenses/MIT' : CCBY });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x === 'LIC-TEXT-URI-CONFLICT')).toBe(true);
  });
  it.each(combos)('"%s" + identifier %s + a link that names no licence: a conflict', (t, id) => {
    expect(rules({ rights: t, rightsIdentifier: id, rightsUri: 'http://rightsstatements.org/vocab/InC/1.0/' })).toContain('LIC-TEXT-URI-CONFLICT');
  });
  it.each(combos)('roles swapped: rights "%s"... identifier is the notice, rights text is the id %s', (t, id) => {
    expect(rules({ rights: id, rightsIdentifier: t })).toContain('LIC-AMBIGUOUS');
  });
  it.each(combos)('Zenodo record: id %s next to title "%s"', (t, id) => {
    const rec = parseZenodoRecord({ id: 1, metadata: { title: 'x', license: { id, title: { en: t } } } }, 'z');
    expect(classifyStatement(rec.licences[0])).toEqual({ kind: 'unrecognised' });
    expect(rulesOf(rec)).toContain('LIC-AMBIGUOUS');
  });
  it('Zenodo record: id cc-by-4.0 + title "All rights reserved"', () => {
    const rec = parseZenodoRecord({ id: 1, metadata: { title: 'x', license: { id: 'cc-by-4.0', title: { en: 'All rights reserved' } } } }, 'z');
    expect(rulesOf(rec)).toEqual(['LIC-AMBIGUOUS']);
  });
  it('"Open Access" next to an exact id stays clean (neutral wording)', () => {
    expect(rules({ rights: 'Open Access', rightsIdentifier: 'cc-by-4.0', rightsUri: CCBY })).toEqual([]);
    expect(rules({ rights: 'Open Access', rightsIdentifier: 'cc-by-4.0' }).includes('LIC-AMBIGUOUS')).toBe(false);
  });
  it('"Public Domain" next to the exact id cc0-1.0 stays clean (neutral next to CC0)', () => {
    expect(rules({ rights: 'Public Domain', rightsIdentifier: 'cc0-1.0' })).toEqual([]);
    expect(rules({ rights: 'Public Domain', rightsIdentifier: 'cc-by-4.0' })).toContain('LIC-AMBIGUOUS');
  });
  it('the Zenodo form of all table rows stays clean', () => {
    for (const z of ZENODO_LICENCES) {
      expect(rules({ rights: z.title, rightsUri: z.url, rightsIdentifier: z.id.toLowerCase(), rightsIdentifierScheme: 'SPDX' }), z.id).toEqual([]);
      const rec = parseZenodoRecord({ id: 1, metadata: { title: 'x', license: { id: z.id.toLowerCase(), title: { en: z.title }, link: z.url } } }, 'z');
      expect(rulesOf(rec), z.id).toEqual([]);
    }
  });
});

describe('MEDIUM: a Zenodo title without its version is no exact name', () => {
  it('no versionless title maps to a versioned id', () => {
    const lacking = ZENODO_LICENCES.filter(versionless);
    expect(lacking.map((z) => z.id)).toContain('NLOD-1.0');
    for (const z of lacking) expect(exactLicenceName(z.title), z.id).toBeUndefined();
    for (const z of ZENODO_LICENCES.filter((x) => !versionless(x))) expect(exactLicenceName(z.title), z.id).toBe(z.id);
  });
  it('"Norwegian Licence for Open Government Data" + nlod-2.0 is no false conflict; with nlod-1.0 + its link it is clean', () => {
    expect(rules({ rights: 'Norwegian Licence for Open Government Data', rightsIdentifier: 'nlod-2.0', rightsUri: 'https://data.norge.no/nlod/en/2.0' })).toEqual([]);
    expect(classifyStatement(dc({ rights: 'Norwegian Licence for Open Government Data' }).licences[0])).toEqual({ kind: 'unrecognised' });
    expect(rules({ rights: 'Norwegian Licence for Open Government Data', rightsIdentifier: 'nlod-2.0' })).not.toContain('LIC-AMBIGUOUS');
  });
});

describe('LOW: leftover of another string, translated', () => {
  const f = lic(checkLicence([dc({ rights: 'CC BY 4.0, see the README', rightsIdentifier: 'cc-by-4.0 licence file' })], { label: 'x', inaccessible: false })).find((x) => x.ruleId === 'LIC-EXTRA-TEXT')!;
  it.each(LANGS)('%s: the clause is in the language, with no English label', (lang) => {
    const t = renderPlain(f, lang);
    expect(t).toContain('file');
    expect(t).not.toMatch(/identifier:|title:/);
    if (lang !== 'en') expect(t).not.toMatch(/Another string|also leaves/);
  });
  it('Zenodo: {text} is the title when the quote comes from the title', () => {
    const rec = parseZenodoRecord({ id: 1, metadata: { title: 'x', license: { id: 'cc-by-4.0', title: { en: 'Creative Commons Attribution 4.0 International, see the README' } } } }, 'z');
    const g = lic(checkLicence([rec], { label: 'x', inaccessible: false })).find((x) => x.ruleId === 'LIC-EXTRA-TEXT')!;
    expect(g.params).toEqual({ text: 'Creative Commons Attribution 4.0 International, see the README', rest: 'see the README' });
  });
});
