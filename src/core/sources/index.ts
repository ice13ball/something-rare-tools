// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Public entry of the source handlers: resolve what the user pasted, load the record (metadata + file list),
// download files on request. Network errors that the user can act on become input findings; everything else throws.
import type { LoadedRecord, MetadataRecord } from '../types';
import { allowed, hostNotAllowed, noDataFile } from './common';
import { lookupDatacite, routeFromDatacite } from './datacite';
import { FileFetchError, hostOf, HostNotAllowedError, type Fetcher } from './fetcher';
import { loadGbif, loadObis } from './gbif';
import { loadGeoNetwork } from './geonetwork';
import { loadPangaea } from './pangaea';
import { resolveInput, type ResolvedInput } from './resolve';
import { loadZenodo } from './zenodo';

export * from './fetcher';
export { resolveInput, DEFAULT_GEONETWORK_HOST, type ResolvedInput } from './resolve';
export { dataciteUrl, lookupDatacite, routeFromDatacite, type Route } from './datacite';
export { loadZenodo } from './zenodo';
export { loadGbif, loadObis } from './gbif';
export { loadGeoNetwork, geonetworkRecordUrl } from './geonetwork';
export { loadPangaea, loadPangaeaMetainfo, pangaeaMetainfoUrl, pangaeaTextfileUrl } from './pangaea';
export { DATA_EXTENSIONS, hasDataExtension } from './common';

/** The input could not be turned into a record reference ("unknown"): the UI asks the user to download and drop. */
export class UnresolvedInputError extends Error {
  constructor() {
    super('Unknown input: not a Zenodo, GeoNetwork, PANGAEA, GBIF, OBIS or DOI reference');
    this.name = 'UnresolvedInputError';
  }
}

/** Which loader reads a PANGAEA record: the textfile header (/check, default) or the metadata XML (licence page). */
export interface Loaders {
  pangaea?: (id: string, fetcher: Fetcher, known?: MetadataRecord) => Promise<LoadedRecord>;
}

async function loadDoi(doi: string, fetcher: Fetcher, loaders: Loaders): Promise<LoadedRecord> {
  const label = `DOI ${doi}`;
  const lookup = await lookupDatacite(doi, fetcher, label);
  if ('finding' in lookup) return { label, kind: 'datacite', metadata: [], files: [], findings: [lookup.finding] };
  const dc = lookup.record;
  const route = routeFromDatacite(dc, doi);
  switch (route.kind) {
    case 'zenodo':
      return loadZenodo(route.id, fetcher, dc);
    case 'geonetwork':
      return loadGeoNetwork(route.host, route.uuid, fetcher, dc);
    case 'pangaea':
      return (loaders.pangaea ?? loadPangaea)(route.id, fetcher, dc);
    case 'gbif':
      return loadGbif({ key: route.key }, fetcher, dc);
    case 'other': {
      const out: LoadedRecord = { label, kind: 'datacite', metadata: [dc], files: [], findings: [] };
      if (dc.landingUrl && !allowed(dc.landingUrl)) out.findings.push(hostNotAllowed(label, dc.landingUrl));
      else out.findings.push(noDataFile(label, []));
      return out;
    }
  }
}

export async function loadRecord(input: ResolvedInput, fetcher: Fetcher, loaders: Loaders = {}): Promise<LoadedRecord> {
  switch (input.kind) {
    case 'zenodo':
      return loadZenodo(input.id, fetcher);
    case 'geonetwork':
      return loadGeoNetwork(input.host, input.uuid, fetcher);
    case 'pangaea':
      return (loaders.pangaea ?? loadPangaea)(input.id, fetcher);
    case 'gbif':
      return loadGbif(input.ref, fetcher);
    case 'obis':
      return loadObis(input.uuid, fetcher);
    case 'doi':
      return loadDoi(input.doi, fetcher, loaders);
    case 'unknown':
      throw new UnresolvedInputError();
  }
}

/** Downloads one file of a loaded record. Throws FetchBlockedError / HostNotAllowedError / FileFetchError (non-2xx). */
export async function fetchFile(file: { name: string; url?: string }, fetcher: Fetcher): Promise<Uint8Array> {
  if (!file.url) throw new Error(`File ${file.name} has no url to download`);
  if (!allowed(file.url)) throw new HostNotAllowedError(hostOf(file.url));
  const res = await fetcher.get(file.url);
  if (res.status < 200 || res.status >= 300) throw new FileFetchError(res.status, hostOf(file.url));
  return res.bytes;
}
