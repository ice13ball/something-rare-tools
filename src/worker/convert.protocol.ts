// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Messages between the /convert page and the convert worker. Plain structured-clonable data only. The parsed files and the full records
// (events, occurrences, measurements: possibly hundreds of thousands) stay in the worker; the page gets light summaries.
import type { ConvertOptions, ConvertShape, EventRec, ConvertStats, QuantityDeclaration, SamplingDevice, SplitEntry, TreeSummary } from '../core/convert';
import type { ApprovedSplits } from '../core/convert';
import type { DatasetMetadata } from '../core/convert/metadata';
import type { ConvertPrefill } from '../core/convert/prefill';
import type { ConvertSettings } from '../core/convert/settings';
import type { Finding, SheetMapping } from '../core/types';
import type { FileProblem, FileSummary, InputFile } from './protocol';

/** A file of the converter's drop: /check's file summary (sheets, layout, mappings, proposals, samples) with the converter overlay's proposals. */
export interface ConvertFileSummary extends FileSummary {
  /** by sheet name: the shape the overlay suggests (undefined when it cannot tell) */
  suggestedShapes: Record<string, ConvertShape | undefined>;
}

export interface ConvertParseResult {
  files: ConvertFileSummary[];
  problems: FileProblem[];
  /** Metadata files (ISO 19139, DataCite, Zenodo): never read as a data sheet; what they say is in `prefillInfo`. */
  metadataFiles: string[];
  /** Files that hold no table (PDF, unknown content). */
  notRead: { fileName: string; kind: string }[];
  /** Companion files of this drop: their settings were read. */
  mappingFiles: string[];
  /** What the companion file(s) of THIS drop say: the page starts the ticks from it and from nothing else. */
  settings: ConvertSettings;
  /**
   * What the dropped metadata files say about the dataset description (title, creators, contact, citation, licence in the "taken" case), to prefill the
   * form (core/convert/metadata.ts refreshPrefill: only empty, untouched fields; the user edits everything). Only values every file agrees on.
   */
  prefill: Partial<DatasetMetadata>;
  /** The same metadata, with its sources, the choices where files disagree, the licence case and the coverage they state. Null without a metadata file. */
  prefillInfo: ConvertPrefill | null;
}

export interface ConvertSheetRequest {
  fileId: string;
  sheet: string;
  mapping: SheetMapping;
  shape: ConvertShape;
  quantity?: QuantityDeclaration;
  cruise?: string;
  /** The sampling device of the sheet's samples (a verified one or the user's own text) and the mesh size in micrometres as typed. */
  device?: SamplingDevice;
  meshUm?: string;
}

export interface ConvertRequestBody {
  sheets: ConvertSheetRequest[];
  options: ConvertOptions;
  approvedSplits: ApprovedSplits;
  /**
   * The description of the dataset. The conversion view needs only the three fields that appear in the tables (datasetName, institutionCode,
   * basisOfRecord); the page passes the rest empty so that typing a title does not rerun the conversion. Absent = all empty.
   */
  metadata?: DatasetMetadata;
}

/** What the page sends to export: the same body, the whole description, and what the user accepted. The worker checks everything again. */
export interface ExportBody {
  body: ConvertRequestBody;
  metadata: DatasetMetadata;
  /** Rule ids of the warnings the user accepted in this run. */
  accepted: string[];
  /** UTC timestamp of the export, for pubDate and dateStamp of the EML (the core reads no clock). */
  generated: string;
}

/** The archive, built in the worker. `bytes` moves to the page instead of being copied. */
export interface ExportResult {
  fileName: string;
  bytes: Uint8Array;
  counts: { events: number; occurrences: number; measurements: number };
  /** The entries were deflated (false: stored, where the browser has no CompressionStream). */
  deflated: boolean;
}

/** What the page shows of a conversion: counts, findings, splits, example events. Never the records themselves. */
export interface ConvertView {
  ok: boolean;
  findings: Finding[];
  stats: ConvertStats;
  tree: TreeSummary;
  splits: SplitEntry[];
  cruiseText: string[];
  /** The first few events of each level, for the preview. */
  examples: { cruise: EventRec[]; station: EventRec[]; sample: EventRec[] };
  /** At least one sample code repeats between stations / rows: the station prefix toggle is worth showing. */
  codeCollision: boolean;
  /** Some sheet has rows without a sample code: the code proposal is worth showing. */
  codesMissing: { fileId: string; sheet: string }[];
}

export interface CodeProposalView {
  fileName: string;
  /** The new column's header. */
  header: string;
  rows: number;
  /** The user's sheet as CSV with the new code column last. */
  csv: string;
}

export interface ConvertProtocol {
  reset: { req: Record<never, never>; res: null };
  parse: { req: { files: InputFile[] }; res: ConvertParseResult };
  convert: { req: { body: ConvertRequestBody }; res: ConvertView };
  proposeCodes: { req: { fileId: string; sheet: string; mapping: SheetMapping }; res: CodeProposalView | null };
  export: { req: { export: ExportBody }; res: ExportResult };
}

export type ConvertRequestType = keyof ConvertProtocol;
export type ConvertRequest = { [K in ConvertRequestType]: { type: K } & ConvertProtocol[K]['req'] }[ConvertRequestType];
export type ConvertResultOf<K extends ConvertRequestType> = ConvertProtocol[K]['res'];

export interface ConvertWireRequest {
  id: number;
  req: ConvertRequest;
}

/** The page-side view of the convert worker. */
export interface ConvertEngine {
  reset(): Promise<void>;
  parse(files: InputFile[]): Promise<ConvertParseResult>;
  convert(body: ConvertRequestBody): Promise<ConvertView>;
  proposeCodes(fileId: string, sheet: string, mapping: SheetMapping): Promise<CodeProposalView | null>;
  export(body: ExportBody): Promise<ExportResult>;
}
