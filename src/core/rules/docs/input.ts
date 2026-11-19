// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RuleDoc } from './types';

/*
 * Input rules: getting a record or a file and reading it. Each text was checked against the code that raises the id (src/core/sources, src/core/parse, src/core/recognize/layout.ts,
 * src/worker/handler.ts, src/app/loadInput.ts) and against the registry in src/core/rules/input.ts. The /convert sentence in each action follows the rule's export policy.
 */
export const DOCS: Readonly<Record<string, RuleDoc>> = {
  'IN-NO-DATA-FILE': {
    checks:
      'A record that was opened holds no file the tool can read as a data table, only other files such as PDFs, images or text documents. Nothing in it can be checked.',
    fires:
      'When a record from any source (Dataverse, Zenodo, GeoNetwork or a plain link) was read and none of its files is a table in a format the tool reads: csv, tsv, txt, tab, xlsx, xls or ods. The finding lists the names of the files that were found; at most ten names are listed. Held-back files are mentioned by their own findings.',
    example:
      'A record lists report.pdf, map.png and notes.docx and no table; the finding names all three.',
    action:
      'Add the table itself as CSV or Excel to the tool, or open the record and download the data file first. If the deposit has no table at all, there is nothing for this tool to check. In /convert this finding blocks the export.',
  },
  'IN-RECORD-INACCESSIBLE': {
    checks:
      'The record behind a link could not be opened, so its metadata and files were not read. The reason is a failed request to the host, and the finding names the host and the HTTP status code.',
    fires:
      'When a request for the record or one of its files gets an error status such as 403, 404 or 500, or a proxy error (429, 504, a 413 on a file that is not an archive), or when the answer is not JSON or not Dataverse metadata, or when a Dataverse version is not released. The wording has three forms: a server fault for status 500 to 599 (usually temporary), a record that may be private or unpublished for 403 and 404, and a neutral "try again later" for any other status, with no guess about the reason. Whatever the other sources of the same run gave is still used.',
    example:
      'A link to a repository record returns status 404; the finding reads that the record on that host could not be opened (error 404).',
    action:
      'Check the link. For a server fault or another status try again later. For a private or unpublished record (403, 404) download its files or metadata and add them to the tool yourself. In /convert this finding blocks the export.',
  },
  'IN-HOST-NOT-ALLOWED': {
    checks:
      'A link points to a host the tool is not allowed to open, so nothing was fetched from it.',
    fires:
      'When a link in a record, or one the person pasted, names a host that is not on the tool\'s list of data hosts. Only the host name is reported, never the whole address.',
    example:
      'A record links its data to a personal file-sharing site that is not on the list; the finding names that site and nothing is downloaded.',
    action:
      'Download the file from that site yourself and add it to the tool. The tool does not widen its list of hosts for one run. In /convert this finding is only shown and never stops the export.',
  },
  'IN-FETCH-BLOCKED': {
    checks:
      'The browser could not download from a host, so the file was not read. This is a limit of the browser mode, not a fault in the data.',
    fires:
      'In browser mode, when a download fails before any answer arrives because the host does not allow the request (a cross-origin or content-security rule) or the network failed. It also appears in server mode when the page\'s own fetch route could not be reached, or when a body that is not an archive was cut off midway. The finding names the host.',
    example:
      'A link to a data file on a repository that sends no cross-origin permission; the browser refuses and the finding names the repository.',
    action:
      'Download the file yourself and add it to the tool, or try server mode. In /convert this finding is only shown and never stops the export.',
  },
  'IN-FETCH-TIMEOUT': {
    checks:
      'A host did not start to answer in time, so the browser stopped waiting and the file was not read.',
    fires:
      'In browser mode, when a download receives no response within 30 seconds. A slow body that has already started is not a timeout: a download cut off after it began is IN-FETCH-INTERRUPTED. The finding names the host.',
    example:
      'A repository server is overloaded and sends nothing for 30 seconds; the request is abandoned and the host is named.',
    action:
      'Try again later, or switch to server mode, or download the file yourself and add it to the tool. In /convert this finding is only shown and never stops the export.',
  },
  'IN-FETCH-INTERRUPTED': {
    checks:
      'The download of an archive from an archive server was cut off or ran out of time before it was complete, so the archive was not checked at all.',
    fires:
      'When the download of a Darwin Core Archive from a listed IPT server times out (the proxy gave up after 90 s on an archive) or the connection closes before the whole body arrived. The finding names the host. A partly received archive is never read.',
    example:
      'A large archive from a slow IPT server stops after a few megabytes; nothing of it is read.',
    action:
      'Try again in a few minutes, or download the archive (.zip) yourself and add it to the tool. In /convert this finding blocks the export.',
  },
  'IN-ARCHIVE-TOO-LARGE': {
    checks:
      'An archive from an IPT server is larger than the limit for archives, IPT_MAX_BYTES (100 MB).',
    fires:
      'When the proxy refuses an archive from an IPT server with HTTP status 413 because it is larger than IPT_MAX_BYTES (100 MB, the proxy cuts at the same size), or when, on the client side, a body without a stated length breaks off within 1 MB of that size. The finding names the host and the limit in megabytes. An archive added by hand over 100 MB is not this rule: it is IN-DWCA-UNREADABLE with the reason ZIP-TOO-LARGE.',
    example:
      'An archive of 600 MB is refused by the proxy; the finding gives the host and 100.',
    action:
      'Download the archive yourself, unpack it and add the core file (for example occurrence.txt) to the tool. The unpacked file is read as an ordinary table. In /convert this finding blocks the export.',
  },
  'IN-ARCHIVE-DAILY-BUDGET': {
    checks:
      'This client has used the daily allowance for archive downloads through the tool\'s server, so the archive was not fetched and not checked.',
    fires:
      'When the proxy answers HTTP status 429 with the reason archive_daily_budget: this IP address has used its daily allowance of 200 archive requests or 2 GiB of archive bytes. The finding names the host of the archive. The allowance starts again within 24 hours.',
    example:
      'After many large archives in one day the next request is refused; the host of that archive is named.',
    action:
      'Wait until the allowance renews (within 24 hours), or download the archive (.zip) yourself and add it to the tool. In /convert this finding blocks the export.',
  },
  'IN-ARCHIVE-BUSY': {
    checks:
      'Too many archive downloads are already running from this IP address, so this one was not started and the archive was not checked.',
    fires:
      'When the proxy answers HTTP status 429 with the reason archive_busy: this client already has the maximum of 2 archive downloads in flight. The finding names the host.',
    example:
      'Two archives are being downloaded and a third is requested; the third is refused until one finishes.',
    action:
      'Wait until the running downloads finish and check again, one archive at a time. In /convert this finding blocks the export.',
  },
  'IN-IPT-HOST-NOT-LISTED': {
    checks:
      'The Darwin Core Archive of a dataset lives on a server that is not on the tool\'s fixed list of IPT servers, so it was not downloaded.',
    fires:
      'When a GBIF or OBIS dataset points to an archive whose host, address scheme, port or credentials do not match the static list of IPT servers the tool reads. The finding names the host.',
    example:
      'A GBIF dataset has its archive on a small institute server that is not on the list; the host is named and nothing is fetched.',
    action:
      'Download the archive (.zip) yourself and add it to the tool. In /convert this finding is only shown and never stops the export.',
  },
  'IN-NO-DWC-ARCHIVE': {
    checks:
      'GBIF or OBIS knows the dataset but lists no downloadable Darwin Core Archive for it, so there is nothing to check.',
    fires:
      'When the registry record of a GBIF dataset has no archive endpoint of the Darwin Core Archive type, or the OBIS record has no archive address. The finding names the registry.',
    example:
      'A GBIF dataset page shows the dataset only as metadata; its record lists no archive.',
    action:
      'Get the data from the publisher and add the table or the archive to the tool. In /convert this finding blocks the export.',
  },
  'IN-FILE-HELD-BACK': {
    checks:
      'A file of a linked record is held back by its source (restricted access or an embargo), so it was not downloaded and not checked. This is not an error in the data, but the lack of remarks says nothing about the file.',
    fires:
      'When the source marks a file of a Dataverse dataset as restricted or embargoed, or when downloading the file returns status 401 or 403. The finding names the file and the host. The other files of the record are still read.',
    example:
      'A dataset has an open file samples.csv and a restricted file raw.csv; raw.csv gets this finding.',
    action:
      'Ask the data owner for access, then add the file to the tool. In /convert this finding is only shown and never stops the export.',
  },
  'IN-FILE-TOO-LARGE': {
    checks:
      'A data file of a linked record is larger than the most the tool reads from a link, so it was not downloaded and not checked.',
    fires:
      'When a file listed in a Dataverse record is a readable table type, is not held back, and its stated size is above LINKED_FILE_MAX_BYTES (30 MB), or when the download answers 413 and no size is stated. The finding names the file and gives the limit in megabytes.',
    example:
      'A deposit holds survey.csv of 45 MB and the limit is 30 MB; the file gets this finding and the rest of the record is read.',
    action:
      'Download the file and add it to the tool yourself, or split it into smaller tables. A clean result for the other files says nothing about this one. In /convert this finding is only shown and never stops the export.',
  },
  'IN-FILES-NOT-READ': {
    checks:
      'Some files of a linked record may hold data but are in a format the tool does not read, such as zip or NetCDF, so they were not checked. The report names them so that it never reads as if the whole dataset was checked.',
    fires:
      'When a Dataverse record has at least one table the tool reads and, besides, files that are not tables and are not documents, images or a README. The finding names those files. Documents, pictures and READMEs describe the deposit and are left out of the list. If the record has no table at all, IN-NO-DATA-FILE is raised instead.',
    example:
      'A record holds counts.csv and also model.nc and images.zip; the finding names model.nc and images.zip.',
    action:
      'If they hold data, unpack them or save them as CSV or Excel and add them to the tool. In /convert this finding is only shown and never stops the export.',
  },
  'IN-DATAVERSE-FILES': {
    checks:
      'A note about what was read from a Dataverse dataset: which version, and in which form its tables were read.',
    fires:
      'Every time a Dataverse dataset is read. It states the version (the latest published one) and the host. It also says whether the tables were read as the author uploaded them, as the .tab copy Dataverse made when the original cannot be read, or that no data file was read at all.',
    example:
      'Version 2.1 of a dataset is read from a Dataverse host; one table in its original form and one as the .tab copy.',
    action:
      'Nothing to fix. If the dataset has been updated since, run the check again to read the newer version. In /convert this finding is only shown and never stops the export.',
  },
  'IN-FILE-UNREADABLE': {
    checks:
      'None of the files that were added could be read at all, for example a damaged workbook or a file in an unsupported format. Nothing was checked, so the absence of other remarks does not mean the data are fine.',
    fires:
      'When every added file fails to parse. The finding lists the names of the files, comma-separated. If at least one file is read, a failing file is not reported by this rule.',
    example:
      'A workbook that was cut off during copying cannot be opened; the finding names it.',
    action:
      'Save the file again, for example as CSV or Excel, and add it once more. In /convert this finding blocks the export.',
  },
  'IN-LAYOUT-UNSUPPORTED': {
    checks:
      'The table is laid out in a way the tool cannot read as one header row and one row per sample, so it was not read.',
    fires:
      'When the layout reader finds data that is transposed (variables or species in rows, samples in columns), a header spread over several rows (more than half of the header cells empty in a table of three or more columns, or a first data row of units that was not folded into the header), a row above the names that holds footnote markers, a table with no rows, a workbook with no sheet of coordinates or measurements, or no table at all. The finding gives the reason and, for a workbook, the sheet.',
    example:
      'A sheet lists the variables down the first column and the samples across the top; the finding says the data is transposed.',
    action:
      'Reshape the table into one header row with one row per sample and add it again. In /convert this finding blocks the export.',
  },
  'IN-ENCODING-FALLBACK': {
    checks:
      'The file is not saved as UTF-8, so the tool read it as an 8-bit Central European or Western code page. The letters with accents may be wrong if that guess is wrong.',
    fires:
      'When the bytes are not valid UTF-8 and all three 8-bit readings the tool tries (windows-1250, ISO-8859-2 and windows-1252) give the same text. The file is read as windows-1250 when one of the bytes 8A, 9A, 8C, 9C, 8F or 9F occurs, otherwise as ISO-8859-2; the finding names the reading used. Plain ASCII is valid UTF-8 and never raises it. If the readings differ, IN-ENCODING-AMBIGUOUS is raised instead. A UTF-16 file or a UTF-8 file with a BOM is read without a finding.',
    example:
      'A file that is not valid UTF-8 and whose only non-ASCII byte is E9 in caf followed by that byte: all three readings give the same letter, and the file is read as ISO-8859-2.',
    action:
      'Check that accented letters look right, and save the file as UTF-8 when you publish. In /convert the reading is accepted once and does not stop the export.',
  },
  'IN-ENCODING-AMBIGUOUS': {
    checks:
      'The file is not UTF-8 and its accented letters read in two or three different ways, depending on which 8-bit code page is assumed. Only the person who saved the file knows which reading is right.',
    fires:
      'When the bytes are not valid UTF-8 and at least two of windows-1250, ISO-8859-2 and windows-1252 decode them to different text. The finding shows each reading with up to three differing words and the one that was used (windows-1250 or ISO-8859-2). Code pages that decode alike count as one reading. UTF-16 is recognised by its BOM or its alternate zero bytes and is not ambiguous.',
    example:
      'The same bytes read as Krřyer in windows-1250 and ISO-8859-2 and as Krøyer in windows-1252; the finding shows both words.',
    action:
      'Decide which reading is right and save the file as UTF-8, or in /convert declare the encoding so the question is answered. /check keeps its pick and only reports. In /convert this finding blocks the export until the encoding is declared.',
  },
  'IN-DECIMAL-COMMA': {
    checks:
      'The file writes numbers with a decimal comma (3,14) instead of a point. The tool read them that way, so values are numbers and not text.',
    fires:
      'When the delimiter is a semicolon or a tab and at least 80 percent of the cells with a decimal separator in the first 50 rows are written with a comma, as n,n. Whole numbers say nothing about the separator and are ignored. A column whose commas could also be thousands separators is also reported by IN-DECIMAL-AMBIGUOUS.',
    example:
      'A semicolon-separated file holds 12,5; 3,14 and 0,07 in a column.',
    action:
      'Use a decimal point when you publish. If the commas were meant as something else, change the file. In /convert the reading is accepted once and does not stop the export.',
  },
  'IN-DECIMAL-AMBIGUOUS': {
    checks:
      'In one column of a file that uses a decimal comma, every number with a comma has exactly three digits after it, so the comma may be a decimal comma (1,250 is one and a quarter) or a thousands separator (1,250 is one thousand two hundred fifty). The file does not say which.',
    fires:
      'Per column of a decimal-comma file, only when every number with a comma has exactly three digits after it. A single value such as 1.250,5 settles the column (with both separators the last is the decimal), and so does a value with one, two, or four or more decimals; then no finding is raised. In 1,250,000 the comma repeats, so it is a thousands mark; the question stays open for the other values and the finding names that cell. The finding gives the column, the number of cells, the first such value and both readings. The cells were read as decimals.',
    example:
      'A column of depths in metres holds 1,250 and 2,500; read as decimals they are 1.25 and 2.5, read as thousands 1250 and 2500.',
    action:
      'Decide what the comma means in this column. In /convert declare it as decimal or as thousands; under thousands the cells written 1,250 or 1,250,000 are read as 1250 and 1250000. In /check the finding only reports. In /convert this finding blocks the export until the column is declared.',
  },
  'IN-HEADER-SHORT': {
    checks:
      'The header row has fewer names than the data rows have values. The tool cannot tell where the names are missing, so values may sit under the name of a neighbour column.',
    fires:
      'When at least 95 percent of the data rows (at least three rows are needed) have the same number of fields, that number is larger than the header\'s, and the extra fields are not all empty. The extra values are given the internal names Column N at the end. A trailing delimiter that adds only empty fields is not reported, and a first data row that reads as a header is treated as the real header instead.',
    example:
      'A header of 10 names over rows of 12 values: the last two are shown as Column 11 and Column 12.',
    action:
      'Give every column a name in the file, and check the first values of the last named columns in case a name is missing earlier. In /convert the unnamed column is left out unless it is mapped to a variable; a mapped one must be named first (CONV-COLUMN-UNNAMED blocks the export otherwise). This finding itself is accepted and does not stop the export.',
  },
  'IN-HEADER-UNITS-READ': {
    checks:
      'A second header row of units was read: the line under the column names holds only units, so it is not data. The units were added to the column names.',
    fires:
      'When the row directly under the header (or under a row of statistic labels) has only unit cells, at least two of which go into a header, every cell has a name above it, and the numbers below fit the units. A unit that disagrees with the one the name already gives means the row is not folded. The finding gives the line and the first changed name, for example a column now named a [h]. The line numbers in the report stay the file\'s own.',
    example:
      'A header latitude, longitude over a row degrees_north, degrees_east: the names become latitude [degrees_north] and longitude [degrees_east].',
    action:
      'Nothing to fix. If you prefer a single header row, put the unit into the column name. In /convert this finding is only shown and never stops the export.',
  },
  'IN-HEADER-UNITS-NAMED': {
    checks:
      'A row of units under the header was recognised and skipped. The column names already carried the same units, so no name was changed.',
    fires:
      'When the row under the header holds only units and every column it names has the same unit in its own header too, for instance depth [m] over m. The row is not a data row and the report keeps the file\'s own line numbers. The finding gives the line.',
    example:
      'The header holds temperature [C] and depth [m] and the next line holds C and m.',
    action:
      'Nothing to fix. Remove the second row if you want a plain single header. In /convert this finding is only shown and never stops the export.',
  },
  'IN-PERCENT-READ': {
    checks:
      'Cells of an Excel column are formatted as percentages and were read as shown: a stored 0.95 formatted as 95% is read as 95, not 0.95.',
    fires:
      'Per column of an Excel sheet with at least one numeric cell whose number format shows a percent sign and whose stored value differs from the shown one. The decimal point of the stored number is moved two places right (never the cell\'s rounded display text). The finding gives the column, the number of cells and the first stored and shown values.',
    example:
      'A column of 0.07 formatted as 0.0% is read as 7; the finding says 0.07 is read as 7.',
    action:
      'If you meant fractions, reformat the cells as numbers. If you meant percent values, leave them. Check the unit in the column name. In /convert this finding is only shown and never stops the export.',
  },
  'IN-COLUMN-NO-HEADER': {
    checks:
      'A column of an Excel sheet holds values to the right of the last named header cell but has no name itself. It is read as a column without a name, and every cell stays where it is.',
    fires:
      'When a data row has a value in a column to the right of the last named header cell. The finding gives the column letter, the number of rows with a value and their lines.',
    example:
      'The header names columns A to F, and column G holds numbers in 40 rows; column G is reported with those rows.',
    action:
      'Give the column a name in the file. In /convert the unnamed column is left out unless it is mapped to a variable; a mapped one must be named first (CONV-COLUMN-UNNAMED blocks the export otherwise). This finding itself is only shown and never stops the export. In /convert this finding is only shown and never stops the export.',
  },
  'IN-DATE1904': {
    checks:
      'An Excel workbook uses the older 1904 date system. Dates were converted with its epoch; they differ by 1462 days from the same number in the usual 1900 system.',
    fires:
      'When the workbook has its 1904 date flag set. Serial dates are converted from 1 January 1904. Dates written as text are not affected.',
    example:
      'The same stored serial number is a date four years and a day later in the 1904 system than in the 1900 system, so reading a 1904 file as 1900 would move every date.',
    action:
      'Check a few of the dates. If the dates are off by about four years, the file was created on an older Mac; consider resaving it in the 1900 system. In /convert this finding is only shown and never stops the export.',
  },
  'IN-PANGAEA-EVENT-USED': {
    checks:
      'A PANGAEA table without position or date columns got Latitude, Longitude and/or Date/Time from the Event(s) block of its file header.',
    fires:
      'When a PANGAEA text file has an Event(s) block with points or dates and the table lacks those columns. With one event it applies to every row; with several, each row takes the event named in its Event column. A column the table already has is never touched, and a value a row has is never overwritten. The finding names the columns added, the number of events and the rows filled.',
    example:
      'A table of samples without coordinates and an Event(s) block that lists station ST-01 with its position and time; each row gets that position and time.',
    action:
      'Check the values the finding names. Add your own position and date columns if the sample position differs from the event\'s. In /convert this finding is only shown and never stops the export.',
  },
  'IN-PANGAEA-EVENT-NOT-USED': {
    checks:
      'The Event(s) block of a PANGAEA file gives a position or date, but no position was copied into the table (a date may still be), and the table has no position of its own.',
    fires:
      'When the table lacks the position and the block cannot give it: several events are listed but the table has no Event column to say which row belongs to which, or the event\'s position is a track (start and end differ) and not a point, which also applies to a single event. The finding gives the number of events and which of the two reasons applies.',
    example:
      'A block lists three stations and the table has no Event column; nothing is borrowed.',
    action:
      'Add an Event column, or position and date columns, to the table. For a track add the position of each sample. In /convert this finding is only shown and never stops the export.',
  },
  'IN-PANGAEA-EVENT-UNMATCHED': {
    checks:
      'Some rows of a PANGAEA table have no matching event in the Event(s) block of the file header, so nothing was taken for them.',
    fires:
      'When the table has an Event column, for each row whose Event cell is empty, names an event that is not listed, names an event listed twice, or names an event with no position or date (also for a single event lacking the value). The finding gives the number of rows and their lines.',
    example:
      'Rows 12 and 13 say station 7, and the block lists stations 1 to 6.',
    action:
      'Fill the position and date for those rows in the table. In /convert this finding is only shown and never stops the export.',
  },
  'IN-DWCA-NOT-ARCHIVE': {
    checks:
      'A file named .zip is not a Darwin Core Archive, so nothing was checked. It has no meta.xml and may not even be a ZIP, for example a saved error page.',
    fires:
      'When the file has no meta.xml at its root or in its single top-level folder, or is not a zip at all.',
    example:
      'A web page saved with a .zip extension.',
    action:
      'Add a Darwin Core Archive downloaded from an IPT, OBIS or GBIF, or the table itself as CSV or Excel. In /convert this finding blocks the export.',
  },
  'IN-DWCA-UNSUPPORTED-CORE': {
    checks:
      'A Darwin Core Archive whose core table is neither Occurrence nor Event was not checked. That does not mean it is fine.',
    fires:
      'When the core rowType of the archive is another class, for instance Taxon. The finding names the core.',
    example:
      'An archive whose core is a taxon list.',
    action:
      'Check the occurrence or event table by adding it as a table, or use another tool for this core. In /convert this finding blocks the export.',
  },
  'IN-DWCA-UNREADABLE': {
    checks:
      'A Darwin Core Archive could not be read safely, so nothing was checked.',
    fires:
      'When the zip is damaged, encrypted, uses an unsupported method, is too large or has too many entries, or when meta.xml is missing, too big, has a DTD, is not well-formed or does not describe a single core file with fields. The finding gives a language-neutral reason code such as ZIP-ENCRYPTED or DWCA-META-INVALID.',
    example:
      'An archive with a password-protected entry gives ZIP-ENCRYPTED.',
    action:
      'Download the archive again, or add the table itself (for example occurrence.txt). In /convert this finding blocks the export.',
  },
  'IN-DWCA-PARTIAL': {
    checks:
      'The core table of a Darwin Core Archive is large, so only its first rows were read. The remaining rows were not checked; a clean result does not cover the whole file.',
    fires:
      'When the core file has more rows than the row cap of 200,000. The finding gives the number of rows read and the total.',
    example:
      'An archive with 1.2 million occurrences reports 200,000 of 1,200,000 rows.',
    action:
      'Check a smaller piece of the table or the rest in separate runs. Treat a clean result as covering the first rows only. In /convert this finding is only shown and never stops the export.',
  },
  'IN-DWCA-VERSION': {
    checks:
      'States which Darwin Core Archive was read: title, version and core type.',
    fires:
      'Every time an archive is read. The version is taken from the packageId and publication date in eml.xml, or shown as n/a when it states none.',
    example:
      'Dataset "Fish counts 2024", version v1.0, core Occurrence.',
    action:
      'If the archive has been updated since, run the check again; the result covers the version read. In /convert this finding is only shown and never stops the export.',
  },
  'IN-DWCA-EVENT-CORE': {
    checks:
      'The core of the archive is Event, so the tool checked the event table. Its Occurrence extension was counted, not checked row by row.',
    fires:
      'When the core is Event and an Occurrence extension exists. The finding gives the number of occurrence rows.',
    example:
      'An event-core archive with an Occurrence extension of 4,200 rows.',
    action:
      'If you need the occurrence rows checked, add the occurrence table as a separate file. In /convert this finding is only shown and never stops the export.',
  },
};
