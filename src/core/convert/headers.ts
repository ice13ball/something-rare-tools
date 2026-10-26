// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ParsedFile, RawSheet } from '../types';

/*
 * What the header of a taxon column of a wide sheet says about the taxon, apart from its unit.
 *
 *   "Ctenophora [#/m**3]"                                   -> the name is "Ctenophora"; "[#/m**3]" is the unit and never part of the name
 *   "C. finmarchicus c2 [#/m**3] (including Calanus glacialis)" -> a unit, then a remark in brackets: the remark is not part of the name either
 *
 * A PANGAEA file names every column twice: the table header holds an ABBREVIATION ("A. minor c1 [#/m**3]", "S. polaris c3 [#/m**3]") and the
 * header block lists the LONG name of each parameter in column order ("Aetideus minor, c1", "Scaphocalanus polaris, c3"). Abbreviations collide
 * (two genera can share "S. polaris"), long names do not; so when the parameter list stands for this table (same number of columns, and each
 * abbreviation is what the header of its column starts with), the long name is the taxon text. The occurrenceID is built from it too (below).
 */

export interface TaxonColumnName {
  /** The text that is split into scientificName, qualifier and stage, and written as verbatimIdentification: the long name of a PANGAEA parameter, else the header without its unit and remark. */
  verbatim: string;
  /** The remark of the column (a PANGAEA parameter comment, or the bracket text after the unit), written to occurrenceRemarks: nothing the file says about the column is lost. */
  remark?: string;
  /** The text the occurrenceID is built from: `verbatim`, and only when another column of the sheet has the same `verbatim`, the remark (else the header) that tells them apart. */
  idText: string;
  /** The abbreviation of the table header, when the long name was taken from the parameter list. */
  abbreviation?: string;
}

/** A header without a unit bracket and without a trailing remark in round brackets, and the two parts it lost. */
export function stripHeaderUnit(header: string): { name: string; unit?: string; remark?: string } {
  let s = header.trim();
  let unit: string | undefined;
  let remark: string | undefined;
  // "[unit]" anywhere: a square bracket in a header is a unit (the shared unit reader treats it the same way)
  const sq = /\s*\[([^[\]]*)\]/.exec(s);
  if (sq) {
    unit = sq[1].trim();
    // the text after the unit, in round brackets, is a remark about the column ("... [#/m**3] (including Calanus glacialis)")
    const after = s.slice(sq.index + sq[0].length).trim();
    const r = /^\(([^()]*)\)$/.exec(after);
    if (r) remark = r[1].trim();
    s = (s.slice(0, sq.index) + (r ? '' : ' ' + after)).replace(/\s+/g, ' ').trim();
  }
  return { name: s, ...(unit ? { unit } : {}), ...(remark ? { remark } : {}) };
}

/** The base of a table header for comparing with a PANGAEA abbreviation: no unit bracket, no trailing round-bracket group. */
const headerBase = (h: string): string => h.replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^()]*\)\s*$/, '').trim().toLowerCase();

/** Does the PANGAEA parameter list stand for this table, column by column? */
function parametersOf(file: ParsedFile, sheet: RawSheet) {
  if (file.kind !== 'pangaea') return undefined;
  const params = file.pangaeaParameters;
  if (params === undefined || params.length !== sheet.header.length) return undefined;
  return params.every((p, i) => p.short !== undefined && p.short.trim().toLowerCase() === headerBase(sheet.header[i] ?? '')) ? params : undefined;
}

/**
 * The names of the taxon columns of a sheet (`columns` are the wide taxon header columns, in column order), by column index.
 * Two columns that share a name stay two columns and are never summed: they are told apart in `idText` by what the file says about them (CONV-TAXON-SAME-EVENT then says that
 * the sample holds the same taxon twice, for the user to accept).
 */
export function taxonColumnNames(file: ParsedFile, sheet: RawSheet, columns: readonly { index: number; header: string }[]): Map<number, TaxonColumnName> {
  const params = parametersOf(file, sheet);
  const draft = columns.map((c) => {
    const own = stripHeaderUnit(c.header);
    const p = params?.[c.index];
    if (p !== undefined && p.name.trim() !== '') {
      return { c, verbatim: p.name.trim(), remark: p.comment?.trim() || own.remark, abbreviation: own.name };
    }
    return { c, verbatim: own.name, remark: own.remark, abbreviation: undefined as string | undefined };
  });
  const count = new Map<string, number>();
  for (const d of draft) count.set(d.verbatim, (count.get(d.verbatim) ?? 0) + 1);
  // columns that share a text are told apart by their remark, else by their header; when neither differs (the very same header twice) they keep the same ID and the
  // export blocks (CONV-ID-DUPLICATE asks the user to rename one): two columns are never merged and never summed
  const taken = new Set<string>(draft.map((d) => d.verbatim));
  const idOf = (d: (typeof draft)[number]): string => {
    if ((count.get(d.verbatim) ?? 0) < 2) return d.verbatim;
    const group = draft.filter((o) => o.verbatim === d.verbatim);
    const candidates = [
      d.remark !== undefined && group.filter((o) => o.remark === d.remark).length === 1 ? `${d.verbatim} (${d.remark})` : undefined,
      group.filter((o) => o.c.header.trim() === d.c.header.trim()).length === 1 ? `${d.verbatim} (${d.c.header.trim()})` : undefined,
    ];
    for (const t of candidates) {
      if (t !== undefined && !taken.has(t)) {
        taken.add(t);
        return t;
      }
    }
    return d.verbatim;
  };
  const out = new Map<number, TaxonColumnName>();
  for (const d of draft) {
    out.set(d.c.index, { verbatim: d.verbatim, idText: idOf(d), ...(d.remark === undefined ? {} : { remark: d.remark }), ...(d.abbreviation === undefined ? {} : { abbreviation: d.abbreviation }) });
  }
  return out;
}
