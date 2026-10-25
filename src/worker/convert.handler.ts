// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Everything the convert worker does, as plain functions over one session's state (the worker entry only moves messages; tests call this directly).
//
// Not composed from createHandler() of worker/handler.ts, on purpose: that handler keeps the parsed files private and builds /check datasets,
// and exposing them would change /check's worker. This session reads files with the same core functions (parseFile, readMappingFile,
// proposeLayout is not needed: a converter sheet is one table) and proposes columns with the converter overlay over the shared proposer.
import { convert, listSplits, proposeConvertColumns, proposeSampleCodes, suggestConvertShape } from '../core/convert';
import type { ConvertSheetInput } from '../core/convert';
import { readConvertSettings } from '../core/convert/settings';
import type { ConvertSettings } from '../core/convert/settings';
import { parseFile } from '../core/parse';
import { toMapping } from '../core/recognize/columns';
import type { ColumnProposal, LayoutPlan, ParsedFile, RawCell, SheetMapping } from '../core/types';
import type { ConvertEngine, ConvertFileSummary, ConvertParseResult, ConvertRequest, ConvertRequestBody, ConvertResultOf, ConvertRequestType, ConvertView, CodeProposalView } from './convert.protocol';
import { makeConvertEngine } from './convert.engine';
import { MAX_SAMPLES, type InputFile } from './protocol';

interface Held {
  fileId: string;
  parsed: ParsedFile;
}

const isTable = (f: ParsedFile): boolean => (f.kind === 'csv' || f.kind === 'xlsx' || f.kind === 'pangaea') && f.sheets.length > 0;

/** At most MAX_SAMPLES non-blank values per column, from the top of the sheet. */
function samplesOf(sheet: ParsedFile['sheets'][number]): string[][] {
  const cols: string[][] = sheet.header.map(() => []);
  for (const row of sheet.rows) {
    let open = false;
    for (let i = 0; i < cols.length; i++) {
      if (cols[i].length >= MAX_SAMPLES) continue;
      const c: RawCell = row.cells[i] ?? null;
      const text = c === null ? '' : String(c).trim();
      if (text !== '') cols[i].push(text);
      if (cols[i].length < MAX_SAMPLES) open = true;
    }
    if (!open) break;
  }
  return cols;
}

/** The converter reads each sheet as one table: the layout is "these sheets, no joins" (nothing of /check's long or joined layouts applies). */
const layoutOf = (file: ParsedFile): LayoutPlan => ({ tables: file.sheets.map((s) => ({ sheet: s.name })), joins: [] });

const EXAMPLES = { cruise: 3, station: 4, sample: 6 } as const;

export interface ConvertHandler {
  handle(req: ConvertRequest): unknown;
}

export function createConvertHandler(): ConvertHandler {
  let seq = 0;
  let files = new Map<string, Held>();

  const held = (fileId: string): Held => {
    const h = files.get(fileId);
    if (!h) throw new Error(`Unknown file id "${fileId}": the files were replaced. Add the files again.`);
    return h;
  };

  function parse(req: Extract<ConvertRequest, { type: 'parse' }>): ConvertParseResult {
    files = new Map();
    seq = 0;
    const result: ConvertParseResult = { files: [], problems: [], metadataFiles: [], notRead: [], mappingFiles: [], settings: { fullList: false, prefixStation: false } };
    const parsedAll: ParsedFile[] = [];
    for (const f of req.files as InputFile[]) {
      try {
        parsedAll.push(parseFile(f.name, f.bytes));
      } catch (e) {
        result.problems.push({ fileName: f.name, message: e instanceof Error ? e.message : String(e) });
      }
    }
    const settings: ConvertSettings = result.settings;
    for (const parsed of parsedAll) {
      if (parsed.kind === 'metadata') {
        result.metadataFiles.push(parsed.fileName);
        continue;
      }
      // a companion file of an earlier run: not a table; its settings pre-tick the page, for this drop only
      const s = readConvertSettings(parsed);
      if (s) {
        result.mappingFiles.push(parsed.fileName);
        settings.fullList ||= s.fullList;
        settings.prefixStation ||= s.prefixStation;
        continue;
      }
      if (!isTable(parsed)) {
        result.notRead.push({ fileName: parsed.fileName, kind: parsed.kind });
        continue;
      }
      const fileId = `c${++seq}`;
      files.set(fileId, { fileId, parsed });
      const proposals: Record<string, ColumnProposal[]> = Object.create(null) as Record<string, ColumnProposal[]>;
      const mappings: SheetMapping[] = [];
      const shapes: ConvertFileSummary['suggestedShapes'] = Object.create(null) as ConvertFileSummary['suggestedShapes'];
      for (const sheet of parsed.sheets) {
        const p = proposeConvertColumns(sheet, { decimalComma: parsed.decimalComma, date1904: parsed.date1904 });
        proposals[sheet.name] = p;
        const m = toMapping(sheet, p);
        mappings.push(m);
        shapes[sheet.name] = suggestConvertShape(m.columns);
      }
      result.files.push({
        fileId,
        fileName: parsed.fileName,
        kind: parsed.kind,
        encoding: parsed.encoding,
        sheets: parsed.sheets.map((s) => ({ name: s.name, header: s.header, rowCount: s.rows.length })),
        layout: layoutOf(parsed),
        mappings,
        proposals,
        samples: Object.fromEntries(parsed.sheets.map((s) => [s.name, samplesOf(s)])),
        suggestedShapes: shapes,
      });
    }
    return result;
  }

  function run(body: ConvertRequestBody): ConvertView {
    const sheets: ConvertSheetInput[] = body.sheets.map((s) => ({
      file: held(s.fileId).parsed,
      sheet: s.sheet,
      mapping: s.mapping,
      shape: s.shape,
      ...(s.quantity ? { quantity: s.quantity } : {}),
      ...(s.cruise !== undefined && s.cruise.trim() !== '' ? { cruise: s.cruise.trim() } : {}),
    }));
    const splits = listSplits({ sheets, approvedSplits: body.approvedSplits });
    const r = convert({ sheets, options: body.options, approvedSplits: body.approvedSplits });
    const codesMissing = r.findings
      .filter((f) => f.ruleId === 'CONV-SAMPLE-CODE-MISSING')
      .flatMap((f) => body.sheets.filter((s) => s.sheet === f.sheet && held(s.fileId).parsed.fileName === f.file).map((s) => ({ fileId: s.fileId, sheet: s.sheet })));
    const by = (t: 'cruise' | 'station' | 'sample') => r.events.filter((e) => e.eventType === t).slice(0, EXAMPLES[t]);
    return {
      ok: r.ok,
      findings: r.findings,
      stats: r.stats,
      tree: r.tree,
      splits,
      cruiseText: r.cruiseText,
      examples: { cruise: by('cruise'), station: by('station'), sample: by('sample') },
      codeCollision: r.findings.some((f) => f.ruleId === 'CONV-ID-DUPLICATE' && f.params.kind === 'event'),
      codesMissing: codesMissing.filter((c, i, a) => a.findIndex((x) => x.fileId === c.fileId && x.sheet === c.sheet) === i),
    };
  }

  function proposeCodes(req: Extract<ConvertRequest, { type: 'proposeCodes' }>): CodeProposalView | null {
    const h = held(req.fileId);
    const sheet = h.parsed.sheets.find((s) => s.name === req.sheet);
    if (!sheet) return null;
    const p = proposeSampleCodes(h.parsed, sheet, req.mapping);
    return p ? { fileName: h.parsed.fileName, header: p.header, rows: p.codes.filter((c) => c !== '').length, csv: p.csv } : null;
  }

  return {
    handle(req: ConvertRequest): unknown {
      switch (req.type) {
        case 'reset':
          files = new Map();
          seq = 0;
          return null;
        case 'parse':
          return parse(req);
        case 'convert':
          return run(req.body);
        case 'proposeCodes':
          return proposeCodes(req);
      }
    },
  };
}

/** The default session of this module (the convert worker has exactly one). */
const shared = createConvertHandler();
export const handle = (req: ConvertRequest): unknown => shared.handle(req);

/** A ConvertEngine that runs the handler in the calling thread: for tests. */
export function createDirectConvertEngine(): ConvertEngine {
  const h = createConvertHandler();
  const send = <K extends ConvertRequestType>(req: Extract<ConvertRequest, { type: K }>): Promise<ConvertResultOf<K>> =>
    new Promise((resolve, reject) => {
      try {
        resolve(h.handle(req) as ConvertResultOf<K>);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  return makeConvertEngine(send);
}

export type { ConvertRequestBody };
