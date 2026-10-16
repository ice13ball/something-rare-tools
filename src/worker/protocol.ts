// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Messages between the page and the check worker. Structured-clonable plain data only. The heavy objects (ParsedFile,
// Dataset: tens of thousands of rows) stay in the worker; the page gets ids and light summaries.
import type { ColumnProposal, Finding, LayoutPlan, LoadedRecord, ParsedFile, Report, SheetMapping } from '../core/types';
import type { MetadataDraft } from '../core/output/draft';

/** Samples shown per column in the mapping table. A 70k-row file must not freeze the table. */
export const MAX_SAMPLES = 5;

export interface InputFile {
  name: string;
  bytes: Uint8Array;
  /** 'dropped' = chosen by the user; 'record' = downloaded from a linked record. Decides which metadata a data file gets. */
  source: 'dropped' | 'record';
}

export interface SheetSummary {
  name: string;
  header: string[];
  rowCount: number;
}

export interface FileSummary {
  fileId: string;
  fileName: string;
  kind: ParsedFile['kind'];
  encoding: string;
  sheets: SheetSummary[];
  layout: LayoutPlan;
  mappings: SheetMapping[];
  /** by sheet name */
  proposals: Record<string, ColumnProposal[]>;
  /** by sheet name, then column index: at most MAX_SAMPLES non-blank values as text */
  samples: Record<string, string[][]>;
}

export interface FileProblem {
  fileName: string;
  message: string;
}

export interface ParseResult {
  files: FileSummary[];
  /** Files that could not be read at all (corrupt workbook, malformed XML/JSON). */
  problems: FileProblem[];
  /** Metadata files (ISO 19139, DataCite, Zenodo): their records are attached to the data files. */
  metadataFiles: string[];
  /** Files that hold no table the tool reads (PDF, unknown content). */
  notRead: { fileName: string; kind: ParsedFile['kind'] }[];
}

export interface ProposeResult {
  mappings: SheetMapping[];
  proposals: Record<string, ColumnProposal[]>;
}

export interface DatasetSummary {
  id: string;
  label: string;
  file: string;
  rowCount: number;
  /** rows with a position (the points on the map) */
  pointCount: number;
  variableCount: number;
}

export interface BuildResult {
  datasets: DatasetSummary[];
}

export interface CheckResult {
  report: Report;
  datasets: DatasetSummary[];
}

export type ExportKind = 'cleanCsv' | 'sidecar' | 'geojson' | 'iso19139' | 'datacite';

export interface RowDetail {
  file: string;
  line: number;
  station?: string;
  date?: string;
  depth?: number;
  lat?: number;
  lon?: number;
  values: { name: string; unit?: string; raw: string }[];
}

/** request type -> { request fields, result } */
export interface Protocol {
  reset: { req: Record<never, never>; res: null };
  parse: { req: { files: InputFile[]; records: LoadedRecord[]; extraFindings: Finding[] }; res: ParseResult };
  propose: { req: { fileId: string; layout: LayoutPlan }; res: ProposeResult };
  build: { req: { fileId: string; layout: LayoutPlan; mappings: SheetMapping[] }; res: BuildResult };
  check: { req: Record<never, never>; res: CheckResult };
  export: { req: { kind: ExportKind; datasetIds: string[] }; res: string };
  draft: { req: { datasetIds: string[] }; res: MetadataDraft };
  row: { req: { file: string; line: number }; res: RowDetail | null };
}

export type RequestType = keyof Protocol;
export type Request = { [K in RequestType]: { type: K } & Protocol[K]['req'] }[RequestType];
export type ResultOf<K extends RequestType> = Protocol[K]['res'];

export interface WireRequest {
  id: number;
  req: Request;
}
export type WireResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

/**
 * The page-side view of the worker: one method per request. Implemented by the worker client; tests and the
 * jsdom component tests use createDirectEngine (same handler, no Worker).
 */
export interface Engine {
  reset(): Promise<void>;
  parse(files: InputFile[], records: LoadedRecord[], extraFindings: Finding[]): Promise<ParseResult>;
  propose(fileId: string, layout: LayoutPlan): Promise<ProposeResult>;
  build(fileId: string, layout: LayoutPlan, mappings: SheetMapping[]): Promise<BuildResult>;
  check(): Promise<CheckResult>;
  export(kind: ExportKind, datasetIds: string[]): Promise<string>;
  draft(datasetIds: string[]): Promise<MetadataDraft>;
  row(file: string, line: number): Promise<RowDetail | null>;
}
