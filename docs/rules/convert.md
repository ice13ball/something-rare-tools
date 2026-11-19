# Rules of /convert

Generated from the rule registry (`src/core/rules/`) by `scripts/rules-docs-per-tool.ts`. Do not edit by hand.
Regenerate with `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-docs-per-tool.test.ts`.

/convert reads a spreadsheet or table, asks the person to declare what the columns mean, and writes a Darwin Core archive. It re-uses the file-reading and row checks of /check, and adds its own questions (rules with the prefix CONV). For every rule the list names the export policy: block stops the export, accept needs one tick for the rule per run, show is only shown.

The list is the rules the tool can raise, found by a static scan of its code, so a few may never fire in practice. Severity is error, warning or info. Every number a rule compares against is listed with its source. Each rule has four short parts: what it checks, when it fires, an invented example, and what the person can do.

212 rules.

## IN-LAYOUT-UNSUPPORTED — The table is laid out in a way the tool cannot read as one header row and one row per sample, so it was not read

Severity: error · Export policy: block

**What it checks.** The table is laid out in a way the tool cannot read as one header row and one row per sample, so it was not read.

**When it fires.** When the layout reader finds data that is transposed (variables or species in rows, samples in columns), a header spread over several rows (more than half of the header cells empty in a table of three or more columns, or a first data row of units that was not folded into the header), a row above the names that holds footnote markers, a table with no rows, a workbook with no sheet of coordinates or measurements, or no table at all. The finding gives the reason and, for a workbook, the sheet.

**Example.** A sheet lists the variables down the first column and the samples across the top; the finding says the data is transposed.

**What you can do.** Reshape the table into one header row with one row per sample and add it again. In /convert this finding blocks the export.

## IN-ENCODING-FALLBACK — The file is not saved as UTF-8, so the tool read it as an 8-bit Central European or Western code page

Severity: info · Export policy: accept

**What it checks.** The file is not saved as UTF-8, so the tool read it as an 8-bit Central European or Western code page. The letters with accents may be wrong if that guess is wrong.

**When it fires.** When the bytes are not valid UTF-8 and all three 8-bit readings the tool tries (windows-1250, ISO-8859-2 and windows-1252) give the same text. The file is read as windows-1250 when one of the bytes 8A, 9A, 8C, 9C, 8F or 9F occurs, otherwise as ISO-8859-2; the finding names the reading used. Plain ASCII is valid UTF-8 and never raises it. If the readings differ, IN-ENCODING-AMBIGUOUS is raised instead. A UTF-16 file or a UTF-8 file with a BOM is read without a finding.

**Example.** A file that is not valid UTF-8 and whose only non-ASCII byte is E9 in caf followed by that byte: all three readings give the same letter, and the file is read as ISO-8859-2.

**What you can do.** Check that accented letters look right, and save the file as UTF-8 when you publish. In /convert the reading is accepted once and does not stop the export.

## IN-ENCODING-AMBIGUOUS — The file is not UTF-8 and its accented letters read in two or three different ways, depending on which 8-bit code page is assumed

Severity: warning · Export policy: block

**What it checks.** The file is not UTF-8 and its accented letters read in two or three different ways, depending on which 8-bit code page is assumed. Only the person who saved the file knows which reading is right.

**When it fires.** When the bytes are not valid UTF-8 and at least two of windows-1250, ISO-8859-2 and windows-1252 decode them to different text. The finding shows each reading with up to three differing words and the one that was used (windows-1250 or ISO-8859-2). Code pages that decode alike count as one reading. UTF-16 is recognised by its BOM or its alternate zero bytes and is not ambiguous.

**Example.** The same bytes read as Krřyer in windows-1250 and ISO-8859-2 and as Krøyer in windows-1252; the finding shows both words.

**What you can do.** Decide which reading is right and save the file as UTF-8, or in /convert declare the encoding so the question is answered. /check keeps its pick and only reports. In /convert this finding blocks the export until the encoding is declared.

## IN-DECIMAL-COMMA — The file writes numbers with a decimal comma (3,14) instead of a point

Severity: info · Export policy: accept

**What it checks.** The file writes numbers with a decimal comma (3,14) instead of a point. The tool read them that way, so values are numbers and not text.

**When it fires.** When the delimiter is a semicolon or a tab and at least 80 percent of the cells with a decimal separator in the first 50 rows are written with a comma, as n,n. Whole numbers say nothing about the separator and are ignored. A column whose commas could also be thousands separators is also reported by IN-DECIMAL-AMBIGUOUS.

**Example.** A semicolon-separated file holds 12,5; 3,14 and 0,07 in a column.

**What you can do.** Use a decimal point when you publish. If the commas were meant as something else, change the file. In /convert the reading is accepted once and does not stop the export.

## IN-DECIMAL-AMBIGUOUS — In one column of a file that uses a decimal comma, every number with a comma has exactly three digits after it, so the comma may be a decimal comma (1,250 is one and a quarter) or a thousands separator (1,250 is one thousand two hundred fifty)

Severity: warning · Export policy: block

**What it checks.** In one column of a file that uses a decimal comma, every number with a comma has exactly three digits after it, so the comma may be a decimal comma (1,250 is one and a quarter) or a thousands separator (1,250 is one thousand two hundred fifty). The file does not say which.

**When it fires.** Per column of a decimal-comma file, only when every number with a comma has exactly three digits after it. A single value such as 1.250,5 settles the column (with both separators the last is the decimal), and so does a value with one, two, or four or more decimals; then no finding is raised. In 1,250,000 the comma repeats, so it is a thousands mark; the question stays open for the other values and the finding names that cell. The finding gives the column, the number of cells, the first such value and both readings. The cells were read as decimals.

**Example.** A column of depths in metres holds 1,250 and 2,500; read as decimals they are 1.25 and 2.5, read as thousands 1250 and 2500.

**What you can do.** Decide what the comma means in this column. In /convert declare it as decimal or as thousands; under thousands the cells written 1,250 or 1,250,000 are read as 1250 and 1250000. In /check the finding only reports. In /convert this finding blocks the export until the column is declared.

## IN-HEADER-SHORT — The header row has fewer names than the data rows have values

Severity: warning · Export policy: accept

**What it checks.** The header row has fewer names than the data rows have values. The tool cannot tell where the names are missing, so values may sit under the name of a neighbour column.

**When it fires.** When at least 95 percent of the data rows (at least three rows are needed) have the same number of fields, that number is larger than the header's, and the extra fields are not all empty. The extra values are given the internal names Column N at the end. A trailing delimiter that adds only empty fields is not reported, and a first data row that reads as a header is treated as the real header instead.

**Example.** A header of 10 names over rows of 12 values: the last two are shown as Column 11 and Column 12.

**What you can do.** Give every column a name in the file, and check the first values of the last named columns in case a name is missing earlier. In /convert the unnamed column is left out unless it is mapped to a variable; a mapped one must be named first (CONV-COLUMN-UNNAMED blocks the export otherwise). This finding itself is accepted and does not stop the export.

## IN-HEADER-UNITS-READ — A second header row of units was read: the line under the column names holds only units, so it is not data

Severity: info · Export policy: show

**What it checks.** A second header row of units was read: the line under the column names holds only units, so it is not data. The units were added to the column names.

**When it fires.** When the row directly under the header (or under a row of statistic labels) has only unit cells, at least two of which go into a header, every cell has a name above it, and the numbers below fit the units. A unit that disagrees with the one the name already gives means the row is not folded. The finding gives the line and the first changed name, for example a column now named a \[h\]. The line numbers in the report stay the file's own.

**Example.** A header latitude, longitude over a row degrees_north, degrees_east: the names become latitude \[degrees_north\] and longitude \[degrees_east\].

**What you can do.** Nothing to fix. If you prefer a single header row, put the unit into the column name. In /convert this finding is only shown and never stops the export.

## IN-HEADER-UNITS-NAMED — A row of units under the header was recognised and skipped

Severity: info · Export policy: show

**What it checks.** A row of units under the header was recognised and skipped. The column names already carried the same units, so no name was changed.

**When it fires.** When the row under the header holds only units and every column it names has the same unit in its own header too, for instance depth \[m\] over m. The row is not a data row and the report keeps the file's own line numbers. The finding gives the line.

**Example.** The header holds temperature \[C\] and depth \[m\] and the next line holds C and m.

**What you can do.** Nothing to fix. Remove the second row if you want a plain single header. In /convert this finding is only shown and never stops the export.

## IN-PERCENT-READ — Cells of an Excel column are formatted as percentages and were read as shown: a stored 0.95 formatted as 95% is read as 95, not 0.95

Severity: info · Export policy: show

**What it checks.** Cells of an Excel column are formatted as percentages and were read as shown: a stored 0.95 formatted as 95% is read as 95, not 0.95.

**When it fires.** Per column of an Excel sheet with at least one numeric cell whose number format shows a percent sign and whose stored value differs from the shown one. The decimal point of the stored number is moved two places right (never the cell's rounded display text). The finding gives the column, the number of cells and the first stored and shown values.

**Example.** A column of 0.07 formatted as 0.0% is read as 7; the finding says 0.07 is read as 7.

**What you can do.** If you meant fractions, reformat the cells as numbers. If you meant percent values, leave them. Check the unit in the column name. In /convert this finding is only shown and never stops the export.

## IN-COLUMN-NO-HEADER — A column of an Excel sheet holds values to the right of the last named header cell but has no name itself

Severity: warning · Export policy: show

**What it checks.** A column of an Excel sheet holds values to the right of the last named header cell but has no name itself. It is read as a column without a name, and every cell stays where it is.

**When it fires.** When a data row has a value in a column to the right of the last named header cell. The finding gives the column letter, the number of rows with a value and their lines.

**Example.** The header names columns A to F, and column G holds numbers in 40 rows; column G is reported with those rows.

**What you can do.** Give the column a name in the file. In /convert the unnamed column is left out unless it is mapped to a variable; a mapped one must be named first (CONV-COLUMN-UNNAMED blocks the export otherwise). This finding itself is only shown and never stops the export. In /convert this finding is only shown and never stops the export.

## IN-DATE1904 — An Excel workbook uses the older 1904 date system

Severity: info · Export policy: show

**What it checks.** An Excel workbook uses the older 1904 date system. Dates were converted with its epoch; they differ by 1462 days from the same number in the usual 1900 system.

**When it fires.** When the workbook has its 1904 date flag set. Serial dates are converted from 1 January 1904. Dates written as text are not affected.

**Example.** The same stored serial number is a date four years and a day later in the 1904 system than in the 1900 system, so reading a 1904 file as 1900 would move every date.

**What you can do.** Check a few of the dates. If the dates are off by about four years, the file was created on an older Mac; consider resaving it in the 1900 system. In /convert this finding is only shown and never stops the export.

**Citations.**

- [Microsoft Support, Date systems in Excel](https://support.microsoft.com/en-us/office/date-systems-in-excel-e7fe7167-48a9-4b96-bb53-5612a800b487), 1900 and 1904 date systems; "The difference between the two date systems is 1,462 days."

## IN-PANGAEA-EVENT-USED — A PANGAEA table without position or date columns got Latitude, Longitude and/or Date/Time from the Event(s) block of its file header

Severity: info · Export policy: show

**What it checks.** A PANGAEA table without position or date columns got Latitude, Longitude and/or Date/Time from the Event(s) block of its file header.

**When it fires.** When a PANGAEA text file has an Event(s) block with points or dates and the table lacks those columns. With one event it applies to every row; with several, each row takes the event named in its Event column. A column the table already has is never touched, and a value a row has is never overwritten. The finding names the columns added, the number of events and the rows filled.

**Example.** A table of samples without coordinates and an Event(s) block that lists station ST-01 with its position and time; each row gets that position and time.

**What you can do.** Check the values the finding names. Add your own position and date columns if the sample position differs from the event's. In /convert this finding is only shown and never stops the export.

## IN-PANGAEA-EVENT-NOT-USED — The Event(s) block of a PANGAEA file gives a position or date, but no position was copied into the table (a date may still be), and the table has no position of its own

Severity: warning · Export policy: show

**What it checks.** The Event(s) block of a PANGAEA file gives a position or date, but no position was copied into the table (a date may still be), and the table has no position of its own.

**When it fires.** When the table lacks the position and the block cannot give it: several events are listed but the table has no Event column to say which row belongs to which, or the event's position is a track (start and end differ) and not a point, which also applies to a single event. The finding gives the number of events and which of the two reasons applies.

**Example.** A block lists three stations and the table has no Event column; nothing is borrowed.

**What you can do.** Add an Event column, or position and date columns, to the table. For a track add the position of each sample. In /convert this finding is only shown and never stops the export.

## IN-PANGAEA-EVENT-UNMATCHED — Some rows of a PANGAEA table have no matching event in the Event(s) block of the file header, so nothing was taken for them

Severity: warning · Export policy: show

**What it checks.** Some rows of a PANGAEA table have no matching event in the Event(s) block of the file header, so nothing was taken for them.

**When it fires.** When the table has an Event column, for each row whose Event cell is empty, names an event that is not listed, names an event listed twice, or names an event with no position or date (also for a single event lacking the value). The finding gives the number of rows and their lines.

**Example.** Rows 12 and 13 say station 7, and the block lists stations 1 to 6.

**What you can do.** Fill the position and date for those rows in the table. In /convert this finding is only shown and never stops the export.

## META-NO-DATES — Neither the table nor the record holds any date

Severity: error · Export policy: show

**What it checks.** Neither the table nor the record holds any date. Data without a date cannot be placed in time, and OBIS and most repositories require one.

**When it fires.** For a table with rows and a supported layout, when no row has a date (a date cell that exists but cannot be read counts as a date column, and is reported by ROW-DATE-UNPARSEABLE) and no record has a temporal extent or a collection date. Publication dates are not used. A lookup table of the same file, which holds no measurement while another sheet of the file does, is skipped. For a workbook the sheets that lack a date are listed in one finding. When a join left rows without a date the finding names the joined sheet as the likely cause. For an empty eventDate column of a Darwin Core table only this rule speaks, and DWC-TERM-EMPTY stays silent.

**Example.** A table of temperature and salinity by depth with no date column, described by a record without a temporal extent.

**What you can do.** Add the sampling date to the table or a time span to the record. In /convert, where the converter has already said that no event has a date (CONV-EVENT-DATE-MISSING), this finding is not repeated. In /convert the finding is only shown and never stops the export.

## ROW-LAT-RANGE — A latitude lies outside the range of the globe, -90 to 90 degrees

Severity: error · Export policy: block

**What it checks.** A latitude lies outside the range of the globe, -90 to 90 degrees. No place has such a latitude, so the value is a typing error, a swapped column or a unit mistake.

**When it fires.** For every row of a sheet whose latitude column holds a number below -90 or above 90. One finding per sheet lists the lines and shows the first value as written. Text in the cell is not judged here, that is ROW-NON-NUMERIC.

**Example.** A latitude column of a plankton table reads 54.31, 54.33, 154.35 on lines 5, 6 and 7. Line 7 is reported with the value 154.35, a digit typed twice.

**What you can do.** Correct the value in the source, or check whether latitude and longitude changed columns. In /convert this finding blocks the export until the source is corrected.

**Thresholds.**

- latitude.min = -90 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11
- latitude.max = 90 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11

**Citations.**

- [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.3 "Impossible Location", PDF p.44

## ROW-LON-RANGE — A longitude lies outside -180 to 180 degrees after the tool has tried the 0 to 360 scale

Severity: error · Export policy: block

**What it checks.** A longitude lies outside -180 to 180 degrees after the tool has tried the 0 to 360 scale. No place has such a longitude, so the value is a typing error, a swapped column or a unit mistake.

**When it fires.** For every row whose longitude is a number below -180 or above 360 (values from 180 to 360 are first read on the 0 to 360 scale and only noted as ROW-LON-360). One finding per sheet lists the lines and the first value as written.

**Example.** A longitude column holds 18.62, 18.65 and 1865.0 on lines 10, 11 and 12. Line 12 is reported: a decimal point was lost.

**What you can do.** Correct the value in the source, or check whether the two coordinate columns are swapped. In /convert this finding blocks the export until the source is corrected.

**Thresholds.**

- longitude.min = -180 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11
- longitude.max = 180 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11

**Citations.**

- [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.3 "Impossible Location", PDF p.44

## ROW-LON-360 — Longitudes are given on a 0 to 360 scale instead of -180 to 180

Severity: info · Export policy: show

**What it checks.** Longitudes are given on a 0 to 360 scale instead of -180 to 180. The tool converts them, and this note says that it did so, because the published file must use -180 to 180.

**When it fires.** For every row whose longitude is above 180 and not above 360. The tool subtracts 360 and reports the lines as an information note. A value above 360 is ROW-LON-RANGE.

**Example.** A longitude of 350.5 on line 8 is read as -9.5, and the note names line 8 and the value 350.5.

**What you can do.** Check that the converted longitude is the place you meant, and write the data on the -180 to 180 scale in your own copy. In /convert this finding is only shown.

**Citations.**

- [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.3 "Impossible Location", PDF p.44

## ROW-LAT-EQ-LON — Latitude and longitude are identical on many rows

Severity: error · Export policy: block

**What it checks.** Latitude and longitude are identical on many rows. That is almost never real: a column was copied into the other, and every position is wrong.

**When it fires.** When at least 5 rows have equal latitude and longitude (other than 0, 0) and either they are a fifth or more of the rows with a position, or at least 5 of them share one value written with two or more decimals that is not a multiple of 0.25. Fewer rows give ROW-LAT-EQ-LON-ISOLATED or ROW-LAT-EQ-LON-COARSE. The two limits are choices of this tool, not published thresholds.

**Example.** In a table of 30 rows with positions, 12 rows read 54.4, 54.4 on one line and 18.7, 18.7 on another. The 12 lines are reported with the first value.

**What you can do.** Find the column that was copied and enter the real positions. In /convert this finding blocks the export until the positions are corrected.

## ROW-LAT-EQ-LON-ISOLATED — A few rows have identical latitude and longitude with a fine decimal

Severity: warning · Export policy: accept

**What it checks.** A few rows have identical latitude and longitude with a fine decimal. It can be a coincidence, but typing one number into both columns is a common slip.

**When it fires.** When rows with equal latitude and longitude, not 0, 0, do not reach the error level of ROW-LAT-EQ-LON (fewer than 5 rows, or under a fifth of the rows with a position) and the value is finer than a half degree.

**Example.** Line 14 of a table of 200 positioned rows reads 41.37, 41.37. Line 14 is reported once with the value 41.37.

**What you can do.** Check the position against the field notes. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule, before the export button works.

## ROW-LAT-EQ-LON-COARSE — A few rows have identical latitude and longitude that are a whole or a half degree

Severity: info · Export policy: show

**What it checks.** A few rows have identical latitude and longitude that are a whole or a half degree. Such coarse positions are common in historical data, so the value can be right.

**When it fires.** When rows with equal latitude and longitude, not 0, 0, do not reach the error level of ROW-LAT-EQ-LON and the value is a whole or half degree. It is an information note.

**Example.** A historical net haul is recorded at -65.0, -65.0, a place on the Antarctic Peninsula. The note names the line and the value, and the position can stay.

**What you can do.** Only make sure that the number was not typed twice. In /convert this finding is only shown.

## ROW-RAGGED — A row has more or fewer values than the header has columns

Severity: error · Export policy: block

**What it checks.** A row has more or fewer values than the header has columns. Its values are shifted against the header, so no cell of the row can be trusted.

**When it fires.** When the file is read: for each line whose field count differs from the header field count. The finding gives the expected count and the count of the first listed line. The rows are kept as found and are not realigned.

**Example.** A header has 8 columns. Line 31 has 9 values because a comment contains an unquoted comma. Line 31 is reported with expected 8 and found 9.

**What you can do.** Fix the line in the original file, usually a missing quote or a stray separator. In /convert this finding blocks the export, and the converter does not convert such a row.

## ROW-NON-NUMERIC — A column that holds numbers has a text cell

Severity: warning · Export policy: accept

**What it checks.** A column that holds numbers has a text cell. The cell cannot be used as a value, and it is not the same as a deliberate empty cell.

**When it fires.** For a cell of a numeric column (a coordinate, a depth, a measurement) that is neither a number nor one of the recognised missing-value marks (empty, NA, N/A, NaN, nd, n.d., -, --, null). One finding per column lists the lines and an example. Thousands separators are not accepted, 1,234.5 is text unless the file uses decimal commas.

**Example.** A depth column holds 10, 20, below detection, 40. The cell below detection on line 3 is reported with that text.

**What you can do.** Replace the text with a number, or empty the cell. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule; the cell is not written as a number.

## ROW-NA-VARIANT — A numeric column marks missing values in an unusual way, such as NANA or N.A

Severity: warning · Export policy: show

**What it checks.** A numeric column marks missing values in an unusual way, such as NANA or N.A. Such a mark is understood as missing, but the column then uses more than one mark.

**When it fires.** For a numeric cell whose letters and digits, without separators, are only the letters NA repeated, and which is not one of the standard marks. One finding per column lists the lines and an example.

**Example.** A salinity column holds 33.1, NANA, 33.4. NANA on line 2 is read as missing and reported.

**What you can do.** Use one consistent mark, or an empty cell. In /convert this finding is only shown, and the cell is treated as missing.

## ROW-STATION-MOVED — One station name appears at positions that differ by a typed digit, swapped axes or a sign

Severity: warning · Export policy: accept

**What it checks.** One station name appears at positions that differ by a typed digit, swapped axes or a sign. A station is one place, so one of the positions is probably wrong.

**When it fires.** For rows of one station name, compared within one cruise or, without a cruise column, within one calendar year: when two positions are at least 100 km apart as written and a typed digit, exchanged latitude and longitude, or a flipped sign brings them within 50 km and at least ten times closer. The finding lists the positions and, where it applies, which sign differs. Placeholder names such as unknown do not count.

**Example.** Station A3 is at 76.9 N 15.5 E on 9 rows and at 76.9 N -15.5 E on 14 rows. The finding lists both positions and says that the longitude differs only by its sign.

**What you can do.** Decide which position is right and correct the other rows. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule, before the export button works.

## ROW-STATION-SPREAD — One station name has positions more than 10 km apart

Severity: info · Export policy: show

**What it checks.** One station name has positions more than 10 km apart. A station is usually one place, but a name that stands for an area, a transect or a cruise can legitimately span more.

**When it fires.** When the largest distance between the positions of one station name, within one cruise or one calendar year, is above 10 km and not above 1000 km. The finding gives the distance rounded to km and the positions. It is an information note.

**Example.** Station T1 has positions 38 km apart, because the name was used for every point of a transect. The note gives 38 km.

**What you can do.** If the name means one place, correct the position. If it names a transect or an area, ignore the note. In /convert this finding is only shown.

## ROW-STATION-SPREAD-FAR — One station name has positions more than 1000 km apart

Severity: warning · Export policy: accept

**What it checks.** One station name has positions more than 1000 km apart. A station is one place, so this is almost certainly a wrong position, not an area.

**When it fires.** When the largest distance between the positions of one station name, within one cruise or one calendar year, is above 1000 km (a limit chosen by this tool, not a published threshold). It is a warning.

**Example.** Station K7 is at 54.5 N 18.6 E on 12 rows and at 54.5 N 118.6 E on one row. The distance is about 4000 km, and both positions are listed.

**What you can do.** Find which position is wrong, a sign, a digit or swapped axes, and correct it. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.

## ROW-DATE-UNPARSEABLE — A date cell cannot be read as a date

Severity: warning · Export policy: block

**What it checks.** A date cell cannot be read as a date. Without a date the event cannot be placed in time, so it is lost from the output.

**When it fires.** For a cell of the date column that is none of the accepted forms: ISO 8601, YYYY/MM/DD, DD.MM.YYYY, an unambiguous DD/MM/YYYY, YY-MM-DD, a four-digit year, YYYYMMDD in a column that is the date, or an Excel serial number. One finding per sheet lists the lines and an example.

**Example.** A date column holds 2021-06-14, summer 2021 and 14 Jun 2021. The text summer 2021 on line 3 is reported.

**What you can do.** Write the date in ISO form, YYYY-MM-DD. In /convert this finding blocks the export, except for the cells you have declared by the date order question, which it removes.

**Citations.**

- [W3C Note, Date and Time Formats (profile of ISO 8601)](https://www.w3.org/TR/NOTE-datetime), Formats: complete date YYYY-MM-DD
- [DataCite Metadata Schema 4.6, property Date](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/date/), section 8 Date, allowed formats

## ROW-TIME-OTHER-DAY — The time column holds a full date and time of another day than the date column

Severity: warning · Export policy: block

**What it checks.** The time column holds a full date and time of another day than the date column. The time of day cannot be trusted, so it is not used.

**When it fires.** When a time cell is a full datetime without a zone on a day other than the date column, or with a zone more than one day from the date. A datetime with a zone within one day of the date is read as an instant instead and does not raise this.

**Example.** The date column reads 2020-08-15 and the time column reads 2020-08-16 09:30. The time of day 09:30 is not taken, and line 4 is reported.

**What you can do.** Make the date and the time columns agree, or keep only the time of day in the time column. In /convert this finding blocks the export until they agree.

## ROW-DATE-MISSING — Some rows have a date and others have an empty date cell

Severity: info · Export policy: show

**What it checks.** Some rows have a date and others have an empty date cell. The rows without a date cannot be placed in time.

**When it fires.** When a sheet has at least one row with a date and at least one with a blank date cell; the finding gives the count and the percentage. An unreadable date is ROW-DATE-UNPARSEABLE, and a sheet with no dates at all is META-NO-DATES. In /convert it is left out when the events are already named by CONV-EVENT-DATE-MISSING.

**Example.** Of 120 rows, 100 have a date and 20 have an empty date cell. The finding gives 20 rows, about 17 percent.

**What you can do.** Fill the dates, or confirm that the rows are undated on purpose. In /convert this finding is only shown.

## ROW-YEAR-OUTLIER — The dates include a year that the dataset itself does not claim

Severity: warning · Export policy: show

**What it checks.** The dates include a year that the dataset itself does not claim. The label, the file name, the title or the temporal extent name other years, so either the claim or the row is wrong.

**When it fires.** For rows whose year is not among the years found in the label, the file name, the record title or the temporal extent. A range such as 1994-2019 names every year in it; a number followed by a unit such as m is not read as a year. Only years between 1900 and 2100 count. It does nothing when the dataset names no year.

**Example.** The title says Winter cruise 2018. Two rows are dated 2081-02-11, a swapped digit pair. The two lines are reported.

**What you can do.** Correct the date, or correct the title or the temporal extent if the data really span other years. In /convert this finding is only shown.

## ROW-JOIN-AMBIGUOUS — The key that joins a sheet to another sheet of positions or dates matches several rows there, and those rows differ in position or date

Severity: warning · Export policy: show

**What it checks.** The key that joins a sheet to another sheet of positions or dates matches several rows there, and those rows differ in position or date. The tool cannot know which one is meant.

**When it fires.** For every row whose join key matches two or more rows of the other sheet that differ in position or date. The row gets no position and no date from that sheet. The first matching row is never taken as a guess.

**Example.** A measurement sheet joins on Station S5. The station sheet has S5 twice, at 54.2 N and at 54.9 N. Every measurement of S5 is left without a position.

**What you can do.** Make the key unique, for example by adding the cruise or the date to it. In /convert this finding is only shown.

## ROW-LONG-VALUE-SKIPPED — In a long sheet (one row per parameter) the same key and parameter hold different values, and no column could tell the rows apart

Severity: warning · Export policy: accept

**What it checks.** In a long sheet (one row per parameter) the same key and parameter hold different values, and no column could tell the rows apart. Only one value can be kept.

**When it fires.** When rows with the same key and parameter have different values and no column could safely be added to the key. The first value is read, or the first one after a blank or missing value. Nothing is averaged. Equal values are not counted.

**Example.** Station S2, parameter nitrate, appears with 4.1 and 4.6 and nothing else differs. 4.1 is read and 4.6 is skipped, and the finding names both.

**What you can do.** Add a column that tells the rows apart, such as a replicate or a time, or remove the duplicate. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.

## ROW-LONG-NO-PARAMETER — A row of a long sheet has a value but no parameter name

Severity: warning · Export policy: block

**What it checks.** A row of a long sheet has a value but no parameter name. Without it the value cannot be assigned to any variable.

**When it fires.** For a row with a value and a blank parameter cell when no merged cell above gives a parameter. The row is not read. A row whose value is also blank is not counted.

**Example.** Line 17 has the value 12.4 and an empty Parameter cell, with nothing merged above. Line 17 is not read and is reported.

**What you can do.** Fill the parameter name. In /check this finding blocks; in /convert the same rows block the export as CONV-LONG-NO-PARAMETER.

## ROW-LONG-PARAMETER-MERGED — In a long sheet a parameter cell is merged over several rows

Severity: info · Export policy: accept

**What it checks.** In a long sheet a parameter cell is merged over several rows. The tool takes the name of the top cell for the rows below it, and tells you that it did.

**When it fires.** For rows below the top cell of a merge that the workbook declares and which have a value. Only rows with a value are filled. It is an information note.

**Example.** The cell Parameter says nitrate and is merged over lines 5 to 9. Lines 6 to 9 are read as nitrate, and the note lists them.

**What you can do.** Check that the merge means the same parameter for all rows, or unmerge it and repeat the name. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.

## ROW-LONG-KEY-EXTENDED — In a long sheet the tool added columns to the row key, because rows with the same key and parameter held different values there

Severity: info · Export policy: accept

**What it checks.** In a long sheet the tool added columns to the row key, because rows with the same key and parameter held different values there. It is not proof that the rows are replicates.

**When it fires.** When rows with the same key and parameter differ and one or more other columns can tell them apart; the finding names the columns used. It is an information note.

**Example.** Station S3 has two nitrate rows, 4.1 and 4.6, and a Depth column of 5 and 20. Depth is added to the key, and the note says so.

**What you can do.** Check that the added columns really separate different samples and not replicates. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.

## ROW-KEY-IGNORED — Columns you set to ignore differ between rows that are equal in every column that identifies them

Severity: info · Export policy: show

**What it checks.** Columns you set to ignore differ between rows that are equal in every column that identifies them. Ignoring them may merge rows that are really different.

**When it fires.** When rows equal in every written identifying column differ in an ignored column. Nothing is removed. A column that is ignored by default is still written.

**Example.** Two rows have the same station, date and depth but different values in a Replicate column that is set to ignore. The rows are reported.

**What you can do.** Stop ignoring the column if it separates real samples. In /convert this finding is only shown.

## ROW-JOIN-KEY-BLANK — A part of the join key is empty on rows that have no position of their own

Severity: warning · Export policy: show

**What it checks.** A part of the join key is empty on rows that have no position of their own. Such rows cannot be matched to the sheet that holds positions.

**When it fires.** For rows without a position of their own whose join key has a blank part, for example an empty station cell. The finding lists the lines.

**Example.** Measurements are joined by cruise and station, and line 22 has an empty station. It cannot be matched and has no position.

**What you can do.** Fill the missing part of the key. In /convert this finding is only shown.

## ROW-DATE-YYMMDD — A date written with two-digit parts, NN-NN-NN, was read with the century inferred

Severity: info · Export policy: accept

**What it checks.** A date written with two-digit parts, NN-NN-NN, was read with the century inferred. The century is a guess and can be wrong for old data.

**When it fires.** Once per column, when the cells fit one reading only. The century rule: a two-digit year up to the current year plus one is 20xx, any other is 19xx. The finding gives the interpreted date and the order read (ymd, dmy or mdy). One acceptance of the rule covers the century in every column it names.

**Example.** The column holds 18-07-25. It is read as year-month-day, 2018-07-25. If the cruise was in 1918 the century is wrong.

**What you can do.** Write four-digit years, or check that the century is right. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.

## ROW-DATE-YY-AMBIGUOUS — A date column with two-digit parts, NN-NN-NN, can be read in more than one order and the readings give different dates

Severity: warning · Export policy: block

**What it checks.** A date column with two-digit parts, NN-NN-NN, can be read in more than one order and the readings give different dates. It is a guess which is right.

**When it fires.** Once per column, when two or more of year-month-day, day-month-year and month-day-year fit every cell, no cell rules a reading out (a part above 31, or above 12 in a month place, rules it out), and the dates differ. The tool reads year-month-day when that fits. Slash dates such as 03/04/2021 follow a different answer, the day-month order.

**Example.** The column holds 05-06-07 and 08-09-10. They can be 2005-06-07 or 7 June 2005 or 6 May 2007. The column is reported once.

**What you can do.** Write the dates in ISO form. In /convert this finding blocks the export until you declare the order of the two-digit year dates; that answer is separate from the day-month order of slash dates.

## ROW-TZ-UNKNOWN — A date and time has no time zone, neither a UTC mark nor an offset

Severity: info · Export policy: show

**What it checks.** A date and time has no time zone, neither a UTC mark nor an offset. The instant is therefore unknown by up to a day.

**When it fires.** Once per column, when a date-time at minute or second precision has neither a UTC marker nor an offset. It is not raised when the column is declared to be UTC.

**Example.** The column holds 2021-06-14 09:30. Without Z or +02:00 it is not known whether this is local time or UTC.

**What you can do.** Add the zone, for example 2021-06-14T09:30Z, or declare that the column is UTC. In /convert this finding is only shown.

## ROW-UNIT-MISSING — A measured variable has no unit in its header or in the metadata

Severity: warning · Export policy: show

**What it checks.** A measured variable has no unit in its header or in the metadata. A number without a unit cannot be compared or reused.

**When it fires.** For each variable column with no unit in the header or the metadata, up to 10 are listed. A unit only inferred from a P01 code counts as missing. Salinity, pH, their spread columns and an OPeNDAP text column are exempt.

**Example.** The headers are Temp, Nitrate and Chl. None has a unit, so the three are listed. Writing Temp (degC) removes it from the list.

**What you can do.** Add the unit to each header, in parentheses or in the metadata. In /convert this finding is only shown.

## ROW-HEADER-CODE-SHAPE — A header names a vocabulary code that does not have the shape of its collection

Severity: warning · Export policy: show

**What it checks.** A header names a vocabulary code that does not have the shape of its collection. Such a code cannot exist, so the header is mistyped.

**When it fires.** For a code after an explicit SDN:P01:: or SDN:P06:: prefix that is not 8 uppercase letters and digits for P01, or 4 for P06. A bare word is never read as a code.

**Example.** A header reads SDN:P01::TEMPPR01. That is 8 characters and fine. SDN:P01::TEMP is only 4, so it is reported.

**What you can do.** Correct the code from the vocabulary server, or remove the prefix. In /convert this finding is only shown.

**Citations.**

- [NERC Vocabulary Server (NVS), collections P01 (BODC Parameter Usage Vocabulary) and P06 (BODC data storage units); read 2026-10-29](https://vocab.nerc.ac.uk/collection/P06/current/), Every concept of P06 has a four-character code (411 of 411 codes read, e.g. UPAA) and every concept of P01 an eight-character one (50 613 of 50 613 codes read, e.g. TEMPPR01; 66 begin with a digit); a code of another length has no concept page: https://vocab.nerc.ac.uk/collection/P01/current/D13CMOP11/ answers 404, https://vocab.nerc.ac.uk/collection/P01/current/D13CMOP1/ is a concept.

## ROW-DEPTH-SIGN — The direction of the depth, positive down or positive up, is not stated by the header or by your declaration

Severity: info · Export policy: accept

**What it checks.** The direction of the depth, positive down or positive up, is not stated by the header or by your declaration. The same number can then mean opposite things.

**When it fires.** When the depth column is known but its direction is unknown after the header and the declaration are read. It is not raised for a sheet already reported by ROW-DEPTH-MIXED-SIGN.

**Example.** A column called Depth holds 5, 20 and 50 with no unit or sign note. It is not known whether 50 is 50 m below or above the surface.

**What you can do.** State the direction in the header, for example Depth (m, positive down), or declare it. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.

## ROW-DEPTH-MIXED-SIGN — One sheet holds both negative and positive depths

Severity: warning · Export policy: accept

**What it checks.** One sheet holds both negative and positive depths. Some rows probably use the opposite direction, and no direction can be chosen safely.

**When it fires.** Per sheet, when non-zero depths of both signs exist. The values 0, -99, -999 and -9999 are not counted, except in /convert, where such codes count as values. No direction is chosen, not even the majority. ROW-DEPTH-RANGE then judges the size of the depth, and nothing is changed.

**Example.** A depth column holds 5, 10, -20 and -30. Both signs are present, so the sheet is reported.

**What you can do.** Make all depths use one direction. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.

## ROW-MISSING-CODE — A cell holds -99, -999 or -9999, which are common codes for missing values

Severity: warning · Export policy: block

**What it checks.** A cell holds -99, -999 or -9999, which are common codes for missing values. As numbers they would be false depths or measurements.

**When it fires.** Once per sheet and column, for a cell exactly equal to one of the three numbers, in the depth column (or the two Darwin Core depth bounds) and in every variable. The cell is kept as written and is left out of the depth direction, ROW-DEPTH-RANGE and CHEM-RANGE.

**Example.** A salinity column holds 33.1, -999 and 33.4. The -999 on line 2 is kept as written, left out of the range checks, and reported.

**What you can do.** Empty such cells in the source if they mean missing. In /convert this finding blocks the export until you answer, per column, whether the code is missing or a real value; on missing the cells are left empty and listed.

## ROW-DM-COORDS — A coordinate was written in degrees and minutes, or degrees, minutes and seconds, as text

Severity: info · Export policy: show

**What it checks.** A coordinate was written in degrees and minutes, or degrees, minutes and seconds, as text. The tool converted it to decimal degrees.

**When it fires.** For each coordinate cell of that form; the finding lists the lines and the conversion. It is a note that a conversion took place.

**Example.** The cell 54 30.5 N becomes 54.508333. The note shows both.

**What you can do.** Check the converted value, and write decimal degrees in your own copy. In /convert this finding is only shown.

## ROW-HEMISPHERE-CONFLICT — A coordinate and its hemisphere letter disagree, for example a positive latitude with S

Severity: warning · Export policy: accept

**What it checks.** A coordinate and its hemisphere letter disagree, for example a positive latitude with S. One of the two is wrong.

**When it fires.** When the value has the sign opposite to the letter N, S, E or W. The value is kept as written and is not negated again.

**Example.** The latitude is 54.3 and the hemisphere column says S. The line is reported and the latitude stays 54.3.

**What you can do.** Correct the value or the letter. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.

## ROW-HEMISPHERE-UNPAIRED — A hemisphere column does not match the coordinate it was mapped to

Severity: warning · Export policy: accept

**What it checks.** A hemisphere column does not match the coordinate it was mapped to. Its start or end word points to the other axis.

**When it fires.** Once per column, when the words in the header disagree with the mapping, for example a column named Lon_EW mapped to latitude. The hemisphere is not applied.

**Example.** The column EW is mapped to the latitude. It is not applied, and the finding names the column.

**What you can do.** Map the hemisphere column to its own axis. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.

## ROW-HEMISPHERE-MISSING — A hemisphere column has an empty cell or a letter that is not N, S, E or W

Severity: warning · Export policy: accept

**What it checks.** A hemisphere column has an empty cell or a letter that is not N, S, E or W. The sign of the coordinate is therefore unconfirmed.

**When it fires.** For each row whose hemisphere cell is empty or not one of the four letters. The value is kept as written.

**Example.** The column holds N, N and a blank. The blank line is reported and its latitude is used as written.

**What you can do.** Fill the letter. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.

## ROW-ZERO-COORD — A position is exactly latitude 0 and longitude 0, a point in the Gulf of Guinea

Severity: error · Export policy: block

**What it checks.** A position is exactly latitude 0 and longitude 0, a point in the Gulf of Guinea. It is the usual result of an empty cell turned into zero.

**When it fires.** For a row with latitude 0 and longitude 0. It replaces ROW-LAT-EQ-LON for the same row. OBIS drops such records.

**Example.** Line 6 reads 0, 0 for a sample taken in the Baltic. Line 6 is reported.

**What you can do.** Enter the real position or leave the cells empty. In /convert this finding blocks the export until the position is corrected.

**Citations.**

- [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: "if record.get_interpreted("decimalLongitude") == 0 and record.get_interpreted("decimalLatitude") == 0: record.set_flag(Flag.ZERO_COORD); record.dropped = True"
- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Integrity checks: "decimalLatitude and decimalLongitude are both 0" ... "It is theoretically possible that a sampling event happens at 0-0 coordinates, however it is very common to inadvertedly add 0-0 when the actual coordinates are missing. Therefore, 0-0 coordinates should always be double checked."

## ROW-NO-COORD — A row has no latitude or no longitude although other rows of the sheet have a position

Severity: warning · Export policy: block

**What it checks.** A row has no latitude or no longitude although other rows of the sheet have a position. It cannot be placed on a map.

**When it fires.** For a row with a blank latitude or longitude on a sheet where other rows have a position. Not counted: blank trailing rows, summary rows, rows that inherit a position from a parent event, and continuation rows of a station block. A row with both blank is exempt when its station, date or cruise has a position elsewhere; a row with one blank coordinate is always reported. A sheet with no position at all says nothing. In /convert it is raised only for an event with no positioned parent.

**Example.** Line 12 has a longitude of 18.6 and an empty latitude. Line 12 is reported.

**What you can do.** Fill the position. In /convert this finding blocks the export until it is filled.

**Citations.**

- [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: "if record.get_interpreted("decimalLongitude") is None or record.get_interpreted("decimalLatitude") is None: record.set_flag(Flag.NO_COORD); record.dropped = True"

## ROW-DEPTH-MIN-MAX — The minimum depth is larger than the maximum depth in the same row

Severity: error · Export policy: block

**What it checks.** The minimum depth is larger than the maximum depth in the same row. One of the two is wrong.

**When it fires.** For a row where minimumDepthInMeters is greater than maximumDepthInMeters, only when both Darwin Core depth columns exist. OBIS rejects such records.

**Example.** Line 4 has a minimum depth of 50 and a maximum of 10. Line 4 is reported.

**What you can do.** Swap or correct the two values. In /convert this finding blocks the export until they are corrected.

**Citations.**

- [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: "if record.get_interpreted("minimumDepthInMeters") \> record.get_interpreted("maximumDepthInMeters"): record.set_flag(Flag.MIN_DEPTH_EXCEEDS_MAX)"
- [OBIS obistools (R), R/check_depth.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_depth.R), check_depth, details: "minimum depth greater than maximum depth" (error); code: minGTmax \<- !is.na(maxd) & !is.na(mind) & mind \> maxd

## ROW-DEPTH-RANGE — A depth lies outside what is possible on Earth

Severity: warning · Export policy: accept

**What it checks.** A depth lies outside what is possible on Earth. The deepest known point is about 10,935 m.

**When it fires.** For a depth below -100000 m or above 11000 m, positive down, the OBIS limits. A missing-value code is skipped unless it counts as a value (in /convert). An upward convention is judged after the sign is turned. A column in another unit, such as ft or cm, is not judged. With mixed signs the size of the depth is judged.

**Example.** A depth column holds 25, 40 and 4500000, a value in millimetres. The last is reported.

**What you can do.** Check the unit and the value. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.

**Thresholds.**

- depth.min = -100000 m. Source: [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: misc.check_float(record.get("minimumDepthInMeters"), \[-100000, 11000\]) (the same call for maximumDepthInMeters; in_range = valid_range\[0\] \<= value \<= valid_range\[1\], out of range sets Flag.DEPTH_OUT_OF_RANGE)
- depth.max = 11000 m. Source: [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: misc.check_float(record.get("minimumDepthInMeters"), \[-100000, 11000\]) (the same call for maximumDepthInMeters; in_range = valid_range\[0\] \<= value \<= valid_range\[1\], out of range sets Flag.DEPTH_OUT_OF_RANGE)

**Citations.**

- [NOAA National Ocean Service, "How deep is the ocean?" (last updated 2026-09-23)](https://oceanservice.noaa.gov/facts/oceandepth.html), "Challenger Deep is approximately 10,935 meters (35,876 feet) deep." (the deepest part of the ocean)

## ROW-DATE-FUTURE — A date, or the end of an interval, is later than today

Severity: warning · Export policy: accept

**What it checks.** A date, or the end of an interval, is later than today. A sample cannot have been taken in the future.

**When it fires.** When the date is later than today in UTC and can have begun nowhere yet; UTC+14 is allowed, so one day ahead is not reported and two are. A year or a month counts by its first day. A two-digit-year date with an ambiguity flag is left to ROW-DATE-YYMMDD and ROW-DATE-YY-AMBIGUOUS. OBIS rejects such records.

**Example.** A table dated in 2026 holds 2062-03-04, a century guessed wrong. The line is reported.

**What you can do.** Correct the year or the century. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.

**Citations.**

- [OBIS obis-qc (Python), obisqc/time.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/time.py), check_record: "if ms_end \> date_to_millis(datetime.date.today()): # date in the future record.set_flag(Flag.DATE_IN_FUTURE)"

## ROW-INVISIBLE-CHAR — A value contains an invisible character inside it, such as a no-break space

Severity: warning · Export policy: accept

**What it checks.** A value contains an invisible character inside it, such as a no-break space. Two values that look equal then differ, and joins and matches fail.

**When it fires.** For a character inside a value in the station, cruise or sample identifier columns, and in the name, identifier and vocabulary columns of Darwin Core input. OBIS trims only the ends of a value.

**Example.** The station name St 5 contains U+00A0 instead of a space, so it does not match St 5 elsewhere. The finding names the line and the character.

**What you can do.** Retype or replace the character in the source. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.

**Citations.**

- [OBIS Manual, "Common data quality issues" (iobis/manual common_qc.md; manual.obis.org)](https://manual.obis.org/common_qc.html), "Hidden characters and non-breaking spaces": "a value like Abra alba containing a non-breaking space will not match the same name typed with a normal space"; "OBIS removes leading and trailing whitespace from values during processing, but does not change spaces inside a value"; "Other invisible characters, such as tabs, line breaks within a cell, and zero-width spaces (U+200B), can cause similar problems"

## ROW-YEAR-DATE-MISMATCH — A Year column and the date column of the same row disagree about the year

Severity: warning · Export policy: show

**What it checks.** A Year column and the date column of the same row disagree about the year. One of them is wrong.

**When it fires.** When a sheet has a Year column next to a date column and a row has a four-digit year from 1700 to next year that differs from the year of the date; a date range counts every year it covers. Not compared: a year-only date, a date built from the Year column, a date with an ambiguity flag, a blank or non-numeric year.

**Example.** Line 9 has Year 2019 and the date 2020-03-05. The line is reported with both years.

**What you can do.** Decide which of the two is right and correct the other. In /convert this finding is only shown.

## ROW-TEXT-MOJIBAKE — Text shows the damage of a double encoding: letters such as accented names appear as two odd characters

Severity: warning · Export policy: show

**What it checks.** Text shows the damage of a double encoding: letters such as accented names appear as two odd characters. The file was decoded with the wrong encoding at some stage.

**When it fires.** When a cell contains the pair U+00C3 or U+00C2 followed by a character from U+0080 to U+00BF, as in the damaged form of an accented letter. A lone U+00C3 or U+00C2 is not matched, nor are other double-encoded forms. The finding gives the count of the pairs.

**Example.** A station called Sao Joao appears as the damaged form of Sao Joao with accents, two odd characters in place of each accented letter. The cell is reported.

**What you can do.** Save the source again as UTF-8 and correct the damaged text. In /convert this finding is only shown.

## DWC-TERM-MISSING — A Darwin Core table has no column for a term that OBIS requires

Severity: error · Export policy: block

**What it checks.** A Darwin Core table has no column for a term that OBIS requires. Without the required terms the records cannot be published in OBIS, so the file is not ready however good its other columns are.

**When it fires.** Only on Darwin Core input: an Archive, or a table with at least three distinct Darwin Core terms in its header (spelled exactly, capitals count) plus one of occurrenceID, eventID, parentEventID, scientificName, scientificNameID, taxonID, basisOfRecord or occurrenceStatus. With eventID or parentEventID and no occurrence term it is an Event core, otherwise an Occurrence core. Always required: eventDate, decimalLatitude, decimalLongitude and an identifier (eventID for Event; occurrenceID or eventID for Occurrence; an Archive core id may stand for it). Occurrence also needs scientificName, occurrenceStatus and basisOfRecord. An occurrence table with an eventID column not blank in every row is the occurrence side of an event and occurrence pair, and then the date and coordinates are not required of it. Sources: obistools check_fields, OBIS Manual.

**Example.** A table with the columns occurrenceID, scientificName, eventDate, decimalLatitude and decimalLongitude but no occurrenceStatus and no basisOfRecord column is reported as missing occurrenceStatus and basisOfRecord.

**What you can do.** Add a column for each listed term and fill it. In /convert this rule is applied to the Event and Occurrence tables the converter writes, so the remedy is in the declarations that feed those tables, not in a column you add by hand. In /convert this finding blocks the export.

**Citations.**

- [OBIS obistools (R), R/check_fields.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_fields.R), check_fields: required \<- c("eventDate", "decimalLongitude", "decimalLatitude", "scientificName", "scientificNameID", "occurrenceStatus", "basisOfRecord"); "Missing or empty required fields are reported as errors"
- [OBIS Manual, "Common format issues" (iobis/manual common_formatissues.md; manual.obis.org)](https://manual.obis.org/common_formatissues.html), "Missing required fields": "one (or more) of the eight required terms for OBIS"; "occurrenceID or eventID"; "scientificNameID (strongly recommended)"

## DWC-TERM-EMPTY — A column that OBIS requires exists but has empty cells

Severity: error · Export policy: block

**What it checks.** A column that OBIS requires exists but has empty cells. A record without a required value cannot be published, so the empty rows must be filled or dealt with before submission.

**When it fires.** Only on Darwin Core input, one finding per column. The identifier column (occurrenceID or eventID, or the archive id) and, for an Occurrence core, scientificName, occurrenceStatus and basisOfRecord fire when any cell is blank after trimming. eventDate, decimalLatitude and decimalLongitude fire only when the column is blank in every row: a few missing positions are ROW-NO-COORD, a few missing dates are ROW-DATE-MISSING, and a date missing everywhere in the data and the metadata is reported by META-NO-DATES alone. Those three are not checked on the occurrence side of an event and occurrence pair. Sources: obistools check_fields and the OBIS Manual.

**Example.** A table of 40 rows whose scientificName column is blank on lines 7, 8, 19 and 33 gets one finding naming those four lines.

**What you can do.** Fill the cells, or remove the rows that cannot be filled. In /convert the rule is applied to the tables the converter writes; for a missing position or date the converter says it first in the terms of the source sheet (CONV-POSITION-NONE, CONV-EVENT-DATE-MISSING) and this finding is then not repeated. In /convert this finding blocks the export.

**Citations.**

- [OBIS obistools (R), R/check_fields.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_fields.R), check_fields: required \<- c("eventDate", "decimalLongitude", "decimalLatitude", "scientificName", "scientificNameID", "occurrenceStatus", "basisOfRecord"); "Missing or empty required fields are reported as errors"
- [OBIS Manual, "Common format issues" (iobis/manual common_formatissues.md; manual.obis.org)](https://manual.obis.org/common_formatissues.html), "Missing required fields": "one (or more) of the eight required terms for OBIS"; "occurrenceID or eventID"; "scientificNameID (strongly recommended)"

## DWC-RECOMMENDED — A Darwin Core table lacks a column that OBIS recommends, or leaves it empty in every row

Severity: warning · Export policy: accept

**What it checks.** A Darwin Core table lacks a column that OBIS recommends, or leaves it empty in every row. The data are still publishable, but depth and a persistent taxon identifier make the data easier to check and the names easier to match.

**When it fires.** Only on Darwin Core input, once per table, listing every recommended term that is absent or blank in every row. The terms are minimumDepthInMeters and maximumDepthInMeters (not asked of the occurrence side of an event and occurrence pair) and, for an Occurrence core, scientificNameID. The OBIS Manual calls scientificNameID strongly recommended; obistools lists it as required, and this tool follows the manual. Sources: obistools check_fields and the OBIS Manual.

**Example.** An occurrence table with all required columns but no scientificNameID column and no depth columns is told that scientificNameID, minimumDepthInMeters and maximumDepthInMeters are recommended.

**What you can do.** Add the columns, for example the persistent identifier of each name from a taxon register, and the depth range of the sample. In /convert a lacking scientificNameID on the Occurrence table is not raised by this rule but by CONV-NAMEID-MISSING; the depth terms are still judged. In /convert this finding does not block the export, but it needs your acceptance (one tick for the rule) before the export works.

**Citations.**

- [OBIS obistools (R), R/check_fields.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_fields.R), check_fields: recommended \<- c("minimumDepthInMeters", "maximumDepthInMeters"); "missing or empty recommended fields are reported as warnings"
- [OBIS Manual, "Common format issues" (iobis/manual common_formatissues.md; manual.obis.org)](https://manual.obis.org/common_formatissues.html), "Missing required fields": "one (or more) of the eight required terms for OBIS"; "occurrenceID or eventID"; "scientificNameID (strongly recommended)"

## DWC-VOCAB-VALUE — A basisOfRecord or occurrenceStatus value is not on the list OBIS accepts

Severity: warning · Export policy: block

**What it checks.** A basisOfRecord or occurrenceStatus value is not on the list OBIS accepts. OBIS compares these values with a fixed vocabulary, so a misspelt value can make the record fail the quality control of OBIS.

**When it fires.** Only on Darwin Core input, for the columns basisOfRecord and occurrenceStatus. A value is compared in lower case after its ends are trimmed, so capitalisation does not matter but spelling and inner spaces do. basisOfRecord accepts PreservedSpecimen, FossilSpecimen, LivingSpecimen, HumanObservation, MachineObservation, MaterialSample, Occurrence and MaterialCitation (the GBIF vocabulary of 2022-02-02, the file the OBIS quality control reads). occurrenceStatus accepts absent, present, notDetected and detected. In an Occurrence core empty cells are DWC-TERM-EMPTY. One finding per distinct wrong value, with its lines; beyond ten distinct values the rest share one finding. Sources: GBIF vocabulary, OBIS Manual, Biocheck.

**Example.** A basisOfRecord cell that reads Human Observation, with a space, is not on the list; HumanObservation is.

**What you can do.** Correct the value to the spelling of the list. In /convert the rule is applied to the tables the converter writes. In /convert this finding blocks the export.

**Citations.**

- [OBIS obis-qc (Python), obisqc/fields.py and obisqc/util/vocabularies.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/fields.py), fields.py check_record: "if not record.get("basisOfRecord").lower() in \[value.lower() for value in vocabs\["dwc:basisOfRecord"\]\]: record.set_invalid("basisOfRecord")"; util/vocabularies.py reads the identifiers of rs.gbif.org/vocabulary/dwc/basis_of_record_2022-02-02.xml
- [GBIF Darwin Core Basis of Record Vocabulary, issued 2022-02-02 (the list obis-qc reads at run time)](https://rs.gbif.org/vocabulary/dwc/basis_of_record_2022-02-02.xml), the eight concept identifiers: PreservedSpecimen, FossilSpecimen, LivingSpecimen, HumanObservation, MachineObservation, MaterialSample, Occurrence, MaterialCitation
- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Format checks: "basisOfRecord does not seem to contain a valid term such as: "PreservedSpecimen", "FossilSpecimen", "LivingSpecimen", "HumanObservation", "MachineObservation", "MaterialSample", "Occurrence""
- [OBIS obis-qc (Python), obisqc/absence.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/absence.py), absence.py: ABSENT_VALUES = {"absent", "notDetected"}, PRESENT_VALUES = {"present", "detected"}; the status is compared in lower case; any other value: record.set_invalid("occurrenceStatus")

## DWC-EVENTID-DUPLICATE — In an Event core the same eventID names more than one event

Severity: error · Export policy: block

**What it checks.** In an Event core the same eventID names more than one event. The eventID is the key of an event, and records that point at it cannot say which event they belong to when it repeats.

**When it fires.** Only on Darwin Core input read as an Event core; outside an archive only when the table has at least one of the columns eventDate, decimalLatitude and decimalLongitude. In a Darwin Core Archive every repeated eventID fires, since the archive has one row per event. In any other table (a flattened sheet repeats the eventID on every depth level) an eventID fires only when its rows disagree on the date or on a coordinate; dates are compared by their parsed value and coordinates as numbers, so 60.5 and 60.50 agree. A repeated eventID whose rows agree is not reported. The finding lists every row of every repeated eventID and counts the ids. It does not run on an Occurrence core, where one eventID may repeat. Source: obistools check_eventids.

**Example.** An event table in which eventID S-12 appears on two lines with two different dates is reported, with both lines.

**What you can do.** Give each event its own eventID, or merge rows that describe the same event. In /convert this finding blocks the export.

**Citations.**

- [OBIS obistools (R), R/check_eventids.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_eventids.R), check_eventids: "check duplicate eventIDs" (error: "eventID ... is duplicated"); "check if all parentEventIDs have corresponding eventID" (error: "parentEventID ... has no corresponding eventID")

## DWC-PARENT-DANGLING — A parentEventID points at an event that is not in the eventID column of the same table

Severity: error · Export policy: block

**What it checks.** A parentEventID points at an event that is not in the eventID column of the same table. The hierarchy of events then has a broken link, and a reader cannot rebuild the cruise, station and sample structure.

**When it fires.** Only on Darwin Core input read as an Event core that has a parentEventID column. Every non-blank parentEventID that matches no eventID of the table is listed with its lines, and the finding counts the different missing parents. It does not run when the archive was read only in part (the first 200000 rows, see IN-DWCA-PARTIAL), because the parent may be in a row that was not read. Sources: obistools check_eventids and Biocheck.

**Example.** An event table whose parentEventID cells name CRUISE-A on three lines, while no eventID is CRUISE-A, is reported.

**What you can do.** Correct the identifier, or add the missing parent event as a row. In /convert this finding blocks the export.

**Citations.**

- [OBIS obistools (R), R/check_eventids.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_eventids.R), check_eventids: "check duplicate eventIDs" (error: "eventID ... is duplicated"); "check if all parentEventIDs have corresponding eventID" (error: "parentEventID ... has no corresponding eventID")
- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Integrity checks: "if the parentEventID field is populated, it must be populated with an existing eventID from the eventID field. Adding to the parentEventID field something different than an existing eventID is incoherent."

## DWC-PARENT-LOOP — The eventID and parentEventID columns form a circle: an event is its own ancestor

Severity: error · Export policy: block

**What it checks.** The eventID and parentEventID columns form a circle: an event is its own ancestor. A hierarchy that never reaches a top event cannot be read, and GBIF flags it as an infinite lineage.

**When it fires.** Only on Darwin Core input read as an Event core that has a parentEventID column. Each eventID is followed to its parent, then to that parent, and so on; every row on a circle is listed and counted. A row whose parentEventID equals its own eventID is a circle of one. When an eventID repeats, its first non-blank parent is used. The search visits each event once. It does not run when the archive was read only in part (the first 200000 rows, see IN-DWCA-PARTIAL). Source: the GBIF issue PARENT_EVENT_INFINITE_LINEAGE.

**Example.** Event A has parent B, B has parent C and C has parent A: all three rows are reported.

**What you can do.** Correct the parentEventID of one event on the circle so that the chain ends in an event without a parent. In /convert this finding blocks the export.

**Citations.**

- [GBIF API, enumeration of OccurrenceIssue (read 2026-10-24)](https://api.gbif.org/v1/enumeration/basic/OccurrenceIssue), OccurrenceIssue value PARENT_EVENT_INFINITE_LINEAGE (a loop in the eventID / parentEventID hierarchy)

## DWC-OCCURRENCEID-DUPLICATE — The same occurrenceID is used for more than one record of an Occurrence core

Severity: error · Export policy: block

**What it checks.** The same occurrenceID is used for more than one record of an Occurrence core. The occurrenceID is the key of a record, and a repeated key makes later updates and links ambiguous.

**When it fires.** Only on Darwin Core input read as an Occurrence core with an occurrenceID column (in an archive without that column, the core id column is used, but not when the table has an eventID column). Every non-blank occurrenceID that appears in more than one row fires; the finding lists every row of every repeated id, counts the ids and shows one example. Source: Biocheck, the occurrenceID is unique in the occurrence table.

**Example.** A table in which occurrenceID occ-0015 appears on lines 16 and 41 is reported with both lines.

**What you can do.** Give each record its own identifier. In /convert a repeat that the conversion already named in the terms of the source sheet (CONV-ID-DUPLICATE for occurrences) is not said a second time by this rule. In /convert this finding blocks the export.

**Citations.**

- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Integrity checks: "Checks that occurrenceID is unique in the occurrence table" ... "The occurrenceID acts as the Primary Key for the occurrence table, therefore two records with the same occurrenceID cannot exist in the occurrence table."

## DWC-EVENTDATE-NOT-ISO — Dates in a column headed eventDate are not written in ISO 8601

Severity: warning · Export policy: show

**What it checks.** Dates in a column headed eventDate are not written in ISO 8601. Darwin Core and OBIS read eventDate as text in that form, so a date such as 14/06/2011 is not understood, or is read in the wrong order.

**When it fires.** On any table with a column headed exactly eventDate (with or without the dwc: prefix), Darwin Core input or not. A cell fires unless it is blank, a missing-value token (NA, N/A, a dash, null, nd) or a valid ISO 8601 value: a year, a year and month, a date, an ordinal or week date, a date with a time and an optional zone (hour 24 is not accepted), a basic form such as 20110614 (only from the year 1700), or an interval of two such values joined by one slash, whose end may be shortened (2011-06-14/20), or an interval with a duration. A spreadsheet cell formatted as a date is not judged. Nothing is changed. The finding lists the lines and one example.

**Example.** The cell 14/06/2011 in an eventDate column is reported; 2011-06-14 is accepted.

**What you can do.** Write the dates in ISO 8601, for example 2011-06-14 or 2011-06-14/2011-06-20. Nothing is changed in your file. In /convert the rule is applied to the tables the converter writes. In /convert the finding is only shown and never stops the export.

## CHEM-UNIT-PAIR — The same chemical quantity is given twice, once as mass per volume and once as amount per volume, and the two columns do not agree after conversion

Severity: warning · Export policy: show

**What it checks.** The same chemical quantity is given twice, once as mass per volume and once as amount per volume, and the two columns do not agree after conversion. One of the columns, or one of its unit labels, is wrong, and a reader who trusts the wrong one is off by a factor of the molar mass.

**When it fires.** When one table has two columns of the same recognised variable, one with a unit of mass per litre (for example mg/L) and one with a unit of amount per litre (for example µmol/L). The mass column is converted with the molar mass of the element the variable is reported as, and the rule fires when a row differs from the other column by more than the rounding of the two reported values can explain. One finding per pair of columns, listing every disagreeing row. The elements and molar masses are carbon 12.011, nitrogen 14.007, phosphorus 30.974 and silicon 28.085 g/mol (CIAAW atomic weights). Covered: DOC, POC, DIC (carbon); nitrate, nitrite, nitrate+nitrite, ammonium, DIN, DON, PON, TN, TDN (nitrogen); phosphate, DOP, TDP (phosphorus); silicate (silicon). The mass is taken as the element (nitrate as N). Others are not judged; missing values are skipped.

**Example.** A nitrate column in mg/L reads 0.62 and a nitrate column in µmol/L on the same row reads 8.1; 0.62 mg/L of nitrogen is about 44.3 µmol/L, so the row disagrees.

**What you can do.** Decide which column is right, correct the wrong values or the wrong unit label, or delete the duplicate column. Nothing in your file is changed by the tool. In /convert this finding is only shown and never stops the export.

**Thresholds.**

- molarMass.C = 12.011 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "6 C carbon 12.011 ± 0.002"
- molarMass.N = 14.007 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "7 N nitrogen 14.007 ± 0.001"
- molarMass.P = 30.974 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "15 P phosphorus 30.974 ± 0.001"
- molarMass.Si = 28.085 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "14 Si silicon 28.085 ± 0.001"

## CHEM-DIC-GT-TA — Dissolved inorganic carbon is larger than total alkalinity

Severity: warning · Export policy: show

**What it checks.** Dissolved inorganic carbon is larger than total alkalinity. In sea water alkalinity is normally the larger of the two, so a reversed pair usually means swapped columns, a wrong unit on one of them, or a mislabelled variable.

**When it fires.** When one table has a DIC column and a TA column with the same unit, and in at least one row DIC is larger than TA by more than the rounding of the two reported values can explain. Rows are grouped by cruise when the table has a cruise column, otherwise the whole table is one group; there is one finding per DIC and TA column pair and group that has at least one such row. The finding gives how many of the rows with both values are affected and the median of TA minus DIC over the group, rounded to a whole number. Rows with a missing or non-numeric value are skipped. Columns with different units are not compared. Sources: Dickson, Sabine and Christian (2007) guide to best practices for ocean CO2 measurements, and TEOS-10 for the seawater background.

**Example.** A group of 60 rows has DIC 2310 and TA 2285 in µmol/kg on 5 of the rows, and TA above DIC on the other 55; the group is reported with 5 of 60 rows.

**What you can do.** Check that the DIC and TA columns are not swapped, that both carry the same unit, and that the flagged rows are not typing errors. If the sample is not from sea water, the pattern can be genuine; the finding then stays as a note. In /convert this finding is only shown and never stops the export.

**Citations.**

- [TEOS-10 Manual, IOC Manuals and Guides 56](https://www.teos-10.org/pubs/TEOS-10_Manual.pdf), Appendix A.4, printed pp.80-81 (Standard Seawater: TA 2300 and DIC 2080 µmol/kg at SP = 35)
- [Dickson, Sabine & Christian (2007), Guide to Best Practices for Ocean CO2 Measurements, PICES Special Publication 3](https://www.ncei.noaa.gov/access/ocean-carbon-acidification-data-system/oceans/Handbook_2007/Guide_all_in_one.pdf), SOP 2 section 1, PDF p.39 (oceanic DIC 1800–2300 µmol/kg)
- [Dickson, Sabine & Christian (2007), Guide to Best Practices for Ocean CO2 Measurements, PICES Special Publication 3](https://www.ncei.noaa.gov/access/ocean-carbon-acidification-data-system/oceans/Handbook_2007/Guide_all_in_one.pdf), SOP 3a section 1, PDF p.53 (oceanic TA 2000–2500 µmol/kg)

## CHEM-RANGE — Values of temperature, salinity, pressure, oxygen or pH lie outside the range used by the quality control of open-ocean profiling programmes

Severity: warning · Export policy: show

**What it checks.** Values of temperature, salinity, pressure, oxygen or pH lie outside the range used by the quality control of open-ocean profiling programmes. Such values are often unit mistakes, swapped columns or leftover codes, and they would distort any analysis that uses the file.

**When it fires.** When a column that is recognised as one of the five quantities (pressure also by the unit dbar on a column with no named variable), with a unit the range was written for, holds at least one value outside the range. One finding per column, with the count and the first offending value. Ranges: temperature -2.5 to 40 °C and salinity 2 to 41 (Argo CTD range test); pressure of at least -5 dbar, with no upper bound (Argo); oxygen -5 to 600 µmol/kg (Argo dissolved oxygen); pH 6.5 to 9 (GTSPP). The unit must match: temperature in °C, pressure in dbar, oxygen in µmol/kg, salinity in PSU or with no unit, pH in pH units or with no unit. Oxygen per volume (mL/L, mg/L, µmol/L) is not compared (it needs the water density) and the report says so. The values -99, -999 and -9999 are left to ROW-MISSING-CODE, unless the converter has already treated them as values.

**Example.** A salinity column holds 35.1, 34.9 and 350.0; the last value is reported as outside 2 to 41.

**What you can do.** Check the flagged values and the unit of the column; a value that is 10 or 100 times too large is often a decimal slip. If the sample is from fresh or brackish water (salinity) or a closed system, the value can be genuine: keep it and say so in the description of the data. In /convert this finding is only shown and never stops the export.

**Thresholds.**

- temperature.min = -2.5 °C. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 6 "Global range test", p.12
- temperature.max = 40 °C. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 6 "Global range test", p.12
- salinity.min = 2 psu. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 6 "Global range test", p.12
- salinity.max = 41 psu. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 6 "Global range test", p.12
- pressure.min = -5 dbar. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 6 "Global range test", p.12
- oxygen.min = -5 µmol/kg. Source: [Argo Quality Control Manual for Dissolved Oxygen Concentration, v2.2 (15 Oct 2025)](https://archimer.ifremer.fr/doc/00354/46542/123086.pdf), section 2.2.1, Test 6 "Global range test", p.9
- oxygen.max = 600 µmol/kg. Source: [Argo Quality Control Manual for Dissolved Oxygen Concentration, v2.2 (15 Oct 2025)](https://archimer.ifremer.fr/doc/00354/46542/123086.pdf), section 2.2.1, Test 6 "Global range test", p.9
- pH.min = 6.5 pH units. Source: [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Table 2.1 "Global Impossible Parameter Values" (row pH, unit listed as none), PDF p.64
- pH.max = 9 pH units. Source: [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Table 2.1 "Global Impossible Parameter Values" (row pH, unit listed as none), PDF p.64

## CONV-SPLIT-UNDECIDED

Severity: error · Export policy: block

## CONV-QUANTITY-UNDECLARED

Severity: error · Export policy: block

## CONV-COUNT-NOT-INTEGER

Severity: error · Export policy: block

## CONV-NEGATIVE-QUANTITY

Severity: error · Export policy: block

## CONV-COVER-RANGE

Severity: error · Export policy: block

## CONV-CLASS-VALUE

Severity: error · Export policy: block

## CONV-SAMPLE-CODE-MISSING

Severity: error · Export policy: block

## CONV-KEY-PART-BLANK

Severity: warning · Export policy: accept

## CONV-ROLE-UNCONFIRMED

Severity: warning · Export policy: accept

## CONV-KEY-MIXED-NUMBERS

Severity: warning · Export policy: accept

## CONV-KEY-TOO-LONG

Severity: error · Export policy: block

## CONV-KEY-PICKED

Severity: info · Export policy: show

## CONV-JOIN-PROPOSED

Severity: info · Export policy: show

## CONV-JOIN-DESCRIPTION-LONG

Severity: info · Export policy: show

## CONV-JOIN-CONFLICT

Severity: error · Export policy: block

## CONV-JOIN-CONFLICT-CHOSEN

Severity: info · Export policy: show

## CONV-JOIN-UNIT-DIFFERS

Severity: error · Export policy: block

## CONV-JOIN-COLUMNS-DIFFER

Severity: error · Export policy: block

## CONV-JOIN-NO-DESCRIPTION

Severity: error · Export policy: block

## CONV-JOIN-NO-MATCH

Severity: error · Export policy: block

## CONV-JOIN-RESULTS-ONLY

Severity: info · Export policy: show

## CONV-JOIN-DESCRIPTION-ONLY

Severity: warning · Export policy: accept

## CONV-JOIN-AMBIGUOUS

Severity: error · Export policy: block

## CONV-JOIN-KEY-BLANK

Severity: error · Export policy: block

## CONV-JOIN-KEY-ROLE-LOST

Severity: error · Export policy: block

## CONV-JOIN-FILLED

Severity: info · Export policy: show

## CONV-ID-DUPLICATE

Severity: error · Export policy: block

**Citations.**

- [OBIS obistools (R), R/check_eventids.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_eventids.R), check_eventids: "check duplicate eventIDs" (error: "eventID ... is duplicated"); "check if all parentEventIDs have corresponding eventID" (error: "parentEventID ... has no corresponding eventID")
- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Integrity checks: "Checks that occurrenceID is unique in the occurrence table" ... "The occurrenceID acts as the Primary Key for the occurrence table, therefore two records with the same occurrenceID cannot exist in the occurrence table."

## CONV-TAB-IN-VALUE

Severity: error · Export policy: block

**Citations.**

- [OBIS Manual, "Common data quality issues" (iobis/manual common_qc.md; manual.obis.org)](https://manual.obis.org/common_qc.html), "Hidden characters and non-breaking spaces": "a value like Abra alba containing a non-breaking space will not match the same name typed with a normal space"; "OBIS removes leading and trailing whitespace from values during processing, but does not change spaces inside a value"; "Other invisible characters, such as tabs, line breaks within a cell, and zero-width spaces (U+200B), can cause similar problems"

## CONV-TEXT-IN-TAXON-CELL

Severity: warning · Export policy: block

## CONV-COUNT-TEXT-DECIDED

Severity: info · Export policy: show

## CONV-TAXON-SAME-EVENT

Severity: warning · Export policy: accept

## CONV-NA-SKIPPED

Severity: info · Export policy: show

## CONV-QUANTITY-BLANK-KEPT

Severity: warning · Export policy: accept

**Citations.**

- [OBIS Manual, "How to format Occurrence tables" (manual.obis.org/format_occurrence.html; read 2026-10-29): occurrenceStatus is required, a quantity is not](https://manual.obis.org/format_occurrence.html), "These required data fields include the following eight terms: occurrenceID, eventID, ..., occurrenceStatus, basisOfRecord, scientificName, ..." (organismQuantity and organismQuantityType are not among them); "Add and fill basisOfRecord and occurrenceStatus fields"

## CONV-BIOMASS-UNIT-UNCLEAR

Severity: warning · Export policy: accept

## CONV-QUANTITY-REPEATED

Severity: error · Export policy: block

## CONV-QUANTITY-REPEATED-ONCE

Severity: warning · Export policy: accept

## CONV-QUANTITY-REAL-COUNTS

Severity: info · Export policy: show

## CONV-COMPANION-OLD

Severity: info · Export policy: show

## CONV-ROW-COPIES

Severity: error · Export policy: block

## CONV-ROW-COPIES-DROPPED

Severity: warning · Export policy: accept

## CONV-ROW-COPIES-SPECIMENS

Severity: warning · Export policy: accept

## CONV-ROW-COPIES-KEPT

Severity: warning · Export policy: accept

## CONV-OWN-RECORDS

Severity: warning · Export policy: accept

## CONV-ROW-NOT-UNDERSTOOD

Severity: error · Export policy: block

## CONV-ROW-LEFT-OUT

Severity: info · Export policy: show

## CONV-QUANTITY-SAME-IN-SAMPLE

Severity: warning · Export policy: accept

## CONV-TAXON-EMPTY-ROW

Severity: warning · Export policy: accept

## CONV-TIME-HOLDS-DATES

Severity: error · Export policy: block

## CONV-TIME-SOME-DATES

Severity: warning · Export policy: accept

## CONV-DATE-ORDER-UNDECLARED

Severity: error · Export policy: block

## CONV-DATE-ORDER-CONTRADICTED

Severity: error · Export policy: block

## CONV-DATE-ORDER-DECLARED

Severity: info · Export policy: show

## CONV-DECIMAL-DECLARED

Severity: info · Export policy: show

## CONV-MISSING-CODE-DECLARED

Severity: info · Export policy: show

## CONV-ENCODING-DECLARED

Severity: info · Export policy: show

## CONV-ZERO-WITH-BIOMASS

Severity: warning · Export policy: accept

## CONV-SAMPLE-PER-ROW

Severity: warning · Export policy: accept

**Citations.**

- [OBIS Manual, "How to format Occurrence tables" (manual.obis.org/format_occurrence.html; read 2026-10-26)](https://manual.obis.org/format_occurrence.html), "(remember that all OBIS data have at least one occurrence record associated, regardless of what organization structure you have chosen)"

## CONV-ZERO-SKIPPED

Severity: info · Export policy: accept

**Citations.**

- [OBIS obis-qc (Python), obisqc/absence.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/absence.py), absence.py: ABSENT_VALUES = {"absent", "notDetected"}, PRESENT_VALUES = {"present", "detected"}; the status is compared in lower case; any other value: record.set_invalid("occurrenceStatus")

## CONV-SAMPLE-CONFLICT

Severity: error · Export policy: block

## CONV-REPLICATE-EVENTS

Severity: info · Export policy: show

## CONV-TAXON-ATTRIBUTE-IGNORED

Severity: info · Export policy: accept

## CONV-VALUE-PER-OCCURRENCE

Severity: info · Export policy: show

## CONV-NERC-UNKNOWN

Severity: warning · Export policy: accept

**Citations.**

- [OBIS Manual, "Extended Measurement Or Fact" (manual.obis.org/format_emof.html; read 2026-10-25)](https://manual.obis.org/format_emof.html), "For measurementTypeID, measurementUnitID, and measurementValueID you must use controlled vocabulary terms."

## CONV-NERC-UNIT-MISMATCH

Severity: warning · Export policy: accept

**Citations.**

- [OBIS Manual, "Extended Measurement Or Fact" (manual.obis.org/format_emof.html; read 2026-10-25)](https://manual.obis.org/format_emof.html), "For measurementTypeID, measurementUnitID, and measurementValueID you must use controlled vocabulary terms."

## CONV-NERC-CODE-MALFORMED

Severity: warning · Export policy: accept

**Citations.**

- [OBIS Manual, "Extended Measurement Or Fact" (manual.obis.org/format_emof.html; read 2026-10-25)](https://manual.obis.org/format_emof.html), "For measurementTypeID, measurementUnitID, and measurementValueID you must use controlled vocabulary terms."
- [NERC Vocabulary Server (NVS), collections P01 (BODC Parameter Usage Vocabulary) and P06 (BODC data storage units); read 2026-10-29](https://vocab.nerc.ac.uk/collection/P06/current/), Every concept of P06 has a four-character code (411 of 411 codes read, e.g. UPAA) and every concept of P01 an eight-character one (50 613 of 50 613 codes read, e.g. TEMPPR01; 66 begin with a digit); a code of another length has no concept page: https://vocab.nerc.ac.uk/collection/P01/current/D13CMOP11/ answers 404, https://vocab.nerc.ac.uk/collection/P01/current/D13CMOP1/ is a concept.

## CONV-UNIT-NO-P06

Severity: warning · Export policy: accept

**Citations.**

- [OBIS Manual, "Extended Measurement Or Fact" (manual.obis.org/format_emof.html; read 2026-10-25)](https://manual.obis.org/format_emof.html), "For measurementTypeID, measurementUnitID, and measurementValueID you must use controlled vocabulary terms."

## CONV-COLUMN-UNNAMED

Severity: error · Export policy: block

## CONV-LONG-UNSUPPORTED

Severity: error · Export policy: block

## CONV-SHEET-TRANSPOSED

Severity: error · Export policy: block

## CONV-SHEET-UNITS-ROW

Severity: error · Export policy: block

## CONV-LONG-READ

Severity: info · Export policy: show

## CONV-LONG-FLAG-COLUMNS

Severity: info · Export policy: accept

## CONV-LONG-FLAG-PARAMETERS

Severity: info · Export policy: accept

## CONV-LONG-RENAMED

Severity: info · Export policy: show

## CONV-LONG-DROPPED

Severity: info · Export policy: show

## CONV-LONG-KEY-VARIES

Severity: warning · Export policy: accept

## CONV-LONG-DUPLICATE

Severity: error · Export policy: block

## CONV-LONG-NO-PARAMETER

Severity: error · Export policy: block

## CONV-TURN-HEADER-BLANK

Severity: error · Export policy: block

## CONV-TURN-HEADER-REPEATED

Severity: error · Export policy: block

## CONV-TURN-NAME-BLANK

Severity: error · Export policy: block

## CONV-TURN-NAME-REPEATED

Severity: error · Export policy: block

## CONV-SHEET-TURNED

Severity: info · Export policy: show

## CONV-DEPTH-UNIT

Severity: error · Export policy: block

**Citations.**

- [Darwin Core term list (dwc.tdwg.org/terms: minimumDepthInMeters, maximumDepthInMeters, verbatimDepth)](https://dwc.tdwg.org/terms/#dwc:minimumDepthInMeters), "The lesser depth of a range of depth below the local surface, in meters." / verbatimDepth: "The original description of the depth below the local surface."

## CONV-DEPTH-CONVERTED

Severity: warning · Export policy: accept

**Citations.**

- [Darwin Core term list (dwc.tdwg.org/terms: minimumDepthInMeters, maximumDepthInMeters, verbatimDepth)](https://dwc.tdwg.org/terms/#dwc:minimumDepthInMeters), "The lesser depth of a range of depth below the local surface, in meters." / verbatimDepth: "The original description of the depth below the local surface."

## CONV-SEAFLOOR-UNIT

Severity: error · Export policy: block

**Citations.**

- [OBIS Manual, "Darwin Core" (manual.obis.org/darwin_core.html; read 2026-10-26) and the Darwin Core term list (dwc.tdwg.org/terms; minimumDistanceAboveSurfaceInMeters)](https://manual.obis.org/darwin_core.html), "This can be especially useful for sediment cores taken from the sea bottom ... In these cases the minimumDistanceAboveSurfaceInMeters / maximumDistanceAboveSurfaceInMeters would be a negative value."

## CONV-SEAFLOOR-VALUE

Severity: error · Export policy: block

**Citations.**

- [OBIS Manual, "Darwin Core" (manual.obis.org/darwin_core.html; read 2026-10-26) and the Darwin Core term list (dwc.tdwg.org/terms; minimumDistanceAboveSurfaceInMeters)](https://manual.obis.org/darwin_core.html), "This can be especially useful for sediment cores taken from the sea bottom ... In these cases the minimumDistanceAboveSurfaceInMeters / maximumDistanceAboveSurfaceInMeters would be a negative value."

## CONV-SEAFLOOR-SIGNS

Severity: warning · Export policy: accept

**Citations.**

- [OBIS Manual, "Darwin Core" (manual.obis.org/darwin_core.html; read 2026-10-26) and the Darwin Core term list (dwc.tdwg.org/terms; minimumDistanceAboveSurfaceInMeters)](https://manual.obis.org/darwin_core.html), "This can be especially useful for sediment cores taken from the sea bottom ... In these cases the minimumDistanceAboveSurfaceInMeters / maximumDistanceAboveSurfaceInMeters would be a negative value."

## CONV-SEAFLOOR-NO-SITE-DEPTH

Severity: warning · Export policy: accept

**Citations.**

- [OBIS Manual, "Darwin Core" (manual.obis.org/darwin_core.html; read 2026-10-26) and the Darwin Core term list (dwc.tdwg.org/terms; minimumDistanceAboveSurfaceInMeters)](https://manual.obis.org/darwin_core.html), "This can be especially useful for sediment cores taken from the sea bottom ... In these cases the minimumDistanceAboveSurfaceInMeters / maximumDistanceAboveSurfaceInMeters would be a negative value."
- [PANGAEA Wiki, "Geocode" (page version oldid=17007, last edited 2026-06-11; read 2026-11-02)](https://wiki.pangaea.de/wiki/Geocode), section "Third spatial dimension (Depth/Height) (z)": "DEPTH, sediment/rock \[m\] for geological, geochemistry, biogeochemisty, paleontological, geophysical measurements and samples. Describing the specific sampling depth in the sediment core"; "DEPTH, water \[m\] ... This GEOCODE describes the water depth in which the measurement or sample was collected"

## CONV-NO-OCCURRENCES

Severity: error · Export policy: block

**Citations.**

- [OBIS Manual, "How to format Occurrence tables" (manual.obis.org/format_occurrence.html; read 2026-10-26)](https://manual.obis.org/format_occurrence.html), "(remember that all OBIS data have at least one occurrence record associated, regardless of what organization structure you have chosen)"

## CONV-PROFILE-NOTHING-READ

Severity: error · Export policy: block

## CONV-STATION-FROM-POSITION

Severity: info · Export policy: show

## CONV-EFFORT-INVALID

Severity: error · Export policy: block

## CONV-EFFORT-VALUE-INVALID

Severity: error · Export policy: block

## CONV-NO-TAXON

Severity: error · Export policy: block

## CONV-SPECIES-LIST-NO-COUNTS

Severity: error · Export policy: block

**Citations.**

- [OBIS Manual, "How to format Occurrence tables" (manual.obis.org/format_occurrence.html; read 2026-10-29): occurrenceStatus is required, a quantity is not](https://manual.obis.org/format_occurrence.html), "These required data fields include the following eight terms: occurrenceID, eventID, ..., occurrenceStatus, basisOfRecord, scientificName, ..." (organismQuantity and organismQuantityType are not among them); "Add and fill basisOfRecord and occurrenceStatus fields"

## CONV-PRESENCE-VALUE

Severity: error · Export policy: block

**Citations.**

- [OBIS Manual, "How to format Occurrence tables" (manual.obis.org/format_occurrence.html; read 2026-10-29): occurrenceStatus is required, a quantity is not](https://manual.obis.org/format_occurrence.html), "These required data fields include the following eight terms: occurrenceID, eventID, ..., occurrenceStatus, basisOfRecord, scientificName, ..." (organismQuantity and organismQuantityType are not among them); "Add and fill basisOfRecord and occurrenceStatus fields"

## CONV-TAXON-NO-QUANTITY

Severity: error · Export policy: block

## CONV-ENV-ONLY-SHEET

Severity: error · Export policy: block

## CONV-SUMMARY-ROW-UNDECIDED

Severity: warning · Export policy: block

## CONV-SUMMARY-ROW-SKIPPED

Severity: info · Export policy: show

## CONV-SUMMARY-ROW-KEPT

Severity: warning · Export policy: accept

## CONV-ID-REVISIT

Severity: warning · Export policy: accept

## CONV-REPLICATE-MISSING

Severity: error · Export policy: block

## CONV-BIOMASS-KIND-UNSET

Severity: warning · Export policy: accept

## CONV-EML-MISSING

Severity: error · Export policy: block

## CONV-LICENCE-UNSET

Severity: error · Export policy: block

## CONV-BASIS-UNSET

Severity: error · Export policy: block

## CONV-EMOF-ORPHAN

Severity: error · Export policy: block

## CONV-EMOF-EVENT-MISMATCH

Severity: error · Export policy: block

## CONV-EMOF-VALUE-EMPTY

Severity: error · Export policy: block

## CONV-EMOF-TYPE-EMPTY

Severity: error · Export policy: block

## CONV-COLUMN-NOT-EXPORTED

Severity: warning · Export policy: accept

## CONV-COLUMN-IGNORED

Severity: info · Export policy: show

## CONV-COLUMN-IGNORED-PROPOSED

Severity: info · Export policy: accept

## CONV-COLUMN-YEAR-IGNORED

Severity: info · Export policy: accept

## CONV-COLUMN-NUMBER-IGNORED

Severity: warning · Export policy: accept

## CONV-NAMEID-MISSING

Severity: warning · Export policy: accept

## CONV-WORMS-UNDECIDED

Severity: error · Export policy: block

**Citations.**

- [OBIS Manual, "Match Taxonomic Names" (manual.obis.org/name_matching.html; read 2026-10-25)](https://manual.obis.org/name_matching.html), "WoRMS also identifies ambiguous matches, indicating that several potential matching options are available (e.g. homonyms). You can check these ambiguous matches and select the correct one"

## CONV-WORMS-NO-MATCH

Severity: warning · Export policy: accept

**Citations.**

- [OBIS Manual, "Match Taxonomic Names" (manual.obis.org/name_matching.html; read 2026-10-25)](https://manual.obis.org/name_matching.html), "WoRMS also identifies ambiguous matches, indicating that several potential matching options are available (e.g. homonyms). You can check these ambiguous matches and select the correct one"

## CONV-WORMS-NOT-MARINE

Severity: warning · Export policy: accept

## CONV-NAMEID-INCOMPLETE

Severity: warning · Export policy: accept

## CONV-NAMEID-CONFLICT

Severity: warning · Export policy: accept

## CONV-NO-SAMPLING-DESCRIPTOR

Severity: warning · Export policy: accept

**Citations.**

- [EMODnet Biocheck (R), R/checkdataset.R lines 562-566 and data/BODCeffort (master 701e6e7, 2026-10-08)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/R/checkdataset.R), if (sum(grepl(paste(BODCeffort, collapse="|"), unique(eMoF$measurementTypeID))) == 0) -\> level "warning", field "measurementType", message "No sampling descriptors/effort present"

## CONV-DEVICE-MISSING

Severity: warning · Export policy: accept

## CONV-MESH-INVALID

Severity: error · Export policy: block

## CONV-NAMEID-APHIA-LIKE

Severity: warning · Export policy: accept

## CONV-LICENCE-DIFFERS

Severity: warning · Export policy: accept

## CONV-PROFILE-STATION-UNMATCHED

Severity: warning · Export policy: accept

## CONV-PROFILE-STATION-FAR

Severity: warning · Export policy: accept

## CONV-PROFILE-STATION-CAST-MATCHED

Severity: info · Export policy: show

## CONV-PANGAEA-NAMES-FALLBACK

Severity: info · Export policy: show

## CONV-PROFILE-LEVEL-INCOMPLETE

Severity: error · Export policy: block

## CONV-PROFILE-PRESSURE-NO-UNIT

Severity: warning · Export policy: accept

## CONV-POSITION-NONE

Severity: error · Export policy: block

## CONV-POSITION-DECLARED

Severity: warning · Export policy: accept

## CONV-POSITION-DECLARED-INVALID

Severity: error · Export policy: block

## CONV-DATE-DECLARED

Severity: warning · Export policy: accept

## CONV-DATE-DECLARED-HELD

Severity: warning · Export policy: accept

## CONV-DATE-DECLARED-INVALID

Severity: error · Export policy: block

## CONV-EVENT-DATE-MISSING

Severity: error · Export policy: block

## CONV-PROFILE-NO-STATION

Severity: error · Export policy: block
