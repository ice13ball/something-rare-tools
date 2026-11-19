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
 *   ownRecords=<rows>:<sheet>  (round 3) the person declared each row of the long sheet of that name its own record, for a sheet of <rows> rows. A PRE-TICK that holds only when the sheet has the same number of rows
 *                     and still qualifies; the page says the choice came from the file, with "Ask again". A count and a sheet name, never a value.
 *   keepCopiesRows=<count>:<sheet>  (round 3) under ownRecords, the person kept the identical rows as separate records, and the analysis found <count> copies. Holds only while today's analysis finds the same number.
 *   totalOnceGroups=<count>:<sheet>  the same for "one occurrence per sample and taxon" (CONV-QUANTITY-REPEATED): <count> is the number of groups of rows that repeat a total.
 *   leaveOut=<reason>:<count>:<rows>:<sheet>  the user answered "leave these rows out and list them" (CONV-ROW-NOT-UNDERSTOOD) for <count> rows of <reason> in a sheet of <rows> rows. Holds only while
 *                     today's sheet has the same number of rows and finds the same number of rows of that reason; otherwise the question is open again. Counts, a reason word and a sheet name, never a value.
 *   sampleKey=<sheet>:<hashes>:<rows>  the person picked the columns that make a sample for the sheet of that name (core/convert/sampleKey.ts), given as short hashes of the folded headers and the
 *                     number of rows of the sheet (core/convert/keySetting.ts): NO header text. A PRE-PICK that holds only when every column is found again and the sheet has the same number of rows; the page
 *                     shows it with its numbers and "Ask again". A sheet name, hashes and a count, never a value.
 *   sampleKeyPrefix=<sheet>:<hashes>:<rows>:<name>  the name every sample ID of that key starts with (the person's own text, which the page showed and they may have changed; by default the sheet's or the file's name). Tied to the same sheet, hashes
 *                     and row count as the sampleKey line: it is applied only together with it, so a renamed file keeps its IDs.
 *   dayMonthOrder=<dmy|mdy>:<sheet>:<hash>:<rows>  the person declared that the date column with that header hash (core/convert/keySetting.ts) of the sheet of that name writes the day first (dmy) or
 *                     the month first (mdy), for a sheet of <rows> rows. A PRE-PICK that holds only when the column is found again by its hash and the sheet has the same number of rows; the page then
 *                     says the answer came from the file, with "Ask again". A sheet name, a hash and a count, never a date.
 *   yyOrder=<ymd|dmy|mdy>:<sheet>:<hash>:<rows>  the same for the NN-NN-NN dates (two-digit year) of that column: a SECOND answer, independent of dayMonthOrder (a column of slash dates and NN-NN-NN
 *                     dates can carry both). Same hash, same row count, same pre-pick rule. A sheet name, a hash and a count, never a date.
 *   decimalReading=<decimal|thousands>:<sheet>:<hash>:<rows>  the person declared that the comma of the number column with that header hash (core/convert/keySetting.ts) of the sheet of that name is a
 *                     decimal comma or a thousands separator (IN-DECIMAL-AMBIGUOUS), for a sheet of <rows> rows. A PRE-PICK that holds only when the column is found again by its hash, the sheet has the same
 *                     number of rows and the converter's reader still asks about that column; the page then says the answer came from the file, with "Ask again". A sheet name, a hash and a count, never a number.
 *   encoding=<windows-1250|iso-8859-2|windows-1252>:<hash>  the person picked how the 8-bit letters of a file are read (IN-ENCODING-AMBIGUOUS), the hash being the FNV-1a of the file's BYTES
 *                     (core/convert/keySetting.ts `bytesHash`). A PRE-PICK that holds only for a file whose bytes give that hash AND whose reading is still ambiguous between code pages that include the one
 *                     named; the page then says the answer came from the file, with "Ask again". A code page name and a hash, never a word of the file.
 *   missingCode=<sheet>:<hash>:<rows>  the person answered "treat as missing" (ROW-MISSING-CODE) for the number column with that header hash (core/convert/keySetting.ts) of the sheet of that name, for a sheet of <rows> rows.
 *                     Holds only when the column is found again by its hash and the sheet has the same number of rows; the converter then leaves the cells of that column that hold -99, -999 or -9999 empty and says
 *                     the answer came from the file. A sheet name, a hash and a count, never a value.
 *   sampleJoin=<rRows>:<dRows>:<rHashes>:<dHashes>:<["rFile","rSheet","dFile","dSheet"]>  the person confirmed that a results sheet takes its samples' description from another sheet (core/convert/sampleJoin.ts):
 *                     the rows of both sheets, the hashes of the key columns of each (core/convert/keySetting.ts, as for sampleKey) and the four names as a JSON array, so a `:` in a name is safe.
 *                     A PRE-CONFIRMATION that holds only when both sheets are found again with the same rows and the key columns are found by their hashes; otherwise the page asks again. No value.
 *   sampleJoinConflict=<description|results|mixed>:<count>:<group>:<["rFile","rSheet"]>  the answer to one group of differing values of that join, with the number of samples it was given for. `mixed` = answered
 *                     with exceptions or per pair (those hold values, so they are never written): the page opens the group again. A quantity name, a count and names, never a value.
 *   sampleJoinResultsOnly=<count>:<["rFile","rSheet"]>  the person accepted <count> results samples without a description. Holds only for the same count.
 *   sampleJoinNo=<["rFile","rSheet","dFile","dSheet"]>  the person declined the proposal for exactly this pair; no other pair of the results sheet is affected.
 *   declaredDate=<value>:<rows>:<sheet>  (round 3, Task 17) the one date or interval (ISO 8601, no colon in it) the PERSON typed for the sheet of that name, on which no sample has a date; the sheet name comes last, as for declaredPosition. A pre-fill only,
 *                     for a sheet of that name with the same number of rows <rows>; for another name or number the page says it was not applied. Written only for a text of the date shape; the converter judges the rest.
 *   declaredPosition=<lat>:<lon>:<uncertainty>:<rows>:<sheet>  (round 3, Q6) the one position the PERSON typed for the sheet of that name, which has no latitude / longitude column, with its uncertainty in metres, as
 *                     typed (a decimal comma is kept; the field is quoted). The one setting that holds typed values, and the only one: it is the person's own declaration, not a value read from the data. A
 *                     PRE-FILL only, for a sheet of that name with the same number of rows <rows> (as every other saved answer; for another number the page says it was not applied): it fills the three fields when that sheet has no position column in this drop, the page then says the position came from the file until a
 *                     field is edited, and the converter refuses it where it does not apply.
 *   turned=<sheet>:<nameHash>:<rows>:<notSampleHashes>[:dates]  (round 3) the person declared that the samples of the sheet of that name are its columns (core/convert/turn.ts): the hash of the column that names the
 *                     rows, the number of rows of the sheet as dropped, the hashes of the columns that are not samples joined with "+" (empty when none) and, last, `dates` when the header gives the date too (hashes as for
 *                     sampleKey, core/convert/keySetting.ts: NO header text). A PRE-TICK that holds only when every column is found again by its hash and the sheet has the same number of rows; the page then says the
 *                     turn came from the file, with "Undo". A sheet name, hashes and a count, never a value.
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
export const OWN_RECORDS_SETTING = 'ownRecords=';
export const KEEP_COPIES_ROWS_SETTING = 'keepCopiesRows=';
export const TOTAL_ONCE_GROUPS_SETTING = 'totalOnceGroups=';
export const REAL_COUNTS_ROWS_SETTING = 'realCountsRows=';
export const LEAVE_OUT_SETTING = 'leaveOut=';
export const BIOMASS_BASIS_SETTING = 'biomassBasis=';
export const PER_OCCURRENCE_SETTING = 'perOccurrence=';
export const SAMPLE_KEY_SETTING = 'sampleKey=';
export const SAMPLE_KEY_PREFIX_SETTING = 'sampleKeyPrefix=';
export const DAY_MONTH_ORDER_SETTING = 'dayMonthOrder=';
export const YY_ORDER_SETTING = 'yyOrder=';
export const DECIMAL_READING_SETTING = 'decimalReading=';
export const MISSING_CODE_SETTING = 'missingCode=';
export const ENCODING_SETTING = 'encoding=';
export const DECLARED_POSITION_SETTING = 'declaredPosition=';
export const DECLARED_DATE_SETTING = 'declaredDate=';
export const TURNED_SETTING = 'turned=';
export const SAMPLE_JOIN_SETTING = 'sampleJoin=';
export const SAMPLE_JOIN_CONFLICT_SETTING = 'sampleJoinConflict=';
export const SAMPLE_JOIN_RESULTS_ONLY_SETTING = 'sampleJoinResultsOnly=';
export const SAMPLE_JOIN_NO_SETTING = 'sampleJoinNo=';
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
  /** The long sheets the person declared "each row is its own record", with the number of rows of the sheet. A pre-tick that holds only for the same number of rows. */
  ownRecords?: { sheet: string; rows: number }[];
  /** Under ownRecords: the sheets whose identical rows the person kept as separate records, with the number of copies the analysis found. Holds only for the same count. */
  keepCopiesRows?: { sheet: string; count: number }[];
  /** The sheets whose repeated totals the user took once, with the number of groups found. A pre-tick that holds only for the same count. */
  totalOnceGroups?: { sheet: string; count: number }[];
  /** The reasons the user left out and listed, by sheet, with the rows of that reason and the rows of the sheet. Holds only for the same two numbers. */
  leaveOut?: { sheet: string; reason: string; count: number; rows: number }[];
  /** The sample keys the person picked, by sheet: the hashes of the key columns and the number of rows the pick was made for. Holds only for the same columns and the same number of rows. */
  sampleKey?: { sheet: string; hashes: string; rows: number; prefix?: string }[];
  /** The day/month order the person declared for a date column, by sheet, the column's header hash and the number of rows the answer was given for. Holds only for the same column and the same number of rows. */
  dayMonthOrder?: { sheet: string; order: 'dmy' | 'mdy'; hash: string; rows: number }[];
  /** The order the person declared for the NN-NN-NN dates of a column, by sheet, header hash and rows: a second answer beside dayMonthOrder. Holds only for the same column and the same number of rows. */
  yyOrder?: { sheet: string; order: 'ymd' | 'dmy' | 'mdy'; hash: string; rows: number }[];
  /** What the person declared a comma to be in a number column, by sheet, the column's header hash and the number of rows the answer was given for. Holds only for the same column and the same number of rows. */
  decimalReading?: { sheet: string; reading: 'decimal' | 'thousands'; hash: string; rows: number }[];
  /** The columns the person answered "treat -99, -999, -9999 as missing" for, by sheet, the column's header hash and the number of rows the answer was given for. Holds only for the same column and the same number of rows. */
  missingCode?: { sheet: string; hash: string; rows: number }[];
  /** The 8-bit encoding the person picked for a file whose letters read differently in the code pages, by the hash of the file's bytes. Holds only for a file with the same bytes. */
  encoding?: { encoding: 'windows-1250' | 'iso-8859-2' | 'windows-1252'; hash: string }[];
  /**
   * The joins of a results sheet to the sheet that describes its samples that the person confirmed: file and sheet names of both, the rows of both sheets and the hashes of the key columns (as
   * for `sampleKey`), the number of results samples accepted without a description, and the answered conflict groups with the number of samples each was given for. `mixed` = answered with
   * exceptions or per pair: re-opened by the page. Names, hashes and counts, never a value.
   */
  sampleJoin?: {
    results: [string, string];
    description: [string, string];
    resultsRows: number;
    descriptionRows: number;
    resultsHashes: string;
    descriptionHashes: string;
    resultsOnly?: number;
    conflicts: { group: string; take: 'description' | 'results' | 'mixed'; count: number }[];
  }[];
  /** The pairs the person declined. */
  sampleJoinNo?: { results: [string, string]; description: [string, string] }[];
  /** The one position the person typed for a sheet without a position column (latitude, longitude, uncertainty in metres, as typed). A pre-fill only. The only typed values the file holds: the person's own declaration. */
  declaredPosition?: { sheet: string; lat: string; lon: string; uncertaintyM: string; rows: number }[];
  /** The sheets the person declared "the samples are the columns", by sheet: the hash of the name column, the hashes of the columns that are not samples (empty when none), the number of rows of the sheet as dropped, and whether the header gives the date too. Holds only while the columns are found again and the rows are the same. */
  /** The one date or interval the person typed for a sheet on which no sample has a date, as typed (ISO 8601). A pre-fill only; holds for the same sheet name and number of rows. */
  declaredDate?: { sheet: string; value: string; rows: number }[];
  turned?: { sheet: string; nameHash: string; notSampleHashes: string; rows: number; headerDates?: true }[];
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
const HASHES = '(?:[0-9a-f]{8}(?:\\.\\d{1,4}of\\d{1,4})?)(?:\\+[0-9a-f]{8}(?:\\.\\d{1,4}of\\d{1,4})?){0,63}';
const SAMPLE_JOIN = new RegExp(`^(\\d{1,9}):(\\d{1,9}):(${HASHES}):(${HASHES}):(\\[.*\\])$`, 's');
const SAMPLE_JOIN_CONFLICT = /^(description|results|mixed):(\d{1,9}):(.+?):(\[.*\])$/s;
const SAMPLE_JOIN_RESULTS_ONLY = /^(\d{1,9}):(\[.*\])$/s;
/** A JSON array of exactly `n` short, non-empty strings, or undefined. */
function names(text: string, n: number): string[] | undefined {
  try {
    const a: unknown = JSON.parse(text);
    return Array.isArray(a) && a.length === n && a.every((x) => typeof x === 'string' && x !== '' && x.length <= MAX_SETTING_NAME) ? (a as string[]) : undefined;
  } catch {
    return undefined;
  }
}
const ONE_HASH = '[0-9a-f]{8}(?:\\.\\d{1,4}of\\d{1,4})?';
const TURNED = new RegExp(`^(.+):(${ONE_HASH}):(\\d{1,9}):(${HASHES})?(?::(dates))?$`, 's');
/** The two order answers of a date column, each a line `<prefix><order>:<sheet>:<hash>:<rows>`: the slash dates (dayMonthOrder) and the NN-NN-NN dates (yyOrder, which alone may be `ymd`). */
const ORDER_LINES = [
  { slot: 'dayMonthOrder', prefix: DAY_MONTH_ORDER_SETTING, pattern: /^(dmy|mdy):(.+):([0-9a-f]{8}(?:\.\d{1,4}of\d{1,4})?):(\d{1,9})$/s },
  { slot: 'yyOrder', prefix: YY_ORDER_SETTING, pattern: /^(ymd|dmy|mdy):(.+):([0-9a-f]{8}(?:\.\d{1,4}of\d{1,4})?):(\d{1,9})$/s },
] as const;
const MISSING_CODE = /^(.+):([0-9a-f]{8}(?:\.\d{1,4}of\d{1,4})?):(\d{1,9})$/s;
const DECIMAL_READING = /^(decimal|thousands):(.+):([0-9a-f]{8}(?:\.\d{1,4}of\d{1,4})?):(\d{1,9})$/s;
const ENCODING_PICK = /^(windows-1250|iso-8859-2|windows-1252):([0-9a-f]{8})$/;
const DATE_PART = '\\d{4}(?:-\\d{2}(?:-\\d{2})?)?';
export const DECLARED_DATE_SHAPE = new RegExp(`^${DATE_PART}(?:/${DATE_PART})?$`);
const DECLARED_DATE = /^([^:]{4,21}):(\d{1,9}):(.+)$/s;
const DECLARED_POSITION = /^([^:]{1,40}):([^:]{1,40}):([^:]{1,40}):(\d{1,9}):(.+)$/s;
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
    else if (v.startsWith(OWN_RECORDS_SETTING)) {
      const m = COUNT.exec(v.slice(OWN_RECORDS_SETTING.length));
      const list = (settings.ownRecords ??= []);
      if (m !== null && m[2].length <= MAX_SETTING_NAME && list.length < MAX_SETTING_SHEETS && !list.some((x) => x.sheet === m[2])) list.push({ sheet: m[2], rows: Number(m[1]) });
    } else if (v.startsWith(KEEP_COPIES_ROWS_SETTING) || v.startsWith(DROP_COPIES_ROWS_SETTING) || v.startsWith(TOTAL_ONCE_GROUPS_SETTING) || v.startsWith(REAL_COUNTS_ROWS_SETTING)) {
      const keep = v.startsWith(KEEP_COPIES_ROWS_SETTING);
      const copies = v.startsWith(DROP_COPIES_ROWS_SETTING);
      const real = v.startsWith(REAL_COUNTS_ROWS_SETTING);
      const m = COUNT.exec(v.slice((keep ? KEEP_COPIES_ROWS_SETTING : copies ? DROP_COPIES_ROWS_SETTING : real ? REAL_COUNTS_ROWS_SETTING : TOTAL_ONCE_GROUPS_SETTING).length));
      const list = keep ? (settings.keepCopiesRows ??= []) : copies ? (settings.dropCopiesRows ??= []) : real ? (settings.realCountsRows ??= []) : (settings.totalOnceGroups ??= []);
      if (m !== null && m[2].length <= MAX_SETTING_NAME && list.length < MAX_SETTING_SHEETS && !list.some((x) => x.sheet === m[2])) list.push({ sheet: m[2], count: Number(m[1]) });
    } else if (v.startsWith(LEAVE_OUT_SETTING)) {
      const m = LEAVE_OUT.exec(v.slice(LEAVE_OUT_SETTING.length));
      const list = (settings.leaveOut ??= []);
      if (m !== null && m[4].length <= MAX_SETTING_NAME && list.length < MAX_SETTING_SHEETS * 8 && !list.some((x) => x.sheet === m[4] && x.reason === m[1])) list.push({ reason: m[1], count: Number(m[2]), rows: Number(m[3]), sheet: m[4] });
    } else if (v.startsWith(SAMPLE_KEY_SETTING)) {
      const m = SAMPLE_KEY.exec(v.slice(SAMPLE_KEY_SETTING.length));
      const list = (settings.sampleKey ??= []);
      if (m !== null && m[1].length <= MAX_SETTING_NAME && list.length < MAX_SETTING_SHEETS && !list.some((x) => x.sheet === m[1])) list.push({ sheet: m[1], hashes: m[2], rows: Number(m[3]) });
    } else if (ORDER_LINES.some((l) => v.startsWith(l.prefix))) {
      const l = ORDER_LINES.find((x) => v.startsWith(x.prefix))!;
      const m = l.pattern.exec(v.slice(l.prefix.length));
      const list = (settings[l.slot] ??= []);
      if (m !== null && m[2].length <= MAX_SETTING_NAME && list.length < MAX_SETTING_SHEETS * 8 && !list.some((x) => x.sheet === m[2] && x.hash === m[3])) list.push({ order: m[1] as 'ymd' | 'dmy' | 'mdy', sheet: m[2], hash: m[3], rows: Number(m[4]) } as never);
    } else if (v.startsWith(DECIMAL_READING_SETTING)) {
      const m = DECIMAL_READING.exec(v.slice(DECIMAL_READING_SETTING.length));
      const list = (settings.decimalReading ??= []);
      if (m !== null && m[2].length <= MAX_SETTING_NAME && list.length < MAX_SETTING_SHEETS * 8 && !list.some((x) => x.sheet === m[2] && x.hash === m[3])) list.push({ reading: m[1] as 'decimal' | 'thousands', sheet: m[2], hash: m[3], rows: Number(m[4]) });
    } else if (v.startsWith(ENCODING_SETTING)) {
      const m = ENCODING_PICK.exec(v.slice(ENCODING_SETTING.length));
      const list = (settings.encoding ??= []);
      if (m !== null && list.length < MAX_SETTING_SHEETS && !list.some((x) => x.hash === m[2])) list.push({ encoding: m[1] as 'windows-1250' | 'iso-8859-2' | 'windows-1252', hash: m[2] });
    } else if (v.startsWith(MISSING_CODE_SETTING)) {
      const m = MISSING_CODE.exec(v.slice(MISSING_CODE_SETTING.length));
      const list = (settings.missingCode ??= []);
      if (m !== null && m[1].length <= MAX_SETTING_NAME && list.length < MAX_SETTING_SHEETS * 8 && !list.some((x) => x.sheet === m[1] && x.hash === m[2])) list.push({ sheet: m[1], hash: m[2], rows: Number(m[3]) });
    } else if (v.startsWith(DECLARED_POSITION_SETTING)) {
      const m = DECLARED_POSITION.exec(v.slice(DECLARED_POSITION_SETTING.length));
      const list = (settings.declaredPosition ??= []);
      const [lat, lon, uncertaintyM] = m === null ? ['', '', ''] : [m[1].trim(), m[2].trim(), m[3].trim()];
      if (m !== null && lat !== '' && lon !== '' && uncertaintyM !== '' && m[5].length <= MAX_SETTING_NAME && list.length < MAX_SETTING_SHEETS && !list.some((x) => x.sheet === m[5])) list.push({ sheet: m[5], lat, lon, uncertaintyM, rows: Number(m[4]) });
    } else if (v.startsWith(DECLARED_DATE_SETTING)) {
      const m = DECLARED_DATE.exec(v.slice(DECLARED_DATE_SETTING.length));
      const list = (settings.declaredDate ??= []);
      if (m !== null && DECLARED_DATE_SHAPE.test(m[1].trim()) && m[3].length <= MAX_SETTING_NAME && list.length < MAX_SETTING_SHEETS && !list.some((x) => x.sheet === m[3])) list.push({ sheet: m[3], value: m[1].trim(), rows: Number(m[2]) });
    } else if (v.startsWith(TURNED_SETTING)) {
      const m = TURNED.exec(v.slice(TURNED_SETTING.length));
      const list = (settings.turned ??= []);
      if (m !== null && m[1].length <= MAX_SETTING_NAME && list.length < MAX_SETTING_SHEETS && !list.some((x) => x.sheet === m[1])) list.push({ sheet: m[1], nameHash: m[2], rows: Number(m[3]), notSampleHashes: m[4] ?? '', ...(m[5] === 'dates' ? { headerDates: true as const } : {}) });
    } else if (v.startsWith(SAMPLE_KEY_PREFIX_SETTING)) {
      const m = SAMPLE_KEY_PREFIX.exec(v.slice(SAMPLE_KEY_PREFIX_SETTING.length));
      const hit = m === null ? undefined : (settings.sampleKey ?? []).find((x) => x.sheet === m[1] && x.hashes === m[2] && x.rows === Number(m[3]));
      const name = m === null ? '' : m[4].trim();
      if (hit !== undefined && name !== '' && name.length <= MAX_KEY_PREFIX && hit.prefix === undefined) hit.prefix = name;
    } else if (v.startsWith(SAMPLE_JOIN_CONFLICT_SETTING)) {
      const m = SAMPLE_JOIN_CONFLICT.exec(v.slice(SAMPLE_JOIN_CONFLICT_SETTING.length));
      const n = m === null ? undefined : names(m[4], 2);
      const hit = n === undefined ? undefined : (settings.sampleJoin ?? []).find((j) => j.results[0] === n[0] && j.results[1] === n[1]);
      if (m !== null && hit !== undefined && m[3].length <= MAX_SETTING_NAME && hit.conflicts.length < MAX_SETTING_SHEETS && !hit.conflicts.some((c) => c.group === m[3])) hit.conflicts.push({ group: m[3], take: m[1] as 'description' | 'results' | 'mixed', count: Number(m[2]) });
    } else if (v.startsWith(SAMPLE_JOIN_RESULTS_ONLY_SETTING)) {
      const m = SAMPLE_JOIN_RESULTS_ONLY.exec(v.slice(SAMPLE_JOIN_RESULTS_ONLY_SETTING.length));
      const n = m === null ? undefined : names(m[2], 2);
      const hit = n === undefined ? undefined : (settings.sampleJoin ?? []).find((j) => j.results[0] === n[0] && j.results[1] === n[1]);
      if (m !== null && hit !== undefined && hit.resultsOnly === undefined) hit.resultsOnly = Number(m[1]);
    } else if (v.startsWith(SAMPLE_JOIN_NO_SETTING)) {
      const n = names(v.slice(SAMPLE_JOIN_NO_SETTING.length), 4);
      const list = (settings.sampleJoinNo ??= []);
      if (n !== undefined && list.length < MAX_SETTING_SHEETS && !list.some((x) => x.results[0] === n[0] && x.results[1] === n[1] && x.description[0] === n[2] && x.description[1] === n[3])) list.push({ results: [n[0], n[1]], description: [n[2], n[3]] });
    } else if (v.startsWith(SAMPLE_JOIN_SETTING)) {
      const m = SAMPLE_JOIN.exec(v.slice(SAMPLE_JOIN_SETTING.length));
      const n = m === null ? undefined : names(m[5], 4);
      const list = (settings.sampleJoin ??= []);
      if (m !== null && n !== undefined && list.length < MAX_SETTING_SHEETS && !list.some((x) => x.results[0] === n[0] && x.results[1] === n[1]))
        list.push({ results: [n[0], n[1]], description: [n[2], n[3]], resultsRows: Number(m[1]), descriptionRows: Number(m[2]), resultsHashes: m[3], descriptionHashes: m[4], conflicts: [] });
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
  // a join line that read nothing (every line of the kind was malformed) leaves no empty list behind
  if (settings.sampleJoin?.length === 0) delete settings.sampleJoin;
  if (settings.sampleJoinNo?.length === 0) delete settings.sampleJoinNo;
  if (settings.declaredPosition?.length === 0) delete settings.declaredPosition;
  if (settings.declaredDate?.length === 0) delete settings.declaredDate;
  if (settings.turned?.length === 0) delete settings.turned;
  return settings;
}

/** What a conflict answer may leave in the companion file: its bulk side only when the answer is nothing but that side. Exceptions and pairs hold values (sample codes, value texts), so such a group is `mixed`. */
export function savedJoinTake(answer: { take?: 'description' | 'results'; exceptions: readonly unknown[]; pairs?: readonly unknown[] }): 'description' | 'results' | 'mixed' {
  return answer.take === undefined || answer.exceptions.length > 0 || (answer.pairs?.length ?? 0) > 0 ? 'mixed' : answer.take;
}

const SHEET_NAMES = (n: readonly string[]): boolean => n.every((x) => x !== '' && x.length <= MAX_SETTING_NAME);

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
      ...(settings.ownRecords ?? []).filter((c) => c.sheet.length <= MAX_SETTING_NAME && Number.isInteger(c.rows) && c.rows >= 0).slice(0, MAX_SETTING_SHEETS).map((c) => line([SETTING_ROW, `${OWN_RECORDS_SETTING}${c.rows}:${c.sheet}`, '', '', ''])),
      ...(settings.keepCopiesRows ?? []).filter((c) => c.sheet.length <= MAX_SETTING_NAME && Number.isInteger(c.count) && c.count >= 0).slice(0, MAX_SETTING_SHEETS).map((c) => line([SETTING_ROW, `${KEEP_COPIES_ROWS_SETTING}${c.count}:${c.sheet}`, '', '', ''])),
      ...(settings.totalOnceGroups ?? []).filter((c) => c.sheet.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((c) => line([SETTING_ROW, `${TOTAL_ONCE_GROUPS_SETTING}${c.count}:${c.sheet}`, '', '', ''])),
      ...(settings.leaveOut ?? []).filter((c) => c.sheet.length <= MAX_SETTING_NAME && /^[a-z][a-z-]{0,40}$/.test(c.reason)).slice(0, MAX_SETTING_SHEETS * 8).map((c) => line([SETTING_ROW, `${LEAVE_OUT_SETTING}${c.reason}:${c.count}:${c.rows}:${c.sheet}`, '', '', ''])),
      ...(settings.sampleKey ?? []).filter((k) => k.sheet.length <= MAX_SETTING_NAME && /^[0-9a-f]{8}/.test(k.hashes) && Number.isInteger(k.rows) && k.rows >= 0).slice(0, MAX_SETTING_SHEETS).flatMap((k) => [
        line([SETTING_ROW, `${SAMPLE_KEY_SETTING}${k.sheet}:${k.hashes}:${k.rows}`, '', '', '']),
        ...(k.prefix !== undefined && k.prefix.trim() !== '' && k.prefix.trim().length <= MAX_KEY_PREFIX ? [line([SETTING_ROW, `${SAMPLE_KEY_PREFIX_SETTING}${k.sheet}:${k.hashes}:${k.rows}:${k.prefix.trim()}`, '', '', ''])] : []),
      ]),
      ...(settings.turned ?? []).filter((t) => t.sheet !== '' && t.sheet.length <= MAX_SETTING_NAME && new RegExp(`^${ONE_HASH}$`).test(t.nameHash) && (t.notSampleHashes === '' || new RegExp(`^${HASHES}$`).test(t.notSampleHashes)) && Number.isInteger(t.rows) && t.rows >= 0).slice(0, MAX_SETTING_SHEETS).map((t) => line([SETTING_ROW, `${TURNED_SETTING}${t.sheet}:${t.nameHash}:${t.rows}:${t.notSampleHashes}${t.headerDates === true ? ':dates' : ''}`, '', '', ''])),
      ...ORDER_LINES.flatMap((l) => (settings[l.slot] ?? []).filter((d) => l.pattern.test(`${d.order}:x:${'0'.repeat(8)}:0`) && d.sheet !== '' && d.sheet.length <= MAX_SETTING_NAME && /^[0-9a-f]{8}/.test(d.hash) && Number.isInteger(d.rows) && d.rows >= 0).slice(0, MAX_SETTING_SHEETS * 8).map((d) => line([SETTING_ROW, `${l.prefix}${d.order}:${d.sheet}:${d.hash}:${d.rows}`, '', '', '']))),
      ...(settings.decimalReading ?? []).filter((d) => (d.reading === 'decimal' || d.reading === 'thousands') && d.sheet !== '' && d.sheet.length <= MAX_SETTING_NAME && /^[0-9a-f]{8}/.test(d.hash) && Number.isInteger(d.rows) && d.rows >= 0).slice(0, MAX_SETTING_SHEETS * 8).map((d) => line([SETTING_ROW, `${DECIMAL_READING_SETTING}${d.reading}:${d.sheet}:${d.hash}:${d.rows}`, '', '', ''])),
      ...(settings.encoding ?? []).filter((e) => (e.encoding === 'windows-1250' || e.encoding === 'iso-8859-2' || e.encoding === 'windows-1252') && /^[0-9a-f]{8}$/.test(e.hash)).slice(0, MAX_SETTING_SHEETS).map((e) => line([SETTING_ROW, `${ENCODING_SETTING}${e.encoding}:${e.hash}`, '', '', ''])),
      ...(settings.missingCode ?? []).filter((d) => d.sheet !== '' && d.sheet.length <= MAX_SETTING_NAME && /^[0-9a-f]{8}/.test(d.hash) && Number.isInteger(d.rows) && d.rows >= 0).slice(0, MAX_SETTING_SHEETS * 8).map((d) => line([SETTING_ROW, `${MISSING_CODE_SETTING}${d.sheet}:${d.hash}:${d.rows}`, '', '', ''])),
      ...(settings.declaredPosition ?? []).filter((d) => d.sheet !== '' && d.sheet.length <= MAX_SETTING_NAME && [d.lat, d.lon, d.uncertaintyM].every((x) => /^[^:\r\n]{1,40}$/.test(x.trim()) && x.trim() !== '')).slice(0, MAX_SETTING_SHEETS).map((d) => line([SETTING_ROW, `${DECLARED_POSITION_SETTING}${d.lat.trim()}:${d.lon.trim()}:${d.uncertaintyM.trim()}:${Math.max(0, Math.floor(d.rows))}:${d.sheet}`, '', '', ''])),
      ...(settings.declaredDate ?? []).filter((d) => d.sheet !== '' && d.sheet.length <= MAX_SETTING_NAME && DECLARED_DATE_SHAPE.test(d.value.trim())).slice(0, MAX_SETTING_SHEETS).map((d) => line([SETTING_ROW, `${DECLARED_DATE_SETTING}${d.value.trim()}:${Math.max(0, Math.floor(d.rows))}:${d.sheet}`, '', '', ''])),
      ...(settings.sampleJoin ?? []).filter((j) => SHEET_NAMES([...j.results, ...j.description]) && /^[0-9a-f]{8}/.test(j.resultsHashes) && /^[0-9a-f]{8}/.test(j.descriptionHashes) && Number.isInteger(j.resultsRows) && j.resultsRows >= 0 && Number.isInteger(j.descriptionRows) && j.descriptionRows >= 0).slice(0, MAX_SETTING_SHEETS).flatMap((j) => [
        line([SETTING_ROW, `${SAMPLE_JOIN_SETTING}${j.resultsRows}:${j.descriptionRows}:${j.resultsHashes}:${j.descriptionHashes}:${JSON.stringify([...j.results, ...j.description])}`, '', '', '']),
        ...j.conflicts.filter((c) => c.group.length <= MAX_SETTING_NAME && Number.isInteger(c.count) && c.count >= 0).slice(0, MAX_SETTING_SHEETS).map((c) => line([SETTING_ROW, `${SAMPLE_JOIN_CONFLICT_SETTING}${c.take}:${c.count}:${c.group}:${JSON.stringify(j.results)}`, '', '', ''])),
        ...(j.resultsOnly !== undefined && Number.isInteger(j.resultsOnly) && j.resultsOnly >= 0 ? [line([SETTING_ROW, `${SAMPLE_JOIN_RESULTS_ONLY_SETTING}${j.resultsOnly}:${JSON.stringify(j.results)}`, '', '', ''])] : []),
      ]),
      ...(settings.sampleJoinNo ?? []).filter((j) => SHEET_NAMES([...j.results, ...j.description])).slice(0, MAX_SETTING_SHEETS).map((j) => line([SETTING_ROW, `${SAMPLE_JOIN_NO_SETTING}${JSON.stringify([...j.results, ...j.description])}`, '', '', ''])),
      ...(settings.realCountsRows ?? []).filter((c) => c.sheet.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((c) => line([SETTING_ROW, `${REAL_COUNTS_ROWS_SETTING}${c.count}:${c.sheet}`, '', '', ''])),
      ...(settings.dropCopies ?? []).filter((n) => n.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((n) => line([SETTING_ROW, `${DROP_COPIES_SETTING}${n}`, '', '', ''])),
      ...(settings.totalOnce ?? []).filter((n) => n.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((n) => line([SETTING_ROW, `${TOTAL_ONCE_SETTING}${n}`, '', '', ''])),
      ...(settings.presenceOnly ?? []).filter((n) => n.length <= MAX_SETTING_NAME).slice(0, MAX_SETTING_SHEETS).map((n) => line([SETTING_ROW, `${PRESENCE_ONLY_SETTING}${n}`, '', '', ''])),
    ].join('\n') + '\n'
  );
}
