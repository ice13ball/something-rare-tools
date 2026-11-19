# Rules of /licence

Generated from the rule registry (`src/core/rules/`) by `scripts/rules-docs-per-tool.ts`. Do not edit by hand.
Regenerate with `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-docs-per-tool.test.ts`.

/licence reads the licence statements of one or several records (DOI or link) and compares them: with each other, with the record in DataCite, and with the data files the repository holds back. It lists only the rules it can raise itself. A rule that /check also raises is described here in the same words.

The list is the rules the tool can raise, found by a static scan of its code, so a few may never fire in practice. Severity is error, warning or info. Every number a rule compares against is listed with its source. Each rule has four short parts: what it checks, when it fires, an invented example, and what the person can do.

13 rules.

## IN-RECORD-INACCESSIBLE — The record behind a link could not be opened, so its metadata and files were not read

Severity: error

**What it checks.** The record behind a link could not be opened, so its metadata and files were not read. The reason is a failed request to the host, and the finding names the host and the HTTP status code.

**When it fires.** When a request for the record or one of its files gets an error status such as 403, 404 or 500, or a proxy error (429, 504, a 413 on a file that is not an archive), or when the answer is not JSON or is not the metadata of the source (Dataverse, PANGAEA, an ISO record from GeoNetwork), or when DataCite, GBIF or OBIS do not know the DOI or id (reported as 404), or when a Dataverse version is not released. The wording has three forms: a server fault for status 500 to 599 (usually temporary), a record that may be private or unpublished for 403 and 404, and a neutral "try again later" for any other status, with no guess about the reason. Whatever the other sources of the same run gave is still used.

**Example.** A link to a repository record returns status 404; the finding reads that the record on that host could not be opened (error 404).

**What you can do.** Check the link. For a server fault or another status try again later. For a private or unpublished record (403, 404) download its files or metadata and add them to the tool yourself. In /convert this finding blocks the export.

## IN-HOST-NOT-ALLOWED — A link points to a host the tool is not allowed to open, so nothing was fetched from it

Severity: warning

**What it checks.** A link points to a host the tool is not allowed to open, so nothing was fetched from it.

**When it fires.** When a link the person pasted names a host that is not on the tool's list of data hosts. From a record, only the data links of a GeoNetwork record that end in a table extension are looked at, one finding per host. It also fires when a download from a listed host is redirected to a host that is not listed, and for a pasted DOI whose landing page is off the list. Only the host name is reported, never the whole address.

**Example.** A GeoNetwork record has a distribution link to https://files.example.invalid/share/data.csv; the host files.example.invalid is not on the list, so it is named and nothing is downloaded.

**What you can do.** Download the file from that site yourself and add it to the tool. The tool does not widen its list of hosts for one run. In /convert this finding is only shown and never stops the export.

## IN-FETCH-BLOCKED — The browser could not download from a host, so the file was not read

Severity: warning

**What it checks.** The browser could not download from a host, so the file was not read. This is a limit of the browser mode, not a fault in the data.

**When it fires.** In browser mode, when a download fails before any answer arrives because the host does not allow the request (a cross-origin or content-security rule) or the network failed. It also appears in server mode when the page's own fetch route could not be reached, or when a body from a host that is not a listed IPT server was cut off midway (at an IPT server it is IN-FETCH-INTERRUPTED). The finding names the host.

**Example.** A link to a data file on a repository that sends no cross-origin permission; the browser refuses and the finding names the repository.

**What you can do.** Download the file yourself and add it to the tool, or try server mode. In /convert this finding is only shown and never stops the export.

## IN-FETCH-TIMEOUT — A host did not start to answer in time, so the browser stopped waiting and the file was not read

Severity: warning

**What it checks.** A host did not start to answer in time, so the browser stopped waiting and the file was not read.

**When it fires.** In browser mode, when a download receives no response within 30 seconds. A download that starts and is then cut off is not a timeout: at a listed IPT server it is IN-FETCH-INTERRUPTED, at another host IN-FETCH-BLOCKED. In server mode this rule does not occur. The finding names the host.

**Example.** A repository server is overloaded and sends nothing for 30 seconds; the request is abandoned and the host is named.

**What you can do.** Try again later, or switch to server mode, or download the file yourself and add it to the tool. In /convert this finding is only shown and never stops the export.

## LIC-TEXT-URI-CONFLICT — A licence statement has both a text and a link, and they do not agree

Severity: warning

**What it checks.** A licence statement has both a text and a link, and they do not agree. Either one is wrong, or the text is not about the licence at all.

**When it fires.** For one statement that has a link, when the text itself offers several licences, or the text and the link read as different licences, or a text with no version names only a licence family against the link of another family, or the link is a licence link the tool has no identifier for while the text names one, or the text names no licence and says more than plain Open Access next to a licence link. For DataCite and Zenodo it also fires when the text is an exact licence name (the full title or identifier, not an abbreviation such as CC BY 4.0, which stays LIC-FREE-TEXT) but the link is no licence link and no access value. A text that is empty, plain Open Access next to any recognised licence link, or Public Domain next to a CC0 link, is neutral and does not fire it. One finding per statement, with both readings, a dash meaning not recognised.

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

**When it fires.** For a statement whose text names a licence, when the readings of text and link agree and something is left over after the licence name and the neutral wording are removed, and the leftover has no restriction marker. It counts only next to a name the tool turns into an identifier or a family; next to one it has no identifier for (GNU GPL), such a leftover gives LIC-FREE-TEXT. A leftover with a restriction marker is LIC-ADDED-CONDITIONS instead. The finding quotes the leftover, and the leftover of another string of the same statement (identifier or Zenodo title) is added when there is one.

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
