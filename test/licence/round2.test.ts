// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Round 2 of the review of licence-exact-names: (1) the version of an id is its LAST number (CC0-1.0 is 1.0, not 0), a title that
// genuinely lacks it names a family and never passes next to another licence; (2) LIC-OTHER-RIGHTS-ENTRY: a repeated rights entry that
// names no licence next to a recognised one is flagged WITHOUT claiming a restriction, only in DataCite rightsList / Zenodo rights[];
// (3) a link that is no licence next to an exact title + id is a text-link conflict.
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import { parseDataciteJson } from '../../src/core/metadata/datacite';
import { buildStatement, classifyStatement, versionless } from '../../src/core/metadata/licence';
import { parseZenodoRecord } from '../../src/core/metadata/zenodo';
import { ZENODO_LICENCES } from '../../src/core/metadata/zenodo-licences';
import { renderPlain } from '../../src/core/report';
import type { Finding, Lang, MetadataRecord } from '../../src/core/types';

type Rights = { rights?: string; rightsUri?: string; rightsIdentifier?: string; rightsIdentifierScheme?: string };
const dc = (...rights: Rights[]) => parseDataciteJson({ data: { attributes: { doi: '10.5281/zenodo.1', rightsList: rights } } }, 'dc');
const lic = (f: Finding[]) => f.filter((x) => x.ruleId.startsWith('LIC-'));
const run = (rec: MetadataRecord) => lic(checkLicence([rec], { label: 'x', inaccessible: false }));
const rulesOf = (rec: MetadataRecord) => run(rec).map((f) => f.ruleId);
const rules = (...rights: Rights[]) => rulesOf(dc(...rights));
const LANGS: Lang[] = ['en', 'pl', 'de', 'fr'];
const CONFLICT = ['LIC-AMBIGUOUS', 'LIC-TEXT-URI-CONFLICT'];
const isConflict = (r: string[]) => r.length > 0 && r.every((x) => CONFLICT.includes(x));
const CCBY = 'https://creativecommons.org/licenses/by/4.0/legalcode';
const CCBYNC = 'https://creativecommons.org/licenses/by-nc/4.0/legalcode';
const ODBL = 'http://www.opendatacommons.org/licenses/odbl/1.0/';
const by: Rights = { rights: 'Creative Commons Attribution 4.0 International', rightsUri: CCBY, rightsIdentifier: 'cc-by-4.0' };

describe('HIGH 1: the version of an id is its last number', () => {
  it('only genuinely versionless titles are versionless', () => {
    expect(ZENODO_LICENCES.filter(versionless).map((z) => z.id)).toEqual(['NLOD-1.0']);
  });
  it('the CC0 title is recognised alone and with its own link and id', () => {
    const z = ZENODO_LICENCES.find((x) => x.id === 'CC0-1.0')!;
    expect(classifyStatement(dc({ rights: z.title }).licences[0])).toEqual({ kind: 'spdx', id: 'CC0-1.0' });
    expect(rules({ rights: z.title, rightsUri: z.url, rightsIdentifier: 'cc0-1.0' })).toEqual([]);
  });
  it('the CC0 title against another licence: conflict, never clean', () => {
    const t = 'Creative Commons Zero v1.0 Universal';
    expect(rules({ rights: t, rightsUri: CCBY })).toEqual(['LIC-TEXT-URI-CONFLICT']);
    expect(rules({ rights: t, rightsUri: CCBYNC })).toEqual(['LIC-TEXT-URI-CONFLICT']);
    const rec = parseZenodoRecord({ id: 1, metadata: { title: 'x', license: { id: 'cc-by-4.0', title: { en: t } } } }, 'z');
    expect(rulesOf(rec)).toEqual(['LIC-AMBIGUOUS']);
  });
  it('the versionless NLOD title: any id or link outside its family is a conflict, its own family passes', () => {
    const t = 'Norwegian Licence for Open Government Data';
    expect(rules({ rights: t, rightsUri: CCBY })).toEqual(['LIC-TEXT-URI-CONFLICT']);
    expect(isConflict(rules({ rights: t, rightsIdentifier: 'cc-by-4.0' }))).toBe(true);
    expect(isConflict(rules({ rights: t, rightsIdentifier: 'mit', rightsUri: 'https://opensource.org/licenses/MIT' }))).toBe(true);
    expect(rules({ rights: t, rightsIdentifier: 'nlod-2.0', rightsUri: 'https://data.norge.no/nlod/en/2.0' })).toEqual([]);
    expect(rules({ rights: t, rightsIdentifier: 'nlod-1.0', rightsUri: 'http://data.norge.no/nlod/en/1.0' })).toEqual([]);
  });

  describe.each(ZENODO_LICENCES.map((z) => [z.id, z] as const))('%s', (id, z) => {
    // a licence of another family than the row's (the GNU pages are shared, so never another GNU one)
    const other = id === 'CC-BY-4.0' ? { id: 'odbl-1.0', url: ODBL } : { id: 'cc-by-4.0', url: CCBY };
    it('title alone: never a wrong class; recognised when it carries its version', () => {
      const k = classifyStatement(dc({ rights: z.title }).licences[0]);
      if (versionless(z)) expect(k).toEqual({ kind: 'unrecognised' });
      else expect(k).toEqual({ kind: 'spdx', id });
    });
    it('title + own link + own id: clean', () => {
      expect(rules({ rights: z.title, rightsUri: z.url, rightsIdentifier: id.toLowerCase() })).toEqual([]);
    });
    it('title + a DIFFERENT licence (link, id, both): a conflict', () => {
      expect(isConflict(rules({ rights: z.title, rightsUri: other.url })), 'link').toBe(true);
      expect(isConflict(rules({ rights: z.title, rightsIdentifier: other.id })), 'id').toBe(true);
      expect(isConflict(rules({ rights: z.title, rightsUri: other.url, rightsIdentifier: other.id })), 'both').toBe(true);
      const rec = parseZenodoRecord({ id: 1, metadata: { title: 'x', license: { id: other.id, title: { en: z.title } } } }, 'z');
      expect(isConflict(rulesOf(rec)), 'zenodo record').toBe(true);
    });
  });
});

describe('HIGH 2: LIC-OTHER-RIGHTS-ENTRY, only for repeated rights entries', () => {
  const INC = 'http://rightsstatements.org/vocab/InC/1.0/';
  const WARN: Rights[] = [
    { rights: 'Closed Access' }, { rights: 'info:eu-repo/semantics/closedAccess' }, { rights: 'In Copyright', rightsUri: INC }, { rightsUri: INC },
    { rights: 'Available upon request' }, { rights: 'Please contact the PI' }, { rights: 'Free for scientific use' }, { rights: 'Nutzung nach Absprache' },
    { rights: 'CC BY-NC' }, { rights: 'All rights reserved' }, { rights: 'Closed Access', rightsUri: INC }, { rights: 'All Rights Reserved', rightsUri: INC }, { rights: 'Restricted Access', rightsUri: INC }, { rights: 'Not for commercial use' }, { rights: 'Data access is restricted until the end of the project' },
  ];
  it.each(WARN.map((r) => [JSON.stringify(r), r] as const))('%s next to CC BY 4.0: one warning', (_n, extra) => {
    const f = run(dc(by, extra)).filter((x) => x.ruleId === 'LIC-OTHER-RIGHTS-ENTRY');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('warning');
    expect(f[0].params.licence).toContain('CC-BY-4.0');
    expect(f[0].params.text).toBe(extra.rights ?? extra.rightsUri);
    for (const lang of LANGS) {
      const plain = renderPlain(f[0], lang);
      expect(plain, lang).toContain(String(f[0].params.text));
      expect(plain, lang).not.toMatch(/states a restriction|in Worten eine Einschränkung|ograniczenie słowami|restriction en toutes lettres|\b(OK|allowed|valid)\b/i);
    }
    expect(run(dc(by, extra)).some((x) => x.ruleId === 'LIC-RESTRICTION-TEXT')).toBe(false);
  });
  it('the same on a Zenodo record: rights[] entry next to license.id', () => {
    const rec = parseZenodoRecord({ id: 1, metadata: { title: 'x', license: { id: 'cc-by-4.0' }, rights: [{ id: 'cc-by-4.0' }, { title: { en: 'Closed Access' } }] } }, 'z');
    expect(rulesOf(rec)).toContain('LIC-OTHER-RIGHTS-ENTRY');
  });
  it.each([{ rights: 'Open Access' }, { rights: 'info:eu-repo/semantics/openAccess' }, { rights: 'https://purl.org/coar/access_right/c_abf2' }, { rights: '© 2024 ACME Corp.' }, { rights: 'Copyright 2024 ACME Corp.' }, { rightsUri: 'https://purl.org/coar/access_right/c_abf2' },
    // Zenodo's own copyright-holder entry: the holders (with or without ©) next to the In Copyright link
    { rights: '© 2026 Ignacio Fabbian', rightsUri: INC }, { rights: 'Krašovec N., Marsetič A.', rightsUri: INC }, { rights: 'Jan van der Berg & Maria Sánchez', rightsUri: INC }] as Rights[])('%j next to CC BY 4.0: no warning', (extra) => {
    expect(rulesOf(dc(by, extra))).toEqual([]);
  });
  it('no recognised licence in the record: no warning', () => {
    expect(rules({ rights: 'Closed Access' })).not.toContain('LIC-OTHER-RIGHTS-ENTRY');
  });
  it('ISO fields keep production behaviour: INSPIRE "no restriction" texts next to a licence give no new finding', () => {
    const NONE = [
      'no limitations to public access', "Pas de restriction d'accès public", 'There are no restrictions on the use of these data', 'No conditions apply to access and use',
      'No known copyright restrictions', 'Provided without warranty', 'Please cite the dataset in your research', 'Funded by the European Research Council',
      'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND', 'but not in any way that suggests the licensor endorses you or your use',
    ];
    for (const field of ['useLimitation', 'otherConstraints', 'accessConstraints']) {
      for (const text of NONE) {
        const licences = [
          buildStatement({ source: 'iso19139', field: 'otherConstraints', text: 'CC BY 4.0', uri: CCBY })!,
          buildStatement({ source: 'iso19139', field, text })!,
        ];
        const rec: MetadataRecord = { source: 'iso19139', label: 'iso', licences, restrictionCodes: [], distributionLinks: [] };
        expect(rulesOf(rec), `${field}: ${text}`).not.toContain('LIC-OTHER-RIGHTS-ENTRY');
        expect(rulesOf(rec), `${field}: ${text}`).not.toContain('LIC-RESTRICTION-TEXT');
      }
    }
  });
  it('the Zenodo form of every table row: no warning', () => {
    for (const z of ZENODO_LICENCES) expect(rules({ rights: z.title, rightsUri: z.url, rightsIdentifier: z.id.toLowerCase(), rightsIdentifierScheme: 'SPDX' }), z.id).toEqual([]);
  });
  it('PANGAEA.996153 style: CC BY 4.0 + "Data access is restricted…" with the InC link', () => {
    expect(rules({ rights: 'Creative Commons Attribution 4.0 International', rightsUri: CCBY }, { rights: 'Data access is restricted. Contact the author.', rightsUri: INC })).toEqual(['LIC-OTHER-RIGHTS-ENTRY']);
  });
  it('the licence is shown by its name and id', () => {
    const f = run(dc(by, { rights: 'Closed Access' })).find((x) => x.ruleId === 'LIC-OTHER-RIGHTS-ENTRY')!;
    expect(f.params.licence).toBe('Creative Commons Attribution 4.0 International (CC-BY-4.0)');
  });
});

describe('LOW: a rights link that is no licence next to an exact title + id', () => {
  it('is a text-link conflict, never silently clean', () => {
    const z = ZENODO_LICENCES.find((x) => x.id === 'CC-BY-4.0')!;
    for (const uri of ['https://example.org/terms?use=noncommercial', 'https://example.org/data-policy']) {
      expect(rules({ rights: z.title, rightsIdentifier: 'cc-by-4.0', rightsUri: uri })).toEqual(['LIC-TEXT-URI-CONFLICT']);
    }
  });
  it('a neutral access link next to an exact title + id stays clean; so does prose text with a stray link (production behaviour)', () => {
    expect(rules({ rights: 'Creative Commons Attribution 4.0 International', rightsIdentifier: 'cc-by-4.0', rightsUri: 'https://purl.org/coar/access_right/c_abf2' })).toEqual([]);
  });
});
