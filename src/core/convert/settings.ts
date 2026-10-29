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
 *   nvs=yes           the NVS opt-in was ticked (stage 5). Read as a PRE-TICK only, like worms=yes: it ticks the box and nothing more. Nothing is sent until the user
 *                     types a search word for a column and presses "Search NVS". The file holds no word, code, label or identifier.
 *   profile=<sheet>    (stage 6) the sheet of that name was marked "profile / environment of this cruise". Read as a PRE-TICK only: it ticks that box for a sheet of the same
 *                     name in this drop and changes nothing else; the user can untick it. The value is a sheet name (never a data value).
 *   profileDepthIds=<sheet>  (stage 6) the user approved level IDs made of the station and the depth as written for that sheet. A PRE-TICK only, and only on a sheet that is
 *                     marked as a profile: it ticks the approval box on the page, where it can be unticked.
 *   profileIgnoreCast=<sheet>  (stage 7) the user ticked "match stations ignoring a trailing cast number" for that sheet. A PRE-TICK only, on a sheet marked as a profile.
 *   longAsTable=<sheet>  the sheet of that name has one row per measurement (a parameter and a value column) and the user chose to read it as a normal table instead of one row per sample
 *                     (core/convert/pivot.ts). A PRE-TICK only: it makes the sheet of that name in this drop be read that way, and the user can undo it on the page. A sheet name, never a value.
 * An unknown name or value is ignored.
 */
export const FULL_LIST_SETTING = 'fullList=yes';
export const STATION_PREFIX_SETTING = 'stationPrefix=yes';
export const WORMS_SETTING = 'worms=yes';
export const NVS_SETTING = 'nvs=yes';
export const PROFILE_SETTING = 'profile=';
export const PROFILE_DEPTH_IDS_SETTING = 'profileDepthIds=';
export const PROFILE_IGNORE_CAST_SETTING = 'profileIgnoreCast=';
export const LONG_AS_TABLE_SETTING = 'longAsTable=';
/** At most this many sheet names are kept from a companion file, each at most this long (a sheet name is short; anything else is not one). */
export const MAX_SETTING_SHEETS = 100;
export const MAX_SETTING_NAME = 255;

export interface ConvertSettings {
  fullList: boolean;
  prefixStation: boolean;
  /** The WoRMS opt-in was ticked in the run that wrote the file: pre-ticks the box, never sends anything. */
  worms: boolean;
  /** The NVS opt-in was ticked in the run that wrote the file: pre-ticks the box, never sends anything. */
  nvs: boolean;
  /** Stage 6: the sheets marked as profile files, by sheet name. Only present when there is at least one. A pre-tick only. */
  profileSheets?: string[];
  /** Stage 6: the profile sheets whose level IDs of station and depth the user approved, by sheet name. Only present when there is at least one. A pre-tick only. */
  profileDepthIds?: string[];
  /** Stage 7: the profile sheets whose stations the user matched ignoring a trailing cast number, by sheet name. Only present when there is at least one. A pre-tick only. */
  profileIgnoreCast?: string[];
  /** The long environmental sheets the user chose to read as normal tables, by sheet name. Only present when there is at least one. A pre-tick only. */
  longAsTable?: string[];
}

const addName = (list: string[], name: string): void => {
  if (name !== '' && name.length <= MAX_SETTING_NAME && list.length < MAX_SETTING_SHEETS && !list.includes(name)) list.push(name);
};

/** The converter's settings of a sidecar file, or undefined when the file is not a sidecar (it is then a data table). */
export function readConvertSettings(parsed: ParsedFile): ConvertSettings | undefined {
  if (readMappingFile(parsed) === undefined) return undefined;
  const settings: ConvertSettings = { fullList: false, prefixStation: false, worms: false, nvs: false };
  for (const row of parsed.sheets[0].rows) {
    if (String(row.cells[0] ?? '').trim() !== SETTING_ROW) continue;
    const v = String(row.cells[1] ?? '').trim();
    if (v === FULL_LIST_SETTING) settings.fullList = true;
    else if (v === STATION_PREFIX_SETTING) settings.prefixStation = true;
    else if (v === WORMS_SETTING) settings.worms = true;
    else if (v === NVS_SETTING) settings.nvs = true;
    else if (v.startsWith(PROFILE_SETTING)) addName((settings.profileSheets ??= []), v.slice(PROFILE_SETTING.length));
    else if (v.startsWith(PROFILE_DEPTH_IDS_SETTING)) addName((settings.profileDepthIds ??= []), v.slice(PROFILE_DEPTH_IDS_SETTING.length));
    else if (v.startsWith(PROFILE_IGNORE_CAST_SETTING)) addName((settings.profileIgnoreCast ??= []), v.slice(PROFILE_IGNORE_CAST_SETTING.length));
    else if (v.startsWith(LONG_AS_TABLE_SETTING)) addName((settings.longAsTable ??= []), v.slice(LONG_AS_TABLE_SETTING.length));
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
      ...(settings.nvs ? [line([SETTING_ROW, NVS_SETTING, '', '', ''])] : []),
      ...(settings.profileSheets ?? []).filter((n) => n.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((n) => line([SETTING_ROW, `${PROFILE_SETTING}${n}`, '', '', ''])),
      ...(settings.profileDepthIds ?? []).filter((n) => n.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((n) => line([SETTING_ROW, `${PROFILE_DEPTH_IDS_SETTING}${n}`, '', '', ''])),
      ...(settings.profileIgnoreCast ?? []).filter((n) => n.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((n) => line([SETTING_ROW, `${PROFILE_IGNORE_CAST_SETTING}${n}`, '', '', ''])),
      ...(settings.longAsTable ?? []).filter((n) => n.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((n) => line([SETTING_ROW, `${LONG_AS_TABLE_SETTING}${n}`, '', '', ''])),
    ].join('\n') + '\n'
  );
}
