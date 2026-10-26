// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { Collector, metaParser, specsOf } from '../dataset';
import type { Spec } from '../dataset';
import { isBlankCell, stripTypeSuffix } from '../recognize/columns';
import { p01CodeOf } from '../recognize/vocab';
import { valueText } from '../output/csv';
import { makeConvertFinding } from '../rules/convert';
import type { Finding, ParsedFile, RawCell, RawRow, RawSheet, SheetMapping } from '../types';
import { parseNumber } from '../values/numbers';
import { pangaeaNamesUsed, taxonColumnNames } from './headers';
import type { TaxonColumnName } from './headers';
import { buildEventTree, eventDateText, greatCircleM, stationEventId } from './events';
import type { SampleSite, TreeOptions } from './events';
import { SUMMARY_LABEL, hasTabOrNewline, occurrenceIdLong, occurrenceIdWide, shownText, stationPrefixedId } from './ids';
import { UNMATCHED_SHOWN } from './model';
import type { ConvertResult, EventRec, MofIntent, OccRec, ProfileSummary, SourceRef } from './model';
import { measurementTypeText, pickLabel, readDecision, unitContradictsConcept, unitPickFor } from './nerc';
import type { NercDecisions, NercPick } from './nerc';
import { parseTypedNumber, resolveQuantity } from './quantity';
import type { QuantityDeclaration, ResolvedQuantity } from './quantity';
import type { ConvertShape } from './recognize';
import { DEVICES, P01, P06, PRESSURE, isDecibar } from './vocab';
import { seafloorMetres, seafloorUnitOf } from './seafloor';
import type { SeafloorDirection, SeafloorUnit } from './seafloor';
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
  /**
   * Stage 6: present = the user marked this sheet "profile / environment of this cruise" (CTD casts, bottle data, environmental stations). Every row of it is then its OWN
   * event under its station (eventType "profile level", min = max depth = the row's depth), and its measured variables and its pressure are eMoF rows of THAT event, never
   * of a sample. `shape`, `quantity`, `device` and `meshUm` mean nothing for such a sheet and are not read.
   */
  profile?: ProfileDeclaration;
}

export interface ProfileDeclaration {
  /**
   * The user's explicit approval (one tick per sheet) of level IDs made of the station's eventID and the depth AS WRITTEN in the sheet (the pressure as written when the sheet
   * has no depth column), for a sheet that has no code column of its own. Without the tick, and without a code column, the sheet's rows block (CONV-SAMPLE-CODE-MISSING).
   * Never derived from the order of the rows.
   */
  depthIds?: boolean;
  /**
   * The user's explicit tick (one per sheet, never automatic): match the stations of this sheet to the biology stations ignoring a trailing cast number ("-6" of "PS27/006-6"), on both
   * sides. Event labels of PANGAEA carry the cast of each device, so a net cast ("PS27/006-6") and a CTD cast ("PS27/006-1") of one station differ only by that suffix. A base that
   * more than one biology station has is not matched (it is never guessed). The level then sits under the biology station; its own ID keeps the cast, so the casts stay apart.
   */
  ignoreCast?: boolean;
  /**
   * The user's explicit tick (one per sheet, never automatic), for a sheet that has NO station column (a file of lat, lon, time, depth and variables): each distinct position is a
   * station. The station's ID is `<cruise>:<latitude>_<longitude>` with the two numbers as written in the sheet (a decimal comma turned into a point, nothing else). A row with no
   * position then has no station (CONV-PROFILE-NO-STATION). Ignored when the sheet has a station column.
   */
  positionStation?: boolean;
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
  /** Stage 6: the FIRST pressure column; read only on a profile sheet (a second one is not read, as a second depth is not). */
  pressure?: Spec & { unit?: string };
  /** The FIRST depth-below-seafloor column (sediment / porewater): written as a distance above the surface in metres, negative below (core/convert/seafloor.ts). */
  seafloor?: Spec & { unit?: string; positive: SeafloorDirection };
  /** Measured-variable columns with a name: each becomes one eMoF row per sample event (stage 5). `name` is the variable as the column's role gives it, `unit` as given. */
  variables: (Spec & { name: string; unit?: string; /** the P01 code the header declares (the role's `p01`), if any */ p01?: string })[];
}

function colsOf(mapping: SheetMapping, header: readonly string[] | undefined): Cols {
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
        // the P01 code a header declares is read from the PARSED FILE's own header here (not from the role, nor from the header text the page sent in the mapping): a declared concept is
        // written only for the code the column's own header holds
        const own = header?.[m.index];
        const declared = own === undefined ? undefined : p01CodeOf(stripTypeSuffix(own))?.code;
        if (name !== '') c.variables.push({ ...spec, name, ...(unit === undefined || unit === '' ? {} : { unit }), ...(declared === undefined ? {} : { p01: declared }) });
        break;
      }
      case 'depthBelowSeafloor':
        c.seafloor ??= { ...spec, positive: r.positive === 'up' ? 'up' : 'down', ...(r.unit === undefined || r.unit.trim() === '' ? {} : { unit: r.unit.trim() }) };
        break;
      case 'pressure':
        c.pressure ??= { ...spec, ...(r.unit === undefined || r.unit.trim() === '' ? {} : { unit: r.unit.trim() }) };
        break;
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

/**
 * PANGAEA writes its Date/Time column in UTC: "Date/Time of sampling/measurement provided in ISO format (YYYY-MM-DDThh:mm:ss) and in UTC. An additional column with
 * local date/time may be provided" (https://wiki.pangaea.de/wiki/Data_submission, section "Data"; and https://wiki.pangaea.de/wiki/Event: "Date/Time is provided as ISO-format
 * YYYY-MM-DD T hh:mm:ss, UTC", read 2026-10-26). So a time with no zone in the column PANGAEA calls "Date/Time" of a PANGAEA file is UTC. A local-time column has another name and is not this.
 */
export const isUtcBySource = (file: ParsedFile, whenHeader: string | undefined): boolean => file.kind === 'pangaea' && whenHeader !== undefined && /^date\/time$/i.test(whenHeader.replace(/\s*\[[^\]]*\]/g, '').trim());

/** The scientificNameID a taxon ID column gives for a cell text: an AphiaID column (whole numbers only) as the urn:lsid, any other taxon ID column as given. */
function sheetNameId(col: Spec & { aphia: boolean }, idText: string): string | undefined {
  return col.aphia ? (/^[1-9]\d*$/.test(idText) ? `urn:lsid:marinespecies.org:taxname:${idText}` : undefined) : idText;
}

const text = (raw: unknown): string | undefined => {
  if (raw === null || raw === undefined) return undefined;
  const t = String(raw).trim();
  return t === '' ? undefined : t;
};

/**
 * The lines of a sheet that the parser found RAGGED (ROW-RAGGED: more or fewer fields than the header). Such a row is not converted: its values are shifted against the header, so any
 * cell read from it could belong to another column. The finding itself stops the export (policy.ts) and names the lines.
 */
function raggedLines(file: ParsedFile, sheet: string): ReadonlySet<number> {
  return new Set(file.findings.filter((f) => f.ruleId === 'ROW-RAGGED' && f.sheet === sheet).flatMap((f) => f.lines ?? []));
}

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
 * A PROFILE sheet (stage 6) reads: latitude, longitude, date, time, station, cruise, the code column, the depth columns, the FIRST pressure column and the measured
 * variables. Everything else with a role (a taxon, quantity, effort, life stage, qualifier or occurrenceID column, a second pressure column) is reported here, so no column of a
 * profile file is dropped silently.
 */
function unreadColumns(sin: ConvertSheetInput, cols: Cols, specs: ReturnType<typeof specsOf>): string[] {
  const used = new Set<number>();
  const use = (s: { index: number } | undefined): void => void (s && used.add(s.index));
  for (const s of [specs.lat, specs.lon, specs.when, specs.time, specs.station, specs.cruise, specs.sampleId]) use(s);
  if (sin.profile !== undefined) use(cols.pressure);
  else if (sin.shape === 'wide') for (const c of cols.taxonHeaders) use(c);
  else for (const s of [cols.taxonCell, cols.quantity, cols.lifeStage, cols.qualifier, cols.occurrenceId, cols.taxonId]) use(s);
  for (const v of cols.variables) use(v);
  use(cols.seafloor);
  if (cols.depthMin && cols.depthMax) {
    use(cols.depthMin);
    use(cols.depthMax);
  } else use(cols.depthPlain ?? cols.depthMin ?? cols.depthMax);
  if (sin.profile === undefined && sin.quantity?.effort?.source === 'column') use(cols.effort);
  return sin.mapping.columns.filter((c) => c.role.kind !== 'ignore' && !used.has(c.index)).map((c) => c.header.trim());
}

/** The depth of a row: one depth column gives min = max, a pair of bound columns gives both. Text that is not a number is reported (ROW-NON-NUMERIC / ROW-NA-VARIANT). */
interface DepthRead {
  min?: number;
  max?: number;
  decimals?: number;
  minText?: string;
  maxText?: string;
}
function depthReader(cols: Cols, dc: boolean, collector: Collector, sheetName: string): (row: RawRow) => DepthRead {
  return (row: RawRow): DepthRead => {
    const read = (d: NonNullable<Cols['depthMin']>): { v: number; decimals: number; text?: string } | undefined => {
      const cell = row.cells[d.index] ?? null;
      if (isBlankCell(cell)) return undefined;
      const p = parseNumber(cell, dc);
      if (p.status === 'ok') {
        const v = d.positive === 'up' ? (p.value === 0 ? 0 : -p.value) : p.value;
        const text = sourceNumberText(cell, dc, v);
        return { v, decimals: p.decimals, ...(text === undefined ? {} : { text }) };
      }
      if (p.status === 'non-numeric') collector.add('ROW-NON-NUMERIC', sheetName, d.header, row.line, p.token);
      else if (p.status === 'na-variant') collector.add('ROW-NA-VARIANT', sheetName, d.header, row.line, p.token);
      return undefined;
    };
    if (cols.depthMin && cols.depthMax) {
      const lo = read(cols.depthMin);
      const hi = read(cols.depthMax);
      const decimals = Math.max(lo?.decimals ?? 0, hi?.decimals ?? 0);
      return { ...(lo ? { min: lo.v } : {}), ...(hi ? { max: hi.v } : {}), ...(lo || hi ? { decimals } : {}), ...(lo?.text === undefined ? {} : { minText: lo.text }), ...(hi?.text === undefined ? {} : { maxText: hi.text }) };
    }
    // one plain depth column: min = max. A sheet with only ONE BOUND (only a top, or only a bottom) writes that end and no other: the other end is never made up
    if (!cols.depthPlain && (cols.depthMin || cols.depthMax)) {
      const isMin = cols.depthMin !== undefined;
      const b = read((isMin ? cols.depthMin : cols.depthMax) as NonNullable<Cols['depthMin']>);
      if (!b) return {};
      return { ...(isMin ? { min: b.v } : { max: b.v }), decimals: b.decimals, ...(b.text === undefined ? {} : isMin ? { minText: b.text } : { maxText: b.text }) };
    }
    const only = cols.depthPlain;
    const one = only ? read(only) : undefined;
    return one ? { min: one.v, max: one.v, decimals: one.decimals, ...(one.text === undefined ? {} : { minText: one.text, maxText: one.text }) } : {};
  };
}

/** The depth below the seafloor of one row: the distance above the surface in metres as text (negative below), and the number as written with its unit (for a level ID). */
interface SeafloorRead {
  /** minimum = maximumDistanceAboveSurfaceInMeters */
  text: string;
  /** the number as written ("0.5") and the unit it was written in */
  plain: string;
  unit: SeafloorUnit;
  value: number;
  direction: SeafloorDirection;
}

/**
 * Reads the depth-below-seafloor column of a sheet (core/convert/seafloor.ts). A unit that is not cm or m (or none) refuses the whole column (CONV-SEAFLOOR-UNIT, nothing is
 * written from it); a number with no exact plain text (an exponent) refuses that cell (CONV-SEAFLOOR-VALUE); text and NA are reported like any number cell. Both signs are written (counted
 * downwards a negative number is a position above the seafloor); a column that has both is said once, with the count and the lines of the minority sign (CONV-SEAFLOOR-SIGNS, not blocking).
 */
function seafloorReader(cols: Cols, dc: boolean, collector: Collector, base: { file: string; sheet: string }): { read: (row: RawRow) => SeafloorRead | undefined; findings: () => Finding[] } {
  const col = cols.seafloor;
  const unit = seafloorUnitOf(col?.unit);
  const notation = new Lines();
  const negatives = new Lines();
  const positives = new Lines();
  return {
    read: (row) => {
      if (!col || unit === undefined) return undefined;
      const cell = row.cells[col.index] ?? null;
      if (isBlankCell(cell)) return undefined;
      const p = parseNumber(cell, dc);
      if (p.status === 'non-numeric') collector.add('ROW-NON-NUMERIC', base.sheet, col.header, row.line, p.token);
      else if (p.status === 'na-variant') collector.add('ROW-NA-VARIANT', base.sheet, col.header, row.line, p.token);
      if (p.status !== 'ok') return undefined;
      const plain = sourceNumberText(cell, dc, p.value);
      const m = seafloorMetres(plain, unit, col.positive);
      if (!m.ok) {
        notation.add(base.file, base.sheet, col.header, row.line, String(cell).trim());
        return undefined;
      }
      if (p.value < 0) negatives.add(base.file, base.sheet, col.header, row.line);
      else if (p.value > 0) positives.add(base.file, base.sheet, col.header, row.line);
      return { text: m.text, plain: plain as string, unit, value: p.value, direction: col.positive };
    },
    findings: () => [
      ...(col && unit === undefined ? [makeConvertFinding('CONV-SEAFLOOR-UNIT', { ...base, field: col.header, params: { unit: col.unit ?? 'none' } })] : []),
      // both signs in one column: the minority sign (the one with fewer cells; on a tie, the positive one) is said, so the user can check the direction
      ...(col && negatives.size > 0 && positives.size > 0
        ? (() => {
            const neg = negatives.entries()[0];
            const pos = positives.entries()[0];
            const minority = neg.lines.length < pos.lines.length ? neg : pos;
            const minorityNegative = minority === neg;
            const direction = col.positive;
            // counted downwards a negative number is above the seafloor and a positive one below; counted upwards the other way round
            const side = (direction === 'down') === minorityNegative ? 'above' : 'below';
            return [makeConvertFinding('CONV-SEAFLOOR-SIGNS', { file: minority.file, sheet: minority.sheet, field: minority.field, lines: minority.lines, params: { count: minority.lines.length, direction, side, ...(neg.lines.length === pos.lines.length ? { tie: 'yes' } : {}) } })];
          })()
        : []),
      ...notation.entries().map((e) => makeConvertFinding('CONV-SEAFLOOR-VALUE', { file: e.file, sheet: e.sheet, field: e.field, lines: e.lines, value: e.examples[0] ?? '', params: { count: e.lines.length, reason: 'notation' } })),
    ],
  };
}

/** A measured-variable column of a sheet with what the user confirmed for it (stage 5): read the same way on a biology sheet and a profile sheet. */
interface VarState {
  v: Spec & { name: string; unit?: string; p01?: string };
  type: NercPick | undefined;
  unit: NercPick | undefined;
  written: boolean;
}

/**
 * What the variables written on a sheet say: those without a confirmed identifier are said (warnings to accept), the identifiers that were written are counted, and a
 * confirmed concept whose label contradicts the column's unit is said once per column. `extraNoUnit` are units of written columns that have no verified identifier by
 * nature (the unit of a pressure that is not decibars).
 */
function reportVariables(varState: readonly VarState[], base: { file: string; sheet: string }, extraNoUnit: readonly string[], nercStats: { columns: number; typeIds: number; unitIds: number; nvsIds: number }): Finding[] {
  const out: Finding[] = [];
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
  for (const u of extraNoUnit) if (!noUnit.includes(u)) noUnit.push(u);
  if (noType.length > 0) out.push(makeConvertFinding('CONV-NERC-UNKNOWN', { ...base, params: { what: noType.join(', ') } }));
  // a confirmed concept whose label says "per unit mass" (or volume) for a column whose unit is per volume (or mass): said once per column, the pair is the user's
  for (const st of varState) {
    if (!st.written || !st.type || st.v.unit === undefined) continue;
    if (unitContradictsConcept(pickLabel(st.type), st.v.unit)) {
      out.push(makeConvertFinding('CONV-NERC-UNIT-MISMATCH', { ...base, field: st.v.header, params: { column: st.v.header.trim(), code: st.type.id.split('/')[6], unit: st.v.unit } }));
    }
  }
  for (const unit of noUnit) out.push(makeConvertFinding('CONV-UNIT-NO-P06', { ...base, params: { unit } }));
  return out;
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
    if (s.profile !== undefined) continue; // a profile sheet's taxon columns are not read (CONV-COLUMN-NOT-EXPORTED says so)
    const sheet = s.file.sheets.find((x) => x.name === s.sheet);
    if (!sheet) continue;
    const cols = colsOf(s.mapping, sheet.header);
    if (s.shape === 'wide') {
      for (const n of taxonColumnNames(s.file, sheet, cols.taxonHeaders).values()) names.push(n.verbatim);
    } else if (cols.taxonCell) {
      for (const row of sheet.rows) {
        const t = text(row.cells[cols.taxonCell.index]);
        if (t !== undefined) names.push(t);
      }
    }
  }
  return distinctSplits(names, input.approvedSplits);
}

/* ---------- profile sheets (stage 6) ---------- */

/** The state the profile sheets share with the biology pass: the samples (for ID collisions and the station match) and what the profile rows add. */
interface ProfileContext {
  samples: ReadonlyMap<string, SampleAcc>;
  findings: Finding[];
  measurements: MofIntent[];
  nercStats: { columns: number; typeIds: number; unitIds: number; nvsIds: number };
  /** The stations of the biology sheets, as eventIDs. */
  bioStations: ReadonlySet<string>;
  /** Level key -> where its row is and what its ID was made of. The key is the ID with a depth or pressure number in its canonical form (10 and 10.0 are one key), so repeated casts are caught whichever way the number was typed. */
  levels: Map<string, LevelInfo>;
  /** The same by the written ID (for a collision with a station or cruise ID, which are compared as written). */
  levelById: Map<string, LevelInfo>;
  /** Repeated level keys: the ID and every row that makes it, with what each row's ID was made of. */
  levelDups: Map<string, { id: string; rows: LevelRow[] }>;
  /** The station level is flattened away: a level then has no station to inherit a date or position from. */
  flattenStation: boolean;
  sites: SampleSite[];
  /** Station eventIDs of profile rows that match a biology station / that match none (each distinct, first-seen order). */
  matched: Set<string>;
  unmatched: Set<string>;
  /** The biology stations by eventID: their own text and cruise, and the position of their first sample that has one. */
  bioStationInfo: ReadonlyMap<string, BioStation>;
  /** The biology stations by cruise and station text without its cast suffix. */
  bioByBase: ReadonlyMap<string, readonly string[]>;
  /** A matched profile station: the biology station it sits under, how it matched, and the position of its first level that has one (for the distance check). */
  matchedAt: Map<string, { bio: string; via: 'exact' | 'cast'; lat?: number; lon?: number; file: string; sheet: string }>;
}

interface BioStation {
  code: string;
  cruise?: string;
  lat?: number;
  lon?: number;
}

/** A station text without a trailing cast number: "PS27/006-6" -> "PS27/006". Only a final "-" and digits. */
export const castBase = (station: string): string => station.trim().replace(/-\d+$/, '');
const baseKey = (cruise: string | undefined, station: string): string => `${cruise ?? ''}\u0000${castBase(station)}`;

/** The biology stations of the samples, by eventID. */
function bioStationsOf(samples: ReadonlyMap<string, SampleAcc>): Map<string, BioStation> {
  const out = new Map<string, BioStation>();
  for (const a of samples.values()) {
    if (a.site.stationCode === undefined) continue;
    const id = stationEventId(a.site.cruiseCode, a.site.stationCode);
    let b = out.get(id);
    if (!b) out.set(id, (b = { code: a.site.stationCode, ...(a.site.cruiseCode === undefined ? {} : { cruise: a.site.cruiseCode }) }));
    if (b.lat === undefined && a.site.lat !== undefined && a.site.lon !== undefined) {
      b.lat = a.site.lat;
      b.lon = a.site.lon;
    }
  }
  return out;
}

/** The eventIDs of the biology stations that share a station text apart from its cast suffix, by cruise and base. */
function bioBases(stations: ReadonlyMap<string, BioStation>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [id, b] of stations) {
    const k = baseKey(b.cruise, b.code);
    const list = out.get(k);
    if (list) list.push(id);
    else out.set(k, [id]);
  }
  return out;
}

/** A profile station farther than this from the biology station it matched is said (the tool's own choice: the distance between two casts of one station is small, and 10 km already means another place). */
export const STATION_FAR_KM = 10;

/** What a level's ID was made of (the user's code column, the depth, the pressure), and for a collision also a sample or a station that has the ID. */
type LevelVia = 'code' | 'depth' | 'pressure' | 'seafloor';
type LevelSource = LevelVia | 'sample' | 'station';
interface LevelInfo {
  id: string;
  via: LevelVia;
  file: string;
  sheet: string;
  line: number;
}
interface LevelRow {
  file: string;
  sheet: string;
  line: number;
  via: LevelSource;
}

/** A number cell read for a level ID: the text written into the ID and the number it stands for (the key of the duplicate check). */
interface Vertical {
  via: 'depth' | 'pressure' | 'seafloor';
  text: string;
  value: number;
  /** What follows the number in the ID: m, dbar, or cmbsf / mbsf (centimetres / metres below the seafloor; cmasf / masf when the sheet counts them upwards and a depth below is negative). The unit is part of the ID, so no two kinds of coordinate give the same ID. */
  suffix: string;
}

/**
 * The vertical coordinate of a profile row for the ID that is made of it (only with the user's explicit approval; CONV-SAMPLE-CODE-MISSING otherwise), chosen PER ROW: the depth
 * when its cell reads as a number, else the pressure when its cell reads as a number AND the pressure column is in decibars (the ID says "dbar", so no other unit can stand
 * there). "NA", a word and an empty cell are no coordinate; a row with neither is not given an ID. The text is the number as the exported numbers are written (a decimal comma
 * becomes a point, a number cell of a workbook is its shortest exact text, 10.5 stays 10.5 and 10.0 stays 10.0); the key of the duplicate check is the number itself, so 10
 * and 10.0 are one depth. Never rounded, never turned into a depth from a pressure.
 */
function verticalOf(row: RawRow, cols: Cols, decimalComma: boolean): Vertical | undefined {
  const read = (spec: Spec | undefined, via: Vertical['via'], suffix: string): Vertical | undefined => {
    if (!spec) return undefined;
    const raw = row.cells[spec.index] ?? null;
    if (isBlankCell(raw)) return undefined;
    const p = parseNumber(raw, decimalComma);
    if (p.status !== 'ok') return undefined;
    return { via, suffix, value: p.value, text: sourceNumberText(raw, decimalComma, p.value) ?? String(p.value) };
  };
  // a sediment or porewater sheet: the depth in the sediment is the coordinate of the level (its water depth is the same for every level of a station); a unit that is not cm or m gives none
  const sfUnit = seafloorUnitOf(cols.seafloor?.unit);
  const seafloor = sfUnit === undefined ? undefined : read(cols.seafloor, 'seafloor', `${sfUnit}${cols.seafloor?.positive === 'up' ? 'asf' : 'bsf'}`);
  return seafloor ?? read(cols.depthPlain ?? cols.depthMin ?? cols.depthMax, 'depth', 'm') ?? (isDecibar(cols.pressure?.unit) ? read(cols.pressure, 'pressure', 'dbar') : undefined);
}

/**
 * One profile sheet. Every row with a station is its own event "profile level": parentEventID = its station (`cruise:station`, the same text the biology sheets build, matched
 * EXACTLY on the trimmed station text and the cruise when there is one: nothing is guessed), min = max depth = the row's depth, and the row's own date, time and position when the sheet
 * has them (else the level inherits them from its station). Its measured variables and its pressure are eMoF rows of THAT event. The level's ID is `<station eventID>:<code>` with the
 * code column, else `<station eventID>:<depth as written>m` (or `...dbar`) only when the user approved it for this sheet (never derived from the order of the rows). A station of the sheet that
 * no biology station matches gets its own station event and CONV-PROFILE-STATION-UNMATCHED (a warning to accept) that names it.
 */
function readProfileSheet(sin: ConvertSheetInput, ctx: ProfileContext): void {
  const file = sin.file;
  const sheet: RawSheet | undefined = file.sheets.find((x) => x.name === sin.sheet);
  if (!sheet) return;
  const fileName = file.fileName;
  const dc = file.decimalComma;
  const cols = colsOf(sin.mapping, sheet.header);
  const collector = new Collector(fileName);
  const specs = specsOf(sin.mapping);
  const parse = metaParser(file, sheet, specs, collector, { whenUtc: isUtcBySource(file, specs.when?.header) });
  const base = { file: fileName, sheet: sheet.name };
  const depthOf = depthReader(cols, dc, collector, sheet.name);
  const seafloorOf = seafloorReader(cols, dc, collector, base);
  const noSiteDepth = new Lines();
  const levelsBefore = ctx.sites.length;

  for (const d of [cols.depthMin, cols.depthMax, cols.depthPlain]) {
    if (d?.unit !== undefined && !METRES.test(d.unit.trim())) ctx.findings.push(makeConvertFinding('CONV-DEPTH-UNIT', { ...base, field: d.header, params: { unit: d.unit } }));
  }
  const noStation = new Lines();
  const noCode = new Lines();
  const tabs = new Lines();
  const summaries = new Lines();
  const checkText = (field: string, line: number, value: string | undefined): void => {
    if (value !== undefined && hasTabOrNewline(value)) tabs.add(fileName, sheet.name, field, line, shownText(value));
  };
  const varState: VarState[] = cols.variables.map((v) => {
    const d = readDecision(sin.nerc, v.index, v.p01);
    checkText(v.header, sheet.headerLine, v.name);
    checkText(v.header, sheet.headerLine, v.unit);
    return { v, type: d.type, unit: unitPickFor(v.unit, d), written: false };
  });
  const pressure = cols.pressure;
  if (pressure) checkText(pressure.header, sheet.headerLine, pressure.unit);
  let pressureWritten = false;

  const codeColumn = specs.sampleId !== undefined;
  const depthIds = !codeColumn && sin.profile?.depthIds === true;
  const ignoreCast = sin.profile?.ignoreCast === true;
  // a row with none of these filled is an empty line, not a level
  const dataColumns = [specs.station, specs.sampleId, cols.depthPlain, cols.depthMin, cols.depthMax, cols.pressure, cols.seafloor, ...cols.variables].flatMap((c) => (c === undefined ? [] : [c.index]));
  const sheetUnmatched = new Set<string>();

  // a sheet with no station column and the user's tick: each distinct position is a station, its text `<latitude>_<longitude>` as the two numbers are written in the sheet
  const positionStation = specs.station === undefined && sin.profile?.positionStation === true;
  const positionStations = new Set<string>();
  const stationOf = (row: RawRow, m: ReturnType<typeof parse>): string | undefined => {
    if (m.station !== undefined || !positionStation) return m.station;
    if (m.lat === undefined || m.lon === undefined || specs.lat === undefined || specs.lon === undefined) return undefined;
    const lat = sourceNumberText(row.cells[specs.lat.index], dc, m.lat) ?? String(row.cells[specs.lat.index] ?? '').trim();
    const lon = sourceNumberText(row.cells[specs.lon.index], dc, m.lon) ?? String(row.cells[specs.lon.index] ?? '').trim();
    return `${lat}_${lon}`;
  };
  // the dates of each station's rows, read BEFORE the rows are given their IDs: a station that was visited on more than one date puts the date into the IDs that are made of the depth
  // (the same depth of two visits is not one level). The value comes from the data, never from the order of the rows.
  const datesOf = new Map<string, Set<string>>();
  {
    const scan = metaParser(file, sheet, specs, new Collector(fileName), { whenUtc: isUtcBySource(file, specs.when?.header) });
    for (const row of sheet.rows) {
      const m = scan(row);
      const st = stationOf(row, m);
      if (st === undefined || m.datetime === undefined) continue;
      const cr = (m.cruise ?? sin.cruise?.trim()) || undefined;
      const k = stationEventId(cr, st);
      let set = datesOf.get(k);
      if (!set) datesOf.set(k, (set = new Set()));
      set.add(m.datetime.iso.slice(0, 10));
    }
  }

  /** A number cell as the text to write; text and NA are reported like any number cell and write nothing. */
  const numberText = (raw: RawCell | undefined, header: string, line: number): string | undefined => {
    const cell = raw ?? null;
    const p = parseNumber(cell, dc);
    if (p.status === 'missing') return undefined;
    if (p.status === 'na-variant') {
      collector.add('ROW-NA-VARIANT', sheet.name, header, line, p.token);
      return undefined;
    }
    if (p.status === 'non-numeric') {
      collector.add('ROW-NON-NUMERIC', sheet.name, header, line, p.token);
      return undefined;
    }
    return valueText(cell, dc);
  };

  const ragged = raggedLines(file, sheet.name);
  for (const row of sheet.rows) {
    if (ragged.has(row.line)) continue;
    const m = parse(row);
    const stationText = stationOf(row, m);
    // conservative, as on a biology sheet: only the exact word as the WHOLE station or code cell
    const summaryLabel = [m.sampleId, stationText].find((v) => v !== undefined && SUMMARY_LABEL.test(v));
    if (summaryLabel !== undefined) {
      summaries.add(fileName, sheet.name, 'station', row.line, summaryLabel);
      continue;
    }
    if (!dataColumns.some((i) => !isBlankCell(row.cells[i] ?? null))) continue;
    if (stationText === undefined) {
      noStation.add(fileName, sheet.name, specs.station?.header ?? '', row.line);
      continue;
    }
    const cruiseText = m.cruise ?? sin.cruise?.trim();
    const cruise = cruiseText === '' ? undefined : cruiseText;
    if (specs.station) checkText(specs.station.header, row.line, stationText);
    if (specs.cruise && m.cruise !== undefined) checkText(specs.cruise.header, row.line, m.cruise);
    const stationId = stationEventId(cruise, stationText);
    if (positionStation && specs.station === undefined) positionStations.add(stationId);
    // the level's own code: the code column, or (only with the user's approval, and only without a code column) the depth in the sediment as written with its unit, else the depth as
    // written, else the pressure as written with "dbar"
    const vertical = codeColumn || !depthIds ? undefined : verticalOf(row, cols, dc);
    // the unit is part of the ID ("2m", "2dbar", "5cmbsf"): a depth-made code never equals a numeric sample code ("2") of a station prefixed with the same station
    // a station that was visited on more than one date: the date of the row is part of a depth-made ID (`<station>:<YYYY-MM-DD>:<depth>m`); a row with no date there has no ID
    const idDate = vertical !== undefined && (datesOf.get(stationId)?.size ?? 0) > 1 ? (m.datetime?.iso.slice(0, 10) ?? null) : undefined;
    const code = codeColumn ? m.sampleId : vertical === undefined || idDate === null ? undefined : `${idDate === undefined ? '' : `${idDate}:`}${vertical.text}${vertical.suffix}`;
    const via: LevelVia = codeColumn ? 'code' : (vertical?.via ?? 'depth');
    if (code === undefined) {
      noCode.add(fileName, sheet.name, specs.sampleId?.header ?? '', row.line);
      continue;
    }
    if (specs.sampleId) checkText(specs.sampleId.header, row.line, code);
    const id = stationPrefixedId(stationId, code);
    // the key of the duplicate check: a depth or pressure by its number (10 and 10.0 are the same), a code as written; a code "10" and a depth 10 are the same key, as they are the same ID
    const key = vertical === undefined ? id : stationPrefixedId(stationId, `${idDate === undefined || idDate === null ? '' : `${idDate}:`}${vertical.value}${vertical.suffix}`);
    const source: SourceRef = { file: fileName, sheet: sheet.name, line: row.line };

    // the same ID twice (two rows of one station with the same code, depth or pressure: repeated casts), or an ID a sample already has
    const earlierLevel = ctx.levels.get(key);
    const earlierSample = ctx.samples.get(key) ?? ctx.samples.get(id);
    if (earlierLevel || earlierSample) {
      let d = ctx.levelDups.get(key);
      if (!d) {
        ctx.levelDups.set(key, (d = { id: earlierLevel?.id ?? id, rows: [] }));
        if (earlierLevel) d.rows.push({ file: earlierLevel.file, sheet: earlierLevel.sheet, line: earlierLevel.line, via: earlierLevel.via });
        if (earlierSample) for (const l of earlierSample.lines) d.rows.push({ file: earlierSample.source.file, sheet: earlierSample.source.sheet, line: l, via: 'sample' });
      }
      d.rows.push({ file: fileName, sheet: sheet.name, line: row.line, via });
      continue;
    }
    const info: LevelInfo = { id, via, file: fileName, sheet: sheet.name, line: row.line };
    ctx.levels.set(key, info);
    ctx.levelById.set(id, info);

    // the station match: EXACT, on the trimmed station text and the cruise when there is one; with the user's tick for this sheet (never otherwise), also by the station text without its
    // cast suffix, when exactly one biology station has that base
    let bioId: string | undefined;
    let matchVia: 'exact' | 'cast' = 'exact';
    if (ctx.bioStations.has(stationId)) bioId = stationId;
    else if (ignoreCast) {
      const same = ctx.bioByBase.get(baseKey(cruise, stationText));
      if (same !== undefined && same.length === 1) {
        bioId = same[0];
        matchVia = 'cast';
      }
    }
    if (bioId !== undefined) {
      ctx.matched.add(stationId);
      if (!ctx.matchedAt.has(stationId)) ctx.matchedAt.set(stationId, { bio: bioId, via: matchVia, file: fileName, sheet: sheet.name });
    } else {
      ctx.unmatched.add(stationId);
      sheetUnmatched.add(stationId);
    }

    const depth = depthOf(row);
    const sf = seafloorOf.read(row);
    if (sf !== undefined && depth.min === undefined && depth.max === undefined) noSiteDepth.add(fileName, sheet.name, cols.seafloor?.header ?? '', row.line);
    const date = m.datetime;
    // a level matched by the cast-free base sits under the BIOLOGY station (its own ID keeps the cast: two casts of one station stay two sets of levels)
    const parentBio = matchVia === 'cast' && bioId !== undefined ? ctx.bioStationInfo.get(bioId) : undefined;
    const site: SampleSite = { id, code, eventType: 'profile level', stationCode: parentBio?.code ?? stationText, source };
    const parentCruise = parentBio === undefined ? cruise : parentBio.cruise;
    if (parentCruise !== undefined) site.cruiseCode = parentCruise;
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
    if (sf !== undefined) site.distanceText = sf.text;
    ctx.sites.push(site);
    // the first position of a matched station, for the distance check
    const at = ctx.matchedAt.get(stationId);
    if (at !== undefined && at.lat === undefined && site.lat !== undefined && site.lon !== undefined) {
      at.lat = site.lat;
      at.lon = site.lon;
    }

    // eMoF rows of THIS level event (never of a sample): the measured variables, then the pressure
    for (const st of varState) {
      const written = numberText(row.cells[st.v.index], st.v.header, row.line);
      if (written === undefined) continue;
      st.written = true;
      ctx.measurements.push({
        target: { kind: 'event', id },
        role: 'variable',
        measurementType: measurementTypeText(st.type, st.v.name),
        ...(st.type ? { measurementTypeId: st.type.id } : {}),
        measurementValue: written,
        ...(st.v.unit === undefined ? (st.unit ? { measurementUnit: 'Dimensionless' } : {}) : { measurementUnit: st.v.unit }),
        ...(st.unit ? { measurementUnitId: st.unit.id } : {}),
        source: { ...source, column: st.v.header },
      });
    }
    if (pressure) {
      const written = numberText(row.cells[pressure.index], pressure.header, row.line);
      if (written !== undefined) {
        pressureWritten = true;
        ctx.measurements.push({
          target: { kind: 'event', id },
          role: 'pressure',
          measurementType: PRESSURE.type.label,
          measurementTypeId: PRESSURE.type.uri,
          measurementValue: written,
          ...(pressure.unit === undefined ? {} : { measurementUnit: pressure.unit }),
          ...(isDecibar(pressure.unit) ? { measurementUnitId: PRESSURE.unit.uri } : {}),
          source: { ...source, column: pressure.header },
        });
      }
    }
  }

  ctx.findings.push(...seafloorOf.findings());
  for (const e of noSiteDepth.entries()) ctx.findings.push(makeConvertFinding('CONV-SEAFLOOR-NO-SITE-DEPTH', { file: e.file, sheet: e.sheet, field: e.field, lines: e.lines, params: { count: e.lines.length } }));
  if (positionStations.size > 0) ctx.findings.push(makeConvertFinding('CONV-STATION-FROM-POSITION', { ...base, value: [...positionStations][0], params: { count: positionStations.size } }));
  // a sheet marked as a profile file that gave no level at all: said plainly (a description of columns, a sheet with no station and no tick, an empty sheet)
  if (ctx.sites.length === levelsBefore) ctx.findings.push(makeConvertFinding('CONV-PROFILE-NOTHING-READ', { ...base, params: { rows: sheet.rows.length } }));
  // a pressure that was written with no unit: said, by column (a unit that is stated but is not decibars is said by CONV-UNIT-NO-P06 below)
  if (pressureWritten && pressure && pressure.unit === undefined) ctx.findings.push(makeConvertFinding('CONV-PROFILE-PRESSURE-NO-UNIT', { ...base, field: pressure.header, params: { column: pressure.header.trim() } }));
  // the pressure's unit has an identifier only when it is decibars: any other unit is written as given, and said
  ctx.findings.push(...reportVariables(varState, base, pressureWritten && pressure?.unit !== undefined && !isDecibar(pressure.unit) ? [pressure.unit] : [], ctx.nercStats));
  for (const e of noStation.entries()) ctx.findings.push(makeConvertFinding('CONV-PROFILE-NO-STATION', { file: e.file, sheet: e.sheet, lines: e.lines, params: { count: e.lines.length, column: e.field === '' ? 'none' : e.field } }));
  for (const e of noCode.entries()) {
    ctx.findings.push(makeConvertFinding('CONV-SAMPLE-CODE-MISSING', { file: e.file, sheet: e.sheet, lines: e.lines, params: { count: e.lines.length, column: e.field === '' ? 'none' : e.field, profile: 'yes' } }));
  }
  for (const e of tabs.entries()) ctx.findings.push(makeConvertFinding('CONV-TAB-IN-VALUE', { file: e.file, sheet: e.sheet, field: e.field, lines: e.lines, value: e.examples[0] ?? '', params: { count: e.lines.length } }));
  for (const e of summaries.entries()) ctx.findings.push(makeConvertFinding('CONV-SUMMARY-ROW-SKIPPED', { file: e.file, sheet: e.sheet, lines: e.lines, value: e.examples.join(', '), params: { count: e.lines.length } }));
  if (sheetUnmatched.size > 0) {
    const names = [...sheetUnmatched];
    ctx.findings.push(makeConvertFinding('CONV-PROFILE-STATION-UNMATCHED', { ...base, value: names[0], params: { count: names.length, names: names.join(', ') } }));
  }
  // every column of the sheet that has a meaning this conversion does not read as a profile (a taxon or quantity column, a second pressure): said, nothing is dropped silently
  const unexported = unreadColumns(sin, cols, specs);
  if (unexported.length > 0) ctx.findings.push(makeConvertFinding('CONV-COLUMN-NOT-EXPORTED', { ...base, params: { count: unexported.length, columns: unexported.join(', ') } }));
  ctx.findings.push(...collector.findings());
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

  // The findings the PARSER raised for the files these sheets come from (/check puts them in its report; the converter must too): a ragged row (an extra or a missing field: the
  // values of that row are shifted against the header, so the finding stops the export, and ROW-RAGGED names the lines), an encoding that was guessed, a decimal comma, a 1904 workbook.
  // A finding that names a sheet is kept only for a sheet that is converted; one that names none (the whole file) is kept once per file.
  {
    const used = new Map<ParsedFile, Set<string>>();
    for (const sin of input.sheets) (used.get(sin.file) ?? used.set(sin.file, new Set()).get(sin.file)!).add(sin.sheet);
    for (const [file, sheets] of used) for (const f of file.findings) if (f.sheet === undefined || sheets.has(f.sheet)) findings.push(f);
  }

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
    // a profile sheet (stage 6) is read AFTER the biology sheets: matching its stations needs theirs (readProfileSheet)
    if (sin.profile !== undefined) continue;
    const file = sin.file;
    const sheet: RawSheet | undefined = file.sheets.find((x) => x.name === sin.sheet);
    if (!sheet) continue;
    const fileName = file.fileName;
    const sheetKey = `${fileName}\u0000${sheet.name}\u0000${sheetKeyN++}`;
    const dc = file.decimalComma;
    const cols = colsOf(sin.mapping, sheet.header);
    const collector = new Collector(fileName);
    const specs = specsOf(sin.mapping);
    const parse = metaParser(file, sheet, specs, collector, { whenUtc: isUtcBySource(file, specs.when?.header) });
    const base = { file: fileName, sheet: sheet.name };

    // the names of the wide taxon columns: the header without its unit, or the long name of a PANGAEA parameter (core/convert/headers.ts)
    const taxonNames = sin.shape === 'wide' ? taxonColumnNames(file, sheet, cols.taxonHeaders) : new Map<number, TaxonColumnName>();
    // a PANGAEA file whose parameter list could not be matched to its columns: its table-header abbreviations are the names, and that is said
    if (sin.shape === 'wide' && file.kind === 'pangaea' && cols.taxonHeaders.length > 0 && !pangaeaNamesUsed(file, sheet)) findings.push(makeConvertFinding('CONV-PANGAEA-NAMES-FALLBACK', { ...base }));
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
    let naCells = 0;
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
      const d = readDecision(sin.nerc, v.index, v.p01);
      checkText(v.header, sheet.headerLine, v.name);
      checkText(v.header, sheet.headerLine, v.unit);
      return { v, type: d.type, unit: unitPickFor(v.unit, d), written: false };
    });

    const depthOf = depthReader(cols, dc, collector, sheet.name);
    const seafloorOf = seafloorReader(cols, dc, collector, base);
    const noSiteDepth = new Lines();

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

    const ragged = raggedLines(file, sheet.name);
    for (const row of sheet.rows) {
      if (ragged.has(row.line)) continue;
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
      const sf = seafloorOf.read(row);
      if (sf !== undefined && depth.min === undefined && depth.max === undefined) noSiteDepth.add(fileName, sheet.name, cols.seafloor?.header ?? '', row.line);
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
        if (acc.site.distanceText !== sf?.text) differs('depth below seafloor');
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
        if (sf !== undefined) site.distanceText = sf.text;
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
          measurementType: measurementTypeText(st.type, v.name),
          ...(st.type ? { measurementTypeId: st.type.id } : {}),
          measurementValue: written,
          ...(v.unit === undefined ? (st.unit ? { measurementUnit: 'Dimensionless' } : {}) : { measurementUnit: v.unit }),
          ...(st.unit ? { measurementUnitId: st.unit.id } : {}),
          source: { ...source, column: v.header },
        });
      }

      /* ---- the occurrences of this row ---- */
      const cells: { verbatim: string; raw: unknown; column: string; idText?: string; columnRemark?: string; userId?: string; lifeStageCol?: string; qualifierCol?: string; nameId?: string }[] = [];
      if (sin.shape === 'wide') {
        for (const c of cols.taxonHeaders) {
          const n = taxonNames.get(c.index);
          cells.push({ verbatim: n?.verbatim ?? c.header.trim(), raw: row.cells[c.index] ?? null, column: c.header.trim(), ...(n === undefined ? {} : { idText: n.idText }), ...(n?.remark === undefined ? {} : { columnRemark: n.remark }) });
        }
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
        if (p.status === 'missing') {
          // a cell that says NA (not a blank one) is counted: it makes no record, and the user is told how many
          if (typeof raw === 'string' && raw.trim() !== '') naCells++;
          continue;
        }
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
        // what the file says about the column (a PANGAEA parameter comment) and the text of a text cell: both stay with the record
        const occRemarks = [cell.columnRemark, remarks].filter((x): x is string => x !== undefined && x !== '').join('; ');
        checkText(cell.column, row.line, occRemarks);
        const lifeStage = cell.lifeStageCol ?? sp.lifeStage;
        const qualifier = cell.qualifierCol ?? sp.identificationQualifier;
        // what the user typed into an approved split is written too: a tab or line break there would break the tab-separated file
        checkText(cell.column, row.line, sp.scientificName);
        checkText(cell.column, row.line, sp.identificationQualifier);
        checkText(cell.column, row.line, sp.lifeStage);
        const id = sin.shape === 'wide' ? occurrenceIdWide(eventId, cell.idText ?? cell.verbatim) : (cell.userId ?? occurrenceIdLong(eventId, cell.verbatim, cell.lifeStageCol));
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
          ...(occRemarks === '' ? {} : { occurrenceRemarks: occRemarks }),
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

    findings.push(...reportVariables(varState, base, [], nercStats));
    findings.push(...seafloorOf.findings());
    for (const e of noSiteDepth.entries()) findings.push(makeConvertFinding('CONV-SEAFLOOR-NO-SITE-DEPTH', { file: e.file, sheet: e.sheet, field: e.field, lines: e.lines, params: { count: e.lines.length } }));

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
    if (naCells > 0) findings.push(makeConvertFinding('CONV-NA-SKIPPED', { ...base, params: { count: naCells } }));
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

  /* ---- the profile sheets (stage 6): each row is a level event under its station ---- */
  const profileSheets = input.sheets.filter((s) => s.profile !== undefined);
  const bioStationInfo = bioStationsOf(samples);
  const profile: ProfileContext = {
    samples,
    findings,
    measurements,
    nercStats,
    bioStations: new Set([...samples.values()].flatMap((a) => (a.site.stationCode === undefined ? [] : [stationEventId(a.site.cruiseCode, a.site.stationCode)]))),
    levels: new Map(),
    levelById: new Map(),
    levelDups: new Map(),
    flattenStation: opts.flatten?.station === true,
    sites: [],
    matched: new Set(),
    unmatched: new Set(),
    bioStationInfo,
    bioByBase: bioBases(bioStationInfo),
    matchedAt: new Map(),
  };
  for (const sin of profileSheets) readProfileSheet(sin, profile);
  // a matched profile station far from the biology station it sits under: said, naming both (the position of each is its first level / first sample that has one)
  {
    const far = new Map<string, { file: string; sheet: string; names: string[] }>();
    for (const [pid, at] of profile.matchedAt) {
      const bio = profile.bioStationInfo.get(at.bio);
      if (at.lat === undefined || at.lon === undefined || bio?.lat === undefined || bio.lon === undefined) continue;
      const km = greatCircleM(at.lat, at.lon, bio.lat, bio.lon) / 1000;
      if (km <= STATION_FAR_KM) continue;
      const k = `${at.file}\u0000${at.sheet}`;
      let e = far.get(k);
      if (!e) far.set(k, (e = { file: at.file, sheet: at.sheet, names: [] }));
      e.names.push(`${pid} <-> ${at.bio} (${Math.round(km)} km)`);
    }
    // the pairs that matched only because the user ticked the cast-number match: said in full, whatever their distance
    const cast = new Map<string, { file: string; sheet: string; names: string[] }>();
    for (const [pid, at] of profile.matchedAt) {
      if (at.via !== 'cast') continue;
      const k = `${at.file}\u0000${at.sheet}`;
      let e = cast.get(k);
      if (!e) cast.set(k, (e = { file: at.file, sheet: at.sheet, names: [] }));
      e.names.push(`${pid} <-> ${at.bio}`);
    }
    for (const e of cast.values()) findings.push(makeConvertFinding('CONV-PROFILE-STATION-CAST-MATCHED', { file: e.file, sheet: e.sheet, value: e.names[0], params: { count: e.names.length, names: e.names.join('; ') } }));
    for (const e of far.values()) findings.push(makeConvertFinding('CONV-PROFILE-STATION-FAR', { file: e.file, sheet: e.sheet, value: e.names[0], params: { count: e.names.length, names: e.names.join('; '), limit: STATION_FAR_KM } }));
  }

  /* ---- identifiers across the whole archive ---- */
  const tree = buildEventTree(
    [...[...samples.values()].map((a) => a.site), ...profile.sites],
    opts.flatten ? { flatten: opts.flatten } : {},
  );
  const events: EventRec[] = tree.events;
  // A profile level is a leaf of the tree, and BioCheck needs a date and a position on every leaf AFTER inheritance (a child takes them from its parent only where it leaves them
  // empty, docs/research/qc-sources.md, stage 0, Item 2b). The row checks of the output tables do not always see a level without either, so it is checked here, in the sheet's terms.
  // A level takes them from its PARENT (its station; the cruise when the station level is flattened) and from nowhere further up: a station that has neither does not borrow the
  // whole cruise's date range and position for one cast, so such a level is said, not accepted because the cruise above happens to have both.
  if (profile.sites.length > 0) {
    const byId = new Map(events.map((e) => [e.id, e]));
    // With the station level flattened away there is no station to inherit from: the parent is the cruise, whose date range and midpoint are those of the whole cruise, so a level
    // with no date or position of its own is said then too (it never takes them from the cruise).
    const has = (e: EventRec, own: (x: EventRec) => boolean): boolean => {
      const parent = profile.flattenStation || e.parentId === undefined ? undefined : byId.get(e.parentId);
      return own(e) || (parent !== undefined && own(parent));
    };
    const gaps = new Map<string, { file: string; sheet: string; lines: number[]; position: boolean; date: boolean }>();
    for (const e of events) {
      if (e.eventType !== 'profile level' || e.source === undefined) continue;
      const position = !has(e, (x) => x.lat !== undefined && x.lon !== undefined);
      const date = !has(e, (x) => x.eventDate !== undefined);
      if (!position && !date) continue;
      const k = `${e.source.file}\u0000${e.source.sheet}`;
      let g = gaps.get(k);
      if (!g) gaps.set(k, (g = { file: e.source.file, sheet: e.source.sheet, lines: [], position: false, date: false }));
      g.lines.push(e.source.line);
      g.position ||= position;
      g.date ||= date;
    }
    for (const g of gaps.values()) {
      findings.push(makeConvertFinding('CONV-PROFILE-LEVEL-INCOMPLETE', { file: g.file, sheet: g.sheet, lines: g.lines, params: { count: g.lines.length, what: g.position && g.date ? 'date and position' : g.position ? 'position' : 'date' } }));
    }
  }
  // a sample code equal to a station or cruise eventID is the same eventID twice
  const kindOf = new Map<string, number>();
  for (const e of events) kindOf.set(e.id, (kindOf.get(e.id) ?? 0) + 1);
  for (const [id, n] of kindOf) {
    if (n < 2 || dups.has(id) || profile.levelDups.has(id)) continue;
    const a = samples.get(id);
    const lv = profile.levelById.get(id);
    if (lv && !a) {
      // a level whose ID is the ID of a station or cruise: said at the level's row, in the profile's terms
      profile.levelDups.set(id, { id, rows: [{ file: lv.file, sheet: lv.sheet, line: lv.line, via: lv.via }, { file: lv.file, sheet: lv.sheet, line: lv.line, via: 'station' }] });
      continue;
    }
    const d: Places = new Map();
    if (a) for (const l of a.lines) addPlace(d, a.source.file, a.source.sheet, l);
    dups.set(id, d);
  }
  // a level ID that repeats (two rows of one station with the same code, depth or pressure) or equals the ID of a sample, station or cruise: said at every sheet that has a row of it,
  // in the profile's terms. `used` names what each row's ID was made of, in line order; the text and the hint follow the KINDS that really collide (level: profile rows only;
  // level-other: a sample or a station is among them).
  for (const d of profile.levelDups.values()) {
    const byWhere = new Map<string, LevelRow[]>();
    for (const r of d.rows) {
      const k = `${r.file}\u0000${r.sheet}`;
      (byWhere.get(k) ?? byWhere.set(k, []).get(k)!).push(r);
    }
    const onlyLevels = d.rows.every((r) => r.via === 'code' || r.via === 'depth' || r.via === 'pressure' || r.via === 'seafloor');
    for (const rows of byWhere.values()) {
      const sorted = [...rows].sort((a, b) => a.line - b.line);
      const used = [...new Set(sorted.map((r) => r.via))];
      findings.push(
        makeConvertFinding('CONV-ID-DUPLICATE', {
          file: sorted[0].file,
          sheet: sorted[0].sheet,
          value: d.id,
          lines: sorted.map((r) => r.line),
          params: {
            kind: onlyLevels ? 'level' : 'level-other',
            count: 1,
            used: used.join(', '),
            hint: onlyLevels
              ? `Two profile rows of one station give the same level identifier (made of: ${used.join(', ')}). A depth and a pressure never give the same ID (the pressure's ends in "dbar"); a code and a depth can. Add a column with a code that is unique within the station, for example the cast and the bottle or scan together, and mark it as the sample code.`
              : `A level identifier is also the identifier of another event (made of: ${used.join(', ')}). Change the code of the profile rows, or the codes of the samples or stations that share it.`,
          },
        }),
      );
    }
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
    if (!sheet || sin.shape !== 'long' || sin.profile !== undefined) continue;
    const cols = colsOf(sin.mapping, sheet.header);
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

  // An upload that has no taxon anywhere (a CTD or environmental file alone) would give an archive with no occurrence: OBIS publishes species records. Said here, in these words, instead
  // of letting the empty Occurrence table be reported as missing terms (validate.ts leaves an empty Occurrence table alone).
  const found = input.sheets.find((x) => x.file.sheets.some((sh) => sh.name === x.sheet));
  if (occurrences.length === 0 && found !== undefined) {
    const first = found;
    // taxa that were there but all 0 and skipped (the full species list is not ticked) are another case from an upload with no taxon: its own text says what to tick
    findings.push(makeConvertFinding('CONV-NO-OCCURRENCES', { file: first.file.fileName, sheet: first.sheet, params: stats.zerosSkipped > 0 && !fullList ? { zeros: 'yes' } : {} }));
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
    profile: {
      sheets: profileSheets.length,
      levels: profile.sites.length,
      stationsMatched: profile.matched.size,
      stationsUnmatched: profile.unmatched.size,
      unmatched: [...profile.unmatched].slice(0, UNMATCHED_SHOWN),
    },
    stats: { samples: samples.size, levels: profile.sites.length, occurrences: occurrences.length, present: stats.present, absent: stats.absent, zerosSkipped: stats.zerosSkipped, textCells: stats.textCells, measurements: measurements.length, nerc: nercStats },
  };
}

