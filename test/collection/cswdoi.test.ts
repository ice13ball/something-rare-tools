// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Which DOI the CSW adapter compares with DataCite: the record's OWN (its own citation identifier, or a doi.org dataSetURI), never one
// found in the lineage or another citation, which would file the findings of ANOTHER deposit under this catalogue record.
import { describe, expect, it } from 'vitest';
import { CollectionRunner } from '../../src/core/collection/runner';
import { CAPABILITIES, dataciteMock, gmdRecord, res, runnerDeps, searchResults, virtualClock } from './helpers';

const cs = (s: string): string => `<gco:CharacterString>${s}</gco:CharacterString>`;
const ident = (code: string): string => `<gmd:identifier><gmd:MD_Identifier><gmd:code>${cs(code)}</gmd:code></gmd:MD_Identifier></gmd:identifier>`;
const withTail = (rec: string, tail: string): string => rec.replace('</gmd:MD_Metadata>', `${tail}</gmd:MD_Metadata>`);
const lineage = (doi: string): string =>
  `<gmd:dataQualityInfo><gmd:DQ_DataQuality><gmd:lineage><gmd:LI_Lineage><gmd:source><gmd:LI_Source><gmd:sourceCitation><gmd:CI_Citation><gmd:title>${cs('Input data')}</gmd:title>${ident(`https://doi.org/${doi}`)}</gmd:CI_Citation></gmd:sourceCitation></gmd:LI_Source></gmd:source></gmd:LI_Lineage></gmd:lineage></gmd:DQ_DataQuality></gmd:dataQualityInfo>`;
const aggregate = (doi: string): string =>
  `<gmd:identificationInfo><gmd:MD_DataIdentification><gmd:aggregationInfo><gmd:MD_AggregateInformation><gmd:aggregateDataSetName><gmd:CI_Citation><gmd:title>${cs('Related')}</gmd:title>${ident(doi)}</gmd:CI_Citation></gmd:aggregateDataSetName></gmd:MD_AggregateInformation></gmd:aggregationInfo></gmd:MD_DataIdentification></gmd:identificationInfo>`;

const MDB = 'xmlns:mdb="http://standards.iso.org/iso/19115/-3/mdb/2.0" xmlns:cit="http://standards.iso.org/iso/19115/-3/cit/2.0" xmlns:mcc="http://standards.iso.org/iso/19115/-3/mcc/1.0" xmlns:mri="http://standards.iso.org/iso/19115/-3/mri/1.0" xmlns:mrl="http://standards.iso.org/iso/19115/-3/mrl/2.0" xmlns:gco="http://standards.iso.org/iso/19115/-3/gco/1.0"';
const iso3 = (id: string, own: string | null, lin: string): string =>
  `<mdb:MD_Metadata ${MDB}><mdb:metadataIdentifier><mcc:MD_Identifier><mcc:code>${cs(id)}</mcc:code></mcc:MD_Identifier></mdb:metadataIdentifier><mdb:identificationInfo><mri:MD_DataIdentification><mri:citation><cit:CI_Citation><cit:title>${cs('T')}</cit:title>${own ? `<cit:identifier><mcc:MD_Identifier><mcc:code>${cs(own)}</mcc:code></mcc:MD_Identifier></cit:identifier>` : ''}</cit:CI_Citation></mri:citation></mri:MD_DataIdentification></mdb:identificationInfo><mdb:resourceLineage><mrl:LI_Lineage><mrl:source><mrl:LI_Source><mrl:sourceCitation><cit:CI_Citation><cit:title>${cs('Input')}</cit:title><cit:identifier><mcc:MD_Identifier><mcc:code>${cs(`https://doi.org/${lin}`)}</mcc:code></mcc:MD_Identifier></cit:identifier></cit:CI_Citation></mrl:sourceCitation></mrl:LI_Source></mrl:source></mrl:LI_Lineage></mdb:resourceLineage></mdb:MD_Metadata>`;

async function idsAsked(recs: string[]) {
  const clock = virtualClock();
  const mock = dataciteMock({ total: 20, clock, other: { csw: async (c) => (c.op === 'GetCapabilities' ? res(200, CAPABILITIES) : res(200, searchResults(recs.length, recs.length, 0, recs))) } });
  const r = new CollectionRunner(runnerDeps(mock.net, clock));
  await r.start({ spec: { kind: 'csw', catalogue: 'emodnet', schema: 'iso19139', crossSource: true }, lang: 'en', sample: false });
  await r.whenIdle();
  const asked = mock.urls.filter((u) => u.includes('ids=')).flatMap((u) => (new URL(u).searchParams.get('ids') ?? '').split(',')).sort();
  return { asked, p: r.progress() };
}

describe('CSW cross-check: only the record\'s own DOI is compared', () => {
  it('a DOI that only the lineage names (the input data of another deposit) is not looked up, and the record is counted as "no DOI"', async () => {
    const { asked, p } = await idsAsked([withTail(gmdRecord({ id: 'cat-1', licence: 'CC BY 4.0' }), lineage('10.5555/r4'))]);
    expect(asked).toEqual([]);
    expect(p.status).toBe('finished');
    expect(p.counts.crossSource.looked).toBe(0);
    expect(p.counts.crossSource.noDoi).toBe(1);
    expect(p.counts.states.checked).toBe(1);
  });

  it('own citation identifier (19139), a doi.org dataSetURI, and a 19115-3 own citation ARE compared; lineage and other citations never', async () => {
    const own = withTail(gmdRecord({ id: 'own', licence: 'CC BY 4.0', doi: '10.5555/r1' }), lineage('10.5555/r9'));
    const other = withTail(gmdRecord({ id: 'other', licence: 'CC BY 4.0', doi: '10.5555/r2' }), aggregate('10.5555/r8'));
    const aggOnly = withTail(gmdRecord({ id: 'agg', licence: 'CC BY 4.0' }), aggregate('10.5555/r7'));
    const uri = withTail(gmdRecord({ id: 'uri', licence: 'CC BY 4.0' }), `<gmd:dataSetURI>${cs('https://doi.org/10.5555/r3')}</gmd:dataSetURI>`);
    const uriNotDoi = withTail(gmdRecord({ id: 'uri2', licence: 'CC BY 4.0' }), `<gmd:dataSetURI>${cs('https://example.org/see/10.5555/r6')}</gmd:dataSetURI>`);
    const { asked, p } = await idsAsked([own, other, aggOnly, uri, uriNotDoi, iso3('iso3', '10.5555/r5', '10.5555/r10'), iso3('iso3-lin', null, '10.5555/r11')]);
    expect(asked).toEqual(['10.5555/r1', '10.5555/r2', '10.5555/r3', '10.5555/r5']);
    expect(p.counts.crossSource).toMatchObject({ looked: 4, noDoi: 3 });
  });
});
