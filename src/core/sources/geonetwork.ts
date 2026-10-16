// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { parseIso19139 } from '../metadata/iso19139';
import type { Finding, LoadedRecord, MetadataRecord } from '../types';
import { allowed, decodeUtf8, hasDataExtension, hostNotAllowed, inaccessible, noDataFile, ok2xx, attempt } from './common';
import { hostOf, type Fetcher } from './fetcher';

export function geonetworkRecordUrl(host: string, uuid: string): string {
  return `https://${host}/geonetwork/srv/api/records/${uuid}/formatters/xml`;
}

// OPeNDAP service suffixes that describe a dataset instead of delivering it.
const OPENDAP_SERVICE = /\.(html?|das|dds|dods|ddx|info|ver|help)$/i;
const OPENDAP_CSV = '/opendap/data/csv/';

function fileNameOf(u: URL): string {
  let last = u.pathname.split('/').filter(Boolean).pop() ?? 'data';
  try {
    last = decodeURIComponent(last);
  } catch {
    // keep the raw segment
  }
  return hasDataExtension(last) ? last : `${last}.csv`;
}

/** A distribution link that delivers a table: data extension, or an OPeNDAP CSV path. Landing pages and DOIs are not. */
function dataLink(link: { url: string; protocol?: string }): URL | undefined {
  if (link.url.trim() === '') return undefined;
  if (link.protocol?.toUpperCase() === 'DOI') return undefined;
  let u: URL;
  try {
    u = new URL(link.url.trim());
  } catch {
    return undefined;
  }
  if (u.hostname.toLowerCase() === 'doi.org' || u.hostname.toLowerCase() === 'dx.doi.org') return undefined;
  if (OPENDAP_SERVICE.test(u.pathname)) return undefined;
  if (hasDataExtension(u.pathname) || u.pathname.includes(OPENDAP_CSV)) return u;
  return undefined;
}

function dataFiles(links: MetadataRecord['distributionLinks'], label: string): { files: LoadedRecord['files']; findings: Finding[] } {
  const files: LoadedRecord['files'] = [];
  const findings: Finding[] = [];
  const seenUrls = new Set<string>();
  const seenHosts = new Set<string>();
  for (const link of links) {
    const u = dataLink(link);
    if (!u) continue;
    const url = u.href;
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    if (!allowed(url)) {
      const host = hostOf(url);
      if (!seenHosts.has(host)) {
        seenHosts.add(host);
        findings.push(hostNotAllowed(label, url));
      }
      continue;
    }
    files.push({ name: fileNameOf(u), url });
  }
  return { files, findings };
}

/**
 * GeoNetwork record as ISO 19139 XML. `known` is the DataCite record that led here (kept when the record is
 * not readable). An unpublished record answers 403; a sign-in page answers 200 HTML: both are "inaccessible".
 */
export async function loadGeoNetwork(host: string, uuid: string, fetcher: Fetcher, known?: MetadataRecord): Promise<LoadedRecord> {
  const label = `GeoNetwork ${uuid}`;
  const out: LoadedRecord = { label, kind: 'geonetwork', metadata: known ? [known] : [], files: [], findings: [] };
  const url = geonetworkRecordUrl(host, uuid);
  if (!allowed(url)) return { ...out, findings: [hostNotAllowed(label, url)] };

  const r = await attempt(label, () => fetcher.get(url, 'application/xml'));
  if ('finding' in r) return { ...out, findings: [r.finding] };
  if (!ok2xx(r.ok)) return { ...out, findings: [inaccessible(label, r.ok.status, host)] };

  let iso: MetadataRecord;
  try {
    iso = parseIso19139(decodeUtf8(r.ok.bytes), label);
  } catch {
    return { ...out, findings: [inaccessible(label, r.ok.status, host, 'response is not an ISO 19139 record (sign-in page?)')] };
  }
  out.metadata = known ? [iso, known] : [iso];
  const { files, findings } = dataFiles(iso.distributionLinks, label);
  out.files = files;
  out.findings.push(...findings);
  if (files.length === 0 && findings.length === 0) out.findings.push(noDataFile(label, []));
  return out;
}
