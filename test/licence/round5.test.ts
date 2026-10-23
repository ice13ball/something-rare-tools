// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Round 5 of the review: a middle name is one word, not a clause; only a real ORCID iD or a plain handle in brackets is dropped; an
// InC-only entry is neutral; "e" / "y" split names only as lowercase words between two names.
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import { parseDataciteJson } from '../../src/core/metadata/datacite';

type Rights = { rights?: string; rightsUri?: string; rightsIdentifier?: string };
const INC = 'http://rightsstatements.org/vocab/InC/1.0/';
const CCBY = 'https://creativecommons.org/licenses/by/4.0/legalcode';
const by: Rights = { rights: 'Creative Commons Attribution 4.0 International', rightsUri: CCBY, rightsIdentifier: 'cc-by-4.0' };
const dc = (creators: string[], ...rights: Rights[]) =>
  parseDataciteJson({ data: { attributes: { doi: '10.5281/zenodo.1', creators: creators.map((name) => ({ name })), publisher: 'Zenodo', rightsList: rights } } }, 'dc');
const ids = (rec: ReturnType<typeof dc>) => checkLicence([rec], { label: 'x', inaccessible: false }).filter((f) => f.ruleId.startsWith('LIC-')).map((f) => f.ruleId);
const WARN = ['LIC-OTHER-RIGHTS-ENTRY'];
const PEOPLE = ['Baird, Kevin', 'Berg, Jan', 'Krašovec, Nina', 'Smith, Nora Claire'];
const both = (t: string): Rights[] => [{ rights: t, rightsUri: INC }, { rights: t }];

describe('MEDIUM 1: a middle name is one word, not a clause', () => {
  it.each([
    '© 2020 Jan Berg. Reuse only with permission of Jan Berg.', 'Jan Berg; restricted to Jan Berg', 'Kevin restricted Baird', 'Kevin (internal use only) Baird',
    'Kevin Not For Redistribution Baird', 'Kevin Restricted Baird', 'Jan Restricted Berg', 'Kevin Thorsen Baird', '© 2026 Kevin Thorsen Baird', 'Jan Berg. Internal', 'Jan reuse only with permission of Jan Berg', 'Nina (restricted) Krašovec', 'Kevin Baird (see licence file)',
  ])('"%s" warns', (t) => {
    for (const e of both(t)) expect(ids(dc(PEOPLE, by, e)), JSON.stringify(e)).toEqual(WARN);
  });
  it.each(['Kevin T. Baird', 'Kevin T. J. Baird', 'Prof. Nina Krašovec', 'Nora Claire Smith', 'Jan Berg.', 'Berg, Jan.'])(
    '"%s" is still a creator: clean',
    (t) => {
      for (const e of both(t)) expect(ids(dc(PEOPLE, by, e)), JSON.stringify(e)).toEqual([]);
    },
  );
});

describe('MEDIUM 2: only a real ORCID iD or a plain handle in brackets is dropped', () => {
  it.each([
    'Jan Berg (ORCID: restricted)', 'Jan Berg (ORCID 0000-0002-1825-0097; no commercial use)', 'Jan Berg (not for redistribution, see orcid profile)', 'Jan Berg (NC-4.0)',
    'Jan Berg (janberg99)', 'Jan Berg (nonCommercial2024)', 'Copyright (c) 2026 Qirui Cui (cuiqirui99)', 'Jan Berg (hdl)', 'Jan Berg (BY-NC-4.0)', 'Jan Berg (embargo-until-2030)', 'Jan Berg (orcid)', 'Jan Berg (0000-0002-1825-009)', 'Jan Berg (ORCID: 0000-0002-1825-0097 restricted)',
  ])('"%s" warns', (t) => {
    for (const e of both(t)) expect(ids(dc(PEOPLE, by, e)), JSON.stringify(e)).toEqual(WARN);
  });
  it.each([
    'Jan Berg (ORCID: 0000-0002-1825-0097)', 'Jan Berg (ORCID iD: 0000-0002-1825-009X)', 'Jan Berg (0000-0002-1825-0097)', 'Jan Berg (https://orcid.org/0000-0002-1825-0097)',
    'Jan Berg (2024)', 'Copyright (c) 2026 Nina Krašovec (2026)',
  ])('"%s": clean', (t) => {
    for (const e of both(t)) expect(ids(dc(PEOPLE, by, e)), JSON.stringify(e)).toEqual([]);
  });
});

describe('LOW: InC-only entry; "e" / "y"; anchored link', () => {
  it('an InC-only entry (the link and/or the identifier InC, no text) is neutral', () => {
    for (const e of [{ rightsUri: INC }, { rightsUri: INC, rightsIdentifier: 'InC' }, { rightsIdentifier: 'InC' }, { rights: 'InC' }]) expect(ids(dc(PEOPLE, by, e)), JSON.stringify(e)).toEqual([]);
  });
  it('an InC-only entry with another identifier, or a different link, still warns', () => {
    for (const e of [{ rightsUri: INC, rightsIdentifier: 'InC-NC' }, { rightsUri: `${INC}x` }, { rightsUri: 'https://evil.example/rightsstatements.org/vocab/InC/1.0/' }]) {
      expect(ids(dc(PEOPLE, by, e)), JSON.stringify(e)).toEqual(WARN);
    }
  });
  it('"e" / "y" split names only as lowercase words between two names; initials E. / Y. stay initials', () => {
    const ppl = ['Baird, Kevin', 'Berg, Jan', 'Costa, Ana', 'Young, Yves', 'Ernst, Eva'];
    for (const t of ['Ana Costa e Jan Berg', 'Kevin Baird y Jan Berg', 'Berg, J. E.', 'Young, Y.', 'Ernst, E.', 'Costa A. E.']) {
      for (const e of both(t)) expect(ids(dc(ppl, by, e)), JSON.stringify(e)).toEqual([]);
    }
    for (const t of ['Ana Costa e Internal', 'Kevin Baird y restricted']) expect(ids(dc(ppl, by, { rights: t })), t).toEqual(WARN);
  });
});

describe('fail-closed round: no unknown middle word, no bracketed handle, access-value identifier', () => {
  it('Kevin Thorsen Baird is clean only when the creator is recorded with that middle name', () => {
    for (const t of ['Kevin Thorsen Baird', '© 2026 Kevin Thorsen Baird', 'Baird, Kevin Thorsen', 'Kevin Baird']) {
      expect(ids(dc(['Baird, Kevin Thorsen'], by, ...both(t))), t).toEqual([]);
    }
    expect(ids(dc(['Baird, Kevin'], by, { rights: 'Kevin Thorsen Baird' }))).toEqual(WARN);
    expect(ids(dc(['Baird, Kevin Thorsen'], by, { rights: 'Kevin Restricted Baird' }))).toEqual(WARN);
  });
  it('an entry whose only content is an access value as identifier is neutral', () => {
    for (const e of [{ rightsIdentifier: 'info:eu-repo/semantics/openAccess' }, { rightsIdentifier: 'open access' }, { rightsIdentifier: 'Open Access' }]) {
      expect(ids(dc(PEOPLE, by, e)), JSON.stringify(e)).toEqual([]);
    }
    for (const e of [{ rightsIdentifier: 'info:eu-repo/semantics/closedAccess' }, { rightsIdentifier: 'open access; inc' }]) expect(ids(dc(PEOPLE, by, e)), JSON.stringify(e)).toEqual(WARN);
  });
});
