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
  parseDataciteJson({ data: { attributes: { doi: '10.5281/zenodo.999999911', creators: creators.map((name) => ({ name })), publisher: 'Zenodo', rightsList: rights } } }, 'dc');
const ids = (rec: ReturnType<typeof dc>) => checkLicence([rec], { label: 'x', inaccessible: false }).filter((f) => f.ruleId.startsWith('LIC-')).map((f) => f.ruleId);
const WARN = ['LIC-OTHER-RIGHTS-ENTRY'];
const PEOPLE = ['Example, Kevin', 'Voorbeeld, Jan', 'Příkladová, Žaneta', 'Smith, Nora Claire'];
const both = (t: string): Rights[] => [{ rights: t, rightsUri: INC }, { rights: t }];

describe('MEDIUM 1: a middle name is one word, not a clause', () => {
  it.each([
    '© 2020 Jan Voorbeeld. Reuse only with permission of Jan Voorbeeld.', 'Jan Voorbeeld; restricted to Jan Voorbeeld', 'Kevin restricted Example', 'Kevin (internal use only) Example',
    'Kevin Not For Redistribution Example', 'Kevin Restricted Example', 'Jan Restricted Voorbeeld', 'Kevin Thorsen Example', '© 2026 Kevin Thorsen Example', 'Jan Voorbeeld. Internal', 'Jan reuse only with permission of Jan Voorbeeld', 'Žaneta (restricted) Příkladová', 'Kevin Example (see licence file)',
  ])('"%s" warns', (t) => {
    for (const e of both(t)) expect(ids(dc(PEOPLE, by, e)), JSON.stringify(e)).toEqual(WARN);
  });
  it.each(['Kevin T. Example', 'Kevin T. J. Example', 'Prof. Žaneta Příkladová', 'Nora Claire Smith', 'Jan Voorbeeld.', 'Voorbeeld, Jan.'])(
    '"%s" is still a creator: clean',
    (t) => {
      for (const e of both(t)) expect(ids(dc(PEOPLE, by, e)), JSON.stringify(e)).toEqual([]);
    },
  );
});

describe('MEDIUM 2: only a real ORCID iD or a plain handle in brackets is dropped', () => {
  it.each([
    'Jan Voorbeeld (ORCID: restricted)', 'Jan Voorbeeld (ORCID 0000-0002-1825-0097; no commercial use)', 'Jan Voorbeeld (not for redistribution, see orcid profile)', 'Jan Voorbeeld (NC-4.0)',
    'Jan Voorbeeld (janvoorbeeld99)', 'Jan Voorbeeld (nonCommercial2024)', 'Copyright (c) 2026 Quirin Probe (probequirin99)', 'Jan Voorbeeld (hdl)', 'Jan Voorbeeld (BY-NC-4.0)', 'Jan Voorbeeld (embargo-until-2030)', 'Jan Voorbeeld (orcid)', 'Jan Voorbeeld (0000-0002-1825-009)', 'Jan Voorbeeld (ORCID: 0000-0002-1825-0097 restricted)',
  ])('"%s" warns', (t) => {
    for (const e of both(t)) expect(ids(dc(PEOPLE, by, e)), JSON.stringify(e)).toEqual(WARN);
  });
  it.each([
    'Jan Voorbeeld (ORCID: 0000-0002-1825-0097)', 'Jan Voorbeeld (ORCID iD: 0000-0002-1825-009X)', 'Jan Voorbeeld (0000-0002-1825-0097)', 'Jan Voorbeeld (https://orcid.org/0000-0002-1825-0097)',
    'Jan Voorbeeld (2024)', 'Copyright (c) 2026 Žaneta Příkladová (2026)',
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
    const ppl = ['Example, Kevin', 'Voorbeeld, Jan', 'Exemplo, Ana', 'Young, Yves', 'Ernst, Eva'];
    for (const t of ['Ana Exemplo e Jan Voorbeeld', 'Kevin Example y Jan Voorbeeld', 'Voorbeeld, J. E.', 'Young, Y.', 'Ernst, E.', 'Exemplo A. E.']) {
      for (const e of both(t)) expect(ids(dc(ppl, by, e)), JSON.stringify(e)).toEqual([]);
    }
    for (const t of ['Ana Exemplo e Internal', 'Kevin Example y restricted']) expect(ids(dc(ppl, by, { rights: t })), t).toEqual(WARN);
  });
});

describe('fail-closed round: no unknown middle word, no bracketed handle, access-value identifier', () => {
  it('Kevin Thorsen Example is clean only when the creator is recorded with that middle name', () => {
    for (const t of ['Kevin Thorsen Example', '© 2026 Kevin Thorsen Example', 'Example, Kevin Thorsen', 'Kevin Example']) {
      expect(ids(dc(['Example, Kevin Thorsen'], by, ...both(t))), t).toEqual([]);
    }
    expect(ids(dc(['Example, Kevin'], by, { rights: 'Kevin Thorsen Example' }))).toEqual(WARN);
    expect(ids(dc(['Example, Kevin Thorsen'], by, { rights: 'Kevin Restricted Example' }))).toEqual(WARN);
  });
  it('an entry whose only content is an access value as identifier is neutral', () => {
    for (const e of [{ rightsIdentifier: 'info:eu-repo/semantics/openAccess' }, { rightsIdentifier: 'open access' }, { rightsIdentifier: 'Open Access' }]) {
      expect(ids(dc(PEOPLE, by, e)), JSON.stringify(e)).toEqual([]);
    }
    for (const e of [{ rightsIdentifier: 'info:eu-repo/semantics/closedAccess' }, { rightsIdentifier: 'open access; inc' }]) expect(ids(dc(PEOPLE, by, e)), JSON.stringify(e)).toEqual(WARN);
  });
});
