// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { parseZenodoRecord } from '../metadata/zenodo';
import type { Finding, LoadedRecord, MetadataRecord } from '../types';
import { decodeUtf8, getJson, inaccessible, isDataFile, noDataFile, ok2xx } from './common';
import { lookupDatacite } from './datacite';
import type { Fetcher } from './fetcher';

export const ZENODO_HOST = 'zenodo.org';

/**
 * Zenodo record via the API (CORS-safe). `known` is a DataCite record the caller already fetched for this DOI;
 * without it the DataCite record of the record's DOI is fetched for licence cross-checks (a failure there is silent).
 */
export async function loadZenodo(id: string, fetcher: Fetcher, known?: MetadataRecord): Promise<LoadedRecord> {
  const label = `Zenodo ${id}`;
  const out: LoadedRecord = { label, kind: 'zenodo', metadata: known ? [known] : [], files: [], findings: [] };
  const finding = (f: Finding): LoadedRecord => ({ ...out, findings: [f] });

  const r = await getJson(fetcher, `https://${ZENODO_HOST}/api/records/${encodeURIComponent(id)}`, label);
  if ('finding' in r) return finding(r.finding);
  if (!ok2xx(r.ok)) return finding(inaccessible(label, r.ok.status, ZENODO_HOST));
  let json: unknown;
  try {
    json = JSON.parse(decodeUtf8(r.ok.bytes));
  } catch {
    return finding(inaccessible(label, r.ok.status, ZENODO_HOST, 'response is not JSON'));
  }
  const rec = parseZenodoRecord(json, label);
  out.metadata = [rec];

  let dc = known;
  if (!dc) {
    try {
      const lookup = await lookupDatacite(rec.doi ?? `10.5281/zenodo.${id}`, fetcher, label);
      if ('record' in lookup) dc = lookup.record;
    } catch {
      // Not fatal: the licence cross-check simply has one source fewer.
    }
  }
  if (dc) out.metadata.push(dc);

  const all = rec.files ?? [];
  out.files = all.filter((f) => isDataFile(f.key)).map((f) => ({ name: f.key, url: f.url }));
  if (out.files.length === 0) out.findings.push(noDataFile(label, all.map((f) => f.key)));
  return out;
}
