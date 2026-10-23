// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Round 4 of the review: genuine holder entries ("The Authors", name variants) are neutral without opening a deny list (names only);
// the DataCite rightsIdentifier of an entry counts; an organisation creator matches as a whole name; "Surname, I." is one name.
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import { parseDataciteJson } from '../../src/core/metadata/datacite';
import type { Finding } from '../../src/core/types';

type Rights = { rights?: string; rightsUri?: string; rightsIdentifier?: string };
type Creator = string | { name: string; nameType?: string };
const INC = 'http://rightsstatements.org/vocab/InC/1.0/';
const CCBY = 'https://creativecommons.org/licenses/by/4.0/legalcode';
const by: Rights = { rights: 'Creative Commons Attribution 4.0 International', rightsUri: CCBY, rightsIdentifier: 'cc-by-4.0' };
const dc = (creators: Creator[], publisher: string | undefined, ...rights: Rights[]) =>
  parseDataciteJson({ data: { attributes: { doi: '10.5281/zenodo.1', creators: creators.map((c) => (typeof c === 'string' ? { name: c } : c)), publisher, rightsList: rights } } }, 'dc');
const ids = (rec: ReturnType<typeof dc>) => checkLicence([rec], { label: 'x', inaccessible: false }).filter((f: Finding) => f.ruleId.startsWith('LIC-')).map((f) => f.ruleId);
const WARN = ['LIC-OTHER-RIGHTS-ENTRY'];
const PEOPLE: Creator[] = ['Baird, Kevin', 'Berg, Jan', 'Krašovec, Nina', 'Cui, Qirui', 'Narr, Marei'];
const entry = (t: string, uri: string | undefined = INC) => ({ rights: t, ...(uri ? { rightsUri: uri } : {}) });
const withLink = (t: string) => [entry(t), entry(t, undefined)];

describe('MEDIUM: "the authors" and name variants', () => {
  it.each([
    'The Authors', 'The Author', 'authors', 'author(s)', '© The Authors', 'Copyright (C) 2026 The Authors', 'Copyright (C) 2026 The authors.', 'Copyright (C) The Authors 2026',
    'Copyright (c) 2026- The Authors', 'O Autor', 'Os Autores', 'Autorzy', 'Die Autoren', 'Les auteurs', 'Los autores', 'Gli autori', '© 2026 Autori',
  ])('"%s" is the record\'s creators: clean, with and without the link', (t) => {
    for (const e of withLink(t)) expect(ids(dc(PEOPLE, 'Zenodo', by, e)), JSON.stringify(e)).toEqual([]);
  });
  it('"The Authors" with no creators in the record, or with anything around it, warns', () => {
    expect(ids(dc([], 'Zenodo', by, entry('The Authors')))).toEqual(WARN);
    for (const t of ['The Authors Internal', 'The Authors. All rights reserved', 'Authors of the third-party data', 'The Authors and ACME Corp', 'The Authors, upstream source retains copyright']) {
      expect(ids(dc(PEOPLE, 'Zenodo', by, entry(t))), t).toEqual(WARN);
    }
  });
  it.each([
    'Kevin T. Baird', 'K. Baird', 'Dr. Jan Berg', 'Prof. Nina Krašovec, PhD', 'Dr. Jan Berg (ORCID: 0000-0002-1825-0097)',
    'Narr et al.', '© 2026 Narr et al.', 'Narr et al.; Jan Berg', 'Krašovec, N.', 'Berg, J.; Baird, K.', 'Krašovec, N. A.',
  ])('name variant "%s" is a creator: clean', (t) => {
    for (const e of withLink(t)) expect(ids(dc(PEOPLE, 'Zenodo', by, e)), JSON.stringify(e)).toEqual([]);
  });
  it.each([
    'All rights reserved', 'Upstream source retains copyright', '© 2026 Smith J.', 'Kevin Baird Internal', 'Krašovec N. Internal', 'Smith et al.', 'Narr et al. Internal',
    'Narr et al. and Smith', 'Dr. Smith', 'Kevin Internal Baird Corp', 'Third-party holders (see README)', '© 2026 Baird Ltd.',
  ])('"%s" stays a warning', (t) => {
    for (const e of withLink(t)) expect(ids(dc(PEOPLE, 'Zenodo', by, e)), JSON.stringify(e)).toEqual(WARN);
  });
});

describe('LOW 2: the DataCite rightsIdentifier of an entry counts', () => {
  const holder = (identifier?: string, uri: string | undefined = INC): Rights => ({ rights: 'Krašovec N.', ...(uri ? { rightsUri: uri } : {}), ...(identifier ? { rightsIdentifier: identifier } : {}) });
  it.each(['other-closed', 'InC-NC', 'InC-EDU', 'proprietary'])('identifier "%s" next to a matching holder: warns', (id) => {
    expect(ids(dc(PEOPLE, 'Zenodo', by, holder(id))), id).toEqual(WARN);
    expect(ids(dc(PEOPLE, 'Zenodo', by, holder(id, undefined))), id).toEqual(WARN);
  });
  it.each([undefined, 'InC', 'inc', 'info:eu-repo/semantics/openAccess'])('identifier %s next to a matching holder: clean', (id) => {
    expect(ids(dc(PEOPLE, 'Zenodo', by, holder(id)))).toEqual([]);
  });
});

describe('LOW 3: an organisation creator matches as a whole name', () => {
  const ORG: Creator[] = ['Department of Internal Medicine', { name: 'Smith Group', nameType: 'Organizational' }, 'Berg, Jan'];
  it('one word of it is no holder; the whole name is', () => {
    for (const t of ['Internal', 'Medicine', 'Department', 'Smith', 'Department of Internal', 'Internal Medicine']) expect(ids(dc(ORG, 'Zenodo', by, entry(t))), t).toEqual(WARN);
    for (const t of ['Department of Internal Medicine', '© 2026 Department of Internal Medicine', 'Smith Group', 'Jan Berg']) expect(ids(dc(ORG, 'Zenodo', by, entry(t))), t).toEqual([]);
  });
  it('the publisher also matches as a whole name', () => {
    expect(ids(dc([], 'CERN Data Centre', by, entry('CERN')))).toEqual(WARN);
    expect(ids(dc([], 'CERN Data Centre', by, entry('CERN Data Centre')))).toEqual([]);
  });
});

describe('tightening found while probing', () => {
  it('a symbol in an entry, a lone given name and lone particles are no holder', () => {
    for (const t of ['Krašovec 🚫💰', 'Krašovec ($)', 'Krašovec +', 'Nina', 'Jan', 'van der', 'Krašovec / Internal']) expect(ids(dc(PEOPLE, 'Zenodo', by, entry(t))), t).toEqual(WARN);
  });
  it('an organisation whose name contains "and" or a comma matches as a whole', () => {
    const ORG: Creator[] = ['Ministry of Agriculture and Forestry', 'Acme, Inc.'];
    for (const t of ['© Ministry of Agriculture and Forestry', 'Ministry of Agriculture and Forestry', 'Acme, Inc.']) expect(ids(dc(ORG, 'Zenodo', by, entry(t))), t).toEqual([]);
    expect(ids(dc(ORG, 'Zenodo', by, entry('Ministry of Agriculture')))).toEqual(WARN);
  });
});
