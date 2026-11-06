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
 *   realCounts=<sheet>  (old files) the user said, on CONV-QUANTITY-REPEATED, that the equal quantities of the sheet of that name are real counts. Read and ignored: it carries no count, and a tick that switches a check off
 *                     must hold only for the rows it was given for. See realCountsRows.
 *   realCountsRows=<count>:<sheet>  the same answer with the number of rows the tick covered. Holds only while today's analysis finds the same number of rows; the page does not tick anything.
 *   dropCopies=<sheet>  the user chose, on CONV-ROW-COPIES, to drop the rows that are exact copies of an earlier row. A PRE-TICK only; a sheet name, never a value.
 *   biomassBasis=<basis>:<sheet>  the biomass / weight columns of the sheet of that name were given the kind of mass <basis> (wet | dry | afdw). A PRE-PICK only: it sets that kind on the biomass
 *                     columns of a sheet of the same name that have none, and the user can change it on the page. A basis word and a sheet name, never a value.
 *   perOccurrence=<on|off>:<sheet>:<column>  the tick "of each organism" of a measured-variable column of a long sheet: on = ticked, off = the tool proposed it ticked and the user took it back. A PRE-PICK only: it
 *                     sets the tick on the column of that header in a sheet of the same name (a sheet name has no colon; the header is the rest of the line), and the user can change it on the page.
 *   dropCopiesRows=<count>:<sheet>  the user chose, on CONV-ROW-COPIES, to leave out the rows that are exact copies of an earlier row, and the analysis found <count> copies. Read as a PRE-TICK that holds only
 *                     when today's analysis of the sheet finds the same number of copies (core/convert/build.ts): for another file the question is open again. A count and a sheet name, never a value.
 *   totalOnceGroups=<count>:<sheet>  the same for "one occurrence per sample and taxon" (CONV-QUANTITY-REPEATED): <count> is the number of groups of rows that repeat a total.
 *   leaveOut=<reason>:<count>:<rows>:<sheet>  the user answered "leave these rows out and list them" (CONV-ROW-NOT-UNDERSTOOD) for <count> rows of <reason> in a sheet of <rows> rows. Holds only while
 *                     today's sheet has the same number of rows and finds the same number of rows of that reason; otherwise the question is open again. Counts, a reason word and a sheet name, never a value.
 *   sampleKey=<sheet>:<hashes>:<rows>  the person picked the columns that make a sample for the sheet of that name (core/convert/sampleKey.ts), given as short hashes of the folded headers and the
 *                     number of rows of the sheet (core/convert/keySetting.ts): NO header text. A PRE-PICK that holds only when every column is found again and the sheet has the same number of rows; the page
 *                     shows it with its numbers and "Ask again". A sheet name, hashes and a count, never a value.
 *   sampleKeyPrefix=<sheet>:<hashes>:<rows>:<name>  the name every sample ID of that key starts with (the person's own text, which the page showed and they may have changed; by default the sheet's or the file's name). Tied to the same sheet, hashes
 *                     and row count as the sampleKey line: it is applied only together with it, so a renamed file keeps its IDs.
 * An unknown name or value is ignored. (`dropCopies=<sheet>` and `totalOnce=<sheet>` of earlier files are still read, and the page does not tick anything from them: they carry no count.)
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
export const REAL_COUNTS_SETTING = 'realCounts=';
export const DROP_COPIES_SETTING = 'dropCopies=';
export const DROP_COPIES_ROWS_SETTING = 'dropCopiesRows=';
export const TOTAL_ONCE_GROUPS_SETTING = 'totalOnceGroups=';
export const REAL_COUNTS_ROWS_SETTING = 'realCountsRows=';
export const LEAVE_OUT_SETTING = 'leaveOut=';
export const BIOMASS_BASIS_SETTING = 'biomassBasis=';
export const PER_OCCURRENCE_SETTING = 'perOccurrence=';
export const SAMPLE_KEY_SETTING = 'sampleKey=';
export const SAMPLE_KEY_PREFIX_SETTING = 'sampleKeyPrefix=';
/** The longest name kept for the front of a sample ID. */
export const MAX_KEY_PREFIX = 100;
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
  /** The sheets whose equal quantities the user declared real counts, by sheet name, as an OLD companion file recorded them (no count). Read, never applied: an answer without the rows it was given for cannot be checked. */
  realCounts?: string[];
  /** The sheets whose equal quantities the user declared real counts, with the number of rows the tick covered. Holds only for the same number. */
  realCountsRows?: { sheet: string; count: number }[];
  /** The sheets whose exact copies of rows the user chose to drop, by sheet name. A pre-tick only. */
  dropCopies?: string[];
  /** The sheets whose copies the user left out, with the number of copies the analysis found. A pre-tick that holds only for the same count. */
  dropCopiesRows?: { sheet: string; count: number }[];
  /** The sheets whose repeated totals the user took once, with the number of groups found. A pre-tick that holds only for the same count. */
  totalOnceGroups?: { sheet: string; count: number }[];
  /** The reasons the user left out and listed, by sheet, with the rows of that reason and the rows of the sheet. Holds only for the same two numbers. */
  leaveOut?: { sheet: string; reason: string; count: number; rows: number }[];
  /** The sample keys the person picked, by sheet: the hashes of the key columns and the number of rows the pick was made for. Holds only for the same columns and the same number of rows. */
  sampleKey?: { sheet: string; hashes: string; rows: number; prefix?: string }[];
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

const COUNT = /^(\d{1,9}):(.+)$/s;
const SAMPLE_KEY = /^(.+):((?:[0-9a-f]{8}(?:\.\d{1,4}of\d{1,4})?)(?:\+[0-9a-f]{8}(?:\.\d{1,4}of\d{1,4})?){0,63}):(\d{1,9})$/s;
const SAMPLE_KEY_PREFIX = /^(.+?):((?:[0-9a-f]{8}(?:\.\d{1,4}of\d{1,4})?)(?:\+[0-9a-f]{8}(?:\.\d{1,4}of\d{1,4})?){0,63}):(\d{1,9}):(.+)$/s;
const LEAVE_OUT = /^([a-z][a-z-]{0,40}):(\d{1,9}):(\d{1,9}):(.+)$/s;

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
    else if (v.startsWith(REAL_COUNTS_SETTING)) addName((settings.realCounts ??= []), v.slice(REAL_COUNTS_SETTING.length));
    else if (v.startsWith(DROP_COPIES_SETTING)) addName((settings.dropCopies ??= []), v.slice(DROP_COPIES_SETTING.length));
    else if (v.startsWith(DROP_COPIES_ROWS_SETTING) || v.startsWith(TOTAL_ONCE_GROUPS_SETTING) || v.startsWith(REAL_COUNTS_ROWS_SETTING)) {
      const copies = v.startsWith(DROP_COPIES_ROWS_SETTING);
      const real = v.startsWith(REAL_COUNTS_ROWS_SETTING);
      const m = COUNT.exec(v.slice((copies ? DROP_COPIES_ROWS_SETTING : real ? REAL_COUNTS_ROWS_SETTING : TOTAL_ONCE_GROUPS_SETTING).length));
      const list = copies ? (settings.dropCopiesRows ??= []) : real ? (settings.realCountsRows ??= []) : (settings.totalOnceGroups ??= []);
      if (m !== null && m[2].length <= MAX_SETTING_NAME && list.length < MAX_SETTING_SHEETS && !list.some((x) => x.sheet === m[2])) list.push({ sheet: m[2], count: Number(m[1]) });
    } else if (v.startsWith(LEAVE_OUT_SETTING)) {
      const m = LEAVE_OUT.exec(v.slice(LEAVE_OUT_SETTING.length));
      const list = (settings.leaveOut ??= []);
      if (m !== null && m[4].length <= MAX_SETTING_NAME && list.length < MAX_SETTING_SHEETS * 8 && !list.some((x) => x.sheet === m[4] && x.reason === m[1])) list.push({ reason: m[1], count: Number(m[2]), rows: Number(m[3]), sheet: m[4] });
    } else if (v.startsWith(SAMPLE_KEY_SETTING)) {
      const m = SAMPLE_KEY.exec(v.slice(SAMPLE_KEY_SETTING.length));
      const list = (settings.sampleKey ??= []);
      if (m !== null && m[1].length <= MAX_SETTING_NAME && list.length < MAX_SETTING_SHEETS && !list.some((x) => x.sheet === m[1])) list.push({ sheet: m[1], hashes: m[2], rows: Number(m[3]) });
    } else if (v.startsWith(SAMPLE_KEY_PREFIX_SETTING)) {
      const m = SAMPLE_KEY_PREFIX.exec(v.slice(SAMPLE_KEY_PREFIX_SETTING.length));
      const hit = m === null ? undefined : (settings.sampleKey ?? []).find((x) => x.sheet === m[1] && x.hashes === m[2] && x.rows === Number(m[3]));
      const name = m === null ? '' : m[4].trim();
      if (hit !== undefined && name !== '' && name.length <= MAX_KEY_PREFIX && hit.prefix === undefined) hit.prefix = name;
    } else if (v.startsWith(BIOMASS_BASIS_SETTING)) {
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
      ...(settings.dropCopiesRows ?? []).filter((c) => c.sheet.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((c) => line([SETTING_ROW, `${DROP_COPIES_ROWS_SETTING}${c.count}:${c.sheet}`, '', '', ''])),
      ...(settings.totalOnceGroups ?? []).filter((c) => c.sheet.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((c) => line([SETTING_ROW, `${TOTAL_ONCE_GROUPS_SETTING}${c.count}:${c.sheet}`, '', '', ''])),
      ...(settings.leaveOut ?? []).filter((c) => c.sheet.length <= MAX_SETTING_NAME && /^[a-z][a-z-]{0,40}$/.test(c.reason)).slice(0, MAX_SETTING_SHEETS * 8).map((c) => line([SETTING_ROW, `${LEAVE_OUT_SETTING}${c.reason}:${c.count}:${c.rows}:${c.sheet}`, '', '', ''])),
      ...(settings.sampleKey ?? []).filter((k) => k.sheet.length <= MAX_SETTING_NAME && /^[0-9a-f]{8}/.test(k.hashes) && Number.isInteger(k.rows) && k.rows >= 0).slice(0, MAX_SETTING_SHEETS).flatMap((k) => [
        line([SETTING_ROW, `${SAMPLE_KEY_SETTING}${k.sheet}:${k.hashes}:${k.rows}`, '', '', '']),
        ...(k.prefix !== undefined && k.prefix.trim() !== '' && k.prefix.trim().length <= MAX_KEY_PREFIX ? [line([SETTING_ROW, `${SAMPLE_KEY_PREFIX_SETTING}${k.sheet}:${k.hashes}:${k.rows}:${k.prefix.trim()}`, '', '', ''])] : []),
      ]),
      ...(settings.realCountsRows ?? []).filter((c) => c.sheet.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((c) => line([SETTING_ROW, `${REAL_COUNTS_ROWS_SETTING}${c.count}:${c.sheet}`, '', '', ''])),
      ...(settings.dropCopies ?? []).filter((n) => n.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((n) => line([SETTING_ROW, `${DROP_COPIES_SETTING}${n}`, '', '', ''])),
      ...(settings.totalOnce ?? []).filter((n) => n.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((n) => line([SETTING_ROW, `${TOTAL_ONCE_SETTING}${n}`, '', '', ''])),
      ...(settings.presenceOnly ?? []).filter((n) => n.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((n) => line([SETTING_ROW, `${PRESENCE_ONLY_SETTING}${n}`, '', '', ''])),
    ].join('\n') + '\n'
  );
}
