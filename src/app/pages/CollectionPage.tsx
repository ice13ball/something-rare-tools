// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CATALOGUES, catalogueById, type CswSchema } from '../../../config/catalogues';
import { describeStop, gapText, reasonText } from '../../core/collection/stop';
import type { Estimate, Progress, RunSettings, Sample, SourceSpec, UnreadSample } from '../../core/collection/types';
import { renderPlain } from '../../core/report';
import { browserFetcher, type Fetcher } from '../../core/sources/fetcher';
import type { Report } from '../../core/types';
import { createWorkerClient, type WorkerLike } from '../../worker/client';
import { getCollectionEngine, type CollectionEngine } from '../../worker/collection.client';
import type { FileHandleLike } from '../../worker/collection.protocol';
import type { Engine } from '../../worker/protocol';
import { Layout } from '../components/Layout';
import { ReportView } from '../components/ReportView';
import { downloadBlob } from '../download';
import { t, useLang } from '../i18n';
import { loadInputs } from '../loadInput';

type Kind = 'dois' | 'datacite' | 'zenodo' | 'csw';
const KINDS: readonly Kind[] = ['dois', 'datacite', 'zenodo', 'csw'];
const PAGE = 10;
/** The engine keeps at most this many examples per rule (runner.ts SAMPLES_PER_RULE); the page does not import the runner. */
const SAMPLES_PER_RULE = 50;

/** A separate check-worker instance for one record, thrown away afterwards (it never touches the shared one). */
export interface CheckEngineHandle {
  engine: Engine;
  dispose: () => void;
}

export interface CollectionPageProps {
  /** The collection engine. Default: its module worker, created on first use. Tests pass a fake or a direct engine. */
  engine?: CollectionEngine;
  /** A fresh check engine for "check its data files". Default: a new check worker of its own. */
  createCheckEngine?: () => CheckEngineHandle;
  /** The fetcher the single-record check loads the record and its files with (browser mode). */
  fetcher?: Fetcher;
  /** Default: an object URL and a click. */
  download?: (blob: Blob, fileName: string) => void;
  /** Default: window.showSaveFilePicker where the browser has it, otherwise none. */
  pickFile?: (suggestedName: string) => Promise<FileHandleLike | null>;
}

function newCheckEngine(): CheckEngineHandle {
  let worker: Worker | undefined;
  const engine = createWorkerClient(() => {
    worker = new Worker(new URL('../../worker/check.worker.ts', import.meta.url), { type: 'module' });
    return worker as unknown as WorkerLike;
  });
  return { engine, dispose: () => worker?.terminate() };
}

type SaveWindow = { showSaveFilePicker?: (o: unknown) => Promise<FileHandleLike> };
async function defaultPickFile(suggestedName: string): Promise<FileHandleLike | null> {
  const w = window as unknown as SaveWindow;
  if (typeof w.showSaveFilePicker !== 'function') return null;
  return w.showSaveFilePicker({ suggestedName, types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }] });
}
const canPick = (): boolean => typeof (window as unknown as SaveWindow).showSaveFilePicker === 'function';

const messageOf = (e: unknown): string => (e instanceof Error && e.message ? e.message : String(e));
const looksLikeDoi = (ref: string): boolean => /^10\.\d{4,9}\/\S+$/.test(ref);

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 90) return t('collection.time.seconds', { n: s });
  const m = Math.round(s / 60);
  if (m < 90) return t('collection.time.minutes', { n: m });
  // Two days and more are said in days ("about 3 days"): a run over a very large community takes that long, and "61 h 12 min" hides it.
  if (m >= 48 * 60) return t('collection.time.days', { n: Math.round(m / (24 * 60)) });
  return t('collection.time.hours', { h: Math.floor(m / 60), m: m % 60 });
}

const fileNameFor = (p: Progress): string => `fix-list${p.settings?.sample ? '-sample' : ''}-${new Date(p.startedAt ?? Date.now()).toISOString().slice(0, 10)}.csv`;

function kindLabel(spec: SourceSpec | undefined): string {
  if (!spec) return '';
  switch (spec.kind) {
    case 'dois':
      return t('collection.kind.dois');
    case 'datacite':
      return `${t('collection.kind.datacite')}: ${spec.id}`;
    case 'zenodo':
      return `${t('collection.kind.zenodo')}: ${spec.community}`;
    case 'csw':
      return `${t('collection.kind.csw')}: ${catalogueById(spec.catalogue)?.label ?? ''}`;
  }
}

/** The notice codes of the engine, in the visitor's language. An unknown code is shown as such, never swallowed. */
function NoticeText({ code, params }: { code: string; params?: Record<string, string | number> }): React.ReactElement {
  const { lang } = useLang();
  const known = [
    'no-records', 'split-by-date', 'slices-differ', 'window-exceeded', 'ended-before-total', 'ended-before-matched', 'more-than-matched',
    'ended-by-exception', 'empty-page', 'overlapping-pages', 'overrun-stopped', 'interrupted', 'storage-failed', 'unexpected', 'unread-pages', 'records-missing', 'zenodo-slice-short', 'csv-damaged',
  ];
  // an interruption names its cause in words where there are some (the catalogue answered too slowly, the day's budget is spent)
  if (code === 'interrupted' && typeof params?.reason === 'string' && ['csw_slow', 'csw_too_large', 'csw_daily_budget', 'csw_queue_full'].includes(params.reason)) {
    return <>{t('collection.notice.interrupted' as never, { reason: t(`collection.cause.${params.reason}` as never) })}</>;
  }
  if (code === 'unread-pages' && typeof params?.reason === 'string') return <>{gapText({ code, params }, lang)}</>;
  if (known.includes(code)) return <>{t(`collection.notice.${code}` as never, params)}</>;
  if (code.startsWith('cursor-') || code === 'repeating-page') return <>{t('collection.notice.cursor', { code })}</>;
  return <>{t('collection.notice.unknown', { code })}</>;
}

function Pager({ from, to, total, onPrev, onNext }: { from: number; to: number; total: number; onPrev: () => void; onNext: () => void }): React.ReactElement {
  useLang();
  return (
    <p className="pager">
      <button type="button" className="button secondary" onClick={onPrev} disabled={from <= 1}>
        {t('collection.page.prev')}
      </button>{' '}
      <span>{t('collection.page.range', { from, to, total })}</span>{' '}
      <button type="button" className="button secondary" onClick={onNext} disabled={to >= total}>
        {t('collection.page.next')}
      </button>
    </p>
  );
}

function RecordCheck({ doi, create, fetcher, onClose }: { doi: string; create: () => CheckEngineHandle; fetcher: Fetcher; onClose: () => void }): React.ReactElement {
  useLang();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const handle = create();
    (async () => {
      try {
        const loaded = await loadInputs({ files: [], link: `https://doi.org/${doi}`, mode: 'browser' }, { fetcher: () => fetcher, onProgress: () => undefined });
        const parsed = await handle.engine.parse(loaded.files, loaded.records, loaded.findings);
        for (const f of parsed.files) await handle.engine.build(f.fileId, f.layout, f.mappings);
        const res = await handle.engine.check();
        if (alive) setReport(res.report);
      } catch (e) {
        if (alive) setError(messageOf(e));
      } finally {
        handle.dispose();
      }
    })();
    return () => {
      alive = false;
      handle.dispose();
    };
    // one check per mounted row: the inputs never change while it is open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section className="record-check card" aria-label={t('collection.record.check')}>
      <p className="muted">{t('collection.record.note')}</p>
      {!report && !error && <p role="status">{t('collection.record.busy')}</p>}
      {error !== null && (
        <p className="error-text" role="alert">
          {t('collection.record.failed', { message: error })}
        </p>
      )}
      {report && <ReportView report={report} />}
      <button type="button" className="button secondary" onClick={onClose}>
        {t('collection.record.close')}
      </button>
    </section>
  );
}

function ExampleRow({ s, lang, create, fetcher }: { s: Sample; lang: ReturnType<typeof useLang>['lang']; create: () => CheckEngineHandle; fetcher: Fetcher }): React.ReactElement {
  useLang();
  const [open, setOpen] = useState(false);
  let text = '';
  try {
    text = renderPlain({ ruleId: s.ruleId, severity: s.severity, ...(s.field ? { field: s.field } : {}), ...(s.value ? { value: s.value } : {}), params: s.params }, lang);
  } catch {
    text = s.ruleId;
  }
  return (
    <li>
      <code>{s.ref}</code> — {text}{' '}
      {looksLikeDoi(s.ref) && !open && (
        <>
          <button type="button" className="link-button" onClick={() => setOpen(true)}>
            {t('collection.record.check')}
          </button>{' '}
          <span className="muted" data-testid="record-check-browser-only">
            ({t('collection.record.browserOnly')})
          </span>
        </>
      )}
      {open && <RecordCheck doi={s.ref} create={create} fetcher={fetcher} onClose={() => setOpen(false)} />}
    </li>
  );
}

function RuleGroup(props: { engine: CollectionEngine; ruleId: string; severity: string; count: number; create: () => CheckEngineHandle; fetcher: Fetcher }): React.ReactElement {
  const { lang } = useLang();
  const { engine, ruleId, count } = props;
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Sample[]>([]);
  const total = Math.min(count, SAMPLES_PER_RULE);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    engine.samples(ruleId, page * PAGE, PAGE).then((r) => alive && setRows(r), () => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [engine, ruleId, page, open, total]);
  return (
    <details className="rule-group card" data-rule={ruleId} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <strong>{ruleId}</strong> — {t(`severity.${props.severity}` as never)} — {t('collection.rule.count', { count })}
      </summary>
      {open && (
        <>
          <h4>{t('collection.rule.examples')}</h4>
          <ul>
            {rows.map((s, i) => (
              <ExampleRow key={`${page}-${i}-${s.ref}`} s={s} lang={lang} create={props.create} fetcher={props.fetcher} />
            ))}
          </ul>
          <Pager from={total === 0 ? 0 : page * PAGE + 1} to={Math.min(total, page * PAGE + PAGE)} total={total} onPrev={() => setPage((p) => Math.max(0, p - 1))} onNext={() => setPage((p) => p + 1)} />
          <p className="muted">{t('collection.rule.note', { max: SAMPLES_PER_RULE })}</p>
        </>
      )}
    </details>
  );
}

function UnreadList({ engine }: { engine: CollectionEngine }): React.ReactElement {
  useLang();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<UnreadSample[]>([]);
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (open) void engine.unread().then(setRows, () => setRows([]));
  }, [engine, open]);
  const reasonText = (reason: string): string =>
    ['not-found-at-datacite', 'not-disseminated', 'unreadable-xml', 'unsupported-profile', 'check-failed', 'unreadable-record'].includes(reason) ? t(`collection.reason.${reason}` as never) : t('collection.reason.other', { reason });
  const stateText = (s: UnreadSample['state']): string => t(`collection.unreadState.${s}` as never);
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  return (
    <details className="card" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>{t('collection.unread.title')}</summary>
      <p className="muted">{t('collection.unread.note')}</p>
      <ul>
        {shown.map((r, i) => (
          <li key={`${page}-${i}`}>{t('collection.unread.item', { ref: r.ref, state: stateText(r.state), reason: reasonText(r.reason) })}</li>
        ))}
      </ul>
      <Pager from={rows.length === 0 ? 0 : page * PAGE + 1} to={Math.min(rows.length, page * PAGE + PAGE)} total={rows.length} onPrev={() => setPage((p) => Math.max(0, p - 1))} onNext={() => setPage((p) => p + 1)} />
    </details>
  );
}

const isRunning = (p: Progress): boolean => p.status === 'running' || p.status === 'preparing';

/**
 * Collection review: what to read, an estimate, a quick sample or a full run, progress with pause / resume / stop, results by rule
 * (counts, bounded examples, paginated) and the fix list as a CSV. The run lives in its own worker; this component only moves summaries
 * around. Nothing the visitor types (DOIs, client ids, communities, catalogues) is ever written to the URL: no router, no history
 * calls, the form never navigates.
 */
export function CollectionPage({ engine: engineProp, createCheckEngine = newCheckEngine, fetcher, download = downloadBlob, pickFile = defaultPickFile }: CollectionPageProps): React.ReactElement {
  const { lang } = useLang();
  const engine = useMemo(() => engineProp ?? getCollectionEngine(), [engineProp]);
  const recordFetcher = useMemo(() => fetcher ?? browserFetcher(), [fetcher]);

  const [kind, setKind] = useState<Kind>('datacite');
  const [dois, setDois] = useState('');
  const [dcBy, setDcBy] = useState<'client' | 'prefix'>('client');
  const [dcId, setDcId] = useState('');
  const [community, setCommunity] = useState('');
  const [catalogue, setCatalogue] = useState(CATALOGUES[0]?.id ?? '');
  const [schema, setSchema] = useState<CswSchema>('iso19139');
  const [cross, setCross] = useState(true);

  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<{ key: string; full: Estimate; sample: Estimate | null } | null>(null);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [saved, setSaved] = useState<Progress | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const started = useRef(false);

  const spec = useMemo((): SourceSpec | null => {
    switch (kind) {
      case 'dois':
        return dois.trim() === '' ? null : { kind: 'dois', text: dois };
      case 'datacite':
        return dcId.trim() === '' ? null : { kind: 'datacite', by: dcBy, id: dcId.trim() };
      case 'zenodo':
        return community.trim() === '' ? null : { kind: 'zenodo', community: community.trim() };
      case 'csw':
        return { kind: 'csw', catalogue, schema, crossSource: cross };
    }
  }, [kind, dois, dcBy, dcId, community, catalogue, schema, cross]);
  const specKey = JSON.stringify(spec);
  const current = estimate && estimate.key === specKey ? estimate : null;

  useEffect(() => {
    const off = engine.onProgress(setProgress);
    if (!started.current) {
      started.current = true;
      engine.saved().then(
        (p) => {
          if (p && p.status !== 'idle') {
            setProgress(p);
            if (p.resumable) setSaved(p);
          }
        },
        () => setError(t('collection.notice.storage-failed')),
      );
    }
    return off;
  }, [engine]);

  const refresh = (): void => void engine.progress().then(setProgress, () => undefined);

  const runEstimate = async (): Promise<void> => {
    setError(null);
    setEmpty(false);
    setEstimate(null);
    if (!spec) {
      setEmpty(true);
      return;
    }
    setEstimating(true);
    try {
      const full = await engine.estimate(spec, false);
      const sample = spec.kind === 'dois' || full.empty ? null : await engine.estimate(spec, true);
      setEstimate({ key: specKey, full, sample });
    } catch (e) {
      const m = messageOf(e);
      const csw = spec.kind === 'csw' && !m.includes('csw_daily_budget') ? cswFailureText(m, spec.catalogue) : undefined;
      setError(csw ?? t('collection.error.estimate', { message: failureText(m) }));
    } finally {
      setEstimating(false);
    }
  };

  /**
   * A catalogue that cannot be read, in words: not answering now (5xx, timeout, network, an answer that is not XML), or answering but no
   * longer as the CSW service at the known address (404, another refusal, no capabilities, the schema gone: a reinstalled or moved server).
   * Nothing was read either way, and no estimate is shown, so a run cannot start on it.
   */
  const cswFailureText = (m: string, catalogue: string): string | undefined => {
    const f = /^(unreachable|throttled|protocol|not-found): (\S+)/.exec(m);
    if (!f) return undefined;
    const label = catalogueById(catalogue)?.label ?? catalogue;
    const cause = reasonText(f[2], lang);
    return f[1] === 'unreachable' || f[1] === 'throttled' ? t('collection.error.cswDown', { catalogue: label, cause }) : t('collection.error.cswChanged', { catalogue: label, cause });
  };

  const failureText = (m: string): string => (m.includes('run-open-elsewhere') ? t('collection.error.otherTab') : m.includes('run-changed') ? t('collection.error.runChanged') : m.includes('csv-damaged') ? t('collection.notice.csv-damaged') : m.startsWith('not-found') ? t('collection.error.notFound') : m.includes('csw_daily_budget') ? t('collection.error.dailyBudget') : m);

  // one start/resume at a time: the second click of a double click, and any click before the engine has answered, does nothing
  const acting = useRef(false);
  const [actingNow, setActingNow] = useState(false);
  const guarded = async (fn: () => Promise<void>): Promise<void> => {
    if (acting.current) return;
    acting.current = true;
    setActingNow(true);
    try {
      await fn();
    } finally {
      acting.current = false;
      setActingNow(false);
    }
  };

  const run = (sample: boolean): Promise<void> => guarded(() => runUnguarded(sample));

  const runUnguarded = async (sample: boolean): Promise<void> => {
    if (!spec) return;
    setError(null);
    setSaved(null);
    setDeleted(false);
    setCsvError(null);
    const settings: RunSettings = { spec, lang, sample };
    try {
      await engine.start(settings);
    } catch (e) {
      setError(t('collection.error.start', { message: failureText(messageOf(e)) }));
    }
    refresh();
  };

  const act = (fn: () => Promise<void>, once = false) => (): void => {
    void (once ? guarded(fn) : fn()).then(refresh, (e: unknown) => setError(failureText(messageOf(e))));
  };

  const discard = async (): Promise<void> => {
    await engine.discard();
    setProgress(null);
    setSaved(null);
    setDeleted(true);
    setCsvError(null);
  };

  const downloadCsv = async (): Promise<void> => {
    setCsvError(null);
    try {
      const { blob, fileName } = await engine.download();
      download(blob, fileName);
    } catch (e) {
      setCsvError(messageOf(e).includes('csv-damaged') ? t('collection.notice.csv-damaged') : t('collection.csv.failed', { message: messageOf(e) }));
    }
  };
  const saveCsv = async (): Promise<void> => {
    if (!progress) return;
    setCsvError(null);
    try {
      const handle = await pickFile(fileNameFor(progress));
      if (handle) await engine.saveTo(handle);
    } catch (e) {
      // closing the picker is not a failure
      if (!(e instanceof DOMException && e.name === 'AbortError')) setCsvError(messageOf(e).includes('csv-damaged') ? t('collection.notice.csv-damaged') : t('collection.csv.failed', { message: messageOf(e) }));
    }
  };

  const showProgress = progress !== null && progress.status !== 'idle';
  const c = progress?.counts;
  const sampleRun = progress?.settings?.sample === true;

  return (
    <Layout titleKey="collection.docTitle">
      <h1>{t('collection.title')}</h1>
      <p className="lead">{t('collection.intro')}</p>

      {saved && (
        <section className="notice" role="region" aria-label={t('collection.saved.title')} data-testid="saved-run">
          <h2>{t('collection.saved.title')}</h2>
          <p>
            {t('collection.saved.text', {
              kind: kindLabel(saved.settings?.spec),
              sample: saved.settings?.sample ? t('collection.saved.sample') : t('collection.saved.full'),
              n: saved.counts.records,
              status: t(`collection.status.${saved.status}` as never),
            })}
          </p>
          {saved.stop && (
            <p data-testid="saved-stop">
              <strong>{t('collection.stop.heading')}.</strong> {describeStop(saved.stop, lang)}
            </p>
          )}
          <button type="button" className="button" disabled={actingNow} onClick={act(async () => { setSaved(null); await engine.resume(); }, true)}>
            {t('collection.saved.resume')}
          </button>{' '}
          <button type="button" className="button secondary" onClick={act(discard)}>
            {t('collection.saved.discard')}
          </button>
        </section>
      )}

      <form className="input-panel" onSubmit={(e) => { e.preventDefault(); void runEstimate(); }} noValidate>
        <fieldset className="choice-group">
          <legend>{t('collection.kind.legend')}</legend>
          <div className="choice-row">
            {KINDS.map((k) => (
              <label key={k} className="choice">
                <input type="radio" name="collection-kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
                <span>{t(`collection.kind.${k}` as never)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {kind === 'dois' && (
          <>
            <label className="field">
              <span>{t('collection.dois.label')}</span>
              <textarea rows={6} value={dois} onChange={(e) => setDois(e.target.value)} placeholder={t('collection.dois.placeholder')} autoComplete="off" spellCheck={false} />
            </label>
            <p className="muted">{t('collection.dois.hint')}</p>
            <p className="muted">{t('collection.dois.sampleNote')}</p>
          </>
        )}
        {kind === 'datacite' && (
          <>
            <fieldset className="choice-group">
              <legend>{t('collection.dc.by')}</legend>
              <div className="choice-row">
                {(['client', 'prefix'] as const).map((b) => (
                  <label key={b} className="choice">
                    <input type="radio" name="collection-dc-by" value={b} checked={dcBy === b} onChange={() => setDcBy(b)} />
                    <span>{t(`collection.dc.${b}` as never)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="field">
              <span>{t('collection.dc.label')}</span>
              <input type="text" className="input-short" value={dcId} onChange={(e) => setDcId(e.target.value)} autoComplete="off" spellCheck={false} />
            </label>
            <p className="muted">{t('collection.dc.hint')}</p>
          </>
        )}
        {kind === 'zenodo' && (
          <>
            <label className="field">
              <span>{t('collection.zen.label')}</span>
              <input type="text" className="input-short" value={community} onChange={(e) => setCommunity(e.target.value)} autoComplete="off" spellCheck={false} />
            </label>
            <p className="muted">{t('collection.zen.hint')}</p>
          </>
        )}
        {kind === 'csw' && (
          <>
            <label className="field">
              <span>{t('collection.csw.label')}</span>
              <select className="input-short" value={catalogue} onChange={(e) => setCatalogue(e.target.value)}>
                {CATALOGUES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('collection.csw.schema')}</span>
              <select className="input-short" value={schema} onChange={(e) => setSchema(e.target.value as CswSchema)}>
                {(catalogueById(catalogue)?.schemas ?? ['iso19139']).map((s) => (
                  <option key={s} value={s}>
                    {t(`collection.schema.${s}` as never)}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">{t('collection.csw.note')}</p>
            <label className="inline-choice">
              <input type="checkbox" checked={cross} onChange={(e) => setCross(e.target.checked)} />
              <span>{t('collection.csw.cross')}</span>
            </label>
            <p className="muted">{t('collection.csw.cross.note')}</p>
          </>
        )}

        {empty && (
          <p className="error-text" role="alert">
            {t('collection.estimate.none')}
          </p>
        )}
        <button type="submit" className="button" disabled={estimating || (progress !== null && isRunning(progress))}>
          {estimating ? t('collection.estimate.busy') : t('collection.estimate.button')}
        </button>
      </form>

      {error !== null && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      {current && (
        <section aria-labelledby="collection-estimate-title" data-testid="estimate">
          <h2 id="collection-estimate-title">{t('collection.estimate.title')}</h2>
          {current.full.empty ? (
            <p>{t('collection.estimate.empty')}</p>
          ) : (
            <>
              <p>{t('collection.estimate.full', { records: current.full.records, requests: current.full.requests, time: formatTime(current.full.seconds) })}</p>
              {current.sample && (
                <p>{t('collection.estimate.sample', { records: current.sample.records, requests: current.sample.requests, time: formatTime(current.sample.seconds) })}</p>
              )}
              {current.full.extraRequests > 0 && <p>{t('collection.estimate.extra', { n: current.full.extraRequests })}</p>}
              {current.full.slices !== undefined && current.full.slices > 1 && <p>{t('collection.estimate.slices', { slices: current.full.slices })}</p>}
              {current.full.approximate && <p className="muted">{t('collection.estimate.approx')}</p>}
              {current.full.sampleFirst && current.sample && <p data-testid="sample-first">{t('collection.estimate.sampleFirst')}</p>}
              <p className="muted">{t('collection.run.hint')}</p>
              {current.sample && (
                <>
                  <button type="button" className="button" onClick={() => void run(true)} disabled={actingNow || (progress !== null && isRunning(progress))}>
                    {t('collection.run.sample')}
                  </button>{' '}
                </>
              )}
              <button type="button" className="button" onClick={() => void run(false)} disabled={actingNow || (progress !== null && isRunning(progress))}>
                {t('collection.run.full')}
              </button>
            </>
          )}
        </section>
      )}

      {showProgress && progress && c && (
        <section aria-labelledby="collection-progress-title" data-testid="progress">
          <h2 id="collection-progress-title">{t('collection.progress.title')}</h2>
          {sampleRun && (
            <p className="notice" data-testid="sample-label">
              {t('collection.sample.label')}
            </p>
          )}
          <p role="status">
            {t('collection.progress.status', { status: t(`collection.status.${progress.status}` as never) })} {t('collection.progress.met', { n: c.records })}
          </p>
          <ul>
            <li>{t('collection.state.checked', { n: c.states.checked })}</li>
            <li>{t('collection.state.unreachable', { n: c.states.unreachable })}</li>
            <li>{t('collection.state.throttled', { n: c.states.throttled })}</li>
            <li>{t('collection.state.unsupported', { n: c.states['unsupported-profile'] })}</li>
            {(c.states['not-in-datacite'] ?? 0) > 0 && <li data-testid="state-not-in-datacite">{t('collection.state.notInDatacite', { n: c.states['not-in-datacite'] })}</li>}
          </ul>
          <p className="muted">
            {t('collection.progress.requests', { requests: progress.stats.requests, retries: progress.stats.retries, throttled: progress.stats.throttleEvents })}{' '}
            {t('collection.progress.elapsed', { time: formatTime(progress.elapsedMs / 1000) })}
          </p>
          {progress.deferred > 0 && <p className="notice">{t('collection.progress.deferred', { n: progress.deferred })}</p>}
          {progress.stop && !isRunning(progress) && (
            <p className="notice" role="alert" data-testid="stop-reason">
              <strong>{t('collection.stop.heading')}.</strong> {describeStop(progress.stop, lang)}
            </p>
          )}
          {(c.crossSource.notCompared ?? 0) > 0 && (
            <p className="notice" data-testid="cross-not-done">
              {t('collection.cross.notDone', { n: c.crossSource.notCompared ?? 0 })}
            </p>
          )}
          {c.duplicatesInBatch > 0 && (
            <p className="notice" data-testid="duplicates">
              {t('collection.duplicates', { n: c.duplicatesInBatch })}
            </p>
          )}
          {progress.notices.map((n, i) => (
            <p key={i} className="notice" data-testid="notice">
              <NoticeText code={n.code} params={n.params} />
            </p>
          ))}
          <p>
            {progress.status === 'running' && (
              <button type="button" className="button secondary" onClick={act(() => engine.pause())}>
                {t('collection.pause')}
              </button>
            )}
            {progress.resumable && !isRunning(progress) && (
              <button type="button" className="button secondary" disabled={actingNow} onClick={act(() => { setSaved(null); return engine.resume(); }, true)}>
                {t('collection.resume')}
              </button>
            )}{' '}
            {(isRunning(progress) || progress.status === 'paused') && (
              <button type="button" className="button secondary" onClick={act(() => engine.stop())}>
                {t('collection.stop')}
              </button>
            )}
          </p>
        </section>
      )}

      {showProgress && progress && c && (c.states.checked > 0 || progress.ruleOrder.length > 0) && (
        <section aria-labelledby="collection-results-title" data-testid="results">
          <h2 id="collection-results-title">{t('collection.results.title')}</h2>
          {sampleRun && <p className="notice">{t('collection.results.sample')}</p>}
          <p>{t('collection.results.summary', { with: c.withFindings, checked: c.states.checked })}</p>
          {progress.ruleOrder.length === 0 && <p>{t('collection.results.none')}</p>}
          {progress.ruleOrder.map((r) => (
            <RuleGroup key={r.ruleId} engine={engine} ruleId={r.ruleId} severity={r.severity} count={r.count} create={createCheckEngine} fetcher={recordFetcher} />
          ))}
          {c.records > c.states.checked && <p className="muted">{t('collection.results.partial')}</p>}
        </section>
      )}

      {showProgress && progress && c && c.records > c.states.checked && <UnreadList engine={engine} />}

      {showProgress && progress && progress.csv.rows > 0 && (
        <section aria-labelledby="collection-csv-title">
          <h2 id="collection-csv-title">{t('collection.csv.title')}</h2>
          <p>{t('collection.csv.rows', { rows: progress.csv.rows })}</p>
          {sampleRun && <p className="muted">{t('collection.csv.sample')}</p>}
          <button type="button" className="button" onClick={() => void downloadCsv()}>
            {t('collection.csv.download')}
          </button>{' '}
          {canPick() && (
            <button type="button" className="button secondary" onClick={() => void saveCsv()}>
              {t('collection.csv.save')}
            </button>
          )}
          {csvError !== null && (
            <p className="error-text" role="alert">
              {csvError}
            </p>
          )}
        </section>
      )}

      <section className="housekeeping" aria-label={t('collection.delete.button')}>
        <p className="muted">{t('collection.delete.note')}</p>
        <button type="button" className="button secondary small" onClick={act(discard)} disabled={actingNow || (progress !== null && isRunning(progress))}>
          {t('collection.delete.button')}
        </button>
        {deleted && (
          <p role="status" className="muted">
            {t('collection.delete.done')}
          </p>
        )}
      </section>

      <section className="about" aria-labelledby="collection-checks-title">
        <h2 id="collection-checks-title">{t('collection.checks.title')}</h2>
        <p>{t('collection.checks.p1')}</p>
        <ul>
          <li>{t('collection.checks.li1')}</li>
          <li>{t('collection.checks.li2')}</li>
          <li>{t('collection.checks.li3')}</li>
        </ul>
        <p>{t('collection.checks.li4')}</p>
      </section>
    </Layout>
  );
}
