# Rules of /collection

Generated from the rule registry (`src/core/rules/`) by `scripts/rules-docs-per-tool.ts`. Do not edit by hand.
Regenerate with `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-docs-per-tool.test.ts`.

Collection review reads the records of a collection and runs the metadata and licence checks on each. A record opened with "Check this record" is checked by /check; its rules are in check.md.

The list is the rules the tool can raise, found by a static scan of its code, so a few may never fire in practice. Severity is error, warning or info. Every number a rule compares against is listed with its source. Each rule has four short parts: what it checks, when it fires, an invented example, and what the person can do.

29 rules.

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
