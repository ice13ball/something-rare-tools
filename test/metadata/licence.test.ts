// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { isOpenLicence, isRestrictiveCode, RESTRICTIVE_CODES, toSpdx } from '../../src/core/metadata/licence';

describe('toSpdx', () => {
  it('returns undefined for versionless text (not machine-readable)', () => {
    for (const t of ['CC BY', 'CC-BY', 'cc by', 'CC BY-SA', 'CC-BY-NC', 'Creative Commons Attribution', 'CC BY 4', '', '   ']) {
      expect(toSpdx(t), t).toBeUndefined();
    }
    expect(toSpdx()).toBeUndefined();
  });

  it('normalises versioned text case-insensitively', () => {
    expect(toSpdx('cc-by-4.0')).toBe('CC-BY-4.0');
    expect(toSpdx('CC BY 4.0')).toBe('CC-BY-4.0');
    expect(toSpdx('CC-BY-4.0')).toBe('CC-BY-4.0');
    expect(toSpdx('  Cc By 3.0  ')).toBe('CC-BY-3.0');
    expect(toSpdx('CC BY-SA 4.0')).toBe('CC-BY-SA-4.0');
    expect(toSpdx('cc-by-nc-4.0')).toBe('CC-BY-NC-4.0');
    expect(toSpdx('CC BY-NC-SA 4.0')).toBe('CC-BY-NC-SA-4.0');
    expect(toSpdx('CC-BY-ND-4.0')).toBe('CC-BY-ND-4.0');
    expect(toSpdx('CC BY-NC-ND 2.5')).toBe('CC-BY-NC-ND-2.5');
  });

  it('finds the id inside a long name', () => {
    expect(toSpdx('Creative Commons Attribution 4.0 International (CC-BY-4.0)')).toBe('CC-BY-4.0');
    expect(toSpdx('Creative Commons Attribution 4.0 International (CC-BY-4.0) (URI: https://creativecommons.org/licenses/by/4.0/)')).toBe('CC-BY-4.0');
    expect(toSpdx('Creative Commons Attribution-ShareAlike 4.0 International')).toBe('CC-BY-SA-4.0');
    expect(toSpdx('Creative Commons Attribution-NonCommercial 4.0 International')).toBe('CC-BY-NC-4.0');
  });

  it('recognises creativecommons.org URIs in every common form', () => {
    const by = 'CC-BY-4.0';
    for (const u of [
      'https://creativecommons.org/licenses/by/4.0/',
      'https://creativecommons.org/licenses/by/4.0',
      'http://creativecommons.org/licenses/by/4.0/',
      'https://www.creativecommons.org/licenses/by/4.0/',
      'https://creativecommons.org/licenses/by/4.0/legalcode',
      'https://creativecommons.org/licenses/by/4.0/legalcode.pl',
      'https://creativecommons.org/licenses/by/4.0/deed.pl',
      'https://creativecommons.org/licenses/by/4.0/deed.en',
      'HTTPS://CreativeCommons.org/licenses/BY/4.0/',
      '  https://creativecommons.org/licenses/by/4.0/  ',
    ]) {
      expect(toSpdx(undefined, u), u).toBe(by);
    }
    expect(toSpdx(undefined, 'https://creativecommons.org/licenses/by-sa/4.0/legalcode')).toBe('CC-BY-SA-4.0');
    expect(toSpdx(undefined, 'https://creativecommons.org/licenses/by-nc/3.0/')).toBe('CC-BY-NC-3.0');
    expect(toSpdx(undefined, 'https://creativecommons.org/licenses/by-nc-sa/4.0/')).toBe('CC-BY-NC-SA-4.0');
    expect(toSpdx(undefined, 'https://creativecommons.org/licenses/by-nd/4.0/')).toBe('CC-BY-ND-4.0');
    expect(toSpdx(undefined, 'https://creativecommons.org/licenses/by-nc-nd/4.0/')).toBe('CC-BY-NC-ND-4.0');
    // 3.0/pl/ is a port (jurisdiction) SPDX has no id for: unrecognised, never the generic id (bug 22.10: 3)
    expect(toSpdx(undefined, 'https://creativecommons.org/licenses/by/3.0/pl/')).toBeUndefined();
  });

  it('recognises CC0 and ODbL', () => {
    expect(toSpdx(undefined, 'https://creativecommons.org/publicdomain/zero/1.0/')).toBe('CC0-1.0');
    expect(toSpdx(undefined, 'https://creativecommons.org/publicdomain/zero/1.0/legalcode')).toBe('CC0-1.0');
    expect(toSpdx('CC0')).toBe('CC0-1.0');
    expect(toSpdx('CC0 1.0')).toBe('CC0-1.0');
    expect(toSpdx('cc-zero')).toBe('CC0-1.0');
    expect(toSpdx('ODbL')).toBe('ODbL-1.0');
    expect(toSpdx(undefined, 'https://opendatacommons.org/licenses/odbl/1-0/')).toBe('ODbL-1.0');
  });

  it('lets a recognised URI win and falls back to text', () => {
    expect(toSpdx('Open Access', 'https://creativecommons.org/licenses/by/4.0/')).toBe('CC-BY-4.0');
    // a text that names no licence and says something else is a conflict with the link (round 4, point 1)
    expect(toSpdx('see licence', 'https://creativecommons.org/licenses/by/4.0/')).toBeUndefined();
    expect(toSpdx('CC BY 4.0', 'https://example.org/licence')).toBe('CC-BY-4.0');
    expect(toSpdx('CC BY', 'https://example.org/licence')).toBeUndefined();
  });

  it('does not match inside other words or invent ids', () => {
    expect(toSpdx('accc by 4.0')).toBeUndefined();
    expect(toSpdx('All rights reserved')).toBeUndefined();
    expect(toSpdx('copyright')).toBeUndefined();
    expect(toSpdx(undefined, 'https://example.org/licenses/by/4.0/')).toBeUndefined();
  });
});

describe('isOpenLicence', () => {
  it('is true for attribution / share-alike / CC0 / ODbL and false for NC, ND and unknown', () => {
    for (const s of ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC0-1.0', 'ODbL-1.0']) expect(isOpenLicence(s), s).toBe(true);
    for (const s of ['CC-BY-NC-4.0', 'CC-BY-ND-4.0', 'CC-BY-NC-SA-4.0', 'CC-BY-NC-ND-4.0', 'Proprietary']) expect(isOpenLicence(s), s).toBe(false);
    expect(isOpenLicence(undefined)).toBe(false);
  });
});

describe('restriction codes', () => {
  it('lists the restrictive codes and treats otherRestrictions as neutral', () => {
    expect(RESTRICTIVE_CODES).toContain('copyright');
    expect(RESTRICTIVE_CODES).toContain('otherRestrictions');
    expect(isRestrictiveCode('copyright')).toBe(true);
    expect(isRestrictiveCode('license')).toBe(true);
    expect(isRestrictiveCode('otherRestrictions')).toBe(false);
    expect(isRestrictiveCode('unrestricted')).toBe(false);
  });
});
