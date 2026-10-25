// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Finding } from '../types';
import type { SplitEntry, TaxonSplit } from './taxon';
import type { NercTerm } from './vocab';

/*
 * What the converter's core produces: records in INPUT terms, not yet files. Stage 2 turns them into event.txt / occurrence.txt /
 * extendedmeasurementorfact.txt. Numbers that are written from source text keep that text (`*Text`); parsed values sit next to them.
 */

export type EventType = 'cruise' | 'station' | 'sample';

/** Where a record came from, for findings in input terms. */
export interface SourceRef {
  file: string;
  sheet: string;
  line: number;
  /** The column header (wide: the taxon column). */
  column?: string;
}

export interface EventRec {
  /** The eventID. Cruise: the cruise code. Station: `cruise:station` (or the station code without a cruise). Sample: the user's sample code, prefixed with the station eventID when the toggle is on. */
  id: string;
  parentId?: string;
  /** Written as the text "cruise" / "station" / "sample". */
  eventType: EventType;
  /** The user's own code at this level (no prefix). */
  code: string;
  /** eventDate: ISO 8601, an interval `start/end` for a parent. */
  eventDate?: string;
  /** Position. Parents get a derived one (midpoint of the children's bounding box). */
  lat?: number;
  lon?: number;
  /** Decimals to write: the source's own for a sample, 6 for a derived position. */
  latDecimals?: number;
  lonDecimals?: number;
  /** coordinateUncertaintyInMeters of a derived position: whole metres, rounded up. */
  coordinateUncertaintyInMeters?: number;
  depthMin?: number;
  depthMax?: number;
  depthDecimals?: number;
  /** A flattened station's code lives here on its samples. */
  locality?: string;
  /** Effort on a sample: written from the source text. */
  sampleSizeValue?: string;
  sampleSizeUnit?: string;
  /** Which of date / position / depth were derived from the children. */
  derived: { date: boolean; position: boolean; depth: boolean };
  source?: SourceRef;
}

export type OccurrenceStatus = 'present' | 'absent';

export interface OccRec {
  id: string;
  eventId: string;
  /** The exact header (wide) or taxon cell (long). */
  verbatimIdentification: string;
  scientificName: string;
  identificationQualifier?: string;
  lifeStage?: string;
  occurrenceStatus: OccurrenceStatus;
  /** count only: a whole number (0 for an absence). */
  individualCount?: number;
  /** count only, present records: the same number with organismQuantityType "individuals". */
  organismQuantity?: number;
  organismQuantityType?: string;
  /** The cell as written (decimal comma turned into a dot), for the density / biomass eMoF value. */
  quantityText?: string;
  /** A non-numeric cell ("+", "x"): kept here, the record has no quantity. */
  occurrenceRemarks?: string;
  /** A source column holding organismQuantityType, when the sheet has one (information only). */
  sourceQuantityType?: string;
  source: SourceRef;
}

/** A measurement the writer will turn into an eMoF row. */
export interface MofIntent {
  target: { kind: 'event' | 'occurrence'; id: string };
  /** What it is: the quantity of an occurrence (count, density, biomass) or the effort of a sample. */
  role: 'count' | 'density' | 'biomass' | 'effort';
  /** measurementType: the preferred label of the concept; empty when no verified concept exists. */
  measurementType: string;
  measurementTypeId?: string;
  measurementValue: string;
  measurementUnit?: string;
  measurementUnitId?: string;
  source: SourceRef;
}

export interface TreeSummary {
  events: number;
  cruises: number;
  stations: number;
  samples: number;
  /** Events with no parent. */
  roots: number;
  flattened: { station: boolean; cruise: boolean };
  derivedDates: number;
  derivedPositions: number;
  derivedDepths: number;
  /** Samples with no position of their own. */
  samplesWithoutPosition: number;
  /** The largest coordinateUncertaintyInMeters of a derived position. */
  maxUncertaintyM?: number;
}

export interface ConvertStats {
  samples: number;
  occurrences: number;
  present: number;
  absent: number;
  zerosSkipped: number;
  textCells: number;
  measurements: number;
}

export interface ConvertResult {
  /** No blocking finding: the core could hand these records to the writer. A blocked result still carries what could be built, for the preview. */
  ok: boolean;
  /** Every finding, CONV-* and the /check ROW-* findings of reading the cells (dates, coordinates, numbers). */
  findings: Finding[];
  /** The findings that block (severity error). */
  blocking: Finding[];
  events: EventRec[];
  occurrences: OccRec[];
  measurements: MofIntent[];
  tree: TreeSummary;
  /** Distinct taxon names and how each splits. */
  splits: SplitEntry[];
  /** Cruise codes whose level was flattened away: they belong in the dataset text (title / abstract). */
  cruiseText: string[];
  stats: ConvertStats;
}

export type { SplitEntry, TaxonSplit, NercTerm };
