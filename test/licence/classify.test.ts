// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { KNOWN_LICENCES, SPDX_LIST_VERSION, buildStatement, classifyStatement, isOpenLicence, spdxInfo, toSpdx } from '../../src/core/metadata/licence';

const st = (text?: string, uri?: string) => buildStatement({ source: 'datacite', field: 'rightsList[0]', text, uri })!;

describe('identifiers added from the SPDX list', () => {
  it('records the list version the table was generated from', () => {
    expect(SPDX_LIST_VERSION).toMatch(/^\d+\.\d+/);
  });
  it.each([
    ['http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', 'OGL-UK-3.0'],
    ['https://www.nationalarchives.gov.uk/doc/open-government-licence/version/2/', 'OGL-UK-2.0'],
    ['https://www.govdata.de/dl-de/by-2-0', 'DL-DE-BY-2.0'],
    ['https://www.govdata.de/dl-de/zero-2-0', 'DL-DE-ZERO-2.0'],
    ['https://data.norge.no/nlod/en/2.0', 'NLOD-2.0'],
    ['http://data.norge.no/nlod/no/1.0', 'NLOD-1.0'],
    ['https://opendatacommons.org/licenses/by/1-0/', 'ODC-By-1.0'],
    ['https://opendatacommons.org/licenses/pddl/1.0/', 'PDDL-1.0'],
  ])('URI %s -> %s', (uri, id) => {
    expect(toSpdx(undefined, uri)).toBe(id);
  });
  it.each([
    ['Open Government Licence v3.0', 'OGL-UK-3.0'],
    ['OGL-UK-3.0', 'OGL-UK-3.0'],
    ['Datenlizenz Deutschland – Namensnennung – Version 2.0', 'DL-DE-BY-2.0'],
    ['Data licence Germany – attribution – version 2.0', 'DL-DE-BY-2.0'],
    ['dl-de/zero-2-0', 'DL-DE-ZERO-2.0'],
    ['Norwegian Licence for Open Government Data (NLOD) 2.0', 'NLOD-2.0'],
    ['Creative Commons Attribution 3.0 Germany', 'CC-BY-3.0-DE'],
    ['Creative Commons Attribution Share Alike 3.0 Austria', 'CC-BY-SA-3.0-AT'],
    ['CC BY 3.0 IGO', 'CC-BY-3.0-IGO'],
    ['CC-BY-SA-3.0-DE', 'CC-BY-SA-3.0-DE'],
    ['cc-by-3.0-de', 'CC-BY-3.0-DE'],
    ['Creative Commons Attribution Non Commercial No Derivatives 4.0 International', 'CC-BY-NC-ND-4.0'],
  ])('text "%s" -> %s', (text, id) => {
    expect(toSpdx(text)).toBe(id);
  });
  it('a version SPDX has no id for, or another jurisdiction, stays unrecognised', () => {
    expect(toSpdx(undefined, 'https://www.govdata.de/dl-de/by-1-0')).toBeUndefined();
    expect(toSpdx('Open Government Licence - Canada')).toBeUndefined();
    expect(toSpdx('CC BY 3.0 PL')).toBeUndefined();
    expect(toSpdx(undefined, 'https://creativecommons.org/publicdomain/mark/1.0/')).toBeUndefined();
  });
  it('a port word after a space needs capitals, so ordinary words are not read as a country', () => {
    // "at" is not a port (and not Austria); "Zenodo" is text besides the licence name, so fail-closed: no id.
    expect(toSpdx('CC-BY-3.0 at Zenodo')).toBeUndefined();
    expect(toSpdx('CC BY 4.0 DE')).toBe('CC-BY-4.0');
  });
  it('exposes official name and canonical URL for every classifiable id, and nothing else', () => {
    expect(spdxInfo('OGL-UK-3.0')).toEqual({ id: 'OGL-UK-3.0', name: 'Open Government Licence v3.0', url: 'http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/' });
    expect(spdxInfo('CC-BY-4.0')).toMatchObject({ name: 'Creative Commons Attribution 4.0 International', url: 'https://creativecommons.org/licenses/by/4.0/legalcode' });
    expect(spdxInfo('CC-BY-3.0-DE')?.name).toBe('Creative Commons Attribution 3.0 Germany');
    expect(spdxInfo('MIT')).toMatchObject({ name: 'MIT License' });
    expect(spdxInfo('GPL-3.0')).toBeUndefined(); // the deprecated, ambiguous id
    expect(spdxInfo('Proprietary')).toBeUndefined();
    expect(KNOWN_LICENCES.length).toBeGreaterThan(50);
    for (const l of KNOWN_LICENCES) expect(l.url, l.id).toMatch(/^https?:\/\//);
  });
  it('every id the URI/text readers can produce is in the table (open or not)', () => {
    for (const l of KNOWN_LICENCES) expect(typeof isOpenLicence(l.id)).toBe('boolean');
    expect(isOpenLicence('OGL-UK-3.0')).toBe(true);
    expect(isOpenLicence('DL-DE-BY-2.0')).toBe(true);
    expect(isOpenLicence('NLOD-2.0')).toBe(true);
    expect(isOpenLicence('CC-BY-SA-3.0-AT')).toBe(true);
    expect(isOpenLicence('CC-BY-NC-SA-3.0-DE')).toBe(false);
    expect(isOpenLicence('CC-BY-ND-3.0-IGO')).toBe(false);
    expect(isOpenLicence('MIT')).toBe(true); // software licences are open here; this only decides restriction-code contradictions
    expect(isOpenLicence('Proprietary')).toBe(false);
  });
});

describe('text and URI are read separately; the URI never silently wins', () => {
  it('keeps both readings and the agreed id when they agree', () => {
    expect(st('CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/')).toMatchObject({ textSpdx: 'CC-BY-4.0', uriSpdx: 'CC-BY-4.0', spdx: 'CC-BY-4.0' });
  });
  it('different licences: conflict, no agreed id, both readings kept', () => {
    const s = st('CC BY-NC 4.0', 'https://creativecommons.org/licenses/by/4.0/');
    expect(s).toMatchObject({ textSpdx: 'CC-BY-NC-4.0', uriSpdx: 'CC-BY-4.0', conflict: 'text-uri' });
    expect(s.spdx).toBeUndefined();
    expect(classifyStatement(s)).toEqual({ kind: 'unrecognised' });
  });
  it('a versionless text names a family: "CC BY-NC" against a by/4.0 URI conflicts, "CC-BY" against it does not', () => {
    expect(st('CC BY-NC', 'https://creativecommons.org/licenses/by/4.0/').conflict).toBe('text-uri');
    expect(st('CC-BY', 'https://creativecommons.org/licenses/by/4.0')).toMatchObject({ spdx: 'CC-BY-4.0' });
    expect(st('CC-BY-NC-ND', 'https://creativecommons.org/licenses/by-nc-nd/4.0')).toMatchObject({ spdx: 'CC-BY-NC-ND-4.0' });
  });
  it('a harmless unrecognised text keeps the URI reading and the raw text', () => {
    const s = st('Open Access', 'https://creativecommons.org/licenses/by/4.0/');
    expect(s).toMatchObject({ text: 'Open Access', spdx: 'CC-BY-4.0' });
    expect(s.conflict).toBeUndefined();
  });
  it('an unrecognised text that restricts ("All rights reserved") against a licence URI is a text/URI conflict', () => {
    expect(st('All rights reserved', 'https://creativecommons.org/licenses/by/4.0/')).toMatchObject({ conflict: 'text-uri' });
  });
  it('precedence: readings that differ (text against link) win over the leftover; a leftover decides only when the readings agree', () => {
    expect(st('CC BY-NC 4.0, but not for commercial use', 'https://creativecommons.org/licenses/by/4.0/').conflict).toBe('text-uri');
    expect(st('CC BY 4.0 except for the maps', 'https://creativecommons.org/licenses/by/4.0/').conflict).toBe('restricted');
  });
  it('the same restricting text without any licence URI is only unrecognised free text', () => {
    const s = st('All rights reserved');
    expect(s.conflict).toBeUndefined();
    expect(s.spdx).toBeUndefined();
  });
  it('a generic text against a URI of an unmappable port is a conflict (never the generic id)', () => {
    const s = st('CC BY 3.0', 'https://creativecommons.org/licenses/by/3.0/pl/');
    expect(s.conflict).toBe('text-uri');
    expect(s.spdx).toBeUndefined();
  });
  it('several licences offered in one text cannot be reduced to one id; with a URI it is a conflict', () => {
    expect(st('CC BY 4.0 or CC BY-SA 4.0').spdx).toBeUndefined();
    expect(st('CC BY 4.0 or CC BY-SA 4.0', 'https://creativecommons.org/licenses/by/4.0/').conflict).toBe('text-uri');
    expect(st('CC BY 4.0 or CC BY-SA 4.0').conflict).toBe('readings'); // no link to blame: the statement reads two ways
  });
  it('DataCite-style identifier and rights text that disagree: unrecognised; a text/URI conflict with a link, "readings" without', () => {
    const parts = { source: 'datacite' as const, field: 'x', text: 'CC BY 4.0', also: ['cc-by-sa-4.0'] };
    expect(buildStatement(parts)!.spdx).toBeUndefined();
    expect(buildStatement(parts)!.conflict).toBe('readings');
    expect(buildStatement({ ...parts, uri: 'https://creativecommons.org/licenses/by/4.0/' })!.conflict).toBe('text-uri');
  });
  it('fail-closed: wording that is not neutral next to the licence name makes the statement "extra-text" (no id)', () => {
    for (const t of ['Data are licensed under CC BY 4.0. Please cite the dataset.', 'Unrestricted use under CC BY 4.0']) {
      expect(st(t).conflict, t).toBe('extra-text');
      expect(st(t).spdx, t).toBeUndefined();
    }
  });
  it('conditions in the text, pl/en/de/fr, make the statement unrecognised', () => {
    for (const t of ['CC BY 4.0 except for the maps', 'CC BY 4.0 – nur für Forschung', 'CC BY 4.0, sauf les images', 'CC BY 4.0 z wyjątkiem zdjęć']) {
      expect(st(t).conflict, t).toBe('restricted');
    }
  });
  it('ordinary wording around the licence name is not a condition', () => {
    for (const t of [
      'Creative Commons Attribution 4.0 International (CC BY 4.0)',
      'CC0 1.0 Universal (CC0 1.0) Public Domain Dedication',
      'No Rights Reserved. CC0 1.0',
    ]) {
      expect(st(t).conflict, t).toBeUndefined();
      expect(st(t).spdx, t).toBeDefined();
    }
  });
});

/** Rights as the public DataCite API returns them for real marine records (text, URI). Only invented titles are in the repo. */
describe('false-positive corpus: real-world rights entries stay quiet', () => {
  it.each([
    ['Creative Commons Attribution 3.0 Unported', 'https://creativecommons.org/licenses/by/3.0/legalcode', 'CC-BY-3.0'],
    ['Creative Commons Attribution Non Commercial Share Alike 3.0 Unported', 'https://creativecommons.org/licenses/by-nc-sa/3.0/legalcode', 'CC-BY-NC-SA-3.0'],
    ['Creative Commons Zero v1.0 Universal', 'https://creativecommons.org/publicdomain/zero/1.0/legalcode', 'CC0-1.0'],
    ['Creative Commons Attribution Non Commercial No Derivatives 4.0 International', 'https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode', 'CC-BY-NC-ND-4.0'],
    ['Creative Commons Attribution Share Alike 4.0 International', 'https://creativecommons.org/licenses/by-sa/4.0/legalcode', 'CC-BY-SA-4.0'],
    ['CC-BY', 'https://creativecommons.org/licenses/by/4.0', 'CC-BY-4.0'],
    ['CC-BY-NC-ND', 'https://creativecommons.org/licenses/by-nc-nd/4.0', 'CC-BY-NC-ND-4.0'],
  ])('%s', (text, uri, id) => {
    const s = st(text, uri);
    expect(s.spdx).toBe(id);
    expect(s.conflict).toBeUndefined();
  });
  it.each([
    ['GNU General Public License', 'https://www.gnu.org/licenses/gpl-3.0.html'],
    ['© 2026 A. Author', 'http://rightsstatements.org/vocab/InC/1.0/'],
    ['Use and access constraints (from the FGDC record; no license is granted)', undefined],
    ['Data access is restricted (moratorium, sensitive data, license constraints)', undefined],
  ])('"%s" is unrecognised without a conflict', (text, uri) => {
    const s = st(text, uri);
    expect(s.spdx).toBeUndefined();
    expect(s.conflict).toBeUndefined();
  });
});
