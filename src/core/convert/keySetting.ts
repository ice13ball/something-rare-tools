// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

/*
 * How a picked sample key is kept in the companion file: `sampleKey=<sheet>:<hashes>:<rows>`.
 *   <sheet>   the sheet's name (never a value);
 *   <hashes>  one short hash per key column, joined with "+": 8 hex digits of the header with case, spacing and underscores folded away, and, when several columns of the sheet fold to the
 *             same name, `.<n>of<m>` (which of the m equal columns it is). The file holds NO header text: a header cannot be read back from 32 bits;
 *   <rows>    the number of rows of the sheet the pick was made for (a count, as every saved answer carries the count it was given for).
 * Read back against a header row: the key holds only when every column of it is found again (the folded name is the same, and the number of columns of that name is the same) AND the sheet has the same
 * number of rows. Otherwise nothing is applied and the question is open again. It is a pre-pick: the page shows it with its numbers and "Ask again", and never sets it silently.
 */

/** A header compared the way a person reads it: case, spacing and underscores do not tell two columns apart. */
export function foldHeader(h: string): string {
  return h.normalize('NFKC').toLowerCase().replace(/[\s_]+/g, '');
}

/** A short hash (32 bits, 8 hex digits) of a text: enough to find a column again, no way to read the text back. */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

const hashOf = (header: string): string => shortHash(`f${foldHeader(header)}`);

/** The hashes of the columns `columns` of a header row, in the order given. A column outside the header gives nothing (the whole key is then not kept). */
export function keyHashes(header: readonly string[], columns: readonly number[]): string | undefined {
  const all = header.map(hashOf);
  const tokens: string[] = [];
  for (const i of columns) {
    if (!Number.isInteger(i) || i < 0 || i >= header.length) return undefined;
    const same = all.flatMap((h, j) => (h === all[i] ? [j] : []));
    tokens.push(same.length === 1 ? all[i] : `${all[i]}.${same.indexOf(i) + 1}of${same.length}`);
  }
  return tokens.length === 0 ? undefined : tokens.join('+');
}

const TOKEN = /^([0-9a-f]{8})(?:\.(\d{1,4})of(\d{1,4}))?$/;

/** The column indexes the hashes name in this header row, or undefined when any of them is not found exactly (changed header, a different number of equal columns, a column twice). */
export function resolveKeyHashes(header: readonly string[], hashes: string): number[] | undefined {
  const all = header.map(hashOf);
  const out: number[] = [];
  for (const token of hashes.split('+')) {
    const m = TOKEN.exec(token);
    if (m === null) return undefined;
    const same = all.flatMap((h, j) => (h === m[1] ? [j] : []));
    const n = m[2] === undefined ? 1 : Number(m[2]);
    const of = m[3] === undefined ? 1 : Number(m[3]);
    if (same.length !== of || n < 1 || n > of) return undefined;
    out.push(same[n - 1]);
  }
  return out.length > 0 && new Set(out).size === out.length ? out : undefined;
}
