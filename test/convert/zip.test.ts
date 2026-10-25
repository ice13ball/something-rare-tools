// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The ZIP writer: read back by the repository's own reader and by the DwC-A reader, byte-identical output, STORE fallback, CompressionStream, and limits.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DOS_DATE, ZipWriteError, buildZip, crc32, streamDeflate } from '../../src/core/convert/zip';
import { openZip } from '../../src/core/parse/zip';
import { nodeInflate } from '../helpers/zipfile';
import { exportSheet, nodeDeflate, readBack } from './exportHelpers';
import { W2_HEADER, W2_QUANTITY, W2_ROWS } from './helpers';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const FILES = [
  { name: 'meta.xml', data: enc('<archive/>\n') },
  { name: 'event.txt', data: enc('eventID\tparentEventID\nE1\t\n') },
  { name: 'Ünï/çode.txt', data: enc('tøst\n'.repeat(500)) },
  { name: 'empty.txt', data: new Uint8Array(0) },
];

describe('crc32', () => {
  it('is the zip CRC-32 (the check value of "123456789" is cbf43926)', () => {
    expect(crc32(enc('123456789')).toString(16)).toBe('cbf43926');
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('round trip through the repository reader', () => {
  for (const [label, deflate] of [['deflate', nodeDeflate], ['STORE', undefined]] as const) {
    it(`${label}: every entry comes back with its name (UTF-8) and its bytes`, async () => {
      const zip = await buildZip(FILES, deflate);
      const z = openZip(zip);
      expect(z.entries.map((e) => e.name)).toEqual(FILES.map((f) => f.name));
      for (const f of FILES) {
        const e = z.find(f.name)!;
        expect(e.size).toBe(f.data.length);
        expect(Buffer.from(await z.read(e, nodeInflate)).equals(Buffer.from(f.data)), f.name).toBe(true);
      }
      if (deflate) expect(z.find('Ünï/çode.txt')!.method).toBe(8);
      else expect(z.entries.every((e) => e.method === 0)).toBe(true);
    });
  }

  it('an entry that does not get smaller is stored, even when deflate is available', async () => {
    const z = openZip(await buildZip([{ name: 'tiny.txt', data: enc('x') }], nodeDeflate));
    expect(z.find('tiny.txt')!.method).toBe(0);
  });

  it('local header, central directory and EOCD carry the UTF-8 flag, the fixed DOS date 1980-01-01, the CRC and no extra field', async () => {
    const zip = await buildZip([FILES[0]]);
    const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    expect(dv.getUint16(6, true) & 0x0800).toBe(0x0800);
    expect(dv.getUint16(10, true)).toBe(0);
    expect(dv.getUint16(12, true)).toBe(DOS_DATE);
    expect(DOS_DATE).toBe(0x0021);
    expect(dv.getUint32(14, true)).toBe(crc32(FILES[0].data));
    expect(dv.getUint16(28, true)).toBe(0);
    expect(dv.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(dv.getUint16(zip.length - 22 + 10, true)).toBe(1);
  });
});

describe('byte-identical output', () => {
  it('the same files give the same bytes, and the stored archive of the fixed files has this digest (a change of the writer shows here)', async () => {
    const a = await buildZip(FILES);
    const b = await buildZip(FILES);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(sha(a)).toBe('0da3e6bb7f302300893eb1d5764c5a71c6fc8c1650df5e8a515978fea32aa154');
  });

  it('deflated output is deterministic on one platform (the digest of deflate is not pinned: zlib versions differ between runtimes)', async () => {
    expect(sha(await buildZip(FILES, nodeDeflate))).toBe(sha(await buildZip(FILES, nodeDeflate)));
  });
});

describe('CompressionStream', () => {
  it('is available here, and its output is read back by the reader (the format browsers write)', async () => {
    const d = streamDeflate();
    expect(d).toBeTypeOf('function');
    const zip = await buildZip(FILES, d);
    const z = openZip(zip);
    expect(z.find('Ünï/çode.txt')!.method).toBe(8);
    expect(Buffer.from(await z.read(z.find('Ünï/çode.txt')!, nodeInflate)).equals(Buffer.from(FILES[2].data))).toBe(true);
  });
});

describe('the DwC-A reader reads an exported archive, deflated or stored', () => {
  it('both give the same Event core', async () => {
    const e = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, fullList: true });
    const stored = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, fullList: true, deflate: false });
    const a = await readBack(e.zip);
    const b = await readBack(stored.zip);
    expect(b.text).toEqual(a.text);
    expect(a.core.sheets[0].rows.map((r) => r.cells)).toEqual(b.core.sheets[0].rows.map((r) => r.cells));
    expect(stored.zip.length).toBeGreaterThan(e.zip.length);
  });
});

describe('what it refuses', () => {
  it('unsafe or repeated names and archives the reader could not take', async () => {
    for (const name of ['', '/abs', '../up', 'a/../b', 'a\\b', 'C:x', 'a\0b']) await expect(buildZip([{ name, data: enc('x') }]), name).rejects.toMatchObject({ code: 'ZIP-BAD-NAME' });
    await expect(buildZip([{ name: 'a', data: enc('x') }, { name: 'a', data: enc('y') }])).rejects.toBeInstanceOf(ZipWriteError);
    await expect(buildZip(Array.from({ length: 1001 }, (_, i) => ({ name: `f${i}`, data: enc('x') })))).rejects.toMatchObject({ code: 'ZIP-TOO-MANY-ENTRIES' });
  });
  it('an entry so compressible that the reader would call it a bomb is stored instead', async () => {
    const big = new Uint8Array(2 * 1024 * 1024);
    const z = openZip(await buildZip([{ name: 'zeros.bin', data: big }], nodeDeflate));
    expect(z.find('zeros.bin')!.method).toBe(0);
  });
});
