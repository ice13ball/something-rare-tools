// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Pure helpers behind the /convert page: the quantity form as the core's declaration, the request for the worker, and the text of a finding.
import type { BiomassBasis, ConvertShape, QuantityDeclaration, QuantityKind, SamplingDevice } from '../core/convert';
import { DEVICES } from '../core/convert/vocab';
import { isConvertRuleId, renderConvertPlain } from '../core/convert';
import { renderPlain } from '../core/report';
import type { Finding, Lang, SheetMapping } from '../core/types';
import { EMPTY_METADATA, datasetNameOf } from '../core/convert/metadata';
import type { DatasetMetadata } from '../core/convert/metadata';
import type { ConvertParseResult, ConvertRequestBody, SampleJoinRequest, SheetRef } from '../worker/convert.protocol';
import type { ConvertSettings } from '../core/convert/settings';
import { DECLARED_DATE_SHAPE, savedJoinTake } from '../core/convert/settings';
import type { ConvertOptions } from '../core/convert';
import type { ApprovedSplits } from '../core/convert';
import type { WormsLookup } from '../core/convert';
import type { NercColumnDecision, NercDecisions, NercPick } from '../core/convert/nerc';
import { keyHashes, resolveKeyHashes, shortHash } from '../core/convert/keySetting';
import { defaultKeyPrefix } from '../core/convert/sampleKey';
import { ownRecordsEligible } from '../core/convert/ownRecords';

/** What the user typed and chose for the quantity of one sheet. Empty strings mean "not chosen". */
export interface QuantityForm {
  kind: '' | QuantityKind;
  unit: string;
  basis: '' | BiomassBasis;
  per: '' | 'volume' | 'area' | 'sample';
  medium: '' | 'water' | 'bed';
  effort: 'none' | 'constant' | 'column';
  effortValue: string;
  effortUnit: string;
  effortDimension: '' | 'volume' | 'area';
  /** An abundance class scale, as typed: its name, lowest and highest class and the words for single classes (by class number). */
  scaleName: string;
  scaleMin: string;
  scaleMax: string;
  scaleMeanings: Record<string, string>;
}

export const EMPTY_QUANTITY: QuantityForm = { kind: '', unit: '', basis: '', per: '', medium: '', effort: 'none', effortValue: '', effortUnit: '', effortDimension: '', scaleName: '', scaleMin: '', scaleMax: '', scaleMeanings: {} };

/** Everything the user decides about one sheet. */
export interface SheetChoice {
  use: boolean;
  shape: ConvertShape;
  quantity: QuantityForm;
  cruise: string;
  /** '' = none given, a key of DEVICES, or 'other' (then `deviceText`). */
  device: string;
  deviceText: string;
  /** The mesh size in micrometres as typed; empty = none. */
  mesh: string;
  /** Stage 6: the user marked this sheet "profile / environment of this cruise". Never set by the tool itself (a suggestion is only offered); a companion file of the drop can pre-tick it. */
  profile: boolean;
  /** Stage 6: the user's approval of level IDs made of the station and the depth as written, for a profile sheet with no code column. Starts unticked; a companion file can pre-tick it. */
  profileDepthIds: boolean;
  /** Stage 7: the user's tick "match the stations ignoring a trailing cast number", for a profile sheet. Never automatic; starts unticked; a companion file can pre-tick it. */
  profileIgnoreCast: boolean;
  /** The user's tick "each distinct position is a station", for a profile sheet with no station column. Never automatic; starts unticked on every upload and is not kept in the companion file. */
  profilePosition: boolean;
  /** The user's tick "read as a normal table" for a sheet that looks transposed (species or variables in rows). Never automatic; a companion file can pre-tick it. */
  readAsTable: boolean;
  /** The user's tick "this is a list of species found (presence only, no counts)": no quantity is asked, the cells are marks. Never automatic; off by default; a companion file can pre-tick it. */
  presenceOnly: boolean;
  /** The user's choice, made on CONV-QUANTITY-REPEATED: write one occurrence per sample and taxon, the repeated total taken once. Never automatic; a companion file can pre-tick it. */
  totalOnce: boolean;
  /** The user's choice on CONV-QUANTITY-REPEATED: these equal quantities are real counts. Never automatic; a companion file can pre-tick it. */
  realCounts: boolean;
  /** The user's choice on CONV-ROW-COPIES: leave out the rows that are exact copies of an earlier row and list them. Never automatic and never pre-ticked: a companion file gives `dropCopiesFile` instead. */
  dropCopies: boolean;
  /** The number of copies a companion file recorded with its answer. The converter honours it only when today's analysis finds the same number; the tick stays unticked here. */
  dropCopiesFile?: number;
  /** The same number as the page recorded it when the person answered here (so the finding does not say "from the companion file"). */
  dropCopiesAnswer?: number;
  /**
   * The user's choice "each row is its own record" (a tick on the sheet's form, or a button on CONV-ID-DUPLICATE / CONV-TAXON-NO-QUANTITY). Shown and sent only where core's `ownRecordsEligible` holds. Never automatic;
   * a companion file pre-ticks it (`ownRecordsFromFile`) only for a sheet with the same number of rows.
   */
  ownRecords?: boolean;
  ownRecordsFromFile?: boolean;
  /** Under ownRecords, the user's answer "keep identical rows as separate records" to CONV-ROW-COPIES, with the number of copies it was given for; and the same as a companion file recorded it (checked by the converter against today's analysis). */
  keepCopiesAnswer?: number;
  keepCopiesFile?: number;
  /** The same for "one occurrence per sample and taxon": the number of groups the companion file recorded. */
  totalOnceFile?: number;
  /** The same as the page recorded it. */
  totalOnceAnswer?: number;
  /** The reasons the user answered "leave these rows out and list them" for (CONV-ROW-NOT-UNDERSTOOD), each with the number of rows it was given for. Starts empty; never prefilled. */
  leaveOut?: { reason: string; count: number }[];
  /** The number of rows the user's answer "these are real counts" covered, as the page recorded it. The converter honours it only when today's analysis finds the same number. */
  realCountsAnswer?: number;
  /** The same as a companion file recorded it. */
  realCountsFile?: number;
  /** The same answers as a companion file recorded them (the reason, the rows of that reason and the rows of the sheet): honoured by the converter only when today's numbers are the same. */
  leaveOutFile?: { reason: string; count: number; rows: number }[];
  /** The columns the person picked on the page to say which rows are one sample (indexes, in the order picked). Never prefilled and never guessed; absent until the person uses a key. */
  sampleKey?: number[];
  /** The key above was read from a companion file (it held: the same columns, the same number of rows). */
  sampleKeyFromFile?: boolean;
  /** The name every sample ID of the key starts with, as the person saw it (and may have changed it); kept in the companion file so that a renamed file keeps its IDs. */
  sampleKeyPrefix?: string;
  /** The companion file has saved keys that fit this sheet more than once (several keys, or one key for several sheets): none was applied and the picker says so. */
  sampleKeyAmbiguous?: true;
  /** The day/month order the person declared for date columns of this sheet, by column index (`dmy` = day first, `mdy` = month first). Never prefilled except by a companion file that still holds; never guessed. */
  dayMonthOrder?: Record<number, 'dmy' | 'mdy'>;
  /** The columns whose order above was read from a companion file and has not been changed since (the converter then says the answer came from the file). */
  dayMonthOrderFile?: number[];
  /** The order the person declared for the NN-NN-NN dates of a column (`ymd`, `dmy`, `mdy`): a second answer, independent of dayMonthOrder. Never prefilled except by a companion file that still holds. */
  yyOrder?: Record<number, 'ymd' | 'dmy' | 'mdy'>;
  /** The columns whose yyOrder was read from a companion file and has not been changed since. */
  yyOrderFile?: number[];
  /** The columns (by index) the person answered "treat -99, -999 and -9999 as missing" for (ROW-MISSING-CODE): `missing`, or `real` (these are values, keep them). Neither is ever preselected, and never prefilled except by a companion file that still holds (same header hash, same number of rows). */
  missingCodes?: Record<number, 'missing' | 'real'>;
  /** The columns among `missingCodes` that were read from a companion file and have not been changed since. */
  missingCodesFile?: number[];
  /** The person's answer to the summary-rows question (CONV-SUMMARY-ROW-UNDECIDED) for the sheet, with the number of held rows it was given for (`held`). Never preselected; prefilled only by a companion file that still holds (`fromFile`: same name, same number of rows; the converter also checks the count). On a joined workbook it lives on the results sheet. */
  summaryRows?: { answer: 'leave-out' | 'keep'; count: number; fromFile?: boolean };
  /** The person's answer for each text found in a count column (CONV-TEXT-IN-TAXON-CELL), by the trimmed text (case kept), with the cells it was given for (`held`). Never preselected; prefilled only from a companion file that still holds (`countTextsSaved`, matched below). */
  countTexts?: Record<string, { answer: CountTextAnswer; count: number; fromFile?: boolean }>;
  /** The answer given once for a column (by index): it applies to the texts of that column no text answer covers; its count is the cells of the column that hold a text. Never preselected. */
  countTextColumns?: Record<number, { answer: CountTextAnswer; count: number; fromFile?: boolean }>;
  /** The answers a companion file recorded for this sheet (same name, same number of rows), by the hash of 't' + the text. A pre-pick only for a text of the sheet that has that hash and as many cells; each is used once (`applySavedCountTexts`). */
  countTextsSaved?: { answer: CountTextAnswer; count: number; index: number; hash: string }[];
  /** The whole-column answers a companion file recorded for this sheet (same name, same number of rows), by column index; used only where the column holds as many text cells (`applySavedCountTexts`). */
  countTextColumnsSaved?: { answer: CountTextAnswer; count: number; index: number }[];
  /** The one position the person typed for this sheet (it has no latitude / longitude column), as typed. Empty strings = none. Sent only when all three are filled. */
  positionLat: string;
  positionLon: string;
  /** The uncertainty of that position in metres, as typed. */
  positionUncertainty: string;
  /** The three values above were read from a companion file and have not been edited since (the converter then says so). */
  positionFromFile?: boolean;
  /** A companion file holds a declared position for a sheet of this name, but for another number of rows: it was not applied, and the form says so until the person types their own. */
  positionStale?: true;
  /**
   * The one date or interval (ISO 8601) the person typed for every sample of this sheet, which has no date at all, as typed. Never prefilled except by a companion file that still holds (same sheet name and
   * number of rows); never proposed from a file name, a sheet name, metadata or a value. Empty or absent = none.
   */
  declaredDate?: string;
  /** The date above was read from a companion file and has not been edited since (the converter then says so). */
  dateFromFile?: boolean;
  /** A companion file holds a declared date for a sheet of this name, but for another number of rows: it was not applied, and the form says so until the person types their own. */
  dateStale?: true;
}

/** The device of the form as the core's declaration. Nothing is guessed: an unknown value or an empty "other" is no device. */
export function deviceOf(c: Pick<SheetChoice, 'device' | 'deviceText'>): SamplingDevice | undefined {
  if (c.device === 'other') return c.deviceText.trim() === '' ? undefined : { kind: 'other', text: c.deviceText.trim() };
  return c.device in DEVICES ? { kind: 'known', key: c.device as keyof typeof DEVICES } : undefined;
}

/** The class numbers the form shows a meaning field for: whole min below max, at most 20 classes. Empty otherwise. */
export function scaleClassesOf(f: Pick<QuantityForm, 'scaleMin' | 'scaleMax'>): number[] {
  if (!/^\d+$/.test(f.scaleMin.trim()) || !/^\d+$/.test(f.scaleMax.trim())) return [];
  const lo = Number(f.scaleMin.trim());
  const hi = Number(f.scaleMax.trim());
  return lo < hi && hi - lo + 1 <= 20 ? Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) : [];
}

/**
 * The form as the core's declaration. No kind chosen = no declaration at all, which the core reports as CONV-QUANTITY-UNDECLARED: nothing is
 * guessed. Only what the user filled in is passed on; the core says what is still missing.
 */
export function declarationOf(f: QuantityForm): QuantityDeclaration | undefined {
  if (f.kind === '') return undefined;
  const d: QuantityDeclaration = { kind: f.kind };
  if (f.kind === 'class') {
    // a class has no unit, no per and no medium: stale form state from another kind never leaks
    const meanings: Record<string, string> = {};
    // only the meanings of classes the form shows: a stored one outside the range would make the core reject the whole scale
    for (const n of scaleClassesOf(f)) { const words = (f.scaleMeanings[String(n)] ?? '').trim(); if (words !== '') meanings[String(n)] = words; }
    d.scale = { name: f.scaleName.trim(), min: f.scaleMin.trim(), max: f.scaleMax.trim(), meanings };
  } else if (f.kind === 'density' || f.kind === 'biomass') {
    if (f.unit.trim() !== '') d.unit = f.unit.trim();
    if (f.kind === 'biomass' && f.basis !== '') d.basis = f.basis;
    if (f.per !== '' && (f.per !== 'sample' || f.kind === 'biomass')) d.per = f.per;
    if (f.medium !== '' && d.per !== 'sample') d.medium = f.medium;
  }
  if (f.effort === 'constant') {
    d.effort = { source: 'constant', value: f.effortValue, ...(f.effortUnit.trim() === '' ? {} : { unit: f.effortUnit.trim() }), ...(f.effortDimension === '' ? {} : { dimension: f.effortDimension }) };
  } else if (f.effort === 'column') {
    d.effort = { source: 'column', ...(f.effortUnit.trim() === '' ? {} : { unit: f.effortUnit.trim() }), ...(f.effortDimension === '' ? {} : { dimension: f.effortDimension }) };
  }
  return d;
}

export const sheetKey = (fileId: string, sheet: string): string => `${fileId}\u0000${sheet}`;

export interface ConvertState {
  parsed: ConvertParseResult;
  mappings: Record<string, SheetMapping[]>;
  choices: Record<string, SheetChoice>;
  options: ConvertOptions;
  approved: ApprovedSplits;
  /** candidate taxon columns the user confirmed, by candidateKey */
  confirmed: Record<string, boolean>;
  /** Only the part that appears in the tables is sent with a conversion request (tableMetadataOf). */
  metadata?: DatasetMetadata;
  /** The WoRMS opt-in's results and decisions as entries by name; absent while the box is off or nothing was looked up (stage 4). */
  worms?: WormsLookup;
  /** The NERC identifiers the user confirmed per measured-variable column (stage 5); only those that still match the column's variable and unit are sent. */
  nerc?: NercPicks;
  /** What the person decided about a sheet that describes the samples of another: confirmed (with the answers), or declined. Nothing joins without a confirmed entry. */
  joins?: JoinChoice[];
}

/**
 * The person's decision about one pair of sheets. `confirmed` joins the description sheet to the results sheet by `keys` (column indexes, one pair per key part) with the answers to the groups of
 * differing values and to the samples without a description; `declined` is only the "No" (that pair is not proposed again). `fromFile`: the numbers of `resultsOnly` were read from a companion file.
 */
export interface JoinChoice {
  results: SheetRef;
  description: SheetRef;
  keys: { results: number; description: number }[];
  state: 'confirmed' | 'declined';
  conflicts: SampleJoinRequest['conflicts'];
  resultsOnly?: number;
  fromFile?: boolean;
}

/* ---------- measured variables: the columns the NERC section lists, and what the user confirmed for each (stage 5) ---------- */

/** A measured-variable column of a sheet that is used: what the conversion writes as an eMoF row per sample event. */
export interface NercColumn {
  key: string;
  fileId: string;
  fileName: string;
  sheet: string;
  index: number;
  /** The column's header, as the sheet has it. */
  header: string;
  /** The variable name the column's role gives (written as measurementType). */
  variable: string;
  /** The unit the column's role gives (written as measurementUnit), when it has one. */
  unit?: string;
  /** The P01 code the header declares (`SDN:P01::CODE` or a code of /check's list): proposed first when verified, listed as declared by the file when not. */
  p01?: string;
}

export const nercKey = (fileId: string, sheet: string, index: number): string => `${fileId}\u0000${sheet}\u0000${index}`;

/** What a confirmed identifier was confirmed FOR: a type belongs to the variable and its unit (oxygen per volume or per mass), a unit to the unit text. A pick whose context changed is dropped. */
export const typeContext = (c: Pick<NercColumn, 'variable' | 'unit'>): string => `${c.variable}\u0000${c.unit ?? ''}`;
export const unitContext = (c: Pick<NercColumn, 'unit'>): string => c.unit ?? '';

/** One confirmed identifier as the page holds it: the pick the worker checks, the label to show, and the context it was confirmed for. */
export interface StoredPick extends NercPick {
  label: string;
  ctx: string;
}
export type NercPicks = Record<string, { type?: StoredPick; unit?: StoredPick }>;

/**
 * The measured-variable columns of the sheets the user keeps, in sheet and column order: those whose role is a variable with a name (the conversion reads exactly those).
 * A taxon candidate that is not confirmed has role "ignore" for the conversion and is not listed.
 */
export function nercColumnsOf(parsed: ConvertParseResult, mappings: Record<string, SheetMapping[]>, choices: Record<string, SheetChoice>): NercColumn[] {
  const out: NercColumn[] = [];
  for (const f of parsed.files) {
    for (const m of mappings[f.fileId] ?? f.mappings) {
      const c = choices[sheetKey(f.fileId, m.sheet)];
      if (!c || !c.use) continue;
      for (const col of m.columns) {
        if (col.role.kind !== 'variable' || col.role.variable.trim() === '') continue;
        const unit = col.role.unit?.trim();
        out.push({ key: nercKey(f.fileId, m.sheet, col.index), fileId: f.fileId, fileName: f.fileName, sheet: m.sheet, index: col.index, header: col.header.trim(), variable: col.role.variable.trim(), ...(unit === undefined || unit === '' ? {} : { unit }), ...(col.role.p01 === undefined ? {} : { p01: col.role.p01 }) });
      }
    }
  }
  return out;
}

/** The concept's own preferred label: the stored one is the label as the lists show it, "CODE: label" (ConvertNerc `short`), and only the part after the code is the label. */
export function preferredLabel(p: Pick<StoredPick, 'id' | 'label'>): string {
  const prefix = `${p.id.split('/')[6] ?? ''}: `;
  return prefix.length > 2 && p.label.startsWith(prefix) ? p.label.slice(prefix.length) : p.label;
}

/** The decisions of one sheet for the worker: the picks that still belong to their column (same variable and unit), by column index. */
export function nercDecisionsOf(columns: readonly NercColumn[], picks: NercPicks, fileId: string, sheet: string): NercDecisions | undefined {
  const out: Record<string, NercColumnDecision> = {};
  for (const c of columns) {
    if (c.fileId !== fileId || c.sheet !== sheet || !Object.prototype.hasOwnProperty.call(picks, c.key)) continue;
    const p = picks[c.key];
    const d: NercColumnDecision = {};
    // the preferred label of an NVS result goes along: the worker writes it as the measurementType of the column and reads it for CONV-NERC-UNIT-MISMATCH (a verified concept's label the worker knows)
    if (p.type && p.type.ctx === typeContext(c)) d.type = { id: p.type.id, source: p.type.source, deprecated: p.type.deprecated, ...(p.type.source === 'nvs' ? { label: preferredLabel(p.type) } : {}) };
    if (p.unit && c.unit !== undefined && p.unit.ctx === unitContext(c)) d.unit = { id: p.unit.id, source: p.unit.source, deprecated: p.unit.deprecated };
    if (d.type || d.unit) out[String(c.index)] = d;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * The part of the description that shows in the tables (datasetName, institutionCode, basisOfRecord), everything else empty: the conversion request
 * carries this and nothing more, so typing a title or an abstract does not rerun the conversion, and a change of these three does.
 */
export function tableMetadataOf(m: DatasetMetadata): DatasetMetadata {
  return { ...EMPTY_METADATA, datasetName: datasetNameOf(m), institutionCode: m.institutionCode.trim(), basisOfRecord: m.basisOfRecord };
}

/** The mark that the person changed the role of a column in the table (kept beside the confirmed candidates, cleared with them when a sheet is read again): CONV-ROLE-UNCONFIRMED does not list such a column. */
export const handKey = (fileId: string, sheet: string, index: number): string => `${fileId}\u0000${sheet}\u0000hand\u0000${index}`;
export const candidateKey = (fileId: string, sheet: string, index: number): string => `${fileId}\u0000${sheet}\u0000${index}`;

export interface TaxonCandidate {
  key: string;
  fileId: string;
  fileName: string;
  sheet: string;
  index: number;
  header: string;
}

/**
 * The columns the overlay PROPOSED as taxa at low confidence (a numeric column with a name it does not know) and that still have that role. They
 * are converted only once confirmed. A column the user gave the role to by hand is not in this list: it is their decision.
 */
export function candidatesOf(parsed: ConvertParseResult, mappings: Record<string, SheetMapping[]>, choices?: Record<string, SheetChoice>): TaxonCandidate[] {
  const out: TaxonCandidate[] = [];
  for (const f of parsed.files) {
    for (const m of mappings[f.fileId] ?? f.mappings) {
      // the columns of a PROFILE sheet are not species: the core reports each one of them that has a taxon meaning as not written (CONV-COLUMN-NOT-EXPORTED), and the user may give it another meaning
      if (choices?.[sheetKey(f.fileId, m.sheet)]?.profile === true) continue;
      for (const c of m.columns) {
        const proposed = (f.proposals[m.sheet] ?? []).find((p) => p.index === c.index);
        if (proposed && proposed.confidence === 'low' && proposed.role.kind === 'taxon' && proposed.role.header === true && c.role.kind === 'taxon' && c.role.header === true) {
          out.push({ key: candidateKey(f.fileId, m.sheet, c.index), fileId: f.fileId, fileName: f.fileName, sheet: m.sheet, index: c.index, header: c.header.trim() });
        }
      }
    }
  }
  return out;
}

/** The two answers of a column's dates, each its own slot: the day/month order of its slash dates (`dayMonthOrder`: dmy | mdy) and the order of its NN-NN-NN dates (`yyOrder`: ymd | dmy | mdy). Both travel and are kept alike. */
type OrderSlot = 'dayMonthOrder' | 'yyOrder';
const SLOTS: readonly OrderSlot[] = ['dayMonthOrder', 'yyOrder'];

/** One slot of a sheet's choice as the request carries it: the answers by column, and the columns read from a companion file (a profile sheet is asked about its dates too, so it sends them as well). */
function slotRequest(c: SheetChoice, slot: OrderSlot): Pick<ConvertRequestBody['sheets'][number], 'dayMonthOrder' | 'dayMonthOrderFromFile' | 'yyOrder' | 'yyOrderFromFile'> {
  const answers = c[slot];
  if (answers === undefined || Object.keys(answers).length === 0) return {};
  const fromFile = (c[`${slot}File`] ?? []).filter((i) => answers[i] !== undefined);
  return { [slot]: answers, ...(fromFile.length > 0 ? { [`${slot}FromFile`]: fromFile } : {}) } as never;
}
const orderRequest = (c: SheetChoice): Pick<ConvertRequestBody['sheets'][number], 'dayMonthOrder' | 'dayMonthOrderFromFile' | 'yyOrder' | 'yyOrderFromFile'> => ({ ...slotRequest(c, 'dayMonthOrder'), ...slotRequest(c, 'yyOrder') });

/** What the person says a text in a count column means. */
export type CountTextAnswer = 'absence' | 'leave-out' | 'present';

/** The count-text answers of a sheet, as the request carries them. */
const countTextsRequest = (c: SheetChoice): Pick<ConvertRequestBody['sheets'][number], 'countTexts' | 'countTextColumns'> => ({
  ...(c.countTexts !== undefined && Object.keys(c.countTexts).length > 0 ? { countTexts: c.countTexts } : {}),
  ...(c.countTextColumns !== undefined && Object.keys(c.countTextColumns).length > 0 ? { countTextColumns: c.countTextColumns } : {}),
});

/** The summary-rows answer of a sheet, as the request carries it. */
const summaryRowsRequest = (c: SheetChoice): Pick<ConvertRequestBody['sheets'][number], 'summaryRows'> => (c.summaryRows === undefined ? {} : { summaryRows: c.summaryRows });

/** The columns the person answered "treat as missing" for, and those among them a companion file gave. */
const missingCodeRequest = (c: SheetChoice): Pick<ConvertRequestBody['sheets'][number], 'missingCodes' | 'missingCodesFromFile'> => {
  const answers = c.missingCodes;
  if (answers === undefined || Object.keys(answers).length === 0) return {};
  const fromFile = (c.missingCodesFile ?? []).filter((i) => answers[i] !== undefined);
  return { missingCodes: answers, ...(fromFile.length > 0 ? { missingCodesFromFile: fromFile } : {}) };
};

/** A column of this sheet has a latitude or longitude role (even one blank in every row): a declared position never applies to it. */
const hasPositionRole = (m: Pick<SheetMapping, 'columns'>): boolean => m.columns.some((c) => c.role.kind === 'latitude' || c.role.kind === 'longitude');

/**
 * The name of the joined sheet that gives the positions of this results sheet: set when the person confirmed a join of it to a description sheet that has a latitude or longitude column. The positions are
 * then the description's, and a declared position never fills gaps in them (core refuses it with that reason). Undefined otherwise.
 */
export function positionJoinedFrom(s: Pick<ConvertState, 'parsed' | 'mappings' | 'joins'>, fileId: string, sheet: string): string | undefined {
  for (const j of s.joins ?? []) {
    if (j.state !== 'confirmed' || j.results.fileId !== fileId || j.results.sheet !== sheet) continue;
    const f = s.parsed.files.find((x) => x.fileId === j.description.fileId);
    const m = f === undefined ? undefined : (s.mappings[f.fileId] ?? f.mappings).find((x) => x.sheet === j.description.sheet);
    if (m !== undefined && hasPositionRole(m)) return j.description.sheet;
  }
  return undefined;
}

/**
 * The position the person declared, as the request carries it: all three fields filled, else nothing. One read from a companion file is sent only for a sheet that still has no position column,
 * is not a profile and is not joined to a sheet that gives the positions (a pre-fill that no longer fits is not offered, and the form says why); one the person typed is always sent, so the converter says why it is refused.
 */
/** The person's local calendar day, YYYY-MM-DD. */
function localToday(): string {
  const d = new Date();
  return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The date the person declared, as the request carries it: the typed text, else nothing. One from a companion file is marked as such. */
function declaredDateRequest(c: Pick<SheetChoice, 'declaredDate' | 'dateFromFile'>): Pick<ConvertRequestBody['sheets'][number], 'declaredDate' | 'declaredDateFromFile'> {
  const v = (c.declaredDate ?? '').trim();
  return v === '' ? {} : { declaredDate: v, ...(c.dateFromFile === true ? { declaredDateFromFile: true } : {}) };
}

function declaredRequest(c: SheetChoice, m: Pick<SheetMapping, 'columns'>, joinedFrom?: string): Pick<ConvertRequestBody['sheets'][number], 'declaredPosition' | 'declaredPositionFromFile'> {
  const [lat, lon, uncertaintyM] = [c.positionLat, c.positionLon, c.positionUncertainty].map((x) => x.trim());
  if (lat === '' || lon === '' || uncertaintyM === '') return {};
  if (c.positionFromFile === true && (c.profile || hasPositionRole(m) || joinedFrom !== undefined)) return {};
  return { declaredPosition: { lat, lon, uncertaintyM }, ...(c.positionFromFile === true ? { declaredPositionFromFile: true } : {}) };
}

/**
 * Whether "each row is its own record" means anything for a sheet of this drop: core's own test (`ownRecordsEligible`, the one place), fed with the sheet's choice (shape, profile mark), its roles and the
 * summary's pivot and turn marks. The page's tick, both buttons and the request all ask this and nothing else.
 */
export function ownRecordsAllowed(f: Pick<ConvertParseResult['files'][number], 'pivots' | 'turned'>, m: Pick<SheetMapping, 'sheet' | 'columns'>, c: Pick<SheetChoice, 'shape' | 'profile'>): boolean {
  return ownRecordsEligible({ shape: c.shape, ...(c.profile ? { profile: {} } : {}), mapping: m as SheetMapping }, { pivot: f.pivots?.[m.sheet], turn: f.turned?.[m.sheet] });
}

/** What a sheet's own-records choice sends: the tick (only where it applies) and, under it, the copies answer with its number. A bare copies tick is never sent. */
function ownRequest(c: SheetChoice, allowed: boolean): Pick<ConvertRequestBody['sheets'][number], 'ownRecords' | 'ownRecordsFromFile' | 'keepCopiesCount' | 'keepCopiesFromFile'> {
  if (!allowed || c.ownRecords !== true) return {};
  const keep = c.keepCopiesAnswer ?? c.keepCopiesFile;
  return { ownRecords: true, ...(c.ownRecordsFromFile === true ? { ownRecordsFromFile: true } : {}), ...(keep === undefined || c.dropCopies ? {} : { keepCopiesCount: keep, ...(c.keepCopiesAnswer === undefined ? { keepCopiesFromFile: true } : {}) }) };
}

/** The request for the worker: the sheets the user kept, with their confirmed roles, shape and declaration. */
export function requestOf(s: ConvertState): ConvertRequestBody {
  const sheets: ConvertRequestBody['sheets'] = [];
  for (const f of s.parsed.files) {
    for (const m0 of s.mappings[f.fileId] ?? f.mappings) {
      const c = s.choices[sheetKey(f.fileId, m0.sheet)];
      if (!c || !c.use) continue;
      // a proposed taxon column that is not confirmed is left out: its role becomes "ignore" for the conversion. On a PROFILE sheet it keeps its role instead (there is no
      // confirmation of species there), so that the conversion says that the column is not written (CONV-COLUMN-NOT-EXPORTED) and nothing is dropped without a word.
      const unconfirmedTaxa: number[] = [];
      const handSet = m0.columns.filter((col) => s.confirmed[handKey(f.fileId, m0.sheet, col.index)] === true).map((col) => col.index);
      const m: SheetMapping = {
        ...m0,
        columns: m0.columns.map((col) => {
          if (c.profile) return col;
          const proposed = (f.proposals[m0.sheet] ?? []).find((p) => p.index === col.index);
          const candidate = proposed && proposed.confidence === 'low' && proposed.role.kind === 'taxon' && proposed.role.header === true && col.role.kind === 'taxon' && col.role.header === true;
          if (candidate && s.confirmed[candidateKey(f.fileId, m0.sheet, col.index)] !== true) {
            unconfirmedTaxa.push(col.index);
            return { ...col, role: { kind: 'ignore' as const } };
          }
          return col;
        }),
      };
      const nerc = s.nerc ? nercDecisionsOf(nercColumnsOf(s.parsed, s.mappings, s.choices), s.nerc, f.fileId, m.sheet) : undefined;
      if (c.profile) {
        // a profile sheet has no quantity, device or mesh size: only its roles, its cruise code and the user's approval of depth-based level IDs are sent
        sheets.push({ fileId: f.fileId, sheet: m.sheet, mapping: m, shape: c.shape, ...(handSet.length > 0 ? { handSet } : {}), profile: { ...(c.profileDepthIds ? { depthIds: true } : {}), ...(c.profileIgnoreCast ? { ignoreCast: true } : {}), ...(c.profilePosition ? { positionStation: true } : {}) }, ...orderRequest(c), ...missingCodeRequest(c), ...summaryRowsRequest(c), ...countTextsRequest(c), ...declaredRequest(c, m, positionJoinedFrom(s, f.fileId, m.sheet)), ...declaredDateRequest(c), ...(nerc ? { nerc } : {}), ...(c.cruise.trim() === '' ? {} : { cruise: c.cruise.trim() }) });
        continue;
      }
      const q = declarationOf(c.quantity);
      const dev = deviceOf(c);
      sheets.push({ fileId: f.fileId, sheet: m.sheet, mapping: m, shape: c.shape, ...(handSet.length > 0 ? { handSet } : {}), ...(unconfirmedTaxa.length > 0 ? { unconfirmedTaxa } : {}), ...(c.readAsTable ? { readAsTable: true } : {}), ...(c.presenceOnly && !m.columns.some((col) => col.role.kind === 'quantity') ? { presenceOnly: true } : {}), ...(c.totalOnce ? { totalOnce: true } : {}), ...(c.realCounts ? { realCounts: true } : {}), ...(c.dropCopies ? { dropCopies: true } : {}), ...(!c.dropCopies && (c.dropCopiesAnswer ?? c.dropCopiesFile) !== undefined ? { dropCopiesCount: (c.dropCopiesAnswer ?? c.dropCopiesFile) as number, ...(c.dropCopiesAnswer === undefined ? { dropCopiesFromFile: true } : {}) } : {}), ...(!c.totalOnce && (c.totalOnceAnswer ?? c.totalOnceFile) !== undefined ? { totalOnceCount: (c.totalOnceAnswer ?? c.totalOnceFile) as number, ...(c.totalOnceAnswer === undefined ? { totalOnceFromFile: true } : {}) } : {}), ...(c.realCountsAnswer !== undefined && !c.realCounts ? { realCountsRows: c.realCountsAnswer } : {}), ...(c.realCountsFile !== undefined && !c.realCounts ? { realCountsRowsFile: c.realCountsFile } : {}), ...ownRequest(c, ownRecordsAllowed(f, m, c)), ...(c.leaveOut !== undefined && c.leaveOut.length > 0 ? { leaveOut: c.leaveOut } : {}), ...(c.leaveOutFile !== undefined && c.leaveOutFile.length > 0 ? { leaveOutFile: c.leaveOutFile } : {}), ...orderRequest(c), ...missingCodeRequest(c), ...summaryRowsRequest(c), ...countTextsRequest(c), ...declaredRequest(c, m, positionJoinedFrom(s, f.fileId, m.sheet)), ...declaredDateRequest(c), ...(c.sampleKey !== undefined && c.sampleKey.length > 0 ? { sampleKey: { columns: c.sampleKey, ...(c.sampleKeyPrefix === undefined ? {} : { prefix: c.sampleKeyPrefix }) }, ...(c.sampleKeyFromFile === true ? { sampleKeyFromFile: true } : {}) } : {}), ...(nerc ? { nerc } : {}), ...(q ? { quantity: q } : {}), ...(c.cruise.trim() === '' ? {} : { cruise: c.cruise.trim() }), ...(dev ? { device: dev } : {}), ...(c.mesh.trim() === '' ? {} : { meshUm: c.mesh.trim() }) });
    }
  }
  const confirmed = (s.joins ?? []).filter((j) => j.state === 'confirmed');
  const declined = (s.joins ?? []).filter((j) => j.state === 'declined');
  return {
    sheets,
    // the person's own calendar day (not UTC's): a date typed for today is not "in the future" a few hours before UTC midnight
    options: { ...s.options, today: s.options.today ?? localToday() },
    approvedSplits: s.approved,
    ...(s.worms ? { worms: s.worms } : {}),
    ...(s.metadata ? { metadata: tableMetadataOf(s.metadata) } : {}),
    ...(confirmed.length > 0 ? { sampleJoin: confirmed.map((j) => ({ results: j.results, description: j.description, keys: j.keys, conflicts: j.conflicts, ...(j.resultsOnly === undefined ? {} : { resultsOnly: j.resultsOnly }), ...(j.fromFile === true ? { fromFile: true } : {}) })) } : {}),
    ...(declined.length > 0 ? { sampleJoinNo: declined.map((j) => ({ results: j.results, description: j.description })) } : {}),
  };
}

/** What a companion file recorded for a sheet that the converter checks against today's numbers (never a tick): copies, repeated totals and the reasons left out. */
function fileAnswers(settings: ConvertParseResult['settings'], sheet: string): Pick<SheetChoice, 'dropCopiesFile' | 'keepCopiesFile' | 'totalOnceFile' | 'leaveOutFile' | 'realCountsFile'> {
  const real = settings.realCountsRows?.find((x) => x.sheet === sheet);
  const copies = settings.dropCopiesRows?.find((x) => x.sheet === sheet);
  const kept = settings.keepCopiesRows?.find((x) => x.sheet === sheet);
  const once = settings.totalOnceGroups?.find((x) => x.sheet === sheet);
  const left = (settings.leaveOut ?? []).filter((x) => x.sheet === sheet).map((x) => ({ reason: x.reason, count: x.count, rows: x.rows }));
  return { ...(copies === undefined ? {} : { dropCopiesFile: copies.count }), ...(kept === undefined ? {} : { keepCopiesFile: kept.count }), ...(once === undefined ? {} : { totalOnceFile: once.count }), ...(left.length === 0 ? {} : { leaveOutFile: left }), ...(real === undefined ? {} : { realCountsFile: real.count }) };
}

type SavedKey = NonNullable<ConvertParseResult['settings']['sampleKey']>[number];
const TABLE_NAME = /\.(csv|tsv|tab|txt)$/i;

/**
 * The saved key (companion file) that belongs to a sheet of this drop, or why none is applied.
 *  1. The name first: an entry with the sheet's name that fits (same number of rows, every column found again) is the sheet's. An entry with its name but another number of rows is the sheet's too, and does not hold.
 *  2. A table file (not a workbook) whose name is in no entry may be a renamed file. An entry of a table file (its sheet name is a table file name) that belongs by name to no sheet of this drop and fits by
 *     columns and rows is applied only when it is the ONLY such entry that fits this sheet and no other table file of the drop without a name match fits it too. Otherwise none is applied and the sheet
 *     says the question is open because several saved keys fit.
 *  3. A workbook entry never matches a table file by columns alone, and a workbook sheet is known by its name only.
 */
function savedKeyFor(parsed: ConvertParseResult, file: ConvertParseResult['files'][number], sheet: ConvertParseResult['files'][number]['sheets'][number]): { kind: 'found'; entry: SavedKey } | { kind: 'ambiguous' } | { kind: 'none' } {
  const entries = parsed.settings.sampleKey ?? [];
  const fits = (k: SavedKey, sh: { header: string[]; rowCount: number }): boolean => k.rows === sh.rowCount && resolveKeyHashes(sh.header, k.hashes) !== undefined;
  const named = entries.find((k) => k.sheet === sheet.name);
  if (named !== undefined) return fits(named, sheet) ? { kind: 'found', entry: named } : { kind: 'none' };
  const all = parsed.files.flatMap((f) => f.sheets.map((sh) => ({ f, sh })));
  const renamable = (f: typeof file, sh: typeof sheet): boolean => f.kind !== 'xlsx' && f.sheets.length === 1 && !entries.some((k) => k.sheet === sh.name);
  if (!renamable(file, sheet)) return { kind: 'none' };
  const free = entries.filter((k) => TABLE_NAME.test(k.sheet) && !all.some((o) => o.sh.name === k.sheet));
  const mine = free.filter((k) => fits(k, sheet));
  if (mine.length === 0) return { kind: 'none' };
  if (mine.length > 1) return { kind: 'ambiguous' };
  const rivals = all.filter((o) => !(o.f === file && o.sh === sheet) && renamable(o.f, o.sh) && fits(mine[0], o.sh));
  return rivals.length === 0 ? { kind: 'found', entry: mine[0] } : { kind: 'ambiguous' };
}

/** The orders a companion file recorded for a sheet, one slot: a pre-pick only for a column found again by its header hash, in a sheet with the same number of rows (declare-first: nothing else is picked). */
function savedSlot(settings: ConvertParseResult['settings'], sheet: { name: string; header: string[]; rowCount: number }, slot: OrderSlot): Pick<SheetChoice, OrderSlot | 'dayMonthOrderFile' | 'yyOrderFile'> {
  const order: Record<number, 'ymd' | 'dmy' | 'mdy'> = {};
  for (const d of settings[slot] ?? []) {
    if (d.sheet !== sheet.name || d.rows !== sheet.rowCount) continue;
    const at = resolveKeyHashes(sheet.header, d.hash);
    if (at?.length === 1 && order[at[0]] === undefined) order[at[0]] = d.order;
  }
  const columns = Object.keys(order).map(Number);
  return columns.length === 0 ? {} : { [slot]: order, [`${slot}File`]: columns };
}
const savedOrders = (settings: ConvertParseResult['settings'], sheet: { name: string; header: string[]; rowCount: number }): Pick<SheetChoice, OrderSlot | 'dayMonthOrderFile' | 'yyOrderFile'> => ({ ...savedSlot(settings, sheet, 'dayMonthOrder'), ...savedSlot(settings, sheet, 'yyOrder') });

/** The summary-rows answer a companion file recorded for a sheet: a pre-pick only for the same sheet name with the same number of rows (the converter then checks that it holds back the same number of rows). */
function savedSummaryRows(settings: ConvertParseResult['settings'], sheet: { name: string; rowCount: number }): Pick<SheetChoice, 'summaryRows'> {
  const d = (settings.summaryRows ?? []).find((x) => x.sheet === sheet.name && x.rows === sheet.rowCount);
  return d === undefined ? {} : { summaryRows: { answer: d.answer, count: d.count, fromFile: true } };
}

/** The count-text answers a companion file recorded for a sheet: kept for a pre-pick only for the same sheet name with the same number of rows; matched to a text of its column by hash once the converter names the texts. */
function savedCountTexts(settings: ConvertParseResult['settings'], sheet: { name: string; rowCount: number }): Pick<SheetChoice, 'countTextsSaved' | 'countTextColumnsSaved'> {
  const saved = (settings.countText ?? []).filter((d) => d.sheet === sheet.name && d.rows === sheet.rowCount).map((d) => ({ answer: d.answer, count: d.count, index: d.index, hash: d.hash }));
  const columns = (settings.countTextColumn ?? []).filter((d) => d.sheet === sheet.name && d.rows === sheet.rowCount).map((d) => ({ answer: d.answer, count: d.count, index: d.index }));
  return { ...(saved.length === 0 ? {} : { countTextsSaved: saved }), ...(columns.length === 0 ? {} : { countTextColumnsSaved: columns }) };
}

/** The cells of column `index` that hold a text, from a finding's `columnTexts` ("index:count,index:count"); undefined when the finding does not name the column. */
function columnTextCount(f: Finding, index: number): number | undefined {
  for (const part of String(f.params.columnTexts ?? '').split(',')) {
    const [i, n] = part.split(':').map(Number);
    if (i === index && Number.isInteger(n) && n >= 1) return n;
  }
  return undefined;
}

/**
 * The saved count-text answers that hold today, each for ITS OWN column only. For each CONV-TEXT-IN-TAXON-CELL the converter asks (one per text and column): a saved answer with that column index, the hash of
 * 't' + that text and the cells the question names (`held`) becomes the sheet's answer for that text in that column (`fromFile`); a saved whole-column answer for that index whose count equals the text cells of
 * the column (`columnTexts`) becomes the column's answer. Each saved answer is used once, so "Ask again" asks again. A line of the old format (no column index) was never read. The text is only ever compared by
 * its hash. Returns the same object when nothing applies.
 */
export function applySavedCountTexts(parsed: ConvertParseResult, choices: Record<string, SheetChoice>, findings: readonly Finding[]): Record<string, SheetChoice> {
  let out = choices;
  for (const f of findings) {
    if (f.ruleId !== 'CONV-TEXT-IN-TAXON-CELL' || f.sheet === undefined || f.value === undefined) continue;
    const file = parsed.files.find((x) => x.fileName === f.file);
    if (file === undefined) continue;
    const key = sheetKey(file.fileId, f.sheet);
    const index = Number(f.params.indexes);
    if (!Number.isInteger(index)) continue;
    let c = out[key];
    if (c === undefined) continue;
    const saved = c.countTextsSaved;
    const held = Number(f.params.held);
    const at = saved === undefined ? -1 : saved.findIndex((d) => d.index === index && d.hash === shortHash('t' + f.value) && d.count === held);
    if (saved !== undefined && at >= 0) {
      const { countTextsSaved: _gone, ...without } = c;
      const rest = saved.filter((_, i) => i !== at);
      c = { ...without, ...(rest.length === 0 ? {} : { countTextsSaved: rest }), countTexts: { ...(c.countTexts ?? {}), [countTextKeyOf(index, f.value)]: { answer: saved[at].answer, count: held, fromFile: true } } };
      out = { ...out, [key]: c };
    }
    const cols = c.countTextColumnsSaved;
    const total = columnTextCount(f, index);
    const col = cols === undefined || total === undefined ? -1 : cols.findIndex((d) => d.index === index && d.count === total);
    if (cols !== undefined && col >= 0 && total !== undefined && c.countTextColumns?.[index] === undefined) {
      const { countTextColumnsSaved: _gone, ...without } = c;
      const rest = cols.filter((_, i) => i !== col);
      out = { ...out, [key]: { ...without, ...(rest.length === 0 ? {} : { countTextColumnsSaved: rest }), countTextColumns: { ...(c.countTextColumns ?? {}), [index]: { answer: cols[col].answer, count: total, fromFile: true } } } };
    }
  }
  return out;
}

/**
 * Takes out of the choices an answer the converter found stale: a per-text answer whose text is asked again although the answer was sent with the request that found it (its count no longer holds, for
 * example after a summary-row or undated leave-out), and with it the whole-column answer of that column (as "Ask again" does: the column would settle the text again without a question); a column answer
 * whose cell count no longer matches the column. Only an answer the shown result was made with is judged (`sent`): one given since stays. Returns the same object when nothing is stale.
 */
export function dropStaleCountTexts(choices: Record<string, SheetChoice>, sent: Record<string, SheetChoice>, findings: readonly Finding[], parsed: ConvertParseResult): Record<string, SheetChoice> {
  let out = choices;
  for (const f of findings) {
    if (f.ruleId !== 'CONV-TEXT-IN-TAXON-CELL' || f.sheet === undefined || f.value === undefined) continue;
    const file = parsed.files.find((x) => x.fileName === f.file);
    const index = Number(f.params.indexes);
    if (file === undefined || !Number.isInteger(index)) continue;
    const key = sheetKey(file.fileId, f.sheet);
    const c = out[key];
    const was = sent[key];
    if (c === undefined || was === undefined) continue;
    const textKey = countTextKeyOf(index, f.value);
    const own = c.countTexts?.[textKey];
    const column = c.countTextColumns?.[index];
    const staleText = own !== undefined && own === was.countTexts?.[textKey];
    const total = columnTextCount(f, index);
    const staleColumn = column !== undefined && column === was.countTextColumns?.[index] && (staleText || (total !== undefined && column.count !== total));
    if (!staleText && !staleColumn) continue;
    const { countTexts: texts, countTextColumns: cols, ...rest } = c;
    const { [textKey]: _gone, ...others } = texts ?? {};
    const { [index]: _col, ...columns } = cols ?? {};
    out = { ...out, [key]: { ...rest, ...((staleText ? others : (texts ?? {})) && Object.keys(staleText ? others : (texts ?? {})).length > 0 ? { countTexts: staleText ? others : texts } : {}), ...(Object.keys(staleColumn ? columns : (cols ?? {})).length > 0 ? { countTextColumns: staleColumn ? columns : cols } : {}) } as SheetChoice };
  }
  return out;
}

/** The key of a per-text count answer (the same as the converter's `countTextKey`): the column index on the sheet and the trimmed text. */
export const countTextKeyOf = (index: number, text: string): string => `${index}\u001f${text}`;

/**
 * The count-text answers a companion file records for texts answered by themselves: one line per text and column the converter said as decided today (CONV-COUNT-TEXT-DECIDED) that no whole-column answer
 * settled. The sheet, the answer, the cells it was given for, the rows of the sheet, the column index and the hash of 't' + the text; never the text.
 */
export function countTextSettingsOf(parsed: ConvertParseResult, said: readonly Finding[]): NonNullable<ConvertSettings['countText']> {
  const out: NonNullable<ConvertSettings['countText']> = [];
  for (const f of said) {
    if (f.ruleId !== 'CONV-COUNT-TEXT-DECIDED' || f.sheet === undefined || f.value === undefined || f.params.via === 'column') continue;
    const answer = f.params.answer;
    const held = Number(f.params.held);
    const index = Number(f.params.indexes);
    const sh = parsed.files.find((x) => x.fileName === f.file)?.sheets.find((x) => x.name === f.sheet);
    if (sh === undefined || (answer !== 'absence' && answer !== 'leave-out' && answer !== 'present') || !Number.isInteger(held) || held < 1 || !Number.isInteger(index) || index < 0) continue;
    const hash = shortHash('t' + f.value);
    if (!out.some((o) => o.sheet === f.sheet && o.index === index && o.hash === hash)) out.push({ sheet: f.sheet, answer, count: held, rows: sh.rowCount, index, hash });
  }
  return out;
}

/** The whole-column count-text answers a companion file records: one line per column a CONV-COUNT-TEXT-DECIDED said was settled by the column's answer (`via` column), with the cells of that column that hold a text. */
export function countTextColumnSettingsOf(parsed: ConvertParseResult, said: readonly Finding[]): NonNullable<ConvertSettings['countTextColumn']> {
  const out: NonNullable<ConvertSettings['countTextColumn']> = [];
  for (const f of said) {
    if (f.ruleId !== 'CONV-COUNT-TEXT-DECIDED' || f.sheet === undefined || f.params.via !== 'column') continue;
    const answer = f.params.answer;
    const index = Number(f.params.indexes);
    const sh = parsed.files.find((x) => x.fileName === f.file)?.sheets.find((x) => x.name === f.sheet);
    const count = Number.isInteger(index) ? columnTextCount(f, index) : undefined;
    if (sh === undefined || (answer !== 'absence' && answer !== 'leave-out' && answer !== 'present') || count === undefined) continue;
    if (!out.some((o) => o.sheet === f.sheet && o.index === index)) out.push({ sheet: f.sheet, answer, count, rows: sh.rowCount, index });
  }
  return out;
}

/**
 * The sheet that carries the summary-rows answer of a finding: on a joined workbook the converter names the results sheet whose run raised the finding (`resultsFile`, `resultsSheet`, on both halves of
 * a split question), so a description joined to several results sheets answers each one on its own sheet; otherwise the finding's own sheet. Never a guess among joins.
 */
export function summaryOwnerOf(parsed: ConvertParseResult, f: Finding): { fileId: string; sheet: string } | undefined {
  const fileName = typeof f.params.resultsFile === 'string' ? f.params.resultsFile : f.file;
  const sheet = typeof f.params.resultsSheet === 'string' ? f.params.resultsSheet : f.sheet;
  const file = parsed.files.find((x) => x.fileName === fileName);
  return file === undefined || sheet === undefined ? undefined : { fileId: file.fileId, sheet };
}

/** The summary-rows answers a companion file records: the results (converted) sheet, the answer, the rows it was given for (the finding's `held`) and the rows of the sheet. Only an answer the converter said today (CONV-SUMMARY-ROW-SKIPPED). */
export function summaryRowsSettingsOf(parsed: ConvertParseResult, choices: Record<string, SheetChoice>, said: readonly Finding[]): NonNullable<ConvertSettings['summaryRows']> {
  const out: NonNullable<ConvertSettings['summaryRows']> = [];
  for (const f of said) {
    if (f.ruleId !== 'CONV-SUMMARY-ROW-SKIPPED') continue;
    const owner = summaryOwnerOf(parsed, f);
    if (owner === undefined) continue;
    const c = choices[sheetKey(owner.fileId, owner.sheet)];
    const sh = parsed.files.find((x) => x.fileId === owner.fileId)?.sheets.find((x) => x.name === owner.sheet);
    const held = Number(f.params.held);
    if (c === undefined || !c.use || sh === undefined || c.summaryRows === undefined || c.summaryRows.count !== held || c.summaryRows.answer !== f.params.answer) continue;
    if (!out.some((o) => o.sheet === owner.sheet)) out.push({ sheet: owner.sheet, answer: c.summaryRows.answer, count: held, rows: sh.rowCount });
  }
  return out;
}

/** The "treat as missing" answers a companion file recorded for a sheet: a pre-pick only for a column found again by its header hash, in a sheet with the same number of rows. */
function savedMissingCodes(settings: ConvertParseResult['settings'], sheet: { name: string; header: string[]; rowCount: number }): Pick<SheetChoice, 'missingCodes' | 'missingCodesFile'> {
  const answers: Record<number, 'missing' | 'real'> = {};
  for (const d of settings.missingCode ?? []) {
    if (d.sheet !== sheet.name || d.rows !== sheet.rowCount) continue;
    const at = resolveKeyHashes(sheet.header, d.hash);
    if (at?.length === 1 && answers[at[0]] === undefined) answers[at[0]] = d.answer;
  }
  const columns = Object.keys(answers).map(Number);
  return columns.length === 0 ? {} : { missingCodes: answers, missingCodesFile: columns };
}

/** The answers a companion file recorded for a sheet, with the own-records pair kept together: the copies answer is "under each row is its own record", so it is kept only while that choice holds for this sheet today (the same name and number of rows). */
function ownAnswers(settings: ConvertParseResult['settings'], sheet: { name: string; rowCount: number }): ReturnType<typeof fileAnswers> & ReturnType<typeof savedOwnRecords> {
  const { keepCopiesFile, ...rest } = fileAnswers(settings, sheet.name);
  const own = savedOwnRecords(settings, sheet);
  return { ...rest, ...(own.ownRecords === true && keepCopiesFile !== undefined ? { keepCopiesFile } : {}), ...own };
}

/** "Each row is its own record" as a companion file recorded it: a pre-tick, only for a sheet of the same name with the same number of rows (the round-2 pattern: the question is open again for another file). */
function savedOwnRecords(settings: ConvertParseResult['settings'], sheet: { name: string; rowCount: number }): Pick<SheetChoice, 'ownRecords' | 'ownRecordsFromFile'> {
  return (settings.ownRecords ?? []).some((x) => x.sheet === sheet.name && x.rows === sheet.rowCount) ? { ownRecords: true, ownRecordsFromFile: true } : {};
}

/**
 * The position a companion file recorded for a sheet of that name, as a pre-fill: only for the same number of rows (as every other saved answer). It is filled whatever the roles (they are not in the file and
 * may be proposed differently today); `declaredRequest` holds it back while it does not apply, and the form says so. For another number of rows nothing is filled and the form says that.
 */
function savedPosition(settings: ConvertParseResult['settings'], sheet: { name: string; rowCount: number }): Pick<SheetChoice, 'positionLat' | 'positionLon' | 'positionUncertainty' | 'positionFromFile' | 'positionStale'> {
  const d = (settings.declaredPosition ?? []).find((x) => x.sheet === sheet.name);
  if (d === undefined) return { positionLat: '', positionLon: '', positionUncertainty: '' };
  if (d.rows !== sheet.rowCount) return { positionLat: '', positionLon: '', positionUncertainty: '', positionStale: true };
  return { positionLat: d.lat, positionLon: d.lon, positionUncertainty: d.uncertaintyM, positionFromFile: true };
}

/** The date a companion file recorded for a sheet of that name, as a pre-fill: only for the same number of rows. For another number nothing is filled and the form says so. */
function savedDate(settings: ConvertParseResult['settings'], sheet: { name: string; rowCount: number }): Pick<SheetChoice, 'declaredDate' | 'dateFromFile' | 'dateStale'> {
  const d = (settings.declaredDate ?? []).find((x) => x.sheet === sheet.name);
  if (d === undefined) return {};
  if (d.rows !== sheet.rowCount) return { dateStale: true };
  return { declaredDate: d.value, dateFromFile: true };
}

/**
 * The initial choices: every sheet used (except one that looks like a data dictionary: it starts unticked, with a note), the shape the overlay suggests (wide when it cannot tell), nothing declared. The profile mark and the approval of depth-based level
 * IDs start OFF; only a companion file of THIS drop that names the sheet pre-ticks them (the approval only on a sheet that is marked), and the suggestion of the overlay
 * never does.
 */
export function initialChoices(parsed: ConvertParseResult): Record<string, SheetChoice> {
  const out: Record<string, SheetChoice> = {};
  const marked = new Set(parsed.settings.profileSheets ?? []);
  const approved = new Set(parsed.settings.profileDepthIds ?? []);
  const castTicked = new Set(parsed.settings.profileIgnoreCast ?? []);
  const asTable = new Set(parsed.settings.transposedAsTable ?? []);
  const presence = new Set(parsed.settings.presenceOnly ?? []);
  for (const f of parsed.files) {
    for (const sh of f.sheets) {
      const profile = marked.has(sh.name);
      // a key a companion file recorded holds only when every column is found again by its hash and the sheet has the same number of rows; otherwise the question is open
      const match = profile ? { kind: 'none' as const } : savedKeyFor(parsed, f, sh);
      const saved = match.kind === 'found' ? match.entry : undefined;
      const savedColumns = saved === undefined ? undefined : resolveKeyHashes(sh.header, saved.hashes);
      out[sheetKey(f.fileId, sh.name)] = { use: f.dictionarySheets?.[sh.name] === undefined, shape: f.suggestedShapes[sh.name] ?? 'wide', quantity: EMPTY_QUANTITY, cruise: '', device: '', deviceText: '', mesh: '', profile, profileDepthIds: profile && approved.has(sh.name), profileIgnoreCast: profile && castTicked.has(sh.name), profilePosition: false, readAsTable: asTable.has(sh.name), presenceOnly: presence.has(sh.name), totalOnce: false, realCounts: false, dropCopies: false, ...ownAnswers(parsed.settings, sh), ...savedOrders(parsed.settings, sh), ...savedMissingCodes(parsed.settings, sh), ...savedSummaryRows(parsed.settings, sh), ...savedCountTexts(parsed.settings, sh), ...savedPosition(parsed.settings, sh), ...savedDate(parsed.settings, sh), ...(savedColumns === undefined ? {} : { sampleKey: savedColumns, sampleKeyFromFile: true, ...(saved?.prefix === undefined ? {} : { sampleKeyPrefix: saved.prefix }) }), ...(match.kind === 'ambiguous' ? { sampleKeyAmbiguous: true as const } : {}) };
    }
  }
  return out;
}

/**
 * The orders of one slot in use (the person's or a companion file's that still holds), for the companion file: the sheet, the column's header hash and the number of rows (no header text, no date).
 * With `declared` (the findings core reported), only an answer core reported as used, for the same file, sheet and column, is written: an answer for a column that no longer has such dates, or that was
 * contradicted, is not kept.
 */
function slotSettingsOf(parsed: ConvertParseResult, choices: Record<string, SheetChoice>, slot: OrderSlot, declared?: readonly Finding[]): NonNullable<ConvertSettings[OrderSlot]> {
  const out: NonNullable<ConvertSettings[OrderSlot]> = [];
  const said = (file: string, sheet: string, index: number): boolean =>
    declared === undefined ||
    declared.some((f) => f.ruleId === 'CONV-DATE-ORDER-DECLARED' && f.file === file && f.sheet === sheet && Number(f.params.index) === index && (f.params.variant === 'two-digit-year') === (slot === 'yyOrder'));
  for (const f of parsed.files) {
    for (const sh of f.sheets) {
      const c = choices[sheetKey(f.fileId, sh.name)];
      const answers = c?.[slot];
      if (!c || !c.use || answers === undefined) continue;
      for (const [k, order] of Object.entries(answers)) {
        const hash = keyHashes(sh.header, [Number(k)]);
        if (hash !== undefined && said(f.fileName, sh.name, Number(k)) && !out.some((o) => o.sheet === sh.name && o.hash === hash)) out.push({ sheet: sh.name, order, hash, rows: sh.rowCount } as never);
      }
    }
  }
  return out;
}
/** The columns of the sheets in use answered "treat as missing" and said by the converter (CONV-MISSING-CODE-DECLARED): the sheet, the column's header hash and the number of rows of the sheet. A name, a hash and a count, never a value. */
export function missingCodeSettingsOf(parsed: ConvertParseResult, choices: Record<string, SheetChoice>, declared?: readonly Finding[]): NonNullable<ConvertSettings['missingCode']> {
  const out: NonNullable<ConvertSettings['missingCode']> = [];
  for (const f of parsed.files) {
    for (const sh of f.sheets) {
      const c = choices[sheetKey(f.fileId, sh.name)];
      if (!c || !c.use) continue;
      for (const [k, answer] of Object.entries(c.missingCodes ?? {})) {
        const index = Number(k);
        const said = declared === undefined || declared.some((x) => x.ruleId === 'CONV-MISSING-CODE-DECLARED' && x.file === f.fileName && x.sheet === sh.name && Number(x.params.index) === index);
        const hash = keyHashes(sh.header, [index]);
        if (hash !== undefined && said && !out.some((o) => o.sheet === sh.name && o.hash === hash)) out.push({ sheet: sh.name, answer, hash, rows: sh.rowCount });
      }
    }
  }
  return out;
}
export const dayMonthOrderSettingsOf = (parsed: ConvertParseResult, choices: Record<string, SheetChoice>, declared?: readonly Finding[]): NonNullable<ConvertSettings['dayMonthOrder']> => slotSettingsOf(parsed, choices, 'dayMonthOrder', declared) as NonNullable<ConvertSettings['dayMonthOrder']>;
export const yyOrderSettingsOf = (parsed: ConvertParseResult, choices: Record<string, SheetChoice>, declared?: readonly Finding[]): NonNullable<ConvertSettings['yyOrder']> => slotSettingsOf(parsed, choices, 'yyOrder', declared);

/** The readings of a comma the person gave (or a companion file gave and still holds) for the columns in use: the sheet, the column's header hash and the number of rows of the sheet AS DROPPED (no header text, no number). */
export function decimalReadingSettingsOf(parsed: ConvertParseResult, choices: Record<string, SheetChoice>): NonNullable<ConvertSettings['decimalReading']> {
  const out: NonNullable<ConvertSettings['decimalReading']> = [];
  for (const f of parsed.files) {
    for (const [sheet, answers] of Object.entries(f.decimal ?? {})) {
      const src = f.decimalSource?.[sheet];
      const c = choices[sheetKey(f.fileId, sheet)];
      if (src === undefined || (c !== undefined && !c.use)) continue;
      for (const [k, a] of Object.entries(answers)) {
        const hash = keyHashes(src.header, [Number(k)]);
        if (hash !== undefined && !out.some((o) => o.sheet === sheet && o.hash === hash)) out.push({ sheet, reading: a.reading, hash, rows: src.rows });
      }
    }
  }
  return out;
}

/** The code page the person picked for a file whose 8-bit letters read differently (or a companion file gave and still holds), with the hash of the file's bytes: a name and a hash, for a file with at least one sheet in use. */
export function encodingSettingsOf(parsed: ConvertParseResult, choices: Record<string, SheetChoice>): NonNullable<ConvertSettings['encoding']> {
  const out: NonNullable<ConvertSettings['encoding']> = [];
  for (const f of parsed.files) {
    const d = f.declaredEncoding;
    if (d === undefined || out.some((o) => o.hash === d.hash)) continue;
    if (f.sheets.length > 0 && !f.sheets.some((sh) => choices[sheetKey(f.fileId, sh.name)]?.use !== false)) continue;
    out.push({ encoding: d.encoding, hash: d.hash });
  }
  return out;
}

/** The sheets in use declared "each row is its own record" (where that applies), with the number of rows of the sheet: what the companion file keeps (a name and a count). */
export function ownRecordsSettingsOf(parsed: ConvertParseResult, mappings: Record<string, SheetMapping[]>, choices: Record<string, SheetChoice>): NonNullable<ConvertSettings['ownRecords']> {
  const out: NonNullable<ConvertSettings['ownRecords']> = [];
  for (const f of parsed.files) {
    for (const sh of f.sheets) {
      const c = choices[sheetKey(f.fileId, sh.name)];
      const m = (mappings[f.fileId] ?? f.mappings).find((x) => x.sheet === sh.name);
      if (c?.use === true && c.ownRecords === true && m !== undefined && ownRecordsAllowed(f, m, c) && !out.some((o) => o.sheet === sh.name)) out.push({ sheet: sh.name, rows: sh.rowCount });
    }
  }
  return out;
}

/** The positions declared for sheets in use (also one held back today by a position column or a profile mark: it is kept for the next drop), for the companion file: the person's own typed values (the only values the file holds). All three must be filled. */
export function declaredPositionSettingsOf(parsed: ConvertParseResult, choices: Record<string, SheetChoice>): NonNullable<ConvertSettings['declaredPosition']> {
  const out: NonNullable<ConvertSettings['declaredPosition']> = [];
  for (const f of parsed.files) {
    for (const sh of f.sheets) {
      const c = choices[sheetKey(f.fileId, sh.name)];
      if (!c || !c.use) continue;
      const [lat, lon, uncertaintyM] = [c.positionLat, c.positionLon, c.positionUncertainty].map((x) => x.trim());
      if (lat !== '' && lon !== '' && uncertaintyM !== '' && !out.some((o) => o.sheet === sh.name)) out.push({ sheet: sh.name, lat, lon, uncertaintyM, rows: sh.rowCount });
    }
  }
  return out;
}

/** The dates declared for sheets in use, for the companion file: the person's own typed text, only when it has the shape of a date (the converter judges the rest). */
export function declaredDateSettingsOf(parsed: ConvertParseResult, choices: Record<string, SheetChoice>): NonNullable<ConvertSettings['declaredDate']> {
  const out: NonNullable<ConvertSettings['declaredDate']> = [];
  for (const f of parsed.files) {
    for (const sh of f.sheets) {
      const c = choices[sheetKey(f.fileId, sh.name)];
      if (!c || !c.use) continue;
      const value = (c.declaredDate ?? '').trim();
      if (value !== '' && DECLARED_DATE_SHAPE.test(value) && !out.some((o) => o.sheet === sh.name)) out.push({ sheet: sh.name, value, rows: sh.rowCount });
    }
  }
  return out;
}

/**
 * The sample keys the person picked (or a companion file gave and still holds), for the companion file: the sheet, the hashes of the key columns and the number of rows (core/convert/keySetting.ts).
 * No header text: a sheet in use that is not a profile and has a key.
 */
export function sampleKeySettingsOf(parsed: ConvertParseResult, choices: Record<string, SheetChoice>): { sheet: string; hashes: string; rows: number; prefix?: string }[] {
  const out: { sheet: string; hashes: string; rows: number; prefix?: string }[] = [];
  for (const f of parsed.files) {
    for (const sh of f.sheets) {
      const c = choices[sheetKey(f.fileId, sh.name)];
      if (!c || !c.use || c.profile || c.sampleKey === undefined || c.sampleKey.length === 0 || out.some((o) => o.sheet === sh.name)) continue;
      const hashes = keyHashes(sh.header, c.sampleKey);
      // the name in front of the IDs is kept as it was used (the default too), so that the same file under another name keeps its IDs
      if (hashes !== undefined) out.push({ sheet: sh.name, hashes, rows: sh.rowCount, prefix: c.sampleKeyPrefix ?? defaultKeyPrefix(f.kind, f.fileName, sh.name) });
    }
  }
  return out;
}

/**
 * The sheets the person turned ("the samples are the columns") that are in use: the hash of the name column and of the columns that are not samples, taken from the sheet AS DROPPED, and the
 * number of its rows: what the companion file keeps. Hashes and counts, never a header text or a value.
 */
export function turnedSettingsOf(parsed: ConvertParseResult, choices: Record<string, SheetChoice>): NonNullable<ConvertSettings['turned']> {
  const out: NonNullable<ConvertSettings['turned']> = [];
  for (const f of parsed.files) {
    for (const [sheet, decl] of Object.entries(f.turned ?? {})) {
      const source = f.turnSource?.[sheet];
      if (source === undefined || choices[sheetKey(f.fileId, sheet)]?.use !== true || out.some((o) => o.sheet === sheet)) continue;
      const nameHash = keyHashes(source.header, [decl.nameColumn]);
      const notSampleHashes = decl.notSamples.length === 0 ? '' : keyHashes(source.header, decl.notSamples);
      if (nameHash !== undefined && notSampleHashes !== undefined) out.push({ sheet, nameHash, notSampleHashes, rows: source.rows, ...(decl.headerDates === true ? { headerDates: true as const } : {}) });
    }
  }
  return out;
}

/** The names of the sheets in use that are marked as profile files, and of those among them whose depth-based level IDs were approved: what the companion file keeps (nothing but names). */
export function profileSettingsOf(parsed: ConvertParseResult, choices: Record<string, SheetChoice>): { profileSheets: string[]; profileDepthIds: string[]; profileIgnoreCast: string[] } {
  const profileSheets: string[] = [];
  const profileDepthIds: string[] = [];
  const profileIgnoreCast: string[] = [];
  for (const f of parsed.files) {
    for (const sh of f.sheets) {
      const c = choices[sheetKey(f.fileId, sh.name)];
      if (!c || !c.use || !c.profile) continue;
      if (!profileSheets.includes(sh.name)) profileSheets.push(sh.name);
      if (c.profileDepthIds && !profileDepthIds.includes(sh.name)) profileDepthIds.push(sh.name);
      if (c.profileIgnoreCast && !profileIgnoreCast.includes(sh.name)) profileIgnoreCast.push(sh.name);
    }
  }
  return { profileSheets, profileDepthIds, profileIgnoreCast };
}

/** The names of the sheets in use that look transposed and that the user chose to read as normal tables: what the companion file keeps (nothing but names). */
export function transposedSettingsOf(parsed: ConvertParseResult, choices: Record<string, SheetChoice>): string[] {
  const out: string[] = [];
  for (const f of parsed.files) for (const sh of f.sheets) if (f.transposedSheets?.[sh.name] !== undefined && choices[sheetKey(f.fileId, sh.name)]?.use === true && choices[sheetKey(f.fileId, sh.name)]?.readAsTable === true && !out.includes(sh.name)) out.push(sh.name);
  return out;
}

/** The names of the sheets in use that are ticked as presence-only species lists: what the companion file keeps (nothing but names). */
export function presenceSettingsOf(parsed: ConvertParseResult, choices: Record<string, SheetChoice>, mappings: Record<string, SheetMapping[]> = {}): string[] {
  const out: string[] = [];
  for (const f of parsed.files) for (const sh of f.sheets) {
    const c = choices[sheetKey(f.fileId, sh.name)];
    // a sheet with a quantity column does not show the tick (and does not send it): it is not kept either
    const hidden = (mappings[f.fileId] ?? f.mappings).find((m) => m.sheet === sh.name)?.columns.some((col) => col.role.kind === 'quantity') === true;
    if (c?.use === true && c.presenceOnly && !c.profile && !hidden && !out.includes(sh.name)) out.push(sh.name);
  }
  return out;
}

/** The names of the sheets in use whose repeated per-taxon total the user chose to write once per sample and taxon: what the companion file keeps (nothing but names). */
/** The names of the sheets in use where the user declared the equal quantities real counts / chose to drop the exact copies: what the companion file keeps (nothing but names). */
export function sheetFlagSettingsOf(parsed: ConvertParseResult, choices: Record<string, SheetChoice>, flag: 'dropCopies'): string[] {
  const out: string[] = [];
  for (const f of parsed.files) for (const sh of f.sheets) if (choices[sheetKey(f.fileId, sh.name)]?.use === true && choices[sheetKey(f.fileId, sh.name)]?.[flag] === true && !out.includes(sh.name)) out.push(sh.name);
  return out;
}

export function totalOnceSettingsOf(parsed: ConvertParseResult, choices: Record<string, SheetChoice>): string[] {
  const out: string[] = [];
  for (const f of parsed.files) for (const sh of f.sheets) if (choices[sheetKey(f.fileId, sh.name)]?.use === true && choices[sheetKey(f.fileId, sh.name)]?.totalOnce === true && !out.includes(sh.name)) out.push(sh.name);
  return out;
}

/** A finding in words: the converter's own rules from their registry, the data-check rules (a date that cannot be read) from theirs. */
export function plainOf(f: Finding, lang: Lang): string {
  return isConvertRuleId(f.ruleId) ? renderConvertPlain(f, lang) : renderPlain(f, lang);
}

/** The file name of the sheet with proposed codes: "<name>-with-codes.csv" (a sheet name is added for a workbook). */
export function codesFileName(fileName: string, sheet: string, sheetCount: number): string {
  const stem = fileName.replace(/\.[A-Za-z0-9]+$/, '');
  return `${stem}${sheetCount > 1 ? `-${sheet}` : ''}-with-codes.csv`;
}

/**
 * What a tick of "I accept" holds for: the findings of one rule as they are now. A tick is kept per rule id together with this fingerprint, so a rule whose
 * findings change after the tick (a new mapping, another sheet) is no longer accepted and has to be ticked again.
 */
export const fingerprint = (findings: readonly Finding[]): string => JSON.stringify(findings.map((f) => [f.file, f.sheet, f.field, f.value, f.lines, f.params]));

/**
 * CONV-ROLE-UNCONFIRMED is ticked for a SET of columns, not for a text: a column the person answers by hand after the tick leaves the list and the tick stays, only a column that was not
 * on the list at the tick reopens it. The set is the (file, sheet, column, proposed role) of every listed column, kept in `params.keys`. The tick is the person's acknowledgement and nothing
 * else: it is not a role, it is not sent anywhere except in the list of accepted rules the export asks for, and nothing of it is saved in the companion file.
 */
export const ROLE_RULE = 'CONV-ROLE-UNCONFIRMED';
export const listedColumns = (findings: readonly Finding[]): string[] =>
  findings.flatMap((f) => String(f.params.keys ?? '').split(',').filter((k) => k !== '').map((k) => `${f.file ?? ''}\u0000${f.sheet ?? ''}\u0000${k}`)).sort();
export const printOf = (rule: string, findings: readonly Finding[]): string => (rule === ROLE_RULE ? JSON.stringify(listedColumns(findings)) : fingerprint(findings));
export const tickHolds = (rule: string, ticked: string | undefined, now: string | undefined, findings: readonly Finding[]): boolean => {
  if (ticked === undefined) return false;
  if (rule !== ROLE_RULE) return ticked === now;
  try {
    const before = new Set(JSON.parse(ticked) as string[]);
    return listedColumns(findings).every((k) => before.has(k));
  } catch {
    return false;
  }
};

/* ---------- the join of a results sheet to the sheet that describes its samples (core/convert/sampleJoin.ts) ---------- */

type SheetOf = { file: ConvertParseResult['files'][number]; sheet: ConvertParseResult['files'][number]['sheets'][number] };
/** The sheet a reference names in this drop (undefined when the drop holds no such sheet). */
export function sheetOfRef(parsed: ConvertParseResult, ref: SheetRef): SheetOf | undefined {
  const file = parsed.files.find((f) => f.fileId === ref.fileId);
  const sheet = file?.sheets.find((x) => x.name === ref.sheet);
  return file === undefined || sheet === undefined ? undefined : { file, sheet };
}

/** The sheet of this drop with that file name and sheet name, when there is exactly one (a companion file knows sheets by names). */
function refByNames(parsed: ConvertParseResult, names: readonly [string, string]): SheetRef | undefined {
  const hits = parsed.files.filter((f) => f.fileName === names[0] && f.sheets.some((x) => x.name === names[1]));
  return hits.length === 1 ? { fileId: hits[0].fileId, sheet: names[1] } : undefined;
}

/**
 * The joins a companion file of THIS drop recorded, as the page starts from them (F11). A confirmation holds only when both sheets are found by file name and sheet name, have the same number of
 * rows as when it was given, and every key column of both sides is found again by its hash; otherwise nothing is applied and the question is open (the proposal shows again). An answer to a group
 * of differing values comes back with the number it was given for (the core honours it only for the same number); a group saved as `mixed` (per sample or per pair: never written) comes back
 * unanswered. A declined pair comes back declined.
 */
export function initialJoins(parsed: ConvertParseResult): JoinChoice[] {
  const out: JoinChoice[] = [];
  for (const j of parsed.settings.sampleJoin ?? []) {
    const results = refByNames(parsed, j.results);
    const description = refByNames(parsed, j.description);
    const r = results === undefined ? undefined : sheetOfRef(parsed, results);
    const d = description === undefined ? undefined : sheetOfRef(parsed, description);
    if (results === undefined || description === undefined || r === undefined || d === undefined) continue;
    if (r.sheet.rowCount !== j.resultsRows || d.sheet.rowCount !== j.descriptionRows) continue;
    const rc = resolveKeyHashes(r.sheet.header, j.resultsHashes);
    const dc = resolveKeyHashes(d.sheet.header, j.descriptionHashes);
    if (rc === undefined || dc === undefined || rc.length !== dc.length) continue;
    out.push({
      results,
      description,
      keys: rc.map((c, i) => ({ results: c, description: dc[i] })),
      state: 'confirmed',
      conflicts: j.conflicts.filter((c) => c.take !== 'mixed').map((c) => ({ group: c.group, take: c.take as 'description' | 'results', count: c.count, exceptions: [] })),
      fromFile: true,
      ...(j.resultsOnly === undefined ? {} : { resultsOnly: j.resultsOnly }),
    });
  }
  for (const n of parsed.settings.sampleJoinNo ?? []) {
    const results = refByNames(parsed, n.results);
    const description = refByNames(parsed, n.description);
    if (results !== undefined && description !== undefined && !out.some((j) => j.results.fileId === results.fileId && j.results.sheet === results.sheet && j.description.fileId === description.fileId && j.description.sheet === description.sheet)) {
      out.push({ results, description, keys: [], state: 'declined', conflicts: [] });
    }
  }
  return out;
}

/**
 * The joins for the companion file: names, row counts and hashes of the key columns, the number of samples accepted without a description, and, for each answered group, its bulk side with the
 * number of samples it was given for. A group answered per sample or per pair is `mixed` (those answers hold sample codes and values, so they are never written). Nothing but names, hashes and counts.
 */
export function sampleJoinSettingsOf(parsed: ConvertParseResult, joins: readonly JoinChoice[]): Pick<ConvertSettings, 'sampleJoin' | 'sampleJoinNo'> {
  const sampleJoin: NonNullable<ConvertSettings['sampleJoin']> = [];
  const sampleJoinNo: NonNullable<ConvertSettings['sampleJoinNo']> = [];
  for (const j of joins) {
    const r = sheetOfRef(parsed, j.results);
    const d = sheetOfRef(parsed, j.description);
    if (r === undefined || d === undefined) continue;
    if (j.state === 'declined') {
      sampleJoinNo.push({ results: [r.file.fileName, r.sheet.name], description: [d.file.fileName, d.sheet.name] });
      continue;
    }
    const resultsHashes = keyHashes(r.sheet.header, j.keys.map((k) => k.results));
    const descriptionHashes = keyHashes(d.sheet.header, j.keys.map((k) => k.description));
    if (resultsHashes === undefined || descriptionHashes === undefined) continue;
    sampleJoin.push({
      results: [r.file.fileName, r.sheet.name],
      description: [d.file.fileName, d.sheet.name],
      resultsRows: r.sheet.rowCount,
      descriptionRows: d.sheet.rowCount,
      resultsHashes,
      descriptionHashes,
      ...(j.resultsOnly === undefined ? {} : { resultsOnly: j.resultsOnly }),
      conflicts: j.conflicts.map((c) => ({ group: c.group, take: savedJoinTake(c), count: c.count })),
    });
  }
  return { ...(sampleJoin.length > 0 ? { sampleJoin } : {}), ...(sampleJoinNo.length > 0 ? { sampleJoinNo } : {}) };
}
