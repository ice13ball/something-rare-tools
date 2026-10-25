// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Messages between the /convert page and the convert worker. Plain structured-clonable data only. The parsed files and the full records
// (events, occurrences, measurements: possibly hundreds of thousands) stay in the worker; the page gets light summaries.
import type { ConvertOptions, ConvertShape, EventRec, ConvertStats, QuantityDeclaration, SplitEntry, TreeSummary } from '../core/convert';
import type { ApprovedSplits } from '../core/convert';
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
  /** Metadata files: recognised, not used before a later stage. */
  metadataFiles: string[];
  /** Files that hold no table (PDF, unknown content). */
  notRead: { fileName: string; kind: string }[];
  /** Companion files of this drop: their settings were read. */
  mappingFiles: string[];
  /** What the companion file(s) of THIS drop say: the page starts the ticks from it and from nothing else. */
  settings: ConvertSettings;
}

export interface ConvertSheetRequest {
  fileId: string;
  sheet: string;
  mapping: SheetMapping;
  shape: ConvertShape;
  quantity?: QuantityDeclaration;
  cruise?: string;
}

export interface ConvertRequestBody {
  sheets: ConvertSheetRequest[];
  options: ConvertOptions;
  approvedSplits: ApprovedSplits;
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
}
