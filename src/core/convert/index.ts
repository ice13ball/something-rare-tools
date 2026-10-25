// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * Public API of the converter core (stage 1a). Pure, no I/O. The /convert page (stage 1b) calls:
 *
 *   proposeConvertColumns / proposeConvertMapping / suggestConvertShape   column roles to confirm (recognize.ts)
 *   listSplits                                                            distinct taxon names and their splits, to approve (build.ts)
 *   convert                                                               sheets + decisions -> records + findings (build.ts)
 *   proposeSampleCodes                                                    one-time sample codes for a sheet without them (ids.ts)
 *   buildEventTree / summarizeTree                                        the cruise > station > sample tree and its preview counts (events.ts)
 *   resolveQuantity                                                       is the quantity declaration complete? what concepts does it give? (quantity.ts)
 *   readConvertSettings / writeConvertSidecar                             the companion file (settings.ts)
 *   classifyMatches / entryOf / lookupOf / wormsBatches ...               stage 4: what a WoRMS answer means, the entries a conversion takes (worms.ts; the fetch is app/optins/worms.ts)
 *   renderConvertPlain / renderConvertTechnical                           the text of a CONV finding (rules/convert.ts)
 *   toDataset / buildTables / archiveFiles / buildEml / buildZip           stage 2: the export model, the files of the archive, eml.xml, the zip
 *   validateTables / metadataFindings / policyOf / judge                  stage 2: the checks of the output tables and what each finding does to the export
 */
export { convert, listSplits } from './build';
export type { ConvertInput, ConvertOptions, ConvertSheetInput, SamplingDevice } from './build';
export { buildEventTree, eventDateText, greatCircleM, stationEventId, summarizeTree } from './events';
export type { EventTree, SampleSite, TreeOptions } from './events';
export { proposeSampleCodes } from './ids';
export { readConvertFile } from './read';
export type { SampleCodeProposal } from './ids';
export type { ConvertResult, ConvertStats, EventRec, EventType, MofIntent, OccRec, OccurrenceStatus, SourceRef, TreeSummary } from './model';
export { parseEffortUnit, parseRateUnit, resolveQuantity } from './quantity';
export type { BiomassBasis, EffortDeclaration, EffortDimension, QuantityDeclaration, QuantityKind, QuantityResolution, ResolvedQuantity } from './quantity';
export { proposeConvertColumns, proposeConvertMapping, suggestConvertShape } from './recognize';
export type { ConvertShape } from './recognize';
export { FULL_LIST_SETTING, NVS_SETTING, STATION_PREFIX_SETTING, WORMS_SETTING, readConvertSettings, writeConvertSidecar } from './settings';
export type { ConvertSettings } from './settings';
export { QUALIFIER_TOKENS, STAGE_TOKENS, bulkApprovable, distinctSplits, nameDoubt, splitChanged, splitTaxon } from './taxon';
export type { ApprovedSplits, NameDoubt, SplitEntry, TaxonSplit } from './taxon';
export { DEVICES, P01, P06, VARIABLE_CONCEPTS, VARIABLE_SYNONYMS, VARIABLE_UNITS, VARIABLE_VERIFIED_CODES, VERIFIED_CODES, conceptVariable, foldUnit, labelDimension, nercUri, unitConcept, unitDimension } from './vocab';
export type { DeviceKey, NercTerm, PerDimension, VariableConcept, VariableUnit } from './vocab';
export { P01_URI, P06_URI, conceptUri, pickLabel, readDecision, readPick, suggestType, suggestUnit, suggestedPick, unitContradictsConcept } from './nerc';
export type { NercColumnDecision, NercDecisions, NercPick, NercSource, TypeSuggestion } from './nerc';
export { NVS_LIMIT, nvsQuery, readConceptJsonLd, readSparqlAnswer, searchWords, sparqlLiteralBody, typedCode } from './nvs';
export type { NvsCollection, NvsConcept } from './nvs';
export { ORGANISATION_WORDS, isOrganisationName, partyOf, BASES_OF_RECORD, EMPTY_METADATA, EML_VERSION, GBIF_PROFILE_VERSION, LICENCES, applyPrefill, refreshPrefill, NAME_PARTICLES, creatorLines, datasetNameOf, isBasis, isLicence, missingFields, splitPersonName } from './metadata';
export type { BasisOfRecord, DatasetMetadata, LicenceId } from './metadata';
export { WORMS_BATCH_MAX, classifyMatches, entryOf, isNotMarine, isUnaccepted, lookupOf, readWormsAnswer, readWormsRecord, wormsBatches, wormsEntry, wormsLsid } from './worms';
export type { ChooseWhy, MatchClass, WormsChoice, WormsEntry, WormsLookup, WormsRecord } from './worms';
export { toDataset } from './model';
export type { ConvertedDataset, Effort, Identification, ModelEvent, ModelMeasurement, ModelOccurrence, Quantity } from './model';
export { archiveFileName, archiveFiles, buildTables, slugOf, writeMetaXml, writeTsv } from './dwca';
export type { ArchiveFile, ArchiveTables, Table } from './dwca';
export { LICENCE_ULINK, buildEml, coverageOf } from './eml';
export { ZipWriteError, buildZip, crc32, streamDeflate } from './zip';
export type { Deflate } from './zip';
export { ACCEPT_RULES, BLOCK_CONV_RULES, BLOCK_INPUT_RULES, BLOCK_OUTPUT_RULES, SHOW_ONLY_PREFIXES, exportAllowed, judge, policyOf } from './policy';
export type { Judged, Policy } from './policy';
export { licenceDiffersFindings, metadataFindings, validateDataset, validateTables } from './validate';
export { CONVERT_RULES, getConvertRule, isConvertRuleId, makeConvertFinding, renderConvertPlain, renderConvertTechnical } from '../rules/convert';
export { buildPrefill, cleanText, licenceCaseOf, licenceSourceOf, recognisedLicenceIds, metadataKindName, prefillValues, PREFILL_KEYS } from './prefill';
export type { Candidate, ConvertPrefill, CoverageSaid, LicenceCase, LicenceSaid, MetadataFileInfo, PrefillKey, SourceRef as PrefillSourceRef } from './prefill';
