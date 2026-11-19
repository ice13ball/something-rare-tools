# Rules of /licence

Generated from the rule registry (`src/core/rules/`) by `scripts/rules-docs-per-tool.ts`. Do not edit by hand.
Regenerate with `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-docs-per-tool.test.ts`.

/licence reads the licence statements of one or several records (DOI or link) and compares them: with each other, with the record in DataCite, and with the data files the repository holds back. It lists only the rules it can raise itself. A rule that /check also raises is described here in the same words.

The list is the rules the tool can raise, found by a static scan of its code, so a few may never fire in practice. Severity is error, warning or info. Every number a rule compares against is listed with its source. A text in guillemets, «name», stands for a value the tool fills in from the finding; N stands for a number; a plural form is written in the plural. The texts are the ones the tool shows (English), unchanged.

13 rules.

## Reading the file or record

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

## Licence and metadata

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
