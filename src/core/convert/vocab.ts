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
export const nercUri = (collection: 'P01' | 'P06', code: string): string => `http://vocab.nerc.ac.uk/collection/${collection}/current/${code}/`;

export interface NercTerm {
  code: string;
  uri: string;
  /** The preferred label of the concept (the measurementType text written next to the id). */
  label: string;
}
const p01 = (code: string, label: string): NercTerm => ({ code, uri: nercUri('P01', code), label });
const p06 = (code: string, label: string): NercTerm => ({ code, uri: nercUri('P06', code), label });

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
} as const;

/** Every concept above as `<collection>/<code>`, for the test that pins this list to the spike. */
export const VERIFIED_CODES: readonly string[] = [...Object.values(P01), ...Object.values(P06)].map((t) => `${t.uri.split('/')[4]}/${t.code}`).sort();
