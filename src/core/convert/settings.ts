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
 *   transposedAsTable=<sheet>  the sheet of that name looked transposed (species or variables in rows; core/convert/transposed.ts) and the user chose to read it as a normal table. A PRE-TICK only,
 *                     undone on the page. A sheet name, never a value.
 *   presenceOnly=<sheet>  the sheet of that name was ticked "This is a list of species found (presence only, no counts)". A PRE-TICK only; the user can undo it on the page. A sheet name, never a value.
 *   totalOnce=<sheet>  the sheet of that name repeats a per-taxon total on the rows of its size classes (CONV-QUANTITY-REPEATED) and the user chose to write one occurrence per sample and taxon. A PRE-TICK only; the user can undo it on the page,
 *                     and a sheet without that pattern ignores it. A sheet name, never a value.
 *   biomassBasis=<basis>:<sheet>  the biomass / weight columns of the sheet of that name were given the kind of mass <basis> (wet | dry | afdw). A PRE-PICK only: it sets that kind on the biomass
 *                     columns of a sheet of the same name that have none, and the user can change it on the page. A basis word and a sheet name, never a value.
 *   perOccurrence=<on|off>:<sheet>:<column>  the tick "of each organism" of a measured-variable column of a long sheet: on = ticked, off = the tool proposed it ticked and the user took it back. A PRE-PICK only: it
 *                     sets the tick on the column of that header in a sheet of the same name (a sheet name has no colon; the header is the rest of the line), and the user can change it on the page.
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
export const TRANSPOSED_AS_TABLE_SETTING = 'transposedAsTable=';
export const PRESENCE_ONLY_SETTING = 'presenceOnly=';
export const TOTAL_ONCE_SETTING = 'totalOnce=';
export const BIOMASS_BASIS_SETTING = 'biomassBasis=';
export const PER_OCCURRENCE_SETTING = 'perOccurrence=';
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
  /** The sheets that looked transposed and that the user chose to read as normal tables, by sheet name. Only present when there is at least one. A pre-tick only. */
  transposedAsTable?: string[];
  /** The sheets the user ticked as presence-only species lists, by sheet name. Only present when there is at least one. A pre-tick only. */
  presenceOnly?: string[];
  /** The sheets whose repeated per-taxon total the user chose to write once per sample and taxon, by sheet name. Only present when there is at least one. A pre-tick only. */
  totalOnce?: string[];
  /** The kind of mass the user gave the biomass columns of a sheet, by sheet name. Only present when there is at least one. A pre-pick only. */
  biomassBasis?: { sheet: string; basis: 'wet' | 'dry' | 'afdw' }[];
  /** The ticks "of each organism" the user set (on) or took back (off), by sheet and column header. Only present when there is at least one. A pre-pick only. */
  perOccurrence?: { sheet: string; header: string; on: boolean }[];
}

/** The biomass kind each sheet's columns were given: one entry per sheet whose biomass columns that state a kind all agree on it (a sheet with a wet and a dry column keeps nothing). */
export function biomassBasisOf(mappings: readonly { sheet: string; columns: readonly { role: { kind: string; basis?: 'wet' | 'dry' | 'afdw' } }[] }[]): { sheet: string; basis: 'wet' | 'dry' | 'afdw' }[] {
  const out: { sheet: string; basis: 'wet' | 'dry' | 'afdw' }[] = [];
  for (const m of mappings) {
    const kinds = new Set(m.columns.flatMap((c) => (c.role.kind === 'biomass' && c.role.basis !== undefined ? [c.role.basis] : [])));
    const [basis] = [...kinds];
    if (kinds.size === 1 && basis !== undefined && !out.some((o) => o.sheet === m.sheet)) out.push({ sheet: m.sheet, basis });
  }
  return out;
}

/**
 * The ticks "of each organism" that differ from what the tool proposed: `on` for a variable column that is ticked while its proposal was not, `off` for one the tool proposed ticked and the user
 * took back. A column the tool and the user agree on is not written (a re-upload proposes it the same way).
 */
export function perOccurrenceOf(
  mappings: readonly { sheet: string; columns: readonly { index: number; header: string; role: { kind: string; perOccurrence?: true } }[] }[],
  proposals: Readonly<Record<string, readonly { index: number; role: { kind: string; perOccurrence?: true } }[]>>,
): { sheet: string; header: string; on: boolean }[] {
  const out: { sheet: string; header: string; on: boolean }[] = [];
  for (const m of mappings) {
    for (const c of m.columns) {
      if (c.role.kind !== 'variable' || c.header === '' || m.sheet.includes(':') || out.length >= MAX_SETTING_SHEETS) continue;
      const proposed = proposals[m.sheet]?.find((p) => p.index === c.index)?.role.perOccurrence === true;
      const now = c.role.perOccurrence === true;
      if (now !== proposed) out.push({ sheet: m.sheet, header: c.header, on: now });
    }
  }
  return out;
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
    else if (v.startsWith(PRESENCE_ONLY_SETTING)) addName((settings.presenceOnly ??= []), v.slice(PRESENCE_ONLY_SETTING.length));
    else if (v.startsWith(TOTAL_ONCE_SETTING)) addName((settings.totalOnce ??= []), v.slice(TOTAL_ONCE_SETTING.length));
    else if (v.startsWith(BIOMASS_BASIS_SETTING)) {
      const rest = v.slice(BIOMASS_BASIS_SETTING.length);
      const basis = rest.slice(0, rest.indexOf(':'));
      const sheet = rest.slice(rest.indexOf(':') + 1);
      if ((basis === 'wet' || basis === 'dry' || basis === 'afdw') && rest.includes(':') && sheet !== '' && sheet.length <= MAX_SETTING_NAME && (settings.biomassBasis ??= []).length < MAX_SETTING_SHEETS && !settings.biomassBasis.some((b) => b.sheet === sheet)) settings.biomassBasis.push({ sheet, basis });
    } else if (v.startsWith(PER_OCCURRENCE_SETTING)) {
      const m = /^(on|off):([^:]+):(.+)$/.exec(v.slice(PER_OCCURRENCE_SETTING.length));
      if (m !== null && m[3].length <= MAX_SETTING_NAME && m[2].length <= MAX_SETTING_NAME && (settings.perOccurrence ??= []).length < MAX_SETTING_SHEETS) settings.perOccurrence.push({ sheet: m[2], header: m[3], on: m[1] === 'on' });
    } else if (v.startsWith(TRANSPOSED_AS_TABLE_SETTING)) addName((settings.transposedAsTable ??= []), v.slice(TRANSPOSED_AS_TABLE_SETTING.length));
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
      ...(settings.transposedAsTable ?? []).filter((n) => n.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((n) => line([SETTING_ROW, `${TRANSPOSED_AS_TABLE_SETTING}${n}`, '', '', ''])),
      ...(settings.biomassBasis ?? []).filter((b) => b.sheet.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((b) => line([SETTING_ROW, `${BIOMASS_BASIS_SETTING}${b.basis}:${b.sheet}`, '', '', ''])),
      ...(settings.perOccurrence ?? []).filter((o) => o.header.length <= MAX_SETTING_NAME && o.sheet.length <= MAX_SETTING_NAME && !o.sheet.includes(':')).slice(0, MAX_SETTING_SHEETS).map((o) => line([SETTING_ROW, `${PER_OCCURRENCE_SETTING}${o.on ? 'on' : 'off'}:${o.sheet}:${o.header}`, '', '', ''])),
      ...(settings.totalOnce ?? []).filter((n) => n.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((n) => line([SETTING_ROW, `${TOTAL_ONCE_SETTING}${n}`, '', '', ''])),
      ...(settings.presenceOnly ?? []).filter((n) => n.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((n) => line([SETTING_ROW, `${PRESENCE_ONLY_SETTING}${n}`, '', '', ''])),
    ].join('\n') + '\n'
  );
}
