# Rules of /check

Generated from the rule registry (`src/core/rules/`) by `scripts/rules-docs-per-tool.ts`. Do not edit by hand.
Regenerate with `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-docs-per-tool.test.ts`.

/check reads data files (CSV, TSV, Excel, Darwin Core Archive) and the metadata records of a repository, and checks them against the rules below. It reads a file; it never changes it. A finding names a rule, the file, the rows and the value it concerns.

The list is the rules the tool can raise, found by a static scan of its code, so a few may never fire in practice. Severity is error, warning or info. Every number a rule compares against is listed with its source. Each rule has four short parts: what it checks, when it fires, an invented example, and what the person can do.

121 rules.

## IN-NO-DATA-FILE — A record that was opened holds no file the tool can read as a data table, only other files such as PDFs, images or text documents

Severity: error

**What it checks.** A record that was opened holds no file the tool can read as a data table, only other files such as PDFs, images or text documents. Nothing in it can be checked.

**When it fires.** When a linked record (a Dataverse, Zenodo or similar deposit) was read and none of its files is a table in a format the tool reads: csv, tsv, txt, tab, xlsx, xls or ods. The finding lists the names of the files that were found. Held-back files are mentioned by their own findings.

**Example.** A record lists report.pdf, map.png and notes.docx and no table; the finding names all three.

**What you can do.** Add the table itself as CSV or Excel to the tool, or open the record and download the data file first. If the deposit has no table at all, there is nothing for this tool to check. In /convert this finding blocks the export.

## IN-RECORD-INACCESSIBLE — The record behind a link could not be opened, so its metadata and files were not read

Severity: error

**What it checks.** The record behind a link could not be opened, so its metadata and files were not read. The reason is a failed request to the host, and the finding names the host and the HTTP status code.

**When it fires.** When the server answers a request for the record with an error status such as 403, 404 or 500, or when a file of the record cannot be downloaded. The wording differs for a server fault (status 500 and above, usually temporary) and for other statuses (the record may be private or unpublished). Whatever the other sources of the same run gave is still used.

**Example.** A link to a repository record returns status 404; the finding reads that the record on that host could not be opened (error 404).

**What you can do.** Check the link. For a server fault try again later. For a private or unpublished record download its files or metadata and add them to the tool yourself. In /convert this finding blocks the export.

## IN-HOST-NOT-ALLOWED — A link points to a host the tool is not allowed to open, so nothing was fetched from it

Severity: warning

**What it checks.** A link points to a host the tool is not allowed to open, so nothing was fetched from it.

**When it fires.** When a link in a record, or one the person pasted, names a host that is not on the tool's list of data hosts. Only the host name is reported, never the whole address.

**Example.** A record links its data to a personal file-sharing site that is not on the list; the finding names that site and nothing is downloaded.

**What you can do.** Download the file from that site yourself and add it to the tool. The tool does not widen its list of hosts for one run. In /convert this finding is only shown and never stops the export.

## IN-FETCH-BLOCKED — The browser could not download from a host, so the file was not read

Severity: warning

**What it checks.** The browser could not download from a host, so the file was not read. This is a limit of the browser mode, not a fault in the data.

**When it fires.** In browser mode, when a download fails before any answer arrives because the host does not allow the request (a cross-origin or content-security rule) or the network failed. The finding names the host.

**Example.** A link to a data file on a repository that sends no cross-origin permission; the browser refuses and the finding names the repository.

**What you can do.** Download the file yourself and add it to the tool, or try server mode. In /convert this finding is only shown and never stops the export.

## IN-FETCH-TIMEOUT — A host did not start to answer in time, so the browser stopped waiting and the file was not read

Severity: warning

**What it checks.** A host did not start to answer in time, so the browser stopped waiting and the file was not read.

**When it fires.** In browser mode, when a download receives no response within 30 seconds. A slow body that has already started is not a timeout: a download cut off after it began is IN-FETCH-INTERRUPTED. The finding names the host.

**Example.** A repository server is overloaded and sends nothing for 30 seconds; the request is abandoned and the host is named.

**What you can do.** Try again later, or switch to server mode, or download the file yourself and add it to the tool. In /convert this finding is only shown and never stops the export.

## IN-FETCH-INTERRUPTED — The download of an archive from an archive server was cut off or ran out of time before it was complete, so the archive was not checked at all

Severity: error

**What it checks.** The download of an archive from an archive server was cut off or ran out of time before it was complete, so the archive was not checked at all.

**When it fires.** When the download of a Darwin Core Archive from a listed IPT server times out (the limit of server mode is the proxy's) or the connection closes before the whole body arrived. The finding names the host. A partly received archive is never read.

**Example.** A large archive from a slow IPT server stops after a few megabytes; nothing of it is read.

**What you can do.** Try again in a few minutes, or download the archive (.zip) yourself and add it to the tool. In /convert this finding blocks the export.

## IN-ARCHIVE-TOO-LARGE — A Darwin Core Archive is larger than the size the tool's server will pass on for checking, so it was not downloaded or checked

Severity: error

**What it checks.** A Darwin Core Archive is larger than the size the tool's server will pass on for checking, so it was not downloaded or checked.

**When it fires.** When the proxy refuses an archive with HTTP status 413 because it is above its size limit. The finding names the host and the limit in megabytes. An archive added by hand has the same limit.

**Example.** An archive of 600 MB is refused by a proxy whose limit is 250 MB; the finding gives the host and 250.

**What you can do.** Download the archive yourself, unpack it and add the core file (for example occurrence.txt) to the tool. The unpacked file is read as an ordinary table. In /convert this finding blocks the export.

## IN-ARCHIVE-DAILY-BUDGET — This client has used the daily allowance for archive downloads through the tool's server, so the archive was not fetched and not checked

Severity: error

**What it checks.** This client has used the daily allowance for archive downloads through the tool's server, so the archive was not fetched and not checked.

**When it fires.** When the proxy answers HTTP status 429 with the reason archive_daily_budget: the daily number of archive requests or bytes for this IP address is used up. The finding names the host of the archive. The allowance starts again within 24 hours.

**Example.** After many large archives in one day the next request is refused; the host of that archive is named.

**What you can do.** Wait until the allowance renews (within 24 hours), or download the archive (.zip) yourself and add it to the tool. In /convert this finding blocks the export.

## IN-ARCHIVE-BUSY — Too many archive downloads are already running from this IP address, so this one was not started and the archive was not checked

Severity: error

**What it checks.** Too many archive downloads are already running from this IP address, so this one was not started and the archive was not checked.

**When it fires.** When the proxy answers HTTP status 429 with the reason archive_busy: this client already has the maximum of 2 archive downloads in flight. The finding names the host.

**Example.** Two archives are being downloaded and a third is requested; the third is refused until one finishes.

**What you can do.** Wait until the running downloads finish and check again, one archive at a time. In /convert this finding blocks the export.

## IN-IPT-HOST-NOT-LISTED — The Darwin Core Archive of a dataset lives on a server that is not on the tool's fixed list of IPT servers, so it was not downloaded

Severity: warning

**What it checks.** The Darwin Core Archive of a dataset lives on a server that is not on the tool's fixed list of IPT servers, so it was not downloaded.

**When it fires.** When a GBIF or OBIS dataset points to an archive whose host, address scheme, port or credentials do not match the static list of IPT servers the tool reads. The finding names the host.

**Example.** A GBIF dataset has its archive on a small institute server that is not on the list; the host is named and nothing is fetched.

**What you can do.** Download the archive (.zip) yourself and add it to the tool. In /convert this finding is only shown and never stops the export.

## IN-NO-DWC-ARCHIVE — GBIF or OBIS knows the dataset but lists no downloadable Darwin Core Archive for it, so there is nothing to check

Severity: error

**What it checks.** GBIF or OBIS knows the dataset but lists no downloadable Darwin Core Archive for it, so there is nothing to check.

**When it fires.** When the registry record of a GBIF dataset has no archive endpoint of the Darwin Core Archive type, or the OBIS record has no archive address. The finding names the registry.

**Example.** A GBIF dataset page shows the dataset only as metadata; its record lists no archive.

**What you can do.** Get the data from the publisher and add the table or the archive to the tool. In /convert this finding blocks the export.

## IN-FILE-HELD-BACK — A file of a linked record is held back by its source (restricted access or an embargo), so it was not downloaded and not checked

Severity: warning

**What it checks.** A file of a linked record is held back by its source (restricted access or an embargo), so it was not downloaded and not checked. This is not an error in the data, but the lack of remarks says nothing about the file.

**When it fires.** When the source marks a file of a Dataverse dataset as restricted or embargoed. The finding names the file and the host. The other files of the record are still read.

**Example.** A dataset has an open file samples.csv and a restricted file raw.csv; raw.csv gets this finding.

**What you can do.** Ask the data owner for access, then add the file to the tool. In /convert this finding is only shown and never stops the export.

## IN-FILE-TOO-LARGE — A data file of a linked record is larger than the most the tool reads from a link, so it was not downloaded and not checked

Severity: warning

**What it checks.** A data file of a linked record is larger than the most the tool reads from a link, so it was not downloaded and not checked.

**When it fires.** When a file listed in a Dataverse dataset is a readable table type, is not held back, and its size is above the limit for linked files. The finding names the file and gives the limit in megabytes. The rule uses the size the source states.

**Example.** A deposit holds survey.csv of 400 MB and the limit is 100 MB; the file gets this finding and the rest of the record is read.

**What you can do.** Download the file and add it to the tool yourself, or split it into smaller tables. A clean result for the other files says nothing about this one. In /convert this finding is only shown and never stops the export.

## IN-FILES-NOT-READ — Some files of a linked record may hold data but are in a format the tool does not read, such as zip or NetCDF, so they were not checked

Severity: warning

**What it checks.** Some files of a linked record may hold data but are in a format the tool does not read, such as zip or NetCDF, so they were not checked. The report names them so that it never reads as if the whole dataset was checked.

**When it fires.** When a Dataverse record has at least one table the tool reads and, besides, files that are not tables and are not documents, images or a README. The finding names those files. Documents, pictures and READMEs describe the deposit and are left out of the list. If the record has no table at all, IN-NO-DATA-FILE is raised instead.

**Example.** A record holds counts.csv and also model.nc and images.zip; the finding names model.nc and images.zip.

**What you can do.** If they hold data, unpack them or save them as CSV or Excel and add them to the tool. In /convert this finding is only shown and never stops the export.

## IN-DATAVERSE-FILES — A note about what was read from a Dataverse dataset: which version, and in which form its tables were read

Severity: info

**What it checks.** A note about what was read from a Dataverse dataset: which version, and in which form its tables were read.

**When it fires.** Every time a Dataverse dataset is read. It states the version (the latest published one) and the host. It also says whether the tables were read as the author uploaded them, as the .tab copy Dataverse made when the original cannot be read, or that no data file was read at all.

**Example.** Version 2.1 of a dataset is read from a Dataverse host; one table in its original form and one as the .tab copy.

**What you can do.** Nothing to fix. If the dataset has been updated since, run the check again to read the newer version. In /convert this finding is only shown and never stops the export.

## IN-FILE-UNREADABLE — None of the files that were added could be read at all, for example a damaged workbook or a file in an unsupported format

Severity: error

**What it checks.** None of the files that were added could be read at all, for example a damaged workbook or a file in an unsupported format. Nothing was checked, so the absence of other remarks does not mean the data are fine.

**When it fires.** When every added file fails to parse. The finding lists the names of the files, comma-separated. If at least one file is read, a failing file is not reported by this rule.

**Example.** A workbook that was cut off during copying cannot be opened; the finding names it.

**What you can do.** Save the file again, for example as CSV or Excel, and add it once more. In /convert this finding blocks the export.

## IN-LAYOUT-UNSUPPORTED — The table is laid out in a way the tool cannot read as one header row and one row per sample, so it was not read

Severity: error

**What it checks.** The table is laid out in a way the tool cannot read as one header row and one row per sample, so it was not read.

**When it fires.** When the layout reader finds data that is transposed (variables or species in rows, samples in columns), a header that spans several rows, a row above the names that holds footnote markers, a table with no rows, a workbook with no sheet of coordinates or measurements, or no table at all. The finding gives the reason and, for a workbook, the sheet.

**Example.** A sheet lists the variables down the first column and the samples across the top; the finding says the data is transposed.

**What you can do.** Reshape the table into one header row with one row per sample and add it again. In /convert this finding blocks the export.

## IN-ENCODING-FALLBACK — The file is not saved as UTF-8, so the tool read it as an 8-bit Central European or Western code page

Severity: info

**What it checks.** The file is not saved as UTF-8, so the tool read it as an 8-bit Central European or Western code page. The letters with accents may be wrong if that guess is wrong.

**When it fires.** When the bytes are not valid UTF-8 and the three 8-bit readings the tool tries (windows-1250, ISO-8859-2 and windows-1252) give the same text. The finding names the reading that was used. If the readings differ, IN-ENCODING-AMBIGUOUS is raised instead. A UTF-16 file or a UTF-8 file with a BOM is read without a finding.

**Example.** A CSV saved by an old program holds only plain letters in the bytes that differ between code pages; it is read as windows-1250.

**What you can do.** Check that accented letters look right, and save the file as UTF-8 when you publish. In /convert the reading is accepted once and does not stop the export.

## IN-ENCODING-AMBIGUOUS — The file is not UTF-8 and its accented letters read in two or three different ways, depending on which 8-bit code page is assumed

Severity: warning

**What it checks.** The file is not UTF-8 and its accented letters read in two or three different ways, depending on which 8-bit code page is assumed. Only the person who saved the file knows which reading is right.

**When it fires.** When the bytes are not valid UTF-8 and at least two of windows-1250, ISO-8859-2 and windows-1252 decode them to different text. The finding shows each reading with up to three differing words and the one that was used (windows-1250 or ISO-8859-2). Code pages that decode alike count as one reading. UTF-16 is recognised by its BOM or its alternate zero bytes and is not ambiguous.

**Example.** The same bytes read as Krřyer in windows-1250 and ISO-8859-2 and as Krøyer in windows-1252; the finding shows both words.

**What you can do.** Decide which reading is right and save the file as UTF-8, or in /convert declare the encoding so the question is answered. /check keeps its pick and only reports. In /convert this finding blocks the export until the encoding is declared.

## IN-DECIMAL-COMMA — The file writes numbers with a decimal comma (3,14) instead of a point

Severity: info

**What it checks.** The file writes numbers with a decimal comma (3,14) instead of a point. The tool read them that way, so values are numbers and not text.

**When it fires.** When the delimiter is a semicolon or a tab and at least 80 percent of the cells with a decimal separator in the first 50 rows are written with a comma, as n,n. Whole numbers say nothing about the separator and are ignored. A column whose commas could also be thousands separators is also reported by IN-DECIMAL-AMBIGUOUS.

**Example.** A semicolon-separated file holds 12,5; 3,14 and 0,07 in a column.

**What you can do.** Use a decimal point when you publish. If the commas were meant as something else, change the file. In /convert the reading is accepted once and does not stop the export.

## IN-DECIMAL-AMBIGUOUS — In one column of a file that uses a decimal comma, every number with a comma has exactly three digits after it, so the comma may be a decimal comma (1,250 is one and a quarter) or a thousands separator (1,250 is one thousand two hundred fifty)

Severity: warning

**What it checks.** In one column of a file that uses a decimal comma, every number with a comma has exactly three digits after it, so the comma may be a decimal comma (1,250 is one and a quarter) or a thousands separator (1,250 is one thousand two hundred fifty). The file does not say which.

**When it fires.** Per column of a decimal-comma file, when every cell with a comma has exactly three digits after it. One value with one, two, or four or more decimals settles the column as decimal and then no finding is raised. The finding gives the column, the number of cells, the first such value and both readings. The cells were read as decimals. When the column also holds a value with comma thousands groups, such as 1,250,000, the finding names it, because the commas may mean thousands.

**Example.** A column of depths in metres holds 1,250 and 2,500; read as decimals they are 1.25 and 2.5, read as thousands 1250 and 2500.

**What you can do.** Decide what the comma means in this column. In /convert declare it as decimal or as thousands; under thousands the cells written 1,250 or 1,250,000 are read as 1250 and 1250000. In /check the finding only reports. In /convert this finding blocks the export until the column is declared.

## IN-HEADER-SHORT — The header row has fewer names than the data rows have values

Severity: warning

**What it checks.** The header row has fewer names than the data rows have values. The tool cannot tell where the names are missing, so values may sit under the name of a neighbour column.

**When it fires.** When at least 95 percent of the data rows (at least three rows are needed) have the same number of fields, that number is larger than the header's, and the extra fields are not all empty. The extra values are given the internal names Column N at the end. A trailing delimiter that adds only empty fields is not reported, and a first data row that reads as a header is treated as the real header instead.

**Example.** A header of 10 names over rows of 12 values: the last two are shown as Column 11 and Column 12.

**What you can do.** Give every column a name in the file, and check the first values of the last named columns in case a name is missing earlier. In /convert this finding is accepted and does not stop the export, so the person maps the extra columns as they are.

## IN-HEADER-UNITS-READ — A second header row of units was read: the line under the column names holds only units, so it is not data

Severity: info

**What it checks.** A second header row of units was read: the line under the column names holds only units, so it is not data. The units were added to the column names.

**When it fires.** When the row directly under the header (or under a row of statistic labels) has only unit cells, at least two of which go into a header, every cell has a name above it, and the numbers below fit the units. A unit that disagrees with the one the name already gives means the row is not folded. The finding gives the line and the first changed name, for example a column now named a \[h\]. The line numbers in the report stay the file's own.

**Example.** A header latitude, longitude over a row degrees_north, degrees_east: the names become latitude \[degrees_north\] and longitude \[degrees_east\].

**What you can do.** Nothing to fix. If you prefer a single header row, put the unit into the column name. In /convert this finding is only shown and never stops the export.

## IN-HEADER-UNITS-NAMED — A row of units under the header was recognised and skipped

Severity: info

**What it checks.** A row of units under the header was recognised and skipped. The column names already carried the same units, so no name was changed.

**When it fires.** When the row under the header holds only units and every column it names has the same unit in its own header too, for instance depth \[m\] over m. The row is not a data row and the report keeps the file's own line numbers. The finding gives the line.

**Example.** The header holds temperature \[C\] and depth \[m\] and the next line holds C and m.

**What you can do.** Nothing to fix. Remove the second row if you want a plain single header. In /convert this finding is only shown and never stops the export.

## IN-PERCENT-READ — Cells of an Excel column are formatted as percentages and were read as shown: a stored 0.95 formatted as 95% is read as 95, not 0.95

Severity: info

**What it checks.** Cells of an Excel column are formatted as percentages and were read as shown: a stored 0.95 formatted as 95% is read as 95, not 0.95.

**When it fires.** Per column of an Excel sheet with at least one numeric cell whose number format shows a percent sign and whose stored value differs from the shown one. The decimal point of the stored number is moved two places right (never the cell's rounded display text). The finding gives the column, the number of cells and the first stored and shown values.

**Example.** A column of 0.07 formatted as 0.0% is read as 7; the finding says 0.07 is read as 7.

**What you can do.** If you meant fractions, reformat the cells as numbers. If you meant percent values, leave them. Check the unit in the column name. In /convert this finding is only shown and never stops the export.

## IN-COLUMN-NO-HEADER — A column of an Excel sheet holds values to the right of the last named header cell but has no name itself

Severity: warning

**What it checks.** A column of an Excel sheet holds values to the right of the last named header cell but has no name itself. It is read as a column without a name, and every cell stays where it is.

**When it fires.** When a data row has a value in a column to the right of the last named header cell, or under an empty header cell. The finding gives the column letter, the number of rows with a value and their lines.

**Example.** The header names columns A to F, and column G holds numbers in 40 rows; column G is reported with those rows.

**What you can do.** Give the column a name in the file, or say in /convert what it holds. In /convert this finding is only shown and never stops the export.

## IN-DATE1904 — An Excel workbook uses the older 1904 date system

Severity: info

**What it checks.** An Excel workbook uses the older 1904 date system. Dates were converted with its epoch; they differ by 1462 days from the same number in the usual 1900 system.

**When it fires.** When the workbook has its 1904 date flag set. Serial dates are converted from 1 January 1904. Dates written as text are not affected.

**Example.** The same stored serial number is a date four years and a day later in the 1904 system than in the 1900 system, so reading a 1904 file as 1900 would move every date.

**What you can do.** Check a few of the dates. If the dates are off by about four years, the file was created on an older Mac; consider resaving it in the 1900 system. In /convert this finding is only shown and never stops the export.

**Citations.**

- [Microsoft Support, Date systems in Excel](https://support.microsoft.com/en-us/office/date-systems-in-excel-e7fe7167-48a9-4b96-bb53-5612a800b487), 1900 and 1904 date systems; "The difference between the two date systems is 1,462 days."

## IN-PANGAEA-EVENT-USED — A PANGAEA table without position or date columns got Latitude, Longitude and/or Date/Time from the Event(s) block of its file header

Severity: info

**What it checks.** A PANGAEA table without position or date columns got Latitude, Longitude and/or Date/Time from the Event(s) block of its file header.

**When it fires.** When a PANGAEA text file has an Event(s) block with points or dates and the table lacks those columns. With one event it applies to every row; with several, each row takes the event named in its Event column. A column the table already has is never touched, and a value a row has is never overwritten. The finding names the columns added, the number of events and the rows filled.

**Example.** A table of samples without coordinates and an Event(s) block that lists station ST-01 with its position and time; each row gets that position and time.

**What you can do.** Check the values the finding names. Add your own position and date columns if the sample position differs from the event's. In /convert this finding is only shown and never stops the export.

## IN-PANGAEA-EVENT-NOT-USED — The Event(s) block of a PANGAEA file gives a position or date, but nothing was copied into the table, and the table has none of its own

Severity: warning

**What it checks.** The Event(s) block of a PANGAEA file gives a position or date, but nothing was copied into the table, and the table has none of its own.

**When it fires.** When the table lacks the columns and the block cannot be used: several events are listed but the table has no Event column to say which row belongs to which, or the event's position is a track (start and end differ) and not a point. The finding gives the number of events and which of the two reasons applies.

**Example.** A block lists three stations and the table has no Event column; nothing is borrowed.

**What you can do.** Add an Event column, or position and date columns, to the table. For a track add the position of each sample. In /convert this finding is only shown and never stops the export.

## IN-PANGAEA-EVENT-UNMATCHED — Some rows of a PANGAEA table have no matching event in the Event(s) block of the file header, so nothing was taken for them

Severity: warning

**What it checks.** Some rows of a PANGAEA table have no matching event in the Event(s) block of the file header, so nothing was taken for them.

**When it fires.** When the block lists several events and the table has an Event column, for each row whose Event cell is empty, names an event that is not listed, or names an event with no position or date. The finding gives the number of rows and their lines.

**Example.** Rows 12 and 13 say station 7, and the block lists stations 1 to 6.

**What you can do.** Fill the position and date for those rows in the table. In /convert this finding is only shown and never stops the export.

## IN-DWCA-NOT-ARCHIVE — A file named .zip is not a Darwin Core Archive, so nothing was checked

Severity: error

**What it checks.** A file named .zip is not a Darwin Core Archive, so nothing was checked. It has no meta.xml and may not even be a ZIP, for example a saved error page.

**When it fires.** When the file has no meta.xml at its root or in its single top-level folder, or is not a zip at all.

**Example.** A web page saved with a .zip extension.

**What you can do.** Add a Darwin Core Archive downloaded from an IPT, OBIS or GBIF, or the table itself as CSV or Excel. In /convert this finding blocks the export.

## IN-DWCA-UNSUPPORTED-CORE — A Darwin Core Archive whose core table is neither Occurrence nor Event was not checked

Severity: error

**What it checks.** A Darwin Core Archive whose core table is neither Occurrence nor Event was not checked. That does not mean it is fine.

**When it fires.** When the core rowType of the archive is another class, for instance Taxon. The finding names the core.

**Example.** An archive whose core is a taxon list.

**What you can do.** Check the occurrence or event table by adding it as a table, or use another tool for this core. In /convert this finding blocks the export.

## IN-DWCA-UNREADABLE — A Darwin Core Archive could not be read safely, so nothing was checked

Severity: error

**What it checks.** A Darwin Core Archive could not be read safely, so nothing was checked.

**When it fires.** When the zip is damaged, encrypted, uses an unsupported method, is too large or has too many entries, or when meta.xml is missing, too big, has a DTD, is not well-formed or does not describe a single core file with fields. The finding gives a language-neutral reason code such as ZIP-ENCRYPTED or DWCA-META-INVALID.

**Example.** An archive with a password-protected entry gives ZIP-ENCRYPTED.

**What you can do.** Download the archive again, or add the table itself (for example occurrence.txt). In /convert this finding blocks the export.

## IN-DWCA-PARTIAL — The core table of a Darwin Core Archive is large, so only its first rows were read

Severity: warning

**What it checks.** The core table of a Darwin Core Archive is large, so only its first rows were read. The remaining rows were not checked; a clean result does not cover the whole file.

**When it fires.** When the core file has more rows than the row cap of 200,000. The finding gives the number of rows read and the total.

**Example.** An archive with 1.2 million occurrences reports 200,000 of 1,200,000 rows.

**What you can do.** Check a smaller piece of the table or the rest in separate runs. Treat a clean result as covering the first rows only. In /convert this finding is only shown and never stops the export.

## IN-DWCA-VERSION — States which Darwin Core Archive was read: title, version and core type

Severity: info

**What it checks.** States which Darwin Core Archive was read: title, version and core type.

**When it fires.** Every time an archive is read. The version is taken from the packageId and publication date in eml.xml, or shown as n/a when it states none.

**Example.** Dataset "Fish counts 2024", version v1.0, core Occurrence.

**What you can do.** If the archive has been updated since, run the check again; the result covers the version read. In /convert this finding is only shown and never stops the export.

## IN-DWCA-EVENT-CORE — The core of the archive is Event, so the tool checked the event table

Severity: info

**What it checks.** The core of the archive is Event, so the tool checked the event table. Its Occurrence extension was counted, not checked row by row.

**When it fires.** When the core is Event and an Occurrence extension exists. The finding gives the number of occurrence rows.

**Example.** An event-core archive with an Occurrence extension of 4,200 rows.

**What you can do.** If you need the occurrence rows checked, add the occurrence table as a separate file. In /convert this finding is only shown and never stops the export.

## LIC-MISSING — No licence is stated anywhere in the record

Severity: error

**What it checks.** No licence is stated anywhere in the record. Without a licence nobody knows whether the data may be reused, so by default they may not.

**When it fires.** Once per record, when the record (or all the records read for it) holds no statement about the data in any licence field (ISO useLimitation and otherConstraints, DataCite rightsList, Zenodo license and the like; statements about the metadata record itself do not count), and no source of the record failed to load. A record that could not be read says nothing about a licence, and IN-RECORD-INACCESSIBLE reports it instead. In the collection review, when the DataCite record could not be compared, the finding says it rests on the catalogue record alone.

**Example.** A catalogue record has title, abstract and contact, but its rights and constraints sections are empty.

**What you can do.** State the licence by name and version with a link to its official text, for example CC BY 4.0, in the repository record.

**Citations.**

- [INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)](https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html), section 2.3.7 (quoting Regulation 1205/2008 Part B 8.1): "The element must have values."
- [INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)](https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html), section 2.3.7 (quoting Regulation 1205/2008 Part B 8.1): "If no conditions apply to the access and use of the resource, ‘no conditions apply’ shall be used."
- [GO FAIR, FAIR Principle R1.1](https://www.go-fair.org/fair-principles/r1-1-metadata-released-clear-accessible-data-usage-license/), heading "Interpretation of R1.1": "Digital resources and their metadata must always, without exception, include a license that describes under which conditions the resource can be used, even if that is “unconditional”."
- [OpenAIRE Guidelines for Data Archives, 16. Rights (MA)](https://guidelines.openaire.eu/en/latest/data/field_rights.html), 16. Rights (MA), note: "In particular OpenAIRE also recommends including license information if available."

## LIC-FREE-TEXT — The licence is written only as free text that a program cannot read

Severity: warning

**What it checks.** The licence is written only as free text that a program cannot read. A person understands it, but a harvester cannot tell whether the data are open.

**When it fires.** Once per record, when the record has licence statements, none of them is machine-readable (an identifier field, a link to a recognised licence, or a text that is itself the identifier) and none carries a conflict (LIC-TEXT-URI-CONFLICT, LIC-ADDED-CONDITIONS, LIC-EXTRA-TEXT or LIC-AMBIGUOUS). Prose such as CC BY 4.0 without a link is free text. The finding quotes the first statement with text and says whether the text carries no version number. The suggested identifier is the licence the tool recognised in the record, or the example CC BY 4.0 when it recognised none.

**Example.** The rights field reads: Creative Commons Attribution licence, with no version and no link.

**What you can do.** Give the identifier and the link to the official text, so that the licence is stated by both.

**Citations.**

- [GO FAIR, FAIR Principle R1.1](https://www.go-fair.org/fair-principles/r1-1-metadata-released-clear-accessible-data-usage-license/), heading "Interpretation of R1.1": "Note also that a license that cannot be found by an agent, is effectively the same as no license at all."
- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16. Rights, allowed values, examples, other constraints: "Use the complete title of a license and include version information if applicable."
- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16.b rightsIdentifier: "A short, standardized version of the license name."
- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16.a rightsURI: "The URI of the license."
- [INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)](https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html), TG Recommendation C.10, section 2.3.7: "For detailed information about the licensing of the resource it is recommended to provide a link to a license type (e.g. http://creativecommons.org/licenses/by/3.0 ), a website or to a document containing the necessary information."
- [SPDX, Handling license info](https://spdx.dev/learn/handling-license-info/), "SPDX License List" paragraph: "The SPDX License List includes a standardized short identifier, the full name, the license text, and a canonical permanent URL for each license and exception."

## LIC-TEXT-URI-CONFLICT — A licence statement has both a text and a link, and they do not agree

Severity: warning

**What it checks.** A licence statement has both a text and a link, and they do not agree. Either one is wrong, or the text is not about the licence at all.

**When it fires.** For one statement that has a link, when the text itself offers several licences, or the text and the link read as different licences, or a text with no version names only a licence family against the link of another family, or the link is a licence link the tool has no identifier for while the text names one, or the text names no licence and says more than plain Open Access next to a licence link. For DataCite and Zenodo it also fires when the text is an exact licence name but the link is no licence link and no access value. A text that is empty, plain Open Access or Public Domain next to a CC0 link is neutral and does not fire it. One finding per statement, with the licence read from the text and from the link, a dash meaning not recognised.

**Example.** The text says CC BY 4.0 and the link points to the page of the CC BY-NC 4.0 licence.

**What you can do.** Decide which licence applies and write it once, with its own link and with a text that names the same licence.

**Citations.**

- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16. Rights, allowed values, examples, other constraints: "Use the complete title of a license and include version information if applicable."
- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16.a rightsURI: "The URI of the license."
- [Creative Commons wiki, Best practices for attribution](https://wiki.creativecommons.org/wiki/Best_practices_for_attribution), section on licence attribution: "We recommend that you name and provide a link to the license, e.g., CC BY 4.0 ( http://creativecommons.org/licenses/by/4.0 ) for a work licensed under CC BY 4.0."

## LIC-ADDED-CONDITIONS — A licence text names a licence and then adds conditions to it

Severity: warning

**What it checks.** A licence text names a licence and then adds conditions to it. With extra conditions it is no longer the standard licence and cannot be treated as one.

**When it fires.** For a statement whose text names a licence, when nothing else contradicts it (the readings of text and link agree) and what is left of the text after the licence name and the neutral wording are taken away contains a restriction marker, such as a limit on commercial use or a duty to ask for permission (words in Polish, English, German and French are looked for). The finding quotes the leftover. When the identifier or the Zenodo title leaves something too, that is added to the finding. A leftover with no restriction marker is LIC-EXTRA-TEXT instead.

**Example.** The text reads CC BY 4.0, commercial use only with written permission of the authors.

**What you can do.** State the licence alone, or name the extra conditions explicitly as such and say that the data are not under the plain licence.

**Citations.**

- [Creative Commons FAQ](https://creativecommons.org/faq/), Alterations and additions to the license, "Can I change the license terms or conditions?": "if you change the terms and conditions of any Creative Commons license, you must no longer call, label, or describe the license as a “Creative Commons” or “CC” license"

## LIC-EXTRA-TEXT — A licence text names a licence and also says something else

Severity: warning

**What it checks.** A licence text names a licence and also says something else. The extra words may change the licence, so the statement is not read as the standard licence until a person has looked.

**When it fires.** For a statement whose text names a licence, when the readings of text and link agree and something is left over after the licence name and the neutral wording are removed, and the leftover has no restriction marker. A leftover with a restriction marker is LIC-ADDED-CONDITIONS instead. The finding quotes the leftover, and the leftover of another string of the same statement (identifier or Zenodo title) is added when there is one.

**Example.** The text reads CC BY 4.0, please contact the data manager.

**What you can do.** Move the extra sentence to the description of the data and leave the licence field with the licence only.

**Citations.**

- [Creative Commons FAQ](https://creativecommons.org/faq/), Alterations and additions to the license, "Can I change the license terms or conditions?": "if you change the terms and conditions of any Creative Commons license, you must no longer call, label, or describe the license as a “Creative Commons” or “CC” license"

## LIC-OTHER-RIGHTS-ENTRY — A repeated rights entry that is no recognised licence stands next to a licence the same record does recognise

Severity: warning

**What it checks.** A repeated rights entry that is no recognised licence stands next to a licence the same record does recognise. The other entry may restrict or change the licence.

**When it fires.** Once per source of the record, only for repeated entries (DataCite rightsList, Zenodo rights, the licences a Dataverse states per file), never for the fields of an ISO record, when the record has a recognised licence and another repeated entry that is no recognised licence, has no conflict of its own and is not a neutral value: a plain access word, or a notice that only names the creators, the organisations or the publisher of the record. Repeated recognised licences are read as dual licensing and do not fire it. The finding quotes the entry, or its link, and names the recognised licence.

**Example.** A rights list holds CC BY 4.0 and a second entry, Data may not be redistributed without consent.

**What you can do.** Remove the second entry or move it to the description, or state clearly how it relates to the licence.

**Citations.**

- [Creative Commons FAQ](https://creativecommons.org/faq/), Alterations and additions to the license, "Can I change the license terms or conditions?": "if you change the terms and conditions of any Creative Commons license, you must no longer call, label, or describe the license as a “Creative Commons” or “CC” license"

## LIC-AMBIGUOUS — A licence statement without a link reads as more than one licence

Severity: warning

**What it checks.** A licence statement without a link reads as more than one licence. It cannot be assigned to one licence, so a harvester cannot tell what is allowed.

**When it fires.** For one statement with no link, when its strings (the rights text, the identifier, the title) name different licences, when it names two licences or a licence family and a licence, when a versionless family such as CC BY is read against a named version of another family, or when a recognised name stands next to one the tool has no identifier for. One finding per statement, which lists what it reads as, separated by a slash, a dash meaning a name with no identifier. The same text with a link is LIC-TEXT-URI-CONFLICT.

**Example.** The text reads CC BY 4.0 (CC BY-NC) and no link is given.

**What you can do.** State one licence, with its identifier and link. If both licences really apply, list them as separate entries and say so in the description.

**Citations.**

- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16. Rights, allowed values, examples, other constraints: "Use the complete title of a license and include version information if applicable."
- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16.b rightsIdentifier: "A short, standardized version of the license name."

## LIC-RESTRICTION-CONFLICT — The record names an open licence and also carries a restriction code that says the data are restricted

Severity: warning

**What it checks.** The record names an open licence and also carries a restriction code that says the data are restricted. The two cannot both describe the data.

**When it fires.** Once per record, when a record carries a restrictive ISO restriction code (copyright, patent, patentPending, trademark, intellectualPropertyRights or restricted) and the record names an open licence: a recognised open identifier, or an open licence family as written, even without a version. The codes license and otherRestrictions never count, the first because it is the normal way to say that a licence applies and the second because it only points to the constraints text. A non-commercial or no-derivatives licence is not open here. The finding lists the codes and the licence.

**Example.** A record states CC BY 4.0 in otherConstraints and the code copyright in its restriction code.

**What you can do.** If the licence is the true statement, replace the code with license, or with otherRestrictions plus a description of the conditions, as INSPIRE expects. If the data are in fact restricted, state the restriction instead of the open licence.

**Citations.**

- [INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)](https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html), TG Requirement C.18, section 2.3.7: "In both cases this element shall contain a gmd:MD_RestrictionCode element with code list value "otherRestrictions"."
- [INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)](https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html), TG Requirement C.18, section 2.3.7: "Additionally at least one instance of gmd:otherConstraints shall be given describing the actual conditions."
- [ISO/TS 19139 code lists (gmxCodelists.xml), MD_RestrictionCode](https://standards.iso.org/iso/19139/resources/gmxCodelists.xml), MD_RestrictionCode "restricted": "withheld from general circulation or disclosure"
- [Creative Commons FAQ](https://creativecommons.org/faq/), How do CC licenses operate?: "CC licenses are operative only when applied to material in which a copyright exists, and even then only when a particular use would otherwise not be permitted by copyright."

## LIC-FILES-HELD-BACK — Some files of the dataset are under restricted access or an embargo

Severity: warning

**What it checks.** Some files of the dataset are under restricted access or an embargo. Whatever licence the metadata states, the repository decides who may get these files.

**When it fires.** Once per record, when a Dataverse record lists files that are restricted or embargoed. The finding names up to ten of the files and counts the rest. The licence verdict of the tool covers only the open files, and the page says so.

**Example.** A Dataverse dataset has four files, and two of them are marked restricted.

**What you can do.** If the held files are the data, say in the description how and when they can be obtained, or open them.

## LIC-DATACITE-EMPTY — The DOI registration record at DataCite states no licence

Severity: warning

**What it checks.** The DOI registration record at DataCite states no licence. Harvesters read that record first, so the data look unlicensed to them.

**When it fires.** Once per record, when the DataCite record was read and has no licence statement, and either another source of the record states a licence or some source could not be read. The finding names the licence of the other record, and a dash when none states one or the main record could not be read. It is not counted as a contradiction between records, because silence contradicts nothing.

**Example.** The Zenodo record of a dataset says CC BY 4.0, and the DataCite record of its DOI has an empty rights list.

**What you can do.** Add the licence to the DOI record at the registration agency.

**Citations.**

- [OpenAIRE Guidelines for Data Archives, 16. Rights (MA)](https://guidelines.openaire.eu/en/latest/data/field_rights.html), 16. Rights (MA), note: "In particular OpenAIRE also recommends including license information if available."
- [OpenAIRE Guidelines for Data Archives, 16. Rights (MA)](https://guidelines.openaire.eu/en/latest/data/field_rights.html), 16. Rights (MA), note: "Mandatory when applicable property in OpenAIRE instead of optional in DataCite."

## LIC-MISMATCH — Two records, or two fields of one record, state different licences

Severity: warning

**What it checks.** Two records, or two fields of one record, state different licences. A reader cannot tell which one applies.

**When it fires.** Once per record (only the first disagreeing pair is reported), when two sources that each have a recognised licence share none of them, or when different recognised licences stand in different fields of one source, outside the repeated rights entries a publisher offers on purpose. Records of one deposit, such as a Zenodo record and the DataCite record of its DOI, are compared to each other. Statements that are not recognised do not take part. The finding names the two identifiers.

**Example.** The catalogue record says CC BY 4.0 and the DataCite record says CC BY-SA 4.0.

**What you can do.** Make the licence the same in every record of the dataset.

**Citations.**

- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16. Rights, definition: "The property may be repeated to record complex rights characteristics."
- [Creative Commons FAQ](https://creativecommons.org/faq/), separate agreements: "You may offer the licensed material under other licenses in addition to the CC license (a practice commonly referred to as “dual licensing”)."
- [Creative Commons FAQ](https://creativecommons.org/faq/), separate agreements: "A reuser may then choose which set of terms to comply with."
- [GO FAIR, FAIR Principle R1.1](https://www.go-fair.org/fair-principles/r1-1-metadata-released-clear-accessible-data-usage-license/), heading "Interpretation of R1.1": "Furthermore, the license may be different for a data resource and the metadata that describes it"

## META-EMPTY-LINK — A download link of the record has an empty address

Severity: warning

**What it checks.** A download link of the record has an empty address. A link that goes nowhere cannot be followed by a person or by a harvester, and it suggests that a file was left out of the record.

**When it fires.** Once per record, when at least one distribution link (a CI_OnlineResource linkage in an ISO 19139 or ISO 19115-3 record; the other record types carry no such links) is present with an empty address. The finding counts the empty links of all the sources read for the record. A record that could not be read is not judged.

**Example.** A metadata record lists three download links, one of which has the address field present but blank.

**What you can do.** Fill in the address or delete the link in the repository record.

## META-NO-VERSION — The record gives no version or edition of the data

Severity: info

**What it checks.** The record gives no version or edition of the data. Without it nobody can tell which release of a dataset they hold, and a corrected release looks like the old one.

**When it fires.** Once per record, when records were read and none of them carries a version or edition, and the data did not come as a Darwin Core Archive whose eml.xml states a version (see IN-DWCA-VERSION). A record that could not be read is not judged, because its absence of a version says nothing.

**Example.** A DataCite record with title, creators and licence but no version field.

**What you can do.** Add a version number or edition to the record, and change it when the data change.

## META-NO-EXTENT — The record states neither a time span nor an area for the data

Severity: info

**What it checks.** The record states neither a time span nor an area for the data. A reader cannot tell when and where the data were collected, and the tool cannot compare the table with the record.

**When it fires.** Once per record, when records were read and none of them has a temporal extent or a geographic bounding box. A record with only one of the two does not fire this rule. In Collection review, which has no table to compare, the wording does not mention a /check table.

**Example.** A record with a title and an abstract but no temporal coverage and no bounding box.

**What you can do.** Add the period and the bounding box of the data to the record.

## META-DATE-OUTSIDE-EXTENT — Some rows of the table are dated outside the time span the record states

Severity: warning

**What it checks.** Some rows of the table are dated outside the time span the record states. Either the dates in the table are wrong or the span in the record is, and the two cannot both be right.

**When it fires.** When a record gives a temporal extent (with a start, an end or both) and at least one row has a parsed date outside it. Where several records give an extent, one is used, in the order ISO 19139, DataCite, PANGAEA, Zenodo, Dataverse; they are never merged. The row date and the limit are compared at the coarser of their two precisions, down to a day at most, so a row dated in the year of an end given as a year is inside. An open start or end is not a limit. Rows without a readable date are not counted. One finding lists the rows, their number and one example date.

**Example.** A record states a time span from 2019-05-01 to 2019-05-31 and the table has three rows dated in June 2019.

**What you can do.** Correct the dates in the table or the time span in the record.

## META-POINT-OUTSIDE-BBOX — Some rows of the table have a position outside the geographic area the record states

Severity: warning

**What it checks.** Some rows of the table have a position outside the geographic area the record states. Either the coordinates are wrong (a swapped sign, a swapped latitude and longitude) or the area in the record is too small.

**When it fires.** When a record gives a bounding box and at least one row has a latitude and a longitude outside it. The box is widened by half a unit of the last decimal place of the row coordinate and of the box edge, so a value rounded to the precision of the box is not outside it. A box whose west edge is greater than its east edge is read as crossing the antimeridian. A row at exactly 0, 0 is left to ROW-ZERO-COORD and not reported here. Rows without a position are not counted. One finding lists the rows, their number and one example position.

**Example.** A record gives a box from 54 to 56 degrees north and 10 to 12 degrees east, and four rows lie at 54.5 north and minus 11.2 (a lost sign).

**What you can do.** Correct the coordinates or enlarge the box in the record.

## META-VARIABLE-MISSING — The abstract of the record promises a measured quantity that the table has no column for

Severity: warning

**What it checks.** The abstract of the record promises a measured quantity that the table has no column for. A reader who relies on the abstract looks for the variable and finds nothing, or the column was dropped from the file.

**When it fires.** Only when the table holds a column the tool recognises as a measured quantity, the table is a whole file (not one sheet of a workbook), the record links to at most one data file, and the record has an abstract. For each known variable the abstract names by one of its terms (several languages; whole word, accents ignored) while no column is recognised as that variable and no header contains one of its terms, one finding is raised. Short acronyms of up to four characters, such as DIC or pH, are matched with their capitals. A term used as a modifier of an instrument or a process (fluorescence, sensor, probe, maximum and similar words next to it) does not count as a promise of a column, and nitrate or nitrite is covered by a combined nitrate and nitrite column.

**Example.** The abstract says that dissolved silica was measured, and the table has temperature, salinity and nitrate columns but nothing for silica.

**What you can do.** Add the column or correct the abstract.

## META-NO-DATES — Neither the table nor the record holds any date

Severity: error

**What it checks.** Neither the table nor the record holds any date. Data without a date cannot be placed in time, and OBIS and most repositories require one.

**When it fires.** For a table with rows and a supported layout, when no row has a date (a date cell that exists but cannot be read counts as a date column, and is reported by ROW-DATE-UNPARSEABLE) and no record has a temporal extent or a collection date. Publication dates are not used. A lookup table of the same file, which holds no measurement while another sheet of the file does, is skipped. For a workbook the sheets that lack a date are listed in one finding. When a join left rows without a date the finding names the joined sheet as the likely cause. For an empty eventDate column of a Darwin Core table only this rule speaks, and DWC-TERM-EMPTY stays silent.

**Example.** A table of temperature and salinity by depth with no date column, described by a record without a temporal extent.

**What you can do.** Add the sampling date to the table or a time span to the record. In /convert, where the converter has already said that no event has a date (CONV-EVENT-DATE-MISSING), this finding is not repeated. In /convert the finding is only shown and never stops the export.

## META-NO-POSITIONS — Neither the table nor the record holds any position

Severity: error

**What it checks.** Neither the table nor the record holds any position. OBIS needs decimalLatitude and decimalLongitude for every record, and a bounding box in the record is not a substitute for them.

**When it fires.** For a table with rows and a supported layout (and not a lookup table beside the data, as META-NO-DATES), when no latitude or longitude column is recognised, no row has a position, no row has a blank or unreadable position cell, and no record has a bounding box. A column that exists but is blank or unreadable is not this rule: ROW-NO-COORD, ROW-NON-NUMERIC and DWC-TERM-EMPTY speak for it. A position that is only in the record is left to the rules that compare the data with the record. Sheets of one workbook that lack a position are listed in one finding. Source: the OBIS Manual, location terms.

**Example.** A table of nutrient concentrations by sample number with no latitude and no longitude column, and a record without a bounding box.

**What you can do.** Add latitude and longitude columns in decimal degrees to the table.

**Citations.**

- [OBIS Manual, "Darwin Core" (iobis/manual darwin_core.md; manual.obis.org; read 2026-10-30)](https://manual.obis.org/darwin_core.html), "Location information can be documented in many DwC terms, but decimalLatitude and decimalLongitude are the minimally required terms"; "OBIS currently has seven required and one strongly recommended DwC term: occurrenceID, eventDate, decimalLongitude, decimalLatitude, scientificName, occurrenceStatus, basisOfRecord, scientificNameID"

## ROW-LAT-RANGE

Severity: error

**Thresholds.**

- latitude.min = -90 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11
- latitude.max = 90 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11

**Citations.**

- [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.3 "Impossible Location", PDF p.44

## ROW-LON-RANGE

Severity: error

**Thresholds.**

- longitude.min = -180 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11
- longitude.max = 180 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11

**Citations.**

- [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.3 "Impossible Location", PDF p.44

## ROW-LON-360

Severity: info

**Citations.**

- [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.3 "Impossible Location", PDF p.44

## ROW-LAT-EQ-LON

Severity: error

## ROW-LAT-EQ-LON-ISOLATED

Severity: warning

## ROW-LAT-EQ-LON-COARSE

Severity: info

## ROW-RAGGED

Severity: error

## ROW-NON-NUMERIC

Severity: warning

## ROW-NA-VARIANT

Severity: warning

## ROW-STATION-MOVED

Severity: warning

## ROW-STATION-SPREAD

Severity: info

## ROW-STATION-SPREAD-FAR

Severity: warning

## ROW-ON-LAND-NEAR

Severity: info

**Citations.**

- [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 4 "Position on land test", p.11
- [Natural Earth 1:10m physical vectors: land, minor islands, lakes, v5.1.2 (public domain)](https://www.naturalearthdata.com/downloads/10m-physical-vectors/), layers ne_10m_land, ne_10m_minor_islands, ne_10m_lakes; rasterised by scripts/land-mask.py

## ROW-ON-LAND

Severity: warning

**Citations.**

- [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 4 "Position on land test", p.11
- [Natural Earth 1:10m physical vectors: land, minor islands, lakes, v5.1.2 (public domain)](https://www.naturalearthdata.com/downloads/10m-physical-vectors/), layers ne_10m_land, ne_10m_minor_islands, ne_10m_lakes; rasterised by scripts/land-mask.py

## ROW-SHIP-SPEED

Severity: warning

**Thresholds.**

- speed.extreme = 40 knots. Source: [Met Office marine-qc (marine_qc) documentation, "Track check"](https://marine-qc.readthedocs.io/en/latest/track_check.html), section "Extreme speed check": "If the speed estimated from the locations at t-1 and t exceeds 40 knots, set the extreme speed check flag to fail." (the check itself compares one pair; both-sides logic: sections "Speed check" and "The combined track check")

**Citations.**

- [MEDATLAS Protocol, Part I: exchange format and quality checks for observed profiles, v3 (SISMER/IFREMER, Dec 2001)](https://nodc.ogs.it/repository/documents/guidelines/medman_v3.pdf), section 4.4.4 "Check the ship velocity", PDF p.29: "If the ship velocity \> maximum velocity of the ship (default is 15 knots) between two consecutive profiles, find the erroneous data (date or location)"
- [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.5 "Impossible Speed", PDF p.53 (per-platform maximum speed; the operator decides whether position or date/time is wrong)
- [World Ocean Database 2018 User's Manual (prerelease, v0.10; Garcia et al.)](https://www.ncei.noaa.gov/data/oceans/woa/WOD/DOC/WOD18-UsersManual_final.pdf), section 4 "Speed check", printed p.31: "If the speed between adjoining casts is unrealistic, the date/time may be in error, the position may be wrong, or the cast may not belong to this cruise/platform."

## ROW-SHIP-SPEED-UNUSUAL

Severity: info

**Thresholds.**

- speed.unusual = 15 knots. Source: [MEDATLAS Protocol, Part I: exchange format and quality checks for observed profiles, v3 (SISMER/IFREMER, Dec 2001)](https://nodc.ogs.it/repository/documents/guidelines/medman_v3.pdf), section 4.4.4 "Check the ship velocity", PDF p.29: "If the ship velocity \> maximum velocity of the ship (default is 15 knots) between two consecutive profiles, find the erroneous data (date or location)"
- speed.extreme = 40 knots. Source: [Met Office marine-qc (marine_qc) documentation, "Track check"](https://marine-qc.readthedocs.io/en/latest/track_check.html), section "Extreme speed check": "If the speed estimated from the locations at t-1 and t exceeds 40 knots, set the extreme speed check flag to fail." (the check itself compares one pair; both-sides logic: sections "Speed check" and "The combined track check")

**Citations.**

- [World Ocean Database 2018 User's Manual (prerelease, v0.10; Garcia et al.)](https://www.ncei.noaa.gov/data/oceans/woa/WOD/DOC/WOD18-UsersManual_final.pdf), section 4 "Speed check", printed p.31: "If the speed between adjoining casts is unrealistic, the date/time may be in error, the position may be wrong, or the cast may not belong to this cruise/platform."

## ROW-SHIP-SPEED-PAIR

Severity: info

**Thresholds.**

- speed.extreme = 40 knots. Source: [Met Office marine-qc (marine_qc) documentation, "Track check"](https://marine-qc.readthedocs.io/en/latest/track_check.html), section "Extreme speed check": "If the speed estimated from the locations at t-1 and t exceeds 40 knots, set the extreme speed check flag to fail." (the check itself compares one pair; both-sides logic: sections "Speed check" and "The combined track check")

**Citations.**

- [World Ocean Database 2018 User's Manual (prerelease, v0.10; Garcia et al.)](https://www.ncei.noaa.gov/data/oceans/woa/WOD/DOC/WOD18-UsersManual_final.pdf), section 4 "Speed check", printed p.31: "If the speed between adjoining casts is unrealistic, the date/time may be in error, the position may be wrong, or the cast may not belong to this cruise/platform."
- [MEDATLAS Protocol, Part I: exchange format and quality checks for observed profiles, v3 (SISMER/IFREMER, Dec 2001)](https://nodc.ogs.it/repository/documents/guidelines/medman_v3.pdf), section 4.4.4 "Check the ship velocity", PDF p.29: "If the ship velocity \> maximum velocity of the ship (default is 15 knots) between two consecutive profiles, find the erroneous data (date or location)"

## ROW-DATE-UNPARSEABLE

Severity: warning

**Citations.**

- [W3C Note, Date and Time Formats (profile of ISO 8601)](https://www.w3.org/TR/NOTE-datetime), Formats: complete date YYYY-MM-DD
- [DataCite Metadata Schema 4.6, property Date](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/date/), section 8 Date, allowed formats

## ROW-TIME-OTHER-DAY

Severity: warning

## ROW-DATE-MISSING

Severity: info

## ROW-YEAR-OUTLIER

Severity: warning

## ROW-JOIN-AMBIGUOUS

Severity: warning

## ROW-LONG-VALUE-SKIPPED

Severity: warning

## ROW-LONG-NO-PARAMETER

Severity: warning

## ROW-LONG-PARAMETER-MERGED

Severity: info

## ROW-LONG-KEY-EXTENDED

Severity: info

## ROW-KEY-IGNORED

Severity: info

## ROW-JOIN-KEY-BLANK

Severity: warning

## ROW-DATE-YYMMDD

Severity: info

## ROW-DATE-YY-AMBIGUOUS

Severity: warning

## ROW-TZ-UNKNOWN

Severity: info

## ROW-UNIT-MISSING

Severity: warning

## ROW-HEADER-CODE-SHAPE

Severity: warning

**Citations.**

- [NERC Vocabulary Server (NVS), collections P01 (BODC Parameter Usage Vocabulary) and P06 (BODC data storage units); read 2026-10-29](https://vocab.nerc.ac.uk/collection/P06/current/), Every concept of P06 has a four-character code (411 of 411 codes read, e.g. UPAA) and every concept of P01 an eight-character one (50 613 of 50 613 codes read, e.g. TEMPPR01; 66 begin with a digit); a code of another length has no concept page: https://vocab.nerc.ac.uk/collection/P01/current/D13CMOP11/ answers 404, https://vocab.nerc.ac.uk/collection/P01/current/D13CMOP1/ is a concept.

## ROW-DEPTH-SIGN

Severity: info

## ROW-DEPTH-MIXED-SIGN

Severity: warning

## ROW-MISSING-CODE

Severity: warning

## ROW-DM-COORDS

Severity: info

## ROW-HEMISPHERE-CONFLICT

Severity: warning

## ROW-HEMISPHERE-UNPAIRED

Severity: warning

## ROW-HEMISPHERE-MISSING

Severity: warning

## ROW-ZERO-COORD

Severity: error

**Citations.**

- [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: "if record.get_interpreted("decimalLongitude") == 0 and record.get_interpreted("decimalLatitude") == 0: record.set_flag(Flag.ZERO_COORD); record.dropped = True"
- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Integrity checks: "decimalLatitude and decimalLongitude are both 0" ... "It is theoretically possible that a sampling event happens at 0-0 coordinates, however it is very common to inadvertedly add 0-0 when the actual coordinates are missing. Therefore, 0-0 coordinates should always be double checked."

## ROW-NO-COORD

Severity: warning

**Citations.**

- [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: "if record.get_interpreted("decimalLongitude") is None or record.get_interpreted("decimalLatitude") is None: record.set_flag(Flag.NO_COORD); record.dropped = True"

## ROW-DEPTH-MIN-MAX

Severity: error

**Citations.**

- [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: "if record.get_interpreted("minimumDepthInMeters") \> record.get_interpreted("maximumDepthInMeters"): record.set_flag(Flag.MIN_DEPTH_EXCEEDS_MAX)"
- [OBIS obistools (R), R/check_depth.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_depth.R), check_depth, details: "minimum depth greater than maximum depth" (error); code: minGTmax \<- !is.na(maxd) & !is.na(mind) & mind \> maxd

## ROW-DEPTH-RANGE

Severity: warning

**Thresholds.**

- depth.min = -100000 m. Source: [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: misc.check_float(record.get("minimumDepthInMeters"), \[-100000, 11000\]) (the same call for maximumDepthInMeters; in_range = valid_range\[0\] \<= value \<= valid_range\[1\], out of range sets Flag.DEPTH_OUT_OF_RANGE)
- depth.max = 11000 m. Source: [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: misc.check_float(record.get("minimumDepthInMeters"), \[-100000, 11000\]) (the same call for maximumDepthInMeters; in_range = valid_range\[0\] \<= value \<= valid_range\[1\], out of range sets Flag.DEPTH_OUT_OF_RANGE)

**Citations.**

- [NOAA National Ocean Service, "How deep is the ocean?" (last updated 2026-09-23)](https://oceanservice.noaa.gov/facts/oceandepth.html), "Challenger Deep is approximately 10,935 meters (35,876 feet) deep." (the deepest part of the ocean)

## ROW-DATE-FUTURE

Severity: warning

**Citations.**

- [OBIS obis-qc (Python), obisqc/time.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/time.py), check_record: "if ms_end \> date_to_millis(datetime.date.today()): # date in the future record.set_flag(Flag.DATE_IN_FUTURE)"

## ROW-INVISIBLE-CHAR

Severity: warning

**Citations.**

- [OBIS Manual, "Common data quality issues" (iobis/manual common_qc.md; manual.obis.org)](https://manual.obis.org/common_qc.html), "Hidden characters and non-breaking spaces": "a value like Abra alba containing a non-breaking space will not match the same name typed with a normal space"; "OBIS removes leading and trailing whitespace from values during processing, but does not change spaces inside a value"; "Other invisible characters, such as tabs, line breaks within a cell, and zero-width spaces (U+200B), can cause similar problems"

## ROW-YEAR-DATE-MISMATCH

Severity: warning

## ROW-TEXT-MOJIBAKE

Severity: warning

## DWC-TERM-MISSING — A Darwin Core table has no column for a term that OBIS requires

Severity: error

**What it checks.** A Darwin Core table has no column for a term that OBIS requires. Without the required terms the records cannot be published in OBIS, so the file is not ready however good its other columns are.

**When it fires.** Only on Darwin Core input: an Archive, or a table with at least three distinct Darwin Core terms in its header (spelled exactly, capitals count) plus one of occurrenceID, eventID, parentEventID, scientificName, scientificNameID, taxonID, basisOfRecord or occurrenceStatus. With eventID or parentEventID and no occurrence term it is an Event core, otherwise an Occurrence core. Always required: eventDate, decimalLatitude, decimalLongitude and an identifier (eventID for Event; occurrenceID or eventID for Occurrence; an Archive core id may stand for it). Occurrence also needs scientificName, occurrenceStatus and basisOfRecord. An occurrence table with an eventID column not blank in every row is the occurrence side of an event and occurrence pair, and then the date and coordinates are not required of it. Sources: obistools check_fields, OBIS Manual.

**Example.** A table with the columns occurrenceID, scientificName, eventDate, decimalLatitude and decimalLongitude but no occurrenceStatus and no basisOfRecord column is reported as missing occurrenceStatus and basisOfRecord.

**What you can do.** Add a column for each listed term and fill it. In /convert this rule is applied to the Event and Occurrence tables the converter writes, so the remedy is in the declarations that feed those tables, not in a column you add by hand. In /convert this finding blocks the export.

**Citations.**

- [OBIS obistools (R), R/check_fields.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_fields.R), check_fields: required \<- c("eventDate", "decimalLongitude", "decimalLatitude", "scientificName", "scientificNameID", "occurrenceStatus", "basisOfRecord"); "Missing or empty required fields are reported as errors"
- [OBIS Manual, "Common format issues" (iobis/manual common_formatissues.md; manual.obis.org)](https://manual.obis.org/common_formatissues.html), "Missing required fields": "one (or more) of the eight required terms for OBIS"; "occurrenceID or eventID"; "scientificNameID (strongly recommended)"

## DWC-TERM-EMPTY — A column that OBIS requires exists but has empty cells

Severity: error

**What it checks.** A column that OBIS requires exists but has empty cells. A record without a required value cannot be published, so the empty rows must be filled or dealt with before submission.

**When it fires.** Only on Darwin Core input, one finding per column. The identifier column (occurrenceID or eventID, or the archive id) and, for an Occurrence core, scientificName, occurrenceStatus and basisOfRecord fire when any cell is blank after trimming. eventDate, decimalLatitude and decimalLongitude fire only when the column is blank in every row: a few missing positions are ROW-NO-COORD, a few missing dates are ROW-DATE-MISSING, and a date missing everywhere in the data and the metadata is reported by META-NO-DATES alone. Those three are not checked on the occurrence side of an event and occurrence pair. Sources: obistools check_fields and the OBIS Manual.

**Example.** A table of 40 rows whose scientificName column is blank on lines 7, 8, 19 and 33 gets one finding naming those four lines.

**What you can do.** Fill the cells, or remove the rows that cannot be filled. In /convert the rule is applied to the tables the converter writes; for a missing position or date the converter says it first in the terms of the source sheet (CONV-POSITION-NONE, CONV-EVENT-DATE-MISSING) and this finding is then not repeated. In /convert this finding blocks the export.

**Citations.**

- [OBIS obistools (R), R/check_fields.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_fields.R), check_fields: required \<- c("eventDate", "decimalLongitude", "decimalLatitude", "scientificName", "scientificNameID", "occurrenceStatus", "basisOfRecord"); "Missing or empty required fields are reported as errors"
- [OBIS Manual, "Common format issues" (iobis/manual common_formatissues.md; manual.obis.org)](https://manual.obis.org/common_formatissues.html), "Missing required fields": "one (or more) of the eight required terms for OBIS"; "occurrenceID or eventID"; "scientificNameID (strongly recommended)"

## DWC-RECOMMENDED — A Darwin Core table lacks a column that OBIS recommends, or leaves it empty in every row

Severity: warning

**What it checks.** A Darwin Core table lacks a column that OBIS recommends, or leaves it empty in every row. The data are still publishable, but depth and a persistent taxon identifier make the data easier to check and the names easier to match.

**When it fires.** Only on Darwin Core input, once per table, listing every recommended term that is absent or blank in every row. The terms are minimumDepthInMeters and maximumDepthInMeters (not asked of the occurrence side of an event and occurrence pair) and, for an Occurrence core, scientificNameID. The OBIS Manual calls scientificNameID strongly recommended; obistools lists it as required, and this tool follows the manual. Sources: obistools check_fields and the OBIS Manual.

**Example.** An occurrence table with all required columns but no scientificNameID column and no depth columns is told that scientificNameID, minimumDepthInMeters and maximumDepthInMeters are recommended.

**What you can do.** Add the columns, for example the persistent identifier of each name from a taxon register, and the depth range of the sample. In /convert a lacking scientificNameID on the Occurrence table is not raised by this rule but by CONV-NAMEID-MISSING; the depth terms are still judged. In /convert this finding does not block the export, but it needs your acceptance (one tick for the rule) before the export works.

**Citations.**

- [OBIS obistools (R), R/check_fields.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_fields.R), check_fields: recommended \<- c("minimumDepthInMeters", "maximumDepthInMeters"); "missing or empty recommended fields are reported as warnings"
- [OBIS Manual, "Common format issues" (iobis/manual common_formatissues.md; manual.obis.org)](https://manual.obis.org/common_formatissues.html), "Missing required fields": "one (or more) of the eight required terms for OBIS"; "occurrenceID or eventID"; "scientificNameID (strongly recommended)"

## DWC-VOCAB-VALUE — A basisOfRecord or occurrenceStatus value is not on the list OBIS accepts

Severity: warning

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

Severity: error

**What it checks.** In an Event core the same eventID names more than one event. The eventID is the key of an event, and records that point at it cannot say which event they belong to when it repeats.

**When it fires.** Only on Darwin Core input read as an Event core; outside an archive only when the table has at least one of the columns eventDate, decimalLatitude and decimalLongitude. In a Darwin Core Archive every repeated eventID fires, since the archive has one row per event. In any other table (a flattened sheet repeats the eventID on every depth level) an eventID fires only when its rows disagree on the date or on a coordinate; dates are compared by their parsed value and coordinates as numbers, so 60.5 and 60.50 agree. A repeated eventID whose rows agree is not reported. The finding lists every row of every repeated eventID and counts the ids. It does not run on an Occurrence core, where one eventID may repeat. Source: obistools check_eventids.

**Example.** An event table in which eventID S-12 appears on two lines with two different dates is reported, with both lines.

**What you can do.** Give each event its own eventID, or merge rows that describe the same event. In /convert this finding blocks the export.

**Citations.**

- [OBIS obistools (R), R/check_eventids.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_eventids.R), check_eventids: "check duplicate eventIDs" (error: "eventID ... is duplicated"); "check if all parentEventIDs have corresponding eventID" (error: "parentEventID ... has no corresponding eventID")

## DWC-PARENT-DANGLING — A parentEventID points at an event that is not in the eventID column of the same table

Severity: error

**What it checks.** A parentEventID points at an event that is not in the eventID column of the same table. The hierarchy of events then has a broken link, and a reader cannot rebuild the cruise, station and sample structure.

**When it fires.** Only on Darwin Core input read as an Event core that has a parentEventID column. Every non-blank parentEventID that matches no eventID of the table is listed with its lines, and the finding counts the different missing parents. It does not run when the archive was read only in part (the first 200000 rows, see IN-DWCA-PARTIAL), because the parent may be in a row that was not read. Sources: obistools check_eventids and Biocheck.

**Example.** An event table whose parentEventID cells name CRUISE-A on three lines, while no eventID is CRUISE-A, is reported.

**What you can do.** Correct the identifier, or add the missing parent event as a row. In /convert this finding blocks the export.

**Citations.**

- [OBIS obistools (R), R/check_eventids.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_eventids.R), check_eventids: "check duplicate eventIDs" (error: "eventID ... is duplicated"); "check if all parentEventIDs have corresponding eventID" (error: "parentEventID ... has no corresponding eventID")
- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Integrity checks: "if the parentEventID field is populated, it must be populated with an existing eventID from the eventID field. Adding to the parentEventID field something different than an existing eventID is incoherent."

## DWC-PARENT-LOOP — The eventID and parentEventID columns form a circle: an event is its own ancestor

Severity: error

**What it checks.** The eventID and parentEventID columns form a circle: an event is its own ancestor. A hierarchy that never reaches a top event cannot be read, and GBIF flags it as an infinite lineage.

**When it fires.** Only on Darwin Core input read as an Event core that has a parentEventID column. Each eventID is followed to its parent, then to that parent, and so on; every row on a circle is listed and counted. A row whose parentEventID equals its own eventID is a circle of one. When an eventID repeats, its first non-blank parent is used. The search visits each event once. It does not run when the archive was read only in part (the first 200000 rows, see IN-DWCA-PARTIAL). Source: the GBIF issue PARENT_EVENT_INFINITE_LINEAGE.

**Example.** Event A has parent B, B has parent C and C has parent A: all three rows are reported.

**What you can do.** Correct the parentEventID of one event on the circle so that the chain ends in an event without a parent. In /convert this finding blocks the export.

**Citations.**

- [GBIF API, enumeration of OccurrenceIssue (read 2026-10-24)](https://api.gbif.org/v1/enumeration/basic/OccurrenceIssue), OccurrenceIssue value PARENT_EVENT_INFINITE_LINEAGE (a loop in the eventID / parentEventID hierarchy)

## DWC-OCCURRENCEID-DUPLICATE — The same occurrenceID is used for more than one record of an Occurrence core

Severity: error

**What it checks.** The same occurrenceID is used for more than one record of an Occurrence core. The occurrenceID is the key of a record, and a repeated key makes later updates and links ambiguous.

**When it fires.** Only on Darwin Core input read as an Occurrence core with an occurrenceID column (in an archive without that column, the core id column is used, but not when the table has an eventID column). Every non-blank occurrenceID that appears in more than one row fires; the finding lists every row of every repeated id, counts the ids and shows one example. Source: Biocheck, the occurrenceID is unique in the occurrence table.

**Example.** A table in which occurrenceID occ-0015 appears on lines 16 and 41 is reported with both lines.

**What you can do.** Give each record its own identifier. In /convert a repeat that the conversion already named in the terms of the source sheet (CONV-ID-DUPLICATE for occurrences) is not said a second time by this rule. In /convert this finding blocks the export.

**Citations.**

- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Integrity checks: "Checks that occurrenceID is unique in the occurrence table" ... "The occurrenceID acts as the Primary Key for the occurrence table, therefore two records with the same occurrenceID cannot exist in the occurrence table."

## DWC-EVENTDATE-NOT-ISO — Dates in a column headed eventDate are not written in ISO 8601

Severity: warning

**What it checks.** Dates in a column headed eventDate are not written in ISO 8601. Darwin Core and OBIS read eventDate as text in that form, so a date such as 14/06/2011 is not understood, or is read in the wrong order.

**When it fires.** On any table with a column headed exactly eventDate (with or without the dwc: prefix), Darwin Core input or not. A cell fires unless it is blank, a missing-value token (NA, N/A, a dash, null, nd) or a valid ISO 8601 value: a year, a year and month, a date, an ordinal or week date, a date with a time and an optional zone (hour 24 is not accepted), a basic form such as 20110614 (only from the year 1700), or an interval of two such values joined by one slash, whose end may be shortened (2011-06-14/20), or an interval with a duration. A spreadsheet cell formatted as a date is not judged. Nothing is changed. The finding lists the lines and one example.

**Example.** The cell 14/06/2011 in an eventDate column is reported; 2011-06-14 is accepted.

**What you can do.** Write the dates in ISO 8601, for example 2011-06-14 or 2011-06-14/2011-06-20. Nothing is changed in your file. In /convert the rule is applied to the tables the converter writes. In /convert the finding is only shown and never stops the export.

## XF-DUPLICATE-SAMPLES — Two files hold the same samples

Severity: info

**What it checks.** Two files hold the same samples. If both are used for one analysis, the samples count twice and any statistic is biased towards them.

**When it fires.** For every pair of tables that share at least one recognised variable. A sample of one table matches a sample of the other when it has the same station (names compared after normalisation, as for XF-STATION-ALIAS) or, for rows without a station, the same position within the rounding of the coordinates; the same calendar day (a date with no day is never matched); and the same depth in the same unit, within rounding (a depth in one unit is never matched to a depth in another, and two missing depths match each other). Each row matches at most one row of the other table. A match counts only when at least one shared variable has a value in both rows, so the same place and time measured for different variables is one sample, not a duplicate. One finding per pair of tables, with the number of matched rows.

**Example.** The sheets "Cruise A bottles" and "Cruise A CTD" both have a row for station S12 on 2019-05-03 at 10 m with a temperature value; the pair is reported with the number of such rows.

**What you can do.** Decide which table is the source of record and drop the other rows, or keep both and make sure the analysis counts each sample once. Two tables that really are the same measurement published twice are a common case in a data release. In /convert this finding is only shown and never stops the export.

## XF-DATE-CONFLICT — The same station and depth appear in two files with the same values but different dates

Severity: warning

**What it checks.** The same station and depth appear in two files with the same values but different dates. One of the dates is probably wrong, for example a day and month swapped, or a year typed over.

**When it fires.** For every pair of tables that share at least two recognised variables. Rows of the two tables are paired by normalised station name and the same depth (same unit, within rounding; two missing depths agree). Both rows must have a date known to the day, and the dates must differ. For every shared variable that has a value in both rows the values are compared: the rule fires when at least two variables are equal and none differs. One finding per station and pair of tables, giving the station, the two dates and one example line of each file. When one of the two dates is a two-digit-year date from a column whose order is open (see ROW-DATE-YY-AMBIGUOUS) and it was read in the default order, a sentence says that the conflict may come from the reading rather than from a wrong date.

**Example.** Station S12 has temperature 11.4 and salinity 35.1 at 10 m in two files, dated 2019-05-03 in one and 2019-03-05 in the other; the pair of dates is reported.

**What you can do.** Find which date is right from the logbook or the other file and correct the wrong one. When the finding says that a two-digit-year date may have been misread, write the year with four digits, or in /convert state the order of that column (see ROW-DATE-YY-AMBIGUOUS); the conflict is then judged on the settled reading. In /convert this finding is only shown and never stops the export.

## XF-STATION-ALIAS — Two station names that differ only in spelling occur in the loaded tables, so they are probably the same station written in two ways

Severity: info

**What it checks.** Two station names that differ only in spelling occur in the loaded tables, so they are probably the same station written in two ways. Left as they are, the station is split into two in any grouping by name and the other cross-file rules cannot match it.

**When it fires.** Across all loaded tables, when two different station names become equal after normalisation: only the part after the last slash is kept, letters are made upper case and spaces are removed. A name that is the same in every table is not reported. One finding per pair of spellings; the first spelling is the one that is used by the most tables, then by the most rows. The finding names both spellings.

**Example.** One file calls a station "ST 7" and another calls it "st7"; "ST 7" and "st7" are reported as the same station.

**What you can do.** Choose one name for the station and use it in every file. The tool does not rename anything. In /convert this finding is only shown and never stops the export.

## XF-UNIT-CONFLICT — The same variable has the same numbers in two files, but one file labels them per volume and the other per mass

Severity: warning

**What it checks.** The same variable has the same numbers in two files, but one file labels them per volume and the other per mass. If the numbers are equal, at least one label is wrong; a per-litre and a per-kilogram value of a nutrient differ by about the density of the water, a few per cent, and an amount of substance per volume and per mass are not the same unit.

**When it fires.** For every pair of tables that share a recognised variable, when one table gives it in a unit of amount per volume (for example µmol/L) and the other in a unit of amount per mass (for example µmol/kg), and more than half of the samples that match in both tables (the matching of XF-DUPLICATE-SAMPLES) and have a value in both are equal within rounding. One finding per variable and pair of columns, giving the number of matched samples and how many of them are equal. Units that are in the same dimension, such as mg/L and µmol/L, are not compared here (CHEM-UNIT-PAIR looks at those within one table). Sources: the GLODAPv2 conversion of per-litre to per-kilogram values with seawater density, and the UNESCO seawater density tables.

**Example.** Nitrate is 5.2, 8.9 and 12.4 in a file labelled µmol/L and the same three numbers in a matching file labelled µmol/kg; all three matched samples are equal, so the units are reported.

**What you can do.** Find which label is correct from the methods of the data and correct the wrong one; if a conversion was meant, convert the numbers with the density of the water instead of copying them. In /convert this finding is only shown and never stops the export.

**Citations.**

- [Lauvset et al. (2024), GLODAPv2.2023, Earth System Science Data 16, 2047](https://essd.copernicus.org/articles/16/2047/2024/), section 3.1 (per-litre to per-kilogram conversion with seawater density)
- [Fofonoff & Millard (1983), UNESCO Technical Papers in Marine Science 44 (GitHub-hosted copy)](https://raw.github.com/ocefpaf/python-seawater/master/docs/UNESCO-TechPaper44_eo.pdf), PDF p.23, check values of seawater density

## XF-POSITION-SWAP — Two stations have exchanged positions between files: the position of station A in one file belongs to station B in the other, and the other way round

Severity: warning

**What it checks.** Two stations have exchanged positions between files: the position of station A in one file belongs to station B in the other, and the other way round. Names were probably mixed up in one of the files, which puts every value of both stations in the wrong place.

**When it fires.** For every pair of tables that both give positions for the same station names. Each station gets a representative position in each table (the most frequent rounded position of its rows; rows whose latitude equals their longitude are ignored, as ROW-LAT-EQ-LON reports them). A swap is found when two stations both moved between the tables (their positions do not agree within rounding), are distinct places in each table, and the exchanged assignment is strictly closer than the same-name assignment in both directions, with each being the other's best partner. A table swapped against several others is named once, with its partners listed together. Stations that are part of a swap are not also reported by XF-POSITION-CONFLICT.

**Example.** Station S1 is at 54.10 N, 18.60 E and S2 at 54.40 N, 19.10 E in one file; in the other S1 is at 54.40 N, 19.10 E and S2 at 54.10 N, 18.60 E.

**What you can do.** Check the station names against the logbook and correct the file with the names mixed up. In /convert this finding is only shown and never stops the export.

## XF-POSITION-CONFLICT — The same station is at clearly different positions in different files

Severity: warning

**What it checks.** The same station is at clearly different positions in different files. One of the positions is wrong or the name is used for two places, and every value of the station is mapped to the wrong location.

**When it fires.** For every station name that occurs in at least two tables and is not part of a swap. Each table gets a representative position (the most frequent rounded position of the station's rows, with the range of all its rows). Two tables disagree when neither one's representative position lies inside the range the other one spans, with rounding of both included, so a station sampled along a short track is not flagged for a point on it. With two tables both are named. With three or more, only an outlier is reported: one that disagrees with every other table and lies farther from each of them than any two of the others lie from each other; when the others are sheets of one workbook they count as one source and both sides are named. The finding lists the position in each table and the largest offset in kilometres. No distance tolerance is applied, because no citable one exists.

**Example.** Station S5 is at 54.20 N, 18.70 E in one file and at 54.20 N, 81.70 E in another; the two positions and the offset are reported.

**What you can do.** Check the station position against the logbook and correct the wrong file; if the name has been used for two different places, give them different names. In /convert this finding is only shown and never stops the export.

## CHEM-UNIT-PAIR — The same chemical quantity is given twice, once as mass per volume and once as amount per volume, and the two columns do not agree after conversion

Severity: warning

**What it checks.** The same chemical quantity is given twice, once as mass per volume and once as amount per volume, and the two columns do not agree after conversion. One of the columns, or one of its unit labels, is wrong, and a reader who trusts the wrong one is off by a factor of the molar mass.

**When it fires.** When one table has two columns of the same recognised variable, one with a unit of mass per litre (g/L with an SI prefix, for example mg/L) and one with a unit of amount per litre (mol/L with a prefix, for example µmol/L). The mass column is converted with the molar mass of the element the variable is reported as, and the rule fires when a row differs from the other column by more than the rounding of the two reported values can explain. One finding per pair of columns, listing every disagreeing row. The elements and molar masses are carbon 12.011, nitrogen 14.007, phosphorus 30.974 and silicon 28.085 g/mol (CIAAW atomic weights). Covered: DOC, POC, DIC (carbon); nitrate, nitrite, ammonium, DIN, DON, PON, TN, TDN (nitrogen); phosphate, DOP, TDP (phosphorus); silicate (silicon). Any other variable is not converted and not judged. Rows with a missing or non-numeric value are skipped.

**Example.** A nitrate column in mg/L reads 0.62 and a nitrate column in µmol/L on the same row reads 8.1; 0.62 mg/L of nitrogen is about 44.3 µmol/L, so the row disagrees.

**What you can do.** Decide which column is right, correct the wrong values or the wrong unit label, or delete the duplicate column. Nothing in your file is changed by the tool. In /convert this finding is only shown and never stops the export.

**Thresholds.**

- molarMass.C = 12.011 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "6 C carbon 12.011 ± 0.002"
- molarMass.N = 14.007 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "7 N nitrogen 14.007 ± 0.001"
- molarMass.P = 30.974 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "15 P phosphorus 30.974 ± 0.001"
- molarMass.Si = 28.085 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "14 Si silicon 28.085 ± 0.001"

## CHEM-DIC-GT-TA — Dissolved inorganic carbon is larger than total alkalinity

Severity: warning

**What it checks.** Dissolved inorganic carbon is larger than total alkalinity. In sea water alkalinity is normally the larger of the two, so a reversed pair usually means swapped columns, a wrong unit on one of them, or a mislabelled variable.

**When it fires.** When one table has a DIC column and a TA column with the same unit, and in at least one row DIC is larger than TA by more than the rounding of the two reported values can explain. Rows are grouped by cruise when the table has a cruise column, otherwise the whole table is one group; there is one finding per DIC and TA column pair and group that has at least one such row. The finding gives how many of the rows with both values are affected and the median of TA minus DIC over the group, rounded to a whole number. Rows with a missing or non-numeric value are skipped. Columns with different units are not compared. Sources: Dickson, Sabine and Christian (2007) guide to best practices for ocean CO2 measurements, and TEOS-10 for the seawater background.

**Example.** A group of 60 rows has DIC 2310 and TA 2285 in µmol/kg on 5 of the rows, and TA above DIC on the other 55; the group is reported with 5 of 60 rows.

**What you can do.** Check that the DIC and TA columns are not swapped, that both carry the same unit, and that the flagged rows are not typing errors. If the sample is not from sea water, the pattern can be genuine; the finding then stays as a note. In /convert this finding is only shown and never stops the export.

**Citations.**

- [TEOS-10 Manual, IOC Manuals and Guides 56](https://www.teos-10.org/pubs/TEOS-10_Manual.pdf), Appendix A.4, printed pp.80-81 (Standard Seawater: TA 2300 and DIC 2080 µmol/kg at SP = 35)
- [Dickson, Sabine & Christian (2007), Guide to Best Practices for Ocean CO2 Measurements, PICES Special Publication 3](https://www.ncei.noaa.gov/access/ocean-carbon-acidification-data-system/oceans/Handbook_2007/Guide_all_in_one.pdf), SOP 2 section 1, PDF p.39 (oceanic DIC 1800–2300 µmol/kg)
- [Dickson, Sabine & Christian (2007), Guide to Best Practices for Ocean CO2 Measurements, PICES Special Publication 3](https://www.ncei.noaa.gov/access/ocean-carbon-acidification-data-system/oceans/Handbook_2007/Guide_all_in_one.pdf), SOP 3a section 1, PDF p.53 (oceanic TA 2000–2500 µmol/kg)

## CHEM-RANGE — Values of temperature, salinity, pressure, oxygen or pH lie outside the range used by the quality control of open-ocean profiling programmes

Severity: warning

**What it checks.** Values of temperature, salinity, pressure, oxygen or pH lie outside the range used by the quality control of open-ocean profiling programmes. Such values are often unit mistakes, swapped columns or leftover codes, and they would distort any analysis that uses the file.

**When it fires.** When a column that is recognised as one of the five quantities, with a unit the range was written for, holds at least one value outside the range. One finding per column, with the count and the first offending value. Ranges: temperature -2.5 to 40 °C and salinity 2 to 41 (Argo CTD range test); pressure of at least -5 dbar, with no upper bound (Argo); oxygen -5 to 600 µmol/kg (Argo dissolved oxygen); pH 6.5 to 9 (GTSPP). The unit must match: temperature in °C, pressure in dbar, oxygen in µmol/kg, salinity in PSU or with no unit, pH in pH units or with no unit. Oxygen given per volume (mL/L, mg/L, µmol/L) is not compared, since converting to per kilogram needs the density of the water, and the report says that oxygen was not checked. The values -99, -999 and -9999 are left to ROW-MISSING-CODE, unless the converter has already treated them as values.

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
