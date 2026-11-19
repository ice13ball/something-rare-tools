# Rules of /check

Generated from the rule registry (`src/core/rules/`) by `scripts/rules-docs-per-tool.ts`. Do not edit by hand.
Regenerate with `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-docs-per-tool.test.ts`.

/check reads data files (CSV, TSV, Excel, Darwin Core Archive) and the metadata records of a repository, and checks them against the rules below. It reads a file; it never changes it. A finding names a rule, the file, the rows and the value it concerns.

Severity is error, warning or info. Every number a rule compares against is listed with its source. A text in guillemets, «name», stands for a value the tool fills in from the finding; N stands for a number; a plural form is written in the plural. The texts are the ones the tool shows (English), unchanged.

121 rules.

## Reading the file or record

### IN-NO-DATA-FILE

Severity: error

**What the user sees.** This record contains no data file, only other files (such as PDFs). Add the table as CSV or Excel, or drop your own file here.

**What triggers it.** «file»: no data file (csv, tsv, txt, tab, xlsx, xls, ods) among the record files: «files».

### IN-RECORD-INACCESSIBLE

Severity: error

**What the user sees.** The record on «host» could not be opened (error «status»); it may be private or unpublished. Download its files or metadata and drop them here.

**Wording when the server fails (status 500 to 599).** The server «host» returned an error («status»), so the record could not be opened. This is usually a temporary fault on the server's side: try again later, or download its files or metadata and drop them here.

**Wording when the status is neither 403, 404 nor a server failure.** The record on «host» could not be opened (error «status»). Try again later, or download its files or metadata and drop them here.

**What triggers it.** «file»: HTTP «status» from «host»; record metadata not readable, continuing with what the other sources provided.

### IN-HOST-NOT-ALLOWED

Severity: warning

**What the user sees.** A link points to «host», which this tool is not allowed to open. Download the file yourself and drop it here.

**What triggers it.** «file»: host «host» is not on the allowlist (DATA_HOSTS); not fetched.

### IN-FETCH-BLOCKED

Severity: warning

**What the user sees.** Your browser could not download from «host». Download the file yourself and drop it here.

**What triggers it.** «file»: fetch from «host» blocked in browser mode (CORS, CSP or network error).

### IN-FETCH-TIMEOUT

Severity: warning

**What the user sees.** «host» did not start to answer within 30 seconds, so the browser stopped waiting. Try again later or switch to server mode.

**What triggers it.** «file»: no response from «host» within 30 s in browser mode; the request was abandoned.

### IN-FETCH-INTERRUPTED

Severity: error

**What the user sees.** The download from «host» was cut off or took too long, so the archive was not checked. Such servers can be slow: try again in a few minutes, or download the archive (.zip) yourself and drop it here.

**What triggers it.** «file»: download from «host» timed out (server mode: proxy limit) or the connection was cut before the body was complete; nothing was read.

### IN-ARCHIVE-TOO-LARGE

Severity: error

**What the user sees.** The archive on «host» is larger than «mb» MB, so the server did not pass it on to be checked. Download it yourself, unpack it and drop the core file (for example occurrence.txt) here; a dropped archive has the same limit.

**What triggers it.** «file»: archive from «host» above the proxy limit of «mb» MB (HTTP 413); not read.

### IN-ARCHIVE-DAILY-BUDGET

Severity: error

**What the user sees.** The daily budget for archive downloads through the server (from «host») is used up for this IP address, so the archive was not checked. It starts again within 24 hours; you can also download the archive (.zip) yourself and drop it here.

**What triggers it.** «file»: the proxy answered 429 archive_daily_budget for «host»: this client used its daily archive requests or bytes; not read.

### IN-ARCHIVE-BUSY

Severity: error

**What the user sees.** Two archive downloads through the server are in progress from this IP address, so the archive from «host» was not checked. Wait for them to finish and check again (one archive at a time).

**What triggers it.** «file»: the proxy answered 429 archive_busy for «host»: this client already has the maximum of 2 archive downloads in flight; not read.

### IN-IPT-HOST-NOT-LISTED

Severity: warning

**What the user sees.** The archive of this dataset is on «host», a server this tool does not read from yet (it knows only a fixed list of IPT servers). Download the archive (.zip) yourself and drop it here.

**What triggers it.** «file»: archive host «host» (or its scheme, port or credentials) is not on the static IPT list (config/ipt.ts); not fetched.

### IN-NO-DWC-ARCHIVE

Severity: error

**What the user sees.** «registry» knows this dataset but lists no downloadable Darwin Core Archive (.zip) for it, so there is nothing to check. Get the data from the publisher and drop it here.

**What triggers it.** «file»: «registry» lists no DWC_ARCHIVE endpoint (GBIF) or no archive URL (OBIS) for this dataset.

### IN-FILE-HELD-BACK

Severity: warning

**What the user sees.** This file was not checked: «host» holds it back (restricted access or an embargo). That is not an error in the data, but the absence of remarks says nothing about it. Ask the data owner for access, then drop the file here.

**What triggers it.** «file»: held back by «host» (restricted access or embargo); not downloaded, not checked.

### IN-FILE-TOO-LARGE

Severity: warning

**What the user sees.** This file was not read: it is larger than «mb» MB, the most that is read from a link. It was not checked, so the absence of remarks says nothing about it. Download it and drop it here.

**What triggers it.** «file»: larger than «mb» MB; not downloaded, not checked.

### IN-FILES-NOT-READ

Severity: warning

**What the user sees.** These files of the dataset were not checked because the tool does not read their format (such as zip or NetCDF): «files». The absence of remarks says nothing about them. If they hold data, unpack them or save them as CSV or Excel and drop them here.

**What triggers it.** «file»: not read (format not supported): «files».

### IN-DATAVERSE-FILES

Severity: info

**What the user sees.** Read version «version» of this dataset, the latest published one, from «host».

**Sentence added when the finding has the parameter original.** Tables read as the author uploaded them (the original): «original».

**Sentence added when the finding has the parameter converted.** Tables read as the .tab copy Dataverse made, because the original cannot be read: «converted».

**Sentence added when the finding has the parameter none.** No data file was read, so the data were not checked.

**What triggers it.** «file»: read version «version» (latest published) from «host». «value»

### IN-FILE-UNREADABLE

Severity: error

**What the user sees.** None of the files could be read («files»); a file may be damaged or in an unsupported format. Nothing was checked, so the absence of other remarks does not mean the data are fine. Save the file again (for example as CSV or Excel) and add it once more.

**What triggers it.** «file»: no input file could be parsed («files»); nothing was checked.

### IN-LAYOUT-UNSUPPORTED

Severity: error

**What the user sees.** The tool cannot read the layout of this table («reason»). Reshape it into one header row with one row per sample and try again.

**What triggers it.** «file» sheet «sheet»: layout not supported: «reason».

### IN-ENCODING-FALLBACK

Severity: info

**What the user sees.** The file is not saved as UTF-8, so it was read as «encoding». Check that accented letters look right.

**What triggers it.** «file»: bytes are not valid UTF-8; decoded as «encoding». The 8-bit pick is the reader's decision when the bytes are not UTF-8, so the outcome is accepted once before the export.

### IN-ENCODING-AMBIGUOUS

Severity: warning

**What the user sees.** This file is not UTF-8, and its letters read N different ways: «readings». It was read as «encoding». Check which reading is right and save the file again as UTF-8.

**What triggers it.** «file»: bytes are not valid UTF-8 and read N different ways across windows-1250, ISO-8859-2 and windows-1252 («readings»); decoded as «encoding». Code pages that decode the bytes alike count as one reading, so a file all three read alike raises IN-ENCODING-FALLBACK instead. The checker reports and keeps its pick; the converter blocks until the person names the encoding.

### IN-DECIMAL-COMMA

Severity: info

**What the user sees.** This file writes numbers with a decimal comma (3,14). They were read that way; use a decimal point when you publish.

**What triggers it.** «file»: decimal comma detected (semicolon or tab delimiter, most numeric cells look like 3,14); values parsed with ',' as the decimal separator. The decimal comma is the reader's decision (50 rows, 80 %), so the outcome is accepted once before the export.

### IN-DECIMAL-AMBIGUOUS

Severity: warning

**What the user sees.** In column "«column»" every number with a comma has three digits after it (N cells), so "«value»" can be «asDecimal» or «asThousands». They were read with a decimal comma («asDecimal»). Check which one the file means.

**Sentence added when the finding has the parameter thousandsSeen.** The column also holds "«thousandsSeen»", written with commas as thousands separators, so these numbers may be thousands; the tool still read the others as decimals.

**What triggers it.** «file» sheet «sheet»: column «index» "«column»": every cell with a comma (N) has exactly three digits after it, so the comma may be a decimal comma («asDecimal») or a thousands separator («asThousands») for "«value»". Read as decimal; the file does not say which. Judged per column over all rows: one value with 1, 2 or 4 or more decimals settles it.

### IN-HEADER-SHORT

Severity: warning

**What the user sees.** The header has «header» names, but N of «rows» rows have «width» values, so «extra» names are missing. The tool cannot tell where: it shows the extra values at the end as Columns «range». If names are missing earlier in the header, the columns from that point on carry the values of their neighbour: check the first values of the last named columns too, and give each column the meaning of its values.

**What triggers it.** «file»: the header has «header» names; N of «rows» data rows have «width» fields; «extra» names missing, position unknown; the extra values are shown as Column «range» (internal names "Column N").

### IN-HEADER-UNITS-READ

Severity: info

**What the user sees.** Line «lines» holds units, not data: N columns got the unit in the name (for example "«example»"). That line is not counted as a data row, and the line numbers in this report stay the file's own.

**What triggers it.** «file» sheet «sheet»: line «lines» is a second header row in which every filled cell is a unit; N column names now carry their unit as "name \[unit\]", the first being "«example»". Cells are not changed; the row is not a data row.

### IN-HEADER-UNITS-NAMED

Severity: info

**What the user sees.** Line «lines» holds units, not data: the column names carry them as well. That line is not counted as a data row, and the line numbers in this report stay the file's own.

**What triggers it.** «file» sheet «sheet»: line «lines» is a second header row in which every filled cell is a unit, and every column it names carries the same unit in its header too. No name is changed; the row is not a data row.

### IN-PERCENT-READ

Severity: info

**What the user sees.** N cells of column "«column»" are formatted as a percentage and were read as shown («stored» is read as «shown»).

**What triggers it.** «file» sheet «sheet»: N numeric cells of column "«column»" have a number format with a percent sign; the stored number's decimal point was moved two places right (first: «stored» read as «shown»). The cell's formatted text (rounded) is not used.

### IN-COLUMN-NO-HEADER

Severity: warning

**What the user sees.** Column «column» has values in N rows but no name in the header (lines «lines»). It is read as a column without a name; give it a name in the file, or say on /convert what it holds.

**What triggers it.** «file» sheet «sheet»: column «column» holds a value in N data rows (lines «lines») but the header row has no name there or to its right; read as an unnamed column ("Column N"), every cell kept where it is.

### IN-DATE1904

Severity: info

**What the user sees.** This Excel file uses the older 1904 date system (dates differ by 1462 days from the usual one). Dates were converted accordingly; check a few of them.

**What triggers it.** «file»: workbook date1904 flag is set; serial dates converted with epoch 1904-01-01 (1462 days offset from the 1900 system).

**Citations.**

- [Microsoft Support, Date systems in Excel](https://support.microsoft.com/en-us/office/date-systems-in-excel-e7fe7167-48a9-4b96-bb53-5612a800b487), 1900 and 1904 date systems; "The difference between the two date systems is 1,462 days."

### IN-PANGAEA-EVENT-USED

Severity: info

**What the user sees.** The table has no position or date of its own for these rows, so the Event(s) block of the file header was used: columns «columns» were added (N rows). One event applies to every row; with several, each row takes the event named in its Event column. Check the values.

**What triggers it.** «file» sheet «sheet»: columns «columns» added from the Event(s) header block («events» event(s)) for N row(s) that had no position or date of their own.

### IN-PANGAEA-EVENT-NOT-USED

Severity: warning

**What the user sees.** The Event(s) block in the file header gives a position or date, but none was copied into the table, and the table has none of its own.

**Sentence added when the finding has the parameter several.** The block lists «several» events and the table has no Event column, so it is unknown which row belongs to which. Add an Event column, or position and date columns.

**Sentence added when the finding has the parameter track.** The position of the event is a track (the start and the end differ), not a point, so it is not the position of a sample. Add position columns to the table.

**What triggers it.** «file» sheet «sheet»: Event(s) header block with «events» event(s) not copied into the table (no Event column for several events, or the position is a track).

### IN-PANGAEA-EVENT-UNMATCHED

Severity: warning

**What the user sees.** N rows have no event in the Event(s) block of the file header: the Event cell is empty, names an event that is not listed there, or the event has no position or date. Nothing was taken from the block for these rows. Fill them in the table.

**What triggers it.** «file» sheet «sheet»:«lines» N row(s) whose Event cell matches no event of the Event(s) header block that has a position or date; nothing was borrowed for them.

### IN-DWCA-NOT-ARCHIVE

Severity: error

**What the user sees.** This .zip file is not a Darwin Core Archive (it has no meta.xml; it may not even be a ZIP, for example a saved error page), so nothing was checked. Add a DwC-A downloaded from an IPT, OBIS or GBIF, or the table itself as CSV or Excel.

**What triggers it.** «file»: file named .zip without a meta.xml at its root or in its single top-level folder (or not a zip at all); not a Darwin Core Archive, nothing read.

### IN-DWCA-UNSUPPORTED-CORE

Severity: error

**What the user sees.** This is a Darwin Core Archive whose core table is «core». The tool only checks Occurrence or Event archives, so this archive was not checked. That does not mean it is fine.

**What triggers it.** «file»: Darwin Core Archive with core rowType «core»; only Occurrence and Event cores are checked. Not checked.

### IN-DWCA-UNREADABLE

Severity: error

**What the user sees.** This archive could not be read safely («reason»), so nothing was checked. The file may be damaged, encrypted or too large. Download it again, or add the table itself (for example occurrence.txt).

**What triggers it.** «file»: archive rejected or unreadable: «reason». Nothing was checked.

### IN-DWCA-PARTIAL

Severity: warning

**What the user sees.** PARTIAL CHECK: the table in this archive is large, so only the first «read» of «total» rows were read. The remaining rows were not checked; a clean result does not cover the whole file.

**What triggers it.** «file»: only the first «read» of «total» rows of the core file were read (row cap); the rest is unchecked. PARTIAL run.

### IN-DWCA-VERSION

Severity: info

**What the user sees.** Read the Darwin Core Archive "«title»", version: «version». Its core table («core») was checked. If the archive has been updated since, this result covers the older version.

**What triggers it.** «file»: Darwin Core Archive "«title»", version «version» (eml.xml packageId / pubDate); core rowType «core».

### IN-DWCA-EVENT-CORE

Severity: info

**What the user sees.** The archive's core is Event; its Occurrence extension has «occurrences» rows. Positions and dates belong to the events, so the event table was checked, not the occurrence rows one by one.

**What triggers it.** «file»: Event core with an Occurrence extension of «occurrences» rows; positions and dates are the events', the event table was checked.

## Licence and metadata

### LIC-MISSING

Severity: error

**What the user sees.** No licence was found in the metadata. State the licence name with its version and a link, e.g. CC BY 4.0.

**Wording when the DataCite comparison could not be made.** No licence was found in the metadata. State the licence name with its version and a link, e.g. CC BY 4.0. Note: the DOI record at DataCite could not be compared, so this finding rests on the catalogue record alone.

**What triggers it.** «file»: no licence statement (useLimitation, otherConstraints, rightsList, license) in any record.

**Citations.**

- [INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)](https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html), section 2.3.7 (quoting Regulation 1205/2008 Part B 8.1): "The element must have values."
- [INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)](https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html), section 2.3.7 (quoting Regulation 1205/2008 Part B 8.1): "If no conditions apply to the access and use of the resource, ‘no conditions apply’ shall be used."
- [GO FAIR, FAIR Principle R1.1](https://www.go-fair.org/fair-principles/r1-1-metadata-released-clear-accessible-data-usage-license/), heading "Interpretation of R1.1": "Digital resources and their metadata must always, without exception, include a license that describes under which conditions the resource can be used, even if that is “unconditional”."
- [OpenAIRE Guidelines for Data Archives, 16. Rights (MA)](https://guidelines.openaire.eu/en/latest/data/field_rights.html), 16. Rights (MA), note: "In particular OpenAIRE also recommends including license information if available."

### LIC-FREE-TEXT

Severity: warning

**What the user sees.** The licence is written only as free text ("«text»"), which programs cannot read. State the licence by its identifier (e.g. «hint») and a link to its official text.

**What triggers it.** «file» field «field»: licence given as free text '«text»' (version missing: «versionMissing»); no recognised SPDX id or licence URI. Suggested identifier: «hint».

**Citations.**

- [GO FAIR, FAIR Principle R1.1](https://www.go-fair.org/fair-principles/r1-1-metadata-released-clear-accessible-data-usage-license/), heading "Interpretation of R1.1": "Note also that a license that cannot be found by an agent, is effectively the same as no license at all."
- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16. Rights, allowed values, examples, other constraints: "Use the complete title of a license and include version information if applicable."
- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16.b rightsIdentifier: "A short, standardized version of the license name."
- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16.a rightsURI: "The URI of the license."
- [INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)](https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html), TG Recommendation C.10, section 2.3.7: "For detailed information about the licensing of the resource it is recommended to provide a link to a license type (e.g. http://creativecommons.org/licenses/by/3.0 ), a website or to a document containing the necessary information."
- [SPDX, Handling license info](https://spdx.dev/learn/handling-license-info/), "SPDX License List" paragraph: "The SPDX License List includes a standardized short identifier, the full name, the license text, and a canonical permanent URL for each license and exception."

### LIC-TEXT-URI-CONFLICT

Severity: warning

**What the user sees.** The licence text ("«text»") and its link point to different licences, the link is not recognised, or the text does not name this licence and says something else. From the text: «textLicence»; from the link: «uriLicence» ("—" = not recognised). Check by hand and state one licence with its own link.

**What triggers it.** «file» field «field»: text '«text»' reads as «textLicence», link '«uri»' as «uriLicence»; the statement is not classified (text and link differ, the link is not recognised, or the text names no licence and says something else). Check manually.

**Citations.**

- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16. Rights, allowed values, examples, other constraints: "Use the complete title of a license and include version information if applicable."
- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16.a rightsURI: "The URI of the license."
- [Creative Commons wiki, Best practices for attribution](https://wiki.creativecommons.org/wiki/Best_practices_for_attribution), section on licence attribution: "We recommend that you name and provide a link to the license, e.g., CC BY 4.0 ( http://creativecommons.org/licenses/by/4.0 ) for a work licensed under CC BY 4.0."

### LIC-ADDED-CONDITIONS

Severity: warning

**What the user sees.** The text ("«text»") names the licence «textLicence» but adds conditions to it ("«rest»"), so as written it is no longer that standard licence. Check it by hand and state the licence and any extra conditions clearly.

**Sentence added when another source of the statement also leaves something out.** Another string of the same statement (the identifier or the title) also leaves: "«otherRest»".

**What triggers it.** «file» field «field»: text '«text»' names «textLicence» but the rest '«rest»' adds or negates conditions; the statement is not classified as that licence. Check manually.

**Citations.**

- [Creative Commons FAQ](https://creativecommons.org/faq/), Alterations and additions to the license, "Can I change the license terms or conditions?": "if you change the terms and conditions of any Creative Commons license, you must no longer call, label, or describe the license as a “Creative Commons” or “CC” license"

### LIC-EXTRA-TEXT

Severity: warning

**What the user sees.** The text ("«text»") contains something besides the licence name ("«rest»"). Check by hand whether it changes the licence; until that is clear, do not treat this as the standard licence.

**Sentence added when another source of the statement also leaves something out.** Another string of the same statement (the identifier or the title) also leaves: "«otherRest»".

**What triggers it.** «file» field «field»: text '«text»' contains '«rest»' besides the licence name; the statement is not classified. Check manually whether it changes the licence.

**Citations.**

- [Creative Commons FAQ](https://creativecommons.org/faq/), Alterations and additions to the license, "Can I change the license terms or conditions?": "if you change the terms and conditions of any Creative Commons license, you must no longer call, label, or describe the license as a “Creative Commons” or “CC” license"

### LIC-OTHER-RIGHTS-ENTRY

Severity: warning

**What the user sees.** Next to the licence «licence», another rights entry says: "«text»". Check whether it restricts or changes the licence.

**What triggers it.** «file» field «field»: a rights entry '«text»' is no recognised licence and no plain access value, next to the recognised licence «licence». Check manually whether it restricts or changes the licence.

**Citations.**

- [Creative Commons FAQ](https://creativecommons.org/faq/), Alterations and additions to the license, "Can I change the license terms or conditions?": "if you change the terms and conditions of any Creative Commons license, you must no longer call, label, or describe the license as a “Creative Commons” or “CC” license"

### LIC-AMBIGUOUS

Severity: warning

**What the user sees.** The licence statement ("«text»") can be read as more than one licence («readings»; "—" = a name no identifier exists for), so it cannot be assigned to one licence. Check it by hand and state one licence.

**What triggers it.** «file» field «field»: statement '«text»' reads as «readings»; it is not classified as one licence. Check manually.

**Citations.**

- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16. Rights, allowed values, examples, other constraints: "Use the complete title of a license and include version information if applicable."
- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16.b rightsIdentifier: "A short, standardized version of the license name."

### LIC-RESTRICTION-CONFLICT

Severity: warning

**What the user sees.** The metadata names an open licence («licence») together with the restriction code «codes». INSPIRE expects the code "otherRestrictions" with a description of the conditions; check whether «codes» is meant as a real restriction and, if not, replace it.

**What triggers it.** «file»: restriction code(s) «codes» (MD_RestrictionCode) together with the open licence statement '«licence»'; INSPIRE TG Req. C.18 expects otherRestrictions plus otherConstraints describing the conditions. Check whether the code is a real restriction.

**Citations.**

- [INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)](https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html), TG Requirement C.18, section 2.3.7: "In both cases this element shall contain a gmd:MD_RestrictionCode element with code list value "otherRestrictions"."
- [INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)](https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html), TG Requirement C.18, section 2.3.7: "Additionally at least one instance of gmd:otherConstraints shall be given describing the actual conditions."
- [ISO/TS 19139 code lists (gmxCodelists.xml), MD_RestrictionCode](https://standards.iso.org/iso/19139/resources/gmxCodelists.xml), MD_RestrictionCode "restricted": "withheld from general circulation or disclosure"
- [Creative Commons FAQ](https://creativecommons.org/faq/), How do CC licenses operate?: "CC licenses are operative only when applied to material in which a copyright exists, and even then only when a particular use would otherwise not be permitted by copyright."

### LIC-FILES-HELD-BACK

Severity: warning

**What the user sees.** Some files of this dataset are restricted or under embargo: «files». Access to them is decided by the repository, not by the licence in the metadata, so the licence verdict covers only the open files. If these are the data, state in the description how they can be obtained.

**What triggers it.** «file»: restricted or embargoed files («files»); the stated licence does not open them, so the licence result covers the open files only.

### LIC-DATACITE-EMPTY

Severity: warning

**What the user sees.** The DOI registration record (DataCite) states no licence. Other records: «licence» ("—" = none states one, or the record could not be read). Add the licence to the DOI record.

**What triggers it.** «file»: DataCite rightsList is empty; other records state '«licence»' ('—' = none states one, or the main record could not be read).

**Citations.**

- [OpenAIRE Guidelines for Data Archives, 16. Rights (MA)](https://guidelines.openaire.eu/en/latest/data/field_rights.html), 16. Rights (MA), note: "In particular OpenAIRE also recommends including license information if available."
- [OpenAIRE Guidelines for Data Archives, 16. Rights (MA)](https://guidelines.openaire.eu/en/latest/data/field_rights.html), 16. Rights (MA), note: "Mandatory when applicable property in OpenAIRE instead of optional in DataCite."

### LIC-MISMATCH

Severity: warning

**What the user sees.** Two records state different licences («licenceA» and «licenceB»). Make them the same.

**What triggers it.** «file»: licence mismatch between records: «licenceA» vs «licenceB».

**Citations.**

- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16. Rights, definition: "The property may be repeated to record complex rights characteristics."
- [Creative Commons FAQ](https://creativecommons.org/faq/), separate agreements: "You may offer the licensed material under other licenses in addition to the CC license (a practice commonly referred to as “dual licensing”)."
- [Creative Commons FAQ](https://creativecommons.org/faq/), separate agreements: "A reuser may then choose which set of terms to comply with."
- [GO FAIR, FAIR Principle R1.1](https://www.go-fair.org/fair-principles/r1-1-metadata-released-clear-accessible-data-usage-license/), heading "Interpretation of R1.1": "Furthermore, the license may be different for a data resource and the metadata that describes it"

### META-EMPTY-LINK

Severity: warning

**What the user sees.** The metadata contains N download link(s) with an empty address. Fill in the address or remove the link.

**What triggers it.** «file»: N online resource link(s) with an empty or missing URL (CI_OnlineResource linkage).

### META-NO-VERSION

Severity: info

**What the user sees.** No version is stated. Add a version number so people can tell which release of the data they have.

**What triggers it.** «file»: no version or edition in any record.

### META-NO-EXTENT

Severity: info

**What the user sees.** The metadata gives neither a time span nor an area for the data, so they could not be compared with the table. Add both.

**What triggers it.** «file»: no temporal extent and no geographic bounding box in any record.

### META-DATE-OUTSIDE-EXTENT

Severity: warning

**What the user sees.** N rows have a date outside the time span in the metadata («start» to «end»), e.g. «value». Correct the dates or the time span.

**What triggers it.** «file»:«lines» N row(s) dated outside the temporal extent «start»..«end» (e.g. «value»).

### META-POINT-OUTSIDE-BBOX

Severity: warning

**What the user sees.** N rows lie outside the area given in the metadata. Correct the coordinates or enlarge the area in the metadata.

**What triggers it.** «file»:«lines» N row(s) outside the bounding box W «west», E «east», S «south», N «north» (e.g. «value»).

### META-VARIABLE-MISSING

Severity: warning

**What the user sees.** The description mentions "«term»", but no matching column was found in the data. Add the column or correct the description.

**What triggers it.** «file»: abstract mentions '«term»' but no dataset variable maps to the corresponding canonical variable.

### META-NO-DATES

Severity: error

**What the user sees.** Neither the data nor the metadata contain any date. Add the sampling date to the table or a time span to the metadata.

**Sentence added when the finding has the parameter sheets.** This is about the sheets: «sheets».

**Sentence added when the finding has the parameter sheetOne.** This is about the sheet: «sheetOne».

**Sentence added when the finding has the parameter joinSheet.** Likely cause: the join with sheet "«joinSheet»" gave no dates (its key matches rows that differ; see the warning about the key).

**What triggers it.** «file»: no row has a date and no record has a temporal extent or collection date.

### META-NO-POSITIONS

Severity: error

**What the user sees.** Neither the data nor the metadata contain any position. Add latitude and longitude columns in decimal degrees to the table: OBIS needs decimalLatitude and decimalLongitude for every record, and a geographic bounding box in the metadata alone does not replace them.

**Sentence added when the finding has the parameter sheets.** This is about the sheets: «sheets».

**Sentence added when the finding has the parameter sheetOne.** This is about the sheet: «sheetOne».

**What triggers it.** «file»: no latitude or longitude column is mapped, no row has a position and no record has a bounding box. OBIS requires decimalLatitude and decimalLongitude as the minimum location terms of every record; a bounding box in the metadata is not a substitute for them.

**Citations.**

- [OBIS Manual, "Darwin Core" (iobis/manual darwin_core.md; manual.obis.org; read 2026-10-30)](https://manual.obis.org/darwin_core.html), "Location information can be documented in many DwC terms, but decimalLatitude and decimalLongitude are the minimally required terms"; "OBIS currently has seven required and one strongly recommended DwC term: occurrenceID, eventDate, decimalLongitude, decimalLatitude, scientificName, occurrenceStatus, basisOfRecord, scientificNameID"

## Rows, Darwin Core and conversion

### ROW-LAT-RANGE

Severity: error

**What the user sees.** Latitude must be between -90 and 90 degrees, but lines «lines» are outside this range. Check whether latitude and longitude were swapped or mistyped.

**What triggers it.** «file»:«lines» field «field» value '«value»': latitude outside -90..90 degrees.

**Thresholds.**

- latitude.min = -90 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11
- latitude.max = 90 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11

**Citations.**

- [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.3 "Impossible Location", PDF p.44

### ROW-LON-RANGE

Severity: error

**What the user sees.** Longitude must be between -180 and 180 degrees, but lines «lines» are outside this range. Check whether latitude and longitude were swapped or mistyped.

**What triggers it.** «file»:«lines» field «field» value '«value»': longitude outside -180..180 degrees.

**Thresholds.**

- longitude.min = -180 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11
- longitude.max = 180 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11

**Citations.**

- [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.3 "Impossible Location", PDF p.44

### ROW-LON-360

Severity: info

**What the user sees.** Longitudes in lines «lines» are given on a 0–360 scale. They were converted to the -180 to 180 scale; use that scale in the published file.

**What triggers it.** «file»:«lines» field «field» value '«value»': longitude in (180, 360\] converted by subtracting 360.

**Citations.**

- [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.3 "Impossible Location", PDF p.44

### ROW-LAT-EQ-LON

Severity: error

**What the user sees.** In lines «lines» latitude and longitude are identical («value»). One column was probably copied into the other; enter the correct values.

**Sentence added when the finding has the parameter share.** That is at least 5 rows and a fifth of the rows with a position.

**Sentence added when the finding has the parameter repeated.** The same value repeats in «repeated» rows and has two or more decimals, as when the position of one station was copied into both columns.

**What triggers it.** «file»:«lines» latitude equals longitude exactly (value '«value»') in at least 5 rows and either at least 20 % of the rows with a position or at least 5 rows sharing one value with two or more written decimals that is not a multiple of 0.25 (the tool's own choice; otherwise ROW-LAT-EQ-LON-ISOLATED or ROW-LAT-EQ-LON-COARSE).

### ROW-LAT-EQ-LON-ISOLATED

Severity: warning

**What the user sees.** In lines «lines» latitude and longitude are identical («value»). This is a small share of the rows with a position, so it may be a coincidence, but typing the same number into both columns is also a common slip. Check this position.

**What triggers it.** «file»:«lines» latitude equals longitude exactly (value '«value»', finer than a half degree) in a small share of the rows with a position (fewer than 5 rows, or under 20 % and without 5 rows of one repeated value); a duplicated column would be ROW-LAT-EQ-LON.

### ROW-LAT-EQ-LON-COARSE

Severity: info

**What the user sees.** In lines «lines» latitude and longitude are identical («value»). This position is rounded to a whole or half degree, as is common in historical data, so it may be right (for example -65 and -65 is the Antarctic Peninsula). Just check that the number was not typed twice.

**What triggers it.** «file»:«lines» latitude equals longitude exactly (value '«value»', a whole or half degree) in fewer than 5 rows or fewer than 20 % of the rows with a position; a duplicated column would be ROW-LAT-EQ-LON.

### ROW-RAGGED

Severity: error

**What the user sees.** Lines «lines» have a different number of values than the header (expected «expected», e.g. «found»). The columns may be shifted; fix these lines in the original file — the tool did not change them.

**What triggers it.** «file»:«lines» expected «expected» fields, found «found» (first listed line); rows kept as found, not realigned.

### ROW-NON-NUMERIC

Severity: warning

**What the user sees.** Column "«field»" should contain numbers, but lines «lines» contain text such as "«value»". Replace it with a number or leave the cell empty.

**What triggers it.** «file»:«lines» field «field» value '«value»': non-numeric token in a numeric column.

### ROW-NA-VARIANT

Severity: warning

**What the user sees.** Column "«field»" marks missing values in an unusual way (e.g. "«value»") in lines «lines». Use one consistent marker, or an empty cell.

**What triggers it.** «file»:«lines» field «field» value '«value»': variant of a missing-value token (not in the standard NA list).

### ROW-STATION-MOVED

Severity: warning

**What the user sees.** Station «station» appears at different positions («positions»). Check which one is right — a digit may have been mistyped or the coordinates swapped.

**Sentence added when the finding has the parameter signLon.** Two of these positions differ (almost) only in the sign of the longitude: possibly a missing or extra minus (W/E). Check the other columns too — the sign need not be the whole cause.

**Sentence added when the finding has the parameter signLat.** Two of these positions differ (almost) only in the sign of the latitude: possibly a missing or extra minus (S/N). Check the other columns too — the sign need not be the whole cause.

**What triggers it.** «file»:«lines» station «station» at «positions»: positions differ by a typed digit, by exchanged axes, or by a sign (as written at least 100 km apart, within 50 km and at least 10 times closer once flipped).

### ROW-STATION-SPREAD

Severity: info

**What the user sees.** Station «station» has positions up to «km» km apart («positions»). A station is usually one place, and 10 km is far more than a ship's position error on station. If this name stands for an area, a transect or a cruise, ignore this note.

**What triggers it.** «file» station «station»: positions up to «km» km apart (more than 10 km; great-circle distance) at «positions». Rows of one name are compared only within one cruise (a cruise value) or, without one, within one calendar year (UTC); rows with neither get the note ROW-STATION-SPREAD and, for exchanged axes or a sign, ROW-STATION-MOVED, but not the typed-digit pattern. Placeholder names (unknown, not specified, n/a ...) are skipped.

### ROW-STATION-SPREAD-FAR

Severity: warning

**What the user sees.** Station «station» has positions up to «km» km apart, more than 1000 km («positions»). A station is usually one place, so this is almost certainly a wrong position (a sign, a digit, swapped axes), not an area. Check which position is right.

**What triggers it.** «file» station «station»: positions up to «km» km apart (more than 1000 km; great-circle distance) at «positions». The 10 to 1000 km case is the note ROW-STATION-SPREAD; 1000 km is a stated choice, not a published threshold. Rows of one name are compared only within one cruise (a cruise value) or, without one, within one calendar year (UTC); rows with neither get the note ROW-STATION-SPREAD and, for exchanged axes or a sign, ROW-STATION-MOVED, but not the typed-digit pattern. Placeholder names (unknown, not specified, n/a ...) are skipped.

### ROW-ON-LAND-NEAR

Severity: info

**What the user sees.** In lines «lines» (N in all) the position falls on land or in a lake on the Natural Earth (1:10m) land map, 10–50 km from the sea: «places» (number of rows; least distance from the sea). If this is a sample from a river, estuary, tidal inlet, lake or coastal lagoon, ignore this note: the map can be inaccurate in such places. If not, check the digits and the order of the coordinates.

**What triggers it.** «file»:«lines» N rows on land or in an inland lake 10 to 50 km from the sea (Natural Earth 1:10m, 0.05 degree cells; no sign hint at this level): «places».

**Citations.**

- [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 4 "Position on land test", p.11
- [Natural Earth 1:10m physical vectors: land, minor islands, lakes, v5.1.2 (public domain)](https://www.naturalearthdata.com/downloads/10m-physical-vectors/), layers ne_10m_land, ne_10m_minor_islands, ne_10m_lakes; rasterised by scripts/land-mask.py

### ROW-ON-LAND

Severity: warning

**What the user sees.** In lines «lines» (N in all) the position lies on land or in a lake, away from the sea: «places» (number of rows; least distance from the sea). In marine data this is usually an error: a wrong sign, swapped axes or a typo. 10–50 km from the sea: a separate note; the 10 km band and river banks near the sea are not judged.

**Sentence added when the finding has the parameter flips.** With a sign flipped or the coordinates swapped, these positions lie at sea: «flips». This is only a hint, not a correction.

**What triggers it.** «file»:«lines» N rows on land or in an inland lake at least 50 km from the sea (Natural Earth 1:10m, 0.05 degree cells; 10-50 km is ROW-ON-LAND-NEAR; nearer the coast, near rivers and canals nothing is judged): «places».

**Citations.**

- [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 4 "Position on land test", p.11
- [Natural Earth 1:10m physical vectors: land, minor islands, lakes, v5.1.2 (public domain)](https://www.naturalearthdata.com/downloads/10m-physical-vectors/), layers ne_10m_land, ne_10m_minor_islands, ne_10m_lakes; rasterised by scripts/land-mask.py

### ROW-SHIP-SPEED

Severity: warning

**What the user sees.** Line numbers: «lines». To get here and on, the ship would have to sail faster than 40 knots, although the events before and after fit together: «cases» (lines previous→this→next; km; h = longest possible gap). The position, or the date or time, of one of them is wrong.

**Sentence added when the finding has the parameter signLon.** Probably a missing or extra minus sign in the longitude of rows «signLon».

**Sentence added when the finding has the parameter signLat.** Probably a missing or extra minus sign in the latitude of rows «signLat».

**Sentence added when the finding has the parameter places.** In square brackets: the rows of each point of the track; "+" joins events within 10 km of the first of them, counted as one point.

**Sentence added when the finding has the parameter split.** "a/b": the hop is measured from the position on line a and from the end of the time interval on line b.

**Sentence added when the finding has the parameter declared.** If the files hold more than one ship or cruise, untick "…come from one cruise of one ship" or map a cruise column.

**Sentence added when the finding has the parameter mixed.** So many events are named that the data probably come from more than one ship or cruise: map a cruise column, or do not tick the one-cruise box.

**What triggers it.** «file»:«lines» N event(s) whose implied speed from the previous event and to the next event both exceed 40 knots while previous-to-next does not (Met Office marine-qc extreme speed limit, applied on both sides; MEDATLAS 4.4.4, GTSPP Test 1.5 and WOD18 name position or date/time as the possible error). Speed = distance, less the rounding of the written coordinates, over the LONGEST time gap the written dates and times allow (end of the previous event to start of the next): «cases».

**Thresholds.**

- speed.extreme = 40 knots. Source: [Met Office marine-qc (marine_qc) documentation, "Track check"](https://marine-qc.readthedocs.io/en/latest/track_check.html), section "Extreme speed check": "If the speed estimated from the locations at t-1 and t exceeds 40 knots, set the extreme speed check flag to fail." (the check itself compares one pair; both-sides logic: sections "Speed check" and "The combined track check")

**Citations.**

- [MEDATLAS Protocol, Part I: exchange format and quality checks for observed profiles, v3 (SISMER/IFREMER, Dec 2001)](https://nodc.ogs.it/repository/documents/guidelines/medman_v3.pdf), section 4.4.4 "Check the ship velocity", PDF p.29: "If the ship velocity \> maximum velocity of the ship (default is 15 knots) between two consecutive profiles, find the erroneous data (date or location)"
- [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.5 "Impossible Speed", PDF p.53 (per-platform maximum speed; the operator decides whether position or date/time is wrong)
- [World Ocean Database 2018 User's Manual (prerelease, v0.10; Garcia et al.)](https://www.ncei.noaa.gov/data/oceans/woa/WOD/DOC/WOD18-UsersManual_final.pdf), section 4 "Speed check", printed p.31: "If the speed between adjoining casts is unrealistic, the date/time may be in error, the position may be wrong, or the cast may not belong to this cruise/platform."

### ROW-SHIP-SPEED-UNUSUAL

Severity: info

**What the user sees.** Line numbers: «lines». To get here and on, the ship would have to sail faster than 15 knots, unusual for a research vessel, although the events before and after fit together: «cases» (lines previous→this→next; km; h = longest possible gap).

**Sentence added when the finding has the parameter mayBeReal.** If the ship did sail that fast, ignore this note.

**Sentence added when the finding has the parameter impossible.** At least one of these hops needs more than 40 knots, and no ship sails that fast: the position or the date or time of this event is probably wrong.

**Sentence added when the finding has the parameter signLon.** Probably a missing or extra minus sign in the longitude of rows «signLon».

**Sentence added when the finding has the parameter signLat.** Probably a missing or extra minus sign in the latitude of rows «signLat».

**Sentence added when the finding has the parameter places.** In square brackets: the rows of each point of the track; "+" joins events within 10 km of the first of them, counted as one point.

**Sentence added when the finding has the parameter split.** "a/b": the hop is measured from the position on line a and from the end of the time interval on line b.

**Sentence added when the finding has the parameter declared.** If the files hold more than one ship or cruise, untick "…come from one cruise of one ship" or map a cruise column.

**Sentence added when the finding has the parameter mixed.** So many events are named that the data probably come from more than one ship or cruise: map a cruise column, or do not tick the one-cruise box.

**What triggers it.** «file»:«lines» N event(s) whose implied speed from the previous event and to the next event both exceed 15 knots (MEDATLAS 4.4.4 default maximum ship velocity) while previous-to-next does not, and which ROW-SHIP-SPEED does not already report. Speed = distance, less the rounding of the written coordinates, over the LONGEST time gap the written dates and times allow: «cases».

**Thresholds.**

- speed.unusual = 15 knots. Source: [MEDATLAS Protocol, Part I: exchange format and quality checks for observed profiles, v3 (SISMER/IFREMER, Dec 2001)](https://nodc.ogs.it/repository/documents/guidelines/medman_v3.pdf), section 4.4.4 "Check the ship velocity", PDF p.29: "If the ship velocity \> maximum velocity of the ship (default is 15 knots) between two consecutive profiles, find the erroneous data (date or location)"
- speed.extreme = 40 knots. Source: [Met Office marine-qc (marine_qc) documentation, "Track check"](https://marine-qc.readthedocs.io/en/latest/track_check.html), section "Extreme speed check": "If the speed estimated from the locations at t-1 and t exceeds 40 knots, set the extreme speed check flag to fail." (the check itself compares one pair; both-sides logic: sections "Speed check" and "The combined track check")

**Citations.**

- [World Ocean Database 2018 User's Manual (prerelease, v0.10; Garcia et al.)](https://www.ncei.noaa.gov/data/oceans/woa/WOD/DOC/WOD18-UsersManual_final.pdf), section 4 "Speed check", printed p.31: "If the speed between adjoining casts is unrealistic, the date/time may be in error, the position may be wrong, or the cast may not belong to this cruise/platform."

### ROW-SHIP-SPEED-PAIR

Severity: info

**What the user sees.** Line numbers: «lines». Between these two points of the track the ship would have to sail faster than 40 knots: «cases» (lines first→second; km; h = longest possible gap). The position or the time at one of them is wrong, and it is not clear which. A day and month swapped in a date has the same effect.

**Sentence added when the finding has the parameter places.** In square brackets: the rows of each point of the track; "+" joins events within 10 km of the first of them, counted as one point.

**Sentence added when the finding has the parameter split.** "a/b": the hop is measured from the position on line a and from the end of the time interval on line b.

**Sentence added when the finding has the parameter declared.** If the files hold more than one ship or cruise, untick "…come from one cruise of one ship" or map a cruise column.

**Sentence added when the finding has the parameter mixed.** So many events are named that the data probably come from more than one ship or cruise: map a cruise column, or do not tick the one-cruise box.

**What triggers it.** «file»:«lines» N pair(s) of consecutive events whose implied speed exceeds 40 knots (Met Office marine-qc extreme speed limit) and which are not part of a two-sided finding (first or last event, or two bad events in a row). Position or date/time of either event may be wrong (WOD18 speed check; MEDATLAS 4.4.4). Speed = distance, less the rounding of the written coordinates, over the LONGEST time gap the written dates and times allow: «cases».

**Thresholds.**

- speed.extreme = 40 knots. Source: [Met Office marine-qc (marine_qc) documentation, "Track check"](https://marine-qc.readthedocs.io/en/latest/track_check.html), section "Extreme speed check": "If the speed estimated from the locations at t-1 and t exceeds 40 knots, set the extreme speed check flag to fail." (the check itself compares one pair; both-sides logic: sections "Speed check" and "The combined track check")

**Citations.**

- [World Ocean Database 2018 User's Manual (prerelease, v0.10; Garcia et al.)](https://www.ncei.noaa.gov/data/oceans/woa/WOD/DOC/WOD18-UsersManual_final.pdf), section 4 "Speed check", printed p.31: "If the speed between adjoining casts is unrealistic, the date/time may be in error, the position may be wrong, or the cast may not belong to this cruise/platform."
- [MEDATLAS Protocol, Part I: exchange format and quality checks for observed profiles, v3 (SISMER/IFREMER, Dec 2001)](https://nodc.ogs.it/repository/documents/guidelines/medman_v3.pdf), section 4.4.4 "Check the ship velocity", PDF p.29: "If the ship velocity \> maximum velocity of the ship (default is 15 knots) between two consecutive profiles, find the erroneous data (date or location)"

### ROW-DATE-UNPARSEABLE

Severity: warning

**What the user sees.** The dates in lines «lines» (e.g. "«value»") could not be read. Write dates as YYYY-MM-DD.

**Wording when the column holds times of day.** The times in lines «lines» (e.g. "«value»") could not be read. Write the time as HH:MM (24 hours), for example 16:30 (1630 and 16:30. are read too), in UTC or with the time zone stated; a range such as 16:00-17:30 or 1600-1730 is read as its start.

**What triggers it.** «file»:«lines» field «field» value '«value»': date not parseable (ISO 8601, YYYY/MM/DD, DD.MM.YYYY, unambiguous DD/MM/YYYY, YY-MM-DD, a four-digit year, YYYYMMDD in a column that is the date, or an Excel serial).

**What triggers it, for times of day.** «file»:«lines» field «field» value '«value»': time of day not parseable (HH:MM or HH:MM:SS, 24 hours; a range HHMM-HHMM or HH:MM-HH:MM, also several separated by commas, is read as the start of its first range and the end is ignored; state UTC or the time zone).

**Citations.**

- [W3C Note, Date and Time Formats (profile of ISO 8601)](https://www.w3.org/TR/NOTE-datetime), Formats: complete date YYYY-MM-DD
- [DataCite Metadata Schema 4.6, property Date](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/date/), section 8 Date, allowed formats

### ROW-TIME-OTHER-DAY

Severity: warning

**What the user sees.** In lines «lines» the time column (e.g. "«value»") holds a full date and time of another day than the date column (any other day without a time zone, more than a day apart with one). The time cannot be taken from it: check which date is right, or write the time of day alone.

**What triggers it.** «file»:«lines» field «field» value '«value»': the time column holds a full datetime of another day than the date column of the row (any other day without a zone, more than one day apart with one); the time of day is not taken from it (a datetime with a zone within a day of the date is read as the event's instant instead).

### ROW-DATE-MISSING

Severity: info

**What the user sees.** N rows («percent» %) have no date although the other rows do. Fill in the missing dates.

**What triggers it.** «file»:«lines» N row(s) («percent»%) without a date while other rows have one.

### ROW-YEAR-OUTLIER

Severity: warning

**What the user sees.** Lines «lines» are dated «years», while the title, file name or time span says «declared». One of them is probably a typo in the year.

**What triggers it.** «file»:«lines» year(s) «years» not among the declared year(s) «declared» (dataset label, file name, record title or temporal extent).

### ROW-JOIN-AMBIGUOUS

Severity: warning

**What the user sees.** Rows of sheet "«sheet»" (lines: «lines») got no position or date from sheet "«right»": the key "«field»" (e.g. «value») matches several rows there that differ in position or date, so none was taken (the first is not guessed).

**What triggers it.** «file», «sheet»:«lines» key «field» (example value «value»): the key matches several rows of sheet «right» that differ in position or date, so the rows get no position and no date from it; the first matching row is never taken. Join on a key that identifies one row (a composite key such as Cruise + Station is tried by the layout).

### ROW-LONG-VALUE-SKIPPED

Severity: warning

**What the user sees.** N values were not read in "«sheet»" (lines «lines»): another row has the same key and parameter (e.g. "«field»") with a different value, and no column of the sheet could safely be used to tell these rows apart; one value is kept and checked.

**What triggers it.** «file», «sheet»:«lines» field «field»: in a long sheet (parameter and value columns) N value(s) differ from the value already kept for the same key (sample, position, date, depth) and parameter, and no column could safely be used to tell those rows apart (a column is refused when it is unique on every row, when it cuts the measurements of one key into rows with no parameter in common, when two columns are equally good, or when it leaves a collision in a key it varies in); one value of a pair is read (the first, or the first after a blank or missing one) and nothing is averaged. Values equal to the kept one are not counted.

### ROW-LONG-NO-PARAMETER

Severity: warning

**What the user sees.** In "«sheet»" N rows have a value but nothing in the column "«column»" (lines «lines»). They cannot be read, because nothing says what they measure. Write the parameter name (if the cell was merged, the merge has to cover these rows).

**What triggers it.** «file», «sheet»:«lines» N row(s) of a long sheet (parameter and value columns) have a value and a blank parameter cell ("«column»"), and no merged cell above them gives one. The row is not read; nothing is guessed from the unit or the value. A row whose value is blank too is not counted. /check only: the converter blocks such rows with CONV-LONG-NO-PARAMETER.

### ROW-LONG-PARAMETER-MERGED

Severity: info

**What the user sees.** In "«sheet»" a cell of the column "«column»" is merged over several rows in the workbook; its name applies to every row of the merge: N rows below the first cell (lines «lines») were read with it. Check that this is the parameter you meant.

**What triggers it.** «file», «sheet»:«lines» the parameter cell ("«column»") of a long workbook sheet is merged down several rows (SheetJS !merges); only its top cell holds the name, so the cells below read as blank. The name of the top cell is read for every row of the merge that has a value; N row(s) below the top cell were filled that way (the lines). Only the parameter column is filled, only from a merge the workbook declares, only on rows with a value. The same note is shown on /convert.

### ROW-LONG-KEY-EXTENDED

Severity: info

**What the user sees.** In "«sheet»" rows with the same key and parameter held different values. The columns that tell them apart («columns») now join the key, so the values of the separated rows (e.g. lines «lines») are read and checked. The clean CSV writes them too, unless you set a column to ignore yourself.

**What triggers it.** «file», «sheet»:«lines» N column(s) («columns») were added to the row key because rows with the same key and parameter held different values there; the lines are some of the rows they separate. A column is taken only when it is not unique on every row, when in every key where it varies no two resulting rows have disjoint parameter sets, when it is the best of the acceptable ones (or splits the rows exactly like the others of equal count), and when it leaves no collision unresolved in a key it varies in. It is a column that separates the rows, not proof that it is a replicate: the choice is not confirmed by the header. Rows of other keys are unchanged and nothing is averaged; ROW-LONG-VALUE-SKIPPED still says what could not be read.

### ROW-KEY-IGNORED

Severity: info

**What the user sees.** In "«sheet»" these rows (e.g. lines «lines») look alike in the identifying columns of the clean CSV. The columns you set to ignore («columns») differ between them and are not written. Their other measured values are still in the file and in the clean CSV.

**What triggers it.** «file», «sheet»:«lines» N column(s) («columns») set to ignore by the person differ between rows that are equal in every identifying column the clean CSV writes (station, cruise, sample, date, position, depth and the other written key columns); the column is not written, so the rows look alike there. Long or wide sheet; on a long sheet only a column that entered the row key. The column may be a measurement. Their other measured values may differ and are all written. Nothing is removed from the file. Said only when two rows are equal in those columns and differ in a column set to ignore; a column that is ignore by default (a replicate, a cast, a comment) is written, as a key column or as a descriptive column after the variables, and is not this.

### ROW-JOIN-KEY-BLANK

Severity: warning

**What the user sees.** In sheet "«sheet»" (lines: «lines») the key "«field»" is blank, so no position or date could be taken from sheet "«right»". Fill in the key on those rows.

**What triggers it.** «file», «sheet»:«lines» key «field»: a part of the join key is blank on rows that have no position of their own, so the row of sheet «right» cannot be found and the rows keep no position and no date from it.

### ROW-DATE-YYMMDD

Severity: info

**What the user sees.** Dates in column "«field»" have a two-digit year and a century was added; e.g. "«value»" was read as «interpreted» (order «order»: ymd year first, dmy day first, mdy month first). One acceptance covers the century in every column this note names, each by name. Use a four-digit year.

**What triggers it.** «file» field «field» value '«value»': NN-NN-NN read as «interpreted» in the order «order» (century inferred; ambiguous). The century of a two-digit year is the reader's decision. The export gate accepts per rule, not per column: one acceptance of ROW-DATE-YYMMDD covers the century in every column it names, each named in its own finding.

### ROW-DATE-YY-AMBIGUOUS

Severity: warning

**What the user sees.** Dates such as "«value»" can be read in more than one order (ymd: year first, dmy: day first, mdy: month first), and no date in column "«field»" decides it. Read as «interpreted»; it could also be «readings».

**What triggers it.** «file» field «field» value '«value»': NN-NN-NN with two or more readings that fit every NN-NN-NN cell of the column (no part above 31, none above 12 in a month place rules them out) and a date that differs between them. Read as «interpreted» (the first reading that fits every cell: year-month-day when it does; century inferred); it could also be «readings» (date and order code, joined with "; "). Reported once per column. In /convert the export is blocked until the person declares the order of the column.

### ROW-TZ-UNKNOWN

Severity: info

**What the user sees.** The time zone of the times in column "«field»" is not stated. Say whether they are UTC or local time.

**What triggers it.** «file» field «field»: date-time values carry neither a UTC marker nor an offset; time zone unknown.

### ROW-UNIT-MISSING

Severity: warning

**What the user sees.** No unit is given for: «headers». Add the unit to each column header, e.g. "DIC \[µmol/kg\]".

**What triggers it.** «file»: no unit in the header or in the metadata for column(s) «headers».

### ROW-HEADER-CODE-SHAPE

Severity: warning

**What the user sees.** Header "«column»": the code «code» after "SDN:«collection»::" is not a «collection» code, which has exactly «length» capital letters and digits. NVS has no such concept (it answers 404). Check the code for a typo or an extra character.

**What triggers it.** «file», column «column»: the code "«code»" after the explicit prefix SDN:«collection»:: is not of the shape of a «collection» code («length» upper-case letters and digits); the concept page does not exist (NVS: 404). Only the prefixed form is checked; a bare word is never read as a code.

**Citations.**

- [NERC Vocabulary Server (NVS), collections P01 (BODC Parameter Usage Vocabulary) and P06 (BODC data storage units); read 2026-10-29](https://vocab.nerc.ac.uk/collection/P06/current/), Every concept of P06 has a four-character code (411 of 411 codes read, e.g. UPAA) and every concept of P01 an eight-character one (50 613 of 50 613 codes read, e.g. TEMPPR01; 66 begin with a digit); a code of another length has no concept page: https://vocab.nerc.ac.uk/collection/P01/current/D13CMOP11/ answers 404, https://vocab.nerc.ac.uk/collection/P01/current/D13CMOP1/ is a concept.

### ROW-DEPTH-SIGN

Severity: info

**What the user sees.** It is not stated whether depth in column "«header»" is counted downwards (positive) or upwards. Describe the convention in the header or in the description.

**What triggers it.** «file»: depth column '«header»' has no stated sign convention.

### ROW-DEPTH-MIXED-SIGN

Severity: warning

**What the user sees.** The depth column "«header»" (sheet "«sheet»") has values of both signs: «negative» negative, «positive» positive. The direction (down or up) is not decided, and the range is checked on the values without their sign. State in the description which way depth is counted.

**What triggers it.** «file», «sheet»: depth column '«header»' has «negative» negative and «positive» positive non-zero values (0, -99, -999 and -9999 not counted; every row read). No direction is chosen (not the majority); ROW-DEPTH-RANGE judges |depth|. No value is changed.

### ROW-MISSING-CODE

Severity: warning

**What the user sees.** The column "«column»" has a possible missing-value code in N cells, e.g. «value» (lines «lines»). Values such as -99, -999 and -9999 often stand for "not measured". They are kept as written and left out of the depth direction and the range checks.

**What triggers it.** «file», «sheet»:«lines» N cell(s) of column '«column»' (column «index» of the sheet in /convert) hold exactly -99, -999 or -9999 (numeric equality, first: «value»), a code often written for "no measurement". /check keeps the cell as written and leaves it out of the depth direction, ROW-DEPTH-RANGE and CHEM-RANGE; /convert blocks the export until the column is answered (missing: the cells are left out and listed; real: they are written and judged like any value). Checked: the depth column (the two bounds of a Darwin Core range) and every variable of the sheet. The cell is never replaced.

### ROW-DM-COORDS

Severity: info

**What the user sees.** Coordinates in column "«field»" are written as degrees and minutes (e.g. "«value»"). They were converted to decimal degrees; check a few of them.

**What triggers it.** «file» field «field» value '«value»': degree-minute(-second) text converted to decimal degrees.

### ROW-HEMISPHERE-CONFLICT

Severity: warning

**What the user sees.** In lines «lines» the value in column "«field»" (e.g. "«value»") disagrees with the hemisphere letter in column "«hemisphere»": it has a minus sign or a letter of its own, or the letter belongs to the other axis. It was kept as written and its sign was not changed again; correct these rows.

**What triggers it.** «file»:«lines» field «field» value '«value»': disagrees with the hemisphere letter in «hemisphere»; kept as written, not negated again.

### ROW-HEMISPHERE-UNPAIRED

Severity: warning

**What the user sees.** Column "«hemisphere»" is set as a hemisphere letter, but it belongs to a different position than "«field»" (their start and end words disagree), so it was not applied. Check which column is mapped as the coordinate.

**What triggers it.** «file» field «field»: hemisphere column «hemisphere» belongs to another start/end position; not applied.

### ROW-HEMISPHERE-MISSING

Severity: warning

**What the user sees.** In lines «lines» column "«field»" has a value (e.g. "«value»") but the hemisphere column "«hemisphere»" is empty or holds something other than N, S, E, W. The value was kept as written, so it may have the wrong sign for the southern or western hemisphere; fill in the letter.

**What triggers it.** «file»:«lines» field «field» value '«value»': the hemisphere column «hemisphere» is empty or not N/S/E/W; kept as written.

### ROW-ZERO-COORD

Severity: error

**What the user sees.** In lines «lines» latitude and longitude are both 0. That point lies in the Gulf of Guinea and usually stands for coordinates that are missing and were typed as zero. Enter the real position or leave the cells empty.

**What triggers it.** «file»:«lines» latitude and longitude are both 0 (obis-qc ZERO_COORD, which drops the record; Biocheck "0-0 coordinates"). Reported instead of ROW-LAT-EQ-LON, which it would also match.

**Citations.**

- [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: "if record.get_interpreted("decimalLongitude") == 0 and record.get_interpreted("decimalLatitude") == 0: record.set_flag(Flag.ZERO_COORD); record.dropped = True"
- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Integrity checks: "decimalLatitude and decimalLongitude are both 0" ... "It is theoretically possible that a sampling event happens at 0-0 coordinates, however it is very common to inadvertedly add 0-0 when the actual coordinates are missing. Therefore, 0-0 coordinates should always be double checked."

### ROW-NO-COORD

Severity: warning

**What the user sees.** In lines «lines» (N in all) the latitude or the longitude is missing although the other rows have a position. Such a record cannot be placed on a map. Fill in the coordinates; if it is a summary or helper row, ignore this note.

**What triggers it.** «file»:«lines» N row(s) with a blank latitude or longitude cell while other rows of the sheet have a position (obis-qc NO_COORD, which drops the record). Blank trailing rows, summary rows and rows that inherit a position from a parent event are not counted.

**Citations.**

- [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: "if record.get_interpreted("decimalLongitude") is None or record.get_interpreted("decimalLatitude") is None: record.set_flag(Flag.NO_COORD); record.dropped = True"

### ROW-DEPTH-MIN-MAX

Severity: error

**What the user sees.** In lines «lines» the minimum depth is greater than the maximum depth (e.g. «value»). The two columns may be swapped or mistyped; correct the values.

**What triggers it.** «file»:«lines» minimumDepthInMeters greater than maximumDepthInMeters (first: «value»); obis-qc MIN_DEPTH_EXCEEDS_MAX, obistools check_depth.

**Citations.**

- [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: "if record.get_interpreted("minimumDepthInMeters") \> record.get_interpreted("maximumDepthInMeters"): record.set_flag(Flag.MIN_DEPTH_EXCEEDS_MAX)"
- [OBIS obistools (R), R/check_depth.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_depth.R), check_depth, details: "minimum depth greater than maximum depth" (error); code: minGTmax \<- !is.na(maxd) & !is.na(mind) & mind \> maxd

### ROW-DEPTH-RANGE

Severity: warning

**What the user sees.** Depth in column "«field»" (lines «lines», e.g. «value» m) is outside the range -100000 to 11000 m that OBIS accepts. The deepest point of the ocean is about 10,935 m. Check the unit (metres) and the sign.

**What triggers it.** «file»:«lines» field «field» value '«value»': depth outside -100000..11000 m (obis-qc DEPTH_OUT_OF_RANGE bounds, inclusive; positive down; a column with an upward convention is judged after the sign is turned). The deepest point of the ocean, Challenger Deep, is about 10,935 m (NOAA).

**Thresholds.**

- depth.min = -100000 m. Source: [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: misc.check_float(record.get("minimumDepthInMeters"), \[-100000, 11000\]) (the same call for maximumDepthInMeters; in_range = valid_range\[0\] \<= value \<= valid_range\[1\], out of range sets Flag.DEPTH_OUT_OF_RANGE)
- depth.max = 11000 m. Source: [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: misc.check_float(record.get("minimumDepthInMeters"), \[-100000, 11000\]) (the same call for maximumDepthInMeters; in_range = valid_range\[0\] \<= value \<= valid_range\[1\], out of range sets Flag.DEPTH_OUT_OF_RANGE)

**Citations.**

- [NOAA National Ocean Service, "How deep is the ocean?" (last updated 2026-09-23)](https://oceanservice.noaa.gov/facts/oceandepth.html), "Challenger Deep is approximately 10,935 meters (35,876 feet) deep." (the deepest part of the ocean)

### ROW-DATE-FUTURE

Severity: warning

**What the user sees.** The date in column "«field»" (lines «lines», e.g. «value») is later than today; for an interval its end counts. An event in the future cannot have happened yet: check the year, month and day.

**What triggers it.** «file»:«lines» field «field» value '«value»': the date, or the end of the interval, is later than today (UTC; a value counts as future only when it can have begun nowhere yet, so a date within a day of today, as read in the latest time zone UTC+14, is not; a year or month counts by its first day). obis-qc DATE_IN_FUTURE.

**Citations.**

- [OBIS obis-qc (Python), obisqc/time.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/time.py), check_record: "if ms_end \> date_to_millis(datetime.date.today()): # date in the future record.set_flag(Flag.DATE_IN_FUTURE)"

### ROW-INVISIBLE-CHAR

Severity: warning

**What the user sees.** In column "«field»" the values in lines «lines» contain invisible characters («chars»), e.g. "«value»", so the name or ID will not match the same text typed normally. A space-like character: replace it with a plain space. A zero-width one (U+200B, U+FEFF ...): it should be taken out of the value.

**What triggers it.** «file»:«lines» field «field» value '«value»': invisible characters inside the value («chars»). OBIS trims only the ends of a value, so inside they break name matching, vocabulary matching and duplicate checks (OBIS Manual, "Hidden characters and non-breaking spaces"). Checked columns: station, cruise and sample identifiers, and the name, identifier and vocabulary columns of Darwin Core input.

**Citations.**

- [OBIS Manual, "Common data quality issues" (iobis/manual common_qc.md; manual.obis.org)](https://manual.obis.org/common_qc.html), "Hidden characters and non-breaking spaces": "a value like Abra alba containing a non-breaking space will not match the same name typed with a normal space"; "OBIS removes leading and trailing whitespace from values during processing, but does not change spaces inside a value"; "Other invisible characters, such as tabs, line breaks within a cell, and zero-width spaces (U+200B), can cause similar problems"

### ROW-YEAR-DATE-MISMATCH

Severity: warning

**What the user sees.** In column "«field»" the year in lines «lines» (N in all) is not the year of the date in "«date»", e.g. the date "«value»" beside the year «year». One of the two is wrong, or they belong to different events, or the column means something else, such as a cruise or a season. Nothing was changed; check which one is right.

**What triggers it.** «file»:«lines» field «field»: N row(s) whose year («year» in the first) is not a year of the date in «date» (e.g. '«value»'). A date range counts every year it covers; a year-only date, a date built from the Year column itself and a blank or non-numeric year are not compared. Nothing is changed.

### ROW-TEXT-MOJIBAKE

Severity: warning

**What the user sees.** Text in «columns» (lines «lines»; N cells with this pattern) looks encoded twice, e.g. "«value»": a UTF-8 file was read as Windows-1252 or Latin-1 somewhere. The text was not changed. Save the original again as UTF-8 and compare these values.

**What triggers it.** «file»:«lines» N cell(s) in «columns» hold a double-encoding pair (U+00C3 or U+00C2 followed by a character in U+0080-U+00BF; first value '«value»'), the signature of UTF-8 bytes read as a single-byte encoding and encoded again. A lone U+00C3 or U+00C2 is real text and is not matched. Only this pair is counted: other double-encoded forms (for example U+00E2 U+20AC U+2122 for an apostrophe, U+00C5 U+201A, U+00C3 U+201C, U+00C3 U+20AC, U+00D0 followed by a letter) are not matched, so the count is of the pair and not of every damaged cell. A file the parser decoded by a fallback (IN-ENCODING-FALLBACK, or IN-ENCODING-AMBIGUOUS when windows-1250, ISO-8859-2 and windows-1252 read its bytes differently) is not read; UTF-16 and valid UTF-8 are read as text; one that declares its own encoding is. Nothing is rewritten.

### DWC-TERM-MISSING

Severity: error

**What the user sees.** This looks like a Darwin Core table («core»), but it has no column for terms that OBIS requires: «terms». Add them; without them the records are not fit to publish in OBIS.

**What triggers it.** «file»: Darwin Core input («core» core) without a column for the required term(s) «terms». Required: occurrenceID (Occurrence core) or eventID (Event core), eventDate, decimalLatitude, decimalLongitude, and for an Occurrence core scientificName, occurrenceStatus, basisOfRecord (obistools check_fields; OBIS Manual). scientificNameID is only recommended (DWC-RECOMMENDED).

**Citations.**

- [OBIS obistools (R), R/check_fields.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_fields.R), check_fields: required \<- c("eventDate", "decimalLongitude", "decimalLatitude", "scientificName", "scientificNameID", "occurrenceStatus", "basisOfRecord"); "Missing or empty required fields are reported as errors"
- [OBIS Manual, "Common format issues" (iobis/manual common_formatissues.md; manual.obis.org)](https://manual.obis.org/common_formatissues.html), "Missing required fields": "one (or more) of the eight required terms for OBIS"; "occurrenceID or eventID"; "scientificNameID (strongly recommended)"

### DWC-TERM-EMPTY

Severity: error

**What the user sees.** Column "«field»", which OBIS requires, has no value in lines «lines» (N in all). Fill them in.

**What triggers it.** «file»:«lines» field «field»: N empty value(s) in a column OBIS requires (obistools check_fields: "Empty value for required field"). For decimalLatitude, decimalLongitude and eventDate only a column empty in every row is reported here (single missing positions are ROW-NO-COORD, single missing dates ROW-DATE-MISSING; where no date exists anywhere, data or metadata, META-NO-DATES says it instead).

**Citations.**

- [OBIS obistools (R), R/check_fields.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_fields.R), check_fields: required \<- c("eventDate", "decimalLongitude", "decimalLatitude", "scientificName", "scientificNameID", "occurrenceStatus", "basisOfRecord"); "Missing or empty required fields are reported as errors"
- [OBIS Manual, "Common format issues" (iobis/manual common_formatissues.md; manual.obis.org)](https://manual.obis.org/common_formatissues.html), "Missing required fields": "one (or more) of the eight required terms for OBIS"; "occurrenceID or eventID"; "scientificNameID (strongly recommended)"

### DWC-RECOMMENDED

Severity: warning

**What the user sees.** OBIS also recommends the following, which this Darwin Core table («core») lacks or leaves empty in every row: «terms». It is not an error, but it makes the data easier to check and the names easier to match.

**What triggers it.** «file»: Darwin Core input («core» core) without a column, or with no value in any row, for the recommended term(s) «terms». Recommended: minimumDepthInMeters and maximumDepthInMeters (obistools check_fields), scientificNameID for an Occurrence core ("strongly recommended", OBIS Manual; obistools lists it as required).

**Citations.**

- [OBIS obistools (R), R/check_fields.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_fields.R), check_fields: recommended \<- c("minimumDepthInMeters", "maximumDepthInMeters"); "missing or empty recommended fields are reported as warnings"
- [OBIS Manual, "Common format issues" (iobis/manual common_formatissues.md; manual.obis.org)](https://manual.obis.org/common_formatissues.html), "Missing required fields": "one (or more) of the eight required terms for OBIS"; "occurrenceID or eventID"; "scientificNameID (strongly recommended)"

### DWC-VOCAB-VALUE

Severity: warning

**What the user sees.** In column "«field»" the value "«value»" (lines «lines») is not on the list OBIS accepts: «allowed». Capitalisation does not matter, but the spelling must be that of the list. Correct the value.

**What triggers it.** «file»:«lines» field «field» value '«value»': not in the vocabulary obis-qc compares with, in lower case, after OBIS trims the ends: «allowed». basisOfRecord: the eight identifiers of the GBIF vocabulary basis_of_record_2022-02-02 (the obis-qc README also names Event and Taxon; the code reads the vocabulary file); occurrenceStatus: absent, present, notDetected, detected. One finding per value.

**Citations.**

- [OBIS obis-qc (Python), obisqc/fields.py and obisqc/util/vocabularies.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/fields.py), fields.py check_record: "if not record.get("basisOfRecord").lower() in \[value.lower() for value in vocabs\["dwc:basisOfRecord"\]\]: record.set_invalid("basisOfRecord")"; util/vocabularies.py reads the identifiers of rs.gbif.org/vocabulary/dwc/basis_of_record_2022-02-02.xml
- [GBIF Darwin Core Basis of Record Vocabulary, issued 2022-02-02 (the list obis-qc reads at run time)](https://rs.gbif.org/vocabulary/dwc/basis_of_record_2022-02-02.xml), the eight concept identifiers: PreservedSpecimen, FossilSpecimen, LivingSpecimen, HumanObservation, MachineObservation, MaterialSample, Occurrence, MaterialCitation
- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Format checks: "basisOfRecord does not seem to contain a valid term such as: "PreservedSpecimen", "FossilSpecimen", "LivingSpecimen", "HumanObservation", "MachineObservation", "MaterialSample", "Occurrence""
- [OBIS obis-qc (Python), obisqc/absence.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/absence.py), absence.py: ABSENT_VALUES = {"absent", "notDetected"}, PRESENT_VALUES = {"present", "detected"}; the status is compared in lower case; any other value: record.set_invalid("occurrenceStatus")

### DWC-EVENTID-DUPLICATE

Severity: error

**What the user sees.** In lines «lines» event identifiers repeat (e.g. "«value»"; N repeated in all). Every event needs its own unique eventID, otherwise it is unclear which event the dependent records belong to.

**What triggers it.** «file»:«lines» eventID '«value»' and N repeated eventID(s) in all, in an Event core (obistools check_eventids: "eventID ... is duplicated"). Every row of a repeated eventID is listed. Not run on an Occurrence core, where one eventID legitimately repeats.

**Citations.**

- [OBIS obistools (R), R/check_eventids.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_eventids.R), check_eventids: "check duplicate eventIDs" (error: "eventID ... is duplicated"); "check if all parentEventIDs have corresponding eventID" (error: "parentEventID ... has no corresponding eventID")

### DWC-PARENT-DANGLING

Severity: error

**What the user sees.** In lines «lines» the parentEventID (e.g. "«value»"; N different in all) points at an event that is not in this table's eventID column. Correct the identifier or add the missing parent event.

**What triggers it.** «file»:«lines» parentEventID '«value»' (N different in all) has no matching eventID in the Event core (obistools check_eventids; Biocheck). Not run when the archive was read only in part (IN-DWCA-PARTIAL).

**Citations.**

- [OBIS obistools (R), R/check_eventids.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_eventids.R), check_eventids: "check duplicate eventIDs" (error: "eventID ... is duplicated"); "check if all parentEventIDs have corresponding eventID" (error: "parentEventID ... has no corresponding eventID")
- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Integrity checks: "if the parentEventID field is populated, it must be populated with an existing eventID from the eventID field. Adding to the parentEventID field something different than an existing eventID is incoherent."

### DWC-PARENT-LOOP

Severity: error

**What the user sees.** In lines «lines» (N in all) the event hierarchy runs in a circle: an event is its own ancestor (e.g. "«value»"). Correct the parentEventID so that the hierarchy ends in an event without a parent.

**What triggers it.** «file»:«lines» N row(s) lie on a loop of the eventID / parentEventID hierarchy (e.g. eventID '«value»'; GBIF OccurrenceIssue PARENT_EVENT_INFINITE_LINEAGE). A row whose parentEventID equals its own eventID is a loop of one. Linear-time detection.

**Citations.**

- [GBIF API, enumeration of OccurrenceIssue (read 2026-10-24)](https://api.gbif.org/v1/enumeration/basic/OccurrenceIssue), OccurrenceIssue value PARENT_EVENT_INFINITE_LINEAGE (a loop in the eventID / parentEventID hierarchy)

### DWC-OCCURRENCEID-DUPLICATE

Severity: error

**What the user sees.** In lines «lines» occurrenceIDs repeat (e.g. "«value»"; N repeated in all). The occurrenceID is the key of a record and must be unique; give every record its own identifier.

**What triggers it.** «file»:«lines» occurrenceID '«value»' and N repeated occurrenceID(s) in all (Biocheck: "occurrenceID is unique in the occurrence table", the primary key). Every row of a repeated occurrenceID is listed.

**Citations.**

- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Integrity checks: "Checks that occurrenceID is unique in the occurrence table" ... "The occurrenceID acts as the Primary Key for the occurrence table, therefore two records with the same occurrenceID cannot exist in the occurrence table."

### DWC-EVENTDATE-NOT-ISO

Severity: warning

**What the user sees.** In column "«field»" the dates in lines «lines» (N in all) are not written in ISO 8601, e.g. "«value»". Darwin Core takes 2011-06-14, 2011-06, 2011, a time such as 2011-06-14T10:00Z, or an interval with a slash (2011-06-14/2011-06-20). Nothing was changed; write the dates that way.

**What triggers it.** «file»:«lines» field «field»: N value(s) that are not ISO 8601 as Darwin Core eventDate takes it (year, year-month, date, date with a time and an optional zone, or an interval of two such values joined by a slash; first '«value»'). Only a column headed exactly eventDate is read; an xlsx date-formatted cell is not judged. Nothing is changed.

## Across files and chemistry

### XF-DUPLICATE-SAMPLES

Severity: info

**What the user sees.** The files «fileA» and «fileB» have N samples in common. Make sure they are not counted twice.

**What triggers it.** «fileA» and «fileB»: N matched samples (same station or position, same depth, same day).

### XF-DATE-CONFLICT

Severity: warning

**What the user sees.** Station «station» has the same values in «fileA» and «fileB» but different dates («dateA» and «dateB»). One of the dates is probably wrong.

**Sentence added when the finding has the parameter ambiguous.** One of them is a two-digit-year date of a column whose order is open; it was read in the default order, so the conflict may come from the reading.

**What triggers it.** station «station»: «fileA»:«lineA» dated «dateA» vs «fileB»:«lineB» dated «dateB»; at least 2 shared variables are equal. When one of the dates is a two-digit-year date of a column whose order is open (ROW-DATE-YY-AMBIGUOUS), it was read in the default order and the text says so (optional param ambiguous = yes).

### XF-STATION-ALIAS

Severity: info

**What the user sees.** "«nameA»" and "«nameB»" look like the same station written in two ways. Use one name everywhere.

**What triggers it.** «file»: station ids '«nameA»' and '«nameB»' are equal after normalisation (last '/' segment, upper case, spaces removed).

### XF-UNIT-CONFLICT

Severity: warning

**What the user sees.** «variable» has the same numbers in «fileA» and «fileB», but one says «unitA» and the other «unitB». These are not the same unit; correct the wrong label.

**What triggers it.** «variable»: «equal» of «matched» matched samples have equal values, but the units differ in dimension: '«unitA»' («fileA») vs '«unitB»' («fileB»).

**Citations.**

- [Lauvset et al. (2024), GLODAPv2.2023, Earth System Science Data 16, 2047](https://essd.copernicus.org/articles/16/2047/2024/), section 3.1 (per-litre to per-kilogram conversion with seawater density)
- [Fofonoff & Millard (1983), UNESCO Technical Papers in Marine Science 44 (GitHub-hosted copy)](https://raw.github.com/ocefpaf/python-seawater/master/docs/UNESCO-TechPaper44_eo.pdf), PDF p.23, check values of seawater density

### XF-POSITION-SWAP

Severity: warning

**What the user sees.** The positions of stations «stationA» and «stationB» are exchanged between «fileA» and «fileB». One of the files probably has the station names mixed up.

**What triggers it.** stations «stationA» and «stationB»: positions exchanged between «fileA» and «fileB».

### XF-POSITION-CONFLICT

Severity: warning

**What the user sees.** Station «station» is at a different position in «files» than in the other files («positions»). Check which coordinates are correct.

**What triggers it.** station «station»: position in «files» lies outside the range seen in the other dataset(s): «positions».

### CHEM-UNIT-PAIR

Severity: warning

**What the user sees.** «variable» is given in two units («unitA» and «unitB»), but after conversion the two columns do not agree. One of them is wrong.

**What triggers it.** «file»:«lines» «variable»: «unitA» vs «unitB» inconsistent after conversion with molar masses C 12.011, N 14.007, P 30.974, Si 28.085 g/mol (e.g. «value»).

**Thresholds.**

- molarMass.C = 12.011 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "6 C carbon 12.011 ± 0.002"
- molarMass.N = 14.007 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "7 N nitrogen 14.007 ± 0.001"
- molarMass.P = 30.974 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "15 P phosphorus 30.974 ± 0.001"
- molarMass.Si = 28.085 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "14 Si silicon 28.085 ± 0.001"

### CHEM-DIC-GT-TA

Severity: warning

**What the user sees.** In «group», N of «total» rows have more dissolved inorganic carbon (DIC) than alkalinity (TA), which is unusual in sea water. Check the columns and units.

**What triggers it.** «file»:«lines» «group»: DIC \> TA in N of «total» rows (median TA-DIC «medianDiff»).

**Citations.**

- [TEOS-10 Manual, IOC Manuals and Guides 56](https://www.teos-10.org/pubs/TEOS-10_Manual.pdf), Appendix A.4, printed pp.80-81 (Standard Seawater: TA 2300 and DIC 2080 µmol/kg at SP = 35)
- [Dickson, Sabine & Christian (2007), Guide to Best Practices for Ocean CO2 Measurements, PICES Special Publication 3](https://www.ncei.noaa.gov/access/ocean-carbon-acidification-data-system/oceans/Handbook_2007/Guide_all_in_one.pdf), SOP 2 section 1, PDF p.39 (oceanic DIC 1800–2300 µmol/kg)
- [Dickson, Sabine & Christian (2007), Guide to Best Practices for Ocean CO2 Measurements, PICES Special Publication 3](https://www.ncei.noaa.gov/access/ocean-carbon-acidification-data-system/oceans/Handbook_2007/Guide_all_in_one.pdf), SOP 3a section 1, PDF p.53 (oceanic TA 2000–2500 µmol/kg)

### CHEM-RANGE

Severity: warning

**What the user sees.** N values of «variable» lie outside the open-ocean range of «min» to «max» «unit» used by Argo quality control. Check the values and the unit; if the sample is from fresh or brackish water, confirm that.

**What triggers it.** «file»:«lines» field «field» «variable»: N value(s) outside «min»..«max» «unit» (e.g. '«value»'); global range test of the cited QC manuals.

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
