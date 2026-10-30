// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ColumnProposal, ColumnRole, RawCell, RawRow, RawSheet, SheetMapping, TablePlan } from '../types';
import { hemisphereLetter, parseCoordinate } from '../values/coords';
import { parseDate, parseTimeOfDay } from '../values/dates';
import { NA_TOKENS, parseNumber } from '../values/numbers';
import { p01Why, why, type ReasonCode, type Why } from './reasons';
import { LATITUDE_SPELLING, LONGITUDE_SPELLING, abbreviatedAxis, coordinateBound, hemisphereTarget, isAbundanceName, isHemisphereHeader, isIdentifierName, statisticOfName } from './headerWords';
import { canonicalFromKey, headerKey, isUnitAlias, normaliseUnit, p01CodeOf } from './vocab';

export interface ProposeContext {
  decimalComma: boolean;
  date1904: boolean;
  /** When the sheet is a long table, its parameter / unit / value columns are read through the layout, not as columns. */
  long?: TablePlan['long'];
  /** The converter asks for abundance columns (Count, Individuals, ...) as they were before /check ignored them: it reads them as a quantity or a taxon candidate itself. */
  keepAbundance?: boolean;
  /**
   * The converter reads a place column (Location, Locality, Ort ...) with short repeated names as its station level. /check does not: there a station is a fixed point and ROW-STATION-SPREAD /
   * ROW-STATION-MOVED test it as one, but a 'Location' is often a region ('North Sea') that holds many positions, so the station checks would be false alarms.
   */
  placeAsStation?: boolean;
}

/* ---------- header text ---------- */

/** '"Latitude<Float32>"' -> 'Latitude' (OPeNDAP type suffix and surrounding quotes removed). */
export function stripTypeSuffix(h: string): string {
  let s = h.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1).trim();
  return s.replace(/<[A-Za-z][A-Za-z0-9]*>\s*$/, '').trim();
}

// A single-token tail ('Depth_m', 'TEMP_C', 'temp_degC') is a unit only when it is a UNIT_VOCAB label or alias, or one
// of these lengths that the vocabulary does not list; longer tails go through normaliseUnit.
const SINGLE_TOKEN_EXTRA_UNITS = new Set(['cm', 'mm']);

/** Is this text, found in round brackets, a unit ('m', 'µmol L-1', 'kg m-3') and not a remark ('at 25ºC')? */
const SIMPLE_UNITS = new Set(['cm', 'mm', 'km', 'g', 'kg', 'mg', '%', '‰']);
function looksLikeUnit(text: string): boolean {
  const t = text.trim();
  if (normaliseUnit(t) !== undefined || SIMPLE_UNITS.has(t.toLowerCase())) return true;
  return /\//.test(t) || /[A-Za-zµμ]-\d$/.test(t) || /\*\*\d/.test(t);
}

export interface HeaderUnit {
  /** The column name without type suffix, descriptor and unit. */
  name: string;
  /** Unit normalised to a UNIT_VOCAB label, or the text as written when it is not in the vocabulary. */
  unit?: string;
  /** The unit text exactly as the header wrote it (also the time-zone marker of 'Time [UTC]'). */
  unitText?: string;
}

const trimName = (s: string): string => s.replace(/[\s_]+$/, '').replace(/^[\s_]+/, '');

/**
 * Splits a header into name and unit. Understood: 'name [unit]', 'name (unit)' (only when the bracket text is a
 * unit), 'name_umol_kg' / 'name_mg_l' / 'Depth_m', 'DIC umol/kg', and the PANGAEA form 'name [unit] (description ...)'
 * whose truncated description is dropped. The unit is normalised to a UNIT_VOCAB label or left as written; it is
 * never invented (a header without a unit returns none).
 */
export function unitFromHeader(h: string): HeaderUnit {
  let s = stripTypeSuffix(h);
  s = s.replace(/\s*\([^()]*\.\.\.\)\s*$/, '').trim();

  const done = (name: string, unitText: string): HeaderUnit => {
    const t = unitText.trim();
    return { name: trimName(name), unit: normaliseUnit(t) ?? t, unitText: t };
  };

  // 'Tiefe [m] von', 'Głębokość (m) od': the unit sits before the from/to word of a depth range
  const bounded = /^(.*\S)\s*[[(]([^[\]()]+)[\])]\s+(od|do|von|bis|ab|de|à)$/i.exec(s);
  if (bounded && trimName(bounded[1]) !== '' && (s.includes('[') || looksLikeUnit(bounded[2]))) return done(`${bounded[1]} ${bounded[3]}`, bounded[2]);

  let m = /^(.*\S)\s*\[([^[\]]+)\]$/.exec(s);
  if (m && trimName(m[1]) !== '') return done(m[1], m[2]);

  m = /^(.*\S)\s*\(([^()]+)\)$/.exec(s);
  if (m && trimName(m[1]) !== '' && looksLikeUnit(m[2])) return done(m[1], m[2]);

  if (s.includes('_')) {
    const tokens = s.split('_');
    for (let k = Math.min(3, tokens.length - 1); k >= 1; k--) {
      const tail = tokens.slice(-k).join('_');
      const head = tokens.slice(0, -k).join('_');
      if (head === '') continue;
      if (k === 1 ? SINGLE_TOKEN_EXTRA_UNITS.has(tail.toLowerCase()) || isUnitAlias(tail) : normaliseUnit(tail) !== undefined) {
        return done(head, tail.replace(/_/g, ' '));
      }
    }
  }

  const words = s.split(/\s+/);
  for (let k = Math.min(2, words.length - 1); k >= 1; k--) {
    const tail = words.slice(-k).join(' ');
    if (/[/]/.test(tail) && normaliseUnit(tail) !== undefined) return done(words.slice(0, -k).join(' '), tail);
  }

  return { name: trimName(s) };
}

/* ---------- column statistics ---------- */

const isBlank = (c: RawCell): boolean => c === null || (typeof c === 'string' && NA_TOKENS.includes(c.trim()));

function sampleRows(sheet: RawSheet, max = 1000): readonly RawRow[] {
  const n = sheet.rows.length;
  if (n <= max) return sheet.rows;
  const out: RawRow[] = [];
  for (let i = 0; i < max; i++) out.push(sheet.rows[Math.floor((i * n) / max)]);
  return out;
}

interface Stats {
  nonEmpty: number;
  ok: number;
  nonNumeric: number;
}

function numericStats(rows: readonly RawRow[], col: number, decimalComma: boolean): Stats {
  const st: Stats = { nonEmpty: 0, ok: 0, nonNumeric: 0 };
  for (const r of rows) {
    const c = r.cells[col] ?? null;
    if (isBlank(c)) continue;
    st.nonEmpty++;
    const p = parseNumber(c, decimalComma);
    if (p.status === 'ok') st.ok++;
    else if (p.status === 'non-numeric') st.nonNumeric++;
  }
  return st;
}

/** A column is numeric when at least one value is a number and the numbers are not outnumbered by other text. */
const isNumeric = (st: Stats): boolean => st.ok > 0 && st.ok >= st.nonNumeric;

/* ---------- name-based roles ---------- */

type SlotKind = 'latitude' | 'longitude' | 'when' | 'time' | 'depth' | 'station' | 'cruise' | 'sampleId';
interface Cand {
  slot: SlotKind;
  /** 0 exact name, 1 other name, 2 P01 code / elevation, 3 inferred from values */
  tier: number;
  kind: 'latitude' | 'longitude' | 'datetime' | 'date' | 'time' | 'depth' | 'station' | 'cruise' | 'sampleId';
  /** Why the name or the values say so: English text, stable code and the values the page's translation needs (reasons.ts). */
  why: Why;
  elevation?: boolean;
  /** Darwin Core depth: always metres, positive down; never inferred from the values. */
  dwcDepth?: boolean;
  /** Every sampled value is blank; set after the columns are read. */
  empty?: boolean;
  /** The name alone is ambiguous (data, Zeit, ...): the column's values must back it, see guardPasses. */
  guard?: 'date-values' | 'not-plain-numbers' | 'time-values' | 'place-values';
  /** Depth from/to (od/do, von/bis, de/a): which end of a range; two bounds compete for the one depth slot. */
  bound?: 'from' | 'to';
  /** The end of a tow or transect (End Latitude): loses the slot to the start position and is ignored; alone it is used, at low confidence. */
  coordEnd?: boolean;
  /** A bare width / length word with a start or end word ('Länge Ende'): a coordinate only when the values fit the axis (see valuesFitAxis). */
  fitAxis?: boolean;
}

/* ---------- Polish, German and French names (keys come from headerKey: ASCII, lower case, 'ł' -> 'l', 'ä' -> 'a') ---------- */

// Names that can only mean a position, in their own language. 'latitude' / 'longitude' are the same in French and English.
const LAT_SAFE = /^(szerokosc|szer) geogr\w*|^szerokosc (polnocna|poludniowa)|^breitengrad|^(geographische|geogr) breite/;
const LON_SAFE = /^(dlugosc|dl) geogr\w*|^dlugosc (wschodnia|zachodnia)|^l(?:a|ae)ngengrad|^(geographische|geogr) l(?:a|ae)nge/;
// Bare words that are also a body length or width: szerokosc / szer / Breite, dlugosc / dl / dlug / Lange.
const LAT_BARE = /^(szerokosc|szer|breite)(?: (.+))?$/;
const LON_BARE = /^(dlugosc|dl|dlug|lange|laenge)(?: (.+))?$/;
const HEMI_LAT = /^(n|s|north|south|nord|sud|pln|pld|plnc|plds|polnocna|poludniowa)$/;
const HEMI_LON = /^(e|w|o|east|west|ost|wsch|zach|wschodnia|zachodnia)$/;
const DEGREE_UNIT = /[°º˚]|^(deg\w*|grad|stopni\w*|degres?)\b/i;
const HEMI_UNIT = /^[°º˚]?\s?[nsewo]$/i;

/**
 * A bare width / length word read as a coordinate. 'never' when the header states a unit that is not degrees ('długość [mm]');
 * 'marked' when a degree unit or a hemisphere letter backs the name; otherwise bare (the caller needs values and a partner).
 */
function bareCoordinate(key: string, unitText: string | undefined, cleanHeader: string): { axis: 'latitude' | 'longitude'; marked: boolean } | 'never' | undefined {
  let axis: 'latitude' | 'longitude';
  let tail: string | undefined;
  const lat = LAT_BARE.exec(key);
  let lon = lat ? null : LON_BARE.exec(key);
  // 'DL' / 'dl' is a detection limit (or a decilitre) far more often than 'długość': the abbreviation counts only with its 'ł'
  if (lon && lon[1] === 'dl' && !/[łŁ]/.test(cleanHeader)) lon = null;
  if (lat) {
    axis = 'latitude';
    tail = lat[2];
  } else if (lon) {
    axis = 'longitude';
    tail = lon[2];
  } else return undefined;
  const hemi = axis === 'latitude' ? HEMI_LAT : HEMI_LON;
  let marked = false;
  if (tail !== undefined) {
    if (!hemi.test(tail)) return undefined; // 'dlugosc ciala', 'szerokosc skorupy': a measurement of something
    marked = true;
  }
  if (unitText !== undefined) {
    const u = unitText.trim();
    if (DEGREE_UNIT.test(u) || HEMI_UNIT.test(u)) marked = true;
    else return 'never';
  } else if (/[°º˚]/.test(cleanHeader)) marked = true;
  return { axis, marked };
}

const SITE_DEPTH =
  /\b(site|bottom|seafloor|seabed|sea floor|sounding|total|maximum|max)\b.*\bdepth\b|\bdepth\b.*\b(of the site|of the station|of the bottom|of the seafloor|of the sea floor)\b|\bdepth (at|of) (the )?(site|station|bottom)\b/;
// 'Depth-integrated chlorophyll', 'Depth averaged temperature', 'Integrated over depth': the depth word qualifies a measurement made over a depth range, it is not the depth of the sample.
// A bare 'Mean depth' / 'Average depth' IS a depth (the middle of the sampled layer) and stays one.
const DEPTH_QUALIFIER = /\bdepth (integrated|integral|averaged|weighted|resolved|dependent|corrected|normali[sz]ed|specific)\b|\b(integrated|averaged|integral) (over|across|through|within|by) (the )?(water )?(column|depth)\b|\b(over|across) (the )?depth\b/;
const OTHER_DEPTH = /\b(secchi|mixed layer|mld|euphotic|photic|thermocline|chlorophyll max|compensation)\b/;
const FLAG = /^(qf|qc|flag)( |$)|( flag| flags| qf| qc)$|^quality( flag| control| code)?( |$)/;

const PLAIN_COUNT_UNIT = /^(n|ind|inds|individuals?|specimens?|count|counts)\.?$/i;

const LAT_NAME = new RegExp(`^(${LATITUDE_SPELLING})(\\s|$)`);
const LON_NAME = new RegExp(`^(${LONGITUDE_SPELLING})(\\s|$)`);

function nameCandidate(key: string, hdr?: NameHeader): Cand | undefined {
  // start / end of a tow or transect: 'Begin Latitude', 'Lat start', 'Latitude (start)' (a bracket text that is no unit stays in the header)
  const cb = coordinateBound(key) ?? (hdr === undefined ? undefined : coordinateBound(headerKey(hdr.cleanHeader)));
  if (cb) {
    const fit = cb.bare ? { fitAxis: true } : {};
    if (cb.bound === 'start' && cb.axis === 'latitude') return { slot: 'latitude', tier: 1, kind: 'latitude', why: why('name-latitude'), ...fit };
    if (cb.bound === 'start') return { slot: 'longitude', tier: 1, kind: 'longitude', why: why('name-longitude'), ...fit };
    // tier 4: an end position ranks below every other reading of a position (a degrees-minutes column, a P01 code, a bare width), so it only wins when nothing else is there
    return { slot: cb.axis, tier: 4, kind: cb.axis, why: why('end-position', { name: '' }), coordEnd: true, ...fit };
  }
  const other = nameCandidateOther(key, hdr);
  if (other) return other;
  if (LAT_NAME.test(key) || abbreviatedAxis(key) === 'latitude') {
    return { slot: 'latitude', tier: key === 'latitude' || key === 'lat' ? 0 : 1, kind: 'latitude', why: why('name-latitude') };
  }
  if (LON_NAME.test(key) || abbreviatedAxis(key) === 'longitude') {
    return { slot: 'longitude', tier: ['longitude', 'lon', 'long', 'lng'].includes(key) ? 0 : 1, kind: 'longitude', why: why('name-longitude') };
  }
  if (/^(date ?time|timestamp|time ?stamp|date and time)(\s|$)/.test(key)) {
    return { slot: 'when', tier: 0, kind: 'datetime', why: why('name-datetime') };
  }
  // 'Date of collection', 'Collection date', 'Date sampled', 'Date collected' ... name the date of the event; a bare 'Collected' needs date values (it can be a yes / no column)
  if (/^(((sampling|sample|collection|start|observation|measurement) )?date|date of (collection|sampling|sample|observation|measurement|survey)|date (sampled|collected|taken))( utc)?$/.test(key)) {
    return { slot: 'when', tier: key === 'date' ? 0 : 1, kind: 'date', why: why('name-date') };
  }
  if (key === 'collected') return { slot: 'when', tier: 1, kind: 'date', why: why('name-date'), guard: 'date-values' };
  if (/^((sampling|sample|collection|start|observation|measurement) )?time( utc| of day| hh mm| hhmm)?$/.test(key)) {
    return { slot: 'time', tier: key === 'time' ? 0 : 1, kind: 'time', why: why('name-time') };
  }
  if (/^(elevation|altitude)(\s|$)/.test(key)) {
    return { slot: 'depth', tier: 2, kind: 'depth', why: why('name-elevation'), elevation: true };
  }
  if (/\bdepth\b/.test(key) && !SITE_DEPTH.test(key) && !OTHER_DEPTH.test(key) && !DEPTH_QUALIFIER.test(key)) {
    return { slot: 'depth', tier: key === 'depth' ? 0 : 1, kind: 'depth', why: why('name-depth') };
  }
  if (/^(pressure|pres|press|prs)(\s|$)/.test(key)) return undefined; // pressure is not a slot, handled by the caller
  if (/^(cruise( id| name| no| number| code)?|expedition( \w+)?|campaign( \w+)?|survey|leg)$/.test(key)) {
    return { slot: 'cruise', tier: key === 'cruise' ? 0 : 1, kind: 'cruise', why: why('name-cruise') };
  }
  if (/^(station( name| id| code| no| number| nr| label)?|stn( \w+)?|st|sta|site( id| name| code| no)?|event|label)$/.test(key)) {
    return { slot: 'station', tier: key === 'station' ? 0 : 1, kind: 'station', why: why('name-station') };
  }
  // 'Location' / 'Locality' name a place: a station when the values are short repeated names (not coordinates, not sentences). Weak (tier 3, low confidence): any real Station column wins.
  if (/^(location( name| id| code| no| number| label)?|locality( name| id| code)?|sampling (location|locality|place)|collection (location|locality|site)|place( name)?)$/.test(key)) {
    return { slot: 'station', tier: 3, kind: 'station', why: why('name-station-place'), guard: 'place-values' };
  }
  if (/^(sample( id| no| number| name| code| label)?|core( id| name| no| number)?|specimen( id)?|bottle( id| no| number)?|id)$/.test(key)) {
    return { slot: 'sampleId', tier: 1, kind: 'sampleId', why: why('name-sample') };
  }
  return undefined;
}

interface NameHeader {
  unitText?: string;
  cleanHeader: string;
}

const PL_SITE = /\b(dna|stacji|calkowita|maksymalna|secchi|przezroczystosc|eufotycznej|mieszania|termokliny)\b/;
const DE_SITE = /boden|grund|gesamt|maximal|sicht|secchi|mischungs|euphot/;
const FR_SITE = /\b(fond|totale|maximale|secchi|couche|euphotique|bathymetrie)\b/;

/** Polish, German and French names for the roles the English patterns cover. Whole names or clear patterns, never a substring. */
function nameCandidateOther(key: string, hdr?: NameHeader): Cand | undefined {
  if (LAT_SAFE.test(key)) return { slot: 'latitude', tier: 1, kind: 'latitude', why: why('name-latitude') };
  if (LON_SAFE.test(key)) return { slot: 'longitude', tier: 1, kind: 'longitude', why: why('name-longitude') };
  const bare = bareCoordinate(key, hdr?.unitText, hdr?.cleanHeader ?? '');
  if (bare && bare !== 'never' && bare.marked) {
    return { slot: bare.axis, tier: 1, kind: bare.axis, why: why(`name-${bare.axis}-marked`) };
  }
  // date and time in one column
  if (/^(data (i )?(godzina|czas)|datum (und )?(uhrzeit|zeit)|zeitstempel|date (et )?(heure|temps)|horodatage)( |$)/.test(key)) {
    return { slot: 'when', tier: 0, kind: 'datetime', why: why('name-datetime') };
  }
  // date. 'data' (also Latin, Italian, English "data") and 'datum' (also a geodetic datum: WGS84) need date values.
  if (key === 'data') return { slot: 'when', tier: 0, kind: 'date', why: why('name-date'), guard: 'date-values' };
  if (key === 'datum') return { slot: 'when', tier: 0, kind: 'date', why: why('name-date'), guard: 'date-values' };
  if (
    /^data (poboru|pomiaru|pobrania|probkowania|obserwacji|zbioru|rozpoczecia|startu|badan)( utc)?$/.test(key) ||
    /^(probenahme|mess|beobachtungs|entnahme|start)datum( utc)?$|^datum (der )?(probenahme|messung|beobachtung|entnahme|beginn|start)( utc)?$/.test(key) ||
    /^date (de |d )?(prelevement|echantillonnage|mesure|observation|collecte|debut|depart)( utc)?$/.test(key)
  ) {
    return { slot: 'when', tier: 1, kind: 'date', why: why('name-date') };
  }
  // time of day. 'czas' / 'Zeit' / 'temps' can be a duration: the values must read as times of day.
  if (/^(czas|zeit|temps)( utc| gmt| lokalny| lokalna| ortszeit| locale)?$/.test(key)) {
    return { slot: 'time', tier: key === 'czas' || key === 'zeit' || key === 'temps' ? 0 : 1, kind: 'time', why: why('name-time'), guard: 'time-values' };
  }
  if (
    /^(godzina|godz|uhrzeit|heure)( utc| gmt| lokalna| ortszeit| locale| hh mm| hhmm)?$/.test(key) ||
    /^(godzina|godz) (poboru|pobrania|pomiaru|rozpoczecia)( utc)?$|^(mess|probenahme)uhrzeit( utc)?$|^heure (de )?(prelevement|mesure|debut)( utc)?$/.test(key)
  ) {
    return { slot: 'time', tier: ['godzina', 'uhrzeit', 'heure'].includes(key) ? 0 : 1, kind: 'time', why: why('name-time') };
  }
  // depth (bounds: od/do, von/bis, de/a)
  let m = /^glebokosc(?: (.+))?$/.exec(key);
  if (m && !(m[1] !== undefined && PL_SITE.test(m[1]))) return depthName(m[1], 'glebokosc', /^od$/, /^do$/);
  m = /^(?:wasser|mess|proben|entnahme)?tiefe(?: (.+))?$/.exec(key);
  if (m && !DE_SITE.test(key)) return depthName(m[1], 'tiefe', /^(von|ab)$/, /^bis$/);
  m = /^profondeur(?: (.+))?$/.exec(key);
  if (m && !(m[1] !== undefined && FR_SITE.test(m[1]))) return depthName(m[1], 'profondeur', /^de$/, /^a$/);
  // cruise
  if (/^(rejs( nr| numer| nazwa| kod| id)?|(numer|nr|kod|nazwa|id) rejsu|wyprawa|ekspedycja)$/.test(key)) {
    return { slot: 'cruise', tier: key === 'rejs' ? 0 : 1, kind: 'cruise', why: why('name-cruise') };
  }
  if (/^(fahrt( nr| nummer| name| id)?|reise( nr| nummer| name| id)?|fahrtnummer|reisenummer|forschungsfahrt|kampagne( nr| nummer| name)?)$/.test(key)) {
    return { slot: 'cruise', tier: key === 'fahrt' || key === 'reise' ? 0 : 1, kind: 'cruise', why: why('name-cruise') };
  }
  if (/^(campagne( nom| id| code| numero| no)?|(nom|numero|n|code) (de |d )?(la )?campagne|croisiere( nom| id| code| numero)?|mission)$/.test(key)) {
    return { slot: 'cruise', tier: key === 'campagne' || key === 'croisiere' ? 0 : 1, kind: 'cruise', why: why('name-cruise') };
  }
  // station
  if (/^(stacja( nr| numer| nazwa| kod| id)?|(numer|nr|kod|nazwa|id) stacji|stanowisko( nr| numer| nazwa| kod)?)$/.test(key)) {
    return { slot: 'station', tier: key === 'stacja' ? 0 : 1, kind: 'station', why: why('name-station') };
  }
  // a place name in Polish, German and French: a station when the values are short repeated names; weak, a real station column wins (see nameCandidate)
  if (/^(miejsce( poboru| pobrania| probkowania| badan| nr| nazwa)?|miejscowosc|lokalizacja|nazwa lokalizacji|nazwa miejsca|ort|ortsname|ortsangabe|fundort|probenahmeort|entnahmeort|lieu|lieu (de )?(prelevement|echantillonnage|collecte)|nom (du )?lieu|localite|localisation)$/.test(key)) {
    return { slot: 'station', tier: 3, kind: 'station', why: why('name-station-place'), guard: 'place-values' };
  }
  if (/^(stations ?(nr|nummer|name|code|id|kennung)|stationsname|stationsnummer|stationsnr|messstation|standort( nr| name| id)?|probenahmestelle|station (nr|nummer|name|code|id|kennung))$/.test(key)) {
    return { slot: 'station', tier: 1, kind: 'station', why: why('name-station') };
  }
  if (/^(station (de mesure|nom|numero|no)|(nom|numero|n|code) (de |d )?(la )?station|code station|nom station|numero station)$/.test(key)) {
    return { slot: 'station', tier: 1, kind: 'station', why: why('name-station') };
  }
  // sample or core id. Polish 'próba' (also 'próbka') only as the bare word or 'nr / numer / kod / oznaczenie / ID / identyfikator próby': 'objętość próby',
  // 'masa próby', 'data próby', 'typ próby', 'próba kontrolna', 'liczba prób' are not ids, and 'głębokość próby' is read as depth first.
  // German 'Probe' is a sample or a test: a bare 'Probe' stays a low-confidence proposal.
  if (/^(probka|(nr|numer|id|kod|nazwa|oznaczenie|identyfikator) probki|probka (nr|numer|id|kod|nazwa)|proba|proba (nr|numer|id|kod|nazwa)|(nr|numer|id|kod|nazwa|oznaczenie|identyfikator) proby|rdzen|(nr|numer|id|kod|nazwa) rdzenia|rdzen (nr|numer|id|kod|nazwa))$/.test(key)) {
    return { slot: 'sampleId', tier: 1, kind: 'sampleId', why: why('name-sample') };
  }
  if (/^(probe (nr|nummer|name|kennung|bezeichnung)|proben ?(nr|nummer|id|name|kennung|bezeichnung)|kern( nr| nummer| id| name)?|kernnummer|bohrkern( nr| nummer| id| name)?)$/.test(key)) {
    return { slot: 'sampleId', tier: 1, kind: 'sampleId', why: why('name-sample') };
  }
  // 'Probe' and 'Probe ID' are also a test or an instrument (English probe): low confidence
  if (key === 'probe' || key === 'probe id') return { slot: 'sampleId', tier: 3, kind: 'sampleId', why: why('name-sample-probe') };
  if (/^(echantillon( id| no| numero| nom| code)?|(id|code|nom|numero|n) (de |d )?(l )?echantillon|identifiant( echantillon)?|carotte( id| no| numero| nom| code)?|(id|code|nom|numero|n) (de |d )?(la )?carotte)$/.test(key)) {
    return { slot: 'sampleId', tier: 1, kind: 'sampleId', why: why('name-sample') };
  }
  return undefined;
}

/** A depth column named in Polish, German or French. The start of a range ranks before its end, so the first bound wins the one depth slot. */
function depthName(rest: string | undefined, word: string, from: RegExp, to: RegExp): Cand {
  const base: Cand = { slot: 'depth', tier: rest === undefined ? 0 : 1, kind: 'depth', why: why('name-depth') };
  const last = rest?.split(' ').pop();
  if (rest !== undefined && last !== undefined && from.test(last)) return { ...base, tier: 1, bound: 'from', why: why('name-depth-start', { name: `${word} ${rest}` }) };
  if (rest !== undefined && last !== undefined && to.test(last)) return { ...base, tier: 1.5, bound: 'to', why: why('name-depth-end', { name: `${word} ${rest}` }) };
  return base;
}

/* ---------- Darwin Core ---------- */

const DWC_URI = /^https?:\/\/rs\.tdwg\.org\/dwc\/(?:terms|iri)\/(?:[a-z]+\/)?/i;

/** 'dwc:decimalLatitude' / 'http://rs.tdwg.org/dwc/terms/decimalLatitude' -> term and whether the header carried a DwC prefix. */
function dwcHeader(header: string): { term: string; prefixed: boolean } | undefined {
  const h = header.trim();
  let t = h;
  let prefixed = false;
  if (DWC_URI.test(t)) {
    t = t.replace(DWC_URI, '');
    prefixed = true;
  } else if (/^dwc:/i.test(t)) {
    t = t.slice(4);
    prefixed = true;
  }
  return /^[A-Za-z]+$/.test(t) ? { term: t, prefixed } : undefined;
}

/** The lower-cased DwC term a header names (prefix removed), for the dataset builder. */
export function dwcTermOf(header: string): string | undefined {
  return dwcHeader(stripTypeSuffix(header))?.term.toLowerCase();
}

const DWC_CAND: Record<string, Omit<Cand, 'why'> & { why?: Why }> = {
  decimallatitude: { slot: 'latitude', tier: 0, kind: 'latitude' },
  decimallongitude: { slot: 'longitude', tier: 0, kind: 'longitude' },
  verbatimlatitude: { slot: 'latitude', tier: 1, kind: 'latitude' },
  verbatimlongitude: { slot: 'longitude', tier: 1, kind: 'longitude' },
  eventdate: { slot: 'when', tier: 0, kind: 'date', why: why('dwc-eventdate') },
  eventtime: { slot: 'time', tier: 0, kind: 'time' },
  minimumdepthinmeters: { slot: 'depth', tier: 0, kind: 'depth', dwcDepth: true, why: why('dwc-depth-metres') },
  maximumdepthinmeters: { slot: 'depth', tier: 1, kind: 'depth', dwcDepth: true, why: why('dwc-depth-metres') },
  locationid: { slot: 'station', tier: 0, kind: 'station' },
  occurrenceid: { slot: 'sampleId', tier: 0, kind: 'sampleId' },
  eventid: { slot: 'sampleId', tier: 2, kind: 'sampleId' },
};
/** Terms whose names are specific enough to be read without any DwC context. */
const DWC_IGNORED = new Set([
  'catalognumber', 'recordnumber', 'othercatalognumbers', 'fieldnumber', 'individualcount', 'organismquantity',
  'coordinateuncertaintyinmeters', 'coordinateprecision', 'minimumelevationinmeters', 'maximumelevationinmeters',
  'minimumdistanceabovesurfaceinmeters', 'maximumdistanceabovesurfaceinmeters', 'startdayofyear', 'enddayofyear',
]);
/** Ordinary words that are DwC terms only when the sheet is a DwC table (or the header is prefixed). */
const DWC_GENERIC = new Set(['year', 'month', 'day', 'modified', 'locality']);
const DWC_MARKERS = new Set([
  ...Object.keys(DWC_CAND), ...DWC_IGNORED, 'scientificname', 'basisofrecord', 'occurrencestatus', 'taxonid',
  'scientificnameid', 'taxonrank', 'decimalcoordinates', 'geodeticdatum', 'datasetid', 'datasetname', 'kingdom',
]);

/** Is this sheet a Darwin Core table: does any header name a distinctive DwC term, or carry a dwc: prefix? */
function isDwcSheet(headers: readonly string[]): boolean {
  return headers.some((h) => {
    const d = dwcHeader(stripTypeSuffix(h));
    return d !== undefined && (d.prefixed || DWC_MARKERS.has(d.term.toLowerCase()));
  });
}

function dwcColumn(header: string, dwcSheet: boolean): { cand: Cand } | { ignore: Why } | undefined {
  const d = dwcHeader(header);
  if (!d) return undefined;
  const t = d.term.toLowerCase();
  const generic = DWC_GENERIC.has(t);
  if (!d.prefixed && generic && !dwcSheet) return undefined;
  if (!d.prefixed && !generic && !DWC_MARKERS.has(t) && !(dwcSheet && /id$/.test(t) && t.length > 2 && t !== 'id')) return undefined;
  const c = DWC_CAND[t];
  if (c) return { cand: { ...c, why: c.why ?? why('dwc-term', { term: d.term }) } };
  if (t === 'locality') return { cand: { slot: 'station', tier: 1, kind: 'station', why: why('dwc-term', { term: 'locality' }) } };
  if (DWC_IGNORED.has(t) || DWC_GENERIC.has(t) || t.endsWith('id')) {
    return { ignore: why('dwc-bookkeeping', { term: d.term }) };
  }
  return undefined;
}

// Polish, German and French nouns for pressure: 'ciśnienie', 'Druck', 'pression'. The English names stay as they were
// (^pressure, pres, press, prs). The noun alone, with a water or instrument qualifier, or with a sea-pressure unit is the pressure of
// the water column; air, barometric, vapour, partial and gas pressures, sea-level air pressure and every other qualifier are not.
const OTHER_PRESSURE_NOUN = /^(cisnienie|druck|pression)(?:\s(.*))?$/;
const PRESSURE_COMPOUND = /^(wasser|meer|meeres|ctd|sonden)druck(\s|$)/;
const NOT_SEA_WORDS = /\b(partielle|parcjalne|czastkowe|partial\w*|atmospher\w*|atmosfer\w*|powietrz\w*|luft\w*|barometr\w*|pary|para|vapeur|dampf|air|niveau|poziomie|meeresspiegel|co2|gas\w*|gaz\w*)\b/;
const SEA_QUALIFIER = /\b(hydrostatyczn\w*|wody|morsk\w*|wasser|meer|meeres|hydrostatisch\w*|hydrostatique\w*|eau|mer|ctd|sondy|sonde|sonden)\b/;
const NOT_SEA_UNIT = /^(hpa|mbar|mb|uatm|atm|mmhg|torr)$/;
const SEA_UNIT = /^(dbar|decibars?|db|bar|kpa|mpa|pa)$/;
const unitToken = (t: string): string => t.toLowerCase().replace(/[µμ]/g, 'u').replace(/\s+/g, '');

function isPressureName(key: string, unitText?: string): boolean {
  if (/^(pressure|pres|press|prs)(\s|$)/.test(key)) return true;
  const unit = unitText === undefined ? undefined : unitToken(unitText);
  if (PRESSURE_COMPOUND.test(key)) return unit === undefined || !NOT_SEA_UNIT.test(unit);
  const m = OTHER_PRESSURE_NOUN.exec(key);
  if (!m) return false;
  const words = m[2] === undefined || m[2] === '' ? [] : m[2].split(' ');
  // a unit glued on as the last word ("cisnienie hpa") counts as the unit when the header gave none
  const u = unit ?? (words.length > 0 && (NOT_SEA_UNIT.test(words[words.length - 1]) || SEA_UNIT.test(words[words.length - 1])) ? words[words.length - 1] : undefined);
  const rest = words.filter((w) => w !== u).join(' ');
  if (u !== undefined && NOT_SEA_UNIT.test(u)) return false;
  if (rest === '') return true; // the noun alone
  if (NOT_SEA_WORDS.test(rest)) return false;
  if (SEA_QUALIFIER.test(rest)) return true;
  return u !== undefined && SEA_UNIT.test(u);
}

/** Does a text cell read like the name of a standard column (latitude, depth, DIC, ...)? Used to spot transposed tables. */
export function isKnownColumnName(label: string): boolean {
  const key = headerKey(unitFromHeader(label).name);
  return key !== '' && (nameCandidate(key) !== undefined || isPressureName(key) || canonicalFromKey(key) !== undefined);
}

/* ---------- main ---------- */

const OTHER_USED: Record<SlotKind, ReasonCode> = {
  latitude: 'other-latitude',
  longitude: 'other-longitude',
  when: 'other-date',
  time: 'other-time',
  depth: 'other-depth',
  station: 'other-station',
  cruise: 'other-cruise',
  sampleId: 'other-sample',
};

/** The reason fields of a proposal: the English text and the code with its values. Optional fields are left out, not set to undefined. */
function reasonOf(w: Why): Pick<ColumnProposal, 'reason' | 'reasonCode' | 'reasonParams'> {
  return { reason: w.reason, reasonCode: w.code, ...(w.params === undefined ? {} : { reasonParams: w.params }) };
}

/**
 * Sets and extends a proposal's reason, keeping the English text and the codes in step: `main` replaces the reason (and its values),
 * `notes` are appended ("; " in the English text), `lead` is put in front of the main reason.
 */
function applyReason(p: ColumnProposal, main: Why | undefined, notes: readonly Why[], lead?: Why): void {
  if (main !== undefined) {
    delete p.reasonParams;
    delete p.reasonLead;
    delete p.reasonNotes;
    Object.assign(p, reasonOf(main));
  }
  if (lead !== undefined) {
    p.reasonLead = lead.code;
    p.reason = `${lead.reason}; ${p.reason}`;
  }
  if (notes.length > 0) {
    p.reasonNotes = [...(p.reasonNotes ?? []), ...notes.map((n) => n.code)];
    p.reason += notes.map((n) => `; ${n.reason}`).join('');
  }
}
/** Words of a depth header that state the direction: "Depth below sea level", "Depth positive down", "mbsl", "m BSF". */
const DEPTH_DOWN_WORDS = /\b(?:below|beneath|under|down|downwards?|bsl|bsf|mbsl|mbsf|mbgl|bgl)\b/i;
/** A header that is a depth word: by definition the vertical distance BELOW the surface (CF standard name `depth`, see qc-sources.md). */
const DEPTH_WORD = /\bdepth\b/i;
/** The same word in Polish, German and French, tested on headerKey (ASCII): głębokość, Tiefe (also Wassertiefe), profondeur. */
const DEPTH_WORD_OTHER = /(?:^|\s)(?:glebokosc|profondeur|(?:wasser|mess|proben|entnahme)?tiefe)(?:\s|$)/;

/** A negative value means "up" (as before). Values of both signs are NOT left undecided: crossfile matches depths across files with this sign (golden: porewater3m has 296 negative and 15 positive values). */
function depthPositive(rows: readonly RawRow[], col: number, decimalComma: boolean, elevation: boolean): 'down' | 'up' | 'unknown' {
  if (elevation) return 'up';
  let seen = false;
  for (const r of rows) {
    const p = parseNumber(r.cells[col] ?? null, decimalComma);
    if (p.status !== 'ok') continue;
    seen = true;
    if (p.value < 0) return 'up';
  }
  return seen ? 'down' : 'unknown';
}

function hasTimeOfDay(rows: readonly RawRow[], col: number, ctx: ProposeContext, dateFormatted: boolean): boolean {
  for (const r of rows.slice(0, 200)) {
    const c = r.cells[col] ?? null;
    if (isBlank(c)) continue;
    const d = parseDate(c, { date1904: ctx.date1904, dateFormatted });
    if (!('error' in d) && (d.precision === 'minute' || d.precision === 'second')) return true;
  }
  return false;
}

/** Hemisphere letter on a degree-minute text column -> the axis it must be; undefined when the values do not say. */
function dmAxis(rows: readonly RawRow[], col: number, decimalComma: boolean): 'lat' | 'lon' | undefined {
  let lat = 0;
  let lon = 0;
  let other = 0;
  for (const r of rows) {
    const c = r.cells[col] ?? null;
    if (typeof c !== 'string' || isBlank(c)) continue;
    const t = c.trim().toUpperCase();
    const letter = /^[NSEW]|[NSEW]$/.exec(t)?.[0];
    const hasMarks = /[°'′"″]/.test(t);
    if (!hasMarks || letter === undefined) {
      other++;
      continue;
    }
    const axis = 'NS'.includes(letter) ? 'lat' : 'lon';
    const parsed = parseCoordinate(c, axis, decimalComma);
    if ('error' in parsed || parsed.form === 'decimal') other++;
    else if (axis === 'lat') lat++;
    else lon++;
  }
  if (other > 0 || lat + lon === 0) return undefined;
  if (lat > 0 && lon === 0) return 'lat';
  if (lon > 0 && lat === 0) return 'lon';
  return undefined;
}

const PLACE_MAX_CHARS = 40;
const PLACE_MAX_WORDS = 6;

/**
 * Does the column hold place names: short text values (at most 40 characters and 6 words), at least one of them repeated, none a number, a coordinate or a date? A column of
 * sentences, of coordinates, of numbers or of values that are all different (a free description or an identifier per row) is not a station. At least 80 % of the filled cells must qualify.
 */
function holdsPlaceNames(rows: readonly RawRow[], col: number): boolean {
  let seen = 0;
  let names = 0;
  const distinct = new Set<string>();
  for (const r of rows.slice(0, 500)) {
    const c = r.cells[col] ?? null;
    if (isBlank(c)) continue;
    seen++;
    if (typeof c !== 'string') continue;
    const t = c.trim();
    if (t.length > PLACE_MAX_CHARS || t.split(/\s+/).length > PLACE_MAX_WORDS) continue;
    if (/[°º˚]|\d+[.,]\d+\D+\d+[.,]\d+/.test(t)) continue; // a coordinate pair or a value with degrees
    if (parseNumber(t, false).status === 'ok' || !('error' in parseDate(t, { date1904: false, dateFormatted: false }))) continue;
    names++;
    distinct.add(t.toLowerCase());
  }
  return seen > 0 && names * 5 >= seen * 4 && distinct.size < names;
}

/** Do the sampled values back an ambiguous name? Blank columns never do. */
function guardPasses(guard: NonNullable<Cand['guard']>, sheet: RawSheet, rows: readonly RawRow[], col: number, ctx: ProposeContext): boolean {
  const dateFormatted = sheet.dateFormatted?.[col] === true;
  if (guard === 'place-values') return ctx.placeAsStation === true && holdsPlaceNames(rows, col);
  if (guard === 'not-plain-numbers') return dateFormatted || !isNumeric(numericStats(rows, col, ctx.decimalComma));
  let seen = 0;
  let good = 0;
  for (const r of rows.slice(0, 200)) {
    const c = r.cells[col] ?? null;
    if (isBlank(c)) continue;
    seen++;
    if (guard === 'time-values' ? !('error' in parseTimeOfDay(c)) : !('error' in parseDate(c, { date1904: ctx.date1904, dateFormatted: false }))) good++;
  }
  if (guard === 'date-values' && dateFormatted) return true;
  return seen > 0 && good * 2 >= seen;
}

/** Every filled value is a hemisphere letter or word (N, s, East ...) and there is at least one: the column holds the hemispheres, not a coordinate. */
function holdsOnlyHemisphereLetters(rows: readonly RawRow[], col: number): boolean {
  let seen = 0;
  for (const r of rows) {
    const c = r.cells[col] ?? null;
    if (isBlank(c)) continue;
    if (typeof c !== 'string' || !/^(n|s|e|w|north|south|east|west)\.?$/i.test(c.trim())) return false;
    seen++;
  }
  return seen > 0;
}

/** Every non-blank sampled value is a number within the range of the axis (|lat| <= 90, |lon| <= 180). */
function valuesFitAxis(rows: readonly RawRow[], col: number, axis: 'latitude' | 'longitude', decimalComma: boolean): boolean {
  const limit = axis === 'latitude' ? 90 : 180;
  let ok = 0;
  let fractional = 0;
  for (const r of rows) {
    const c = r.cells[col] ?? null;
    if (isBlank(c)) continue;
    const p = parseNumber(c, decimalComma);
    if (p.status !== 'ok' || Math.abs(p.value) > limit) return false;
    ok++;
    if (!Number.isInteger(p.value)) fractional++;
  }
  // Integer-only columns are sizes, counts or codes far more often than positions: at least one value must have a fractional part.
  return ok > 0 && fractional > 0;
}

/**
 * Bare 'szerokość' / 'długość' / 'Breite' / 'Länge' (also a width or a length of a body): a coordinate only when the values fit the
 * axis AND the opposite axis is present too, and then with low confidence. A unit that is not degrees rules the word out.
 */
function bareCoordinates(sheet: RawSheet, rows: readonly RawRow[], ctx: ProposeContext, skip: ReadonlySet<number>, dwcSheet: boolean): Map<number, Cand> {
  const fits: { index: number; axis: 'latitude' | 'longitude'; clean: string }[] = [];
  const named = new Set<string>();
  sheet.header.forEach((header, index) => {
    if (skip.has(index)) return;
    const clean = stripTypeSuffix(header);
    if (clean === '') return;
    const hu = unitFromHeader(header);
    const key = headerKey(hu.name);
    if (FLAG.test(key)) return;
    const dwc = dwcColumn(clean, dwcSheet);
    const cand = dwc ? ('cand' in dwc ? dwc.cand : undefined) : nameCandidate(key, { unitText: hu.unitText, cleanHeader: clean });
    if (cand) {
      named.add(cand.slot);
      return;
    }
    const b = bareCoordinate(key, hu.unitText, clean);
    if (b && b !== 'never' && !b.marked && valuesFitAxis(rows, index, b.axis, ctx.decimalComma)) fits.push({ index, axis: b.axis, clean });
  });
  const out = new Map<number, Cand>();
  for (const f of fits) {
    // a proper column already holds this axis: the bare word is something else (a length, a width) and stays a plain column
    if (named.has(f.axis)) continue;
    const other = f.axis === 'latitude' ? 'longitude' : 'latitude';
    if (!named.has(other) && !fits.some((g) => g.axis === other)) continue;
    out.set(f.index, {
      slot: f.axis,
      tier: 3,
      kind: f.axis,
      why: why(f.axis === 'latitude' ? 'bare-latitude' : 'bare-longitude', { name: f.clean }),
    });
  }
  return out;
}

/** The axis the letters of a column name: only N / S (and the words) is latitude, only E / W is longitude; undefined when both kinds, or neither, are present. */
function letterAxis(rows: readonly RawRow[], col: number): 'latitude' | 'longitude' | undefined {
  let lat = 0;
  let lon = 0;
  for (const r of rows) {
    const letter = hemisphereLetter(r.cells[col] ?? null);
    if (letter === 'N' || letter === 'S') lat++;
    else if (letter === 'E' || letter === 'W') lon++;
  }
  return lat > 0 && lon === 0 ? 'latitude' : lon > 0 && lat === 0 ? 'longitude' : undefined;
}

/** Text that stands for a missing value without being one of the parser's NA tokens: '-', '?', 'unknown', 'n.d.'. */
const PLACEHOLDER = /^\s*([-–—−?]|unknown|n\.?\s?d\.?|n\/?a)\s*$/i;
const isFilled = (c: RawCell): boolean => !isBlank(c) && !(typeof c === 'string' && PLACEHOLDER.test(c));

/**
 * Does the coordinate column carry its own signs or hemisphere letters? Only when MOST of its filled values do (a minus sign before a number, or a
 * letter N/S/E/W). Placeholders for a missing value never count, and a single negative among unsigned values is a typo the per-cell
 * ROW-HEMISPHERE-CONFLICT reports, not a reason to leave the letters column unused.
 */
function carriesOwnSigns(rows: readonly RawRow[], col: number): boolean {
  let filled = 0;
  let signed = 0;
  for (const r of rows) {
    const c = r.cells[col] ?? null;
    if (!isFilled(c)) continue;
    filled++;
    if (typeof c === 'number' ? c < 0 : typeof c === 'string' && /^\s*[-−–]\s*[\d.,]|^\s*[NSEW][\s°]*\d|[\d°'"′″]\s*[NSEW]\s*$/i.test(c)) signed++;
  }
  return filled > 0 && signed * 2 > filled;
}

/** Do MOST of the filled values of the column read as a hemisphere letter or word (N, s, East ...)? Süd, Nord, O, Ost do not, so such a column is not proposed. */
function mostlyLetters(rows: readonly RawRow[], col: number): boolean {
  let filled = 0;
  let known = 0;
  for (const r of rows) {
    const c = r.cells[col] ?? null;
    if (!isFilled(c)) continue;
    filled++;
    if (hemisphereLetter(c) !== undefined) known++;
  }
  return filled > 0 && known * 2 > filled;
}

/**
 * A column of hemisphere letters that is tied to the coordinate it signs becomes the role `hemisphere` (low confidence); every other one stays ignored.
 * It is tied to the MAPPED column of its axis when: the header names the axis (or the values do, only N/S or only E/W) AND the coordinate is unsigned AND
 * the start / end word agrees ('Beg Lat Dir' signs 'Begin Latitude', never 'End Latitude'; 'End Lat Dir' therefore stays ignored while the end position is). A
 * header without a start / end word signs the mapped one when it is the only coordinate of that axis, when it sits right beside it, or when the other
 * coordinates of the axis each have a hemisphere column of their own. Otherwise the pairing is ambiguous and nothing is paired (the reason says so).
 */
function pairHemisphereColumns(
  entries: readonly { proposal: ColumnProposal; cand?: { slot: string }; hemi?: true }[],
  bySlot: ReadonlyMap<string, number[]>,
  rows: readonly RawRow[],
): void {
  const boundOf = (header: string): 'start' | 'end' | undefined => coordinateBound(headerKey(unitFromHeader(header).name))?.bound;
  const hemis = entries
    .filter((e) => e.hemi)
    .map((e) => {
      const t = hemisphereTarget(headerKey(unitFromHeader(e.proposal.header).name));
      const v = letterAxis(rows, e.proposal.index);
      const axis = t.axis ?? v;
      return { e, axis: t.axis !== undefined && v !== undefined && t.axis !== v ? undefined : axis, bound: t.bound, named: t.axis !== undefined };
    });
  const taken = new Set<number>(); // the coordinates that already have their letter column: at most one each
  for (const h of hemis) {
    if (h.axis === undefined || !mostlyLetters(rows, h.e.proposal.index)) continue;
    const slot = bySlot.get(h.axis) ?? [];
    const mappedAt = slot.find((i) => entries[i].proposal.role.kind === h.axis);
    if (mappedAt === undefined) continue;
    const mapped = entries[mappedAt].proposal;
    if (carriesOwnSigns(rows, mapped.index)) {
      applyReason(h.e.proposal, why('hemisphere-signed', { name: mapped.cleanHeader }), []);
      continue;
    }
    const mappedBound = boundOf(mapped.header);
    let tied: boolean;
    if (h.bound !== undefined) tied = mappedBound === h.bound;
    else if (slot.length === 1) tied = h.named || Math.abs(h.e.proposal.index - mapped.index) === 1;
    else {
      const others = slot.filter((i) => i !== mappedAt);
      const claimedByOther = (i: number): boolean => {
        const b = boundOf(entries[i].proposal.header);
        return b !== undefined && hemis.some((o) => o !== h && o.axis === h.axis && o.bound === b);
      };
      tied = Math.abs(h.e.proposal.index - mapped.index) === 1 || others.every(claimedByOther);
      if (!tied) applyReason(h.e.proposal, why('hemisphere-ambiguous', { name: mapped.cleanHeader }), []);
    }
    if (!tied) continue;
    if (taken.has(mappedAt)) {
      applyReason(h.e.proposal, why('hemisphere-ambiguous', { name: mapped.cleanHeader }), []);
      continue;
    }
    taken.add(mappedAt);
    h.e.proposal.role = { kind: 'hemisphere', axis: h.axis };
    h.e.proposal.confidence = 'low';
    applyReason(h.e.proposal, why('hemisphere-pair', { name: mapped.cleanHeader }), []);
  }
}

/** Proposes a role for every column of a sheet, in column order. */
export function proposeColumns(sheet: RawSheet, ctx: ProposeContext): ColumnProposal[] {
  const rows = sampleRows(sheet);
  const long = ctx.long;
  const longCols = long ? new Set([long.parameterCol, long.valueCol, ...(long.unitCol === undefined ? [] : [long.unitCol])]) : new Set<number>();

  interface Entry {
    proposal: ColumnProposal;
    cand?: Cand;
    elevation?: boolean;
    /** A column of hemisphere letters: pairHemisphereColumns may tie it to the mapped coordinate. */
    hemi?: true;
  }
  const dwcSheet = isDwcSheet(sheet.header);
  const bareCands = bareCoordinates(sheet, rows, ctx, longCols, dwcSheet);
  const entries: Entry[] = sheet.header.map((header, index): Entry => {
    const cleanHeader = stripTypeSuffix(header);
    const base = { index, header, cleanHeader };
    const ignore = (w: Why, confidence: 'high' | 'low' = 'high'): Entry => ({
      proposal: { ...base, role: { kind: 'ignore' }, confidence, ...reasonOf(w) },
    });

    if (longCols.has(index)) return ignore(why('long-format'));
    if (cleanHeader === '') return ignore(why('no-header'), 'low');

    const hu = unitFromHeader(header);
    const key = headerKey(hu.name);
    const code = p01CodeOf(cleanHeader);
    const hint = code?.hint;

    // 1. header names
    if (FLAG.test(key)) return ignore(why('quality-flag'));
    // a header that names a hemisphere letter ('Lon Dir', 'Lat NS'): the VALUES decide. Numbers keep the header's old reading (a coordinate, or a variable such as the ratio N:S)
    if (isHemisphereHeader(key) && !isNumeric(numericStats(rows, index, ctx.decimalComma))) return { ...ignore(why('hemisphere'), 'low'), hemi: true };

    const dwc = dwcColumn(cleanHeader, dwcSheet);
    if (dwc && 'ignore' in dwc) return ignore(dwc.ignore);
    let cand = dwc ? dwc.cand : (nameCandidate(key, { unitText: hu.unitText, cleanHeader }) ?? bareCands.get(index));
    if (cand?.guard && !guardPasses(cand.guard, sheet, rows, index, ctx)) cand = undefined; // an ambiguous name the values do not back
    if (cand?.fitAxis && !valuesFitAxis(rows, index, cand.kind === 'longitude' ? 'longitude' : 'latitude', ctx.decimalComma)) cand = undefined;
    let candidate: Cand | undefined = cand;
    let pressure = isPressureName(key, hu.unitText);
    let variableKey: string | undefined;
    let unit = hu.unit;
    let unitSource: 'header' | 'p01' | undefined = hu.unit === undefined ? undefined : 'header';
    let p01Code: string | undefined;
    let reasonExtra: Why | undefined;

    // 2. P01 codes (only when the name said nothing)
    if (!candidate && !pressure && code && hint) {
      p01Code = code.code;
      if (hint.role === 'pressure') pressure = true;
      else if (hint.role === 'depth') candidate = { slot: 'depth', tier: 2, kind: 'depth', why: p01Why(code.code, hint.meaning) };
      else if (hint.role === 'latitude') candidate = { slot: 'latitude', tier: 2, kind: 'latitude', why: p01Why(code.code, hint.meaning) };
      else if (hint.role === 'longitude') candidate = { slot: 'longitude', tier: 2, kind: 'longitude', why: p01Why(code.code, hint.meaning) };
      else if (hint.role === 'datetime') candidate = { slot: 'when', tier: 2, kind: 'datetime', why: p01Why(code.code, hint.meaning) };
      else {
        variableKey = hint.variable;
        reasonExtra = p01Why(code.code, hint.meaning);
      }
      if (hint.unit !== undefined && unit === undefined) {
        unit = hint.unit;
        unitSource = 'p01';
      }
    } else if (!candidate && !pressure && code?.declared) {
      p01Code = code.code; // declared by the file itself, not in our table
    }

    if (candidate && (candidate.kind === 'latitude' || candidate.kind === 'longitude') && holdsOnlyHemisphereLetters(rows, index)) return { ...ignore(why('hemisphere'), 'low'), hemi: true };

    if (candidate) {
      return { proposal: { ...base, role: { kind: 'ignore' }, confidence: candidate.tier >= 3 ? 'low' : 'high', ...reasonOf(candidate.why) }, cand: candidate, elevation: candidate.elevation };
    }

    if (pressure) {
      const pUnit = unit;
      const role: ColumnRole = pUnit === undefined ? { kind: 'pressure' } : { kind: 'pressure', unit: pUnit };
      return { proposal: { ...base, role, confidence: 'high', ...reasonOf(hint && code ? p01Why(code.code, hint.meaning) : why('name-pressure')) } };
    }

    // 3. xlsx date-formatted column
    if (sheet.dateFormatted?.[index]) {
      const d = hasTimeOfDay(rows, index, ctx, true);
      const c: Cand = { slot: 'when', tier: 1, kind: d ? 'datetime' : 'date', why: why('excel-date') };
      return { proposal: { ...base, role: { kind: 'ignore' }, confidence: 'high', ...reasonOf(c.why) }, cand: c };
    }

    const st = numericStats(rows, index, ctx.decimalComma);
    // a spread or an extreme of a variable ('Temperature st.dev.', 'Salinity max') is not the variable itself: it keeps its own name, so that two columns never claim one variable
    const stat = statisticOfName(key);
    const canonical = variableKey ?? (stat?.statistic === true ? undefined : canonicalFromKey(stat === undefined ? key : stat.base));

    // 4. values: degrees + minutes with hemisphere letters, ISO dates (only when no name or code explained the column)
    if (canonical === undefined && !isNumeric(st)) {
      const axis = dmAxis(rows, index, ctx.decimalComma);
      if (axis) {
        const c: Cand = { slot: axis === 'lat' ? 'latitude' : 'longitude', tier: 3, kind: axis === 'lat' ? 'latitude' : 'longitude', why: why('values-degmin') };
        return { proposal: { ...base, role: { kind: 'ignore' }, confidence: 'low', ...reasonOf(c.why) }, cand: c };
      }
      let isoDates = 0;
      let seen = 0;
      for (const r of rows.slice(0, 200)) {
        const c = r.cells[index] ?? null;
        if (typeof c !== 'string' || isBlank(c)) continue;
        seen++;
        const d = parseDate(c, { date1904: ctx.date1904, dateFormatted: false });
        if (!('error' in d) && d.precision !== 'year' && d.precision !== 'month' && /\d{2,4}-\d{2}-\d{2}/.test(c)) isoDates++;
      }
      if (seen > 0 && isoDates === seen) {
        const t = hasTimeOfDay(rows, index, ctx, false);
        const c: Cand = { slot: 'when', tier: 3, kind: t ? 'datetime' : 'date', why: why('values-iso-dates') };
        return { proposal: { ...base, role: { kind: 'ignore' }, confidence: 'low', ...reasonOf(c.why) }, cand: c };
      }
      return ignore(why('text-column'), 'high');
    }

    // 5. variable. An identifier or an abundance is never one (a canonical name such as temperature wins over these words)
    if (canonical === undefined) {
      // an abundance with a unit (ind/m2, cells/L, %) is a density or another measurement; only a plain count unit ([n], [ind]) leaves it an abundance
      if (ctx.keepAbundance !== true && isAbundanceName(key) && (hu.unitText === undefined || PLAIN_COUNT_UNIT.test(hu.unitText.trim()))) return ignore(why('abundance'), 'low');
      if (isIdentifierName(key, cleanHeader, hu.name)) return ignore(why('identifier'), 'low');
    }
    const name = hu.name;
    const variable = canonical ?? name;
    const role: ColumnRole = {
      kind: 'variable',
      variable,
      ...(unit === undefined ? {} : { unit, unitSource }),
      ...(p01Code === undefined ? {} : { p01: p01Code }),
    };
    const w = reasonExtra ?? (canonical ? why('name-variable', { variable: canonical }) : why('numeric-unrecognised'));
    return { proposal: { ...base, role, confidence: canonical ? 'high' : 'low', ...reasonOf(w) } };
  });

  // a candidate whose sampled values are all blank cannot win a slot over one that has values
  for (const e of entries) {
    if (e.cand) {
      const col = e.proposal.index;
      e.cand.empty = rows.every((r) => isBlank(r.cells[col] ?? null));
    }
  }

  // one column per slot: a column with values first, then the best tier, then the leftmost
  const bySlot = new Map<SlotKind, number[]>();
  entries.forEach((e, i) => {
    if (e.cand) bySlot.set(e.cand.slot, [...(bySlot.get(e.cand.slot) ?? []), i]);
  });
  for (const [slot, idxs] of bySlot) {
    const winner = idxs
      .slice()
      .sort((a, b) => Number(entries[a].cand!.empty) - Number(entries[b].cand!.empty) || entries[a].cand!.tier - entries[b].cand!.tier || a - b)[0];
    for (const i of idxs) {
      const e = entries[i];
      const c = e.cand!;
      if (i !== winner) {
        const w = entries[winner].proposal.cleanHeader;
        e.proposal.role = { kind: 'ignore' };
        e.proposal.confidence = 'low';
        const lead = c.empty && !entries[winner].cand!.empty ? why('lead-empty') : undefined;
        if (c.coordEnd) applyReason(e.proposal, why('end-position', { name: w }), [], lead);
        else applyReason(e.proposal, why(OTHER_USED[slot], { name: w }), [...(c.bound ? [why('note-depth-range-unread')] : [])], lead);
        continue;
      }
      const hu = unitFromHeader(e.proposal.header);
      const code = p01CodeOf(e.proposal.cleanHeader);
      switch (c.kind) {
        case 'latitude':
        case 'longitude':
        case 'datetime':
        case 'date':
        case 'time':
        case 'station':
        case 'cruise':
        case 'sampleId':
          e.proposal.role = { kind: c.kind };
          if (c.coordEnd) {
            e.proposal.confidence = 'low';
            applyReason(e.proposal, why('end-position-only'), []);
          }
          break;
        case 'depth': {
          const unit = hu.unit ?? code?.hint?.unit;
          if (c.dwcDepth) {
            e.proposal.role = { kind: 'depth', positive: 'down', unit: 'm' };
            break;
          }
          const sign = depthPositive(rows, e.proposal.index, ctx.decimalComma, c.elevation === true);
          let positive: 'down' | 'up' | 'unknown';
          const header = e.proposal.header.replace(/_/g, ' ');
          {
            positive = sign;
            if (positive === 'up' && !c.elevation) applyReason(e.proposal, undefined, [why('note-negative-up')]);
            // A depth word with non-negative values IS the downward convention (the definition of depth). A header that is not a depth
            // word, states no direction and is not a P01 depth code (a column that only values or the user made depth) is a default.
            if (positive === 'down' && !DEPTH_WORD.test(header) && !DEPTH_WORD_OTHER.test(headerKey(header)) && !DEPTH_DOWN_WORDS.test(header) && c.why.code !== 'p01') {
              positive = 'unknown';
              e.proposal.confidence = 'low';
              applyReason(e.proposal, undefined, [why('note-depth-not-stated')]);
            }
          }
          e.proposal.role = unit === undefined ? { kind: 'depth', positive } : { kind: 'depth', positive, unit };
          break;
        }
      }
    }
  }

  pairHemisphereColumns(entries, bySlot, rows);

  // a date column whose values carry a time of day is a datetime
  for (const e of entries) {
    const r = e.proposal.role;
    if (r.kind === 'date' && hasTimeOfDay(rows, e.proposal.index, ctx, sheet.dateFormatted?.[e.proposal.index] === true)) {
      e.proposal.role = { kind: 'datetime' };
    }
  }

  return entries.map((e) => e.proposal);
}

/** The proposals as a SheetMapping, as the pipeline accepts them without editing. */
export function toMapping(sheet: RawSheet, proposals: readonly ColumnProposal[]): SheetMapping {
  return { sheet: sheet.name, columns: proposals.map((p) => ({ index: p.index, header: p.header, role: p.role })) };
}

export { isBlank as isBlankCell };
