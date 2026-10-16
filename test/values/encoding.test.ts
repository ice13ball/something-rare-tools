// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { decodeText } from '../../src/core/values/encoding';

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
});
