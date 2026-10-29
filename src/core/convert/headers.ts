// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { stripTypeSuffix } from '../recognize/columns';
import { normaliseUnit } from '../recognize/vocab';
import type { ParsedFile, RawSheet } from '../types';
import { isStageText } from './taxon';
import { isAbundanceUnit } from './vocab';

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

/**
 * Does the text of a round bracket read as a unit? ("ind/m3", "#/m**3", "mg m-3", "ind. m-2"). A subgenus ("Parasagitta"), a stage ("c5") or a remark ("including X") is not one.
 * A round bracket is a unit only when it parses as one, exactly as the shared unit reader decides; a square bracket is always a unit.
 */
export function isUnitText(text: string): boolean {
  const t = text.trim();
  if (t === '') return false;
  return normaliseUnit(t) !== undefined || isAbundanceUnit(t) || /\*\*\d|[A-Za-zµμ]-\d$/.test(t) || /^[^/]*\/\s*(?:[kmcdnµu]?(?:m|l|g)|h|s|d|day|yr)\s*(?:\*\*|\^)?-?\d*$/i.test(t);
}

/**
 * A header without its unit and remark, and the parts it lost: "[unit]" anywhere, a "(unit)" at the end, and the "(remark)" after a unit. A round bracket that is not a unit and
 * stands before or without a unit stays in the name ("Sagitta (Parasagitta) elegans", "Calanus (Calanus) finmarchicus" are subgenera, and are kept).
 */
export function stripHeaderUnit(header: string): { name: string; unit?: string; remark?: string } {
  let s = stripTypeSuffix(header);
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
  // "(unit)" at the end of what is left: a unit as well, and no part of the name
  const round = /\s*\(([^()]*)\)\s*$/.exec(s);
  if (round && round.index > 0 && isUnitText(round[1])) {
    unit ??= round[1].trim();
    s = s.slice(0, round.index).trim();
  }
  return { name: s, ...(unit ? { unit } : {}), ...(remark ? { remark } : {}) };
}

/** The table header of a column starts with the abbreviation, and what follows it is the end, a unit bracket or a remark in brackets (the abbreviation may hold brackets of its own). */
const startsWithShort = (header: string, short: string): boolean => {
  const h = header.trim().toLowerCase();
  const s = short.trim().toLowerCase();
  return h.startsWith(s) && (h.length === s.length || /^\s*[[(]/.test(h.slice(s.length)));
};

/** Does the PANGAEA parameter list stand for this table, column by column? */
function parametersOf(file: ParsedFile, sheet: RawSheet) {
  if (file.kind !== 'pangaea') return undefined;
  const params = file.pangaeaParameters;
  if (params === undefined || params.length !== sheet.header.length) return undefined;
  return params.every((p, i) => p.short !== undefined && startsWithShort(sheet.header[i] ?? '', p.short)) ? params : undefined;
}

/** True when the long names of the parameter list are the names of this table's columns (false: the abbreviations of the table header are used). */
export const pangaeaNamesUsed = (file: ParsedFile, sheet: RawSheet): boolean => parametersOf(file, sheet) !== undefined;

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
    const long = p !== undefined && p.name.trim() !== '';
    const text = long ? p.name.trim() : own.name;
    const note = (long ? p.comment?.trim() : undefined) || own.remark;
    // a remark that is a stage ("c5", "nauplii") is the stage of this column: it goes to the name, so that each stage is a name of its own for the page and for lifeStage
    if (note !== undefined && isStageText(note)) return { c, verbatim: `${text}, ${note}`, remark: undefined as string | undefined, abbreviation: long ? own.name : undefined };
    return { c, verbatim: text, remark: note, abbreviation: long ? own.name : undefined };
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
