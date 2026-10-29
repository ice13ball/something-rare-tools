// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { stripTypeSuffix } from '../recognize/columns';
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

/**
 * Plain English measurement words of a CTD or bottle file. Unlike the abbreviation tokens above they are checked AFTER the counting-unit test: a column of such a word that counts
 * organisms ("Nitrogen fixers [cells/l]", "Light [ind]") may still be a species, and only a column without a counting unit is a variable.
 */
const MEASUREMENT_WORDS = new Set([
  // physical and optical sensor quantities of a CTD or bottle file: plain English words that the genus shape below would otherwise take for a taxon candidate (the repo holds no genus list to
  // check against; none of these is a genus name to the author's knowledge: they are ordinary English measurement words, not Latin names)
  'activity', 'fluorescence', 'turbidity', 'irradiance', 'transmission', 'transmittance', 'attenuation', 'beam', 'backscatter', 'backscattering', 'absorbance', 'absorption', 'radiance',
  'extinction', 'conductivity', 'conductance', 'salinity', 'temperature', 'oxygen', 'density', 'pressure', 'alkalinity', 'nitrate', 'nitrite', 'phosphate', 'silicate', 'ammonium', 'nitrogen',
  'phosphorus', 'sulphate', 'sulfate', 'secchi', 'sigma', 'visibility', 'light', 'nutrients', 'pigments',
]);

/** A leading word like d13C, d15N, d18O, δ13C, δ15N (an isotope ratio) and the ratios C/N, C:N, N:P, C/P written with letters only. */
const ISOTOPE = /^[δd]\d{1,2}[a-z]{1,2}$/;
const RATIO = /^[a-z]{1,3}[/:][a-z]{1,3}$/;

/** The name part of a header: the ODV / OPeNDAP type suffix (and the quotes around it) and every trailing bracket group (a unit, a comment) cut off. */
export function namePart(header: string): string {
  let t = stripTypeSuffix(header);
  for (;;) {
    const next = t.replace(/\s*[[(][^[\]()]*[\])]\s*$/, '');
    if (next === t) return t;
    t = next;
  }
}

/** One genus-like word: 3+ characters, letters with an internal "-", "_" or "." ("Pseudo-nitzschia", "Macoma_balthica"), a trailing full stop allowed. */
const GENUS_WORD = /^[a-z][a-z._-]+[a-z.]$/;

/**
 * A genus-shaped FIRST word decides the taxon shape: a word of 3+ letters (case does not matter), several of them joined by a slash ("Acartia/Centropages"), or an abbreviated genus
 * ("C. finmarchicus"). Whatever follows is not looked at: an epithet, sp. / spp. / cf. / indet. / juv., a stage code (C1-C3, CIV-CVI), a size or range class (0-1 cm, >5mm, <200 µm),
 * a morphospecies number. A false candidate costs the user one tick; a false variable loses occurrences, so the rule leans to the taxon.
 */
function hasTaxonShape(folded: string): boolean {
  const first = folded.replace(/[()?;]/g, ' ').split(/[\s,]+/).find((t) => t !== '');
  if (first === undefined) return false;
  const parts = first.split('/');
  if (parts.length > 1) return parts.every((w) => GENUS_WORD.test(w));
  return GENUS_WORD.test(first) || /^[a-z]\.$/.test(first);
}

/**
 * See the module comment. `header` is the whole header; its unit and trailing brackets are cut off here. `abundance` is true when the unit counts organisms (isAbundanceUnit): such a
 * column may always be a species, whatever its name looks like (after a descriptor or a known variable token, which are decided first).
 */
export function nameKind(header: string, abundance = false): NameKind {
  const raw = namePart(header);
  const folded = foldDiacritics(raw).toLowerCase().replace(/\s+/g, ' ').trim();
  // the greek delta is not folded to a letter by every table: δ13C is read as d13C
  const asLetters = folded.replace(/δ/g, 'd');
  const key = asLetters.replace(/[^a-z0-9]+/g, ' ').trim();
  if (key === '') return 'unknown';
  if (DESCRIPTOR.test(key)) return 'descriptor';
  const lead = asLetters.split(/[\s,]+/)[0].replace(/[.;]+$/, '');
  if (VARIABLE_TOKENS.has(key) || VARIABLE_TOKENS.has(lead) || VARIABLE_TOKENS.has(lead.replace(/[^a-z0-9]/g, '')) || ISOTOPE.test(lead.replace(/[^a-z0-9]/g, '')) || RATIO.test(lead)) return 'variable';
  if (abundance) return 'taxon';
  if (MEASUREMENT_WORDS.has(key) || MEASUREMENT_WORDS.has(lead) || MEASUREMENT_WORDS.has(lead.replace(/[^a-z0-9]/g, ''))) return 'variable';
  if (hasTaxonShape(asLetters)) return 'taxon';
  if (/[\d/:]/.test(asLetters)) return 'variable';
  const letters = raw.replace(/[^A-Za-z]/g, '');
  if (letters.length > 0 && letters.length <= 5 && letters === letters.toUpperCase() && !/\s/.test(raw.trim())) return 'variable';
  return 'unknown';
}
