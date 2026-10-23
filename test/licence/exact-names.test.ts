// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Standard licences as Zenodo writes them into DataCite are recognised by their EXACT names (the title, the SPDX id as identifier); anything
// else in the text stays leftover (fail-closed unchanged). Reported on production: ODbL (10.5281/zenodo.23541397) and the GNU "or later"
// licences (10.5281/zenodo.22728476, 10.23695/ajyp-y830).
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import { analyseLicences } from '../../src/core/licence/analyse';
import { parseDataciteJson } from '../../src/core/metadata/datacite';
import { classifyStatement, exactLicenceName, spdxFromUri } from '../../src/core/metadata/licence';
import type { Finding } from '../../src/core/types';

type Rights = { rights?: string; rightsUri?: string; rightsIdentifier?: string; rightsIdentifierScheme?: string };
const record = (...rights: Rights[]) => parseDataciteJson({ data: { attributes: { doi: '10.5281/zenodo.1', rightsList: rights } } }, 'dc');
const lic = (f: Finding[]) => f.filter((x) => x.ruleId.startsWith('LIC-'));
const findings = (...rights: Rights[]) => lic(checkLicence([record(...rights)], { label: 'x', inaccessible: false }));
const rules = (...rights: Rights[]) => findings(...rights).map((f) => f.ruleId);
const klass = (...rights: Rights[]) => classifyStatement(record(...rights).licences[0]);
const spdx = (id: string) => ({ kind: 'spdx', id });
const UNREC = { kind: 'unrecognised' };

const ODBL: Rights = { rights: 'ODC Open Database License v1.0', rightsUri: 'http://www.opendatacommons.org/licenses/odbl/1.0/', rightsIdentifier: 'odbl-1.0', rightsIdentifierScheme: 'SPDX' };
const AGPL: Rights = { rights: 'GNU Affero General Public License v3.0 or later', rightsUri: 'https://www.gnu.org/licenses/agpl.txt', rightsIdentifier: 'agpl-3.0-or-later', rightsIdentifierScheme: 'SPDX' };
const GPL: Rights = { rights: 'GNU General Public License v3.0 or later', rightsUri: 'https://www.gnu.org/licenses/gpl-3.0-standalone.html', rightsIdentifier: 'gpl-3.0-or-later', rightsIdentifierScheme: 'SPDX' };

describe('reported on production', () => {
  it('ODbL: recognised, no finding, kept on /licence', () => {
    expect(klass(ODBL)).toEqual(spdx('ODbL-1.0'));
    expect(rules(ODBL)).toEqual([]);
    expect(analyseLicences([record(ODBL)]).sources[0].statements[0].classification).toEqual(spdx('ODbL-1.0'));
  });
  it.each([AGPL, GPL])('GNU or-later $rightsIdentifier: classified, machine-readable, no LIC-FREE-TEXT', (r) => {
    expect(klass(r)).toEqual(spdx(r.rightsIdentifier!.replace('agpl', 'AGPL').replace(/^gpl/, 'GPL')));
    expect(rules(r)).toEqual([]);
    const a = analyseLicences([record(r)]);
    expect(a.sources[0].statements[0].machineReadable).toBe(true);
    expect(a.freeText).toBeUndefined();
  });
  it('the GNU link alone cannot decide between -only and -or-later', () => {
    expect(spdxFromUri('https://www.gnu.org/licenses/agpl.txt')).toBeUndefined();
    expect(spdxFromUri('https://www.gnu.org/licenses/gpl-3.0-standalone.html')).toBeUndefined();
    expect(klass({ rightsUri: 'https://www.gnu.org/licenses/agpl.txt' })).toEqual(UNREC);
  });
  it('controls stay recognised: CC0-1.0, Apache-2.0, CC-BY-4.0', () => {
    const cc0 = { rights: 'Creative Commons Zero v1.0 Universal', rightsUri: 'https://creativecommons.org/publicdomain/zero/1.0/legalcode', rightsIdentifier: 'cc0-1.0' };
    const apache = { rights: 'Apache License 2.0', rightsUri: 'http://www.apache.org/licenses/LICENSE-2.0', rightsIdentifier: 'apache-2.0' };
    const by = { rights: 'Creative Commons Attribution 4.0 International', rightsUri: 'https://creativecommons.org/licenses/by/4.0/legalcode', rightsIdentifier: 'cc-by-4.0' };
    for (const [r, id] of [[cc0, 'CC0-1.0'], [apache, 'Apache-2.0'], [by, 'CC-BY-4.0']] as const) {
      expect(klass(r)).toEqual(spdx(id));
      expect(rules(r)).toEqual([]);
    }
  });
});

describe('exact names', () => {
  it('a title or id is matched as a whole string: case, spacing, trailing punctuation', () => {
    expect(exactLicenceName('odc open database license v1.0')).toBe('ODbL-1.0');
    expect(exactLicenceName('  ODC  Open Database License v1.0. ')).toBe('ODbL-1.0');
    expect(exactLicenceName('ODBL-1.0')).toBe('ODbL-1.0');
    expect(exactLicenceName('GNU Affero General Public License v3.0 or later;')).toBe('AGPL-3.0-or-later');
    expect(exactLicenceName('ODC Open Database License v1.0 for non-commercial use')).toBeUndefined();
    expect(exactLicenceName('cc-by-4.0 licence')).toBeUndefined();
  });
  it('an exact id as the identifier is recognised and consumed (no "1.0" leftover), machine-readable', () => {
    const r: Rights = { rights: 'ODC Open Database License v1.0', rightsIdentifier: 'ODBL-1.0' };
    expect(klass(r)).toEqual(spdx('ODbL-1.0'));
    expect(rules(r)).toEqual([]);
    expect(analyseLicences([record(r)]).sources[0].statements[0].machineReadable).toBe(true);
  });
  it('the id alone as the whole text is recognised', () => {
    expect(klass({ rights: 'odbl-1.0' })).toEqual(spdx('ODbL-1.0'));
    expect(rules({ rightsIdentifier: 'agpl-3.0-or-later' })).toEqual([]);
  });
});

describe('fail-closed stays', () => {
  it('words added to an exact title: unrecognised, LIC-ADDED-CONDITIONS', () => {
    const r = { ...ODBL, rights: 'ODC Open Database License v1.0 for non-commercial use' };
    expect(klass(r)).toEqual(UNREC);
    expect(rules(r)).toEqual(['LIC-ADDED-CONDITIONS']);
  });
  it('"CC BY 4.0 for academic use" with identifier cc-by-4.0: ADDED-CONDITIONS', () => {
    const r = { rights: 'CC BY 4.0 for academic use', rightsIdentifier: 'cc-by-4.0' };
    expect(klass(r)).toEqual(UNREC);
    expect(rules(r)).toEqual(['LIC-ADDED-CONDITIONS']);
  });
  it('words that are no condition stay leftover: LIC-EXTRA-TEXT', () => {
    expect(rules({ ...ODBL, rights: 'ODC Open Database License v1.0, see the README' })).toEqual(['LIC-EXTRA-TEXT']);
  });
  it('an identifier that disagrees with the title is still a conflict', () => {
    expect(rules({ rights: 'ODC Open Database License v1.0', rightsIdentifier: 'cc-by-4.0' })).toEqual(['LIC-AMBIGUOUS']);
    expect(rules({ ...ODBL, rightsIdentifier: 'cc-by-4.0' })).toEqual(['LIC-TEXT-URI-CONFLICT']);
  });
  it('an identifier that disagrees with the link is still a conflict', () => {
    expect(rules({ rightsIdentifier: 'mit', rightsUri: 'https://creativecommons.org/licenses/by/4.0/legalcode' })).toEqual(['LIC-TEXT-URI-CONFLICT']);
  });
  it('-only identifier against an "or later" title and the shared GNU link is ambiguous, never a silent pick', () => {
    expect(klass({ ...AGPL, rightsIdentifier: 'agpl-3.0-only' })).toEqual(UNREC);
    expect(rules({ ...AGPL, rightsIdentifier: 'agpl-3.0-only' })).toEqual(['LIC-TEXT-URI-CONFLICT']);
  });
  it('a title that is only part of the text does not count as an exact name', () => {
    expect(klass({ rights: 'Creative Commons Zero v1.0 Universal, not for commercial use', rightsIdentifier: 'cc0-1.0' })).toEqual(UNREC);
  });
  it('a free-text-only statement with the GNU title and no identifier still asks for the identifier', () => {
    const r = { rights: 'GNU Affero General Public License v3.0 or later', rightsUri: 'https://www.gnu.org/licenses/agpl.txt' };
    expect(rules(r)).toEqual(['LIC-FREE-TEXT']);
  });
});
