# Rules of /convert

Generated from the rule registry (`src/core/rules/`) by `scripts/rules-docs-per-tool.ts`. Do not edit by hand.
Regenerate with `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-docs-per-tool.test.ts`.

/convert reads a spreadsheet or table, asks the person to declare what the columns mean, and writes a Darwin Core archive. It re-uses the file-reading and row checks of /check, and adds its own questions (rules with the prefix CONV). For every rule the list names the export policy: block stops the export, accept needs one tick for the rule per run, show is only shown.

The list is the rules the tool can raise, found by a static scan of its code, so a few may never fire in practice. Severity is error, warning or info. Every number a rule compares against is listed with its source. Each rule has four short parts: what it checks, when it fires, an invented example, and what the person can do.

245 rules.

## IN-RECORD-INACCESSIBLE

Severity: error · Export policy: block

## IN-HOST-NOT-ALLOWED

Severity: warning · Export policy: show

## IN-FETCH-BLOCKED

Severity: warning · Export policy: show

## IN-FETCH-TIMEOUT

Severity: warning · Export policy: show

## IN-LAYOUT-UNSUPPORTED

Severity: error · Export policy: block

## IN-ENCODING-FALLBACK

Severity: info · Export policy: accept

## IN-ENCODING-AMBIGUOUS

Severity: warning · Export policy: block

## IN-DECIMAL-COMMA

Severity: info · Export policy: accept

## IN-DECIMAL-AMBIGUOUS

Severity: warning · Export policy: block

## IN-HEADER-SHORT

Severity: warning · Export policy: accept

## IN-HEADER-UNITS-READ

Severity: info · Export policy: show

## IN-HEADER-UNITS-NAMED

Severity: info · Export policy: show

## IN-PERCENT-READ

Severity: info · Export policy: show

## IN-COLUMN-NO-HEADER

Severity: warning · Export policy: show

## IN-DATE1904

Severity: info · Export policy: show

**Citations.**

- [Microsoft Support, Date systems in Excel](https://support.microsoft.com/en-us/office/date-systems-in-excel-e7fe7167-48a9-4b96-bb53-5612a800b487), 1900 and 1904 date systems; "The difference between the two date systems is 1,462 days."

## IN-PANGAEA-EVENT-USED

Severity: info · Export policy: show

## IN-PANGAEA-EVENT-NOT-USED

Severity: warning · Export policy: show

## IN-PANGAEA-EVENT-UNMATCHED

Severity: warning · Export policy: show

## LIC-MISSING — No licence is stated anywhere in the record

Severity: error · Export policy: show

**What it checks.** No licence is stated anywhere in the record. Without a licence nobody knows whether the data may be reused, so by default they may not.

**When it fires.** Once per record, when the record (or all the records read for it) holds no statement about the data in any licence field (ISO useLimitation and otherConstraints, DataCite rightsList, Zenodo license and the like; statements about the metadata record itself do not count), and no source of the record failed to load. A record that could not be read says nothing about a licence, and IN-RECORD-INACCESSIBLE reports it instead. When the DataCite record could not be compared, the finding says it rests on the catalogue record alone.

**Example.** A catalogue record has title, abstract and contact, but its rights and constraints sections are empty.

**What you can do.** State the licence by name and version with a link to its official text, for example CC BY 4.0, in the repository record.

**Citations.**

- [INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)](https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html), section 2.3.7 (quoting Regulation 1205/2008 Part B 8.1): "The element must have values."
- [INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)](https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html), section 2.3.7 (quoting Regulation 1205/2008 Part B 8.1): "If no conditions apply to the access and use of the resource, ‘no conditions apply’ shall be used."
- [GO FAIR, FAIR Principle R1.1](https://www.go-fair.org/fair-principles/r1-1-metadata-released-clear-accessible-data-usage-license/), heading "Interpretation of R1.1": "Digital resources and their metadata must always, without exception, include a license that describes under which conditions the resource can be used, even if that is “unconditional”."
- [OpenAIRE Guidelines for Data Archives, 16. Rights (MA)](https://guidelines.openaire.eu/en/latest/data/field_rights.html), 16. Rights (MA), note: "In particular OpenAIRE also recommends including license information if available."

## LIC-FREE-TEXT — The licence is written only as free text that a program cannot read

Severity: warning · Export policy: show

**What it checks.** The licence is written only as free text that a program cannot read. A person understands it, but a harvester cannot tell whether the data are open.

**When it fires.** Once per record, when the record has licence statements, none of them is machine-readable (a recognised identifier, a link to a recognised licence, or the identifier itself as the text) and none is flagged by another licence rule. The finding quotes the first statement with text and says whether the text carries no version number. The suggested identifier is the licence the tool recognised in the record, or the example CC BY 4.0 when it recognised none.

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

Severity: warning · Export policy: show

**What it checks.** A licence statement has both a text and a link, and they do not agree. Either one is wrong, or the text is not about the licence at all.

**When it fires.** For one statement that has a link, when the text itself offers several licences, or the text and the link read as different licences, or a text with no version names only a licence family against the link of another family, or the link is a licence link the tool has no identifier for while the text names one, or the text names no licence and says more than plain Open Access next to a licence link. For DataCite and Zenodo it also fires when the text is an exact licence name but the link is no licence link and no access value. A text that is empty, plain Open Access or Public Domain next to a CC0 link is neutral and does not fire it. One finding per statement, with the licence read from the text and from the link, a dash meaning not recognised.

**Example.** The text says CC BY 4.0 and the link points to the page of the CC BY-NC 4.0 licence.

**What you can do.** Decide which licence applies and write it once, with its own link and with a text that names the same licence.

**Citations.**

- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16. Rights, allowed values, examples, other constraints: "Use the complete title of a license and include version information if applicable."
- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16.a rightsURI: "The URI of the license."
- [Creative Commons wiki, Best practices for attribution](https://wiki.creativecommons.org/wiki/Best_practices_for_attribution), section on licence attribution: "We recommend that you name and provide a link to the license, e.g., CC BY 4.0 ( http://creativecommons.org/licenses/by/4.0 ) for a work licensed under CC BY 4.0."

## LIC-ADDED-CONDITIONS — A licence text names a licence and then adds conditions to it

Severity: warning · Export policy: show

**What it checks.** A licence text names a licence and then adds conditions to it. With extra conditions it is no longer the standard licence and cannot be treated as one.

**When it fires.** For a statement whose text names a licence, when nothing else contradicts it (the readings of text and link agree) and what is left of the text after the licence name and the neutral wording are taken away contains a restriction marker, such as a limit on commercial use or a duty to ask for permission (words in Polish, English, German and French are looked for). The finding quotes the leftover. When the identifier or the Zenodo title leaves something too, that is added to the finding. A leftover with no restriction marker is LIC-EXTRA-TEXT instead.

**Example.** The text reads CC BY 4.0, commercial use only with written permission of the authors.

**What you can do.** State the licence alone, or name the extra conditions explicitly as such and say that the data are not under the plain licence.

**Citations.**

- [Creative Commons FAQ](https://creativecommons.org/faq/), Alterations and additions to the license, "Can I change the license terms or conditions?": "if you change the terms and conditions of any Creative Commons license, you must no longer call, label, or describe the license as a “Creative Commons” or “CC” license"

## LIC-EXTRA-TEXT — A licence text names a licence and also says something else

Severity: warning · Export policy: show

**What it checks.** A licence text names a licence and also says something else. The extra words may change the licence, so the statement is not read as the standard licence until a person has looked.

**When it fires.** For a statement whose text names a licence, when the readings of text and link agree and something is left over after the licence name and the neutral wording are removed, and the leftover has no restriction marker. A leftover with a restriction marker is LIC-ADDED-CONDITIONS instead. The finding quotes the leftover, and the leftover of another string of the same statement (identifier or Zenodo title) is added when there is one.

**Example.** The text reads CC BY 4.0, please contact the data manager.

**What you can do.** Move the extra sentence to the description of the data and leave the licence field with the licence only.

**Citations.**

- [Creative Commons FAQ](https://creativecommons.org/faq/), Alterations and additions to the license, "Can I change the license terms or conditions?": "if you change the terms and conditions of any Creative Commons license, you must no longer call, label, or describe the license as a “Creative Commons” or “CC” license"

## LIC-OTHER-RIGHTS-ENTRY — A repeated rights entry that is no recognised licence stands next to a licence the same record does recognise

Severity: warning · Export policy: show

**What it checks.** A repeated rights entry that is no recognised licence stands next to a licence the same record does recognise. The other entry may restrict or change the licence.

**When it fires.** Once per record, only for the repeated entries of DataCite rightsList and Zenodo rights (never for the fields of an ISO record), when the record has a recognised licence and another repeated entry that is no recognised licence, has no conflict of its own and is not a neutral value: a plain access word, or a notice that only names the creators, the organisations or the publisher of the record. Repeated recognised licences are read as dual licensing and do not fire it. The finding quotes the entry, or its link, and names the recognised licence.

**Example.** A rights list holds CC BY 4.0 and a second entry, Data may not be redistributed without consent.

**What you can do.** Remove the second entry or move it to the description, or state clearly how it relates to the licence.

**Citations.**

- [Creative Commons FAQ](https://creativecommons.org/faq/), Alterations and additions to the license, "Can I change the license terms or conditions?": "if you change the terms and conditions of any Creative Commons license, you must no longer call, label, or describe the license as a “Creative Commons” or “CC” license"

## LIC-AMBIGUOUS — A licence statement without a link reads as more than one licence

Severity: warning · Export policy: show

**What it checks.** A licence statement without a link reads as more than one licence. It cannot be assigned to one licence, so a harvester cannot tell what is allowed.

**When it fires.** For one statement with no link, when its strings (the rights text, the identifier, the title) name different licences, when it names two licences or a licence family and a licence, when a versionless family such as CC BY is read against a named version of another family, or when a recognised name stands next to one the tool has no identifier for. One finding per statement, which lists what it reads as, separated by a slash, a dash meaning a name with no identifier. The same text with a link is LIC-TEXT-URI-CONFLICT.

**Example.** The text reads CC BY 4.0 (CC BY-NC) and no link is given.

**What you can do.** State one licence, with its identifier and link. If both licences really apply, list them as separate entries and say so in the description.

**Citations.**

- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16. Rights, allowed values, examples, other constraints: "Use the complete title of a license and include version information if applicable."
- [DataCite Metadata Schema 4.6, 16. Rights](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/), 16.b rightsIdentifier: "A short, standardized version of the license name."

## LIC-RESTRICTION-CONFLICT — The record names an open licence and also carries a restriction code that says the data are restricted

Severity: warning · Export policy: show

**What it checks.** The record names an open licence and also carries a restriction code that says the data are restricted. The two cannot both describe the data.

**When it fires.** Once per record, when a record carries a restrictive ISO restriction code (copyright, patent, patentPending, trademark, intellectualPropertyRights or restricted) and the record names an open licence: a recognised open identifier, or an open licence family as written, even without a version. The codes license and otherRestrictions never count, the first because it is the normal way to say that a licence applies and the second because it only points to the constraints text. A non-commercial or no-derivatives licence is not open here. The finding lists the codes and the licence.

**Example.** A record states CC BY 4.0 in otherConstraints and the code copyright in its restriction code.

**What you can do.** Replace the code with license, or with otherRestrictions and a description of the conditions as INSPIRE expects, if the data are in fact restricted, state the restriction instead of the open licence.

**Citations.**

- [INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)](https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html), TG Requirement C.18, section 2.3.7: "In both cases this element shall contain a gmd:MD_RestrictionCode element with code list value "otherRestrictions"."
- [INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)](https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html), TG Requirement C.18, section 2.3.7: "Additionally at least one instance of gmd:otherConstraints shall be given describing the actual conditions."
- [ISO/TS 19139 code lists (gmxCodelists.xml), MD_RestrictionCode](https://standards.iso.org/iso/19139/resources/gmxCodelists.xml), MD_RestrictionCode "restricted": "withheld from general circulation or disclosure"
- [Creative Commons FAQ](https://creativecommons.org/faq/), How do CC licenses operate?: "CC licenses are operative only when applied to material in which a copyright exists, and even then only when a particular use would otherwise not be permitted by copyright."

## LIC-FILES-HELD-BACK — Some files of the dataset are under restricted access or an embargo

Severity: warning · Export policy: show

**What it checks.** Some files of the dataset are under restricted access or an embargo. Whatever licence the metadata states, the repository decides who may get these files.

**When it fires.** Once per record, when a Dataverse record lists files that are restricted or embargoed. The finding names up to ten of the files and counts the rest. The licence verdict of the tool covers only the open files, and the page says so.

**Example.** A Dataverse dataset has four files, and two of them are marked restricted.

**What you can do.** If the held files are the data, say in the description how and when they can be obtained, or open them.

## LIC-DATACITE-EMPTY — The DOI registration record at DataCite states no licence

Severity: warning · Export policy: show

**What it checks.** The DOI registration record at DataCite states no licence. Harvesters read that record first, so the data look unlicensed to them.

**When it fires.** Once per record, when the DataCite record was read and has no licence statement, and either another source of the record states a licence or some source could not be read. The finding names the licence of the other record, and a dash when none states one or the main record could not be read. It is not counted as a contradiction between records, because silence contradicts nothing.

**Example.** The Zenodo record of a dataset says CC BY 4.0, and the DataCite record of its DOI has an empty rights list.

**What you can do.** Add the licence to the DOI record at the registration agency.

**Citations.**

- [OpenAIRE Guidelines for Data Archives, 16. Rights (MA)](https://guidelines.openaire.eu/en/latest/data/field_rights.html), 16. Rights (MA), note: "In particular OpenAIRE also recommends including license information if available."
- [OpenAIRE Guidelines for Data Archives, 16. Rights (MA)](https://guidelines.openaire.eu/en/latest/data/field_rights.html), 16. Rights (MA), note: "Mandatory when applicable property in OpenAIRE instead of optional in DataCite."

## LIC-MISMATCH — Two records, or two fields of one record, state different licences

Severity: warning · Export policy: show

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

Severity: warning · Export policy: show

**What it checks.** A download link of the record has an empty address. A link that goes nowhere cannot be followed by a person or by a harvester, and it suggests that a file was left out of the record.

**When it fires.** Once per record, when at least one distribution link (a CI_OnlineResource linkage in an ISO record, or the same kind of link in the other record types) is present with an empty address. The finding counts the empty links of all the sources read for the record. A record that could not be read is not judged.

**Example.** A metadata record lists three download links, one of which has the address field present but blank.

**What you can do.** Fill in the address or delete the link in the repository record.

## META-NO-VERSION — The record gives no version or edition of the data

Severity: info · Export policy: show

**What it checks.** The record gives no version or edition of the data. Without it nobody can tell which release of a dataset they hold, and a corrected release looks like the old one.

**When it fires.** Once per record, when records were read and none of them carries a version or edition, and the data did not come as a Darwin Core Archive whose eml.xml states a version (see IN-DWCA-VERSION). A record that could not be read is not judged, because its absence of a version says nothing.

**Example.** A DataCite record with title, creators and licence but no version field.

**What you can do.** Add a version number or edition to the record, and change it when the data change.

## META-NO-EXTENT — The record states neither a time span nor an area for the data

Severity: info · Export policy: show

**What it checks.** The record states neither a time span nor an area for the data. A reader cannot tell when and where the data were collected, and the tool cannot compare the table with the record.

**When it fires.** Once per record, when records were read and none of them has a temporal extent or a geographic bounding box. A record with only one of the two does not fire this rule. In Collection review, which has no table to compare, the wording does not mention a /check table.

**Example.** A record with a title and an abstract but no temporal coverage and no bounding box.

**What you can do.** Add the period and the bounding box of the data to the record.

## META-DATE-OUTSIDE-EXTENT — Some rows of the table are dated outside the time span the record states

Severity: warning · Export policy: show

**What it checks.** Some rows of the table are dated outside the time span the record states. Either the dates in the table are wrong or the span in the record is, and the two cannot both be right.

**When it fires.** When a record gives a temporal extent (with a start, an end or both) and at least one row has a parsed date outside it. Where several records give an extent, one is used, in the order ISO 19139, DataCite, PANGAEA, Zenodo, Dataverse; they are never merged. The row date and the limit are compared at the coarser of their two precisions, down to a day at most, so a row dated in the year of an end given as a year is inside. An open start or end is not a limit. Rows without a readable date are not counted. One finding lists the rows, their number and one example date.

**Example.** A record states a time span from 2019-05-01 to 2019-05-31 and the table has three rows dated in June 2019.

**What you can do.** Correct the dates in the table or the time span in the record.

## META-POINT-OUTSIDE-BBOX — Some rows of the table have a position outside the geographic area the record states

Severity: warning · Export policy: show

**What it checks.** Some rows of the table have a position outside the geographic area the record states. Either the coordinates are wrong (a swapped sign, a swapped latitude and longitude) or the area in the record is too small.

**When it fires.** When a record gives a bounding box and at least one row has a latitude and a longitude outside it. The box is widened by half a unit of the last decimal place of the row coordinate and of the box edge, so a value rounded to the precision of the box is not outside it. A box whose west edge is greater than its east edge is read as crossing the antimeridian. A row at exactly 0, 0 is left to ROW-ZERO-COORD and not reported here. Rows without a position are not counted. One finding lists the rows, their number and one example position.

**Example.** A record gives a box from 54 to 56 degrees north and 10 to 12 degrees east, and four rows lie at 54.5 north and minus 11.2 (a lost sign).

**What you can do.** Correct the coordinates or enlarge the box in the record.

## META-VARIABLE-MISSING — The abstract of the record promises a measured quantity that the table has no column for

Severity: warning · Export policy: show

**What it checks.** The abstract of the record promises a measured quantity that the table has no column for. A reader who relies on the abstract looks for the variable and finds nothing, or the column was dropped from the file.

**When it fires.** Only when the table holds a column the tool recognises as a measured quantity, the table is a whole file (not one sheet of a workbook), the record links to at most one data file, and the record has an abstract. For each known variable the abstract names by one of its terms (several languages; whole word, accents ignored) while no column is recognised as that variable and no header contains one of its terms, one finding is raised. Short acronyms of up to four characters, such as DIC or pH, are matched with their capitals. A term used as a modifier of an instrument or a process (fluorescence, sensor, probe, maximum and similar words next to it) does not count as a promise of a column, and nitrate or nitrite is covered by a combined nitrate and nitrite column.

**Example.** The abstract says that dissolved silica was measured, and the table has temperature, salinity and nitrate columns but nothing for silica.

**What you can do.** Add the column or correct the abstract.

## META-NO-DATES — Neither the table nor the record holds any date

Severity: error · Export policy: show

**What it checks.** Neither the table nor the record holds any date. Data without a date cannot be placed in time, and OBIS and most repositories require one.

**When it fires.** For a table with rows and a supported layout, when no row has a date (a date cell that exists but cannot be read counts as a date column, and is reported by ROW-DATE-UNPARSEABLE) and no record has a temporal extent or a collection date. Publication dates are not used. A lookup table of the same file, which holds no measurement while another sheet of the file does, is skipped. For a workbook the sheets that lack a date are listed in one finding. When a join left rows without a date the finding names the joined sheet as the likely cause. For an empty eventDate column of a Darwin Core table only this rule speaks, and DWC-TERM-EMPTY stays silent.

**Example.** A table of temperature and salinity by depth with no date column, described by a record without a temporal extent.

**What you can do.** Add the sampling date to the table or a time span to the record. In /convert, where the converter has already said that no event has a date (CONV-EVENT-DATE-MISSING), this finding is not repeated. In /convert the finding is only shown and never stops the export.

## META-NO-POSITIONS — Neither the table nor the record holds any position

Severity: error · Export policy: show

**What it checks.** Neither the table nor the record holds any position. OBIS needs decimalLatitude and decimalLongitude for every record, and a bounding box in the record is not a substitute for them.

**When it fires.** For a table with rows and a supported layout (and not a lookup table beside the data, as META-NO-DATES), when no latitude or longitude column is recognised, no row has a position, no row has a blank or unreadable position cell, and no record has a bounding box. A column that exists but is blank or unreadable is not this rule: ROW-NO-COORD, ROW-NON-NUMERIC and DWC-TERM-EMPTY speak for it. A position that is only in the record is left to the rules that compare the data with the record. Sheets of one workbook that lack a position are listed in one finding. Source: the OBIS Manual, location terms.

**Example.** A table of nutrient concentrations by sample number with no latitude and no longitude column, and a record without a bounding box.

**What you can do.** Add latitude and longitude columns in decimal degrees to the table. In /convert the finding is only shown and never stops the export.

**Citations.**

- [OBIS Manual, "Darwin Core" (iobis/manual darwin_core.md; manual.obis.org; read 2026-10-30)](https://manual.obis.org/darwin_core.html), "Location information can be documented in many DwC terms, but decimalLatitude and decimalLongitude are the minimally required terms"; "OBIS currently has seven required and one strongly recommended DwC term: occurrenceID, eventDate, decimalLongitude, decimalLatitude, scientificName, occurrenceStatus, basisOfRecord, scientificNameID"

## ROW-LAT-RANGE

Severity: error · Export policy: block

**Thresholds.**

- latitude.min = -90 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11
- latitude.max = 90 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11

**Citations.**

- [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.3 "Impossible Location", PDF p.44

## ROW-LON-RANGE

Severity: error · Export policy: block

**Thresholds.**

- longitude.min = -180 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11
- longitude.max = 180 degrees. Source: [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11

**Citations.**

- [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.3 "Impossible Location", PDF p.44

## ROW-LON-360

Severity: info · Export policy: show

**Citations.**

- [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.3 "Impossible Location", PDF p.44

## ROW-LAT-EQ-LON

Severity: error · Export policy: block

## ROW-LAT-EQ-LON-ISOLATED

Severity: warning · Export policy: accept

## ROW-LAT-EQ-LON-COARSE

Severity: info · Export policy: show

## ROW-RAGGED

Severity: error · Export policy: block

## ROW-NON-NUMERIC

Severity: warning · Export policy: accept

## ROW-NA-VARIANT

Severity: warning · Export policy: show

## ROW-STATION-MOVED

Severity: warning · Export policy: accept

## ROW-STATION-SPREAD

Severity: info · Export policy: show

## ROW-STATION-SPREAD-FAR

Severity: warning · Export policy: accept

## ROW-ON-LAND-NEAR

Severity: info · Export policy: show

**Citations.**

- [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 4 "Position on land test", p.11
- [Natural Earth 1:10m physical vectors: land, minor islands, lakes, v5.1.2 (public domain)](https://www.naturalearthdata.com/downloads/10m-physical-vectors/), layers ne_10m_land, ne_10m_minor_islands, ne_10m_lakes; rasterised by scripts/land-mask.py

## ROW-ON-LAND

Severity: warning · Export policy: show

**Citations.**

- [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 4 "Position on land test", p.11
- [Natural Earth 1:10m physical vectors: land, minor islands, lakes, v5.1.2 (public domain)](https://www.naturalearthdata.com/downloads/10m-physical-vectors/), layers ne_10m_land, ne_10m_minor_islands, ne_10m_lakes; rasterised by scripts/land-mask.py

## ROW-SHIP-SPEED

Severity: warning · Export policy: show

**Thresholds.**

- speed.extreme = 40 knots. Source: [Met Office marine-qc (marine_qc) documentation, "Track check"](https://marine-qc.readthedocs.io/en/latest/track_check.html), section "Extreme speed check": "If the speed estimated from the locations at t-1 and t exceeds 40 knots, set the extreme speed check flag to fail." (the check itself compares one pair; both-sides logic: sections "Speed check" and "The combined track check")

**Citations.**

- [MEDATLAS Protocol, Part I: exchange format and quality checks for observed profiles, v3 (SISMER/IFREMER, Dec 2001)](https://nodc.ogs.it/repository/documents/guidelines/medman_v3.pdf), section 4.4.4 "Check the ship velocity", PDF p.29: "If the ship velocity \> maximum velocity of the ship (default is 15 knots) between two consecutive profiles, find the erroneous data (date or location)"
- [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.5 "Impossible Speed", PDF p.53 (per-platform maximum speed; the operator decides whether position or date/time is wrong)
- [World Ocean Database 2018 User's Manual (prerelease, v0.10; Garcia et al.)](https://www.ncei.noaa.gov/data/oceans/woa/WOD/DOC/WOD18-UsersManual_final.pdf), section 4 "Speed check", printed p.31: "If the speed between adjoining casts is unrealistic, the date/time may be in error, the position may be wrong, or the cast may not belong to this cruise/platform."

## ROW-SHIP-SPEED-UNUSUAL

Severity: info · Export policy: show

**Thresholds.**

- speed.unusual = 15 knots. Source: [MEDATLAS Protocol, Part I: exchange format and quality checks for observed profiles, v3 (SISMER/IFREMER, Dec 2001)](https://nodc.ogs.it/repository/documents/guidelines/medman_v3.pdf), section 4.4.4 "Check the ship velocity", PDF p.29: "If the ship velocity \> maximum velocity of the ship (default is 15 knots) between two consecutive profiles, find the erroneous data (date or location)"
- speed.extreme = 40 knots. Source: [Met Office marine-qc (marine_qc) documentation, "Track check"](https://marine-qc.readthedocs.io/en/latest/track_check.html), section "Extreme speed check": "If the speed estimated from the locations at t-1 and t exceeds 40 knots, set the extreme speed check flag to fail." (the check itself compares one pair; both-sides logic: sections "Speed check" and "The combined track check")

**Citations.**

- [World Ocean Database 2018 User's Manual (prerelease, v0.10; Garcia et al.)](https://www.ncei.noaa.gov/data/oceans/woa/WOD/DOC/WOD18-UsersManual_final.pdf), section 4 "Speed check", printed p.31: "If the speed between adjoining casts is unrealistic, the date/time may be in error, the position may be wrong, or the cast may not belong to this cruise/platform."

## ROW-SHIP-SPEED-PAIR

Severity: info · Export policy: show

**Thresholds.**

- speed.extreme = 40 knots. Source: [Met Office marine-qc (marine_qc) documentation, "Track check"](https://marine-qc.readthedocs.io/en/latest/track_check.html), section "Extreme speed check": "If the speed estimated from the locations at t-1 and t exceeds 40 knots, set the extreme speed check flag to fail." (the check itself compares one pair; both-sides logic: sections "Speed check" and "The combined track check")

**Citations.**

- [World Ocean Database 2018 User's Manual (prerelease, v0.10; Garcia et al.)](https://www.ncei.noaa.gov/data/oceans/woa/WOD/DOC/WOD18-UsersManual_final.pdf), section 4 "Speed check", printed p.31: "If the speed between adjoining casts is unrealistic, the date/time may be in error, the position may be wrong, or the cast may not belong to this cruise/platform."
- [MEDATLAS Protocol, Part I: exchange format and quality checks for observed profiles, v3 (SISMER/IFREMER, Dec 2001)](https://nodc.ogs.it/repository/documents/guidelines/medman_v3.pdf), section 4.4.4 "Check the ship velocity", PDF p.29: "If the ship velocity \> maximum velocity of the ship (default is 15 knots) between two consecutive profiles, find the erroneous data (date or location)"

## ROW-DATE-UNPARSEABLE

Severity: warning · Export policy: block

**Citations.**

- [W3C Note, Date and Time Formats (profile of ISO 8601)](https://www.w3.org/TR/NOTE-datetime), Formats: complete date YYYY-MM-DD
- [DataCite Metadata Schema 4.6, property Date](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/date/), section 8 Date, allowed formats

## ROW-TIME-OTHER-DAY

Severity: warning · Export policy: block

## ROW-DATE-MISSING

Severity: info · Export policy: show

## ROW-YEAR-OUTLIER

Severity: warning · Export policy: show

## ROW-JOIN-AMBIGUOUS

Severity: warning · Export policy: show

## ROW-LONG-VALUE-SKIPPED

Severity: warning · Export policy: accept

## ROW-LONG-NO-PARAMETER

Severity: warning · Export policy: block

## ROW-LONG-PARAMETER-MERGED

Severity: info · Export policy: accept

## ROW-LONG-KEY-EXTENDED

Severity: info · Export policy: accept

## ROW-KEY-IGNORED

Severity: info · Export policy: show

## ROW-JOIN-KEY-BLANK

Severity: warning · Export policy: show

## ROW-DATE-YYMMDD

Severity: info · Export policy: accept

## ROW-DATE-YY-AMBIGUOUS

Severity: warning · Export policy: block

## ROW-TZ-UNKNOWN

Severity: info · Export policy: show

## ROW-UNIT-MISSING

Severity: warning · Export policy: show

## ROW-HEADER-CODE-SHAPE

Severity: warning · Export policy: show

**Citations.**

- [NERC Vocabulary Server (NVS), collections P01 (BODC Parameter Usage Vocabulary) and P06 (BODC data storage units); read 2026-10-29](https://vocab.nerc.ac.uk/collection/P06/current/), Every concept of P06 has a four-character code (411 of 411 codes read, e.g. UPAA) and every concept of P01 an eight-character one (50 613 of 50 613 codes read, e.g. TEMPPR01; 66 begin with a digit); a code of another length has no concept page: https://vocab.nerc.ac.uk/collection/P01/current/D13CMOP11/ answers 404, https://vocab.nerc.ac.uk/collection/P01/current/D13CMOP1/ is a concept.

## ROW-DEPTH-SIGN

Severity: info · Export policy: accept

## ROW-DEPTH-MIXED-SIGN

Severity: warning · Export policy: accept

## ROW-MISSING-CODE

Severity: warning · Export policy: block

## ROW-DM-COORDS

Severity: info · Export policy: show

## ROW-HEMISPHERE-CONFLICT

Severity: warning · Export policy: accept

## ROW-HEMISPHERE-UNPAIRED

Severity: warning · Export policy: accept

## ROW-HEMISPHERE-MISSING

Severity: warning · Export policy: accept

## ROW-ZERO-COORD

Severity: error · Export policy: block

**Citations.**

- [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: "if record.get_interpreted("decimalLongitude") == 0 and record.get_interpreted("decimalLatitude") == 0: record.set_flag(Flag.ZERO_COORD); record.dropped = True"
- [EMODnet Biocheck (R), README, Integrity and Format checks (read 2026-10-24)](https://github.com/EMODnet/EMODnetBiocheck/blob/master/README.md), Integrity checks: "decimalLatitude and decimalLongitude are both 0" ... "It is theoretically possible that a sampling event happens at 0-0 coordinates, however it is very common to inadvertedly add 0-0 when the actual coordinates are missing. Therefore, 0-0 coordinates should always be double checked."

## ROW-NO-COORD

Severity: warning · Export policy: block

**Citations.**

- [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: "if record.get_interpreted("decimalLongitude") is None or record.get_interpreted("decimalLatitude") is None: record.set_flag(Flag.NO_COORD); record.dropped = True"

## ROW-DEPTH-MIN-MAX

Severity: error · Export policy: block

**Citations.**

- [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: "if record.get_interpreted("minimumDepthInMeters") \> record.get_interpreted("maximumDepthInMeters"): record.set_flag(Flag.MIN_DEPTH_EXCEEDS_MAX)"
- [OBIS obistools (R), R/check_depth.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_depth.R), check_depth, details: "minimum depth greater than maximum depth" (error); code: minGTmax \<- !is.na(maxd) & !is.na(mind) & mind \> maxd

## ROW-DEPTH-RANGE

Severity: warning · Export policy: accept

**Thresholds.**

- depth.min = -100000 m. Source: [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: misc.check_float(record.get("minimumDepthInMeters"), \[-100000, 11000\]) (the same call for maximumDepthInMeters; in_range = valid_range\[0\] \<= value \<= valid_range\[1\], out of range sets Flag.DEPTH_OUT_OF_RANGE)
- depth.max = 11000 m. Source: [OBIS obis-qc (Python), obisqc/location.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/location.py), check_record: misc.check_float(record.get("minimumDepthInMeters"), \[-100000, 11000\]) (the same call for maximumDepthInMeters; in_range = valid_range\[0\] \<= value \<= valid_range\[1\], out of range sets Flag.DEPTH_OUT_OF_RANGE)

**Citations.**

- [NOAA National Ocean Service, "How deep is the ocean?" (last updated 2026-09-23)](https://oceanservice.noaa.gov/facts/oceandepth.html), "Challenger Deep is approximately 10,935 meters (35,876 feet) deep." (the deepest part of the ocean)

## ROW-DATE-FUTURE

Severity: warning · Export policy: accept

**Citations.**

- [OBIS obis-qc (Python), obisqc/time.py, master (read 2026-10-24)](https://github.com/iobis/obis-qc/blob/master/obisqc/time.py), check_record: "if ms_end \> date_to_millis(datetime.date.today()): # date in the future record.set_flag(Flag.DATE_IN_FUTURE)"

## ROW-INVISIBLE-CHAR

Severity: warning · Export policy: accept

**Citations.**

- [OBIS Manual, "Common data quality issues" (iobis/manual common_qc.md; manual.obis.org)](https://manual.obis.org/common_qc.html), "Hidden characters and non-breaking spaces": "a value like Abra alba containing a non-breaking space will not match the same name typed with a normal space"; "OBIS removes leading and trailing whitespace from values during processing, but does not change spaces inside a value"; "Other invisible characters, such as tabs, line breaks within a cell, and zero-width spaces (U+200B), can cause similar problems"

## ROW-YEAR-DATE-MISMATCH

Severity: warning · Export policy: show

## ROW-TEXT-MOJIBAKE

Severity: warning · Export policy: show

## DWC-TERM-MISSING — A Darwin Core table has no column for a term that OBIS requires

Severity: error · Export policy: block

**What it checks.** A Darwin Core table has no column for a term that OBIS requires. Without the required terms the records cannot be published in OBIS, so the file is not ready however good its other columns are.

**When it fires.** Only on Darwin Core input. It fires once per table and lists every missing term. Required for every core: eventDate, decimalLatitude and decimalLongitude, plus an identifier (eventID for an Event core; occurrenceID or eventID for an Occurrence core; in a Darwin Core Archive the core id column may stand for it). An Occurrence core also requires scientificName, occurrenceStatus and basisOfRecord. An occurrence table that carries a filled eventID column is read as the occurrence side of an event and occurrence pair, and then eventDate and the two coordinates are not required of it. scientificNameID is only recommended (DWC-RECOMMENDED). Sources: obistools check_fields and the OBIS Manual.

**Example.** A table with the columns occurrenceID, scientificName, eventDate, decimalLatitude and decimalLongitude but no basisOfRecord column is reported as missing basisOfRecord.

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

**What you can do.** Add the columns, for example the persistent identifier of each name from a taxon register, and the depth range of the sample. In /convert a lacking scientificNameID on the Occurrence table is not raised by this rule but by CONV-NAMEID-MISSING; the depth terms are still judged. In /convert this finding is accepted and does not stop the export.

**Citations.**

- [OBIS obistools (R), R/check_fields.R, master (read 2026-10-24)](https://github.com/iobis/obistools/blob/master/R/check_fields.R), check_fields: recommended \<- c("minimumDepthInMeters", "maximumDepthInMeters"); "missing or empty recommended fields are reported as warnings"
- [OBIS Manual, "Common format issues" (iobis/manual common_formatissues.md; manual.obis.org)](https://manual.obis.org/common_formatissues.html), "Missing required fields": "one (or more) of the eight required terms for OBIS"; "occurrenceID or eventID"; "scientificNameID (strongly recommended)"

## DWC-VOCAB-VALUE — A basisOfRecord or occurrenceStatus value is not on the list OBIS accepts

Severity: warning · Export policy: block

**What it checks.** A basisOfRecord or occurrenceStatus value is not on the list OBIS accepts. OBIS compares these values with a fixed vocabulary, so a misspelt value can make the record fail the quality control of OBIS.

**When it fires.** Only on Darwin Core input, for the columns basisOfRecord and occurrenceStatus. A value is compared in lower case after its ends are trimmed, so capitalisation does not matter but spelling and inner spaces do. basisOfRecord accepts PreservedSpecimen, FossilSpecimen, LivingSpecimen, HumanObservation, MachineObservation, MaterialSample, Occurrence and MaterialCitation (the GBIF vocabulary of 2022-02-02, the file the OBIS quality control reads). occurrenceStatus accepts absent, present, notDetected and detected. Empty cells are DWC-TERM-EMPTY. One finding per distinct wrong value, with its lines; beyond ten distinct values the rest share one finding. Sources: GBIF vocabulary, OBIS Manual, Biocheck.

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

**When it fires.** Only on Darwin Core input read as an Event core. In a Darwin Core Archive every repeated eventID fires, since the archive has one row per event. In any other table (a flattened sheet repeats the eventID on every depth level) an eventID fires only when its rows disagree on the date or on a coordinate; dates are compared by their parsed value and coordinates as numbers, so 60.5 and 60.50 agree. A repeated eventID whose rows agree is not reported. The finding lists every row of every repeated eventID and counts the ids. It does not run on an Occurrence core, where one eventID may repeat. Source: obistools check_eventids.

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

**When it fires.** Only on Darwin Core input read as an Event core that has a parentEventID column. Each eventID is followed to its parent, then to that parent, and so on; every row on a circle is listed and counted. A row whose parentEventID equals its own eventID is a circle of one. When an eventID repeats, its first non-blank parent is used. The search visits each event once. Source: the GBIF issue PARENT_EVENT_INFINITE_LINEAGE.

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

## XF-DUPLICATE-SAMPLES

Severity: info · Export policy: show

## XF-DATE-CONFLICT

Severity: warning · Export policy: show

## XF-STATION-ALIAS

Severity: info · Export policy: show

## XF-UNIT-CONFLICT

Severity: warning · Export policy: show

**Citations.**

- [Lauvset et al. (2024), GLODAPv2.2023, Earth System Science Data 16, 2047](https://essd.copernicus.org/articles/16/2047/2024/), section 3.1 (per-litre to per-kilogram conversion with seawater density)
- [Fofonoff & Millard (1983), UNESCO Technical Papers in Marine Science 44 (GitHub-hosted copy)](https://raw.github.com/ocefpaf/python-seawater/master/docs/UNESCO-TechPaper44_eo.pdf), PDF p.23, check values of seawater density

## XF-POSITION-SWAP

Severity: warning · Export policy: show

## XF-POSITION-CONFLICT

Severity: warning · Export policy: show

## CHEM-UNIT-PAIR

Severity: warning · Export policy: show

**Thresholds.**

- molarMass.C = 12.011 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "6 C carbon 12.011 ± 0.002"
- molarMass.N = 14.007 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "7 N nitrogen 14.007 ± 0.001"
- molarMass.P = 30.974 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "15 P phosphorus 30.974 ± 0.001"
- molarMass.Si = 28.085 g/mol. Source: [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "14 Si silicon 28.085 ± 0.001"

## CHEM-DIC-GT-TA

Severity: warning · Export policy: show

**Citations.**

- [TEOS-10 Manual, IOC Manuals and Guides 56](https://www.teos-10.org/pubs/TEOS-10_Manual.pdf), Appendix A.4, printed pp.80-81 (Standard Seawater: TA 2300 and DIC 2080 µmol/kg at SP = 35)
- [Dickson, Sabine & Christian (2007), Guide to Best Practices for Ocean CO2 Measurements, PICES Special Publication 3](https://www.ncei.noaa.gov/access/ocean-carbon-acidification-data-system/oceans/Handbook_2007/Guide_all_in_one.pdf), SOP 2 section 1, PDF p.39 (oceanic DIC 1800–2300 µmol/kg)
- [Dickson, Sabine & Christian (2007), Guide to Best Practices for Ocean CO2 Measurements, PICES Special Publication 3](https://www.ncei.noaa.gov/access/ocean-carbon-acidification-data-system/oceans/Handbook_2007/Guide_all_in_one.pdf), SOP 3a section 1, PDF p.53 (oceanic TA 2000–2500 µmol/kg)

## CHEM-RANGE

Severity: warning · Export policy: show

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
