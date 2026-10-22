// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useState } from 'react';
import { contradictionFinding } from '../../core/checks/licence';
import { analyseLicences, type AnalysedSource, type AnalysedStatement, type LicenceAnalysis, type SourceGroup } from '../../core/licence/analyse';
import { buildAttribution, type Attribution } from '../../core/licence/attribution';
import { loadLicenceReferences, splitReferences, type LoadFailure } from '../../core/licence/load';
import { renderPlain } from '../../core/report';
import { browserFetcher, serverFetcher, type Fetcher } from '../../core/sources/fetcher';
import type { MetadataSource } from '../../core/types';
import { Layout } from '../components/Layout';
import { LoadProblems, SwitchedNotice } from '../components/LoadProblems';
import { ModeSwitch } from '../components/ModeSwitch';
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
const SOURCE_NAME: Record<MetadataSource, string> = { iso19139: 'GeoNetwork (ISO)', datacite: 'DataCite', zenodo: 'Zenodo', pangaea: 'PANGAEA' };

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

function reasonOf(f: LoadFailure, lang: ReturnType<typeof useLang>['lang']): string {
  if (f.finding) return renderPlain(f.finding, lang);
  if (f.reason === 'unrecognised') return t('licence.reason.unrecognised');
  return t('licence.reason.unexpected', { message: f.message ?? '' });
}

function SourceView({ src, failures }: { src: AnalysedSource; failures: LoadFailure[] }): React.ReactElement {
  const { lang } = useLang();
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
            .filter((f) => f.source === src.source)
            .map((f, i) => (
              <p key={i} className="muted">
                {f.ref} — {reasonOf(f, lang)}
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

function GroupView({ group, failures }: { group: SourceGroup; failures: LoadFailure[] }): React.ReactElement {
  const names = [...new Set(group.sources.map((s) => SOURCE_NAME[s.source]))].join(' + ');
  return (
    <section className="licence-group card" data-group={group.id}>
      <h3>{names}</h3>
      {group.sources.length > 1 && <p className="muted">{t('licence.group.shared', { names })}</p>}
      {group.sources.map((s, i) => (
        <SourceView key={i} src={s} failures={failures} />
      ))}
    </section>
  );
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
              <li key={i} data-kind={c.kind}>
                {renderPlain(contradictionFinding(c, 'dataset'), lang)}
              </li>
            ))}
          </ul>
        </>
      ) : a.comparison === 'compared' ? (
        <p>
          <strong>{t('licence.summary.none', { n: a.statedGroups })}</strong> {t('licence.summary.countOnce')}
        </p>
      ) : (
        <p>
          <strong>{a.statedGroups === 0 ? t('licence.summary.nostated') : t('licence.summary.single')}</strong>
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
      const unreadable = [...new Set(load.failures.flatMap((f) => (f.source ? [f.source] : [])))];
      const analysis = analyseLicences(load.records, { unreadable, inaccessible: load.failures.some((f) => !f.source) });
      setResult({ analysis, failures: load.failures, attribution: buildAttribution(analysis) });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const findings = result?.failures.flatMap((f) => (f.finding ? [f.finding] : [])) ?? [];
  const plainFailures = result?.failures.filter((f) => !f.finding) ?? [];

  return (
    <Layout titleKey="licence.docTitle">
      <h1>{t('licence.title')}</h1>
      <p className="lead">{t('licence.intro')}</p>
      <ModeSwitch value={mode} onChange={setMode} />
      <form className="input-panel" onSubmit={(e) => void submit(e)} noValidate>
        <label className="field">
          <span>{t('licence.input.label')}</span>
          <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('licence.input.placeholder')} autoComplete="off" spellCheck={false} />
        </label>
        <p className="muted">{t('licence.input.hint')}</p>
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
          <LoadProblems
            findings={findings}
            mode={mode}
            onSwitchToServer={() => {
              setMode('server');
              setSwitched(true);
            }}
          />
          {switched && <SwitchedNotice />}
          {plainFailures.length > 0 && (
            <section className="notice" role="alert">
              <h2>{t('licence.failed.title')}</h2>
              <ul>
                {plainFailures.map((f, i) => (
                  <LangRow key={i} f={f} />
                ))}
              </ul>
            </section>
          )}
          <Summary r={result} />
          <section aria-labelledby="licence-sources-title">
            <h2 id="licence-sources-title">{t('licence.sources.title')}</h2>
            {result.analysis.groups.map((g) => (
              <GroupView key={g.id} group={g} failures={result.failures} />
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

      <section aria-labelledby="licence-checks-title">
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
  const { lang } = useLang();
  return (
    <li>
      {f.ref} — {reasonOf(f, lang)}
    </li>
  );
}
