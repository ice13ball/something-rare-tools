// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { CITE } from './citations';
import type { RuleSpec } from './spec';

/*
 * Darwin Core structure rules (category 'B'), raised by checks/dwc.ts while the dataset is built. They run only on Darwin Core
 * input (a Darwin Core Archive, or a table with several distinctive Darwin Core terms in its header: see checks/dwc.ts), never on
 * an ordinary measurement sheet.
 * Declared params per rule:
 *   DWC-TERM-MISSING          core, terms     core = Occurrence | Event; terms = the required terms that have no column, comma-separated
 *   DWC-TERM-EMPTY            count           field = the required column, lines = the rows without a value, count = how many
 *   DWC-RECOMMENDED           core, terms     terms = recommended terms with no column or no value in any row, comma-separated
 *   DWC-VOCAB-VALUE           allowed         field = column, value = the value not in the list (one finding per value), lines = its rows
 *   DWC-EVENTID-DUPLICATE     count           value = an example eventID, lines = every row of a repeated eventID, count = repeated eventIDs
 *   DWC-PARENT-DANGLING       count           value = an example parentEventID, lines = rows pointing at an eventID that is not there
 *   DWC-PARENT-LOOP           count           value = an eventID on the loop, lines = rows on a loop, count = rows on a loop
 *   DWC-OCCURRENCEID-DUPLICATE count          value = an example occurrenceID, lines = every row of a repeated occurrenceID, count = repeated ids
 */
export const DWC_RULES: readonly RuleSpec[] = [
  {
    id: 'DWC-TERM-MISSING',
    category: 'B',
    severity: 'error',
    params: ['core', 'terms'],
    citations: [CITE.obistoolsRequired, CITE.obisManualRequired],
    plain: {
      pl: `To wygląda na tabelę Darwin Core ({core}), ale nie ma w niej kolumn wymaganych przez OBIS: {terms}. Dodaj je; bez nich rekordy nie nadają się do publikacji w OBIS.`,
      en: `This looks like a Darwin Core table ({core}), but it has no column for terms that OBIS requires: {terms}. Add them; without them the records are not fit to publish in OBIS.`,
      de: `Das sieht nach einer Darwin-Core-Tabelle ({core}) aus, aber es fehlen Spalten für Begriffe, die OBIS verlangt: {terms}. Ergänzen Sie sie; ohne sie sind die Datensätze nicht für OBIS geeignet.`,
      fr: `Ceci ressemble à une table Darwin Core ({core}), mais elle n'a pas de colonne pour des termes exigés par OBIS : {terms}. Ajoutez-les ; sans eux, les enregistrements ne conviennent pas à une publication dans OBIS.`,
    },
    technical: `{file}: Darwin Core input ({core} core) without a column for the required term(s) {terms}. Required: occurrenceID (Occurrence core) or eventID (Event core), eventDate, decimalLatitude, decimalLongitude, and for an Occurrence core scientificName, occurrenceStatus, basisOfRecord (obistools check_fields; OBIS Manual). scientificNameID is only recommended (DWC-RECOMMENDED).`,
  },
  {
    id: 'DWC-TERM-EMPTY',
    category: 'B',
    severity: 'error',
    params: ['count'],
    citations: [CITE.obistoolsRequired, CITE.obisManualRequired],
    plain: {
      pl: `W kolumnie „{field}”, wymaganej przez OBIS, brakuje wartości w wierszach {lines} (razem: {count}). Uzupełnij je.`,
      en: `Column "{field}", which OBIS requires, has no value in lines {lines} ({count} in all). Fill them in.`,
      de: `Die Spalte „{field}“, die OBIS verlangt, hat in den Zeilen {lines} keinen Wert (insgesamt {count}). Ergänzen Sie sie.`,
      fr: `La colonne « {field} », exigée par OBIS, n'a pas de valeur aux lignes {lines} ({count} au total). Complétez-les.`,
    },
    technical: `{file}:{lines} field {field}: {count} empty value(s) in a column OBIS requires (obistools check_fields: "Empty value for required field"). For decimalLatitude, decimalLongitude and eventDate only a column empty in every row is reported here (single missing positions are ROW-NO-COORD, single missing dates ROW-DATE-MISSING; where no date exists anywhere, data or metadata, META-NO-DATES says it instead).`,
  },
  {
    id: 'DWC-RECOMMENDED',
    category: 'B',
    severity: 'warning',
    params: ['core', 'terms'],
    citations: [CITE.obistoolsRecommended, CITE.obisManualRequired],
    plain: {
      pl: `OBIS zaleca także: {terms}. W tej tabeli Darwin Core ({core}) nie ma tych kolumn albo są puste we wszystkich wierszach. To nie błąd, ale ułatwia kontrolę danych i dopasowanie nazw.`,
      en: `OBIS also recommends the following, which this Darwin Core table ({core}) lacks or leaves empty in every row: {terms}. It is not an error, but it makes the data easier to check and the names easier to match.`,
      de: `OBIS empfiehlt außerdem Folgendes, was dieser Darwin-Core-Tabelle ({core}) fehlt oder in jeder Zeile leer ist: {terms}. Das ist kein Fehler, erleichtert aber die Prüfung der Daten und den Namensabgleich.`,
      fr: `OBIS recommande aussi ce qui suit, absent de cette table Darwin Core ({core}) ou vide dans chaque ligne : {terms}. Ce n'est pas une erreur, mais cela facilite le contrôle des données et la mise en correspondance des noms.`,
    },
    technical: `{file}: Darwin Core input ({core} core) without a column, or with no value in any row, for the recommended term(s) {terms}. Recommended: minimumDepthInMeters and maximumDepthInMeters (obistools check_fields), scientificNameID for an Occurrence core ("strongly recommended", OBIS Manual; obistools lists it as required).`,
  },
  {
    id: 'DWC-VOCAB-VALUE',
    category: 'B',
    severity: 'warning',
    params: ['allowed'],
    citations: [CITE.obisBasisOfRecord, CITE.gbifBasisOfRecord, CITE.biocheckBasisOfRecord, CITE.obisOccurrenceStatus],
    plain: {
      pl: `W kolumnie „{field}” wartość „{value}” (wiersze {lines}) nie jest na liście, którą przyjmuje OBIS: {allowed}. Wielkość liter nie ma znaczenia, ale zapis musi być taki jak na liście. Popraw wartość.`,
      en: `In column "{field}" the value "{value}" (lines {lines}) is not on the list OBIS accepts: {allowed}. Capitalisation does not matter, but the spelling must be that of the list. Correct the value.`,
      de: `In der Spalte „{field}“ steht der Wert „{value}“ (Zeilen {lines}), der nicht auf der von OBIS akzeptierten Liste steht: {allowed}. Groß- und Kleinschreibung ist egal, aber die Schreibweise muss der Liste entsprechen. Korrigieren Sie den Wert.`,
      fr: `Dans la colonne « {field} », la valeur « {value} » (lignes {lines}) n'est pas dans la liste acceptée par OBIS : {allowed}. La casse n'importe pas, mais l'orthographe doit être celle de la liste. Corrigez la valeur.`,
    },
    technical: `{file}:{lines} field {field} value '{value}': not in the vocabulary obis-qc compares with, in lower case, after OBIS trims the ends: {allowed}. basisOfRecord: the eight identifiers of the GBIF vocabulary basis_of_record_2022-02-02 (the obis-qc README also names Event and Taxon; the code reads the vocabulary file); occurrenceStatus: absent, present, notDetected, detected. One finding per value.`,
  },
  {
    id: 'DWC-EVENTID-DUPLICATE',
    category: 'B',
    severity: 'error',
    params: ['count'],
    citations: [CITE.obistoolsEventIds],
    plain: {
      pl: `W wierszach {lines} powtarzają się identyfikatory zdarzeń (np. „{value}”; razem powtórzonych: {count}). Każde zdarzenie musi mieć własny, niepowtarzalny eventID, bo inaczej nie wiadomo, do którego należą rekordy podrzędne.`,
      en: `In lines {lines} event identifiers repeat (e.g. "{value}"; {count} repeated in all). Every event needs its own unique eventID, otherwise it is unclear which event the dependent records belong to.`,
      de: `In den Zeilen {lines} wiederholen sich Ereignis-IDs (z. B. „{value}“; insgesamt {count} wiederholte). Jedes Ereignis braucht eine eigene eindeutige eventID, sonst ist unklar, zu welchem Ereignis abhängige Datensätze gehören.`,
      fr: `Aux lignes {lines}, des identifiants d'événement se répètent (par ex. « {value} » ; {count} répétés au total). Chaque événement a besoin d'un eventID unique, sinon on ne sait pas à quel événement appartiennent les enregistrements dépendants.`,
    },
    technical: `{file}:{lines} eventID '{value}' and {count} repeated eventID(s) in all, in an Event core (obistools check_eventids: "eventID ... is duplicated"). Every row of a repeated eventID is listed. Not run on an Occurrence core, where one eventID legitimately repeats.`,
  },
  {
    id: 'DWC-PARENT-DANGLING',
    category: 'B',
    severity: 'error',
    params: ['count'],
    citations: [CITE.obistoolsEventIds, CITE.biocheckParentEvent],
    plain: {
      pl: `W wierszach {lines} parentEventID (np. „{value}”; razem różnych: {count}) wskazuje zdarzenie, którego nie ma w kolumnie eventID tej tabeli. Popraw identyfikator albo dodaj brakujące zdarzenie nadrzędne.`,
      en: `In lines {lines} the parentEventID (e.g. "{value}"; {count} different in all) points at an event that is not in this table's eventID column. Correct the identifier or add the missing parent event.`,
      de: `In den Zeilen {lines} verweist die parentEventID (z. B. „{value}“; insgesamt {count} verschiedene) auf ein Ereignis, das nicht in der eventID-Spalte dieser Tabelle steht. Korrigieren Sie die ID oder ergänzen Sie das fehlende übergeordnete Ereignis.`,
      fr: `Aux lignes {lines}, le parentEventID (par ex. « {value} » ; {count} différents au total) désigne un événement absent de la colonne eventID de cette table. Corrigez l'identifiant ou ajoutez l'événement parent manquant.`,
    },
    technical: `{file}:{lines} parentEventID '{value}' ({count} different in all) has no matching eventID in the Event core (obistools check_eventids; Biocheck). Not run when the archive was read only in part (IN-DWCA-PARTIAL).`,
  },
  {
    id: 'DWC-PARENT-LOOP',
    category: 'B',
    severity: 'error',
    params: ['count'],
    citations: [CITE.gbifParentLineage],
    plain: {
      pl: `W wierszach {lines} (razem: {count}) hierarchia zdarzeń zamyka się w pętlę: zdarzenie jest swoim własnym przodkiem (np. „{value}”). Popraw parentEventID tak, by hierarchia kończyła się zdarzeniem bez rodzica.`,
      en: `In lines {lines} ({count} in all) the event hierarchy runs in a circle: an event is its own ancestor (e.g. "{value}"). Correct the parentEventID so that the hierarchy ends in an event without a parent.`,
      de: `In den Zeilen {lines} (insgesamt {count}) läuft die Ereignishierarchie im Kreis: Ein Ereignis ist sein eigener Vorfahre (z. B. „{value}“). Korrigieren Sie die parentEventID, sodass die Hierarchie bei einem Ereignis ohne Eltern endet.`,
      fr: `Aux lignes {lines} ({count} au total), la hiérarchie des événements tourne en rond : un événement est son propre ancêtre (par ex. « {value} »). Corrigez le parentEventID pour que la hiérarchie se termine par un événement sans parent.`,
    },
    technical: `{file}:{lines} {count} row(s) lie on a loop of the eventID / parentEventID hierarchy (e.g. eventID '{value}'; GBIF OccurrenceIssue PARENT_EVENT_INFINITE_LINEAGE). A row whose parentEventID equals its own eventID is a loop of one. Linear-time detection.`,
  },
  {
    id: 'DWC-OCCURRENCEID-DUPLICATE',
    category: 'B',
    severity: 'error',
    params: ['count'],
    citations: [CITE.biocheckOccurrenceId],
    plain: {
      pl: `W wierszach {lines} powtarzają się occurrenceID (np. „{value}”; razem powtórzonych: {count}). occurrenceID jest kluczem rekordu i musi być niepowtarzalny; nadaj każdemu rekordowi własny identyfikator.`,
      en: `In lines {lines} occurrenceIDs repeat (e.g. "{value}"; {count} repeated in all). The occurrenceID is the key of a record and must be unique; give every record its own identifier.`,
      de: `In den Zeilen {lines} wiederholen sich occurrenceIDs (z. B. „{value}“; insgesamt {count} wiederholte). Die occurrenceID ist der Schlüssel eines Datensatzes und muss eindeutig sein; geben Sie jedem Datensatz eine eigene ID.`,
      fr: `Aux lignes {lines}, des occurrenceID se répètent (par ex. « {value} » ; {count} répétés au total). L'occurrenceID est la clé d'un enregistrement et doit être unique ; donnez à chaque enregistrement son propre identifiant.`,
    },
    technical: `{file}:{lines} occurrenceID '{value}' and {count} repeated occurrenceID(s) in all (Biocheck: "occurrenceID is unique in the occurrence table", the primary key). Every row of a repeated occurrenceID is listed.`,
  },
];
