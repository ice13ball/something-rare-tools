// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { LoadedRecord, MetadataRecord } from '../types';
import { lookupDatacite } from './datacite';
import type { Fetcher } from './fetcher';

export function pangaeaDoi(id: string): string {
  return `10.1594/PANGAEA.${id}`;
}

export function pangaeaTextfileUrl(id: string): string {
  return `https://doi.pangaea.de/${pangaeaDoi(id)}?format=textfile`;
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
