// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Synthetic records for the licence page tests: DataCite JSON, Zenodo JSON, ISO 19139 XML, and the URLs they are served under.
import { MapFetcher, type Reply } from '../sources/mapFetcher';

export const DC = 'https://api.datacite.org/dois/';
export const ZEN = 'https://zenodo.org/api/records/';
export const GN = (uuid: string): string => `https://geonetwork.iopan.pl/geonetwork/srv/api/records/${uuid}/formatters/xml`;
export const UUID = '11111111-2222-3333-4444-555555555555';

export interface Rights {
  rights?: string;
  rightsUri?: string;
  rightsIdentifier?: string;
}
export interface Cite {
  doi: string;
  title?: string;
  creators?: string[];
  year?: number;
  publisher?: string;
  url?: string;
}

export const dataciteJson = (c: Cite, rightsList?: Rights[]): Reply => ({
  body: JSON.stringify({
    data: {
      id: c.doi,
      attributes: {
        doi: c.doi,
        url: c.url,
        titles: c.title ? [{ title: c.title }] : [],
        creators: (c.creators ?? []).map((name) => ({ name })),
        publicationYear: c.year,
        publisher: c.publisher,
        ...(rightsList ? { rightsList } : {}),
      },
    },
  }),
});

export const zenodoJson = (id: string, c: Cite, license?: { id: string }): Reply => ({
  body: JSON.stringify({
    id: Number(id),
    doi: c.doi,
    links: { self_html: `https://zenodo.org/records/${id}` },
    metadata: {
      title: c.title,
      creators: (c.creators ?? []).map((name) => ({ name })),
      publication_date: c.year ? `${c.year}-03-01` : undefined,
      publisher: c.publisher,
      ...(license ? { license } : {}),
    },
    files: [],
  }),
});

/** ISO 19139 with one otherConstraints Anchor (text + link) and an author / publisher / publication year. */
export const isoXml = (o: { text: string; href: string; title: string; author: string; year: number }): Reply => ({
  body: `<?xml version="1.0" encoding="UTF-8"?>
<md:MD_Metadata xmlns:md="http://www.isotc211.org/2005/gmd" xmlns:c="http://www.isotc211.org/2005/gco" xmlns:x="http://www.isotc211.org/2005/gmx" xmlns:l="http://www.w3.org/1999/xlink">
  <md:identificationInfo><md:MD_DataIdentification>
    <md:citation><md:CI_Citation>
      <md:title><c:CharacterString>${o.title}</c:CharacterString></md:title>
      <md:date><md:CI_Date><md:date><c:Date>${o.year}-02-01</c:Date></md:date><md:dateType><md:CI_DateTypeCode codeListValue="publication"/></md:dateType></md:CI_Date></md:date>
      <md:citedResponsibleParty><md:CI_ResponsibleParty>
        <md:individualName><c:CharacterString>${o.author}</c:CharacterString></md:individualName>
        <md:role><md:CI_RoleCode codeListValue="author"/></md:role>
      </md:CI_ResponsibleParty></md:citedResponsibleParty>
    </md:CI_Citation></md:citation>
    <md:resourceConstraints><md:MD_LegalConstraints>
      <md:otherConstraints><x:Anchor l:href="${o.href}">${o.text}</x:Anchor></md:otherConstraints>
    </md:MD_LegalConstraints></md:resourceConstraints>
  </md:MD_DataIdentification></md:identificationInfo>
</md:MD_Metadata>`,
});

const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';
const CITE_A: Cite = {
  doi: '10.0000/synthetic.a',
  title: 'Synthetic CTD profiles from a test cruise',
  creators: ['Kowalska, Anna', 'Nowak, Jan'],
  year: 2024,
  publisher: 'Example Data Repository',
  url: `https://geonetwork.iopan.pl/geonetwork/srv/api/records/${UUID}`,
};

/** A: ISO (CC BY 4.0 text + CC BY 4.0 link) and DataCite (CC BY 4.0) agree. The DOI leads to the GeoNetwork record. */
export function caseA(): { refs: string[]; fetcher: MapFetcher } {
  return {
    refs: [CITE_A.doi],
    fetcher: new MapFetcher({
      [DC + CITE_A.doi]: dataciteJson(CITE_A, [
        { rights: 'Creative Commons Attribution 4.0 International', rightsUri: 'https://creativecommons.org/licenses/by/4.0/legalcode', rightsIdentifier: 'cc-by-4.0' },
      ]),
      [GN(UUID)]: isoXml({ text: 'CC BY 4.0', href: CC_BY, title: CITE_A.title!, author: 'Kowalska, Anna', year: 2024 }),
    }),
  };
}

/** B: the DataCite statement's text names CC BY-NC 4.0, its link names CC BY 4.0. */
export function caseB(): { refs: string[]; fetcher: MapFetcher } {
  const c: Cite = { doi: '10.0000/synthetic.b', title: 'Synthetic mooring temperature series', creators: ['Smith, Alex'], year: 2023, publisher: 'Example Data Repository', url: 'https://repository.example.org/b' };
  return { refs: [c.doi], fetcher: new MapFetcher({ [DC + c.doi]: dataciteJson(c, [{ rights: 'CC BY-NC 4.0', rightsUri: CC_BY }]) }) };
}

/** C: one Zenodo record with licence id cc-by-4.0; its DataCite record is not served (404). */
export function caseC(): { refs: string[]; fetcher: MapFetcher } {
  const c: Cite = { doi: '10.5281/zenodo.3000001', title: 'Synthetic plankton counts', creators: ['Dupont, Marie'], year: 2022, publisher: 'Zenodo' };
  return { refs: ['https://zenodo.org/records/3000001'], fetcher: new MapFetcher({ [ZEN + '3000001']: zenodoJson('3000001', c, { id: 'cc-by-4.0' }) }) };
}
