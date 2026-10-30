// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { CITE, NVS_CODE_SHAPE, th } from './citations';
import type { RuleSpec } from './spec';

/** The two cited limits; ROW-SHIP-SPEED and ROW-SHIP-SPEED-PAIR share the first, so a message can never disagree with the check. */
const SHIP_SPEED_EXTREME_KN = 40;
const SHIP_SPEED_UNUSUAL_KN = 15;

/** Sentence added when a large share of the places is named: the premise (one ship) is then the likelier culprit. */
const SHIP_MIXED = {
  param: 'mixed',
  plain: {
    pl: `Zastrzeżenia dotyczą tak wielu zdarzeń, że dane pochodzą raczej z więcej niż jednego statku lub rejsu: wskaż kolumnę z rejsem albo nie zaznaczaj pola o jednym rejsie.`,
    en: `So many events are named that the data probably come from more than one ship or cruise: map a cruise column, or do not tick the one-cruise box.`,
    de: `So viele Ereignisse sind betroffen, dass die Daten wohl von mehr als einem Schiff oder einer Fahrt stammen: ordnen Sie eine Fahrt-Spalte zu oder setzen Sie das Häkchen nicht.`,
    fr: `Tant d'événements sont cités que les données viennent sans doute de plusieurs navires ou campagnes : indiquez une colonne de campagne ou ne cochez pas la case.`,
  },
} as const;

/** ROW-SHIP-SPEED-UNUSUAL: every hop below the extreme limit, so the ship may really have sailed that fast. */
const SHIP_MAY_BE_REAL = {
  param: 'mayBeReal',
  plain: {
    pl: `Jeśli statek tak płynął, pomiń tę uwagę.`,
    en: `If the ship did sail that fast, ignore this note.`,
    de: `Fuhr das Schiff so schnell, ignorieren Sie dies.`,
    fr: `Si c'est exact, ignorez cette remarque.`,
  },
} as const;

/** ROW-SHIP-SPEED-UNUSUAL: one of the hops is above the extreme limit, which no ship sails. */
const SHIP_IMPOSSIBLE_HOP = {
  param: 'impossible',
  plain: {
    pl: `Co najmniej jeden z tych odcinków wymaga ponad {threshold.speed.extreme} węzłów, a z taką prędkością żaden statek nie płynie: pozycja albo data lub godzina tego zdarzenia jest prawdopodobnie błędna.`,
    en: `At least one of these hops needs more than {threshold.speed.extreme} knots, and no ship sails that fast: the position or the date or time of this event is probably wrong.`,
    de: `Mindestens eine dieser Strecken erfordert mehr als {threshold.speed.extreme} Knoten, so schnell fährt kein Schiff: Position oder Datum bzw. Uhrzeit dieses Ereignisses sind wahrscheinlich falsch.`,
    fr: `Au moins un de ces trajets exige plus de {threshold.speed.extreme} nœuds, et aucun navire ne va aussi vite : la position ou la date ou l'heure de cet événement est probablement fausse.`,
  },
} as const;

/** The three speed rules: reversing the sign of one coordinate of the offending row alone makes the hops plausible (row and the value before→after). */
const SHIP_SIGN_LON = {
  param: 'signLon',
  plain: {
    pl: `Prawdopodobnie brak lub nadmiar minusa przy długości geograficznej {+signLonCount:w wierszu|w wierszach|w wierszach} {signLon}.`,
    en: `Probably a missing or extra minus sign in the longitude of {+signLonCount:row|rows} {signLon}.`,
    de: `Wahrscheinlich fehlt beim Längengrad in {+signLonCount:Zeile|den Zeilen} {signLon} ein Minuszeichen oder es steht fälschlich da.`,
    fr: `Probablement un signe moins manquant ou en trop dans la longitude {+signLonCount:de la ligne|des lignes} {signLon}.`,
  },
} as const;

/** The three speed rules: reversing the sign of one coordinate of the offending row alone makes the hops plausible (row and the value before→after). */
const SHIP_SIGN_LAT = {
  param: 'signLat',
  plain: {
    pl: `Prawdopodobnie brak lub nadmiar minusa przy szerokości geograficznej {+signLatCount:w wierszu|w wierszach|w wierszach} {signLat}.`,
    en: `Probably a missing or extra minus sign in the latitude of {+signLatCount:row|rows} {signLat}.`,
    de: `Wahrscheinlich fehlt beim Breitengrad in {+signLatCount:Zeile|den Zeilen} {signLat} ein Minuszeichen oder es steht fälschlich da.`,
    fr: `Probablement un signe moins manquant ou en trop dans la latitude {+signLatCount:de la ligne|des lignes} {signLat}.`,
  },
} as const;

/** Sentence added when the group came from the tick (not from a cruise column): the likely cause of a false alarm is mixed ships. */
/** All three rules: a case names a place with more than one row, so its rows are listed event by event in square brackets. */
const SHIP_PLACES = {
  param: 'places',
  plain: {
    pl: `W nawiasie kwadratowym: wiersze każdego punktu trasy; „+” łączy zdarzenia w promieniu 10 km od pierwszego z nich, liczone jako jeden punkt.`,
    en: `In square brackets: the rows of each point of the track; "+" joins events within 10 km of the first of them, counted as one point.`,
    de: `In eckigen Klammern: die Zeilen jedes Punkts der Fahrt; „+“ verbindet Ereignisse im Umkreis von 10 km um das erste, als ein Punkt gezählt.`,
    fr: `Entre crochets : les lignes de chaque point du trajet ; « + » relie des événements à moins de 10 km du premier, comptés comme un seul point.`,
  },
} as const;

/** All three rules: a place left at the end of an earlier interval is labelled "a/b" (position from line a, time from line b). */
const SHIP_SPLIT = {
  param: 'split',
  plain: {
    pl: `Zapis „a/b”: odcinek liczony od pozycji z wiersza a i od końca przedziału czasu z wiersza b.`,
    en: `"a/b": the hop is measured from the position on line a and from the end of the time interval on line b.`,
    de: `„a/b“: Die Strecke zählt ab der Position in Zeile a und ab dem Ende des Zeitraums in Zeile b.`,
    fr: `« a/b » : le trajet part de la position de la ligne a et de la fin de l'intervalle de temps de la ligne b.`,
  },
} as const;

const SHIP_DECLARED = {
  param: 'declared',
  plain: {
    pl: `Jeśli w plikach jest więcej niż jeden statek lub rejs, odznacz pole „…z jednego rejsu jednego statku” albo wskaż kolumnę z rejsem.`,
    en: `If the files hold more than one ship or cruise, untick "…come from one cruise of one ship" or map a cruise column.`,
    de: `Enthalten die Dateien mehrere Schiffe oder Fahrten, entfernen Sie das Häkchen „…von einer Fahrt eines Schiffs“ oder ordnen Sie eine Fahrt-Spalte zu.`,
    fr: `Si les fichiers contiennent plusieurs navires ou campagnes, décochez « …d'une seule campagne d'un seul navire » ou indiquez une colonne de campagne.`,
  },
} as const;

/*
 * Row rules (category 'B'), emitted by the dataset builder (Task 6) and checkRows() (Task 8).
 * Generic fields: file, sheet, lines (the offending rows), field (column header), value (one example).
 * Declared params per rule:
 *   ROW-LAT-RANGE         (none)      lines/field/value = the rows, the column, one example; bounds come from thresholds
 *   ROW-LON-RANGE         (none)      same
 *   ROW-LON-360           (none)      lines/field/value = rows given on a 0-360 scale (info)
 *   ROW-LAT-EQ-LON        (none)      lines = all rows with lat === lon; value = the shared value (error: >= 5 rows and >= 20 % of rows with a position)
 *   ROW-LAT-EQ-LON-ISOLATED / -COARSE  the same below that count or share: warning, or note when the value is a whole or half degree
 *   ROW-RAGGED            expected, found   header field count and the field count of the FIRST listed line
 *   ROW-NON-NUMERIC       (none)      field = column, value = example token, lines = rows
 *   ROW-NA-VARIANT        (none)      field = column, value = example token (e.g. NANA), lines = rows
 *   ROW-STATION-MOVED     station, positions   positions = compact text such as "76.9N 15.5E (9 rows); 76.9N 16.5E (14 rows)"
 *                         signLon / signLat    'yes' when two positions differ (almost) only by the sign of that coordinate (optional)
 *   ROW-STATION-SPREAD    station, km, positions   km = largest distance between the station's positions (rounded), 10 to 1000 km (note)
 *   ROW-STATION-SPREAD-FAR  the same, above 1000 km (warning)
 *   ROW-ON-LAND-NEAR      count, places   the same for positions 10-50 km inside (note, no hint)
 *   ROW-ON-LAND           count, places, flips   count = rows on land; places = up to 5 positions "lat, lon (rows; ≥N km)";
 *                         flips (optional) = "position → the same with a sign flipped or axes exchanged" where that lies at sea
 *   ROW-SHIP-SPEED        count, cases   count = events flagged (a merged cast = one event); cases = up to 5 of "previous→this→next: km, h, ≥kn; km, h, ≥kn"
 *                         (line numbers; km = distance, h = LONGEST possible time between the two events, kn = the speed at least); declared (optional) = 'yes' when
 *                         the single-cruise tick, not a cruise column, formed the group; mixed (optional) = 'yes' when a large share of the places is named
 *   ROW-SHIP-SPEED-UNUSUAL  the same, at the lower limit (info)
 *   (these two)           signLon, signLat  optional: "row (x→-x)" (with signLonCount, signLatCount) of the cases where reversing that coordinate's sign alone makes the hops plausible
 *   ROW-SHIP-SPEED-PAIR   count, cases   count = pairs; cases = "first→second: km, h, ≥kn"; declared as above
 *   ROW-DATE-UNPARSEABLE  (none)      field = column, value = example, lines = rows
 *   ROW-DATE-MISSING      count, percent   rows without a date, and their share of all rows (number, 0-100)
 *   ROW-YEAR-OUTLIER      years, declared  years = years of the flagged rows; declared = years named in label/file name/title/extent
 *   ROW-DATE-YYMMDD       interpreted field = column, value = example as written (once per column); interpreted = that example as read, YYYY-MM-DD (the century chosen)
 *   ROW-TZ-UNKNOWN        (none)      field = column (once per column)
 *   ROW-UNIT-MISSING      headers     column headers without a unit, comma-separated
 *   ROW-HEADER-CODE-SHAPE column, code, collection, length   column = the header; code = what follows `SDN:<collection>::`; collection = P01 or P06; length = characters such a code has (8 or 4)
 *   ROW-DEPTH-SIGN        header      the depth column header
 *   ROW-DM-COORDS         (none)      field = column, value = example text (once per column)
 *   ROW-HEMISPHERE-CONFLICT hemisphere  field = coordinate column, hemisphere = its hemisphere column, value = example as written, lines = rows
 *   ROW-HEMISPHERE-MISSING  hemisphere  the same, for a filled value with an empty or unknown letter
 *   ROW-HEMISPHERE-UNPAIRED hemisphere  field = coordinate column, hemisphere = a hemisphere column whose start / end word disagrees with it (not applied; once per column)
 *   ROW-ZERO-COORD        (none)    lines = rows with latitude and longitude both 0
 *   ROW-NO-COORD          count       lines = rows with a blank latitude or longitude cell, count = how many
 *   ROW-DEPTH-MIN-MAX     (none)      value = "min > max" of the first row
 *   ROW-DEPTH-RANGE       (none)      field = column, value = first value outside the range, lines = rows
 *   ROW-DATE-FUTURE       (none)      field = column, value = first date as written, lines = rows
 *   ROW-INVISIBLE-CHAR    chars       field = column, value = first value with the characters made visible, chars = "U+00A0 no-break space, ..."
 */
export const ROW_RULES: readonly RuleSpec[] = [
  {
    id: 'ROW-LAT-RANGE',
    category: 'B',
    severity: 'error',
    params: [],
    thresholds: [
      th('latitude.min', -90, 'degrees', CITE.argoLocation),
      th('latitude.max', 90, 'degrees', CITE.argoLocation),
    ],
    citations: [CITE.gtsppLocation],
    plain: {
      pl: `Szerokość geograficzna musi mieścić się między {threshold.latitude.min} a {threshold.latitude.max} stopni, a wiersze {lines} wykraczają poza ten zakres. Sprawdź, czy szerokość i długość nie zostały zamienione lub błędnie wpisane.`,
      en: `Latitude must be between {threshold.latitude.min} and {threshold.latitude.max} degrees, but lines {lines} are outside this range. Check whether latitude and longitude were swapped or mistyped.`,
      de: `Die geografische Breite muss zwischen {threshold.latitude.min} und {threshold.latitude.max} Grad liegen, aber die Zeilen {lines} liegen außerhalb. Prüfen Sie, ob Breite und Länge vertauscht oder falsch eingegeben wurden.`,
      fr: `La latitude doit être comprise entre {threshold.latitude.min} et {threshold.latitude.max} degrés, mais les lignes {lines} sont en dehors. Vérifiez que la latitude et la longitude n'ont pas été inversées ou mal saisies.`,
    },
    technical: `{file}:{lines} field {field} value '{value}': latitude outside {threshold.latitude.min}..{threshold.latitude.max} degrees.`,
  },
  {
    id: 'ROW-LON-RANGE',
    category: 'B',
    severity: 'error',
    params: [],
    thresholds: [
      th('longitude.min', -180, 'degrees', CITE.argoLocation),
      th('longitude.max', 180, 'degrees', CITE.argoLocation),
    ],
    citations: [CITE.gtsppLocation],
    plain: {
      pl: `Długość geograficzna musi mieścić się między {threshold.longitude.min} a {threshold.longitude.max} stopni, a wiersze {lines} wykraczają poza ten zakres. Sprawdź, czy szerokość i długość nie zostały zamienione lub błędnie wpisane.`,
      en: `Longitude must be between {threshold.longitude.min} and {threshold.longitude.max} degrees, but lines {lines} are outside this range. Check whether latitude and longitude were swapped or mistyped.`,
      de: `Die geografische Länge muss zwischen {threshold.longitude.min} und {threshold.longitude.max} Grad liegen, aber die Zeilen {lines} liegen außerhalb. Prüfen Sie, ob Breite und Länge vertauscht oder falsch eingegeben wurden.`,
      fr: `La longitude doit être comprise entre {threshold.longitude.min} et {threshold.longitude.max} degrés, mais les lignes {lines} sont en dehors. Vérifiez que la latitude et la longitude n'ont pas été inversées ou mal saisies.`,
    },
    technical: `{file}:{lines} field {field} value '{value}': longitude outside {threshold.longitude.min}..{threshold.longitude.max} degrees.`,
  },
  {
    id: 'ROW-LON-360',
    category: 'B',
    severity: 'info',
    params: [],
    citations: [CITE.gtsppLocation],
    plain: {
      pl: `Długości geograficzne w wierszach {lines} są podane w skali 0–360. Przeliczono je na skalę od -180 do 180; taką skalę zastosuj w opublikowanym pliku.`,
      en: `Longitudes in lines {lines} are given on a 0–360 scale. They were converted to the -180 to 180 scale; use that scale in the published file.`,
      de: `Die Längen in den Zeilen {lines} sind auf einer Skala von 0–360 angegeben. Sie wurden auf die Skala von -180 bis 180 umgerechnet; verwenden Sie diese Skala in der veröffentlichten Datei.`,
      fr: `Les longitudes des lignes {lines} sont données sur une échelle de 0 à 360. Elles ont été converties à l'échelle de -180 à 180 ; utilisez cette échelle dans le fichier publié.`,
    },
    technical: `{file}:{lines} field {field} value '{value}': longitude in (180, 360] converted by subtracting 360.`,
  },
  {
    id: 'ROW-LAT-EQ-LON',
    category: 'B',
    severity: 'error',
    params: [],
    plain: {
      pl: `W wierszach {lines} szerokość i długość geograficzna są identyczne ({value}). Prawdopodobnie jedna kolumna została skopiowana do drugiej; wpisz właściwe wartości.`,
      en: `In lines {lines} latitude and longitude are identical ({value}). One column was probably copied into the other; enter the correct values.`,
      de: `In den Zeilen {lines} sind Breite und Länge identisch ({value}). Vermutlich wurde eine Spalte in die andere kopiert; tragen Sie die richtigen Werte ein.`,
      fr: `Aux lignes {lines}, la latitude et la longitude sont identiques ({value}). Une colonne a probablement été copiée dans l'autre ; saisissez les bonnes valeurs.`,
    },
    plainIf: [
      {
        param: 'share',
        plain: {
          pl: `To co najmniej 5 wierszy i co piąty wiersz z pozycją.`,
          en: `That is at least 5 rows and a fifth of the rows with a position.`,
          de: `Das sind mindestens 5 Zeilen und ein Fünftel der Zeilen mit Position.`,
          fr: `Cela fait au moins 5 lignes et un cinquième des lignes avec position.`,
        },
      },
      {
        param: 'repeated',
        plain: {
          pl: `Ta sama wartość powtarza się w {repeated} wierszach i ma dwa miejsca po przecinku lub więcej, jak przy skopiowaniu pozycji jednej stacji do obu kolumn.`,
          en: `The same value repeats in {repeated} rows and has two or more decimals, as when the position of one station was copied into both columns.`,
          de: `Derselbe Wert wiederholt sich in {repeated} Zeilen und hat zwei oder mehr Dezimalstellen, wie wenn die Position einer Station in beide Spalten kopiert wurde.`,
          fr: `La même valeur se répète sur {repeated} lignes et compte au moins deux décimales, comme si la position d'une station avait été copiée dans les deux colonnes.`,
        },
      },
    ],
    technical: `{file}:{lines} latitude equals longitude exactly (value '{value}') in at least 5 rows and either at least 20 % of the rows with a position or at least 5 rows sharing one value with two or more written decimals that is not a multiple of 0.25 (the tool's own choice; otherwise ROW-LAT-EQ-LON-ISOLATED or ROW-LAT-EQ-LON-COARSE).`,
  },
  {
    id: 'ROW-LAT-EQ-LON-ISOLATED',
    category: 'B',
    severity: 'warning',
    params: [],
    plain: {
      pl: `W {+lines:wierszu|wierszach} {lines} szerokość i długość geograficzna są identyczne ({value}). To niewielki odsetek wierszy z pozycją, więc może to być zbieg okoliczności, ale wpisanie tej samej liczby w obie kolumny to też częsta pomyłka. Sprawdź tę pozycję.`,
      en: `In {+lines:line|lines} {lines} latitude and longitude are identical ({value}). This is a small share of the rows with a position, so it may be a coincidence, but typing the same number into both columns is also a common slip. Check this position.`,
      de: `In {+lines:Zeile|Zeilen} {lines} sind Breite und Länge identisch ({value}). Das ist ein kleiner Anteil der Zeilen mit Position, also kann es Zufall sein; dieselbe Zahl in beide Spalten zu tippen ist aber auch ein häufiger Fehler. Prüfen Sie diese Position.`,
      fr: `{+lines:À la ligne|Aux lignes} {lines}, la latitude et la longitude sont identiques ({value}). C'est une petite part des lignes avec position, ce peut être une coïncidence, mais saisir le même nombre dans les deux colonnes est aussi une erreur courante. Vérifiez cette position.`,
    },
    technical: `{file}:{lines} latitude equals longitude exactly (value '{value}', finer than a half degree) in a small share of the rows with a position (fewer than 5 rows, or under 20 % and without 5 rows of one repeated value); a duplicated column would be ROW-LAT-EQ-LON.`,
  },
  {
    id: 'ROW-LAT-EQ-LON-COARSE',
    category: 'B',
    severity: 'info',
    params: [],
    plain: {
      pl: `W {+lines:wierszu|wierszach} {lines} szerokość i długość geograficzna są identyczne ({value}). To pozycja zaokrąglona do całego lub pół stopnia, częsta w danych historycznych, więc może być prawidłowa (np. -65 i -65 to Półwysep Antarktyczny). Sprawdź tylko, czy liczba nie została wpisana dwa razy.`,
      en: `In {+lines:line|lines} {lines} latitude and longitude are identical ({value}). This position is rounded to a whole or half degree, as is common in historical data, so it may be right (for example -65 and -65 is the Antarctic Peninsula). Just check that the number was not typed twice.`,
      de: `In {+lines:Zeile|Zeilen} {lines} sind Breite und Länge identisch ({value}). Die Position ist auf ein ganzes oder halbes Grad gerundet, wie in historischen Daten üblich, und kann stimmen (z. B. -65 und -65: Antarktische Halbinsel). Prüfen Sie nur, ob die Zahl doppelt getippt wurde.`,
      fr: `{+lines:À la ligne|Aux lignes} {lines}, la latitude et la longitude sont identiques ({value}). Cette position est arrondie au degré entier ou au demi-degré, comme souvent dans les données historiques, et peut être juste (par ex. -65 et -65 : péninsule Antarctique). Vérifiez seulement que le nombre n'a pas été saisi deux fois.`,
    },
    technical: `{file}:{lines} latitude equals longitude exactly (value '{value}', a whole or half degree) in fewer than 5 rows or fewer than 20 % of the rows with a position; a duplicated column would be ROW-LAT-EQ-LON.`,
  },
  {
    id: 'ROW-RAGGED',
    category: 'B',
    severity: 'error',
    params: ['expected', 'found'],
    plain: {
      pl: `{+lines:Wiersz|Wiersze} {lines} {+lines:ma|mają} inną liczbę wartości niż nagłówek (oczekiwano {expected}, {+lines:jest|np.} {found}{+lines:| w pierwszym z nich}). Kolumny mogły się przesunąć; popraw {+lines:ten wiersz|te wiersze} w pliku źródłowym, narzędzie {+lines:go|ich} nie zmieniło.`,
      en: `{+lines:Line|Lines} {lines} {+lines:has|have} a different number of values than the header (expected {expected}, {+lines:found|e.g.} {found}{+lines:| in the first of them|}). The columns may be shifted; fix {+lines:this line|these lines} in the original file — the tool did not change {+lines:it|them}.`,
      de: `{+lines:Die Zeile|Die Zeilen} {lines} {+lines:hat|haben} eine andere Anzahl von Werten als die Kopfzeile (erwartet {expected}, {+lines:gefunden|z. B.} {found}{+lines:| in der ersten|}). Die Spalten sind möglicherweise verschoben; korrigieren Sie sie in der Originaldatei – das Werkzeug hat sie nicht verändert.`,
      fr: `{+lines:La ligne|Les lignes} {lines} {+lines:a|ont} un nombre de valeurs différent de l'en-tête ({expected} attendues, {+lines:|par ex. }{found}{+lines: trouvées| dans la première}). Les colonnes sont peut-être décalées ; corrigez-{+lines:la|les} dans le fichier d'origine — l'outil ne {+lines:l'|les }a pas modifiée{+lines:|s}.`,
    },
    technical: `{file}:{lines} expected {expected} fields, found {found} (first listed line); rows kept as found, not realigned.`,
  },
  {
    id: 'ROW-NON-NUMERIC',
    category: 'B',
    severity: 'warning',
    params: [],
    plain: {
      pl: `Kolumna „{field}” powinna zawierać liczby, ale {+lines:w wierszu|w wierszach|w wierszach} {lines} jest tekst, np. „{value}”. Zastąp go liczbą albo zostaw pustą komórkę.`,
      en: `Column "{field}" should contain numbers, but {+lines:line|lines} {lines} {+lines:contains|contain} text such as "{value}". Replace it with a number or leave the cell empty.`,
      de: `Die Spalte „{field}“ sollte Zahlen enthalten, aber {+lines:die Zeile|die Zeilen} {lines} {+lines:enthält|enthalten} Text wie „{value}“. Ersetzen Sie ihn durch eine Zahl oder lassen Sie die Zelle leer.`,
      fr: `La colonne « {field} » devrait contenir des nombres, mais {+lines:la ligne|les lignes} {lines} {+lines:contient|contiennent} du texte, par ex. « {value} ». Remplacez-le par un nombre ou laissez la cellule vide.`,
    },
    technical: `{file}:{lines} field {field} value '{value}': non-numeric token in a numeric column.`,
  },
  {
    id: 'ROW-NA-VARIANT',
    category: 'B',
    severity: 'warning',
    params: [],
    plain: {
      pl: `Kolumna „{field}” oznacza brak danych w nietypowy sposób (np. „{value}”) {+lines:w wierszu|w wierszach|w wierszach} {lines}. Użyj jednego, spójnego oznaczenia albo pustej komórki.`,
      en: `Column "{field}" marks missing values in an unusual way (e.g. "{value}") in {+lines:line|lines} {lines}. Use one consistent marker, or an empty cell.`,
      de: `Die Spalte „{field}“ kennzeichnet fehlende Werte auf ungewöhnliche Weise (z. B. „{value}“) {+lines:in der Zeile|in den Zeilen} {lines}. Verwenden Sie eine einheitliche Kennzeichnung oder eine leere Zelle.`,
      fr: `La colonne « {field} » signale les valeurs manquantes de façon inhabituelle (par ex. « {value} ») {+lines:à la ligne|aux lignes} {lines}. Utilisez un seul marqueur cohérent, ou une cellule vide.`,
    },
    technical: `{file}:{lines} field {field} value '{value}': variant of a missing-value token (not in the standard NA list).`,
  },
  {
    id: 'ROW-STATION-MOVED',
    category: 'B',
    severity: 'warning',
    params: ['station', 'positions'],
    plain: {
      pl: `Stacja {station} występuje w różnych miejscach ({positions}). Sprawdź, które jest właściwe — mogła zostać błędnie wpisana cyfra albo zamienione współrzędne.`,
      en: `Station {station} appears at different positions ({positions}). Check which one is right — a digit may have been mistyped or the coordinates swapped.`,
      de: `Die Station {station} erscheint an verschiedenen Positionen ({positions}). Prüfen Sie, welche richtig ist — eine Ziffer wurde vielleicht falsch getippt oder die Koordinaten wurden vertauscht.`,
      fr: `La station {station} apparaît à des positions différentes ({positions}). Vérifiez laquelle est correcte — un chiffre a peut-être été mal saisi ou les coordonnées inversées.`,
    },
    plainIf: [
      {
        param: 'signLon',
        plain: {
          pl: `Dwie z tych pozycji różnią się (prawie) tylko znakiem długości geograficznej: możliwe, że brakuje minusa albo jest zbędny (W/E). Sprawdź też inne kolumny — znak nie musi być całą przyczyną.`,
          en: `Two of these positions differ (almost) only in the sign of the longitude: possibly a missing or extra minus (W/E). Check the other columns too — the sign need not be the whole cause.`,
          de: `Zwei Positionen unterscheiden sich (fast) nur im Längen-Vorzeichen: vielleicht fehlt ein Minus oder eins zu viel (W/O). Prüfen Sie auch andere Spalten; vielleicht liegt es nicht am Vorzeichen.`,
          fr: `Deux positions ne diffèrent (presque) que par le signe de la longitude : peut-être un moins manquant ou en trop (O/E). Vérifiez aussi les autres colonnes — le signe n'explique pas forcément tout.`,
        },
      },
      {
        param: 'signLat',
        plain: {
          pl: `Dwie z tych pozycji różnią się (prawie) tylko znakiem szerokości geograficznej: możliwe, że brakuje minusa albo jest zbędny (S/N). Sprawdź też inne kolumny — znak nie musi być całą przyczyną.`,
          en: `Two of these positions differ (almost) only in the sign of the latitude: possibly a missing or extra minus (S/N). Check the other columns too — the sign need not be the whole cause.`,
          de: `Zwei Positionen unterscheiden sich (fast) nur im Breiten-Vorzeichen: vielleicht fehlt ein Minus oder eins zu viel (S/N). Prüfen Sie auch andere Spalten; vielleicht liegt es nicht am Vorzeichen.`,
          fr: `Deux positions ne diffèrent (presque) que par le signe de la latitude : peut-être un moins manquant ou en trop (S/N). Vérifiez aussi les autres colonnes — le signe n'explique pas forcément tout.`,
        },
      },
    ],
    technical: `{file}:{lines} station {station} at {positions}: positions differ by a typed digit, by exchanged axes, or by a sign (as written at least 100 km apart, within 50 km and at least 10 times closer once flipped).`,
  },
  {
    id: 'ROW-STATION-SPREAD',
    category: 'B',
    severity: 'info',
    params: ['station', 'km', 'positions'],
    plain: {
      pl: `Stacja {station} ma pozycje odległe od siebie nawet o {km} km ({positions}). Jedna stacja to zwykle jedno miejsce, a 10 km to znacznie więcej niż błąd pozycji statku na stacji. Jeśli ta nazwa oznacza obszar, transekt lub rejs, pomiń tę uwagę.`,
      en: `Station {station} has positions up to {km} km apart ({positions}). A station is usually one place, and 10 km is far more than a ship's position error on station. If this name stands for an area, a transect or a cruise, ignore this note.`,
      de: `Die Station {station} hat Positionen, die bis zu {km} km auseinanderliegen ({positions}). Eine Station ist meist ein Ort, und 10 km sind weit mehr als der Positionsfehler eines Schiffs auf Station. Steht der Name für ein Gebiet, einen Transekt oder eine Fahrt, ignorieren Sie diesen Hinweis.`,
      fr: `La station {station} a des positions distantes de {km} km au plus ({positions}). Une station correspond d'habitude à un seul lieu, et 10 km dépassent de loin l'erreur de position d'un navire en station. Si ce nom désigne une zone, un transect ou une campagne, ignorez cette remarque.`,
    },
    technical: `{file} station {station}: positions up to {km} km apart (more than 10 km; great-circle distance) at {positions}. Rows of one name are compared only within one cruise (a cruise value) or, without one, within one calendar year (UTC); rows with neither get the note ROW-STATION-SPREAD and, for exchanged axes or a sign, ROW-STATION-MOVED, but not the typed-digit pattern. Placeholder names (unknown, not specified, n/a ...) are skipped.`,
  },
  {
    id: 'ROW-STATION-SPREAD-FAR',
    category: 'B',
    severity: 'warning',
    params: ['station', 'km', 'positions'],
    plain: {
      pl: `Stacja {station} ma pozycje odległe od siebie nawet o {km} km, czyli ponad 1000 km ({positions}). Jedna stacja to zwykle jedno miejsce, więc to niemal na pewno błąd jednej z pozycji (znak, cyfra, zamienione osie), a nie obszar. Sprawdź, która pozycja jest właściwa.`,
      en: `Station {station} has positions up to {km} km apart, more than 1000 km ({positions}). A station is usually one place, so this is almost certainly a wrong position (a sign, a digit, swapped axes), not an area. Check which position is right.`,
      de: `Die Station {station} hat Positionen, die bis zu {km} km auseinanderliegen, mehr als 1000 km ({positions}). Eine Station ist meist ein Ort, das ist also fast sicher eine falsche Position (Vorzeichen, Ziffer, vertauschte Achsen), kein Gebiet. Prüfen Sie, welche Position stimmt.`,
      fr: `La station {station} a des positions distantes de {km} km au plus, soit plus de 1000 km ({positions}). Une station correspond d'habitude à un seul lieu : c'est presque certainement une position erronée (signe, chiffre, axes inversés), pas une zone. Vérifiez quelle position est la bonne.`,
    },
    technical: `{file} station {station}: positions up to {km} km apart (more than 1000 km; great-circle distance) at {positions}. The 10 to 1000 km case is the note ROW-STATION-SPREAD; 1000 km is a stated choice, not a published threshold. Rows of one name are compared only within one cruise (a cruise value) or, without one, within one calendar year (UTC); rows with neither get the note ROW-STATION-SPREAD and, for exchanged axes or a sign, ROW-STATION-MOVED, but not the typed-digit pattern. Placeholder names (unknown, not specified, n/a ...) are skipped.`,
  },
  {
    id: 'ROW-ON-LAND-NEAR',
    category: 'B',
    severity: 'info',
    params: ['count', 'places'],
    citations: [CITE.argoLand, CITE.naturalEarthLand],
    plain: {
      pl: `W wierszach {lines} (razem: {count}) pozycja wypada na mapie lądu Natural Earth (1:10m) na lądzie lub w jeziorze, 10–50 km od morza: {places} (liczba wierszy; najmniejsza odległość od morza). Jeśli to próbka z rzeki, estuarium, zatoki pływowej, jeziora albo laguny przy brzegu, pomiń tę uwagę: w takich miejscach mapa bywa niedokładna. Jeśli nie, sprawdź cyfry i kolejność współrzędnych.`,
      en: `In lines {lines} ({count} in all) the position falls on land or in a lake on the Natural Earth (1:10m) land map, 10–50 km from the sea: {places} (number of rows; least distance from the sea). If this is a sample from a river, estuary, tidal inlet, lake or coastal lagoon, ignore this note: the map can be inaccurate in such places. If not, check the digits and the order of the coordinates.`,
      de: `In den Zeilen {lines} (insgesamt {count}) liegt die Position auf der Landkarte Natural Earth (1:10m) an Land oder in einem See, 10–50 km vom Meer: {places} (Anzahl Zeilen; kleinster Abstand zum Meer). Stammt die Probe aus einem Fluss, Ästuar, Gezeitenarm, See oder einer Küstenlagune, ignorieren Sie diesen Hinweis: dort ist die Karte oft ungenau. Sonst prüfen Sie Ziffern und Reihenfolge der Koordinaten.`,
      fr: `Aux lignes {lines} ({count} au total), la position tombe, sur la carte des terres Natural Earth (1:10m), sur terre ou dans un lac, à 10–50 km de la mer : {places} (nombre de lignes ; distance min. à la mer). Pour un échantillon de rivière, d'estuaire, de bras de marée, de lac ou de lagune côtière, ignorez cette remarque : la carte y est parfois imprécise. Sinon, vérifiez les chiffres et l'ordre des coordonnées.`,
    },
    technical: `{file}:{lines} {count} rows on land or in an inland lake 10 to 50 km from the sea (Natural Earth 1:10m, 0.05 degree cells; no sign hint at this level): {places}.`,
  },
  {
    id: 'ROW-ON-LAND',
    category: 'B',
    severity: 'warning',
    params: ['count', 'places'],
    citations: [CITE.argoLand, CITE.naturalEarthLand],
    plain: {
      pl: `W wierszach {lines} (razem: {count}) pozycja leży na lądzie lub w jeziorze, z dala od morza: {places} (liczba wierszy; najmniejsza odległość od morza). W danych morskich to zwykle błąd: zły znak, zamienione osie lub literówka. 10–50 km od morza: osobna uwaga; pas 10 km i brzegi rzek przy morzu nie są oceniane.`,
      en: `In lines {lines} ({count} in all) the position lies on land or in a lake, away from the sea: {places} (number of rows; least distance from the sea). In marine data this is usually an error: a wrong sign, swapped axes or a typo. 10–50 km from the sea: a separate note; the 10 km band and river banks near the sea are not judged.`,
      de: `In den Zeilen {lines} (insgesamt {count}) liegt die Position an Land oder in einem See, abseits des Meeres: {places} (Anzahl Zeilen; kleinster Abstand zum Meer). Bei Meeresdaten meist ein Fehler: Vorzeichen, vertauschte Achsen oder Tippfehler. 10–50 km: eigener Hinweis; 10-km-Streifen und Flussufer am Meer bleiben unbewertet.`,
      fr: `Aux lignes {lines} ({count} au total), la position est sur terre ou dans un lac, loin de la mer : {places} (nombre de lignes ; distance min. à la mer). En données marines, c'est souvent une erreur : signe, axes inversés ou faute de frappe. À 10–50 km : remarque à part ; bande de 10 km et rives près de la mer non évaluées.`,
    },
    plainIf: [
      {
        param: 'flips',
        plain: {
          pl: `Po zmianie znaku albo zamianie współrzędnych te pozycje wypadają na morzu: {flips}. To tylko wskazówka, nie poprawka.`,
          en: `With a sign flipped or the coordinates swapped, these positions lie at sea: {flips}. This is only a hint, not a correction.`,
          de: `Mit umgekehrtem Vorzeichen oder vertauschten Koordinaten liegen diese Positionen im Meer: {flips}. Das ist nur ein Hinweis, keine Korrektur.`,
          fr: `Avec un signe inversé ou les coordonnées permutées, ces positions se trouvent en mer : {flips}. Ce n'est qu'une indication, pas une correction.`,
        },
      },
    ],
    technical: `{file}:{lines} {count} rows on land or in an inland lake at least 50 km from the sea (Natural Earth 1:10m, 0.05 degree cells; 10-50 km is ROW-ON-LAND-NEAR; nearer the coast, near rivers and canals nothing is judged): {places}.`,
  },
  {
    id: 'ROW-SHIP-SPEED',
    category: 'B',
    severity: 'warning',
    params: ['count', 'cases'],
    thresholds: [th('speed.extreme', SHIP_SPEED_EXTREME_KN, 'knots', CITE.marineQcExtremeSpeed)],
    citations: [CITE.marineQcExtremeSpeed, CITE.medatlasShipVelocity, CITE.gtsppImpossibleSpeed, CITE.wodSpeedCheck],
    plain: {
      pl: `Numery wierszy: {lines}. Aby tu dopłynąć i popłynąć dalej, statek musiałby płynąć szybciej niż {threshold.speed.extreme} węzłów, choć zdarzenia przed i po pasują do siebie: {cases} (wiersze poprzedni→ten→następny; km; h = najdłuższy możliwy odstęp). Błąd jest w pozycji albo w dacie lub godzinie któregoś z nich.`,
      en: `Line numbers: {lines}. To get here and on, the ship would have to sail faster than {threshold.speed.extreme} knots, although the events before and after fit together: {cases} (lines previous→this→next; km; h = longest possible gap). The position, or the date or time, of one of them is wrong.`,
      de: `Zeilennummern: {lines}. Um hierher und weiter zu kommen, müsste das Schiff schneller als {threshold.speed.extreme} Knoten fahren, obwohl die Ereignisse davor und danach zusammenpassen: {cases} (Zeilen vorher→dieses→nächstes; km; h = längstmöglicher Abstand). Position oder Datum bzw. Uhrzeit eines davon ist falsch.`,
      fr: `Numéros de ligne : {lines}. Pour arriver ici et repartir, le navire devrait filer à plus de {threshold.speed.extreme} nœuds, alors que les événements d'avant et d'après concordent : {cases} (lignes précédent→celui-ci→suivant ; km ; h = écart maximal possible). La position, la date ou l'heure de l'un d'eux est fausse.`,
    },
    plainIf: [SHIP_SIGN_LON, SHIP_SIGN_LAT, SHIP_PLACES, SHIP_SPLIT, SHIP_DECLARED, SHIP_MIXED],
    technical: `{file}:{lines} {count} event(s) whose implied speed from the previous event and to the next event both exceed {threshold.speed.extreme} knots while previous-to-next does not (Met Office marine-qc extreme speed limit, applied on both sides; MEDATLAS 4.4.4, GTSPP Test 1.5 and WOD18 name position or date/time as the possible error). Speed = distance, less the rounding of the written coordinates, over the LONGEST time gap the written dates and times allow (end of the previous event to start of the next): {cases}.`,
  },
  {
    id: 'ROW-SHIP-SPEED-UNUSUAL',
    category: 'B',
    severity: 'info',
    params: ['count', 'cases'],
    thresholds: [th('speed.unusual', SHIP_SPEED_UNUSUAL_KN, 'knots', CITE.medatlasShipVelocity), th('speed.extreme', SHIP_SPEED_EXTREME_KN, 'knots', CITE.marineQcExtremeSpeed)],
    citations: [CITE.medatlasShipVelocity, CITE.marineQcExtremeSpeed, CITE.wodSpeedCheck],
    plain: {
      pl: `Numery wierszy: {lines}. Aby tu dopłynąć i popłynąć dalej, statek musiałby płynąć szybciej niż {threshold.speed.unusual} węzłów, co dla statku badawczego jest nietypowe, choć zdarzenia przed i po pasują: {cases} (wiersze poprzedni→ten→następny; km; h = najdłuższy możliwy odstęp).`,
      en: `Line numbers: {lines}. To get here and on, the ship would have to sail faster than {threshold.speed.unusual} knots, unusual for a research vessel, although the events before and after fit together: {cases} (lines previous→this→next; km; h = longest possible gap).`,
      de: `Zeilennummern: {lines}. Um hierher und weiter zu kommen, müsste das Schiff schneller als {threshold.speed.unusual} Knoten fahren, ungewöhnlich für ein Forschungsschiff, obwohl davor und danach alles passt: {cases} (Zeilen vorher→dieses→nächstes; km; h = längstmöglicher Abstand).`,
      fr: `Numéros de ligne : {lines}. Pour arriver ici et repartir, le navire devrait filer à plus de {threshold.speed.unusual} nœuds, inhabituel pour un navire de recherche, alors que les voisins concordent : {cases} (lignes précédent→celui-ci→suivant ; km ; h = écart maximal possible).`,
    },
    plainIf: [SHIP_MAY_BE_REAL, SHIP_IMPOSSIBLE_HOP, SHIP_SIGN_LON, SHIP_SIGN_LAT, SHIP_PLACES, SHIP_SPLIT, SHIP_DECLARED, SHIP_MIXED],
    technical: `{file}:{lines} {count} event(s) whose implied speed from the previous event and to the next event both exceed {threshold.speed.unusual} knots (MEDATLAS 4.4.4 default maximum ship velocity) while previous-to-next does not, and which ROW-SHIP-SPEED does not already report. Speed = distance, less the rounding of the written coordinates, over the LONGEST time gap the written dates and times allow: {cases}.`,
  },
  {
    id: 'ROW-SHIP-SPEED-PAIR',
    category: 'B',
    severity: 'info',
    params: ['count', 'cases'],
    thresholds: [th('speed.extreme', SHIP_SPEED_EXTREME_KN, 'knots', CITE.marineQcExtremeSpeed)],
    citations: [CITE.marineQcExtremeSpeed, CITE.wodSpeedCheck, CITE.medatlasShipVelocity],
    plain: {
      pl: `Numery wierszy: {lines}. Między tymi dwoma punktami trasy statek musiałby płynąć szybciej niż {threshold.speed.extreme} węzłów: {cases} (wiersze pierwszy→drugi; km; h = najdłuższy możliwy odstęp). Pozycja albo data lub godzina w jednym z nich jest błędna, nie wiadomo w którym. Zamieniony dzień z miesiącem daje ten sam skutek.`,
      en: `Line numbers: {lines}. Between these two points of the track the ship would have to sail faster than {threshold.speed.extreme} knots: {cases} (lines first→second; km; h = longest possible gap). The position or the time at one of them is wrong, and it is not clear which. A day and month swapped in a date has the same effect.`,
      de: `Zeilennummern: {lines}. Zwischen diesen beiden Punkten der Fahrt müsste das Schiff schneller als {threshold.speed.extreme} Knoten fahren: {cases} (Zeilen erstes→zweites; km; h = längstmöglicher Abstand). Position oder Zeit an einem der beiden ist falsch, an welchem, ist unklar. Vertauschte Tage und Monate wirken genauso.`,
      fr: `Numéros de ligne : {lines}. Entre ces deux points du trajet, le navire devrait filer à plus de {threshold.speed.extreme} nœuds : {cases} (lignes premier→second ; km ; h = écart maximal possible). La position ou l'heure de l'un des deux est fausse, sans qu'on sache lequel. Un jour et un mois inversés ont le même effet.`,
    },
    plainIf: [SHIP_PLACES, SHIP_SPLIT, SHIP_DECLARED, SHIP_MIXED],
    technical: `{file}:{lines} {count} pair(s) of consecutive events whose implied speed exceeds {threshold.speed.extreme} knots (Met Office marine-qc extreme speed limit) and which are not part of a two-sided finding (first or last event, or two bad events in a row). Position or date/time of either event may be wrong (WOD18 speed check; MEDATLAS 4.4.4). Speed = distance, less the rounding of the written coordinates, over the LONGEST time gap the written dates and times allow: {cases}.`,
  },
  {
    id: 'ROW-DATE-UNPARSEABLE',
    category: 'B',
    severity: 'warning',
    params: [],
    citations: [CITE.w3cDatetime, CITE.dataciteDate],
    plain: {
      pl: `Nie udało się odczytać dat w wierszach {lines} (np. „{value}”). Zapisz daty jako RRRR-MM-DD.`,
      en: `The dates in lines {lines} (e.g. "{value}") could not be read. Write dates as YYYY-MM-DD.`,
      de: `Die Daten in den Zeilen {lines} (z. B. „{value}“) konnten nicht gelesen werden. Schreiben Sie Daten als JJJJ-MM-TT.`,
      fr: `Les dates des lignes {lines} (par ex. « {value} ») n'ont pas pu être lues. Écrivez les dates sous la forme AAAA-MM-JJ.`,
    },
    technical: `{file}:{lines} field {field} value '{value}': date not parseable (ISO 8601, DD.MM.YYYY, unambiguous DD/MM/YYYY, YY-MM-DD or Excel serial).`,
    plainTime: {
      pl: `Nie udało się odczytać {+lines:godziny|godzin} {+lines:w wierszu|w wierszach} {lines} (np. „{value}”). Wpisz godzinę jako GG:MM (24 godziny), np. 16:30, w UTC albo z podaną strefą czasową; przedział, np. 16:00-17:30 lub 1600-1730, jest odczytywany jako jego początek.`,
      en: `{+lines:The time|The times} in {+lines:line|lines} {lines} (e.g. "{value}") could not be read. Write the time as HH:MM (24 hours), for example 16:30, in UTC or with the time zone stated; a range such as 16:00-17:30 or 1600-1730 is read as its start.`,
      de: `{+lines:Die Uhrzeit in Zeile|Die Uhrzeiten in den Zeilen} {lines} (z. B. „{value}“) {+lines:konnte|konnten} nicht gelesen werden. Schreiben Sie die Uhrzeit als HH:MM (24 Stunden), z. B. 16:30, in UTC oder mit angegebener Zeitzone; ein Bereich wie 16:00-17:30 oder 1600-1730 wird als sein Beginn gelesen.`,
      fr: `{+lines:L'heure de la ligne|Les heures des lignes} {lines} (par ex. « {value} ») {+lines:n'a pas pu être lue|n'ont pas pu être lues}. Écrivez l'heure sous la forme HH:MM (24 heures), par ex. 16:30, en UTC ou avec le fuseau horaire indiqué ; une plage comme 16:00-17:30 ou 1600-1730 est lue comme son début.`,
    },
    technicalTime: `{file}:{lines} field {field} value '{value}': time of day not parseable (HH:MM or HH:MM:SS, 24 hours; a range HHMM-HHMM or HH:MM-HH:MM, also several separated by commas, is read as the start of its first range and the end is ignored; state UTC or the time zone).`,
  },
  {
    id: 'ROW-DATE-MISSING',
    category: 'B',
    severity: 'info',
    params: ['count', 'percent'],
    plain: {
      pl: `{count} {+count:wiersz|wiersze|wierszy} ({percent} %) {+count:nie ma|nie mają|nie ma} daty, choć pozostałe mają. Uzupełnij brakujące daty.`,
      en: `{count} {+count:row|rows} ({percent} %) {+count:has|have} no date although the other rows do. Fill in the missing dates.`,
      de: `{count} {+count:Zeile|Zeilen} ({percent} %) {+count:hat|haben} kein Datum, obwohl die übrigen eines haben. Ergänzen Sie die fehlenden Daten.`,
      fr: `{count} {+count:ligne|lignes} ({percent} %) {+count:n'a|n'ont} pas de date alors que les autres en ont une. Complétez les dates manquantes.`,
    },
    technical: `{file}:{lines} {count} row(s) ({percent}%) without a date while other rows have one.`,
  },
  {
    id: 'ROW-YEAR-OUTLIER',
    category: 'B',
    severity: 'warning',
    params: ['years', 'declared'],
    plain: {
      pl: `Wiersze {lines} mają rok {years}, a tytuł, nazwa pliku lub zakres czasu mówią o {declared}. Któryś rok jest prawdopodobnie błędnie wpisany.`,
      en: `Lines {lines} are dated {years}, while the title, file name or time span says {declared}. One of them is probably a typo in the year.`,
      de: `Die Zeilen {lines} sind auf {years} datiert, während Titel, Dateiname oder Zeitraum {declared} nennen. Vermutlich ist ein Jahr falsch eingetippt.`,
      fr: `Les lignes {lines} sont datées de {years}, alors que le titre, le nom du fichier ou la période indiquent {declared}. Une des années est probablement une faute de frappe.`,
    },
    technical: `{file}:{lines} year(s) {years} not among the declared year(s) {declared} (dataset label, file name, record title or temporal extent).`,
  },
  {
    id: 'ROW-DATE-YYMMDD',
    category: 'B',
    severity: 'info',
    params: ['interpreted'],
    plain: {
      pl: `Daty w kolumnie „{field}” mają dwucyfrowy rok i dopisano do niego stulecie; np. „{value}” odczytano jako {interpreted}. Używaj czterocyfrowego roku.`,
      en: `Dates in column "{field}" have a two-digit year and a century was added; e.g. "{value}" was read as {interpreted}. Use a four-digit year.`,
      de: `Daten in der Spalte „{field}“ haben eine zweistellige Jahreszahl, das Jahrhundert wurde ergänzt; z. B. wurde „{value}“ als {interpreted} gelesen. Verwenden Sie eine vierstellige Jahreszahl.`,
      fr: `Les dates de la colonne « {field} » ont une année à deux chiffres et un siècle a été ajouté ; par ex. « {value} » a été lu comme {interpreted}. Utilisez une année à quatre chiffres.`,
    },
    technical: `{file} field {field} value '{value}': YY-MM-DD read as {interpreted} (century inferred; ambiguous).`,
  },
  {
    id: 'ROW-TZ-UNKNOWN',
    category: 'B',
    severity: 'info',
    params: [],
    plain: {
      pl: `Nie podano strefy czasowej dla godzin w kolumnie „{field}”. Napisz, czy to UTC, czy czas lokalny.`,
      en: `The time zone of the times in column "{field}" is not stated. Say whether they are UTC or local time.`,
      de: `Die Zeitzone der Uhrzeiten in der Spalte „{field}“ ist nicht angegeben. Geben Sie an, ob es UTC oder Ortszeit ist.`,
      fr: `Le fuseau horaire des heures de la colonne « {field} » n'est pas indiqué. Précisez s'il s'agit de l'UTC ou de l'heure locale.`,
    },
    technical: `{file} field {field}: date-time values carry neither a UTC marker nor an offset; time zone unknown.`,
  },
  {
    id: 'ROW-UNIT-MISSING',
    category: 'B',
    severity: 'warning',
    params: ['headers'],
    plain: {
      pl: `Brak jednostki dla: {headers}. Dopisz jednostkę w nagłówku każdej kolumny, np. „DIC [µmol/kg]”.`,
      en: `No unit is given for: {headers}. Add the unit to each column header, e.g. "DIC [µmol/kg]".`,
      de: `Keine Einheit angegeben für: {headers}. Ergänzen Sie die Einheit in der Kopfzeile jeder Spalte, z. B. „DIC [µmol/kg]“.`,
      fr: `Aucune unité n'est indiquée pour : {headers}. Ajoutez l'unité dans l'en-tête de chaque colonne, par ex. « DIC [µmol/kg] ».`,
    },
    technical: `{file}: no unit in the header or in the metadata for column(s) {headers}.`,
  },
  {
    id: 'ROW-HEADER-CODE-SHAPE',
    category: 'B',
    severity: 'warning',
    params: ['column', 'code', 'collection', 'length'],
    plain: {
      pl: `Nagłówek „{column}”: kod {code} po „SDN:{collection}::” nie jest kodem {collection}, który ma dokładnie {length} wielkich liter i cyfr. W NVS nie ma takiego pojęcia (odpowiedź 404). Sprawdź kod: literówka albo dodatkowy znak.`,
      en: `Header "{column}": the code {code} after "SDN:{collection}::" is not a {collection} code, which has exactly {length} capital letters and digits. NVS has no such concept (it answers 404). Check the code for a typo or an extra character.`,
      de: `Kopfzeile „{column}“: Der Code {code} nach „SDN:{collection}::“ ist kein {collection}-Code, der genau {length} Großbuchstaben und Ziffern hat. NVS kennt keinen solchen Begriff (Antwort 404). Prüfen Sie den Code auf einen Tippfehler oder ein überzähliges Zeichen.`,
      fr: `En-tête « {column} » : le code {code} après « SDN:{collection}:: » n'est pas un code {collection}, qui compte exactement {length} majuscules et chiffres. NVS n'a pas ce concept (réponse 404). Vérifiez le code : faute de frappe ou caractère en trop.`,
    },
    technical: `{file}, column {column}: the code "{code}" after the explicit prefix SDN:{collection}:: is not of the shape of a {collection} code ({length} upper-case letters and digits); the concept page does not exist (NVS: 404). Only the prefixed form is checked; a bare word is never read as a code.`,
    citations: [NVS_CODE_SHAPE],
  },
  {
    id: 'ROW-DEPTH-SIGN',
    category: 'B',
    severity: 'info',
    params: ['header'],
    plain: {
      pl: `Nie wiadomo, czy głębokość w kolumnie „{header}” liczona jest w dół (wartości dodatnie), czy w górę. Opisz przyjętą konwencję w nagłówku lub w opisie.`,
      en: `It is not stated whether depth in column "{header}" is counted downwards (positive) or upwards. Describe the convention in the header or in the description.`,
      de: `Es ist nicht angegeben, ob die Tiefe in der Spalte „{header}“ nach unten (positiv) oder nach oben gezählt wird. Beschreiben Sie die Konvention in der Kopfzeile oder in der Beschreibung.`,
      fr: `Il n'est pas précisé si la profondeur de la colonne « {header} » est comptée vers le bas (positive) ou vers le haut. Décrivez la convention dans l'en-tête ou dans la description.`,
    },
    technical: `{file}: depth column '{header}' has no stated sign convention.`,
  },
  {
    id: 'ROW-DM-COORDS',
    category: 'B',
    severity: 'info',
    params: [],
    plain: {
      pl: `Współrzędne w kolumnie „{field}” są zapisane w stopniach i minutach (np. „{value}”). Przeliczono je na stopnie dziesiętne; sprawdź kilka z nich.`,
      en: `Coordinates in column "{field}" are written as degrees and minutes (e.g. "{value}"). They were converted to decimal degrees; check a few of them.`,
      de: `Koordinaten in der Spalte „{field}“ sind in Grad und Minuten geschrieben (z. B. „{value}“). Sie wurden in Dezimalgrad umgerechnet; prüfen Sie einige davon.`,
      fr: `Les coordonnées de la colonne « {field} » sont écrites en degrés et minutes (par ex. « {value} »). Elles ont été converties en degrés décimaux ; vérifiez-en quelques-unes.`,
    },
    technical: `{file} field {field} value '{value}': degree-minute(-second) text converted to decimal degrees.`,
  },
  {
    id: 'ROW-HEMISPHERE-CONFLICT',
    category: 'B',
    severity: 'warning',
    params: ['hemisphere'],
    plain: {
      pl: `W wierszach {lines} wartość w kolumnie „{field}” (np. „{value}”) nie zgadza się z literą półkuli z kolumny „{hemisphere}”: ma własny minus lub własną literę albo litera dotyczy drugiej osi. Zostawiono ją bez zmian, bez ponownej zmiany znaku; popraw te wiersze.`,
      en: `In lines {lines} the value in column "{field}" (e.g. "{value}") disagrees with the hemisphere letter in column "{hemisphere}": it has a minus sign or a letter of its own, or the letter belongs to the other axis. It was kept as written and its sign was not changed again; correct these rows.`,
      de: `In den Zeilen {lines} passt der Wert in Spalte „{field}“ (z. B. „{value}“) nicht zum Hemisphärenbuchstaben in Spalte „{hemisphere}“: Er hat ein eigenes Minus oder einen eigenen Buchstaben, oder der Buchstabe gehört zur anderen Achse. Er blieb unverändert, das Vorzeichen wurde nicht erneut geändert; korrigieren Sie die Zeilen.`,
      fr: `Aux lignes {lines}, la valeur de la colonne « {field} » (par ex. « {value} ») ne concorde pas avec la lettre d'hémisphère de la colonne « {hemisphere} » : elle a un moins ou une lettre propre, ou la lettre est de l'autre axe. Elle est gardée telle quelle, sans second changement de signe ; corrigez ces lignes.`,
    },
    technical: `{file}:{lines} field {field} value '{value}': disagrees with the hemisphere letter in {hemisphere}; kept as written, not negated again.`,
  },
  {
    id: 'ROW-HEMISPHERE-UNPAIRED',
    category: 'B',
    severity: 'warning',
    params: ['hemisphere'],
    plain: {
      pl: `Kolumna „{hemisphere}” jest ustawiona jako litera półkuli, ale należy do innego położenia niż „{field}” (słowa początek/koniec się nie zgadzają), więc nie została zastosowana. Sprawdź, którą kolumnę wybrano jako współrzędną.`,
      en: `Column "{hemisphere}" is set as a hemisphere letter, but it belongs to a different position than "{field}" (their start and end words disagree), so it was not applied. Check which column is mapped as the coordinate.`,
      de: `Die Spalte „{hemisphere}“ ist als Hemisphärenbuchstabe eingestellt, gehört aber zu einer anderen Position als „{field}“ (Anfangs- und Endwörter passen nicht), daher wurde sie nicht angewendet. Prüfen Sie, welche Spalte als Koordinate zugeordnet ist.`,
      fr: `La colonne « {hemisphere} » est définie comme lettre d'hémisphère, mais elle appartient à une autre position que « {field} » (les mots début et fin ne concordent pas) ; elle n'a donc pas été appliquée. Vérifiez quelle colonne est associée à la coordonnée.`,
    },
    technical: `{file} field {field}: hemisphere column {hemisphere} belongs to another start/end position; not applied.`,
  },
  {
    id: 'ROW-HEMISPHERE-MISSING',
    category: 'B',
    severity: 'warning',
    params: ['hemisphere'],
    plain: {
      pl: `W wierszach {lines} kolumna „{field}” ma wartość (np. „{value}”), ale kolumna półkuli „{hemisphere}” jest pusta albo nie zawiera N, S, E, W. Wartość zostawiono bez zmian, więc dla półkuli południowej lub zachodniej może mieć zły znak; uzupełnij literę.`,
      en: `In lines {lines} column "{field}" has a value (e.g. "{value}") but the hemisphere column "{hemisphere}" is empty or holds something other than N, S, E, W. The value was kept as written, so it may have the wrong sign for the southern or western hemisphere; fill in the letter.`,
      de: `In den Zeilen {lines} hat Spalte „{field}“ einen Wert (z. B. „{value}“), aber die Hemisphärenspalte „{hemisphere}“ ist leer oder enthält etwas anderes als N, S, E, W. Der Wert blieb unverändert und kann für die Süd- oder Westhalbkugel das falsche Vorzeichen haben; ergänzen Sie den Buchstaben.`,
      fr: `Aux lignes {lines}, la colonne « {field} » a une valeur (par ex. « {value} ») mais la colonne d'hémisphère « {hemisphere} » est vide ou contient autre chose que N, S, E, W. La valeur est gardée telle quelle et peut avoir le mauvais signe pour l'hémisphère sud ou ouest ; complétez la lettre.`,
    },
    technical: `{file}:{lines} field {field} value '{value}': the hemisphere column {hemisphere} is empty or not N/S/E/W; kept as written.`,
  },
  {
    id: 'ROW-ZERO-COORD',
    category: 'B',
    severity: 'error',
    params: [],
    citations: [CITE.obisZeroCoord, CITE.biocheckZeroCoord],
    plain: {
      pl: `W wierszach {lines} szerokość i długość geograficzna wynoszą jednocześnie 0. To punkt w Zatoce Gwinejskiej, który zwykle oznacza brakujące współrzędne wpisane jako zero. Wpisz właściwą pozycję albo zostaw puste komórki.`,
      en: `In lines {lines} latitude and longitude are both 0. That point lies in the Gulf of Guinea and usually stands for coordinates that are missing and were typed as zero. Enter the real position or leave the cells empty.`,
      de: `In den Zeilen {lines} sind Breite und Länge beide 0. Dieser Punkt liegt im Golf von Guinea und steht meist für fehlende Koordinaten, die als Null eingetragen wurden. Tragen Sie die echte Position ein oder lassen Sie die Zellen leer.`,
      fr: `Aux lignes {lines}, la latitude et la longitude valent toutes deux 0. Ce point se trouve dans le golfe de Guinée et signale d'habitude des coordonnées manquantes saisies comme zéro. Saisissez la vraie position ou laissez les cellules vides.`,
    },
    technical: `{file}:{lines} latitude and longitude are both 0 (obis-qc ZERO_COORD, which drops the record; Biocheck "0-0 coordinates"). Reported instead of ROW-LAT-EQ-LON, which it would also match.`,
  },
  {
    id: 'ROW-NO-COORD',
    category: 'B',
    severity: 'warning',
    params: ['count'],
    citations: [CITE.obisNoCoord],
    plain: {
      pl: `W wierszach {lines} (razem: {count}) brakuje szerokości lub długości geograficznej, choć pozostałe wiersze mają pozycję. Takiego rekordu nie da się nanieść na mapę. Uzupełnij współrzędne; jeśli to wiersz zbiorczy lub pomocniczy, pomiń tę uwagę.`,
      en: `In lines {lines} ({count} in all) the latitude or the longitude is missing although the other rows have a position. Such a record cannot be placed on a map. Fill in the coordinates; if it is a summary or helper row, ignore this note.`,
      de: `In den Zeilen {lines} (insgesamt {count}) fehlt die Breite oder die Länge, obwohl die übrigen Zeilen eine Position haben. Ein solcher Datensatz lässt sich nicht auf einer Karte einordnen. Ergänzen Sie die Koordinaten; bei einer Summen- oder Hilfszeile ignorieren Sie den Hinweis.`,
      fr: `Aux lignes {lines} ({count} au total), la latitude ou la longitude manque alors que les autres lignes ont une position. Un tel enregistrement ne peut pas être placé sur une carte. Complétez les coordonnées ; pour une ligne de synthèse ou d'aide, ignorez cette remarque.`,
    },
    technical: `{file}:{lines} {count} row(s) with a blank latitude or longitude cell while other rows of the sheet have a position (obis-qc NO_COORD, which drops the record). Blank trailing rows, summary rows and rows that inherit a position from a parent event are not counted.`,
  },
  {
    id: 'ROW-DEPTH-MIN-MAX',
    category: 'B',
    severity: 'error',
    params: [],
    citations: [CITE.obisDepthMinMax, CITE.obistoolsDepthMinMax],
    plain: {
      pl: `W wierszach {lines} głębokość minimalna jest większa od maksymalnej (np. {value}). Obie kolumny mogły zostać zamienione albo wpisane błędnie; popraw wartości.`,
      en: `In lines {lines} the minimum depth is greater than the maximum depth (e.g. {value}). The two columns may be swapped or mistyped; correct the values.`,
      de: `In den Zeilen {lines} ist die minimale Tiefe größer als die maximale (z. B. {value}). Die beiden Spalten sind vielleicht vertauscht oder falsch eingegeben; korrigieren Sie die Werte.`,
      fr: `Aux lignes {lines}, la profondeur minimale dépasse la profondeur maximale (par ex. {value}). Les deux colonnes sont peut-être inversées ou mal saisies ; corrigez les valeurs.`,
    },
    technical: `{file}:{lines} minimumDepthInMeters greater than maximumDepthInMeters (first: {value}); obis-qc MIN_DEPTH_EXCEEDS_MAX, obistools check_depth.`,
  },
  {
    id: 'ROW-DEPTH-RANGE',
    category: 'B',
    severity: 'warning',
    params: [],
    thresholds: [
      th('depth.min', -100000, 'm', CITE.obisDepthRange),
      th('depth.max', 11000, 'm', CITE.obisDepthRange),
    ],
    citations: [CITE.noaaDeepest],
    plain: {
      pl: `Głębokość w kolumnie „{field}” (wiersze {lines}, np. {value} m) jest poza zakresem od {threshold.depth.min} do {threshold.depth.max} m, który OBIS uznaje za możliwy. Najgłębszy punkt oceanu ma ok. 10 935 m. Sprawdź jednostkę (metry) i znak.`,
      en: `Depth in column "{field}" (lines {lines}, e.g. {value} m) is outside the range {threshold.depth.min} to {threshold.depth.max} m that OBIS accepts. The deepest point of the ocean is about 10,935 m. Check the unit (metres) and the sign.`,
      de: `Die Tiefe in der Spalte „{field}“ (Zeilen {lines}, z. B. {value} m) liegt außerhalb des Bereichs {threshold.depth.min} bis {threshold.depth.max} m, den OBIS zulässt. Der tiefste Punkt des Ozeans liegt bei etwa 10 935 m. Prüfen Sie Einheit (Meter) und Vorzeichen.`,
      fr: `La profondeur de la colonne « {field} » (lignes {lines}, par ex. {value} m) sort de l'intervalle {threshold.depth.min} à {threshold.depth.max} m accepté par OBIS. Le point le plus profond de l'océan est à environ 10 935 m. Vérifiez l'unité (mètres) et le signe.`,
    },
    technical: `{file}:{lines} field {field} value '{value}': depth outside {threshold.depth.min}..{threshold.depth.max} m (obis-qc DEPTH_OUT_OF_RANGE bounds, inclusive; positive down; a column with an upward convention is judged after the sign is turned). The deepest point of the ocean, Challenger Deep, is about 10,935 m (NOAA).`,
  },
  {
    id: 'ROW-DATE-FUTURE',
    category: 'B',
    severity: 'warning',
    params: [],
    citations: [CITE.obisDateFuture],
    plain: {
      pl: `Data w kolumnie „{field}” (wiersze {lines}, np. {value}) jest późniejsza niż dzisiaj; dla przedziału liczy się jego koniec. Zdarzenie z przyszłości nie mogło się jeszcze odbyć: sprawdź rok, miesiąc i dzień.`,
      en: `The date in column "{field}" (lines {lines}, e.g. {value}) is later than today; for an interval its end counts. An event in the future cannot have happened yet: check the year, month and day.`,
      de: `Das Datum in der Spalte „{field}“ (Zeilen {lines}, z. B. {value}) liegt nach dem heutigen Tag; bei einem Zeitraum zählt sein Ende. Ein Ereignis in der Zukunft kann noch nicht stattgefunden haben: Prüfen Sie Jahr, Monat und Tag.`,
      fr: `La date de la colonne « {field} » (lignes {lines}, par ex. {value}) est postérieure à aujourd'hui ; pour un intervalle, sa fin compte. Un événement futur n'a pas pu avoir lieu : vérifiez l'année, le mois et le jour.`,
    },
    technical: `{file}:{lines} field {field} value '{value}': the date, or the end of the interval, is later than today (UTC; a value counts as future only when it can have begun nowhere yet, so a date within a day of today, as read in the latest time zone UTC+14, is not; a year or month counts by its first day). obis-qc DATE_IN_FUTURE.`,
  },
  {
    id: 'ROW-INVISIBLE-CHAR',
    category: 'B',
    severity: 'warning',
    params: ['chars'],
    citations: [CITE.obisHiddenChars],
    plain: {
      pl: `W kolumnie „{field}” wartości w wierszach {lines} zawierają niewidoczne znaki ({chars}), np. „{value}”. Wyglądają jak zwykła spacja, ale nazwa lub identyfikator z takim znakiem nie zgodzi się z tą samą nazwą wpisaną normalnie. Zastąp je zwykłą spacją albo usuń.`,
      en: `In column "{field}" the values in lines {lines} contain invisible characters ({chars}), e.g. "{value}". They look like an ordinary space, but a name or an identifier with such a character will not match the same name typed normally. Replace them with a plain space or remove them.`,
      de: `In der Spalte „{field}“ enthalten die Werte in den Zeilen {lines} unsichtbare Zeichen ({chars}), z. B. „{value}“. Sie sehen wie ein normales Leerzeichen aus, aber ein Name oder eine ID mit so einem Zeichen stimmt nicht mit dem normal getippten überein. Ersetzen Sie sie durch ein normales Leerzeichen oder löschen Sie sie.`,
      fr: `Dans la colonne « {field} », les valeurs des lignes {lines} contiennent des caractères invisibles ({chars}), par ex. « {value} ». Ils ressemblent à une espace ordinaire, mais un nom ou un identifiant avec un tel caractère ne correspond pas au même nom saisi normalement. Remplacez-les par une espace ordinaire ou supprimez-les.`,
    },
    technical: `{file}:{lines} field {field} value '{value}': invisible characters inside the value ({chars}). OBIS trims only the ends of a value, so inside they break name matching, vocabulary matching and duplicate checks (OBIS Manual, "Hidden characters and non-breaking spaces"). Checked columns: station, cruise and sample identifiers, and the name, identifier and vocabulary columns of Darwin Core input.`,
  },
];
