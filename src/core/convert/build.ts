// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { Collector, metaParser, specsOf } from '../dataset';
import type { Spec } from '../dataset';
import { isBlankCell } from '../recognize/columns';
import { valueText } from '../output/csv';
import { makeConvertFinding } from '../rules/convert';
import type { Finding, ParsedFile, RawCell, RawRow, RawSheet, SheetMapping } from '../types';
import { parseNumber } from '../values/numbers';
import { buildEventTree, eventDateText, stationEventId } from './events';
import type { SampleSite, TreeOptions } from './events';
import { SUMMARY_LABEL, hasTabOrNewline, occurrenceIdLong, occurrenceIdWide, shownText, stationPrefixedId } from './ids';
import type { ConvertResult, EventRec, MofIntent, OccRec, SourceRef } from './model';
import { pickLabel, readDecision, unitContradictsConcept } from './nerc';
import type { NercDecisions } from './nerc';
import { parseTypedNumber, resolveQuantity } from './quantity';
import type { QuantityDeclaration, ResolvedQuantity } from './quantity';
import type { ConvertShape } from './recognize';
import { DEVICES, P01, P06 } from './vocab';
import { approvedSplit, distinctSplits, splitTaxon } from './taxon';
import type { ApprovedSplits, SplitEntry, TaxonSplit } from './taxon';
import { isWritableName, wormsEntry, wormsLsid } from './worms';
import type { WormsLookup } from './worms';

/*
 * The converter's core: confirmed sheets in, records and findings out. Pure: no I/O, no clock, no randomness; the same input gives the same output.
 *
 * One call to `convert()` takes every sheet of the upload (so IDs are checked across the whole archive), the user's decisions (the quantity
 * declaration per sheet, the full-species-list flag, the station prefix toggle, the approved taxon splits, the flattened levels) and returns
 * EventRec / OccRec / MofIntent records plus findings. A result with blocking findings still carries what could be built, so the page can show
 * the preview next to the list of what has to be fixed; `ok` says whether the records may go to the writer (stage 2).
 */

export interface ConvertSheetInput {
  file: ParsedFile;
  /** The sheet's name inside `file`. */
  sheet: string;
  /** The confirmed roles of the sheet (types.ts ColumnRole, with the converter's roles). */
  mapping: SheetMapping;
  /** wide: the HEADERS of the taxon columns are taxa; long: a taxon column and a quantity column. */
  shape: ConvertShape;
  /** What the numbers mean (kind, unit, basis, sample size). Missing or incomplete blocks (CONV-QUANTITY-UNDECLARED). */
  quantity?: QuantityDeclaration;
  /** The cruise code when the sheet has no cruise column (it also fills a cruise cell left empty). */
  cruise?: string;
  /** The sampling device of this sheet's samples: a verified one (a DEVICES key) or the user's own text. Absent: CONV-DEVICE-MISSING. */
  device?: SamplingDevice;
  /** The mesh size in micrometres, as typed. Optional. */
  meshUm?: string;
  /**
   * The NERC identifiers the user confirmed for the sheet's measured-variable columns, by column index (stage 5). Absent or unconfirmed: no identifier is written for
   * that column (CONV-NERC-UNKNOWN, CONV-UNIT-NO-P06). Each pick is checked here (src/core/convert/nerc.ts readDecision); nothing else is believed.
   */
  nerc?: NercDecisions;
}

export type SamplingDevice = { kind: 'known'; key: keyof typeof DEVICES } | { kind: 'other'; text: string };

export interface ConvertOptions {
  /** "This is a full species list" (one tick per upload, kept only in the companion file): a 0 is an absence. */
  fullList?: boolean;
  /** Prefix a sample's eventID with its station's eventID, for sample codes that repeat between stations. */
  prefixStation?: boolean;
  /** Drop the station and/or cruise level. */
  flatten?: TreeOptions['flatten'];
}

export interface ConvertInput {
  sheets: readonly ConvertSheetInput[];
  options?: ConvertOptions;
  /** The user's decisions on taxon splits: verbatim text -> the split accepted. Absent = undecided (blocks when the split changes the name). */
  approvedSplits?: ApprovedSplits;
  /**
   * What the WoRMS opt-in found, by scientificName (stage 4, core/convert/worms.ts). Absent = no lookup: nothing is written and nothing is raised. A name that
   * already has a scientificNameID from the sheet is never looked up and never overwritten.
   */
  worms?: WormsLookup;
}

/* ---------- reading one sheet ---------- */

interface Cols {
  sampleId?: Spec;
  taxonHeaders: Spec[];
  taxonCell?: Spec;
  quantity?: Spec;
  quantityType?: Spec;
  lifeStage?: Spec;
  qualifier?: Spec;
  taxonId?: Spec & { aphia: boolean };
  occurrenceId?: Spec;
  effort?: Spec & { unit?: string };
  depthMin?: Spec & { positive: 'down' | 'up' | 'unknown'; unit?: string };
  depthMax?: Spec & { positive: 'down' | 'up' | 'unknown'; unit?: string };
  depthPlain?: Spec & { positive: 'down' | 'up' | 'unknown'; unit?: string };
  /** Measured-variable columns with a name: each becomes one eMoF row per sample event (stage 5). `name` is the variable as the column's role gives it, `unit` as given. */
  variables: (Spec & { name: string; unit?: string })[];
}

function colsOf(mapping: SheetMapping): Cols {
  const c: Cols = { taxonHeaders: [], variables: [] };
  for (const m of mapping.columns) {
    const spec = { index: m.index, header: m.header };
    const r = m.role;
    switch (r.kind) {
      case 'sampleId':
        c.sampleId ??= spec;
        break;
      case 'taxon':
        if (r.header === true) c.taxonHeaders.push(spec);
        else c.taxonCell ??= spec;
        break;
      case 'quantity':
        c.quantity ??= spec;
        break;
      case 'quantityType':
        c.quantityType ??= spec;
        break;
      case 'lifeStage':
        c.lifeStage ??= spec;
        break;
      case 'qualifier':
        c.qualifier ??= spec;
        break;
      case 'occurrenceId':
        c.occurrenceId ??= spec;
        break;
      case 'taxonId':
        c.taxonId ??= { ...spec, aphia: r.aphia === true };
        break;
      case 'effort':
        c.effort ??= { ...spec, ...(r.unit === undefined ? {} : { unit: r.unit }) };
        break;
      case 'variable': {
        const name = r.variable.trim();
        const unit = r.unit?.trim();
        if (name !== '') c.variables.push({ ...spec, name, ...(unit === undefined || unit === '' ? {} : { unit }) });
        break;
      }
      case 'depth': {
        const d = { ...spec, positive: r.positive, ...(r.unit === undefined ? {} : { unit: r.unit }) };
        if (r.bound === 'min') c.depthMin ??= d;
        else if (r.bound === 'max') c.depthMax ??= d;
        else c.depthPlain ??= d;
        break;
      }
      default:
        break;
    }
  }
  return c;
}

const METRES = /^(m|meters?|metres?)$/i;

/** The scientificNameID a taxon ID column gives for a cell text: an AphiaID column (whole numbers only) as the urn:lsid, any other taxon ID column as given. */
function sheetNameId(col: Spec & { aphia: boolean }, idText: string): string | undefined {
  return col.aphia ? (/^[1-9]\d*$/.test(idText) ? `urn:lsid:marinespecies.org:taxname:${idText}` : undefined) : idText;
}

const text = (raw: unknown): string | undefined => {
  if (raw === null || raw === undefined) return undefined;
  const t = String(raw).trim();
  return t === '' ? undefined : t;
};

/** Lines and an example per (sheet, field): the shape of every "these rows" finding. */
class Lines {
  private readonly map = new Map<string, { lines: Set<number>; examples: string[]; sheet: string; file: string; field: string }>();
  add(file: string, sheet: string, field: string, line: number, example?: string): void {
    const key = `${file}\u0000${sheet}\u0000${field}`;
    let e = this.map.get(key);
    if (!e) this.map.set(key, (e = { lines: new Set(), examples: [], sheet, file, field }));
    e.lines.add(line);
    if (example !== undefined && e.examples.length < 5 && !e.examples.includes(example)) e.examples.push(example);
  }
  entries(): { file: string; sheet: string; field: string; lines: number[]; examples: string[] }[] {
    return [...this.map.values()].map((e) => ({ file: e.file, sheet: e.sheet, field: e.field, lines: [...e.lines].sort((a, b) => a - b), examples: e.examples }));
  }
  get size(): number {
    return this.map.size;
  }
}

interface SampleAcc {
  site: SampleSite;
  sheetKey: string;
  shape: ConvertShape;
  lines: number[];
  /** the station text of the first row, to tell a repeated code of another station from a conflict */
  station?: string;
  dateText?: string;
  effortText?: string;
  conflicts: Set<string>;
  source: SourceRef;
  /** the sample's effort MoF was written */
  effortWritten: boolean;
  /** the sampling device and mesh size measurements of this sample were written */
  deviceWritten: boolean;
  /** the measured-variable columns of this sample that were written, by column index, with the text written (a long sheet repeats the sample on every row of it) */
  varValues: Map<number, string>;
}

/** Where a repeated ID stands: every file and sheet it occurs in, with its own lines (a duplicate across files is reported at each place). */
type Places = Map<string, { file: string; sheet: string; lines: Set<number> }>;
function addPlace(places: Places, file: string, sheet: string, line: number): void {
  const k = `${file}\u0000${sheet}`;
  let p = places.get(k);
  if (!p) places.set(k, (p = { file, sheet, lines: new Set() }));
  p.lines.add(line);
}

const sameNumber = (a: number | undefined, b: number | undefined): boolean => a === b;

/**
 * The columns of the mapping that have a role other than ignore and that nothing of this conversion reads (headers, in column order). It is computed from
 * what the conversion reads, not from a list of roles, so a role added later is reported until it is read:
 *   every shape   latitude, longitude, the date (or datetime) and the time, the station, cruise and sample code: the FIRST column of each (a second one is not read)
 *   wide          the taxon header columns
 *   long          the taxon cell, the quantity, the life stage, the qualifier, the occurrenceID and the taxon ID: the first of each
 *   both          the depth columns that the depth reader uses; the measured-variable columns (stage 5: they are written as eMoF rows on the sample event; a pressure column is not);
 *                 the effort column only when the sheet's sample size is set to "a column"
 * quantityType is read for information only and written nowhere, so it is never in the set.
 */
function unreadColumns(sin: ConvertSheetInput, cols: Cols, specs: ReturnType<typeof specsOf>): string[] {
  const used = new Set<number>();
  const use = (s: { index: number } | undefined): void => void (s && used.add(s.index));
  for (const s of [specs.lat, specs.lon, specs.when, specs.time, specs.station, specs.cruise, specs.sampleId]) use(s);
  if (sin.shape === 'wide') for (const c of cols.taxonHeaders) use(c);
  else for (const s of [cols.taxonCell, cols.quantity, cols.lifeStage, cols.qualifier, cols.occurrenceId, cols.taxonId]) use(s);
  for (const v of cols.variables) use(v);
  if (cols.depthMin && cols.depthMax) {
    use(cols.depthMin);
    use(cols.depthMax);
  } else use(cols.depthPlain ?? cols.depthMin ?? cols.depthMax);
  if (sin.quantity?.effort?.source === 'column') use(cols.effort);
  return sin.mapping.columns.filter((c) => c.role.kind !== 'ignore' && !used.has(c.index)).map((c) => c.header.trim());
}

/** Every filled cell of the column is a positive whole number, and there is at least one. */
function looksLikeAphiaIds(sheet: RawSheet, index: number): boolean {
  let n = 0;
  for (const row of sheet.rows) {
    const t = text(row.cells[index]);
    if (t === undefined) continue;
    if (!/^[1-9]\d*$/.test(t)) return false;
    n++;
  }
  return n > 0;
}

/**
 * The text of a number cell to write, when the value came from this ONE cell: a plain decimal number (an optional sign, digits, an optional point and digits;
 * no exponent, no thousands mark), with the decimal comma turned into a point and nothing else tidied but this: a leading plus sign is dropped, leading zeros
 * before the integer part are dropped (007.5 is 7.5; 0.5 stays), a missing integer part is a 0 (.5 is 0.5) and a bare trailing point is dropped (5. is 5).
 * Every digit after the point is kept (54.10 stays 54.10). Undefined otherwise (degrees and minutes, a flipped depth sign, a number written another way):
 * the caller then writes the parsed value with the precision the reader counted.
 */
export function sourceNumberText(raw: RawCell | undefined, decimalComma: boolean, value: number | undefined): string | undefined {
  if (value === undefined || raw === null || raw === undefined) return undefined;
  if (typeof raw === 'number') return raw === value && !/e/i.test(String(raw)) ? String(raw) : undefined;
  const t = raw.trim();
  const out = decimalComma ? t.replace(',', '.') : t;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(out)) return undefined;
  const negative = out.startsWith('-');
  const [intPart, fraction = ''] = out.replace(/^[+-]/, '').split('.');
  const whole = intPart.replace(/^0+(?=\d)/, '') || '0';
  const tidy = `${whole}${fraction === '' ? '' : `.${fraction}`}`;
  const signed = negative && Number(tidy) !== 0 ? `-${tidy}` : tidy;
  return Number(signed) === value ? signed : undefined;
}

/** A WoRMS entry the page sent that may be written: a positive whole AphiaID and, when it carries a name, a name that is one line of text (the worker does not trust the page). */
const validEntry = (e: { aphiaId: number; scientificName?: string }): boolean => Number.isSafeInteger(e.aphiaId) && e.aphiaId >= 1 && (e.scientificName === undefined || isWritableName(e.scientificName));

/** The taxon names of every sheet, as the page lists them for approval (distinct, first-seen order). */
export function listSplits(input: Pick<ConvertInput, 'sheets' | 'approvedSplits'>): SplitEntry[] {
  const names: string[] = [];
  for (const s of input.sheets) {
    const sheet = s.file.sheets.find((x) => x.name === s.sheet);
    if (!sheet) continue;
    const cols = colsOf(s.mapping);
    if (s.shape === 'wide') {
      for (const c of cols.taxonHeaders) names.push(c.header.trim());
    } else if (cols.taxonCell) {
      for (const row of sheet.rows) {
        const t = text(row.cells[cols.taxonCell.index]);
        if (t !== undefined) names.push(t);
      }
    }
  }
  return distinctSplits(names, input.approvedSplits);
}

/* ---------- the conversion ---------- */

export function convert(input: ConvertInput): ConvertResult {
  const opts = input.options ?? {};
  const fullList = opts.fullList === true;
  const findings: Finding[] = [];
  const occurrences: OccRec[] = [];
  const measurements: MofIntent[] = [];
  const samples = new Map<string, SampleAcc>();
  const dups = new Map<string, Places>(); // repeated eventIDs
  const firstOcc = new Map<string, { file: string; sheet: string; line: number }>();
  const repeatedOcc = new Map<string, Places>(); // repeated occurrenceIDs
  // where each occurrence stands, for the findings about one taxon written twice in a sample: the column (wide) or the line (long)
  const refOf = new Map<OccRec, string>();
  const stats = { zerosSkipped: 0, textCells: 0, present: 0, absent: 0 };
  // measured variables: the columns written, and the identifiers that were written for them (never a name or a label)
  const nercStats = { columns: 0, typeIds: 0, unitIds: 0, nvsIds: 0 };
  let sheetKeyN = 0;

  const splits = listSplits(input);
  const undecided = splits.filter((s) => s.needsDecision && !s.approved);
  if (undecided.length > 0) {
    const first = input.sheets[0];
    findings.push(
      makeConvertFinding('CONV-SPLIT-UNDECIDED', {
        file: first?.file.fileName ?? '',
        sheet: first?.sheet ?? '',
        value: undecided[0].verbatim,
        params: { count: undecided.length },
      }),
    );
  }
  const splitOf = (verbatim: string): TaxonSplit => approvedSplit(input.approvedSplits, verbatim) ?? splitTaxon(verbatim);

  for (const sin of input.sheets) {
    const file = sin.file;
    const sheet: RawSheet | undefined = file.sheets.find((x) => x.name === sin.sheet);
    if (!sheet) continue;
    const fileName = file.fileName;
    const sheetKey = `${fileName}\u0000${sheet.name}\u0000${sheetKeyN++}`;
    const dc = file.decimalComma;
    const cols = colsOf(sin.mapping);
    const collector = new Collector(fileName);
    const specs = specsOf(sin.mapping);
    const parse = metaParser(file, sheet, specs, collector);
    const base = { file: fileName, sheet: sheet.name };

    const missingTaxon = sin.shape === 'wide' ? cols.taxonHeaders.length === 0 : cols.taxonCell === undefined || cols.quantity === undefined;
    if (missingTaxon) findings.push(makeConvertFinding('CONV-NO-TAXON', { ...base, params: { shape: sin.shape } }));

    // quantity declaration
    const resolution = resolveQuantity(sin.quantity, { decimalComma: dc, ...(cols.effort?.unit === undefined ? {} : { columnEffortUnit: cols.effort.unit }) });
    let quantity: ResolvedQuantity | undefined;
    let missing: string[] = resolution.ok ? [] : [...resolution.missing];
    if (resolution.ok) quantity = resolution.quantity;
    if (sin.quantity?.effort?.source === 'column' && cols.effort === undefined) {
      missing = [...missing, 'effort column'];
      quantity = undefined;
    }
    if (!quantity || missing.length > 0) {
      if (missing.length === 0) missing = ['kind'];
      findings.push(makeConvertFinding('CONV-QUANTITY-UNDECLARED', { ...base, params: { missing: missing.join(', ') } }));
      quantity = undefined;
    } else {
      if (quantity.effortInvalid !== undefined) findings.push(makeConvertFinding('CONV-EFFORT-VALUE-INVALID', { ...base, value: quantity.effortInvalid.text, params: { reason: quantity.effortInvalid.reason } }));
      if (quantity.noTypeFor !== undefined) findings.push(makeConvertFinding('CONV-NERC-UNKNOWN', { ...base, params: { what: quantity.noTypeFor } }));
      if (quantity.unitWithoutP06 !== undefined) findings.push(makeConvertFinding('CONV-UNIT-NO-P06', { ...base, params: { unit: quantity.unitWithoutP06 } }));
      if (quantity.effort && !quantity.effort.unitId) findings.push(makeConvertFinding('CONV-UNIT-NO-P06', { ...base, params: { unit: quantity.effort.unit } }));
    }
    const kind = quantity?.kind;

    // depth columns: units must be metres
    for (const d of [cols.depthMin, cols.depthMax, cols.depthPlain]) {
      if (d?.unit !== undefined && !METRES.test(d.unit.trim())) findings.push(makeConvertFinding('CONV-DEPTH-UNIT', { ...base, field: d.header, params: { unit: d.unit } }));
    }

    const tabs = new Lines();
    const noCode = new Lines();
    const texts = new Lines();
    const negatives = new Lines();
    const notInteger = new Lines();
    const effortBad = new Lines();
    const summaries = new Lines();
    let zeros = 0;
    const checkText = (field: string, line: number, value: string | undefined): void => {
      if (value !== undefined && hasTabOrNewline(value)) tabs.add(fileName, sheet.name, field, line, shownText(value));
    };
    // a header with a tab or line break (wide taxon headers)
    for (const c of cols.taxonHeaders) checkText(c.header, sheet.headerLine, c.header.trim());

    // the sampling device and the mesh size of the sheet, written as eMoF rows on every sample (BioCheck warns when no instrument is present)
    let device: { label: string; uri?: string } | undefined;
    if (sin.device?.kind === 'known') device = { label: DEVICES[sin.device.key].label, uri: DEVICES[sin.device.key].uri };
    else if (sin.device?.kind === 'other' && sin.device.text.trim() !== '') {
      device = { label: sin.device.text.trim() };
      checkText('sampling device', sheet.headerLine, device.label);
    }
    let mesh: string | undefined;
    if (sin.meshUm !== undefined && sin.meshUm.trim() !== '') {
      const p = parseTypedNumber(sin.meshUm);
      if (p.ok) mesh = p.text;
      else findings.push(makeConvertFinding('CONV-MESH-INVALID', { ...base, value: sin.meshUm.trim(), params: { reason: p.reason } }));
    }

    // the measured-variable columns (stage 5): the identifiers the user confirmed for each, checked here (not believed because the page sent them). A unit identifier
    // counts only for a column that has a unit text. What is written into the file is checked for tabs and line breaks like every other text.
    const varState = cols.variables.map((v) => {
      const d = readDecision(sin.nerc, v.index);
      checkText(v.header, sheet.headerLine, v.name);
      checkText(v.header, sheet.headerLine, v.unit);
      return { v, type: d.type, unit: v.unit === undefined ? undefined : d.unit, written: false };
    });

    const depthOf = (row: RawRow): { min?: number; max?: number; decimals?: number; minText?: string; maxText?: string } => {
      const read = (d: NonNullable<Cols['depthMin']>): { v: number; decimals: number; text?: string } | undefined => {
        const cell = row.cells[d.index] ?? null;
        if (isBlankCell(cell)) return undefined;
        const p = parseNumber(cell, dc);
        if (p.status === 'ok') {
          const v = d.positive === 'up' ? (p.value === 0 ? 0 : -p.value) : p.value;
          const text = sourceNumberText(cell, dc, v);
          return { v, decimals: p.decimals, ...(text === undefined ? {} : { text }) };
        }
        if (p.status === 'non-numeric') collector.add('ROW-NON-NUMERIC', sheet.name, d.header, row.line, p.token);
        else if (p.status === 'na-variant') collector.add('ROW-NA-VARIANT', sheet.name, d.header, row.line, p.token);
        return undefined;
      };
      if (cols.depthMin && cols.depthMax) {
        const lo = read(cols.depthMin);
        const hi = read(cols.depthMax);
        const decimals = Math.max(lo?.decimals ?? 0, hi?.decimals ?? 0);
        return { ...(lo ? { min: lo.v } : {}), ...(hi ? { max: hi.v } : {}), ...(lo || hi ? { decimals } : {}), ...(lo?.text === undefined ? {} : { minText: lo.text }), ...(hi?.text === undefined ? {} : { maxText: hi.text }) };
      }
      // one depth column (even one called a bound): min = max
      const only = cols.depthPlain ?? cols.depthMin ?? cols.depthMax;
      const one = only ? read(only) : undefined;
      return one ? { min: one.v, max: one.v, decimals: one.decimals, ...(one.text === undefined ? {} : { minText: one.text, maxText: one.text }) } : {};
    };

    const effortOf = (row: RawRow): string | undefined => {
      const e = quantity?.effort;
      if (!e) return undefined;
      if (e.constant) return e.constant.text;
      const eff = cols.effort;
      if (!eff) return undefined;
      const raw = row.cells[eff.index] ?? null;
      const p = parseNumber(raw, dc);
      if (p.status === 'ok') {
        if (p.value < 0) {
          negatives.add(fileName, sheet.name, eff.header, row.line, String(raw).trim());
          return undefined;
        }
        if (p.value === 0) {
          effortBad.add(fileName, sheet.name, eff.header, row.line, '0');
          return undefined;
        }
        return valueText(raw, dc);
      }
      effortBad.add(fileName, sheet.name, eff.header, row.line, text(raw) ?? '(empty)');
      return undefined;
    };

    for (const row of sheet.rows) {
      const m = parse(row);
      const code = m.sampleId;
      const stationText = m.station;
      const wideHasValue = cols.taxonHeaders.some((c) => !isBlankCell(row.cells[c.index] ?? null));
      const taxonCellText = cols.taxonCell ? text(row.cells[cols.taxonCell.index]) : undefined;
      // long: a row is a record when it has a taxon and a value (an empty value is "no record"); wide: a row with any species cell or a sample code
      const longHasValue = cols.quantity ? !isBlankCell(row.cells[cols.quantity.index] ?? null) : false;
      const relevant = sin.shape === 'wide' ? wideHasValue || code !== undefined : taxonCellText !== undefined && longHasValue;
      // conservative: only the exact word as the WHOLE sample or station cell ("Total Bay" is a station)
      const summaryLabel = [code, stationText].find((v) => v !== undefined && SUMMARY_LABEL.test(v));
      if (summaryLabel !== undefined) {
        summaries.add(fileName, sheet.name, 'sample', row.line, summaryLabel);
        continue;
      }
      if (!relevant) continue;
      if (code === undefined) {
        noCode.add(fileName, sheet.name, cols.sampleId?.header ?? '', row.line);
        continue;
      }
      const cruiseText = m.cruise ?? sin.cruise?.trim();
      const cruise = cruiseText === '' ? undefined : cruiseText;
      if (specs.sampleId) checkText(specs.sampleId.header, row.line, code);
      if (specs.station && stationText !== undefined) checkText(specs.station.header, row.line, stationText);
      if (specs.cruise && m.cruise !== undefined) checkText(specs.cruise.header, row.line, m.cruise);

      const stationId = stationText === undefined ? undefined : stationEventId(cruise, stationText);
      const eventId = opts.prefixStation === true && stationId !== undefined ? stationPrefixedId(stationId, code) : code;
      const depth = depthOf(row);
      const effort = effortOf(row);
      const date = m.datetime;
      const dateText = date === undefined ? undefined : eventDateText(date);
      const source: SourceRef = { file: fileName, sheet: sheet.name, line: row.line };

      const earlier = samples.get(eventId);
      let acc: SampleAcc;
      if (earlier) {
        const mergeable = sin.shape === 'long' && earlier.shape === 'long' && earlier.sheetKey === sheetKey && earlier.station === stationText;
        if (!mergeable) {
          // the same eventID from another row of a wide sheet, another sheet, or another station (long): never merged
          let d = dups.get(eventId);
          if (!d) {
            dups.set(eventId, (d = new Map()));
            for (const l of earlier.lines) addPlace(d, earlier.source.file, earlier.source.sheet, l);
          }
          addPlace(d, fileName, sheet.name, row.line);
          continue;
        }
        acc = earlier;
        acc.lines.push(row.line);
        const differs = (what: string): void => void acc.conflicts.add(what);
        if (acc.dateText !== dateText) differs('date');
        if (!sameNumber(acc.site.lat, m.lat) || !sameNumber(acc.site.lon, m.lon)) differs('position');
        if (!sameNumber(acc.site.depthMin, depth.min) || !sameNumber(acc.site.depthMax, depth.max)) differs('depth');
        if (acc.effortText !== effort) differs('sample size');
      } else {
        const site: SampleSite = { id: eventId, code, source };
        if (stationText !== undefined) site.stationCode = stationText;
        if (cruise !== undefined) site.cruiseCode = cruise;
        if (date) site.date = date;
        if (m.lat !== undefined && m.lon !== undefined) {
          site.lat = m.lat;
          site.lon = m.lon;
          if (m.latDecimals !== undefined) site.latDecimals = m.latDecimals;
          if (m.lonDecimals !== undefined) site.lonDecimals = m.lonDecimals;
          const latText = specs.lat ? sourceNumberText(row.cells[specs.lat.index], dc, m.lat) : undefined;
          const lonText = specs.lon ? sourceNumberText(row.cells[specs.lon.index], dc, m.lon) : undefined;
          if (latText !== undefined) site.latText = latText;
          if (lonText !== undefined) site.lonText = lonText;
        }
        if (depth.min !== undefined) site.depthMin = depth.min;
        if (depth.max !== undefined) site.depthMax = depth.max;
        if (depth.decimals !== undefined) site.depthDecimals = depth.decimals;
        if (depth.minText !== undefined) site.depthMinText = depth.minText;
        if (depth.maxText !== undefined) site.depthMaxText = depth.maxText;
        if (effort !== undefined && quantity?.effort) {
          site.sampleSizeValue = effort;
          site.sampleSizeUnit = quantity.effort.unit;
        }
        acc = {
          site,
          sheetKey,
          shape: sin.shape,
          lines: [row.line],
          conflicts: new Set(),
          source,
          effortWritten: false,
          deviceWritten: false,
          varValues: new Map(),
          ...(stationText === undefined ? {} : { station: stationText }),
          ...(dateText === undefined ? {} : { dateText }),
          ...(effort === undefined ? {} : { effortText: effort }),
        };
        samples.set(eventId, acc);
      }
      if (!acc.deviceWritten) {
        acc.deviceWritten = true;
        if (device) {
          measurements.push({
            target: { kind: 'event', id: eventId },
            role: 'device',
            measurementType: P01.instrument.label,
            measurementTypeId: P01.instrument.uri,
            measurementValue: device.label,
            ...(device.uri === undefined ? {} : { measurementValueId: device.uri }),
            source,
          });
        }
        if (mesh !== undefined) {
          measurements.push({
            target: { kind: 'event', id: eventId },
            role: 'mesh',
            measurementType: P01.meshSize.label,
            measurementTypeId: P01.meshSize.uri,
            measurementValue: mesh,
            measurementUnit: 'um',
            measurementUnitId: P06.um.uri,
            source,
          });
        }
      }
      if (acc.site.sampleSizeValue !== undefined && !acc.effortWritten && quantity?.effort) {
        acc.effortWritten = true;
        const e = quantity.effort;
        measurements.push({
          target: { kind: 'event', id: eventId },
          role: 'effort',
          measurementType: e.type.label,
          measurementTypeId: e.type.uri,
          measurementValue: acc.site.sampleSizeValue,
          measurementUnit: e.unit,
          ...(e.unitId ? { measurementUnitId: e.unitId.uri } : {}),
          source,
        });
      }

      // the measured variables of this row's sample: one eMoF row per column and sample event, on the SAMPLE event (eventID set, no occurrenceID). A text cell, an
      // empty cell and an NA write nothing (text and NA variants are reported like any number cell); a unit is written as given, never converted.
      for (const st of varState) {
        const v = st.v;
        const cell = row.cells[v.index] ?? null;
        const p = parseNumber(cell, dc);
        if (p.status === 'missing') continue;
        if (p.status === 'na-variant') {
          collector.add('ROW-NA-VARIANT', sheet.name, v.header, row.line, p.token);
          continue;
        }
        if (p.status === 'non-numeric') {
          collector.add('ROW-NON-NUMERIC', sheet.name, v.header, row.line, p.token);
          continue;
        }
        const written = valueText(cell, dc);
        const before = acc.varValues.get(v.index);
        if (before !== undefined) {
          // a long sheet repeats the sample on every row: the same value is the same measurement, another value is two values for one sample
          if (before !== written) acc.conflicts.add('measured value');
          continue;
        }
        acc.varValues.set(v.index, written);
        st.written = true;
        measurements.push({
          target: { kind: 'event', id: eventId },
          role: 'variable',
          measurementType: v.name,
          ...(st.type ? { measurementTypeId: st.type.id } : {}),
          measurementValue: written,
          ...(v.unit === undefined ? {} : { measurementUnit: v.unit }),
          ...(st.unit ? { measurementUnitId: st.unit.id } : {}),
          source: { ...source, column: v.header },
        });
      }

      /* ---- the occurrences of this row ---- */
      const cells: { verbatim: string; raw: unknown; column: string; userId?: string; lifeStageCol?: string; qualifierCol?: string; nameId?: string }[] = [];
      if (sin.shape === 'wide') {
        for (const c of cols.taxonHeaders) cells.push({ verbatim: c.header.trim(), raw: row.cells[c.index] ?? null, column: c.header.trim() });
      } else if (cols.taxonCell && cols.quantity && taxonCellText !== undefined) {
        const lifeStageCol = cols.lifeStage ? text(row.cells[cols.lifeStage.index]) : undefined;
        const qualifierCol = cols.qualifier ? text(row.cells[cols.qualifier.index]) : undefined;
        const userId = cols.occurrenceId ? text(row.cells[cols.occurrenceId.index]) : undefined;
        const idText = cols.taxonId ? text(row.cells[cols.taxonId.index]) : undefined;
        // the taxon ID of the sheet, never looked up: an AphiaID column (whole numbers only) as the urn:lsid, any other taxon ID column as given
        const nameId = idText === undefined || cols.taxonId === undefined ? undefined : sheetNameId(cols.taxonId, idText);
        if (cols.taxonId) checkText(cols.taxonId.header, row.line, idText);
        if (cols.taxonCell) checkText(cols.taxonCell.header, row.line, taxonCellText);
        if (cols.lifeStage) checkText(cols.lifeStage.header, row.line, lifeStageCol);
        if (cols.qualifier) checkText(cols.qualifier.header, row.line, qualifierCol);
        if (cols.occurrenceId) checkText(cols.occurrenceId.header, row.line, userId);
        cells.push({
          verbatim: taxonCellText,
          raw: row.cells[cols.quantity.index] ?? null,
          column: cols.taxonCell.header,
          ...(userId === undefined ? {} : { userId }),
          ...(nameId === undefined ? {} : { nameId }),
          ...(lifeStageCol === undefined ? {} : { lifeStageCol }),
          ...(qualifierCol === undefined ? {} : { qualifierCol }),
        });
      }
      for (const cell of cells) {
        const raw = cell.raw as string | number | null;
        const p = parseNumber(raw, dc);
        const field = sin.shape === 'wide' ? cell.column : (cols.quantity?.header ?? cell.column);
        let status: 'present' | 'absent' = 'present';
        let value: number | undefined;
        let remarks: string | undefined;
        if (p.status === 'missing') continue;
        if (p.status === 'na-variant') {
          collector.add('ROW-NA-VARIANT', sheet.name, field, row.line, p.token);
          continue;
        }
        if (p.status === 'non-numeric') {
          texts.add(fileName, sheet.name, field, row.line, p.token);
          checkText(field, row.line, p.token);
          remarks = p.token;
          stats.textCells++;
        } else {
          value = p.value;
          if (value < 0) {
            negatives.add(fileName, sheet.name, field, row.line, String(raw).trim());
            continue;
          }
          if (value === 0) {
            if (!fullList) {
              zeros++;
              continue;
            }
            status = 'absent';
          } else if (kind === 'count' && !Number.isInteger(value)) {
            notInteger.add(fileName, sheet.name, field, row.line, String(raw).trim());
            continue;
          }
        }
        const sp = splitOf(cell.verbatim);
        const lifeStage = cell.lifeStageCol ?? sp.lifeStage;
        const qualifier = cell.qualifierCol ?? sp.identificationQualifier;
        // what the user typed into an approved split is written too: a tab or line break there would break the tab-separated file
        checkText(cell.column, row.line, sp.scientificName);
        checkText(cell.column, row.line, sp.identificationQualifier);
        checkText(cell.column, row.line, sp.lifeStage);
        const id = sin.shape === 'wide' ? occurrenceIdWide(eventId, cell.verbatim) : (cell.userId ?? occurrenceIdLong(eventId, cell.verbatim, cell.lifeStageCol));
        const occSource: SourceRef = { ...source, column: cell.column };
        const occ: OccRec = {
          id,
          eventId,
          verbatimIdentification: cell.verbatim,
          scientificName: sp.scientificName,
          occurrenceStatus: status,
          source: occSource,
          ...(qualifier === undefined ? {} : { identificationQualifier: qualifier }),
          ...(lifeStage === undefined ? {} : { lifeStage }),
          ...(cell.nameId === undefined ? {} : { scientificNameId: cell.nameId }),
          ...(sp.sex === undefined ? {} : { sex: sp.sex }),
          ...(remarks === undefined ? {} : { occurrenceRemarks: remarks }),
        };
        if (cols.quantityType && sin.shape === 'long') {
          const qt = text(row.cells[cols.quantityType.index]);
          if (qt !== undefined) occ.sourceQuantityType = qt;
        }
        if (value !== undefined) occ.quantityText = valueText(raw, dc);
        if (kind === 'count' && value !== undefined) {
          occ.individualCount = value;
          if (status === 'present') {
            occ.organismQuantity = value;
            occ.organismQuantityType = 'individuals';
          }
        }
        // measurements: absent records have none; a text cell has no number
        if (status === 'present' && value !== undefined && quantity) {
          const t = quantity.type;
          measurements.push({
            target: { kind: 'occurrence', id },
            role: quantity.kind,
            measurementType: t?.label ?? '',
            ...(t || quantity.noTypeFor === undefined ? {} : { measurementTypeFallback: quantity.noTypeFor.charAt(0).toUpperCase() + quantity.noTypeFor.slice(1) }),
            ...(t ? { measurementTypeId: t.uri } : {}),
            measurementValue: quantity.kind === 'count' ? String(value) : valueText(raw, dc),
            ...(quantity.kind === 'count' ? {} : { measurementUnit: quantity.unit ?? '' }),
            ...(quantity.unitId ? { measurementUnitId: quantity.unitId.uri } : {}),
            source: occSource,
          });
        }
        occurrences.push(occ);
        if (status === 'present') stats.present++;
        else stats.absent++;

        // identifiers: one occurrenceID once, whoever repeats it
        const first = firstOcc.get(id);
        if (first) {
          let d = repeatedOcc.get(id);
          if (!d) {
            repeatedOcc.set(id, (d = new Map()));
            addPlace(d, first.file, first.sheet, first.line);
          }
          addPlace(d, fileName, sheet.name, row.line);
        } else firstOcc.set(id, { file: fileName, sheet: sheet.name, line: row.line });
        refOf.set(occ, sin.shape === 'wide' ? cell.column : `line ${row.line}`);
      }
    }

    // the variables written on this sheet: those without a confirmed identifier are said (warnings to accept), and the identifiers that were written are counted
    const noType: string[] = [];
    const noUnit: string[] = [];
    for (const st of varState) {
      if (!st.written) continue;
      nercStats.columns++;
      if (st.type) {
        nercStats.typeIds++;
        if (st.type.source === 'nvs') nercStats.nvsIds++;
      } else if (!noType.includes(st.v.name)) noType.push(st.v.name);
      if (st.unit) {
        nercStats.unitIds++;
        if (st.unit.source === 'nvs') nercStats.nvsIds++;
      } else if (st.v.unit !== undefined && !noUnit.includes(st.v.unit)) noUnit.push(st.v.unit);
    }
    if (noType.length > 0) findings.push(makeConvertFinding('CONV-NERC-UNKNOWN', { ...base, params: { what: noType.join(', ') } }));
    // a confirmed concept whose label says "per unit mass" (or volume) for a column whose unit is per volume (or mass): said once per column, the pair is the user's
    for (const st of varState) {
      if (!st.written || !st.type || st.v.unit === undefined) continue;
      if (unitContradictsConcept(pickLabel(st.type), st.v.unit)) {
        findings.push(makeConvertFinding('CONV-NERC-UNIT-MISMATCH', { ...base, field: st.v.header, params: { column: st.v.header.trim(), code: st.type.id.split('/')[6], unit: st.v.unit } }));
      }
    }
    for (const unit of noUnit) findings.push(makeConvertFinding('CONV-UNIT-NO-P06', { ...base, params: { unit } }));

    // sample-level conflicts of long sheets
    for (const a of samples.values()) {
      if (a.sheetKey !== sheetKey || a.conflicts.size === 0) continue;
      findings.push(makeConvertFinding('CONV-SAMPLE-CONFLICT', { ...base, value: a.site.code, lines: a.lines, params: { what: [...a.conflicts].join(', '), count: 1 } }));
    }
    if (noCode.size > 0) {
      for (const e of noCode.entries()) findings.push(makeConvertFinding('CONV-SAMPLE-CODE-MISSING', { file: e.file, sheet: e.sheet, lines: e.lines, params: { count: e.lines.length, column: e.field === '' ? 'none' : e.field } }));
    }
    for (const e of tabs.entries()) findings.push(makeConvertFinding('CONV-TAB-IN-VALUE', { file: e.file, sheet: e.sheet, field: e.field, lines: e.lines, value: e.examples[0] ?? '', params: { count: e.lines.length } }));
    for (const e of texts.entries()) findings.push(makeConvertFinding('CONV-TEXT-IN-TAXON-CELL', { file: e.file, sheet: e.sheet, field: e.field, lines: e.lines, value: e.examples.join(', '), params: { count: e.lines.length } }));
    for (const e of negatives.entries()) findings.push(makeConvertFinding('CONV-NEGATIVE-QUANTITY', { file: e.file, sheet: e.sheet, field: e.field, lines: e.lines, value: e.examples[0] ?? '', params: { count: e.lines.length } }));
    for (const e of notInteger.entries()) findings.push(makeConvertFinding('CONV-COUNT-NOT-INTEGER', { file: e.file, sheet: e.sheet, field: e.field, lines: e.lines, value: e.examples[0] ?? '', params: { count: e.lines.length } }));
    for (const e of effortBad.entries()) findings.push(makeConvertFinding('CONV-EFFORT-INVALID', { file: e.file, sheet: e.sheet, field: e.field, lines: e.lines, value: e.examples[0] ?? '', params: { count: e.lines.length } }));
    for (const e of summaries.entries()) findings.push(makeConvertFinding('CONV-SUMMARY-ROW-SKIPPED', { file: e.file, sheet: e.sheet, lines: e.lines, value: e.examples.join(', '), params: { count: e.lines.length } }));
    if (zeros > 0) {
      stats.zerosSkipped += zeros;
      findings.push(makeConvertFinding('CONV-ZERO-SKIPPED', { ...base, params: { count: zeros } }));
    }
    if (!device && [...samples.values()].some((a) => a.sheetKey === sheetKey)) findings.push(makeConvertFinding('CONV-DEVICE-MISSING', { ...base }));
    // every column the user gave a meaning that this conversion does not read, in this configuration, is said and has to be accepted: nothing is dropped silently
    const unexported = unreadColumns(sin, cols, specs);
    if (unexported.length > 0) {
      findings.push(makeConvertFinding('CONV-COLUMN-NOT-EXPORTED', { ...base, params: { count: unexported.length, columns: unexported.join(', ') } }));
    }
    // a taxon ID chosen by hand on bare whole numbers under a header that is not an AphiaID header: written as given, and said
    if (cols.taxonId && !cols.taxonId.aphia && sin.shape === 'long' && looksLikeAphiaIds(sheet, cols.taxonId.index)) {
      findings.push(makeConvertFinding('CONV-NAMEID-APHIA-LIKE', { ...base, field: cols.taxonId.header, params: { column: cols.taxonId.header.trim() } }));
    }
    findings.push(...collector.findings());
  }

  /* ---- identifiers across the whole archive ---- */
  const tree = buildEventTree(
    [...samples.values()].map((a) => a.site),
    opts.flatten ? { flatten: opts.flatten } : {},
  );
  const events: EventRec[] = tree.events;
  // a sample code equal to a station or cruise eventID is the same eventID twice
  const kindOf = new Map<string, number>();
  for (const e of events) kindOf.set(e.id, (kindOf.get(e.id) ?? 0) + 1);
  for (const [id, n] of kindOf) {
    if (n < 2 || dups.has(id)) continue;
    const a = samples.get(id);
    const d: Places = new Map();
    if (a) for (const l of a.lines) addPlace(d, a.source.file, a.source.sheet, l);
    dups.set(id, d);
  }
  for (const [id, places] of dups) {
    for (const w of places.values()) {
      findings.push(
        makeConvertFinding('CONV-ID-DUPLICATE', {
          file: w.file,
          sheet: w.sheet,
          value: id,
          lines: [...w.lines],
          params: { kind: 'event', count: 1, hint: 'Make the sample codes unique, or prefix the station eventID.' },
        }),
      );
    }
  }
  if (repeatedOcc.size > 0) {
    // one finding per file and sheet: the repeated IDs that stand there and the lines of each, whichever file the other copy is in
    const byWhere = new Map<string, { file: string; sheet: string; ids: string[]; lines: number[] }>();
    for (const [id, places] of repeatedOcc) {
      for (const [k, p] of places) {
        let w = byWhere.get(k);
        if (!w) byWhere.set(k, (w = { file: p.file, sheet: p.sheet, ids: [], lines: [] }));
        w.ids.push(id);
        for (const l of p.lines) w.lines.push(l);
      }
    }
    for (const w of byWhere.values()) {
      findings.push(
        makeConvertFinding('CONV-ID-DUPLICATE', {
          file: w.file,
          sheet: w.sheet,
          value: w.ids[0],
          lines: w.lines,
          params: { kind: 'occurrence', count: w.ids.length, hint: 'Two columns with the same header, or rows of one sample with the same taxon: rename one, or give the rows an occurrenceID or life stage column.' },
        }),
      );
    }
  }

  /* ---- the WoRMS opt-in (stage 4): which names would be sent, and what the lookup that was made says ---- */
  const undecidedVerbatim = new Set(undecided.map((u) => u.verbatim));
  // The IDs the sheet gives each name, over ALL rows of every long sheet: a row with a zero count that is left out unless the list is declared full, a row
  // whose split is not approved yet (its proposed split names it) and any other row the conversion skips all count. "A name with a sheet ID on any row is never
  // sent" is therefore true of the sheet, not of what was written.
  const sheetIds = new Map<string, Set<string>>();
  for (const sin of input.sheets) {
    const sheet = sin.file.sheets.find((x) => x.name === sin.sheet);
    if (!sheet || sin.shape !== 'long') continue;
    const cols = colsOf(sin.mapping);
    if (!cols.taxonCell || !cols.taxonId) continue;
    for (const row of sheet.rows) {
      const verbatim = text(row.cells[cols.taxonCell.index]);
      const idText = text(row.cells[cols.taxonId.index]);
      if (verbatim === undefined || idText === undefined) continue;
      const id = sheetNameId(cols.taxonId, idText);
      if (id === undefined) continue;
      // under the name the row is written with: the approved split (which the user may have edited) or, while it is not approved, the proposed one.
      // Not also under the proposed name of an approved, edited split: that would keep an unrelated plain name out of the lookup.
      const name = splitOf(verbatim).scientificName;
      let ids = sheetIds.get(name);
      if (!ids) sheetIds.set(name, (ids = new Set()));
      ids.add(id);
    }
  }
  // per scientificName: how many written rows have a taxon ID from the sheet and how many have none. A name whose split is not approved yet is not final:
  // its rows are neither sent nor looked at (but its IDs are in sheetIds above, under the proposed name).
  const perName = new Map<string, { withId: number; without: number }>();
  for (const o of occurrences) {
    if (undecidedVerbatim.has(o.verbatimIdentification)) continue;
    let n = perName.get(o.scientificName);
    if (!n) perName.set(o.scientificName, (n = { withId: 0, without: 0 }));
    if (o.scientificNameId !== undefined) n.withId++;
    else n.without++;
  }
  // a name that has a sheet ID on ANY row is never sent and gets no WoRMS ID on its other rows: only a name with no sheet ID anywhere is looked up
  const toLookUp = new Set<string>();
  const incomplete: string[] = [];
  const conflicting: string[] = [];
  let withSheetId = 0;
  for (const [name, n] of perName) {
    const ids = sheetIds.get(name);
    // (a written row with a sheet ID counts as well: belt and braces for any way a row is named differently from the pre-pass)
    if (ids !== undefined || n.withId > 0) {
      withSheetId++;
      if (n.without > 0) incomplete.push(name);
    } else if (n.without > 0) toLookUp.add(name);
  }
  for (const [name, ids] of sheetIds) if (ids.size > 1 && perName.has(name)) conflicting.push(name);
  const whereName = { file: input.sheets[0]?.file.fileName ?? '', sheet: input.sheets[0]?.sheet ?? '' };
  // the names go whole into the params (the text shows the first few, the acceptance tick is for the whole set)
  const wholeList = (names: string[]): string => names.join(', ');
  if (incomplete.length > 0) findings.push(makeConvertFinding('CONV-NAMEID-INCOMPLETE', { ...whereName, value: incomplete[0], params: { count: incomplete.length, names: wholeList(incomplete) } }));
  if (conflicting.length > 0) findings.push(makeConvertFinding('CONV-NAMEID-CONFLICT', { ...whereName, value: conflicting[0], params: { count: conflicting.length, names: wholeList(conflicting) } }));
  const nameLookup = { names: [...toLookUp], withSheetId, applied: 0 };
  if (input.worms !== undefined) {
    const undecidedNames: string[] = [];
    const noMatch: string[] = [];
    const notMarine: string[] = [];
    for (const name of toLookUp) {
      const e = wormsEntry(input.worms, name);
      if (!e) continue;
      // an entry that is not a positive whole AphiaID, or whose own name is not a line of text, is no ID: the name stays undecided (and blocks) instead of writing something else
      if (e.state === 'undecided' || (e.state === 'id' && !validEntry(e))) undecidedNames.push(name);
      else if (e.state === 'none' && e.reason === 'no-match') noMatch.push(name);
      else if (e.state === 'id' && e.notMarine) notMarine.push(name);
    }
    // The ID goes to every occurrence of a looked-up name. scientificName is replaced ONLY when the user chose a result that is not an exact match (the entry carries
    // the chosen record's name): then the written name is the one the LSID belongs to, and verbatimIdentification still holds the sheet's text. The occurrenceID was
    // built from the sheet's text above and does not change. Each occurrence is looked at once, under the name it had before this loop.
    for (const o of occurrences) {
      if (o.scientificNameId !== undefined || !toLookUp.has(o.scientificName) || undecidedVerbatim.has(o.verbatimIdentification)) continue;
      const e = wormsEntry(input.worms, o.scientificName);
      if (e?.state === 'id' && validEntry(e)) {
        o.scientificNameId = wormsLsid(e.aphiaId);
        if (e.scientificName !== undefined) o.scientificName = e.scientificName;
        nameLookup.applied++;
      }
    }
    if (undecidedNames.length > 0) findings.push(makeConvertFinding('CONV-WORMS-UNDECIDED', { ...whereName, value: undecidedNames[0], params: { count: undecidedNames.length, names: wholeList(undecidedNames) } }));
    if (noMatch.length > 0) findings.push(makeConvertFinding('CONV-WORMS-NO-MATCH', { ...whereName, value: noMatch[0], params: { count: noMatch.length, names: wholeList(noMatch) } }));
    if (notMarine.length > 0) findings.push(makeConvertFinding('CONV-WORMS-NOT-MARINE', { ...whereName, value: notMarine[0], params: { count: notMarine.length, names: wholeList(notMarine) } }));
  }

  /*
   * The same taxon more than once in one sample, judged AFTER the lookup, so that two names of the sheet that came to the same taxon are caught: the key is the
   * scientificNameID when there is one (two spellings that resolve to the same AphiaID, "Calanus finmarchicus" and a typo the user resolved to it, share it), else the
   * written name. One rule for both cases (CONV-TAXON-SAME-EVENT); it names the sheet's own spellings, and nothing is ever summed. Only distinct occurrenceIDs
   * count here: the same ID twice is CONV-ID-DUPLICATE.
   */
  const sameTaxon = new Map<string, { file: string; sheet: string; name: string; refs: string[]; ids: Set<string>; lines: number[]; verbatim: string[] }>();
  for (const o of occurrences) {
    const key = JSON.stringify([o.eventId, o.scientificNameId !== undefined ? `id:${o.scientificNameId}` : `name:${o.scientificName}`, o.lifeStage ?? '', o.identificationQualifier ?? '', o.sex ?? '']);
    const g = sameTaxon.get(key);
    const ref = refOf.get(o) ?? `line ${o.source.line}`;
    if (g) {
      g.refs.push(ref);
      g.ids.add(o.id);
      g.lines.push(o.source.line);
      if (!g.verbatim.includes(o.verbatimIdentification)) g.verbatim.push(o.verbatimIdentification);
    } else sameTaxon.set(key, { file: o.source.file, sheet: o.source.sheet, name: o.scientificName, refs: [ref], ids: new Set([o.id]), lines: [o.source.line], verbatim: [o.verbatimIdentification] });
  }
  for (const g of sameTaxon.values()) {
    if (g.ids.size < 2) continue;
    findings.push(
      makeConvertFinding('CONV-TAXON-SAME-EVENT', {
        file: g.file,
        sheet: g.sheet,
        value: g.name,
        lines: g.lines,
        params: { count: g.ids.size, columns: g.refs.join(', '), names: g.verbatim.join(', ') },
      }),
    );
  }

  const blocking = findings.filter((f) => f.severity === 'error');
  return {
    ok: blocking.length === 0,
    findings,
    blocking,
    events,
    occurrences,
    measurements,
    tree: tree.summary,
    splits,
    nameLookup,
    cruiseText: tree.cruiseText,
    stats: { samples: samples.size, occurrences: occurrences.length, present: stats.present, absent: stats.absent, zerosSkipped: stats.zerosSkipped, textCells: stats.textCells, measurements: measurements.length, nerc: nercStats },
  };
}

