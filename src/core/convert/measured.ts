// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { foldDiacritics } from '../recognize/vocab';

/*
 * What a column's NAME (the header without its unit) says it is, for the one decision of the converter overlay that the shared proposer cannot take: is a numeric
 * column with a name the converter does not know a taxon CANDIDATE (a species of a wide sheet, "Calanus finmarchicus [ind/m3]"), or a measured variable ("PN [µmol/l]",
 * "d15N [‰]") or a descriptor of the sample ("Replicate")? A unit alone does not decide it: a wide biology sheet gives abundance AND biomass units ("[mg C/m3]", "[g/m2]") to species.
 *
 * Decided in this order, on the name part only:
 *   1. a sample descriptor (Replicate, Cast, Bottle, Niskin, ...)                 -> 'descriptor'
 *   2. a known variable token or formula (PN, Ntot, d15N, C/N, GPP, Chl a, ...)    -> 'variable'
 *   3. a taxon shape (a genus-like word, an epithet, sp. / cf., a morphospecies
 *      number, slash-joined genera; case does not matter)                          -> 'taxon'
 *   4. digits, a slash or colon, or a short all-caps acronym (up to 5 letters)     -> 'variable'
 *   5. anything else                                                               -> 'unknown' (the caller keeps what it did before)
 */

export type NameKind = 'descriptor' | 'variable' | 'taxon' | 'unknown';

/** Columns that tell samples of one station apart (and are no measurement and no species). Compared on the folded name: "Replicate no", "Niskin", "Station no". */
const DESCRIPTOR = /^(?:(?:replicate|replikat|rep|cast|bottle|niskin|niskin bottle|run|haul|tow|subsample|core|section|slice|frame)(?: no| nr| num| number| id| n)?|(?:station|sample|stn)(?: no| nr| num| number))$/;

/** Variable tokens and formulas; the whole folded name or its leading word is compared. */
const VARIABLE_TOKENS = new Set([
  'pn', 'pp', 'poc', 'pon', 'pop', 'tn', 'tp', 'toc', 'tic', 'doc', 'dic', 'don', 'dop', 'dip', 'din', 'tdn', 'tdp',
  'ntot', 'ctot', 'ptot', 'stot', 'ctotal', 'ntotal', 'corg', 'norg', 'porg', 'sorg',
  'gpp', 'npp', 'ncp', 'cp',
  'o2', 'no3', 'no2', 'nh4', 'nh3', 'po4', 'sio4', 'sio2', 'h2s', 'co2', 'ch4', 'n2o',
  'chl', 'chla', 'chlorophyll', 'phaeo', 'phaeopigments', 'tss', 'spm', 'tsm', 'cdom', 'par', 'ph', 'eh',
]);

/** A leading word like d13C, d15N, d18O, δ13C, δ15N (an isotope ratio) and the ratios C/N, C:N, N:P, C/P written with letters only. */
const ISOTOPE = /^[δd]\d{1,2}[a-z]{1,2}$/;
const RATIO = /^[a-z]{1,3}[/:][a-z]{1,3}$/;

/** The name part of a header: every trailing bracket group (a unit, a comment) cut off. */
export function namePart(header: string): string {
  let t = header.trim();
  for (;;) {
    const next = t.replace(/\s*[[(][^[\]()]*[\])]\s*$/, '');
    if (next === t) return t;
    t = next;
  }
}

const GENUS = /^[a-z]{3,}$/;
const EPITHET = /^(?:sp|spp|cf|aff|nr|gr|indet|juv|juvenile|adult|larvae|larva|nauplii|copepodite|[a-z]{1,}|\d{1,3}|[a-z]\d{1,2})\.?$/;

/** A genus-like word (3+ letters or an abbreviation "C."), optionally slash-joined with other genera, then words, stage marks and small numbers ("sp. 1", "Morphotype 3", "c2"). */
function hasTaxonShape(folded: string): boolean {
  const tokens = folded.replace(/[()?;]/g, ' ').split(/[\s,]+/).filter((t) => t !== '');
  if (tokens.length === 0) return false;
  const parts = tokens[0].split('/');
  // slash-joined genera need whole words ("Acartia/Centropages"); a single abbreviated genus is one letter and a full stop ("C. finmarchicus")
  const firstOk = parts.length > 1 ? parts.every((w) => GENUS.test(w)) : GENUS.test(tokens[0].replace(/\.$/, '')) || /^[a-z]\.$/.test(tokens[0]);
  if (!firstOk) return false;
  return tokens.slice(1).every((t) => t.split('/').every((w) => EPITHET.test(w))); // ("pusillus/pygmaeus")
}

/** See the module comment. `header` is the whole header; its unit and trailing brackets are cut off here. */
export function nameKind(header: string): NameKind {
  const raw = namePart(header);
  const folded = foldDiacritics(raw).toLowerCase().replace(/\s+/g, ' ').trim();
  // the greek delta is not folded to a letter by every table: δ13C is read as d13C
  const asLetters = folded.replace(/δ/g, 'd');
  const key = asLetters.replace(/[^a-z0-9]+/g, ' ').trim();
  if (key === '') return 'unknown';
  if (DESCRIPTOR.test(key)) return 'descriptor';
  const lead = asLetters.split(/[\s,]+/)[0].replace(/[.;]+$/, '');
  if (VARIABLE_TOKENS.has(key) || VARIABLE_TOKENS.has(lead) || VARIABLE_TOKENS.has(lead.replace(/[^a-z0-9]/g, '')) || ISOTOPE.test(lead.replace(/[^a-z0-9]/g, '')) || RATIO.test(lead)) return 'variable';
  if (hasTaxonShape(asLetters)) return 'taxon';
  if (/[\d/:]/.test(asLetters)) return 'variable';
  const letters = raw.replace(/[^A-Za-z]/g, '');
  if (letters.length > 0 && letters.length <= 5 && letters === letters.toUpperCase() && !/\s/.test(raw.trim())) return 'variable';
  return 'unknown';
}

/**
 * A unit that no sheet of ORGANISMS writes: an amount of substance ("µmol/l", "mmol m-2") or a rate per hour, day or year ("mg/m2/day", "µmol m-2h-1"). A species column may carry a count, a density or a biomass
 * ("ind/m3", "mg C/m3", "g/m2", even a percent cover), never these; a column that has one is a measurement whatever its name looks like ("DNRAw (µmol m-2h-1)"). Organism counts per area and time
 * ("ind/m2/day") are not caught: the caller asks isAbundanceUnit first.
 */
export function isNonOrganismUnit(unit: string | undefined): boolean {
  if (unit === undefined) return false;
  const u = unit.toLowerCase().replace(/µ|μ/g, 'u');
  return /mol/.test(u) || /(?:^|[^a-z])(?:h|hr|d|day|days|yr|year|a)\s*[-−⁻]\s*1(?![0-9])/.test(u) || /\/\s*(?:h|hr|d|day|days|yr|year)\b/.test(u) || /\bper\s+(?:hour|day|year)\b/.test(u);
}
