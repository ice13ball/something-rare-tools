// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Finding, Lang, RuleDef } from '../types';
import { applyPlurals } from '../i18n/plural';
import { formatLines } from '../report';
import { CITE } from './citations';
import type { RuleSpec } from './spec';

/*
 * Rules of the converter (/convert, src/core/convert), category 'B', raised only by src/core/convert.
 *
 * ⚠️ A SEPARATE REGISTRY, on purpose. These rules are NOT in registry.ts SPECS, so they are in no public listing: docs/rules.md (generated
 * from RULES), the rule links of /check, the tip rule data (src/app/tipRules.tsx), ROLE_FEEDS and the "exactly 90 rules" table test do
 * not know them, and `getRule()` / `makeFinding()` / `renderPlain()` of /check throw on a CONV id. The converter page is hidden until its
 * reveal; adding these ids to RULES would put the converter's wording on public pages before then. At the reveal the list can be merged into
 * registry.ts (one line) and docs/rules.md regenerated. Use makeConvertFinding / renderConvertPlain / renderConvertTechnical below.
 *
 * Declared params per rule (file, sheet, lines, field, value are generic):
 *   CONV-SPLIT-UNDECIDED       count            value = an example name; count = names whose split is not approved
 *   CONV-QUANTITY-UNDECLARED   missing          missing = what the declaration lacks: kind, unit, basis, per, effort
 *   CONV-COUNT-NOT-INTEGER     count            field = column, value = an example, lines = rows
 *   CONV-NEGATIVE-QUANTITY     count            field = column (or the effort column), value = an example, lines = rows
 *   CONV-SAMPLE-CODE-MISSING   count, column    column = the sample-code column ('none' when the sheet has none); lines = the rows without a code
 *   CONV-ID-DUPLICATE          kind, count, hint   kind = event | occurrence; value = an example id; lines = every row of a repeated id; hint = what to do
 *   CONV-TAB-IN-VALUE          count            field = column, value = an example (tab / line break shown as a space), lines = rows
 *   CONV-TEXT-IN-TAXON-CELL    count            field = column, value = the texts, lines = rows
 *   CONV-TAXON-SAME-EVENT      count, columns   value = the scientific name, columns = the columns / rows that carry it in one sample; count = how many
 *   CONV-ZERO-SKIPPED          count            count = zero cells left out (the list was not declared complete)
 *   CONV-SAMPLE-CONFLICT       what, count      what = the attribute that differs; value = a sample code; lines = its rows
 *   CONV-NERC-UNKNOWN          what             what = the quantity that has no verified NERC concept
 *   CONV-UNIT-NO-P06           unit             unit = the unit as declared
 *   CONV-DEPTH-UNIT            unit             field = depth column, unit = the unit it states
 *   CONV-EFFORT-INVALID        count            field = column, value = an example, lines = rows (a sample size column)
 *   CONV-EFFORT-VALUE-INVALID  reason           value = the typed sample size; reason = not-a-number | not-positive | ambiguous | thousands
 *   CONV-NO-TAXON              shape            shape = wide | long
 *   CONV-SUMMARY-ROW-SKIPPED   count            value = the labels, lines = rows
 *   CONV-EML-MISSING           fields           fields = codes of what the dataset description lacks (title, abstract, creator, contact name, contact email, institution code, dataset name)
 *   CONV-LICENCE-UNSET         (none)           no licence chosen
 *   CONV-BASIS-UNSET           (none)           no basisOfRecord chosen
 *   CONV-EMOF-ORPHAN           count, kind      kind = event | occurrence; value = an example id; file = the eMoF table
 *   CONV-EMOF-EVENT-MISMATCH   count            value = an example occurrenceID
 *   CONV-EMOF-VALUE-EMPTY      count            lines = rows of the eMoF table
 *   CONV-EMOF-TYPE-EMPTY       count            lines = rows of the eMoF table
 *   CONV-COLUMN-NOT-EXPORTED   count, columns   columns = the headers whose role (variable, pressure, a taxon ID of a wide sheet) this version does not write
 *   CONV-NAMEID-MISSING        count            count = occurrences without a scientificNameID
 *   CONV-NAMEID-APHIA-LIKE     column           column = the header of a hand-marked taxon ID column that holds bare whole numbers
 *   CONV-DEVICE-MISSING        (none)           the sheet has no sampling device
 *   CONV-LICENCE-DIFFERS       chosen, source   the licence chosen differs from the recognised licence of the dropped metadata files
 *   CONV-MESH-INVALID          reason           value = the typed mesh size; reason = not-a-number | not-positive | ambiguous | thousands
 */
const NERC_MANUAL = {
  label: 'OBIS Manual, "Extended Measurement Or Fact" (manual.obis.org/format_emof.html; read 2026-10-25)',
  url: 'https://manual.obis.org/format_emof.html',
  locator: '"For measurementTypeID, measurementUnitID, and measurementValueID you must use controlled vocabulary terms."',
};

export const CONVERT_RULES: readonly RuleSpec[] = [
  {
    id: 'CONV-SPLIT-UNDECIDED',
    category: 'B',
    severity: 'error',
    params: ['count'],
    plain: {
      pl: `{count} {+count:nazwa taksonu ma|nazwy taksonów mają|nazw taksonów ma} dopisek (cf., sp., ?) albo stadium rozwojowe (c2, juv). Zatwierdź każdy podział na nazwę, dopisek i stadium; pierwszy to „{value}”.`,
      en: `{count} taxon {+count:name carries|names carry} a qualifier (cf., sp., ?) or a life stage (c2, juv). Approve each split into name, qualifier and stage; the first one is "{value}".`,
      de: `{count} {+count:Taxonname enthält|Taxonnamen enthalten} einen Zusatz (cf., sp., ?) oder ein Entwicklungsstadium (c2, juv). Bestätigen Sie jede Aufteilung in Name, Zusatz und Stadium; die erste ist „{value}“.`,
      fr: `{count} {+count:nom de taxon porte|noms de taxons portent} une mention (cf., sp., ?) ou un stade (c2, juv). Validez chaque découpage en nom, mention et stade ; le premier est « {value} ».`,
    },
    technical: `{file}, {sheet}: {count} distinct taxon name(s) were split into scientificName, identificationQualifier and lifeStage and the split is not approved yet; example "{value}". verbatimIdentification keeps the exact text. Conversion is blocked until every distinct split is approved.`,
  },
  {
    id: 'CONV-QUANTITY-UNDECLARED',
    category: 'B',
    severity: 'error',
    params: ['missing'],
    plain: {
      pl: `Nie wiadomo, co oznaczają liczby w tym arkuszu. Wskaż, czy to liczebność (sztuki), zagęszczenie czy biomasa, z jednostką, a jeśli znasz wielkość próby (objętość lub powierzchnię), podaj ją w całości. Brakuje: {missing}.`,
      en: `It is not known what the numbers in this sheet mean. Say whether they are counts, densities or biomass, with the unit, and if you give the sample size (a volume or an area), give all of it. Missing: {missing}.`,
      de: `Es ist unklar, was die Zahlen in diesem Blatt bedeuten. Geben Sie an, ob es Anzahlen, Dichten oder Biomasse sind, mit Einheit; nennen Sie die Probengröße (Volumen oder Fläche), dann vollständig. Es fehlt: {missing}.`,
      fr: `On ne sait pas ce que signifient les nombres de cette feuille. Indiquez s'il s'agit d'effectifs, de densités ou de biomasse, avec l'unité ; si vous donnez la taille d'échantillon (volume ou surface), donnez-la en entier. Il manque : {missing}.`,
    },
    technical: `{file}, {sheet}: the quantity declaration of the sheet is missing or incomplete (missing: {missing}). A count needs only its kind; a density needs the unit; a biomass needs the unit and the basis (wet, dry or ash-free dry weight); an effort needs its value or column, its unit and whether it is a volume or an area.`,
  },
  {
    id: 'CONV-COUNT-NOT-INTEGER',
    category: 'B',
    severity: 'error',
    params: ['count'],
    plain: {
      pl: `W kolumnie „{field}” liczebność ma części dziesiętne w wierszach {lines} (razem: {count}), np. {value}. Liczba osobników musi być całkowita. Zadeklaruj zagęszczenie albo popraw wartości.`,
      en: `Column "{field}" is declared as a count but has decimals in lines {lines} ({count} in all), e.g. {value}. A number of individuals must be whole. Declare a density instead, or correct the values.`,
      de: `Die Spalte „{field}“ gilt als Anzahl, hat aber in den Zeilen {lines} Dezimalstellen (insgesamt {count}), z. B. {value}. Eine Individuenzahl muss ganz sein. Geben Sie stattdessen eine Dichte an oder korrigieren Sie die Werte.`,
      fr: `La colonne « {field} » est déclarée comme effectif mais a des décimales aux lignes {lines} ({count} au total), p. ex. {value}. Un nombre d'individus doit être entier. Déclarez plutôt une densité ou corrigez les valeurs.`,
    },
    technical: `{file}:{lines} field {field}: {count} value(s) of a declared count are not integers (example {value}); individualCount must be a whole number. Those cells were not converted.`,
  },
  {
    id: 'CONV-NEGATIVE-QUANTITY',
    category: 'B',
    severity: 'error',
    params: ['count'],
    plain: {
      pl: `W kolumnie „{field}” są wartości ujemne w wierszach {lines} (razem: {count}), np. {value}. Liczebność, zagęszczenie, biomasa i wielkość próby nie mogą być ujemne.`,
      en: `Column "{field}" has negative values in lines {lines} ({count} in all), e.g. {value}. A count, density, biomass or sample size cannot be negative.`,
      de: `Die Spalte „{field}“ hat negative Werte in den Zeilen {lines} (insgesamt {count}), z. B. {value}. Anzahl, Dichte, Biomasse und Probengröße können nicht negativ sein.`,
      fr: `La colonne « {field} » contient des valeurs négatives aux lignes {lines} ({count} au total), p. ex. {value}. Un effectif, une densité, une biomasse ou une taille d'échantillon ne peut pas être négatif.`,
    },
    technical: `{file}:{lines} field {field}: {count} negative value(s) in a quantity or effort column (example {value}). Those cells were not converted.`,
  },
  {
    id: 'CONV-SAMPLE-CODE-MISSING',
    category: 'B',
    severity: 'error',
    params: ['count', 'column'],
    plain: {
      pl: `Brakuje kodu próbki w wierszach {lines} (razem: {count}). Kod próbki staje się identyfikatorem w archiwum, więc musi pochodzić od Ciebie. Możesz pobrać arkusz z proponowanymi kodami, sprawdzić je i wgrać ponownie.`,
      en: `The sample code is missing in lines {lines} ({count} in all). The code becomes the identifier in the archive, so it has to come from you. You can download the sheet with proposed codes, check them and upload it again.`,
      de: `Der Probencode fehlt in den Zeilen {lines} (insgesamt {count}). Der Code wird zur Kennung im Archiv und muss daher von Ihnen kommen. Sie können das Blatt mit vorgeschlagenen Codes herunterladen, prüfen und erneut hochladen.`,
      fr: `Le code d'échantillon manque aux lignes {lines} ({count} au total). Le code devient l'identifiant dans l'archive : il doit donc venir de vous. Vous pouvez télécharger la feuille avec des codes proposés, les vérifier et la recharger.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} row(s) have no sample code (column: {column}). The eventID of a sample is the user's own code and is never derived from depth or row order. A one-time proposal (proposeSampleCodes) returns the sheet with a new code column.`,
  },
  {
    id: 'CONV-ID-DUPLICATE',
    category: 'B',
    severity: 'error',
    params: ['kind', 'count', 'hint'],
    plain: {
      pl: `Ten sam identyfikator powstaje więcej niż raz, np. „{value}”, w wierszach {lines} (powtórzone: {count}). Identyfikatory muszą być unikalne: zmień powtórzony kod lub nagłówek albo, gdy kody powtarzają się między stacjami, zaznacz poprzedzanie kodem stacji.`,
      en: `The same identifier is produced more than once, e.g. "{value}", in lines {lines} ({count} repeated). Identifiers must be unique: change the repeated code or header or, when codes repeat between stations, tick the station prefix.`,
      de: `Dieselbe Kennung entsteht mehrfach, z. B. „{value}“, in den Zeilen {lines} (wiederholt: {count}). Kennungen müssen eindeutig sein: ändern Sie den wiederholten Code oder Kopf oder, wenn Codes zwischen Stationen wiederkehren, wählen Sie das Stationspräfix.`,
      fr: `Le même identifiant est produit plusieurs fois, p. ex. « {value} », aux lignes {lines} (répétés : {count}). Les identifiants doivent être uniques : changez le code ou l'en-tête répété ou, si des codes se répètent entre stations, cochez le préfixe de station.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} repeated {kind} identifier(s), example "{value}". {hint}`,
    citations: [CITE.obistoolsEventIds, CITE.biocheckOccurrenceId],
  },
  {
    id: 'CONV-TAB-IN-VALUE',
    category: 'B',
    severity: 'error',
    params: ['count'],
    plain: {
      pl: `W kolumnie „{field}” wartość ma tabulator albo podział wiersza w wierszach {lines} (razem: {count}), np. „{value}”. Pliki archiwum są rozdzielane tabulatorami, więc taka wartość je rozbije. Usuń znak w arkuszu.`,
      en: `Column "{field}" has a tab or a line break inside a value in lines {lines} ({count} in all), e.g. "{value}". The archive files are tab-separated, so such a value would break them. Remove the character in the sheet.`,
      de: `Die Spalte „{field}“ enthält in den Zeilen {lines} einen Tabulator oder Zeilenumbruch im Wert (insgesamt {count}), z. B. „{value}“. Die Archivdateien sind tabulatorgetrennt, ein solcher Wert würde sie zerstören. Entfernen Sie das Zeichen im Blatt.`,
      fr: `La colonne « {field} » contient une tabulation ou un saut de ligne dans une valeur aux lignes {lines} ({count} au total), p. ex. « {value} ». Les fichiers de l'archive sont séparés par des tabulations : une telle valeur les casserait. Supprimez le caractère dans la feuille.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {count} value(s) contain a tab or line break (example "{value}", shown with a space). The text files of the archive are tab-separated with one record per line.`,
    citations: [CITE.obisHiddenChars],
  },
  {
    id: 'CONV-TEXT-IN-TAXON-CELL',
    category: 'B',
    severity: 'warning',
    params: ['count'],
    plain: {
      pl: `W kolumnie „{field}” zamiast liczby jest tekst ({value}) w wierszach {lines} (razem: {count}). Zapisano obecność taksonu bez ilości, a tekst trafił do uwag. Jeśli to nie znaczy „obecny”, popraw arkusz.`,
      en: `Column "{field}" has text instead of a number ({value}) in lines {lines} ({count} in all). The taxon is recorded as present without a quantity and the text is kept in the remarks. If it does not mean "present", correct the sheet.`,
      de: `Die Spalte „{field}“ enthält statt einer Zahl Text ({value}) in den Zeilen {lines} (insgesamt {count}). Das Taxon ist als anwesend ohne Menge erfasst, der Text steht in den Bemerkungen. Bedeutet er nicht „anwesend“, korrigieren Sie das Blatt.`,
      fr: `La colonne « {field} » contient du texte au lieu d'un nombre ({value}) aux lignes {lines} ({count} au total). Le taxon est noté présent sans quantité et le texte est gardé dans les remarques. S'il ne signifie pas « présent », corrigez la feuille.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {count} non-numeric cell(s) in a taxon or quantity column ({value}). Each becomes an occurrence with occurrenceStatus present, no quantity, and the text in occurrenceRemarks.`,
  },
  {
    id: 'CONV-TAXON-SAME-EVENT',
    category: 'B',
    severity: 'warning',
    params: ['count', 'columns'],
    plain: {
      pl: `Ten sam takson „{value}” (to samo stadium i dopisek) występuje {count} {+count:raz|razy|razy} w jednej próbce: {columns}. Każdy zapis zostaje osobno, nic nie jest sumowane. Sprawdź, czy to nie powinien być jeden zapis.`,
      en: `The same taxon "{value}" (same stage and qualifier) appears {count} {+count:time|times} in one sample: {columns}. Each stays a separate record and nothing is summed. Check whether it should be one record.`,
      de: `Dasselbe Taxon „{value}“ (gleiches Stadium und gleicher Zusatz) kommt {count}-mal in einer Probe vor: {columns}. Jeder Eintrag bleibt getrennt, nichts wird summiert. Prüfen Sie, ob es ein Eintrag sein sollte.`,
      fr: `Le même taxon « {value} » (même stade et même mention) apparaît {count} fois dans un échantillon : {columns}. Chaque enregistrement reste séparé et rien n'est additionné. Vérifiez s'il ne devrait y en avoir qu'un.`,
    },
    technical: `{file}, {sheet}: {count} columns or rows give the same (eventID, scientificName, lifeStage, identificationQualifier): {value} in {columns}. No values are summed; each keeps its own occurrenceID.`,
  },
  {
    id: 'CONV-ZERO-SKIPPED',
    category: 'B',
    severity: 'info',
    params: ['count'],
    plain: {
      pl: `Pominięto {count} {+count:komórkę|komórki|komórek} z zerem, bo nie zaznaczono, że lista gatunków jest pełna. Zero oznacza „brak” tylko wtedy, gdy w próbce szukano wszystkich gatunków z listy.`,
      en: `{count} {+count:cell with a zero was|cells with a zero were} left out, because the species list was not declared complete. A zero means "absent" only when every species of the list was looked for in the sample.`,
      de: `{count} {+count:Zelle mit einer Null wurde|Zellen mit einer Null wurden} ausgelassen, da die Artenliste nicht als vollständig angegeben wurde. Eine Null bedeutet nur dann „fehlt“, wenn in der Probe nach allen Arten der Liste gesucht wurde.`,
      fr: `{count} {+count:cellule à zéro a été ignorée|cellules à zéro ont été ignorées}, car la liste d'espèces n'a pas été déclarée complète. Un zéro signifie « absent » seulement si toutes les espèces de la liste ont été recherchées dans l'échantillon.`,
    },
    technical: `{file}, {sheet}: {count} zero cell(s) not converted (full species list not ticked). With the tick a zero becomes occurrenceStatus absent (individualCount 0 for counts only); an empty or NA cell never becomes a record.`,
    citations: [CITE.obisOccurrenceStatus],
  },
  {
    id: 'CONV-SAMPLE-CONFLICT',
    category: 'B',
    severity: 'error',
    params: ['what', 'count'],
    plain: {
      pl: `Wiersze próbki „{value}” (wiersze {lines}) mają różne wartości daty, pozycji, głębokości lub wielkości próby. Próbka to jedno zdarzenie, więc te wartości muszą być takie same we wszystkich jej wierszach.`,
      en: `The rows of sample "{value}" (lines {lines}) differ in date, position, depth or sample size. A sample is one event, so these values must be the same in all its rows.`,
      de: `Die Zeilen der Probe „{value}“ (Zeilen {lines}) unterscheiden sich in Datum, Position, Tiefe oder Probengröße. Eine Probe ist ein Ereignis, daher müssen diese Werte in allen ihren Zeilen gleich sein.`,
      fr: `Les lignes de l'échantillon « {value} » (lignes {lines}) diffèrent par la date, la position, la profondeur ou la taille. Un échantillon est un seul événement : ces valeurs doivent être identiques sur toutes ses lignes.`,
    },
    technical: `{file}, {sheet}:{lines}: rows of sample "{value}" differ in {what} ({count} sample(s) affected). The first row is not silently preferred.`,
  },
  {
    id: 'CONV-NERC-UNKNOWN',
    category: 'B',
    severity: 'warning',
    params: ['what'],
    plain: {
      pl: `Dla tej wielkości nie ma sprawdzonego pojęcia w słowniku NERC, więc measurementTypeID zostanie pusty. OBIS wymaga takiego pojęcia; trzeba je dobrać ręcznie przed publikacją.`,
      en: `There is no verified NERC concept for this quantity, so measurementTypeID stays empty. OBIS requires one; it has to be chosen by hand before publishing.`,
      de: `Für diese Größe gibt es keinen geprüften NERC-Begriff, daher bleibt measurementTypeID leer. OBIS verlangt einen; er muss vor der Veröffentlichung von Hand gewählt werden.`,
      fr: `Il n'existe pas de concept NERC vérifié pour cette grandeur : measurementTypeID reste vide. OBIS en exige un ; il faut le choisir à la main avant la publication.`,
    },
    technical: `{file}, {sheet}: no verified NERC P01 concept for {what}; measurementTypeID left empty (OBIS: controlled vocabulary terms are required for measurementTypeID).`,
    citations: [NERC_MANUAL],
  },
  {
    id: 'CONV-UNIT-NO-P06',
    category: 'B',
    severity: 'warning',
    params: ['unit'],
    plain: {
      pl: `Jednostki „{unit}” nie ma wśród sprawdzonych jednostek NERC (P06), więc measurementUnitID zostanie pusty. Jednostka nie jest przeliczana; wpisana zostaje tak, jak ją podano.`,
      en: `The unit "{unit}" is not among the verified NERC units (P06), so measurementUnitID stays empty. The unit is not converted; it is written as given.`,
      de: `Die Einheit „{unit}“ gehört nicht zu den geprüften NERC-Einheiten (P06), daher bleibt measurementUnitID leer. Die Einheit wird nicht umgerechnet, sondern wie angegeben geschrieben.`,
      fr: `L'unité « {unit} » ne figure pas parmi les unités NERC vérifiées (P06) : measurementUnitID reste vide. L'unité n'est pas convertie ; elle est écrite telle que donnée.`,
    },
    technical: `{file}, {sheet}: unit "{unit}" has no verified P06 concept; measurementUnit is written as declared, measurementUnitID is empty, no conversion is made.`,
    citations: [NERC_MANUAL],
  },
  {
    id: 'CONV-DEPTH-UNIT',
    category: 'B',
    severity: 'error',
    params: ['unit'],
    plain: {
      pl: `Kolumna głębokości „{field}” ma jednostkę „{unit}”. Darwin Core wymaga metrów, a konwerter niczego nie przelicza. Podaj głębokość w metrach albo usuń jednostkę, jeśli to są metry.`,
      en: `Depth column "{field}" states the unit "{unit}". Darwin Core needs metres and the converter converts nothing. Give the depth in metres, or remove the unit if it is metres.`,
      de: `Die Tiefenspalte „{field}“ nennt die Einheit „{unit}“. Darwin Core verlangt Meter, und der Konverter rechnet nichts um. Geben Sie die Tiefe in Metern an oder entfernen Sie die Einheit, wenn es Meter sind.`,
      fr: `La colonne de profondeur « {field} » indique l'unité « {unit} ». Darwin Core exige des mètres et le convertisseur ne convertit rien. Donnez la profondeur en mètres, ou retirez l'unité si ce sont des mètres.`,
    },
    technical: `{file}, {sheet} field {field}: depth unit "{unit}" is not metres; minimumDepthInMeters and maximumDepthInMeters are in metres and values are never rescaled.`,
  },
  {
    id: 'CONV-EFFORT-INVALID',
    category: 'B',
    severity: 'error',
    params: ['count'],
    plain: {
      pl: `W kolumnie „{field}” (wielkość próby) nie ma dodatniej liczby w wierszach {lines} (razem: {count}), np. „{value}”. Bez niej nie da się zapisać wielkości próby.`,
      en: `Column "{field}" (sample size) has no positive number in lines {lines} ({count} in all), e.g. "{value}". The sample size cannot be written without one.`,
      de: `Die Spalte „{field}“ (Probengröße) enthält in den Zeilen {lines} keine positive Zahl (insgesamt {count}), z. B. „{value}“. Ohne sie lässt sich die Probengröße nicht schreiben.`,
      fr: `La colonne « {field} » (taille d'échantillon) n'a pas de nombre positif aux lignes {lines} ({count} au total), p. ex. « {value} ». Sans lui, la taille d'échantillon ne peut pas être écrite.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {count} effort cell(s) are empty, zero or not a number (example "{value}"); sampleSizeValue needs a positive number.`,
  },
  {
    id: 'CONV-EFFORT-VALUE-INVALID',
    category: 'B',
    severity: 'error',
    params: ['reason'],
    plain: {
      pl: `Wpisana wielkość próby „{value}” jest nieprawidłowa: {reason}. Wpisz liczbę większą od zera, z kropką lub przecinkiem jako znakiem dziesiętnym.`,
      en: `The sample size you typed, "{value}", cannot be used: {reason}. Type a number above zero, with a point or a comma as the decimal mark.`,
      de: `Die eingegebene Probengröße „{value}“ ist unbrauchbar: {reason}. Geben Sie eine Zahl über null ein, mit Punkt oder Komma als Dezimalzeichen.`,
      fr: `La taille d'échantillon saisie « {value} » est inutilisable : {reason}. Saisissez un nombre supérieur à zéro, avec un point ou une virgule comme séparateur décimal.`,
    },
    technical: `{file}, {sheet}: the typed sample size "{value}" is not accepted ({reason}); it must be a number above zero with at most one decimal mark (point or comma). No effort is written.`,
  },
  {
    id: 'CONV-NO-TAXON',
    category: 'B',
    severity: 'error',
    params: ['shape'],
    plain: {
      pl: `W tym arkuszu nie wskazano kolumn z taksonami albo z ilością. W arkuszu szerokim nagłówki kolumn są nazwami taksonów, w długim jest kolumna z nazwą taksonu i kolumna z ilością.`,
      en: `No taxon columns, or no quantity column, are marked in this sheet. In a wide sheet the column headers are the taxon names; in a long sheet there is one column with the taxon and one with the quantity.`,
      de: `In diesem Blatt sind keine Taxon-Spalten oder keine Mengenspalte markiert. In einem breiten Blatt sind die Spaltenköpfe die Taxonnamen; in einem langen Blatt gibt es eine Spalte mit dem Taxon und eine mit der Menge.`,
      fr: `Aucune colonne de taxon, ou de quantité, n'est marquée dans cette feuille. Dans une feuille large, les en-têtes de colonnes sont les noms de taxons ; dans une feuille longue, une colonne porte le taxon et une autre la quantité.`,
    },
    technical: `{file}, {sheet}: no column with the taxon role for a {shape} sheet (wide: taxon columns with header:true; long: a taxon column and a quantity column).`,
  },
  {
    id: 'CONV-SUMMARY-ROW-SKIPPED',
    category: 'B',
    severity: 'info',
    params: ['count'],
    plain: {
      pl: `Pominięto {count} {+count:wiersz podsumowania|wiersze podsumowania|wierszy podsumowania} ({value}) w {+count:wierszu|wierszach|wierszach} {lines}. {+count:To nie jest próbka, a jej wartości podwoiłyby|To nie są próbki, a ich wartości podwoiłyby|To nie są próbki, a ich wartości podwoiłyby} liczebności.`,
      en: `{count} summary {+count:row|rows} ({value}) in {+count:line|lines} {lines} {+count:was|were} left out. {+count:It is not a sample, and its value would|They are not samples, and their values would} double the counts.`,
      de: `{count} {+count:Zusammenfassungszeile|Zusammenfassungszeilen} ({value}) in {+count:Zeile|den Zeilen} {lines} {+count:wurde|wurden} ausgelassen. {+count:Sie ist keine Probe, und ihre Werte würden|Sie sind keine Proben, und ihre Werte würden} die Anzahlen verdoppeln.`,
      fr: `{count} {+count:ligne de synthèse|lignes de synthèse} ({value}) {+count:à la ligne|aux lignes} {lines} {+count:a été ignorée|ont été ignorées}. {+count:Ce n'est pas un échantillon et sa valeur doublerait|Ce ne sont pas des échantillons et leurs valeurs doubleraient} les effectifs.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} row(s) whose sample code or station reads as a summary label ({value}) were not converted.`,
  },
  {
    id: 'CONV-EML-MISSING',
    category: 'B',
    severity: 'error',
    params: ['fields'],
    plain: {
      pl: `Opis zbioru danych jest niepełny albo nieużyteczny: {fields}. Archiwum potrzebuje tych informacji (tytuł, streszczenie, autorzy, kontakt, kod instytucji, nazwa zbioru); uzupełnij je w formularzu.`,
      en: `The dataset description is incomplete or not usable: {fields}. The archive needs these (title, abstract, creators, contact, institution code, dataset name); fill them in on the form.`,
      de: `Die Beschreibung des Datensatzes ist unvollständig oder unbrauchbar: {fields}. Das Archiv braucht diese Angaben (Titel, Zusammenfassung, Autoren, Kontakt, Institutionskürzel, Datensatzname); tragen Sie sie im Formular ein.`,
      fr: `La description du jeu de données est incomplète ou inutilisable : {fields}. L'archive a besoin de ces informations (titre, résumé, auteurs, contact, code d'institution, nom du jeu) ; remplissez-les dans le formulaire.`,
    },
    technical: `Dataset description (eml.xml, and the datasetName and institutionCode columns of event.txt) is missing or unusable: {fields}. BioCheck reports an Event table without datasetName and institutionCode as an error (docs/research/qc-sources.md, stage 0 spike, Item 2); OBIS asks for title, citation, contact and abstract (manual.obis.org/eml.html).`,
  },
  {
    id: 'CONV-LICENCE-UNSET',
    category: 'B',
    severity: 'error',
    params: [],
    plain: {
      pl: `Nie wybrano licencji. Wybierz jedną z trzech (CC0, CC-BY, CC-BY-NC); decyzję podejmuje posiadacz praw do danych, a narzędzie niczego nie zakłada.`,
      en: `No licence is chosen. Pick one of the three (CC0, CC-BY, CC-BY-NC); the rights holder decides, and the tool assumes nothing.`,
      de: `Es ist keine Lizenz gewählt. Wählen Sie eine der drei (CC0, CC-BY, CC-BY-NC); die Entscheidung trifft der Rechteinhaber, das Werkzeug nimmt nichts an.`,
      fr: `Aucune licence n'est choisie. Choisissez l'une des trois (CC0, CC-BY, CC-BY-NC) ; le titulaire des droits décide, l'outil ne suppose rien.`,
    },
    technical: `No licence was chosen. The EML intellectualRights element is written only from an explicit choice of CC0-1.0, CC-BY-4.0 or CC-BY-NC-4.0 (the set the IPT supports); nothing is defaulted.`,
  },
  {
    id: 'CONV-BASIS-UNSET',
    category: 'B',
    severity: 'error',
    params: [],
    plain: {
      pl: `Nie wybrano rodzaju zapisu (basisOfRecord), np. obserwacja człowieka, okaz konserwowany albo próbka materiału. Zależy od tego, co faktycznie zebrano, więc nie ma wartości domyślnej.`,
      en: `The kind of record (basisOfRecord) is not chosen, e.g. human observation, preserved specimen or material sample. It depends on what was actually collected, so there is no default.`,
      de: `Die Art des Datensatzes (basisOfRecord) ist nicht gewählt, z. B. menschliche Beobachtung, konserviertes Exemplar oder Materialprobe. Sie hängt davon ab, was tatsächlich gesammelt wurde, daher gibt es keinen Standardwert.`,
      fr: `Le type d'enregistrement (basisOfRecord) n'est pas choisi, par ex. observation humaine, spécimen conservé ou échantillon de matériel. Il dépend de ce qui a réellement été collecté : il n'y a pas de valeur par défaut.`,
    },
    technical: `basisOfRecord was not chosen. It is written on every occurrence row and must be a value of the Darwin Core vocabulary; there is no default because HumanObservation, PreservedSpecimen and MaterialSample mean different things about what was collected.`,
  },
  {
    id: 'CONV-EMOF-ORPHAN',
    category: 'B',
    severity: 'error',
    params: ['count', 'kind'],
    plain: {
      pl: `{count} {+count:wiersz pomiarów wskazuje|wiersze pomiarów wskazują|wierszy pomiarów wskazuje} na {kind} (np. „{value}”), którego nie ma w tabeli. Pomiar bez swojego zdarzenia lub wystąpienia zostałby odrzucony.`,
      en: `{count} measurement {+count:row refers|rows refer} to {kind} (e.g. "{value}") that is not in the table. A measurement without its event or occurrence would be rejected.`,
      de: `{count} {+count:Messzeile verweist|Messzeilen verweisen} auf {kind} (z. B. „{value}“), das in der Tabelle fehlt. Eine Messung ohne ihr Ereignis oder Vorkommen würde abgelehnt.`,
      fr: `{count} {+count:ligne de mesure renvoie|lignes de mesure renvoient} à {kind} (p. ex. « {value} ») qui ne figure pas dans la table. Une mesure sans son événement ou son occurrence serait rejetée.`,
    },
    technical: `{file}: {count} eMoF row(s) name an {kind} id that is not in the {kind} table (example "{value}"). BioCheck: an eMoF eventID that is not in the core, or an eMoF occurrenceID that is not in Occurrence, is an error (docs/research/qc-sources.md, Item 2).`,
  },
  {
    id: 'CONV-EMOF-EVENT-MISMATCH',
    category: 'B',
    severity: 'error',
    params: ['count'],
    plain: {
      pl: `{count} {+count:pomiar jest przypisany|pomiary są przypisane|pomiarów jest przypisanych} do innego zdarzenia niż jego wystąpienie (np. „{value}”). Pomiar wystąpienia musi leżeć w zdarzeniu tego wystąpienia.`,
      en: `{count} {+count:measurement belongs|measurements belong} to a different event than its occurrence (e.g. "{value}"). A measurement of an occurrence must sit in that occurrence's event.`,
      de: `{count} {+count:Messung gehört|Messungen gehören} zu einem anderen Ereignis als ihr Vorkommen (z. B. „{value}“). Eine Messung eines Vorkommens muss im Ereignis dieses Vorkommens stehen.`,
      fr: `{count} {+count:mesure appartient|mesures appartiennent} à un autre événement que son occurrence (p. ex. « {value} »). La mesure d'une occurrence doit figurer dans l'événement de cette occurrence.`,
    },
    technical: `{file}: {count} eMoF row(s) have an eventID different from the eventID of the occurrence they name (example occurrenceID "{value}"). BioCheck reports this as an error (docs/research/qc-sources.md, Item 2).`,
  },
  {
    id: 'CONV-EMOF-VALUE-EMPTY',
    category: 'B',
    severity: 'error',
    params: ['count'],
    plain: {
      pl: `{count} {+count:wiersz pomiarów nie ma|wiersze pomiarów nie mają|wierszy pomiarów nie ma} wartości (measurementValue). Pomiar bez wartości nic nie mówi, a archiwum zostałoby odrzucone.`,
      en: `{count} measurement {+count:row has|rows have} no value (measurementValue). A measurement without a value says nothing, and the archive would be rejected.`,
      de: `{count} {+count:Messzeile hat|Messzeilen haben} keinen Wert (measurementValue). Eine Messung ohne Wert sagt nichts aus, und das Archiv würde abgelehnt.`,
      fr: `{count} {+count:ligne de mesure n'a|lignes de mesure n'ont} pas de valeur (measurementValue). Une mesure sans valeur ne dit rien et l'archive serait rejetée.`,
    },
    technical: `{file}:{lines}: {count} eMoF row(s) have an empty measurementValue. BioCheck: a NULL measurementValue is an error (docs/research/qc-sources.md, Item 2).`,
  },
  {
    id: 'CONV-EMOF-TYPE-EMPTY',
    category: 'B',
    severity: 'error',
    params: ['count'],
    plain: {
      pl: `{count} {+count:wiersz pomiarów nie ma|wiersze pomiarów nie mają|wierszy pomiarów nie ma} rodzaju pomiaru (measurementType), więc nie wiadomo, co zmierzono. Zadeklaruj, co oznaczają liczby w arkuszu.`,
      en: `{count} measurement {+count:row has|rows have} no kind of measurement (measurementType), so it is not known what was measured. Declare what the numbers in the sheet mean.`,
      de: `{count} {+count:Messzeile hat|Messzeilen haben} keine Messart (measurementType), daher ist unklar, was gemessen wurde. Geben Sie an, was die Zahlen im Blatt bedeuten.`,
      fr: `{count} {+count:ligne de mesure n'a|lignes de mesure n'ont} pas de type de mesure (measurementType) : on ne sait pas ce qui a été mesuré. Indiquez ce que signifient les nombres de la feuille.`,
    },
    technical: `{file}:{lines}: {count} eMoF row(s) have an empty measurementType. The type text is the preferred label of the NERC concept, or the declared meaning when no concept is verified.`,
  },
  {
    id: 'CONV-COLUMN-NOT-EXPORTED',
    category: 'B',
    severity: 'warning',
    params: ['count', 'columns'],
    plain: {
      pl: `{count} {+count:kolumna ma|kolumny mają|kolumn ma} znaczenie, którego przy tym ustawieniu arkusza nie zapisuje się w archiwum (na przykład zmierzona wielkość, ciśnienie albo stadium w arkuszu szerokim): {columns}. Ich wartości nie trafią do archiwum; zaakceptuj to, aby eksportować bez nich.`,
      en: `{count} {+count:column has|columns have} a meaning that is not written to the archive as the sheet is set up (for example a measured variable, a pressure, or a life stage in a wide sheet): {columns}. Their values will not be in the archive; accept this to export without them.`,
      de: `{count} {+count:Spalte hat|Spalten haben} eine Bedeutung, die bei dieser Einstellung des Blatts nicht ins Archiv geschrieben wird (zum Beispiel Messgröße, Druck oder Stadium in einem breiten Blatt): {columns}. Ihre Werte stehen nicht im Archiv; akzeptieren Sie das, um ohne sie zu exportieren.`,
      fr: `{count} {+count:colonne a|colonnes ont} un sens qui n'est pas écrit dans l'archive avec ce réglage de la feuille (par exemple grandeur mesurée, pression ou stade dans une feuille large) : {columns}. Leurs valeurs ne seront pas dans l'archive ; acceptez-le pour exporter sans elles.`,
    },
    technical: `{file}, {sheet}: {count} column(s) with a role other than ignore that this conversion does not read as the sheet is set up ({columns}): a measured variable or a pressure, a second column of a role that is read once, a role of the other shape (a life stage, qualifier, occurrenceID, taxon ID or quantity column in a wide sheet, a taxon header column in a long one), the quantity type, or a sample-size column when the sample size is not set to a column. Nothing from them is written. The warning has to be accepted before the export.`,
  },
  {
    id: 'CONV-NAMEID-MISSING',
    category: 'B',
    severity: 'warning',
    params: ['count'],
    plain: {
      pl: `{count} {+count:wystąpienie nie ma|wystąpienia nie mają|wystąpień nie ma} scientificNameID. BioCheck i kontrole OBIS zgłaszają archiwum bez niego jako błąd. W arkuszu szerokim identyfikatory dojdą z późniejszym wyszukiwaniem w WoRMS; arkusz długi może wskazać kolumnę z nimi (AphiaID lub scientificNameID).`,
      en: `{count} {+count:occurrence has|occurrences have} no scientificNameID. BioCheck and the OBIS checks report an archive without it as an error. In a wide sheet the IDs come with the later WoRMS lookup; a long sheet can mark a column holding them (an AphiaID or scientificNameID column).`,
      de: `{count} {+count:Vorkommen hat|Vorkommen haben} keine scientificNameID. BioCheck und die OBIS-Prüfungen melden ein Archiv ohne sie als Fehler. In einem breiten Blatt kommen die Kennungen mit der späteren WoRMS-Abfrage; ein langes Blatt kann eine Spalte mit ihnen markieren (AphiaID oder scientificNameID).`,
      fr: `{count} {+count:occurrence n'a|occurrences n'ont} pas de scientificNameID. BioCheck et les contrôles d'OBIS signalent une archive sans lui comme une erreur. Dans une feuille large, les identifiants viendront de la recherche WoRMS ultérieure ; une feuille longue peut marquer leur colonne (AphiaID ou scientificNameID).`,
    },
    technical: `{file}: {count} occurrence(s) have no scientificNameID. BioCheck lists scientificNameID among the required fields of a leaf event (docs/research/qc-sources.md, Item 2). This stage writes one only from a column the user marked (a scientificNameID column as given, a WoRMS AphiaID column as urn:lsid:marinespecies.org:taxname:<id>); nothing is looked up or guessed.`,
  },
  {
    id: 'CONV-DEVICE-MISSING',
    category: 'B',
    severity: 'warning',
    params: [],
    plain: {
      pl: `Dla tego arkusza nie podano narzędzia próbkowania. BioCheck zgłasza „No sampling instrument present” dla archiwum bez pomiaru nazwy narzędzia próbkowania. Wybierz narzędzie w formularzu arkusza albo zaakceptuj jego brak.`,
      en: `No sampling device is given for this sheet. BioCheck reports "No sampling instrument present" for an archive with no measurement of the name of the sampling instrument. Choose the device in the sheet's form, or accept that it is missing.`,
      de: `Für dieses Blatt ist kein Probenahmegerät angegeben. BioCheck meldet „No sampling instrument present“, wenn das Archiv keine Messung des Namens des Probenahmegeräts enthält. Wählen Sie das Gerät im Formular des Blatts oder akzeptieren Sie, dass es fehlt.`,
      fr: `Aucun engin d'échantillonnage n'est indiqué pour cette feuille. BioCheck signale « No sampling instrument present » pour une archive sans mesure du nom de l'instrument d'échantillonnage. Choisissez l'engin dans le formulaire de la feuille ou acceptez son absence.`,
    },
    technical: `{file}, {sheet}: no sampling device was chosen, so no eMoF row NMSPINST (Name of sampling instrument) is written for the samples. BioCheck warns "No sampling instrument present" (docs/research/qc-sources.md, Item 2).`,
  },
  {
    id: 'CONV-MESH-INVALID',
    category: 'B',
    severity: 'error',
    params: ['reason'],
    plain: {
      pl: `Rozmiaru oczka „{value}” nie można użyć: {reason}. Wpisz rozmiar w mikrometrach jako zwykłą liczbę albo zostaw pole puste.`,
      en: `The mesh size "{value}" cannot be used: {reason}. Type the size in micrometres as a plain number, or leave it empty.`,
      de: `Die Maschenweite „{value}“ ist nicht verwendbar: {reason}. Geben Sie die Größe in Mikrometern als einfache Zahl ein oder lassen Sie das Feld leer.`,
      fr: `La taille de maille « {value} » est inutilisable : {reason}. Saisissez la taille en micromètres comme un nombre simple, ou laissez le champ vide.`,
    },
    technical: `{file}, {sheet}: the typed mesh size "{value}" is refused ({reason}). It is written as MSHSIZE1 with the unit um (P06 UMIC) only when it is a plain number above zero.`,
  },
  {
    id: 'CONV-NAMEID-APHIA-LIKE',
    category: 'B',
    severity: 'warning',
    params: ['column'],
    plain: {
      pl: `Kolumna „{column}” ma same liczby całkowite i została ręcznie oznaczona jako identyfikator taksonu, ale jej nagłówek nie brzmi AphiaID. Wyglądają na AphiaID z WoRMS; są zapisywane bez zmian. Zmień nagłówek na AphiaID, aby zapisać je jako LSID z WoRMS.`,
      en: `Column "{column}" holds only whole numbers and was marked as the taxon ID by hand, but its header is not AphiaID. They look like WoRMS AphiaIDs; they are written as they are. Rename the header to AphiaID to have them written as WoRMS LSIDs.`,
      de: `Die Spalte „{column}“ enthält nur ganze Zahlen und wurde von Hand als Taxon-Kennung markiert, ihr Kopf lautet aber nicht AphiaID. Es sieht nach WoRMS-AphiaIDs aus; sie werden unverändert geschrieben. Benennen Sie den Kopf in AphiaID um, damit sie als WoRMS-LSIDs geschrieben werden.`,
      fr: `La colonne « {column} » ne contient que des nombres entiers et a été marquée à la main comme identifiant de taxon, mais son en-tête n'est pas AphiaID. Ils ressemblent à des AphiaID de WoRMS ; ils sont écrits tels quels. Renommez l'en-tête en AphiaID pour qu'ils soient écrits comme LSID de WoRMS.`,
    },
    technical: `{file}, {sheet}: column {column} was given the taxon ID role by hand; every filled cell is a positive whole number but the header is none of AphiaID, aphia_id, Aphia ID, so the values are written to scientificNameID as given, not as the urn:lsid of a WoRMS taxon.`,
  },
  {
    id: 'CONV-LICENCE-DIFFERS',
    category: 'B',
    severity: 'warning',
    params: ['chosen', 'source'],
    plain: {
      pl: `Wybrana licencja ({chosen}) różni się od tej, którą podają Twoje metadane ({source}). O tym, która licencja obowiązuje, decyduje posiadacz praw; zaakceptuj to tylko wtedy, gdy posiadacz praw tak zdecydował.`,
      en: `The licence chosen ({chosen}) differs from the one your metadata states ({source}). The rights holder decides which licence applies; accept this only if the rights holder has decided it.`,
      de: `Die gewählte Lizenz ({chosen}) weicht von der ab, die Ihre Metadaten nennen ({source}). Welche Lizenz gilt, entscheidet der Rechteinhaber; akzeptieren Sie dies nur, wenn der Rechteinhaber es so entschieden hat.`,
      fr: `La licence choisie ({chosen}) diffère de celle que vos métadonnées indiquent ({source}). Le détenteur des droits décide quelle licence s'applique ; n'acceptez ceci que si le détenteur des droits l'a décidé.`,
    },
    technical: `{file}: the chosen licence {chosen} is not among the licence(s) recognised in the dropped metadata files ({source}). The archive would carry a licence different from its source's, so the user has to acknowledge it.`,
  },
];

/** Declared params per CONV rule id. */
export const CONVERT_RULE_PARAMS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(CONVERT_RULES.map((s) => [s.id, s.params]));

/** The rules without their param list, like RULES in registry.ts. */
export const CONVERT_RULE_DEFS: readonly RuleDef[] = CONVERT_RULES.map(({ params: _params, ...def }) => def);

const BY_ID: ReadonlyMap<string, RuleDef> = new Map(CONVERT_RULE_DEFS.map((r) => [r.id, r]));

export const isConvertRuleId = (id: string): boolean => BY_ID.has(id);

export function getConvertRule(id: string): RuleDef {
  const rule = BY_ID.get(id);
  if (!rule) throw new Error(`Unknown converter rule id: ${id}`);
  return rule;
}

/** A Finding with the severity of its CONV rule; lines are sorted and de-duplicated (as makeFinding in registry.ts). */
export function makeConvertFinding(ruleId: string, f: Omit<Finding, 'ruleId' | 'severity' | 'params'> & { params?: Finding['params'] }): Finding {
  const rule = getConvertRule(ruleId);
  const finding: Finding = { ...f, ruleId, severity: rule.severity, params: { ...(f.params ?? {}) } };
  if (f.lines) finding.lines = [...new Set(f.lines)].sort((a, b) => a - b);
  return finding;
}

/** What a declaration lacks, in words (CONV-QUANTITY-UNDECLARED carries codes in `missing`; the plain text names them in the reader's language). */
const MISSING_WORDS: Record<string, Record<Lang, string>> = {
  kind: { en: 'the kind of number', pl: 'rodzaj liczby', de: 'die Art der Zahl', fr: 'la nature du nombre' },
  unit: { en: 'the unit', pl: 'jednostka', de: 'die Einheit', fr: "l'unité" },
  basis: { en: 'the kind of weight', pl: 'rodzaj masy', de: 'die Art des Gewichts', fr: 'le type de masse' },
  'per volume or per area': { en: 'per volume or per area', pl: 'na objętość czy na powierzchnię', de: 'je Volumen oder je Fläche', fr: 'par volume ou par surface' },
  medium: { en: 'water column or bed', pl: 'słup wody czy dno', de: 'Wassersäule oder Boden', fr: "colonne d'eau ou fond" },
  'effort unit': { en: 'the unit of the sample size', pl: 'jednostka wielkości próby', de: 'die Einheit der Probengröße', fr: "l'unité de la taille d'échantillon" },
  'effort value': { en: 'the value of the sample size', pl: 'wartość wielkości próby', de: 'der Wert der Probengröße', fr: "la valeur de la taille d'échantillon" },
  'effort volume or area': { en: 'whether the sample size is a volume or an area', pl: 'czy wielkość próby to objętość, czy powierzchnia', de: 'ob die Probengröße ein Volumen oder eine Fläche ist', fr: "si la taille d'échantillon est un volume ou une surface" },
  'effort column': { en: 'a column marked as sample size', pl: 'kolumna oznaczona jako wielkość próby', de: 'eine als Probengröße markierte Spalte', fr: "une colonne marquée comme taille d'échantillon" },
};

/** Why a typed sample size is refused, in words (CONV-EFFORT-VALUE-INVALID carries a code in `reason`). */
const REASON_WORDS: Record<string, Record<Lang, string>> = {
  'not-a-number': { en: 'it is not a number', pl: 'to nie jest liczba', de: 'es ist keine Zahl', fr: "ce n'est pas un nombre" },
  'not-positive': { en: 'it is zero or negative', pl: 'to zero albo liczba ujemna', de: 'es ist null oder negativ', fr: "c'est zéro ou négatif" },
  ambiguous: {
    en: 'it has more than one point or comma, so it cannot be read safely',
    pl: 'ma więcej niż jedną kropkę lub przecinek, więc nie da się go bezpiecznie odczytać',
    de: 'es hat mehr als einen Punkt oder ein Komma und lässt sich nicht sicher lesen',
    fr: "il a plus d'un point ou d'une virgule et ne peut pas être lu sans risque",
  },
  thousands: {
    en: 'it could be a thousands separator: write it without one, or with more or fewer decimals',
    pl: 'może to być separator tysięcy: zapisz liczbę bez niego albo z większą lub mniejszą liczbą miejsc po przecinku',
    de: 'es könnte ein Tausendertrennzeichen sein: schreiben Sie die Zahl ohne eines oder mit mehr oder weniger Dezimalstellen',
    fr: "il pourrait s'agir d'un séparateur de milliers : écrivez le nombre sans séparateur, ou avec plus ou moins de décimales",
  },
};

/** What the dataset description lacks, in words (CONV-EML-MISSING carries codes in `fields`). */
const EML_WORDS: Record<string, Record<Lang, string>> = {
  title: { en: 'title', pl: 'tytuł', de: 'Titel', fr: 'titre' },
  abstract: { en: 'abstract', pl: 'streszczenie', de: 'Zusammenfassung', fr: 'résumé' },
  creator: { en: 'at least one creator', pl: 'co najmniej jeden autor', de: 'mindestens ein Autor', fr: 'au moins un auteur' },
  'contact name': { en: 'contact name', pl: 'imię i nazwisko osoby kontaktowej', de: 'Name der Kontaktperson', fr: 'nom du contact' },
  'contact email': { en: 'contact e-mail', pl: 'e-mail osoby kontaktowej', de: 'E-Mail der Kontaktperson', fr: 'e-mail du contact' },
  'institution code': { en: 'institution code', pl: 'kod instytucji', de: 'Institutionskürzel', fr: "code d'institution" },
  'dataset name': { en: 'dataset name', pl: 'nazwa zbioru', de: 'Datensatzname', fr: 'nom du jeu de données' },
};

/** Which table an eMoF row points into, in words (CONV-EMOF-ORPHAN carries event | occurrence in `kind`). */
const KIND_WORDS: Record<string, Record<Lang, string>> = {
  event: { en: 'an event', pl: 'zdarzenie', de: 'ein Ereignis', fr: 'un événement' },
  occurrence: { en: 'an occurrence', pl: 'wystąpienie', de: 'ein Vorkommen', fr: 'une occurrence' },
};

function fill(template: string, f: Finding, lang?: Lang): string {
  const generic: Record<string, string> = { file: f.file ?? '', sheet: f.sheet ?? '', field: f.field ?? '', value: f.value ?? '', lines: formatLines(f.lines) };
  // plural tokens ({+count:one|other}, i18n/plural.ts) depend on a numeric param; the English technical line has none
  const text = lang === undefined ? template : applyPlurals(lang, template, (name) => (Object.prototype.hasOwnProperty.call(f.params, name) ? Number(f.params[name]) : undefined));
  return text.replace(/\{([A-Za-z_][\w.]*)\}/g, (whole, name: string) => {
    if (Object.prototype.hasOwnProperty.call(f.params, name)) return String(f.params[name]);
    if (Object.prototype.hasOwnProperty.call(generic, name)) return generic[name];
    return whole;
  });
}

/** One or two sentences for a scientist, in `lang` (English when the language is unknown). */
export function renderConvertPlain(f: Finding, lang: Lang): string {
  const rule = getConvertRule(f.ruleId);
  if ((f.ruleId === 'CONV-EFFORT-VALUE-INVALID' || f.ruleId === 'CONV-MESH-INVALID') && typeof f.params.reason === 'string') f = { ...f, params: { ...f.params, reason: REASON_WORDS[f.params.reason]?.[lang] ?? f.params.reason } };
  if (f.ruleId === 'CONV-QUANTITY-UNDECLARED' && typeof f.params.missing === 'string') {
    const words = f.params.missing.split(', ').map((m) => MISSING_WORDS[m]?.[lang] ?? m);
    f = { ...f, params: { ...f.params, missing: words.join('; ') } };
  }
  if (f.ruleId === 'CONV-EML-MISSING' && typeof f.params.fields === 'string') {
    f = { ...f, params: { ...f.params, fields: f.params.fields.split(', ').map((m) => EML_WORDS[m]?.[lang] ?? m).join(', ') } };
  }
  if (f.ruleId === 'CONV-EMOF-ORPHAN' && typeof f.params.kind === 'string') f = { ...f, params: { ...f.params, kind: KIND_WORDS[f.params.kind]?.[lang] ?? f.params.kind } };
  return fill(rule.plain[lang] || rule.plain.en, f, lang);
}

/** The English technical detail line. */
export function renderConvertTechnical(f: Finding): string {
  return fill(getConvertRule(f.ruleId).technical, f);
}
