// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Helpers shared by the record handlers.
import { isAllowedHost } from '../../../config/hosts';
import { makeFinding } from '../rules/registry';
import type { Finding } from '../types';
import { fetchErrorFinding, hostOf, type FetchResult, type Fetcher } from './fetcher';

/** Only these file types count as tables the checker can read (NetCDF and the like are not supported). */
export const DATA_EXTENSIONS: readonly string[] = ['csv', 'tsv', 'txt', 'tab', 'xlsx', 'xls', 'ods'];

export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  return m ? m[1]!.toLowerCase() : '';
}

export function hasDataExtension(name: string): boolean {
  return DATA_EXTENSIONS.includes(extensionOf(name));
}

/** README, ReadMe.txt, 00_readme_v2.txt: a description of the deposit, never data (Michal, 24.10.2026: only the data are checked). */
export function isReadme(name: string): boolean {
  const base = name.split('/').pop() ?? name;
  return /(?:^|[\s._-])read[\s_-]?me(?:[\s._-]|$)/i.test(base);
}

/** A file of a linked record that is read as data: a table extension, and not a README. */
export function isDataFile(name: string): boolean {
  return hasDataExtension(name) && !isReadme(name);
}

export type Attempt<T> = { ok: T } | { finding: Finding };

/** Runs a download; a blocked / refused / proxy-failed one becomes a finding, anything else is rethrown. */
export async function attempt<T>(label: string, run: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: await run() };
  } catch (e) {
    const finding = fetchErrorFinding(e, label);
    if (finding) return { finding };
    throw e;
  }
}

export function getJson(fetcher: Fetcher, url: string, label: string): Promise<Attempt<FetchResult>> {
  return attempt(label, () => fetcher.get(url, 'application/json'));
}

export const ok2xx = (r: FetchResult): boolean => r.status >= 200 && r.status < 300;

export function inaccessible(label: string, status: number, host: string, value?: string): Finding {
  return makeFinding('IN-RECORD-INACCESSIBLE', { file: label, params: { status, host }, ...(value ? { value } : {}) });
}

const MAX_NAMES = 10;

/** IN-NO-DATA-FILE; params.files lists the names found (comma-separated, capped), '—' when there are none. */
export function noDataFile(label: string, names: string[]): Finding {
  const shown = names.slice(0, MAX_NAMES).join(', ');
  const files = names.length === 0 ? '—' : names.length > MAX_NAMES ? `${shown}, … (+${names.length - MAX_NAMES})` : shown;
  return makeFinding('IN-NO-DATA-FILE', { file: label, params: { files } });
}

export function hostNotAllowed(label: string, url: string): Finding {
  return makeFinding('IN-HOST-NOT-ALLOWED', { file: label, params: { host: hostOf(url) } });
}

/** Checks the allowlist ourselves so the answer does not depend on which Fetcher is plugged in. */
export function allowed(url: string): boolean {
  return isAllowedHost(url);
}

export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}
