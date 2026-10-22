// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The ONE definition of "this record could not be read": shared by the licence page loader and by /check, so that both stay
// silent about a licence ("no licence found") when the reason is a refused read.
import type { Finding } from '../types';

export const LOAD_FAILURES = ['IN-FETCH-BLOCKED', 'IN-FETCH-TIMEOUT', 'IN-HOST-NOT-ALLOWED', 'IN-RECORD-INACCESSIBLE'];

/**
 * The finding that says the record `label` could not be read, or undefined. Only the record's OWN failure counts (findings about
 * files, e.g. no data file, say nothing about the licence); a host that is not allowed counts only when nothing was loaded
 * (a landing host that is not allowed next to a record that was read is not a failure of the record).
 */
export function ownLoadFailure(findings: readonly Finding[], label: string, metadataCount: number): Finding | undefined {
  return findings.find((f) => LOAD_FAILURES.includes(f.ruleId) && f.file === label && (f.ruleId !== 'IN-HOST-NOT-ALLOWED' || metadataCount === 0));
}
