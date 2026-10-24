// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useState } from 'react';
import type { LayoutPlan } from '../../core/types';
import type { SheetSummary } from '../../worker/protocol';
import { t, useLang } from '../i18n';
import { describeLayout, setJoinKey, setLongColumn } from '../layoutModel';
import { HeadingTip } from './InfoTip';

export interface LayoutConfirmProps {
  plan: LayoutPlan;
  sheets: SheetSummary[];
  onChange: (plan: LayoutPlan) => void;
}

function ColumnSelect({ label, header, value, allowNone, onPick }: { label: string; header: string[]; value: number | undefined; allowNone?: boolean; onPick: (col: number | undefined) => void }): React.ReactElement {
  return (
    <label className="inline-field">
      <span>{label}</span>
      <select value={value === undefined ? '' : String(value)} onChange={(e) => onPick(e.target.value === '' ? undefined : Number(e.target.value))}>
        {allowNone && <option value="">{t('layout.none')}</option>}
        {header.map((h, i) => (
          <option key={i} value={String(i)}>
            {h.trim() === '' ? `#${i + 1}` : h}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The proposed layout in plain words (one table / long format / two sheets joined on a key), with a Change control that
 * opens the choice of join key and of the parameter, unit and value columns. A layout the tool cannot read is stated plainly.
 * The final "Confirm and check" button of the page is the confirmation: nothing is checked before it.
 */
export function LayoutConfirm({ plan, sheets, onChange }: LayoutConfirmProps): React.ReactElement {
  useLang();
  const [open, setOpen] = useState(false);
  const lines = describeLayout(plan, sheets);
  const headerOf = (name: string): string[] => sheets.find((s) => s.name === name)?.header ?? [];
  const editable = plan.joins.length > 0 || plan.tables.some((x) => x.long);
  return (
    <section className="layout-confirm" aria-label={t('layout.title')}>
      <HeadingTip tip="layout">
        <h4>{t('layout.title')}</h4>
      </HeadingTip>
      {lines.map((l, i) => (
        <p key={i} className="layout-line">
          {t(l.key, l.params)}
        </p>
      ))}
      {plan.unsupported !== undefined && (
        <p className="notice" role="note">
          {t('layout.unsupported', { reason: plan.unsupported })}
        </p>
      )}
      {editable && (
        <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t('layout.hide') : t('layout.change')}
        </button>
      )}
      {open && (
        <div className="layout-edit">
          {plan.joins.map((j, i) => (
            <div key={'j' + i} className="layout-edit-row">
              <ColumnSelect label={t('layout.key.left', { sheet: j.left })} header={headerOf(j.left)} value={j.leftKey} onPick={(c) => c !== undefined && onChange(setJoinKey(plan, i, 'left', c))} />
              <ColumnSelect label={t('layout.key.right', { sheet: j.right })} header={headerOf(j.right)} value={j.rightKey} onPick={(c) => c !== undefined && onChange(setJoinKey(plan, i, 'right', c))} />
            </div>
          ))}
          {plan.tables.map((tb, i) =>
            tb.long ? (
              <div key={'l' + i} className="layout-edit-row">
                <ColumnSelect label={t('layout.long.parameter')} header={headerOf(tb.sheet)} value={tb.long.parameterCol} onPick={(c) => c !== undefined && onChange(setLongColumn(plan, i, 'parameterCol', c))} />
                <ColumnSelect label={t('layout.long.value')} header={headerOf(tb.sheet)} value={tb.long.valueCol} onPick={(c) => c !== undefined && onChange(setLongColumn(plan, i, 'valueCol', c))} />
                <ColumnSelect label={t('layout.long.unit')} header={headerOf(tb.sheet)} value={tb.long.unitCol} allowNone onPick={(c) => onChange(setLongColumn(plan, i, 'unitCol', c))} />
              </div>
            ) : null,
          )}
        </div>
      )}
    </section>
  );
}
