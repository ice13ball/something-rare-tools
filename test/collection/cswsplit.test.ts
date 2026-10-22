// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A CSW page is cut into records without a DOM of the whole page; anything unusual is left to the whole-page parse.
import { describe, expect, it } from 'vitest';
import { makeNetContext, realClock, type Net } from '../../src/core/collection/net';
import { cswPager } from '../../src/core/collection/sources/csw';
import { splitCswPage } from '../../src/core/collection/sources/cswsplit';
import { gmdRecord, searchResults } from './helpers';

const recs = (n: number, over: (i: number) => Partial<Parameters<typeof gmdRecord>[0]> = () => ({})): string[] =>
  Array.from({ length: n }, (_, i) => gmdRecord({ id: `id-${i}`, licence: i % 2 ? null : 'CC BY 4.0', doi: i % 3 === 0 ? `10.5555/r${i}` : undefined, ...over(i) }));

async function read(text: string) {
  const net = { csw: async () => ({ status: 200, text }), get: async () => { throw new Error('no'); } } as unknown as Net;
  const nctx = makeNetContext(realClock, { requests: 0, retries: 0, throttleEvents: 0 }, undefined, {});
  const pager = cswPager({ net, nctx }, { catalogue: 'emodnet', schema: 'iso19139', crossSource: false }, { matched: 100 });
  return pager.fetch({ pos: 1, seen: 0 });
}

describe('splitCswPage', () => {
  it('cuts a page into its records and reads nextRecord', () => {
    const page = searchResults(100, 5, 6, recs(5));
    const s = splitCswPage(page)!;
    expect(s.records).toHaveLength(5);
    expect(s.nextRecord).toBe(6);
    expect(s.records[2]).toContain('id-2');
  });

  it('writes the namespaces a record inherits from the root onto its start tag (a catalogue that declares them once)', async () => {
    const inner = (id: string) => `<gmd:MD_Metadata><gmd:fileIdentifier><gco:CharacterString>${id}</gco:CharacterString></gmd:fileIdentifier><gmd:identificationInfo><gmd:MD_DataIdentification><gmd:resourceConstraints><gmd:MD_LegalConstraints><gmd:useLimitation><gco:CharacterString>CC BY 4.0</gco:CharacterString></gmd:useLimitation></gmd:MD_LegalConstraints></gmd:resourceConstraints></gmd:MD_DataIdentification></gmd:identificationInfo></gmd:MD_Metadata>`;
    const page = `<?xml version="1.0"?><csw:GetRecordsResponse xmlns:csw="http://www.opengis.net/cat/csw/2.0.2" xmlns:gmd="http://www.isotc211.org/2005/gmd" xmlns:gco="http://www.isotc211.org/2005/gco"><csw:SearchResults numberOfRecordsMatched="2" numberOfRecordsReturned="2" nextRecord="0">${inner('a')}${inner('b')}</csw:SearchResults></csw:GetRecordsResponse>`;
    const s = splitCswPage(page)!;
    expect(s.records).toHaveLength(2);
    const got = await read(page);
    expect(got.items.map((i) => [i.ref, i.state])).toEqual([['a', 'checked'], ['b', 'checked']]);
    expect(got.items[0].records[0].licences.length).toBeGreaterThan(0);
  });

  it('gives the same items as the whole-page parse (a page that is not cut, because a record sits inside a wrapper)', async () => {
    const cut = searchResults(100, 6, 7, recs(6));
    const wrapped = cut.replace('<gmd:MD_Metadata ', '<csw:Record><gmd:MD_Metadata ').replace('</gmd:MD_Metadata>', '</gmd:MD_Metadata></csw:Record>');
    expect(splitCswPage(wrapped)).toBeNull();
    const a = await read(cut);
    const b = await read(wrapped);
    expect(a.items.length).toBe(6);
    expect(b.items.length).toBe(6);
    expect(a.items.slice(1)).toEqual(b.items.slice(1));
    expect(b.items[0].state).toBe('unsupported-profile');
  });

  it('does not cut what it does not fully recognise: exception reports, truncated answers, text where a record should be, nested records, other root', () => {
    expect(splitCswPage('<?xml version="1.0"?><ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows"><ows:Exception/></ows:ExceptionReport>')).toBeNull();
    const page = searchResults(100, 3, 4, recs(3));
    expect(splitCswPage(page.slice(0, page.length - 40))).toBeNull(); // cut off in the middle
    expect(splitCswPage(page.replace('</csw:SearchResults>', 'Cannot disseminate schema</csw:SearchResults>'))).toBeNull();
    expect(splitCswPage(page.replace(/<gmd:MD_Metadata /, '<gmd:MD_Metadata ').replace('<gmd:fileIdentifier>', '<gmd:MD_Metadata><gmd:fileIdentifier>'))).toBeNull();
    expect(splitCswPage(page.replace('GetRecordsResponse', 'Other').replace('GetRecordsResponse', 'Other'))).toBeNull();
    expect(splitCswPage('<html>queue full</html>')).toBeNull();
  });

  it('a truncated page is still "not XML" for the run (deferred), as before', async () => {
    const page = searchResults(100, 3, 4, recs(3));
    await expect(read(page.slice(0, page.length - 40))).rejects.toMatchObject({ kind: 'unreachable', reason: 'not-xml' });
  });

  it('a record whose text holds its own closing tag in CDATA is not cut wrongly: the page falls back to the whole parse and reads it', async () => {
    const tricky = gmdRecord({ id: 'tricky', licence: 'x]]></gmd:MD_Metadata>' }).replace('x]]></gmd:MD_Metadata>', '<![CDATA[see </gmd:MD_Metadata> in text]]>');
    const page = searchResults(100, 2, 3, [tricky, ...recs(1)]);
    const got = await read(page);
    expect(got.items.map((i) => i.ref)).toEqual(['tricky', 'id-0']);
    expect(got.items.every((i) => i.state === 'checked')).toBe(true);
  });

  it('an empty SearchResults has no records', () => {
    const empty = `<csw:GetRecordsResponse xmlns:csw="http://www.opengis.net/cat/csw/2.0.2"><csw:SearchResults numberOfRecordsMatched="0" numberOfRecordsReturned="0" nextRecord="0"/></csw:GetRecordsResponse>`;
    expect(splitCswPage(empty)).toEqual({ nextRecord: 0, records: [] });
  });
});
