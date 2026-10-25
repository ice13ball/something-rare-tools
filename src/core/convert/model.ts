// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Finding } from '../types';
import type { DatasetMetadata } from './metadata';
import type { ConvertSettings } from './settings';
import type { SplitEntry, TaxonSplit } from './taxon';
import type { NercTerm } from './vocab';

/*
 * What the converter's core produces: records in INPUT terms, not yet files. Stage 2 turns them into event.txt / occurrence.txt /
 * extendedmeasurementorfact.txt. Numbers that are written from source text keep that text (`*Text`); parsed values sit next to them.
 */

/**
 * The eventType texts. The OBIS Manual has no controlled list ("At this time, there is no Darwin Core event type term", Common data formatting issues, "How to
 * handle mixed date information") and its example values are cruise, station and sample. A row of a profile file (a CTD scan, a bottle, one depth of a cast) is written
 * as "profile level": the nature of the event, in the same plain style, not a sample of a biology sheet.
 */
export type EventType = 'cruise' | 'station' | 'sample' | 'profile level';

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
  /** Written as the text "cruise" / "station" / "sample" / "profile level". */
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
  /** The source text of a sample's position / depth when it came from one plain number cell: written as it is (events.ts SampleSite). */
  latText?: string;
  lonText?: string;
  depthMinText?: string;
  depthMaxText?: string;
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
  /** Darwin Core sex, from a ", f" / ", m" suffix of the taxon text. */
  sex?: 'female' | 'male';
  occurrenceStatus: OccurrenceStatus;
  /** The taxon's scientificNameID: the user's column as given, the urn:lsid of an AphiaID column, or the confirmed result of the WoRMS opt-in (stage 4). */
  scientificNameId?: string;
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
  role: 'count' | 'density' | 'biomass' | 'effort' | 'device' | 'mesh' | 'variable' | 'pressure';
  /** measurementType: the preferred label of the concept; empty when no verified concept exists. */
  measurementType: string;
  measurementTypeId?: string;
  measurementValue: string;
  /** A device with a verified L22 / L05 concept: its URI. */
  measurementValueId?: string;
  measurementUnit?: string;
  measurementUnitId?: string;
  /** Set when `measurementType` is empty because no concept is verified: the declared meaning in words, for the export (never an id). */
  measurementTypeFallback?: string;
  source: SourceRef;
}

export interface TreeSummary {
  events: number;
  cruises: number;
  stations: number;
  samples: number;
  /** Profile levels (stage 6): one event per row of a profile file, under its station. */
  levels: number;
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
  /** Profile levels written (stage 6). */
  levels: number;
  occurrences: number;
  present: number;
  absent: number;
  zerosSkipped: number;
  textCells: number;
  measurements: number;
  /**
   * Measured-variable columns (stage 5): `columns` written as eMoF rows, and how many of them got a confirmed measurementTypeID (`typeIds`) and measurementUnitID
   * (`unitIds`); `nvsIds` of those identifiers came from the user's NVS search. Counts only: never a name, a word or a label.
   */
  nerc: { columns: number; typeIds: number; unitIds: number; nvsIds: number };
}

/** What the profile files (stage 6) did, as counts and station names: the page shows this, never the levels themselves. */
export interface ProfileSummary {
  /** Profile sheets read. */
  sheets: number;
  /** Level events written. */
  levels: number;
  /** Distinct stations of the profile sheets that match a station of the biology sheets (exact text, cruise when given). */
  stationsMatched: number;
  /** Distinct stations that match none: each became its own station event (CONV-PROFILE-STATION-UNMATCHED). */
  stationsUnmatched: number;
  /** The unmatched stations as their eventIDs, in first-seen order, at most `UNMATCHED_SHOWN` (the finding keeps the whole list). */
  unmatched: string[];
}

export const UNMATCHED_SHOWN = 12;

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
  /**
   * The WoRMS opt-in's input (stage 4): the distinct scientificName values, after the approved splits, of the occurrences that have no scientificNameID from
   * the sheet: the names a lookup would send, and nothing else. `withSheetId` = distinct names left out because the sheet gives them an ID on at least one row; `applied` = occurrences that got a WoRMS ID from the lookup.
   */
  nameLookup: { names: string[]; withSheetId: number; applied: number };
  /** Cruise codes whose level was flattened away: they belong in the dataset text (title / abstract). */
  cruiseText: string[];
  stats: ConvertStats;
  /** The profile files (stage 6). */
  profile: ProfileSummary;
}

export type { SplitEntry, TaxonSplit, NercTerm };

/* ---------- the export model (stage 2, plan 3.1) ---------- */

/*
 * What the writers take. The records above are in INPUT terms (flat, close to the sheet); this model groups what belongs together so a later
 * writer for another profile (Darwin Core Data Package) can map it without re-deriving anything: an occurrence's IDENTIFICATION (what was
 * seen), its QUANTITY (how much) and an event's EFFORT (how much was sampled) each stay one object. `toDataset` is the only place the flat
 * records are turned into it.
 */

/** What was seen: the exact text of the sheet, and the name, qualifier and stage the user approved. */
export interface Identification {
  verbatim: string;
  scientificName: string;
  qualifier?: string;
  scientificNameId?: string;
  lifeStage?: string;
  sex?: 'female' | 'male';
}

/** How much, for a count. Density and biomass are measurements (ModelMeasurement), not fields of the occurrence. */
export interface Quantity {
  individualCount?: number;
  organismQuantity?: number;
  organismQuantityType?: string;
}

/** How much was sampled: written from the source text. */
export interface Effort {
  value: string;
  unit: string;
}

export interface ModelEvent {
  id: string;
  parentId?: string;
  type: EventType;
  date?: string;
  position?: { lat: number; lon: number; latDecimals?: number; lonDecimals?: number; latText?: string; lonText?: string; derived?: boolean; uncertaintyM?: number };
  depth?: { min?: number; max?: number; decimals?: number; minText?: string; maxText?: string };
  effort?: Effort;
  locality?: string;
  source?: SourceRef;
}

export interface ModelOccurrence {
  id: string;
  eventId: string;
  identification: Identification;
  status: OccurrenceStatus;
  quantity?: Quantity;
  /** '' = not chosen yet (blocks; nothing is exported in that state). */
  basisOfRecord: string;
  remarks?: string;
  source: SourceRef;
}

/** One eMoF row. The eventID is always filled: for an occurrence's measurement it is the eventID of that occurrence. */
export interface ModelMeasurement {
  eventId: string;
  occurrenceId?: string;
  type: string;
  typeId?: string;
  value: string;
  valueId?: string;
  unit?: string;
  unitId?: string;
  source: SourceRef;
}

export interface ConvertedDataset {
  events: ModelEvent[];
  occurrences: ModelOccurrence[];
  measurements: ModelMeasurement[];
  metadata: DatasetMetadata;
  /** The decisions the companion file keeps. */
  decisions: ConvertSettings;
}

/**
 * The flat records of a conversion as the export model. A measurement of an occurrence takes the eventID of that occurrence; one whose occurrence is
 * unknown keeps the id of its own target, so the cross-table check (CONV-EMOF-ORPHAN) can name it. The measurementType text is the preferred
 * label of the NERC concept, or, when no concept is verified, the declared meaning (CONV-NERC-UNKNOWN says the id is missing).
 */
export function toDataset(result: Pick<ConvertResult, 'events' | 'occurrences' | 'measurements'>, metadata: DatasetMetadata, decisions: ConvertSettings): ConvertedDataset {
  const events: ModelEvent[] = result.events.map((e) => {
    const m: ModelEvent = { id: e.id, type: e.eventType };
    if (e.parentId !== undefined) m.parentId = e.parentId;
    if (e.eventDate !== undefined) m.date = e.eventDate;
    if (e.lat !== undefined && e.lon !== undefined) {
      m.position = { lat: e.lat, lon: e.lon };
      if (e.latDecimals !== undefined) m.position.latDecimals = e.latDecimals;
      if (e.lonDecimals !== undefined) m.position.lonDecimals = e.lonDecimals;
      if (e.latText !== undefined) m.position.latText = e.latText;
      if (e.lonText !== undefined) m.position.lonText = e.lonText;
      if (e.derived.position) m.position.derived = true;
      if (e.coordinateUncertaintyInMeters !== undefined) m.position.uncertaintyM = e.coordinateUncertaintyInMeters;
    }
    if (e.depthMin !== undefined || e.depthMax !== undefined) {
      m.depth = {};
      if (e.depthMin !== undefined) m.depth.min = e.depthMin;
      if (e.depthMax !== undefined) m.depth.max = e.depthMax;
      if (e.depthDecimals !== undefined) m.depth.decimals = e.depthDecimals;
      if (e.depthMinText !== undefined) m.depth.minText = e.depthMinText;
      if (e.depthMaxText !== undefined) m.depth.maxText = e.depthMaxText;
    }
    if (e.sampleSizeValue !== undefined && e.sampleSizeUnit !== undefined) m.effort = { value: e.sampleSizeValue, unit: e.sampleSizeUnit };
    if (e.locality !== undefined) m.locality = e.locality;
    if (e.source) m.source = e.source;
    return m;
  });
  const occurrences: ModelOccurrence[] = result.occurrences.map((o) => {
    const identification: Identification = { verbatim: o.verbatimIdentification, scientificName: o.scientificName };
    if (o.identificationQualifier !== undefined) identification.qualifier = o.identificationQualifier;
    if (o.lifeStage !== undefined) identification.lifeStage = o.lifeStage;
    if (o.scientificNameId !== undefined) identification.scientificNameId = o.scientificNameId;
    if (o.sex !== undefined) identification.sex = o.sex;
    const m: ModelOccurrence = { id: o.id, eventId: o.eventId, identification, status: o.occurrenceStatus, basisOfRecord: metadata.basisOfRecord, source: o.source };
    if (o.individualCount !== undefined || o.organismQuantity !== undefined) {
      m.quantity = {};
      if (o.individualCount !== undefined) m.quantity.individualCount = o.individualCount;
      if (o.organismQuantity !== undefined) m.quantity.organismQuantity = o.organismQuantity;
      if (o.organismQuantityType !== undefined) m.quantity.organismQuantityType = o.organismQuantityType;
    }
    if (o.occurrenceRemarks !== undefined) m.remarks = o.occurrenceRemarks;
    return m;
  });
  const eventOf = new Map(result.occurrences.map((o) => [o.id, o.eventId]));
  const measurements: ModelMeasurement[] = result.measurements.map((x) => {
    const occurrence = x.target.kind === 'occurrence';
    const m: ModelMeasurement = {
      eventId: occurrence ? (eventOf.get(x.target.id) ?? x.target.id) : x.target.id,
      type: x.measurementType !== '' ? x.measurementType : (x.measurementTypeFallback ?? ''),
      value: x.measurementValue,
      source: x.source,
    };
    if (occurrence) m.occurrenceId = x.target.id;
    if (x.measurementTypeId !== undefined) m.typeId = x.measurementTypeId;
    if (x.measurementValueId !== undefined) m.valueId = x.measurementValueId;
    if (x.measurementUnit !== undefined && x.measurementUnit !== '') m.unit = x.measurementUnit;
    if (x.measurementUnitId !== undefined) m.unitId = x.measurementUnitId;
    return m;
  });
  return { events, occurrences, measurements, metadata, decisions };
}
