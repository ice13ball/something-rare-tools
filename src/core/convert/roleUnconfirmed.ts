// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ColumnProposal, ParsedFile, RawSheet, SheetMapping } from '../types';
import { encodeListedColumns } from '../rules/convert';
import { keyHashes } from './keySetting';
import { proposeConvertColumns } from './recognize';
import { withStated } from './stated';

/*
 * CONV-ROLE-UNCONFIRMED: the columns whose role the converter PROPOSED and the file does not STATE by name.
 *
 * Only the five roles that decide what the archive says about a row are looked at: the taxon, the quantity, the date, the latitude and the longitude. A column is listed when
 *   - the proposer gave it one of those roles, the mapping still holds exactly that role, and the person has not touched the column (the page sends the columns whose role the person changed, `handSet`:
 *     such a column is theirs and is never listed, even when they chose the very role proposed), and
 *   - the file does not state it (core/convert/stated.ts: an exact Darwin Core term, an exact vocabulary entry, a unit the header declares, a PANGAEA geocode; the cells may only take that away).
 * Nothing is re-roled here and nothing is learned from the cells: the proposals are those of `proposeConvertColumns`, the mark is `withStated`'s, and the mapping is read, never written. The
 * wide sheet's taxon HEADERS (a species name as a column header, role `taxon` with `header: true`) are the page's own "unconfirmed taxon columns" and are not listed here.
 */

export type ListedRole = 'taxon' | 'quantity' | 'date' | 'latitude' | 'longitude';

export interface UnconfirmedColumn {
  index: number;
  /** What makes the column itself: the hash of its folded header and, when several columns fold to the same name, which of them it is (core/convert/keySetting.ts). Not its position. */
  id: string;
  /** The role as the column table names it (`datetime` is not `date`). */
  shown: string;
  header: string;
  role: ListedRole;
  /** The first few distinct cells of the column, as they are in the file (cut at 30 characters). */
  cells: string[];
}

const LISTED: Record<string, ListedRole> = { taxon: 'taxon', quantity: 'quantity', date: 'date', datetime: 'date', latitude: 'latitude', longitude: 'longitude' };
const SHOWN_CELLS = 3;
const CELL_CUT = 30;

// the proposals of a sheet (marked) are read from the cells once per sheet object and context: a conversion is asked again after every click
const marked = new WeakMap<RawSheet, { key: string; proposals: ColumnProposal[] }>();

function markedProposals(file: ParsedFile, sheet: RawSheet): ColumnProposal[] {
  const key = `${file.decimalComma}|${file.date1904}|${file.kind}`;
  const hit = marked.get(sheet);
  if (hit !== undefined && hit.key === key) return hit.proposals;
  const proposals = proposeConvertColumns(sheet, { decimalComma: file.decimalComma, date1904: file.date1904 });
  const out = withStated(sheet, proposals, { decimalComma: file.decimalComma, date1904: file.date1904, pangaea: file.kind === 'pangaea' });
  marked.set(sheet, { key, proposals: out });
  return out;
}

function exampleCells(sheet: RawSheet, index: number): string[] {
  const seen = new Set<string>();
  for (const r of sheet.rows) {
    const c = r.cells[index] ?? null;
    if (c === null) continue;
    const text = String(c).trim();
    if (text === '' || seen.has(text)) continue;
    seen.add(text);
    if (seen.size >= SHOWN_CELLS) break;
  }
  return [...seen].map((t) => (t.length > CELL_CUT ? `${t.slice(0, CELL_CUT)}…` : t));
}

/** The listed columns of one sheet, in column order. `mapping` is the roles the converter is going to use (the confirmed ones). */
export function unconfirmedRoles(file: ParsedFile, sheet: RawSheet, mapping: SheetMapping, handSet: readonly number[] = []): UnconfirmedColumn[] {
  const out: UnconfirmedColumn[] = [];
  for (const p of markedProposals(file, sheet)) {
    const role = LISTED[p.role.kind];
    if (role === undefined || p.stated === true) continue;
    if (p.role.kind === 'taxon' && p.role.header === true) continue;
    if (handSet.includes(p.index)) continue;
    const now = mapping.columns.find((c) => c.index === p.index);
    // the role of the mapping is not the proposal's: changed by the person (or by a companion file, which only carries what a person set)
    if (now === undefined || JSON.stringify(now.role) !== JSON.stringify(p.role)) continue;
    out.push({ index: p.index, id: keyHashes(sheet.header, [p.index]) ?? String(p.index), shown: p.role.kind, header: p.header.trim() === '' ? `#${p.index + 1}` : p.header.trim(), role, cells: exampleCells(sheet, p.index) });
  }
  return out;
}

/** The parameters of the finding of one sheet: `columns` (the text the rule shows, rules/convert.ts encodeListedColumns) and `keys` (index:role, for the page's acceptance of a set), and the count. */
export function roleUnconfirmedParams(columns: readonly UnconfirmedColumn[]): { count: number; columns: string; keys: string } {
  return { count: columns.length, columns: encodeListedColumns(columns), keys: columns.map((c) => `${c.id}:${c.role}`).join(',') };
}
