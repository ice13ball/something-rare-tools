// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useState } from 'react';
import { UNPLACED } from '../../core/convert/ledger';
import type { LedgerColumn, LedgerTally, SheetLedger } from '../../core/convert/ledger';
import type { UiKey } from '../../core/i18n/ui';
import { t } from '../i18n';

/*
 * The ledger of a conversion: for each sheet, what became a record and what did not (and why), then the numeric columns with their sums in and out. Information only: it blocks nothing,
 * and the export does not wait for it. The numbers are those of core/convert/ledger.ts, read from the records the conversion produced. While something blocks the export nothing is
 * written yet, so the sentences say what WOULD be written.
 */

const reasonLabel = (reason: string): string => t(`convert.ledger.reason.${reason}` as UiKey);
const toLabel = (to: LedgerColumn['to']): string => t(`convert.ledger.to.${to}` as UiKey);

function Tally({ tally, line, blocked }: { tally: LedgerTally; line: 'rows' | 'cells' | 'also'; blocked: boolean }): React.ReactElement {
  const key = `convert.ledger.${blocked ? `${line}Would` : line}` as UiKey;
  return (
    <>
      <p>
        {t(key, { source: tally.source, written: tally.written })}
        {tally.skipped.map((s) => (
          <span key={s.reason}>
            {'; '}
            {reasonLabel(s.reason)}: {s.count}
          </span>
        ))}
        .
      </p>
      {tally.writtenNoOccurrence !== undefined && tally.writtenNoOccurrence > 0 && <p className="muted">{t(blocked ? 'convert.ledger.noOccurrenceWould' : 'convert.ledger.noOccurrence', { count: tally.writtenNoOccurrence })}</p>}
      {tally.unexplained > 0 && (
        <p className="notice" role="note">
          {t('convert.ledger.unexplained', { count: tally.unexplained })}
        </p>
      )}
    </>
  );
}

function Column({ c, blocked }: { c: LedgerColumn; blocked: boolean }): React.ReactElement {
  return (
    <li>
      {c.numbers === 0
        ? t('convert.ledger.columnText', { header: c.header.trim() === '' ? `#${c.index + 1}` : c.header.trim(), nonNumbers: c.nonNumbers })
        : t(blocked ? 'convert.ledger.columnWould' : 'convert.ledger.column', { header: c.header.trim() === '' ? `#${c.index + 1}` : c.header.trim(), numbers: c.numbers, sum: c.sum, written: c.written, out: c.outSum })}{' '}
      ({toLabel(c.to)})
      {c.skipped.map((s) => (
        <span key={s.reason}>
          {'; '}
          {t('convert.ledger.skippedSum', { label: reasonLabel(s.reason), count: s.count, sum: s.sum })}
        </span>
      ))}
      {c.writtenWithoutValue > 0 && <span>{'; '}{t('convert.ledger.withoutValue', { count: c.writtenWithoutValue })}</span>}
      {c.nonNumbers > 0 && (
        <span className="notice" role="note">
          {' '}
          {t('convert.ledger.nonNumbers', { count: c.nonNumbers })}
        </span>
      )}
      {c.unexplained > 0 && (
        <span className="notice" role="note">
          {' '}
          {t('convert.ledger.columnUnexplained', { count: c.unexplained })}
        </span>
      )}
      {!c.match && (
        <span className="notice" role="note">
          {' '}
          {t('convert.ledger.mismatch')}
        </span>
      )}
    </li>
  );
}

/** The sheets of an upload can share a name (and even a file name): the heading says which file when it has to. */
function headings(ledger: readonly SheetLedger[]): string[] {
  const count = new Map<string, number>();
  for (const l of ledger) count.set(l.sheet, (count.get(l.sheet) ?? 0) + 1);
  return ledger.map((l) => ((count.get(l.sheet) ?? 0) > 1 ? `${l.file} / ${l.sheet}` : l.sheet));
}

/** A list of columns: the first 50, and a button for the rest (a wide sheet has thousands of columns; the open panel must stay short). */
const OPEN_COLUMNS = 50;
function Columns({ list, blocked }: { list: readonly LedgerColumn[]; blocked: boolean }): React.ReactElement {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, OPEN_COLUMNS);
  return (
    <>
      <ul>{shown.map((c) => <Column key={c.index} c={c} blocked={blocked} />)}</ul>
      {!all && list.length > OPEN_COLUMNS && (
        <button type="button" className="button" onClick={() => setAll(true)}>
          {t('convert.ledger.showAll', { count: list.length })}
        </button>
      )}
    </>
  );
}

/** What is not written, as one file beside the archive: the count (rows, and sheets left out as a whole) and the button. The same count and button stand beside the export button and in the ledger. */
export interface NotWrittenProps {
  rows: number;
  sheets: number;
  busy: boolean;
  error: string | null;
  onDownload: () => void;
}

export function NotWrittenList({ rows, sheets, busy, error, onDownload }: NotWrittenProps): React.ReactElement | null {
  if (rows === 0 && sheets === 0) return null;
  const label = rows > 0 && sheets > 0 ? t('convert.notWritten.buttonSheets', { count: rows, sheets }) : rows > 0 ? t('convert.notWritten.button', { count: rows }) : t('convert.notWritten.sheetsOnly', { sheets });
  return (
    <div className="convert-not-written">
      <button type="button" className="button" data-testid="not-written-button" disabled={busy} onClick={onDownload}>
        {label}
      </button>
      <p className="muted">{t('convert.notWritten.help')}</p>
      {busy && <p role="status">{t('convert.notWritten.busy')}</p>}
      {error !== null && (
        <p className="notice" role="alert">
          {t('convert.notWritten.error', { message: error })}
        </p>
      )}
    </div>
  );
}

/**
 * `blocked`: something stops the export (a blocking finding, a missing metadata field, an acceptance not given, nothing to write), so nothing is written yet and the sentences say what WOULD be.
 */
export function ConvertLedger({ ledger, blocked = false, notWritten }: { ledger: readonly SheetLedger[]; blocked?: boolean; notWritten?: NotWrittenProps }): React.ReactElement | null {
  if (ledger.length === 0) return null;
  const names = headings(ledger);
  return (
    <details className="convert-ledger">
      <summary>{t('convert.ledger.title')}</summary>
      <p className="muted">{t('convert.ledger.intro')}</p>
      {notWritten !== undefined && <NotWrittenList {...notWritten} />}
      {ledger.map((l, i) => {
        // the columns that are not written at all come first: a numeric column left out must be seen
        const lost = l.columns.filter((c) => c.to === 'not-written');
        const kept = l.columns.filter((c) => c.to !== 'not-written' && c.to !== 'event');
        // a column of text that is not written is listed, but it is not a number that went nowhere
        const lostNumeric = lost.filter((c) => c.numbers > 0);
        const unplaced = l.rows.skipped.filter((x) => (UNPLACED as readonly string[]).includes(x.reason)).reduce((n, x) => n + x.count, 0);
        const settled = l.kind !== 'not-read' && l.kind !== 'not-used';
        return (
          <section key={`${i}\u0000${l.file}\u0000${l.sheet}`} aria-label={names[i]}>
            <h3>{names[i]}</h3>
            {l.pivotRowsIn !== undefined && <p className="muted">{t('convert.ledger.pivot', { rowsIn: l.pivotRowsIn, samples: l.pivotSamples ?? 0 })}</p>}
            {l.cells === undefined ? <Tally tally={l.rows} line="rows" blocked={blocked} /> : <Tally tally={l.cells} line="cells" blocked={blocked} />}
            {l.cells !== undefined && <Tally tally={l.rows} line="also" blocked={blocked} />}
            {settled && !l.balanced && <p className="notice" role="note">{t('convert.ledger.unbalanced')}</p>}
            {settled && l.balanced && l.notUnderstood - unplaced > 0 && <p className="notice" role="note">{t('convert.ledger.lostValues', { count: l.notUnderstood - unplaced })}</p>}
            {settled && l.balanced && unplaced > 0 && <p className="notice" role="note">{t('convert.ledger.unplaced', { count: unplaced })}</p>}
            {settled && l.balanced && l.notUnderstood === 0 && <p className="muted">{lostNumeric.length === 0 ? t('convert.ledger.balanced') : t('convert.ledger.balancedColumns', { count: lostNumeric.length })}</p>}
            {lost.length > 0 && (
              <>
                <h4>{t('convert.ledger.notWritten')}</h4>
                <Columns list={lost} blocked={blocked} />
              </>
            )}
            {kept.length > 0 && (
              <>
                <h4>{t('convert.ledger.columns')}</h4>
                <Columns list={kept} blocked={blocked} />
              </>
            )}
          </section>
        );
      })}
    </details>
  );
}
