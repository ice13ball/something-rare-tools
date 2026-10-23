// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// DataCite lookup (REST JSON) and routing of a DOI to the repository that holds the data.
import { parseDataciteJson } from '../metadata/datacite';
import type { Finding, MetadataRecord } from '../types';
import { attempt, decodeUtf8, inaccessible, ok2xx } from './common';
import type { Fetcher } from './fetcher';

export const DATACITE_HOST = 'api.datacite.org';

/** Slashes of the DOI stay; every other reserved character is escaped. DataCite accepts any letter case. */
export function dataciteUrl(doi: string): string {
  return `https://${DATACITE_HOST}/dois/${doi.split('/').map(encodeURIComponent).join('/')}`;
}

export type DataciteLookup = { record: MetadataRecord } | { finding: Finding };

/** `label` is the "file" of any finding, not part of the request. */
export async function lookupDatacite(doi: string, fetcher: Fetcher, label: string): Promise<DataciteLookup> {
  const r = await attempt(label, () => fetcher.get(dataciteUrl(doi), 'application/json'));
  if ('finding' in r) return r;
  const res = r.ok;
  if (!ok2xx(res)) return { finding: inaccessible(label, res.status, DATACITE_HOST) };
  let json: unknown;
  try {
    json = JSON.parse(decodeUtf8(res.bytes));
  } catch {
    return { finding: inaccessible(label, res.status, DATACITE_HOST, 'response is not JSON') };
  }
  return { record: parseDataciteJson(json, `DataCite ${doi}`) };
}

export type Route =
  | { kind: 'zenodo'; id: string }
  | { kind: 'geonetwork'; host: string; uuid: string }
  | { kind: 'pangaea'; id: string }
  | { kind: 'gbif'; key: string }
  | { kind: 'other'; host?: string };

const ZENODO_DOI = /^10\.5281\/zenodo\.(\d+)$/i;
const PANGAEA_DOI = /^10\.1594\/pangaea\.(\d+)$/i;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Where does this DOI's landing page live? The DOI suffix is the fallback for Zenodo and PANGAEA. */
export function routeFromDatacite(rec: MetadataRecord, doi: string): Route {
  const own = rec.doi ?? doi;
  let url: URL | undefined;
  try {
    url = rec.landingUrl ? new URL(rec.landingUrl) : undefined;
  } catch {
    url = undefined;
  }
  const host = url?.hostname.toLowerCase();
  const path = url?.pathname ?? '';

  if (host === 'zenodo.org' || host === 'www.zenodo.org') {
    const m = /\/records?\/(\d+)/.exec(path) ?? /\/doi\/10\.\d+\/zenodo\.(\d+)/i.exec(path);
    const id = m?.[1] ?? ZENODO_DOI.exec(own)?.[1] ?? ZENODO_DOI.exec(doi)?.[1];
    if (id) return { kind: 'zenodo', id };
  }
  if (host && (host.startsWith('geonetwork.') || /\/geonetwork\//i.test(path))) {
    const m = UUID.exec(path);
    if (m) return { kind: 'geonetwork', host, uuid: m[0].toLowerCase() };
  }
  if (host === 'www.gbif.org' || host === 'gbif.org') {
    const m = new RegExp(`^/(?:[a-z]{2,3}(?:-[a-z]{2,4})?/)?dataset/(${UUID.source})`, 'i').exec(path);
    if (m) return { kind: 'gbif', key: m[1]!.toLowerCase() };
  }
  if (host === 'doi.pangaea.de') {
    const m = /\/10\.1594\/PANGAEA\.(\d+)/i.exec(path);
    if (m) return { kind: 'pangaea', id: m[1]! };
  }
  // No usable landing page: the DOI itself may still name the repository.
  const z = ZENODO_DOI.exec(own) ?? ZENODO_DOI.exec(doi);
  if (z && !url) return { kind: 'zenodo', id: z[1]! };
  const p = PANGAEA_DOI.exec(own) ?? PANGAEA_DOI.exec(doi);
  if (p && !url) return { kind: 'pangaea', id: p[1]! };
  return { kind: 'other', host };
}
