// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Round 6 (stage 1b edges): (a) licence-link tails: no port from 4.0 on, ports below 4.0 only with an SPDX id, a strict deed language tag;
// (b) more boundary words for the copyright notice; (c) "Public Domain" wording is neutral only next to a CC0 / Public Domain Mark link.
import { describe, expect, it } from 'vitest';
import { buildStatement, classifyStatement, spdxFromUri } from '../../src/core/metadata/licence';
import { BY } from './round4-cases';

const CC = 'https://creativecommons.org/licenses/';
const st = (text?: string, uri?: string) => buildStatement({ source: 'datacite', field: 'rightsList[0]', text, uri })!;
const cls = (text?: string, uri?: string) => classifyStatement(st(text, uri));
const UNREC = { kind: 'unrecognised' };

describe('round 6a: licence-link tails', () => {
  const NOT_RECOGNISED = [
    'by/4.0/nc/', 'by/4.0/nd', 'by/4.0/edu/', 'by/4.0/pl/', 'by/4.0/de/', 'by-nc/4.0/de/',
    'by/4.0/deed.en-nc', 'by/4.0/deed.en-nd', 'by/4.0/deed.en-sa', 'by/4.0/legalcode.en-noncommercial', 'by/4.0/deed.nc', 'by/4.0/deed.nd',
    'by/3.0/pl/', // a port SPDX has no id for: unrecognised, never the generic id
    'by/3.0/nc/',
  ];
  it.each(NOT_RECOGNISED)('%s is not a recognised licence (URI field)', (tail) => {
    expect(spdxFromUri(CC + tail)).toBeUndefined();
    expect(cls(undefined, CC + tail)).toEqual(UNREC);
  });
  it.each(NOT_RECOGNISED)('%s is not a recognised licence (link in a text)', (tail) => {
    for (const text of [`Licensed under ${CC}${tail}`, `${CC}${tail}`, `CC BY 4.0 ${CC}${tail}`]) {
      expect(cls(text), text).toEqual(UNREC);
    }
  });
  it('a 4.0 link with a trailing segment leaves the link as leftover in a text', () => {
    expect(st(`CC BY 4.0, ${CC}by/4.0/nc/`).leftover).toContain('by/4.0/nc');
  });
  it('by/3.0/pl/ stays the unmapped port it is today (not CC-BY-3.0)', () => {
    expect(st(undefined, `${CC}by/3.0/pl/`).spdx).toBeUndefined();
    expect(st(undefined, `${CC}by/3.0/pl/`).conflict).toBeUndefined();
  });

  const RECOGNISED: [string, string][] = [
    ['by/4.0/', 'CC-BY-4.0'], ['by/4.0/deed.en', 'CC-BY-4.0'], ['by/4.0/deed.pl', 'CC-BY-4.0'], ['by/4.0/deed.zh-hans', 'CC-BY-4.0'],
    ['by/4.0/deed.en_GB', 'CC-BY-4.0'], ['by/4.0/deed.EN', 'CC-BY-4.0'], ['by/4.0/legalcode.de', 'CC-BY-4.0'], ['by/4.0/legalcode', 'CC-BY-4.0'],
    ['by/4.0/?ref=chooser-v1', 'CC-BY-4.0'], ['by/3.0/de/', 'CC-BY-3.0-DE'], ['by/3.0/igo/', 'CC-BY-3.0-IGO'], ['by/3.0/de/legalcode', 'CC-BY-3.0-DE'],
    ['by/2.5/au/', 'CC-BY-2.5-AU'], ['by/3.0/deed.pl', 'CC-BY-3.0'],
  ];
  it.each(RECOGNISED)('%s stays %s (URI field and text)', (tail, id) => {
    expect(spdxFromUri(CC + tail)).toBe(id);
    expect(cls(undefined, CC + tail)).toEqual({ kind: 'spdx', id });
    expect(cls(`Licensed under ${CC}${tail}`)).toEqual({ kind: 'spdx', id });
  });
});

describe('round 6b: more boundary words end a copyright notice', () => {
  const BAD = [
    '© GEOMAR Registrierung', '© GEOMAR Zustimmung', '© GEOMAR Kosten', '© GEOMAR Nutzungsbedingungen Beachten', '© Ocean Corp Subscription Needed',
    '© Ocean Corp Subscribers', '© Ocean Corp Usage Charges', '© Ocean Corp Licensed Users', '© Ifremer Usage Interne', '© Instytut Do Użytku Wewnętrznego',
  ];
  it.each(BAD)('"%s" is check manually (alone with a by/4.0 link, and with the name before / after)', (t) => {
    for (const [text, uri] of [[t, BY], [`CC BY 4.0 ${t}`, undefined], [`${t}. CC BY 4.0`, undefined], [`CC BY 4.0, ${t}`, BY]] as const) {
      const s = st(text, uri);
      expect(classifyStatement(s), text).toEqual(UNREC);
      expect(s.spdx, text).toBeUndefined();
    }
    const s = st(`CC BY 4.0 ${t}`);
    expect(s.conflict).toBe('extra-text');
    expect(s.leftover).toBeTruthy();
  });
  it.each(['© IFREMER SEANOE', '© The Authors', '(c) 2019-2021 Ocean Data Ltd.', '© 2021 Instytut Przykładowy sp. z o.o.', '(c) 2019 Beispiel GmbH'])(
    '"%s" stays CC-BY-4.0',
    (t) => {
      expect(cls(`CC BY 4.0 ${t}`)).toEqual({ kind: 'spdx', id: 'CC-BY-4.0' });
      expect(cls(`${t}. CC BY 4.0`)).toEqual({ kind: 'spdx', id: 'CC-BY-4.0' });
      expect(cls(`CC BY 4.0 ${t}`, BY)).toEqual({ kind: 'spdx', id: 'CC-BY-4.0' });
    },
  );
  it('the new words only delimit the notice: outside a notice they are no condition marker', () => {
    expect(st('CC BY 4.0, usage').conflict).toBe('extra-text');
  });
});

describe('round 6c: "Public Domain" wording is neutral only next to a CC0 / Public Domain Mark link', () => {
  const PD = ['Public Domain', 'Public Domain Dedication', 'Domaine public', 'Gemeinfrei', 'Domena publiczna', 'public domain.', 'GEMEINFREI', 'Domena publiczna!'];
  const ZERO = 'https://creativecommons.org/publicdomain/zero/1.0/';
  const MARK = 'https://creativecommons.org/publicdomain/mark/1.0/';
  it.each(PD)('"%s" next to a CC0 link is CC0-1.0', (t) => {
    expect(cls(t, ZERO)).toEqual({ kind: 'spdx', id: 'CC0-1.0' });
    expect(cls(t, ZERO + 'legalcode')).toEqual({ kind: 'spdx', id: 'CC0-1.0' });
    expect(cls(`${t} ${ZERO}`)).toEqual({ kind: 'spdx', id: 'CC0-1.0' });
  });
  it.each(PD)('"%s" next to a Public Domain Mark link is no conflict (the mark has no SPDX id, as for the link alone)', (t) => {
    for (const s of [st(t, MARK), st(`${t} ${MARK}`)]) {
      expect(s.conflict, t).toBeUndefined();
      expect(classifyStatement(s)).toEqual(UNREC);
    }
    expect(st(undefined, MARK)).toMatchObject({ uri: MARK });
  });
  it.each(PD)('"%s" next to any other licence link stays a text-link conflict', (t) => {
    for (const uri of [BY, 'https://opendatacommons.org/licenses/pddl/1.0/', ZERO + 'foo', MARK + 'foo']) {
      expect(st(t, uri).conflict, `${t} ${uri}`).toBe('text-uri');
      expect(cls(t, uri)).toEqual(UNREC);
    }
    expect(st(`${t} ${BY}`).conflict).toBe('extra-text');
  });
  it.each(PD)('"%s" without a link is as before (unrecognised, no conflict)', (t) => {
    const s = st(t);
    expect(classifyStatement(s)).toEqual(UNREC);
    expect(s.conflict).toBeUndefined();
  });
  it('only the exact wording is neutral', () => {
    expect(st('Public Domain, but registration required', ZERO).conflict).toBe('text-uri');
    expect(st('Public domain in the US only', ZERO).conflict).toBe('text-uri');
  });
});
