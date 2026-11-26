// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RuleDoc } from './types';

/** Descriptions of the rules of the "pack as Darwin Core as it is" mode of /convert (src/core/rules/convertDwc.ts). */
export const DOCS: Readonly<Record<string, RuleDoc>> = {
  'CONV-ASIS-EVENT-ID-DUPLICATE': {
    checks: 'The eventID of every row of the Event sheet is unique. The Event core of an archive is keyed by eventID, so two rows with one id make the archive wrong.',
    fires: 'Fires once per Event sheet when an eventID that stands higher up in the sheet is repeated. Blank rows are not counted. The identifiers of your file are never changed or renumbered by the tool.',
    example: 'The Event sheet has eventID "ST1" in lines 2 and 9. The finding names line 9 as the repeat.',
    action: 'Make the eventIDs unique in the file, or delete the repeated row, and load the file again.',
  },
  'CONV-ASIS-OCC-ID-DUPLICATE': {
    checks: 'The occurrenceID of every row of the Occurrence sheet is unique, because other tables (measurements) point at it.',
    fires: 'Fires once per Occurrence sheet when an occurrenceID that stands higher up is repeated. The identifiers of your file are never changed by the tool.',
    example: 'The Occurrence sheet has occurrenceID "ST1-3" in lines 4 and 12. The finding names line 12.',
    action: 'Make the occurrenceIDs unique in the file and load it again.',
  },
  'CONV-ASIS-OCC-ORPHAN': {
    checks: 'Every occurrence belongs to an event of the Event sheet: its eventID is filled and found there.',
    fires: 'Fires once per Occurrence sheet when one or more rows have an empty eventID or an eventID that is not in the Event sheet.',
    example: 'An occurrence has eventID "ST9" but the Event sheet has stations ST1 to ST5. The finding names its line.',
    action: 'Add the missing event to the Event sheet or correct the eventID of the occurrence, then load the file again.',
  },
  'CONV-ASIS-COLUMN-REPEATED': {
    checks: 'Each Darwin Core term occurs once in a sheet. Two columns naming the same term cannot both be written under that name.',
    fires: 'Fires once per sheet when a column names a term that an earlier column of the sheet already names (case and the dwc: prefix are ignored).',
    example: 'A sheet has "eventDate" and "dwc:eventDate". The second column is named in the finding.',
    action: 'Delete or rename one of the columns in the file.',
  },
  'CONV-ASIS-EMOF-ROWS-NOT-WRITTEN': {
    checks: 'A measurement row has both a kind of measurement (measurementType) and a value (measurementValue). A row with only one of them cannot be read as a measurement.',
    fires: 'Fires once per measurement sheet when rows have a value without a type, or a type without a value. Those rows are not written and appear in the list of rows not written with their line numbers.',
    example: 'Line 14 has measurementValue 12.5 and an empty measurementType; the row is not written and is listed.',
    action: 'Nothing to answer; the rows are accounted for in the list. Fill the missing cell in the file if you want the row in the archive.',
  },
  'CONV-ASIS-COLUMNS-NOT-TERM': {
    checks: 'Columns of a Darwin Core sheet that are not Darwin Core terms (for example stationID or replicate) cannot go into the archive under a standard name.',
    fires: 'Fires once per sheet that has such columns. They are not written; the reason "not a Darwin Core term" is given once in the list of rows and columns not written.',
    example: 'The Event sheet has the columns eventID, eventDate, stationID. stationID is named and not written.',
    action: 'Nothing to answer. To keep the data, map the columns yourself in the other flow, or rename the column to a Darwin Core term.',
  },
  'CONV-ASIS-COLUMNS-OTHER-LEVEL': {
    checks: 'A term of another table level is not moved silently. A taxon term in the Event sheet, or a measurement term in the Occurrence sheet, is left where the author put it only if it is valid there.',
    fires: 'Fires once per sheet and table when columns are Darwin Core terms that do not belong in that table; they are not written and are named.',
    example: 'The Event sheet has a scientificName column. It is not an event term, so it is named and not written.',
    action: 'Put the column in the sheet where it belongs, then load the file again.',
  },
  'CONV-ASIS-EMOF-REDUNDANT': {
    checks: 'The measurement sheet links to an occurrence by occurrenceID, so a scientificName beside it repeats what the occurrence already says.',
    fires: 'Fires once per measurement sheet that has scientificName beside occurrenceID. The column is not written; the eventID is kept only as the link to the event.',
    example: 'The measurement sheet has occurrenceID, eventID and scientificName. The scientificName column is dropped and said once.',
    action: 'Nothing to answer.',
  },
};
