// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A GBIF dataset DOI (10.15468/…) is a DOI like any other: /licence and /collection keep it, DataCite stays a metadata source.
import { describe, expect, it } from 'vitest';
import { scanBatch } from '../../src/core/collection/sources/dois';
import { loadLicenceReferences } from '../../src/core/licence/load';
import { MapFetcher } from './mapFetcher';

const KEY = 'dc5abc9f-84d5-4046-a3ef-9ab24ae53756';
const DOI = '10.15468/6v6ug8';
const json = (v: unknown) => ({ body: JSON.stringify(v) });

describe('GBIF DOI on /licence', () => {
  it('shows the DataCite licence and makes the DataCite request', async () => {
    const f = new MapFetcher({
      [`https://api.datacite.org/dois/${DOI}`]: json({ data: { attributes: { doi: DOI, url: `https://www.gbif.org/dataset/${KEY}`, titles: [{ title: 'T' }], rightsList: [{ rightsIdentifier: 'cc-by-4.0' }] } } }),
      [`https://api.gbif.org/v1/dataset/${KEY}/endpoint`]: json([{ type: 'DWC_ARCHIVE', url: 'https://ipt.vliz.be/x/archive.do?r=s' }]),
    });
    const out = await loadLicenceReferences([DOI], f);
    expect(f.calls[0]).toBe(`https://api.datacite.org/dois/${DOI}`);
    expect(out.failures).toEqual([]);
    const dc = out.records.find((r) => r.source === 'datacite');
    expect(dc?.licences[0]?.spdx).toBe('CC-BY-4.0');
  });
});

describe('GBIF DOI on /collection', () => {
  it('is a valid DOI, not counted invalid', () => {
    const b = scanBatch(`${DOI}\n10.5281/zenodo.23541397`, 0);
    expect(b.dois).toEqual([DOI, '10.5281/zenodo.23541397']);
    expect(b.invalid).toBe(0);
  });
});
