// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Synthetic metadata files for the /convert stage-3 tests: DataCite XML and JSON, Zenodo JSON, ISO 19139 XML. Everything is invented (people, titles,
// DOIs, places); no real record is copied. Each builder returns the text of a file as a user would drop it.

export type LicenceKey = 'CC0-1.0' | 'CC-BY-4.0' | 'CC-BY-NC-4.0' | 'CC-BY-3.0' | 'CC-BY-SA-4.0';

const RIGHTS: Record<LicenceKey, { uri: string; text: string; zenodo: string }> = {
  'CC0-1.0': { uri: 'https://creativecommons.org/publicdomain/zero/1.0/legalcode', text: 'CC0 1.0 Universal', zenodo: 'cc0-1.0' },
  'CC-BY-4.0': { uri: 'https://creativecommons.org/licenses/by/4.0/legalcode', text: 'Creative Commons Attribution 4.0 International', zenodo: 'cc-by-4.0' },
  'CC-BY-NC-4.0': { uri: 'https://creativecommons.org/licenses/by-nc/4.0/legalcode', text: 'Creative Commons Attribution Non Commercial 4.0 International', zenodo: 'cc-by-nc-4.0' },
  'CC-BY-3.0': { uri: 'https://creativecommons.org/licenses/by/3.0/legalcode', text: 'Creative Commons Attribution 3.0 Unported', zenodo: 'cc-by-3.0' },
  'CC-BY-SA-4.0': { uri: 'https://creativecommons.org/licenses/by-sa/4.0/legalcode', text: 'Creative Commons Attribution Share Alike 4.0 International', zenodo: 'cc-by-sa-4.0' },
};

export interface MetaOpts {
  title?: string;
  abstract?: string;
  creators?: string[];
  contacts?: string[];
  /** The licence the record states; absent = the record states none. */
  licence?: LicenceKey;
  publisher?: string;
  year?: number;
  doi?: string;
  /** Collected dates, "start/end". */
  collected?: string;
  box?: { west: number; east: number; south: number; north: number };
  /** Extra rights entries, as the text of a <rights> element (an access note such as "Open Access", with an optional rightsURI). */
  extraRights?: { text: string; uri?: string }[];
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const BASE: Required<Pick<MetaOpts, 'title' | 'abstract' | 'creators' | 'publisher' | 'year' | 'doi'>> = {
  title: 'Synthetic zooplankton counts, Test Bay 2019',
  abstract: 'Invented counts of zooplankton from a made-up bay; every value in this record is synthetic.',
  creators: ['Example, Anna', 'Sample, Boris'],
  publisher: 'Example Marine Laboratory',
  year: 2020,
  doi: '10.0000/synthetic.convert.1',
};

export function dataciteXml(o: MetaOpts = {}): string {
  const m = { ...BASE, ...o };
  const lic = o.licence ? RIGHTS[o.licence] : undefined;
  return `<?xml version="1.0" encoding="UTF-8"?>
<resource xmlns="http://datacite.org/schema/kernel-4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://datacite.org/schema/kernel-4 http://schema.datacite.org/meta/kernel-4/metadata.xsd">
  <identifier identifierType="DOI">${esc(m.doi)}</identifier>
  <creators>
${m.creators.map((c) => `    <creator><creatorName nameType="Personal">${esc(c)}</creatorName></creator>`).join('\n')}
  </creators>
  <titles><title xml:lang="en">${esc(m.title)}</title></titles>
  <publisher>${esc(m.publisher)}</publisher>
  <publicationYear>${m.year}</publicationYear>
  <resourceType resourceTypeGeneral="Dataset">Dataset</resourceType>
${o.contacts ? `  <contributors>\n${o.contacts.map((c) => `    <contributor contributorType="ContactPerson"><contributorName>${esc(c)}</contributorName></contributor>`).join('\n')}\n  </contributors>\n` : ''}${lic || o.extraRights ? `  <rightsList>\n${lic ? `    <rights xml:lang="en" rightsURI="${lic.uri}" rightsIdentifier="${o.licence}" rightsIdentifierScheme="SPDX" schemeURI="https://spdx.org/licenses/">${lic.text}</rights>\n` : ''}${(o.extraRights ?? []).map((r) => `    <rights${r.uri ? ` rightsURI="${esc(r.uri)}"` : ''}>${esc(r.text)}</rights>\n`).join('')}  </rightsList>\n` : ''}  <descriptions><description xml:lang="en" descriptionType="Abstract">${esc(m.abstract)}</description></descriptions>
${o.collected ? `  <dates><date dateType="Collected">${o.collected}</date></dates>\n` : ''}${o.box ? `  <geoLocations><geoLocation><geoLocationBox><westBoundLongitude>${o.box.west}</westBoundLongitude><eastBoundLongitude>${o.box.east}</eastBoundLongitude><southBoundLatitude>${o.box.south}</southBoundLatitude><northBoundLatitude>${o.box.north}</northBoundLatitude></geoLocationBox></geoLocation></geoLocations>\n` : ''}</resource>
`;
}

export function dataciteJson(o: MetaOpts = {}): string {
  const m = { ...BASE, ...o };
  const lic = o.licence ? RIGHTS[o.licence] : undefined;
  return JSON.stringify(
    {
      data: {
        id: m.doi,
        attributes: {
          doi: m.doi,
          titles: [{ title: m.title }],
          creators: m.creators.map((name) => ({ name, nameType: 'Personal' })),
          publisher: m.publisher,
          publicationYear: m.year,
          descriptions: [{ description: m.abstract, descriptionType: 'Abstract' }],
          ...(o.contacts ? { contributors: o.contacts.map((name) => ({ name, contributorType: 'ContactPerson' })) } : {}),
          ...(lic ? { rightsList: [{ rights: lic.text, rightsUri: lic.uri, rightsIdentifier: o.licence }] } : {}),
        },
      },
    },
    null,
    2,
  );
}

export function zenodoJson(o: MetaOpts & { rawDescription?: string } = {}): string {
  const m = { ...BASE, ...o };
  const lic = o.licence ? RIGHTS[o.licence] : undefined;
  return JSON.stringify(
    {
      id: 1000099,
      doi: m.doi,
      links: { self_html: 'https://zenodo.org/records/1000099' },
      metadata: {
        title: m.title,
        description: o.rawDescription ?? m.abstract,
        publication_date: `${m.year}-03-01`,
        creators: m.creators.map((name) => ({ name })),
        ...(o.contacts ? { contributors: o.contacts.map((name) => ({ name, type: 'ContactPerson' })) } : {}),
        ...(lic ? { license: { id: lic.zenodo } } : {}),
      },
      files: [],
    },
    null,
    2,
  );
}

export interface IsoOpts {
  title?: string;
  abstract?: string;
  /** A licence stated as free text (useLimitation). */
  freeText?: string;
  contactName?: string;
  email?: string;
  author?: string;
  /** Further constraints, each as <useLimitation> or <otherConstraints> with its text. */
  constraints?: { kind: 'useLimitation' | 'otherConstraints'; text: string }[];
  /** Several points of contact (instead of contactName / email). */
  contacts?: { name?: string; email?: string }[];
}

export function isoXml(o: IsoOpts = {}): string {
  const title = o.title ?? 'Invented bay survey, free-text licence';
  return `<?xml version="1.0" encoding="UTF-8"?>
<gmd:MD_Metadata xmlns:gmd="http://www.isotc211.org/2005/gmd" xmlns:gco="http://www.isotc211.org/2005/gco" xmlns:gmx="http://www.isotc211.org/2005/gmx" xmlns:gml="http://www.opengis.net/gml">
  <gmd:identificationInfo>
    <gmd:MD_DataIdentification>
      <gmd:citation>
        <gmd:CI_Citation>
          <gmd:title><gco:CharacterString>${esc(title)}</gco:CharacterString></gmd:title>
${o.author ? `          <gmd:citedResponsibleParty><gmd:CI_ResponsibleParty><gmd:individualName><gco:CharacterString>${esc(o.author)}</gco:CharacterString></gmd:individualName><gmd:role><gmd:CI_RoleCode codeList="x" codeListValue="author"/></gmd:role></gmd:CI_ResponsibleParty></gmd:citedResponsibleParty>\n` : ''}        </gmd:CI_Citation>
      </gmd:citation>
      <gmd:abstract><gco:CharacterString>${esc(o.abstract ?? 'Invented abstract of an ISO record.')}</gco:CharacterString></gmd:abstract>
${(o.contacts ?? (o.contactName || o.email ? [{ name: o.contactName, email: o.email }] : [])).map((c) => `      <gmd:pointOfContact><gmd:CI_ResponsibleParty>${c.name ? `<gmd:individualName><gco:CharacterString>${esc(c.name)}</gco:CharacterString></gmd:individualName>` : ''}${c.email ? `<gmd:contactInfo><gmd:CI_Contact><gmd:address><gmd:CI_Address><gmd:electronicMailAddress><gco:CharacterString>${esc(c.email)}</gco:CharacterString></gmd:electronicMailAddress></gmd:CI_Address></gmd:address></gmd:CI_Contact></gmd:contactInfo>` : ''}<gmd:role><gmd:CI_RoleCode codeList="x" codeListValue="pointOfContact"/></gmd:role></gmd:CI_ResponsibleParty></gmd:pointOfContact>\n`).join('')}${o.freeText ? `      <gmd:resourceConstraints><gmd:MD_Constraints><gmd:useLimitation><gco:CharacterString>${esc(o.freeText)}</gco:CharacterString></gmd:useLimitation></gmd:MD_Constraints></gmd:resourceConstraints>\n` : ''}${(o.constraints ?? []).map((c) => `      <gmd:resourceConstraints><gmd:MD_Constraints><gmd:${c.kind}><gco:CharacterString>${esc(c.text)}</gco:CharacterString></gmd:${c.kind}></gmd:MD_Constraints></gmd:resourceConstraints>\n`).join('')}    </gmd:MD_DataIdentification>
  </gmd:identificationInfo>
</gmd:MD_Metadata>
`;
}

/** A DataCite XML and a Zenodo JSON that contradict each other: CC BY 4.0 against CC0 for what is the same title and creators. */
export const CONTRADICTING = { datacite: dataciteXml({ licence: 'CC-BY-4.0' }), zenodo: zenodoJson({ licence: 'CC0-1.0', doi: '10.0000/synthetic.convert.2' }) };
