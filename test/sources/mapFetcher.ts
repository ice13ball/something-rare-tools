// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// In-memory Fetcher for the source tests: a URL → reply table, every requested URL recorded in `calls`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Fetcher } from '../../src/core/sources/fetcher';

export interface Reply {
  status?: number;
  body?: string | Uint8Array;
  contentType?: string;
}

export const fixture = (name: string): string => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf-8');

export class MapFetcher implements Fetcher {
  readonly calls: string[] = [];
  constructor(private readonly routes: Record<string, Reply | Error>) {}

  async get(url: string): Promise<{ status: number; bytes: Uint8Array; contentType?: string; finalUrl: string }> {
    this.calls.push(url);
    const r = this.routes[url];
    if (r instanceof Error) throw r;
    if (!r) return { status: 404, bytes: new Uint8Array(), finalUrl: url };
    const body = r.body ?? '';
    const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
    return { status: r.status ?? 200, bytes, contentType: r.contentType, finalUrl: url };
  }
}
