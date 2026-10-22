// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { parsePangaeaMetainfo } from '../metadata/pangaea';
import type { LoadedRecord, MetadataRecord } from '../types';
import { attempt, decodeUtf8, inaccessible, ok2xx } from './common';
import { lookupDatacite } from './datacite';
import type { Fetcher } from './fetcher';

export function pangaeaDoi(id: string): string {
  return `10.1594/PANGAEA.${id}`;
}

export function pangaeaTextfileUrl(id: string): string {
  return `https://doi.pangaea.de/${pangaeaDoi(id)}?format=textfile`;
}

export function pangaeaMetainfoUrl(id: string): string {
  return `https://doi.pangaea.de/${pangaeaDoi(id)}?format=metainfo_xml`;
}

/**
 * The licence page's loader: PANGAEA's own metadata XML (about 19 kB, no data file) plus the DataCite record. The licence and the
 * citation come from it. A failure is reported as a finding of this record (the DataCite record is kept when it was read).
 */
export async function loadPangaeaMetainfo(id: string, fetcher: Fetcher, known?: MetadataRecord): Promise<LoadedRecord> {
  const label = `PANGAEA ${id}`;
  let dc = known;
  if (!dc) {
    try {
      const lookup = await lookupDatacite(pangaeaDoi(id), fetcher, label);
      if ('record' in lookup) dc = lookup.record;
    } catch {
      // the PANGAEA record below reports its own failure
    }
  }
  const out: LoadedRecord = { label, kind: 'pangaea', metadata: dc ? [dc] : [], files: [], findings: [] };
  const host = 'doi.pangaea.de';
  const r = await attempt(label, () => fetcher.get(pangaeaMetainfoUrl(id), 'application/xml'));
  if ('finding' in r) return { ...out, findings: [r.finding] };
  if (!ok2xx(r.ok)) return { ...out, findings: [inaccessible(label, r.ok.status, host)] };
  try {
    out.metadata = [parsePangaeaMetainfo(decodeUtf8(r.ok.bytes), label), ...out.metadata];
  } catch {
    out.findings.push(inaccessible(label, r.ok.status, host, 'response is not PANGAEA metadata'));
  }
  return out;
}

/**
 * PANGAEA is one tab-separated textfile whose header carries the metadata. The DataCite record is optional
 * (`known` when the caller already has it); its absence is silent because the download itself will say
 * if the dataset does not exist.
 */
export async function loadPangaea(id: string, fetcher: Fetcher, known?: MetadataRecord): Promise<LoadedRecord> {
  const label = `PANGAEA ${id}`;
  let dc = known;
  if (!dc) {
    try {
      const lookup = await lookupDatacite(pangaeaDoi(id), fetcher, label);
      if ('record' in lookup) dc = lookup.record;
    } catch {
      // see above
    }
  }
  return {
    label,
    kind: 'pangaea',
    metadata: dc ? [dc] : [],
    files: [{ name: `PANGAEA.${id}.tab`, url: pangaeaTextfileUrl(id) }],
    findings: [],
  };
}
