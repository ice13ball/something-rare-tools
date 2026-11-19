// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RuleDoc } from './types';

/*
 * Licence rules. Each text was checked against src/core/checks/licence.ts (where the findings are made), src/core/licence/analyse.ts (which decides
 * what is a contradiction) and src/core/metadata/licence.ts (which reads one statement: text, link, identifier). All twelve have export policy
 * show: they are judgements about a metadata record, never a reason to stop an export.
 */
export const DOCS: Readonly<Record<string, RuleDoc>> = {
  'LIC-MISSING': {
    checks:
      'No licence is stated anywhere in the record. Without a licence nobody knows whether the data may be reused, so by default they may not.',
    fires:
      'Once per record, when the record (or all the records read for it) holds no statement about the data in any licence field (ISO useLimitation and otherConstraints, DataCite rightsList, Zenodo license and the like; statements about the metadata record itself do not count), and no source of the record failed to load. A record that could not be read says nothing about a licence, and IN-RECORD-INACCESSIBLE reports it instead. In the collection review, when the DataCite record could not be compared, the finding says it rests on the catalogue record alone.',
    example:
      'A catalogue record has title, abstract and contact, but its rights and constraints sections are empty.',
    action:
      'State the licence the authors chose by name and version with a link to its official text, in the repository record.',
  },
  'LIC-FREE-TEXT': {
    checks:
      'The licence is written only as free text that a program cannot read. A person understands it, but a harvester cannot tell whether the data are open.',
    fires:
      'Once per record, when the record has licence statements, none of them is machine-readable (an identifier field, a link to a recognised licence, or a text that is itself the identifier) and none carries a conflict (LIC-TEXT-URI-CONFLICT, LIC-ADDED-CONDITIONS, LIC-EXTRA-TEXT or LIC-AMBIGUOUS). Prose such as CC BY 4.0 without a link is free text. The finding quotes the first statement with text and says whether the text carries no version number. All rights reserved and a bare Open Access are free text too, each with a sentence of its own; All rights reserved next to a recognised licence does not raise this rule.',
    example:
      'The rights field reads: Creative Commons Attribution licence, with no version and no link.',
    action:
      'Give the identifier of the licence the authors chose and the link to its official text, so that the licence is stated by both. A licence read from the text is named by its identifier, one without a version by its family; the tool never suggests a licence the record does not state. All rights reserved is the authors\' deliberate choice (no reuse without permission); a bare Open Access says how the data can be reached, not under which terms.',
  },
  'LIC-TEXT-URI-CONFLICT': {
    checks:
      'A licence statement has both a text and a link, and they do not agree. Either one is wrong, or the text is not about the licence at all.',
    fires:
      'For one statement that has a link, when the text itself offers several licences, or the text and the link read as different licences, or a text with no version names only a licence family against the link of another family, or the link is a licence link the tool has no identifier for while the text names one, or the text names no licence and says more than plain Open Access next to a licence link. For DataCite and Zenodo it also fires when the text is an exact licence name (the full title or identifier, not an abbreviation such as CC BY 4.0, which stays LIC-FREE-TEXT) but the link is no licence link and no access value. A text that is empty, plain Open Access next to any recognised licence link, or Public Domain next to a CC0 link, is neutral and does not fire it. One finding per statement, with both readings, a dash meaning not recognised.',
    example:
      'The text says CC BY 4.0 and the link points to the page of the CC BY-NC 4.0 licence.',
    action:
      'Decide which licence applies and write it once, with its own link and with a text that names the same licence.',
  },
  'LIC-ADDED-CONDITIONS': {
    checks:
      'A licence text names a licence and then adds conditions to it. With extra conditions it is no longer the standard licence and cannot be treated as one.',
    fires:
      'For a statement whose text names a licence, when nothing else contradicts it (the readings of text and link agree) and what is left of the text after the licence name and the neutral wording are taken away contains a restriction marker, such as a limit on commercial use or a duty to ask for permission (words in Polish, English, German and French are looked for). The finding quotes the leftover. When the identifier or the Zenodo title leaves something too, that is added to the finding. A leftover with no restriction marker is LIC-EXTRA-TEXT instead.',
    example:
      'The text reads CC BY 4.0, commercial use only with written permission of the authors.',
    action:
      'State the licence alone, or name the extra conditions explicitly as such and say that the data are not under the plain licence.',
  },
  'LIC-EXTRA-TEXT': {
    checks:
      'A licence text names a licence and also says something else. The extra words may change the licence, so the statement is not read as the standard licence until a person has looked.',
    fires:
      'For a statement whose text names a licence, when the readings of text and link agree and something is left over after the licence name and the neutral wording are removed, and the leftover has no restriction marker. It counts only next to a name the tool turns into an identifier or a family; next to one it has no identifier for (GNU GPL), such a leftover gives LIC-FREE-TEXT. A leftover with a restriction marker is LIC-ADDED-CONDITIONS instead. The finding quotes the leftover, and the leftover of another string of the same statement (identifier or Zenodo title) is added when there is one.',
    example:
      'The text reads CC BY 4.0, please contact the data manager.',
    action:
      'Move the extra sentence to the description of the data and leave the licence field with the licence only.',
  },
  'LIC-OTHER-RIGHTS-ENTRY': {
    checks:
      'A repeated rights entry that is no recognised licence stands next to a licence the same record does recognise. The other entry may restrict or change the licence.',
    fires:
      'Once per source of the record, only for repeated entries (DataCite rightsList, Zenodo rights, the licences a Dataverse states per file), never for the fields of an ISO record, when the record has a recognised licence and another repeated entry that is no recognised licence, has no conflict of its own and is not a neutral value: a plain access word, or a notice that only names the creators, the organisations or the publisher of the record. Repeated recognised licences are read as dual licensing and do not fire it. The finding quotes the entry, or its link, and names the recognised licence.',
    example:
      'A rights list holds CC BY 4.0 and a second entry, Data may not be redistributed without consent.',
    action:
      'Remove the second entry or move it to the description, or state clearly how it relates to the licence.',
  },
  'LIC-SEPARATE-RESTRICTION': {
    checks:
      'A restriction written in a field of its own stands next to a recognised licence of the same source. The licence and a restriction on who may use the data do not fit together, so a reader cannot tell what is allowed.',
    fires:
      'Once per restriction, for free text in a field next to a recognised licence of the same source (ISO otherConstraints or useLimitation; Dataverse terms of use) that narrows it: access limited to partners or a project, confidential or embargoed, non-commercial or research use only, no derivatives or redistribution, registration or an agreement required, on request only, or contact or permission needed first. The same sentence in several fields is one finding. Negations ("no embargo", "unrestricted") and attribution wording ("without acknowledging the source") do not fire it, nor does NonCommercial text next to a NonCommercial licence. Left to other rules: LIC-ADDED-CONDITIONS, LIC-OTHER-RIGHTS-ENTRY, and LIC-RESTRICTION-CONFLICT, which also takes an access restriction when a restriction code conflicts.',
    example:
      'An ISO record holds CC BY 4.0 in one otherConstraints element and Data access restricted to project partners in another.',
    action:
      'Decide which statement is true. Remove the restriction if the data are open, or replace the licence with the real conditions of use.',
  },
  'LIC-SEVERAL-LICENCES': {
    checks:
      'One record states two or more different licences at once. It does not say which one covers the data and which one only the description or a part of it.',
    fires:
      'Once per set of licences, when the repeated entries of a record (DataCite rightsList, Zenodo licence next to rights) hold two or more different recognised licences. The same licence given as identifier, link and name, in one entry or in several, is one licence and does not fire it; two versions of one family are two licences. It does not fire for the licences a Dataverse states per file, for the metadata constraints of an ISO record (labelled as the licence of the metadata), or for a second entry that is no licence (LIC-OTHER-RIGHTS-ENTRY) or only a restriction (LIC-SEPARATE-RESTRICTION). Different licences in non-repeated fields of one record stay LIC-MISMATCH. Between records one shared licence still suffices. DataCite and Zenodo do not label a licence of the metadata, so the finding asks the authors to say it in the description. /convert reads such a record as before.',
    example:
      'A DataCite rights list holds CC BY 4.0 and, as a second entry, CC BY-NC-ND 4.0.',
    action:
      'Keep the licence of the data in the record. If the dual licensing is deliberate, say in the description that the user chooses one; if one licence is for the metadata, say that in the description.',
  },
  'LIC-OBIS-LICENCE': {
    checks:
      'Whether OBIS and GBIF accept the one licence the record states. Information only, never a warning.',
    fires:
      'Once per dataset in /licence only (not in /check or the collection review), when exactly one recognised licence is stated. It says the licence is accepted (CC0, CC BY 4.0 or CC BY-NC 4.0, the list /convert takes) or not accepted, and names what is accepted. It does not appear when no licence is recognised (missing, free text) or when the record contradicts itself, for example a restriction or a non-commercial condition next to the licence (the licence /convert would refuse) or when the record states several different licences.',
    example:
      'A rights list holds CC BY-SA 4.0 only.',
    action:
      'Nothing to fix. If you plan to submit the data to OBIS or GBIF, choose one of the accepted licences.',
  },
  'LIC-AMBIGUOUS': {
    checks:
      'A licence statement without a link reads as more than one licence. It cannot be assigned to one licence, so a harvester cannot tell what is allowed.',
    fires:
      'For one statement with no link, when its strings (the rights text, the identifier, the title) name different licences, when it names two licences or a licence family and a licence, when a versionless family such as CC BY is read against a named version of another family, or when a recognised name stands next to one the tool has no identifier for. One finding per statement, which lists what it reads as, separated by a slash, a dash meaning a name with no identifier. The same text with a link is LIC-TEXT-URI-CONFLICT.',
    example:
      'The text reads CC BY 4.0 (CC BY-NC) and no link is given.',
    action:
      'State one licence, with its identifier and link. If both licences really apply, list them as separate entries and say so in the description.',
  },
  'LIC-RESTRICTION-CONFLICT': {
    checks:
      'The record names an open licence and also carries a restriction code that says the data are restricted. The two cannot both describe the data.',
    fires:
      'Once per record, when a record carries a restrictive ISO restriction code (copyright, patent, patentPending, trademark, intellectualPropertyRights or restricted) and the record names an open licence: a recognised open identifier, or an open licence family as written, even without a version. The codes license and otherRestrictions never count, the first because it is the normal way to say that a licence applies and the second because it only points to the constraints text. A non-commercial or no-derivatives licence is not open here. The finding lists the codes and the licence.',
    example:
      'A record states CC BY 4.0 in otherConstraints and the code copyright in its restriction code.',
    action:
      'If the licence is the true statement, replace the code with license, or with otherRestrictions plus a description of the conditions, as INSPIRE expects. If the data are in fact restricted, state the restriction instead of the open licence.',
  },
  'LIC-FILES-HELD-BACK': {
    checks:
      'Some files of the dataset are under restricted access or an embargo. Whatever licence the metadata states, the repository decides who may get these files.',
    fires:
      'Once per record, when a Dataverse record lists files that are restricted or embargoed. The finding names up to ten of the files and counts the rest. The licence verdict of the tool covers only the open files, and the page says so.',
    example:
      'A Dataverse dataset has four files, and two of them are marked restricted.',
    action:
      'If the held files are the data, say in the description how and when they can be obtained, or open them.',
  },
  'LIC-ACCESS-HELD-BACK': {
    checks:
      'Whether the Zenodo record or the PANGAEA dataset is openly accessible. Whatever licence the metadata states, the repository decides who may get the data.',
    fires:
      'Once per dataset, when a Zenodo record is embargoed, restricted or closed (the older access_right field and the newer access block are both read), or a PANGAEA dataset states in its technical information that it needs a signup (a login) or access rights (restricted); the licence wording is never used for this. A PANGAEA dataset that needs access rights usually carries the licence UNKNOWN as a consequence; that licence is not reported separately, so this is its only finding. For an embargo the finding names the end date when the record gives one, and an embargo date that cannot be read is reported as an embargo without a date. An embargo whose date has already passed (in either Zenodo shape), a lifted embargo and open access say nothing. Dataverse files held back have their own rule, LIC-FILES-HELD-BACK.',
    example:
      'A Zenodo record has access_right "embargoed" and an embargo_date in the future.',
    action:
      'If the data are the restricted part, say in the description how and when they can be obtained, or open them.',
  },
  'LIC-DATACITE-EMPTY': {
    checks:
      'The DOI registration record at DataCite states no licence. Harvesters read that record first, so the data look unlicensed to them.',
    fires:
      'Once per record, when the DataCite record was read and has no licence statement, and either another source of the record states a licence or some source could not be read. The finding names the licence of the other record, and a dash when none states one or the main record could not be read. It is not counted as a contradiction between records, because silence contradicts nothing.',
    example:
      'The Zenodo record of a dataset says CC BY 4.0, and the DataCite record of its DOI has an empty rights list.',
    action:
      'Add the licence to the DOI record at the registration agency.',
  },
  'LIC-MISMATCH': {
    checks:
      'Two records, or two fields of one record, state different licences. A reader cannot tell which one applies.',
    fires:
      'Once per record (only the first disagreeing pair is reported), when two sources that each have a recognised licence share none of them, or when different recognised licences stand in different fields of one source, outside the repeated rights entries a publisher offers on purpose. Records of one deposit, such as a Zenodo record and the DataCite record of its DOI, are compared to each other. Statements that are not recognised do not take part. The finding names the two identifiers.',
    example:
      'The catalogue record says CC BY 4.0 and the DataCite record says CC BY-SA 4.0.',
    action:
      'Make the licence the same in every record of the dataset.',
  },
};
