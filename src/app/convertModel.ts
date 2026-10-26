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
      const m: SheetMapping = {
        ...m0,
        columns: m0.columns.map((col) => {
          if (c.profile) return col;
          const proposed = (f.proposals[m0.sheet] ?? []).find((p) => p.index === col.index);
          const candidate = proposed && proposed.confidence === 'low' && proposed.role.kind === 'taxon' && proposed.role.header === true && col.role.kind === 'taxon' && col.role.header === true;
          return candidate && s.confirmed[candidateKey(f.fileId, m0.sheet, col.index)] !== true ? { ...col, role: { kind: 'ignore' as const } } : col;
        }),
      };
      const nerc = s.nerc ? nercDecisionsOf(nercColumnsOf(s.parsed, s.mappings, s.choices), s.nerc, f.fileId, m.sheet) : undefined;
      if (c.profile) {
        // a profile sheet has no quantity, device or mesh size: only its roles, its cruise code and the user's approval of depth-based level IDs are sent
        sheets.push({ fileId: f.fileId, sheet: m.sheet, mapping: m, shape: c.shape, profile: { ...(c.profileDepthIds ? { depthIds: true } : {}), ...(c.profileIgnoreCast ? { ignoreCast: true } : {}), ...(c.profilePosition ? { positionStation: true } : {}) }, ...(nerc ? { nerc } : {}), ...(c.cruise.trim() === '' ? {} : { cruise: c.cruise.trim() }) });
        continue;
      }
      const q = declarationOf(c.quantity);
      const dev = deviceOf(c);
      sheets.push({ fileId: f.fileId, sheet: m.sheet, mapping: m, shape: c.shape, ...(nerc ? { nerc } : {}), ...(q ? { quantity: q } : {}), ...(c.cruise.trim() === '' ? {} : { cruise: c.cruise.trim() }), ...(dev ? { device: dev } : {}), ...(c.mesh.trim() === '' ? {} : { meshUm: c.mesh.trim() }) });
    }
  }
  return { sheets, options: s.options, approvedSplits: s.approved, ...(s.worms ? { worms: s.worms } : {}), ...(s.metadata ? { metadata: tableMetadataOf(s.metadata) } : {}) };
}

/**
 * The initial choices: every sheet used, the shape the overlay suggests (wide when it cannot tell), nothing declared. The profile mark and the approval of depth-based level
 * IDs start OFF; only a companion file of THIS drop that names the sheet pre-ticks them (the approval only on a sheet that is marked), and the suggestion of the overlay
 * never does.
 */
export function initialChoices(parsed: ConvertParseResult): Record<string, SheetChoice> {
  const out: Record<string, SheetChoice> = {};
  const marked = new Set(parsed.settings.profileSheets ?? []);
  const approved = new Set(parsed.settings.profileDepthIds ?? []);
  const castTicked = new Set(parsed.settings.profileIgnoreCast ?? []);
  for (const f of parsed.files) {
    for (const sh of f.sheets) {
      const profile = marked.has(sh.name);
      out[sheetKey(f.fileId, sh.name)] = { use: true, shape: f.suggestedShapes[sh.name] ?? 'wide', quantity: EMPTY_QUANTITY, cruise: '', device: '', deviceText: '', mesh: '', profile, profileDepthIds: profile && approved.has(sh.name), profileIgnoreCast: profile && castTicked.has(sh.name), profilePosition: false };
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

/** A finding in words: the converter's own rules from their registry, the data-check rules (a date that cannot be read) from theirs. */
export function plainOf(f: Finding, lang: Lang): string {
  return isConvertRuleId(f.ruleId) ? renderConvertPlain(f, lang) : renderPlain(f, lang);
}

/** The file name of the sheet with proposed codes: "<name>-with-codes.csv" (a sheet name is added for a workbook). */
export function codesFileName(fileName: string, sheet: string, sheetCount: number): string {
  const stem = fileName.replace(/\.[A-Za-z0-9]+$/, '');
  return `${stem}${sheetCount > 1 ? `-${sheet}` : ''}-with-codes.csv`;
}
