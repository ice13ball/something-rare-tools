# Rules of /convert

Generated from the rule registry (`src/core/rules/`) by `scripts/rules-docs-per-tool.ts`. Do not edit by hand.
Regenerate with `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-docs-per-tool.test.ts`.

/convert reads a spreadsheet or table, asks the person to declare what the columns mean, and writes a Darwin Core archive. It re-uses the file-reading and row checks of /check, and adds its own questions (rules with the prefix CONV). For every rule the list names the export policy: block stops the export, accept needs one tick for the rule per run, show is only shown.

Severity is error, warning or info. Every number a rule compares against is listed with its source. A text in guillemets, «name», stands for a value the tool fills in from the finding; N stands for a number; a plural form is written in the plural. The texts are the ones the tool shows (English), unchanged.

245 rules.

## Reading the file or record

### IN-RECORD-INACCESSIBLE

Severity: error · Export policy: block

**What the user sees.** The record on «host» could not be opened (error «status»); it may be private or unpublished. Download its files or metadata and drop them here.

**Wording when the server fails (status 500 to 599).** The server «host» returned an error («status»), so the record could not be opened. This is usually a temporary fault on the server's side: try again later, or download its files or metadata and drop them here.

**Wording when the status is neither 403, 404 nor a server failure.** The record on «host» could not be opened (error «status»). Try again later, or download its files or metadata and drop them here.

**What triggers it.** «file»: HTTP «status» from «host»; record metadata not readable, continuing with what the other sources provided.

### IN-HOST-NOT-ALLOWED

Severity: warning · Export policy: show

**What the user sees.** A link points to «host», which this tool is not allowed to open. Download the file yourself and drop it here.

**What triggers it.** «file»: host «host» is not on the allowlist (DATA_HOSTS); not fetched.

### IN-FETCH-BLOCKED

Severity: warning · Export policy: show

**What the user sees.** Your browser could not download from «host». Download the file yourself and drop it here.

**What triggers it.** «file»: fetch from «host» blocked in browser mode (CORS, CSP or network error).

### IN-FETCH-TIMEOUT

Severity: warning · Export policy: show

**What the user sees.** «host» did not start to answer within 30 seconds, so the browser stopped waiting. Try again later or switch to server mode.

**What triggers it.** «file»: no response from «host» within 30 s in browser mode; the request was abandoned.

### IN-LAYOUT-UNSUPPORTED

Severity: error · Export policy: block

**What the user sees.** The tool cannot read the layout of this table («reason»). Reshape it into one header row with one row per sample and try again.

**What triggers it.** «file» sheet «sheet»: layout not supported: «reason».

### IN-ENCODING-FALLBACK

Severity: info · Export policy: accept

**What the user sees.** The file is not saved as UTF-8, so it was read as «encoding». Check that accented letters look right.

**What triggers it.** «file»: bytes are not valid UTF-8; decoded as «encoding». The 8-bit pick is the reader's decision when the bytes are not UTF-8, so the outcome is accepted once before the export.

### IN-ENCODING-AMBIGUOUS

Severity: warning · Export policy: block

**What the user sees.** This file is not UTF-8, and its letters read N different ways: «readings». It was read as «encoding». Check which reading is right and save the file again as UTF-8.

**What triggers it.** «file»: bytes are not valid UTF-8 and read N different ways across windows-1250, ISO-8859-2 and windows-1252 («readings»); decoded as «encoding». Code pages that decode the bytes alike count as one reading, so a file all three read alike raises IN-ENCODING-FALLBACK instead. The checker reports and keeps its pick; the converter blocks until the person names the encoding.

### IN-DECIMAL-COMMA

Severity: info · Export policy: accept

**What the user sees.** This file writes numbers with a decimal comma (3,14). They were read that way; use a decimal point when you publish.

**What triggers it.** «file»: decimal comma detected (semicolon or tab delimiter, most numeric cells look like 3,14); values parsed with ',' as the decimal separator. The decimal comma is the reader's decision (50 rows, 80 %), so the outcome is accepted once before the export.

### IN-DECIMAL-AMBIGUOUS

Severity: warning · Export policy: block

**What the user sees.** In column "«column»" every number with a comma has three digits after it (N cells), so "«value»" can be «asDecimal» or «asThousands». They were read with a decimal comma («asDecimal»). Check which one the file means.

**Sentence added when the finding has the parameter thousandsSeen.** The column also holds "«thousandsSeen»", written with commas as thousands separators, so these numbers may be thousands; the tool still read the others as decimals.

**What triggers it.** «file» sheet «sheet»: column «index» "«column»": every cell with a comma (N) has exactly three digits after it, so the comma may be a decimal comma («asDecimal») or a thousands separator («asThousands») for "«value»". Read as decimal; the file does not say which. Judged per column over all rows: one value with 1, 2 or 4 or more decimals settles it.

### IN-HEADER-SHORT

Severity: warning · Export policy: accept

**What the user sees.** The header has «header» names, but N of «rows» rows have «width» values, so «extra» names are missing. The tool cannot tell where: it shows the extra values at the end as Columns «range». If names are missing earlier in the header, the columns from that point on carry the values of their neighbour: check the first values of the last named columns too, and give each column the meaning of its values.

**What triggers it.** «file»: the header has «header» names; N of «rows» data rows have «width» fields; «extra» names missing, position unknown; the extra values are shown as Column «range» (internal names "Column N").

### IN-HEADER-UNITS-READ

Severity: info · Export policy: show

**What the user sees.** Line «lines» holds units, not data: N columns got the unit in the name (for example "«example»"). That line is not counted as a data row, and the line numbers in this report stay the file's own.

**What triggers it.** «file» sheet «sheet»: line «lines» is a second header row in which every filled cell is a unit; N column names now carry their unit as "name \[unit\]", the first being "«example»". Cells are not changed; the row is not a data row.

### IN-HEADER-UNITS-NAMED

Severity: info · Export policy: show

**What the user sees.** Line «lines» holds units, not data: the column names carry them as well. That line is not counted as a data row, and the line numbers in this report stay the file's own.

**What triggers it.** «file» sheet «sheet»: line «lines» is a second header row in which every filled cell is a unit, and every column it names carries the same unit in its header too. No name is changed; the row is not a data row.

### IN-PERCENT-READ

Severity: info · Export policy: show

**What the user sees.** N cells of column "«column»" are formatted as a percentage and were read as shown («stored» is read as «shown»).

**What triggers it.** «file» sheet «sheet»: N numeric cells of column "«column»" have a number format with a percent sign; the stored number's decimal point was moved two places right (first: «stored» read as «shown»). The cell's formatted text (rounded) is not used.

### IN-COLUMN-NO-HEADER

Severity: warning · Export policy: show

**What the user sees.** Column «column» has values in N rows but no name in the header (lines «lines»). It is read as a column without a name; give it a name in the file, or say on /convert what it holds.

**What triggers it.** «file» sheet «sheet»: column «column» holds a value in N data rows (lines «lines») but the header row has no name there or to its right; read as an unnamed column ("Column N"), every cell kept where it is.

### IN-DATE1904

Severity: info · Export policy: show

**What the user sees.** This Excel file uses the older 1904 date system (dates differ by 1462 days from the usual one). Dates were converted accordingly; check a few of them.

**What triggers it.** «file»: workbook date1904 flag is set; serial dates converted with epoch 1904-01-01 (1462 days offset from the 1900 system).

**Citations.**

- [Microsoft Support, Date systems in Excel](https://support.microsoft.com/en-us/office/date-systems-in-excel-e7fe7167-48a9-4b96-bb53-5612a800b487), 1900 and 1904 date systems; "The difference between the two date systems is 1,462 days."

### IN-PANGAEA-EVENT-USED

Severity: info · Export policy: show

**What the user sees.** The table has no position or date of its own for these rows, so the Event(s) block of the file header was used: columns «columns» were added (N rows). One event applies to every row; with several, each row takes the event named in its Event column. Check the values.

**What triggers it.** «file» sheet «sheet»: columns «columns» added from the Event(s) header block («events» event(s)) for N row(s) that had no position or date of their own.

### IN-PANGAEA-EVENT-NOT-USED

Severity: warning · Export policy: show

**What the user sees.** The Event(s) block in the file header gives a position or date, but none was copied into the table, and the table has none of its own.

**Sentence added when the finding has the parameter several.** The block lists «several» events and the table has no Event column, so it is unknown which row belongs to which. Add an Event column, or position and date columns.

**Sentence added when the finding has the parameter track.** The position of the event is a track (the start and the end differ), not a point, so it is not the position of a sample. Add position columns to the table.

**What triggers it.** «file» sheet «sheet»: Event(s) header block with «events» event(s) not copied into the table (no Event column for several events, or the position is a track).

### IN-PANGAEA-EVENT-UNMATCHED

Severity: warning · Export policy: show

**What the user sees.** N rows have no event in the Event(s) block of the file header: the Event cell is empty, names an event that is not listed there, or the event has no position or date. Nothing was taken from the block for these rows. Fill them in the table.

**What triggers it.** «file» sheet «sheet»:«lines» N row(s) whose Event cell matches no event of the Event(s) header block that has a position or date; nothing was borrowed for them.

## Licence and metadata

### LIC-MISSING

Severity: error · Export policy: show

**What the user sees.** No licence was found in the metadata. State the licence name with its version and a link, e.g. CC BY 4.0.

**Wording when the DataCite comparison could not be made.** No licence was found in the metadata. State the licence name with its version and a link, e.g. CC BY 4.0. Note: the DOI record at DataCite could not be compared, so this finding rests on the catalogue record alone.

**What triggers it.** «file»: no licence statement (useLimitation, otherConstraints, rightsList, license) in any record.

**Citations.**

- [INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)](https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html), section 2.3.7 (quoting Regulation 1205/2008 Part B 8.1): "The element must have values."
- [INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)](https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html), section 2.3.7 (quoting Regulation 1205/2008 Part B 8.1): "If no conditions apply to the access and use of the resource, ‘no conditions apply’ shall be used."
- [GO FAIR, FAIR Principle R1.1](https://www.go-fair.org/fair-principles/r1-1-metadata-released-clear-accessible-data-usage-license/), heading "Interpretation of R1.1": "Digital resources and their metadata must always, without exception, include a license that describes under which conditions the resource can be used, even if that is “unconditional”."
- [OpenAIRE Guidelines for Data Archives, 16. Rights (MA)](https://guidelines.openaire.eu/en/latest/data/field_rights.html), 16. Rights (MA), note: "In particular OpenAIRE also recommends including license information if available."

### LIC-FREE-TEXT

Severity: warning · Export policy: show

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

Severity: warning · Export policy: show

**What the user sees.** The licence text ("«text»") and its link point to different licences, the link is not recognised, or the text does not name this licence and says something else. From the text: «textLicence»; from the link: «uriLicence» ("—" = not recognised). Check by hand and state one licence with its own link.

**What triggers it.** «file» field «field»: text '«text»' reads as «textLicence», link '«uri»' as «uriLicence»; the statement is not classified (text and link differ, the link is not recognised, or the text names no licence and says something else). Check manually.

**Citations.**

- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16. Rights, allowed values, examples, other constraints: "Use the complete title of a license and include version information if applicable."
- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16.a rightsURI: "The URI of the license."
- [Creative Commons wiki, Best practices for attribution](https://wiki.creativecommons.org/wiki/Best_practices_for_attribution), section on licence attribution: "We recommend that you name and provide a link to the license, e.g., CC BY 4.0 ( http://creativecommons.org/licenses/by/4.0 ) for a work licensed under CC BY 4.0."

### LIC-ADDED-CONDITIONS

Severity: warning · Export policy: show

**What the user sees.** The text ("«text»") names the licence «textLicence» but adds conditions to it ("«rest»"), so as written it is no longer that standard licence. Check it by hand and state the licence and any extra conditions clearly.

**Sentence added when another source of the statement also leaves something out.** Another string of the same statement (the identifier or the title) also leaves: "«otherRest»".

**What triggers it.** «file» field «field»: text '«text»' names «textLicence» but the rest '«rest»' adds or negates conditions; the statement is not classified as that licence. Check manually.

**Citations.**

- [Creative Commons FAQ](https://creativecommons.org/faq/), Alterations and additions to the license, "Can I change the license terms or conditions?": "if you change the terms and conditions of any Creative Commons license, you must no longer call, label, or describe the license as a “Creative Commons” or “CC” license"

### LIC-EXTRA-TEXT

Severity: warning · Export policy: show

**What the user sees.** The text ("«text»") contains something besides the licence name ("«rest»"). Check by hand whether it changes the licence; until that is clear, do not treat this as the standard licence.

**Sentence added when another source of the statement also leaves something out.** Another string of the same statement (the identifier or the title) also leaves: "«otherRest»".

**What triggers it.** «file» field «field»: text '«text»' contains '«rest»' besides the licence name; the statement is not classified. Check manually whether it changes the licence.

**Citations.**

- [Creative Commons FAQ](https://creativecommons.org/faq/), Alterations and additions to the license, "Can I change the license terms or conditions?": "if you change the terms and conditions of any Creative Commons license, you must no longer call, label, or describe the license as a “Creative Commons” or “CC” license"

### LIC-OTHER-RIGHTS-ENTRY

Severity: warning · Export policy: show

**What the user sees.** Next to the licence «licence», another rights entry says: "«text»". Check whether it restricts or changes the licence.

**What triggers it.** «file» field «field»: a rights entry '«text»' is no recognised licence and no plain access value, next to the recognised licence «licence». Check manually whether it restricts or changes the licence.

**Citations.**

- [Creative Commons FAQ](https://creativecommons.org/faq/), Alterations and additions to the license, "Can I change the license terms or conditions?": "if you change the terms and conditions of any Creative Commons license, you must no longer call, label, or describe the license as a “Creative Commons” or “CC” license"

### LIC-AMBIGUOUS

Severity: warning · Export policy: show

**What the user sees.** The licence statement ("«text»") can be read as more than one licence («readings»; "—" = a name no identifier exists for), so it cannot be assigned to one licence. Check it by hand and state one licence.

**What triggers it.** «file» field «field»: statement '«text»' reads as «readings»; it is not classified as one licence. Check manually.

**Citations.**

- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16. Rights, allowed values, examples, other constraints: "Use the complete title of a license and include version information if applicable."
- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16.b rightsIdentifier: "A short, standardized version of the license name."

### LIC-RESTRICTION-CONFLICT

Severity: warning · Export policy: show

**What the user sees.** The metadata names an open licence («licence») together with the restriction code «codes». INSPIRE expects the code "otherRestrictions" with a description of the conditions; check whether «codes» is meant as a real restriction and, if not, replace it.

**What triggers it.** «file»: restriction code(s) «codes» (MD_RestrictionCode) together with the open licence statement '«licence»'; INSPIRE TG Req. C.18 expects otherRestrictions plus otherConstraints describing the conditions. Check whether the code is a real restriction.

**Citations.**

- [INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)](https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html), TG Requirement C.18, section 2.3.7: "In both cases this element shall contain a gmd:MD_RestrictionCode element with code list value "otherRestrictions"."
- [INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)](https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html), TG Requirement C.18, section 2.3.7: "Additionally at least one instance of gmd:otherConstraints shall be given describing the actual conditions."
- [ISO/TS 19139 code lists (gmxCodelists.xml), MD_RestrictionCode](https://standards.iso.org/iso/19139/resources/gmxCodelists.xml), MD_RestrictionCode "restricted": "withheld from general circulation or disclosure"
- [Creative Commons FAQ](https://creativecommons.org/faq/), How do CC licenses operate?: "CC licenses are operative only when applied to material in which a copyright exists, and even then only when a particular use would otherwise not be permitted by copyright."

### LIC-FILES-HELD-BACK

Severity: warning · Export policy: show

**What the user sees.** Some files of this dataset are restricted or under embargo: «files». Access to them is decided by the repository, not by the licence in the metadata, so the licence verdict covers only the open files. If these are the data, state in the description how they can be obtained.

**What triggers it.** «file»: restricted or embargoed files («files»); the stated licence does not open them, so the licence result covers the open files only.

### LIC-DATACITE-EMPTY

Severity: warning · Export policy: show

**What the user sees.** The DOI registration record (DataCite) states no licence. Other records: «licence» ("—" = none states one, or the record could not be read). Add the licence to the DOI record.

**What triggers it.** «file»: DataCite rightsList is empty; other records state '«licence»' ('—' = none states one, or the main record could not be read).

**Citations.**

- [OpenAIRE Guidelines for Data Archives, 16. Rights (MA)](https://guidelines.openaire.eu/en/latest/data/field_rights.html), 16. Rights (MA), note: "In particular OpenAIRE also recommends including license information if available."
- [OpenAIRE Guidelines for Data Archives, 16. Rights (MA)](https://guidelines.openaire.eu/en/latest/data/field_rights.html), 16. Rights (MA), note: "Mandatory when applicable property in OpenAIRE instead of optional in DataCite."

### LIC-MISMATCH

Severity: warning · Export policy: show

**What the user sees.** Two records state different licences («licenceA» and «licenceB»). Make them the same.

**What triggers it.** «file»: licence mismatch between records: «licenceA» vs «licenceB».

**Citations.**

- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16. Rights, definition: "The property may be repeated to record complex rights characteristics."
- [Creative Commons FAQ](https://creativecommons.org/faq/), separate agreements: "You may offer the licensed material under other licenses in addition to the CC license (a practice commonly referred to as “dual licensing”)."
- [Creative Commons FAQ](https://creativecommons.org/faq/), separate agreements: "A reuser may then choose which set of terms to comply with."
- [GO FAIR, FAIR Principle R1.1](https://www.go-fair.org/fair-principles/r1-1-metadata-released-clear-accessible-data-usage-license/), heading "Interpretation of R1.1": "Furthermore, the license may be different for a data resource and the metadata that describes it"

### META-EMPTY-LINK

Severity: warning · Export policy: show

**What the user sees.** The metadata contains N download link(s) with an empty address. Fill in the address or remove the link.

**What triggers it.** «file»: N online resource link(s) with an empty or missing URL (CI_OnlineResource linkage).

### META-NO-VERSION

Severity: info · Export policy: show

**What the user sees.** No version is stated. Add a version number so people can tell which release of the data they have.

**What triggers it.** «file»: no version or edition in any record.

### META-NO-EXTENT

Severity: info · Export policy: show

**What the user sees.** The metadata gives neither a time span nor an area for the data, so they could not be compared with the table. Add both.

**What triggers it.** «file»: no temporal extent and no geographic bounding box in any record.

### META-DATE-OUTSIDE-EXTENT

Severity: warning · Export policy: show

**What the user sees.** N rows have a date outside the time span in the metadata («start» to «end»), e.g. «value». Correct the dates or the time span.

**What triggers it.** «file»:«lines» N row(s) dated outside the temporal extent «start»..«end» (e.g. «value»).

### META-POINT-OUTSIDE-BBOX

Severity: warning · Export policy: show

**What the user sees.** N rows lie outside the area given in the metadata. Correct the coordinates or enlarge the area in the metadata.

**What triggers it.** «file»:«lines» N row(s) outside the bounding box W «west», E «east», S «south», N «north» (e.g. «value»).

### META-VARIABLE-MISSING

Severity: warning · Export policy: show

**What the user sees.** The description mentions "«term»", but no matching column was found in the data. Add the column or correct the description.

**What triggers it.** «file»: abstract mentions '«term»' but no dataset variable maps to the corresponding canonical variable.

### META-NO-DATES

Severity: error · Export policy: show

**What the user sees.** Neither the data nor the metadata contain any date. Add the sampling date to the table or a time span to the metadata.

**Sentence added when the finding has the parameter sheets.** This is about the sheets: «sheets».

**Sentence added when the finding has the parameter sheetOne.** This is about the sheet: «sheetOne».

**Sentence added when the finding has the parameter joinSheet.** Likely cause: the join with sheet "«joinSheet»" gave no dates (its key matches rows that differ; see the warning about the key).

**What triggers it.** «file»: no row has a date and no record has a temporal extent or collection date.

### META-NO-POSITIONS

Severity: error · Export policy: show

**What the user sees.** Neither the data nor the metadata contain any position. Add latitude and longitude columns in decimal degrees to the table: OBIS needs decimalLatitude and decimalLongitude for every record, and a geographic bounding box in the metadata alone does not replace them.

**Sentence added when the finding has the parameter sheets.** This is about the sheets: «sheets».

**Sentence added when the finding has the parameter sheetOne.** This is about the sheet: «sheetOne».

**What triggers it.** «file»: no latitude or longitude column is mapped, no row has a position and no record has a bounding box. OBIS requires decimalLatitude and decimalLongitude as the minimum location terms of every record; a bounding box in the metadata is not a substitute for them.

**Citations.**

- [OBIS Manual, "Darwin Core" (iobis/manual darwin_core.md; manual.obis.org; read 2026-10-30)](https://manual.obis.org/darwin_core.html), "Location information can be documented in many DwC terms, but decimalLatitude and decimalLongitude are the minimally required terms"; "OBIS currently has seven required and one strongly recommended DwC term: occurrenceID, eventDate, decimalLongitude, decimalLatitude, scientificName, occurrenceStatus, basisOfRecord, scientificNameID"

## Rows, Darwin Core and conversion

### ROW-LAT-RANGE

Severity: error · Export policy: block

**What the user sees.** Latitude must be between -90 and 90 degrees, but lines «lines» are outside this range. Check whether latitude and longitude were swapped or mistyped.

**What triggers it.** «file»:«lines» field «field» value '«value»': latitude outside -90..90 degrees.

**Thresholds.**

- latitude.min = -90 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11
- latitude.max = 90 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11

**Citations.**

- [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.3 "Impossible Location", PDF p.44

### ROW-LON-RANGE

Severity: error · Export policy: block

**What the user sees.** Longitude must be between -180 and 180 degrees, but lines «lines» are outside this range. Check whether latitude and longitude were swapped or mistyped.

**What triggers it.** «file»:«lines» field «field» value '«value»': longitude outside -180..180 degrees.

**Thresholds.**

- longitude.min = -180 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11
- longitude.max = 180 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11

**Citations.**

- [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.3 "Impossible Location", PDF p.44

### ROW-LON-360

Severity: info · Export policy: show

**What the user sees.** Longitudes in lines «lines» are given on a 0–360 scale. They were converted to the -180 to 180 scale; use that scale in the published file.

**What triggers it.** «file»:«lines» field «field» value '«value»': longitude in (180, 360\] converted by subtracting 360.

**Citations.**

- [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.3 "Impossible Location", PDF p.44

### ROW-LAT-EQ-LON

Severity: error · Export policy: block

**What the user sees.** In lines «lines» latitude and longitude are identical («value»). One column was probably copied into the other; enter the correct values.

**Sentence added when the finding has the parameter share.** That is at least 5 rows and a fifth of the rows with a position.

**Sentence added when the finding has the parameter repeated.** The same value repeats in «repeated» rows and has two or more decimals, as when the position of one station was copied into both columns.

**What triggers it.** «file»:«lines» latitude equals longitude exactly (value '«value»') in at least 5 rows and either at least 20 % of the rows with a position or at least 5 rows sharing one value with two or more written decimals that is not a multiple of 0.25 (the tool's own choice; otherwise ROW-LAT-EQ-LON-ISOLATED or ROW-LAT-EQ-LON-COARSE).

### ROW-LAT-EQ-LON-ISOLATED

Severity: warning · Export policy: accept

**What the user sees.** In lines «lines» latitude and longitude are identical («value»). This is a small share of the rows with a position, so it may be a coincidence, but typing the same number into both columns is also a common slip. Check this position.

**What triggers it.** «file»:«lines» latitude equals longitude exactly (value '«value»', finer than a half degree) in a small share of the rows with a position (fewer than 5 rows, or under 20 % and without 5 rows of one repeated value); a duplicated column would be ROW-LAT-EQ-LON.

### ROW-LAT-EQ-LON-COARSE

Severity: info · Export policy: show

**What the user sees.** In lines «lines» latitude and longitude are identical («value»). This position is rounded to a whole or half degree, as is common in historical data, so it may be right (for example -65 and -65 is the Antarctic Peninsula). Just check that the number was not typed twice.

**What triggers it.** «file»:«lines» latitude equals longitude exactly (value '«value»', a whole or half degree) in fewer than 5 rows or fewer than 20 % of the rows with a position; a duplicated column would be ROW-LAT-EQ-LON.

### ROW-RAGGED

Severity: error · Export policy: block

**What the user sees.** Lines «lines» have a different number of values than the header (expected «expected», e.g. «found»). The columns may be shifted; fix these lines in the original file — the tool did not change them.

**What triggers it.** «file»:«lines» expected «expected» fields, found «found» (first listed line); rows kept as found, not realigned.

### ROW-NON-NUMERIC

Severity: warning · Export policy: accept

**What the user sees.** Column "«field»" should contain numbers, but lines «lines» contain text such as "«value»". Replace it with a number or leave the cell empty.

**What triggers it.** «file»:«lines» field «field» value '«value»': non-numeric token in a numeric column.

### ROW-NA-VARIANT

Severity: warning · Export policy: show

**What the user sees.** Column "«field»" marks missing values in an unusual way (e.g. "«value»") in lines «lines». Use one consistent marker, or an empty cell.

**What triggers it.** «file»:«lines» field «field» value '«value»': variant of a missing-value token (not in the standard NA list).

### ROW-STATION-MOVED

Severity: warning · Export policy: accept

**What the user sees.** Station «station» appears at different positions («positions»). Check which one is right — a digit may have been mistyped or the coordinates swapped.

**Sentence added when the finding has the parameter signLon.** Two of these positions differ (almost) only in the sign of the longitude: possibly a missing or extra minus (W/E). Check the other columns too — the sign need not be the whole cause.

**Sentence added when the finding has the parameter signLat.** Two of these positions differ (almost) only in the sign of the latitude: possibly a missing or extra minus (S/N). Check the other columns too — the sign need not be the whole cause.

**What triggers it.** «file»:«lines» station «station» at «positions»: positions differ by a typed digit, by exchanged axes, or by a sign (as written at least 100 km apart, within 50 km and at least 10 times closer once flipped).

### ROW-STATION-SPREAD

Severity: info · Export policy: show

**What the user sees.** Station «station» has positions up to «km» km apart («positions»). A station is usually one place, and 10 km is far more than a ship's position error on station. If this name stands for an area, a transect or a cruise, ignore this note.

**What triggers it.** «file» station «station»: positions up to «km» km apart (more than 10 km; great-circle distance) at «positions». Rows of one name are compared only within one cruise (a cruise value) or, without one, within one calendar year (UTC); rows with neither get the note ROW-STATION-SPREAD and, for exchanged axes or a sign, ROW-STATION-MOVED, but not the typed-digit pattern. Placeholder names (unknown, not specified, n/a ...) are skipped.

### ROW-STATION-SPREAD-FAR

Severity: warning · Export policy: accept

**What the user sees.** Station «station» has positions up to «km» km apart, more than 1000 km («positions»). A station is usually one place, so this is almost certainly a wrong position (a sign, a digit, swapped axes), not an area. Check which position is right.

**What triggers it.** «file» station «station»: positions up to «km» km apart (more than 1000 km; great-circle distance) at «positions». The 10 to 1000 km case is the note ROW-STATION-SPREAD; 1000 km is a stated choice, not a published threshold. Rows of one name are compared only within one cruise (a cruise value) or, without one, within one calendar year (UTC); rows with neither get the note ROW-STATION-SPREAD and, for exchanged axes or a sign, ROW-STATION-MOVED, but not the typed-digit pattern. Placeholder names (unknown, not specified, n/a ...) are skipped.

### ROW-ON-LAND-NEAR

Severity: info · Export policy: show

**What the user sees.** In lines «lines» (N in all) the position falls on land or in a lake on the Natural Earth (1:10m) land map, 10–50 km from the sea: «places» (number of rows; least distance from the sea). If this is a sample from a river, estuary, tidal inlet, lake or coastal lagoon, ignore this note: the map can be inaccurate in such places. If not, check the digits and the order of the coordinates.

**What triggers it.** «file»:«lines» N rows on land or in an inland lake 10 to 50 km from the sea (Natural Earth 1:10m, 0.05 degree cells; no sign hint at this level): «places».

**Citations.**

- [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 4 "Position on land test", p.11
- [Natural Earth 1:10m physical vectors: land, minor islands, lakes, v5.1.2 (public domain)](https://www.naturalearthdata.com/downloads/10m-physical-vectors/), layers ne_10m_land, ne_10m_minor_islands, ne_10m_lakes; rasterised by scripts/land-mask.py

### ROW-ON-LAND

Severity: warning · Export policy: show

**What the user sees.** In lines «lines» (N in all) the position lies on land or in a lake, away from the sea: «places» (number of rows; least distance from the sea). In marine data this is usually an error: a wrong sign, swapped axes or a typo. 10–50 km from the sea: a separate note; the 10 km band and river banks near the sea are not judged.

**Sentence added when the finding has the parameter flips.** With a sign flipped or the coordinates swapped, these positions lie at sea: «flips». This is only a hint, not a correction.

**What triggers it.** «file»:«lines» N rows on land or in an inland lake at least 50 km from the sea (Natural Earth 1:10m, 0.05 degree cells; 10-50 km is ROW-ON-LAND-NEAR; nearer the coast, near rivers and canals nothing is judged): «places».

**Citations.**

- [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 4 "Position on land test", p.11
- [Natural Earth 1:10m physical vectors: land, minor islands, lakes, v5.1.2 (public domain)](https://www.naturalearthdata.com/downloads/10m-physical-vectors/), layers ne_10m_land, ne_10m_minor_islands, ne_10m_lakes; rasterised by scripts/land-mask.py

### ROW-SHIP-SPEED

Severity: warning · Export policy: show

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

Severity: info · Export policy: show

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

Severity: info · Export policy: show

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

Severity: warning · Export policy: block

**What the user sees.** The dates in lines «lines» (e.g. "«value»") could not be read. Write dates as YYYY-MM-DD.

**Wording when the column holds times of day.** The times in lines «lines» (e.g. "«value»") could not be read. Write the time as HH:MM (24 hours), for example 16:30 (1630 and 16:30. are read too), in UTC or with the time zone stated; a range such as 16:00-17:30 or 1600-1730 is read as its start.

**What triggers it.** «file»:«lines» field «field» value '«value»': date not parseable (ISO 8601, YYYY/MM/DD, DD.MM.YYYY, unambiguous DD/MM/YYYY, YY-MM-DD, a four-digit year, YYYYMMDD in a column that is the date, or an Excel serial).

**What triggers it, for times of day.** «file»:«lines» field «field» value '«value»': time of day not parseable (HH:MM or HH:MM:SS, 24 hours; a range HHMM-HHMM or HH:MM-HH:MM, also several separated by commas, is read as the start of its first range and the end is ignored; state UTC or the time zone).

**Citations.**

- [W3C Note, Date and Time Formats (profile of ISO 8601)](https://www.w3.org/TR/NOTE-datetime), Formats: complete date YYYY-MM-DD
- [DataCite Metadata Schema 4.6, property Date](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/date/), section 8 Date, allowed formats

### ROW-TIME-OTHER-DAY

Severity: warning · Export policy: block

**What the user sees.** In lines «lines» the time column (e.g. "«value»") holds a full date and time of another day than the date column (any other day without a time zone, more than a day apart with one). The time cannot be taken from it: check which date is right, or write the time of day alone.

**What triggers it.** «file»:«lines» field «field» value '«value»': the time column holds a full datetime of another day than the date column of the row (any other day without a zone, more than one day apart with one); the time of day is not taken from it (a datetime with a zone within a day of the date is read as the event's instant instead).

### ROW-DATE-MISSING

Severity: info · Export policy: show

**What the user sees.** N rows («percent» %) have no date although the other rows do. Fill in the missing dates.

**What triggers it.** «file»:«lines» N row(s) («percent»%) without a date while other rows have one.

### ROW-YEAR-OUTLIER

Severity: warning · Export policy: show

**What the user sees.** Lines «lines» are dated «years», while the title, file name or time span says «declared». One of them is probably a typo in the year.

**What triggers it.** «file»:«lines» year(s) «years» not among the declared year(s) «declared» (dataset label, file name, record title or temporal extent).

### ROW-JOIN-AMBIGUOUS

Severity: warning · Export policy: show

**What the user sees.** Rows of sheet "«sheet»" (lines: «lines») got no position or date from sheet "«right»": the key "«field»" (e.g. «value») matches several rows there that differ in position or date, so none was taken (the first is not guessed).

**What triggers it.** «file», «sheet»:«lines» key «field» (example value «value»): the key matches several rows of sheet «right» that differ in position or date, so the rows get no position and no date from it; the first matching row is never taken. Join on a key that identifies one row (a composite key such as Cruise + Station is tried by the layout).

### ROW-LONG-VALUE-SKIPPED

Severity: warning · Export policy: accept

**What the user sees.** N values were not read in "«sheet»" (lines «lines»): another row has the same key and parameter (e.g. "«field»") with a different value, and no column of the sheet could safely be used to tell these rows apart; one value is kept and checked.

**What triggers it.** «file», «sheet»:«lines» field «field»: in a long sheet (parameter and value columns) N value(s) differ from the value already kept for the same key (sample, position, date, depth) and parameter, and no column could safely be used to tell those rows apart (a column is refused when it is unique on every row, when it cuts the measurements of one key into rows with no parameter in common, when two columns are equally good, or when it leaves a collision in a key it varies in); one value of a pair is read (the first, or the first after a blank or missing one) and nothing is averaged. Values equal to the kept one are not counted.

### ROW-LONG-NO-PARAMETER

Severity: warning · Export policy: block

**What the user sees.** In "«sheet»" N rows have a value but nothing in the column "«column»" (lines «lines»). They cannot be read, because nothing says what they measure. Write the parameter name (if the cell was merged, the merge has to cover these rows).

**What triggers it.** «file», «sheet»:«lines» N row(s) of a long sheet (parameter and value columns) have a value and a blank parameter cell ("«column»"), and no merged cell above them gives one. The row is not read; nothing is guessed from the unit or the value. A row whose value is blank too is not counted. /check only: the converter blocks such rows with CONV-LONG-NO-PARAMETER.

### ROW-LONG-PARAMETER-MERGED

Severity: info · Export policy: accept

**What the user sees.** In "«sheet»" a cell of the column "«column»" is merged over several rows in the workbook; its name applies to every row of the merge: N rows below the first cell (lines «lines») were read with it. Check that this is the parameter you meant.

**What triggers it.** «file», «sheet»:«lines» the parameter cell ("«column»") of a long workbook sheet is merged down several rows (SheetJS !merges); only its top cell holds the name, so the cells below read as blank. The name of the top cell is read for every row of the merge that has a value; N row(s) below the top cell were filled that way (the lines). Only the parameter column is filled, only from a merge the workbook declares, only on rows with a value. The same note is shown on /convert.

### ROW-LONG-KEY-EXTENDED

Severity: info · Export policy: accept

**What the user sees.** In "«sheet»" rows with the same key and parameter held different values. The columns that tell them apart («columns») now join the key, so the values of the separated rows (e.g. lines «lines») are read and checked. The clean CSV writes them too, unless you set a column to ignore yourself.

**What triggers it.** «file», «sheet»:«lines» N column(s) («columns») were added to the row key because rows with the same key and parameter held different values there; the lines are some of the rows they separate. A column is taken only when it is not unique on every row, when in every key where it varies no two resulting rows have disjoint parameter sets, when it is the best of the acceptable ones (or splits the rows exactly like the others of equal count), and when it leaves no collision unresolved in a key it varies in. It is a column that separates the rows, not proof that it is a replicate: the choice is not confirmed by the header. Rows of other keys are unchanged and nothing is averaged; ROW-LONG-VALUE-SKIPPED still says what could not be read.

### ROW-KEY-IGNORED

Severity: info · Export policy: show

**What the user sees.** In "«sheet»" these rows (e.g. lines «lines») look alike in the identifying columns of the clean CSV. The columns you set to ignore («columns») differ between them and are not written. Their other measured values are still in the file and in the clean CSV.

**What triggers it.** «file», «sheet»:«lines» N column(s) («columns») set to ignore by the person differ between rows that are equal in every identifying column the clean CSV writes (station, cruise, sample, date, position, depth and the other written key columns); the column is not written, so the rows look alike there. Long or wide sheet; on a long sheet only a column that entered the row key. The column may be a measurement. Their other measured values may differ and are all written. Nothing is removed from the file. Said only when two rows are equal in those columns and differ in a column set to ignore; a column that is ignore by default (a replicate, a cast, a comment) is written, as a key column or as a descriptive column after the variables, and is not this.

### ROW-JOIN-KEY-BLANK

Severity: warning · Export policy: show

**What the user sees.** In sheet "«sheet»" (lines: «lines») the key "«field»" is blank, so no position or date could be taken from sheet "«right»". Fill in the key on those rows.

**What triggers it.** «file», «sheet»:«lines» key «field»: a part of the join key is blank on rows that have no position of their own, so the row of sheet «right» cannot be found and the rows keep no position and no date from it.

### ROW-DATE-YYMMDD

Severity: info · Export policy: accept

**What the user sees.** Dates in column "«field»" have a two-digit year and a century was added; e.g. "«value»" was read as «interpreted» (order «order»: ymd year first, dmy day first, mdy month first). One acceptance covers the century in every column this note names, each by name. Use a four-digit year.

**What triggers it.** «file» field «field» value '«value»': NN-NN-NN read as «interpreted» in the order «order» (century inferred; ambiguous). The century of a two-digit year is the reader's decision. The export gate accepts per rule, not per column: one acceptance of ROW-DATE-YYMMDD covers the century in every column it names, each named in its own finding.

### ROW-DATE-YY-AMBIGUOUS

Severity: warning · Export policy: block

**What the user sees.** Dates such as "«value»" can be read in more than one order (ymd: year first, dmy: day first, mdy: month first), and no date in column "«field»" decides it. Read as «interpreted»; it could also be «readings».

**What triggers it.** «file» field «field» value '«value»': NN-NN-NN with two or more readings that fit every NN-NN-NN cell of the column (no part above 31, none above 12 in a month place rules them out) and a date that differs between them. Read as «interpreted» (the first reading that fits every cell: year-month-day when it does; century inferred); it could also be «readings» (date and order code, joined with "; "). Reported once per column. In /convert the export is blocked until the person declares the order of the column.

### ROW-TZ-UNKNOWN

Severity: info · Export policy: show

**What the user sees.** The time zone of the times in column "«field»" is not stated. Say whether they are UTC or local time.

**What triggers it.** «file» field «field»: date-time values carry neither a UTC marker nor an offset; time zone unknown.

### ROW-UNIT-MISSING

Severity: warning · Export policy: show

**What the user sees.** No unit is given for: «headers». Add the unit to each column header, e.g. "DIC \[µmol/kg\]".

**What triggers it.** «file»: no unit in the header or in the metadata for column(s) «headers».

### ROW-HEADER-CODE-SHAPE

Severity: warning · Export policy: show

**What the user sees.** Header "«column»": the code «code» after "SDN:«collection»::" is not a «collection» code, which has exactly «length» capital letters and digits. NVS has no such concept (it answers 404). Check the code for a typo or an extra character.

**What triggers it.** «file», column «column»: the code "«code»" after the explicit prefix SDN:«collection»:: is not of the shape of a «collection» code («length» upper-case letters and digits); the concept page does not exist (NVS: 404). Only the prefixed form is checked; a bare word is never read as a code.

**Citations.**

- [NERC Vocabulary Server (NVS), collections P01 (BODC Parameter Usage Vocabulary) and P06 (BODC data storage units); read 2026-10-29](https://vocab.nerc.ac.uk/collection/P06/current/), Every concept of P06 has a four-character code (411 of 411 codes read, e.g. UPAA) and every concept of P01 an eight-character one (50 613 of 50 613 codes read, e.g. TEMPPR01; 66 begin with a digit); a code of another length has no concept page: https://vocab.nerc.ac.uk/collection/P01/current/D13CMOP11/ answers 404, https://vocab.nerc.ac.uk/collection/P01/current/D13CMOP1/ is a concept.

### ROW-DEPTH-SIGN

Severity: info · Export policy: accept

**What the user sees.** It is not stated whether depth in column "«header»" is counted downwards (positive) or upwards. Describe the convention in the header or in the description.

**What triggers it.** «file»: depth column '«header»' has no stated sign convention.

### ROW-DEPTH-MIXED-SIGN

Severity: warning · Export policy: accept

**What the user sees.** The depth column "«header»" (sheet "«sheet»") has values of both signs: «negative» negative, «positive» positive. The direction (down or up) is not decided, and the range is checked on the values without their sign. State in the description which way depth is counted.

**What triggers it.** «file», «sheet»: depth column '«header»' has «negative» negative and «positive» positive non-zero values (0, -99, -999 and -9999 not counted; every row read). No direction is chosen (not the majority); ROW-DEPTH-RANGE judges |depth|. No value is changed.

### ROW-MISSING-CODE

Severity: warning · Export policy: block

**What the user sees.** The column "«column»" has a possible missing-value code in N cells, e.g. «value» (lines «lines»). Values such as -99, -999 and -9999 often stand for "not measured". They are kept as written and left out of the depth direction and the range checks.

**Wording when the converter waits for the answer of the person.** The column "«column»" has a possible missing-value code in N cells, e.g. «value» (lines «lines»). The export waits for your answer: treat them as missing (they are left out and listed) or as real values (they are written as they are).

**What triggers it.** «file», «sheet»:«lines» N cell(s) of column '«column»' (column «index» of the sheet in /convert) hold exactly -99, -999 or -9999 (numeric equality, first: «value»), a code often written for "no measurement". /check keeps the cell as written and leaves it out of the depth direction, ROW-DEPTH-RANGE and CHEM-RANGE; /convert blocks the export until the column is answered (missing: the cells are left out and listed; real: they are written and judged like any value). Checked: the depth column (the two bounds of a Darwin Core range) and every variable of the sheet. The cell is never replaced.

### ROW-DM-COORDS

Severity: info · Export policy: show

**What the user sees.** Coordinates in column "«field»" are written as degrees and minutes (e.g. "«value»"). They were converted to decimal degrees; check a few of them.

**What triggers it.** «file» field «field» value '«value»': degree-minute(-second) text converted to decimal degrees.

### ROW-HEMISPHERE-CONFLICT

Severity: warning · Export policy: accept

**What the user sees.** In lines «lines» the value in column "«field»" (e.g. "«value»") disagrees with the hemisphere letter in column "«hemisphere»": it has a minus sign or a letter of its own, or the letter belongs to the other axis. It was kept as written and its sign was not changed again; correct these rows.

**What triggers it.** «file»:«lines» field «field» value '«value»': disagrees with the hemisphere letter in «hemisphere»; kept as written, not negated again.

### ROW-HEMISPHERE-UNPAIRED

Severity: warning · Export policy: accept

**What the user sees.** Column "«hemisphere»" is set as a hemisphere letter, but it belongs to a different position than "«field»" (their start and end words disagree), so it was not applied. Check which column is mapped as the coordinate.

**What triggers it.** «file» field «field»: hemisphere column «hemisphere» belongs to another start/end position; not applied.

### ROW-HEMISPHERE-MISSING

Severity: warning · Export policy: accept

**What the user sees.** In lines «lines» column "«field»" has a value (e.g. "«value»") but the hemisphere column "«hemisphere»" is empty or holds something other than N, S, E, W. The value was kept as written, so it may have the wrong sign for the southern or western hemisphere; fill in the letter.

**What triggers it.** «file»:«lines» field «field» value '«value»': the hemisphere column «hemisphere» is empty or not N/S/E/W; kept as written.

### ROW-ZERO-COORD

Severity: error · Export policy: block

**What the user sees.** In lines «lines» latitude and longitude are both 0. That point lies in the Gulf of Guinea and usually stands for coordinates that are missing and were typed as zero. Enter the real position or leave the cells empty.

**What triggers it.** «file»:«lines» latitude and longitude are both 0 (obis-qc ZERO_COORD, which drops the record; Biocheck "0-0 coordinates"). Reported instead of ROW-LAT-EQ-LON, which it would also match.

**Citations.**

- [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: "if record.get_interpreted("decimalLongitude") == 0 and record.get_interpreted("decimalLatitude") == 0: record.set_flag(Flag.ZERO_COORD); record.dropped = True"
- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Integrity checks: "decimalLatitude and decimalLongitude are both 0" ... "It is theoretically possible that a sampling event happens at 0-0 coordinates, however it is very common to inadvertedly add 0-0 when the actual coordinates are missing. Therefore, 0-0 coordinates should always be double checked."

### ROW-NO-COORD

Severity: warning · Export policy: block

**What the user sees.** In lines «lines» (N in all) the latitude or the longitude is missing although the other rows have a position. Such a record cannot be placed on a map. Fill in the coordinates; if it is a summary or helper row, ignore this note.

**What triggers it.** «file»:«lines» N row(s) with a blank latitude or longitude cell while other rows of the sheet have a position (obis-qc NO_COORD, which drops the record). Blank trailing rows, summary rows and rows that inherit a position from a parent event are not counted.

**Citations.**

- [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: "if record.get_interpreted("decimalLongitude") is None or record.get_interpreted("decimalLatitude") is None: record.set_flag(Flag.NO_COORD); record.dropped = True"

### ROW-DEPTH-MIN-MAX

Severity: error · Export policy: block

**What the user sees.** In lines «lines» the minimum depth is greater than the maximum depth (e.g. «value»). The two columns may be swapped or mistyped; correct the values.

**What triggers it.** «file»:«lines» minimumDepthInMeters greater than maximumDepthInMeters (first: «value»); obis-qc MIN_DEPTH_EXCEEDS_MAX, obistools check_depth.

**Citations.**

- [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: "if record.get_interpreted("minimumDepthInMeters") \> record.get_interpreted("maximumDepthInMeters"): record.set_flag(Flag.MIN_DEPTH_EXCEEDS_MAX)"
- [OBIS obistools (R), R/check_depth.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_depth.R), check_depth, details: "minimum depth greater than maximum depth" (error); code: minGTmax \<- !is.na(maxd) & !is.na(mind) & mind \> maxd

### ROW-DEPTH-RANGE

Severity: warning · Export policy: accept

**What the user sees.** Depth in column "«field»" (lines «lines», e.g. «value» m) is outside the range -100000 to 11000 m that OBIS accepts. The deepest point of the ocean is about 10,935 m. Check the unit (metres) and the sign.

**What triggers it.** «file»:«lines» field «field» value '«value»': depth outside -100000..11000 m (obis-qc DEPTH_OUT_OF_RANGE bounds, inclusive; positive down; a column with an upward convention is judged after the sign is turned). The deepest point of the ocean, Challenger Deep, is about 10,935 m (NOAA).

**Thresholds.**

- depth.min = -100000 m. Source: [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: misc.check_float(record.get("minimumDepthInMeters"), \[-100000, 11000\]) (the same call for maximumDepthInMeters; in_range = valid_range\[0\] \<= value \<= valid_range\[1\], out of range sets Flag.DEPTH_OUT_OF_RANGE)
- depth.max = 11000 m. Source: [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: misc.check_float(record.get("minimumDepthInMeters"), \[-100000, 11000\]) (the same call for maximumDepthInMeters; in_range = valid_range\[0\] \<= value \<= valid_range\[1\], out of range sets Flag.DEPTH_OUT_OF_RANGE)

**Citations.**

- [NOAA National Ocean Service, "How deep is the ocean?" (last updated 2026-09-23)](https://oceanservice.noaa.gov/facts/oceandepth.html), "Challenger Deep is approximately 10,935 meters (35,876 feet) deep." (the deepest part of the ocean)

### ROW-DATE-FUTURE

Severity: warning · Export policy: accept

**What the user sees.** The date in column "«field»" (lines «lines», e.g. «value») is later than today; for an interval its end counts. An event in the future cannot have happened yet: check the year, month and day.

**What triggers it.** «file»:«lines» field «field» value '«value»': the date, or the end of the interval, is later than today (UTC; a value counts as future only when it can have begun nowhere yet, so a date within a day of today, as read in the latest time zone UTC+14, is not; a year or month counts by its first day). obis-qc DATE_IN_FUTURE.

**Citations.**

- [OBIS obis-qc (Python), obisqc/time.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/time.py), check_record: "if ms_end \> date_to_millis(datetime.date.today()): # date in the future record.set_flag(Flag.DATE_IN_FUTURE)"

### ROW-INVISIBLE-CHAR

Severity: warning · Export policy: accept

**What the user sees.** In column "«field»" the values in lines «lines» contain invisible characters («chars»), e.g. "«value»", so the name or ID will not match the same text typed normally. A space-like character: replace it with a plain space. A zero-width one (U+200B, U+FEFF ...): it should be taken out of the value.

**What triggers it.** «file»:«lines» field «field» value '«value»': invisible characters inside the value («chars»). OBIS trims only the ends of a value, so inside they break name matching, vocabulary matching and duplicate checks (OBIS Manual, "Hidden characters and non-breaking spaces"). Checked columns: station, cruise and sample identifiers, and the name, identifier and vocabulary columns of Darwin Core input.

**Citations.**

- [OBIS Manual, "Common data quality issues" (iobis/manual common_qc.md; manual.obis.org)](https://manual.obis.org/common_qc.html), "Hidden characters and non-breaking spaces": "a value like Abra alba containing a non-breaking space will not match the same name typed with a normal space"; "OBIS removes leading and trailing whitespace from values during processing, but does not change spaces inside a value"; "Other invisible characters, such as tabs, line breaks within a cell, and zero-width spaces (U+200B), can cause similar problems"

### ROW-YEAR-DATE-MISMATCH

Severity: warning · Export policy: show

**What the user sees.** In column "«field»" the year in lines «lines» (N in all) is not the year of the date in "«date»", e.g. the date "«value»" beside the year «year». One of the two is wrong, or they belong to different events, or the column means something else, such as a cruise or a season. Nothing was changed; check which one is right.

**What triggers it.** «file»:«lines» field «field»: N row(s) whose year («year» in the first) is not a year of the date in «date» (e.g. '«value»'). A date range counts every year it covers; a year-only date, a date built from the Year column itself and a blank or non-numeric year are not compared. Nothing is changed.

### ROW-TEXT-MOJIBAKE

Severity: warning · Export policy: show

**What the user sees.** Text in «columns» (lines «lines»; N cells with this pattern) looks encoded twice, e.g. "«value»": a UTF-8 file was read as Windows-1252 or Latin-1 somewhere. The text was not changed. Save the original again as UTF-8 and compare these values.

**What triggers it.** «file»:«lines» N cell(s) in «columns» hold a double-encoding pair (U+00C3 or U+00C2 followed by a character in U+0080-U+00BF; first value '«value»'), the signature of UTF-8 bytes read as a single-byte encoding and encoded again. A lone U+00C3 or U+00C2 is real text and is not matched. Only this pair is counted: other double-encoded forms (for example U+00E2 U+20AC U+2122 for an apostrophe, U+00C5 U+201A, U+00C3 U+201C, U+00C3 U+20AC, U+00D0 followed by a letter) are not matched, so the count is of the pair and not of every damaged cell. A file the parser decoded by a fallback (IN-ENCODING-FALLBACK, or IN-ENCODING-AMBIGUOUS when windows-1250, ISO-8859-2 and windows-1252 read its bytes differently) is not read; UTF-16 and valid UTF-8 are read as text; one that declares its own encoding is. Nothing is rewritten.

### DWC-TERM-MISSING

Severity: error · Export policy: block

**What the user sees.** This looks like a Darwin Core table («core»), but it has no column for terms that OBIS requires: «terms». Add them; without them the records are not fit to publish in OBIS.

**What triggers it.** «file»: Darwin Core input («core» core) without a column for the required term(s) «terms». Required: occurrenceID (Occurrence core) or eventID (Event core), eventDate, decimalLatitude, decimalLongitude, and for an Occurrence core scientificName, occurrenceStatus, basisOfRecord (obistools check_fields; OBIS Manual). scientificNameID is only recommended (DWC-RECOMMENDED).

**Citations.**

- [OBIS obistools (R), R/check_fields.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_fields.R), check_fields: required \<- c("eventDate", "decimalLongitude", "decimalLatitude", "scientificName", "scientificNameID", "occurrenceStatus", "basisOfRecord"); "Missing or empty required fields are reported as errors"
- [OBIS Manual, "Common format issues" (iobis/manual common_formatissues.md; manual.obis.org)](https://manual.obis.org/common_formatissues.html), "Missing required fields": "one (or more) of the eight required terms for OBIS"; "occurrenceID or eventID"; "scientificNameID (strongly recommended)"

### DWC-TERM-EMPTY

Severity: error · Export policy: block

**What the user sees.** Column "«field»", which OBIS requires, has no value in lines «lines» (N in all). Fill them in.

**What triggers it.** «file»:«lines» field «field»: N empty value(s) in a column OBIS requires (obistools check_fields: "Empty value for required field"). For decimalLatitude, decimalLongitude and eventDate only a column empty in every row is reported here (single missing positions are ROW-NO-COORD, single missing dates ROW-DATE-MISSING; where no date exists anywhere, data or metadata, META-NO-DATES says it instead).

**Citations.**

- [OBIS obistools (R), R/check_fields.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_fields.R), check_fields: required \<- c("eventDate", "decimalLongitude", "decimalLatitude", "scientificName", "scientificNameID", "occurrenceStatus", "basisOfRecord"); "Missing or empty required fields are reported as errors"
- [OBIS Manual, "Common format issues" (iobis/manual common_formatissues.md; manual.obis.org)](https://manual.obis.org/common_formatissues.html), "Missing required fields": "one (or more) of the eight required terms for OBIS"; "occurrenceID or eventID"; "scientificNameID (strongly recommended)"

### DWC-RECOMMENDED

Severity: warning · Export policy: accept

**What the user sees.** OBIS also recommends the following, which this Darwin Core table («core») lacks or leaves empty in every row: «terms». It is not an error, but it makes the data easier to check and the names easier to match.

**What triggers it.** «file»: Darwin Core input («core» core) without a column, or with no value in any row, for the recommended term(s) «terms». Recommended: minimumDepthInMeters and maximumDepthInMeters (obistools check_fields), scientificNameID for an Occurrence core ("strongly recommended", OBIS Manual; obistools lists it as required).

**Citations.**

- [OBIS obistools (R), R/check_fields.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_fields.R), check_fields: recommended \<- c("minimumDepthInMeters", "maximumDepthInMeters"); "missing or empty recommended fields are reported as warnings"
- [OBIS Manual, "Common format issues" (iobis/manual common_formatissues.md; manual.obis.org)](https://manual.obis.org/common_formatissues.html), "Missing required fields": "one (or more) of the eight required terms for OBIS"; "occurrenceID or eventID"; "scientificNameID (strongly recommended)"

### DWC-VOCAB-VALUE

Severity: warning · Export policy: block

**What the user sees.** In column "«field»" the value "«value»" (lines «lines») is not on the list OBIS accepts: «allowed». Capitalisation does not matter, but the spelling must be that of the list. Correct the value.

**What triggers it.** «file»:«lines» field «field» value '«value»': not in the vocabulary obis-qc compares with, in lower case, after OBIS trims the ends: «allowed». basisOfRecord: the eight identifiers of the GBIF vocabulary basis_of_record_2022-02-02 (the obis-qc README also names Event and Taxon; the code reads the vocabulary file); occurrenceStatus: absent, present, notDetected, detected. One finding per value.

**Citations.**

- [OBIS obis-qc (Python), obisqc/fields.py and obisqc/util/vocabularies.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/fields.py), fields.py check_record: "if not record.get("basisOfRecord").lower() in \[value.lower() for value in vocabs\["dwc:basisOfRecord"\]\]: record.set_invalid("basisOfRecord")"; util/vocabularies.py reads the identifiers of rs.gbif.org/vocabulary/dwc/basis_of_record_2022-02-02.xml
- [GBIF Darwin Core Basis of Record Vocabulary, issued 2022-02-02 (the list obis-qc reads at run time)](https://rs.gbif.org/vocabulary/dwc/basis_of_record_2022-02-02.xml), the eight concept identifiers: PreservedSpecimen, FossilSpecimen, LivingSpecimen, HumanObservation, MachineObservation, MaterialSample, Occurrence, MaterialCitation
- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Format checks: "basisOfRecord does not seem to contain a valid term such as: "PreservedSpecimen", "FossilSpecimen", "LivingSpecimen", "HumanObservation", "MachineObservation", "MaterialSample", "Occurrence""
- [OBIS obis-qc (Python), obisqc/absence.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/absence.py), absence.py: ABSENT_VALUES = {"absent", "notDetected"}, PRESENT_VALUES = {"present", "detected"}; the status is compared in lower case; any other value: record.set_invalid("occurrenceStatus")

### DWC-EVENTID-DUPLICATE

Severity: error · Export policy: block

**What the user sees.** In lines «lines» event identifiers repeat (e.g. "«value»"; N repeated in all). Every event needs its own unique eventID, otherwise it is unclear which event the dependent records belong to.

**What triggers it.** «file»:«lines» eventID '«value»' and N repeated eventID(s) in all, in an Event core (obistools check_eventids: "eventID ... is duplicated"). Every row of a repeated eventID is listed. Not run on an Occurrence core, where one eventID legitimately repeats.

**Citations.**

- [OBIS obistools (R), R/check_eventids.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_eventids.R), check_eventids: "check duplicate eventIDs" (error: "eventID ... is duplicated"); "check if all parentEventIDs have corresponding eventID" (error: "parentEventID ... has no corresponding eventID")

### DWC-PARENT-DANGLING

Severity: error · Export policy: block

**What the user sees.** In lines «lines» the parentEventID (e.g. "«value»"; N different in all) points at an event that is not in this table's eventID column. Correct the identifier or add the missing parent event.

**What triggers it.** «file»:«lines» parentEventID '«value»' (N different in all) has no matching eventID in the Event core (obistools check_eventids; Biocheck). Not run when the archive was read only in part (IN-DWCA-PARTIAL).

**Citations.**

- [OBIS obistools (R), R/check_eventids.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_eventids.R), check_eventids: "check duplicate eventIDs" (error: "eventID ... is duplicated"); "check if all parentEventIDs have corresponding eventID" (error: "parentEventID ... has no corresponding eventID")
- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Integrity checks: "if the parentEventID field is populated, it must be populated with an existing eventID from the eventID field. Adding to the parentEventID field something different than an existing eventID is incoherent."

### DWC-PARENT-LOOP

Severity: error · Export policy: block

**What the user sees.** In lines «lines» (N in all) the event hierarchy runs in a circle: an event is its own ancestor (e.g. "«value»"). Correct the parentEventID so that the hierarchy ends in an event without a parent.

**What triggers it.** «file»:«lines» N row(s) lie on a loop of the eventID / parentEventID hierarchy (e.g. eventID '«value»'; GBIF OccurrenceIssue PARENT_EVENT_INFINITE_LINEAGE). A row whose parentEventID equals its own eventID is a loop of one. Linear-time detection.

**Citations.**

- [GBIF API, enumeration of OccurrenceIssue (read 2026-10-24)](https://api.gbif.org/v1/enumeration/basic/OccurrenceIssue), OccurrenceIssue value PARENT_EVENT_INFINITE_LINEAGE (a loop in the eventID / parentEventID hierarchy)

### DWC-OCCURRENCEID-DUPLICATE

Severity: error · Export policy: block

**What the user sees.** In lines «lines» occurrenceIDs repeat (e.g. "«value»"; N repeated in all). The occurrenceID is the key of a record and must be unique; give every record its own identifier.

**What triggers it.** «file»:«lines» occurrenceID '«value»' and N repeated occurrenceID(s) in all (Biocheck: "occurrenceID is unique in the occurrence table", the primary key). Every row of a repeated occurrenceID is listed.

**Citations.**

- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Integrity checks: "Checks that occurrenceID is unique in the occurrence table" ... "The occurrenceID acts as the Primary Key for the occurrence table, therefore two records with the same occurrenceID cannot exist in the occurrence table."

### DWC-EVENTDATE-NOT-ISO

Severity: warning · Export policy: show

**What the user sees.** In column "«field»" the dates in lines «lines» (N in all) are not written in ISO 8601, e.g. "«value»". Darwin Core takes 2011-06-14, 2011-06, 2011, a time such as 2011-06-14T10:00Z, or an interval with a slash (2011-06-14/2011-06-20). Nothing was changed; write the dates that way.

**What triggers it.** «file»:«lines» field «field»: N value(s) that are not ISO 8601 as Darwin Core eventDate takes it (year, year-month, date, date with a time and an optional zone, or an interval of two such values joined by a slash; first '«value»'). Only a column headed exactly eventDate is read; an xlsx date-formatted cell is not judged. Nothing is changed.

### CONV-SPLIT-UNDECIDED

Severity: error · Export policy: block

**What the user sees.** N taxon names carry a qualifier (cf., sp., ?) or a life stage (c2, juv). Approve each split into name, qualifier and stage; the first one is "«value»".

**What triggers it.** «file», «sheet»: N distinct taxon name(s) were split into scientificName, identificationQualifier and lifeStage and the split is not approved yet; example "«value»". verbatimIdentification keeps the exact text. Conversion is blocked until every distinct split is approved.

### CONV-QUANTITY-UNDECLARED

Severity: error · Export policy: block

**What the user sees.** It is not known what the numbers in this sheet mean. Say whether they are counts, densities or biomass, with the unit, and if you give the sample size (a volume or an area), give all of it. Missing: «missing».

**What triggers it.** «file», «sheet»: the quantity declaration of the sheet is missing or incomplete (missing: «missing»). A count needs only its kind; a density needs the unit; a biomass needs the unit and the basis (wet, dry or ash-free dry weight); an effort needs its value or column, its unit and whether it is a volume or an area.

### CONV-COUNT-NOT-INTEGER

Severity: error · Export policy: block

**What the user sees.** Column "«field»" is declared as a count but has decimals in lines «lines» (N in all), e.g. «value». A number of individuals must be whole. Declare a density instead, or correct the values.

**What triggers it.** «file»:«lines» field «field»: N value(s) of a declared count are not integers (example «value»); individualCount must be a whole number. Those cells were not converted.

### CONV-NEGATIVE-QUANTITY

Severity: error · Export policy: block

**What the user sees.** Column "«field»" has negative values in lines «lines» (N in all), e.g. «value». A count, density, biomass or sample size cannot be negative.

**What triggers it.** «file»:«lines» field «field»: N negative value(s) in a quantity or effort column (example «value»). Those cells were not converted.

### CONV-COVER-RANGE

Severity: error · Export policy: block

**What the user sees.** Column "«field»" is declared as percent cover, but lines «lines» have a value outside 0 to 100 (N in all), e.g. «value». Correct the values, or change the declaration.

**What triggers it.** «file»:«lines» field «field»: N value(s) of a declared percent cover are outside 0 to 100 (example «value»). Those cells were not converted.

### CONV-CLASS-VALUE

Severity: error · Export policy: block

**What the user sees.** Column "«field»" is declared as an abundance class of the scale «scale», but lines «lines» have a value that is not a whole number of that scale (N in all), e.g. «value». A class is not a number of individuals. Correct the values or the scale.

**What triggers it.** «file»:«lines» field «field»: N value(s) of a declared abundance class are not whole numbers of the scale «scale» (example «value»). Those cells were not converted; a class is never written as individualCount.

### CONV-SAMPLE-CODE-MISSING

Severity: error · Export policy: block

**What the user sees.** The sample code is missing in lines «lines» (N in all). The code becomes the identifier in the archive, so it has to come from you: pick the columns that together make a sample (below the list), or download the sheet with proposed codes, check them and upload it again.

**What triggers it.** «file», «sheet»:«lines»: N row(s) have no sample code (column: «column»). The eventID of a sample is the user's own code and is never derived from depth or row order. Two ways out: the person picks the columns that make a sample (a sample key, sampleKey.ts), or a one-time proposal (proposeSampleCodes) returns the sheet with a new code column.

### CONV-KEY-PART-BLANK

Severity: warning · Export policy: accept

**What the user sees.** A column of the sample key («columns») is empty in lines «lines» (N in all); "NA", "nan" and a dash count as empty. Such rows make samples of their own and are not joined with the rows that have a value there. Accept if that is right; if it is a gap in the data, fix it in the file.

**What triggers it.** «file», «sheet»:«lines»: N row(s) have an empty part in the sample key the user picked (columns: «columns»; an empty cell, NA, nan and a dash are empty). The empty part is part of the key: those rows are samples of their own, never merged with rows that have a value. A row whose every part is empty has no sample (CONV-SAMPLE-CODE-MISSING).

### CONV-ROLE-UNCONFIRMED

Severity: warning · Export policy: accept

**What the user sees.** N columns have a role the converter proposed that the file does not state: «columns». Nothing was changed. Check them, correct a wrong role in the column table, and accept once.

**What triggers it.** «file», «sheet»: N column(s) have a taxon, quantity, date, latitude or longitude role that the proposer gave and the file does not state by name (an exact Darwin Core term, an exact vocabulary entry, a unit the header declares or a PANGAEA geocode): «columns». A column whose role the person changed is not listed. Nothing is re-roled and nothing is written about this finding in the archive or the companion file; the acceptance holds while the listed set does not grow (set: «keys», header hash and proposed role).

### CONV-KEY-MIXED-NUMBERS

Severity: warning · Export policy: accept

**What the user sees.** The key column "«field»" mixes typed numbers and text that looks like a number (for example «examples»). They are compared differently, so one sample may be split in two. Check the column in your file; accept if the samples are right.

**What triggers it.** «file», «sheet» field «field»: the key column holds typed numbers and number-like text (examples: «examples»); a typed number is compared as a number, a text only as an integer with an all-zero fraction, so "1.5" typed and "1.50" written are two values and one sample may be split.

### CONV-KEY-TOO-LONG

Severity: error · Export policy: block

**What the user sees.** An identifier made from the key you picked (of a sample, a replicate or an occurrence) is longer than «max» characters in lines «lines» (N in all); the longest has «longest»: "«value»…". A Darwin Core archive does not take identifiers that long. Pick fewer columns, or columns with shorter values.

**Sentence added when the finding has the parameter prefixBig.** The name in front of every ID ("«prefix»", «prefixLength» characters) is part of it: a shorter one helps.

**What triggers it.** «file», «sheet»:«lines»: N row(s) get an ID (sample, replicate or occurrence) longer than «max» characters from the key the user picked; the longest has «longest» characters (first 60: "«value»"); the name in front of every ID is "«prefix»" («prefixLength» characters). Nothing is shortened or cut: the export is blocked.

### CONV-KEY-PICKED

Severity: info · Export policy: show

**What the user sees.** As you chose, a sample is identified by the columns: «columns». Samples: «samples», rows in them: «rows». Every sample ID in the archive starts with "«prefix»" (a name you can change at the picker), then come the values of those columns. "Ask again" takes the choice back.

**Sentence added when the finding has the parameter fromFile.** This choice was read from the companion file; it holds because the columns are the same and the sheet has the same number of rows.

**What triggers it.** «file», «sheet»: the sample code of a row is made of the values of the columns the user picked («columns»), after the name "«prefix»" (part of every sample ID; the person may change it; the companion file keeps it), joined with "|"; the key made «samples» sample(s) of «rows» row(s). Information only. Asked again by the button (a companion file's choice holds only while the same columns and the same number of rows are there).

### CONV-JOIN-PROPOSED

Severity: info · Export policy: show

**What the user sees.** Sheet "«description»" seems to describe the samples of this sheet; they are linked by: «keys». «covered» of «samples» samples were found in it. Nothing is joined until you confirm.

**What triggers it.** «file», «sheet»: the sheet "«description»" (file «descriptionFile») looks like the description of the samples of this sheet, linked by «keys»; «covered» of the «samples» samples of this sheet have a row there. Information only: nothing is joined until the person confirms the link (declare first).

### CONV-JOIN-DESCRIPTION-LONG

Severity: info · Export policy: show

**What the user sees.** Sheet "«description»" seems to describe these samples (linked by: «keys»), but it is in the long layout: one row per parameter. Joining such a sheet is not supported yet; both sheets are converted as if there were no join.

**Sentence added when the finding has the parameter turned.** That description sheet was turned at your request (its samples were columns); a turned sheet cannot be joined yet either.

**What triggers it.** «file», «sheet»: the sheet "«description»" (file «descriptionFile») looks like the description of the samples of this sheet, linked by «keys», but it is in the long layout (one row per parameter), or the person turned it (its samples were columns; the finding then carries turned=yes, an optional parameter that adds one sentence). Joining a long or turned description sheet is not supported yet: both sheets are converted exactly as without a join. Information only.

### CONV-JOIN-CONFLICT

Severity: error · Export policy: block

**What the user sees.** «what» differs between the two sheets in «total» samples, e.g. (description / results) «examples». Still to decide: N. Choose a value for all of them at once, for each sample, or for each pair of values. Columns: results «resultsColumns»; description «descriptionColumns».

**What triggers it.** «file», «sheet»: «what» (group «group») holds a different value in the results sheet and in the description sheet for «total» sample(s), e.g. «examples»; the columns compared are «resultsColumns» (results) and «descriptionColumns» (description); N of them are not decided yet. Nothing is chosen for the person: the export is blocked until each is decided for all, per sample or per pair of values.

### CONV-JOIN-CONFLICT-CHOSEN

Severity: info · Export policy: show

**What the user sees.** The values of «what» differed in N samples. As you chose, they were taken from the description sheet for «fromDescription» samples and from the results sheet for «fromResults» samples.

**What triggers it.** «file», «sheet»: the values of «what» differed between the two sheets in N sample(s); the person chose the description sheet for «fromDescription» sample(s) and the results sheet for «fromResults» sample(s). Information only.

### CONV-JOIN-UNIT-DIFFERS

Severity: error · Export policy: block

**What the user sees.** «what» is in different units in the two sheets: "«resultsColumn»" in the results sheet («resultsUnit») and "«descriptionColumn»" in the description sheet («descriptionUnit»). These values can be neither compared nor exchanged. State the same unit in both sheets, or set one of the two columns to ignore.

**What triggers it.** «file», «sheet»: «what» has the unit «resultsUnit» in the results column «resultsColumn» and «descriptionUnit» in the description column «descriptionColumn»; the merge compares and exchanges values only in one unit, so nothing is chosen and the export is blocked until the unit is the same or one column is ignored.

### CONV-JOIN-COLUMNS-DIFFER

Severity: error · Export policy: block

**What the user sees.** «what» is in different columns in the two sheets: «resultsColumn» in the results sheet, «descriptionColumn» in the description sheet. These columns cannot be paired. Use the same columns in both sheets, or set the columns of one of the sheets to ignore.

**What triggers it.** «file», «sheet»: «what» is held by the columns «resultsColumn» in the results sheet and «descriptionColumn» in the description sheet, which are not the same set of columns; the merge pairs columns one to one, so nothing is chosen and the export is blocked until the sets agree or the columns of one sheet are ignored.

### CONV-JOIN-NO-DESCRIPTION

Severity: error · Export policy: block

**What the user sees.** N samples have no row in sheet "«description»": «samples». Convert them with only what the results sheet says, or add the rows to the description sheet.

**Sentence added when the finding has the parameter descriptionOnly.** The description also has samples with no results, e.g. «descriptionOnly». Is one of them the same sample written differently (O for 0, say)?

**What triggers it.** «file», «sheet»: N sample(s) of the results sheet have no row in the description sheet "«description»": «samples». Blocks until the person converts them with only what the results sheet says (CONV-JOIN-RESULTS-ONLY) or completes the description sheet. When the description sheet also has samples with no results, up to 5 of their keys (param descriptionOnly) are named beside, to show a near-miss.

### CONV-JOIN-NO-MATCH

Severity: error · Export policy: block

**What the user sees.** No key of sheet "«sheet»" (columns: «resultsColumns») is in sheet "«description»" (columns: «descriptionColumns»): the keys do not match. Results, e.g.: «resultsExamples». Description, e.g.: «descriptionExamples». Check the key columns or how the codes are written (O for 0, say).

**What triggers it.** «file», «sheet»: no key of the results sheet (columns «resultsColumns») is found in the description sheet "«descriptionFile»" / "«description»" (columns «descriptionColumns»); results keys e.g. «resultsExamples», description keys e.g. «descriptionExamples». Blocks: joined like this every description row would become a description-only event and every results sample a results-only one. No "results only" answer is offered; the key columns or the codes must be corrected.

### CONV-JOIN-RESULTS-ONLY

Severity: info · Export policy: show

**What the user sees.** As you chose, N samples without a description are converted with only what the results sheet says: «samples». "Ask again" takes the choice back.

**Sentence added when the finding has the parameter fromFile.** This answer was read from the companion file; it holds because the same number of samples have no row in the description sheet.

**What triggers it.** «file», «sheet»: the person chose to convert N sample(s) that have no row in the description sheet with only what the results sheet says: «samples». Nothing is invented for them. Information only; asked again by the button (an answer from the companion file holds only while the same number of samples lack a description).

### CONV-JOIN-DESCRIPTION-ONLY

Severity: warning · Export policy: accept

**What the user sees.** N samples are described in sheet "«description»" but have no results: «samples». They are written as sample events with no occurrence.

**Sentence added when the finding has the parameter resultsWithout.** The results also have samples with no description, e.g. «resultsWithout». Is one of them the same sample written differently (O for 0, say)?

**What triggers it.** «file», «sheet»: N sample(s) have a row in the description sheet "«description»" and none in the results sheet: «samples». They are written as sample events with no occurrence; the person accepts this once. When the results sheet also has samples with no description, up to 5 of their keys (param resultsWithout) are named beside, to show a near-miss.

### CONV-JOIN-AMBIGUOUS

Severity: error · Export policy: block

**What the user sees.** In description sheet "«description»", N keys occur on several rows with different values (lines «lines»): «keys». Keep one row per key value, or make their values agree.

**What triggers it.** «file», «sheet»:«lines»: N key(s) of the description sheet "«description»" are on several rows that differ in their values: «keys». The lines are those of the description sheet. Nothing is chosen between the rows: the export is blocked.

### CONV-JOIN-KEY-BLANK

Severity: error · Export policy: block

**What the user sees.** In the results sheet (lines «lines», N in all) a part of the key («columns») is blank, so no description can be found for those samples. Fill in the key in the file, or convert these rows with only what the results sheet says.

**What triggers it.** «file», «sheet»:«lines» («side» sheet): N row(s) have a blank part in the join key (columns: «columns»), so no row of the other sheet can be found for them. Blocks until the key is filled or the person converts these rows with only what the results sheet says (CONV-JOIN-RESULTS-ONLY covers them); on the description side, until the rows are left out and listed.

### CONV-JOIN-KEY-ROLE-LOST

Severity: error · Export policy: block

**What the user sees.** The join you confirmed for "«sheet»" is not applied: column "«column»" no longer has a key role. Give it back the role, or confirm the join again.

**What triggers it.** «file», «sheet»: the person confirmed the join with the sheet "«description»", but the results column "«column»" is a key of it and has no key role any more (it was re-roled after the confirmation), so the join is not applied and both sheets are converted as without it. Blocks until the column gets its key role back or the person confirms the join again.

### CONV-JOIN-FILLED

Severity: info · Export policy: show

**What the user sees.** N blank cells in column "«column»" were filled from sheet "«from»".

**What triggers it.** «file», «sheet»: N blank cell(s) of column "«column»" were filled with the value of the same sample in the sheet "«from»". Only blank cells are filled. Information only.

### CONV-ID-DUPLICATE

Severity: error · Export policy: block

**What the user sees.** The same identifier is produced more than once, e.g. "«value»", in lines «lines» (N repeated). Identifiers must be unique: change the repeated code or header or, when codes repeat between stations, tick the station prefix.

**Sentence added when the finding has the parameter keyAdvice.** The samples come from the key you picked. If these rows are from different samples, add a column that tells them apart to the key, or use "Ask again".

**Sentence added when the finding has the parameter keyPrefix.** The sample IDs of a picked key start with the name "«keyPrefix»" shown at the key picker. If two sheets share it, give one of them another name there.

**What triggers it.** «file», «sheet»:«lines»: N repeated «kind» identifier(s), example "«value»". «hint»

**Citations.**

- [OBIS obistools (R), R/check_eventids.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_eventids.R), check_eventids: "check duplicate eventIDs" (error: "eventID ... is duplicated"); "check if all parentEventIDs have corresponding eventID" (error: "parentEventID ... has no corresponding eventID")
- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Integrity checks: "Checks that occurrenceID is unique in the occurrence table" ... "The occurrenceID acts as the Primary Key for the occurrence table, therefore two records with the same occurrenceID cannot exist in the occurrence table."

### CONV-TAB-IN-VALUE

Severity: error · Export policy: block

**What the user sees.** Column "«field»" has a tab or a line break inside a value in lines «lines» (N in all), e.g. "«value»". The archive files are tab-separated, so such a value would break them. Replace the character with a space in the sheet.

**What triggers it.** «file», «sheet»:«lines» field «field»: N value(s) contain a tab or line break (example "«value»", shown with a space). The text files of the archive are tab-separated with one record per line.

**Citations.**

- [OBIS Manual, "Common data quality issues" (iobis/manual common_qc.md; manual.obis.org)](https://manual.obis.org/common_qc.html), "Hidden characters and non-breaking spaces": "a value like Abra alba containing a non-breaking space will not match the same name typed with a normal space"; "OBIS removes leading and trailing whitespace from values during processing, but does not change spaces inside a value"; "Other invisible characters, such as tabs, line breaks within a cell, and zero-width spaces (U+200B), can cause similar problems"

### CONV-TEXT-IN-TAXON-CELL

Severity: warning · Export policy: block

**What the user sees.** N cells of «columns» hold the text "«value»" where a number is expected. Say what it means: absence, leave them out, or present with the text in the remarks. You can also give one answer for every text of a column. The export waits for the answer.

**What triggers it.** «file», «sheet»:«lines» field «field»: N of the «held» cell(s) with the text "«value»" in a quantity or taxon column («columns»; column indexes «indexes»; cells with this text per column «heldAt») are not numbers (NA tokens and NA variants are NA cells, not asked). Nothing is written for them (each is in the list of rows not written with the reason count-text) until the person answers for the text: absence (the cell is read as 0: occurrenceStatus absent with the full-list tick, else left out as a zero), leave out (left out, reason text-left-out) or present (an occurrence present with the text in occurrenceRemarks), or gives one answer for every text of a column (the cells of each whole column that hold a text: «columnTexts»). A text is the cell's trimmed text, case kept; no word is read as an absence by the tool. An answer holds for the number of cells it was given for.

### CONV-COUNT-TEXT-DECIDED

Severity: info · Export policy: show

**What the user sees.** As you said, the text "«value»" in N cells of «columns» means absence: the cells are read as 0 (absent with the full-list tick, otherwise left out like a zero). "Ask again" takes the answer back.

**Sentence added when the finding has the parameter via.** This is the answer you gave for the whole column.

**Sentence added when the finding has the parameter fromFile.** This answer was read from the companion file.

**What triggers it.** «file», «sheet»:«lines» field «field»: N of the «held» cell(s) with the text "«value»" in a quantity or taxon column («columns»; column indexes «indexes»; text cells per column «columnTexts»; cells with this text per column «heldAt») were answered "«answer»" (CONV-TEXT-IN-TAXON-CELL asked). absence: the cell is read as the number 0 (occurrenceStatus absent, individualCount 0, with the full-list tick; otherwise left out as a zero, reason zero). leave-out: the cell is left out and listed (reason text-left-out). present: an occurrence present with the text in occurrenceRemarks (CONV-COUNT-TEXT-DECIDED:present). via=column: the answer is the one given for the whole column. The answer holds for this number of cells only.

### CONV-TAXON-SAME-EVENT

Severity: warning · Export policy: accept

**What the user sees.** The same taxon "«value»" (the same name or the same WoRMS identifier, the same stage and qualifier) appears N times in one sample: «columns». Your sheet writes it as: «names». Each stays a separate record and nothing is summed. Check whether it should be one record.

**What triggers it.** «file», «sheet»: N columns or rows give the same taxon in one event: the same (eventID, scientificNameID, lifeStage, identificationQualifier), or the same scientificName when there is no ID: «value» in «columns»; written in the sheet as «names». Judged after the WoRMS lookup, so two spellings that resolved to one AphiaID are caught. No values are summed; each keeps its own occurrenceID.

### CONV-NA-SKIPPED

Severity: info · Export policy: show

**What the user sees.** N cells marked "NA" (not available) in a taxon or quantity column were left out. Such a cell makes no record, like an empty one: no data is neither a zero nor a presence.

**What triggers it.** «file», «sheet»: N cell(s) of a taxon or quantity column hold NA (or a similar "not available" token) and were not converted: no occurrence is written, as for an empty cell. Only a numeric 0 can become occurrenceStatus absent, and only with the full species list ticked.

### CONV-QUANTITY-BLANK-KEPT

Severity: warning · Export policy: accept

**What the user sees.** N rows have a weight but a blank or "NA" quantity (lines «lines»). They are written as present with no count; no number is invented. If "NA" means "not analysed", the taxon is not known to be present: correct those cells before you export.

**What triggers it.** «file», «sheet»:«lines» field «field»: N row(s) of a long sheet have a taxon, no quantity (empty or a missing-data token) and a biomass value above zero. Each is written as an occurrence with occurrenceStatus present, no individualCount or organismQuantity, and its biomass measurement: the weight shows the taxon was in the sample, the missing count is not made up. A measured variable is not read as evidence, because it is written once per sample.

**Citations.**

- [OBIS Manual, "How to format Occurrence tables" (manual.obis.org/format_occurrence.html; read 2026-10-29): occurrenceStatus is required, a quantity is not](https://manual.obis.org/format_occurrence.html), "These required data fields include the following eight terms: occurrenceID, eventID, ..., occurrenceStatus, basisOfRecord, scientificName, ..." (organismQuantity and organismQuantityType are not among them); "Add and fill basisOfRecord and occurrenceStatus fields"

### CONV-BIOMASS-UNIT-UNCLEAR

Severity: warning · Export policy: accept

**What the user sees.** The name of weight column "«field»" holds a mass unit, but the rest ("«value»") is not understood, so the unit is left empty (lines «lines»). Put the unit in brackets in the header, e.g. \[kg/km2\].

**What triggers it.** «file», «sheet»:«lines» field «field»: N biomass value(s) of a column whose name holds a mass unit followed by words that are not a per-area / per-volume part or a kind of mass ("«value»"). A partial unit would change the meaning of the number, so measurementUnit is left empty.

### CONV-QUANTITY-REPEATED

Severity: error · Export policy: block

**What the user sees.** "«columns»" looks like a total for the taxon in a sample, repeated on the size-class rows (N of «of» groups, differences in "«differs»"; lines «lines»). Counted as it is, it would be inflated. Write one occurrence per sample and taxon (button), or mark a column with each class's number as the quantity.

**What triggers it.** «file», «sheet»:«lines» field «field»: the value of «columns» is the same on every row of N of «of» groups of rows that share sample, taxon, life stage and qualifier and differ in "«differs»" (a repeated per-taxon total: at least 4 groups, at least 80 % of the groups that have two or more values above zero, and not one value alone; a count of 1 is not counted). The sum written from such a sheet would be the total times the number of size classes. The advice for a duplicate identifier (an occurrenceID or a life stage) is withheld: it would write those numbers. Blocks until the user either writes one occurrence per sample and taxon (the choice is kept in the companion file) or marks a per-size-class column as the quantity.

### CONV-QUANTITY-REPEATED-ONCE

Severity: warning · Export policy: accept

**What the user sees.** As you chose, the total in "«columns»" is written once per sample and taxon («groups» groups); N repeated rows were left out (lines «lines»). Not written on that occurrence, as the rows differ in them: «lost». Check the sum.

**Sentence added when the finding has the parameter fromFile.** This answer was read from the companion file; it holds because the same number of row groups repeat the total.

**What triggers it.** «file», «sheet»:«lines» field «field»: the user chose to write one occurrence per sample and taxon where «columns» repeats a total on size-class rows («groups» groups); N later row(s) of those groups, whose repeated values equal those of the first row of their group, are not converted. The rows differ in "«differs»" and in «lost»: nothing per-row is written from the first row, because one occurrence would hold several values of them. A group below the threshold, or whose values differ, stays as separate rows. Rows whose other weight or count column has numbers of its own are not taken once (CONV-QUANTITY-REPEATED).

### CONV-QUANTITY-REAL-COUNTS

Severity: info · Export policy: show

**What the user sees.** As you chose, the equal quantities in N rows are real counts: for this sheet, repeated totals and exact copies of rows are not looked for. "Ask again" turns both checks back on.

**Sentence added when the finding has the parameter fromFile.** This answer was read from the companion file; it holds because the same number of rows repeat a total.

**What triggers it.** «file», «sheet»: the user (or a companion file whose number of rows is the same today) declared the equal quantities of the N row(s) of the groups that repeat a total to be real counts. Nothing is looked for in the sheet then (CONV-QUANTITY-REPEATED, CONV-QUANTITY-SAME-IN-SAMPLE, CONV-ROW-COPIES are off). Information only; asked again by the button, or when the number of rows changes.

### CONV-COMPANION-OLD

Severity: info · Export policy: show

**What the user sees.** The companion file is from an older version: N saved answers have no number of rows they were given for, so they were not applied; where they apply, the questions are asked again.

**What triggers it.** The companion file of this run holds N answer(s) of the old form (the settings realCounts, totalOnce and the copies one, each with a sheet name and no count). An answer that switches a check off or takes rows out holds only for the number it was given for, so these are read and not applied. Information only.

### CONV-ROW-COPIES

Severity: error · Export policy: block

**What the user sees.** N rows are exact copies of another row (lines «lines»). The quantity adds up to «withCopies» with them and «withoutCopies» without them. Leave the copies out and list them in a file beside the archive (button), or correct the sheet.

**What triggers it.** «file», «sheet»:«lines» field «field»: N row(s) are identical to an earlier row in every column but a per-row identifier (an occurrenceID or a column that differs on nearly every row), with a quantity above 1. The sum of the quantity is «withCopies» with them and «withoutCopies» without them. The advice to tell the rows apart is withheld: it would write each copy. Blocks until the user leaves the copies out and lists them (kept in the companion file with the number of copies) or corrects the sheet.

### CONV-ROW-COPIES-DROPPED

Severity: warning · Export policy: accept

**What the user sees.** As you chose, N exact copies of rows were left out (lines «lines»). Check that they were copies.

**Sentence added when the finding has the parameter fromFile.** This answer was read from the companion file; it holds because the same number of rows are exact copies.

**What triggers it.** «file», «sheet»:«lines» field «field»: the user chose to leave out the rows that are exact copies of an earlier row (they are listed in the file beside the archive) (every column but a per-row identifier); N row(s) are not converted (the sum of the quantity of the sheet was «withCopies» with them and «withoutCopies» without them, before any other rule skips a row).

### CONV-ROW-COPIES-SPECIMENS

Severity: warning · Export policy: accept

**What the user sees.** N rows are identical to another row, with a count of 1 (lines «lines»). As separate specimens the quantity is «withCopies»; if they are copies it would be «withoutCopies». A table of specimens looks exactly like this, so nothing is blocked: check which it is.

**What triggers it.** «file», «sheet»:«lines» field «field»: N row(s) are identical to an earlier row in every column but a per-row identifier, with a count of 1. Written as separate records the sum of the quantity is «withCopies»; if they are copies of one record it would be «withoutCopies». A specimen table looks the same, so this is a warning to accept and never a block.

### CONV-ROW-COPIES-KEPT

Severity: warning · Export policy: accept

**What the user sees.** As you chose, N rows identical to another row (lines «lines») are kept as separate records. Check that they are not copies.

**Sentence added when the finding has the parameter fromFile.** This answer was read from the companion file; it holds because the same number of rows are exact copies.

**What triggers it.** «file», «sheet»:«lines» field «field»: the sheet is declared "each row is its own record" and the person chose to keep the rows that are identical to an earlier row in every column but a per-row identifier as separate records; N row(s) are written, each with its own occurrenceID made of its source line. Honoured only while the same number of copies is found. A warning to accept.

### CONV-OWN-RECORDS

Severity: warning · Export policy: accept

**What the user sees.** Sheet "«sheet»": each of the «rows» rows is its own record; the occurrenceID is the sample code and the line number in the file. The IDs change if rows are inserted or deleted in the source before a new version; keep the row order, or add an occurrenceID column.

**Sentence added when the finding has the parameter fromFile.** This choice was read from the companion file.

**What triggers it.** «file», «sheet»: the person declared each row of this long sheet its own record; «rows» occurrence(s) are written with occurrenceID = the eventID of the sample the occurrence hangs under + ':L' + the line number of the row in the source file (never the order of the rows after sorting or merging; a joined sheet uses the results line). A row with no quantity column and no presence-only tick is one individual (individualCount 1). The IDs change if rows are inserted or deleted in the source before a new version. A warning to accept.

### CONV-ROW-NOT-UNDERSTOOD

Severity: error · Export policy: block

**What the user sees.** N rows «what» (lines «lines»). Nothing of this is in the archive and nothing is deleted: it stays in your file. Leave them out and list them in a file beside the archive (button), or correct your file. The export waits for your decision.

**Sentence added when the finding has the parameter examples.** For example (line: cells): «examples».

**What triggers it.** «file», «sheet»:«lines»: N of the «rows» row(s) of the sheet have no record and the reason is "«reason»" (ledger.ts): the rows are «what». This is one of the reasons that mean the converter could not place what the row holds (notWritten.ts REASON_KIND: blocks). One finding per sheet and reason. It blocks until the user answers "leave these rows out and list them" (kept in the companion file with the count of the rows and of the sheet) or corrects the file; never prefilled, never a default. Every row not written is in the file beside the archive with its physical line, its reason and all its cells; nothing is deleted from the file the user gave.

### CONV-ROW-LEFT-OUT

Severity: info · Export policy: show

**What the user sees.** As you chose, N rows «what» (lines «lines») were left out of the archive and are listed in the file beside it. Nothing was deleted from your file.

**Sentence added when the finding has the parameter fromFile.** This answer was read from the companion file; it holds because the sheet has the same «rows» rows and the same number of rows of this kind.

**What triggers it.** «file», «sheet»:«lines»: the user (or a companion file whose count of rows and of the sheet is the same today) left N row(s) with reason "«reason»" out of the archive: the rows are «what». They are listed in the file beside it. Information only; the question is asked again (button) or when the sheet changes (rows in the sheet: «rows»).

### CONV-QUANTITY-SAME-IN-SAMPLE

Severity: warning · Export policy: accept

**What the user sees.** «records» rows of the same sample and taxon («groups» groups) carry the same quantity (lines «lines»). Written as «records» records, the total is «written»; if the value is the species' total, it would be «asTotal». Check which it is.

**What triggers it.** «file», «sheet»:«lines» field «field»: «records» rows in «groups» group(s) of one sample and taxon, which differ in some other column (a blank size, a stage, a sex, a size that differs on every row), carry the same quantity. Written as separate records the sum is «written»; if the value is a per-taxon total repeated on each row it would be «asTotal». Shown whatever the number of groups or their share, and never with the advice to tell the rows apart by an occurrenceID or a life stage (it would write the first sum). The block CONV-QUANTITY-REPEATED stands for the sheet when the repeat is the rule.

### CONV-TAXON-EMPTY-ROW

Severity: warning · Export policy: accept

**What the user sees.** N rows have a number or a weight but an empty taxon name in "«field»" (lines «lines»). There is nothing to attach it to, so they are not converted. If you know the taxon name, type it in the sheet; the rows are listed in the file beside the archive.

**What triggers it.** «file», «sheet»:«lines» field «field»: N row(s) of a long sheet have a quantity or a biomass value and no taxon name; no occurrence can be written for them and they are not converted.

### CONV-TIME-HOLDS-DATES

Severity: error · Export policy: block

**What the user sees.** Column "«field»" is read as a time of day, but N cells hold a full date, and no column is the date. The events would have no eventDate and the date in the file would be lost. Give the column the meaning "Date and time".

**What triggers it.** «file», «sheet» field «field»: the sheet has a time column and no date column, and N cell(s) of the time column hold a date (YYYY-MM-DD...). No eventDate would be written. A date that is in the file is never dropped silently, so the export is blocked until the column is read as a date and time.

### CONV-TIME-SOME-DATES

Severity: warning · Export policy: accept

**What the user sees.** In time column "«field»", N cells hold a full date (lines «lines»), and no column is the date. These dates will not reach eventDate. If they are the dates of the events, give the column the meaning "Date and time".

**What triggers it.** «file», «sheet»:«lines» field «field»: N cell(s) of the time column hold a date the date parser reads (fewer than half of the filled cells: with half or more the export is blocked, CONV-TIME-HOLDS-DATES). Placeholder dates of a spreadsheet or an epoch (1899-12-30, 1970-01-01) are times and are not counted.

### CONV-DATE-ORDER-UNDECLARED

Severity: error · Export policy: block

**What the user sees.** Dates such as "«value»" can be read as «first» or as «second», and no date in column "«field»" decides it (N cells). Say which order the column uses.

**What triggers it.** «file», «sheet» field «field» (column «index»): N cell(s), e.g. '«value»' («examples»), have two parts of 1-12 that differ, so they read as «isoFirst» (day first, "«first»") or «isoSecond» (month first, "«second»"). No cell of the column has a part above 12 to decide it and no day/month order is declared for it. A day and a month are never guessed, so the export is blocked until the order is declared; the cells are not reported as unreadable.

### CONV-DATE-ORDER-CONTRADICTED

Severity: error · Export policy: block

**What the user sees.** For column "«field»" you declared the order "«declared»", but its own dates show "«detected»" (dmy: day first, mdy: month first, ymd: year first, conflict: both). The declared order is not used. Correct the answer or the dates.

**What triggers it.** «file», «sheet» field «field» (column «index»): the day/month order declared for the column is «declared», but its own unambiguous dates decide «detected». A declaration only decides cells that no date decides, so it is not applied; the export is blocked until the declaration or the dates are corrected.

### CONV-DATE-ORDER-DECLARED

Severity: info · Export policy: show

**What the user sees.** As you declared, the dates in column "«field»" are read in the order «order» (dmy: day first, mdy: month first, ymd: year first): in the date written, in an identifier and when compared in a join.

**Sentence added when the finding has the parameter fromFile.** This answer was read from the companion file.

**What triggers it.** «file», «sheet» field «field» (column «index»): the day/month order «order» declared for the column was used for its ambiguous dates. It applies to the date written, the date inside an ID and the date compared in a join alike.

### CONV-DECIMAL-DECLARED

Severity: info · Export policy: show

**What the user sees.** As you declared, the comma in the numbers of column "«column»" is read the way you said, everywhere the column is used: the archive, the measurements, the sums and the findings.

**Sentence added when the finding has the parameter asDecimalComma.** The comma is a decimal comma: 1,250 is 1.25.

**Sentence added when the finding has the parameter asThousands.** The comma is a thousands separator: 1,250 is 1250.

**Sentence added when the finding has the parameter fromFile.** This answer was read from the companion file.

**What triggers it.** «file», «sheet» column «index» "«column»": the comma was declared «reading» for the column (IN-DECIMAL-AMBIGUOUS asked). Under thousands every cell of the column written n,nnn\[,nnn...\] is read as the number written without its commas, before any other step; under decimal the column is read as it was. Other columns are not affected.

### CONV-MISSING-CODE-DECLARED

Severity: info · Export policy: show

**What the user sees.** As you declared for column "«column»" (N cells with the code -99, -999 or -9999, e.g. «value»; lines «lines»):

**Sentence added when the finding has the parameter asMissing.** treated as missing: they do not go into the archive as numbers, but into the list of rows not written.

**Sentence added when the finding has the parameter asReal.** real values: they are written as they are.

**Sentence added when the finding has the parameter fromFile.** This answer was read from the companion file.

**What triggers it.** «file», «sheet»:«lines» column «index» "«column»": N cell(s) hold exactly -99, -999 or -9999 (first: «value») and the column was answered "«answer»" (ROW-MISSING-CODE asked): missing = the cells are left empty before the sheet is read, so no depth, value or quantity, no station range and no sum is made of them, and each is in the list of rows not written with the reason missing-code, as written; real = the cells are written as they are. Other columns are not touched.

### CONV-ENCODING-DECLARED

Severity: info · Export policy: show

**What the user sees.** As you declared, the file was read as «encoding»: its letters are read that way everywhere (the archive, the measurements and the remarks).

**Sentence added when the finding has the parameter fromFile.** This answer was read from the companion file.

**What triggers it.** «file»: the bytes are not UTF-8 and read differently in windows-1250, ISO-8859-2 and windows-1252 (IN-ENCODING-AMBIGUOUS asked); the person picked «encoding», so the whole file is read with that code page before any other step. The pick is kept in the companion file under the hash of the file's bytes and applies to a file with the same bytes only.

### CONV-ZERO-WITH-BIOMASS

Severity: warning · Export policy: accept

**What the user sees.** N rows have a quantity of 0 and a weight above zero (lines «lines»). These contradict each other. Left out: neither present nor absent (also with the full species list ticked). Check which value is wrong.

**What triggers it.** «file», «sheet»:«lines» field «field»: N row(s) of a long sheet have a quantity of 0 and a biomass value above zero. The row is left out whatever the full-list tick says: occurrenceStatus absent for a contradicted zero would be a false absence, and present would invent a count. Its biomass is not written; neither value is kept silently.

### CONV-SAMPLE-PER-ROW

Severity: warning · Export policy: accept

**What the user sees.** Sheet "«sheet»": «events» sample events for «occurrences» occurrences («ratio»), almost one row each; «shared» share station, date and depth. If these are real replicates, accept this. If one sample was cut into rows (a different code on each), use a code that names the sample.

**What triggers it.** «file», «sheet»: «events» sample events for «occurrences» occurrences of a long sheet («ratio»; at least 30 occurrences and events of at least 80% of them), and «shared» of the events share station, date and depth with another event (at least half do). A sample is one event with its taxa as occurrences; one event per taxon row means the sample codes name rows. Checked on the output, whoever wrote the codes.

**Citations.**

- [OBIS Manual, "How to format Occurrence tables" (manual.obis.org/format_occurrence.html; read 2026-10-26)](https://manual.obis.org/format_occurrence.html), "(remember that all OBIS data have at least one occurrence record associated, regardless of what organization structure you have chosen)"

### CONV-ZERO-SKIPPED

Severity: info · Export policy: accept

**What the user sees.** N cells with a zero were left out, because the species list was not declared complete. A zero means "absent" only when every species of the list was looked for in the sample.

**What triggers it.** «file», «sheet»: N zero cell(s) not converted (full species list not ticked). With the tick a zero becomes occurrenceStatus absent (individualCount 0 for counts only); an empty or NA cell never becomes a record. The zeros are left out because the full-list tick is off by default, not because the person said so, so the outcome is accepted once before the export.

**Citations.**

- [OBIS obis-qc (Python), obisqc/absence.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/absence.py), absence.py: ABSENT_VALUES = {"absent", "notDetected"}, PRESENT_VALUES = {"present", "detected"}; the status is compared in lower case; any other value: record.set_invalid("occurrenceStatus")

### CONV-SAMPLE-CONFLICT

Severity: error · Export policy: block

**What the user sees.** The rows of sample "«value»" (lines «lines») differ in: «what». A sample is one event, so these values must be the same in all its rows.

**Sentence added when the finding has the parameter organism.** If column "«organism»" is a value of each organism, tick "of each organism" on it.

**What triggers it.** «file», «sheet»:«lines»: rows of sample "«value»" differ in «what» (N sample(s) affected). The first row is not silently preferred.

### CONV-REPLICATE-EVENTS

Severity: info · Export policy: show

**What the user sees.** Column "«column»" is read as the replicate number: it makes N replicate events under the samples. If these are not replicates, change its meaning.

**What triggers it.** «file», «sheet» field «field»: the replicate column "«column»" makes N replicate event(s) under the sample events.

### CONV-TAXON-ATTRIBUTE-IGNORED

Severity: info · Export policy: accept

**What the user sees.** N columns have the same value for every row of one taxon, so they are attributes of the taxon (a species code, say), not measurements, and were not written: «columns». If one is a measurement, give it a meaning.

**What triggers it.** «file», «sheet»: N column(s) ignored because their value is a function of the taxon column (name says code, id, tsn, key, serial or trophic, or most taxa are listed more than once; no unit): «columns». A column the person set to ignore is not listed (CONV-COLUMN-IGNORED names it); these are the converter's own proposals, so the finding is accepted once before the export.

### CONV-VALUE-PER-OCCURRENCE

Severity: info · Export policy: show

**What the user sees.** N columns are written on the occurrences of the rows, not on the sample: «columns». Their values differ inside a sample like the values of single organisms. If the rows are really two samples under one code, untick "of each organism" on the column and fix the sample code.

**What triggers it.** «file», «sheet»: N measured-variable column(s) written as an eMoF row of the occurrence of each row, not of the sample event: «columns».

### CONV-NERC-UNKNOWN

Severity: warning · Export policy: accept

**What the user sees.** There is no confirmed NERC concept for «what», so measurementTypeID stays empty, and OBIS requires one. Confirm or choose one in the table below the columns; the optional NVS search works with English words, e.g. "temperature", "salinity", "chlorophyll". In other cases choose it by hand before publishing.

**What triggers it.** «file», «sheet»: no confirmed NERC P01 concept for «what»; measurementTypeID left empty (OBIS: controlled vocabulary terms are required for measurementTypeID). For a measured-variable column an identifier is written only when the user confirmed it for that column (a verified generic concept proposed by the converter, a verified method-specific one the user chose, or a result of the user's own NVS search); nothing is guessed.

**Citations.**

- [OBIS Manual, "Extended Measurement Or Fact" (manual.obis.org/format_emof.html; read 2026-10-25)](https://manual.obis.org/format_emof.html), "For measurementTypeID, measurementUnitID, and measurementValueID you must use controlled vocabulary terms."

### CONV-NERC-UNIT-MISMATCH

Severity: warning · Export policy: accept

**What the user sees.** Column "«column»": concept «code» refers to a different basis (per unit mass or per unit volume) than the unit "«unit»". Check that the concept and the unit belong together. The converter converts and changes nothing.

**What triggers it.** «file», «sheet» column «column»: the label of the confirmed P01 concept «code» states a dimension (per unit mass / dry weight / wet weight, or per unit volume) that contradicts the dimension of the unit "«unit»". The pair is the user's choice and is written as confirmed; nothing is converted.

**Citations.**

- [OBIS Manual, "Extended Measurement Or Fact" (manual.obis.org/format_emof.html; read 2026-10-25)](https://manual.obis.org/format_emof.html), "For measurementTypeID, measurementUnitID, and measurementValueID you must use controlled vocabulary terms."

### CONV-NERC-CODE-MALFORMED

Severity: warning · Export policy: accept

**What the user sees.** Header "«column»": the code «code» after "SDN:«collection»::" is not a «collection» code, which has exactly «length» capital letters and digits. NVS has no such concept. Check the code for a typo or an extra character. No identifier is written from it; the column stays a measured variable.

**What triggers it.** «file», «sheet» column «column»: the code "«code»" after the explicit prefix SDN:«collection»:: is not of the shape of a «collection» code («length» upper-case letters and digits); no concept page exists (NVS: 404). The column stays a measured variable, no measurementTypeID / measurementUnitID is written from the code; one is written only when the user confirms a concept for the column.

**Citations.**

- [OBIS Manual, "Extended Measurement Or Fact" (manual.obis.org/format_emof.html; read 2026-10-25)](https://manual.obis.org/format_emof.html), "For measurementTypeID, measurementUnitID, and measurementValueID you must use controlled vocabulary terms."
- [NERC Vocabulary Server (NVS), collections P01 (BODC Parameter Usage Vocabulary) and P06 (BODC data storage units); read 2026-10-29](https://vocab.nerc.ac.uk/collection/P06/current/), Every concept of P06 has a four-character code (411 of 411 codes read, e.g. UPAA) and every concept of P01 an eight-character one (50 613 of 50 613 codes read, e.g. TEMPPR01; 66 begin with a digit); a code of another length has no concept page: https://vocab.nerc.ac.uk/collection/P01/current/D13CMOP11/ answers 404, https://vocab.nerc.ac.uk/collection/P01/current/D13CMOP1/ is a concept.

### CONV-UNIT-NO-P06

Severity: warning · Export policy: accept

**What the user sees.** There is no confirmed NERC concept (P06) for the unit "«unit»", so measurementUnitID stays empty. The unit is not converted; it is written as given. For a measured-variable column you can confirm or choose a unit in the table below the columns.

**What triggers it.** «file», «sheet»: unit "«unit»" has no confirmed P06 concept; measurementUnit is written as declared, measurementUnitID is empty, no conversion is made. For a measured-variable column an identifier is written only when the user confirmed it for that column.

**Citations.**

- [OBIS Manual, "Extended Measurement Or Fact" (manual.obis.org/format_emof.html; read 2026-10-25)](https://manual.obis.org/format_emof.html), "For measurementTypeID, measurementUnitID, and measurementValueID you must use controlled vocabulary terms."

### CONV-COLUMN-UNNAMED

Severity: error · Export policy: block

**What the user sees.** Column "«field»" has no name in the file's header, and its name would go into the archive as the name of a variable or a taxon. Type a name for the variable, or choose another meaning for the column (for example "Ignore").

**What triggers it.** «file», «sheet» field «field»: the header has no name for this column (IN-HEADER-SHORT; internal name "Column N"); it is mapped as a variable that keeps that name, or as a taxon whose header is the name. The export is blocked until the variable has a name or the column another role.

### CONV-LONG-UNSUPPORTED

Severity: error · Export policy: block

**What the user sees.** Sheet "«sheet»" is in the long layout: a row per parameter (columns "«parameterColumn»" and "«valueColumn»"), which the converter cannot read. Reshape it to one column per parameter, unit in the header (e.g. "Temp \[°C\]"), one row per sample, and load it again. If it holds species, mark the taxon column and the count above.

**What triggers it.** «file», «sheet»: a header names a parameter column ("«parameterColumn»") and a value column ("«valueColumn»") and the sheet has no taxon and no quantity column: one row per measured parameter. The converter writes nothing from this sheet; the export is blocked until it is reshaped to one column per parameter (unit in the header) or left out. reason: «reason» (one-parameter: fewer than two distinct parameters; too-many: more than «max» (parameter, unit) pairs; count: N distinct parameters or pairs; otherwise the sheet was not read as a long one for another reason).

### CONV-SHEET-TRANSPOSED

Severity: error · Export policy: block

**What the user sees.** Sheet "«sheet»" was not read: «reason». Row 1 would be read as the header. Transpose the table in your spreadsheet (samples in rows, species or variables in columns) and load it again, or tick "Read as a normal table" for this sheet.

**What triggers it.** «file», «sheet»: «reason». /check reports the same reading of variables in rows (IN-LAYOUT-UNSUPPORTED) and cannot read it; the converter also detects species in rows (first column Latin names, headers that are sample codes, numbers or presence marks in the cells; a normal wide sheet with species as headers is never flagged). The sheet is not converted and the export is blocked until the table is turned in the spreadsheet or the user ticks "Read as a normal table" for the sheet (a pre-tick from the companion file: transposedAsTable=\<sheet\>). A sheet that is a pivot of a long sheet, a profile sheet and a sheet read as it stands are not tested.

### CONV-SHEET-UNITS-ROW

Severity: error · Export policy: block

**What the user sees.** Sheet "«sheet»" was not read: line «line», under the header, looks like units (e.g. m, degrees_north) rather than data. If they are units, write them into the column names ("depth \[m\]") and load the file again. If it is data, tick "Read as a normal table" for this sheet.

**What triggers it.** «file», «sheet»: line «line» is the first row under the header and reads as a row of units: every filled cell is a unit and the numbers agree under most of them (text or an unknown word stands under some), or two cells are units of the vocabulary with numbers under them (recognize/layout.ts firstRowIsUnits, the row /check refuses as a header over several rows). It was not folded into the header (foldUnitsRow needs every filled cell a unit and numbers under all), so the converter would read it as a data row (text in the taxon columns, a wrong sample). The sheet is not converted and the export is blocked until the units are written into the column names and the file is loaded again, or the user ticks "Read as a normal table" for the sheet (the same tick as CONV-SHEET-TRANSPOSED, offered through ConvertFileSummary.transposedSheets = 'header-units'; a pre-tick from the companion file: transposedAsTable=\<sheet\>).

### CONV-LONG-READ

Severity: info · Export policy: show

**What the user sees.** Sheet "«sheet»" has one row per measurement ("«parameterColumn»", "«valueColumn»"). It was read as «samples» samples; parameter columns: «columns» (one per parameter and unit, headed "name \[unit\]"). The rows are only regrouped: no value is summed, averaged or rounded.

**What triggers it.** «file», «sheet»: a long environmental sheet (parameter column "«parameterColumn»", value column "«valueColumn»") was read as one row per sample: «rows» rows became «samples» samples with «columns» parameter columns "\<parameter\> \[\<unit\>\]". The key of a sample is every column except the parameter, unit, value and quality-flag columns; each cell is the original cell. Nothing is summed, averaged or chosen.

### CONV-LONG-FLAG-COLUMNS

Severity: info · Export policy: accept

**What the user sees.** Left out: N quality-flag columns of sheet "«sheet»", «columns». A flag does not tell samples apart, so it is not part of the key that groups the rows into samples, and it is not written.

**What triggers it.** «file», «sheet»: N quality-flag column(s) of a long sheet are not part of the sample key and are not written: «columns». The converter leaves these columns out by their name, not by the person's answer, so the outcome is accepted once before the export.

### CONV-LONG-FLAG-PARAMETERS

Severity: info · Export policy: accept

**What the user sees.** Left out of sheet "«sheet»": «names» («rows» rows). These parameters are quality flags, not measurements: no column is made and nothing is written.

**What triggers it.** «file», «sheet»: N parameter name(s) of a long sheet are quality flags («names»); their «rows» row(s) are skipped: no column is made and nothing is written. The converter leaves these rows out because the parameter name reads as a flag, not by the person's answer, so the outcome is accepted once before the export.

### CONV-LONG-RENAMED

Severity: info · Export policy: show

**What the user sees.** Headers renamed in sheet "«sheet»": «names» (N in all). A header must be unique and this one equalled the header of another column, so a number in brackets was added.

**What triggers it.** «file», «sheet»: N parameter column header(s) equalled another header and got a number in brackets: «names».

### CONV-LONG-DROPPED

Severity: info · Export policy: show

**What the user sees.** Left out: columns you marked as describing the measurement, not the sample: «columns» (sheet "«sheet»", N in all). The archive has no place for a value per measurement, so these values are not written.

**What triggers it.** «file», «sheet»: N key column(s) of a long sheet were marked by the user as describing the measurement: «columns». They are not part of the sample key and their values are not written.

### CONV-LONG-KEY-VARIES

Severity: warning · Export policy: accept

**What the user sees.** In sheet "«sheet»", rows with the same station, date and depth differ in «columns» (N such samples), so each difference is read as another sample. If they describe the measurement (comment, analyst, method), mark them above as describing the measurement.

**What triggers it.** «file», «sheet»: rows of a long sheet that share every position and identity column (station, cruise, sample, date, time, depth, pressure, position) differ in «columns», in N sample(s); each combination is read as a separate sample. A column that describes the measurement can be marked as such: it then leaves the sample key and its values are not written. The converter splits these rows into separate samples by default, so the outcome is accepted once before the export.

### CONV-LONG-DUPLICATE

Severity: error · Export policy: block

**What the user sees.** In sheet "«sheet»", one sample has the parameter "«field»" more than once (lines «lines»). The converter does not sum them: tell the samples apart in another column (cast, replicate, depth), or leave the repeated rows out and list them (the first value is written; see the next message).

**What triggers it.** «file», «sheet»:«lines» field «field»: a long sheet has the same sample (the same values in every column but the parameter, unit, value and quality-flag columns) and the same parameter and unit on more than one row. Whatever the values, the rows are never merged or summed, and the export is blocked until the person tells the samples apart or leaves the repeated rows out (CONV-ROW-NOT-UNDERSTOOD, reason repeated-parameter): then the first value of the sample and parameter is written and the later ones are listed.

### CONV-LONG-NO-PARAMETER

Severity: error · Export policy: block

**What the user sees.** In sheet "«sheet»", N rows have a value but an empty parameter column (lines «lines»). The converter cannot tell what was measured: type the parameter name in the sheet, or leave the rows out and list them (see the next message).

**What triggers it.** «file», «sheet»:«lines»: N row(s) of a long sheet have a value and no name in the parameter column; nothing can be named for them, so they are not read and the export is blocked.

### CONV-TURN-HEADER-BLANK

Severity: error · Export policy: block

**What the user sees.** Sheet "«sheet»" is being turned (its samples are the columns), but N columns have values and an empty header: «columns». The header becomes the sample code. Type it in the sheet, or mark the column as "not a sample".

**What triggers it.** «file», «sheet»:«lines»: N column(s) right of the name column hold values and have a blank header («columns»), so no sample code can be made of them. They are not turned and the export is blocked until the header is typed or the column is declared not a sample.

### CONV-TURN-HEADER-REPEATED

Severity: error · Export policy: block

**What the user sees.** Sheet "«sheet»" is being turned (its samples are the columns), but the header "«header»" is on N columns: «columns». A sample code must be one. Rename the headers in the sheet, or mark the extra columns as "not samples".

**What triggers it.** «file», «sheet»:«lines»: the (trimmed) header "«header»" is used by N columns right of the name column («columns»). Nothing chooses between them: none of them is turned and the export is blocked until the headers differ or the extra columns are declared not samples.

### CONV-TURN-NAME-BLANK

Severity: error · Export policy: block

**What the user sees.** In sheet "«sheet»" (turned), N rows have values but nothing in the name column (lines «lines»). No column can be made of them. Type the names, or leave these rows out.

**What triggers it.** «file», «sheet»:«lines»: N source row(s) of a turned sheet hold a value and have no name in the name column, so no column can be made of them. They are listed with the reason turn-no-name and the export is blocked until the names are typed or the rows are left out and listed.

### CONV-TURN-NAME-REPEATED

Severity: error · Export policy: block

**What the user sees.** In sheet "«sheet»" (turned), the row name "«name»" is not unique (lines «lines») or equals a column the turn adds. The converter does not change names. Make the names distinct in the file, or leave these rows out.

**What triggers it.** «file», «sheet»:«lines»: the (trimmed, case-blind) row name "«name»" is used by N source row(s), or is the name of a column the turn adds (Sample, Date). A name is data, so it is never renamed to make it unique: none of those rows is turned. They are listed with the reason turn-name-repeated and the export is blocked until the names differ or the rows are left out and listed.

### CONV-SHEET-TURNED

Severity: info · Export policy: show

**What the user sees.** Sheet "«sheet»" was turned, as you declared: its «rows» rows became columns, and its «samples» sample columns became rows. The cells are unchanged.

**What triggers it.** «file», «sheet»: the person declared that the samples are the columns: «rows» named source row(s) became columns and «samples» sample column(s) became rows. Every cell is the source cell as written; a finding about a turned cell names the line of its row name in the source and, as turnedColumn, the source column of its sample. Information only.

### CONV-DEPTH-UNIT

Severity: error · Export policy: block

**What the user sees.** Depth column "«field»" states the unit "«unit»". Darwin Core needs metres, and the converter converts only fathoms (fm), feet (ft) and km. Give metres or correct the unit of the column in the role table. A depth in sediment (often in cm): choose the meaning "Depth below seafloor".

**What triggers it.** «file», «sheet» field «field»: depth unit "«unit»" is not metres and has no exact factor here; minimumDepthInMeters and maximumDepthInMeters are in metres. Fathom, foot and km are converted (CONV-DEPTH-CONVERTED); a centimetre depth is usually a sediment depth and blocks. A depth below the seafloor in cm or m has its own role (CONV-SEAFLOOR-UNIT, CONV-SEAFLOOR-VALUE).

**Citations.**

- [Darwin Core term list (dwc.tdwg.org/terms: minimumDepthInMeters, maximumDepthInMeters, verbatimDepth)](https://dwc.tdwg.org/terms/#dwc:minimumDepthInMeters), "The lesser depth of a range of depth below the local surface, in meters." / verbatimDepth: "The original description of the depth below the local surface."

### CONV-DEPTH-CONVERTED

Severity: warning · Export policy: accept

**What the user sees.** Depth column "«field»" is in "«unit»", so the converter converted it to metres (1 «symbol» = «factor» m, an exact factor), for example «example». The original is kept in the verbatimDepth column. Check that the unit in the header is right and accept the conversion.

**What triggers it.** «file», «sheet» field «field»: depth in "«unit»" multiplied by the exact factor «factor» (1 «symbol») (decimal arithmetic on the digits of the cell) into minimumDepthInMeters / maximumDepthInMeters; the cell as written, with its unit, is verbatimDepth. Example: «example».

**Citations.**

- [Darwin Core term list (dwc.tdwg.org/terms: minimumDepthInMeters, maximumDepthInMeters, verbatimDepth)](https://dwc.tdwg.org/terms/#dwc:minimumDepthInMeters), "The lesser depth of a range of depth below the local surface, in meters." / verbatimDepth: "The original description of the depth below the local surface."

### CONV-SEAFLOOR-UNIT

Severity: error · Export policy: block

**What the user sees.** Column "«field»" (depth below the seafloor) has the unit: «unit». The converter accepts only centimetres (cm) or metres (m). Set the unit of the column in the role table to cm or m. It converts nothing else.

**What triggers it.** «file», «sheet» field «field»: the unit "«unit»" of a depth-below-seafloor column is not cm or m; nothing was written from the column. Only cm to m (a decimal shift of the text) is converted.

**Citations.**

- [OBIS Manual, "Darwin Core" (manual.obis.org/darwin_core.html; read 2026-10-26) and the Darwin Core term list (dwc.tdwg.org/terms; minimumDistanceAboveSurfaceInMeters)](https://manual.obis.org/darwin_core.html), "This can be especially useful for sediment cores taken from the sea bottom ... In these cases the minimumDistanceAboveSurfaceInMeters / maximumDistanceAboveSurfaceInMeters would be a negative value."

### CONV-SEAFLOOR-VALUE

Severity: error · Export policy: block

**What the user sees.** In column "«field»" (depth below the seafloor) N values in lines «lines» cannot be written: «reason», e.g. "«value»". Those cells were not written.

**What triggers it.** «file»:«lines» field «field»: N depth-below-seafloor value(s) cannot be written (reason «reason», example «value»). Notation: only a plain decimal number (no exponent) is shifted exactly on its text.

**Citations.**

- [OBIS Manual, "Darwin Core" (manual.obis.org/darwin_core.html; read 2026-10-26) and the Darwin Core term list (dwc.tdwg.org/terms; minimumDistanceAboveSurfaceInMeters)](https://manual.obis.org/darwin_core.html), "This can be especially useful for sediment cores taken from the sea bottom ... In these cases the minimumDistanceAboveSurfaceInMeters / maximumDistanceAboveSurfaceInMeters would be a negative value."

### CONV-SEAFLOOR-SIGNS

Severity: warning · Export policy: accept

**What the user sees.** In column "«field»", N numbers have the opposite sign to most of the column (lines «lines»). With the direction "«direction»", such a number is written as a position «side» the seafloor. Check that the direction is the right one.

**What triggers it.** «file», «sheet»:«lines» field «field»: N depth-below-seafloor cell(s) have the sign that most cells do not have. Direction «direction»: they are written as a distance «side» the seafloor (minimumDistanceAboveSurfaceInMeters = maximumDistanceAboveSurfaceInMeters; positive above, negative below). Not blocking: the direction is the user's to confirm. The direction is taken from the majority of signs, a tool default, so the outcome is accepted once before the export.

**Citations.**

- [OBIS Manual, "Darwin Core" (manual.obis.org/darwin_core.html; read 2026-10-26) and the Darwin Core term list (dwc.tdwg.org/terms; minimumDistanceAboveSurfaceInMeters)](https://manual.obis.org/darwin_core.html), "This can be especially useful for sediment cores taken from the sea bottom ... In these cases the minimumDistanceAboveSurfaceInMeters / maximumDistanceAboveSurfaceInMeters would be a negative value."

### CONV-SEAFLOOR-NO-SITE-DEPTH

Severity: warning · Export policy: accept

**What the user sees.** Depth below the seafloor from column "«field»" is in lines «lines» (N in all) without the water depth of the site. Darwin Core then measures from the elevation reference, not from the seafloor. Add the water depth of the site in metres (meaning "Depth").

**What triggers it.** «file», «sheet»:«lines» field «field»: N row(s) have a depth below the seafloor and no minimumDepthInMeters / maximumDepthInMeters. Reference surface of minimumDistanceAboveSurfaceInMeters: "If depth measures are given, the reference surface is the location given by the depth, otherwise ... the elevation" (Darwin Core).

**Citations.**

- [OBIS Manual, "Darwin Core" (manual.obis.org/darwin_core.html; read 2026-10-26) and the Darwin Core term list (dwc.tdwg.org/terms; minimumDistanceAboveSurfaceInMeters)](https://manual.obis.org/darwin_core.html), "This can be especially useful for sediment cores taken from the sea bottom ... In these cases the minimumDistanceAboveSurfaceInMeters / maximumDistanceAboveSurfaceInMeters would be a negative value."
- [PANGAEA Wiki, "Geocode" (page version oldid=17007, last edited 2026-06-11; read 2026-11-02)](https://wiki.pangaea.de/wiki/Geocode), section "Third spatial dimension (Depth/Height) (z)": "DEPTH, sediment/rock \[m\] for geological, geochemistry, biogeochemisty, paleontological, geophysical measurements and samples. Describing the specific sampling depth in the sediment core"; "DEPTH, water \[m\] ... This GEOCODE describes the water depth in which the measurement or sample was collected"

### CONV-NO-OCCURRENCES

Severity: error · Export policy: block

**What the user sees.** This archive would contain no occurrences. OBIS publishes species records, so add a sheet with taxa (names of species with their counts or presence). Environmental data alone is not an OBIS dataset.

**What triggers it.** The conversion produced 0 occurrence records. Every OBIS dataset has at least one occurrence record; an Event core with only profile levels and eMoF rows has none. The Occurrence table is empty, so its DWC-TERM-MISSING findings are not raised.

**Citations.**

- [OBIS Manual, "How to format Occurrence tables" (manual.obis.org/format_occurrence.html; read 2026-10-26)](https://manual.obis.org/format_occurrence.html), "(remember that all OBIS data have at least one occurrence record associated, regardless of what organization structure you have chosen)"

### CONV-PROFILE-NOTHING-READ

Severity: error · Export policy: block

**What the user sees.** Nothing was read from sheet "«sheet»", marked as a profile file: no level («rows» data rows). Such a sheet needs a station column, depth or measured columns, and rows with values. If it only describes columns, or has no measurements, do not mark it as a profile file.

**What triggers it.** «file», «sheet»: the sheet was marked as a profile file and produced 0 profile levels («rows» data rows).

### CONV-STATION-FROM-POSITION

Severity: info · Export policy: show

**What the user sees.** In sheet "«sheet»" each distinct position (latitude and longitude as written) is a station, as you chose: N stations, e.g. "«value»". A station ID is made of the cruise code and the position.

**What triggers it.** «file», «sheet»: the sheet has no station column and the user ticked "each distinct position is a station": N station(s), first "«value»" (cruise:latitude_longitude, as written).

### CONV-EFFORT-INVALID

Severity: error · Export policy: block

**What the user sees.** Column "«field»" (sample size) has no positive number in lines «lines» (N in all), e.g. "«value»". The sample size cannot be written without one.

**What triggers it.** «file», «sheet»:«lines» field «field»: N effort cell(s) are empty, zero or not a number (example "«value»"); sampleSizeValue needs a positive number.

### CONV-EFFORT-VALUE-INVALID

Severity: error · Export policy: block

**What the user sees.** The sample size you typed, "«value»", cannot be used: «reason». Type a number above zero, with a point or a comma as the decimal mark.

**What triggers it.** «file», «sheet»: the typed sample size "«value»" is not accepted («reason»); it must be a number above zero with at most one decimal mark (point or comma). No effort is written.

### CONV-NO-TAXON

Severity: error · Export policy: block

**What the user sees.** No taxon column is marked in this sheet. The converter needs a taxon (column headers with counts in a wide sheet, a taxon column in a long one) and a quantity (counts, density or biomass).

**What triggers it.** «file», «sheet»: no column with the taxon role for a «shape» sheet (wide: taxon columns with header:true; long: a taxon column and a quantity column). A long sheet that has a taxon column but no quantity column is CONV-SPECIES-LIST-NO-COUNTS or CONV-TAXON-NO-QUANTITY instead.

### CONV-SPECIES-LIST-NO-COUNTS

Severity: error · Export policy: block

**What the user sees.** This sheet lists species without counts. If it is a list of species found (presence only, nothing counted), tick "This is a list of species found (presence only, no counts)" for the sheet. Otherwise add a column with counts, density or biomass and say what the numbers are.

**What triggers it.** «file», «sheet»: a long sheet has a taxon column and no quantity column (a presence-only species list). Nothing is written until the user either ticks "This is a list of species found" for the sheet (presenceOnly: one occurrence per taxon row, occurrenceStatus present, no organismQuantity and no organismQuantityType) or adds a quantity column and declares it. This one finding replaces CONV-NO-TAXON, CONV-QUANTITY-UNDECLARED and CONV-NO-OCCURRENCES for the sheet.

**Citations.**

- [OBIS Manual, "How to format Occurrence tables" (manual.obis.org/format_occurrence.html; read 2026-10-29): occurrenceStatus is required, a quantity is not](https://manual.obis.org/format_occurrence.html), "These required data fields include the following eight terms: occurrenceID, eventID, ..., occurrenceStatus, basisOfRecord, scientificName, ..." (organismQuantity and organismQuantityType are not among them); "Add and fill basisOfRecord and occurrenceStatus fields"

### CONV-PRESENCE-VALUE

Severity: error · Export policy: block

**What the user sees.** Column "«field»" holds «value» in lines «lines», but in a list of species found a cell is a mark (x, +, ✓, 1, yes) or empty. The value is not guessed. If these are counts, untick "This is a list of species found" and say what the numbers are; otherwise correct them.

**What triggers it.** «file», «sheet»:«lines» field «field»: in a sheet ticked as a presence-only species list, a wide cell is read as a mark: present (x X + \* ✓ ✔ 1 yes y tak ja oui present obecny vorhanden présent), absent (0 - absent nieobecny abwesend no nie nein non; an absence only with the full-species-list tick, else nothing is written) or empty. Any other value («value»: a number above 1, a negative number, other text) is not guessed; the sheet is not converted until it is corrected or the tick is removed.

**Citations.**

- [OBIS Manual, "How to format Occurrence tables" (manual.obis.org/format_occurrence.html; read 2026-10-29): occurrenceStatus is required, a quantity is not](https://manual.obis.org/format_occurrence.html), "These required data fields include the following eight terms: occurrenceID, eventID, ..., occurrenceStatus, basisOfRecord, scientificName, ..." (organismQuantity and organismQuantityType are not among them); "Add and fill basisOfRecord and occurrenceStatus fields"

### CONV-TAXON-NO-QUANTITY

Severity: error · Export policy: block

**What the user sees.** The taxon column is marked in this sheet, but there is no quantity column. Mark the column with counts, density or biomass, or add one; the converter does not write presence-only lists yet.

**What triggers it.** «file», «sheet»: a long sheet has a taxon column and other numeric or measured-variable columns, but no quantity column. Presence-only lists are not written yet; the sheet is not converted. This one finding replaces CONV-NO-TAXON, CONV-QUANTITY-UNDECLARED and CONV-NO-OCCURRENCES for the sheet. A sheet with a taxon column and no numbers at all is CONV-SPECIES-LIST-NO-COUNTS.

### CONV-ENV-ONLY-SHEET

Severity: error · Export policy: block

**What the user sees.** No taxon or count column is marked in this sheet, and its other columns are measured variables. OBIS needs species records. If a column holds species names, mark it as the taxon; otherwise add a sheet with species, or check this file with /check for other repositories.

**What triggers it.** «file», «sheet»: the sheet has measured-variable columns and no taxon column, no quantity column and no unconfirmed taxon candidate (typically environmental data only; a column of species names the converter did not recognise is the other possibility, and the text says so). This one finding replaces CONV-NO-TAXON, CONV-QUANTITY-UNDECLARED and CONV-NO-OCCURRENCES for the sheet; a sheet with a taxon column is CONV-SPECIES-LIST-NO-COUNTS, CONV-TAXON-NO-QUANTITY or normal, and a sheet marked as a profile file keeps CONV-NO-OCCURRENCES.

### CONV-SUMMARY-ROW-UNDECIDED

Severity: warning · Export policy: block

**What the user sees.** N rows («value») in lines «lines» read like a total or a statistic, not a sample. Leave them out (summary rows), or keep them (a real station or sample). The export waits for the answer.

**What triggers it.** «file», «sheet»:«lines»: N of the «held» row(s) the sheet holds back («value») whose sample code or station is exactly a total word (total, suma, razem, summe, gesamt, somme), or whose label is a statistic (mean, average, median, sd, sum, ... ; summaryLabels.ts) in a block of two or more label rows with no date or position of its own, are held back: nothing is written for them and each is in the list of rows not written with the reason summary-undecided. The export is blocked until the person answers for the sheet "leave them out (summary rows)" or "keep (a real station or sample)"; a station really named Somme or Total is a real station, which only the person can say. The answer holds for this number of rows; a different number asks again. A lone short ambiguous label (n, se, cv, min, max, count) is not asked: it is CONV-SUMMARY-ROW-KEPT.

### CONV-SUMMARY-ROW-SKIPPED

Severity: info · Export policy: show

**What the user sees.** As you chose, N rows («value») in lines «lines» were left out as summary rows. They are not samples; they are in the list of rows not written. "Ask again" takes the answer back.

**Sentence added when the finding has the parameter fromFile.** This answer was read from the companion file.

**What triggers it.** «file», «sheet»:«lines»: N of the «held» row(s) the sheet holds back, whose sample code or station reads as a summary label («value»), were answered "«answer»" (CONV-SUMMARY-ROW-UNDECIDED asked). leave-out: they are not converted and each is in the list of rows not written with the reason summary-row. keep: they are real stations or samples and are read like any other row (CONV-SUMMARY-ROW-SKIPPED:keep). The answer holds for this number of rows only. A total word (total, suma, razem, summe, gesamt, somme) as the whole cell, and a statistics label (mean, average, median, sd, sum, ... and their pl / de / fr words; one definition with /check, summaryLabels.ts) in a block of two or more label rows, are asked; the short ambiguous ones (n, se, cv, min, max, count) alone are CONV-SUMMARY-ROW-KEPT.

### CONV-SUMMARY-ROW-KEPT

Severity: warning · Export policy: accept

**What the user sees.** N rows («value») in lines «lines» look like statistics but are not in a summary block, so they were kept. If they are not real samples, correct the sheet and load it again; otherwise confirm.

**What triggers it.** «file», «sheet»:«lines»: N row(s) whose sample code or station is a statistics label («value»), with no date and no position of its own, but a short ambiguous label (n, se, cv, min, max, count; a compass point such as N is one) standing alone, not in a block of two or more label rows: converted as a sample (a station really named Max or N stays a station) and said, to accept.

### CONV-ID-REVISIT

Severity: warning · Export policy: accept

**What the user sees.** N sample codes are used for more than one visit of a station (for example «value»). Each visit is its own event, and its ID holds the «by». Check that the rows really are different visits and not a mistyped value.

**What triggers it.** «file», «sheet»:«lines»: N sample code(s) repeat at ONE station on rows that differ in «by» (the fewest of date, time, depth that tell them apart; a long sheet never uses depth). Each visit is its own sample with the ID \<station eventID\>:\<date\>\[T\<time\>\]\[:\<depth\>m\]:\<code\> (example «value»), the shape of the profile levels; the other IDs are unchanged. Rows identical in all of these stay a real duplicate (CONV-ID-DUPLICATE). The same code at another station is not a revisit (use the station prefix). To accept: the ID is made of the data.

### CONV-REPLICATE-MISSING

Severity: error · Export policy: block

**What the user sees.** N rows have no value in the replicate column "«field»" (lines «lines»). Every row belongs to a replicate of its sample: fill the column, or give it another role (for example "Ignore") if it does not number replicates.

**What triggers it.** «file», «sheet»:«lines» field «field»: N row(s) of a sheet with a column in the role replicate / sub-sample have no value in it. The rows are not converted: a replicate event is \<sample eventID\>:\<value\>, and a row without a value would have the ID of the sample itself.

### CONV-BIOMASS-KIND-UNSET

Severity: warning · Export policy: accept

**What the user sees.** N values of «columns» were written as biomass with no measurementTypeID: wet mass, dry mass and ash-free dry mass each have a different NERC concept and the kind is not known. Pick it in the role list of the column, or accept that no identifier is written.

**What triggers it.** «file», «sheet»:«lines» field «field»: N eMoF row(s) of the biomass / weight column(s) «columns» have measurementType "biomass" and no measurementTypeID, because the kind of mass is not known (the header names none and the user has not chosen). The kinds map to different NERC S06 concepts: wet weight biomass S0600088, dry weight biomass S0600087, ash-free dry weight biomass S0600086 (the P01 biomass concepts are all per unit area or volume). There is no default.

### CONV-EML-MISSING

Severity: error · Export policy: block

**What the user sees.** The dataset description is incomplete or not usable: «fields». The archive needs these (title, abstract, creators, contact, institution code, dataset name); fill them in on the form.

**What triggers it.** Dataset description (eml.xml, and the datasetName and institutionCode columns of event.txt) is missing or unusable: «fields». BioCheck reports an Event table without datasetName and institutionCode as an error (docs/research/qc-sources.md, research notes, Item 2); OBIS asks for title, citation, contact and abstract (manual.obis.org/eml.html).

### CONV-LICENCE-UNSET

Severity: error · Export policy: block

**What the user sees.** No licence is chosen. Pick one of the three (CC0, CC-BY, CC-BY-NC); the rights holder decides, and the tool assumes nothing.

**What triggers it.** No licence was chosen. The EML intellectualRights element is written only from an explicit choice of CC0-1.0, CC-BY-4.0 or CC-BY-NC-4.0 (the set the IPT supports); nothing is defaulted.

### CONV-BASIS-UNSET

Severity: error · Export policy: block

**What the user sees.** The kind of record (basisOfRecord) is not chosen, e.g. human observation, preserved specimen or material sample. It depends on what was actually collected, so there is no default.

**What triggers it.** basisOfRecord was not chosen. It is written on every occurrence row and must be a value of the Darwin Core vocabulary; there is no default because HumanObservation, PreservedSpecimen and MaterialSample mean different things about what was collected.

### CONV-EMOF-ORPHAN

Severity: error · Export policy: block

**What the user sees.** N measurement rows refer to «kind» (e.g. "«value»") that is not in the table. A measurement without its event or occurrence would be rejected.

**What triggers it.** «file»: N eMoF row(s) name an «kind» id that is not in the «kind» table (example "«value»"). BioCheck: an eMoF eventID that is not in the core, or an eMoF occurrenceID that is not in Occurrence, is an error (docs/research/qc-sources.md, Item 2).

### CONV-EMOF-EVENT-MISMATCH

Severity: error · Export policy: block

**What the user sees.** N measurements belong to a different event than its occurrence (e.g. "«value»"). A measurement of an occurrence must sit in that occurrence's event.

**What triggers it.** «file»: N eMoF row(s) have an eventID different from the eventID of the occurrence they name (example occurrenceID "«value»"). BioCheck reports this as an error (docs/research/qc-sources.md, Item 2).

### CONV-EMOF-VALUE-EMPTY

Severity: error · Export policy: block

**What the user sees.** N measurement rows have no value (measurementValue). A measurement without a value says nothing, and the archive would be rejected.

**What triggers it.** «file»:«lines»: N eMoF row(s) have an empty measurementValue. BioCheck: a NULL measurementValue is an error (docs/research/qc-sources.md, Item 2).

### CONV-EMOF-TYPE-EMPTY

Severity: error · Export policy: block

**What the user sees.** N measurement rows have no kind of measurement (measurementType), so it is not known what was measured. Declare what the numbers in the sheet mean.

**What triggers it.** «file»:«lines»: N eMoF row(s) have an empty measurementType. The type text is the preferred label of the NERC concept, or the declared meaning when no concept is verified.

### CONV-COLUMN-NOT-EXPORTED

Severity: warning · Export policy: accept

**What the user sees.** Not written to the archive: N columns: «columns». Reason: a meaning that is not written here (e.g. a pressure outside a profile file), no header (shown as \[letter\]) or a second quantity column. Accept this to export without them.

**What triggers it.** «file», «sheet»: N column(s) with a role other than ignore that this conversion does not read as the sheet is set up («columns»): a pressure of a sheet that is not a profile file (a measured variable is written as an eMoF row on the sample event, or on the level event of a profile sheet, where the first pressure column is written as well), a second column of a role that is read once, a role of the other shape (a life stage, qualifier, occurrenceID, taxon ID or quantity column in a wide sheet, a taxon header column in a long one), the quantity type, or a sample-size column when the sample size is not set to a column; and two kinds of column with the role ignore that hold data and that the person did not set: a column with an empty header (shown as its letter in brackets; one the person set to ignore is named by CONV-COLUMN-IGNORED instead) and a second quantity column (a count next to a biomass). Nothing from them is written. The warning has to be accepted before the export.

### CONV-COLUMN-IGNORED

Severity: info · Export policy: show

**What the user sees.** N columns hold values and you set them to be ignored, so they are not in the archive: «columns». Your file is not changed. If one of them carries data the archive should have, give it a meaning.

**What triggers it.** «file», «sheet»: N column(s) that hold at least one value and that the person set to ignore (the role ignore where the converter proposed another, or an empty-header column the person set to ignore, shown as its letter in brackets), so none of their cells is written: «columns». A column the converter proposed as ignore and the person left is named by CONV-COLUMN-IGNORED-PROPOSED instead. This finding only names the person's own choice, it blocks nothing and needs no acceptance. The file is not changed.

### CONV-COLUMN-IGNORED-PROPOSED

Severity: info · Export policy: accept

**What the user sees.** N columns hold data and were proposed as "ignore" by the converter, so nothing of them is written: «columns». Give them a meaning, or accept this once.

**What triggers it.** «file», «sheet»: N column(s) that hold at least one value and have the role ignore because the converter proposed it (for example a Cast, Layer or Replicate column that does not separate rows) and the person did not change it, so none of their cells is written: «columns». A column the person set to ignore is named by CONV-COLUMN-IGNORED. The outcome follows from a tool default, not from the person's answer, so it is accepted once before the export; give the column a meaning, or accept this once. A column with an empty header, a second quantity column and a column with another role that is not read are named by CONV-COLUMN-NOT-EXPORTED. The file is not changed.

### CONV-COLUMN-YEAR-IGNORED

Severity: info · Export policy: accept

**What the user sees.** Looks like a year beside the date: on every row it is the year of that row's date. Not written as a measurement, N columns: «columns». If one is a measurement, give it that role back with one click; if it is the sampling year of rows without a date, give it the meaning date.

**What triggers it.** «file», «sheet»: N numeric column(s) that the proposer would have read as a measured variable (a name no vocabulary knows, no unit, no code) hold whole years from 1800 to 2100 that equal the year of the date of the same row, on every row where both are filled (at least 3 such rows, the first 500 rows of the sheet are read), and the sheet has a date or date-time column that matches: «columns». They are proposed as ignore (low confidence) and named here and not again by CONV-COLUMN-IGNORED-PROPOSED; no other role is assigned. The page gives the measurement role back with one click; a column the person has set is not listed. Nothing is written in the archive for them. The file is not changed. The ignore is the converter's proposal, not the person's answer, so it is accepted once before the export.

### CONV-COLUMN-NUMBER-IGNORED

Severity: warning · Export policy: accept

**What the user sees.** Whole numbers of six or more digits that rise (or fall) from row to row, or stay the same within a sample and rise (or fall) from sample to sample, never repeating. Not written as a measurement, N columns: «columns». If one is a measurement, give it that role back with one click; otherwise accept once.

**Sentence added when the finding has the parameter dates.** If these are dates, give the columns the meaning date in the column table: «dates».

**What triggers it.** «file», «sheet»: N numeric column(s) that the proposer would have read as a measured variable (a name no vocabulary knows, no unit, no code) hold only whole numbers of six or more digits (at least 3 filled cells, the first 500 rows are read) that are all different and strictly rise, or all strictly fall, in row order, or that are equal only between rows of one sample, each sample holding one value that no other sample holds, the samples' values strictly rising or strictly falling in the order the samples first appear (a sample number written on every taxon row); not on a long sheet with a taxon column and no quantity or biomass column, where the number column may be the counts. Columns whose every value reads as a date written YYYYMMDD get a hint (the optional param dates, N of them; only on a sheet with no date column) to give them the meaning date; nothing is assigned. Columns: «columns». They are proposed as ignore (low confidence) and named here and not again by CONV-COLUMN-IGNORED-PROPOSED; no other role is assigned. The page gives the measurement role back with one click; a column the person has set is not listed. Nothing is written in the archive for them. The file is not changed.

### CONV-NAMEID-MISSING

Severity: warning · Export policy: accept

**What the user sees.** N occurrences have no scientificNameID, and BioCheck and OBIS report that as an error. In a wide sheet the IDs now come from the WoRMS lookup (an option on this page, off by default); a long sheet can mark a column holding them. Names with a confirmed ID are not counted.

**What triggers it.** «file»: N occurrence(s) have no scientificNameID. BioCheck lists scientificNameID among the required fields of a leaf event (docs/research/qc-sources.md, Item 2). It is written only from a column the user marked (a scientificNameID column as given, a WoRMS AphiaID column as urn:lsid:marinespecies.org:taxname:\<id\>) or from a WoRMS result the user pressed the lookup button for and confirmed (an exact single match, or the result the user chose); nothing is guessed.

### CONV-WORMS-UNDECIDED

Severity: error · Export policy: block

**What the user sees.** N names from the WoRMS lookup are waiting for your choice: «names». For each one, choose one of the results or "no ID"; nothing uncertain is accepted automatically.

**What triggers it.** N name(s) looked up in WoRMS have a result that is not a single exact match under the name sent (a phonetic or near match, a genus-only match, an exact match under another name, several results, or a deleted record) and the user has not chosen one of the results or "no ID" yet (first: "«value»"). Only exactly one result with match_type exact and the name sent is automatic. The export is blocked until every such name is decided. Names: «names».

**Citations.**

- [OBIS Manual, "Match Taxonomic Names" (manual.obis.org/name_matching.html; read 2026-10-25)](https://manual.obis.org/name_matching.html), "WoRMS also identifies ambiguous matches, indicating that several potential matching options are available (e.g. homonyms). You can check these ambiguous matches and select the correct one"

### CONV-WORMS-NO-MATCH

Severity: warning · Export policy: accept

**What the user sees.** WoRMS has no result for N names: «names». Their scientificNameID stays empty; OBIS and BioCheck report that as missing. Check the spelling, or write to WoRMS if the taxon is new.

**What triggers it.** N name(s) came back from AphiaRecordsByMatchNames with no record (an empty array for the name, or HTTP 204 for a whole batch), e.g. "«value»". scientificNameID is left empty for them. The OBIS Manual asks to contact WoRMS for a taxon that is not registered. Names: «names».

**Citations.**

- [OBIS Manual, "Match Taxonomic Names" (manual.obis.org/name_matching.html; read 2026-10-25)](https://manual.obis.org/name_matching.html), "WoRMS also identifies ambiguous matches, indicating that several potential matching options are available (e.g. homonyms). You can check these ambiguous matches and select the correct one"

### CONV-WORMS-NOT-MARINE

Severity: warning · Export policy: accept

**What the user sees.** WoRMS marks N confirmed names as freshwater or terrestrial only, not marine or brackish: «names». Check that these are the right taxa; the ID is written as confirmed.

**What triggers it.** N confirmed name(s) have a WoRMS record with isMarine and isBrackish not set and isFreshwater or isTerrestrial set, e.g. "«value»". The ID is written as confirmed; a record with no habitat flag at all is unknown, not "not marine". Names: «names».

### CONV-NAMEID-INCOMPLETE

Severity: warning · Export policy: accept

**What the user sees.** The sheet gives a taxon ID for some rows of N names but not for others: «names». The rows without one stay without an ID, and the name is not looked up in WoRMS. Complete the sheet, or accept this.

**What triggers it.** N name(s) have a taxon ID from the sheet on some rows and none on others (first "«value»"): «names». Rows with an ID keep it; the others get no ID. A name with a sheet ID on any row is never sent to WoRMS and never given a WoRMS ID.

### CONV-NAMEID-CONFLICT

Severity: warning · Export policy: accept

**What the user sees.** The sheet gives N names more than one taxon ID: «names». Each row keeps the ID it has. Check that these are different taxa that share a name; if not, correct the sheet. Accept this to export as it is.

**What triggers it.** N name(s) have more than one distinct scientificNameID in the sheet (first "«value»"): «names». Nothing is changed: each row keeps its own ID (two taxa can share a name, e.g. homonyms), and the warning has to be accepted.

### CONV-NO-SAMPLING-DESCRIPTOR

Severity: warning · Export policy: accept

**What the user sees.** The archive's measurement table has no sampling descriptor or effort (a sample size or a mesh size). BioCheck will report "No sampling descriptors/effort present". Give the sample size or the mesh size if you know it, or accept the warning.

**What triggers it.** The archive writes an extendedmeasurementorfact.txt and no row of it has a measurementTypeID containing a code of BioCheck's BODCeffort list (R/checkdataset.R, grepl over BODCeffort; the list holds VOLWBSMP, AREABEDS and MSHSIZE1, which this tool writes for a sample size and a mesh size, among 26 others). BioCheck runs this check only when the archive has an eMoF table (R/checkdataset.R, inside the block that starts at line 457 (if exists eMoF)), so it is raised only then.

**Citations.**

- [EMODnet Biocheck (R), R/checkdataset.R lines 562-566 and data/BODCeffort (master 701e6e7, 2026-10-08)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/R/checkdataset.R), if (sum(grepl(paste(BODCeffort, collapse="|"), unique(eMoF$measurementTypeID))) == 0) -\> level "warning", field "measurementType", message "No sampling descriptors/effort present"

### CONV-DEVICE-MISSING

Severity: warning · Export policy: accept

**What the user sees.** No sampling device is given for this sheet. BioCheck reports "No sampling instrument present" for an archive with no measurement of the name of the sampling instrument. Choose the device in the sheet's form, or accept that it is missing.

**What triggers it.** «file», «sheet»: no sampling device was chosen, so no eMoF row NMSPINST (Name of sampling instrument) is written for the samples. BioCheck warns "No sampling instrument present" (docs/research/qc-sources.md, Item 2).

### CONV-MESH-INVALID

Severity: error · Export policy: block

**What the user sees.** The mesh size "«value»" cannot be used: «reason». Type the size in micrometres as a plain number, or leave it empty.

**What triggers it.** «file», «sheet»: the typed mesh size "«value»" is refused («reason»). It is written as MSHSIZE1 with the unit um (P06 UMIC) only when it is a plain number above zero.

### CONV-NAMEID-APHIA-LIKE

Severity: warning · Export policy: accept

**What the user sees.** Column "«column»" holds only whole numbers and was marked as the taxon ID by hand, but its header is not AphiaID. They look like WoRMS AphiaIDs; they are written as they are. Rename the header to AphiaID to have them written as WoRMS LSIDs.

**What triggers it.** «file», «sheet»: column «column» was given the taxon ID role by hand; every filled cell is a positive whole number but the header is none of AphiaID, aphia_id, Aphia ID, so the values are written to scientificNameID as given, not as the urn:lsid of a WoRMS taxon.

### CONV-LICENCE-DIFFERS

Severity: warning · Export policy: accept

**What the user sees.** The licence chosen («chosen») differs from the one your metadata states («source»). The rights holder decides which licence applies; accept this only if the rights holder has decided it.

**What triggers it.** «file»: the chosen licence «chosen» is not among the licence(s) recognised in the dropped metadata files («source»). The archive would carry a licence different from its source's, so the user has to acknowledge it.

### CONV-PROFILE-STATION-UNMATCHED

Severity: warning · Export policy: accept

**What the user sees.** N profile stations match no station of your biology sheets (the station text, and the cruise when given, must be identical): «names». Each becomes a station event of its own. Accept this if no biology was sampled there, or correct the spelling.

**What triggers it.** «file», «sheet»: N station(s) of the profile sheet match no station of the biology sheets («names»). The match is exact on the trimmed station text and the cruise when the sheet gives one; nothing is matched approximately. Each of these stations became its own station event, with its levels as children and a date, position and depth range derived from them. The warning has to be accepted before the export.

### CONV-PROFILE-STATION-FAR

Severity: warning · Export policy: accept

**What the user sees.** N matched profile stations lie more than «limit» km from the biology station: «names». Two samplings at one station are close together, so check that it is the same station. Accept this if it is, or correct the match.

**What triggers it.** «file», «sheet»: N profile station(s) matched to a biology station lie more than «limit» km from it (great-circle distance, haversine): «names». The position of a profile station is that of its first level that has one, the position of a biology station that of its first sample that has one. The warning has to be accepted before the export.

### CONV-PROFILE-STATION-CAST-MATCHED

Severity: info · Export policy: show

**What the user sees.** N profile stations were matched to a biology station by ignoring the cast number at the end, as you allowed: «names». Check that each pair is one station.

**What triggers it.** «file», «sheet»: N profile station(s) matched to a biology station with the trailing cast number ignored (ticked for this sheet): «names». Each pair is "profile station \<-\> biology station". Nothing needs to be accepted; a pair farther apart than the limit of CONV-PROFILE-STATION-FAR also raises that warning.

### CONV-PANGAEA-NAMES-FALLBACK

Severity: info · Export policy: show

**What the user sees.** The parameter list in the header of the PANGAEA file does not fit its columns, so the abbreviations of the table header are used as the taxon names. An abbreviation can stand for two different taxa, so check the names in the list below.

**What triggers it.** «file», «sheet»: the Parameter(s) block of the PANGAEA header was not matched to the table columns (another number of columns, or an abbreviation that is not what the column header starts with), so the long names are not used and the table-header abbreviations are the taxon names.

### CONV-PROFILE-LEVEL-INCOMPLETE

Severity: error · Export policy: block

**What the user sees.** N profile levels have no «what», and neither has its station (lines «lines»). OBIS and BioCheck need a date and a position for every event without children. Add a date or position column to the sheet, or add this station to the biology sheets.

**What triggers it.** «file», «sheet»:«lines»: N profile level(s) have no «what» of their own and their parent event (the station) has none to give. With the station level flattened away the parent is the cruise, and a level never takes them from it. BioCheck requires eventDate, decimalLatitude and decimalLongitude on every event without children, after a child has taken what its parent gives (obistools flatten_event, check_fields). A level never takes them from further up (the whole cruise's range for one cast), and nothing is copied from another station.

### CONV-PROFILE-PRESSURE-NO-UNIT

Severity: warning · Export policy: accept

**What the user sees.** The pressure column "«column»" states no unit, so its values are written without one. Give the column a unit, for example dbar in its name or in the unit field above, so that the unit and its identifier can be written; or accept this to export without a unit.

**What triggers it.** «file», «sheet»: the pressure column «column» has no unit, so its measurement rows carry no measurementUnit and no measurementUnitID, and level IDs cannot be made of it (they need decibars). The warning has to be accepted before the export.

### CONV-POSITION-NONE

Severity: error · Export policy: block

**What the user sees.** No column of sheet "«sheet»" is marked as latitude / longitude, and no joined sheet gives a position (N samples). Mark the latitude and longitude columns, join the sheet that describes the samples, or declare one position for the sheet.

**What triggers it.** «file», «sheet»: N sample event(s) have no latitude / longitude on themselves or on a parent, and the sheet has no column mapped as latitude or longitude (a mapped column that is blank in every row is the :empty-column variant). The output table's empty decimalLatitude / decimalLongitude column is not repeated.

### CONV-POSITION-DECLARED

Severity: warning · Export policy: accept

**What the user sees.** The position «lat», «lon» (uncertainty «uncertainty» m) was declared by you for the whole sheet "«sheet»" and is written on N samples; the file does not state it. The archive says so in georeferenceRemarks.

**Sentence added when the finding has the parameter fromFile.** This position was read from the companion file, not from the data file; it is written for the whole sheet because the sheet still has no position column.

**What triggers it.** «file», «sheet»: the person declared one position for the sheet (decimalLatitude «lat», decimalLongitude «lon», coordinateUncertaintyInMeters «uncertainty»); it is written on N sample event(s), with georeferenceRemarks saying it was declared for all samples of this sheet by the person converting the data (a station or cruise derived in part from such positions says so in its own remark). Never inferred; applied only to a sheet with no latitude / longitude role. A warning to accept.

### CONV-POSITION-DECLARED-INVALID

Severity: error · Export policy: block

**What the user sees.** The position declared for sheet "«sheet»" cannot be used: «reason». Nothing was written from it.

**What triggers it.** «file», «sheet»: the declared position is refused («reason») and nothing is applied. latitude = not a number within -90 to 90; longitude = not a number within -180 to 180; uncertainty = not a plain number above zero; position-role = the sheet has a latitude or longitude column (even a blank one), and a declaration never fills gaps; position-joined = the joined description sheet gives the positions; profile = a profile sheet takes positions from its own columns. CONV-POSITION-NONE is not repeated.

### CONV-DATE-DECLARED

Severity: warning · Export policy: accept

**What the user sees.** The date «value» was declared by you for the whole sheet "«sheet»" and is written on N samples; the file does not state it. The archive says so in eventRemarks and in the methods.

**Sentence added when the finding has the parameter long.** This period is longer than a year: every sample is written with the whole period, not with the day it was taken.

**Sentence added when the finding has the parameter fromFile.** This date was read from the companion file, not from the data file; it is written because no sample of the sheet has a date.

**What triggers it.** «file», «sheet»: the person declared one date or interval («value», ISO 8601) for every sample of the sheet; it is written as eventDate on N sample event(s), with eventRemarks saying it was declared for all samples of this sheet and not stated in the source file, and one line in the EML methods (a station or cruise whose date is derived from such dates says so in its own remark). Never inferred; applied only to a sheet on which no sample has a date. long = an interval over one year. A warning to accept.

### CONV-DATE-DECLARED-HELD

Severity: warning · Export policy: accept

**What the user sees.** The date «value» saved in the companion file for sheet "«sheet»" was not applied: «reason». Nothing was written from it. You can undo it in the sheet's form.

**What triggers it.** «file», «sheet»: the declared date "«value»" came from the companion file and no longer fits the sheet («reason»); it is not applied and does not block. some-dated = a sample of the sheet now has a date or a date cell holds something; date-joined = the joined description sheet gives the dates; date-turned = a turned sheet's dates are in its source rows or columns; profile = a profile sheet takes dates from its own columns. A warning to accept.

### CONV-DATE-DECLARED-INVALID

Severity: error · Export policy: block

**What the user sees.** The date declared for sheet "«sheet»" («value») cannot be used: «reason». Nothing was written from it.

**What triggers it.** «file», «sheet»: the declared date "«value»" is refused («reason») and nothing is applied. format = not YYYY, YYYY-MM, YYYY-MM-DD or two of them joined by a slash; order = the interval ends before it starts; future = later than today; some-dated = a sample of the sheet has a date or a date cell holds something, and a declaration never fills gaps; date-joined = the joined description sheet gives the dates; date-turned = a turned sheet's dates are in its source rows or columns; profile = a profile sheet takes dates from its own columns. CONV-EVENT-DATE-MISSING keeps its own answer.

### CONV-EVENT-DATE-MISSING

Severity: error · Export policy: block

**What the user sees.** N samples of sheet "«sheet»" have no date: the date cells are empty. Fill them in, or leave these samples out and list them.

**What triggers it.** «file», «sheet»: N sample event(s) have no eventDate (OBIS requires one), on «rows» source line(s). how=«how»: blank-cells = a date column exists and these samples' cells are empty (they can be left out and listed with the reason no-event-date); no-date-role = nothing on the sheet is marked as a date. A station never gives its date to a sample; a replicate takes the date of its sample. The Event table's META-NO-DATES / ROW-DATE-MISSING are not repeated.

### CONV-PROFILE-NO-STATION

Severity: error · Export policy: block

**What the user sees.** N profile rows have no station (lines «lines»). A profile level is placed under its station, so every row needs one. Map the station column, tick "Each distinct position is a station", or fill in the empty cells.

**What triggers it.** «file», «sheet»:«lines»: N profile row(s) hold data but no station text (station column: «column»). A level event needs its station as its parent, so these rows were not converted.

## Across files and chemistry

### XF-DUPLICATE-SAMPLES

Severity: info · Export policy: show

**What the user sees.** The files «fileA» and «fileB» have N samples in common. Make sure they are not counted twice.

**What triggers it.** «fileA» and «fileB»: N matched samples (same station or position, same depth, same day).

### XF-DATE-CONFLICT

Severity: warning · Export policy: show

**What the user sees.** Station «station» has the same values in «fileA» and «fileB» but different dates («dateA» and «dateB»). One of the dates is probably wrong.

**Sentence added when the finding has the parameter ambiguous.** One of them is a two-digit-year date of a column whose order is open; it was read in the default order, so the conflict may come from the reading.

**What triggers it.** station «station»: «fileA»:«lineA» dated «dateA» vs «fileB»:«lineB» dated «dateB»; at least 2 shared variables are equal. When one of the dates is a two-digit-year date of a column whose order is open (ROW-DATE-YY-AMBIGUOUS), it was read in the default order and the text says so (optional param ambiguous = yes).

### XF-STATION-ALIAS

Severity: info · Export policy: show

**What the user sees.** "«nameA»" and "«nameB»" look like the same station written in two ways. Use one name everywhere.

**What triggers it.** «file»: station ids '«nameA»' and '«nameB»' are equal after normalisation (last '/' segment, upper case, spaces removed).

### XF-UNIT-CONFLICT

Severity: warning · Export policy: show

**What the user sees.** «variable» has the same numbers in «fileA» and «fileB», but one says «unitA» and the other «unitB». These are not the same unit; correct the wrong label.

**What triggers it.** «variable»: «equal» of «matched» matched samples have equal values, but the units differ in dimension: '«unitA»' («fileA») vs '«unitB»' («fileB»).

**Citations.**

- [Lauvset et al. (2024), GLODAPv2.2023, Earth System Science Data 16, 2047](https://essd.copernicus.org/articles/16/2047/2024/), section 3.1 (per-litre to per-kilogram conversion with seawater density)
- [Fofonoff & Millard (1983), UNESCO Technical Papers in Marine Science 44 (GitHub-hosted copy)](https://raw.github.com/ocefpaf/python-seawater/master/docs/UNESCO-TechPaper44_eo.pdf), PDF p.23, check values of seawater density

### XF-POSITION-SWAP

Severity: warning · Export policy: show

**What the user sees.** The positions of stations «stationA» and «stationB» are exchanged between «fileA» and «fileB». One of the files probably has the station names mixed up.

**What triggers it.** stations «stationA» and «stationB»: positions exchanged between «fileA» and «fileB».

### XF-POSITION-CONFLICT

Severity: warning · Export policy: show

**What the user sees.** Station «station» is at a different position in «files» than in the other files («positions»). Check which coordinates are correct.

**What triggers it.** station «station»: position in «files» lies outside the range seen in the other dataset(s): «positions».

### CHEM-UNIT-PAIR

Severity: warning · Export policy: show

**What the user sees.** «variable» is given in two units («unitA» and «unitB»), but after conversion the two columns do not agree. One of them is wrong.

**What triggers it.** «file»:«lines» «variable»: «unitA» vs «unitB» inconsistent after conversion with molar masses C 12.011, N 14.007, P 30.974, Si 28.085 g/mol (e.g. «value»).

**Thresholds.**

- molarMass.C = 12.011 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "6 C carbon 12.011 ± 0.002"
- molarMass.N = 14.007 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "7 N nitrogen 14.007 ± 0.001"
- molarMass.P = 30.974 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "15 P phosphorus 30.974 ± 0.001"
- molarMass.Si = 28.085 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "14 Si silicon 28.085 ± 0.001"

### CHEM-DIC-GT-TA

Severity: warning · Export policy: show

**What the user sees.** In «group», N of «total» rows have more dissolved inorganic carbon (DIC) than alkalinity (TA), which is unusual in sea water. Check the columns and units.

**What triggers it.** «file»:«lines» «group»: DIC \> TA in N of «total» rows (median TA-DIC «medianDiff»).

**Citations.**

- [TEOS-10 Manual, IOC Manuals and Guides 56](https://www.teos-10.org/pubs/TEOS-10_Manual.pdf), Appendix A.4, printed pp.80-81 (Standard Seawater: TA 2300 and DIC 2080 µmol/kg at SP = 35)
- [Dickson, Sabine & Christian (2007), Guide to Best Practices for Ocean CO2 Measurements, PICES Special Publication 3](https://www.ncei.noaa.gov/access/ocean-carbon-acidification-data-system/oceans/Handbook_2007/Guide_all_in_one.pdf), SOP 2 section 1, PDF p.39 (oceanic DIC 1800–2300 µmol/kg)
- [Dickson, Sabine & Christian (2007), Guide to Best Practices for Ocean CO2 Measurements, PICES Special Publication 3](https://www.ncei.noaa.gov/access/ocean-carbon-acidification-data-system/oceans/Handbook_2007/Guide_all_in_one.pdf), SOP 3a section 1, PDF p.53 (oceanic TA 2000–2500 µmol/kg)

### CHEM-RANGE

Severity: warning · Export policy: show

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
