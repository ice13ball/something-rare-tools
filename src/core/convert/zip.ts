// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { ZIP_LIMITS } from '../parse/zip';

/*
 * A small ZIP writer for the Darwin Core Archive (plan 3.3). No runtime dependency: local file headers, the central directory and the End of
 * Central Directory record, written by hand, so the repository's own reader (parse/zip.ts openZip) reads back what this writes.
 *
 *   - names are UTF-8 (general purpose bit 11), the time is the fixed DOS date 1980-01-01 00:00, so the same input gives the same bytes
 *   - CRC-32 of every entry; sizes in 32 bits, 16-bit entry count: NO ZIP64 (a bigger archive is refused with ZipWriteError, never written wrong)
 *   - every entry is deflated through an injected function (`deflateRaw`, the browser's CompressionStream('deflate-raw'); Node 22 has it too) and
 *     stored instead when deflate does not make it smaller or when no deflate function is available (STORE fallback)
 *   - caps mirror ZIP_LIMITS of the reader: more than its total or per-entry size or entry count is refused, because the archive could not be
 *     read back by this tool
 */

export class ZipWriteError extends Error {
  readonly code: 'ZIP-TOO-LARGE' | 'ZIP-TOO-MANY-ENTRIES' | 'ZIP-BAD-NAME' | 'ZIP-DUPLICATE-NAME';
  constructor(code: ZipWriteError['code'], message: string) {
    super(message);
    this.name = 'ZipWriteError';
    this.code = code;
  }
}

/** What the user is told when the archive does not fit what this tool reads back (the reader refuses an archive above its cap). */
const tooLarge = (bytes: number): string => `The archive would be about ${Math.ceil(bytes / 1024 / 1024)} MB, more than the ${Math.floor(ZIP_LIMITS.maxArchiveBytes / 1024 / 1024)} MB this tool reads back. Nothing was written. Convert the sheets in several parts.`;

export interface ZipInput {
  name: string;
  data: Uint8Array;
}

/** Raw deflate (RFC 1951, no zlib header) of one buffer. */
export type Deflate = (data: Uint8Array) => Promise<Uint8Array>;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
/** 1980-01-01 in DOS date format: ((year - 1980) << 9) | (month << 5) | day. Time 00:00:00 is 0. */
export const DOS_DATE = (0 << 9) | (1 << 5) | 1;
export const DOS_TIME = 0;
const FLAG_UTF8 = 0x0800;

let table: Uint32Array | undefined;
/** CRC-32 (IEEE 802.3, the zip one). */
export function crc32(data: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Deflate through CompressionStream('deflate-raw'); undefined where the browser or runtime has none (the writer then stores). */
export function streamDeflate(): Deflate | undefined {
  if (typeof CompressionStream !== 'function') return undefined;
  try {
    // some runtimes expose the constructor but not the 'deflate-raw' format: constructing one is the test
    new CompressionStream('deflate-raw');
  } catch {
    return undefined;
  }
  return async (data) => {
    const cs = new CompressionStream('deflate-raw');
    const reading = new Response(cs.readable).arrayBuffer();
    const writer = cs.writable.getWriter();
    await writer.write(data as unknown as BufferSource);
    await writer.close();
    return new Uint8Array(await reading);
  };
}

const utf8 = new TextEncoder();

interface Entry {
  name: Uint8Array;
  crc: number;
  method: 0 | 8;
  stored: Uint8Array;
  size: number;
  offset: number;
}

/**
 * The bytes of a zip with these files, in this order. `deflate` is optional: without it every entry is stored. An entry whose deflated form is not
 * smaller than the original is stored too. Throws ZipWriteError for a name that is empty, absolute, has `..`, a backslash or a NUL, for a repeated
 * name, and for sizes the reader's limits (or the 32-bit fields) cannot take.
 */
export async function buildZip(files: readonly ZipInput[], deflate?: Deflate): Promise<Uint8Array> {
  if (files.length > Math.min(0xfffe, ZIP_LIMITS.maxEntries)) throw new ZipWriteError('ZIP-TOO-MANY-ENTRIES', `${files.length} entries`);
  const seen = new Set<string>();
  const entries: Entry[] = [];
  let offset = 0;
  let total = 0;
  const chunks: Uint8Array[] = [];
  for (const f of files) {
    if (f.name === '' || f.name.includes('\0') || f.name.includes('\\') || f.name.startsWith('/') || /^[A-Za-z]:/.test(f.name) || f.name.split('/').includes('..')) {
      throw new ZipWriteError('ZIP-BAD-NAME', `"${f.name}" is not a safe entry name`);
    }
    if (seen.has(f.name)) throw new ZipWriteError('ZIP-DUPLICATE-NAME', `the name "${f.name}" appears twice`);
    seen.add(f.name);
    if (f.data.length > ZIP_LIMITS.maxEntryBytes) throw new ZipWriteError('ZIP-TOO-LARGE', `"${f.name}" is ${f.data.length} bytes, the limit of this tool is ${ZIP_LIMITS.maxEntryBytes}. Nothing was written. Convert the sheets in several parts.`);
    total += f.data.length;
    if (total > ZIP_LIMITS.maxTotalBytes) throw new ZipWriteError('ZIP-TOO-LARGE', `the files add up to more than ${ZIP_LIMITS.maxTotalBytes} bytes, the limit of this tool. Nothing was written. Convert the sheets in several parts.`);
    let method: 0 | 8 = 0;
    let stored = f.data;
    if (deflate && f.data.length > 0) {
      // a failing deflate (a browser that cannot, an interrupted stream) is not an error of the export: the entry is stored
      let d: Uint8Array | undefined;
      try {
        d = await deflate(f.data);
      } catch {
        d = undefined;
      }
      // smaller, and not so much smaller that the repository's own reader would take it for a zip bomb (its ratio limit): that entry is stored
      if (d !== undefined && d.length < f.data.length && !(f.data.length > ZIP_LIMITS.ratioFloorBytes && f.data.length / Math.max(d.length, 1) > ZIP_LIMITS.maxRatio)) {
        method = 8;
        stored = d;
      }
    }
    const name = utf8.encode(f.name);
    const e: Entry = { name, crc: crc32(f.data), method, stored, size: f.data.length, offset };
    const head = new Uint8Array(30 + name.length);
    const dv = new DataView(head.buffer);
    dv.setUint32(0, SIG_LOCAL, true);
    dv.setUint16(4, method === 8 ? 20 : 10, true); // version needed to extract
    dv.setUint16(6, FLAG_UTF8, true);
    dv.setUint16(8, method, true);
    dv.setUint16(10, DOS_TIME, true);
    dv.setUint16(12, DOS_DATE, true);
    dv.setUint32(14, e.crc, true);
    dv.setUint32(18, stored.length, true);
    dv.setUint32(22, e.size, true);
    dv.setUint16(26, name.length, true);
    dv.setUint16(28, 0, true); // no extra field
    head.set(name, 30);
    chunks.push(head, stored);
    offset += head.length + stored.length;
    if (offset > 0xffffffff - 1024 * 1024) throw new ZipWriteError('ZIP-TOO-LARGE', 'the archive would need ZIP64, which is not supported');
    if (offset > ZIP_LIMITS.maxArchiveBytes) throw new ZipWriteError('ZIP-TOO-LARGE', tooLarge(offset));
    entries.push(e);
  }
  const cdOffset = offset;
  let cdSize = 0;
  for (const e of entries) {
    const rec = new Uint8Array(46 + e.name.length);
    const dv = new DataView(rec.buffer);
    dv.setUint32(0, SIG_CENTRAL, true);
    dv.setUint16(4, 20, true); // version made by: MS-DOS, 2.0
    dv.setUint16(6, e.method === 8 ? 20 : 10, true);
    dv.setUint16(8, FLAG_UTF8, true);
    dv.setUint16(10, e.method, true);
    dv.setUint16(12, DOS_TIME, true);
    dv.setUint16(14, DOS_DATE, true);
    dv.setUint32(16, e.crc, true);
    dv.setUint32(20, e.stored.length, true);
    dv.setUint32(24, e.size, true);
    dv.setUint16(28, e.name.length, true);
    // extra length 0, comment length 0, disk number 0, internal attributes 0, external attributes 0
    dv.setUint32(42, e.offset, true);
    rec.set(e.name, 46);
    chunks.push(rec);
    cdSize += rec.length;
  }
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, SIG_EOCD, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  chunks.push(eocd);
  if (offset + cdSize + 22 > ZIP_LIMITS.maxArchiveBytes) throw new ZipWriteError('ZIP-TOO-LARGE', tooLarge(offset + cdSize + 22));
  const out = new Uint8Array(offset + cdSize + 22);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
