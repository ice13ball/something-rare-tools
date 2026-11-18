// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useId, useState } from 'react';
import type { TurnDeclaration } from '../../core/types';
import { columnLetters } from '../../core/convert/columnLetters';
import { t, useLang } from '../i18n';

export interface ConvertTurnProps {
  fileName: string;
  sheet: string;
  /** The header of the sheet as dropped (the turned sheet's own header is another one). */
  header: readonly string[];
  /** The declaration that turned the sheet, when it is turned; `fromFile`: it was pre-ticked from a companion file and not changed since. */
  turned?: TurnDeclaration & { fromFile?: true };
  /** A request is in flight: the controls wait. */
  busy: boolean;
  /** The person's declaration, or `null` to take it back. */
  onTurn: (turn: TurnDeclaration | null) => void;
}

/** A column as the person sees it in the source: its header and its letter ("Total (column D)"). */
const labelOf = (header: readonly string[], i: number): string => `${header[i].trim() === '' ? '—' : header[i]} ${t('convert.turn.columnOne', { columns: columnLetters(i) })}`;

/**
 * "The samples are the columns": the person's declaration for a sheet whose rows are taxa or variables. The column that names the rows starts EMPTY (nothing is guessed), the columns that are not
 * samples are ticked by the person, and the header may give the date as well as the sample code. Once the sheet is turned only what was declared is said, with the way back.
 */
export function ConvertTurn({ fileName, sheet, header, turned, busy, onTurn }: ConvertTurnProps): React.ReactElement {
  useLang();
  const id = useId();
  const [name, setName] = useState('');
  const [not, setNot] = useState<number[]>([]);
  const [dates, setDates] = useState(false);
  const nameColumn = name === '' ? undefined : Number(name);
  if (turned !== undefined) {
    return (
      <div className="convert-turn" data-testid="turn-done">
        <p className="notice" role="note">
          {t('convert.turn.done', { name: labelOf(header, turned.nameColumn) })}
          {turned.notSamples.length > 0 ? t('convert.turn.doneNot', { columns: turned.notSamples.map((i) => labelOf(header, i)).join(', ') }) : ''}
          {turned.headerDates === true ? t('convert.turn.doneDates') : ''}
          {turned.fromFile === true ? t('convert.turn.fromFile') : ''}
        </p>
        <button type="button" className="button" data-testid="turn-undo" disabled={busy} onClick={() => onTurn(null)}>
          {t('convert.turn.undo')}
        </button>
      </div>
    );
  }
  return (
    <details className="convert-turn" data-turn-box={`${fileName}\u0000${sheet}`}>
      <summary>{t('convert.turn.open')}</summary>
      <p className="muted">{t('convert.turn.help')}</p>
      <div className="choice-line">
        <label htmlFor={`${id}-name`}>{t('convert.turn.nameColumn')}</label>{' '}
        <select
          id={`${id}-name`}
          data-turn-name={`${fileName}\u0000${sheet}`}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            // a column cannot be both the names and not a sample
            setNot((prev) => prev.filter((i) => String(i) !== e.target.value));
          }}
        >
          <option value="">{t('convert.turn.choose')}</option>
          {header.map((_, i) => (
            <option key={i} value={String(i)}>
              {labelOf(header, i)}
            </option>
          ))}
        </select>
      </div>
      {nameColumn !== undefined && header.length > nameColumn + 1 && (
        <fieldset>
          <legend>{t('convert.turn.notSamples')}</legend>
          {header.map((_, i) =>
            i <= nameColumn ? null : (
              <label key={i} className="inline-choice">
                <input type="checkbox" checked={not.includes(i)} onChange={(e) => setNot((prev) => (e.target.checked ? [...prev, i].sort((a, b) => a - b) : prev.filter((x) => x !== i)))} />
                <span>{labelOf(header, i)}</span>
              </label>
            ),
          )}
        </fieldset>
      )}
      <div className="choice-line">
        <label className="inline-choice">
          <input type="checkbox" checked={dates} onChange={(e) => setDates(e.target.checked)} />
          <span>{t('convert.turn.headerDates')}</span>
        </label>
      </div>
      <button
        type="button"
        className="button"
        data-testid="turn-apply"
        disabled={busy || nameColumn === undefined}
        onClick={() => {
          if (nameColumn !== undefined) onTurn({ nameColumn, notSamples: not.filter((i) => i > nameColumn), ...(dates ? { headerDates: true } : {}) });
        }}
      >
        {t('convert.turn.apply')}
      </button>
    </details>
  );
}
