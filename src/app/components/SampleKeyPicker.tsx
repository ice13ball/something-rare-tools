// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useState } from 'react';
import type { SheetKeyReport } from '../../core/convert/sampleKey';
import { t, useLang } from '../i18n';
import { formatNumber } from '../tips';
import { InfoTip } from './InfoTip';

export interface KeyColumn {
  index: number;
  /** The header as the sheet has it ('' when it has none). */
  header: string;
  /** A few values from the top of the column, to recognise it by. */
  examples: string[];
}

export interface SampleKeyPickerProps {
  sheet: string;
  columns: KeyColumn[];
  /** The columns ticked now, in the order they were ticked (the draft, else the key in use). Nothing is ticked until the person ticks. */
  picked: number[];
  /** The key in use for the sheet (the one the export has). */
  inUse: number[];
  /** What the ticked columns would make, from the converter itself; undefined while it is being asked, null when nothing is ticked. */
  report: SheetKeyReport | null | undefined;
  /** A failed count: the message, shown with a button to count again. */
  error?: string;
  onRetry?: () => void;
  onToggle: (index: number) => void;
  onUse: () => void;
  onClear: () => void;
}

const SHOWN = 40;

const nameOf = (c: KeyColumn): string => (c.header.trim() === '' ? t('convert.key.noName', { n: c.index + 1 }) : c.header.trim());

/**
 * The picker of the sample key: the columns that together say which rows are one sample, with the converter's own count of what they make. Nothing is ticked for the person, no column is
 * proposed, and nothing reaches the conversion until "Use this key" is pressed.
 */
export function SampleKeyPicker({ sheet, columns, picked, inUse, report, error, onRetry, onToggle, onUse, onClear }: SampleKeyPickerProps): React.ReactElement {
  const { lang } = useLang();
  const [all, setAll] = useState(false);
  const shown = all ? columns : columns.filter((c, i) => i < SHOWN || picked.includes(c.index));
  const same = picked.length === inUse.length && picked.every((p, i) => p === inUse[i]);
  const byIndex = new Map(columns.map((c) => [c.index, c]));
  const order = picked.map((i) => (byIndex.get(i) === undefined ? `#${i + 1}` : nameOf(byIndex.get(i) as KeyColumn))).join(' + ');
  const n = (x: number): string => formatNumber(x, lang);
  return (
    <fieldset className="convert-key" data-testid="key-picker">
      <legend>
        {t('convert.key.legend', { sheet })} <InfoTip id="convertKey" />
      </legend>
      <p>{t('convert.key.help')}</p>
      <ul className="convert-key-columns">
        {shown.map((c) => (
          <li key={c.index}>
            <label className="inline-choice">
              <input type="checkbox" checked={picked.includes(c.index)} onChange={() => onToggle(c.index)} />
              <span>
                {nameOf(c)}
                {c.examples.length > 0 ? <span className="hint"> ({t('convert.key.example', { values: [...new Set(c.examples)].slice(0, 3).join(', ') })})</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {!all && columns.length > shown.length ? (
        <button type="button" className="button" onClick={() => setAll(true)}>
          {t('convert.key.showAll', { n: columns.length })}
        </button>
      ) : null}
      {picked.length === 0 ? <p>{t('convert.key.none')}</p> : <p>{t('convert.key.order', { columns: order })}</p>}
      {picked.length > 0 ? (
        <div aria-live="polite" data-testid="key-preview">
          {report === undefined && error === undefined ? <p>{t('convert.key.working')}</p> : null}
          {error !== undefined ? (
            <p className="warning">
              {t('convert.key.failed', { message: error })}{' '}
              {onRetry ? (
                <button type="button" className="button" onClick={onRetry}>
                  {t('convert.key.retry')}
                </button>
              ) : null}
            </p>
          ) : null}
          {report === null ? <p className="warning">{t('convert.key.noReport')}</p> : null}
          {report !== undefined && report !== null ? (
            <>
              <p>{t('convert.key.preview', { samples: report.samples, samplesText: n(report.samples), rows: report.rows, rowsText: n(report.rows), min: n(report.rowsPerSample.min), max: n(report.rowsPerSample.max), median: n(report.rowsPerSample.median) })}</p>
              {report.blank > 0 ? <p className="warning">{t('convert.key.blank', { blank: report.blank, blankText: n(report.blank) })}</p> : null}
              {report.blankParts > 0 ? <p className="warning">{t('convert.key.blankParts', { n: report.blankParts, nText: n(report.blankParts) })}</p> : null}
              {report.tooLong > 0 ? <p className="warning">{t('convert.key.tooLong', { n: report.tooLong, nText: n(report.tooLong) })}</p> : null}
              {report.samples > 1 && report.samples === report.rows ? <p className="warning">{t('convert.key.perRow')}</p> : null}
            </>
          ) : null}
        </div>
      ) : null}
      <div className="button-row">
        <button type="button" className="button" disabled={picked.length === 0 || same} onClick={onUse}>
          {t('convert.key.use')}
        </button>
        {inUse.length > 0 || picked.length > 0 ? (
          <button type="button" className="button" onClick={onClear}>
            {t('convert.key.clear')}
          </button>
        ) : null}
      </div>
    </fieldset>
  );
}
