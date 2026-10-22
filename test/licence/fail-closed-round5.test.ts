// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Round 5 of the fail-closed licence classifier: (1) a copyright notice is a holder name of at most four words that ends at a boundary
// word; (2) a licence link is recognised only if it ends at the version / legalcode / deed / port, in the text AND in the URI field.
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import { buildStatement, classifyStatement, spdxFromUri } from '../../src/core/metadata/licence';
import type { MetadataRecord } from '../../src/core/types';
import { BY } from './round4-cases';
import { CC, LINK_FLAGS, NOTICE_FLAGS, NOTICE_STAYS, URI_FLAGS, URI_STAYS, type Flag } from './round5-cases';

const st = (text?: string, uri?: string) => buildStatement({ source: 'datacite', field: 'rightsList[0]', text, uri })!;
const rec = (text: string | undefined, uri?: string): MetadataRecord => ({ source: 'datacite', label: 'rec', licences: [st(text, uri)], restrictionCodes: [], distributionLinks: [] });
const lic = (text: string | undefined, uri?: string) => checkLicence([rec(text, uri)], { label: 'rec', inaccessible: false }).filter((f) => f.ruleId.startsWith('LIC-'));

function expectFlag([text, uri, left]: Flag): void {
  const s = st(text, uri);
  expect(classifyStatement(s), text).toEqual({ kind: 'unrecognised' });
  expect(s.spdx, text).toBeUndefined();
  const named = /cc by 4\.0|\bcc by\b/i.test(text) || /creativecommons\.org\/licenses\/by\/4\.0\/(?:,|\()/.test(text);
  if (!named && uri) {
    // the text names no licence (or only a link we cannot read) next to a licence link
    expect(s.conflict, text).toBe('text-uri');
    expect(lic(text, uri).map((f) => f.ruleId), text).toEqual(['LIC-TEXT-URI-CONFLICT']);
    return;
  }
  expect(['restricted', 'extra-text'], text).toContain(s.conflict);
  expect(s.leftover, text).toContain(left);
  const found = lic(text, uri);
  expect(['LIC-ADDED-CONDITIONS', 'LIC-EXTRA-TEXT'], text).toContain(found[0]?.ruleId);
  expect(found[0].params?.rest, text).toContain(left);
}

describe('round 5, point 1: the copyright holder is at most four words and ends at a boundary word', () => {
  it.each(NOTICE_FLAGS)('"%s" (%s)', (text, uri, left) => expectFlag([text, uri, left]));

  it.each(NOTICE_STAYS)('"%s" stays CC-BY-4.0', (text) => {
    for (const uri of [undefined, BY]) {
      const s = st(text, uri);
      expect(s.conflict, text).toBeUndefined();
      expect(s.leftover, text).toBeUndefined();
      expect(classifyStatement(s), text).toEqual({ kind: 'spdx', id: 'CC-BY-4.0' });
    }
  });

  it('the boundary word is leftover even when it is a filler word ("Use", "Licence")', () => {
    expect(st('CC BY 4.0 © Ocean Corp Use').leftover).toBe('Use');
    expect(st('CC BY 4.0 © Ocean Corp Licence').leftover).toBe('Licence');
  });

  it('the boundary list only delimits the notice: the same words elsewhere are no condition marker', () => {
    expect(st('CC BY 4.0, internal').conflict).toBe('extra-text');
    expect(st('CC BY 4.0, partners').conflict).toBe('extra-text');
  });
});

describe('round 5, point 2: a licence link is recognised only up to the version, legalcode, deed or port', () => {
  it.each(LINK_FLAGS)('"%s" (%s)', (text, uri, left) => expectFlag([text, uri, left]));

  it.each(URI_FLAGS)('URI field %s is not a recognised licence', (uri) => {
    expect(spdxFromUri(uri), uri).toBeUndefined();
    // alone: unrecognised; next to a text that names the licence: text against link
    const alone = st(undefined, uri);
    expect(classifyStatement(alone)).toEqual({ kind: 'unrecognised' });
    const withText = st('CC BY 4.0', uri);
    expect(withText.conflict, uri).toBe('text-uri');
    expect(withText.spdx).toBeUndefined();
    expect(lic('CC BY 4.0', uri).map((f) => f.ruleId), uri).toEqual(['LIC-TEXT-URI-CONFLICT']);
    // and next to "Open Access" it still is not an id
    expect(st('Open Access', uri).spdx).toBeUndefined();
  });

  it.each(URI_STAYS)('%s -> %s', (uri, id) => {
    expect(spdxFromUri(uri), uri).toBe(id);
    expect(st(undefined, uri).spdx, uri).toBe(id);
    // as a link inside the text, next to the name
    const name = id === 'CC0-1.0' ? 'CC0 1.0' : id === 'CC-BY-3.0-DE' ? 'CC BY 3.0 DE' : 'CC BY 4.0';
    const s = st(`${name} ${uri}`, uri);
    expect(s.conflict, uri).toBeUndefined();
    expect(s.leftover, uri).toBeUndefined();
    expect(s.spdx, uri).toBe(id);
  });

  it('the licence chooser suffix ?ref=chooser-v1 (and only that) is neutral, in the text and in the URI field', () => {
    expect(spdxFromUri(`${CC}by/4.0/?ref=chooser-v1`)).toBe('CC-BY-4.0');
    expect(spdxFromUri(`${CC}by/4.0?ref=chooser-v1`)).toBe('CC-BY-4.0');
    expect(st(`CC BY 4.0 ${CC}by/4.0/?ref=chooser-v1`).spdx).toBe('CC-BY-4.0');
    expect(st(`${CC}by/4.0/?ref=chooser-v1`, BY).spdx).toBe('CC-BY-4.0');
    expect(spdxFromUri(`${CC}by/4.0/?ref=chooser-v1&x=1`)).toBeUndefined();
    expect(spdxFromUri(`${CC}by/4.0/?x=1&ref=chooser-v1`)).toBeUndefined();
    expect(spdxFromUri(`${CC}by/4.0/?ref=chooser-v10`)).toBeUndefined();
  });

  it('a sentence with the link in brackets and a full stop still is CC-BY-4.0', () => {
    for (const uri of [undefined, BY]) {
      const s = st('This dataset is licensed under the Creative Commons Attribution 4.0 International licence (https://creativecommons.org/licenses/by/4.0/).', uri);
      expect(s.conflict).toBeUndefined();
      expect(s.spdx).toBe('CC-BY-4.0');
    }
  });

  it('other licence families: a query or a fragment makes the link unreadable too', () => {
    expect(spdxFromUri('https://opensource.org/licenses/MIT')).toBe('MIT');
    expect(spdxFromUri('https://opensource.org/licenses/MIT?use=nc')).toBeUndefined();
    expect(spdxFromUri('https://www.govdata.de/dl-de/by-2-0')).toBe('DL-DE-BY-2.0');
    expect(spdxFromUri('https://www.govdata.de/dl-de/by-2-0#nc')).toBeUndefined();
  });
});
