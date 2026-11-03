// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type {
  ColumnRole,
  DataRow,
  Dataset,
  ExtraKeyColumn,
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
import { isYearName, monthOf } from './recognize/dateParts';
import { isVerticalCoordinateKey } from './recognize/geocodes';
import { splitLayout } from './recognize/layout';
import { encodeReasons } from './recognize/layoutReasons';
import { canonicalFromKey, headerKey, isCanonicalKey, normaliseUnit } from './recognize/vocab';
import { pairHemisphere, parseCoordinate } from './values/coords';
import { combineDateTime, detectDayMonthOrder, cellsAreYearRanges, fullDatetimeOfTimeCell, isPlausibleSerial, parseDate, parseTimeColumnCell, parseTimeOfDay } from './values/dates';
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
  /** Columns with the pressure role: the clean CSV keeps them (the value itself is not read by any check). */
  pressure?: (Spec & { unit?: string })[];
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
      case 'pressure':
        (s.pressure ??= []).push(r.unit === undefined ? spec : { ...spec, unit: r.unit });
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
export function metaParser(file: ParsedFile, sheet: RawSheet, specsIn: Specs, c: Collector, opts: { whenUtc?: boolean; fields?: boolean } = {}): MetaParser {
  const dc = file.decimalComma;
  // The record the clean CSV's list of left-out columns comes from, kept per CELL: for each column that feeds a field of the output, how many of its non-blank cells there were and how many gave
  // something (`cells`). `rowCols` holds the columns that gave something on the row being parsed; `reads` (only with opts.fields: a lookup sheet) says which field each of them gave.
  const rowCols: number[] = [];
  const reads = new Map<keyof Meta, number[]>();
  const note = (field: keyof Meta, ...cols: (number | undefined)[]): void => {
    for (const i of cols) if (i !== undefined) rowCols.push(i);
    if (opts.fields !== true) return;
    const list = reads.get(field) ?? [];
    for (const i of cols) if (i !== undefined && !list.includes(i)) list.push(i);
    reads.set(field, list);
  };
  const cells = new Map<number, { filled: number; used: number }>();
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

  const parseBody = (row: RawRow): Meta => {
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
        note('lat', specs.lat.index, latHemi?.index);
      }
    }
    if (specs.lon) {
      const r = coordinate(row, specs.lon, 'lon', lonHemi);
      if (r) {
        m.lon = r.value;
        m.lonDecimals = r.decimals;
        note('lon', specs.lon.index, lonHemi?.index);
      }
    }
    if (specs.when) {
      const cell = row.cells[specs.when.index] ?? null;
      if (isBlankCell(cell) && dwcParts) {
        const d = composeYmd(row, dwcParts);
        if (d) {
          m.datetime = d;
          m.dateRaw = d.iso;
          note('datetime', dwcParts.year, dwcParts.month, dwcParts.day);
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
          // the date column is credited unless a zone-stated time replaces the date altogether (its day is then gone)
          let whenKept = true;
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
              // the time replaces the date; the date column is credited only when the kept date falls on the day (month, year) the date cell states
              whenKept = full.iso.slice(0, own) === d.iso.slice(0, own);
              note('datetime', specs.time.index);
            } else {
              if (full !== undefined && typeof timeCell === 'number') timeCell = full.iso;
              if ('error' in (timeIsYears ? parseTimeOfDay(timeCell) : parseTimeColumnCell(timeCell, date.iso.slice(0, 10), tOrder))) {
                // a full datetime of another day than the row's date cannot be cut to its time of day: said as what it is, not as an unreadable time
                if (full !== undefined) c.add('ROW-TIME-OTHER-DAY', sheet.name, tField, row.line, String(timeCell).trim(), true);
                else c.add('ROW-DATE-UNPARSEABLE', sheet.name, tField, row.line, String(timeCell).trim(), true, { role: 'time' });
              } else {
                date = combineDateTime(date, timeCell, tOrder);
                tzField = tField;
                note('datetime', specs.time.index);
              }
            }
          }
          if ((date.precision === 'minute' || date.precision === 'second') && date.tz === 'unknown') {
            if (whenUtc || timeUtc) date = { ...date, tz: 'utc', iso: `${date.iso}Z` };
            else c.add('ROW-TZ-UNKNOWN', sheet.name, tzField, row.line, undefined, false);
          }
          if (whenKept) note('datetime', specs.when.index);
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
        for (const part of [specs.dateParts.year, specs.dateParts.month, specs.dateParts.day]) if (part !== undefined && !isBlankCell(row.cells[part.index] ?? null)) note('datetime', part.index);
        const timeCell = specs.time ? (row.cells[specs.time.index] ?? null) : null;
        if (specs.time && !isBlankCell(timeCell) && date.precision === 'day') {
          const tOrder = timeOrder === 'unknown' ? undefined : timeOrder;
          if ('error' in (timeIsYears ? parseTimeOfDay(timeCell) : parseTimeColumnCell(timeCell, date.iso, tOrder))) c.add('ROW-DATE-UNPARSEABLE', sheet.name, specs.time.header, row.line, String(timeCell).trim(), true, { role: 'time' });
          else {
            date = combineDateTime(date, timeCell, tOrder);
            note('datetime', specs.time.index);
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
          note('depth', specs.depth.index);
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
      if (p.status === 'ok') m[key] = p.value; // not written by the clean CSV: no column is credited with it
      else if (spec.index !== specs.depth?.index) reportBadNumber(c, sheet.name, spec.header, row.line, cell, dc);
    }
    const station = specs.station ? str(row.cells[specs.station.index] ?? null) : undefined;
    const cruise = specs.cruise ? str(row.cells[specs.cruise.index] ?? null) : undefined;
    const sampleId = specs.sampleId ? str(row.cells[specs.sampleId.index] ?? null) : undefined;
    if (station !== undefined) {
      m.station = station;
      note('station', specs.station!.index);
    }
    if (cruise !== undefined) {
      m.cruise = cruise;
      note('cruise', specs.cruise!.index);
    }
    if (sampleId !== undefined) {
      m.sampleId = sampleId;
      note('sampleId', specs.sampleId!.index);
    }
    return m;
  };
  // the columns that feed a field of the output: every non-blank cell of one either gave something or did not
  const tracked = [...new Set([specs.lat, specs.lon, latHemi, lonHemi, specs.when, specs.time, specs.dateParts?.year, specs.dateParts?.month, specs.dateParts?.day, specs.depth, specs.station, specs.cruise, specs.sampleId]
    .filter((x): x is Spec => x !== undefined).map((x) => x.index).concat(dwcParts ? [dwcParts.year, ...(dwcParts.month === undefined ? [] : [dwcParts.month]), ...(dwcParts.day === undefined ? [] : [dwcParts.day])] : []))];
  for (const i of tracked) cells.set(i, { filled: 0, used: 0 });
  const parseRow = (row: RawRow): Meta => {
    rowCols.length = 0;
    if (opts.fields === true) reads.clear();
    const m = parseBody(row);
    for (const i of tracked) {
      if (isBlankCell(row.cells[i] ?? null)) continue;
      const st = cells.get(i)!;
      st.filled++;
      if (rowCols.includes(i)) st.used++;
    }
    return m;
  };
  return Object.assign(parseRow, { reads: reads as ReadonlyMap<keyof Meta, readonly number[]>, cells: cells as ReadonlyMap<number, { filled: number; used: number }>, tracked });
}

/** The columns of which EVERY non-blank cell gave something to the output (a column with one cell that gave nothing, or with no cell at all, is not carried). */
function carriedBy(cells: ReadonlyMap<number, { filled: number; used: number }>): Set<number> {
  const out = new Set<number>();
  for (const [i, st] of cells) if (st.filled > 0 && st.used === st.filled) out.add(i);
  return out;
}

/** metaParser's result: the row parser, and the source columns that gave each field of the last row it parsed. */
export type MetaParser = ((row: RawRow) => Meta) & { reads: ReadonlyMap<keyof Meta, readonly number[]>; cells: ReadonlyMap<number, { filled: number; used: number }>; tracked: readonly number[] };

/** The field a lookup field is read with: the decimals of a coordinate come from its column, the raw text of a date from the date's columns. */
const READ_ALIAS: Partial<Record<keyof Meta, keyof Meta>> = { latDecimals: 'lat', lonDecimals: 'lon', dateRaw: 'datetime', depthDecimals: 'depth' };
function readsFor(reads: ReadonlyMap<keyof Meta, readonly number[]>, field: keyof Meta): readonly number[] {
  return reads.get(field) ?? reads.get(READ_ALIAS[field] as keyof Meta) ?? [];
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
  /** Source columns whose cells the rows carry in `keyCells` (see ExtraKeyColumn). */
  extra: ExtraKeyColumn[];
  /** The source columns whose every non-blank cell gave something to the output, by sheet: this sheet's, and the lookup sheet's columns that lent a value from every joined row they have one in. */
  reads: Map<string, Set<number>>;
  /** Columns only partly carried, by sheet: how many of their non-blank cells gave a value. */
  partial: Map<string, Map<number, PartialCount>>;
  /** The Year column beside the date column of this sheet, if there is one (its cells are on `DataRow.yearCell`). */
  year?: { index: number; header: string; date: string };
}

/**
 * A Year column that stands BESIDE a date column: the column the mapping reads as the year of a date (role datePart year) or a column headed Year (or the Darwin Core term `year`), when the sheet
 * also has a date column. A sheet whose date is built from the year, month and day columns has no date column and so no such pair, and a whole-year date column is its own year.
 */
function yearColumnOf(sheet: RawSheet, specs: Specs): { index: number; header: string; date: string } | undefined {
  const when = specs.when;
  if (when === undefined) return undefined;
  let found: number | undefined = specs.dateParts?.year?.index;
  if (found === undefined) found = sheet.header.findIndex((h, i) => i !== when.index && (isYearName(headerKey(unitFromHeader(h).name)) || dwcTermOf(h) === 'year'));
  if (found === undefined || found < 0 || found === when.index) return undefined;
  return { index: found, header: sheet.header[found] ?? '', date: when.header };
}

/**
 * The columns of one sheet that the clean CSV keeps beside the fixed ones: its pressure columns and the key columns no fixed column carries (`keys`), each once, in the order of the sheet.
 * `skip` holds the columns that already have another place (the parameter, unit and value columns of a long sheet, the variables of a wide one).
 */
function extraColumnsOf(sheet: RawSheet, pressure: readonly (Spec & { unit?: string })[], keys: readonly number[], skip: ReadonlySet<number>): ExtraKeyColumn[] {
  const picked = new Map<number, { kind: ExtraKeyColumn['kind']; unit?: string }>();
  for (const p of pressure) if (!skip.has(p.index) && !picked.has(p.index)) picked.set(p.index, { kind: 'pressure', ...(p.unit === undefined ? {} : { unit: p.unit }) });
  for (const i of keys) if (!skip.has(i) && !picked.has(i)) picked.set(i, { kind: 'key' });
  const ids = new Set<string>();
  const out: ExtraKeyColumn[] = [];
  for (const index of [...picked.keys()].sort((a, b) => a - b)) {
    const header = sheet.header[index] ?? '';
    if (header.trim() === '') continue;
    // a header the sheet repeats gets its index, so the two columns stay two
    let id = header;
    if (ids.has(id)) id = `${header}#${index}`;
    ids.add(id);
    const kind = picked.get(index)!.kind;
    const numeric = kind === 'pressure' || isVerticalCoordinateKey(headerKey(unitFromHeader(header).name));
    out.push({ header, index, sheet: sheet.name, id, kind, ...(picked.get(index)!.unit === undefined ? {} : { unit: picked.get(index)!.unit }), ...(numeric ? { numeric: true as const } : {}) });
  }
  return out;
}

/**
 * What a sheet's build carried: its own columns (`own`), and the lookup sheet's columns whose value reached the output from every joined row that has one. A key of the join counts only when the
 * column it is matched with on the measurement sheet reached the output (the same values then did too).
 */
/** How many non-blank cells of a column gave a value to the output, and in what unit the count is (`cells` of a wide sheet, `rows` of a long sheet, `joined cells` of a lookup sheet). */
type PartialCount = { used: number; filled: number; unit?: string };

function readsOf(sheet: RawSheet, own: Set<number>, ownPartial: Map<number, PartialCount>, lookup: Lookup | undefined): Pick<Built, 'reads' | 'partial'> {
  for (const i of own) ownPartial.delete(i);
  const reads = new Map<string, Set<number>>([[sheet.name, own]]);
  const partial = new Map<string, Map<number, PartialCount>>([[sheet.name, ownPartial]]);
  if (!lookup) return { reads, partial };
  const carried = new Set<number>();
  const lookupPartial = new Map<number, PartialCount>();
  for (const [col, used] of lookup.usedRows) {
    let filled = 0;
    let given = 0;
    for (const r of lookup.hitRows) {
      const cell = r.cells[col] ?? null;
      if (isBlankCell(cell)) continue;
      filled++;
      if (used.has(r)) {
        given++;
        continue;
      }
      // an identical repeat of the cell of the row that was taken gave nothing new and is not lost
      const t = lookup.takenFor.get(r);
      if (t !== undefined && used.has(t) && String(t.cells[col] ?? '').trim() === String(cell).trim()) given++;
    }
    if (filled > 0 && given === filled) carried.add(col);
    else if (given > 0) lookupPartial.set(col, { used: given, filled, unit: 'joined cells' });
  }
  lookup.rightKeys.forEach((k, n) => {
    if (own.has(lookup.leftKeys[n])) carried.add(k);
  });
  for (const i of carried) lookupPartial.delete(i);
  reads.set(lookup.rightName, carried);
  partial.set(lookup.rightName, lookupPartial);
  return { reads, partial };
}

/** The columns of which some, not all, non-blank cells gave something (`extraFilled`: cells of a merged source row that gave nothing). */
function partialOf(cells: ReadonlyMap<number, { filled: number; used: number }>, carried: ReadonlySet<number>, unit: string | undefined, extraFilled?: ReadonlyMap<number, number>): Map<number, PartialCount> {
  const out = new Map<number, PartialCount>();
  for (const [i, st] of cells) {
    if (carried.has(i) && !extraFilled?.has(i)) continue;
    const filled = st.filled + (extraFilled?.get(i) ?? 0);
    if (st.used > 0 && st.used < filled) out.set(i, { used: st.used, filled, ...(unit === undefined ? {} : { unit }) });
  }
  return out;
}

/**
 * The columns the person set to `ignore` on purpose: the mapping given to the build says ignore and the proposal for that column does not (a column that is `ignore` by default, a replicate or a
 * cast, is not one of them). Empty when the sheet has no given mapping.
 */
function explicitlyIgnored(file: ParsedFile, mappings: readonly SheetMapping[], sheet: RawSheet, long?: TablePlan['long']): Set<number> {
  const given = mappings.find((m) => m.sheet === sheet.name);
  const out = new Set<number>();
  if (!given) return out;
  const proposed = proposeColumns(sheet, { decimalComma: file.decimalComma, date1904: file.date1904, ...(long ? { long } : {}) });
  for (const c of given.columns) if (c.role.kind === 'ignore' && proposed.find((p) => p.index === c.index)?.role.kind !== 'ignore') out.add(c.index);
  return out;
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
  meta: MetaParser;
  cache: Map<RawRow, { meta: Meta; reads: ReadonlyMap<keyof Meta, readonly number[]> }>;
  /** For each column of the right sheet, the right rows whose cell gave a value to a row of the left sheet, and the right rows any left row was joined to. */
  usedRows: Map<number, Set<RawRow>>;
  /** Every right row of a key some left row was joined to (or that was found ambiguous): all of them are judged, not only the one that was taken. */
  hitRows: Set<RawRow>;
  /** For each judged right row, the row that was taken for its key (undefined: none, the key was ambiguous). */
  takenFor: Map<RawRow, RawRow | undefined>;
  rowsOfKey: Map<string, RawRow[]>;
  keysJudged: Set<string>;
  /** The key columns of the measurement sheet, in the order of the right key columns. */
  leftKeys: number[];
  /** The key columns of the lookup sheet: read to find the row, whatever else they are. */
  rightKeys: number[];
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
  const meta = metaParser(file, sheet, specs, c, { fields: true });
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
  const rowsOfKey = new Map<string, RawRow[]>();
  for (const r of sheet.rows) {
    const k = keyOf(r, rightKeys);
    if (k === undefined) continue;
    const all = rowsOfKey.get(k);
    if (all) all.push(r);
    else rowsOfKey.set(k, [r]);
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
  return { rowsByKey, meta, cache: new Map(), usedRows: new Map(), hitRows: new Set(), takenFor: new Map(), rowsOfKey, keysJudged: new Set(), leftKeys, rightKeys, keyName: header(leftKeys, leftSheet), sheetName, rightName: join.right, collector: c };
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
  if (k !== undefined && !lookup.keysJudged.has(k)) {
    lookup.keysJudged.add(k);
    const taken = hit === undefined || hit === 'ambiguous' ? undefined : hit.row;
    for (const r of lookup.rowsOfKey.get(k) ?? []) {
      lookup.hitRows.add(r);
      lookup.takenFor.set(r, taken);
    }
  }
  if (hit === 'ambiguous') {
    lookup.collector.add('ROW-JOIN-AMBIGUOUS', lookup.sheetName, lookup.keyName, row.line, parts === undefined ? k : parts.join(' + '), true, { right: lookup.rightName });
  } else if (hit) {
    let lm = lookup.cache.get(hit.row);
    if (!lm) {
      const meta = lookup.meta(hit.row);
      lookup.cache.set(hit.row, (lm = { meta, reads: new Map([...lookup.meta.reads].map(([k, v]) => [k, [...v]])) }));
    }
    for (const f of META_FIELDS) {
      if (hit.depthless && DEPTH_FIELDS.includes(f)) continue;
      if (base[f] === undefined && lm.meta[f] !== undefined) {
        (base as Record<string, unknown>)[f] = lm.meta[f];
        for (const col of readsFor(lm.reads, f)) {
          const rows = lookup.usedRows.get(col) ?? new Set<RawRow>();
          rows.add(hit.row);
          lookup.usedRows.set(col, rows);
        }
      }
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
  const own = new Set(specs.vars.map((v) => v.index));
  const extra = extraColumnsOf(sheet, specs.pressure ?? [], [], own);
  const year = yearColumnOf(sheet, specs);
  for (const r of sheet.rows) {
    const meta = parse(r);
    const row: DataRow = { file: file.fileName, sheet: sheet.name, line: r.line, ...withLookup(meta, r, lookup), values: newValues() };
    if (year) {
      const yc = r.cells[year.index] ?? null;
      if (!isBlankCell(yc)) row.yearCell = yc;
    }
    for (const { v, key } of cols) row.values[key] = numericCell(r.cells[v.index] ?? null, r.line, v.header, sheet.name, dc, c);
    if (extra.length > 0) {
      row.keyCells = newValues() as unknown as Record<string, RawCell>;
      for (const e of extra) row.keyCells[e.id] = r.cells[e.index] ?? null;
    }
    rows.push(row);
  }
  clearInheritedPositions(sheet, rows);
  const carriedWide = carriedBy(parse.cells);
  for (const i of carriedWide) own.add(i);
  for (const e of extra) own.add(e.index);
  return { rows, variables, positives: specs.depth ? [specs.depth.positive] : [], extra, ...readsOf(sheet, own, partialOf(parse.cells, carriedWide, undefined), lookup), ...(year ? { year } : {}) };
}

/** A kept value that is blank or a plain missing token (NA, N/A, NaN, -, null) gives way to the first value after it; 'nd', 'n.d.', 'ND' mean not detected, which is a result, and do not. */
const NOT_DETECTED = new Set(['nd', 'n.d.', 'ND']);
function givesWay(raw: RawCell): boolean {
  if (!isBlankCell(raw)) return false;
  return !(typeof raw === 'string' && NOT_DETECTED.has(raw.trim()));
}

/** Does the value cell `raw` differ from the value already kept (`keptRaw`)? A blank cell never differs; numbers compare as numbers, anything else as trimmed text. */
function longValueDiffers(raw: RawCell, keptRaw: RawCell | undefined, dc: boolean): boolean {
  if (isBlankCell(raw)) return false;
  const a = parseNumber(raw, dc);
  const b = parseNumber(keptRaw ?? null, dc);
  const same = a.status === 'ok' && b.status === 'ok' ? a.value === b.value : String(raw).trim() === String(keptRaw ?? '').trim();
  return !same;
}

/** What a repeated value of one (row, parameter) does when the sheet is built: it replaces a kept value that gives way, it differs (and is reported), or it adds nothing. */
function longRepeat(raw: RawCell, keptRaw: RawCell, dc: boolean): 'replaces' | 'differs' | 'same' {
  if (givesWay(keptRaw) && !isBlankCell(raw)) return 'replaces';
  return longValueDiffers(raw, keptRaw, dc) ? 'differs' : 'same';
}

/**
 * Do two of these non-empty sets have no member in common? Each set is held against a block of sets at a time, one bit per set of the block for each member, so a key with tens of thousands of
 * different parameter sets costs a small fraction of comparing every pair, and the memory stays that of one block.
 */
const DISJOINT_BLOCK = 4096;
export function hasDisjointPair(sets: Set<string>[]): boolean {
  for (let start = 0; start < sets.length; start += DISJOINT_BLOCK) {
    const size = Math.min(DISJOINT_BLOCK, sets.length - start);
    const words = (size + 31) >>> 5;
    const holders = new Map<string, Uint32Array>();
    const all = new Uint32Array(words);
    for (let n = 0; n < size; n++) {
      all[n >>> 5] |= 1 << (n & 31);
      for (const member of sets[start + n]) {
        let bits = holders.get(member);
        if (!bits) holders.set(member, (bits = new Uint32Array(words)));
        bits[n >>> 5] |= 1 << (n & 31);
      }
    }
    const open = new Uint32Array(words);
    for (let s = start; s < sets.length; s++) {
      open.set(all);
      let left = 1;
      for (const member of sets[s]) {
        const bits = holders.get(member);
        if (!bits) continue;
        left = 0;
        for (let w = 0; w < words; w++) left |= open[w] &= ~bits[w];
        if (left === 0) break;
      }
      if (left !== 0) return true;
    }
  }
  return false;
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
 * used safely. A sheet with no differing collision costs one scan and returns []. `concerned`, when given, receives the source lines (at most 20, ascending) of rows in the collisions the columns resolve.
 *
 * A candidate column (outside the key and the parameter, unit and value columns, with a header) is acceptable only when
 *  - it is not unique on every row of the sheet (a record id, a note), and
 *  - in every key where it varies, no two resulting rows have disjoint parameter sets: rows keep the measurements of one thing together, a replicate may lack some parameters, but a running
 *    number or a per-value flag cuts a measurement into rows with no parameter in common and is refused.
 * Among the acceptable ones, greedy: the column that fully resolves the most colliding (key, parameter) groups together with those already taken. Two candidates with the same count that split
 * the rows identically are one choice (the first is taken); two that split them differently leave the choice open and neither is taken. A balanced flag with no other candidate (a QC 0/1
 * on every pair) cannot be told from a replicate without guessing and joins the key; the finding names it. When a collision in a key the chosen columns vary in stays unresolved, none is taken;
 * a collision that the give-way of buildLong settles inside each resulting row (NA, then the value, in one replicate) is not unresolved. The scan and the choice compare the cells as written.
 * Columns that only separate the rows jointly (a cruise and a station, both needed) are not found.
 */
export function extendLongKey(sheet: RawSheet, plan: NonNullable<TablePlan['long']>, keyCols: number[], dc: boolean, paramKey?: (r: RawRow, param: string) => string, concerned?: number[]): number[] {
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
  /** As the sheet will be built: inside each row `cols` make, the group loses no value, a blank or missing kept value giving way to the first value after it. */
  const settledWhenBuilt = (group: number[], cols: number[]): boolean => {
    const kept = new Map<string, RawCell>();
    for (const i of group) {
      const id = classOf(i, cols);
      const k = kept.get(id);
      const repeat = k === undefined ? 'replaces' : longRepeat(valueOf(i), k, dc);
      if (repeat === 'differs') return false;
      if (repeat === 'replaces') kept.set(id, valueOf(i));
    }
    return true;
  };
  /**
   * In every key where `cols` vary, no two resulting rows have disjoint parameter sets (a replicate may lack some parameters; a running number or a per-value flag cuts a measurement into rows with
   * nothing in common). Rows with the same parameters are one set, so the comparison grows with the different sets of a key and not with its rows: the levels of a long cast are one set.
   */
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
      const distinct = new Map<string, Set<string>>();
      for (const set of params.values()) distinct.set(JSON.stringify([...set].sort()), set);
      if (hasDisjointPair([...distinct.values()])) return false;
    }
    return true;
  };
  /** The partition of the rows `cols` make, as a string: two column sets split the rows identically exactly when these are equal. */
  const partitionOf = (cols: number[]): string => {
    const label = new Map<string, number>();
    const out: number[] = [];
    for (const list of rowsOfId.values()) for (const i of list) {
      const k = idOf[i]! + '\u0000' + classOf(i, cols);
      let l = label.get(k);
      if (l === undefined) label.set(k, (l = label.size));
      out.push(i, l);
    }
    return out.join(',');
  };
  const isUnique = (c: number): boolean => {
    const all = new Set<string>();
    for (const list of rowsOfId.values()) for (const i of list) all.add(cell(i, c));
    return all.size === n;
  };
  const candidates = sheet.header.map((_, i) => i).filter((i) => !skip.has(i) && sheet.header[i].trim() !== '' && !isUnique(i));

  const chosen: number[] = [];
  while (remaining.length > 0) {
    let top: number[] = [];
    let topCount = 0;
    for (const c of candidates) {
      if (chosen.includes(c)) continue;
      const cols = [...chosen, c];
      let count = 0;
      for (const g of remaining) if (resolves(g, cols)) count++;
      if (count === 0 || !keepsMeasurementsTogether(cols)) continue;
      if (count > topCount) {
        topCount = count;
        top = [c];
      } else if (count === topCount) top.push(c);
    }
    if (top.length === 0) break;
    if (top.length > 1) {
      // the same count: columns that split the rows identically are one choice (the first); columns that split them differently leave it open, and nothing is taken
      const sig = partitionOf([...chosen, top[0]]);
      if (top.some((c) => partitionOf([...chosen, c]) !== sig)) return [];
    }
    chosen.push(top[0]);
    const cols = [...chosen];
    remaining = remaining.filter((g) => !resolves(g, cols));
  }
  if (chosen.length === 0) return [];
  // a collision in a key the chosen columns vary in that they do not resolve: the columns are not what tells these rows apart
  for (const g of remaining) {
    if (settledWhenBuilt(g, chosen)) continue;
    const list = rowsOfId.get(idOf[g[0]]!)!;
    if (new Set(list.map((i) => classOf(i, chosen))).size > 1) return [];
  }
  if (concerned) {
    const left = new Set(remaining);
    const lines: number[] = [];
    for (const g of members.values()) if (!left.has(g)) for (const i of g) lines.push(rows[i].line);
    concerned.push(...[...new Set(lines)].sort((x, y) => x - y).slice(0, 20));
  }
  return chosen;
}

function buildLong(file: ParsedFile, sheet: RawSheet, plan: NonNullable<TablePlan['long']>, specs: Specs, lookup: Lookup | undefined, namespace: boolean, c: Collector, explicitIgnore: () => ReadonlySet<number>): Built {
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

  // A column that tells colliding rows apart (a pressure, a replicate, a cast, a layer) joins the key, so the values of the rows it separates are read: said once (ROW-LONG-KEY-EXTENDED)
  const concerned: number[] = [];
  const added = extendLongKey(sheet, plan, keyCols, dc, baseKey, concerned);
  if (added.length > 0) {
    keyCols.push(...added);
    const params = { columns: added.map((i) => sheet.header[i]).join(', '), count: added.length };
    for (const line of concerned) c.add('ROW-LONG-KEY-EXTENDED', sheet.name, '', line, undefined, true, params);
  }

  const variables = new Map<string, Variable>();
  const groups = new Map<string, number>();
  const rows: DataRow[] = [];
  const firsts: RawRow[] = [];
  const own = new Set<number>(longColumns(plan));
  // A pressure of the sheet is carried when it is one value inside each row of the output; the first non-blank cell of a row's source rows is its value, and two different ones make it unwritable (below).
  const pressure = (specs.pressure ?? []).filter((p, k, all) => !skip.has(p.index) && all.findIndex((q) => q.index === p.index) === k);
  const pCells: RawCell[][] = [];
  const pVarying = new Set<number>();
  const unkeyed = parse.tracked.filter((i) => !keyCols.includes(i));
  const lostCols = new Map<number, number>();
  const year = yearColumnOf(sheet, specs);
  const skippedDiffer: number[] = [];
  let skippedExample: string | undefined;
  for (const r of sheet.rows) {
    const param = str(r.cells[plan.parameterCol] ?? null);
    if (param === undefined) continue;
    const id = JSON.stringify(keyCols.map((i) => str(r.cells[i] ?? null) ?? ''));
    let n = groups.get(id);
    if (n === undefined) {
      const meta = parse(r);
      n = rows.length;
      groups.set(id, n);
      rows.push({ file: file.fileName, sheet: sheet.name, line: r.line, ...withLookup(meta, r, lookup), values: newValues() });
      firsts.push(r);
      if (pressure.length > 0) pCells.push(pressure.map((p) => r.cells[p.index] ?? null));
    } else {
      // another source row of an output row: a cell of a column that feeds the date, position or identifiers (not in the key) and that differs from the first row's gave nothing to the output
      for (const col of unkeyed) {
        const now = r.cells[col] ?? null;
        if (!isBlankCell(now) && String(now).trim() !== String(firsts[n].cells[col] ?? '').trim()) lostCols.set(col, (lostCols.get(col) ?? 0) + 1);
      }
      pressure.forEach((p, k) => {
        const now = r.cells[p.index] ?? null;
        if (isBlankCell(now)) return;
        const kept = pCells[n!][k];
        if (isBlankCell(kept)) pCells[n!][k] = now;
        else if (String(kept).trim() !== String(now).trim()) pVarying.add(p.index);
      });
    }
    const row = rows[n];
    if (year && row.yearCell === undefined) {
      const yc = r.cells[year.index] ?? null;
      if (!isBlankCell(yc)) row.yearCell = yc;
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
    const raw = r.cells[plan.valueCol] ?? null;
    const kept = row.values[key];
    // duplicate (sample, parameter): one value stays, nothing is averaged. A blank or plainly missing kept value gives way to the first value after it (not 'nd', 'n.d.', 'ND': not detected is a
    // result). A value that differs from the kept one was not read: said once at the end (ROW-LONG-VALUE-SKIPPED)
    const repeat = kept === undefined ? 'replaces' : longRepeat(raw, kept.raw, dc);
    if (repeat === 'replaces') row.values[key] = numericCell(raw, r.line, param, sheet.name, dc, c);
    else if (repeat === 'differs') {
      skippedDiffer.push(r.line);
      skippedExample ??= param;
    }
  }
  for (const line of skippedDiffer) c.add('ROW-LONG-VALUE-SKIPPED', sheet.name, skippedExample ?? '', line, undefined, true, { count: skippedDiffer.length });
  // The key columns no fixed column carries are written too, or rows that differ only there look identical: a time with no date, a sediment depth, a depth bottom, a replicate. A key column is
  // "carried" when every cell of it gave something to the date, position, depth, station, cruise or sample. One with NO cell used is written whole (it is nowhere else in the file); one with only some
  // cells used (a date that reads `spring` once) is written only when its unread cells leave two output rows otherwise identical, and is otherwise named as partly in the file. One with nothing in it
  // separates nothing; one the person set to ignore on purpose is not written.
  const carriedLong = carriedBy(parse.cells);
  for (const i of carriedLong) if (!lostCols.has(i)) own.add(i);
  const unread = keyCols.filter((i) => !own.has(i) && !skip.has(i) && sheet.rows.some((r) => !isBlankCell(r.cells[i] ?? null)));
  const ignoredOnPurpose = unread.length > 0 ? explicitIgnore() : new Set<number>();
  const usedOf = (i: number): number => parse.cells.get(i)?.used ?? 0;
  const wanted = unread.filter((i) => !ignoredOnPurpose.has(i));
  const pressureOk = pressure.filter((p) => !pVarying.has(p.index));
  /**
   * The text a key cell is written as. A number is converted only when EVERY numeric cell of its column is date-formatted (a General 5 among dates stays 5), and only when nothing can be lost: in a
   * time-only column a value from 0 up to 1 is a time of day (HH:MM); any other value ([h]:mm 36.25, a full datetime shown as hh:mm) stays the number. In a date column a plausible serial is written as
   * the date (and time) it is, with the workbook's date system; anything else stays the number. Everything that is not a number is written as the file wrote it.
   */
  const keyCellText = (index: number, cell: RawCell): RawCell => {
    if (typeof cell !== 'number' || sheet.dateAll?.[index] !== true) return cell;
    const timeOnly = sheet.timeAll?.[index] === true;
    if (timeOnly ? !(cell >= 0 && cell < 1) : !isPlausibleSerial(cell)) return cell;
    const d = parseDate(cell, { date1904: file.date1904, dateFormatted: true });
    if ('error' in d) return cell;
    if (timeOnly) return d.iso.includes('T') ? d.iso.slice(d.iso.indexOf('T') + 1) : '00:00';
    return d.iso;
  };
  const cellFor = (e: ExtraKeyColumn, n: number): RawCell => {
    const k = e.kind === 'pressure' ? pressure.findIndex((p) => p.index === e.index) : -1;
    return k >= 0 ? pCells[n][k] : keyCellText(e.index, firsts[n].cells[e.index] ?? null);
  };
  let extra = extraColumnsOf(sheet, pressureOk, wanted.filter((i) => usedOf(i) === 0), skip);
  const partialWanted = wanted.filter((i) => usedOf(i) > 0);
  if (partialWanted.length > 0) {
    // rows that look identical in every written column but differ in this one
    const base = rows.map((row, n) => JSON.stringify([row.station, row.cruise, row.sampleId, row.datetime?.iso, row.lat, row.lon, row.depth, extra.map((e) => String(cellFor(e, n) ?? '').trim())]));
    const needed = partialWanted.filter((i) => {
      const seen = new Map<string, string>();
      for (let n = 0; n < rows.length; n++) {
        const v = String(firsts[n].cells[i] ?? '').trim();
        const was = seen.get(base[n]);
        if (was === undefined) seen.set(base[n], v);
        else if (was !== v) return true;
      }
      return false;
    });
    if (needed.length > 0) extra = extraColumnsOf(sheet, pressureOk, wanted.filter((i) => usedOf(i) === 0 || needed.includes(i)), skip);
  }
  if (extra.length > 0) {
    rows.forEach((row, n) => {
      const cells = newValues() as unknown as Record<string, RawCell>;
      for (const e of extra) cells[e.id] = cellFor(e, n);
      row.keyCells = cells;
    });
  }
  for (const e of extra) own.add(e.index);
  return { rows, variables: [...variables.values()], positives: specs.depth ? [specs.depth.positive] : [], extra, ...readsOf(sheet, own, partialOf(parse.cells, carriedLong, 'rows', lostCols), lookup), ...(year ? { year } : {}) };
}

/**
 * The columns of the sheets a dataset was built from whose content the clean CSV does NOT carry. Nothing is inferred from the roles: the build records the source columns it actually read into a row
 * (`Dataset.readColumns`: the date, time, date parts, position, hemisphere, depth, station, cruise and sample cells that gave a value, the variables, the parameter, unit and value columns of a long sheet,
 * and what a lookup sheet lent to a row) and the columns it wrote beside them (`extraKeyColumns`). Every other column of the mappings is named: an ignored one, a second column for a slot already filled,
 * a time with no date, date parts no date was built from, a hemisphere that did not apply, a lookup column no row took a value from, a pressure that varies inside one row, a key column the person ignored.
 * A dataset without the record (built by hand) names nothing.
 */
export function unwrittenColumns(ds: Dataset): { sheet: string; index: number; header: string; partial?: PartialCount }[] {
  const out: { sheet: string; index: number; header: string; partial?: PartialCount }[] = [];
  if (ds.readColumns === undefined) return out;
  for (const m of ds.mappings) {
    const rec = ds.readColumns.find((r) => r.sheet === m.sheet);
    const read = new Set<number>(rec?.columns);
    for (const e of ds.extraKeyColumns ?? []) if (e.sheet === m.sheet) read.add(e.index);
    for (const c of m.columns) {
      if (read.has(c.index)) continue;
      const part = rec?.partial?.find((p) => p.index === c.index);
      out.push({ sheet: m.sheet, index: c.index, header: c.header, ...(part ? { partial: { used: part.used, filled: part.filled, ...(part.unit === undefined ? {} : { unit: part.unit }) } } : {}) });
    }
  }
  return out;
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
 *   a repeated (sample, parameter) keeps one value (the first, or the first after a blank one). join: position, date and station come from the lookup sheet
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
  const extraKeyColumns: ExtraKeyColumn[] = [];
  const readBy = new Map<string, Set<number>>();
  const partialBy = new Map<string, Map<number, PartialCount>>();
  const yearColumns: NonNullable<Dataset['yearColumns']> = [];
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
      ? buildLong(file, sheet, table.long, specs, lookup, namespace, collector, () => explicitlyIgnored(file, mappings, sheet, table.long))
      : buildWide(file, sheet, specs, lookup, namespace, collector);
    for (const r of built.rows) rows.push(r);
    // META-NO-DATES (checks/metadata.ts) fires when neither a row nor a metadata record has a date: the empty-eventDate finding leaves that case to it
    const noDateSaid = !built.rows.some((r) => r.datetime !== undefined || (r.dateRaw !== undefined && r.dateRaw !== null && String(r.dateRaw).trim() !== '')) && !metadata.some((m) => m.temporalExtent && (m.temporalExtent.start || m.temporalExtent.end));
    pushAll(findings, checkRawTable(file, sheet, [specs.station, specs.cruise, specs.sampleId].filter((x): x is Spec => x !== undefined).map((x) => x.index), { noDateSaid }));
    pushAll(variables, built.variables);
    pushAll(positives, built.positives);
    // one output column for the same header of two sheets; the cells of each row sit under the id
    for (const e of built.extra) if (!extraKeyColumns.some((x) => x.id === e.id)) extraKeyColumns.push(e);
    if (built.year) yearColumns.push({ sheet: sheet.name, year: built.year.header, date: built.year.date });
    for (const [name, cols] of built.reads) {
      const into = readBy.get(name) ?? new Set<number>();
      for (const i of cols) into.add(i);
      readBy.set(name, into);
    }
    for (const [name, cols] of built.partial) {
      const into = partialBy.get(name) ?? new Map<number, PartialCount>();
      for (const [i, v] of cols) into.set(i, v);
      partialBy.set(name, into);
    }
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
  const dataset: Dataset = { id, label, file: file.fileName, rows, variables, mappings: used, layout, metadata, depthPositive, decimalComma: file.decimalComma, ...(typeof joinLost === 'string' ? { joinLost } : {}), ...(extraKeyColumns.length > 0 ? { extraKeyColumns } : {}), readColumns: [...readBy].map(([sheet, cols]) => ({ sheet, columns: [...cols].sort((a, b) => a - b), partial: [...(partialBy.get(sheet) ?? [])].filter(([i]) => !cols.has(i)).map(([index, v]) => ({ index, ...v })) })), ...(yearColumns.length > 0 ? { yearColumns } : {}) };
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
