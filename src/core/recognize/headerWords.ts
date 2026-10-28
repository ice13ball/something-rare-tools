// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Kept apart from vocab.ts, whose bytes are pinned (test/convert/variables.test.ts T11).

/* ---------- start / end of a tow, hemisphere letters, identifiers, abundance (header words; keys come from headerKey) ---------- */

/** Words that say "start" / "end" of a track in English, Polish, German and French (headerKey: ASCII, lower case). */
const START_WORDS: ReadonlySet<string> = new Set(['begin', 'beg', 'start', 'starting', 'initial', 'from', 'poczatek', 'poczatkowa', 'poczatkowy', 'pocz', 'anfang', 'anfangs', 'beginn', 'debut']);
const END_WORDS: ReadonlySet<string> = new Set(['end', 'stop', 'final', 'to', 'koniec', 'koncowa', 'koncowy', 'konc', 'ende', 'fin']);
const LAT_WORD = /^(lat|latit\w*|szerokosc geogr\w*|szerokosc (polnocna|poludniowa)|breitengrad|(geographische|geogr) breite)$/;
const LON_WORD = /^(lon|long|lng|longit\w*|dlugosc geogr\w*|dlugosc (wschodnia|zachodnia)|l(?:a|ae)ngengrad|(geographische|geogr) l(?:a|ae)nge)$/;
const CONNECTOR = /^(de|du|d|of)$/;
const BARE_LAT = /^(szerokosc|szer|breite)$/;
const BARE_LON = /^(dlugosc|dl|dlug|lange|laenge)$/;
const AXIS_TAIL = /( (dd|deg|degs|degrees|decimal|dec|wgs84))+$/;
const AXIS_GLUED = /^(begin|beg|start|starting|initial|end|stop|final)(lat|lon|long|lng|latitude|longitude)$|^(lat|lon|long|lng|latitude|longitude)(begin|beg|start|end|stop|final)$/;

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
