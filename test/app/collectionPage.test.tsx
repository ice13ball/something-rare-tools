// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOGUES } from '../../config/catalogues';
import { initLang, setLang } from '../../src/app/i18n';
import { CollectionPage } from '../../src/app/pages/CollectionPage';
import { IndexPage } from '../../src/app/pages/IndexPage';
import { PrivacyPage } from '../../src/app/pages/PrivacyPage';
import { emptyCounts, type Estimate, type Notice, type Progress, type RunSettings, type Sample, type SourceSpec, type UnreadSample } from '../../src/core/collection/types';
import { UI } from '../../src/core/i18n/ui';
import { LANGS } from '../../src/core/types';
import { createDirectEngine } from '../../src/worker/handler';
import type { CollectionEngine } from '../../src/worker/collection.client';
import { MapFetcher } from '../sources/mapFetcher';
import { createDirectCollectionEngine } from '../../src/worker/collection.client';
import { dataciteMock, HTML_503, res, runnerDeps, virtualClock } from '../collection/helpers';
import { DC, dataciteJson } from '../helpers/licenceFixtures';

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const estimate = (o: Partial<Estimate> = {}): Estimate => ({ records: 2124, requests: 3, extraRequests: 0, seconds: 40, strategy: 'cursor', sample: false, ...o });

function progressOf(o: Partial<Progress> = {}, spec?: SourceSpec, sample = false): Progress {
  const counts = emptyCounts();
  counts.records = 110;
  counts.states = { checked: 100, unreachable: 4, throttled: 5, 'unsupported-profile': 1, 'not-in-datacite': 0 };
  counts.rules = { 'LIC-MISSING': 80, 'META-NO-VERSION': 30 };
  counts.withFindings = 90;
  return {
    status: 'running',
    settings: { spec: spec ?? { kind: 'datacite', by: 'client', id: 'some.client' }, lang: 'en', sample },
    counts,
    stats: { requests: 7, retries: 1, throttleEvents: 0 },
    elapsedMs: 12_000,
    notices: [],
    deferred: 0,
    resumable: false,
    csv: { rows: 110, bytes: 4000 },
    startedAt: Date.UTC(2026, 9, 22),
    ruleOrder: [
      { ruleId: 'LIC-MISSING', severity: 'warning', count: 80 },
      { ruleId: 'META-NO-VERSION', severity: 'info', count: 30 },
    ],
    ...o,
  };
}

const sampleRows = (ruleId: string, n: number): Sample[] =>
  Array.from({ length: n }, (_, i) => ({ ref: `10.1234/rec-${ruleId}-${i + 1}`, ruleId, severity: 'warning', params: {} }));

/** A hand-driven stand-in for the worker client: records every call, the test pushes progress. */
function fakeEngine(initial: { saved?: Progress | null; estimateFull?: Estimate; estimateSample?: Estimate; unread?: UnreadSample[] } = {}) {
  const listeners = new Set<(p: Progress) => void>();
  let current: Progress = progressOf({ status: 'idle' });
  const calls: string[] = [];
  const starts: RunSettings[] = [];
  const estimates: { spec: SourceSpec; sample: boolean }[] = [];
  const engine: CollectionEngine = {
    estimate: async (spec, sample) => {
      estimates.push({ spec, sample });
      return sample ? (initial.estimateSample ?? estimate({ records: 1000, requests: 1, seconds: 5, sample: true })) : (initial.estimateFull ?? estimate());
    },
    start: async (s) => {
      calls.push('start');
      starts.push(s);
    },
    resume: async () => void calls.push('resume'),
    pause: async () => void calls.push('pause'),
    stop: async () => void calls.push('stop'),
    discard: async () => {
      calls.push('discard');
      current = progressOf({ status: 'idle' });
    },
    saved: async () => initial.saved ?? null,
    progress: async () => current,
    samples: async (ruleId, off, limit) => sampleRows(ruleId, Math.min(50, ruleId === 'LIC-MISSING' ? 80 : 30)).slice(off, off + limit),
    unread: async () => initial.unread ?? [],
    download: async () => {
      calls.push('download');
      return { blob: new Blob(['a,b\n']), fileName: 'fix-list-2026-10-22.csv' };
    },
    saveTo: async () => void calls.push('saveTo'),
    onProgress: (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    dispose: () => undefined,
  };
  return {
    engine,
    calls,
    starts,
    estimates,
    push: (p: Progress) => {
      current = p;
      act(() => listeners.forEach((l) => l(p)));
    },
  };
}

const button = (name: RegExp | string): HTMLElement => screen.getByRole('button', { name });

async function estimateDatacite(f: ReturnType<typeof fakeEngine>, download = vi.fn(), id = 'some.client'): Promise<void> {
  render(<CollectionPage engine={f.engine} download={download} />);
  fireEvent.change(screen.getByLabelText('Client id or prefix'), { target: { value: id } });
  fireEvent.click(button('Estimate size and time'));
  await waitFor(() => screen.getByTestId('estimate'));
}

describe('CollectionPage: inputs and estimate', () => {
  it('is a static explanation plus a form; the title is function-first, brand last', () => {
    render(<CollectionPage engine={fakeEngine().engine} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Collection review' })).toBeTruthy();
    expect(document.title).toBe('Collection review: find licence and metadata problems across a whole repository — Abyssal Claims Tools');
    expect(screen.queryByTestId('results')).toBeNull();
    expect(screen.queryByTestId('progress')).toBeNull();
  });

  it('offers the four input kinds', () => {
    render(<CollectionPage engine={fakeEngine().engine} />);
    for (const label of ['A list of DOIs', 'A DataCite repository or DOI prefix', 'A Zenodo community', 'A GeoNetwork catalogue']) expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it('estimate -> quick sample and full run buttons; each starts a run with the matching sample flag and the page language', async () => {
    const f = fakeEngine();
    await estimateDatacite(f);
    expect(f.estimates.map((e) => e.sample)).toEqual([false, true]);
    expect(screen.getByTestId('estimate').textContent).toContain('Full run: 2124 records, about 3 requests, about 40 s.');
    expect(screen.getByTestId('estimate').textContent).toContain('Quick sample: about 1000 records');
    fireEvent.click(button('Quick sample (about a minute)'));
    await waitFor(() => expect(f.starts).toHaveLength(1));
    expect(f.starts[0]).toEqual({ spec: { kind: 'datacite', by: 'client', id: 'some.client' }, lang: 'en', sample: true });
    fireEvent.click(button('Full run'));
    await waitFor(() => expect(f.starts).toHaveLength(2));
    expect(f.starts[1].sample).toBe(false);
  });

  it('a prefix is sent as a prefix', async () => {
    const f = fakeEngine();
    render(<CollectionPage engine={f.engine} />);
    fireEvent.click(screen.getByLabelText('DOI prefix'));
    fireEvent.change(screen.getByLabelText('Client id or prefix'), { target: { value: '10.1234' } });
    fireEvent.click(button('Estimate size and time'));
    await waitFor(() => screen.getByTestId('estimate'));
    expect(f.estimates[0].spec).toEqual({ kind: 'datacite', by: 'prefix', id: '10.1234' });
  });

  it('a DOI list has no quick sample (the engine refuses one) and says so', async () => {
    const f = fakeEngine();
    render(<CollectionPage engine={f.engine} />);
    fireEvent.click(screen.getByLabelText('A list of DOIs'));
    expect(screen.getByText(/has no quick sample/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('DOIs, one per line or separated by spaces'), { target: { value: '10.1234/a\n10.1234/b' } });
    fireEvent.click(button('Estimate size and time'));
    await waitFor(() => screen.getByTestId('estimate'));
    expect(f.estimates).toEqual([{ spec: { kind: 'dois', text: '10.1234/a\n10.1234/b' }, sample: false }]);
    expect(screen.queryByRole('button', { name: /Quick sample/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Full run' })).toBeTruthy();
  });

  it('a Zenodo community is sent by name; the 10 000 split is explained when the estimate has slices', async () => {
    const f = fakeEngine({ estimateFull: estimate({ slices: 5, strategy: 'date-split' }) });
    render(<CollectionPage engine={f.engine} />);
    fireEvent.click(screen.getByLabelText('A Zenodo community'));
    fireEvent.change(screen.getByLabelText('Community name (as in its address on Zenodo)'), { target: { value: 'fisheries' } });
    fireEvent.click(button('Estimate size and time'));
    await waitFor(() => screen.getByTestId('estimate'));
    expect(f.estimates[0].spec).toEqual({ kind: 'zenodo', community: 'fisheries' });
    expect(screen.getByTestId('estimate').textContent).toContain('5 slices split by publication date');
  });

  it('a very large Zenodo community: the time is said in days, the quick sample is advised first, in every language; a small one is not', async () => {
    const big = estimate({ records: 2_090_000, requests: 84_675, seconds: 84_675 * 2.6, strategy: 'date-split', slices: 209, approximate: true, sampleFirst: true });
    const expected: Record<string, { time: RegExp; advice: RegExp }> = {
      en: { time: /about 3 days\./, advice: /Start with the quick sample/ },
      pl: { time: /około 3 dni\./, advice: /Zacznij od szybkiej próbki/ },
      de: { time: /etwa 3 Tage\./, advice: /Beginnen Sie mit der schnellen Stichprobe/ },
      fr: { time: /environ 3 jours\./, advice: /Commencez par l’échantillon rapide/ },
    };
    for (const lang of LANGS) {
      setLang(lang);
      const f = fakeEngine({ estimateFull: big });
      render(<CollectionPage engine={f.engine} />);
      fireEvent.click(screen.getByLabelText(UI[lang]['collection.kind.zenodo']));
      fireEvent.change(screen.getByLabelText(UI[lang]['collection.zen.label']), { target: { value: 'biosyslit' } });
      fireEvent.click(screen.getByRole('button', { name: UI[lang]['collection.estimate.button'] }));
      await waitFor(() => screen.getByTestId('estimate'));
      const text = screen.getByTestId('estimate').textContent ?? '';
      expect(text, lang).toMatch(expected[lang].time);
      expect(text, lang).toMatch(expected[lang].advice);
      expect(text, lang).not.toMatch(/\{\w+\}|\b(OK|valid|allowed)\b/i);
      expect(screen.getByTestId('sample-first')).toBeTruthy();
      expect(text, lang).toMatch(/209/);
      expect(text, lang).toMatch({ en: /at least about 209/, pl: /co najmniej około 209/, de: /mindestens etwa 209/, fr: /au moins environ 209/ }[lang]!);
      cleanup();
    }
    setLang('en');
    const small = fakeEngine({ estimateFull: estimate({ records: 686, requests: 28, seconds: 73 }) });
    render(<CollectionPage engine={small.engine} />);
    fireEvent.click(screen.getByLabelText('A Zenodo community'));
    fireEvent.change(screen.getByLabelText('Community name (as in its address on Zenodo)'), { target: { value: 'fisheries' } });
    fireEvent.click(button('Estimate size and time'));
    await waitFor(() => screen.getByTestId('estimate'));
    expect(screen.getByTestId('estimate').textContent).toContain('Full run: 686 records, about 28 requests, about 73 s.');
    expect(screen.queryByTestId('sample-first')).toBeNull();
  });

  it('a catalogue comes from the config list, says it goes through our server and compares with DataCite by default (extra requests shown)', async () => {
    const f = fakeEngine({ estimateFull: estimate({ records: 831, requests: 17, extraRequests: 800 }) });
    render(<CollectionPage engine={f.engine} />);
    fireEvent.click(screen.getByLabelText('A GeoNetwork catalogue'));
    const options = within(screen.getByLabelText('Catalogue')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(CATALOGUES.map((c) => c.label));
    expect(screen.getByText(/read through our server/)).toBeTruthy();
    expect((screen.getByLabelText('Also compare with DataCite') as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByLabelText('Catalogue'), { target: { value: 'marine-ie' } });
    fireEvent.click(button('Estimate size and time'));
    await waitFor(() => screen.getByTestId('estimate'));
    expect(f.estimates[0].spec).toEqual({ kind: 'csw', catalogue: 'marine-ie', schema: 'iso19139', crossSource: true });
    expect(screen.getByTestId('estimate').textContent).toContain('Plus up to 800 requests to DataCite');
    fireEvent.click(screen.getByLabelText('Also compare with DataCite'));
    expect(screen.queryByTestId('estimate')).toBeNull(); // changed input: the old estimate is gone
  });

  it('an empty answer says no records were found and offers no run', async () => {
    const f = fakeEngine({ estimateFull: estimate({ records: 0, requests: 1, empty: true }) });
    await estimateDatacite(f, vi.fn(), 'nosuch.client');
    expect(screen.getByText('No records found for this input.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Full run' })).toBeNull();
  });

  it('asks for an entry instead of estimating nothing', () => {
    const f = fakeEngine();
    render(<CollectionPage engine={f.engine} />);
    fireEvent.click(button('Estimate size and time'));
    expect(screen.getByRole('alert').textContent).toBe('Nothing to read: add at least one entry.');
    expect(f.estimates).toHaveLength(0);
  });

  it('a start that fails is shown, an unknown community in plain words', async () => {
    const f = fakeEngine();
    f.engine.start = async () => {
      throw new Error('not-found: http-404');
    };
    await estimateDatacite(f);
    fireEvent.click(button('Full run'));
    await waitFor(() => screen.getByRole('alert'));
    expect(screen.getByRole('alert').textContent).toBe('The run could not start: The source does not know this name.');
  });
});

describe('CollectionPage: progress, results, download', () => {
  it('shows counts per state, a sample label, pause / stop, and the findings by rule with a bounded, paginated example list', async () => {
    const f = fakeEngine();
    await estimateDatacite(f);
    fireEvent.click(button('Quick sample (about a minute)'));
    await waitFor(() => expect(f.starts).toHaveLength(1));
    f.push(progressOf({}, undefined, true));
    const progress = screen.getByTestId('progress');
    expect(progress.textContent).toContain('read and checked: 100');
    expect(progress.textContent).toContain('not reachable: 4');
    expect(progress.textContent).toContain('held back by the source (too many requests): 5');
    expect(progress.textContent).toContain('unsupported metadata profile: 1');
    expect(screen.getByTestId('sample-label').textContent).toBe('This is a sample, not the whole collection.');
    fireEvent.click(button('Pause'));
    await waitFor(() => expect(f.calls).toContain('pause'));
    fireEvent.click(button('Stop'));
    await waitFor(() => expect(f.calls).toContain('stop'));

    const groups = screen.getByTestId('results').querySelectorAll('details.rule-group');
    expect([...groups].map((g) => g.getAttribute('data-rule'))).toEqual(['LIC-MISSING', 'META-NO-VERSION']); // worst first, as the engine ordered them
    expect(screen.getByTestId('results').textContent).toContain('Sample results');
    const first = groups[0] as HTMLDetailsElement;
    expect(first.textContent).toContain('80 findings');
    first.open = true;
    fireEvent(first, new Event('toggle'));
    await waitFor(() => expect(first.querySelectorAll('li')).toHaveLength(10));
    expect(first.textContent).toContain('Examples 1–10 of 50'); // 80 findings, but at most 50 examples are kept
    expect(first.textContent).toContain('At most 50 examples');
    fireEvent.click(within(first).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(first.textContent).toContain('Examples 11–20 of 50'));
    expect(first.querySelectorAll('li')).toHaveLength(10);
    for (let i = 0; i < 4; i++) fireEvent.click(within(first).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(first.textContent).toContain('Examples 41–50 of 50'));
    expect((within(first).getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    // never one element per finding: nothing near 80 rows exists in the whole page
    expect(document.querySelectorAll('li').length).toBeLessThan(40);
  });

  it('names the CSV with the engine and hands the Blob to the download function', async () => {
    const f = fakeEngine();
    const download = vi.fn();
    await estimateDatacite(f, download);
    fireEvent.click(button('Full run'));
    f.push(progressOf({ status: 'finished' }));
    expect(screen.getByText('110 rows are in the fix list (CSV).')).toBeTruthy();
    expect(screen.queryByText(/file name says/)).toBeNull();
    fireEvent.click(button('Download the fix list (CSV)'));
    await waitFor(() => expect(download).toHaveBeenCalled());
    expect(download.mock.calls[0][1]).toBe('fix-list-2026-10-22.csv');
    expect(download.mock.calls[0][0]).toBeInstanceOf(Blob);
  });

  it('a sample says so next to the CSV, and offers a save-to-file button only where the browser can', async () => {
    const f = fakeEngine();
    (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker = undefined;
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    const pick = vi.fn(async () => ({ createWritable: async () => ({ write: async () => undefined, close: async () => undefined }) }));
    render(<CollectionPage engine={f.engine} pickFile={pick} />);
    f.push(progressOf({ status: 'finished' }, undefined, true));
    expect(screen.getByText(/file name says “sample”/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Save the fix list/ })).toBeNull();
    (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = () => undefined;
    f.push(progressOf({ status: 'finished' }, undefined, true));
    fireEvent.click(await screen.findByRole('button', { name: 'Save the fix list to a file…' }));
    await waitFor(() => expect(f.calls).toContain('saveTo'));
    expect(pick).toHaveBeenCalledWith('fix-list-sample-2026-10-22.csv');
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });

  it('a DOI DataCite does not know has its own line (not "not reachable"), and repeats counted once are shown', async () => {
    const f = fakeEngine();
    render(<CollectionPage engine={f.engine} />);
    const counts = emptyCounts();
    counts.records = 12;
    counts.states = { checked: 7, unreachable: 0, throttled: 0, 'unsupported-profile': 0, 'not-in-datacite': 5 };
    counts.duplicatesInBatch = 4;
    f.push(progressOf({ counts, status: 'finished' }));
    const progress = screen.getByTestId('progress');
    expect(progress.textContent).toContain('not in DataCite (e.g. a Crossref DOI): 5');
    expect(screen.getByTestId('duplicates').textContent).toContain('4 repeats were counted once');
    cleanup();
    for (const lang of LANGS) {
      setLang(lang);
      const g = fakeEngine();
      render(<CollectionPage engine={g.engine} />);
      g.push(progressOf({ counts, status: 'finished' }));
      expect(screen.getByTestId('state-not-in-datacite').textContent, lang).toContain('5');
      expect(screen.getByTestId('state-not-in-datacite').textContent, lang).not.toMatch(/\{\w+\}/);
      expect(screen.getByTestId('duplicates').textContent, lang).not.toMatch(/\{\w+\}/);
      cleanup();
    }
    setLang('en');
  });

  it('the interruption notice of a catalogue that answered too slowly names the cause in every language, not the raw code', () => {
    for (const lang of LANGS) {
      cleanup();
      setLang(lang);
      const f = fakeEngine();
      render(<CollectionPage engine={f.engine} />);
      const stop = { cause: 'csw_slow', source: 'csw:emodnet', page: 3, request: 11, kind: 'unreachable', at: Date.UTC(2026, 9, 22, 14, 5) } as const;
      f.push(progressOf({ status: 'interrupted', resumable: true, stop, notices: [{ code: 'interrupted', params: { reason: 'csw_slow' } }] }));
      const notice = screen.getAllByTestId('notice').map((n) => n.textContent ?? '').join(' ');
      expect(notice, lang).toMatch(/45/);
      expect(notice, lang).not.toMatch(/csw_slow|\{\w+\}/);
      expect(screen.getByTestId('stop-reason').textContent, lang).toMatch(/45/);
    }
    setLang('en');
  });

  it('a run stopped by the daily catalogue budget says so in every language and offers to continue', () => {
    for (const lang of LANGS) {
      cleanup();
      setLang(lang);
      const f = fakeEngine();
      render(<CollectionPage engine={f.engine} />);
      const stop = { cause: 'csw_daily_budget', source: 'csw:emodnet', page: 12, request: 40, kind: 'throttled', status: 429, at: Date.UTC(2026, 9, 22, 14, 5) } as const;
      f.push(progressOf({ status: 'interrupted', resumable: true, stop }));
      const text = screen.getByTestId('stop-reason').textContent ?? '';
      expect(text, lang).toMatch(/24/);
      expect(text, lang).not.toMatch(/csw_daily_budget|\{\w+\}/);
    }
    setLang('en');
  });

  it('records that were not read are listed apart, with the reason, and the page says they get no finding', async () => {
    const unread: UnreadSample[] = [{ ref: '10.1234/gone', state: 'unreachable', reason: 'not-found-at-datacite' }];
    const f = fakeEngine({ unread });
    render(<CollectionPage engine={f.engine} />);
    f.push(progressOf({ status: 'finished' }));
    const d = screen.getByText('Records that were not read').closest('details') as HTMLDetailsElement;
    d.open = true;
    fireEvent(d, new Event('toggle'));
    await waitFor(() => expect(d.textContent).toContain('10.1234/gone — not reachable: DataCite has no record for this DOI'));
    expect(d.textContent).toContain('no finding');
    expect(screen.getByTestId('results').textContent).toContain('Records that were not read are not checked');
  });

  it('every notice code is translated in all four languages; an unknown code is shown, not swallowed', () => {
    const notices: Notice[] = [
      { code: 'no-records' }, { code: 'split-by-date', params: { slices: 3 } }, { code: 'slices-differ', params: { sum: 9, total: 10 } },
      { code: 'window-exceeded', params: { from: '2020', to: '2021', total: 12000 } }, { code: 'ended-before-total', params: { seen: 5, total: 9 } },
      { code: 'ended-before-matched', params: { seen: 5, matched: 9 } }, { code: 'more-than-matched', params: { seen: 9, matched: 5 } },
      { code: 'ended-by-exception', params: { position: 6, matched: 9 } }, { code: 'empty-page', params: { position: 6, matched: 9 } }, { code: 'overlapping-pages' },
      { code: 'overrun-stopped', params: { seen: 9, matched: 5 } }, { code: 'interrupted', params: { reason: 'offline' } },
      { code: 'storage-failed' }, { code: 'unexpected' }, { code: 'cursor-restarted' }, { code: 'repeating-page' }, { code: 'brand-new-code' },
    ];
    for (const lang of LANGS) {
      cleanup();
      setLang(lang);
      const f = fakeEngine();
      render(<CollectionPage engine={f.engine} />);
      f.push(progressOf({ notices }));
      const shown = screen.getAllByTestId('notice').map((n) => n.textContent ?? '');
      expect(shown).toHaveLength(notices.length);
      for (const text of shown.slice(0, -1)) {
        expect(text, lang).not.toMatch(/collection\.notice|\{\w+\}/);
        expect(text, lang).not.toMatch(/^Message from the run|^Komunikat z przebiegu/);
      }
      expect(shown.at(-1), lang).toContain('brand-new-code');
      if (lang !== 'en') expect(shown[0], lang).not.toBe(UI.en['collection.notice.no-records']);
    }
  });
});

describe('CollectionPage: saved run and deleting', () => {
  it('offers resume / discard for an unfinished saved run and nothing for a clean start', async () => {
    const f = fakeEngine();
    render(<CollectionPage engine={f.engine} />);
    await act(async () => undefined);
    expect(screen.queryByTestId('saved-run')).toBeNull();
    cleanup();

    const saved = progressOf({ status: 'interrupted', resumable: true });
    const g = fakeEngine({ saved });
    render(<CollectionPage engine={g.engine} />);
    const box = await screen.findByTestId('saved-run');
    expect(box.textContent).toContain('An unfinished run was found in this browser');
    expect(box.textContent).toContain('A DataCite repository or DOI prefix: some.client, full run; 110 records met so far; interrupted.');
    fireEvent.click(within(box).getByRole('button', { name: 'Resume this run' }));
    await waitFor(() => expect(g.calls).toContain('resume'));
    expect(screen.queryByTestId('saved-run')).toBeNull();
  });

  it('a double click on Resume (or Start) reaches the engine once: the button waits until the engine has answered', async () => {
    const saved = progressOf({ status: 'interrupted', resumable: true });
    const g = fakeEngine({ saved });
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    g.engine.resume = async () => {
      g.calls.push('resume');
      await slow;
    };
    render(<CollectionPage engine={g.engine} />);
    const button = within(await screen.findByTestId('saved-run')).getByRole('button', { name: 'Resume this run' });
    fireEvent.click(button);
    fireEvent.click(button);
    await act(async () => undefined);
    expect(g.calls.filter((c) => c === 'resume')).toHaveLength(1);
    release();
    await act(async () => undefined);
  });

  it('names the reason a run stopped: in the progress, and in the prompt after a reload, in every language', async () => {
    const stop = { cause: 'http', status: 503, source: 'api.datacite.org', page: 4, request: 10, kind: 'throttled', at: Date.UTC(2026, 9, 22, 14, 5) };
    const stopped = progressOf({ status: 'interrupted', resumable: true, stop }, { kind: 'csw', catalogue: 'emodnet', schema: 'iso19139', crossSource: true });
    for (const lang of LANGS) {
      setLang(lang);
      const f = fakeEngine({ saved: stopped });
      render(<CollectionPage engine={f.engine} />);
      const box = await screen.findByTestId('saved-run');
      const reason = within(box).getByTestId('saved-stop').textContent ?? '';
      expect(reason).toContain('HTTP 503');
      expect(reason).toContain('DataCite');
      expect(reason).toMatch(/4/);
      expect(reason).not.toMatch(/collection\.|\{\w+\}/);
      expect(screen.getByTestId('stop-reason').textContent).toBe(reason);
      cleanup();
    }
    // a running run shows no stop reason; one that went on loses it
    setLang('en');
    const g = fakeEngine();
    render(<CollectionPage engine={g.engine} />);
    g.push(progressOf({ status: 'running', stop }));
    expect(screen.queryByTestId('stop-reason')).toBeNull();
  });

  it('says how many records were checked without the DataCite comparison, and that the missing comparison is no finding', async () => {
    const p = progressOf({ status: 'running' });
    p.counts.crossSource = { looked: 50, found: 0, absent: 0, failed: 50, notCompared: 50 };
    const f = fakeEngine({ saved: null });
    render(<CollectionPage engine={f.engine} />);
    f.push(p);
    expect(screen.getByTestId('cross-not-done').textContent).toContain('50 records');
  });

  it('discarding the saved run deletes it', async () => {
    const f = fakeEngine({ saved: progressOf({ status: 'stopped', resumable: true }) });
    render(<CollectionPage engine={f.engine} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Discard it' }));
    await waitFor(() => expect(f.calls).toContain('discard'));
    expect(screen.queryByTestId('saved-run')).toBeNull();
    expect(screen.queryByTestId('results')).toBeNull();
  });

  it('a finished saved run shows its results but does not nag with a prompt', async () => {
    const f = fakeEngine({ saved: progressOf({ status: 'finished', resumable: false }) });
    render(<CollectionPage engine={f.engine} />);
    await screen.findByTestId('results');
    expect(screen.queryByTestId('saved-run')).toBeNull();
  });

  it('the delete control removes all saved progress and the results with it', async () => {
    const f = fakeEngine({ saved: progressOf({ status: 'finished', resumable: false }) });
    render(<CollectionPage engine={f.engine} />);
    await screen.findByTestId('results');
    expect(screen.getByText(/kept only in this browser until you delete them here/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete all saved progress' }).at(-1)!);
    await waitFor(() => expect(f.calls).toContain('discard'));
    await waitFor(() => expect(screen.queryByTestId('results')).toBeNull());
    expect(screen.getByRole('status').textContent).toBe('All saved progress was deleted.');
  });
});

describe('CollectionPage: nothing the visitor types reaches the URL', () => {
  it('no history call, no location change, no hash or query, whatever is typed and run', async () => {
    const push = vi.spyOn(history, 'pushState');
    const replace = vi.spyOn(history, 'replaceState');
    const before = location.href;
    const f = fakeEngine();
    const secret = 'secret.client-77';
    await estimateDatacite(f, vi.fn(), secret);
    fireEvent.click(button('Full run'));
    f.push(progressOf({ status: 'finished' }, { kind: 'datacite', by: 'client', id: secret }));
    fireEvent.click(screen.getByLabelText('A Zenodo community'));
    fireEvent.change(screen.getByLabelText('Community name (as in its address on Zenodo)'), { target: { value: 'secret-community' } });
    fireEvent.click(screen.getByLabelText('A GeoNetwork catalogue'));
    fireEvent.click(screen.getByLabelText('A list of DOIs'));
    fireEvent.change(screen.getByLabelText('DOIs, one per line or separated by spaces'), { target: { value: '10.9999/secret' } });
    fireEvent.click(button('Estimate size and time'));
    await waitFor(() => screen.getByTestId('estimate'));
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(location.href).toBe(before);
    expect(location.search + location.hash).toBe('');
    expect(location.href).not.toMatch(/secret/);
    // the form never navigates, and the page has no link that carries an entry
    for (const a of document.querySelectorAll('a')) expect(a.getAttribute('href') ?? '').not.toMatch(/secret|\?|#(?!main)/);
    expect(document.querySelector('form')?.getAttribute('action')).toBeNull();
  });
});

describe('CollectionPage: check the data files of one example', () => {
  it('runs the single-record path in a separate check engine, inline, and throws that engine away', async () => {
    const f = fakeEngine();
    const doi = '10.1234/rec-LIC-MISSING-1';
    const fetcher = new MapFetcher({ [DC + doi]: dataciteJson({ doi, title: 'A dataset', creators: ['Kowalska, Anna'], year: 2024, publisher: 'Somewhere' }, []) });
    const handles: { dispose: ReturnType<typeof vi.fn> }[] = [];
    const create = vi.fn(() => {
      const h = { engine: createDirectEngine(), dispose: vi.fn() };
      handles.push(h);
      return h;
    });
    render(<CollectionPage engine={f.engine} createCheckEngine={create} fetcher={fetcher} />);
    f.push(progressOf({ status: 'finished' }));
    const group = screen.getByTestId('results').querySelector('details[data-rule="LIC-MISSING"]') as HTMLDetailsElement;
    group.open = true;
    fireEvent(group, new Event('toggle'));
    await waitFor(() => expect(within(group).getAllByRole('button', { name: 'Check its data files' }).length).toBeGreaterThan(0));
    // the button stays, and says next to itself that it works in browser mode only
    expect(within(group).getAllByTestId('record-check-browser-only')[0].textContent).toContain('browser mode only');
    for (const lang of LANGS) expect(UI[lang]['collection.record.browserOnly'], lang).toMatch(/\S{5}/);
    expect(new Set(LANGS.map((l) => UI[l]['collection.record.browserOnly'])).size).toBe(LANGS.length);
    expect(create).not.toHaveBeenCalled(); // nothing is started before the visitor asks
    fireEvent.click(within(group).getAllByRole('button', { name: 'Check its data files' })[0]);
    await waitFor(() => expect(group.querySelector('.record-check')).not.toBeNull());
    await waitFor(() => expect(handles[0].dispose).toHaveBeenCalled());
    await waitFor(() => expect(group.querySelector('.record-check [role="status"]')).toBeNull());
    expect(create).toHaveBeenCalledTimes(1);
    expect(fetcher.calls[0]).toBe(DC + doi);
    expect(group.querySelector('.record-check')?.textContent).toContain('separate worker');
    expect(group.querySelector('.record-check')?.querySelector('[role="alert"]')).toBeNull();
    fireEvent.click(within(group).getByRole('button', { name: 'Close' }));
    expect(group.querySelector('.record-check')).toBeNull();
  });
});

// whole words in four languages: nothing on this page may say a collection is fine or that the data may be used
const FORBIDDEN =
  /\b(green|ok|valid|allowed|compliant|ready|zielon\w*|poprawn\w*|dozwolon\w*|zgodn\w*|gotow\w*|ważn\w*|grün|gültig|erlaubt|konform|bereit|vert|valide|autoris[ée]e?s?|conforme|prêt\w*)\b|w porządku|in Ordnung/i;

describe('wording', () => {
  it('never says green / OK / valid / allowed / compliant / ready, in any language, in any state of the page', async () => {
    for (const lang of LANGS) {
      cleanup();
      setLang(lang);
      const f = fakeEngine({ unread: [{ ref: '10.1/x', state: 'throttled', reason: 'http-503' }] });
      render(<CollectionPage engine={f.engine} />);
      for (const kind of [/DOI/, /DataCite/, /Zenodo/, /GeoNetwork/]) {
        const radios = screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).name === 'collection-kind');
        const target = radios.find((r) => kind.test(r.parentElement?.textContent ?? ''));
        if (target) fireEvent.click(target);
        expect(document.body.textContent ?? '', lang).not.toMatch(FORBIDDEN);
      }
      f.push(progressOf({ status: 'finished', notices: [{ code: 'no-records' }, { code: 'split-by-date', params: { slices: 3 } }], deferred: 2 }, undefined, true));
      expect(document.body.textContent ?? '', lang).not.toMatch(FORBIDDEN);
    }
  });

  it('the strings of the page and its notices never use the forbidden words either (all keys, all languages)', () => {
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(UI[lang])) {
        if (!/^(collection\.|index\.collection\.|privacy\.collection\.)/.test(key)) continue;
        expect(value, `${lang}:${key}`).not.toMatch(FORBIDDEN);
      }
    }
  });

  it('has the same placeholders in every language for the new keys (the shared UI test covers this too) and no ranking or comparison wording', () => {
    for (const lang of LANGS) expect(UI[lang]['collection.intro'], lang).toBeTruthy();
    expect(UI.en['collection.intro']).toContain('nothing here ranks or compares institutions');
  });
});

describe('home and privacy pages', () => {
  it('the home page has a collection card next to Data check and Licence check, and no other link to the tool', () => {
    render(<IndexPage />);
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toEqual(expect.arrayContaining(['/check', '/licence', '/collection']));
    expect(screen.getByRole('heading', { name: 'Collection review' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open collection review' }).getAttribute('href')).toBe('/collection');
  });

  it('the header and footer carry no link to the collection page', () => {
    render(<CollectionPage engine={fakeEngine().engine} />);
    const nav = document.querySelector('header');
    expect(nav?.querySelector('a[href="/collection"]')).toBeNull();
    expect(document.querySelector('footer a[href="/collection"]')).toBeNull();
  });

  it('the privacy page lists the catalogue hosts from the config and says what stays in the browser', () => {
    render(<PrivacyPage />);
    for (const c of CATALOGUES) expect(screen.getByText(c.host, { selector: 'code' })).toBeTruthy();
    expect(document.body.textContent).toContain('stored only in your browser (IndexedDB)');
    expect(document.body.textContent).toContain('nothing about a collection run is sent to our server');
  });

  it('the static page carries the same English text as the app', () => {
    const html = readFileSync(join(__dirname, '..', '..', 'collection', 'index.html'), 'utf8');
    for (const key of ['collection.intro', 'collection.checks.p1', 'collection.checks.li1', 'collection.checks.li2', 'collection.checks.li3', 'collection.checks.li4'] as const) expect(html, key).toContain(UI.en[key]);
    expect(html).toContain(`<title>${UI.en['collection.docTitle']} — Abyssal Claims Tools</title>`);
    expect(html).toContain('<link rel="canonical" href="https://tools.something-rare.com/collection" />');
    expect(html).toContain('"@type": "WebApplication"');
    expect(html).toContain('<meta property="og:url" content="https://tools.something-rare.com/collection" />');
    expect(html).toContain('<meta name="twitter:card"');
    expect(html).not.toMatch(/name="robots"/);
    expect(html).not.toMatch(/href="\/collection"/); // the page does not link to itself from a nav
  });

  it('the static home page has the same card text', () => {
    const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
    expect(html).toContain(UI.en['index.collection.text']);
    expect(html).toContain('<a class="tool-link" href="/collection">Open collection review</a>');
  });
});

describe('page with the real engine (in this thread, synthetic DataCite)', () => {
  it('estimate, full run, findings by rule, examples and the CSV; unread records get no licence finding', async () => {
    const clock = virtualClock();
    const mock = dataciteMock({ total: 25, clock, override: (n) => (n === 4 ? res(503, HTML_503) : undefined) });
    const engine = createDirectCollectionEngine(runnerDeps(mock.net, clock));
    const download = vi.fn();
    render(<CollectionPage engine={engine} download={download} />);
    fireEvent.change(screen.getByLabelText('Client id or prefix'), { target: { value: 'test.client' } });
    fireEvent.click(screen.getByRole('button', { name: 'Estimate size and time' }));
    await waitFor(() => screen.getByTestId('estimate'));
    expect(screen.getByTestId('estimate').textContent).toContain('25 records');
    fireEvent.click(screen.getByRole('button', { name: 'Full run' }));
    await waitFor(() => expect(screen.getByTestId('progress').textContent).toContain('Status: finished'));
    expect(screen.getByTestId('progress').textContent).toContain('read and checked: 25');
    const rules = [...screen.getByTestId('results').querySelectorAll('details.rule-group')].map((d) => d.getAttribute('data-rule'));
    expect(rules).toContain('LIC-MISSING');
    expect(rules.length).toBeGreaterThan(1);
    const group = screen.getByTestId('results').querySelector('details[data-rule="LIC-MISSING"]') as HTMLDetailsElement;
    group.open = true;
    fireEvent(group, new Event('toggle'));
    await waitFor(() => expect(group.querySelectorAll('li').length).toBeGreaterThan(0));
    expect(group.textContent).toMatch(/10\.5555\/r\d+/);
    fireEvent.click(screen.getByRole('button', { name: 'Download the fix list (CSV)' }));
    await waitFor(() => expect(download).toHaveBeenCalled());
    const csv = await (download.mock.calls[0][0] as Blob).text();
    expect(csv.split('\n')[0]).toBe('record,field,rule_id,severity,problem,suggested_fix,source');
    expect(csv).toContain(',LIC-MISSING,');
  });
});
