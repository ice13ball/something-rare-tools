// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { unitFromHeader } from '../recognize/columns';
import { geocodeOfKey } from '../recognize/geocodes';
import { CANONICAL_VARIABLES, foldDiacritics, headerKey, normaliseUnit, unitDimension } from '../recognize/vocab';
import type { ColumnProposal, ColumnRole, RawSheet } from '../types';
import { detectDayMonthOrder, parseDate, parseTimeCell } from '../values/dates';
import { parseNumber } from '../values/numbers';
import { EFFORT_AREA, EFFORT_VOLUME, PLAIN_AREA, QUANTITY_PHRASE_COUNT, QUANTITY_PHRASE_DENSITY, QUANTITY_STANDALONE, QUANTITY_WORD, SAMPLE_CODE_NAME, STAGE_NAME, TAXON_NAME } from './recognize';

/*
 * What of a column proposal is a STATED fact, and what is only a guess.
 *
 * `proposeConvertColumns` stays the source of suggestions (it reads names, units and values and is right most of the time). A suggestion is not a fact: the cells of a file
 * cannot say whether a repeated number is a total or a count, so a role that rests on values is something to ASK. A role is STATED when the file itself says it, by NAME only:
 *   - an exact Darwin Core term (the whole term list), compared after folding case and underscores;
 *   - an exact vocabulary entry for the role (the whole name, not a name that merely contains a word); an abbreviation of two letters or fewer ("NA", "T", "S", "Si", "DO") and a plain
 *     "Density" are entries only with a unit in the header, a plain "Area" or "Volume" likewise;
 *   - in a PANGAEA file: its geocodes, and the names Event, Depth top, Depth bot and Campaign.
 * Cells may only REMOVE a stated role, never add one and never add a property to it: a stated role whose cells contradict it (a "time" column that holds dates with a time, a header "NA"
 * over species names, "Area" over place names, "Month" with a 13) is not stated, and the column is then asked. It is never handed to another role. A sign of a depth that is read from
 * values is no fact: the role stays stated when the name states it, its direction is "unknown", and `ask` says that the direction is to be asked.
 *
 * A name that states a role takes that role in the stated layer even where the proposer gave the column another (an exact `Scientific_Name` is the taxon whatever the proposer suggests);
 * the proposer itself is not touched. Nothing here sets a role the name does not give, and no stated role is `ignore` for a column whose name gives a role.
 *
 * `withStated` copies the proposals and marks the stated ones with `stated: true`. It is a MARK and nothing else: no role is changed, none is made unassigned, none is handed to another
 * column (the roles of the copies are exactly those of `proposeConvertColumns`). A column is marked only where the role the PROPOSER gave is the role the name states (a Date column
 * proposed as a datetime is the same family; a name that states a role the proposer did not give marks nothing). `StatedInfo.role` is what the name would give, kept for the tests and
 * for whoever reads the analysis; nothing reads it to set a role.
 */

export type StatedBasis = 'darwin-core' | 'vocabulary' | 'header-unit' | 'geocode' | 'pangaea';
export type StatedVeto = 'not-numeric' | 'not-time-of-day' | 'not-date' | 'date-part-values';

export interface StatedInfo {
  index: number;
  stated: boolean;
  basis?: StatedBasis;
  /** The role of the stated layer: what the name gives (the proposal's own role where it agrees, else the role the name means). Present when `stated`. */
  role?: ColumnRole;
  /** The cells contradicted a role the name states. */
  vetoed?: StatedVeto;
  /** The role kind the NAME states, whatever the proposal says (a Month column that today falls back to a variable still states "datePart"). */
  nameStates?: string;
  /** What is still to be asked of a stated column: the direction of a depth whose sign the proposer read from values. */
  ask?: 'depth-direction'[];
}

export interface StatedContext {
  decimalComma: boolean;
  date1904?: boolean;
  /** The file is a PANGAEA table: its geocodes and event names are stated facts. */
  pangaea?: boolean;
}

/** A Darwin Core term is compared after folding case and underscores only: `Decimal_Latitude` is decimalLatitude, `Decimal Latitude` (a space) is not a term. */
const foldTerm = (name: string): string => name.trim().toLowerCase().replace(/_/g, '');

/** Every term of the Darwin Core standard (and the DwC extensions' own bookkeeping names are not here): a column that is exactly one of them is answered. */
const DWC_TERMS: ReadonlySet<string> = new Set('type modified language license rightsHolder accessRights bibliographicCitation references institutionID collectionID datasetID institutionCode collectionCode datasetName ownerInstitutionCode basisOfRecord informationWithheld dataGeneralizations dynamicProperties occurrenceID catalogNumber recordNumber recordedBy recordedByID individualCount organismQuantity organismQuantityType sex lifeStage reproductiveCondition caste behavior vitality establishmentMeans degreeOfEstablishment pathway georeferenceVerificationStatus occurrenceStatus associatedMedia associatedOccurrences associatedReferences associatedTaxa otherCatalogNumbers occurrenceRemarks organismID organismName organismScope associatedOrganisms previousIdentifications organismRemarks materialEntityID materialEntityRemarks verbatimLabel materialSampleID sampleSizeValue sampleSizeUnit samplingEffort samplingProtocol eventID parentEventID eventType fieldNumber eventDate eventTime startDayOfYear endDayOfYear year month day verbatimEventDate habitat fundingAttribution fundingAttributionID fieldNotes eventRemarks locationID higherGeographyID higherGeography continent waterBody islandGroup island country countryCode stateProvince county municipality locality verbatimLocality minimumElevationInMeters maximumElevationInMeters verbatimElevation verticalDatum minimumDepthInMeters maximumDepthInMeters verbatimDepth minimumDistanceAboveSurfaceInMeters maximumDistanceAboveSurfaceInMeters locationAccordingTo locationRemarks decimalLatitude decimalLongitude geodeticDatum coordinateUncertaintyInMeters coordinatePrecision pointRadiusSpatialFit verbatimCoordinates verbatimLatitude verbatimLongitude verbatimCoordinateSystem verbatimSRS footprintWKT footprintSRS footprintSpatialFit georeferencedBy georeferencedDate georeferenceProtocol georeferenceSources georeferenceRemarks geologicalContextID identificationID verbatimIdentification identificationQualifier typeStatus identifiedBy identifiedByID dateIdentified identificationReferences identificationVerificationStatus identificationRemarks taxonID scientificNameID acceptedNameUsageID parentNameUsageID originalNameUsageID nameAccordingToID namePublishedInID taxonConceptID scientificName acceptedNameUsage parentNameUsage originalNameUsage nameAccordingTo namePublishedIn namePublishedInYear higherClassification kingdom phylum class order superfamily family subfamily tribe subtribe genus genericName subgenus infragenericEpithet specificEpithet infraspecificEpithet cultivarEpithet taxonRank verbatimTaxonRank scientificNameAuthorship vernacularName nomenclaturalCode taxonomicStatus nomenclaturalStatus taxonRemarks measurementID measurementType measurementValue measurementAccuracy measurementUnit measurementDeterminedBy measurementDeterminedDate measurementMethod measurementRemarks measurementTypeID measurementValueID measurementUnitID associatedSequences'.split(' ').map((t) => t.toLowerCase()));

/** The role kinds an exact Darwin Core term means in this converter; a term it does not read means "no role" (it counts as answered when the column is ignored). */
const DWC_KINDS: Record<string, readonly string[]> = {
  // (verbatimLatitude / verbatimLongitude are text in any notation, never the position; locationID is an identifier of a place, not the station of this converter; organismQuantity is a
  // quantity only where individualCount is not: neither is listed, so they are asked, or ignored where the tool does not write them)
  decimallatitude: ['latitude'], decimallongitude: ['longitude'], eventdate: ['date', 'datetime'], eventtime: ['time'],
  minimumdepthinmeters: ['depth'], maximumdepthinmeters: ['depth'], occurrenceid: ['occurrenceId', 'sampleId'], eventid: ['sampleId'], scientificname: ['taxon'],
  individualcount: ['quantity'], organismquantitytype: ['quantityType'], lifestage: ['lifeStage'], identificationqualifier: ['qualifier'], scientificnameid: ['taxonId'],
};

/** Ordinary words that are Darwin Core terms too: a column with such a name is a term only in a sheet that has at least two other exact terms beside it. */
const AMBIGUOUS_DWC = new Set(['type', 'sex', 'habitat', 'class', 'order', 'family', 'genus', 'kingdom', 'phylum', 'language', 'license', 'references', 'country', 'continent', 'island', 'county', 'modified', 'behavior', 'pathway', 'vitality', 'locality', 'municipality', 'preparations']);

/* ---------- units, by name ---------- */

type UnitClass = 'temperature' | 'salinity' | 'concentration' | 'filtered-volume';
const CONCENTRATION = /^(?:[mµunp]?mol|[mµnpk]?g|ppm|ppb)\s*[/ ]\s*(?:[mµ]?l|kg|m3|m\*\*3|m\^3|g)$/i;
const FILTERED_VOLUME = /^(?:m3|m\*\*3|m\^3|m³|l|ml|cm3|dm3|litres?|liters?)$/i;

/** Does a unit of the header belong to the kind of quantity its name states? (By the text of the unit; no cell is read.) */
function unitIs(unit: string, kind: UnitClass): boolean {
  const u = normaliseUnit(unit) ?? unit.trim();
  const dim = unitDimension(u);
  switch (kind) {
    case 'temperature':
      return dim === 'temperature' || /^(?:°?C|deg ?C|K|°F)$/i.test(u);
    case 'salinity':
      return /^(?:PSU|‰|PSS-?78|ppt|g\/kg|1)$/i.test(u);
    case 'concentration':
      return dim === 'amount/volume' || dim === 'mass/volume' || dim === 'amount/mass' || CONCENTRATION.test(u);
    case 'filtered-volume':
      return FILTERED_VOLUME.test(u);
  }
}

/** The kind of unit a canonical variable's name needs, or undefined where the name carries no such demand (pH has none). */
function unitClassOf(canonical: string): UnitClass | undefined {
  if (canonical === 'temperature') return 'temperature';
  if (canonical === 'salinity') return 'salinity';
  if (canonical === 'pH' || canonical === 'density' || canonical === 'TA' || canonical === 'pCO2') return undefined;
  return 'concentration';
}

/** The canonical variable a name is, when the WHOLE name is one of its entries ("temperature", "na", "o2"; not "temperature at 5 m"). */
function canonicalExact(key: string): string | undefined {
  for (const c of CANONICAL_VARIABLES) {
    for (const p of c.headerPatterns) {
      const m = p.exec(key);
      if (m !== null && m[0].length === key.length) return c.key;
    }
  }
  return undefined;
}

const NAME_SETS: Record<string, readonly string[]> = {
  // breitengrad / laengengrad / szerokosc geograficzna / dlugosc geograficzna: whole names the proposer reads as a position by the name alone (LAT_SAFE, LON_SAFE). The bare Breite, Laenge,
  // Szerokosc and Dlugosc, and the authors' compounds (Latitude_dd, LatStart), are not entries: they stay listed.
  latitude: ['latitude', 'lat', 'breitengrad', 'szerokosc geograficzna'],
  longitude: ['longitude', 'lon', 'long', 'lng', 'langengrad', 'laengengrad', 'dlugosc geograficzna'],
  date: ['date'],
  datetime: ['datetime', 'date time'],
  time: ['time'],
  depth: ['depth'],
  pressure: ['pressure'],
  station: ['station'],
  cruise: ['cruise'],
};
/** The scientific name of a taxon, in the four languages of the page. The proposer reads it from the cells (Latin names), so the name states the taxon only where the proposal is a taxon. */
const SCIENTIFIC_NAMES: ReadonlySet<string> = new Set(['scientific name', 'nom scientifique', 'wissenschaftlicher name', 'nazwa naukowa']);
/** `Date (UTC)`: the time-zone note in round brackets that the proposer reads (`date utc`); in square brackets the note is already taken as a unit. Nothing else is a note: `Date (GMT)` stays listed. */
const DATE_UTC_NOTE = /^date\s*\(\s*utc\s*\)$/i;
const DATE_PART_NAMES: Record<string, 'year' | 'month' | 'day'> = { year: 'year', month: 'month', day: 'day' };
/** The names that mean something in a PANGAEA table and nowhere else. */
const PANGAEA_NAMES: Record<string, string> = { event: 'station', 'depth top': 'depth-min', 'depth bot': 'depth-max', campaign: 'cruise' };

/** The name of the column without its unit, folded to the key the vocabulary is compared with. */
function nameKey(header: string): { key: string; unit: string | undefined; name: string } {
  const u = unitFromHeader(header);
  return { key: foldDiacritics(headerKey(u.name)), unit: u.unit ?? u.unitText, name: u.name };
}

interface Named {
  /** The role kinds the name means ('depth-min' / 'depth-max' stand for a depth bound). Empty for a Darwin Core term the converter does not read. */
  meant: string[];
  basis: StatedBasis;
  term?: string;
}

/** What role the NAME alone states (an exact vocabulary entry), with the basis; undefined when the name states none. */
interface SheetFacts {
  /** The sheet has the exact term scientificName. */
  dwcTaxon: boolean;
  /** The sheet has the exact term individualCount. */
  individualCount: boolean;
  /** How many exact Darwin Core terms that are not ordinary words the header has. */
  dwcTerms: number;
}

function nameRole(header: string, ctx: StatedContext, facts: SheetFacts): Named | undefined {
  const dwcTaxon = facts.dwcTaxon;
  const { key, unit, name } = nameKey(header);
  if (DATE_PART_NAMES[key] !== undefined) return { meant: ['datePart'], basis: 'vocabulary' };
  const term = foldTerm(name.replace(/\s*[[(][^[\]()]*[\])]\s*$/, ''));
  if (DWC_TERMS.has(term) && !(AMBIGUOUS_DWC.has(term) && facts.dwcTerms < 2)) {
    // organismQuantity is the quantity only where there is no individualCount
    const meant = term === 'organismquantity' ? (facts.individualCount ? [] : ['quantity']) : [...(DWC_KINDS[term] ?? [])];
    return { meant, basis: 'darwin-core', term };
  }
  if (ctx.pangaea === true) {
    const p = PANGAEA_NAMES[key];
    if (p !== undefined) return { meant: [p], basis: 'pangaea' };
    if (geocodeOfKey(key) !== undefined) return { meant: ['geocode'], basis: 'geocode' };
  }
  for (const [kind, set] of Object.entries(NAME_SETS)) if (set.includes(key)) return { meant: [kind], basis: 'vocabulary' };
  if (DATE_UTC_NOTE.test(name.trim()) || DATE_UTC_NOTE.test(header.trim())) return { meant: ['date'], basis: 'vocabulary' };
  if (SCIENTIFIC_NAMES.has(key)) return dwcTaxon ? undefined : { meant: ['taxon'], basis: 'vocabulary' };
  // a header that has the exact term scientificName beside it states the taxon: a second taxon-like column ("species") is then not stated
  if (TAXON_NAME.test(key)) return dwcTaxon ? undefined : { meant: ['taxon'], basis: 'vocabulary' };
  if (QUANTITY_STANDALONE.test(key) || QUANTITY_PHRASE_COUNT.test(key) || QUANTITY_PHRASE_DENSITY.test(key)) return { meant: ['quantity'], basis: 'vocabulary' };
  const q = QUANTITY_WORD.exec(key);
  if (q !== null && q[2] === undefined) {
    // a plain "Density" is also the density of the water: stated only with a unit
    if (q[1].startsWith('dens') && unit === undefined) return undefined;
    return { meant: [q[1].startsWith('biomass') || q[1] === 'biomasa' || q[1] === 'biomasse' ? 'biomass' : 'quantity'], basis: 'vocabulary' };
  }
  if (SAMPLE_CODE_NAME.test(key) || key === 'sample') return { meant: ['sampleId'], basis: 'vocabulary' };
  if (STAGE_NAME.test(key)) return { meant: ['lifeStage'], basis: 'vocabulary' };
  if (EFFORT_VOLUME.test(key) || EFFORT_AREA.test(key)) {
    // "Area", "Volume" and "Surface" alone are also a place and a size: stated only with a unit in the header
    const ambiguous = PLAIN_AREA.test(key) || key === 'volume' || key === 'volumen';
    if (ambiguous && unit === undefined) return undefined;
    // a plain volume is the volume FILTERED only in a unit of water (m3, L ...): "Volume [mm3]" is a size
    if ((key === 'volume' || key === 'volumen') && unit !== undefined && !unitIs(unit, 'filtered-volume')) return undefined;
    return { meant: ['effort'], basis: ambiguous ? 'header-unit' : 'vocabulary' };
  }
  const canonical = canonicalExact(key);
  if (canonical !== undefined) {
    const short = key.replace(/ /g, '').length <= 2;
    // "NA", "T", "S", "Si", "DO" are also a footnote, a code, a species: an abbreviation is an entry only with a unit in the header (pH has none to give)
    if (short && unit === undefined && canonical !== 'pH') return undefined;
    // and the unit has to be one of the quantity the name states: T [min], T [years], S [#], S [cm], NA [#] are not temperature, salinity or sodium
    const need = unitClassOf(canonical);
    if (unit !== undefined && need !== undefined && !unitIs(unit, need)) return undefined;
    return { meant: ['variable'], basis: unit === undefined ? 'vocabulary' : 'header-unit' };
  }
  return undefined;
}

/* ---------- the cells ---------- */

const NUMERIC_ROLES = new Set(['latitude', 'longitude', 'depth', 'depth-min', 'depth-max', 'pressure', 'depthBelowSeafloor', 'effort', 'quantity', 'biomass', 'variable']);
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'sty', 'lut', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paz', 'lis', 'gru', 'mrz', 'okt', 'dez', 'janv', 'fev', 'avr', 'mai', 'juin', 'juil', 'aou', 'sept', 'nov', 'dec'];
const SHARE = 0.5;

const cellsOf = (sheet: RawSheet, index: number): (string | number)[] =>
  sheet.rows.flatMap((r) => {
    const c = r.cells[index] ?? null;
    return c === null || (typeof c === 'string' && c.trim() === '') ? [] : [c];
  });

/** The share of the non-blank, non-NA cells that read as numbers; undefined when there are none to judge. */
function numericShare(cells: readonly (string | number)[], decimalComma: boolean): number | undefined {
  let ok = 0;
  let text = 0;
  for (const c of cells) {
    const p = parseNumber(c, decimalComma);
    if (p.status === 'ok') ok++;
    else if (p.status === 'non-numeric') text++;
  }
  return ok + text === 0 ? undefined : ok / (ok + text);
}

function monthValue(c: string | number): number | undefined {
  if (typeof c === 'number') return Number.isInteger(c) && c >= 1 && c <= 12 ? c : undefined;
  const t = c.trim();
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    return n >= 1 && n <= 12 ? n : undefined;
  }
  const i = MONTH_NAMES.indexOf(foldDiacritics(t).toLowerCase().slice(0, 4).replace(/\.$/, ''));
  const j = i >= 0 ? i : MONTH_NAMES.indexOf(foldDiacritics(t).toLowerCase().slice(0, 3));
  return j < 0 ? undefined : (j % 12) + 1;
}
const wholeNumber = (c: string | number): number | undefined => {
  const n = typeof c === 'number' ? c : /^\d+$/.test(c.trim()) ? Number(c.trim()) : NaN;
  return Number.isInteger(n) ? n : undefined;
};
const daysIn = (year: number | undefined, month: number): number => (month === 2 ? (year !== undefined && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : year === undefined ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31);

/** Do the Year / Month / Day columns together read as dates? Judged row by row, so a 13th month and a 31st of February both count as wrong. */
function datePartsValid(sheet: RawSheet, cols: Partial<Record<'year' | 'month' | 'day', number>>): number | undefined {
  let rows = 0;
  let valid = 0;
  for (const r of sheet.rows) {
    const get = (i: number | undefined): string | number | undefined => {
      if (i === undefined) return undefined;
      const c = r.cells[i] ?? null;
      return c === null || (typeof c === 'string' && c.trim() === '') ? undefined : c;
    };
    const y = get(cols.year);
    const m = get(cols.month);
    const d = get(cols.day);
    if (y === undefined && m === undefined && d === undefined) continue;
    rows++;
    const year = y === undefined ? undefined : wholeNumber(y);
    const month = m === undefined ? undefined : monthValue(m);
    const day = d === undefined ? undefined : wholeNumber(d);
    const yearOk = y === undefined || (year !== undefined && year >= 1000 && year <= 2999);
    const monthOk = m === undefined || month !== undefined;
    const dayOk = d === undefined || (day !== undefined && day >= 1 && day <= (month === undefined ? 31 : daysIn(year, month)));
    if (yearOk && monthOk && dayOk) valid++;
  }
  return rows === 0 ? undefined : valid / rows;
}

/**
 * The reason the cells of column `index` contradict the role kind, or undefined. A date or a time is judged by the reader that WRITES it (core/values/dates.ts, with the options
 * dataset.ts passes it), so the veto cannot say no to a cell the writer reads: a number written YYYYMMDD, a month name, a time with a zone.
 */
function veto(sheet: RawSheet, index: number, kind: string, ctx: StatedContext): StatedVeto | undefined {
  const cells = cellsOf(sheet, index);
  if (cells.length === 0) return undefined;
  if (NUMERIC_ROLES.has(kind)) {
    const share = numericShare(cells, ctx.decimalComma);
    return share !== undefined && share < SHARE ? 'not-numeric' : undefined;
  }
  if (kind === 'time') {
    if (sheet.timeFormatted?.[index] === true) return undefined;
    const ok = cells.filter((c) => !('error' in parseTimeCell(c))).length;
    return ok / cells.length < SHARE ? 'not-time-of-day' : undefined;
  }
  if (kind === 'date' || kind === 'datetime') {
    const order = detectDayMonthOrder(sheet.rows.map((r) => r.cells[index] ?? null));
    const opts = { date1904: ctx.date1904 === true, dateFormatted: sheet.dateFormatted?.[index] === true, datumColumn: true, ...(order === 'unknown' ? {} : { order }) };
    const ok = cells.filter((c) => !('error' in parseDate(c, opts))).length;
    return ok / cells.length < SHARE ? 'not-date' : undefined;
  }
  return undefined;
}

/* ---------- the roles ---------- */

/** The role a name means, built from the name alone. A kind that needs more than a name (a measured variable) has none. */
function roleFor(kind: string, header: string, term?: string): ColumnRole | undefined {
  const unit = unitFromHeader(header).unit;
  const u = unit === undefined ? {} : { unit };
  switch (kind) {
    case 'latitude': case 'longitude': case 'date': case 'datetime': case 'time': case 'station': case 'cruise': case 'sampleId': case 'occurrenceId': case 'quantity': case 'quantityType': case 'lifeStage': case 'qualifier': case 'taxonId':
      return { kind } as ColumnRole;
    case 'taxon':
      return { kind: 'taxon' };
    case 'depth':
      // Darwin Core minimum / maximum depth are metres below the surface; a bare "depth" does not say which way
      return term === 'minimumdepthinmeters' ? { kind: 'depth', positive: 'down', unit: 'm', bound: 'min' } : term === 'maximumdepthinmeters' ? { kind: 'depth', positive: 'down', unit: 'm', bound: 'max' } : { kind: 'depth', positive: 'unknown', ...u };
    case 'depth-min':
      return { kind: 'depth', positive: 'down', ...u, bound: 'min' };
    case 'depth-max':
      return { kind: 'depth', positive: 'down', ...u, bound: 'max' };
    case 'effort':
      return { kind: 'effort', ...u };
    case 'pressure':
      return { kind: 'pressure', ...u };
    default:
      return undefined;
  }
}

/** The kind of role a PANGAEA geocode gives a column, by its effect. */
function geocodeRole(key: string, header: string, proposed: ColumnRole): ColumnRole | undefined {
  const g = geocodeOfKey(key);
  if (g === undefined) return undefined;
  const unit = unitFromHeader(header).unit;
  const u = unit === undefined ? {} : { unit };
  switch (g.effect) {
    case 'water-depth':
      return { kind: 'depth', positive: 'down', ...u };
    case 'sediment-depth':
      return { kind: 'depthBelowSeafloor', ...u };
    case 'elevation':
      return proposed.kind === 'depth' ? proposed : { kind: 'depth', positive: 'up', ...u };
    default:
      // soil, ice, a height or a distance: the geocode names a quantity, not a role the converter has; the proposal stays a suggestion unless it is a role of its own
      return proposed.kind === 'ignore' ? undefined : proposed;
  }
}

/** The stated layer's depth: a direction read from VALUES is no fact (the name, a Darwin Core depth, a geocode or an elevation states one; nothing else). */
function depthStated(role: ColumnRole, p: ColumnProposal, nameGivesDirection: boolean): { role: ColumnRole; ask?: 'depth-direction'[] } {
  if (role.kind !== 'depth') return { role };
  const byName = nameGivesDirection || p.reasonCode === 'name-elevation';
  if (byName || role.positive === 'unknown') return { role };
  return { role: { ...role, positive: 'unknown' }, ...(role.positive === 'up' ? { ask: ['depth-direction' as const] } : {}) };
}

/**
 * For every proposal: is its role stated, on what basis, with which role, did the cells veto it. A name that states a role the proposal does not hold (a Month column the proposer fell
 * back to a variable for because its values are no months) is reported in `nameStates`, and when its cells contradict it the veto is reported too: the column is asked, it is not handed
 * to the role it fell back to.
 */
export function statedInfo(sheet: RawSheet, proposals: readonly ColumnProposal[], ctx: StatedContext): StatedInfo[] {
  // the date parts are judged together
  const partAt: Partial<Record<'year' | 'month' | 'day', number>> = {};
  for (const p of proposals) {
    const part = DATE_PART_NAMES[nameKey(p.header).key];
    if (part !== undefined && partAt[part] === undefined) partAt[part] = p.index;
  }
  const partShare = Object.keys(partAt).length === 0 ? undefined : datePartsValid(sheet, partAt);
  const partVetoed = partShare !== undefined && partShare < SHARE;
  const termOf = (h: string): string => foldTerm(nameKey(h).name.replace(/\s*[[(][^[\]()]*[\])]\s*$/, ''));
  const facts: SheetFacts = {
    dwcTaxon: proposals.some((p) => termOf(p.header) === 'scientificname'),
    individualCount: proposals.some((p) => termOf(p.header) === 'individualcount'),
    dwcTerms: proposals.filter((p) => DWC_TERMS.has(termOf(p.header)) && !AMBIGUOUS_DWC.has(termOf(p.header)) && !['year', 'month', 'day'].includes(termOf(p.header))).length,
  };

  return proposals.map((p): StatedInfo => {
    const info: StatedInfo = { index: p.index, stated: false };
    const named = nameRole(p.header, ctx, facts);
    if (named === undefined) return info;
    const { key } = nameKey(p.header);
    const kind = p.role.kind;
    const first = named.meant[0];
    if (first !== undefined && first !== 'geocode') info.nameStates = first === 'depth-min' || first === 'depth-max' ? 'depth' : first;

    if (named.meant[0] === 'datePart') {
      if (partVetoed) info.vetoed = 'date-part-values';
      else if (kind === 'datePart') {
        info.stated = true;
        info.basis = named.basis;
        info.role = p.role;
      }
      return info;
    }

    /* the cells may remove what the name states, whatever role the proposer then gave the column (a "time" of full dates became a datetime: still not stated, and asked) */
    const vetoKind = named.basis === 'geocode' ? (geocodeOfKey(key)?.effect === 'water-depth' || geocodeOfKey(key)?.effect === 'sediment-depth' || geocodeOfKey(key)?.effect === 'elevation' ? 'depth' : undefined) : first;
    if (vetoKind !== undefined) {
      const v = veto(sheet, p.index, vetoKind, ctx);
      if (v !== undefined) {
        info.vetoed = v;
        return info;
      }
    }

    /* the role of the stated layer */
    let role: ColumnRole | undefined;
    let nameGivesDirection = false;
    if (named.basis === 'geocode') {
      role = geocodeRole(key, p.header, p.role);
      nameGivesDirection = role?.kind === 'depth';
      if (role !== undefined) info.nameStates = role.kind;
    } else if (named.basis === 'darwin-core') {
      if (named.meant.length === 0) {
        // a term the converter does not read counts as answered; one the proposer gave a role of its own is not ours to take
        role = kind === 'ignore' ? { kind: 'ignore' } : undefined;
      } else {
        role = named.meant.includes(kind) && !(kind === 'taxon' && (p.role as { header?: boolean }).header === true) ? p.role : roleFor(named.meant[0], p.header, named.term);
        nameGivesDirection = named.term === 'minimumdepthinmeters' || named.term === 'maximumdepthinmeters';
      }
    } else if (named.basis === 'pangaea') {
      const mine = named.meant[0];
      if (mine === 'station') role = kind === 'station' || kind === 'sampleId' ? p.role : { kind: 'station' };
      else if (mine === 'cruise') role = kind === 'cruise' ? p.role : { kind: 'cruise' };
      else role = kind === 'depth' || kind === 'depthBelowSeafloor' ? p.role : roleFor(mine, p.header);
    } else {
      // a vocabulary name states its role only when the proposal holds that role (the name tables and the proposer agree)
      const agrees = sameKind(kind, first) && !(kind === 'taxon' && (p.role as { header?: boolean }).header === true);
      role = agrees ? p.role : undefined;
    }
    if (role === undefined) return info;
    const fixed = depthStated(role, p, nameGivesDirection);
    info.stated = true;
    info.basis = named.basis;
    info.role = fixed.role;
    if (fixed.ask !== undefined) info.ask = fixed.ask;
    return info;
  });
}

/** Is the role the proposer gave the very role the file states? (A date and a datetime are one family; every other kind is itself.) */
const sameKind = (a: string, b: string | undefined): boolean => a === b || ((a === 'date' || a === 'datetime') && (b === 'date' || b === 'datetime'));

/**
 * The proposals, copied, with `stated: true` on those whose proposed role the file states. ONLY the mark is added: `role` of every copy is the very object of the proposal, in every case
 * (a stated name over a role the proposer did not give marks nothing, and a vetoed role is not marked and not changed). The input is not mutated.
 */
export function withStated(sheet: RawSheet, proposals: readonly ColumnProposal[], ctx: StatedContext): ColumnProposal[] {
  const info = statedInfo(sheet, proposals, ctx);
  return proposals.map((p, i) => (info[i].stated && info[i].role !== undefined && sameKind(p.role.kind, info[i].role?.kind) ? { ...p, stated: true as const } : { ...p }));
}
