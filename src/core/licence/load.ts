// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Loads the METADATA of one dataset from one or several references (DOI, Zenodo, PANGAEA, GeoNetwork). Never downloads data files.
// Used by the licence page and by the live corpus test, so both read records the same way.
import { sameDeposit } from './analyse';
import { ownLoadFailure } from './failure';
import type { Finding, LoadedRecord, MetadataRecord, MetadataSource } from '../types';
import { lookupDatacite } from '../sources/datacite';
import { fetchErrorFinding, type FetchResult, type Fetcher } from '../sources/fetcher';
import { loadPangaeaMetainfo, loadRecord, resolveInput } from '../sources';

/** A reference whose record could not be read. Never to be shown as "no licence". */
export interface LoadFailure {
  /** What the user pasted. */
  ref: string;
  /** The metadata source that stayed unread; undefined when the reference could not even be resolved. */
  source?: MetadataSource;
  /** The load finding (host and status only), rendered in the visitor's language. */
  finding?: Finding;
  /** No finding: the text is not a reference we know, or something unexpected happened (message). */
  reason?: 'unrecognised' | 'unexpected';
  message?: string;
}

export interface LicenceLoad {
  /** Deduplicated: one record per (source, DOI/label), whatever number of references led to it. */
  records: MetadataRecord[];
  failures: LoadFailure[];
}

const SOURCE_OF_KIND: Partial<Record<LoadedRecord['kind'], MetadataSource>> = {
  zenodo: 'zenodo',
  geonetwork: 'iso19139',
  datacite: 'datacite',
  pangaea: 'pangaea',
};

/** Lines of a pasted block: trimmed, empty ones dropped, repeated ones once. */
export function splitReferences(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== ''))];
}

const doiKey = (r: MetadataRecord): string => (r.doi ?? '').toLowerCase();

/** Same deposit seen twice: the same source and the same DOI, or the same label. */
function sameRecord(a: MetadataRecord, b: MetadataRecord): boolean {
  if (a.source !== b.source) return false;
  return a.label === b.label || (doiKey(a) !== '' && doiKey(a) === doiKey(b));
}

/** Each URL (with its Accept header) is fetched once; a failure is remembered too, so it is reported the same way every time. */
function once(inner: Fetcher): Fetcher {
  const seen = new Map<string, Promise<FetchResult>>();
  return {
    get(url, accept) {
      const key = `${accept ?? ''}|${url}`;
      let p = seen.get(key);
      if (!p) seen.set(key, (p = inner.get(url, accept)));
      return p;
    },
  };
}

/**
 * Loads every reference. A DOI whose record is known but whose DataCite record was not loaded is looked up at DataCite
 * (the Zenodo and PANGAEA loaders do that themselves; a GeoNetwork record with a DOI does not). A failed lookup is a failure of
 * source 'datacite', not an absent source.
 */
export async function loadLicenceReferences(
  refs: readonly string[],
  network: Fetcher,
  onProgress?: (done: number, total: number) => void,
): Promise<LicenceLoad> {
  // A DOI and a Zenodo link of the same deposit ask for the same URLs: each is fetched once per run.
  const fetcher = once(network);
  const records: MetadataRecord[] = [];
  const failures: LoadFailure[] = [];
  const add = (rec: MetadataRecord): void => {
    if (!records.some((r) => sameRecord(r, rec))) records.push(rec);
  };

  let done = 0;
  for (const ref of refs) {
    const resolved = resolveInput(ref);
    if (resolved.kind === 'unknown') {
      failures.push({ ref, reason: 'unrecognised' });
    } else {
      try {
        const loaded = await loadRecord(resolved, fetcher, { pangaea: loadPangaeaMetainfo });
        const source = SOURCE_OF_KIND[loaded.kind];
        // Only this record's own failure counts; findings about files (no data file, landing host) say nothing about the licence.
        const own = ownLoadFailure(loaded.findings, loaded.label, loaded.metadata.length);
        if (own) failures.push({ ref, ...(source ? { source } : {}), finding: own });
        for (const rec of loaded.metadata) add(rec);
      } catch (e) {
        const finding = fetchErrorFinding(e, ref);
        failures.push({ ref, ...(finding ? { finding } : { reason: 'unexpected' as const, message: e instanceof Error ? e.message : String(e) }) });
      }
    }
    onProgress?.(++done, refs.length);
  }

  // DataCite for every DOI that has none yet.
  for (const rec of [...records]) {
    const doi = rec.doi;
    if (!doi || rec.source === 'datacite') continue;
    // Already there: the DataCite record of this DOI, or (Zenodo, PANGAEA) one DataCite record of the same deposit. A concept DOI and a
    // version DOI are two DataCite records of ONE Zenodo deposit; the second is not asked for.
    if (records.some((r) => r.source === 'datacite' && (doiKey(r) === doi.toLowerCase() || sameDeposit(r, rec)))) continue;
    if (failures.some((f) => f.source === 'datacite' && f.ref === doi)) continue;
    const label = `DataCite ${doi}`;
    try {
      const look = await lookupDatacite(doi, fetcher, label);
      if ('record' in look) add(look.record);
      else failures.push({ ref: doi, source: 'datacite', finding: look.finding });
    } catch (e) {
      const finding = fetchErrorFinding(e, label);
      failures.push({ ref: doi, source: 'datacite', ...(finding ? { finding } : { reason: 'unexpected' as const, message: e instanceof Error ? e.message : String(e) }) });
    }
  }
  return { records, failures };
}
