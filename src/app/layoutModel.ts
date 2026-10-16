// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Pure helpers behind the layout confirmation: the plan in plain words, and edits that never mutate it.
import type { UiKey } from '../core/i18n/ui';
import type { LayoutPlan, TablePlan } from '../core/types';
import type { SheetSummary } from '../worker/protocol';

export interface LayoutLine {
  key: UiKey;
  params: Record<string, string>;
}

const headerAt = (sheets: readonly SheetSummary[], sheet: string, col: number | undefined): string => {
  if (col === undefined) return '';
  const h = sheets.find((s) => s.name === sheet)?.header[col];
  return h !== undefined && h.trim() !== '' ? h : `#${col + 1}`;
};

/** One sentence per join, per long table and per plain table that is not already explained by a join. */
export function describeLayout(plan: LayoutPlan, sheets: readonly SheetSummary[]): LayoutLine[] {
  const out: LayoutLine[] = [];
  for (const t of plan.tables) {
    if (t.long) {
      const l = t.long;
      out.push(
        l.unitCol === undefined
          ? { key: 'layout.longNoUnit', params: { sheet: t.sheet, param: headerAt(sheets, t.sheet, l.parameterCol), value: headerAt(sheets, t.sheet, l.valueCol) } }
          : {
              key: 'layout.long',
              params: { sheet: t.sheet, param: headerAt(sheets, t.sheet, l.parameterCol), value: headerAt(sheets, t.sheet, l.valueCol), unit: headerAt(sheets, t.sheet, l.unitCol) },
            },
      );
    } else if (!plan.joins.some((j) => j.left === t.sheet)) {
      out.push({ key: 'layout.one', params: { sheet: t.sheet } });
    }
  }
  for (const j of plan.joins) {
    out.push({
      key: 'layout.join',
      params: { left: j.left, right: j.right, leftKey: headerAt(sheets, j.left, j.leftKey), rightKey: headerAt(sheets, j.right, j.rightKey) },
    });
  }
  return out;
}

export function setJoinKey(plan: LayoutPlan, joinIndex: number, side: 'left' | 'right', col: number): LayoutPlan {
  return { ...plan, joins: plan.joins.map((j, i) => (i !== joinIndex ? j : side === 'left' ? { ...j, leftKey: col } : { ...j, rightKey: col })) };
}

type LongPlan = NonNullable<TablePlan['long']>;

/** Sets (or, for the unit column with `undefined`, removes) one column of a long table. */
export function setLongColumn(plan: LayoutPlan, tableIndex: number, field: keyof LongPlan, col: number | undefined): LayoutPlan {
  return {
    ...plan,
    tables: plan.tables.map((t, i) => {
      if (i !== tableIndex || !t.long) return t;
      const { unitCol: _u, ...rest } = t.long;
      const next: LongPlan =
        field === 'unitCol'
          ? col === undefined
            ? { ...rest }
            : { ...rest, unitCol: col }
          : { ...t.long, [field]: col ?? t.long[field] };
      return { ...t, long: next };
    }),
  };
}
