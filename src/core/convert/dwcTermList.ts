// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { termOf, type TermLevel } from './dwcTerms';

/*
 * The pick list of Darwin Core terms a column of /convert can be written under: the GBIF occurrence and sampling-event terms and the OBIS checklist terms whose status is
 * required, strongly recommended or recommended. Not in it: "optional" terms (a header that names one EXACTLY still gets the role: dwcTermColumns.ts), the DNA terms and the
 * measurement* terms (those are the eMoF reading of a long measurement sheet, emofRoles.ts).
 *
 * Sources, checked 26.11.2026:
 *   GBIF  https://techdocs.gbif.org/en/data-publishing/data-quality-recommendations   (Table 2 occurrences, Table 3 sampling events; the column for ordinary publishers.
 *         "Conditionally required" is kept as it is, "Share if available" is "recommended")
 *   OBIS  https://manual.obis.org/checklist.html and https://manual.obis.org/darwin_core.html   (required: 7 terms; strongly recommended scientificNameID)
 * A term that both name keeps both statuses; a term that two GBIF tables name keeps the stronger one.
 */

export type TermStatus = 'required' | 'required if exists' | 'conditionally required' | 'strongly recommended' | 'recommended';

export interface ListedTerm {
  /** The canonical term name (dwcTerms.ts termOf). */
  name: string;
  /** The table the term belongs to; 'record' terms are valid in every table. */
  level: Exclude<TermLevel, 'emof'>;
  statuses: { gbif?: TermStatus; obis?: TermStatus };
}

const words = (s: string): string[] => s.split(/\s+/).filter((w) => w !== '');

// GBIF, Table 2 (occurrences)
const GBIF_OCCURRENCE: [TermStatus, string][] = [
  ['required', 'occurrenceID'],
  ['conditionally required', 'country countryCode'],
  ['strongly recommended', `basisOfRecord scientificName eventDate decimalLatitude decimalLongitude taxonRank kingdom geodeticDatum coordinateUncertaintyInMeters organismQuantity
    organismQuantityType`],
  ['recommended', 'informationWithheld dataGeneralizations eventTime'],
];
// GBIF, Table 3 (sampling events)
const GBIF_EVENT: [TermStatus, string][] = [
  ['required', 'type'],
  ['conditionally required', 'countryCode'],
  ['strongly recommended', `eventID eventDate samplingProtocol sampleSizeValue sampleSizeUnit decimalLatitude decimalLongitude parentEventID samplingEffort locationID geodeticDatum
    coordinateUncertaintyInMeters footprintWKT occurrenceStatus`],
];
// OBIS checklist
const OBIS: [TermStatus, string][] = [
  ['required', 'eventDate eventID decimalLatitude decimalLongitude occurrenceID occurrenceStatus basisOfRecord scientificName'],
  ['required if exists', 'parentEventID'],
  ['strongly recommended', `scientificNameID eventType month sampleSizeUnit sampleSizeValue samplingEffort samplingProtocol year continent coordinatePrecision
    coordinateUncertaintyInMeters locationID maximumDepthInMeters minimumDepthInMeters organismQuantity organismQuantityType license type taxonRank genus kingdom order`],
  ['recommended', `day endDayOfYear eventTime habitat startDayOfYear verbatimEventDate identificationQualifier identificationRemarks country footprintWKT geodeticDatum locality
    locationAccordingTo locationRemarks waterBody materialSampleID associatedMedia associatedSequences catalogNumber georeferenceVerificationStatus individualCount
    occurrenceRemarks recordedBy recordedByID recordNumber organismID previousIdentifications accessRights bibliographicCitation datasetID datasetName dynamicProperties
    language modified references rightsHolder acceptedNameUsage acceptedNameUsageID higherClassification infraspecificEpithet nameAccordingToID verbatimIdentification
    originalNameUsage originalNameUsageID parentNameUsage parentNameUsageID phylum scientificNameAuthorship specificEpithet subgenus taxonRemarks verbatimTaxonRank
    vernacularName class family`],
];

const RANK: Record<TermStatus, number> = { required: 0, 'required if exists': 1, 'conditionally required': 2, 'strongly recommended': 3, recommended: 4 };
const stronger = (a: TermStatus | undefined, b: TermStatus): TermStatus => (a === undefined || RANK[b] < RANK[a] ? b : a);

function build(): ListedTerm[] {
  const byName = new Map<string, ListedTerm>();
  const add = (source: 'gbif' | 'obis', rows: [TermStatus, string][]): void => {
    for (const [status, names] of rows) {
      for (const n of words(names)) {
        const t = termOf(n);
        // a name the term table does not know (or a measurement term) is a mistake of this list: the test names it
        if (t === undefined || t.level === 'emof') continue;
        const e = byName.get(t.name) ?? { name: t.name, level: t.level, statuses: {} };
        e.statuses[source] = stronger(e.statuses[source], status);
        byName.set(t.name, e);
      }
    }
  };
  add('gbif', GBIF_OCCURRENCE);
  add('gbif', GBIF_EVENT);
  add('obis', OBIS);
  return [...byName.values()];
}

/** Every term of the lists above, in the order they are first named (GBIF occurrence, GBIF event, OBIS). */
export const DWC_TERM_LIST: readonly ListedTerm[] = build();

/** The names the lists above spell, for a test that every one of them is a term the converter knows. */
export const LISTED_NAMES: readonly string[] = [...GBIF_OCCURRENCE, ...GBIF_EVENT, ...OBIS].flatMap(([, names]) => words(names));
