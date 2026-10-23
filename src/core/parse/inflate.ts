// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Inflate } from './zip';

/**
 * The browser's inflater for zip entries: DecompressionStream('deflate-raw'). It stops reading and cancels the
 * stream as soon as the output passes `maxOut`, so an entry that lies about its size cannot fill the memory.
 */
export const inflateInBrowser: Inflate = async (data, maxOut) => {
  if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot inflate zip entries');
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  // a write error (corrupt data) surfaces on the read side too; never leave it unhandled
  void writer.write(data as unknown as Uint8Array<ArrayBuffer>).then(() => writer.close()).catch(() => undefined);
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxOut) {
      await reader.cancel().catch(() => undefined);
      throw new Error('inflates past its declared size');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
};
