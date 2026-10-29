// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RawCell } from '../types';
import { parseNumber } from '../values/numbers';

/*
 * A presence-only species list ("This is a list of species found", ticked by the user for a sheet): the species are there, nobody counted them. OBIS requires occurrenceStatus and does NOT
 * require a quantity (OBIS Manual, "How to format Occurrence tables", manual.obis.org/format_occurrence.html: the required terms are occurrenceID, eventID, occurrenceStatus, basisOfRecord,
 * scientificName, ...; organismQuantity is not among them), so a record is occurrenceStatus "present" with no organismQuantity and no organismQuantityType.
 *
 * Long sheet: every taxon row is one occurrence, present. Wide sheet: the cell under a species header is read as a mark:
 *   present   a non-empty mark: x X + * ✓ ✔ ☑, 1, yes / y / tak / ja / oui, present / obecny / obecna / obecne / vorhanden / présent
 *   absent    0, -, –, —, absent / nieobecny / abwesend / no / nie / nein / non: an absence ONLY with the user's full-species-list tick, else nothing is written
 *   blank     an empty cell: nothing is written
 *   unknown   anything else (a number above 1, a negative number, other text): NEVER guessed, the converter says which column and which value (CONV-PRESENCE-VALUE)
 */

export type PresenceMark = { kind: 'present' } | { kind: 'absent' } | { kind: 'blank' } | { kind: 'unknown'; text: string };

const PRESENT = new Set(['x', '+', '*', '✓', '✔', '☑', '✅', 'y', 'yes', 'tak', 'ja', 'oui', 'present', 'obecny', 'obecna', 'obecne', 'vorhanden', 'présent', 'presente', 'présente']);
const ABSENT = new Set(['-', '–', '—', 'absent', 'nieobecny', 'nieobecna', 'nieobecne', 'abwesend', 'no', 'nie', 'nein', 'non']);

export function presenceMark(raw: RawCell | undefined, decimalComma: boolean): PresenceMark {
  if (raw === null || raw === undefined) return { kind: 'blank' };
  const text = String(raw).trim();
  if (text === '') return { kind: 'blank' };
  const key = text.toLowerCase();
  if (PRESENT.has(key)) return { kind: 'present' };
  if (ABSENT.has(key)) return { kind: 'absent' };
  const p = parseNumber(raw, decimalComma);
  if (p.status === 'ok') {
    if (p.value === 1) return { kind: 'present' };
    if (p.value === 0) return { kind: 'absent' };
  }
  // NA and its variants are "no record", as everywhere else in the converter
  if (p.status === 'na-variant' || p.status === 'missing') return { kind: 'blank' };
  return { kind: 'unknown', text };
}
