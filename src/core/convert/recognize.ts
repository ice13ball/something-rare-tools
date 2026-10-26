// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { dwcTermOf, proposeColumns, toMapping, unitFromHeader } from '../recognize/columns';
import type { ProposeContext } from '../recognize/columns';
import { foldDiacritics, headerKey, isCanonicalKey } from '../recognize/vocab';
import { CONVERTER_VARIABLES, conceptVariable, foldUnit, isAbundanceUnit, isDecibar } from './vocab';
import { isPercentUnit, verifiedConcept } from './nerc';
import { SEDIMENT_CONTEXT, isPlainDepthName, isSeafloorName, isSiteDepthName, seafloorUnitOf } from './seafloor';
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

const TAXON_NAME = /^(species|taxon|taxa|gatunek|takson|art|espece)( name| nom| name)?$/;
// the unambiguous quantity words may carry a tail ("abundance ind"); the short ones only stand alone
const QUANTITY_STANDALONE = /^(count|counts|anzahl|nombre|comptage)$/;
// whole-header phrases of two or more words (an optional unit in brackets is cut off before the match): "Liczba osobników", "Liczba os.", "Anzahl Individuen",
// "Nombre d'individus" are counts, "Individuendichte" a density. "Liczba prób", "Anzahl Proben", "Nombre d'échantillons", "Liczba gatunków", "Anzahl Arten" count
// something else (samples, species) and match nothing here.
const QUANTITY_PHRASE_COUNT = /^(liczba osobnikow|liczba os|anzahl individuen|nombre d individus)$/;
const QUANTITY_PHRASE_DENSITY = /^(individuendichte)$/;
const QUANTITY_WORD = /^(abundance|abundanz|abondance|density|densite|dichte|zageszczenie|liczebnosc|biomass|biomasa|biomasse)( .*)?$/;
const EFFORT_VOLUME = /^(volume filtered|volume sampled|sampled volume|volume|objetosc|objetosc przefiltrowana|volumen|volumen filtriert|volume filtre|volume echantillonne)$/;
const EFFORT_AREA = /^(area|area sampled|sampled area|swept area|area swept|powierzchnia|flache|surface|surface echantillonnee)$/;
// a plain "Area" is a place name on a sheet with no taxa; only a header that says sampled or swept is an effort there
const PLAIN_AREA = /^(area|powierzchnia|flache|surface)$/;
// the words that mean the water, not an abundance, when a "density" header names them; and the units of a seawater density (mass per volume)
const SEAWATER_DENSITY_NAME = /^(density|seawater density|sea water density|water density|in situ density|density of seawater|gestosc wody|gestosc wody morskiej|dichte|wasserdichte|meerwasserdichte|masse volumique|masse volumique de l eau)$/;
const SEAWATER_DENSITY_ONLY = /^(seawater density|sea water density|water density|in situ density|density of seawater|gestosc wody|gestosc wody morskiej|wasserdichte|meerwasserdichte|masse volumique de l eau)$/;
const isSeawaterDensityUnit = (unit: string | undefined): boolean => unit !== undefined && /^(kg\/m3|g\/cm3|g\/ml|kg\/l)$/.test(foldUnit(unit));

// a summary column is never proposed as a species: its header (after the key folding: case, diacritics, punctuation) STARTS with one of these words,
// or holds total / suma / razem / gesamt as a separate word ("Total copepods", "Abundance, total", "Razem Copepoda"). "Totalia sp." is a genus and stays.
const SUMMARY_FIRST = new Set(['total', 'suma', 'razem', 'summe', 'gesamt', 'somme', 'sum']);
const SUMMARY_ANYWHERE = new Set(['total', 'suma', 'razem', 'gesamt']);
function isSummaryHeader(rawName: string): boolean {
  const name = rawName.trim();
  if (/^[σΣ]/.test(name)) return true;
  const words = headerKey(name).split(' ').filter((w) => w !== '');
  return words.length > 0 && (SUMMARY_FIRST.has(words[0]) || words.some((w) => SUMMARY_ANYWHERE.has(w)));
}
// the sample code of a row: PANGAEA's "Sample label (Multinet number)" and "Sample code/label" (the bracket text after the name is cut off before the match)
// (German whole headers: "Nr. der Probe", "Probennummer", "Proben-Nr.", "Probe Nr.", "Proben-ID"; /check's columns.ts is not changed for them)
const SAMPLE_CODE_NAME = /^(sample label|sample code|sample code label|sample name|sample id|sample number|nr der probe|probennummer|proben nr|probe nr|proben id)$/;
// "Stage" and its translations: the life stage of the record (a long sheet)
const STAGE_NAME = /^(stage|life stage|lifestage|stadium|stadium rozwojowe|entwicklungsstadium|stade|stade de developpement)$/;

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

/** The three spellings of a WoRMS AphiaID header, exactly (no other header is read as one). */
const APHIA_HEADERS = new Set(['AphiaID', 'aphia_id', 'Aphia ID']);

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
const PRESENCE_MARK = /^(\+|x|\*)$/i;

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
  'eventid-used': 'the Darwin Core eventID column is used as the sample code',
  'taxon-marks': 'cells are presence marks (+, x) and numbers: its header may be a taxon (confirm all taxon columns at once)',
  'taxon-numeric': 'numeric column with an unrecognised name: its header may be a taxon (confirm all taxon columns at once)',
  'summary-header': 'its header reads as a total or a sum, so it is not proposed as a taxon (mark it as one yourself if it is)',
  'summary-total': 'a sum or total column: converting it would count the same individuals twice, so it starts as ignored (choose another meaning if it is not one)',
  'quality-column': 'name says a quality flag or a quality column, which is not a measurement: ignored',
  'seafloor-depth-name': 'name says depth below the seafloor (in the sediment): written as a negative distance in metres, and a negative number counted downwards (above the seafloor) as a positive one',
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

/** A column in decibars that the proposer took for an unknown variable (a pressure the overlay reads as a pressure, not as a species). */
const isUnitPressure = (q: ColumnProposal): boolean => q.role.kind === 'variable' && !isCanonicalKey(q.role.variable) && q.role.p01 === undefined && isDecibar(q.role.unit ?? unitFromHeader(q.header).unit);

/** A vertical coordinate of the proposer's own reading: a depth (not an elevation or altitude), a pressure, or a column in decibars. */
const isVerticalProposal = (q: ColumnProposal): boolean => (q.role.kind === 'depth' && q.reasonCode !== 'name-elevation') || q.role.kind === 'pressure' || isUnitPressure(q);

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
  const mlPerLAt = new Map<number, string>(sheet.header.flatMap((h, i) => { const m = /^(.*\S)[_ ]ml[_ ]l$/i.exec(h.trim()); return m ? [[i, `${m[1]} [mL/L]`] as [number, string]] : []; }));
  const sedCtx = sedimentContext(sheet);
  // The shared proposer has ONE plain-depth slot, and the water depth of the site ("Water depth", "Station depth") can take it from the column that gives the depth of each row. When the sheet has
  // another vertical coordinate (what the proposer itself finds when the site-depth headers are left out), the proposer is asked without them, so that its own preference picks the real depth
  // column (name tier, then the leftmost); the site depth is then ignored by the rule below. A sediment sheet is not masked (there the site depth is the depth by design), and neither is a sheet
  // whose only other "depth" is an elevation or an altitude (the converter has no role for it).
  const siteAt = new Set(sheet.header.flatMap((h, i) => (dwcTermOf(h) === undefined && isSiteDepthName(unitFromHeader(h).name) ? [i] : [])));
  const seafloorPre = sheet.header.some((h) => {
    const hu = unitFromHeader(h);
    return dwcTermOf(h) === undefined && (isSeafloorName(hu.name) || (sedCtx && isPlainDepthName(hu.name) && seafloorUnitOf(hu.unit) === 'cm'));
  });
  const rewritten = occurrenceIdAt.size > 0 || mlPerLAt.size > 0;
  const askedWith = (maskSite: boolean): { proposals: ColumnProposal[] } => {
    const masked = maskSite ? siteAt : new Set<number>();
    const asked = !rewritten && masked.size === 0 ? sheet : { ...sheet, header: sheet.header.map((h, i) => (occurrenceIdAt.has(i) || masked.has(i) ? `__column ${i + 1}` : (mlPerLAt.get(i) ?? h))) };
    return { proposals: proposeColumns(asked, ctx).map((p) => (occurrenceIdAt.has(p.index) || mlPerLAt.has(p.index) || masked.has(p.index) ? { ...p, header: sheet.header[p.index], cleanHeader: sheet.header[p.index] } : { ...p }))};
  };
  let asked0 = siteAt.size > 0 && !seafloorPre ? askedWith(true) : undefined;
  if (asked0 !== undefined && !asked0.proposals.some(isVerticalProposal)) asked0 = undefined;
  const base = (asked0 ?? askedWith(false)).proposals;
  const qualityAt = new Set<number>();
  const seafloorAt = new Map<number, 'seafloor-depth-name' | 'seafloor-depth-cm'>();
  const siteDepthAt = new Set<number>();
  const plainAreaAt = new Set<number>();
  const claims = new Map<number, Claim>();
  const bounds = new Map<number, 'min' | 'max'>();
  let dwcEventId = -1;

  for (const p of base) {
    const hu = unitFromHeader(p.header);
    const key = headerKey(hu.name);
    const term = dwcTermOf(p.header);
    const dwc = term === undefined ? undefined : dwcClaim(term);
    if (!dwc && term === undefined) {
      if (isQualityHeader(p.header, sheet.header)) {
        qualityAt.add(p.index);
        continue;
      }
      const depthUnit = hu.unit ?? (p.role.kind === 'depth' ? p.role.unit : undefined);
      if (isSeafloorName(hu.name)) {
        seafloorAt.set(p.index, 'seafloor-depth-name');
        continue;
      }
      if (sedCtx && isPlainDepthName(hu.name) && seafloorUnitOf(depthUnit) === 'cm') {
        seafloorAt.set(p.index, 'seafloor-depth-cm');
        continue;
      }
      if (isSiteDepthName(hu.name)) {
        siteDepthAt.add(p.index);
        continue;
      }
    }
    if (!dwc && APHIA_HEADERS.has(p.header.trim()) && holdsAphiaIds(sheet, p.index)) {
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
      const bound = depthBoundOfName(foldDiacritics(key));
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

  // depth: the winner of the shared slot says which direction the sheet counts
  const sharedDepth = base.find((p) => p.role.kind === 'depth' && p.role.bound === undefined)?.role;
  const sheetPositive = sharedDepth && sharedDepth.kind === 'depth' ? sharedDepth.positive : 'unknown';

  const hasRange = [...bounds.values()].includes('min') && [...bounds.values()].includes('max');
  // another column that gives the depth of each row (a plain depth or a bound): then the water depth of the site is not the sheet's depth
  // (ANY vertical coordinate counts: a plain depth, a top or bottom bound, a DwC minimum / maximum depth, a pressure; a depth below the seafloor makes the sheet a sediment sheet)
  const pressureByUnit = new Set(base.filter(isUnitPressure).map((q) => q.index));
  const otherDepth = base.some((q) => !siteDepthAt.has(q.index) && !seafloorAt.has(q.index) && (q.role.kind === 'depth' || q.role.kind === 'pressure' || bounds.has(q.index) || pressureByUnit.has(q.index)));
  let siteDepthTaken = false;
  const hasLongTaxon = [...claims.values()].some((c) => c.role.kind === 'taxon');
  const seenQuantity = new Set<number>();
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
      const unit = hdr.unit ?? (p.role.kind === 'depth' ? p.role.unit : undefined);
      // the direction the numbers count, read from the DATA and shown as a proposal the user can change: all numbers at or below zero (and some below) means they count upwards from the
      // seafloor, so a depth below it is negative; anything else is the usual depth below (positive)
      const up = countsUpwards(sheet, p.index, ctx.decimalComma);
      p.role = { kind: 'depthBelowSeafloor', ...(unit === undefined ? {} : { unit }), ...(up ? { positive: 'up' as const } : {}) };
      p.confidence = up || seafloorCode === 'seafloor-depth-cm' ? 'low' : 'high'; // a guess from the sheet's context or the data shows its reason
      if (up) why(p, 'seafloor-depth-negative');
      else if (seafloorCode === 'seafloor-depth-cm') why(p, 'seafloor-depth-cm');
      else why(p, 'seafloor-depth-name');
      continue;
    }
    if (siteDepthAt.has(p.index)) {
      const unit = hdr.unit ?? (p.role.kind === 'depth' ? p.role.unit : undefined);
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
      const unit = dwcDepth ? 'm' : (was?.unit ?? hu.unit);
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
    // a column in decibars is a pressure (the proposer took "Sea pressure [dbar]" and "CTDPRS [dbar]" for unknown variables, which would be species candidates here)
    if (pressureByUnit.has(p.index) && claim === undefined && p.role.kind === 'variable') {
      const unit = p.role.unit ?? hdr.unit;
      p.role = { kind: 'pressure', ...(unit === undefined ? {} : { unit }) };
      p.confidence = 'low'; // so that the page shows the reason
      why(p, 'pressure-unit');
      continue;
    }
    // oxygen as a percentage is SATURATION: a variable of its own, never given a concentration concept (a concept that says "per unit volume" is another quantity)
    if (p.role.kind === 'variable' && p.role.variable === 'oxygen' && ((p.role.unit !== undefined && isPercentUnit(p.role.unit)) || /saturation|sattigung|nasycenie/i.test(foldDiacritics(p.header)))) {
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
    const headerName = unitFromHeader(p.header).name.trim();
    const summaryHeader = isSummaryHeader(headerName);
    // a sum or total column that the shared proposer took for a measured variable (and that is not a standard variable): it adds up other columns,
    // so converting it would count the same individuals twice. It starts as ignored, with its reason; the user can still give it another meaning,
    // and then it is their decision. A column of presence marks keeps the shared role (ignore); the page says why it is not a taxon candidate.
    if (summaryHeader && p.role.kind === 'variable' && !isCanonicalKey(p.role.variable) && (conceptVariable(p.role.variable) === undefined || isAbundanceUnit(p.role.unit)) && p.role.p01 === undefined) {
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
      p.role = { kind: 'taxon', header: true };
      p.confidence = 'low';
      why(p, 'taxon-numeric');
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
