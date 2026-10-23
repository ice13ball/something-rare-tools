// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A small, dependency-free, defensive ZIP reader for archives dropped by a stranger (Darwin Core Archives).
// It reads the End of Central Directory and the central directory, and inflates an entry ONLY through an
// injected function (the browser's DecompressionStream in the worker, node zlib in tests). Entry names are lookup
// keys: nothing is written to disk and nothing in the archive is executed. Everything is bounded (see ZIP_LIMITS):
// the declared sizes are never trusted alone, because the injected inflater is told to stop at the declared size.

export type ZipErrorCode =
  | 'ZIP-TOO-LARGE' // the archive file itself is larger than the cap
  | 'ZIP-NO-EOCD' // not a zip: no End of Central Directory
  | 'ZIP-CORRUPT' // offsets out of range, bad signatures, duplicate names, multi-disk
  | 'ZIP-ZIP64' // ZIP64 is not supported
  | 'ZIP-ENCRYPTED' // an encrypted entry
  | 'ZIP-METHOD' // a compression method other than stored (0) or deflate (8)
  | 'ZIP-TOO-MANY-ENTRIES'
  | 'ZIP-ENTRY-TOO-LARGE' // one entry larger than the per-entry cap
  | 'ZIP-TOTAL-TOO-LARGE' // all entries together larger than the total cap
  | 'ZIP-SIZE-MISMATCH' // stored entry with different sizes, or inflated size differs from the declared one
  | 'ZIP-BOMB'; // implausible compression ratio, or the data inflates past its declared size

export class ZipError extends Error {
  readonly code: ZipErrorCode;
  constructor(code: ZipErrorCode, message: string) {
    super(message);
    this.name = 'ZipError';
    this.code = code;
  }
}

export interface ZipLimits {
  /** the archive file as dropped */
  maxArchiveBytes: number;
  /** sum of the declared uncompressed sizes of ALL entries, and of everything actually inflated */
  maxTotalBytes: number;
  /** one entry, uncompressed */
  maxEntryBytes: number;
  /** entries in the central directory */
  maxEntries: number;
  /** declared uncompressed / compressed, checked on entries above `ratioFloorBytes` (deflate itself tops out near 1032) */
  maxRatio: number;
  ratioFloorBytes: number;
}

/**
 * Chosen limits. /check had none for file size or row count before this module; these are proposals:
 * 100 MB archive (a worker holds the bytes, the inflated entry and its text at once), 300 MB uncompressed in total
 * (3x the archive cap: real DwC-A text compresses 5-20x, so a legitimate archive near the archive cap is refused
 * with a clear message rather than risking the tab), 1000 entries (a DwC-A has a handful of files), ratio 200 above 1 MiB
 * (sparse tab-separated tables reach about 100; a bomb starts at 1000).
 */
export const ZIP_LIMITS: ZipLimits = {
  maxArchiveBytes: 100 * 1024 * 1024,
  maxTotalBytes: 300 * 1024 * 1024,
  maxEntryBytes: 300 * 1024 * 1024,
  maxEntries: 1000,
  maxRatio: 200,
  ratioFloorBytes: 1024 * 1024,
};

/**
 * Inflates one raw-deflate stream. CONTRACT: it must throw as soon as the output would exceed `maxOut` bytes (it
 * must not buffer past it) and throw on corrupt input. The reader compares the length it returns with the declared size.
 */
export type Inflate = (data: Uint8Array, maxOut: number) => Promise<Uint8Array>;

export interface ZipEntry {
  name: string;
  method: 0 | 8;
  compressedSize: number;
  size: number;
  /** offset of the local file header */
  offset: number;
  /** false for names with a `..` segment, a leading `/` or `\`, a backslash, a drive letter or a NUL: never matched */
  safe: boolean;
}

export interface ZipArchive {
  entries: readonly ZipEntry[];
  /** the entry with exactly this name, only when its name is safe */
  find(name: string): ZipEntry | undefined;
  /** the entry's bytes, exactly `entry.size` long; throws ZipError */
  read(entry: ZipEntry, inflate: Inflate): Promise<Uint8Array>;
}

const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;
const EOCD_MIN = 22;
const MAX_COMMENT = 0xffff;

const isSafeName = (name: string): boolean =>
  name !== '' &&
  !name.includes('\0') &&
  !name.includes('\\') &&
  !name.startsWith('/') &&
  !/^[A-Za-z]:/.test(name) &&
  !name.split('/').includes('..');

/** Lists a zip. Reads only the central directory; no entry is inflated. Throws ZipError. */
export function openZip(bytes: Uint8Array, limits: ZipLimits = ZIP_LIMITS): ZipArchive {
  if (bytes.length > limits.maxArchiveBytes) {
    throw new ZipError('ZIP-TOO-LARGE', `archive is ${bytes.length} bytes, the limit is ${limits.maxArchiveBytes}`);
  }
  if (bytes.length < EOCD_MIN) throw new ZipError('ZIP-NO-EOCD', 'too short to be a zip archive');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let eocd = -1;
  for (let i = bytes.length - EOCD_MIN; i >= Math.max(0, bytes.length - EOCD_MIN - MAX_COMMENT); i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) {
      const commentLen = dv.getUint16(i + 20, true);
      if (i + EOCD_MIN + commentLen === bytes.length) {
        eocd = i;
        break;
      }
    }
  }
  if (eocd < 0) throw new ZipError('ZIP-NO-EOCD', 'no End of Central Directory record');

  if (eocd >= 20 && dv.getUint32(eocd - 20, true) === SIG_ZIP64_LOCATOR) throw new ZipError('ZIP-ZIP64', 'ZIP64 archives are not supported');
  const diskNo = dv.getUint16(eocd + 4, true);
  const cdDisk = dv.getUint16(eocd + 6, true);
  const countOnDisk = dv.getUint16(eocd + 8, true);
  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new ZipError('ZIP-ZIP64', 'ZIP64 archives are not supported');
  if (diskNo !== 0 || cdDisk !== 0 || countOnDisk !== count) throw new ZipError('ZIP-CORRUPT', 'multi-disk archives are not supported');
  if (count > limits.maxEntries) throw new ZipError('ZIP-TOO-MANY-ENTRIES', `${count} entries, the limit is ${limits.maxEntries}`);
  if (cdOffset + cdSize > eocd) throw new ZipError('ZIP-CORRUPT', 'central directory lies outside the file');
  if (count > 0 && cdSize < 46 * count) throw new ZipError('ZIP-CORRUPT', 'central directory is smaller than its entry count needs');

  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  const decoder = new TextDecoder('utf-8');
  let p = cdOffset;
  const cdEnd = cdOffset + cdSize;
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > cdEnd || dv.getUint32(p, true) !== SIG_CEN) throw new ZipError('ZIP-CORRUPT', 'bad central directory entry');
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    const next = p + 46 + nameLen + extraLen + commentLen;
    if (next > cdEnd) throw new ZipError('ZIP-CORRUPT', 'central directory entry runs past the directory');
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p = next;

    if (name.endsWith('/') && size === 0) continue; // a directory marker: nothing to read
    if ((flags & 0x1) !== 0 || (flags & 0x40) !== 0 || method === 99) throw new ZipError('ZIP-ENCRYPTED', `entry "${name}" is encrypted`);
    if (compressedSize === 0xffffffff || size === 0xffffffff || offset === 0xffffffff) throw new ZipError('ZIP-ZIP64', 'ZIP64 archives are not supported');
    if (method !== 0 && method !== 8) throw new ZipError('ZIP-METHOD', `entry "${name}" uses compression method ${method}`);
    if (names.has(name)) throw new ZipError('ZIP-CORRUPT', `the name "${name}" appears twice`);
    names.add(name);
    if (offset + 30 > cdOffset) throw new ZipError('ZIP-CORRUPT', `entry "${name}" starts outside the file`);
    if (size > limits.maxEntryBytes) throw new ZipError('ZIP-ENTRY-TOO-LARGE', `entry "${name}" is ${size} bytes uncompressed, the limit is ${limits.maxEntryBytes}`);
    if (method === 0 && compressedSize !== size) throw new ZipError('ZIP-SIZE-MISMATCH', `stored entry "${name}" declares two different sizes`);
    if (method === 8 && size > limits.ratioFloorBytes && size / Math.max(compressedSize, 1) > limits.maxRatio) {
      throw new ZipError('ZIP-BOMB', `entry "${name}" would inflate ${Math.round(size / Math.max(compressedSize, 1))}x`);
    }
    total += size;
    if (total > limits.maxTotalBytes) throw new ZipError('ZIP-TOTAL-TOO-LARGE', `the entries add up to more than ${limits.maxTotalBytes} bytes uncompressed`);
    entries.push({ name, method, compressedSize, size, offset, safe: isSafeName(name) });
  }

  const byName = new Map(entries.filter((e) => e.safe).map((e) => [e.name, e]));
  let inflated = 0;

  return {
    entries,
    find: (name) => byName.get(name),
    async read(entry, inflate) {
      if (inflated + entry.size > limits.maxTotalBytes) throw new ZipError('ZIP-TOTAL-TOO-LARGE', 'more than the total limit would be inflated');
      if (entry.offset + 30 > bytes.length || dv.getUint32(entry.offset, true) !== SIG_LOC) throw new ZipError('ZIP-CORRUPT', `no local header for "${entry.name}"`);
      const start = entry.offset + 30 + dv.getUint16(entry.offset + 26, true) + dv.getUint16(entry.offset + 28, true);
      const end = start + entry.compressedSize;
      if (end > cdOffset) throw new ZipError('ZIP-CORRUPT', `data of "${entry.name}" runs outside the file`);
      const raw = bytes.subarray(start, end);
      let out: Uint8Array;
      if (entry.method === 0) {
        out = raw;
      } else {
        try {
          out = await inflate(raw, entry.size);
        } catch (e) {
          throw new ZipError('ZIP-BOMB', `"${entry.name}" does not inflate to its declared ${entry.size} bytes (${e instanceof Error ? e.message : 'corrupt data'})`);
        }
      }
      if (out.length !== entry.size) throw new ZipError('ZIP-SIZE-MISMATCH', `"${entry.name}" inflated to ${out.length} bytes, declared ${entry.size}`);
      inflated += out.length;
      return out;
    },
  };
}

/** True when the central directory lists an entry that only an Office Open XML workbook has. Never throws. */
export function looksLikeWorkbook(bytes: Uint8Array): boolean {
  try {
    const z = openZip(bytes, { ...ZIP_LIMITS, maxArchiveBytes: Infinity, maxTotalBytes: Infinity, maxEntryBytes: Infinity, maxRatio: Infinity });
    return z.entries.some((e) => e.name === '[Content_Types].xml' || e.name === 'xl/workbook.xml');
  } catch {
    return false;
  }
}
