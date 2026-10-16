// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useMemo, useRef, useState } from 'react';
import { browserFetcher, serverFetcher, type Fetcher } from '../../core/sources/fetcher';
import type { ColumnProposal, Finding, LayoutPlan, SheetMapping } from '../../core/types';
import { getEngine } from '../../worker/client';
import type { CheckResult, Engine, ParseResult } from '../../worker/protocol';
import { track } from '../analytics';
import { Downloads } from '../components/Downloads';
import { FileReview } from '../components/FileReview';
import { InputPanel } from '../components/InputPanel';
import { Layout } from '../components/Layout';
import { LoadProblems, SwitchedNotice } from '../components/LoadProblems';
import { MapPreview, type MapLib } from '../components/MapPreview';
import { ModeSwitch } from '../components/ModeSwitch';
import { ReportView } from '../components/ReportView';
import type { downloadText } from '../download';
import { t, useLang } from '../i18n';
import { classifyInput } from '../inputType';
import { loadInputs, UnknownLinkError, type LoadLine } from '../loadInput';
import { DEFAULT_MODE, type CheckInput, type DownloadMode } from '../types';

export interface CheckPageProps {
  /** The worker client. Default: the page's module worker, created on first use. Tests pass a direct engine. */
  engine?: Engine;
  /** Default: the browser's own fetch (browser mode) or POST /api/fetch (server mode). */
  fetcherFor?: (mode: DownloadMode) => Fetcher;
  /** Replaced in tests: the default loads maplibre-gl on demand. */
  mapLib?: () => Promise<MapLib>;
  download?: typeof downloadText;
  writeClipboard?: (text: string) => Promise<void>;
}

type Phase = 'input' | 'loading' | 'confirm' | 'checking' | 'report';
type Problem = { kind: 'unknownLink' } | { kind: 'failed'; message: string };

const defaultFetcher = (mode: DownloadMode): Fetcher => (mode === 'server' ? serverFetcher() : browserFetcher());

function messageOf(e: unknown): string {
  return e instanceof Error && e.message ? e.message : String(e);
}

/**
 * Mode first, then input, loading, a confirmation of layout and columns per file, the report with map and downloads.
 * All state lives here; nothing the visitor provides is ever written to the URL (no router, no history calls, the form never
 * navigates). Parsing, building and checking run in the worker; this component only moves summaries around.
 */
export function CheckPage({ engine: engineProp, fetcherFor = defaultFetcher, mapLib, download, writeClipboard }: CheckPageProps): React.ReactElement {
  useLang();
  const engine = useMemo(() => engineProp ?? getEngine(), [engineProp]);
  const [mode, setMode] = useState<DownloadMode>(DEFAULT_MODE);
  const [phase, setPhase] = useState<Phase>('input');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [lines, setLines] = useState<LoadLine[]>([]);
  const [loadFindings, setLoadFindings] = useState<Finding[]>([]);
  const [switched, setSwitched] = useState(false);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [layouts, setLayouts] = useState<Record<string, LayoutPlan>>({});
  const [mappings, setMappings] = useState<Record<string, SheetMapping[]>>({});
  const [proposals, setProposals] = useState<Record<string, Record<string, ColumnProposal[]>>>({});
  const [result, setResult] = useState<CheckResult | null>(null);
  const analytics = useRef<{ inputType: ReturnType<typeof classifyInput>; mode: DownloadMode } | null>(null);

  const busy = phase === 'loading' || phase === 'checking';

  const finish = async (files: ParseResult['files'], lay: Record<string, LayoutPlan>, maps: Record<string, SheetMapping[]>): Promise<void> => {
    setPhase('checking');
    try {
      for (const f of files) await engine.build(f.fileId, lay[f.fileId] ?? f.layout, maps[f.fileId] ?? f.mappings);
      const res = await engine.check();
      setResult(res);
      setPhase('report');
      const a = analytics.current;
      if (a) {
        track('check_finished', {
          input_type: a.inputType,
          mode: a.mode,
          n_errors: res.report.counts.error,
          n_warnings: res.report.counts.warning,
          n_info: res.report.counts.info,
        });
      }
    } catch (e) {
      setProblem({ kind: 'failed', message: messageOf(e) });
      setPhase(files.length > 0 ? 'confirm' : 'input');
    }
  };

  const submit = async (input: CheckInput): Promise<void> => {
    analytics.current = { inputType: classifyInput(input.files.length, input.link), mode: input.mode };
    track('check_started', { input_type: analytics.current.inputType, mode: input.mode });
    setProblem(null);
    setResult(null);
    setParsed(null);
    setLoadFindings([]);
    setSwitched(false);
    setLines([]);
    setPhase('loading');
    try {
      const loaded = await loadInputs(input, { fetcher: fetcherFor, onProgress: setLines });
      // the record's own findings (blocked record, inaccessible GeoNetwork) are shown like the download ones
      setLoadFindings([...loaded.records.flatMap((r) => r.findings), ...loaded.findings]);
      const p = await engine.parse(loaded.files, loaded.records, loaded.findings);
      setParsed(p);
      setLayouts(Object.fromEntries(p.files.map((f) => [f.fileId, f.layout])));
      setMappings(Object.fromEntries(p.files.map((f) => [f.fileId, f.mappings])));
      setProposals(Object.fromEntries(p.files.map((f) => [f.fileId, f.proposals])));
      if (p.files.length > 0) setPhase('confirm');
      else await finish([], {}, {});
    } catch (e) {
      setProblem(e instanceof UnknownLinkError ? { kind: 'unknownLink' } : { kind: 'failed', message: messageOf(e) });
      setPhase('input');
    }
  };

  const changeLayout = (fileId: string, plan: LayoutPlan): void => {
    const before = layouts[fileId];
    setLayouts((prev) => ({ ...prev, [fileId]: plan }));
    // A different parameter/unit/value column changes which columns the layout consumes: propose the columns again.
    if (before && JSON.stringify(before.tables) !== JSON.stringify(plan.tables)) {
      engine.propose(fileId, plan).then(
        (p) => {
          setMappings((prev) => ({ ...prev, [fileId]: p.mappings }));
          setProposals((prev) => ({ ...prev, [fileId]: p.proposals }));
        },
        (e: unknown) => setProblem({ kind: 'failed', message: messageOf(e) }),
      );
    }
  };

  const changeMapping = (fileId: string, mapping: SheetMapping): void =>
    setMappings((prev) => ({ ...prev, [fileId]: (prev[fileId] ?? []).map((m) => (m.sheet === mapping.sheet ? mapping : m)) }));

  const files = parsed?.files ?? [];
  const reset = (): void => {
    setPhase('input');
    setParsed(null);
    setResult(null);
    setProblem(null);
  };

  return (
    <Layout titleKey="check.title">
      <h1>{t('check.title')}</h1>
      <p className="lead">{t('check.intro')}</p>
      <ModeSwitch value={mode} onChange={setMode} />
      <InputPanel mode={mode} onSubmit={(i) => void submit(i)} disabled={busy} />

      {problem?.kind === 'unknownLink' && (
        <p className="error-text" role="alert">
          {t('check.link.unknown')}
        </p>
      )}
      {problem?.kind === 'failed' && (
        <p className="error-text" role="alert">
          {t('check.error')} {t('check.error.detail', { message: problem.message })}
        </p>
      )}

      {phase === 'loading' && lines.length > 0 && (
        <section className="load-status" aria-label={t('load.title')}>
          <h2>{t('load.title')}</h2>
          <ul role="status">
            {lines.map((l) => (
              <li key={l.id} data-state={l.state}>
                {l.kind === 'record' ? t('load.record') : l.name} — {t(`load.state.${l.state}` as never)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <LoadProblems
        findings={loadFindings}
        mode={mode}
        onSwitchToServer={() => {
          setMode('server');
          setSwitched(true);
        }}
      />
      {switched && <SwitchedNotice />}

      {parsed && parsed.problems.length > 0 && (
        <section className="notice" role="alert">
          <p>{t('confirm.problems')}</p>
          <ul>
            {parsed.problems.map((p, i) => (
              <li key={i}>{p.message}</li>
            ))}
          </ul>
        </section>
      )}
      {parsed && parsed.metadataFiles.length > 0 && <p className="muted">{t('confirm.metadataFiles', { names: parsed.metadataFiles.join(', ') })}</p>}
      {parsed && parsed.notRead.length > 0 && <p className="muted">{t('confirm.notRead', { names: parsed.notRead.map((n) => n.fileName).join(', ') })}</p>}

      {phase === 'confirm' && parsed && (
        <section className="confirm-step" aria-labelledby="confirm-title">
          <h2 id="confirm-title">{t('confirm.title')}</h2>
          <p>{t('confirm.intro')}</p>
          {files.map((f) => (
            <FileReview
              key={f.fileId}
              file={f}
              layout={layouts[f.fileId] ?? f.layout}
              mappings={mappings[f.fileId] ?? f.mappings}
              proposals={proposals[f.fileId] ?? f.proposals}
              onLayout={(plan) => changeLayout(f.fileId, plan)}
              onMapping={(m) => changeMapping(f.fileId, m)}
            />
          ))}
          <div className="confirm-actions">
            <button type="button" className="button" onClick={() => void finish(files, layouts, mappings)}>
              {t('confirm.submit')}
            </button>
            <button type="button" className="link-button" onClick={reset}>
              {t('check.restart')}
            </button>
          </div>
        </section>
      )}

      {phase === 'checking' && (
        <p className="notice" role="status">
          {t('confirm.checking')}
        </p>
      )}

      {phase === 'report' && result && (
        <>
          <ReportView report={result.report} />
          <MapPreview datasets={result.datasets} engine={engine} loadLib={mapLib} />
          <Downloads datasets={result.datasets} engine={engine} download={download} writeClipboard={writeClipboard} />
        </>
      )}
    </Layout>
  );
}
