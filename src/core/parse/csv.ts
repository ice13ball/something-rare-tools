// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Finding, ParsedFile, RawRow } from '../types';
import { makeFinding } from '../rules/registry';
import type { DecodedText } from '../values/encoding';
import { encodingFinding, raggedFinding } from './shared';

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
 * non-blank records (used by delimiter sniffing).
 */
export function tokenizeCsv(text: string, delim: string, maxRecords = Infinity): CsvRecord[] {
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
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
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
    } else if (c === '"' && fieldStart) {
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

  const rows: RawRow[] = body.map((r) => ({ line: r.line, cells: r.cells, fieldCount: r.cells.length }));
  file.decimalComma = looksDecimalComma(delim, body.map((r) => r.cells));
  if (file.decimalComma) findings.push(makeFinding('IN-DECIMAL-COMMA', { file: fileName }));

  file.sheets.push({ name: fileName, header, headerLine: records[0].line, rows });
  const rag = raggedFinding(fileName, fileName, header.length, rows);
  if (rag) findings.push(rag);
  return file;
}
