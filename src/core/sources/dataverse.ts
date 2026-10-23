// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Dataverse datasets (RepOD and the other listed installations, config/dataverse.ts): the latest PUBLISHED version through the
// native API, its files and the licence it states. Never a draft: the :latest-published endpoint is the only one asked, and no
// credential is ever sent.
import { dataverseName, isDataverseHost, LINKED_FILE_MAX_BYTES } from '../../../config/dataverse';
import { doiOfPersistentId, parseDataverseVersion, type DataverseFile } from '../metadata/dataverse';
import { makeFinding } from '../rules/registry';
import type { Finding, LoadedRecord, MetadataRecord } from '../types';
import { attempt, decodeUtf8, extensionOf, hasDataExtension, hostNotAllowed, inaccessible, noDataFile, ok2xx } from './common';
import { lookupDatacite } from './datacite';
import type { Fetcher, FetchResult } from './fetcher';

/** The persistent id as it goes into the query: slashes stay, the first colon stays (doi:10.18150/C45FCC). */
function encodePid(pid: string): string {
  return pid.split('/').map(encodeURIComponent).join('/').replace('%3A', ':');
}

export function dataverseVersionUrl(host: string, pid: string): string {
  return `https://${host}/api/datasets/:persistentId/versions/:latest-published?persistentId=${encodePid(pid)}`;
}

/** Dataverse persistent ids are case-sensitive and the registry id may be typed in lower case: the same id with the suffix in upper case. */
function upperVariant(pid: string): string {
  const m = /^(doi:10\.\d{4,9}\/)(\S+)$/i.exec(pid);
  return m ? `${m[1]}${m[2]!.toUpperCase()}` : pid;
}

const MAX_NAMES = 10;
/** Documentation and pictures: not data, so not listed as "not read" (TIFF stays listed: GeoTIFF rasters are data). */
const DOCUMENT_EXTENSIONS: readonly string[] = ['pdf', 'doc', 'docx', 'odt', 'rtf', 'md', 'html', 'htm', 'png', 'jpg', 'jpeg', 'gif', 'svg'];
const listOf = (names: string[]): string => {
  if (names.length === 0) return '—';
  const shown = names.slice(0, MAX_NAMES).join(', ');
  return names.length > MAX_NAMES ? `${shown}, … (+${names.length - MAX_NAMES})` : shown;
};

/**
 * `pid` is the persistent id exactly as the DataCite landing page or the pasted link gives it ("doi:10.18150/C45FCC").
 * `known` is a DataCite record the caller already fetched for this DOI; without it the DataCite record is fetched for the licence
 * cross-check (a failure there is silent). No data file is downloaded here: the answer lists them.
 */
export async function loadDataverse(host: string, pid: string, fetcher: Fetcher, known?: MetadataRecord): Promise<LoadedRecord> {
  const name = dataverseName(host) ?? host;
  const label = `${name} ${doiOfPersistentId(pid) ?? pid.replace(/^[a-z]+:/i, '')}`;
  const out: LoadedRecord = { label, kind: 'dataverse', metadata: known ? [known] : [], files: [], findings: [] };
  const fail = (f: Finding): LoadedRecord => ({ ...out, findings: [f] });

  const url = dataverseVersionUrl(host, pid);
  if (!isDataverseHost(host)) return fail(hostNotAllowed(label, url));

  let usedPid = pid;
  let r = await attempt(label, () => fetcher.get(url, 'application/json'));
  if ('finding' in r) return fail(r.finding);
  if (r.ok.status === 404 && upperVariant(pid) !== pid) {
    const again = await attempt(label, () => fetcher.get(dataverseVersionUrl(host, upperVariant(pid)), 'application/json'));
    if ('finding' in again) return fail(again.finding);
    if (ok2xx(again.ok)) {
      r = again;
      usedPid = upperVariant(pid);
    }
  }
  const res: FetchResult = r.ok;
  if (!ok2xx(res)) return fail(inaccessible(label, res.status, host));
  let json: unknown;
  try {
    json = JSON.parse(decodeUtf8(res.bytes));
  } catch {
    return fail(inaccessible(label, res.status, host, 'response is not JSON'));
  }
  const read = parseDataverseVersion(json, label, { host, pid: usedPid });
  if (!read) return fail(inaccessible(label, res.status, host, 'response is not Dataverse metadata'));
  // :latest-published cannot answer with a draft; if some server did, it is not read.
  if (read.versionState && read.versionState.toUpperCase() !== 'RELEASED') return fail(inaccessible(label, 404, host, `version state ${read.versionState}`));
  out.metadata = [read.record, ...out.metadata];

  const doi = read.record.doi;
  if (!known && doi) {
    try {
      const lookup = await lookupDatacite(doi, fetcher, label);
      if ('record' in lookup) out.metadata.push(lookup.record);
    } catch {
      // Not fatal: the licence cross-check simply has one source fewer.
    }
  }

  const readable = read.files.filter((f) => hasDataExtension(f.name));
  const toRead: DataverseFile[] = [];
  // Files the tool cannot read that may hold data (zip, NetCDF, SPSS...): named, so the report never reads as if the whole dataset was checked.
  const notRead: string[] = [];
  for (const f of read.files) {
    const data = hasDataExtension(f.name);
    if (!data && DOCUMENT_EXTENSIONS.includes(extensionOf(f.name))) continue;
    if (f.heldBack) out.findings.push(makeFinding('IN-FILE-HELD-BACK', { file: f.name, params: { host } }));
    else if (!data) notRead.push(f.name);
    else if (f.size !== undefined && f.size > LINKED_FILE_MAX_BYTES) out.findings.push(makeFinding('IN-FILE-TOO-LARGE', { file: f.name, params: { mb: Math.round(LINKED_FILE_MAX_BYTES / 1024 / 1024) } }));
    else toRead.push(f);
  }
  out.files = toRead.map((f) => ({ name: f.name, url: f.url }));
  // No table at all: one error naming every file (IN-NO-DATA-FILE) says it; the held-back notes above stay.
  if (readable.length === 0) out.findings.push(noDataFile(label, read.files.map((f) => f.name)));
  else if (notRead.length > 0) out.findings.push(makeFinding('IN-FILES-NOT-READ', { file: label, params: { files: listOf(notRead) } }));

  const original = toRead.filter((f) => f.form === 'original').map((f) => f.name);
  const converted = toRead.filter((f) => f.form === 'tab').map((f) => f.name);
  const value = [original.length > 0 ? `original read: ${listOf(original)}` : '', converted.length > 0 ? `.tab read: ${listOf(converted)}` : ''].filter((x) => x !== '').join('; ');
  out.findings.push(
    makeFinding('IN-DATAVERSE-FILES', {
      file: label,
      ...(value ? { value } : {}),
      params: {
        host,
        version: read.versionLabel ?? '—',
        ...(original.length > 0 ? { original: listOf(original) } : {}),
        ...(converted.length > 0 ? { converted: listOf(converted) } : {}),
        ...(toRead.length === 0 && readable.length > 0 ? { none: 'yes' } : {}),
      },
    }),
  );
  return out;
}
