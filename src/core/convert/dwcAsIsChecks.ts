// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Finding } from '../types';
import type { AsIsResult } from './dwcAsIsTables';
import { eventFindings, metadataFindings, occurrenceTableFindings, tabFindings } from './validate';
import type { DatasetMetadata } from './metadata';

/*
 * The checks of an as-is archive: the Darwin Core checks of /check on the Event and Occurrence tables (DWC-TERM-MISSING, DWC-RECOMMENDED,
 * occurrenceStatus, dates, coordinates ...), a tab in a value, and the description of the dataset. Not repeated: the duplicate ids (the integrity
 * rules of this mode say them in the sheet's terms, with the source lines), ROW-MISSING-CODE (asked on the source by the converter, never in this mode),
 * and CONV-BASIS-UNSET when the file has its own basisOfRecord column. Lines of a table finding are mapped back to the lines of the source sheet.
 */
const SAID_BY_ASIS = new Set(['DWC-EVENTID-DUPLICATE', 'DWC-OCCURRENCEID-DUPLICATE', 'ROW-MISSING-CODE']);

export function asIsChecks(r: AsIsResult, metadata: DatasetMetadata, today?: string): Finding[] {
  const out: Finding[] = [];
  const back = (f: Finding, lines: number[]): Finding => (f.lines === undefined ? f : { ...f, lines: f.lines.map((l) => lines[l - 2] ?? l) });
  const hasBasis = r.tables.occurrence.columns.some((c) => c.header === 'basisOfRecord');
  if (r.tables.event.rows.length > 0) for (const f of eventFindings(r.tables.event, today === undefined ? {} : { today })) if (!SAID_BY_ASIS.has(f.ruleId)) out.push(back(f, r.lines.event));
  if (r.tables.occurrence.rows.length > 0) for (const f of occurrenceTableFindings(r.tables.occurrence)) if (!SAID_BY_ASIS.has(f.ruleId)) out.push(back(f, r.lines.occurrence));
  for (const f of tabFindings(r.tables)) out.push(back(f, f.file === r.tables.event.name ? r.lines.event : f.file === r.tables.occurrence.name ? r.lines.occurrence : r.lines.emof));
  for (const f of metadataFindings(metadata)) if (!(hasBasis && f.ruleId === 'CONV-BASIS-UNSET')) out.push(f);
  return out;
}
