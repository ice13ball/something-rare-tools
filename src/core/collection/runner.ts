// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The collection run: pages from a source adapter, the shared rules on every record that was READ, bounded counts and samples, the
// fix-list CSV in ~1 MB parts, and a checkpoint after every page so a closed tab or a refusal loses nothing. In memory (and in the
// saved run) there are only counters, <= 50 samples per rule, the cursor and small plans: nothing grows with the number of records.
import { getRule } from '../rules/registry';
import type { Finding, Severity } from '../types';
import { GAP_NOTICES, isGapNotice, stopFromError, stopFromFailure } from './stop';
import { StopSignal, makeNetContext, realClock, type Clock, type Net, type NetContext } from './net';
import { UNFINISHED, evaluateItem, fixListHeader, gapRow, incompleteRow, fixListRow, sourceLabel, toSample } from './fixlist';
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
  /** Web Locks (default navigator.locks): one tab at a time may run a saved run. */
  locks?: LockManagerLike | null;
}

/** The part of the Web Locks API the runner uses. */
export interface LockManagerLike {
  request(name: string, options: { mode: 'exclusive'; ifAvailable: true }, callback: (lock: unknown) => Promise<void> | void): Promise<unknown>;
}

/** Held for the whole loop of a run; the saved run belongs to one tab at a time. */
export const RUN_LOCK = 'collection-review-run';
/** The message of the refusal when another tab holds the run (the page shows it in the visitor's language). */
export const RUN_OPEN_ELSEWHERE = 'run-open-elsewhere';
/** The saved run is not the one this tab holds in memory (another tab started, finished or deleted it): reload the page. */
export const RUN_CHANGED = 'run-changed';
/** The stored parts of the fix list are fewer than the run wrote: the list cannot be presented as complete. */
export const CSV_DAMAGED = 'csv-damaged';

/** The settings as they are saved and shown: the pasted DOI list is kept apart (RunStore.saveText), never in a checkpoint or a progress message. */
const withoutText = (settings: RunSettings): RunSettings => (settings.spec.kind === 'dois' ? { ...settings, spec: { kind: 'dois', text: '' } } : settings);

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
  /** Set synchronously by start()/resume() before their first await and held until the loop exists: a second call in that window cannot start a second loop. */
  private busy = false;
  private unlock: (() => void) | null = null;
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
      settings: withoutText(st.settings),
      counts: st.counts,
      stats: st.stats,
      elapsedMs: st.activeMs,
      ...(st.estimate ? { estimate: st.estimate } : {}),
      notices: st.notices,
      deferred: st.deferred.length,
      // 'failed' can be tried again too (the cursor is the page that failed, and the run is still in memory); not after a start that failed.
      resumable: !st.notices.some((n) => n.code === CSV_DAMAGED) && (RESUMABLE.includes(st.status) || (st.status === 'finished' && st.deferred.length > 0) || (st.status === 'failed' && st.plan !== null)),
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
    try {
      if (!(await this.partsIntact(run))) this.markDamaged();
    } catch {
      // The parts cannot even be read: the saved run is still shown (and can be discarded), with the storage notice.
      if (!run.notices.some((n) => n.code === 'storage-failed')) run.notices.push({ code: 'storage-failed' });
    }
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
    if (this.loopDone || this.busy) throw new Error('A run is already going');
    this.busy = true;
    try {
      if (!(await this.takeLock())) throw new Error(RUN_OPEN_ELSEWHERE); // before anything of the saved run is touched
      try {
        await this.startRun(settings);
      } catch (e) {
        this.releaseLock();
        throw e;
      }
      if (!this.loopDone) this.releaseLock();
    } finally {
      this.busy = false;
    }
  }

  private async startRun(settings: RunSettings): Promise<void> {
    await this.d.store.clear();
    const now = this.clock.now();
    const st: RunRecord = {
      id: this.d.newId?.() ?? `r${now.toString(36)}${Math.floor(this.clock.random() * 1e6).toString(36)}`,
      version: 1,
      settings: withoutText(settings),
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
      if (settings.spec.kind === 'dois') await this.d.store.saveText(st.id, settings.spec.text); // once, here; checkpoints keep only the position
      const prepared = await prepareSource(deps, settings, (this.d.year?.() ?? new Date(this.clock.now()).getUTCFullYear()));
      st.plan = prepared.plan;
      st.estimate = prepared.estimate;
      st.cursor = prepared.pager.initial;
      for (const n of prepared.notices) this.notice(n);
      st.status = 'running';
      await this.checkpoint();
      this.launch(prepared.pager, ctl);
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
    if (this.loopDone || this.busy) return; // already going (or being started): a second call must not start a second loop
    this.busy = true;
    try {
      if (!(await this.takeLock())) throw new Error(RUN_OPEN_ELSEWHERE);
      try {
        await this.resumeRun();
      } catch (e) {
        this.releaseLock();
        throw e;
      }
      if (!this.loopDone) this.releaseLock();
    } finally {
      this.busy = false;
    }
  }

  private async resumeRun(): Promise<void> {
    if (!this.st) await this.saved();
    else {
      // This tab's copy may be stale: another tab can have started, finished or deleted the saved run since. Never write over a newer one.
      const stored = await this.d.store.load();
      if (!stored || stored.id !== this.st.id || stored.updatedAt > this.st.updatedAt) throw new Error(RUN_CHANGED);
    }
    const st = this.st;
    if (!st || !this.progress().resumable) throw new Error('Nothing to resume');
    if (!(await this.partsIntact(st))) {
      this.markDamaged();
      throw new Error(CSV_DAMAGED);
    }
    // The run only becomes 'running' once everything it needs is in hand: a list that is gone or a plan that cannot be restored leaves it as it was.
    const { ctl, deps } = this.begin(st);
    let pager: Pager<unknown>;
    try {
      pager = restorePager(deps, await this.fullSettings(st), st.plan);
    } catch (e) {
      this.ctl = null;
      throw e;
    }
    const before = { status: st.status, stop: st.stop, notices: st.notices };
    st.status = 'running';
    delete st.stop;
    st.notices = st.notices.filter((n) => !GAP_NOTICES.includes(n.code)); // rebuilt when the run ends again
    try {
      await this.checkpoint();
    } catch (e) {
      // the saved state could not be written: the run is as it was (not "running" with no loop), and the storage error is the visitor's to see
      st.status = before.status;
      if (before.stop) st.stop = before.stop;
      st.notices = before.notices;
      this.ctl = null;
      throw e;
    }
    this.launch(pager, ctl);
  }

  /**
   * Takes the run lock (exclusive, only if free) for the loop that is about to start. false = another tab holds it. Where the browser has no
   * Web Locks API (old browsers, some test environments) there is no lock and the behaviour is as before: the run goes ahead.
   */
  private async takeLock(): Promise<boolean> {
    const locks = this.d.locks === undefined ? (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator?.locks : this.d.locks;
    if (!locks) return true;
    return new Promise<boolean>((resolve, reject) => {
      locks
        .request(RUN_LOCK, { mode: 'exclusive', ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(false);
            return;
          }
          resolve(true);
          return new Promise<void>((release) => {
            this.unlock = release;
          });
        })
        .catch(reject);
    });
  }

  private releaseLock(): void {
    const u = this.unlock;
    this.unlock = null;
    u?.();
  }

  /** Starts the loop; the run lock is let go when it ends. */
  private launch(pager: Pager<unknown>, ctl: AbortController): void {
    this.loopDone = this.loop(pager, ctl).finally(() => {
      this.loopDone = null;
      this.releaseLock();
    });
  }

  /** The settings with the pasted DOI list put back (a run saved before the list had its own entry still carries it in the record). */
  private async fullSettings(st: RunRecord): Promise<RunSettings> {
    const spec = st.settings.spec;
    if (spec.kind !== 'dois') return st.settings;
    const text = (await this.d.store.loadText(st.id)) ?? (spec.text !== '' ? spec.text : null);
    if (text === null) throw new Error('The pasted DOI list is no longer saved');
    return { ...st.settings, spec: { kind: 'dois', text } };
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
    // Another tab that is running this saved run must not lose it under its feet: the same lock as a run, and the same refusal.
    if (!(await this.takeLock())) throw new Error(RUN_OPEN_ELSEWHERE);
    try {
      await this.d.store.clear();
      this.st = null;
      this.pending = [];
      this.emit();
    } finally {
      this.releaseLock();
    }
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
    // ONE synchronous snapshot of everything that moves while the run goes on (a checkpoint empties `pending` while the store read below
    // waits for it): the file is built from these copies and from the stored parts below the snapshot's count, never from live state.
    const snap = {
      id: st.id,
      stored: (st.partCount ?? 0) - this.pending.length, // parts written to the store at this moment; the rest are in `pending`
      pending: this.pending.map((p) => p.blob),
      buffer: st.csvBuffer,
      status: st.status,
      stop: st.stop,
      lang: st.settings.lang,
      source: sourceLabel(st.settings.spec),
      gap: st.status === 'finished' && st.notices.some(isGapNotice),
      gapRow: st.status === 'finished' ? gapRow(st.notices, st.deferred.length > 0, st.settings.lang, sourceLabel(st.settings.spec)) : '',
    };
    const parts = (await this.d.store.parts(snap.id, snap.stored)).slice(0, snap.stored);
    // a store that holds fewer than the run wrote is damaged, never silently shorter
    if (parts.length !== snap.stored) {
      this.markDamaged();
      throw new Error(CSV_DAMAGED);
    }
    const last = UNFINISHED.includes(snap.status) ? [incompleteRow(snap.status, snap.stop, snap.lang, snap.source)] : snap.gap ? [snap.gapRow] : [];
    return [fixListHeader(), ...parts, ...snap.pending, snap.buffer, ...last];
  }

  /** The fix list on disk is damaged: said in a notice (the list cannot be presented as complete). */
  private markDamaged(): void {
    const st = this.st;
    if (!st || st.notices.some((n) => n.code === CSV_DAMAGED)) return;
    st.notices.push({ code: CSV_DAMAGED });
    this.emit();
  }

  /** Are all the parts the run wrote still in the store? */
  private async partsIntact(st: RunRecord): Promise<boolean> {
    const stored = (st.partCount ?? 0) - this.pending.length;
    return (await this.d.store.parts(st.id, stored)).length === stored;
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
          if (e.kind === 'protocol' || e.kind === 'not-found') return await this.fail(e, !(pager.isPage?.(cur) ?? true));
          // The daily budget of this connection is spent: every further page would be refused too. The page stays at the cursor (not deferred), the run is saved and resumes later.
          if (e.reason === 'csw_daily_budget') return await this.interrupt(e, (st.pagesTried ?? 0) + 1);
          const skip = pager.skip(cur);
          const isPage = pager.isPage?.(cur) ?? true;
          const page = (st.pagesTried ?? 0) + 1;
          this.defer({ cursor: skip === null ? cur : (pager.retryCursor?.(cur) ?? cur), kind: e.kind, expected: pager.expected(cur), reason: e.reason, page, ...(isPage ? {} : { counting: true }), ...(skip === null ? { blocking: true } : {}) });
          if (isPage) st.pagesTried = page;
          failures += 1;
          // The page now sits in `deferred`; the cursor goes past it BEFORE the run may stop, or a resume would read it twice (deferred + cursor).
          if (skip !== null) st.cursor = skip;
          if (skip === null || failures >= CONSECUTIVE_FAILURES || st.deferred.length >= MAX_DEFERRED) return await this.interrupt(e, page, !isPage);
          await this.checkpoint();
          continue;
        }
        failures = 0;
        this.apply(data);
        if (pager.isPage?.(cur) ?? true) st.pagesTried = (st.pagesTried ?? 0) + 1;
        st.cursor = data.next;
        await this.checkpoint();
      }
      if (st.deferred.length > 0) {
        await this.clock.sleep(RETRY_COOLDOWN_MS, ctl.signal);
        if (!(await this.retryDeferred(pager, ctl))) return;
      }
      this.gapNotices();
      if (!(await this.partsIntact(st))) this.markDamaged();
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
        const storage = e instanceof Error && /IndexedDB|Quota|VersionError|InvalidStateError/i.test(`${e.name} ${e.message}`);
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
    const queue = [...st.deferred];
    for (let entry = queue.shift(); entry !== undefined; entry = queue.shift()) {
      await this.gate(ctl);
      let data: PageData<unknown>;
      try {
        data = await pager.fetch(entry.cursor);
      } catch (e) {
        if (!(e instanceof SourceFailure)) throw e;
        if (e.kind === 'protocol' || e.kind === 'not-found') {
          await this.fail(e, entry.counting);
          return false;
        }
        // The day's budget ran out in the retry pass: as in the normal pass, the run is interrupted (resumable), not finished with "unread pages".
        if (e.reason === 'csw_daily_budget') {
          await this.interrupt(e, entry.page, entry.counting);
          return false;
        }
        if (e.kind !== entry.kind) this.moveState(entry, e.kind);
        entry.reason = e.reason;
        failures += 1;
        if (entry.blocking || failures >= CONSECUTIVE_FAILURES) {
          await this.interrupt(e, entry.page, entry.counting);
          return false;
        }
        continue;
      }
      failures = 0;
      st.deferred.splice(st.deferred.indexOf(entry), 1);
      st.counts.states[entry.kind] -= entry.expected;
      st.counts.records -= entry.expected;
      const judge = !entry.blocking && pager.rest !== undefined; // a retried page is judged against its own range, not the source's position
      this.apply(data, judge);
      if (entry.blocking) st.cursor = data.next;
      else if (judge) {
        // The answer may cover only the first positions of the page's range (a page asked smaller): what is left is owed, and is read next.
        const rest = pager.rest!(entry.cursor, data, entry.expected);
        if (rest.missing > 0) st.shortfall = (st.shortfall ?? 0) + rest.missing;
        if (rest.next) {
          const owed: Deferred = { cursor: rest.next.cursor, kind: entry.kind, expected: rest.next.expected, reason: entry.reason, ...(entry.page !== undefined ? { page: entry.page } : {}) };
          this.defer(owed);
          queue.unshift(owed);
        }
      }
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

  private async fail(e: SourceFailure, counting = false): Promise<void> {
    const st = this.st!;
    st.status = 'failed';
    this.notice({ code: e.reason, params: { kind: e.kind, ...(e.status ? { status: e.status } : {}) } });
    st.stop = stopFromFailure(e, sourceLabel(st.settings.spec), (st.pagesTried ?? 0) + 1, st.stats.requests, this.clock.now(), counting);
    await this.checkpoint();
  }

  private async interrupt(e: SourceFailure, page?: number, counting = false): Promise<void> {
    const st = this.st!;
    st.status = 'interrupted';
    this.notice({ code: 'interrupted', params: { reason: e.reason } });
    st.stop = stopFromFailure(e, sourceLabel(st.settings.spec), page ?? (st.pagesTried ?? 0) + 1, st.stats.requests, this.clock.now(), counting);
    await this.checkpoint();
  }

  /**
   * A run that ends with pages it could not read, or records its source announced and did not deliver, is "finished" but NOT complete:
   * it says so in a notice that no cap can drop (rebuilt each time the run ends, so a resumed run does not keep a stale one) and in the
   * last row of the fix list.
   */
  private gapNotices(): void {
    const st = this.st!;
    st.notices = st.notices.filter((n) => !GAP_NOTICES.includes(n.code));
    if (st.deferred.length > 0) {
      const byReason = new Map<string, number>();
      for (const d of st.deferred) byReason.set(d.reason, (byReason.get(d.reason) ?? 0) + 1);
      const reason = [...byReason.entries()].sort((a, b) => b[1] - a[1])[0][0];
      st.notices.push({ code: 'unread-pages', params: { pages: st.deferred.length, records: st.deferred.reduce((a, d) => a + d.expected, 0), reason } });
    }
    if ((st.shortfall ?? 0) > 0) st.notices.push({ code: 'records-missing', params: { missing: st.shortfall ?? 0 } });
  }

  private notice(n: Notice): void {
    const st = this.st!;
    const key = JSON.stringify(n);
    // the gap notices of the end of the run are added by gapNotices() and always fit: room is kept for them
    if (st.notices.some((x) => JSON.stringify(x) === key) || st.notices.filter((x) => !isGapNotice(x)).length >= MAX_NOTICES) return;
    st.notices.push(n);
  }

  /** Counts, samples and CSV rows of one page. Only a record that was READ meets the rules. */
  private apply(data: PageData<unknown>, ignoreShortfall = false): void {
    const st = this.st!;
    const c = st.counts;
    const source = sourceLabel(st.settings.spec);
    for (const raw of data.items) {
      let item = raw;
      let findings: Finding[] = [];
      if (item.state === 'checked') {
        try {
          findings = evaluateItem(item);
        } catch {
          // One record the rules cannot take must not end a run of thousands: it is counted as not read, and gets no finding.
          item = { ref: item.ref, state: 'unsupported-profile', records: [], reason: 'check-failed' };
        }
      }
      c.records += 1;
      c.states[item.state] = (c.states[item.state] ?? 0) + 1; // `?? 0`: a run saved before 'not-in-datacite' existed has no such counter
      if (item.state !== 'checked') {
        if (st.unread.length < SAMPLES_PER_RULE) st.unread.push({ ref: item.ref, state: item.state, reason: item.reason ?? '' });
        continue;
      }
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
      if (k.crossSource?.noDoi) c.crossSource.noDoi = (c.crossSource.noDoi ?? 0) + k.crossSource.noDoi;
    }
    for (const n of data.notices ?? []) this.notice(n);
    if (data.shortfall && !ignoreShortfall) st.shortfall = (st.shortfall ?? 0) + data.shortfall;
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
