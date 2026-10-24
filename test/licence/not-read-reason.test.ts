// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { notReadReasonKey } from '../../src/core/licence/failure';
import { translate } from '../../src/core/i18n/ui';
import { LANGS } from '../../src/core/types';

describe('the message for an unread gbif.org or obis.org link', () => {
  it('gbif.org: paste the dataset DOI', () => {
    const key = notReadReasonKey('https://www.gbif.org/dataset/b6a10f6d-2b0c-4a8b-8d2c-5d8a2d1d4e11');
    expect(key).toBe('licence.reason.notRead');
    expect(translate('en', key)).toContain("Paste the dataset's DOI instead");
  });

  it('obis.org: OBIS has no DOI, so the DOI of the same dataset published via GBIF or the IPT, in four languages', () => {
    for (const link of ['https://obis.org/dataset/b6a10f6d-2b0c-4a8b-8d2c-5d8a2d1d4e11', 'https://www.obis.org/dataset/x']) {
      const key = notReadReasonKey(link);
      expect(key).toBe('licence.reason.notReadObis');
      expect(translate('en', key)).toContain('OBIS datasets have no DOI');
      expect(translate('en', key)).toContain('IPT');
      for (const lang of LANGS) expect(translate(lang, key), lang).not.toBe(translate(lang, 'licence.reason.notRead'));
    }
  });

  it('a host that merely ends in obis.org text is not OBIS', () => {
    expect(notReadReasonKey('https://notobis.org/x')).toBe('licence.reason.notRead');
    expect(notReadReasonKey('not a url')).toBe('licence.reason.notRead');
  });
});
