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
import { makeFinding } from './rules/registry';
import { isBlankCell, proposeColumns, toMapping, unitFromHeader } from './recognize/columns';
import { splitLayout } from './recognize/layout';
import { canonicalFromKey, headerKey, isCanonicalKey, normaliseUnit } from './recognize/vocab';
import { parseCoordinate } from './values/coords';
import { combineDateTime, parseDate, parseTimeOfDay } from './values/dates';
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
}

class Collector {
  private readonly accs = new Map<string, Acc>();
  constructor(private readonly file: string) {}

  add(ruleId: RowRuleId, sheet: string, field: string, line: number, value?: string, withLines = true): void {
    const key = `${ruleId}\u0000${sheet}\u0000${field}`;
    let acc = this.accs.get(key);
    if (!acc) this.accs.set(key, (acc = { ruleId, sheet, field, lines: new Set(), values: [], withLines }));
    if (withLines) acc.lines.add(line);
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
      }),
    );
  }
}

/* ---------- mapping helpers ---------- */

type VariableRole = Extract<ColumnRole, { kind: 'variable' }>;
interface Spec {
  index: number;
  header: string;
}
interface Specs {
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

function specsOf(mapping: SheetMapping): Specs {
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

interface Meta {
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
}
const META_FIELDS: (keyof Meta)[] = ['lat', 'lon', 'latDecimals', 'lonDecimals', 'datetime', 'dateRaw', 'depth', 'depthDecimals', 'station', 'cruise', 'sampleId'];

function reportBadNumber(c: Collector, sheet: string, field: string, line: number, raw: RawCell, decimalComma: boolean): void {
  const p = parseNumber(raw, decimalComma);
  if (p.status === 'na-variant') c.add('ROW-NA-VARIANT', sheet, field, line, p.token);
  else if (p.status === 'non-numeric') c.add('ROW-NON-NUMERIC', sheet, field, line, p.token);
}

function metaParser(file: ParsedFile, sheet: RawSheet, specs: Specs, c: Collector): (row: RawRow) => Meta {
  const dc = file.decimalComma;
  const dateCache = new Map<string, ParsedDate | DateError>();
  const whenUtc = specs.when ? UTC_HEADER.test(specs.when.header) : false;
  const timeUtc = specs.time ? UTC_HEADER.test(specs.time.header) : false;

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
      if (!isBlankCell(cell)) {
        m.dateRaw = cell;
        const cacheKey = typeof cell === 'number' ? `n${cell}` : `s${cell}`;
        let d = dateCache.get(cacheKey);
        if (d === undefined) {
          d = parseDate(cell, { date1904: file.date1904, dateFormatted: sheet.dateFormatted?.[specs.when.index] === true });
          dateCache.set(cacheKey, d);
        }
        if ('error' in d) {
          c.add('ROW-DATE-UNPARSEABLE', sheet.name, specs.when.header, row.line, String(cell).trim());
        } else {
          let date: ParsedDate = d;
          let tzField = specs.when.header;
          if (date.ambiguity === 'yy-mm-dd') c.add('ROW-DATE-YYMMDD', sheet.name, specs.when.header, row.line, String(cell).trim(), false);
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
  // positions come from a table of cores / sites: when the data carries no station column the core id names the site
  if (base.station === undefined && base.sampleId !== undefined) base.station = base.sampleId;
  return base;
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
    const row: DataRow = { file: file.fileName, sheet: sheet.name, line: r.line, ...withLookup(parse(r), r, lookup), values: {} };
    for (const { v, key } of cols) row.values[key] = numericCell(r.cells[v.index] ?? null, r.line, v.header, sheet.name, dc, c);
    rows.push(row);
  }
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
      row = { file: file.fileName, sheet: sheet.name, line: r.line, ...withLookup(parse(r), r, lookup), values: {} };
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
  if (layout.unsupported) findings.push(makeFinding('IN-LAYOUT-UNSUPPORTED', { file: file.fileName, params: { reason: layout.unsupported } }));

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
  const dataset: Dataset = { id, label, file: file.fileName, rows, variables, mappings: used, layout, metadata, depthPositive };
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
  if (layout.unsupported) findings.push(makeFinding('IN-LAYOUT-UNSUPPORTED', { file: file.fileName, params: { reason: layout.unsupported } }));
  const groups = splitLayout(layout);
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
