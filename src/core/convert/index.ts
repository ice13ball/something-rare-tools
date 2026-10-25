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
 *   renderConvertPlain / renderConvertTechnical                           the text of a CONV finding (rules/convert.ts)
 */
export { convert, listSplits } from './build';
export type { ConvertInput, ConvertOptions, ConvertSheetInput } from './build';
export { buildEventTree, eventDateText, greatCircleM, stationEventId, summarizeTree } from './events';
export type { EventTree, SampleSite, TreeOptions } from './events';
export { proposeSampleCodes } from './ids';
export type { SampleCodeProposal } from './ids';
export type { ConvertResult, ConvertStats, EventRec, EventType, MofIntent, OccRec, OccurrenceStatus, SourceRef, TreeSummary } from './model';
export { parseEffortUnit, parseRateUnit, resolveQuantity } from './quantity';
export type { BiomassBasis, EffortDeclaration, EffortDimension, QuantityDeclaration, QuantityKind, QuantityResolution, ResolvedQuantity } from './quantity';
export { proposeConvertColumns, proposeConvertMapping, suggestConvertShape } from './recognize';
export type { ConvertShape } from './recognize';
export { FULL_LIST_SETTING, STATION_PREFIX_SETTING, readConvertSettings, writeConvertSidecar } from './settings';
export type { ConvertSettings } from './settings';
export { QUALIFIER_TOKENS, STAGE_TOKENS, distinctSplits, splitChanged, splitTaxon } from './taxon';
export type { ApprovedSplits, SplitEntry, TaxonSplit } from './taxon';
export { P01, P06, VERIFIED_CODES, nercUri } from './vocab';
export { CONVERT_RULES, getConvertRule, isConvertRuleId, makeConvertFinding, renderConvertPlain, renderConvertTechnical } from '../rules/convert';
