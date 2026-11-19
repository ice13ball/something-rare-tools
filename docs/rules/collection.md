# Rules of /collection

Generated from the rule registry (`src/core/rules/`) by `scripts/rules-docs-per-tool.ts`. Do not edit by hand.
Regenerate with `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-docs-per-tool.test.ts`.

Collection review reads the records of a collection and runs the metadata and licence checks on each. A record opened with "Check this record" is checked by /check; its rules are in check.md.

The list is the rules the tool can raise, found by a static scan of its code, so a few may never fire in practice. Severity is error, warning or info. Every number a rule compares against is listed with its source. Each rule has four short parts: what it checks, when it fires, an invented example, and what the person can do.

29 rules.

## IN-NO-DATA-FILE

Severity: error

## IN-RECORD-INACCESSIBLE

Severity: error

## IN-HOST-NOT-ALLOWED

Severity: warning

## IN-FETCH-BLOCKED

Severity: warning

## IN-FETCH-TIMEOUT

Severity: warning

## IN-FETCH-INTERRUPTED

Severity: error

## IN-ARCHIVE-TOO-LARGE

Severity: error

## IN-ARCHIVE-DAILY-BUDGET

Severity: error

## IN-ARCHIVE-BUSY

Severity: error

## IN-IPT-HOST-NOT-LISTED

Severity: warning

## IN-NO-DWC-ARCHIVE

Severity: error

## IN-FILE-HELD-BACK

Severity: warning

## IN-FILE-TOO-LARGE

Severity: warning

## IN-FILES-NOT-READ

Severity: warning

## IN-DATAVERSE-FILES

Severity: info

## LIC-MISSING — No licence is stated anywhere in the record

Severity: error

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

Severity: warning

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

**When it fires.** Once per record, only for the repeated entries of DataCite rightsList and Zenodo rights (never for the fields of an ISO record), when the record has a recognised licence and another repeated entry that is no recognised licence, has no conflict of its own and is not a neutral value: a plain access word, or a notice that only names the creators, the organisations or the publisher of the record. Repeated recognised licences are read as dual licensing and do not fire it. The finding quotes the entry, or its link, and names the recognised licence.

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

**What you can do.** Replace the code with license, or with otherRestrictions and a description of the conditions as INSPIRE expects, if the data are in fact restricted, state the restriction instead of the open licence.

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

**When it fires.** Once per record, when at least one distribution link (a CI_OnlineResource linkage in an ISO record, or the same kind of link in the other record types) is present with an empty address. The finding counts the empty links of all the sources read for the record. A record that could not be read is not judged.

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
