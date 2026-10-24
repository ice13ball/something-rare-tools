// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { analyseLicences } from '../../src/core/licence/analyse';
import { buildAttribution } from '../../src/core/licence/attribution';
import { loadLicenceReferences } from '../../src/core/licence/load';
import { MapFetcher } from '../sources/mapFetcher';

describe('gbif.org and obis.org links are not read for licences', () => {
  const links = ['https://www.gbif.org/dataset/b6a10f6d-2b0c-4a8b-8d2c-5d8a2d1d4e11', 'https://obis.org/dataset/b6a10f6d-2b0c-4a8b-8d2c-5d8a2d1d4e11'];
  for (const link of links) {
    it(`${link}: an unread source, no request, licence left out of the attribution`, async () => {
      const f = new MapFetcher({});
      const load = await loadLicenceReferences([link], f);
      expect(f.calls).toEqual([]);
      expect(load.records).toEqual([]);
      expect(load.failures).toEqual([{ ref: link, reason: 'not-read' }]);
      const a = analyseLicences(load.records, { inaccessible: load.failures.some((x) => !x.source) });
      expect(a.missing).toBe(false);
      expect(a.hasUnreadable).toBe(true);
      expect(buildAttribution(a).omitted).toBe('unreadable');
    });
  }
});
