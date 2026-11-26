// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

/*
 * The Darwin Core terms (and the OBIS measurement terms) the as-is reading knows, grouped by the table they belong to. A header is a term when its name
 * is exactly a term name, in any letter case, with an optional `dwc:` / `obis:` prefix or the full term URI in front. Nothing is read from cell values.
 */

const words = (s: string): string[] => s.split(/\s+/).filter((w) => w !== '');

/** Terms of the Event table (record-level, event, location). They are also valid in the Occurrence table, as OBIS reads them there. */
const EVENT = words(`eventID parentEventID eventType eventDate eventTime startDayOfYear endDayOfYear year month day verbatimEventDate habitat samplingProtocol
  sampleSizeValue sampleSizeUnit samplingEffort fieldNumber fieldNotes eventRemarks locationID higherGeographyID higherGeography continent waterBody islandGroup
  island country countryCode stateProvince county municipality locality verbatimLocality verbatimElevation verbatimDepth minimumDepthInMeters maximumDepthInMeters
  minimumDistanceAboveSurfaceInMeters maximumDistanceAboveSurfaceInMeters minimumElevationInMeters maximumElevationInMeters locationAccordingTo locationRemarks
  decimalLatitude decimalLongitude geodeticDatum coordinateUncertaintyInMeters coordinatePrecision pointRadiusSpatialFit verbatimCoordinates verbatimLatitude
  verbatimLongitude verbatimCoordinateSystem verbatimSRS footprintWKT footprintSRS footprintSpatialFit georeferencedBy georeferencedDate georeferenceProtocol
  georeferenceSources georeferenceVerificationStatus georeferenceRemarks`);

/** Record-level terms: valid in every table. */
const RECORD = words(`type modified language license rightsHolder accessRights bibliographicCitation references institutionID collectionID datasetID institutionCode
  collectionCode datasetName ownerInstitutionCode basisOfRecord informationWithheld dataGeneralizations dynamicProperties`);

/** Terms of the Occurrence table only: the occurrence, the organism, the identification and the taxon. */
const OCCURRENCE = words(`occurrenceID catalogNumber recordNumber recordedBy recordedByID individualCount organismQuantity organismQuantityType sex lifeStage
  reproductiveCondition caste behavior vitality establishmentMeans degreeOfEstablishment pathway occurrenceStatus preparations disposition otherCatalogNumbers
  associatedMedia associatedOccurrences associatedReferences associatedSequences associatedTaxa occurrenceRemarks organismID organismName organismScope
  associatedOrganisms previousIdentifications organismRemarks materialSampleID identificationID identifiedBy identifiedByID dateIdentified identificationReferences
  identificationVerificationStatus identificationRemarks identificationQualifier typeStatus taxonID scientificNameID acceptedNameUsageID parentNameUsageID
  originalNameUsageID nameAccordingToID namePublishedInID taxonConceptID scientificName acceptedNameUsage parentNameUsage originalNameUsage nameAccordingTo
  namePublishedIn namePublishedInYear higherClassification kingdom phylum class order family subfamily genus genericName subgenus infragenericEpithet
  specificEpithet infraspecificEpithet cultivarEpithet taxonRank verbatimTaxonRank scientificNameAuthorship vernacularName nomenclaturalCode taxonomicStatus
  nomenclaturalStatus taxonRemarks`);

/** The measurement terms of the eMoF table. The three `...ID` ones live in the OBIS namespace. */
const EMOF_OWN = words(`measurementID measurementType measurementTypeID measurementValue measurementValueID measurementAccuracy measurementUnit measurementUnitID
  measurementDeterminedDate measurementDeterminedBy measurementMethod measurementRemarks`);
const OBIS_TERMS = new Set(['measurementTypeID', 'measurementValueID', 'measurementUnitID']);

export type TermLevel = 'event' | 'occurrence' | 'emof' | 'record';

const LEVEL = new Map<string, { name: string; level: TermLevel }>();
const lower = (s: string): string => s.toLowerCase();
for (const [list, level] of [[EVENT, 'event'], [RECORD, 'record'], [OCCURRENCE, 'occurrence'], [EMOF_OWN, 'emof']] as const) for (const name of list) LEVEL.set(lower(name), { name, level });

const PREFIX = /^(?:dwc:|obis:|dcterms:|http:\/\/rs\.tdwg\.org\/dwc\/terms\/|http:\/\/rs\.iobis\.org\/obis\/terms\/|http:\/\/purl\.org\/dc\/terms\/)/i;

/** The canonical term a header names, with the table level the term belongs to; undefined for a header that is not a term. */
export function termOf(header: string): { name: string; level: TermLevel } | undefined {
  return LEVEL.get(lower(header.trim().replace(PREFIX, '')));
}

export const isObisTerm = (name: string): boolean => OBIS_TERMS.has(name);

/** Whether a term may stand in the table of a level: the Event table takes event and record terms, Occurrence adds its own, eMoF takes measurement terms and the two links. */
export function validIn(level: 'event' | 'occurrence' | 'emof', term: { name: string; level: TermLevel }): boolean {
  if (level === 'emof') return term.level === 'emof' || term.name === 'eventID' || term.name === 'occurrenceID';
  if (term.level === 'record' || term.level === 'event') return true;
  return level === 'occurrence' && term.level === 'occurrence';
}
