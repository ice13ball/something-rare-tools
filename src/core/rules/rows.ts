// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { CITE, th } from './citations';
import type { RuleSpec } from './spec';

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
    technical: `{file}:{lines} station {station} at {positions}: positions differ by a typed digit or by exchanged axes.`,
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
