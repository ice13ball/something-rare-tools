// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// L2 and L6 of the 18.11 audit (task T2): two different recognised licences in one record, and the information line on what OBIS and GBIF accept.
// Invented records only.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import { obisLicenceFinding } from '../../src/core/licence/obis';
import { analyseLicences } from '../../src/core/licence/analyse';
import { buildAttribution } from '../../src/core/licence/attribution';
import { LICENCES } from '../../src/core/convert/metadata';
import { licenceCaseOf } from '../../src/core/convert/prefill';
import { parseDataciteJson } from '../../src/core/metadata/datacite';
import { parseIso19139 } from '../../src/core/metadata/iso19139';
import { parseZenodoRecord } from '../../src/core/metadata/zenodo';
import { renderPlain } from '../../src/core/report';
import { LANGS, type Finding, type MetadataRecord } from '../../src/core/types';

const SEVERAL = 'LIC-SEVERAL-LICENCES';
const OBIS = 'LIC-OBIS-LICENCE';
const U = (path: string): string => `https://creativecommons.org/${path}/`;
const BY = { rights: 'Creative Commons Attribution 4.0 International', rightsUri: U('licenses/by/4.0'), rightsIdentifier: 'cc-by-4.0' };
const NCND = { rights: 'Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International', rightsUri: U('licenses/by-nc-nd/4.0'), rightsIdentifier: 'cc-by-nc-nd-4.0' };
const CC0 = { rights: 'CC0 1.0 Universal', rightsUri: U('publicdomain/zero/1.0'), rightsIdentifier: 'cc0-1.0' };

type Rights = { rights?: string; rightsUri?: string; rightsIdentifier?: string };
const dc = (rightsList: Rights[], doi = '10.9999/inv.1', label = 'dc'): MetadataRecord =>
  parseDataciteJson({ data: { attributes: { doi, titles: [{ title: 'Invented survey' }], rightsList } } }, label);
const zen = (md: Record<string, unknown>, id = 999999911): MetadataRecord => parseZenodoRecord({ id, metadata: { title: 'Invented survey', ...md } }, `Zenodo ${id}`);
const run = (records: MetadataRecord[], extra: { collection?: boolean } = {}): Finding[] => checkLicence(records, { label: 'rec', inaccessible: false, ...extra });
const ids = (records: MetadataRecord[]): string[] => run(records).map((f) => f.ruleId).filter((id) => id.startsWith('LIC-'));

describe('L2: two different recognised licences in one record', () => {
  it('DataCite rightsList CC BY 4.0 + CC BY-NC-ND 4.0 is one warning naming both', () => {
    const f = run([dc([BY, NCND])]).filter((x) => x.ruleId === SEVERAL);
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('warning');
    const plain = renderPlain(f[0], 'en');
    expect(plain).toContain('CC-BY-4.0');
    expect(plain).toContain('CC-BY-NC-ND-4.0');
    expect(f[0].params.fields).toBe('rightsList[0], rightsList[1]');
    expect(ids([dc([BY, NCND])])).toEqual([SEVERAL]);
  });

  it('the same licence as identifier, URL and name, in one entry or in three, is not two licences', () => {
    expect(ids([dc([BY])])).toEqual([]);
    expect(ids([dc([{ rights: BY.rights }, { rightsUri: U('licenses/by/4.0') + 'legalcode' }, { rightsIdentifier: 'cc-by-4.0' }])])).toEqual([]);
    expect(ids([dc([BY, { ...BY, rights: 'CC BY 4.0' }])])).toEqual([]);
  });

  it('three licences are one warning that names all three', () => {
    const f = run([dc([BY, NCND, CC0])]).filter((x) => x.ruleId === SEVERAL);
    expect(f).toHaveLength(1);
    expect(renderPlain(f[0], 'en')).toMatch(/CC-BY-4\.0.*CC-BY-NC-ND-4\.0.*CC0-1\.0/);
  });

  it('two versions of one family are two licences', () => {
    const by3 = { rights: 'CC BY 3.0', rightsUri: U('licenses/by/3.0'), rightsIdentifier: 'cc-by-3.0' };
    expect(ids([dc([BY, by3])])).toContain(SEVERAL);
  });

  it('Zenodo: licence.id next to a different rights[] entry is flagged, the same licence twice is not', () => {
    expect(ids([zen({ license: { id: 'cc-by-4.0' }, rights: [{ id: 'cc-by-nc-4.0', title: { en: 'Creative Commons Attribution Non Commercial 4.0 International' } }] })])).toContain(SEVERAL);
    expect(ids([zen({ license: { id: 'cc-by-4.0' }, rights: [{ id: 'cc-by-4.0', title: { en: 'Creative Commons Attribution 4.0 International' } }] })])).not.toContain(SEVERAL);
  });

  it('a licence for the metadata that the source labels (ISO metadataConstraints) is not a second licence', () => {
    const iso = parseIso19139(
      `<?xml version="1.0"?><md:MD_Metadata xmlns:md="http://www.isotc211.org/2005/gmd" xmlns:c="http://www.isotc211.org/2005/gco" xmlns:x="http://www.isotc211.org/2005/gmx" xmlns:l="http://www.w3.org/1999/xlink"><md:identificationInfo><md:MD_DataIdentification><md:citation><md:CI_Citation><md:title><c:CharacterString>Invented</c:CharacterString></md:title></md:CI_Citation></md:citation><md:resourceConstraints><md:MD_LegalConstraints><md:otherConstraints><x:Anchor l:href="${U('licenses/by/4.0')}">Creative Commons Attribution 4.0 International</x:Anchor></md:otherConstraints></md:MD_LegalConstraints></md:resourceConstraints></md:MD_DataIdentification></md:identificationInfo><md:metadataConstraints><md:MD_LegalConstraints><md:otherConstraints><x:Anchor l:href="${U('publicdomain/zero/1.0')}">CC0 1.0 Universal</x:Anchor></md:otherConstraints></md:MD_LegalConstraints></md:metadataConstraints></md:MD_Metadata>`,
      'iso-rec',
    );
    expect(ids([iso])).toEqual([]);
  });

  it('an entry that says in words that it is the metadata licence is one unrecognised entry (its own rule), never a second licence', () => {
    const got = ids([dc([BY, { rights: 'Metadata: CC0 1.0' }])]);
    expect(got).not.toContain(SEVERAL);
  });

  it('a Dataverse licence per file is labelled by the file: different file licences are not flagged', () => {
    const base = dc([BY, NCND]);
    const dv: MetadataRecord = { ...base, source: 'dataverse', licences: base.licences.map((l, i) => ({ ...l, source: 'dataverse', field: `files.license[${i}]` })) };
    expect(analyseLicences([dv]).contradictions).toEqual([]);
  });

  it('two different licences in two ISO fields stay LIC-MISMATCH only (no second finding for the same fact)', () => {
    const iso = parseIso19139(
      `<?xml version="1.0"?><md:MD_Metadata xmlns:md="http://www.isotc211.org/2005/gmd" xmlns:c="http://www.isotc211.org/2005/gco" xmlns:x="http://www.isotc211.org/2005/gmx" xmlns:l="http://www.w3.org/1999/xlink"><md:identificationInfo><md:MD_DataIdentification><md:citation><md:CI_Citation><md:title><c:CharacterString>Invented</c:CharacterString></md:title></md:CI_Citation></md:citation><md:resourceConstraints><md:MD_LegalConstraints><md:otherConstraints><x:Anchor l:href="${U('licenses/by/4.0')}">Creative Commons Attribution 4.0 International</x:Anchor></md:otherConstraints><md:otherConstraints><x:Anchor l:href="${U('licenses/by-nc-nd/4.0')}">Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International</x:Anchor></md:otherConstraints></md:MD_LegalConstraints></md:resourceConstraints></md:MD_DataIdentification></md:identificationInfo></md:MD_Metadata>`,
      'iso-rec',
    );
    const got = ids([iso]);
    expect(got).toContain('LIC-MISMATCH');
    expect(got).not.toContain(SEVERAL);
  });

  it('a second entry that is only a restriction is LIC-OTHER-RIGHTS-ENTRY, not a second licence', () => {
    const got = ids([dc([BY, { rights: 'Data may not be redistributed without consent' }])]);
    expect(got).toContain('LIC-OTHER-RIGHTS-ENTRY');
    expect(got).not.toContain(SEVERAL);
  });

  it('between sources one shared licence still suffices (no mismatch); the record that lists two is flagged once', () => {
    const a = dc([BY, NCND], '10.5281/zenodo.999999911', 'DataCite');
    const z = zen({ license: { id: 'cc-by-4.0' } }, 999999911);
    const got = ids([a, z]);
    expect(got.filter((x) => x === SEVERAL)).toHaveLength(1);
    expect(got).not.toContain('LIC-MISMATCH');
  });

  it('two sources listing the same pair are one warning, not two', () => {
    const a = dc([BY, NCND], '10.5281/zenodo.999999911', 'DataCite');
    const z = zen({ license: { id: 'cc-by-4.0' }, rights: [{ id: 'cc-by-nc-nd-4.0', title: { en: 'Creative Commons Attribution Non Commercial No Derivatives 4.0 International' } }] }, 999999911);
    expect(ids([a, z]).filter((x) => x === SEVERAL)).toHaveLength(1);
  });

  it('the finding has its text in four languages and the analysis carries the contradiction', () => {
    const f = run([dc([BY, NCND])]).find((x) => x.ruleId === SEVERAL)!;
    const texts = LANGS.map((l) => renderPlain(f, l));
    expect(new Set(texts).size).toBe(4);
    for (const t of texts) expect(t).toContain('CC-BY-NC-ND-4.0');
    expect(analyseLicences([dc([BY, NCND])]).contradictions.map((c) => c.kind)).toEqual(['several-licences']);
  });

  it('/convert and the attribution line read dual licensing as before', () => {
    const records = [dc([BY, NCND])];
    expect(licenceCaseOf(records).kind).toBe('other');
    expect(buildAttribution(analyseLicences(records)).omitted).toBe('several');
  });
});

describe('L6: the information line on what OBIS and GBIF accept', () => {
  const obis = (records: MetadataRecord[]): Finding[] => {
    const f = obisLicenceFinding(analyseLicences(records), 'rec');
    return f ? [f] : [];
  };

  it.each([
    ['CC0 1.0', CC0, 'CC0-1.0'],
    ['CC BY 4.0', BY, 'CC-BY-4.0'],
    ['CC BY-NC 4.0', { rights: 'Creative Commons Attribution-NonCommercial 4.0 International', rightsUri: U('licenses/by-nc/4.0'), rightsIdentifier: 'cc-by-nc-4.0' }, 'CC-BY-NC-4.0'],
  ])('%s: one information line saying it is accepted', (_n, r, id) => {
    const f = obis([dc([r])]);
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('info');
    expect(f[0].params).toMatchObject({ kind: 'accepted', licence: id });
    expect(renderPlain(f[0], 'en')).toContain(id);
  });

  it.each([
    ['CC BY-SA 4.0', { rights: 'Creative Commons Attribution-ShareAlike 4.0 International', rightsUri: U('licenses/by-sa/4.0'), rightsIdentifier: 'cc-by-sa-4.0' }, 'CC-BY-SA-4.0'],
    ['CC BY-NC-ND 4.0', NCND, 'CC-BY-NC-ND-4.0'],
    ['CC BY 3.0 (a version /convert does not take)', { rights: 'CC BY 3.0', rightsUri: U('licenses/by/3.0'), rightsIdentifier: 'cc-by-3.0' }, 'CC-BY-3.0'],
  ])('%s: one information line saying it is not accepted, naming what is', (_n, r, id) => {
    const f = obis([dc([r])]);
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('info');
    expect(f[0].params).toMatchObject({ kind: 'not-accepted', licence: id, accepts: LICENCES.join(', ') });
    const plain = renderPlain(f[0], 'en');
    for (const l of LICENCES) expect(plain).toContain(l);
    expect(run([dc([r])]).filter((x) => x.severity === 'warning' || x.severity === 'error').map((x) => x.ruleId)).toEqual([]);
    expect(run([dc([r])]).map((x) => x.ruleId)).not.toContain(OBIS);
  });

  it('shown once per dataset even when several sources state the licence', () => {
    const a = dc([BY], '10.5281/zenodo.999999911', 'DataCite');
    const z = zen({ license: { id: 'cc-by-4.0' } }, 999999911);
    expect(obis([a, z])).toHaveLength(1);
  });

  it('no line when no licence is recognised: missing, free text, a statement in conflict', () => {
    expect(obis([dc([])])).toEqual([]);
    expect(obis([dc([{ rights: 'All rights reserved' }])])).toEqual([]);
    expect(obis([dc([{ rights: 'CC BY 4.0, but not for commercial use' }])])).toEqual([]);
    expect(obis([dc([{ rights: 'CC BY 4.0', rightsUri: U('licenses/by-nc/4.0') }])])).toEqual([]);
  });

  it('no line when the record states two different licences (the warning comes first)', () => {
    expect(obis([dc([BY, NCND])])).toEqual([]);
  });

  it('/check and the collection review do not carry it: checkLicence never raises it', () => {
    for (const collection of [false, true]) expect(run([dc([BY])], { collection }).map((f) => f.ruleId)).not.toContain(OBIS);
  });

  it('is in four languages and never a warning', () => {
    const f = obis([dc([NCND])])[0];
    expect(new Set(LANGS.map((l) => renderPlain(f, l))).size).toBe(4);
  });

  it('reuses the list of /convert: the accepted ids are read from it, not written again', () => {
    for (const file of ['src/core/licence/obis.ts', 'src/core/rules/licence.ts']) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/'CC0-1\.0'|'CC-BY-4\.0'|'CC-BY-NC-4\.0'/);
    }
    expect(readFileSync('src/core/licence/obis.ts', 'utf8')).toMatch(/from '\.\.\/convert\/metadata'/);
  });
});
