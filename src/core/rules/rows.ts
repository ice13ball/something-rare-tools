// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { CITE, th } from './citations';
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

/** Sentence added when the group came from the tick (not from a cruise column): the likely cause of a false alarm is mixed ships. */
/** All three rules: a case names a place with more than one row, so its rows are listed event by event in square brackets. */
const SHIP_PLACES = {
  param: 'places',
  plain: {
    pl: `W nawiasie kwadratowym: wiersze każdego punktu trasy; „+” łączy zdarzenia odległe o mniej niż 10 km, liczone jako jeden punkt.`,
    en: `In square brackets: the rows of each point of the track; "+" joins events less than 10 km apart, counted as one point.`,
    de: `In eckigen Klammern: die Zeilen jedes Punkts der Fahrt; „+“ verbindet Ereignisse unter 10 km Abstand, als ein Punkt gezählt.`,
    fr: `Entre crochets : les lignes de chaque point du trajet ; « + » relie des événements à moins de 10 km, comptés comme un seul point.`,
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
 *   ROW-LAT-EQ-LON        (none)      lines = all rows with lat === lon; value = the shared value
 *   ROW-RAGGED            expected, found   header field count and the field count of the FIRST listed line
 *   ROW-NON-NUMERIC       (none)      field = column, value = example token, lines = rows
 *   ROW-NA-VARIANT        (none)      field = column, value = example token (e.g. NANA), lines = rows
 *   ROW-STATION-MOVED     station, positions   positions = compact text such as "76.9N 15.5E (9 rows); 76.9N 16.5E (14 rows)"
 *                         signLon / signLat    'yes' when two positions differ (almost) only by the sign of that coordinate (optional)
 *   ROW-STATION-SPREAD    station, km, positions   km = largest distance between the station's positions (rounded); far = 'yes' above 1000 km (optional)
 *   ROW-ON-LAND-NEAR      count, places   the same for positions 10-50 km inside (note, no hint)
 *   ROW-ON-LAND           count, places, flips   count = rows on land; places = up to 5 positions "lat, lon (rows; ≥N km)";
 *                         flips (optional) = "position → the same with a sign flipped or axes exchanged" where that lies at sea
 *   ROW-SHIP-SPEED        count, cases   count = events flagged (a merged cast = one event); cases = up to 5 of "previous→this→next: km, h, ≥kn; km, h, ≥kn"
 *                         (line numbers; km = distance, h = LONGEST possible time between the two events, kn = the speed at least); declared (optional) = 'yes' when
 *                         the single-cruise tick, not a cruise column, formed the group; mixed (optional) = 'yes' when a large share of the places is named
 *   ROW-SHIP-SPEED-UNUSUAL  the same, at the lower limit (info)
 *   ROW-SHIP-SPEED-PAIR   count, cases   count = pairs; cases = "first→second: km, h, ≥kn"; declared as above
 *   ROW-DATE-UNPARSEABLE  (none)      field = column, value = example, lines = rows
 *   ROW-DATE-MISSING      count, percent   rows without a date, and their share of all rows (number, 0-100)
 *   ROW-YEAR-OUTLIER      years, declared  years = years of the flagged rows; declared = years named in label/file name/title/extent
 *   ROW-DATE-YYMMDD       interpreted field = column, value = example as written (once per column); interpreted = that example as read, YYYY-MM-DD (the century chosen)
 *   ROW-TZ-UNKNOWN        (none)      field = column (once per column)
 *   ROW-UNIT-MISSING      headers     column headers without a unit, comma-separated
 *   ROW-DEPTH-SIGN        header      the depth column header
 *   ROW-DM-COORDS         (none)      field = column, value = example text (once per column)
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
    technical: `{file}:{lines} latitude equals longitude exactly (value '{value}').`,
  },
  {
    id: 'ROW-RAGGED',
    category: 'B',
    severity: 'error',
    params: ['expected', 'found'],
    plain: {
      pl: `Wiersze {lines} mają inną liczbę wartości niż nagłówek (oczekiwano {expected}, np. {found} w pierwszym z nich). Kolumny mogły się przesunąć; popraw te wiersze w pliku źródłowym — narzędzie ich nie zmieniło.`,
      en: `Lines {lines} have a different number of values than the header (expected {expected}, e.g. {found} in the first of them). The columns may be shifted; fix these lines in the original file — the tool did not change them.`,
      de: `Die Zeilen {lines} haben eine andere Anzahl von Werten als die Kopfzeile (erwartet {expected}, z. B. {found} in der ersten). Die Spalten sind möglicherweise verschoben; korrigieren Sie sie in der Originaldatei – das Werkzeug hat sie nicht verändert.`,
      fr: `Les lignes {lines} ont un nombre de valeurs différent de l'en-tête ({expected} attendues, par ex. {found} dans la première). Les colonnes sont peut-être décalées ; corrigez-les dans le fichier d'origine — l'outil ne les a pas modifiées.`,
    },
    technical: `{file}:{lines} expected {expected} fields, found {found} (first listed line); rows kept as found, not realigned.`,
  },
  {
    id: 'ROW-NON-NUMERIC',
    category: 'B',
    severity: 'warning',
    params: [],
    plain: {
      pl: `Kolumna „{field}” powinna zawierać liczby, ale w wierszach {lines} jest tekst, np. „{value}”. Zastąp go liczbą albo zostaw pustą komórkę.`,
      en: `Column "{field}" should contain numbers, but lines {lines} contain text such as "{value}". Replace it with a number or leave the cell empty.`,
      de: `Die Spalte „{field}“ sollte Zahlen enthalten, aber die Zeilen {lines} enthalten Text wie „{value}“. Ersetzen Sie ihn durch eine Zahl oder lassen Sie die Zelle leer.`,
      fr: `La colonne « {field} » devrait contenir des nombres, mais les lignes {lines} contiennent du texte, par ex. « {value} ». Remplacez-le par un nombre ou laissez la cellule vide.`,
    },
    technical: `{file}:{lines} field {field} value '{value}': non-numeric token in a numeric column.`,
  },
  {
    id: 'ROW-NA-VARIANT',
    category: 'B',
    severity: 'warning',
    params: [],
    plain: {
      pl: `Kolumna „{field}” oznacza brak danych w nietypowy sposób (np. „{value}”) w wierszach {lines}. Użyj jednego, spójnego oznaczenia albo pustej komórki.`,
      en: `Column "{field}" marks missing values in an unusual way (e.g. "{value}") in lines {lines}. Use one consistent marker, or an empty cell.`,
      de: `Die Spalte „{field}“ kennzeichnet fehlende Werte auf ungewöhnliche Weise (z. B. „{value}“) in den Zeilen {lines}. Verwenden Sie eine einheitliche Kennzeichnung oder eine leere Zelle.`,
      fr: `La colonne « {field} » signale les valeurs manquantes de façon inhabituelle (par ex. « {value} ») aux lignes {lines}. Utilisez un seul marqueur cohérent, ou une cellule vide.`,
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
    plainIf: [
      {
        param: 'far',
        plain: {
          pl: `Przy ponad 1000 km to niemal na pewno błąd jednej z pozycji, nie obszar.`,
          en: `At more than 1000 km this is almost certainly a wrong position, not an area.`,
          de: `Bei mehr als 1000 km ist das fast sicher eine falsche Position, kein Gebiet.`,
          fr: `Au-delà de 1000 km, c'est presque certainement une position erronée, pas une zone.`,
        },
      },
    ],
    technical: `{file} station {station}: positions up to {km} km apart (more than 10 km; great-circle distance) at {positions}.`,
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
    plainIf: [SHIP_PLACES, SHIP_SPLIT, SHIP_DECLARED, SHIP_MIXED],
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
    plainIf: [SHIP_MAY_BE_REAL, SHIP_IMPOSSIBLE_HOP, SHIP_PLACES, SHIP_SPLIT, SHIP_DECLARED, SHIP_MIXED],
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
  },
  {
    id: 'ROW-DATE-MISSING',
    category: 'B',
    severity: 'info',
    params: ['count', 'percent'],
    plain: {
      pl: `{count} wierszy ({percent} %) nie ma daty, choć pozostałe mają. Uzupełnij brakujące daty.`,
      en: `{count} rows ({percent} %) have no date although the other rows do. Fill in the missing dates.`,
      de: `{count} Zeilen ({percent} %) haben kein Datum, obwohl die übrigen eines haben. Ergänzen Sie die fehlenden Daten.`,
      fr: `{count} lignes ({percent} %) n'ont pas de date alors que les autres en ont une. Complétez les dates manquantes.`,
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
];
