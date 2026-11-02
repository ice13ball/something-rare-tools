// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { isBlankCell, stripTypeSuffix } from '../recognize/columns';
import type { ColumnProposal, RawSheet } from '../types';
import { parseNumber } from '../values/numbers';

/*
 * A column named like a total on a long sheet, and a mass unit written in a column name. Kept apart from recognize.ts, which holds no sample-column names of its own
 * (test/convert/recognize.test.ts): the sample columns are named here by role kind, never by header.
 */

const MASS_UNITS = new Set(['kg', 'g', 'mg']);
export const massUnitOf = (unit: string | undefined): string | undefined => (unit !== undefined && MASS_UNITS.has(unit.trim().toLowerCase()) ? unit.trim().toLowerCase() : undefined);

/** A mass unit written as a word of the NAME ("weight_kg_total", "wt_mg", "biomass g"): the one mass unit among its words, or undefined when there is none or there are two different ones. */
export function massUnitInName(header: string): string | undefined {
  const found = new Set(
    stripTypeSuffix(header)
      .split(/[\s_]+/)
      .map((w) => w.toLowerCase())
      .filter((w) => MASS_UNITS.has(w)),
  );
  return found.size === 1 ? [...found][0] : undefined;
}

/** The columns that make a row part of a sample: where and when it was taken. */
const SAMPLE_KEY_KINDS = new Set(['sampleId', 'station', 'cruise', 'date', 'datetime', 'time', 'depth', 'replicate']);

/**
 * Does a numeric column repeat one value on all the rows of a sample (an all-taxa total) or differ between them? Rows are grouped by the columns that carry a sample role in `base`.
 * 'constant' when at least half of the samples of more than one row hold one value; 'varies' otherwise; 'unknown' without a sample column, a sample of more than one row, or a number.
 */
export function valuesRepeatWithinSample(sheet: RawSheet, base: readonly ColumnProposal[], index: number, decimalComma: boolean): 'constant' | 'varies' | 'unknown' {
  const key = base.filter((q) => SAMPLE_KEY_KINDS.has(q.role.kind) && q.index !== index).map((q) => q.index);
  // a text column that is still ignored (a tow or haul number the converter has no role for) separates the samples too, unless it only describes the taxon (a species code, a common name):
  // a column that is a function of the taxon column is not a sample column
  const taxon = base.find((q) => q.role.kind === 'taxon' && q.role.header !== true)?.index;
  if (taxon !== undefined) {
    for (const q of base) {
      if (q.role.kind !== 'ignore' || q.index === index || key.includes(q.index)) continue;
      const values = sheet.rows.map((r) => r.cells[q.index] ?? null).filter((c) => !isBlankCell(c));
      if (values.length === 0 || values.filter((c) => parseNumber(c, decimalComma).status === 'ok').length * 2 > values.length) continue;
      const byTaxon = new Map<string, Set<string>>();
      for (const r of sheet.rows) {
        const t = String(r.cells[taxon] ?? '').trim();
        const v = String(r.cells[q.index] ?? '').trim();
        const set = byTaxon.get(t);
        if (set === undefined) byTaxon.set(t, new Set([v]));
        else set.add(v);
      }
      if ([...byTaxon.values()].every((set) => set.size === 1)) continue;
      key.push(q.index);
    }
  }
  if (key.length === 0) return 'unknown';
  const groups = new Map<string, { first: number; same: boolean; n: number }>();
  for (const r of sheet.rows) {
    const cell = r.cells[index] ?? null;
    const p = parseNumber(cell, decimalComma);
    if (p.status !== 'ok') continue;
    const k = key.map((i) => String(r.cells[i] ?? '').trim()).join('\u0001');
    const g = groups.get(k);
    if (g === undefined) groups.set(k, { first: p.value, same: true, n: 1 });
    else {
      g.n++;
      if (p.value !== g.first) g.same = false;
    }
  }
  const multi = [...groups.values()].filter((g) => g.n > 1);
  if (multi.length === 0) return 'unknown';
  return multi.filter((g) => g.same).length * 2 >= multi.length ? 'constant' : 'varies';
}
