// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RuleSpec } from './spec';

/*
 * The rules of the "pack as Darwin Core as it is" mode of /convert (core/convert/dwcAsIs*.ts). They stand in the sheet's terms: the file, the sheet and the
 * physical lines of the source. The measurement checks of this mode reuse CONV-EMOF-ORPHAN and CONV-EMOF-EVENT-MISMATCH.
 *
 *   CONV-ASIS-EVENT-ID-DUPLICATE   count   lines = the repeats of an eventID in the Event sheet        (blocks)
 *   CONV-ASIS-OCC-ID-DUPLICATE     count   lines = the repeats of an occurrenceID                      (blocks)
 *   CONV-ASIS-OCC-ORPHAN           count   lines = occurrences whose eventID is blank or not in Event  (blocks)
 *   CONV-ASIS-COLUMN-REPEATED      columns, count   two columns of one sheet are the same term         (blocks)
 *   CONV-ASIS-EMOF-ROWS-NOT-WRITTEN count  lines = eMoF rows with a value and no type, or a type and no value (accept)
 *   CONV-ASIS-COLUMNS-NOT-TERM     columns, count   columns that are not Darwin Core terms             (show)
 *   CONV-ASIS-COLUMNS-OTHER-LEVEL  columns, count, table   terms that do not belong in that table      (accept)
 *   CONV-ASIS-EMOF-REDUNDANT       (none)  the scientificName of the measurement sheet                  (show)
 */
export const DWC_AS_IS_RULES: readonly RuleSpec[] = [
  {
    id: 'CONV-ASIS-EVENT-ID-DUPLICATE',
    category: 'B',
    severity: 'error',
    exportPolicy: 'block',
    params: ['count'],
    plain: {
      pl: `{count} {+count:wiersz arkusza zdarzeń powtarza|wiersze arkusza zdarzeń powtarzają|wierszy arkusza zdarzeń powtarza} eventID, który już wystąpił wyżej (np. „{value}”, {+lineCount:wiersz|wiersze|wierszy} {lines}). Każde zdarzenie musi mieć własny eventID; narzędzie nie zmienia identyfikatorów z pliku.`,
      en: `{count} {+count:row of the event sheet repeats|rows of the event sheet repeat} an eventID that stands higher up (e.g. "{value}", {+lineCount:line|lines} {lines}). Every event needs its own eventID; the tool does not change the identifiers of your file.`,
      de: `{count} {+count:Zeile des Ereignisblatts wiederholt|Zeilen des Ereignisblatts wiederholen} eine eventID, die weiter oben schon steht (z. B. „{value}“, {+lineCount:Zeile|Zeilen} {lines}). Jedes Ereignis braucht eine eigene eventID; das Werkzeug ändert die Kennungen Ihrer Datei nicht.`,
      fr: `{count} {+count:ligne de la feuille des événements répète|lignes de la feuille des événements répètent} un eventID déjà présent plus haut (p. ex. « {value} », {+lineCount:ligne|lignes} {lines}). Chaque événement doit avoir son propre eventID ; l'outil ne modifie pas les identifiants de votre fichier.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} Event row(s) repeat an eventID (first repeated value "{value}"). The Event core's id must be unique; the eventID of the file is never changed (as-is mode).`,
  },
  {
    id: 'CONV-ASIS-OCC-ID-DUPLICATE',
    category: 'B',
    severity: 'error',
    exportPolicy: 'block',
    params: ['count'],
    plain: {
      pl: `{count} {+count:wiersz arkusza wystąpień powtarza|wiersze arkusza wystąpień powtarzają|wierszy arkusza wystąpień powtarza} occurrenceID, który już wystąpił wyżej (np. „{value}”, {+lineCount:wiersz|wiersze|wierszy} {lines}). Każde wystąpienie musi mieć własny occurrenceID; narzędzie nie zmienia identyfikatorów z pliku.`,
      en: `{count} {+count:row of the occurrence sheet repeats|rows of the occurrence sheet repeat} an occurrenceID that stands higher up (e.g. "{value}", {+lineCount:line|lines} {lines}). Every occurrence needs its own occurrenceID; the tool does not change the identifiers of your file.`,
      de: `{count} {+count:Zeile des Vorkommensblatts wiederholt|Zeilen des Vorkommensblatts wiederholen} eine occurrenceID, die weiter oben schon steht (z. B. „{value}“, {+lineCount:Zeile|Zeilen} {lines}). Jedes Vorkommen braucht eine eigene occurrenceID; das Werkzeug ändert die Kennungen Ihrer Datei nicht.`,
      fr: `{count} {+count:ligne de la feuille des occurrences répète|lignes de la feuille des occurrences répètent} un occurrenceID déjà présent plus haut (p. ex. « {value} », {+lineCount:ligne|lignes} {lines}). Chaque occurrence doit avoir son propre occurrenceID ; l'outil ne modifie pas les identifiants de votre fichier.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} Occurrence row(s) repeat an occurrenceID (first repeated value "{value}"). The occurrenceID of the file is never changed (as-is mode).`,
  },
  {
    id: 'CONV-ASIS-OCC-ORPHAN',
    category: 'B',
    severity: 'error',
    exportPolicy: 'block',
    params: ['count'],
    plain: {
      pl: `{count} {+count:wystąpienie wskazuje|wystąpienia wskazują|wystąpień wskazuje} na eventID, którego nie ma w arkuszu zdarzeń albo który jest pusty (np. „{value}”, {+lineCount:wiersz|wiersze|wierszy} {lines}). Wystąpienie bez swojego zdarzenia zostałoby odrzucone.`,
      en: `{count} {+count:occurrence refers|occurrences refer} to an eventID that is not in the event sheet or is empty (e.g. "{value}", {+lineCount:line|lines} {lines}). An occurrence without its event would be rejected.`,
      de: `{count} {+count:Vorkommen verweist|Vorkommen verweisen} auf eine eventID, die im Ereignisblatt fehlt oder leer ist (z. B. „{value}“, {+lineCount:Zeile|Zeilen} {lines}). Ein Vorkommen ohne sein Ereignis würde abgelehnt.`,
      fr: `{count} {+count:occurrence renvoie|occurrences renvoient} à un eventID absent de la feuille des événements ou vide (p. ex. « {value} », {+lineCount:ligne|lignes} {lines}). Une occurrence sans son événement serait rejetée.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} Occurrence row(s) have an eventID that is empty or not in the Event sheet (first value "{value}"). BioCheck: an occurrence eventID that is not in the core is an error.`,
  },
  {
    id: 'CONV-ASIS-COLUMN-REPEATED',
    category: 'B',
    severity: 'error',
    exportPolicy: 'block',
    params: ['columns', 'count'],
    plain: {
      pl: `W arkuszu {sheet} {count} {+count:kolumna jest tym samym terminem|kolumny są tym samym terminem|kolumn jest tym samym terminem} co wcześniejsza kolumna ({columns}). Narzędzie nie wybiera między nimi; zostaw jedną.`,
      en: `In the sheet {sheet}, {count} {+count:column is|columns are} the same term as an earlier column ({columns}). The tool does not choose between them; keep one.`,
      de: `Im Blatt {sheet} {+count:ist|sind} {count} {+count:Spalte|Spalten} derselbe Begriff wie eine frühere Spalte ({columns}). Das Werkzeug wählt nicht zwischen ihnen; behalten Sie eine.`,
      fr: `Dans la feuille {sheet}, {count} {+count:colonne est|colonnes sont} le même terme qu'une colonne précédente ({columns}). L'outil ne choisit pas entre elles ; gardez-en une.`,
    },
    technical: `{file}, {sheet}: {count} column(s) name a term that an earlier column of the sheet already names ({columns}); as-is mode carries each term once and does not pick.`,
  },
  {
    id: 'CONV-ASIS-EMOF-ROWS-NOT-WRITTEN',
    category: 'B',
    severity: 'warning',
    exportPolicy: 'accept',
    params: ['count'],
    plain: {
      pl: `{count} {+count:wiersz pomiarów nie został zapisany|wiersze pomiarów nie zostały zapisane|wierszy pomiarów nie zostało zapisanych}: ma wartość bez rodzaju pomiaru albo rodzaj bez wartości ({+lineCount:wiersz|wiersze|wierszy} {lines}). Są na liście niezapisanych wierszy.`,
      en: `{count} measurement {+count:row was|rows were} not written: a value without a kind of measurement, or a kind without a value ({+lineCount:line|lines} {lines}). They are in the list of rows not written.`,
      de: `{count} {+count:Messzeile wurde|Messzeilen wurden} nicht geschrieben: ein Wert ohne Messart oder eine Messart ohne Wert ({+lineCount:Zeile|Zeilen} {lines}). Sie stehen in der Liste der nicht geschriebenen Zeilen.`,
      fr: `{count} {+count:ligne de mesure n'a pas été écrite|lignes de mesure n'ont pas été écrites} : une valeur sans type de mesure, ou un type sans valeur ({+lineCount:ligne|lignes} {lines}). Elles figurent dans la liste des lignes non écrites.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} eMoF row(s) have a measurementValue and no measurementType, or the reverse (or neither with other cells filled); not written, listed in the list of rows not written (as-is mode).`,
  },
  {
    id: 'CONV-ASIS-COLUMNS-NOT-TERM',
    category: 'B',
    severity: 'info',
    exportPolicy: 'show',
    params: ['columns', 'count'],
    plain: {
      pl: `W arkuszu {sheet} {count} {+count:kolumna nie jest terminem Darwin Core i nie zostanie zapisana|kolumny nie są terminami Darwin Core i nie zostaną zapisane|kolumn nie jest terminami Darwin Core i nie zostanie zapisanych}: {columns}.`,
      en: `In the sheet {sheet}, {count} {+count:column is not a Darwin Core term and is not written|columns are not Darwin Core terms and are not written}: {columns}.`,
      de: `Im Blatt {sheet} {+count:ist|sind} {count} {+count:Spalte kein Darwin-Core-Begriff und wird|Spalten keine Darwin-Core-Begriffe und werden} nicht geschrieben: {columns}.`,
      fr: `Dans la feuille {sheet}, {count} {+count:colonne n'est pas un terme Darwin Core et n'est pas écrite|colonnes ne sont pas des termes Darwin Core et ne sont pas écrites} : {columns}.`,
    },
    technical: `{file}, {sheet}: {count} column(s) are not Darwin Core terms ({columns}); not written, reason "not a Darwin Core term" (as-is mode).`,
  },
  {
    id: 'CONV-ASIS-COLUMNS-OTHER-LEVEL',
    category: 'B',
    severity: 'warning',
    exportPolicy: 'accept',
    params: ['columns', 'count', 'table'],
    plain: {
      pl: `W arkuszu {sheet} {count} {+count:kolumna jest terminem innej tabeli i nie pasuje do|kolumny są terminami innej tabeli i nie pasują do|kolumn jest terminami innej tabeli i nie pasuje do} {table}: {columns}. Narzędzie nie przenosi ich po cichu, więc nie zostaną zapisane.`,
      en: `In the sheet {sheet}, {count} {+count:column is a term of another table and does not belong in|columns are terms of another table and do not belong in} {table}: {columns}. The tool does not move them silently, so they are not written.`,
      de: `Im Blatt {sheet} {+count:ist|sind} {count} {+count:Spalte ein Begriff|Spalten Begriffe} einer anderen Tabelle und {+count:gehört|gehören} nicht in {table}: {columns}. Das Werkzeug verschiebt sie nicht stillschweigend, daher werden sie nicht geschrieben.`,
      fr: `Dans la feuille {sheet}, {count} {+count:colonne est un terme|colonnes sont des termes} d'une autre table et {+count:n'a|n'ont} pas sa place dans {table} : {columns}. L'outil ne les déplace pas en silence ; elles ne sont donc pas écrites.`,
    },
    technical: `{file}, {sheet}: {count} column(s) are Darwin Core terms of another table level ({columns}) and are not valid in {table}; not written, never moved (as-is mode).`,
  },
  {
    id: 'CONV-ASIS-EMOF-REDUNDANT',
    category: 'B',
    severity: 'info',
    exportPolicy: 'show',
    params: [],
    plain: {
      pl: `W arkuszu pomiarów {sheet} kolumna scientificName obok occurrenceID jest zbędna (nazwę ma wystąpienie), więc nie jest zapisana. eventID służy tylko do powiązania z zdarzeniem.`,
      en: `In the measurement sheet {sheet}, the scientificName column beside occurrenceID is redundant (the occurrence has the name), so it is not written. The eventID only links the row to its event.`,
      de: `Im Messblatt {sheet} ist die Spalte scientificName neben occurrenceID überflüssig (das Vorkommen hat den Namen) und wird nicht geschrieben. Die eventID dient nur der Verknüpfung mit dem Ereignis.`,
      fr: `Dans la feuille de mesures {sheet}, la colonne scientificName à côté d'occurrenceID est redondante (l'occurrence porte le nom) ; elle n'est pas écrite. L'eventID ne sert qu'à relier la ligne à son événement.`,
    },
    technical: `{file}, {sheet}: the eMoF sheet has scientificName beside occurrenceID; redundant, not written (the eventID column is kept only as the extension's link, not as a field).`,
  },
];
