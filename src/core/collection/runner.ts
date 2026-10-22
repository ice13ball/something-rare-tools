// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The collection run: pages from a source adapter, the shared rules on every record that was READ, bounded counts and samples, the
// fix-list CSV in ~1 MB parts, and a checkpoint after every page so a closed tab or a refusal loses nothing. In memory (and in the
// saved run) there are only counters, <= 50 samples per rule, the cursor and small plans: nothing grows with the number of records.
import { getRule } from '../rules/registry';
import type { Severity } from '../types';
import { stopFromError, stopFromFailure } from './stop';
import { StopSignal, makeNetContext, realClock, type Clock, type Net, type NetContext } from './net';
import { UNFINISHED, evaluateItem, fixListHeader, incompleteRow, fixListRow, sourceLabel, toSample } from './fixlist';
import { estimateSource, prepareSource, restorePager } from './sources';
import type { Deps } from './sources/datacite';
import type { NewPart, RunStore } from './store';
import {
  SourceFailure,
  emptyCounts,
  type Deferred,
  type Estimate,
  type Notice,
  type PageData,
  type Pager,
  type Progress,
  type RunRecord,
  type RunSettings,
  type RunStatus,
  type Sample,
  type SourceSpec,
  type UnreadSample,
} from './types';

export const SAMPLES_PER_RULE = 50;
export const CSV_PART_CHARS = 1_000_000;
export const MAX_DEFERRED = 200;
export const MAX_NOTICES = 20;
/** Pages in a row that fail before the run stops and waits for the visitor to resume. */
export const CONSECUTIVE_FAILURES = 3;
/** Before the unread pages of a finished pass are tried again. */
export const RETRY_COOLDOWN_MS = 20_000;

export interface RunnerDeps {
  net: Net;
  store: RunStore;
  clock?: Clock;
  /** Pacing per host (ms), default PACE_MS. */
  paceMs?: Readonly<Record<string, number>>;
  onProgress?: (p: Progress) => void;
  newId?: () => string;
  /** Current year (the last Zenodo date slice). */
  year?: () => number;
}

const errorText = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, STOP_CLIP);

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

const RESUMABLE: readonly RunStatus[] = ['stopped', 'interrupted', 'paused'];
const STOP_CLIP = 200;

export class CollectionRunner {
  private st: RunRecord | null = null;
  private ctl: AbortController | null = null;
  private loopDone: Promise<void> | null = null;
  private pausedGate: { promise: Promise<void>; release: () => void } | null = null;
  private pending: NewPart[] = [];
  private readonly clock: Clock;

  constructor(private readonly d: RunnerDeps) {
    this.clock = d.clock ?? realClock;
  }

  // ---- queries -------------------------------------------------------------------------------------------------------------

  progress(): Progress {
    const st = this.st;
    if (!st) return { status: 'idle', counts: emptyCounts(), stats: { requests: 0, retries: 0, throttleEvents: 0 }, elapsedMs: 0, notices: [], deferred: 0, resumable: false, csv: { rows: 0, bytes: 0 }, ruleOrder: [] };
    const ruleOrder = Object.entries(st.counts.rules)
      .map(([ruleId, count]) => ({ ruleId, severity: getRule(ruleId).severity, count }))
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count || a.ruleId.localeCompare(b.ruleId));
    return {
      status: st.status,
      settings: st.settings,
      counts: st.counts,
      stats: st.stats,
      elapsedMs: st.activeMs,
      ...(st.estimate ? { estimate: st.estimate } : {}),
      notices: st.notices,
      deferred: st.deferred.length,
      // 'failed' can be tried again too (the cursor is the page that failed, and the run is still in memory); not after a start that failed.
      resumable: RESUMABLE.includes(st.status) || (st.status === 'finished' && st.deferred.length > 0) || (st.status === 'failed' && st.plan !== null),
      ...(st.stop ? { stop: st.stop } : {}),
      csv: { rows: st.csvRows, bytes: st.csvBytes },
      startedAt: st.startedAt,
      updatedAt: st.updatedAt,
      ruleOrder,
    };
  }

  /** The saved run of an earlier visit (or null). A run that was running when the page closed is 'interrupted'. */
  async saved(): Promise<Progress | null> {
    if (this.st) return this.progress();
    const run = await this.d.store.load();
    if (!run) return null;
    if (run.status === 'running' || run.status === 'preparing') {
      run.status = 'interrupted';
      run.stop = { cause: 'closed', source: sourceLabel(run.settings.spec), page: (run.pagesTried ?? 0) + 1, request: run.stats.requests, kind: 'closed', at: run.updatedAt };
    }
    this.st = run;
    this.pending = [];
    return this.progress();
  }

  samples(ruleId: string, offset: number, limit: number): Sample[] {
    return (this.st?.samples[ruleId] ?? []).slice(Math.max(0, offset), Math.max(0, offset) + Math.max(0, limit));
  }

  unread(): UnreadSample[] {
    return this.st?.unread ?? [];
  }

  /** Counts and time before anything is read: one or two requests. */
  async estimate(spec: SourceSpec, sample: boolean): Promise<Estimate> {
    const nctx = makeNetContext(this.clock, { requests: 0, retries: 0, throttleEvents: 0 }, undefined, this.d.paceMs);
    return estimateSource({ net: this.d.net, nctx }, spec, sample);
  }

  whenIdle(): Promise<void> {
    return this.loopDone ?? Promise.resolve();
  }

  // ---- control -------------------------------------------------------------------------------------------------------------

  /** Starts a run (replacing the saved one). Resolves when the source has answered the first questions; the run goes on in the background. */
  async start(settings: RunSettings): Promise<void> {
    if (this.loopDone) throw new Error('A run is already going');
    await this.d.store.clear();
    const now = this.clock.now();
    const st: RunRecord = {
      id: this.d.newId?.() ?? `r${now.toString(36)}${Math.floor(this.clock.random() * 1e6).toString(36)}`,
      version: 1,
      settings,
      status: 'preparing',
      startedAt: now,
      updatedAt: now,
      activeMs: 0,
      cursor: null,
      plan: null,
      deferred: [],
      counts: emptyCounts(),
      samples: {},
      unread: [],
      notices: [],
      stats: { requests: 0, retries: 0, throttleEvents: 0 },
      csvBuffer: '',
      partCount: 0,
      csvBytes: 0,
      csvRows: 0,
    };
    this.st = st;
    this.pending = [];
    this.emit();
    const { ctl, deps } = this.begin(st);
    try {
      const prepared = await prepareSource(deps, settings, (this.d.year?.() ?? new Date(this.clock.now()).getUTCFullYear()));
      st.plan = prepared.plan;
      st.estimate = prepared.estimate;
      st.cursor = prepared.pager.initial;
      for (const n of prepared.notices) this.notice(n);
      st.status = 'running';
      await this.checkpoint();
      this.loopDone = this.loop(prepared.pager, ctl).finally(() => {
        this.loopDone = null;
      });
    } catch (e) {
      this.ctl = null;
      st.status = e instanceof StopSignal ? 'stopped' : 'failed';
      st.plan = null;
      if (e instanceof SourceFailure) {
        this.notice({ code: e.reason, params: { kind: e.kind, ...(e.status ? { status: e.status } : {}) } });
        st.stop = stopFromFailure(e, sourceLabel(settings.spec), 1, st.stats.requests, this.clock.now());
      } else if (!(e instanceof StopSignal)) st.stop = stopFromError(e, sourceLabel(settings.spec), 1, st.stats.requests, this.clock.now());
      await this.d.store.clear();
      this.pending = [];
      this.emit();
      throw e;
    }
  }

  /** Goes on: releases a pause, or continues the saved run (stopped, interrupted, or finished with unread pages). */
  async resume(): Promise<void> {
    if (this.pausedGate) {
      this.st!.status = 'running';
      this.pausedGate.release();
      this.pausedGate = null;
      this.emit();
      return;
    }
    if (this.loopDone) return;
    if (!this.st) await this.saved();
    const st = this.st;
    if (!st || !this.progress().resumable) throw new Error('Nothing to resume');
    st.status = 'running';
    delete st.stop;
    const { ctl, deps } = this.begin(st);
    const pager = restorePager(deps, st.settings, st.plan);
    await this.checkpoint();
    this.loopDone = this.loop(pager, ctl).finally(() => {
      this.loopDone = null;
    });
  }

  /** Holds the run at the next page boundary (the tab stays open); `resume()` releases it. */
  pause(): void {
    if (!this.st || this.st.status !== 'running' || this.pausedGate) return;
    let release!: () => void;
    const promise = new Promise<void>((r) => (release = r));
    this.pausedGate = { promise, release };
    this.st.status = 'paused';
    this.emit();
  }

  /** Ends the run after the request in flight; the progress stays saved and can be resumed. */
  async stop(): Promise<void> {
    this.ctl?.abort();
    this.pausedGate?.release();
    this.pausedGate = null;
    await this.loopDone;
  }

  /** Deletes the saved progress and the fix-list parts. */
  async discard(): Promise<void> {
    await this.stop();
    await this.d.store.clear();
    this.st = null;
    this.pending = [];
    this.emit();
  }

  // ---- the fix list --------------------------------------------------------------------------------------------------------

  fileName(): string {
    const st = this.st;
    const date = new Date(st?.startedAt ?? this.clock.now()).toISOString().slice(0, 10);
    return `fix-list${st?.settings.sample ? '-sample' : ''}-${date}.csv`;
  }

  private async csvPieces(): Promise<BlobPart[]> {
    const st = this.st;
    if (!st) return [fixListHeader()];
    const parts = await this.d.store.parts(st.id, st.partCount);
    const last = UNFINISHED.includes(st.status) ? [incompleteRow(st.status, st.stop, st.settings.lang, sourceLabel(st.settings.spec))] : [];
    return [fixListHeader(), ...parts, ...(this.pending.length > 0 ? this.pending.map((p) => p.blob) : []), st.csvBuffer, ...last];
  }

  /** The fix list as one Blob built from the stored parts (disk-backed Blobs: no full copy in memory). */
  async csvBlob(): Promise<Blob> {
    return new Blob(await this.csvPieces(), { type: 'text/csv;charset=utf-8' });
  }

  /** Streams the fix list into a file the visitor chose (File System Access API): memory stays at one part. */
  async saveTo(handle: { createWritable(): Promise<{ write(data: BlobPart): Promise<void>; close(): Promise<void> }> }): Promise<void> {
    const w = await handle.createWritable();
    for (const piece of await this.csvPieces()) await w.write(piece);
    await w.close();
  }

  // ---- the loop ------------------------------------------------------------------------------------------------------------

  private begin(st: RunRecord): { ctl: AbortController; deps: Deps } {
    const ctl = new AbortController();
    this.ctl = ctl;
    const nctx: NetContext = makeNetContext(this.clock, st.stats, ctl.signal, this.d.paceMs);
    return { ctl, deps: { net: this.d.net, nctx } };
  }

  private async gate(ctl: AbortController): Promise<void> {
    if (this.pausedGate) await this.pausedGate.promise;
    if (ctl.signal.aborted) throw new StopSignal();
  }

  private async loop(pager: Pager<unknown>, ctl: AbortController): Promise<void> {
    const st = this.st!;
    let t0 = this.clock.now();
    const tick = (): void => {
      const n = this.clock.now();
      st.activeMs += Math.max(0, n - t0);
      t0 = n;
    };
    this.tick = tick;
    try {
      if (st.deferred.length > 0 && !(await this.retryDeferred(pager, ctl))) return;
      let failures = 0;
      while (st.cursor !== null) {
        await this.gate(ctl);
        const cur = st.cursor;
        let data: PageData<unknown>;
        try {
          data = await pager.fetch(cur);
        } catch (e) {
          if (!(e instanceof SourceFailure)) throw e;
          if (e.kind === 'protocol' || e.kind === 'not-found') return await this.fail(e);
          const skip = pager.skip(cur);
          const page = (st.pagesTried ?? 0) + 1;
          this.defer({ cursor: cur, kind: e.kind, expected: pager.expected(cur), reason: e.reason, page, ...(skip === null ? { blocking: true } : {}) });
          st.pagesTried = page;
          failures += 1;
          // The page now sits in `deferred`; the cursor goes past it BEFORE the run may stop, or a resume would read it twice (deferred + cursor).
          if (skip !== null) st.cursor = skip;
          if (skip === null || failures >= CONSECUTIVE_FAILURES || st.deferred.length >= MAX_DEFERRED) return await this.interrupt(e, page);
          await this.checkpoint();
          continue;
        }
        failures = 0;
        this.apply(data);
        st.pagesTried = (st.pagesTried ?? 0) + 1;
        st.cursor = data.next;
        await this.checkpoint();
      }
      if (st.deferred.length > 0) {
        await this.clock.sleep(RETRY_COOLDOWN_MS, ctl.signal);
        if (!(await this.retryDeferred(pager, ctl))) return;
      }
      st.status = 'finished';
      await this.checkpoint();
    } catch (e) {
      const source = sourceLabel(st.settings.spec);
      const page = (st.pagesTried ?? 0) + 1;
      if (e instanceof StopSignal) {
        st.status = 'stopped';
        st.stop = { cause: 'user', source, page, request: st.stats.requests, kind: 'user', at: this.clock.now() };
        await this.checkpoint().catch(() => undefined);
      } else {
        const storage = e instanceof Error && /IndexedDB|Quota/i.test(`${e.name} ${e.message}`);
        st.status = 'failed';
        this.notice({ code: storage ? 'storage-failed' : 'unexpected' });
        st.stop = storage
          ? { cause: 'storage', source, page, request: st.stats.requests, kind: 'error', detail: errorText(e), at: this.clock.now() }
          : stopFromError(e, source, page, st.stats.requests, this.clock.now());
        if (!storage) await this.checkpoint().catch(() => undefined);
        this.emit();
      }
    } finally {
      this.ctl = null;
      this.pausedGate = null;
    }
  }

  private tick: () => void = () => undefined;

  /** The pages that could not be read earlier. false = the run stopped here (interrupted or failed). */
  private async retryDeferred(pager: Pager<unknown>, ctl: AbortController): Promise<boolean> {
    const st = this.st!;
    let failures = 0;
    for (const entry of [...st.deferred]) {
      await this.gate(ctl);
      let data: PageData<unknown>;
      try {
        data = await pager.fetch(entry.cursor);
      } catch (e) {
        if (!(e instanceof SourceFailure)) throw e;
        if (e.kind === 'protocol' || e.kind === 'not-found') {
          await this.fail(e);
          return false;
        }
        if (e.kind !== entry.kind) this.moveState(entry, e.kind);
        entry.reason = e.reason;
        failures += 1;
        if (entry.blocking || failures >= CONSECUTIVE_FAILURES) {
          await this.interrupt(e, entry.page);
          return false;
        }
        continue;
      }
      failures = 0;
      st.deferred.splice(st.deferred.indexOf(entry), 1);
      st.counts.states[entry.kind] -= entry.expected;
      st.counts.records -= entry.expected;
      this.apply(data);
      if (entry.blocking) st.cursor = data.next;
      await this.checkpoint();
    }
    return true;
  }

  private moveState(entry: Deferred, kind: Deferred['kind']): void {
    const st = this.st!;
    st.counts.states[entry.kind] -= entry.expected;
    st.counts.states[kind] += entry.expected;
    entry.kind = kind;
  }

  private defer(d: Deferred): void {
    const st = this.st!;
    st.deferred.push(d);
    st.counts.states[d.kind] += d.expected;
    st.counts.records += d.expected;
  }

  private async fail(e: SourceFailure): Promise<void> {
    const st = this.st!;
    st.status = 'failed';
    this.notice({ code: e.reason, params: { kind: e.kind, ...(e.status ? { status: e.status } : {}) } });
    st.stop = stopFromFailure(e, sourceLabel(st.settings.spec), (st.pagesTried ?? 0) + 1, st.stats.requests, this.clock.now());
    await this.checkpoint();
  }

  private async interrupt(e: SourceFailure, page?: number): Promise<void> {
    const st = this.st!;
    st.status = 'interrupted';
    this.notice({ code: 'interrupted', params: { reason: e.reason } });
    st.stop = stopFromFailure(e, sourceLabel(st.settings.spec), page ?? (st.pagesTried ?? 0) + 1, st.stats.requests, this.clock.now());
    await this.checkpoint();
  }

  private notice(n: Notice): void {
    const st = this.st!;
    const key = JSON.stringify(n);
    if (st.notices.some((x) => JSON.stringify(x) === key) || st.notices.length >= MAX_NOTICES) return;
    st.notices.push(n);
  }

  /** Counts, samples and CSV rows of one page. Only a record that was READ meets the rules. */
  private apply(data: PageData<unknown>): void {
    const st = this.st!;
    const c = st.counts;
    const source = sourceLabel(st.settings.spec);
    for (const item of data.items) {
      c.records += 1;
      c.states[item.state] += 1;
      if (item.state !== 'checked') {
        if (st.unread.length < SAMPLES_PER_RULE) st.unread.push({ ref: item.ref, state: item.state, reason: item.reason ?? '' });
        continue;
      }
      const findings = evaluateItem(item);
      if (findings.length > 0) c.withFindings += 1;
      for (const f of findings) {
        c.rules[f.ruleId] = (c.rules[f.ruleId] ?? 0) + 1;
        const list = (st.samples[f.ruleId] ??= []);
        if (list.length < SAMPLES_PER_RULE) list.push(toSample(item.ref, f));
        this.addRow(fixListRow(item.ref, f, st.settings.lang, source));
      }
    }
    const k = data.counters;
    if (k) {
      c.duplicatesInBatch += k.duplicatesInBatch ?? 0;
      c.invalidTokens += k.invalidTokens ?? 0;
      for (const key of ['looked', 'found', 'absent', 'failed'] as const) c.crossSource[key] += k.crossSource?.[key] ?? 0;
      if (k.crossSource?.notCompared) c.crossSource.notCompared = (c.crossSource.notCompared ?? 0) + k.crossSource.notCompared;
    }
    for (const n of data.notices ?? []) this.notice(n);
  }

  private addRow(row: string): void {
    const st = this.st!;
    st.csvBuffer += row;
    st.csvRows += 1;
    st.csvBytes += row.length;
    if (st.csvBuffer.length >= CSV_PART_CHARS) {
      const blob = new Blob([st.csvBuffer], { type: 'text/csv;charset=utf-8' });
      st.csvBytes += blob.size - st.csvBuffer.length;
      this.pending.push({ index: st.partCount, blob });
      st.partCount += 1;
      st.csvBuffer = '';
    }
  }

  private async checkpoint(): Promise<void> {
    const st = this.st!;
    this.tick();
    st.updatedAt = this.clock.now();
    const parts = this.pending;
    try {
      await this.d.store.save(st, parts);
    } catch {
      // One more try: a transient IndexedDB error (a busy backing store) is not a reason to end a run of thousands of pages.
      await this.d.store.save(st, parts);
    }
    this.pending = this.pending.filter((p) => !parts.includes(p));
    this.emit();
  }

  private emit(): void {
    this.d.onProgress?.(this.progress());
  }
}
