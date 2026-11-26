// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { excelSerialToDate } from '../values/dates';
import { makeConvertFinding } from '../rules/convert';
import type { Finding, ParsedFile, RawCell, RawSheet } from '../types';
import { DWC, OBIS } from './dwca';
import type { ArchiveTables, Column, Table } from './dwca';
import { EMOF_FILE, EVENT_FILE, OCCURRENCE_FILE } from './dwca';
import type { DwcLevel, DwcProposal, SheetRef } from './dwcAsIs';
import { isObisTerm, termOf, validIn } from './dwcTerms';

/*
 * A workbook that is already Darwin Core, packed as it is. Every column that is a term of the table's level is carried under its own name, in the
 * author's order; the file's eventID, parentEventID and occurrenceID are never changed. What is not written is said, once per sheet (columns) or
 * with its lines (rows): a column that is not a Darwin Core term, a term of another table, a repeated term, the scientificName of an eMoF row (the
 * occurrence has it), and an eMoF row with a value and no type or a type and no value. Every row of every sheet is either written or listed.
 */

export type RowReason = 'empty-row' | 'no-type' | 'no-value' | 'no-type-no-value';
export type ColumnReason = 'not-term' | 'other-level' | 'redundant' | 'repeated';

export interface SheetAccount {
  level: DwcLevel;
  file: string;
  sheet: string;
  /** Data rows of the sheet. */
  rows: number;
  written: number;
  notWritten: { line: number; reason: RowReason }[];
  /** rows - written - notWritten: always 0; the summary prints it so a loss would show. */
  lost: number;
  columns: { header: string; index: number; reason: ColumnReason }[];
}

export interface AsIsResult {
  tables: ArchiveTables;
  accounts: SheetAccount[];
  /** The integrity findings (own ids, in the sheet's terms: file, sheet, source lines). The Darwin Core checks of the tables come from dwcAsIsChecks. */
  findings: Finding[];
  /** Source line of each written row, per table. */
  lines: { event: number[]; occurrence: number[]; emof: number[] };
}

export interface AsIsOptions {
  /** The basisOfRecord of the description form: written only when the occurrence sheet has no such column. */
  basisOfRecord?: string;
}

const blank = (c: RawCell): boolean => c === null || (typeof c === 'string' && c.trim() === '');

function cellText(c: RawCell, file: ParsedFile, sheet: RawSheet, i: number, plain: boolean): string {
  if (c === null) return '';
  if (typeof c === 'string') return c;
  if (sheet.dateFormatted?.[i] === true && !plain) {
    try {
      return excelSerialToDate(c, file.date1904).iso;
    } catch {
      return String(c);
    }
  }
  return String(c);
}

interface Read {
  columns: Column[];
  /** Source index of each written column (-1: made by the tool). */
  from: number[];
  rows: { line: number; cells: string[] }[];
  blankLines: number[];
  dropped: SheetAccount['columns'];
}

function readSheet(file: ParsedFile, sheet: RawSheet, level: DwcLevel): Read {
  const columns: Column[] = [];
  const from: number[] = [];
  const dropped: SheetAccount['columns'] = [];
  const seen = new Set<string>();
  const hasOcc = sheet.header.some((h) => termOf(h)?.name === 'occurrenceID');
  sheet.header.forEach((h, i) => {
    const term = termOf(h);
    const hasData = sheet.rows.some((r) => !blank(r.cells[i] ?? null));
    if (term === undefined) {
      if (h.trim() !== '' || hasData) dropped.push({ header: h, index: i, reason: 'not-term' });
      return;
    }
    if (level === 'emof' && term.name === 'scientificName' && hasOcc) return void dropped.push({ header: h, index: i, reason: 'redundant' });
    if (!validIn(level, term)) return void dropped.push({ header: h, index: i, reason: 'other-level' });
    if (seen.has(term.name)) return void dropped.push({ header: h, index: i, reason: 'repeated' });
    seen.add(term.name);
    columns.push({ header: term.name, uri: (isObisTerm(term.name) ? OBIS : DWC) + term.name });
    from.push(i);
  });
  const rows: Read['rows'] = [];
  const blankLines: number[] = [];
  for (const r of sheet.rows) {
    if (r.cells.every(blank)) {
      blankLines.push(r.line);
      continue;
    }
    const plain = new Set(r.plainNumbers ?? []);
    rows.push({ line: r.line, cells: from.map((i) => cellText(r.cells[i] ?? null, file, sheet, i, plain.has(i))) });
  }
  return { columns, from, rows, blankLines, dropped };
}

const indexOf = (cols: Column[], name: string): number => cols.findIndex((c) => c.header === name);

function findSheet(files: readonly ParsedFile[], ref: SheetRef): { file: ParsedFile; sheet: RawSheet } {
  const file = files[ref.file];
  const sheet = file?.sheets.find((s) => s.name === ref.sheet);
  if (!file || !sheet) throw new Error(`The sheet ${ref.sheet} is not among the files.`);
  return { file, sheet };
}

/** Where a value repeats: the lines of every row after the first one that holds it, and the first repeated value. */
function repeats(ids: { line: number; id: string }[]): { lines: number[]; first: string } | undefined {
  const seen = new Set<string>();
  const lines: number[] = [];
  let first = '';
  for (const { line, id } of ids) {
    if (id === '') continue;
    if (seen.has(id)) {
      if (lines.length === 0) first = id;
      lines.push(line);
    }
    seen.add(id);
  }
  return lines.length === 0 ? undefined : { lines, first };
}

function account(level: DwcLevel, file: ParsedFile, sheet: RawSheet, rd: Read, written: number, bad: SheetAccount['notWritten']): SheetAccount {
  const notWritten = [...rd.blankLines.map((line) => ({ line, reason: 'empty-row' as const })), ...bad].sort((a, b) => a.line - b.line);
  return { level, file: file.fileName, sheet: sheet.name, rows: sheet.rows.length, written, notWritten, lost: sheet.rows.length - written - notWritten.length, columns: rd.dropped };
}

/** The tables, the account of every row and column, and the integrity findings (duplicate ids, orphans, rows of measurements that cannot be written). */
export function packDwcAsIs(files: readonly ParsedFile[], p: DwcProposal, opts: AsIsOptions = {}): AsIsResult {
  const ev = findSheet(files, p.event);
  const oc = findSheet(files, p.occurrence);
  const evRead = readSheet(ev.file, ev.sheet, 'event');
  const ocRead = readSheet(oc.file, oc.sheet, 'occurrence');
  const findings: Finding[] = [];
  const at = (f: ParsedFile, s: RawSheet) => ({ file: f.fileName, sheet: s.name });

  const eId = indexOf(evRead.columns, 'eventID');
  const oId = indexOf(ocRead.columns, 'occurrenceID');
  const oEv = indexOf(ocRead.columns, 'eventID');
  const events = new Set(evRead.rows.map((r) => r.cells[eId]));
  const dupEvent = repeats(evRead.rows.map((r) => ({ line: r.line, id: r.cells[eId] })));
  if (dupEvent) findings.push(makeConvertFinding('CONV-ASIS-EVENT-ID-DUPLICATE', { ...at(ev.file, ev.sheet), value: dupEvent.first, lines: dupEvent.lines, params: { count: dupEvent.lines.length } }));
  const dupOcc = repeats(ocRead.rows.map((r) => ({ line: r.line, id: r.cells[oId] })));
  if (dupOcc) findings.push(makeConvertFinding('CONV-ASIS-OCC-ID-DUPLICATE', { ...at(oc.file, oc.sheet), value: dupOcc.first, lines: dupOcc.lines, params: { count: dupOcc.lines.length } }));
  const orphan = ocRead.rows.filter((r) => !events.has(r.cells[oEv]));
  if (orphan.length > 0) findings.push(makeConvertFinding('CONV-ASIS-OCC-ORPHAN', { ...at(oc.file, oc.sheet), value: orphan[0].cells[oEv], lines: orphan.map((r) => r.line), params: { count: orphan.length } }));
  const ownerOf = new Map(ocRead.rows.map((r) => [r.cells[oId], r.cells[oEv]]));

  // basisOfRecord from the description form, only when the sheet has no such column
  if (indexOf(ocRead.columns, 'basisOfRecord') < 0 && (opts.basisOfRecord ?? '') !== '') {
    ocRead.columns.push({ header: 'basisOfRecord', uri: `${DWC}basisOfRecord` });
    for (const r of ocRead.rows) r.cells.push(opts.basisOfRecord as string);
  }

  let emofTable: Table | undefined;
  const accounts: SheetAccount[] = [];
  const emofLines: number[] = [];
  if (p.emof) {
    const em = findSheet(files, p.emof);
    const rd = readSheet(em.file, em.sheet, 'emof');
    const iType = indexOf(rd.columns, 'measurementType');
    const iVal = indexOf(rd.columns, 'measurementValue');
    const bad: SheetAccount['notWritten'] = [];
    const kept = rd.rows.filter((r) => {
      const noType = r.cells[iType].trim() === '';
      const noValue = r.cells[iVal].trim() === '';
      if (!noType && !noValue) return true;
      bad.push({ line: r.line, reason: noType && noValue ? 'no-type-no-value' : noType ? 'no-type' : 'no-value' });
      return false;
    });
    if (bad.length > 0) findings.push(makeConvertFinding('CONV-ASIS-EMOF-ROWS-NOT-WRITTEN', { ...at(em.file, em.sheet), lines: bad.map((b) => b.line), params: { count: bad.length } }));
    // the eventID is the link of the extension (meta.xml coreid): the file's own, or the one of the occurrence the row names
    let iEv = indexOf(rd.columns, 'eventID');
    const iOcc = indexOf(rd.columns, 'occurrenceID');
    if (iEv < 0) {
      rd.columns.unshift({ header: 'eventID', uri: `${DWC}eventID` });
      for (const r of kept) r.cells.unshift(iOcc >= 0 ? ownerOf.get(r.cells[iOcc]) ?? '' : '');
      iEv = 0;
    }
    const occ = indexOf(rd.columns, 'occurrenceID');
    const noEvent = kept.filter((r) => !events.has(r.cells[iEv]));
    const noOcc = occ < 0 ? [] : kept.filter((r) => r.cells[occ] !== '' && !ownerOf.has(r.cells[occ]));
    const mismatch = occ < 0 ? [] : kept.filter((r) => ownerOf.has(r.cells[occ]) && r.cells[iEv] !== ownerOf.get(r.cells[occ]));
    const base = at(em.file, em.sheet);
    if (noEvent.length > 0) findings.push(makeConvertFinding('CONV-EMOF-ORPHAN', { ...base, value: noEvent[0].cells[iEv], lines: noEvent.map((r) => r.line), params: { kind: 'event', count: noEvent.length } }));
    if (noOcc.length > 0) findings.push(makeConvertFinding('CONV-EMOF-ORPHAN', { ...base, value: noOcc[0].cells[occ], lines: noOcc.map((r) => r.line), params: { kind: 'occurrence', count: noOcc.length } }));
    if (mismatch.length > 0) findings.push(makeConvertFinding('CONV-EMOF-EVENT-MISMATCH', { ...base, value: mismatch[0].cells[occ], lines: mismatch.map((r) => r.line), params: { count: mismatch.length } }));
    if (rd.dropped.some((d) => d.reason === 'redundant')) findings.push(makeConvertFinding('CONV-ASIS-EMOF-REDUNDANT', base));
    emofTable = { name: EMOF_FILE, columns: rd.columns, rows: kept.map((r) => r.cells) };
    emofLines.push(...kept.map((r) => r.line));
    accounts.push(account('emof', em.file, em.sheet, rd, kept.length, bad));
  }

  const accountOf = (level: DwcLevel, f: ParsedFile, s: RawSheet, rd: Read): SheetAccount => account(level, f, s, rd, rd.rows.length, []);
  const all = [accountOf('event', ev.file, ev.sheet, evRead), accountOf('occurrence', oc.file, oc.sheet, ocRead), ...accounts];
  for (const a of all) {
    const by = (r: ColumnReason): string[] => a.columns.filter((c) => c.reason === r).map((c) => c.header || `#${c.index + 1}`);
    const where = { file: a.file, sheet: a.sheet };
    if (by('not-term').length > 0) findings.push(makeConvertFinding('CONV-ASIS-COLUMNS-NOT-TERM', { ...where, params: { columns: by('not-term').join(', '), count: by('not-term').length } }));
    if (by('other-level').length > 0) findings.push(makeConvertFinding('CONV-ASIS-COLUMNS-OTHER-LEVEL', { ...where, params: { columns: by('other-level').join(', '), count: by('other-level').length, table: a.level === 'event' ? EVENT_FILE : a.level === 'occurrence' ? OCCURRENCE_FILE : EMOF_FILE } }));
    if (by('repeated').length > 0) findings.push(makeConvertFinding('CONV-ASIS-COLUMN-REPEATED', { ...where, params: { columns: by('repeated').join(', '), count: by('repeated').length } }));
  }
  return {
    tables: { event: { name: EVENT_FILE, columns: evRead.columns, rows: evRead.rows.map((r) => r.cells) }, occurrence: { name: OCCURRENCE_FILE, columns: ocRead.columns, rows: ocRead.rows.map((r) => r.cells) }, ...(emofTable ? { emof: emofTable } : {}) },
    accounts: all,
    findings,
    lines: { event: evRead.rows.map((r) => r.line), occurrence: ocRead.rows.map((r) => r.line), emof: emofLines },
  };
}
