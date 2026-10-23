// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The ONE definition of "this record could not be read": shared by the licence page loader and by /check, so that both stay
// silent about a licence ("no licence found") when the reason is a refused read.
import type { Finding, LoadedRecord } from '../types';

export const LOAD_FAILURES = ['IN-FETCH-BLOCKED', 'IN-FETCH-TIMEOUT', 'IN-HOST-NOT-ALLOWED', 'IN-RECORD-INACCESSIBLE'];

/**
 * The finding that says the record `label` could not be read, or undefined. Only the record's OWN failure counts (findings about
 * files, e.g. no data file, say nothing about the licence). A host that is not allowed is a failed read of a metadata source
 * (a GeoNetwork, Zenodo or PANGAEA record), even when the DataCite record that led there was read. The one exception is a DOI
 * routed to no supported repository (kind 'datacite' with its DataCite record read): there the host is only a landing page,
 * which the tool would not read as metadata anyway.
 */
export function ownLoadFailure(findings: readonly Finding[], label: string, kind: LoadedRecord['kind'], metadataCount: number): Finding | undefined {
  const landingOnly = kind === 'datacite' && metadataCount > 0;
  return findings.find((f) => LOAD_FAILURES.includes(f.ruleId) && f.file === label && (f.ruleId !== 'IN-HOST-NOT-ALLOWED' || !landingOnly));
}

/**
 * A DOI routed to no supported repository whose landing page is on a host that is not allowed (kind 'datacite', its DataCite record
 * read): the repository was never opened, so its own metadata may state a licence the tool did not see. Not a failed read of DataCite
 * (ownLoadFailure stays undefined), but no "no licence in the metadata" either: an empty DataCite record is then LIC-DATACITE-EMPTY
 * ("—"), as for any record that could not be read.
 */
export function landingNotRead(findings: readonly Finding[], label: string, kind: LoadedRecord['kind'], metadataCount: number): Finding | undefined {
  if (kind !== 'datacite' || metadataCount === 0) return undefined;
  return findings.find((f) => f.ruleId === 'IN-HOST-NOT-ALLOWED' && f.file === label);
}
