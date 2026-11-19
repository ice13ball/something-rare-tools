// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RuleDoc } from './types';

/*
 * Darwin Core structure rules. Each text was checked against src/core/checks/dwc.ts, the only place that raises these ids.
 * The six structure and identifier rules run only on Darwin Core input: a Darwin Core Archive, or a table whose header spells at least three
 * distinct Darwin Core terms exactly as Darwin Core spells them (case counts) and at least one of occurrenceID, eventID, parentEventID,
 * scientificName, scientificNameID, taxonID, basisOfRecord, occurrenceStatus. DWC-EVENTDATE-NOT-ISO is the exception: it reads any table.
 */
export const DOCS: Readonly<Record<string, RuleDoc>> = {
  'DWC-TERM-MISSING': {
    checks:
      'A Darwin Core table has no column for a term that OBIS requires. Without the required terms the records cannot be published in OBIS, so the file is not ready however good its other columns are.',
    fires:
      'Only on Darwin Core input: an Archive, or a table with at least three distinct Darwin Core terms in its header (spelled exactly, capitals count) plus one of occurrenceID, eventID, parentEventID, scientificName, scientificNameID, taxonID, basisOfRecord or occurrenceStatus. With eventID or parentEventID and no occurrence term it is an Event core, otherwise an Occurrence core. Always required: eventDate, decimalLatitude, decimalLongitude and an identifier (eventID for Event; occurrenceID or eventID for Occurrence; an Archive core id may stand for it). Occurrence also needs scientificName, occurrenceStatus and basisOfRecord. An occurrence table with an eventID column not blank in every row is the occurrence side of an event and occurrence pair, and then the date and coordinates are not required of it. Sources: obistools check_fields, OBIS Manual.',
    example:
      'A table with the columns occurrenceID, scientificName, eventDate, decimalLatitude and decimalLongitude but no occurrenceStatus and no basisOfRecord column is reported as missing occurrenceStatus and basisOfRecord.',
    action:
      'Add a column for each listed term and fill it. In /convert this rule is applied to the Event and Occurrence tables the converter writes, so the remedy is in the declarations that feed those tables, not in a column you add by hand. In /convert this finding blocks the export.',
  },
  'DWC-TERM-EMPTY': {
    checks:
      'A column that OBIS requires exists but has empty cells. A record without a required value cannot be published, so the empty rows must be filled or dealt with before submission.',
    fires:
      'Only on Darwin Core input, one finding per column. The identifier column (occurrenceID or eventID, or the archive id) and, for an Occurrence core, scientificName, occurrenceStatus and basisOfRecord fire when any cell is blank after trimming. eventDate, decimalLatitude and decimalLongitude fire only when the column is blank in every row: a few missing positions are ROW-NO-COORD, a few missing dates are ROW-DATE-MISSING, and a date missing everywhere in the data and the metadata is reported by META-NO-DATES alone. Those three are not checked on the occurrence side of an event and occurrence pair. Sources: obistools check_fields and the OBIS Manual.',
    example:
      'A table of 40 rows whose scientificName column is blank on lines 7, 8, 19 and 33 gets one finding naming those four lines.',
    action:
      'Fill the cells, or remove the rows that cannot be filled. In /convert the rule is applied to the tables the converter writes; for a missing position or date the converter says it first in the terms of the source sheet (CONV-POSITION-NONE, CONV-EVENT-DATE-MISSING) and this finding is then not repeated. In /convert this finding blocks the export.',
  },
  'DWC-RECOMMENDED': {
    checks:
      'A Darwin Core table lacks a column that OBIS recommends, or leaves it empty in every row. The data are still publishable, but depth and a persistent taxon identifier make the data easier to check and the names easier to match.',
    fires:
      'Only on Darwin Core input, once per table, listing every recommended term that is absent or blank in every row. The terms are minimumDepthInMeters and maximumDepthInMeters (not asked of the occurrence side of an event and occurrence pair) and, for an Occurrence core, scientificNameID. The OBIS Manual calls scientificNameID strongly recommended; obistools lists it as required, and this tool follows the manual. Sources: obistools check_fields and the OBIS Manual.',
    example:
      'An occurrence table with all required columns but no scientificNameID column and no depth columns is told that scientificNameID, minimumDepthInMeters and maximumDepthInMeters are recommended.',
    action:
      'Add the columns, for example the persistent identifier of each name from a taxon register, and the depth range of the sample. In /convert a lacking scientificNameID on the Occurrence table is not raised by this rule but by CONV-NAMEID-MISSING; the depth terms are still judged. In /convert this finding does not block the export, but it needs your acceptance (one tick for the rule) before the export works.',
  },
  'DWC-VOCAB-VALUE': {
    checks:
      'A basisOfRecord or occurrenceStatus value is not on the list OBIS accepts. OBIS compares these values with a fixed vocabulary, so a misspelt value can make the record fail the quality control of OBIS.',
    fires:
      'Only on Darwin Core input, for the columns basisOfRecord and occurrenceStatus. A value is compared in lower case after its ends are trimmed, so capitalisation does not matter but spelling and inner spaces do. basisOfRecord accepts PreservedSpecimen, FossilSpecimen, LivingSpecimen, HumanObservation, MachineObservation, MaterialSample, Occurrence and MaterialCitation (the GBIF vocabulary of 2022-02-02, the file the OBIS quality control reads). occurrenceStatus accepts absent, present, notDetected and detected. In an Occurrence core empty cells are DWC-TERM-EMPTY. One finding per distinct wrong value, with its lines; beyond ten distinct values the rest share one finding. Sources: GBIF vocabulary, OBIS Manual, Biocheck.',
    example:
      'A basisOfRecord cell that reads Human Observation, with a space, is not on the list; HumanObservation is.',
    action:
      'Correct the value to the spelling of the list. In /convert the rule is applied to the tables the converter writes. In /convert this finding blocks the export.',
  },
  'DWC-EVENTID-DUPLICATE': {
    checks:
      'In an Event core the same eventID names more than one event. The eventID is the key of an event, and records that point at it cannot say which event they belong to when it repeats.',
    fires:
      'Only on Darwin Core input read as an Event core; outside an archive only when the table has at least one of the columns eventDate, decimalLatitude and decimalLongitude. In a Darwin Core Archive every repeated eventID fires, since the archive has one row per event. In any other table (a flattened sheet repeats the eventID on every depth level) an eventID fires only when its rows disagree on the date or on a coordinate; dates are compared by their parsed value and coordinates as numbers, so 60.5 and 60.50 agree. A repeated eventID whose rows agree is not reported. The finding lists every row of every repeated eventID and counts the ids. It does not run on an Occurrence core, where one eventID may repeat. Source: obistools check_eventids.',
    example:
      'An event table in which eventID S-12 appears on two lines with two different dates is reported, with both lines.',
    action:
      'Give each event its own eventID, or merge rows that describe the same event. In /convert this finding blocks the export.',
  },
  'DWC-PARENT-DANGLING': {
    checks:
      'A parentEventID points at an event that is not in the eventID column of the same table. The hierarchy of events then has a broken link, and a reader cannot rebuild the cruise, station and sample structure.',
    fires:
      'Only on Darwin Core input read as an Event core that has a parentEventID column. Every non-blank parentEventID that matches no eventID of the table is listed with its lines, and the finding counts the different missing parents. It does not run when the archive was read only in part (the first 200000 rows, see IN-DWCA-PARTIAL), because the parent may be in a row that was not read. Sources: obistools check_eventids and Biocheck.',
    example:
      'An event table whose parentEventID cells name CRUISE-A on three lines, while no eventID is CRUISE-A, is reported.',
    action:
      'Correct the identifier, or add the missing parent event as a row. In /convert this finding blocks the export.',
  },
  'DWC-PARENT-LOOP': {
    checks:
      'The eventID and parentEventID columns form a circle: an event is its own ancestor. A hierarchy that never reaches a top event cannot be read, and GBIF flags it as an infinite lineage.',
    fires:
      'Only on Darwin Core input read as an Event core that has a parentEventID column. Each eventID is followed to its parent, then to that parent, and so on; every row on a circle is listed and counted. A row whose parentEventID equals its own eventID is a circle of one. When an eventID repeats, its first non-blank parent is used. The search visits each event once. It does not run when the archive was read only in part (the first 200000 rows, see IN-DWCA-PARTIAL). Source: the GBIF issue PARENT_EVENT_INFINITE_LINEAGE.',
    example:
      'Event A has parent B, B has parent C and C has parent A: all three rows are reported.',
    action:
      'Correct the parentEventID of one event on the circle so that the chain ends in an event without a parent. In /convert this finding blocks the export.',
  },
  'DWC-OCCURRENCEID-DUPLICATE': {
    checks:
      'The same occurrenceID is used for more than one record of an Occurrence core. The occurrenceID is the key of a record, and a repeated key makes later updates and links ambiguous.',
    fires:
      'Only on Darwin Core input read as an Occurrence core with an occurrenceID column (in an archive without that column, the core id column is used, but not when the table has an eventID column). Every non-blank occurrenceID that appears in more than one row fires; the finding lists every row of every repeated id, counts the ids and shows one example. Source: Biocheck, the occurrenceID is unique in the occurrence table.',
    example:
      'A table in which occurrenceID occ-0015 appears on lines 16 and 41 is reported with both lines.',
    action:
      'Give each record its own identifier. In /convert a repeat that the conversion already named in the terms of the source sheet (CONV-ID-DUPLICATE for occurrences) is not said a second time by this rule. In /convert this finding blocks the export.',
  },
  'DWC-EVENTDATE-NOT-ISO': {
    checks:
      'Dates in a column headed eventDate are not written in ISO 8601. Darwin Core and OBIS read eventDate as text in that form, so a date such as 14/06/2011 is not understood, or is read in the wrong order.',
    fires:
      'On any table with a column headed exactly eventDate (with or without the dwc: prefix), Darwin Core input or not. A cell fires unless it is blank, a missing-value token (NA, N/A, a dash, null, nd) or a valid ISO 8601 value: a year, a year and month, a date, an ordinal or week date, a date with a time and an optional zone (hour 24 is not accepted), a basic form such as 20110614 (only from the year 1700), or an interval of two such values joined by one slash, whose end may be shortened (2011-06-14/20), or an interval with a duration. A spreadsheet cell formatted as a date is not judged. Nothing is changed. The finding lists the lines and one example.',
    example:
      'The cell 14/06/2011 in an eventDate column is reported; 2011-06-14 is accepted.',
    action:
      'Write the dates in ISO 8601, for example 2011-06-14 or 2011-06-14/2011-06-20. Nothing is changed in your file. In /convert the rule is applied to the tables the converter writes. In /convert the finding is only shown and never stops the export.',
  },
};
