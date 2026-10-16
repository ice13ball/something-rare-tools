// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFile, ParseError } from '../../src/core/parse';

const fx = (n: string) => new Uint8Array(readFileSync(new URL('../fixtures/' + n, import.meta.url)));
const enc = (s: string) => new TextEncoder().encode(s);

describe('parseFile dispatch', () => {
  it('recognises a PDF by magic bytes and returns no sheets', () => {
    const f = parseFile('paper.pdf', enc('%PDF-1.7\n...'));
    expect(f.kind).toBe('pdf');
    expect(f.sheets).toEqual([]);
    expect(f.findings).toEqual([]);
  });

  it('sniffs ISO 19139 XML as metadata', () => {
    const f = parseFile('rec.xml', fx('iso-clean-anchor.xml'));
    expect(f.kind).toBe('metadata');
    expect(f.sheets).toEqual([]);
    expect(f.embeddedMetadata?.source).toBe('iso19139');
    expect(f.embeddedMetadata?.label).toBe('rec.xml');
  });

  it('sniffs DataCite XML as metadata', () => {
    const f = parseFile('dc.xml', fx('datacite-spdx.xml'));
    expect(f.kind).toBe('metadata');
    expect(f.embeddedMetadata?.source).toBe('datacite');
  });

  it('sniffs DataCite JSON and Zenodo JSON as metadata', () => {
    const dc = parseFile('dc.json', fx('datacite-spdx.json'));
    expect(dc.kind).toBe('metadata');
    expect(dc.embeddedMetadata?.source).toBe('datacite');
    const zn = parseFile('z.json', fx('zenodo-xlsx.json'));
    expect(zn.kind).toBe('metadata');
    expect(zn.embeddedMetadata?.source).toBe('zenodo');
  });

  it('falls back to CSV for anything else, whatever the extension', () => {
    const f = parseFile('data.txt', enc('a,b\n1,2\n'));
    expect(f.kind).toBe('csv');
    expect(f.sheets[0].name).toBe('data.txt');
  });

  it('throws a typed ParseError with a plain message on unusable metadata', () => {
    expect(() => parseFile('x.json', enc('{ not json'))).toThrow(ParseError);
    expect(() => parseFile('x.json', enc('{"hello":1}'))).toThrow(ParseError);
    expect(() => parseFile('x.xml', enc('<?xml version="1.0"?><oops'))).toThrow(ParseError);
    try {
      parseFile('x.json', enc('{"hello":1}'));
    } catch (e) {
      expect((e as ParseError).fileName).toBe('x.json');
      expect((e as ParseError).message).toContain('x.json');
    }
  });
});
