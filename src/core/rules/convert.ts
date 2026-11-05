// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { reasonsText } from '../recognize/layoutReasons';
import type { Finding, Lang, RuleDef } from '../types';
import { applyPlurals } from '../i18n/plural';
import { MAX_PAIRS } from '../convert/pivotLimits';
import { MAX_LINE_RANGES, formatLines } from '../lines';
import { CITE, NVS_CODE_SHAPE } from './citations';
import type { RuleSpec } from './spec';

/*
 * Rules of the converter (/convert, src/core/convert), category 'B', raised only by src/core/convert.
 *
 * These rules are part of the public registry (registry.ts SPECS, so docs/rules.md lists them), and /check never raises one: nothing under
 * src/core/checks raises a CONV id. The converter renders its findings with makeConvertFinding / renderConvertPlain / renderConvertTechnical
 * below, not with renderPlain of /check, because its texts carry the plural tokens ({+count:...}, {+lineCount:...}) and the profile variants.
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
 *   CONV-NA-SKIPPED            count            count = cells with NA (a missing-data token) in a taxon or quantity column of a wide sheet: no record, no lines (info); with rows = yes (a long sheet) count = rows with a taxon and an empty / NA quantity and no other value, lines = those rows (info)
 *   CONV-SAMPLE-PER-ROW        events, occurrences, ratio, shared   a long sheet with sample events for at least 80% of its occurrences (30 or more), at least half of the events sharing station, date and depth with another event: one sample split into an event per taxon row (warning, accept)
 *   CONV-BIOMASS-UNIT-UNCLEAR  count            field = the biomass column, value = the words of its name after the mass unit, lines = the rows written: the unit of the name is not understood in full, so measurementUnit is empty (warning, accept); with none = yes the header holds no unit at all (variant, value empty): count = the values written with no unit
 *   CONV-QUANTITY-REPEATED     columns, differs, count, of   a long sheet whose quantity or weight column is a per-taxon total repeated on the size-class rows of a sample (repeatedTotal.ts): field = the first column, columns = every repeated column, differs = the column that tells the rows apart, count = groups that repeat it, of = groups that have two or more values, value = an example, lines = every row of the groups; optional alternative = a column with a number of its own on each row (variant), disagree = yes (the groups whose rows disagree after the user chose "once"; variant). Blocks
 *   CONV-ROW-COPIES            count, withCopies, withoutCopies   rows that are exact copies of an earlier row (all columns but a per-row identifier), quantity above 1; lines = the copies; blocks until left out and listed (error)
 *   CONV-ROW-COPIES-SPECIMENS  count, withCopies, withoutCopies   identical rows with a count of 1 (a specimen table looks the same): both sums, a warning to accept, never a block
 *   CONV-ROW-COPIES-DROPPED    count, withCopies, withoutCopies   the user left them out and listed them (warning, accept)
 *   CONV-ROW-NOT-UNDERSTOOD    reason, count, rows, what   rows the converter could not place (notWritten.ts: a value with no parameter, a number with no taxon, a ragged row ...): lines = the first rows, examples = 'line: cells'; one per sheet and reason; blocks until the user leaves them out and lists them, or corrects the file (error)
 *   CONV-ROW-LEFT-OUT          reason, count, rows, what   the user's answer to the above: those rows are out of the archive and in the file beside it (info; fromFile = the answer came from the companion file)
 *   CONV-QUANTITY-SAME-IN-SAMPLE groups, records, written, asTotal   rows of one sample and taxon with the same quantity above 1 that differ in anything: written as records / as the species' total (warning, accept)
 *   CONV-QUANTITY-REPEATED-ONCE columns, differs, count, groups   the user chose one occurrence per sample and taxon: lines = the rows not converted (count), groups = the groups taken once; optional lost = per-organism columns not written (warning, accept)
 *   CONV-TAXON-EMPTY-ROW       count            field = the taxon column, lines = rows of a long sheet with a quantity or a weight and an empty taxon cell: not converted, said (warning, accept)
 *   CONV-TIME-HOLDS-DATES      count            field = the time column, count = its cells that hold a full date, while no column is the date: blocks (the events would have no eventDate)
 *   CONV-TIME-SOME-DATES       count            field = the time column, lines = its cells that hold a full date, fewer than half of the filled ones: those dates would be lost (warning, accept)
 *   CONV-QUANTITY-BLANK-KEPT   count            field = the quantity column, lines = rows of a long sheet with a taxon, an empty / NA quantity and a biomass value above zero: written as present with no count (warning, accept)
 *   CONV-ZERO-WITH-BIOMASS     count            field = the quantity column, lines = rows of a long sheet with a quantity of 0 and a biomass value above zero: handled as the zero, the weight is not written (warning, accept)
 *   CONV-ZERO-SKIPPED          count            count = zero cells left out (the list was not declared complete)
 *   CONV-SAMPLE-CONFLICT       what, count      what = the attribute that differs; value = a sample code; lines = its rows; optional organism = the first measured column that differs and could be a value of each organism (never a descriptor of the sample such as Tow)
 *   CONV-NERC-UNKNOWN          what             what = the quantity that has no verified NERC concept
 *   CONV-NERC-CODE-MALFORMED   column, code, collection, length  the header names `SDN:<collection>::<code>` and the code is not of that collection's shape (8 for P01, 4 for P06)
 *   CONV-NERC-UNIT-MISMATCH    column, code, unit  the label of the confirmed concept (code) says per unit mass/volume against the unit of the column
 *   CONV-UNIT-NO-P06           unit             unit = the unit as declared
 *   CONV-DEPTH-UNIT            unit             field = depth column, unit = the unit it states (not metres, no exact factor: blocks)
 *   CONV-DEPTH-CONVERTED       unit, symbol, factor, example   field = depth column, unit = its unit as written (fathom, foot, km), symbol = fm | ft | km, factor = the exact factor to metres, example = the first value and its result (warning, accept; the original is verbatimDepth)
 *   CONV-EFFORT-INVALID        count            field = column, value = an example, lines = rows (a sample size column)
 *   CONV-EFFORT-VALUE-INVALID  reason           value = the typed sample size; reason = not-a-number | not-positive | ambiguous | thousands
 *   CONV-COLUMN-UNNAMED        (none)           field = a column the file's header does not name (IN-HEADER-SHORT) that is mapped as a variable still called by its internal name, or as a taxon whose HEADER is the name
 *   CONV-LONG-UNSUPPORTED      parameterColumn, valueColumn, reason, count, max   a sheet in the long environmental layout (a parameter column and a value column, no taxon and no quantity column) that the converter does not read; sheet = the sheet; reason = one-parameter | too-many (absent: the sheet was not read as a long one for another reason), count = the distinct parameters / the (parameter, unit) pairs
 *   CONV-SHEET-TRANSPOSED      reason           reason = a layoutReasons code (transposed | transposed-taxa): a sheet with the table turned (variables or species in rows), not read; blocks until it is turned or ticked "read as a normal table"
 *   CONV-SHEET-UNITS-ROW       line             line = the line (also in `lines`) of the first row under the header that reads as a row of units and that the reader did not fold into the header (an unknown word or text under some unit): the sheet is not read, blocks until the line is deleted or the user ticks "Read as a normal table"
 *   CONV-LONG-READ             parameterColumn, valueColumn, rows, samples, columns   info: a long environmental sheet was read as one row per sample (core/convert/pivot.ts); rows = rows read, samples = rows made, columns = parameter columns made
 *   CONV-LONG-FLAG-COLUMNS     count, columns   info: quality-flag columns of a long sheet left out
 *   CONV-LONG-FLAG-PARAMETERS  count, names, rows   info: parameters of a long sheet that are quality flags, their rows left out
 *   CONV-LONG-RENAMED          count, names     info: parameter columns whose header collided with another header and got a number
 *   CONV-LONG-DROPPED          count, columns   info: key columns the user marked as describing the measurement, not the sample: removed from the key, values not written
 *   CONV-LONG-KEY-VARIES       count, columns   warning: rows that share every position / identity column differ in these columns (count = such samples), so each difference is read as another sample
 *   CONV-LONG-DUPLICATE        (none)           field = the parameter column (header with unit), lines = the original lines of the repeated rows of ONE sample
 *   CONV-LONG-NO-PARAMETER     count            lines = the original lines that have a value and no parameter name
 *   CONV-NO-TAXON              shape            shape = wide | long; no taxon column is marked (a long sheet with a taxon column and no quantity column is CONV-SPECIES-LIST-NO-COUNTS or CONV-TAXON-NO-QUANTITY)
 *   CONV-TAXON-NO-QUANTITY     (none)           a long sheet with a taxon column, other numbers (measured variables) and no quantity column (blocking; replaces NO-TAXON, QUANTITY-UNDECLARED and NO-OCCURRENCES for that sheet)
 *   CONV-SPECIES-LIST-NO-COUNTS (none)          a long sheet with a taxon column and no quantity column: offers the tick "list of species found" (presence only), else a quantity column (blocking; replaces NO-TAXON, QUANTITY-UNDECLARED and NO-OCCURRENCES for that sheet)
 *   CONV-ENV-ONLY-SHEET        (none)           a sheet with measured variables and no taxon column, no quantity column and no unconfirmed taxon candidate: environmental data only (blocking; replaces NO-TAXON, QUANTITY-UNDECLARED and NO-OCCURRENCES for that sheet)
 *   CONV-PRESENCE-VALUE        (none)           field = the column, value = the values, lines = rows: a cell of a presence-only wide sheet that is no mark (blocking)
 *   CONV-SUMMARY-ROW-SKIPPED   count            value = the labels, lines = rows; a Total word, or a statistics label (Mean, SD, Min, Max, n, ...) in the trailing block with no date or position of its own
 *   CONV-SUMMARY-ROW-KEPT      count            value = the labels, lines = rows: a statistics label in the middle of a sheet, with no date or position of its own, kept as a sample (warning, accept)
 *   CONV-ID-REVISIT            count, by        value = an example ID, lines = the rows; by = date | date, time | date, time, depth: a code repeated at one station on different visits got the visit in its ID (warning, accept)
 *   CONV-REPLICATE-MISSING     count            field = the replicate column, lines = the rows with no value in it (blocking; the rows are not converted)
 *   CONV-BIOMASS-KIND-UNSET    count, columns   columns = the biomass / weight columns whose kind (wet, dry, ash-free dry mass) is not chosen; lines = rows: written as eMoF rows with no measurementTypeID (warning, accept)
 *   CONV-EML-MISSING           fields           fields = codes of what the dataset description lacks (title, abstract, creator, contact name, contact email, institution code, dataset name)
 *   CONV-LICENCE-UNSET         (none)           no licence chosen
 *   CONV-BASIS-UNSET           (none)           no basisOfRecord chosen
 *   CONV-EMOF-ORPHAN           count, kind      kind = event | occurrence; value = an example id; file = the eMoF table
 *   CONV-EMOF-EVENT-MISMATCH   count            value = an example occurrenceID
 *   CONV-EMOF-VALUE-EMPTY      count            lines = rows of the eMoF table
 *   CONV-EMOF-TYPE-EMPTY       count            lines = rows of the eMoF table
 *   CONV-REPLICATE-EVENTS      column, count    field = the replicate column, count = the replicate events it makes (info)
 *   CONV-TAXON-ATTRIBUTE-IGNORED count, columns  columns of a long sheet whose value is the same for every row of one taxon (a code, an id, a serial number, a trophic level): ignored, not written (info)
 *   CONV-VALUE-PER-OCCURRENCE  count, columns   measured-variable columns written on the occurrence of each row of a long sheet (values that differ inside a sample like those of single organisms): shown, never blocks (info)
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
const DWC_DEPTH = {
  label: 'Darwin Core term list (dwc.tdwg.org/terms: minimumDepthInMeters, maximumDepthInMeters, verbatimDepth)',
  url: 'https://dwc.tdwg.org/terms/#dwc:minimumDepthInMeters',
  locator: '"The lesser depth of a range of depth below the local surface, in meters." / verbatimDepth: "The original description of the depth below the local surface."',
};
const OBIS_OCCURRENCE = {
  label: 'OBIS Manual, "How to format Occurrence tables" (manual.obis.org/format_occurrence.html; read 2026-10-26)',
  url: 'https://manual.obis.org/format_occurrence.html',
  locator: '"(remember that all OBIS data have at least one occurrence record associated, regardless of what organization structure you have chosen)"',
};

const OBIS_OCCURRENCE_STATUS = {
  label: 'OBIS Manual, "How to format Occurrence tables" (manual.obis.org/format_occurrence.html; read 2026-10-29): occurrenceStatus is required, a quantity is not',
  url: 'https://manual.obis.org/format_occurrence.html',
  locator: '"These required data fields include the following eight terms: occurrenceID, eventID, ..., occurrenceStatus, basisOfRecord, scientificName, ..." (organismQuantity and organismQuantityType are not among them); "Add and fill basisOfRecord and occurrenceStatus fields"',
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
      pl: `W kolumnie „{field}” wartość ma tabulator albo podział wiersza {+lineCount:w wierszu|w wierszach|w wierszach} {lines} (razem: {count}), np. „{value}”. Pliki archiwum są rozdzielane tabulatorami, więc taka wartość je rozbije. Zamień znak w arkuszu na spację.`,
      en: `Column "{field}" has a tab or a line break inside a value in {+lineCount:line|lines} {lines} ({count} in all), e.g. "{value}". The archive files are tab-separated, so such a value would break them. Replace the character with a space in the sheet.`,
      de: `Die Spalte „{field}“ enthält in {+lineCount:der Zeile|den Zeilen} {lines} einen Tabulator oder Zeilenumbruch im Wert (insgesamt {count}), z. B. „{value}“. Die Archivdateien sind tabulatorgetrennt, ein solcher Wert würde sie zerstören. Ersetzen Sie das Zeichen im Blatt durch ein Leerzeichen.`,
      fr: `La colonne « {field} » contient une tabulation ou un saut de ligne dans une valeur {+lineCount:à la ligne|aux lignes} {lines} ({count} au total), p. ex. « {value} ». Les fichiers de l'archive sont séparés par des tabulations : une telle valeur les casserait. Remplacez le caractère par une espace dans la feuille.`,
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
    id: 'CONV-QUANTITY-BLANK-KEPT',
    category: 'B',
    severity: 'warning',
    params: ['count'],
    plain: {
      pl: `{count} {+count:wiersz ma|wiersze mają|wierszy ma} wagę, ale pustą lub „NA” ilość ({+lineCount:wiersz|wiersze|wierszy} {lines}). Zapisano {+count:go|je|je} jako obecność bez liczebności; liczby nie wymyślono. Jeśli „NA” znaczy „nie analizowano”, takson nie musiał być obecny: popraw te komórki przed eksportem.`,
      en: `{count} {+count:row has|rows have} a weight but a blank or "NA" quantity ({+lineCount:line|lines} {lines}). {+count:It is|They are} written as present with no count; no number is invented. If "NA" means "not analysed", the taxon is not known to be present: correct those cells before you export.`,
      de: `{count} {+count:Zeile hat|Zeilen haben} ein Gewicht, aber eine leere oder „NA“-Menge ({+lineCount:Zeile|Zeilen} {lines}). Sie {+count:wird|werden} als vorhanden ohne Anzahl geschrieben; keine Zahl wird erfunden. Bedeutet „NA“ „nicht analysiert“, ist das Taxon nicht sicher vorhanden: korrigieren Sie die Zellen vor dem Export.`,
      fr: `{count} {+count:ligne a|lignes ont} un poids mais une quantité vide ou « NA » ({+lineCount:ligne|lignes} {lines}). Écrit comme présence sans effectif ; aucun nombre n'est inventé. Si « NA » signifie « non analysé », le taxon n'est pas forcément présent : corrigez ces cellules avant l'export.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {count} row(s) of a long sheet have a taxon, no quantity (empty or a missing-data token) and a biomass value above zero. Each is written as an occurrence with occurrenceStatus present, no individualCount or organismQuantity, and its biomass measurement: the weight shows the taxon was in the sample, the missing count is not made up. A measured variable is not read as evidence, because it is written once per sample.`,
    citations: [OBIS_OCCURRENCE_STATUS],
  },
  {
    id: 'CONV-BIOMASS-UNIT-UNCLEAR',
    category: 'B',
    severity: 'warning',
    params: ['count'],
    plain: {
      pl: `Nazwa kolumny wagi „{field}” zawiera jednostkę masy, ale reszta („{value}”) nie jest zrozumiała, więc jednostka pozostaje pusta ({+lineCount:wiersz|wiersze|wierszy} {lines}). Wpisz jednostkę w nawiasie w nagłówku, np. [kg/km2].`,
      en: `The name of weight column "{field}" holds a mass unit, but the rest ("{value}") is not understood, so the unit is left empty ({+lineCount:line|lines} {lines}). Put the unit in brackets in the header, e.g. [kg/km2].`,
      de: `Der Name der Gewichtsspalte „{field}“ enthält eine Masseneinheit, der Rest („{value}“) wird aber nicht verstanden, die Einheit bleibt daher leer ({+lineCount:Zeile|Zeilen} {lines}). Schreiben Sie die Einheit in Klammern in den Spaltenkopf, z. B. [kg/km2].`,
      fr: `Le nom de la colonne de poids « {field} » contient une unité de masse, mais le reste (« {value} ») n'est pas compris : l'unité reste vide ({+lineCount:ligne|lignes} {lines}). Mettez l'unité entre crochets dans l'en-tête, p. ex. [kg/km2].`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {count} biomass value(s) of a column whose name holds a mass unit followed by words that are not a per-area / per-volume part or a kind of mass ("{value}"). A partial unit would change the meaning of the number, so measurementUnit is left empty.`,
  },
  {
    id: 'CONV-QUANTITY-REPEATED',
    category: 'B',
    severity: 'error',
    params: ['columns', 'differs', 'count', 'of'],
    plain: {
      pl: `„{columns}” to chyba suma dla gatunku w próbce, powtórzona w wierszach klas wielkości ({count} z {of} grup, różnice w „{differs}”; {+lineCount:wiersz|wiersze|wierszy} {lines}). Policzona tak jak jest, byłaby zawyżona. Zapisz jedno występowanie na próbkę i takson (przycisk) albo wskaż jako ilość kolumnę z liczbą każdej klasy.`,
      en: `"{columns}" looks like a total for the taxon in a sample, repeated on the size-class rows ({count} of {of} groups, differences in "{differs}"; {+lineCount:line|lines} {lines}). Counted as it is, it would be inflated. Write one occurrence per sample and taxon (button), or mark a column with each class's number as the quantity.`,
      de: `„{columns}“ ist wohl eine Summe je Taxon und Probe, in Größenklassenzeilen wiederholt ({count} von {of} Gruppen, Unterschied in „{differs}“; {+lineCount:Zeile|Zeilen} {lines}). So gezählt: überhöht. Schreiben Sie ein Vorkommen je Probe und Taxon (Schaltfläche) oder ordnen Sie eine Spalte mit der Zahl je Klasse als Menge zu.`,
      fr: `« {columns} » ressemble à un total par taxon et échantillon, répété sur les lignes de classes ({count} groupes sur {of}, écart dans « {differs} » ; {+lineCount:ligne|lignes} {lines}). Compté ainsi : gonflé. Écrivez une occurrence par échantillon et taxon (bouton) ou indiquez comme quantité une colonne avec le nombre par classe.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: the value of {columns} is the same on every row of {count} of {of} groups of rows that share sample, taxon, life stage and qualifier and differ in "{differs}" (a repeated per-taxon total: at least 4 groups, at least 80 % of the groups that have two or more values above zero, and not one value alone; a count of 1 is not counted). The sum written from such a sheet would be the total times the number of size classes. The advice for a duplicate identifier (an occurrenceID or a life stage) is withheld: it would write those numbers. Blocks until the user either writes one occurrence per sample and taxon (the choice is kept in the companion file) or marks a per-size-class column as the quantity.`,
  },
  {
    id: 'CONV-QUANTITY-REPEATED-ONCE',
    category: 'B',
    severity: 'warning',
    params: ['columns', 'differs', 'count', 'groups', 'lost'],
    plain: {
      pl: `Jak wybrano, suma w „{columns}” jest zapisana raz na próbkę i takson ({groups} {+groups:grupa|grupy|grup}); pominięto {count} {+count:powtórzony wiersz|powtórzone wiersze|powtórzonych wierszy} ({+lineCount:wiersz|wiersze|wierszy} {lines}). Przy tym występowaniu nie zapisano: {lost} (różnią się między wierszami). Sprawdź sumę.`,
      en: `As you chose, the total in "{columns}" is written once per sample and taxon ({groups} {+groups:group|groups}); {count} repeated {+count:row was|rows were} left out ({+lineCount:line|lines} {lines}). Not written on that occurrence, as the rows differ in them: {lost}. Check the sum.`,
      de: `Wie gewählt, wird die Summe in „{columns}“ je Probe und Taxon einmal geschrieben ({groups} {+groups:Gruppe|Gruppen}); {count} wiederholte {+count:Zeile wurde|Zeilen wurden} ausgelassen ({+lineCount:Zeile|Zeilen} {lines}). Am Vorkommen nicht geschrieben, da die Zeilen darin abweichen: {lost}. Prüfen Sie die Summe.`,
      fr: `Comme choisi, le total de « {columns} » est écrit une fois par échantillon et taxon ({groups} {+groups:groupe|groupes}) ; {count} {+count:ligne répétée ignorée|lignes répétées ignorées} ({+lineCount:ligne|lignes} {lines}). Non écrit sur l'occurrence, les lignes y différant : {lost}. Vérifiez la somme.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: the user chose to write one occurrence per sample and taxon where {columns} repeats a total on size-class rows ({groups} groups); {count} later row(s) of those groups, whose repeated values equal those of the first row of their group, are not converted. The rows differ in "{differs}" and in {lost}: nothing per-row is written from the first row, because one occurrence would hold several values of them. A group below the threshold, or whose values differ, stays as separate rows. Rows whose other weight or count column has numbers of its own are not taken once (CONV-QUANTITY-REPEATED).`,
  },
  {
    id: 'CONV-ROW-COPIES',
    category: 'B',
    severity: 'error',
    params: ['count', 'withCopies', 'withoutCopies'],
    plain: {
      pl: `{count} {+count:wiersz jest dokładną kopią|wiersze są dokładnymi kopiami|wierszy jest dokładnymi kopiami} innego wiersza ({+lineCount:wiersz|wiersze|wierszy} {lines}). Ilość: {withCopies} z kopiami, {withoutCopies} bez nich. Pomiń kopie i wypisz je w pliku obok archiwum (przycisk) albo popraw arkusz.`,
      en: `{count} {+count:row is an exact copy|rows are exact copies} of another row ({+lineCount:line|lines} {lines}). The quantity adds up to {withCopies} with them and {withoutCopies} without them. Leave the copies out and list them in a file beside the archive (button), or correct the sheet.`,
      de: `{count} {+count:Zeile ist eine exakte Kopie|Zeilen sind exakte Kopien} einer anderen Zeile ({+lineCount:Zeile|Zeilen} {lines}; ohne Zeilennummer). Die Menge ergibt {withCopies} mit und {withoutCopies} ohne sie. Kopien auslassen und in einer Datei neben dem Archiv auflisten (Schaltfläche) oder das Blatt korrigieren.`,
      fr: `{count} {+count:ligne est une copie exacte|lignes sont des copies exactes} d'une autre ligne ({+lineCount:ligne|lignes} {lines}). La quantité fait {withCopies} avec elles et {withoutCopies} sans. Écartez les copies et listez-les dans un fichier à côté de l'archive (bouton), ou corrigez la feuille.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {count} row(s) are identical to an earlier row in every column but a per-row identifier (an occurrenceID or a column that differs on nearly every row), with a quantity above 1. The sum of the quantity is {withCopies} with them and {withoutCopies} without them. The advice to tell the rows apart is withheld: it would write each copy. Blocks until the user leaves the copies out and lists them (kept in the companion file with the number of copies) or corrects the sheet.`,
  },
  {
    id: 'CONV-ROW-COPIES-DROPPED',
    category: 'B',
    severity: 'warning',
    params: ['count', 'withCopies', 'withoutCopies'],
    plain: {
      pl: `Zgodnie z wyborem pominięto {count} {+count:dokładną kopię|dokładne kopie|dokładnych kopii} wierszy ({+lineCount:wiersz|wiersze|wierszy} {lines}). Sprawdź, że to były kopie.`,
      en: `As you chose, {count} exact {+count:copy|copies} of rows {+count:was|were} left out ({+lineCount:line|lines} {lines}). Check that they were copies.`,
      de: `Wie gewählt, {+count:wurde|wurden} {count} exakte {+count:Kopie|Kopien} von Zeilen ausgelassen ({+lineCount:Zeile|Zeilen} {lines}). Prüfen Sie, ob es Kopien waren.`,
      fr: `Comme choisi, {count} {+count:copie exacte|copies exactes} de lignes {+count:a été écartée|ont été écartées} ({+lineCount:ligne|lignes} {lines}). Vérifiez que c'étaient des copies.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: the user chose to leave out the rows that are exact copies of an earlier row (they are listed in the file beside the archive) (every column but a per-row identifier); {count} row(s) are not converted (the sum of the quantity of the sheet was {withCopies} with them and {withoutCopies} without them, before any other rule skips a row).`,
  },
  {
    id: 'CONV-ROW-COPIES-SPECIMENS',
    category: 'B',
    severity: 'warning',
    params: ['count', 'withCopies', 'withoutCopies'],
    plain: {
      pl: `{count} {+count:wiersz jest identyczny|wiersze są identyczne|wierszy jest identycznych} z innym, z liczebnością 1 ({+lineCount:wiersz|wiersze|wierszy} {lines}). Jako osobne osobniki dają {withCopies}; jeśli to kopie, byłoby {withoutCopies}. Tabela osobników wygląda tak samo, więc nic nie blokuje: sprawdź, co to jest.`,
      en: `{count} {+count:row is|rows are} identical to another row, with a count of 1 ({+lineCount:line|lines} {lines}). As separate specimens the quantity is {withCopies}; if they are copies it would be {withoutCopies}. A table of specimens looks exactly like this, so nothing is blocked: check which it is.`,
      de: `{count} {+count:Zeile ist|Zeilen sind} mit einer anderen identisch, mit der Anzahl 1 ({+lineCount:Zeile|Zeilen} {lines}). Als getrennte Individuen ergibt das {withCopies}; sind es Kopien, wären es {withoutCopies}. Eine Tabelle von Individuen sieht genauso aus, daher wird nichts blockiert: prüfen Sie, was es ist.`,
      fr: `{count} {+count:ligne est identique|lignes sont identiques} à une autre, avec un effectif de 1 ({+lineCount:ligne|lignes} {lines}). Comme individus distincts la quantité fait {withCopies} ; si ce sont des copies, ce serait {withoutCopies}. Un tableau d'individus a exactement cet aspect : rien n'est bloqué, vérifiez ce que c'est.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {count} row(s) are identical to an earlier row in every column but a per-row identifier, with a count of 1. Written as separate records the sum of the quantity is {withCopies}; if they are copies of one record it would be {withoutCopies}. A specimen table looks the same, so this is a warning to accept and never a block.`,
  },
  {
    id: 'CONV-ROW-NOT-UNDERSTOOD',
    category: 'B',
    severity: 'error',
    params: ['reason', 'count', 'rows', 'what'],
    plain: {
      pl: `{count} {+count:wiersz|wiersze|wierszy} {what} ({+lineCount:wiersz|wiersze|wierszy} {lines}). Nic z tego nie trafiło do archiwum i nic nie jest usuwane: zostaje w Twoim pliku. Pomiń {+count:go|je|je} i wypisz w pliku obok archiwum (przycisk) albo popraw plik. Eksport czeka na Twoją decyzję.`,
      en: `{count} {+count:row|rows} {what} ({+lineCount:line|lines} {lines}). Nothing of this is in the archive and nothing is deleted: it stays in your file. Leave {+count:it|them} out and list {+count:it|them} in a file beside the archive (button), or correct your file. The export waits for your decision.`,
      de: `{count} {+count:Zeile|Zeilen} {what} ({+lineCount:Zeile|Zeilen} {lines}). Nichts davon steht im Archiv und nichts wird gelöscht: es bleibt in Ihrer Datei. Lassen Sie sie aus und führen Sie sie in einer Datei neben dem Archiv auf (Schaltfläche) oder korrigieren Sie Ihre Datei. Der Export wartet auf Ihre Entscheidung.`,
      fr: `{count} {+count:ligne|lignes} {what} ({+lineCount:ligne|lignes} {lines}). Rien de cela n'est dans l'archive et rien n'est supprimé : tout reste dans votre fichier. Écartez-{+count:la|les} et listez-{+count:la|les} dans un fichier à côté de l'archive (bouton), ou corrigez votre fichier. L'export attend votre décision.`,
    },
    plainIf: [
      {
        param: 'examples',
        plain: {
          pl: `Na przykład (wiersz: komórki): {examples}.`,
          en: `For example (line: cells): {examples}.`,
          de: `Zum Beispiel (Zeile: Zellen): {examples}.`,
          fr: `Par exemple (ligne : cellules) : {examples}.`,
        },
      },
    ],
    technical: `{file}, {sheet}:{lines}: {count} of the {rows} row(s) of the sheet have no record and the reason is "{reason}" (ledger.ts): the rows are {what}. This is one of the reasons that mean the converter could not place what the row holds (notWritten.ts REASON_KIND: blocks). One finding per sheet and reason. It blocks until the user answers "leave these rows out and list them" (kept in the companion file with the count of the rows and of the sheet) or corrects the file; never prefilled, never a default. Every row not written is in the file beside the archive with its physical line, its reason and all its cells; nothing is deleted from the file the user gave.`,
  },
  {
    id: 'CONV-ROW-LEFT-OUT',
    category: 'B',
    severity: 'info',
    params: ['reason', 'count', 'rows', 'what'],
    plain: {
      pl: `Zgodnie z Twoim wyborem {count} {+count:wiersz|wiersze|wierszy} {what} ({+lineCount:wiersz|wiersze|wierszy} {lines}) pominięto w archiwum i wypisano w pliku obok niego. Nic nie zostało usunięte z Twojego pliku.`,
      en: `As you chose, {count} {+count:row|rows} {what} ({+lineCount:line|lines} {lines}) {+count:was|were} left out of the archive and {+count:is|are} listed in the file beside it. Nothing was deleted from your file.`,
      de: `Wie gewählt, {+count:wurde|wurden} {count} {+count:Zeile|Zeilen} {what} ({+lineCount:Zeile|Zeilen} {lines}) im Archiv ausgelassen und in der Datei daneben aufgeführt. Aus Ihrer Datei wurde nichts gelöscht.`,
      fr: `Comme choisi, {count} {+count:ligne|lignes} {what} ({+lineCount:ligne|lignes} {lines}) {+count:a été écartée|ont été écartées} de l'archive et {+count:est listée|sont listées} dans le fichier à côté. Rien n'a été supprimé de votre fichier.`,
    },
    plainIf: [
      {
        param: 'fromFile',
        plain: {
          pl: `Ten wybór pochodzi z pliku towarzyszącego; obowiązuje, bo arkusz ma te same {rows} wierszy i tyle samo wierszy tego rodzaju.`,
          en: `This answer was read from the companion file; it holds because the sheet has the same {rows} rows and the same number of rows of this kind.`,
          de: `Diese Antwort stammt aus der Begleitdatei; sie gilt, weil das Blatt dieselben {rows} Zeilen und gleich viele Zeilen dieser Art hat.`,
          fr: `Cette réponse vient du fichier d'accompagnement ; elle vaut parce que la feuille a les mêmes {rows} lignes et autant de lignes de ce genre.`,
        },
      },
    ],
    technical: `{file}, {sheet}:{lines}: the user (or a companion file whose count of rows and of the sheet is the same today) left {count} row(s) with reason "{reason}" out of the archive: the rows are {what}. They are listed in the file beside it. Information only; the question is asked again (button) or when the sheet changes (rows in the sheet: {rows}).`,
  },
  {
    id: 'CONV-QUANTITY-SAME-IN-SAMPLE',
    category: 'B',
    severity: 'warning',
    params: ['groups', 'records', 'written', 'asTotal'],
    plain: {
      pl: `{records} {+records:wiersz|wiersze|wierszy} tej samej próbki i tego samego gatunku ({groups} {+groups:grupa|grupy|grup}) ma tę samą ilość ({+lineCount:wiersz|wiersze|wierszy} {lines}). Zapisane jako {records} {+records:rekord|rekordy|rekordów} dają {written}; jeśli to suma gatunku, byłoby {asTotal}. Sprawdź to.`,
      en: `{records} rows of the same sample and taxon ({groups} {+groups:group|groups}) carry the same quantity ({+lineCount:line|lines} {lines}). Written as {records} records, the total is {written}; if the value is the species' total, it would be {asTotal}. Check which it is.`,
      de: `{records} Zeilen derselben Probe und desselben Taxons ({groups} {+groups:Gruppe|Gruppen}) tragen dieselbe Menge ({+lineCount:Zeile|Zeilen} {lines}). Als {records} Datensätze geschrieben ergibt das {written}; ist der Wert die Summe der Art, wären es {asTotal}. Prüfen Sie, was es ist.`,
      fr: `{records} lignes du même échantillon et du même taxon ({groups} {+groups:groupe|groupes}) portent la même quantité ({+lineCount:ligne|lignes} {lines}). Écrites comme {records} enregistrements, elles font {written} ; si la valeur est le total de l'espèce, ce serait {asTotal}. Vérifiez ce que c'est.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {records} rows in {groups} group(s) of one sample and taxon, which differ in some other column (a blank size, a stage, a sex, a size that differs on every row), carry the same quantity. Written as separate records the sum is {written}; if the value is a per-taxon total repeated on each row it would be {asTotal}. Shown whatever the number of groups or their share, and never with the advice to tell the rows apart by an occurrenceID or a life stage (it would write the first sum). The block CONV-QUANTITY-REPEATED stands for the sheet when the repeat is the rule.`,
  },
  {
    id: 'CONV-TAXON-EMPTY-ROW',
    category: 'B',
    severity: 'warning',
    params: ['count'],
    plain: {
      pl: `{count} {+count:wiersz ma|wiersze mają|wierszy ma} liczbę lub wagę, ale pustą nazwę taksonu w „{field}” ({+lineCount:wiersz|wiersze|wierszy} {lines}). Nie ma do czego jej przypisać, więc nie jest przekształcana. Jeśli znasz nazwę taksonu, wpisz ją w arkuszu; wiersze są wypisane w pliku obok archiwum.`,
      en: `{count} {+count:row has|rows have} a number or a weight but an empty taxon name in "{field}" ({+lineCount:line|lines} {lines}). There is nothing to attach it to, so {+count:it is|they are} not converted. If you know the taxon name, type it in the sheet; the rows are listed in the file beside the archive.`,
      de: `{count} {+count:Zeile hat|Zeilen haben} eine Zahl oder ein Gewicht, aber keinen Taxonnamen in „{field}“ ({+lineCount:Zeile|Zeilen} {lines}). Es gibt nichts, dem sie zugeordnet werden kann, daher wird nichts umgewandelt. Kennen Sie den Taxonnamen, tragen Sie ihn im Blatt ein; die Zeilen stehen in der Datei neben dem Archiv.`,
      fr: `{count} {+count:ligne a|lignes ont} un nombre ou un poids mais pas de nom de taxon dans « {field} » ({+lineCount:ligne|lignes} {lines}). Rien n'y est rattaché : non converti. Si vous connaissez le nom du taxon, saisissez-le dans la feuille ; les lignes sont listées dans le fichier à côté de l'archive.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {count} row(s) of a long sheet have a quantity or a biomass value and no taxon name; no occurrence can be written for them and they are not converted.`,
  },
  {
    id: 'CONV-TIME-HOLDS-DATES',
    category: 'B',
    severity: 'error',
    params: ['count'],
    plain: {
      pl: `Kolumna „{field}” jest czytana jako godzina, ale {count} {+count:komórka zawiera|komórki zawierają|komórek zawiera} pełną datę, a żadna kolumna nie jest datą. Zdarzenia nie miałyby eventDate i data z pliku przepadłaby. Wybierz dla niej znaczenie „Data i godzina”.`,
      en: `Column "{field}" is read as a time of day, but {count} {+count:cell holds|cells hold} a full date, and no column is the date. The events would have no eventDate and the date in the file would be lost. Give the column the meaning "Date and time".`,
      de: `Die Spalte „{field}“ wird als Uhrzeit gelesen, aber {count} {+count:Zelle enthält|Zellen enthalten} ein volles Datum, und keine Spalte ist das Datum. Die Ereignisse hätten kein eventDate, das Datum der Datei ginge verloren. Geben Sie der Spalte die Bedeutung „Datum und Uhrzeit“.`,
      fr: `La colonne « {field} » est lue comme une heure, mais {count} {+count:cellule contient|cellules contiennent} une date complète, et aucune colonne n'est la date. Les événements n'auraient pas d'eventDate et la date du fichier serait perdue. Donnez à la colonne le sens « Date et heure ».`,
    },
    technical: `{file}, {sheet} field {field}: the sheet has a time column and no date column, and {count} cell(s) of the time column hold a date (YYYY-MM-DD...). No eventDate would be written. A date that is in the file is never dropped silently, so the export is blocked until the column is read as a date and time.`,
  },
  {
    id: 'CONV-TIME-SOME-DATES',
    category: 'B',
    severity: 'warning',
    params: ['count'],
    plain: {
      pl: `W kolumnie godziny „{field}” {count} {+count:komórka zawiera|komórki zawierają|komórek zawiera} pełną datę ({+lineCount:wiersz|wiersze|wierszy} {lines}), a żadna kolumna nie jest datą. Te daty nie trafią do eventDate. Jeśli to daty zdarzeń, nadaj kolumnie znaczenie „Data i godzina”.`,
      en: `In time column "{field}", {count} {+count:cell holds|cells hold} a full date ({+lineCount:line|lines} {lines}), and no column is the date. These dates will not reach eventDate. If they are the dates of the events, give the column the meaning "Date and time".`,
      de: `In der Uhrzeitspalte „{field}“ {+count:enthält|enthalten} {count} {+count:Zelle|Zellen} ein volles Datum ({+lineCount:Zeile|Zeilen} {lines}), und keine Spalte ist das Datum. Diese Daten gelangen nicht in eventDate. Sind es die Ereignisdaten, geben Sie der Spalte die Bedeutung „Datum und Uhrzeit“.`,
      fr: `Dans la colonne d'heure « {field} », {count} {+count:cellule contient|cellules contiennent} une date complète ({+lineCount:ligne|lignes} {lines}), et aucune colonne n'est la date. Ces dates n'iront pas dans eventDate. Si ce sont les dates des événements, donnez à la colonne le sens « Date et heure ».`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {count} cell(s) of the time column hold a date the date parser reads (fewer than half of the filled cells: with half or more the export is blocked, CONV-TIME-HOLDS-DATES). Placeholder dates of a spreadsheet or an epoch (1899-12-30, 1970-01-01) are times and are not counted.`,
  },
  {
    id: 'CONV-ZERO-WITH-BIOMASS',
    category: 'B',
    severity: 'warning',
    params: ['count'],
    plain: {
      pl: `{count} {+count:wiersz ma|wiersze mają|wierszy ma} ilość 0 i wagę większą od zera ({+lineCount:wiersz|wiersze|wierszy} {lines}). To się wyklucza. Pominięto je: ani obecne, ani nieobecne (także przy pełnej liście gatunków). Sprawdź, która wartość jest błędna.`,
      en: `{count} {+count:row has|rows have} a quantity of 0 and a weight above zero ({+lineCount:line|lines} {lines}). These contradict each other. Left out: neither present nor absent (also with the full species list ticked). Check which value is wrong.`,
      de: `{count} {+count:Zeile hat|Zeilen haben} die Menge 0 und ein Gewicht über null ({+lineCount:Zeile|Zeilen} {lines}). Das widerspricht sich. Ausgelassen: weder vorhanden noch abwesend (auch bei vollständiger Artenliste). Prüfen Sie, welcher Wert falsch ist.`,
      fr: `{count} {+count:ligne a|lignes ont} une quantité de 0 et un poids supérieur à zéro ({+lineCount:ligne|lignes} {lines}). C'est contradictoire. Omis : ni présence ni absence (même avec la liste complète). Vérifiez quelle valeur est fausse.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {count} row(s) of a long sheet have a quantity of 0 and a biomass value above zero. The row is left out whatever the full-list tick says: occurrenceStatus absent for a contradicted zero would be a false absence, and present would invent a count. Its biomass is not written; neither value is kept silently.`,
  },
  {
    id: 'CONV-SAMPLE-PER-ROW',
    category: 'B',
    severity: 'warning',
    params: ['events', 'occurrences', 'ratio', 'shared'],
    plain: {
      pl: `Arkusz „{sheet}”: {events} {+events:zdarzenie próbki|zdarzenia próbek|zdarzeń próbek} na {occurrences} {+occurrences:wystąpienie|wystąpienia|wystąpień} ({ratio}), prawie po wierszu; {shared} dzieli stację, datę i głębokość. Jeśli to prawdziwe powtórzenia, zaakceptuj. Jeśli próbkę rozbito na wiersze, użyj kodu próbki.`,
      en: `Sheet "{sheet}": {events} sample {+events:event|events} for {occurrences} {+occurrences:occurrence|occurrences} ({ratio}), almost one row each; {shared} share station, date and depth. If these are real replicates, accept this. If one sample was cut into rows (a different code on each), use a code that names the sample.`,
      de: `Das Blatt „{sheet}“: {events} {+events:Probenereignis|Probenereignisse} für {occurrences} Vorkommen ({ratio}), fast je eine Zeile; {shared} teilen Station, Datum und Tiefe. Sind es echte Replikate, bestätigen Sie das. Wurde eine Probe in Zeilen zerlegt, verwenden Sie einen Code, der sie benennt.`,
      fr: `Feuille « {sheet} » : {events} {+events:événement|événements} pour {occurrences} {+occurrences:occurrence|occurrences} ({ratio}), presque une ligne chacun ; {shared} partagent station, date et profondeur. Vrais réplicats ? Acceptez. Échantillon coupé en lignes (un code par ligne) ? Utilisez un code qui le nomme.`,
    },
    technical: `{file}, {sheet}: {events} sample events for {occurrences} occurrences of a long sheet ({ratio}; at least 30 occurrences and events of at least 80% of them), and {shared} of the events share station, date and depth with another event (at least half do). A sample is one event with its taxa as occurrences; one event per taxon row means the sample codes name rows. Checked on the output, whoever wrote the codes.`,
    citations: [OBIS_OCCURRENCE],
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
      pl: `Wiersze próbki „{value}” ({+lineCount:wiersz|wiersze|wierszy} {lines}) różnią się: {what}. Próbka to jedno zdarzenie, więc te wartości muszą być takie same we wszystkich jej wierszach.`,
      en: `The rows of sample "{value}" ({+lineCount:line|lines} {lines}) differ in: {what}. A sample is one event, so these values must be the same in all its rows.`,
      de: `Die Zeilen der Probe „{value}“ ({+lineCount:Zeile|Zeilen} {lines}) unterscheiden sich in: {what}. Eine Probe ist ein Ereignis, daher müssen diese Werte in allen ihren Zeilen gleich sein.`,
      fr: `Les lignes de l'échantillon « {value} » ({+lineCount:ligne|lignes} {lines}) diffèrent par : {what}. Un échantillon est un seul événement : ces valeurs doivent être identiques sur toutes ses lignes.`,
    },
    plainIf: [
      {
        param: 'organism',
        plain: {
          pl: `Jeśli kolumna „{organism}” to wartość każdego osobnika, zaznacz przy niej „każdego osobnika”.`,
          en: `If column "{organism}" is a value of each organism, tick "of each organism" on it.`,
          de: `Ist die Spalte „{organism}“ ein Wert je Organismus, haken Sie bei ihr „jedes Organismus“ an.`,
          fr: `Si la colonne « {organism} » est une valeur de chaque organisme, cochez « de chaque organisme » sur elle.`,
        },
      },
    ],
    technical: `{file}, {sheet}:{lines}: rows of sample "{value}" differ in {what} ({count} sample(s) affected). The first row is not silently preferred.`,
  },
  {
    id: 'CONV-REPLICATE-EVENTS',
    category: 'B',
    severity: 'info',
    params: ['column', 'count'],
    plain: {
      pl: `Kolumna „{column}” jest odczytana jako numer replikatu: {count} {+count:zdarzenie|zdarzenia|zdarzeń} replikatu {+count:powstaje|powstają|powstaje} pod próbami. Jeśli to nie replikaty, zmień jej znaczenie.`,
      en: `Column "{column}" is read as the replicate number: it makes {count} replicate {+count:event|events} under the samples. If these are not replicates, change its meaning.`,
      de: `Die Spalte „{column}“ wird als Replikatnummer gelesen: Sie ergibt {count} Replikat-{+count:Ereignis|Ereignisse} unter den Proben. Sind es keine Replikate, ändern Sie ihre Bedeutung.`,
      fr: `La colonne « {column} » est lue comme le numéro de réplicat : elle crée {count} {+count:événement|événements} de réplicat sous les échantillons. Si ce ne sont pas des réplicats, changez son sens.`,
    },
    technical: `{file}, {sheet} field {field}: the replicate column "{column}" makes {count} replicate event(s) under the sample events.`,
  },
  {
    id: 'CONV-TAXON-ATTRIBUTE-IGNORED',
    category: 'B',
    severity: 'info',
    params: ['count', 'columns'],
    plain: {
      pl: `{count} {+count:kolumna ma|kolumny mają|kolumn ma} dla każdego taksonu zawsze tę samą wartość, więc to cechy taksonu (np. kod gatunku), a nie pomiary, i nie zostały zapisane: {columns}. Jeśli któraś jest pomiarem, nadaj jej znaczenie.`,
      en: `{count} {+count:column has|columns have} the same value for every row of one taxon, so {+count:it is an attribute|they are attributes} of the taxon (a species code, say), not {+count:a measurement|measurements}, and {+count:was|were} not written: {columns}. If one is a measurement, give it a meaning.`,
      de: `{count} {+count:Spalte hat|Spalten haben} für jede Zeile eines Taxons denselben Wert, {+count:ist also eine Eigenschaft|sind also Eigenschaften} des Taxons (z. B. Artcode), {+count:keine Messung|keine Messungen}, und {+count:wurde|wurden} nicht geschrieben: {columns}. Ist eine davon eine Messung, geben Sie ihr eine Bedeutung.`,
      fr: `{count} {+count:colonne a|colonnes ont} la même valeur pour chaque ligne d'un taxon : {+count:un attribut du taxon|des attributs du taxon} (un code d'espèce, par ex.), {+count:pas une mesure|pas des mesures}, donc non {+count:écrit|écrits} : {columns}. Si l'une est une mesure, donnez-lui un sens.`,
    },
    technical: `{file}, {sheet}: {count} column(s) ignored because their value is a function of the taxon column (name says code, id, tsn, key, serial or trophic, or most taxa are listed more than once; no unit): {columns}.`,
  },
  {
    id: 'CONV-VALUE-PER-OCCURRENCE',
    category: 'B',
    severity: 'info',
    params: ['count', 'columns'],
    plain: {
      pl: `{count} {+count:kolumna jest zapisana|kolumny są zapisane|kolumn jest zapisanych} przy wystąpieniach wierszy, a nie przy próbce: {columns}. Ich wartości różnią się w próbce jak wartości pojedynczych osobników. Jeśli to dwie próbki pod jednym kodem, odznacz „każdego osobnika” przy kolumnie i popraw kod.`,
      en: `{count} {+count:column is|columns are} written on the occurrences of the rows, not on the sample: {columns}. Their values differ inside a sample like the values of single organisms. If the rows are really two samples under one code, untick "of each organism" on the column and fix the sample code.`,
      de: `{count} {+count:Spalte wird|Spalten werden} bei den Vorkommen der Zeilen geschrieben, nicht bei der Probe: {columns}. Ihre Werte unterscheiden sich in einer Probe wie die einzelner Organismen. Sind es zwei Proben unter einem Code, entfernen Sie bei der Spalte „jedes Organismus“ und korrigieren Sie den Code.`,
      fr: `{count} {+count:colonne est écrite|colonnes sont écrites} sur les occurrences des lignes et non sur l'échantillon : {columns}. Leurs valeurs diffèrent dans un échantillon comme celles d'organismes isolés. S'il s'agit de deux échantillons sous un même code, décochez « de chaque organisme » et corrigez le code.`,
    },
    technical: `{file}, {sheet}: {count} measured-variable column(s) written as an eMoF row of the occurrence of each row, not of the sample event: {columns}.`,
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
    id: 'CONV-NERC-CODE-MALFORMED',
    category: 'B',
    severity: 'warning',
    params: ['column', 'code', 'collection', 'length'],
    plain: {
      pl: `Nagłówek „{column}”: kod {code} po „SDN:{collection}::” nie jest kodem {collection}, który ma dokładnie {length} wielkich liter i cyfr. W NVS nie ma takiego pojęcia. Sprawdź kod: literówka albo dodatkowy znak. Żaden identyfikator z niego nie jest zapisywany; kolumna zostaje mierzoną zmienną.`,
      en: `Header "{column}": the code {code} after "SDN:{collection}::" is not a {collection} code, which has exactly {length} capital letters and digits. NVS has no such concept. Check the code for a typo or an extra character. No identifier is written from it; the column stays a measured variable.`,
      de: `Kopfzeile „{column}“: Der Code {code} nach „SDN:{collection}::“ ist kein {collection}-Code, der genau {length} Großbuchstaben und Ziffern hat. NVS kennt keinen solchen Begriff. Prüfen Sie den Code auf einen Tippfehler oder ein überzähliges Zeichen. Daraus wird keine Kennung geschrieben; die Spalte bleibt eine Messgröße.`,
      fr: `En-tête « {column} » : le code {code} après « SDN:{collection}:: » n'est pas un code {collection}, qui compte exactement {length} majuscules et chiffres. NVS n'a pas ce concept. Vérifiez le code : faute de frappe ou caractère en trop. Aucun identifiant n'en est écrit ; la colonne reste une variable mesurée.`,
    },
    technical: `{file}, {sheet} column {column}: the code "{code}" after the explicit prefix SDN:{collection}:: is not of the shape of a {collection} code ({length} upper-case letters and digits); no concept page exists (NVS: 404). The column stays a measured variable, no measurementTypeID / measurementUnitID is written from the code; one is written only when the user confirms a concept for the column.`,
    citations: [NERC_MANUAL, NVS_CODE_SHAPE],
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
    id: 'CONV-SHEET-TRANSPOSED',
    category: 'B',
    severity: 'error',
    params: ['reason'],
    plain: {
      pl: `Arkusz „{sheet}” nie został wczytany: {reason}. Wiersz 1 byłby czytany jako nagłówek. Obróć tabelę w arkuszu kalkulacyjnym (próbki w wierszach, gatunki lub zmienne w kolumnach) i wczytaj ją ponownie albo zaznacz przy tym arkuszu „Czytaj jako zwykłą tabelę”.`,
      en: `Sheet "{sheet}" was not read: {reason}. Row 1 would be read as the header. Transpose the table in your spreadsheet (samples in rows, species or variables in columns) and load it again, or tick "Read as a normal table" for this sheet.`,
      de: `Das Blatt „{sheet}“ wurde nicht gelesen: {reason}. Zeile 1 würde als Kopfzeile gelesen. Transponieren Sie die Tabelle in Ihrer Tabellenkalkulation (Proben in Zeilen, Arten oder Variablen in Spalten) und laden Sie sie neu, oder wählen Sie bei diesem Blatt „Als normale Tabelle lesen“.`,
      fr: `La feuille « {sheet} » n'a pas été lue : {reason}. La ligne 1 serait lue comme en-tête. Transposez le tableau dans votre tableur (échantillons en lignes, espèces ou variables en colonnes) et rechargez-le, ou cochez « Lire comme un tableau normal » pour cette feuille.`,
    },
    technical: `{file}, {sheet}: {reason}. /check reports the same reading of variables in rows (IN-LAYOUT-UNSUPPORTED) and cannot read it; the converter also detects species in rows (first column Latin names, headers that are sample codes, numbers or presence marks in the cells; a normal wide sheet with species as headers is never flagged). The sheet is not converted and the export is blocked until the table is turned in the spreadsheet or the user ticks "Read as a normal table" for the sheet (a pre-tick from the companion file: transposedAsTable=<sheet>). A sheet that is a pivot of a long sheet, a profile sheet and a sheet read as it stands are not tested.`,
  },
  {
    id: 'CONV-SHEET-UNITS-ROW',
    category: 'B',
    severity: 'error',
    params: ['line'],
    plain: {
      pl: `Arkusz „{sheet}” nie został wczytany: wiersz {line} pod nagłówkiem wygląda na jednostki (np. m, degrees_north), a nie dane. Jeśli to jednostki, wpisz je w nazwach kolumn („depth [m]”) i wczytaj plik ponownie. Jeśli to dane, zaznacz „Czytaj jako zwykłą tabelę”.`,
      en: `Sheet "{sheet}" was not read: line {line}, under the header, looks like units (e.g. m, degrees_north) rather than data. If they are units, write them into the column names ("depth [m]") and load the file again. If it is data, tick "Read as a normal table" for this sheet.`,
      de: `Das Blatt „{sheet}“ wurde nicht gelesen: Zeile {line} unter der Kopfzeile sieht nach Einheiten aus (z. B. m, degrees_north), nicht nach Daten. Sind es Einheiten, schreiben Sie sie in die Spaltennamen („depth [m]“) und laden Sie die Datei neu. Sind es Daten, wählen Sie „Als normale Tabelle lesen“.`,
      fr: `La feuille « {sheet} » n'a pas été lue : la ligne {line}, sous l'en-tête, ressemble à des unités (p. ex. m, degrees_north) plutôt qu'à des données. Si ce sont des unités, écrivez-les dans les noms de colonnes (« depth [m] ») et rechargez le fichier ; sinon cochez « Lire comme un tableau normal ».`,
    },
    technical: `{file}, {sheet}: line {line} is the first row under the header and reads as a row of units: every filled cell is a unit and the numbers agree under most of them (text or an unknown word stands under some), or two cells are units of the vocabulary with numbers under them (recognize/layout.ts firstRowIsUnits, the row /check refuses as a header over several rows). It was not folded into the header (foldUnitsRow needs every filled cell a unit and numbers under all), so the converter would read it as a data row (text in the taxon columns, a wrong sample). The sheet is not converted and the export is blocked until the units are written into the column names and the file is loaded again, or the user ticks "Read as a normal table" for the sheet (the same tick as CONV-SHEET-TRANSPOSED, offered through ConvertFileSummary.transposedSheets = 'header-units'; a pre-tick from the companion file: transposedAsTable=<sheet>).`,
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
      pl: `W arkuszu „{sheet}” jedna próbka ma parametr „{field}” więcej niż raz ({+lineCount:wiersz|wiersze|wierszy} {lines}). Konwerter nie wybiera między nimi ani ich nie sumuje: rozróżnij próbki w innej kolumnie (rzut, powtórzenie, głębokość) albo pomiń powtórzone wiersze i wypisz je (zob. następny komunikat).`,
      en: `In sheet "{sheet}", one sample has the parameter "{field}" more than once ({+lineCount:line|lines} {lines}). The converter does not choose between them or sum them: tell the samples apart in another column (cast, replicate, depth), or leave the repeated rows out and list them (see the next message).`,
      de: `Im Blatt „{sheet}“ hat eine Probe den Parameter „{field}“ mehrfach ({+lineCount:Zeile|Zeilen} {lines}). Der Konverter wählt nicht aus und summiert nicht: Unterscheiden Sie die Proben in einer anderen Spalte (Einsatz, Wiederholung, Tiefe) oder lassen Sie die wiederholten Zeilen aus und listen Sie sie auf (siehe nächste Meldung).`,
      fr: `Dans la feuille « {sheet} », un échantillon a le paramètre « {field} » plusieurs fois ({+lineCount:ligne|lignes} {lines}). Le convertisseur ne choisit pas et n'additionne pas : distinguez les échantillons dans une autre colonne (déploiement, réplicat, profondeur) ou écartez les lignes répétées et listez-les (message suivant).`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: a long sheet has the same sample (the same values in every column but the parameter, unit, value and quality-flag columns) and the same parameter and unit on more than one row. Whatever the values, the rows are not merged, summed or chosen between; the export is blocked.`,
  },
  {
    id: 'CONV-LONG-NO-PARAMETER',
    category: 'B',
    severity: 'error',
    params: ['count'],
    plain: {
      pl: `W arkuszu „{sheet}” {count} {+count:wiersz ma|wiersze mają|wierszy ma} wartość, ale kolumna parametru jest pusta ({+lineCount:wiersz|wiersze|wierszy} {lines}). Konwerter nie wie, co zmierzono: wpisz nazwę parametru w arkuszu albo pomiń {+count:ten wiersz|te wiersze|te wiersze} i wypisz (zob. następny komunikat).`,
      en: `In sheet "{sheet}", {count} {+count:row has|rows have} a value but an empty parameter column ({+lineCount:line|lines} {lines}). The converter cannot tell what was measured: type the parameter name in the sheet, or leave {+count:the row|the rows} out and list {+count:it|them} (see the next message).`,
      de: `Im Blatt „{sheet}“ {+count:hat|haben} {count} {+count:Zeile|Zeilen} einen Wert, aber keinen Namen in der Parameterspalte ({+lineCount:Zeile|Zeilen} {lines}). Der Konverter weiß nicht, was gemessen wurde: Tragen Sie den Parameter ein oder lassen Sie {+count:die Zeile|die Zeilen} aus und listen Sie sie auf (siehe nächste Meldung).`,
      fr: `Dans la feuille « {sheet} », {count} {+count:ligne a|lignes ont} une valeur mais pas de nom dans la colonne du paramètre ({+lineCount:ligne|lignes} {lines}). Le convertisseur ne sait pas ce qui a été mesuré : saisissez le paramètre ou écartez {+count:la ligne|les lignes} et {+count:listez-la|listez-les} (message suivant).`,
    },
    technical: `{file}, {sheet}:{lines}: {count} row(s) of a long sheet have a value and no name in the parameter column; nothing can be named for them, so they are not read and the export is blocked.`,
  },
  {
    id: 'CONV-DEPTH-UNIT',
    category: 'B',
    severity: 'error',
    params: ['unit'],
    plain: {
      pl: `Kolumna głębokości „{field}” ma jednostkę „{unit}”. Darwin Core wymaga metrów, a konwerter przelicza tylko sążnie (fm), stopy (ft) i km. Podaj metry albo popraw jednostkę kolumny w tabeli ról. Głębokość w osadzie (często w cm): wybierz znaczenie „Głębokość w osadzie”.`,
      en: `Depth column "{field}" states the unit "{unit}". Darwin Core needs metres, and the converter converts only fathoms (fm), feet (ft) and km. Give metres or correct the unit of the column in the role table. A depth in sediment (often in cm): choose the meaning "Depth below seafloor".`,
      de: `Die Tiefenspalte „{field}“ nennt die Einheit „{unit}“. Darwin Core verlangt Meter; der Konverter rechnet nur Faden (fm), Fuß (ft) und km um. Geben Sie Meter an oder korrigieren Sie die Einheit in der Rollentabelle. Tiefe im Sediment (oft in cm): Bedeutung „Tiefe unter dem Meeresboden“ wählen.`,
      fr: `La colonne de profondeur « {field} » indique l'unité « {unit} ». Darwin Core exige des mètres ; le convertisseur ne convertit que les brasses (fm), pieds (ft) et km. Donnez des mètres ou corrigez l'unité dans le tableau des rôles. Profondeur dans un sédiment (souvent en cm) : choisissez « Profondeur sous le fond ».`,
    },
    technical: `{file}, {sheet} field {field}: depth unit "{unit}" is not metres and has no exact factor here; minimumDepthInMeters and maximumDepthInMeters are in metres. Fathom, foot and km are converted (CONV-DEPTH-CONVERTED); a centimetre depth is usually a sediment depth and blocks. A depth below the seafloor in cm or m has its own role (CONV-SEAFLOOR-UNIT, CONV-SEAFLOOR-VALUE).`,
    citations: [DWC_DEPTH],
  },
  {
    id: 'CONV-DEPTH-CONVERTED',
    category: 'B',
    severity: 'warning',
    params: ['unit', 'symbol', 'factor', 'example'],
    plain: {
      pl: `Kolumna głębokości „{field}” jest w jednostce „{unit}”, więc konwerter przeliczył ją na metry (1 {symbol} = {factor} m, współczynnik dokładny), np. {example}. Oryginalny zapis jest w kolumnie verbatimDepth. Sprawdź, czy jednostka z nagłówka jest właściwa, i potwierdź przeliczenie.`,
      en: `Depth column "{field}" is in "{unit}", so the converter converted it to metres (1 {symbol} = {factor} m, an exact factor), for example {example}. The original is kept in the verbatimDepth column. Check that the unit in the header is right and accept the conversion.`,
      de: `Die Tiefenspalte „{field}“ ist in „{unit}“ angegeben, deshalb hat der Konverter sie in Meter umgerechnet (1 {symbol} = {factor} m, genauer Faktor), zum Beispiel {example}. Das Original steht in der Spalte verbatimDepth. Prüfen Sie, ob die Einheit im Spaltenkopf stimmt, und bestätigen Sie die Umrechnung.`,
      fr: `La colonne de profondeur « {field} » est en « {unit} » : le convertisseur l'a convertie en mètres (1 {symbol} = {factor} m, facteur exact), par exemple {example}. L'original est conservé dans la colonne verbatimDepth. Vérifiez que l'unité de l'en-tête est la bonne et acceptez la conversion.`,
    },
    technical: `{file}, {sheet} field {field}: depth in "{unit}" multiplied by the exact factor {factor} (1 {symbol}) (decimal arithmetic on the digits of the cell) into minimumDepthInMeters / maximumDepthInMeters; the cell as written, with its unit, is verbatimDepth. Example: {example}.`,
    citations: [DWC_DEPTH],
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
    citations: [OBIS_DARWIN_CORE, CITE.pangaeaSedimentDepth],
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
      pl: `W tym arkuszu nie wskazano kolumny z taksonami. Konwerter potrzebuje taksonu (w arkuszu szerokim nagłówków kolumn z liczebnością, w długim kolumny z nazwą) i ilości (liczebność, zagęszczenie albo biomasa).`,
      en: `No taxon column is marked in this sheet. The converter needs a taxon (column headers with counts in a wide sheet, a taxon column in a long one) and a quantity (counts, density or biomass).`,
      de: `In diesem Blatt ist keine Taxon-Spalte markiert. Der Konverter braucht ein Taxon (im breiten Blatt die Spaltenköpfe mit Anzahlen, im langen eine Namensspalte) und eine Menge (Anzahlen, Dichte oder Biomasse).`,
      fr: `Aucune colonne de taxon n'est marquée dans cette feuille. Le convertisseur a besoin d'un taxon (en-têtes de colonnes d'effectifs dans une feuille large, colonne de noms dans une feuille longue) et d'une quantité (effectifs, densité ou biomasse).`,
    },
    technical: `{file}, {sheet}: no column with the taxon role for a {shape} sheet (wide: taxon columns with header:true; long: a taxon column and a quantity column). A long sheet that has a taxon column but no quantity column is CONV-SPECIES-LIST-NO-COUNTS or CONV-TAXON-NO-QUANTITY instead.`,
  },
  {
    id: 'CONV-SPECIES-LIST-NO-COUNTS',
    category: 'B',
    severity: 'error',
    params: [],
    plain: {
      pl: `Ten arkusz wymienia gatunki bez liczebności. Jeśli to lista znalezionych gatunków (sama obecność, nic nie liczono), zaznacz przy arkuszu „To jest lista znalezionych gatunków (sama obecność, bez liczebności)”. W przeciwnym razie dodaj kolumnę z liczebnością, zagęszczeniem albo biomasą i powiedz, czym są liczby.`,
      en: `This sheet lists species without counts. If it is a list of species found (presence only, nothing counted), tick "This is a list of species found (presence only, no counts)" for the sheet. Otherwise add a column with counts, density or biomass and say what the numbers are.`,
      de: `Dieses Blatt führt Arten ohne Anzahlen auf. Ist es eine Liste gefundener Arten (nur Anwesenheit, nichts gezählt), wählen Sie beim Blatt „Dies ist eine Liste gefundener Arten (nur Anwesenheit, ohne Anzahlen)“. Sonst fügen Sie eine Spalte mit Anzahlen, Dichte oder Biomasse hinzu und geben Sie an, was die Zahlen sind.`,
      fr: `Cette feuille liste des espèces sans effectifs. S'il s'agit d'une liste d'espèces trouvées (présence seule, rien n'est compté), cochez pour la feuille « C'est une liste d'espèces trouvées (présence seule, sans effectifs) ». Sinon ajoutez une colonne d'effectifs, de densité ou de biomasse et indiquez ce que sont les nombres.`,
    },
    technical: `{file}, {sheet}: a long sheet has a taxon column and no quantity column (a presence-only species list). Nothing is written until the user either ticks "This is a list of species found" for the sheet (presenceOnly: one occurrence per taxon row, occurrenceStatus present, no organismQuantity and no organismQuantityType) or adds a quantity column and declares it. This one finding replaces CONV-NO-TAXON, CONV-QUANTITY-UNDECLARED and CONV-NO-OCCURRENCES for the sheet.`,
    citations: [OBIS_OCCURRENCE_STATUS],
  },
  {
    id: 'CONV-PRESENCE-VALUE',
    category: 'B',
    severity: 'error',
    params: [],
    plain: {
      pl: `Kolumna „{field}” ma {value} {+lineCount:w wierszu|w wierszach|w wierszach} {lines}, a na liście znalezionych gatunków komórka to znak (x, +, ✓, 1, tak) albo jest pusta. Wartość nie jest zgadywana. Jeśli to liczebności, odznacz „To jest lista znalezionych gatunków” i powiedz, czym są liczby; w przeciwnym razie popraw je.`,
      en: `Column "{field}" holds {value} in {+lineCount:line|lines} {lines}, but in a list of species found a cell is a mark (x, +, ✓, 1, yes) or empty. The value is not guessed. If these are counts, untick "This is a list of species found" and say what the numbers are; otherwise correct them.`,
      de: `Die Spalte „{field}“ enthält {value} in {+lineCount:der Zeile|den Zeilen} {lines}, aber in einer Liste gefundener Arten ist eine Zelle ein Zeichen (x, +, ✓, 1, ja) oder leer. Der Wert wird nicht geraten. Sind es Anzahlen, entfernen Sie das Häkchen bei „Dies ist eine Liste gefundener Arten“; sonst korrigieren Sie sie.`,
      fr: `La colonne « {field} » contient {value} {+lineCount:à la ligne|aux lignes} {lines}, mais dans une liste d'espèces trouvées une cellule est un signe (x, +, ✓, 1, oui) ou vide. La valeur n'est pas devinée. S'il s'agit d'effectifs, décochez « C'est une liste d'espèces trouvées » ; sinon corrigez-les.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: in a sheet ticked as a presence-only species list, a wide cell is read as a mark: present (x X + * ✓ ✔ 1 yes y tak ja oui present obecny vorhanden présent), absent (0 - absent nieobecny abwesend no nie nein non; an absence only with the full-species-list tick, else nothing is written) or empty. Any other value ({value}: a number above 1, a negative number, other text) is not guessed; the sheet is not converted until it is corrected or the tick is removed.`,
    citations: [OBIS_OCCURRENCE_STATUS],
  },
  {
    id: 'CONV-TAXON-NO-QUANTITY',
    category: 'B',
    severity: 'error',
    params: [],
    plain: {
      pl: `W tym arkuszu zaznaczono kolumnę z taksonami, ale nie ma kolumny z ilością. Zaznacz kolumnę z liczebnością, zagęszczeniem albo biomasą albo dodaj ją; list samej obecności gatunków konwerter na razie nie zapisuje.`,
      en: `The taxon column is marked in this sheet, but there is no quantity column. Mark the column with counts, density or biomass, or add one; the converter does not write presence-only lists yet.`,
      de: `In diesem Blatt ist die Taxon-Spalte markiert, aber es gibt keine Mengenspalte. Markieren Sie die Spalte mit Anzahlen, Dichte oder Biomasse oder fügen Sie eine hinzu; reine Anwesenheitslisten schreibt der Konverter noch nicht.`,
      fr: `La colonne de taxon est marquée dans cette feuille, mais il n'y a pas de colonne de quantité. Marquez la colonne d'effectifs, de densité ou de biomasse, ou ajoutez-en une ; le convertisseur n'écrit pas encore de listes de présence seule.`,
    },
    technical: `{file}, {sheet}: a long sheet has a taxon column and other numeric or measured-variable columns, but no quantity column. Presence-only lists are not written yet; the sheet is not converted. This one finding replaces CONV-NO-TAXON, CONV-QUANTITY-UNDECLARED and CONV-NO-OCCURRENCES for the sheet. A sheet with a taxon column and no numbers at all is CONV-SPECIES-LIST-NO-COUNTS.`,
  },
  {
    id: 'CONV-ENV-ONLY-SHEET',
    category: 'B',
    severity: 'error',
    params: [],
    plain: {
      pl: `W tym arkuszu nie zaznaczono kolumny z taksonami ani z liczebnością, a pozostałe kolumny to mierzone wielkości. OBIS potrzebuje rekordów gatunków. Jeśli któraś kolumna zawiera nazwy gatunków, zaznacz ją jako takson; w przeciwnym razie dodaj arkusz z gatunkami albo sprawdź ten plik w /check pod kątem innych repozytoriów.`,
      en: `No taxon or count column is marked in this sheet, and its other columns are measured variables. OBIS needs species records. If a column holds species names, mark it as the taxon; otherwise add a sheet with species, or check this file with /check for other repositories.`,
      de: `In diesem Blatt ist weder eine Taxon- noch eine Anzahlspalte markiert, die übrigen Spalten sind Messgrößen. OBIS braucht Artnachweise. Enthält eine Spalte Artnamen, markieren Sie sie als Taxon; andernfalls fügen Sie ein Blatt mit Arten hinzu oder prüfen Sie diese Datei mit /check für andere Repositorien.`,
      fr: `Aucune colonne de taxon ni d'effectifs n'est marquée dans cette feuille, et les autres colonnes sont des variables mesurées. OBIS exige des enregistrements d'espèces. Si une colonne contient des noms d'espèces, marquez-la comme taxon ; sinon ajoutez une feuille d'espèces ou vérifiez ce fichier avec /check pour d'autres dépôts.`,
    },
    technical: `{file}, {sheet}: the sheet has measured-variable columns and no taxon column, no quantity column and no unconfirmed taxon candidate (typically environmental data only; a column of species names the converter did not recognise is the other possibility, and the text says so). This one finding replaces CONV-NO-TAXON, CONV-QUANTITY-UNDECLARED and CONV-NO-OCCURRENCES for the sheet; a sheet with a taxon column is CONV-SPECIES-LIST-NO-COUNTS, CONV-TAXON-NO-QUANTITY or normal, and a sheet marked as a profile file keeps CONV-NO-OCCURRENCES.`,
  },
  {
    id: 'CONV-SUMMARY-ROW-SKIPPED',
    category: 'B',
    severity: 'info',
    params: ['count'],
    plain: {
      pl: `Pominięto {count} {+count:wiersz podsumowania|wiersze podsumowania|wierszy podsumowania} ({value}) w {+count:wierszu|wierszach|wierszach} {lines}. {+count:To nie jest próbka|To nie są próbki|To nie są próbki}. Prawdziwą stację o takiej nazwie przemianuj w arkuszu.`,
      en: `{count} summary {+count:row|rows} ({value}) in {+count:line|lines} {lines} {+count:was|were} left out. {+count:It is not a sample|They are not samples}. A real station with such a name: rename it in the sheet.`,
      de: `{count} {+count:Zusammenfassungszeile|Zusammenfassungszeilen} ({value}) in {+count:Zeile|den Zeilen} {lines} {+count:wurde|wurden} ausgelassen. {+count:Sie ist keine Probe|Sie sind keine Proben}. Eine echte Station mit so einem Namen benennen Sie im Blatt um.`,
      fr: `{count} {+count:ligne de synthèse|lignes de synthèse} ({value}) {+count:à la ligne|aux lignes} {lines} {+count:a été ignorée|ont été ignorées}. {+count:Ce n'est pas un échantillon|Ce ne sont pas des échantillons}. Renommez dans la feuille une vraie station portant un tel nom.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} row(s) whose sample code or station reads as a summary label ({value}) were not converted. A total word (total, suma, razem, summe, gesamt, somme) always counts; a statistics label (mean, average, median, sd, sum, ... and their pl / de / fr words; one definition with /check, summaryLabels.ts) counts when the row has no date and no position of its own and the label is unambiguous or stands in a block of two or more label rows; the short ambiguous ones (n, se, cv, min, max, count) alone are CONV-SUMMARY-ROW-KEPT. The label may be in the sample-code column under a real station (a station subtotal).`,
  },
  {
    id: 'CONV-SUMMARY-ROW-KEPT',
    category: 'B',
    severity: 'warning',
    params: ['count'],
    plain: {
      pl: `{count} {+count:wiersz|wiersze|wierszy} ({value}) w {+count:wierszu|wierszach|wierszach} {lines} wygląda{+count:|ją|} jak statystyki, ale {+count:nie stoi|nie stoją|nie stoi} w bloku, więc zostawiono {+count:go|je|je}. Jeśli {+count:to nie próbka|to nie próbki|to nie próbki}, popraw arkusz; jeśli tak, potwierdź.`,
      en: `{count} {+count:row|rows} ({value}) in {+count:line|lines} {lines} {+count:looks|look} like statistics but {+count:is|are} not in a summary block, so {+count:it was|they were} kept. If {+count:it is not a real sample|they are not real samples}, correct the sheet and load it again; otherwise confirm.`,
      de: `{count} {+count:Zeile|Zeilen} ({value}) in {+count:Zeile|den Zeilen} {lines} {+count:sieht|sehen} wie Statistik aus, {+count:steht|stehen} aber nicht in einem Block und {+count:wurde|wurden} behalten. {+count:Ist es keine echte Probe|Sind es keine echten Proben}, korrigieren Sie das Blatt; sonst bestätigen Sie.`,
      fr: `{count} {+count:ligne|lignes} ({value}) {+count:à la ligne|aux lignes} {lines} {+count:ressemble|ressemblent} à des statistiques mais {+count:n'est|ne sont} pas dans un bloc : {+count:conservée|conservées}. {+count:Si ce n'est pas un échantillon|Si ce ne sont pas des échantillons}, corrigez la feuille ; sinon, confirmez.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} row(s) whose sample code or station is a statistics label ({value}), with no date and no position of its own, but a short ambiguous label (n, se, cv, min, max, count; a compass point such as N is one) standing alone, not in a block of two or more label rows: converted as a sample (a station really named Max or N stays a station) and said, to accept.`,
  },
  {
    id: 'CONV-ID-REVISIT',
    category: 'B',
    severity: 'warning',
    params: ['count', 'by'],
    plain: {
      pl: `{count} {+count:kod próbki jest użyty|kody próbek są użyte|kodów próbek jest użytych} dla więcej niż jednej wizyty na stacji (np. {value}). Każda wizyta to osobne zdarzenie, a jej identyfikator zawiera: {by}. Sprawdź, czy te wiersze to naprawdę różne wizyty, a nie literówka.`,
      en: `{count} sample {+count:code is|codes are} used for more than one visit of a station (for example {value}). Each visit is its own event, and its ID holds the {by}. Check that the rows really are different visits and not a mistyped value.`,
      de: `{count} {+count:Probencode wird|Probencodes werden} für mehr als einen Besuch einer Station verwendet (z. B. {value}). Jeder Besuch ist ein eigenes Ereignis, seine Kennung enthält: {by}. Prüfen Sie, ob die Zeilen wirklich verschiedene Besuche sind und kein Tippfehler.`,
      fr: `{count} {+count:code d'échantillon sert|codes d'échantillon servent} pour plus d'une visite d'une station (p. ex. {value}). Chaque visite est un événement distinct et son identifiant contient : {by}. Vérifiez que ces lignes sont bien des visites différentes et non une faute de frappe.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} sample code(s) repeat at ONE station on rows that differ in {by} (the fewest of date, time, depth that tell them apart; a long sheet never uses depth). Each visit is its own sample with the ID <station eventID>:<date>[T<time>][:<depth>m]:<code> (example {value}), the shape of the profile levels; the other IDs are unchanged. Rows identical in all of these stay a real duplicate (CONV-ID-DUPLICATE). The same code at another station is not a revisit (use the station prefix). To accept: the ID is made of the data.`,
  },
  {
    id: 'CONV-REPLICATE-MISSING',
    category: 'B',
    severity: 'error',
    params: ['count'],
    plain: {
      pl: `{count} {+count:wiersz nie ma|wiersze nie mają|wierszy nie ma} wartości w kolumnie powtórzeń „{field}” ({+lineCount:wiersz|wiersze|wierszy} {lines}). Każdy wiersz należy do jakiegoś powtórzenia próbki: uzupełnij kolumnę albo nadaj jej inną rolę (np. „Pomiń”), jeśli nie numeruje powtórzeń.`,
      en: `{count} {+count:row has|rows have} no value in the replicate column "{field}" ({+lineCount:line|lines} {lines}). Every row belongs to a replicate of its sample: fill the column, or give it another role (for example "Ignore") if it does not number replicates.`,
      de: `{count} {+count:Zeile hat|Zeilen haben} keinen Wert in der Replikatspalte „{field}“ ({+lineCount:Zeile|Zeilen} {lines}). Jede Zeile gehört zu einem Replikat ihrer Probe: Füllen Sie die Spalte oder geben Sie ihr eine andere Rolle (z. B. „Ignorieren“), wenn sie keine Replikate nummeriert.`,
      fr: `{count} {+count:ligne n'a|lignes n'ont} pas de valeur dans la colonne des réplicats « {field} » ({+lineCount:ligne|lignes} {lines}). Chaque ligne appartient à un réplicat de son échantillon : remplissez la colonne ou donnez-lui un autre rôle (par ex. « Ignorer ») si elle ne numérote pas de réplicats.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {count} row(s) of a sheet with a column in the role replicate / sub-sample have no value in it. The rows are not converted: a replicate event is <sample eventID>:<value>, and a row without a value would have the ID of the sample itself.`,
  },
  {
    id: 'CONV-BIOMASS-KIND-UNSET',
    category: 'B',
    severity: 'warning',
    params: ['count', 'columns'],
    plain: {
      pl: `{count} {+count:wartość|wartości|wartości} z {columns} zapisano jako biomasę bez measurementTypeID: nie wiadomo, czy to masa mokra, sucha czy sucha bez popiołu, a NERC ma osobne pojęcie dla każdej. Wybierz rodzaj w liście ról kolumny albo zaakceptuj brak identyfikatora.`,
      en: `{count} {+count:value|values} of {columns} {+count:was|were} written as biomass with no measurementTypeID: wet mass, dry mass and ash-free dry mass each have a different NERC concept and the kind is not known. Pick it in the role list of the column, or accept that no identifier is written.`,
      de: `{count} {+count:Wert|Werte} aus {columns} als Biomasse ohne measurementTypeID geschrieben: Nassmasse, Trockenmasse und aschefreie Trockenmasse haben je ein eigenes NERC-Konzept, die Art ist unbekannt. Wählen Sie sie in der Rollenliste der Spalte oder akzeptieren Sie, dass keine Kennung geschrieben wird.`,
      fr: `{count} {+count:valeur|valeurs} de {columns} {+count:a été écrite|ont été écrites} comme biomasse sans measurementTypeID : masse humide, sèche et sèche sans cendres ont chacune un concept NERC différent et le type est inconnu. Choisissez-le dans la liste des rôles de la colonne ou acceptez qu'aucun identifiant ne soit écrit.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {count} eMoF row(s) of the biomass / weight column(s) {columns} have measurementType "biomass" and no measurementTypeID, because the kind of mass is not known (the header names none and the user has not chosen). The kinds map to different NERC S06 concepts: wet weight biomass S0600088, dry weight biomass S0600087, ash-free dry weight biomass S0600086 (the P01 biomass concepts are all per unit area or volume). There is no default.`,
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
    technical: `Dataset description (eml.xml, and the datasetName and institutionCode columns of event.txt) is missing or unusable: {fields}. BioCheck reports an Event table without datasetName and institutionCode as an error (docs/research/qc-sources.md, research notes, Item 2); OBIS asks for title, citation, contact and abstract (manual.obis.org/eml.html).`,
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
      pl: `Do archiwum {+count:nie trafi|nie trafią|nie trafi} {count} {+count:kolumna|kolumny|kolumn}: {columns}. Powód: znaczenie, którego się tu nie zapisuje (np. ciśnienie poza plikiem profilowym), brak nagłówka (podana jako [litera]) albo druga kolumna z ilością. Zaakceptuj to, aby eksportować {+count:bez niej|bez nich|bez nich}.`,
      en: `Not written to the archive: {count} {+count:column|columns}: {columns}. Reason: a meaning that is not written here (e.g. a pressure outside a profile file), no header (shown as [letter]) or a second quantity column. Accept this to export without {+count:it|them}.`,
      de: `Nicht ins Archiv geschrieben: {count} {+count:Spalte|Spalten}: {columns}. Grund: eine hier nicht geschriebene Bedeutung (z. B. Druck außerhalb einer Profildatei), kein Kopf (als [Buchstabe] gezeigt) oder eine zweite Mengenspalte. Akzeptieren Sie das, um ohne sie zu exportieren.`,
      fr: `Non écrit dans l'archive : {count} {+count:colonne|colonnes} : {columns}. Raison : un sens qu'on n'écrit pas ici (par ex. pression hors fichier de profils), pas d'en-tête (indiquée par [lettre]) ou une deuxième colonne de quantité. Acceptez-le pour exporter {+count:sans elle|sans elles}.`,
    },
    technical: `{file}, {sheet}: {count} column(s) with a role other than ignore that this conversion does not read as the sheet is set up ({columns}): a pressure of a sheet that is not a profile file (a measured variable is written as an eMoF row on the sample event, or on the level event of a profile sheet, where the first pressure column is written as well), a second column of a role that is read once, a role of the other shape (a life stage, qualifier, occurrenceID, taxon ID or quantity column in a wide sheet, a taxon header column in a long one), the quantity type, or a sample-size column when the sample size is not set to a column; and two kinds of column with the role ignore that hold data: a column with an empty header (shown as its letter in brackets) and a second quantity column (a count next to a biomass). Nothing from them is written. The warning has to be accepted before the export.`,
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
  // CONV-QUANTITY-REPEATED where the sheet has a column with its own number on every row (the count of each size class): the quantity the user would pick instead
  'CONV-QUANTITY-REPEATED:alternative': {
    plain: {
      pl: `„{columns}” to chyba suma dla gatunku w próbce, powtórzona w wierszach klas wielkości ({count} z {of} grup, różnice w „{differs}”; {+lineCount:wiersz|wiersze|wierszy} {lines}). Kolumna „{alternative}” ma własną liczbę w każdym wierszu: jeśli to liczba osobników klasy, wskaż ją jako ilość. Albo zapisz jedno występowanie na próbkę i takson z sumą (przycisk).`,
      en: `"{columns}" looks like a total for the taxon in a sample, repeated on the size-class rows ({count} of {of} groups, differences in "{differs}"; {+lineCount:line|lines} {lines}). The column "{alternative}" has its own number on each row: if that is the number of animals of the class, mark it as the quantity. Or write one occurrence per sample and taxon with the total (button).`,
      de: `„{columns}“ ist wohl eine Summe je Taxon und Probe, in Größenklassenzeilen wiederholt ({count} von {of} Gruppen, Unterschied in „{differs}“; {+lineCount:Zeile|Zeilen} {lines}). Die Spalte „{alternative}“ hat in jeder Zeile eine eigene Zahl: ist das die Zahl der Tiere der Klasse, ordnen Sie sie als Menge zu. Oder schreiben Sie ein Vorkommen je Probe und Taxon mit der Summe (Schaltfläche).`,
      fr: `« {columns} » ressemble à un total par taxon et échantillon, répété sur les lignes de classes ({count} groupes sur {of}, écart dans « {differs} » ; {+lineCount:ligne|lignes} {lines}). La colonne « {alternative} » a son propre nombre sur chaque ligne : si c'est le nombre d'individus de la classe, indiquez-la comme quantité. Ou écrivez une occurrence par échantillon et taxon avec le total (bouton).`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: the value of {columns} is the same on every row of {count} of {of} groups of rows that share sample and taxon and differ in "{differs}"; the column "{alternative}" has a number of its own on the rows of the groups and may be the count of each size class (mark it as the quantity), else write one occurrence per sample and taxon. The advice for a duplicate identifier is withheld.`,
  },
  // CONV-QUANTITY-REPEATED after the user chose "once": the groups whose rows do not agree
  'CONV-QUANTITY-REPEATED:disagree': {
    plain: {
      pl: `{count} {+count:grupa wierszy|grupy wierszy|grup wierszy} tej samej próbki i gatunku nie zgadza się co do sumy w „{columns}” ({+lineCount:wiersz|wiersze|wierszy} {lines}): wartości się różnią albo inna kolumna z ilością lub wagą ma własne liczby. Takich wierszy nie można zapisać jako jednej sumy. Popraw wartości w arkuszu albo wskaż właściwą kolumnę z ilością.`,
      en: `{count} {+count:group|groups} of rows with the same sample and taxon disagree on the total in "{columns}" ({+lineCount:line|lines} {lines}): the values differ, or another quantity or weight column holds numbers of its own. Such rows cannot be written as one total. Correct the values in the sheet, or mark the right quantity column.`,
      de: `{count} {+count:Gruppe|Gruppen} von Zeilen mit derselben Probe und demselben Taxon {+count:stimmt|stimmen} in der Summe von „{columns}“ nicht überein ({+lineCount:Zeile|Zeilen} {lines}): die Werte unterscheiden sich, oder eine andere Mengen- oder Gewichtsspalte hat eigene Zahlen. Das lässt sich nicht als eine Summe schreiben. Korrigieren Sie die Werte oder ordnen Sie die richtige Mengenspalte zu.`,
      fr: `{count} {+count:groupe|groupes} de lignes du même échantillon et taxon ne s'accordent pas sur le total de « {columns} » ({+lineCount:ligne|lignes} {lines}) : les valeurs diffèrent, ou une autre colonne de quantité ou de poids a ses propres nombres. Cela ne peut pas être écrit comme un seul total. Corrigez les valeurs ou indiquez la bonne colonne de quantité.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: with "one occurrence per sample and taxon" chosen, {count} group(s) of rows have different values in the repeated column(s) {columns}, or another quantity or weight column with numbers of its own; they are not taken once, and the export stays blocked.`,
  },
  // CONV-BIOMASS-UNIT-UNCLEAR of a weight column whose header holds no unit at all
  'CONV-BIOMASS-UNIT-UNCLEAR:none': {
    plain: {
      pl: `Kolumna wagi „{field}” nie ma jednostki w nagłówku, więc jednostka pozostaje pusta w {count} {+count:wartości|wartościach|wartościach} ({+lineCount:wiersz|wiersze|wierszy} {lines}). Liczba bez jednostki nie mówi, czy to gramy, czy kilogramy. Wpisz jednostkę w nawiasie w nagłówku, np. [g].`,
      en: `Weight column "{field}" has no unit in its header, so the unit is left empty in {count} {+count:value|values} ({+lineCount:line|lines} {lines}). A number without a unit does not say whether it is grams or kilograms. Put the unit in brackets in the header, e.g. [g].`,
      de: `Die Gewichtsspalte „{field}“ hat keine Einheit im Kopf, die Einheit bleibt daher in {count} {+count:Wert|Werten} leer ({+lineCount:Zeile|Zeilen} {lines}). Eine Zahl ohne Einheit sagt nicht, ob es Gramm oder Kilogramm sind. Schreiben Sie die Einheit in Klammern in den Spaltenkopf, z. B. [g].`,
      fr: `La colonne de poids « {field} » n'a pas d'unité dans son en-tête : l'unité reste vide pour {count} {+count:valeur|valeurs} ({+lineCount:ligne|lignes} {lines}). Un nombre sans unité ne dit pas s'il s'agit de grammes ou de kilogrammes. Mettez l'unité entre crochets dans l'en-tête, p. ex. [g].`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {count} biomass value(s) of a column whose header holds no unit, neither in brackets nor as a word of the name. A unit is never guessed, so measurementUnit is left empty; the value is written as given.`,
  },
  // CONV-QUANTITY-REPEATED where only a WEIGHT repeats, beside a count for each row
  'CONV-QUANTITY-REPEATED:weight': {
    plain: {
      pl: `Waga w „{columns}” wygląda na sumę dla gatunku w próbce powtórzoną w każdym wierszu klasy wielkości ({count} z {of} grup, różnice w „{differs}”; {+lineCount:wiersz|wiersze|wierszy} {lines}), obok liczby w każdym wierszu. Liczb nie ruszamy. Zignoruj kolumnę wagi albo zapisz ją raz na próbkę i takson (przycisk).`,
      en: `The weight in "{columns}" looks like a total for the taxon in a sample, repeated on every size-class row ({count} of {of} groups, differences in "{differs}"; {+lineCount:line|lines} {lines}), beside a count on each row. The counts are not touched. Ignore the weight column, or write it once per sample and taxon (button).`,
      de: `Das Gewicht in „{columns}“ sieht aus wie eine Summe je Taxon und Probe, in jeder Größenklassenzeile wiederholt ({count} von {of} Gruppen, Unterschied in „{differs}“; {+lineCount:Zeile|Zeilen} {lines}), neben einer Zahl in jeder Zeile. Die Zahlen bleiben unberührt. Ignorieren Sie die Gewichtsspalte oder schreiben Sie es einmal je Probe und Taxon (Schaltfläche).`,
      fr: `Le poids de « {columns} » ressemble à un total par taxon et échantillon, répété sur chaque ligne de classe ({count} groupes sur {of}, écart dans « {differs} » ; {+lineCount:ligne|lignes} {lines}), à côté d'un nombre sur chaque ligne. Les nombres ne sont pas touchés. Ignorez la colonne de poids ou écrivez-la une fois par échantillon et taxon (bouton).`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: the value of {columns} is a weight that is the same on every row of {count} of {of} groups of rows that share sample and taxon and differ in "{differs}", while the quantity column has a count of its own on each row. Ignore the weight column, or write it once per sample and taxon (on the first row of each group, labelled as the total of the taxon); the counts are not changed.`,
  },
  // CONV-QUANTITY-REPEATED-ONCE where only a WEIGHT repeated
  'CONV-QUANTITY-REPEATED-ONCE:weight': {
    plain: {
      pl: `Jak wybrano, waga w „{columns}” jest zapisana raz na próbkę i takson, jako suma gatunku ({groups} {+groups:grupa|grupy|grup}); pominięto {count} {+count:powtórzoną wartość|powtórzone wartości|powtórzonych wartości} ({+lineCount:wiersz|wiersze|wierszy} {lines}). Liczby w każdym wierszu zostają.`,
      en: `As you chose, the weight in "{columns}" is written once per sample and taxon, as the total of the taxon ({groups} {+groups:group|groups}); {count} repeated {+count:value was|values were} left out ({+lineCount:line|lines} {lines}). The counts stay on every row.`,
      de: `Wie gewählt, wird das Gewicht in „{columns}“ je Probe und Taxon einmal geschrieben, als Summe des Taxons ({groups} {+groups:Gruppe|Gruppen}); {count} wiederholte {+count:Wert wurde|Werte wurden} ausgelassen ({+lineCount:Zeile|Zeilen} {lines}). Die Zahlen bleiben in jeder Zeile.`,
      fr: `Comme choisi, le poids de « {columns} » est écrit une fois par échantillon et taxon, comme total du taxon ({groups} {+groups:groupe|groupes}) ; {count} {+count:valeur répétée ignorée|valeurs répétées ignorées} ({+lineCount:ligne|lignes} {lines}). Les nombres restent sur chaque ligne.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: the user chose to write the repeated weight {columns} once per sample and taxon, on the first row of each of {groups} groups, labelled in measurementRemarks as the total of the taxon; {count} repeated value(s) of the rows after it are not written. The quantity column is unchanged (rows differ in "{differs}"; {lost}).`,
  },
  // CONV-ID-DUPLICATE of rows that carry the same quantity above 1: no advice to tell them apart
  'CONV-ID-DUPLICATE:same-value': {
    plain: {
      pl: `Ten sam identyfikator występowania powstaje więcej niż raz, np. „{value}”, {+lineCount:w wierszu|w wierszach|w wierszach} {lines} (powtórzone: {count}). Ta sama próbka, ten sam takson i ta sama ilość w {rows} wierszach: najpierw ustal, czym jest ta ilość (zob. ostrzeżenie o tej samej ilości). Jeśli to suma gatunku, scal wiersze w jeden; jeśli osobne liczby, potrzebna jest kolumna powtórzenia lub podpróbki.`,
      en: `The same occurrence identifier is produced more than once, e.g. "{value}", in {+lineCount:line|lines} {lines} ({count} repeated). Same sample, same taxon and the same quantity in {rows} rows: first decide what the quantity is (see the warning about the same quantity). If it is the species' total, merge the rows into one; if they are separate counts, a replicate or sub-sample column is what tells them apart.`,
      de: `Dieselbe Vorkommenskennung entsteht mehrfach, z. B. „{value}“, in {+lineCount:der Zeile|den Zeilen} {lines} (wiederholt: {count}). Dieselbe Probe, dasselbe Taxon und dieselbe Menge in {rows} Zeilen: klären Sie zuerst, was die Menge ist (siehe die Warnung zur gleichen Menge). Ist es die Summe der Art, führen Sie die Zeilen zu einer zusammen; sind es getrennte Zählungen, unterscheidet sie eine Replikat- oder Teilprobenspalte.`,
      fr: `Le même identifiant d'occurrence est produit plusieurs fois, p. ex. « {value} », {+lineCount:à la ligne|aux lignes} {lines} (répétés : {count}). Même échantillon, même taxon et même quantité dans {rows} lignes : décidez d'abord ce qu'est la quantité (voir l'avertissement sur la même quantité). Si c'est le total de l'espèce, fusionnez les lignes en une ; si ce sont des comptages séparés, une colonne de réplicat ou de sous-échantillon les distingue.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} repeated {kind} identifier(s), example "{value}": {rows} rows of the example have the same sample and taxon and the same quantity (CONV-QUANTITY-SAME-IN-SAMPLE says what the number may be). An occurrenceID or a life stage would write the first sum, so it is not advised.`,
  },
  // CONV-QUANTITY-SAME-IN-SAMPLE where the repeated value is a WEIGHT
  'CONV-QUANTITY-SAME-IN-SAMPLE:weight': {
    plain: {
      pl: `{records} {+records:wiersz|wiersze|wierszy} tej samej próbki i tego samego gatunku ({groups} {+groups:grupa|grupy|grup}) ma tę samą wagę w „{column}” ({+lineCount:wiersz|wiersze|wierszy} {lines}). Zapisana przy każdym wierszu daje {written}; jeśli to waga całego gatunku, byłoby {asTotal}. Sprawdź, co to jest.`,
      en: `{records} rows of the same sample and taxon ({groups} {+groups:group|groups}) carry the same weight in "{column}" ({+lineCount:line|lines} {lines}). Written on every row it adds up to {written}; if it is the weight of the whole species, it would be {asTotal}. Check which it is.`,
      de: `{records} Zeilen derselben Probe und desselben Taxons ({groups} {+groups:Gruppe|Gruppen}) tragen dasselbe Gewicht in „{column}“ ({+lineCount:Zeile|Zeilen} {lines}). In jeder Zeile geschrieben ergibt das {written}; ist es das Gewicht der ganzen Art, wären es {asTotal}. Prüfen Sie, was es ist.`,
      fr: `{records} lignes du même échantillon et du même taxon ({groups} {+groups:groupe|groupes}) portent le même poids dans « {column} » ({+lineCount:ligne|lignes} {lines}). Écrit sur chaque ligne il fait {written} ; si c'est le poids de toute l'espèce, ce serait {asTotal}. Vérifiez ce que c'est.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {records} rows in {groups} group(s) of one sample and taxon, which differ in some other column, carry the same weight in {column}. Written on every row the sum is {written}; if the value is a per-taxon total repeated on each row it would be {asTotal}. Shown whatever the number of groups, and never with the advice to tell the rows apart.`,
  },
  // CONV-QUANTITY-SAME-IN-SAMPLE where a weight repeats beside the quantity
  'CONV-QUANTITY-SAME-IN-SAMPLE:also': {
    plain: {
      pl: `{records} {+records:wiersz|wiersze|wierszy} tej samej próbki i tego samego gatunku ({groups} {+groups:grupa|grupy|grup}) ma tę samą ilość ({+lineCount:wiersz|wiersze|wierszy} {lines}): jako {records} {+records:rekord|rekordy|rekordów} daje {written}, a jeśli to suma gatunku, {asTotal}. Powtarza się też waga w „{alsoColumn}”: {alsoWritten}, a jako suma {alsoAsTotal}. Sprawdź, co to jest.`,
      en: `{records} rows of the same sample and taxon ({groups} {+groups:group|groups}) carry the same quantity ({+lineCount:line|lines} {lines}): as {records} records it is {written}, and {asTotal} if it is the species' total. The weight in "{alsoColumn}" repeats too: {alsoWritten}, or {alsoAsTotal} as a total. Check which it is.`,
      de: `{records} Zeilen derselben Probe und desselben Taxons ({groups} {+groups:Gruppe|Gruppen}) tragen dieselbe Menge ({+lineCount:Zeile|Zeilen} {lines}): als {records} Datensätze {written}, als Summe der Art {asTotal}. Auch das Gewicht in „{alsoColumn}“ wiederholt sich: {alsoWritten}, als Summe {alsoAsTotal}. Prüfen Sie, was es ist.`,
      fr: `{records} lignes du même échantillon et du même taxon ({groups} {+groups:groupe|groupes}) portent la même quantité ({+lineCount:ligne|lignes} {lines}) : comme {records} enregistrements {written}, et {asTotal} si c'est le total de l'espèce. Le poids de « {alsoColumn} » se répète aussi : {alsoWritten}, ou {alsoAsTotal} comme total. Vérifiez ce que c'est.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {records} rows in {groups} group(s) of one sample and taxon carry the same quantity in {column} (sum {written}, or {asTotal} as a total) and the same weight in {alsoColumn} (sum {alsoWritten}, or {alsoAsTotal} as a total).`,
  },
  // CONV-ID-DUPLICATE of rows that are identical in every column and carry a count of 1
  'CONV-ID-DUPLICATE:copies': {
    plain: {
      pl: `Ten sam identyfikator występowania powstaje więcej niż raz, np. „{value}”, {+lineCount:w wierszu|w wierszach|w wierszach} {lines} (powtórzone: {count}). Te wiersze są identyczne we wszystkich kolumnach: jeśli to ten sam rekord zapisany dwa razy, popraw arkusz; jeśli to osobne osobniki, każdy potrzebuje własnego identyfikatora występowania.`,
      en: `The same occurrence identifier is produced more than once, e.g. "{value}", in {+lineCount:line|lines} {lines} ({count} repeated). These rows are identical in every column: if they are one record written twice, correct the sheet; if they are separate specimens, each needs its own occurrenceID.`,
      de: `Dieselbe Vorkommenskennung entsteht mehrfach, z. B. „{value}“, in {+lineCount:der Zeile|den Zeilen} {lines} (wiederholt: {count}). Diese Zeilen sind in jeder Spalte identisch: ist es ein Datensatz, der zweimal geschrieben wurde, korrigieren Sie das Blatt; sind es getrennte Individuen, braucht jedes seine eigene occurrenceID.`,
      fr: `Le même identifiant d'occurrence est produit plusieurs fois, p. ex. « {value} », {+lineCount:à la ligne|aux lignes} {lines} (répétés : {count}). Ces lignes sont identiques dans toutes les colonnes : si c'est un enregistrement écrit deux fois, corrigez la feuille ; si ce sont des individus distincts, chacun a besoin de son propre occurrenceID.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} repeated {kind} identifier(s), example "{value}": the rows are identical in every column but a per-row identifier and carry a count of 1 (CONV-ROW-COPIES-SPECIMENS gives both sums). One record twice, or separate specimens: the advice depends on which, and says so.`,
  },
  // CONV-NA-SKIPPED of a long sheet: rows (a taxon and no quantity), listed by line
  'CONV-NA-SKIPPED:rows': {
    plain: {
      pl: `{count} {+count:wiersz z gatunkiem nie ma|wiersze z gatunkiem nie mają|wierszy z gatunkiem nie ma} ilości: komórka jest pusta albo ma „NA” lub „NaN” ({+lineCount:wiersz|wiersze|wierszy} {lines}). Nie powstał z {+count:niego|nich|nich} rekord: brak danych nie jest zerem ani obecnością. Wiersze są wymienione, nic nie znika po cichu.`,
      en: `{count} {+count:row with a species has|rows with a species have} no quantity: the cell is empty or says "NA" or "NaN" ({+lineCount:line|lines} {lines}). No record is made from {+count:it|them}: no data is neither a zero nor a presence. The rows are listed here, so nothing disappears silently.`,
      de: `{count} {+count:Zeile mit einer Art hat|Zeilen mit einer Art haben} keine Menge: die Zelle ist leer oder enthält „NA“ oder „NaN“ ({+lineCount:Zeile|Zeilen} {lines}). Daraus entsteht kein Datensatz: keine Daten sind weder Null noch Anwesenheit. Die Zeilen sind hier aufgeführt, nichts verschwindet stillschweigend.`,
      fr: `{count} {+count:ligne avec une espèce n'a|lignes avec une espèce n'ont} pas de quantité : la cellule est vide ou indique « NA » ou « NaN » ({+lineCount:ligne|lignes} {lines}). Aucun enregistrement n'en est tiré : pas de données n'est ni un zéro ni une présence. Les lignes sont listées ici, rien ne disparaît en silence.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {count} row(s) of a long sheet have a taxon and an empty or missing-data quantity (and no biomass value above zero), so no occurrence is written. Rows read + zeros skipped + these rows + rows kept without a count = the rows that have a taxon.`,
  },
  // CONV-NA-SKIPPED of a long sheet whose rows have a number in another quantity-named column
  'CONV-NA-SKIPPED:rows-columns': {
    plain: {
      pl: `{count} {+count:wiersz z gatunkiem nie ma|wiersze z gatunkiem nie mają|wierszy z gatunkiem nie ma} ilości w kolumnie „{field}” ({+lineCount:wiersz|wiersze|wierszy} {lines}). Nie powstał z {+count:niego|nich|nich} rekord. Te wiersze mają za to liczby w: {columns}. Jeśli to ilość, oznacz tę kolumnę jako ilość.`,
      en: `{count} {+count:row with a species has|rows with a species have} no quantity in column "{field}" ({+lineCount:line|lines} {lines}). No record is made from {+count:it|them}. These rows do have numbers in: {columns}. If that is the quantity, mark that column as the quantity.`,
      de: `{count} {+count:Zeile mit einer Art hat|Zeilen mit einer Art haben} keine Menge in der Spalte „{field}“ ({+lineCount:Zeile|Zeilen} {lines}). Daraus entsteht kein Datensatz. Diese Zeilen haben aber Zahlen in: {columns}. Ist das die Menge, ordnen Sie diese Spalte als Menge zu.`,
      fr: `{count} {+count:ligne avec une espèce n'a|lignes avec une espèce n'ont} pas de quantité dans la colonne « {field} » ({+lineCount:ligne|lignes} {lines}). Aucun enregistrement n'en est tiré. Ces lignes ont en revanche des nombres dans : {columns}. Si c'est la quantité, indiquez cette colonne comme quantité.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: {count} row(s) of a long sheet have a taxon and an empty or missing-data quantity, so no occurrence is written; other quantity-named columns are filled on them ({columns}).`,
  },
  // the whole quantity column is empty
  'CONV-NA-SKIPPED:rows-empty': {
    plain: {
      pl: `Kolumna „{field}” jest pusta we wszystkich {count} wierszach z gatunkiem ({+lineCount:wiersz|wiersze|wierszy} {lines}), więc nic się z niej nie zapisuje. Liczby są w: {columns}. Oznacz tę kolumnę jako ilość.`,
      en: `Column "{field}" is empty in all {count} rows with a species ({+lineCount:line|lines} {lines}), so nothing is written from it. The numbers are in: {columns}. Mark that column as the quantity.`,
      de: `Die Spalte „{field}“ ist in allen {count} Zeilen mit einer Art leer ({+lineCount:Zeile|Zeilen} {lines}), daraus wird also nichts geschrieben. Die Zahlen stehen in: {columns}. Ordnen Sie diese Spalte als Menge zu.`,
      fr: `La colonne « {field} » est vide dans les {count} lignes avec une espèce ({+lineCount:ligne|lignes} {lines}) : rien n'en est écrit. Les nombres sont dans : {columns}. Indiquez cette colonne comme quantité.`,
    },
    technical: `{file}, {sheet}:{lines} field {field}: the quantity column is empty on all {count} rows that have a taxon; other quantity-named columns are filled ({columns}).`,
  },
  // CONV-ZERO-SKIPPED of a presence-only list: the cells are marks (0, -, absent), not zeros
  'CONV-ZERO-SKIPPED:presence': {
    plain: {
      pl: `Pominięto {count} {+count:komórkę oznaczoną|komórki oznaczone|komórek oznaczonych} jako brak (0, -, absent), bo nie zaznaczono, że lista gatunków jest pełna. Brak zapisuje się tylko wtedy, gdy w próbce szukano wszystkich gatunków z listy.`,
      en: `{count} {+count:cell marked|cells marked} as absent (0, -, absent) {+count:was|were} left out, because the species list was not declared complete. An absence is written only when every species of the list was looked for in the sample.`,
      de: `{count} {+count:Zelle|Zellen} mit der Markierung „fehlt“ (0, -, absent) {+count:wurde|wurden} ausgelassen, da die Artenliste nicht als vollständig angegeben wurde. Eine Abwesenheit wird nur geschrieben, wenn in der Probe nach allen Arten der Liste gesucht wurde.`,
      fr: `{count} {+count:cellule marquée|cellules marquées} comme absente (0, -, absent) {+count:a été ignorée|ont été ignorées}, car la liste d'espèces n'a pas été déclarée complète. Une absence n'est écrite que si toutes les espèces de la liste ont été recherchées dans l'échantillon.`,
    },
    technical: `{file}, {sheet}: {count} cell(s) of a presence-only sheet marked absent (0, -, absent, ...) not converted (full species list not ticked). With the tick they become occurrenceStatus absent.`,
  },
  // CONV-ID-DUPLICATE of a sheet whose rows differ in one ignored column (`column` = its header): the advice is the replicate role, not another code
  'CONV-ID-DUPLICATE:replicate': {
    plain: {
      pl: `Ten sam identyfikator powstaje więcej niż raz, np. „{value}”, {+lineCount:w wierszu|w wierszach|w wierszach} {lines}, a wiersze te różnią się w pominiętej kolumnie „{column}”. Jeśli numeruje ona powtórzenia lub podpróbki jednej próbki (ramka, kwadrat, powtórzenie), nadaj jej rolę „Powtórzenie / podpróbka”: każde powtórzenie stanie się osobnym zdarzeniem.`,
      en: `The same identifier is produced more than once, e.g. "{value}", in {+lineCount:line|lines} {lines}, and these rows differ in the ignored column "{column}". If it numbers replicates or sub-samples of one sample (frame, quadrat, replicate), give it the role "Replicate / sub-sample": each replicate then becomes its own event.`,
      de: `Dieselbe Kennung entsteht mehrfach, z. B. „{value}“, in {+lineCount:der Zeile|den Zeilen} {lines}, und diese Zeilen unterscheiden sich in der ignorierten Spalte „{column}“. Nummeriert sie Replikate oder Teilproben einer Probe (Rahmen, Quadrat, Replikat), geben Sie ihr die Rolle „Replikat / Teilprobe“: Jedes Replikat wird dann ein eigenes Ereignis.`,
      fr: `Le même identifiant est produit plusieurs fois, p. ex. « {value} », {+lineCount:à la ligne|aux lignes} {lines}, et ces lignes diffèrent par la colonne ignorée « {column} ». Si elle numérote des réplicats ou des sous-échantillons d'un même échantillon (cadre, quadrat, réplicat), donnez-lui le rôle « Réplicat / sous-échantillon » : chaque réplicat devient alors un événement distinct.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} repeated {kind} identifier(s), example "{value}". The rows differ in the ignored column "{column}" (the only ignored column, apart from measurements and quantities, whose values tell all of them apart). If it numbers replicates or sub-samples of one sample, give it the role "Replicate / sub-sample": a replicate event is <sample eventID>:<value>, under the sample, and the occurrences hang on it.`,
  },
  // CONV-ID-DUPLICATE where the ignored column tells MOST of the repeated IDs apart (`separated` of `count`): the replicate role is offered, and the rest are said
  'CONV-ID-DUPLICATE:replicate-partial': {
    plain: {
      pl: `Ten sam identyfikator powstaje więcej niż raz, np. „{value}”, {+lineCount:w wierszu|w wierszach|w wierszach} {lines} (powtórzone: {count}). Pominięta kolumna „{column}” rozróżnia wiersze w {separated} z {count} przypadków; jeśli numeruje powtórzenia lub podpróbki (ramka, kwadrat), nadaj jej rolę „Powtórzenie / podpróbka”. {+remaining:Zostanie|Zostaną|Zostanie} {remaining} {+remaining:grupa|grupy|grup} wierszy z tą samą próbką, powtórzeniem i taksonem: scal je albo rozróżnij.`,
      en: `The same identifier is produced more than once, e.g. "{value}", in {+lineCount:line|lines} {lines} ({count} repeated). The ignored column "{column}" tells the rows apart in {separated} of {count}: if it numbers replicates or sub-samples (frame, quadrat), give it the role "Replicate / sub-sample". {remaining} {+remaining:group|groups} of rows with the same sample, replicate and taxon would remain: merge them or tell them apart.`,
      de: `Dieselbe Kennung entsteht mehrfach, z. B. „{value}“, in {+lineCount:der Zeile|den Zeilen} {lines} (wiederholt: {count}). Die ignorierte Spalte „{column}“ unterscheidet die Zeilen in {separated} von {count}: Nummeriert sie Replikate oder Teilproben (Rahmen, Quadrat), geben Sie ihr die Rolle „Replikat / Teilprobe“. {remaining} {+remaining:Gruppe|Gruppen} mit gleicher Probe, gleichem Replikat und Taxon {+remaining:bliebe|blieben}: zusammenführen oder unterscheiden.`,
      fr: `Le même identifiant est produit plusieurs fois, p. ex. « {value} », {+lineCount:à la ligne|aux lignes} {lines} (répétés : {count}). La colonne ignorée « {column} » distingue les lignes dans {separated} cas sur {count} : si elle numérote des réplicats ou sous-échantillons (cadre, quadrat), donnez-lui le rôle « Réplicat / sous-échantillon ». {remaining} {+remaining:groupe resterait|groupes resteraient} (même échantillon, réplicat et taxon) : fusionnez-les ou distinguez-les.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} repeated {kind} identifier(s), example "{value}". The ignored column "{column}" tells the rows apart in {separated} of them (at least 80 % and at least two groups); giving it the role "Replicate / sub-sample" would leave {remaining} group(s) with the same sample, replicate and taxon, which are real duplicates of the source.`,
  },
  // CONV-ID-DUPLICATE of a long sheet that no ignored column explains: the rows are the same sample and taxon (and replicate)
  'CONV-ID-DUPLICATE:same-taxon': {
    plain: {
      pl: `Ten sam identyfikator występowania powstaje więcej niż raz, np. „{value}”, {+lineCount:w wierszu|w wierszach|w wierszach} {lines} (powtórzone: {count}). Ta sama próbka i ten sam takson w {rows} {+rows:wierszu|wierszach|wierszach}: scal je w jeden wiersz albo je rozróżnij (kolumna z identyfikatorem występowania lub stadium życia).`,
      en: `The same occurrence identifier is produced more than once, e.g. "{value}", in {+lineCount:line|lines} {lines} ({count} repeated). Same sample and same taxon in {rows} rows: merge them into one row, or tell them apart (a column with an occurrenceID or a life stage).`,
      de: `Dieselbe Vorkommenskennung entsteht mehrfach, z. B. „{value}“, in {+lineCount:der Zeile|den Zeilen} {lines} (wiederholt: {count}). Dieselbe Probe und dasselbe Taxon in {rows} Zeilen: führen Sie sie zu einer Zeile zusammen oder unterscheiden Sie sie (eine Spalte mit occurrenceID oder Lebensstadium).`,
      fr: `Le même identifiant d'occurrence est produit plusieurs fois, p. ex. « {value} », {+lineCount:à la ligne|aux lignes} {lines} (répétés : {count}). Même échantillon et même taxon dans {rows} lignes : fusionnez-les en une ligne ou distinguez-les (une colonne avec un occurrenceID ou un stade de vie).`,
    },
    technical: `{file}, {sheet}:{lines}: {count} repeated {kind} identifier(s), example "{value}": {rows} rows of the example have the same sample (event) and the same taxon, and no ignored column tells them apart. Merge the rows or give them an occurrenceID or life stage column.`,
  },
  // CONV-ID-DUPLICATE of a long sheet whose occurrenceIDs are the user's own column: the column repeats a value
  'CONV-ID-DUPLICATE:user-id': {
    plain: {
      pl: `Kolumna z identyfikatorami występowań powtarza tę samą wartość, np. „{value}”, {+lineCount:w wierszu|w wierszach|w wierszach} {lines} (powtórzone: {count}). Identyfikatory muszą być unikalne: popraw powtórzone wartości albo zmień rolę kolumny, aby konwerter utworzył identyfikatory sam.`,
      en: `The occurrenceID column repeats a value, e.g. "{value}", in {+lineCount:line|lines} {lines} ({count} repeated). Identifiers must be unique: correct the repeated values, or change the role of the column so that the converter makes the IDs itself.`,
      de: `Die occurrenceID-Spalte wiederholt einen Wert, z. B. „{value}“, in {+lineCount:der Zeile|den Zeilen} {lines} (wiederholt: {count}). Kennungen müssen eindeutig sein: Korrigieren Sie die wiederholten Werte oder ändern Sie die Rolle der Spalte, damit der Konverter die Kennungen selbst bildet.`,
      fr: `La colonne des occurrenceID répète une valeur, p. ex. « {value} », {+lineCount:à la ligne|aux lignes} {lines} (répétés : {count}). Les identifiants doivent être uniques : corrigez les valeurs répétées ou changez le rôle de la colonne pour que le convertisseur crée lui-même les identifiants.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} repeated {kind} identifier(s), example "{value}". The sheet's occurrenceIDs come from its own column (role occurrenceID), so rows with the same value are not known to be the same sample and taxon.`,
  },
  'CONV-ID-DUPLICATE:same-taxon-replicate': {
    plain: {
      pl: `Ten sam identyfikator występowania powstaje więcej niż raz, np. „{value}”, {+lineCount:w wierszu|w wierszach|w wierszach} {lines} (powtórzone: {count}). Ta sama próbka, to samo powtórzenie i ten sam takson w {rows} {+rows:wierszu|wierszach|wierszach}: scal je w jeden wiersz albo je rozróżnij (kolumna z identyfikatorem występowania lub stadium życia).`,
      en: `The same occurrence identifier is produced more than once, e.g. "{value}", in {+lineCount:line|lines} {lines} ({count} repeated). Same sample, same replicate and same taxon in {rows} rows: merge them into one row, or tell them apart (a column with an occurrenceID or a life stage).`,
      de: `Dieselbe Vorkommenskennung entsteht mehrfach, z. B. „{value}“, in {+lineCount:der Zeile|den Zeilen} {lines} (wiederholt: {count}). Dieselbe Probe, dasselbe Replikat und dasselbe Taxon in {rows} Zeilen: führen Sie sie zu einer Zeile zusammen oder unterscheiden Sie sie (eine Spalte mit occurrenceID oder Lebensstadium).`,
      fr: `Le même identifiant d'occurrence est produit plusieurs fois, p. ex. « {value} », {+lineCount:à la ligne|aux lignes} {lines} (répétés : {count}). Même échantillon, même réplicat et même taxon dans {rows} lignes : fusionnez-les en une ligne ou distinguez-les (une colonne avec un occurrenceID ou un stade de vie).`,
    },
    technical: `{file}, {sheet}:{lines}: {count} repeated {kind} identifier(s), example "{value}": {rows} rows of the example have the same sample, the same replicate and the same taxon, and no ignored column tells them apart. Merge the rows or give them an occurrenceID or life stage column.`,
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
  'CONV-ENV-ONLY-SHEET:other-taxa': {
    plain: {
      pl: `Ten arkusz ma mierzone wielkości, ale nie ma kolumny z taksonami ani z liczebnością, a gatunki są w innym arkuszu. Oznacz ten arkusz jako plik profilu lub środowiska, aby trafił razem z nimi jako pomiary, albo sprawdź ten plik w /check pod kątem innych repozytoriów.`,
      en: `This sheet has measured variables and no taxon or count column, while another sheet holds the species. Mark this sheet as a profile or environment file so that it goes with them as measurements, or check this file with /check for other repositories.`,
      de: `Dieses Blatt hat Messgrößen, aber keine Taxon- oder Anzahlspalte, die Arten stehen in einem anderen Blatt. Kennzeichnen Sie dieses Blatt als Profil- oder Umweltdatei, damit es als Messungen mitgeht, oder prüfen Sie diese Datei mit /check für andere Repositorien.`,
      fr: `Cette feuille a des variables mesurées mais ni colonne de taxon ni d'effectifs, alors qu'une autre feuille contient les espèces. Marquez cette feuille comme fichier de profil ou d'environnement pour qu'elle les accompagne comme mesures, ou vérifiez ce fichier avec /check pour d'autres dépôts.`,
    },
    technical: `{file}, {sheet}: as CONV-ENV-ONLY-SHEET, in an upload where another sheet that is not a profile file has a taxon column: this sheet is probably environmental data of the same cruise and is to be marked as a profile file.`,
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
  if (f.ruleId === 'CONV-NA-SKIPPED' && f.params.rows === 'yes') return PROFILE_VARIANTS[f.params.empty === 'yes' && typeof f.params.columns === 'string' ? 'CONV-NA-SKIPPED:rows-empty' : typeof f.params.columns === 'string' ? 'CONV-NA-SKIPPED:rows-columns' : 'CONV-NA-SKIPPED:rows'];
  if (f.ruleId === 'CONV-BIOMASS-UNIT-UNCLEAR' && f.params.none === 'yes') return PROFILE_VARIANTS['CONV-BIOMASS-UNIT-UNCLEAR:none'];
  if (f.ruleId === 'CONV-QUANTITY-REPEATED' && f.params.disagree === 'yes') return PROFILE_VARIANTS['CONV-QUANTITY-REPEATED:disagree'];
  if (f.ruleId === 'CONV-QUANTITY-REPEATED' && f.params.weight === 'yes') return PROFILE_VARIANTS['CONV-QUANTITY-REPEATED:weight'];
  if (f.ruleId === 'CONV-QUANTITY-REPEATED-ONCE' && f.params.weight === 'yes') return PROFILE_VARIANTS['CONV-QUANTITY-REPEATED-ONCE:weight'];
  if (f.ruleId === 'CONV-ID-DUPLICATE' && f.params.copyLike === 'yes') return PROFILE_VARIANTS['CONV-ID-DUPLICATE:copies'];
  if (f.ruleId === 'CONV-QUANTITY-SAME-IN-SAMPLE' && f.params.weight === 'yes') return PROFILE_VARIANTS['CONV-QUANTITY-SAME-IN-SAMPLE:weight'];
  if (f.ruleId === 'CONV-QUANTITY-SAME-IN-SAMPLE' && typeof f.params.alsoColumn === 'string') return PROFILE_VARIANTS['CONV-QUANTITY-SAME-IN-SAMPLE:also'];
  if (f.ruleId === 'CONV-ID-DUPLICATE' && f.params.sameValue === 'yes') return PROFILE_VARIANTS['CONV-ID-DUPLICATE:same-value'];
  if (f.ruleId === 'CONV-QUANTITY-REPEATED' && typeof f.params.alternative === 'string') return PROFILE_VARIANTS['CONV-QUANTITY-REPEATED:alternative'];
  if (f.ruleId === 'CONV-ZERO-SKIPPED' && f.params.marks === 'yes') return PROFILE_VARIANTS['CONV-ZERO-SKIPPED:presence'];
  if (f.ruleId === 'CONV-ID-DUPLICATE' && typeof f.params.column === 'string' && f.params.column !== '') {
    return PROFILE_VARIANTS[Number(f.params.remaining) > 0 ? 'CONV-ID-DUPLICATE:replicate-partial' : 'CONV-ID-DUPLICATE:replicate'];
  }
  if (f.ruleId === 'CONV-ID-DUPLICATE' && f.params.userId === 'yes') return PROFILE_VARIANTS['CONV-ID-DUPLICATE:user-id'];
  if (f.ruleId === 'CONV-ID-DUPLICATE' && f.params.sameTaxon === 'yes') return PROFILE_VARIANTS[f.params.replicate === 'yes' ? 'CONV-ID-DUPLICATE:same-taxon-replicate' : 'CONV-ID-DUPLICATE:same-taxon'];
  if (f.ruleId === 'CONV-SAMPLE-CODE-MISSING' && f.params.profile === 'yes') return PROFILE_VARIANTS[f.ruleId];
  if (f.ruleId === 'CONV-ID-DUPLICATE' && f.params.kind === 'level') return PROFILE_VARIANTS[f.ruleId];
  if (f.ruleId === 'CONV-ID-DUPLICATE' && f.params.kind === 'level-other') return PROFILE_VARIANTS['CONV-ID-DUPLICATE:other'];
  if (f.ruleId === 'CONV-ENV-ONLY-SHEET' && f.params.other === 'taxa') return PROFILE_VARIANTS['CONV-ENV-ONLY-SHEET:other-taxa'];
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
  const generic: Record<string, string> = { file: f.file ?? '', sheet: f.sheet ?? '', field: f.field ?? '', value: f.value ?? '', lines: formatLines(f.lines, MAX_LINE_RANGES) };
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

/** What the rows of CONV-ROW-NOT-UNDERSTOOD / CONV-ROW-LEFT-OUT are, by ledger reason: a phrase that follows the counted noun ("3 rows with ..."). Says what the converter did understand. */
const ROW_WHAT: Record<string, Record<Lang, string>> = {
  ragged: {
    en: 'with more or fewer fields than the header, so their values would sit under the wrong columns',
    pl: 'z większą lub mniejszą liczbą pól niż nagłówek, więc ich wartości trafiłyby pod złe kolumny',
    de: 'mit mehr oder weniger Feldern als die Kopfzeile, ihre Werte stünden also unter falschen Spalten',
    fr: "avec plus ou moins de champs que l'en-tête, leurs valeurs seraient donc sous de mauvaises colonnes",
  },
  'no-taxon': {
    en: 'with a number or a weight but no taxon name',
    pl: 'z liczbą lub masą, ale bez nazwy taksonu',
    de: 'mit einer Zahl oder einem Gewicht, aber ohne Taxonnamen',
    fr: 'avec un nombre ou un poids, mais sans nom de taxon',
  },
  'value-no-taxon': {
    en: 'with a number in a column read as a count, a weight or a variable, but no taxon name',
    pl: 'z liczbą w kolumnie czytanej jako liczebność, masa lub zmienna, ale bez nazwy taksonu',
    de: 'mit einer Zahl in einer als Anzahl, Gewicht oder Variable gelesenen Spalte, aber ohne Taxonnamen',
    fr: 'avec un nombre dans une colonne lue comme effectif, poids ou variable, mais sans nom de taxon',
  },
  'taxon-no-quantity': {
    en: 'with a taxon name and a number, but the sheet has no column read as a quantity',
    pl: 'z nazwą taksonu i liczbą, ale arkusz nie ma kolumny czytanej jako ilość',
    de: 'mit Taxonnamen und Zahl, aber das Blatt hat keine als Menge gelesene Spalte',
    fr: "avec un nom de taxon et un nombre, mais la feuille n'a pas de colonne lue comme quantité",
  },
  'empty-parameter': {
    en: 'with a value but no parameter name',
    pl: 'z wartością, ale bez nazwy parametru',
    de: 'mit einem Wert, aber ohne Parameternamen',
    fr: 'avec une valeur mais sans nom de paramètre',
  },
  'repeated-parameter': {
    en: 'that repeat a parameter already given for the same sample (the first value was kept)',
    pl: 'powtarzające parametr podany już dla tej samej próbki (zachowano pierwszą wartość)',
    de: 'die einen für dieselbe Probe schon angegebenen Parameter wiederholen (der erste Wert wurde behalten)',
    fr: 'qui répètent un paramètre déjà donné pour le même échantillon (la première valeur a été gardée)',
  },
  'not-in-event': {
    en: "whose value (a depth, a position or a date) the sample's event did not take",
    pl: 'których wartości (głębokości, pozycji lub daty) zdarzenie próbki nie przyjęło',
    de: 'deren Wert (Tiefe, Position oder Datum) das Ereignis der Probe nicht übernommen hat',
    fr: "dont la valeur (profondeur, position ou date) n'a pas été reprise par l'événement de l'échantillon",
  },
  unexplained: {
    en: 'that the converter neither wrote nor gave a reason for (a fault of the converter)',
    pl: 'których konwerter ani nie zapisał, ani nie podał powodu (błąd konwertera)',
    de: 'die der Konverter weder geschrieben noch begründet hat (ein Fehler des Konverters)',
    fr: "que le convertisseur n'a ni écrites ni expliquées (un défaut du convertisseur)",
  },
};
const rowWhat = (reason: unknown, lang: Lang): string => {
  const code = String(reason);
  const known = Object.prototype.hasOwnProperty.call(ROW_WHAT, code) ? ROW_WHAT[code] : undefined;
  if (known !== undefined) return known[lang];
  return {
    en: `that were not written (reason: ${code})`,
    pl: `które nie zostały zapisane (powód: ${code})`,
    de: `die nicht geschrieben wurden (Grund: ${code})`,
    fr: `qui n'ont pas été écrites (raison : ${code})`,
  }[lang];
};

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
  if (f.ruleId === 'CONV-SHEET-TRANSPOSED') f = { ...f, params: { ...f.params, reason: transposedWords(f.params.reason, lang) } };
  if (f.ruleId === 'CONV-ROW-NOT-UNDERSTOOD' || f.ruleId === 'CONV-ROW-LEFT-OUT') f = { ...f, params: { ...f.params, what: rowWhat(f.params.reason, lang) } };
  if (f.ruleId === 'CONV-ID-REVISIT') f = { ...f, params: { ...f.params, by: visitWords(f.params.by, lang) } };
  if (f.ruleId === 'CONV-NERC-UNKNOWN' && typeof f.params.what === 'string') f = { ...f, params: { ...f.params, what: shortList(quantityWhat(f.params.what, lang)) } };
  if (f.ruleId === 'CONV-PROFILE-LEVEL-INCOMPLETE' && typeof f.params.what === 'string') f = { ...f, params: { ...f.params, what: LEVEL_WHAT_WORDS[f.params.what]?.[lang] ?? f.params.what } };
  if (f.ruleId === 'CONV-EMOF-ORPHAN' && typeof f.params.kind === 'string') f = { ...f, params: { ...f.params, kind: KIND_WORDS[f.params.kind]?.[lang] ?? f.params.kind } };
  if (f.ruleId === 'CONV-PROFILE-STATION-UNMATCHED' && typeof f.params.names === 'string') f = { ...f, params: { ...f.params, names: stationList(f.params.names) } };
  // the pairs of CONV-PROFILE-STATION-FAR are separated by "; " (a station text may hold a comma): the first few, then the count of the rest
  if ((f.ruleId === 'CONV-PROFILE-STATION-FAR' || f.ruleId === 'CONV-PROFILE-STATION-CAST-MATCHED') && typeof f.params.names === 'string') {
    const items = f.params.names.split('; ');
    f = { ...f, params: { ...f.params, names: items.length <= 4 ? items.join('; ') : `${items.slice(0, 4).join('; ')}; … (+${items.length - 4})` } };
  }
  if (f.ruleId === 'CONV-SAMPLE-CONFLICT' && typeof f.params.what === 'string') f = { ...f, params: { ...f.params, what: conflictWords(f.params.what, lang) } };
  if (f.ruleId === 'CONV-ID-DUPLICATE' && typeof f.params.used === 'string') f = { ...f, params: { ...f.params, used: f.params.used.split(', ').map((w) => USED_WORDS[w]?.[lang] ?? w).join(', ') } };
  const variant = profileVariant(f);
  let text = fill(variant ? variant.plain[lang] || variant.plain.en : rule.plain[lang] || rule.plain.en, f, lang);
  // sentences that follow when their param is set (CONV-SAMPLE-CONFLICT: the offer of the tick "of each organism", only for a column that can be one)
  for (const extra of rule.plainIf ?? []) {
    const v = f.params[extra.param];
    if (v !== undefined && v !== '') text = `${text} ${fill(extra.plain[lang] || extra.plain.en, f, lang)}`;
  }
  return text;
}


/** The attributes CONV-SAMPLE-CONFLICT lists in `what` (date, position, depth, depth below seafloor, sample size, measured value (column)), in the reader's language. */
const CONFLICT_WORDS: Record<string, Record<Lang, string>> = {
  date: { en: 'date', pl: 'data', de: 'Datum', fr: 'date' },
  position: { en: 'position', pl: 'pozycja', de: 'Position', fr: 'position' },
  depth: { en: 'depth', pl: 'głębokość', de: 'Tiefe', fr: 'profondeur' },
  'depth below seafloor': { en: 'depth below seafloor', pl: 'głębokość pod dnem', de: 'Tiefe unter dem Meeresboden', fr: 'profondeur sous le fond' },
  'sample size': { en: 'sample size', pl: 'wielkość próby', de: 'Probengröße', fr: "taille de l'échantillon" },
  'measured value': { en: 'measured value', pl: 'wartość zmierzona', de: 'Messwert', fr: 'valeur mesurée' },
};
const conflictWords = (what: unknown, lang: Lang): string =>
  String(what)
    .split(/, (?=(?:date|position|depth below seafloor|depth|sample size|measured value)(?: \(|,|$))/)
    .map((w) => {
      const m = /^(date|position|depth below seafloor|depth|sample size|measured value)(.*)$/s.exec(w);
      return m === null ? w : `${CONFLICT_WORDS[m[1]]?.[lang] ?? m[1]}${m[2]}`;
    })
    .join(', ');

/** What a visit's ID holds (CONV-ID-REVISIT carries date | time | depth, comma separated, in `by`). */
const VISIT_WORDS: Record<string, Record<Lang, string>> = {
  date: { en: 'date', pl: 'data', de: 'Datum', fr: 'date' },
  time: { en: 'time', pl: 'godzina', de: 'Uhrzeit', fr: 'heure' },
  depth: { en: 'depth', pl: 'głębokość', de: 'Tiefe', fr: 'profondeur' },
};
const visitWords = (by: unknown, lang: Lang): string =>
  String(by)
    .split(', ')
    .map((p) => VISIT_WORDS[p]?.[lang] ?? p)
    .join(', ');

/** The reason code of CONV-SHEET-TRANSPOSED in words (the texts of recognize/layoutReasons.ts, shared with /check). */
const transposedWords = (code: unknown, lang: Lang): string => reasonsText([{ code: code === 'transposed' ? 'transposed' : 'transposed-taxa' }], lang);

/** The English technical detail line. */
export function renderConvertTechnical(f: Finding): string {
  f = withDefaults(f);
  if (f.ruleId === 'CONV-SHEET-TRANSPOSED') f = { ...f, params: { ...f.params, reason: transposedWords(f.params.reason, 'en') } };
  if (f.ruleId === 'CONV-ROW-NOT-UNDERSTOOD' || f.ruleId === 'CONV-ROW-LEFT-OUT') f = { ...f, params: { ...f.params, what: rowWhat(f.params.reason, 'en') } };
  if (f.ruleId === 'CONV-ID-REVISIT') f = { ...f, params: { ...f.params, by: visitWords(f.params.by, 'en') } };
  return fill(profileVariant(f)?.technical ?? getConvertRule(f.ruleId).technical, f);
}
