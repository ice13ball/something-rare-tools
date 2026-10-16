// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ColumnProposal, ColumnRole, RawCell, RawRow, RawSheet, SheetMapping, TablePlan } from '../types';
import { parseCoordinate } from '../values/coords';
import { parseDate } from '../values/dates';
import { NA_TOKENS, parseNumber } from '../values/numbers';
import { canonicalFromKey, headerKey, isUnitAlias, normaliseUnit, p01CodeOf } from './vocab';

export interface ProposeContext {
  decimalComma: boolean;
  date1904: boolean;
  /** When the sheet is a long table, its parameter / unit / value columns are read through the layout, not as columns. */
  long?: TablePlan['long'];
}

/* ---------- header text ---------- */

/** '"Latitude<Float32>"' -> 'Latitude' (OPeNDAP type suffix and surrounding quotes removed). */
export function stripTypeSuffix(h: string): string {
  let s = h.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1).trim();
  return s.replace(/<[A-Za-z][A-Za-z0-9]*>\s*$/, '').trim();
}

// A single-token tail ('Depth_m', 'TEMP_C', 'temp_degC') is a unit only when it is a UNIT_VOCAB label or alias, or one
// of these lengths that the vocabulary does not list; longer tails go through normaliseUnit.
const SINGLE_TOKEN_EXTRA_UNITS = new Set(['cm', 'mm']);

/** Is this text, found in round brackets, a unit ('m', 'µmol L-1', 'kg m-3') and not a remark ('at 25ºC')? */
const SIMPLE_UNITS = new Set(['cm', 'mm', 'km', 'g', 'kg', 'mg', '%', '‰']);
function looksLikeUnit(text: string): boolean {
  const t = text.trim();
  if (normaliseUnit(t) !== undefined || SIMPLE_UNITS.has(t.toLowerCase())) return true;
  return /\//.test(t) || /[A-Za-zµμ]-\d$/.test(t) || /\*\*\d/.test(t);
}

export interface HeaderUnit {
  /** The column name without type suffix, descriptor and unit. */
  name: string;
  /** Unit normalised to a UNIT_VOCAB label, or the text as written when it is not in the vocabulary. */
  unit?: string;
  /** The unit text exactly as the header wrote it (also the time-zone marker of 'Time [UTC]'). */
  unitText?: string;
}

const trimName = (s: string): string => s.replace(/[\s_]+$/, '').replace(/^[\s_]+/, '');

/**
 * Splits a header into name and unit. Understood: 'name [unit]', 'name (unit)' (only when the bracket text is a
 * unit), 'name_umol_kg' / 'name_mg_l' / 'Depth_m', 'DIC umol/kg', and the PANGAEA form 'name [unit] (description ...)'
 * whose truncated description is dropped. The unit is normalised to a UNIT_VOCAB label or left as written; it is
 * never invented (a header without a unit returns none).
 */
export function unitFromHeader(h: string): HeaderUnit {
  let s = stripTypeSuffix(h);
  s = s.replace(/\s*\([^()]*\.\.\.\)\s*$/, '').trim();

  const done = (name: string, unitText: string): HeaderUnit => {
    const t = unitText.trim();
    return { name: trimName(name), unit: normaliseUnit(t) ?? t, unitText: t };
  };

  let m = /^(.*\S)\s*\[([^[\]]+)\]$/.exec(s);
  if (m && trimName(m[1]) !== '') return done(m[1], m[2]);

  m = /^(.*\S)\s*\(([^()]+)\)$/.exec(s);
  if (m && trimName(m[1]) !== '' && looksLikeUnit(m[2])) return done(m[1], m[2]);

  if (s.includes('_')) {
    const tokens = s.split('_');
    for (let k = Math.min(3, tokens.length - 1); k >= 1; k--) {
      const tail = tokens.slice(-k).join('_');
      const head = tokens.slice(0, -k).join('_');
      if (head === '') continue;
      if (k === 1 ? SINGLE_TOKEN_EXTRA_UNITS.has(tail.toLowerCase()) || isUnitAlias(tail) : normaliseUnit(tail) !== undefined) {
        return done(head, tail.replace(/_/g, ' '));
      }
    }
  }

  const words = s.split(/\s+/);
  for (let k = Math.min(2, words.length - 1); k >= 1; k--) {
    const tail = words.slice(-k).join(' ');
    if (/[/]/.test(tail) && normaliseUnit(tail) !== undefined) return done(words.slice(0, -k).join(' '), tail);
  }

  return { name: trimName(s) };
}

/* ---------- column statistics ---------- */

const isBlank = (c: RawCell): boolean => c === null || (typeof c === 'string' && NA_TOKENS.includes(c.trim()));

function sampleRows(sheet: RawSheet, max = 1000): readonly RawRow[] {
  const n = sheet.rows.length;
  if (n <= max) return sheet.rows;
  const out: RawRow[] = [];
  for (let i = 0; i < max; i++) out.push(sheet.rows[Math.floor((i * n) / max)]);
  return out;
}

interface Stats {
  nonEmpty: number;
  ok: number;
  nonNumeric: number;
}

function numericStats(rows: readonly RawRow[], col: number, decimalComma: boolean): Stats {
  const st: Stats = { nonEmpty: 0, ok: 0, nonNumeric: 0 };
  for (const r of rows) {
    const c = r.cells[col] ?? null;
    if (isBlank(c)) continue;
    st.nonEmpty++;
    const p = parseNumber(c, decimalComma);
    if (p.status === 'ok') st.ok++;
    else if (p.status === 'non-numeric') st.nonNumeric++;
  }
  return st;
}

/** A column is numeric when at least one value is a number and the numbers are not outnumbered by other text. */
const isNumeric = (st: Stats): boolean => st.ok > 0 && st.ok >= st.nonNumeric;

/* ---------- name-based roles ---------- */

type SlotKind = 'latitude' | 'longitude' | 'when' | 'time' | 'depth' | 'station' | 'cruise' | 'sampleId';
interface Cand {
  slot: SlotKind;
  /** 0 exact name, 1 other name, 2 P01 code / elevation, 3 inferred from values */
  tier: number;
  kind: 'latitude' | 'longitude' | 'datetime' | 'date' | 'time' | 'depth' | 'station' | 'cruise' | 'sampleId';
  reason: string;
  elevation?: boolean;
}

const SITE_DEPTH =
  /\b(site|bottom|seafloor|seabed|sea floor|sounding|total|maximum|max)\b.*\bdepth\b|\bdepth\b.*\b(of the site|of the station|of the bottom|of the seafloor|of the sea floor)\b|\bdepth (at|of) (the )?(site|station|bottom)\b/;
const OTHER_DEPTH = /\b(secchi|mixed layer|mld|euphotic|photic|thermocline|chlorophyll max|compensation)\b/;
const FLAG = /^(qf|qc|flag)( |$)|( flag| flags| qf| qc)$|^quality( flag| control| code)?( |$)/;

function nameCandidate(key: string): Cand | undefined {
  if (/^lat(\s|$)|^latit\w*(\s|$)/.test(key)) {
    return { slot: 'latitude', tier: key === 'latitude' || key === 'lat' ? 0 : 1, kind: 'latitude', reason: 'name says latitude' };
  }
  if (/^(lon|long|lng)(\s|$)|^longit\w*(\s|$)/.test(key)) {
    return { slot: 'longitude', tier: ['longitude', 'lon', 'long', 'lng'].includes(key) ? 0 : 1, kind: 'longitude', reason: 'name says longitude' };
  }
  if (/^(date ?time|timestamp|time ?stamp|date and time)(\s|$)/.test(key)) {
    return { slot: 'when', tier: 0, kind: 'datetime', reason: 'name says date and time' };
  }
  if (/^((sampling|sample|collection|start|observation|measurement) )?date( utc)?$/.test(key)) {
    return { slot: 'when', tier: key === 'date' ? 0 : 1, kind: 'date', reason: 'name says date' };
  }
  if (/^((sampling|sample|collection|start|observation|measurement) )?time( utc| of day| hh mm| hhmm)?$/.test(key)) {
    return { slot: 'time', tier: key === 'time' ? 0 : 1, kind: 'time', reason: 'name says time of day' };
  }
  if (/^(elevation|altitude)(\s|$)/.test(key)) {
    return { slot: 'depth', tier: 2, kind: 'depth', reason: 'name says elevation (positive up)', elevation: true };
  }
  if (/\bdepth\b/.test(key) && !SITE_DEPTH.test(key) && !OTHER_DEPTH.test(key)) {
    return { slot: 'depth', tier: key === 'depth' ? 0 : 1, kind: 'depth', reason: 'name says depth' };
  }
  if (/^(pressure|pres|press|prs)(\s|$)/.test(key)) return undefined; // pressure is not a slot, handled by the caller
  if (/^(cruise( id| name| no| number| code)?|expedition( \w+)?|campaign( \w+)?|survey|leg)$/.test(key)) {
    return { slot: 'cruise', tier: key === 'cruise' ? 0 : 1, kind: 'cruise', reason: 'name says cruise or expedition' };
  }
  if (/^(station( name| id| code| no| number| nr| label)?|stn( \w+)?|st|sta|site( id| name| code| no)?|event|label)$/.test(key)) {
    return { slot: 'station', tier: key === 'station' ? 0 : 1, kind: 'station', reason: 'name says station, site or event' };
  }
  if (/^(sample( id| no| number| name| code| label)?|core( id| name| no| number)?|specimen( id)?|bottle( id| no| number)?|id)$/.test(key)) {
    return { slot: 'sampleId', tier: 1, kind: 'sampleId', reason: 'name says sample or core identifier' };
  }
  return undefined;
}

const isPressureName = (key: string): boolean => /^(pressure|pres|press|prs)(\s|$)/.test(key);

/** Does a text cell read like the name of a standard column (latitude, depth, DIC, ...)? Used to spot transposed tables. */
export function isKnownColumnName(label: string): boolean {
  const key = headerKey(unitFromHeader(label).name);
  return key !== '' && (nameCandidate(key) !== undefined || isPressureName(key) || canonicalFromKey(key) !== undefined);
}

/* ---------- main ---------- */

const NEGATIVE_UP = 'negative values: depth is positive up';

function depthPositive(rows: readonly RawRow[], col: number, decimalComma: boolean, elevation: boolean): 'down' | 'up' | 'unknown' {
  if (elevation) return 'up';
  let seen = false;
  for (const r of rows) {
    const p = parseNumber(r.cells[col] ?? null, decimalComma);
    if (p.status !== 'ok') continue;
    seen = true;
    if (p.value < 0) return 'up';
  }
  return seen ? 'down' : 'unknown';
}

function hasTimeOfDay(rows: readonly RawRow[], col: number, ctx: ProposeContext, dateFormatted: boolean): boolean {
  for (const r of rows.slice(0, 200)) {
    const c = r.cells[col] ?? null;
    if (isBlank(c)) continue;
    const d = parseDate(c, { date1904: ctx.date1904, dateFormatted });
    if (!('error' in d) && (d.precision === 'minute' || d.precision === 'second')) return true;
  }
  return false;
}

/** Hemisphere letter on a degree-minute text column -> the axis it must be; undefined when the values do not say. */
function dmAxis(rows: readonly RawRow[], col: number, decimalComma: boolean): 'lat' | 'lon' | undefined {
  let lat = 0;
  let lon = 0;
  let other = 0;
  for (const r of rows) {
    const c = r.cells[col] ?? null;
    if (typeof c !== 'string' || isBlank(c)) continue;
    const t = c.trim().toUpperCase();
    const letter = /^[NSEW]|[NSEW]$/.exec(t)?.[0];
    const hasMarks = /[°'′"″]/.test(t);
    if (!hasMarks || letter === undefined) {
      other++;
      continue;
    }
    const axis = 'NS'.includes(letter) ? 'lat' : 'lon';
    const parsed = parseCoordinate(c, axis, decimalComma);
    if ('error' in parsed || parsed.form === 'decimal') other++;
    else if (axis === 'lat') lat++;
    else lon++;
  }
  if (other > 0 || lat + lon === 0) return undefined;
  if (lat > 0 && lon === 0) return 'lat';
  if (lon > 0 && lat === 0) return 'lon';
  return undefined;
}

/** Proposes a role for every column of a sheet, in column order. */
export function proposeColumns(sheet: RawSheet, ctx: ProposeContext): ColumnProposal[] {
  const rows = sampleRows(sheet);
  const long = ctx.long;
  const longCols = long ? new Set([long.parameterCol, long.valueCol, ...(long.unitCol === undefined ? [] : [long.unitCol])]) : new Set<number>();

  interface Entry {
    proposal: ColumnProposal;
    cand?: Cand;
    elevation?: boolean;
  }
  const entries: Entry[] = sheet.header.map((header, index): Entry => {
    const cleanHeader = stripTypeSuffix(header);
    const base = { index, header, cleanHeader };
    const ignore = (reason: string, confidence: 'high' | 'low' = 'high'): Entry => ({
      proposal: { ...base, role: { kind: 'ignore' }, confidence, reason },
    });

    if (longCols.has(index)) return ignore('long format: this column is read through the layout (parameter, unit or value)');
    if (cleanHeader === '') return ignore('column without a header', 'low');

    const hu = unitFromHeader(header);
    const key = headerKey(hu.name);
    const code = p01CodeOf(cleanHeader);
    const hint = code?.hint;

    // 1. header names
    if (FLAG.test(key)) return ignore('quality flag column');

    const cand = nameCandidate(key);
    let candidate: Cand | undefined = cand;
    let pressure = isPressureName(key);
    let variableKey: string | undefined;
    let unit = hu.unit;
    let unitSource: 'header' | 'p01' | undefined = hu.unit === undefined ? undefined : 'header';
    let p01Code: string | undefined;
    let reasonExtra = '';

    // 2. P01 codes (only when the name said nothing)
    if (!candidate && !pressure && code && hint) {
      p01Code = code.code;
      if (hint.role === 'pressure') pressure = true;
      else if (hint.role === 'depth') candidate = { slot: 'depth', tier: 2, kind: 'depth', reason: `NERC P01 ${code.code}: ${hint.meaning}` };
      else if (hint.role === 'latitude') candidate = { slot: 'latitude', tier: 2, kind: 'latitude', reason: `NERC P01 ${code.code}: ${hint.meaning}` };
      else if (hint.role === 'longitude') candidate = { slot: 'longitude', tier: 2, kind: 'longitude', reason: `NERC P01 ${code.code}: ${hint.meaning}` };
      else if (hint.role === 'datetime') candidate = { slot: 'when', tier: 2, kind: 'datetime', reason: `NERC P01 ${code.code}: ${hint.meaning}` };
      else {
        variableKey = hint.variable;
        reasonExtra = `NERC P01 ${code.code}: ${hint.meaning}`;
      }
      if (hint.unit !== undefined && unit === undefined) {
        unit = hint.unit;
        unitSource = 'p01';
      }
    } else if (!candidate && !pressure && code?.declared) {
      p01Code = code.code; // declared by the file itself, not in our table
    }

    if (candidate) {
      return { proposal: { ...base, role: { kind: 'ignore' }, confidence: candidate.tier >= 3 ? 'low' : 'high', reason: candidate.reason }, cand: candidate, elevation: candidate.elevation };
    }

    if (pressure) {
      const pUnit = unit;
      const role: ColumnRole = pUnit === undefined ? { kind: 'pressure' } : { kind: 'pressure', unit: pUnit };
      return { proposal: { ...base, role, confidence: 'high', reason: hint ? `NERC P01 ${code?.code}: ${hint.meaning}` : 'name says pressure' } };
    }

    // 3. xlsx date-formatted column
    if (sheet.dateFormatted?.[index]) {
      const d = hasTimeOfDay(rows, index, ctx, true);
      const c: Cand = { slot: 'when', tier: 1, kind: d ? 'datetime' : 'date', reason: 'date-formatted Excel column' };
      return { proposal: { ...base, role: { kind: 'ignore' }, confidence: 'high', reason: c.reason }, cand: c };
    }

    const st = numericStats(rows, index, ctx.decimalComma);
    const canonical = variableKey ?? canonicalFromKey(key);

    // 4. values: degrees + minutes with hemisphere letters, ISO dates (only when no name or code explained the column)
    if (canonical === undefined && !isNumeric(st)) {
      const axis = dmAxis(rows, index, ctx.decimalComma);
      if (axis) {
        const c: Cand = { slot: axis === 'lat' ? 'latitude' : 'longitude', tier: 3, kind: axis === 'lat' ? 'latitude' : 'longitude', reason: 'values are degrees and minutes with hemisphere letters' };
        return { proposal: { ...base, role: { kind: 'ignore' }, confidence: 'low', reason: c.reason }, cand: c };
      }
      let isoDates = 0;
      let seen = 0;
      for (const r of rows.slice(0, 200)) {
        const c = r.cells[index] ?? null;
        if (typeof c !== 'string' || isBlank(c)) continue;
        seen++;
        const d = parseDate(c, { date1904: ctx.date1904, dateFormatted: false });
        if (!('error' in d) && d.precision !== 'year' && d.precision !== 'month' && /\d{2,4}-\d{2}-\d{2}/.test(c)) isoDates++;
      }
      if (seen > 0 && isoDates === seen) {
        const t = hasTimeOfDay(rows, index, ctx, false);
        const c: Cand = { slot: 'when', tier: 3, kind: t ? 'datetime' : 'date', reason: 'values are ISO dates' };
        return { proposal: { ...base, role: { kind: 'ignore' }, confidence: 'low', reason: c.reason }, cand: c };
      }
      return ignore('text column (comments, methods, flags, references or empty)', 'high');
    }

    // 5. variable
    const name = hu.name;
    const variable = canonical ?? name;
    const role: ColumnRole = {
      kind: 'variable',
      variable,
      ...(unit === undefined ? {} : { unit, unitSource }),
      ...(p01Code === undefined ? {} : { p01: p01Code }),
    };
    const reason = reasonExtra || (canonical ? `name matches ${canonical}` : 'numeric column with an unrecognised name');
    return { proposal: { ...base, role, confidence: canonical ? 'high' : 'low', reason } };
  });

  // one column per slot: the best tier wins, then the leftmost
  const bySlot = new Map<SlotKind, number[]>();
  entries.forEach((e, i) => {
    if (e.cand) bySlot.set(e.cand.slot, [...(bySlot.get(e.cand.slot) ?? []), i]);
  });
  for (const [slot, idxs] of bySlot) {
    const winner = idxs.slice().sort((a, b) => entries[a].cand!.tier - entries[b].cand!.tier || a - b)[0];
    for (const i of idxs) {
      const e = entries[i];
      const c = e.cand!;
      if (i !== winner) {
        const w = entries[winner].proposal.cleanHeader;
        e.proposal.role = { kind: 'ignore' };
        e.proposal.confidence = 'low';
        e.proposal.reason = `another column ("${w}") is used for ${slot === 'when' ? 'the date' : slot}`;
        continue;
      }
      const hu = unitFromHeader(e.proposal.header);
      const code = p01CodeOf(e.proposal.cleanHeader);
      switch (c.kind) {
        case 'latitude':
        case 'longitude':
        case 'datetime':
        case 'date':
        case 'time':
        case 'station':
        case 'cruise':
        case 'sampleId':
          e.proposal.role = { kind: c.kind };
          break;
        case 'depth': {
          const unit = hu.unit ?? code?.hint?.unit;
          const positive = depthPositive(rows, e.proposal.index, ctx.decimalComma, c.elevation === true);
          e.proposal.role = unit === undefined ? { kind: 'depth', positive } : { kind: 'depth', positive, unit };
          if (positive === 'up' && !c.elevation) e.proposal.reason += `; ${NEGATIVE_UP}`;
          break;
        }
      }
    }
  }

  // a date column whose values carry a time of day is a datetime
  for (const e of entries) {
    const r = e.proposal.role;
    if (r.kind === 'date' && hasTimeOfDay(rows, e.proposal.index, ctx, sheet.dateFormatted?.[e.proposal.index] === true)) {
      e.proposal.role = { kind: 'datetime' };
    }
  }

  return entries.map((e) => e.proposal);
}

/** The proposals as a SheetMapping, as the pipeline accepts them without editing. */
export function toMapping(sheet: RawSheet, proposals: readonly ColumnProposal[]): SheetMapping {
  return { sheet: sheet.name, columns: proposals.map((p) => ({ index: p.index, header: p.header, role: p.role })) };
}

export { isBlank as isBlankCell };
