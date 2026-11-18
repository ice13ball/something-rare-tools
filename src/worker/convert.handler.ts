// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Everything the convert worker does, as plain functions over one session's state (the worker entry only moves messages; tests call this directly).
//
// Not composed from createHandler() of worker/handler.ts, on purpose: that handler keeps the parsed files private and builds /check datasets,
// and exposing them would change /check's worker. This session reads files with the same core functions (parseFile, readMappingFile,
// proposeLayout is not needed: a converter sheet is one table) and proposes columns with the converter overlay over the shared proposer.
import { licenceDiffersFindings } from '../core/convert/validate';
import { archiveFileName, archiveFiles, buildEml, buildZip, convert, countNotWritten, judge, notWrittenCsv, listSplits, pivotConvertFile, proposeConvertColumns, proposeSampleCodes, streamDeflate, suggestConvertProfile, suggestConvertShape, toDataset, validateDataset, validateTables } from '../core/convert';
import type { ConvertSheetInput, EventRec, PivotChoice, PivotNote } from '../core/convert';
import { joinInputs } from '../core/convert/sampleJoin';
import type { ConflictAnswer, JoinOutcome, SampleJoinRequestCore } from '../core/convert/sampleJoin';
import { dictionaryReason } from '../core/convert/dictionary';
import { readLongSheet } from '../core/convert/pivot';
import { turnConvertFile } from '../core/convert/turn';
import { applyDecimalReading, askedDecimalColumns, type DecimalReading } from '../core/convert/decimalReading';
import { bytesHash, resolveKeyHashes } from '../core/convert/keySetting';
import { declareEncoding } from '../core/convert/encodingReading';
import { transposedSheetReason } from '../core/convert/transposed';
import { firstRowIsUnits } from '../core/recognize/layout';
import { EMPTY_METADATA } from '../core/convert/metadata';
import { buildPrefill, licenceSourceOf, pangaeaHeaderRecord, prefillValues } from '../core/convert/prefill';
import type { LicenceSource } from '../core/convert/prefill';
import { archiveDescriptorKind, readConvertFile } from '../core/convert/read';
import { MAX_KEY_PREFIX, biomassBasisOf, readConvertSettings } from '../core/convert/settings';
import type { ConvertSettings } from '../core/convert/settings';
import { notUsedLedger } from '../core/convert/ledger';
import type { SheetKeyReport } from '../core/convert/sampleKey';
import { previewSampleKey } from '../core/convert/keyPreview';
import type { SheetLedger } from '../core/convert/ledger';
import { parseFile } from '../core/parse';
import { decodeText, type EncodingReading, type LegacyEncoding } from '../core/values/encoding';
import { toMapping } from '../core/recognize/columns';
import type { ColumnProposal, LayoutPlan, MetadataRecord, ParsedFile, RawCell, SheetMapping, TurnDeclaration } from '../core/types';
import type { ConvertEngine, ConvertFileSummary, ConvertParseResult, ConvertRequest, ConvertRequestBody, ConvertResultOf, ConvertRequestType, ConvertView, CodeProposalView, ExportBody, ExportResult, NotWrittenBody, NotWrittenResult, SheetRef } from './convert.protocol';
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
  /** The file after the long sheets are pivoted and before any turn: what the person's declarations "the samples are the columns" turn. */
  pivoted: ParsedFile;
  /** The person's declarations "the samples are the columns", by sheet name (checked against the sheet as dropped). Applied to a sheet that is not a long sheet read through its pivot. */
  turns: Record<string, TurnDeclaration>;
  /** The sheets whose declaration was pre-ticked from a companion file and not changed since. */
  turnsFromFile: Set<string>;
  /** The person's answers "decimal comma" or "thousands separator", by sheet name and column index of the sheet as dropped; only a column IN-DECIMAL-AMBIGUOUS of that sheet names. Applied to the file as read, before any pivot or turn. */
  decimal: Record<string, Record<number, DecimalReading>>;
  /** The answers read from a companion file and not changed since: `<sheet>\0<index>`. */
  decimalFromFile: Set<string>;
  /** Only for a file whose 8-bit letters read differently in the code pages (IN-ENCODING-AMBIGUOUS): its bytes (kept for no other file), the readings of the first decode, the hash of the bytes and the file as first read, to which "Ask again" returns. */
  source?: { name: string; bytes: Uint8Array; readings: readonly EncodingReading[]; hash: string; initial: ParsedFile };
  /** The code page the person picked (or the companion file gave: `fromFile`) for that file. */
  encoding?: { encoding: LegacyEncoding; fromFile: boolean };
}

/** The file as the converter reads it: its bytes decoded (with the code page the person named, if any), the formula guard off, a PANGAEA file with its parameter block read from the same text. */
function readBytes(name: string, bytes: Uint8Array, encoding?: LegacyEncoding): ParsedFile {
  const read = parseFile(name, bytes, encoding === undefined ? undefined : { encoding });
  return readConvertFile(read, read.kind === 'pangaea' ? decodeText(bytes, encoding).text : undefined);
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
  /** How many answers of an older companion file (no count with them) this drop holds: they are not applied, the questions are asked again, and the person is told once. */
  let oldAnswers = 0;
  // the kind of mass a companion file of this drop gave the biomass columns of a sheet, by sheet name: a pre-pick for columns the header leaves open
  let biomassPick = new Map<string, 'wet' | 'dry' | 'afdw'>();
  // the ticks "of each organism" a companion file of this drop sets or takes back, by sheet and column header
  let occurrencePick = new Map<string, Map<string, boolean>>();

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
    // the files whose 8-bit letters read differently (IN-ENCODING-AMBIGUOUS): their bytes, until the person has picked (or a companion file of this drop has)
    const ambiguous = new Map<ParsedFile, { name: string; bytes: Uint8Array; readings: readonly EncodingReading[] }>();
    const encodingPick = new Map<string, LegacyEncoding>();
    for (const f of req.files as InputFile[]) {
      const archiveKind = archiveDescriptorKind(f.bytes);
      if (archiveKind) {
        // an eml.xml or meta.xml of a Darwin Core archive: never a data sheet, listed and not read
        result.archiveFiles.push({ fileName: f.name, kind: archiveKind });
        continue;
      }
      try {
        // the converter's own reading path: the formula guard of its code-proposal CSV comes off every text cell and header (core/convert/read.ts)
        const parsed = readBytes(f.name, f.bytes);
        parsedAll.push(parsed);
        if ((parsed.kind === 'csv' || parsed.kind === 'pangaea') && parsed.findings.some((x) => x.ruleId === 'IN-ENCODING-AMBIGUOUS')) {
          const readings = decodeText(f.bytes).readings;
          if (readings !== undefined) ambiguous.set(parsed, { name: f.name, bytes: f.bytes, readings });
        }
      } catch (e) {
        result.problems.push({ fileName: f.name, message: e instanceof Error ? e.message : String(e) });
      }
    }
    const settings: ConvertSettings = result.settings;
    // the sheets a companion file of this drop says are read as normal tables (a pre-tick, by sheet name): known before any file is pivoted, whatever the order of the files
    const asTable = new Set<string>();
    const turnPick = new Map<string, NonNullable<ConvertSettings['turned']>[number]>();
    const decimalPick: NonNullable<ConvertSettings['decimalReading']> = [];
    biomassPick = new Map();
    occurrencePick = new Map();
    for (const parsed of parsedAll) {
      if (parsed.kind === 'metadata') continue;
      const cs = readConvertSettings(parsed);
      for (const n of cs?.longAsTable ?? []) asTable.add(n);
      for (const t of cs?.turned ?? []) if (!turnPick.has(t.sheet)) turnPick.set(t.sheet, t);
      for (const e of cs?.encoding ?? []) if (!encodingPick.has(e.hash)) encodingPick.set(e.hash, e.encoding);
      for (const d of cs?.decimalReading ?? []) if (!decimalPick.some((x) => x.sheet === d.sheet && x.hash === d.hash)) decimalPick.push(d);
      for (const b of cs?.biomassBasis ?? []) if (!biomassPick.has(b.sheet)) biomassPick.set(b.sheet, b.basis);
      for (const o of cs?.perOccurrence ?? []) {
        const m = occurrencePick.get(o.sheet) ?? new Map<string, boolean>();
        if (!m.has(o.header)) m.set(o.header, o.on);
        occurrencePick.set(o.sheet, m);
      }
    }
    for (const first of parsedAll) {
      let parsed = first;
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
        for (const n of s.transposedAsTable ?? []) if (!(settings.transposedAsTable ??= []).includes(n)) settings.transposedAsTable.push(n);
        for (const n of s.presenceOnly ?? []) if (!(settings.presenceOnly ??= []).includes(n)) settings.presenceOnly.push(n);
        for (const n of s.totalOnce ?? []) if (!(settings.totalOnce ??= []).includes(n)) settings.totalOnce.push(n);
        for (const n of s.realCounts ?? []) if (!(settings.realCounts ??= []).includes(n)) settings.realCounts.push(n);
        for (const c of s.realCountsRows ?? []) if (!(settings.realCountsRows ??= []).some((x) => x.sheet === c.sheet)) settings.realCountsRows.push(c);
        for (const n of s.dropCopies ?? []) if (!(settings.dropCopies ??= []).includes(n)) settings.dropCopies.push(n);
        // the answers of an earlier run to the questions about rows: kept with their numbers, and the converter uses them only where the numbers are the same today
        for (const c of s.dropCopiesRows ?? []) if (!(settings.dropCopiesRows ??= []).some((x) => x.sheet === c.sheet)) settings.dropCopiesRows.push(c);
        for (const c of s.ownRecords ?? []) if (!(settings.ownRecords ??= []).some((x) => x.sheet === c.sheet)) settings.ownRecords.push(c);
        for (const c of s.keepCopiesRows ?? []) if (!(settings.keepCopiesRows ??= []).some((x) => x.sheet === c.sheet)) settings.keepCopiesRows.push(c);
        for (const c of s.totalOnceGroups ?? []) if (!(settings.totalOnceGroups ??= []).some((x) => x.sheet === c.sheet)) settings.totalOnceGroups.push(c);
        for (const c of s.leaveOut ?? []) if (!(settings.leaveOut ??= []).some((x) => x.sheet === c.sheet && x.reason === c.reason)) settings.leaveOut.push(c);
        for (const k of s.sampleKey ?? []) if (!(settings.sampleKey ??= []).some((x) => x.sheet === k.sheet)) settings.sampleKey.push(k);
        for (const t of s.turned ?? []) if (!(settings.turned ??= []).some((x) => x.sheet === t.sheet)) settings.turned.push(t);
        for (const d of s.declaredPosition ?? []) if (!(settings.declaredPosition ??= []).some((x) => x.sheet === d.sheet)) settings.declaredPosition.push(d);
        for (const d of s.declaredDate ?? []) if (!(settings.declaredDate ??= []).some((x) => x.sheet === d.sheet)) settings.declaredDate.push(d);
        for (const d of s.dayMonthOrder ?? []) if (!(settings.dayMonthOrder ??= []).some((x) => x.sheet === d.sheet && x.hash === d.hash)) settings.dayMonthOrder.push(d);
        // the joins and declined pairs of the companion file(s), by file and sheet name: the page re-opens each one whose rows or key columns changed
        for (const j of s.sampleJoin ?? []) if (!(settings.sampleJoin ??= []).some((x) => x.results[0] === j.results[0] && x.results[1] === j.results[1])) settings.sampleJoin.push(j);
        for (const j of s.sampleJoinNo ?? []) if (!(settings.sampleJoinNo ??= []).some((x) => x.results[0] === j.results[0] && x.results[1] === j.results[1] && x.description[0] === j.description[0] && x.description[1] === j.description[1])) settings.sampleJoinNo.push(j);
        for (const b of s.biomassBasis ?? []) if (!(settings.biomassBasis ??= []).some((x) => x.sheet === b.sheet)) settings.biomassBasis.push(b);
        for (const o of s.perOccurrence ?? []) if (!(settings.perOccurrence ??= []).some((x) => x.sheet === o.sheet && x.header === o.header)) settings.perOccurrence.push(o);
        continue;
      }
      if (!isTable(parsed)) {
        result.notRead.push({ fileName: parsed.fileName, kind: parsed.kind });
        continue;
      }
      // a file whose 8-bit letters read differently: a companion file's pick holds only for these very bytes (their hash) and a reading it still names; the file is then read with that code page
      const amb = ambiguous.get(first);
      let source: Held['source'];
      let encoding: Held['encoding'];
      if (amb !== undefined) {
        const hash = bytesHash(amb.bytes);
        source = { ...amb, hash, initial: first };
        const pick = encodingPick.get(hash);
        if (pick !== undefined && amb.readings.some((r) => r.encodings.includes(pick))) {
          parsed = declareEncoding(readBytes(amb.name, amb.bytes, pick), pick, true);
          encoding = { encoding: pick, fromFile: true };
        }
      }
      // a PANGAEA file carries its own description (citation, title, authors, licence, DOI, coverage, abstract when it has one): it goes to the description of the dataset like a dropped
      // metadata file, with its file name as the source; the sheet itself is still a data table
      if (parsed.kind === 'pangaea' && parsed.embeddedMetadata) records.push(pangaeaHeaderRecord(parsed.embeddedMetadata));
      const fileId = `c${++seq}`;
      const h: Held = { fileId, original: parsed, parsed, pivoted: parsed, turns: Object.create(null) as Record<string, TurnDeclaration>, turnsFromFile: new Set(), decimal: Object.create(null) as Record<string, Record<number, DecimalReading>>, decimalFromFile: new Set(), ...(source === undefined ? {} : { source }), ...(encoding === undefined ? {} : { encoding }), choices: Object.assign(Object.create(null) as Record<string, PivotChoice>, Object.fromEntries(parsed.sheets.filter((s) => asTable.has(s.name)).map((s) => [s.name, { off: true }]))) };
      // the turns of a companion file: a pre-tick that holds only when the columns are found again by their hashes and the sheet has the same number of rows
      for (const sheet of parsed.sheets) {
        const t = turnPick.get(sheet.name);
        const decl = t === undefined ? undefined : declarationOf(sheet, t);
        if (decl !== undefined) {
          h.turns[sheet.name] = decl;
          h.turnsFromFile.add(sheet.name);
        }
      }
      // the decimal readings of a companion file: a pre-pick that holds only when the column is found again by its hash, the sheet has the same number of rows and the reader still asks about that column
      for (const sheet of parsed.sheets) {
        const asked = askedDecimalColumns(parsed, sheet.name);
        for (const d of decimalPick) {
          if (d.sheet !== sheet.name || d.rows !== sheet.rows.length) continue;
          const at = resolveKeyHashes(sheet.header, d.hash);
          if (at?.length !== 1 || !asked.includes(at[0])) continue;
          const mine = (h.decimal[sheet.name] ??= Object.create(null) as Record<number, DecimalReading>);
          if (mine[at[0]] !== undefined) continue;
          mine[at[0]] = d.reading;
          h.decimalFromFile.add(`${sheet.name}\0${at[0]}`);
        }
      }
      repivot(h);
      files.set(fileId, h);
      result.files.push(summaryOf(h));
    }
    result.prefillInfo = buildPrefill(records) ?? null;
    result.prefill = prefillValues(result.prefillInfo ?? undefined);
    licenceSource = licenceSourceOf(result.prefillInfo);
    oldAnswers = (settings.realCounts?.length ?? 0) + (settings.dropCopies?.length ?? 0) + (settings.totalOnce?.length ?? 0);
    return result;
  }

  /**
   * A long environmental sheet (one row per measured parameter) that can be read safely is replaced by its pivot, one row per sample, HERE: the page, the roles and every later request
   * see the same columns and the same indexes (core/convert/pivot.ts). The user's choices for the sheet (read it as a normal table; key columns that describe the measurement) are applied.
   */
  function repivot(h: Held): void {
    // the person's answer about a comma is applied to the file as read, before the pivot and the turn: every later step sees the same numbers
    let read = h.original;
    for (const [sheet, answers] of Object.entries(h.decimal)) read = applyDecimalReading(read, sheet, answers, Object.keys(answers).map(Number).filter((i) => h.decimalFromFile.has(`${sheet}\0${i}`)));
    h.pivoted = pivotConvertFile(read, h.choices);
    // a sheet that is read through its pivot is never turned; the turn of any other sheet is applied BEFORE the roles are proposed
    const live = Object.fromEntries(Object.entries(h.turns).filter(([name]) => h.pivoted.sheets.some((s) => s.name === name && s.pivot === undefined)));
    h.parsed = turnConvertFile(h.pivoted, live);
  }

  /** The declaration a saved turn stands for in this sheet, or undefined when a column is not found again by its hash, the name column is also a column that is not a sample, or the sheet has other rows. */
  function declarationOf(sheet: ParsedFile['sheets'][number], t: NonNullable<ConvertSettings['turned']>[number]): TurnDeclaration | undefined {
    if (sheet.rows.length !== t.rows) return undefined;
    const name = resolveKeyHashes(sheet.header, t.nameHash);
    const not = t.notSampleHashes === '' ? [] : resolveKeyHashes(sheet.header, t.notSampleHashes);
    if (name === undefined || name.length !== 1 || not === undefined || not.includes(name[0])) return undefined;
    return { nameColumn: name[0], notSamples: [...not].sort((a, b) => a - b), ...(t.headerDates === true ? { headerDates: true } : {}) };
  }

  /** What the page gets of one file: its sheets (the pivoted ones as they are read), proposals, mappings and suggestions, and what was done to its long sheets. */
  function summaryOf(h: Held): ConvertFileSummary {
    const { fileId, parsed } = h;
    {
      const proposals: Record<string, ColumnProposal[]> = Object.create(null) as Record<string, ColumnProposal[]>;
      const mappings: SheetMapping[] = [];
      const shapes: ConvertFileSummary['suggestedShapes'] = Object.create(null) as ConvertFileSummary['suggestedShapes'];
      const profiles: ConvertFileSummary['suggestedProfiles'] = Object.create(null) as ConvertFileSummary['suggestedProfiles'];
      const dictionary: Record<string, 'name' | 'columns'> = Object.create(null) as Record<string, 'name' | 'columns'>;
      const pivots: Record<string, PivotNote> = Object.create(null) as Record<string, PivotNote>;
      const transposed: Record<string, 'transposed' | 'transposed-taxa' | 'header-units'> = Object.create(null) as Record<string, 'transposed' | 'transposed-taxa' | 'header-units'>;
      // the long sheets the user chose to read as normal tables: listed, so that the page can offer the way back
      const pivotOff = h.original.sheets.filter((s) => h.choices[s.name]?.off === true && readLongSheet(h.original, s).kind === 'pivot').map((s) => s.name);
      const turned: NonNullable<ConvertFileSummary['turned']> = Object.create(null) as NonNullable<ConvertFileSummary['turned']>;
      const turnSource: NonNullable<ConvertFileSummary['turnSource']> = Object.create(null) as NonNullable<ConvertFileSummary['turnSource']>;
      // the readings the person declared for a comma, only for the columns the reader asked about (the sheet in `sheets` may be a pivoted one: its source header and rows are listed too)
      const decimal: NonNullable<ConvertFileSummary['decimal']> = Object.create(null) as NonNullable<ConvertFileSummary['decimal']>;
      const decimalSource: NonNullable<ConvertFileSummary['decimalSource']> = Object.create(null) as NonNullable<ConvertFileSummary['decimalSource']>;
      for (const [name, answers] of Object.entries(h.decimal)) {
        const src = h.original.sheets.find((x) => x.name === name);
        const asked = askedDecimalColumns(h.original, name);
        const kept = Object.entries(answers).filter(([i]) => asked.includes(Number(i)));
        if (src === undefined || kept.length === 0) continue;
        decimal[name] = Object.fromEntries(kept.map(([i, reading]) => [i, { reading, ...(h.decimalFromFile.has(`${name}\0${i}`) ? { fromFile: true as const } : {}) }]));
        decimalSource[name] = { header: [...src.header], rows: src.rows.length };
      }
      for (const sheet of parsed.sheets) {
        if (sheet.turn !== undefined) {
          // the declaration only: the source sheet (and the maps back to it) stay in the worker, no message carries a sheet twice
          turned[sheet.name] = { nameColumn: sheet.turn.nameColumn, notSamples: [...sheet.turn.notSamples], ...(sheet.turn.headerDates === true ? { headerDates: true } : {}), ...(h.turnsFromFile.has(sheet.name) ? { fromFile: true as const } : {}) };
          turnSource[sheet.name] = { header: [...sheet.turn.source.header], rows: sheet.turn.source.rows.length };
        }
        if (sheet.pivot !== undefined) {
          const { cellLines: _lines, lines: _sourceLines, source: _source, ...note } = sheet.pivot;
          pivots[sheet.name] = note;
        }
        const p = proposeConvertColumns(sheet, { decimalComma: parsed.decimalComma, date1904: parsed.date1904 });
        const pick = biomassPick.get(sheet.name);
        if (pick !== undefined) for (const q of p) if (q.role.kind === 'biomass' && q.role.basis === undefined) q.role = { kind: 'biomass', basis: pick };
        // the ticks "of each organism" of a companion file: only on a measured-variable column, and the proposal itself keeps what the tool proposed (the mapping carries the pick)
        const occ = occurrencePick.get(sheet.name);
        proposals[sheet.name] = p;
        const m = toMapping(sheet, p);
        if (occ !== undefined) {
          m.columns = m.columns.map((c) => {
            const on = occ.get(c.header);
            if (on === undefined || c.role.kind !== 'variable') return c;
            const { perOccurrence: _p, ...rest } = c.role;
            return { ...c, role: on ? { ...rest, perOccurrence: true as const } : rest };
          });
        }
        mappings.push(m);
        shapes[sheet.name] = suggestConvertShape(m.columns);
        profiles[sheet.name] = suggestConvertProfile(p);
        const dict = dictionaryReason(sheet, p, parsed.decimalComma);
        if (dict !== undefined) dictionary[sheet.name] = dict;
        // a data dictionary is not tested (its rows are words); a pivoted sheet is skipped inside the test
        const looks = dict === undefined && sheet.turn === undefined ? transposedSheetReason(sheet, parsed, p) : undefined;
        if (looks === 'transposed' || looks === 'transposed-taxa') transposed[sheet.name] = looks;
        // a first row that looks like units and was not folded (CONV-SHEET-UNITS-ROW): the same tick lets the user read the sheet as it stands when the call is wrong
        else if (looks === undefined && dict === undefined && sheet.turn === undefined && firstRowIsUnits(sheet, parsed.decimalComma) !== undefined) transposed[sheet.name] = 'header-units';
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
        ...(Object.keys(dictionary).length > 0 ? { dictionarySheets: dictionary } : {}),
        ...(Object.keys(pivots).length > 0 ? { pivots } : {}),
        ...(Object.keys(turned).length > 0 ? { turned, turnSource } : {}),
        ...(Object.keys(decimal).length > 0 ? { decimal, decimalSource } : {}),
        ...(h.source === undefined ? {} : { encodingReadings: h.source.readings.map((r) => ({ encodings: [...r.encodings], words: r.words })) }),
        ...(h.source === undefined || h.encoding === undefined ? {} : { declaredEncoding: { encoding: h.encoding.encoding, hash: h.source.hash, ...(h.encoding.fromFile ? { fromFile: true as const } : {}) } }),
        ...(pivotOff.length > 0 ? { pivotOff } : {}),
        ...(Object.keys(transposed).length > 0 ? { transposedSheets: transposed } : {}),
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

  /**
   * The person's declaration "the samples are the columns" for one sheet, or taking it back. The page's word is checked against the sheet as dropped: whole numbers inside its width, the name column
   * not also a column that is not a sample; anything else is ignored and the summary comes back unchanged. A sheet read through its pivot is never turned. The file is read again (pivot, then turn).
   */
  function turnChoice(req: Extract<ConvertRequest, { type: 'turnChoice' }>): ConvertFileSummary {
    const h = held(req.fileId);
    const sheet = h.pivoted.sheets.find((s) => s.name === req.sheet);
    if (sheet === undefined || sheet.pivot !== undefined) return summaryOf(h);
    if (req.turn === null) {
      delete h.turns[req.sheet];
      h.turnsFromFile.delete(req.sheet);
      repivot(h);
      return summaryOf(h);
    }
    const t = req.turn;
    const width = sheet.header.length;
    const whole = (i: unknown): i is number => typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < width;
    if (t === undefined || typeof t !== 'object' || !whole(t.nameColumn) || !Array.isArray(t.notSamples) || !t.notSamples.every(whole) || t.notSamples.includes(t.nameColumn)) return summaryOf(h);
    h.turns[req.sheet] = { nameColumn: t.nameColumn, notSamples: [...new Set(t.notSamples)].sort((a, b) => a - b), ...(t.headerDates === true ? { headerDates: true } : {}) };
    h.turnsFromFile.delete(req.sheet);
    repivot(h);
    return summaryOf(h);
  }

  /**
   * The person's answer about the comma of one column ("decimal comma" or "thousands separator"), or taking it back. Only a column that IN-DECIMAL-AMBIGUOUS of that sheet names is kept; anything else (a column the reader
   * did not ask about, an index outside the sheet, a word that is not an answer) leaves the summary unchanged. The answer belongs to that column of that file alone. The file is read again (decimal, pivot, turn).
   */
  function decimalChoice(req: Extract<ConvertRequest, { type: 'decimalChoice' }>): ConvertFileSummary {
    const h = held(req.fileId);
    const key = `${req.sheet}\0${req.index}`;
    if (req.reading === null) {
      const mine = h.decimal[req.sheet];
      if (mine === undefined || mine[req.index] === undefined) return summaryOf(h);
      delete mine[req.index];
      if (Object.keys(mine).length === 0) delete h.decimal[req.sheet];
      h.decimalFromFile.delete(key);
      repivot(h);
      return summaryOf(h);
    }
    if ((req.reading !== 'decimal' && req.reading !== 'thousands') || !Number.isInteger(req.index) || !askedDecimalColumns(h.original, req.sheet).includes(req.index)) return summaryOf(h);
    (h.decimal[req.sheet] ??= Object.create(null) as Record<number, DecimalReading>)[req.index] = req.reading;
    h.decimalFromFile.delete(key);
    repivot(h);
    return summaryOf(h);
  }

  /**
   * The person's pick of the code page of a file whose 8-bit letters read differently (IN-ENCODING-AMBIGUOUS), or taking it back (`null`). Only an encoding that is one of the file's own readings is kept; anything else
   * (a file that was not asked about, UTF-8, a word that is no code page) leaves the summary unchanged. The bytes are read again with that code page, then the decimal answers are checked against the new reading
   * (an answer for a column the reader no longer asks about, or one that came from the companion file for a header that now reads differently, is dropped: the question is open again), then pivot and turn.
   */
  function encodingChoice(req: Extract<ConvertRequest, { type: 'encodingChoice' }>): ConvertFileSummary {
    const h = held(req.fileId);
    const src = h.source;
    if (src === undefined) return summaryOf(h);
    const pick = req.encoding;
    if (pick !== null && !src.readings.some((r) => (r.encodings as readonly unknown[]).includes(pick))) return summaryOf(h);
    if (pick === null && h.encoding === undefined) return summaryOf(h);
    const fresh = pick === null ? src.initial : declareEncoding(readBytes(src.name, src.bytes, pick), pick, false);
    const before = h.original;
    const wasWidth = new Map(before.sheets.map((x) => [x.name, x.header.length] as const));
    h.original = fresh;
    if (pick === null) delete h.encoding;
    else h.encoding = { encoding: pick, fromFile: false };
    // an 8-bit code page never makes a delimiter or a quote, so the file's own columns stay the same and only the letters change: the person's other answers stay while they still mean the same column
    for (const [sheet, answers] of Object.entries(h.decimal)) {
      const asked = askedDecimalColumns(fresh, sheet);
      const was = before.sheets.find((x) => x.name === sheet)?.header ?? [];
      const now = fresh.sheets.find((x) => x.name === sheet)?.header ?? [];
      for (const k of Object.keys(answers)) {
        const i = Number(k);
        const key = `${sheet}\0${i}`;
        if (asked.includes(i) && !(h.decimalFromFile.has(key) && was[i] !== now[i])) continue;
        delete answers[i];
        h.decimalFromFile.delete(key);
      }
      if (Object.keys(answers).length === 0) delete h.decimal[sheet];
    }
    for (const name of [...h.turnsFromFile]) {
      const a = before.sheets.find((x) => x.name === name)?.header ?? [];
      const b = fresh.sheets.find((x) => x.name === name)?.header ?? [];
      if (a.length !== b.length || a.some((x, i) => x !== b[i])) {
        delete h.turns[name];
        h.turnsFromFile.delete(name);
      }
    }
    repivot(h);
    // the answers kept by column number (the person's comma answers, `describes`) name columns of the file as read: for a sheet whose width there changed they no longer name the same columns. A pivot reads `describes` as a set of numbers, so the stale ones cannot throw
    const widths = (f: ParsedFile): Map<string, number> => new Map(f.sheets.map((x) => [x.name, x.header.length]));
    const nowWidth = widths(h.original);
    const changed = [...nowWidth].filter(([name, w]) => wasWidth.get(name) !== w).map(([name]) => name);
    if (changed.length > 0) {
      for (const name of changed) {
        delete h.turns[name];
        h.turnsFromFile.delete(name);
        delete h.decimal[name];
        for (const k of [...h.decimalFromFile]) if (k.startsWith(`${name}\0`)) h.decimalFromFile.delete(k);
        const c = h.choices[name];
        if (c?.describes !== undefined) {
          if (c.off === true) h.choices[name] = { off: true };
          else delete h.choices[name];
        }
      }
      repivot(h);
    }
    return summaryOf(h);
  }

  /** The sample key of a request sheet, checked: only whole numbers that are columns of the sheet, each once. Nothing, when nothing is left. */
  function keyOf(s: ConvertRequestBody['sheets'][number]): Pick<ConvertSheetInput, 'sampleKey' | 'sampleKeyFromFile'> {
    const width = held(s.fileId).parsed.sheets.find((x) => x.name === s.sheet)?.header.length ?? 0;
    const columns = [...new Set((s.sampleKey?.columns ?? []).filter((i): i is number => Number.isInteger(i) && i >= 0 && i < width))];
    // the name in front of the IDs: the person's text, as long as the companion file keeps it; an empty or very long one is no name
    const raw = typeof s.sampleKey?.prefix === 'string' ? s.sampleKey.prefix.trim() : '';
    const prefix = raw !== '' && raw.length <= MAX_KEY_PREFIX ? raw : undefined;
    return columns.length === 0 ? {} : { sampleKey: { columns, ...(prefix === undefined ? {} : { prefix }) }, ...(s.sampleKeyFromFile === true ? { sampleKeyFromFile: true } : {}) };
  }

  /** The day/month orders of a request sheet, checked: whole-number column indexes within the sheet, `dmy` or `mdy`; a from-file mark only for an index whose order is kept. Nothing, when nothing is left. */
  function orderOf(s: ConvertRequestBody['sheets'][number]): Pick<ConvertSheetInput, 'dayMonthOrder' | 'dayMonthOrderFromFile'> {
    if (s.dayMonthOrder === undefined || s.dayMonthOrder === null || typeof s.dayMonthOrder !== 'object') return {};
    const width = held(s.fileId).parsed.sheets.find((x) => x.name === s.sheet)?.header.length ?? 0;
    const kept: Record<number, 'dmy' | 'mdy'> = {};
    for (const [k, v] of Object.entries(s.dayMonthOrder)) {
      const i = Number(k);
      if (/^\d+$/.test(k) && Number.isInteger(i) && i < width && (v === 'dmy' || v === 'mdy')) kept[i] = v;
    }
    if (Object.keys(kept).length === 0) return {};
    const fromFile = Array.isArray(s.dayMonthOrderFromFile) ? [...new Set(s.dayMonthOrderFromFile.filter((i) => Number.isInteger(i) && kept[i] !== undefined))] : [];
    return { dayMonthOrder: kept, ...(fromFile.length === 0 ? {} : { dayMonthOrderFromFile: fromFile }) };
  }

  /** The position a person declared for a request sheet: three non-empty strings, trimmed, each at most 40 characters (the core reads the numbers and refuses what is not one). Nothing otherwise. */
  function declaredOf(s: ConvertRequestBody['sheets'][number]): Pick<ConvertSheetInput, 'declaredPosition' | 'declaredPositionFromFile' | 'declaredDate' | 'declaredDateFromFile'> {
    const date = typeof s.declaredDate === 'string' ? s.declaredDate.trim() : '';
    const dateOut = date === '' || date.length > 40 ? {} : { declaredDate: date, ...(s.declaredDateFromFile === true ? { declaredDateFromFile: true } : {}) };
    const d = s.declaredPosition;
    if (d === undefined || d === null || typeof d !== 'object') return dateOut;
    const [lat, lon, uncertaintyM] = [d.lat, d.lon, d.uncertaintyM].map((x) => (typeof x === 'string' ? x.trim() : ''));
    if ([lat, lon, uncertaintyM].some((x) => x === '' || x.length > 40)) return dateOut;
    return { declaredPosition: { lat, lon, uncertaintyM }, ...(s.declaredPositionFromFile === true ? { declaredPositionFromFile: true } : {}), ...dateOut };
  }

  /** The sheets of a request as the core takes them, before any join. */
  function rawInputsOf(body: ConvertRequestBody): ConvertSheetInput[] {
    return body.sheets.map((s) => ({
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
      ...(Array.isArray(s.handSet) ? { handSet: s.handSet.filter((i) => Number.isInteger(i)) } : {}),
      // the columns the person set to ignore, computed here from the worker's own proposals (never from a flag of the page)
      ignoreChosen: ignoreChosenOf(s),
      ...(s.readAsTable === true ? { readAsTable: true } : {}),
      ...(s.presenceOnly === true ? { presenceOnly: true } : {}),
      // (a bare tick for totalOnce, realCounts or dropCopies is not forwarded: an answer that switches a check off or takes rows out reaches the converter only with the number it was given for)
      // the answers carry the numbers they hold for; only whole numbers count, and the core compares them with today's
      ...(Number.isInteger(s.dropCopiesCount) && (s.dropCopiesCount as number) >= 0 ? { dropCopiesCount: s.dropCopiesCount as number } : {}),
      ...(Number.isInteger(s.totalOnceCount) && (s.totalOnceCount as number) >= 0 ? { totalOnceCount: s.totalOnceCount as number } : {}),
      ...(s.dropCopiesFromFile === true ? { dropCopiesFromFile: true } : {}),
      // "each row is its own record": only the boolean true; the copies answer only with its number (no bare keepCopies is forwarded, as for dropCopies)
      ...(s.ownRecords === true ? { ownRecords: true, ...(s.ownRecordsFromFile === true ? { ownRecordsFromFile: true } : {}) } : {}),
      ...(Number.isInteger(s.keepCopiesCount) && (s.keepCopiesCount as number) >= 0 ? { keepCopiesCount: s.keepCopiesCount as number } : {}),
      ...(s.keepCopiesFromFile === true ? { keepCopiesFromFile: true } : {}),
      ...(s.totalOnceFromFile === true ? { totalOnceFromFile: true } : {}),
      ...(Number.isInteger(s.realCountsRows) && (s.realCountsRows as number) >= 0 ? { realCountsRows: s.realCountsRows as number } : {}),
      ...(Number.isInteger(s.realCountsRowsFile) && (s.realCountsRowsFile as number) >= 0 ? { realCountsRowsFile: s.realCountsRowsFile as number } : {}),
      // the page's word is not taken for more than a list of words and whole numbers; the core ignores a reason that cannot be left out
      ...(Array.isArray(s.leaveOut) && s.leaveOut.length > 0
        ? { leaveOut: s.leaveOut.filter((r) => r !== null && typeof r === 'object' && typeof r.reason === 'string' && Number.isInteger(r.count)).map((r) => ({ reason: r.reason, count: r.count })) }
        : {}),
      // the columns the person picked as the sample key: whole numbers only, each column once, in the order picked (the core reads nothing else; a profile sheet takes no key)
      ...(s.profile === undefined && s.sampleKey !== undefined && s.sampleKey !== null && Array.isArray(s.sampleKey.columns) ? keyOf(s) : {}),
      // the day/month order the person declared, by column: whole-number columns of the sheet and the two orders only
      ...orderOf(s),
      // the position the person typed for a sheet with none
      ...declaredOf(s),
      ...(Array.isArray(s.leaveOutFile) && s.leaveOutFile.length > 0
        ? { leaveOutFile: s.leaveOutFile.filter((g) => g !== null && typeof g === 'object' && typeof g.reason === 'string' && Number.isInteger(g.count) && Number.isInteger(g.rows)).map((g) => ({ reason: g.reason, count: g.count, rows: g.rows })) }
        : {}),
      // the page's word is not taken for more than a boolean: a profile mark and the approval of depth-based level IDs
      ...(s.profile !== undefined && s.profile !== null && typeof s.profile === 'object' ? { profile: { depthIds: s.profile.depthIds === true, ignoreCast: s.profile.ignoreCast === true, positionStation: s.profile.positionStation === true } } : {}),
    }));
  }

  /**
   * The columns of a requested sheet that the person set to ignore: the requested role is `ignore` and the converter's own proposal for the column (proposed again here from the held file, the way the
   * page was given it) is another role. A requested `ignore` equal to the proposal counts as the proposal; so does a taxon candidate the page sent as `ignore` because it was never confirmed.
   * The proposal is the worker's, so a page that is reloaded with a companion file keeps the person's own ignore: it still differs from the proposal.
   */
  function ignoreChosenOf(s: ConvertRequestBody['sheets'][number]): number[] {
    const sheet = held(s.fileId).parsed.sheets.find((x) => x.name === s.sheet);
    if (sheet === undefined || !Array.isArray(s.mapping?.columns)) return [];
    const parsed = held(s.fileId).parsed;
    const proposal = proposeConvertColumns(sheet, { decimalComma: parsed.decimalComma, date1904: parsed.date1904 });
    const unconfirmed = new Set(Array.isArray(s.unconfirmedTaxa) ? s.unconfirmedTaxa : []);
    return s.mapping.columns.filter((c) => c.role.kind === 'ignore' && !unconfirmed.has(c.index) && proposal.find((p) => p.index === c.index)?.role.kind !== 'ignore').map((c) => c.index);
  }

  /** A request's reference to a sheet as the index of that sheet in the request, or undefined when the request holds no such sheet. */
  const indexOfRef = (body: ConvertRequestBody, ref: SheetRef | undefined): number | undefined => {
    if (ref === null || typeof ref !== 'object') return undefined;
    const at = body.sheets.findIndex((s) => s.fileId === ref.fileId && s.sheet === ref.sheet);
    return at < 0 ? undefined : at;
  };
  const refOf = (body: ConvertRequestBody, at: number): SheetRef => ({ fileId: body.sheets[at].fileId, sheet: body.sheets[at].sheet });
  const wholeCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
  const sideOf = (t: unknown): t is 'description' | 'results' => t === 'description' || t === 'results';

  /** The person's answers to the groups of differing values, as far as their shape goes (what a group means is the merge's to judge). */
  function answersOf(list: unknown): ConflictAnswer[] {
    if (!Array.isArray(list)) return [];
    const out: ConflictAnswer[] = [];
    for (const a of list as unknown[]) {
      const c = a as Partial<ConflictAnswer> | null;
      if (c === null || typeof c !== 'object' || typeof c.group !== 'string' || !wholeCount(c.count)) continue;
      const exceptions = (Array.isArray(c.exceptions) ? c.exceptions : []).filter((x) => x !== null && typeof x === 'object' && typeof x.entry === 'string' && sideOf(x.take)).map((x) => ({ entry: x.entry, take: x.take }));
      const pairs = (Array.isArray(c.pairs) ? c.pairs : [])
        .filter((x) => x !== null && typeof x === 'object' && Array.isArray(x.pair) && x.pair.length === 2 && typeof x.pair[0] === 'string' && typeof x.pair[1] === 'string' && sideOf(x.take))
        .map((x) => ({ pair: [x.pair[0], x.pair[1]] as [string, string], take: x.take }));
      out.push({ group: c.group, ...(sideOf(c.take) ? { take: c.take } : {}), count: c.count, exceptions, ...(pairs.length > 0 ? { pairs } : {}) });
    }
    return out;
  }

  /**
   * The sheets of a request as the core takes them, after the joins the person confirmed. This maps references to request indexes and nothing more (a join whose sheet the request does not hold is
   * dropped): `joinInputs` is the only validator of a join. `outcome.origin` says, for each sheet returned, the request sheet it came from; `outcome.conflicts[].results` and the proposals are request indexes.
   */
  function inputsOf(body: ConvertRequestBody): { sheets: ConvertSheetInput[]; outcome: JoinOutcome } {
    const raw = rawInputsOf(body);
    const joins: SampleJoinRequestCore[] = [];
    for (const j of Array.isArray(body.sampleJoin) ? body.sampleJoin : []) {
      if (j === null || typeof j !== 'object') continue;
      const results = indexOfRef(body, j.results);
      const description = indexOfRef(body, j.description);
      if (results === undefined || description === undefined) continue;
      joins.push({
        results,
        description,
        keys: j.keys,
        conflicts: answersOf(j.conflicts),
        ...(wholeCount(j.resultsOnly) ? { resultsOnly: j.resultsOnly } : {}),
        ...(j.fromFile === true ? { resultsOnlyFromFile: true } : {}),
      });
    }
    const declined: { results: number; description: number }[] = [];
    for (const d of Array.isArray(body.sampleJoinNo) ? body.sampleJoinNo : []) {
      if (d === null || typeof d !== 'object') continue;
      const results = indexOfRef(body, d.results);
      const description = indexOfRef(body, d.description);
      if (results !== undefined && description !== undefined) declined.push({ results, description });
    }
    const outcome = joinInputs(raw, joins, declined);
    return { sheets: outcome.sheets, outcome };
  }

  /**
   * The conversion of a request: the records and findings of the core, and the model the writers take. `sheets` are the sheets after the joins, the ones `listSplits`, the ledger's `inputIndex` and
   * `notWrittenCsv` all speak of. The findings of the proposals come first; a merge's own findings come out of `convert()`.
   */
  function compute(body: ConvertRequestBody) {
    const { sheets, outcome } = inputsOf(body);
    const splits = listSplits({ sheets, approvedSplits: body.approvedSplits });
    const done = convert({ sheets, options: { ...body.options, today: body.options.today ?? today() }, approvedSplits: body.approvedSplits, ...(body.worms ? { worms: body.worms } : {}), ...(oldAnswers > 0 ? { oldCompanionAnswers: oldAnswers } : {}) });
    const r = outcome.findings.length === 0 ? done : { ...done, findings: [...outcome.findings, ...done.findings] };
    return { sheets, splits, r, outcome };
  }

  const today = (): string => new Date().toISOString().slice(0, 10);
  /** What the companion keeps. `worms`: a lookup was made. `nvs`: an identifier chosen from an NVS search is in the request (the worker never sees the box itself; the page writes `nvs=yes` into the file from the box). */
  const decisionsOf = (body: ConvertRequestBody): ConvertSettings => {
    const profileSheets = [...new Set(body.sheets.filter((s) => s.profile !== undefined).map((s) => s.sheet))];
    const profileDepthIds = [...new Set(body.sheets.filter((s) => s.profile?.depthIds === true).map((s) => s.sheet))];
    const profileIgnoreCast = [...new Set(body.sheets.filter((s) => s.profile?.ignoreCast === true).map((s) => s.sheet))];
    const longAsTable = [...new Set(body.sheets.filter((s) => files.get(s.fileId)?.choices[s.sheet]?.off === true).map((s) => s.sheet))];
    const transposedAsTable = [...new Set(body.sheets.filter((s) => s.readAsTable === true).map((s) => s.sheet))];
    const presenceOnly = [...new Set(body.sheets.filter((s) => s.presenceOnly === true).map((s) => s.sheet))];
    const biomassBasis = biomassBasisOf(body.sheets.map((s) => s.mapping));
    return {
      fullList: body.options.fullList === true,
      prefixStation: body.options.prefixStation === true,
      worms: body.worms !== undefined,
      nvs: body.sheets.some((s) => Object.values(s.nerc ?? {}).some((d) => d?.type?.source === 'nvs' || d?.unit?.source === 'nvs')),
      ...(profileSheets.length > 0 ? { profileSheets } : {}),
      ...(profileDepthIds.length > 0 ? { profileDepthIds } : {}),
      ...(profileIgnoreCast.length > 0 ? { profileIgnoreCast } : {}),
      ...(longAsTable.length > 0 ? { longAsTable } : {}),
      ...(transposedAsTable.length > 0 ? { transposedAsTable } : {}),
      ...(presenceOnly.length > 0 ? { presenceOnly } : {}),
      ...(biomassBasis.length > 0 ? { biomassBasis } : {}),
    };
  };

  /**
   * The sheets of the dropped files that the request leaves out (the page's "use" unticked): the ledger says they were not used. Told apart by file id AND sheet name. A description sheet that a join
   * merged away IS in the request, so it is never listed here: the merge gives it a ledger of its own.
   */
  function notUsedLedgers(body: ConvertRequestBody): SheetLedger[] {
    const asked = new Set(body.sheets.map((s) => `${s.fileId}\u0000${s.sheet}`));
    const out: SheetLedger[] = [];
    for (const [fileId, h] of files) for (const sh of h.parsed.sheets) if (!asked.has(`${fileId}\u0000${sh.name}`)) out.push(notUsedLedger(h.parsed.fileName, sh));
    return out;
  }

  /** Entries of a group the page gets: more than this and the page is told the true count, not the rest (it shows a sample of them). */
  const MAX_CONFLICT_ENTRIES = 500;

  /** What the page needs to ask about the join: the proposals still open and the groups of differing values, with request indexes mapped back to sheet references. */
  function joinView(body: ConvertRequestBody, outcome: JoinOutcome): ConvertView['sampleJoin'] {
    return {
      proposals: outcome.proposals.map((p) => ({ results: refOf(body, p.results), description: refOf(body, p.description), keys: p.keys, covered: p.covered, samples: p.samples, ...(p.long ? { long: true as const } : {}), ...(p.turned === true ? { turned: true as const } : {}) })),
      resultsSheets: outcome.resultsSheets.map((i) => refOf(body, i)),
      conflicts: outcome.conflicts.map(({ answer: _answer, entries, results, ...group }) => ({ ...group, entries: entries.slice(0, MAX_CONFLICT_ENTRIES), results: refOf(body, results) })),
    };
  }

  function run(body: ConvertRequestBody): ConvertView {
    const { splits, r, outcome } = compute(body);
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
      // (the page gets the tallies and the columns; the fate of every line stays in the conversion result, where the list of rows not written reads it)
      ledger: [...r.ledger, ...notUsedLedgers(body)].map((l) => ({ ...l, lines: [] })),
      notWritten: countNotWritten([...r.ledger, ...notUsedLedgers(body)]),
      codeCollision: r.findings.some((f) => f.ruleId === 'CONV-ID-DUPLICATE' && f.params.kind === 'event'),
      codesMissing: codesMissing.filter((c, i, a) => a.findIndex((x) => x.fileId === c.fileId && x.sheet === c.sheet) === i),
      keys: r.keys ?? [],
      sampleJoin: joinView(body, outcome),
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

  /**
   * The list of rows not written, beside the archive. Built from the same conversion as the export (compute) and from the same lines of the ledger as the findings, so it cannot disagree with them.
   * Offered whether or not the export is blocked: it is what the converter did not write.
   */
  function notWritten(req: NotWrittenBody): NotWrittenResult {
    const { sheets, r } = compute(req.body);
    const dataset = toDataset(r, req.metadata, decisionsOf(req.body));
    const { chunks, count } = notWrittenCsv([...r.ledger, ...notUsedLedgers(req.body)], sheets, r.leftOut);
    return { fileName: `${archiveFileName(dataset).replace(/\.zip$/, '')}-not-written.csv`, blob: new Blob(chunks, { type: 'text/csv;charset=utf-8' }), count };
  }

  /**
   * What a key would make of one sheet: the same conversion as the export (compute), with this key on this sheet, so the numbers cannot differ from what the archive will have. A key that is no
   * key (no column of the sheet) gives null. Nothing about the request is changed or kept.
   */
  function previewKey(req: Extract<ConvertRequest, { type: 'previewKey' }>): SheetKeyReport | null {
    const target = req.body.sheets.find((s) => s.fileId === req.fileId && s.sheet === req.sheet);
    if (target === undefined || !Array.isArray(req.columns)) return null;
    // the name as typed at the picker (the preview is what "Use this key" will give), else the one the request carries
    const typed = typeof req.prefix === 'string' ? req.prefix.trim() : '';
    const previewPrefix = typed !== '' && typed.length <= MAX_KEY_PREFIX ? typed : target.sampleKey?.prefix;
    const body = { ...req.body, sheets: req.body.sheets.map((s) => (s === target ? { ...s, sampleKey: { columns: req.columns, ...(previewPrefix === undefined ? {} : { prefix: previewPrefix }) }, sampleKeyFromFile: false } : s)) };
    const { sheets, outcome } = inputsOf(body);
    // the request sheet's place among the sheets after the joins (a description sheet that was merged away has none, so no preview)
    const at = outcome.origin.indexOf(body.sheets.indexOf(body.sheets.find((s) => s.fileId === req.fileId && s.sheet === req.sheet) as (typeof body.sheets)[number]));
    const input = sheets[at];
    if (input === undefined) return null;
    return (
      previewSampleKey(input, {
        sheets,
        options: { ...body.options, today: body.options.today ?? today() },
        approvedSplits: body.approvedSplits,
        ...(body.worms ? { worms: body.worms } : {}),
        ...(oldAnswers > 0 ? { oldCompanionAnswers: oldAnswers } : {}),
      }) ?? null
    );
  }

  function proposeCodes(req: Extract<ConvertRequest, { type: 'proposeCodes' }>): CodeProposalView | null {
    const h = held(req.fileId);
    const sheet = h.parsed.sheets.find((s) => s.name === req.sheet);
    if (!sheet) return null;
    // the shape the user chose on the page decides how the codes are made: a long sheet gets one code per sample, a wide one per row
    const shape = req.shape ?? suggestConvertShape(req.mapping.columns) ?? 'wide';
    const p = proposeSampleCodes(h.parsed, sheet, req.mapping, shape, req.extra ?? []);
    return p ? { fileName: h.parsed.fileName, header: p.header, rows: p.codes.filter((c) => c !== '').length, csv: p.csv, ...(p.grouping === undefined ? {} : { grouping: p.grouping }), ...(p.refusal === undefined ? {} : { refusal: p.refusal }) } : null;
  }

  return {
    handle(req: ConvertRequest): unknown {
      switch (req.type) {
        case 'reset':
          files = new Map();
          seq = 0;
          licenceSource = { ids: [], disagree: false };
          oldAnswers = 0;
          return null;
        case 'parse':
          return parse(req);
        case 'convert':
          return run(req.body);
        case 'proposeCodes':
          return proposeCodes(req);
        case 'pivotChoice':
          return pivotChoice(req);
        case 'turnChoice':
          return turnChoice(req);
        case 'decimalChoice':
          return decimalChoice(req);
        case 'encodingChoice':
          return encodingChoice(req);
        case 'export':
          return exportArchive(req.export);
        case 'notWritten':
          return notWritten(req.notWritten);
        case 'previewKey':
          return previewKey(req);
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
