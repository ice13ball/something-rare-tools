// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ParsedFile } from '../types';

/*
 * The companion mapping file is the sidecar CSV that /check offers next to the clean CSV (src/core/output/csv.ts):
 * `original_column,output_column,unit,unit_source,p01`, one row per column, notes as rows `(note),text,,,`.
 * Settings that belong to the whole dataset, not to a column, are rows `(setting),name=value,,,`. The only one so far is
 * `singleCruise=yes` ("all measurements in these files come from one cruise of one ship").
 *
 * The file is the ONLY place that setting is kept: nothing in the browser (no localStorage, no cookie, no module state)
 * remembers it, so it can never reach a different set of files. Dropping the sidecar next to the files of a new run
 * restores it; a sidecar from before the setting existed simply has no such row (= not declared); an unknown setting
 * name or value is ignored.
 */
export const SIDECAR_HEADER: readonly string[] = ['original_column', 'output_column', 'unit', 'unit_source', 'p01'];
export const SETTING_ROW = '(setting)';
export const SINGLE_CRUISE_SETTING = 'singleCruise=yes';

export interface MappingFileSettings {
  singleCruise: boolean;
}

/** The settings of a sidecar, or undefined when the file is not one (it is then a data table as before). */
export function readMappingFile(parsed: ParsedFile): MappingFileSettings | undefined {
  if (parsed.kind !== 'csv' || parsed.sheets.length !== 1) return undefined;
  const sheet = parsed.sheets[0];
  const header = sheet.header.map((h) => h.trim());
  if (header.length !== SIDECAR_HEADER.length || header.some((h, i) => h !== SIDECAR_HEADER[i])) return undefined;
  const settings: MappingFileSettings = { singleCruise: false };
  for (const row of sheet.rows) {
    if (String(row.cells[0] ?? '').trim() !== SETTING_ROW) continue;
    if (String(row.cells[1] ?? '').trim() === SINGLE_CRUISE_SETTING) settings.singleCruise = true;
  }
  return settings;
}
