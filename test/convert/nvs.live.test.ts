// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// OPTIONAL live check of the real NERC Vocabulary Server, skipped unless NVS_LIVE=1 (the default suite makes no network call):
//   NVS_LIVE=1 npx vitest run test/convert/nvs.live.test.ts
// It sends only a typed word, like the page does, and checks that the answers still have the shape the hand-written fixtures have.
import { describe, expect, it } from 'vitest';
import { nvsConceptUrl, searchNvs } from '../../src/app/optins/nvs';
import { readConceptJsonLd } from '../../src/core/convert/nvs';
import { VARIABLE_VERIFIED_CODES } from '../../src/core/convert/vocab';

const live = process.env.NVS_LIVE === '1';

describe.skipIf(!live)('the live NVS service (NVS_LIVE=1)', () => {
  it('a search by label finds a concept the converter lists, current, in the P01 collection', async () => {
    const run = await searchNvs('Temperature of the water body', 'P01', { signal: new AbortController().signal });
    expect(run.failure).toBeUndefined();
    expect(run.via).toBe('search');
    const hit = run.concepts.find((c) => c.code === 'TEMPPR01');
    expect(hit).toMatchObject({ collection: 'P01', uri: 'http://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01/', label: 'Temperature of the water body', deprecated: false });
  }, 60_000);

  it('a search by code finds the concept, and a search of P06 finds a unit', async () => {
    const byCode = await searchNvs('TEMPPR01', 'P01', { signal: new AbortController().signal });
    expect(byCode.concepts.map((c) => c.code)).toContain('TEMPPR01');
    const unit = await searchNvs('Degrees Celsius', 'P06', { signal: new AbortController().signal });
    expect(unit.concepts.map((c) => c.code)).toContain('UPAA');
  }, 60_000);

  it('a hostile word is only a word: the service answers (no syntax error) and finds nothing', async () => {
    const run = await searchNvs('"} UNION { ?s ?p ?o } # \\u0022 \\', 'P01', { signal: new AbortController().signal });
    expect(run.failure).toBeUndefined();
    expect(run.concepts).toEqual([]);
  }, 60_000);

  it('every concept of the converter list is current (owl:deprecated false) at the concept page, with a plain GET that is not redirected', async () => {
    for (const entry of VARIABLE_VERIFIED_CODES.filter((c) => c.startsWith('P01/') || c.startsWith('P06/'))) {
      const [collection, code] = entry.split('/') as ['P01' | 'P06', string];
      const url = nvsConceptUrl(code, collection) as string;
      const res = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
      expect(res.status, entry).toBe(200);
      const concept = readConceptJsonLd(await res.json(), `http://vocab.nerc.ac.uk/collection/${collection}/current/${code}/`, collection);
      expect(concept, entry).toMatchObject({ code, deprecated: false });
    }
  }, 120_000);
});
