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
import type { ConvertParseResult, ConvertRequestBody } from '../worker/convert.protocol';
import type { ConvertOptions } from '../core/convert';
import type { ApprovedSplits } from '../core/convert';
import type { WormsLookup } from '../core/convert';
import type { NercColumnDecision, NercDecisions, NercPick } from '../core/convert/nerc';
import { keyHashes, resolveKeyHashes } from '../core/convert/keySetting';
import { defaultKeyPrefix } from '../core/convert/sampleKey';

/** What the user typed and chose for the quantity of one sheet. Empty strings mean "not chosen". */
export interface QuantityForm {
  kind: '' | QuantityKind;
  unit: string;
  basis: '' | BiomassBasis;
  per: '' | 'volume' | 'area';
  medium: '' | 'water' | 'bed';
  effort: 'none' | 'constant' | 'column';
  effortValue: string;
  effortUnit: string;
  effortDimension: '' | 'volume' | 'area';
}

export const EMPTY_QUANTITY: QuantityForm = { kind: '', unit: '', basis: '', per: '', medium: '', effort: 'none', effortValue: '', effortUnit: '', effortDimension: '' };

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
}

/** The device of the form as the core's declaration. Nothing is guessed: an unknown value or an empty "other" is no device. */
export function deviceOf(c: Pick<SheetChoice, 'device' | 'deviceText'>): SamplingDevice | undefined {
  if (c.device === 'other') return c.deviceText.trim() === '' ? undefined : { kind: 'other', text: c.deviceText.trim() };
  return c.device in DEVICES ? { kind: 'known', key: c.device as keyof typeof DEVICES } : undefined;
}

/**
 * The form as the core's declaration. No kind chosen = no declaration at all, which the core reports as CONV-QUANTITY-UNDECLARED: nothing is
 * guessed. Only what the user filled in is passed on; the core says what is still missing.
 */
export function declarationOf(f: QuantityForm): QuantityDeclaration | undefined {
  if (f.kind === '') return undefined;
  const d: QuantityDeclaration = { kind: f.kind };
  if (f.kind !== 'count') {
    if (f.unit.trim() !== '') d.unit = f.unit.trim();
    if (f.kind === 'biomass' && f.basis !== '') d.basis = f.basis;
    if (f.per !== '') d.per = f.per;
    if (f.medium !== '') d.medium = f.medium;
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
        sheets.push({ fileId: f.fileId, sheet: m.sheet, mapping: m, shape: c.shape, ...(handSet.length > 0 ? { handSet } : {}), profile: { ...(c.profileDepthIds ? { depthIds: true } : {}), ...(c.profileIgnoreCast ? { ignoreCast: true } : {}), ...(c.profilePosition ? { positionStation: true } : {}) }, ...(nerc ? { nerc } : {}), ...(c.cruise.trim() === '' ? {} : { cruise: c.cruise.trim() }) });
        continue;
      }
      const q = declarationOf(c.quantity);
      const dev = deviceOf(c);
      sheets.push({ fileId: f.fileId, sheet: m.sheet, mapping: m, shape: c.shape, ...(handSet.length > 0 ? { handSet } : {}), ...(unconfirmedTaxa.length > 0 ? { unconfirmedTaxa } : {}), ...(c.readAsTable ? { readAsTable: true } : {}), ...(c.presenceOnly && !m.columns.some((col) => col.role.kind === 'quantity') ? { presenceOnly: true } : {}), ...(c.totalOnce ? { totalOnce: true } : {}), ...(c.realCounts ? { realCounts: true } : {}), ...(c.dropCopies ? { dropCopies: true } : {}), ...(!c.dropCopies && (c.dropCopiesAnswer ?? c.dropCopiesFile) !== undefined ? { dropCopiesCount: (c.dropCopiesAnswer ?? c.dropCopiesFile) as number, ...(c.dropCopiesAnswer === undefined ? { dropCopiesFromFile: true } : {}) } : {}), ...(!c.totalOnce && (c.totalOnceAnswer ?? c.totalOnceFile) !== undefined ? { totalOnceCount: (c.totalOnceAnswer ?? c.totalOnceFile) as number, ...(c.totalOnceAnswer === undefined ? { totalOnceFromFile: true } : {}) } : {}), ...(c.realCountsAnswer !== undefined && !c.realCounts ? { realCountsRows: c.realCountsAnswer } : {}), ...(c.realCountsFile !== undefined && !c.realCounts ? { realCountsRowsFile: c.realCountsFile } : {}), ...(c.leaveOut !== undefined && c.leaveOut.length > 0 ? { leaveOut: c.leaveOut } : {}), ...(c.leaveOutFile !== undefined && c.leaveOutFile.length > 0 ? { leaveOutFile: c.leaveOutFile } : {}), ...(c.sampleKey !== undefined && c.sampleKey.length > 0 ? { sampleKey: { columns: c.sampleKey, ...(c.sampleKeyPrefix === undefined ? {} : { prefix: c.sampleKeyPrefix }) }, ...(c.sampleKeyFromFile === true ? { sampleKeyFromFile: true } : {}) } : {}), ...(nerc ? { nerc } : {}), ...(q ? { quantity: q } : {}), ...(c.cruise.trim() === '' ? {} : { cruise: c.cruise.trim() }), ...(dev ? { device: dev } : {}), ...(c.mesh.trim() === '' ? {} : { meshUm: c.mesh.trim() }) });
    }
  }
  return { sheets, options: s.options, approvedSplits: s.approved, ...(s.worms ? { worms: s.worms } : {}), ...(s.metadata ? { metadata: tableMetadataOf(s.metadata) } : {}) };
}

/** What a companion file recorded for a sheet that the converter checks against today's numbers (never a tick): copies, repeated totals and the reasons left out. */
function fileAnswers(settings: ConvertParseResult['settings'], sheet: string): Pick<SheetChoice, 'dropCopiesFile' | 'totalOnceFile' | 'leaveOutFile' | 'realCountsFile'> {
  const real = settings.realCountsRows?.find((x) => x.sheet === sheet);
  const copies = settings.dropCopiesRows?.find((x) => x.sheet === sheet);
  const once = settings.totalOnceGroups?.find((x) => x.sheet === sheet);
  const left = (settings.leaveOut ?? []).filter((x) => x.sheet === sheet).map((x) => ({ reason: x.reason, count: x.count, rows: x.rows }));
  return { ...(copies === undefined ? {} : { dropCopiesFile: copies.count }), ...(once === undefined ? {} : { totalOnceFile: once.count }), ...(left.length === 0 ? {} : { leaveOutFile: left }), ...(real === undefined ? {} : { realCountsFile: real.count }) };
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
      out[sheetKey(f.fileId, sh.name)] = { use: f.dictionarySheets?.[sh.name] === undefined, shape: f.suggestedShapes[sh.name] ?? 'wide', quantity: EMPTY_QUANTITY, cruise: '', device: '', deviceText: '', mesh: '', profile, profileDepthIds: profile && approved.has(sh.name), profileIgnoreCast: profile && castTicked.has(sh.name), profilePosition: false, readAsTable: asTable.has(sh.name), presenceOnly: presence.has(sh.name), totalOnce: false, realCounts: false, dropCopies: false, ...fileAnswers(parsed.settings, sh.name), ...(savedColumns === undefined ? {} : { sampleKey: savedColumns, sampleKeyFromFile: true, ...(saved?.prefix === undefined ? {} : { sampleKeyPrefix: saved.prefix }) }), ...(match.kind === 'ambiguous' ? { sampleKeyAmbiguous: true as const } : {}) };
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
