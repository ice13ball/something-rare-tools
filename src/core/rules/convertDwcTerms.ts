// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RuleSpec } from './spec';

/*
 * The rules of the columns named with a Darwin Core term of their own (core/convert/dwcTermColumns.ts).
 *
 *   CONV-DWC-TERM-PER-ROW   columns, count   an event-level term whose rows of one event differ: written on each occurrence (info)
 *   CONV-DWC-TERM-REPLACES  columns, count   cells that take the place of a value the tool would have written (info)
 *   CONV-DWC-TERM-VOCAB     columns, count   lines = occurrenceStatus or basisOfRecord outside the standard words, written as they are (warning, accept)
 *   CONV-DWC-TERM-TWICE     columns, term    a second column of the same term is not written (warning, accept)
 */
export const DWC_TERM_RULES: readonly RuleSpec[] = [
  {
    id: 'CONV-DWC-TERM-PER-ROW',
    category: 'B',
    severity: 'info',
    exportPolicy: 'show',
    params: ['columns', 'count'],
    plain: {
      pl: `Kolumna {columns} opisuje zdarzenie, ale w {count} {+count:zdarzeniu|zdarzeniach|zdarzeniach} jej wartości różnią się między wierszami. Zapisuję więc każdą wartość przy jej własnym wystąpieniu, a nie w tabeli zdarzeń.`,
      en: `The column {columns} describes an event, but in {count} {+count:event|events} its values differ between the rows. So each value is written on its own occurrence, not in the event table.`,
      de: `Die Spalte {columns} beschreibt ein Ereignis, aber bei {count} {+count:Ereignis|Ereignissen} unterscheiden sich ihre Werte zwischen den Zeilen. Jeder Wert wird deshalb beim eigenen Vorkommen geschrieben, nicht in der Ereignistabelle.`,
      fr: `La colonne {columns} décrit un événement, mais pour {count} {+count:événement|événements} ses valeurs diffèrent d'une ligne à l'autre. Chaque valeur est donc écrite sur sa propre occurrence, pas dans la table des événements.`,
    },
    technical: `{file}, {sheet}: the event- or record-level term of column {columns} has different non-empty values on the rows of {count} event(s); the whole term is written to the Occurrence table, per occurrence.`,
  },
  {
    id: 'CONV-DWC-TERM-REPLACES',
    category: 'B',
    severity: 'info',
    exportPolicy: 'show',
    params: ['columns', 'count'],
    plain: {
      pl: `Kolumna {columns} zastępuje {count} {+count:wartość|wartości|wartości}, którą narzędzie zapisałoby samo. Wygrywa Twoja komórka; pusta komórka zostawia wartość narzędzia.`,
      en: `The column {columns} replaces {count} {+count:value|values} the tool would have written itself. Your cell wins; an empty cell leaves the tool's value.`,
      de: `Die Spalte {columns} ersetzt {count} {+count:Wert|Werte}, den das Werkzeug selbst geschrieben hätte. Ihre Zelle gewinnt; eine leere Zelle lässt den Wert des Werkzeugs stehen.`,
      fr: `La colonne {columns} remplace {count} {+count:valeur|valeurs} que l'outil aurait écrite{+count:|s} lui-même. Votre cellule l'emporte ; une cellule vide laisse la valeur de l'outil.`,
    },
    technical: `{file}, {sheet}: the user's non-empty cell of column {columns} replaced {count} generated value(s) (occurrenceStatus, basisOfRecord, sex, locality, geodeticDatum, coordinateUncertaintyInMeters or verbatimDepth). basisOfRecord counts every non-empty cell, the dataset value is not known at this point. Remarks terms are joined to the generated text, not counted.`,
  },
  {
    id: 'CONV-DWC-TERM-VOCAB',
    category: 'B',
    severity: 'warning',
    exportPolicy: 'accept',
    params: ['columns', 'count'],
    plain: {
      pl: `Kolumna {columns}: {count} {+count:wartość|wartości|wartości} nie jest słowem ze standardu (np. „{value}”, {+lineCount:wiersz|wiersze|wierszy} {lines}). Zapisuję je bez zmian, ale odbiorca archiwum może je odrzucić. occurrenceStatus przyjmuje present lub absent; basisOfRecord słownik GBIF (np. HumanObservation).`,
      en: `Column {columns}: {count} {+count:value is|values are} not a word of the standard (e.g. "{value}", {+lineCount:line|lines} {lines}). They are written as they are, but the receiver of the archive may reject them. occurrenceStatus takes present or absent; basisOfRecord the GBIF vocabulary (e.g. HumanObservation).`,
      de: `Spalte {columns}: {count} {+count:Wert ist|Werte sind} kein Wort des Standards (z. B. „{value}“, {+lineCount:Zeile|Zeilen} {lines}). Unverändert geschrieben; der Empfänger kann sie ablehnen. occurrenceStatus nimmt present oder absent; basisOfRecord das GBIF-Vokabular (z. B. HumanObservation).`,
      fr: `Colonne {columns} : {count} {+count:valeur n'est pas un mot|valeurs ne sont pas des mots} du standard (p. ex. « {value} », {+lineCount:ligne|lignes} {lines}). Écrites telles quelles ; le destinataire peut les refuser. occurrenceStatus prend present ou absent ; basisOfRecord le vocabulaire GBIF (p. ex. HumanObservation).`,
    },
    technical: `{file}, {sheet}:{lines}: {count} cell(s) of column {columns} hold an occurrenceStatus other than present/absent or a basisOfRecord outside the GBIF vocabulary (PreservedSpecimen, FossilSpecimen, LivingSpecimen, MaterialSample, MaterialEntity, MaterialCitation, HumanObservation, MachineObservation, Occurrence, Event, Taxon; compared case-insensitively). First values: {value}. Written as given. The warning has to be accepted before the export.`,
  },
  {
    id: 'CONV-DWC-TERM-TWICE',
    category: 'B',
    severity: 'warning',
    exportPolicy: 'accept',
    params: ['columns', 'term'],
    plain: {
      pl: `Dwie kolumny noszą ten sam termin Darwin Core {term}: {columns}. Zapisuję tylko pierwszą; druga nie trafi do archiwum. Zmień nazwę jednej z nich albo zostaw ją poza arkuszem.`,
      en: `Two columns carry the same Darwin Core term {term}: {columns}. Only the first is written; the second does not go to the archive. Rename one of them or leave it out of the sheet.`,
      de: `Zwei Spalten tragen denselben Darwin-Core-Begriff {term}: {columns}. Nur die erste wird geschrieben; die zweite kommt nicht ins Archiv. Benennen Sie eine davon um oder lassen Sie sie aus dem Blatt.`,
      fr: `Deux colonnes portent le même terme Darwin Core {term} : {columns}. Seule la première est écrite ; la seconde n'entre pas dans l'archive. Renommez l'une d'elles ou laissez-la hors de la feuille.`,
    },
    technical: `{file}, {sheet}: columns {columns} are both the term {term}; the first is written under it, the second is not written (it is also listed by CONV-COLUMN-NOT-EXPORTED). The warning has to be accepted before the export.`,
  },
];
