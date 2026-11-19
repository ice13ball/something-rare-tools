// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RuleDoc } from './types';

/*
 * Row rules: what a data row says about itself. Each text was checked against the registry in src/core/rules/rows.ts and against the code that raises the id:
 * src/core/checks/rows.ts (positions, stations, land, dates, depths, codes), src/core/checks/speed.ts (ship speed), src/core/dataset.ts (reading the cells: numbers, coordinates,
 * dates, time zones, long and wide sheets, joins), src/core/parse/shared.ts (ragged rows), src/core/checks/dwc.ts (invisible characters, damaged text) and, for /convert,
 * src/core/convert (validate.ts, missingCode.ts, dateOrder.ts, pivot.ts, build.ts). The /convert sentence in each action follows the rule export policy.
 * ROW-SHIP-SPEED, ROW-SHIP-SPEED-UNUSUAL, ROW-SHIP-SPEED-PAIR, ROW-ON-LAND and ROW-ON-LAND-NEAR are /check only: /convert passes them neither a cruise nor a land map.
 */
export const DOCS: Readonly<Record<string, RuleDoc>> = {
  'ROW-LAT-RANGE': {
    checks:
      'A latitude lies outside the range of the globe, -90 to 90 degrees. No place has such a latitude, so the value is a typing error, a swapped column or a unit mistake.',
    fires:
      'For every row of a sheet whose latitude column holds a number below -90 or above 90. One finding per sheet lists the lines and shows the first value as written. Text in the cell is not judged here, that is ROW-NON-NUMERIC.',
    example:
      'A latitude column of a plankton table reads 54.31, 54.33, 154.35 on lines 5, 6 and 7. Line 7 is reported with the value 154.35, a digit typed twice.',
    action:
      'Correct the value in the source, or check whether latitude and longitude changed columns. In /convert this finding blocks the export until the source is corrected.',
  },
  'ROW-LON-RANGE': {
    checks:
      'A longitude lies outside -180 to 180 degrees after the tool has tried the 0 to 360 scale. No place has such a longitude, so the value is a typing error, a swapped column or a unit mistake.',
    fires:
      'For every row whose longitude is a number below -180 or above 360 (values from 180 to 360 are first read on the 0 to 360 scale and only noted as ROW-LON-360). One finding per sheet lists the lines and the first value as written.',
    example:
      'A longitude column holds 18.62, 18.65 and 1865.0 on lines 10, 11 and 12. Line 12 is reported: a decimal point was lost.',
    action:
      'Correct the value in the source, or check whether the two coordinate columns are swapped. In /convert this finding blocks the export until the source is corrected.',
  },
  'ROW-LON-360': {
    checks:
      'Longitudes are given on a 0 to 360 scale instead of -180 to 180. The tool converts them, and this note says that it did so, because the published file must use -180 to 180.',
    fires:
      'For every row whose longitude is above 180 and not above 360. The tool subtracts 360 and reports the lines as an information note. A value above 360 is ROW-LON-RANGE.',
    example:
      'A longitude of 350.5 on line 8 is read as -9.5, and the note names line 8 and the value 350.5.',
    action:
      'Check that the converted longitude is the place you meant, and write the data on the -180 to 180 scale in your own copy. In /convert this finding is only shown.',
  },
  'ROW-LAT-EQ-LON': {
    checks:
      'Latitude and longitude are identical on many rows. That is almost never real: a column was copied into the other, and every position is wrong.',
    fires:
      'When at least 5 rows have equal latitude and longitude (other than 0, 0) and either they are a fifth or more of the rows with a position, or at least 5 of them share one value written with two or more decimals that is not a multiple of 0.25. Fewer rows, or a smaller share without such a repeated value, give ROW-LAT-EQ-LON-ISOLATED or ROW-LAT-EQ-LON-COARSE. The two limits are choices of this tool, not published thresholds.',
    example:
      '12 of 30 rows read 54.4, 54.4 or 18.7, 18.7. That is 40 percent, above the 20 percent share, so the group is reported with the first value.',
    action:
      'Find the column that was copied and enter the real positions. In /convert this finding blocks the export until the positions are corrected.',
  },
  'ROW-LAT-EQ-LON-ISOLATED': {
    checks:
      'A few rows have identical latitude and longitude with a fine decimal. It can be a coincidence, but typing one number into both columns is a common slip.',
    fires:
      'When rows with equal latitude and longitude, not 0, 0, do not reach the error level of ROW-LAT-EQ-LON and the value is finer than a half degree. A group of 5 or more rows goes here only when it is under a fifth of the rows with a position and has no 5 rows of one repeated value with two or more decimals that is not a multiple of 0.25.',
    example:
      'Line 14 of a table of 200 positioned rows reads 41.37, 41.37. Line 14 is reported once with the value 41.37.',
    action:
      'Check the position against the field notes. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule, before the export button works.',
  },
  'ROW-LAT-EQ-LON-COARSE': {
    checks:
      'A few rows have identical latitude and longitude that are a whole or a half degree. Such coarse positions are common in historical data, so the value can be right.',
    fires:
      'When rows with equal latitude and longitude, not 0, 0, do not reach the error level of ROW-LAT-EQ-LON and the value is a whole or half degree. It is an information note.',
    example:
      'A historical net haul is recorded at -65.0, -65.0, a place on the Antarctic Peninsula. The note names the line and the value, and the position can stay.',
    action:
      'Only make sure that the number was not typed twice. In /convert this finding is only shown.',
  },
  'ROW-RAGGED': {
    checks:
      'A row has more or fewer values than the header has columns. Its values are shifted against the header, so no cell of the row can be trusted.',
    fires:
      'When the file is read: for each line whose field count differs from the header field count. The finding gives the expected count and the count of the first listed line. The rows are kept as found and are not realigned.',
    example:
      'A header has 8 columns. Line 31 has 9 values because a comment contains an unquoted comma. Line 31 is reported with expected 8 and found 9.',
    action:
      'Fix the line in the original file, usually a missing quote or a stray separator. In /convert this finding blocks the export, and the converter does not convert such a row.',
  },
  'ROW-NON-NUMERIC': {
    checks:
      'A column that holds numbers has a text cell. The cell cannot be used as a value, and it is not the same as a deliberate empty cell.',
    fires:
      'For a cell of a numeric column (a coordinate, a depth, a measurement) that is neither a number nor one of the recognised missing-value marks (empty, NA, N/A, NaN, nd, n.d., -, --, null). One finding per column lists the lines and an example. Thousands separators are not accepted, 1,234.5 is text unless the file uses decimal commas.',
    example:
      'A depth column holds 10, 20, below detection, 40. The cell below detection on line 3 is reported with that text.',
    action:
      'Replace the text with a number, or empty the cell. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule; the cell is not written as a number.',
  },
  'ROW-NA-VARIANT': {
    checks:
      'A numeric column marks missing values in an unusual way, such as NANA or N.A. Such a mark is understood as missing, but the column then uses more than one mark.',
    fires:
      'For a numeric cell whose letters and digits, without separators, are only the letters NA repeated, and which is not one of the standard marks. One finding per column lists the lines and an example.',
    example:
      'A salinity column holds 33.1, NANA, 33.4. NANA on line 2 is read as missing and reported.',
    action:
      'Use one consistent mark, or an empty cell. In /convert this finding is only shown, and the cell is treated as missing.',
  },
  'ROW-STATION-MOVED': {
    checks:
      'One station name appears at positions that differ by a typed digit, swapped axes or a sign. A station is one place, so one of the positions is probably wrong.',
    fires:
      'For rows of one station name, compared within one cruise or, without a cruise column, within one calendar year, when two positions differ in one of three ways. A typed digit: one coordinate differs by a whole number of degrees and the other keeps its whole degree; the shifted coordinate needs two written decimals (one inside a cruise, not .0 or .5) and there is no distance limit. Exchanged axes: each position is the other with latitude and longitude swapped. A sign: as written the positions are at least 100 km apart, and with one sign flipped they are within 50 km and at least ten times closer. Placeholder names such as unknown do not count.',
    example:
      'Station A3 is at 76.9 N 15.5 E on 9 rows and at 76.9 N -15.5 E on 14 rows. The finding lists both positions and says that the longitude differs only by its sign.',
    action:
      'Decide which position is right and correct the other rows. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule, before the export button works.',
  },
  'ROW-STATION-SPREAD': {
    checks:
      'One station name has positions more than 10 km apart. A station is usually one place, but a name that stands for an area, a transect or a cruise can legitimately span more.',
    fires:
      'When the largest distance between the positions of one station name, within one cruise or one calendar year, is above 10 km, and either it is not above 1000 km or the name is an expedition or cruise label, or a generic label such as Sta. 1 with no cruise or date to anchor it; those stay a note even above 1000 km. The finding gives the distance rounded to km and the positions. It is an information note.',
    example:
      'Station T1 has positions 38 km apart, because the name was used for every point of a transect. The note gives 38 km.',
    action:
      'If the name means one place, correct the position. If it names a transect or an area, ignore the note. In /convert this finding is only shown.',
  },
  'ROW-STATION-SPREAD-FAR': {
    checks:
      'One station name has positions more than 1000 km apart. A station is one place, so this is almost certainly a wrong position, not an area.',
    fires:
      'When the largest distance between the positions of one station name, within one cruise or one calendar year, is above 1000 km (a limit chosen by this tool, not a published threshold). A name that is an expedition or cruise label, or a generic label with no cruise or date to anchor it, gives ROW-STATION-SPREAD instead. Generic placeholder names and positions with latitude equal to longitude are skipped. It is a warning.',
    example:
      'Station K7 is at 54.5 N 18.6 E on 12 rows and at 54.5 N 118.6 E on one row. The distance is about 5900 km, and both positions are listed.',
    action:
      'Find which position is wrong, a sign, a digit or swapped axes, and correct it. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.',
  },
  'ROW-ON-LAND-NEAR': {
    checks:
      'A position lies on land 10 to 50 km from the sea, by a coarse coastline map. For a marine sample that is suspicious but can be a river mouth, a fjord or the limit of the map.',
    fires:
      'When the position is on land by the Natural Earth 1:10m map and its nearest sea is 10 to 50 km away. It is an information note and carries no hint about a flipped sign. Within 10 km of the sea, near rivers and canals, nothing is judged. It runs only when a land map is available.',
    example:
      'A sample at 53.0 N 8.0 E, in Lower Saxony near Bremen, is on land by the map and at least 20 km from the sea. The note gives the position.',
    action:
      'Check whether the sample was taken in an estuary, a lagoon or a port; if so the position can stay. /check only: /convert has no land map, so this finding never appears there.',
  },
  'ROW-ON-LAND': {
    checks:
      'A position lies on land at least 50 km from the sea. A marine sample cannot be taken there, so a coordinate or its sign is probably wrong.',
    fires:
      'When the position is on land by the Natural Earth 1:10m map and the nearest sea is at least 50 km away. The finding adds a hint when a flipped sign or exchanged latitude and longitude would put the position at sea. It runs only when a land map is available.',
    example:
      'A position of 52.2 N 19.4 E is in central Poland, far from any sea. With the longitude as 19.4 W it is in the Atlantic, and the finding says so.',
    action:
      'Correct the sign or the axes, or confirm that the sample is not marine. /check only: /convert has no land map, so this finding never appears there.',
  },
  'ROW-SHIP-SPEED': {
    checks:
      'A ship would have to travel above 40 knots to reach a position and leave it again. A real ship cannot, so the position or the date of that event is wrong.',
    fires:
      'For events of one cruise ordered by time, when both the hop into an event and the hop out of it exceed 40 knots while the hop from the previous to the next event does not. The speed is the distance, less the rounding of the written coordinates, over the longest time the written dates and times allow. Events about 10 km apart count as one point. A hint names a sign that, once reversed, makes the hops plausible.',
    example:
      'Three stations of one cruise on one day: 54.5 N 18.6 E at 08:00, 54.6 N -18.6 E at 10:00 and 54.7 N 18.7 E at 12:00. The middle one needs hundreds of knots to be reached, and the hint names its longitude sign.',
    action:
      'Correct the position or the date of the event named. /check only: /convert passes no cruise to this check, so this finding never appears there.',
  },
  'ROW-SHIP-SPEED-UNUSUAL': {
    checks:
      'A ship would have to travel faster than 15 knots to reach a position and leave it again. That is unusual for a research vessel doing stations, though not impossible.',
    fires:
      'When both hops around an event exceed 15 knots but not 40, or when one hop exceeds 40 knots and the other only 15. It is an information note and uses the same speed and grouping as ROW-SHIP-SPEED.',
    example:
      'Stations of one cruise: 54.00 N 18.00 E at 06:00, 54.90 N 18.00 E at 09:00 and 54.01 N 18.00 E at 12:00. The middle one is 100 km away, about 18 knots each way, while the first and third are 1 km apart. The note names the middle station.',
    action:
      'Check the times: an error in the hour is the usual reason. If the cruise really sailed at that speed, ignore the note. /check only: /convert passes no cruise to this check.',
  },
  'ROW-SHIP-SPEED-PAIR': {
    checks:
      'Two consecutive events are so far apart in space compared to time that a ship would need more than 40 knots. It is not clear which of the two is wrong.',
    fires:
      'For a single pair of consecutive events of one cruise, for example the first or the last event or two wrong events in a row, when the speed exceeds 40 knots and neither event is already in a ship-speed finding (ROW-SHIP-SPEED or ROW-SHIP-SPEED-UNUSUAL).',
    example:
      'The first station of a cruise is at 60.1 N 5.2 E on 3 May at 10:00 and the second at 54.0 N 8.0 E at 12:00. The pair is reported, because the speed is about 190 knots.',
    action:
      'Decide which of the two events has the wrong position or time and correct it. /check only: /convert passes no cruise to this check, so this finding never appears there.',
  },
  'ROW-DATE-UNPARSEABLE': {
    checks:
      'A date cell cannot be read as a date. Without a date the event cannot be placed in time, so it is lost from the output.',
    fires:
      'For a cell of the date column that is none of the accepted forms: ISO 8601, YYYY/MM/DD, DD.MM.YYYY, an unambiguous DD/MM/YYYY, YY-MM-DD, a four-digit year, YYYYMMDD in a column that is the date, or an Excel serial number. One finding per sheet lists the lines and an example.',
    example:
      'A date column holds 2021-06-14, summer 2021 and 14 Jun 2021. The text summer 2021 on line 3 is reported.',
    action:
      'Write the date in ISO form, YYYY-MM-DD. In /convert this finding blocks the export, except for the cells you have declared by the date order question, which it removes.',
  },
  'ROW-TIME-OTHER-DAY': {
    checks:
      'The time column holds a full date and time of another day than the date column. The time of day cannot be trusted, so it is not used.',
    fires:
      'When a time cell is a full datetime without a zone on a day other than the date column, or with a zone more than one day from the date. A datetime with a zone within one day of the date is read as an instant instead and does not raise this.',
    example:
      'The date column reads 2020-08-15 and the time column reads 2020-08-16 09:30. The time of day 09:30 is not taken, and line 4 is reported.',
    action:
      'Make the date and the time columns agree, or keep only the time of day in the time column. In /convert this finding blocks the export until they agree.',
  },
  'ROW-DATE-MISSING': {
    checks:
      'Some rows have a date and others have an empty date cell. The rows without a date cannot be placed in time.',
    fires:
      'When a sheet has at least one row with a date and at least one with a blank date cell; the finding gives the count and the percentage. An unreadable date is ROW-DATE-UNPARSEABLE, and a sheet with no dates at all is META-NO-DATES. In /convert it is left out when the events are already named by CONV-EVENT-DATE-MISSING.',
    example:
      'Of 120 rows, 100 have a date and 20 have an empty date cell. The finding gives 20 rows, about 17 percent.',
    action:
      'Fill the dates, or confirm that the rows are undated on purpose. In /convert this finding is only shown.',
  },
  'ROW-YEAR-OUTLIER': {
    checks:
      'The dates include a year that the dataset itself does not claim. The label, the file name, the title or the temporal extent name other years, so either the claim or the row is wrong.',
    fires:
      'For rows whose year is not among the years found in the label, the file name, the record title or the temporal extent. A range such as 1994-2019 names every year in it; a number followed by a unit such as m is not read as a year. Only years between 1900 and 2100 count. It does nothing when the dataset names no year.',
    example:
      'The title says Winter cruise 2018. Two rows are dated 2081-02-11, a swapped digit pair. The two lines are reported.',
    action:
      'Correct the date, or correct the title or the temporal extent if the data really span other years. In /convert this finding is only shown.',
  },
  'ROW-YEAR-DATE-MISMATCH': {
    checks:
      'A Year column and the date column of the same row disagree about the year. One of them is wrong.',
    fires:
      'When a sheet has a Year column next to a date column and a row has a four-digit year from 1700 to next year that differs from the year of the date; a date range counts every year it covers. Not compared: a year-only date, a date built from the Year column, a date with an ambiguity flag, a blank or non-numeric year.',
    example:
      'Line 9 has Year 2019 and the date 2020-03-05. The line is reported with both years.',
    action:
      'Decide which of the two is right and correct the other. In /convert this finding is only shown.',
  },
  'ROW-JOIN-AMBIGUOUS': {
    checks:
      'The key that joins a sheet to another sheet of positions or dates matches several rows there, and those rows differ in position or date. The tool cannot know which one is meant.',
    fires:
      'For every row whose join key matches two or more rows of the other sheet that differ in position or date. The row gets no position and no date from that sheet. The first matching row is never taken as a guess.',
    example:
      'A measurement sheet joins on Station S5. The station sheet has S5 twice, at 54.2 N and at 54.9 N. Every measurement of S5 is left without a position.',
    action:
      'Make the key unique, for example by adding the cruise or the date to it. /convert does not raise this rule; it has its own questions about joining sheets.',
  },
  'ROW-JOIN-KEY-BLANK': {
    checks:
      'A part of the join key is empty on rows that have no position of their own. Such rows cannot be matched to the sheet that holds positions.',
    fires:
      'For rows without a position of their own whose join key has a blank part, for example an empty station cell. The finding lists the lines.',
    example:
      'Measurements are joined by cruise and station, and line 22 has an empty station. It cannot be matched and has no position.',
    action:
      'Fill the missing part of the key. /convert does not raise this rule; it has its own questions about joining sheets.',
  },
  'ROW-LONG-VALUE-SKIPPED': {
    checks:
      'In a long sheet (one row per parameter) the same key and parameter hold different values, and no column could tell the rows apart. Only one value can be kept.',
    fires:
      'When rows with the same key and parameter have different values and no column could safely be added to the key. The first value is read, or the first one after a blank or missing value. Nothing is averaged. Equal values are not counted.',
    example:
      'Station S2, parameter nitrate, appears with 4.1 and 4.6 and nothing else differs. 4.1 is read and 4.6 is skipped, and the finding names both.',
    action:
      'Add a column that tells the rows apart, such as a replicate or a time, or remove the duplicate. /convert does not raise this rule; its own CONV-LONG-DUPLICATE covers duplicate values.',
  },
  'ROW-LONG-KEY-EXTENDED': {
    checks:
      'In a long sheet the tool added columns to the row key, because rows with the same key and parameter held different values there. It is not proof that the rows are replicates.',
    fires:
      'When rows with the same key and parameter differ and one or more other columns can tell them apart; the finding names the columns used. It is an information note.',
    example:
      'Station S3 has two nitrate rows, 4.1 and 4.6, and a Depth column of 5 and 20. Depth is added to the key, and the note says so.',
    action:
      'Check that the added columns really separate different samples and not replicates. /convert does not raise this rule; its own CONV-LONG-DUPLICATE covers duplicate values of a long sheet.',
  },
  'ROW-LONG-NO-PARAMETER': {
    checks:
      'A row of a long sheet has a value but no parameter name. Without it the value cannot be assigned to any variable.',
    fires:
      'For a row with a value and a blank parameter cell when no merged cell above gives a parameter. The row is not read. A row whose value is also blank is not counted.',
    example:
      'Line 17 has the value 12.4 and an empty Parameter cell, with nothing merged above. Line 17 is not read and is reported.',
    action:
      'Fill the parameter name. In /check this is a warning. /convert does not raise this rule; it raises CONV-LONG-NO-PARAMETER for the same rows and blocks the export.',
  },
  'ROW-LONG-PARAMETER-MERGED': {
    checks:
      'In a long sheet a parameter cell is merged over several rows. The tool takes the name of the top cell for the rows below it, and tells you that it did.',
    fires:
      'For rows below the top cell of a merge that the workbook declares and which have a value. Only rows with a value are filled. It is an information note.',
    example:
      'The cell Parameter says nitrate and is merged over lines 5 to 9. Lines 6 to 9 are read as nitrate, and the note lists them.',
    action:
      'Check that the merge means the same parameter for all rows, or unmerge it and repeat the name. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.',
  },
  'ROW-KEY-IGNORED': {
    checks:
      'Columns you set to ignore differ between rows that are equal in every column that identifies them. Ignoring them may merge rows that are really different.',
    fires:
      'When rows equal in every written identifying column differ in an ignored column. Nothing is removed. A column that is ignored by default is still written.',
    example:
      'Two rows have the same station, date and depth but different values in a Replicate column that is set to ignore. The rows are reported.',
    action:
      'Stop ignoring the column if it separates real samples. /convert does not raise this rule.',
  },
  'ROW-DATE-YYMMDD': {
    checks:
      'A date written with two-digit parts, NN-NN-NN, was read with the century inferred. The century is a guess and can be wrong for old data.',
    fires:
      'Once per column, when the order of the cells is fixed, because some cell rules the other readings out or the order was declared. The century rule: a two-digit year up to the current year plus one is 20xx, any other is 19xx. The finding gives the interpreted date and the order read (ymd, dmy or mdy). One acceptance of the rule covers the century in every column it names.',
    example:
      'The column holds 98-07-25. 98 cannot be a day or a month, so it is read as year-month-day, 1998-07-25, with the century 19xx. If the cruise was in 2098 the century is wrong.',
    action:
      'Write four-digit years, or check that the century is right. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.',
  },
  'ROW-DATE-YY-AMBIGUOUS': {
    checks:
      'A date column with two-digit parts, NN-NN-NN, can be read in more than one order and the readings give different dates. It is a guess which is right.',
    fires:
      'Once per column, when two or more of year-month-day, day-month-year and month-day-year fit every cell, no cell rules a reading out (a part above 31, or above 12 in a month place, rules it out), and the dates differ. The tool reads year-month-day when that fits. Slash dates such as 03/04/2021 follow a different answer, the day-month order.',
    example:
      'The column holds 05-06-07 and 08-09-10. They can be 2005-06-07, 5 June 2007 or 6 May 2007, and the dates differ. The column is reported once.',
    action:
      'Write the dates in ISO form. /convert asks you to declare the order of the two-digit-year column and blocks the export until you answer; that answer is separate from the day-month order of slash dates.',
  },
  'ROW-TZ-UNKNOWN': {
    checks:
      'A date and time has no time zone, neither a UTC mark nor an offset. The instant is therefore unknown by up to a day.',
    fires:
      'Once per column, when a date-time at minute or second precision has neither a UTC marker nor an offset. It is not raised when the column is declared to be UTC.',
    example:
      'The column holds 2021-06-14 09:30. Without Z or +02:00 it is not known whether this is local time or UTC.',
    action:
      'Add the zone, for example 2021-06-14T09:30Z, or declare that the column is UTC. In /convert this finding is only shown.',
  },
  'ROW-UNIT-MISSING': {
    checks:
      'A measured variable has no unit in its header or in the metadata. A number without a unit cannot be compared or reused.',
    fires:
      'For each variable column with no unit in the header or the metadata, up to 10 are listed. A unit only inferred from a P01 code counts as missing. Salinity, pH, their spread columns and an OPeNDAP text column are exempt.',
    example:
      'The headers are Temp, Nitrate and Chl. None has a unit, so the three are listed. Writing Temp (degC) removes it from the list.',
    action:
      'Add the unit to each header, in parentheses or in the metadata. In /convert this finding is only shown.',
  },
  'ROW-HEADER-CODE-SHAPE': {
    checks:
      'A header names a vocabulary code that does not have the shape of its collection. Such a code cannot exist, so the header is mistyped.',
    fires:
      'For a code after an explicit SDN:P01:: or SDN:P06:: prefix that is not 8 uppercase letters and digits for P01, or 4 for P06. A bare word is never read as a code.',
    example:
      'A header reads SDN:P01::TEMPPR01. That is 8 characters and fine. SDN:P01::TEMP is only 4, so it is reported.',
    action:
      'Correct the code from the vocabulary server, or remove the prefix. /convert does not raise this rule; it has its own CONV-NERC-CODE-MALFORMED.',
  },
  'ROW-DEPTH-SIGN': {
    checks:
      'The direction of the depth, positive down or positive up, is not stated by the header or by your declaration. The same number can then mean opposite things.',
    fires:
      'When the depth column is known but its direction is unknown after the header and the declaration are read. It is not raised for a sheet already reported by ROW-DEPTH-MIXED-SIGN.',
    example:
      'A column called Depth holds 5, 20 and 50 with no unit or sign note. It is not known whether 50 is 50 m below or above the surface.',
    action:
      'State the direction in the header, for example Depth (m, positive down), or declare it. /convert does not raise this rule: the depth it checks is its own Event table, in metres and positive down.',
  },
  'ROW-DEPTH-MIXED-SIGN': {
    checks:
      'One sheet holds both negative and positive depths. Some rows probably use the opposite direction, and no direction can be chosen safely.',
    fires:
      'Per sheet, when non-zero depths of both signs exist. The values 0, -99, -999 and -9999 are not counted, except in /convert, where such codes count as values. No direction is chosen, not even the majority. ROW-DEPTH-RANGE then judges the size of the depth, and nothing is changed.',
    example:
      'A depth column holds 5, 10, -20 and -30. Both signs are present, so the sheet is reported.',
    action:
      'Make all depths use one direction. In /convert the check runs on the depth columns of the converted table and does not block the export, but it needs your acceptance, one tick for the rule.',
  },
  'ROW-MISSING-CODE': {
    checks:
      'A cell holds -99, -999 or -9999, which are common codes for missing values. As numbers they would be false depths or measurements.',
    fires:
      'Once per sheet and column, for a cell exactly equal to one of the three numbers, in the depth column (or the two Darwin Core depth bounds) and in every variable. The cell is kept as written and is left out of the depth direction, ROW-DEPTH-RANGE and CHEM-RANGE.',
    example:
      'A salinity column holds 33.1, -999 and 33.4. The -999 on line 2 is kept as written, left out of the range checks, and reported.',
    action:
      'Empty such cells in the source if they mean missing. In /convert this finding blocks the export until you answer, per column, whether the code is missing or a real value; on missing the cells are left empty and listed.',
  },
  'ROW-DM-COORDS': {
    checks:
      'A coordinate was written in degrees and minutes, or degrees, minutes and seconds, as text. The tool converted it to decimal degrees.',
    fires:
      'For each coordinate cell of that form; the finding lists the lines and the conversion. It is a note that a conversion took place.',
    example:
      'The cell 54 30.5 N becomes 54.508333. The note shows both.',
    action:
      'Check the converted value, and write decimal degrees in your own copy. In /convert this finding is only shown.',
  },
  'ROW-HEMISPHERE-CONFLICT': {
    checks:
      'A coordinate and its hemisphere letter disagree, for example a latitude that already has a minus sign beside the letter S. One of the two is wrong.',
    fires:
      'When the value already carries a minus sign or a letter of its own that disagrees with the hemisphere cell, or the hemisphere letter belongs to the other axis (E or W on a latitude, N or S on a longitude). The value is kept as written and is not negated. A plain 54.3 with S is simply read as -54.3 and raises nothing.',
    example:
      'The latitude is -54.3 and the hemisphere column says S. A minus and an S together are a conflict, and the latitude stays -54.3.',
    action:
      'Correct the value or the letter. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.',
  },
  'ROW-HEMISPHERE-UNPAIRED': {
    checks:
      'A hemisphere column does not match the coordinate it was mapped to. Its start or end word points to the other end of the track.',
    fires:
      'Once per column, when the start or end word of the hemisphere column does not match the coordinate it signs. An axis word alone never raises it. The hemisphere is not applied.',
    example:
      'The column Beg Lat Dir is mapped to End Latitude. It is not applied, and the finding names the column.',
    action:
      'Map the hemisphere column to its own axis. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.',
  },
  'ROW-HEMISPHERE-MISSING': {
    checks:
      'A hemisphere column has an empty cell or a letter that is not N, S, E or W. The sign of the coordinate is therefore unconfirmed.',
    fires:
      'For each row whose hemisphere cell is empty or not one of the four letters. The value is kept as written.',
    example:
      'The column holds N, N and a blank. The blank line is reported and its latitude is used as written.',
    action:
      'Fill the letter. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.',
  },
  'ROW-NO-COORD': {
    checks:
      'A row has no latitude or no longitude although other rows of the sheet have a position. It cannot be placed on a map.',
    fires:
      'For a row with a blank latitude or longitude on a sheet where other rows have a position. Not counted: blank trailing rows, summary rows, rows that inherit a position from a parent event, and continuation rows of a station block. A row with both blank is exempt when its station, date or cruise has a position elsewhere; a row with one blank coordinate is always reported. A sheet with no position at all says nothing. In /convert it is raised only for an event with no positioned parent.',
    example:
      'Line 12 has a longitude of 18.6 and an empty latitude. Line 12 is reported.',
    action:
      'Fill the position. In /convert this finding blocks the export until it is filled.',
  },
  'ROW-ZERO-COORD': {
    checks:
      'A position is exactly latitude 0 and longitude 0, a point in the Gulf of Guinea. It is the usual result of an empty cell turned into zero.',
    fires:
      'For a row with latitude 0 and longitude 0. It replaces ROW-LAT-EQ-LON for the same row. OBIS drops such records.',
    example:
      'Line 6 reads 0, 0 for a sample taken in the Baltic. Line 6 is reported.',
    action:
      'Enter the real position or leave the cells empty. In /convert this finding blocks the export until the position is corrected.',
  },
  'ROW-DEPTH-MIN-MAX': {
    checks:
      'The minimum depth is larger than the maximum depth in the same row. One of the two is wrong.',
    fires:
      'For a row where minimumDepthInMeters is greater than maximumDepthInMeters, only when both Darwin Core depth columns exist. OBIS rejects such records.',
    example:
      'Line 4 has a minimum depth of 50 and a maximum of 10. Line 4 is reported.',
    action:
      'Swap or correct the two values. In /convert this finding blocks the export until they are corrected.',
  },
  'ROW-DEPTH-RANGE': {
    checks:
      'A depth lies outside what is possible on Earth. The deepest known point is about 10,935 m.',
    fires:
      'For a depth below -100000 m or above 11000 m, positive down, the OBIS limits. A missing-value code is skipped unless it counts as a value (in /convert). An upward convention is judged after the sign is turned. A column in another unit, such as ft or cm, is not judged. With mixed signs the size of the depth is judged.',
    example:
      'A depth column with no unit in its header holds 25, 40 and 4500000, a value typed in millimetres. The last is reported.',
    action:
      'Check the unit and the value. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.',
  },
  'ROW-DATE-FUTURE': {
    checks:
      'A date, or the end of an interval, is later than today. A sample cannot have been taken in the future.',
    fires:
      'When the date is later than today in UTC and can have begun nowhere yet; UTC+14 is allowed, so one day ahead is not reported and two are. A year or a month counts by its first day. A two-digit-year date with an ambiguity flag is left to ROW-DATE-YYMMDD and ROW-DATE-YY-AMBIGUOUS. OBIS rejects such records.',
    example:
      'A table dated in 2026 holds 2062-03-04, a century guessed wrong. The line is reported.',
    action:
      'Correct the year or the century. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.',
  },
  'ROW-INVISIBLE-CHAR': {
    checks:
      'A value contains an invisible character inside it, such as a no-break space. Two values that look equal then differ, and joins and matches fail.',
    fires:
      'For a character inside a value in the station, cruise or sample identifier columns, and in the name, identifier and vocabulary columns of Darwin Core input. OBIS trims only the ends of a value.',
    example:
      'The station name St 5 contains U+00A0 instead of a space, so it does not match St 5 elsewhere. The finding names the line and the character.',
    action:
      'Retype or replace the character in the source. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.',
  },
  'ROW-TEXT-MOJIBAKE': {
    checks:
      'Text shows the damage of a double encoding: letters such as accented names appear as two odd characters. The file was decoded with the wrong encoding at some stage.',
    fires:
      'When a cell contains the pair U+00C3 or U+00C2 followed by a character from U+0080 to U+00BF, as in the damaged form of an accented letter. A lone U+00C3 or U+00C2 is not matched, nor are other double-encoded forms. The finding gives the count of the pairs.',
    example:
      'A station called Sao Joao appears as the damaged form of Sao Joao with accents, two odd characters in place of each accented letter. The cell is reported.',
    action:
      'Save the source again as UTF-8 and correct the damaged text. In /convert this finding is only shown.',
  },
};
