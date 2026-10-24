// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Lang } from '../types';

/*
 * Controlled vocabulary used by column recognition.
 *
 * Units come ONLY from (a) the text of a column header or (b) the NERC P06 table below / the P06 unit a NERC P01
 * concept is linked to (every concept page was opened on 2026-10-16; the URL of each entry is the proof).
 * Nothing here guesses a unit that neither the header nor the vocabulary states.
 */

export type UnitDimension =
  | 'amount/volume'
  | 'amount/mass'
  | 'mass/volume'
  | 'temperature'
  | 'pressure'
  | 'length'
  | 'dimensionless';

export interface UnitEntry {
  /** The label written into Variable.unit / ColumnRole.unit. */
  label: string;
  /** Other spellings, compared after cleanUnitText(). */
  aliases: string[];
  /** NERC P06 code (BODC-approved data storage units). */
  p06: string;
  /** Concept URL of the P06 entry. */
  url: string;
  dimension: UnitDimension;
}

const P06_BASE = 'https://vocab.nerc.ac.uk/collection/P06/current/';
const entry = (label: string, p06: string, dimension: UnitDimension, aliases: string[]): UnitEntry => ({
  label,
  aliases,
  p06,
  url: `${P06_BASE}${p06}/`,
  dimension,
});

/** Lower case, micro sign / Greek mu -> 'u', separators and dots dropped, runs of blanks collapsed. */
export function cleanUnitText(s: string): string {
  return s
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[µμ]/g, 'u')
    .replace(/[\u2212\u2012-\u2015]/g, '-') // minus sign (NFKC of the superscript minus), dashes
    .replace(/[·⋅•]/g, ' ') // middle dot: µmol·kg⁻¹
    .replace(/[_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/*
 * P06 codes UPOX KGUM UMGL UPAA UPDB ULAA UUUU PSUX UUPH UPNM are from docs/research/qc-sources.md item 7.
 * MMPL (millimoles per litre), UGPL (micrograms per litre), UATM (microatmospheres) and UPPT (parts per thousand)
 * were opened the same day: they are the P06 units that the P01 concepts of P01_HINTS point to, or that a header of
 * the golden set states in words.
 */
export const UNIT_VOCAB: readonly UnitEntry[] = [
  entry('µmol/L', 'UPOX', 'amount/volume', []),
  entry('µmol/kg', 'KGUM', 'amount/mass', []),
  entry('mg/L', 'UMGL', 'mass/volume', []),
  entry('°C', 'UPAA', 'temperature', ['°c', 'ºc', '˚c', 'degc', 'deg c', 'degrees c', 'degree c', 'degrees celsius', 'degree celsius', 'celsius', 'c']),
  entry('dbar', 'UPDB', 'pressure', ['dbar', 'db', 'dbars', 'decibar', 'decibars']),
  entry('m', 'ULAA', 'length', ['m', 'metre', 'metres', 'meter', 'meters']),
  entry('dimensionless', 'UUUU', 'dimensionless', ['dimensionless', 'dmnless', 'unitless']),
  entry('PSU', 'PSUX', 'dimensionless', ['psu']),
  entry('pH units', 'UUPH', 'dimensionless', ['ph units', 'ph unit']),
  entry('nmol/L', 'UPNM', 'amount/volume', []),
  entry('mmol/L', 'MMPL', 'amount/volume', []),
  entry('µg/L', 'UGPL', 'mass/volume', []),
  entry('µatm', 'UATM', 'pressure', ['uatm', 'microatm', 'microatmosphere', 'microatmospheres']),
  entry('‰', 'UPPT', 'dimensionless', ['‰', 'ppt', 'permil', 'per mil', 'per mille', 'parts per thousand']),
];

const UNIT_BY_ALIAS: ReadonlyMap<string, UnitEntry> = new Map(
  UNIT_VOCAB.flatMap((u) => [u.label, ...u.aliases].map((a) => [cleanUnitText(a), u] as const)),
);
const UNIT_BY_LABEL: ReadonlyMap<string, UnitEntry> = new Map(UNIT_VOCAB.map((u) => [u.label, u]));

/** Is this text, as a whole, one of the UNIT_VOCAB labels or aliases ('degC', 'celsius', 'psu', 'db')? Concentration notations are not tried. */
export function isUnitAlias(text: string): boolean {
  return UNIT_BY_ALIAS.has(cleanUnitText(text));
}

export function unitEntry(label: string | undefined): UnitEntry | undefined {
  return label === undefined ? undefined : UNIT_BY_LABEL.get(label);
}

const PREFIX_SYMBOL: Record<string, string> = { micro: 'µ', u: 'µ', milli: 'm', mili: 'm', m: 'm', nano: 'n', n: 'n', pico: 'p', p: 'p' };
// <prefix><mol|g> per <litre|kg>, in the notations seen in headers: umol/l, umol l-1, mmol_l, micro_mol_L-1, mili_gram_L-1, mg/kg
const CONCENTRATION =
  /^(micro|milli|mili|nano|pico|u|m|n|p)?\s?(mol|mole|moles|gram|grams|g)\s?(?:\/|per )?\s?(l|litre|liter|litres|liters|kg|kilogram|kilograms)(?:\s?\^?\s?-\s?1)?$/;

interface Composed {
  label: string;
  dimension: UnitDimension;
}

/** A concentration written in any common notation -> its standard label and dimension; undefined otherwise. */
function composeConcentration(clean: string): Composed | undefined {
  const m = CONCENTRATION.exec(clean);
  if (!m) return undefined;
  const base = m[2].startsWith('mol') ? 'mol' : 'g';
  const per = m[3].startsWith('l') ? 'L' : 'kg';
  const prefix = m[1] === undefined ? '' : PREFIX_SYMBOL[m[1]];
  // 'mg' is milligram, never 'm' + 'g' of something else; 'g' alone is not a prefix
  const label = `${prefix}${base}/${per}`;
  const dimension: UnitDimension = base === 'mol' ? (per === 'L' ? 'amount/volume' : 'amount/mass') : per === 'L' ? 'mass/volume' : 'dimensionless';
  return { label, dimension };
}

/**
 * Normalises unit text to a UNIT_VOCAB label ('umol_kg' -> 'µmol/kg', 'micro_mol_L-1' -> 'µmol/L'). A concentration
 * in an ordinary notation that is not in the table ('mmol_l', 'nmol/l') is rewritten to its standard spelling
 * ('mmol/L'): same unit, only notation. Anything else returns undefined and the caller keeps the text as written.
 */
export function normaliseUnit(text: string): string | undefined {
  const clean = cleanUnitText(text);
  if (clean === '') return undefined;
  const alias = UNIT_BY_ALIAS.get(clean);
  if (alias) return alias.label;
  const composed = composeConcentration(clean);
  if (composed) return UNIT_BY_LABEL.get(composed.label)?.label ?? composed.label;
  return undefined;
}

/** Dimension of a unit label: from UNIT_VOCAB, else from the concentration notation, else undefined. */
export function unitDimension(unit: string | undefined): UnitDimension | undefined {
  if (unit === undefined) return undefined;
  const e = UNIT_BY_LABEL.get(unit);
  if (e) return e.dimension;
  const n = normaliseUnit(unit);
  if (n === undefined) return undefined;
  return UNIT_BY_LABEL.get(n)?.dimension ?? composeConcentration(cleanUnitText(n))?.dimension;
}

/* ---------- NERC P01 hints ---------- */

export interface P01Hint {
  /** Position / time / depth / pressure columns. */
  role?: 'latitude' | 'longitude' | 'datetime' | 'depth' | 'pressure';
  /** Canonical variable key (CANONICAL_VARIABLES) or a free name; absent for the structural roles. */
  variable?: string;
  /** UNIT_VOCAB label of the P06 unit the P01 concept is linked to (skos:related); absent when it links to none we list. */
  unit?: string;
  /** The P06 code behind `unit`. */
  p06?: string;
  /** Concept page that was opened. */
  url: string;
  /** Short English paraphrase of the P01 preferred label. */
  meaning: string;
}

const P01_BASE = 'https://vocab.nerc.ac.uk/collection/P01/current/';
const p01 = (code: string, meaning: string, rest: Omit<P01Hint, 'url' | 'meaning'> = {}): [string, P01Hint] => [
  code,
  { ...rest, url: `${P01_BASE}${code}/`, meaning },
];

/**
 * P01 codes seen in OPeNDAP headers of the IO PAN catalogue plus the common structural ones. Every entry was opened
 * on https://vocab.nerc.ac.uk/collection/P01/current/<CODE>/ on 2026-10-16; `unit` is only set where the concept
 * carries a skos:related link to a P06 unit. Codes that do not resolve there (e.g. the header SDN:P01::D13CMOP11 of
 * the golden POC file answers 404) are NOT in this table and stay unrecognised.
 */
export const P01_HINTS: Readonly<Record<string, P01Hint>> = Object.fromEntries([
  p01('ALATZZ01', 'Latitude north', { role: 'latitude' }),
  p01('ALONZZ01', 'Longitude east', { role: 'longitude' }),
  p01('ADEPZZ01', 'Depth (spatial coordinate) relative to water surface in the water body', { role: 'depth', unit: 'm', p06: 'ULAA' }),
  p01('DEPHPR01', 'Depth (spatial coordinate) relative to water surface by profiling pressure sensor and UNESCO conversion', { role: 'depth', unit: 'm', p06: 'ULAA' }),
  p01('STRT8601', 'Start date and time (UT, ISO 8601, known precision)', { role: 'datetime' }),
  p01('DTUT8601', 'Date and time (UT, ISO 8601, known precision)', { role: 'datetime' }),
  p01('PRESPR01', 'Pressure exerted by the water body by profiling pressure sensor, zero at sea level', { role: 'pressure', unit: 'dbar', p06: 'UPDB' }),
  p01('PRESPS01', 'Pressure exerted by the water body by fixed in-situ pressure sensor, zero at sea level', { role: 'pressure', unit: 'dbar', p06: 'UPDB' }),
  p01('TEMPPR01', 'Temperature of the water body', { variable: 'temperature', unit: '°C', p06: 'UPAA' }),
  p01('TEMPP901', 'Temperature (ITS-90) of the water body', { variable: 'temperature', unit: '°C', p06: 'UPAA' }),
  p01('TEMPST01', 'Temperature of the water body by CTD or STD', { variable: 'temperature', unit: '°C', p06: 'UPAA' }),
  p01('PSLTZZ01', 'Practical salinity of the water body', { variable: 'salinity', unit: 'dimensionless', p06: 'UUUU' }),
  p01('PSALST01', 'Practical salinity of the water body by CTD and UNESCO 1983 computation', { variable: 'salinity', unit: 'dimensionless', p06: 'UUUU' }),
  p01('PSALMV01', 'Practical salinity of the water body by moving vessel profiler and UNESCO 1983 computation', { variable: 'salinity', unit: 'dimensionless', p06: 'UUUU' }),
  p01('DOXYZZXX', 'Concentration of oxygen per unit volume of the water body', { variable: 'oxygen', unit: 'µmol/L', p06: 'UPOX' }),
  p01('DOXMZZXX', 'Concentration of oxygen per unit mass of the water body', { variable: 'oxygen', unit: 'µmol/kg', p06: 'KGUM' }),
  p01('PHXXZZXX', 'pH (unspecified scale) of the water body', { variable: 'pH', unit: 'pH units', p06: 'UUPH' }),
  p01('PHXXSP02', 'pH (total scale) of the water body by spectrophotometry', { variable: 'pH', unit: 'pH units', p06: 'UUPH' }),
  p01('TCO2KG02', 'Total inorganic carbon per unit mass of the water body by acidification and gas analyser', { variable: 'DIC', unit: 'µmol/kg', p06: 'KGUM' }),
  p01('ALKYPOTK', 'Total alkalinity per unit mass of the water body by potentiometry', { variable: 'TA', unit: 'µmol/kg', p06: 'KGUM' }),
  p01('PHOSKGD5', 'Phosphate per unit mass of the water body [0.2 um filtered] by colorimetric autoanalysis', { variable: 'phosphate', unit: 'µmol/kg', p06: 'KGUM' }),
  p01('SLCAKGD5', 'Silicate per unit mass of the water body [0.2 um filtered] by colorimetric autoanalysis', { variable: 'silicate', unit: 'µmol/kg', p06: 'KGUM' }),
  p01('PCO2EG01', 'Partial pressure of carbon dioxide in the water body by equilibration, drying and infra-red gas analysis', { variable: 'pCO2', unit: 'µatm', p06: 'UATM' }),
  p01('CORGCAP1', 'Organic carbon (POC) per unit volume of the water body [particulate >GF/F] by acidification and elemental analysis', { variable: 'POC', unit: 'µmol/L', p06: 'UPOX' }),
  p01('NTOTCAP1', 'Total nitrogen (PON) per unit volume of the water body [particulate >GF/F] by acidification and elemental analysis', { variable: 'PON', unit: 'µmol/L', p06: 'UPOX' }),
  p01('D15NEAM1', 'Enrichment of nitrogen-15 in total nitrogen in the water body [particulate >GF/F] by mass spectrometry', { variable: 'd15N', unit: '‰', p06: 'UPPT' }),
]);

const P01_CODE = /^(?:SDN:P01::)?([A-Z][A-Z0-9]{7})$/;

/**
 * The NERC P01 code a (suffix-stripped) header consists of, if any. `declared` is true for the explicit
 * 'SDN:P01::CODE' form, which names a code on its own authority; a bare 8-character code only counts when it is in
 * P01_HINTS (an upper-case 8-letter word is not evidence by itself).
 */
export function p01CodeOf(cleanHeader: string): { code: string; declared: boolean; hint?: P01Hint } | undefined {
  const m = P01_CODE.exec(cleanHeader.trim());
  if (!m) return undefined;
  const declared = cleanHeader.trim().startsWith('SDN:P01::');
  const hint = P01_HINTS[m[1]];
  if (!declared && !hint) return undefined;
  return { code: m[1], declared, hint };
}

/* ---------- canonical variables ---------- */

export interface CanonicalVariable {
  key: string;
  /** Tested against headerKey(name) of the column name (unit already removed). */
  headerPatterns: RegExp[];
  /** Words an abstract uses for it; English first, other languages only where seen. */
  abstractTerms: Record<Lang, string[]>;
}

const cv = (key: string, headerPatterns: RegExp[], en: string[] = []): CanonicalVariable => ({
  key,
  headerPatterns,
  abstractTerms: { pl: [], en, de: [], fr: [] },
});

/** Lower-case ASCII key of a column name: 'PO₄³⁻' -> 'po43', 'NO2-_plus_NO3-' -> 'no2 plus no3', 'Date/Time' -> 'date time'. */
export function headerKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const CANONICAL_VARIABLES: readonly CanonicalVariable[] = [
  cv('DIC', [/^dic$/, /^tco2$/, /^total (dissolved )?inorganic carbon/, /^dissolved inorganic carbon/], ['dissolved inorganic carbon', 'total dissolved inorganic carbon', 'total inorganic carbon', 'DIC']),
  cv('TA', [/^ta$/, /^at$/, /^talk$/, /^alk$/, /^total alkalinity/, /^alkalinity/], ['total alkalinity', 'alkalinity']),
  cv('DOC', [/^doc$/, /^dissolved organic carbon/], ['dissolved organic carbon', 'DOC']),
  cv('salinity', [/^s$/, /^sal$/, /^salinity/, /^practical salinity/, /^psal/], ['salinity']),
  cv('temperature', [/^t$/, /^temp$/, /^tmp$/, /^sst$/, /^temperature/, /^water temperature/], ['temperature']),
  cv('oxygen', [/^o2$/, /^do$/, /^oxygen/, /^dissolved oxygen/, /^doxy/], ['oxygen', 'dissolved oxygen']),
  cv('pH', [/^ph( |$)/], ['pH']),
  cv('nitrate+nitrite', [/^no2( plus| and)? no3$/, /^no3( plus| and)? no2$/, /^nox$/, /^nitrate (plus|and) nitrite/, /^nitrite (plus|and) nitrate/]),
  cv('nitrate', [/^no3$/, /^nitrate/], ['nitrate']),
  cv('nitrite', [/^no2$/, /^nitrite/], ['nitrite']),
  cv('ammonium', [/^nh4$/, /^nh3$/, /^ammonium/, /^ammonia/], ['ammonium']),
  cv('phosphate', [/^po4/, /^hpo4/, /^phosphate/, /^srp$/], ['phosphate', 'orthophosphate']),
  cv('silicate', [/^si$/, /^dsi$/, /^sio2$/, /^sio4$/, /^sio44$/, /^silicate/, /^silica/, /^reactive silicate/], ['silicate', 'silica', 'dissolved silica', 'Si(OH)4', 'SiO2']),
  cv('chlorophyll', [/^chl( |$)/, /^chla$/, /^chlorophyll/], ['chlorophyll']),
  cv('POC', [/^poc$/, /^particulate organic carbon/], ['particulate organic carbon', 'POC']),
  cv('PON', [/^pon$/, /^particulate organic nitrogen/], ['particulate organic nitrogen', 'PON']),
  cv('DIN', [/^din$/], ['dissolved inorganic nitrogen']),
  cv('DON', [/^don$/], ['dissolved organic nitrogen']),
  cv('TN', [/^tn$/], ['total nitrogen']),
  cv('TDN', [/^tdn$/], ['total dissolved nitrogen']),
  cv('DOP', [/^dop$/], ['dissolved organic phosphorus']),
  cv('TDP', [/^tdp$/], ['total dissolved phosphorus']),
  cv('TSS', [/^tss$/], ['total suspended solids']),
  cv('pCO2', [/^pco2/], ['pCO2', 'partial pressure of carbon dioxide']),
  cv('density', [/^density/, /^sigma/, /^rho$/], ['density']),
  cv('chloride', [/^cl$/, /^chloride/], ['chloride']),
  cv('sodium', [/^na$/, /^sodium/], ['sodium']),
  cv('potassium', [/^k$/, /^potassium/], ['potassium']),
  cv('calcium', [/^ca2?$/, /^calcium/], ['calcium']),
  cv('magnesium', [/^mg2?$/, /^magnesium/], ['magnesium']),
  cv('sulphate', [/^so4/, /^sulph?ate/], ['sulphate', 'sulfate']),
];

const CANONICAL_KEYS: ReadonlySet<string> = new Set(CANONICAL_VARIABLES.map((c) => c.key));
export const isCanonicalKey = (key: string): boolean => CANONICAL_KEYS.has(key);

/** First canonical variable whose header pattern matches the key (headerKey of a name); undefined when none. */
export function canonicalFromKey(key: string): string | undefined {
  for (const c of CANONICAL_VARIABLES) if (c.headerPatterns.some((p) => p.test(key))) return c.key;
  return undefined;
}
