// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Finding, Lang, RuleDef } from '../types';
import { applyPlurals } from '../i18n/plural';
import { MAX_PAIRS } from '../convert/pivotLimits';
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
 *   CONV-TAXON-SAME-EVENT      count, columns, names   value = the scientific name, columns = the columns / rows that carry it in one sample; count = how many; names = the sheet's own spellings (verbatimIdentification)
 *   CONV-NA-SKIPPED            count            count = cells with NA (a missing-data token) in a taxon or quantity column: no record, no finding about their rows (info)
 *   CONV-ZERO-SKIPPED          count            count = zero cells left out (the list was not declared complete)
 *   CONV-SAMPLE-CONFLICT       what, count      what = the attribute that differs; value = a sample code; lines = its rows
 *   CONV-NERC-UNKNOWN          what             what = the quantity that has no verified NERC concept
 *   CONV-NERC-UNIT-MISMATCH    column, code, unit  the label of the confirmed concept (code) says per unit mass/volume against the unit of the column
 *   CONV-UNIT-NO-P06           unit             unit = the unit as declared
 *   CONV-DEPTH-UNIT            unit             field = depth column, unit = the unit it states
 *   CONV-EFFORT-INVALID        count            field = column, value = an example, lines = rows (a sample size column)
 *   CONV-EFFORT-VALUE-INVALID  reason           value = the typed sample size; reason = not-a-number | not-positive | ambiguous | thousands
 *   CONV-COLUMN-UNNAMED        (none)           field = a column the file's header does not name (IN-HEADER-SHORT) that is mapped as a variable still called by its internal name, or as a taxon whose HEADER is the name
 *   CONV-LONG-UNSUPPORTED      parameterColumn, valueColumn, reason, count, max   a sheet in the long environmental layout (a parameter column and a value column, no taxon and no quantity column) that the converter does not read; sheet = the sheet; reason = one-parameter | too-many (absent: the sheet was not read as a long one for another reason), count = the distinct parameters / the (parameter, unit) pairs
 *   CONV-LONG-READ             parameterColumn, valueColumn, rows, samples, columns   info: a long environmental sheet was read as one row per sample (core/convert/pivot.ts); rows = rows read, samples = rows made, columns = parameter columns made
 *   CONV-LONG-FLAG-COLUMNS     count, columns   info: quality-flag columns of a long sheet left out
 *   CONV-LONG-FLAG-PARAMETERS  count, names, rows   info: parameters of a long sheet that are quality flags, their rows left out
 *   CONV-LONG-RENAMED          count, names     info: parameter columns whose header collided with another header and got a number
 *   CONV-LONG-DROPPED          count, columns   info: key columns the user marked as describing the measurement, not the sample: removed from the key, values not written
 *   CONV-LONG-KEY-VARIES       count, columns   warning: rows that share every position / identity column differ in these columns (count = such samples), so each difference is read as another sample
 *   CONV-LONG-DUPLICATE        (none)           field = the parameter column (header with unit), lines = the original lines of the repeated rows of ONE sample
 *   CONV-LONG-NO-PARAMETER     count            lines = the original lines that have a value and no parameter name
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
 *   CONV-NAMEID-INCOMPLETE     count, names     value = an example name; the sheet gives a taxon ID for some rows of the name and not for others (the name is not looked up)
 *   CONV-NAMEID-CONFLICT       count, names     value = an example name; the sheet gives the name more than one taxon ID
 *   CONV-WORMS-UNDECIDED       count, names     value = an example name; count = names whose WoRMS result the user has not chosen yet
 *   CONV-WORMS-NO-MATCH        count, names     value = an example name; count = names WoRMS has no record for (no ID is written)
 *   CONV-WORMS-NOT-MARINE      count, names     value = an example name; count = confirmed names that WoRMS marks as freshwater or terrestrial only
 *   CONV-NO-SAMPLING-DESCRIPTOR (none)          no eMoF row of the archive is a sampling descriptor / effort term of BioCheck's BODCeffort list
 *   CONV-DEVICE-MISSING        (none)           the sheet has no sampling device
 *   CONV-LICENCE-DIFFERS       chosen, source   the licence chosen differs from the recognised licence of the dropped metadata files
 *   CONV-MESH-INVALID          reason           value = the typed mesh size; reason = not-a-number | not-positive | ambiguous | thousands
 *   CONV-PROFILE-STATION-UNMATCHED count, names value = the first station; names = the eventIDs of the profile stations that match no station of the biology sheets
 *   CONV-PROFILE-NO-STATION    count, column    column = the station column ('none' when the sheet has none); lines = the profile rows that hold data and no station
 *   CONV-PROFILE-STATION-FAR   count, names, limit  names = "profile station <-> biology station (N km)" for each matched pair farther apart than `limit` km (a haversine distance; the tool's own limit)
 *   CONV-PROFILE-STATION-CAST-MATCHED count, names  names = "profile station <-> biology station" of every pair matched by ignoring the trailing cast number (info)
 *   CONV-PANGAEA-NAMES-FALLBACK (none)      a PANGAEA file's parameter list was not matched to its columns: the abbreviations of the table header are the names (info)
 *   CONV-PROFILE-LEVEL-INCOMPLETE count, what   what = date | position | date and position: missing on a level and on the parent that could give it (none when the station level is flattened); lines = the profile rows
 *   CONV-PROFILE-PRESSURE-NO-UNIT column        column = the header of a pressure column of a profile sheet that was written with no unit
 *   CONV-SEAFLOOR-UNIT         unit             field = the depth-below-seafloor column, unit = its unit ('none' when it has none): not cm or m
 *   CONV-SEAFLOOR-VALUE        count, reason    field = column, value = an example, lines = rows; reason = notation (a number with no exact plain text)
 *   CONV-SEAFLOOR-SIGNS        count, direction, side   field = column, lines = the cells of the minority sign; direction = down | up; side = above | below: where such a cell is written (info for the user, not blocking)
 *   CONV-SEAFLOOR-NO-SITE-DEPTH count          field = column, lines = rows that have a depth below the seafloor and no site depth
 *   CONV-NO-OCCURRENCES        (none)           the conversion produced no occurrence record (an environmental-only upload); with `zeros: 'yes'` taxa were there but every count was 0 and skipped (NO_OCCURRENCES_ZEROS text)
 *   CONV-PROFILE-NOTHING-READ  rows             a sheet marked as a profile file gave no level; rows = its data rows
 *   CONV-STATION-FROM-POSITION count            value = the first station ID: the user ticked "each distinct position is a station" (info)
 * Stage 6 also gives two rules a second text for a profile file, chosen in renderConvertPlain / renderConvertTechnical (PROFILE_VARIANTS): CONV-SAMPLE-CODE-MISSING when the
 * finding carries `profile: 'yes'`, and CONV-ID-DUPLICATE when its `kind` is `level` (profile rows only; params: used = what each row's ID was made of) or `level-other` (a sample,
 * station or cruise has the same ID).
 */
const NERC_MANUAL = {
  label: 'OBIS Manual, "Extended Measurement Or Fact" (manual.obis.org/format_emof.html; read 2026-10-25)',
  url: 'https://manual.obis.org/format_emof.html',
  locator: '"For measurementTypeID, measurementUnitID, and measurementValueID you must use controlled vocabulary terms."',
};

const OBIS_DARWIN_CORE = {
  label: 'OBIS Manual, "Darwin Core" (manual.obis.org/darwin_core.html; read 2026-10-26) and the Darwin Core term list (dwc.tdwg.org/terms; minimumDistanceAboveSurfaceInMeters)',
  url: 'https://manual.obis.org/darwin_core.html',
  locator: '"This can be especially useful for sediment cores taken from the sea bottom ... In these cases the minimumDistanceAboveSurfaceInMeters / maximumDistanceAboveSurfaceInMeters would be a negative value."',
};
const OBIS_OCCURRENCE = {
  label: 'OBIS Manual, "How to format Occurrence tables" (manual.obis.org/format_occurrence.html; read 2026-10-26)',
  url: 'https://manual.obis.org/format_occurrence.html',
  locator: '"(remember that all OBIS data have at least one occurrence record associated, regardless of what organization structure you have chosen)"',
};

const OBIS_NAME_MATCH = {
  label: 'OBIS Manual, "Match Taxonomic Names" (manual.obis.org/name_matching.html; read 2026-10-25)',
  url: 'https://manual.obis.org/name_matching.html',
  locator: '"WoRMS also identifies ambiguous matches, indicating that several potential matching options are available (e.g. homonyms). You can check these ambiguous matches and select the correct one"',
};
const BIOCHECK_EFFORT = {
  label: 'EMODnet Biocheck (R), R/checkdataset.R lines 562-566 and data/BODCeffort (master 701e6e7, 2026-10-08)',
  url: 'https://github.com/EMODnet/EMODnetBiocheck/blob/master/R/checkdataset.R',
  locator: 'if (sum(grepl(paste(BODCeffort, collapse="|"), unique(eMoF$measurementTypeID))) == 0) -> level "warning", field "measurementType", message "No sampling descriptors/effort present"',
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
      pl: `W kolumnie „{field}” liczebność ma części dziesiętne {+lineCount:w wierszu|w wierszach|w wierszach} {lines} (razem: {count}), np. {value}. Liczba osobników musi być całkowita. Zadeklaruj zagęszczenie albo popraw wartości.`,
      en: `Column "{field}" is declared as a count but has decimals in {+lineCount:line|lines} {lines} ({count} in all), e.g. {value}. A number of individuals must be whole. Declare a density instead, or correct the values.`,
      de: `Die Spalte „{field}“ gilt als Anzahl, hat aber in {+lineCount:der Zeile|den Zeilen} {lines} Dezimalstellen (insgesamt {count}), z. B. {value}. Eine Individuenzahl muss ganz sein. Geben Sie stattdessen eine Dichte an oder korrigieren Sie die Werte.`,
      fr: `La colonne « {field} » est déclarée comme effectif mais a des décimales {+lineCount:à la ligne|aux lignes} {lines} ({count} au total), p. ex. {value}. Un nombre d'individus doit être entier. Déclarez plutôt une densité ou corrigez les valeurs.`,
    },
    technical: `{file}:{lines} field {field}: {count} value(s) of a declared count are not integers (example {value}); individualCount must be a whole number. Those cells were not converted.`,
  },
  {
    id: 'CONV-NEGATIVE-QUANTITY',
    category: 'B',
    severity: 'error',
    params: ['count'],
    plain: {
      pl: `W kolumnie „{field}” są wartości ujemne {+lineCount:w wierszu|w wierszach|w wierszach} {lines} (razem: {count}), np. {value}. Liczebność, zagęszczenie, biomasa i wielkość próby nie mogą być ujemne.`,
      en: `Column "{field}" has negative values in {+lineCount:line|lines} {lines} ({count} in all), e.g. {value}. A count, density, biomass or sample size cannot be negative.`,
      de: `Die Spalte „{field}“ hat negative Werte in {+lineCount:der Zeile|den Zeilen} {lines} (insgesamt {count}), z. B. {value}. Anzahl, Dichte, Biomasse und Probengröße können nicht negativ sein.`,
      fr: `La colonne « {field} » contient des valeurs négatives {+lineCount:à la ligne|aux lignes} {lines} ({count} au total), p. ex. {value}. Un effectif, une densité, une biomasse ou une taille d'échantillon ne peut pas être négatif.`,
    },
    technical: `{file}:{lines} field {field}: {count} negative value(s) in a quantity or effort column (example {value}). Those cells were not converted.`,
  },
  {
    id: 'CONV-SAMPLE-CODE-MISSING',
    category: 'B',
    severity: 'error',
    params: ['count', 'column'],
    plain: {
      pl: `Brakuje kodu próbki {+lineCount:w wierszu|w wierszach|w wierszach} {lines} (razem: {count}). Kod próbki staje się identyfikatorem w archiwum, więc musi pochodzić od Ciebie. Możesz pobrać arkusz z proponowanymi kodami, sprawdzić je i wgrać ponownie.`,
      en: `The sample code is missing in {+lineCount:line|lines} {lines} ({count} in all). The code becomes the identifier in the archive, so it has to come from you. You can download the sheet with proposed codes, check them and upload it again.`,
      de: `Der Probencode fehlt in {+lineCount:der Zeile|den Zeilen} {lines} (insgesamt {count}). Der Code wird zur Kennung im Archiv und muss daher von Ihnen kommen. Sie können das Blatt mit vorgeschlagenen Codes herunterladen, prüfen und erneut hochladen.`,
      fr: `Le code d'échantillon manque {+lineCount:à la ligne|aux lignes} {lines} ({count} au total). Le code devient l'identifiant dans l'archive : il doit donc venir de vous. Vous pouvez télécharger la feuille avec des codes proposés, les vérifier et la recharger.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} row(s) have no sample code (column: {column}). The eventID of a sample is the user's own code and is never derived from depth or row order. A one-time proposal (proposeSampleCodes) returns the sheet with a new code column.`,
  },
  {
    id: 'CONV-ID-DUPLICATE',
    category: 'B',
    severity: 'error',
    params: ['kind', 'count', 'hint'],
    plain: {
      pl: `Ten sam identyfikator powstaje więcej niż raz, np. „{value}”, {+lineCount:w wierszu|w wierszach|w wierszach} {lines} (powtórzone: {count}). Identyfikatory muszą być unikalne: zmień powtórzony kod lub nagłówek albo, gdy kody powtarzają się między stacjami, zaznacz poprzedzanie kodem stacji.`,
      en: `The same identifier is produced more than once, e.g. "{value}", in {+lineCount:line|lines} {lines} ({count} repeated). Identifiers must be unique: change the repeated code or header or, when codes repeat between stations, tick the station prefix.`,
      de: `Dieselbe Kennung entsteht mehrfach, z. B. „{value}“, in {+lineCount:der Zeile|den Zeilen} {lines} (wiederholt: {count}). Kennungen müssen eindeutig sein: ändern Sie den wiederholten Code oder Kopf oder, wenn Codes zwischen Stationen wiederkehren, wählen Sie das Stationspräfix.`,
      fr: `Le même identifiant est produit plusieurs fois, p. ex. « {value} », {+lineCount:à la ligne|aux lignes} {lines} (répétés : {count}). Les identifiants doivent être uniques : changez le code ou l'en-tête répété ou, si des codes se répètent entre stations, cochez le préfixe de station.`,
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
      pl: `W kolumnie „{field}” wartość ma tabulator albo podział wiersza {+lineCount:w wierszu|w wierszach|w wierszach} {lines} (razem: {count}), np. „{value}”. Pliki archiwum są rozdzielane tabulatorami, więc taka wartość je rozbije. Usuń znak w arkuszu.`,
      en: `Column "{field}" has a tab or a line break inside a value in {+lineCount:line|lines} {lines} ({count} in all), e.g. "{value}". The archive files are tab-separated, so such a value would break them. Remove the character in the sheet.`,
      de: `Die Spalte „{field}“ enthält in {+lineCount:der Zeile|den Zeilen} {lines} einen Tabulator oder Zeilenumbruch im Wert (insgesamt {count}), z. B. „{value}“. Die Archivdateien sind tabulatorgetrennt, ein solcher Wert würde sie zerstören. Entfernen Sie das Zeichen im Blatt.`,
      fr: `La colonne « {field} » contient une tabulation ou un saut de ligne dans une valeur {+lineCount:à la ligne|aux lignes} {lines} ({count} au total), p. ex. « {value} ». Les fichiers de l'archive sont séparés par des tabulations : une telle valeur les casserait. Supprimez le caractère dans la feuille.`,
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
      pl: `W kolumnie „{field}” zamiast liczby jest tekst ({value}) {+lineCount:w wierszu|w wierszach|w wierszach} {lines} (razem: {count}). Zapisano obecność taksonu bez ilości, a tekst trafił do uwag. Jeśli to nie znaczy „obecny”, popraw arkusz.`,
      en: `Column "{field}" has text instead of a number ({value}) in {+lineCount:line|lines} {lines} ({count} in all). The taxon is recorded as present without a quantity and the text is kept in the remarks. If it does not mean "present", correct the sheet.`,
      de: `Die Spalte „{field}“ enthält statt einer Zahl Text ({value}) in {+lineCount:der Zeile|den Zeilen} {lines} (insgesamt {count}). Das Taxon ist als anwesend ohne Menge erfasst, der Text steht in den Bemerkungen. Bedeutet er nicht „anwesend“, korrigieren Sie das Blatt.`,
      fr: `La colonne « {field} » contient du texte au lieu d'un nombre ({value}) {+lineCount:à la ligne|aux lignes} {lines} ({count} au total). Le taxon est noté présent sans quantité et le texte est gardé dans les remarques. S'il ne signifie pas « présent », corrigez la feuille.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {count} non-numeric cell(s) in a taxon or quantity column ({value}). Each becomes an occurrence with occurrenceStatus present, no quantity, and the text in occurrenceRemarks.`,
  },
  {
    id: 'CONV-TAXON-SAME-EVENT',
    category: 'B',
    severity: 'warning',
    params: ['count', 'columns', 'names'],
    plain: {
      pl: `Ten sam takson „{value}” (ta sama nazwa albo ten sam identyfikator z WoRMS, to samo stadium i dopisek) występuje {count} {+count:raz|razy|razy} w jednej próbce: {columns}. W arkuszu zapisano go jako: {names}. Każdy zapis zostaje osobno, nic nie jest sumowane. Sprawdź, czy to nie powinien być jeden zapis.`,
      en: `The same taxon "{value}" (the same name or the same WoRMS identifier, the same stage and qualifier) appears {count} {+count:time|times} in one sample: {columns}. Your sheet writes it as: {names}. Each stays a separate record and nothing is summed. Check whether it should be one record.`,
      de: `Dasselbe Taxon „{value}“ (derselbe Name oder dieselbe WoRMS-Kennung, gleiches Stadium und gleicher Zusatz) kommt {count}-mal in einer Probe vor: {columns}. Ihr Blatt schreibt es als: {names}. Jeder Eintrag bleibt getrennt, nichts wird summiert. Prüfen Sie, ob es ein Eintrag sein sollte.`,
      fr: `Le même taxon « {value} » (le même nom ou le même identifiant WoRMS, même stade et même mention) apparaît {count} fois dans un échantillon : {columns}. Votre feuille l'écrit : {names}. Chaque enregistrement reste séparé et rien n'est additionné. Vérifiez s'il ne devrait y en avoir qu'un.`,
    },
    technical: `{file}, {sheet}: {count} columns or rows give the same taxon in one event: the same (eventID, scientificNameID, lifeStage, identificationQualifier), or the same scientificName when there is no ID: {value} in {columns}; written in the sheet as {names}. Judged after the WoRMS lookup, so two spellings that resolved to one AphiaID are caught. No values are summed; each keeps its own occurrenceID.`,
  },
  {
    id: 'CONV-NA-SKIPPED',
    category: 'B',
    severity: 'info',
    params: ['count'],
    plain: {
      pl: `Pominięto {count} {+count:komórkę|komórki|komórek} z oznaczeniem „NA” (brak danych) w kolumnach taksonów lub ilości. Taka komórka nie tworzy rekordu, tak samo jak pusta: brak danych nie jest zerem ani obecnością.`,
      en: `{count} {+count:cell|cells} marked "NA" (not available) in a taxon or quantity column {+count:was|were} left out. Such a cell makes no record, like an empty one: no data is neither a zero nor a presence.`,
      de: `{count} {+count:Zelle|Zellen} mit „NA“ (nicht verfügbar) in Taxon- oder Mengenspalten {+count:wurde|wurden} ausgelassen. Eine solche Zelle ergibt keinen Datensatz, wie eine leere: keine Daten sind weder Null noch Anwesenheit.`,
      fr: `{count} {+count:cellule marquée|cellules marquées} « NA » (non disponible) dans des colonnes de taxon ou de quantité {+count:a été ignorée|ont été ignorées}. Une telle cellule ne crée aucun enregistrement, comme une cellule vide : pas de données n'est ni un zéro ni une présence.`,
    },
    technical: `{file}, {sheet}: {count} cell(s) of a taxon or quantity column hold NA (or a similar "not available" token) and were not converted: no occurrence is written, as for an empty cell. Only a numeric 0 can become occurrenceStatus absent, and only with the full species list ticked.`,
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
      pl: `Wiersze próbki „{value}” ({+lineCount:wiersz|wiersze|wierszy} {lines}) mają różne wartości daty, pozycji, głębokości, wielkości próby lub zmierzonej wielkości. Próbka to jedno zdarzenie, więc te wartości muszą być takie same we wszystkich jej wierszach.`,
      en: `The rows of sample "{value}" ({+lineCount:line|lines} {lines}) differ in date, position, depth, sample size or a measured value. A sample is one event, so these values must be the same in all its rows.`,
      de: `Die Zeilen der Probe „{value}“ ({+lineCount:Zeile|Zeilen} {lines}) unterscheiden sich in Datum, Position, Tiefe, Probengröße oder einem Messwert. Eine Probe ist ein Ereignis, daher müssen diese Werte in allen ihren Zeilen gleich sein.`,
      fr: `Les lignes de l'échantillon « {value} » ({+lineCount:ligne|lignes} {lines}) diffèrent par la date, la position, la profondeur, la taille ou une valeur mesurée. Un échantillon est un seul événement : ces valeurs doivent être identiques sur toutes ses lignes.`,
    },
    technical: `{file}, {sheet}:{lines}: rows of sample "{value}" differ in {what} ({count} sample(s) affected). The first row is not silently preferred.`,
  },
  {
    id: 'CONV-NERC-UNKNOWN',
    category: 'B',
    severity: 'warning',
    params: ['what'],
    plain: {
      pl: `Dla {what} nie ma potwierdzonego pojęcia NERC, więc measurementTypeID zostanie pusty, a OBIS go wymaga. Potwierdź albo wybierz pojęcie w tabeli pod kolumnami; opcjonalne wyszukiwanie w NVS działa po angielsku, np. „temperature”, „salinity”, „chlorophyll”. W innych przypadkach dobierz je ręcznie przed publikacją.`,
      en: `There is no confirmed NERC concept for {what}, so measurementTypeID stays empty, and OBIS requires one. Confirm or choose one in the table below the columns; the optional NVS search works with English words, e.g. "temperature", "salinity", "chlorophyll". In other cases choose it by hand before publishing.`,
      de: `Für {what} gibt es keinen bestätigten NERC-Begriff, daher bleibt measurementTypeID leer, und OBIS verlangt einen. Bestätigen oder wählen Sie ihn in der Tabelle unter den Spalten; die optionale NVS-Suche arbeitet mit englischen Wörtern, z. B. „temperature“, „salinity“, „chlorophyll“. Sonst vor der Veröffentlichung manuell wählen.`,
      fr: `Il n'existe pas de concept NERC confirmé pour {what} : measurementTypeID reste vide, et OBIS en exige un. Confirmez ou choisissez-en un dans le tableau sous les colonnes ; la recherche NVS facultative fonctionne avec des mots anglais, p. ex. « temperature », « salinity », « chlorophyll ». Sinon, choisissez-le avant publication.`,
    },
    technical: `{file}, {sheet}: no confirmed NERC P01 concept for {what}; measurementTypeID left empty (OBIS: controlled vocabulary terms are required for measurementTypeID). For a measured-variable column an identifier is written only when the user confirmed it for that column (a verified generic concept proposed by the converter, a verified method-specific one the user chose, or a result of the user's own NVS search); nothing is guessed.`,
    citations: [NERC_MANUAL],
  },
  {
    id: 'CONV-NERC-UNIT-MISMATCH',
    category: 'B',
    severity: 'warning',
    params: ['column', 'code', 'unit'],
    plain: {
      pl: `Kolumna „{column}”: pojęcie {code} odnosi się do innej podstawy (na jednostkę masy albo objętości) niż jednostka „{unit}”. Sprawdź, czy pojęcie i jednostka do siebie pasują. Konwerter niczego nie przelicza ani nie zmienia.`,
      en: `Column "{column}": concept {code} refers to a different basis (per unit mass or per unit volume) than the unit "{unit}". Check that the concept and the unit belong together. The converter converts and changes nothing.`,
      de: `Spalte „{column}“: Der Begriff {code} bezieht sich auf eine andere Bezugsgröße (pro Masse oder pro Volumen) als die Einheit „{unit}“. Prüfen Sie, ob Begriff und Einheit zusammenpassen. Der Konverter rechnet nichts um und ändert nichts.`,
      fr: `Colonne « {column} » : le concept {code} se rapporte à une autre base (par masse ou par volume) que l'unité « {unit} ». Vérifiez que le concept et l'unité vont ensemble. Le convertisseur ne convertit ni ne change rien.`,
    },
    technical: `{file}, {sheet} column {column}: the label of the confirmed P01 concept {code} states a dimension (per unit mass / dry weight / wet weight, or per unit volume) that contradicts the dimension of the unit "{unit}". The pair is the user's choice and is written as confirmed; nothing is converted.`,
    citations: [NERC_MANUAL],
  },
  {
    id: 'CONV-UNIT-NO-P06',
    category: 'B',
    severity: 'warning',
    params: ['unit'],
    plain: {
      pl: `Dla jednostki „{unit}” nie ma potwierdzonego pojęcia NERC (P06), więc measurementUnitID zostanie pusty. Jednostka nie jest przeliczana; wpisana zostaje tak, jak ją podano. Dla kolumny ze zmierzoną wielkością możesz potwierdzić albo wybrać jednostkę w tabeli pod kolumnami.`,
      en: `There is no confirmed NERC concept (P06) for the unit "{unit}", so measurementUnitID stays empty. The unit is not converted; it is written as given. For a measured-variable column you can confirm or choose a unit in the table below the columns.`,
      de: `Für die Einheit „{unit}“ gibt es keinen bestätigten NERC-Begriff (P06), daher bleibt measurementUnitID leer. Die Einheit wird nicht umgerechnet, sondern wie angegeben geschrieben. Bei einer Messgröße-Spalte können Sie in der Tabelle unter den Spalten eine Einheit bestätigen oder wählen.`,
      fr: `Il n'existe pas de concept NERC confirmé (P06) pour l'unité « {unit} » : measurementUnitID reste vide. L'unité n'est pas convertie ; elle est écrite telle que donnée. Pour une colonne de grandeur mesurée, vous pouvez confirmer ou choisir une unité dans le tableau sous les colonnes.`,
    },
    technical: `{file}, {sheet}: unit "{unit}" has no confirmed P06 concept; measurementUnit is written as declared, measurementUnitID is empty, no conversion is made. For a measured-variable column an identifier is written only when the user confirmed it for that column.`,
    citations: [NERC_MANUAL],
  },
  {
    id: 'CONV-COLUMN-UNNAMED',
    category: 'B',
    severity: 'error',
    params: [],
    plain: {
      pl: `Kolumna „{field}” nie ma nazwy w nagłówku pliku, a jej nazwa miałaby trafić do archiwum jako nazwa zmiennej lub taksonu. Wpisz nazwę zmiennej albo wybierz dla niej inne znaczenie (np. „Pomiń”).`,
      en: `Column "{field}" has no name in the file's header, and its name would go into the archive as the name of a variable or a taxon. Type a name for the variable, or choose another meaning for the column (for example "Ignore").`,
      de: `Die Spalte „{field}“ hat keinen Namen in der Kopfzeile der Datei, und ihr Name würde als Name einer Variablen oder eines Taxons ins Archiv gelangen. Geben Sie der Variablen einen Namen oder wählen Sie eine andere Bedeutung für die Spalte (z. B. „Ignorieren“).`,
      fr: `La colonne « {field} » n'a pas de nom dans l'en-tête du fichier, et son nom irait dans l'archive comme nom d'une variable ou d'un taxon. Saisissez un nom pour la variable, ou choisissez un autre sens pour la colonne (par ex. « Ignorer »).`,
    },
    technical: `{file}, {sheet} field {field}: the header has no name for this column (IN-HEADER-SHORT; internal name "Column N"); it is mapped as a variable that keeps that name, or as a taxon whose header is the name. The export is blocked until the variable has a name or the column another role.`,
  },
  {
    id: 'CONV-LONG-UNSUPPORTED',
    category: 'B',
    severity: 'error',
    params: ['parameterColumn', 'valueColumn', 'reason', 'count', 'max'],
    plain: {
      pl: `Arkusz „{sheet}” ma układ długi: wiersz na parametr (kolumny „{parameterColumn}” i „{valueColumn}”), którego konwerter nie czyta. Zrób kolumnę na parametr, z jednostką w nagłówku (np. „Temp [°C]”), wiersz na próbkę i wczytaj ponownie. Jeśli arkusz zawiera gatunki, zaznacz powyżej kolumnę taksonu i liczebności.`,
      en: `Sheet "{sheet}" is in the long layout: a row per parameter (columns "{parameterColumn}" and "{valueColumn}"), which the converter cannot read. Reshape it to one column per parameter, unit in the header (e.g. "Temp [°C]"), one row per sample, and load it again. If it holds species, mark the taxon column and the count above.`,
      de: `Das Blatt „{sheet}“ hat das lange Layout: eine Zeile je Parameter („{parameterColumn}“, „{valueColumn}“), das der Konverter nicht liest. Formen Sie es um: eine Spalte je Parameter, Einheit in der Überschrift („Temp [°C]“), eine Zeile je Probe, dann neu laden. Bei Arten markieren Sie oben die Taxon- und die Anzahlspalte.`,
      fr: `La feuille « {sheet} » est en format long : une ligne par paramètre (« {parameterColumn} », « {valueColumn} »), que le convertisseur ne lit pas. Une colonne par paramètre, l'unité dans l'en-tête (« Temp [°C] »), une ligne par échantillon, puis rechargez. Pour des espèces, marquez ci-dessus la colonne du taxon et celle du nombre.`,
    },
    technical: `{file}, {sheet}: a header names a parameter column ("{parameterColumn}") and a value column ("{valueColumn}") and the sheet has no taxon and no quantity column: one row per measured parameter. The converter writes nothing from this sheet; the export is blocked until it is reshaped to one column per parameter (unit in the header) or left out. reason: {reason} (one-parameter: fewer than two distinct parameters; too-many: more than {max} (parameter, unit) pairs; count: {count} distinct parameters or pairs; otherwise the sheet was not read as a long one for another reason).`,
  },
  {
    id: 'CONV-LONG-READ',
    category: 'B',
    severity: 'info',
    params: ['parameterColumn', 'valueColumn', 'rows', 'samples', 'columns'],
    plain: {
      pl: `Arkusz „{sheet}” ma wiersz na pomiar („{parameterColumn}”, „{valueColumn}”). Odczytano go jako {samples} {+samples:próbkę|próbki|próbek}; kolumn parametrów: {columns} (po jednej na parametr i jednostkę, nagłówek „nazwa [jednostka]”). Wiersze są tylko zgrupowane: żadna wartość nie jest sumowana, uśredniana ani zaokrąglana.`,
      en: `Sheet "{sheet}" has one row per measurement ("{parameterColumn}", "{valueColumn}"). It was read as {samples} {+samples:sample|samples}; parameter columns: {columns} (one per parameter and unit, headed "name [unit]"). The rows are only regrouped: no value is summed, averaged or rounded.`,
      de: `Das Blatt „{sheet}“ hat eine Zeile je Messung („{parameterColumn}“, „{valueColumn}“). Es wurde als {samples} {+samples:Probe|Proben} gelesen; Parameterspalten: {columns} (je Parameter und Einheit eine, Kopf „Name [Einheit]“). Die Zeilen werden nur gruppiert: kein Wert wird summiert, gemittelt oder gerundet.`,
      fr: `La feuille « {sheet} » a une ligne par mesure (« {parameterColumn} », « {valueColumn} »). Lue comme {samples} {+samples:échantillon|échantillons} ; colonnes de paramètres : {columns} (une par paramètre et unité, en-tête « nom [unité] »). Lignes seulement regroupées : aucune valeur n'est additionnée, moyennée ni arrondie.`,
    },
    technical: `{file}, {sheet}: a long environmental sheet (parameter column "{parameterColumn}", value column "{valueColumn}") was read as one row per sample: {rows} rows became {samples} samples with {columns} parameter columns "<parameter> [<unit>]". The key of a sample is every column except the parameter, unit, value and quality-flag columns; each cell is the original cell. Nothing is summed, averaged or chosen.`,
  },
  {
    id: 'CONV-LONG-FLAG-COLUMNS',
    category: 'B',
    severity: 'info',
    params: ['count', 'columns'],
    plain: {
      pl: `Pominięto {count} {+count:kolumnę flagi jakości|kolumny flag jakości|kolumn flag jakości} arkusza „{sheet}”: {columns}. Flaga nie odróżnia próbek, więc nie wchodzi do klucza, którym wiersze są grupowane w próbki, i nie jest zapisywana.`,
      en: `Left out: {count} quality-flag {+count:column|columns} of sheet "{sheet}", {columns}. A flag does not tell samples apart, so it is not part of the key that groups the rows into samples, and it is not written.`,
      de: `Übergangen: {count} {+count:Qualitätsflaggen-Spalte|Qualitätsflaggen-Spalten} des Blatts „{sheet}“: {columns}. Eine Flagge unterscheidet keine Proben, gehört also nicht zum Schlüssel, der die Zeilen zu Proben gruppiert, und wird nicht geschrieben.`,
      fr: `Ignoré : {count} {+count:colonne d'indicateur de qualité|colonnes d'indicateurs de qualité} de la feuille « {sheet} » : {columns}. Un indicateur ne distingue pas les échantillons : il n'entre pas dans la clé qui regroupe les lignes en échantillons et n'est pas écrit.`,
    },
    technical: `{file}, {sheet}: {count} quality-flag column(s) of a long sheet are not part of the sample key and are not written: {columns}.`,
  },
  {
    id: 'CONV-LONG-FLAG-PARAMETERS',
    category: 'B',
    severity: 'info',
    params: ['count', 'names', 'rows'],
    plain: {
      pl: `Z „{sheet}” pominięto: {names} ({rows} {+rows:wiersz|wiersze|wierszy}). {+count:To flaga jakości, nie pomiar|To flagi jakości, nie pomiary|To flagi jakości, nie pomiary}: {+count:nie powstaje z niej kolumna i nie jest zapisywana|nie powstają z nich kolumny i nie są zapisywane|nie powstają z nich kolumny i nie są zapisywane}.`,
      en: `Left out of sheet "{sheet}": {names} ({rows} {+rows:row|rows}). {+count:This parameter is a quality flag|These parameters are quality flags}, not {+count:a measurement|measurements}: no column is made and nothing is written.`,
      de: `Im Blatt „{sheet}“ nicht gelesen: {names} ({rows} {+rows:Zeile|Zeilen}). {+count:Dieser Parameter ist eine Qualitätsflagge|Diese Parameter sind Qualitätsflaggen}, {+count:keine Messung|keine Messungen}: Es entsteht keine Spalte, und nichts wird geschrieben.`,
      fr: `Ignoré dans la feuille « {sheet} » : {names} ({rows} {+rows:ligne|lignes}). {+count:Ce paramètre est un indicateur|Ces paramètres sont des indicateurs} de qualité, pas {+count:une mesure|des mesures} : aucune colonne n'est créée et rien n'est écrit.`,
    },
    technical: `{file}, {sheet}: {count} parameter name(s) of a long sheet are quality flags ({names}); their {rows} row(s) are skipped: no column is made and nothing is written.`,
  },
  {
    id: 'CONV-LONG-RENAMED',
    category: 'B',
    severity: 'info',
    params: ['count', 'names'],
    plain: {
      pl: `Nagłówki zmienione w arkuszu „{sheet}”: {names} (razem: {count}). Nagłówek musi być unikalny, a ten był taki sam jak nagłówek innej kolumny, więc dopisano numer w nawiasie.`,
      en: `Headers renamed in sheet "{sheet}": {names} ({count} in all). A header must be unique and this one equalled the header of another column, so a number in brackets was added.`,
      de: `Umbenannte Überschriften im Blatt „{sheet}“: {names} (insgesamt {count}). Eine Überschrift muss eindeutig sein und glich der einer anderen Spalte; daher wurde eine Zahl in Klammern angehängt.`,
      fr: `En-têtes renommés dans la feuille « {sheet} » : {names} ({count} au total). Un en-tête doit être unique et celui-ci égalait celui d'une autre colonne ; un numéro entre parenthèses a donc été ajouté.`,
    },
    technical: `{file}, {sheet}: {count} parameter column header(s) equalled another header and got a number in brackets: {names}.`,
  },
  {
    id: 'CONV-LONG-DROPPED',
    category: 'B',
    severity: 'info',
    params: ['count', 'columns'],
    plain: {
      pl: `Pominięto kolumny oznaczone jako opisujące pomiar, a nie próbkę: {columns} (arkusz „{sheet}”, razem: {count}). Archiwum nie ma miejsca na wartość przypisaną do pomiaru, więc te wartości nie są zapisywane.`,
      en: `Left out: columns you marked as describing the measurement, not the sample: {columns} (sheet "{sheet}", {count} in all). The archive has no place for a value per measurement, so these values are not written.`,
      de: `Ausgelassen: Spalten, die Sie als Beschreibung der Messung statt der Probe markiert haben: {columns} (Blatt „{sheet}“, insgesamt {count}). Das Archiv hat keinen Platz für einen Wert je Messung, daher werden diese Werte nicht geschrieben.`,
      fr: `Ignorées : colonnes que vous avez marquées comme décrivant la mesure et non l'échantillon : {columns} (feuille « {sheet} », {count} au total). L'archive n'a pas de place pour une valeur par mesure ; ces valeurs ne sont donc pas écrites.`,
    },
    technical: `{file}, {sheet}: {count} key column(s) of a long sheet were marked by the user as describing the measurement: {columns}. They are not part of the sample key and their values are not written.`,
  },
  {
    id: 'CONV-LONG-KEY-VARIES',
    category: 'B',
    severity: 'warning',
    params: ['count', 'columns'],
    plain: {
      pl: `W arkuszu „{sheet}” wiersze o tej samej stacji, dacie i głębokości różnią się w: {columns} (takich próbek: {count}), więc każda różnica jest czytana jako osobna próbka. Jeśli te kolumny opisują pomiar (komentarz, analityk, metoda), zaznacz je wyżej jako opisujące pomiar.`,
      en: `In sheet "{sheet}", rows with the same station, date and depth differ in {columns} ({count} such {+count:sample|samples}), so each difference is read as another sample. If they describe the measurement (comment, analyst, method), mark them above as describing the measurement.`,
      de: `Im Blatt „{sheet}“ unterscheiden sich Zeilen mit gleicher Station, gleichem Datum und gleicher Tiefe in: {columns} (betroffene Proben: {count}); jeder Unterschied gilt daher als eigene Probe. Beschreiben sie die Messung (Kommentar, Analyst, Methode), markieren Sie sie oben entsprechend.`,
      fr: `Dans la feuille « {sheet} », des lignes de même station, date et profondeur diffèrent par : {columns} (échantillons concernés : {count}) ; chaque différence est donc lue comme un autre échantillon. Si elles décrivent la mesure (commentaire, analyste, méthode), marquez-les plus haut en ce sens.`,
    },
    technical: `{file}, {sheet}: rows of a long sheet that share every position and identity column (station, cruise, sample, date, time, depth, pressure, position) differ in {columns}, in {count} sample(s); each combination is read as a separate sample. A column that describes the measurement can be marked as such: it then leaves the sample key and its values are not written.`,
  },
  {
    id: 'CONV-LONG-DUPLICATE',
    category: 'B',
    severity: 'error',
    params: [],
    plain: {
      pl: `W arkuszu „{sheet}” jedna próbka ma parametr „{field}” więcej niż raz ({+lineCount:wiersz|wiersze|wierszy} {lines}). Konwerter nie wybiera między nimi ani ich nie sumuje: usuń powtórzone wiersze albo rozróżnij próbki w innej kolumnie (rzut, powtórzenie, głębokość).`,
      en: `In sheet "{sheet}", one sample has the parameter "{field}" more than once ({+lineCount:line|lines} {lines}). The converter does not choose between them or sum them: delete the repeated rows, or tell the samples apart in another column (cast, replicate, depth).`,
      de: `Im Blatt „{sheet}“ hat eine Probe den Parameter „{field}“ mehrfach ({+lineCount:Zeile|Zeilen} {lines}). Der Konverter wählt nicht aus und summiert nicht: Löschen Sie die wiederholten Zeilen oder unterscheiden Sie die Proben in einer anderen Spalte (Einsatz, Wiederholung, Tiefe).`,
      fr: `Dans la feuille « {sheet} », un échantillon a le paramètre « {field} » plusieurs fois ({+lineCount:ligne|lignes} {lines}). Le convertisseur ne choisit pas et n'additionne pas : supprimez les lignes répétées ou distinguez les échantillons dans une autre colonne (déploiement, réplicat, profondeur).`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: a long sheet has the same sample (the same values in every column but the parameter, unit, value and quality-flag columns) and the same parameter and unit on more than one row. Whatever the values, the rows are not merged, summed or chosen between; the export is blocked.`,
  },
  {
    id: 'CONV-LONG-NO-PARAMETER',
    category: 'B',
    severity: 'error',
    params: ['count'],
    plain: {
      pl: `W arkuszu „{sheet}” {count} {+count:wiersz ma|wiersze mają|wierszy ma} wartość, ale kolumna parametru jest pusta ({+lineCount:wiersz|wiersze|wierszy} {lines}). Konwerter nie wie, co zmierzono: wpisz nazwę parametru albo usuń {+count:ten wiersz|te wiersze|te wiersze}.`,
      en: `In sheet "{sheet}", {count} {+count:row has|rows have} a value but an empty parameter column ({+lineCount:line|lines} {lines}). The converter cannot tell what was measured: type the parameter name, or delete {+count:the row|the rows}.`,
      de: `Im Blatt „{sheet}“ {+count:hat|haben} {count} {+count:Zeile|Zeilen} einen Wert, aber keinen Namen in der Parameterspalte ({+lineCount:Zeile|Zeilen} {lines}). Der Konverter weiß nicht, was gemessen wurde: Tragen Sie den Parameter ein oder löschen Sie {+count:die Zeile|die Zeilen}.`,
      fr: `Dans la feuille « {sheet} », {count} {+count:ligne a|lignes ont} une valeur mais pas de nom dans la colonne du paramètre ({+lineCount:ligne|lignes} {lines}). Le convertisseur ne sait pas ce qui a été mesuré : saisissez le paramètre ou supprimez {+count:la ligne|les lignes}.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} row(s) of a long sheet have a value and no name in the parameter column; nothing can be named for them, so they are not read and the export is blocked.`,
  },
  {
    id: 'CONV-DEPTH-UNIT',
    category: 'B',
    severity: 'error',
    params: ['unit'],
    plain: {
      pl: `Kolumna głębokości „{field}” ma jednostkę „{unit}”. Darwin Core wymaga metrów, a konwerter nie przelicza kolumny głębokości: podaj metry. Dla głębokości w osadzie lub wodzie porowej wybierz znaczenie „Głębokość w osadzie”: zapisze ją jako ujemną odległość w metrach.`,
      en: `Depth column "{field}" states the unit "{unit}". Darwin Core needs metres and the converter does not rescale a depth column: give metres. For a depth below the seafloor of a sediment or porewater sample, choose the meaning "Depth below seafloor": it is written as a negative distance in metres.`,
      de: `Die Tiefenspalte „{field}“ nennt die Einheit „{unit}“. Darwin Core verlangt Meter; eine Tiefenspalte wird nicht umgerechnet: geben Sie Meter an. Für die Tiefe unter dem Meeresboden einer Sediment- oder Porenwasserprobe wählen Sie die Bedeutung „Tiefe unter dem Meeresboden“ (negative Entfernung in Metern).`,
      fr: `La colonne de profondeur « {field} » indique l'unité « {unit} ». Darwin Core exige des mètres ; une colonne de profondeur n'est pas convertie : donnez des mètres. Pour la profondeur sous le fond d'un échantillon de sédiment ou d'eau interstitielle, choisissez « Profondeur sous le fond » (distance négative en mètres).`,
    },
    technical: `{file}, {sheet} field {field}: depth unit "{unit}" is not metres; minimumDepthInMeters and maximumDepthInMeters are in metres and a depth column is never rescaled. A depth below the seafloor in cm or m has its own role (CONV-SEAFLOOR-UNIT, CONV-SEAFLOOR-VALUE).`,
  },
  {
    id: 'CONV-SEAFLOOR-UNIT',
    category: 'B',
    severity: 'error',
    params: ['unit'],
    plain: {
      pl: `Kolumna „{field}” (głębokość w osadzie) ma jednostkę: {unit}. Konwerter przyjmuje tylko centymetry (cm) albo metry (m). Wpisz jednostkę kolumny w tabeli ról: cm albo m. Niczego innego nie przelicza.`,
      en: `Column "{field}" (depth below the seafloor) has the unit: {unit}. The converter accepts only centimetres (cm) or metres (m). Set the unit of the column in the role table to cm or m. It converts nothing else.`,
      de: `Die Spalte „{field}“ (Tiefe unter dem Meeresboden) hat die Einheit: {unit}. Der Konverter akzeptiert nur Zentimeter (cm) oder Meter (m). Tragen Sie die Einheit der Spalte in der Rollentabelle ein: cm oder m. Alles andere rechnet er nicht um.`,
      fr: `La colonne « {field} » (profondeur sous le fond) a l'unité : {unit}. Le convertisseur n'accepte que les centimètres (cm) ou les mètres (m). Indiquez l'unité de la colonne dans le tableau des rôles : cm ou m. Il ne convertit rien d'autre.`,
    },
    technical: `{file}, {sheet} field {field}: the unit "{unit}" of a depth-below-seafloor column is not cm or m; nothing was written from the column. Only cm to m (a decimal shift of the text) is converted.`,
    citations: [OBIS_DARWIN_CORE],
  },
  {
    id: 'CONV-SEAFLOOR-VALUE',
    category: 'B',
    severity: 'error',
    params: ['count', 'reason'],
    plain: {
      pl: `W kolumnie „{field}” (głębokość w osadzie) {+lineCount:w wierszu|w wierszach|w wierszach} {lines} (razem: {count}) wartości nie da się zapisać: {reason}, np. „{value}”. Te komórki nie zostały zapisane.`,
      en: `In column "{field}" (depth below the seafloor) {count} {+count:value|values} in {+lineCount:line|lines} {lines} cannot be written: {reason}, e.g. "{value}". Those cells were not written.`,
      de: `In der Spalte „{field}“ (Tiefe unter dem Meeresboden) lassen sich in {+lineCount:der Zeile|den Zeilen} {lines} Werte nicht schreiben (insgesamt {count}): {reason}, z. B. „{value}“. Diese Zellen wurden nicht geschrieben.`,
      fr: `Dans la colonne « {field} » (profondeur sous le fond), des valeurs {+lineCount:à la ligne|aux lignes} {lines} ne peuvent pas être écrites ({count} au total) : {reason}, p. ex. « {value} ». Ces cellules n'ont pas été écrites.`,
    },
    technical: `{file}:{lines} field {field}: {count} depth-below-seafloor value(s) cannot be written (reason {reason}, example {value}). Notation: only a plain decimal number (no exponent) is shifted exactly on its text.`,
    citations: [OBIS_DARWIN_CORE],
  },
  {
    id: 'CONV-SEAFLOOR-SIGNS',
    category: 'B',
    severity: 'warning',
    params: ['count', 'direction', 'side'],
    plain: {
      pl: `W kolumnie „{field}” {count} {+count:liczba ma|liczby mają|liczb ma} znak przeciwny do większości kolumny ({+lineCount:wiersz|wiersze|wierszy} {lines}). Przy kierunku „{direction}” taka liczba jest zapisywana jako położenie {side} dnem. Sprawdź, czy kierunek jest właściwy.`,
      en: `In column "{field}", {count} {+count:number has|numbers have} the opposite sign to most of the column ({+lineCount:line|lines} {lines}). With the direction "{direction}", such a number is written as a position {side} the seafloor. Check that the direction is the right one.`,
      de: `In der Spalte „{field}“ ist bei {count} {+count:Zahl|Zahlen} das Vorzeichen entgegengesetzt zu dem der meisten Zahlen ({+lineCount:Zeile|Zeilen} {lines}). Bei der Richtung „{direction}“ wird eine solche Zahl als Lage {side} dem Meeresboden geschrieben. Prüfen Sie, ob die Richtung stimmt.`,
      fr: `Dans la colonne « {field} », {count} {+count:nombre a|nombres ont} le signe opposé à celui de la plupart des nombres ({+lineCount:ligne|lignes} {lines}). Avec le sens « {direction} », un tel nombre est écrit comme une position {side} fond. Vérifiez que le sens est le bon.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {count} depth-below-seafloor cell(s) have the sign that most cells do not have. Direction {direction}: they are written as a distance {side} the seafloor (minimumDistanceAboveSurfaceInMeters = maximumDistanceAboveSurfaceInMeters; positive above, negative below). Not blocking: the direction is the user's to confirm.`,
    citations: [OBIS_DARWIN_CORE],
  },
  {
    id: 'CONV-SEAFLOOR-NO-SITE-DEPTH',
    category: 'B',
    severity: 'warning',
    params: ['count'],
    plain: {
      pl: `Głębokość w osadzie z kolumny „{field}” jest {+lineCount:w wierszu|w wierszach|w wierszach} {lines} (razem: {count}) bez głębokości stanowiska (wody nad dnem). Darwin Core liczy wtedy odległość od poziomu odniesienia wysokości, nie od dna. Dodaj głębokość stanowiska w metrach (znaczenie „Głębokość”).`,
      en: `Depth below the seafloor from column "{field}" is in {+lineCount:line|lines} {lines} ({count} in all) without the water depth of the site. Darwin Core then measures from the elevation reference, not from the seafloor. Add the water depth of the site in metres (meaning "Depth").`,
      de: `Die Tiefe unter dem Meeresboden aus der Spalte „{field}“ steht in {+lineCount:der Zeile|den Zeilen} {lines} (insgesamt {count}) ohne die Wassertiefe der Station. Darwin Core misst dann von der Höhenreferenz, nicht vom Meeresboden. Fügen Sie die Wassertiefe der Station in Metern hinzu (Bedeutung „Tiefe“).`,
      fr: `La profondeur sous le fond de la colonne « {field} » figure {+lineCount:à la ligne|aux lignes} {lines} ({count} au total) sans la profondeur d'eau du site. Darwin Core mesure alors depuis la référence d'altitude, pas depuis le fond. Ajoutez la profondeur d'eau du site en mètres (sens « Profondeur »).`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {count} row(s) have a depth below the seafloor and no minimumDepthInMeters / maximumDepthInMeters. Reference surface of minimumDistanceAboveSurfaceInMeters: "If depth measures are given, the reference surface is the location given by the depth, otherwise ... the elevation" (Darwin Core).`,
    citations: [OBIS_DARWIN_CORE],
  },
  {
    id: 'CONV-NO-OCCURRENCES',
    category: 'B',
    severity: 'error',
    params: [],
    plain: {
      pl: `To archiwum nie zawierałoby ani jednego rekordu występowania. OBIS publikuje rekordy gatunków, więc dodaj arkusz z taksonami (nazwy gatunków z liczebnością lub obecnością). Same dane środowiskowe nie tworzą zbioru danych OBIS.`,
      en: `This archive would contain no occurrences. OBIS publishes species records, so add a sheet with taxa (names of species with their counts or presence). Environmental data alone is not an OBIS dataset.`,
      de: `Dieses Archiv würde keinen einzigen Nachweis (Occurrence) enthalten. OBIS veröffentlicht Artnachweise; fügen Sie daher ein Blatt mit Taxa hinzu (Artnamen mit Anzahl oder Vorkommen). Umweltdaten allein ergeben keinen OBIS-Datensatz.`,
      fr: `Cette archive ne contiendrait aucune occurrence. OBIS publie des enregistrements d'espèces : ajoutez une feuille avec des taxons (noms d'espèces avec leurs effectifs ou leur présence). Des données environnementales seules ne forment pas un jeu de données OBIS.`,
    },
    technical: `The conversion produced 0 occurrence records. Every OBIS dataset has at least one occurrence record; an Event core with only profile levels and eMoF rows has none. The Occurrence table is empty, so its DWC-TERM-MISSING findings are not raised.`,
    citations: [OBIS_OCCURRENCE],
  },
  {
    id: 'CONV-PROFILE-NOTHING-READ',
    category: 'B',
    severity: 'error',
    params: ['rows'],
    plain: {
      pl: `Z arkusza „{sheet}”, oznaczonego jako plik profili, nie odczytano żadnego poziomu ({rows} {+rows:wiersz danych|wiersze danych|wierszy danych}). Potrzebna jest kolumna stacji, kolumny głębokości lub pomiarów i wiersze z wartościami. Jeśli arkusz tylko opisuje kolumny albo nie ma pomiarów, nie oznaczaj go jako pliku profili.`,
      en: `Nothing was read from sheet "{sheet}", marked as a profile file: no level ({rows} {+rows:data row|data rows}). Such a sheet needs a station column, depth or measured columns, and rows with values. If it only describes columns, or has no measurements, do not mark it as a profile file.`,
      de: `Aus dem Blatt „{sheet}“, markiert als Profildatei, wurde nichts gelesen: keine Stufe ({rows} {+rows:Datenzeile|Datenzeilen}). Ein solches Blatt braucht eine Stationsspalte, Tiefen- oder Messspalten und Zeilen mit Werten. Beschreibt es nur Spalten oder hat es keine Messungen, markieren Sie es nicht als Profildatei.`,
      fr: `Rien n'a été lu dans la feuille « {sheet} », marquée comme fichier de profils : aucun niveau ({rows} {+rows:ligne de données|lignes de données}). Il faut une colonne de station, des colonnes de profondeur ou de mesures et des lignes de valeurs. Une feuille qui ne décrit que des colonnes ne se marque pas comme fichier de profils.`,
    },
    technical: `{file}, {sheet}: the sheet was marked as a profile file and produced 0 profile levels ({rows} data rows).`,
  },
  {
    id: 'CONV-STATION-FROM-POSITION',
    category: 'B',
    severity: 'info',
    params: ['count'],
    plain: {
      pl: `W arkuszu „{sheet}” każde różne położenie (szerokość i długość geograficzna tak, jak zapisano) jest stacją, według Twojego wyboru: {count} {+count:stacja|stacje|stacji}, np. „{value}”. Identyfikator stacji składa się z kodu rejsu i położenia.`,
      en: `In sheet "{sheet}" each distinct position (latitude and longitude as written) is a station, as you chose: {count} {+count:station|stations}, e.g. "{value}". A station ID is made of the cruise code and the position.`,
      de: `Im Blatt „{sheet}“ ist jede verschiedene Position (Breite und Länge wie geschrieben) eine Station, wie Sie es gewählt haben: {count} {+count:Station|Stationen}, z. B. „{value}“. Die Stations-ID besteht aus dem Fahrtcode und der Position.`,
      fr: `Dans la feuille « {sheet} », chaque position distincte (latitude et longitude telles qu'écrites) est une station, comme vous l'avez choisi : {count} {+count:station|stations}, p. ex. « {value} ». L'identifiant d'une station se compose du code de campagne et de la position.`,
    },
    technical: `{file}, {sheet}: the sheet has no station column and the user ticked "each distinct position is a station": {count} station(s), first "{value}" (cruise:latitude_longitude, as written).`,
  },
  {
    id: 'CONV-EFFORT-INVALID',
    category: 'B',
    severity: 'error',
    params: ['count'],
    plain: {
      pl: `W kolumnie „{field}” (wielkość próby) nie ma dodatniej liczby {+lineCount:w wierszu|w wierszach|w wierszach} {lines} (razem: {count}), np. „{value}”. Bez niej nie da się zapisać wielkości próby.`,
      en: `Column "{field}" (sample size) has no positive number in {+lineCount:line|lines} {lines} ({count} in all), e.g. "{value}". The sample size cannot be written without one.`,
      de: `Die Spalte „{field}“ (Probengröße) enthält in {+lineCount:der Zeile|den Zeilen} {lines} keine positive Zahl (insgesamt {count}), z. B. „{value}“. Ohne sie lässt sich die Probengröße nicht schreiben.`,
      fr: `La colonne « {field} » (taille d'échantillon) n'a pas de nombre positif {+lineCount:à la ligne|aux lignes} {lines} ({count} au total), p. ex. « {value} ». Sans lui, la taille d'échantillon ne peut pas être écrite.`,
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
      pl: `W tym arkuszu nie wskazano kolumn z taksonami albo z ilością. Konwerter potrzebuje taksonu (w arkuszu szerokim nagłówki kolumn, w długim kolumnę z nazwą) i ilości (liczebność, zagęszczenie albo biomasa); list samej obecności gatunków na razie nie zapisuje.`,
      en: `No taxon columns, or no quantity column, are marked in this sheet. The converter needs a taxon (column headers in a wide sheet, a taxon column in a long one) and a quantity (counts, density or biomass); it does not yet write presence-only species lists.`,
      de: `In diesem Blatt sind keine Taxon-Spalten oder keine Mengenspalte markiert. Der Konverter braucht ein Taxon (im breiten Blatt die Spaltenköpfe, im langen eine Namensspalte) und eine Menge (Anzahlen, Dichte oder Biomasse); reine Anwesenheitslisten schreibt er noch nicht.`,
      fr: `Aucune colonne de taxon, ou de quantité, n'est marquée dans cette feuille. Le convertisseur a besoin d'un taxon (en-têtes de colonnes d'une feuille large, colonne de noms d'une feuille longue) et d'une quantité (effectifs, densité ou biomasse) ; il n'écrit pas encore de listes de présence seule.`,
    },
    technical: `{file}, {sheet}: no column with the taxon role for a {shape} sheet (wide: taxon columns with header:true; long: a taxon column and a quantity column). A taxon column without a quantity column (a presence-only species list) is this case too: presence-only lists are not written yet.`,
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
      pl: `{count} {+count:kolumna ma|kolumny mają|kolumn ma} znaczenie, którego przy tym ustawieniu arkusza nie zapisuje się w archiwum (na przykład ciśnienie w arkuszu, który nie jest plikiem profilowym, albo stadium w arkuszu szerokim): {columns}. Ich wartości nie trafią do archiwum; zaakceptuj to, aby eksportować bez nich.`,
      en: `{count} {+count:column has|columns have} a meaning that is not written to the archive as the sheet is set up (for example a pressure in a sheet that is not a profile file, or a life stage in a wide sheet): {columns}. Their values will not be in the archive; accept this to export without them.`,
      de: `{count} {+count:Spalte hat|Spalten haben} eine Bedeutung, die bei dieser Einstellung des Blatts nicht ins Archiv geschrieben wird (zum Beispiel Druck in einem Blatt, das keine Profildatei ist, oder Stadium in einem breiten Blatt): {columns}. Ihre Werte stehen nicht im Archiv; akzeptieren Sie das, um ohne sie zu exportieren.`,
      fr: `{count} {+count:colonne a|colonnes ont} un sens qui n'est pas écrit dans l'archive avec ce réglage de la feuille (par exemple pression dans une feuille qui n'est pas un fichier de profils, ou stade dans une feuille large) : {columns}. Leurs valeurs ne seront pas dans l'archive ; acceptez-le pour exporter sans elles.`,
    },
    technical: `{file}, {sheet}: {count} column(s) with a role other than ignore that this conversion does not read as the sheet is set up ({columns}): a pressure of a sheet that is not a profile file (a measured variable is written as an eMoF row on the sample event, or on the level event of a profile sheet, where the first pressure column is written as well), a second column of a role that is read once, a role of the other shape (a life stage, qualifier, occurrenceID, taxon ID or quantity column in a wide sheet, a taxon header column in a long one), the quantity type, or a sample-size column when the sample size is not set to a column. Nothing from them is written. The warning has to be accepted before the export.`,
  },
  {
    id: 'CONV-NAMEID-MISSING',
    category: 'B',
    severity: 'warning',
    params: ['count'],
    plain: {
      pl: `{count} {+count:wystąpienie nie ma|wystąpienia nie mają|wystąpień nie ma} scientificNameID; BioCheck i OBIS zgłaszają to jako błąd. W arkuszu szerokim identyfikatory dają teraz nazwy sprawdzone w WoRMS (opcja na tej stronie, domyślnie wyłączona); arkusz długi może wskazać kolumnę z nimi. Potwierdzone nazwy nie są liczone.`,
      en: `{count} {+count:occurrence has|occurrences have} no scientificNameID, and BioCheck and OBIS report that as an error. In a wide sheet the IDs now come from the WoRMS lookup (an option on this page, off by default); a long sheet can mark a column holding them. Names with a confirmed ID are not counted.`,
      de: `{count} {+count:Vorkommen hat|Vorkommen haben} keine scientificNameID; BioCheck und OBIS melden das als Fehler. In einem breiten Blatt liefert jetzt die WoRMS-Abfrage die Kennungen (Option auf dieser Seite, standardmäßig aus); ein langes Blatt kann eine Spalte damit markieren. Bestätigte Namen zählen nicht.`,
      fr: `{count} {+count:occurrence n'a|occurrences n'ont} pas de scientificNameID ; BioCheck et OBIS le signalent comme une erreur. Dans une feuille large, la recherche WoRMS fournit les identifiants (option de cette page, désactivée par défaut) ; une feuille longue peut marquer une colonne. Les noms confirmés ne sont pas comptés.`,
    },
    technical: `{file}: {count} occurrence(s) have no scientificNameID. BioCheck lists scientificNameID among the required fields of a leaf event (docs/research/qc-sources.md, Item 2). It is written only from a column the user marked (a scientificNameID column as given, a WoRMS AphiaID column as urn:lsid:marinespecies.org:taxname:<id>) or from a WoRMS result the user pressed the lookup button for and confirmed (an exact single match, or the result the user chose); nothing is guessed.`,
  },
  {
    id: 'CONV-WORMS-UNDECIDED',
    category: 'B',
    severity: 'error',
    params: ['count', 'names'],
    plain: {
      pl: `{count} {+count:nazwa z wyszukiwania w WoRMS czeka|nazwy z wyszukiwania w WoRMS czekają|nazw z wyszukiwania w WoRMS czeka} na Twój wybór: {names}. Dla każdej wybierz jeden z wyników albo „bez identyfikatora”; nic niepewnego nie jest przyjmowane automatycznie.`,
      en: `{count} {+count:name|names} from the WoRMS lookup {+count:is|are} waiting for your choice: {names}. For each one, choose one of the results or "no ID"; nothing uncertain is accepted automatically.`,
      de: `{count} {+count:Name aus der WoRMS-Abfrage wartet|Namen aus der WoRMS-Abfrage warten} auf Ihre Wahl: {names}. Wählen Sie für jeden eines der Ergebnisse oder „ohne Kennung“; nichts Unsicheres wird automatisch übernommen.`,
      fr: `{count} {+count:nom de la recherche WoRMS attend|noms de la recherche WoRMS attendent} votre choix : {names}. Pour chacun, choisissez l'un des résultats ou « sans identifiant » ; rien d'incertain n'est accepté automatiquement.`,
    },
    technical: `{count} name(s) looked up in WoRMS have a result that is not a single exact match under the name sent (a phonetic or near match, a genus-only match, an exact match under another name, several results, or a deleted record) and the user has not chosen one of the results or "no ID" yet (first: "{value}"). Only exactly one result with match_type exact and the name sent is automatic. The export is blocked until every such name is decided. Names: {names}.`,
    citations: [OBIS_NAME_MATCH],
  },
  {
    id: 'CONV-WORMS-NO-MATCH',
    category: 'B',
    severity: 'warning',
    params: ['count', 'names'],
    plain: {
      pl: `WoRMS nie ma wyniku dla {count} {+count:nazwy|nazw|nazw}: {names}. Ich scientificNameID zostaje puste; OBIS i BioCheck zgłaszają to jako brak. Sprawdź pisownię albo napisz do WoRMS, jeśli takson jest nowy.`,
      en: `WoRMS has no result for {count} {+count:name|names}: {names}. Their scientificNameID stays empty; OBIS and BioCheck report that as missing. Check the spelling, or write to WoRMS if the taxon is new.`,
      de: `WoRMS hat für {count} {+count:Namen|Namen} kein Ergebnis: {names}. Ihre scientificNameID bleibt leer; OBIS und BioCheck melden das als fehlend. Prüfen Sie die Schreibweise oder schreiben Sie an WoRMS, wenn das Taxon neu ist.`,
      fr: `WoRMS n'a aucun résultat pour {count} {+count:nom|noms} : {names}. Leur scientificNameID reste vide ; OBIS et BioCheck le signalent comme manquant. Vérifiez l'orthographe, ou écrivez à WoRMS si le taxon est nouveau.`,
    },
    technical: `{count} name(s) came back from AphiaRecordsByMatchNames with no record (an empty array for the name, or HTTP 204 for a whole batch), e.g. "{value}". scientificNameID is left empty for them. The OBIS Manual asks to contact WoRMS for a taxon that is not registered. Names: {names}.`,
    citations: [OBIS_NAME_MATCH],
  },
  {
    id: 'CONV-WORMS-NOT-MARINE',
    category: 'B',
    severity: 'warning',
    params: ['count', 'names'],
    plain: {
      pl: `WoRMS oznacza {count} {+count:potwierdzoną nazwę|potwierdzone nazwy|potwierdzonych nazw} jako słodkowodne lub lądowe, nie morskie ani słonawowodne: {names}. Sprawdź, czy to na pewno właściwe taksony; identyfikator jest zapisywany tak, jak go potwierdzono.`,
      en: `WoRMS marks {count} confirmed {+count:name|names} as freshwater or terrestrial only, not marine or brackish: {names}. Check that these are the right taxa; the ID is written as confirmed.`,
      de: `WoRMS kennzeichnet {count} bestätigte {+count:Namen|Namen} nur als Süßwasser oder terrestrisch, nicht als marin oder brackig: {names}. Prüfen Sie, ob das die richtigen Taxa sind; die Kennung wird wie bestätigt geschrieben.`,
      fr: `WoRMS marque {count} {+count:nom confirmé|noms confirmés} comme d'eau douce ou terrestre seulement, ni marin ni saumâtre : {names}. Vérifiez qu'il s'agit bien des bons taxons ; l'identifiant est écrit tel que confirmé.`,
    },
    technical: `{count} confirmed name(s) have a WoRMS record with isMarine and isBrackish not set and isFreshwater or isTerrestrial set, e.g. "{value}". The ID is written as confirmed; a record with no habitat flag at all is unknown, not "not marine". Names: {names}.`,
  },
  {
    id: 'CONV-NAMEID-INCOMPLETE',
    category: 'B',
    severity: 'warning',
    params: ['count', 'names'],
    plain: {
      pl: `Arkusz podaje identyfikator taksonu dla części wierszy {count} {+count:nazwy|nazw|nazw}, ale nie dla innych: {names}. Wiersze bez niego zostają bez identyfikatora, a nazwa nie jest wyszukiwana w WoRMS. Uzupełnij arkusz albo zaakceptuj to.`,
      en: `The sheet gives a taxon ID for some rows of {count} {+count:name|names} but not for others: {names}. The rows without one stay without an ID, and the name is not looked up in WoRMS. Complete the sheet, or accept this.`,
      de: `Das Blatt nennt für einige Zeilen von {count} {+count:Name|Namen} eine Taxon-Kennung, für andere nicht: {names}. Die Zeilen ohne Kennung bleiben ohne, und der Name wird nicht in WoRMS abgefragt. Ergänzen Sie das Blatt oder akzeptieren Sie das.`,
      fr: `La feuille donne un identifiant de taxon pour certaines lignes de {count} {+count:nom|noms}, mais pas pour d'autres : {names}. Les lignes sans identifiant en restent sans, et le nom n'est pas recherché dans WoRMS. Complétez la feuille ou acceptez-le.`,
    },
    technical: `{count} name(s) have a taxon ID from the sheet on some rows and none on others (first "{value}"): {names}. Rows with an ID keep it; the others get no ID. A name with a sheet ID on any row is never sent to WoRMS and never given a WoRMS ID.`,
  },
  {
    id: 'CONV-NAMEID-CONFLICT',
    category: 'B',
    severity: 'warning',
    params: ['count', 'names'],
    plain: {
      pl: `Arkusz podaje więcej niż jeden identyfikator taksonu dla {count} {+count:nazwy|nazw|nazw}: {names}. Każdy wiersz zachowuje swój identyfikator. Sprawdź, czy to różne taksony o tej samej nazwie; jeśli nie, popraw arkusz. Zaakceptuj to, aby eksportować bez zmian.`,
      en: `The sheet gives {count} {+count:name|names} more than one taxon ID: {names}. Each row keeps the ID it has. Check that these are different taxa that share a name; if not, correct the sheet. Accept this to export as it is.`,
      de: `Das Blatt nennt für {count} {+count:Name|Namen} mehr als eine Taxon-Kennung: {names}. Jede Zeile behält ihre Kennung. Prüfen Sie, ob es verschiedene Taxa mit demselben Namen sind; sonst korrigieren Sie das Blatt. Akzeptieren Sie das, um unverändert zu exportieren.`,
      fr: `La feuille donne plus d'un identifiant de taxon pour {count} {+count:nom|noms} : {names}. Chaque ligne garde son identifiant. Vérifiez qu'il s'agit de taxons différents portant le même nom ; sinon corrigez la feuille. Acceptez-le pour exporter tel quel.`,
    },
    technical: `{count} name(s) have more than one distinct scientificNameID in the sheet (first "{value}"): {names}. Nothing is changed: each row keeps its own ID (two taxa can share a name, e.g. homonyms), and the warning has to be accepted.`,
  },
  {
    id: 'CONV-NO-SAMPLING-DESCRIPTOR',
    category: 'B',
    severity: 'warning',
    params: [],
    plain: {
      pl: `W tabeli pomiarów archiwum nie ma żadnego opisu próbkowania ani wysiłku (wielkości próby lub oczka sieci). BioCheck zgłosi „No sampling descriptors/effort present”. Podaj wielkość próby lub oczko sieci, jeśli je znasz, albo zaakceptuj ostrzeżenie.`,
      en: `The archive's measurement table has no sampling descriptor or effort (a sample size or a mesh size). BioCheck will report "No sampling descriptors/effort present". Give the sample size or the mesh size if you know it, or accept the warning.`,
      de: `Die Messwerttabelle des Archivs enthält keine Angabe zur Probenahme oder zum Aufwand (Probengröße oder Maschenweite). BioCheck meldet „No sampling descriptors/effort present“. Geben Sie die Probengröße oder die Maschenweite an, wenn Sie sie kennen, oder akzeptieren Sie die Warnung.`,
      fr: `La table de mesures de l'archive ne contient aucun descripteur d'échantillonnage ni effort (taille d'échantillon ou vide de maille). BioCheck signalera « No sampling descriptors/effort present ». Indiquez la taille d'échantillon ou le vide de maille si vous le connaissez, ou acceptez l'avertissement.`,
    },
    technical: `The archive writes an extendedmeasurementorfact.txt and no row of it has a measurementTypeID containing a code of BioCheck's BODCeffort list (R/checkdataset.R, grepl over BODCeffort; the list holds VOLWBSMP, AREABEDS and MSHSIZE1, which this tool writes for a sample size and a mesh size, among 26 others). BioCheck runs this check only when the archive has an eMoF table (R/checkdataset.R, inside the block that starts at line 457 (if exists eMoF)), so it is raised only then.`,
    citations: [BIOCHECK_EFFORT],
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
  {
    id: 'CONV-PROFILE-STATION-UNMATCHED',
    category: 'B',
    severity: 'warning',
    params: ['count', 'names'],
    plain: {
      pl: `{count} {+count:stacja pliku profilowego nie pasuje|stacje pliku profilowego nie pasują|stacji pliku profilowego nie pasuje} do stacji z arkuszy biologicznych (tekst stacji i rejs, gdy podany, muszą być identyczne): {names}. Każda staje się osobnym zdarzeniem stacji. Zaakceptuj, jeśli nie było tam biologii, albo popraw pisownię.`,
      en: `{count} profile {+count:station matches|stations match} no station of your biology sheets (the station text, and the cruise when given, must be identical): {names}. {+count:It becomes|Each becomes} a station event of its own. Accept this if no biology was sampled there, or correct the spelling.`,
      de: `{count} {+count:Station der Profildatei passt|Stationen der Profildatei passen} zu keiner Station der Biologie-Blätter (Stationstext und ggf. Fahrt müssen identisch sein): {names}. Jede wird ein eigenes Stationsereignis. Akzeptieren Sie das, wenn dort keine Biologie beprobt wurde, oder korrigieren Sie die Schreibweise.`,
      fr: `{count} {+count:station de profil ne correspond|stations de profil ne correspondent} à aucune station des feuilles de biologie (texte de la station et campagne, si donnée, identiques) : {names}. Chacune devient un événement de station à part. Acceptez s'il n'y a pas eu de biologie là, ou corrigez l'orthographe.`,
    },
    technical: `{file}, {sheet}: {count} station(s) of the profile sheet match no station of the biology sheets ({names}). The match is exact on the trimmed station text and the cruise when the sheet gives one; nothing is matched approximately. Each of these stations became its own station event, with its levels as children and a date, position and depth range derived from them. The warning has to be accepted before the export.`,
  },
  {
    id: 'CONV-PROFILE-STATION-FAR',
    category: 'B',
    severity: 'warning',
    params: ['count', 'names', 'limit'],
    plain: {
      pl: `{count} {+count:dopasowana stacja profilu leży|dopasowane stacje profilu leżą|dopasowanych stacji profilu leży} dalej niż {limit} km od stacji biologicznej: {names}. Dwa pomiary na jednej stacji są blisko siebie, więc sprawdź, czy to ta sama stacja. Zaakceptuj, jeśli tak, albo popraw dopasowanie.`,
      en: `{count} matched profile {+count:station lies|stations lie} more than {limit} km from the biology station: {names}. Two samplings at one station are close together, so check that it is the same station. Accept this if it is, or correct the match.`,
      de: `{count} {+count:zugeordnete Profilstation liegt|zugeordnete Profilstationen liegen} mehr als {limit} km von der Biologie-Station entfernt: {names}. Zwei Einsätze an einer Station liegen nah beieinander; prüfen Sie, ob es dieselbe Station ist. Akzeptieren Sie das, wenn ja, oder korrigieren Sie die Zuordnung.`,
      fr: `{count} {+count:station de profil associée est|stations de profil associées sont} à plus de {limit} km de la station de biologie : {names}. Deux opérations sur une station sont proches ; vérifiez qu'il s'agit de la même. Acceptez si oui, ou corrigez l'association.`,
    },
    technical: `{file}, {sheet}: {count} profile station(s) matched to a biology station lie more than {limit} km from it (great-circle distance, haversine): {names}. The position of a profile station is that of its first level that has one, the position of a biology station that of its first sample that has one. The warning has to be accepted before the export.`,
  },
  {
    id: 'CONV-PROFILE-STATION-CAST-MATCHED',
    category: 'B',
    severity: 'info',
    params: ['count', 'names'],
    plain: {
      pl: `{count} {+count:stacja pliku profilowego została dopasowana|stacje pliku profilowego zostały dopasowane|stacji pliku profilowego zostało dopasowanych} do stacji biologicznej z pominięciem numeru operacji na końcu, na co pozwoliłeś: {names}. Sprawdź, czy każda para to jedna stacja.`,
      en: `{count} profile {+count:station was|stations were} matched to a biology station by ignoring the cast number at the end, as you allowed: {names}. Check that each pair is one station.`,
      de: `{count} {+count:Station der Profildatei wurde|Stationen der Profildatei wurden} unter Auslassung der Einsatznummer am Ende, wie Sie es erlaubt haben, einer Biologie-Station zugeordnet: {names}. Prüfen Sie, ob jedes Paar eine Station ist.`,
      fr: `{count} {+count:station du fichier de profils a été associée|stations du fichier de profils ont été associées} à une station de biologie sans le numéro d'opération final, comme vous l'avez permis : {names}. Vérifiez que chaque paire est une même station.`,
    },
    technical: `{file}, {sheet}: {count} profile station(s) matched to a biology station with the trailing cast number ignored (ticked for this sheet): {names}. Each pair is "profile station <-> biology station". Nothing needs to be accepted; a pair farther apart than the limit of CONV-PROFILE-STATION-FAR also raises that warning.`,
  },
  {
    id: 'CONV-PANGAEA-NAMES-FALLBACK',
    category: 'B',
    severity: 'info',
    params: [],
    plain: {
      pl: `Lista parametrów w nagłówku pliku PANGAEA nie pasuje do jego kolumn, więc jako nazw taksonów użyto skrótów z nagłówka tabeli. Skróty mogą oznaczać dwa różne taksony, więc sprawdź nazwy na liście poniżej.`,
      en: `The parameter list in the header of the PANGAEA file does not fit its columns, so the abbreviations of the table header are used as the taxon names. An abbreviation can stand for two different taxa, so check the names in the list below.`,
      de: `Die Parameterliste im Kopf der PANGAEA-Datei passt nicht zu ihren Spalten, daher werden die Abkürzungen der Tabellenüberschrift als Taxonnamen verwendet. Eine Abkürzung kann für zwei verschiedene Taxa stehen; prüfen Sie die Namen in der Liste unten.`,
      fr: `La liste des paramètres de l'en-tête du fichier PANGAEA ne correspond pas à ses colonnes : les abréviations de l'en-tête du tableau servent donc de noms de taxons. Une abréviation peut désigner deux taxons différents ; vérifiez les noms dans la liste ci-dessous.`,
    },
    technical: `{file}, {sheet}: the Parameter(s) block of the PANGAEA header was not matched to the table columns (another number of columns, or an abbreviation that is not what the column header starts with), so the long names are not used and the table-header abbreviations are the taxon names.`,
  },
  {
    id: 'CONV-PROFILE-LEVEL-INCOMPLETE',
    category: 'B',
    severity: 'error',
    params: ['count', 'what'],
    plain: {
      pl: `{count} {+count:poziom profilu nie ma|poziomy profilu nie mają|poziomów profilu nie ma} {what}, a stacja też jej nie ma ({+lineCount:wiersz|wiersze|wierszy} {lines}). OBIS i BioCheck wymagają daty i pozycji przy każdym zdarzeniu bez dzieci. Dodaj kolumnę z datą lub pozycją albo dodaj tę stację do arkuszy biologicznych.`,
      en: `{count} profile {+count:level has|levels have} no {what}, and neither has its station ({+lineCount:line|lines} {lines}). OBIS and BioCheck need a date and a position for every event without children. Add a date or position column to the sheet, or add this station to the biology sheets.`,
      de: `{count} {+count:Profilebene hat|Profilebenen haben} keine Angabe zu {what}, und ihre Station auch nicht ({+lineCount:Zeile|Zeilen} {lines}). OBIS und BioCheck verlangen Datum und Position bei jedem Ereignis ohne Kinder. Fügen Sie dem Blatt eine Datums- oder Positionsspalte hinzu oder diese Station den Biologie-Blättern.`,
      fr: `{count} {+count:niveau de profil n'a|niveaux de profil n'ont} pas de {what}, et leur station non plus ({+lineCount:ligne|lignes} {lines}). OBIS et BioCheck exigent une date et une position pour chaque événement sans enfants. Ajoutez une colonne de date ou de position à la feuille, ou cette station aux feuilles de biologie.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} profile level(s) have no {what} of their own and their parent event (the station) has none to give. With the station level flattened away the parent is the cruise, and a level never takes them from it. BioCheck requires eventDate, decimalLatitude and decimalLongitude on every event without children, after a child has taken what its parent gives (obistools flatten_event, check_fields). A level never takes them from further up (the whole cruise's range for one cast), and nothing is copied from another station.`,
  },
  {
    id: 'CONV-PROFILE-PRESSURE-NO-UNIT',
    category: 'B',
    severity: 'warning',
    params: ['column'],
    plain: {
      pl: `Kolumna ciśnienia „{column}” nie podaje jednostki, więc jej wartości są zapisywane bez jednostki. Podaj jednostkę, np. dbar w nazwie kolumny lub w polu jednostki powyżej, aby można było zapisać jednostkę i jej identyfikator, albo zaakceptuj eksport bez jednostki.`,
      en: `The pressure column "{column}" states no unit, so its values are written without one. Give the column a unit, for example dbar in its name or in the unit field above, so that the unit and its identifier can be written; or accept this to export without a unit.`,
      de: `Die Druckspalte „{column}“ nennt keine Einheit, ihre Werte werden daher ohne Einheit geschrieben. Geben Sie eine Einheit an, z. B. dbar im Spaltennamen oder im Einheitenfeld oben, damit Einheit und Kennung geschrieben werden können; oder akzeptieren Sie den Export ohne Einheit.`,
      fr: `La colonne de pression « {column} » n'indique pas d'unité : ses valeurs sont écrites sans unité. Donnez une unité, par exemple dbar dans le nom de la colonne ou dans le champ d'unité ci-dessus, pour que l'unité et son identifiant soient écrits ; ou acceptez l'export sans unité.`,
    },
    technical: `{file}, {sheet}: the pressure column {column} has no unit, so its measurement rows carry no measurementUnit and no measurementUnitID, and level IDs cannot be made of it (they need decibars). The warning has to be accepted before the export.`,
  },
  {
    id: 'CONV-PROFILE-NO-STATION',
    category: 'B',
    severity: 'error',
    params: ['count', 'column'],
    plain: {
      pl: `{count} {+count:wiersz profilu nie ma|wiersze profilu nie mają|wierszy profilu nie ma} stacji ({+lineCount:wiersz|wiersze|wierszy} {lines}). Poziom profilu trafia pod swoją stację, więc każdy wiersz musi ją mieć. Wskaż kolumnę stacji, zaznacz „Każde różne położenie to stacja” albo uzupełnij puste komórki.`,
      en: `{count} profile {+count:row has|rows have} no station ({+lineCount:line|lines} {lines}). A profile level is placed under its station, so every row needs one. Map the station column, tick "Each distinct position is a station", or fill in the empty cells.`,
      de: `{count} {+count:Profilzeile hat|Profilzeilen haben} keine Station ({+lineCount:Zeile|Zeilen} {lines}). Eine Profilebene wird unter ihre Station gehängt, daher braucht jede Zeile eine. Ordnen Sie die Stationsspalte zu, wählen Sie „Jede verschiedene Position ist eine Station“ oder füllen Sie die leeren Zellen.`,
      fr: `{count} {+count:ligne de profil n'a|lignes de profil n'ont} pas de station ({+lineCount:ligne|lignes} {lines}). Un niveau de profil est placé sous sa station : chaque ligne doit en avoir une. Indiquez la colonne de station, cochez « Chaque position distincte est une station » ou remplissez les cellules vides.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} profile row(s) hold data but no station text (station column: {column}). A level event needs its station as its parent, so these rows were not converted.`,
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

/** What a profile level lacks, in words (CONV-PROFILE-LEVEL-INCOMPLETE carries date | position | date and position in `what`). */
const SEAFLOOR_REASON_WORDS: Record<string, Record<Lang, string>> = {
  notation: {
    en: 'it is not a plain decimal number (for example it has an exponent), and the shift from cm to m is made exactly on the text of a plain number',
    pl: 'to nie jest zwykła liczba dziesiętna (na przykład ma wykładnik), a przesunięcie z cm na m wykonuje się dokładnie na tekście zwykłej liczby',
    de: 'es ist keine einfache Dezimalzahl (zum Beispiel mit Exponent), und die Verschiebung von cm nach m erfolgt exakt am Text einer einfachen Zahl',
    fr: "ce n'est pas un nombre décimal simple (par exemple avec un exposant), et le décalage de cm en m se fait exactement sur le texte d'un nombre simple",
  },
};
const SIGNS_DIRECTION_WORDS: Record<string, Record<Lang, string>> = {
  down: { en: 'downwards', pl: 'w dół', de: 'abwärts', fr: 'vers le bas' },
  up: { en: 'upwards', pl: 'w górę', de: 'aufwärts', fr: 'vers le haut' },
};
const SIGNS_SIDE_WORDS: Record<string, Record<Lang, string>> = {
  above: { en: 'above', pl: 'nad', de: 'über', fr: 'au-dessus du' },
  below: { en: 'below', pl: 'pod', de: 'unter', fr: 'au-dessous du' },
};
const NONE_WORDS: Record<Lang, string> = { en: 'none', pl: 'brak', de: 'keine', fr: 'aucune' };

const LEVEL_WHAT_WORDS: Record<string, Record<Lang, string>> = {
  date: { en: 'date', pl: 'daty', de: 'Datum', fr: 'date' },
  position: { en: 'position', pl: 'pozycji', de: 'Position', fr: 'position' },
  'date and position': { en: 'date or position', pl: 'daty lub pozycji', de: 'Datum oder Position', fr: 'date ou position' },
};

/** Which table an eMoF row points into, in words (CONV-EMOF-ORPHAN carries event | occurrence in `kind`). */
const KIND_WORDS: Record<string, Record<Lang, string>> = {
  event: { en: 'an event', pl: 'zdarzenie', de: 'ein Ereignis', fr: 'un événement' },
  occurrence: { en: 'an occurrence', pl: 'wystąpienie', de: 'ein Vorkommen', fr: 'une occurrence' },
};

/**
 * CONV-NERC-UNKNOWN names what has no confirmed concept: the quantity of a sheet (a density or a biomass per area of the water column, written by the core in English as
 * `<what> per area of the water column`) or the measured variables the user's own columns name (their text, kept as written). The first is put into the reader's language.
 */
const QUANTITY_WORDS: Record<string, Record<Lang, string>> = {
  density: { en: 'density per area of the water column', pl: 'zagęszczenia na powierzchnię słupa wody', de: 'Dichte pro Fläche der Wassersäule', fr: 'la densité par surface de la colonne d\'eau' },
  wet: { en: 'wet biomass per area of the water column', pl: 'biomasy mokrej na powierzchnię słupa wody', de: 'Nassbiomasse pro Fläche der Wassersäule', fr: 'la biomasse humide par surface de la colonne d\'eau' },
  dry: { en: 'dry biomass per area of the water column', pl: 'biomasy suchej na powierzchnię słupa wody', de: 'Trockenbiomasse pro Fläche der Wassersäule', fr: 'la biomasse sèche par surface de la colonne d\'eau' },
  afdw: { en: 'ash-free dry biomass per area of the water column', pl: 'biomasy suchej bez popiołu na powierzchnię słupa wody', de: 'aschefreie Trockenbiomasse pro Fläche der Wassersäule', fr: 'la biomasse sèche sans cendres par surface de la colonne d\'eau' },
};
const QUOTES: Record<Lang, [string, string]> = { en: ['"', '"'], pl: ['„', '”'], de: ['„', '“'], fr: ['« ', ' »'] };
/** The quantity of a sheet in the reader's language, or the names of variable columns (their own text, often English words) each in the quotation marks of the language, so they read as names. */
const quantityWhat = (what: string, lang: Lang): string => {
  const m = /^(density|wet biomass|dry biomass|afdw biomass) per area of the water column$/.exec(what);
  if (m) return QUANTITY_WORDS[m[1].split(' ')[0]][lang];
  const [open, close] = QUOTES[lang];
  return what
    .split(', ')
    .map((n) => `${open}${n}${close}`)
    .join(', ');
};

/**
 * The texts of a PROFILE file for two rules whose generic text would mislead there: the generic CONV-SAMPLE-CODE-MISSING offers the download of proposed codes (a one-time
 * proposal for a biology sheet that is not made for profile levels), and the generic CONV-ID-DUPLICATE talks of sample codes and the station prefix. Chosen by renderConvertPlain
 * and renderConvertTechnical from the finding's own params; the registry keeps one rule per id.
 */
export const PROFILE_VARIANTS: Readonly<Record<string, { plain: Record<Lang, string>; technical: string }>> = {
  'CONV-SAMPLE-CODE-MISSING': {
    plain: {
      pl: `{count} {+count:wiersz profilu nie ma|wiersze profilu nie mają|wierszy profilu nie ma} kodu poziomu ({+lineCount:wiersz|wiersze|wierszy} {lines}). Identyfikator poziomu pochodzi od Ciebie: wskaż jako kod próbki kolumnę z kodem unikalnym w obrębie stacji (numer butelki, skanu lub Niskina) albo zaznacz zgodę na stację i głębokość zapisaną w arkuszu (w każdym wierszu potrzebna głębokość albo ciśnienie w decybarach).`,
      en: `{count} profile {+count:row has|rows have} no level code ({+lineCount:line|lines} {lines}). The level's identifier comes from you: map a column with a code that is unique within the station (bottle, scan or Niskin number) as the sample code, or tick the approval for the station and the depth as written (every row needs a depth, or a pressure in decibars).`,
      de: `{count} {+count:Profilzeile hat|Profilzeilen haben} keinen Ebenencode ({+lineCount:Zeile|Zeilen} {lines}). Die Kennung der Ebene kommt von Ihnen: ordnen Sie eine Spalte mit je Station eindeutigem Code (Flaschen-, Scan- oder Niskin-Nummer) als Probencode zu, oder stimmen Sie Station und Tiefe wie geschrieben zu (jede Zeile braucht eine Tiefe oder einen Druck in Dezibar).`,
      fr: `{count} {+count:ligne de profil n'a|lignes de profil n'ont} pas de code de niveau ({+lineCount:ligne|lignes} {lines}). L'identifiant du niveau vient de vous : indiquez comme code d'échantillon une colonne à code unique par station (numéro de bouteille, de scan ou de Niskin), ou cochez l'accord pour la station et la profondeur telle qu'écrite (chaque ligne a besoin d'une profondeur ou d'une pression en décibars).`,
    },
    technical: `{file}, {sheet}:{lines}: {count} profile row(s) have no level code (code column: {column}). The eventID of a level is its station's eventID and the user's own code or, only with the user's approval for this sheet, per row the depth as written when it reads as a number, else the pressure as written with the suffix dbar (only for a pressure column in decibars); a row with neither is not given an ID, and an ID is never derived from the order of the rows. These rows were not converted.`,
  },
  'CONV-ID-DUPLICATE': {
    plain: {
      pl: `Ten sam identyfikator poziomu powstaje więcej niż raz, np. „{value}”, {+lineCount:w wierszu|w wierszach|w wierszach} {lines} (utworzony z: {used}). Dwa wiersze jednej stacji mają ten sam kod, tę samą głębokość lub to samo ciśnienie (tak robią powtórzone rzuty sondy); głębokość i ciśnienie nigdy się nie zgadzają, kod i głębokość mogą. Dodaj kolumnę z kodem unikalnym w obrębie stacji, np. numer rzutu i butelki razem, i wskaż ją jako kod próbki.`,
      en: `The same level identifier is produced more than once, e.g. "{value}", in {+lineCount:line|lines} {lines} (made of: {used}). Two rows of one station have the same code, depth or pressure (repeated casts do this); a depth and a pressure never match, a code and a depth can. Add a column with a code unique within the station, e.g. cast and bottle together, and mark it as the sample code.`,
      de: `Dieselbe Ebenenkennung entsteht mehrfach, z. B. „{value}“, in {+lineCount:der Zeile|den Zeilen} {lines} (gebildet aus: {used}). Zwei Zeilen einer Station haben denselben Code, dieselbe Tiefe oder denselben Druck (wiederholte Einsätze tun das); Tiefe und Druck stimmen nie überein, ein Code und eine Tiefe können es. Fügen Sie eine Spalte mit je Station eindeutigem Code hinzu, z. B. Einsatz und Flasche zusammen, und ordnen Sie sie als Probencode zu.`,
      fr: `Le même identifiant de niveau est produit plusieurs fois, p. ex. « {value} », {+lineCount:à la ligne|aux lignes} {lines} (formé de : {used}). Deux lignes d'une même station ont le même code, la même profondeur ou la même pression (des déploiements répétés font cela) ; une profondeur et une pression ne coïncident jamais, un code et une profondeur le peuvent. Ajoutez une colonne à code unique par station, par exemple déploiement et bouteille ensemble, et indiquez-la comme code d'échantillon.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} repeated {kind} identifier(s), example "{value}" (made of: {used}). {hint}`,
  },
  'CONV-SEAFLOOR-SIGNS:tie': {
    plain: {
      pl: `Kolumna „{field}” ma tyle samo liczb dodatnich co ujemnych. Przy kierunku „{direction}” {count} {+count:liczba dodatnia jest zapisywana|liczby dodatnie są zapisywane|liczb dodatnich jest zapisywanych} jako położenie {side} dnem ({+lineCount:wiersz|wiersze|wierszy} {lines}). Sprawdź, czy kierunek jest właściwy.`,
      en: `Column "{field}" has as many positive as negative numbers. With the direction "{direction}", the positive ones ({+lineCount:line|lines} {lines}, {count} in all) are written as a position {side} the seafloor. Check that the direction is the right one.`,
      de: `Die Spalte „{field}“ hat gleich viele positive wie negative Zahlen. Bei der Richtung „{direction}“ werden die positiven ({+lineCount:Zeile|Zeilen} {lines}, insgesamt {count}) als Lage {side} dem Meeresboden geschrieben. Prüfen Sie, ob die Richtung stimmt.`,
      fr: `La colonne « {field} » a autant de nombres positifs que négatifs. Avec le sens « {direction} », les positifs ({+lineCount:ligne|lignes} {lines}, {count} au total) sont écrits comme une position {side} fond. Vérifiez que le sens est le bon.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: the column has as many positive as negative depth-below-seafloor cells; the {count} positive one(s) are listed. Direction {direction}: written as a distance {side} the seafloor. Not blocking: the direction is the user's to confirm.`,
  },
  'CONV-NO-OCCURRENCES:zeros': {
    plain: {
      pl: `To archiwum nie zawierałoby ani jednego rekordu występowania: wszystkie liczebności wynosiły 0 i zostały pominięte, bo lista nie jest zadeklarowana jako pełna. Zaznacz pełną listę gatunków, aby zapisać je jako nieobecności, albo dodaj rekordy obecności.`,
      en: `This archive would contain no occurrences: every count was 0 and was skipped, because the list is not declared complete. Tick the full species list to write them as absences, or add the records of what was present.`,
      de: `Dieses Archiv würde keinen Nachweis enthalten: alle Anzahlen waren 0 und wurden übersprungen, weil die Liste nicht als vollständig erklärt ist. Wählen Sie die vollständige Artenliste, um sie als Abwesenheiten zu schreiben, oder fügen Sie Nachweise hinzu.`,
      fr: `Cette archive ne contiendrait aucune occurrence : tous les effectifs étaient à 0 et ont été ignorés, car la liste n'est pas déclarée complète. Cochez la liste complète des espèces pour les écrire comme absences, ou ajoutez des enregistrements de présence.`,
    },
    technical: `The conversion produced 0 occurrence records: every taxon cell was 0 and the full species list is not ticked, so the zeros were skipped (CONV-ZERO-SKIPPED). With the tick a zero becomes occurrenceStatus absent.`,
  },
  'CONV-LONG-UNSUPPORTED:one-parameter': {
    plain: {
      pl: `Arkusz „{sheet}” ma układ długi („{parameterColumn}” i „{valueColumn}”), ale kolumna parametru ma mniej niż dwie różne wartości, więc nie odczytano go jako długiego. Zrób kolumnę na parametr, z jednostką w nagłówku (np. „Temp [°C]”), i wczytaj ponownie.`,
      en: `Sheet "{sheet}" is in the long layout ("{parameterColumn}" and "{valueColumn}"), but the parameter column holds fewer than two different values, so it was not read as a long sheet. Make one column per parameter, unit in the header (e.g. "Temp [°C]"), and load it again.`,
      de: `Das Blatt „{sheet}“ hat das lange Layout („{parameterColumn}“, „{valueColumn}“), aber die Parameterspalte enthält weniger als zwei verschiedene Werte; es wurde nicht als langes Blatt gelesen. Machen Sie eine Spalte je Parameter, Einheit in der Überschrift („Temp [°C]“), und laden Sie neu.`,
      fr: `La feuille « {sheet} » est en format long (« {parameterColumn} », « {valueColumn} »), mais la colonne du paramètre contient moins de deux valeurs différentes : elle n'a pas été lue comme feuille longue. Faites une colonne par paramètre, l'unité dans l'en-tête (« Temp [°C] »), et rechargez.`,
    },
    technical: `{file}, {sheet}: a header names a parameter column ("{parameterColumn}") and a value column ("{valueColumn}") but the parameter column has {count} distinct value(s); a long sheet is read only with at least two. Nothing is written from this sheet; the export is blocked.`,
  },
  'CONV-LONG-UNSUPPORTED:too-many': {
    plain: {
      pl: `Arkusz „{sheet}” ma układ długi („{parameterColumn}” i „{valueColumn}”) i {count} różnych par parametr–jednostka: więcej niż {max}, czyli najwięcej, ile konwerter zamienia na kolumny. Podziel arkusz na grupy parametrów albo zostaw potrzebne i wczytaj ponownie.`,
      en: `Sheet "{sheet}" is in the long layout ("{parameterColumn}" and "{valueColumn}") with {count} different parameter and unit pairs: more than {max}, the most the converter turns into columns. Split the sheet by group of parameters, or keep the ones you need, and load it again.`,
      de: `Das Blatt „{sheet}“ hat das lange Layout („{parameterColumn}“, „{valueColumn}“) mit {count} verschiedenen Paaren aus Parameter und Einheit: mehr als {max}, das Höchste, was der Konverter zu Spalten macht. Teilen Sie das Blatt nach Parametergruppen oder behalten Sie die nötigen, und laden Sie neu.`,
      fr: `La feuille « {sheet} » est en format long (« {parameterColumn} », « {valueColumn} ») avec {count} paires paramètre-unité différentes : plus de {max}, le maximum que le convertisseur met en colonnes. Divisez la feuille par groupes de paramètres ou gardez ceux dont vous avez besoin, puis rechargez.`,
    },
    technical: `{file}, {sheet}: a long sheet ("{parameterColumn}", "{valueColumn}") has {count} distinct (parameter, unit) pairs; the converter makes at most {max} columns of them. Nothing is written from this sheet; the export is blocked.`,
  },
  'CONV-ID-DUPLICATE:other': {
    plain: {
      pl: `Identyfikator poziomu „{value}” {+lineCount:w wierszu|w wierszach|w wierszach} {lines} jest też identyfikatorem innego zdarzenia (utworzony z: {used}). Identyfikatory muszą być unikalne: zmień kod wierszy profilu albo kody próbek.`,
      en: `The level identifier "{value}" in {+lineCount:line|lines} {lines} is also the identifier of another event (made of: {used}). Identifiers must be unique: change the code of the profile rows, or the sample codes.`,
      de: `Die Ebenenkennung „{value}“ in {+lineCount:der Zeile|den Zeilen} {lines} ist zugleich die Kennung eines anderen Ereignisses (gebildet aus: {used}). Kennungen müssen eindeutig sein: Ändern Sie den Code der Profilzeilen oder die Probencodes.`,
      fr: `L'identifiant de niveau « {value} » {+lineCount:à la ligne|aux lignes} {lines} est aussi l'identifiant d'un autre événement (formé de : {used}). Les identifiants doivent être uniques : changez le code des lignes de profil ou les codes d'échantillon.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} repeated {kind} identifier(s), example "{value}" (made of: {used}). {hint}`,
  },
};

const profileVariant = (f: Finding): { plain: Record<Lang, string>; technical: string } | undefined => {
  if (f.ruleId === 'CONV-SAMPLE-CODE-MISSING' && f.params.profile === 'yes') return PROFILE_VARIANTS[f.ruleId];
  if (f.ruleId === 'CONV-ID-DUPLICATE' && f.params.kind === 'level') return PROFILE_VARIANTS[f.ruleId];
  if (f.ruleId === 'CONV-ID-DUPLICATE' && f.params.kind === 'level-other') return PROFILE_VARIANTS['CONV-ID-DUPLICATE:other'];
  if (f.ruleId === 'CONV-NO-OCCURRENCES' && f.params.zeros === 'yes') return PROFILE_VARIANTS['CONV-NO-OCCURRENCES:zeros'];
  if (f.ruleId === 'CONV-SEAFLOOR-SIGNS' && f.params.tie === 'yes') return PROFILE_VARIANTS['CONV-SEAFLOOR-SIGNS:tie'];
  if (f.ruleId === 'CONV-LONG-UNSUPPORTED' && (f.params.reason === 'one-parameter' || f.params.reason === 'too-many')) return PROFILE_VARIANTS[`CONV-LONG-UNSUPPORTED:${f.params.reason}`];
  return undefined;
};

/** What a level ID was made of, in words (CONV-ID-DUPLICATE of a profile carries code | depth | pressure | sample | station in `used`, in line order). */
const USED_WORDS: Record<string, Record<Lang, string>> = {
  code: { en: 'code', pl: 'kod', de: 'Code', fr: 'code' },
  depth: { en: 'depth', pl: 'głębokość', de: 'Tiefe', fr: 'profondeur' },
  pressure: { en: 'pressure', pl: 'ciśnienie', de: 'Druck', fr: 'pression' },
  seafloor: { en: 'depth below the seafloor', pl: 'głębokość w osadzie', de: 'Tiefe unter dem Meeresboden', fr: 'profondeur sous le fond' },
  sample: { en: 'a sample', pl: 'próbka', de: 'Probe', fr: 'échantillon' },
  station: { en: 'a station or cruise', pl: 'stacja lub rejs', de: 'Station oder Fahrt', fr: 'station ou campagne' },
};

/** The stations of CONV-PROFILE-STATION-UNMATCHED: the first of them and the count of the rest (the finding keeps the whole list, so the acceptance stands for all of it). */
const STATIONS_SHOWN = 20;
function stationList(text: string): string {
  const items = text.split(', ');
  return items.length <= STATIONS_SHOWN ? text : `${items.slice(0, STATIONS_SHOWN).join(', ')}, … (+${items.length - STATIONS_SHOWN})`;
}

function fill(template: string, f: Finding, lang?: Lang): string {
  const generic: Record<string, string> = { file: f.file ?? '', sheet: f.sheet ?? '', field: f.field ?? '', value: f.value ?? '', lines: formatLines(f.lines) };
  // plural tokens ({+count:one|other}, i18n/plural.ts) depend on a numeric param; the English technical line has none
  // {+lineCount:...} depends on how many distinct lines the finding names ("wiersz 7", but "wiersze 7–9")
  const lineCount = f.lines && f.lines.length > 0 ? new Set(f.lines).size : undefined;
  const text =
    lang === undefined
      ? template
      : applyPlurals(lang, template, (name) =>
          Object.prototype.hasOwnProperty.call(f.params, name) ? Number(f.params[name]) : name === 'lineCount' ? lineCount : undefined,
        );
  return text.replace(/\{([A-Za-z_][\w.]*)\}/g, (whole, name: string) => {
    if (Object.prototype.hasOwnProperty.call(f.params, name)) return String(f.params[name]);
    if (Object.prototype.hasOwnProperty.call(generic, name)) return generic[name];
    return whole;
  });
}

/** One or two sentences for a scientist, in `lang` (English when the language is unknown). */
/** The lists of names or columns are kept whole in the finding (so that the acceptance of a warning stands for the whole set); the text shows the first few. */
const SHOWN_ITEMS = 6;
function shortList(text: string): string {
  const items = text.split(', ');
  return items.length <= SHOWN_ITEMS ? text : `${items.slice(0, SHOWN_ITEMS).join(', ')}, …`;
}

/** A finding of CONV-LONG-UNSUPPORTED without a reason (the sheet was not read for another cause) still names every placeholder of its text. */
const withDefaults = (f: Finding): Finding => (f.ruleId === 'CONV-LONG-UNSUPPORTED' ? { ...f, params: { reason: 'other', count: 0, max: MAX_PAIRS, ...f.params } } : f);

export function renderConvertPlain(f: Finding, lang: Lang): string {
  f = withDefaults(f);
  const rule = getConvertRule(f.ruleId);
  if (typeof f.params.names === 'string' || typeof f.params.columns === 'string') {
    f = { ...f, params: { ...f.params, ...(typeof f.params.names === 'string' && f.ruleId !== 'CONV-PROFILE-STATION-UNMATCHED' && f.ruleId !== 'CONV-PROFILE-STATION-FAR' && f.ruleId !== 'CONV-PROFILE-STATION-CAST-MATCHED' ? { names: shortList(f.params.names) } : {}), ...(typeof f.params.columns === 'string' ? { columns: shortList(f.params.columns) } : {}) } };
  }
  if ((f.ruleId === 'CONV-EFFORT-VALUE-INVALID' || f.ruleId === 'CONV-MESH-INVALID') && typeof f.params.reason === 'string') f = { ...f, params: { ...f.params, reason: REASON_WORDS[f.params.reason]?.[lang] ?? f.params.reason } };
  if (f.ruleId === 'CONV-SEAFLOOR-VALUE' && typeof f.params.reason === 'string') f = { ...f, params: { ...f.params, reason: SEAFLOOR_REASON_WORDS[f.params.reason]?.[lang] ?? f.params.reason } };
  if (f.ruleId === 'CONV-SEAFLOOR-SIGNS') f = { ...f, params: { ...f.params, direction: SIGNS_DIRECTION_WORDS[String(f.params.direction)]?.[lang] ?? f.params.direction, side: SIGNS_SIDE_WORDS[String(f.params.side)]?.[lang] ?? f.params.side } };
  if (f.ruleId === 'CONV-SEAFLOOR-UNIT' && f.params.unit === 'none') f = { ...f, params: { ...f.params, unit: NONE_WORDS[lang] } };
  if (f.ruleId === 'CONV-QUANTITY-UNDECLARED' && typeof f.params.missing === 'string') {
    const words = f.params.missing.split(', ').map((m) => MISSING_WORDS[m]?.[lang] ?? m);
    f = { ...f, params: { ...f.params, missing: words.join('; ') } };
  }
  if (f.ruleId === 'CONV-EML-MISSING' && typeof f.params.fields === 'string') {
    f = { ...f, params: { ...f.params, fields: f.params.fields.split(', ').map((m) => EML_WORDS[m]?.[lang] ?? m).join(', ') } };
  }
  if (f.ruleId === 'CONV-NERC-UNKNOWN' && typeof f.params.what === 'string') f = { ...f, params: { ...f.params, what: shortList(quantityWhat(f.params.what, lang)) } };
  if (f.ruleId === 'CONV-PROFILE-LEVEL-INCOMPLETE' && typeof f.params.what === 'string') f = { ...f, params: { ...f.params, what: LEVEL_WHAT_WORDS[f.params.what]?.[lang] ?? f.params.what } };
  if (f.ruleId === 'CONV-EMOF-ORPHAN' && typeof f.params.kind === 'string') f = { ...f, params: { ...f.params, kind: KIND_WORDS[f.params.kind]?.[lang] ?? f.params.kind } };
  if (f.ruleId === 'CONV-PROFILE-STATION-UNMATCHED' && typeof f.params.names === 'string') f = { ...f, params: { ...f.params, names: stationList(f.params.names) } };
  // the pairs of CONV-PROFILE-STATION-FAR are separated by "; " (a station text may hold a comma): the first few, then the count of the rest
  if ((f.ruleId === 'CONV-PROFILE-STATION-FAR' || f.ruleId === 'CONV-PROFILE-STATION-CAST-MATCHED') && typeof f.params.names === 'string') {
    const items = f.params.names.split('; ');
    f = { ...f, params: { ...f.params, names: items.length <= 4 ? items.join('; ') : `${items.slice(0, 4).join('; ')}; … (+${items.length - 4})` } };
  }
  if (f.ruleId === 'CONV-ID-DUPLICATE' && typeof f.params.used === 'string') f = { ...f, params: { ...f.params, used: f.params.used.split(', ').map((w) => USED_WORDS[w]?.[lang] ?? w).join(', ') } };
  const variant = profileVariant(f);
  return fill(variant ? variant.plain[lang] || variant.plain.en : rule.plain[lang] || rule.plain.en, f, lang);
}

/** The English technical detail line. */
export function renderConvertTechnical(f: Finding): string {
  f = withDefaults(f);
  return fill(profileVariant(f)?.technical ?? getConvertRule(f.ruleId).technical, f);
}
