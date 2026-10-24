// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ColumnProposal, ColumnRole, RawCell, RawRow, RawSheet, SheetMapping, TablePlan } from '../types';
import { parseCoordinate } from '../values/coords';
import { parseDate, parseTimeOfDay } from '../values/dates';
import { NA_TOKENS, parseNumber } from '../values/numbers';
import { canonicalFromKey, headerKey, isUnitAlias, normaliseUnit, p01CodeOf } from './vocab';

export interface ProposeContext {
  decimalComma: boolean;
  date1904: boolean;
  /** When the sheet is a long table, its parameter / unit / value columns are read through the layout, not as columns. */
  long?: TablePlan['long'];
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
  reason: string;
  elevation?: boolean;
  /** Darwin Core depth: always metres, positive down; never inferred from the values. */
  dwcDepth?: boolean;
  /** Every sampled value is blank; set after the columns are read. */
  empty?: boolean;
  /** The name alone is ambiguous (data, Zeit, ...): the column's values must back it, see guardPasses. */
  guard?: 'date-values' | 'not-plain-numbers' | 'time-values';
  /** Depth from/to (od/do, von/bis, de/a): which end of a range; two bounds compete for the one depth slot. */
  bound?: 'from' | 'to';
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
  const lon = lat ? null : LON_BARE.exec(key);
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
const OTHER_DEPTH = /\b(secchi|mixed layer|mld|euphotic|photic|thermocline|chlorophyll max|compensation)\b/;
const FLAG = /^(qf|qc|flag)( |$)|( flag| flags| qf| qc)$|^quality( flag| control| code)?( |$)/;

function nameCandidate(key: string, hdr?: NameHeader): Cand | undefined {
  const other = nameCandidateOther(key, hdr);
  if (other) return other;
  if (/^lat(\s|$)|^latit\w*(\s|$)/.test(key)) {
    return { slot: 'latitude', tier: key === 'latitude' || key === 'lat' ? 0 : 1, kind: 'latitude', reason: 'name says latitude' };
  }
  if (/^(lon|long|lng)(\s|$)|^longit\w*(\s|$)/.test(key)) {
    return { slot: 'longitude', tier: ['longitude', 'lon', 'long', 'lng'].includes(key) ? 0 : 1, kind: 'longitude', reason: 'name says longitude' };
  }
  if (/^(date ?time|timestamp|time ?stamp|date and time)(\s|$)/.test(key)) {
    return { slot: 'when', tier: 0, kind: 'datetime', reason: 'name says date and time' };
  }
  if (/^((sampling|sample|collection|start|observation|measurement) )?date( utc)?$/.test(key)) {
    return { slot: 'when', tier: key === 'date' ? 0 : 1, kind: 'date', reason: 'name says date' };
  }
  if (/^((sampling|sample|collection|start|observation|measurement) )?time( utc| of day| hh mm| hhmm)?$/.test(key)) {
    return { slot: 'time', tier: key === 'time' ? 0 : 1, kind: 'time', reason: 'name says time of day' };
  }
  if (/^(elevation|altitude)(\s|$)/.test(key)) {
    return { slot: 'depth', tier: 2, kind: 'depth', reason: 'name says elevation (positive up)', elevation: true };
  }
  if (/\bdepth\b/.test(key) && !SITE_DEPTH.test(key) && !OTHER_DEPTH.test(key)) {
    return { slot: 'depth', tier: key === 'depth' ? 0 : 1, kind: 'depth', reason: 'name says depth' };
  }
  if (/^(pressure|pres|press|prs)(\s|$)/.test(key)) return undefined; // pressure is not a slot, handled by the caller
  if (/^(cruise( id| name| no| number| code)?|expedition( \w+)?|campaign( \w+)?|survey|leg)$/.test(key)) {
    return { slot: 'cruise', tier: key === 'cruise' ? 0 : 1, kind: 'cruise', reason: 'name says cruise or expedition' };
  }
  if (/^(station( name| id| code| no| number| nr| label)?|stn( \w+)?|st|sta|site( id| name| code| no)?|event|label)$/.test(key)) {
    return { slot: 'station', tier: key === 'station' ? 0 : 1, kind: 'station', reason: 'name says station, site or event' };
  }
  if (/^(sample( id| no| number| name| code| label)?|core( id| name| no| number)?|specimen( id)?|bottle( id| no| number)?|id)$/.test(key)) {
    return { slot: 'sampleId', tier: 1, kind: 'sampleId', reason: 'name says sample or core identifier' };
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
  if (LAT_SAFE.test(key)) return { slot: 'latitude', tier: 1, kind: 'latitude', reason: 'name says latitude' };
  if (LON_SAFE.test(key)) return { slot: 'longitude', tier: 1, kind: 'longitude', reason: 'name says longitude' };
  const bare = bareCoordinate(key, hdr?.unitText, hdr?.cleanHeader ?? '');
  if (bare && bare !== 'never' && bare.marked) {
    return { slot: bare.axis, tier: 1, kind: bare.axis, reason: `name says ${bare.axis} (a degree unit or hemisphere letter backs it)` };
  }
  // date and time in one column
  if (/^(data (i )?(godzina|czas)|datum (und )?(uhrzeit|zeit)|zeitstempel|date (et )?(heure|temps)|horodatage)( |$)/.test(key)) {
    return { slot: 'when', tier: 0, kind: 'datetime', reason: 'name says date and time' };
  }
  // date. 'data' (also Latin, Italian, English "data") and 'datum' (also a geodetic datum) need values that fit.
  if (key === 'data') return { slot: 'when', tier: 0, kind: 'date', reason: 'name says date', guard: 'date-values' };
  if (key === 'datum') return { slot: 'when', tier: 0, kind: 'date', reason: 'name says date', guard: 'not-plain-numbers' };
  if (
    /^data (poboru|pomiaru|pobrania|probkowania|obserwacji|zbioru|rozpoczecia|startu|badan)( utc)?$/.test(key) ||
    /^(probenahme|mess|beobachtungs|entnahme|start)datum( utc)?$|^datum (der )?(probenahme|messung|beobachtung|entnahme|beginn|start)( utc)?$/.test(key) ||
    /^date (de |d )?(prelevement|echantillonnage|mesure|observation|collecte|debut|depart)( utc)?$/.test(key)
  ) {
    return { slot: 'when', tier: 1, kind: 'date', reason: 'name says date' };
  }
  // time of day. 'czas' / 'Zeit' / 'temps' can be a duration: the values must read as times of day.
  if (/^(czas|zeit|temps)( utc| gmt| lokalny| lokalna| ortszeit| locale)?$/.test(key)) {
    return { slot: 'time', tier: key === 'czas' || key === 'zeit' || key === 'temps' ? 0 : 1, kind: 'time', reason: 'name says time of day', guard: 'time-values' };
  }
  if (
    /^(godzina|godz|uhrzeit|heure)( utc| gmt| lokalna| ortszeit| locale| hh mm| hhmm)?$/.test(key) ||
    /^(godzina|godz) (poboru|pobrania|pomiaru|rozpoczecia)( utc)?$|^(mess|probenahme)uhrzeit( utc)?$|^heure (de )?(prelevement|mesure|debut)( utc)?$/.test(key)
  ) {
    return { slot: 'time', tier: ['godzina', 'uhrzeit', 'heure'].includes(key) ? 0 : 1, kind: 'time', reason: 'name says time of day' };
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
    return { slot: 'cruise', tier: key === 'rejs' ? 0 : 1, kind: 'cruise', reason: 'name says cruise or expedition' };
  }
  if (/^(fahrt( nr| nummer| name| id)?|reise( nr| nummer| name| id)?|fahrtnummer|reisenummer|forschungsfahrt|kampagne( nr| nummer| name)?)$/.test(key)) {
    return { slot: 'cruise', tier: key === 'fahrt' || key === 'reise' ? 0 : 1, kind: 'cruise', reason: 'name says cruise or expedition' };
  }
  if (/^(campagne( nom| id| code| numero| no)?|(nom|numero|n|code) (de |d )?(la )?campagne|croisiere( nom| id| code| numero)?|mission)$/.test(key)) {
    return { slot: 'cruise', tier: key === 'campagne' || key === 'croisiere' ? 0 : 1, kind: 'cruise', reason: 'name says cruise or expedition' };
  }
  // station
  if (/^(stacja( nr| numer| nazwa| kod| id)?|(numer|nr|kod|nazwa|id) stacji|stanowisko( nr| numer| nazwa| kod)?)$/.test(key)) {
    return { slot: 'station', tier: key === 'stacja' ? 0 : 1, kind: 'station', reason: 'name says station, site or event' };
  }
  if (/^(stations ?(nr|nummer|name|code|id|kennung)|stationsname|stationsnummer|stationsnr|messstation|standort( nr| name| id)?|probenahmestelle|station (nr|nummer|name|code|id|kennung))$/.test(key)) {
    return { slot: 'station', tier: 1, kind: 'station', reason: 'name says station, site or event' };
  }
  if (/^(station (de mesure|nom|numero|no)|(nom|numero|n|code) (de |d )?(la )?station|code station|nom station|numero station)$/.test(key)) {
    return { slot: 'station', tier: 1, kind: 'station', reason: 'name says station, site or event' };
  }
  // sample or core id. German 'Probe' is a sample or a test: a bare 'Probe' stays a low-confidence proposal.
  if (/^(probka|(nr|numer|id|kod|nazwa|oznaczenie|identyfikator) probki|probka (nr|numer|id|kod|nazwa)|rdzen|(nr|numer|id|kod|nazwa) rdzenia|rdzen (nr|numer|id|kod|nazwa))$/.test(key)) {
    return { slot: 'sampleId', tier: 1, kind: 'sampleId', reason: 'name says sample or core identifier' };
  }
  if (/^(probe (nr|nummer|id|name|kennung|bezeichnung)|proben ?(nr|nummer|id|name|kennung|bezeichnung)|kern( nr| nummer| id| name)?|kernnummer|bohrkern( nr| nummer| id| name)?)$/.test(key)) {
    return { slot: 'sampleId', tier: 1, kind: 'sampleId', reason: 'name says sample or core identifier' };
  }
  if (key === 'probe') return { slot: 'sampleId', tier: 3, kind: 'sampleId', reason: 'name says sample (German "Probe" can also be a test)' };
  if (/^(echantillon( id| no| numero| nom| code)?|(id|code|nom|numero|n) (de |d )?(l )?echantillon|identifiant( echantillon)?|carotte( id| no| numero| nom| code)?|(id|code|nom|numero|n) (de |d )?(la )?carotte)$/.test(key)) {
    return { slot: 'sampleId', tier: 1, kind: 'sampleId', reason: 'name says sample or core identifier' };
  }
  return undefined;
}

/** A depth column named in Polish, German or French. The start of a range ranks before its end, so the first bound wins the one depth slot. */
function depthName(rest: string | undefined, word: string, from: RegExp, to: RegExp): Cand {
  const base: Cand = { slot: 'depth', tier: rest === undefined ? 0 : 1, kind: 'depth', reason: 'name says depth' };
  if (rest !== undefined && from.test(rest)) return { ...base, tier: 1, bound: 'from', reason: `name says depth (${word} ${rest}: start of a depth range)` };
  if (rest !== undefined && to.test(rest)) return { ...base, tier: 1.5, bound: 'to', reason: `name says depth (${word} ${rest}: end of a depth range)` };
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

const DWC_CAND: Record<string, Omit<Cand, 'reason'> & { reason?: string }> = {
  decimallatitude: { slot: 'latitude', tier: 0, kind: 'latitude' },
  decimallongitude: { slot: 'longitude', tier: 0, kind: 'longitude' },
  verbatimlatitude: { slot: 'latitude', tier: 1, kind: 'latitude' },
  verbatimlongitude: { slot: 'longitude', tier: 1, kind: 'longitude' },
  eventdate: { slot: 'when', tier: 0, kind: 'date', reason: 'Darwin Core eventDate (where eventDate is empty, year/month/day are used)' },
  eventtime: { slot: 'time', tier: 0, kind: 'time' },
  minimumdepthinmeters: { slot: 'depth', tier: 0, kind: 'depth', dwcDepth: true, reason: 'Darwin Core: depth below the surface in metres (positive down)' },
  maximumdepthinmeters: { slot: 'depth', tier: 1, kind: 'depth', dwcDepth: true, reason: 'Darwin Core: depth below the surface in metres (positive down)' },
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

function dwcColumn(header: string, dwcSheet: boolean): { cand: Cand } | { ignore: string } | undefined {
  const d = dwcHeader(header);
  if (!d) return undefined;
  const t = d.term.toLowerCase();
  const generic = DWC_GENERIC.has(t);
  if (!d.prefixed && generic && !dwcSheet) return undefined;
  if (!d.prefixed && !generic && !DWC_MARKERS.has(t) && !(dwcSheet && /id$/.test(t) && t.length > 2 && t !== 'id')) return undefined;
  const c = DWC_CAND[t];
  if (c) return { cand: { ...c, reason: c.reason ?? `Darwin Core ${d.term}` } };
  if (t === 'locality') return { cand: { slot: 'station', tier: 1, kind: 'station', reason: 'Darwin Core locality' } };
  if (DWC_IGNORED.has(t) || DWC_GENERIC.has(t) || t.endsWith('id')) {
    return { ignore: `Darwin Core ${d.term}: identifier, count or bookkeeping, not a measured variable` };
  }
  return undefined;
}

const isPressureName = (key: string): boolean => /^(pressure|pres|press|prs|cisnienie|druck|pression)(\s|$)/.test(key);

/** Does a text cell read like the name of a standard column (latitude, depth, DIC, ...)? Used to spot transposed tables. */
export function isKnownColumnName(label: string): boolean {
  const key = headerKey(unitFromHeader(label).name);
  return key !== '' && (nameCandidate(key) !== undefined || isPressureName(key) || canonicalFromKey(key) !== undefined);
}

/* ---------- main ---------- */

const NEGATIVE_UP = 'negative values: depth is positive up';
const DEPTH_NOT_STATED = 'the header does not say whether depth is counted down or up';
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

/** Do the sampled values back an ambiguous name? Blank columns never do. */
function guardPasses(guard: NonNullable<Cand['guard']>, sheet: RawSheet, rows: readonly RawRow[], col: number, ctx: ProposeContext): boolean {
  const dateFormatted = sheet.dateFormatted?.[col] === true;
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

/** Every non-blank sampled value is a number within the range of the axis (|lat| <= 90, |lon| <= 180). */
function valuesFitAxis(rows: readonly RawRow[], col: number, axis: 'latitude' | 'longitude', decimalComma: boolean): boolean {
  const limit = axis === 'latitude' ? 90 : 180;
  let ok = 0;
  for (const r of rows) {
    const c = r.cells[col] ?? null;
    if (isBlank(c)) continue;
    const p = parseNumber(c, decimalComma);
    if (p.status !== 'ok' || Math.abs(p.value) > limit) return false;
    ok++;
  }
  return ok > 0;
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
    const other = f.axis === 'latitude' ? 'longitude' : 'latitude';
    if (!named.has(other) && !fits.some((g) => g.axis === other)) continue;
    out.set(f.index, {
      slot: f.axis,
      tier: 3,
      kind: f.axis,
      reason: `"${f.clean}" can also be a width or a length; the values fit ${f.axis} and a ${other} column is present`,
    });
  }
  return out;
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
  }
  const dwcSheet = isDwcSheet(sheet.header);
  const bareCands = bareCoordinates(sheet, rows, ctx, longCols, dwcSheet);
  const entries: Entry[] = sheet.header.map((header, index): Entry => {
    const cleanHeader = stripTypeSuffix(header);
    const base = { index, header, cleanHeader };
    const ignore = (reason: string, confidence: 'high' | 'low' = 'high'): Entry => ({
      proposal: { ...base, role: { kind: 'ignore' }, confidence, reason },
    });

    if (longCols.has(index)) return ignore('long format: this column is read through the layout (parameter, unit or value)');
    if (cleanHeader === '') return ignore('column without a header', 'low');

    const hu = unitFromHeader(header);
    const key = headerKey(hu.name);
    const code = p01CodeOf(cleanHeader);
    const hint = code?.hint;

    // 1. header names
    if (FLAG.test(key)) return ignore('quality flag column');

    const dwc = dwcColumn(cleanHeader, dwcSheet);
    if (dwc && 'ignore' in dwc) return ignore(dwc.ignore);
    let cand = dwc ? dwc.cand : (nameCandidate(key, { unitText: hu.unitText, cleanHeader }) ?? bareCands.get(index));
    if (cand?.guard && !guardPasses(cand.guard, sheet, rows, index, ctx)) cand = undefined; // an ambiguous name the values do not back
    let candidate: Cand | undefined = cand;
    let pressure = isPressureName(key);
    let variableKey: string | undefined;
    let unit = hu.unit;
    let unitSource: 'header' | 'p01' | undefined = hu.unit === undefined ? undefined : 'header';
    let p01Code: string | undefined;
    let reasonExtra = '';

    // 2. P01 codes (only when the name said nothing)
    if (!candidate && !pressure && code && hint) {
      p01Code = code.code;
      if (hint.role === 'pressure') pressure = true;
      else if (hint.role === 'depth') candidate = { slot: 'depth', tier: 2, kind: 'depth', reason: `NERC P01 ${code.code}: ${hint.meaning}` };
      else if (hint.role === 'latitude') candidate = { slot: 'latitude', tier: 2, kind: 'latitude', reason: `NERC P01 ${code.code}: ${hint.meaning}` };
      else if (hint.role === 'longitude') candidate = { slot: 'longitude', tier: 2, kind: 'longitude', reason: `NERC P01 ${code.code}: ${hint.meaning}` };
      else if (hint.role === 'datetime') candidate = { slot: 'when', tier: 2, kind: 'datetime', reason: `NERC P01 ${code.code}: ${hint.meaning}` };
      else {
        variableKey = hint.variable;
        reasonExtra = `NERC P01 ${code.code}: ${hint.meaning}`;
      }
      if (hint.unit !== undefined && unit === undefined) {
        unit = hint.unit;
        unitSource = 'p01';
      }
    } else if (!candidate && !pressure && code?.declared) {
      p01Code = code.code; // declared by the file itself, not in our table
    }

    if (candidate) {
      return { proposal: { ...base, role: { kind: 'ignore' }, confidence: candidate.tier >= 3 ? 'low' : 'high', reason: candidate.reason }, cand: candidate, elevation: candidate.elevation };
    }

    if (pressure) {
      const pUnit = unit;
      const role: ColumnRole = pUnit === undefined ? { kind: 'pressure' } : { kind: 'pressure', unit: pUnit };
      return { proposal: { ...base, role, confidence: 'high', reason: hint ? `NERC P01 ${code?.code}: ${hint.meaning}` : 'name says pressure' } };
    }

    // 3. xlsx date-formatted column
    if (sheet.dateFormatted?.[index]) {
      const d = hasTimeOfDay(rows, index, ctx, true);
      const c: Cand = { slot: 'when', tier: 1, kind: d ? 'datetime' : 'date', reason: 'date-formatted Excel column' };
      return { proposal: { ...base, role: { kind: 'ignore' }, confidence: 'high', reason: c.reason }, cand: c };
    }

    const st = numericStats(rows, index, ctx.decimalComma);
    const canonical = variableKey ?? canonicalFromKey(key);

    // 4. values: degrees + minutes with hemisphere letters, ISO dates (only when no name or code explained the column)
    if (canonical === undefined && !isNumeric(st)) {
      const axis = dmAxis(rows, index, ctx.decimalComma);
      if (axis) {
        const c: Cand = { slot: axis === 'lat' ? 'latitude' : 'longitude', tier: 3, kind: axis === 'lat' ? 'latitude' : 'longitude', reason: 'values are degrees and minutes with hemisphere letters' };
        return { proposal: { ...base, role: { kind: 'ignore' }, confidence: 'low', reason: c.reason }, cand: c };
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
        const c: Cand = { slot: 'when', tier: 3, kind: t ? 'datetime' : 'date', reason: 'values are ISO dates' };
        return { proposal: { ...base, role: { kind: 'ignore' }, confidence: 'low', reason: c.reason }, cand: c };
      }
      return ignore('text column (comments, methods, flags, references or empty)', 'high');
    }

    // 5. variable
    const name = hu.name;
    const variable = canonical ?? name;
    const role: ColumnRole = {
      kind: 'variable',
      variable,
      ...(unit === undefined ? {} : { unit, unitSource }),
      ...(p01Code === undefined ? {} : { p01: p01Code }),
    };
    const reason = reasonExtra || (canonical ? `name matches ${canonical}` : 'numeric column with an unrecognised name');
    return { proposal: { ...base, role, confidence: canonical ? 'high' : 'low', reason } };
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
        const bound = c.bound ? '; this one is the other end of a depth range and is not read (one depth column per sheet)' : '';
        const used = `another column ("${w}") is used for ${slot === 'when' ? 'the date' : slot}${bound}`;
        e.proposal.reason = c.empty && !entries[winner].cand!.empty ? `column is empty; ${used}` : used;
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
            if (positive === 'up' && !c.elevation) e.proposal.reason += `; ${NEGATIVE_UP}`;
            // A depth word with non-negative values IS the downward convention (the definition of depth). A header that is not a depth
            // word, states no direction and is not a P01 depth code (a column that only values or the user made depth) is a default.
            if (positive === 'down' && !DEPTH_WORD.test(header) && !DEPTH_WORD_OTHER.test(headerKey(header)) && !DEPTH_DOWN_WORDS.test(header) && !c.reason.startsWith('NERC P01')) {
              positive = 'unknown';
              e.proposal.confidence = 'low';
              e.proposal.reason += `; ${DEPTH_NOT_STATED}`;
            }
          }
          e.proposal.role = unit === undefined ? { kind: 'depth', positive } : { kind: 'depth', positive, unit };
          break;
        }
      }
    }
  }

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
