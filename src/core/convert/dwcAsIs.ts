// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ParsedFile, RawSheet } from '../types';
import { termOf } from './dwcTerms';

/*
 * Is a workbook (or several files dropped together) already in Darwin Core? A PROPOSAL only: the person confirms it once ("Pack as Darwin Core as it
 * is" or "Map the columns myself"); nothing is read from cell values, only from the header names.
 *
 * A sheet is read as
 *   Event       eventID and eventType (or eventDate), OR eventID without occurrenceID / measurementType, when most headers are terms
 *   Occurrence  occurrenceID, eventID and scientificName
 *   eMoF        measurementType and measurementValue (linked by occurrenceID and/or eventID)
 * THRESHOLD: the identifying columns are present AND at least half (>= 50 %) of the sheet's non-empty headers are Darwin Core / eMoF terms, so a
 * few of the author's own columns (stationID, replicate) do not stop it. The proposal exists only when exactly one sheet reads as Event, exactly one as
 * Occurrence and at most one as eMoF; anything else is left to the mapping flow.
 */

export const TERM_SHARE = 0.5;

export type DwcLevel = 'event' | 'occurrence' | 'emof';
export interface SheetRef {
  /** Index into the list of files the proposal was made from. */
  file: number;
  sheet: string;
}
export interface DwcProposal {
  event: SheetRef;
  occurrence: SheetRef;
  emof?: SheetRef;
}

/** The level a sheet reads as, or undefined. */
export function levelOf(sheet: RawSheet): DwcLevel | undefined {
  const heads = sheet.header.filter((h) => h.trim() !== '');
  if (heads.length === 0) return undefined;
  const names = new Set<string>();
  let terms = 0;
  for (const h of heads) {
    const t = termOf(h);
    if (t === undefined) continue;
    terms++;
    names.add(t.name);
  }
  if (terms / heads.length < TERM_SHARE) return undefined;
  if (names.has('measurementType') && names.has('measurementValue')) return 'emof';
  if (names.has('occurrenceID') && names.has('eventID') && names.has('scientificName')) return 'occurrence';
  if (names.has('eventID') && !names.has('occurrenceID') && (names.has('eventDate') || names.has('eventType') || names.has('parentEventID'))) return 'event';
  return undefined;
}

/** The proposal for the files of a request, or null when they are not (clearly) one Event, one Occurrence and at most one eMoF sheet. */
export function proposeDwcAsIs(files: readonly Pick<ParsedFile, 'sheets' | 'kind'>[]): DwcProposal | null {
  const found: Record<DwcLevel, SheetRef[]> = { event: [], occurrence: [], emof: [] };
  files.forEach((f, file) => {
    if (f.kind === 'metadata' || f.kind === 'pdf') return;
    for (const s of f.sheets) {
      const level = levelOf(s);
      if (level !== undefined) found[level].push({ file, sheet: s.name });
    }
  });
  if (found.event.length !== 1 || found.occurrence.length !== 1 || found.emof.length > 1) return null;
  return { event: found.event[0], occurrence: found.occurrence[0], ...(found.emof.length === 1 ? { emof: found.emof[0] } : {}) };
}
