// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type {
  ColumnRole,
  DataRow,
  Dataset,
  Finding,
  LayoutPlan,
  MetadataRecord,
  NumericCell,
  ParsedDate,
  ParsedFile,
  RawCell,
  RawRow,
  RawSheet,
  SheetMapping,
  TablePlan,
  Variable,
} from './types';
import { checkRawTable } from './checks/dwc';
import { makeFinding } from './rules/registry';
import { dwcTermOf, isBlankCell, proposeColumns, toMapping, unitFromHeader } from './recognize/columns';
import { splitLayout } from './recognize/layout';
import { encodeReasons } from './recognize/layoutReasons';
import { canonicalFromKey, headerKey, isCanonicalKey, normaliseUnit } from './recognize/vocab';
import { parseCoordinate } from './values/coords';
import { combineDateTime, detectDayMonthOrder, parseDate, parseTimeOfDay } from './values/dates';
import type { DateError } from './values/dates';
import { parseNumber } from './values/numbers';

/* ---------- findings collector ---------- */

type RowRuleId = 'ROW-DM-COORDS' | 'ROW-LON-360' | 'ROW-DATE-UNPARSEABLE' | 'ROW-DATE-YYMMDD' | 'ROW-TZ-UNKNOWN' | 'ROW-NON-NUMERIC' | 'ROW-NA-VARIANT';
const MAX_TOKENS = 5; // distinct tokens listed in `value`; the once-per-column info rules list one example

interface Acc {
  ruleId: RowRuleId;
  sheet: string;
  field: string;
  lines: Set<number>;
  values: string[];
  withLines: boolean;
  /** template params of the finding; the first call for a column sets them, like the example value */
  params?: Record<string, string | number>;
}

export class Collector {
  private readonly accs = new Map<string, Acc>();
  constructor(private readonly file: string) {}

  add(ruleId: RowRuleId, sheet: string, field: string, line: number, value?: string, withLines = true, params?: Record<string, string | number>): void {
    const key = `${ruleId}\u0000${sheet}\u0000${field}`;
    let acc = this.accs.get(key);
    if (!acc) this.accs.set(key, (acc = { ruleId, sheet, field, lines: new Set(), values: [], withLines }));
    if (withLines) acc.lines.add(line);
    if (params !== undefined && acc.params === undefined) acc.params = params;
    if (value !== undefined && acc.values.length < (withLines ? MAX_TOKENS : 1) && !acc.values.includes(value)) acc.values.push(value);
  }

  findings(): Finding[] {
    return [...this.accs.values()].map((a) =>
      makeFinding(a.ruleId, {
        file: this.file,
        sheet: a.sheet,
        field: a.field,
        ...(a.values.length > 0 ? { value: a.values.join(', ') } : {}),
        ...(a.withLines ? { lines: [...a.lines] } : {}),
        ...(a.params !== undefined ? { params: a.params } : {}),
      }),
    );
  }
}

/* ---------- mapping helpers ---------- */

type VariableRole = Extract<ColumnRole, { kind: 'variable' }>;
export interface Spec {
  index: number;
  header: string;
}
export interface Specs {
  lat?: Spec;
  lon?: Spec;
  when?: Spec & { kind: 'date' | 'datetime' };
  time?: Spec;
  depth?: Spec & { positive: 'down' | 'up' | 'unknown' };
  station?: Spec;
  cruise?: Spec;
  sampleId?: Spec;
  vars: (Spec & { role: VariableRole })[];
}

/** Exported for the converter (src/core/convert), which reads rows exactly as /check does. No logic of its own was added for that. */
export function specsOf(mapping: SheetMapping): Specs {
  const s: Specs = { vars: [] };
  for (const c of mapping.columns) {
    const r = c.role;
    const spec = { index: c.index, header: c.header };
    switch (r.kind) {
      case 'latitude':
        s.lat ??= spec;
        break;
      case 'longitude':
        s.lon ??= spec;
        break;
      case 'date':
      case 'datetime':
        s.when ??= { ...spec, kind: r.kind };
        break;
      case 'time':
        s.time ??= spec;
        break;
      case 'depth':
        s.depth ??= { ...spec, positive: r.positive };
        break;
      case 'station':
        s.station ??= spec;
        break;
      case 'cruise':
        s.cruise ??= spec;
        break;
      case 'sampleId':
        s.sampleId ??= spec;
        break;
      case 'variable':
        s.vars.push({ ...spec, role: r });
        break;
      // converter-only roles (types.ts ConverterRole): /check never proposes them; a column that has one is not read here, so a
      // species or quantity column can never raise ROW-UNIT-MISSING or any other variable rule
      case 'taxon':
      case 'quantity':
      case 'quantityType':
      case 'effort':
      case 'occurrenceId':
      case 'lifeStage':
      case 'qualifier':
      case 'taxonId':
      default:
        break;
    }
  }
  return s;
}

const UTC_HEADER = /(^|[^a-z])(utc|gmt)([^a-z]|$)/i;
const str = (c: RawCell): string | undefined => {
  if (c === null) return undefined;
  const t = String(c).trim();
  return t === '' ? undefined : t;
};

/* ---------- one row's position, date, depth and identifiers ---------- */

export interface Meta {
  lat?: number;
  lon?: number;
  latDecimals?: number;
  lonDecimals?: number;
  datetime?: ParsedDate;
  dateRaw?: RawCell;
  depth?: number;
  depthDecimals?: number;
  station?: string;
  cruise?: string;
  sampleId?: string;
  depthMin?: number;
  depthMax?: number;
  posBlank?: 'lat' | 'lon' | 'both';
}
// posBlank is not copied from a lookup row: it describes this row's own cells
const META_FIELDS: (keyof Meta)[] = ['lat', 'lon', 'latDecimals', 'lonDecimals', 'datetime', 'dateRaw', 'depth', 'depthDecimals', 'station', 'cruise', 'sampleId', 'depthMin', 'depthMax'];

function reportBadNumber(c: Collector, sheet: string, field: string, line: number, raw: RawCell, decimalComma: boolean): void {
  const p = parseNumber(raw, decimalComma);
  if (p.status === 'na-variant') c.add('ROW-NA-VARIANT', sheet, field, line, p.token);
  else if (p.status === 'non-numeric') c.add('ROW-NON-NUMERIC', sheet, field, line, p.token);
}

/** Columns named year / month / day (DwC terms, prefix allowed) of a sheet; undefined when there is no year column. */
function dwcDateParts(sheet: RawSheet): { year: number; month?: number; day?: number } | undefined {
  const find = (term: string): number | undefined => {
    const i = sheet.header.findIndex((h) => dwcTermOf(h) === term);
    return i < 0 ? undefined : i;
  };
  const year = find('year');
  if (year === undefined) return undefined;
  const month = find('month');
  const day = find('day');
  return { year, ...(month === undefined ? {} : { month }), ...(day === undefined ? {} : { day }) };
}

function wholeNumber(c: RawCell): number | undefined {
  if (c === null) return undefined;
  const t = String(c).trim();
  if (!/^\d{1,4}(\.0+)?$/.test(t)) return undefined;
  return Number(t);
}

/** A date from DwC year (+ month, day) cells, with year / month / day precision; undefined when the year is missing or invalid. */
function composeYmd(row: RawRow, cols: { year: number; month?: number; day?: number }): ParsedDate | undefined {
  const y = wholeNumber(row.cells[cols.year] ?? null);
  if (y === undefined || y < 1) return undefined;
  const mo = cols.month === undefined ? undefined : wholeNumber(row.cells[cols.month] ?? null);
  const d = cols.day === undefined ? undefined : wholeNumber(row.cells[cols.day] ?? null);
  const p2 = (n: number) => String(n).padStart(2, '0');
  const yy = String(y).padStart(4, '0');
  if (mo === undefined || mo < 1 || mo > 12) return { iso: yy, year: y, precision: 'year', tz: 'unknown' };
  const dim = new Date(Date.UTC(2000 + (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 0 : 1), mo, 0)).getUTCDate();
  if (d === undefined || d < 1 || d > dim) return { iso: `${yy}-${p2(mo)}`, year: y, precision: 'month', tz: 'unknown' };
  return { iso: `${yy}-${p2(mo)}-${p2(d)}`, year: y, precision: 'day', tz: 'unknown' };
}

/** Header columns of the Darwin Core minimum and maximum depth, wherever the mapping put the single depth slot: min > max needs both. */
function dwcDepthCols(sheet: RawSheet): { min?: Spec; max?: Spec } {
  const find = (term: string): Spec | undefined => {
    const i = sheet.header.findIndex((h) => dwcTermOf(h) === term);
    return i < 0 ? undefined : { index: i, header: sheet.header[i] };
  };
  const min = find('minimumdepthinmeters');
  const max = find('maximumdepthinmeters');
  return { ...(min ? { min } : {}), ...(max ? { max } : {}) };
}

/** A label that makes a row a summary line ("Total", "Mean ± SD" is not matched: only the bare label), not a record without a position. */
const SUMMARY_LABEL = /^(totals?|grand total|sub-?total|sum|mean|average|avg|median|min(imum)?|max(imum)?|st(an)?d(ard)?\.? ?dev(iation)?|stdev|sd|count)[:.]?$/i;

/**
 * A row without a position is only a record without one when it holds more than a label: at least two cells besides the position have
 * a value (a section heading or an event name on a line of its own has one) and it is not a summary line.
 */
function holdsRecord(row: RawRow, skip: readonly number[]): boolean {
  let filled = 0;
  for (let i = 0; i < row.cells.length; i++) {
    const c = row.cells[i];
    if (skip.includes(i) || isBlankCell(c)) continue;
    if (typeof c === 'string' && SUMMARY_LABEL.test(c.trim())) return false;
    filled++;
  }
  return filled >= 2;
}

/**
 * `opts.whenUtc`: the converter says that the date column is UTC by the convention of its source (a PANGAEA file's Date/Time, wiki.pangaea.de/wiki/Data_submission), so a time with no zone is
 * read as UTC and written with its Z, and ROW-TZ-UNKNOWN is not raised. /check never passes it: its output is unchanged.
 */
export function metaParser(file: ParsedFile, sheet: RawSheet, specs: Specs, c: Collector, opts: { whenUtc?: boolean } = {}): (row: RawRow) => Meta {
  const dc = file.decimalComma;
  const dateCache = new Map<string, ParsedDate | DateError>();
  const whenUtc = opts.whenUtc === true || (specs.when ? UTC_HEADER.test(specs.when.header) : false);
  const timeUtc = specs.time ? UTC_HEADER.test(specs.time.header) : false;
  // D?M/YYYY order is a property of the column, not of a cell: decided once from every cell of the date column
  const whenIndex = specs.when?.index;
  // Darwin Core: where eventDate is empty, the same row's year / month / day columns give the date
  const dwcParts = specs.when && dwcTermOf(specs.when.header) === 'eventdate' ? dwcDateParts(sheet) : undefined;
  const whenOrder = whenIndex === undefined ? 'unknown' : detectDayMonthOrder(sheet.rows.map((r) => r.cells[whenIndex] ?? null));
  const dwcDepth = dwcDepthCols(sheet);

  const coordinate = (row: RawRow, spec: Spec, axis: 'lat' | 'lon'): { value: number; decimals: number } | undefined => {
    const cell = row.cells[spec.index] ?? null;
    if (isBlankCell(cell)) return undefined;
    const r = parseCoordinate(cell, axis, dc);
    if (!('error' in r)) {
      if (r.form !== 'decimal') c.add('ROW-DM-COORDS', sheet.name, spec.header, row.line, String(cell).trim(), false);
      if (r.normalised360) c.add('ROW-LON-360', sheet.name, spec.header, row.line, String(cell).trim());
      return { value: r.value, decimals: r.decimals };
    }
    // out of range or odd notation: keep a plain number as it is (the range rules report it), report the rest
    const p = parseNumber(cell, dc);
    if (p.status === 'ok') return { value: p.value, decimals: p.decimals };
    reportBadNumber(c, sheet.name, spec.header, row.line, cell, dc);
    return undefined;
  };

  return (row: RawRow): Meta => {
    const m: Meta = {};
    if (specs.lat && specs.lon) {
      // a blank (not unreadable) coordinate cell on a row that holds something else: ROW-NO-COORD decides whether other rows have a position
      const latBlank = isBlankCell(row.cells[specs.lat.index] ?? null);
      const lonBlank = isBlankCell(row.cells[specs.lon.index] ?? null);
      // the other cell holding an NA variant ("NANA") is reported by ROW-NA-VARIANT: not a second time as a missing position
      const na = (spec: Spec): boolean => parseNumber(row.cells[spec.index] ?? null, dc).status === 'na-variant';
      if ((latBlank || lonBlank) && !(latBlank && !lonBlank && na(specs.lon)) && !(lonBlank && !latBlank && na(specs.lat)) && holdsRecord(row, [specs.lat.index, specs.lon.index])) m.posBlank = latBlank && lonBlank ? 'both' : latBlank ? 'lat' : 'lon';
    }
    if (specs.lat) {
      const r = coordinate(row, specs.lat, 'lat');
      if (r) {
        m.lat = r.value;
        m.latDecimals = r.decimals;
      }
    }
    if (specs.lon) {
      const r = coordinate(row, specs.lon, 'lon');
      if (r) {
        m.lon = r.value;
        m.lonDecimals = r.decimals;
      }
    }
    if (specs.when) {
      const cell = row.cells[specs.when.index] ?? null;
      if (isBlankCell(cell) && dwcParts) {
        const d = composeYmd(row, dwcParts);
        if (d) {
          m.datetime = d;
          m.dateRaw = d.iso;
        }
      }
      if (!isBlankCell(cell)) {
        m.dateRaw = cell;
        const cacheKey = typeof cell === 'number' ? `n${cell}` : `s${cell}`;
        let d = dateCache.get(cacheKey);
        if (d === undefined) {
          d = parseDate(cell, {
            date1904: file.date1904,
            dateFormatted: sheet.dateFormatted?.[specs.when.index] === true,
            ...(whenOrder === 'unknown' ? {} : { order: whenOrder }),
          });
          dateCache.set(cacheKey, d);
        }
        if ('error' in d) {
          c.add('ROW-DATE-UNPARSEABLE', sheet.name, specs.when.header, row.line, String(cell).trim());
        } else {
          let date: ParsedDate = d;
          let tzField = specs.when.header;
          if (date.ambiguity === 'yy-mm-dd') c.add('ROW-DATE-YYMMDD', sheet.name, specs.when.header, row.line, String(cell).trim(), false, { interpreted: date.iso.slice(0, 10) });
          const timeCell = specs.time ? (row.cells[specs.time.index] ?? null) : null;
          if (specs.time && !isBlankCell(timeCell)) {
            if ('error' in parseTimeOfDay(timeCell)) c.add('ROW-DATE-UNPARSEABLE', sheet.name, specs.time.header, row.line, String(timeCell).trim());
            else {
              date = combineDateTime(date, timeCell);
              tzField = specs.time.header;
            }
          }
          if ((date.precision === 'minute' || date.precision === 'second') && date.tz === 'unknown') {
            if (whenUtc || timeUtc) date = { ...date, tz: 'utc', iso: `${date.iso}Z` };
            else c.add('ROW-TZ-UNKNOWN', sheet.name, tzField, row.line, undefined, false);
          }
          m.datetime = date;
        }
      }
    }
    if (specs.depth) {
      const cell = row.cells[specs.depth.index] ?? null;
      if (!isBlankCell(cell)) {
        const p = parseNumber(cell, dc);
        if (p.status === 'ok') {
          m.depth = p.value;
          m.depthDecimals = p.decimals;
        }
        else reportBadNumber(c, sheet.name, specs.depth.header, row.line, cell, dc);
      }
    }
    // Darwin Core depth range: each bound from its own column; text in the one the depth slot did not take is reported here
    for (const [key, spec] of [['depthMin', dwcDepth.min], ['depthMax', dwcDepth.max]] as const) {
      if (!spec) continue;
      const cell = row.cells[spec.index] ?? null;
      if (isBlankCell(cell)) continue;
      const p = parseNumber(cell, dc);
      if (p.status === 'ok') m[key] = p.value;
      else if (spec.index !== specs.depth?.index) reportBadNumber(c, sheet.name, spec.header, row.line, cell, dc);
    }
    const station = specs.station ? str(row.cells[specs.station.index] ?? null) : undefined;
    const cruise = specs.cruise ? str(row.cells[specs.cruise.index] ?? null) : undefined;
    const sampleId = specs.sampleId ? str(row.cells[specs.sampleId.index] ?? null) : undefined;
    if (station !== undefined) m.station = station;
    if (cruise !== undefined) m.cruise = cruise;
    if (sampleId !== undefined) m.sampleId = sampleId;
    return m;
  };
}

function numericCell(raw: RawCell, line: number, field: string, sheet: string, dc: boolean, c: Collector): NumericCell {
  const p = parseNumber(raw, dc);
  switch (p.status) {
    case 'ok':
      return { raw, line, value: p.value, decimals: p.decimals, status: 'ok' };
    case 'missing':
      return { raw, line, status: 'missing' };
    case 'na-variant':
      c.add('ROW-NA-VARIANT', sheet, field, line, p.token);
      return { raw, line, status: 'na-variant' };
    default:
      c.add('ROW-NON-NUMERIC', sheet, field, line, p.token);
      return { raw, line, status: 'non-numeric' };
  }
}

/**
 * DataRow.values is keyed by header / parameter names taken from the file. A prototype-less object keeps names such
 * as '__proto__', 'constructor' or 'toString' ordinary keys: writing them is safe and an absent key reads undefined.
 */
const newValues = (): Record<string, NumericCell> => Object.create(null) as Record<string, NumericCell>;

/* ---------- variables ---------- */

function variableFrom(key: string, header: string, role: VariableRole): Variable {
  const v: Variable = { key, header };
  if (isCanonicalKey(role.variable)) v.canonical = role.variable;
  if (role.unit !== undefined) {
    v.unit = role.unit;
    if (role.unitSource !== undefined) v.unitSource = role.unitSource;
  }
  if (role.p01 !== undefined) v.p01 = role.p01;
  return v;
}

function fillUnitsFromMetadata(variables: Variable[], metadata: readonly MetadataRecord[]): void {
  const params = metadata.flatMap((m) => m.parameters ?? []).filter((p) => p.unit !== undefined && p.unit.trim() !== '');
  if (params.length === 0) return;
  for (const v of variables) {
    if (v.unit !== undefined) continue;
    const name = headerKey(unitFromHeader(v.header).name);
    if (name === '') continue;
    const hit = params.find((p) => headerKey(unitFromHeader(p.name).name) === name);
    if (hit?.unit) {
      v.unit = normaliseUnit(hit.unit) ?? hit.unit.trim();
      v.unitSource = 'metadata';
    }
  }
}

/* ---------- tables ---------- */

interface Built {
  rows: DataRow[];
  variables: Variable[];
  positives: ('down' | 'up' | 'unknown')[];
}

const longColumns = (l: NonNullable<TablePlan['long']>): number[] => [l.parameterCol, l.valueCol, ...(l.unitCol === undefined ? [] : [l.unitCol])];

function mappingFor(file: ParsedFile, mappings: readonly SheetMapping[], sheet: RawSheet, long?: TablePlan['long']): SheetMapping {
  const given = mappings.find((m) => m.sheet === sheet.name);
  if (given) return given;
  return toMapping(sheet, proposeColumns(sheet, { decimalComma: file.decimalComma, date1904: file.date1904, ...(long ? { long } : {}) }));
}

interface Lookup {
  rowsByKey: Map<string, RawRow>;
  meta: (row: RawRow) => Meta;
  cache: Map<RawRow, Meta>;
  leftKey: number;
}

function makeLookup(file: ParsedFile, layout: LayoutPlan, sheetName: string, mappings: readonly SheetMapping[], c: Collector): Lookup | undefined {
  const join = layout.joins.find((j) => j.left === sheetName);
  if (!join) return undefined;
  const sheet = file.sheets.find((s) => s.name === join.right);
  if (!sheet) return undefined;
  const rowsByKey = new Map<string, RawRow>();
  for (const r of sheet.rows) {
    const k = str(r.cells[join.rightKey] ?? null);
    if (k !== undefined && !rowsByKey.has(k)) rowsByKey.set(k, r);
  }
  return { rowsByKey, meta: metaParser(file, sheet, specsOf(mappingFor(file, mappings, sheet)), c), cache: new Map(), leftKey: join.leftKey };
}

function withLookup(base: Meta, row: RawRow, lookup: Lookup | undefined): Meta {
  if (!lookup) return base;
  const k = str(row.cells[lookup.leftKey] ?? null);
  const hit = k === undefined ? undefined : lookup.rowsByKey.get(k);
  if (hit) {
    let lm = lookup.cache.get(hit);
    if (!lm) lookup.cache.set(hit, (lm = lookup.meta(hit)));
    for (const f of META_FIELDS) {
      if (base[f] === undefined && lm[f] !== undefined) (base as Record<string, unknown>)[f] = lm[f];
    }
  }
  if (base.posBlank !== undefined && base.lat !== undefined && base.lon !== undefined) delete base.posBlank;
  // positions come from a table of cores / sites: when the data carries no station column the core id names the site
  if (base.station === undefined && base.sampleId !== undefined) base.station = base.sampleId;
  return base;
}

/*
 * Darwin Core event hierarchy: an event without a position is not missing one when OBIS gives it the position of its parent, which is
 * the structure of an event core (cruise > station > sample). A row without a position is therefore left out of ROW-NO-COORD when it is
 * the parent of another event, or when an ancestor has a position. One pass to find the parents, then each row walks up at most to the
 * first positioned ancestor; the walk is memoised per event id, so the whole is linear.
 */
function clearInheritedPositions(sheet: RawSheet, rows: DataRow[]): void {
  const col = (term: string): number => sheet.header.findIndex((h) => dwcTermOf(h) === term);
  const e = col('eventid');
  const p = col('parenteventid');
  if (e < 0 || p < 0 || rows.length !== sheet.rows.length) return;
  const idOf = (i: number): string => str(sheet.rows[i].cells[e] ?? null) ?? '';
  const parentOf = (i: number): string => str(sheet.rows[i].cells[p] ?? null) ?? '';
  const positioned = new Map<string, boolean>(); // event id -> the event, or an ancestor, has a position
  const index = new Map<string, number>();
  const parents = new Set<string>();
  rows.forEach((_, i) => {
    const id = idOf(i);
    if (id !== '' && !index.has(id)) index.set(id, i);
    const par = parentOf(i);
    if (par !== '') parents.add(par);
  });
  const inherits = (start: string): boolean => {
    const path: string[] = [];
    const seen = new Set<string>();
    let at: string | undefined = start;
    let result = false;
    while (at !== undefined && at !== '' && !seen.has(at)) {
      const known = positioned.get(at);
      if (known !== undefined) {
        result = known;
        break;
      }
      seen.add(at);
      path.push(at);
      const i = index.get(at);
      if (i === undefined) break;
      if (rows[i].lat !== undefined && rows[i].lon !== undefined) {
        result = true;
        break;
      }
      at = parentOf(i) || undefined;
    }
    for (const id of path) positioned.set(id, result);
    return result;
  };
  rows.forEach((r, i) => {
    if (r.posBlank === undefined) return;
    const id = idOf(i);
    const parent = parentOf(i);
    if ((id !== '' && parents.has(id)) || (parent !== '' && inherits(parent))) delete r.posBlank;
  });
}

function buildWide(file: ParsedFile, sheet: RawSheet, specs: Specs, lookup: Lookup | undefined, namespace: boolean, c: Collector): Built {
  const dc = file.decimalComma;
  const parse = metaParser(file, sheet, specs, c);
  const seen = new Set<string>();
  const cols = specs.vars.map((v) => {
    let key = namespace ? `${sheet.name}!${v.header}` : v.header;
    if (seen.has(key)) key = `${key}#${v.index}`;
    seen.add(key);
    return { v, key };
  });
  const variables = cols.map(({ v, key }) => variableFrom(key, v.header, v.role));
  const rows: DataRow[] = [];
  for (const r of sheet.rows) {
    const row: DataRow = { file: file.fileName, sheet: sheet.name, line: r.line, ...withLookup(parse(r), r, lookup), values: newValues() };
    for (const { v, key } of cols) row.values[key] = numericCell(r.cells[v.index] ?? null, r.line, v.header, sheet.name, dc, c);
    rows.push(row);
  }
  clearInheritedPositions(sheet, rows);
  return { rows, variables, positives: specs.depth ? [specs.depth.positive] : [] };
}

function buildLong(file: ParsedFile, sheet: RawSheet, plan: NonNullable<TablePlan['long']>, specs: Specs, lookup: Lookup | undefined, namespace: boolean, c: Collector): Built {
  const dc = file.decimalComma;
  const parse = metaParser(file, sheet, specs, c);
  const skip = new Set(longColumns(plan));
  const keyCols = [specs.sampleId, specs.station, specs.cruise, specs.depth, specs.when, specs.time, specs.lat, specs.lon]
    .filter((s): s is Spec => s !== undefined && !skip.has(s.index))
    .map((s) => s.index);

  // units per parameter, from the unit column (or from the parameter text itself, 'DIC [umol/kg]')
  const unitsOf = new Map<string, Set<string>>();
  const unitOfRow = (r: RawRow, param: string): string | undefined => {
    const fromCol = plan.unitCol === undefined ? undefined : str(r.cells[plan.unitCol] ?? null);
    const t = fromCol ?? unitFromHeader(param).unitText;
    return t === undefined ? undefined : (normaliseUnit(t) ?? t);
  };
  for (const r of sheet.rows) {
    const param = str(r.cells[plan.parameterCol] ?? null);
    if (param === undefined) continue;
    const u = unitOfRow(r, param);
    if (!unitsOf.has(param)) unitsOf.set(param, new Set());
    if (u !== undefined) unitsOf.get(param)!.add(u);
  }
  const varKey = (param: string, unit: string | undefined): string => {
    const units = unitsOf.get(param);
    const base = units && units.size > 1 && unit !== undefined ? `${param} [${unit}]` : param;
    return namespace ? `${sheet.name}!${base}` : base;
  };

  const variables = new Map<string, Variable>();
  const groups = new Map<string, DataRow>();
  const rows: DataRow[] = [];
  for (const r of sheet.rows) {
    const param = str(r.cells[plan.parameterCol] ?? null);
    if (param === undefined) continue;
    const id = JSON.stringify(keyCols.map((i) => str(r.cells[i] ?? null) ?? ''));
    let row = groups.get(id);
    if (!row) {
      row = { file: file.fileName, sheet: sheet.name, line: r.line, ...withLookup(parse(r), r, lookup), values: newValues() };
      groups.set(id, row);
      rows.push(row);
    }
    const unit = unitOfRow(r, param);
    const key = varKey(param, unit);
    if (!variables.has(key)) {
      const hu = unitFromHeader(param);
      const canonical = canonicalFromKey(headerKey(hu.name));
      const v: Variable = { key, header: param };
      if (canonical) v.canonical = canonical;
      if (unit !== undefined) {
        v.unit = unit;
        v.unitSource = 'header';
      }
      variables.set(key, v);
    }
    if (row.values[key] !== undefined) continue; // duplicate (sample, parameter): the first one stays, nothing is averaged
    row.values[key] = numericCell(r.cells[plan.valueCol] ?? null, r.line, param, sheet.name, dc, c);
  }
  return { rows, variables: [...variables.values()], positives: specs.depth ? [specs.depth.positive] : [] };
}

/* ---------- public ---------- */

export interface BuildOptions {
  /** Overrides the dataset label (default: the file name, plus the sheet when the file has several). */
  label?: string;
}

/** `reason` is the English phrase (technical line); `reasons` the codes every language renders from (report.ts). */
function layoutUnsupportedFinding(file: string, layout: LayoutPlan): Finding {
  const params: Record<string, string> = { reason: layout.unsupported ?? '' };
  if (layout.unsupportedReasons) params.reasons = encodeReasons(layout.unsupportedReasons);
  return makeFinding('IN-LAYOUT-UNSUPPORTED', { file, params });
}

/**
 * Applies a confirmed mapping to a file and builds the Dataset the checks read.
 *
 * - wide: one DataRow per row. long: one DataRow per sample key (sample/core id, station, cruise, depth, date, time and
 *   in-sheet position, as raw text), DataRow.line = the line of its first measurement, each NumericCell keeps its own line;
 *   a repeated (sample, parameter) keeps the first value. join: position, date and station come from the lookup sheet
 *   (the join's `right`), DataRow.line stays the measurement row's line; a lookup row's own findings carry the lookup sheet.
 * - Values are parsed, never changed: out-of-range coordinates keep their number (the range rules report them),
 *   sign conventions are not flipped, a missing value is status 'missing' and raises nothing.
 * - Variable.key = the column header (prefixed `sheet!` when the layout has several tables, `#index` on a clash); for long
 *   tables the parameter name (`name [unit]` when one parameter carries several units).
 * - A mapping missing for a sheet is replaced by the proposals. `layout.unsupported` raises IN-LAYOUT-UNSUPPORTED and the
 *   tables that remain are still built. When a join supplies the position and the data names no station, station = sampleId.
 * Several independent tables (the sheets of a wide workbook) are better built one dataset each: see buildDatasets.
 */
export function buildDataset(
  file: ParsedFile,
  layout: LayoutPlan,
  mappings: SheetMapping[],
  metadata: MetadataRecord[],
  id: string,
  opts: BuildOptions = {},
): { dataset: Dataset; findings: Finding[] } {
  const collector = new Collector(file.fileName);
  const findings: Finding[] = [];
  if (layout.unsupported) findings.push(layoutUnsupportedFinding(file.fileName, layout));

  const namespace = layout.tables.length > 1;
  const rows: DataRow[] = [];
  const variables: Variable[] = [];
  const positives: ('down' | 'up' | 'unknown')[] = [];
  const usedSheets: string[] = [];
  const use = (name: string) => {
    if (!usedSheets.includes(name)) usedSheets.push(name);
  };

  for (const table of layout.tables) {
    const sheet = file.sheets.find((s) => s.name === table.sheet);
    if (!sheet) continue;
    use(sheet.name);
    const specs = specsOf(mappingFor(file, mappings, sheet, table.long));
    const lookup = makeLookup(file, layout, sheet.name, mappings, collector);
    if (lookup) use(layout.joins.find((j) => j.left === sheet.name)!.right);
    const built = table.long
      ? buildLong(file, sheet, table.long, specs, lookup, namespace, collector)
      : buildWide(file, sheet, specs, lookup, namespace, collector);
    for (const r of built.rows) rows.push(r);
    // META-NO-DATES (checks/metadata.ts) fires when neither a row nor a metadata record has a date: the empty-eventDate finding leaves that case to it
    const noDateSaid = !built.rows.some((r) => r.datetime !== undefined || (r.dateRaw !== undefined && r.dateRaw !== null && String(r.dateRaw).trim() !== '')) && !metadata.some((m) => m.temporalExtent && (m.temporalExtent.start || m.temporalExtent.end));
    findings.push(...checkRawTable(file, sheet, [specs.station, specs.cruise, specs.sampleId].filter((x): x is Spec => x !== undefined).map((x) => x.index), { noDateSaid }));
    variables.push(...built.variables);
    positives.push(...built.positives);
  }

  fillUnitsFromMetadata(variables, metadata);
  findings.push(...collector.findings());

  const used = usedSheets
    .map((name) => file.sheets.find((s) => s.name === name))
    .filter((s): s is RawSheet => s !== undefined)
    .map((s) => mappingFor(file, mappings, s, layout.tables.find((t) => t.sheet === s.name)?.long));

  let depthPositive: Dataset['depthPositive'] = 'unknown';
  if (positives.length > 0 && positives.every((p) => p === positives[0])) depthPositive = positives[0];

  const several = file.sheets.length > 1 || layout.tables.length > 1;
  const label = opts.label ?? (several ? `${file.fileName} (${layout.tables.map((t) => t.sheet).join(', ')})` : file.fileName);
  const dataset: Dataset = { id, label, file: file.fileName, rows, variables, mappings: used, layout, metadata, depthPositive, decimalComma: file.decimalComma };
  return { dataset, findings };
}

/**
 * One dataset per independent table (see splitLayout): ids `id` (one group) or `id:<sheet>`, label `file (sheet)` when the file
 * has several sheets. IN-LAYOUT-UNSUPPORTED is raised once; with no readable table the list is empty.
 */
export function buildDatasets(
  file: ParsedFile,
  layout: LayoutPlan,
  mappings: SheetMapping[],
  metadata: MetadataRecord[],
  id: string,
): { datasets: Dataset[]; findings: Finding[] } {
  const findings: Finding[] = [];
  if (layout.unsupported) findings.push(layoutUnsupportedFinding(file.fileName, layout));
  const groups = splitLayout(layout);
  // a sheet that is not built as a table (no position, no measurement, or another sheet of the workbook is the data): a Darwin Core sheet is still judged
  // (a workbook of an OBIS template has event, occurrence and emof sheets: the layout builds one of them as data, the Darwin Core
  // structure of every sheet is still judged here, whatever the layout did with it)
  const built = new Set(layout.tables.map((t) => t.sheet));
  for (const sheet of file.sheets) if (!built.has(sheet.name)) findings.push(...checkRawTable(file, sheet, []));
  const datasets: Dataset[] = [];
  for (const g of groups) {
    const sheet = g.tables[0].sheet;
    const label = file.sheets.length > 1 ? `${file.fileName} (${sheet})` : file.fileName;
    const r = buildDataset(file, g, mappings, metadata, groups.length === 1 ? id : `${id}:${sheet}`, { label });
    datasets.push(r.dataset);
    findings.push(...r.findings);
  }
  return { datasets, findings };
}
