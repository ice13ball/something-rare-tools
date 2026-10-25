// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { EventRec, TaxonSplit } from '../../core/convert';
import type { UiKey } from '../../core/i18n/ui';
import type { Finding, SheetMapping } from '../../core/types';
import { getConvertEngine } from '../../worker/convert.client';
import type { ConvertEngine, ConvertFileSummary, ConvertParseResult, ConvertView } from '../../worker/convert.protocol';
import { ConvertSheetForm } from '../components/ConvertSheetForm';
import { FileReview } from '../components/FileReview';
import { HeadingTip, InfoTip } from '../components/InfoTip';
import { InputPanel } from '../components/InputPanel';
import { Layout } from '../components/Layout';
import { initialChoices, plainOf, requestOf, sheetKey, codesFileName, type SheetChoice } from '../convertModel';
import { downloadText } from '../download';
import { t, useLang } from '../i18n';
import { useLeaveWarning } from '../leaveWarning';
import { CONVERT_ROLE_CHOICES } from '../mappingModel';
import type { InputFile } from '../../worker/protocol';
import type { CheckInput } from '../types';

export interface ConvertPageProps {
  /** The worker client. Default: the page's module worker, created on first use. Tests pass a direct engine. */
  engine?: ConvertEngine;
  download?: typeof downloadText;
}

type Phase = 'input' | 'reading' | 'work';

const messageOf = (e: unknown): string => (e instanceof Error && e.message ? e.message : String(e));

async function toInputFiles(files: File[]): Promise<InputFile[]> {
  return Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), source: 'dropped' as const })));
}

const splitText = (s: TaxonSplit): string => s.scientificName;
const sexText = (sex: 'female' | 'male'): string => t(`convert.sex.${sex}` as UiKey);

function nodeLine(e: EventRec): string {
  const bits: string[] = [];
  if (e.eventDate) bits.push(t('convert.node.date', { value: e.eventDate }));
  if (e.lat !== undefined && e.lon !== undefined) bits.push(t('convert.node.position', { lat: e.lat, lon: e.lon }));
  if (e.coordinateUncertaintyInMeters !== undefined) bits.push(t('convert.node.uncertainty', { m: e.coordinateUncertaintyInMeters }));
  if (e.depthMin !== undefined && e.depthMax !== undefined) bits.push(t('convert.node.depth', { min: e.depthMin, max: e.depthMax }));
  const derived = e.derived.date || e.derived.position || e.derived.depth;
  return `${bits.join('; ')}${derived ? ` (${t('convert.node.derived')})` : ''}`;
}

/**
 * /convert, stage 1b: drop files, check the columns, decide the shape and what the numbers mean, approve taxon splits, see the event tree and a
 * summary. There is NO export yet, and the page is hidden (in no menu, index card or sitemap). Files are read in the browser by the convert worker;
 * nothing is sent anywhere and nothing is stored. All state lives here and starts empty for each upload; only a companion file dropped with the
 * data can pre-tick the full-species-list and the station-prefix choices.
 */
export function ConvertPage({ engine: engineProp, download = downloadText }: ConvertPageProps): React.ReactElement {
  useLang();
  const engine = useMemo(() => engineProp ?? getConvertEngine(), [engineProp]);
  const [phase, setPhase] = useState<Phase>('input');
  const [problem, setProblem] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ConvertParseResult | null>(null);
  const [mappings, setMappings] = useState<Record<string, SheetMapping[]>>({});
  const [choices, setChoices] = useState<Record<string, SheetChoice>>({});
  const [fullList, setFullList] = useState(false);
  const [prefixStation, setPrefixStation] = useState(false);
  const [flattenStation, setFlattenStation] = useState(false);
  const [flattenCruise, setFlattenCruise] = useState(false);
  const [approved, setApproved] = useState<Record<string, TaxonSplit>>({});
  const [view, setView] = useState<ConvertView | null>(null);
  const [working, setWorking] = useState(false);
  const [codesDone, setCodesDone] = useState<Record<string, string | null>>({});
  const [filesChosen, setFilesChosen] = useState(0);
  const token = useRef(0);
  const files = parsed?.files ?? [];

  // Work that leaving would lose: files chosen, or a conversion in view. Never an empty page.
  useLeaveWarning(filesChosen > 0 || phase !== 'input');

  const submit = async (input: CheckInput): Promise<void> => {
    setProblem(null);
    setParsed(null);
    setView(null);
    setCodesDone({});
    setApproved({});
    setFlattenStation(false);
    setFlattenCruise(false);
    setPhase('reading');
    try {
      const p = await engine.parse(await toInputFiles(input.files));
      setParsed(p);
      setMappings(Object.fromEntries(p.files.map((f) => [f.fileId, f.mappings])));
      setChoices(initialChoices(p));
      // the ticks start from a companion file of THIS drop, and from nothing else
      setFullList(p.settings.fullList);
      setPrefixStation(p.settings.prefixStation);
      setPhase(p.files.length > 0 ? 'work' : 'input');
    } catch (e) {
      setProblem(messageOf(e));
      setPhase('input');
    }
  };

  const reset = (): void => {
    token.current += 1;
    void engine.reset().catch(() => undefined);
    setParsed(null);
    setView(null);
    setProblem(null);
    setPhase('input');
  };

  // the conversion follows every decision; a late answer to an earlier request is dropped
  useEffect(() => {
    if (phase !== 'work' || !parsed) return undefined;
    const mine = ++token.current;
    setWorking(true);
    const timer = setTimeout(() => {
      engine
        .convert(requestOf({ parsed, mappings, choices, options: { fullList, prefixStation, flatten: { station: flattenStation, cruise: flattenCruise } }, approved }))
        .then(
          (v) => {
            if (token.current === mine) setView(v);
          },
          (e: unknown) => {
            if (token.current === mine) setProblem(messageOf(e));
          },
        )
        .finally(() => {
          if (token.current === mine) setWorking(false);
        });
    }, 120);
    return () => clearTimeout(timer);
  }, [engine, phase, parsed, mappings, choices, fullList, prefixStation, flattenStation, flattenCruise, approved]);

  const changeMapping = (fileId: string, mapping: SheetMapping): void =>
    setMappings((prev) => ({ ...prev, [fileId]: (prev[fileId] ?? []).map((m) => (m.sheet === mapping.sheet ? mapping : m)) }));

  const proposeCodes = async (fileId: string, sheet: string): Promise<void> => {
    const mapping = (mappings[fileId] ?? []).find((m) => m.sheet === sheet);
    if (!mapping) return;
    try {
      const p = await engine.proposeCodes(fileId, sheet, mapping);
      const key = sheetKey(fileId, sheet);
      if (!p) {
        setCodesDone((prev) => ({ ...prev, [key]: null }));
        return;
      }
      const f = files.find((x) => x.fileId === fileId);
      const name = codesFileName(f?.fileName ?? p.fileName, sheet, f?.sheets.length ?? 1);
      download(p.csv, name, 'text/csv');
      setCodesDone((prev) => ({ ...prev, [key]: name }));
    } catch (e) {
      setProblem(messageOf(e));
    }
  };

  const toApprove = (view?.splits ?? []).filter((s) => s.needsDecision);
  const blocking = (view?.findings ?? []).filter((f) => f.severity === 'error');
  const warnings = (view?.findings ?? []).filter((f) => f.severity === 'warning');
  const infos = (view?.findings ?? []).filter((f) => f.severity === 'info');
  const showPrefix = prefixStation || view?.codeCollision === true;

  return (
    <Layout titleKey="convert.title">
      <h1>{t('convert.title')}</h1>
      <div className="with-tip">
        <p className="lead">{t('convert.intro')}</p>
        <InfoTip id="convertIntro" />
      </div>
      <section className="notice" role="status">
        <h2>{t('convert.status.title')}</h2>
        <p>{t('convert.status.text')}</p>
      </section>

      <InputPanel mode="browser" withLink={false} submitKey="convert.read" disabled={phase === 'reading'} onFilesChange={setFilesChosen} onSubmit={(i) => void submit(i)} />

      {problem !== null && (
        <p className="error-text" role="alert">
          {t('convert.error', { message: problem })}
        </p>
      )}
      {phase === 'reading' && (
        <p className="notice" role="status">
          {t('convert.reading')}
        </p>
      )}

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
      {parsed && parsed.metadataFiles.length > 0 && <p className="muted">{t('convert.files.metadata', { names: parsed.metadataFiles.join(', ') })}</p>}
      {parsed && parsed.mappingFiles.length > 0 && <p className="muted">{t('convert.files.companion', { names: parsed.mappingFiles.join(', ') })}</p>}
      {parsed && parsed.notRead.length > 0 && <p className="muted">{t('confirm.notRead', { names: parsed.notRead.map((n) => n.fileName).join(', ') })}</p>}
      {parsed && parsed.files.length === 0 && phase === 'input' && <p className="notice">{t('convert.noSheets')}</p>}

      {phase === 'work' && parsed && (
        <>
          <section className="confirm-step" aria-labelledby="convert-columns-title">
            <h2 id="convert-columns-title">{t('convert.columns.title')}</h2>
            <p>{t('convert.columns.intro')}</p>
            {files.map((f: ConvertFileSummary) => (
              <FileReview
                key={f.fileId}
                file={f}
                layout={f.layout}
                mappings={mappings[f.fileId] ?? f.mappings}
                proposals={f.proposals}
                onLayout={() => undefined}
                onMapping={(m) => changeMapping(f.fileId, m)}
                roleKinds={CONVERT_ROLE_CHOICES}
                rolesTip="convertRoles"
              />
            ))}
          </section>

          <section className="convert-sheets" aria-label={t('convert.quantity.title')}>
            {files.flatMap((f) =>
              (mappings[f.fileId] ?? f.mappings).map((m) => {
                const key = sheetKey(f.fileId, m.sheet);
                const choice = choices[key];
                if (!choice) return null;
                return (
                  <ConvertSheetForm
                    key={key}
                    fileName={f.fileName}
                    sheet={m.sheet}
                    hasCruiseColumn={m.columns.some((c) => c.role.kind === 'cruise')}
                    hasEffortColumn={m.columns.some((c) => c.role.kind === 'effort')}
                    choice={choice}
                    onChange={(c) => setChoices((prev) => ({ ...prev, [key]: c }))}
                  />
                );
              }),
            )}
          </section>

          <section className="convert-options" aria-labelledby="convert-options-title">
            <h2 id="convert-options-title">{t('convert.options.title')}</h2>
            <div className="choice-line">
              <label className="inline-choice">
                <input type="checkbox" checked={fullList} onChange={(e) => setFullList(e.target.checked)} aria-describedby="convert-fulllist-help" />
                <span>{t('convert.fullList')}</span>
              </label>
              <InfoTip id="convertFullList" />
            </div>
            <p id="convert-fulllist-help" className="muted">
              {t('convert.fullList.help')}
            </p>
            {showPrefix && (
              <>
                <div className="choice-line">
                  <label className="inline-choice">
                    <input type="checkbox" checked={prefixStation} onChange={(e) => setPrefixStation(e.target.checked)} aria-describedby="convert-prefix-help" />
                    <span>{t('convert.prefix')}</span>
                  </label>
                  <InfoTip id="convertStationPrefix" />
                </div>
                <p id="convert-prefix-help" className="muted">
                  {t('convert.prefix.help')}
                </p>
              </>
            )}
          </section>

          {toApprove.length > 0 && (
            <section className="convert-splits" aria-labelledby="convert-splits-title">
              <HeadingTip tip="convertSplits">
                <h2 id="convert-splits-title">{t('convert.splits.title')}</h2>
              </HeadingTip>
              <p>{t('convert.splits.intro')}</p>
              {toApprove.some((s) => !s.approved) && (
                <button type="button" className="button" onClick={() => setApproved((prev) => ({ ...prev, ...Object.fromEntries(toApprove.map((s) => [s.verbatim, s.proposed])) }))}>
                  {t('convert.splits.approveAll', { n: toApprove.filter((s) => !s.approved).length })}
                </button>
              )}
              <div className="table-scroll">
                <table className="convert-table">
                  <thead>
                    <tr>
                      <th scope="col">{t('convert.splits.verbatim')}</th>
                      <th scope="col">{t('convert.splits.name')}</th>
                      <th scope="col">{t('convert.splits.qualifier')}</th>
                      <th scope="col">{t('convert.splits.stage')}</th>
                      <th scope="col">{t('convert.splits.sex')}</th>
                      <th scope="col">{t('convert.splits.approved')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toApprove.map((s) => (
                      <tr key={s.verbatim} data-approved={s.approved ? 'true' : 'false'}>
                        <th scope="row">
                          <code>{s.verbatim}</code>
                          <span className="muted"> {t('convert.splits.uses', { n: s.uses })}</span>
                        </th>
                        <td>
                          <i>{splitText(s.split)}</i>
                        </td>
                        <td>{s.split.identificationQualifier ?? ''}</td>
                        <td>{s.split.lifeStage ?? ''}</td>
                        <td>{s.split.sex ? sexText(s.split.sex) : ''}</td>
                        <td>
                          {s.approved ? (
                            <button type="button" className="link-button" aria-label={`${t('convert.splits.withdraw')}: ${s.verbatim}`} onClick={() => setApproved((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== s.verbatim)))}>
                              {t('convert.splits.withdraw')}
                            </button>
                          ) : (
                            <button type="button" className="button" aria-label={`${t('convert.splits.approve')}: ${s.verbatim}`} onClick={() => setApproved((prev) => ({ ...prev, [s.verbatim]: s.proposed }))}>
                              {t('convert.splits.approve')}
                            </button>
                          )}
                          <span className="visually-hidden"> {s.approved ? t('convert.splits.approved') : t('convert.splits.undecided')}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {(view?.codesMissing ?? []).length > 0 && (
            <section className="convert-codes" aria-labelledby="convert-codes-title">
              <HeadingTip tip="convertCodes">
                <h2 id="convert-codes-title">{t('convert.codes.title')}</h2>
              </HeadingTip>
              {(view?.codesMissing ?? []).map((c) => {
                const f = files.find((x) => x.fileId === c.fileId);
                const key = sheetKey(c.fileId, c.sheet);
                return (
                  <div key={key} className="notice" role="note">
                    <p>{t('convert.codes.text', { sheet: c.sheet, file: f?.fileName ?? '' })}</p>
                    <button type="button" className="button" onClick={() => void proposeCodes(c.fileId, c.sheet)}>
                      {t('convert.codes.propose')}
                    </button>
                    {codesDone[key] ? <p role="status">{t('convert.codes.done', { name: codesDone[key] as string })}</p> : null}
                    {codesDone[key] === null ? <p role="status">{t('convert.codes.none')}</p> : null}
                  </div>
                );
              })}
            </section>
          )}

          <section className="convert-tree" aria-labelledby="convert-tree-title">
            <HeadingTip tip="convertTree">
              <h2 id="convert-tree-title">{t('convert.tree.title')}</h2>
            </HeadingTip>
            {view && view.tree.events > 0 ? (
              <>
                <p>{t('convert.tree.counts', { cruises: view.tree.cruises, stations: view.tree.stations, samples: view.tree.samples })}</p>
                {(view.tree.derivedDates > 0 || view.tree.derivedPositions > 0 || view.tree.derivedDepths > 0) && (
                  <p className="muted">{t('convert.tree.derived', { dates: view.tree.derivedDates, positions: view.tree.derivedPositions, depths: view.tree.derivedDepths })}</p>
                )}
                {view.tree.maxUncertaintyM !== undefined && <p className="muted">{t('convert.tree.uncertainty', { m: view.tree.maxUncertaintyM })}</p>}
                {view.tree.samplesWithoutPosition > 0 && <p className="muted">{t('convert.tree.noPosition', { n: view.tree.samplesWithoutPosition })}</p>}
                {view.cruiseText.length > 0 && <p>{t('convert.tree.cruiseText', { codes: view.cruiseText.join(', ') })}</p>}
                <h3>{t('convert.tree.examples')}</h3>
                <ul className="convert-nodes">
                  {(['cruise', 'station', 'sample'] as const).flatMap((level) =>
                    view.examples[level].map((e) => (
                      <li key={`${level}:${e.id}`} data-level={level}>
                        <strong>{t(`convert.type.${level}` as UiKey)}</strong> <code>{e.id}</code>
                        {nodeLine(e) !== '' && <span className="muted"> — {nodeLine(e)}</span>}
                      </li>
                    )),
                  )}
                </ul>
              </>
            ) : (
              <p className="muted">{t('convert.tree.empty')}</p>
            )}
            <div className="choice-line">
              <label className="inline-choice">
                <input type="checkbox" checked={flattenStation} onChange={(e) => setFlattenStation(e.target.checked)} />
                <span>{t('convert.flatten.station')}</span>
              </label>
              <InfoTip id="convertFlattenStation" />
            </div>
            <div className="choice-line">
              <label className="inline-choice">
                <input type="checkbox" checked={flattenCruise} onChange={(e) => setFlattenCruise(e.target.checked)} />
                <span>{t('convert.flatten.cruise')}</span>
              </label>
              <InfoTip id="convertFlattenCruise" />
            </div>
          </section>

          <section className="convert-summary" aria-labelledby="convert-summary-title" aria-busy={working}>
            <h2 id="convert-summary-title">{t('convert.summary.title')}</h2>
            {working && !view && <p className="muted">{t('convert.working')}</p>}
            {view && (
              <>
                <p>{t('convert.summary.counts', { events: view.tree.events, occurrences: view.stats.occurrences, present: view.stats.present, absent: view.stats.absent, measurements: view.stats.measurements })}</p>
                <FindingList titleKey="convert.summary.blocking" findings={blocking} kind="error" />
                <FindingList titleKey="convert.summary.warnings" findings={warnings} kind="warning" />
                <FindingList titleKey="convert.summary.info" findings={infos} kind="info" />
                <p role="status" className={view.ok ? 'notice' : 'notice notice-blocked'}>
                  {view.ok ? t('convert.summary.none') : t('convert.summary.blocked')}
                </p>
              </>
            )}
            <p className="muted">{t('convert.summary.noExport')}</p>
            <div className="confirm-actions">
              <button type="button" className="link-button" onClick={reset}>
                {t('convert.restart')}
              </button>
            </div>
          </section>
        </>
      )}
    </Layout>
  );
}

function FindingList({ titleKey, findings, kind }: { titleKey: 'convert.summary.blocking' | 'convert.summary.warnings' | 'convert.summary.info'; findings: Finding[]; kind: Finding['severity'] }): React.ReactElement | null {
  const { lang } = useLang();
  if (findings.length === 0) return null;
  return (
    <div className="convert-findings" data-kind={kind}>
      <h3>{t(titleKey, { n: findings.length })}</h3>
      <ul>
        {findings.map((f, i) => (
          <li key={`${f.ruleId}:${i}`} data-rule={f.ruleId}>
            {f.file !== undefined && f.sheet !== undefined && f.file !== '' && <span className="muted">{f.sheet === f.file ? f.file : t('convert.finding.where', { file: f.file, sheet: f.sheet })}: </span>}
            {plainOf(f, lang)}
          </li>
        ))}
      </ul>
    </div>
  );
}
