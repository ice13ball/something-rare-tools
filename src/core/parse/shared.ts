// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Finding, RawRow } from '../types';
import { makeFinding } from '../rules/registry';
import type { DecodedText } from '../values/encoding';

/**
 * Thrown by parseFile when a file cannot be read at all (corrupt workbook, malformed XML or JSON, JSON that is
 * neither a DataCite nor a Zenodo record). There is deliberately no rule for it: the message is already plain
 * English and names the file, so the caller shows it as-is. Anything merely odd (ragged rows, fallback encoding,
 * decimal commas) is a Finding on the returned ParsedFile instead and never throws.
 */
export class ParseError extends Error {
  readonly fileName: string;
  constructor(fileName: string, message: string) {
    super(`${fileName}: ${message}`);
    this.name = 'ParseError';
    this.fileName = fileName;
  }
}

/** Splits text into physical lines. CRLF is one break, a lone CR is one, a lone LF is one. A trailing break adds no line. */
export function splitPhysicalLines(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** One ROW-RAGGED finding listing every row whose field count differs from the header's; undefined when none. */
export function raggedFinding(fileName: string, sheet: string, headerLength: number, rows: readonly RawRow[]): Finding | undefined {
  const bad = rows.filter((r) => r.fieldCount !== headerLength);
  if (bad.length === 0) return undefined;
  return makeFinding('ROW-RAGGED', {
    file: fileName,
    sheet,
    lines: bad.map((r) => r.line),
    params: { expected: headerLength, found: bad[0].fieldCount },
  });
}

export function encodingFinding(fileName: string, d: Pick<DecodedText, 'encoding' | 'fallback'>): Finding | undefined {
  return d.fallback ? makeFinding('IN-ENCODING-FALLBACK', { file: fileName, params: { encoding: d.encoding } }) : undefined;
}
