// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ColumnProposal, ColumnRole } from '../types';
import { dwcTermOf } from '../recognize/columns';

/**
 * The eMoF terms of a long measurement sheet and the role each one means here. The role is proposed ONLY for the exact Darwin Core header of the term (any case, with or without the
 * `dwc:` or term-URI prefix): the author's own declaration, never a guess from the cells or from a nearby name. eventID, occurrenceID and scientificName keep the roles they have already
 * (sampleId, occurrenceId, taxon).
 */
export const EMOF_TERM_ROLES: Readonly<Record<string, ColumnRole>> = {
  measurementvalue: { kind: 'measurementValue' },
  measurementtype: { kind: 'measurementType' },
  measurementunit: { kind: 'measurementUnit' },
  measurementtypeid: { kind: 'measurementTypeId' },
  measurementunitid: { kind: 'measurementUnitId' },
  measurementvalueid: { kind: 'measurementValueId' },
  measurementaccuracy: { kind: 'measurementAccuracy' },
  measurementmethod: { kind: 'measurementMethod' },
  measurementremarks: { kind: 'measurementRemarks' },
};

export const EMOF_ROLE_KINDS: ReadonlySet<string> = new Set(Object.values(EMOF_TERM_ROLES).map((r) => r.kind));

/** Does the sheet have a column headed exactly measurementValue? Only then are the other measurement terms read as eMoF columns. */
export function hasEmofValueColumn(header: readonly string[]): boolean {
  return header.some((h) => dwcTermOf(h) === 'measurementvalue');
}

/** The eMoF roles for the exact-term columns of a sheet that has a measurementValue column (in place). A sheet without one is not touched. */
export function applyEmofRoles(header: readonly string[], base: ColumnProposal[], setReason: (p: ColumnProposal) => void): void {
  if (!hasEmofValueColumn(header)) return;
  for (const q of base) {
    const role = EMOF_TERM_ROLES[dwcTermOf(q.header) ?? ''];
    if (role === undefined) continue;
    q.role = { ...role };
    q.confidence = 'high';
    delete q.vetoed;
    setReason(q);
  }
}
