// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * NERC Vocabulary Server concepts the converter writes on its own, and nothing else. Every entry was opened on 2026-10-25
 * (docs/research/qc-sources.md, "Converter (/convert) — stage 0 spike", Item 1b): HTTP 200 on the URI, owl:deprecated = false.
 * ⛔ Do not add a code here that the spike did not open. Species-specific P01 codes are forbidden by the OBIS Manual, and Q01 is deprecated.
 *
 * URI form: `http://vocab.nerc.ac.uk/collection/<C>/current/<CODE>/` (http, trailing slash). This is the form BioCheck's reference
 * tables use and it joins them by exact string match.
 *
 * ⛔ P06/UCNT ("Counts") is NOT a count unit: its definition is "A proprietary unit for RDI ADCP instruments ... echo intensity". A count of
 * individuals is written with OCOUNT01 and NO unit id (BioCheck lists OCOUNT01 as "no unit/value ID needed"); whether OBIS wants P06/UUUU
 * there is unverified (the manual is silent), so none is written.
 */
export const nercUri = (collection: 'P01' | 'P06' | 'L22' | 'L05', code: string): string => `http://vocab.nerc.ac.uk/collection/${collection}/current/${code}/`;

export interface NercTerm {
  code: string;
  uri: string;
  /** The preferred label of the concept (the measurementType text written next to the id). */
  label: string;
}
const p01 = (code: string, label: string): NercTerm => ({ code, uri: nercUri('P01', code), label });
const p06 = (code: string, label: string): NercTerm => ({ code, uri: nercUri('P06', code), label });
const l22 = (code: string, label: string): NercTerm => ({ code, uri: nercUri('L22', code), label });
const l05 = (code: string, label: string): NercTerm => ({ code, uri: nercUri('L05', code), label });

/** measurementTypeID (P01). */
export const P01 = {
  count: p01('OCOUNT01', 'Count of biological entity specified elsewhere'),
  densityVolume: p01('SDBIOL01', 'Abundance of biological entity specified elsewhere per unit volume of the water body'),
  densityAreaBed: p01('SDBIOL02', 'Abundance of biological entity specified elsewhere per unit area of the bed'),
  wetPerVolume: p01('SDBIOL04', 'Wet weight biomass of biological entity specified elsewhere per unit volume of the water body'),
  wetPerAreaBed: p01('SDBIOL05', 'Wet weight biomass of biological entity specified elsewhere per unit area of the bed'),
  dryPerVolume: p01('SDBIOL09', 'Dry weight biomass of biological entity specified elsewhere per unit volume of the water body'),
  dryPerAreaBed: p01('SDBIOL08', 'Dry weight biomass of biological entity specified elsewhere per unit area of the bed'),
  afdwPerVolume: p01('SDBIOL07', 'Ash-free dry weight biomass of biological entity specified elsewhere per unit volume of the water body'),
  afdwPerAreaBed: p01('SDBIOL03', 'Ash-free dry weight biomass of biological entity specified elsewhere per unit area of the bed'),
  volumeSampled: p01('VOLWBSMP', 'Volume of sample from the water body'),
  areaSampled: p01('AREABEDS', 'Area of sample {sampled area} from the bed'),
  instrument: p01('NMSPINST', 'Name of sampling instrument'),
  meshSize: p01('MSHSIZE1', 'Mesh size of sample collector'),
} as const;

/** measurementUnitID (P06). */
export const P06 = {
  perM3: p06('UPMM', 'Number per cubic metre'),
  perM2: p06('UPMS', 'Number per square metre'),
  gPerM2: p06('UGMS', 'Grams per square metre'),
  gPerM3: p06('UGMC', 'Grams per cubic metre'),
  mgPerM3: p06('UMMC', 'Milligrams per cubic metre'),
  mgPerM2: p06('UMMS', 'Milligrams per square metre'),
  m3: p06('MCUB', 'Cubic metres'),
  m2: p06('UMSQ', 'Square metres'),
  um: p06('UMIC', 'Micrometres (microns)'),
} as const;

/**
 * Sampling devices for measurementValueID of NMSPINST (docs/research/qc-sources.md, Item 1b and 1c, opened 2026-10-25, owl:deprecated false): the six
 * named devices of the spike (L22) and the four device categories (L05). The value written is the label. Any other device is typed by the user and written
 * without a valueID.
 */
export const DEVICES = {
  bongo: l22('NETT0176', 'Bongo net'),
  wp2: l22('TOOL0979', 'WP-2 net'),
  wp2Unesco: l22('NETT0168', 'WP-2 standard net as described by UNESCO Working Party 2 (1968)'),
  multinet: l22('NETT0187', 'Hydro-Bios MultiNet Mammoth'),
  vanVeen: l22('TOOL0653', 'Van Veen grab'),
  boxCorer: l22('TOOL1177', 'Unspecified box corer'),
  planktonNets: l05('22', 'plankton nets'),
  benthosSamplers: l05('24', 'benthos samplers'),
  sedimentGrabs: l05('50', 'sediment grabs'),
  sedimentCorers: l05('51', 'unconsolidated sediment corers'),
} as const;
export type DeviceKey = keyof typeof DEVICES;

/** Every concept above as `<collection>/<code>`, for the test that pins this list to the spike. */
export const VERIFIED_CODES: readonly string[] = [...Object.values(P01), ...Object.values(P06), ...Object.values(DEVICES)].map((t) => `${t.uri.split('/')[4]}/${t.code}`).sort();

/**
 * The P01 codes of BioCheck's BODCeffort list: the "sampling descriptors and effort" it looks for in measurementTypeID (EMODnet/EMODnetBiocheck, R/checkdataset.R
 * lines 562-566: `sum(grepl(paste(BODCeffort, collapse="|"), unique(eMoF$measurementTypeID))) == 0` gives the warning "No sampling descriptors/effort present";
 * the 29 codes are the content of data/BODCeffort.rda at master 701e6e7, 2026-10-08, read 2026-10-25). The test is a substring match, as grepl is. The three
 * codes this converter writes for sample size and mesh size (P01.volumeSampled VOLWBSMP, P01.areaSampled AREABEDS, P01.meshSize MSHSIZE1) are on the list.
 */
export const BIOCHECK_EFFORT_CODES: readonly string[] = [
  'AREABEDS', 'VOLWBSMP', 'LENTRACK', 'AZDRZZ01', 'VOLFFMXX', 'SZCLBIO1', 'PRSZSPLW', 'MSHSIZE2', 'DSSPXTMT', 'DSSPPRMT', 'DSAMPA01', 'MTHHGHT1',
  'MTHAREA1', 'MTHWDTH1', 'DSSPMT01', 'MSHSIZE1', 'NMSPPF01', 'DSPSSP01', 'PRSZSPUP', 'MSHSIZE3', 'WASPXX01', 'COREWDTH', 'VOLXXXXX', 'VOLFFMDT',
  'VOLFDGDT', 'VOLFMCXX', 'VOLSEDSM', 'VOLSPOPC', 'M91BA36A',
];

/** True when a measurementTypeID is a sampling descriptor or effort term in BioCheck's sense (a substring match of any BODCeffort code). */
export const isEffortTypeId = (typeId: string): boolean => BIOCHECK_EFFORT_CODES.some((c) => typeId.includes(c));

/* ---------- measured variables (stage 5): suggested NERC concepts for the eMoF rows of variable columns ---------- */

/*
 * Concepts a measured-variable column (temperature, salinity, oxygen, nutrients, the carbonate system) may be given, and the units that go with them. They live
 * HERE, in the converter's own vocabulary, and NOT in /check's UNIT_VOCAB or P01_HINTS (src/core/recognize/vocab.ts): extending those would change /check's findings
 * (ROW-UNIT-MISSING, CHEM-UNIT-PAIR, XF-UNIT-CONFLICT and the bare P01 codes it recognises in headers).
 *
 * Every code below was opened on 2026-10-25 as http://vocab.nerc.ac.uk/collection/<C>/current/<CODE>/ (the JSON-LD profile of the concept page): HTTP 200,
 * owl:deprecated = false (docs/research/qc-sources.md, "Converter (/convert) - stage 5 verification"). Nothing here is ever written on its own: a suggestion is
 * written only after the user confirms it for that column (src/core/convert/nerc.ts).
 *
 *   generic  a concept that names the quantity and no method, so it may be PROPOSED (shown as the suggestion, never pre-selected): the user still confirms it
 *   method   a concept that names a method, a phase or a narrower quantity (acidification and a gas analyser, potentiometry, colorimetric autoanalysis, a CTD, a
 *            particulate fraction, chlorophyll-a): only OFFERED in the list, never proposed (plan trap T12)
 *
 * `per` is the dimension of the unit the concept is defined for ("per unit volume of the water body" or "per unit mass"). Oxygen has one concept for each
 * (DOXYZZXX, DOXMZZXX): the proposal is picked by the unit's dimension, and with a unit of neither dimension nothing is proposed. A concept whose `per` disagrees with
 * the unit's is not even offered (its label would describe another quantity).
 */
export type PerDimension = 'volume' | 'mass';

export interface VariableConcept {
  term: NercTerm;
  kind: 'generic' | 'method';
  per?: PerDimension;
}

const vc = (code: string, label: string, kind: VariableConcept['kind'], per?: PerDimension): VariableConcept => ({ term: p01(code, label), kind, ...(per === undefined ? {} : { per }) });

/** By the canonical variable name of /check's recogniser (the converter reads it from the column's role; the table itself is the converter's own). */
export const VARIABLE_CONCEPTS: Readonly<Record<string, readonly VariableConcept[]>> = {
  temperature: [
    vc('TEMPPR01', 'Temperature of the water body', 'generic'),
    vc('TEMPP901', 'Temperature (ITS-90) of the water body', 'method'),
    vc('TEMPST01', 'Temperature of the water body by CTD or STD', 'method'),
  ],
  salinity: [
    vc('PSLTZZ01', 'Practical salinity of the water body', 'generic'),
    vc('PSALST01', 'Practical salinity of the water body by CTD and computation using UNESCO 1983 algorithm', 'method'),
    vc('PSALMV01', 'Practical salinity of the water body by moving vessel profiler (MVP) and computation using UNESCO 1983 algorithm', 'method'),
  ],
  oxygen: [
    vc('DOXYZZXX', 'Concentration of oxygen {O2 CAS 7782-44-7} per unit volume of the water body [dissolved plus reactive particulate phase]', 'generic', 'volume'),
    vc('DOXMZZXX', 'Concentration of oxygen {O2 CAS 7782-44-7} per unit mass of the water body [dissolved plus reactive particulate phase]', 'generic', 'mass'),
  ],
  pH: [vc('PHXXZZXX', 'pH (unspecified scale) of the water body', 'generic'), vc('PHXXSP02', 'pH (total scale) {pH[T]} of the water body by spectrophotometry', 'method')],
  nitrate: [vc('NTRAZZXX', 'Concentration of nitrate {NO3- CAS 14797-55-8} per unit volume of the water body [unknown phase]', 'generic', 'volume')],
  nitrite: [vc('NTRIZZXX', 'Concentration of nitrite {NO2- CAS 14797-65-0} per unit volume of the water body [unknown phase]', 'generic', 'volume')],
  'nitrate+nitrite': [vc('NTRZZZXX', 'Concentration of nitrate+nitrite {NO3+NO2} per unit volume of the water body [unknown phase]', 'generic', 'volume')],
  ammonium: [vc('AMONZZXX', 'Concentration of ammonium {NH4+ CAS 14798-03-9} per unit volume of the water body [unknown phase]', 'generic', 'volume')],
  phosphate: [
    vc('PHOSZZXX', 'Concentration of phosphate {PO43- CAS 14265-44-2} per unit volume of the water body [unknown phase]', 'generic', 'volume'),
    vc('PHOSKGD5', 'Concentration of phosphate {PO43- CAS 14265-44-2} per unit mass of the water body [dissolved plus reactive particulate <0.2um phase] by filtration and colorimetric autoanalysis', 'method', 'mass'),
  ],
  silicate: [
    vc('SLCAZZXX', 'Concentration of silicate {SiO44- CAS 17181-37-2} per unit volume of the water body [unknown phase]', 'generic', 'volume'),
    vc('SLCAKGD5', 'Concentration of silicate {SiO44- CAS 17181-37-2} per unit mass of the water body [dissolved plus reactive particulate <0.2um phase] by filtration and colorimetric autoanalysis', 'method', 'mass'),
  ],
  chlorophyll: [vc('CPHLZZXX', 'Concentration of chlorophyll-a {chl-a CAS 479-61-8} per unit volume of the water body [particulate >unknown phase]', 'method', 'volume')],
  DIC: [
    vc('TCO2ZZXX', 'Concentration of total inorganic carbon {TCO2 CAS 7440-44-0} per unit volume of the water body [dissolved plus reactive particulate phase]', 'method', 'volume'),
    vc('TCO2KG02', 'Concentration of total inorganic carbon {TCO2 CAS 7440-44-0} per unit mass of the water body [dissolved plus reactive particulate phase] by acidification and CO2 quantification by gas analyser', 'method', 'mass'),
  ],
  TA: [vc('ALKYZZXX', 'Total alkalinity per unit volume of the water body', 'method', 'volume'), vc('ALKYPOTK', 'Total alkalinity per unit mass of the water body by potentiometry', 'method', 'mass')],
  pCO2: [vc('PCO2EG01', 'Partial pressure of carbon dioxide {CO2 CAS 124-38-9} {pCO2} in the water body by equilibration with air, drying and infra-red gas analysis', 'method')],
  POC: [vc('CORGCAP1', 'Concentration of organic carbon {organic_C CAS 7440-44-0} {POC} per unit volume of the water body [particulate >GF/F phase] by filtration, acidification and elemental analysis', 'method', 'volume')],
  PON: [vc('NTOTCAP1', 'Concentration of total nitrogen {total_N} {PON} per unit volume of the water body [particulate >GF/F phase] by filtration, acidification and elemental analysis', 'method', 'volume')],
  d15N: [vc('D15NEAM1', 'Enrichment of nitrogen-15 in total nitrogen {15N_in_total_N CAS 14390-96-6} {delta(15)N} in the water body [particulate >GF/F phase] by filtration, acidification, combustion and mass spectrometry', 'method')],
};

/** A P06 unit of a measured variable: its concept, its dimension, and the spellings of the unit in a sheet that mean exactly it. */
export interface VariableUnit {
  term: NercTerm;
  per?: PerDimension;
  /** Already folded the way `foldUnit` writes a unit (lower case, no spaces, mu -> u, per-forms with a slash). */
  aliases: readonly string[];
}
const vu = (term: NercTerm, aliases: string[], per?: PerDimension): VariableUnit => ({ term, aliases, ...(per === undefined ? {} : { per }) });

/*
 * 'ppt' is NOT an alias of parts per thousand (it also means parts per trillion), and a bare 'c' is not degrees Celsius (/check allows both: this converter does not
 * guess). A unit spelled any other way gets no suggestion: the user picks one, or searches NVS, or leaves it without an ID (CONV-UNIT-NO-P06).
 */
export const VARIABLE_UNITS: readonly VariableUnit[] = [
  vu(p06('UPOX', 'Micromoles per litre'), ['umol/l', 'micromol/l', 'umoles/l', 'micromoles/l'], 'volume'),
  vu(p06('KGUM', 'Micromoles per kilogram'), ['umol/kg', 'micromol/kg', 'umoles/kg', 'micromoles/kg'], 'mass'),
  vu(p06('UMGL', 'Milligrams per litre'), ['mg/l'], 'volume'),
  vu(p06('UPNM', 'Nanomoles per litre'), ['nmol/l'], 'volume'),
  vu(p06('MMPL', 'Millimoles per litre'), ['mmol/l'], 'volume'),
  vu(p06('UGPL', 'Micrograms per litre'), ['ug/l'], 'volume'),
  vu(P06.mgPerM3, ['mg/m3'], 'volume'),
  vu(P06.gPerM3, ['g/m3'], 'volume'),
  vu(p06('UPAA', 'Degrees Celsius'), ['°c', 'ºc', '˚c', 'degc', 'degreec', 'degreesc', 'celsius', 'degreecelsius', 'degreescelsius']),
  vu(p06('UUUU', 'Dimensionless'), ['dimensionless', 'unitless']),
  vu(p06('PSUX', 'Practical salinity units'), ['psu']),
  vu(p06('UUPH', 'pH units'), ['phunits', 'phunit']),
  vu(p06('UATM', 'Microatmospheres'), ['uatm', 'microatm', 'microatmosphere', 'microatmospheres']),
  vu(p06('UPPT', 'Parts per thousand'), ['‰', 'permil', 'permille', 'permill', 'partsperthousand']),
  vu(p06('ULAA', 'Metres'), ['m', 'metre', 'metres', 'meter', 'meters']),
];

/** The unit text folded for the alias table: lower case, mu signs as u, no spaces or dots, "l-1" / "kg-1" / "m-3" as "/l" / "/kg" / "/m3", superscripts as digits. */
export function foldUnit(text: string): string {
  return text
    .toLowerCase()
    .replace(/[µμ]/g, 'u')
    .replace(/³/g, '3')
    .replace(/[−–⁻]/g, '-')
    .replace(/[\s.·*_^]/g, '')
    .replace(/(l|kg)-1$/, '/$1')
    .replace(/m-3$/, '/m3');
}

/** The verified P06 concept a unit text names, or undefined. */
export function unitConcept(text: string): VariableUnit | undefined {
  const k = foldUnit(text);
  return k === '' ? undefined : VARIABLE_UNITS.find((u) => u.aliases.includes(k));
}

/** Every concept of this section as `<collection>/<code>`: the list the test pins to the stage 5 section of docs/research/qc-sources.md. */
export const VARIABLE_VERIFIED_CODES: readonly string[] = [
  ...new Set([...Object.values(VARIABLE_CONCEPTS).flat().map((c) => `P01/${c.term.code}`), ...VARIABLE_UNITS.map((u) => `P06/${u.term.code}`)]),
].sort();
