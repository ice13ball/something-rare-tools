// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { parseNumber } from '../values/numbers';
import { P01, P06, type NercTerm } from './vocab';

/*
 * What the numbers of a sheet mean (declared per sheet by the user) and how that becomes Darwin Core terms and measurement intents.
 *
 *   count    individualCount (whole number) + organismQuantity / organismQuantityType "individuals" + an eMoF row OCOUNT01 (no unit id)
 *   density  an eMoF row on the occurrence: SDBIOL01 (per volume of water) or SDBIOL02 (per area of the bed) with its P06 unit
 *   biomass  an eMoF row on the occurrence: SDBIOL03/04/05/07/08/09 by basis (wet / dry / ash-free dry) and per volume or area
 *   effort   sampleSizeValue / sampleSizeUnit on the sample event + an eMoF row VOLWBSMP (volume) or AREABEDS (area) on that event
 *
 * Nothing is converted: the unit is written as the user declared it, and a P06 id is added only for the units the spike verified.
 * Never P06/UCNT for a count (vocab.ts).
 */
export type QuantityKind = 'count' | 'density' | 'biomass';
export type EffortDimension = 'volume' | 'area';
export type BiomassBasis = 'wet' | 'dry' | 'afdw';

export interface EffortDeclaration {
  /** One value for every sample, or the sheet's column with the `effort` role. */
  source: 'constant' | 'column';
  /** constant: the value as typed (text or number). */
  value?: string | number;
  /** The unit as the user gives it ('m3', 'm2', 'L'). For a column it may come from the role's unit instead. */
  unit?: string;
  /** Volume or area. Optional when the unit says it (m3, L, m2, ha, ...). */
  dimension?: EffortDimension;
}

export interface QuantityDeclaration {
  kind?: QuantityKind;
  /** density / biomass: the unit of the numbers ('#/m3', 'ind m-3', 'g/m2'). A count needs none. */
  unit?: string;
  /** biomass: wet, dry or ash-free dry weight. */
  basis?: BiomassBasis;
  /** density / biomass: per volume or per area; optional when the unit says it. */
  per?: EffortDimension;
  /** density / biomass per area: the water column ('water') or the bed ('bed'). REQUIRED for an area (no default); only a bed has a verified concept. */
  medium?: 'water' | 'bed';
  effort?: EffortDeclaration;
}

/* ---------- units ---------- */

type Numerator = 'count' | 'g' | 'mg';
interface ParsedUnit {
  numerator: Numerator;
  per: EffortDimension;
  p06?: NercTerm;
}

const COUNT_WORDS = '#|ind|inds|individuals?|n|no|org|organisms?|specimens?|cells?';
const RATE = new RegExp(`^(${COUNT_WORDS}|g|mg)(?:/|per)(m3|m2)$`);
const NEGATIVE_POWER = new RegExp(`^(${COUNT_WORDS}|g|mg)(m-3|m-2)$`);

/** 'ind m-3', '#/m³', 'Individuals per m^2', 'g/m2' -> numerator and denominator; undefined when it is something else. */
export function parseRateUnit(text: string): ParsedUnit | undefined {
  const k = text
    .toLowerCase()
    .replace(/[\s.·*_]/g, '')
    .replace(/³/g, '3')
    .replace(/²/g, '2')
    .replace(/\^/g, '')
    .replace(/[−–⁻]/g, '-')
    .replace(/cubicmetre?s?|cubicmeters?/g, 'm3')
    .replace(/squaremetre?s?|squaremeters?/g, 'm2');
  let m = RATE.exec(k);
  let denominator: string | undefined = m?.[2];
  if (!m) {
    m = NEGATIVE_POWER.exec(k);
    denominator = m ? (m[2] === 'm-3' ? 'm3' : 'm2') : undefined;
  }
  if (!m || denominator === undefined) return undefined;
  const numerator: Numerator = m[1] === 'g' ? 'g' : m[1] === 'mg' ? 'mg' : 'count';
  const per: EffortDimension = denominator === 'm3' ? 'volume' : 'area';
  const p06 =
    numerator === 'count' ? (per === 'volume' ? P06.perM3 : P06.perM2) : numerator === 'g' ? (per === 'volume' ? P06.gPerM3 : P06.gPerM2) : per === 'volume' ? P06.mgPerM3 : P06.mgPerM2;
  return { numerator, per, p06 };
}

const VOLUME_UNITS = /^(m3|m³|cubicmetres?|cubicmeters?|l|litres?|liters?|ml|dm3|cm3)$/;
const AREA_UNITS = /^(m2|m²|squaremetres?|squaremeters?|cm2|dm2|km2|ha)$/;

/** Effort unit: its dimension when it says one, and the P06 concept for the two units the spike verified (m3, m2). */
export function parseEffortUnit(text: string): { dimension?: EffortDimension; p06?: NercTerm } {
  const k = text.toLowerCase().replace(/[\s.^]/g, '');
  const canon = k.replace(/³/g, '3').replace(/²/g, '2');
  if (canon === 'm3' || canon === 'cubicmetre' || canon === 'cubicmetres' || canon === 'cubicmeter' || canon === 'cubicmeters') return { dimension: 'volume', p06: P06.m3 };
  if (canon === 'm2' || canon === 'squaremetre' || canon === 'squaremetres' || canon === 'squaremeter' || canon === 'squaremeters') return { dimension: 'area', p06: P06.m2 };
  if (VOLUME_UNITS.test(k)) return { dimension: 'volume' };
  if (AREA_UNITS.test(k)) return { dimension: 'area' };
  return {};
}

/* ---------- the resolved declaration ---------- */

export interface ResolvedEffort {
  source: 'constant' | 'column';
  /** Parsed constant (undefined for a column). */
  constant?: { value: number; text: string };
  unit: string;
  dimension: EffortDimension;
  type: NercTerm;
  unitId?: NercTerm;
}

export interface ResolvedQuantity {
  kind: QuantityKind;
  /** density / biomass: the unit as declared. */
  unit?: string;
  /** density / biomass: the concept of the measurementTypeID, or undefined when none is verified (CONV-NERC-UNKNOWN). */
  type?: NercTerm;
  /** What there is no verified concept for (set with `type` undefined). */
  noTypeFor?: string;
  unitId?: NercTerm;
  /** The unit is declared but has no verified P06 concept (CONV-UNIT-NO-P06). */
  unitWithoutP06?: string;
  effort?: ResolvedEffort;
  /** A typed sample size that is not a number above zero: CONV-EFFORT-INVALID, and no effort is written. */
  effortInvalid?: string;
}

export type QuantityResolution = { ok: true; quantity: ResolvedQuantity } | { ok: false; missing: string[] };

const biomassType = (basis: BiomassBasis, per: EffortDimension, medium: 'water' | 'bed'): NercTerm | undefined => {
  if (per === 'volume') return basis === 'wet' ? P01.wetPerVolume : basis === 'dry' ? P01.dryPerVolume : P01.afdwPerVolume;
  if (medium !== 'bed') return undefined;
  return basis === 'wet' ? P01.wetPerAreaBed : basis === 'dry' ? P01.dryPerAreaBed : P01.afdwPerAreaBed;
};

function resolveEffort(e: EffortDeclaration, columnUnit: string | undefined, decimalComma: boolean): { effort?: ResolvedEffort; missing: string[]; invalid?: string } {
  const unit = (e.unit ?? columnUnit ?? '').trim();
  const known = unit === '' ? {} : parseEffortUnit(unit);
  const dimension = e.dimension ?? known.dimension;
  const missing: string[] = [];
  if (unit === '') missing.push('effort unit');
  if (dimension === undefined && unit !== '') missing.push('effort volume or area');
  let constant: { value: number; text: string } | undefined;
  let invalid: string | undefined;
  if (e.source === 'constant') {
    const text = e.value === undefined ? '' : String(e.value).trim();
    if (text === '') missing.push('effort value');
    else {
      // read with the sheet's own decimal setting, written with a dot; not a number, or not above zero, is CONV-EFFORT-INVALID (not "missing")
      const p = parseNumber(text, decimalComma);
      if (p.status === 'ok' && p.value > 0) constant = { value: p.value, text: decimalComma ? text.replace(',', '.') : text };
      else invalid = text;
    }
  }
  if (missing.length > 0 || dimension === undefined) return { missing, ...(invalid === undefined ? {} : { invalid }) };
  if (invalid !== undefined) return { missing, invalid };
  const type = dimension === 'volume' ? P01.volumeSampled : P01.areaSampled;
  return {
    effort: { source: e.source, ...(constant ? { constant } : {}), unit, dimension, type, ...(known.p06 && known.dimension === dimension ? { unitId: known.p06 } : {}) },
    missing,
  };
}

/**
 * Checks a sheet's declaration and resolves it to concepts. `missing` names what is absent (CONV-QUANTITY-UNDECLARED).
 * `columnEffortUnit` is the unit of the sheet's effort column role, used when the declaration does not repeat it.
 */
export function resolveQuantity(decl: QuantityDeclaration | undefined, opts: { decimalComma?: boolean; columnEffortUnit?: string } = {}): QuantityResolution {
  if (!decl || decl.kind === undefined) return { ok: false, missing: ['kind'] };
  const missing: string[] = [];
  const out: ResolvedQuantity = { kind: decl.kind };
  if (decl.kind === 'count') {
    out.type = P01.count;
  } else {
    const unit = (decl.unit ?? '').trim();
    const any = unit === '' ? undefined : parseRateUnit(unit);
    // the unit must agree with the kind: grams are not a density, individuals are not a biomass
    const parsed = any !== undefined && (decl.kind === 'density' ? any.numerator === 'count' : any.numerator !== 'count') ? any : undefined;
    if (unit === '') missing.push('unit');
    const per = decl.per ?? parsed?.per;
    if (unit !== '' && per === undefined) missing.push('per volume or per area');
    if (decl.kind === 'biomass' && decl.basis === undefined) missing.push('basis');
    if (unit !== '') out.unit = unit;
    if (parsed?.p06 && (decl.per === undefined || decl.per === parsed.per)) out.unitId = parsed.p06;
    else if (unit !== '') out.unitWithoutP06 = unit;
    // per area there is NO default: the bed and the water column have different concepts, so the user says which
    if (per === 'area' && decl.medium === undefined) missing.push('medium');
    if (per !== undefined && !(per === 'area' && decl.medium === undefined)) {
      const medium = decl.medium ?? 'water';
      const type =
        decl.kind === 'density' ? (per === 'volume' ? P01.densityVolume : medium === 'bed' ? P01.densityAreaBed : undefined) : decl.basis === undefined ? undefined : biomassType(decl.basis, per, medium);
      if (type) out.type = type;
      else if (decl.kind === 'density' || decl.basis !== undefined) out.noTypeFor = `${decl.kind === 'biomass' ? `${decl.basis} biomass` : 'density'} per area of the water column`;
    }
  }
  if (decl.effort) {
    const r = resolveEffort(decl.effort, opts.columnEffortUnit, opts.decimalComma === true);
    missing.push(...r.missing);
    if (r.effort) out.effort = r.effort;
    if (r.invalid !== undefined) out.effortInvalid = r.invalid;
  }
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, quantity: out };
}
