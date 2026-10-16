// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Serves the private golden set (read through GOLDEN_DIR at runtime) to the real source handlers as if it were the network.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FetchResult, Fetcher } from '../../src/core/sources/fetcher';

const empty = new Uint8Array();
const reply = (status: number, url: string, bytes: Uint8Array = empty, contentType?: string): FetchResult => ({
  status,
  bytes,
  finalUrl: url,
  ...(contentType ? { contentType } : {}),
});
const bytesOf = (path: string): Uint8Array => {
  const b = readFileSync(path);
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
};
export const decode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const DATACITE = /^https:\/\/api\.datacite\.org\/dois\/([^?#]+)/i;
const ZENODO = /^https:\/\/zenodo\.org\/api\/records\/([^/?#]+)\/?(?:[?#].*)?$/i;
const GEONETWORK = /\/srv\/api\/records\/([0-9a-f-]{36})\/formatters\/xml/i;

export function createLocalFetcher(goldenDir: string, urlFiles: Record<string, string>): Fetcher {
  const metaDir = join(goldenDir, 'metadata');
  const dirs = existsSync(metaDir) ? readdirSync(metaDir) : [];
  const findDir = (name: string): string | undefined => {
    const hit = dirs.find((d) => d.toLowerCase() === name.toLowerCase());
    return hit ? join(metaDir, hit) : undefined;
  };
  /** The record file of a metadata directory (record.json / record.xml), if it holds one. */
  const recordIn = (dir: string | undefined): string | undefined => {
    if (!dir || !statSync(dir).isDirectory()) return undefined;
    const f = readdirSync(dir).find((n) => /^record\./.test(n));
    return f ? join(dir, f) : undefined;
  };

  return {
    async get(url: string): Promise<FetchResult> {
      const dc = DATACITE.exec(url);
      if (dc) {
        const rec = recordIn(findDir(`datacite-${decode(dc[1]).replace(/\//g, '_')}`));
        return rec ? reply(200, url, bytesOf(rec), 'application/json') : reply(404, url);
      }
      const zn = ZENODO.exec(url);
      if (zn) {
        const rec = recordIn(findDir(`zenodo-${decode(zn[1])}`));
        return rec ? reply(200, url, bytesOf(rec), 'application/json') : reply(404, url);
      }
      const gn = GEONETWORK.exec(url);
      if (gn) {
        const dir = findDir(`gn-${gn[1]}`);
        if (!dir) return reply(404, url);
        const rec = recordIn(dir);
        return rec ? reply(200, url, bytesOf(rec), 'application/xml') : reply(403, url);
      }
      const local = mappedFile(url, urlFiles);
      return local === undefined ? reply(404, url) : reply(200, url, bytesOf(join(goldenDir, local)));
    },
  };
}

/** The local file (as written in urlFiles) that answers this URL, if any. */
export function mappedFile(url: string, urlFiles: Record<string, string>): string | undefined {
  const decoded = decode(url);
  const key = Object.keys(urlFiles).find((k) => decoded.includes(k));
  return key === undefined ? undefined : urlFiles[key];
}

/** True when the fetcher would answer this data-file URL from a local file (used to tell "not in the golden set" from a real 404). */
export function hasUrlMapping(url: string, urlFiles: Record<string, string>): boolean {
  return mappedFile(url, urlFiles) !== undefined;
}
