// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { decodeText, LEGACY_ENCODINGS } from '../../src/core/values/encoding';

const bytes = (...b: number[]) => new Uint8Array(b);

describe('decodeText', () => {
  it('decodes plain UTF-8 without fallback', () => {
    const r = decodeText(new TextEncoder().encode('Zażółć gęślą'));
    expect(r).toEqual({ text: 'Zażółć gęślą', encoding: 'utf-8', fallback: false });
  });

  it('empty input is UTF-8', () => {
    expect(decodeText(new Uint8Array(0))).toEqual({ text: '', encoding: 'utf-8', fallback: false });
  });

  it('strips a UTF-8 BOM and reports utf-8-bom', () => {
    const body = new TextEncoder().encode('a;b\n1;2');
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...body]);
    const r = decodeText(withBom);
    expect(r.encoding).toBe('utf-8-bom');
    expect(r.text).toBe('a;b\n1;2');
    expect(r.fallback).toBe(false);
    expect(r.text.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('Windows-1250 bytes of "Zażółć" fall back and decode correctly', () => {
    // Z a ż ó ł ć  in windows-1250
    const r = decodeText(bytes(0x5a, 0x61, 0xbf, 0xf3, 0xb3, 0xe6));
    expect(r.text).toBe('Zażółć');
    expect(r.fallback).toBe(true);
  });

  it('bytes 0x8A/0x9A/0x8C/0x9C/0x8F/0x9F select windows-1250', () => {
    for (const [b, ch] of [[0x8a, 'Š'], [0x9a, 'š'], [0x8c, 'Ś'], [0x9c, 'ś'], [0x8f, 'Ź'], [0x9f, 'ź']] as const) {
      const r = decodeText(bytes(0x41, b, 0x42));
      expect(r.encoding).toBe('windows-1250');
      expect(r.text).toBe('A' + ch + 'B');
      expect(r.fallback).toBe(true);
    }
  });

  it('legacy bytes without those code points select iso-8859-2', () => {
    // 0xA1 = Ą in ISO-8859-2 (a caron-like spacing char in windows-1250)
    const r = decodeText(bytes(0xa1, 0x62));
    expect(r.encoding).toBe('iso-8859-2');
    expect(r.text).toBe('Ąb');
    expect(r.fallback).toBe(true);
  });

  it('a BOM followed by invalid UTF-8 is not reported as utf-8-bom', () => {
    const r = decodeText(bytes(0xef, 0xbb, 0xbf, 0x41, 0xff));
    expect(r.encoding).not.toBe('utf-8-bom');
    expect(r.fallback).toBe(true);
  });

  it('does not mangle valid multi-byte UTF-8 that merely contains high bytes', () => {
    const r = decodeText(new TextEncoder().encode('Šś'));
    expect(r.encoding).toBe('utf-8');
    expect(r.text).toBe('Šś');
  });

  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

  it('windows-1252 bytes of Krøyer;Sèvre give two readings, today\'s pick first', () => {
    const r = decodeText(bytes(...ascii('Kr'), 0xf8, ...ascii('yer;S'), 0xe8, ...ascii('vre')));
    expect(r.encoding).toBe('iso-8859-2');
    expect(r.text).toBe('Krřyer;Sčvre');
    expect(r.readings).toEqual([
      { encodings: ['windows-1250', 'iso-8859-2'], words: 'Krřyer, Sčvre' },
      { encodings: ['windows-1252'], words: 'Krøyer, Sèvre' },
    ]);
  });

  it('windows-1250 bytes with 0x9C read three ways, windows-1250 first', () => {
    const r = decodeText(bytes(...ascii('Gda'), 0xf1, ...ascii('sk;'), 0xb9, 0x9c));
    expect(r.encoding).toBe('windows-1250');
    expect(r.readings?.map((x) => x.encodings)).toEqual([['windows-1250'], ['iso-8859-2'], ['windows-1252']]);
    expect(r.readings?.[0].words).toBe('Gdańsk, ąś');
  });

  it('bytes all three read alike are a fallback with no readings', () => {
    const r = decodeText(bytes(...ascii('M'), 0xfc, ...ascii('ller;Caf'), 0xe9, ...ascii(';B'), 0xf3, ...ascii('br')));
    expect(r.fallback).toBe(true);
    expect(r.readings).toBeUndefined();
  });

  it('forced names the code page: no fallback, no readings', () => {
    const r = decodeText(bytes(...ascii('Kr'), 0xf8, ...ascii('yer')), 'windows-1252');
    expect(r).toEqual({ text: 'Krøyer', encoding: 'windows-1252', fallback: false });
    expect(LEGACY_ENCODINGS).toEqual(['windows-1250', 'iso-8859-2', 'windows-1252']);
  });

  it('at most three differing words, each at most 30 characters', () => {
    const r = decodeText(bytes(0xf8, ...ascii(' a;'), 0xf8, ...ascii(',b\t'), 0xf8, ...ascii(' c '), 0xf8, ...ascii(' d'), ...Array(40).fill(0xf8)));
    expect(r.readings?.[1].words.split(', ')).toHaveLength(3);
    const long = decodeText(bytes(...Array(40).fill(0xf8)));
    expect(long.readings?.every((x) => x.words.length <= 30)).toBe(true); // one long word, once
  });

  it('UTF-16 with a BOM (LE and BE) and without one (NUL pattern) is text', () => {
    expect(decodeText(bytes(0xff, 0xfe, 0x41, 0, 0x42, 0))).toEqual({ text: 'AB', encoding: 'utf-16le', fallback: false });
    expect(decodeText(bytes(0xfe, 0xff, 0, 0x41, 0, 0x42))).toEqual({ text: 'AB', encoding: 'utf-16be', fallback: false });
    expect(decodeText(bytes(0x41, 0, 0x42, 0, 0x43, 0)).encoding).toBe('utf-16le');
    expect(decodeText(bytes(0, 0x41, 0, 0x42, 0, 0x43)).encoding).toBe('utf-16be');
  });

  it('NULs in a UTF-8 or 8-bit file are not UTF-16', () => {
    expect(decodeText(bytes(0x41, 0x42, 0, 0x43, 0x44, 0x45, 0x46, 0x47)).encoding).toBe('utf-8');
    expect(decodeText(bytes(0x41, 0, 0x42, 0x43, 0xf3, 0x45, 0x46, 0x47)).fallback).toBe(true);
  });
});
