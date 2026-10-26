// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { VARIABLE_CONCEPTS, VARIABLE_VERIFIED_CODES, conceptVariable, labelDimension, nercUri, unitConcept, unitDimension } from './vocab';
import type { NercTerm, PerDimension, VariableConcept } from './vocab';
import { TAB_OR_NEWLINE } from './ids';

/*
 * NERC identifiers of the measured-variable columns (stage 5), the pure half. No I/O: the one module that talks to NVS is src/app/optins/nvs.ts (main thread only).
 *
 * The rule of the whole stage: NO IDENTIFIER IS WRITTEN THAT THE USER DID NOT CONFIRM, FOR THAT COLUMN. A verified generic concept is PROPOSED (`suggest`), a method-specific
 * one is only OFFERED, a result of an NVS search is only SHOWN, and the identifier reaches the archive only through a `NercPick` the user made for one column. The
 * worker rebuilds the identifier from the page's pick and accepts nothing but a P01 URI (type) or a P06 URI (unit) of the form below: not a label, not another
 * collection, not a string of the page's own making.
 */

/**
 * Where a confirmed identifier came from: the converter's own verified list, a result of the user's NVS search (the opt-in), or a P01 code that the file's own header declares
 * (`SDN:P01::CODE`) and that the converter could NOT verify: shown as "declared by the file" and written only after the user confirmed it (the worker checks that the column's header
 * declares exactly that code).
 */
export type NercSource = 'suggested' | 'nvs' | 'declared';

/**
 * One confirmed identifier for one column. `deprecated` is what NVS (or the verified list) says about the concept; a deprecated concept is never written, whatever
 * the page sends ("You should not use any deprecated concepts for any measurement ID", OBIS Manual, "Vocabulary").
 */
export interface NercPick {
  id: string;
  source: NercSource;
  deprecated: boolean;
  /** The label NVS gave the concept (a result of the user's search only; a verified concept's label is looked up here). Read for CONV-NERC-UNIT-MISMATCH, never written. */
  label?: string;
}

/** The user's confirmed identifiers of one variable column. Absent = not confirmed = nothing written. */
export interface NercColumnDecision {
  type?: NercPick;
  unit?: NercPick;
}

/** By the column's index in its sheet, as a string (a plain object survives the message to the worker). */
export type NercDecisions = Readonly<Record<string, NercColumnDecision>>;

/** The URI forms the converter writes (http, trailing slash: the form BioCheck's reference tables join on). Codes are upper-case letters and digits: P01 has eight, P06 four. */
export const P01_URI = /^http:\/\/vocab\.nerc\.ac\.uk\/collection\/P01\/current\/[A-Z0-9]{8}\/$/;
export const P06_URI = /^http:\/\/vocab\.nerc\.ac\.uk\/collection\/P06\/current\/[A-Z0-9]{4}\/$/;

/** The concept URI of a P01 / P06 code typed or returned by a search, or undefined when the code is not of the expected shape. */
export function conceptUri(collection: 'P01' | 'P06', code: string): string | undefined {
  const uri = nercUri(collection, code);
  return (collection === 'P01' ? P01_URI : P06_URI).test(uri) ? uri : undefined;
}

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** The pick of a page's message, or undefined when it is not shaped like one of the right collection. The worker applies this to everything the page sends. */
export function readPick(collection: 'P01' | 'P06', x: unknown, declared?: string): NercPick | undefined {
  if (typeof x !== 'object' || x === null) return undefined;
  const r = x as Record<string, unknown>;
  if (typeof r.id !== 'string' || !(collection === 'P01' ? P01_URI : P06_URI).test(r.id)) return undefined;
  if (r.source !== 'suggested' && r.source !== 'nvs' && r.source !== 'declared') return undefined;
  // a declared code is a P01 type only, and only the code that THIS column's header declares (the page cannot name another one)
  if (r.source === 'declared' && (collection !== 'P01' || declared === undefined || r.id.split('/')[6] !== declared)) return undefined;
  if (r.deprecated !== false) return undefined; // deprecated, or not stated: not written
  // a pick that says it came from the converter's own list must BE on that list (the verified, non-deprecated concepts): the page cannot vouch for anything else
  if (r.source === 'suggested' && !VARIABLE_VERIFIED_CODES.includes(`${collection}/${r.id.split('/')[6]}`)) return undefined;
  // only the first characters are kept: a label is read for its dimension phrase alone, and a long one is cut, not dropped
  const label = r.source === 'nvs' && typeof r.label === 'string' ? r.label.slice(0, 2000) : undefined;
  return { id: r.id, source: r.source, deprecated: false, ...(label === undefined ? {} : { label }) };
}

/** The label of a confirmed P01 pick: ALWAYS the verified list's when the code is on it, whatever the pick says it is (the page cannot relabel a verified code); else, for a real NVS result, what the page passed. */
export function pickLabel(pick: NercPick): string | undefined {
  const code = pick.id.split('/')[6];
  for (const list of Object.values(VARIABLE_CONCEPTS)) for (const c of list) if (c.term.code === code) return c.term.label;
  return pick.source === 'nvs' ? pick.label : undefined;
}

/** A unit that is a percentage: "%", "percent", "per cent", "pct". */
export const isPercentUnit = (unit: string): boolean => /^(%|percent|per ?cent|pct)$/.test(unit.trim().toLowerCase());

/** True when the label of a confirmed concept states a dimension (per unit mass or volume) that the column's unit contradicts. Neither side stating one is no mismatch. */
export function unitContradictsConcept(label: string | undefined, unit: string | undefined): boolean {
  if (label === undefined || unit === undefined) return false;
  // a percentage (oxygen saturation, a percent of a total) is not a concentration: a concept that says "per unit volume / mass" is the wrong quantity for it
  if (isPercentUnit(unit)) return labelDimension(label) !== undefined;
  const l = labelDimension(label);
  const u = unitDimension(unit);
  return l !== undefined && u !== undefined && l !== u;
}

/** The decision of one column as the worker may use it: each part checked, the rest dropped. */
export function readDecision(decisions: NercDecisions | undefined, index: number, declared?: string): NercColumnDecision {
  if (decisions === undefined || typeof decisions !== 'object' || decisions === null || !own(decisions, String(index))) return {};
  const d = decisions[String(index)] as unknown;
  if (typeof d !== 'object' || d === null) return {};
  const r = d as Record<string, unknown>;
  const type = readPick('P01', r.type, declared);
  const unit = readPick('P06', r.unit);
  return { ...(type ? { type } : {}), ...(unit ? { unit } : {}) };
}

/* ---------- what is suggested ---------- */

export interface TypeSuggestion {
  /** A verified generic concept for this variable and this unit, shown as the suggestion. Never selected for the user. A verified code the header DECLARES comes first (it is the file's own statement). */
  proposed?: NercTerm;
  /** A well-formed P01 code the header declares that the converter has not verified: listed as "declared by the file", never proposed, written only after the user chose it. */
  declared?: NercTerm;
  /** The other verified concepts that fit the unit's dimension (method-specific ones, and a generic one that was not picked), offered in the list. */
  offered: NercTerm[];
}

const fits = (c: VariableConcept, per: PerDimension | undefined): boolean => c.per === undefined || per === undefined || c.per === per;
const proposable = (c: VariableConcept, per: PerDimension | undefined): boolean => c.kind === 'generic' && (c.per === undefined || c.per === per);

/**
 * The suggestion for a variable name (as the column's role gives it) and its unit text. A concept is PROPOSED only when it is generic and verified, and, for a
 * concept defined per unit volume or per unit mass (oxygen, nutrients), only when the unit says which: with a unit of neither dimension, or none, nothing is
 * proposed, and the concepts are offered instead. When more than one generic concept fits, nothing is proposed.
 */
export function suggestType(variable: string, unit: string | undefined, declaredCode?: string): TypeSuggestion {
  const base = suggestTypeFor(variable, unit);
  if (declaredCode === undefined) return base;
  const verified = verifiedConcept(declaredCode);
  if (verified) {
    // the file's own verified code first; what would have been proposed becomes one of the offered concepts
    const offered = [...(base.proposed ? [base.proposed] : []), ...base.offered].filter((t) => t.code !== verified.code);
    return { proposed: verified, offered };
  }
  if (P01_DECLARED.test(declaredCode)) return { ...base, declared: { code: declaredCode, uri: nercUri('P01', declaredCode), label: '' } };
  return base;
}

/** A P01 code of the shape the vocabulary uses: eight upper-case letters and digits. */
export const P01_DECLARED = /^[A-Z0-9]{8}$/;

/** The converter's verified concept of a P01 code (any variable, any kind), or undefined. */
export function verifiedConcept(code: string): NercTerm | undefined {
  for (const list of Object.values(VARIABLE_CONCEPTS)) for (const c of list) if (c.term.code === code) return c.term;
  return undefined;
}

function suggestTypeFor(variable: string, unit: string | undefined): TypeSuggestion {
  let known = conceptVariable(variable);
  const percent = unit !== undefined && isPercentUnit(unit);
  // oxygen as a percentage is SATURATION: it gets the saturation concept (when one is verified) and never a concentration concept
  if (known === 'oxygen' && percent) known = 'oxygen saturation';
  const list = known !== undefined && own(VARIABLE_CONCEPTS, known) ? VARIABLE_CONCEPTS[known] : [];
  const per = unit === undefined ? undefined : unitConcept(unit)?.per;
  // the dimension of a unit with no verified alias (µg/g, mg/kg, mL/L) only HIDES the concepts of the other dimension; it never makes a concept proposable
  const shown = per ?? (unit === undefined ? undefined : unitDimension(unit));
  const candidates = list.filter((c) => proposable(c, per));
  const proposed = candidates.length === 1 ? candidates[0] : undefined;
  // a percentage is not a concentration: a concept that is defined per unit volume or mass is never offered for it
  return { ...(proposed ? { proposed: proposed.term } : {}), offered: list.filter((c) => fits(c, shown) && !(percent && c.per !== undefined) && c !== proposed).map((c) => c.term) };
}

/**
 * The P01 concepts of a quantity that has no unit (practical salinity, pH): once the user has CONFIRMED one of them for a column that states no unit, the unit "Dimensionless" (P06 UUUU, opened
 * 2026-10-26) is proposed for it. Never for a column that states a unit, and never before the concept is confirmed.
 */
export const DIMENSIONLESS_TYPE_CODES: ReadonlySet<string> = new Set(['PSLTZZ01', 'PSALST01', 'PSALMV01', 'PHXXZZXX', 'PHXXSP02']);

/** The unit to propose for a confirmed type of a column with no unit text, or undefined. */
export function dimensionlessUnitFor(typeId: string | undefined): NercTerm | undefined {
  if (typeId === undefined || !DIMENSIONLESS_TYPE_CODES.has(typeId.split('/')[6] ?? '')) return undefined;
  return unitConcept('dimensionless')?.term;
}

/**
 * The unit pick that counts for a column: with a unit text, the user's pick; without one, only the "Dimensionless" pick (verified list, UUUU) of a column whose confirmed type is a dimensionless
 * quantity. Everything else is dropped, as before.
 */
export function unitPickFor(unitText: string | undefined, d: NercColumnDecision): NercPick | undefined {
  if (unitText !== undefined) return d.unit;
  const term = dimensionlessUnitFor(d.type?.id);
  return term !== undefined && d.unit?.id === term.uri && d.unit.source === 'suggested' ? d.unit : undefined;
}

/** The verified P06 concept for a unit text, to propose. A unit spelled any other way has none. */
export function suggestUnit(unit: string | undefined): NercTerm | undefined {
  return unit === undefined ? undefined : unitConcept(unit)?.term;
}

/** A suggested pick: the id of a verified term, marked as coming from the converter's own list. The page makes one only when the user confirms it. */
export const suggestedPick = (term: NercTerm): NercPick => ({ id: term.uri, source: 'suggested', deprecated: false });

/** The longest label written as a measurementType: a cut label would be a wrong one, so a longer one is not used (the variable's own name stands instead). */
const MAX_TYPE_LABEL = 500;

/**
 * The measurementType of a measured-variable row: the English preferred label of the concept the user confirmed for the column (the verified list's label, or the
 * label the NVS search returned), else `name`, the variable's own name as before. A label the file cannot hold (a tab, a line break or another control character,
 * empty, or very long) is not used. The identifier is written separately (measurementTypeID).
 */
export function measurementTypeText(pick: NercPick | undefined, name: string): string {
  if (pick === undefined) return name;
  const label = pickLabel(pick)?.trim();
  // the same test as every other text of the archive (a tab, a line break, vertical tab, form feed, NEL, line and paragraph separator), and any other control character
  // eslint-disable-next-line no-control-regex
  if (label === undefined || label === '' || label.length > MAX_TYPE_LABEL || TAB_OR_NEWLINE.test(label) || /[\u0000-\u001f\u007f-\u009f]/.test(label)) return name;
  return label;
}
