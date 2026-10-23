// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useState } from 'react';
import { contradictionFinding } from '../../core/checks/licence';
import { analyseLicences, type AnalysedSource, type AnalysedStatement, type Contradiction, type LicenceAnalysis, type SourceGroup } from '../../core/licence/analyse';
import { buildAttribution, type Attribution } from '../../core/licence/attribution';
import { loadLicenceReferences, splitReferences, type LoadFailure } from '../../core/licence/load';
import { renderPlain } from '../../core/report';
import { browserFetcher, serverFetcher, type Fetcher } from '../../core/sources/fetcher';
import type { Lang, MetadataSource } from '../../core/types';
import { Layout } from '../components/Layout';
import { SourceLink, sourcesOf } from '../components/ReportView';
import { ModeSwitch, type ModeTexts } from '../components/ModeSwitch';
import { t, useLang } from '../i18n';
import { DEFAULT_MODE, type DownloadMode } from '../types';

export interface LicencePageProps {
  /** Default: the browser's own fetch (browser mode) or POST /api/fetch (server mode). */
  fetcherFor?: (mode: DownloadMode) => Fetcher;
  /** Default: navigator.clipboard.writeText. */
  writeClipboard?: (text: string) => Promise<void>;
}

const defaultFetcher = (mode: DownloadMode): Fetcher => (mode === 'server' ? serverFetcher() : browserFetcher());
const defaultClipboard = (text: string): Promise<void> => {
  if (!navigator.clipboard) return Promise.reject(new Error('no clipboard'));
  return navigator.clipboard.writeText(text);
};

/** Proper names of the metadata sources; they are not translated. */
const SOURCE_NAME: Record<MetadataSource, string> = { iso19139: 'GeoNetwork (ISO)', datacite: 'DataCite', zenodo: 'Zenodo', pangaea: 'PANGAEA', dataverse: 'Dataverse' };

/** The data-file wording of /check does not apply here: this page reads metadata records only. */
const MODE_TEXTS: Partial<ModeTexts> = {
  legend: 'licence.mode.legend',
  browserText: 'licence.mode.browser.text',
  serverText: 'licence.mode.server.text',
  note: 'licence.mode.note',
};

interface Result {
  analysis: LicenceAnalysis;
  failures: LoadFailure[];
  attribution: Attribution;
}

const isHttp = (uri: string): boolean => /^https?:\/\//i.test(uri);

function ClassificationText({ a }: { a: AnalysedStatement }): React.ReactElement {
  useLang();
  if (a.classification.kind === 'spdx') return <>{t('licence.class.spdx', { id: a.classification.id, name: a.info?.name ?? a.classification.id })}</>;
  return <>{t('licence.class.unrecognised')}</>;
}

/** The reason in the visitor's language. Written for this page: the /check rules advise dropping files, which this page has no place for. */
function reasonOf(f: LoadFailure): string {
  const p = f.finding?.params ?? {};
  if (f.finding?.ruleId === 'IN-FETCH-BLOCKED') return t('licence.reason.blocked', { host: String(p.host ?? '') });
  if (f.finding?.ruleId === 'IN-HOST-NOT-ALLOWED') return t('licence.reason.notAllowed', { host: String(p.host ?? '') });
  if (f.finding?.ruleId === 'IN-FETCH-TIMEOUT') return t('licence.reason.timeout', { host: String(p.host ?? '') });
  // The generic "may be private or unpublished" is true of a refused record (401, 403), not of a busy host or a DOI DataCite does not know.
  if (f.finding && Number(p.status) === 429) return t('licence.reason.rateLimit', { host: String(p.host ?? '') });
  if (f.finding && (Number(p.status) === 408 || Number(p.status) === 504)) return t('licence.reason.timeout', { host: String(p.host ?? '') });
  if (f.finding && f.source === 'datacite' && Number(p.status) === 404) return t('licence.reason.notDatacite', { host: String(p.host ?? '') });
  if (f.finding) return t('licence.reason.http', { host: String(p.host ?? ''), status: String(p.status ?? '') });
  if (f.reason === 'unrecognised') return t('licence.reason.unrecognised');
  return t('licence.reason.unexpected', { message: f.message ?? '' });
}

function SourceView({ src, failures }: { src: AnalysedSource; failures: LoadFailure[] }): React.ReactElement {
  useLang();
  const heading = src.record ? src.label : SOURCE_NAME[src.source];
  return (
    <article className="licence-source" data-state={src.state}>
      <h4>{heading}</h4>
      {src.state === 'unreadable' && (
        <>
          <p>
            <strong>{t('licence.class')}:</strong> {t('licence.class.unreadable')}
          </p>
          {failures
            .filter((f) => f.source === src.source && (src.label === src.source || f.ref === src.label))
            .map((f, i) => (
              <p key={i} className="muted">
                {f.ref} — {reasonOf(f)}
              </p>
            ))}
        </>
      )}
      {src.state === 'missing' && (
        <p>
          <strong>{t('licence.class')}:</strong> {t('licence.class.missing')}
        </p>
      )}
      {src.statements.map((a, i) => (
        <dl key={i} className="licence-statement">
          <dt>{t('licence.field')}</dt>
          <dd>{a.statement.field}</dd>
          <dt>{t('licence.text')}</dt>
          <dd>{a.statement.text ?? '—'}</dd>
          <dt>{t('licence.link')}</dt>
          <dd>
            {a.statement.uri ? (
              isHttp(a.statement.uri) ? (
                <a href={a.statement.uri} target="_blank" rel="noopener noreferrer">
                  {a.statement.uri}
                </a>
              ) : (
                a.statement.uri
              )
            ) : (
              '—'
            )}
          </dd>
          <dt>{t('licence.class')}</dt>
          <dd>
            <ClassificationText a={a} />
          </dd>
        </dl>
      ))}
    </article>
  );
}

function GroupView({ group, failures, heading }: { group: SourceGroup; failures: LoadFailure[]; heading?: string }): React.ReactElement {
  const names = [...new Set(group.sources.map((s) => SOURCE_NAME[s.source]))].join(' + ');
  return (
    <section className="licence-group card" data-group={group.id}>
      <h3>{heading ?? names}</h3>
      {group.sources.length > 1 && <p className="muted">{t('licence.group.shared', { names })}</p>}
      {group.sources.map((s, i) => (
        <SourceView key={i} src={s} failures={failures} />
      ))}
    </section>
  );
}

/** Deposits of the same kind (two DataCite DOIs, two catalogues) are told apart by the label of their first record. */
function groupHeading(g: SourceGroup, all: SourceGroup[]): string {
  const names = [...new Set(g.sources.map((s) => SOURCE_NAME[s.source]))].join(' + ');
  const twin = all.some((o) => o !== g && [...new Set(o.sources.map((s) => SOURCE_NAME[s.source]))].join(' + ') === names);
  const first = g.sources.find((s) => s.record);
  return twin && first ? `${names} — ${first.label}` : names;
}

function CopyAttribution({ text, write }: { text: string; write: (s: string) => Promise<void> }): React.ReactElement {
  useLang();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <>
      <button
        type="button"
        className="button secondary"
        onClick={() =>
          write(text).then(
            () => setState('copied'),
            () => setState('failed'),
          )
        }
      >
        {t('licence.attr.copy')}
      </button>
      {state === 'copied' && (
        <span role="status" className="muted">
          {' '}
          {t('licence.attr.copied')}
        </span>
      )}
      {state === 'failed' && (
        <span role="alert" className="error-text">
          {' '}
          {t('licence.attr.copyFailed')}
        </span>
      )}
    </>
  );
}

/** One contradiction in the rule's own words, with the sources the rule rests on. */
function ContradictionItem({ c, lang }: { c: Contradiction; lang: Lang }): React.ReactElement {
  useLang();
  const f = contradictionFinding(c, 'dataset');
  const sources = sourcesOf(f.ruleId);
  return (
    <li data-kind={c.kind}>
      {renderPlain(f, lang)}
      {sources.length > 0 && (
        <details>
          <summary>{t('report.sources')}</summary>
          <ul className="sources">
            {sources.map((s) => (
              <SourceLink key={s.key} s={s} compact />
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function Summary({ r }: { r: Result }): React.ReactElement {
  const { lang } = useLang();
  const a = r.analysis;
  const unrecognised = a.sources.some((s) => s.statements.some((x) => x.classification.kind !== 'spdx'));
  return (
    <section className="licence-summary" aria-labelledby="licence-summary-title">
      <h2 id="licence-summary-title">{t('licence.summary.title')}</h2>
      {a.contradictions.length > 0 ? (
        <>
          <p>
            <strong>{t('licence.summary.contradictions', { n: a.contradictions.length })}</strong>
          </p>
          <ul>
            {a.contradictions.map((c, i) => (
              <ContradictionItem key={i} c={c} lang={lang} />
            ))}
          </ul>
        </>
      ) : a.comparison === 'compared' ? (
        <p>
          <strong>{t(a.maybeSameDeposit ? 'licence.summary.noneMaybeSame' : 'licence.summary.none', { n: a.recognisedGroups })}</strong> {t('licence.summary.countOnce')}
        </p>
      ) : (
        <p>
          <strong>
            {a.statedGroups === 0
              ? t('licence.summary.nostated')
              : a.recognisedGroups === 0
                ? t('licence.summary.uncompared')
                : a.statedGroups > a.recognisedGroups
                  ? t('licence.summary.partial')
                  : t('licence.summary.single')}
          </strong>
        </p>
      )}
      {a.hasUnreadable && <p className="notice">{t('licence.summary.unreadable')}</p>}
      {unrecognised && <p className="notice">{t('licence.summary.unrecognised')}</p>}
    </section>
  );
}

/**
 * One dataset, one or several references. Loads the METADATA of each (never data files), hands the records to the shared
 * analysis (src/core/licence/analyse.ts) and only displays what it returns: no classification or comparison happens here.
 * Nothing the visitor pastes is written to the URL.
 */
export function LicencePage({ fetcherFor = defaultFetcher, writeClipboard = defaultClipboard }: LicencePageProps): React.ReactElement {
  useLang();
  const [mode, setMode] = useState<DownloadMode>(DEFAULT_MODE);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switched, setSwitched] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const refs = splitReferences(text);
    setEmpty(refs.length === 0);
    if (refs.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setSwitched(false);
    try {
      const load = await loadLicenceReferences(refs, fetcherFor(mode));
      const failed = load.failures.flatMap((f) => (f.source ? [{ source: f.source, ref: f.ref }] : []));
      const analysis = analyseLicences(load.records, { failures: failed, inaccessible: load.failures.some((f) => !f.source) });
      setResult({ analysis, failures: load.failures, attribution: buildAttribution(analysis) });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // A failure that a source row already shows (its source is unreadable) is not listed twice.
  const shown = new Set(result?.analysis.sources.filter((s) => s.state === 'unreadable').map((s) => `${s.source}|${s.label}`));
  const listed = result?.failures.filter((f) => !f.source || !shown.has(`${f.source}|${f.ref}`)) ?? [];
  const blockedInBrowser = mode === 'browser' && (result?.failures.some((f) => f.finding?.ruleId === 'IN-FETCH-BLOCKED' || f.finding?.ruleId === 'IN-FETCH-TIMEOUT') ?? false);

  return (
    <Layout titleKey="licence.docTitle">
      <h1>{t('licence.title')}</h1>
      <p className="lead">{t('licence.intro')}</p>
      <form className="input-panel" onSubmit={(e) => void submit(e)} noValidate>
        <label className="field">
          <span>{t('licence.input.label')}</span>
          <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('licence.input.placeholder')} autoComplete="off" spellCheck={false} />
        </label>
        <p className="muted">{t('licence.input.hint')}</p>
        <ModeSwitch value={mode} onChange={setMode} texts={MODE_TEXTS} />
        {empty && (
          <p className="error-text" role="alert">
            {t('licence.empty')}
          </p>
        )}
        <button type="submit" className="button" disabled={busy}>
          {busy ? t('licence.busy') : t('licence.submit')}
        </button>
      </form>

      {error !== null && (
        <p className="error-text" role="alert">
          {t('check.error')} {t('check.error.detail', { message: error })}
        </p>
      )}

      {result && (
        <div data-testid="licence-result">
          {listed.length > 0 && (
            <section className="notice" role="alert">
              <h2>{t('licence.failed.title')}</h2>
              <ul>
                {listed.map((f, i) => (
                  <LangRow key={i} f={f} />
                ))}
              </ul>
            </section>
          )}
          {blockedInBrowser && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setMode('server');
                setSwitched(true);
              }}
            >
              {t('blocked.switch')}
            </button>
          )}
          {switched && (
            <p className="notice" role="status">
              {t('licence.switched')}
            </p>
          )}
          <Summary r={result} />
          <section aria-labelledby="licence-sources-title">
            <h2 id="licence-sources-title">{t('licence.sources.title')}</h2>
            {result.analysis.groups.map((g) => (
              <GroupView key={g.id} group={g} failures={result.failures} heading={groupHeading(g, result.analysis.groups)} />
            ))}
          </section>
          <section aria-labelledby="licence-attr-title">
            <h2 id="licence-attr-title">{t('licence.attr.title')}</h2>
            {result.attribution.text === '' ? (
              <p>{t('licence.attr.empty')}</p>
            ) : (
              <>
                <p className="attribution" data-testid="attribution" lang="en">
                  {result.attribution.text}
                </p>
                <CopyAttribution text={result.attribution.text} write={writeClipboard} />
              </>
            )}
            {result.attribution.omitted && result.attribution.text !== '' && <p className="muted">{t(`licence.attr.omit.${result.attribution.omitted}` as never)}</p>}
            <p className="muted">{t('licence.attr.note')}</p>
          </section>
        </div>
      )}

      <section className="about" aria-labelledby="licence-checks-title">
        <h2 id="licence-checks-title">{t('licence.checks.title')}</h2>
        <p>{t('licence.checks.p1')}</p>
        <ul>
          <li>{t('licence.checks.li1')}</li>
          <li>{t('licence.checks.li2')}</li>
          <li>{t('licence.checks.li3')}</li>
          <li>{t('licence.checks.li4')}</li>
        </ul>
      </section>
    </Layout>
  );
}

function LangRow({ f }: { f: LoadFailure }): React.ReactElement {
  useLang();
  return (
    <li>
      {f.ref} — {reasonOf(f)}
    </li>
  );
}
