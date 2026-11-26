// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useEffect, useRef, useState } from 'react';
import { judge } from '../../core/convert';
import type { DatasetMetadata } from '../../core/convert/metadata';
import type { ConvertPrefill } from '../../core/convert/prefill';
import { MAX_LINE_RANGES, formatLines } from '../../core/lines';
import type { UiKey } from '../../core/i18n/ui';
import type { Finding } from '../../core/types';
import type { ConvertEngine, DwcAsIsProposal, DwcAsIsView } from '../../worker/convert.protocol';
import { plainOf } from '../convertModel';
import { downloadBlob } from '../download';
import { t, useLang } from '../i18n';
import { sentenceWithList } from './CollapsibleList';
import { ConvertMetadataForm } from './ConvertMetadataForm';
import { ConvertTablesOnly } from './ConvertTablesOnly';
import { withoutDescription } from '../../core/convert/tablesOnly';

export type DwcChoice = 'ask' | 'asIs' | 'map';

export interface ConvertDwcAsIsProps {
  engine: ConvertEngine;
  proposal: DwcAsIsProposal;
  choice: DwcChoice;
  onChoice: (c: DwcChoice) => void;
  meta: DatasetMetadata;
  onMeta: (next: DatasetMetadata) => void;
  prefill: ConvertPrefill | null;
  downloadFile?: typeof downloadBlob;
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function Items({ findings }: { findings: Finding[] }): React.ReactElement {
  const { lang } = useLang();
  return (
    <ul>
      {findings.map((f, i) => (
        <li key={`${f.ruleId}:${i}`} data-rule={f.ruleId}>
          {f.file !== undefined && f.sheet !== undefined && f.file !== '' && <span className="muted">{f.sheet === f.file ? f.file : t('convert.finding.where', { file: f.file, sheet: f.sheet })}: </span>}
          {sentenceWithList(plainOf(f, lang), formatLines(f.lines, MAX_LINE_RANGES), { lines: new Set(f.lines).size })}
        </li>
      ))}
    </ul>
  );
}

/**
 * The as-is mode for a file that is already Darwin Core. The recognition is only a proposal (the engine read the header names, never a cell): the person
 * chooses once, "pack as it is" or "map the columns myself". In the as-is mode there are no role questions and no joins; the dataset description form stays.
 */
export function ConvertDwcAsIs({ engine, proposal, choice, onChoice, meta, onMeta, prefill, downloadFile = downloadBlob }: ConvertDwcAsIsProps): React.ReactElement {
  useLang();
  const [view, setView] = useState<DwcAsIsView | null>(null);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const token = useRef(0);
  const body = (tablesOnly = false): { metadata: DatasetMetadata; accepted: string[]; generated: string; tablesOnly?: boolean } => ({
    ...(tablesOnly ? { tablesOnly: true } : {}),
    metadata: meta,
    accepted: Object.keys(accepted).filter((k) => accepted[k]),
    generated: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  });

  useEffect(() => {
    if (choice !== 'asIs') return;
    const mine = ++token.current;
    const timer = setTimeout(() => {
      engine
        .dwcView({ metadata: meta, accepted: [], generated: '' })
        .then((v) => {
          if (token.current === mine) {
            setView(v);
            setError(null);
          }
        })
        .catch((e) => {
          if (token.current === mine) setError(messageOf(e));
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [engine, choice, meta]);

  const sheets = [proposal.event, proposal.occurrence, ...(proposal.emof ? [proposal.emof] : [])];
  if (choice === 'map') return <></>;
  if (choice === 'ask') {
    return (
      <section className="confirm-step" aria-labelledby="convert-dwc-title" data-testid="dwc-proposal">
        <h2 id="convert-dwc-title">{t('convert.dwc.title')}</h2>
        <p>{t('convert.dwc.intro', { sheets: sheets.map((s) => (s.sheet === s.file ? s.file : `${s.file}: ${s.sheet}`)).join('; ') })}</p>
        <p data-testid="dwc-reads">
          {t('convert.dwc.reads', {
            map: [
              [proposal.event, 'event'],
              [proposal.occurrence, 'occurrence'],
              ...(proposal.emof ? [[proposal.emof, 'emof']] : []),
            ]
              .map(([s, table]) => `${(s as typeof proposal.event).sheet} → ${t(`convert.dwc.table.${table as string}` as UiKey)}`)
              .join(', '),
          })}
        </p>
        <p className="muted">{t('convert.dwc.hint')}</p>
        <p>
          <button type="button" className="button primary" data-testid="dwc-as-is" onClick={() => onChoice('asIs')}>
            {t('convert.dwc.asIs')}
          </button>{' '}
          <button type="button" className="button" data-testid="dwc-map" onClick={() => onChoice('map')}>
            {t('convert.dwc.map')}
          </button>
        </p>
      </section>
    );
  }

  const judged = view ? judge(view.findings) : null;
  const isOn = (rule: string): boolean => accepted[rule] === true;
  const canExport = view !== null && judged !== null && judged.blocking.length === 0 && view.lost === 0 && judged.acceptRules.every(isOn) && !busy;
  const judgedTables = view ? judge(withoutDescription(view.findings)) : null;
  const canExportTables = view !== null && judgedTables !== null && judgedTables.blocking.length === 0 && view.lost === 0 && judgedTables.acceptRules.every(isOn) && !busy;
  const exportNow = async (tablesOnly = false): Promise<void> => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await engine.dwcExport(body(tablesOnly));
      downloadFile(new Blob([res.bytes as unknown as BlobPart], { type: 'application/zip' }), res.fileName);
      setDone(t('convert.export.done', { name: res.fileName, events: res.counts.events, occurrences: res.counts.occurrences, measurements: res.counts.measurements }));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  const listNow = async (): Promise<void> => {
    try {
      const res = await engine.dwcNotWritten(body());
      downloadFile(res.blob, res.fileName);
    } catch (e) {
      setError(messageOf(e));
    }
  };
  const listed = view ? view.accounts.reduce((n, a) => n + a.notWritten.length + a.columns.length, 0) : 0;

  return (
    <section className="confirm-step" aria-labelledby="convert-dwc-title" data-testid="dwc-as-is-panel">
      <h2 id="convert-dwc-title">{t('convert.dwc.asIs')}</h2>
      <p>
        {t('convert.dwc.chosen')}{' '}
        <button type="button" className="button" data-testid="dwc-back" onClick={() => onChoice('map')}>
          {t('convert.dwc.map')}
        </button>
      </p>
      <section className="confirm-step" aria-labelledby="convert-dwc-meta">
        <h3 id="convert-dwc-meta">{t('convert.meta.title')}</h3>
        <ConvertMetadataForm value={meta} onChange={onMeta} prefill={prefill} />
      </section>
      {view && (
        <div data-testid="dwc-summary">
          <p>{t('convert.dwc.summary', { events: view.counts.events, occurrences: view.counts.occurrences, measurements: view.counts.measurements, lost: view.lost })}</p>
          <ul>
            {view.accounts.map((a) => (
              <li key={`${a.file}:${a.sheet}`}>{t('convert.dwc.sheet', { sheet: a.sheet, rows: a.rows, written: a.written, rowsListed: a.notWritten.length, columnsListed: a.columns.length })}</li>
            ))}
          </ul>
          {judged && judged.blocking.length > 0 && (
            <div className="convert-findings" data-kind="error">
              <h3>{t('convert.summary.blocking', { n: judged.blocking.length })}</h3>
              <Items findings={judged.blocking} />
            </div>
          )}
          {judged && judged.acceptRules.length > 0 && (
            <div className="convert-accept">
              <h3>{t('convert.accept.title')}</h3>
              {judged.acceptRules.map((rule) => {
                const group = judged.toAccept.filter((f) => f.ruleId === rule);
                return (
                  <div key={rule} className="convert-findings" data-kind="warning" data-rule-group={rule}>
                    <label className="inline-choice">
                      <input type="checkbox" checked={isOn(rule)} onChange={(e) => setAccepted((p) => ({ ...p, [rule]: e.target.checked }))} />
                      <span>{t('convert.accept.rule', { n: group.length, rule })}</span>
                    </label>
                    <Items findings={group} />
                  </div>
                );
              })}
            </div>
          )}
          {judged && judged.showOnly.length > 0 && (
            <div className="convert-findings" data-kind="info">
              <Items findings={judged.showOnly} />
            </div>
          )}
          {listed > 0 && (
            <p>
              <button type="button" className="button" data-testid="dwc-list" onClick={() => void listNow()}>
                {t('convert.dwc.list', { n: listed })}
              </button>
            </p>
          )}
          <p>
            <button type="button" className="button primary" data-testid="dwc-export" disabled={!canExport} onClick={() => void exportNow()}>
              {t('convert.export.button')}
            </button>
          </p>
          <ConvertTablesOnly enabled={canExportTables} busy={busy} onPress={() => void exportNow(true)} />
        </div>
      )}
      {error !== null && <p className="notice" role="alert">{error}</p>}
      {done !== null && <p className="notice" role="status">{done}</p>}
    </section>
  );
}
