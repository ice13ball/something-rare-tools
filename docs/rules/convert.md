# Rules of /convert

Generated from the rule registry (`src/core/rules/`) by `scripts/rules-docs-per-tool.ts`. Do not edit by hand.
Regenerate with `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-docs-per-tool.test.ts`.

/convert reads a spreadsheet or table, asks the person to declare what the columns mean, and writes a Darwin Core archive. It re-uses the file-reading and row checks of /check, and adds its own questions (rules with the prefix CONV). For every rule the list names the export policy: block stops the export, accept needs one tick for the rule per run, show is only shown.

The list is the rules the tool can raise, found by a static scan of its code, so a few may never fire in practice. Severity is error, warning or info. Every number a rule compares against is listed with its source. Each rule has four short parts: what it checks, when it fires, an invented example, and what the person can do.

202 rules.

## IN-LAYOUT-UNSUPPORTED — The table is laid out in a way the tool cannot read as one header row and one row per sample, so it was not read

Severity: error · Export policy: block

**What it checks.** The table is laid out in a way the tool cannot read as one header row and one row per sample, so it was not read.

**When it fires.** When the layout reader finds data that is transposed (variables in rows, samples in columns; the first column must hold at least two names the tool knows as columns, such as Latitude or Temperature; species in rows are not detected here, only in /convert), a header spread over several rows (more than half of the header cells empty in a table of three or more columns, or a first data row of units that was not folded into the header), a row above the names that holds footnote markers, a table with no rows (only when every sheet is empty), a workbook with no sheet of coordinates or measurements, or no table at all. In /convert a transposed sheet is reported as CONV-SHEET-TRANSPOSED instead. The finding gives the reason and, for a workbook, the sheet.

**Example.** A sheet lists the variables down the first column and the samples across the top; the finding says the data is transposed.

**What you can do.** Reshape the table into one header row with one row per sample and add it again. In /convert this finding blocks the export.

## IN-ENCODING-FALLBACK — The file is not saved as UTF-8, so the tool read it as an 8-bit Central European or Western code page

Severity: info · Export policy: accept

**What it checks.** The file is not saved as UTF-8, so the tool read it as an 8-bit Central European or Western code page. The letters with accents may be wrong if that guess is wrong.

**When it fires.** When the bytes are not valid UTF-8 and all three 8-bit readings the tool tries (windows-1250, ISO-8859-2 and windows-1252) give the same text. The file is read as ISO-8859-2 (a byte 8A, 9A, 8C, 9C, 8F or 9F makes the readings differ, so that case is IN-ENCODING-AMBIGUOUS, read as windows-1250). Plain ASCII is valid UTF-8 and never raises it. If the readings differ, IN-ENCODING-AMBIGUOUS is raised instead. A UTF-16 file or a UTF-8 file with a BOM is read without a finding.

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

**When it fires.** Per column of a decimal-comma file, only when every number with a comma has exactly three digits after it. A single value such as 1.250,5 settles the column (with both separators the last is the decimal), and so does a value with one, two, or four or more decimals, a value with a leading zero (0,125) or with four or more digits before the comma (1234,500), since such a number cannot be a thousands group; then no finding is raised. In 1,250,000 the comma repeats, so it is a thousands mark; the question stays open for the other values and the finding names that cell. The finding gives the column, the number of cells, the first such value and both readings. The cells were read as decimals.

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

**When it fires.** When the row directly under the header (or under a row of statistic labels) has only unit cells, at least two of its cells are units (a unit the header already states counts, so a single name may be the only one that changes), every cell has a name above it, and the numbers below fit the units. A unit that disagrees with the one the name already gives means the row is not folded. The finding gives the line and the first changed name, for example a column now named a \[h\]. The line numbers in the report stay the file's own.

**Example.** A header latitude, longitude over a row degrees_north, degrees_east, then rows of numbers: the names become latitude \[degrees_north\] and longitude \[degrees_east\].

**What you can do.** Nothing to fix. If you prefer a single header row, put the unit into the column name. In /convert this finding is only shown and never stops the export.

## IN-HEADER-UNITS-NAMED — A row of units under the header was recognised and skipped

Severity: info · Export policy: show

**What it checks.** A row of units under the header was recognised and skipped. The column names already carried the same units, so no name was changed.

**When it fires.** When the row under the header holds only units and every column it names has the same unit in its own header too, for instance depth \[m\] over m. It needs numbers under at least two of the units and at least one data row below the units row; otherwise the row is not recognised and nothing is reported. The row is not a data row and the report keeps the file's own line numbers. The finding gives the line.

**Example.** The header holds temperature \[°C\] and depth \[m\], the next line holds °C and m, and rows of numbers follow.

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

**When it fires.** When the table lacks the position or the date and the block cannot give it: several events are listed but the table has no Event column to say which row belongs to which, or the event's position is a track (start and end differ) and not a point, which also applies to a single event; the track reason is given only when none of the listed events is a point. The finding gives the number of events and which of the two reasons applies.

**Example.** A block lists three stations and the table has no Event column; nothing is borrowed.

**What you can do.** Add an Event column, or position and date columns, to the table. For a track add the position of each sample. In /convert this finding is only shown and never stops the export.

## IN-PANGAEA-EVENT-UNMATCHED — Some rows of a PANGAEA table have no matching event in the Event(s) block of the file header, so nothing was taken for them

Severity: warning · Export policy: show

**What it checks.** Some rows of a PANGAEA table have no matching event in the Event(s) block of the file header, so nothing was taken for them.

**When it fires.** When the table has an Event column, for each row whose Event cell is empty, names an event that is not listed, names an event listed twice, or names an event with no position or date . With one event the Event column is not consulted: every row takes that event, and a single event with neither position nor date gives no finding. The finding appears only when at least one column was added, and gives the number of rows and their lines.

**Example.** Rows 12 and 13 say station 7, and the block lists stations 1 to 6.

**What you can do.** Fill the position and date for those rows in the table. In /convert this finding is only shown and never stops the export.

## LIC-ACCESS-HELD-BACK — Whether the Zenodo record or the PANGAEA dataset is openly accessible

Severity: warning · Export policy: show

**What it checks.** Whether the Zenodo record or the PANGAEA dataset is openly accessible. Whatever licence the metadata states, the repository decides who may get the data.

**When it fires.** Once per dataset, when a Zenodo record is embargoed, restricted or closed (the older access_right field and the newer access block are both read), or a PANGAEA licence entry says the data need a login or are restricted. For an embargo the finding names the end date when the record gives one. An embargo whose date has already passed, a lifted embargo and open access say nothing. Dataverse files held back have their own rule, LIC-FILES-HELD-BACK.

**Example.** A Zenodo record has access_right "embargoed" and an embargo_date in the future.

**What you can do.** If the data are the restricted part, say in the description how and when they can be obtained, or open them.

## META-NO-DATES — Neither the table nor the record holds any date

Severity: error · Export policy: show

**What it checks.** Neither the table nor the record holds any date. Data without a date cannot be placed in time, and OBIS and most repositories require one.

**When it fires.** For a table with rows and a supported layout, when no row has a date (a date cell that exists but cannot be read counts as a date column, and is reported by ROW-DATE-UNPARSEABLE) and no record has a temporal extent or a collection date. Publication dates are not used. A lookup table of the same file, which holds no measurement while another sheet of the file does, is skipped. For a workbook the sheets that lack a date are listed in one finding. When a join left rows without a date the finding names the joined sheet as the likely cause. For an empty eventDate column of a Darwin Core table only this rule speaks, and DWC-TERM-EMPTY stays silent.

**Example.** A table of temperature and salinity by depth with no date column, described by a record without a temporal extent.

**What you can do.** Add the sampling date to the table or a time span to the record. In /convert, where the converter has already said that no event has a date (CONV-EVENT-DATE-MISSING), this finding is not repeated. In /convert the finding is only shown and never stops the export.

## ROW-LAT-RANGE — A latitude lies outside the range of the globe, -90 to 90 degrees

Severity: error · Export policy: block

**What it checks.** A latitude lies outside the range of the globe, -90 to 90 degrees. No place has such a latitude, so the value is a typing error, a swapped column or a unit mistake.

**When it fires.** For every row of a sheet whose latitude column holds a number below -90 or above 90. One finding per sheet lists the lines and shows the first value as written. Text in the cell is not judged here, that is ROW-NON-NUMERIC; so is a value with a hemisphere letter (95.5 N) or in degrees and minutes. Only a plain number is judged here.

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

**When it fires.** For every row whose longitude is a number below -180 or above 360 (values from 180 to 360 are first read on the 0 to 360 scale and only noted as ROW-LON-360). One finding per sheet lists the lines and the first value as written. Only a plain number is judged: a value with a hemisphere letter (200 W) or in degrees and minutes is ROW-NON-NUMERIC.

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

**When it fires.** When at least 5 rows have equal latitude and longitude (other than 0, 0) and either they are a fifth or more of the rows with a position, or at least 5 of them share one value written with two or more decimals that is not a multiple of 0.25. Fewer rows, or a smaller share without such a repeated value, give ROW-LAT-EQ-LON-ISOLATED or ROW-LAT-EQ-LON-COARSE. The two limits are choices of this tool, not published thresholds.

**Example.** 12 of 30 rows read 54.4, 54.4 or 18.7, 18.7. That is 40 percent, above the 20 percent share, so the group is reported with the first value.

**What you can do.** Find the column that was copied and enter the real positions. In /convert this finding blocks the export until the positions are corrected.

## ROW-LAT-EQ-LON-ISOLATED — A few rows have identical latitude and longitude with a fine decimal

Severity: warning · Export policy: accept

**What it checks.** A few rows have identical latitude and longitude with a fine decimal. It can be a coincidence, but typing one number into both columns is a common slip.

**When it fires.** When rows with equal latitude and longitude, not 0, 0, do not reach the error level of ROW-LAT-EQ-LON and the value is finer than a half degree. A group of 5 or more rows goes here only when it is under a fifth of the rows with a position and has no 5 rows of one repeated value with two or more decimals that is not a multiple of 0.25.

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

**When it fires.** When the file is read: for each line whose field count differs from the header field count. The finding gives the expected count and the count of the first listed line. The rows are kept as found and are not realigned. Not raised when at least 95 percent of the rows (3 rows or more) are wider than the header and the extra cells hold values (IN-HEADER-SHORT extends the header instead), nor when every row only ends with an empty extra field (a trailing delimiter). Never raised for a workbook sheet.

**Example.** A header has 8 columns. Line 31 has 9 values because a comment contains an unquoted comma. Line 31 is reported with expected 8 and found 9.

**What you can do.** Fix the line in the original file, usually a missing quote or a stray separator. In /convert this finding blocks the export, and the converter does not convert such a row.

## ROW-NON-NUMERIC — A column that holds numbers has a text cell

Severity: warning · Export policy: accept

**What it checks.** A column that holds numbers has a text cell. The cell cannot be used as a value, and it is not the same as a deliberate empty cell.

**When it fires.** For a cell of a numeric column (a coordinate, a depth, a measurement) that is neither a number nor one of the recognised missing-value marks (empty, NA, N/A, NaN, nd, n.d., -, --, null). One finding per column lists the lines and an example. Thousands separators are not accepted, 1,234.5 is text unless the file uses decimal commas.

**Example.** A depth column holds 10, 20, below detection, 40. The cell below detection on line 4 is reported with that text.

**What you can do.** Replace the text with a number, or empty the cell. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule; the cell is not written as a number.

## ROW-NA-VARIANT — A numeric column marks missing values in an unusual way, such as NANA or N.A

Severity: warning · Export policy: show

**What it checks.** A numeric column marks missing values in an unusual way, such as NANA or N.A. Such a mark is understood as missing, but the column then uses more than one mark.

**When it fires.** For a numeric cell whose letters and digits, without separators, are only the letters NA repeated, and which is not one of the standard marks. One finding per column lists the lines and an example.

**Example.** A salinity column holds 33.1, NANA, 33.4. NANA on line 3 is read as missing and reported.

**What you can do.** Use one consistent mark, or an empty cell. In /convert this finding is only shown, and the cell is treated as missing.

## ROW-STATION-MOVED — One station name appears at positions that differ by a typed digit, swapped axes or a sign

Severity: warning · Export policy: accept

**What it checks.** One station name appears at positions that differ by a typed digit, swapped axes or a sign. A station is one place, so one of the positions is probably wrong.

**When it fires.** For rows of one station name, compared within one cruise or, without a cruise column, within one calendar year, when two positions differ in one of three ways. A typed digit: one coordinate differs by a whole number of degrees and the other keeps its whole degree; the shifted coordinate needs two written decimals (one inside a cruise, not .0 or .5) and there is no distance limit. Exchanged axes: each position is the other with latitude and longitude swapped. A sign: as written the positions are at least 100 km apart, and with one sign flipped they are within 50 km and at least ten times closer. Placeholder names such as unknown do not count. Among rows with neither a cruise nor a date a typed digit is not looked for; such a station gets ROW-STATION-SPREAD instead.

**Example.** Station A3 is at 76.9 N 15.5 E on 9 rows and at 76.9 N -15.5 E on 14 rows. The finding lists both positions and says that the longitude differs only by its sign.

**What you can do.** Decide which position is right and correct the other rows. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule, before the export button works.

## ROW-STATION-SPREAD — One station name has positions more than 10 km apart

Severity: info · Export policy: show

**What it checks.** One station name has positions more than 10 km apart. A station is usually one place, but a name that stands for an area, a transect or a cruise can legitimately span more.

**When it fires.** When the largest distance between the positions of one station name, within one cruise or one calendar year, is above 10 km, and either it is not above 1000 km or the name is an expedition or cruise label, or a generic label such as Sta. 1 with no cruise or date to anchor it; those stay a note even above 1000 km. Not raised when a pair of positions matches ROW-STATION-MOVED (only that is raised); placeholder names such as unknown and positions with latitude equal to longitude are skipped. The finding gives the distance rounded to km and the positions. It is an information note.

**Example.** Station T1 has positions 38 km apart, because the name was used for every point of a transect. The note gives 38 km.

**What you can do.** If the name means one place, correct the position. If it names a transect or an area, ignore the note. In /convert this finding is only shown.

## ROW-STATION-SPREAD-FAR — One station name has positions more than 1000 km apart

Severity: warning · Export policy: accept

**What it checks.** One station name has positions more than 1000 km apart. A station is one place, so this is almost certainly a wrong position, not an area.

**When it fires.** When the largest distance between the positions of one station name, within one cruise or one calendar year, is above 1000 km (a limit chosen by this tool, not a published threshold). A name that is an expedition or cruise label, or a generic label with no cruise or date to anchor it, gives ROW-STATION-SPREAD instead. Generic placeholder names and positions with latitude equal to longitude are skipped. The spread is measured only when no pair of positions of the station matches a pattern of ROW-STATION-MOVED (a typed digit, exchanged axes, a sign flip); when one does, only ROW-STATION-MOVED is raised, whatever the distance, so 18.55 E against 118.55 E in one year gives ROW-STATION-MOVED, not this rule. It is a warning.

**Example.** In one cruise, station K7 is at 54.5 N 18.6 E on 12 rows and at 47.2 N 35.9 E on one row. No digit, axis or sign explains the difference, the distance is about 1450 km, and both positions are listed.

**What you can do.** Find which position is wrong, a sign, a digit or swapped axes, and correct it. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.

## ROW-DATE-UNPARSEABLE — A date cell cannot be read as a date

Severity: warning · Export policy: block

**What it checks.** A date cell cannot be read as a date. Without a date the event cannot be placed in time, so it is lost from the output.

**When it fires.** For a cell of the date column that is none of the accepted forms: ISO 8601, YYYY/MM/DD, DD.MM.YYYY, an unambiguous DD/MM/YYYY, YY-MM-DD, a four-digit year, YYYYMMDD in a column that is the date, or an Excel serial number. Also raised for a time cell that cannot be read as a time of day, and for Year, Month and Day columns that do not make a date. One finding per sheet lists the lines and an example.

**Example.** A date column holds 2021-06-14, summer 2021 and 2021-06-16. The text summer 2021 on line 3 is reported.

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

**When it fires.** For rows whose year is not among the years found in the label, the file name, the record title or the temporal extent. A range such as 1994-2019 names every year in it; a number followed by a unit such as m is not read as a year. Only years between 1900 and 2100 count. It does nothing when the dataset names no year. A date later than today is ROW-DATE-FUTURE only, not here.

**Example.** The title says Winter cruise 2018. Two rows are dated 2008-02-11, a mistyped digit. The two lines are reported.

**What you can do.** Correct the date, or correct the title or the temporal extent if the data really span other years. In /convert this finding is only shown.

## ROW-LONG-PARAMETER-MERGED — In a long sheet a parameter cell is merged over several rows

Severity: info · Export policy: accept

**What it checks.** In a long sheet a parameter cell is merged over several rows. The tool takes the name of the top cell for the rows below it, and tells you that it did.

**When it fires.** For rows below the top cell of a merge that the workbook declares and which have a value. Only rows with a value are filled. It is an information note.

**Example.** The cell Parameter says nitrate and is merged over lines 5 to 9. Lines 6 to 9 are read as nitrate, and the note lists them.

**What you can do.** Check that the merge means the same parameter for all rows, or unmerge it and repeat the name. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.

## ROW-DATE-YYMMDD — A date written with two-digit parts, NN-NN-NN, was read with the century inferred

Severity: info · Export policy: accept

**What it checks.** A date written with two-digit parts, NN-NN-NN, was read with the century inferred. The century is a guess and can be wrong for old data.

**When it fires.** Once per column, when the order of the cells is fixed, because some cell rules the other readings out or the order was declared. The century rule: a two-digit year up to the current year plus one is 20xx, any other is 19xx. The finding gives the interpreted date and the order read (ymd, dmy or mdy). Also raised when several orders fit but every cell gives the same date in each (12-12-12); the order then lists all of them. One acceptance of the rule covers the century in every column it names.

**Example.** The column holds 98-07-25. 98 cannot be a day or a month, so it is read as year-month-day, 1998-07-25, with the century 19xx. If the cruise was in 2098 the century is wrong.

**What you can do.** Write four-digit years, or check that the century is right. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.

## ROW-DATE-YY-AMBIGUOUS — A date column with two-digit parts, NN-NN-NN, can be read in more than one order and the readings give different dates

Severity: warning · Export policy: block

**What it checks.** A date column with two-digit parts, NN-NN-NN, can be read in more than one order and the readings give different dates. It is a guess which is right.

**When it fires.** Once per column, when two or more of year-month-day, day-month-year and month-day-year fit every cell, no cell rules a reading out (a part above 31, or above 12 in a month place, rules it out), and the dates differ. The tool reads year-month-day when that fits. Slash dates such as 03/04/2021 follow a different answer, the day-month order.

**Example.** The column holds 05-06-07 and 08-09-10. They can be 2005-06-07, 5 June 2007 or 6 May 2007, and the dates differ. The column is reported once.

**What you can do.** Write the dates in ISO form. /convert asks you to declare the order of the two-digit-year column and blocks the export until you answer; that answer is separate from the day-month order of slash dates.

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

## ROW-DEPTH-MIXED-SIGN — One sheet holds both negative and positive depths

Severity: warning · Export policy: accept

**What it checks.** One sheet holds both negative and positive depths. Some rows probably use the opposite direction, and no direction can be chosen safely.

**When it fires.** Per sheet, when non-zero depths of both signs exist. The values 0, -99, -999 and -9999 are not counted, except in /convert, where such codes count as values. No direction is chosen, not even the majority. ROW-DEPTH-RANGE then judges the size of the depth, and nothing is changed.

**Example.** A depth column holds 5, 10, -20 and -30. Both signs are present, so the sheet is reported.

**What you can do.** Make all depths use one direction. In /convert the check runs on the depth columns of the converted table and does not block the export, but it needs your acceptance, one tick for the rule.

## ROW-MISSING-CODE — A cell holds -99, -999 or -9999, which are common codes for missing values

Severity: warning · Export policy: block

**What it checks.** A cell holds -99, -999 or -9999, which are common codes for missing values. As numbers they would be false depths or measurements.

**When it fires.** Once per sheet and column, for a cell exactly equal to one of the three numbers, in the depth column (or the two Darwin Core depth bounds) and in every variable. The cell is kept as written and is left out of the depth direction, ROW-DEPTH-RANGE and CHEM-RANGE.

**Example.** A salinity column holds 33.1, -999 and 33.4 on lines 2 to 4, under a header on line 1. The -999 on line 3 is kept as written, left out of the range checks, and reported.

**What you can do.** Empty such cells in the source if they mean missing. In /convert this finding blocks the export until you answer, per column, whether the code is missing or a real value; on missing the cells are left empty and listed.

## ROW-DM-COORDS — A coordinate was written in degrees and minutes, or degrees, minutes and seconds, as text

Severity: info · Export policy: show

**What it checks.** A coordinate was written in degrees and minutes, or degrees, minutes and seconds, as text. The tool converted it to decimal degrees.

**When it fires.** Once for each coordinate column that holds a cell of that form; the finding names the column and one example cell and lists no lines. It is a note that a conversion took place.

**Example.** The cell 54 30.5 N becomes 54.508333. The note shows both.

**What you can do.** Check the converted value, and write decimal degrees in your own copy. In /convert this finding is only shown.

## ROW-HEMISPHERE-CONFLICT — A coordinate and its hemisphere letter disagree, for example a latitude that already has a minus sign beside the letter S

Severity: warning · Export policy: accept

**What it checks.** A coordinate and its hemisphere letter disagree, for example a latitude that already has a minus sign beside the letter S. One of the two is wrong.

**When it fires.** When the value already carries a minus sign or a letter of its own that disagrees with the hemisphere cell, or the hemisphere letter belongs to the other axis (E or W on a latitude, N or S on a longitude). The value is kept as written and is not negated. A plain 54.3 with S is simply read as -54.3 and raises nothing.

**Example.** The latitude is -54.3 and the hemisphere column says S. A minus and an S together are a conflict, and the latitude stays -54.3.

**What you can do.** Correct the value or the letter. In /convert this finding does not block the export, but it needs your acceptance, one tick for the rule.

## ROW-HEMISPHERE-UNPAIRED — A hemisphere column does not match the coordinate it was mapped to

Severity: warning · Export policy: accept

**What it checks.** A hemisphere column does not match the coordinate it was mapped to. Its start or end word points to the other end of the track.

**When it fires.** Once per column, when the start or end word of the hemisphere column does not match the coordinate it signs. An axis word alone never raises it. The hemisphere is not applied.

**Example.** The column Beg Lat Dir is mapped to End Latitude. It is not applied, and the finding names the column.

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

**When it fires.** For a row with a blank latitude or longitude on a sheet where other rows have a position. Not counted: blank trailing rows, summary rows, rows that inherit a position from a parent event, and continuation rows of a station block. A row with both blank is exempt when its station has a position on another row (on a sheet with no station column: its date), the cruise being part of that key when the sheet has a cruise column, so a cruise alone never exempts a row; it is also exempt when its station (or date) cell is blank and it follows a positioned row of the block. A row with one blank coordinate is always reported. A sheet with no position at all says nothing. In /convert it is raised only for an event with no positioned parent.

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

**Example.** A depth column with no unit in its header holds 25, 40 and 4500000, a value typed in millimetres. The last is reported.

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

**When it fires.** When a cell contains the pair U+00C3 or U+00C2 followed by a character from U+0080 to U+00BF, as in the damaged form of an accented letter. A lone U+00C3 or U+00C2 is not matched, nor are other double-encoded forms. The finding is one per sheet, reads the header row as well, names the columns and gives the count of cells, not pairs. Not raised for a file already reported as IN-ENCODING-FALLBACK or IN-ENCODING-AMBIGUOUS, because there the pair comes from the fallback decoding.

**Example.** A station called Sao Joao appears as the damaged form of Sao Joao with accents, two odd characters in place of each accented letter. The cell is reported.

**What you can do.** Save the source again as UTF-8 and correct the damaged text. In /convert this finding is only shown.

## DWC-TERM-MISSING — A Darwin Core table has no column for a term that OBIS requires

Severity: error · Export policy: block

**What it checks.** A Darwin Core table has no column for a term that OBIS requires. Without the required terms the records cannot be published in OBIS, so the file is not ready however good its other columns are.

**When it fires.** Only on Darwin Core input: an Archive, or a table with at least three distinct Darwin Core terms in its header (spelled exactly, capitals count) plus one of occurrenceID, eventID, parentEventID, scientificName, scientificNameID, taxonID, basisOfRecord or occurrenceStatus. With eventID or parentEventID and no occurrence term it is an Event core, otherwise an Occurrence core. Always required: eventDate, decimalLatitude, decimalLongitude and an identifier (eventID for Event; occurrenceID or eventID for Occurrence; an Archive core id may stand for it). Occurrence also needs scientificName, occurrenceStatus and basisOfRecord. An occurrence table with an eventID column with a value in at least one row is the occurrence side of an event and occurrence pair, and then the date and coordinates are not required of it. Sources: obistools check_fields, OBIS Manual.

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

**When it fires.** Only on Darwin Core input read as an Event core that has a parentEventID column and an eventID column (in an archive the core id column); without one only DWC-TERM-MISSING is raised. Every non-blank parentEventID that matches no eventID of the table is listed with its lines, and the finding counts the different missing parents. It does not run when the archive was read only in part (the first 200000 rows, see IN-DWCA-PARTIAL), because the parent may be in a row that was not read. Sources: obistools check_eventids and Biocheck.

**Example.** An event table whose parentEventID cells name CRUISE-A on three lines, while no eventID is CRUISE-A, is reported.

**What you can do.** Correct the identifier, or add the missing parent event as a row. In /convert this finding blocks the export.

**Citations.**

- [OBIS obistools (R), R/check_eventids.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_eventids.R), check_eventids: "check duplicate eventIDs" (error: "eventID ... is duplicated"); "check if all parentEventIDs have corresponding eventID" (error: "parentEventID ... has no corresponding eventID")
- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Integrity checks: "if the parentEventID field is populated, it must be populated with an existing eventID from the eventID field. Adding to the parentEventID field something different than an existing eventID is incoherent."

## DWC-PARENT-LOOP — The eventID and parentEventID columns form a circle: an event is its own ancestor

Severity: error · Export policy: block

**What it checks.** The eventID and parentEventID columns form a circle: an event is its own ancestor. A hierarchy that never reaches a top event cannot be read, and GBIF flags it as an infinite lineage.

**When it fires.** Only on Darwin Core input read as an Event core that has a parentEventID column and an eventID column (in an archive the core id column); without one only DWC-TERM-MISSING is raised. Each eventID is followed to its parent, then to that parent, and so on; every row on a circle is listed and counted. A row whose parentEventID equals its own eventID is a circle of one. When an eventID repeats, its first non-blank parent is used. The search visits each event once. It does not run when the archive was read only in part (the first 200000 rows, see IN-DWCA-PARTIAL). Source: the GBIF issue PARENT_EVENT_INFINITE_LINEAGE.

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

## CONV-SPLIT-UNDECIDED — Taxon names that carry more than a name, a qualifier such as cf

Severity: error · Export policy: block

**What it checks.** Taxon names that carry more than a name, a qualifier such as cf. or sp., a life stage such as c2 or juv., or a sex suffix, were split into scientificName, identificationQualifier and lifeStage, and the split has not been approved yet. The exact text is always kept in verbatimIdentification.

**When it fires.** Once per upload (distinct texts are counted over all non-profile sheets together, and the finding is attached to the first sheet), when at least one distinct taxon text (a header of a wide sheet or a cell of a taxon column) was changed by the split, or its leftover name is doubtful, and no approval exists for that exact text. A plain name needs no decision and is not counted. The taxon columns of profile sheets are not counted.

**Example.** A plankton sheet has the columns "Pseudocalanus sp." and "Oithona similis CIV". The first is proposed as the name Pseudocalanus with the qualifier sp., the second as Oithona similis with life stage C4. The finding says 2 names carry a qualifier or a stage and shows the first.

**What you can do.** Approve each proposed split on the page (or correct it), one answer per distinct text. In /convert this finding blocks the export until every distinct split is approved.

## CONV-QUANTITY-UNDECLARED — The meaning of the numbers of a sheet is not declared, or the declaration is incomplete

Severity: error · Export policy: block

**What it checks.** The meaning of the numbers of a sheet is not declared, or the declaration is incomplete. The converter does not guess whether a column is a count, a density, a biomass, a percent cover or an abundance class.

**When it fires.** For a sheet with taxon columns and numbers when the quantity declaration is missing or lacks a part. A count needs only its kind. A density needs the unit and a per-volume or per-area basis (plus the medium, bed or water, when it is per area). A biomass needs a mass unit (g, mg or kg), the basis (wet, dry or ash-free dry weight) and a per-volume or per-area basis, or the statement per sample. A class needs its scale, a cover needs the unit percent, and a sample size needs the value, the unit and the volume or area (or an effort column). The finding lists what is missing. It is not raised for a presence-only or own-record sheet, a species list, a taxon without a quantity, or a sheet with only environmental variables.

**Example.** A sheet has the columns "Calanus finmarchicus" and "Oithona similis" with numbers under them. The person has declared a density but no unit, so the finding says: Missing: unit.

**What you can do.** Declare the kind of the numbers on the page, with the unit, basis, scale or sample size it needs; a count needs only its kind. In /convert this finding blocks the export until the declaration is complete.

## CONV-COUNT-NOT-INTEGER — A column declared as a count holds values with decimals

Severity: error · Export policy: block

**What it checks.** A column declared as a count holds values with decimals. A number of individuals must be whole, because individualCount in Darwin Core is an integer.

**When it fires.** For every cell of a declared count column that is a number but not a whole number. One finding per column lists the lines, the total and the first value. Those cells are not converted.

**Example.** A count column "Calanus" holds 12, 7.5 and 3 on lines 5, 6 and 7. Line 6 is reported with the value 7.5.

**What you can do.** Declare the sheet as a density with its unit if the numbers are per volume or area, or correct the values in the source. In /convert this finding blocks the export.

## CONV-NEGATIVE-QUANTITY — A quantity or sample size column holds a negative number

Severity: error · Export policy: block

**What it checks.** A quantity or sample size column holds a negative number. A count, a density, a biomass or an effort cannot be below zero.

**When it fires.** For every cell of a column declared or read as a quantity or sample size whose value is below zero. One finding per column lists the lines, the total and the first value. Those cells are not converted.

**Example.** A biomass column holds 0.4, -0.2 and 1.1 on lines 8, 9 and 10. Line 9 is reported with the value -0.2.

**What you can do.** Correct the values in the source. If a negative number stands for a missing value, replace it by an empty cell (a code such as -99 is a separate question, answered with the missingCode setting). In /convert this finding blocks the export.

## CONV-COVER-RANGE — A column declared as percent cover holds a value above 100

Severity: error · Export policy: block

**What it checks.** A column declared as percent cover holds a value above 100. A share of an area cannot be above one hundred percent.

**When it fires.** For every cell of a column declared as cover whose value is greater than 100 (and which is not answered as an absence). A negative cover is not reported here: it is CONV-NEGATIVE-QUANTITY. One finding per column lists the lines and the first value. Those cells are not converted.

**Example.** A cover column holds 35, 60 and 140 on lines 4, 5 and 6. Line 6 is reported with the value 140.

**What you can do.** Correct the value, or change the declaration if the column is not a percentage (for example a count or a density). In /convert this finding blocks the export.

## CONV-CLASS-VALUE — A column declared as an abundance class holds a value that is not a whole number of the declared scale

Severity: error · Export policy: block

**What it checks.** A column declared as an abundance class holds a value that is not a whole number of the declared scale. A class is a rank on a scale, never a number of individuals.

**When it fires.** For every cell of a column declared as an abundance class that is not a whole number belonging to the scale (a decimal, or a number below the lowest or above the highest class). A negative value is reported earlier as CONV-NEGATIVE-QUANTITY. One finding per column lists the lines, the scale and the first value. Those cells are not converted, and a class is never written as individualCount.

**Example.** A column is declared as classes of a scale from 1 to 5 and holds 2, 4 and 7 on lines 3, 4 and 5. Line 5 is reported with the value 7.

**What you can do.** Correct the values or the declared scale on the page. If the numbers are really counts, declare them as counts. In /convert this finding blocks the export.

## CONV-SAMPLE-CODE-MISSING — Some rows have no sample code

Severity: error · Export policy: block

**What it checks.** Some rows have no sample code. The code becomes the eventID in the archive, so it has to come from the person; the converter never derives it from depth or row order.

**When it fires.** For a row that carries a record (on a long sheet a taxon with a value, a biomass or a description; on a wide sheet any filled taxon cell) and has no sample code: the code cell is empty (a blank, NA, nan or a dash), or the sheet has no code column at all, or, with a picked key, every part of the key is blank in that row. Spacer and comment rows are listed under other reasons. One finding per sheet lists the lines and the number of rows. A profile sheet gets a different text.

**Example.** A long sheet has a "Sample" column that is empty on lines 20 to 24, five rows. The finding names those lines and the column.

**What you can do.** Pick the columns that together make a sample (the sample key on the page, kept in the companion file as sampleKey), or download the sheet with proposed codes, check them and upload it again. On a profile sheet no download is offered: map a code column that is unique within the station, or tick the approval of station plus depth as written (this needs a depth or a pressure in dbar). In /convert this finding blocks the export.

## CONV-KEY-PART-BLANK — One of the columns of the sample key the person picked is empty in some rows

Severity: warning · Export policy: accept

**What it checks.** One of the columns of the sample key the person picked is empty in some rows. The empty part counts as a value, so those rows form samples of their own and are not merged with rows that have a value there.

**When it fires.** For every row that passes the record check (see CONV-SAMPLE-CODE-MISSING) and in which a part of the picked key is empty (an empty cell, NA, nan or a dash) while at least one other part has a value. A row whose parts are all empty has no sample and is CONV-SAMPLE-CODE-MISSING instead. A profile sheet never raises it.

**Example.** The key is station plus depth. Lines 12 and 13 have a station but an empty depth, so they make a sample apart from the rows of the same station with a depth.

**What you can do.** Fix the gap in the file if it is a gap in the data, or accept if the rows really are separate samples. In /convert this warning must be accepted once before the export.

## CONV-ROLE-UNCONFIRMED — Some columns have a taxon, quantity, date, latitude or longitude role that the converter proposed and the file does not state by name

Severity: warning · Export policy: accept

**What it checks.** Some columns have a taxon, quantity, date, latitude or longitude role that the converter proposed and the file does not state by name. A stated name means an exact Darwin Core term, an exact vocabulary entry, a unit in the header or a PANGAEA geocode.

**When it fires.** Once per sheet when at least one column has such a proposed role. A column whose role the person changed is not listed. Nothing is re-roled and nothing about this finding is written to the archive or the companion file. A species name used as a column header of a wide sheet is not listed here; the page handles those columns itself.

**Example.** A column headed "Latitude_dd" holds values from 54.1 to 54.9. The header is not an exact Darwin Core term, so the proposed latitude role is not confirmed. The finding lists "Latitude_dd" and asks to check it.

**What you can do.** Check the listed columns in the column table and correct a wrong role. Then accept once; the acceptance holds while the listed set does not grow. In /convert this warning must be accepted before the export.

## CONV-KEY-MIXED-NUMBERS — A column of the sample key mixes typed numbers and text that looks like a number

Severity: warning · Export policy: accept

**What it checks.** A column of the sample key mixes typed numbers and text that looks like a number. They are compared differently, so one sample may be split in two.

**When it fires.** Only for a picked key, for a key column that holds both real numbers and number-like text (date and time columns are not compared this way). A typed number is compared as a number, a text only as a whole number with an all-zero fraction, so 1.5 typed and 1.50 written are two values, while a typed 1 and the text 1 or 1.0 are the same. One finding per column shows the first pair, the typed value and the text.

**Example.** The key column "Station" holds the number 1.5 in some rows and the text "1.50" in others, from two sources pasted together. They count as two different codes, so the samples of that station may be split.

**What you can do.** Make the column uniform in the source (all numbers or all text), or accept if the samples are right as they are. In /convert this warning must be accepted once.

## CONV-KEY-TOO-LONG — An identifier made from the sample key the person picked (of a sample, a replicate or an occurrence) is longer than 255 characters

Severity: error · Export policy: block

**What it checks.** An identifier made from the sample key the person picked (of a sample, a replicate or an occurrence) is longer than 255 characters. A Darwin Core archive does not take identifiers that long, and the converter never shortens one.

**When it fires.** For every row whose generated ID is longer than the limit. One finding per sheet lists the lines, the longest length, the first 60 characters and the length of the name that starts every ID.

**Example.** The key joins six long text columns. On lines 30 to 35 the identifiers have 310 characters, and the finding quotes the first 60 of the longest.

**What you can do.** Pick fewer key columns, or columns with shorter values, or shorten the name in front of the IDs (the key prefix on the page, kept as sampleKeyPrefix). In /convert this finding blocks the export.

## CONV-KEY-PICKED — The sample code of every row is made of the columns the person picked

Severity: info · Export policy: show

**What it checks.** The sample code of every row is made of the columns the person picked. This note repeats the choice, so it is visible in the report: the columns, the number of samples, the number of rows and the name that starts every sample ID.

**When it fires.** Once per sheet whenever a sample key is in use, whether picked on the page or read from the companion file. Information only. A profile sheet never gets this note.

**Example.** The person picks Station and Date. The note says: samples 14, rows 112, every sample ID starts with the name of the file (the name of the sheet for a workbook), then come the two values.

**What you can do.** Nothing to answer. "Ask again" takes the choice back. A choice read from the companion file (sampleKey) holds only while the same columns and the same number of rows are found. In /convert this note is only shown.

## CONV-JOIN-PROPOSED — Another sheet seems to describe the samples of this results sheet and is linked to it by key columns

Severity: info · Export policy: show

**What it checks.** Another sheet seems to describe the samples of this results sheet and is linked to it by key columns. The converter shows how many samples it covers and joins nothing until the person confirms.

**When it fires.** When a sheet whose rows describe the samples of a results sheet is linked to it by a key, the description sheet holds at least half of the samples of the results sheet, the results sheet has a taxon and the description sheet has none (neither is a profile sheet), and the link is neither confirmed nor declined (sampleJoinNo). The note gives the number of samples found in the description sheet. A results sheet that already has a confirmed join gets no further proposal; the results side of the key is the picked sample key or a sample ID, station or cruise column.

**Example.** A results sheet has 40 samples by station and date, and a sheet "Stations" has a row for 38 of them. The note proposes the link and says 38 of 40 samples were found.

**What you can do.** Confirm or decline the join on the page (kept as sampleJoin, or sampleJoinNo for a refusal). In /convert this note is only shown; the export is not blocked by the proposal.

## CONV-JOIN-DESCRIPTION-LONG — A sheet that seems to describe the samples is in the long layout, one row per parameter, or was turned by the person

Severity: info · Export policy: show

**What it checks.** A sheet that seems to describe the samples is in the long layout, one row per parameter, or was turned by the person. Joining such a sheet is not supported yet.

**When it fires.** When the proposed description sheet (which holds at least half of the samples of the results sheet) was regrouped by the converter from a parameter column and a value column, or was turned by the person, instead of having one row per sample. It replaces CONV-JOIN-PROPOSED for such a sheet and has the same conditions (no confirmed or declined join, a results sheet with a taxon); a long-looking sheet that was neither regrouped nor turned gets CONV-JOIN-PROPOSED instead. Both sheets are then converted exactly as if there were no join.

**Example.** A sheet "Environment" has the columns Station, Parameter and Value, with several rows per station. It is linked to the results by Station, but cannot be joined.

**What you can do.** Reshape the description sheet to one row per sample if you want it joined. In /convert this note is only shown.

## CONV-JOIN-CONFLICT — The results sheet and the description sheet give a different value for the same thing in the same sample (for example the depth or a date)

Severity: error · Export policy: block

**What it checks.** The results sheet and the description sheet give a different value for the same thing in the same sample (for example the depth or a date). The converter does not choose between them.

**When it fires.** For each group of values (a quantity such as depth or date, with its columns in both sheets) that differs in at least one sample of a confirmed join. The finding gives the number of samples, the examples and how many are still undecided.

**Example.** Sample S12 has the depth 10 in the results sheet and 15 in the description sheet. The finding shows 15 / 10 and asks which value to take.

**What you can do.** Choose, on the page, a value for all samples at once, for each sample or for each pair of values (the choice for the whole group is kept as sampleJoinConflict). In /convert this finding blocks the export until every difference is decided.

## CONV-JOIN-CONFLICT-CHOSEN — The values of one quantity differed between the two sheets and the person decided which sheet to take

Severity: info · Export policy: show

**What it checks.** The values of one quantity differed between the two sheets and the person decided which sheet to take. This note reports how many samples took the description sheet and how many the results sheet.

**When it fires.** When a conflict group of a confirmed join has been answered. Information only.

**Example.** The depths differed in 6 samples. The person chose the description sheet for 4 of them and the results sheet for 2, and the note says so.

**What you can do.** Nothing to answer. "Ask again" takes the choice back. In /convert this note is only shown.

## CONV-JOIN-UNIT-DIFFERS — A quantity is in different units in the two joined sheets

Severity: error · Export policy: block

**What it checks.** A quantity is in different units in the two joined sheets. Such values can be neither compared nor exchanged, so the converter chooses nothing.

**When it fires.** When the columns holding the same quantity in the results and in the description sheet have different units, and the converter cannot convert one to the other: a depth in a unit it does not convert (for example centimetres), or another quantity with a unit of its own, such as a pressure in dbar in one sheet and bar in the other. Metres, feet, fathoms and kilometres of a depth are converted and do not raise it. The finding names both columns and both units.

**Example.** The results sheet has "Depth \[m\]" and the description sheet "Depth \[cm\]". The finding names both and blocks the merge.

**What you can do.** State the same unit in both sheets, or set one of the two columns to ignore. In /convert this finding blocks the export.

## CONV-JOIN-COLUMNS-DIFFER — The same quantity is held by different columns in the two joined sheets, so the columns cannot be paired one to one

Severity: error · Export policy: block

**What it checks.** The same quantity is held by different columns in the two joined sheets, so the columns cannot be paired one to one.

**When it fires.** When the results sheet and the description sheet hold a different set of columns of the same text role, such as station, cruise or sample code (not one against one, and not the same set). A date, a position or a depth held in different column structures is merged into resolved columns and does not raise it.

**Example.** The person gave two results columns (Station and Substation) the role station, and the description sheet has one Station column. The finding names both sets. (Left on the recognised roles, Substation is ignored and this is not raised.)

**What you can do.** Use the same columns in both sheets, or set the columns of one of the sheets to ignore. In /convert this finding blocks the export.

## CONV-JOIN-NO-DESCRIPTION — Some samples of the results sheet have no row in the description sheet

Severity: error · Export policy: block

**What it checks.** Some samples of the results sheet have no row in the description sheet. The converter will not invent a description for them.

**When it fires.** When a confirmed join leaves one or more results samples without a matching row (this includes results rows with a blank part of the key, named by their lines), and that has not been answered. The finding lists up to the first samples and, when the description sheet has samples without results, a few of them to show a near miss. When no key of the results sheet is in the description sheet at all, CONV-JOIN-NO-MATCH is raised instead. The description-only near miss is given only on the first results sheet that uses the description sheet.

**Example.** The results sheet has samples S1 to S40, and the description sheet lacks S39 and S40. The finding names both.

**What you can do.** Add the rows to the description sheet, or choose to convert those samples with only what the results sheet says (kept as sampleJoinResultsOnly, for the same count). In /convert this finding blocks the export until one of them is done.

## CONV-JOIN-NO-MATCH — No key of the results sheet is found in the description sheet, so the two sheets do not match at all

Severity: error · Export policy: block

**What it checks.** No key of the results sheet is found in the description sheet, so the two sheets do not match at all. This is almost always a wrong key column or a different way of writing the codes.

**When it fires.** When none of the keys of the results sheet is present in the description sheet. The finding gives examples from both sides and the key columns.

**Example.** The results use the codes S01 and S02, the description sheet the codes S1 and S2. No key matches, and the examples show it.

**What you can do.** Correct the key columns or the way the codes are written (O for 0, say). No "results only" answer is offered here. In /convert this finding blocks the export.

## CONV-JOIN-RESULTS-ONLY — The person chose to convert the samples that have no description with only what the results sheet says

Severity: info · Export policy: show

**What it checks.** The person chose to convert the samples that have no description with only what the results sheet says. This note lists them. Nothing is invented for them.

**When it fires.** When the answer "results only" is given for the samples without a row in the description sheet. It counts only for the same number of samples as now lack a description, and never when no key matches (then CONV-JOIN-NO-MATCH stands). Information only.

**Example.** Samples S39 and S40 have no description. The person chose to convert them from the results sheet only, and the note names both.

**What you can do.** Nothing to answer. "Ask again" takes the choice back. A choice read from the companion file (sampleJoinResultsOnly) holds only for the same number of samples. In /convert this note is only shown.

## CONV-JOIN-DESCRIPTION-ONLY — Some samples are described in the description sheet but have no results

Severity: warning · Export policy: accept

**What it checks.** Some samples are described in the description sheet but have no results. They are written as sample events with no occurrence.

**When it fires.** When a confirmed join finds a row in the description sheet whose key is in no row of the results sheet. The rows are appended only once per description sheet (for the first results sheet that uses it), and not for a key that another results sheet holds. Keys with several different rows go to CONV-JOIN-AMBIGUOUS, and when no key matches at all the finding is CONV-JOIN-NO-MATCH instead. The finding lists up to the first samples and, when the results sheet has samples without a description, a few of them to show a near miss.

**Example.** The description sheet lists station S41, but no results row carries S41. The sample S41 is written as an event with no occurrence.

**What you can do.** Accept once if it is right that these samples have no results, or remove the rows from the description sheet. In /convert this warning must be accepted before the export.

## CONV-JOIN-AMBIGUOUS — In the description sheet the same key occurs on several rows that differ in their values

Severity: error · Export policy: block

**What it checks.** In the description sheet the same key occurs on several rows that differ in their values. The converter does not choose one of the rows.

**When it fires.** For every key of the description sheet that appears more than once with different values and is used by a results row or would be appended. An ambiguous key that nothing uses is not reported. The finding lists the keys and the lines of the description sheet.

**Example.** The key S12 stands on lines 14 and 15 of the description sheet, with the depths 10 and 20.

**What you can do.** Keep one row per key value, or make the values of the repeated rows agree. In /convert this finding blocks the export.

## CONV-JOIN-KEY-BLANK — A part of the join key is blank in some rows, so no row of the other sheet can be found for them

Severity: error · Export policy: block

**What it checks.** A part of the join key is blank in some rows, so no row of the other sheet can be found for them.

**When it fires.** For every row of the results sheet (or of the description sheet, as the finding says) in which a column of the join key is empty. One finding per sheet lists the lines and the columns. The results-side finding is not raised once the "results only" answer is given for the same number of samples; a description row with every cell empty is skipped.

**Example.** The join key is station plus date, and lines 5 and 6 of the results sheet have a station but no date.

**What you can do.** Fill in the key in the file, or convert these rows with only what the results sheet says (the answer that also covers CONV-JOIN-RESULTS-ONLY). On the description side the rows are left out and listed. In /convert this finding blocks the export.

## CONV-JOIN-KEY-ROLE-LOST — A join the person confirmed is not applied, because a key column of it lost its key role after the confirmation

Severity: error · Export policy: block

**What it checks.** A join the person confirmed is not applied, because a key column of it lost its key role after the confirmation.

**When it fires.** When a confirmed join refers to a results column that no longer has a key role (it was given another meaning). Both sheets are then converted as without the join.

**Example.** The join was confirmed on the column "Station". Afterwards the person changed its meaning to Ignore, so the join is dropped.

**What you can do.** Give the column its key role back, or confirm the join again. In /convert this finding blocks the export.

## CONV-JOIN-FILLED — Blank cells of the results sheet were filled with the value of the same sample from the description sheet

Severity: info · Export policy: show

**What it checks.** Blank cells of the results sheet were filled with the value of the same sample from the description sheet. Only blank cells are filled; a value that exists is never replaced here.

**When it fires.** For each column of the results sheet that had blank cells filled by a confirmed join. Information only.

**Example.** The column "Depth" was blank for 3 samples in the results sheet, and the description sheet gave their depth. The note says 3 blank cells of Depth were filled.

**What you can do.** Nothing to answer. Check the filled values if the description sheet is not fully trusted. In /convert this note is only shown.

## CONV-ID-DUPLICATE — The same identifier is produced more than once

Severity: error · Export policy: block

**What it checks.** The same identifier is produced more than once. Identifiers of events, occurrences and measurements must be unique in a Darwin Core archive.

**When it fires.** For every identifier that two or more rows or columns would get: an event ID repeated between stations, a sample code equal to a station or cruise ID, two columns with the same header, rows of one sample with the same taxon (occurrence), or a level ID repeated on profile rows or equal to a sample, station or cruise ID. Findings are made per ID and place for events, per sheet for occurrences and per sheet and ID for levels. Each lists the lines, the number repeated and an example, with a hint for its kind.

**Example.** The sample code S1 occurs in station A and in station B. Both would get the eventID S1. The finding shows S1 and the lines.

**What you can do.** Change the repeated code or header, or give the rows an occurrenceID or life stage column, or, when codes repeat between stations, tick the station prefix (kept as stationPrefix). In /convert this finding blocks the export.

**Citations.**

- [OBIS obistools (R), R/check_eventids.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_eventids.R), check_eventids: "check duplicate eventIDs" (error: "eventID ... is duplicated"); "check if all parentEventIDs have corresponding eventID" (error: "parentEventID ... has no corresponding eventID")
- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Integrity checks: "Checks that occurrenceID is unique in the occurrence table" ... "The occurrenceID acts as the Primary Key for the occurrence table, therefore two records with the same occurrenceID cannot exist in the occurrence table."

## CONV-TAB-IN-VALUE — A value contains a tab or a line break

Severity: error · Export policy: block

**What it checks.** A value contains a tab or a line break. The archive files are tab-separated with one record per line, so such a value would break them.

**When it fires.** For every cell with a tab or a line break inside it: a data value, but also a header (a taxon header, a variable name or a unit), an abundance class label, the sampling device label, or a value typed on the page and written to an output table. One finding per column lists the lines and shows the first value with the character shown as a space. The export is blocked and nothing is written until the character is removed. Cells of a column that is not written (one set to ignore, such as a free remarks column) are not read.

**Example.** A station cell on line 18 holds two lines of text, 'north' and 'bay'. The finding names the column Station and quotes it as 'north bay'.

**What you can do.** Replace the character with a space in the sheet. In /convert this finding blocks the export.

**Citations.**

- [OBIS Manual, "Common data quality issues" (iobis/manual common_qc.md; manual.obis.org)](https://manual.obis.org/common_qc.html), "Hidden characters and non-breaking spaces": "a value like Abra alba containing a non-breaking space will not match the same name typed with a normal space"; "OBIS removes leading and trailing whitespace from values during processing, but does not change spaces inside a value"; "Other invisible characters, such as tabs, line breaks within a cell, and zero-width spaces (U+200B), can cause similar problems"

## CONV-TEXT-IN-TAXON-CELL — A cell of a taxon or quantity column holds text where a number is expected, and the converter does not know what it means

Severity: warning · Export policy: block

**What it checks.** A cell of a taxon or quantity column holds text where a number is expected, and the converter does not know what it means. No word is read as an absence by the tool.

**When it fires.** For each distinct text, case kept, found in cells of quantity columns that are not numbers. Empty cells and NA tokens are not asked, and nothing is asked on a presence-list sheet. The finding gives the text, the columns and the number of cells. Nothing is written for the cells until the question is answered.

**Example.** The column "Calanus" holds the text "not found" in 4 cells and numbers in the rest. The finding asks what "not found" means.

**What you can do.** Answer for the text: absence (read as 0, absent with the full species list tick, else left out), leave out (left out and listed), or present (an occurrence with the text in the remarks). The answer is kept per column and text (countTextAt), or one answer covers every text of a column (countTextColumn), in both cases for the same number of cells. In /convert the export waits for the answer.

## CONV-COUNT-TEXT-DECIDED — The person answered what a text in a quantity cell means

Severity: info · Export policy: show

**What it checks.** The person answered what a text in a quantity cell means. This note repeats the answer: absence, leave out, or present with the text in occurrenceRemarks.

**When it fires.** When a text found by CONV-TEXT-IN-TAXON-CELL has an answer, from the page or from the companion file. Information only. The answer holds for the number of cells it was given for.

**Example.** The text "not found" in 4 cells of the column Calanus was answered as absence, so the cells are read as 0.

**What you can do.** Nothing to answer. "Ask again" takes the answer back. In /convert this note is only shown.

## CONV-TAXON-SAME-EVENT — The same taxon appears more than once in one sample: the same name or WoRMS identifier, with the same life stage, sex and qualifier

Severity: warning · Export policy: accept

**What it checks.** The same taxon appears more than once in one sample: the same name or WoRMS identifier, with the same life stage, sex and qualifier. Each stays a separate record and nothing is summed.

**When it fires.** For every taxon (same name or AphiaID, life stage, sex and qualifier) that two or more columns or rows of one sample give with at least two distinct occurrence IDs, judged after the WoRMS lookup, so two spellings that resolved to one AphiaID are caught. Rows already reported as a repeated total or as the same value are left out. The finding names the columns and how the sheet writes the taxon.

**Example.** The columns "Acartia longiremis" and "Acartia longiremis (Lilljeborg)" both resolve to the same AphiaID, so station S3 gets the taxon twice.

**What you can do.** Check whether the columns should be one, and merge them in the file if so. Accept if two records are right. In /convert this warning must be accepted once.

## CONV-NA-SKIPPED — Cells marked NA (not available) in a taxon or quantity column were left out

Severity: info · Export policy: show

**What it checks.** Cells marked NA (not available) in a taxon or quantity column were left out. No data is neither a zero nor a presence, so such a cell makes no record, like an empty one.

**When it fires.** When a taxon or quantity column holds NA or a similar token in at least one cell: the cells are counted. On a long sheet it is also raised per row: a row with a taxon whose quantity cell is empty or NA and which has no biomass is counted as a row (a wholly empty quantity cell counts too), in the variants rows, rows-columns and rows-empty. Variant spellings of NA go to ROW-NA-VARIANT. Information only.

**Example.** Twelve cells of a count table hold NA, or twelve rows of a long sheet have a taxon and an empty quantity. No occurrence is written for them, and the note counts 12.

**What you can do.** Nothing to answer. If NA means a true zero, write 0 in the cell and tick the full species list. In /convert this note is only shown.

## CONV-QUANTITY-BLANK-KEPT — In a long sheet a row has a weight but a blank or NA quantity

Severity: warning · Export policy: accept

**What it checks.** In a long sheet a row has a weight but a blank or NA quantity. It is written as present with no count, and no number is invented.

**When it fires.** For every row with a taxon, an empty or missing-data quantity and a biomass value above zero. The row is written as an occurrence with occurrenceStatus present and its biomass; the weight shows the taxon was in the sample.

**Example.** Line 40 has the taxon Calanus, the count NA and the weight 0.8. It is written as present with a biomass of 0.8 and no count.

**What you can do.** If NA means not analysed, the taxon is not known to be present: correct those cells before the export. Otherwise accept. In /convert this warning must be accepted once.

**Citations.**

- [OBIS Manual, "How to format Occurrence tables" (manual.obis.org/format_occurrence.html; read 2026-10-29): occurrenceStatus is required, a quantity is not](https://manual.obis.org/format_occurrence.html), "These required data fields include the following eight terms: occurrenceID, eventID, ..., occurrenceStatus, basisOfRecord, scientificName, ..." (organismQuantity and organismQuantityType are not among them); "Add and fill basisOfRecord and occurrenceStatus fields"

## CONV-BIOMASS-UNIT-UNCLEAR — The unit of a weight column is missing or unclear, so the unit is left empty

Severity: warning · Export policy: accept

**What it checks.** The unit of a weight column is missing or unclear, so the unit is left empty. A partial or guessed unit would change the meaning of the number.

**When it fires.** Three cases. The header holds a mass unit not in brackets followed by words the converter does not understand (neither a per-area or per-volume part nor a kind of mass); the finding quotes the unrecognised rest. The header has no unit at all (variant none). Or one header names two different mass units (Weight kg g). Two columns that each have their own unit (Weight \[g\] and Weight \[kg\]) raise nothing: each keeps its unit. A unit in brackets or as a clear word of the name (weight_kg_total) also raises nothing. The lines are named.

**Example.** A header "Weight kg of the best sample" holds the unit kg and unclear words. measurementUnit is left empty. A header "Weight" with no unit raises the none variant, and one header "Weight kg g" raises the finding too.

**What you can do.** Put one unit in brackets in the header, for example \[kg/km2\], and load the file again. In /convert this warning must be accepted once.

## CONV-QUANTITY-REPEATED — A column looks like the total of a taxon in a sample, repeated on each size class row

Severity: error · Export policy: block

**What it checks.** A column looks like the total of a taxon in a sample, repeated on each size class row. Summed as it is, the number would be inflated by the number of size classes.

**When it fires.** When the value is the same on every row of at least 4 groups of rows that share sample, taxon, life stage and qualifier, those groups are at least half of the groups that count as evidence, and the column has at least 2 distinct values. A group counts as evidence only when its value is not smaller than the number of its rows (a count of 1 is not counted). The finding is not raised again after the answer one occurrence per sample and taxon (CONV-QUANTITY-REPEATED-ONCE instead) or after real counts held for the same number of rows (CONV-QUANTITY-REAL-COUNTS instead). The variants for a weight and for groups that disagree are raised even after that answer.

**Example.** A sheet has several samples, each with three size-class rows per taxon, and each row repeats the total of its taxon (120 in one sample, 80 in another). In at least 4 groups the sum would be three times the total. The finding names the column and the size column that differs.

**What you can do.** Choose to write one occurrence per sample and taxon (the button, kept as totalOnce and totalOnceGroups), or mark a column with the number of each size class as the quantity, or declare the equal quantities as real counts (realCountsRows). In /convert this finding blocks the export.

## CONV-QUANTITY-REPEATED-ONCE — As the person chose, a repeated total is written once per sample and taxon, and the later rows of each group are left out

Severity: warning · Export policy: accept

**What it checks.** As the person chose, a repeated total is written once per sample and taxon, and the later rows of each group are left out. The values that differ between the rows are not written on that occurrence.

**When it fires.** When the answer one occurrence per sample and taxon is applied to a sheet. The note gives the number of groups and of rows left out and lists the columns not written.

**Example.** 12 groups repeat a total on 3 size classes. 24 repeated rows are left out, and the size column is not written on the occurrence.

**What you can do.** Check the sum. Accept once, or undo the choice on the page. A group whose values differ raises the blocking CONV-QUANTITY-REPEATED variant disagree. In /convert this warning must be accepted once.

## CONV-QUANTITY-REAL-COUNTS — The person said that the equal quantities of the rows are real counts

Severity: info · Export policy: show

**What it checks.** The person said that the equal quantities of the rows are real counts. For this sheet, repeated totals and exact copies of rows are no longer looked for.

**When it fires.** When the answer real counts is given on the page or read from the companion file for a sheet where the rows repeat a total. The answer must be stored with its number of rows (realCountsRows); a bare realCounts raises nothing. Information only.

**Example.** The person said that the equal counts of 18 rows are real, so CONV-QUANTITY-REPEATED, CONV-QUANTITY-SAME-IN-SAMPLE and CONV-ROW-COPIES are off for the sheet.

**What you can do.** Nothing to answer. "Ask again" turns both checks back on. The saved answer (realCountsRows) holds only while the same number of rows is found. In /convert this note is only shown.

## CONV-COMPANION-OLD — The companion file holds answers in an old form, with no number of rows they were given for

Severity: info · Export policy: show

**What it checks.** The companion file holds answers in an old form, with no number of rows they were given for. They are read but not applied.

**When it fires.** When the companion file has the old settings realCounts, totalOnce or dropCopies without a count. Where they apply, the questions are asked again. Information only.

**Example.** A companion file from an earlier version holds realCounts=Samples. The note says 1 saved answer was not applied.

**What you can do.** Answer the questions again; the new answers are saved with their counts (realCountsRows, totalOnceGroups, dropCopiesRows). In /convert this note is only shown.

## CONV-ROW-COPIES — Some rows are exact copies of another row in every column but a per-row identifier, with a quantity above 1

Severity: error · Export policy: block

**What it checks.** Some rows are exact copies of another row in every column but a per-row identifier, with a quantity above 1. Written as they are, the quantity would be counted twice.

**When it fires.** For every row identical to an earlier one in every column but a per-row identifier, with a quantity above 1 for a count, above 0 for a density, a biomass or another quantity, or any identical row when the sheet is declared as its own records. The finding gives the sum of the quantity with the copies and without them. The sums are left out for a percent cover, an abundance class, or own records with no quantity column. Not raised once the copies have been left out (CONV-ROW-COPIES-DROPPED instead), kept as records (CONV-ROW-COPIES-KEPT instead) or declared real counts.

**Example.** Lines 30 and 31 are identical, with the count 14. With both the sum is 28, without the copy 14.

**What you can do.** Leave the copies out and list them in a file beside the archive (the button, kept as dropCopiesRows for the same number of copies), keep them as separate records (keepCopiesRows, only for own records), or correct the sheet. In /convert this finding blocks the export.

## CONV-ROW-COPIES-DROPPED — As the person chose, rows that are exact copies of an earlier row were left out, and are listed in the file beside the archive

Severity: warning · Export policy: accept

**What it checks.** As the person chose, rows that are exact copies of an earlier row were left out, and are listed in the file beside the archive.

**When it fires.** When the answer to leave out copies is applied. The note gives the number of rows and the sum of the quantity with and without them.

**Example.** 3 copies on lines 31, 55 and 56 were left out. The sum was 420 with them and 388 without them.

**What you can do.** Check that they really were copies. Accept once. In /convert this warning must be accepted once.

## CONV-ROW-COPIES-SPECIMENS — Some rows are identical to another row and have a count of 1

Severity: warning · Export policy: accept

**What it checks.** Some rows are identical to another row and have a count of 1. A table of single specimens looks exactly like this, so this note itself blocks nothing.

**When it fires.** For every row identical to an earlier one with a count of 1 when the sheet is not declared as its own records. The finding gives the sum as separate records and the sum if they were copies. Without an occurrenceID column the same rows also raise the blocking CONV-ID-DUPLICATE (copies variant); with a unique occurrenceID column only this note is raised. Not raised under held real counts, and the leave-out-copies answer does not apply to rows with a count of 1.

**Example.** Five rows read Calanus, size 2, count 1. As specimens the sum is 5, as copies of one record it is 1.

**What you can do.** Check which it is. Accept if they are separate specimens. In /convert this warning must be accepted once.

## CONV-ROW-COPIES-KEPT — The sheet is declared as each row its own record, and the person chose to keep identical rows as separate records

Severity: warning · Export policy: accept

**What it checks.** The sheet is declared as each row its own record, and the person chose to keep identical rows as separate records.

**When it fires.** When the answer to keep copies (keepCopiesRows) is applied and the same number of copies is found. Each row is written with an occurrenceID made of its source line.

**Example.** 4 identical rows on lines 12 to 15: the finding counts 3 copies (lines 13 to 15), and all four rows are written as separate records.

**What you can do.** Check that they are not copies. Accept once. In /convert this warning must be accepted once.

## CONV-OWN-RECORDS — The person declared that each row of a long sheet is its own record

Severity: warning · Export policy: accept

**What it checks.** The person declared that each row of a long sheet is its own record. The occurrenceID is the sample code and the line number in the file, so it changes when rows are inserted or deleted before a new version.

**When it fires.** Once per sheet declared this way (ownRecords, for the same number of rows), when the declaration is eligible (a long sheet with a taxon column, no occurrenceID column, no profile, pivot or turn) and rows are written. A row with no quantity column and no presence-only tick is one individual.

**Example.** A table of 240 measured fish, one per row, is declared this way. Fish on line 17 of sample S3 gets the occurrenceID S3:L17.

**What you can do.** Keep the order of the rows, or add an occurrenceID column. Accept once. In /convert this warning must be accepted once.

## CONV-ROW-NOT-UNDERSTOOD — Some rows of a sheet have no record because the converter could not place what they hold

Severity: error · Export policy: block

**What it checks.** Some rows of a sheet have no record because the converter could not place what they hold. Nothing is in the archive for them, and nothing is deleted from the file.

**When it fires.** Once per sheet and reason, when rows are not written for a reason that means the converter could not place the row (the reason and what it means are in the finding). Reasons that have a blocking rule of their own, such as a missing sample code, raise it only for lines that rule does not name. A row that no reason explains (a converter fault) blocks too. Every row not written is listed with its line, reason and cells.

**Example.** 5 rows of a long sheet have a count but no taxon name (reason no-taxon). The finding names the reason and the lines.

**What you can do.** Leave the rows out and list them in a file beside the archive (the button, kept as leaveOut for the same count and number of rows), or correct the file. Never prefilled. In /convert this finding blocks the export until you decide.

## CONV-ROW-LEFT-OUT — As the person chose, rows that could not be placed were left out of the archive and are listed in the file beside it

Severity: info · Export policy: show

**What it checks.** As the person chose, rows that could not be placed were left out of the archive and are listed in the file beside it. Nothing was deleted from the source.

**When it fires.** When the answer to leave out the rows of one reason is applied, from the page or the companion file (leaveOut). Information only. The answer holds only while the sheet has the same number of such rows as when it was given (a companion file also the same number of rows in all); with another number the question is asked again.

**Example.** 5 rows with a count but no taxon name were left out and listed.

**What you can do.** Nothing to answer. The question is asked again with the button, or when the sheet changes. In /convert this note is only shown.

## CONV-QUANTITY-SAME-IN-SAMPLE — Several rows of the same sample and taxon, which differ in some other column, carry the same quantity

Severity: warning · Export policy: accept

**What it checks.** Several rows of the same sample and taxon, which differ in some other column, carry the same quantity. It may be a total repeated on each row, or genuinely equal counts.

**When it fires.** For every group of at least 2 rows of one sample and taxon that differ in another column (a blank size, a stage, a sex, or a key column left out in a turned sheet) and carry the same value above 0, whatever the number of groups. For a count the shared value must be above 1: counts of 1 are not reported here, a density or a weight of 1 is. A repeated biomass weight is included. The finding gives the sum as separate records and the sum as one total.

**Example.** Sample S3 has three Calanus rows (sizes small, medium, large), each with 40. As three records the total is 120, as one repeated total it is 40.

**What you can do.** Check which it is and correct the sheet if the value is a repeated total. Accept if the counts are real. In /convert this warning must be accepted once. A systematic repeat is the blocking CONV-QUANTITY-REPEATED.

## CONV-TAXON-EMPTY-ROW — A row of a long sheet has a number or a weight but an empty taxon name

Severity: warning · Export policy: accept

**What it checks.** A row of a long sheet has a number or a weight but an empty taxon name. There is nothing to attach it to, so it is not converted.

**When it fires.** Superseded in /convert. The row is raised together with the fate no-taxon, and the question CONV-ROW-NOT-UNDERSTOOD (reason no-taxon) takes over the same lines, so this finding does not reach the report. For the rows with a quantity or a biomass and an empty taxon cell, the finding would list the lines and the column.

**Example.** Line 52 has the count 6 and no taxon; the question CONV-ROW-NOT-UNDERSTOOD (reason no-taxon) lists line 52 and this finding stays hidden.

**What you can do.** Leave the rows out and list them (leaveOut) when CONV-ROW-NOT-UNDERSTOOD asks, or type the taxon name in the sheet. The export is blocked until one of them is done.

## CONV-TIME-HOLDS-DATES — A column read as a time of day holds full dates, and no column is the date

Severity: error · Export policy: block

**What it checks.** A column read as a time of day holds full dates, and no column is the date. The events would have no eventDate, and a date that is in the file is never dropped silently.

**When it fires.** When the sheet has a time column and no date column, and half or more of the filled cells of the time column are dates: full dates, spreadsheet serials in a date-formatted column, or date-looking text that the date parser does not read. A year part column also counts as a date. Placeholder dates of a spreadsheet (1899-12-30) or an epoch (1970-01-01) are times and are not counted. It does not fire when the sheet has a date column, a combined date and time column or a year part column. A column of full datetimes is read as date and time by itself, so the finding appears only for a column the person set to time of day (or one with enough real times).

**Example.** The person gave the column "Time" the meaning time of day, but it holds 2024-05-03 10:15 in all rows, and no other column is a date.

**What you can do.** Give the column the meaning "Date and time" on the page. In /convert this finding blocks the export.

## CONV-TIME-SOME-DATES — A time column holds some full dates, fewer than half of its filled cells, and no column is the date

Severity: warning · Export policy: accept

**What it checks.** A time column holds some full dates, fewer than half of its filled cells, and no column is the date. Those dates will not reach eventDate.

**When it fires.** When the sheet has a time column and no date column, and fewer than half of the filled cells hold a date: a full date, a spreadsheet serial in a date-formatted column, or date-looking text that the parser does not read. Placeholder dates of a spreadsheet or an epoch are not counted.

**Example.** 3 cells of the column "Time" hold 2024-05-03 07:30 among times such as 07:30. The note names the lines.

**What you can do.** If they are the dates of the events, give the column the meaning "Date and time". Otherwise accept. In /convert this warning must be accepted once.

## CONV-DATE-ORDER-UNDECLARED — Dates such as 03/04/2024 can be read as day first or month first, and no date in the column decides it

Severity: error · Export policy: block

**What it checks.** Dates such as 03/04/2024 can be read as day first or month first, and no date in the column decides it. A day and a month are never guessed.

**When it fires.** For a date column (or a time column, or a date column of the sample key) whose cells have two parts of 1 to 12 that differ and no cell has a part above 12 to decide, with no day and month order declared. It also covers dates written NN-NN-NN with two-digit years when several readings are possible (variant two-digit-year). The finding shows the readings of the first cell.

**Example.** The cell 03/04/2024 reads as 3 April or as 4 March, and no cell of the column has a day above 12.

**What you can do.** Declare the order of the column on the page: day first (dmy) or month first (mdy), kept as dayMonthOrder for the same column and number of rows. For two-digit years declare year, month and day order with yyOrder (ymd, dmy or mdy). In /convert this finding blocks the export.

## CONV-DATE-ORDER-CONTRADICTED — The order declared for a date column is contradicted by its own unambiguous dates

Severity: error · Export policy: block

**What it checks.** The order declared for a date column is contradicted by its own unambiguous dates. A declaration decides only the cells that no date decides.

**When it fires.** When the declared day and month order differs from the order the clear dates of the column show (a day above 12 in a place where a month was declared, or both orders in one column). The variant two-digit-year is raised when the declared yyOrder is not among the readings of the NN-NN-NN cells.

**Example.** The order mdy is declared, but a cell reads 25/03/2024. The detected order is dmy.

**What you can do.** Correct the declaration or the dates. The declared order is not used. In /convert this finding blocks the export.

## CONV-DATE-ORDER-DECLARED — The day and month order declared for a date column was used for its ambiguous dates

Severity: info · Export policy: show

**What it checks.** The day and month order declared for a date column was used for its ambiguous dates. It applies to the date written, the date inside an identifier and the date compared in a join.

**When it fires.** When a declared order (dayMonthOrder, or yyOrder for NN-NN-NN dates) is applied to a column. Information only. It is said only when the declaration decided at least one ambiguous cell. If the clear dates of the column already show the same order, or no cell is ambiguous, nothing is said; if they show the other order, CONV-DATE-ORDER-CONTRADICTED is raised instead.

**Example.** The person declared day first for the column "Date", so 03/04/2024 is 3 April everywhere.

**What you can do.** Nothing to answer. "Ask again" takes the answer back. In /convert this note is only shown.

## CONV-DECIMAL-DECLARED — The comma in the numbers of a column was read as the person declared, a decimal comma or a thousands separator, everywhere the column is used

Severity: info · Export policy: show

**What it checks.** The comma in the numbers of a column was read as the person declared, a decimal comma or a thousands separator, everywhere the column is used.

**When it fires.** When a declared reading (decimalReading) is applied to a column that IN-DECIMAL-AMBIGUOUS asked about (a file with decimal commas, a column whose every comma value has three digits after the comma); a declaration for any other column is ignored. Under thousands every cell written n,nnn is read without its commas; under decimal the column is read as it was. Other columns are not affected. Information only.

**Example.** In a file that writes decimal commas (55,5), every comma value of the column "Count" is written n,nnn (1,250 and 2,000), so IN-DECIMAL-AMBIGUOUS asked; the person declared a thousands separator and 1,250 is read as 1250.

**What you can do.** Nothing to answer. "Ask again" takes the answer back. The saved answer holds only while the column and the same number of rows are found. In /convert this note is only shown.

## CONV-MISSING-CODE-DECLARED — Cells holding exactly -99, -999 or -9999 in a number column were handled as the person declared: as missing values or as real values

Severity: info · Export policy: show

**What it checks.** Cells holding exactly -99, -999 or -9999 in a number column were handled as the person declared: as missing values or as real values.

**When it fires.** When the answer to ROW-MISSING-CODE (missingCode) is applied to a column. Missing means the cells are left empty before the sheet is read and listed with the reason missing-code; real means they are written as they are. Other columns are not touched. It is raised for a column that holds at least one such cell; an answer given for a column without one says nothing.

**Example.** 4 cells of the column "Depth" hold -999, and the person answered missing. No depth is written for them.

**What you can do.** Nothing to answer. "Ask again" takes the answer back. In /convert this note is only shown.

## CONV-ENCODING-DECLARED — The bytes of the file are not UTF-8 and read differently in several code pages, so the person picked one

Severity: info · Export policy: show

**What it checks.** The bytes of the file are not UTF-8 and read differently in several code pages, so the person picked one. The whole file is read with it before any other step.

**When it fires.** When the answer to IN-ENCODING-AMBIGUOUS is applied. The pick is kept in the companion file as encoding, with a hash of the file bytes, and applies to a file with the same bytes only. Information only.

**Example.** The file read differently as windows-1250 and ISO-8859-2, and the person picked windows-1250, so the letters are read that way in the archive.

**What you can do.** Nothing to answer. "Ask again" takes the pick back. In /convert this note is only shown.

## CONV-ZERO-WITH-BIOMASS — A row of a long sheet has a quantity of 0 and a weight above zero

Severity: warning · Export policy: accept

**What it checks.** A row of a long sheet has a quantity of 0 and a weight above zero. The two contradict each other, and the row is left out, neither present nor absent.

**When it fires.** For every row with a taxon, the quantity 0 and a biomass above zero, whatever the full species list tick says. Its biomass is not written either.

**Example.** Line 60 has the count 0 and the weight 1.2 g. It is left out.

**What you can do.** Check which value is wrong and correct the sheet. In /convert this warning must be accepted once.

## CONV-SAMPLE-PER-ROW — A long sheet gives almost one sample event for each occurrence, and many events share station, date and depth

Severity: warning · Export policy: accept

**What it checks.** A long sheet gives almost one sample event for each occurrence, and many events share station, date and depth. It may be one sample cut into rows by a different code on each.

**When it fires.** For a long sheet without a profile when the output has at least 30 occurrences, the events are at least 80 percent of them, and at least 90 percent of the events have exactly one taxon row; without all three it never fires. Then one of two things is enough. Either at least half of the events share a place (cruise, station, date, time text, depth and position) with another event, where a place counts only when at most half of its events after the first repeat a taxon of an earlier event there; or there is strong evidence: more events than occurrences, on a sheet of at least two taxa, with the events at least 80 percent of the taxon rows. Checked on the output, whoever wrote the codes.

**Example.** 100 occurrences with 95 events, each event with one taxon row, 60 of which share station, date and depth with another event and do not repeat a taxon.

**What you can do.** Accept if these are real replicates. If one sample was cut into rows, use a code that names the sample (the sample key on the page). In /convert this warning must be accepted once.

**Citations.**

- [OBIS Manual, "How to format Occurrence tables" (manual.obis.org/format_occurrence.html; read 2026-10-26)](https://manual.obis.org/format_occurrence.html), "(remember that all OBIS data have at least one occurrence record associated, regardless of what organization structure you have chosen)"

## CONV-ZERO-SKIPPED — Zero cells were left out because the species list was not declared complete

Severity: info · Export policy: accept

**What it checks.** Zero cells were left out because the species list was not declared complete. A zero means absent only when every species of the list was looked for in the sample.

**When it fires.** When a numeric 0 is in a quantity cell and the full species list tick is off, which is the default. In a presence list the same holds for marks of absence such as "-" or "absent" (variant presence). An empty or NA cell never becomes a record either. A zero in a row of a long sheet that has a weight above zero belongs to CONV-ZERO-WITH-BIOMASS and is not counted here; a zero in a row with no taxon name is listed by CONV-ROW-NOT-UNDERSTOOD.

**Example.** 37 zeros in a count table were not converted, because the full list was not ticked.

**What you can do.** Tick the full species list (kept as fullList) if every species was looked for, and zeros become absent records. Otherwise accept once. In /convert this note must be accepted once.

**Citations.**

- [OBIS obis-qc (Python), obisqc/absence.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/absence.py), absence.py: ABSENT_VALUES = {"absent", "notDetected"}, PRESENT_VALUES = {"present", "detected"}; the status is compared in lower case; any other value: record.set_invalid("occurrenceStatus")

## CONV-SAMPLE-CONFLICT — The rows of one sample differ in a value that must be the same for the whole sample

Severity: error · Export policy: block

**What it checks.** The rows of one sample differ in a value that must be the same for the whole sample. A sample is one event, and the first row is not silently preferred.

**When it fires.** For every sample whose rows differ in a sample-level value such as position, date, depth, sample size, depth below the seafloor or a measured value. The finding names what differs, the sample and the lines. On a long sheet with a station column, rows of one sample code that differ in date or time are read as separate visits (CONV-ID-REVISIT) and do not raise this; a sample key declared on the page switches that reading off.

**Example.** Sample S5 has two rows (two taxa) with the depths 5 m and 10 m.

**What you can do.** Make the values equal in the source, or use a sample code that separates the samples. In /convert this finding blocks the export.

## CONV-REPLICATE-EVENTS — A column read as the replicate number makes replicate events under the sample events

Severity: info · Export policy: show

**What it checks.** A column read as the replicate number makes replicate events under the sample events.

**When it fires.** Once per sheet with a replicate column. The note gives the column and the number of replicate events.

**Example.** The column "Rep" with 1, 2 and 3 makes 3 replicate events under each sample.

**What you can do.** If these are not replicates, change the meaning of the column. In /convert this note is only shown.

## CONV-TAXON-ATTRIBUTE-IGNORED — Columns that give the same value for every row of one taxon (a species code, an identifier, a trophic group) are attributes of the taxon, not measurements, and were not written

Severity: info · Export policy: accept

**What it checks.** Columns that give the same value for every row of one taxon (a species code, an identifier, a trophic group) are attributes of the taxon, not measurements, and were not written.

**When it fires.** For a numeric column that the tool itself proposed to ignore, whose value is a function of the taxon column but varies between samples, with at least two values overall, no unit and no size word, and either a name that says code, id, tsn, key, serial or trophic, or when at least 3 taxa are listed more than once and cover half of all taxa. A text column is never listed, and a column the person set is not listed. Only for a long sheet with a taxon column; a wide sheet never raises it.

**Example.** A column "TSN" holds the same number on every row of one species and is not written.

**What you can do.** If it is a measurement, give the column a meaning. Otherwise accept once. In /convert this note must be accepted once.

## CONV-VALUE-PER-OCCURRENCE — Measured-variable columns are written on the occurrences of the rows, not on the sample

Severity: info · Export policy: show

**What it checks.** Measured-variable columns are written on the occurrences of the rows, not on the sample. Their values differ inside a sample like the values of single organisms.

**When it fires.** For measured-variable columns of a long sheet written as measurements of the occurrence of each row. The note lists the columns. Information only.

**Example.** The column "Length \[mm\]" differs on each fish row of a sample, so it is written on each occurrence.

**What you can do.** If the rows are really two samples under one code, untick "of each organism" on the column (kept as perOccurrence) and fix the sample code. In /convert this note is only shown.

## CONV-NERC-UNKNOWN — There is no confirmed NERC concept for a measured variable, so measurementTypeID stays empty

Severity: warning · Export policy: accept

**What it checks.** There is no confirmed NERC concept for a measured variable, so measurementTypeID stays empty. OBIS requires a vocabulary term there.

**When it fires.** For a measured-variable column, or the quantity column (an abundance class, or a density or biomass per area of the water column), for which no concept is confirmed. An identifier is written only when it was confirmed for that column; nothing is guessed. A quantity column cannot be confirmed in the table below the columns.

**Example.** A column "Temp" has no confirmed concept, so measurementTypeID is empty.

**What you can do.** Confirm or choose a concept in the table below the columns, optionally with the NVS search in English words such as temperature. Or choose it by hand before publishing. In /convert this warning must be accepted once.

**Citations.**

- [OBIS Manual, "Extended Measurement Or Fact" (manual.obis.org/format_emof.html; read 2026-10-25)](https://manual.obis.org/format_emof.html), "For measurementTypeID, measurementUnitID, and measurementValueID you must use controlled vocabulary terms."

## CONV-NERC-UNIT-MISMATCH — The confirmed concept of a column refers to a different basis, per unit mass or per unit volume, than the unit of the column

Severity: warning · Export policy: accept

**What it checks.** The confirmed concept of a column refers to a different basis, per unit mass or per unit volume, than the unit of the column.

**When it fires.** When the label of the confirmed P01 concept states a dimension that contradicts the dimension of the unit: per mass against per volume, or a percentage unit (%, percent, pct) against a concept that states any per-mass or per-volume dimension. The pair is the choice of the person and is written as confirmed; nothing is converted.

**Example.** A chlorophyll concept per unit volume is confirmed for a column with the unit mg/kg.

**What you can do.** Check that the concept and the unit belong together, and change one of them if not. In /convert this warning must be accepted once.

**Citations.**

- [OBIS Manual, "Extended Measurement Or Fact" (manual.obis.org/format_emof.html; read 2026-10-25)](https://manual.obis.org/format_emof.html), "For measurementTypeID, measurementUnitID, and measurementValueID you must use controlled vocabulary terms."

## CONV-NERC-CODE-MALFORMED — A header names a vocabulary code after an explicit SDN prefix, but the code is not of the shape of a code of that collection

Severity: warning · Export policy: accept

**What it checks.** A header names a vocabulary code after an explicit SDN prefix, but the code is not of the shape of a code of that collection. NVS has no such concept.

**When it fires.** When the code after SDN:collection:: is not the required number of capital letters and digits. No identifier is written from it; the column stays a measured variable.

**Example.** The header names SDN:P01::TEMPPR01X with one extra letter. The finding quotes the code and the required length.

**What you can do.** Check the code for a typo or an extra character, and correct the header. Or confirm a concept for the column. In /convert this warning must be accepted once.

**Citations.**

- [OBIS Manual, "Extended Measurement Or Fact" (manual.obis.org/format_emof.html; read 2026-10-25)](https://manual.obis.org/format_emof.html), "For measurementTypeID, measurementUnitID, and measurementValueID you must use controlled vocabulary terms."
- [NERC Vocabulary Server (NVS), collections P01 (BODC Parameter Usage Vocabulary) and P06 (BODC data storage units); read 2026-10-29](https://vocab.nerc.ac.uk/collection/P06/current/), Every concept of P06 has a four-character code (411 of 411 codes read, e.g. UPAA) and every concept of P01 an eight-character one (50 613 of 50 613 codes read, e.g. TEMPPR01; 66 begin with a digit); a code of another length has no concept page: https://vocab.nerc.ac.uk/collection/P01/current/D13CMOP11/ answers 404, https://vocab.nerc.ac.uk/collection/P01/current/D13CMOP1/ is a concept.

## CONV-UNIT-NO-P06 — There is no confirmed NERC unit concept (P06) for a unit, so measurementUnitID stays empty

Severity: warning · Export policy: accept

**What it checks.** There is no confirmed NERC unit concept (P06) for a unit, so measurementUnitID stays empty. The unit is written as given and not converted.

**When it fires.** For a unit with no confirmed P06 concept: the unit of a measured variable, the quantity unit, the biomass unit, the effort unit, or a pressure unit that is not decibars. An identifier is written only when the person confirmed it for that column; the units of the quantity, biomass and effort cannot be confirmed in the table below the columns.

**Example.** The unit "cells per ml" has no confirmed P06 concept, so it is written as text only.

**What you can do.** Confirm or choose a unit for the column in the table below the columns. In /convert this warning must be accepted once.

**Citations.**

- [OBIS Manual, "Extended Measurement Or Fact" (manual.obis.org/format_emof.html; read 2026-10-25)](https://manual.obis.org/format_emof.html), "For measurementTypeID, measurementUnitID, and measurementValueID you must use controlled vocabulary terms."

## CONV-COLUMN-UNNAMED — A column has no name in the header of the file, and its name would go into the archive as the name of a variable or a taxon

Severity: error · Export policy: block

**What it checks.** A column has no name in the header of the file, and its name would go into the archive as the name of a variable or a taxon.

**When it fires.** For a column to the right of the last named header cell (a blank cell in the middle of the header is left as it is) that is mapped as a variable still named Column N, or as a taxon header (IN-HEADER-SHORT). The internal name is Column N.

**Example.** The header names stop at the fourth column, the data rows hold numbers in a fifth column, and the person maps that column as a variable but leaves its name Column 5, so it would be written as a variable named Column 5.

**What you can do.** Type a name for the variable, or choose another meaning for the column, for example Ignore. In /convert this finding blocks the export.

## CONV-LONG-UNSUPPORTED — A sheet is in the long layout, a row per parameter, with a parameter column and a value column, and has no taxon and no quantity column

Severity: error · Export policy: block

**What it checks.** A sheet is in the long layout, a row per parameter, with a parameter column and a value column, and has no taxon and no quantity column. The converter cannot read it.

**When it fires.** When a header names a parameter and a value column, and the sheet has no taxon, quantity or other variable column, but cannot be read as a long one: fewer than two distinct parameters (one-parameter), more than 200 distinct parameter and unit pairs (too-many), or another reason. The finding gives the reason. A parameter or value column that the person mapped to another role also unblocks the sheet.

**Example.** A sheet has the columns Station, Parameter and Value, with only one distinct parameter. It cannot be read.

**What you can do.** For one parameter, or for too many pairs, split the sheet or keep only the needed parameters. Otherwise reshape it to one column per parameter, with the unit in the header (for example Temp \[degC\]), and load it again, or remap the parameter or value column. Or leave the sheet out. In /convert this finding blocks the export.

## CONV-SHEET-TRANSPOSED — The table looks transposed, with variables or species in rows

Severity: error · Export policy: block

**What it checks.** The table looks transposed, with variables or species in rows. Row 1 would be read as the header, so the sheet was not read.

**When it fires.** When variables are in rows, or when species are in rows: at least 3 Latin names make up at least 60 percent of the first column, there are at least 2 other headers, and at least 80 percent of the cells are numbers or marks (+, x, \*). A normal wide sheet with species as headers is never flagged. The sheet is not converted. Not raised for a profile sheet, a sheet turned with the turn button, a long sheet that was regrouped, or a sheet ticked "Read as a normal table".

**Example.** The first column lists species and the other columns are the samples S1, S2, S3.

**What you can do.** Transpose the table in your spreadsheet (samples in rows, species or variables in columns) and load it again, press the turn button on the page, or tick "Read as a normal table" for the sheet (kept as transposedAsTable). In /convert this finding blocks the export.

## CONV-SHEET-UNITS-ROW — The first row under the header looks like units (m, degC) but could not be folded into the header, so the sheet was not read

Severity: error · Export policy: block

**What it checks.** The first row under the header looks like units (m, degC) but could not be folded into the header, so the sheet was not read.

**When it fires.** Only when the units row could not be folded into the header: text or codes stand under some of the unit columns, or a row with a non-unit cell and at least two unit cells has numbers below. The clean case, units over numbers, is folded into the header silently and raises nothing. Not raised for a profile sheet, a turned sheet, a regrouped long sheet, or a sheet ticked "Read as a normal table"; at least two cells of the row must be units the converter knows (m, degC, PSU).

**Example.** Line 2 holds m, degC and the word note under the header Depth, Temp and Station, and numbers stand under Depth and Temp. The row is not folded, so it is reported.

**What you can do.** Write the units into the column names, for example "depth \[m\]", and load the file again, or tick "Read as a normal table" if the row is data (kept as transposedAsTable). In /convert this finding blocks the export.

## CONV-LONG-READ — A long environmental sheet, one row per measurement, was read as one row per sample

Severity: info · Export policy: show

**What it checks.** A long environmental sheet, one row per measurement, was read as one row per sample. The rows are only regrouped; no value is summed, averaged or rounded.

**When it fires.** When a sheet with a parameter column and a value column was regrouped; the regrouping is automatic. The note gives the number of samples and the parameter columns, one per parameter and unit, headed name \[unit\]. Information only.

**Example.** 120 rows with parameters Temperature and Salinity became 60 samples with two parameter columns.

**What you can do.** Nothing to answer. Check the parameter columns. To undo the regrouping, tick "read as a normal table" for the sheet (kept as longAsTable). In /convert this note is only shown.

## CONV-LONG-FLAG-COLUMNS — Quality-flag columns of a long sheet are left out of the sample key and are not written

Severity: info · Export policy: accept

**What it checks.** Quality-flag columns of a long sheet are left out of the sample key and are not written. A flag says how good a value is, not which sample it belongs to, so using it in the key would split one sample into several.

**When it fires.** Fires once per long sheet that has one or more columns the converter reads as quality flags by their name: a prefix Q_, QC_ or QF_, a suffix _QC, _QF, _flag, _flags or _quality, the words "quality flag", or "X QC", "X flag" or "Q X" where X is the header of another column of the sheet. A bare "flag" or "QC" is not read as a flag. The columns are left out by name, not by your answer. Raised for long sheets only.

**Example.** A long sheet has the columns Station, Date, Parameter, Value and Value_flag. Value_flag holds the letters G and B. The column is left out and named in the message.

**What you can do.** Nothing to answer. The outcome comes from a tool default, so it is accepted once before the export. If the column carries data you want in the archive, rename it in the file so that it no longer reads as a flag; the flag test runs before the roles, so a role cannot override it.

## CONV-LONG-FLAG-PARAMETERS — Rows of a long sheet whose parameter name reads as a quality flag are skipped

Severity: info · Export policy: accept

**What it checks.** Rows of a long sheet whose parameter name reads as a quality flag are skipped. A flag is not a measurement, so no column is made for it and nothing is written.

**When it fires.** Fires once per long sheet when one or more distinct parameter names read as flags (for example "Salinity flag" next to a Salinity column, or "Salinity_QC"). All rows with those names are skipped, and the message counts both the names and the rows.

**Example.** A long sheet has Parameter values Temperature, Salinity and Salinity flag. The 40 rows named Salinity flag are skipped; the other rows are converted.

**What you can do.** Nothing to answer. The rows are left out because of the parameter name, not by your answer, so the outcome is accepted once before the export. To keep such rows, rename the parameter in the sheet so it no longer reads as a flag.

## CONV-LONG-RENAMED — Two parameters of a long sheet would make two columns with the same header

Severity: info · Export policy: show

**What it checks.** Two parameters of a long sheet would make two columns with the same header. A header must be unique, so the converter adds a number in brackets to the repeated one and tells you which.

**When it fires.** Fires once per long sheet when a parameter column header equals the header of another column. The count is the number of renamed headers. Only the new header changes; the data does not. The comparison ignores case and covers the columns kept as the sample key and the parameter columns before it.

**Example.** A long sheet has a parameter called Depth and a column called Depth. The parameter column becomes Depth (2).

**What you can do.** Nothing to answer; the finding is only shown and never blocks the export. To avoid the number, rename one of the two in the sheet.

## CONV-LONG-DROPPED — Key columns of a long sheet that you marked as describing the measurement, not the sample, are left out of the sample key and their values are not written

Severity: info · Export policy: show

**What it checks.** Key columns of a long sheet that you marked as describing the measurement, not the sample, are left out of the sample key and their values are not written. The archive has no place for a value per measurement.

**When it fires.** Fires once per long sheet when at least one key column was marked by you as describing the measurement. It names the columns and counts them. It does not fire for columns left out by name (those are CONV-LONG-FLAG-COLUMNS).

**Example.** You marked the columns Analyst and Comment of a long sheet as describing the measurement. Their values are not in the archive and the message lists both.

**What you can do.** Nothing to answer; the finding is only shown. It follows from your own choice. To write the values, remove the tick in the panel "Columns that describe the measurement, not the sample" of the long sheet. Identity columns such as station, date, depth and position cannot be marked there.

## CONV-LONG-KEY-VARIES — Rows of a long sheet that share station, date and depth but differ in another column are read as different samples

Severity: warning · Export policy: accept

**What it checks.** Rows of a long sheet that share station, date and depth but differ in another column are read as different samples. If the difference only describes the measurement (a comment, an analyst), you would get several samples where there is one.

**When it fires.** Fires when rows that share every position and identity column (station, cruise, sample, date, time, depth, pressure, position) differ in one or more other columns. Once any column varies, every group of two or more rows with the same identity counts as a sample. The message names the columns and counts the samples.

**Example.** Two rows of Station A on 2024-05-01 at 10 m differ only in a Comment column ("clear" and "turbid"). They become two samples.

**What you can do.** If the column describes the measurement, tick it in the panel "Columns that describe the measurement, not the sample" of the long sheet: it leaves the key and is not written. If the samples really differ, accept the finding once. The split is a tool default, so the export needs the acceptance.

## CONV-LONG-DUPLICATE — One sample of a long sheet has the same parameter and unit on more than one row

Severity: error · Export policy: block

**What it checks.** One sample of a long sheet has the same parameter and unit on more than one row. The converter never sums or merges such rows, because it cannot know whether they are repeats, replicates or an error.

**When it fires.** Fires when rows agree on every column except parameter, unit, value and quality flag, and the parameter and unit repeat, whatever the values. The message lists the lines. It is not raised for rows you left out with the reason repeated-parameter.

**Example.** Station A, 2024-05-01, 10 m has two rows with the parameter Temperature, valued 11.2 and 11.4.

**What you can do.** Tell the samples apart in another column (cast, replicate, depth), or leave the repeated rows out and list them with the reason repeated-parameter; the first value is then written and the later ones are listed. The export is blocked until one of these is done.

## CONV-LONG-NO-PARAMETER — A row of a long sheet has a value and an empty parameter cell

Severity: error · Export policy: block

**What it checks.** A row of a long sheet has a value and an empty parameter cell. Without the name the converter cannot say what was measured, so nothing can be written for it.

**When it fires.** Fires when a row has a value and nothing in the parameter column. The message gives the count and the lines. It is not raised for rows you left out with the reason empty-parameter.

**Example.** Row 12 of a long sheet holds the value 7.9 and an empty Parameter cell.

**What you can do.** Type the parameter name in the sheet, or leave the rows out and list them with the reason empty-parameter. The export is blocked until one of these is done.

## CONV-TURN-HEADER-BLANK — In a turned sheet (its samples are the columns) the header of each sample column becomes the sample code

Severity: error · Export policy: block

**What it checks.** In a turned sheet (its samples are the columns) the header of each sample column becomes the sample code. A column with values and an empty header has no code.

**When it fires.** Fires on a sheet declared as turned when one or more columns right of the name column hold values and have a blank header. Those columns are not turned. Columns declared as not samples are never checked, so a blank header there raises nothing.

**Example.** A turned sheet has the headers Name, S1, S2 and an empty header above a third column of numbers.

**What you can do.** Type the header in the sheet, or declare the column as not a sample in the turned-sheet form (setting turned=\<sheet\>:\<nameHash\>:\<rows\>:\<notSampleHashes\>). The export is blocked until then.

## CONV-TURN-HEADER-REPEATED — In a turned sheet two sample columns with the same header would get the same sample code

Severity: error · Export policy: block

**What it checks.** In a turned sheet two sample columns with the same header would get the same sample code. The converter does not choose between them.

**When it fires.** Fires when the trimmed header is used by two or more columns right of the name column. None of those columns is turned. Columns declared as not samples are left out of the count. The message names the header and the columns.

**Example.** A turned sheet has the headers Name, S1, S1, S2. The header S1 is on two columns.

**What you can do.** Make the headers different in the sheet, or declare the extra columns as not samples in the turned-sheet form (the notSampleHashes part of turned=...). The export is blocked until then.

## CONV-TURN-NAME-BLANK — In a turned sheet each source row becomes a column named by the name column

Severity: error · Export policy: block

**What it checks.** In a turned sheet each source row becomes a column named by the name column. A row with values and no name cannot become a column.

**When it fires.** Fires when a source row of a turned sheet holds a value in any other column (a unit or label column counts) and nothing in the name column. The rows are listed with the reason turn-no-name.

**Example.** A turned sheet has a row with the values 3 and 5 under S1 and S2 and an empty name cell.

**What you can do.** Type the names in the sheet, or leave the rows out and list them with the reason turn-no-name. The export is blocked until then.

## CONV-TURN-NAME-REPEATED — In a turned sheet a row name must be unique, because it becomes a column name

Severity: error · Export policy: block

**What it checks.** In a turned sheet a row name must be unique, because it becomes a column name. A name is data, so the converter never renames it to make it unique.

**When it fires.** Fires when the trimmed, case-blind name is used by two or more source rows, or equals a column the turn adds: Sample always, and Date only when the sheet is turned with dated headers (turned=...:dates). None of those rows is turned. The message names the name and the lines.

**Example.** A turned sheet has two rows named Temperature, or one row named Sample.

**What you can do.** Make the names distinct in the file, or leave the rows out and list them with the reason turn-name-repeated. The export is blocked until then.

## CONV-SHEET-TURNED — Reports that a sheet was turned as you declared: named rows became columns and sample columns became rows

Severity: info · Export policy: show

**What it checks.** Reports that a sheet was turned as you declared: named rows became columns and sample columns became rows. Every cell is unchanged. It lets you check the counts.

**When it fires.** Fires once for each sheet declared as turned. It gives the number of rows that became columns and the number of sample columns that became rows. Information only.

**Example.** A sheet with 6 named rows and 12 sample columns is turned into a sheet of 12 samples with 6 columns.

**What you can do.** Nothing to answer; the finding is only shown and never blocks. To undo it, remove the turned declaration (setting turned=\<sheet\>:...).

## CONV-DEPTH-UNIT — Darwin Core depth is in metres

Severity: error · Export policy: block

**What it checks.** Darwin Core depth is in metres. A depth column with another unit cannot be written unless the converter has an exact factor for it.

**When it fires.** Fires when a depth column states a unit that is not metres and not one of the converted units (fathom, foot, km). A centimetre depth is usually a depth in sediment and blocks too. Nothing is written from the column. It also fires when the header gives fathom, foot or km together with other words (Depth_ft_corrected) or with a second unit (Depth (m or ft)); only a unit that ends the name or is followed by min, max, top, bottom, mean and the like is converted.

**Example.** A depth column is headed "Depth (cm)" in a water-column sheet.

**What you can do.** Give metres, or correct the unit in the header of the column. For a depth in sediment choose the meaning "Depth below seafloor". The export is blocked until then.

**Citations.**

- [Darwin Core term list (dwc.tdwg.org/terms: minimumDepthInMeters, maximumDepthInMeters, verbatimDepth)](https://dwc.tdwg.org/terms/#dwc:minimumDepthInMeters), "The lesser depth of a range of depth below the local surface, in meters." / verbatimDepth: "The original description of the depth below the local surface."

## CONV-DEPTH-CONVERTED — A depth in fathoms, feet or km was converted to metres with an exact factor

Severity: warning · Export policy: accept

**What it checks.** A depth in fathoms, feet or km was converted to metres with an exact factor. The original text is kept in verbatimDepth. You confirm that the unit in the header is right.

**When it fires.** Fires once per depth column (plain, minimum or maximum) that has the unit fathom (fm), foot (ft) or km and at least one numeric cell. The arithmetic is exact, on the digits of the cell. The message shows the factor and one example.

**Example.** A depth column headed "Depth (ft)" holds the number 10. It is written as 3.048 m and verbatimDepth keeps "10 ft".

**What you can do.** Check the unit in the header. Accept the conversion once before the export; the outcome is a tool step, not your answer. If the unit is wrong, correct it in the header of the column.

**Citations.**

- [Darwin Core term list (dwc.tdwg.org/terms: minimumDepthInMeters, maximumDepthInMeters, verbatimDepth)](https://dwc.tdwg.org/terms/#dwc:minimumDepthInMeters), "The lesser depth of a range of depth below the local surface, in meters." / verbatimDepth: "The original description of the depth below the local surface."

## CONV-SEAFLOOR-UNIT — A column with the meaning "Depth below seafloor" can be converted only from centimetres or metres

Severity: error · Export policy: block

**What it checks.** A column with the meaning "Depth below seafloor" can be converted only from centimetres or metres. Another unit has no exact factor here.

**When it fires.** Fires when the unit of such a column is neither cm nor m, or when it states no unit. Nothing is written from the column.

**Example.** A depth-below-seafloor column has the unit "inch".

**What you can do.** Set the unit in the header of the column to cm or m. The export is blocked until then.

**Citations.**

- [OBIS Manual, "Darwin Core" (manual.obis.org/darwin_core.html; read 2026-10-26) and the Darwin Core term list (dwc.tdwg.org/terms; minimumDistanceAboveSurfaceInMeters)](https://manual.obis.org/darwin_core.html), "This can be especially useful for sediment cores taken from the sea bottom ... In these cases the minimumDistanceAboveSurfaceInMeters / maximumDistanceAboveSurfaceInMeters would be a negative value."

## CONV-SEAFLOOR-VALUE — Values of a depth-below-seafloor column are shifted from cm to m on their text, exactly

Severity: error · Export policy: block

**What it checks.** Values of a depth-below-seafloor column are shifted from cm to m on their text, exactly. A cell that is not a plain decimal number cannot be shifted.

**When it fires.** Fires when a cell is not a plain decimal number, for example one with an exponent (1e2) or with degrees (notation). The message names the reason, one example and the lines. The cells are not written.

**Example.** A depth-below-seafloor column holds "1.2e1" in line 7.

**What you can do.** Retype the cells as plain decimal numbers in the sheet. The export is blocked until then.

**Citations.**

- [OBIS Manual, "Darwin Core" (manual.obis.org/darwin_core.html; read 2026-10-26) and the Darwin Core term list (dwc.tdwg.org/terms; minimumDistanceAboveSurfaceInMeters)](https://manual.obis.org/darwin_core.html), "This can be especially useful for sediment cores taken from the sea bottom ... In these cases the minimumDistanceAboveSurfaceInMeters / maximumDistanceAboveSurfaceInMeters would be a negative value."

## CONV-SEAFLOOR-SIGNS — In a depth-below-seafloor column most cells have one sign

Severity: warning · Export policy: accept

**What it checks.** In a depth-below-seafloor column most cells have one sign. Cells with the opposite sign are written on the other side of the seafloor. You confirm the direction.

**When it fires.** Fires when some cells have the sign that most cells do not have. The direction is proposed from the majority of signs (negative numbers in the majority mean counted upwards from the seafloor); you can change it. On a tie the positive cells count as the minority. The opposite cells are written as a distance above or below the seafloor (positive above, negative below).

**Example.** Of 50 values, 48 are negative (below) and 2 are positive. The 2 are written as above the seafloor.

**What you can do.** Check the direction. Change it with the "Positive direction" (downwards or upwards) selector of the role of the column, or correct the signs in the sheet. Otherwise accept once before the export.

**Citations.**

- [OBIS Manual, "Darwin Core" (manual.obis.org/darwin_core.html; read 2026-10-26) and the Darwin Core term list (dwc.tdwg.org/terms; minimumDistanceAboveSurfaceInMeters)](https://manual.obis.org/darwin_core.html), "This can be especially useful for sediment cores taken from the sea bottom ... In these cases the minimumDistanceAboveSurfaceInMeters / maximumDistanceAboveSurfaceInMeters would be a negative value."

## CONV-SEAFLOOR-NO-SITE-DEPTH — A depth below the seafloor needs the water depth of the site

Severity: warning · Export policy: accept

**What it checks.** A depth below the seafloor needs the water depth of the site. Without it Darwin Core measures from the elevation reference, not from the seafloor.

**When it fires.** Fires when rows have a depth below the seafloor and no minimum or maximum depth in metres. The message counts the rows and gives the lines.

**Example.** A sheet has a sediment depth column and no column with the depth of the water.

**What you can do.** Add the water depth of the site in metres and give it the meaning "Depth", or accept once that it is missing.

**Citations.**

- [OBIS Manual, "Darwin Core" (manual.obis.org/darwin_core.html; read 2026-10-26) and the Darwin Core term list (dwc.tdwg.org/terms; minimumDistanceAboveSurfaceInMeters)](https://manual.obis.org/darwin_core.html), "This can be especially useful for sediment cores taken from the sea bottom ... In these cases the minimumDistanceAboveSurfaceInMeters / maximumDistanceAboveSurfaceInMeters would be a negative value."
- [PANGAEA Wiki, "Geocode" (page version oldid=17007, last edited 2026-06-11; read 2026-11-02)](https://wiki.pangaea.de/wiki/Geocode), section "Third spatial dimension (Depth/Height) (z)": "DEPTH, sediment/rock \[m\] for geological, geochemistry, biogeochemisty, paleontological, geophysical measurements and samples. Describing the specific sampling depth in the sediment core"; "DEPTH, water \[m\] ... This GEOCODE describes the water depth in which the measurement or sample was collected"

## CONV-NO-OCCURRENCES — OBIS publishes species records

Severity: error · Export policy: block

**What it checks.** OBIS publishes species records. An archive with no occurrence record is not an OBIS dataset, however much environmental data it holds.

**When it fires.** Fires when the conversion produced zero occurrence records. A profile sheet with only levels and measurements gives none. It does not fire when a taxon sheet still waits for the kind of number (CONV-QUANTITY-UNDECLARED, CONV-TAXON-NO-QUANTITY, CONV-SPECIES-LIST-NO-COUNTS), or when every sheet is environmental only (CONV-ENV-ONLY-SHEET). It does fire, with its own wording, when all counts are 0 (tick the full species list) or when the quantity column is blank in every taxon row.

**Example.** The upload is a single profile sheet of temperature and salinity levels with no taxon sheet.

**What you can do.** Add a sheet with taxa (species names with counts or presence). The export is blocked until at least one occurrence exists.

**Citations.**

- [OBIS Manual, "How to format Occurrence tables" (manual.obis.org/format_occurrence.html; read 2026-10-26)](https://manual.obis.org/format_occurrence.html), "(remember that all OBIS data have at least one occurrence record associated, regardless of what organization structure you have chosen)"

## CONV-PROFILE-NOTHING-READ — A sheet marked as a profile file must give at least one profile level

Severity: error · Export policy: block

**What it checks.** A sheet marked as a profile file must give at least one profile level. Marking a sheet that has none produces an empty result.

**When it fires.** Fires when the sheet is marked as a profile file and yielded zero levels. The message gives the number of data rows.

**Example.** A sheet that only describes columns is marked as a profile file; its 8 data rows give no level.

**What you can do.** Unmark the profile file (do not set profile= for the sheet), or give the sheet a station column, depth or measured columns and rows with values. The export is blocked until then.

## CONV-STATION-FROM-POSITION — A sheet without a station column can treat each distinct position as a station

Severity: info · Export policy: show

**What it checks.** A sheet without a station column can treat each distinct position as a station. The station ID is made of the cruise code and the position as written.

**When it fires.** Fires when the sheet has no station column and you ticked "each distinct position is a station". It gives the number of stations and the first one. Only a profile sheet (CTD-style) is affected by the tick; other sheets without a station column are not.

**Example.** Three distinct latitude and longitude pairs give three stations, the first named CR1:54.1_18.5.

**What you can do.** Nothing to answer; the finding is only shown. It reports your own choice. Untick it on the sheet form to undo.

## CONV-EFFORT-INVALID — A sample-size column must hold a positive number in each row, because sampleSizeValue needs one

Severity: error · Export policy: block

**What it checks.** A sample-size column must hold a positive number in each row, because sampleSizeValue needs one.

**When it fires.** Fires when cells of the sample-size column are empty, zero or not a number. The message gives the count, the lines and one example. A negative value is reported by CONV-NEGATIVE-QUANTITY instead.

**Example.** The sample-size column holds 0.5, 0 and "n/a" in three rows. Two rows are refused.

**What you can do.** Fill the column with positive numbers, or set the sample size to one constant in the sheet form. The export is blocked until then.

## CONV-EFFORT-VALUE-INVALID — A sample size typed in the sheet form must be a plain positive number with at most one decimal mark

Severity: error · Export policy: block

**What it checks.** A sample size typed in the sheet form must be a plain positive number with at most one decimal mark.

**When it fires.** Fires when the typed value is refused for one of these reasons: not a number, not above zero, ambiguous (more than one separator) or thousands (a pattern such as 1,234). No effort is written.

**Example.** You type "1,234" as the sample size. It is refused as thousands.

**What you can do.** Type a number above zero, with a point or a comma as the decimal mark, or clear the field. The export is blocked until then.

## CONV-NO-TAXON — The converter needs a taxon and a quantity to make occurrences

Severity: error · Export policy: block

**What it checks.** The converter needs a taxon and a quantity to make occurrences. A sheet with no column marked as taxon has nothing to name them with.

**When it fires.** Fires when no column has the taxon role: for a wide sheet no taxon header columns, for a long sheet no taxon column. A long sheet with a taxon column and no quantity gets CONV-SPECIES-LIST-NO-COUNTS or CONV-TAXON-NO-QUANTITY instead. A sheet that holds only measured variables is reported as CONV-ENV-ONLY-SHEET instead, and nothing is raised when the presence tick or an own count applies.

**Example.** A wide sheet has only the columns Station, Date and Notes, with no measured variable and no species.

**What you can do.** Give the taxon columns (wide) or the taxon column (long) the taxon role in the role selector of the mapping editor, and declare the quantity. The export is blocked until then.

## CONV-SPECIES-LIST-NO-COUNTS — A long sheet has a taxon column and no numbers

Severity: error · Export policy: block

**What it checks.** A long sheet has a taxon column and no numbers. It may be a list of species found. The converter does not guess that, because no count means nothing is quantified.

**When it fires.** Fires on a long sheet with a taxon column, no quantity column and no measured-variable column (with a measured variable it is CONV-TAXON-NO-QUANTITY). It replaces CONV-NO-TAXON, CONV-QUANTITY-UNDECLARED and CONV-NO-OCCURRENCES for that sheet. Not raised when the presence tick is set or the sheet has its own count column.

**Example.** A sheet lists Station A with the species Mytilus edulis and Macoma balthica, and nothing else.

**What you can do.** Tick "This is a list of species found (presence only, no counts)" for the sheet (companion setting presenceOnly=\<sheet\>); each row then becomes a present occurrence with no quantity. Or tick "each row is its own record", or add a quantity column and declare it. The export is blocked until then.

**Citations.**

- [OBIS Manual, "How to format Occurrence tables" (manual.obis.org/format_occurrence.html; read 2026-10-29): occurrenceStatus is required, a quantity is not](https://manual.obis.org/format_occurrence.html), "These required data fields include the following eight terms: occurrenceID, eventID, ..., occurrenceStatus, basisOfRecord, scientificName, ..." (organismQuantity and organismQuantityType are not among them); "Add and fill basisOfRecord and occurrenceStatus fields"

## CONV-PRESENCE-VALUE — In a species list ticked as presence only, a wide cell is read as a mark

Severity: error · Export policy: block

**What it checks.** In a species list ticked as presence only, a wide cell is read as a mark. A value that is not a mark is not guessed.

**When it fires.** Fires when a cell holds anything else than a mark or empty: for example a number above 1, a negative number or other text. Marks are x, X, +, \*, a tick, 1, yes, y, tak, ja, oui, present and similar. Absence marks (0, -, absent, no, nie, nein, non) are never an error: they write an absence only when the full-species-list tick is set, otherwise the cell is skipped. 0 and 1 are read as numbers, so 1.0 is a presence. A blank cell or NA is read as absent and does not fire.

**Example.** A cell holds 12 in a sheet ticked as presence only.

**What you can do.** Correct the cell to a mark or empty, or untick presence only for the sheet and declare what the numbers are. The export is blocked until then.

**Citations.**

- [OBIS Manual, "How to format Occurrence tables" (manual.obis.org/format_occurrence.html; read 2026-10-29): occurrenceStatus is required, a quantity is not](https://manual.obis.org/format_occurrence.html), "These required data fields include the following eight terms: occurrenceID, eventID, ..., occurrenceStatus, basisOfRecord, scientificName, ..." (organismQuantity and organismQuantityType are not among them); "Add and fill basisOfRecord and occurrenceStatus fields"

## CONV-TAXON-NO-QUANTITY — A long sheet has a taxon column and other measured columns but no quantity column

Severity: error · Export policy: block

**What it checks.** A long sheet has a taxon column and other measured columns but no quantity column. The converter cannot tell what the numbers count.

**When it fires.** Fires on a long sheet with a taxon column, measured variable columns and no quantity column. It replaces CONV-NO-TAXON, CONV-QUANTITY-UNDECLARED and CONV-NO-OCCURRENCES for that sheet. A sheet with no numbers at all gets CONV-SPECIES-LIST-NO-COUNTS. Not raised when the presence tick or an own count column applies.

**Example.** A long sheet has Taxon, Station and Temperature, but no Count or Biomass column.

**What you can do.** Mark the column with counts, density or biomass as the quantity, or add one; or press "each row is its own record" on the finding, or tick presence only for the sheet (presenceOnly=\<sheet\>). The sheet is not converted and the export is blocked until then.

## CONV-ENV-ONLY-SHEET — A sheet of measured variables with no taxon cannot make occurrences

Severity: error · Export policy: block

**What it checks.** A sheet of measured variables with no taxon cannot make occurrences. OBIS needs species records.

**When it fires.** Fires when the sheet has measured variable columns and no taxon, quantity or unconfirmed taxon candidate. It replaces CONV-NO-TAXON, CONV-QUANTITY-UNDECLARED and CONV-NO-OCCURRENCES for that sheet. A profile sheet keeps CONV-NO-OCCURRENCES.

**Example.** A sheet has Station, Date, Temperature and Salinity only.

**What you can do.** If a column holds species names, mark it as the taxon. Otherwise add a sheet with species. The export is blocked until then.

## CONV-SUMMARY-ROW-UNDECIDED — A row that reads like a total or a statistic is not a sample

Severity: warning · Export policy: block

**What it checks.** A row that reads like a total or a statistic is not a sample. The converter holds it back and asks, because a station really called Total or Somme is a real station.

**When it fires.** Fires when a row with no date or position has a total word (total, suma, razem, summe, gesamt, somme) or an unambiguous statistics label (mean, average, median, sd and similar) as the whole cell, even alone. The label is read in the sample-code column, or in the station column only when the sample code is blank or itself a label. A short code (n, se, cv, min, max, count) joins only inside a block of two or more label rows that holds an unambiguous label; alone, or in a block of short codes only, it gives CONV-SUMMARY-ROW-KEPT instead.

**Example.** Three rows at the end of a sheet are labelled Mean, SD and Total, with no date or position.

**What you can do.** Answer for the sheet: "leave them out (summary rows)" or "keep (a real station or sample)", saved as summaryRows=\<leave-out|keep\>:\<count\>:\<rows\>:\<sheet\>. The answer holds for the same number of rows; a different number asks again. The export is blocked until you answer.

## CONV-SUMMARY-ROW-SKIPPED — Reports the rows you answered for after CONV-SUMMARY-ROW-UNDECIDED: left out as summary rows or kept as real samples

Severity: info · Export policy: show

**What it checks.** Reports the rows you answered for after CONV-SUMMARY-ROW-UNDECIDED: left out as summary rows or kept as real samples.

**When it fires.** Fires when the question was answered for this number of rows. With leave-out the rows are not converted and are listed among the rows not written with the reason summary-row. With keep they are read like any other row.

**Example.** You answered "leave out" for the two rows Mean and SD. They are in the list of rows not written.

**What you can do.** Nothing to answer; the finding is only shown. "Ask again" takes the answer back (it removes summaryRows= for the sheet).

## CONV-SUMMARY-ROW-KEPT — A row whose code is a short ambiguous label standing alone is kept as a sample, because it may be a real station

Severity: warning · Export policy: accept

**What it checks.** A row whose code is a short ambiguous label standing alone is kept as a sample, because it may be a real station. You are told so, in case it is not.

**When it fires.** Fires for a sample code that is n, se, cv, min, max or count (a compass point such as N counts too), with no date and no position, when it stands alone or in a block of such short codes only; a block that holds an unambiguous label such as Mean gives CONV-SUMMARY-ROW-UNDECIDED. The station column is read only when the sample code is blank or itself a label. The row is converted.

**Example.** One row has the sample code "n" with no date or position, in a sheet with no other label rows.

**What you can do.** If it is a real station, accept once. If it is not, correct the sheet and load it again. The outcome is a tool default, so the export needs the acceptance.

## CONV-ID-REVISIT — The same sample code at one station on rows that differ in date, time or depth is read as separate visits

Severity: warning · Export policy: accept

**What it checks.** The same sample code at one station on rows that differ in date, time or depth is read as separate visits. Each visit gets its own event whose ID is made of the data.

**When it fires.** Fires when a sample code repeats at one station and the rows differ in the fewest of date, time and depth that tell them apart (a long sheet never uses depth). The ID is \<station\>:\<date\>\[T\<time\>\]\[:\<depth\>m\]:\<code\>. Rows identical in all of these stay a real duplicate (CONV-ID-DUPLICATE). The same code at another station is not a revisit. Not applied when you picked a sample key.

**Example.** Sample code S1 appears at Station A on 2024-05-01 and on 2024-06-01. The two visits become two events.

**What you can do.** Check that the rows really are different visits and not a mistyped value. Accept once before the export, because the ID is made of the data.

## CONV-REPLICATE-MISSING — A replicate event gets the ID \<sample event\>:\<replicate\>

Severity: error · Export policy: block

**What it checks.** A replicate event gets the ID \<sample event\>:\<replicate\>. A row with no replicate value would get the ID of the sample itself.

**When it fires.** Fires when a sheet has a column with the replicate or sub-sample role and some rows have no value in it. Those rows are not converted.

**Example.** A Replicate column holds 1, 2 and an empty cell in three rows of one sample.

**What you can do.** Fill the column, or give it another meaning (for example Ignore) if it does not number replicates. The export is blocked until then.

## CONV-BIOMASS-KIND-UNSET — Wet, dry and ash-free dry mass have different NERC concepts

Severity: warning · Export policy: accept

**What it checks.** Wet, dry and ash-free dry mass have different NERC concepts. If the kind of biomass is not known, the value is written with no measurementTypeID.

**When it fires.** Fires when a biomass or weight column is written with measurementType biomass and the header names no kind and you chose none. The concepts are wet S0600088, dry S0600087 and ash-free dry S0600086. There is no default. It is raised only on a long sheet, and only for rows where the taxon is present and the biomass cell holds a number.

**Example.** A long sheet has a Species column, an Abundance column and a column headed "Biomass" with weights of 226.5, 124 and 36, and no word like wet, dry or AFDW in the header.

**What you can do.** Choose the kind in the role list of the column (companion setting biomassBasis=\<basis\>:\<sheet\> with wet, dry or afdw), or accept once that no identifier is written.

## CONV-EML-MISSING — The dataset description (eml.xml and the datasetName and institutionCode columns) must be complete, or OBIS and BioCheck reject the archive

Severity: error · Export policy: block

**What it checks.** The dataset description (eml.xml and the datasetName and institutionCode columns) must be complete, or OBIS and BioCheck reject the archive.

**When it fires.** Fires when one or more of these are missing or unusable: title, abstract, creator, contact name, contact email, institution code, dataset name. The message lists the fields.

**Example.** The form has a title and an abstract but no contact email.

**What you can do.** Fill the listed fields on the dataset description form. The export is blocked until then.

## CONV-LICENCE-UNSET — The licence is written only from an explicit choice

Severity: error · Export policy: block

**What it checks.** The licence is written only from an explicit choice. The rights holder decides, and the tool assumes nothing.

**When it fires.** Fires when no licence is chosen. The offered ones are CC0-1.0, CC-BY-4.0 and CC-BY-NC-4.0.

**Example.** The licence field of the dataset form is left empty.

**What you can do.** Choose one of the three licences on the dataset form. The export is blocked until then.

## CONV-BASIS-UNSET — basisOfRecord is written on every occurrence and depends on what was actually collected

Severity: error · Export policy: block

**What it checks.** basisOfRecord is written on every occurrence and depends on what was actually collected. HumanObservation, PreservedSpecimen and MaterialSample mean different things, so there is no default.

**When it fires.** Fires when basisOfRecord is not chosen on the dataset form.

**Example.** The kind of record field is left on "choose".

**What you can do.** Choose the kind of record on the dataset form. The export is blocked until then.

## CONV-EMOF-ORPHAN — Every measurement must refer to an event or occurrence that exists in the archive

Severity: error · Export policy: block

**What it checks.** Every measurement must refer to an event or occurrence that exists in the archive. One that does not would be rejected.

**When it fires.** Fires when an eMoF row names an event or occurrence ID that is not in the table. The message gives the count, the kind and one example.

**Example.** A measurement row names occurrenceID occ-77 and the occurrence table has no such row.

**What you can do.** Correct the sheet so the measurement keeps its event or occurrence, and convert again. The export is blocked until then.

## CONV-EMOF-EVENT-MISMATCH — A measurement of an occurrence must sit in the event of that occurrence

Severity: error · Export policy: block

**What it checks.** A measurement of an occurrence must sit in the event of that occurrence.

**When it fires.** Fires when an eMoF row has an eventID different from the eventID of the occurrence it names. The message gives the count and one example occurrenceID.

**Example.** Occurrence occ-3 belongs to event E1, but its measurement row names event E2.

**What you can do.** Correct the sheet so the measurement and the occurrence share an event, and convert again. The export is blocked until then.

## CONV-EMOF-VALUE-EMPTY — A measurement without a value says nothing, and the archive would be rejected

Severity: error · Export policy: block

**What it checks.** A measurement without a value says nothing, and the archive would be rejected.

**When it fires.** Fires when an eMoF row has an empty measurementValue. The message gives the count and the lines.

**Example.** A measurement row has the type "temperature" and an empty value.

**What you can do.** Fill the value in the sheet or remove the row, and convert again. The export is blocked until then.

## CONV-EMOF-TYPE-EMPTY — A measurement needs a kind (measurementType) so it is known what was measured

Severity: error · Export policy: block

**What it checks.** A measurement needs a kind (measurementType) so it is known what was measured.

**When it fires.** Fires when an eMoF row has an empty measurementType. The type is the label of the verified NERC concept, or the meaning you declared.

**Example.** A measurement row of the export model has an empty type text. A sheet column never makes one: a column with no verified concept is written with its header as the type and raises CONV-NERC-UNKNOWN.

**What you can do.** Declare what the numbers of the column mean, in the quantity declaration form or by the role of the column. The export is blocked until then.

## CONV-COLUMN-NOT-EXPORTED — Columns with data that the conversion does not read as the sheet is set up are not written

Severity: warning · Export policy: accept

**What it checks.** Columns with data that the conversion does not read as the sheet is set up are not written. You are told which, so nothing disappears silently.

**When it fires.** Fires for columns with a role that is not read here (a pressure outside a profile file, a second column of a role read once, a role of the other sheet shape, the quantity type, a sample-size column when the sample size is not set to a column), for a column with data and an empty header (shown as its letter in brackets), and for a column the tool left on ignore that holds data and has a quantity-like header (for example Biomass \[g\] next to a count) on a sheet that is not a profile sheet. A column you set to ignore is CONV-COLUMN-IGNORED instead.

**Example.** A long sheet has a Count column as the quantity and a column "Biomass \[g\]" left on ignore by the tool that holds numbers: the biomass column is named.

**What you can do.** Give the column a meaning that is read, or accept once that it is not written. The export needs the acceptance.

## CONV-COLUMN-IGNORED — Names the columns with values that you set to ignore, so it is clear they are not in the archive

Severity: info · Export policy: show

**What it checks.** Names the columns with values that you set to ignore, so it is clear they are not in the archive.

**When it fires.** Fires when a column holds at least one value and you set its role to ignore (or you set an empty-header column to ignore). A column the converter proposed as ignore is CONV-COLUMN-IGNORED-PROPOSED.

**Example.** You set the column Remarks, which holds text, to ignore.

**What you can do.** Nothing to answer; the finding is only shown and never blocks. If a column carries data the archive should have, give it a meaning.

## CONV-COLUMN-IGNORED-PROPOSED — Names the columns with values that the converter proposed to ignore and you did not change, so nothing of them is written

Severity: info · Export policy: accept

**What it checks.** Names the columns with values that the converter proposed to ignore and you did not change, so nothing of them is written.

**When it fires.** Fires when a column holds at least one value and has the role ignore because the converter proposed it (for example a Cast, Layer or Replicate column that does not separate rows). The file is not changed.

**Example.** A Cast column holds 1 on every row. The converter proposed ignore and you left it.

**What you can do.** Give the column a meaning, or accept once. The outcome is a tool default, so the export needs the acceptance.

## CONV-COLUMN-YEAR-IGNORED — A numeric column that always equals the year of the row date is a year beside the date, not a measurement

Severity: info · Export policy: accept

**What it checks.** A numeric column that always equals the year of the row date is a year beside the date, not a measurement. It is proposed as ignore.

**When it fires.** Fires when a column the proposer would read as a measured variable holds whole years from 1800 to 2100 that equal the year of the date of the same row, on at least 3 rows with both filled. The first 500 rows are read, and the sheet must have a matching date column. Raised on a long sheet (one row per taxon and sample); on a sheet with one column per taxon a Year column of whole years is ignored for its values and reported as CONV-COLUMN-IGNORED-PROPOSED.

**Example.** On a long sheet with a Species column, a column Year holds 2023 on every row, and the Date column also has 2023.

**What you can do.** If it is a measurement, give it that role back with one click. If it is the sampling year of rows without a date, give it the meaning date. Otherwise accept once.

## CONV-COLUMN-NUMBER-IGNORED — A column of whole numbers that only rise or fall, or run one value per sample, is a counter or a sample number, not a measurement

Severity: warning · Export policy: accept

**What it checks.** A column of whole numbers that only rise or fall, or run one value per sample, is a counter or a sample number, not a measurement. It is proposed as ignore.

**When it fires.** Fires when a column the proposer would read as a measured variable holds at least 3 whole numbers of six or more digits, all different and strictly rising or falling, or constant within a sample and strictly monotone across samples. The first 500 rows are read. Not raised on a long sheet with a taxon column and no quantity, where the column may be the counts. A column of dates written YYYYMMDD gets a hint to give it the meaning date.

**Example.** A column holds 100234, 100235, 100236 down the rows.

**What you can do.** If it is a measurement, give it that role back with one click; if it is a date as YYYYMMDD, give it the meaning date. Otherwise accept once.

## CONV-NAMEID-MISSING — Occurrences with no scientificNameID are reported as missing by OBIS and BioCheck

Severity: warning · Export policy: accept

**What it checks.** Occurrences with no scientificNameID are reported as missing by OBIS and BioCheck. The ID is never guessed.

**When it fires.** Fires when at least one occurrence has no scientificNameID. An ID is written only from a column you marked (a scientificNameID column, or an AphiaID column as a WoRMS LSID) or from a WoRMS result you confirmed.

**Example.** Twelve occurrences have a name and no ID column and no WoRMS lookup was done.

**What you can do.** Tick the WoRMS option (a companion row worms=yes only pre-ticks it; nothing is sent until you press Look up), and confirm each undecided result; or mark a column holding the IDs (scientificNameID or AphiaID). Otherwise accept once.

## CONV-WORMS-UNDECIDED — A WoRMS result that is not a single exact match is not accepted automatically

Severity: error · Export policy: block

**What it checks.** A WoRMS result that is not a single exact match is not accepted automatically. You choose a result or "no ID" for each name.

**When it fires.** Fires when a looked-up name has a near or phonetic match, a genus-only match, an exact match under another name, several results or a deleted record, and you have not chosen. Only exactly one result with match_type exact under the name sent is automatic.

**Example.** The name "Macoma balthica" returns two records.

**What you can do.** For each name choose one of the results or "no ID" on the page. The export is blocked until every name is decided.

**Citations.**

- [OBIS Manual, "Match Taxonomic Names" (manual.obis.org/name_matching.html; read 2026-10-25)](https://manual.obis.org/name_matching.html), "WoRMS also identifies ambiguous matches, indicating that several potential matching options are available (e.g. homonyms). You can check these ambiguous matches and select the correct one"

## CONV-WORMS-NO-MATCH — A name that WoRMS does not know keeps an empty scientificNameID, which OBIS and BioCheck report as missing

Severity: warning · Export policy: accept

**What it checks.** A name that WoRMS does not know keeps an empty scientificNameID, which OBIS and BioCheck report as missing.

**When it fires.** Fires when the lookup returns no record for a name (an empty result, or HTTP 204 for a whole batch). The message names the names. A name the user set to no ID on the page, and a name that has a taxon ID from the sheet on any row, does not fire.

**Example.** The invented name "Zzyxia novella" has no near record in WoRMS and returns nothing. A near misspelling of a real name returns a near match instead (CONV-WORMS-UNDECIDED).

**What you can do.** Check the spelling, or write to WoRMS if the taxon is new. Otherwise accept once; the ID stays empty.

**Citations.**

- [OBIS Manual, "Match Taxonomic Names" (manual.obis.org/name_matching.html; read 2026-10-25)](https://manual.obis.org/name_matching.html), "WoRMS also identifies ambiguous matches, indicating that several potential matching options are available (e.g. homonyms). You can check these ambiguous matches and select the correct one"

## CONV-WORMS-NOT-MARINE — A confirmed name whose WoRMS record is freshwater or terrestrial only may be the wrong taxon in a marine dataset

Severity: warning · Export policy: accept

**What it checks.** A confirmed name whose WoRMS record is freshwater or terrestrial only may be the wrong taxon in a marine dataset.

**When it fires.** Fires when the record has isMarine and isBrackish unset and isFreshwater or isTerrestrial set. A record with no habitat flag at all is unknown and does not fire. The ID is written as confirmed.

**Example.** A confirmed name whose WoRMS record has isMarine 0, isBrackish 0, isFreshwater 0 and isTerrestrial 1 (a land animal). A freshwater crustacean that WoRMS also flags as brackish, like Daphnia magna, does not fire.

**What you can do.** Check that these are the right taxa. Accept once; the IDs are written as confirmed.

## CONV-NAMEID-INCOMPLETE — A name that has an ID on some rows of the sheet and none on others is incomplete

Severity: warning · Export policy: accept

**What it checks.** A name that has an ID on some rows of the sheet and none on others is incomplete. The rows without an ID stay without one.

**When it fires.** Fires when a name has a taxon ID on some rows and none on others. A name with a sheet ID on any row is never sent to WoRMS and never given a WoRMS ID.

**Example.** The name Macoma balthica has an ID on 5 rows and an empty cell on 2.

**What you can do.** Complete the IDs in the sheet, or accept once.

## CONV-NAMEID-CONFLICT — A name with more than one distinct taxon ID in the sheet may be a mistake or two taxa sharing a name (homonyms)

Severity: warning · Export policy: accept

**What it checks.** A name with more than one distinct taxon ID in the sheet may be a mistake or two taxa sharing a name (homonyms). Nothing is changed.

**When it fires.** Fires when a name has two or more distinct scientificNameID values in the sheet. Each row keeps its own ID.

**Example.** The name Cancer has the IDs 1001 and 1002 on different rows.

**What you can do.** Check that they are different taxa. If not, correct the sheet. Accept once to export as it is.

## CONV-NO-SAMPLING-DESCRIPTOR — BioCheck wants a sampling descriptor or effort in the measurement table: a sample size or a mesh size

Severity: warning · Export policy: accept

**What it checks.** BioCheck wants a sampling descriptor or effort in the measurement table: a sample size or a mesh size.

**When it fires.** Fires only when the archive has an eMoF table and no row of it has a BODC effort code. A sample size is written as VOLWBSMP or AREABEDS, a mesh size as MSHSIZE1.

**Example.** The eMoF table holds only temperature rows.

**What you can do.** Give the sample size or the mesh size in the sheet form, or accept once.

**Citations.**

- [EMODnet Biocheck (R), R/checkdataset.R lines 562-566 and data/BODCeffort (master 701e6e7, 2026-10-08)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/R/checkdataset.R), if (sum(grepl(paste(BODCeffort, collapse="|"), unique(eMoF$measurementTypeID))) == 0) -\> level "warning", field "measurementType", message "No sampling descriptors/effort present"

## CONV-DEVICE-MISSING — BioCheck reports "No sampling instrument present" when no sampling device is given

Severity: warning · Export policy: accept

**What it checks.** BioCheck reports "No sampling instrument present" when no sampling device is given. The device is written as the measurement NMSPINST.

**When it fires.** Fires when no sampling device is chosen for the sheet, so no NMSPINST row is written. Profile sheets are not judged, and a sheet with no sample written does not fire; an own-text device of only spaces counts as missing.

**Example.** The device field of the sheet form is empty.

**What you can do.** Choose the device in the sheet form (a known one, or other text), or accept once that it is missing.

## CONV-MESH-INVALID — A mesh size is written as MSHSIZE1 in micrometres

Severity: error · Export policy: block

**What it checks.** A mesh size is written as MSHSIZE1 in micrometres. It must be a plain number above zero.

**When it fires.** Fires when the typed mesh size is refused, for example text, a number with a unit, zero, a negative number, a number with more than one point or comma, or a pattern such as 1,500 or 12.345 that could be a thousands separator. The message gives the reason.

**Example.** You type "200 um" in the mesh size field.

**What you can do.** Type the size in micrometres as a plain number (200), or leave it empty. The export is blocked until then.

## CONV-NAMEID-APHIA-LIKE — A column of whole numbers marked by hand as the taxon ID looks like WoRMS AphiaIDs, but the header does not say so

Severity: warning · Export policy: accept

**What it checks.** A column of whole numbers marked by hand as the taxon ID looks like WoRMS AphiaIDs, but the header does not say so. The values are written as given, not as WoRMS LSIDs.

**When it fires.** Fires on a long sheet when a column has the taxon ID role, every filled cell is a positive whole number and the header is none of AphiaID, aphia_id, Aphia ID.

**Example.** A column headed "Code" holds 127160 and 140480.

**What you can do.** Rename the header to AphiaID to have the values written as WoRMS LSIDs, or accept once to write them as given.

## CONV-LICENCE-DIFFERS — The licence you chose differs from the one your dropped metadata files state

Severity: warning · Export policy: accept

**What it checks.** The licence you chose differs from the one your dropped metadata files state. The archive would carry a licence different from its source.

**When it fires.** Fires when a licence is chosen, at least one file states a recognised licence, and the choice is not among them. If the files disagree, it fires when the choice differs from at least one of them. Nothing fires when no licence is chosen (CONV-LICENCE-UNSET speaks).

**Example.** The metadata file says CC-BY-4.0 and you chose CC0-1.0.

**What you can do.** Accept this only if the rights holder has decided it. Otherwise change the licence on the dataset form.

## CONV-PROFILE-STATION-UNMATCHED — A profile station is matched to a biology station by exact text

Severity: warning · Export policy: accept

**What it checks.** A profile station is matched to a biology station by exact text. A profile station with no match becomes a station event of its own.

**When it fires.** Fires when a station of the profile sheet matches no station of the biology sheets. The match is exact on the trimmed station text, and on the cruise when the sheet gives one. Exception: with the option to ignore a trailing cast number ticked, a station that ends in -N and has exactly one biology station with that name without -N is matched (CONV-PROFILE-STATION-CAST-MATCHED) and is not listed here.

**Example.** The profile sheet has the station "St 5" and the biology sheet has "St5".

**What you can do.** Correct the spelling, tick "Match the stations ignoring a trailing cast number (-N)" if the profile names end in a cast number, or accept once if no biology was sampled there.

## CONV-PROFILE-STATION-FAR — Two samplings at one station are close together

Severity: warning · Export policy: accept

**What it checks.** Two samplings at one station are close together. A matched profile station far from its biology station may be a wrong match.

**When it fires.** Fires when a matched profile station lies more than 10 km (great-circle distance) from the biology station. The position of a profile station is that of its first level with one; that of a biology station is its first sample with one. The same fact is not also raised as ROW-STATION-SPREAD-\* for that station.

**Example.** The profile station "St 5" is 35 km from the biology station "St 5".

**What you can do.** Accept once if it is the same station, or correct the match.

## CONV-PROFILE-STATION-CAST-MATCHED — Reports the profile stations matched to a biology station by ignoring the cast number at the end of the name, as you allowed

Severity: info · Export policy: show

**What it checks.** Reports the profile stations matched to a biology station by ignoring the cast number at the end of the name, as you allowed.

**When it fires.** Fires when the ignore-cast option is ticked for the sheet and at least one station was matched that way. A profile station matches only when its name ends in "-" and digits and exactly one biology station has the name without them; otherwise it stays unmatched. The message lists each pair as profile station and biology station.

**Example.** The profile station "St5-02" is matched to the biology station "St5".

**What you can do.** Nothing to accept; the finding is only shown. Check each pair. A pair farther apart than the limit also raises CONV-PROFILE-STATION-FAR. To undo, remove profileIgnoreCast=\<sheet\>.

## CONV-PANGAEA-NAMES-FALLBACK — In a PANGAEA file the parameter list in the header gives the long names of the columns

Severity: info · Export policy: show

**What it checks.** In a PANGAEA file the parameter list in the header gives the long names of the columns. If it does not fit the columns, the table-header abbreviations are used as taxon names, and an abbreviation can stand for two taxa.

**When it fires.** Fires on a wide sheet of a PANGAEA file with at least one taxon column when the Parameter block of the header does not match the table columns (another number of parameters than of table columns without the event columns, an abbreviation that is not what the column header starts with, or a parameter with no abbreviation), or when the header has no Parameter block at all.

**Example.** The header lists 12 parameters and the table has 11 columns.

**What you can do.** Nothing to accept; the finding is only shown. Check the taxon names in the list.

## CONV-PROFILE-LEVEL-INCOMPLETE — Every event without children needs a date and a position in OBIS and BioCheck

Severity: error · Export policy: block

**What it checks.** Every event without children needs a date and a position in OBIS and BioCheck. A profile level takes them from its station, never from further up.

**When it fires.** Fires when profile levels have no date or no position of their own and their station has none to give. A level never takes it from the cruise or from another station.

**Example.** A profile sheet has depths and temperatures but no date column, and no biology sheet has the station.

**What you can do.** Add a date or position column to the sheet, or add this station to the biology sheets. The export is blocked until then.

## CONV-PROFILE-PRESSURE-NO-UNIT — A pressure column with no unit is written without a unit, and level IDs cannot be made from it because they need decibars

Severity: warning · Export policy: accept

**What it checks.** A pressure column with no unit is written without a unit, and level IDs cannot be made from it because they need decibars.

**When it fires.** Fires when the pressure column of a profile sheet states no unit and at least one pressure value is written.

**Example.** A column headed "Pressure" with no unit in the name or in the unit field.

**What you can do.** Give the column a unit (for example dbar in its name or in the unit field), or accept once to export without a unit.

## CONV-POSITION-NONE — Every sample needs a latitude and a longitude, on itself or on a parent

Severity: error · Export policy: block

**What it checks.** Every sample needs a latitude and a longitude, on itself or on a parent.

**When it fires.** Fires when samples have no position and the sheet has no column mapped as latitude or longitude, or only one of them. A mapped column that is blank in every row gives the empty-column variant. The empty decimalLatitude and decimalLongitude of the output are not repeated. Not raised when any sample of the sheet already has a position (a mapped column with values in both, a joined sheet, a declared position), nor for a profile sheet, nor when a declared position is refused: that refusal is the only message.

**Example.** A wide sheet has Sample, Station, Date and one column per species, with no position columns and no joined sheet.

**What you can do.** Mark the latitude and longitude columns, join the sheet that describes the samples, or, only when the sheet has no latitude or longitude column at all, declare one position for the sheet (declaredPosition=\<lat\>:\<lon\>:\<uncertainty\>:\<rows\>:\<sheet\>); with one of the two columns marked the declaration is refused. Profile sheets are not covered. The export is blocked until then.

## CONV-POSITION-DECLARED — A position you declared for the whole sheet is written on its samples, although the file does not state it

Severity: warning · Export policy: accept

**What it checks.** A position you declared for the whole sheet is written on its samples, although the file does not state it. The archive says so.

**When it fires.** Fires when a declared position is applied. It is written on every sample event, with georeferenceRemarks saying it was declared by the person converting the data. It is never inferred, and only applied to a sheet with no latitude or longitude role.

**Example.** You declare 10.5, 20.5 with an uncertainty of 500 m for a sheet of 20 samples.

**What you can do.** Check the position and accept once. To change it, edit the declaration in the sheet form; it is saved in the companion file as declaredPosition=\<lat\>:\<lon\>:\<uncertainty\>:\<rows\>:\<sheet\>.

## CONV-POSITION-DECLARED-INVALID — A declared position that cannot be used is not applied, and nothing is written from it

Severity: error · Export policy: block

**What it checks.** A declared position that cannot be used is not applied, and nothing is written from it.

**When it fires.** Fires for one of these reasons: latitude not a number or outside -90 to 90, longitude not a number or outside -180 to 180, uncertainty not a plain number above zero, position-role (the sheet has a latitude or longitude column, even a blank one; a declaration never fills gaps), position-joined (the joined description sheet gives positions) or profile (a profile sheet takes positions from its own columns; raised for profile sheets too).

**Example.** You declare latitude 95 for a sheet.

**What you can do.** Correct the declaration or remove it. For the last three reasons remove the declaration: the positions come from the own columns of the sheet, the joined sheet or the profile levels. The export is blocked until then.

## CONV-DATE-DECLARED — A date you declared for the whole sheet is written on its samples, although the file does not state it

Severity: warning · Export policy: accept

**What it checks.** A date you declared for the whole sheet is written on its samples, although the file does not state it. The archive says so.

**When it fires.** Fires when a declared date or interval is applied. It is written as eventDate on every sample event, with eventRemarks and a line in the EML methods. It is never inferred, and only applied to a sheet on which no sample has a date. An interval over one year is marked long.

**Example.** You declare 2019-06 for a sheet of 12 samples.

**What you can do.** Check the date and accept once. To change it, edit the declaration in the sheet form; it is saved as declaredDate=\<value\>:\<rows\>:\<sheet\>.

## CONV-DATE-DECLARED-HELD — A date saved in the companion file no longer fits the sheet, so it is not applied

Severity: warning · Export policy: accept

**What it checks.** A date saved in the companion file no longer fits the sheet, so it is not applied. It does not block.

**When it fires.** Fires when a saved declaredDate cannot be applied for one of these reasons: some-dated (a sample now has a date; a date column counts when it holds at least one non-blank cell), date-joined (the joined description sheet gives dates), date-turned (a turned sheet has dates in its rows or columns) or profile (a profile sheet takes dates from its own columns).

**Example.** The companion file holds declaredDate=2019:30:Sheet1, but Sheet1 now has a date column.

**What you can do.** Accept once, or undo the declaration in the sheet form. The answer holds only for the same sheet name and row count.

## CONV-DATE-DECLARED-INVALID — A declared date that cannot be used is not applied, and nothing is written from it

Severity: error · Export policy: block

**What it checks.** A declared date that cannot be used is not applied, and nothing is written from it.

**When it fires.** Fires for one of these reasons: format (not YYYY, YYYY-MM, YYYY-MM-DD or two of them joined by a slash), order (the interval ends before it starts), future (later than today), some-dated (a sample already has a date; a declaration never fills gaps), date-joined, date-turned, profile or no-today (the caller gave no date of today). When the date was read from a companion file, some-dated, date-joined, date-turned and profile are CONV-DATE-DECLARED-HELD and do not block.

**Example.** You declare 2019-13 as the date.

**What you can do.** Correct the declaration or remove it. The export is blocked until then. CONV-EVENT-DATE-MISSING keeps its own answer.

## CONV-EVENT-DATE-MISSING — OBIS requires an eventDate on every sample

Severity: error · Export policy: block

**What it checks.** OBIS requires an eventDate on every sample. A station never gives its date to a sample; a replicate takes the date of its sample.

**When it fires.** Fires when sample events have no eventDate. With how=blank-cells a date column exists and these samples have empty cells. With how=no-date-role nothing on the sheet is marked as a date. Turned sheets, sheets read as one row per sample out of a long one, and sheets whose date comes from a joined description sheet have their own wording and advice: a turned sample is a source column and a pivoted line is not a line of the file, so no leave-out is offered there, and on a joined sheet the empty date cells are in the description sheet. A profile sheet is not judged here, and a sample whose date cells hold something unreadable is not counted (that is a row finding).

**Example.** Five of 40 samples have an empty Date cell.

**What you can do.** Fill the date cells, or mark the date column (or the Year, Month and Day columns). Only when no sample of the sheet has a date, and no date is lent by a joined sheet or a turned sheet, can you declare one date for the whole sheet (declaredDate=\<value\>:\<rows\>:\<sheet\>); when some samples are dated that declaration is refused (some-dated). Samples with empty cells on an ordinary sheet can instead be left out and listed with the reason no-event-date. On a turned or pivoted sheet fill the dates in the file, on a joined sheet in the description sheet. The export is blocked until then.

## CONV-PROFILE-NO-STATION — A profile level is placed under its station, so every row needs one

Severity: error · Export policy: block

**What it checks.** A profile level is placed under its station, so every row needs one.

**When it fires.** Fires when profile rows hold data and no station text. These rows are not converted. Rows with no data are not counted; with each distinct position as a station ticked it fires only for rows without a readable position.

**Example.** Twelve rows of a profile sheet have an empty Station cell.

**What you can do.** Map the station column, tick "each distinct position is a station", or fill in the empty cells. The export is blocked until then.
