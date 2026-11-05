// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

/**
 * Splits CSV text into records of RAW field strings (quotes and escapes kept as written), respecting quoted fields with commas, quotes and line breaks.
 * Only for the clean CSV this project writes (LF between records, a final LF).
 */
export function rawRecords(csv: string): string[][] {
  const records: string[][] = [];
  let fields: string[] = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (quoted) {
      if (ch === '"') quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      fields.push(csv.slice(start, i));
      start = i + 1;
    } else if (ch === '\n') {
      fields.push(csv.slice(start, i));
      records.push(fields);
      fields = [];
      start = i + 1;
    }
  }
  if (start < csv.length) {
    fields.push(csv.slice(start));
    records.push(fields);
  }
  return records;
}

/** The CSV with its last `k` columns removed from every record, the rest byte for byte as it was. */
export function stripTrailingColumns(csv: string, k: number): string {
  if (k === 0) return csv;
  return rawRecords(csv).map((r) => r.slice(0, r.length - k).join(',')).join('\n') + '\n';
}
