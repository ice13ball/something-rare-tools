// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { formatLines, renderPlain, renderTechnical } from '../../core/report';
import { getRule } from '../../core/rules/registry';
import type { Citation, Finding, Report, Severity } from '../../core/types';
import { isUiKey, type UiKey } from '../../core/i18n/ui';
import { t, useLang } from '../i18n';

export interface ReportViewProps {
  report: Report;
  /**
   * Rules whose citations are not listed under a finding. /check is under evaluation and shows exactly what it showed before the
   * licence page existed: the licence rules got citations since (docs/rules.md and the licence page show them), /check does not.
   */
  hideCitations?: (ruleId: string) => boolean;
}

export const NO_CITATIONS_IN_CHECK = (ruleId: string): boolean => ruleId.startsWith('LIC-');

const SEVERITIES: readonly Severity[] = ['error', 'warning', 'info'];

export interface Source {
  key: string;
  prefix?: string;
  citation: Citation;
}

export function sourcesOf(ruleId: string): Source[] {
  try {
    const rule = getRule(ruleId);
    const out: Source[] = [];
    for (const c of rule.citations ?? []) out.push({ key: 'c|' + c.url + '|' + (c.locator ?? ''), citation: c });
    for (const th of rule.thresholds ?? []) {
      out.push({ key: 't|' + th.name + '|' + th.citation.url, prefix: th.name + ' = ' + th.value + ' ' + th.unit, citation: th.citation });
    }
    return out;
  } catch {
    return [];
  }
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** `compact`: the label and link only, without the quoted passage (the licence page keeps to its own wording). */
export function SourceLink({ s, compact = false }: { s: Source; compact?: boolean }): React.ReactElement {
  const c = s.citation;
  return (
    <li>
      {s.prefix && <span>{s.prefix} — </span>}
      {c.url.startsWith('https://') ? (
        <a href={c.url} target="_blank" rel="noopener noreferrer">
          {c.label}
        </a>
      ) : (
        <span>{c.label}</span>
      )}
      {!compact && c.locator && <span className="muted"> ({c.locator})</span>}
    </li>
  );
}

function FindingItem({ f, hideCitations }: { f: Finding; hideCitations: (ruleId: string) => boolean }): React.ReactElement {
  const { lang } = useLang();
  const plain = safe(() => renderPlain(f, lang), f.ruleId);
  const technical = safe(() => renderTechnical(f), '');
  const sources = hideCitations(f.ruleId) ? [] : sourcesOf(f.ruleId);
  const lines = formatLines(f.lines);
  const row = (label: string, value: React.ReactNode): React.ReactElement => (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
  return (
    <li className="finding" data-severity={f.severity}>
      <div className="finding-head">
        <span className={'badge sev-' + f.severity}>{t(('severity.' + f.severity) as UiKey)}</span>
        <p className="plain" data-testid="plain">
          {plain}
        </p>
      </div>
      <details>
        <summary>{t('report.details')}</summary>
        {technical && <p className="technical"><code>{technical}</code></p>}
        <dl>
          {f.file && row(t('report.file'), f.file)}
          {f.sheet && row(t('report.sheet'), f.sheet)}
          {lines && row(t('report.lines'), lines)}
          {f.field && row(t('report.field'), f.field)}
          {f.value !== undefined && f.value !== '' && row(t('report.value'), <code>{f.value}</code>)}
          {row(t('report.rule'), <code>{f.ruleId}</code>)}
        </dl>
        {sources.length > 0 && (
          <>
            <h4>{t('report.sources')}</h4>
            <ul className="sources">
              {sources.map((s) => (
                <SourceLink key={s.key} s={s} />
              ))}
            </ul>
          </>
        )}
      </details>
    </li>
  );
}

/**
 * Summary counts, findings grouped by severity (plain sentence on top, technical detail in <details>),
 * then — always — what the tool does not check. The empty-result sentence appears only when there are
 * no findings. ⛔ Never claims that the data is "ready"; it reports what was not found in the checked categories.
 */
export function ReportView({ report, hideCitations = NO_CITATIONS_IN_CHECK }: ReportViewProps): React.ReactElement {
  useLang();
  const { counts, findings, notChecked } = report;
  return (
    <section className="report" aria-labelledby="report-title">
      <h2 id="report-title">{t('report.title')}</h2>
      <p className="summary" data-testid="summary">
        {t('report.summary', { errors: counts.error, warnings: counts.warning, notes: counts.info })}
      </p>
      {SEVERITIES.map((sev) => {
        const group = findings.filter((f) => f.severity === sev);
        if (group.length === 0) return null;
        return (
          <section key={sev} className="finding-group">
            <h3>
              {t(('report.group.' + sev) as UiKey)} ({group.length})
            </h3>
            <ul className="findings">
              {group.map((f, i) => (
                <FindingItem key={i + ':' + f.ruleId} f={f} hideCitations={hideCitations} />
              ))}
            </ul>
          </section>
        );
      })}
      {findings.length === 0 && <p className="no-problems">{t('report.noProblems')}</p>}
      <section className="not-checked">
        <h3>{t('notChecked.title')}</h3>
        <ul data-testid="not-checked">
          {notChecked.map((key) => (
            <li key={key}>{isUiKey(key) ? t(key) : key}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}
