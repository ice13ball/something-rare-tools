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
 * The pressure of a profile file (stage 6). Both concepts were opened on 2026-10-25 as
 * the JSON-LD profile of the concept page, as for every code of this file (docs/research/qc-sources.md, "Converter (/convert) - stage 6 verification"): HTTP 200, no redirect,
 * owl:deprecated "false". PRESPR01 is a P01 concept for a pressure read by a profiling pressure sensor and corrected to zero at
 * sea level; UPDB is the P06 unit "Decibars". A pressure column is written with PRESPR01 and, only when its unit is decibars, UPDB. A pressure is never turned into a depth.
 */
export const PRESSURE = {
  type: p01('PRESPR01', 'Pressure (spatial coordinate) exerted by the water body by profiling pressure sensor and correction to read zero at sea level'),
  unit: p06('UPDB', 'Decibars'),
} as const;

/** The pressure concepts as `<collection>/<code>`: the list the test pins to the stage 6 section of docs/research/qc-sources.md. */
export const PRESSURE_VERIFIED_CODES: readonly string[] = [PRESSURE.type, PRESSURE.unit].map((t) => `${t.uri.split('/')[4]}/${t.code}`).sort();

/** True when the unit text of a pressure column says decibars (dbar, db, decibar, decibars; any case, spaces ignored): only then the unit gets its identifier. */
export const isDecibar = (unit: string | undefined): boolean => unit !== undefined && /^(dbar|db|decibars?)$/.test(unit.toLowerCase().replace(/[\s.]/g, ''));

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
  // opened 2026-10-26 (docs/research/qc-sources.md, "Converter (/convert) - stage 7"): all three NAME A METHOD (a CTD, a computation), so they are offered, never proposed
  conductivity: [vc('CNDCST01', 'Electrical conductivity of the water body by CTD', 'method')],
  'potential temperature': [vc('POTMCV01', 'Potential temperature of the water body by computation using UNESCO 1983 algorithm', 'method')],
  'sigma-theta': [vc('SIGTEQ01', 'Sigma-theta of the water body by computation from salinity and potential temperature using UNESCO algorithm', 'method')],
  // opened 2026-10-26 (docs/research/qc-sources.md, "Converter (/convert) - environmental data fixes"). Oxygen as a PERCENTAGE is saturation, a variable of its own: the concentration
  // concepts above are never offered for it (the unit would contradict them).
  'oxygen saturation': [vc('OXYSZZ01', 'Saturation of oxygen {O2 CAS 7782-44-7} in the water body [dissolved plus reactive particulate phase]', 'generic')],
  // seawater density in kg m-3: both concepts name a computation, so they are offered, never proposed; sigma-theta (SIGTEQ01) is a density ANOMALY and is offered only as such
  density: [
    vc('INDENS01', 'Density of the water body by computation from absolute salinity and conservative temperature using UNESCO 2010 algorithm', 'method'),
    vc('SIGTEQ01', 'Sigma-theta of the water body by computation from salinity and potential temperature using UNESCO algorithm', 'method'),
  ],
  // dissolved organic carbon and the major ions: each of these concepts names its MATRIX (the water body, or the sediment pore water) and a phase, and a sheet of pore water is not a sheet of
  // the water body, so they are only OFFERED, never proposed: the user picks the one that matches the sample. No generic concept for dissolved inorganic nitrogen (DIN) exists in P01 (searched 2026-10-26).
  DOC: [
    vc('DOCGZZ01', 'Concentration of organic carbon {organic_C CAS 7440-44-0} {DOC} per unit volume of the water body [dissolved plus reactive particulate specified elsewhere phase]', 'method', 'volume'),
    vc('CORGZZKG', 'Concentration of organic carbon {organic_C CAS 7440-44-0} {DOC} per unit mass of the water body [dissolved plus reactive particulate phase]', 'method', 'mass'),
  ],
  chloride: [vc('CLXXWBUP', 'Concentration of chloride {Cl- CAS 16887-00-6} per unit volume of the water body [dissolved plus reactive particulate phase]', 'method', 'volume')],
  sodium: [vc('RWS00021', 'Concentration of sodium {Na CAS 7440-23-5} per unit volume of the water body [dissolved plus reactive particulate phase]', 'method', 'volume')],
  potassium: [vc('RWS00022', 'Concentration of potassium {K CAS 7440-09-7} per unit volume of the water body [dissolved plus reactive particulate phase]', 'method', 'volume')],
  calcium: [
    vc('RWS00023', 'Concentration of calcium {Ca CAS 7440-70-2} per unit volume of the water body [dissolved plus reactive particulate phase]', 'method', 'volume'),
    vc('NEWCXX09', 'Concentration of calcium {Ca CAS 7440-70-2} per unit mass of the sediment pore water [dissolved plus reactive particulate <0.4/0.45um phase]', 'method', 'mass'),
  ],
  magnesium: [
    vc('RWS00024', 'Concentration of magnesium {Mg CAS 7439-95-4} per unit volume of the water body [dissolved plus reactive particulate phase]', 'method', 'volume'),
    vc('NEWCXX08', 'Concentration of magnesium {Mg CAS 7439-95-4} per unit mass of the sediment pore water [dissolved plus reactive particulate <0.4/0.45um phase]', 'method', 'mass'),
  ],
  sulphate: [
    vc('S04DISP1', 'Concentration of sulfate {SO4(2-) sulphate CAS 14808-79-8} per unit volume of the water body [dissolved plus reactive particulate phase]', 'method', 'volume'),
    vc('SPHTMAXX', 'Concentration of sulfate {SO4(2-) sulphate CAS 14808-79-8} per unit volume of the sediment pore water [dissolved plus reactive particulate phase]', 'method', 'volume'),
  ],
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
 * The text these aliases are matched against is the unit of the column's unit field in the mapping table (role.unit), NOT the text of the header: /check's recogniser
 * (src/core/recognize/vocab.ts UNIT_VOCAB, untouched) has already turned a header unit it knows into its own spelling, for example 'degC' or a bare 'c' into '°C' and 'ppt'
 * into '‰', and the user can edit the field. So this table does not guess either: it maps the spellings below, and a unit spelled any other way (and the text 'ppt' or 'c'
 * itself, were it ever typed into the field) gets no suggestion: the user picks one, searches NVS, or leaves it without an ID (CONV-UNIT-NO-P06). A unit that arrives
 * as '‰' is therefore offered the parts-per-thousand concept, which the user sees next to the unit it was read from and confirms or not.
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
  // opened 2026-10-26: UPCT (Percent). The unit of a saturation and of a percentage of a total.
  vu(p06('UPCT', 'Percent'), ['%', 'percent', 'percentage', 'pct']),
  vu(p06('PSUX', 'Practical salinity units'), ['psu']),
  vu(p06('UUPH', 'pH units'), ['phunits', 'phunit']),
  vu(p06('UATM', 'Microatmospheres'), ['uatm', 'microatm', 'microatmosphere', 'microatmospheres']),
  vu(p06('UPPT', 'Parts per thousand'), ['‰', 'permil', 'permille', 'permill', 'partsperthousand']),
  vu(p06('ULAA', 'Metres'), ['m', 'metre', 'metres', 'meter', 'meters']),
  // opened 2026-10-26: MSCM (MilliSiemens per centimetre) and UKMC (Kilograms per cubic metre); 'kg/m**3' folds to 'kg/m3' (the stars and the dots go)
  vu(p06('MSCM', 'MilliSiemens per centimetre'), ['ms/cm', 'millisiemens/cm']),
  vu(p06('UKMC', 'Kilograms per cubic metre'), ['kg/m3']),
];

/** The unit text folded for the alias table: lower case, mu signs as u, no spaces or dots, "l-1" / "kg-1" / "m-3" as "/l" / "/kg" / "/m3", superscripts as digits. */
export function foldUnit(text: string): string {
  return text
    .toLowerCase()
    .replace(/[µμ]/g, 'u')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => String('⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)))
    .replace(/[−–⁻]/g, '-')
    .replace(/[\s.·*_^]/g, '')
    .replace(/(l|kg)-1$/, '/$1')
    .replace(/m-3$/, '/m3');
}

/**
 * The dimension a unit text states: "per unit volume" (/L, /mL, /m3, /dm3, /cm3) or "per unit mass" (/kg, /g, /mg), or undefined (a unit with neither, or one
 * spelled another way). The verified aliases say it themselves; any other unit is read from its denominator. Used for the oxygen choice, for a unit with no alias
 * that is plainly per mass, and for CONV-NERC-UNIT-MISMATCH.
 */
export function unitDimension(text: string): PerDimension | undefined {
  // a trailing dry / wet weight marker ("µg/g DW") says what the mass is, not the dimension
  const k = foldUnit(text.replace(/[\s_-]*(?:dw|ww)\.?\s*$/i, ''));
  if (k === '') return undefined;
  const alias = VARIABLE_UNITS.find((u) => u.aliases.includes(k))?.per;
  if (alias !== undefined) return alias;
  const d = k.replace(/([a-z0-9])(g|ml|dm3|cm3)-1$/, '$1/$2');
  if (/\/(?:[kmun]?g)$/.test(d)) return 'mass';
  if (/\/(?:[dcm]?l|m3|dm3|cm3)$/.test(d)) return 'volume';
  return undefined;
}

/**
 * The dimension a concept LABEL states: "per unit mass", "per unit dry weight", "per unit wet weight" (mass) or "per unit volume"; undefined when the label states
 * neither (a temperature, a "per unit area" concept). Read from the label of a verified concept and of a result of the user's NVS search alike.
 */
export function labelDimension(label: string): PerDimension | undefined {
  if (/\bper unit (?:mass|dry weight|wet weight)\b/i.test(label)) return 'mass';
  if (/\bper unit volume\b/i.test(label)) return 'volume';
  return undefined;
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

/* ---------- header names of the measured variables, in the languages of the tool ---------- */

/*
 * CONVERTER ONLY. /check's recogniser (src/core/recognize/vocab.ts, pinned byte for byte, trap T11) knows the English names of a measured variable; a Polish, German or French
 * header ("Zasolenie [PSU]", "Salzgehalt", "oxygène dissous") reaches the converter as a variable of its own name, which the table above does not know, so no concept was
 * proposed. This table maps WHOLE header names (diacritics folded, case folded, a bracketed unit removed) to the variable of VARIABLE_CONCEPTS; nothing else. Never a
 * substring: "temperatura powietrza", "Lufttemperatur" and "température de l'air" (air), "temperatura próbki" and "temperatura inkubacji" (a laboratory temperature) and "nasycenie
 * tlenem" (saturation) are not here and so get nothing. A name that maps to a variable gets exactly what the variable gets: generic concepts are proposed, method-specific ones only
 * offered (chlorophyll, DIC and alkalinity stay "offered"), oxygen is chosen by the unit's dimension, nothing is pre-selected.
 */
const VARIABLE_NAMES: Readonly<Record<string, { en?: readonly string[]; pl?: readonly string[]; de?: readonly string[]; fr?: readonly string[] }>> = {
  temperature: { pl: ['temperatura', 'temperatura wody', 'temp. wody'], de: ['Temperatur', 'Wassertemperatur'], fr: ['température', "température de l'eau"] },
  salinity: { pl: ['zasolenie'], de: ['Salzgehalt', 'Salinität'], fr: ['salinité'] },
  oxygen: { pl: ['tlen', 'tlen rozpuszczony'], de: ['Sauerstoff', 'gelöster Sauerstoff'], fr: ['oxygène', 'oxygène dissous'] },
  chlorophyll: { pl: ['chlorofil a', 'chlorofil-a', 'chlorofil'], de: ['Chlorophyll a', 'Chlorophyll-a'], fr: ['chlorophylle a', 'chlorophylle-a'] },
  nitrate: { pl: ['azotany', 'azotan', 'NO3'], de: ['Nitrat'], fr: ['nitrate', 'nitrates'] },
  nitrite: { pl: ['azotyny', 'azotyn', 'NO2'], de: ['Nitrit'], fr: ['nitrite', 'nitrites'] },
  'nitrate+nitrite': { pl: ['azotany+azotyny', 'azotany i azotyny', 'suma azotanów i azotynów'] },
  ammonium: { pl: ['amoniak', 'jon amonowy', 'amon', 'NH4'], de: ['Ammonium'], fr: ['ammonium'] },
  phosphate: { pl: ['fosforany', 'fosforan', 'PO4'], de: ['Phosphat'], fr: ['phosphate', 'phosphates'] },
  silicate: { pl: ['krzemiany', 'krzemian', 'krzemionka', 'SiO4'], de: ['Silikat'], fr: ['silicate', 'silicates'] },
  pH: { pl: ['pH'] },
  TA: { pl: ['alkaliczność', 'alkaliczność całkowita'], de: ['Alkalinität'], fr: ['alcalinité', 'alcalinité totale'] },
  // the three variables the converter adds to /check's canonical ones (CONVERTER_VARIABLES): English names too, because /check's recogniser does not know them
  conductivity: { en: ['conductivity', 'cond', 'electrical conductivity'], pl: ['przewodnictwo', 'przewodność elektryczna'], de: ['Leitfähigkeit', 'elektrische Leitfähigkeit'], fr: ['conductivité', 'conductivité électrique'] },
  'potential temperature': { en: ['potential temperature', 'tpot', 'temperature potential', 'temperature, water, potential', 'temperature water potential', 'pot. temperature'], pl: ['temperatura potencjalna'], de: ['potentielle Temperatur'], fr: ['température potentielle'] },
  'sigma-theta': { en: ['sigma-theta', 'sigma theta', 'sigmatheta', 'density, sigma-theta', 'density, sigma-theta (0)'], pl: ['sigma-theta'], de: ['Sigma-Theta'], fr: ['sigma-thêta'] },
  'oxygen saturation': { en: ['oxygen saturation', 'o2 saturation', 'dissolved oxygen saturation', 'oxygen saturation percent'], pl: ['nasycenie tlenem', 'nasycenie tlenu', 'nasycenie wody tlenem'], de: ['Sauerstoffsättigung'], fr: ["saturation en oxygène", "saturation de l'oxygène"] },
  density: { en: ['seawater density', 'sea water density', 'water density', 'in situ density', 'density of seawater'], pl: ['gęstość wody', 'gęstość wody morskiej'], de: ['Wasserdichte', 'Meerwasserdichte'], fr: ["masse volumique de l'eau"] },
  DIC: { pl: ['węgiel nieorganiczny rozpuszczony', 'DIC'], de: ['gelöster anorganischer Kohlenstoff'], fr: ['carbone inorganique dissous'] },
};

const FOLD_SPECIAL: Record<string, string> = { ł: 'l', ß: 'ss', ø: 'o', æ: 'ae', œ: 'oe', đ: 'd' };

/** The folded key of a header name: diacritics folded (ł and ß included), lower case, anything but letters and digits as one space. The same fold as /check's headerKey. */
const nameKey = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[łŁßøØæÆœŒđĐ]/g, (c) => FOLD_SPECIAL[c.toLowerCase()] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** The variables of VARIABLE_CONCEPTS that /check's recogniser has no name for: the converter's column overlay reads them from the header (core/convert/recognize.ts variableClaim). */
export const CONVERTER_VARIABLES: ReadonlySet<string> = new Set(['conductivity', 'potential temperature', 'sigma-theta', 'oxygen saturation']);

/** Folded header name -> variable of VARIABLE_CONCEPTS. */
export const VARIABLE_SYNONYMS: ReadonlyMap<string, string> = new Map(
  Object.entries(VARIABLE_NAMES).flatMap(([variable, byLang]) => Object.values(byLang).flatMap((names) => names.map((n): [string, string] => [nameKey(n), variable]))),
);

/** A header name without its bracketed unit ("Zasolenie [PSU]" -> "Zasolenie"), and without a trailing parenthesis that is a unit ("tlen (µmol/kg)"). */
function stripUnit(name: string): string {
  const t = name.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  const m = /^(.*\S)\s*\(([^()]*)\)$/.exec(t);
  return m !== null && (unitConcept(m[2]) !== undefined || unitDimension(m[2]) !== undefined) ? m[1].trim() : t;
}

/**
 * The variable of VARIABLE_CONCEPTS a column's variable name stands for: the name itself when it is one of its keys (what /check's recogniser produces), else the variable of
 * the synonym table for the whole name; undefined when the name is neither.
 */
export function conceptVariable(name: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(VARIABLE_CONCEPTS, name)) return name;
  return VARIABLE_SYNONYMS.get(nameKey(stripUnit(name)));
}

/** True for a count or abundance unit (ind/m3, ind. m-3, #/m3, n/L, cells/L): the column counts organisms, whatever its name says. */
export function isAbundanceUnit(text: string | undefined): boolean {
  if (text === undefined) return false;
  const k = text.toLowerCase().replace(/[\s.·*_^]/g, '');
  return /^(?:ind|indiv|individuals|org|organisms|cells?|osobniki|os)(?:\/|per|[a-z]{0,3}[-−⁻]?[0-9⁰¹²³⁴⁵⁶⁷⁸⁹]|$)/.test(k) || /^(?:#|n|no)(?:\/|per)/.test(k);
}
