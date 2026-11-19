# Rules of /collection

Generated from the rule registry (`src/core/rules/`) by `scripts/rules-docs-per-tool.ts`. Do not edit by hand.
Regenerate with `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-docs-per-tool.test.ts`.

Collection review reads the records of a collection and runs the metadata and licence checks on each. A record opened with "Check this record" is checked by /check; its rules are in check.md.

The list is the rules the tool can raise, found by a static scan of its code, so a few may never fire in practice. Severity is error, warning or info. Every number a rule compares against is listed with its source. A text in guillemets, «name», stands for a value the tool fills in from the finding; N stands for a number; a plural form is written in the plural. The texts are the ones the tool shows (English), unchanged.

29 rules.

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

**Wording in Collection review.** The metadata gives neither a time span nor an area for the data, so the record does not say what period and place the data cover. Add both.

**What triggers it.** «file»: no temporal extent and no geographic bounding box in any record.
