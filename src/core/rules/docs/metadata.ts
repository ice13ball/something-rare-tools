// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RuleDoc } from './types';

/*
 * Metadata rules. Each text was checked against src/core/checks/licence.ts (the three record-level rules, raised by checkLicence for a record,
 * also in Collection review) and src/core/checks/metadata.ts (the five rules that compare the record with a table, raised by /check for a table
 * read together with a record). All eight have export policy show: they never stop a /convert export.
 */
export const DOCS: Readonly<Record<string, RuleDoc>> = {
  'META-EMPTY-LINK': {
    checks:
      'A download link of the record has an empty address. A link that goes nowhere cannot be followed by a person or by a harvester, and it suggests that a file was left out of the record.',
    fires:
      'Once per record, when at least one distribution link (a CI_OnlineResource linkage in an ISO 19139 or ISO 19115-3 record; the other record types carry no such links) is present with an empty address. The finding counts the empty links of all the sources read for the record. A record that could not be read is not judged.',
    example:
      'A metadata record lists three download links, one of which has the address field present but blank.',
    action:
      'Fill in the address or delete the link in the repository record.',
  },
  'META-NO-VERSION': {
    checks:
      'The record gives no version or edition of the data. Without it nobody can tell which release of a dataset they hold, and a corrected release looks like the old one.',
    fires:
      'Once per record, when records were read and none of them carries a version or edition, and the data did not come as a Darwin Core Archive whose eml.xml states a version (see IN-DWCA-VERSION). A record that could not be read is not judged, because its absence of a version says nothing.',
    example:
      'A DataCite record with title, creators and licence but no version field.',
    action:
      'Add a version number or edition to the record, and change it when the data change.',
  },
  'META-NO-EXTENT': {
    checks:
      'The record states neither a time span nor an area for the data. A reader cannot tell when and where the data were collected, and the tool cannot compare the table with the record.',
    fires:
      'Once per record, when records were read and none of them has a temporal extent or a geographic bounding box. A record with only one of the two does not fire this rule. In Collection review, which has no table to compare, the wording does not mention a /check table.',
    example:
      'A record with a title and an abstract but no temporal coverage and no bounding box.',
    action:
      'Add the period and the bounding box of the data to the record.',
  },
  'META-DATE-OUTSIDE-EXTENT': {
    checks:
      'Some rows of the table are dated outside the time span the record states. Either the dates in the table are wrong or the span in the record is, and the two cannot both be right.',
    fires:
      'When a record gives a temporal extent (with a start, an end or both) and at least one row has a parsed date outside it. Where several records give an extent, one is used, in the order ISO 19139, DataCite, PANGAEA, Zenodo, Dataverse; they are never merged. The row date and the limit are compared at the coarser of their two precisions, down to a day at most, so a row dated in the year of an end given as a year is inside. An open start or end is not a limit. Rows without a readable date are not counted. One finding lists the rows, their number and one example date.',
    example:
      'A record states a time span from 2019-05-01 to 2019-05-31 and the table has three rows dated in June 2019.',
    action:
      'Correct the dates in the table or the time span in the record.',
  },
  'META-POINT-OUTSIDE-BBOX': {
    checks:
      'Some rows of the table have a position outside the geographic area the record states. Either the coordinates are wrong (a swapped sign, a swapped latitude and longitude) or the area in the record is too small.',
    fires:
      'When a record gives a bounding box and at least one row has a latitude and a longitude outside it. The box is widened by half a unit of the last decimal place of the row coordinate and of the box edge, so a value rounded to the precision of the box is not outside it. Where several records give a box, one is used, in the same order as for the time span (ISO 19139, DataCite, PANGAEA, Zenodo, Dataverse); they are never merged. A box whose west edge is greater than its east edge is read as crossing the antimeridian. A row at exactly 0, 0 is left to ROW-ZERO-COORD and not reported here. Rows without a position are not counted. One finding lists the rows, their number and one example position.',
    example:
      'A record gives a box from 54 to 56 degrees north and 10 to 12 degrees east, and four rows lie at 54.5 north and minus 11.2 (a lost sign).',
    action:
      'Correct the coordinates or enlarge the box in the record.',
  },
  'META-VARIABLE-MISSING': {
    checks:
      'The abstract of the record promises a measured quantity that the table has no column for. A reader who relies on the abstract looks for the variable and finds nothing, or the column was dropped from the file.',
    fires:
      'Only when the table holds a column the tool recognises as a measured quantity, the table is a whole file (not one sheet of a workbook), the record links to at most one data file, and the record has an abstract. For each known variable the abstract names by one of its terms (several languages; whole word, accents ignored) while no column is recognised as that variable and no header contains one of its terms, one finding is raised. Short acronyms of up to four characters, such as DIC or pH, are matched with their capitals. A term used as a modifier of an instrument or a process (fluorescence, sensor, probe, maximum and similar words next to it) does not count as a promise of a column, and nitrate or nitrite is covered by a combined nitrate and nitrite column.',
    example:
      'The abstract says that dissolved silica was measured, and the table has temperature, salinity and nitrate columns but nothing for silica.',
    action:
      'Add the column or correct the abstract.',
  },
  'META-NO-DATES': {
    checks:
      'Neither the table nor the record holds any date. Data without a date cannot be placed in time, and OBIS and most repositories require one.',
    fires:
      'For a table with rows and a supported layout, when no row has a date (a date cell that exists but cannot be read counts as a date column, and is reported by ROW-DATE-UNPARSEABLE) and no record has a temporal extent or a collection date (the eml.xml time span of a Darwin Core Archive counts). Publication dates are not used. With no metadata given at all (an eml.xml in a Darwin Core Archive is metadata), the text says only that no row has a date. A lookup table of the same file, which holds no measurement while another sheet of the file does, is skipped. For a workbook the sheets that lack a date are listed in one finding. When a join left rows without a date the finding names the joined sheet as the likely cause. For an empty eventDate column of a Darwin Core table only this rule speaks, and DWC-TERM-EMPTY stays silent.',
    example:
      'A table of temperature and salinity by depth with no date column, described by a record without a temporal extent.',
    action:
      'Add the sampling date to the table or a time span to the record. In /convert, where the converter has already said that no event has a date (CONV-EVENT-DATE-MISSING), this finding is not repeated. In /convert the finding is only shown and never stops the export.',
  },
  'META-NO-POSITIONS': {
    checks:
      'Neither the table nor the record holds any position. OBIS needs decimalLatitude and decimalLongitude for every record, and a bounding box in the record is not a substitute for them.',
    fires:
      'For a table with rows and a supported layout (and not a lookup table beside the data, as META-NO-DATES), when no latitude or longitude column is recognised, no row has a position, no row has a blank or unreadable position cell, and no record has a bounding box. A column that exists but is blank or unreadable is not this rule: ROW-NO-COORD, ROW-NON-NUMERIC and DWC-TERM-EMPTY speak for it. A position that is only in the record is left to the rules that compare the data with the record. Sheets of one workbook that lack a position are listed in one finding. Source: the OBIS Manual, location terms.',
    example:
      'A table of nutrient concentrations by sample number with no latitude and no longitude column, and a record without a bounding box.',
    action:
      'Add latitude and longitude columns in decimal degrees to the table.',
  },
};
