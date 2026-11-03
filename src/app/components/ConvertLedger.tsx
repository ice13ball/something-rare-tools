// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
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
      {tally.unexplained > 0 && (
        <p className="notice" role="note">
          {t('convert.ledger.unexplained', { count: tally.unexplained })}
        </p>
      )}
    </>
  );
}

function Column({ c }: { c: LedgerColumn }): React.ReactElement {
  return (
    <li>
      {c.numbers === 0
        ? t('convert.ledger.columnText', { header: c.header.trim() === '' ? `#${c.index + 1}` : c.header.trim(), nonNumbers: c.nonNumbers })
        : t('convert.ledger.column', { header: c.header.trim() === '' ? `#${c.index + 1}` : c.header.trim(), numbers: c.numbers, sum: c.sum, written: c.written, out: c.outSum })}{' '}
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

export function ConvertLedger({ ledger, blocked = false }: { ledger: readonly SheetLedger[]; blocked?: boolean }): React.ReactElement | null {
  if (ledger.length === 0) return null;
  const names = headings(ledger);
  return (
    <details className="convert-ledger">
      <summary>{t('convert.ledger.title')}</summary>
      <p className="muted">{t('convert.ledger.intro')}</p>
      {ledger.map((l, i) => {
        // the columns that are not written at all come first: a numeric column left out must be seen
        const lost = l.columns.filter((c) => c.to === 'not-written');
        const kept = l.columns.filter((c) => c.to !== 'not-written' && c.to !== 'event');
        const settled = l.kind !== 'not-read' && l.kind !== 'not-used';
        return (
          <section key={`${i}\u0000${l.file}\u0000${l.sheet}`} aria-label={names[i]}>
            <h3>{names[i]}</h3>
            {l.pivotRowsIn !== undefined && <p className="muted">{t('convert.ledger.pivot', { rowsIn: l.pivotRowsIn, rows: l.rows.source })}</p>}
            {l.cells === undefined ? <Tally tally={l.rows} line="rows" blocked={blocked} /> : <Tally tally={l.cells} line="cells" blocked={blocked} />}
            {l.cells !== undefined && <Tally tally={l.rows} line="also" blocked={blocked} />}
            {settled && (l.balanced ? <p className="muted">{lost.length === 0 ? t('convert.ledger.balanced') : t('convert.ledger.balancedColumns', { count: lost.length })}</p> : <p className="notice" role="note">{t('convert.ledger.unbalanced')}</p>)}
            {lost.length > 0 && (
              <>
                <h4>{t('convert.ledger.notWritten')}</h4>
                <ul>{lost.map((c) => <Column key={c.index} c={c} />)}</ul>
              </>
            )}
            {kept.length > 0 && (
              <>
                <h4>{t('convert.ledger.columns')}</h4>
                <ul>{kept.map((c) => <Column key={c.index} c={c} />)}</ul>
              </>
            )}
          </section>
        );
      })}
    </details>
  );
}
