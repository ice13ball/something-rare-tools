// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { stripTypeSuffix } from '../recognize/columns';
import { rankJoinKeys } from '../recognize/layout';
import type { KeySide } from '../recognize/layout';
import type { RawSheet } from '../types';
import type { ConvertSheetInput } from './build';

/*
 * The sample-sheet join: a results sheet (counts per taxon) names its samples by a code, and another sheet of the same run describes them (station, date, position, depth). This file PROPOSES
 * which sheet describes which and by which key; it never applies anything. Nothing joins until the person confirms (declare-first). The proposal reads only roles already on screen (sample code,
 * station, cruise, the picked key parts, taxon) and header equality, and how many of the results sheet's keys the other sheet has: a measurement, not a guess of a role from values.
 * Sheets are addressed by their index in the inputs handed in, so two files with one sheet name never mix.
 */

export type JoinSide = 'description' | 'results';
/** One key column on each side, by column index. */
export interface JoinKeyPair { results: number; description: number }

export interface SampleJoinProposal {
  /** Index of the results sheet in the inputs. */
  results: number;
  /** Index of the describing sheet in the inputs. */
  description: number;
  /** The key: one pair, or several that together identify a sample (a picked key: all its parts). */
  keys: JoinKeyPair[];
  /** How many of the results sheet's samples (distinct keys) the description sheet has. */
  covered: number;
  /** How many samples (distinct, non-blank keys) the results sheet has. */
  samples: number;
  /** The key identifies one row of the description sheet. */
  unique: boolean;
  /** The description sheet is a long sheet read through its pivot (`RawSheet.pivot !== undefined`): shown, never joinable for now. */
  long: boolean;
}

const cleanHeader = (h: string): string => stripTypeSuffix(h).toLowerCase();
const hasTaxon = (s: ConvertSheetInput): boolean => s.mapping.columns.some((c) => c.role.kind === 'taxon');
const sheetOf = (s: ConvertSheetInput): RawSheet | undefined => s.file.sheets.find((x) => x.name === s.sheet);
const RIGHT_KINDS = new Set(['sampleId', 'station', 'cruise']);

/**
 * For each results sheet (a taxon column or taxon headers, not a profile sheet), the sheet that describes its samples best and the key, when the description has at least half of the results
 * sheet's samples. `skip` = pairs already confirmed or declined. A results sheet gets at most one proposal; one description may serve several results sheets.
 */
export function proposeSampleJoins(sheets: readonly ConvertSheetInput[], skip: readonly { results: number; description: number }[]): SampleJoinProposal[] {
  const out: SampleJoinProposal[] = [];
  sheets.forEach((res, ri) => {
    if (res.profile !== undefined || !hasTaxon(res)) return;
    const resSheet = sheetOf(res);
    if (resSheet === undefined) return;
    const picked = res.sampleKey?.columns ?? [];
    const pickedSet = new Set(picked);
    // the left key columns, in the column order of the results sheet (a tie goes to the earlier column)
    const leftCols = res.mapping.columns.filter((c) => (picked.length > 0 ? pickedSet.has(c.index) : c.role.kind === 'sampleId') || c.role.kind === 'station' || c.role.kind === 'cruise');
    if (leftCols.length === 0) return;
    const leftHeaders = new Set(leftCols.map((c) => cleanHeader(c.header)));
    const candidates: { index: number; side: KeySide }[] = [];
    sheets.forEach((d, di) => {
      if (di === ri || d.profile !== undefined || hasTaxon(d) || skip.some((p) => p.results === ri && p.description === di)) return;
      const dSheet = sheetOf(d);
      if (dSheet === undefined) return;
      const columns = d.mapping.columns.filter((c) => RIGHT_KINDS.has(c.role.kind) || leftHeaders.has(cleanHeader(c.header)));
      if (columns.length > 0) candidates.push({ index: di, side: { sheet: dSheet, columns } });
    });
    if (candidates.length === 0) return;
    const j = rankJoinKeys({ sheet: resSheet, columns: leftCols }, candidates.map((c) => c.side), { coverage: 'measure', ...(picked.length > 0 ? { kinds: 'any' as const, together: picked } : {}) });
    if (j === undefined || j.covered * 2 < j.total) return;
    const keys: JoinKeyPair[] = [{ results: j.leftKey, description: j.rightKey }, ...(j.extraKeys ?? []).map((k) => ({ results: k.leftKey, description: k.rightKey }))];
    const di = candidates[j.right].index;
    out.push({ results: ri, description: di, keys, covered: j.covered, samples: j.total, unique: j.unique, long: sheetOf(sheets[di])?.pivot !== undefined });
  });
  return out;
}
