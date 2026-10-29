// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Kept apart from vocab.ts, whose bytes are pinned (test/convert/variables.test.ts T11).

/* ---------- start / end of a tow, hemisphere letters, identifiers, abundance (header words; keys come from headerKey) ---------- */

/** Words that say "start" / "end" of a track in English, Polish, German and French (headerKey: ASCII, lower case). */
const START_WORDS: ReadonlySet<string> = new Set(['begin', 'beg', 'start', 'starting', 'initial', 'from', 'poczatek', 'poczatkowa', 'poczatkowy', 'pocz', 'anfang', 'anfangs', 'beginn', 'debut']);
const END_WORDS: ReadonlySet<string> = new Set(['end', 'stop', 'final', 'to', 'koniec', 'koncowa', 'koncowy', 'konc', 'ende', 'fin']);
/**
 * The full English / Romance word for each axis, as a regular-expression source for one token (headerKey: lower case ASCII): 'latitude', 'latitud', 'latitudine' and the misspellings
 * seen in real files ('lattitude', 'latitute', 'latidude'); 'longitude', 'longitud' and 'longtitude', 'longitute', 'longditude', 'lontitude', 'longtidude'. 'longt…' is NOT a stem on its
 * own: 'longterm' is a word of its own, so only the spellings of 'longitude' are listed.
 */
export const LATITUDE_SPELLING = 'latit\\w*|lattit\\w*|latid\\w*|lattid\\w*';
export const LONGITUDE_SPELLING = 'longit\\w*|longtit\\w*|longtid\\w*|longdit\\w*|lontit\\w*|lontut\\w*';
const LAT_WORD = new RegExp(`^(lat|${LATITUDE_SPELLING}|szerokosc geogr\\w*|szerokosc (polnocna|poludniowa)|breitengrad|(geographische|geogr) breite)$`);
const LON_WORD = new RegExp(`^(lon|long|lng|${LONGITUDE_SPELLING}|dlugosc geogr\\w*|dlugosc (wschodnia|zachodnia)|l(?:a|ae)ngengrad|(geographische|geogr) l(?:a|ae)nge)$`);
const CONNECTOR = /^(de|du|d|of)$/;
const BARE_LAT = /^(szerokosc|szer|breite)$/;
const BARE_LON = /^(dlugosc|dl|dlug|lange|laenge)$/;
const AXIS_TAIL = /( (dd|deg|degs|degrees|decimal|dec|wgs84))+$/;
const AXIS_GLUED = /^(begin|beg|start|starting|initial|end|stop|final)(lat|lon|long|lng|latitude|longitude)$|^(lat|lon|long|lng|latitude|longitude)(begin|beg|start|end|stop|final)$/;

const ABBREVIATED_AXIS: Readonly<Record<string, 'latitude' | 'longitude'>> = { lat: 'latitude', lon: 'longitude', long: 'longitude', lng: 'longitude' };
// What may follow an abbreviated axis word and still name the coordinate: a degree notation, a datum, a hemisphere letter or word, a start / end word.
// 'Long term mean', 'Long-line catch', 'Lat of station', 'Long axis' are NOT coordinates: 'long' / 'lat' are whole-token abbreviations only here.
const ABBREVIATED_TAIL = /^(dd|dm|ddm|dms|deg|degs|degree|degrees|decimal|dec|min|wgs84|wgs|n|s|e|w|o|north|south|east|west|ost|nord|sud|hemisphere|hemi|hem|dir|direction|ns|ew)$/;

/**
 * The axis an abbreviated name ('Lat', 'Lon', 'Long', 'Lng') stands for, with a tail that is only a unit, a datum, a hemisphere or a start / end word
 * ('Long E', 'Lat deg', 'Lon dd', 'Lat start'); undefined when other words follow ('Long term mean', 'Long line', 'Lat bound mean'). The key is a headerKey.
 */
export function abbreviatedAxis(key: string): 'latitude' | 'longitude' | undefined {
  const tokens = key.split(' ').filter((t) => t !== '');
  const axis = ABBREVIATED_AXIS[tokens[0] ?? ''];
  if (axis === undefined) return undefined;
  return tokens.slice(1).every((t) => ABBREVIATED_TAIL.test(t) || START_WORDS.has(t) || END_WORDS.has(t)) ? axis : undefined;
}

/** The axis a header word names ('lat', 'Latitude', 'Szerokość geogr.', 'Breitengrad'), undefined for anything else. */
export function axisOfWord(key: string): 'latitude' | 'longitude' | undefined {
  const k = key.replace(AXIS_TAIL, '');
  if (LAT_WORD.test(k)) return 'latitude';
  if (LON_WORD.test(k)) return 'longitude';
  return undefined;
}

/**
 * A coordinate header that names the start or the end of a track or tow: 'Begin Latitude', 'End_Lon', 'Lat start', 'Latitude (start)',
 * 'BeginLat', 'Szerokość początkowa', 'Anfang Breitengrad', 'Longitude fin'. The bound word is the first or the last word and the rest is a
 * latitude or longitude name; undefined for every other header ('Start date', 'End Depth', 'Latitude').
 */
export function coordinateBound(key: string): { axis: 'latitude' | 'longitude'; bound: 'start' | 'end'; bare?: true } | undefined {
  const glued = AXIS_GLUED.exec(key);
  if (glued) {
    const word = glued[1] ?? glued[4];
    const axis = (glued[2] ?? glued[3]).startsWith('lat') ? 'latitude' : 'longitude';
    return { axis, bound: START_WORDS.has(word) ? 'start' : 'end' };
  }
  const tokens = key.split(' ').filter((t) => t !== '');
  if (tokens.length < 2) return undefined;
  for (const at of [0, tokens.length - 1]) {
    const word = tokens[at];
    const bound = START_WORDS.has(word) ? 'start' : END_WORDS.has(word) ? 'end' : undefined;
    if (bound === undefined) continue;
    // 'Latitude de fin', 'Begin of latitude': a connector next to the bound word goes with it
    const near = at === 0 ? 1 : at - 1;
    const drop = CONNECTOR.test(tokens[near] ?? '') && tokens.length > 2 ? near : -1;
    const rest = tokens.filter((_, i) => i !== at && i !== drop).join(' ');
    const axis = axisOfWord(rest);
    if (axis !== undefined) return { axis, bound };
    // 'Szerokość początkowa', 'Länge Ende', 'Szer. pocz.', 'Dł. pocz.': a bare width / length word; the caller asks the values to fit the axis
    const bareAxis = BARE_LAT.test(rest) ? 'latitude' : BARE_LON.test(rest) ? 'longitude' : undefined;
    if (bareAxis !== undefined) return { axis: bareAxis, bound, bare: true };
  }
  return undefined;
}

const DIRECTION_WORDS = /^(dir|direction|hemisphere|hemi|hem|polkula|hemisphare|hemisphaere|ns|ew|n s|e w|n s e w|nsew)$/;
const HEMISPHERE_ALONE = /^(hemisphere|polkula|hemisphare|hemisphaere|ns|ew|n s|e w|n s e w|nsew)$/;

/**
 * A header that names the hemisphere letter of a coordinate, never the coordinate: 'Lon Dir', 'Lat Direction', 'Beg Lat Dir', 'End Lon Dir',
 * 'Longitude hemisphere', 'Lat NS', 'Latitude N/S', or a bare 'Hemisphere' / 'NS' / 'EW'. A bare 'Dir' or 'Direction' is not enough (a wind direction is a number).
 */
export function isHemisphereHeader(key: string): boolean {
  if (HEMISPHERE_ALONE.test(key)) return true;
  const tokens = key.split(' ').filter((t) => t !== '');
  const kept = tokens.filter((t) => !START_WORDS.has(t) && !END_WORDS.has(t));
  for (const cut of [kept, tokens]) {
    for (let n = 1; n <= Math.min(3, cut.length - 1); n++) {
      // axis word first ('lat dir', 'latitude n s') or last ('dir lat')
      if (axisOfWord(cut.slice(0, n).join(' ')) !== undefined && DIRECTION_WORDS.test(cut.slice(n).join(' '))) return true;
      if (axisOfWord(cut.slice(cut.length - n).join(' ')) !== undefined && DIRECTION_WORDS.test(cut.slice(0, cut.length - n).join(' '))) return true;
    }
  }
  return false;
}

const HEMISPHERE_NOISE = /^(dir|direction|hemisphere|hemi|hem|polkula|hemisphare|hemisphaere|ns|ew|nsew|n|s|e|w)$/;

/**
 * What a hemisphere column's header says about the coordinate it signs: its axis ('Lon Dir', 'Latitude N/S', 'Beg Lat Dir') and the start or end word
 * ('Beg Lat Dir' starts, 'End Lon Dir' ends). Either is undefined when the header does not say ('Hemisphere', 'NS', 'Lon Dir' has no bound).
 */
export function hemisphereTarget(key: string): { axis?: 'latitude' | 'longitude'; bound?: 'start' | 'end' } {
  const rest = key.split(' ').filter((t) => t !== '' && !HEMISPHERE_NOISE.test(t)).join(' ');
  if (rest === '') return {};
  const cb = coordinateBound(rest);
  if (cb) return { axis: cb.axis, bound: cb.bound };
  const axis = axisOfWord(rest);
  return axis === undefined ? {} : { axis };
}

/**
 * Does a hemisphere column's start / end word agree with the coordinate it is asked to sign? 'Beg Lat Dir' signs 'Begin Latitude' (and a plain
 * 'Latitude' does not take it); a hemisphere header without such a word agrees with every coordinate. Both arguments are headerKeys.
 */
export function hemisphereBoundAgrees(hemisphereKey: string, coordinateKey: string): boolean {
  const bound = hemisphereTarget(hemisphereKey).bound;
  return bound === undefined || coordinateBound(coordinateKey)?.bound === bound;
}

// Tokens of an identifier name. A name is an identifier when EVERY word is one of these and at least one is not just 'collection' or a digit:
// 'Catalog ID', 'Catalog #', 'Collection ID', 'Photo', 'GenBank No.' are; 'Ref temperature', 'Number of species' are not (a real word follows).
const IDENTIFIER_TOKEN = /^(id|ids|no|nr|num|number|catalog|catalogue|accession|acc|reference|ref|image|photo|loan|gift|voucher|specimen|record|barcode|uuid|guid|genbank|gen ?b[a-z]{2,4}k|collection|\d+)$/;
const IDENTIFIER_WEAK = /^(collection|\d+)$/;

/** Is this header (headerKey) an identifier of a specimen, a record or a photo, not a measurement? `cleanHeader` is the header as written ('#' alone has no key), `rawName` its name without the unit. */
export function isIdentifierName(key: string, cleanHeader = '', rawName = cleanHeader): boolean {
  if (key === '') return /^[#№]$/.test(cleanHeader.trim());
  // an all-capitals 'NO' without a dot is nitric oxide, not 'No.'; the key is lower case, so the raw name decides
  if (rawName.trim() === 'NO') return false;
  const tokens = key.split(' ').filter((t) => t !== '');
  // 'GenBank' written in two words ('Gen Bank') is one word
  const words: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'gen' && /^ba?n?c?k$/.test(tokens[i + 1] ?? '')) {
      words.push('genbank');
      i++;
    } else words.push(tokens[i]);
  }
  return words.length > 0 && words.every((t) => IDENTIFIER_TOKEN.test(t)) && words.some((t) => !IDENTIFIER_WEAK.test(t));
}

const ABUNDANCE_NAME =
  /^(count|counts|abundance|abundances|individuals|individual count|(no|nr|num|number) (of )?(specimens|individuals|organisms)|liczba (osobnikow|okazow)|anzahl( (der )?(individuen|exemplare))?|abondance|nombre (d )?individus)$/;

/** Is this header (headerKey) an abundance, a number of specimens? The converter reads such a column as a quantity. */
export const isAbundanceName = (key: string): boolean => ABUNDANCE_NAME.test(key);
