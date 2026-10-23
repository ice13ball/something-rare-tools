// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// GBIF and OBIS datasets: the registry (REST JSON, CORS-safe) names the Darwin Core Archive, the archive itself is
// downloaded from an IPT server, and ONLY from the static list of config/ipt.ts. Registry data is never trusted for the
// host: an archive URL off that list is a finding that names the host, not a download.
import { iptArchiveUrl } from '../../../config/ipt';
import { makeFinding } from '../rules/registry';
import type { Finding, LoadedRecord, MetadataRecord } from '../types';
import { decodeUtf8, getJson, inaccessible, ok2xx } from './common';
import { hostOf, type Fetcher } from './fetcher';
import type { GbifRef } from './resolve';

export const GBIF_HOST = 'api.gbif.org';
export const OBIS_HOST = 'api.obis.org';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

type Json = { json: unknown } | { finding: Finding };

/** One registry call: a network/proxy problem, a non-2xx answer or a body that is not JSON all become the record's finding. */
async function registryJson(fetcher: Fetcher, url: string, label: string, host: string): Promise<Json> {
  const r = await getJson(fetcher, url, label);
  if ('finding' in r) return r;
  if (!ok2xx(r.ok)) return { finding: inaccessible(label, r.ok.status, host) };
  try {
    return { json: JSON.parse(decodeUtf8(r.ok.bytes)) };
  } catch {
    return { finding: inaccessible(label, r.ok.status, host, 'response is not JSON') };
  }
}

const noArchive = (label: string, registry: 'GBIF' | 'OBIS'): LoadedRecord['findings'][number] =>
  makeFinding('IN-NO-DWC-ARCHIVE', { file: label, params: { registry } });

/** The record for an archive URL the registry gave: the file to download (named .zip, so the archive reader takes it), or a finding. */
function archiveRecord(label: string, kind: 'gbif' | 'obis', id: string, archiveUrl: string, known?: MetadataRecord): LoadedRecord {
  const out: LoadedRecord = { label, kind, metadata: known ? [known] : [], files: [], findings: [] };
  const url = iptArchiveUrl(archiveUrl);
  if (!url) {
    out.findings.push(makeFinding('IN-IPT-HOST-NOT-LISTED', { file: label, params: { host: hostOf(archiveUrl) || '?' } }));
    return out;
  }
  out.files.push({ name: `${id}.zip`, url });
  return out;
}

/**
 * GBIF dataset by DOI or key: /v1/dataset/doi/{doi} (results[0].key) or /v1/dataset/{key}, then /v1/dataset/{key}/endpoint,
 * the entry of type DWC_ARCHIVE gives the archive URL.
 */
export async function loadGbif(ref: GbifRef, fetcher: Fetcher, known?: MetadataRecord): Promise<LoadedRecord> {
  const label = `GBIF ${'doi' in ref ? ref.doi : ref.key}`;
  // `known` is the DataCite record that led here: it stays a metadata source (/check licence cross-check, /licence page).
  const fail = (f: Finding): LoadedRecord => ({ label, kind: 'gbif', metadata: known ? [known] : [], files: [], findings: [f] });

  let key: string;
  if ('doi' in ref) {
    const url = `https://${GBIF_HOST}/v1/dataset/doi/${ref.doi.split('/').map(encodeURIComponent).join('/')}`;
    const r = await registryJson(fetcher, url, label, GBIF_HOST);
    if ('finding' in r) return fail(r.finding);
    const first = isObj(r.json) && Array.isArray(r.json.results) ? (r.json.results[0] as unknown) : undefined;
    const k = isObj(first) ? first.key : undefined;
    // an empty result list is "no such dataset" (a GBIF download DOI, 10.15468/dl.…, is not a dataset)
    if (typeof k !== 'string' || !UUID.test(k)) return fail(inaccessible(label, 404, GBIF_HOST, 'no GBIF dataset has this DOI'));
    key = k.toLowerCase();
  } else {
    key = ref.key;
    // From DataCite the key is already vouched for by the landing page; the endpoint call below says "no such dataset" by itself.
    if (!known) {
      const r = await registryJson(fetcher, `https://${GBIF_HOST}/v1/dataset/${encodeURIComponent(key)}`, label, GBIF_HOST);
      if ('finding' in r) return fail(r.finding);
    }
  }

  const ep = await registryJson(fetcher, `https://${GBIF_HOST}/v1/dataset/${encodeURIComponent(key)}/endpoint`, label, GBIF_HOST);
  if ('finding' in ep) return fail(ep.finding);
  const endpoints = Array.isArray(ep.json) ? ep.json : [];
  const archive = endpoints.find((e): e is Obj & { url: string } => isObj(e) && e.type === 'DWC_ARCHIVE' && typeof e.url === 'string' && e.url.trim() !== '');
  if (!archive) return fail(noArchive(label, 'GBIF'));
  return archiveRecord(label, 'gbif', key, archive.url, known);
}

/** OBIS dataset by its UUID: /v3/dataset/{uuid}, results[0].archive is the archive URL (results[0].url is the IPT resource page). */
export async function loadObis(uuid: string, fetcher: Fetcher): Promise<LoadedRecord> {
  const label = `OBIS ${uuid}`;
  const fail = (f: Finding): LoadedRecord => ({ label, kind: 'obis', metadata: [], files: [], findings: [f] });
  const r = await registryJson(fetcher, `https://${OBIS_HOST}/v3/dataset/${encodeURIComponent(uuid)}`, label, OBIS_HOST);
  if ('finding' in r) return fail(r.finding);
  const first = isObj(r.json) && Array.isArray(r.json.results) ? (r.json.results[0] as unknown) : undefined;
  if (!isObj(first)) return fail(inaccessible(label, 404, OBIS_HOST, 'no OBIS dataset has this id')); // OBIS answers 200 with an empty list
  const archive = typeof first.archive === 'string' ? first.archive.trim() : '';
  if (archive === '') return fail(noArchive(label, 'OBIS'));
  return archiveRecord(label, 'obis', uuid, archive);
}
