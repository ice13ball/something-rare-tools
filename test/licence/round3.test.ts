// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Round 3 of the review: (1) a holder entry is neutral ONLY when every name in it is a creator or the publisher of the SAME record
// (fail-closed; no list of words); (2) the unknown-link clause is limited to DataCite and Zenodo, and the URI reader knows the exact
// spdx.org and EU Publications Office licence URIs.
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import { parseDataciteJson } from '../../src/core/metadata/datacite';
import { buildStatement, spdxFromUri } from '../../src/core/metadata/licence';
import { parseZenodoRecord } from '../../src/core/metadata/zenodo';
import type { Finding, MetadataRecord } from '../../src/core/types';

type Rights = { rights?: string; rightsUri?: string; rightsIdentifier?: string };
const INC = 'http://rightsstatements.org/vocab/InC/1.0/';
const CCBY = 'https://creativecommons.org/licenses/by/4.0/legalcode';
const by: Rights = { rights: 'Creative Commons Attribution 4.0 International', rightsUri: CCBY, rightsIdentifier: 'cc-by-4.0' };
const dc = (attrs: { creators?: string[]; publisher?: string }, ...rights: Rights[]) =>
  parseDataciteJson({ data: { attributes: { doi: '10.5281/zenodo.1', creators: (attrs.creators ?? []).map((name) => ({ name })), publisher: attrs.publisher, rightsList: rights } } }, 'dc');
const lic = (f: Finding[]) => f.filter((x) => x.ruleId.startsWith('LIC-'));
const ids = (rec: MetadataRecord) => lic(checkLicence([rec], { label: 'x', inaccessible: false })).map((f) => f.ruleId);
const OWN = { creators: ['Krašovec, Nina', 'Marsetič, Aleš', 'van der Berg, Jan'], publisher: 'CERN' };

describe('HIGH: a holder entry is neutral only when every name is a creator or the publisher of the same record', () => {
  const FALSE_OK = [
    'Non-Commercial', 'Noncommercial', 'Academic Only', 'Research Only', 'Members Only', 'Internal', 'Do Not Redistribute', 'No Redistribution', 'No Derivatives',
    'NOT FOR REDISTRIBUTION', 'Fee Required', 'Proprietary', 'Personal Only', 'Educational Purposes Only', 'Nur Forschung', 'Keine Weitergabe', 'Usage Interne',
    'Tylko Do Użytku Wewnętrznego', 'Zakaz Rozpowszechniania', 'ACME Corp Internal', 'ACME Corp Members', 'ACME Corp Proprietary', 'ACME Corp No Redistribution',
    'Closed Access', 'All Rights Reserved', 'Krašovec N. Internal', 'Krašovec N., Members Only',
  ];
  it.each(FALSE_OK)('"%s": warns, with and without the In Copyright link', (t) => {
    for (const extra of [{ rights: t, rightsUri: INC }, { rights: t }, { rights: `© 2026 ${t}`, rightsUri: INC }, { rights: `© 2026 ${t}` }]) {
      expect(ids(dc(OWN, by, extra)), JSON.stringify(extra)).toEqual(['LIC-OTHER-RIGHTS-ENTRY']);
    }
  });
  it.each([
    'Krašovec N., Marsetič A.', '© 2026 Nina Krašovec', 'Copyright 2024 Krašovec, Nina & Marsetič, Aleš', 'Krasovec N. and Marsetic A.', 'Jan van der Berg',
    'KRAŠOVEC N.; MARSETIČ A.', 'CERN', '© 2025 CERN', 'Nina Krašovec, CERN',
  ])('"%s" matches the creators / publisher of the record: clean, with and without the link', (t) => {
    for (const extra of [{ rights: t, rightsUri: INC }, { rights: t }]) expect(ids(dc(OWN, by, extra)), JSON.stringify(extra)).toEqual([]);
  });
  it('the same names warn when they are not the record\'s creators, and when the record has none', () => {
    for (const t of ['Krašovec N., Marsetič A.', '© 2026 Ignacio Fabbian', 'CERN']) {
      expect(ids(dc({ creators: ['Smith, John'], publisher: 'Other Org' }, by, { rights: t, rightsUri: INC })), t).toEqual(['LIC-OTHER-RIGHTS-ENTRY']);
      expect(ids(dc({}, by, { rights: t, rightsUri: INC })), t).toEqual(['LIC-OTHER-RIGHTS-ENTRY']);
    }
  });
  it('the In Copyright link alone, with no text, still warns', () => {
    expect(ids(dc(OWN, by, { rightsUri: INC }))).toEqual(['LIC-OTHER-RIGHTS-ENTRY']);
  });
  it('a Zenodo record: its rights[] holder entry is checked against its own creators', () => {
    const rec = (title: string) => parseZenodoRecord({ id: 1, metadata: { title: 'x', creators: [{ name: 'Fabbian, Ignacio' }], license: { id: 'cc-by-4.0' }, rights: [{ id: 'cc-by-4.0' }, { title: { en: title }, link: INC }] } }, 'z');
    expect(ids(rec('© 2026 Ignacio Fabbian'))).toEqual([]);
    expect(ids(rec('© 2026 Ignacio Fabbian Internal'))).toEqual(['LIC-OTHER-RIGHTS-ENTRY']);
  });
});

describe('MEDIUM: unknown-link clause only for DataCite / Zenodo; exact spdx.org and EU authority URIs are read', () => {
  const URIS: [string, string][] = [
    ['http://publications.europa.eu/resource/authority/licence/CC_BY_4_0', 'CC-BY-4.0'],
    ['https://publications.europa.eu/resource/authority/licence/CC0', 'CC0-1.0'],
    ['http://publications.europa.eu/resource/authority/licence/ODC_BL', 'ODbL-1.0'],
    ['http://publications.europa.eu/resource/authority/licence/APACHE_2_0', 'Apache-2.0'],
    ['https://spdx.org/licenses/CC-BY-4.0', 'CC-BY-4.0'],
    ['https://spdx.org/licenses/CC-BY-4.0.html', 'CC-BY-4.0'],
    ['https://spdx.org/licenses/CC-BY-4.0.json', 'CC-BY-4.0'],
    ['http://spdx.org/licenses/AGPL-3.0-or-later.html', 'AGPL-3.0-or-later'],
    ['https://spdx.org/licenses/MIT.html', 'MIT'],
    ['https://opendefinition.org/licenses/cc-zero/', 'CC0-1.0'],
    ['http://opendefinition.org/licenses/odc-odbl', 'ODbL-1.0'],
  ];
  it.each(URIS)('%s reads as %s', (u, id) => {
    expect(spdxFromUri(u)).toBe(id);
  });
  it.each(['https://spdx.org/licenses/NOT-A-LICENCE.html', 'https://spdx.org/licenses/GPL-3.0.html', 'http://publications.europa.eu/resource/authority/licence/NO_SUCH_CODE', 'http://publications.europa.eu/resource/authority/licence/GPL_3_0', 'https://spdx.org/licenses/CC-BY-4.0.html?x=1'])('%s names no known id', (u) => {
    expect(spdxFromUri(u)).toBeUndefined();
  });
  it('an id with a link of the new forms is clean in DataCite, with the matching id; a different id conflicts', () => {
    const ok = (uri: string, id: string, title: string) => ids(dc({}, { rights: title, rightsUri: uri, rightsIdentifier: id }));
    expect(ok('https://spdx.org/licenses/CC-BY-4.0.html', 'cc-by-4.0', 'Creative Commons Attribution 4.0 International')).toEqual([]);
    expect(ok('http://publications.europa.eu/resource/authority/licence/CC_BY_4_0', 'cc-by-4.0', 'Creative Commons Attribution 4.0 International')).toEqual([]);
    expect(ok('https://opendefinition.org/licenses/cc-zero/', 'cc0-1.0', 'Creative Commons Zero v1.0 Universal')).toEqual([]);
    expect(ok('https://spdx.org/licenses/MIT.html', 'cc-by-4.0', 'Creative Commons Attribution 4.0 International')).toEqual(['LIC-TEXT-URI-CONFLICT']);
  });
  it('DataCite and Zenodo keep the conflict for a truly unknown link', () => {
    expect(ids(dc({}, { rights: 'Creative Commons Attribution 4.0 International', rightsIdentifier: 'cc-by-4.0', rightsUri: 'https://doi.org/10.5281/zenodo.1' }))).toEqual(['LIC-TEXT-URI-CONFLICT']);
    const z = parseZenodoRecord({ id: 1, metadata: { title: 'x', license: { id: 'cc-by-4.0', title: { en: 'Creative Commons Attribution 4.0 International' }, link: 'https://example.org/terms' } } }, 'z');
    expect(ids(z)).toEqual(['LIC-TEXT-URI-CONFLICT']);
  });
  it('ISO behaves as before for an unknown link next to an exact id / title', () => {
    for (const text of ['CC-BY-4.0', 'Creative Commons Attribution 4.0 International']) {
      for (const uri of ['https://doi.org/10.5281/zenodo.1', 'https://example.org/terms', 'https://opendefinition.org/licenses/cc-by/']) {
        const s = buildStatement({ source: 'iso19139', field: 'otherConstraints', text, uri })!;
        expect(s.conflict, `${text} ${uri}`).toBeUndefined();
        expect(s.spdx, `${text} ${uri}`).toBe('CC-BY-4.0');
      }
    }
  });
});
