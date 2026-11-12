// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ColumnRole, ParsedFile, RawSheet, SheetMapping } from '../types';
import { proposeConvertColumns } from './recognize';

/*
 * CONV-COLUMN-YEAR-IGNORED / CONV-COLUMN-NUMBER-IGNORED: the columns a value veto of the overlay (convert/recognize.ts, last pass) took the measurement role away from.
 *
 * A numeric column whose name no vocabulary knows would be a measured variable. When every filled cell is a whole year and the sheet has a date column, or every filled cell is a whole number of six
 * or more digits and all of them differ, it is ignored instead (low confidence) and the person is told why, by name, once per sheet. Nothing is assigned: the one click the page offers gives the
 * column back the role it had (`vetoed` on the proposal). A column the person has already changed (`handSet`) or whose mapping role is no longer ignore is not listed.
 */

export type VetoReason = 'year' | 'number';
export interface VetoedColumn { index: number; header: string; reason: VetoReason; dates: boolean; role: ColumnRole }

const SEP = '\u001f';
const proposed = new WeakMap<RawSheet, { key: string; vetoed: { index: number; header: string; reasonCode: string; role: ColumnRole }[] }>();

function vetoedOf(file: ParsedFile, sheet: RawSheet): { index: number; header: string; reasonCode: string; role: ColumnRole }[] {
  const key = `${file.decimalComma}|${file.date1904}`;
  const hit = proposed.get(sheet);
  if (hit !== undefined && hit.key === key) return hit.vetoed;
  const vetoed = proposeConvertColumns(sheet, { decimalComma: file.decimalComma, date1904: file.date1904 }).flatMap((p) => (p.vetoed === undefined ? [] : [{ index: p.index, header: p.header, reasonCode: p.reasonCode ?? '', role: p.vetoed }]));
  proposed.set(sheet, { key, vetoed });
  return vetoed;
}

/** The vetoed columns of one sheet still set to ignore, in column order. */
export function vetoedColumns(file: ParsedFile, sheet: RawSheet, mapping: SheetMapping, handSet: readonly number[] = []): VetoedColumn[] {
  return vetoedOf(file, sheet).flatMap((v) => {
    if (handSet.includes(v.index) || mapping.columns.find((c) => c.index === v.index)?.role.kind !== 'ignore') return [];
    if (v.reasonCode !== 'year-beside-date' && v.reasonCode !== 'running-number' && v.reasonCode !== 'running-number-date') return [];
    return [{ index: v.index, header: v.header.trim() === '' ? `#${v.index + 1}` : v.header.trim(), reason: v.reasonCode === 'year-beside-date' ? ('year' as const) : ('number' as const), dates: v.reasonCode === 'running-number-date', role: v.role }];
  });
}

/**
 * The parameters of one finding: `count`, `columns` (the names, readable), `names` (the full list, for the page's buttons), `indexes` (the column of each, so that two columns with one header are told apart) and `roles` (the role each column had before the veto, as JSON, in the
 * order of `names`: what its button gives back).
 */
export function vetoedParams(columns: readonly VetoedColumn[]): { count: number; columns: string; names: string; indexes: string; roles: string; dateCount: number; dates?: string } {
  const dates = columns.filter((c) => c.dates).map((c) => c.header);
  return { dateCount: dates.length, ...(dates.length > 0 ? { dates: dates.join(', ') } : {}), count: columns.length, columns: columns.map((c) => c.header).join(', '), names: columns.map((c) => c.header).join(SEP), indexes: columns.map((c) => c.index).join(SEP), roles: columns.map((c) => JSON.stringify(c.role)).join(SEP) };
}

export const VETO_NAME_SEP = SEP;
