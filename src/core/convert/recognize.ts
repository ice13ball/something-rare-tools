// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { depthUnitOfHeader } from '../recognize/depthUnit';
import { biomassNameUnit, distinctnessWithinSamples, isTaxonAttribute, isMassUnitText, isOrganismSizeHeader, isSamplingOrEnvironmentHeader, isSizeLikeHeader, SAMPLE_KEY_KINDS, valuesRepeatWithinSample } from './totalColumns';
import { dwcTermOf, isBlankCell, looksLikeDwcTerm, nameWithComment, proposeColumns, stripTypeSuffix, toMapping, unitFromHeader } from '../recognize/columns';
import type { ProposeContext } from '../recognize/columns';
import { foldDiacritics, headerKey, isCanonicalKey } from '../recognize/vocab';
import { CONVERTER_VARIABLES, conceptVariable, foldUnit, isAbundanceUnit, isDecibar } from './vocab';
import { isPercentUnit, verifiedConcept } from './nerc';
import { hasCentralStatisticToken } from '../summaryLabels';
import { isMeasurementWord, nameKind } from './measured';
import { holdsDigitDates, holdsOneFractionalValue, holdsYearOfDate, holdsRunningNumbers, holdsYears, isGeometryUnit, isPlainCountUnit, latinNameShare } from './columnValues';
import { isDepthBoundKey } from '../recognize/geocodes';
import { SEDIMENT_CONTEXT, isPlainDepthName, isSeafloorName, isSiteDepthName, seafloorUnitFromHeader, seafloorUnitOf } from './seafloor';
import type { ColumnProposal, ColumnRole, RawSheet, SheetMapping } from '../types';
import { parseNumber } from '../values/numbers';

/*
 * The converter's column recognition: an OVERLAY on the shared proposeColumns, so coordinates, dates, depth, station, cruise and sample names
 * (Polish, German and French included) come from recognize/columns.ts and are not repeated here. The overlay adds only what /check does not
 * know, the converter-only roles (types.ts ConverterRole):
 *
 *   Darwin Core terms   occurrenceID -> occurrenceId, eventID -> sampleId, scientificName -> taxon, individualCount / organismQuantity ->
 *                       quantity, organismQuantityType -> quantityType, minimum/maximumDepthInMeters -> depth bounds, lifeStage, identificationQualifier
 *   the converter's own names (PL / EN / DE / FR)   taxon, quantity, effort and depth-bound names
 *   wide sheets         a numeric column the shared proposer calls a variable but that is not a canonical measured variable becomes a
 *                       LOW-confidence `taxon` with header:true (its HEADER is the taxon): a candidate, to be confirmed in bulk.
 *                       Canonical variables (temperature, salinity, ...) stay variables; they become eMoF later.
 *   sum / total columns a column whose header reads as a total (Suma, Total, Razem, Summe, Gesamt, Somme, Sum, Σ, the rule isSummaryHeader) that the
 *                       shared proposer took for a measured variable starts as IGNORED (reason `summary-total`): converting it would count the same
 *                       individuals twice. It never reaches the archive unless the user chooses a meaning for it.
 *
 * ⚠️ /check never calls this module and never proposes these roles; recognize/columns.ts is untouched (test/convert/check-unchanged.test.ts).
 */

export type ConvertShape = 'wide' | 'long';

export const TAXON_NAME = /^(species|taxon|taxa|gatunek|takson|art|espece)( name| nom| name)?$/;
// the unambiguous quantity words may carry a tail ("abundance ind"); the short ones only stand alone
export const QUANTITY_STANDALONE = /^(count|counts|anzahl|nombre|comptage)$/;
// whole-header phrases of two or more words (an optional unit in brackets is cut off before the match): "Liczba osobników", "Liczba os.", "Anzahl Individuen",
// "Nombre d'individus" are counts, "Individuendichte" a density. "Liczba prób", "Anzahl Proben", "Nombre d'échantillons", "Liczba gatunków", "Anzahl Arten" count
// something else (samples, species) and match nothing here.
export const QUANTITY_PHRASE_COUNT = /^(liczba osobnikow|liczba os|anzahl individuen|nombre d individus)$/;
export const QUANTITY_PHRASE_DENSITY = /^(individuendichte)$/;
export const QUANTITY_WORD = /^(abundance|abundanz|abondance|density|densite|dichte|zageszczenie|liczebnosc|biomass|biomasa|biomasse)( .*)?$/;
// (the plankton data bases abbreviate the same two words: 'Vol filt', 'Samp vol', 'volfilt'; any other abbreviation is decided by the unit of the column, see isGeometryUnit)
export const EFFORT_VOLUME = /^(volume filtered|filtered volume|vol filtered|vol filt|volfilt|volume sampled|sampled volume|sample volume|sampling volume|samp vol|volume|objetosc|objetosc przefiltrowana|volumen|volumen filtriert|volume filtre|volume echantillonne)$/;
export const EFFORT_AREA = /^(area|area sampled|sampled area|swept area|area swept|powierzchnia|flache|surface|surface echantillonnee)$/;
// a plain "Area" is a place name on a sheet with no taxa; only a header that says sampled or swept is an effort there
export const PLAIN_AREA = /^(area|powierzchnia|flache|surface)$/;
// the words that mean the water, not an abundance, when a "density" header names them; and the units of a seawater density (mass per volume)
const SEAWATER_DENSITY_NAME = /^(density|seawater density|sea water density|water density|in situ density|density of seawater|gestosc wody|gestosc wody morskiej|dichte|wasserdichte|meerwasserdichte|masse volumique|masse volumique de l eau)$/;
const SEAWATER_DENSITY_ONLY = /^(seawater density|sea water density|water density|in situ density|density of seawater|gestosc wody|gestosc wody morskiej|wasserdichte|meerwasserdichte|masse volumique de l eau)$/;
const isSeawaterDensityUnit = (unit: string | undefined): boolean => unit !== undefined && /^(kg\/m3|g\/cm3|g\/ml|kg\/l)$/.test(foldUnit(unit));

// a summary column is never proposed as a species: its header (after the key folding: case, diacritics, punctuation) STARTS with one of these words,
// or holds total / suma / razem / gesamt as a separate word ("Total copepods", "Abundance, total", "Razem Copepoda"). "Totalia sp." is a genus and stays.
const SUMMARY_FIRST = new Set(['total', 'suma', 'razem', 'summe', 'gesamt', 'somme', 'sum']);
const SUMMARY_ANYWHERE = new Set(['total', 'suma', 'razem', 'gesamt']);
/** The name of a header for the total/sum test: its name and, in PANGAEA's 'name [unit] (comment)', the comment too ('Zoopl [#/m**3] (total)' is a total whatever the unit reader cuts off). */
function summaryText(header: string): string {
  const m = /^(.*\S)\s*\[[^[\]]+\]\s*(\(.*\))$/.exec(stripTypeSuffix(header));
  const name = unitFromHeader(header).name.trim();
  return m === null ? name : `${name} ${m[2]}`;
}
function isSummaryHeader(rawName: string): boolean {
  const name = rawName.trim();
  if (/^[σΣ]/.test(name)) return true;
  const words = headerKey(name).split(' ').filter((w) => w !== '');
  return words.length > 0 && (SUMMARY_FIRST.has(words[0]) || words.some((w) => SUMMARY_ANYWHERE.has(w)));
}
// the sample code of a row: PANGAEA's "Sample label (Multinet number)" and "Sample code/label" (the bracket text after the name is cut off before the match)
// (German whole headers: "Nr. der Probe", "Probennummer", "Proben-Nr.", "Probe Nr.", "Proben-ID"; /check's columns.ts is not changed for them)
export const SAMPLE_CODE_NAME = /^(sample label|sample code|sample code label|sample name|sample id|sample number|nr der probe|probennummer|proben nr|probe nr|proben id|sampleid|samplecode|samplename|samplenumber|sampleno)$/;
// "Stage" and its translations: the life stage of the record (a long sheet)
export const STAGE_NAME = /^(stage|life stage|lifestage|stadium|stadium rozwojowe|entwicklungsstadium|stade|stade de developpement)$/;

const DEPTH_WORDS = /^(depth|tiefe|profondeur|glebokosc)(?: (.*))?$/;
const BOUND_MIN = new Set(['top', 'min', 'minimum', 'from', 'von', 'od', 'de', 'upper', 'start', 'ab']);
// 'a' is the French "à" after foldDiacritics
const BOUND_MAX = new Set(['bottom', 'bot', 'max', 'maximum', 'to', 'bis', 'do', 'a', 'lower', 'end']);

/** 'min' / 'max' when the tail of a depth name ("top/min", "bottom/max", "od", "von", "à") says which end of a range it is. */
function depthBoundOfName(key: string): 'min' | 'max' | undefined {
  const m = DEPTH_WORDS.exec(key);
  if (!m || m[2] === undefined) return undefined;
  const tokens = m[2].split(' ').filter((t) => t !== '');
  const mins = tokens.filter((t) => BOUND_MIN.has(t)).length;
  const maxs = tokens.filter((t) => BOUND_MAX.has(t)).length;
  if (mins > 0 && maxs === 0) return 'min';
  if (maxs > 0 && mins === 0) return 'max';
  return undefined;
}

/** A header that holds one of the three spellings of the WoRMS Aphia ID, whole, as it stands or in a bracket ("AphiaID", "aphia_id", "Reg spec no (WoRMS Aphia ID)"); the cells must also be whole numbers (holdsAphiaIds). Other spellings and cases are not read as one. */
const APHIA_HEADER = /(?:^|[\s([])(?:AphiaID|aphia_id|Aphia ID)(?=$|[\s)\]])/;

/** Every filled cell of the column is a positive whole number, and there is at least one. */
function holdsAphiaIds(sheet: RawSheet, index: number): boolean {
  let n = 0;
  for (const row of sheet.rows) {
    const c = row.cells[index] ?? null;
    if (c === null || String(c).trim() === '') continue;
    if (!/^[1-9]\d*$/.test(String(c).trim())) return false;
    n++;
  }
  return n > 0;
}

// "present" marks in a species column of a wide sheet: + x *
const PRESENCE_MARK = /^(\+|x|\*|✓|✔|☑|✅)$/i;

/** The sampled cells of a column are only numbers and presence marks, with at least one mark: a species column the shared proposer took for text. */
function holdsPresenceMarks(sheet: RawSheet, index: number, decimalComma: boolean): boolean {
  let marks = 0;
  for (const row of sheet.rows.slice(0, 200)) {
    const c = row.cells[index] ?? null;
    if (c === null || String(c).trim() === '') continue;
    if (typeof c === 'string' && PRESENCE_MARK.test(c.trim())) {
      marks++;
      continue;
    }
    // NA and its variants are "no record", as everywhere: they do not rule the column out
    const st = parseNumber(c, decimalComma).status;
    if (st !== 'ok' && st !== 'missing' && st !== 'na-variant') return false;
  }
  return marks > 0;
}

/**
 * A quality flag or quality column (never a measurement). Two tiers:
 *   always   ODV's `QV:ODV:...`; the prefixes `Q_`, `QC_`, `QF_` (an UNDERSCORE right after the letters, as written); the suffixes `_QC`, `_QF`, `_flag(s)`, `_quality`; "quality flag" anywhere
 *   loose    `Q`, `QC` or `QF` + a space or hyphen + X, and X + a space or hyphen + `quality`, `QC`, `QF` or `flag`: a quality column ONLY when X names another column of the same sheet
 *            (compared by the folded header without its unit): "Q TEMP" next to "TEMP", "O2 quality" next to "O2 [umol/l]". Without that sibling it is a name: "Q river" (a discharge),
 *            "Water quality" and "Q. seminula" (an abbreviated genus on a biology sheet) are not flags.
 * `all` are the headers of the sheet (the loose tier needs them; without them only the first tier applies).
 */
export function isQualityHeader(header: string, all: readonly string[] = []): boolean {
  if (/qv:odv/i.test(header) || /\bquality[ _-]?flags?\b/i.test(header)) return true;
  const name = unitFromHeader(header).name.trim();
  if (/^q[cf]?_./i.test(name) || /_(qc|qf|flags?|quality)$/i.test(name)) return true;
  // the loose tier: ONLY a space or a hyphen joins the two parts, as written ("Q. seminula" is not "Q" + "seminula")
  const siblings = new Set(all.filter((h) => h !== header).map((h) => headerKey(unitFromHeader(h).name)));
  const pre = /^(?:q|qc|qf)[ -]+(.+)$/i.exec(name);
  if (pre && siblings.has(headerKey(pre[1]))) return true;
  const suf = /^(.+?)[ -]+(?:quality|qc|qf|flags?)$/i.exec(name);
  return suf !== null && siblings.has(headerKey(suf[1]));
}

/**
 * The NEGATIVE numbers are the majority of the filled non-zero numbers: the column counts upwards from the seafloor (a depth below it is written as a negative number, a position above it as a
 * positive one). A few negative numbers among many positive ones are the water above the sediment of a column that counts downwards, so they do not turn the direction round. Only a proposal,
 * shown with its reason; the user can change it, and a column with both signs is told how many cells have the minority sign (CONV-SEAFLOOR-SIGNS).
 */
function countsUpwards(sheet: RawSheet, index: number, decimalComma: boolean): boolean {
  let negative = 0;
  let positive = 0;
  for (const row of sheet.rows) {
    const p = parseNumber(row.cells[index] ?? null, decimalComma);
    if (p.status !== 'ok') continue;
    if (p.value < 0) negative++;
    else if (p.value > 0) positive++;
  }
  return negative > positive;
}

/** The sheet says it is about pore water, sediment or a core: its name, a header or a text cell says so (the first 200 rows). */
function sedimentContext(sheet: RawSheet): boolean {
  if (SEDIMENT_CONTEXT.test(sheet.name) || sheet.header.some((h) => SEDIMENT_CONTEXT.test(h))) return true;
  for (let i = 0; i < sheet.header.length; i++) {
    for (const row of sheet.rows.slice(0, 200)) {
      const c = row.cells[i] ?? null;
      if (typeof c === 'string' && /^\s*(pore ?water|porewater|sediment)/i.test(c)) return true;
    }
  }
  return false;
}

/** Every reason the overlay gives, by code: the English text is the technical wording, the page shows the text of `convert.reason.<code>` in the reader's language. */
export const OVERLAY_REASONS = {
  'dwc-occurrenceid': 'Darwin Core occurrenceID (used as given)',
  'dwc-eventid': 'Darwin Core eventID is the sample code',
  'dwc-scientificname': 'Darwin Core scientificName',
  'dwc-individualcount': 'Darwin Core individualCount (a count)',
  'dwc-organismquantity': 'Darwin Core organismQuantity',
  'dwc-organismquantitytype': 'Darwin Core organismQuantityType',
  'dwc-lifestage': 'Darwin Core lifeStage',
  'dwc-identificationqualifier': 'Darwin Core identificationQualifier',
  'dwc-scientificnameid': 'Darwin Core scientificNameID (written as given)',
  'name-aphiaid': 'a WoRMS AphiaID column of whole numbers: written as the urn:lsid of the taxon',
  'name-stage': 'name says life stage',
  'name-taxon': 'name says taxon or species',
  'name-count': 'name says count',
  'name-abundance': 'name says abundance, density or biomass',
  'name-effort-volume': 'name says sampled (filtered) volume: the sampling effort',
  'name-effort-area': 'name says sampled area: the sampling effort',
  'name-sample-code': 'name says sample code or label: used as the eventID of the sample',
  'converter-variable': 'name says a measured variable the converter knows (conductivity, potential temperature or sigma-theta)',
  'depth-range-used': 'a depth range (top and bottom) is used, so this single depth, a mid-depth or a geocode, is ignored (it would make the range a point)',
  'depth-min-dwc': 'Darwin Core minimum (top) depth of a depth range',
  'depth-max-dwc': 'Darwin Core maximum (bottom) depth of a depth range',
  'depth-min-name': 'name says minimum (top) depth of a depth range',
  'depth-max-name': 'name says maximum (bottom) depth of a depth range',
  'quantity-other': 'another quantity column is used',
  'name-biomass': 'name says biomass or weight next to a count: written as a measurement of each occurrence, as given; choose its kind (wet, dry or ash-free dry mass)',
  'name-biomass-kind': 'name says biomass or weight and its kind (wet, dry or ash-free dry mass): written as a measurement of each occurrence, as given',
  'eventid-used': 'the Darwin Core eventID column is used as the sample code',
  'taxon-marks': 'cells are presence marks (+, x) and numbers: its header may be a taxon (confirm all taxon columns at once)',
  'taxon-numeric': 'numeric column with an unrecognised name: its header may be a taxon (confirm all taxon columns at once)',
  'taxon-mean': 'its header reads as the mean of a count of organisms (a species mean): its header may be a taxon; confirm it, or mark the column as a variable if it is a summary column',
  'summary-header': 'its header reads as a total or a sum, so it is not proposed as a taxon (mark it as one yourself if it is)',
  'measured-name': 'the name is a measured variable (a nutrient, a pigment, an isotope ratio, a rate), not a species: it stays a variable, and nothing is written for it as a taxon',
  'measured-word': 'the name is a physical or optical measurement word (e.g. temperature, fluorescence, turbidity), not a species: it stays a variable, and nothing is written for it as a taxon',
  'sample-descriptor': 'the name describes the sample (replicate, cast, bottle, haul, core, ...), not a measurement and not a species: ignored (give it a meaning if it is one)',
  'unnamed-column': 'column without a name in the header: give it a meaning',
  'values-latin-names': 'the cells are Latin names (a genus and a species): the taxon of each row',
  'year-values': 'every cell is a whole year (1800-2100), so it is not a species and not a measurement: ignored (give it the meaning date if it is the sampling year)',
  'year-beside-date': 'looks like a year beside the date: on every row it is the year of the date of that row, so it adds nothing to the archive and is not written as a measurement (read it as a measurement with one click if it is one, or give it the meaning date if it is the sampling year of rows without a date)',
  'running-number': 'whole numbers of six or more digits that rise (or fall) from row to row, or stay the same within a sample and rise (or fall) from sample to sample, never repeating, so it is not written as a measurement (accept it, or read it as a measurement with one click if it is one)',
  'running-number-date': 'whole numbers of six or more digits that rise (or fall) from row to row, or stay the same within a sample and rise (or fall) from sample to sample, never repeating, so it is not written as a measurement (accept it, or read it as a measurement with one click if it is one; if these are dates, give the column the meaning date in the column table)',
  'constant-value': 'one value that is not a whole number on every row (a size or a setting of the sampling, not a count or a density): ignored, give it a meaning if it is one',
  'value-per-occurrence': 'its values differ between the rows of a sample and look like a value of each organism (a size of an organism - a bare length, width, height, size or diameter, or one behind total, fork, standard, body, shell, carapace, prosome or mean, or TL, FL, SL, L1 ... L10 - with a length unit or none, and at least half of the values different inside the samples): a measurement of each occurrence, as a biomass is; if the rows of one sample are casts or typos, untick "of each organism" and fix the sample code; single specimens of one taxon in a sample also need an occurrence ID or a life-stage column, or the export is blocked (CONV-ID-DUPLICATE)',
  'replicate-name': 'the name says replicate and the sample code does not tell the rows of a sample apart: proposed as the replicate number of the sample (each value is an event under it)',
  'taxon-attribute': 'its value is the same for every row of one taxon (a species code, a serial number, a trophic level): an attribute of the taxon, not a measurement of the sample or of the organism, so it is ignored (give it a meaning if it is one)',
  'size-variable': 'its name says total, but it is a size or a length with a unit that does not count organisms: a measured variable of the sample, not a sum of individuals',
  'unit-effort': 'its unit is a volume or an area, which no species is counted in: read as the sampling effort',
  'unit-variable': 'its unit measures a length, a time, a speed or a temperature, which no species is counted in: a measured variable, not a species',
  'count-unit-quantity': 'a number counted in individuals next to a column of taxon names: the count of each row',
  'summary-total': 'a sum or total column: converting it would count the same individuals twice, so it starts as ignored (choose another meaning if it is not one)',
  'summary-total-varies': 'its name says total, but on a long sheet its values differ between the rows of one sample, so it is not an all-taxa total; it is not proposed as a quantity either (the sheet already has one, or it is a size or has a unit that does not count organisms), so it stays ignored until you give it a meaning',
  'summary-total-quantity': 'its name says total, but on a long sheet its values differ between the rows of one sample, so it is not an all-taxa total: proposed as the quantity of each row, check what it is',
  'summary-total-biomass': 'its name says total, but on a long sheet its values differ between the rows of one sample (a weight of each taxon, not the sum of the sample): proposed as a biomass measurement of each occurrence, in the unit of its name; choose its kind (wet, dry or ash-free dry mass)',
  'quality-column': 'name says a quality flag or a quality column, which is not a measurement: ignored',
  'seafloor-depth-name': 'name says depth below the seafloor (in the sediment): written as a negative distance in metres, and a negative number counted downwards (above the seafloor) as a positive one',
  'elevation-asl': 'elevation or altitude in metres above sea level: a negative value is a depth of that many metres below the surface, so the sign is turned; a positive value is above the sea and is written as a negative depth (check it)',
  'seafloor-depth-axis': 'a depth top or bottom in a sheet that has a depth in the sediment: the same axis, read as the depth below the seafloor (never as the depth of the water)',
  'seafloor-depth-cm': 'a depth in centimetres on a sheet about pore water or sediment: read as the depth below the seafloor',
  'seafloor-depth-negative': 'most numbers of this depth below the seafloor are negative: read as counted upwards from the seafloor (negative = below, positive = above), and the sign is kept; change the direction if it is wrong',
  'pressure-unit': 'a column in decibars is a pressure, not a species and not a variable of its own',
  'site-depth-only': 'name says the water depth of the site and no other column gives a depth: used as the depth of every row',
  'site-depth': 'name says the water depth of the site: it is the depth of the sediment or porewater samples',
  'site-depth-ignored': 'name says the water depth of the site, not the depth of each row: not written (give it the meaning depth if it is the depth of every row)',
  'area-not-effort': 'a plain area on a sheet with no taxa is a place name or an extent, not a sampled area: ignored (name it sampled area if it is one)',
  'seawater-density': 'name and unit say seawater density: a measured variable, not an abundance',
  'oxygen-saturation': 'oxygen as a percentage is oxygen saturation: a variable of its own, with no concentration concept',
  'p01-malformed': 'the header declares a code that is not a well-formed P01 code (eight letters and digits): kept as a measured variable, and no concept is written',
  'p01-declared-unverified': 'the header declares a P01 code that the converter could not verify: it is offered as declared by the file and written only after you confirm it',
} as const;
export type OverlayReason = keyof typeof OVERLAY_REASONS;

type Claim = { role: ColumnRole; confidence: 'high' | 'low'; code: OverlayReason };

/**
 * IO PAN's underscore style glues the unit to the name ("O2_sat_%", "O2_saturation_%", "Oxygen_saturation_%", "O2_sat_pct"): oxygen saturation, a variable of its own with no concentration concept,
 * like "O2 [%]". The unit is stated only when the header says it (a percent sign, pct, percent).
 */
function oxygenSaturationClaim(header: string): Claim | undefined {
  const m = /^(?:o2|oxygen)[ _-]?(?:sat|saturation)(?:[ _-]?(%|pct|percent))?$/i.exec(header.trim());
  if (m === null) return undefined;
  return { role: { kind: 'variable', variable: 'oxygen saturation', ...(m[1] === undefined ? {} : { unit: '%', unitSource: 'header' as const }) }, confidence: 'high', code: 'oxygen-saturation' };
}

/** The Darwin Core terms the converter reads, by lower-cased term. */
function dwcClaim(term: string): Claim | undefined {
  switch (term) {
    case 'occurrenceid':
      return { role: { kind: 'occurrenceId' }, confidence: 'high', code: 'dwc-occurrenceid' };
    case 'eventid':
      return { role: { kind: 'sampleId' }, confidence: 'high', code: 'dwc-eventid' };
    case 'scientificname':
      return { role: { kind: 'taxon' }, confidence: 'high', code: 'dwc-scientificname' };
    case 'individualcount':
      return { role: { kind: 'quantity' }, confidence: 'high', code: 'dwc-individualcount' };
    case 'organismquantity':
      return { role: { kind: 'quantity' }, confidence: 'high', code: 'dwc-organismquantity' };
    case 'organismquantitytype':
      return { role: { kind: 'quantityType' }, confidence: 'high', code: 'dwc-organismquantitytype' };
    case 'lifestage':
      return { role: { kind: 'lifeStage' }, confidence: 'high', code: 'dwc-lifestage' };
    case 'identificationqualifier':
      return { role: { kind: 'qualifier' }, confidence: 'high', code: 'dwc-identificationqualifier' };
    case 'scientificnameid':
      return { role: { kind: 'taxonId' }, confidence: 'high', code: 'dwc-scientificnameid' };
    default:
      return undefined;
  }
}

/** A quantity name (a count, an abundance, a density, a biomass) in PL / EN / DE / FR; `key` is a folded headerKey. */
function quantityClaim(key: string): Claim | undefined {
  if (QUANTITY_STANDALONE.test(key) || QUANTITY_PHRASE_COUNT.test(key)) return { role: { kind: 'quantity' }, confidence: 'high', code: 'name-count' };
  if (QUANTITY_PHRASE_DENSITY.test(key)) return { role: { kind: 'quantity' }, confidence: 'high', code: 'name-abundance' };
  const q = QUANTITY_WORD.exec(key);
  if (q) return { role: { kind: 'quantity' }, confidence: q[2] === undefined ? 'high' : 'low', code: 'name-abundance' };
  return undefined;
}

// A biomass or weight column next to a count column. `biomass…` names are claimed as the quantity when no count column is there (the kind of number is then declared for the sheet);
// next to a count they become a measurement of the occurrence. Plain weight / mass words count only when EVERY word of the name is one of these, so 'weight loss' or 'body mass index' never do.
const BIOMASS_STRONG = /^(biomass|biomasa|biomasse)( .*)?$/;
const BIOMASS_WORDS = new Set(['wet', 'dry', 'fresh', 'ash', 'free', 'afdw', 'ww', 'dw', 'weight', 'mass', 'wt', 'total', 'masa', 'waga', 'mokra', 'sucha', 'nass', 'trocken', 'gewicht', 'nassgewicht', 'trockengewicht', 'poids', 'sec', 'humide', 'frais', 'masse', 'seche', 'of', 'the']);
const BIOMASS_HEAD = new Set(['weight', 'mass', 'wt', 'afdw', 'masa', 'waga', 'gewicht', 'nassgewicht', 'trockengewicht', 'poids', 'masse']);

/** A biomass / weight name (a headerKey, folded) and the kind of mass it states; undefined when the name is no biomass name. */
function biomassName(key: string): { basis?: 'wet' | 'dry' | 'afdw' } | undefined {
  const tokens = key.split(' ').filter((t) => t !== '');
  const strong = BIOMASS_STRONG.test(key);
  if (!strong && !(tokens.length > 0 && tokens.every((t) => BIOMASS_WORDS.has(t)) && tokens.some((t) => BIOMASS_HEAD.has(t)))) return undefined;
  const has = (...w: string[]): boolean => tokens.some((t) => w.includes(t));
  const basis = has('afdw') || (has('ash') && has('free')) ? 'afdw' : has('dry', 'dw', 'sucha', 'trocken', 'trockengewicht', 'sec', 'seche') ? 'dry' : has('wet', 'ww', 'fresh', 'mokra', 'nass', 'nassgewicht', 'humide', 'frais') ? 'wet' : undefined;
  return basis === undefined ? {} : { basis };
}

/** A header whose name says a count, an abundance, a density or a biomass ("Count", "Biomass [g]", "Abundance"): a quantity column by its name alone. */
export function isQuantityHeader(header: string): boolean {
  const hu = unitFromHeader(header);
  return quantityClaim(foldDiacritics(headerKey(hu.name))) !== undefined || quantityClaim(foldDiacritics(headerKey(withoutBrackets(hu.name)))) !== undefined;
}

/** The name without a trailing bracket group of any text ("Liczba osobników (ind.)"): the shared unit reader cuts only what it knows as a unit. */
const withoutBrackets = (name: string): string => name.replace(/\s*[[(][^[\]()]*[\])]\s*$/, '');

/** The converter's own names (taxon, quantity, effort) in PL / EN / DE / FR; `key` is a headerKey. */
function nameClaim(key: string, unit: string | undefined): Claim | undefined {
  if (STAGE_NAME.test(key)) return { role: { kind: 'lifeStage' }, confidence: 'high', code: 'name-stage' };
  if (TAXON_NAME.test(key)) return { role: { kind: 'taxon' }, confidence: 'high', code: 'name-taxon' };
  const quantity = quantityClaim(key);
  if (quantity) return quantity;
  const effort = (code: OverlayReason): Claim => ({ role: unit === undefined ? { kind: 'effort' } : { kind: 'effort', unit }, confidence: 'high', code });
  if (EFFORT_VOLUME.test(key)) return effort('name-effort-volume');
  if (EFFORT_AREA.test(key)) return effort('name-effort-area');
  if (SAMPLE_CODE_NAME.test(key)) return { role: { kind: 'sampleId' }, confidence: 'high', code: 'name-sample-code' };
  return undefined;
}

/** The text of a trailing bracket group, whatever it says ("Volume filtered (m3)" -> "m3"): the unit of a name the shared unit reader left whole. */
const bracketText = (name: string): string | undefined => {
  const t = /[[(]([^[\]()]*)[\])]\s*$/.exec(name)?.[1]?.trim();
  return t === undefined || t === '' ? undefined : t;
};

/** Of a claim made on a name WITHOUT its bracket text, only an effort column or a sample code stands (a taxon, a quantity or a stage is never read from a bracketed name). */
const onlyEffortOrCode = (c: Claim | undefined): Claim | undefined => (c !== undefined && (c.role.kind === 'effort' || c.role.kind === 'sampleId') ? c : undefined);

/** The measured variables the converter knows beyond /check's canonical ones (conductivity, potential temperature, sigma-theta): by the whole header name, PANGAEA abbreviations included. */
function variableClaim(name: string, unit: string | undefined): Claim | undefined {
  const variable = conceptVariable(name);
  if (variable === undefined || !CONVERTER_VARIABLES.has(variable)) return undefined;
  return { role: { kind: 'variable', variable, ...(unit === undefined ? {} : { unit, unitSource: 'header' as const }) }, confidence: 'high', code: 'converter-variable' };
}

/**
 * A column in decibars that the proposer took for an unknown variable (a pressure the overlay reads as a pressure, not as a species). Decided from the header's RAW unit text, case-sensitively
 * (isDecibar): /check's unit table turns "dB" into "dbar", but a decibel is no pressure. A site-depth column is never one, whatever its unit (`exclude`).
 */
const isUnitPressure = (q: ColumnProposal, exclude: ReadonlySet<number> = new Set<number>()): boolean =>
  q.role.kind === 'variable' && !exclude.has(q.index) && !isCanonicalKey(q.role.variable) && q.role.p01 === undefined && isDecibar(unitFromHeader(q.header).unitText);

/** A vertical coordinate of the proposer's own reading: a depth (not an elevation or altitude), a pressure, or a column in decibars. */
const isVerticalProposal = (q: ColumnProposal, exclude: ReadonlySet<number>): boolean => !exclude.has(q.index) && ((q.role.kind === 'depth' && q.reasonCode !== 'name-elevation') || q.role.kind === 'pressure' || isUnitPressure(q, exclude));

/**
 * The unit of a column whose name did not decide: a name that is no taxon shape at all ('unknown': its first word is not genus-like) with any unit that does not count organisms is a
 * measurement. A taxon-shaped name is never made a variable by its unit: a species may carry a biomass or a rate ("[mmol C/m3]", "[kg/h]").
 */
function isMeasurementUnit(kind: 'taxon' | 'unknown' | 'variable' | 'descriptor', unit: string | undefined, unitText: string | undefined): boolean {
  const text = unitText ?? unit;
  return kind === 'unknown' && text !== undefined && !isAbundanceUnit(text) && !isAbundanceUnit(unit);
}

/** The header without its unit and bracket text: the name of a variable the converter makes of the column. */
const namePartOf = (header: string): string => unitFromHeader(header).name.replace(/\s*[[(][^[\]()]*[\])]\s*$/, '').trim() || header;

const why = (p: ColumnProposal, code: OverlayReason): void => {
  p.reason = OVERLAY_REASONS[code];
  p.reasonCode = code;
  // the shared proposer's values, lead and notes belong to its own code: none of them may stay on an overlay reason
  delete p.reasonParams;
  delete p.reasonLead;
  delete p.reasonNotes;
};

/**
 * Column proposals for /convert: the shared proposals, with the converter's roles laid over them. Pure; the input proposals are not mutated.
 */
export function proposeConvertColumns(sheet: RawSheet, ctx: ProposeContext): ColumnProposal[] {
  // T4 of the plan: the shared proposer gives a Darwin Core occurrenceID the sample-code slot (and the Sample column loses it). That is right for a long
  // sheet, where the user's occurrenceID is used as given. On a WIDE sheet (no taxon column) one occurrenceID cannot belong to the many taxon cells of a row,
  // so the shared proposer is asked as if that column had no name; the column then gets the occurrenceId role below, which is reported as not written.
  const wide = !sheet.header.some((h) => {
    const name = unitFromHeader(h).name;
    return dwcTermOf(h) === 'scientificname' || TAXON_NAME.test(foldDiacritics(headerKey(name)));
  });
  const occurrenceIdAt = new Set(wide ? sheet.header.flatMap((h, i) => (dwcTermOf(h) === 'occurrenceid' ? [i] : [])) : []);
  // "O2_ml_l": the shared reader knows a unit written after an underscore only for the units it lists, and millilitres per litre is not one of them. The shared proposer is asked as if the
  // header were "O2 [mL/L]" (the converter's own reading of it); the column keeps its own header.
  const mlPerLAt = new Map<number, string>(sheet.header.flatMap((h, i) => { const m = /^(.*\S)[_ ]ml[_ ]l$/i.exec(stripTypeSuffix(h)); return m ? [[i, `${m[1]} [mL/L]`] as [number, string]] : []; }));
  const sedCtx = sedimentContext(sheet);
  // The shared proposer has ONE plain-depth slot, and the water depth of the site ("Water depth", "Station depth") can take it from the column that gives the depth of each row. When the sheet has
  // another vertical coordinate (what the proposer itself finds when the site-depth headers are left out), the proposer is asked without them, so that its own preference picks the real depth
  // column (name tier, then the leftmost); the site depth is then ignored by the rule below. A sediment sheet is not masked (there the site depth is the depth by design), and neither is a sheet
  // whose only other "depth" is an elevation or an altitude (the converter has no role for it).
  const siteAt = new Set(sheet.header.flatMap((h, i) => (dwcTermOf(h) === undefined && isSiteDepthName(nameWithComment(h)) ? [i] : [])));
  const seafloorPre = sheet.header.some((h) => {
    const hu = unitFromHeader(h);
    return dwcTermOf(h) === undefined && (isSeafloorName(nameWithComment(h)) || (sedCtx && isPlainDepthName(nameWithComment(h)) && seafloorUnitOf(hu.unit) === 'cm'));
  });
  const rewritten = occurrenceIdAt.size > 0 || mlPerLAt.size > 0;
  const askedWith = (maskSite: boolean): { proposals: ColumnProposal[] } => {
    const masked = maskSite ? siteAt : new Set<number>();
    const asked = !rewritten && masked.size === 0 ? sheet : { ...sheet, header: sheet.header.map((h, i) => (occurrenceIdAt.has(i) || masked.has(i) ? `__column ${i + 1}` : (mlPerLAt.get(i) ?? h))) };
    return { proposals: proposeColumns(asked, { ...ctx, keepAbundance: true, placeAsStation: true }).map((p) => (occurrenceIdAt.has(p.index) || mlPerLAt.has(p.index) || masked.has(p.index) ? { ...p, header: sheet.header[p.index], cleanHeader: stripTypeSuffix(sheet.header[p.index]) } : { ...p }))};
  };
  let asked0 = siteAt.size > 0 && !seafloorPre ? askedWith(true) : undefined;
  if (asked0 !== undefined && !asked0.proposals.some((q) => isVerticalProposal(q, siteAt))) asked0 = undefined;
  const base = (asked0 ?? askedWith(false)).proposals;
  const qualityAt = new Set<number>();
  const seafloorAt = new Map<number, 'seafloor-depth-name' | 'seafloor-depth-cm' | 'seafloor-depth-axis'>();
  const siteDepthAt = new Set<number>();
  const plainAreaAt = new Set<number>();
  const claims = new Map<number, Claim>();
  const bounds = new Map<number, 'min' | 'max'>();
  let dwcEventId = -1;

  for (const p of base) {
    // a column the short-header detection added (IN-HEADER-SHORT) has no name to read a meaning from: never a taxon, never a variable named "Column 7"
    if (sheet.unnamedFrom !== undefined && p.index >= sheet.unnamedFrom) {
      p.role = { kind: 'ignore' };
      p.confidence = 'low';
      why(p, 'unnamed-column');
      continue;
    }
    const hu = unitFromHeader(p.header);
    const key = headerKey(hu.name);
    const term = dwcTermOf(p.header);
    const dwc = term === undefined ? undefined : dwcClaim(term);
    if (!dwc && term === undefined) {
      if (isQualityHeader(p.header, sheet.header)) {
        qualityAt.add(p.index);
        continue;
      }
      const depthUnit = depthUnitOfHeader(p.header, hu.unit ?? (p.role.kind === 'depth' ? p.role.unit : undefined));
      if (isSeafloorName(nameWithComment(p.header))) {
        seafloorAt.set(p.index, 'seafloor-depth-name');
        continue;
      }
      // a depth top / bottom in a sheet that has a depth in the sediment is the same axis
      if (seafloorPre && isDepthBoundKey(headerKey(foldDiacritics(nameWithComment(p.header))))) {
        seafloorAt.set(p.index, 'seafloor-depth-axis');
        continue;
      }
      if (sedCtx && isPlainDepthName(nameWithComment(p.header)) && seafloorUnitOf(depthUnit) === 'cm') {
        seafloorAt.set(p.index, 'seafloor-depth-cm');
        continue;
      }
      if (isSiteDepthName(nameWithComment(p.header))) {
        siteDepthAt.add(p.index);
        continue;
      }
    }
    if (!dwc && APHIA_HEADER.test(stripTypeSuffix(p.header)) && holdsAphiaIds(sheet, p.index)) {
      claims.set(p.index, { role: { kind: 'taxonId', aphia: true }, confidence: 'high', code: 'name-aphiaid' });
      continue;
    }
    if (dwc) {
      claims.set(p.index, dwc);
      if (term === 'eventid') dwcEventId = p.index;
      continue;
    }
    if (term === 'minimumdepthinmeters') bounds.set(p.index, 'min');
    else if (term === 'maximumdepthinmeters') bounds.set(p.index, 'max');
    else {
      // (a camel-case name is read as its words: DepthSampleStart = depth, sample, start)
      const bound = depthBoundOfName(foldDiacritics(headerKey(nameWithComment(p.header).replace(/([a-z0-9])([A-Z])/g, '$1 $2'))));
      if (bound !== undefined) bounds.set(p.index, bound);
      else {
        // the name as it stands, then without a trailing bracket group of any text ("Volume filtered (m3)", "Sample label (Multinet number)"); a bracket text
        // is the unit of an effort column when the shared reader found none
        const bare = foldDiacritics(headerKey(withoutBrackets(hu.name)));
        const key0 = foldDiacritics(key);
        const seawaterDensity: Claim | undefined =
          SEAWATER_DENSITY_NAME.test(key0) && (SEAWATER_DENSITY_ONLY.test(key0) || isSeawaterDensityUnit(hu.unit))
            ? { role: { kind: 'variable', variable: 'density', ...(hu.unit === undefined ? {} : { unit: hu.unit, unitSource: 'header' as const }) }, confidence: 'high', code: 'seawater-density' }
            : undefined;
        const named =
          seawaterDensity ??
          oxygenSaturationClaim(stripTypeSuffix(p.header)) ??
          variableClaim(hu.name, hu.unit) ??
          nameClaim(foldDiacritics(key), hu.unit) ??
          onlyEffortOrCode(bare === foldDiacritics(key) ? undefined : nameClaim(bare, hu.unit ?? bracketText(hu.name))) ??
          quantityClaim(bare);
        if (named) {
          claims.set(p.index, named);
          if (named.role.kind === 'effort' && PLAIN_AREA.test(foldDiacritics(headerKey(hu.name)))) plainAreaAt.add(p.index);
        }
      }
    }
  }

  // a column of Latin binomials is the taxon of a long sheet, whatever its header says ('Scientific name', 'SpName'): decided by the cells, and only when the sheet is long by its other columns.
  // It is never claimed (a) on a Darwin Core term, (b) beside genus-shaped numeric columns (a wide sheet whose species are columns, with a 'Dominant species' text column), (c) without a column
  // that counts or measures the organisms of each row (a quantity, a biomass, a number counted in individuals), (d) on a table of samples in numbered columns. Several such columns (a host
  // and a parasite) are not told apart: the leftmost is offered. The cells alone never make it high confidence.
  const numberedColumns = sheet.header.filter((h) => /^\s*\d+(?:\.\d+)?\s*$/.test(h)).length;
  const countColumn = (q: ColumnProposal): boolean => {
    const u = unitFromHeader(q.header);
    return q.role.kind === 'variable' && !isCanonicalKey(q.role.variable) && q.role.p01 === undefined && isPlainCountUnit(foldUnit(u.unit ?? u.unitText ?? '')) && nameKind(q.header, true) !== 'descriptor';
  };
  // a quantity or a biomass named by its header makes the sheet long whatever numeric columns stand beside it (a species code, a mesh, a transect number); a column that only counts in
  // individuals ('Ind [#]') does so when it is the only one (several are species columns of a wide sheet), and then the numeric genus-shaped columns veto
  const namedQuantity = base.some((q) => claims.get(q.index)?.role.kind === 'quantity' || claims.get(q.index)?.role.kind === 'biomass');
  const longEvidence = namedQuantity || base.filter(countColumn).length === 1;
  // the numeric columns that look like species of a wide sheet: genus-shaped names, not a code, an identifier, a descriptor or a word of the sampling ('species_code', 'Mesh', 'Transect')
  const speciesLike = base.filter((q) => {
    if (q.role.kind !== 'variable' || isCanonicalKey(q.role.variable) || q.role.p01 !== undefined || claims.has(q.index) || countColumn(q)) return false;
    if (isSamplingOrEnvironmentHeader(q.header) || /(?:^|[^a-z])(?:code|id|no|nr|number|tsn|aphia)$/i.test(unitFromHeader(q.header).name.trim())) return false;
    return nameKind(q.header, isAbundanceUnit(unitFromHeader(q.header).unit) || isAbundanceUnit(unitFromHeader(q.header).unitText)) === 'taxon';
  });
  const binomialHeaders = speciesLike.filter((q) => /^(?:[A-Z][a-z]{2,}|[A-Z]\.)\s+[a-z]{3,}/.test(unitFromHeader(q.header).name.trim())).length;
  // with a quantity named by its header a sheet is long, unless it has species columns of its own: two binomial headers, or three genus-shaped numeric columns, make it wide (a 'Dominant species' text
  // column beside 'Abundance', 'Calanus', 'Oithona', 'Acartia' is a note on a wide sheet); one species code or one mesh does not. With only a count unit as evidence one species-like column is enough.
  const wideLike = namedQuantity ? binomialHeaders >= 1 || speciesLike.length >= 2 : speciesLike.length >= 1;
  if (numberedColumns < 5 && longEvidence && !wideLike && ![...claims.values()].some((c) => c.role.kind === 'taxon')) {
    const latin = base.filter((q) => q.role.kind === 'ignore' && q.reasonCode === 'text-column' && !looksLikeDwcTerm(q.header, sheet.header) && !claims.has(q.index) && latinNameShare(sheet, q.index) > 0);
    if (latin.length > 0) claims.set(latin[0].index, { role: { kind: 'taxon' }, confidence: 'low', code: 'values-latin-names' });
  }

  // depth: the winner of the shared slot says which direction the sheet counts
  const sharedDepth = base.find((p) => p.role.kind === 'depth' && p.role.bound === undefined)?.role;
  const sheetPositive = sharedDepth && sharedDepth.kind === 'depth' ? sharedDepth.positive : 'unknown';

  const hasRange = [...bounds.values()].includes('min') && [...bounds.values()].includes('max');
  // another column that gives the depth of each row (a plain depth or a bound): then the water depth of the site is not the sheet's depth
  // (ANY vertical coordinate counts: a plain depth, a top or bottom bound, a DwC minimum / maximum depth, a pressure; a depth below the seafloor makes the sheet a sediment sheet)
  const pressureByUnit = new Set(base.filter((q) => isUnitPressure(q, siteDepthAt)).map((q) => q.index));
  const otherDepth = base.some((q) => !siteDepthAt.has(q.index) && !seafloorAt.has(q.index) && (q.role.kind === 'depth' || q.role.kind === 'pressure' || bounds.has(q.index) || pressureByUnit.has(q.index)));
  let siteDepthTaken = false;
  const hasLongTaxon = [...claims.values()].some((c) => c.role.kind === 'taxon');
  // a number counted in individuals ("Ind [#]", "Count [n]") next to a column of taxon names: the count of each row, when no column is named as one
  if (hasLongTaxon && ![...claims.values()].some((c) => c.role.kind === 'quantity')) {
    const counts = base.filter((o) => o.role.kind === 'variable' && !claims.has(o.index) && !isCanonicalKey(o.role.variable) && isPlainCountUnit(foldUnit(unitFromHeader(o.header).unit ?? unitFromHeader(o.header).unitText ?? '')) && nameKind(o.header, true) !== 'descriptor');
    // a name that says individuals or a count first; a descriptor of the sample ('Hauls [#]', 'Replicates [n]') is never the count
    const q = counts.find((o) => /\b(ind|indiv|individuals?|count|counts|specimens?|abundance|number)\b/.test(headerKey(unitFromHeader(o.header).name))) ?? counts[0];
    if (q !== undefined) claims.set(q.index, { role: { kind: 'quantity' }, confidence: 'low', code: 'count-unit-quantity' });
  }
  const seenQuantity = new Set<number>();
  // a biomass or weight column next to a count column of a long sheet is a measurement of the occurrence, not a second quantity
  const biomassKey = (h: string): string => foldDiacritics(headerKey(unitFromHeader(h).name));
  const hasCount = [...claims.entries()].some(([i, c]) => c.role.kind === 'quantity' && !BIOMASS_STRONG.test(biomassKey(sheet.header[i] ?? '')));
  if (hasCount && hasLongTaxon) {
    for (const p of base) {
      const claim = claims.get(p.index);
      if (claim !== undefined && claim.role.kind !== 'quantity') continue;
      if (claim === undefined && p.role.kind !== 'variable') continue;
      const b = biomassName(biomassKey(p.header));
      if (b === undefined) continue;
      claims.set(p.index, { role: { kind: 'biomass', ...(b.basis === undefined ? {} : { basis: b.basis }) }, confidence: b.basis === undefined ? 'low' : 'high', code: b.basis === undefined ? 'name-biomass' : 'name-biomass-kind' });
    }
  }
  for (const p of base) {
    const claim = claims.get(p.index);
    const bound = bounds.get(p.index);
    // a quality flag is never a measurement or a taxon (the shared proposer already ignores `_flag` and `_QC`; the rest of the spellings are read here)
    if (qualityAt.has(p.index)) {
      if (p.role.kind !== 'ignore' || p.reasonCode !== 'quality-flag') {
        p.role = { kind: 'ignore' };
        p.confidence = 'low'; // so that the page shows the reason
        why(p, 'quality-column');
      }
      continue;
    }
    // the depth in a sediment or porewater sample, and the water depth of the site
    const hdr = unitFromHeader(p.header);
    const seafloorCode = seafloorAt.get(p.index);
    if (seafloorCode !== undefined) {
      const unit = seafloorUnitFromHeader(p.header) ?? depthUnitOfHeader(p.header, hdr.unit ?? (p.role.kind === 'depth' ? p.role.unit : undefined));
      // the direction the numbers count, read from the DATA and shown as a proposal the user can change: all numbers at or below zero (and some below) means they count upwards from the
      // seafloor, so a depth below it is negative; anything else is the usual depth below (positive)
      const up = countsUpwards(sheet, p.index, ctx.decimalComma);
      p.role = { kind: 'depthBelowSeafloor', ...(unit === undefined ? {} : { unit }), ...(up ? { positive: 'up' as const } : {}) };
      p.confidence = up || seafloorCode === 'seafloor-depth-cm' ? 'low' : 'high'; // a guess from the sheet's context or the data shows its reason
      if (up) why(p, 'seafloor-depth-negative');
      else if (seafloorCode === 'seafloor-depth-cm') why(p, 'seafloor-depth-cm');
      else if (seafloorCode === 'seafloor-depth-axis') why(p, 'seafloor-depth-axis');
      else why(p, 'seafloor-depth-name');
      continue;
    }
    if (siteDepthAt.has(p.index)) {
      const unit = depthUnitOfHeader(p.header, hdr.unit ?? (p.role.kind === 'depth' ? p.role.unit : undefined));
      if (seafloorAt.size > 0) {
        // a sediment or porewater sheet: the water depth of the site is the depth of its samples (min / maxDepthInMeters)
        p.role = { kind: 'depth', positive: 'down', ...(unit === undefined ? {} : { unit }) };
        p.confidence = 'high';
        why(p, 'site-depth');
      } else if (otherDepth || siteDepthTaken) {
        // another column gives the depth of each row: the water depth of the site is not that depth
        p.role = { kind: 'ignore' };
        p.confidence = 'low';
        why(p, 'site-depth-ignored');
      } else {
        // the only depth the sheet has: used as the depth, as before (the shared proposer's own reading when it made it a depth)
        siteDepthTaken = true;
        if (p.role.kind !== 'depth') {
          p.role = { kind: 'depth', positive: 'down', ...(unit === undefined ? {} : { unit }) };
          p.confidence = 'low';
          why(p, 'site-depth-only');
        }
      }
      continue;
    }
    if (bound !== undefined) {
      const hu = unitFromHeader(p.header);
      const dwcDepth = dwcTermOf(p.header) === 'minimumdepthinmeters' || dwcTermOf(p.header) === 'maximumdepthinmeters';
      const was = p.role.kind === 'depth' ? p.role : undefined;
      const unit = dwcDepth ? 'm' : depthUnitOfHeader(p.header, was?.unit ?? hu.unit);
      p.role = { kind: 'depth', positive: dwcDepth ? 'down' : (was?.positive ?? sheetPositive), ...(unit === undefined ? {} : { unit }), bound };
      p.confidence = 'high';
      why(p, `depth-${bound}-${dwcDepth ? 'dwc' : 'name'}` as OverlayReason);
      continue;
    }
    // a sheet with a top and a bottom bound reads the RANGE; a single depth column next to it (a mid-depth, PANGAEA's "Depth water" GEOCODE) would win the plain slot and
    // turn the range into a point, so it is ignored, with its reason (the user can still give it a meaning)
    if (hasRange && p.role.kind === 'depth' && p.role.bound === undefined) {
      p.role = { kind: 'ignore' };
      p.confidence = 'low';
      why(p, 'depth-range-used');
      continue;
    }
    if (claim) {
      if (claim.role.kind === 'quantity') {
        // one quantity column is read; a second one (individualCount next to organismQuantity) is left out
        if (seenQuantity.size > 0) {
          p.role = { kind: 'ignore' };
          p.confidence = 'low';
          why(p, 'quantity-other');
          continue;
        }
        seenQuantity.add(p.index);
      }
      p.role = claim.role;
      p.confidence = claim.confidence;
      why(p, claim.code);
      continue;
    }
    // another sample-code column next to a Darwin Core eventID: the eventID is the code
    if (dwcEventId >= 0 && p.role.kind === 'sampleId' && p.index !== dwcEventId) {
      p.role = { kind: 'ignore' };
      p.confidence = 'low';
      why(p, 'eventid-used');
      continue;
    }
    // /check's unit table writes a decibel ("dB") as "dbar": a variable or a pressure whose RAW unit is not a pressure unit keeps the unit as written
    if ((p.role.kind === 'variable' || p.role.kind === 'pressure') && p.role.unit === 'dbar' && hdr.unitText !== undefined && !isDecibar(hdr.unitText)) {
      p.role = { ...p.role, unit: hdr.unitText, ...(p.role.kind === 'variable' ? { unitSource: 'header' as const } : {}) };
    }
    // a column in decibars is a pressure (the proposer took "Sea pressure [dbar]" and "CTDPRS [dbar]" for unknown variables, which would be species candidates here)
    if (pressureByUnit.has(p.index) && claim === undefined && p.role.kind === 'variable') {
      const unit = p.role.unit ?? hdr.unit;
      p.role = { kind: 'pressure', ...(unit === undefined ? {} : { unit }) };
      p.confidence = 'low'; // so that the page shows the reason
      why(p, 'pressure-unit');
      continue;
    }
    // oxygen as a percentage is SATURATION: a variable of its own, never given a concentration concept (a concept that says "per unit volume" is another quantity)
    if (p.role.kind === 'variable' && p.role.variable === 'oxygen' && ((p.role.unit !== undefined && isPercentUnit(p.role.unit)) || /saturation|sattigung|nasycenie/i.test(foldDiacritics(stripTypeSuffix(p.header))))) {
      p.role = { ...p.role, variable: 'oxygen saturation' };
      why(p, 'oxygen-saturation');
      continue;
    }
    // a P01 code the header declares (`SDN:P01::CODE`): a well-formed one the converter cannot verify is offered as "declared by the file" (written only after the user confirms); a malformed one (the
    // wrong number of characters) stays a measured variable with that said, and is never read as a species
    {
      const m = /^SDN:P01::([A-Za-z0-9]+)$/.exec(hdr.name.trim());
      if (m !== null && p.role.kind === 'variable' && p.role.p01 === undefined) {
        p.confidence = 'low';
        why(p, 'p01-malformed');
        continue;
      }
      if (m !== null && p.role.kind === 'variable' && p.role.p01 !== undefined && verifiedConcept(p.role.p01) === undefined) {
        p.confidence = 'low';
        why(p, 'p01-declared-unverified');
        continue;
      }
    }
    // wide sheet: a column of presence marks (+, x) next to counts is a species column too; the shared proposer read it as text
    const summaryHeader = isSummaryHeader(summaryText(p.header));
    // a sum or total column that the shared proposer took for a measured variable (and that is not a standard variable): it adds up other columns,
    // so converting it would count the same individuals twice. It starts as ignored, with its reason; the user can still give it another meaning,
    // and then it is their decision. A column of presence marks keeps the shared role (ignore); the page says why it is not a taxon candidate.
    if (summaryHeader && p.role.kind === 'variable' && !isCanonicalKey(p.role.variable) && (conceptVariable(p.role.variable) === undefined || isAbundanceUnit(p.role.unit)) && p.role.p01 === undefined) {
      // 'Total length [mm]': a size or a length word with a unit that does not count organisms is a measurement of the sample or the animal, not a sum of individuals: a measured variable with
      // its unit (low confidence, so the page shows why), on long and wide sheets alike. A size word with NO unit is still a total until the values or the user say otherwise.
      const sizeUnit = hdr.unit ?? hdr.unitText;
      if (isSizeLikeHeader(p.header) && sizeUnit !== undefined && !isAbundanceUnit(sizeUnit) && !isPlainCountUnit(foldUnit(sizeUnit)) && !isMassUnitText(hdr.unitText)) {
        p.role = { kind: 'variable', variable: namePartOf(p.header), unit: sizeUnit, unitSource: 'header' };
        p.confidence = 'low';
        why(p, 'size-variable');
        continue;
      }
      p.role = { kind: 'ignore' };
      p.confidence = 'low';
      why(p, 'summary-total');
      continue;
    }
    if (summaryHeader && !hasLongTaxon && p.role.kind === 'ignore' && /^text column/.test(p.reason) && holdsPresenceMarks(sheet, p.index, ctx.decimalComma)) {
      p.confidence = 'low'; // so that the page shows the reason
      why(p, 'summary-header');
      continue;
    }
    if (!summaryHeader && !hasLongTaxon && p.role.kind === 'ignore' && /^text column/.test(p.reason) && holdsPresenceMarks(sheet, p.index, ctx.decimalComma)) {
      p.role = { kind: 'taxon', header: true };
      p.confidence = 'low';
      why(p, 'taxon-marks');
      continue;
    }
    // wide sheet: a numeric column named like nothing we know is a taxon candidate; confirmed in bulk
    if (!summaryHeader && !hasLongTaxon && p.role.kind === 'variable' && !isCanonicalKey(p.role.variable) && (conceptVariable(p.role.variable) === undefined || isAbundanceUnit(p.role.unit)) && p.role.p01 === undefined) {
      // the NAME decides (core/convert/measured.ts), never the unit alone: a species of a wide sheet may carry a biomass unit ("Calanus finmarchicus [mg C/m3]")
      const kind = nameKind(p.header, isAbundanceUnit(hdr.unit) || isAbundanceUnit(hdr.unitText));
      const unitFolded = foldUnit(hdr.unit ?? hdr.unitText ?? '');
      const abundance = isAbundanceUnit(hdr.unit) || isAbundanceUnit(hdr.unitText);
      // a unit written in SQUARE brackets is a unit; '(m)' and '_m' on a name can be 'male' ('Calanus finmarchicus (m)', 'Calanus_m'), and a lone 'm' on a genus-shaped name is never taken for metres
      const squareUnit = /\[[^[\]]+\]/.test(stripTypeSuffix(p.header));
      // a volume or an area unit makes the column the sampling effort only on a name that is no taxon shape at all ('Zostera marina [m2]', 'Posidonia oceanica [ha]' are species with a cover)
      const spaceUnit = /^(?:l|ml|dl|cl|dm3|cm3|m3|m2|cm2|km2|ha)$/.test(unitFolded);
      const geometry = squareUnit && unitFolded !== '' && isGeometryUnit(unitFolded) && (kind === 'unknown' || unitFolded !== 'm') && (!spaceUnit || kind === 'unknown');
      // what the VALUES and the UNIT rule out (a false variable loses occurrences, so only what no species column can be). Values are read only on a column that is filled on EVERY row, never with
      // an abundance unit, and a one-value rule never on a name that is shaped like a taxon; the years rule on a name that is not, or that says year ('SampleYear', 'Year'). A genus name with
      // none of these stays a candidate, whatever its unit: 'Calanus', 'Acartia', 'Calanus [ind/m3]'.
      const yearName = nameWithComment(p.header).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).some((w) => w === 'year' || w === 'years' || w === 'yr');
      if (kind !== 'descriptor' && kind !== 'variable' && !abundance && (kind !== 'taxon' || yearName) && holdsYears(sheet, p.index, ctx.decimalComma)) {
        p.role = { kind: 'ignore' };
        p.confidence = 'low';
        why(p, 'year-values');
      } else if (kind !== 'descriptor' && kind !== 'variable' && geometry) {
        const unit = hdr.unit ?? hdr.unitText;
        const space = /^(?:l|ml|dl|cl|dm3|cm3|m3|m2|cm2|km2|ha)$/.test(unitFolded);
        p.role = space ? { kind: 'effort', ...(unit === undefined ? {} : { unit }) } : { kind: 'variable', variable: namePartOf(p.header), ...(unit === undefined ? {} : { unit, unitSource: 'header' as const }) };
        p.confidence = 'low';
        if (space) why(p, 'unit-effort');
        else why(p, 'unit-variable');
      } else if (kind !== 'descriptor' && kind !== 'variable' && kind !== 'taxon' && !abundance && holdsOneFractionalValue(sheet, p.index, ctx.decimalComma)) {
        p.role = { kind: 'ignore' };
        p.confidence = 'low';
        why(p, 'constant-value');
      } else if (kind === 'descriptor') {
        p.role = { kind: 'ignore' };
        p.confidence = 'low';
        why(p, 'sample-descriptor');
      } else if (kind === 'variable' || isMeasurementUnit(kind, hdr.unit, hdr.unitText)) {
        // (a unit that no sheet of organisms writes (an amount of substance, a rate per time), or, for a name that is no taxon shape at all, any unit that does not count organisms, also makes it a
        // variable: "DNRAw (µmol m-2h-1)", "Dw (µmol m-2h-1)")
        p.confidence = 'low';
        // a plain CTD / optical word gets its own reason: the nutrient, pigment, isotope and rate examples of the other one would be wrong for it
        if (kind === 'variable' && isMeasurementWord(p.header)) why(p, 'measured-word');
        else why(p, 'measured-name');
      } else {
        p.role = { kind: 'taxon', header: true };
        p.confidence = 'low';
        if (hasCentralStatisticToken(p.header)) why(p, 'taxon-mean');
        else why(p, 'taxon-numeric');
      }
    }
  }
  // a column NAMED like a total on a LONG sheet is decided by its values, not by its name: an all-taxa total repeats the same value on every row of a sample; a column whose values differ
  // between the rows of a sample (a weight of each taxon) hides real data when it starts as ignored, so it gets a visible low-confidence proposal. Nothing can be judged without
  // sample columns or without a sample of more than one row: it then stays ignored.
  if (hasLongTaxon) {
    for (const q of base) {
      const named = isSummaryHeader(summaryText(q.header));
      if (!named) continue;
      const verdict = q.reasonCode === 'summary-total' || q.role.kind === 'biomass' ? valuesRepeatWithinSample(sheet, base, q.index, ctx.decimalComma) : 'unknown';
      // a biomass column that the name claimed ('Total weight (kg)') but whose value repeats on every row of a sample is the weight of the whole sample
      if (verdict === 'constant' && q.role.kind === 'biomass') {
        q.role = { kind: 'ignore' };
        q.confidence = 'low';
        why(q, 'summary-total');
        continue;
      }
      if (q.reasonCode !== 'summary-total' || verdict !== 'varies') continue;
      const hu = unitFromHeader(q.header);
      const named2 = biomassNameUnit(q.header);
      const mass = isMassUnitText(hu.unitText) || named2.unit !== undefined || named2.unclear !== undefined;
      // a mass is a measurement of each occurrence; a plain number is the quantity of each row when the sheet has no other, else it stays ignored (a measured variable is
      // written once per sample, so values that differ between the rows of a sample would conflict) and the reason says what to decide. A number with a unit that does not count
      // organisms, or whose name says a size ('Total length', 'Total depth'), is no quantity.
      const hasQuantity = base.some((o) => o.role.kind === 'quantity');
      const countLike = (hu.unitText === undefined || isAbundanceUnit(hu.unitText)) && !isSizeLikeHeader(q.header);
      // a size ('Total length') whose values differ between the rows of a sample is a measurement of each organism: an occurrence variable, with its unit when it has one
      if (!mass && isOrganismSizeHeader(q.header)) {
        q.role = { kind: 'variable', variable: namePartOf(q.header), ...(hu.unit === undefined && hu.unitText === undefined ? {} : { unit: hu.unit ?? hu.unitText, unitSource: 'header' as const }), perOccurrence: true };
        q.confidence = 'low';
        why(q, 'value-per-occurrence');
        continue;
      }
      q.role = mass ? { kind: 'biomass' } : hasQuantity || !countLike ? { kind: 'ignore' } : { kind: 'quantity' };
      q.confidence = 'low';
      why(q, mass ? 'summary-total-biomass' : hasQuantity || !countLike ? 'summary-total-varies' : 'summary-total-quantity');
    }
  }
  // a descriptor of the sample on a long sheet (Replicate, Rep, Tow, Haul, Cast ...) is not a measurement: one that says replicate, where the sample code does NOT already tell its rows apart (the same
  // code has several replicate values), is proposed as the replicate number (each value an event under the sample); every other one is ignored with its reason. Where the code separates the rows
  // already, a replicate column is never proposed as a role (the event IDs stay as they are) and never as a variable: it is ignored, and the button of the role stays the way to use it.
  if (hasLongTaxon) {
    for (const q of base) {
      if (q.role.kind !== 'variable' || isCanonicalKey(q.role.variable) || q.role.p01 !== undefined || nameKind(q.header, true) !== 'descriptor') continue;
      const nameKey = foldDiacritics(headerKey(unitFromHeader(q.header).name));
      // the plural ('Replicates', 'Reps') can hold "found in N replicates" for one taxon: it stays a variable and blocks when it differs inside a sample
      if (/^(?:replicates|reps)\b/.test(nameKey)) continue;
      const replicateName = /^(?:replicate|rep|replikat(?:e)?)(?: no| nr| num| number| id| n)?$/.test(nameKey);
      // the role only where every value of the column holds at least two rows (a column that is different on every row would make an event of each row)
      const counts = new Map<string, number>();
      for (const r of sheet.rows) {
        const c = r.cells[q.index] ?? null;
        if (!isBlankCell(c)) counts.set(String(c).trim(), (counts.get(String(c).trim()) ?? 0) + 1);
      }
      const eachTwice = counts.size > 0 && [...counts.values()].every((n) => n >= 2);
      if (replicateName && eachTwice && valuesRepeatWithinSample(sheet, base, q.index, ctx.decimalComma) === 'varies') {
        q.role = { kind: 'replicate' };
        q.confidence = 'low';
        why(q, 'replicate-name');
      } else {
        q.role = { kind: 'ignore' };
        q.confidence = 'low';
        why(q, 'sample-descriptor');
      }
    }
  }
  // a column that is a function of the taxon (a species code, a serial number, a trophic level) is an attribute of the taxon, not a measurement of the sample or of the organism: it is ignored, with
  // its reason shown, instead of being written on the sample or on the occurrences
  const taxonAt = base.find((q) => q.role.kind === 'taxon' && q.role.header !== true)?.index;
  if (hasLongTaxon && taxonAt !== undefined) {
    for (const q of base) {
      if (q.role.kind !== 'variable' || isCanonicalKey(q.role.variable) || q.role.p01 !== undefined || nameKind(q.header, true) === 'descriptor') continue;
      if (!isTaxonAttribute(sheet, taxonAt, q.index, q.header, valuesRepeatWithinSample(sheet, base, q.index, ctx.decimalComma))) continue;
      q.role = { kind: 'ignore' };
      q.confidence = 'low';
      why(q, 'taxon-attribute');
    }
  }
  // a measured variable that a long sheet gives to each organism belongs to the occurrence, as a biomass does. It is moved only when it IS the size of an organism, by a positive list
  // (isOrganismSizeHeader: a bare length / width / height / size / diameter, one of them behind total, fork, standard, body, shell, carapace, prosome or mean, TL, FL, SL, L1 ... L10; a length unit
  // or none), because a value that differs inside one sample is otherwise the one signal of a wrong sample code, of two casts under one code, or of a typo (CONV-SAMPLE-CONFLICT), and that signal
  // must stay. The values must differ between the rows of a sample, and at least half of the values inside the samples must be different (a length of each organism is nearly never repeated).
  // A recognised variable (temperature ...), a descriptor of the sample (Tow, Haul, Cast) and anything else that differs inside a sample keeps blocking, with the column named. The user can move a
  // column by hand (the tick "of each organism" on its role). The decision is taken from the sample columns the proposal sees.
  if (hasLongTaxon && base.some((o) => o.role.kind === 'quantity' || o.role.kind === 'biomass')) {
    for (const q of base) {
      if (q.role.kind !== 'variable' || q.role.perOccurrence === true || isCanonicalKey(q.role.variable) || q.role.p01 !== undefined) continue;
      if (nameKind(q.header, true) === 'descriptor' || !isOrganismSizeHeader(q.header)) continue;
      if (valuesRepeatWithinSample(sheet, base, q.index, ctx.decimalComma) !== 'varies') continue;
      if ((distinctnessWithinSamples(sheet, base, q.index, ctx.decimalComma) ?? 0) < 0.5) continue;
      q.role = { ...q.role, perOccurrence: true };
      q.confidence = 'low';
      why(q, 'value-per-occurrence');
    }
  }
  // a plain "Area" on a sheet that has no taxon, quantity or occurrence ID is a place name or an extent, not a sampled area (a header that says sampled or swept area stays an effort)
  const biology = base.some((q) => q.role.kind === 'taxon' || q.role.kind === 'quantity' || q.role.kind === 'occurrenceId' || q.role.kind === 'taxonId');
  if (!biology) {
    for (const q of base) {
      if (plainAreaAt.has(q.index) && q.role.kind === 'effort') {
        q.role = { kind: 'ignore' };
        q.confidence = 'low';
        why(q, 'area-not-effort');
      }
    }
  }
  // elevation or altitude read as a depth: what the converter does with its sign, and why, is said on the column (the shared reason only says "positive up")
  for (const q of base) {
    if (q.role.kind === 'depth' && q.reasonCode === 'name-elevation') why(q, 'elevation-asl');
  }
  // Two value vetoes for EVERY sheet shape, removal only: a numeric column the proposer made a measured variable (a name no vocabulary knows, no unit, no code) whose filled cells are all whole years
  // beside a date column, or all whole numbers of six or more digits that are all different (a running number, an identifier). The column becomes ignore (low), is named by CONV-COLUMN-IGNORED and by
  // its own finding, and the page gives the measurement back with one click. No other role is ever assigned here.
  const dateCols = base.filter((q) => q.role.kind === 'date' || q.role.kind === 'datetime').map((q) => q.index);
  const sampleCols = base.filter((q) => SAMPLE_KEY_KINDS.has(q.role.kind)).map((q) => q.index);
  // a long sheet with a taxon column and no quantity or biomass column (declared or proposed): its only number column may be the counts, which the person is asked to mark (CONV-TAXON-NO-QUANTITY); a
  // running-number veto there would turn that into "this is a species list". The year veto stays: a presence list with a Year beside its date really is one.
  const countsMayBeHere = base.some((q) => q.role.kind === 'taxon' && q.role.header !== true) && !base.some((q) => q.role.kind === 'quantity' || q.role.kind === 'biomass');
  for (const q of base) {
    if (q.role.kind !== 'variable' || isCanonicalKey(q.role.variable) || q.role.p01 !== undefined || q.role.unit !== undefined) continue;
    const code = dateCols.length > 0 && holdsYearOfDate(sheet, q.index, dateCols, ctx.decimalComma, ctx.date1904) ? 'year-beside-date' : !countsMayBeHere && holdsRunningNumbers(sheet, q.index, ctx.decimalComma, sampleCols) ? (dateCols.length === 0 && holdsDigitDates(sheet, q.index, ctx.decimalComma) ? 'running-number-date' : 'running-number') : undefined;
    if (code === undefined) continue;
    q.vetoed = q.role;
    q.role = { kind: 'ignore' };
    q.confidence = 'low';
    why(q, code);
  }
  return base;
}

/** The proposals as a mapping, as the converter reads it. */
export function proposeConvertMapping(sheet: RawSheet, ctx: ProposeContext): SheetMapping {
  return toMapping(sheet, proposeConvertColumns(sheet, ctx));
}

/** A taxon column without `header` means a long sheet; taxon columns with `header: true` mean a wide one; neither: undefined (the user picks). */
export function suggestConvertShape(columns: readonly { role: ColumnRole }[]): ConvertShape | undefined {
  if (columns.some((c) => c.role.kind === 'taxon' && c.role.header !== true)) return 'long';
  if (columns.some((c) => c.role.kind === 'taxon' && c.role.header === true)) return 'wide';
  return undefined;
}

/**
 * Stage 6: does this sheet LOOK like a profile / environment file of a cruise (CTD casts, bottle data, environmental stations)? A low-confidence suggestion that the page shows
 * as a note; it is never set by itself, the user ticks the mark. The sheet has a station, a depth or a pressure, and at least one named measured variable, and no taxon,
 * quantity or occurrence-ID column (a sheet with those is a biology sheet). A column that only MIGHT be a species (a numeric column with a name the converter does not know)
 * counts as a taxon column here: a CTD sheet with parameter names it does not know is then simply not suggested, which costs the user one tick.
 */
export function suggestConvertProfile(columns: readonly { role: ColumnRole; confidence?: 'high' | 'low' }[]): boolean {
  const kinds = new Set(columns.map((c) => c.role.kind));
  if (kinds.has('quantity') || kinds.has('occurrenceId') || kinds.has('taxonId')) return false;
  // a taxon column the user or the file named (high confidence, or a long sheet's taxon column) makes it a biology sheet; low-confidence candidates (numeric columns with a name the converter does not
  // know) block only when they are at least as many as the named variables (the tool's own choice: a CTD file has a few unknown parameters, a species table has many species)
  const candidates = columns.filter((c) => c.role.kind === 'taxon' && c.role.header === true && c.confidence === 'low').length;
  const named = columns.filter((c) => c.role.kind === 'taxon').length - candidates;
  if (named > 0) return false;
  const variables = columns.filter((c) => c.role.kind === 'variable' && c.role.variable.trim() !== '').length;
  if (!(kinds.has('station') && (kinds.has('depth') || kinds.has('pressure') || kinds.has('depthBelowSeafloor')) && variables > 0)) return false;
  return candidates === 0 || (variables >= 2 && candidates < variables);
}
