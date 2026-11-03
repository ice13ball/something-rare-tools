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
import { makeFinding } from './rules/registryCheck';
import { dwcTermOf, isBlankCell, proposeColumns, toMapping, unitFromHeader } from './recognize/columns';
import { hemisphereBoundAgrees } from './recognize/headerWords';
import { monthOf } from './recognize/dateParts';
import { isVerticalCoordinateKey } from './recognize/geocodes';
import { splitLayout } from './recognize/layout';
import { encodeReasons } from './recognize/layoutReasons';
import { canonicalFromKey, headerKey, isCanonicalKey, normaliseUnit } from './recognize/vocab';
import { pairHemisphere, parseCoordinate } from './values/coords';
import { combineDateTime, detectDayMonthOrder, cellsAreYearRanges, fullDatetimeOfTimeCell, parseDate, parseTimeColumnCell, parseTimeOfDay } from './values/dates';
import type { DateError } from './values/dates';
import { parseNumber } from './values/numbers';
import { pushAll } from './util/arrays';
import { SUMMARY_LABEL_EN } from './summaryLabels';

/* ---------- findings collector ---------- */

type RowRuleId = 'ROW-LONG-VALUE-SKIPPED' | 'ROW-LONG-KEY-EXTENDED' | 'ROW-JOIN-AMBIGUOUS' | 'ROW-JOIN-KEY-BLANK' | 'ROW-DM-COORDS' | 'ROW-HEMISPHERE-CONFLICT' | 'ROW-HEMISPHERE-MISSING' | 'ROW-HEMISPHERE-UNPAIRED' | 'ROW-LON-360' | 'ROW-DATE-UNPARSEABLE' | 'ROW-TIME-OTHER-DAY' | 'ROW-DATE-YYMMDD' | 'ROW-TZ-UNKNOWN' | 'ROW-NON-NUMERIC' | 'ROW-NA-VARIANT';
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
  /** Columns of hemisphere letters for the mapped latitude / longitude column (S and W negate it). */
  latHemi?: Spec;
  lonHemi?: Spec;
  when?: Spec & { kind: 'date' | 'datetime' };
  time?: Spec;
  /** The columns of a date written as year, month and day (role datePart): combined into the date of the row when no date column is mapped. */
  dateParts?: { year?: Spec; month?: Spec; day?: Spec };
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
      case 'hemisphere':
        if (r.axis === 'latitude') s.latHemi ??= spec;
        else s.lonHemi ??= spec;
        break;
      case 'date':
      case 'datetime':
        s.when ??= { ...spec, kind: r.kind };
        break;
      case 'time':
        s.time ??= spec;
        break;
      case 'datePart':
        ((s.dateParts ??= {})[r.part] ??= spec);
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
      case 'replicate':
      case 'biomass':
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

/**
 * The date of a row from Year, Month and Day columns (role datePart): a year alone is a year, a year and a month a month, all three a day; a missing part is never made up. A cell that is
 * not a whole number in range, a day that the month does not have (1998-2-30) and a day or month without the part above it are not shifted into a date: `error` carries the text for
 * ROW-DATE-UNPARSEABLE. A row with no part at all has no date (undefined).
 */
export function composeDateParts(row: RawRow, parts: { year?: Spec; month?: Spec; day?: Spec }): ParsedDate | { error: string } | undefined {
  const cell = (s: Spec | undefined): RawCell => (s === undefined ? null : (row.cells[s.index] ?? null));
  const texts = [parts.year, parts.month, parts.day].map((s) => (isBlankCell(cell(s)) ? '' : String(cell(s)).trim()));
  const shown = texts.filter((t) => t !== '').join('-');
  if (texts.every((t) => t === '')) return undefined;
  const y = wholeNumber(cell(parts.year));
  if (texts[0] === '' || y === undefined || y < 1) return { error: shown };
  const p2 = (n: number): string => String(n).padStart(2, '0');
  const yy = String(y).padStart(4, '0');
  if (texts[1] === '') return texts[2] === '' ? { iso: yy, year: y, precision: 'year', tz: 'unknown' } : { error: shown };
  const mo = monthOf(cell(parts.month));
  if (mo === undefined) return { error: shown };
  if (texts[2] === '') return { iso: `${yy}-${p2(mo)}`, year: y, precision: 'month', tz: 'unknown' };
  const d = wholeNumber(cell(parts.day));
  const dim = new Date(Date.UTC(2000 + (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 0 : 1), mo, 0)).getUTCDate();
  if (d === undefined || d < 1 || d > dim) return { error: shown };
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
const SUMMARY_LABEL = SUMMARY_LABEL_EN;

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
export function metaParser(file: ParsedFile, sheet: RawSheet, specsIn: Specs, c: Collector, opts: { whenUtc?: boolean } = {}): (row: RawRow) => Meta {
  const dc = file.decimalComma;
  // "Year" chosen as the date while a month (and day) column is mapped as part of a date: the Year column IS the year of that date, so the combination is read and the day is not lost
  // (a date column whose cells are all whole years, beside a datePart month column)
  const specs: Specs = (() => {
    const w = specsIn.when;
    if (w === undefined || specsIn.dateParts === undefined || specsIn.dateParts.year !== undefined || specsIn.dateParts.month === undefined) return specsIn;
    const cells = sheet.rows.map((r) => r.cells[w.index] ?? null).filter((x) => !isBlankCell(x));
    const years = cells.filter((x) => wholeNumber(x) !== undefined && wholeNumber(x)! >= 1700).length;
    if (cells.length === 0 || years < cells.length * 0.9) return specsIn;
    const { when: _when, ...rest } = specsIn;
    return { ...rest, dateParts: { ...specsIn.dateParts, year: { index: w.index, header: w.header } } };
  })();
  const dateCache = new Map<string, ParsedDate | DateError>();
  const whenUtc = opts.whenUtc === true || (specs.when ? UTC_HEADER.test(specs.when.header) : false);
  const timeUtc = specs.time ? UTC_HEADER.test(specs.time.header) : false;
  // a "time" column whose values are mostly two years joined by a dash ("2001-2005") is not a column of times: no range is read from it (20:01-20:05 would be absurd)
  const timeCells = specs.time ? sheet.rows.map((r) => r.cells[specs.time!.index] ?? null).filter((x) => !isBlankCell(x)) : [];
  const timeIsYears = cellsAreYearRanges(timeCells);
  // D?M/YYYY order is a property of the column, not of a cell: decided once from every cell of the date column
  const whenIndex = specs.when?.index;
  // Darwin Core: where eventDate is empty, the same row's year / month / day columns give the date
  const dwcParts = specs.when && dwcTermOf(specs.when.header) === 'eventdate' ? dwcDateParts(sheet) : undefined;
  const whenOrder = whenIndex === undefined ? 'unknown' : detectDayMonthOrder(sheet.rows.map((r) => r.cells[whenIndex] ?? null));
  const timeOrder = specs.time ? detectDayMonthOrder(timeCells) : 'unknown';
  const dwcDepth = dwcDepthCols(sheet);

  // a hemisphere column signs its coordinate only while their start / end words agree with the CURRENT mapping (a user who moved the latitude from the
  // begin to the end column must not leave 'Beg Lat Dir' signing it); otherwise it is not applied, and one finding names the column
  const keyOf = (s: Spec): string => headerKey(unitFromHeader(s.header).name);
  const hemisphereFor = (coord: Spec | undefined, hemi: Spec | undefined): Spec | undefined => {
    if (!coord || !hemi) return undefined;
    if (hemisphereBoundAgrees(keyOf(hemi), keyOf(coord))) return hemi;
    c.add('ROW-HEMISPHERE-UNPAIRED', sheet.name, coord.header, 0, undefined, false, { hemisphere: hemi.header });
    return undefined;
  };
  const latHemi = hemisphereFor(specs.lat, specs.latHemi);
  const lonHemi = hemisphereFor(specs.lon, specs.lonHemi);

  const coordinate = (row: RawRow, spec: Spec, axis: 'lat' | 'lon', hemi?: Spec): { value: number; decimals: number } | undefined => {
    const written = row.cells[spec.index] ?? null;
    if (isBlankCell(written)) return undefined;
    // an unsigned value and the letter of its hemisphere column: S and W make it negative (a disagreement keeps the value as written and is reported)
    let cell = written;
    if (hemi) {
      const paired = pairHemisphere(written, row.cells[hemi.index] ?? null, axis);
      cell = paired.cell;
      if (paired.issue) c.add(paired.issue === 'conflict' ? 'ROW-HEMISPHERE-CONFLICT' : 'ROW-HEMISPHERE-MISSING', sheet.name, spec.header, row.line, String(written).trim(), true, { hemisphere: hemi.header });
    }
    const r = parseCoordinate(cell, axis, dc);
    if (!('error' in r)) {
      if (r.form !== 'decimal') c.add('ROW-DM-COORDS', sheet.name, spec.header, row.line, String(cell).trim(), false);
      if (r.normalised360) c.add('ROW-LON-360', sheet.name, spec.header, row.line, String(cell).trim());
      return { value: r.value, decimals: r.decimals };
    }
    // out of range or odd notation: keep a plain number as it is (the range rules report it), report the rest
    const p = parseNumber(cell, dc);
    if (p.status === 'ok') return { value: p.value, decimals: p.decimals };
    reportBadNumber(c, sheet.name, spec.header, row.line, written, dc);
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
      const r = coordinate(row, specs.lat, 'lat', latHemi);
      if (r) {
        m.lat = r.value;
        m.latDecimals = r.decimals;
      }
    }
    if (specs.lon) {
      const r = coordinate(row, specs.lon, 'lon', lonHemi);
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
            datumColumn: true,
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
          let timeCell = specs.time ? (row.cells[specs.time.index] ?? null) : null;
          if (specs.time && !isBlankCell(timeCell)) {
            const tOrder = timeOrder === 'unknown' ? undefined : timeOrder;
            const tField = specs.time.header;
            // the time column holds a full datetime (a text one, or the serial of a date-formatted column): a zone-stated one is the instant of the event and wins over a date (or a local datetime) that states no zone
            // (a local date beside a UTC time on the next day); one without a zone gives its time of day when it falls on the day of the row
            const full = timeIsYears ? undefined : fullDatetimeOfTimeCell(timeCell, { date1904: file.date1904, dateFormatted: sheet.dateFormatted?.[specs.time.index] === true && sheet.timeFormatted?.[specs.time.index] !== true, ...(tOrder === undefined ? {} : { order: tOrder }) });
            const dayGap = (a: string, b: string): number => Math.abs(Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`)) / 86_400_000;
            // compared at the date's own precision: a year-only or month-only date is contradicted by another year or month, a day by more than a day
            const own = date.precision === 'year' ? 4 : date.precision === 'month' ? 7 : 10;
            const farApart = full !== undefined && (own < 10 ? full.iso.slice(0, own) !== date.iso.slice(0, own) : dayGap(date.iso, full.iso) > 1);
            if (full !== undefined && full.tz !== 'unknown' && date.tz === 'unknown' && farApart) {
              // a zone-stated time a month away from the date column is two different days, not a local date beside a UTC time: neither is dropped in silence
              c.add('ROW-TIME-OTHER-DAY', sheet.name, tField, row.line, String(timeCell).trim(), true);
            } else if (full !== undefined && full.tz !== 'unknown' && date.tz === 'unknown') {
              date = full;
              tzField = tField;
            } else {
              if (full !== undefined && typeof timeCell === 'number') timeCell = full.iso;
              if ('error' in (timeIsYears ? parseTimeOfDay(timeCell) : parseTimeColumnCell(timeCell, date.iso.slice(0, 10), tOrder))) {
                // a full datetime of another day than the row's date cannot be cut to its time of day: said as what it is, not as an unreadable time
                if (full !== undefined) c.add('ROW-TIME-OTHER-DAY', sheet.name, tField, row.line, String(timeCell).trim(), true);
                else c.add('ROW-DATE-UNPARSEABLE', sheet.name, tField, row.line, String(timeCell).trim(), true, { role: 'time' });
              } else {
                date = combineDateTime(date, timeCell, tOrder);
                tzField = tField;
              }
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
    // no date on this row (no date column, or its cell is blank): the date of the row from its Year, Month and Day columns; a date that is there wins
    if (m.datetime === undefined && m.dateRaw === undefined && specs.dateParts?.year !== undefined) {
      const got = composeDateParts(row, specs.dateParts);
      if (got !== undefined && 'error' in got) c.add('ROW-DATE-UNPARSEABLE', sheet.name, specs.dateParts.year.header, row.line, got.error);
      else if (got !== undefined) {
        let date: ParsedDate = got;
        m.dateRaw = got.iso;
        const timeCell = specs.time ? (row.cells[specs.time.index] ?? null) : null;
        if (specs.time && !isBlankCell(timeCell) && date.precision === 'day') {
          const tOrder = timeOrder === 'unknown' ? undefined : timeOrder;
          if ('error' in (timeIsYears ? parseTimeOfDay(timeCell) : parseTimeColumnCell(timeCell, date.iso, tOrder))) c.add('ROW-DATE-UNPARSEABLE', sheet.name, specs.time.header, row.line, String(timeCell).trim(), true, { role: 'time' });
          else {
            date = combineDateTime(date, timeCell, tOrder);
            if (timeUtc) date = { ...date, tz: 'utc', iso: `${date.iso}Z` };
            else if (date.tz === 'unknown') c.add('ROW-TZ-UNKNOWN', sheet.name, specs.time.header, row.line, undefined, false);
          }
        }
        m.datetime = date;
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
  /**
   * The right row of each key value. 'ambiguous': several right rows hold the key and differ in position or date (none of them is taken). `depthless`: they agree on position and date and
   * differ only in depth (the position and date are lent, no depth).
   */
  rowsByKey: Map<string, { row: RawRow; depthless: boolean } | 'ambiguous'>;
  meta: (row: RawRow) => Meta;
  cache: Map<RawRow, Meta>;
  /** The key columns of the measurement sheet, in the order of the right key columns. */
  leftKeys: number[];
  /** What the key is called in a message: the left key headers joined with " + ". */
  keyName: string;
  sheetName: string;
  rightName: string;
  collector: Collector;
}

/** The parts of a row's key, or undefined when one of them is blank. */
const keyPartsOf = (row: RawRow, cols: readonly number[]): string[] | undefined => {
  const parts: string[] = [];
  for (const i of cols) {
    const v = str(row.cells[i] ?? null);
    if (v === undefined) return undefined;
    parts.push(v);
  }
  return parts;
};
const keyOf = (row: RawRow, cols: readonly number[]): string | undefined => {
  const parts = keyPartsOf(row, cols);
  return parts === undefined ? undefined : parts.length === 1 ? parts[0] : JSON.stringify(parts);
};

function makeLookup(file: ParsedFile, layout: LayoutPlan, sheetName: string, mappings: readonly SheetMapping[], c: Collector): Lookup | undefined {
  const join = layout.joins.find((j) => j.left === sheetName);
  if (!join) return undefined;
  const sheet = file.sheets.find((s) => s.name === join.right);
  if (!sheet) return undefined;
  const leftSheet = file.sheets.find((s) => s.name === sheetName);
  const leftKeys = [join.leftKey, ...(join.extraKeys ?? []).map((e) => e.leftKey)];
  const rightKeys = [join.rightKey, ...(join.extraKeys ?? []).map((e) => e.rightKey)];
  const specs = specsOf(mappingFor(file, mappings, sheet));
  const meta = metaParser(file, sheet, specs, c);
  // a key that several right rows hold is a key only when those rows say the same about position and date ("rows that truly repeat identically are fine"); otherwise no row is taken.
  // Rows that differ only in depth lend their position and date, and no depth.
  const quiet = metaParser(file, sheet, specs, new Collector(file.fileName));
  const placeOf = (r: RawRow): string => {
    const m = quiet(r);
    return JSON.stringify([m.lat ?? null, m.lon ?? null, m.datetime?.iso ?? null]);
  };
  const depthOf = (r: RawRow): string => {
    const m = quiet(r);
    return JSON.stringify([m.depth ?? null, m.depthMin ?? null, m.depthMax ?? null]);
  };
  const rowsByKey = new Map<string, { row: RawRow; depthless: boolean } | 'ambiguous'>();
  const places = new Map<string, string>();
  const depths = new Map<string, string>();
  for (const r of sheet.rows) {
    const k = keyOf(r, rightKeys);
    if (k === undefined) continue;
    const first = rowsByKey.get(k);
    if (first === undefined) {
      rowsByKey.set(k, { row: r, depthless: false });
      continue;
    }
    if (first === 'ambiguous') continue;
    if (!places.has(k)) {
      places.set(k, placeOf(first.row));
      depths.set(k, depthOf(first.row));
    }
    if (placeOf(r) !== places.get(k)) rowsByKey.set(k, 'ambiguous');
    else if (depthOf(r) !== depths.get(k)) rowsByKey.set(k, { row: first.row, depthless: true });
  }
  const header = (cols: readonly number[], s: RawSheet | undefined): string => cols.map((i) => s?.header[i] ?? `#${i + 1}`).join(' + ');
  return { rowsByKey, meta, cache: new Map(), leftKeys, keyName: header(leftKeys, leftSheet), sheetName, rightName: join.right, collector: c };
}

const DEPTH_FIELDS: (keyof Meta)[] = ['depth', 'depthDecimals', 'depthMin', 'depthMax'];

function withLookup(base: Meta, row: RawRow, lookup: Lookup | undefined): Meta {
  if (!lookup) return base;
  const parts = keyPartsOf(row, lookup.leftKeys);
  const k = parts === undefined ? undefined : parts.length === 1 ? parts[0] : JSON.stringify(parts);
  const hit = k === undefined ? undefined : lookup.rowsByKey.get(k);
  if (k === undefined && base.lat === undefined && row.cells.some((cell, i) => !lookup.leftKeys.includes(i) && !isBlankCell(cell))) {
    // a blank cell in the key: no row of the other sheet can be found, and the row would be left without a position in silence
    lookup.collector.add('ROW-JOIN-KEY-BLANK', lookup.sheetName, lookup.keyName, row.line, undefined, true, { right: lookup.rightName });
  }
  if (hit === 'ambiguous') {
    lookup.collector.add('ROW-JOIN-AMBIGUOUS', lookup.sheetName, lookup.keyName, row.line, parts === undefined ? k : parts.join(' + '), true, { right: lookup.rightName });
  } else if (hit) {
    let lm = lookup.cache.get(hit.row);
    if (!lm) lookup.cache.set(hit.row, (lm = lookup.meta(hit.row)));
    for (const f of META_FIELDS) {
      if (hit.depthless && DEPTH_FIELDS.includes(f)) continue;
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

/** Does the value cell `raw` differ from the value already kept (`keptRaw`)? A blank cell never differs; numbers compare as numbers, anything else as trimmed text. */
function longValueDiffers(raw: RawCell, keptRaw: RawCell | undefined, dc: boolean): boolean {
  if (isBlankCell(raw)) return false;
  const a = parseNumber(raw, dc);
  const b = parseNumber(keptRaw ?? null, dc);
  const same = a.status === 'ok' && b.status === 'ok' ? a.value === b.value : String(raw).trim() === String(keptRaw ?? '').trim();
  return !same;
}

/**
 * The unit of a row of a long sheet (the unit column, else the unit written in the parameter text, 'DIC [umol/kg]') and the key of its variable: the parameter alone, or 'parameter [unit]' when the
 * sheet gives that parameter in more than one unit. One definition for the grouping of buildLong and for the collisions extendLongKey looks for.
 */
function longVariables(sheet: RawSheet, plan: NonNullable<TablePlan['long']>): { unitOfRow: (r: RawRow, param: string) => string | undefined; baseKey: (r: RawRow, param: string) => string } {
  const unitOfRow = (r: RawRow, param: string): string | undefined => {
    const fromCol = plan.unitCol === undefined ? undefined : str(r.cells[plan.unitCol] ?? null);
    const t = fromCol ?? unitFromHeader(param).unitText;
    return t === undefined ? undefined : (normaliseUnit(t) ?? t);
  };
  const unitsOf = new Map<string, Set<string>>();
  for (const r of sheet.rows) {
    const param = str(r.cells[plan.parameterCol] ?? null);
    if (param === undefined) continue;
    const u = unitOfRow(r, param);
    if (!unitsOf.has(param)) unitsOf.set(param, new Set());
    if (u !== undefined) unitsOf.get(param)!.add(u);
  }
  const baseKey = (r: RawRow, param: string): string => {
    const units = unitsOf.get(param);
    const unit = units && units.size > 1 ? unitOfRow(r, param) : undefined;
    return unit !== undefined ? `${param} [${unit}]` : param;
  };
  return { unitOfRow, baseKey };
}

/**
 * Columns that must join the row key of a long sheet so that no two rows with the same key and parameter hold different values. Returns the added column indexes, or [] when none can be
 * used safely. A sheet with no differing collision costs one scan and returns [].
 *
 * A candidate column (outside the key and the parameter, unit and value columns, with a header) is acceptable only when
 *  - it is not unique on every row of the sheet (a record id, a note), and
 *  - in every key where it varies, each resulting row holds the same parameters as every other row of that key (rows keep the measurements of one thing together: a replicate, a level, a
 *    cast; a running number or a per-value flag cuts one measurement into rows of different parameters and is refused).
 * Among the acceptable ones, greedy: the column that fully resolves the most colliding (key, parameter) groups together with those already taken, ties by fewest distinct values. A tie on both
 * between two acceptable columns means nothing says which one is meant: neither is taken. When a collision in a key the chosen columns vary in stays unresolved, none is taken. Columns that
 * only separate the rows jointly (a cruise and a station, both needed) are not found.
 */
export function extendLongKey(sheet: RawSheet, plan: NonNullable<TablePlan['long']>, keyCols: number[], dc: boolean, paramKey?: (r: RawRow, param: string) => string): number[] {
  const rows = sheet.rows;
  const keyOfParam = paramKey ?? longVariables(sheet, plan).baseKey;
  const keys: (string | undefined)[] = new Array(rows.length);
  const idOf: (string | undefined)[] = new Array(rows.length);
  const first = new Map<string, number>();
  const colliding = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const param = str(r.cells[plan.parameterCol] ?? null);
    if (param === undefined) continue;
    const id = JSON.stringify(keyCols.map((c) => str(r.cells[c] ?? null) ?? ''));
    const pk = keyOfParam(r, param);
    const k = id + '\u0000' + pk;
    keys[i] = k;
    idOf[i] = id;
    const f = first.get(k);
    if (f === undefined) first.set(k, i);
    else if (!colliding.has(k) && longValueDiffers(r.cells[plan.valueCol] ?? null, rows[f].cells[plan.valueCol] ?? null, dc)) colliding.add(k);
  }
  if (colliding.size === 0) return [];

  const paramOf = (i: number): string => keys[i]!.slice(idOf[i]!.length + 1);
  const members = new Map<string, number[]>();
  const rowsOfId = new Map<string, number[]>();
  let n = 0;
  for (let i = 0; i < rows.length; i++) {
    const k = keys[i];
    if (k === undefined) continue;
    n++;
    const byId = rowsOfId.get(idOf[i]!);
    if (byId) byId.push(i);
    else rowsOfId.set(idOf[i]!, [i]);
    if (!colliding.has(k)) continue;
    const list = members.get(k);
    if (list) list.push(i);
    else members.set(k, [i]);
  }
  let remaining = [...members.values()];
  const skip = new Set<number>([...longColumns(plan), ...keyCols]);
  const cell = (i: number, c: number): string => str(rows[i].cells[c] ?? null) ?? '';
  const valueOf = (i: number): RawCell => rows[i].cells[plan.valueCol] ?? null;
  const classOf = (i: number, cols: number[]): string => (cols.length === 1 ? cell(i, cols[0]) : JSON.stringify(cols.map((c) => cell(i, c))));
  /** True when, within the group, no two rows that agree on `cols` hold different values. */
  const resolves = (group: number[], cols: number[]): boolean => {
    const rep = new Map<string, number>();
    for (const i of group) {
      const id = classOf(i, cols);
      const j = rep.get(id);
      if (j === undefined) rep.set(id, i);
      else if (longValueDiffers(valueOf(i), valueOf(j), dc)) return false;
    }
    return true;
  };
  /** In every key where `cols` vary, each resulting row holds the same parameters as every other. */
  const keepsMeasurementsTogether = (cols: number[]): boolean => {
    for (const list of rowsOfId.values()) {
      const params = new Map<string, Set<string>>();
      for (const i of list) {
        const cls = classOf(i, cols);
        const set = params.get(cls);
        if (set) set.add(paramOf(i));
        else params.set(cls, new Set([paramOf(i)]));
      }
      if (params.size < 2) continue;
      let want: string | undefined;
      for (const set of params.values()) {
        const sig = [...set].sort().join('\u0001');
        if (want === undefined) want = sig;
        else if (sig !== want) return false;
      }
    }
    return true;
  };
  const isUnique = (c: number): boolean => {
    const all = new Set<string>();
    for (const list of rowsOfId.values()) for (const i of list) all.add(cell(i, c));
    return all.size === n;
  };
  const candidates = sheet.header.map((_, i) => i).filter((i) => !skip.has(i) && sheet.header[i].trim() !== '' && !isUnique(i));

  const chosen: number[] = [];
  while (remaining.length > 0) {
    let best: { c: number; count: number; distinct: number } | undefined;
    let tied = false;
    for (const c of candidates) {
      if (chosen.includes(c)) continue;
      const cols = [...chosen, c];
      let count = 0;
      for (const g of remaining) if (resolves(g, cols)) count++;
      if (count === 0 || !keepsMeasurementsTogether(cols)) continue;
      const seen = new Set<string>();
      for (const g of remaining) for (const i of g) seen.add(cell(i, c));
      if (!best || count > best.count || (count === best.count && seen.size < best.distinct)) {
        best = { c, count, distinct: seen.size };
        tied = false;
      } else if (count === best.count && seen.size === best.distinct) tied = true;
    }
    if (!best) break;
    if (tied) return [];
    chosen.push(best.c);
    const cols = [...chosen];
    remaining = remaining.filter((g) => !resolves(g, cols));
  }
  if (chosen.length === 0) return [];
  // a collision in a key the chosen columns vary in that they do not resolve: the columns are not what tells these rows apart
  for (const g of remaining) {
    const list = rowsOfId.get(idOf[g[0]]!)!;
    if (new Set(list.map((i) => classOf(i, chosen))).size > 1) return [];
  }
  return chosen;
}

function buildLong(file: ParsedFile, sheet: RawSheet, plan: NonNullable<TablePlan['long']>, specs: Specs, lookup: Lookup | undefined, namespace: boolean, c: Collector): Built {
  const dc = file.decimalComma;
  const parse = metaParser(file, sheet, specs, c);
  const skip = new Set(longColumns(plan));
  const keyCols = [specs.sampleId, specs.station, specs.cruise, specs.depth, specs.when, specs.dateParts?.year, specs.dateParts?.month, specs.dateParts?.day, specs.time, specs.lat, specs.lon]
    .filter((s): s is Spec => s !== undefined && !skip.has(s.index))
    .map((s) => s.index);
  // A column that places the measurement vertically but is not the depth slot (a sediment depth, an ice depth, a depth bottom: recognize/geocodes.ts) is part of the row too: two levels of one core are
  // two rows, not one row whose later values are dropped.
  sheet.header.forEach((h, i) => {
    if (!skip.has(i) && !keyCols.includes(i) && isVerticalCoordinateKey(headerKey(unitFromHeader(h).name))) keyCols.push(i);
  });

  // units per parameter, from the unit column (or from the parameter text itself, 'DIC [umol/kg]')
  const { unitOfRow, baseKey } = longVariables(sheet, plan);
  const varKey = (r: RawRow, param: string): string => (namespace ? `${sheet.name}!${baseKey(r, param)}` : baseKey(r, param));

  // A column that tells colliding rows apart (a pressure, a replicate, a cast, a layer) joins the key, so every value is read: said once (ROW-LONG-KEY-EXTENDED)
  const added = extendLongKey(sheet, plan, keyCols, dc, baseKey);
  if (added.length > 0) {
    keyCols.push(...added);
    c.add('ROW-LONG-KEY-EXTENDED', sheet.name, '', 0, undefined, false, { columns: added.map((i) => sheet.header[i]).join(', '), count: added.length });
  }

  const variables = new Map<string, Variable>();
  const groups = new Map<string, DataRow>();
  const rows: DataRow[] = [];
  const skippedDiffer: number[] = [];
  let skippedExample: string | undefined;
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
    const key = varKey(r, param);
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
    const kept = row.values[key];
    if (kept !== undefined) {
      // duplicate (sample, parameter): the first one stays, nothing is averaged. A value that differs from the kept one was not read: said once at the end (ROW-LONG-VALUE-SKIPPED)
      if (longValueDiffers(r.cells[plan.valueCol] ?? null, kept.raw, dc)) {
        skippedDiffer.push(r.line);
        skippedExample ??= param;
      }
      continue;
    }
    row.values[key] = numericCell(r.cells[plan.valueCol] ?? null, r.line, param, sheet.name, dc, c);
  }
  for (const line of skippedDiffer) c.add('ROW-LONG-VALUE-SKIPPED', sheet.name, skippedExample ?? '', line, undefined, true, { count: skippedDiffer.length });
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
    pushAll(findings, checkRawTable(file, sheet, [specs.station, specs.cruise, specs.sampleId].filter((x): x is Spec => x !== undefined).map((x) => x.index), { noDateSaid }));
    pushAll(variables, built.variables);
    pushAll(positives, built.positives);
  }

  fillUnitsFromMetadata(variables, metadata);
  pushAll(findings, collector.findings());
  // a join that left rows without a position or date (the key matches several rows of the other sheet): META-NO-DATES / META-NO-POSITIONS of this table name the cause
  const joinLost = findings.find((f) => f.ruleId === 'ROW-JOIN-AMBIGUOUS')?.params.right;

  const used = usedSheets
    .map((name) => file.sheets.find((s) => s.name === name))
    .filter((s): s is RawSheet => s !== undefined)
    .map((s) => mappingFor(file, mappings, s, layout.tables.find((t) => t.sheet === s.name)?.long));

  let depthPositive: Dataset['depthPositive'] = 'unknown';
  if (positives.length > 0 && positives.every((p) => p === positives[0])) depthPositive = positives[0];

  const several = file.sheets.length > 1 || layout.tables.length > 1;
  const label = opts.label ?? (several ? `${file.fileName} (${layout.tables.map((t) => t.sheet).join(', ')})` : file.fileName);
  const dataset: Dataset = { id, label, file: file.fileName, rows, variables, mappings: used, layout, metadata, depthPositive, decimalComma: file.decimalComma, ...(typeof joinLost === 'string' ? { joinLost } : {}) };
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
  for (const sheet of file.sheets) if (!built.has(sheet.name)) pushAll(findings, checkRawTable(file, sheet, []));
  const datasets: Dataset[] = [];
  for (const g of groups) {
    const sheet = g.tables[0].sheet;
    const label = file.sheets.length > 1 ? `${file.fileName} (${sheet})` : file.fileName;
    const r = buildDataset(file, g, mappings, metadata, groups.length === 1 ? id : `${id}:${sheet}`, { label });
    datasets.push(r.dataset);
    pushAll(findings, r.findings);
  }
  return { datasets, findings };
}
