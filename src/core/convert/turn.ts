// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { isBlankCell } from '../recognize/columns';
import { makeConvertFinding } from '../rules/convert';
import type { Finding, ParsedFile, RawCell, RawRow, RawSheet, TurnDeclaration } from '../types';
import { columnLetters } from './columnLetters';
import { MAX_FINDING_LINES } from './notWritten';

/*
 * "The samples are the columns": the converter's turn of a sheet whose rows are taxa or variables and whose columns are samples. It is the PERSON's declaration, never a guess from values: the
 * person says which column holds the names of the rows and which columns right of it are not samples (a Total, a unit). The sheet is turned per file BEFORE the roles are proposed, so the
 * roles are proposed on the turned columns (a taxon name is a header, a sample code is a cell).
 *
 * The result is a plain wide sheet that the rest of the converter reads like any other: one row per SAMPLE (the header text of the source column), one column per named source row, headed
 * with the row's name as written (a name two rows share is never changed: those rows block). Every cell is the source cell as written; nothing is summed, parsed or chosen. A turned row has no line of the file: its `line` is
 * TURNED_LINE_BASE + the source column, and `turn` on the new sheet says where every row and column came from, so a finding can point back at the source (turnedLines) and the ledger can
 * be kept in the lines of the source (ledger.ts).
 */

/** A turned row's line is this plus the source column of its sample: never a real line of a file. */
export const TURNED_LINE_BASE = 10_000_000;

const text = (c: RawCell | undefined): string => (c === null || c === undefined ? '' : String(c).trim());

/** The turned sheet, or the sheet itself when the declaration names no column that exists. Pure; the input is not changed. */
export function turnSheet(sheet: RawSheet, decl: TurnDeclaration): RawSheet {
  const width = sheet.header.length;
  const skip = new Set(decl.notSamples);
  const labelColumns = [...new Set([...Array.from({ length: Math.max(0, Math.min(decl.nameColumn, width)) }, (_, i) => i), ...decl.notSamples.filter((i) => i >= 0 && i < width)])].sort((a, b) => a - b);
  const holdsValue = (c: number): boolean => sheet.rows.some((r) => !isBlankCell(r.cells[c] ?? null));

  // the sample columns: every column right of the name column that is not declared as no sample; a blank or repeated header is not turned
  const candidates: number[] = [];
  for (let c = decl.nameColumn + 1; c < width; c++) if (!skip.has(c)) candidates.push(c);
  const blankHeaders: number[] = [];
  const byHeader = new Map<string, number[]>();
  for (const c of candidates) {
    const h = text(sheet.header[c]);
    if (h === '') {
      if (holdsValue(c)) blankHeaders.push(c);
      continue;
    }
    (byHeader.get(h) ?? byHeader.set(h, []).get(h)!).push(c);
  }
  const repeatedHeaders = [...byHeader].filter(([, cols]) => cols.length > 1).map(([header, columns]) => ({ header, columns }));
  const repeated = new Set(repeatedHeaders.flatMap((r) => r.columns));
  const samples = candidates.filter((c) => text(sheet.header[c]) !== '' && !repeated.has(c));

  // the named rows become the columns; a row with values and no name becomes none
  const lead = decl.headerDates === true ? ['Sample', 'Date'] : ['Sample'];
  const leadKeys = new Set(lead.map((h) => h.toLowerCase()));
  const byName = new Map<string, RawRow[]>();
  const blankNameLines: number[] = [];
  for (const r of sheet.rows) {
    const n = text(r.cells[decl.nameColumn]);
    if (n !== '') (byName.get(n.toLowerCase()) ?? byName.set(n.toLowerCase(), []).get(n.toLowerCase())!).push(r);
    else if (r.cells.some((c, i) => i !== decl.nameColumn && !isBlankCell(c ?? null))) blankNameLines.push(r.line);
  }

  // a name that two rows share, or that is a column the turn adds, is never changed to make it unique (a row name is data): those rows are not turned and block
  const repeatedNames: { name: string; lines: number[] }[] = [];
  const named: RawRow[] = [];
  for (const [key, group] of byName) {
    if (group.length > 1 || leadKeys.has(key)) repeatedNames.push({ name: text(group[0].cells[decl.nameColumn]), lines: group.map((r) => r.line) });
    else named.push(group[0]);
  }
  named.sort((a, b) => a.line - b.line);
  // the headers: 'Sample' (and 'Date' when the header gives it too), then the row names as written
  const names = named.map((r) => text(r.cells[decl.nameColumn]));
  const nameLine: Record<number, number> = Object.create(null) as Record<number, number>;
  named.forEach((r, k) => (nameLine[lead.length + k] = r.line));

  const w = lead.length + named.length;
  const sampleColumn: Record<number, number> = Object.create(null) as Record<number, number>;
  const rows: RawRow[] = samples.map((c) => {
    const header = text(sheet.header[c]);
    const cells: RawCell[] = [...lead.map(() => header), ...named.map((r) => r.cells[c] ?? null)];
    const line = TURNED_LINE_BASE + c;
    sampleColumn[line] = c;
    return { line, cells, fieldCount: w };
  });

  return {
    name: sheet.name,
    header: [...lead, ...names],
    headerLine: sheet.headerLine,
    rows,
    turn: { nameColumn: decl.nameColumn, notSamples: [...decl.notSamples], ...(decl.headerDates === true ? { headerDates: true } : {}), source: sheet, sampleColumn, nameLine, labelColumns, blankHeaders, repeatedHeaders, blankNameLines, repeatedNames },
  };
}

/** The file as the converter reads it: every sheet the person declared turned, replaced by its turn. Pure; the same file object comes back when nothing was turned. */
export function turnConvertFile(file: ParsedFile, declarations: Readonly<Record<string, TurnDeclaration>>): ParsedFile {
  let changed = false;
  const sheets = file.sheets.map((s) => {
    if (!Object.prototype.hasOwnProperty.call(declarations, s.name) || s.turn !== undefined) return s;
    changed = true;
    return turnSheet(s, declarations[s.name]);
  });
  return changed ? { ...file, sheets } : file;
}

const lettersOf = (columns: readonly number[]): string => columns.map(columnLetters).join(', ');

/**
 * What the turn says about the sheet: a header that cannot be turned (blank, repeated) or a row with no name blocks (the lines named are those of the SOURCE), and one information finding
 * says that the sheet was turned. Pure.
 */
export function turnFindings(file: string, sheet: RawSheet): Finding[] {
  const t = sheet.turn;
  if (t === undefined) return [];
  const base = { file, sheet: sheet.name };
  const out: Finding[] = [];
  if (t.blankHeaders.length > 0) out.push(makeConvertFinding('CONV-TURN-HEADER-BLANK', { ...base, lines: [t.source.headerLine], params: { count: t.blankHeaders.length, columns: lettersOf(t.blankHeaders) } }));
  for (const r of t.repeatedHeaders) out.push(makeConvertFinding('CONV-TURN-HEADER-REPEATED', { ...base, lines: [t.source.headerLine], params: { header: r.header, count: r.columns.length, columns: lettersOf(r.columns) } }));
  if (t.blankNameLines.length > 0) out.push(makeConvertFinding('CONV-TURN-NAME-BLANK', { ...base, lines: t.blankNameLines.slice(0, MAX_FINDING_LINES), params: { count: t.blankNameLines.length } }));
  for (const r of t.repeatedNames) out.push(makeConvertFinding('CONV-TURN-NAME-REPEATED', { ...base, lines: r.lines.slice(0, MAX_FINDING_LINES), params: { name: r.name, count: r.lines.length } }));
  out.push(makeConvertFinding('CONV-SHEET-TURNED', { ...base, params: { rows: Object.keys(t.nameLine).length, samples: Object.keys(t.sampleColumn).length } }));
  return out;
}

/**
 * The findings about cells of a turned sheet name lines that are not the file's: a finding about a row-name column goes to the line of that name in the source, any other finding about the turned
 * rows to the header line of the source (the samples are its columns). `params.turnedColumn` lists every source column the turned lines came from, sorted and joined with ', ' ("B, C"),
 * capped as the lines are; the page reads it and says "(column C)". Findings that name only real lines are returned as they are. Pure.
 */
export function turnedLines(findings: readonly Finding[], file: string, sheet: RawSheet): Finding[] {
  const t = sheet.turn;
  if (t === undefined) return [...findings];
  const position = new Map(sheet.header.map((h, i) => [h, i] as const));
  return findings.map((f) => {
    if (f.file !== file || f.sheet !== sheet.name || f.lines === undefined) return f;
    const turned = f.lines.filter((l) => l >= TURNED_LINE_BASE);
    if (turned.length === 0) return f;
    const columns = [...new Set(turned.flatMap((l) => (t.sampleColumn[l] === undefined ? [] : [t.sampleColumn[l]])))].sort((a, b) => a - b).slice(0, MAX_FINDING_LINES);
    const at = f.field === undefined ? undefined : position.get(f.field);
    const line = at === undefined ? t.source.headerLine : (t.nameLine[at] ?? t.source.headerLine);
    const lines = [...new Set([...f.lines.filter((l) => l < TURNED_LINE_BASE), line])].sort((a, b) => a - b);
    return { ...f, lines, params: { ...f.params, ...(columns.length === 0 ? {} : { turnedColumn: lettersOf(columns) }) } };
  });
}
