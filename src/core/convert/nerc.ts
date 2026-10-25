// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { VARIABLE_CONCEPTS, VARIABLE_VERIFIED_CODES, conceptVariable, labelDimension, nercUri, unitConcept, unitDimension } from './vocab';
import type { NercTerm, PerDimension, VariableConcept } from './vocab';

/*
 * NERC identifiers of the measured-variable columns (stage 5), the pure half. No I/O: the one module that talks to NVS is src/app/optins/nvs.ts (main thread only).
 *
 * The rule of the whole stage: NO IDENTIFIER IS WRITTEN THAT THE USER DID NOT CONFIRM, FOR THAT COLUMN. A verified generic concept is PROPOSED (`suggest`), a method-specific
 * one is only OFFERED, a result of an NVS search is only SHOWN, and the identifier reaches the archive only through a `NercPick` the user made for one column. The
 * worker rebuilds the identifier from the page's pick and accepts nothing but a P01 URI (type) or a P06 URI (unit) of the form below: not a label, not another
 * collection, not a string of the page's own making.
 */

/** Where a confirmed identifier came from: the converter's own verified list, or a result of the user's NVS search (the opt-in). */
export type NercSource = 'suggested' | 'nvs';

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
export function readPick(collection: 'P01' | 'P06', x: unknown): NercPick | undefined {
  if (typeof x !== 'object' || x === null) return undefined;
  const r = x as Record<string, unknown>;
  if (typeof r.id !== 'string' || !(collection === 'P01' ? P01_URI : P06_URI).test(r.id)) return undefined;
  if (r.source !== 'suggested' && r.source !== 'nvs') return undefined;
  if (r.deprecated !== false) return undefined; // deprecated, or not stated: not written
  // a pick that says it came from the converter's own list must BE on that list (the verified, non-deprecated concepts): the page cannot vouch for anything else
  if (r.source === 'suggested' && !VARIABLE_VERIFIED_CODES.includes(`${collection}/${r.id.split('/')[6]}`)) return undefined;
  const label = r.source === 'nvs' && typeof r.label === 'string' && r.label.length <= 600 ? r.label : undefined;
  return { id: r.id, source: r.source, deprecated: false, ...(label === undefined ? {} : { label }) };
}

/** The label of a confirmed P01 pick: that of the verified list when the pick is from it, else what the page passed for the NVS result; undefined when none. */
export function pickLabel(pick: NercPick): string | undefined {
  if (pick.source === 'nvs') return pick.label;
  const code = pick.id.split('/')[6];
  for (const list of Object.values(VARIABLE_CONCEPTS)) for (const c of list) if (c.term.code === code) return c.term.label;
  return undefined;
}

/** True when the label of a confirmed concept states a dimension (per unit mass or volume) that the column's unit contradicts. Neither side stating one is no mismatch. */
export function unitContradictsConcept(label: string | undefined, unit: string | undefined): boolean {
  if (label === undefined || unit === undefined) return false;
  const l = labelDimension(label);
  const u = unitDimension(unit);
  return l !== undefined && u !== undefined && l !== u;
}

/** The decision of one column as the worker may use it: each part checked, the rest dropped. */
export function readDecision(decisions: NercDecisions | undefined, index: number): NercColumnDecision {
  if (decisions === undefined || typeof decisions !== 'object' || decisions === null || !own(decisions, String(index))) return {};
  const d = decisions[String(index)] as unknown;
  if (typeof d !== 'object' || d === null) return {};
  const r = d as Record<string, unknown>;
  const type = readPick('P01', r.type);
  const unit = readPick('P06', r.unit);
  return { ...(type ? { type } : {}), ...(unit ? { unit } : {}) };
}

/* ---------- what is suggested ---------- */

export interface TypeSuggestion {
  /** A verified generic concept for this variable and this unit, shown as the suggestion. Never selected for the user. */
  proposed?: NercTerm;
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
export function suggestType(variable: string, unit: string | undefined): TypeSuggestion {
  const known = conceptVariable(variable);
  const list = known !== undefined && own(VARIABLE_CONCEPTS, known) ? VARIABLE_CONCEPTS[known] : [];
  // a unit with no alias that is plainly per mass (µg/g, mg/kg) still says "not per volume of the water body"; a volume unit with no alias stays unverified (mL/L)
  const per = unit === undefined ? undefined : (unitConcept(unit)?.per ?? (unitDimension(unit) === 'mass' ? 'mass' : undefined));
  const candidates = list.filter((c) => proposable(c, per));
  const proposed = candidates.length === 1 ? candidates[0] : undefined;
  return { ...(proposed ? { proposed: proposed.term } : {}), offered: list.filter((c) => fits(c, per) && c !== proposed).map((c) => c.term) };
}

/** The verified P06 concept for a unit text, to propose. A unit spelled any other way has none. */
export function suggestUnit(unit: string | undefined): NercTerm | undefined {
  return unit === undefined ? undefined : unitConcept(unit)?.term;
}

/** A suggested pick: the id of a verified term, marked as coming from the converter's own list. The page makes one only when the user confirms it. */
export const suggestedPick = (term: NercTerm): NercPick => ({ id: term.uri, source: 'suggested', deprecated: false });
