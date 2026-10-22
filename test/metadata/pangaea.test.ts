// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { parsePangaeaMetainfo } from '../../src/core/metadata/pangaea';
import { classifyStatement } from '../../src/core/metadata/licence';
import { fixture } from '../sources/mapFetcher';

const wrap = (inner: string): string => `<md:MetaData xmlns:md="http://www.pangaea.de/MetaData">${inner}</md:MetaData>`;
const lic = (label: string, name: string, uri: string): string => `<md:license id="l1"><md:label>${label}</md:label><md:name>${name}</md:name><md:URI>${uri}</md:URI></md:license>`;

describe('parsePangaeaMetainfo', () => {
  it('reads the licence, the citation and the DOI of a PANGAEA metadata record', () => {
    const r = parsePangaeaMetainfo(fixture('pangaea-metainfo-synthetic.xml'), 'PANGAEA 0');
    expect(r.source).toBe('pangaea');
    expect(r.title).toBe('Synthetic CTD profiles from a test cruise');
    expect(r.creators).toEqual(['Kowalska, Anna', 'Nowak, Jan']);
    expect(r.publicationYear).toBe(2019);
    expect(r.doi).toBe('10.1594/PANGAEA.000000');
    expect(r.publisher).toBe('PANGAEA');
    expect(r.licences).toHaveLength(1);
    expect(r.licences[0]).toMatchObject({
      source: 'pangaea',
      field: 'license',
      text: 'Creative Commons Attribution 3.0 Unported',
      uri: 'https://creativecommons.org/licenses/by/3.0/',
      spdx: 'CC-BY-3.0',
    });
    expect(r.licences[0].conflict).toBeUndefined();
  });

  it('the label is a second reading of the text: label, name and link must agree', () => {
    const r = parsePangaeaMetainfo(wrap(lic('CC-BY-NC-3.0', 'Creative Commons Attribution 3.0 Unported', 'https://creativecommons.org/licenses/by/3.0/')), 'x');
    expect(r.licences[0].conflict).toBe('text-uri');
    expect(classifyStatement(r.licences[0])).toEqual({ kind: 'unrecognised' });
  });

  it('a name and a link that disagree conflict; a licence outside the list is unrecognised without a conflict', () => {
    expect(parsePangaeaMetainfo(wrap(lic('CC-BY-3.0', 'Creative Commons Attribution 3.0 Unported', 'https://creativecommons.org/licenses/by-sa/3.0/')), 'x').licences[0].conflict).toBe('text-uri');
    const own = parsePangaeaMetainfo(wrap(lic('PANGAEA-X', 'Data access is restricted', '')), 'x').licences[0];
    expect(own.conflict).toBeUndefined();
    expect(classifyStatement(own)).toEqual({ kind: 'unrecognised' });
  });

  it('a label alone, several licences and no licence', () => {
    expect(parsePangaeaMetainfo(wrap('<md:license><md:label>CC0-1.0</md:label></md:license>'), 'x').licences[0]).toMatchObject({ text: 'CC0-1.0', spdx: 'CC0-1.0' });
    const two = parsePangaeaMetainfo(wrap(lic('CC-BY-4.0', 'Creative Commons Attribution 4.0 International', '') + lic('CC0-1.0', 'Creative Commons Zero v1.0 Universal', '')), 'x');
    expect(two.licences.map((l) => l.spdx)).toEqual(['CC-BY-4.0', 'CC0-1.0']);
    expect(parsePangaeaMetainfo(wrap(''), 'x').licences).toEqual([]);
  });

  it('refuses a document that is not PANGAEA metadata', () => {
    expect(() => parsePangaeaMetainfo('<html><body>sign in</body></html>', 'x')).toThrow(/not PANGAEA metadata/);
    expect(() => parsePangaeaMetainfo('<MetaData xmlns="urn:other"/>', 'x')).toThrow(/not PANGAEA metadata/);
  });
});
