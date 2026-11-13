// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ConvertSheetInput } from './build';

/**
 * Whether "each row is its own record" can be offered for a sheet, and honoured by the converter: decided here and nowhere else (build.ts, the page's tick and both buttons call it).
 * Only a long sheet with a taxon cell column and no occurrenceID column of its own; never a profile sheet, a pivoted sheet or a sheet turned from columns to rows.
 * It takes the sheet only for its `pivot` and `turn` marks (a turned record has no single source line), so the page, which holds a summary of the sheet and not the sheet, calls it with those marks.
 * The tick itself (`ownRecords`) is the person's; this says only whether it means anything for the sheet.
 */
export function ownRecordsEligible(sin: Pick<ConvertSheetInput, 'shape' | 'profile' | 'mapping'>, sheet: { pivot?: unknown; turn?: unknown }): boolean {
  if (sin.shape !== 'long' || sin.profile !== undefined || sheet.pivot !== undefined || sheet.turn !== undefined) return false;
  const roles = sin.mapping.columns;
  return roles.some((c) => c.role.kind === 'taxon' && c.role.header !== true) && !roles.some((c) => c.role.kind === 'occurrenceId');
}
