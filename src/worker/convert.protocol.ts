// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Messages between the /convert page and the convert worker. Plain structured-clonable data only. The parsed files and the full records
// (events, occurrences, measurements: possibly hundreds of thousands) stay in the worker; the page gets light summaries.
import type { ConvertOptions, ConvertShape, EventRec, ConvertStats, ProfileDeclaration, ProfileSummary, QuantityDeclaration, SamplingDevice, SplitEntry, TreeSummary } from '../core/convert';
import type { ApprovedSplits, PivotNote } from '../core/convert';
import type { DatasetMetadata } from '../core/convert/metadata';
import type { ConvertPrefill } from '../core/convert/prefill';
import type { NercDecisions } from '../core/convert/nerc';
import type { ConvertSettings } from '../core/convert/settings';
import type { WormsLookup } from '../core/convert/worms';
import type { SheetLedger } from '../core/convert/ledger';
import type { Finding, SheetMapping } from '../core/types';
import type { FileProblem, FileSummary, InputFile } from './protocol';

/** A file of the converter's drop: /check's file summary (sheets, layout, mappings, proposals, samples) with the converter overlay's proposals. */
export interface ConvertFileSummary extends FileSummary {
  /** by sheet name: the shape the overlay suggests (undefined when it cannot tell) */
  suggestedShapes: Record<string, ConvertShape | undefined>;
  /**
   * by sheet name: the sheet LOOKS like a profile / environment file of a cruise (a low-confidence suggestion, core/convert/recognize.ts suggestConvertProfile). Never applied
   * by itself: the page offers a button, and the user ticks the mark.
   */
  suggestedProfiles: Record<string, boolean>;
  /**
   * by sheet name, only for a sheet that looks like a data dictionary (a glossary of columns, or a sheet named Metadata / README / Info; core/convert/dictionary.ts): the page starts it UNTICKED,
   * with a note saying why. The user may tick it.
   */
  dictionarySheets?: Record<string, 'name' | 'columns'>;
  /**
   * by sheet name, only for a sheet that was a long environmental sheet (one row per measured parameter) and was READ as one row per sample (core/convert/pivot.ts): what was done.
   * The sheet in `sheets`, `mappings`, `proposals` and `samples` is the pivoted one, so the role table shows its columns like any other.
   */
  pivots?: Record<string, PivotNote>;
  /** The long sheets the user chose to read as normal tables (their names), so that the page can offer the way back. */
  pivotOff?: string[];
  /** by sheet name, only for a sheet that looks transposed (species or variables in rows; core/convert/transposed.ts): the page offers "read as a normal table" next to the blocking message. */
  transposedSheets?: Record<string, 'transposed' | 'transposed-taxa' | 'header-units'>;
}

export interface ConvertParseResult {
  files: ConvertFileSummary[];
  problems: FileProblem[];
  /** Metadata files (ISO 19139, DataCite, Zenodo): never read as a data sheet; what they say is in `prefillInfo`. */
  metadataFiles: string[];
  /** Description files of a Darwin Core archive (eml.xml, meta.xml), recognised by content: not a data sheet, not read. */
  archiveFiles: { fileName: string; kind: 'eml' | 'meta' }[];
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
  /** The NERC identifiers the user confirmed for the sheet's measured-variable columns, by column index (stage 5). The worker checks every pick (core/convert/nerc.ts). */
  nerc?: NercDecisions;
  /** Stage 6: the sheet is a profile / environment file. Present = marked by the user; `depthIds` = the user's explicit approval of level IDs made of the station and the depth as written. */
  profile?: ProfileDeclaration;
  /** The columns whose proposed taxon role the page left out for the conversion (a candidate the user has not confirmed: sent as "ignore"). Only these count as "not changed by the user" (CONV-LONG-UNSUPPORTED). */
  unconfirmedTaxa?: number[];
  /** The user's tick "read as a normal table" for a sheet that looks transposed (only the boolean true counts). */
  readAsTable?: boolean;
  /** The user's tick "this is a list of species found (presence only, no counts)" for the sheet (only the boolean true counts). */
  presenceOnly?: boolean;
  /** The user's choice "write one occurrence per sample and taxon" for a per-taxon total repeated on size-class rows (only the boolean true counts). */
  totalOnce?: boolean;
  /** The user's choice "these are real counts" (only the boolean true counts). */
  realCounts?: boolean;
  /** The user's choice "leave out the exact copies of rows and list them" (only the boolean true counts). */
  dropCopies?: boolean;
  /** The number of copies / groups a companion file recorded with the same answers; the core honours them only when today's analysis finds the same number. */
  dropCopiesCount?: number;
  totalOnceCount?: number;
  /** The number of rows the tick "these are real counts" covered; the core honours it only when today's analysis finds the same number. */
  realCountsRows?: number;
  /** The same answer as a companion file recorded it. */
  realCountsRowsFile?: number;
  /** The reasons the user left out and listed (core/convert/notWritten.ts) with the number of rows each was given for, and the same as a companion file recorded them (with the counts they hold for). */
  leaveOut?: { reason: string; count: number }[];
  leaveOutFile?: { reason: string; count: number; rows: number }[];
}

export interface ConvertRequestBody {
  sheets: ConvertSheetRequest[];
  options: ConvertOptions;
  approvedSplits: ApprovedSplits;
  /** What the WoRMS opt-in found and the user decided, by scientificName (stage 4). Absent = no lookup. Plain data; the worker never fetches. */
  worms?: WormsLookup;
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
  /**
   * The names a WoRMS lookup would send (the distinct scientificName values after the approved splits, of the occurrences that have no ID from the sheet)
   * and how many distinct names are left out because the sheet already gives them an ID. Names only.
   */
  worms: { names: string[]; withSheetId: number; applied: number };
  /** The first few events of each level, for the preview. */
  examples: { cruise: EventRec[]; station: EventRec[]; sample: EventRec[]; level: EventRec[] };
  /** What the profile files did (stage 6): level and station counts, the stations that matched no biology station. Counts and names, never the levels. */
  profile: ProfileSummary;
  /** At least one sample code repeats between stations / rows: the station prefix toggle is worth showing. */
  codeCollision: boolean;
  /** Some sheet has rows without a sample code: the code proposal is worth showing. */
  codesMissing: { fileId: string; sheet: string }[];
  /** Where every source row and numeric column of every sheet went (core/convert/ledger.ts): informational. A row it could not place is a finding of its own (CONV-ROW-NOT-UNDERSTOOD). */
  ledger: SheetLedger[];
  /** How many rows the list beside the archive holds (a line with no record, a written line that lost cells other than zeros), and how many sheets are left out as a whole: the same function that writes the list counts them. */
  notWritten: { rows: number; sheets: number };
}

/** What the page sends to get the list of rows not written: the same body as the export, and the description (the file is named after the archive). */
export interface NotWrittenBody {
  body: ConvertRequestBody;
  metadata: DatasetMetadata;
}

/** The list of rows not written, built in the worker: a Blob (nothing is copied to make it a string on the page), the name beside the archive's, and the number of rows in it. */
export interface NotWrittenResult {
  fileName: string;
  blob: Blob;
  count: number;
}

export interface CodeProposalView {
  fileName: string;
  /** The new column's header. */
  header: string;
  rows: number;
  /** The user's sheet as CSV with the new code column last. */
  csv: string;
  /** A long sheet: the rows were grouped into samples, one code per group; the page shows this BEFORE the file is offered. Absent for a wide sheet (one code per row). */
  grouping?: {
    samples: number;
    rows: number;
    by: { part: 'cruise' | 'station' | 'date' | 'time' | 'depth' | 'replicate' | 'position' | 'column'; header: string }[];
    /** Columns added to the key beyond the mapped roles, and why. */
    added: { header: string; why: 'name' | 'chosen' | 'position' }[];
    repeats: number;
    /** Rows with an empty cell in a column of the key. */
    blanks: number;
    /** Almost every row became a sample of its own. */
    nearlyRows: boolean;
  };
  /** A long sheet that cannot be grouped: no file is offered (csv is empty). `candidates` are columns that would remove the repeats; the user may pick one. */
  refusal?: { reason: 'no-columns' | 'taxon-repeats'; rows: number; repeats?: number; candidates?: { index: number; header: string; repeats: number; groups: number }[] };
}

export interface ConvertProtocol {
  reset: { req: Record<never, never>; res: null };
  parse: { req: { files: InputFile[] }; res: ConvertParseResult };
  convert: { req: { body: ConvertRequestBody }; res: ConvertView };
  proposeCodes: { req: { fileId: string; sheet: string; mapping: SheetMapping; shape?: ConvertShape; extra?: number[] }; res: CodeProposalView | null };
  /** The user's choice about a long environmental sheet: read it as a normal table (`off`), and which key columns describe the measurement, not the sample. The file is read again; the answer is its new summary. */
  pivotChoice: { req: { fileId: string; sheet: string; off: boolean; describes: number[] }; res: ConvertFileSummary };
  export: { req: { export: ExportBody }; res: ExportResult };
  notWritten: { req: { notWritten: NotWrittenBody }; res: NotWrittenResult };
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
  proposeCodes(fileId: string, sheet: string, mapping: SheetMapping, shape?: ConvertShape, extra?: number[]): Promise<CodeProposalView | null>;
  pivotChoice(fileId: string, sheet: string, off: boolean, describes: number[]): Promise<ConvertFileSummary>;
  export(body: ExportBody): Promise<ExportResult>;
  notWritten(body: NotWrittenBody): Promise<NotWrittenResult>;
}
