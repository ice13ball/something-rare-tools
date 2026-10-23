// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A tiny zip WRITER for tests, with overrides to craft hostile archives (lying sizes, flags, offsets). Synthetic data only.
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import type { Inflate } from '../../src/core/parse/zip';

/** The injected inflater of the tests: node zlib, stopping at maxOut like the contract says. */
export const nodeInflate: Inflate = async (data, maxOut) => new Uint8Array(inflateRawSync(data, { maxOutputLength: Math.max(1, maxOut) }));

const TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array): number => {
  let c = 0xffffffff;
  for (const x of b) c = TABLE[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

export interface TestEntry {
  name: string;
  data?: string | Uint8Array;
  method?: number;
  flags?: number;
  /** override what the central directory declares */
  size?: number;
  compressedSize?: number;
  offset?: number;
}

export interface TestZipOptions {
  eocdCount?: number;
  cdOffset?: number;
  cdSize?: number;
  zip64Locator?: boolean;
  comment?: string;
}

const u8 = (d: string | Uint8Array): Uint8Array => (typeof d === 'string' ? new TextEncoder().encode(d) : d);

export function makeZip(entries: TestEntry[], o: TestZipOptions = {}): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let at = 0;
  const push = (b: Uint8Array): void => {
    parts.push(b);
    at += b.length;
  };
  for (const e of entries) {
    const raw = u8(e.data ?? '');
    const method = e.method ?? 8;
    const body = method === 8 ? new Uint8Array(deflateRawSync(raw)) : raw;
    const name = u8(e.name);
    const flags = e.flags ?? 0;
    const csize = e.compressedSize ?? body.length;
    const size = e.size ?? raw.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, flags, true);
    local.setUint16(8, method, true);
    local.setUint32(14, crc32(raw), true);
    local.setUint32(18, csize, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    const offset = at;
    push(new Uint8Array(local.buffer));
    push(name);
    push(body);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, flags, true);
    c.setUint16(10, method, true);
    c.setUint32(16, crc32(raw), true);
    c.setUint32(20, csize, true);
    c.setUint32(24, size, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, e.offset ?? offset, true);
    central.push(new Uint8Array(c.buffer), name);
  }
  const cdStart = at;
  for (const c of central) push(c);
  const cdLen = at - cdStart;
  if (o.zip64Locator) {
    const loc = new Uint8Array(20);
    loc.set([0x50, 0x4b, 0x06, 0x07]);
    push(loc);
  }
  const comment = u8(o.comment ?? '');
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, o.eocdCount ?? entries.length, true);
  eocd.setUint16(10, o.eocdCount ?? entries.length, true);
  eocd.setUint32(12, o.cdSize ?? cdLen, true);
  eocd.setUint32(16, o.cdOffset ?? cdStart, true);
  eocd.setUint16(20, comment.length, true);
  push(new Uint8Array(eocd.buffer));
  push(comment);
  const out = new Uint8Array(at);
  let p = 0;
  for (const b of parts) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}

export interface Dwc {
  /** the core element's attributes besides rowType */
  coreAttrs?: string;
  rowType?: string;
  location?: string;
  /** field index -> term (a local name is in the dwc namespace; a name with '/' is taken as the URI) */
  fields: Record<number, string>;
  idIndex?: number;
  extensions?: string;
}

const termUri = (t: string): string => (t.includes('/') ? t : `http://rs.tdwg.org/dwc/terms/${t}`);

export function metaXml(d: Dwc): string {
  const fields = Object.entries(d.fields)
    .map(([i, t]) => `<field index="${i}" term="${termUri(t)}"/>`)
    .join('');
  const attrs = d.coreAttrs ?? 'encoding="UTF-8" fieldsTerminatedBy="\\t" linesTerminatedBy="\\n" fieldsEnclosedBy="" ignoreHeaderLines="1"';
  const id = `<id index="${d.idIndex ?? 0}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?><archive xmlns="http://rs.tdwg.org/dwc/text/" metadata="eml.xml"><core ${attrs} rowType="${d.rowType ?? 'http://rs.tdwg.org/dwc/terms/Occurrence'}"><files><location>${d.location ?? 'occurrence.txt'}</location></files>${id}${fields}</core>${d.extensions ?? ''}</archive>`;
}

export const emlXml = (title: string, packageId: string, pubDate: string): string =>
  `<?xml version="1.0"?><eml:eml xmlns:eml="https://eml.ecoinformatics.org/eml-2.2.0" packageId="${packageId}" system="http://gbif.org"><dataset><title xml:lang="en">${title}</title><pubDate>${pubDate}</pubDate></dataset></eml:eml>`;
