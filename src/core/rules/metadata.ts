// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RuleSpec } from './spec';

/*
 * Metadata rules (category 'A'): the record itself, and the record compared with the data (Task 7).
 * `file` = the record label for record-level rules; the data file for the *-OUTSIDE-* rules.
 * Declared params per rule:
 *   META-EMPTY-LINK           count             number of distribution links with an empty address
 *   META-NO-VERSION           (none)
 *   META-NO-EXTENT            (none)
 *   META-DATE-OUTSIDE-EXTENT  start, end, count start/end = temporal extent (ISO dates); count = rows outside;
 *                             lines = those rows; value = one example date
 *   META-POINT-OUTSIDE-BBOX   west, east, south, north, count   bbox as in the record; count = rows outside;
 *                             lines = those rows; value = one example position, "lat, lon"
 *   META-VARIABLE-MISSING     term              the abstract term found (e.g. "dissolved silica")
 *   META-NO-DATES             (none)
 */
export const METADATA_RULES: readonly RuleSpec[] = [
  {
    id: 'META-EMPTY-LINK',
    category: 'A',
    severity: 'warning',
    params: ['count'],
    plain: {
      pl: `W metadanych {+count:jest|są|jest} {count} {+count:odnośnik|odnośniki|odnośników} do pobrania z pustym adresem. Uzupełnij adres albo usuń odnośnik.`,
      en: `The metadata contains {count} download link(s) with an empty address. Fill in the address or remove the link.`,
      de: `Die Metadaten enthalten {count} Download-Link(s) ohne Adresse. Tragen Sie die Adresse ein oder entfernen Sie den Link.`,
      fr: `Les métadonnées contiennent {count} lien(s) de téléchargement sans adresse. Renseignez l'adresse ou supprimez le lien.`,
    },
    technical: `{file}: {count} online resource link(s) with an empty or missing URL (CI_OnlineResource linkage).`,
  },
  {
    id: 'META-NO-VERSION',
    category: 'A',
    severity: 'info',
    params: [],
    plain: {
      pl: `Nie podano wersji. Dodaj numer wersji, aby było wiadomo, którą edycję danych ktoś ma.`,
      en: `No version is stated. Add a version number so people can tell which release of the data they have.`,
      de: `Es ist keine Version angegeben. Ergänzen Sie eine Versionsnummer, damit erkennbar ist, welche Ausgabe der Daten vorliegt.`,
      fr: `Aucune version n'est indiquée. Ajoutez un numéro de version pour que l'on sache de quelle édition des données il s'agit.`,
    },
    technical: `{file}: no version or edition in any record.`,
  },
  {
    id: 'META-NO-EXTENT',
    category: 'A',
    severity: 'info',
    params: [],
    plain: {
      pl: `Metadane nie podają ani zakresu czasu, ani obszaru geograficznego danych, więc nie dało się ich porównać z tabelą. Uzupełnij oba.`,
      en: `The metadata gives neither a time span nor an area for the data, so they could not be compared with the table. Add both.`,
      de: `Die Metadaten nennen weder einen Zeitraum noch ein Gebiet für die Daten, daher war kein Abgleich mit der Tabelle möglich. Ergänzen Sie beides.`,
      fr: `Les métadonnées n'indiquent ni période ni zone géographique, la comparaison avec le tableau n'a donc pas été possible. Ajoutez les deux.`,
    },
    // Collection review has no table: its findings carry scope = 'collection' (an optional marker read by renderPlain, like
    // LIC-MISSING's dataciteCompared; /check never sets it, so its text above is unchanged).
    plainCollection: {
      pl: `Metadane nie podają ani zakresu czasu, ani obszaru geograficznego danych, więc rekord nie mówi, jakiego okresu i miejsca dotyczą dane. Uzupełnij oba.`,
      en: `The metadata gives neither a time span nor an area for the data, so the record does not say what period and place the data cover. Add both.`,
      de: `Die Metadaten nennen weder einen Zeitraum noch ein Gebiet für die Daten, der Eintrag sagt also nicht, welchen Zeitraum und Ort die Daten abdecken. Ergänzen Sie beides.`,
      fr: `Les métadonnées n'indiquent ni période ni zone géographique, la notice ne dit donc pas quelle période et quel lieu les données couvrent. Ajoutez les deux.`,
    },
    technical: `{file}: no temporal extent and no geographic bounding box in any record.`,
  },
  {
    id: 'META-DATE-OUTSIDE-EXTENT',
    category: 'A',
    severity: 'warning',
    params: ['start', 'end', 'count'],
    plain: {
      pl: `{count} {+count:wiersz ma|wiersze mają|wierszy ma} datę spoza zakresu czasu podanego w metadanych ({start} – {end}), np. {value}. Popraw daty lub zakres czasu.`,
      en: `{count} {+count:row has|rows have} a date outside the time span in the metadata ({start} to {end}), e.g. {value}. Correct the dates or the time span.`,
      de: `{count} {+count:Zeile hat|Zeilen haben} ein Datum außerhalb des in den Metadaten angegebenen Zeitraums ({start} bis {end}), z. B. {value}. Korrigieren Sie die Daten oder den Zeitraum.`,
      fr: `{count} {+count:ligne a|lignes ont} une date hors de la période indiquée dans les métadonnées ({start} à {end}), par ex. {value}. Corrigez les dates ou la période.`,
    },
    technical: `{file}:{lines} {count} row(s) dated outside the temporal extent {start}..{end} (e.g. {value}).`,
  },
  {
    id: 'META-POINT-OUTSIDE-BBOX',
    category: 'A',
    severity: 'warning',
    params: ['west', 'east', 'south', 'north', 'count'],
    plain: {
      pl: `{count} {+count:wiersz leży|wiersze leżą|wierszy leży} poza obszarem podanym w metadanych. Popraw współrzędne albo powiększ obszar w metadanych.`,
      en: `{count} {+count:row lies|rows lie} outside the area given in the metadata. Correct the coordinates or enlarge the area in the metadata.`,
      de: `{count} {+count:Zeile liegt|Zeilen liegen} außerhalb des in den Metadaten angegebenen Gebiets. Korrigieren Sie die Koordinaten oder vergrößern Sie das Gebiet in den Metadaten.`,
      fr: `{count} {+count:ligne se trouve|lignes se trouvent} hors de la zone indiquée dans les métadonnées. Corrigez les coordonnées ou agrandissez la zone dans les métadonnées.`,
    },
    technical: `{file}:{lines} {count} row(s) outside the bounding box W {west}, E {east}, S {south}, N {north} (e.g. {value}).`,
  },
  {
    id: 'META-VARIABLE-MISSING',
    category: 'A',
    severity: 'warning',
    params: ['term'],
    plain: {
      pl: `Opis wspomina „{term}”, ale w danych nie znaleziono pasującej kolumny. Dodaj kolumnę albo popraw opis.`,
      en: `The description mentions "{term}", but no matching column was found in the data. Add the column or correct the description.`,
      de: `Die Beschreibung erwähnt „{term}“, aber in den Daten wurde keine passende Spalte gefunden. Ergänzen Sie die Spalte oder korrigieren Sie die Beschreibung.`,
      fr: `La description mentionne « {term} », mais aucune colonne correspondante n'a été trouvée dans les données. Ajoutez la colonne ou corrigez la description.`,
    },
    technical: `{file}: abstract mentions '{term}' but no dataset variable maps to the corresponding canonical variable.`,
  },
  {
    id: 'META-NO-DATES',
    category: 'A',
    severity: 'error',
    params: [],
    plain: {
      pl: `Ani dane, ani metadane nie zawierają żadnej daty. Dodaj datę pobrania próbek do tabeli albo zakres czasu do metadanych.`,
      en: `Neither the data nor the metadata contain any date. Add the sampling date to the table or a time span to the metadata.`,
      de: `Weder die Daten noch die Metadaten enthalten ein Datum. Ergänzen Sie das Probenahmedatum in der Tabelle oder einen Zeitraum in den Metadaten.`,
      fr: `Ni les données ni les métadonnées ne contiennent de date. Ajoutez la date de prélèvement dans le tableau ou une période dans les métadonnées.`,
    },
    technical: `{file}: no row has a date and no record has a temporal extent or collection date.`,
  },
];
