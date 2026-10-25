// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Finding, Lang, RuleDef } from '../types';
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
 *   CONV-EFFORT-INVALID        count            field = column, value = an example, lines = rows
 *   CONV-NO-TAXON              shape            shape = wide | long
 *   CONV-SUMMARY-ROW-SKIPPED   count            value = the labels, lines = rows
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
      pl: `{count} nazw taksonów ma dopisek (cf., sp., ?) albo stadium rozwojowe (c2, juv). Zatwierdź każdy podział na nazwę, dopisek i stadium; pierwszy to „{value}”.`,
      en: `{count} taxon names carry a qualifier (cf., sp., ?) or a life stage (c2, juv). Approve each split into name, qualifier and stage; the first one is "{value}".`,
      de: `{count} Taxonnamen enthalten einen Zusatz (cf., sp., ?) oder ein Entwicklungsstadium (c2, juv). Bestätigen Sie jede Aufteilung in Name, Zusatz und Stadium; die erste ist „{value}“.`,
      fr: `{count} noms de taxons portent une mention (cf., sp., ?) ou un stade (c2, juv). Validez chaque découpage en nom, mention et stade ; le premier est « {value} ».`,
    },
    technical: `{file}, {sheet}: {count} distinct taxon name(s) were split into scientificName, identificationQualifier and lifeStage and the split is not approved yet; example "{value}". verbatimIdentification keeps the exact text. Conversion is blocked until every distinct split is approved.`,
  },
  {
    id: 'CONV-QUANTITY-UNDECLARED',
    category: 'B',
    severity: 'error',
    params: ['missing'],
    plain: {
      pl: `Nie wiadomo, co oznaczają liczby w tym arkuszu. Wskaż, czy to liczebność (sztuki), zagęszczenie czy biomasa, z jednostką, a jeśli znasz wielkość próby (objętość lub powierzchnię), podaj ją w całości.`,
      en: `It is not known what the numbers in this sheet mean. Say whether they are counts, densities or biomass, with the unit, and if you give the sample size (a volume or an area), give all of it.`,
      de: `Es ist unklar, was die Zahlen in diesem Blatt bedeuten. Geben Sie an, ob es Anzahlen, Dichten oder Biomasse sind, mit Einheit; nennen Sie die Probengröße (Volumen oder Fläche), dann vollständig.`,
      fr: `On ne sait pas ce que signifient les nombres de cette feuille. Indiquez s'il s'agit d'effectifs, de densités ou de biomasse, avec l'unité ; si vous donnez la taille d'échantillon (volume ou surface), donnez-la en entier.`,
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
      pl: `Ten sam takson „{value}” (to samo stadium i dopisek) występuje {count} razy w jednej próbce: {columns}. Każdy zapis zostaje osobno, nic nie jest sumowane. Sprawdź, czy to nie powinien być jeden zapis.`,
      en: `The same taxon "{value}" (same stage and qualifier) appears {count} times in one sample: {columns}. Each stays a separate record and nothing is summed. Check whether it should be one record.`,
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
      pl: `Pominięto {count} komórek z zerem, bo nie zaznaczono, że lista gatunków jest pełna. Zero oznacza „brak” tylko wtedy, gdy w próbce szukano wszystkich gatunków z listy.`,
      en: `{count} cells with a zero were left out, because the species list was not declared complete. A zero means "absent" only when every species of the list was looked for in the sample.`,
      de: `{count} Zellen mit einer Null wurden ausgelassen, da die Artenliste nicht als vollständig angegeben wurde. Eine Null bedeutet nur dann „fehlt“, wenn in der Probe nach allen Arten der Liste gesucht wurde.`,
      fr: `{count} cellules à zéro ont été ignorées, car la liste d'espèces n'a pas été déclarée complète. Un zéro signifie « absent » seulement si toutes les espèces de la liste ont été recherchées dans l'échantillon.`,
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
      pl: `Pominięto {count} wierszy podsumowania ({value}) w wierszach {lines}. To nie są próbki, a ich wartości podwoiłyby liczebności.`,
      en: `{count} summary rows ({value}) in lines {lines} were left out. They are not samples, and their values would double the counts.`,
      de: `{count} Zusammenfassungszeilen ({value}) in den Zeilen {lines} wurden ausgelassen. Sie sind keine Proben, und ihre Werte würden die Anzahlen verdoppeln.`,
      fr: `{count} lignes de synthèse ({value}) aux lignes {lines} ont été ignorées. Ce ne sont pas des échantillons et leurs valeurs doubleraient les effectifs.`,
    },
    technical: `{file}, {sheet}:{lines}: {count} row(s) whose sample code or station reads as a summary label ({value}) were not converted.`,
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

function fill(template: string, f: Finding): string {
  const generic: Record<string, string> = { file: f.file ?? '', sheet: f.sheet ?? '', field: f.field ?? '', value: f.value ?? '', lines: formatLines(f.lines) };
  return template.replace(/\{([A-Za-z_][\w.]*)\}/g, (whole, name: string) => {
    if (Object.prototype.hasOwnProperty.call(f.params, name)) return String(f.params[name]);
    if (Object.prototype.hasOwnProperty.call(generic, name)) return generic[name];
    return whole;
  });
}

/** One or two sentences for a scientist, in `lang` (English when the language is unknown). */
export function renderConvertPlain(f: Finding, lang: Lang): string {
  const rule = getConvertRule(f.ruleId);
  return fill(rule.plain[lang] || rule.plain.en, f);
}

/** The English technical detail line. */
export function renderConvertTechnical(f: Finding): string {
  return fill(getConvertRule(f.ruleId).technical, f);
}
