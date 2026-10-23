// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Everything the check worker does, as plain synchronous functions over one session's state. The worker entry
// (check.worker.ts) only moves messages; tests and the jsdom component tests call this directly.
import { buildDatasets } from '../core/dataset';
import { runChecks } from '../core/checks/run';
import { gunzipInBrowser, loadLandMask, type LandMask } from '../core/geo/land';
import landMaskUrl from '../core/geo/land-mask.bin?url';
import { draftToDataciteXml } from '../core/output/datacite';
import { metadataDraft, type MetadataDraft } from '../core/output/draft';
import { toCleanCsv } from '../core/output/csv';
import { toGeoJson } from '../core/output/geojson';
import { draftToIso19139 } from '../core/output/iso19139';
import { isArchiveZip, parseDwca, parseFile } from '../core/parse';
import { readMappingFile } from '../core/parse/mappingFile';
import { inflateInBrowser } from '../core/parse/inflate';
import type { Inflate } from '../core/parse/zip';
import { proposeColumns, unitFromHeader } from '../core/recognize/columns';
import { proposeLayout, proposeMappings } from '../core/recognize/layout';
import { buildReport } from '../core/report';
import { makeFinding } from '../core/rules/registry';
import type { ColumnProposal, Dataset, Finding, LayoutPlan, LoadedRecord, MetadataRecord, ParsedFile, RawCell, Report, SheetMapping } from '../core/types';
import { makeEngine } from './engine';
import {
  MAX_SAMPLES,
  type BuildResult,
  type CheckResult,
  type DatasetSummary,
  type Engine,
  type FileSummary,
  type InputFile,
  type ParseResult,
  type ProposeResult,
  type Request,
  type RowDetail,
} from './protocol';

interface Held {
  fileId: string;
  parsed: ParsedFile;
  source: InputFile['source'];
}
interface Built {
  datasets: Dataset[];
  findings: Finding[];
}

const isTable = (f: ParsedFile): boolean => (f.kind === 'csv' || f.kind === 'xlsx' || f.kind === 'pangaea') && f.sheets.length > 0;

function sampleText(c: RawCell): string {
  return c === null ? '' : String(c);
}

/** At most MAX_SAMPLES non-blank values per column, from the top of the sheet. Stops reading once every column is full. */
function samplesOf(sheet: ParsedFile['sheets'][number]): string[][] {
  const cols: string[][] = sheet.header.map(() => []);
  let open = cols.length;
  for (const row of sheet.rows) {
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      if (col.length >= MAX_SAMPLES) continue;
      const text = sampleText(row.cells[i] ?? null).trim();
      if (text === '') continue;
      col.push(text);
      if (col.length === MAX_SAMPLES) open--;
    }
    if (open === 0) break;
  }
  return cols;
}

function proposalsFor(file: ParsedFile, layout: LayoutPlan): Record<string, ColumnProposal[]> {
  const out: Record<string, ColumnProposal[]> = Object.create(null) as Record<string, ColumnProposal[]>;
  const names: string[] = [];
  for (const t of layout.tables) if (!names.includes(t.sheet)) names.push(t.sheet);
  for (const j of layout.joins) for (const n of [j.left, j.right]) if (!names.includes(n)) names.push(n);
  for (const name of names) {
    const sheet = file.sheets.find((s) => s.name === name);
    if (!sheet) continue;
    const long = layout.tables.find((t) => t.sheet === name)?.long;
    out[name] = proposeColumns(sheet, { decimalComma: file.decimalComma, date1904: file.date1904, ...(long ? { long } : {}) });
  }
  return out;
}

const summaryOf = (ds: Dataset): DatasetSummary => ({
  id: ds.id,
  label: ds.label,
  file: ds.file,
  rowCount: ds.rows.length,
  pointCount: ds.rows.filter((r) => r.lat !== undefined && r.lon !== undefined).length,
  variableCount: ds.variables.length,
});

const rowKey = (file: string, line: number): string => `${file}#${line}`;

export interface Handler {
  handle(req: Request): unknown;
}

/** Loads the land/sea grid for ROW-ON-LAND. */
export type LandLoader = () => Promise<LandMask>;

/** A mask download that has not finished in this time is given up (the report then says positions were not compared with land). */
const LAND_TIMEOUT_MS = 30_000;

/** In the browser: the bundled grid from our own /assets, gunzipped with DecompressionStream. */
export const browserLandLoader: LandLoader = async () => {
  const res = await fetch(landMaskUrl, { signal: AbortSignal.timeout(LAND_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`land mask: HTTP ${res.status}`);
  return loadLandMask(new Uint8Array(await res.arrayBuffer()), gunzipInBrowser);
};

export interface HandlerOptions {
  /** Without a loader ROW-ON-LAND does not run and nothing is said about it (tests that do not need it). */
  land?: LandLoader;
  /** Inflates zip entries (Darwin Core Archives). Default: the browser's DecompressionStream; tests may pass node zlib. */
  inflate?: Inflate;
}

const hasPositions = (datasets: readonly Dataset[]): boolean => datasets.some((ds) => ds.rows.some((r) => r.lat !== undefined && r.lon !== undefined));

/** One session: parse -> build (per file) -> check -> export / draft / row. `parse` and `reset` start a new session. */
export function createHandler(opts: HandlerOptions = {}): Handler {
  // the grid is fetched once per worker, on the first check (or build) that has positions; a failed fetch is retried next time
  let landPromise: Promise<LandMask | null> | undefined;
  const land = (): Promise<LandMask | null> | undefined => {
    const loader = opts.land;
    if (!loader) return undefined;
    landPromise ??= loader().catch(() => {
      landPromise = undefined;
      return null;
    });
    return landPromise;
  };
  let seq = 0;
  let files = new Map<string, Held>();
  let built = new Map<string, Built>();
  let droppedMeta: MetadataRecord[] = [];
  let recordMeta: MetadataRecord[] = [];
  let records: LoadedRecord[] = [];
  let hasDropped = false;
  let parseFindings: Finding[] = [];
  let report: Report | undefined;
  // the declaration of the LAST check of this session, only so that the sidecar download can write it; parse/reset clear it
  let singleCruise = false;
  let rowIndex: Map<string, { ds: Dataset; rowIdx: number }> | undefined;

  // a check that awaited the mask must not write its report into a session that was reset meanwhile
  let session = 0;
  const reset = (): void => {
    session += 1;
    files = new Map();
    built = new Map();
    droppedMeta = [];
    recordMeta = [];
    records = [];
    hasDropped = false;
    parseFindings = [];
    report = undefined;
    singleCruise = false;
    rowIndex = undefined;
  };

  const held = (fileId: string): Held => {
    const h = files.get(fileId);
    if (!h) throw new Error(`Unknown file id "${fileId}": the files were replaced by a newer check. Add the files again.`);
    return h;
  };

  const metadataFor = (h: Held): MetadataRecord[] => {
    const base = h.source === 'dropped' ? [...droppedMeta, ...recordMeta] : [...recordMeta];
    return h.parsed.embeddedMetadata ? [...base, h.parsed.embeddedMetadata] : base;
  };

  const allDatasets = (): Dataset[] => [...built.values()].flatMap((b) => b.datasets);

  const select = (ids: string[]): Dataset[] => {
    const all = allDatasets();
    const picked = ids.length === 0 ? all : all.filter((d) => ids.includes(d.id));
    if (picked.length === 0) throw new Error('Unknown dataset: nothing to export. Run the check again.');
    return picked;
  };

  const metadataOf = (datasets: Dataset[]): MetadataRecord[] => [...new Set(datasets.flatMap((d) => d.metadata))];

  /** Sync for everything but an archive zip: its entries inflate asynchronously, so the answer is then a promise. */
  function parse(req: Extract<Request, { type: 'parse' }>): ParseResult | Promise<ParseResult> {
    reset();
    records = req.records.map((r) => ({ ...r, files: r.files.map((f) => ({ name: f.name, ...(f.url ? { url: f.url } : {}) })) }));
    parseFindings = [...req.extraFindings];
    hasDropped = req.files.some((f) => f.source === 'dropped');
    for (const r of records) recordMeta.push(...r.metadata);

    const archives = req.files.filter((f) => isArchiveZip(f.bytes, f.name));
    if (archives.length === 0) return finishParse(req, new Map());
    const started = session;
    return (async () => {
      const pre = new Map<InputFile, ParsedFile>();
      // parseDwca never throws: a refusal is a parse finding on the result
      for (const f of archives) pre.set(f, await parseDwca(f.name, f.bytes, opts.inflate ?? inflateInBrowser));
      if (started !== session) throw new Error('The files were replaced by a newer check while the archive was being read. Check again.');
      return finishParse(req, pre);
    })();
  }

  function finishParse(req: Extract<Request, { type: 'parse' }>, pre: Map<InputFile, ParsedFile>): ParseResult {
    const result: ParseResult = { files: [], problems: [], metadataFiles: [], notRead: [], mappingFiles: [], singleCruise: false };
    const parsedAll: { parsed: ParsedFile; source: InputFile['source'] }[] = [];
    for (const f of req.files) {
      let parsed: ParsedFile;
      try {
        parsed = pre.get(f) ?? parseFile(f.name, f.bytes);
      } catch (e) {
        result.problems.push({ fileName: f.name, message: e instanceof Error ? e.message : String(e) });
        continue;
      }
      parseFindings.push(...parsed.findings);
      parsedAll.push({ parsed, source: f.source });
    }
    // Nothing could be read at all: the report must say so itself, or an empty report reads as "no problems found".
    if (result.problems.length > 0 && parsedAll.length === 0) {
      parseFindings.push(makeFinding('IN-FILE-UNREADABLE', { file: result.problems[0]!.fileName, params: { files: result.problems.map((p) => p.fileName).join(', ') } }));
    }
    // Pass 1: metadata files, so every data file sees them whatever the order of the drop.
    for (const { parsed, source } of parsedAll) {
      if (parsed.kind !== 'metadata') continue;
      result.metadataFiles.push(parsed.fileName);
      if (parsed.embeddedMetadata) (source === 'dropped' ? droppedMeta : recordMeta).push(parsed.embeddedMetadata);
    }
    // Pass 2: data files.
    for (const { parsed, source } of parsedAll) {
      if (parsed.kind === 'metadata') continue;
      // the sidecar of an earlier run is not a table: its settings (one cruise of one ship) are read and the file is not checked
      const settings = readMappingFile(parsed);
      if (settings) {
        result.mappingFiles.push(parsed.fileName);
        if (settings.singleCruise) result.singleCruise = true;
        continue;
      }
      if (!isTable(parsed)) {
        result.notRead.push({ fileName: parsed.fileName, kind: parsed.kind });
        continue;
      }
      const fileId = `f${++seq}`;
      files.set(fileId, { fileId, parsed, source });
      const layout = proposeLayout(parsed);
      const summary: FileSummary = {
        fileId,
        fileName: parsed.fileName,
        kind: parsed.kind,
        encoding: parsed.encoding,
        sheets: parsed.sheets.map((s) => ({ name: s.name, header: s.header, rowCount: s.rows.length })),
        layout,
        mappings: proposeMappings(parsed, layout),
        proposals: proposalsFor(parsed, layout),
        samples: Object.fromEntries(parsed.sheets.map((s) => [s.name, samplesOf(s)])),
      };
      result.files.push(summary);
      prefetchLand(summary.mappings);
    }
    return result;
  }

  /** A proposed latitude and longitude: start the mask download while the user reads the proposal. */
  function prefetchLand(mappings: readonly SheetMapping[]): void {
    const roles = mappings.flatMap((m) => m.columns.map((c) => c.role.kind));
    if (roles.includes('latitude') && roles.includes('longitude')) void land();
  }

  function propose(req: Extract<Request, { type: 'propose' }>): ProposeResult {
    const h = held(req.fileId);
    const mappings = proposeMappings(h.parsed, req.layout);
    prefetchLand(mappings);
    return { mappings, proposals: proposalsFor(h.parsed, req.layout) };
  }

  function build(req: Extract<Request, { type: 'build' }>): BuildResult {
    const h = held(req.fileId);
    const out = buildDatasets(h.parsed, req.layout, req.mappings as SheetMapping[], metadataFor(h), req.fileId);
    built.set(req.fileId, { datasets: out.datasets, findings: out.findings });
    report = undefined;
    rowIndex = undefined;
    if (hasPositions(out.datasets)) void land(); // a mapping the user edited by hand may only now have positions
    return { datasets: out.datasets.map(summaryOf) };
  }

  async function check(req: Extract<Request, { type: 'check' }>): Promise<CheckResult> {
    const datasets = allDatasets();
    const sessionRecords: LoadedRecord[] = [...records];
    if (hasDropped) sessionRecords.push({ label: 'dropped files', kind: 'dropped', metadata: droppedMeta, files: [], findings: [] });
    const findings = [...parseFindings, ...[...built.values()].flatMap((b) => b.findings)];
    const pending = hasPositions(datasets) ? land() : undefined;
    const started = session;
    const mask = pending === undefined ? undefined : await pending;
    if (started !== session) throw new Error('The files were replaced by a newer check while this one was waiting. Check again.');
    singleCruise = req.singleCruise === true;
    report = runChecks({ datasets, records: sessionRecords, parseFindings: findings }, { land: mask, singleCruise });
    rowIndex = undefined;
    return { report, datasets: datasets.map(summaryOf) };
  }

  function exportText(req: Extract<Request, { type: 'export' }>): string {
    const picked = select(req.datasetIds);
    switch (req.kind) {
      case 'cleanCsv':
        return toCleanCsv(picked[0]).csv;
      case 'sidecar':
        return toCleanCsv(picked[0], { singleCruise }).sidecar;
      case 'geojson':
        return toGeoJson(picked, report ?? buildReport([]));
      case 'iso19139':
        return draftToIso19139(metadataDraft(picked, metadataOf(picked)));
      case 'datacite':
        return draftToDataciteXml(metadataDraft(picked, metadataOf(picked)));
    }
  }

  function draft(req: Extract<Request, { type: 'draft' }>): MetadataDraft {
    const picked = select(req.datasetIds);
    return metadataDraft(picked, metadataOf(picked));
  }

  function row(req: Extract<Request, { type: 'row' }>): RowDetail | null {
    if (!rowIndex) {
      rowIndex = new Map();
      for (const ds of allDatasets()) {
        ds.rows.forEach((r, rowIdx) => {
          const k = rowKey(r.file, r.line);
          if (!rowIndex!.has(k)) rowIndex!.set(k, { ds, rowIdx });
        });
      }
    }
    const hit = rowIndex.get(rowKey(req.file, req.line));
    if (!hit) return null;
    const r = hit.ds.rows[hit.rowIdx];
    const detail: RowDetail = { file: r.file, line: r.line, values: [] };
    if (r.station !== undefined) detail.station = r.station;
    if (r.datetime) detail.date = r.datetime.iso;
    if (r.depth !== undefined) detail.depth = r.depth;
    if (r.lat !== undefined) detail.lat = r.lat;
    if (r.lon !== undefined) detail.lon = r.lon;
    for (const v of hit.ds.variables) {
      const cell = r.values[v.key];
      if (!cell) continue;
      detail.values.push({ name: unitFromHeader(v.header).name || v.header, ...(v.unit !== undefined ? { unit: v.unit } : {}), raw: sampleText(cell.raw) });
    }
    return detail;
  }

  return {
    handle(req: Request): unknown {
      switch (req.type) {
        case 'reset':
          reset();
          return null;
        case 'parse':
          return parse(req);
        case 'propose':
          return propose(req);
        case 'build':
          return build(req);
        case 'check':
          return check(req);
        case 'export':
          return exportText(req);
        case 'draft':
          return draft(req);
        case 'row':
          return row(req);
      }
    },
  };
}

/** The default session of this module (a worker has exactly one). */
const shared = createHandler({ land: browserLandLoader });
export const handle = (req: Request): unknown => shared.handle(req);

/** An Engine that runs the handler in the calling thread: for tests. Each engine has its own session. */
export function createDirectEngine(opts: HandlerOptions = {}): Engine {
  const h = createHandler(opts);
  return makeEngine((req) =>
    new Promise((resolve, reject) => {
      try {
        resolve(h.handle(req) as never);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }),
  );
}
