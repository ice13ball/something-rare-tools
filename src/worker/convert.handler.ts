// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Everything the convert worker does, as plain functions over one session's state (the worker entry only moves messages; tests call this directly).
//
// Not composed from createHandler() of worker/handler.ts, on purpose: that handler keeps the parsed files private and builds /check datasets,
// and exposing them would change /check's worker. This session reads files with the same core functions (parseFile, readMappingFile,
// proposeLayout is not needed: a converter sheet is one table) and proposes columns with the converter overlay over the shared proposer.
import { licenceDiffersFindings } from '../core/convert/validate';
import { archiveFileName, archiveFiles, buildEml, buildZip, convert, judge, listSplits, pivotConvertFile, proposeConvertColumns, proposeSampleCodes, streamDeflate, suggestConvertProfile, suggestConvertShape, toDataset, validateDataset, validateTables } from '../core/convert';
import type { ConvertSheetInput, EventRec, PivotChoice, PivotNote } from '../core/convert';
import { readLongSheet } from '../core/convert/pivot';
import { EMPTY_METADATA } from '../core/convert/metadata';
import { buildPrefill, licenceSourceOf, pangaeaHeaderRecord, prefillValues } from '../core/convert/prefill';
import type { LicenceSource } from '../core/convert/prefill';
import { archiveDescriptorKind, readConvertFile } from '../core/convert/read';
import { readConvertSettings } from '../core/convert/settings';
import type { ConvertSettings } from '../core/convert/settings';
import { parseFile } from '../core/parse';
import { decodeText } from '../core/values/encoding';
import { toMapping } from '../core/recognize/columns';
import type { ColumnProposal, LayoutPlan, MetadataRecord, ParsedFile, RawCell, SheetMapping } from '../core/types';
import type { ConvertEngine, ConvertFileSummary, ConvertParseResult, ConvertRequest, ConvertRequestBody, ConvertResultOf, ConvertRequestType, ConvertView, CodeProposalView, ExportBody, ExportResult } from './convert.protocol';
import { makeConvertEngine } from './convert.engine';
import { MAX_SAMPLES, type InputFile } from './protocol';

interface Held {
  fileId: string;
  /** The file as the conversion reads it: a long environmental sheet that is read as one row per sample is its pivot (core/convert/pivot.ts). */
  parsed: ParsedFile;
  /** The file as it was read, before any pivot: what a change of the user's choices pivots again. */
  original: ParsedFile;
  /** The user's choices about the long sheets of the file, by sheet name (read as a normal table; key columns that describe the measurement). */
  choices: Record<string, PivotChoice>;
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

const EXAMPLES = { cruise: 3, station: 4, sample: 6, level: 4 } as const;

export interface ConvertHandler {
  handle(req: ConvertRequest): unknown;
}

export function createConvertHandler(): ConvertHandler {
  let seq = 0;
  let files = new Map<string, Held>();
  // what the dropped metadata files state about the licence, from THIS session's own parse: CONV-LICENCE-DIFFERS at export is judged from it, never from what the page sends
  let licenceSource: LicenceSource = { ids: [], disagree: false };

  const held = (fileId: string): Held => {
    const h = files.get(fileId);
    if (!h) throw new Error(`Unknown file id "${fileId}": the files were replaced. Add the files again.`);
    return h;
  };

  function parse(req: Extract<ConvertRequest, { type: 'parse' }>): ConvertParseResult {
    files = new Map();
    seq = 0;
    licenceSource = { ids: [], disagree: false };
    const result: ConvertParseResult = { files: [], problems: [], metadataFiles: [], archiveFiles: [], notRead: [], mappingFiles: [], settings: { fullList: false, prefixStation: false, worms: false, nvs: false }, prefill: {}, prefillInfo: null };
    const records: MetadataRecord[] = [];
    const parsedAll: ParsedFile[] = [];
    for (const f of req.files as InputFile[]) {
      const archiveKind = archiveDescriptorKind(f.bytes);
      if (archiveKind) {
        // an eml.xml or meta.xml of a Darwin Core archive: never a data sheet, listed and not read
        result.archiveFiles.push({ fileName: f.name, kind: archiveKind });
        continue;
      }
      try {
        // the converter's own reading path: the formula guard of its code-proposal CSV comes off every text cell and header (core/convert/read.ts)
        const read = parseFile(f.name, f.bytes);
        parsedAll.push(readConvertFile(read, read.kind === 'pangaea' ? decodeText(f.bytes).text : undefined));
      } catch (e) {
        result.problems.push({ fileName: f.name, message: e instanceof Error ? e.message : String(e) });
      }
    }
    const settings: ConvertSettings = result.settings;
    // the sheets a companion file of this drop says are read as normal tables (a pre-tick, by sheet name): known before any file is pivoted, whatever the order of the files
    const asTable = new Set<string>();
    for (const parsed of parsedAll) if (parsed.kind !== 'metadata') for (const n of readConvertSettings(parsed)?.longAsTable ?? []) asTable.add(n);
    for (const parsed of parsedAll) {
      if (parsed.kind === 'metadata') {
        // never a data sheet: its record goes to the description of the dataset (core/convert/prefill.ts), read by the shared metadata parsers
        result.metadataFiles.push(parsed.fileName);
        if (parsed.embeddedMetadata) records.push(parsed.embeddedMetadata);
        continue;
      }
      // a companion file of an earlier run: not a table; its settings pre-tick the page, for this drop only
      const s = readConvertSettings(parsed);
      if (s) {
        result.mappingFiles.push(parsed.fileName);
        settings.fullList ||= s.fullList;
        settings.prefixStation ||= s.prefixStation;
        settings.worms ||= s.worms;
        settings.nvs ||= s.nvs;
        // profile marks of the companion file(s), by sheet name: pre-ticks only (the page ticks the boxes; nothing else follows from them)
        for (const n of s.profileSheets ?? []) if (!(settings.profileSheets ??= []).includes(n)) settings.profileSheets.push(n);
        for (const n of s.profileDepthIds ?? []) if (!(settings.profileDepthIds ??= []).includes(n)) settings.profileDepthIds.push(n);
        for (const n of s.profileIgnoreCast ?? []) if (!(settings.profileIgnoreCast ??= []).includes(n)) settings.profileIgnoreCast.push(n);
        for (const n of s.longAsTable ?? []) if (!(settings.longAsTable ??= []).includes(n)) settings.longAsTable.push(n);
        continue;
      }
      if (!isTable(parsed)) {
        result.notRead.push({ fileName: parsed.fileName, kind: parsed.kind });
        continue;
      }
      // a PANGAEA file carries its own description (citation, title, authors, licence, DOI, coverage, abstract when it has one): it goes to the description of the dataset like a dropped
      // metadata file, with its file name as the source; the sheet itself is still a data table
      if (parsed.kind === 'pangaea' && parsed.embeddedMetadata) records.push(pangaeaHeaderRecord(parsed.embeddedMetadata));
      const fileId = `c${++seq}`;
      const h: Held = { fileId, original: parsed, parsed, choices: Object.assign(Object.create(null) as Record<string, PivotChoice>, Object.fromEntries(parsed.sheets.filter((s) => asTable.has(s.name)).map((s) => [s.name, { off: true }]))) };
      repivot(h);
      files.set(fileId, h);
      result.files.push(summaryOf(h));
    }
    result.prefillInfo = buildPrefill(records) ?? null;
    result.prefill = prefillValues(result.prefillInfo ?? undefined);
    licenceSource = licenceSourceOf(result.prefillInfo);
    return result;
  }

  /**
   * A long environmental sheet (one row per measured parameter) that can be read safely is replaced by its pivot, one row per sample, HERE: the page, the roles and every later request
   * see the same columns and the same indexes (core/convert/pivot.ts). The user's choices for the sheet (read it as a normal table; key columns that describe the measurement) are applied.
   */
  function repivot(h: Held): void {
    h.parsed = pivotConvertFile(h.original, h.choices);
  }

  /** What the page gets of one file: its sheets (the pivoted ones as they are read), proposals, mappings and suggestions, and what was done to its long sheets. */
  function summaryOf(h: Held): ConvertFileSummary {
    const { fileId, parsed } = h;
    {
      const proposals: Record<string, ColumnProposal[]> = Object.create(null) as Record<string, ColumnProposal[]>;
      const mappings: SheetMapping[] = [];
      const shapes: ConvertFileSummary['suggestedShapes'] = Object.create(null) as ConvertFileSummary['suggestedShapes'];
      const profiles: ConvertFileSummary['suggestedProfiles'] = Object.create(null) as ConvertFileSummary['suggestedProfiles'];
      const pivots: Record<string, PivotNote> = Object.create(null) as Record<string, PivotNote>;
      // the long sheets the user chose to read as normal tables: listed, so that the page can offer the way back
      const pivotOff = h.original.sheets.filter((s) => h.choices[s.name]?.off === true && readLongSheet(h.original, s).kind === 'pivot').map((s) => s.name);
      for (const sheet of parsed.sheets) {
        if (sheet.pivot !== undefined) {
          const { cellLines: _lines, ...note } = sheet.pivot;
          pivots[sheet.name] = note;
        }
        const p = proposeConvertColumns(sheet, { decimalComma: parsed.decimalComma, date1904: parsed.date1904 });
        proposals[sheet.name] = p;
        const m = toMapping(sheet, p);
        mappings.push(m);
        shapes[sheet.name] = suggestConvertShape(m.columns);
        profiles[sheet.name] = suggestConvertProfile(p);
      }
      return {
        fileId,
        fileName: parsed.fileName,
        kind: parsed.kind,
        encoding: parsed.encoding,
        sheets: parsed.sheets.map((s) => ({ name: s.name, header: s.header, ...(s.unnamedFrom === undefined ? {} : { unnamedFrom: s.unnamedFrom }), rowCount: s.rows.length })),
        layout: layoutOf(parsed),
        mappings,
        proposals,
        samples: Object.fromEntries(parsed.sheets.map((s) => [s.name, samplesOf(s)])),
        suggestedShapes: shapes,
        suggestedProfiles: profiles,
        ...(Object.keys(pivots).length > 0 ? { pivots } : {}),
        ...(pivotOff.length > 0 ? { pivotOff } : {}),
      };
    }
  }

  /** The user's choice about the long sheets of one file: the sheet is read again, and the page gets the file's summary again (its columns may have changed). */
  function pivotChoice(req: Extract<ConvertRequest, { type: 'pivotChoice' }>): ConvertFileSummary {
    const h = held(req.fileId);
    // the page's word is not taken for more than it is: `off` only when it is true, `describes` only as whole numbers (anything else is ignored)
    const describes = Array.isArray(req.describes) ? req.describes.filter((d): d is number => Number.isInteger(d) && d >= 0) : [];
    const choice: PivotChoice = { ...(req.off === true ? { off: true } : {}), ...(describes.length > 0 ? { describes } : {}) };
    if (choice.off === true || choice.describes !== undefined) h.choices[req.sheet] = choice;
    else delete h.choices[req.sheet];
    repivot(h);
    return summaryOf(h);
  }

  /** The conversion of a request: the records and findings of the core, and the model the writers take. */
  function compute(body: ConvertRequestBody) {
    const sheets: ConvertSheetInput[] = body.sheets.map((s) => ({
      file: held(s.fileId).parsed,
      sheet: s.sheet,
      mapping: s.mapping,
      shape: s.shape,
      ...(s.quantity ? { quantity: s.quantity } : {}),
      ...(s.cruise !== undefined && s.cruise.trim() !== '' ? { cruise: s.cruise.trim() } : {}),
      ...(s.device ? { device: s.device } : {}),
      ...(s.meshUm !== undefined && s.meshUm.trim() !== '' ? { meshUm: s.meshUm } : {}),
      ...(s.nerc ? { nerc: s.nerc } : {}),
      ...(Array.isArray(s.unconfirmedTaxa) ? { unconfirmedTaxa: s.unconfirmedTaxa.filter((i) => Number.isInteger(i)) } : {}),
      // the page's word is not taken for more than a boolean: a profile mark and the approval of depth-based level IDs
      ...(s.profile !== undefined && s.profile !== null && typeof s.profile === 'object' ? { profile: { depthIds: s.profile.depthIds === true, ignoreCast: s.profile.ignoreCast === true, positionStation: s.profile.positionStation === true } } : {}),
    }));
    const splits = listSplits({ sheets, approvedSplits: body.approvedSplits });
    const r = convert({ sheets, options: body.options, approvedSplits: body.approvedSplits, ...(body.worms ? { worms: body.worms } : {}) });
    return { sheets, splits, r };
  }

  const today = (): string => new Date().toISOString().slice(0, 10);
  /** What the companion keeps. `worms`: a lookup was made. `nvs`: an identifier chosen from an NVS search is in the request (the worker never sees the box itself; the page writes `nvs=yes` into the file from the box). */
  const decisionsOf = (body: ConvertRequestBody): ConvertSettings => {
    const profileSheets = [...new Set(body.sheets.filter((s) => s.profile !== undefined).map((s) => s.sheet))];
    const profileDepthIds = [...new Set(body.sheets.filter((s) => s.profile?.depthIds === true).map((s) => s.sheet))];
    const profileIgnoreCast = [...new Set(body.sheets.filter((s) => s.profile?.ignoreCast === true).map((s) => s.sheet))];
    const longAsTable = [...new Set(body.sheets.filter((s) => files.get(s.fileId)?.choices[s.sheet]?.off === true).map((s) => s.sheet))];
    return {
      fullList: body.options.fullList === true,
      prefixStation: body.options.prefixStation === true,
      worms: body.worms !== undefined,
      nvs: body.sheets.some((s) => Object.values(s.nerc ?? {}).some((d) => d?.type?.source === 'nvs' || d?.unit?.source === 'nvs')),
      ...(profileSheets.length > 0 ? { profileSheets } : {}),
      ...(profileDepthIds.length > 0 ? { profileDepthIds } : {}),
      ...(profileIgnoreCast.length > 0 ? { profileIgnoreCast } : {}),
      ...(longAsTable.length > 0 ? { longAsTable } : {}),
    };
  };

  function run(body: ConvertRequestBody): ConvertView {
    const { splits, r } = compute(body);
    const dataset = toDataset(r, body.metadata ?? EMPTY_METADATA, decisionsOf(body));
    // the checks of the output tables (the description of the dataset is judged by the page: it changes with every keystroke)
    const findings = [...r.findings, ...validateTables(dataset, r.findings, { today: today() })];
    const codesMissing = r.findings
      // the one-time code proposal is for a biology sheet's samples; a profile sheet's missing level codes have their own way out (a code column, or the approval)
      .filter((f) => f.ruleId === 'CONV-SAMPLE-CODE-MISSING' && f.params.profile !== 'yes')
      .flatMap((f) => body.sheets.filter((s) => s.sheet === f.sheet && held(s.fileId).parsed.fileName === f.file).map((s) => ({ fileId: s.fileId, sheet: s.sheet })));
    const TYPE = { cruise: 'cruise', station: 'station', sample: 'sample', level: 'profile level' } as const;
    // the first few of each level, taken without sorting or filtering the whole list twice over (a profile can be tens of thousands of events)
    const by = (t: keyof typeof TYPE): EventRec[] => {
      const out: EventRec[] = [];
      for (const e of r.events) {
        if (e.eventType !== TYPE[t]) continue;
        out.push(e);
        if (out.length >= EXAMPLES[t]) break;
      }
      return out;
    };
    return {
      ok: judge(findings).blocking.length === 0,
      findings,
      stats: r.stats,
      tree: r.tree,
      splits,
      cruiseText: r.cruiseText,
      worms: r.nameLookup,
      examples: { cruise: by('cruise'), station: by('station'), sample: by('sample'), level: by('level') },
      profile: r.profile,
      codeCollision: r.findings.some((f) => f.ruleId === 'CONV-ID-DUPLICATE' && f.params.kind === 'event'),
      codesMissing: codesMissing.filter((c, i, a) => a.findIndex((x) => x.fileId === c.fileId && x.sheet === c.sheet) === i),
    };
  }

  /**
   * The export. Everything is checked again here, from the request alone: the page's idea of "nothing blocks and every warning is accepted" is not
   * trusted. Refuses (throws) with a blocking finding or a warning that was not accepted; nothing is written then.
   */
  async function exportArchive(req: ExportBody): Promise<ExportResult> {
    const { r } = compute(req.body);
    const dataset = toDataset(r, req.metadata, decisionsOf(req.body));
    const findings = [...r.findings, ...validateDataset(dataset, r.findings, { today: today() }), ...licenceDiffersFindings(req.metadata.licence, licenceSource)];
    const j = judge(findings);
    if (j.blocking.length > 0) throw new Error(`Export refused: ${j.blocking.length} finding(s) block it (${[...new Set(j.blocking.map((f) => f.ruleId))].join(', ')}). Nothing was written.`);
    const open = j.acceptRules.filter((id) => !req.accepted.includes(id));
    if (open.length > 0) throw new Error(`Export refused: ${open.join(', ')} not accepted. Nothing was written.`);
    if (dataset.events.length === 0 || dataset.occurrences.length === 0) throw new Error('Export refused: there is nothing to write (no event or no occurrence).');
    const eml = buildEml(dataset, { generated: req.generated });
    const files = archiveFiles(dataset, eml);
    const deflate = streamDeflate();
    const bytes = await buildZip(files, deflate);
    return {
      fileName: archiveFileName(dataset),
      bytes,
      counts: { events: dataset.events.length, occurrences: dataset.occurrences.length, measurements: dataset.measurements.length },
      deflated: deflate !== undefined,
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
          licenceSource = { ids: [], disagree: false };
          return null;
        case 'parse':
          return parse(req);
        case 'convert':
          return run(req.body);
        case 'proposeCodes':
          return proposeCodes(req);
        case 'pivotChoice':
          return pivotChoice(req);
        case 'export':
          return exportArchive(req.export);
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
