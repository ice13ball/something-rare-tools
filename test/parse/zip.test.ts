// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The zip reader: what it reads, and that every hostile shape is refused with a code, quickly, without throwing anything else.
import { describe, expect, it } from 'vitest';
import { openZip, looksLikeWorkbook, ZIP_LIMITS, ZipError, type ZipErrorCode } from '../../src/core/parse/zip';
import { deflateRawSync } from 'node:zlib';
import { inflateInBrowser } from '../../src/core/parse/inflate';
import { makeZip, nodeInflate } from '../helpers/zipfile';

const text = (b: Uint8Array) => new TextDecoder().decode(b);
const codeOf = (fn: () => unknown): ZipErrorCode | undefined => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ZipError) return e.code;
    throw e;
  }
  return undefined;
};
const codeOfAsync = async (fn: () => Promise<unknown>): Promise<ZipErrorCode | undefined> => {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ZipError) return e.code;
    throw e;
  }
  return undefined;
};

describe('openZip', () => {
  it('lists and reads stored and deflated entries', async () => {
    const z = openZip(makeZip([{ name: 'a.txt', data: 'hello hello hello', method: 8 }, { name: 'dir/b.txt', data: 'plain', method: 0 }]));
    expect(z.entries.map((e) => e.name)).toEqual(['a.txt', 'dir/b.txt']);
    expect(text(await z.read(z.find('a.txt')!, nodeInflate))).toBe('hello hello hello');
    expect(text(await z.read(z.find('dir/b.txt')!, nodeInflate))).toBe('plain');
    expect(z.find('missing')).toBeUndefined();
  });

  it('copes with a zip comment and skips directory markers', () => {
    const z = openZip(makeZip([{ name: 'd/', data: '', method: 0 }, { name: 'd/x', data: 'x', method: 0 }], { comment: 'made by a test' }));
    expect(z.entries.map((e) => e.name)).toEqual(['d/x']);
  });

  it('refuses an encrypted entry (flag bit 0, strong encryption, AES method 99)', () => {
    for (const e of [{ flags: 1 }, { flags: 0x41 }, { method: 99 }]) {
      expect(codeOf(() => openZip(makeZip([{ name: 'secret.txt', data: 'x', ...e }])))).toBe('ZIP-ENCRYPTED');
    }
  });

  it('refuses ZIP64: a locator, a saturated entry count, a saturated size', () => {
    expect(codeOf(() => openZip(makeZip([{ name: 'a', data: 'x' }], { zip64Locator: true })))).toBe('ZIP-ZIP64');
    expect(codeOf(() => openZip(makeZip([{ name: 'a', data: 'x' }], { eocdCount: 0xffff })))).toBe('ZIP-ZIP64');
    expect(codeOf(() => openZip(makeZip([{ name: 'a', data: 'x', size: 0xffffffff }])))).toBe('ZIP-ZIP64');
    expect(codeOf(() => openZip(makeZip([{ name: 'a', data: 'x', compressedSize: 0xffffffff }])))).toBe('ZIP-ZIP64');
  });

  it('refuses other compression methods', () => {
    expect(codeOf(() => openZip(makeZip([{ name: 'a.bz2', data: 'x', method: 12 }])))).toBe('ZIP-METHOD');
    expect(codeOf(() => openZip(makeZip([{ name: 'a', data: 'x', method: 9 }])))).toBe('ZIP-METHOD');
  });

  it('refuses a stored entry whose two sizes differ', () => {
    expect(codeOf(() => openZip(makeZip([{ name: 'a', data: 'abcdef', method: 0, size: 3 }])))).toBe('ZIP-SIZE-MISMATCH');
  });

  it('refuses an entry over the per-entry cap, a total over the total cap, too many entries, a too large archive', () => {
    const limits = { ...ZIP_LIMITS, maxEntryBytes: 100, maxTotalBytes: 150, maxEntries: 3, maxArchiveBytes: 5000 };
    expect(codeOf(() => openZip(makeZip([{ name: 'a', data: 'x'.repeat(101) }]), limits))).toBe('ZIP-ENTRY-TOO-LARGE');
    expect(codeOf(() => openZip(makeZip([{ name: 'a', data: 'x'.repeat(80) }, { name: 'b', data: 'y'.repeat(80) }]), limits))).toBe('ZIP-TOTAL-TOO-LARGE');
    expect(codeOf(() => openZip(makeZip([1, 2, 3, 4].map((n) => ({ name: `f${n}`, data: 'x' }))), limits))).toBe('ZIP-TOO-MANY-ENTRIES');
    expect(codeOf(() => openZip(new Uint8Array(5001), limits))).toBe('ZIP-TOO-LARGE');
  });

  it('refuses a bomb by its declared ratio before inflating anything', () => {
    const zeros = new Uint8Array(20 * 1024 * 1024); // deflates to ~20 KB: ratio ~1000
    expect(codeOf(() => openZip(makeZip([{ name: 'bomb.txt', data: zeros }])))).toBe('ZIP-BOMB');
  });

  it('does not trust the declared size: an entry that inflates past it is stopped, not inflated', async () => {
    const big = new Uint8Array(4 * 1024 * 1024).fill(0x41);
    const z = openZip(makeZip([{ name: 'liar.txt', data: big, size: 10 }]));
    let asked = -1;
    const spy = (d: Uint8Array, max: number) => ((asked = max), nodeInflate(d, max));
    expect(await codeOfAsync(() => z.read(z.entries[0], spy))).toBe('ZIP-BOMB');
    expect(asked).toBe(10); // the inflater was told to stop at the declared size
  });

  it('refuses an entry that inflates to less than its declared size', async () => {
    const z = openZip(makeZip([{ name: 'short.txt', data: 'abc', size: 50 }]));
    expect(await codeOfAsync(() => z.read(z.entries[0], nodeInflate))).toBe('ZIP-SIZE-MISMATCH');
  });

  it('refuses a crafted central directory: offsets out of range, absurd counts, truncated file', () => {
    const ok = makeZip([{ name: 'a', data: 'x' }]);
    expect(codeOf(() => openZip(makeZip([{ name: 'a', data: 'x' }], { cdOffset: 0x7fffffff })))).toBe('ZIP-CORRUPT');
    expect(codeOf(() => openZip(makeZip([{ name: 'a', data: 'x' }], { cdSize: 0x7fffffff })))).toBe('ZIP-CORRUPT');
    expect(codeOf(() => openZip(makeZip([{ name: 'a', data: 'x' }], { eocdCount: 900 })))).toBe('ZIP-CORRUPT');
    expect(codeOf(() => openZip(makeZip([{ name: 'a', data: 'x', offset: 0x7ffffff0 }])))).toBe('ZIP-CORRUPT');
    expect(codeOf(() => openZip(ok.subarray(0, ok.length - 5)))).toBe('ZIP-NO-EOCD');
    expect(codeOf(() => openZip(new Uint8Array(10)))).toBe('ZIP-NO-EOCD');
    expect(codeOf(() => openZip(new Uint8Array(100_000).fill(0x50)))).toBe('ZIP-NO-EOCD');
  });

  it('refuses a local header or data that points outside the file when read', async () => {
    const z = openZip(makeZip([{ name: 'a', data: 'x', compressedSize: 5000, method: 0, size: 5000 }]));
    expect(await codeOfAsync(() => z.read(z.entries[0], nodeInflate))).toBe('ZIP-CORRUPT');
    const bad = makeZip([{ name: 'a', data: 'x' }, { name: 'b', data: 'y' }]);
    const z2 = openZip(bad);
    bad[z2.entries[1].offset] = 0; // clobber the second local header signature
    expect(await codeOfAsync(() => z2.read(z2.entries[1], nodeInflate))).toBe('ZIP-CORRUPT');
  });

  it('refuses a duplicated name (two meta.xml would be ambiguous)', () => {
    expect(codeOf(() => openZip(makeZip([{ name: 'meta.xml', data: 'a' }, { name: 'meta.xml', data: 'b' }])))).toBe('ZIP-CORRUPT');
  });

  it('never matches a name with .. a leading slash or a backslash', () => {
    const z = openZip(makeZip([{ name: '../meta.xml', data: 'a' }, { name: '/meta.xml', data: 'b' }, { name: 'x\\meta.xml', data: 'c' }, { name: 'a/../meta.xml', data: 'd' }]));
    expect(z.entries.every((e) => !e.safe)).toBe(true);
    for (const n of ['../meta.xml', '/meta.xml', 'x\\meta.xml', 'a/../meta.xml', 'meta.xml']) expect(z.find(n)).toBeUndefined();
  });

  it('survives random damage: only ZipError, and fast', async () => {
    const base = makeZip([{ name: 'meta.xml', data: '<archive/>'.repeat(20) }, { name: 'occurrence.txt', data: 'a\tb\n1\t2\n'.repeat(50), method: 0 }]);
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const t0 = Date.now();
    for (let i = 0; i < 600; i++) {
      const b = base.slice();
      for (let k = 0; k < 1 + Math.floor(rnd() * 6); k++) b[Math.floor(rnd() * b.length)] = Math.floor(rnd() * 256);
      const cut = rnd() < 0.2 ? b.subarray(0, Math.floor(rnd() * b.length)) : b;
      try {
        const z = openZip(cut);
        for (const e of z.entries) {
          await z.read(e, nodeInflate).catch((err: unknown) => {
            if (!(err instanceof ZipError)) throw err;
          });
        }
      } catch (e) {
        expect(e).toBeInstanceOf(ZipError);
      }
    }
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});

describe('looksLikeWorkbook', () => {
  it('is true for an xlsx-shaped zip and false for anything else, never throwing', () => {
    expect(looksLikeWorkbook(makeZip([{ name: '[Content_Types].xml', data: '<x/>' }, { name: 'xl/workbook.xml', data: '<x/>' }]))).toBe(true);
    expect(looksLikeWorkbook(makeZip([{ name: 'meta.xml', data: '<x/>' }]))).toBe(false);
    expect(looksLikeWorkbook(new Uint8Array([0x50, 0x4b, 3, 4, 1, 2]))).toBe(false);
  });
});

describe('inflateInBrowser (DecompressionStream)', () => {
  it('inflates, stops at the limit, and rejects corrupt data', async () => {
    const packed = new Uint8Array(deflateRawSync(new Uint8Array(1_000_000).fill(0x42)));
    expect((await inflateInBrowser(packed, 1_000_000)).length).toBe(1_000_000);
    await expect(inflateInBrowser(packed, 999_999)).rejects.toThrow();
    await expect(inflateInBrowser(new Uint8Array([1, 2, 3, 4, 5, 6]), 100)).rejects.toThrow();
    const z = openZip(makeZip([{ name: 'a.txt', data: 'hello hello hello' }]));
    expect(text(await z.read(z.entries[0], inflateInBrowser))).toBe('hello hello hello');
  });
});
