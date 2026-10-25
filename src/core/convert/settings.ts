// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { csvField } from '../output/csv';
import { SETTING_ROW, SIDECAR_HEADER, readMappingFile } from '../parse/mappingFile';
import type { ParsedFile } from '../types';

/*
 * The converter's companion file: the same sidecar format /check writes (`original_column,output_column,unit,unit_source,p01`, settings as
 * rows `(setting),name=value,,,`), so a /convert sidecar dropped on /check is recognised as a sidecar, is not read as data, and changes nothing
 * there: /check reads only `singleCruise=yes` and ignores every other setting (parse/mappingFile.ts, test/convert/settings.test.ts).
 *
 * Like singleCruise, these settings live ONLY in the file: nothing in the browser remembers them, so they can never reach another upload.
 *   fullList=yes       "this is a full species list": 0 = absent
 *   stationPrefix=yes  sample eventIDs are prefixed with the station eventID
 *   worms=yes          the WoRMS opt-in was ticked. Read as a PRE-TICK only: it ticks the box and nothing more. Nothing is sent until the user presses the lookup button.
 * More settings (the NVS opt-in) arrive in a later stage; an unknown name or value is ignored.
 */
export const FULL_LIST_SETTING = 'fullList=yes';
export const STATION_PREFIX_SETTING = 'stationPrefix=yes';
export const WORMS_SETTING = 'worms=yes';

export interface ConvertSettings {
  fullList: boolean;
  prefixStation: boolean;
  /** The WoRMS opt-in was ticked in the run that wrote the file: pre-ticks the box, never sends anything. */
  worms: boolean;
}

/** The converter's settings of a sidecar file, or undefined when the file is not a sidecar (it is then a data table). */
export function readConvertSettings(parsed: ParsedFile): ConvertSettings | undefined {
  if (readMappingFile(parsed) === undefined) return undefined;
  const settings: ConvertSettings = { fullList: false, prefixStation: false, worms: false };
  for (const row of parsed.sheets[0].rows) {
    if (String(row.cells[0] ?? '').trim() !== SETTING_ROW) continue;
    const v = String(row.cells[1] ?? '').trim();
    if (v === FULL_LIST_SETTING) settings.fullList = true;
    else if (v === STATION_PREFIX_SETTING) settings.prefixStation = true;
    else if (v === WORMS_SETTING) settings.worms = true;
  }
  return settings;
}

/** The companion file of a conversion: the header and one `(setting)` row per ticked setting. */
export function writeConvertSidecar(settings: Partial<ConvertSettings>): string {
  const line = (fields: readonly string[]): string => fields.map(csvField).join(',');
  return (
    [
      line(SIDECAR_HEADER),
      ...(settings.fullList ? [line([SETTING_ROW, FULL_LIST_SETTING, '', '', ''])] : []),
      ...(settings.prefixStation ? [line([SETTING_ROW, STATION_PREFIX_SETTING, '', '', ''])] : []),
      ...(settings.worms ? [line([SETTING_ROW, WORMS_SETTING, '', '', ''])] : []),
    ].join('\n') + '\n'
  );
}
