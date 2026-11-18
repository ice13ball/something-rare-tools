// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Finding, ParsedFile, RawRow, RawSheet } from '../types';
import { makeFinding } from '../rules/registryCheck';
import type { DecodedText } from '../values/encoding';
import { encodingFinding, extendShortHeader, foldStatisticSubheader, foldUnitsRow, raggedFinding } from './shared';

export interface CsvRecord {
  /** physical line where the record STARTS (a quoted field with newlines belongs to its first line) */
  line: number;
  fields: string[];
  /** a line with nothing but whitespace outside quotes */
  blank: boolean;
}

const SNIFF_LINES = 50;

/**
 * RFC 4180 tokeniser. Counts every line break (CRLF = one, lone CR = one, LF = one) including inside quotes.
 * A quote opens a quoted field only at the very start of a field; elsewhere it is literal. Stray characters
 * after a closing quote are kept. An unterminated quote runs to the end of the text. Stops after `maxRecords`
 * non-blank records (used by delimiter sniffing). `quote` is the enclosing character; '' means fields are never
 * enclosed (a Darwin Core Archive with fieldsEnclosedBy="" must not read a stray quote as the start of a field).
 */
export function tokenizeCsv(text: string, delim: string, maxRecords = Infinity, quote = '"'): CsvRecord[] {
  const out: CsvRecord[] = [];
  let nonBlank = 0;
  let line = 1;
  let recLine = 1;
  let fields: string[] = [];
  let cur = '';
  let inQ = false;
  let wasQuoted = false;
  let fieldStart = true;
  let pending = false; // the record has consumed at least one character
  let quotedInRecord = false;

  const endField = () => {
    fields.push(cur);
    cur = '';
    wasQuoted = false;
    fieldStart = true;
  };
  const endRecord = () => {
    endField();
    const blank = fields.length === 1 && fields[0].trim() === '' && !quotedInRecord;
    out.push({ line: recLine, fields, blank });
    if (!blank) nonBlank++;
    fields = [];
    pending = false;
    quotedInRecord = false;
  };

  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text[i];
    pending = true;
    if (inQ) {
      if (c === quote) {
        if (text[i + 1] === quote) {
          cur += quote;
          i++;
        } else {
          inQ = false;
        }
      } else if (c === '\r') {
        cur += '\r';
        if (text[i + 1] === '\n') {
          cur += '\n';
          i++;
        }
        line++;
      } else {
        if (c === '\n') line++;
        cur += c;
      }
      continue;
    }
    if (c === delim) {
      endField();
    } else if (c === quote && fieldStart) {
      inQ = true;
      wasQuoted = true;
      quotedInRecord = true;
      fieldStart = false;
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      recLine = line;
      if (nonBlank >= maxRecords) return out;
    } else {
      cur += c;
      fieldStart = false;
    }
  }
  if (pending || fields.length > 0 || cur !== '' || wasQuoted) endRecord();
  return out;
}

/** Delimiter whose field counts are most consistent (and > 1) over the first 50 non-empty lines. */
export function detectDelimiter(text: string): string {
  let best = ',';
  let bestScore = 0;
  // Tie-break order: tab, semicolon, comma (a decimal comma or a comma in prose must not beat a real delimiter).
  for (const d of ['\t', ';', ','] as const) {
    const recs = tokenizeCsv(text, d, SNIFF_LINES).filter((r) => !r.blank);
    if (recs.length === 0) continue;
    const freq = new Map<number, number>();
    for (const r of recs) freq.set(r.fields.length, (freq.get(r.fields.length) ?? 0) + 1);
    let modal = 0;
    let modalN = 0;
    for (const [count, k] of freq) {
      if (count > 1 && (k > modalN || (k === modalN && count > modal))) {
        modal = count;
        modalN = k;
      }
    }
    const score = modalN / recs.length;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

const DEC_POINT = /^-?\d+\.\d+(?:[eE][+-]?\d+)?$/;
const DEC_COMMA = /^-?\d+,\d+$/;
/** A cell that settles the column as decimal comma: '1.250,5' (point thousands groups, a decimal comma). */
const SETTLES_DECIMAL = /^-?\d{1,3}(?:\.\d{3})+,\d+$/;
/** A cell written with comma thousands groups ('1,250,000'): the column writes thousands with commas, yet the reader still reads its 'n,nnn' cells as decimals, so the question stays and names it. */
const COMMA_GROUPS = /^-?\d{1,3}(?:,\d{3}){2,}(?:\.\d+)?$/;
/** A comma value whose comma may be a thousands separator: one to three digits (no leading zero), a comma, exactly three digits. */
export const THOUSANDS_LIKE = /^-?[1-9]\d{0,2},\d{3}$/;

/**
 * Decimal-comma heuristic (a parsing heuristic, not a QC threshold): the delimiter is ';' or tab, and at least
 * 80 % of the cells that carry a decimal separator in the first 50 rows are written 'n,n'. Integers say nothing
 * about the separator and are ignored.
 */
export function looksDecimalComma(delim: string, rows: readonly (readonly string[])[]): boolean {
  if (delim !== ';' && delim !== '\t') return false;
  let comma = 0;
  let total = 0;
  for (const r of rows.slice(0, SNIFF_LINES)) {
    for (const cell of r) {
      const t = cell.trim();
      if (DEC_COMMA.test(t)) {
        comma++;
        total++;
      } else if (DEC_POINT.test(t)) total++;
    }
  }
  return total > 0 && comma / total >= 0.8;
}

const cellText = (v: string | number | boolean | null | undefined): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Columns of a decimal-comma sheet whose comma may be a thousands separator: at least one cell written 'n,n' and EVERY such
 * cell has exactly three digits after the comma (and one to three before it). One value with 1, 2 or 4+ decimals, a leading
 * zero or more than three integer digits settles the column (not ambiguous). Judged per column, over all rows; cells without a
 * comma (integers, 'n.n') do not decide anything. `example` is the first such cell as written; `lines` are the file lines of
 * every cell of the column written 'n,n' (the same cells `count` counts). A cell written '1.250,5' settles the column as decimal comma.
 * A cell written '1,250,000' does not settle it (the reader still reads the column's '1,250' as 1.25): it is returned as `thousandsSeen`.
 */
export function thousandsAmbiguity(sheet: RawSheet): { index: number; lines: number[]; example: string; thousandsSeen?: string }[] {
  const out: { index: number; lines: number[]; example: string; thousandsSeen?: string }[] = [];
  for (let c = 0; c < sheet.header.length; c++) {
    let example: string | undefined;
    let thousandsSeen: string | undefined;
    let ambiguous = true;
    for (const r of sheet.rows) {
      const t = cellText(r.cells[c]);
      if (SETTLES_DECIMAL.test(t)) {
        ambiguous = false;
        break;
      }
      if (COMMA_GROUPS.test(t)) {
        thousandsSeen ??= t;
        continue;
      }
      if (!DEC_COMMA.test(t)) continue;
      if (!THOUSANDS_LIKE.test(t)) {
        ambiguous = false;
        break;
      }
      example ??= t;
    }
    if (!ambiguous || example === undefined) continue;
    const lines = sheet.rows.filter((r) => DEC_COMMA.test(cellText(r.cells[c]))).map((r) => r.line);
    out.push({ index: c, lines, example, ...(thousandsSeen !== undefined ? { thousandsSeen } : {}) });
  }
  return out;
}

/** The two readings of an ambiguous cell, built from its text by moving the comma: '1,250' reads 1.25 or 1250. */
function thousandsReadings(example: string): { asDecimal: string; asThousands: string } {
  const asThousands = example.replace(',', '');
  const asDecimal = example.replace(',', '.').replace(/0+$/, '').replace(/\.$/, '');
  return { asDecimal, asThousands };
}

/**
 * Parses CSV/TSV text. `decoded` carries what decodeText found when the caller had bytes; without it the text is
 * assumed UTF-8 (a leading U+FEFF is still stripped and reported as 'utf-8-bom').
 */
export function parseCsvText(text: string, fileName: string, decoded?: Pick<DecodedText, 'encoding' | 'fallback'>): ParsedFile {
  let encoding: string = decoded?.encoding ?? 'utf-8';
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
    if (!decoded) encoding = 'utf-8-bom';
  }
  const findings: Finding[] = [];
  const enc = decoded ? encodingFinding(fileName, decoded) : undefined;
  if (enc) findings.push(enc);

  const file: ParsedFile = { fileName, kind: 'csv', sheets: [], date1904: false, decimalComma: false, encoding, findings };

  const delim = detectDelimiter(text);
  const records = tokenizeCsv(text, delim).filter((r) => !r.blank);
  if (records.length === 0) return file;

  let header = records[0].fields;
  let body = records.slice(1).map((r) => ({ line: r.line, cells: r.fields as string[] }));

  // An empty trailing header cell goes together with the matching trailing cell, but only when EVERY line has it.
  while (header.length > 1 && header[header.length - 1] === '' && body.every((r) => r.cells[r.cells.length - 1] === '' && r.cells.length > 0)) {
    header = header.slice(0, -1);
    body = body.map((r) => ({ line: r.line, cells: r.cells.slice(0, -1) }));
  }

  let rows: RawRow[] = body.map((r) => ({ line: r.line, cells: r.cells, fieldCount: r.cells.length }));
  // decimalComma is known before any fold: a units row is judged by the numbers below it
  file.decimalComma = looksDecimalComma(delim, body.map((r) => r.cells));
  if (file.decimalComma) findings.push(makeFinding('IN-DECIMAL-COMMA', { file: fileName }));
  // a second header row of statistic labels (mean, st.dev.) is part of the header, not a data row
  const fold = foldStatisticSubheader(header, rows);
  if (fold) {
    header = fold.header;
    rows = fold.rows;
  }
  // so is a row of units (ERDDAP, BCO-DMO), after the statistic labels when there were any
  const unitsFold = foldUnitsRow(header, rows, file.decimalComma);
  if (unitsFold) {
    header = unitsFold.header;
    rows = unitsFold.rows;
    // a name got a unit: said with the first one as the example; every name had its unit already: the row is still not data, and that is said too (never "0 columns")
    if (unitsFold.example !== undefined) findings.push(makeFinding('IN-HEADER-UNITS-READ', { file: fileName, sheet: fileName, lines: [unitsFold.line], params: { count: unitsFold.count, example: unitsFold.example } }));
    else findings.push(makeFinding('IN-HEADER-UNITS-NAMED', { file: fileName, sheet: fileName, lines: [unitsFold.line] }));
  }
  // statistic labels written UNDER the units (units, then mean / st.dev.) are the same second header, in the other order
  const fold2 = unitsFold && !fold ? foldStatisticSubheader(header, rows) : undefined;
  if (fold2) {
    header = fold2.header;
    rows = fold2.rows;
  }

  const sheet: RawSheet = { name: fileName, header, headerLine: records[0].line, rows, ...(fold || unitsFold ? { subHeaderLine: (fold2 ?? unitsFold ?? fold)!.line } : {}), ...(unitsFold ? { unitsRowLine: unitsFold.line } : {}) };
  const shortHeader = extendShortHeader(fileName, fileName, header, rows, file.decimalComma);
  if (shortHeader?.kind === 'trim') {
    // fields past the header are empty in every row: the rows end with a delimiter. Drop them; rows with and without it are both regular.
    sheet.rows = rows.map((r) => (r.cells.length > header.length ? { line: r.line, cells: r.cells.slice(0, header.length), fieldCount: header.length } : r));
  } else if (shortHeader) {
    sheet.header = shortHeader.header;
    sheet.unnamedFrom = shortHeader.unnamedFrom;
    findings.push(shortHeader.finding);
  }
  file.sheets.push(sheet);
  const rag = raggedFinding(fileName, fileName, sheet.header.length, sheet.rows);
  if (rag) findings.push(rag);
  if (file.decimalComma) {
    for (const col of thousandsAmbiguity(sheet)) {
      const count = sheet.rows.filter((r) => DEC_COMMA.test(cellText(r.cells[col.index]))).length;
      findings.push(
        makeFinding('IN-DECIMAL-AMBIGUOUS', {
          file: fileName,
          sheet: fileName,
          lines: col.lines,
          value: col.example,
          params: { column: sheet.header[col.index] || `Column ${col.index + 1}`, index: col.index, count, ...thousandsReadings(col.example), ...(col.thousandsSeen !== undefined ? { thousandsSeen: col.thousandsSeen } : {}) },
        }),
      );
    }
  }
  return file;
}
