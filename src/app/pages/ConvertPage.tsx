// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { EventRec, TaxonSplit } from '../../core/convert';
import { bulkApprovable, judge, licenceDiffersFindings, licenceSourceOf, lookupOf, metadataFindings, writeConvertSidecar } from '../../core/convert';
import type { WormsChoice, WormsRecord } from '../../core/convert';
import { EMPTY_METADATA, refreshPrefill } from '../../core/convert/metadata';
import type { DatasetMetadata } from '../../core/convert/metadata';
import type { UiKey } from '../../core/i18n/ui';
import type { Finding, SheetMapping } from '../../core/types';
import { track } from '../analytics';
import { getConvertEngine } from '../../worker/convert.client';
import type { ConvertEngine, ConvertFileSummary, ConvertParseResult, ConvertView, ExportResult } from '../../worker/convert.protocol';
import { ConvertMetadataForm } from '../components/ConvertMetadataForm';
import { ConvertSheetForm } from '../components/ConvertSheetForm';
import { ConvertNerc, effectivePick, searchId, suggestionOf } from '../components/ConvertNerc';
import type { NercKind, NvsSearchView } from '../components/ConvertNerc';
import { ConvertWorms } from '../components/ConvertWorms';
import type { WormsStatus } from '../components/ConvertWorms';
import { FileReview } from '../components/FileReview';
import { HeadingTip, InfoTip } from '../components/InfoTip';
import { InputPanel } from '../components/InputPanel';
import { Layout } from '../components/Layout';
import { candidatesOf, candidateKey, initialChoices, nercColumnsOf, plainOf, profileSettingsOf, requestOf, sheetKey, codesFileName, tableMetadataOf, typeContext, unitContext, type NercColumn, type NercPicks, type SheetChoice, type StoredPick } from '../convertModel';
import { downloadBlob, downloadText } from '../download';
import { t, useLang } from '../i18n';
import { useLeaveWarning } from '../leaveWarning';
import { CONVERT_ROLE_CHOICES } from '../mappingModel';
import { searchNvs } from '../optins/nvs';
import { searchWords } from '../../core/convert/nvs';
import { lookupWormsNames } from '../optins/worms';
import type { InputFile } from '../../worker/protocol';
import type { CheckInput } from '../types';

export interface ConvertPageProps {
  /** The worker client. Default: the page's module worker, created on first use. Tests pass a direct engine. */
  engine?: ConvertEngine;
  download?: typeof downloadText;
  /** Offers the archive (a Blob) as a download. Tests pass a spy. */
  downloadFile?: typeof downloadBlob;
}

type Phase = 'input' | 'reading' | 'work';

const messageOf = (e: unknown): string => (e instanceof Error && e.message ? e.message : String(e));

async function toInputFiles(files: File[]): Promise<InputFile[]> {
  return Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), source: 'dropped' as const })));
}

const splitText = (s: TaxonSplit): string => s.scientificName;
/** A list of names without a doubt this short is shown open; a longer one is folded behind "show all N names". */
const SPLITS_OPEN_MAX = 15;

/**
 * What a tick of "I accept" holds for: the findings of one rule as they are now. A tick is kept per rule id together with this fingerprint, so a rule whose
 * findings change after the tick (a new mapping, another sheet) is no longer accepted and has to be ticked again.
 */
const fingerprint = (findings: readonly Finding[]): string => JSON.stringify(findings.map((f) => [f.file, f.sheet, f.field, f.value, f.lines, f.params]));

/** The shape a GA4 event reports: wide, long or mixed. Never a name. */
const shapeOf = (shapes: readonly ('wide' | 'long')[]): 'wide' | 'long' | 'mixed' => (shapes.every((x) => x === 'wide') ? 'wide' : shapes.every((x) => x === 'long') ? 'long' : 'mixed');

/** The key of the "unconfirmed taxon columns" acceptance, which is the page's own (it is no rule). */
const UNCONFIRMED_KEY = 'unconfirmed-taxon-columns';
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
 * /convert: drop files, check the columns, decide the shape and what the numbers mean, approve taxon splits, see the event tree, describe the dataset,
 * read the summary, accept the warnings and export the Darwin Core Archive (stage 2). The page is hidden (in no menu, index card or sitemap). Files are
 * read and the archive is built in the browser by the convert worker; nothing is stored, and nothing is sent anywhere unless the user ticks the WoRMS opt-in AND presses its lookup button (stage 4: only the taxon names, src/app/optins/worms.ts). All state lives here and starts
 * empty for each upload; only a companion file dropped with the data can pre-tick the full-species-list and the station-prefix choices, and (stage 3)
 * dropped metadata files fill empty fields of the description. The export button works only when nothing blocks, the description is complete and every
 * warning rule is accepted; the worker checks all of that again before it writes anything.
 */
export function ConvertPage({ engine: engineProp, download = downloadText, downloadFile = downloadBlob }: ConvertPageProps): React.ReactElement {
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
  // what the user typed into a split before approving it; confirmed taxon candidates by candidateKey
  const [drafts, setDrafts] = useState<Record<string, TaxonSplit>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [convertError, setConvertError] = useState<string | null>(null);
  const [view, setView] = useState<ConvertView | null>(null);
  const [working, setWorking] = useState(false);
  const [codesDone, setCodesDone] = useState<Record<string, string | null>>({});
  const [filesChosen, setFilesChosen] = useState(0);
  const [meta, setMeta] = useState<DatasetMetadata>(EMPTY_METADATA);
  // rule id -> the fingerprint of its findings when the user ticked it (nothing is stored beyond this page state)
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<(Pick<ExportResult, 'fileName' | 'counts' | 'deflated'>) | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const token = useRef(0);
  // The WoRMS opt-in (stage 4). Everything about it starts empty and OFF for each upload; a companion file of the drop can only tick the box. Nothing is sent
  // until the user presses the lookup button (runWorms): no effect, no timer and no render path calls the network. Page state only: no storage of any kind.
  const [wormsOn, setWormsOn] = useState(false);
  const [wormsRecords, setWormsRecords] = useState<Record<string, WormsRecord[]>>({});
  const [wormsChoices, setWormsChoices] = useState<Record<string, WormsChoice>>({});
  const [wormsStatus, setWormsStatus] = useState<WormsStatus>({ state: 'idle' });
  const wormsAbort = useRef<AbortController | null>(null);
  const wormsRun = useRef(0);
  // The NERC identifiers (stage 5): what the user confirmed per measured-variable column, and the NVS opt-in. The box starts OFF for each upload (a companion file of the drop
  // may tick it); nothing is sent until the user types a word for a column and presses "Search NVS" (runNvs): no effect, no timer and no render path calls the network.
  const [nercPicks, setNercPicks] = useState<NercPicks>({});
  const [nvsOn, setNvsOn] = useState(false);
  const [nvsWords, setNvsWords] = useState<Record<string, string>>({});
  const [nvsSearches, setNvsSearches] = useState<Record<string, NvsSearchView>>({});
  const [nvsBusy, setNvsBusy] = useState<string | null>(null);
  const nvsAbort = useRef<AbortController | null>(null);
  const nvsRun = useRef(0);
  // the description fields the user typed in, cleared or chose a value for: a new drop never overwrites them (core/convert/metadata.ts refreshPrefill)
  const touched = useRef(new Set<keyof DatasetMetadata>());
  const files = parsed?.files ?? [];
  const changeMeta = (next: DatasetMetadata): void => {
    for (const k of Object.keys(next) as (keyof DatasetMetadata)[]) if (next[k] !== meta[k]) touched.current.add(k);
    setMeta(next);
  };

  /** Drops the WoRMS lookup: an unfinished call is aborted, its late answer is ignored, and the results and choices are forgotten. */
  const clearWorms = (): void => {
    wormsRun.current += 1;
    wormsAbort.current?.abort();
    wormsAbort.current = null;
    setWormsRecords({});
    setWormsChoices({});
    setWormsStatus({ state: 'idle' });
  };
  /**
   * Drops the NVS search: a running one is aborted and its late answer ignored, the typed words and the results are forgotten, and so is every identifier that came from a
   * search (the user's choice from the converter's own verified list stays: it never needed the service).
   */
  const clearNvs = (): void => {
    nvsRun.current += 1;
    nvsAbort.current?.abort();
    nvsAbort.current = null;
    setNvsBusy(null);
    setNvsWords({});
    setNvsSearches({});
    setNercPicks((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([k, v]) => [k, { ...(v.type && v.type.source !== 'nvs' ? { type: v.type } : {}), ...(v.unit && v.unit.source !== 'nvs' ? { unit: v.unit } : {}) }] as const),
      ),
    );
  };
  // leaving the page ends a running lookup
  useEffect(
    () => () => {
      wormsAbort.current?.abort();
      nvsAbort.current?.abort();
    },
    [],
  );

  // Work that leaving would lose: files chosen, or a conversion in view. Never an empty page.
  useLeaveWarning(filesChosen > 0 || phase !== 'input');

  // the part of the description that shows in the tables: a change of these three reruns the conversion, typing anywhere else does not
  const tableMeta = useMemo(() => tableMetadataOf(meta), [meta.title, meta.datasetName, meta.institutionCode, meta.basisOfRecord]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (input: CheckInput): Promise<void> => {
    setProblem(null);
    setParsed(null);
    setView(null);
    setCodesDone({});
    setApproved({});
    setDrafts({});
    setConfirmed({});
    setConvertError(null);
    setFlattenStation(false);
    setFlattenCruise(false);
    setAccepted({});
    setExported(null);
    setExportError(null);
    // a new upload starts with the WoRMS box OFF and nothing looked up (a companion file of THIS drop may tick it below)
    setWormsOn(false);
    clearWorms();
    // the NERC choices and the NVS box start empty and OFF as well
    setNercPicks({});
    setNvsOn(false);
    clearNvs();
    track('convert_started', { input_type: 'file', mode: 'browser' });
    setPhase('reading');
    try {
      const p = await engine.parse(await toInputFiles(input.files));
      setParsed(p);
      // the description holds what the user typed, plus what the dropped metadata files said for every other field (the user edits everything)
      setMeta((m) => refreshPrefill(m, touched.current, p.prefill));
      setMappings(Object.fromEntries(p.files.map((f) => [f.fileId, f.mappings])));
      setChoices(initialChoices(p));
      // the ticks start from a companion file of THIS drop, and from nothing else
      setFullList(p.settings.fullList);
      setPrefixStation(p.settings.prefixStation);
      setWormsOn(p.settings.worms); // a pre-tick only: nothing is sent until the user presses the lookup button
      setNvsOn(p.settings.nvs); // a pre-tick only: nothing is sent until the user types a word for a column and presses "Search NVS"
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
    setAccepted({});
    setExported(null);
    setExportError(null);
    touched.current.clear();
    setMeta(EMPTY_METADATA);
    setWormsOn(false);
    clearWorms();
    setNercPicks({});
    setNvsOn(false);
    clearNvs();
    setPhase('input');
  };

  // What the lookup found, as the entries the conversion takes (none while the box is off or nothing was looked up)
  const wormsLookup = useMemo(() => (wormsOn && Object.keys(wormsRecords).length > 0 ? lookupOf(wormsRecords, wormsChoices) : undefined), [wormsOn, wormsRecords, wormsChoices]);

  // the conversion follows every decision; a late answer to an earlier request is dropped
  useEffect(() => {
    if (phase !== 'work' || !parsed) return undefined;
    const mine = ++token.current;
    setWorking(true);
    const timer = setTimeout(() => {
      engine
        .convert(requestOf({ parsed, mappings, choices, options: { fullList, prefixStation, flatten: { station: flattenStation, cruise: flattenCruise } }, approved, confirmed, metadata: tableMeta, ...(wormsLookup ? { worms: wormsLookup } : {}), nerc: nercPicks }))
        .then(
          (v) => {
            if (token.current !== mine) return;
            setView(v);
            setConvertError(null); // a later conversion that succeeds clears an earlier error
          },
          (e: unknown) => {
            if (token.current === mine) setConvertError(messageOf(e));
          },
        )
        .finally(() => {
          if (token.current === mine) setWorking(false);
        });
    }, 120);
    return () => clearTimeout(timer);
  }, [engine, phase, parsed, mappings, choices, fullList, prefixStation, flattenStation, flattenCruise, approved, confirmed, tableMeta, wormsLookup, nercPicks]);

  const isTaxonHeader = (r: { kind: string; header?: boolean } | undefined): boolean => r?.kind === 'taxon' && r.header === true;
  const changeMapping = (fileId: string, mapping: SheetMapping): void => {
    // a column the user turns into a taxon by hand is their own decision: no confirmation is asked for it
    const before = (mappings[fileId] ?? []).find((m) => m.sheet === mapping.sheet);
    const nowTaxa = mapping.columns.filter((c) => isTaxonHeader(c.role) && !isTaxonHeader(before?.columns.find((b) => b.index === c.index)?.role));
    if (nowTaxa.length > 0) setConfirmed((prev) => ({ ...prev, ...Object.fromEntries(nowTaxa.map((c) => [candidateKey(fileId, mapping.sheet, c.index), true])) }));
    setMappings((prev) => ({ ...prev, [fileId]: (prev[fileId] ?? []).map((m) => (m.sheet === mapping.sheet ? mapping : m)) }));
  };

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

  const candidates = useMemo(() => (parsed ? candidatesOf(parsed, mappings, choices) : []), [parsed, mappings, choices]);
  const unconfirmed = candidates.filter((c) => confirmed[c.key] !== true);
  const allSplits = view?.splits ?? [];
  const toApprove = allSplits.filter((s) => s.needsDecision);
  // every name that needs a decision (a split that took a stage, a qualifier or a sex out, or a leftover with a doubt) is in the table, with the button for all of them; only the
  // plain names, which need none, are in the list under it, open for a short list and folded for a long one (a sheet of three hundred taxon columns); every name can be edited
  const doubted = toApprove;
  const rest = allSplits.filter((s) => !s.needsDecision);
  // "approve all shown" takes only the names without a doubt; a doubted one needs its own action on its row
  const bulk = bulkApprovable(toApprove);
  const draftOf = (s: (typeof toApprove)[number]): TaxonSplit => drafts[s.verbatim] ?? s.split;
  const finalSplit = (s: (typeof toApprove)[number]): TaxonSplit | null => {
    const d = draftOf(s);
    const name = d.scientificName.trim();
    if (name === '') return null;
    const q = d.identificationQualifier?.trim();
    const st = d.lifeStage?.trim();
    return { verbatimIdentification: s.verbatim, scientificName: name, ...(q ? { identificationQualifier: q } : {}), ...(st ? { lifeStage: st } : {}), ...(d.sex ? { sex: d.sex } : {}) };
  };
  // a doubted split taken exactly as proposed is approved "as it is"; once the user has edited it, it is simply approved
  const asIs = (s: (typeof toApprove)[number]): boolean => s.doubt !== undefined && drafts[s.verbatim] === undefined;
  const setDraft = (s: (typeof toApprove)[number], patch: Partial<TaxonSplit>): void => setDrafts((prev) => ({ ...prev, [s.verbatim]: { ...draftOf(s), ...patch } }));
  // one row of the table of names: every name can be edited and approved; a name that needs no decision (a plain name) is approved only if the user changes it
  const splitRow = (s: (typeof toApprove)[number]): React.ReactElement => {
    const d = draftOf(s);
    const locked = s.approved;
    return (
      <tr key={s.verbatim} data-approved={s.approved ? 'true' : 'false'}>
        <th scope="row">
          <code>{s.verbatim}</code>
          <span className="muted"> {t('convert.splits.uses', { n: s.uses })}</span>
          {s.doubt && !locked && <span className="convert-doubt">{t('convert.splits.doubt', { reason: t(`convert.doubt.${s.doubt}` as UiKey) })}</span>}
        </th>
        <td>
          <input type="text" className="convert-input" aria-label={`${t('convert.splits.name')}: ${s.verbatim}`} value={d.scientificName} disabled={locked} autoComplete="off" spellCheck={false} onChange={(e) => setDraft(s, { scientificName: e.target.value })} />
        </td>
        <td>
          <input type="text" className="convert-input" aria-label={`${t('convert.splits.qualifier')}: ${s.verbatim}`} value={d.identificationQualifier ?? ''} disabled={locked} autoComplete="off" spellCheck={false} onChange={(e) => setDraft(s, { identificationQualifier: e.target.value })} />
        </td>
        <td>
          <input type="text" className="convert-input" aria-label={`${t('convert.splits.stage')}: ${s.verbatim}`} value={d.lifeStage ?? ''} disabled={locked} autoComplete="off" spellCheck={false} onChange={(e) => setDraft(s, { lifeStage: e.target.value })} />
        </td>
        <td>
          <select
            className="convert-input"
            aria-label={`${t('convert.splits.sex')}: ${s.verbatim}`}
            value={d.sex ?? ''}
            disabled={locked}
            onChange={(e) => {
              const v = e.target.value;
              const { sex: _drop, ...rest } = draftOf(s);
              setDrafts((prev) => ({ ...prev, [s.verbatim]: v === 'female' || v === 'male' ? { ...rest, sex: v } : rest }));
            }}
          >
            <option value="">{t('convert.sex.none')}</option>
            <option value="female">{t('convert.sex.female')}</option>
            <option value="male">{t('convert.sex.male')}</option>
          </select>
        </td>
        <td>
          {s.approved ? (
            <button type="button" className="link-button" aria-label={`${t('convert.splits.withdraw')}: ${s.verbatim}`} onClick={() => setApproved((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== s.verbatim)))}>
              {t('convert.splits.withdraw')}
            </button>
          ) : (
            <button
              type="button"
              className="button"
              aria-label={`${t(asIs(s) ? 'convert.splits.approveAsIs' : 'convert.splits.approve')}: ${s.verbatim}`}
              disabled={finalSplit(s) === null || (!s.needsDecision && drafts[s.verbatim] === undefined)}
              onClick={() => {
                const f = finalSplit(s);
                if (f) setApproved((prev) => ({ ...prev, [s.verbatim]: f }));
              }}
            >
              {t(asIs(s) ? 'convert.splits.approveAsIs' : 'convert.splits.approve')}
            </button>
          )}
          <span className="visually-hidden"> {s.approved ? t('convert.splits.approved') : s.needsDecision ? t('convert.splits.undecided') : t('convert.splits.noDecision')}</span>
        </td>
      </tr>
    );
  };
  // what each finding does to the export (core/convert/policy.ts): blocks, needs an acceptance, or is only shown
  // CONV-LICENCE-DIFFERS: the licence chosen is not the one the dropped metadata state; raised here (the worker raises it again from the same two values at export)
  const licenceSource = useMemo(() => licenceSourceOf(parsed?.prefillInfo), [parsed]);
  const licenceDiffers = useMemo(() => licenceDiffersFindings(meta.licence, licenceSource), [meta.licence, licenceSource]);
  const judged = useMemo(() => judge([...(view?.findings ?? []), ...licenceDiffers]), [view, licenceDiffers]);
  const metaFindings = useMemo(() => metadataFindings(meta), [meta]);
  const blocking = judged.blocking;
  const infos = judged.showOnly;
  const showPrefix = prefixStation || view?.codeCollision === true;

  // warning rules to accept: one tick per rule, valid only for the findings it was given for; plus the page's own "unconfirmed taxon columns"
  const prints = useMemo(() => Object.fromEntries(judged.acceptRules.map((r) => [r, fingerprint(judged.toAccept.filter((f) => f.ruleId === r))])), [judged]);
  const isAccepted = (rule: string): boolean => accepted[rule] !== undefined && accepted[rule] === prints[rule];
  // the identity of the columns left out (not their number): another set of columns is another acceptance
  const unconfirmedPrint = unconfirmed.map((c) => c.key).sort().join('|');
  const unconfirmedAccepted = unconfirmed.length === 0 || accepted[UNCONFIRMED_KEY] === unconfirmedPrint;
  const allAccepted = judged.acceptRules.every(isAccepted) && unconfirmedAccepted;
  const nothingToWrite = view !== null && (view.tree.events === 0 || view.stats.occurrences === 0);
  const canExport = view !== null && !working && !exporting && judged.blocking.length === 0 && metaFindings.length === 0 && allAccepted && !nothingToWrite;
  // the shape of the sheets that have one: a profile sheet has none (it is not wide or long)
  const shapes = useMemo(() => Object.entries(choices).filter(([, c]) => c.use && !c.profile).map(([, c]) => c.shape), [choices]);

  // GA4, after consent only (analytics.ts drops everything else): when the user presses Export while something blocks it. Never on a first view. A count only (what blocks plus the kinds of warning not yet accepted).
  const pressExport = (): void => {
    if (exporting || working || !parsed) return;
    if (!canExport) {
      track('convert_blocked', { input_type: 'file', mode: 'browser', n_errors: judged.blocking.length + metaFindings.length + judged.acceptRules.filter((r) => !isAccepted(r)).length + (unconfirmedAccepted ? 0 : 1) });
      return;
    }
    void doExport();
  };

  const doExport = async (): Promise<void> => {
    if (!parsed || !canExport) return;
    setExporting(true);
    setExportError(null);
    setExported(null);
    try {
      const body = requestOf({ parsed, mappings, choices, options: { fullList, prefixStation, flatten: { station: flattenStation, cruise: flattenCruise } }, approved, confirmed, ...(wormsLookup ? { worms: wormsLookup } : {}), nerc: nercPicks });
      const acceptedRules = judged.acceptRules.filter(isAccepted);
      const res = await engine.export({ body, metadata: meta, accepted: acceptedRules, generated: new Date().toISOString().replace(/\.\d+Z$/, 'Z') });
      downloadFile(new Blob([res.bytes as unknown as BlobPart], { type: 'application/zip' }), res.fileName);
      setExported({ fileName: res.fileName, counts: res.counts, deflated: res.deflated });
      track('convert_exported', {
        input_type: 'file',
        mode: 'browser',
        shape: shapeOf(shapes),
        // whether at least one profile level went into the archive (the count of the conversion that was exported); never a name
        profile: (view?.tree.levels ?? 0) > 0 ? 'used' : 'none',
        meta_source: parsed.metadataFiles.length > 0 ? 'file' : 'none',
        // whether at least one WoRMS ID was actually written to the archive (the count of the conversion that was exported); never a name or an ID
        worms: (view?.worms.applied ?? 0) > 0 ? 'used' : 'none',
        // whether at least one identifier that came from an NVS search was actually written (the count of the conversion that was exported); never a word, a code or a label
        nvs: (view?.stats.nerc.nvsIds ?? 0) > 0 ? 'used' : 'none',
        n_events: res.counts.events,
        n_occurrences: res.counts.occurrences,
        n_measurements: res.counts.measurements,
      });
    } catch (e) {
      setExportError(messageOf(e));
    } finally {
      setExporting(false);
    }
  };

  /** Unticking the box is withdrawing: a running call is aborted and what was found is forgotten. */
  const toggleWorms = (on: boolean): void => {
    setWormsOn(on);
    if (!on) clearWorms();
  };
  const wormsNames = view?.worms.names ?? [];
  const wormsPending = wormsNames.filter((n) => !Object.prototype.hasOwnProperty.call(wormsRecords, n));
  /** The ONE place the lookup starts: the button. Sends the names that have no result yet, in order, in calls of at most 50; completed calls are kept. */
  const runWorms = async (): Promise<void> => {
    if (!wormsOn || wormsStatus.state === 'running' || wormsPending.length === 0) return;
    const names = wormsPending;
    const mine = ++wormsRun.current;
    const ac = new AbortController();
    wormsAbort.current = ac;
    setWormsStatus({ state: 'running', done: 0, total: names.length });
    const run = await lookupWormsNames(names, {
      signal: ac.signal,
      onProgress: (done, total) => {
        if (wormsRun.current === mine) setWormsStatus({ state: 'running', done, total });
      },
    });
    if (wormsRun.current !== mine) return; // unticked, a new upload or the page left meanwhile: the late answer is ignored
    wormsAbort.current = null;
    const answered = Object.keys(run.results).length;
    setWormsRecords((prev) => ({ ...prev, ...run.results }));
    setWormsStatus(run.aborted || run.failure ? { state: 'stopped', done: answered, total: names.length, ...(run.failure ? { failure: run.failure } : {}) } : { state: 'finished', answered });
  };
  const abortWorms = (): void => wormsAbort.current?.abort();
  const chooseWorms = (name: string, choice: WormsChoice | undefined): void =>
    setWormsChoices((prev) => (choice === undefined ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== name)) : { ...prev, [name]: choice }));

  /* ---- the measured variables (stage 5) ---- */
  const nercColumns = useMemo(() => (parsed ? nercColumnsOf(parsed, mappings, choices) : []), [parsed, mappings, choices]);
  const setPick = (col: NercColumn, kind: NercKind, pick: StoredPick | undefined): void =>
    setNercPicks((prev) => {
      const here = Object.prototype.hasOwnProperty.call(prev, col.key) ? prev[col.key] : {};
      const next = { ...here };
      if (pick) next[kind] = pick;
      else delete next[kind];
      return { ...prev, [col.key]: next };
    });
  // the columns that have a suggestion and no choice yet (a suggestion is a verified generic concept, or a unit that has a verified concept)
  const suggestedCount = nercColumns.filter((c) => {
    const s = suggestionOf(c, effectivePick(c, nercPicks, 'type')?.id);
    return (s.type.proposed !== undefined && effectivePick(c, nercPicks, 'type') === undefined) || (s.unit !== undefined && effectivePick(c, nercPicks, 'unit') === undefined);
  }).length;
  /** The button of the suggestions: for each column without a choice, the proposed concept and unit are CONFIRMED (the user's act); anything already chosen stays. */
  const useSuggested = (): void =>
    setNercPicks((prev) => {
      const out: NercPicks = { ...prev };
      for (const c of nercColumns) {
        const s = suggestionOf(c, effectivePick(c, prev, 'type')?.id);
        const here = Object.prototype.hasOwnProperty.call(prev, c.key) ? prev[c.key] : {};
        const next = { ...here };
        if (s.type.proposed && effectivePick(c, prev, 'type') === undefined) next.type = { id: s.type.proposed.uri, source: 'suggested', deprecated: false, label: `${s.type.proposed.code}: ${s.type.proposed.label}`, ctx: typeContext(c) };
        if (s.unit && effectivePick(c, prev, 'unit') === undefined) next.unit = { id: s.unit.uri, source: 'suggested', deprecated: false, label: `${s.unit.code}: ${s.unit.label}`, ctx: unitContext(c) };
        out[c.key] = next;
      }
      return out;
    });
  /** Unticking the box is withdrawing: a running search is aborted, and the results and the choices made from them are forgotten. */
  const toggleNvs = (on: boolean): void => {
    setNvsOn(on);
    if (!on) clearNvs();
  };
  /** The ONE place an NVS search starts: the button of a column. Sends the typed word of that column (and nothing else), one search at a time. */
  const runNvs = async (col: NercColumn, kind: NercKind): Promise<void> => {
    const sid = searchId(col, kind);
    const typed = Object.prototype.hasOwnProperty.call(nvsWords, sid) ? nvsWords[sid] : '';
    if (!nvsOn || nvsBusy !== null || searchWords(typed).length === 0) return;
    const mine = ++nvsRun.current;
    const ac = new AbortController();
    nvsAbort.current = ac;
    setNvsBusy(sid);
    setNvsSearches((prev) => ({ ...prev, [sid]: { status: 'running', word: typed } }));
    let run: Awaited<ReturnType<typeof searchNvs>> | undefined;
    try {
      run = await searchNvs(typed, kind === 'type' ? 'P01' : 'P06', { signal: ac.signal });
    } catch {
      run = undefined; // searchNvs resolves by contract; if it ever did not, the lock is still released below
    } finally {
      // the busy flag is ALWAYS cleared (a stale run was cleared by clearNvs already): one failed search can never leave every search button off
      if (nvsRun.current === mine) {
        nvsAbort.current = null;
        setNvsBusy(null);
      }
    }
    if (nvsRun.current !== mine) return; // unticked, a new upload or the page left meanwhile: the late answer is ignored
    const result = run;
    setNvsSearches((prev) => ({
      ...prev,
      [sid]: !result ? { status: 'failed', word: typed, failure: { kind: 'format' } } : result.aborted ? { status: 'stopped', word: typed } : result.failure ? { status: 'failed', word: typed, failure: result.failure } : { status: 'done', word: typed, concepts: result.concepts, via: result.via },
    }));
  };
  const abortNvs = (): void => nvsAbort.current?.abort();

  const downloadCompanion = (): void => {
    // the profile mark and the approval of depth-based level IDs are kept by sheet name (a pre-tick when the file is dropped again, nothing more)
    const profile = parsed ? profileSettingsOf(parsed, choices) : { profileSheets: [], profileDepthIds: [], profileIgnoreCast: [] };
    download(writeConvertSidecar({ fullList, prefixStation, worms: wormsOn, nvs: nvsOn, ...(profile.profileSheets.length > 0 ? { profileSheets: profile.profileSheets, ...(profile.profileDepthIds.length > 0 ? { profileDepthIds: profile.profileDepthIds } : {}), ...(profile.profileIgnoreCast.length > 0 ? { profileIgnoreCast: profile.profileIgnoreCast } : {}) } : {}) }), 'convert-companion.csv', 'text/csv');
  };

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

      {(problem ?? convertError) !== null && (
        <p className="error-text" role="alert">
          {t('convert.error', { message: (problem ?? convertError) as string })}
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
      {parsed && parsed.prefillInfo && (
        <section className="convert-metafiles" aria-labelledby="convert-metafiles-title">
          <HeadingTip tip="convertMetaFiles">
            <h2 id="convert-metafiles-title">{t('convert.metafiles.title')}</h2>
          </HeadingTip>
          <p className="muted">{t('convert.metafiles.intro')}</p>
          <ul className="convert-metafile-list">
            {parsed.prefillInfo.files.map((f) => (
              <li key={f.fileName}>{t('convert.metafiles.item', { name: f.fileName, kind: f.kind })}</li>
            ))}
          </ul>
        </section>
      )}
      {parsed && parsed.archiveFiles.length > 0 && (
        <section className="convert-archdesc" aria-labelledby="convert-archdesc-title">
          <HeadingTip tip="convertArchiveDesc">
            <h2 id="convert-archdesc-title">{t('convert.archdesc.title')}</h2>
          </HeadingTip>
          <ul className="convert-metafile-list">
            {parsed.archiveFiles.map((f) => (
              <li key={f.fileName}>{t('convert.archdesc.item', { name: f.fileName, kind: f.kind === 'eml' ? 'EML' : 'meta.xml' })}</li>
            ))}
          </ul>
        </section>
      )}
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

          {candidates.length > 0 && (
            <section className="convert-taxa" aria-labelledby="convert-taxa-title">
              <HeadingTip tip="convertTaxa">
                <h2 id="convert-taxa-title">{t('convert.taxa.title', { n: candidates.length })}</h2>
              </HeadingTip>
              <p>{t('convert.taxa.intro')}</p>
              {unconfirmed.length > 0 && (
                <button type="button" className="button" onClick={() => setConfirmed((prev) => ({ ...prev, ...Object.fromEntries(candidates.map((c) => [c.key, true])) }))}>
                  {t('convert.taxa.confirmAll', { n: unconfirmed.length })}
                </button>
              )}
              <ul className="convert-candidates">
                {candidates.map((c) => (
                  <li key={c.key}>
                    <label className="inline-choice">
                      <input type="checkbox" checked={confirmed[c.key] === true} aria-label={t('convert.taxa.confirm', { header: c.header })} onChange={(e) => setConfirmed((prev) => ({ ...prev, [c.key]: e.target.checked }))} />
                      <span>
                        <code>{c.header}</code>
                        {candidates.some((o) => o.sheet !== c.sheet || o.fileId !== c.fileId) && <span className="muted"> ({c.sheet})</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

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
                    suggestedProfile={f.suggestedProfiles[m.sheet] === true}
                    hasCodeColumn={m.columns.some((c) => c.role.kind === 'sampleId')}
                    hasPressureColumn={m.columns.some((c) => c.role.kind === 'pressure')}
                    hasStationColumn={m.columns.some((c) => c.role.kind === 'station')}
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

          {allSplits.length > 0 && (
            <section className="convert-splits" aria-labelledby="convert-splits-title">
              <HeadingTip tip="convertSplits">
                <h2 id="convert-splits-title">{t('convert.splits.title')}</h2>
              </HeadingTip>
              {toApprove.length > 0 && <p>{t('convert.splits.intro')}</p>}
              {bulk.approve.length > 0 && (
                <button type="button" className="button" onClick={() =>
                    setApproved((prev) => ({
                      ...prev,
                      ...Object.fromEntries(
                        bulk.approve.flatMap((s) => {
                          const f = finalSplit(s);
                          return f ? [[s.verbatim, f] as const] : [];
                        }),
                      ),
                    }))
                  }>
                  {bulk.skipped.length > 0 ? t('convert.splits.approveAllSkip', { n: bulk.approve.length, skipped: bulk.skipped.length }) : t('convert.splits.approveAll', { n: bulk.approve.length })}
                </button>
              )}
              {bulk.approve.length === 0 && bulk.skipped.length > 0 && <p className="muted">{t('convert.splits.allDoubted')}</p>}
              {toApprove.length > 0 && (
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
                    <tbody>{doubted.map(splitRow)}</tbody>
                  </table>
                </div>
              )}
              {rest.length > 0 && (
                <details className="convert-splits-rest" open={rest.length <= SPLITS_OPEN_MAX}>
                  <summary>{t('convert.splits.showAll', { n: rest.length })}</summary>
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
                      <tbody>{rest.map(splitRow)}</tbody>
                    </table>
                  </div>
                </details>
              )}
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

          <ConvertWorms
            on={wormsOn}
            onToggle={toggleWorms}
            names={wormsNames}
            withSheetId={view?.worms.withSheetId ?? 0}
            pending={wormsPending.length}
            records={wormsRecords}
            choices={wormsChoices}
            onChoice={chooseWorms}
            status={wormsStatus}
            onLookup={() => void runWorms()}
            onAbort={abortWorms}
          />

          <ConvertNerc
            columns={nercColumns}
            picks={nercPicks}
            onPick={setPick}
            suggestedCount={suggestedCount}
            onUseSuggested={useSuggested}
            nvsOn={nvsOn}
            onToggleNvs={toggleNvs}
            words={nvsWords}
            onWord={(id, text) => setNvsWords((prev) => ({ ...prev, [id]: text }))}
            searches={nvsSearches}
            busy={nvsBusy}
            onSearch={(c, k) => void runNvs(c, k)}
            onAbort={abortNvs}
          />

          <section className="convert-tree" aria-labelledby="convert-tree-title">
            <HeadingTip tip="convertTree">
              <h2 id="convert-tree-title">{t('convert.tree.title')}</h2>
            </HeadingTip>
            {view && view.tree.events > 0 ? (
              <>
                <p>{t('convert.tree.counts', { cruises: view.tree.cruises, stations: view.tree.stations, samples: view.tree.samples })}</p>
                {view.tree.levels > 0 && <p>{t('convert.tree.levels', { levels: view.tree.levels })}</p>}
                {view.profile.sheets > 0 && (
                  <>
                    <p className="muted">{t('convert.tree.profile', { matched: view.profile.stationsMatched, unmatched: view.profile.stationsUnmatched })}</p>
                    {view.profile.stationsUnmatched > 0 && (
                      <p className="muted">{t('convert.tree.profileNames', { names: `${view.profile.unmatched.join(', ')}${view.profile.stationsUnmatched > view.profile.unmatched.length ? `, … (+${view.profile.stationsUnmatched - view.profile.unmatched.length})` : ''}` })}</p>
                    )}
                  </>
                )}
                {(view.tree.derivedDates > 0 || view.tree.derivedPositions > 0 || view.tree.derivedDepths > 0) && (
                  <p className="muted">{t('convert.tree.derived', { dates: view.tree.derivedDates, positions: view.tree.derivedPositions, depths: view.tree.derivedDepths })}</p>
                )}
                {view.tree.maxUncertaintyM !== undefined && <p className="muted">{t('convert.tree.uncertainty', { m: view.tree.maxUncertaintyM })}</p>}
                {view.tree.samplesWithoutPosition > 0 && <p className="muted">{t('convert.tree.noPosition', { n: view.tree.samplesWithoutPosition })}</p>}
                {view.cruiseText.length > 0 && <p>{t('convert.tree.cruiseText', { codes: view.cruiseText.join(', ') })}</p>}
                <h3>{t('convert.tree.examples')}</h3>
                <ul className="convert-nodes">
                  {(['cruise', 'station', 'sample', 'level'] as const).flatMap((level) =>
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

          <section className="convert-meta" aria-labelledby="convert-meta-title">
            <h2 id="convert-meta-title">{t('convert.meta.title')}</h2>
            <p>{t('convert.meta.intro')}</p>
            <ConvertMetadataForm value={meta} onChange={changeMeta} prefill={parsed.prefillInfo} />
            <FindingList titleKey="convert.summary.blocking" findings={metaFindings} kind="error" />
          </section>

          <section className="convert-summary" aria-labelledby="convert-summary-title" aria-busy={working}>
            <h2 id="convert-summary-title">{t('convert.summary.title')}</h2>
            {working && !view && <p className="muted">{t('convert.working')}</p>}
            {view && (
              <>
                <p>{t('convert.summary.counts', { events: view.tree.events, occurrences: view.stats.occurrences, present: view.stats.present, absent: view.stats.absent, measurements: view.stats.measurements })}</p>
                <p className="muted">{t('convert.summary.noLand')}</p>
                {unconfirmed.length > 0 && (
                  <p className="notice" role="note">
                    {t('convert.taxa.unconfirmed', { n: unconfirmed.length })}
                  </p>
                )}
                <FindingList titleKey="convert.summary.blocking" findings={blocking} kind="error" />
                {(judged.acceptRules.length > 0 || unconfirmed.length > 0) && (
                  <div className="convert-accept">
                    <HeadingTip tip="convertAccept">
                      <h3>{t('convert.accept.title')}</h3>
                    </HeadingTip>
                    <p>{t('convert.accept.intro')}</p>
                    {judged.acceptRules.map((rule) => {
                      const group = judged.toAccept.filter((f) => f.ruleId === rule);
                      return (
                        <div key={rule} className="convert-findings" data-kind="warning" data-rule-group={rule}>
                          <label className="inline-choice">
                            <input
                              type="checkbox"
                              checked={isAccepted(rule)}
                              onChange={(e) => setAccepted((prev) => (e.target.checked ? { ...prev, [rule]: prints[rule] } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== rule))))}
                            />
                            <span>{t('convert.accept.rule', { n: group.length, rule })}</span>
                          </label>
                          <FindingItems findings={group} />
                        </div>
                      );
                    })}
                    {unconfirmed.length > 0 && (
                      <div className="convert-findings" data-kind="warning" data-rule-group={UNCONFIRMED_KEY}>
                        <label className="inline-choice">
                          <input
                            type="checkbox"
                            checked={unconfirmedAccepted}
                            onChange={(e) => setAccepted((prev) => (e.target.checked ? { ...prev, [UNCONFIRMED_KEY]: unconfirmedPrint } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== UNCONFIRMED_KEY))))}
                          />
                          <span>{t('convert.accept.unconfirmed', { n: unconfirmed.length })}</span>
                        </label>
                      </div>
                    )}
                  </div>
                )}
                <FindingList titleKey="convert.summary.info" findings={infos} kind="info" />
                <p role="status" className={view.ok ? 'notice' : 'notice notice-blocked'}>
                  {view.ok ? t('convert.summary.none') : t('convert.summary.blocked')}
                </p>
              </>
            )}
            <div className="convert-export">
              <HeadingTip tip="convertExport">
                <h3>{t('convert.export.title')}</h3>
              </HeadingTip>
              <p className="muted">{t('convert.export.files')}</p>
              {nothingToWrite && <p className="notice">{t('convert.export.empty')}</p>}
              <div className="confirm-actions">
                <button type="button" className="button" aria-disabled={!canExport} aria-describedby="convert-export-note" onClick={pressExport}>
                  {t('convert.export.button')}
                </button>
              </div>
              <p id="convert-export-note" className="muted" role="note" aria-live="polite">
                {view !== null && !canExport && !exporting && !working ? t('convert.export.blocked') : ''}
              </p>
              {exporting && <p role="status">{t('convert.export.working')}</p>}
              {exported && (
                <p role="status">
                  {t('convert.export.done', { name: exported.fileName, events: exported.counts.events, occurrences: exported.counts.occurrences, measurements: exported.counts.measurements })}
                </p>
              )}
              {exported && !exported.deflated && <p className="muted">{t('convert.export.stored')}</p>}
              {exportError !== null && (
                <p className="error-text" role="alert">
                  {t('convert.error', { message: exportError })}
                </p>
              )}
              <div className="choice-line">
                <button type="button" className="button" onClick={downloadCompanion}>
                  {t('convert.companion.button')}
                </button>
                <InfoTip id="convertCompanion" />
              </div>
              <p className="muted">{t('convert.companion.help')}</p>
            </div>
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

function FindingItems({ findings }: { findings: Finding[] }): React.ReactElement {
  const { lang } = useLang();
  return (
    <ul>
      {findings.map((f, i) => (
        <li key={`${f.ruleId}:${i}`} data-rule={f.ruleId}>
          {f.file !== undefined && f.sheet !== undefined && f.file !== '' && <span className="muted">{f.sheet === f.file ? f.file : t('convert.finding.where', { file: f.file, sheet: f.sheet })}: </span>}
          {plainOf(f, lang)}
        </li>
      ))}
    </ul>
  );
}

function FindingList({ titleKey, findings, kind }: { titleKey: 'convert.summary.blocking' | 'convert.summary.info'; findings: Finding[]; kind: Finding['severity'] }): React.ReactElement | null {
  if (findings.length === 0) return null;
  return (
    <div className="convert-findings" data-kind={kind}>
      <h3>{t(titleKey, { n: findings.length })}</h3>
      <FindingItems findings={findings} />
    </div>
  );
}
