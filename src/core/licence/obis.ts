// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

import { LICENCES, isLicence } from '../convert/metadata';
import { makeFinding } from '../rules/registryCheck';
import type { Finding } from '../types';
import type { LicenceAnalysis } from './analyse';

/**
 * What OBIS and GBIF accept of the licence the record states: one information line (LIC-OBIS-LICENCE), once per dataset, only when exactly
 * one recognised licence is stated (nothing to say about a missing, free-text or contradicting statement). The accepted list is the one
 * /convert uses (LICENCES), not a copy.
 *
 * Shown by /licence only. /check and /collection do not carry it: their tables hold warnings about the files, /collection would repeat the
 * line for every record, and /convert already says which licences it takes.
 */
export function obisLicenceFinding(a: LicenceAnalysis, file: string): Finding | undefined {
  const ids = [...new Set(a.sources.flatMap((s) => s.statements.flatMap((x) => (x.classification.kind === 'spdx' ? [x.classification.id] : []))))];
  if (ids.length !== 1) return undefined;
  return makeFinding('LIC-OBIS-LICENCE', { file, params: { licence: ids[0], accepts: LICENCES.join(', '), kind: isLicence(ids[0]) ? 'accepted' : 'not-accepted' } });
}
