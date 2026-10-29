// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { CITE } from './citations';
import type { RuleSpec } from './spec';

/*
 * Cross-file rules (category 'C'), emitted by checkCrossFile() (Task 9). The two files compared are
 * named by params (fileA, fileB) because a Finding carries a single `file`; the checks may set
 * `file` to fileA and list `datasetIds` of both.
 * Declared params per rule:
 *   XF-DUPLICATE-SAMPLES   fileA, fileB, count     count = matched samples (same station/position, depth, day)
 *   XF-DATE-CONFLICT       station, fileA, fileB, dateA, dateB, lineA, lineB   one example pair of lines
 *   XF-STATION-ALIAS       nameA, nameB            two raw ids that normalise to the same station
 *   XF-UNIT-CONFLICT       variable, unitA, unitB, matched, equal, fileA, fileB
 *                          matched = matched samples, equal = how many of them have equal values
 *   XF-POSITION-SWAP       stationA, stationB, fileA, fileB
 *   XF-POSITION-CONFLICT   station, files, positions
 *                          files = the dataset(s) that disagree (both when only two datasets), comma-separated;
 *                          positions = compact text of the positions in each dataset
 */
export const CROSSFILE_RULES: readonly RuleSpec[] = [
  {
    id: 'XF-DUPLICATE-SAMPLES',
    category: 'C',
    severity: 'info',
    params: ['fileA', 'fileB', 'count'],
    plain: {
      pl: `Pliki {fileA} i {fileB} zawierają {count} {+count:tę samą próbkę|te same próbki|tych samych próbek}. Upewnij się, że {+count:nie jest liczona|nie są liczone|nie są liczone} dwa razy.`,
      en: `The files {fileA} and {fileB} contain {count} of the same {+count:sample|samples}. Make sure {+count:it is|they are} not counted twice.`,
      de: `Die Dateien {fileA} und {fileB} enthalten {count} {+count:gleiche Probe|gleiche Proben}. Stellen Sie sicher, dass sie nicht doppelt gezählt {+count:wird|werden}.`,
      fr: `Les fichiers {fileA} et {fileB} contiennent {count} {+count:échantillon identique|échantillons identiques}. Assurez-vous {+count:qu'il n'est pas compté|qu'ils ne sont pas comptés} deux fois.`,
    },
    technical: `{fileA} and {fileB}: {count} matched samples (same station or position, same depth, same day).`,
  },
  {
    id: 'XF-DATE-CONFLICT',
    category: 'C',
    severity: 'warning',
    params: ['station', 'fileA', 'fileB', 'dateA', 'dateB', 'lineA', 'lineB'],
    plain: {
      pl: `Stacja {station} ma te same wartości w plikach {fileA} i {fileB}, ale różne daty ({dateA} i {dateB}). Jedna z dat jest prawdopodobnie błędna.`,
      en: `Station {station} has the same values in {fileA} and {fileB} but different dates ({dateA} and {dateB}). One of the dates is probably wrong.`,
      de: `Die Station {station} hat in {fileA} und {fileB} dieselben Werte, aber unterschiedliche Daten ({dateA} und {dateB}). Eines der Daten ist vermutlich falsch.`,
      fr: `La station {station} a les mêmes valeurs dans {fileA} et {fileB}, mais des dates différentes ({dateA} et {dateB}). L'une des dates est probablement fausse.`,
    },
    technical: `station {station}: {fileA}:{lineA} dated {dateA} vs {fileB}:{lineB} dated {dateB}; at least 2 shared variables are equal.`,
  },
  {
    id: 'XF-STATION-ALIAS',
    category: 'C',
    severity: 'info',
    params: ['nameA', 'nameB'],
    plain: {
      pl: `„{nameA}” i „{nameB}” wyglądają na tę samą stację zapisaną na dwa sposoby. Używaj wszędzie jednej nazwy.`,
      en: `"{nameA}" and "{nameB}" look like the same station written in two ways. Use one name everywhere.`,
      de: `„{nameA}“ und „{nameB}“ sehen aus wie dieselbe Station in zwei Schreibweisen. Verwenden Sie überall einen Namen.`,
      fr: `« {nameA} » et « {nameB} » semblent être la même station écrite de deux façons. Utilisez partout un seul nom.`,
    },
    technical: `{file}: station ids '{nameA}' and '{nameB}' are equal after normalisation (last '/' segment, upper case, spaces removed).`,
  },
  {
    id: 'XF-UNIT-CONFLICT',
    category: 'C',
    severity: 'warning',
    params: ['variable', 'unitA', 'unitB', 'matched', 'equal', 'fileA', 'fileB'],
    citations: [CITE.glodapUnitConversion, CITE.unescoDensity],
    plain: {
      pl: `{variable} ma te same liczby w plikach {fileA} i {fileB}, ale jeden podaje {unitA}, a drugi {unitB}. To nie są te same jednostki; popraw błędne oznaczenie.`,
      en: `{variable} has the same numbers in {fileA} and {fileB}, but one says {unitA} and the other {unitB}. These are not the same unit; correct the wrong label.`,
      de: `{variable} hat in {fileA} und {fileB} dieselben Zahlen, aber eine Datei nennt {unitA} und die andere {unitB}. Das sind nicht dieselben Einheiten; korrigieren Sie die falsche Angabe.`,
      fr: `{variable} a les mêmes nombres dans {fileA} et {fileB}, mais l'un indique {unitA} et l'autre {unitB}. Ce ne sont pas les mêmes unités ; corrigez l'indication erronée.`,
    },
    technical: `{variable}: {equal} of {matched} matched samples have equal values, but the units differ in dimension: '{unitA}' ({fileA}) vs '{unitB}' ({fileB}).`,
  },
  {
    id: 'XF-POSITION-SWAP',
    category: 'C',
    severity: 'warning',
    params: ['stationA', 'stationB', 'fileA', 'fileB'],
    plain: {
      pl: `Pozycje stacji {stationA} i {stationB} są zamienione miejscami między plikami {fileA} i {fileB}. W jednym z plików prawdopodobnie pomylono nazwy stacji.`,
      en: `The positions of stations {stationA} and {stationB} are exchanged between {fileA} and {fileB}. One of the files probably has the station names mixed up.`,
      de: `Die Positionen der Stationen {stationA} und {stationB} sind zwischen {fileA} und {fileB} vertauscht. In einer der Dateien sind vermutlich die Stationsnamen verwechselt.`,
      fr: `Les positions des stations {stationA} et {stationB} sont inversées entre {fileA} et {fileB}. L'un des fichiers a probablement confondu les noms de stations.`,
    },
    technical: `stations {stationA} and {stationB}: positions exchanged between {fileA} and {fileB}.`,
  },
  {
    id: 'XF-POSITION-CONFLICT',
    category: 'C',
    severity: 'warning',
    params: ['station', 'files', 'positions'],
    plain: {
      pl: `Stacja {station} leży w innym miejscu w {files} niż w pozostałych plikach ({positions}). Sprawdź, które współrzędne są prawidłowe.`,
      en: `Station {station} is at a different position in {files} than in the other files ({positions}). Check which coordinates are correct.`,
      de: `Die Station {station} liegt in {files} an einer anderen Position als in den übrigen Dateien ({positions}). Prüfen Sie, welche Koordinaten stimmen.`,
      fr: `La station {station} se trouve à une autre position dans {files} que dans les autres fichiers ({positions}). Vérifiez quelles coordonnées sont correctes.`,
    },
    technical: `station {station}: position in {files} lies outside the range seen in the other dataset(s): {positions}.`,
  },
];
